// 📌 퀘스트 조건 종류 — 무엇을 세나(reason) · 어떻게 세나(metric) · 시간대(hourFrom/hourTo, 선택).
//    모델(models/DailyQuest.js) · 진행 계산(lib/quests.js) · 저장 정리(app/api/daily-quest) · 관리 화면(app/admin/bot 퀘스트 탭) ·
//    추천 목록(lib/questPresets.js)이 이 파일 하나를 본다.
//    ⚠️ 봇 사본 bot/src/views/quests.js 의 questUnit · inHours · 진행 계산도 같은 규칙이다 — 여기를 바꾸면 거기도 같이.
//    서버 · 화면 양쪽에서 import 하므로 DB · React 의존이 없어야 한다.

// src — 진행도를 어디서 세나
//   log     : XpLog(봇 지급 로그) — 채팅 · 음성 · 출석 · 아이템 효과(effect · effect-levelup) · 전체. 시간대 조건은 여기만
//   streak  : UserXp.attendStreak — 이 기간 안에 출석한 경우 마지막 출석 날의 연속 출석 일수(기간 안 출석이 없으면 0)
//   shop    : Purchase — ARCTIC 상품 구매 줄(주문 묶음 + 상품 = 1건). 운영진 지급 · 패스 보상 · 환불 · 취소 제외
//   enhance : WalletLog kind "enhance" — 강화 1단계 = 1회
//   pass    : 시즌 패스 보상 받은 개수 — Payout(source "pass") · Purchase("season-pass") · WalletLog("pass-point")
// metrics — 그 대상에서 고를 수 있는 세는 방식(첫 번째가 기본)
export const QUEST_REASONS = [
  { v: "chat", l: "채팅", src: "log", metrics: ["count", "xp", "day"] },
  { v: "voice", l: "음성", src: "log", metrics: ["count", "xp", "minute", "day"] },
  { v: "attend", l: "출석", src: "log", metrics: ["count", "xp", "day"] },
  { v: "effect", l: "아이템 효과", src: "log", metrics: ["count", "xp", "day"] },
  { v: "any", l: "전체", src: "log", metrics: ["count", "xp", "day"] },
  { v: "streak", l: "연속 출석", src: "streak", metrics: ["day"] },
  { v: "shop", l: "ARCTIC 구매", src: "shop", metrics: ["count"] },
  { v: "enhance", l: "강화", src: "enhance", metrics: ["count"] },
  { v: "pass", l: "패스 보상", src: "pass", metrics: ["count"] },
];
export const QUEST_REASON_KEYS = QUEST_REASONS.map((r) => r.v);

// count: 횟수(건 · 개) · xp: 받은 XP 합 · minute: 음성 접속 분(로그 건수 × 지급 주기) · day: 서로 다른 날 수(KST)
export const QUEST_METRICS = [
  { v: "count", l: "횟수" },
  { v: "xp", l: "XP 합계" },
  { v: "minute", l: "접속 시간" },
  { v: "day", l: "일수" },
];
export const QUEST_METRIC_KEYS = QUEST_METRICS.map((m) => m.v);

export const questReasonOf = (v) => QUEST_REASONS.find((r) => r.v === v) || null;
// 모르는 대상(옛 문서 · 손으로 넣은 값)은 예전처럼 "전체" 로그로 센다
export const questSrc = (reason) => questReasonOf(reason)?.src || "log";

// 📌 시간대 — KST 시각. from < to: from ≤ 시 < to · from > to: 자정을 넘는 구간(22~2) · 둘 중 하나라도 없거나 같으면 하루 종일.
//    아이템 효과 시간대(lib/itemEffects.js)와 같은 규칙
export const hasQuestHours = (q) => q?.hourFrom != null && q?.hourTo != null && Number(q.hourFrom) !== Number(q.hourTo);
export const inQuestHours = (h, from, to) => (from < to ? h >= from && h < to : h >= from || h < to);

// 진행/목표 뒤에 붙는 단위 — 사이트 퀘스트 목록 · 봇 /퀘스트 카드가 같은 값을 쓴다(API 행의 unit)
export function questUnit(q) {
  if (q?.metric === "xp") return "XP";
  if (q?.metric === "minute") return "분";
  if (q?.metric === "day" || q?.reason === "streak") return "일";
  if (q?.reason === "shop") return "건";
  if (q?.reason === "pass") return "개";
  return "회";
}

const toHour = (v, max) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : null;
};

// 📌 저장 전 정리 — 받은 값에서 조건 칸만 { reason, metric, hourFrom, hourTo } 로.
//    대상에 없는 세는 방식은 그 대상의 기본으로, 시간대는 로그 대상에서만 남긴다(나머지는 null)
export function normalizeQuestCond(b) {
  const r = questReasonOf(b?.reason) || QUEST_REASONS[0];
  const metric = r.metrics.includes(b?.metric) ? b.metric : r.metrics[0];
  let hourFrom = null;
  let hourTo = null;
  if (r.src === "log") {
    const hf = toHour(b?.hourFrom, 23);
    const ht = toHour(b?.hourTo, 24);
    if (hf != null && ht != null && hf !== ht) {
      hourFrom = hf;
      hourTo = ht;
    }
  }
  return { reason: r.v, metric, hourFrom, hourTo };
}

export const QUEST_PERIODS = ["daily", "weekly", "monthly"];
const num = (v, def, { min = 0, max = 1_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

// 📌 퀘스트 한 건 저장 모양 — 관리자 등록(app/api/daily-quest POST)과 추천 퀘스트 등록(app/api/admin/quests/presets)이 같이 쓴다.
//    name 이 비면 "" 그대로 — 부르는 쪽이 거절한다
export function normalizeQuestDoc(b) {
  return {
    name: String(b?.name || "").trim().slice(0, 40),
    desc: String(b?.desc || "").trim().slice(0, 120),
    period: QUEST_PERIODS.includes(b?.period) ? b.period : "daily",
    ...normalizeQuestCond(b),
    target: num(b?.target, 1, { min: 1, max: 1_000_000 }),
    rewardXp: num(b?.rewardXp, 0, { min: 0, max: 1_000_000 }),
    // 저장하는 값이 지급 기본값이다 — 수령 때 아이템 퀘스트 보너스만 더한다(등급 배율 없음)
    rewardPoint: num(b?.rewardPoint, 0, { min: 0, max: 1_000_000 }),
    enabled: b?.enabled !== false,
    order: num(b?.order, 0, { min: 0, max: 999 }),
  };
}

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");

// 조건 한 줄 — 관리 화면 표 · 추천 퀘스트 창. 예: "채팅 30회" · "22~2시 채팅 10회" · "출석 일수 5일" · "연속 출석 3일" · "ARCTIC 구매 1건"
export function questCondLabel(q) {
  // 📌 "전체"만으로는 무엇을 세는지 안 보여 조건 줄에서는 "전체 활동"으로 적는다(대상 고르기 목록은 "전체" 그대로)
  const r = questReasonOf(q?.reason);
  const name = !r || r.v === "any" ? "전체 활동" : r.l;
  const t = fmt(q?.target);
  const hours = hasQuestHours(q) ? `${q.hourFrom}~${q.hourTo}시 ` : "";
  if (q?.reason === "streak") return `연속 출석 ${t}일`;
  if (q?.metric === "xp") return `${hours}${name} XP ${t}`;
  if (q?.metric === "day") return `${hours}${name} 일수 ${t}일`;
  return `${hours}${name} ${t}${questUnit(q)}`;
}
