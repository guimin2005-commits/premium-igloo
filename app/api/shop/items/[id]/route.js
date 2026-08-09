export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getShopAccess } from "@/lib/shopAccess";
import ShopItem from "@/models/ShopItem";

// ── [조회] 상품 상세 — 공개 전에는 관리자만 ──
export async function GET(request, { params }) {
  try {
    await connectToDatabase();
    const { isAdmin, canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, error: "준비 중입니다." }, { status: 403 });
    }

    const { id } = await params;
    const item = await ShopItem.findById(id).lean();
    if (!item || (!item.active && !isAdmin)) {
      return NextResponse.json({ success: false, error: "상품을 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}
