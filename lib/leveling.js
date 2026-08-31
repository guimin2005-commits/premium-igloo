// 📌 레벨 공식 — 누적 XP = (L³ + 1100·L² + 2900·L) / 20 − 200
//    세 항이 각자 다른 구간을 맡아 성장 속도가 계속 변한다 (일정하게 +200씩 늘지 않는다):
//      · 2900L  선형  — 1~10레벨. 첫 채팅 한 번이면 Lv2, 초반이 쭉쭉 오른다
//      · 1100L² 2차   — 중반의 뼈대
//      · L³/20  3차   — 500레벨 밑에선 존재감이 없다가 후반에 폭발하는 빙벽
//    Lv1 = 0 (시작 레벨) · Lv10 6,800 · Lv100 614,300 · Lv1000 105,144,800
//    레벨 1개당 소요(음성 3,000/5분): Lv100 0.35h → Lv500 2.6h → Lv1000 7.2h
//    ⚠️ bot/src/leveling.js 와 반드시 같은 값이어야 한다 (봇은 별도 배포라 import 불가)
export const getCumulativeXpByLevel = (lvl) =>
  lvl <= 0 ? 0 : Math.floor((lvl ** 3 + 1100 * lvl ** 2 + 2900 * lvl) / 20) - 200;

export const getLevelByXp = (xp) => {
  if (xp <= 0) return 1; // Lv1이 시작점 — 0 XP도 Lv1
  for (let l = 1; l <= 1000; l++) {
    if (xp < getCumulativeXpByLevel(l)) return l - 1;
  }
  return 1000;
};
