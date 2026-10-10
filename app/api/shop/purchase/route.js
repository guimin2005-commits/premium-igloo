export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import { salePrice, isTimed, durationPrice } from "@/lib/shopPricing";
import { getLevelByXp } from "@/lib/leveling";
import { planPayment } from "@/lib/shopPay";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import ShopLock from "@/models/ShopLock";
import BotSetting from "@/models/BotSetting";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { getPerks } from "@/lib/itemPerks";
import { cashbackOf, cashbackRuleOf, cashbackBaseOf } from "@/lib/itemEffects";
import { activeXpStopUntil } from "@/lib/xpStop";
import { logWallet } from "@/lib/wallet";
import { liveHoldings, planPurchase, timingOf, kstStamp } from "../_lib/renewal";
import { stripAdminTag, isAdminName } from "@/lib/admins";
import { REFUND_MARK_RE, CLEANUP_MARK_RE } from "@/lib/roleMigrationTerms";
import mongoose from "mongoose";
import { isBundle, bundleUnits, splitAmount } from "@/lib/bundle";
import { bundleStateFor } from "@/lib/bundleServer";

// 캐시백 % · 설정 · XP 획득 중단 — 이번 결제 전에 가진 것으로 정한다(아래 POST 와 같은 규칙). 읽지 못하면 캐시백 없이
async function cashbackPlan(userId) {
  const [perkPct, cashRule, xpStopped] = await Promise.all([
    getPerks(userId)
      .then((p) => p.shopCashback || 0)
      .catch((e) => { console.error("캐시백 조회 실패:", e); return 0; }),
    BotSetting.findOne({ key: "main" }, { shopCashbackCap: 1, cashbackOnPoint: 1 }).lean()
      .then(cashbackRuleOf)
      .catch((e) => { console.error("캐시백 설정 조회 실패:", e); return cashbackRuleOf(null); }),
    activeXpStopUntil(userId)
      .then((until) => !!until)
      .catch((e) => { console.error("XP 획득 중단 조회 실패:", e); return true; }),
  ]);
  return { cashPct: xpStopped ? 0 : Math.min(perkPct, cashRule.cap), cashRule };
}

// ── [구매 · 세트] 구성 아이템을 한 결제로 — 가진 구성은 빼고 그만큼 깎는다(lib/bundle.js). 낱개 구매와 같은 자물쇠 · 재고 · 지갑 · 캐시백 순서 ──
//    건마다 itemId = 세트 상품, itemRef = 구성 아이템, bundleName = 세트 이름, 같은 orderId, 첫 건만 bundleHead.
//    낸 값(price · paidXp · paidPoint · cashbackXp)은 구성 몸값 비율로 나눠 적는다(합이 정확히 결제액) — 건마다 환불해도 낸 만큼만 돌아간다
async function buyBundle({ session, userId, item, body }) {
  let lock = null;
  try {
    // 📌 유저 자물쇠 — 보유 확인부터 기록까지 다른 결제가 끼지 못하게(낱개 구매와 같다)
    lock = await ShopLock.acquire(userId);
    if (!lock) {
      return NextResponse.json({ success: false, message: "처리 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 409 });
    }
    // 구성 · 보유 판정 · 값 — 견적 API 와 같은 함수(lib/bundleServer bundleStateFor)
    const st = await bundleStateFor(userId, item);
    if (!st.ok) {
      return NextResponse.json({ success: false, message: st.why === "empty" ? "세트 구성이 비어 있습니다." : "세트 구성을 확인할 수 없습니다. 운영진에게 문의해 주세요." }, { status: 409 });
    }
    const { comps, byId, states, quote } = st;

    if (quote.all) {
      return NextResponse.json({ success: false, message: "세트 안의 아이템을 이미 모두 가지고 있습니다." }, { status: 409 });
    }

    // 가격 — 화면에서 본 값(가진 만큼 깎은 값)과 다르면 결제하지 않는다
    const price = quote.price;
    if (body?.expectedPrice != null && Number(body.expectedPrice) !== price) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "가격이 바뀌었습니다. 바뀐 금액을 확인하고 다시 구매해 주세요." }, { status: 409 });
    }
    if (body?.expectedPointOnly != null && !!body.expectedPointOnly !== !!item.pointOnly) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "결제 수단이 바뀌었습니다. 다시 확인하고 구매해 주세요." }, { status: 409 });
    }

    const { cashPct, cashRule } = await cashbackPlan(userId);

    // 1) 재고 — 세트 한 번
    if (item.stock >= 0) {
      const claimed = await ShopItem.updateOne({ _id: item._id, stock: { $gt: 0 } }, { $inc: { stock: -1, soldCount: 1 } });
      if (!claimed.modifiedCount) {
        return NextResponse.json({ success: false, message: "품절된 상품입니다." }, { status: 409 });
      }
    } else {
      await ShopItem.updateOne({ _id: item._id }, { $inc: { soldCount: 1 } });
    }
    const releaseStock = () =>
      ShopItem.updateOne({ _id: item._id }, item.stock >= 0 ? { $inc: { stock: 1, soldCount: -1 } } : { $inc: { soldCount: -1 } });

    // 2) 결제 — 낱개 구매와 같은 계약(lib/shopPay.js)
    const pay = planPayment({
      lines: [{ price, pointOnly: !!item.pointOnly }],
      pointUse: body?.payMethod === "point" ? "max" : body?.pointUse,
    });
    const chargedXp = pay.chargedXp;
    const pointUse = pay.point;
    const payMethod = pay.payMethod;
    const shortOf = (w) =>
      (w?.point ?? 0) < pointUse ? "보유 빙옥이 부족합니다." : (w?.xp ?? 0) < chargedXp ? "보유 XP가 부족합니다." : "";
    const wallet = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    const short = shortOf(wallet);
    if (short) {
      await releaseStock();
      return NextResponse.json({ success: false, message: short }, { status: 400 });
    }
    const filter = { userId };
    const inc = {};
    if (chargedXp > 0) { filter.xp = { $gte: chargedXp }; inc.xp = -chargedXp; inc.passBaseXp = -chargedXp; }
    if (pointUse > 0) { filter.point = { $gte: pointUse }; inc.point = -pointUse; }
    if (Object.keys(inc).length) {
      const paid = await UserXp.updateOne(filter, { $inc: inc, $set: { updatedAt: new Date() } });
      if (!paid.matchedCount) {
        const now = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
        await releaseStock();
        return NextResponse.json({ success: false, message: shortOf(now) || "보유 XP가 부족합니다." }, { status: 400 });
      }
    }

    // 3) 구성 건 기록 — 가진 구성은 빼고, qty 는 1개씩. 낸 값은 몸값 비율로 나눈다
    const units = bundleUnits(comps, states);
    const w = units.map((u) => u.weight);
    const priceSplit = splitAmount(price, w);
    const xpSplit = splitAmount(chargedXp, w);
    const pointSplit = splitAmount(pointUse, w);
    const cashTotal = cashbackOf(cashbackBaseOf(chargedXp, pointUse, cashRule.onPoint), cashPct);
    const cashSplit = splitAmount(cashTotal, w);
    const ids = units.map(() => new mongoose.Types.ObjectId());
    const orderId = String(ids[0]);
    const docs = units.map((u, k) => {
      const it = byId.get(u.comp.itemId);
      const timing = timingOf(u.state.state === "renew" ? { renew: u.state.base } : {}, u.comp.days);
      return {
        _id: ids[k],
        orderId,
        userId,
        userName: session.user.name || "",
        itemId: String(item._id),
        itemRef: u.comp.itemId,
        itemName: it.name,
        itemType: it.type,
        roleId: it.roleId || "",
        bundleName: item.name,
        bundleHead: k === 0,
        price: priceSplit[k],
        payMethod,
        pointOnly: !!item.pointOnly,
        paidXp: xpSplit[k],
        paidPoint: pointSplit[k],
        billed: true,
        cashbackXp: cashSplit[k],
        days: u.comp.days,
        expiresAt: timing.expiresAt,
        renewOf: timing.renewOf,
        startsAt: timing.startsAt,
        status: "pending",
      };
    });
    try {
      await Purchase.insertMany(docs, { ordered: true });
    } catch (e) {
      await Purchase.deleteMany({ _id: { $in: ids } });
      const back = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v]));
      if (Object.keys(back).length) await UserXp.updateOne({ userId }, { $inc: back });
      await releaseStock();
      throw e;
    }

    // 4) 캐시백 — 결제 전체에 한 번(건마다 나눠 적어 둔 값의 합). 실패하면 건마다 0 으로
    let cashbackGiven = 0;
    if (cashTotal > 0) {
      try {
        const cb = await UserXp.updateOne({ userId }, { $inc: { xp: cashTotal, passBaseXp: cashTotal }, $set: { updatedAt: new Date() } });
        if (!cb.matchedCount) throw new Error("지갑 문서 없음");
        cashbackGiven = cashTotal;
        await logWallet({
          userId,
          currency: "xp",
          amount: cashTotal,
          kind: "cashback",
          label: `캐시백 · ${item.name}`,
          refId: orderId,
          meta: { pct: cashPct, purchaseIds: ids.map(String) },
        });
      } catch (e) {
        console.error("캐시백 지급 실패:", e);
        await Purchase.updateMany({ _id: { $in: ids } }, { $set: { cashbackXp: 0 } }).catch(() => {});
      }
    }

    const doc = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    if (chargedXp > 0 || cashbackGiven > 0) {
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } });
    }
    const remain = { xp: doc?.xp ?? 0, point: doc?.point ?? 0 };
    const skipped = quote.owned ? ` 이미 가진 ${quote.owned}개는 빼고 그만큼 깎았습니다.` : "";
    const doneMsg = `세트 구매가 완료되었습니다. 아이템 ${units.length}개가 잠시 후 자동으로 지급됩니다.${skipped}`;
    return NextResponse.json({
      success: true,
      message: cashbackGiven > 0 ? `${doneMsg} (캐시백 +${cashbackGiven.toLocaleString("ko-KR")} XP)` : doneMsg,
      data: {
        purchaseId: ids[0], orderId, purchaseIds: ids, payMethod,
        charged: payMethod === "point" ? pointUse : chargedXp,
        usedPoint: pointUse, chargedXp,
        cashbackXp: cashbackGiven, cashbackPct: cashPct,
        remain, remainXp: remain.xp, remainPoint: remain.point,
        bundle: { granted: units.length, owned: quote.owned },
      },
    });
  } finally {
    if (lock) await ShopLock.release(lock);
  }
}

// ── [구매] 본인 XP · 빙옥을 소모해 상품 구매 — pointUse: 쓸 빙옥 개수(나머지는 XP) ──
//    역할 상품은 봇이 큐(status:pending)를 보고 자동 지급, 실물은 관리자가 발송 처리
export async function POST(request) {
  let lock = null;
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    // 📌 서버 인증(디스코드 인증 역할 — lib/authOptions isVerified) 회원만 구매한다(약관 'ARCTIC 서버 인증 회원만'). 관리자는 통과.
    //    화면은 인증 전 유저를 /verify 로 보내지만(app/ClientLayout) API 를 직접 부르면 그대로 사졌다 — 장바구니 결제와 같은 검사
    if (session.user.isVerified !== true && !isAdminName(session.user.name)) {
      return NextResponse.json({ success: false, message: "서버 인증 후 이용할 수 있습니다." }, { status: 403 });
    }
    // 📌 점검 중에는 구매를 서버에서 막는다 (관리자는 통과)
    const maintenance = await denyIfMaintenance(session);
    if (maintenance) return maintenance;

    await connectToDatabase();

    // 공개 전에는 관리자만 구매 가능 (테스트용)
    const { canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, message: "아직 공개되지 않은 상점입니다." }, { status: 403 });
    }

    const body = await request.json();
    const { itemId, contact, days: rawDays } = body;
    if (!itemId) {
      return NextResponse.json({ success: false, message: "상품이 지정되지 않았습니다." }, { status: 400 });
    }

    const item = await ShopItem.findById(itemId);
    if (!item || !item.active) {
      return NextResponse.json({ success: false, message: "판매 중인 상품이 아닙니다." }, { status: 404 });
    }
    // 📌 세트 상품 — 구성 아이템마다 한 건씩(lib/bundle.js). 자물쇠 · 결제 · 기록을 따로 처리한다
    if (isBundle(item)) return await buyBundle({ session, userId, item, body });
    if (item.type === "physical" && !contact?.trim()) {
      return NextResponse.json({ success: false, message: "수령 정보를 입력해주세요." }, { status: 400 });
    }

    // 📌 기간제 상품은 파는 기간 중 하나를 반드시 골라야 한다
    //    무제한은 days 0 이라 !days 로 걸면 안 된다 — 가격표에 있는지(durationPrice)로만 판정한다
    const days = isTimed(item) ? Math.floor(Number(rawDays) || 0) : 0;
    if (isTimed(item) && durationPrice(item, days) == null) {
      return NextResponse.json({ success: false, message: "이용 기간을 골라주세요." }, { status: 400 });
    }

    // 📌 유저 자물쇠 — 기보유 확인부터 구매 기록까지 이 유저의 다른 결제(장바구니 결제 포함)가 끼어들지 못하게 한다.
    //    없으면 동시에 보낸 두 요청이 둘 다 기보유 확인을 통과해 같은 상품이 두 번 결제된다. 아래 finally 에서 푼다
    lock = await ShopLock.acquire(userId);
    if (!lock) {
      return NextResponse.json({ success: false, message: "처리 중인 결제가 있습니다. 잠시 후 다시 시도해 주세요." }, { status: 409 });
    }

    // 📌 모든 상품은 1인 1개 — 살아 있는 보유(같은 상품 · 같은 아이템) 중 무제한이 있으면 재구매 불가.
    //    기간제만 가졌으면 기간제는 연장(가장 늦은 만료 뒤에 이어 붙임) · 무제한은 업그레이드로 받는다 (_lib/renewal.js — 장바구니 결제와 같은 규칙)
    const plan = planPurchase(item, days, await liveHoldings(userId, [item]));
    if (plan.block) {
      return NextResponse.json({ success: false, message: "이미 구매한 상품입니다. 상품은 1인 1개만 구매할 수 있습니다." }, { status: 409 });
    }

    // 📌 가격은 재고를 잡기 전에 정한다 — 화면에서 본 값과 다르면(보는 사이 할인이 끝남) 결제하지 않는다
    const price = salePrice(item, days);
    if (body?.expectedPrice != null && Number(body.expectedPrice) !== price) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "가격이 바뀌었습니다. 바뀐 금액을 확인하고 다시 구매해 주세요." }, { status: 409 });
    }
    // 📌 보는 사이 빙옥 전용으로 바뀌었거나 풀렸으면 결제 수단이 달라진다 — 값이 같아도 다시 보게 한다
    if (body?.expectedPointOnly != null && !!body.expectedPointOnly !== !!item.pointOnly) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "결제 수단이 바뀌었습니다. 다시 확인하고 구매해 주세요." }, { status: 409 });
    }

    // 📌 캐시백 % (아이템 효과 shopCashback — 상한 적용) — 이번 결제 전에 가진 것으로 정한다(방금 사는 캐시백 아이템이 제 결제에 붙지 않게).
    //    재고를 잡기 전에 읽는다. 읽지 못하면 캐시백 없이 결제한다(결제를 막지 않는다) — 장바구니 결제와 같은 규칙
    //    📌 상한 · 빙옥 몫 포함 여부는 관리자 설정(상점 관리 › 설정 — lib/itemEffects cashbackRuleOf). 설정을 못 읽으면 기본값(30% · XP 몫만)
    //    📌 XP 획득 중단(관리자 — lib/xpStop.js) 중이면 캐시백 없음 — 장바구니 결제와 같다. 확인하지 못하면 캐시백 없이
    const [perkPct, cashRule, xpStopped] = await Promise.all([
      getPerks(userId)
        .then((p) => p.shopCashback || 0)
        .catch((e) => { console.error("캐시백 조회 실패:", e); return 0; }),
      BotSetting.findOne({ key: "main" }, { shopCashbackCap: 1, cashbackOnPoint: 1 }).lean()
        .then(cashbackRuleOf)
        .catch((e) => { console.error("캐시백 설정 조회 실패:", e); return cashbackRuleOf(null); }),
      activeXpStopUntil(userId)
        .then((until) => !!until)
        .catch((e) => { console.error("XP 획득 중단 조회 실패:", e); return true; }),
    ]);
    const cashPct = xpStopped ? 0 : Math.min(perkPct, cashRule.cap);

    // 1) 재고 선점 — 무제한(-1)이 아니면 남은 수량이 있을 때만 차감
    if (item.stock >= 0) {
      const claimed = await ShopItem.updateOne(
        { _id: item._id, stock: { $gt: 0 } },
        { $inc: { stock: -1, soldCount: 1 } }
      );
      if (!claimed.modifiedCount) {
        return NextResponse.json({ success: false, message: "품절된 상품입니다." }, { status: 409 });
      }
    } else {
      await ShopItem.updateOne({ _id: item._id }, { $inc: { soldCount: 1 } });
    }

    // 선점한 재고를 되돌린다 — 결제 실패 · 기록 실패 때 쓴다
    const releaseStock = () =>
      ShopItem.updateOne({ _id: item._id }, item.stock >= 0 ? { $inc: { stock: 1, soldCount: -1 } } : { $inc: { soldCount: -1 } });

    // 2) 결제 — 빙옥은 원하는 만큼(pointUse 개) 쓰고, 나머지를 XP 로 낸다 (장바구니 결제와 같은 계약 — lib/shopPay.js planPayment)
    //    가격은 XP 하나만 둔다. 가격(XP)에서 빙옥 몫(1 빙옥 = 10,000 XP — lib/pointRate.js)을 뺀 나머지가 XP 차감액이다.
    //    빙옥 상한은 xpToPoint(가격)(올림) — 넘게 보내면 상한으로 깎는다. 끝전 때문에 빙옥 몫이 가격보다 크면 XP 는 0.
    //    옛 요청의 payMethod "point" 는 전부 빙옥으로 친다.
    //    📌 빙옥 전용 상품은 pointUse 를 보지 않는다 — 판매가 전부를 빙옥(xpToPoint, 올림)으로만 뺀다. XP 는 0
    //    XP 는 화폐이므로 쓰면 레벨도 내려가지만 빙옥은 레벨과 무관하다.
    //    📌 관리자도 일반 유저와 똑같이 차감한다 — 테스트로 쓴 건 관리자 초기화로 되돌린다
    const pay = planPayment({
      lines: [{ price, pointOnly: !!item.pointOnly }],
      pointUse: body?.payMethod === "point" ? "max" : body?.pointUse,
    });
    const chargedXp = pay.chargedXp;
    const pointUse = pay.point; // 뺄 빙옥 전부 — 빙옥 전용이면 판매가를 빙옥으로 친 값, 아니면 고른 빙옥
    const payMethod = pay.payMethod;

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
    //    청구액이 0 이면(100% 할인) 지갑을 건드리지 않는다 — XP 기록이 없는 신규 유저는 문서가 없어 matchedCount 가 0 이 된다
    if (Object.keys(inc).length) {
      const paid = await UserXp.updateOne(filter, { $inc: inc, $set: { updatedAt: new Date() } });
      if (!paid.matchedCount) {
        // 사전 확인과 갱신 사이에 잔액이 바뀐 경우 — 다시 읽어 모자란 쪽을 알린다. 선점한 재고는 원복
        const now = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
        await releaseStock();
        return NextResponse.json({ success: false, message: shortOf(now) || "보유 XP가 부족합니다." }, { status: 400 });
      }
    }

    // 3) 구매 기록 (봇/관리자가 처리할 대기 건)
    //    📌 기록이 안 남으면 값만 빠지고 물건은 없는 상태가 된다 — 미리 정한 _id 로 넣다 만 건을 지우고 지갑 · 재고를 되돌린다.
    //       지우기부터 실패하면 되돌리지 않는다(기록이 남았을 수 있어 공짜가 된다) — 바깥 catch 로 넘긴다
    const purchaseId = new mongoose.Types.ObjectId();
    const timing = timingOf(plan, days);
    // 이 건에 돌려줄 캐시백 — 실제로 낸 XP(설정에서 켜면 + 낸 빙옥 × 10,000)의 % (버림). 지급에 실패하면 아래에서 0 으로 되돌린다
    const cashbackXp = cashbackOf(cashbackBaseOf(chargedXp, pointUse, cashRule.onPoint), cashPct);
    let purchase;
    try {
      purchase = await Purchase.create({
        _id: purchaseId,
        // 한 건짜리 주문 — 주문 내역 · 원장이 장바구니 결제와 같은 방식으로 묶는다
        orderId: String(purchaseId),
        userId,
        userName: session.user.name || "",
        itemId: String(item._id),
        itemRef: item.itemId || "",
        itemName: item.name,
        itemType: item.type,
        roleId: item.roleId || "",
        price,
        payMethod,
        pointOnly: !!item.pointOnly,
        paidXp: chargedXp,
        paidPoint: pointUse,
        billed: true,
        cashbackXp,
        days,
        // 만료 시각은 결제 시점부터(임시) — 📌 2026-10-04 #127 디스코드 역할이 있는 기간제 새 구매는 봇이 역할을 준 시각부터 다시 센다
        //    (bot/src/features/grantQueue.js grantedEnd — 줄이지는 않는다). 연장이면 이어 붙인 건의 만료부터(renewOf · startsAt)
        expiresAt: timing.expiresAt,
        renewOf: timing.renewOf,
        startsAt: timing.startsAt,
        contact: item.type === "physical" ? contact.trim() : "",
        status: "pending",
      });
    } catch (e) {
      await Purchase.deleteOne({ _id: purchaseId });
      const back = Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, -v]));
      if (Object.keys(back).length) await UserXp.updateOne({ userId }, { $inc: back });
      await releaseStock();
      throw e;
    }

    // 4) 캐시백 — 결제 · 기록이 확정된 뒤 실제로 낸 XP 의 % 를 XP 로 돌려준다(장바구니 결제와 같은 규칙).
    //    결제 때 내린 기준선(passBaseXp)도 같은 폭으로 올린다 — 쇼핑으로 시즌 패스 진행도가 늘지 않게.
    //    지급에 실패하면 기록을 0 으로 되돌린다(환불 때 받지 않은 캐시백을 회수하지 않게). 구매 자체는 성공으로 둔다
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
          label: `캐시백 · ${item.name}`,
          refId: String(purchaseId),
          meta: { pct: cashPct, purchaseIds: [String(purchaseId)] },
        });
      } catch (e) {
        console.error("캐시백 지급 실패:", e);
        await Purchase.updateOne({ _id: purchaseId }, { $set: { cashbackXp: 0 } }).catch(() => {});
      }
    }

    // 차감된 XP에 맞춰 레벨을 다시 계산 (레벨이 내려갈 수 있다)
    //    빙옥만 냈으면 레벨에 영향이 없으므로 재계산도 역할 동기화도 하지 않는다 — 빙옥 몫 캐시백(XP)을 받았으면 XP 가 늘었으니 다시 계산한다
    const doc = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    if (chargedXp > 0 || cashbackGiven > 0) {
      // 레벨이 내려갔을 수 있으니 봇이 보상 역할을 다시 맞추도록 표시한다
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } });
    }
    const remain = { xp: doc?.xp ?? 0, point: doc?.point ?? 0 };
    // 역할이 없는 아이템(사이트 인벤토리 전용)도 봇이 자동 지급한다 — 역할 문구는 역할이 있을 때만
    const autoMsg = timing.renewOf
      ? `기간이 연장되었습니다. ${kstStamp(timing.expiresAt)}까지 이용할 수 있습니다.`
      : item.roleId
      ? (days > 0 ? `구매가 완료되었습니다. ${days}일 동안 역할이 유지되며, 잠시 후 자동으로 지급됩니다.` : "구매가 완료되었습니다. 잠시 후 역할이 자동으로 지급됩니다.")
      : (days > 0 ? `구매가 완료되었습니다. ${days}일 동안 이용할 수 있으며, 잠시 후 자동으로 지급됩니다.` : "구매가 완료되었습니다. 잠시 후 자동으로 지급됩니다.");

    const doneMsg = item.type !== "physical"
      ? autoMsg
      : "구매가 완료되었습니다. 운영진 확인 후 발송해 드립니다.";

    return NextResponse.json({
      success: true,
      message: cashbackGiven > 0 ? `${doneMsg} (캐시백 +${cashbackGiven.toLocaleString("ko-KR")} XP)` : doneMsg,
      // usedPoint 는 뺀 빙옥, chargedXp 는 뺀 XP.
      // charged 는 옛 필드 — 한쪽으로만 냈을 때의 그 화폐 값. 섞어 냈으면 XP 몫이다(usedPoint · chargedXp 를 본다)
      data: {
        purchaseId: purchase._id, payMethod,
        // 연장이면 이어 붙인 구매 id · 새 만료 시각
        renewOf: timing.renewOf, expiresAt: timing.expiresAt,
        charged: payMethod === "point" ? pointUse : chargedXp,
        usedPoint: pointUse, chargedXp,
        // 돌려받은 캐시백 XP(remain 에 이미 들어 있다) · 그때의 캐시백 %
        cashbackXp: cashbackGiven, cashbackPct: cashPct,
        remain, remainXp: remain.xp, remainPoint: remain.point,
      },
    });
  } catch (e) {
    console.error("구매 처리 오류:", e);
    return NextResponse.json({ success: false, message: "구매 처리 중 오류가 발생했습니다." }, { status: 500 });
  } finally {
    if (lock) await ShopLock.release(lock);
  }
}

// ── [조회] 내 구매 내역 ──
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ success: false, data: [] }, { status: 401 });
    }
    await connectToDatabase();
    // 📌 최근 200건 + 그 밖의 살아 있는 보유 건(대기 · 완료, 소모 안 됨, 기간이 없거나 남음) — 화면의 보유 판정(app/arctic/owned.ts)이 이 목록을 쓴다.
    //    최근 건만 주면 구매가 많은 유저는 오래된 영구 구매가 빠져 이미 산 상품이 미보유로 보인다.
    //    1개 단위 상품은 1개가 한 건이라 건 수가 빨리 는다 — 최근 창을 넓히고, 다 쓴 소모권(consumedAt)은 보유 창을 채우지 않게 뺀다.
    //    최근 창 밖의 건은 모두 그보다 오래됐으므로 뒤에 붙여도 최신순이 유지된다
    //    📌 역할 환불 표시 기록(관리자 역할 이전 — 산 적 없는 역할을 XP · 빙옥으로 돌려준 표시, 낸 값 0)은 구매가 아니라 뺀다. 환불 금액은 내역(원장)에 보인다
    //    📌 역할 정리 표시 기록(역할 이전 '기간 끝남' — 남은 역할만 떼는 표시, 낸 값 0)도 구매가 아니라 뺀다
    const [recent, live] = await Promise.all([
      Purchase.find({
        userId,
        $nor: [
          { itemId: "grant", status: "refunded", adminNote: REFUND_MARK_RE },
          { itemId: "grant", status: "refunded", adminNote: CLEANUP_MARK_RE },
        ],
      }).sort({ createdAt: -1 }).limit(200).lean(),
      Purchase.find({
        userId,
        status: { $in: ["pending", "completed"] },
        consumedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const seen = new Set(recent.map((r) => String(r._id)));
    // 📌 운영진 메모는 구매 내역에 그대로 보인다 — 예전 수동 지급 메모 끝의 관리자 이름(" (elahw.06)")은 떼고 내보낸다
    const rows = [...recent, ...live.filter((r) => !seen.has(String(r._id)))].map((r) =>
      r.adminNote ? { ...r, adminNote: stripAdminTag(r.adminNote) } : r
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
