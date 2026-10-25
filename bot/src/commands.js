// ── 슬래시 커맨드 정의 + 핸들러 ────────────────
//    📌 응답 모양 · 문구는 관리자 화면(봇 메시지)의 템플릿 — buildMessage(키, 변수). 관리자가 끈 키(null)면 짧은 기본 글로 답한다.
//       /레벨 · /랭크 · /출석체크 · /퀘스트 · /인벤토리 · /시즌패스는 이미지 카드를 붙인다(buildMessageWithCard — 카드를 끄거나 못 그리면 글만.
//       /퀘스트 · /인벤토리 · /시즌패스는 못 그리면 카드 전의 글 응답 그대로 — botMessages.js plainFallback).
import {
  Events, REST, Routes, SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from "discord.js";
import mongoose from "mongoose";
import { UserXp, XpLog, Payout, Purchase, WalletLog } from "./db.js";
import { getCumulativeXpByLevel, getLevelByXp, currentSeason, seasonStartMs } from "./leveling.js";
import { RANK_PERIODS, rankPeriodOf, rankMonthStart, rankTotalSince, monthBoard, totalBoard, voiceTimeText, rankTotalOf } from "./rankBoards.js";
import { serverHumanCount } from "./serverMembers.js";
import { config } from "./config.js";
import { getSettings } from "./botSettings.js";
import { claimAttendance, streakBonusText } from "./attend.js";
import { xpStopText } from "./xpStop.js";
import { buildMessage, buildMessageWithCard, cardAvatar, commonVars, progressBar, tierOf, SITE_URL } from "./botMessages.js";
import { questView, questCardData } from "./views/quests.js";
import { inventoryView, inventoryCardData } from "./views/inventory.js";
import { passView, passCardData } from "./views/pass.js";
import { perksOf, pickAvatarFrame, withSeasonFrame } from "./itemEffects.js";

const MAX_LEVEL = 1000; // leveling.js getLevelByXp 의 끝

const definitions = [
  new SlashCommandBuilder().setName("레벨").setDescription("다음 레벨까지 필요한 XP를 확인합니다."),
  // 📌 2026-10-18 「기준」 — 현재 · 누적 · 이번 달 · 음성 시간(사이트 랭킹 탭과 같은 값 — rankBoards.js). 비우면 현재
  new SlashCommandBuilder()
    .setName("랭크")
    .setDescription("서버 순위표(1~10위)와 내 순위를 확인합니다.")
    .addStringOption((o) =>
      o.setName("기준").setDescription("순위 기준 — 비우면 현재 XP").setRequired(false)
        .addChoices(...RANK_PERIODS.map((p) => ({ name: p.l, value: p.v })))
    ),
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
// 카드 붙인 템플릿 메시지 — 카드가 켜진 키면 이미지 카드를 붙인다(못 그리면 글만). cardData 는 카드가 켜져 있을 때만 부른다
const msgCard = async (key, vars, cardData, fallback) =>
  (await buildMessageWithCard(key, vars, cardData)) || { content: fallback, allowedMentions: { parse: [] } };
// 카드 사진 — 캐시에 없는 멤버(API 모양)는 아바타 함수가 없어 유저 쪽으로
const avatarOf = (interaction) => cardAvatar(typeof interaction.member?.displayAvatarURL === "function" ? interaction.member : interaction.user);
// 다음 레벨까지 — 남은 XP · 진행률 (만렙이면 0 · 1)
function levelSpan(level, xp) {
  if (level >= MAX_LEVEL) return { need: 0, progress: 1 };
  const cur = getCumulativeXpByLevel(level);
  const next = getCumulativeXpByLevel(level + 1);
  return { need: Math.max(0, next - xp), progress: (xp - cur) / Math.max(1, next - cur) };
}
// 📌 나보다 위인 사람 — XP 내림차순, 동점은 userId 오름차순. 사이트 랭킹(app/api/xp/leaderboard) · 내 정보(app/api/xp/me)와 같은 규칙
//    2026-10-04 "규칙 하나로 맞추면, 같은 사람이 화면마다 다른 순위로 보이는 일이 없습니다" — /랭크 목록도 같은 순서(xp -1, userId 1)
//    userId 는 글자 비교(Mongo 정렬 · $lt 와 같은 순서)라 가입 순서가 아니다 — ID 자리 수(17~19)가 다르면 늦게 만든 계정이 앞설 수 있다
const rankAbove = (userId, xp) => ({ $or: [{ xp: { $gt: xp } }, { xp, userId: { $lt: userId } }] });

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
  // 📌 XP 획득 중단(관리자 — xpStop.js) — 출석을 받지 않는다. 나만 보기로 끝 시각만 알린다(사이트 받기 거절 문구와 같은 글)
  if (res?.stopped) return r.send({ content: xpStopText(res.until), allowedMentions: { parse: [] } }, { ephemeral: true });
  if (res?.already) {
    return r.send(
      msg("cmdAttendAlready", { ...base, streak: res.streak }, `오늘은 이미 출석했습니다. 연속 ${res.streak}일`),
      { ephemeral: true }
    );
  }

  // 연속 보너스 한 줄 — 없으면 빈 글(템플릿에서 그 줄이 빠진다). 자동 출석 알림과 같은 글(attend.js)
  const streakBonus = streakBonusText(res.streakBonus);

  const vars = { ...base, amount: res.amount, attendCount: res.attendCount, streak: res.streak, bestStreak: res.bestStreak, streakBonus };
  const payload = await msgCard(
    "cmdAttend",
    vars,
    async () => ({
      avatar: await avatarOf(interaction),
      name: base.name,
      amount: res.amount,
      streak: res.streak,
      bestStreak: res.bestStreak,
      attendCount: res.attendCount,
      streakBonus,
    }),
    `출석 완료 · +${(res.amount || 0).toLocaleString("ko-KR")} XP · 연속 ${res.streak}일${streakBonus ? ` · ${streakBonus}` : ""}`
  );
  return r.send({ ...payload, components: [linkRow("대시보드", "/level?tab=my")] });
}

async function handleLevel(interaction, r) {
  const doc = await UserXp.findOne({ userId: interaction.user.id }, { xp: 1 }).lean();
  const xp = doc?.xp || 0;
  // 📌 /레벨 = 내 카드 — 순위 · 상위 % 까지 여기서 보여 준다(/랭크 는 서버 순위표)
  const [above, docCount] = await Promise.all([UserXp.countDocuments(rankAbove(interaction.user.id, xp)), UserXp.countDocuments()]);
  const total = rankTotalOf(docCount, serverHumanCount(interaction.guild)); // 2026-10-25 서버 사람 수 포함(사이트 /api/xp/me 와 같다)
  const rank = above + 1;
  // 저장된 level 은 새 문서 · 초기화 직후 0 일 수 있다 — xp 로 계산한다 (0 XP = Lv.1, 사이트와 같은 기준)
  const level = getLevelByXp(xp);
  const { need, progress } = levelSpan(level, xp);
  const nextLevel = level >= MAX_LEVEL ? MAX_LEVEL : level + 1;
  const base = commonVars(interaction.member, interaction.guild);

  const payload = await msgCard(
    "cmdLevel",
    {
      ...base,
      level,
      xp,
      need,
      nextLevel,
      progressBar: progressBar(progress),
      tier: tierOf(level).name,
    },
    async () => ({ avatar: await avatarOf(interaction), name: base.name, level, xp, need, progress, rank, total }),
    `Lv.${level} · 현재 ${xp.toLocaleString("ko-KR")} XP · Lv.${nextLevel}까지 ${need.toLocaleString("ko-KR")} XP`
  );
  return r.send({ ...payload, components: [linkRow("대시보드", "/level?tab=my")] });
}

// 📌 /랭크 = 서버 순위표 — 1~10위 + 맨 아래 내 줄(카드). 글(임베드)은 템플릿 그대로({rank} · {total} 등 내 순위)
//    📌 2026-10-18 「기준」(현재 · 누적 · 이번 달 · 음성 시간) — 사이트 랭킹 탭(app/api/xp/leaderboard period)과 같은 값 · 같은 정렬(값 내림차순 · 동점 userId 오름차순).
//       누적 · 이번 달은 rankBoards.js 공용 블록(사이트와 글자 그대로 같은 계산 — 30초 기억), 음성 시간은 voiceSeconds 가 1초라도 있는 사람만.
//       그 기준에 내 순위가 없으면(이번 달 0 XP · 음성 0초 등) 카드의 '나' 줄을 빼고 글은 「아직 기록이 없습니다」. 줄의 레벨은 늘 지금 XP 로 셈
const RANK_TOP = 10;
const RANK_M = { UserXp, XpLog, Payout, Purchase, WalletLog, ObjectId: mongoose.Types.ObjectId };
const BOARD_TTL = 30 * 1000;
const boardCache = new Map(); // "month|<시작>" · "total|<시작>" → { at, board }
async function cachedBoard(key, make) {
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < BOARD_TTL) return hit.board;
  const board = await make();
  boardCache.set(key, { at: Date.now(), board });
  return board;
}
// 기준마다 순위표 — { total(그 기준에 오른 인원), rows: 1~10위 [{ userId, xp, voiceSeconds? }], myRank(없으면 0), myXp, myVoice }
async function rankBoardOf(period, myId, myDoc) {
  if (period === "month" || period === "total") {
    const since = period === "month" ? rankMonthStart() : rankTotalSince(seasonStartMs(currentSeason()), getSettings().ledgerSince);
    const board = await cachedBoard(`${period}|${since.toISOString()}`, () => (period === "month" ? monthBoard(RANK_M, since) : totalBoard(RANK_M, since)));
    const idx = board.findIndex((x) => x.userId === myId);
    return { total: board.length, rows: board.slice(0, RANK_TOP), myRank: idx + 1, myXp: idx >= 0 ? board[idx].xp : 0 };
  }
  if (period === "voice") {
    const myV = myDoc?.voiceSeconds || 0;
    const filter = { voiceSeconds: { $gt: 0 } };
    const [rows, total, above] = await Promise.all([
      UserXp.find(filter, { userId: 1, voiceSeconds: 1 }).sort({ voiceSeconds: -1, userId: 1 }).limit(RANK_TOP).lean(),
      UserXp.countDocuments(filter),
      myV > 0 ? UserXp.countDocuments({ $or: [{ voiceSeconds: { $gt: myV } }, { voiceSeconds: myV, userId: { $lt: myId } }] }) : null,
    ]);
    return { total, rows: rows.map((d) => ({ userId: d.userId, voiceSeconds: d.voiceSeconds || 0 })), myRank: above == null ? 0 : above + 1, myVoice: myV };
  }
  const xp = myDoc?.xp || 0;
  const [above, total, rows] = await Promise.all([
    UserXp.countDocuments(rankAbove(myId, xp)),
    UserXp.countDocuments(),
    UserXp.find({}, { userId: 1, xp: 1 }).sort({ xp: -1, userId: 1 }).limit(RANK_TOP).lean(),
  ]);
  return { total, rows: rows.map((d) => ({ userId: d.userId, xp: d.xp || 0 })), myRank: above + 1, myXp: xp };
}
async function handleRank(interaction, r) {
  const period = rankPeriodOf(interaction.options?.getString?.("기준") || "all");
  const myId = interaction.user.id;
  const doc = await UserXp.findOne({ userId: myId }, { xp: 1, voiceSeconds: 1, avatarFramePick: 1, seasonFrame: 1 }).lean();
  const xp = doc?.xp || 0;
  const b = await rankBoardOf(period.v, myId, doc);
  // 📌 2026-10-25 전체 인원 = 서버 사람 수 포함(rankTotalOf — 사이트 랭킹 members 와 같다). 순위는 그대로
  b.total = rankTotalOf(b.total, serverHumanCount(interaction.guild));
  // 1~10위의 이름 · 지금 XP(레벨) · 테두리 — UserXp 문서에서(이번 달 · 누적 · 음성 순위표는 값만 준다)
  const ids = b.rows.map((x) => x.userId);
  const docsById = new Map(
    (ids.length ? await UserXp.find({ userId: { $in: ids } }, { userId: 1, xp: 1, username: 1, displayName: 1, avatarFramePick: 1, seasonFrame: 1 }).lean() : [])
      .map((d) => [d.userId, d])
  );
  //    xp 는 그 기준의 값으로 바꿔 끼우고 지금 XP 는 curXp 로. 이름은 UserXp 문서 > 순위표(이번 달 XpLog · 누적) 이름
  const topDocs = b.rows.map((x) => {
    const d = docsById.get(x.userId) || {};
    return { ...d, userId: x.userId, displayName: d.displayName || x.displayName || x.name || "", xp: x.xp || 0, voiceSeconds: x.voiceSeconds || 0, curXp: d.xp || 0 };
  });
  // 📌 낀 아바타 테두리 — 가진 테두리(아이템 perksOf + 시즌 티어 테두리) 중 고른 것. 서버에 없는 사람은 시즌 테두리만(아이템 보유를 못 본다)
  const frameOf = (m, d) => pickAvatarFrame(withSeasonFrame(m ? perksOf(m).avatarFrames : [], d), d?.avatarFramePick || "");
  const level = getLevelByXp(xp);
  const ranked = b.myRank > 0;
  const rank = ranked ? b.myRank : "-";
  const total = b.total;
  const voice = period.v === "voice";
  const value = voice ? voiceTimeText(b.myVoice) : `${(b.myXp || 0).toLocaleString("ko-KR")} XP`;
  // 순위 문장 — 현재는 예전 글 그대로, 다른 기준은 앞에 기준 이름 · 순위가 없으면 「아직 기록이 없습니다」
  const head = period.v === "all" ? "" : `${period.mode} · `;
  const rankLine = ranked ? `${head}${total.toLocaleString("ko-KR")}명 중 **${b.myRank}위**입니다.` : `${head}아직 기록이 없습니다.`;
  const base = commonVars(interaction.member, interaction.guild);
  const season = currentSeason();

  const payload = await msgCard(
    "cmdRank",
    { ...base, rank, total, level, xp, tier: tierOf(level).name, mode: period.mode, value, rankLine },
    async () => {
      // 이름 · 사진 — 서버 멤버(캐시 → 없는 사람만 한 번에 받아 오기, 최대 2초) > 저장된 이름. 사진을 못 받으면 첫 글자 원형
      const ids = topDocs.map((d) => d.userId);
      const members = new Map();
      try {
        const g = interaction.guild;
        const missing = ids.filter((id) => !g?.members?.cache?.has(id));
        if (g && missing.length) await Promise.race([g.members.fetch({ user: missing }).catch(() => null), new Promise((res) => setTimeout(res, 2000))]);
        for (const id of ids) {
          const m = g?.members?.cache?.get(id);
          if (m) members.set(id, m);
        }
      } catch {}
      const top = await Promise.all(
        topDocs.map(async (d, i) => {
          const m = members.get(d.userId);
          // xp 는 그 기준의 XP(현재 · 누적 · 이번 달) · 음성은 voiceSeconds — 레벨은 늘 지금 XP 로
          return {
            rank: i + 1,
            name: m?.displayName || d.displayName || d.username || "",
            avatar: m ? await cardAvatar(m) : null,
            level: getLevelByXp(d.curXp || 0),
            xp: d.xp || 0,
            ...(voice ? { voiceSeconds: d.voiceSeconds || 0 } : {}),
            frame: frameOf(m, d) || undefined,
          };
        })
      );
      return {
        season: season.number,
        seasonName: season.name,
        period: period.v,
        total,
        top,
        // 그 기준에 내 순위가 없으면 '나' 줄 없이
        ...(ranked
          ? { me: { rank: b.myRank, name: base.name, avatar: await avatarOf(interaction), level, xp: b.myXp || 0, ...(voice ? { voiceSeconds: b.myVoice || 0 } : {}), frame: frameOf(interaction.member, doc) || undefined } }
          : {}),
      };
    },
    period.v === "all"
      ? `#${rank} / ${total.toLocaleString("ko-KR")} · Lv.${level} · 현재 ${xp.toLocaleString("ko-KR")} XP`
      : `${period.mode} · ${ranked ? `#${rank} / ${total.toLocaleString("ko-KR")} · ${value}` : "아직 기록이 없습니다"}`
  );
  return r.send({ ...payload, components: [linkRow("랭킹", "/level?tab=rank")] });
}

async function handleQuest(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await questView(interaction.user.id);
  const base = commonVars(interaction.member, interaction.guild);
  const payload = await msgCard(
    "cmdQuest",
    { ...base, daily: v.daily, weekly: v.weekly, monthly: v.monthly, claimable: v.claimable },
    async () => questCardData(v, base.name),
    `받을 보상 ${v.claimable}개`
  );
  return r.send({ ...payload, components: [linkRow("퀘스트", "/level?tab=my")] });
}

async function handleInventory(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await inventoryView(interaction.member);
  const base = commonVars(interaction.member, interaction.guild);
  const payload = await msgCard(
    "cmdInventory",
    { ...base, items: v.items, itemCount: v.itemCount },
    async (cards) => inventoryCardData(v, base.name, cards),
    `보유 아이템 ${v.itemCount}개`
  );
  // 📌 인벤토리는 레벨 대시보드 위 팝업 — ?bag=1 이면 바로 열린다 (ARCTIC 은 비공개일 수 있어 레벨 쪽으로 보낸다)
  return r.send({ ...payload, components: [linkRow("인벤토리", "/level?tab=my&bag=1")] });
}

async function handlePass(interaction, r) {
  if (!levelOpen()) return sendClosed(interaction, r);
  const v = await passView(interaction.user.id, interaction.member);
  if (!v.enabled) return r.send({ content: "시즌 패스 준비 중입니다.", allowedMentions: { parse: [] } }, { ephemeral: true });
  const payload = await msgCard(
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
    async (cards) => passCardData(v, cards),
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
