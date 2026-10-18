export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import Item from "@/models/Item";
import ShopItem from "@/models/ShopItem";
import { catalogFind } from "@/lib/catalogDraft";
import { getShopAccess } from "@/lib/shopAccess";
import { effectDisplayOf } from "@/lib/itemEffects";
import { categoryFieldsOf } from "@/lib/itemCategory";
import { cosmeticKeysOf, productIconOf } from "@/lib/cosmeticArt";
import { normalizeRarity } from "@/lib/rarity";
import { saleEnded } from "@/lib/saleWindow";
import { cardPick, priceText } from "@/lib/shopPricing";
import { BUNDLE_TYPE } from "@/lib/bundle";
import { ITEM_TAG_MAX } from "@/lib/itemTag";
import { channelNamesFor } from "@/lib/channelNames";

// 📌 글 속 아이템 태그(lib/itemTag)의 지금 값 — 공지 · 이벤트 · 대회 · 서포터즈 글을 그릴 때(app/components/FormattedText) 누구나 읽는다.
//    GET ?ids=<id>,<id>… (최대 ITEM_TAG_MAX) → data: { [id]: { name, category, icon, imageUrl, color, type, rarity, effect: [줄 ≤2], scope, product } }
//      · 없는(지워진) 아이템은 빠진다 — 화면이 태그의 이름만 회색으로
//      · effect: 보일 효과 줄(직접 쓴 문구 > 종류별 틀 > 기본 — effectDisplayOf) 앞 두 줄 · scope: 꾸미기 적용 범위 글자("" = 꾸미기 아님)
//      · product: 판매 중인 연결 상품(상점을 볼 수 있을 때만 — 세트 · 판매 끝 빼고, 상점 차례 첫 상품) { id, price("49,800 XP"), days(카드 기간 · 0 = 무제한) } | null
//    초안 모드(localhost)는 초안을 덧씌운 값(catalogFind) — 테스트 사이트에서 고친 아이템이 그대로 보인다. 쓰기 없음
const PRODUCT_SORT = { sortOrder: 1, createdAt: -1 };

export async function GET(request) {
  try {
    const raw = new URL(request.url).searchParams.get("ids") || "";
    const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f]{24}$/.test(s) && mongoose.isValidObjectId(s)))].slice(0, ITEM_TAG_MAX);
    if (!ids.length) return NextResponse.json({ success: true, data: {} });
    await connectToDatabase();
    const [items, access] = await Promise.all([
      catalogFind(Item, { _id: { $in: ids } }, {
        select: { name: 1, type: 1, category: 1, icon: 1, imageUrl: 1, color: 1, rarity: 1, effects: 1, effectText: 1, scope: 1, chatBuffXp: 1, voiceBuffXp: 1, attendBuffXp: 1 },
      }),
      getShopAccess().catch(() => ({ canView: false })),
    ]);
    // 판매 중인 연결 상품 — 상점을 볼 수 있을 때만(비공개 상점이면 누를 곳이 없다)
    const productOf = new Map();
    if (access.canView && items.length) {
      const prods = await catalogFind(ShopItem, { active: true, itemId: { $in: items.map((d) => String(d._id)) } }, { sort: PRODUCT_SORT });
      for (const p of prods) {
        const key = String(p.itemId || "");
        if (!key || productOf.has(key) || p.type === BUNDLE_TYPE || saleEnded(p)) continue;
        productOf.set(key, p);
      }
    }
    // 채널 하나만 정한 효과는 #이름 — 효과 줄과 같은 표기
    const names = await channelNamesFor(items.map((d) => d.effects)).catch(() => new Map());
    const data = {};
    for (const d of items) {
      const id = String(d._id);
      const disp = effectDisplayOf(d, (cid) => names.get(cid));
      const cat = categoryFieldsOf(d);
      const art = productIconOf({ icon: d.icon, imageUrl: d.imageUrl, cosmeticKeys: cosmeticKeysOf(d) }) || { icon: d.icon || "", imageUrl: d.imageUrl || "" };
      const p = productOf.get(id);
      const pick = p ? cardPick(p) : null;
      data[id] = {
        name: cat.shortName || d.name || "",
        category: cat.categoryLabel || "",
        icon: art.icon || "",
        imageUrl: art.imageUrl || "",
        color: d.color || "",
        type: d.type || "item",
        rarity: normalizeRarity(d.rarity),
        effect: disp.isCosmetic ? [] : disp.effectLines.slice(0, 2),
        scope: disp.isCosmetic ? disp.scopeLabel : "",
        product: p && pick ? { id: String(p._id), price: priceText(p, pick.price), days: Number(pick.days) || 0 } : null,
      };
    }
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("아이템 태그 조회 오류:", e);
    return NextResponse.json({ success: false, data: {} }, { status: 500 });
  }
}
