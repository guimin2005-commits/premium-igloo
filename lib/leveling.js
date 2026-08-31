// 📌 레벨 공식 — 사이트/봇 공용 (bot/src/leveling.js 와 동일해야 함)
//    누적 XP = 100 × (레벨² − 1)  ·  레벨업 필요 XP = 200 × 레벨 − 100
//    · Lv1 = 0 XP (시작 레벨). 예전 식의 -525 보정 때문에 1레벨만 1 XP로 튀던 문제를 없앴다.
//    · 필요 XP가 100, 300, 500 … 200씩 늘어나는 등차수열이라 표가 전부 100 단위로 떨어진다.
//    · Lv1000 누적 = 99,999,900 (약 1억)
export const getCumulativeXpByLevel = (lvl) => (lvl <= 0 ? 0 : 100 * (lvl * lvl - 1));

export const getLevelByXp = (xp) => {
  if (xp <= 0) return 1; // Lv1이 시작점 — 0 XP도 Lv1
  for (let l = 1; l <= 1000; l++) {
    if (xp < getCumulativeXpByLevel(l)) return l - 1;
  }
  return 1000;
};
