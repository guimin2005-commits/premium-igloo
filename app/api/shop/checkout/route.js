export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import Coupon from "@/models/Coupon";
import { salePrice, couponDiscount, couponError } from "@/lib/shopPricing";

// ── [결제] 장바구니 일괄 구매 ──
//    items: [{ itemId, qty }] · 재고 선점 → 총액 차감 → 실패 시 전부 원복
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const { canView, isAdmin } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, message: "아직 공개되지 않은 상점입니다." }, { status: 403 });
    }

    const { items, contact, couponCode } = await request.json();
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "장바구니가 비어 있습니다." }, { status: 400 });
    }

    // 요청한 상품을 한 번에 조회하고 수량을 정규화
    const wanted = new Map();
    for (const row of items) {
      const qty = Math.max(1, Math.min(99, Math.floor(Number(row.qty) || 1)));
      wanted.set(String(row.itemId), (wanted.get(String(row.itemId)) || 0) + qty);
    }
    const docs = await ShopItem.find({ _id: { $in: [...wanted.keys()] }, active: true });
    if (docs.length !== wanted.size) {
      return NextResponse.json({ success: false, message: "판매 중이 아닌 상품이 포함되어 있습니다." }, { status: 409 });
    }

    const needsContact = docs.some((d) => d.type === "physical");
    if (needsContact && !contact?.trim()) {
      return NextResponse.json({ success: false, message: "수령 정보를 입력해주세요." }, { status: 400 });
    }

    // 📌 모든 상품은 1인 1개 — 수량 초과·기보유 모두 차단
    for (const d of docs) {
      if (wanted.get(String(d._id)) > 1) {
        return NextResponse.json({ success: false, message: `"${d.name}"은(는) 1인 1개만 구매할 수 있습니다.` }, { status: 400 });
      }
    }
    const owned = await Purchase.find({
      userId,
      itemId: { $in: docs.map((d) => String(d._id)) },
      status: { $in: ["pending", "completed"] },
    }, { itemName: 1 }).lean();
    if (owned.length > 0) {
      return NextResponse.json({ success: false, message: `이미 구매한 상품이 있습니다: ${owned[0].itemName}` }, { status: 409 });
    }

    const subtotal = docs.reduce((sum, d) => sum + salePrice(d) * wanted.get(String(d._id)), 0);

    // 쿠폰 검증 (사용 처리는 결제 확정 후)
    let coupon = null;
    let discount = 0;
    if (couponCode?.trim()) {
      coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase() });
      const err = couponError(coupon, subtotal, userId);
      if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });
      discount = couponDiscount(coupon, subtotal);
    }
    const total = Math.max(0, subtotal - discount);

    // 1) 재고 선점 — 실패하면 이미 잡은 것까지 되돌린다
    const claimed = [];
    for (const d of docs) {
      const qty = wanted.get(String(d._id));
      const ok = d.stock < 0
        ? await ShopItem.updateOne({ _id: d._id }, { $inc: { soldCount: qty } })
        : await ShopItem.updateOne({ _id: d._id, stock: { $gte: qty } }, { $inc: { stock: -qty, soldCount: qty } });

      if (!ok.modifiedCount) {
        for (const c of claimed) {
          await ShopItem.updateOne({ _id: c.id }, c.limited ? { $inc: { stock: c.qty, soldCount: -c.qty } } : { $inc: { soldCount: -c.qty } });
        }
        return NextResponse.json({ success: false, message: `"${d.name}" 재고가 부족합니다.` }, { status: 409 });
      }
      claimed.push({ id: d._id, qty, limited: d.stock >= 0 });
    }

    // 2) 총액 차감 — 잔액이 충분할 때만 매치
    //    📌 관리자는 잔액 검사를 건너뛴다 (상점 동작 확인용 테스트 구매)
    const charged = isAdmin ? 0 : total;  // 관리자는 XP 소모 없이 테스트 구매
    const paid = await UserXp.updateOne(
      isAdmin ? { userId } : { userId, xp: { $gte: total } },
      { $inc: { xp: -charged }, $set: { updatedAt: new Date() } },
      isAdmin ? { upsert: true } : {}
    );
    if (!paid.matchedCount && !paid.upsertedCount) {
      for (const c of claimed) {
        await ShopItem.updateOne({ _id: c.id }, c.limited ? { $inc: { stock: c.qty, soldCount: -c.qty } } : { $inc: { soldCount: -c.qty } });
      }
      return NextResponse.json({ success: false, message: "보유 XP가 부족합니다." }, { status: 400 });
    }

    // 3) 구매 기록 — 수량만큼 개별 건으로 남겨 봇·관리자가 건별로 처리
    const rows = [];
    for (const d of docs) {
      const qty = wanted.get(String(d._id));
      for (let i = 0; i < qty; i++) {
        rows.push({
          userId,
          userName: session.user.name || "",
          itemId: String(d._id),
          itemName: d.name,
          itemType: d.type,
          roleId: d.roleId || "",
          price: salePrice(d),
          contact: d.type === "physical" ? contact.trim() : "",
          status: "pending",
        });
      }
    }
    await Purchase.insertMany(rows);

    // 쿠폰 사용 처리 (결제가 확정된 뒤에만)
    if (coupon) {
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 }, $push: { usedBy: userId } });
    }

    const remain = await UserXp.findOne({ userId }, { xp: 1 }).lean();
    const hasRole = docs.some((d) => d.type === "role" || d.type === "perk");

    return NextResponse.json({
      success: true,
      message: hasRole
        ? "결제가 완료되었습니다. 역할 상품은 잠시 후 자동으로 지급됩니다."
        : "결제가 완료되었습니다. 운영진 확인 후 발송해 드립니다.",
      data: { count: rows.length, subtotal, discount, total, remainXp: remain?.xp ?? 0 },
    });
  } catch (e) {
    console.error("결제 처리 오류:", e);
    return NextResponse.json({ success: false, message: "결제 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
