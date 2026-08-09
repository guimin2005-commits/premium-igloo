import mongoose from "mongoose";

// 📌 ARCTIC 쿠폰 — 결제 시 코드 입력으로 할인 적용
//    type "percent": 비율 할인 (maxDiscount로 상한 지정 가능)
//    type "flat"   : 정액 XP 할인
const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, default: "" },              // 표시용 이름
  type: { type: String, default: "percent" },       // "percent" | "flat"
  value: { type: Number, required: true },          // percent면 %, flat이면 XP
  maxDiscount: { type: Number, default: 0 },        // percent 상한 (0 = 무제한)
  minTotal: { type: Number, default: 0 },           // 최소 주문 금액
  maxUses: { type: Number, default: 0 },            // 전체 사용 한도 (0 = 무제한)
  usedCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },       // 1인당 사용 횟수 (0 = 무제한)
  usedBy: { type: [String], default: [] },          // 사용한 userId 목록 (중복 포함)
  active: { type: Boolean, default: true },
  expiresAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

// 쿠폰 할인액 계산 (주문 총액 기준)
CouponSchema.statics.calcDiscount = function (coupon, total) {
  if (!coupon) return 0;
  if (coupon.type === "flat") return Math.min(total, Math.max(0, coupon.value));
  const raw = Math.floor((total * Math.max(0, coupon.value)) / 100);
  const capped = coupon.maxDiscount > 0 ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(total, capped);
};

export default mongoose.models.Coupon || mongoose.model("Coupon", CouponSchema);
