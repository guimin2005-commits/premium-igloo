// 📌 KST(한국 시간) 경계 헬퍼 — XP 집계·일일 퀘스트가 같은 기준을 쓰도록 한 곳에 모은다.
//    서버는 UTC로 돌아가므로, "오늘"은 반드시 KST 기준으로 계산해야 자정 경계가 맞는다.

// KST 기준 오늘 00:00 을 UTC Date 로 (my-logs·leaderboard와 동일한 방식)
export const kstDayStart = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0);
  return new Date(start - 9 * 60 * 60 * 1000);
};

// KST 기준 이번 달 1일 00:00 을 UTC Date 로
export const kstMonthStart = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1, 0, 0, 0);
  return new Date(start - 9 * 60 * 60 * 1000);
};

// KST 기준 오늘 날짜 문자열 "YYYY-MM-DD" (봇의 kstToday와 동일 포맷 — 출석 판정과 호환)
export const kstToday = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
