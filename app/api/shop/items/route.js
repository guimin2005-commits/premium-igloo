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
    const type = ["physical", "perk", "role"].includes(b.type) ? b.type : "role";
    const grantsRole = type === "role" || type === "perk";
    if (grantsRole && !b.roleId?.trim()) {
      return NextResponse.json({ success: false, message: "역할·권한 상품은 지급할 역할을 선택해야 합니다." }, { status: 400 });
    }

    const payload = {
      name: b.name.trim(),
      description: (b.description || "").trim(),
      imageUrl: (b.imageUrl || "").trim(),
      type,
      roleId: grantsRole ? b.roleId.trim() : "",
      roleName: grantsRole ? (b.roleName || "").trim() : "",
      price,
      discountPct,
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
