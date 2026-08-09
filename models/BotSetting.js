import mongoose from "mongoose";

// 📌 봇 XP 기본 정책 — 레벨 대시보드(기본 정책 탭)에서 설정, 봇이 1분 주기 자동 반영
//    단일 문서(key: "main")로 관리. bot/src/db.js 와 동일해야 함
const BotSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },

  chatXp: { type: Number, default: 200 },          // 채팅 1회 지급량
  chatCooldownSec: { type: Number, default: 60 },  // 채팅 쿨타임 (초)
  voiceXp: { type: Number, default: 3000 },        // 음성 1회 지급량
  voiceIntervalSec: { type: Number, default: 300 },// 음성 지급 주기 (초)
  attendXp: { type: Number, default: 7000 },       // 출석 1회 지급량

  muteMode: { type: String, default: "reduce" },   // "off"(제한 없음) | "reduce"(감소) | "block"(차단)
  muteReducePct: { type: Number, default: 90 },    // reduce일 때 감소율 %
  muteTarget: { type: String, default: "both" },   // "both"(마이크+헤드셋 모두 뮤트 시) | "any"(하나라도 뮤트 시)

  resetOnLeave: { type: Boolean, default: false }, // 서버 퇴장 시 XP 초기화

  // IGLOO SHOP 공개 여부 — false면 관리자만 접근 가능 (준비 중 상태)
  shopPublic: { type: Boolean, default: false },

  levelupChannelId: { type: String, default: "" }, // 레벨업 알림 채널 (비우면 알림 끔)
  levelupMessage: { type: String, default: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!" },

  // 레벨 보상 역할 지급 알림 (채널 비우면 레벨업 채널 사용, 그마저 없으면 알림 끔)
  roleGrantChannelId: { type: String, default: "" },
  roleGrantMessage: { type: String, default: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})" },
  roleGrantEnabled: { type: Boolean, default: true },

  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.BotSetting || mongoose.model("BotSetting", BotSettingSchema);
