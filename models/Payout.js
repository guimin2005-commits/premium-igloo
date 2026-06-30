import mongoose from "mongoose";

const PayoutSchema = new mongoose.Schema({
  userName: { type: String, required: true },  // 지급 대상 디스코드 닉네임
  userId: { type: String, default: "" },        // 디스코드 고유 ID (슬래시 멘션용)
  amount: { type: Number, required: true },      // 지급할 XP 수량
  reason: { type: String, default: "" },         // 지급 사유 (예: 친구 초대 보상)
  source: { type: String, default: "etc" },      // referral | code | manual | etc
  status: { type: String, default: "pending" },  // pending | paid
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});

export default mongoose.models.Payout || mongoose.model("Payout", PayoutSchema);
