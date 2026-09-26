import mongoose from "mongoose";

// 📌 아이템 등록 — 인벤토리 / 상점 상품 / 시즌 패스 보상이 함께 쓰는 표기의 단일 원천.
//    관리자가 여기서 이름·설명·아이콘·색·유형·연결 역할을 한 번 정하면
//    (1) 인벤토리 표시가 이 값으로 그려지고, (2) 상점 상품 등록 때 골라 쓰고, (3) 시즌 패스 보상으로도 고른다.
//    봇에는 이 모델이 없다 — 봇은 Purchase 스냅샷(itemType/roleId/itemName)만 본다.
//
//    type  role     : 디스코드 역할 표기 (시즌 전환 때 떼는 대상이 될 수 있다)
//          perk     : 권한 역할 — 역할이 곧 기능이라 시즌 전환에도 떼지 않는다 (detachOnSeason 항상 false)
//          item     : 수집품 — roleId 가 있으면 보유자 인벤토리에 자동 표시 + 지급 시 역할 부여, 없으면 사이트 보유
//          physical : 기프트카드 — 역할 없음
const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 40 },
  description: { type: String, default: "", maxlength: 300 }, // 줄바꿈(\n) 허용 — 정리는 lib/items.js normalizeDescription
  icon: { type: String, default: "" },            // 이모지 또는 짧은 텍스트(≤8자). 비면 유형별 기본 SVG
  imageUrl: { type: String, default: "" },        // 있으면 icon 대신 이미지
  color: { type: String, default: "" },           // "#rrggbb". 비면 유형 기본색 (lib/items.js ITEM_TYPE_COLOR)
  type: { type: String, default: "item", enum: ["role", "perk", "item", "physical"] },
  roleId: { type: String, default: "" },
  roleName: { type: String, default: "" },
  detachOnSeason: { type: Boolean, default: false }, // role 유형만 의미. perk 는 항상 false
  visible: { type: Boolean, default: true },         // 인벤토리에 표시
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Item || mongoose.model("Item", ItemSchema);
