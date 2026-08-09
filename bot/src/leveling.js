// ── 레벨 공식 (사이트 시뮬레이터와 동일) ──────
export const getCumulativeXpByLevel = (lvl) => {
  if (lvl <= 0) return 0;
  return Math.floor(((23 * lvl) ** 2 - 525) / 5) + 1;
};

export const getLevelByXp = (xp) => {
  if (xp <= 0) return 0;
  for (let l = 1; l <= 1000; l++) {
    if (xp < getCumulativeXpByLevel(l)) return l - 1;
  }
  return 1000;
};

// 레벨 구간별 음성/내전 추가 XP — 사이트 "레벨 구간별 추가 기준"에서
// 기본 3,000을 뺀 순수 추가분
const VOICE_BRACKET_BONUS = [
  [700, 3000], [649, 2000], [600, 1800], [550, 1600], [500, 1400],
  [450, 1200], [400, 1000], [350, 800], [300, 700], [250, 600],
  [200, 500], [150, 350], [100, 250], [50, 150], [0, 0],
];

export const getVoiceBracketBonus = (level) => {
  for (const [minLv, bonus] of VOICE_BRACKET_BONUS) {
    if (level >= minLv) return bonus;
  }
  return 0;
};

// KST 기준 오늘 날짜 "YYYY-MM-DD"
export const kstToday = () =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
