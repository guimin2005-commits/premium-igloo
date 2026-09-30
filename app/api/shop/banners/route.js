export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import ShopBanner from "@/models/ShopBanner";

// ── [조회] 배너 목록 — 공개 전에는 관리자만 ──
export async function GET(request) {
  try {
    await connectToDatabase();
    const { isAdmin, canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, data: [] }, { status: 403 });
    }
    const all = new URL(request.url).searchParams.get("all") === "1";
    const filter = isAdmin && all ? {} : { active: true };
    const banners = await ShopBanner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return NextResponse.json({ success: true, data: banners });
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
    const b = await request.json();
    if (!b.imageUrl?.trim()) {
      return NextResponse.json({ success: false, message: "배너 이미지 URL을 입력해주세요." }, { status: 400 });
    }
    // 📌 모바일 이미지는 선택 — 비워 두면 모바일도 PC 이미지를 쓴다
    if (b.mobileImageUrl != null && typeof b.mobileImageUrl !== "string") {
      return NextResponse.json({ success: false, message: "모바일 이미지 URL을 확인해주세요." }, { status: 400 });
    }

    const payload = {
      imageUrl: b.imageUrl.trim(),
      mobileImageUrl: (b.mobileImageUrl || "").trim(),
      title: (b.title || "").trim(),
      subtitle: (b.subtitle || "").trim(),
      link: (b.link || "").trim(),
      sortOrder: Math.floor(Number(b.sortOrder) || 0),
      active: b.active !== false,
    };

    const doc = b.id
      ? await ShopBanner.findByIdAndUpdate(b.id, payload, { new: true })
      : await ShopBanner.create(payload);

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
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
    await ShopBanner.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
