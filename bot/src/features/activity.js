// ── 마지막 활동 시각 ──────────────────
//    📌 "활동" = 서버 안 채팅(messageCreate) · 음성 상태 바뀜(마이크 · 헤드셋 · 화면 공유 · 캠 · 채널 입장/이동) · 슬래시 명령 · 버튼(interactionCreate).
//       음성 XP 로그의 ctx.idle(마지막 활동 뒤 지난 분)에 쓴다(features/voiceTime.js).
//    📌 2026-10-04 "마지막 활동 시각을 저장해 두고 재시작 뒤에도 이어서 셉니다" — 음성에 있는 사람의 마지막 활동 시각을 UserXp.lastActiveAt 에 적고,
//       켜질 때 읽어 이어 센다. 메시지마다 쓰지 않는다 — 20초마다 바뀐 사람만 마지막 값 하나씩 한 번에 쓰고, 종료(SIGTERM) 때 마저 쓴다.
//       음성에 없는 사람은 적지 않는다(들어오는 것 자체가 활동이라 그때 새로 찍힌다). 음성에서 나가면 DB 값도 지운다 —
//       봇이 꺼진 사이 다시 들어온 사람이 예전 값으로 길게 잡히지 않게. 켜질 때 음성에 없는 사람의 남은 값도 지운다.
//       ⚠ 나감과 재입장이 둘 다 봇이 꺼진 사이에 있었거나, 나감을 적기 전에 꺼졌다가(SIGKILL) 켜질 때 다시 음성에 있으면 예전 값을 이어 받는다 —
//          그 사람의 무활동은 꺼져 있던 동안만큼 길게 잡힐 수 있다(꺼진 사이의 재입장은 알 길이 없다. 보통 배포 몇십 초)
//    📌 2026-10-04 "재시작 뒤 기록이 아직 없는 사람은 무활동을 '모름'으로 표시" — 기록이 없으면 null(모름). 예전처럼 봇이 켜진 시각부터 세지 않는다
import { Events } from "discord.js";
import { UserXp } from "../db.js";
import { config } from "../config.js";

const FLUSH_MS = 20_000;

const lastAt = new Map(); // userId → 마지막 활동 ms
const dirty = new Set(); // 마지막으로 쓴 뒤 바뀐 사람(찍힘 · 지움) — 쓸 때 음성에 있는지 보고 값 또는 null 을 쓴다
const stored = new Map(); // userId → DB 에 적힌 값(ms) — 같으면 다시 쓰지 않는다
let clientRef = null;
let started = false;
let loaded = false; // 켜질 때 DB 값을 읽었는지 — 읽기 전에는 쓰지 않는다(남은 값을 모르는 채 덮어쓰지 않게)
let flushing = null;

function mark(userId, at = Date.now()) {
  if (!userId) return;
  lastAt.set(userId, at);
  dirty.add(userId);
}

function forget(userId) {
  if (!userId) return;
  lastAt.delete(userId);
  dirty.add(userId);
}

// 마지막 활동 뒤 지난 분 — 기록이 없으면 null(모름)
export function idleMinutes(userId, now = Date.now()) {
  const at = lastAt.get(userId);
  if (at == null) return null;
  return Math.max(0, Math.floor((now - at) / 60000));
}

const guildOf = () => clientRef?.guilds.cache.get(config.guildId) || null;

// 켜질 때 한 번 — 적어 둔 값을 읽는다. 지금 음성에 있으면 이어 세고(켜진 뒤 새로 찍힌 값이 더 늦으면 그것을 둔다), 없으면 DB 에서도 지운다
async function load() {
  const guild = guildOf();
  if (!guild) return; // 아직 서버를 모른다 — 다음 번에 다시
  const docs = await UserXp.find({ lastActiveAt: { $ne: null } }, { _id: 0, userId: 1, lastActiveAt: 1 }).lean();
  let kept = 0;
  for (const d of docs) {
    const at = new Date(d.lastActiveAt).getTime();
    if (!d.userId || !Number.isFinite(at)) continue;
    stored.set(d.userId, at);
    if (guild.voiceStates.cache.get(d.userId)?.channelId) {
      if (!(lastAt.get(d.userId) >= at)) lastAt.set(d.userId, at);
      kept++;
    } else dirty.add(d.userId);
  }
  loaded = true;
  console.log(`✅ 마지막 활동 시각 이어 받기 — ${kept}명 이어 감 (${FLUSH_MS / 1000}초마다 기록)`);
}

// 바뀐 사람만 한 번에 — 음성에 있으면 마지막 값, 없으면 null. 같은 값이면 쓰지 않는다
//    📌 문서를 새로 만들지 않는다 — 퇴장 초기화(features/leaveReset.js)로 지운 문서를 되살리지 않게.
//       그래서 문서가 있는 사람만 쓰고 "적었다(stored)"로 친다. 아직 문서가 없는 사람(새 멤버 · 퇴장 초기화 뒤 재입장 — 문서는 음성 시간 기록
//       features/voiceTime.js 가 처음 만든다)은 다음 번에 다시 본다 — 못 쓴 채 적은 것으로 치면 다음 활동 전까지 DB 에 값이 남지 않는다
async function doFlush() {
  if (!dirty.size) return;
  const guild = guildOf();
  if (!guild) return; // 음성에 있는지 모른다 — 지우지 않게 다음 번에
  const ids = [...dirty];
  dirty.clear();
  const wants = new Map();
  for (const userId of ids) {
    const at = lastAt.get(userId);
    const want = at != null && guild.voiceStates.cache.get(userId)?.channelId ? at : null;
    if ((stored.get(userId) ?? null) === want) continue;
    wants.set(userId, want);
  }
  if (!wants.size) return;
  let have;
  try {
    have = new Set((await UserXp.find({ userId: { $in: [...wants.keys()] } }, { _id: 0, userId: 1 }).lean()).map((d) => d.userId));
  } catch (e) {
    wants.forEach((_, userId) => dirty.add(userId)); // 읽기 실패 — 아무것도 안 썼으니 다음 번에 다시
    throw e;
  }
  const ops = [];
  const next = [];
  for (const [userId, want] of wants) {
    if (!have.has(userId)) {
      if (want != null) dirty.add(userId); // 문서가 생기면 쓴다
      else stored.delete(userId); // 지울 문서가 없다
      continue;
    }
    ops.push({ updateOne: { filter: { userId }, update: { $set: { lastActiveAt: want == null ? null : new Date(want) } } } });
    next.push([userId, want]);
  }
  if (!ops.length) return;
  try {
    await UserXp.bulkWrite(ops, { ordered: false });
  } catch (e) {
    next.forEach(([userId]) => dirty.add(userId)); // 덮어쓰기라 다시 해도 같다 — 다음 번에 다시
    throw e;
  }
  for (const [userId, want] of next) {
    if (want == null) stored.delete(userId);
    else stored.set(userId, want);
  }
}

// 20초 주기 · 종료(final) 때. 읽기 전이면 읽기부터(실패하면 다음 번에 다시). 종료 때 도는 기록이 있으면 끝난 뒤 한 번 더
export function flushLastActive({ final = false } = {}) {
  if (!started) return Promise.resolve();
  if (flushing) return final ? flushing.then(() => flushLastActive({ final })) : flushing;
  const job = loaded ? doFlush() : final ? Promise.resolve() : load().then(() => loaded && doFlush());
  flushing = job
    .catch((e) => console.error("마지막 활동 시각 기록 오류:", e?.message || e))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

// 음성 상태 중 "본인이 바꾼 것"만 활동으로 본다 — 서버 음소거 · 서버 헤드셋(운영진 조작)은 제외
const VOICE_KEYS = ["channelId", "selfMute", "selfDeaf", "streaming", "selfVideo"];

export function registerActivity(client) {
  client.on(Events.MessageCreate, (message) => {
    if (message.author?.bot || message.guild?.id !== config.guildId) return;
    mark(message.author.id);
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const userId = newState.id;
    if (!userId || newState.member?.user?.bot) return;
    if (!newState.channelId) {
      forget(userId); // 음성에서 나감
      return;
    }
    if (VOICE_KEYS.some((k) => oldState[k] !== newState[k])) mark(userId);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.user?.bot || interaction.guildId !== config.guildId) return;
    if (!interaction.isCommand() && !interaction.isMessageComponent()) return;
    mark(interaction.user.id);
  });

  // 서버를 나가면 음성에서도 나간 것 — 음성 나감 이벤트가 오지 않아도 지운다
  client.on(Events.GuildMemberRemove, (member) => {
    if (member.guild?.id !== config.guildId) return;
    forget(member.id);
  });
}

// ClientReady 뒤에 켠다 — 적어 둔 값을 읽을 때 지금 음성에 있는 사람(voiceStates)을 본다
export function startActivity(client) {
  if (started) return;
  clientRef = client;
  started = true;
  flushLastActive();
  setInterval(() => flushLastActive(), FLUSH_MS);
}
