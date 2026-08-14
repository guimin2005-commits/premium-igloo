import mongoose from "mongoose";

// 📌 ARCTIC 구매 내역
//    role     : pending → (봇이 역할 지급) → completed
//    physical : pending → (관리자 발송 처리) → completed
const PurchaseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  itemId: { type: String, required: true },
  itemName: { type: String, default: "" },
  itemType: { type: String, default: "role" }, // "role" | "physical"
  roleId: { type: String, default: "" },
  price: { type: Number, default: 0 },
  // 📌 기간제 역할 — days가 0이면 영구. 지급 시각 기준으로 expiresAt을 세우고,
  //    기간이 지나면 봇이 역할을 회수하며 status를 expired로 바꾼다.
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
  status: { type: String, default: "pending", index: true }, // pending | completed | expired | cancelled
  contact: { type: String, default: "" },   // 실물 상품 수령 정보 (구매자 입력)
  adminNote: { type: String, default: "" }, // 운송장 번호 등
  error: { type: String, default: "" },     // 역할 지급 실패 사유
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});

export default mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
