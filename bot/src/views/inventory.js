// ── /인벤토리 표시용 계산 — 보유 아이템 목록 글 + 이미지 카드 칸 ──
//    보유 판정은 itemEffects.js 의 ownedItemList(사이트 lib/ownedItems.js 와 같은 규칙)를 그대로 쓴다.
//    봇은 읽기만 한다 — 절대 저장하지 않는다.
import { Item, ShopItem, Purchase, UserXp } from "../db.js";
import { ownedItemList, pickCardSkin } from "../itemEffects.js";
import { formatUntil } from "../botMessages.js";

const MAX_LINES = 25; // 설명 한도(4,096자) 안에 넉넉히 — 넘으면 "외 N개"
const MAX_BADGES = 3; // 사이트 lib/itemEffects.js MAX_BADGES 와 같다

// 이름에 섞인 마크다운 기호가 굵게 · 기울임을 깨지 않게
const esc = (s) => String(s || "").replace(/([\\*_~|`>])/g, "\\$1");

// 📌 착용 중 — 사이트 app/api/shop/my-items 와 같은 규칙(lib/itemEffects.js perksOfItems · pickCardSkin · pickBadges).
//    카드 스킨: 가진 스킨(관리자 순서 · 기프트카드 제외) 중 UserXp.cardSkinPick("" 안 고름 → 첫 스킨, "none" 끔). 같은 스킨 키 아이템은 모두 착용
//    배지: 배지 효과 아이템(관리자 순서) — badgePick 이 배열이 아니면 산 것(bought) 중 앞의 3개, 배열이면 그중 가진 것(최대 3)
const effectsOf = (item) => (Array.isArray(item?.effects) ? item.effects : []);
const skinOf = (item) => (item?.type === "physical" ? "" : String(effectsOf(item).find((e) => e?.on === "cardSkin" && e.skin)?.skin || ""));
const isBadge = (item) => item?.type !== "physical" && effectsOf(item).some((e) => e?.on === "profileBadge");
async function wornOf(userId, owned) {
  const skins = [];
  for (const { item } of owned) {
    const s = skinOf(item);
    if (s && !skins.includes(s)) skins.push(s);
  }
  const badges = owned.filter(({ item }) => isBadge(item)).map(({ item }) => String(item._id));
  // 안 고른 유저의 자동 표시는 상점에서 산 배지만(사이트 lib/itemEffects pickBadges 와 같다)
  const boughtBadges = owned.filter(({ item, bought }) => isBadge(item) && bought).map(({ item }) => String(item._id));
  if (!skins.length && !badges.length) return { skin: "", badges: new Set() };
  const pick = await UserXp.findOne({ userId }, { cardSkinPick: 1, badgePick: 1 }).lean();
  const skin = pickCardSkin(skins, pick?.cardSkinPick || "");
  const on = Array.isArray(pick?.badgePick) ? new Set(pick.badgePick.map(String)) : null;
  return { skin, badges: new Set((on ? badges.filter((id) => on.has(id)) : boughtBadges).slice(0, MAX_BADGES)) };
}

/**
 * @param {import("discord.js").GuildMember} member
 * @returns {Promise<{ items: string, itemCount: number, bag: object[] }>}
 *   bag — 이미지 카드용(inventoryCardData): [{ name, type, icon, imageUrl, color, count, expiresAt, pending, worn }] (관리자 순서)
 */
export async function inventoryView(member) {
  // 📌 길드가 캐시에 없으면 interaction.member 가 날것(API) 모양이라 id 가 user.id 에, 역할이 id 배열에 있다
  const userId = member?.id || member?.user?.id;
  const [purchases, items, shopItems] = await Promise.all([
    Purchase.find(
      { userId, status: { $in: ["pending", "completed"] }, consumedAt: null }, // 다 쓴 보호막은 목록에서 뺀다
      { status: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1 }
    ).lean(),
    // effects · unitSale · durations — ×N 묶음 판정용(ownedItemList) · icon · imageUrl · color — 카드 아이콘
    Item.find({}, { name: 1, type: 1, roleId: 1, visible: 1, sortOrder: 1, createdAt: 1, effects: 1, icon: 1, imageUrl: 1, color: 1 })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean(),
    ShopItem.find({}, { itemId: 1, type: 1, roleId: 1, unitSale: 1, durations: 1 }).lean(),
  ]);
  const roles = member?.roles?.cache;
  const heldRoles = roles ? [...roles.keys()] : Array.isArray(member?.roles) ? member.roles.map(String) : null;
  const owned = ownedItemList({ purchases, items, shopItems, heldRoles });

  // 📌 여러 개 가진 것(1개 단위 상품 · 소모품 — count)은 "**이름** ×N" — 쓰면 줄어드는 것이라 "영구"는 붙이지 않는다(사이트 인벤토리와 같은 표기).
  //    모두 기간제면 가장 빠른 만료(먼저 쓰이는 것)를 붙인다
  const lines = owned.slice(0, MAX_LINES).map(({ item, expiresAt, pending, count }) => {
    const name = `**${esc(item.name) || "아이템"}**`;
    if (count > 1) return `${name} ×${count}${expiresAt ? ` · ${formatUntil(expiresAt).slice(0, 10)} 까지` : ""}${pending ? " · 지급 대기" : ""}`;
    const until = expiresAt ? `${formatUntil(expiresAt).slice(0, 10)} 까지` : "영구";
    return `${name} · ${until}${pending ? " · 지급 대기" : ""}`;
  });
  if (owned.length > MAX_LINES) lines.push(`외 ${(owned.length - MAX_LINES).toLocaleString("ko-KR")}개`);

  const worn = await wornOf(userId, owned).catch(() => ({ skin: "", badges: new Set() }));
  const bag = owned.map(({ item, expiresAt, pending, count }) => {
    const skin = skinOf(item);
    return {
      name: item.name || "",
      type: item.type || "item",
      icon: item.icon || "",
      imageUrl: item.imageUrl || "",
      color: item.color || "",
      count,
      expiresAt,
      pending: !!pending,
      worn: (!!skin && skin === worn.skin) || worn.badges.has(String(item._id)),
    };
  });

  return {
    items: lines.length ? lines.join("\n") : "보유한 아이템이 없습니다.",
    itemCount: owned.length,
    bag,
  };
}

/**
 * 📌 /인벤토리 이미지 카드 data(botCards.js cmdInventory 모양) — inventoryView 의 bag 으로 만든다.
 *    칸(cards.BAG_SLOTS)보다 많으면 착용 중인 것을 앞으로 당기고 마지막 칸은 "+n". 아이템 이미지는 보이는 칸만 받는다(1.5초 · 캐시) —
 *    못 받으면 유형 기본 아이콘. 남은 일수는 사이트 가방과 같은 올림(D-n)
 * @param {{ bag: object[], itemCount: number }} v
 * @param {string} name
 * @param {object} cards 그림 모듈(botCards.js) — buildMessageWithCard 가 넘겨준다
 */
export async function inventoryCardData(v, name, cards) {
  const slots = cards?.BAG_SLOTS || 12;
  const all = Array.isArray(v?.bag) ? v.bag : [];
  const list = all.length > slots ? [...all.filter((b) => b.worn), ...all.filter((b) => !b.worn)] : all;
  const shown = list.slice(0, all.length > slots ? slots - 1 : slots);
  const now = Date.now();
  const items = await Promise.all(
    shown.map(async (b) => {
      const image = b.imageUrl && cards?.fetchImageDataUri ? await cards.fetchImageDataUri(b.imageUrl).catch(() => null) : null;
      const exp = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
      return {
        name: b.name,
        type: b.type,
        color: b.color,
        icon: b.imageUrl && !image ? "" : b.icon,
        image,
        count: b.count,
        pending: b.pending,
        worn: b.worn,
        days: exp ? Math.max(0, Math.ceil((exp - now) / 86400000)) : null,
      };
    })
  );
  return { name, total: v?.itemCount ?? all.length, items };
}
