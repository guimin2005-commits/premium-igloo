import mongoose from "mongoose";

// 📌 레벨 보상 역할 & 역할별 Boost 효과 — 관리자 대시보드에서 설정, 봇이 자동 반영
const RoleConfigSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },        // 표시용 (디스코드 역할 이름)
  rewardLevel: { type: Number, default: null },   // 이 레벨 도달 시 자동 지급 (null이면 자동 지급 안 함)
  buffXp: { type: Number, default: 0 },           // 채팅/음성 1회 지급당 추가 XP
  attendBuffXp: { type: Number, default: 0 },     // 출석체크 1회당 추가 XP
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.RoleConfig || mongoose.model("RoleConfig", RoleConfigSchema);
