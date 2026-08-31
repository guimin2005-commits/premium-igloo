// 📌 KST(한국 시간) 경계 헬퍼 — XP 집계·퀘스트가 같은 기준을 쓰도록 한 곳에 모은다.
//    서버는 UTC로 돌아가므로, "오늘/이번 주/이번 달"은 반드시 KST 기준으로 계산해야 경계가 맞는다.

const KST = 9 * 60 * 60 * 1000;
const kstNow = () => new Date(Date.now() + KST);
// KST 기준 연·월·일로 만든 시각을 다시 UTC Date 로
const toUtc = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0) - KST);

// KST 기준 오늘 00:00
export const kstDayStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

// KST 기준 이번 주 월요일 00:00
export const kstWeekStart = () => {
  const n = kstNow();
  const dow = (n.getUTCDay() + 6) % 7; // 월=0 … 일=6
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() - dow);
};

// KST 기준 이번 달 1일 00:00
export const kstMonthStart = () => {
  const n = kstNow();
  return toUtc(n.getUTCFullYear(), n.getUTCMonth(), 1);
};

// KST 기준 오늘 날짜 "YYYY-MM-DD" (봇의 kstToday와 동일 포맷 — 출석 판정과 호환)
export const kstToday = () => kstNow().toISOString().slice(0, 10);

// 퀘스트 주기별 시작 시각
export const periodStart = (period) =>
  period === "monthly" ? kstMonthStart() : period === "weekly" ? kstWeekStart() : kstDayStart();

// 퀘스트 주기별 잠금 키 — 이 값이 바뀌면 다시 수령할 수 있다
//   daily "2026-08-31" · weekly "2026-W35" · monthly "2026-08"
export const periodKey = (period) => {
  if (period === "monthly") return kstToday().slice(0, 7);
  if (period === "weekly") {
    const ws = new Date(kstWeekStart().getTime() + KST); // 주 시작(월요일)의 KST 날짜
    return `${ws.getUTCFullYear()}-W${ws.toISOString().slice(5, 10).replace("-", "")}`;
  }
  return kstToday();
};

// 주기별 다음 초기화까지 남은 시간 안내 문구
export const periodResetLabel = (period) =>
  period === "monthly" ? "매월 1일 초기화" : period === "weekly" ? "매주 월요일 초기화" : "매일 자정 초기화";
