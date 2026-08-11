import mongoose from "mongoose";

// 📌 유저 XP·레벨 — 봇이 적립(채팅/음성/출석), 사이트는 조회·연동에 사용
//    bot/src/db.js 의 UserXpSchema와 동일해야 함
const UserXpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true }, // 디스코드 유저 ID
  username: { type: String, default: "" },
  displayName: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastChatXpAt: { type: Date, default: null },
  lastAttendDate: { type: String, default: "" }, // "2026-07-05" (KST)
  attendCount: { type: Number, default: 0 },
  // 사이트에서 XP·레벨을 바꿨을 때 봇이 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);
