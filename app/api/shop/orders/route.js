export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Purchase from "@/models/Purchase";
import UserXp from "@/models/UserXp";
import { getLevelByXp } from "@/lib/leveling";
import ShopItem from "@/models/ShopItem";
import mongoose from "mongoose";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// ── [조회] 전체 구매 내역 (관리자) ──
export async function GET(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const filter = status && ["pending", "completed", "cancelled", "refunded"].includes(status) ? { status } : {};

    const [rows, pendingCount] = await Promise.all([
      Purchase.find(filter).sort({ createdAt: -1 }).limit(200).lean(),
      Purchase.countDocuments({ status: "pending" }),
    ]);
    return NextResponse.json({ success: true, data: rows, pendingCount });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [처리] 발송 완료 / 취소(환불) (관리자) ──
export async function PATCH(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const { id, status, adminNote } = await request.json();
    if (!id || !["completed", "cancelled", "refunded"].includes(status)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    // 📌 상태 전이는 두 갈래다.
    //    pending   → completed(발송) | cancelled(취소·환불)
    //    completed → refunded(환불) — 역할 상품은 봇이 30초 안에 completed 로 바꾸므로
    //    pending 만 취소할 수 있으면 관리자가 실제로 환불할 창이 거의 없다.
    //    조건에 이전 상태를 넣어 두 번 눌러도 두 번 환불되지 않게 한다.
    const fromStatus = status === "refunded" ? "completed" : "pending";
    const purchase = await Purchase.findOneAndUpdate(
      { _id: id, status: fromStatus },
      {
        status,
        adminNote: (adminNote || "").trim(),
        processedAt: new Date(),
        // 환불은 봇이 디스코드 역할을 떼야 끝난다 — roleDetached 를 내려 큐가 집어 가게 한다
        ...(status === "refunded" ? { revokedAt: new Date(), roleDetached: false } : {}),
      },
      { new: true }
    );
    if (!purchase) {
      return NextResponse.json({ success: false, message: "이미 처리된 구매입니다." }, { status: 409 });
    }

    // 취소 시 환불 + 재고 복구 (환불로 레벨이 다시 올라갈 수 있다)
    //    📌 price 는 쿠폰 적용 전 정가라 그대로 돌려주면 과다 환불이 된다.
    //       실제 결제한 금액(paidXp/paidPoint)을 그 지갑으로 되돌린다.
    //       옛 기록에는 두 필드가 없으므로 그때만 price 로 떨어진다.
    if (status === "cancelled" || status === "refunded") {
      const hasSplit = (purchase.paidXp || 0) > 0 || (purchase.paidPoint || 0) > 0;
      const backXp = hasSplit ? purchase.paidXp || 0 : purchase.price || 0;
      const backPoint = hasSplit ? purchase.paidPoint || 0 : 0;
      const inc = {};
      // 차감 때 기준선(passBaseXp)을 함께 내렸으므로 환불도 같은 폭으로 되돌린다.
      //    한쪽만 움직이면 시즌 패스 진행도가 환불할 때마다 부풀어 오른다.
      if (backXp) { inc.xp = backXp; inc.passBaseXp = backXp; }
      if (backPoint) inc.point = backPoint;
      if (Object.keys(inc).length) await UserXp.updateOne({ userId: purchase.userId }, { $inc: inc });
      if (backXp) {
        // XP 가 돌아오면 레벨이 오를 수 있다 — 봇이 보상 역할을 다시 맞추도록 표시한다
        const refunded = await UserXp.findOne({ userId: purchase.userId }, { xp: 1 }).lean();
        await UserXp.updateOne(
          { userId: purchase.userId },
          { $set: { level: getLevelByXp(refunded?.xp ?? 0), needsRoleSync: true } }
        );
      }
      // 📌 시즌 패스 보상으로 지급한 건은 itemId 가 ObjectId 가 아니라 "season-pass" 문자열이다.
      //    그대로 _id 로 넘기면 CastError 로 500 이 나는데, 취소는 이미 반영된 뒤라
      //    관리자 화면은 실패로 보이고 실제로는 취소된 유령 상태가 된다. 상점 상품일 때만 재고를 되돌린다.
      if (mongoose.Types.ObjectId.isValid(purchase.itemId)) {
        await ShopItem.updateOne(
          { _id: purchase.itemId, stock: { $gte: 0 } },
          { $inc: { stock: 1, soldCount: -1 } }
        );
      }
    }

    return NextResponse.json({ success: true, data: purchase });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
