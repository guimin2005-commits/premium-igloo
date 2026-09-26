export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getShopAccess } from "@/lib/shopAccess";
import { itemEffectPartsOf, roleBuffParts } from "@/lib/itemEffects";
import { channelNamesFor } from "@/lib/channelNames";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";
import RoleConfig from "@/models/RoleConfig";

// ── [조회] 상품 상세 — 공개 전에는 관리자만 ──
//    📌 effects — 사면 붙는 효과 조각 [{ label, amount, unit, cond, once }] (인벤토리 문장과 같은 원천 — lib/itemEffects):
//       연결된 등록 아이템의 효과(기본 · 조건) + 지급 역할의 역할 버프(관리자 › 레벨 설정). 없으면 [] (화면은 칸을 그리지 않는다)
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

    let effects = [];
    try {
      const [linked, cfg] = await Promise.all([
        item.itemId ? Item.findById(item.itemId).lean().catch(() => null) : null,
        item.roleId && item.type !== "physical" ? RoleConfig.findOne({ roleId: item.roleId }, { buffXp: 1, attendBuffXp: 1 }).lean() : null,
      ]);
      const names = await channelNamesFor([linked?.effects]);
      effects = [...itemEffectPartsOf(linked, (cid) => names.get(cid)), ...roleBuffParts(cfg || {})];
    } catch (e) {
      // 효과 문장이 없다고 상품을 못 보면 안 된다
      console.error("상품 효과 문장 오류:", e);
    }

    return NextResponse.json({ success: true, data: { ...item, effects } });
  } catch (e) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}
