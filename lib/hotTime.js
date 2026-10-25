// 📌 핫타임 — 기간 안에는 채팅 · 음성의 「기본 XP + 강화(+ 음성 등급 가산)」에 배수를 곱한다(봇 bot/src/hotTime.js 와 같은 블록 — 아래 공용 블록은 글자 그대로 같게).
//    2026-10-14 운영자 「유령 펭귄의 초대」(할로윈 핫타임, 10/16 ~ 10/31): 금 · 토 · 일 2배 / 그 밖의 날 1.5배.
//    역할 버프 · 채널 부스트 · 기간제 부스트 · 아이템 효과에는 붙지 않는다(아이템 % 효과도 배수를 곱하기 전 기본 XP 에 붙는다).
//    날짜 · 요일은 KST. 설정은 BotSetting.hotTime*(관리 › 레벨 설정 「핫타임」) — 기간은 [hotTimeFrom, hotTimeUntil)
// ── 공용 블록 시작 (bot/src/hotTime.js 와 같게) ──
export const HOT_TIME_MAX_MULT = 5;
// 금(5) · 토(6) · 일(0) — KST 요일
export const HOT_TIME_WEEKEND = [5, 6, 0];
const hotMs = (d) => {
  if (d == null || d === "") return NaN;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : NaN;
};
const hotMult = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 1 ? Math.min(HOT_TIME_MAX_MULT, n) : 1;
};
// 지금 핫타임 — { on, mult, weekend, name, from, until }. 꺼짐 · 기간 밖이면 on false · mult 1
export function hotTimeState(s, now = Date.now()) {
  const from = hotMs(s?.hotTimeFrom);
  const until = hotMs(s?.hotTimeUntil);
  const name = String(s?.hotTimeName || "");
  const inRange = s?.hotTimeOn === true && Number.isFinite(from) && Number.isFinite(until) && from < until && now >= from && now < until;
  const weekend = HOT_TIME_WEEKEND.includes(new Date(now + 9 * 3600e3).getUTCDay());
  const mult = inRange ? hotMult(weekend ? s?.hotTimeWeekendMult : s?.hotTimeWeekdayMult) : 1;
  return { on: inRange && mult > 1, mult, weekend, name, from: Number.isFinite(from) ? from : null, until: Number.isFinite(until) ? until : null };
}
export const hotTimeMult = (s, now = Date.now()) => hotTimeState(s, now).mult;
// ── 공용 블록 끝 ──

// 📌 사이트만(봇에 없음) — 레벨 화면 핫타임 진행도 창(app/level/HotTime.js · /api/xp/hot-time). 2026-10-25 운영자 "클릭하면 핫타임 이벤트 진행도가 보이게"
//    평일 · 주말 배수(설정값)와 기간에 걸친 날(KST)마다 그날 배수. 기간이 길어도 92일까지만
const KST_MS = 9 * 3600e3;
const DAY_MS = 864e5;
export const hotTimeMults = (s) => ({ weekday: hotMult(s?.hotTimeWeekdayMult), weekend: hotMult(s?.hotTimeWeekendMult) });
export function hotTimeDays(s) {
  const from = hotMs(s?.hotTimeFrom);
  const until = hotMs(s?.hotTimeUntil);
  if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until) return [];
  const m = hotTimeMults(s);
  const first = Math.floor((from + KST_MS) / DAY_MS);
  const last = Math.floor((until - 1 + KST_MS) / DAY_MS); // 끝 시각은 기간 밖 — 자정에 끝나면 그 전날까지
  const out = [];
  for (let n = first; n <= last && out.length < 92; n++) {
    const t = new Date(n * DAY_MS); // KST 날짜를 UTC 칸으로 읽는다
    const wd = t.getUTCDay();
    out.push({ ymd: t.toISOString().slice(0, 10), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd, mult: HOT_TIME_WEEKEND.includes(wd) ? m.weekend : m.weekday });
  }
  return out;
}
