export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import { isItemType, itemSnapshot, normalizeIcon, normalizeColor, normalizeDescription } from "@/lib/items";
import { POINT_RATE } from "@/lib/pointRate";
import { unitSaleAllowed, clampPerOrder, isUnitSale } from "@/lib/unitSale";
import { hasConsumable } from "@/lib/itemEffects";
import { isBackdropKey } from "@/lib/itemBackdrops";
import mongoose from "mongoose";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";
import { BUNDLE_TYPE, normalizeBundle, componentProblem, partialValues } from "@/lib/bundle";
import { withBundleItems, stackableIdsOf } from "@/lib/bundleServer";

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
    const items = await ShopItem.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();

    // 📌 consumable — 쓰면 없어지는 상품(1개 단위 1회 소모권 · 소모형 효과 아이템 — 보호막)이면 true. 쓴 건은 취소 · 환불하지 않는다(lib/orderRefund) —
    //    바로 구매 창 · 장바구니 결제의 [필수] 확인 줄이 그 점을 함께 적는다. 상품 상세 API(app/api/shop/items/[id])와 같은 판정
    //    📌 아이템 조회가 실패해도 목록은 내보낸다(상세 API 와 같이) — 그때는 1개 단위 상품만 소모품으로 표시
    const linkedIds = [...new Set(items.map((s) => s.itemId).filter((v) => v && mongoose.isValidObjectId(v)).map(String))];
    let consumableIds = new Set();
    try {
      if (linkedIds.length) {
        const linked = await Item.find({ _id: { $in: linkedIds } }, { type: 1, effects: 1 }).lean();
        consumableIds = new Set(linked.filter((i) => i.type !== "physical" && hasConsumable(i)).map((i) => String(i._id)));
      }
    } catch (e) {
      console.error("상품 소모품 판정 오류:", e);
    }
    let data = items.map((s) => (isUnitSale(s) || consumableIds.has(String(s.itemId || "")) ? { ...s, consumable: true } : s));
    data = await withBundleItems(data);

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
      linked = await Item.findById(itemId).lean().catch(() => null);
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
      const found = await Item.find({ _id: { $in: bundle.map((c) => c.itemId) } }, { name: 1, type: 1, roleId: 1, effects: 1 }).lean();
      const byId = new Map(found.map((i) => [String(i._id), i]));
      const stack = await stackableIdsOf(found);
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
      // 시즌 전환 때 디스코드 역할만 뗄 대상인지 (권한 상품에는 켜면 안 된다)
      detachOnSeason: type !== "perk" && type !== "physical" && type !== "cosmetic" && type !== BUNDLE_TYPE && !!b.detachOnSeason,
      // 빈 값이면 무제한(-1)
      stock: b.stock === "" || b.stock == null ? -1 : Math.max(-1, Math.floor(Number(b.stock))),
      active: b.active !== false,
    };
    // 📌 순서 — 관리자 상점 관리는 끌어서 정한다(아래 PATCH). 값을 안 보내거나 비우면 수정 때는 그대로 두고,
    //    새로 만들 때는 맨 뒤에 붙인다(작을수록 앞). 상점 인라인 폼처럼 숫자를 보내면 그 값을 쓴다.
    if (b.sortOrder !== "" && b.sortOrder != null) payload.sortOrder = Math.floor(Number(b.sortOrder) || 0);
    else if (!b.id) {
      const last = await ShopItem.findOne({}, { sortOrder: 1 }).sort({ sortOrder: -1 }).lean();
      payload.sortOrder = Math.floor(Number(last?.sortOrder) || 0) + 1;
    }

    // 📌 수정 저장의 재고 — 폼 값은 편집을 시작할 때 읽은 재고라, 그대로 덮어쓰면 그 사이 팔린 수량이 되살아나 한정 상품이 초과 판매된다.
    //    폼이 편집 시작 때의 재고(stockBase)를 함께 보내면: 안 바꿨으면 재고를 건드리지 않고, 한정 → 한정으로 바꿨으면
    //    바꾼 폭만큼만 더한다(0 아래로는 내리지 않는다 — 음수는 무제한이다). 무제한이 끼면 그 값으로 바꾼다. stockBase 가 없으면 예전처럼 덮어쓴다
    const stockBase = b.stockBase === "" || b.stockBase == null ? null : Math.floor(Number(b.stockBase));
    if (b.id && stockBase != null && Number.isFinite(stockBase)) {
      const next = payload.stock;
      delete payload.stock;
      if (next !== stockBase) {
        if (next >= 0 && stockBase >= 0) {
          await ShopItem.updateOne(
            { _id: b.id, stock: { $gte: 0 } },
            [{ $set: { stock: { $max: [0, { $add: ["$stock", next - stockBase] }] } } }],
            { updatePipeline: true }
          );
        } else {
          payload.stock = next;
        }
      }
    }

    const doc = b.id
      ? await ShopItem.findByIdAndUpdate(b.id, payload, { new: true })
      : await ShopItem.create(payload);

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [순서 저장] 관리자 전용 — { order: [상품 id, ...] } 앞에서부터 0, 1, 2 … ──
//    상점 관리에서 끌어 놓은 순서를 한 번에 쓴다. 목록에 없는 상품(그 사이 새로 생긴 것)은 건드리지 않는다.
export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    const b = await request.json().catch(() => ({}));
    const ids = [...new Set((Array.isArray(b?.order) ? b.order : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 1000);
    if (ids.length === 0) return NextResponse.json({ success: false, message: "순서를 받지 못했습니다." }, { status: 400 });
    await connectToDatabase();
    await ShopItem.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: i } } } })), { ordered: false });
    return NextResponse.json({ success: true });
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
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await ShopItem.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
