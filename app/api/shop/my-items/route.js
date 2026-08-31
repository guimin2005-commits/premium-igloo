export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import RoleConfig from "@/models/RoleConfig";
import InventoryRole from "@/models/InventoryRole";

// 📌 내 보유 아이템 — 구매 내역이 아니라 "지금 실제로 들고 있는 것"을 보여준다.
//    디스코드에서 멤버의 현재 역할을 읽어와 상품·보상 역할과 대조하므로,
//    관리자가 수동으로 준 역할이나 레벨 보상 역할도 함께 잡힌다.
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

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    const [purchases, items, roleConfigs, invRoles, discordRoles] = await Promise.all([
      Purchase.find({ userId }).sort({ createdAt: -1 }).lean(),
      ShopItem.find({}, { name: 1, type: 1, roleId: 1, imageUrl: 1, description: 1 }).lean(),
      RoleConfig.find({}, { roleId: 1, roleName: 1, rewardLevel: 1, exclusive: 1 }).lean(),
      InventoryRole.find({ visible: true }).sort({ sortOrder: 1 }).lean(),
      fetchDiscordRoles(session.user.id),
    ]);

    const held = discordRoles === null ? null : new Set(discordRoles);
    const itemByRole = new Map(items.filter((i) => i.roleId).map((i) => [i.roleId, i]));

    // ── 1) 상품으로 얻은 것 ──
    const owned = [];
    const seenRoles = new Set();

    for (const p of purchases) {
      if (p.status === "cancelled") continue;
      const item = items.find((i) => String(i._id) === p.itemId);
      const isRole = p.itemType === "role" || p.itemType === "perk";
      let status = p.status; // pending | completed | expired

      if (isRole && p.roleId) {
        seenRoles.add(p.roleId);
        const expired = p.expiresAt && new Date(p.expiresAt).getTime() < Date.now();

        // 기간이 지난 기간제는 정상 만료 — 목록에서 뺀다
        if (expired || p.status === "expired") continue;

        // 아직 유효한데 디스코드에 역할이 없다 = 지급 실패·수동 회수 같은 이상 상태.
        // 산 물건을 조용히 지우면 안 되므로 '역할 없음'으로 드러낸다.
        if (held !== null && p.status === "completed" && !held.has(p.roleId)) {
          status = "missing";
        }
      }

      owned.push({
        kind: isRole ? "role" : "physical",
        name: p.itemName || item?.name || "상품",
        imageUrl: item?.imageUrl || "",
        status,
        days: p.days || 0,
        expiresAt: p.expiresAt || null,
        acquiredAt: p.processedAt || p.createdAt,
        source: "shop",
      });
    }

    // ── 2) 구매 기록 없이 들고 있는 역할 (관리자 지급·레벨 보상 등) ──
    if (held) {
      for (const roleId of held) {
        if (seenRoles.has(roleId)) continue;
        const item = itemByRole.get(roleId);
        const cfg = roleConfigs.find((r) => r.roleId === roleId);
        const inv = invRoles.find((r) => r.roleId === roleId);
        // 사이트가 관리하는 역할만 보여준다 (상품·레벨 보상·인벤토리 등록)
        if (!item && !cfg && !inv) continue;
        owned.push({
          kind: "role",
          name: inv?.label || item?.name || inv?.roleName || cfg?.roleName || "역할",
          imageUrl: item?.imageUrl || "",
          status: "completed",
          days: 0,
          expiresAt: null,
          acquiredAt: null,
          source: inv ? "inventory" : cfg?.rewardLevel != null ? "level" : "grant",
          rewardLevel: cfg?.rewardLevel ?? null,
          category: inv?.category || null,
          description: inv?.description || "",
          color: inv?.color || "",
        });
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
