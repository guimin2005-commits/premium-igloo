// 📌 강화 — 채팅 XP 랜덤 구간과 음성 XP 가산을 단계별로 영구히 올린다 (사이트 전용).
//    · 실패 없음, 단계마다 비용이 복리로 오른다. 비용은 XP·POINT 중 유저가 고른다 (상점과 같은 규칙).
//    · 단계는 UserXp.chatEnhance / voiceEnhance 에 쌓이고 시즌 롤오버·관리자 초기화에도 남는다.
//    · 봇은 이 파일을 읽지 않는다 — bot/src/features/chatXp.js · voiceXp.js 가 같은 식을 직접 쓴다
//      (BotSetting 의 step 값과 UserXp 의 단계만 본다). 여기 식을 바꾸면 그쪽도 함께 바꿔야 한다.

const num = (v, def = 0) => {
  if (v == null || v === "") return def; // 필드가 비었으면(null/미저장) 기본값 — Number(null) 은 0 이라 따로 거른다
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const lvlOf = (v) => Math.max(0, Math.floor(num(v)));

// 정책 문서가 없거나 필드가 빠졌을 때의 기본값 — models/BotSetting.js 와 같아야 한다
export const ENHANCE_DEFAULTS = {
  chatXpMin: 50,
  chatXpMax: 500,
  chatEnhanceStep: 50,
  chatEnhanceMax: 10,
  chatEnhanceBaseCost: 20000,
  chatEnhanceCostGrowthPct: 50,
  voiceEnhanceStep: 300,
  voiceEnhanceMax: 10,
  voiceEnhanceBaseCost: 50000,
  voiceEnhanceCostGrowthPct: 50,
};

export const ENHANCE_KINDS = ["chat", "voice"];
export const ENHANCE_LABEL = { chat: "채팅", voice: "음성" };

// 정책 문서 → 숫자 보장 + 최소 ≤ 최대 (bot-settings 저장 때도 같은 규칙으로 클램프한다)
export function enhancePolicy(setting) {
  const s = setting || {};
  const out = {};
  for (const k of Object.keys(ENHANCE_DEFAULTS)) out[k] = num(s[k], ENHANCE_DEFAULTS[k]);
  if (out.chatXpMax < out.chatXpMin) out.chatXpMax = out.chatXpMin;
  out.chatEnhanceMax = lvlOf(out.chatEnhanceMax);
  out.voiceEnhanceMax = lvlOf(out.voiceEnhanceMax);
  return out;
}

// nextLevel 단계로 올리는 비용 — 1단계는 base, 그다음부터 매 단계 growthPct % 씩 복리로 오른다
//    nextLevel = 현재 단계 + 1 (1..max)
export const enhanceCost = (base, growthPct, nextLevel) =>
  Math.floor(num(base) * (1 + num(growthPct) / 100) ** (Math.max(1, Math.floor(num(nextLevel, 1))) - 1));

// 채팅 1회 지급 구간 [min, max] — 단계마다 양끝에 step 씩 (봇 chatXp.js 와 같은 식)
export const chatRange = (s, lvl) => {
  const p = enhancePolicy(s);
  const add = lvlOf(lvl) * p.chatEnhanceStep;
  return [p.chatXpMin + add, p.chatXpMax + add];
};

// 음성 1회 지급에 더해지는 강화 가산 (봇 voiceXp.js 와 같은 식)
export const voiceBonus = (s, lvl) => lvlOf(lvl) * enhancePolicy(s).voiceEnhanceStep;

// 정책 + 유저 문서 → 화면·API 가 그대로 쓰는 강화 상태
//    { chat:{ level, max, step, range, nextRange, nextCost }, voice:{ level, max, step, bonus, nextBonus, nextCost } }
//    최대 단계면 next* 는 null. 관리자가 최대를 낮춰도 이미 올린 단계는 그대로 둔다 (영구).
export function buildEnhanceView(setting, userDoc) {
  const p = enhancePolicy(setting);
  const chatLevel = lvlOf(userDoc?.chatEnhance);
  const voiceLevel = lvlOf(userDoc?.voiceEnhance);
  const chatAtMax = chatLevel >= p.chatEnhanceMax;
  const voiceAtMax = voiceLevel >= p.voiceEnhanceMax;

  return {
    chat: {
      level: chatLevel,
      max: p.chatEnhanceMax,
      step: p.chatEnhanceStep,
      range: chatRange(p, chatLevel),
      nextRange: chatAtMax ? null : chatRange(p, chatLevel + 1),
      nextCost: chatAtMax ? null : enhanceCost(p.chatEnhanceBaseCost, p.chatEnhanceCostGrowthPct, chatLevel + 1),
    },
    voice: {
      level: voiceLevel,
      max: p.voiceEnhanceMax,
      step: p.voiceEnhanceStep,
      bonus: voiceBonus(p, voiceLevel),
      nextBonus: voiceAtMax ? null : voiceBonus(p, voiceLevel + 1),
      nextCost: voiceAtMax ? null : enhanceCost(p.voiceEnhanceBaseCost, p.voiceEnhanceCostGrowthPct, voiceLevel + 1),
    },
  };
}
