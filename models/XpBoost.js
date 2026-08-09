import mongoose from "mongoose";

// 📌 기간제 XP 부스트 — 레벨 대시보드(부스트 탭)에서 설정, 봇이 1분 주기 자동 반영
//    기간 내에만 발동. 역할·채널 조건은 각각 비면 "제한 없음"이고, 둘 다 설정하면 AND
const XpBoostSchema = new mongoose.Schema({
  name: { type: String, default: "" },               // 표시용 이름 (예: 주말 이벤트)
  targetRoleId: { type: String, default: "" },       // 대상 역할 (""=역할 무관)
  targetRoleName: { type: String, default: "" },     // 표시용
  targetChannelId: { type: String, default: "" },    // 대상 채널·카테고리 (""=채널 무관)
  targetChannelName: { type: String, default: "" },  // 표시용
  targetChannelType: { type: String, default: "" },  // "text" | "voice" | "category"
  boostXp: { type: Number, default: 0 },             // 채팅/음성 지급 1회당 추가 XP
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.XpBoost || mongoose.model("XpBoost", XpBoostSchema);
