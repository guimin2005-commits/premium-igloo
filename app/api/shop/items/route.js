export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { getShopAccess } from "@/lib/shopAccess";
import { isItemType, itemSnapshot, normalizeIcon, normalizeColor, normalizeDescription } from "@/lib/items";
import mongoose from "mongoose";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

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

    return NextResponse.json({ success: true, data: items });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [등록·수정] 관리자 전용 ──
export async function POST(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    let b = await request.json();

    // 📌 등록된 아이템을 골랐으면 표기(이름·설명·아이콘·색·유형·역할·시즌 떼기)는
    //    서버가 Item 에서 다시 읽어 복사한다 — 클라이언트가 보낸 값은 믿지 않는다.
    //    상품 이미지(imageUrl)만은 상품 고유 값이라 연동 여부와 상관없이 클라이언트 값을 쓴다.
    const itemId = String(b.itemId || "").trim();
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
    const price = Math.max(0, Math.floor(Number(b.price) || 0));
    if (price <= 0) {
      return NextResponse.json({ success: false, message: "가격을 입력해주세요." }, { status: 400 });
    }
    const discountPct = Math.max(0, Math.min(100, Math.floor(Number(b.discountPct) || 0)));
    const type = isItemType(b.type) ? b.type : "role";
    // 아이템은 역할이 있어도 되고 없어도 된다 — 사이트 인벤토리에만 두는 수집품도 판다
    const grantsRole = type === "role" || type === "perk" || (type === "item" && !!b.roleId?.trim());
    const roleRequired = type === "role" || type === "perk";
    if (roleRequired && !b.roleId?.trim()) {
      return NextResponse.json({ success: false, message: "역할·권한 상품은 지급할 역할을 선택해야 합니다." }, { status: 400 });
    }

    // 📌 기간제 역할 — 기간(일)과 값이 모두 있는 것만 판매 목록에 올린다.
    //    기프트카드는 기간 개념이 없으므로 무시한다.
    //    days 0 은 무제한(영구) 옵션이다. 기간 옵션과 나란히 팔 수 있다.
    const durations = type !== "physical" && Array.isArray(b.durations)
      ? b.durations
          .map((d) => ({ days: Math.max(0, Math.floor(Number(d?.days) || 0)), price: Math.max(0, Math.floor(Number(d?.price) || 0)) }))
          .filter((d) => d.price > 0)
          .sort((x, y) => (x.days === 0 ? 1 : y.days === 0 ? -1 : x.days - y.days))
      : [];

    const payload = {
      durations,
      itemId: linked ? String(linked._id) : "",
      itemImageUrl: linked ? String(linked.imageUrl || "").trim() : "",
      name: b.name.trim(),
      // 줄바꿈 허용 · 300자 — 아이템 설명과 같은 규칙
      description: normalizeDescription(b.description),
      imageUrl: (b.imageUrl || "").trim(),
      icon: normalizeIcon(b.icon),
      color: normalizeColor(b.color),
      type,
      roleId: grantsRole ? b.roleId.trim() : "",
      roleName: grantsRole ? (b.roleName || "").trim() : "",
      price,
      discountPct,
      // 시즌 전환 때 디스코드 역할만 뗄 대상인지 (권한 상품에는 켜면 안 된다)
      detachOnSeason: type !== "perk" && type !== "physical" && !!b.detachOnSeason,
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
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, message: "권한이 없습니다." }, { status: 403 });
    }
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
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await ShopItem.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
