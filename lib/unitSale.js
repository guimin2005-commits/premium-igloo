import { hasConsumable } from "./itemEffects.js";
import { isBundle } from "./bundle.js";

// 📌 1개 단위 판매(수량 판매) — "1회 소모권"처럼 한 번에 여러 개를 사고, 가진 만큼 인벤토리에 ×N 으로 쌓이는 상품.
//    · 대상: 역할이 없는 아이템 · 꾸미기 상품(ShopItem.unitSale). 효과가 없어도 된다 — 닉네임 변경권처럼 운영진이 손으로 쓰는 소모권도 판다.
//      기프트카드(실물) · 역할 · 권한 상품, 역할이 연결된 아이템은 대상이 아니다(역할은 여러 개 가질 수 없다).
//    · 기간제(durations)와 함께 켤 수 없다 — 1개마다 기간이 따로 흐르고 연장 고리가 1개마다 생긴다. 켜면 기간제 가격표는 비운다.
//    · 1개가 Purchase 한 건이다(한 결제의 건들은 orderId 로 묶는다). 1인 1개 제한(app/api/shop/_lib/renewal.js)에서 빠진다.
//    · 쓰기(소모)는 lib/itemConsume.js consumeOne — 먼저 끝나는 것 · 먼저 받은 것부터 1개씩.
//    화면(상품 폼 · 상세 · 장바구니) · 결제 API · 상품 저장 API 가 모두 이 파일의 판정을 쓴다. DB 의존 없음(화면에서도 부른다)
export const UNIT_TYPES = ["item", "cosmetic"];
export const MAX_PER_ORDER = 99;
export const DEFAULT_PER_ORDER = 10;

// 이 유형 · 역할이면 1개 단위로 팔 수 있나
export const unitSaleAllowed = (type, roleId) => UNIT_TYPES.includes(String(type || "")) && !String(roleId || "").trim();

// 상품이 지금 1개 단위 판매인가 — 저장값이 켜져 있어도 조건(역할 없음 · 기간제 아님)이 깨졌으면 아니다
export const isUnitSale = (item) =>
  !!item?.unitSale && unitSaleAllowed(item?.type, item?.roleId) && !(Array.isArray(item?.durations) && item.durations.length > 0);

// 1회 최대 수량 — 1개 단위가 아니면 1(1인 1개)
//    📌 입력값: 비었거나 숫자가 아니면 기본값, 숫자면 1 ~ 99 로 자른다(0 을 넣으면 1 — 기본값으로 튀지 않게).
//       저장값 0 은 "정하지 않음"(모델 기본값)이라 기본값으로 읽는다(maxPerOrderOf)
export const clampPerOrder = (v) => {
  const n = v == null || (typeof v === "string" && !v.trim()) ? NaN : Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_PER_ORDER, Math.floor(n))) : DEFAULT_PER_ORDER;
};
export const maxPerOrderOf = (item) => (isUnitSale(item) ? clampPerOrder(item.maxPerOrder || DEFAULT_PER_ORDER) : 1);

// 한 번에 담을 수 있는 최대 — 1회 최대와 남은 재고 중 작은 값(재고 무제한이면 1회 최대). 품절이면 0
export const qtyCapOf = (item) => {
  const m = maxPerOrderOf(item);
  const stock = Number(item?.stock);
  return Number.isFinite(stock) && stock >= 0 ? Math.max(0, Math.min(m, stock)) : m;
};

// 📌 ×N 으로 묶는 "같은 물건" 키 모음 — 등록 아이템이면 "i:<Item id>", 직접 설정 상품이면 "s:<ShopItem id>".
//    1개 단위 상품이 가리키는 물건 + 역할 없는 소모형 아이템(보호막 — 수동 지급 · 시즌 패스로 여러 개 받을 수 있다)
//    + 세트 상품(lib/bundle.js)에 2개 이상(qty) 넣은 구성 아이템 — 1개마다 Purchase 한 건(itemRef = 그 아이템)이라 쌓인다.
//      📌 세트는 shopItems 에 type · bundle 칸이 있어야 잡힌다(부르는 곳의 ShopItem 조회 칸에 bundle 을 넣을 것)
//    인벤토리(app/api/shop/my-items) · 관리자 유저 조회의 1개 사용(app/api/admin/users/consume)이 같은 키를 쓴다
export function unitThingSet(shopItems, items) {
  const set = new Set();
  const itemList = Array.isArray(items) ? items : [];
  const itemById = new Map(itemList.filter(Boolean).map((i) => [String(i._id), i]));
  for (const s of Array.isArray(shopItems) ? shopItems : []) {
    if (isUnitSale(s)) set.add(s.itemId ? `i:${s.itemId}` : `s:${s._id}`);
    if (!isBundle(s) || !Array.isArray(s.bundle)) continue;
    for (const c of s.bundle) {
      const id = String(c?.itemId || "");
      if (!id || !(Number(c?.qty) > 1)) continue;
      // 역할이 붙은 아이템은 묶지 않는다(1개 단위 판매와 같은 조건). 아이템을 안 받았으면 세트 구성대로
      const it = itemById.get(id);
      if (it && !unitSaleAllowed(it.type, it.roleId)) continue;
      set.add(`i:${id}`);
    }
  }
  for (const i of itemList) {
    if (i && unitSaleAllowed(i.type, i.roleId) && hasConsumable(i)) set.add(`i:${i._id}`);
  }
  return set;
}

// 구매 건 하나 → 같은 물건 키 — 인벤토리(my-items)의 표기 원천 순서와 같다: Item(itemRef) > Item(상품이 가리키는 아이템) > 상품
//    shopRefOf: 상품 id → 그 상품의 itemId("" 이면 직접 설정) · itemIds: 있는 Item id 모음
export function thingOfPurchase(p, shopRefOf, itemIds) {
  const ref = p?.itemRef && itemIds.has(String(p.itemRef)) ? String(p.itemRef) : "";
  const via = shopRefOf.get(String(p?.itemId)) || "";
  const item = ref || (via && itemIds.has(via) ? via : "");
  if (item) return `i:${item}`;
  return shopRefOf.has(String(p?.itemId)) ? `s:${p.itemId}` : "";
}
