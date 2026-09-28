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
import ShopLock from "@/models/ShopLock";
import { salePrice, couponDiscount, couponError, couponClaimFilter, couponReleaseUpdate, isTimed, durationPrice } from "@/lib/shopPricing";
import { getLevelByXp } from "@/lib/leveling";
import { planPayment } from "@/lib/shopPay";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { cashbackOf } from "@/lib/itemEffects";
import { logWallet } from "@/lib/wallet";
import { liveHoldings, planPurchase, timingOf } from "../_lib/renewal";
import mongoose from "mongoose";

// 📌 금액 나누기(쿠폰 몫 · 빙옥 전용 줄 · 일반 줄의 XP/빙옥 · 줄별 기록)는 lib/shopPay.js planPayment 한 곳에서 정한다 —
//    결제 화면(app/arctic/checkout)이 같은 함수로 미리 보여 준다.
//    환불은 줄 단위라 줄마다 제 가격에 가까운 몫을 들고 있어야 하고, 합은 반드시 실제로 뺀 값이어야 한다(splitByPrice — 최대 나머지).

// ── [결제] 장바구니 일괄 구매 ──
//    items: [{ itemId, qty }] · pointUse: 쓸 빙옥 개수(나머지는 XP) · 재고 선점 → 총액 차감 → 실패 시 전부 원복
export async function POST(request) {
  let lock = null;
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    // 📌 점검 중에는 결제를 서버에서 막는다 (관리자는 통과)
    const maintenance = await denyIfMaintenance(session);
    if (maintenance) return maintenance;

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

    // 📌 모든 상품은 1인 1개 — 수량 초과 · 무제한 기보유 차단 (기간제 보유는 연장 · 업그레이드로 받는다 — 아래)
    for (const d of docs) {
      if (wanted.get(String(d._id)) > 1) {
        return NextResponse.json({ success: false, message: `"${d.name}"은(는) 1인 1개만 구매할 수 있습니다.` }, { status: 400 });
      }
    }
    // 같은 아이템을 가리키는 상품 둘(예: 7일 · 30일 상품)을 함께 사면 값만 두 번 빠진다 — 효과 · 인벤토리는 하나로 합쳐진다
    const seenRef = new Set();
    for (const d of docs) {
      if (!d.itemId) continue;
      if (seenRef.has(d.itemId)) {
        return NextResponse.json({ success: false, message: `"${d.name}"과(와) 같은 아이템이 이미 담겨 있습니다.` }, { status: 400 });
      }
      seenRef.add(d.itemId);
    }

    // 📌 유저 자물쇠 — 기보유 확인부터 구매 기록까지 이 유저의 다른 결제(바로 구매 포함)가 끼어들지 못하게 한다.
    //    없으면 동시에 보낸 두 요청이 둘 다 기보유 확인을 통과해 같은 상품이 두 번 결제된다. 아래 finally 에서 푼다
    lock = await ShopLock.acquire(userId);
    if (!lock) {
      return NextResponse.json({ success: false, message: "처리 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 409 });
    }

    // 📌 기보유 판정 — 살아 있는 보유(같은 상품 · 같은 아이템)만 본다. 무제한 보유는 막고,
    //    기간제만 가졌으면 기간제는 연장(가장 늦은 만료 뒤에 이어 붙임) · 무제한은 업그레이드로 받는다 (_lib/renewal.js — 바로 구매와 같은 규칙)
    const holdings = await liveHoldings(userId, docs);
    const plans = new Map();
    for (const d of docs) {
      const plan = planPurchase(d, daysOf.get(String(d._id)) || 0, holdings);
      if (plan.block) {
        return NextResponse.json({ success: false, message: `이미 구매한 상품이 있습니다: ${plan.block.itemName || d.name}` }, { status: 409 });
      }
      plans.set(String(d._id), plan);
    }

    // 📌 캐시백 % (아이템 효과 shopCashback — 상한 적용) — 이번 결제 전에 가진 것으로 정한다(방금 사는 캐시백 아이템이 제 결제에 붙지 않게).
    //    재고 · 쿠폰을 잡기 전에 읽는다. 읽지 못하면 캐시백 없이 결제한다(결제를 막지 않는다)
    const cashPct = await getPerks(userId)
      .then((p) => p.shopCashback || 0)
      .catch((e) => { console.error("캐시백 조회 실패:", e); return 0; });

    // 📌 단가는 여기서 한 번만 — 할인 종료 시각이 요청 도중에 지나도 청구액과 기록(Purchase.price)이 같은 값이 되게
    const unitPrice = new Map(docs.map((d) => [String(d._id), salePrice(d, daysOf.get(String(d._id)))]));
    const subtotal = docs.reduce((sum, d) => sum + unitPrice.get(String(d._id)) * wanted.get(String(d._id)), 0);

    // 📌 화면에서 본 상품 합계(쿠폰 전)와 다르면(보는 사이 할인이 끝났거나 가격이 바뀜) 결제하지 않는다 — 모르는 사이 더 빠져나가지 않게
    //    쿠폰 할인액은 화면이 적용 시점에 받아 둔 값이라 여기서 비교하지 않는다(서버가 다시 계산한다)
    if (body?.expectedSubtotal != null && Number(body.expectedSubtotal) !== subtotal) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "가격이 바뀌었습니다. 바뀐 금액을 확인하고 다시 결제해 주세요." }, { status: 409 });
    }
    // 📌 빙옥 전용 여부도 화면과 맞춘다 — 값이 같아도 보는 사이 빙옥 전용으로 바뀌면(또는 풀리면) 빠지는 화폐가 달라진다
    if (Array.isArray(body?.pointOnlyIds)) {
      const seen = new Set(body.pointOnlyIds.map(String));
      if (docs.some((d) => !!d.pointOnly !== seen.has(String(d._id)))) {
        return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "결제 수단이 바뀐 상품이 있습니다. 다시 확인하고 결제해 주세요." }, { status: 409 });
      }
    }

    // 쿠폰 검증 (사용권은 재고를 잡은 뒤 선점한다)
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

    // 1-2) 쿠폰 사용권 선점 — 한도 검사와 사용 기록을 조건부 갱신 한 번으로 한다(동시 결제가 한도를 넘지 못하게).
    //      결제 · 기록이 실패하면 releaseCoupon 으로 되돌린다
    if (coupon) {
      const took = await Coupon.updateOne(couponClaimFilter(coupon, userId), { $inc: { usedCount: 1 }, $push: { usedBy: userId } });
      if (!took.modifiedCount) {
        await releaseStock();
        return NextResponse.json({ success: false, message: "이미 사용했거나 한도가 찬 쿠폰입니다." }, { status: 409 });
      }
    }
    const releaseCoupon = async () => {
      if (coupon) await Coupon.updateOne({ _id: coupon._id }, couponReleaseUpdate(userId), { updatePipeline: true });
    };

    // 2) 결제 — 빙옥 전용 줄은 빙옥으로만, 나머지 줄은 빙옥을 원하는 만큼(pointUse 개) 쓰고 나머지를 XP 로 낸다 (lib/shopPay.js planPayment)
    //    📌 관리자도 일반 유저와 똑같이 차감한다 — 테스트로 쓴 건 관리자 초기화로 되돌린다
    //    XP 는 화폐이므로 쓰면 레벨도 함께 내려간다. 빙옥은 레벨과 무관하다.
    //    가격은 XP 하나만 둔다. 쿠폰 할인(XP)은 주문 전체 판매가 비율로 줄마다 나눈다(빙옥 전용 줄도 제 몫만큼 싸진다).
    //    빙옥 전용 줄: 줄마다 (판매가 − 쿠폰 몫)을 빙옥으로 올림 — pointUse 와 무관하게 먼저 뗀다. XP 로는 절대 내지 않는다.
    //    일반 줄: 합계(쿠폰 몫 뺀 XP)에서 빙옥 몫(1 빙옥 = 1,000 XP)을 한 번만 뺀다. 상한은 xpToPoint(일반 줄 합계)(올림).
    //    옛 요청의 payMethod "point" 는 일반 줄을 전부 빙옥으로 친다.
    //    수량만큼 한 건씩 풀어 둔다 — 아래 구매 기록(rows)과 같은 순서
    const units = [];
    for (const d of docs) {
      for (let i = 0; i < wanted.get(String(d._id)); i++) units.push({ d, price: unitPrice.get(String(d._id)), pointOnly: !!d.pointOnly });
    }
    const pay = planPayment({ lines: units, discount, pointUse: body?.payMethod === "point" ? "max" : body?.pointUse });
    const chargedXp = pay.chargedXp;
    const pointUse = pay.point; // 뺄 빙옥 전부 — 빙옥 전용 줄 몫 + 일반 줄에 고른 빙옥
    const payMethod = pay.payMethod;

    // 어느 쪽이 모자란지 — 빙옥을 먼저 본다(빙옥 전용 몫만으로도 모자라면 그것부터). 둘 다 충분하면 ""
    const shortOf = (w) =>
      (w?.point ?? 0) < pointUse ? "보유 빙옥이 부족합니다." : (w?.xp ?? 0) < chargedXp ? "보유 XP가 부족합니다." : "";
    const wallet = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    const short = shortOf(wallet);
    if (short) {
      await releaseCoupon();
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
    //    청구액이 0 이면(100% 할인 · 쿠폰) 지갑을 건드리지 않는다 — XP 기록이 없는 신규 유저는 문서가 없어 matchedCount 가 0 이 된다
    if (Object.keys(inc).length) {
      const paid = await UserXp.updateOne(filter, { $inc: inc, $set: { updatedAt: new Date() } });
      if (!paid.matchedCount) {
        // 사전 확인과 갱신 사이에 잔액이 바뀐 경우 — 다시 읽어 모자란 쪽을 알린다
        const now = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
        await releaseCoupon();
        await releaseStock();
        return NextResponse.json({ success: false, message: shortOf(now) || "보유 XP가 부족합니다." }, { status: 400 });
      }
    }
    // 뺀 만큼 그대로 되돌린다 — 기록을 못 남겼을 때만 쓴다
    const refundWallet = async () => {
      const back = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v]));
      if (Object.keys(back).length) await UserXp.updateOne({ userId }, { $inc: back });
    };

    // 3) 구매 기록 — 수량만큼 개별 건으로 남겨 봇·관리자가 건별로 처리
    //    📌 건마다 실제로 낸 값(paidXp/paidPoint — 낸 화폐 단위 그대로)을 적는다(planPayment 의 줄별 값).
    //       빙옥 전용 건은 paidXp 0 · paidPoint 제 빙옥, 일반 건은 뺀 XP · 빙옥을 판매가 비율로 나눈 몫 —
    //       건별 합계가 차감액과 정확히 같다. 환불(app/api/shop/orders)이 이 값을 그대로 돌려준다.
    //    _id 를 미리 정해 두어, 넣다 만 경우 그 건들만 골라 지울 수 있게 한다.
    const rows = units.map(({ d }, i) => {
      const days = daysOf.get(String(d._id)) || 0;
      const timing = timingOf(plans.get(String(d._id)), days);
      const line = pay.lines[i];
      return {
        _id: new mongoose.Types.ObjectId(),
        userId,
        userName: session.user.name || "",
        itemId: String(d._id),
        itemRef: d.itemId || "",
        itemName: d.name,
        itemType: d.type,
        roleId: d.roleId || "",
        price: unitPrice.get(String(d._id)),
        payMethod: line.payMethod,
        pointOnly: !!d.pointOnly,
        paidXp: line.paidXp,
        paidPoint: line.paidPoint,
        billed: true,
        // 이 건에 돌려줄 캐시백 — 이 건에서 실제로 낸 XP 의 % (버림). 지급에 실패하면 아래에서 0 으로 되돌린다
        cashbackXp: cashbackOf(line.paidXp, cashPct),
        days,
        // 만료 시각은 결제 시점부터 — 봇 지급이 늦어도 산 만큼은 보장된다. 연장이면 이어 붙인 건의 만료부터(renewOf · startsAt)
        expiresAt: timing.expiresAt,
        renewOf: timing.renewOf,
        startsAt: timing.startsAt,
        contact: d.type === "physical" ? contact.trim() : "",
        status: "pending",
      };
    });
    try {
      await Purchase.insertMany(rows);
    } catch (e) {
      // 📌 기록이 안 남으면 값만 빠지고 물건은 없는 상태가 된다 — 넣다 만 건을 지우고 지갑 · 재고를 되돌린다.
      //    지우기부터 실패하면 되돌리지 않는다(기록이 남았을 수 있어 공짜가 된다) — 바깥 catch 로 넘긴다
      await Purchase.deleteMany({ _id: { $in: rows.map((r) => r._id) } });
      await refundWallet();
      await releaseCoupon();
      await releaseStock();
      throw e;
    }

    // 쿠폰 사용권은 위에서 이미 잡았다 — 지갑에 있으면 그 건도 사용 처리
    if (coupon) {
      await UserCoupon.updateOne(
        { userId, couponId: String(coupon._id), status: "unused" },
        { $set: { status: "used", usedAt: new Date() } }
      );
    }

    // 4) 캐시백 — 결제 · 기록이 확정된 뒤 실제로 낸 XP 의 % 를 XP 로 돌려준다(건별 cashbackXp 의 합).
    //    결제 때 기준선(passBaseXp)을 같은 폭으로 내렸으므로 돌려줄 때도 함께 올린다 — 쇼핑으로 시즌 패스 진행도가 늘지 않게.
    //    지급에 실패하면 건별 기록을 0 으로 되돌린다(환불 때 받지 않은 캐시백을 회수하지 않게). 결제 자체는 성공으로 둔다
    const cashbackXp = rows.reduce((s, r) => s + (r.cashbackXp || 0), 0);
    let cashbackGiven = 0;
    if (cashbackXp > 0) {
      try {
        const cb = await UserXp.updateOne({ userId }, { $inc: { xp: cashbackXp, passBaseXp: cashbackXp }, $set: { updatedAt: new Date() } });
        if (!cb.matchedCount) throw new Error("지갑 문서 없음");
        cashbackGiven = cashbackXp;
        await logWallet({
          userId,
          currency: "xp",
          amount: cashbackXp,
          kind: "cashback",
          label: `캐시백 · ${rows.length > 1 ? `${rows[0].itemName} 외 ${rows.length - 1}건` : rows[0].itemName}`,
          refId: String(rows[0]._id),
          meta: { pct: cashPct, purchaseIds: rows.filter((r) => r.cashbackXp > 0).map((r) => String(r._id)) },
        });
      } catch (e) {
        console.error("캐시백 지급 실패:", e);
        await Purchase.updateMany({ _id: { $in: rows.map((r) => r._id) } }, { $set: { cashbackXp: 0 } }).catch(() => {});
      }
    }

    // 차감된 XP에 맞춰 레벨을 다시 계산 (레벨이 내려갈 수 있다).
    //    빙옥만 냈으면 레벨에 영향이 없으므로 재계산도 역할 동기화도 하지 않는다.
    const balDoc = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    if (chargedXp > 0) {
      // 레벨이 내려갔을 수 있으니 봇이 보상 역할을 다시 맞추도록 표시한다
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(balDoc?.xp ?? 0), needsRoleSync: true } });
    }
    const remain = { xp: balDoc?.xp ?? 0, point: balDoc?.point ?? 0 };
    // 기프트카드만 운영진이 발송한다 — 나머지 유형(역할 · 권한 · 아이템)은 봇이 자동 지급한다
    const hasGift = docs.some((d) => d.type === "physical");
    const hasAuto = docs.some((d) => d.type !== "physical");
    // 전부 연장이면 지급 안내 대신 연장 안내
    const renewed = rows.filter((r) => r.renewOf);
    const allRenew = !hasGift && renewed.length === rows.length;

    const doneMsg = hasGift && hasAuto
      ? "결제가 완료되었습니다. 기프트카드는 운영진 확인 후 발송해 드리고, 나머지 상품은 잠시 후 자동으로 지급됩니다."
      : hasGift
        ? "결제가 완료되었습니다. 운영진 확인 후 발송해 드립니다."
        : allRenew
          ? "결제가 완료되었습니다. 이용 기간이 연장되었습니다."
          : "결제가 완료되었습니다. 잠시 후 자동으로 지급됩니다.";

    return NextResponse.json({
      success: true,
      message: cashbackGiven > 0 ? `${doneMsg} (캐시백 +${cashbackGiven.toLocaleString("ko-KR")} XP)` : doneMsg,
      // subtotal · discount · total 은 XP 기준. usedPoint 는 뺀 빙옥 전부(빙옥 전용 몫 pointOnlyPoint 포함), chargedXp 는 뺀 XP.
      // charged 는 옛 필드 — 한쪽으로만 냈을 때의 그 화폐 값. 섞어 냈으면 XP 몫이다(usedPoint · chargedXp 를 본다)
      data: {
        count: rows.length, subtotal, discount, total, payMethod,
        charged: payMethod === "point" ? pointUse : chargedXp,
        usedPoint: pointUse, chargedXp, pointOnlyPoint: pay.pointOnlyPoint,
        // 돌려받은 캐시백 XP(remain 에 이미 들어 있다) · 그때의 캐시백 %
        cashbackXp: cashbackGiven, cashbackPct: cashPct,
        remain, remainXp: remain.xp, remainPoint: remain.point,
        // 연장된 건 — 상품 id · 새 만료 시각
        renewed: renewed.map((r) => ({ itemId: r.itemId, expiresAt: r.expiresAt })),
      },
    });
  } catch (e) {
    console.error("결제 처리 오류:", e);
    return NextResponse.json({ success: false, message: "결제 처리 중 오류가 발생했습니다." }, { status: 500 });
  } finally {
    if (lock) await ShopLock.release(lock);
  }
}
