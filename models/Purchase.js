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
  // 결제 수단 — XP 와 POINT 는 1:1 등가라 가격은 하나를 공유하고 지불한 쪽만 기록한다
  payMethod: { type: String, default: "xp" }, // "xp" | "point"
  paidXp: { type: Number, default: 0 },
  paidPoint: { type: Number, default: 0 },
  // 📌 기간제 역할 — days가 0이면 영구. 지급 시각 기준으로 expiresAt을 세우고,
  //    기간이 지나면 봇이 역할을 회수하며 status를 expired로 바꾼다.
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
  // 📌 사이트 보유 — 소유는 그대로 두고 디스코드 역할 표기만 뗀 상태.
  //    시즌이 바뀌면 디스코드가 역할로 지저분해지므로 표기를 사이트로 옮긴다.
  //    만료(expired)와는 다르다 — 물건은 계속 갖고 있고 인벤토리에도 그대로 뜬다.
  siteOnly: { type: Boolean, default: false },
  siteOnlyAt: { type: Date, default: null },
  // 봇이 디스코드 역할을 실제로 뗐는지 (사이트가 표시를 바꾼 시점과 다를 수 있다)
  roleDetached: { type: Boolean, default: false },
  status: { type: String, default: "pending", index: true }, // pending | completed | expired | cancelled
  contact: { type: String, default: "" },   // 실물 상품 수령 정보 (구매자 입력)
  adminNote: { type: String, default: "" }, // 운송장 번호 등
  error: { type: String, default: "" },     // 역할 지급 실패 사유
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});

export default mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
