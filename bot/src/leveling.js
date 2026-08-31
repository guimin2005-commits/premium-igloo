// ── 레벨 공식 (사이트 lib/leveling.js 와 동일해야 함) ──────
//    세 항이 각자 다른 구간을 맡아 성장 속도가 변한다 (일정한 +200 증가가 아니다):
//      · 2900L  선형   — 1~10레벨. 첫 채팅 한 번이면 Lv1→Lv2, 초반이 쭉쭉 오른다
//      · 1100L² 2차    — 중반의 뼈대
//      · L³/20  3차    — 500레벨 밑에선 존재감이 없다가 후반에 폭발하는 빙벽
//    Lv1 = 0 (시작 레벨) · Lv10 6,800 · Lv100 614,300 · Lv1000 105,144,800
//    레벨 1개당 소요: Lv100 0.35시간 → Lv500 2.6시간 → Lv1000 7.2시간
//    ⚠️ 사이트 lib/leveling.js 와 반드시 같은 값이어야 한다 (봇은 별도 배포라 import 불가)
export const getCumulativeXpByLevel = (lvl) =>
  lvl <= 0 ? 0 : Math.floor((lvl ** 3 + 1100 * lvl ** 2 + 2900 * lvl) / 20) - 200;

export const getLevelByXp = (xp) => {
  if (xp <= 0) return 1; // Lv1이 시작점 — 0 XP도 Lv1
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
