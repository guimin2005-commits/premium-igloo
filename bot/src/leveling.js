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

// 레벨 구간별 음성/내전 추가 XP — 기본 음성 XP에 더해지는 순수 추가분.
// ⚠️ 사이트 lib/voiceTiers.js 의 VOICE_TIERS 를 손으로 옮긴 사본이다.
//    봇은 별도 배포라 그 파일을 import 할 수 없으니, 한쪽만 고치지 말 것.
//    (아이언 0 / 브론즈 300 / 실버 550 / 골드 750 / 플래티넘 1100 /
//     다이아몬드 1500 / 마스터 1900 / 이글루 3000)
const VOICE_BRACKET_BONUS = [
  [700, 3000], [600, 1900], [500, 1500], [400, 1100],
  [300, 750], [200, 550], [100, 300], [0, 0],
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
