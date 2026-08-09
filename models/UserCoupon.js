import mongoose from "mongoose";

// 📌 유저가 보유한 쿠폰 (쿠폰 지갑)
//    source "admin": 운영진이 직접 지급 / "code": 유저가 코드를 등록해 담음
const UserCouponSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  couponId: { type: String, required: true },
  code: { type: String, required: true, uppercase: true },
  status: { type: String, default: "unused", index: true }, // unused | used
  source: { type: String, default: "admin" },               // admin | code
  issuedAt: { type: Date, default: Date.now },
  usedAt: { type: Date },
});

// 같은 쿠폰을 중복으로 담지 못하게 (미사용 상태 기준)
UserCouponSchema.index({ userId: 1, couponId: 1, status: 1 });

export default mongoose.models.UserCoupon || mongoose.model("UserCoupon", UserCouponSchema);
