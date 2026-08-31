// 📌 시즌 상수 — 홈 티커·레벨 대시보드 공용. 시즌 교체 시 여기만 수정
export const SEASON = {
  number: 1,
  name: "UP!",
  start: "2026-05-01",
  end: "2026-09-30",
};

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
