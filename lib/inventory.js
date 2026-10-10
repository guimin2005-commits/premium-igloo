import { displayOf, itemTypeColor, itemTypeLabel } from "@/lib/items";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import RoleConfig from "@/models/RoleConfig";
import InventoryRole from "@/models/InventoryRole";
import Item from "@/models/Item";
import { describeRoleBuff, itemEffectLines, perksOfItems, normalizeEffects, pickCardSkin, pickAvatarFrame, pickBadges, framesOf, seasonFrameOf, withSeasonFrame, FRAME_OF } from "@/lib/itemEffects";
import { SEASONS, seasonEndMs } from "@/lib/season";
import UserXp from "@/models/UserXp";
import { channelNames } from "@/lib/channelNames";
import { durationOptions } from "@/lib/shopPricing";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { unitThingSet } from "@/lib/unitSale";
import { TOOL_RE } from "@/lib/roleMigrationTerms";
import { refundValueOf } from "@/lib/orderRefund";

// 📌 보유 아이템 판정 — 구매 내역이 아니라 "지금 실제로 들고 있는 것"을 보여준다.
//    유저 인벤토리(app/api/shop/my-items) · 관리자 유저 조회 인벤토리(app/api/admin/users/inventory)가 같은 판정을 쓴다.
//    (lib/ownedItems.js 는 효과 적용용이라 화면 판정과 다르다 — 화면은 이 파일)
//    표기는 아이템 등록(models/Item)이 단일 원천이다:
//      (A) 구매 건 → Item(itemRef) > Item(ShopItem.itemId) > ShopItem 스냅샷 > Purchase 스냅샷
//      (B) 디스코드 실보유 역할 중 (A)에 없는 것 → Item(roleId) 이 있으면 그걸로,
//          없고 레벨 보상(RoleConfig.rewardLevel) 이면 레벨 보상으로, 둘 다 없으면 숨긴다.
//          (InventoryRole 은 아이템으로 가져오기 전까지의 호환용 fallback)
//    (구매했지만 봇이 아직 지급하지 못한 건은 '지급 대기'로 따로 표시)

// 레벨 보상 역할의 고정 표기 — 아이템으로 등록되지 않은 보상 역할은 메달·분홍으로 그린다
const LEVEL_COLOR = "#ff5c77";
const ROLE_LIKE = new Set(["role", "perk", "item"]);

// 📌 관리자 회수(admin) — 카드마다 회수 방법(revoke)을 단다. 유저 화면에는 붙지 않는다
//    rows   : 사이트 기록(Purchase)을 회수 — key 를 POST 에 그대로 돌려준다("t:<물건>" | 물건 키 없는 옛 건은 "c:<고리 맨 앞 id>")
//    role   : 구매 기록 없이 역할로 가진 것 — 디스코드 역할만 뗀다(POST /api/admin/users/roles)
//    locked : 손대지 않는다 — lock 은 짧은 라벨
//    units  : 회수 순서대로 한 건씩 — 낸 값 없는 것(운영진 지급 · 시즌 패스) 먼저, 그다음 상점 구매.
//             같은 무리 안에서는 대기 먼저, 그다음 늦게 받은 것부터. 상점 구매는 돌려줄 값(lib/orderRefund.js refundValueOf)
//             { src, xp: 돌려줄 XP(캐시백 뺀 값), point: 돌려줄 빙옥, clawXp: 돌려줄 XP 로 다 못 뺀 캐시백 — 회수 때 지갑 XP 에서 있는 만큼 빠진다 }
//             📌 clawXp 는 빙옥 몫 캐시백(상점 관리 › 설정)을 받은 건에서만 0 보다 크다 — 그때 xp 는 0 이고 지갑 XP 는 오히려 줄어든다
const OWN = new Set(["pending", "completed"]);
const srcOf = (p) => (p.itemId === "season-pass" ? "pass" : p.itemId === "grant" ? "grant" : "shop");
const isToolRow = (p) => p.itemId === "grant" && TOOL_RE.test(p.adminNote || "");
const gotAt = (p) => new Date(p.processedAt || p.createdAt || 0).getTime() || 0;
const revokeOrder = (a, b) =>
  Number(srcOf(a) === "shop") - Number(srcOf(b) === "shop") ||
  Number(b.status === "pending") - Number(a.status === "pending") ||
  gotAt(b) - gotAt(a) ||
  String(b._id).localeCompare(String(a._id));
const unitOf = (p) => {
  const src = srcOf(p);
  if (src !== "shop") return { src, xp: 0, point: 0, clawXp: 0 };
  const v = refundValueOf(p);
  return { src, xp: v.xp, point: v.point, clawXp: v.clawRest };
};
const lockedRevoke = (lock, tool = 0) => ({ mode: "locked", key: "", roleId: "", lock, stack: false, max: 0, tool, units: [] });

// 회수 범위의 살아 있는 건 → 고를 건(회수 순서) · 손대지 않는 역할 이전 기록 수 · 실물 수
function revokePlanOf(scope) {
  const rows = [];
  let tool = 0;
  let physical = 0;
  for (const p of scope) {
    if (p.itemType === "physical") { physical++; continue; }
    if (isToolRow(p)) { tool++; continue; }
    rows.push(p);
  }
  rows.sort(revokeOrder);
  return { rows, tool, physical };
}

/**
 * 한 유저의 보유 아이템. connectToDatabase() 뒤에 부른다.
 *   roleInfo  : { roles: string[] | null, at, stale } (lib/discordMember.js fetchMemberRoleInfo 모양) — 값이나 Promise
 *   canRenew  : 연장 링크(renewId)를 줄지 — 상점을 볼 수 있는 사람만. 값이나 Promise
 *   admin     : true 면 카드마다 revoke 를 달고, 회수 범위(plans: key → { name, stack, rows, tool })를 함께 돌려준다
 *   managedRoles : 디스코드가 관리하는 역할 id(Set) — admin 의 역할 카드 잠금용. 값이나 Promise, 모르면 null
 * 반환: { synced, badges, cardSkin, avatarFrame, items, plans }
 */
export async function buildInventory({ userId, roleInfo: roleInfoIn, canRenew: canRenewIn = false, admin = false, managedRoles: managedIn = null }) {
  // 📌 환불 · 취소된 건도 함께 읽는다 — 보유로 치지는 않고, 연장 묶음(renewOf)을 이을 때만 쓴다(아래 rootOf)
  const [purchaseRows, shopItems, itemsAll, roleConfigs, invRoles, roleInfo, allowRenew, managedRoles, picks] = await Promise.all([
    Purchase.find({ userId }).sort({ createdAt: -1 }).lean(),
    ShopItem.find({}, { name: 1, description: 1, imageUrl: 1, itemImageUrl: 1, icon: 1, color: 1, type: 1, roleId: 1, itemId: 1, active: 1, sortOrder: 1, durations: 1, unitSale: 1 }).lean(),
    Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    RoleConfig.find({}, { roleId: 1, roleName: 1, rewardLevel: 1, exclusive: 1, buffXp: 1, attendBuffXp: 1 }).lean(),
    InventoryRole.find({ visible: true }).sort({ sortOrder: 1 }).lean(),
    roleInfoIn,
    canRenewIn,
    managedIn,
    // 고른 것 — 카드 스킨 · 아바타 테두리 · 단 배지 + 시즌 티어 테두리(seasonFrame — 아이템 없이 가진 것으로 친다)
    UserXp.findOne({ userId }, { cardSkinPick: 1, avatarFramePick: 1, badgePick: 1, seasonFrame: 1 }).lean(),
  ]);

  // 📌 소모된 건(consumedAt — 연속 출석 보호막 등 소모형을 쓴 건)도 보유가 아니다(lib/ownedItems.js 와 같게) — 환불 건처럼 고리로만 따라간다
  const purchases = purchaseRows.filter((p) => p.status !== "cancelled" && p.status !== "refunded" && !p.consumedAt);
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

  // 📌 연장으로 이어진 구매(renewOf)는 한 아이템으로 묶는다 — renewOf 를 따라 올라간 맨 앞 구매가 묶음 키(uid 가 연장 · 만료에도 그대로).
  //    만료는 가장 늦은 것, 상태 · 표기는 지금 쓰고 있는 칸(살아 있는 것 중 가장 먼저 끝나는 것), 기간은 이어진 일수 합.
  //    📌 환불 · 취소된 건도 고리로는 따라간다 — 가운데 구간을 환불해도 앞뒤가 한 칸으로 남게(둘로 갈라져 같은 아이템이 두 번 뜨지 않게).
  //       보유 · 일수 · 받은 날에는 넣지 않는다
  const isExpired = (p) => p.status === "expired" || (p.expiresAt && new Date(p.expiresAt).getTime() < now);
  const byPid = new Map(purchaseRows.map((p) => [String(p._id), p]));
  const rootOf = (p) => {
    let cur = p;
    const seen = new Set([String(p._id)]);
    while (cur.renewOf && byPid.has(cur.renewOf) && !seen.has(cur.renewOf)) {
      seen.add(cur.renewOf);
      cur = byPid.get(cur.renewOf);
    }
    return cur;
  };
  const chains = new Map(); // 맨 앞 구매 id → { first: 가장 먼저 산 유효 건, live: [], days }
  for (const p of purchases) {
    const key = String(rootOf(p)._id);
    if (!chains.has(key)) chains.set(key, { first: p, live: [], days: 0 });
    const c = chains.get(key);
    c.first = p; // 최신순으로 도므로 마지막에 남는 것이 가장 먼저 산 건
    c.days += p.days || 0;
    if (!isExpired(p)) c.live.push(p);
  }
  const tms = (d) => new Date(d).getTime();

  // 📌 연장할 상품 — 산 상품이 판매 중인 기간제면 그것, 아니면 같은 아이템(itemRef)을 가리키는 판매 중 기간제 상품(정렬 순 첫 번째).
  //    결제 API 의 연장 판정(같은 상품 · 같은 itemRef)과 같은 짝만 고른다. 상점을 못 보는 유저에게는 주지 않는다
  const canRenew = (s) => !!s && !!s.active && durationOptions(s).some((o) => o.days > 0);
  const renewByRef = new Map();
  for (const s of [...shopItems].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))) {
    if (s.itemId && canRenew(s) && !renewByRef.has(s.itemId)) renewByRef.set(s.itemId, s);
  }
  const renewIdOf = (p) => {
    if (!allowRenew || !p.expiresAt || p.itemType === "physical") return "";
    const own = shopById.get(p.itemId);
    if (canRenew(own)) return String(own._id);
    const ref = p.itemRef ? renewByRef.get(p.itemRef) : null;
    return ref ? String(ref._id) : "";
  };

  // 📌 표기 원천 · 같은 물건 키 — 구매 건 하나에서 상품 · 아이템 · 옛 건 fallback 아이템 · 물건 키를 고른다.
  //    (A) 의 칸과 관리자 회수 범위(아래 admin)가 같은 키를 쓴다
  const refsOf = (p) => {
    const shopItem = shopById.get(p.itemId) || null;
    const item =
      (p.itemRef && itemById.get(p.itemRef)) ||
      (shopItem?.itemId && itemById.get(shopItem.itemId)) ||
      null;
    // 상품 스냅샷도 없는 옛 건(시즌 패스 역할 보상 등)은 같은 역할의 아이템이 있으면 그 표기를 빌린다
    const fallbackItem = !item && !shopItem && p.roleId ? itemByRole.get(p.roleId) || null : null;
    // 같은 물건 키 — 등록 아이템이면 그 id, 아니면 상품 id (아래 업그레이드 중복 숨김 · ×N 묶음 · 관리자 회수용)
    const thing = (item || fallbackItem)?._id ? `i:${(item || fallbackItem)._id}` : shopItem ? `s:${shopItem._id}` : "";
    return { shopItem, item, fallbackItem, thing };
  };

  // 📌 ×N 묶음 — 1개 단위 상품 · 역할 없는 소모형 아이템(lib/unitSale.js unitThingSet)은 같은 물건끼리 한 칸으로 모아 개수를 단다(아래)
  const units = unitThingSet(shopItems, itemsAll);

  const emitted = new Set();
  for (const row of purchases) {
    // 기간이 지난 기간제는 정상 만료 — 목록에서 뺀다
    if (isExpired(row)) continue;
    const rootId = String(rootOf(row)._id);
    if (emitted.has(rootId)) continue;
    emitted.add(rootId);
    const chain = chains.get(rootId);
    // 지금 쓰고 있는 칸 — 무제한(만료 없음)이 섞였으면 그것, 아니면 가장 먼저 끝나는 것
    const p = chain.live.reduce((a, b) => (!a.expiresAt ? a : !b.expiresAt ? b : tms(b.expiresAt) < tms(a.expiresAt) ? b : a));
    const lastEnd = chain.live.some((x) => !x.expiresAt) ? null : new Date(Math.max(...chain.live.map((x) => tms(x.expiresAt))));

    const { shopItem, item, fallbackItem, thing } = refsOf(p);
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

    // kind — 표기 유형을 따르되, 역할이 없는 것은 실물 · 꾸미기가 아니면 사이트 보유 아이템이다
    const kind = disp.type === "physical" || disp.type === "cosmetic" ? disp.type : roleLike ? disp.type : "item";
    // 묶을 칸 — 역할 없는 ×N 물건만(역할 건은 여러 개가 될 수 없다). 기프트카드는 빼고
    const stack = thing && units.has(thing) && !p.roleId && p.itemType !== "physical" ? thing : "";

    owned.push({
      // 갱신돼도 같은 것을 가리키도록 하는 키 (연장 묶음 단위 — 맨 앞 구매 id. 연장이 없으면 그 구매 id)
      uid: `p:${rootId}`,
      kind,
      type: kind,
      name: disp.name,
      description: disp.description,
      icon: disp.icon,
      imageUrl: disp.imageUrl,
      color: disp.color,
      status,
      // 연장으로 이어졌으면 일수 합 · 가장 늦은 만료 · 처음 받은 날 (연장이 없으면 그 구매 값 그대로)
      days: chain.days,
      expiresAt: lastEnd,
      // 📌 2026-10-04 "기간제는 역할 준 시간부터" — 역할 기간제가 아직 지급 대기면 만료는 봇이 역할을 준 때 정해진다(지금 값은 임시). 화면은 날짜 · D-n 대신 지급 대기만
      provisional: status === "pending" && !!p.roleId && Number(p.days) > 0,
      acquiredAt: chain.first.processedAt || chain.first.createdAt,
      // 기간제면 연장하러 갈 상품 id ("" 이면 연장 링크 없음)
      renewId: lastEnd ? renewIdOf(p) : "",
      // 시즌 전환으로 디스코드 표기만 떼고 사이트에서 들고 있는 것
      siteOnly: !!p.siteOnly,
      source: p.itemId === "season-pass" ? "pass" : p.itemId === "grant" ? "grant" : "shop",
      rewardLevel: null,
      // 아이템 효과는 인벤토리 보유 기준(lib/ownedItems.js) — 사이트 보유(siteOnly) · 지급 대기(pending) · 역할 없음(missing)도 붙는다.
      //    기프트카드 구매는 봇이 효과 대상에서 빼므로 여기서도 뺀다
      effectItem: p.itemType !== "physical" ? item || fallbackItem : null,
      // 순서 — 상점 관리(아이템 등록)에서 정한 자리를 따른다
      orderRef: (item || fallbackItem)?._id ? String((item || fallbackItem)._id) : "",
      // 같은 물건 키 — 등록 아이템이면 그 id, 아니면 상품 id (아래 업그레이드 중복 숨김 · ×N 묶음용)
      _thing: thing,
      _stack: stack,
      // 고리 맨 앞 id — 물건 키가 없는 옛 건의 관리자 회수 범위
      _root: rootId,
      // 개수 — 이 칸의 살아 있는 건 수 · 그중 지급 대기(×N 묶음이 더한다)
      ...(stack ? { count: chain.live.length, pendingCount: chain.live.filter((x) => x.status === "pending").length } : {}),
      // 역할 버프(RoleConfig)는 그 디스코드 역할을 지금 실제로 가진 동안만 봇이 더한다
      buffRoleId: p.roleId && held !== null && held.has(p.roleId) ? p.roleId : "",
    });
  }

  // 📌 ×N 묶음 — 같은 물건(_stack)의 칸을 첫 칸 하나로 합친다. 무기한 숨김보다 먼저 한다(묶음 칸은 그 숨김에서 뺀다).
  //    count 는 살아 있는 건 수 · pendingCount 는 그중 지급 대기. 하나라도 받았으면 보유 중, 무기한이 하나라도 있으면 만료 없음,
  //    모두 기간제면 가장 빠른 만료(먼저 쓰이는 것 — lib/itemConsume.js 소모 순서와 같다), 받은 날은 가장 이른 날.
  //    uid 는 "u:<물건>" 으로 고정 — 1개를 써서 줄어도 가방에서 고른 칸이 튀지 않는다(1개일 때도 같은 uid)
  const stacks = new Map();
  for (let i = 0; i < owned.length; i++) {
    const it = owned[i];
    if (!it._stack) continue;
    const s = stacks.get(it._stack);
    if (!s) {
      it.uid = `u:${it._stack}`;
      stacks.set(it._stack, it);
      continue;
    }
    s.count += it.count;
    s.pendingCount += it.pendingCount;
    if (it.status === "completed") s.status = "completed";
    s.expiresAt = !s.expiresAt || !it.expiresAt ? null : new Date(Math.min(tms(s.expiresAt), tms(it.expiresAt)));
    if (it.acquiredAt && (!s.acquiredAt || tms(it.acquiredAt) < tms(s.acquiredAt))) s.acquiredAt = it.acquiredAt;
    owned.splice(i, 1);
    i--;
  }
  for (const s of stacks.values()) {
    if (s.count > 1) s.renewId = ""; // 여러 개 묶음은 연장 대상이 아니다
    if (!s.expiresAt) s.days = 0;
  }

  // 📌 기간제를 무제한으로 업그레이드하면 남은 기간제 구매도 기간 끝까지 살아 있다 — 같은 물건의 무제한 칸이 있으면 기간제 칸은 숨긴다.
  //    등록 아이템이 아닌 상품도 같은 상품끼리는 묶는다(업그레이드는 같은 상품 · 같은 아이템에서만 일어난다 — _lib/renewal.js)
  const foreverThings = new Set(owned.filter((it) => it._thing && !it.expiresAt).map((it) => it._thing));
  for (let i = owned.length - 1; i >= 0; i--) {
    if (owned[i]._thing && !owned[i]._stack && owned[i].expiresAt && foreverThings.has(owned[i]._thing)) owned.splice(i, 1);
  }

  // 📌 관리자 회수 범위 — 그 카드의 물건 키를 가진 이 유저의 살아 있는 건 전부(숨긴 기간제 칸 · 같은 물건의 다른 고리 포함).
  //    물건 키가 없는 옛 건은 그 카드의 고리(맨 앞 id) 건들. 살아 있는 건 = 대기 · 완료, 소모 안 됨, 기간 남음(위 isExpired 와 같은 기준)
  const plans = admin ? new Map() : null;
  if (admin) {
    const live = purchaseRows.filter((p) => OWN.has(p.status) && !p.consumedAt && !isExpired(p));
    const keyOf = (it) => (it._thing ? `t:${it._thing}` : `c:${it._root}`);
    for (const it of owned) {
      const key = keyOf(it);
      if (!plans.has(key)) {
        const scope = it._thing ? live.filter((p) => refsOf(p).thing === it._thing) : live.filter((p) => String(rootOf(p)._id) === it._root);
        plans.set(key, { name: it.name, stack: false, ...revokePlanOf(scope) });
      }
      // 📌 ×N 여부는 키 하나에 하나 — 같은 물건 키의 카드 중 하나라도 ×N 묶음이면 그 키 전체가 묶음(수량을 고른다).
      //    역할 있는 옛 건 · 역할 이전 기록이 같은 물건에 섞여 묶음 칸과 단독 칸이 함께 떠도 화면 · POST 가 같은 값을 본다
      if (it._stack) plans.get(key).stack = true;
    }
    for (const it of owned) {
      const key = keyOf(it);
      const plan = plans.get(key);
      it._revoke = plan.rows.length
        ? { mode: "rows", key, roleId: "", lock: "", stack: plan.stack, max: plan.rows.length, tool: plan.tool, units: plan.rows.map(unitOf) }
        : lockedRevoke(plan.tool ? "역할 이전" : plan.physical ? "실물" : "회수 불가", plan.tool);
    }
  }
  for (const it of owned) { delete it._thing; delete it._stack; delete it._root; }

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

  // 📌 관리자 회수 — (B) 역할 카드. 레벨 보상(봇이 레벨에 맞춰 다시 붙인다 — 역할 회수 API 도 막는다) · 디스코드 관리 역할은 잠금
  if (admin) {
    for (const it of owned) {
      if (it._revoke || !String(it.uid).startsWith("r:")) continue;
      const roleId = String(it.uid).slice(2);
      const lvl = Number(cfgByRole.get(roleId)?.rewardLevel) || 0;
      it._revoke = it.source === "level" || lvl > 0
        ? lockedRevoke("레벨 보상")
        : managedRoles?.has(roleId)
          ? lockedRevoke("디스코드 관리")
          : { mode: "role", key: "", roleId, lock: "", stack: false, max: 1, tool: 0, units: [] };
    }
  }

  // 📌 효과 문장 — 아이템 효과(아이템 문서의 기본 효과 + 조건 효과) + 역할 버프(RoleConfig 의 buffXp · attendBuffXp, 역할을 실제로 가진 동안만).
  //    둘 다 없으면 [] (화면은 빈 배열이면 줄을 그리지 않는다). 채널 이름은 채널 하나만 지정한 효과가 있을 때만 읽는다
  //    📌 프로필 배지 · 카드 스킨 — 효과가 붙는 보유 아이템(effectItem, 같은 아이템은 한 번)으로 lib/itemPerks.js 와 같은 규칙(가진 것은 관리자 순서, 단 배지는 유저가 정한 순서 · 최대 3)
  const effectItems = [...new Map(owned.filter((it) => it.effectItem).map((it) => [String(it.effectItem._id), it.effectItem])).values()];
  const { allBadges, cardSkins, avatarFrames: itemFrames } = perksOfItems(effectItems);
  // 📌 고른 것(picks — 맨 위에서 읽음): 카드 스킨(cardSkinPick) · 아바타 테두리(avatarFramePick) · 단 배지(badgePick) · 시즌 티어 테두리(seasonFrame)
  const avatarFrames = withSeasonFrame(itemFrames, picks);
  // 카드 스킨 — 직접 고른 것만(2026-10-04 자동 착용 없음). 안 골랐거나 "none" 이면 기본 카드
  const cardSkin = pickCardSkin(cardSkins, picks?.cardSkinPick || "");
  // 아바타 테두리 — 카드 스킨과 같은 규칙
  const avatarFrame = pickAvatarFrame(avatarFrames, picks?.avatarFramePick || "");
  // 단 배지 — 직접 단 것만(최대 3, 2026-10-04 자동으로 달지 않음). 안 골랐거나 [] 이면 없음
  const badges = pickBadges(allBadges, picks?.badgePick);
  const badgeIds = new Set(allBadges.map((b) => b.itemId));
  const needNames = owned.some((it) => (Array.isArray(it.effectItem?.effects) ? it.effectItem.effects : []).some((e) => e?.channelIds?.length === 1));
  const names = needNames ? await channelNames() : new Map();
  const nameOf = (id) => names.get(String(id));
  for (const it of owned) {
    const cfg = it.buffRoleId ? cfgByRole.get(it.buffRoleId) : null;
    // 📌 등급 보상(아이언 · 브론즈 …) — 그 등급의 음성 보너스(lib/voiceTiers · 봇 지급과 같은 값)를 효과로 보여 준다
    const tier = it.source === "level" && it.rewardLevel != null ? VOICE_TIERS.find((t) => t.min === it.rewardLevel) : null;
    it.effectLines = [
      ...(tier && tier.bonus > 0 ? [`음성 1회당 +${tier.bonus.toLocaleString("ko-KR")} XP`] : []),
      ...(it.effectItem ? itemEffectLines(it.effectItem, nameOf) : []),
      ...(cfg ? describeRoleBuff(cfg) : []),
    ];
    // 카드 스킨 아이템이면 그 스킨 키 — 인벤토리 상세의 착용 · 해제 버튼이 쓴다.
    //    역할이 확인되지 않은 건(missing)도 보유라 스킨이 붙으므로(cardSkins 와 같은 규칙) 버튼도 준다
    const skinFx = it.effectItem ? normalizeEffects(it.effectItem.effects).find((e) => e.on === "cardSkin" && e.skin) : null;
    if (skinFx) it.skinKey = skinFx.skin;
    // 아바타 테두리 아이템이면 그 테두리 키 — 착용 · 해제 버튼이 쓴다
    //    전체(all) 아이템이면 9종 키 목록(frameKeys) — 상세에서 하나씩 골라 낀다
    const frameFx = it.effectItem ? normalizeEffects(it.effectItem.effects).find((e) => e.on === "avatarFrame" && e.frame) : null;
    const frameKeys = frameFx ? framesOf(frameFx.frame) : [];
    if (frameKeys.length > 1) it.frameKeys = frameKeys;
    else if (frameKeys.length) it.frameKey = frameKeys[0];
    // 프로필 배지 아이템이면 그 아이템 id — 착용 · 해제 버튼이 쓴다(allBadges 와 같은 판정)
    if (it.effectItem && badgeIds.has(String(it.effectItem._id))) it.badgeId = String(it.effectItem._id);
    delete it.effectItem;
    delete it.buffRoleId;
  }

  // 📌 시즌 티어 테두리 — 아이템 없이 UserXp.seasonFrame 으로 가진 테두리도 꾸미기 칸에 한 장(착용 · 해제 버튼 그대로). 다음 시즌이 끝날 때 바뀌거나 빠진다
  //    같은 테두리를 아이템으로도 가졌으면(관리자 전체 아이템 포함) 카드를 하나 더 만들지 않는다
  const seasonFrame = seasonFrameOf(picks);
  if (seasonFrame && !itemFrames.includes(seasonFrame)) {
    const n = Number(picks.seasonFrame.season) || 0;
    const next = SEASONS.find((x) => x.number === n + 1);
    const tier = VOICE_TIERS.find((t) => t.key === seasonFrame);
    owned.push({
      uid: `season-frame:${n}`,
      kind: "cosmetic",
      type: "cosmetic",
      name: `아바타 테두리 · ${FRAME_OF[seasonFrame].l}`,
      description: "",
      icon: "",
      imageUrl: `/avatar-borders/${seasonFrame}.svg`,
      color: tier?.c || "",
      status: "completed",
      days: 0,
      // 다음 시즌 끝(그 결산이 덮어쓴다). 다음 시즌이 아직 목록(lib/season SEASONS)에 없으면 날짜 없이 '다음 시즌까지'
      expiresAt: next ? new Date(seasonEndMs(next)).toISOString() : null,
      provisional: false,
      acquiredAt: picks.seasonFrame.at || null,
      renewId: "",
      siteOnly: false,
      source: "season",
      seasonNo: n,
      rewardLevel: null,
      frameKey: seasonFrame,
      effectLines: [`아바타 테두리 · ${FRAME_OF[seasonFrame].l}`],
      orderRef: "",
      ...(admin ? { _revoke: lockedRevoke("시즌 보상") } : {}), // 관리자 화면에만(유저 응답에는 회수 칸을 싣지 않는다)
    });
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
  // 관리자 회수는 맨 끝 칸에 — 유저 화면(admin 아님)에는 _revoke 를 만들지 않는다
  if (admin) for (const it of owned) { it.revoke = it._revoke || lockedRevoke("회수 불가"); delete it._revoke; }

  return {
    // 디스코드 조회에 실패하면 구매 내역 기준으로만 보여준다는 뜻
    synced: held !== null,
    // 지금 단 프로필 배지 [{ itemId, name, icon, imageUrl, color, type }] (최대 3, 유저가 정한 순서) · 지금 쓰는 카드 스킨 키("" 이면 기본 카드)
    badges,
    cardSkin,
    // 지금 쓰는 아바타 테두리 키("" 이면 없음)
    avatarFrame,
    items: owned,
    // 관리자 회수 범위 — key → { name, stack, rows(회수 순서의 Purchase lean), tool, physical }. 응답에 싣지 않는다
    plans,
  };
}
