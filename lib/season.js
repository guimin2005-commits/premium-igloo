// 📌 시즌 상수 — 홈 티커·레벨 대시보드 공용. 시즌 교체 시 여기만 수정
export const SEASON = {
  number: 1,
  name: "UP!",
  start: "2026-05-01",
  end: "2026-09-30",
};

// 📌 누적 음성 참여 시간 집계 시작일 (KST) — 시즌 2 개시일.
//    이 날짜부터 봇이 시간을 쌓기 시작하며, 시즌이 바뀌어도 초기화하지 않는다.
//    XP·레벨은 시즌마다 정산되지만 이 값은 계정의 통산 기록으로 남는다.
//    bot/src/leveling.js 의 VOICE_TIME_START 와 반드시 같아야 한다.
export const VOICE_TIME_START = "2026-10-01";

// 집계가 시작됐는지 (KST 기준)
export const isVoiceTimeTracked = () =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10) >= VOICE_TIME_START;

// 시즌 D-Day (KST 기준)
export const getSeasonDday = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = kstNow.toISOString().slice(0, 10);
  const end = new Date(`${SEASON.end}T23:59:59+09:00`).getTime();
  const days = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
  return { days, ended: todayStr > SEASON.end };
};

// 시즌 경과율 (0~100)
export const getSeasonProgress = () => {
  const s = new Date(`${SEASON.start}T00:00:00+09:00`).getTime();
  const e = new Date(`${SEASON.end}T23:59:59+09:00`).getTime();
  return Math.min(100, Math.max(0, Math.round(((Date.now() - s) / (e - s)) * 100)));
};
