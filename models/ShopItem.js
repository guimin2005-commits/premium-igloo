import mongoose from "mongoose";

// 📌 ARCTIC 상품 — 레벨 대시보드(상품 관리)에서 등록, /shop 에서 판매
//    type "role"    : 역할 상품 — 구매 즉시 봇이 역할 자동 지급
//    type "perk"    : 권한 상품 — 역할 지급으로 특정 권한을 부여 (역할과 동일 동작, 분류만 다름)
//    type "physical": 기프트카드 — 구매 후 관리자가 확인·발송
const ShopItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },       // 상품 이미지 (외부 URL)
  type: { type: String, default: "role" },       // "role" | "perk" | "physical"
  roleId: { type: String, default: "" },         // role·perk 일 때 지급할 역할
  roleName: { type: String, default: "" },       // 표시용
  price: { type: Number, required: true },       // 정가 (소모 XP) — 기간제면 표시·정렬용 기준가
  // 📌 기간제 역할 — 정해진 기간만 보유하고 지나면 봇이 회수한다.
  //    비어 있으면 한 번 사면 계속 갖는 영구 상품 (기존 동작 그대로).
  durations: {
    type: [{ days: Number, price: Number }],
    default: [],
  },
  discountPct: { type: Number, default: 0 },     // 할인율 % (0이면 할인 없음)
  stock: { type: Number, default: -1 },          // -1 = 무제한
  soldCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },      // 판매 중 여부
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ShopItem || mongoose.model("ShopItem", ShopItemSchema);
