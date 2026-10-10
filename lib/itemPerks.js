// 📌 상시형 아이템 효과(perk) 읽기 — 사이트에서 "지금 이 유저가 가진 상시 효과"를 묻는 한 곳 (서버 전용).
//    · 보유 판정: lib/ownedItems.js (인벤토리 · 봇과 같은 (A)(B) 규칙, 소모된 건 제외)
//    · 합산 · 상한 · 배지 · 카드 스킨: lib/itemEffects.js perksOfItems (화면도 부를 수 있는 순수 함수)
//    · 디스코드 역할: lib/discordMember.js 캐시(60초) — 조회에 실패하면(null) 구매 건(A)만 본다
//    쓰는 곳: 강화 비용 할인(app/api/xp/enhance · xp/me) · 캐시백(shop/checkout · purchase) · 퀘스트 보상(xp/quests)
//    ⚠️ 봇 사본은 bot/src/itemEffects.js perksOf(member) — 같은 규칙 · 같은 상한이어야 한다
import { connectToDatabase } from "@/lib/mongodb";
import { fetchMemberRoleInfo } from "@/lib/discordMember";
import { ownedItems } from "@/lib/ownedItems";
import { perksOfItems, normalizeEffects, pickBadges } from "@/lib/itemEffects";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";

// 보유 판정 재료 — 봇(bot/src/itemEffects.js)이 읽는 조건과 같게: 결제된 건(pending · completed) · 기프트카드 제외 · 소모 안 된 것
export const OWN_PURCHASE_QUERY = (userId) => ({
  userId,
  status: { $in: ["pending", "completed"] },
  itemType: { $ne: "physical" },
  consumedAt: null,
});
export const OWN_PURCHASE_FIELDS = { status: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1, consumedAt: 1 };
// 효과 · 배지 표기에 필요한 아이템 칸 (sortOrder · createdAt 순 — "첫 아이템" · 관리자 순서)
export const PERK_ITEM_FIELDS = {
  name: 1, type: 1, roleId: 1, visible: 1, icon: 1, imageUrl: 1, color: 1,
  chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1, effects: 1, sortOrder: 1, createdAt: 1,
};

// 이 유저가 지금 가진 아이템 — heldRoles 를 주면(배열 · Set · null) 그대로 쓰고, 안 주면(undefined) 디스코드 캐시에서 읽는다
export async function loadOwnedItems(userId, { heldRoles } = {}) {
  if (!userId) return [];
  await connectToDatabase();
  const [roles, purchases, items, shopItems] = await Promise.all([
    heldRoles !== undefined ? heldRoles : fetchMemberRoleInfo(userId).then((r) => r.roles).catch(() => null),
    Purchase.find(OWN_PURCHASE_QUERY(userId), OWN_PURCHASE_FIELDS).lean(),
    Item.find({}, PERK_ITEM_FIELDS).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    ShopItem.find({}, { itemId: 1 }).lean(),
  ]);
  return ownedItems({ purchases, items, shopItems, heldRoles: roles });
}

// 📌 여러 유저의 프로필 배지를 한 번에 — 랭킹(app/api/xp/leaderboard)용. 반환: Map(userId → badges[] — 유저가 정한 순서, 배지 없는 유저는 빠진다)
//    유저가 단 배지(badgePick)를 적용한다(lib/itemEffects pickBadges — 내 정보 · 인벤토리와 같은 규칙).
//    읽기는 아이템 · 상품 · 구매 기록 · 고른 배지 각 한 번(유저 수와 무관). 배지 효과 아이템이 하나도 없으면 구매 기록은 읽지 않는다.
//    📌 구매 기록 기준 보유(A)만 본다(heldRoles null) — 한 쪽이 최대 100명이라 유저마다 디스코드 멤버(역할)를 물으면
//       요청이 몰려 429 · 지연이 난다. 구매 기록 없이 역할만 든 경우(B)는 랭킹에서 배지가 빠질 수 있다(내 정보는 역할까지 본다).
export async function badgesOfUsers(userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean).map(String))];
  const out = new Map();
  if (!ids.length) return out;
  await connectToDatabase();
  const items = await Item.find({}, PERK_ITEM_FIELDS).sort({ sortOrder: 1, createdAt: 1 }).lean();
  if (!items.some((it) => it.type !== "physical" && normalizeEffects(it.effects).some((e) => e.on === "profileBadge"))) return out;
  const [purchases, shopItems, pickDocs] = await Promise.all([
    Purchase.find({ ...OWN_PURCHASE_QUERY(null), userId: { $in: ids } }, { ...OWN_PURCHASE_FIELDS, userId: 1 }).lean(),
    ShopItem.find({}, { itemId: 1 }).lean(),
    // 📌 단 배지(UserXp.badgePick) — 고른 유저만 한 번에. 칸이 없는 유저는 배지 없음(2026-10-04 자동으로 달지 않음 — pickBadges)
    UserXp.find({ userId: { $in: ids }, badgePick: { $exists: true } }, { userId: 1, badgePick: 1 }).lean(),
  ]);
  const pickOf = new Map(pickDocs.map((d) => [d.userId, d.badgePick]));
  const byUser = new Map();
  for (const p of purchases) {
    const list = byUser.get(p.userId);
    if (list) list.push(p);
    else byUser.set(p.userId, [p]);
  }
  for (const [userId, mine] of byUser) {
    const { allBadges } = perksOfItems(ownedItems({ purchases: mine, items, shopItems, heldRoles: null }));
    const badges = pickBadges(allBadges, pickOf.get(userId));
    if (badges.length) out.set(userId, badges);
  }
  return out;
}

// → { enhanceDiscount, shopCashback, questBonus, passBoost, cooldownCut, muteRelief, badges: [...], allBadges: [...], cardSkin, cardSkins, avatarFrames }
//    합은 상한을 적용한 값(%, cooldownCut 만 초). 가진 게 없으면 전부 0 · [] · ""
export async function getPerks(userId, { heldRoles } = {}) {
  if (!userId) return perksOfItems([]);
  return perksOfItems(await loadOwnedItems(userId, { heldRoles }));
}
