export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import { addPoints } from "@/lib/points";
import { getLevelByXp } from "@/lib/leveling";
import UserXp from "@/models/UserXp";
import Purchase from "@/models/Purchase";
import ShopItem from "@/models/ShopItem";

// 📌 관리자 테스트 초기화 — 관리자 본인 계정만 되돌린다. body { what: "enhance" | "pass" | "shop" }
//    관리자도 일반 유저와 똑같이 차감되므로(상점 · 강화 · 시즌 패스) 초기화는 낸 값을 돌려준다.
//    · enhance: 채팅 · 음성 강화 단계를 0 으로. 강화에 낸 값(enhancePaid)만큼 돌려준다.
//    · pass: 프리미엄 해금 · 수령 기록을 지운다. 해금 때 낸 값(passUnlockPaid)만큼 돌려준다.
//      이미 받은 보상(XP · 빙옥 · 역할)은 회수하지 않는다 — 다시 받을 수 있게 되는 것뿐이다.
//    · shop: 상점에서 산 건을 모두 되돌린다. 대기 건은 취소, 지급된 건은 환불(봇이 역할을 뗀다).
//      실제로 빠진 건(billed)만 돌려준다 — 관리자가 무료로 사던 시절 기록은 되돌리기만 한다.
//    관리자 판정은 서버 세션으로 다시 한다 (화면의 표시는 믿지 않는다).
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

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isAdminName(session.user.name)) {
      return NextResponse.json({ success: false, message: "관리자만 초기화할 수 있습니다." }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const what = WHATS.includes(body?.what) ? body.what : "";
    if (!what) {
      return NextResponse.json({ success: false, message: "초기화할 항목을 골라 주세요." }, { status: 400 });
    }

    await connectToDatabase();
    const userId = session.user.id;

    // 단계 · 해금 표시를 한 번에 내리면서 이전 값을 받아 온다 — 두 번 눌려도 환불은 한 번만 된다
    if (what === "enhance") {
      const before = await UserXp.findOneAndUpdate(
        { userId },
        { $set: { chatEnhance: 0, voiceEnhance: 0, enhancePaid: { xp: 0, point: 0 }, updatedAt: new Date() } },
        { new: false, projection: { enhancePaid: 1 } }
      ).lean();
      const msg = await refund(userId, before?.enhancePaid?.xp || 0, before?.enhancePaid?.point || 0);
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
      const msg = await refund(userId, paid?.method === "xp" ? amount : 0, paid?.method === "point" ? amount : 0);
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
        backXp += p.paidXp || 0;
        backPoint += p.paidPoint || 0;
      }
      await ShopItem.updateOne({ _id: p.itemId, stock: { $gte: 0 } }, { $inc: { stock: 1 } });
      await ShopItem.updateOne({ _id: p.itemId, soldCount: { $gt: 0 } }, { $inc: { soldCount: -1 } });
    }
    if (!count) {
      return NextResponse.json({ success: true, message: "되돌릴 상점 구매가 없습니다." });
    }
    const msg = await refund(userId, backXp, backPoint);
    return NextResponse.json({ success: true, message: `상점 구매 ${count}건을 되돌렸습니다${msg}.` });
  } catch (e) {
    console.error("관리자 초기화 오류:", e);
    return NextResponse.json({ success: false, message: "초기화 중 오류가 발생했습니다." }, { status: 500 });
  }
}
