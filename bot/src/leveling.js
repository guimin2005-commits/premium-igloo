// ── 레벨 공식 (사이트 lib/leveling.js 와 동일해야 함) ──────
//    세 항이 각자 다른 구간을 맡아 성장 속도가 변한다 (일정한 +200 증가가 아니다):
//      · 2900L  선형   — 1~10레벨. 첫 채팅 한 번이면 Lv1→Lv2, 초반이 쭉쭉 오른다
//      · 1100L² 2차    — 중반의 뼈대
//      · L³/20  3차    — 500레벨 밑에선 존재감이 없다가 후반에 폭발하는 빙벽
//    Lv1 = 0 (시작 레벨) · Lv10 6,818 · Lv100 639,300 · Lv1000 130,144,800
//    레벨 1개당 소요: Lv100 0.35시간 → Lv500 2.6시간 → Lv1000 7.2시간
//    ⚠️ 사이트 lib/leveling.js 와 반드시 같은 값이어야 한다 (봇은 별도 배포라 import 불가)
export const getCumulativeXpByLevel = (lvl) =>
  lvl <= 0 ? 0 : Math.floor((3 * lvl ** 3 + 2200 * lvl ** 2 + 5800 * lvl) / 40) - 200;

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
//    아이언 Lv1+ 0 / 브론즈 90+ 300 / 실버 160+ 550 / 골드 240+ 750 /
//    플래티넘 330+ 1100 / 다이아몬드 430+ 1500 / 마스터 540+ 1900 /
//    그랜드마스터 650+ 2200 / 챌린저 760+ 2500 / 이글루 880+ 3000
const VOICE_BRACKET_BONUS = [
  [880, 3000], [760, 2500], [650, 2200], [540, 1900], [430, 1500],
  [330, 1100], [240, 750], [160, 550], [90, 300], [0, 0],
];

export const getVoiceBracketBonus = (level) => {
  for (const [minLv, bonus] of VOICE_BRACKET_BONUS) {
    if (level >= minLv) return bonus;
  }
  return 0;
};

// KST 기준 오늘 날짜 "YYYY-MM-DD"
// 📌 누적 음성 참여 시간 집계 시작일 (KST) — lib/season.js 의 VOICE_TIME_START 와 같아야 한다
export const VOICE_TIME_START = "2026-10-01";

export const kstToday = () =>
  new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 📌 시즌 목록 — lib/season.js 의 SEASONS 와 같아야 한다 (봇은 별도 배포라 import 불가).
//    날짜는 KST "YYYY-MM-DD" (시작일 00:00 ~ 종료일 23:59:59.999)
export const SEASONS = [
  { number: 1, name: "UP!", start: "2026-05-01", end: "2026-09-30" },
  { number: 2, name: "A new world", start: "2026-10-01", end: "2026-12-31" },
];
const SEASONS_ORDERED = [...SEASONS].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

// 지금 시즌 — 진행 중인 시즌. 없으면 마지막으로 시작한 시즌(= 가장 최근에 끝난 시즌), 첫 시즌 전이면 첫 시즌
export const currentSeason = (now = Date.now()) => {
  const today = new Date(Number(now) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  let cur = SEASONS_ORDERED[0];
  for (const s of SEASONS_ORDERED) if (s.start <= today) cur = s;
  return cur;
};

// 시즌 시작·끝 시각(ms) — KST 시작일 00:00:00.000 · 종료일 23:59:59.999
export const seasonStartMs = (s) => Date.parse(`${s.start}T00:00:00.000+09:00`);
export const seasonEndMs = (s) => Date.parse(`${s.end}T23:59:59.999+09:00`);
