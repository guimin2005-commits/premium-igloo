// 📌 아이템 효과 — 아이템(역할이 연결된 것)을 가진 사람에게 붙는 XP 효과의 정의 · 문구 · 값 검증 (사이트 공용).
//
//    저장 위치: 그 아이템 역할의 RoleConfig(roleId 기준). 봇이 이미 RoleConfig 를 1분마다 읽어 역할별 버프를 적용하므로
//    "역할을 가진 동안 효과" 가 그대로 성립한다(기간제 역할이 회수되면 효과도 끝).
//      · 기본 효과(옛 필드 그대로): buffXp = 채팅 · 음성 1회마다 +N XP, attendBuffXp = 출석할 때 +N XP
//      · 조건 효과: effects[] — 아래 TRIGGERS 중 하나 + 크기 + (선택) 요일 · 시간대 · 채널 조건
//    ⚠️ 봇(bot/src/roleConfigs.js · features/*)은 별도 배포라 이 파일을 import 하지 못한다 — 같은 규칙을 봇에 손으로 옮겨 둔다.
//       여기 상황(on) 값이나 의미를 바꾸면 봇도 반드시 함께 고칠 것.
//
//    효과 하나의 모양:
//      { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, days?: number[0-6], hourFrom?, hourTo?, channelIds?: string[] }
//      · days     : KST 요일(0=일 … 6=토). 비면 매일
//      · hourFrom/hourTo : KST 시각(0~23). from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2). 둘 다 비면 하루 종일
//      · channelIds : 채팅 · 음성 상황에서만 — 그 채널(또는 그 카테고리 안)에서만. 비면 모든 채널
//      · percent  : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%

export const TRIGGERS = [
  { v: "chat", l: "채팅할 때마다", modes: ["add", "percent"], channels: true },
  { v: "voice", l: "음성 XP 받을 때마다", modes: ["add", "percent"], channels: true },
  { v: "voiceDaily", l: "하루 음성 N분 채우면", modes: ["add"], needs: "minMinutes", once: true },
  { v: "firstChat", l: "하루 첫 채팅", modes: ["add"], once: true },
  { v: "attend", l: "출석할 때", modes: ["add"] },
  { v: "attendEvery", l: "출석 N번째마다", modes: ["add"], needs: "everyN" },
  { v: "levelUp", l: "레벨이 오를 때마다", modes: ["add"] },
];
export const TRIGGER_OF = Object.fromEntries(TRIGGERS.map((t) => [t.v, t]));

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const MAX_EFFECTS = 20;
const LIMIT = { add: 1_000_000, percent: 500, minutes: 1440, everyN: 365 };

const int = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};

// 저장 전 정리 — 모르는 상황 · 빈 값은 버린다. 서버(API)와 화면이 같은 규칙을 쓴다
export function normalizeEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, MAX_EFFECTS)) {
    const t = TRIGGER_OF[raw?.on];
    if (!t) continue;
    const mode = t.modes.includes(raw?.mode) ? raw.mode : t.modes[0];
    const amount = int(raw?.amount, 0, mode === "percent" ? LIMIT.percent : LIMIT.add);
    if (!amount) continue;
    const e = { id: String(raw?.id || "").slice(0, 24) || Math.random().toString(36).slice(2, 10), on: t.v, mode, amount };
    if (t.needs === "minMinutes") {
      const m = int(raw?.minMinutes, 1, LIMIT.minutes);
      if (!m) continue;
      e.minMinutes = m;
    }
    if (t.needs === "everyN") {
      const n = int(raw?.everyN, 2, LIMIT.everyN);
      if (!n) continue;
      e.everyN = n;
    }
    const days = Array.isArray(raw?.days) ? [...new Set(raw.days.map((d) => int(d, 0, 6)).filter((d) => d != null))].sort() : [];
    if (days.length && days.length < 7) e.days = days;
    const hf = raw?.hourFrom === "" || raw?.hourFrom == null ? null : int(raw.hourFrom, 0, 23);
    const ht = raw?.hourTo === "" || raw?.hourTo == null ? null : int(raw.hourTo, 0, 24);
    if (hf != null && ht != null && hf !== ht) { e.hourFrom = hf; e.hourTo = ht; }
    if (t.channels && Array.isArray(raw?.channelIds)) {
      const ch = [...new Set(raw.channelIds.map((c) => String(c || "").trim()).filter(Boolean))].slice(0, 20);
      if (ch.length) e.channelIds = ch;
    }
    out.push(e);
  }
  return out;
}

// 한 줄 설명 — 인벤토리 · 관리자 목록 · 미리보기에 같은 문장으로
//   예: "주말 · 22~2시 · 채팅할 때마다 +50%", "하루 음성 60분 채우면 +5,000 XP (하루 1번)"
export function describeEffect(e, channelName) {
  const t = TRIGGER_OF[e?.on];
  if (!t) return "";
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const cond = [];
  if (Array.isArray(e.days) && e.days.length) {
    const d = [...e.days].sort().join(",");
    cond.push(d === "0,6" ? "주말" : d === "1,2,3,4,5" ? "평일" : e.days.map((x) => DAY_LABELS[x]).join("·"));
  }
  if (e.hourFrom != null && e.hourTo != null) cond.push(`${e.hourFrom}~${e.hourTo}시`);
  if (Array.isArray(e.channelIds) && e.channelIds.length) {
    cond.push(e.channelIds.length === 1 && channelName ? `#${channelName}` : `지정 채널 ${e.channelIds.length}곳`);
  }
  let what = t.l;
  if (e.on === "voiceDaily") what = `하루 음성 ${fmt(e.minMinutes)}분 채우면`;
  if (e.on === "attendEvery") what = `출석 ${fmt(e.everyN)}번째마다`;
  const size = e.mode === "percent" ? `+${fmt(e.amount)}%` : `+${fmt(e.amount)} XP`;
  return [...cond, `${what} ${size}${t.once ? " (하루 1번)" : ""}`].join(" · ");
}

// 기본 효과 두 칸의 문장
export function describeBasic({ buffXp, attendBuffXp } = {}) {
  const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
  const out = [];
  if (Number(buffXp) > 0) out.push(`채팅 · 음성 1회마다 +${fmt(buffXp)} XP`);
  if (Number(attendBuffXp) > 0) out.push(`출석할 때 +${fmt(attendBuffXp)} XP`);
  return out;
}

// ── 조건 판정(사이트 미리보기 · 봇과 같은 규칙) ──
//    kst: { day: 0~6, hour: 0~23 }
export function effectTimeOk(e, kst) {
  if (Array.isArray(e.days) && e.days.length && !e.days.includes(kst.day)) return false;
  if (e.hourFrom != null && e.hourTo != null) {
    const h = kst.hour;
    const inRange = e.hourFrom < e.hourTo ? h >= e.hourFrom && h < e.hourTo : h >= e.hourFrom || h < e.hourTo;
    if (!inRange) return false;
  }
  return true;
}
