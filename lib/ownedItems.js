// 📌 보유 아이템 판정 — "인벤토리에 들고 있는 아이템" 을 고르는 단일 규칙 (아이템 효과가 이 판정으로 붙는다).
//    디스코드 역할 보유와 무관하다 — 역할 없는 아이템(예: XP Boost+) · 사이트 보유(siteOnly) · 지급 대기(pending) ·
//    역할이 회수된 완료 건도 구매 건이 살아 있으면 보유다.
//    해석은 인벤토리(app/api/shop/my-items/route.js)의 (A)(B) 와 같다:
//      (A) 구매 건 — 상태 pending(결제 완료 · 봇 지급 대기) · completed, 기간이 남은 것(expiresAt 이 없거나 지금보다 뒤)
//          Item(itemRef) > Item(ShopItem.itemId) > (상품도 아이템도 못 찾은 옛 건만) 같은 역할의 첫 아이템(숨김 포함)
//          역할형(role · perk · item) 구매의 roleId 는 아이템을 찾았든 못 찾았든 "본 역할" 로 적는다
//      (B) 구매 기록 없이 들고 있는 역할 — (A)가 본 역할이 아니면 그 역할의 첫 "표시" 아이템(visible !== false)
//    ⚠️ 효과가 있는 아이템만 골라 찾지 않는다 — 첫 아이템에 효과가 없으면 효과 없음이다(뒤의 아이템으로 넘어가지 않는다).
//    ⚠️ 봇 사본(bot/src/itemEffects.js)과 반드시 같은 규칙이어야 한다 — 봇은 별도 배포라 이 파일을 import 하지 못한다.
//       여기를 고치면 봇도 함께 고칠 것.
//
//    입력: purchases  — 이 유저의 구매 건(status · itemRef · itemId · roleId · itemType · expiresAt)
//          items      — 전체 Item (sortOrder, createdAt 오름차순 — "첫 아이템" 이 이 순서를 따른다)
//          shopItems  — 전체 ShopItem (_id · itemId)
//          heldRoles  — 디스코드 보유 역할 id (배열 또는 Set). 모르면 null — 그러면 (A)만 본다
//          now        — 기준 시각(ms)
//    반환: 겹치지 않는 Item 문서 배열 — 같은 아이템을 두 번 사도 한 번(효과도 한 번)

const OWN_STATUS = new Set(["pending", "completed"]);
const ROLE_LIKE = new Set(["role", "perk", "item"]);

export function ownedItems({ purchases, items, shopItems, heldRoles, now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);

  const itemById = new Map();
  const itemByRole = new Map();        // (A) 옛 건 fallback — 숨김 포함 첫 아이템
  const visibleItemByRole = new Map(); // (B) — 표시 중인 첫 아이템
  for (const i of Array.isArray(items) ? items : []) {
    if (!i) continue;
    itemById.set(String(i._id), i);
    if (!i.roleId) continue;
    if (!itemByRole.has(i.roleId)) itemByRole.set(i.roleId, i);
    if (i.visible !== false && !visibleItemByRole.has(i.roleId)) visibleItemByRole.set(i.roleId, i);
  }
  const shopById = new Map((Array.isArray(shopItems) ? shopItems : []).map((s) => [String(s._id), s]));

  const owned = new Map(); // String(Item._id) → Item
  const seenRoles = new Set();

  // ── (A) 구매·패스로 얻은 것 ──
  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (!p || !OWN_STATUS.has(p.status)) continue;
    if (p.expiresAt && new Date(p.expiresAt).getTime() <= nowMs) continue;

    const shop = shopById.get(String(p.itemId)) || null;
    let item =
      (p.itemRef && itemById.get(String(p.itemRef))) ||
      (shop?.itemId && itemById.get(String(shop.itemId))) ||
      null;
    if (!item && !shop && p.roleId) item = itemByRole.get(p.roleId) || null;
    if (item) owned.set(String(item._id), item);

    if (p.roleId && ROLE_LIKE.has(p.itemType)) seenRoles.add(p.roleId);
  }

  // ── (B) 구매 기록 없이 들고 있는 역할 ──
  if (heldRoles) {
    for (const roleId of heldRoles) {
      if (seenRoles.has(roleId)) continue;
      const item = visibleItemByRole.get(roleId);
      if (item) owned.set(String(item._id), item);
    }
  }

  return [...owned.values()];
}
