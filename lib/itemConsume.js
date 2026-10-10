import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";
import { thingOfPurchase, unitThingSet } from "@/lib/unitSale";

// 📌 1개 소모 — 1회 소모권(1개 단위 상품) · 소모형 아이템(보호막)의 구매 건 하나에 consumedAt 을 조건부로 세운다.
//    봇의 자동 소모(bot/src/itemEffects.js consumeOne — 보호막)와 같은 규칙이다. 한쪽을 고치면 같이 고칠 것:
//      · 후보: 이 유저의 보유 건 — 대기 · 완료, 소모 안 됨, 기간 남음, 기프트카드 아님, 역할 없음
//      · 순서: 만료가 있는 것(먼저 끝나는 것부터) → 먼저 받은 것(createdAt 오름차순)
//      · 갱신: { _id, consumedAt: null, status: 대기 · 완료 } 조건부 — 두 번 쓰지 않고, 그 사이 환불 · 취소된 건은 쓰지 않는다.
//        경합으로 못 세우면 다음 후보로 넘어간다
//    ⚠️ 화면에서 부르지 않는다(모델을 읽는다) — 관리자 API(app/api/admin/users/consume)가 쓴다

const OWN = ["pending", "completed"];
const tms = (d) => (d ? new Date(d).getTime() : 0);

// 같은 물건 키("i:<Item id>" | "s:<상품 id>")의 보유 건 조건 — 아이템이면 itemRef 로 받은 건 + 그 아이템을 가리키는 상품으로 산 건
async function thingFilter(thing) {
  const [kind, id] = [String(thing || "").slice(0, 2), String(thing || "").slice(2)];
  if (!id) return null;
  if (kind === "s:") return { itemId: id };
  if (kind !== "i:") return null;
  const shops = await ShopItem.find({ itemId: id }, { _id: 1 }).lean();
  return { $or: [{ itemRef: id }, ...(shops.length ? [{ itemId: { $in: shops.map((s) => String(s._id)) } }] : [])] };
}

// 지금 ×N 묶음인 물건인가 — 묶음 기준은 인벤토리 · 유저 조회와 같다(lib/unitSale.js unitThingSet)
const SHOP_FIELDS = { name: 1, type: 1, roleId: 1, itemId: 1, unitSale: 1, durations: 1, bundle: 1 }; // bundle — 세트에 여러 개 넣은 아이템도 1개씩 쓴다(lib/unitSale)
const ITEM_FIELDS = { name: 1, type: 1, roleId: 1, effects: 1, sortOrder: 1, createdAt: 1 };
async function isUnitThing(thing) {
  const [shopItems, items] = await Promise.all([ShopItem.find({}, SHOP_FIELDS).lean(), Item.find({}, ITEM_FIELDS).lean()]);
  return unitThingSet(shopItems, items).has(String(thing));
}

// 소모할 수 있는 살아 있는 건 — 쓸 순서대로
async function candidatesOf(userId, thing, now = new Date()) {
  const f = await thingFilter(thing);
  if (!f) return [];
  const rows = await Purchase.find({
    userId,
    status: { $in: OWN },
    consumedAt: null,
    itemType: { $ne: "physical" },
    roleId: { $in: ["", null] }, // 역할 건은 쓰면 역할만 남는다 — 1개 단위 · 소모품은 역할이 없다
    $and: [f, { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
  }, { _id: 1, expiresAt: 1, createdAt: 1 }).lean();
  return rows.sort((a, b) => {
    const ea = tms(a.expiresAt), eb = tms(b.expiresAt);
    if (!!ea !== !!eb) return ea ? -1 : 1; // 만료가 있는 것 먼저
    return (ea - eb) || (tms(a.createdAt) - tms(b.createdAt)) || String(a._id).localeCompare(String(b._id));
  });
}

/**
 * 1개 소모. 성공하면 { id: 쓴 구매 _id, left: 남은 개수 }, 쓸 게 없으면 null.
 * @param {{ userId: string, thing: string, by?: string, now?: Date }} opts
 */
export async function consumeOne({ userId, thing, by = "", now = new Date() }) {
  if (!userId || !thing) return null;
  // 📌 ×N 묶음(1개 단위 상품 · 역할 없는 소모품)만 쓴다 — 아무 키나 받으면 영구 배지 같은 보통 아이템의 구매 건이 소모돼 보유에서 빠진다.
  //    1개 단위를 끈 뒤 열려 있던 화면의 버튼이 눌려도 여기서 막힌다
  if (!(await isUnitThing(thing))) return null;
  const rows = await candidatesOf(userId, thing, now);
  for (let i = 0; i < rows.length; i++) {
    const r = await Purchase.updateOne(
      { _id: rows[i]._id, consumedAt: null, status: { $in: OWN } },
      { $set: { consumedAt: now, consumedBy: String(by || "").slice(0, 80) } }
    );
    if (r.modifiedCount === 1) return { id: String(rows[i]._id), left: rows.length - i - 1 };
  }
  return null;
}

// 되돌리기 — 소모 뒤 효과 적용에 실패했을 때. 그 시각에 세운 것만 푼다(그 사이 다른 소모 · 환불과 섞이지 않게)
export async function unconsume(pid, at) {
  if (!pid || !at) return false;
  const r = await Purchase.updateOne({ _id: pid, consumedAt: at }, { $set: { consumedAt: null, consumedBy: "" } });
  return r.modifiedCount === 1;
}

// 📌 이 유저가 가진 ×N 묶음 — [{ thing, name, count, pending }] (관리자 유저 조회). 묶음 기준은 인벤토리와 같다(lib/unitSale.js)
export async function unitStacksOf(userId, now = new Date()) {
  const [shopItems, items, rows] = await Promise.all([
    ShopItem.find({}, SHOP_FIELDS).lean(),
    Item.find({}, ITEM_FIELDS).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    Purchase.find({
      userId,
      status: { $in: OWN },
      consumedAt: null,
      itemType: { $ne: "physical" },
      roleId: { $in: ["", null] },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    }, { itemId: 1, itemRef: 1, itemName: 1, status: 1, createdAt: 1 }).sort({ createdAt: 1 }).lean(),
  ]);
  const units = unitThingSet(shopItems, items);
  if (!units.size) return [];
  const shopRefOf = new Map(shopItems.map((s) => [String(s._id), s.itemId ? String(s.itemId) : ""]));
  const itemIds = new Set(items.map((i) => String(i._id)));
  const nameOf = new Map([
    ...shopItems.map((s) => [`s:${s._id}`, s.name]),
    ...items.map((i) => [`i:${i._id}`, i.name]),
  ]);
  const order = new Map(items.map((i, n) => [`i:${i._id}`, n]));
  const out = new Map();
  for (const p of rows) {
    const thing = thingOfPurchase(p, shopRefOf, itemIds);
    if (!thing || !units.has(thing)) continue;
    const cur = out.get(thing) || { thing, name: nameOf.get(thing) || p.itemName || "아이템", count: 0, pending: 0 };
    cur.count += 1;
    if (p.status === "pending") cur.pending += 1;
    out.set(thing, cur);
  }
  // 아이템 등록 순서(관리자가 정한 자리) → 직접 설정 상품은 뒤에
  return [...out.values()].sort((a, b) => (order.get(a.thing) ?? 1e9) - (order.get(b.thing) ?? 1e9) || a.name.localeCompare(b.name, "ko"));
}
