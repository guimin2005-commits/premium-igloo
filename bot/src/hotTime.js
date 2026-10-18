// 📌 핫타임 — 사이트 lib/hotTime.js 와 같은 블록(아래 공용 블록은 글자 그대로 같게). 채팅(features/chatXp.js) · 음성(features/voiceXp.js voiceRate)이 쓴다.
//    2026-10-14 운영자 「유령 펭귄의 초대」: 금 · 토 · 일 2배 / 그 밖의 날 1.5배 — 「기본 XP + 강화 + 음성 등급 가산」에만. 역할 버프 · 채널 · 부스트 · 아이템 효과에는 안 붙는다
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
