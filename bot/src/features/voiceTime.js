// ── 음성 시간 (실제 접속 초) ──────────────────
//    📌 2026-10-03 "5분 단위 말고 실제 음성 시간으로" — 예전엔 음성 XP 주기(5분)마다 UserXp.voiceSeconds 에 300초씩 더해
//       랭킹 "음성 시간"이 5분 단위로만 늘었다. 이제 들어옴 · 나감 · 옮김 · 마이크/헤드셋 바뀜을 그 자리에서 재고(voiceStateUpdate),
//       1분마다 실제 초를 voiceSeconds 에 더한다. 음성 XP 주기(features/voiceXp.js)는 더 이상 voiceSeconds 를 건드리지 않는다.
//    📌 세는 조건은 음성 XP 와 같다 — 봇 · 잠수 채널 · 제외 채널(채널 정책) · 음소거 막기(완화 효과 반영) · 음성 XP 정지(voiceXpOff) ·
//       시즌 2 개시 전(VOICE_TIME_START)은 빼고, 레벨 비공개여도 쌓는다. 지급 XP 가 0 인 주기(음성 XP 0 설정 등)도 시간은 센다 — 시간은 시간.
//       설정 · 채널 정책 · 잠수 채널 · 아이템 효과는 이벤트 없이 바뀌므로 기록할 때마다 열린 구간을 끊어 다시 판정한다.
//    📌 켜질 때 지금 음성에 있는 사람부터 센다(꺼져 있던 동안은 못 센다). 종료(SIGTERM) 때 남은 초를 마저 쓰려 하지만,
//       Railway 기본 설정은 SIGTERM 뒤 곧바로 SIGKILL 이라(RAILWAY_DEPLOYMENT_DRAINING_SECONDS=0) 재배포 때 마지막 기록 뒤 몇 초는 잃을 수 있다 —
//       그래서 기록 주기를 20초로 짧게 둔다
//    📌 이상 활동(XpLog.sec) · 오늘 누적 분(자동 출석 · 하루 음성 효과) · 퀘스트 "음성 N분"은 그대로 주기 기준이다.
import { Events } from "discord.js";
import { UserXp } from "../db.js";
import { kstToday, VOICE_TIME_START } from "../leveling.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getMuteMultiplier } from "../botSettings.js";
import { relieveMute } from "./voiceXp.js";
import { config } from "../config.js";

const FLUSH_MS = 20_000;
// 한 구간 상한 — 기록할 때마다 끊으므로 보통 20초 남짓. 프로세스가 멈췄다 깨어나 긴 공백이 한 번에 들어오지 않게
const SEG_MAX_MS = FLUSH_MS * 3;

const sessions = new Map(); // userId → { since: 지금 구간 시작 ms(세지 않는 구간이면 null), member }
const pending = new Map(); // userId → { ms, member } — 아직 DB 에 안 쓴 시간
let guildRef = null;
let started = false;
let flushing = null;

// 이 음성 상태를 지금 시간으로 셀 수 있나 — features/voiceXp.js 주기의 대상 · 음소거 판정과 같은 규칙
function countable(vs) {
  const member = vs?.member, channel = vs?.channel;
  if (!member || member.user?.bot || !channel) return false;
  if (kstToday() < VOICE_TIME_START) return false;
  if (channel.id === vs.guild?.afkChannelId) return false;
  if (getChannelPolicy(channel).excluded) return false;
  return relieveMute(getMuteMultiplier(vs), member, getSettings()) !== 0;
}

// cap = 열린 구간 하나를 닫을 때만 상한을 건다(되돌려 넣는 밀린 시간에는 걸지 않는다)
function addPending(userId, ms, member, cap = true) {
  if (!(ms > 0)) return;
  const p = pending.get(userId) || { ms: 0, member: null };
  p.ms += cap ? Math.min(ms, SEG_MAX_MS) : ms;
  if (member) p.member = member;
  pending.set(userId, p);
}

// 지금 구간을 닫아(세는 구간이었으면 pending 에) 넣고 vs 기준으로 새 구간을 연다. 음성 채널이 없으면 세션을 끝낸다
function cut(userId, vs, now = Date.now()) {
  const s = sessions.get(userId);
  if (s && s.since != null) addPending(userId, now - s.since, vs?.member || s.member);
  if (!vs?.channelId) {
    sessions.delete(userId);
    return;
  }
  sessions.set(userId, { since: countable(vs) ? now : null, member: vs.member || s?.member || null });
}

// 밀린 시간을 UserXp.voiceSeconds 에 쓴다 — 20초 주기 · 종료 때. 겹쳐 부르면 진행 중인 것을 같이 기다린다
export function flushVoiceTime() {
  if (!started) return Promise.resolve();
  if (flushing) return flushing;
  flushing = doFlush()
    .catch((e) => console.error("음성 시간 기록 오류:", e?.message || e))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function doFlush() {
  const now = Date.now();
  const guild = guildRef;
  if (guild) {
    // 열린 구간을 모두 끊어 다시 판정한다. 놓친 이벤트도 여기서 메운다 —
    // 세션은 있는데 음성에 없으면(나감을 놓침) 지난 구간은 버리고, 음성에 있는데 세션이 없으면 지금부터 센다
    for (const userId of [...sessions.keys()]) {
      const vs = guild.voiceStates.cache.get(userId);
      if (vs?.channelId) cut(userId, vs, now);
      else sessions.delete(userId);
    }
    for (const [userId, vs] of guild.voiceStates.cache) {
      if (!vs.channelId || sessions.has(userId) || vs.member?.user?.bot) continue;
      cut(userId, vs, now);
    }
  }
  if (!pending.size) return;

  // 초 단위로 쓰고 1초 미만 나머지는 다음 번으로 넘긴다
  const rows = [];
  for (const [userId, p] of [...pending]) {
    const sec = Math.floor(p.ms / 1000);
    if (sec <= 0) {
      if (!sessions.has(userId)) pending.delete(userId); // 음성에서 나간 사람의 1초 미만 나머지는 버린다(맵이 쌓이지 않게)
      continue;
    }
    rows.push({ userId, sec, member: p.member });
    p.ms -= sec * 1000;
    if (p.ms <= 0) pending.delete(userId);
  }
  if (!rows.length) return;
  const giveBack = () => rows.forEach((r) => addPending(r.userId, r.sec * 1000, r.member, false));

  // 📌 음성 XP 정지는 쓰는 때 본다(관리자가 사이트에서 켜고 끄므로 이벤트가 없다). 문서가 없는 새 사람만 만들어 쓴다 —
  //    정지 조건과 upsert 를 한 쓰기에 같이 걸면 userId 유일 색인 때문에 E11000 이 난다
  let docs;
  try {
    docs = await UserXp.find({ userId: { $in: rows.map((r) => r.userId) } }, { userId: 1, voiceXpOff: 1 }).lean();
  } catch (e) {
    giveBack(); // 읽기 실패 — 아무것도 안 썼으니 다음 번에 다시
    throw e;
  }
  const docOf = new Map(docs.map((d) => [d.userId, d]));
  const ops = [];
  for (const r of rows) {
    const d = docOf.get(r.userId);
    if (d?.voiceXpOff === true) continue;
    const names = r.member ? { username: r.member.user?.username || "", displayName: r.member.displayName || "" } : {};
    if (d) {
      ops.push({ updateOne: { filter: { userId: r.userId, voiceXpOff: { $ne: true } }, update: { $inc: { voiceSeconds: r.sec }, ...(r.member ? { $set: names } : {}) } } });
    } else if (guild?.members.cache.has(r.userId)) {
      // 📌 서버에 있는 사람만 새로 만든다 — 퇴장 초기화(features/leaveReset.js)로 지운 문서를 남은 초로 되살리지 않게
      ops.push({ updateOne: { filter: { userId: r.userId }, update: { $inc: { voiceSeconds: r.sec }, $set: { ...names, updatedAt: new Date() } }, upsert: true } });
    }
  }
  // 쓰기 실패는 되돌리지 않는다 — 일부만 들어갔을 수 있어 다시 쓰면 두 번 센다
  if (ops.length) await UserXp.bulkWrite(ops, { ordered: false });
}

// ClientReady 에서 설정 · 채널 정책을 읽은 뒤에 켠다(판정이 그 값을 쓴다)
export function startVoiceTime(client) {
  if (started) return;
  guildRef = client.guilds.cache.get(config.guildId) || null;
  started = true;

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const userId = newState.id;
    if (!userId || newState.member?.user?.bot) return;
    if (!guildRef) guildRef = newState.guild;
    cut(userId, newState); // 들어옴 · 나감 · 옮김 · 마이크/헤드셋 · 화면 공유 — 바뀔 때마다 끊어 다시 판정
  });

  // 서버에서 나가면 세션을 닫는다. 퇴장 초기화가 켜져 있으면 문서가 지워지므로 밀린 초도 버린다
  client.on(Events.GuildMemberRemove, (member) => {
    if (member.guild?.id !== config.guildId) return;
    cut(member.id, null);
    if (getSettings().resetOnLeave) pending.delete(member.id);
  });

  // 지금 음성에 있는 사람부터 센다
  if (guildRef) for (const [userId, vs] of guildRef.voiceStates.cache) if (vs.channelId && !vs.member?.user?.bot) cut(userId, vs);

  setInterval(() => flushVoiceTime(), FLUSH_MS);
  console.log(`✅ 음성 시간 기록 시작 — 실제 접속 초, ${FLUSH_MS / 1000}초마다 기록 (지금 음성 ${sessions.size}명)`);
}
