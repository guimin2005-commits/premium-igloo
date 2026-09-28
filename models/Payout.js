import mongoose from "mongoose";

const PayoutSchema = new mongoose.Schema({
  userName: { type: String, required: true },  // 지급 대상 디스코드 닉네임
  userId: { type: String, default: "" },        // 디스코드 고유 ID (슬래시 멘션용)
  amount: { type: Number, required: true },      // 지급할 XP 수량
  reason: { type: String, default: "" },         // 지급 사유 (예: 친구 초대 보상)
  source: { type: String, default: "etc" },      // referral | code | manual | etc
  status: { type: String, default: "pending" },  // pending | paid
  // 📌 지급 재화 — "xp"(봇 큐가 반영) | "point"(빙옥, 사이트가 즉시 반영하고 paid 로만 남긴다). bot/src/db.js 와 같아야 한다
  currency: { type: String, default: "xp" },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});

// 📌 내 XP · 빙옥 내역(/api/xp/ledger)과 관리자 유저 조회가 한 사람의 지급 기록을 최신순으로 읽는다 — 없으면 매번 전체를 훑는다
PayoutSchema.index({ userId: 1, status: 1, paidAt: -1 });

export default mongoose.models.Payout || mongoose.model("Payout", PayoutSchema);
