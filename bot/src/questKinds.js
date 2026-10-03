// ── 퀘스트 규칙 한 벌(봇 사본) — 대상 · 세는 방식 · 조건 · 진행도 계산 ──
//    ⚠️ 아래 "공용 블록" 은 사이트 lib/questKinds.js 와 글자 하나까지 같아야 한다 (봇은 별도 배포라 import 불가).
//    봇은 /퀘스트 카드(views/quests.js)에서 computeQuestState 로 읽기만 한다 — 수령 · 지급은 사이트에서.

// ═══ 공용 블록 시작 — lib/questKinds.js 와 bot/src/questKinds.js 의 이 구간은 글자 하나까지 같아야 한다 ═══

// src — 진행도를 어디서 세나
//   log     : XpLog(봇 XP 지급 로그) — 채팅(쿨타임을 지나 XP 받은 메시지) · 음성(지급 주기 1회) · 출석 · 아이템 효과 · 전체
//   act     : ActivityStat(봇이 세는 활동 — bot/src/features/activityStats.js) — 메시지(쿨타임 무관) · 답장 · 멘션 · 반응 · 스레드 · 스티커 ·
//             봇 명령어 · 음성 입장 · 레벨 업. 2026-10-03부터 쌓인다
//   streak  : UserXp.attendStreak — 이 기간 안에 출석한 경우 마지막 출석 날의 연속 출석 일수(기간 안 출석이 없으면 0)
//   shop    : Purchase — ARCTIC 상품 구매 줄(주문 묶음 + 상품 = 1건). 운영진 지급 · 패스 보상 · 환불 · 취소 제외. 쓴 XP · 빙옥 합도
//   enhance : WalletLog kind "enhance" — 강화 1단계 = 1회
//   pass    : 시즌 패스 보상 받은 개수 — Payout(source "pass") · Purchase("season-pass") · WalletLog("pass-point")
//   quest   : QuestClaim — 이 기간에 받은 다른 퀘스트 보상 수(자기 자신은 빼고)
// metrics — 그 대상에서 고를 수 있는 세는 방식(첫 번째가 기본)
// ch: 채널 조건(채널 · 카테고리) · voice: 음성 조건(인원 · 화면 공유/캠 · 마이크) · hint: 고르기 목록 옆 한 줄
//   시간대 · 요일은 log · act 대상 전부
export const QUEST_REASONS = [
  { v: "chat", l: "채팅", src: "log", metrics: ["count", "xp", "day", "run", "channel"], ch: true, hint: "XP 받은 메시지" },
  { v: "voice", l: "음성", src: "log", metrics: ["count", "xp", "minute", "day", "run", "channel"], ch: true, voice: true, hint: "지급 주기 1회" },
  { v: "attend", l: "출석", src: "log", metrics: ["count", "xp", "day", "run"] },
  { v: "effect", l: "아이템 효과", src: "log", metrics: ["count", "xp", "day", "run"] },
  { v: "any", l: "전체", src: "log", metrics: ["count", "xp", "day", "run"], hint: "모든 XP 지급" },
  { v: "msg", l: "메시지", src: "act", metrics: ["count", "day", "run", "channel"], ch: true, hint: "쿨타임 무관" },
  { v: "reply", l: "답장하기", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "replied", l: "답장 받기", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "mention", l: "멘션하기", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "react", l: "반응 달기", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "reacted", l: "반응 받기", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "threadmsg", l: "스레드 대화", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "threadnew", l: "스레드 · 포럼 글", src: "act", metrics: ["count", "day", "run", "channel"], ch: true, hint: "새로 만들기" },
  { v: "sticker", l: "스티커", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "cmd", l: "봇 명령어", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "vjoin", l: "음성 채널 입장", src: "act", metrics: ["count", "day", "run", "channel"], ch: true },
  { v: "levelup", l: "레벨 업", src: "act", metrics: ["count", "day"] },
  { v: "streak", l: "연속 출석", src: "streak", metrics: ["day"] },
  { v: "shop", l: "ARCTIC 구매", src: "shop", metrics: ["count", "xp", "point"] },
  { v: "enhance", l: "강화", src: "enhance", metrics: ["count"] },
  { v: "pass", l: "패스 보상", src: "pass", metrics: ["count"] },
  { v: "quest", l: "퀘스트 완료", src: "quest", metrics: ["count"], hint: "다른 퀘스트 보상 받기" },
];
export const QUEST_REASON_KEYS = QUEST_REASONS.map((r) => r.v);

// count: 횟수(건 · 개) · xp: XP 합(ARCTIC 은 쓴 XP) · minute: 음성 접속 분(로그 건수 × 지급 주기) · day: 서로 다른 날 수(KST, 하루 기준을 두면 그 이상인 날만) ·
// run: 가장 길게 이어진 날 수(연속) · channel: 서로 다른 채널 수 · point: 쓴 빙옥 합(ARCTIC)
export const QUEST_METRICS = [
  { v: "count", l: "횟수" },
  { v: "xp", l: "XP 합계" },
  { v: "minute", l: "접속 시간" },
  { v: "day", l: "일수" },
  { v: "run", l: "연속 일수" },
  { v: "channel", l: "채널 수" },
  { v: "point", l: "빙옥 합계" },
];
export const QUEST_METRIC_KEYS = QUEST_METRICS.map((m) => m.v);
export const QUEST_PERIODS = ["daily", "weekly", "monthly"];
export const QUEST_DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export const questReasonOf = (v) => QUEST_REASONS.find((r) => r.v === v) || null;
// 모르는 대상(옛 문서 · 손으로 넣은 값)은 예전처럼 "전체" 로그로 센다
export const questSrc = (reason) => questReasonOf(reason)?.src || "log";
// 시간대 · 요일을 걸 수 있는 대상(시각이 남는 기록)
export const questTimed = (reason) => {
  const s = questSrc(reason);
  return s === "log" || s === "act";
};

// 📌 시간대 — KST 시각. from < to: from ≤ 시 < to · from > to: 자정을 넘는 구간(22~2) · 둘 중 하나라도 없거나 같으면 하루 종일.
//    아이템 효과 시간대(lib/itemEffects.js)와 같은 규칙
export const hasQuestHours = (q) => q?.hourFrom != null && q?.hourTo != null && Number(q.hourFrom) !== Number(q.hourTo);
export const inQuestHours = (h, from, to) => (from < to ? h >= from && h < to : h >= from || h < to);
// 요일 — 0 일 … 6 토. 비었거나 일곱 개 다면 매일
const questDays = (q) => {
  const d = Array.isArray(q?.days) ? q.days.map(Number).filter((x) => x >= 0 && x <= 6) : [];
  return d.length > 0 && d.length < 7 ? new Set(d) : null;
};
const dowOf = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();

// 진행/목표 뒤에 붙는 단위 — 사이트 퀘스트 목록 · 봇 /퀘스트 카드가 같은 값을 쓴다(API 행의 unit)
export function questUnit(q) {
  const m = q?.metric;
  if (m === "xp") return "XP";
  if (m === "point") return "빙옥";
  if (m === "minute") return "분";
  if (m === "day" || m === "run" || q?.reason === "streak") return "일";
  if (m === "channel") return "곳";
  if (q?.reason === "shop") return "건";
  if (q?.reason === "pass" || q?.reason === "quest") return "개";
  return "회";
}

const toHour = (v, max) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : null;
};
const num = (v, def, { min = 0, max = 1_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};
const CH_ID_RE = /^\d{5,25}$/;

// 📌 저장 전 정리 — 받은 값에서 조건 칸만. 대상에 없는 세는 방식은 그 대상의 기본으로,
//    시간대 · 요일은 log · act 대상에서만, 채널은 ch 대상에서만, 음성 조건은 음성에서만, 하루 기준은 일수(day)에서만 남긴다(나머지는 비운다)
export function normalizeQuestCond(b) {
  const r = questReasonOf(b?.reason) || QUEST_REASONS[0];
  const metric = r.metrics.includes(b?.metric) ? b.metric : r.metrics[0];
  const timed = r.src === "log" || r.src === "act";
  let hourFrom = null;
  let hourTo = null;
  if (timed) {
    const hf = toHour(b?.hourFrom, 23);
    const ht = toHour(b?.hourTo, 24);
    if (hf != null && ht != null && hf !== ht) {
      hourFrom = hf;
      hourTo = ht;
    }
  }
  let days = [];
  if (timed && Array.isArray(b?.days)) {
    days = [...new Set(b.days.map((x) => Math.floor(Number(x))).filter((x) => x >= 0 && x <= 6))].sort((x, y) => x - y);
    if (days.length === 7) days = [];
  }
  const channelIds = r.ch && Array.isArray(b?.channelIds)
    ? [...new Set(b.channelIds.map((x) => String(x || "").trim()).filter((x) => CH_ID_RE.test(x)))].slice(0, 20)
    : [];
  const minPeople = r.voice ? num(b?.minPeople, 0, { min: 0, max: 50 }) : 0;
  return {
    reason: r.v,
    metric,
    hourFrom,
    hourTo,
    days,
    channelIds,
    minPeople: minPeople >= 2 ? minPeople : 0,
    live: !!(r.voice && b?.live === true),
    micOn: !!(r.voice && b?.micOn === true),
    dayMin: timed && metric === "day" ? num(b?.dayMin, 0, { min: 0, max: 1_000_000 }) : 0,
  };
}

// 📌 퀘스트 한 건 저장 모양 — 관리자 등록(app/api/daily-quest POST)과 추천 퀘스트 등록(app/api/admin/quests/presets)이 같이 쓴다.
//    name 이 비면 "" 그대로 — 부르는 쪽이 거절한다
export function normalizeQuestDoc(b) {
  const period = QUEST_PERIODS.includes(b?.period) ? b.period : "daily";
  // 📌 일일 퀘스트에 연속 일수(run)는 1을 넘을 수 없다 — 그 대상의 기본 방식으로 바꿔 저장한다(관리 화면도 흐리게 막는다)
  const cond = normalizeQuestCond(period === "daily" && b?.metric === "run" ? { ...b, metric: "" } : b);
  return {
    name: String(b?.name || "").trim().slice(0, 40),
    desc: String(b?.desc || "").trim().slice(0, 120),
    period,
    ...cond,
    target: num(b?.target, 1, { min: 1, max: 1_000_000 }),
    rewardXp: num(b?.rewardXp, 0, { min: 0, max: 1_000_000 }),
    // 저장하는 값이 지급 기본값이다 — 수령 때 아이템 퀘스트 보너스만 더한다(등급 배율 없음)
    rewardPoint: num(b?.rewardPoint, 0, { min: 0, max: 1_000_000 }),
    enabled: b?.enabled !== false,
    order: num(b?.order, 0, { min: 0, max: 999 }),
  };
}

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
const daysLabel = (q) => {
  const d = questDays(q);
  if (!d) return "";
  const k = [...d].sort((x, y) => x - y).join(",");
  return k === "0,6" ? "주말" : k === "1,2,3,4,5" ? "평일" : [...d].sort((x, y) => x - y).map((x) => QUEST_DAY_LABELS[x]).join("·");
};

// 조건 한 줄 — 관리 화면 표 · 추천 퀘스트 창. 예: "채팅 30회" · "주말 · 22~2시 · 3명 이상 음성 60분" · "#자유 메시지 50회" ·
//    "음성 하루 60분 이상 5일" · "답장하기 3일 연속" · "ARCTIC에서 빙옥 10 쓰기". chName(id) 를 주면 채널 이름으로 적는다
export function questCondLabel(q, chName) {
  // 📌 "전체"만으로는 무엇을 세는지 안 보여 조건 줄에서는 "전체 활동"으로 적는다(대상 고르기 목록은 "전체" 그대로)
  const r = questReasonOf(q?.reason);
  const name = !r || r.v === "any" ? "전체 활동" : r.l;
  const t = fmt(q?.target);
  const pre = [];
  const dl = daysLabel(q);
  if (dl) pre.push(dl);
  if (hasQuestHours(q)) pre.push(`${q.hourFrom}~${q.hourTo}시`);
  const chs = Array.isArray(q?.channelIds) ? q.channelIds : [];
  if (r?.ch && chs.length) {
    const first = chName ? chName(chs[0]) : "";
    pre.push(first ? `${first}${chs.length > 1 ? ` 외 ${chs.length - 1}곳` : ""}` : `채널 ${chs.length}곳`);
  }
  if (r?.voice && Number(q?.minPeople) >= 2) pre.push(`${q.minPeople}명 이상`);
  if (r?.voice && q?.live) pre.push("화면 공유 · 캠");
  if (r?.voice && q?.micOn) pre.push("마이크 켜고");
  const head = pre.length ? `${pre.join(" · ")} · ` : "";
  if (q?.reason === "streak") return `연속 출석 ${t}일`;
  if (q?.reason === "shop" && q?.metric === "xp") return `ARCTIC에서 XP ${t} 쓰기`;
  if (q?.reason === "shop" && q?.metric === "point") return `ARCTIC에서 빙옥 ${t} 쓰기`;
  if (q?.metric === "xp") return `${head}${name} XP ${t}`;
  if (q?.metric === "day") {
    const min = Math.floor(Number(q?.dayMin) || 0);
    return min > 0 ? `${head}${name} 하루 ${fmt(min)}${q?.reason === "voice" ? "분" : "회"} 이상 ${t}일` : `${head}${name} 일수 ${t}일`;
  }
  if (q?.metric === "run") return `${head}${name} ${t}일 연속`;
  if (q?.metric === "channel") return `${head}${name} 채널 ${t}곳`;
  return `${head}${name} ${t}${questUnit(q)}`;
}

// ── KST 경계 — lib/kst.js 와 같은 식(사이트) · 봇은 이 블록을 그대로 쓴다 ──
const KST_MS = 9 * 60 * 60 * 1000;
const kstNow = () => new Date(Date.now() + KST_MS);
const toUtc = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0) - KST_MS);
const kstDayStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};
const kstWeekStart = () => {
  const n = kstNow();
  const dow = (n.getUTCDay() + 6) % 7; // 월=0 … 일=6
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - dow);
};
const kstMonthStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), 1);
};
const kstToday = () => kstNow().toISOString().slice(0, 10);
const kstDateKey = (d) => new Date(new Date(d).getTime() + KST_MS).toISOString().slice(0, 10);
// 주기별 잠금 키 — daily "2026-08-31" · weekly "2026-W0831"(주 시작 월요일) · monthly "2026-08"
export const questPeriodKey = (period) => {
  if (period === "monthly") return kstToday().slice(0, 7);
  if (period === "weekly") {
    const ws = new Date(kstWeekStart().getTime() + KST_MS);
    return `${ws.getUTCFullYear()}-W${ws.toISOString().slice(5, 10).replace("-", "")}`;
  }
  return kstToday();
};

// ── 주기별 무작위 노출 — 시드를 "주기:기간키"로 고정해 (a) 모두 같은 세트 (b) 새로고침해도 그대로 (c) 날짜가 바뀌면 다시 뽑힌다 ──
const seedFrom = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// 시드로 섞기 — 후보 순서를 _id로 먼저 고정해 DB가 돌려주는 순서가 결과를 바꾸지 않게 한다
export function shuffleQuests(list, seedKey) {
  const pool = [...list].sort((a, b) => (String(a._id) < String(b._id) ? -1 : 1));
  const rand = mulberry32(seedFrom(seedKey));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}
export function pickQuests(list, count, seedKey) {
  if (!count || count <= 0 || list.length <= count) return list;
  return shuffleQuests(list, seedKey).slice(0, count);
}

// ── 진행도 계산 ───────────────────────────────────────
// 📌 ARCTIC 구매로 세는 상태 — 대기 · 완료 · 만료(팔린 뒤 기간이 끝난 것). 환불 · 취소는 되돌린 거래라 뺀다.
//    상점 상품 id(ObjectId 24자)만 구매다 — 운영진 지급 · 역할 이전("grant") · 시즌 패스 보상("season-pass")은 고정 글자라 걸러진다
const SOLD_STATUS = ["pending", "completed", "expired"];
const SHOP_ID_RE = /^[0-9a-f]{24}$/i;
const PASS_ITEM_ID = "season-pass";
// 주문 내역 한 줄 키 — lib/orderGroups.js orderKeyOf 와 같다(주문 묶음 + 상품 = 1건)
const orderKeyOf = (r) => (r?.orderId ? `o:${r.orderId}|${r.itemId}` : `p:${r?._id}`);
// XpLog 사유 → 퀘스트 대상 — 레벨업 효과 지급(effect-levelup)도 "아이템 효과"로 센다
const logReason = (r) => (r === "effect-levelup" ? "effect" : r);
const DAY_MS = 24 * 60 * 60 * 1000;
// 가장 길게 이어진 날 수 — 날짜 글자("YYYY-MM-DD") 목록
const longestRun = (keys) => {
  const ts = [...new Set(keys)].map((d) => Date.parse(`${d}T00:00:00Z`)).sort((a, b) => a - b);
  let best = 0;
  let cur = 0;
  for (let i = 0; i < ts.length; i++) {
    cur = i > 0 && ts[i] - ts[i - 1] === DAY_MS ? cur + 1 : 1;
    if (cur > best) best = cur;
  }
  return best;
};

// 📌 로그 · 활동 대상 진행도 — bks 는 (대상 · KST 날짜 · KST 시 · 채널 · 카테고리 · 음성 상황) 묶음. 퀘스트마다 DB 를 다시 읽지 않고 여기서 거른다.
//    fromKey: 기간 시작의 KST 날짜("YYYY-MM-DD") — 날짜 글자끼리 견준다
export function questMeasure(bks, q, fromKey, tickMin) {
  const r = questReasonOf(q?.reason);
  const src = r?.src || "log";
  const want = r ? r.v : "any";
  const hours = hasQuestHours(q);
  const hf = Number(q.hourFrom);
  const ht = Number(q.hourTo);
  const days = questDays(q);
  const chs = r?.ch && Array.isArray(q.channelIds) && q.channelIds.length ? new Set(q.channelIds.map(String)) : null;
  const voice = !!r?.voice;
  const minP = voice ? Math.floor(Number(q.minPeople) || 0) : 0;
  let n = 0;
  let xp = 0;
  const perDay = new Map();
  const chans = new Set();
  for (const b of bks) {
    if (b.d < fromKey) continue;
    if (src === "log" ? want !== "any" && logReason(b.r) !== want : b.r !== want) continue;
    if (hours && !inQuestHours(b.h, hf, ht)) continue;
    if (days && !days.has(dowOf(b.d))) continue;
    if (chs && !chs.has(String(b.ch || "")) && !chs.has(String(b.pc || ""))) continue;
    // 음성 상황 — 지급 로그 ctx(2026-10-01 19:05 부터). 기록이 없는 옛 줄은 조건에 맞지 않는 것으로 친다
    if (minP >= 2 && !(Number(b.cn) >= minP)) continue;
    if (voice && q.live && b.lv !== true) continue;
    if (voice && q.micOn && !(b.mu === false && b.df === false)) continue;
    n += b.n || 0;
    xp += b.xp || 0;
    perDay.set(b.d, (perDay.get(b.d) || 0) + (b.n || 0));
    if (b.ch) chans.add(String(b.ch));
  }
  if (q.metric === "xp") return xp;
  if (q.metric === "minute") return n * tickMin;
  if (q.metric === "day") {
    const min = Math.floor(Number(q.dayMin) || 0);
    if (!(min > 0)) return perDay.size;
    // 하루 기준 — 음성은 분, 나머지는 횟수
    let c = 0;
    for (const v of perDay.values()) if ((want === "voice" ? v * tickMin : v) >= min) c++;
    return c;
  }
  if (q.metric === "run") return longestRun([...perDay.keys()]);
  if (q.metric === "channel") return chans.size;
  return n;
}

// 시각(ms) 목록 → 기간 시작 이후 개수
const countSince = (times, startMs) => times.reduce((s, t) => s + (t >= startMs ? 1 : 0), 0);

// 📌 ARCTIC 구매 시각 — 주문 내역 한 줄(주문 묶음 + 상품)이 1건. 1개 단위 상품을 한 결제에서 여러 개 사도 1건이다. 묶음의 첫 구매 시각으로 센다
function shopTimes(rows) {
  const first = new Map();
  for (const p of rows) {
    if (!SHOP_ID_RE.test(String(p.itemId || ""))) continue;
    const key = orderKeyOf(p);
    const t = new Date(p.createdAt).getTime();
    if (!first.has(key) || t < first.get(key)) first.set(key, t);
  }
  return [...first.values()];
}

// 📌 퀘스트 상태 — 사이트 조회(GET) · 수령 검증(POST) · 봇 /퀘스트 카드가 모두 이 함수 하나를 쓴다(M = 각자의 mongoose 모델).
//    클라이언트가 보낸 진행도는 절대 믿지 않고 기록으로 매번 다시 센다.
//    M: { DailyQuest, QuestClaim, XpLog, UserXp, BotSetting, Purchase, WalletLog, Payout, ActivityStat, QuestPick }
//    📌 쓰기는 QuestPick(유저별 노출 목록, 주기마다 처음 열 때 한 번) 하나뿐 — 나머지는 읽기만
//    읽기: 1차(퀘스트 · 수령 · 유저 · 설정) → 뽑기 → 2차(뽑힌 퀘스트가 필요로 하는 기록만 — 채널 · 음성 조건이 있으면 그 칸까지 묶는다)
export async function computeQuestState(M, userId) {
  const PERIODS = QUEST_PERIODS;
  const dayStart = kstDayStart();
  const weekStart = kstWeekStart();
  const monthStart = kstMonthStart();
  const keys = { daily: questPeriodKey("daily"), weekly: questPeriodKey("weekly"), monthly: questPeriodKey("monthly") };
  const startMs = { daily: dayStart.getTime(), weekly: weekStart.getTime(), monthly: monthStart.getTime() };
  const startKey = { daily: kstDateKey(dayStart), weekly: kstDateKey(weekStart), monthly: kstDateKey(monthStart) };
  // 📌 주가 지난달에 시작하면(달이 바뀌는 주) 주 시작부터 읽어야 한다 — 둘 중 이른 쪽부터
  const since = new Date(Math.min(startMs.monthly, startMs.weekly));
  const sinceKey = kstDateKey(since);

  const [quests, claims, user, setting, snaps, legacy] = await Promise.all([
    M.DailyQuest.find({ enabled: true }).sort({ order: 1, createdAt: 1 }).lean(),
    M.QuestClaim.find({ userId, date: { $in: Object.values(keys) } }, { questId: 1, date: 1 }).lean(),
    M.UserXp.findOne({ userId }, { lastAttendDate: 1, attendCount: 1, attendStreak: 1 }).lean(),
    M.BotSetting.findOne(
      { key: "main" },
      { attendXp: 1, attendVoiceMin: 1, voiceIntervalSec: 1, questPickDaily: 1, questPickWeekly: 1, questPickMonthly: 1 }
    ).lean(),
    // 이번 주기 내 목록 + 주기마다 직전 기록(겹치지 않게 고르는 데 쓴다) — 최근 것부터
    M.QuestPick ? M.QuestPick.find({ u: userId }, { _id: 0, key: 1, per: 1, ids: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(12).lean() : [],
    // 📌 바꾸기 전(모두 같은 목록) 방식으로 이미 보여 주던 주기 — 배포 때 그 목록을 u "*" 로 고정해 뒀다. 그 주기가 끝날 때까지 그대로 이어 쓴다
    M.QuestPick ? M.QuestPick.find({ key: { $in: PERIODS.map((per) => `${per}:${keys[per]}:*`) } }, { _id: 0, key: 1, ids: 1 }).lean() : [],
  ]);
  const claimed = new Set(claims.map((c) => `${c.date}::${c.questId}`));
  const tickMin = Math.max(1, Math.round((setting?.voiceIntervalSec ?? 300) / 60));

  // ── 유저별 노출 — 주기마다 유저마다 따로 뽑아 그 주기 끝까지 고정한다(QuestPick "주기:기간키:유저") ──
  //    📌 2026-10-03 사용자: "유저마다 랜덤 3개 · 웬만해서 이전과 중복되는 퀘스트가 뜨지 않게 골고루" · "신규 퀘스트를 추가하면 기존 유저들에 영향이 없는 건 당연".
  //       (예전엔 모든 유저가 같은 세트를 봤고, 저장하지 않아 주기 중간에 퀘스트를 추가 · 켜거나 노출 개수를 바꾸면 그 자리에서 다시 뽑혔다)
  //       · 그 주기에 처음 연 순간 뽑아 저장한다 — 이후 퀘스트를 추가 · 켜거나 노출 개수를 바꿔도 이 주기 목록은 그대로(다음 초기화부터)
  //       · 후보는 이 주기가 시작되기 전에 만든 퀘스트만 — 주기 중간에 만든 퀘스트는 아직 안 연 유저에게도 다음 초기화부터
  //       · 직전 주기에 받은 퀘스트는 맨 뒤, 그 전 주기에 받은 것은 그다음으로 미룬 뒤 무작위(유저 · 주기 시드) — 후보가 넉넉하면 연달아 겹치지 않는다
  //       · 일일 퀘스트에 요일 조건이 있으면 그 요일이 아닌 날은 뽑지 않는다 · 끄거나 지운 퀘스트는 그 자리에서 빠진다(채우지 않는다)
  //       · 이름 · 목표 · 보상 수정은 바로 반영(같은 퀘스트라서)
  const picks = { daily: setting?.questPickDaily || 0, weekly: setting?.questPickWeekly || 0, monthly: setting?.questPickMonthly || 0 };
  const grouped = { daily: [], weekly: [], monthly: [] };
  for (const q of quests) grouped[PERIODS.includes(q.period) ? q.period : "daily"].push(q);
  const todayDow = dowOf(kstToday());
  // ObjectId 앞 8자리 = 만든 시각(초)
  const madeAt = (q) => {
    const hex = String(q?._id || "").slice(0, 8);
    return /^[0-9a-f]{8}$/i.test(hex) ? parseInt(hex, 16) * 1000 : 0;
  };
  const pool = {};
  const selected = [];
  for (const per of PERIODS) {
    const key = `${per}:${keys[per]}:${userId}`;
    const all = grouped[per];
    const mine = snaps.filter((s) => s.per === per);
    let ids = mine.find((s) => s.key === key)?.ids;
    const carried = legacy.find((s) => s.key === `${per}:${keys[per]}:*`)?.ids;
    if (!Array.isArray(ids) && Array.isArray(carried)) ids = carried.map(String);
    else if (!Array.isArray(ids)) {
      const cand = all.filter((q) => {
        if (madeAt(q) >= startMs[per]) return false;
        if (per !== "daily") return true;
        const d = questDays(q);
        return !d || d.has(todayDow);
      });
      // 직전 기록 — 가장 최근 주기에 받은 것일수록 뒤로(2 · 1), 처음 보는 것 0
      const past = mine.filter((s) => s.key !== key).slice(0, 2);
      const seen = new Map();
      past.forEach((s, i) => (s.ids || []).forEach((id) => { if (!seen.has(String(id))) seen.set(String(id), 2 - i); }));
      const n = picks[per] > 0 ? picks[per] : cand.length;
      const mixed = shuffleQuests(cand, key); // 유저 · 주기 시드로 섞기
      mixed.sort((x, y) => (seen.get(String(x._id)) || 0) - (seen.get(String(y._id)) || 0)); // 안정 정렬 — 같은 칸 안은 섞인 순서 그대로
      ids = mixed.slice(0, n).map((q) => String(q._id));
    }
    // 이 주기 내 목록이 아직 없으면 저장한다(이어 쓴 목록도 — 다음 주기에 겹치지 않게 고를 때 쓴다).
    //    먼저 넣은 쪽이 이긴다($setOnInsert) — 사이트 · 봇이 동시에 처음 열어도 같은 목록을 쓰게 다시 읽는다
    if (!mine.some((s) => s.key === key) && M.QuestPick) {
      try {
        await M.QuestPick.updateOne({ key }, { $setOnInsert: { key, u: userId, per, ids, createdAt: new Date() } }, { upsert: true });
        const saved = await M.QuestPick.findOne({ key }, { ids: 1 }).lean();
        if (Array.isArray(saved?.ids)) ids = saved.ids;
      } catch {
        // 저장 실패 — 이번 응답은 방금 뽑은 목록으로(다음 요청이 다시 저장한다)
      }
    }
    const idSet = new Set(ids.map(String));
    const chosen = all.filter((q) => idSet.has(String(q._id)));
    // 표시 순서는 관리자가 정한 order 그대로
    chosen.sort((a, b) => (a.order || 0) - (b.order || 0) || (String(a._id) < String(b._id) ? -1 : 1));
    pool[per] = { total: all.length, shown: chosen.length, pick: picks[per] };
    selected.push(...chosen);
  }

  // ── 2차 — 뽑힌 퀘스트가 필요로 하는 것만 ──
  const need = new Set(selected.map((q) => questSrc(q.reason)));
  // 📌 지급 로그 묶음 — 오늘 음성 분(화면 안내)을 위해 늘 읽는다. 채널 · 음성 조건 · 채널 수가 걸린 퀘스트가 있을 때만 그 칸까지 묶는다(묶음 수가 늘지 않게)
  const logQs = selected.filter((q) => questSrc(q.reason) === "log");
  const byCh = logQs.some((q) => (Array.isArray(q.channelIds) && q.channelIds.length) || q.metric === "channel");
  const byVoice = logQs.some((q) => q.reason === "voice" && (Number(q.minPeople) >= 2 || q.live || q.micOn));
  const gid = {
    r: "$reason",
    d: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: "+09:00" } },
    h: { $hour: { date: "$createdAt", timezone: "+09:00" } },
    // 스레드 채팅은 부모 채널(pt)로 — 활동 횟수(ActivityStat)와 같은 기준
    ...(byCh ? { ch: { $ifNull: ["$pt", "$channelId"] }, pc: "$pc" } : {}),
    ...(byVoice ? { cn: "$ctx.n", lv: "$ctx.live", mu: "$ctx.mute", df: "$ctx.deaf" } : {}),
  };
  const wantPurchase = need.has("shop") || need.has("pass");
  const wantWallet = need.has("enhance") || need.has("pass");
  const [buckets, acts, purchases, wallet, passPayouts, questClaims] = await Promise.all([
    M.XpLog.aggregate([
      { $match: { userId, createdAt: { $gte: since } } },
      { $group: { _id: gid, n: { $sum: 1 }, xp: { $sum: "$amount" } } },
    ]),
    need.has("act") && M.ActivityStat
      ? M.ActivityStat.find({ u: userId, d: { $gte: sinceKey } }, { _id: 0, k: 1, d: 1, h: 1, ch: 1, pc: 1, n: 1 }).lean()
      : [],
    wantPurchase
      ? M.Purchase.find(
          { userId, createdAt: { $gte: since }, status: { $in: SOLD_STATUS } },
          { itemId: 1, orderId: 1, createdAt: 1, paidXp: 1, paidPoint: 1 }
        ).lean()
      : [],
    wantWallet
      ? M.WalletLog.find({ userId, createdAt: { $gte: since }, kind: { $in: ["enhance", "pass-point"] } }, { kind: 1, amount: 1, createdAt: 1 }).lean()
      : [],
    need.has("pass") ? M.Payout.find({ userId, source: "pass", createdAt: { $gte: since } }, { createdAt: 1 }).lean() : [],
    need.has("quest") ? M.QuestClaim.find({ userId, createdAt: { $gte: since } }, { questId: 1, createdAt: 1 }).lean() : [],
  ]);
  const logs = buckets.map((b) => {
    const k = b._id || {};
    return { r: k.r || "", d: k.d || "", h: Number(k.h) || 0, ch: k.ch || "", pc: k.pc || "", cn: k.cn, lv: k.lv, mu: k.mu, df: k.df, n: b.n || 0, xp: b.xp || 0 };
  });
  const actBks = acts.map((a) => ({ r: a.k || "", d: a.d || "", h: Number(a.h) || 0, ch: a.ch || "", pc: a.pc || "", n: a.n || 0, xp: 0 }));

  // 📌 오늘 음성 누적 분 — 화면 안내용(voice 로그 건수 × 간격)
  const voiceMin = questMeasure(logs, { reason: "voice", metric: "minute" }, startKey.daily, tickMin);

  const ms = (d) => new Date(d).getTime();
  const shopRows = purchases.filter((p) => SHOP_ID_RE.test(String(p.itemId || "")));
  const times = {
    shop: shopTimes(purchases),
    // 강화 1단계 = 원장 한 줄(차감). 되돌려 준 줄(+)은 세지 않는다
    enhance: wallet.filter((w) => w.kind === "enhance" && w.amount < 0).map((w) => ms(w.createdAt)),
    // 📌 패스 보상 개수 — XP(Payout) · 역할 · 아이템(Purchase "season-pass")은 보상마다 한 줄, 빙옥은 한 번 받기에 합계 한 줄(app/api/pass/claim)
    pass: [
      ...passPayouts.map((p) => ms(p.createdAt)),
      ...purchases.filter((p) => p.itemId === PASS_ITEM_ID).map((p) => ms(p.createdAt)),
      ...wallet.filter((w) => w.kind === "pass-point" && w.amount > 0).map((w) => ms(w.createdAt)),
    ],
  };
  const shopSum = (field, start) => shopRows.reduce((s, p) => s + (ms(p.createdAt) >= start ? Math.max(0, Number(p[field]) || 0) : 0), 0);
  // 📌 연속 출석 — 이 기간 안에 출석했을 때만 마지막 출석 날의 연속 일수(attendStreak 는 다음 출석 때까지 그 날 값 그대로다).
  //    기간 밖 출석으로는 세지 않는다. 연속 기록이 생기기 전 문서(0)는 출석한 날을 1일로 본다(봇 attend.js 와 같다)
  const streakIn = (per) =>
    user?.lastAttendDate && user.lastAttendDate >= startKey[per] ? Math.max(1, Math.floor(Number(user.attendStreak) || 0)) : 0;

  const rows = selected.map((q) => {
    const per = PERIODS.includes(q.period) ? q.period : "daily";
    const src = questSrc(q.reason);
    const id = String(q._id);
    const target = Math.max(1, Math.floor(Number(q.target) || 1));
    const raw =
      src === "streak" ? streakIn(per)
      : src === "log" ? questMeasure(logs, q, startKey[per], tickMin)
      : src === "act" ? questMeasure(actBks, q, startKey[per], tickMin)
      : src === "shop" ? (q.metric === "xp" ? shopSum("paidXp", startMs[per]) : q.metric === "point" ? shopSum("paidPoint", startMs[per]) : countSince(times.shop, startMs[per]))
      : src === "quest" ? questClaims.reduce((s, c) => s + (String(c.questId) !== id && ms(c.createdAt) >= startMs[per] ? 1 : 0), 0)
      : countSince(times[src] || [], startMs[per]);
    const current = Math.min(raw, target);
    const done = current >= target;
    const isClaimed = claimed.has(`${keys[per]}::${id}`);
    const rewardXp = Math.max(0, Number(q.rewardXp) || 0);
    // 화면에 적는 POINT 는 등록한 값 — 아이템 퀘스트 보너스가 붙으면 실지급액은 수령 응답(claimed.point)이 알려 준다
    const rewardPoint = Math.max(0, Number(q.rewardPoint) || 0);
    const hours = hasQuestHours(q);
    return {
      id,
      builtin: false,
      period: per,
      name: q.name || "",
      desc: q.desc || "",
      reason: q.reason,
      metric: q.metric,
      // 진행/목표 뒤 단위(회 · 분 · 일 · 곳 · 건 · 개 · XP · 빙옥) — 사이트 목록 · 봇 카드가 그대로 붙인다
      unit: questUnit(q),
      hourFrom: hours ? q.hourFrom : null,
      hourTo: hours ? q.hourTo : null,
      target,
      rewardXp,
      rewardPoint,
      current,
      done,
      claimed: isClaimed,
      // 보상이 0인 퀘스트는 '목표'일 뿐이라 수령 버튼을 띄우지 않는다. XP 든 POINT 든 하나라도 있으면 받을 수 있어야 한다
      claimable: done && (rewardXp > 0 || rewardPoint > 0) && !isClaimed,
    };
  });

  return {
    date: kstToday(),
    keys,
    voiceMin, // 오늘 음성 접속 누적 분 (UI 안내용)
    attendCount: user?.attendCount || 0,
    lastAttendDate: user?.lastAttendDate || "",
    // 주기별 등록 수/노출 수 — 화면에서 "오늘의 퀘스트 3개" 같은 안내에 쓴다
    pool,
    quests: rows,
  };
}

// ═══ 공용 블록 끝 ═══
