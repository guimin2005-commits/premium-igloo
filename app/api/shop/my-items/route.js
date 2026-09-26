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
import { fetchMemberRoleInfo } from "@/lib/discordMember";
import { describeRoleBuff, itemEffectLines } from "@/lib/itemEffects";
import { channelNames } from "@/lib/channelNames";

// 📌 내 보유 아이템 — 구매 내역이 아니라 "지금 실제로 들고 있는 것"을 보여준다.
//    표기는 아이템 등록(models/Item)이 단일 원천이다:
//      (A) 구매 건 → Item(itemRef) > Item(ShopItem.itemId) > ShopItem 스냅샷 > Purchase 스냅샷
//      (B) 디스코드 실보유 역할 중 (A)에 없는 것 → Item(roleId) 이 있으면 그걸로,
//          없고 레벨 보상(RoleConfig.rewardLevel) 이면 레벨 보상으로, 둘 다 없으면 숨긴다.
//          (InventoryRole 은 아이템으로 가져오기 전까지의 호환용 fallback)
//    (구매했지만 봇이 아직 지급하지 못한 건은 '지급 대기'로 따로 표시)

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

    const [purchases, shopItems, itemsAll, roleConfigs, invRoles, roleInfo] = await Promise.all([
      Purchase.find({ userId, status: { $nin: ["cancelled", "refunded"] } }).sort({ createdAt: -1 }).lean(),
      ShopItem.find({}, { name: 1, description: 1, imageUrl: 1, itemImageUrl: 1, icon: 1, color: 1, type: 1, roleId: 1, itemId: 1, active: 1, sortOrder: 1 }).lean(),
      Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      RoleConfig.find({}, { roleId: 1, roleName: 1, rewardLevel: 1, exclusive: 1, buffXp: 1, attendBuffXp: 1 }).lean(),
      InventoryRole.find({ visible: true }).sort({ sortOrder: 1 }).lean(),
      fetchMemberRoleInfo(userId),
    ]);

    const held = roleInfo.roles === null ? null : new Set(roleInfo.roles);
    const shopById = new Map(shopItems.map((s) => [String(s._id), s]));
    const itemById = new Map(itemsAll.map((i) => [String(i._id), i]));
    // 역할 → 아이템. (A) 의 fallback 은 visible 무관, (B) 는 visible 인 것만 —
    //    숨긴 아이템은 "없는 것"으로 보고 레벨 보상·상품·옛 표기 분기로 내려간다.
    const itemByRole = new Map();
    const visibleItemByRole = new Map();
    for (const i of itemsAll) {
      if (!i.roleId) continue;
      if (!itemByRole.has(i.roleId)) itemByRole.set(i.roleId, i);
      if (i.visible !== false && !visibleItemByRole.has(i.roleId)) visibleItemByRole.set(i.roleId, i);
    }
    // 역할 → 직접 설정 상품(역할·권한). 판매 중 우선, 정렬 순 — 아이템으로 등록하지 않은 상품도 역할 보유자에게 보인다
    const shopByRole = new Map();
    for (const s of [...shopItems].sort((a, b) => Number(!!b.active) - Number(!!a.active) || (a.sortOrder || 0) - (b.sortOrder || 0))) {
      if (s.roleId && !shopByRole.has(s.roleId)) shopByRole.set(s.roleId, s);
    }
    const now = Date.now();
    const cfgByRole = new Map(roleConfigs.map((c) => [c.roleId, c]));

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
        //    역할 목록이 예전 값이거나(디스코드 조회 실패) 지급보다 먼저 찍힌 것이면 판정하지 않는다 — 방금 산 것이 '확인 필요'로 뜨지 않게
        const rolesAfterGrant = !roleInfo.stale && (!p.processedAt || new Date(p.processedAt).getTime() < roleInfo.at);
        if (!p.siteOnly && held !== null && rolesAfterGrant && p.status === "completed" && !held.has(p.roleId)) {
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
        source: p.itemId === "season-pass" ? "pass" : p.itemId === "grant" ? "grant" : "shop",
        rewardLevel: null,
        // 아이템 효과는 인벤토리 보유 기준(lib/ownedItems.js) — 사이트 보유(siteOnly) · 지급 대기(pending) · 역할 없음(missing)도 붙는다.
        //    기프트카드 구매는 봇이 효과 대상에서 빼므로 여기서도 뺀다
        effectItem: p.itemType !== "physical" ? item || fallbackItem : null,
        // 순서 — 상점 관리(아이템 등록)에서 정한 자리를 따른다
        orderRef: (item || fallbackItem)?._id ? String((item || fallbackItem)._id) : "",
        // 역할 버프(RoleConfig)는 그 디스코드 역할을 지금 실제로 가진 동안만 봇이 더한다
        buffRoleId: p.roleId && held !== null && held.has(p.roleId) ? p.roleId : "",
      });
    }

    // ── (B) 구매 기록 없이 들고 있는 역할 (아이템 등록·레벨 보상) ──
    if (held) {
      for (const roleId of held) {
        if (seenRoles.has(roleId)) continue;
        const item = visibleItemByRole.get(roleId);
        if (item) {
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
            effectItem: item,
            orderRef: String(item._id),
            buffRoleId: roleId,
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
            buffRoleId: roleId,
            exclusive: !!cfg.exclusive, // 등급 사다리 — 인벤토리에서 맨 앞
          });
          continue;
        }

        // 아이템으로 등록하지 않은 직접 설정 상품(역할·권한)도 역할을 들고 있으면 보여 준다
        const shopItem = shopByRole.get(roleId);
        if (shopItem && ROLE_LIKE.has(shopItem.type)) {
          const disp = displayOf({ shopItem });
          owned.push({
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
            source: "shop",
            rewardLevel: null,
            buffRoleId: roleId,
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
            buffRoleId: roleId,
          });
        }
        // 아이템도 레벨 보상도 아닌 역할은 사이트가 관리하지 않으므로 숨긴다
      }
    }

    // 📌 효과 문장 — 아이템 효과(아이템 문서의 기본 효과 + 조건 효과) + 역할 버프(RoleConfig 의 buffXp · attendBuffXp, 역할을 실제로 가진 동안만).
    //    둘 다 없으면 [] (화면은 빈 배열이면 줄을 그리지 않는다). 채널 이름은 채널 하나만 지정한 효과가 있을 때만 읽는다
    const needNames = owned.some((it) => (Array.isArray(it.effectItem?.effects) ? it.effectItem.effects : []).some((e) => e?.channelIds?.length === 1));
    const names = needNames ? await channelNames() : new Map();
    const nameOf = (id) => names.get(String(id));
    for (const it of owned) {
      const cfg = it.buffRoleId ? cfgByRole.get(it.buffRoleId) : null;
      it.effectLines = [
        ...(it.effectItem ? itemEffectLines(it.effectItem, nameOf) : []),
        ...(cfg ? describeRoleBuff(cfg) : []),
      ];
      delete it.effectItem;
      delete it.buffRoleId;
    }

    // 📌 순서 — 등급(배타 티어) → 레벨 보상(낮은 레벨부터) → 나머지는 상점 관리(아이템 등록)에서 끌어 정한 순서.
    //    등급은 어느 탭에서든 첫 칸. 등록 아이템이 아닌 옛 표기(직접 설정 상품 · 옛 표기 역할)는 그 뒤에, 받은 순서대로.
    //    예전엔 구매 날짜 순 + 역할로 받은 것은 맨 뒤라 관리 화면 순서와 달랐다
    const itemIdx = new Map(itemsAll.map((i, n) => [String(i._id), n])); // itemsAll 은 sortOrder · createdAt 순 = 관리 목록 순
    const rankOf = (it) => (it.source === "level" ? (it.exclusive ? 0 : 1) : 2);
    const posOf = (it) => itemIdx.get(it.orderRef) ?? Number.MAX_SAFE_INTEGER;
    owned.forEach((it, n) => { it._seq = n; });
    owned.sort((a, b) =>
      rankOf(a) - rankOf(b) ||
      (rankOf(a) === 1 ? (a.rewardLevel ?? 0) - (b.rewardLevel ?? 0) : 0) ||
      (rankOf(a) === 2 ? posOf(a) - posOf(b) : 0) ||
      a._seq - b._seq
    );
    for (const it of owned) { delete it.orderRef; delete it._seq; }

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
