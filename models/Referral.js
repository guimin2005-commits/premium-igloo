import mongoose from "mongoose";

const ReferralSchema = new mongoose.Schema({
  userName: { type: String, required: true, unique: true }, // 디스코드 닉네임 (소유자)
  userId: { type: String, default: "" },                    // 디스코드 고유 ID
  code: { type: String, required: true, unique: true, uppercase: true }, // 본인 고유 초대 코드
  invitees: { type: [String], default: [] },                // 내 코드를 사용한 친구 닉네임 목록
  referredBy: { type: String, default: "" },                // 내가 입력한 친구 코드 (1회 한정)
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Referral || mongoose.model("Referral", ReferralSchema);
