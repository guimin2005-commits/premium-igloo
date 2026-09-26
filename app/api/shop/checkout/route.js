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
import UserCoupon from "@/models/UserCoupon";
import { salePrice, couponDiscount, couponError, isTimed, durationPrice } from "@/lib/shopPricing";
import { getLevelByXp } from "@/lib/leveling";
import { xpToPoint, POINT_RATE } from "@/lib/pointRate";
import mongoose from "mongoose";

// 📌 실제 차감액(amount)을 줄 가격(prices) 비율로 나눈다 — 합이 amount 와 정확히 같다(최대 나머지 방식).
//    먼저 각 줄에 비례 몫의 버림을 주고, 모자란 만큼을 소수점 아래가 큰 줄부터 1 씩 더 준다.
//    빙옥은 1 = 1,000 XP 라 몫이 작아서, 끝전을 마지막 줄에 몰면 그 줄만 몇 배로 커지고 나머지가 0 이 된다.
//    환불은 줄 단위라 줄마다 제 가격에 가까운 몫을 들고 있어야 하고, 합은 반드시 실제로 뺀 값이어야 한다.
function splitByPrice(amount, prices) {
  const sum = prices.reduce((s, p) => s + p, 0);
  if (amount <= 0 || sum <= 0) {
    // 가격이 전부 0 인데 뺀 값이 있을 수는 없지만, 있더라도 합이 어긋나지 않게 마지막 줄에 둔다
    return prices.map((_, i) => (i === prices.length - 1 ? Math.max(0, amount) : 0));
  }
  const shares = prices.map((p) => Math.floor((p * amount) / sum));
  let left = amount - shares.reduce((s, v) => s + v, 0);
  const order = prices
    .map((p, i) => ({ i, rem: (p * amount) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) shares[order[k].i] += 1;
  return shares;
}

// ── [결제] 장바구니 일괄 구매 ──
//    items: [{ itemId, qty }] · pointUse: 쓸 빙옥 개수(나머지는 XP) · 재고 선점 → 총액 차감 → 실패 시 전부 원복
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const { canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, message: "아직 공개되지 않은 상점입니다." }, { status: 403 });
    }

    const body = await request.json();
    const { items, contact, couponCode } = body;
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: "장바구니가 비어 있습니다." }, { status: 400 });
    }

    // 요청한 상품을 한 번에 조회하고 수량을 정규화 (기간제는 고른 기간까지 함께 본다)
    const wanted = new Map();
    const pickedDays = new Map();
    for (const row of items) {
      const qty = Math.max(1, Math.min(99, Math.floor(Number(row.qty) || 1)));
      const id = String(row.itemId);
      wanted.set(id, (wanted.get(id) || 0) + qty);
      if (row.days != null) pickedDays.set(id, Math.floor(Number(row.days) || 0));
    }
    const docs = await ShopItem.find({ _id: { $in: [...wanted.keys()] }, active: true });
    if (docs.length !== wanted.size) {
      return NextResponse.json({ success: false, message: "판매 중이 아닌 상품이 포함되어 있습니다." }, { status: 409 });
    }

    // 📌 기간제 상품은 파는 기간 중 하나를 반드시 골라야 한다
    const daysOf = new Map();
    for (const d of docs) {
      const id = String(d._id);
      if (!isTimed(d)) { daysOf.set(id, 0); continue; }
      // 무제한은 days 0 — !days 로 걸면 그 한 줄이 주문 전체를 막는다. 가격표 존재 여부로만 판정한다
      const days = Math.floor(Number(pickedDays.get(id)) || 0);
      if (durationPrice(d, days) == null) {
        return NextResponse.json({ success: false, message: `"${d.name}"의 이용 기간을 골라주세요.` }, { status: 400 });
      }
      daysOf.set(id, days);
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
    // 📌 기간제는 기간이 끝나면 다시 살 수 있어야 하므로, 아직 살아 있는 건만 막는다
    const linkedIds = docs.map((d) => d.itemId).filter(Boolean);
    const owned = await Purchase.find({
      userId,
      status: { $in: ["pending", "completed"] },
      $and: [
        { $or: [{ itemId: { $in: docs.map((d) => String(d._id)) } }, ...(linkedIds.length ? [{ itemRef: { $in: linkedIds } }] : [])] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    }, { itemName: 1, expiresAt: 1 }).lean();
    if (owned.length > 0) {
      return NextResponse.json({
        success: false,
        message: owned[0].expiresAt
          ? `"${owned[0].itemName}"은(는) 아직 이용 기간이 남아 있습니다.`
          : `이미 구매한 상품이 있습니다: ${owned[0].itemName}`,
      }, { status: 409 });
    }

    // 📌 단가는 여기서 한 번만 — 할인 종료 시각이 요청 도중에 지나도 청구액과 기록(Purchase.price)이 같은 값이 되게
    const unitPrice = new Map(docs.map((d) => [String(d._id), salePrice(d, daysOf.get(String(d._id)))]));
    const subtotal = docs.reduce((sum, d) => sum + unitPrice.get(String(d._id)) * wanted.get(String(d._id)), 0);

    // 📌 화면에서 본 상품 합계(쿠폰 전)와 다르면(보는 사이 할인이 끝났거나 가격이 바뀜) 결제하지 않는다 — 모르는 사이 더 빠져나가지 않게
    //    쿠폰 할인액은 화면이 적용 시점에 받아 둔 값이라 여기서 비교하지 않는다(서버가 다시 계산한다)
    if (body?.expectedSubtotal != null && Number(body.expectedSubtotal) !== subtotal) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "가격이 바뀌었습니다. 바뀐 금액을 확인하고 다시 결제해 주세요." }, { status: 409 });
    }

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

    // 선점한 재고를 되돌린다 — 결제 실패 · 기록 실패 때 쓴다
    const releaseStock = async () => {
      for (const c of claimed) {
        await ShopItem.updateOne({ _id: c.id }, c.limited ? { $inc: { stock: c.qty, soldCount: -c.qty } } : { $inc: { soldCount: -c.qty } });
      }
    };

    // 2) 결제 — 빙옥은 원하는 만큼(pointUse 개) 쓰고, 나머지를 XP 로 낸다
    //    📌 관리자도 일반 유저와 똑같이 차감한다 — 테스트로 쓴 건 관리자 초기화로 되돌린다
    //    XP 는 화폐이므로 쓰면 레벨도 함께 내려간다. 빙옥은 레벨과 무관하다.
    //    가격은 XP 하나만 둔다. 쿠폰까지 뺀 총액(XP)에서 빙옥 몫(1 빙옥 = 1,000 XP — lib/pointRate.js)을 한 번만 뺀다.
    //    빙옥 상한은 xpToPoint(총액)(올림) — 넘게 보내면 상한으로 깎는다. 끝전 때문에 빙옥 몫이 총액보다 크면 XP 는 0.
    //    옛 요청의 payMethod "point" 는 전부 빙옥으로 친다.
    const maxPoint = xpToPoint(total);
    const askedPoint = body?.payMethod === "point" ? maxPoint : Math.max(0, Math.floor(Number(body?.pointUse) || 0));
    const pointUse = Math.min(askedPoint, maxPoint);
    const chargedXp = Math.max(0, total - pointUse * POINT_RATE);
    const payMethod = pointUse > 0 ? (chargedXp > 0 ? "mixed" : "point") : "xp";

    // 어느 쪽이 모자란지 — 빙옥을 먼저 본다. 둘 다 충분하면 ""
    const shortOf = (w) =>
      (w?.point ?? 0) < pointUse ? "보유 빙옥이 부족합니다." : (w?.xp ?? 0) < chargedXp ? "보유 XP가 부족합니다." : "";
    const wallet = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    const short = shortOf(wallet);
    if (short) {
      await releaseStock();
      return NextResponse.json({ success: false, message: short }, { status: 400 });
    }

    // 📌 XP 는 상점 화폐이면서 시즌 패스 진행도(xp - passBaseXp)의 원천이기도 하다.
    //    그냥 깎으면 물건을 살 때마다 이미 도달한 패스 티어가 미도달로 되돌아가고,
    //    "미도달인데 수령완료" 인 모순 상태가 된다. 기준선을 같은 폭으로 함께 내려
    //    "이번 시즌에 번 XP" 가 보존되게 한다. 빙옥은 진행도와 무관하므로 건드리지 않는다.
    // 📌 XP · 빙옥은 문서 하나에 대한 조건부 갱신 한 번으로 함께 뺀다 — 둘 중 하나라도 모자라면 아무것도 빠지지 않는다.
    //    0 인 쪽은 조건에서 뺀다: point 필드가 없는 옛 문서는 { point: { $gte: 0 } } 에도 매치되지 않는다.
    const filter = { userId };
    const inc = {};
    if (chargedXp > 0) { filter.xp = { $gte: chargedXp }; inc.xp = -chargedXp; inc.passBaseXp = -chargedXp; }
    if (pointUse > 0) { filter.point = { $gte: pointUse }; inc.point = -pointUse; }
    const paid = await UserXp.updateOne(filter, {
      ...(Object.keys(inc).length ? { $inc: inc } : {}),
      $set: { updatedAt: new Date() },
    });
    if (!paid.matchedCount) {
      // 사전 확인과 갱신 사이에 잔액이 바뀐 경우 — 다시 읽어 모자란 쪽을 알린다
      const now = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
      await releaseStock();
      return NextResponse.json({ success: false, message: shortOf(now) || "보유 XP가 부족합니다." }, { status: 400 });
    }
    // 뺀 만큼 그대로 되돌린다 — 기록을 못 남겼을 때만 쓴다
    const refundWallet = async () => {
      const back = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v]));
      if (Object.keys(back).length) await UserXp.updateOne({ userId }, { $inc: back });
    };

    // 3) 구매 기록 — 수량만큼 개별 건으로 남겨 봇·관리자가 건별로 처리
    //    📌 건마다 실제로 낸 값(paidXp/paidPoint — 낸 화폐 단위 그대로)을 적는다. 뺀 XP(chargedXp)와 빙옥(pointUse)을
    //       각각 판매가 비율로 나눠(splitByPrice) 건별 합계가 차감액과 정확히 같게 한다 — 환불이 이 값을 그대로 돌려준다.
    //    _id 를 미리 정해 두어, 넣다 만 경우 그 건들만 골라 지울 수 있게 한다.
    const rows = [];
    for (const d of docs) {
      const qty = wanted.get(String(d._id));
      const days = daysOf.get(String(d._id)) || 0;
      for (let i = 0; i < qty; i++) {
        rows.push({
          _id: new mongoose.Types.ObjectId(),
          userId,
          userName: session.user.name || "",
          itemId: String(d._id),
          itemRef: d.itemId || "",
          itemName: d.name,
          itemType: d.type,
          roleId: d.roleId || "",
          price: unitPrice.get(String(d._id)),
          payMethod,
          paidXp: 0,
          paidPoint: 0,
          billed: true,
          days,
          // 만료 시각은 결제 시점부터 — 봇 지급이 늦어도 산 만큼은 보장된다
          expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null,
          contact: d.type === "physical" ? contact.trim() : "",
          status: "pending",
        });
      }
    }
    const prices = rows.map((r) => r.price);
    const xpShares = splitByPrice(chargedXp, prices);
    const pointShares = splitByPrice(pointUse, prices);
    rows.forEach((r, i) => {
      r.paidXp = xpShares[i];
      r.paidPoint = pointShares[i];
    });
    try {
      await Purchase.insertMany(rows);
    } catch (e) {
      // 📌 기록이 안 남으면 값만 빠지고 물건은 없는 상태가 된다 — 넣다 만 건을 지우고 지갑 · 재고를 되돌린다.
      //    지우기부터 실패하면 되돌리지 않는다(기록이 남았을 수 있어 공짜가 된다) — 바깥 catch 로 넘긴다
      await Purchase.deleteMany({ _id: { $in: rows.map((r) => r._id) } });
      await refundWallet();
      await releaseStock();
      throw e;
    }

    // 쿠폰 사용 처리 (결제가 확정된 뒤에만) — 지갑에 있으면 그 건도 사용 처리
    if (coupon) {
      await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 }, $push: { usedBy: userId } });
      await UserCoupon.updateOne(
        { userId, couponId: String(coupon._id), status: "unused" },
        { $set: { status: "used", usedAt: new Date() } }
      );
    }

    // 차감된 XP에 맞춰 레벨을 다시 계산 (레벨이 내려갈 수 있다).
    //    빙옥만 냈으면 레벨에 영향이 없으므로 재계산도 역할 동기화도 하지 않는다.
    const balDoc = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    if (chargedXp > 0) {
      // 레벨이 내려갔을 수 있으니 봇이 보상 역할을 다시 맞추도록 표시한다
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(balDoc?.xp ?? 0), needsRoleSync: true } });
    }
    const remain = { xp: balDoc?.xp ?? 0, point: balDoc?.point ?? 0 };
    const hasRole = docs.some((d) => d.type === "role" || d.type === "perk");

    return NextResponse.json({
      success: true,
      message: hasRole
        ? "결제가 완료되었습니다. 역할 상품은 잠시 후 자동으로 지급됩니다."
        : "결제가 완료되었습니다. 운영진 확인 후 발송해 드립니다.",
      // subtotal · discount · total 은 XP 기준. usedPoint 는 뺀 빙옥, chargedXp 는 뺀 XP.
      // charged 는 옛 필드 — 한쪽으로만 냈을 때의 그 화폐 값. 섞어 냈으면 XP 몫이다(usedPoint · chargedXp 를 본다)
      data: {
        count: rows.length, subtotal, discount, total, payMethod,
        charged: payMethod === "point" ? pointUse : chargedXp,
        usedPoint: pointUse, chargedXp,
        remain, remainXp: remain.xp, remainPoint: remain.point,
      },
    });
  } catch (e) {
    console.error("결제 처리 오류:", e);
    return NextResponse.json({ success: false, message: "결제 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
