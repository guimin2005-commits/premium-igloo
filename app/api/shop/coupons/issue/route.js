export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Coupon from "@/models/Coupon";
import UserCoupon from "@/models/UserCoupon";
import UserXp from "@/models/UserXp";

// ── [지급] 관리자가 유저 지갑에 쿠폰을 넣어준다 ──
//    target: 디스코드 닉네임 또는 유저 ID · "all"이면 XP 기록이 있는 전원
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const { couponId, target } = await request.json();
    const coupon = await Coupon.findById(couponId).lean();
    if (!coupon) {
      return NextResponse.json({ success: false, message: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
    }

    // 대상 유저 결정
    let targets = [];
    if (target === "all") {
      targets = await UserXp.find({}, { userId: 1, displayName: 1, username: 1 }).lean();
    } else {
      const key = (target || "").trim();
      if (!key) {
        return NextResponse.json({ success: false, message: "지급 대상을 입력해주세요." }, { status: 400 });
      }
      targets = await UserXp.find(
        { $or: [{ userId: key }, { username: key }, { displayName: key }] },
        { userId: 1, displayName: 1, username: 1 }
      ).lean();
      if (targets.length === 0) {
        return NextResponse.json({ success: false, message: "해당 유저를 찾을 수 없습니다." }, { status: 404 });
      }
    }

    // 이미 미사용으로 보유 중인 유저는 건너뛴다
    const already = await UserCoupon.find(
      { couponId: String(coupon._id), status: "unused", userId: { $in: targets.map((t) => t.userId) } },
      { userId: 1 }
    ).lean();
    const skip = new Set(already.map((a) => a.userId));

    const rows = targets
      .filter((t) => !skip.has(t.userId))
      .map((t) => ({
        userId: t.userId,
        userName: t.displayName || t.username || "",
        couponId: String(coupon._id),
        code: coupon.code,
        source: "admin",
      }));

    if (rows.length > 0) await UserCoupon.insertMany(rows);

    return NextResponse.json({
      success: true,
      message: `${rows.length}명에게 지급했습니다.${skip.size > 0 ? ` (이미 보유 ${skip.size}명 제외)` : ""}`,
    });
  } catch (e) {
    console.error("쿠폰 지급 오류:", e);
    return NextResponse.json({ success: false, message: "지급 중 오류가 발생했습니다." }, { status: 500 });
  }
}
