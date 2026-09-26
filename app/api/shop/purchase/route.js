export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getShopAccess } from "@/lib/shopAccess";
import { salePrice, isTimed, durationPrice } from "@/lib/shopPricing";
import { getLevelByXp } from "@/lib/leveling";
import { xpToPoint, POINT_RATE } from "@/lib/pointRate";
import ShopItem from "@/models/ShopItem";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import ShopLock from "@/models/ShopLock";
import mongoose from "mongoose";

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

    // 📌 모든 상품은 1인 1개 — 이미 구매(대기·완료)한 건이 있으면 재구매 불가
    // 기간제는 기간이 끝나면 다시 살 수 있어야 하므로, 아직 살아 있는 건만 막는다
    const owned = await Purchase.findOne({
      userId,
      status: { $in: ["pending", "completed"] },
      $and: [
        { $or: [{ itemId: String(item._id) }, ...(item.itemId ? [{ itemRef: item.itemId }] : [])] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    }).lean();
    if (owned) {
      return NextResponse.json({
        success: false,
        message: owned.expiresAt ? "아직 이용 기간이 남아 있습니다. 기간이 끝난 뒤 다시 구매할 수 있습니다." : "이미 구매한 상품입니다. 상품은 1인 1개만 구매할 수 있습니다.",
      }, { status: 409 });
    }

    // 📌 가격은 재고를 잡기 전에 정한다 — 화면에서 본 값과 다르면(보는 사이 할인이 끝남) 결제하지 않는다
    const price = salePrice(item, days);
    if (body?.expectedPrice != null && Number(body.expectedPrice) !== price) {
      return NextResponse.json({ success: false, code: "PRICE_CHANGED", message: "가격이 바뀌었습니다. 바뀐 금액을 확인하고 다시 구매해 주세요." }, { status: 409 });
    }

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

    // 2) 결제 — 빙옥은 원하는 만큼(pointUse 개) 쓰고, 나머지를 XP 로 낸다 (장바구니 결제와 같은 계약)
    //    가격은 XP 하나만 둔다. 가격(XP)에서 빙옥 몫(1 빙옥 = 1,000 XP — lib/pointRate.js)을 뺀 나머지가 XP 차감액이다.
    //    빙옥 상한은 xpToPoint(가격)(올림) — 넘게 보내면 상한으로 깎는다. 끝전 때문에 빙옥 몫이 가격보다 크면 XP 는 0.
    //    옛 요청의 payMethod "point" 는 전부 빙옥으로 친다.
    //    XP 는 화폐이므로 쓰면 레벨도 내려가지만 빙옥은 레벨과 무관하다.
    //    📌 관리자도 일반 유저와 똑같이 차감한다 — 테스트로 쓴 건 관리자 초기화로 되돌린다
    const maxPoint = xpToPoint(price);
    const askedPoint = body?.payMethod === "point" ? maxPoint : Math.max(0, Math.floor(Number(body?.pointUse) || 0));
    const pointUse = Math.min(askedPoint, maxPoint);
    const chargedXp = Math.max(0, price - pointUse * POINT_RATE);
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
    let purchase;
    try {
      purchase = await Purchase.create({
        _id: purchaseId,
        userId,
        userName: session.user.name || "",
        itemId: String(item._id),
        itemRef: item.itemId || "",
        itemName: item.name,
        itemType: item.type,
        roleId: item.roleId || "",
        price,
        payMethod,
        paidXp: chargedXp,
        paidPoint: pointUse,
        billed: true,
        days,
        // 만료 시각은 결제 시점부터 — 봇 지급이 늦어도 산 만큼은 보장된다
        expiresAt: days > 0 ? new Date(Date.now() + days * 86400000) : null,
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

    // 차감된 XP에 맞춰 레벨을 다시 계산 (레벨이 내려갈 수 있다)
    //    빙옥만 냈으면 레벨에 영향이 없으므로 재계산도 역할 동기화도 하지 않는다.
    const doc = await UserXp.findOne({ userId }, { xp: 1, point: 1 }).lean();
    if (chargedXp > 0) {
      // 레벨이 내려갔을 수 있으니 봇이 보상 역할을 다시 맞추도록 표시한다
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } });
    }
    const remain = { xp: doc?.xp ?? 0, point: doc?.point ?? 0 };
    // 역할이 없는 아이템(사이트 인벤토리 전용)도 봇이 자동 지급한다 — 역할 문구는 역할이 있을 때만
    const autoMsg = item.roleId
      ? (days > 0 ? `구매가 완료되었습니다. ${days}일 동안 역할이 유지되며, 잠시 후 자동으로 지급됩니다.` : "구매가 완료되었습니다. 잠시 후 역할이 자동으로 지급됩니다.")
      : (days > 0 ? `구매가 완료되었습니다. ${days}일 동안 이용할 수 있으며, 잠시 후 자동으로 지급됩니다.` : "구매가 완료되었습니다. 잠시 후 자동으로 지급됩니다.");

    return NextResponse.json({
      success: true,
      message: item.type !== "physical"
        ? autoMsg
        : "구매가 완료되었습니다. 운영진 확인 후 발송해 드립니다.",
      // usedPoint 는 뺀 빙옥, chargedXp 는 뺀 XP.
      // charged 는 옛 필드 — 한쪽으로만 냈을 때의 그 화폐 값. 섞어 냈으면 XP 몫이다(usedPoint · chargedXp 를 본다)
      data: {
        purchaseId: purchase._id, payMethod,
        charged: payMethod === "point" ? pointUse : chargedXp,
        usedPoint: pointUse, chargedXp,
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
    // 📌 최근 50건 + 그 밖의 살아 있는 보유 건(대기 · 완료, 기간이 없거나 남음) — 화면의 보유 판정(app/arctic/owned.ts)이 이 목록을 쓴다.
    //    최근 건만 주면 구매가 50건을 넘은 유저는 오래된 영구 구매가 빠져 이미 산 상품이 미보유로 보인다.
    //    최근 50건 밖의 건은 모두 그보다 오래됐으므로 뒤에 붙여도 최신순이 유지된다
    const [recent, live] = await Promise.all([
      Purchase.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
      Purchase.find({
        userId,
        status: { $in: ["pending", "completed"] },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).sort({ createdAt: -1 }).limit(500).lean(),
    ]);
    const seen = new Set(recent.map((r) => String(r._id)));
    const rows = [...recent, ...live.filter((r) => !seen.has(String(r._id)))];
    return NextResponse.json({ success: true, data: rows });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
