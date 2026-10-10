export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import { bundleStateFor } from "@/lib/bundleServer";
import ShopItem from "@/models/ShopItem";

// ── [견적] 세트 상품을 이 사람이 살 때의 값 — 결제 API(app/api/shop/purchase)와 같은 판정(lib/bundleServer bundleStateFor) ──
//    결제 화면이 이 값을 expectedPrice 로 보낸다. 화면 계산(내 구매 목록)은 옛 건 · 숨김 상품 · 목록 창 밖 건을 다 못 봐 서버 값과 어긋날 수 있었다.
//    GET ?id=<세트 상품 id> → { price, full, list, owned, all, states: ["owned" | "renew" | "upgrade" | "new", …](구성 순서) }. 로그인 전이면 보유 없이 계산
export async function GET(request) {
  try {
    await connectToDatabase();
    const { canView } = await getShopAccess();
    if (!canView) return NextResponse.json({ success: false, message: "준비 중입니다." }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "상품을 찾을 수 없습니다." }, { status: 400 });
    const set = await ShopItem.findById(id).lean();
    if (!set || set.type !== "bundle" || !set.active) return NextResponse.json({ success: false, message: "판매 중인 세트가 아닙니다." }, { status: 404 });
    const session = await getServerSession(authOptions);
    const st = await bundleStateFor(session?.user?.id || "", set);
    if (!st.ok) return NextResponse.json({ success: false, message: "세트 구성을 확인할 수 없습니다." }, { status: 409 });
    const { price, full, list, owned, all } = st.quote;
    return NextResponse.json({ success: true, data: { price, full, list, owned, all, states: st.states.map((x) => x.state) } });
  } catch (e) {
    console.error("세트 견적 오류:", e);
    return NextResponse.json({ success: false, message: "값을 확인하지 못했습니다." }, { status: 500 });
  }
}
