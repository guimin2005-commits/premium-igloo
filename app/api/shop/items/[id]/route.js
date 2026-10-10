export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getShopAccess } from "@/lib/shopAccess";
import { itemEffectPartsOf, roleBuffParts, hasConsumable } from "@/lib/itemEffects";
import { isUnitSale } from "@/lib/unitSale";
import { cosmeticOf } from "@/lib/itemCosmetic";
import { channelNamesFor } from "@/lib/channelNames";
import ShopItem from "@/models/ShopItem";
import Item from "@/models/Item";
import RoleConfig from "@/models/RoleConfig";
import { withBundleItems } from "@/lib/bundleServer";

// ── [조회] 상품 상세 — 공개 전에는 관리자만 ──
//    📌 effects — 사면 붙는 효과 조각 [{ label, amount, unit, cond, once }] (인벤토리 문장과 같은 원천 — lib/itemEffects):
//       연결된 등록 아이템의 효과(기본 · 조건) + 지급 역할의 역할 버프(관리자 › 레벨 설정). 없으면 [] (화면은 칸을 그리지 않는다)
//    📌 cosmetic — 꾸미기 효과가 있을 때만 { skin: 카드 스킨 키 | "", badge: 프로필 배지 여부, botCard: 봇 카드도 그 스킨을 그리는지 }.
//       상품 상세가 '적용 모습' 미리보기를 그린다(app/arctic/ItemGallery.tsx). 배지 그림은 상품에 복사된 아이템 스냅샷(icon · itemImageUrl · color · type)
//    📌 consumable — 쓰면 없어지는 상품(1개 단위 1회 소모권 · 소모형 효과 아이템 — 보호막)이면 true. 쓴 건은 취소 · 환불하지 않는다(lib/orderRefund) —
//       상세 정보 칸이 그 점을 한 줄로 적는다(2026-10-04 "주의 문구 써둬 취소 환불 대상이 아니라고")
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
    let cosmetic = null;
    let consumable = isUnitSale(item);
    try {
      const [linked, cfg] = await Promise.all([
        item.itemId ? Item.findById(item.itemId).lean().catch(() => null) : null,
        item.roleId && item.type !== "physical" ? RoleConfig.findOne({ roleId: item.roleId }, { buffXp: 1, attendBuffXp: 1 }).lean() : null,
      ]);
      const names = await channelNamesFor([linked?.effects]);
      effects = [...itemEffectPartsOf(linked, (cid) => names.get(cid)), ...roleBuffParts(cfg || {})];
      // 꾸미기 — 효과 문장과 같은 원천(연결된 등록 아이템). 시즌 패스 보상 칸과 같은 계산(lib/itemCosmetic)
      cosmetic = cosmeticOf(linked);
      if (linked && linked.type !== "physical" && hasConsumable(linked)) consumable = true;
    } catch (e) {
      // 효과 문장이 없다고 상품을 못 보면 안 된다
      console.error("상품 효과 문장 오류:", e);
    }

    // 📌 세트 상품(lib/bundle.js) — 구성 아이템마다 표기 · 효과 문장 · 꾸미기 미리보기(bundleItems)
    const withBundle = item.type === "bundle" ? (await withBundleItems([item], { detail: true }))[0] : item;
    return NextResponse.json({ success: true, data: { ...withBundle, effects, ...(cosmetic ? { cosmetic } : {}), ...(consumable ? { consumable } : {}) } });
  } catch (e) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}
