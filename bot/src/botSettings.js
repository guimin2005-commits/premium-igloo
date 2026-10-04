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
  // 잠수 확인(features/afkCheck.js) — 사이트 models/BotSetting.js 와 같은 기본값
  afkCheckOn: true,
  afkCheckFirstMin: 60,
  afkCheckSanctionMin: 30,
  afkCheckMinMin: 20,
  afkCheckMaxMin: 60,
  afkCheckReplyMin: 5,
  muteReducePct: 90,
  muteTarget: "both",
  resetOnLeave: false,
  levelupChannelId: "",
  levelupMessage: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!",
  roleGrantChannelId: "",
  roleGrantMessage: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})",
  roleGrantEnabled: true,
  // 📌 .lean() 은 스키마 기본값을 채우지 않는다 — 이 필드가 생기기 전 문서에서 undefined 로 읽히지 않게 여기 둔다 (db.js 와 같은 기본값)
  levelPublic: false, // 비공개면 봇이 XP 를 주지 않는다 (isLevelOpen)
  rankerRoleId: "",
  attendChannelId: "", // 자동 출석 알림 채널 — 비우면 레벨업 채널 (features/voiceXp.js)
  noticeChannelId: "", // 사이트 공지 채널 — 비우면 보내지 않는다 (features/noticeAnnounce.js 는 DB 에서 바로 읽는다)
  attendStreakEnabled: false,
  attendStreakRules: [],
  expiryReminderEnabled: true,
  expiryReminderHours: 24,
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

// 📌 SYSTEM : LEVEL 공개 여부 — 비공개(false · 없음)면 봇이 스스로 만드는 XP(채팅 · 음성 · 출석 · 아이템 효과)를 주지 않는다.
//    2026-10-04 부터 오늘 누적 음성 분(자동 출석 · 하루 음성 효과 — features/voiceXp.js) · 활동 횟수(퀘스트 — features/activityStats.js)도 쌓지 않는다.
//    부팅 뒤 설정을 아직 못 읽었으면 비공개로 본다. 지급 대기열(Payout)의 XP 지급은 이 값과 무관하다
export const isLevelOpen = () => settings.levelPublic === true;

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
