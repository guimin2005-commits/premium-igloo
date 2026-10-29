// ── 방구석 심야 괴담회 — 스테이지 채널 시청 기록 · 완청 추첨권 자동 지급 (2026-10-23) ──────────────────
//    📌 약속 문서 .claude/mockups/goedam/SPEC.md 「봇」 절 그대로:
//       · 60초마다 설정(Goedam, key "goedam-2026")을 다시 읽는다. 꺼져 있거나(enabled false) 채널(channelId)이 비면 기록 · 지급하지 않는다 —
//         운영진 미리보기와 상관없이 켜져 있을 때만
//       · voiceStateUpdate — 그 채널에 들어오면 구간을 열고, 나가거나 다른 채널로 옮기면 닫으며 그동안을 회차 창과 겹친 만큼만 센다. 봇 계정은 뺀다.
//         스테이지 채널도 voiceStateUpdate 가 온다(channelId) — 청중(suppressed)도 채널 안에 있으면 센다. 마이크 · 헤드셋 · 화면 · 발언자 여부는 보지 않는다
//       · 20초마다 열린 구간을 끊어(마지막으로 끊은 시각 ~ 지금) 회차 창 [startsAt, endsAt] 과 겹친 초를 GoedamWatch.seconds 에 $inc(upsert, userName 갱신)
//       · 회차 끝 + 60초가 지나면 완청(seconds ≥ ratio × 회차 길이) · grantedAt null 인 줄을 { grantedAt: null } 조건부로 세운 뒤 추첨권 Purchase N건(1장 = 1건)을 넣는다.
//         회차 끝 + 6시간이 지나면 그 회차는 더 보지 않는다. 추첨권 아이템(ticketItemId)이 비었거나 실사이트에 없으면 지급을 미룬다(다음 주기에 다시)
//       · DM 없음(운영자가 원하면 나중에) — 📌 2026-10-26 음성 활동 지급만 DM(dmVoiceTicket — 관리 › 봇 메시지 「괴담회 음성 추첨권」 + 「뽑기 하러 가기」 단추)
//    📌 시작할 때(설정을 처음 읽은 뒤) 채널에 이미 있는 사람은 지금부터 구간을 연다. 봇이 꺼져 있던 동안은 못 센다(features/voiceTime.js 와 같다)
//    📌 겹침 계산(overlapMs · splitByScreenings) · 완청 판정(isFullWatch) · 설정 정리(normalizeGoedam)는 순수 함수로 내보낸다 — node 로 바로 확인할 수 있게
//    ⚠️ GoedamWatch 는 autoIndex 가 꺼져 있다(사이트 · 테스트 사이트가 같은 DB) — 첫 쓰기 직전에 createIndexes() 를 한 번(ensureWatchIndexes)
// ── 2026-10-24 음성 활동 지급 ──────────────────
//    📌 운영자 "디코 일정 시간한 것도 지급할 거고 상점에도 판매할 거라서 회차라는 개념이 좀 애매한데" — 약속 문서 「2026-10-24 추가 — 받는 법 확장」 3:
//       · 5분마다, 켜져 있고(enabled · voice.enabled) 기간 안이고 추첨권 아이템이 있으면 오늘(KST) 셀 구간의 XpLog { reason: "voice" } 를 사람마다 sec 합으로 모은다
//         (sec 없는 옛 줄은 300초 — lib/questKinds.js · questKinds.js 와 같은 규칙). 합 ≥ minutes × 60 인 사람에게 하루 한 번 tickets 장
//       · GoedamWatch 줄 { sid: "voice:<YYYY-MM-DD>" } 에 그날 합을 쓰고($max) { grantedAt: null } 조건부로 세운 뒤 추첨권 Purchase(표식은 상영과 같고
//         orderId "goedam:voice:<날짜>:<userId>" · adminNote "괴담회 음성 <minutes>분 · <M. D.>"). 못다 준 줄 채우기(auditGrants)도 상영과 같다
//    📌 셀 구간 = 그날 [0시, 다음 0시) ∩ 기간 [voice.startsAt, voice.endsAt). 지난날은 구간 끝 + 6시간까지 다시 본다 — 끝 직전(23:5x)에 채운 사람이
//       5분 주기 · 봇 재시작 사이에 빠지지 않게. 구간 밖 음성은 세지 않으니 못 채운 날은 그대로 끝이다(voiceDays)
//    📌 XP 획득 중단 · 레벨 비공개 · 음성 XP 정지 — 상영 지급처럼 따로 거르지 않는다. 다만 XpLog 음성 줄은 XP 를 실제로 받은 바퀴에만 남아
//       (xp.js grantXp · features/voiceXp.js payVoiceCycle) 그동안의 음성은 저절로 세지 않는다. 0 XP 바퀴(채널 정책 · 음소거 막기 등)도 줄이 없어 빠진다
//    📌 채널 조건은 아직 없다(음성 XP 기록 전부) — 추후 설정에 voice.channels 를 더하면 voiceDayPipeline 의 $match 에 붙인다
//    📌 날짜 · 합 · 기준 판정(kstDayKey · voiceDays · daySeconds · voiceQualifiers)도 순수 함수로 내보낸다
import { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, embedLength } from "discord.js";
import { Goedam, GoedamWatch, GoedamDraw, GoedamGroup, GoedamGiftCode, Purchase, Item, XpLog, UserXp } from "../db.js";
import { config } from "../config.js";
import { recordBotError } from "./heartbeat.js";
import { buildMessage, currentTemplate, commonVars, SITE_URL } from "../botMessages.js";

// 📌 세 갈래(사이트 · 봇 · 화면)가 같은 글자를 쓴다 — 약속 문서 「키 · 표식」
export const GOEDAM_KEY = "goedam-2026";
export const GOEDAM_TICKET_ITEM_ID = "goedam-ticket"; // 추첨권 지급 Purchase.itemId
const DEFAULT_TITLE = "방구석 심야 괴담회";
const DEFAULT_TICKET_NAME = "할로윈 추첨권";

const REFRESH_MS = 60 * 1000;
const FLUSH_MS = 20 * 1000;
// 한 구간 상한 — 20초마다 끊으므로 보통 20초 남짓. 프로세스가 멈췄다 깨어나 긴 공백이 한 번에 들어오지 않게(voiceTime.js 와 같은 값)
const SEG_MAX_MS = FLUSH_MS * 3;
const GRANT_DELAY_MS = 60 * 1000; // 회차 끝 + 60초부터 지급 — 마지막 20초 구간이 먼저 써지게
const GRANT_STOP_MS = 6 * 60 * 60 * 1000; // 회차 끝 + 6시간 뒤로는 그 회차를 보지 않는다
// 📌 못다 준 줄 살피기 — 표시(grantedAt)를 세운 뒤 추첨권을 넣다가 꺼지면(배포 SIGKILL) 표시만 남는다.
//    5분마다 그런 줄을 찾아 orderId 로 센 장 수가 granted 보다 모자라면 모자란 만큼 넣는다. 지금 넣는 중일 수 있는 줄(1분 안)은 건너뛴다
const AUDIT_MS = 5 * 60 * 1000;
const AUDIT_GRACE_MS = 60 * 1000;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
// 📌 음성 활동(2026-10-24) — 5분마다 모은다. 지난날은 구간 끝 + 2분이 지나면(끝 직전 바퀴의 XpLog 가 다 써진 뒤) 한 번 다 돌고 더 보지 않는다(voiceDone)
const VOICE_MS = 5 * 60 * 1000;
const VOICE_SETTLE_MS = 2 * 60 * 1000;
const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// sec 없는 옛 음성 줄(2026-10-01 19:05 전 — 전부 300초 주기였다)을 세는 초 — lib/questKinds.js · questKinds.js 의 $ifNull 300 과 같다
export const LEGACY_VOICE_SEC = 300;
// 음성 활동 기본값 · 범위 — 사이트 lib/goedamRules.js · models/Goedam.js voice 와 같다(바꾸면 같이)
export const VOICE_DEFAULTS = { minutes: 60, tickets: 1, startsAt: "2026-10-30T00:00:00.000+09:00", endsAt: "2026-11-06T00:00:00.000+09:00" };
export const VOICE_MINUTES = { min: 10, max: 1440 };
export const VOICE_TICKETS = { min: 1, max: 10 };

let cfg = null; // normalizeGoedam 결과 — 아직 못 읽었거나 문서가 없으면 null
let guildRef = null;
let started = false;
let refreshing = false;
let busy = false; // 쓰기 · 지급이 도는 중 — 구간 끊기(sweep)는 그와 상관없이 20초마다
// userId → { since: 마지막으로 끊은 ms, name: 디스코드 username }
const sessions = new Map();
// "<userId>|<sid>" → { userId, sid, name, ms: 아직 GoedamWatch 에 안 쓴 시간(반올림 나머지는 이월) }
const pending = new Map();
const auditAt = new Map(); // sid → 마지막으로 못다 준 줄을 살핀 ms(음성 날 "voice:<날짜>" 포함)
const warned = new Set(); // 같은 경고를 주기마다 찍지 않게
let voiceAt = 0; // 마지막 음성 지급 주기 ms
const voiceDone = new Set(); // 다 돈 지난 음성 날(voiceDoneKey) — 재시작하면 비어 한 번 더 돈다(못다 준 줄 채우기 포함)

// ── 순수 함수 ─────────────────────────────────

const numOr = (v, d) => {
  if (v == null || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, numOr(v, d)));
const msOf = (d) => {
  if (d == null || d === "") return NaN;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
};
// 정수 칸 — 못 읽으면 기본, 아니면 내림 뒤 범위로(사이트 lib/goedamRules.js intIn 과 같은 순서)
const intIn = (v, lo, hi, d) => {
  const n = numOr(v, NaN);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : d;
};

// 📌 음성 활동 설정 정리(2026-10-24) — 사이트 lib/goedamRules.js 와 같은 범위 · 같은 기본값(하루 10~1440분, 기본 60 · 장 수 1~10, 기본 1 · 기본 꺼짐).
//    시각이 깨졌으면 기본 기간(10. 30. 00:00 ~ 11. 9. 00:00 KST, 끝은 들어가지 않는다). 끝 ≤ 시작이면 그대로 둔다 — 셀 날이 없다(voiceDays)
//    📌 채널 조건은 아직 없다 — 추후 voice.channels(채널 · 카테고리 id)를 더하면 여기서 정리해 voiceDayPipeline 에 넘긴다
export function normalizeVoice(v) {
  const startsAt = msOf(v?.startsAt);
  const endsAt = msOf(v?.endsAt);
  return {
    enabled: v?.enabled === true,
    minutes: intIn(v?.minutes, VOICE_MINUTES.min, VOICE_MINUTES.max, VOICE_DEFAULTS.minutes),
    tickets: intIn(v?.tickets, VOICE_TICKETS.min, VOICE_TICKETS.max, VOICE_DEFAULTS.tickets),
    startsAt: Number.isFinite(startsAt) ? startsAt : msOf(VOICE_DEFAULTS.startsAt),
    endsAt: Number.isFinite(endsAt) ? endsAt : msOf(VOICE_DEFAULTS.endsAt),
  };
}

// 📌 설정 문서 → 봇이 쓰는 모양(문서가 없으면 null). 사이트 lib/goedam.js normalizeGoedamConfig 와 같은 범위로 자른다(장 수 1~10 · 비율 0.1~1).
//    시각이 틀렸거나(끝 ≤ 시작) sid 가 비거나 겹치는 회차는 뺀다 — 봇은 sid 를 새로 매기지 않는다(사이트가 저장 때 매긴다)
export function normalizeGoedam(doc) {
  if (!doc) return null;
  const seen = new Set();
  const screenings = [];
  for (const s of Array.isArray(doc.screenings) ? doc.screenings : []) {
    const sid = String(s?.sid || "").trim();
    const startsAt = msOf(s?.startsAt);
    const endsAt = msOf(s?.endsAt);
    if (!sid || seen.has(sid) || !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !(endsAt > startsAt)) continue;
    seen.add(sid);
    screenings.push({
      sid,
      title: String(s?.title || "").trim(),
      startsAt,
      endsAt,
      tickets: Math.round(clamp(s?.tickets, 1, 10, 1)),
      // 0.01 단위로 — 사이트 lib/goedamRules.js ratioOf 와 같게(손으로 고친 0.333 같은 값도 화면 · 명단의 완청 판정과 갈리지 않게)
      ratio: Math.round(clamp(s?.ratio, 0.1, 1, 0.8) * 100) / 100,
    });
  }
  return {
    enabled: doc.enabled === true,
    title: String(doc.title || "").trim() || DEFAULT_TITLE,
    channelId: String(doc.channelId || "").trim(),
    ticketItemId: String(doc.ticketItemId || "").trim(),
    ticketItemName: String(doc.ticketItemName || "").trim(),
    screenings,
    voice: normalizeVoice(doc.voice),
  };
}

// 구간 [from, to) 와 회차 창 [startsAt, endsAt) 이 겹친 ms — 안 겹치면 0. 시각은 ms(숫자 · Date 둘 다 된다)
export function overlapMs(from, to, startsAt, endsAt) {
  const a = Math.max(Number(from), Number(startsAt));
  const b = Math.min(Number(to), Number(endsAt));
  return b > a ? b - a : 0;
}

// 구간 하나를 회차마다 나눈다 — [{ sid, ms }] (겹친 회차만). 회차 창이 서로 겹쳐도 회차마다 따로 센다
export function splitByScreenings(from, to, screenings) {
  const out = [];
  if (!(Number(to) > Number(from))) return out;
  for (const s of screenings || []) {
    const ms = overlapMs(from, to, s.startsAt, s.endsAt);
    if (ms > 0) out.push({ sid: s.sid, ms });
  }
  return out;
}

// 완청 기준(초) — ratio × 회차 길이. 판정은 seconds ≥ 기준(소수 오차만 봐준다)
export const needSeconds = (s) => (Number(s.ratio) * (Number(s.endsAt) - Number(s.startsAt))) / 1000;
export const isFullWatch = (seconds, s) => Number(seconds) + 1e-6 >= needSeconds(s);

// 추첨권 주문 묶음 — 회차 · 사람마다 하나(1장 = 1건, 같은 orderId 로 ×N). 사이트 손 지급 · 인벤토리 묶음과 같은 글자
//    음성 날도 같은 식 — sid "voice:<YYYY-MM-DD>" 라 "goedam:voice:<날짜>:<userId>"(약속 문서 추가 절 3)
export const ticketOrderId = (sid, userId) => `goedam:${sid}:${userId}`;

// ── 음성 활동(순수 함수) ─────────────────────────
// KST 날짜 "YYYY-MM-DD" · 그날 0시(ms). KST 는 서머타임이 없어 9시간을 더하고 빼면 된다
export const kstDayKey = (ms) => new Date(Number(ms) + KST_MS).toISOString().slice(0, 10);
export const kstDayStart = (ms) => Math.floor((Number(ms) + KST_MS) / DAY_MS) * DAY_MS - KST_MS;
// GoedamWatch.sid · 화면 이름(「음성 10. 30.」 — 사이트 명단과 같은 글자) · Purchase.adminNote
export const voiceSid = (key) => `voice:${key}`;
export const voiceDayLabel = (key) => `${Number(String(key).slice(5, 7))}. ${Number(String(key).slice(8, 10))}.`;
export const voiceTicketNote = (minutes, key) => `괴담회 음성 ${minutes}분 · ${voiceDayLabel(key)}`;

// 📌 지금 볼 음성 날 — 어제 · 오늘(KST) 중 기간과 겹치는 날. [{ key, sid, from, to, settled }]
//    셀 구간 [from, to) = 그날 [0시, 다음 0시) ∩ 기간 [startsAt, endsAt). 오늘은 구간이 열린 뒤부터, 지난날은 구간 끝 + 6시간까지(GRANT_STOP_MS — 상영과 같다).
//    settled = 구간 끝 + 2분이 지났다(그 날 합이 더 늘지 않는다 — 한 번 다 돌면 voiceDone)
export function voiceDays(now, voice) {
  const out = [];
  if (!voice) return out;
  const t = Number(now);
  const today = kstDayStart(t);
  for (const start of [today - DAY_MS, today]) {
    const from = Math.max(start, Number(voice.startsAt));
    const to = Math.min(start + DAY_MS, Number(voice.endsAt));
    if (!(to > from) || t < from || t >= to + GRANT_STOP_MS) continue;
    const key = kstDayKey(start);
    out.push({ key, sid: voiceSid(key), from, to, settled: t >= to + VOICE_SETTLE_MS });
  }
  return out;
}

// 📌 그 구간 사람마다 음성 초 — XpLog { reason: "voice" } 를 userId 로 묶어 s(sec 있는 줄의 합) · old(sec 없는 옛 줄 수)를 센다(daySeconds 가 합친다).
//    XpLog 는 바퀴가 끝날 때(5분을 채움 · 나감 · 옮김) 남는 줄이라 날짜는 그 줄을 적은 때(createdAt)로 가른다 — 사이트 lib/questKinds.js 하루 음성 분과 같은 기준.
//    📌 채널 조건은 아직 없다(음성 XP 기록 전부) — 추후 voice.channels 를 더하면 $match 에 { $or: [{ channelId: { $in } }, { pc: { $in } }] } 를 붙인다
export const voiceDayPipeline = (from, to) => [
  { $match: { reason: "voice", createdAt: { $gte: new Date(from), $lt: new Date(to) } } },
  { $group: { _id: "$userId", s: { $sum: "$sec" }, old: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$sec", null] }, null] }, 1, 0] } } } },
];
// 한 사람 그날 초(정수) — sec 합 + 옛 줄 × 300. 0.1초 단위 줄을 더한 값이라 아주 작은 오차는 찬 것으로 본다
export const daySeconds = (g) =>
  Math.floor(Math.max(0, Number(g?.s) || 0) + Math.max(0, Math.floor(Number(g?.old) || 0)) * LEGACY_VOICE_SEC + 1e-6);
export const voiceNeedSeconds = (voice) => Number(voice.minutes) * 60;
// 기준을 넘은 사람 — [{ userId, seconds }](seconds ≥ minutes × 60, 딱 맞아도 준다). userId 없는 줄은 뺀다
export function voiceQualifiers(groups, voice) {
  const need = voiceNeedSeconds(voice);
  const out = [];
  for (const g of groups || []) {
    const userId = String(g?._id || "");
    if (!userId) continue;
    const seconds = daySeconds(g);
    if (seconds >= need) out.push({ userId, seconds });
  }
  return out;
}

// 지급 갈래 — { sid, note(Purchase.adminNote), label(로그) }. 주문 묶음은 둘 다 ticketOrderId(sid, userId)
export const screeningGrant = (s) => ({ sid: s.sid, note: `괴담회 완청 · ${s.title || s.sid}`, label: s.title || s.sid });
export const voiceGrant = (key, voice) => ({ sid: voiceSid(key), note: voiceTicketNote(voice.minutes, key), label: `음성 ${voiceDayLabel(key)}` });
// 다 돈 지난날 표시 — 기준 · 장 수 · 구간이 바뀌면 다시 본다
const voiceDoneKey = (day, voice) => `${day.sid}|${voice.minutes}|${voice.tickets}|${day.from}|${day.to}`;

// ── 구간 ─────────────────────────────────────

const nameOf = (member) => member?.user?.username || "";
// 기록하는 채널 — 꺼져 있거나 채널이 비면 ""(기록 안 함)
const activeChannel = () => (cfg?.enabled && cfg.channelId ? cfg.channelId : "");

function warnOnce(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(msg);
}

// 닫힌 구간 하나를 회차마다 겹친 만큼 pending 에 넣는다
function addSpan(userId, name, from, to) {
  if (!cfg) return;
  const start = Math.max(from, to - SEG_MAX_MS);
  for (const { sid, ms } of splitByScreenings(start, to, cfg.screenings)) {
    const key = `${userId}|${sid}`;
    let p = pending.get(key);
    if (!p) pending.set(key, (p = { userId, sid, name: "", ms: 0 }));
    p.ms += ms;
    if (name) p.name = name;
  }
}

// 열린 구간을 지금까지 끊어 넣고 그 자리에서 이어 간다
function cut(userId, now) {
  const s = sessions.get(userId);
  if (!s) return;
  addSpan(userId, s.name, s.since, now);
  s.since = now;
}
function close(userId, now) {
  cut(userId, now);
  sessions.delete(userId);
}
function open(userId, member, now) {
  if (sessions.has(userId)) return; // 같은 들어옴이 두 번 와도 처음 시각 그대로
  sessions.set(userId, { since: now, name: nameOf(member) });
}

// 지금 채널에 있는 사람(봇 제외)부터 센다 — 처음 읽은 때 · 채널이 바뀐 때 · 20초마다(들어옴을 놓친 사람)
function seed(now) {
  const ch = activeChannel();
  if (!ch || !guildRef) return;
  for (const [userId, vs] of guildRef.voiceStates.cache) {
    if (vs.channelId !== ch || vs.member?.user?.bot) continue;
    open(userId, vs.member, now);
  }
}

// 20초마다 — 열린 구간을 모두 끊고 놓친 이벤트를 메운다. 세션은 있는데 채널에 없으면(나감을 놓침) 지난 구간은 버린다(voiceTime.js 와 같다)
function sweep(now) {
  const ch = activeChannel();
  if (!ch) {
    for (const userId of [...sessions.keys()]) close(userId, now);
    return;
  }
  for (const [userId, s] of [...sessions]) {
    const vs = guildRef?.voiceStates.cache.get(userId);
    if (guildRef && vs?.channelId !== ch) {
      sessions.delete(userId);
      continue;
    }
    if (vs?.member) s.name = nameOf(vs.member) || s.name;
    cut(userId, now);
  }
  seed(now);
}

// 새 설정을 건다 — 바뀌기 전 설정(회차 · 채널)으로 지금까지를 먼저 센다. 채널이 바뀌었거나 켜고 꺼지면 구간을 새로 연다
function applyConfig(next) {
  const now = Date.now();
  const before = activeChannel();
  for (const userId of [...sessions.keys()]) cut(userId, now);
  cfg = next;
  const after = activeChannel();
  if (before === after) return;
  sessions.clear();
  if (after) seed(now);
  console.log(after ? `🎬 괴담회 시청 기록 켜짐 — 채널 ${after} (지금 ${sessions.size}명)` : "🎬 괴담회 시청 기록 꺼짐");
}

export async function refreshGoedam() {
  if (refreshing) return;
  refreshing = true;
  try {
    applyConfig(normalizeGoedam(await Goedam.findOne({ key: GOEDAM_KEY }).lean()));
  } catch (e) {
    console.error("괴담회 설정 갱신 오류:", e?.message || e); // 직전 값을 그대로 쓴다
  } finally {
    refreshing = false;
  }
}

// ── 쓰기 ─────────────────────────────────────

let indexJob = null;
const ensureWatchIndexes = () =>
  (indexJob ||= GoedamWatch.createIndexes().catch((e) => {
    indexJob = null;
    throw e;
  }));

// 쌓인 시간을 GoedamWatch 에 더한다 — 초 단위로 반올림해 쓰고 나머지(±0.5초)는 다음 번으로 넘긴다(연이어 머문 사람은 회차 길이가 그대로 맞는다).
//    📌 꺼진 뒤(enabled false)에도 켜져 있던 동안 잰 몫은 마저 쓴다 — 새로 재지는 않는다(sweep 이 구간을 닫았다)
//    📌 쓰기 실패 — 실패한 줄(writeErrors)만 되돌려 다음 번에 다시. 무엇이 들어갔는지 모르면(연결 오류) 전부 되돌린다:
//       응답만 잃은 경우 그만큼 두 번 셀 수 있지만, 덜 세어 완청을 놓치는 쪽보다 낫다(음성 시간과 반대 — 여기는 기준선 판정이라)
async function writePending(now) {
  const batch = [];
  for (const [key, p] of pending) {
    const sec = Math.round(p.ms / 1000);
    if (sec > 0) {
      batch.push({ key, p, sec });
      p.ms -= sec * 1000;
      continue;
    }
    // 더 늘 일이 없는 나머지는 버린다 — 채널에 없거나 회차가 끝났거나 지워졌다(맵이 쌓이지 않게)
    const s = cfg?.screenings.find((x) => x.sid === p.sid);
    if (!sessions.has(p.userId) || !s || now >= s.endsAt) pending.delete(key);
  }
  if (!batch.length) return;
  const at = new Date(now);
  const ops = batch.map(({ p, sec }) => ({
    updateOne: {
      filter: { eventKey: GOEDAM_KEY, sid: p.sid, userId: p.userId },
      update: {
        $inc: { seconds: sec },
        $set: { updatedAt: at, ...(p.name ? { userName: p.name } : {}) },
        $setOnInsert: { grantedAt: null, granted: 0, manual: false },
      },
      upsert: true,
    },
  }));
  try {
    await ensureWatchIndexes();
    await GoedamWatch.bulkWrite(ops, { ordered: false });
  } catch (e) {
    const errs = e?.writeErrors || e?.result?.getWriteErrors?.() || null;
    const failed = Array.isArray(errs) && errs.length ? errs.map((w) => w.index ?? w.err?.index) : batch.map((_, i) => i);
    for (const i of failed) {
      const b = batch[i];
      if (!b) continue;
      b.p.ms += b.sec * 1000;
      pending.set(b.key, b.p);
    }
    throw e;
  }
}

// ── 지급 ─────────────────────────────────────

// 지급할 추첨권 아이템 — { id, name } | null(비었거나 실사이트에 없음 — 지급을 미룬다). 이름은 설정의 스냅샷, 비었으면 아이템 이름
async function ticketItem() {
  const id = cfg?.ticketItemId || "";
  if (!OBJECT_ID_RE.test(id)) {
    warnOnce("ticket:none", "🎟️ 괴담회 추첨권 아이템이 지정되지 않아 지급을 미룹니다 (관리 › 괴담회)");
    return null;
  }
  const it = await Item.findById(id, { name: 1 }).lean();
  if (!it) {
    warnOnce(`ticket:${id}`, `🎟️ 괴담회 추첨권 아이템을 찾을 수 없어 지급을 미룹니다: ${id}`);
    return null;
  }
  return { id, name: cfg.ticketItemName || it.name || DEFAULT_TICKET_NAME };
}

// 추첨권 count 건을 넣는다 — 약속 문서 「키 · 표식」의 모양 그대로(1장 = Purchase 1건, 지급 큐를 거치지 않는 completed · DM 없음).
//    g: 지급 갈래(screeningGrant · voiceGrant) — orderId · adminNote 만 다르다
async function insertTickets(row, g, item, count) {
  if (!(count > 0)) return;
  const at = new Date();
  const doc = {
    userId: row.userId,
    userName: row.userName || "",
    itemId: GOEDAM_TICKET_ITEM_ID,
    itemRef: item.id,
    itemName: item.name,
    itemType: "item",
    roleId: "",
    price: 0,
    payMethod: "xp",
    paidXp: 0,
    paidPoint: 0,
    days: 0,
    status: "completed",
    processedAt: at,
    orderId: ticketOrderId(g.sid, row.userId),
    adminNote: g.note,
    createdAt: at,
  };
  await Purchase.insertMany(Array.from({ length: count }, () => ({ ...doc })));
}

// 이미 들어간 장 수를 orderId 로 세어 모자란 만큼만 넣는다 — 되돌린 뒤 다시 할 때 · 못다 준 줄을 채울 때 두 번 주지 않게. 돌려주는 값: 넣은 장 수
async function fillTickets(row, g, item, want) {
  const have = await Purchase.countDocuments({ userId: row.userId, orderId: ticketOrderId(g.sid, row.userId) });
  const short = Math.max(0, want - have);
  await insertTickets(row, g, item, short);
  return short;
}

// 못다 준 줄 — 표시(grantedAt)는 있는데 추첨권이 granted 보다 적은 줄(봇 지급만 — 손 지급(manual)은 사이트 몫). 상영 회차 · 음성 날 둘 다(g.sid)
async function auditGrants(g, item, now) {
  const rows = await GoedamWatch.find(
    { eventKey: GOEDAM_KEY, sid: g.sid, grantedAt: { $ne: null, $lte: new Date(now - AUDIT_GRACE_MS) }, manual: { $ne: true }, granted: { $gt: 0 } },
    { userId: 1, userName: 1, granted: 1 }
  ).lean();
  if (!rows.length) return;
  const counts = await Purchase.aggregate([
    { $match: { userId: { $in: rows.map((r) => r.userId) }, orderId: { $in: rows.map((r) => ticketOrderId(g.sid, r.userId)) } } },
    { $group: { _id: "$orderId", n: { $sum: 1 } } },
  ]);
  const have = new Map(counts.map((c) => [c._id, c.n]));
  for (const r of rows) {
    const short = Math.floor(Number(r.granted) || 0) - (have.get(ticketOrderId(g.sid, r.userId)) || 0);
    if (short <= 0) continue;
    await insertTickets(r, g, item, short);
    console.log(`🎟️ 괴담회 추첨권 채움: ${r.userName || r.userId} ← ${item.name} ×${short} (${g.label})`);
  }
}

// 회차 하나 지급 — 완청 · 아직 안 받은 줄을 조건부로 세운 뒤(손 지급 · 다른 봇과 겹쳐도 한 번만) 추첨권을 넣는다.
//    넣지 못하면 표시를 되돌려 다음 주기에 다시(이미 들어간 건은 fillTickets 가 세어 모자란 만큼만). 실패하면 이 회차는 이번 주기에 멈춘다
async function grantScreening(s, item, now) {
  const g = screeningGrant(s);
  const need = needSeconds(s) - 1e-6;
  const rows = await GoedamWatch.find({ eventKey: GOEDAM_KEY, sid: s.sid, grantedAt: null, seconds: { $gte: need } }, { userId: 1, userName: 1, seconds: 1 }).lean();
  for (const r of rows) {
    const at = new Date();
    const claim = await GoedamWatch.updateOne(
      { _id: r._id, grantedAt: null, seconds: { $gte: need } },
      { $set: { grantedAt: at, granted: s.tickets, updatedAt: at } }
    );
    if (!claim.modifiedCount) continue; // 그새 다른 쪽(손 지급 · 다른 봇)이 세웠다
    try {
      const n = await fillTickets(r, g, item, s.tickets);
      console.log(`🎟️ 괴담회 추첨권 지급: ${r.userName || r.userId} ← ${item.name} ×${n} (${g.label} · ${Math.floor(r.seconds)}초)`);
    } catch (e) {
      await GoedamWatch.updateOne({ _id: r._id, grantedAt: at, manual: { $ne: true } }, { $set: { grantedAt: null, granted: 0 } }).catch(() => {});
      throw e;
    }
  }
  if (now - (auditAt.get(g.sid) || 0) >= AUDIT_MS) {
    await auditGrants(g, item, now);
    auditAt.set(g.sid, now);
  }
}

// 끝 + 60초 ~ 끝 + 6시간 회차를 지급한다(켜져 있을 때만). 그 회차의 아직 못 쓴 초가 있으면 다 쓴 뒤로 미룬다
async function grantDue(now) {
  if (!cfg?.enabled) return;
  const due = cfg.screenings.filter((s) => now >= s.endsAt + GRANT_DELAY_MS && now < s.endsAt + GRANT_STOP_MS);
  if (!due.length) return;
  const item = await ticketItem();
  if (!item) return;
  warned.clear(); // 아이템이 돌아왔다 — 다음에 또 비면 다시 알린다
  for (const s of due) {
    if ([...pending.values()].some((p) => p.sid === s.sid && Math.round(p.ms / 1000) > 0)) continue;
    try {
      await grantScreening(s, item, now);
    } catch (e) {
      console.error(`🎟️ 괴담회 추첨권 지급 오류 (${s.title || s.sid}):`, e?.message || e);
      recordBotError(e);
    }
  }
}

// ── 음성 활동 지급(2026-10-24) ─────────────────────

// 디스코드 username — 길드 캐시 먼저, 없으면 UserXp.username. 모르면 빠진다(""로 쓴다 — GoedamWatch.userName · Purchase.userName 과 같은 값)
async function usernames(ids) {
  const out = new Map();
  const miss = [];
  for (const id of ids) {
    const u = guildRef?.members.cache.get(id)?.user?.username;
    if (u) out.set(id, u);
    else miss.push(id);
  }
  if (miss.length) {
    const docs = await UserXp.find({ userId: { $in: miss } }, { userId: 1, username: 1 }).lean();
    for (const d of docs) if (d.username) out.set(d.userId, d.username);
  }
  return out;
}

// 📌 음성 추첨권 DM(2026-10-26 운영자 "60분 채워서 할로윈 추첨권 받으면 갠디 알람 · 이미지로 어떻게 하는지 · 바로 뽑기 화면 링크") —
//    관리 › 봇 메시지 「괴담회 음성 추첨권」 틀(뽑는 법 그림 public/notices/goedam-draw-guide.png) + 아래 「뽑기 하러 가기」 단추(사이트 뽑기 창 /level?event=goedam).
//    이번에 새로 넣은 장 수가 있을 때만(못다 준 줄 채우기 · 손 지급은 보내지 않는다). 끈 틀(null) · 멤버 못 찾음 · DM 막힘은 조용히 넘어간다(지급은 이미 끝났다)
const DRAW_PATH = "/level?event=goedam";
async function dmVoiceTicket(userId, item, count, minutes) {
  if (!guildRef || !(count > 0)) return;
  const member = guildRef.members.cache.get(userId) || (await guildRef.members.fetch(userId).catch(() => null));
  if (!member || member.user?.bot) return;
  const msg = buildMessage("goedamVoiceTicket", { ...commonVars(member, member.guild), item: item.name, count, minutes });
  if (!msg) return;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("뽑기 하러 가기").setURL(`${SITE_URL}${DRAW_PATH}`));
  await member.send({ ...msg, components: [row] }).catch(() => {});
}

// 음성 날 하나 — 그날 기준을 넘은 사람의 줄(sid "voice:<날짜>")에 그날 합을 쓰고(새 줄 · 늘어난 줄만, $max), 아직 안 받은 줄을
//    { grantedAt: null } 조건부로 세운 뒤(손 지급 · 다른 봇과 겹쳐도 한 번만) 추첨권을 넣는다. 넣지 못하면 표시를 되돌려 다음 주기에 다시(grantScreening 과 같다).
//    돌려주는 값: 이번에 못다 준 줄까지 살폈나(지난날이면 voiceDone 에 넣는다)
async function grantVoiceDay(day, voice, item, now) {
  const g = voiceGrant(day.key, voice);
  const need = voiceNeedSeconds(voice);
  const hits = voiceQualifiers(await XpLog.aggregate(voiceDayPipeline(day.from, day.to)), voice);
  if (hits.length) {
    const rows = await GoedamWatch.find(
      { eventKey: GOEDAM_KEY, sid: g.sid, userId: { $in: hits.map((h) => h.userId) } },
      { userId: 1, userName: 1, seconds: 1, grantedAt: 1 }
    ).lean();
    const have = new Map(rows.map((r) => [r.userId, r]));
    const stale = hits.filter((h) => !(Number(have.get(h.userId)?.seconds) >= h.seconds));
    const todo = hits.filter((h) => have.get(h.userId)?.grantedAt == null);
    const names = await usernames([...new Set([...stale, ...todo].map((h) => h.userId))]);
    const nameOfId = (id) => names.get(id) || have.get(id)?.userName || "";
    if (stale.length) {
      const at = new Date();
      await ensureWatchIndexes();
      await GoedamWatch.bulkWrite(
        stale.map((h) => ({
          updateOne: {
            filter: { eventKey: GOEDAM_KEY, sid: g.sid, userId: h.userId },
            update: {
              $max: { seconds: h.seconds },
              $set: { updatedAt: at, ...(names.get(h.userId) ? { userName: names.get(h.userId) } : {}) },
              $setOnInsert: { grantedAt: null, granted: 0, manual: false },
            },
            upsert: true,
          },
        })),
        { ordered: false }
      );
    }
    for (const h of todo) {
      const row = { userId: h.userId, userName: nameOfId(h.userId) };
      const at = new Date();
      const claim = await GoedamWatch.updateOne(
        { eventKey: GOEDAM_KEY, sid: g.sid, userId: h.userId, grantedAt: null, seconds: { $gte: need } },
        { $set: { grantedAt: at, granted: voice.tickets, updatedAt: at } }
      );
      if (!claim.modifiedCount) continue; // 그새 다른 쪽(손 지급 · 다른 봇)이 세웠다
      try {
        const n = await fillTickets(row, g, item, voice.tickets);
        console.log(`🎟️ 괴담회 추첨권 지급: ${row.userName || row.userId} ← ${item.name} ×${n} (${g.label} · ${Math.floor(h.seconds / 60)}분)`);
        // 알림은 기다리지 않는다(DM 이 느려도 다음 사람 지급이 밀리지 않게) — 실패는 안에서 삼킨다
        dmVoiceTicket(h.userId, item, n, voice.minutes).catch((e) => console.error("🎟️ 괴담회 음성 추첨권 DM 오류:", e?.message || e));
      } catch (e) {
        await GoedamWatch.updateOne(
          { eventKey: GOEDAM_KEY, sid: g.sid, userId: h.userId, grantedAt: at, manual: { $ne: true } },
          { $set: { grantedAt: null, granted: 0 } }
        ).catch(() => {});
        throw e;
      }
    }
  }
  if (now - (auditAt.get(g.sid) || 0) < AUDIT_MS) return false;
  await auditGrants(g, item, now);
  auditAt.set(g.sid, now);
  return true;
}

// 5분마다 — 켜져 있고(enabled · voice.enabled) 볼 날(voiceDays — 기간 안의 오늘 · 끝 + 6시간 안의 어제)이 있으면 지급한다. 추첨권 아이템이 없으면 미룬다
async function grantVoice(now) {
  const voice = cfg?.voice;
  if (!cfg?.enabled || !voice?.enabled) return;
  const days = voiceDays(now, voice).filter((d) => !voiceDone.has(voiceDoneKey(d, voice)));
  if (!days.length) return;
  const item = await ticketItem();
  if (!item) return;
  warned.clear(); // 아이템이 돌아왔다 — 다음에 또 비면 다시 알린다
  for (const day of days) {
    try {
      const audited = await grantVoiceDay(day, voice, item, now);
      if (day.settled && audited) voiceDone.add(voiceDoneKey(day, voice));
    } catch (e) {
      console.error(`🎟️ 괴담회 추첨권 지급 오류 (음성 ${voiceDayLabel(day.key)}):`, e?.message || e);
      recordBotError(e);
    }
  }
}

// ── 문화상품권 안내 DM(2026-10-28) ─────────────────
// 📌 운영자 "현재 문화상품권 뽑은 인원들에게 해당 안내사항 갠디로 · 추후 뽑는 인원들도 마찬가지로" — 1분마다 안내를 아직 안 보낸 문화상품권(kind "code") 당첨 줄을 찾아
//    관리 › 봇 메시지 「괴담회 문화상품권 안내」를 DM 으로. 핀번호는 싣지 않는다(당첨 화면 · 내 당첨에서 본다).
//    줄마다 { noticeAt: null } 조건부로 먼저 세운 뒤 보낸다(재시작 · 겹친 봇에도 한 번만). 서버를 나간 사람 · DM 막힘은 까닭(noticeError)만 적고 다시 두드리지 않는다.
//    지급 전(granted false — 관리자가 다시 지급할 줄)은 기다린다. 틀을 꺼 두었거나 디스코드 조회가 잠깐 실패하면 표시를 되돌려 다음에 다시
const NOTICE_MS = 60 * 1000;
const NOTICE_BATCH = 20;
const GONE_CODES = new Set([10007, 10013]); // Unknown Member · Unknown User
async function noticeGifts() {
  if (!guildRef) return;
  const rows = await GoedamDraw.find(
    { eventKey: GOEDAM_KEY, kind: "code", granted: true, noticeAt: null },
    { userId: 1, userName: 1, prizeName: 1 }
  ).sort({ createdAt: 1 }).limit(NOTICE_BATCH).lean();
  for (const r of rows) {
    const claim = await GoedamDraw.updateOne({ _id: r._id, noticeAt: null }, { $set: { noticeAt: new Date() } });
    if (!claim.modifiedCount) continue; // 그새 다른 쪽이 보냈다
    const undo = () => GoedamDraw.updateOne({ _id: r._id }, { $set: { noticeAt: null } }).catch(() => {});
    let member = guildRef.members.cache.get(r.userId) || null;
    if (!member) {
      try {
        member = await guildRef.members.fetch(r.userId);
      } catch (e) {
        if (!GONE_CODES.has(e?.code)) {
          await undo(); // 잠깐 실패 — 다음 주기에 다시
          return;
        }
      }
    }
    if (!member) {
      await GoedamDraw.updateOne({ _id: r._id }, { $set: { noticeError: "no-member" } }).catch(() => {});
      continue;
    }
    const msg = buildMessage("goedamGiftNotice", { ...commonVars(member, member.guild), prize: r.prizeName || "문화상품권" });
    if (!msg) {
      await undo(); // 관리자가 꺼 두었다 — 켜면 그때 보낸다
      return;
    }
    const ok = await member.send(msg).then(() => true).catch(() => false);
    if (ok) console.log(`🎟️ 괴담회 문화상품권 안내 DM: ${r.userName || r.userId}`);
    else await GoedamDraw.updateOne({ _id: r._id }, { $set: { noticeError: "dm" } }).catch(() => {});
  }
}

// ── 게임 그룹 지원 승인 DM(2026-10-30) ─────────────
// 📌 운영자 "괴담회 그룹 문상 주는 것도 봇 메시지 · 승인도 가" — 1분마다 승인된 그룹(GoedamGroup approved)의 번호 줄(GoedamGiftCode — 멤버마다 한 장) 중
//    DM 을 아직 안 보낸 줄을 찾아 그 멤버에게 한 통: 「게임 그룹 지원 승인」 + 「괴담회 문화상품권 안내」(켜져 있으면) 임베드 · 「번호 확인하러 가기」 단추(/level?event=group).
//    핀번호는 싣지 않는다. 승인 중(번호만 잡히고 아직 review)인 그룹은 보지 않는다 — 승인이 끝난 그룹만.
//    줄마다 { noticeAt: null } 조건부로 먼저 세운 뒤 보낸다(noticeGifts 와 같은 결). 「게임 그룹 지원 승인」을 꺼 두면 줄을 건드리지 않는다 — 켜면 그때 보낸다
const GROUP_PATH = "/level?event=group";
const GROUP_GAP_MS = 1500; // 한 통씩 — 여러 그룹을 한꺼번에 승인해도 디스코드가 스팸으로 막지 않게
const EMBEDS_MAX = 10; // 디스코드 한 메시지 임베드 수 · 글자 합 한도
const EMBED_CHARS_MAX = 6000;
const embedChars = (list) => list.reduce((s, e) => s + embedLength(e?.data ?? e), 0);
async function noticeGroups() {
  if (!guildRef) return;
  if (!currentTemplate("goedamGroupApprove")) return;
  const groups = await GoedamGroup.find({ status: "approved" }, { name: 1 }).lean();
  if (!groups.length) return;
  const nameOf = new Map(groups.map((g) => [String(g._id), g.name || ""]));
  const rows = await GoedamGiftCode.find(
    { groupId: { $in: [...nameOf.keys()] }, userId: { $type: "string" }, noticeAt: null },
    { groupId: 1, userId: 1 }
  ).sort({ assignedAt: 1, _id: 1 }).limit(NOTICE_BATCH).lean();
  for (const r of rows) {
    const claim = await GoedamGiftCode.updateOne({ _id: r._id, groupId: r.groupId, userId: r.userId, noticeAt: null }, { $set: { noticeAt: new Date() } });
    if (!claim.modifiedCount) continue; // 그새 다른 쪽이 보냈다
    const undo = () => GoedamGiftCode.updateOne({ _id: r._id }, { $set: { noticeAt: null } }).catch(() => {});
    let member = guildRef.members.cache.get(r.userId) || null;
    if (!member) {
      try {
        member = await guildRef.members.fetch(r.userId);
      } catch (e) {
        if (!GONE_CODES.has(e?.code)) {
          await undo(); // 잠깐 실패 — 다음 주기에 다시
          return;
        }
      }
    }
    if (!member) {
      await GoedamGiftCode.updateOne({ _id: r._id }, { $set: { noticeError: "no-member" } }).catch(() => {});
      continue;
    }
    const base = commonVars(member, member.guild);
    const msg = buildMessage("goedamGroupApprove", { ...base, group: nameOf.get(r.groupId) || "게임 그룹" });
    if (!msg) {
      await undo(); // 그새 틀이 꺼졌다 — 켜면 그때 보낸다
      return;
    }
    // 사용 안내는 틀이 켜져 있고 한 메시지 한도 안일 때만 붙인다(넘치면 승인 글만)
    const embeds = [...(msg.embeds || [])];
    const guide = buildMessage("goedamGiftNotice", { ...base, prize: "문화상품권" })?.embeds || [];
    if (guide.length && embeds.length + guide.length <= EMBEDS_MAX && embedChars([...embeds, ...guide]) <= EMBED_CHARS_MAX) embeds.push(...guide);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("번호 확인하러 가기").setURL(`${SITE_URL}${GROUP_PATH}`));
    const ok = await member.send({ ...msg, embeds, components: [row] }).then(() => true).catch(() => false);
    if (ok) console.log(`🎟️ 게임 그룹 지원 승인 DM: ${member.user?.username || r.userId} (${nameOf.get(r.groupId)})`);
    else await GoedamGiftCode.updateOne({ _id: r._id }, { $set: { noticeError: "dm" } }).catch(() => {});
    await new Promise((res) => setTimeout(res, GROUP_GAP_MS));
  }
}

// ── 주기 ─────────────────────────────────────

function tick() {
  const now = Date.now();
  try {
    sweep(now);
  } catch (e) {
    console.error("괴담회 시청 구간 오류:", e?.message || e);
  }
  if (busy) return; // 앞 쓰기가 아직 돈다 — 구간은 위에서 끊어 두었으니 다음 번에 같이 쓴다
  busy = true;
  (async () => {
    try {
      await writePending(now);
    } catch (e) {
      console.error("괴담회 시청 기록 쓰기 오류:", e?.message || e);
      recordBotError(e);
    }
    // 상영 지급이 멈춰도(아이템 읽기 오류 등) 음성 지급은 따로 돈다
    await grantDue(now).catch((e) => console.error("괴담회 지급 주기 오류:", e?.message || e));
    // 음성 활동은 5분마다(같은 줄에서 돌아 상영 쓰기 · 지급과 겹치지 않는다)
    if (cfg && now - voiceAt >= VOICE_MS) {
      voiceAt = now;
      await grantVoice(now);
    }
  })()
    .catch((e) => console.error("괴담회 지급 주기 오류:", e?.message || e))
    .finally(() => {
      busy = false;
    });
}

// ClientReady 에서 켠다 — 설정을 처음 읽으면 채널에 이미 있는 사람부터 센다(applyConfig)
export function startGoedamWatch(client) {
  if (started) return;
  started = true;
  guildRef = client.guilds.cache.get(config.guildId) || null;

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const ch = activeChannel();
    if (!ch) return;
    const userId = newState.id;
    const member = newState.member || oldState.member;
    if (!userId || member?.user?.bot) return;
    if (!guildRef) guildRef = newState.guild;
    const was = oldState.channelId === ch;
    const is = newState.channelId === ch;
    if (was === is) return; // 그 채널 안에서 마이크 · 화면 · 발언자/청중이 바뀐 것(또는 다른 채널끼리) — 구간은 그대로
    const now = Date.now();
    if (was) close(userId, now); // 나감 · 다른 채널로 옮김
    if (is) open(userId, member, now); // 들어옴(다른 채널에서 옮겨 옴 포함)
  });

  refreshGoedam();
  setInterval(refreshGoedam, REFRESH_MS);
  setInterval(tick, FLUSH_MS);
  // 문화상품권 안내 DM — 켜지고 20초 뒤 한 번(그동안 쌓인 당첨자), 그 뒤 1분마다
  const notice = () => noticeGifts().catch((e) => console.error("🎟️ 괴담회 문화상품권 안내 DM 오류:", e?.message || e));
  setTimeout(notice, 20_000);
  setInterval(notice, NOTICE_MS);
  // 게임 그룹 지원 승인 DM — 같은 주기(한 번에 하나만 돌게 — 한 통씩 쉬어 가서 1분을 넘길 수 있다)
  let groupBusy = false;
  const groupNotice = () => {
    if (groupBusy) return;
    groupBusy = true;
    noticeGroups()
      .catch((e) => console.error("🎟️ 게임 그룹 지원 승인 DM 오류:", e?.message || e))
      .finally(() => {
        groupBusy = false;
      });
  };
  setTimeout(groupNotice, 25_000);
  setInterval(groupNotice, NOTICE_MS);
  console.log(
    `✅ 괴담회 시청 기록 시작 — 스테이지 채널 머문 시간 ${FLUSH_MS / 1000}초마다 기록 · 회차 끝 + 60초 완청 추첨권 지급 · 하루 음성 ${VOICE_MS / 60000}분마다 확인 (설정 1분 주기)`
  );
}
