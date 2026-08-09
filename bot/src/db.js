// ── MongoDB 연결 + 모델 (사이트와 공유되는 컬렉션) ──
import mongoose from "mongoose";

const UserXpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: "" },
  displayName: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastChatXpAt: { type: Date, default: null },
  lastAttendDate: { type: String, default: "" }, // "2026-07-05" (KST)
  attendCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});
export const UserXp = mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);

// 관리자 대시보드(/admin/bot)에서 관리하는 역할 설정
const RoleConfigSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },
  rewardLevel: { type: Number, default: null }, // 이 레벨 도달 시 자동 지급
  buffXp: { type: Number, default: 0 },         // 채팅/음성 1회당 추가 XP
  attendBuffXp: { type: Number, default: 0 },   // 출석 1회당 추가 XP
  createdAt: { type: Date, default: Date.now },
});
export const RoleConfig = mongoose.models.RoleConfig || mongoose.model("RoleConfig", RoleConfigSchema);

export const connectDb = (uri) => mongoose.connect(uri);
export const disconnectDb = () => mongoose.disconnect();

// MongoDB 중복 키 오류 (원자적 쿨타임/출석 체크에서 "이미 처리됨" 신호로 사용)
export const isDuplicateKeyError = (e) => e?.code === 11000;
