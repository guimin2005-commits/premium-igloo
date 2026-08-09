import mongoose from "mongoose";

// 📌 ARCTIC 상품 — 레벨 대시보드(상품 관리)에서 등록, /shop 에서 판매
//    type "role"   : 구매 즉시 봇이 역할 자동 지급
//    type "physical": 구매 후 관리자가 확인·발송 (실물/기프티콘 등)
const ShopItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },       // 상품 이미지 (외부 URL)
  type: { type: String, default: "role" },       // "role" | "physical"
  roleId: { type: String, default: "" },         // type=role 일 때 지급할 역할
  roleName: { type: String, default: "" },       // 표시용
  price: { type: Number, required: true },       // 정가 (소모 XP)
  discountPct: { type: Number, default: 0 },     // 할인율 % (0이면 할인 없음)
  stock: { type: Number, default: -1 },          // -1 = 무제한
  soldCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },      // 판매 중 여부
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ShopItem || mongoose.model("ShopItem", ShopItemSchema);
