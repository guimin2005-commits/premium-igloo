// ── /인벤토리 표시용 계산 — 보유 아이템 목록 글 ──
//    보유 판정은 itemEffects.js 의 ownedItemList(사이트 lib/ownedItems.js 와 같은 규칙)를 그대로 쓴다.
//    봇은 읽기만 한다 — 절대 저장하지 않는다.
import { Item, ShopItem, Purchase } from "../db.js";
import { ownedItemList } from "../itemEffects.js";
import { formatUntil } from "../botMessages.js";

const MAX_LINES = 25; // 설명 한도(4,096자) 안에 넉넉히 — 넘으면 "외 N개"

// 이름에 섞인 마크다운 기호가 굵게 · 기울임을 깨지 않게
const esc = (s) => String(s || "").replace(/([\\*_~|`>])/g, "\\$1");

/**
 * @param {import("discord.js").GuildMember} member
 * @returns {Promise<{ items: string, itemCount: number }>}
 */
export async function inventoryView(member) {
  // 📌 길드가 캐시에 없으면 interaction.member 가 날것(API) 모양이라 id 가 user.id 에, 역할이 id 배열에 있다
  const userId = member?.id || member?.user?.id;
  const [purchases, items, shopItems] = await Promise.all([
    Purchase.find(
      { userId, status: { $in: ["pending", "completed"] }, consumedAt: null }, // 다 쓴 보호막은 목록에서 뺀다
      { status: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1 }
    ).lean(),
    Item.find({}, { name: 1, type: 1, roleId: 1, visible: 1, sortOrder: 1, createdAt: 1 }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    ShopItem.find({}, { itemId: 1 }).lean(),
  ]);
  const roles = member?.roles?.cache;
  const heldRoles = roles ? [...roles.keys()] : Array.isArray(member?.roles) ? member.roles.map(String) : null;
  const owned = ownedItemList({ purchases, items, shopItems, heldRoles });

  const lines = owned.slice(0, MAX_LINES).map(({ item, expiresAt, pending }) => {
    const until = expiresAt ? `${formatUntil(expiresAt).slice(0, 10)} 까지` : "영구";
    return `**${esc(item.name) || "아이템"}** · ${until}${pending ? " · 지급 대기" : ""}`;
  });
  if (owned.length > MAX_LINES) lines.push(`외 ${(owned.length - MAX_LINES).toLocaleString("ko-KR")}개`);

  return {
    items: lines.length ? lines.join("\n") : "보유한 아이템이 없습니다.",
    itemCount: owned.length,
  };
}
