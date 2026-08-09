import mongoose from "mongoose";

// 📌 기간제 XP 부스트 — 레벨 대시보드(부스트 탭)에서 설정, 봇이 1분 주기 자동 반영
//    기간 내에만 발동. targetRoleId가 비면 서버 전체 대상
const XpBoostSchema = new mongoose.Schema({
  name: { type: String, default: "" },            // 표시용 이름 (예: 주말 이벤트)
  targetRoleId: { type: String, default: "" },    // 대상 역할 (""=전체)
  targetRoleName: { type: String, default: "" },  // 표시용
  boostXp: { type: Number, default: 0 },          // 채팅/음성 지급 1회당 추가 XP
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.XpBoost || mongoose.model("XpBoost", XpBoostSchema);
