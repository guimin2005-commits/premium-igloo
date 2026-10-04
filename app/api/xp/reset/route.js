export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser } from "@/lib/apiAuth";
import { addPoints } from "@/lib/points";
import { logWallet } from "@/lib/wallet";
import { getLevelByXp } from "@/lib/leveling";
import UserXp from "@/models/UserXp";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";
import { refundValueOf, clawFromWallet, returnOrderCoupon } from "@/lib/orderRefund";

// 📌 관리자 테스트 초기화 — 관리자 본인 계정만 되돌린다. body { what: "enhance" | "pass" | "shop" }
//    관리자도 일반 유저와 똑같이 차감되므로(상점 · 강화 · 시즌 패스) 초기화는 낸 값을 돌려준다.
//    · enhance: 채팅 · 음성 강화 단계를 0 으로. 강화에 낸 값(enhancePaid)만큼 돌려준다.
//    · pass: 프리미엄 해금 · 수령 기록을 지운다. 해금 때 낸 값(passUnlockPaid)만큼 돌려준다.
//      이미 받은 보상(XP · 빙옥 · 역할)은 회수하지 않는다 — 다시 받을 수 있게 되는 것뿐이다.
//    · shop: 상점에서 산 건을 모두 되돌린다. 대기 건은 취소, 지급된 건은 환불(봇이 역할을 뗀다).
//      실제로 빠진 건(billed)만 돌려준다 — 관리자가 무료로 사던 시절 기록은 되돌리기만 한다.
//    관리자 판정은 서버 세션으로 다시 한다 (화면의 표시는 믿지 않는다).
//    기록된 값(enhancePaid · passUnlockPaid · paidXp/paidPoint)은 모두 낸 화폐 단위 그대로다 —
//    빙옥은 결제 때 환율(1 빙옥 = 10,000 XP)을 적용해 뺀 값이 적혀 있으니 여기서 다시 환산하지 않는다.
const WHATS = ["enhance", "pass", "shop"];

// XP · 빙옥을 돌려준다. XP 는 차감 때 기준선(passBaseXp)도 같이 내렸으므로 같은 폭으로 되돌리고 레벨을 다시 맞춘다
async function refund(userId, xp, point) {
  if (point > 0) await addPoints(userId, point);
  if (xp > 0) {
    const doc = await UserXp.findOneAndUpdate(
      { userId },
      { $inc: { xp, passBaseXp: xp } },
      { new: true, projection: { xp: 1 } }
    ).lean();
    await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(doc?.xp ?? 0), needsRoleSync: true } });
  }
  const parts = [];
  if (xp > 0) parts.push(`XP ${xp.toLocaleString()}`);
  if (point > 0) parts.push(`빙옥 ${point.toLocaleString()}`);
  return parts.length ? ` · ${parts.join(" · ")} 환불` : "";
}

// 📌 강화 · 패스 환불은 원장에 + 줄로 남긴다 — 낸 비용 줄(WalletLog 같은 kind 의 −)과 상쇄돼
//    내역 · 재화 통계 · 랭킹 누적(쓴 XP 를 더하는 셈)이 돌려받은 값을 두 번 세지 않게. 상점은 구매 기록(환불 상태)이 센다
async function logBack(userId, kind, label, xp, point) {
  if (xp > 0) await logWallet({ userId, currency: "xp", amount: xp, kind, label });
  if (point > 0) await logWallet({ userId, currency: "point", amount: point, kind, label });
}

export async function POST(request) {
  try {
    // 📌 로그인·관리자 판정은 공용 가드 — 초기화 대상은 관리자 본인 계정
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    if (!auth.isAdmin || !auth.userId) {
      return NextResponse.json({ success: false, message: "관리자만 초기화할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const what = WHATS.includes(body?.what) ? body.what : "";
    if (!what) {
      return NextResponse.json({ success: false, message: "초기화할 항목을 골라 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = auth.userId;

    // 단계 · 해금 표시를 한 번에 내리면서 이전 값을 받아 온다 — 두 번 눌려도 환불은 한 번만 된다
    if (what === "enhance") {
      const before = await UserXp.findOneAndUpdate(
        { userId },
        { $set: { chatEnhance: 0, voiceEnhance: 0, enhancePaid: { xp: 0, point: 0 }, updatedAt: new Date() } },
        { new: false, projection: { enhancePaid: 1 } }
      ).lean();
      const xpBack = before?.enhancePaid?.xp || 0;
      const pointBack = before?.enhancePaid?.point || 0;
      const msg = await refund(userId, xpBack, pointBack);
      await logBack(userId, "enhance", "강화 초기화 환불", xpBack, pointBack);
      return NextResponse.json({ success: true, message: `강화 단계를 초기화했습니다${msg}.` });
    }

    if (what === "pass") {
      const before = await UserXp.findOneAndUpdate(
        { userId },
        {
          $set: {
            passUnlocked: false,
            passUnlockPaid: { method: "", amount: 0 },
            passClaimedFree: [],
            passClaimedPaid: [],
            updatedAt: new Date(),
          },
        },
        { new: false, projection: { passUnlocked: 1, passUnlockPaid: 1 } }
      ).lean();
      const paid = before?.passUnlocked ? before?.passUnlockPaid : null;
      const amount = paid?.amount > 0 ? paid.amount : 0;
      const xpBack = paid?.method === "xp" ? amount : 0;
      const pointBack = paid?.method === "point" ? amount : 0;
      const msg = await refund(userId, xpBack, pointBack);
      await logBack(userId, "pass-unlock", "패스 초기화 환불", xpBack, pointBack);
      return NextResponse.json({ success: true, message: `시즌 패스를 초기화했습니다${msg}.` });
    }

    // shop — 상점 상품만 (itemId 가 ShopItem id). 관리자 지급("grant") · 시즌 패스 보상("season-pass")은 건드리지 않는다
    const rows = await Purchase.find(
      { userId, itemId: { $regex: /^[0-9a-f]{24}$/i }, status: { $in: ["pending", "completed", "expired"] } },
      { _id: 1, status: 1 }
    ).lean();
    const now = new Date();
    let backXp = 0;
    let backPoint = 0;
    let count = 0;
    const claws = [];
    const orders = new Map(); // 쿠폰을 쓴 주문 — 전부 되돌린 뒤 쿠폰도 돌려준다(주문 환불과 같은 returnOrderCoupon)
    for (const r of rows) {
      // 대기 건은 역할이 아직 없으니 취소, 지급된 건은 환불 — 봇이 roleDetached 를 보고 역할을 뗀다.
      //    만료 건은 봇이 이미 역할을 뗐으므로 roleDetached 를 세워 둔다 (다시 떼며 알림을 보내지 않게)
      const next = r.status === "pending" ? "cancelled" : "refunded";
      const p = await Purchase.findOneAndUpdate(
        { _id: r._id, status: r.status },
        {
          $set: {
            status: next,
            adminNote: "관리자 테스트 초기화",
            processedAt: now,
            ...(next === "refunded" ? { revokedAt: now, roleDetached: r.status === "expired" } : {}),
          },
        },
        { new: false }
      ).lean();
      if (!p) continue;
      count++;
      if (p.billed) {
        // 📌 돌려줄 값 · 캐시백 회수는 관리자 환불(app/api/shop/orders)과 같은 식 — lib/orderRefund refundValueOf.
        //    받은 캐시백은 돌려줄 XP 에서 빼고(claw), 빙옥 몫 캐시백(상점 관리 › 설정)처럼 돌려줄 XP 로 다 못 뺀 몫(clawRest)은
        //    환불 뒤 지갑 XP 에서 있는 만큼 뺀다(clawFromWallet)
        const v = refundValueOf(p);
        backXp += v.xp;
        backPoint += v.point;
        if (v.claw > 0 || v.clawRest > 0) claws.push({ claw: v.claw, rest: v.clawRest, name: p.itemName, refId: String(p._id) });
      }
      if (p.orderId && p.couponId) orders.set(String(p.orderId), { userId, orderId: p.orderId, couponId: p.couponId });
      await ShopItem.updateOne({ _id: p.itemId, stock: { $gte: 0 } }, { $inc: { stock: 1 } });
      await ShopItem.updateOne({ _id: p.itemId, soldCount: { $gt: 0 } }, { $inc: { soldCount: -1 } });
    }
    if (!count) {
      return NextResponse.json({ success: true, message: "되돌릴 상점 구매가 없습니다." });
    }
    const msg = await refund(userId, backXp, backPoint);
    // 고른 카드 스킨 · 단 배지도 처음(안 고름)으로 — 되돌린 아이템을 가리키는 고른 값("none" · 키 · 배열)이 다음 테스트에 남지 않게.
    //    2026-10-04 부터 자동 착용이 없어 다시 사면 인벤토리에서 직접 착용한다
    await UserXp.updateOne({ userId }, { $set: { cardSkinPick: "" }, $unset: { badgePick: "" } });
    // 회수한 캐시백은 원장에 따로 남긴다 — 환불(+paidXp)은 구매 기록이 세므로, 빼고 돌려준 몫(claw) · 지갑에서 뺀 몫(rest)을 여기서 맞춘다
    let restXp = 0;
    for (const c of claws) {
      const rest = c.rest > 0 ? await clawFromWallet(userId, c.rest) : 0;
      restXp += rest;
      const amount = c.claw + rest;
      if (amount > 0) await logWallet({ userId, currency: "xp", amount: -amount, kind: "cashback", label: `캐시백 회수 · ${c.name || "상품"}`, refId: c.refId });
    }
    // 지갑에서 캐시백을 뺐으면 레벨이 내려갈 수 있다 — 봇이 보상 역할을 다시 맞추도록 표시한다
    if (restXp > 0) {
      const w = await UserXp.findOne({ userId }, { xp: 1 }).lean();
      await UserXp.updateOne({ userId }, { $set: { level: getLevelByXp(w?.xp ?? 0), needsRoleSync: true } });
    }
    // 주문에 쓴 쿠폰 — 그 주문을 전부 되돌렸으면 다시 쓸 수 있게 돌려준다. 실패해도 초기화는 끝난 것이라 막지 않는다
    let couponBack = 0;
    for (const o of orders.values()) {
      if (await returnOrderCoupon(o).catch((e) => { console.error("주문 쿠폰 반환 실패:", o.orderId, e?.message || e); return false; })) couponBack++;
    }
    const tail = [restXp > 0 ? `캐시백 XP ${restXp.toLocaleString()} 회수` : "", couponBack > 0 ? `쿠폰 ${couponBack}장 반환` : ""].filter(Boolean).map((s) => ` · ${s}`).join("");
    return NextResponse.json({ success: true, message: `상점 구매 ${count}건을 되돌렸습니다${msg}${tail}.` });
  } catch (e) {
    console.error("관리자 초기화 오류:", e);
    return NextResponse.json({ success: false, message: "초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
