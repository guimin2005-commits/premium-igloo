import mongoose from "mongoose";

// 📌 ARCTIC 상품 — 레벨 대시보드(상품 관리)에서 등록, /shop 에서 판매
//    type "role"    : 역할 상품 — 구매 즉시 봇이 역할 자동 지급
//    type "perk"    : 권한 상품 — 역할 지급으로 특정 권한을 부여 (역할과 동일 동작, 분류만 다름)
//    type "item"    : 아이템 — 역할이 있으면 역할 지급, 없으면 사이트 인벤토리 보유
//    type "cosmetic": 꾸미기 — 역할 없음, 사이트 인벤토리 보유 (카드 스킨·프로필 배지 등)
//    type "physical": 기프트카드 — 구매 후 관리자가 확인·발송
const ShopItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, default: "" },
  imageUrl: { type: String, default: "" },       // 상품 고유 이미지 (외부 URL) — 아이템 연동과 무관하게 편집한다
  // 📌 아이템 등록(models/Item) 참조 — "" 이면 직접 설정한 상품.
  //    값이 있으면 name/description/icon/color/type/roleId/roleName/detachOnSeason 과 itemImageUrl 은
  //    서버가 Item 에서 복사해 둔 스냅샷이다 (Item 을 고치면 admin/items 가 다시 써 준다).
  itemId: { type: String, default: "" },
  itemImageUrl: { type: String, default: "" },   // Item.imageUrl 스냅샷 — 상품 이미지가 비었을 때 카드에 쓴다
  icon: { type: String, default: "" },           // 이모지·짧은 텍스트 — 이미지가 없을 때 카드에 크게 찍힌다
  // 📌 카드 배경 장면 — lib/itemBackdrops.js 의 키(public/backdrops/<key>.png). "" 이면 지금처럼 등록 색을 옅게 깐 바탕.
  //    상품 고유 값이라 아이템 연동(itemId)과 무관하게 관리자가 고른다. 이미지(imageUrl · itemImageUrl)가 있으면 이미지가 이긴다
  backdrop: { type: String, default: "" },
  color: { type: String, default: "" },          // "#rrggbb" — 비면 유형 기본색 (lib/items.js)
  type: { type: String, default: "role" },       // "role" | "perk" | "item" | "cosmetic" | "physical"
  roleId: { type: String, default: "" },         // role·perk 일 때 지급할 역할
  roleName: { type: String, default: "" },       // 표시용
  price: { type: Number, required: true },       // 정가 (소모 XP) — 기간제면 표시·정렬용 기준가
  // 📌 기간제 역할 — 정해진 기간만 보유하고 지나면 봇이 회수한다.
  //    비어 있으면 한 번 사면 계속 갖는 영구 상품 (기존 동작 그대로).
  durations: {
    type: [{ days: Number, price: Number }],
    default: [],
  },
  // 📌 1개 단위 판매(수량 판매 — "1회 소모권" 같은 것) — 켜면 한 번에 여러 개를 사고 인벤토리에 ×N 으로 쌓인다(1인 1개 제한 없음).
  //    역할이 없는 아이템 · 꾸미기만 켤 수 있고 기간제(durations)와 함께 켤 수 없다 — 규칙은 lib/unitSale.js 한 곳(상품 저장 API 가 최종 판정).
  //    maxPerOrder: 한 결제에서 살 수 있는 최대 개수(1~99). 1개 단위가 아니면 0(= 1개)
  unitSale: { type: Boolean, default: false },
  maxPerOrder: { type: Number, default: 0 },
  // 📌 세트 상품(type "bundle") — 등록 아이템 여러 개를 한 상품으로. 규칙 · 계산은 lib/bundle.js 한 곳(정리 normalizeBundle · 값 bundleQuote).
  //    { itemId: Item id, days: 0 = 영구 | N일, qty: 개수(역할 없고 영구일 때만 2 이상), value: 몸값 XP — 이미 가진 구성만큼 세트 값을 깎는 비율 }
  //    세트는 itemId(아이템 연결) · roleId · durations · unitSale 을 쓰지 않는다. 바로 구매만(장바구니 결제는 받지 않는다)
  bundle: {
    type: [{ _id: false, itemId: String, days: Number, qty: Number, value: Number }],
    default: [],
  },
  // 📌 시즌이 바뀔 때 디스코드 역할만 떼고 사이트 인벤토리에는 그대로 남길지.
  //    표시용 역할 상품에만 켠다. 권한 상품(perk)은 역할이 곧 디스코드 기능이라
  //    떼면 기능이 사라지므로 켜면 안 된다. 기본값 false — 실수로 권한이 날아가지 않게.
  detachOnSeason: { type: Boolean, default: false },
  // 📌 빙옥 전용 결제 — 켜면 XP 로는 못 산다(기프트카드 같은 시즌 상품). 가격은 그대로 XP 로 저장하고(1 빙옥 = 1,000 XP 의 배수),
  //    화면은 "N 빙옥"으로만 보이며 결제 API 는 빙옥에서만 뺀다 (lib/shopPay.js). 관리자 폼은 빙옥으로 받아 ×1,000 해 저장한다
  pointOnly: { type: Boolean, default: false },
  discountPct: { type: Number, default: 0 },     // 할인율 % (0이면 할인 없음)
  discountUntil: { type: Date, default: null },  // 할인 종료 시각 — 지나면 할인이 저절로 끝난다(null 이면 기한 없음). lib/shopPricing discountActive
  stock: { type: Number, default: -1 },          // -1 = 무제한
  soldCount: { type: Number, default: 0 },
  active: { type: Boolean, default: true },      // 판매 중 여부
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ShopItem || mongoose.model("ShopItem", ShopItemSchema);
