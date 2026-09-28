// ── 슬래시 커맨드 정의 + 핸들러 ────────────────
//    📌 응답 모양 · 문구는 관리자 화면(봇 메시지)의 템플릿 — buildMessage(키, 변수). 관리자가 끈 키(null)면 짧은 기본 글로 답한다.
import {
  Events, REST, Routes, SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import { UserXp } from "./db.js";
import { getCumulativeXpByLevel, getLevelByXp } from "./leveling.js";
import { config } from "./config.js";
import { getSettings } from "./botSettings.js";
import { claimAttendance } from "./attend.js";
import { buildMessage, commonVars, progressBar, tierOf, SITE_URL } from "./botMessages.js";
import { questView } from "./views/quests.js";
import { inventoryView } from "./views/inventory.js";
import { passView } from "./views/pass.js";

const MAX_LEVEL = 1000; // leveling.js getLevelByXp 의 끝

const definitions = [
  new SlashCommandBuilder().setName("레벨").setDescription("다음 레벨까지 필요한 XP를 확인합니다."),
  new SlashCommandBuilder().setName("랭크").setDescription("내 XP, 레벨, 서버 내 순위를 확인합니다."),
  new SlashCommandBuilder().setName("출석체크").setDescription("오늘 출석을 체크합니다. 하루 한 번 받을 수 있습니다."),
  new SlashCommandBuilder().setName("퀘스트").setDescription("일일 · 주간 · 월간 퀘스트 진행도를 확인합니다."),
  new SlashCommandBuilder().setName("인벤토리").setDescription("보유한 아이템을 확인합니다."),
  new SlashCommandBuilder().setName("시즌패스").setDescription("시즌 패스 티어와 받을 보상을 확인합니다."),
].map((c) => c.toJSON());

// 길드 전용 등록 — 즉시 반영
export async function registerCommandDefinitions(client) {
  const rest = new REST().setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: definitions });
}

// ── 공용 ──────────────────────────────────

// 📌 레벨 비공개(BotSetting.levelPublic false · 아직 못 읽음) — 출석 · 퀘스트 · 인벤토리 · 시즌 패스는 막는다
const levelOpen = () => getSettings().levelPublic === true;

// 사이트로 가는 링크 버튼 한 줄 (경로는 app/level/page.js 의 탭 id · 쿼리)
const linkRow = (label, path) =>
  new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(`${SITE_URL}${path}`));

// 템플릿 메시지 — 관리자가 끈 키(null)면 짧은 기본 글
const msg = (key, vars, fallback) => buildMessage(key, vars) || { content: fallback, allowedMentions: { parse: [] } };

// 📌 응답 도우미 — 3초 안에 첫 응답이 없으면 디스코드가 명령을 실패로 끝낸다.
//    1.5초 안에 끝나면 그냥 reply, 늦어지면 먼저 공개로 defer 해 두고 결과를 editReply 로 채운다.
//    (3초는 디스코드가 명령을 만든 때부터라 전달 지연 · defer 왕복을 뺀 여유를 남긴다)
//    나만 보기 답인데 이미 공개로 defer 했으면 대기 글을 지우고 followUp(나만 보기)으로 보낸다.
function responder(interaction, waitMs = 1500) {
  let deferring = null;
  let timer = setTimeout(() => {
    timer = null;
    deferring = interaction.deferReply().catch((e) => console.error(`커맨드 defer 오류 (/${interaction.commandName}):`, e.message));
  }, waitMs);
  const settle = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (deferring) await deferring;
  };
  return {
    settle,
    async send(payload, { ephemeral = false } = {}) {
      await settle();
      if (interaction.deferred) {
        if (!ephemeral) return interaction.editReply(payload);
        await interaction.deleteReply().catch(() => {});
        return interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
      }
      return interaction.reply(ephemeral ? { ...payload, flags: MessageFlags.Ephemeral } : payload);
    },
  };
}

const sendClosed = (interaction, r) =>
  r.send(msg("levelClosed", commonVars(interaction.member, interaction.guild), "준비 중입니다."), { ephemeral: true });

// ── 핸들러 ────────────────────────────────

// 📌 출석 — 받는 길이 둘이다: 이 /출석체크 명령어, 그리고 음성 채널 누적 N분 자동 출석(features/voiceXp.js).
//    둘 다 attend.js 의 claimAttendance(같은 자물쇠 lastAttendDate)를 쓰므로 합쳐서 하루(KST) 한 번만 지급된다.
async function handleAttend(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const member = interaction.member;
  const base = commonVars(member, interaction.guild);
  const res = await claimAttendance(member, { source: "command" });

  if (res?.closed) return sendClosed(interaction, r);
  if (res?.already) {
    return r.send(
      msg("cmdAttendAlready", { ...base, streak: res.streak }, `오늘은 이미 출석했습니다. 연속 ${res.streak}일`),
      { ephemeral: true }
    );
  }

  // 연속 보너스 한 줄 — 없으면 빈 글(템플릿에서 그 줄이 빠진다)
  const b = res.streakBonus;
  const bonusParts = b ? [b.xp > 0 ? `+${b.xp.toLocaleString("ko-KR")} XP` : "", b.point > 0 ? `빙옥 +${b.point.toLocaleString("ko-KR")}` : ""].filter(Boolean) : [];
  const streakBonus = bonusParts.length ? `연속 ${b.days}일 보너스 ${bonusParts.join(" · ")}` : "";

  const payload = msg(
    "cmdAttend",
    { ...base, amount: res.amount, attendCount: res.attendCount, streak: res.streak, bestStreak: res.bestStreak, streakBonus },
    `출석 완료 · +${(res.amount || 0).toLocaleString("ko-KR")} XP · 연속 ${res.streak}일${streakBonus ? ` · ${streakBonus}` : ""}`
  );
  return r.send({ ...payload, components: [linkRow("대시보드", "/level?tab=my")] });
}

async function handleLevel(interaction, r) {
  const doc = await UserXp.findOne({ userId: interaction.user.id }, { xp: 1 }).lean();
  const xp = doc?.xp || 0;
  // 저장된 level 은 새 문서 · 초기화 직후 0 일 수 있다 — xp 로 계산한다 (0 XP = Lv.1, 사이트와 같은 기준)
  const level = getLevelByXp(xp);
  const top = level >= MAX_LEVEL;
  const cur = getCumulativeXpByLevel(level);
  const next = getCumulativeXpByLevel(level + 1);
  const need = top ? 0 : Math.max(0, next - xp);
  const nextLevel = top ? MAX_LEVEL : level + 1;

  const payload = msg(
    "cmdLevel",
    {
      ...commonVars(interaction.member, interaction.guild),
      level,
      xp,
      need,
      nextLevel,
      progressBar: progressBar(top ? 1 : (xp - cur) / Math.max(1, next - cur)),
      tier: tierOf(level).name,
    },
    `Lv.${level} · 누적 ${xp.toLocaleString("ko-KR")} XP · Lv.${nextLevel}까지 ${need.toLocaleString("ko-KR")} XP`
  );
  return r.send({ ...payload, components: [linkRow("대시보드", "/level?tab=my")] });
}

async function handleRank(interaction, r) {
  const doc = await UserXp.findOne({ userId: interaction.user.id }, { xp: 1 }).lean();
  const xp = doc?.xp || 0;
  const [above, total] = await Promise.all([
    UserXp.countDocuments({ xp: { $gt: xp } }),
    UserXp.countDocuments(),
  ]);
  const level = getLevelByXp(xp);
  const rank = above + 1;

  const payload = msg(
    "cmdRank",
    { ...commonVars(interaction.member, interaction.guild), rank, total, level, xp, tier: tierOf(level).name },
    `#${rank} / ${total.toLocaleString("ko-KR")} · Lv.${level} · 누적 ${xp.toLocaleString("ko-KR")} XP`
  );
  return r.send({ ...payload, components: [linkRow("랭킹", "/level?tab=rank")] });
}

async function handleQuest(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await questView(interaction.user.id);
  const payload = msg(
    "cmdQuest",
    { ...commonVars(interaction.member, interaction.guild), ...v },
    `받을 보상 ${v.claimable}개`
  );
  return r.send({ ...payload, components: [linkRow("퀘스트", "/level?tab=my")] });
}

async function handleInventory(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await inventoryView(interaction.member);
  const payload = msg(
    "cmdInventory",
    { ...commonVars(interaction.member, interaction.guild), ...v },
    `보유 아이템 ${v.itemCount}개`
  );
  // 📌 인벤토리는 레벨 대시보드 위 팝업 — ?bag=1 이면 바로 열린다 (ARCTIC 은 비공개일 수 있어 레벨 쪽으로 보낸다)
  return r.send({ ...payload, components: [linkRow("인벤토리", "/level?tab=my&bag=1")] });
}

async function handlePass(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await passView(interaction.user.id);
  if (!v.enabled) return r.send({ content: "시즌 패스 준비 중입니다.", allowedMentions: { parse: [] } }, { ephemeral: true });
  const payload = msg(
    "cmdPass",
    {
      ...commonVars(interaction.member, interaction.guild),
      season: v.season,
      seasonName: v.seasonName,
      passTier: v.passTier,
      passMax: v.passMax,
      passProgressBar: v.passProgressBar,
      nextReward: v.nextReward,
      claimable: v.claimable,
      premium: v.premium,
    },
    `시즌 패스 T${v.passTier} / T${v.passMax} · 받을 보상 ${v.claimable}개`
  );
  // 📌 옛 주소 ?tab=pass 는 대시보드로 가면서 시즌 패스 창을 연다 (app/level/page.js)
  return r.send({ ...payload, components: [linkRow("시즌 패스", "/level?tab=pass")] });
}

const handlers = {
  레벨: handleLevel,
  랭크: handleRank,
  출석체크: handleAttend,
  퀘스트: handleQuest,
  인벤토리: handleInventory,
  시즌패스: handlePass,
};

export function registerCommandHandlers(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    const r = responder(interaction);
    try {
      await handler(interaction, r);
    } catch (e) {
      console.error(`커맨드 오류 (/${interaction.commandName}):`, e.message);
      await r.settle();
      const content = "⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
      if (interaction.deferred && !interaction.replied) {
        interaction.editReply({ content, embeds: [], components: [] }).catch(() => {});
      } else if (!interaction.replied) {
        interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    } finally {
      r.settle().catch(() => {});
    }
  });
}
