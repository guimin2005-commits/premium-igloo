export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { getShopAccess } from "@/lib/shopAccess";
import ShopItem from "@/models/ShopItem";

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
    const b = await request.json();

    if (!b.name?.trim()) {
      return NextResponse.json({ success: false, message: "상품명을 입력해주세요." }, { status: 400 });
    }
    const price = Math.max(0, Math.floor(Number(b.price) || 0));
    if (price <= 0) {
      return NextResponse.json({ success: false, message: "가격을 입력해주세요." }, { status: 400 });
    }
    const discountPct = Math.max(0, Math.min(100, Math.floor(Number(b.discountPct) || 0)));
    const type = ["physical", "perk", "role", "item"].includes(b.type) ? b.type : "role";
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
      name: b.name.trim(),
      description: (b.description || "").trim(),
      imageUrl: (b.imageUrl || "").trim(),
      type,
      roleId: grantsRole ? b.roleId.trim() : "",
      roleName: grantsRole ? (b.roleName || "").trim() : "",
      price,
      discountPct,
      // 시즌 전환 때 디스코드 역할만 뗄 대상인지 (권한 상품에는 켜면 안 된다)
      detachOnSeason: !!b.detachOnSeason,
      // 빈 값이면 무제한(-1)
      stock: b.stock === "" || b.stock == null ? -1 : Math.max(-1, Math.floor(Number(b.stock))),
      active: b.active !== false,
      sortOrder: Math.floor(Number(b.sortOrder) || 0),
    };

    const doc = b.id
      ? await ShopItem.findByIdAndUpdate(b.id, payload, { new: true })
      : await ShopItem.create(payload);

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
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
