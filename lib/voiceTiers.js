// 📌 음성 티어 — 레벨 구간별 음성/내전 추가 XP의 단일 소스.
//    화면 표시(대시보드·XP 정책 탭)와 계산(시뮬레이터)이 모두 이 표만 본다.
//
//    ⚠️ 봇(bot/src/leveling.js)의 VOICE_BRACKET_BONUS 는 이 표를 손으로 옮긴 사본이다.
//       봇은 별도 배포라 이 파일을 import 할 수 없다. 여기를 고치면 봇도 반드시 함께 고칠 것.
//       실제 지급은 봇이 하므로, 어긋나면 화면이 거짓말을 하게 된다.
//
//    지급량 = 관리자가 설정한 기본 음성 XP(기본 3,000) + 티어 bonus
//    · 아이언 = 보너스 0 → '기본 음성 XP' 설정값이 그대로 아이언 티어 지급량이 된다.
//    · 티어 경계는 "승급까지 걸리는 시간"이 약 1.6배씩 늘도록 역산했다.
//      등간격(100레벨)이면 후반 한 티어가 전체 플레이 시간의 절반을 먹는다.

export const VOICE_TIERS = [
  { key: "iron",     name: "아이언",     en: "IRON",     min: 1,   bonus: 0,    c: "#8a8a8a" },
  { key: "bronze",   name: "브론즈",     en: "BRONZE",   min: 120, bonus: 300,  c: "#a06a3c" },
  { key: "silver",   name: "실버",       en: "SILVER",   min: 200, bonus: 550,  c: "#8d99a6" },
  { key: "gold",     name: "골드",       en: "GOLD",     min: 280, bonus: 750,  c: "#c39220" },
  { key: "platinum", name: "플래티넘",   en: "PLATINUM", min: 370, bonus: 1100, c: "#3f9e93" },
  { key: "diamond",  name: "다이아몬드", en: "DIAMOND",  min: 480, bonus: 1500, c: "#3f7fc4" },
  { key: "master",   name: "마스터",     en: "MASTER",   min: 620, bonus: 1900, c: "#8557b0" },
  // 최고 티어는 커뮤니티 이름 그대로 — 여기까지 오면 이글루 그 자체
  { key: "igloo",    name: "이글루",     en: "IGLOO",    min: 780, bonus: 3000, c: "#e91e3f" },
];

export const TIER_COLORS = VOICE_TIERS.map((t) => t.c);

// 레벨 → 티어 인덱스
export const getTierIndex = (level) => {
  let idx = 0;
  for (let i = 0; i < VOICE_TIERS.length; i++) {
    if ((level || 0) >= VOICE_TIERS[i].min) idx = i;
  }
  return idx;
};

export const getTier = (level) => VOICE_TIERS[getTierIndex(level)];

// 레벨 → 음성 추가 XP (봇의 getVoiceBracketBonus 와 반드시 같은 값)
export const getVoiceBonus = (level) => getTier(level).bonus;

// "Lv.100 – 199" / "Lv.700 이상" 형태의 구간 표기
export const tierRangeLabel = (i) => {
  const next = VOICE_TIERS[i + 1];
  return next ? `Lv.${VOICE_TIERS[i].min} – ${next.min - 1}` : `Lv.${VOICE_TIERS[i].min} 이상`;
};
