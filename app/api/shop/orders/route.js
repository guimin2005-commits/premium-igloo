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
    const filter = status && ["pending", "completed", "cancelled"].includes(status) ? { status } : {};

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
    if (!id || !["completed", "cancelled"].includes(status)) {
      return NextResponse.json({ success: false, message: "잘못된 요청입니다." }, { status: 400 });
    }

    // 대기 중인 건만 상태 변경 — 이미 처리된 건의 중복 환불을 막는다
    const purchase = await Purchase.findOneAndUpdate(
      { _id: id, status: "pending" },
      { status, adminNote: (adminNote || "").trim(), processedAt: new Date() },
      { new: true }
    );
    if (!purchase) {
      return NextResponse.json({ success: false, message: "이미 처리된 구매입니다." }, { status: 409 });
    }

    // 취소 시 환불 + 재고 복구 (환불로 레벨이 다시 올라갈 수 있다)
    //    📌 price 는 쿠폰 적용 전 정가라 그대로 돌려주면 과다 환불이 된다.
    //       실제 결제한 금액(paidXp/paidPoint)을 그 지갑으로 되돌린다.
    //       옛 기록에는 두 필드가 없으므로 그때만 price 로 떨어진다.
    if (status === "cancelled") {
      const hasSplit = (purchase.paidXp || 0) > 0 || (purchase.paidPoint || 0) > 0;
      const backXp = hasSplit ? purchase.paidXp || 0 : purchase.price || 0;
      const backPoint = hasSplit ? purchase.paidPoint || 0 : 0;
      const inc = {};
      if (backXp) inc.xp = backXp;
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
      await ShopItem.updateOne(
        { _id: purchase.itemId, stock: { $gte: 0 } },
        { $inc: { stock: 1, soldCount: -1 } }
      );
    }

    return NextResponse.json({ success: true, data: purchase });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
