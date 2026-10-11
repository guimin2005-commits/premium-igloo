// 📌 세트 상품 서버 도우미 — 구성 아이템(models/Item)을 읽어 붙인다. 규칙 · 계산은 lib/bundle.js(화면에서도 쓰는 순수 함수)
import mongoose from "mongoose";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";
import { BUNDLE_TYPE, normalizeBundle, componentStates, bundleQuote } from "@/lib/bundle";
import { hasConsumable, itemEffectPartsOf } from "@/lib/itemEffects";
import { cosmeticOf } from "@/lib/itemCosmetic";
import { cosmeticKeysOf } from "@/lib/cosmeticArt";
import { channelNamesFor } from "@/lib/channelNames";
import { catalogFind } from "@/lib/catalogDraft";

// 📌 상품 초안(lib/catalogDraft.js) — 표시(withBundleItems · 견적 overlay)는 초안을 덧씌운 보기, 결제 판정(bundleStateFor 기본값)은 늘 실사이트.
//    실사이트 모드에서는 catalogFind 가 지금의 find(...).lean() 과 같다. Purchase 보유 읽기는 늘 실사이트

// 📌 세트 상품(lib/bundle.js)에 구성 아이템의 표기(이름 · 아이콘 · 이미지 · 색 · 유형)를 붙인다 — 상점 카드 · 상세가 구성을 그린다.
//    상세 API(app/api/shop/items/[id])도 같은 함수를 쓴다. 아이템 조회가 실패하면 표기 없이 낸다(구성 칸은 이름 없이 뜬다)
export async function withBundleItems(list, { detail = false } = {}) {
  const ids = [...new Set(list.filter((s) => s?.type === BUNDLE_TYPE).flatMap((s) => (s.bundle || []).map((c) => String(c.itemId))).filter((v) => mongoose.isValidObjectId(v)))];
  if (!ids.length) return list;
  let byId = new Map();
  let names = null;
  let stack = new Set();
  try {
    const found = await catalogFind(Item, { _id: { $in: ids } }, { select: detail ? undefined : { name: 1, icon: 1, imageUrl: 1, color: 1, type: 1, roleId: 1, effects: 1 } });
    byId = new Map(found.map((i) => [String(i._id), i]));
    stack = await stackableIdsOf(found, { overlay: true });
    // 상세는 구성마다 효과 문장 · 꾸미기 미리보기도 붙인다(상품 상세와 같은 원천)
    if (detail) names = await channelNamesFor(found.map((i) => i.effects));
  } catch (e) {
    console.error("세트 구성 아이템 조회 오류:", e);
  }
  return list.map((s) =>
    s?.type !== BUNDLE_TYPE
      ? s
      : {
          ...s,
          bundleItems: (s.bundle || []).map((c) => {
            const it = byId.get(String(c.itemId));
            return {
              itemId: String(c.itemId), days: c.days || 0, qty: c.qty || 1, value: c.value || 0,
              name: it?.name || "", icon: it?.icon || "", imageUrl: it?.imageUrl || "", color: it?.color || "", type: it?.type || "",
              hasRole: !!String(it?.roleId || "").trim(),
              // 쌓이는 아이템(소모형 · 1개 단위 상품) — 화면 판정(app/arctic/owned.ts)의 stackable · '사용 후 환불 불가' 안내가 쓴다
              consumable: stack.has(String(c.itemId)),
              ...(detail && it ? { effects: itemEffectPartsOf(it, (cid) => names?.get(cid)), cosmetic: cosmeticOf(it) || null } : {}),
              // 구성 그림 아이콘 고르기(lib/cosmeticArt productIconOf) — 상세(세트 구성 칸 · 큰 그림)도 목록과 같게
              ...(it && cosmeticKeysOf(it) ? { cosmeticKeys: cosmeticKeysOf(it) } : {}),
            };
          }),
        }
  );
}


// 📌 이 사람의 세트 판정 — 구성 · 구성 아이템 · 구성마다 상태 · 값. 결제 API(app/api/shop/purchase — 자물쇠 안에서)와 견적 API(app/api/shop/bundle-quote)가 같이 쓴다.
//    살아 있는 보유 = 구성 아이템(itemRef) 또는 itemRef 없는 옛 건이 그 아이템을 연결한 상품(숨김 상품 포함)을 산 것
//    반환 { ok: false, why } — 구성이 비었거나 아이템을 찾을 수 없음 · 기프트카드가 끼었음
// 쌓이는 아이템 id — 소모형 효과가 있거나(hasConsumable) 1개 단위로 파는 상품이 가리키는 것(lib/unitSale.js 와 같은 뜻)
//    overlay: true 면 상품을 초안 덧씌운 보기로 읽는다(표시용). 기본은 실사이트(결제 판정)
export async function stackableIdsOf(items, { overlay = false } = {}) {
  const ids = items.map((i) => String(i._id));
  const unitFilter = { itemId: { $in: ids }, unitSale: true };
  const unitShops = !ids.length
    ? []
    : overlay
      ? await catalogFind(ShopItem, unitFilter, { select: { itemId: 1 } })
      : await ShopItem.find(unitFilter, { itemId: 1 }).lean();
  const out = new Set(unitShops.map((s) => String(s.itemId)));
  for (const i of items) if (i.type !== "physical" && hasConsumable(i)) out.add(String(i._id));
  return out;
}

//    overlay: true 면 구성 아이템 · 연결 상품을 초안 덧씌운 보기로 읽는다 — 견적 API(표시)만 쓴다. 기본값(실사이트)이라 결제 경로는 그대로
export async function bundleStateFor(userId, set, { overlay = false } = {}) {
  const comps = normalizeBundle(set?.bundle);
  if (!comps.length) return { ok: false, why: "empty" };
  const compIds = comps.map((c) => c.itemId);
  const items = overlay
    ? await catalogFind(Item, { _id: { $in: compIds } })
    : await Item.find({ _id: { $in: compIds } }).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));
  if (comps.some((c) => !byId.get(c.itemId) || byId.get(c.itemId).type === "physical")) return { ok: false, why: "items" };
  const linkedFilter = { itemId: { $in: compIds } };
  const linkedShops = overlay
    ? await catalogFind(ShopItem, linkedFilter, { select: { _id: 1, itemId: 1 } })
    : await ShopItem.find(linkedFilter, { _id: 1, itemId: 1 }).lean();
  const shopIdsByItem = new Map();
  for (const s of linkedShops) {
    const k = String(s.itemId);
    if (!shopIdsByItem.has(k)) shopIdsByItem.set(k, new Set());
    shopIdsByItem.get(k).add(String(s._id));
  }
  const shopIds = linkedShops.map((s) => String(s._id));
  const holdings = userId
    ? await Purchase.find({
        userId,
        status: { $in: ["pending", "completed"] },
        consumedAt: null,
        $and: [
          { $or: [{ itemRef: { $in: compIds } }, ...(shopIds.length ? [{ itemId: { $in: shopIds }, itemRef: { $in: ["", null] } }] : [])] },
          { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        ],
      }, { itemRef: 1, itemId: 1, expiresAt: 1, status: 1, consumedAt: 1 }).lean()
    : [];
  const states = componentStates(comps, holdings, { shopIdsByItem, stackable: await stackableIdsOf(items, { overlay }) });
  return { ok: true, comps, byId, states, quote: bundleQuote(set, comps, states) };
}
