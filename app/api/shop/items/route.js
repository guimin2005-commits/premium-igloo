export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import { isItemType, itemSnapshot, normalizeIcon, normalizeColor, normalizeDescription, normalizeItemGroup } from "@/lib/items";
import { POINT_RATE } from "@/lib/pointRate";
import { unitSaleAllowed, clampPerOrder, isUnitSale } from "@/lib/unitSale";
import { hasConsumable } from "@/lib/itemEffects";
import { isBackdropKey } from "@/lib/itemBackdrops";
import mongoose from "mongoose";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";
import { BUNDLE_TYPE, normalizeBundle, componentProblem, partialValues } from "@/lib/bundle";
import { withBundleItems, stackableIdsOf } from "@/lib/bundleServer";
import { isDraftMode, catalogWriteBlocked, liveLockedResponse, catalogFind, catalogFindById, forWrite, catalogCreate, catalogDelete, nextSortOrder, stripDraft, writeDraftStock, loadShopThemes } from "@/lib/catalogDraft";
import { themeKeyOf } from "@/lib/shopThemes";
import { itemIndexOf, productRowsOf, normalizeProductOrder, syncProductOrder } from "@/lib/productOrder";
import { loadGroupMeta } from "@/lib/itemGroupsMeta";
import { saleEnded } from "@/lib/saleWindow";
import { cosmeticKeysOf } from "@/lib/cosmeticArt";

// 📌 상품 정리 B안(2026-10-11) — 상품 순서는 상품마다(sortOrder = 상점 노출 순서), 묶음은 아이템 그룹을 따른다(세트는 첫 구성 아이템 그룹 — lib/productOrder.js).
//    규칙: 같은 그룹 상품은 늘 붙어 있다(같은 상위의 그룹도 이어짐). 순서를 쓰는 길(끌기 · 「아이템 순서대로」 · 관리 목록 조회)은 모두 이 규칙으로 맞춘 뒤 바뀐 것만 쓴다
const PRODUCT_SORT = { sortOrder: 1, createdAt: -1 };
// 지금 상품 순서(계산 칸만) · 아이템 순서 · 상위 표
const loadProductOrder = async () => {
  const [products, items, meta] = await Promise.all([
    catalogFind(ShopItem, {}, { select: { itemId: 1, type: 1, bundle: 1, sortOrder: 1, createdAt: 1 }, sort: PRODUCT_SORT }),
    catalogFind(Item, {}, { select: { group: 1, sortOrder: 1, createdAt: 1 }, sort: { sortOrder: 1, createdAt: 1, _id: 1 } }),
    loadGroupMeta(),
  ]);
  return { products, items, parentOf: meta.parentOf };
};
// 새 순서(줄 차례 = 0, 1, 2 …) 중 지금 sortOrder 와 다른 것만 쓴다 — 초안 모드는 바뀐 상품만 초안이 된다
const writeProductOrder = async (rows) => {
  const ch = rows.map((r, i) => ({ id: r.id, i, was: r.sortOrder })).filter((r) => Number(r.was) !== r.i);
  if (ch.length) {
    const W = await forWrite(ShopItem, { _id: { $in: ch.map((c) => c.id) } });
    await W.bulkWrite(ch.map(({ id, i }) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } } })), { ordered: false });
  }
  return ch.length;
};

// 📌 상품 초안(lib/catalogDraft.js) — 실사이트 모드에서는 모든 도우미가 지금의 직접 호출과 같다.
//    초안 모드(localhost CATALOG_DRAFT=1)에서는 목록 · 연결 아이템 읽기가 초안을 덧씌운 보기이고, 관리 쓰기는 draft_shopitems 로 간다.
//    실사이트(Vercel)에서는 관리 쓰기(등록 · 수정 · 순서 · 삭제)를 막는다(LIVE_LOCKED) — 고치는 곳은 localhost 하나

// 저장 응답 — 실사이트 모드는 지금과 같은 문서. 초안 모드는 덧씌운 보기(재고 · 판매 수는 실사이트 기준 — 초안 사본 값이 아니라)
async function savedView(saved) {
  if (!saved || !isDraftMode()) return saved;
  const plain = saved.toObject ? saved.toObject() : saved;
  return (await catalogFindById(ShopItem, plain._id)) || stripDraft(plain);
}

// ── [조회] 상품 목록 — 공개 전에는 관리자만, 일반 유저는 판매 중인 상품만 ──
export async function GET(request) {
  try {
    await connectToDatabase();
    const { isAdmin, canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, error: "준비 중입니다.", data: [] }, { status: 403 });
    }

    const all = new URL(request.url).searchParams.get("all") === "1";
    const filter = isAdmin && all ? {} : { active: true };
    // 관리자 전체 목록(?all=1)이면 초안 행에 _draft("new" | "edit")를 단다 — 상점 관리 행의 "초안" 표시
    let items = await catalogFind(ShopItem, filter, { sort: PRODUCT_SORT, mark: isAdmin && all });
    // 📌 관리 목록(?groups=1) — 같은 그룹 상품이 떨어져 있으면(새 상품 · 아이템 그룹을 바꾼 뒤) 그 자리에서 맞춰 저장한다(관리 목록 = 상점 순서).
    //    실사이트(Vercel) 관리 화면은 상품 쓰기가 막혀 있어 맞추지 않는다. 못 쓰면 읽은 순서 그대로
    if (isAdmin && all && new URL(request.url).searchParams.get("groups") === "1" && !catalogWriteBlocked()) {
      try {
        const { products, items: its, parentOf } = await loadProductOrder();
        const before = productRowsOf(products, itemIndexOf(its.map((x) => ({ id: String(x._id), group: x.group }))));
        const next = normalizeProductOrder(before, parentOf);
        // 차례가 그대로면 쓰지 않는다(sortOrder 숫자만 듬성듬성한 것까지 고쳐 쓰면 초안 모드에서 상품 전부가 초안이 된다)
        const moved = next.some((r, i) => r.id !== before[i]?.id);
        if (moved && (await writeProductOrder(next))) {
          const at = new Map(next.map((r, i) => [r.id, i]));
          items = [...items].sort((a, b) => (at.get(String(a._id)) ?? 1e9) - (at.get(String(b._id)) ?? 1e9)).map((x) => ({ ...x, sortOrder: at.get(String(x._id)) ?? x.sortOrder }));
        }
      } catch (e) {
        console.error("상품 순서 맞추기 오류:", e);
      }
    }

    // 📌 consumable — 쓰면 없어지는 상품(1개 단위 1회 소모권 · 소모형 효과 아이템 — 보호막)이면 true. 쓴 건은 취소 · 환불하지 않는다(lib/orderRefund) —
    //    바로 구매 창 · 장바구니 결제의 [필수] 확인 줄이 그 점을 함께 적는다. 상품 상세 API(app/api/shop/items/[id])와 같은 판정
    //    📌 아이템 조회가 실패해도 목록은 내보낸다(상세 API 와 같이) — 그때는 1개 단위 상품만 소모품으로 표시
    //    📌 cosmeticKeys — 연결 아이템 · 세트 구성 아이템의 꾸미기 효과 키 { skin?, frame? }(lib/cosmeticArt cosmeticKeysOf, 같은 조회에서).
    //       상품 그림(app/arctic/CardArt)이 공용 · 옛 아이콘 대신 인벤토리와 같은 도트 아이콘을 고른다(DB 아이콘은 그대로). 꾸미기가 아니면 안 싣는다
    const linkedIds = [...new Set(items.map((s) => s.itemId).filter((v) => v && mongoose.isValidObjectId(v)).map(String))];
    const partIds = items.filter((s) => s.type === BUNDLE_TYPE).flatMap((s) => (s.bundle || []).map((c) => String(c?.itemId || ""))).filter((v) => mongoose.isValidObjectId(v));
    const fxIds = [...new Set([...linkedIds, ...partIds])];
    let consumableIds = new Set();
    const keysById = new Map();
    try {
      if (fxIds.length) {
        const linked = await catalogFind(Item, { _id: { $in: fxIds } }, { select: { type: 1, effects: 1 } });
        consumableIds = new Set(linked.filter((i) => i.type !== "physical" && hasConsumable(i)).map((i) => String(i._id)));
        for (const i of linked) {
          const k = cosmeticKeysOf(i);
          if (k) keysById.set(String(i._id), k);
        }
      }
    } catch (e) {
      console.error("상품 소모품 판정 오류:", e);
    }
    // 📌 판매 종료 — 지난 상품은 관리자 전체 목록(?all=1) 말고는 내보내지 않는다(상점 목록 · 검색 · 홈 · 장바구니 정리가 이 목록을 쓴다)
    if (!(isAdmin && all)) items = items.filter((s) => !saleEnded(s));
    let data = items.map((s) => {
      const consumable = isUnitSale(s) || consumableIds.has(String(s.itemId || ""));
      const keys = keysById.get(String(s.itemId || ""));
      return consumable || keys ? { ...s, ...(consumable ? { consumable: true } : {}), ...(keys ? { cosmeticKeys: keys } : {}) } : s;
    });
    data = await withBundleItems(data);
    // 세트 구성마다 꾸미기 키 — 세트 그림(CardArt BundleArt)도 구성 아이콘을 같은 규칙으로
    if (keysById.size) {
      data = data.map((s) => (s?.type === BUNDLE_TYPE && Array.isArray(s.bundleItems)
        ? { ...s, bundleItems: s.bundleItems.map((c) => { const keys = keysById.get(String(c.itemId)); return keys ? { ...c, cosmeticKeys: keys } : c; }) }
        : s));
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [등록·수정] 관리자 전용 ──
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    let b = await request.json();

    // 📌 등록된 아이템을 골랐으면 표기(이름·설명·아이콘·색·유형·역할·시즌 떼기)는
    //    서버가 Item 에서 다시 읽어 복사한다 — 클라이언트가 보낸 값은 믿지 않는다.
    //    상품 이미지(imageUrl)만은 상품 고유 값이라 연동 여부와 상관없이 클라이언트 값을 쓴다.
    // 📌 세트 상품(lib/bundle.js)은 아이템 하나에 연결하지 않는다 — 구성(bundle)이 아이템 목록이다
    const wantsBundle = b.type === BUNDLE_TYPE;
    const itemId = wantsBundle ? "" : String(b.itemId || "").trim();
    let linked = null;
    if (itemId) {
      linked = await catalogFindById(Item, itemId).catch(() => null);
      if (!linked) {
        return NextResponse.json({ success: false, message: "등록된 아이템을 찾을 수 없습니다." }, { status: 400 });
      }
      // 아래 검증이 같은 코드를 타도록 스냅샷을 b 위에 덮어쓴다
      b = { ...b, ...itemSnapshot(linked) };
    }

    if (!b.name?.trim()) {
      return NextResponse.json({ success: false, message: "상품명을 입력해주세요." }, { status: 400 });
    }
    // 📌 빙옥 전용 — 폼은 빙옥으로 받아 ×10,000 한 XP 를 보낸다(productForm toPayload). 가격은 늘 XP 로 저장하되
    //    1 빙옥(10,000 XP)의 배수로 맞춘다(올림) — 표기 "N 빙옥"과 저장값이 끝전 없이 같게. 기간별 가격도 같다
    const pointOnly = !!b.pointOnly;
    const toXp = (v) => {
      const n = Math.max(0, Math.floor(Number(v) || 0));
      return pointOnly ? Math.ceil(n / POINT_RATE) * POINT_RATE : n;
    };
    const price = toXp(b.price);
    if (price <= 0) {
      return NextResponse.json({ success: false, message: "가격을 입력해주세요." }, { status: 400 });
    }
    const discountPct = Math.max(0, Math.min(100, Math.floor(Number(b.discountPct) || 0)));
    // 할인 종료 시각 — 비우면 기한 없음. 폼은 KST 시각에 +09:00 을 붙여 보낸다(productForm toPayload)
    let discountUntil = null;
    if (b.discountUntil) {
      const t = new Date(b.discountUntil);
      if (!Number.isFinite(t.getTime())) return NextResponse.json({ success: false, message: "할인 종료 시각을 다시 확인해 주세요." }, { status: 400 });
      discountUntil = t;
    }
    // 판매 종료 시각 — 비우면 끝 없음(할인 종료와 같은 모양 — 폼이 KST 에 +09:00 을 붙여 보낸다)
    let saleUntil = null;
    if (b.saleUntil) {
      const t = new Date(b.saleUntil);
      if (!Number.isFinite(t.getTime())) return NextResponse.json({ success: false, message: "판매 종료 시각을 다시 확인해 주세요." }, { status: 400 });
      saleUntil = t;
    }
    const type = wantsBundle ? BUNDLE_TYPE : isItemType(b.type) ? b.type : "role";
    // 📌 세트 구성 — 모양을 정리하고(normalizeBundle) 아이템이 실제로 있는지 · 넣을 수 있는지 본다(기프트카드 · 역할 아이템 여러 개는 안 됨)
    let bundle = [];
    if (wantsBundle) {
      bundle = normalizeBundle(b.bundle);
      if (bundle.length < 2) {
        return NextResponse.json({ success: false, message: "세트에는 아이템을 2개 이상 넣어야 합니다." }, { status: 400 });
      }
      if (partialValues(bundle)) {
        return NextResponse.json({ success: false, message: "몸값은 모든 구성에 적거나 모두 비워 주세요." }, { status: 400 });
      }
      const found = await catalogFind(Item, { _id: { $in: bundle.map((c) => c.itemId) } }, { select: { name: 1, type: 1, roleId: 1, effects: 1 } });
      const byId = new Map(found.map((i) => [String(i._id), i]));
      const stack = await stackableIdsOf(found, { overlay: true });
      for (const c of bundle) {
        const why = componentProblem(c, byId.get(c.itemId), { stackable: stack.has(c.itemId) });
        if (why) return NextResponse.json({ success: false, message: why }, { status: 400 });
      }
    }
    // 아이템은 역할이 있어도 되고 없어도 된다 — 사이트 인벤토리에만 두는 수집품도 판다
    const grantsRole = type === "role" || type === "perk" || (type === "item" && !!b.roleId?.trim());
    const roleRequired = type === "role" || type === "perk";
    if (roleRequired && !b.roleId?.trim()) {
      return NextResponse.json({ success: false, message: "역할·권한 상품은 지급할 역할을 선택해야 합니다." }, { status: 400 });
    }

    // 📌 1개 단위 판매(lib/unitSale.js) — 역할 없는 아이템 · 꾸미기만. 연결 아이템이면 위에서 덮어쓴 스냅샷(유형 · 역할)으로 본다.
    //    켜면 기간제 가격표는 비운다(함께 켤 수 없다). 조건이 안 맞는데 켜서 보내면 조용히 끄지 않고 알린다
    const roleIdIn = grantsRole ? String(b.roleId || "").trim() : "";
    const unitSale = !wantsBundle && !!b.unitSale;
    if (unitSale && !unitSaleAllowed(type, roleIdIn)) {
      return NextResponse.json({ success: false, message: "1개 단위 판매는 역할이 없는 아이템 · 꾸미기만 할 수 있습니다." }, { status: 400 });
    }
    const maxPerOrder = unitSale ? clampPerOrder(b.maxPerOrder) : 0;

    // 📌 기간제 역할 — 기간(일)과 값이 모두 있는 것만 판매 목록에 올린다.
    //    기프트카드 · 1개 단위는 기간 개념이 없으므로 무시한다.
    //    days 0 은 무제한(영구) 옵션이다. 기간 옵션과 나란히 팔 수 있다.
    const durations = type !== "physical" && !unitSale && !wantsBundle && Array.isArray(b.durations)
      ? b.durations
          .map((d) => ({ days: Math.max(0, Math.floor(Number(d?.days) || 0)), price: toXp(d?.price) }))
          .filter((d) => d.price > 0)
          .sort((x, y) => (x.days === 0 ? 1 : y.days === 0 ? -1 : x.days - y.days))
      : [];

    const payload = {
      durations,
      unitSale,
      bundle,
      maxPerOrder,
      itemId: linked ? String(linked._id) : "",
      itemImageUrl: linked ? String(linked.imageUrl || "").trim() : "",
      name: b.name.trim(),
      // 줄바꿈 허용 · 300자 — 아이템 설명과 같은 규칙
      description: normalizeDescription(b.description),
      imageUrl: (b.imageUrl || "").trim(),
      icon: normalizeIcon(b.icon),
      color: normalizeColor(b.color),
      // 📌 카드 배경 장면 — 목록(lib/itemBackdrops.js)에 있는 키만, 아니면 "" (기본 바탕). 상품 고유 값이라 아이템 연동과 무관
      backdrop: isBackdropKey(b.backdrop) ? String(b.backdrop) : "",
      type,
      roleId: roleIdIn,
      roleName: grantsRole ? (b.roleName || "").trim() : "",
      price,
      pointOnly,
      discountPct,
      discountUntil: discountPct > 0 ? discountUntil : null,
      saleUntil,
      // 시즌 전환 때 디스코드 역할만 뗄 대상인지 (권한 상품에는 켜면 안 된다)
      detachOnSeason: type !== "perk" && type !== "physical" && type !== "cosmetic" && type !== BUNDLE_TYPE && !!b.detachOnSeason,
      // 빈 값이면 무제한(-1)
      stock: b.stock === "" || b.stock == null ? -1 : Math.max(-1, Math.floor(Number(b.stock))),
      active: b.active !== false,
    };
    // 📌 세트 카드 그림 모양 — 아는 값("combo" 구성 합치기)만, 아니면 ""(겹친 카드). 세트가 아니면 늘 ""(setArt 를 안 보내는 옛 화면이 세트를 다른 유형으로 바꿔도 비운다).
    //    세트를 수정 저장할 때 setArt 를 안 보내면(옛 화면) 저장된 값 그대로
    if (b.setArt !== undefined || !b.id || !wantsBundle) payload.setArt = wantsBundle && b.setArt === "combo" ? "combo" : "";
    // 📌 이벤트 테마(lib/shopThemes.js) — 지금 있는 테마 키(꺼진 테마 포함)만, 아니면 ""(테마 없음 — 지운 테마를 가리키던 상품은 저장할 때 정리된다).
    //    수정 저장에 theme 를 안 보내면(옛 화면) 저장된 값 그대로. 테마 목록은 키를 보냈을 때만 읽는다
    if (b.theme !== undefined || !b.id) {
      const want = typeof b.theme === "string" ? b.theme.trim() : "";
      payload.theme = want ? themeKeyOf(await loadShopThemes(), want) : "";
    }
    // 📌 순서 — 관리자 상점 관리는 끌어서 정한다(아래 PATCH). 값을 안 보내거나 비우면 수정 때는 그대로 두고,
    //    새로 만들 때는 맨 뒤에 붙인다(작을수록 앞). 상점 인라인 폼처럼 숫자를 보내면 그 값을 쓴다.
    if (b.sortOrder !== "" && b.sortOrder != null) payload.sortOrder = Math.floor(Number(b.sortOrder) || 0);
    else if (!b.id) payload.sortOrder = await nextSortOrder(ShopItem); // 초안 모드는 초안 · 실사이트를 합친 목록의 맨 뒤

    // 📌 수정 저장의 재고 — 폼 값은 편집을 시작할 때 읽은 재고라, 그대로 덮어쓰면 그 사이 팔린 수량이 되살아나 한정 상품이 초과 판매된다.
    //    폼이 편집 시작 때의 재고(stockBase)를 함께 보내면: 안 바꿨으면 재고를 건드리지 않고, 한정 → 한정으로 바꿨으면
    //    바꾼 폭만큼만 더한다(0 아래로는 내리지 않는다 — 음수는 무제한이다). 무제한이 끼면 그 값으로 바꾼다. stockBase 가 없으면 예전처럼 덮어쓴다
    //    📌 수정은 쓸 모델(W)에 한다 — 실사이트 모드는 ShopItem 그대로, 초안 모드는 그 상품을 초안으로 복사한 뒤 초안 모델(lib/catalogDraft forWrite).
    //       초안의 재고 폭은 반영 때 실사이트 재고에 폭으로만 더해진다(그 사이 팔린 수량이 지켜진다)
    //       초안 재고는 보이는 재고(실사이트 재고 + 초안에서 바꾼 폭) 기준으로 쓴다(lib/catalogDraft writeDraftStock — 초안 사본 재고에 폭을 더하면
    //       그 사이 환불로 실사이트 재고가 늘었을 때 0 에서 잘려 보이는 재고가 폼 값과 어긋난다)
    const W = b.id ? await forWrite(ShopItem, { _id: b.id }) : ShopItem;
    const drafting = W !== ShopItem;
    const stockBase = b.stockBase === "" || b.stockBase == null ? null : Math.floor(Number(b.stockBase));
    if (b.id && stockBase != null && Number.isFinite(stockBase)) {
      const next = payload.stock;
      delete payload.stock;
      if (next !== stockBase) {
        if (drafting) {
          await writeDraftStock(b.id, next >= 0 && stockBase >= 0 ? { delta: next - stockBase } : { value: next });
        } else if (next >= 0 && stockBase >= 0) {
          await W.updateOne(
            { _id: b.id, stock: { $gte: 0 } },
            [{ $set: { stock: { $max: [0, { $add: ["$stock", next - stockBase] }] } } }],
            { updatePipeline: true }
          );
        } else {
          payload.stock = next;
        }
      }
    } else if (b.id && drafting) {
      // stockBase 없이 보낸 저장(예전처럼 덮어쓰기) — 초안에서도 보이는 재고가 그 값이 되게
      const value = payload.stock;
      delete payload.stock;
      await writeDraftStock(b.id, { value });
    }

    const doc = b.id
      ? await W.findByIdAndUpdate(b.id, payload, { new: true })
      : await catalogCreate(ShopItem, payload);

    return NextResponse.json({ success: true, data: await savedView(doc) });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [순서 저장] 관리자 전용 — { order: [상품 id, ...] } 앞에서부터 0, 1, 2 … ──
//    상점 관리에서 끌어 놓은 순서를 한 번에 쓴다. 목록에 없는 상품(그 사이 새로 생긴 것)은 건드리지 않는다.
//    📌 2026-10-11 B안 — 받은 순서(빠진 상품은 뒤에 지금 차례로)를 묶음 규칙으로 맞춰 쓴다. 응답 order = 실제로 쓴 전체 순서(화면은 이것으로 맞춘다)
//    { syncItems: true } — 「아이템 순서대로」(lib/productOrder.js syncProductOrder). 응답 moved = 자리가 바뀐 상품 수(차례가 그대로면 쓰지 않는다)
//    pin — 끌어 옮긴 그룹 머리줄의 그룹 이름(상위 안 그룹 하나를 밖으로 끌면 상위 전체가 딸려가지 않게 — lib/itemOrder.js nestParents)
export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    const b = await request.json().catch(() => ({}));
    await connectToDatabase();
    const { products, items: its, parentOf } = await loadProductOrder();
    const idx = itemIndexOf(its.map((x) => ({ id: String(x._id), group: x.group })));
    const rows = productRowsOf(products, idx);
    if (b?.syncItems === true) {
      const next = syncProductOrder(products, its.map((x) => ({ id: String(x._id), group: x.group })), parentOf);
      // 자리가 바뀐 상품 수 — sortOrder 숫자만 듬성듬성한 것(지운 상품 자리)은 고쳐 쓰지 않는다(초안 모드에서 움직이지 않은 상품이 초안이 되지 않게 · 목록 조회와 같은 판정)
      const moved = next.filter((r, i) => r.id !== rows[i]?.id).length;
      if (moved) await writeProductOrder(next);
      return NextResponse.json({ success: true, order: next.map((r) => r.id), moved });
    }
    const ids = [...new Set((Array.isArray(b?.order) ? b.order : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 1000);
    if (ids.length === 0) return NextResponse.json({ success: false, message: "순서를 받지 못했습니다." }, { status: 400 });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const listed = ids.map((id) => byId.get(id)).filter(Boolean);
    const listedSet = new Set(listed);
    // 목록에 없는 상품(그 사이 새로 생긴 것 · 삭제 예정)은 뒤에 지금 차례로 — 그 뒤 규칙(같은 그룹 덩어리)으로
    const pin = typeof b?.pin === "string" ? normalizeItemGroup(b.pin) : "";
    const next = normalizeProductOrder([...listed, ...rows.filter((r) => !listedSet.has(r))], parentOf, pin);
    await writeProductOrder(next);
    return NextResponse.json({ success: true, order: next.map((r) => r.id) });
  } catch (e) {
    console.error("상품 순서 저장 오류:", e);
    return NextResponse.json({ success: false, message: "순서를 저장하지 못했습니다." }, { status: 500 });
  }
}

// ── [삭제] 관리자 전용 ──
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    // 실사이트 모드는 지금처럼 바로 지운다. 초안 모드는 새 초안이면 지우고, 실사이트 상품이면 삭제 예정(반영 때 지움)으로 둔다
    await catalogDelete(ShopItem, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
