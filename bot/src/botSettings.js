// ── XP 기본 정책 · 기간제 부스트 캐시 (대시보드 변경을 1분 주기로 반영) ──
import { BotSetting, XpBoost } from "./db.js";
import { policy as fallback } from "./config.js";

const REFRESH_MS = 60 * 1000;

// 대시보드 미설정 시 config.js의 기존 정책을 그대로 사용
const DEFAULTS = {
  chatXp: fallback.chatXp, // (구) 고정 지급량 — 채팅 지급은 min/max 랜덤을 쓴다
  // 채팅 랜덤 구간 · 강화 (bot/src/db.js BotSettingSchema 와 같은 기본값)
  chatXpMin: 50,
  chatXpMax: 500,
  chatEnhanceStep: 50,
  chatEnhanceMax: 10,
  chatEnhanceBaseCost: 20000,
  chatEnhanceCostGrowthPct: 50,
  chatCooldownSec: fallback.chatCooldownMs / 1000,
  voiceXp: fallback.voiceBaseXp,
  voiceIntervalSec: fallback.voiceIntervalMs / 1000,
  voiceEnhanceStep: 300,
  voiceEnhanceMax: 10,
  voiceEnhanceBaseCost: 50000,
  voiceEnhanceCostGrowthPct: 50,
  attendXp: fallback.attendXp,
  muteMode: "reduce",
  muteReducePct: 90,
  muteTarget: "both",
  resetOnLeave: false,
  levelupChannelId: "",
  levelupMessage: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!",
  roleGrantChannelId: "",
  roleGrantMessage: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})",
  roleGrantEnabled: true,
};

let settings = { ...DEFAULTS };
let boosts = [];

export async function refreshBotSettings() {
  try {
    const [doc, boostRows] = await Promise.all([
      BotSetting.findOne({ key: "main" }).lean(),
      XpBoost.find().lean(),
    ]);
    settings = { ...DEFAULTS, ...(doc || {}) };
    boosts = boostRows;
  } catch (e) {
    console.error("봇 설정 갱신 오류:", e.message);
  }
}

export function startBotSettingLoop() {
  setInterval(refreshBotSettings, REFRESH_MS);
}

export const getSettings = () => settings;

// 지금 유효한 기간제 부스트 합산
//  · 역할·채널 조건은 각각 비어 있으면 "제한 없음", 둘 다 있으면 모두 만족해야 적용
//  · 채널 조건은 해당 채널 자신 또는 상위 카테고리와 일치하면 통과
export function getActiveBoostXp(member, channel = null) {
  const now = Date.now();
  let total = 0;

  for (const b of boosts) {
    if (now < new Date(b.startAt).getTime() || now > new Date(b.endAt).getTime()) continue;
    if (b.targetRoleId && !member.roles.cache.has(b.targetRoleId)) continue;

    if (b.targetChannelId) {
      if (!channel) continue;
      // 스레드 · 포럼 글은 상위 채널의 카테고리(parent.parentId)까지 본다
      const matches = [channel.id, channel.parentId, channel.parent?.parentId].includes(b.targetChannelId);
      if (!matches) continue;
    }

    total += b.boostXp || 0;
  }
  return total;
}

// 음소거 상태에 따른 지급 배수 (1 = 그대로, 0 = 지급 안 함)
export function getMuteMultiplier(voiceState) {
  const s = settings;
  if (s.muteMode === "off") return 1;

  const muted = s.muteTarget === "any"
    ? voiceState.selfMute || voiceState.selfDeaf
    : voiceState.selfMute && voiceState.selfDeaf;
  if (!muted) return 1;

  if (s.muteMode === "block") return 0;
  return Math.max(0, 1 - (s.muteReducePct || 0) / 100);
}
