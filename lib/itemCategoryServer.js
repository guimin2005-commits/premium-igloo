// 📌 구매 건(Purchase)에 분류 · 짧은 이름 붙이기 — 서버 전용(DB). 규칙은 lib/itemCategory.js(화면에서도 쓰는 순수 함수) 한 곳.
//    구매 내역(app/api/shop/purchase GET — ARCTIC 주문 내역 · 장바구니 · 결제의 보유 판정) · 관리자 주문 목록(app/api/shop/orders GET)이 같이 쓴다.
//    분류 원천은 인벤토리(lib/inventory.js)와 같은 차례 — 등록 아이템(itemRef · 상품의 itemId) > 상품(itemId) > 구매 스냅샷(itemName · itemType).
//    이름(shortName)은 구매 스냅샷(itemName)에서 옛 머리말만 뗀 것 — 산 때의 이름 그대로 보인다.
//    📌 상품 초안(lib/catalogDraft.js) — 표시용이라 초안을 덧씌운 보기(catalogFind). 실사이트 모드는 find(...).lean() 하나씩
import mongoose from "mongoose";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import { catalogFind } from "@/lib/catalogDraft";
import { displayCategoryOf, resolveCategory, shortNameOf } from "@/lib/itemCategory";

const validIds = (list) => [...new Set(list.map((v) => String(v || "")).filter((v) => mongoose.isValidObjectId(v)))];

// 📌 rows(Purchase lean) → 같은 순서 · 같은 칸 + categoryLabel · shortName, 세트 구성 건(bundleName)이면 bundleCategoryLabel(세트 상품의 분류 — 세트는 「세트」 또는 직접 정한 분류).
//    조회가 실패하면 구매 스냅샷만으로 정한다(목록은 늘 나간다)
export async function withPurchaseCategories(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return list;
  let shopById = new Map();
  let itemById = new Map();
  try {
    const shopIds = validIds(list.map((r) => r.itemId));
    const shops = shopIds.length
      ? await catalogFind(ShopItem, { _id: { $in: shopIds } }, { select: { name: 1, type: 1, category: 1, itemId: 1 } })
      : [];
    shopById = new Map(shops.map((s) => [String(s._id), s]));
    const itemIds = validIds([...list.map((r) => r.itemRef), ...shops.map((s) => s.itemId)]);
    const items = itemIds.length
      ? await catalogFind(Item, { _id: { $in: itemIds } }, { select: { name: 1, type: 1, category: 1, effects: 1 } })
      : [];
    itemById = new Map(items.map((i) => [String(i._id), i]));
  } catch (e) {
    console.error("구매 건 분류 조회 오류:", e);
  }
  return list.map((r) => {
    const shopItem = shopById.get(String(r.itemId || "")) || null;
    const item = (r.itemRef && itemById.get(String(r.itemRef))) || (shopItem?.itemId && itemById.get(String(shopItem.itemId))) || null;
    return {
      ...r,
      categoryLabel: displayCategoryOf({ item, shopItem, purchase: r }),
      shortName: shortNameOf(r.itemName),
      ...(r.bundleName ? { bundleCategoryLabel: shopItem ? resolveCategory(shopItem) : resolveCategory({ type: "bundle" }) } : {}),
    };
  });
}
