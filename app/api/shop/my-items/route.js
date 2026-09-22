export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { displayOf, itemTypeColor, itemTypeLabel } from "@/lib/items";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import RoleConfig from "@/models/RoleConfig";
import InventoryRole from "@/models/InventoryRole";
import Item from "@/models/Item";

// 📌 내 보유 아이템 — 구매 내역이 아니라 "지금 실제로 들고 있는 것"을 보여준다.
//    표기는 아이템 등록(models/Item)이 단일 원천이다:
//      (A) 구매 건 → Item(itemRef) > Item(ShopItem.itemId) > ShopItem 스냅샷 > Purchase 스냅샷
//      (B) 디스코드 실보유 역할 중 (A)에 없는 것 → Item(roleId) 이 있으면 그걸로,
//          없고 레벨 보상(RoleConfig.rewardLevel) 이면 레벨 보상으로, 둘 다 없으면 숨긴다.
//          (InventoryRole 은 아이템으로 가져오기 전까지의 호환용 fallback)
//    (구매했지만 봇이 아직 지급하지 못한 건은 '지급 대기'로 따로 표시)

let cache = { at: 0, byUser: new Map() };
const TTL = 60 * 1000;

async function fetchDiscordRoles(userId) {
  const now = Date.now();
  if (now - cache.at > TTL) cache = { at: now, byUser: new Map() };
  if (cache.byUser.has(userId)) return cache.byUser.get(userId);

  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!GUILD_ID || !BOT_TOKEN) return null;

  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}`, {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
      cache: "no-store",
    });
    // 404 = 서버 미입장 / 그 외 실패는 '알 수 없음'으로 두고 구매 내역만 보여준다
    if (res.status === 404) return [];
    if (!res.ok) return null;
    const data = await res.json();
    const roles = Array.isArray(data.roles) ? data.roles : [];
    cache.byUser.set(userId, roles);
    return roles;
  } catch {
    return null;
  }
}

// 레벨 보상 역할의 고정 표기 — 아이템으로 등록되지 않은 보상 역할은 메달·분홍으로 그린다
const LEVEL_COLOR = "#ff5c77";
const ROLE_LIKE = new Set(["role", "perk", "item"]);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    const [purchases, shopItems, itemsAll, roleConfigs, invRoles, discordRoles] = await Promise.all([
      Purchase.find({ userId, status: { $nin: ["cancelled", "refunded"] } }).sort({ createdAt: -1 }).lean(),
      ShopItem.find({}, { name: 1, description: 1, imageUrl: 1, icon: 1, color: 1, type: 1, roleId: 1, itemId: 1 }).lean(),
      Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      RoleConfig.find({}, { roleId: 1, roleName: 1, rewardLevel: 1, exclusive: 1 }).lean(),
      InventoryRole.find({ visible: true }).sort({ sortOrder: 1 }).lean(),
      fetchDiscordRoles(userId),
    ]);

    const held = discordRoles === null ? null : new Set(discordRoles);
    const shopById = new Map(shopItems.map((s) => [String(s._id), s]));
    const itemById = new Map(itemsAll.map((i) => [String(i._id), i]));
    // 역할 → 아이템 (여럿이면 정렬 순 첫 번째). (B) 는 visible 인 것만 쓴다
    const itemByRole = new Map();
    for (const i of itemsAll) {
      if (i.roleId && !itemByRole.has(i.roleId)) itemByRole.set(i.roleId, i);
    }
    const now = Date.now();

    // ── (A) 구매·패스로 얻은 것 ──
    const owned = [];
    const seenRoles = new Set();

    for (const p of purchases) {
      const expired = p.status === "expired" || (p.expiresAt && new Date(p.expiresAt).getTime() < now);
      // 기간이 지난 기간제는 정상 만료 — 목록에서 뺀다
      if (expired) continue;

      const shopItem = shopById.get(p.itemId) || null;
      const item =
        (p.itemRef && itemById.get(p.itemRef)) ||
        (shopItem?.itemId && itemById.get(shopItem.itemId)) ||
        null;
      // 상품 스냅샷도 없는 옛 건(시즌 패스 역할 보상 등)은 같은 역할의 아이템이 있으면 그 표기를 빌린다
      const fallbackItem = !item && !shopItem && p.roleId ? itemByRole.get(p.roleId) || null : null;
      const disp = displayOf({ item: item || fallbackItem, shopItem, purchase: p });

      // 📌 아이템 유형도 roleId 가 있으면 역할처럼 다룬다 — 예전엔 실물 취급돼 역할 유무를 못 봤다
      const roleLike = !!p.roleId && ROLE_LIKE.has(p.itemType);
      let status = p.status; // pending | completed

      if (roleLike) {
        seenRoles.add(p.roleId);
        // 아직 유효한데 디스코드에 역할이 없다 = 지급 실패·수동 회수 같은 이상 상태.
        // 산 물건을 조용히 지우면 안 되므로 '역할 없음'으로 드러낸다.
        // 다만 siteOnly 는 일부러 뗀 것이라 이상 상태가 아니다 — 그대로 보유로 둔다.
        if (!p.siteOnly && held !== null && p.status === "completed" && !held.has(p.roleId)) {
          status = "missing";
        }
      }

      // kind — 표기 유형을 따르되, 역할이 없는 것은 실물이 아니면 사이트 보유 아이템이다
      const kind = disp.type === "physical" ? "physical" : roleLike ? disp.type : "item";

      owned.push({
        // 갱신돼도 같은 것을 가리키도록 하는 키 (구매 건 단위)
        uid: `p:${p._id}`,
        kind,
        type: kind,
        name: disp.name,
        description: disp.description,
        icon: disp.icon,
        imageUrl: disp.imageUrl,
        color: disp.color,
        status,
        days: p.days || 0,
        expiresAt: p.expiresAt || null,
        acquiredAt: p.processedAt || p.createdAt,
        // 시즌 전환으로 디스코드 표기만 떼고 사이트에서 들고 있는 것
        siteOnly: !!p.siteOnly,
        source: p.itemId === "season-pass" ? "pass" : "shop",
        rewardLevel: null,
      });
    }

    // ── (B) 구매 기록 없이 들고 있는 역할 (아이템 등록·레벨 보상) ──
    if (held) {
      for (const roleId of held) {
        if (seenRoles.has(roleId)) continue;
        const item = itemByRole.get(roleId);
        if (item) {
          if (item.visible === false) continue;
          const disp = displayOf({ item });
          owned.push({
            // 역할은 역할 ID 자체가 안정적인 키다
            uid: `r:${roleId}`,
            kind: disp.type,
            type: disp.type,
            name: disp.name,
            description: disp.description,
            icon: disp.icon,
            imageUrl: disp.imageUrl,
            color: disp.color,
            status: "completed",
            days: 0,
            expiresAt: null,
            acquiredAt: null,
            siteOnly: false,
            source: "item",
            rewardLevel: null,
          });
          continue;
        }

        const cfg = roleConfigs.find((r) => r.roleId === roleId);
        if (cfg && cfg.rewardLevel != null) {
          owned.push({
            uid: `r:${roleId}`,
            kind: "role",
            type: "role",
            name: cfg.roleName || "역할",
            description: "",
            icon: "",
            imageUrl: "",
            color: LEVEL_COLOR,
            status: "completed",
            days: 0,
            expiresAt: null,
            acquiredAt: null,
            siteOnly: false,
            source: "level",
            rewardLevel: cfg.rewardLevel,
          });
          continue;
        }

        // 아이템으로 가져오기 전의 옛 '인벤토리 표기 역할' — 남아 있으면 그대로 보여 준다
        const inv = invRoles.find((r) => r.roleId === roleId);
        if (inv) {
          const type = inv.category === "perk" ? "perk" : "item";
          owned.push({
            uid: `r:${roleId}`,
            kind: type,
            type,
            name: inv.label || inv.roleName || itemTypeLabel(type),
            description: inv.description || "",
            icon: "",
            imageUrl: "",
            color: inv.color || itemTypeColor(type),
            status: "completed",
            days: 0,
            expiresAt: null,
            acquiredAt: null,
            siteOnly: false,
            source: "item",
            rewardLevel: null,
          });
        }
        // 아이템도 레벨 보상도 아닌 역할은 사이트가 관리하지 않으므로 숨긴다
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        // 디스코드 조회에 실패하면 구매 내역 기준으로만 보여준다는 뜻
        synced: held !== null,
        items: owned,
      },
    });
  } catch (e) {
    console.error("보유 아이템 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
