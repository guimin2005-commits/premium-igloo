// ── AFK 방지 시스템 (음성 채널에 혼자인 사람의 접속 확인 — 운영자가 붙인 이름) ──────────────────
//    📌 2026-10-04 운영자: "음성 채널에서 혼자 있는 인원 대상으로만 장시간 접속하면 확인 버튼 누르게 하자" · "최소 시간 1시간" ·
//       "그 후는 랜덤하게" · "안 누르면 잠수 채널로 이동" · 버튼은 그 음성 채널 채팅(본인만 누를 수 있음).
//    · 대상: 같은 음성 채널에 봇 말고 아무도 없는 사람. 잠수 채널 · XP 제외 채널은 원래 XP · 음성 시간이 없어 보지 않는다.
//      서포터즈(역할 보유자)는 자동으로 뺀다 — 운영자 "서포터즈들은 자동으로 제외". 역할 ID 는 사이트와 같은 순서(환경변수 → 관리 설정)
//      마이크 · 헤드셋을 끈 사람도 뺀다 — 운영자 "어차피 잠수인 거니까 냅두고 · 90% XP 감소라서 의미 없음"(음소거 감소가 이미 걸린다).
//      관리자도 뺀다 — 운영자 "관리자들도 제외". 디스코드 관리자 · 서버 관리 권한이 있거나 사이트 관리자 계정(lib/admins.js ADMIN_USERS 와 같게)
//    · 혼자가 된 뒤 afkCheckFirstMin 분(기본 60)이 되면 그 음성 채널 채팅에 본인 멘션 + [확인] 버튼을 띄운다.
//      제재받은 사람은 afkCheckSanctionMin 분(기본 30) — 운영자 "제재 먹은 인원의 경우는 최소 시간을 30분으로".
//      제재받은 사람 = 음성 XP 정지 중이거나 XP 획득 중단 기록(지금 · 예약 · 기간이 끝났지만 해제하지 않은 것)이 있는 사람(UserXp, 5분마다 읽는다)
//      확인을 누르면 메시지를 지우고, 계속 혼자면 다음 확인은 afkCheckMinMin~afkCheckMaxMin 분(기본 20~60) 사이 아무 때나.
//    · afkCheckReplyMin 분(기본 5) 안에 안 누르면 서버 잠수 채널로 옮긴다(잠수 채널은 XP · 음성 시간이 쌓이지 않는다 — voiceTime.js).
//    · 누가 같은 채널에 들어오거나 본인이 음성에서 나가면 확인을 멈추고(떠 있는 버튼은 지운다), 다시 혼자가 되면 처음부터 센다.
//      혼자인 채로 다른 채널로 옮기면 이어서 센다 — 채널을 옮겨 시계를 처음으로 돌리지 못하게.
//    · 다른 사람이 버튼을 누르면 그 사람에게만 "본인만 누를 수 있습니다". 누른 본인에게는 "확인됐습니다"가 본인에게만 보인다.
//    · 봇 메모리에만 둔다 — 재시작하면 지금 혼자인 사람도 처음부터 센다(혼자 시간을 짧게 잡는 쪽으로만 틀린다).
import { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from "discord.js";
import { getSettings } from "../botSettings.js";
import { UserXp } from "../db.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { config } from "../config.js";

const TICK_MS = 30_000;
// 사이트 관리자 디스코드 이름 — lib/admins.js ADMIN_USERS 와 같게 둔다(봇은 사이트 코드를 import 하지 못한다)
const ADMIN_USERS = ["elahw.06"];
const isStaff = (member) =>
  ADMIN_USERS.includes(member?.user?.username) ||
  !!member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
  !!member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
const PREFIX = "afkcheck:";

// userId → { since: 혼자가 된 시각, dueAt: 다음 확인 시각, prompt: { nonce, channelId, messageId, expiresAt } | null }
const state = new Map();
// 제재받은 사람 — 5분마다 다시 읽는다. 읽기 전 · 실패 때는 예전 목록을 그대로 쓴다
let sanctioned = new Set();
let sanctionedAt = 0;
async function refreshSanctioned() {
  if (Date.now() - sanctionedAt < 5 * 60_000) return;
  sanctionedAt = Date.now();
  try {
    const docs = await UserXp.find({ $or: [{ voiceXpOff: true }, { xpStopUntil: { $ne: null } }] }, { userId: 1 }).lean();
    sanctioned = new Set(docs.map((d) => d.userId));
  } catch (e) {
    console.error("잠수 확인: 제재 목록 읽기 실패:", e?.message || e);
  }
}
let guildRef = null;
let started = false;
let running = false;
let again = false;

const humans = (channel) => channel?.members?.filter((m) => !m.user.bot).size || 0;
const minutes = (v, d) => Math.max(1, Number(v) || d) * 60_000;
const randomGap = (s) => {
  const lo = minutes(s.afkCheckMinMin, 20);
  const hi = Math.max(lo, minutes(s.afkCheckMaxMin, 60));
  return lo + Math.random() * (hi - lo);
};

// 확인 대상인 음성 상태 — 봇 · 관리자 · 서포터즈가 아니고, 잠수 · 제외 채널이 아닌 음성 채널에 혼자
function aloneHere(vs, supporterRoleId) {
  const ch = vs?.channel;
  if (!ch || !vs.member || vs.member.user?.bot) return false;
  if (vs.selfMute || vs.selfDeaf || vs.serverMute || vs.serverDeaf) return false; // 마이크 · 헤드셋 끔 — 음소거 감소로 이미 거의 안 쌓인다
  if (isStaff(vs.member)) return false;
  if (supporterRoleId && vs.member.roles?.cache?.has(supporterRoleId)) return false;
  if (ch.id === vs.guild?.afkChannelId) return false;
  if (getChannelPolicy(ch).excluded) return false;
  return humans(ch) === 1;
}

async function deletePrompt(p) {
  if (!p || !guildRef) return;
  const ch = guildRef.channels.cache.get(p.channelId);
  if (!ch?.messages) return;
  await ch.messages.delete(p.messageId).catch(() => {});
}

async function sendPrompt(userId, vs, s) {
  const ch = vs.channel;
  const me = vs.guild.members.me;
  if (!ch?.isTextBased?.() || !me) return null;
  const perms = ch.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) return null;
  const nonce = Math.random().toString(36).slice(2, 10);
  const reply = Math.max(1, Number(s.afkCheckReplyMin) || 5);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}${userId}:${nonce}`).setLabel("확인").setStyle(ButtonStyle.Primary)
  );
  const msg = await ch
    .send({ content: `<@${userId}> 접속 확인 · ${reply}분 안에 눌러 주세요`, components: [row], allowedMentions: { users: [userId] } })
    .catch((e) => {
      console.error(`잠수 확인 보내기 실패 (${userId}):`, e?.message || e);
      return null;
    });
  if (!msg) return null;
  return { nonce, channelId: ch.id, messageId: msg.id, expiresAt: Date.now() + reply * 60_000 };
}

// 응답 없음 — 서버 잠수 채널로 옮긴다. 잠수 채널이 없거나 옮길 권한이 없으면 로그만 남긴다
async function moveToAfk(userId) {
  const guild = guildRef;
  const afkId = guild?.afkChannelId;
  const vs = guild?.voiceStates.cache.get(userId);
  if (!vs?.channelId || !afkId) {
    if (!afkId) console.error("잠수 확인: 서버 잠수 채널이 지정돼 있지 않아 옮기지 못했습니다");
    return;
  }
  await vs.setChannel(afkId, "잠수 확인 응답 없음").then(
    () => console.log(`🛌 잠수 확인 응답 없음 → 잠수 채널로 이동: ${vs.member?.displayName || userId}`),
    (e) => console.error(`잠수 채널 이동 실패 (${userId}):`, e?.message || e)
  );
}

// 겹쳐 부르면(음성 변경 · 30초 주기) 한 번만 돌고, 도는 동안 들어온 요청은 끝난 뒤 한 번 더 — 같은 사람에게 버튼이 두 번 가지 않게
async function tick() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      await runTick();
    } while (again);
  } finally {
    running = false;
  }
}

async function runTick() {
  const guild = guildRef;
  if (!guild) return;
  const s = getSettings();
  const supporterRoleId = process.env.DISCORD_SUPPORTER_ROLE_ID || s.supporterRoleId || "";
  await refreshSanctioned();
  const now = Date.now();
  if (s.afkCheckOn === false) {
    for (const st of state.values()) await deletePrompt(st.prompt);
    state.clear();
    return;
  }
  const seen = new Set();
  for (const [userId, vs] of guild.voiceStates.cache) {
    if (!aloneHere(vs, supporterRoleId)) continue;
    seen.add(userId);
    let st = state.get(userId);
    if (!st) {
      const first = sanctioned.has(userId) ? minutes(s.afkCheckSanctionMin, 30) : minutes(s.afkCheckFirstMin, 60);
      state.set(userId, (st = { since: now, dueAt: now + first, prompt: null }));
    }
    if (st.prompt) {
      if (now >= st.prompt.expiresAt) {
        const p = st.prompt;
        state.delete(userId);
        await deletePrompt(p);
        await moveToAfk(userId);
      }
      continue;
    }
    if (now >= st.dueAt) {
      const p = await sendPrompt(userId, vs, s);
      // 보낼 수 없는 채널(권한 없음 등)이면 옮기지 않는다 — 버튼을 못 본 사람을 내보내지 않게. 다음 주기에 다시
      if (p) st.prompt = p;
      else st.dueAt = now + randomGap(s);
    }
  }
  // 혼자가 아니게 됐거나 음성에서 나간 사람 — 멈추고 떠 있는 버튼은 지운다
  for (const [userId, st] of [...state]) {
    if (seen.has(userId)) continue;
    state.delete(userId);
    await deletePrompt(st.prompt);
  }
}

async function onButton(interaction) {
  if (!interaction.isButton?.() || !interaction.customId.startsWith(PREFIX)) return;
  const [target, nonce] = interaction.customId.slice(PREFIX.length).split(":");
  if (interaction.user.id !== target) {
    await interaction.reply({ content: "본인만 누를 수 있습니다.", flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  const st = state.get(target);
  const live = st?.prompt && st.prompt.nonce === nonce && Date.now() < st.prompt.expiresAt;
  if (live) {
    st.prompt = null;
    st.dueAt = Date.now() + randomGap(getSettings());
  }
  await interaction.reply({ content: live ? "확인됐습니다." : "이미 지난 확인입니다.", flags: MessageFlags.Ephemeral }).catch(() => {});
  await interaction.message?.delete().catch(() => {});
}

// ClientReady 뒤에 켠다
export function startAfkCheck(client) {
  if (started) return;
  started = true;
  guildRef = client.guilds.cache.get(config.guildId) || null;
  client.on(Events.InteractionCreate, (i) => {
    if (i.guildId && i.guildId !== config.guildId) return;
    onButton(i).catch((e) => console.error("잠수 확인 버튼 오류:", e?.message || e));
  });
  // 누가 들어오거나 나가면 바로 다시 본다 — 혼자가 아니게 된 사람의 버튼을 빨리 지우게
  client.on(Events.VoiceStateUpdate, (o, n) => {
    if ((n.guild || o.guild)?.id !== config.guildId) return;
    if (!guildRef) guildRef = n.guild || o.guild;
    if (o.channelId !== n.channelId) tick().catch(() => {});
  });
  setInterval(() => tick().catch((e) => console.error("잠수 확인 오류:", e?.message || e)), TICK_MS);
  console.log("✅ AFK 방지 시스템 시작 — 음성 채널에 혼자 · 마이크 · 헤드셋 켠 사람만");
}
