import mongoose from "mongoose";

// 📌 ARCTIC 구매 내역
//    role     : pending → (봇이 역할 지급) → completed
//    physical : pending → (관리자 발송 처리) → completed
const PurchaseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  itemId: { type: String, required: true },
  // 📌 아이템 등록(models/Item) id 스냅샷 — 상품이 등록된 아이템을 참조했거나 시즌 패스 아이템 보상이면 채운다.
  //    인벤토리(my-items)가 이 값으로 Item 을 먼저 찾아 표기를 그린다. "" 이면 상품·구매 스냅샷으로 그린다.
  itemRef: { type: String, default: "" },
  itemName: { type: String, default: "" },
  itemType: { type: String, default: "role" }, // "role" | "perk" | "item" | "cosmetic" | "physical"
  roleId: { type: String, default: "" },
  price: { type: Number, default: 0 },
  // 결제 수단 — 가격은 XP 하나만 두고, 빙옥(1 빙옥 = 1,000 XP — lib/pointRate.js)을 원하는 만큼 쓰고 나머지를 XP 로 낸다.
  //    📌 "mixed" 는 둘 다 0 보다 크게 낸 건. enum 이 없어 봇 스키마(bot/src/db.js)도 그대로 저장된다
  payMethod: { type: String, default: "xp" }, // "xp" | "point" | "mixed"
  // 📌 빙옥 전용 상품을 산 건(구매 시점 스냅샷) — paidXp 는 늘 0, 값은 전부 paidPoint. 구매 내역 · 관리자 목록이 "N 빙옥"으로 적는다
  pointOnly: { type: Boolean, default: false },
  // 실제로 뺀 값 — 낸 화폐 단위 그대로. 환불 · 관리자 초기화가 이 값을 그대로 돌려준다
  paidXp: { type: Number, default: 0 },
  paidPoint: { type: Number, default: 0 },
  // 📌 지갑에서 실제로 빠졌는지. 관리자가 무료로 사던 시절 기록에도 paidXp 가 적혀 있어서,
  //    관리자 테스트 초기화(app/api/xp/reset)는 이 표시가 있는 건만 돌려준다 (없으면 공짜 XP 가 생긴다)
  billed: { type: Boolean, default: false },
  // 📌 캐시백(아이템 효과 shopCashback)으로 돌려준 XP — 결제 뒤 이 건의 paidXp × 캐시백 %(버림). 환불 · 취소 때 이만큼 회수한다
  cashbackXp: { type: Number, default: 0 },
  // 📌 소모형 아이템(연속 출석 보호막 — 효과 streakShield)을 쓴 시각. 있으면 보유에서 빠진다(lib/ownedItems.js · 봇 사본 둘 다).
  //    봇(attend)이 { consumedAt: null } 조건부 갱신으로 한 번만 세운다. bot/src/db.js 의 Purchase 스키마에도 같은 칸이 있어야 한다
  consumedAt: { type: Date, default: null },
  // 📌 기간제 역할 — days가 0이면 영구. 지급 시각 기준으로 expiresAt을 세우고,
  //    기간이 지나면 봇이 역할을 회수하며 status를 expired로 바꾼다.
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
  // 📌 만료 임박 DM 을 보낸 시각 — 봇(expiryReminder)이 조건부로 세워 한 번만 보낸다. 연장으로 만료가 밀리면 다시 비운다
  reminderSentAt: { type: Date, default: null },
  // 📌 연장 구매 — 이어 붙인 원래 구매 _id("" 이면 새 구매) · 연장분이 시작되는 시각(표시용)
  renewOf: { type: String, default: "" },
  startsAt: { type: Date, default: null },
  // 📌 사이트 보유 — 소유는 그대로 두고 디스코드 역할 표기만 뗀 상태.
  //    시즌이 바뀌면 디스코드가 역할로 지저분해지므로 표기를 사이트로 옮긴다.
  //    만료(expired)와는 다르다 — 물건은 계속 갖고 있고 인벤토리에도 그대로 뜬다.
  siteOnly: { type: Boolean, default: false },
  siteOnlyAt: { type: Date, default: null },
  // 봇이 디스코드 역할을 실제로 뗐는지 (사이트가 표시를 바꾼 시점과 다를 수 있다)
  roleDetached: { type: Boolean, default: false },
  status: { type: String, default: "pending", index: true }, // pending | completed | expired | cancelled | refunded(완료 후 관리자 환불)
  contact: { type: String, default: "" },   // 실물 상품 수령 정보 (구매자 입력)
  adminNote: { type: String, default: "" }, // 운송장 번호 등
  error: { type: String, default: "" },     // 역할 지급 실패 사유
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});

// 📌 상점 추천 집계(app/api/shop/recommend) — 최근 N일 · 구매로 세는 상태만 최신순으로 읽는다
PurchaseSchema.index({ createdAt: -1, status: 1 });

export default mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);
