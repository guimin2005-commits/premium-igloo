export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import Code from "@/models/Code";
import Coupon from "@/models/Coupon";

// ── [이전] 기존 '코드'를 보상형 쿠폰으로 옮긴다 (관리자, 1회성) ──
//    같은 code가 이미 쿠폰에 있으면 건너뛰므로 여러 번 눌러도 안전하다
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdminName(session?.user?.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }

    await connectToDatabase();
    const codes = await Code.find().lean();
    if (codes.length === 0) {
      return NextResponse.json({ success: true, message: "옮길 코드가 없습니다.", data: { moved: 0, skipped: 0 } });
    }

    const existing = new Set(
      (await Coupon.find({ code: { $in: codes.map((c) => c.code) } }, { code: 1 }).lean()).map((c) => c.code)
    );

    const rows = codes
      .filter((c) => !existing.has(c.code))
      .map((c) => ({
        code: c.code,
        name: c.reward || "보상 쿠폰",
        kind: "reward",
        reward: c.reward || "",
        rewardRoleId: c.roleId || "",
        rewardXp: c.xpAmount || 0,
        requiredRoleId: c.requiredRoleId || "",
        requiredRoleName: c.requiredRoleName || "",
        // 기존 usedBy는 닉네임 기반이라 횟수만 승계 (userId 기준 제한은 새로 시작)
        maxUses: c.maxUses ?? 1,
        usedCount: (c.usedBy || []).length,
        perUserLimit: 1,
        active: c.isActive !== false,
        expiresAt: c.expiresAt || undefined,
        createdAt: c.createdAt || new Date(),
      }));

    if (rows.length > 0) await Coupon.insertMany(rows, { ordered: false });

    return NextResponse.json({
      success: true,
      message: `${rows.length}개를 쿠폰으로 옮겼습니다.${existing.size > 0 ? ` (이미 있는 ${existing.size}개 제외)` : ""}`,
      data: { moved: rows.length, skipped: existing.size },
    });
  } catch (e) {
    console.error("쿠폰 이전 오류:", e);
    return NextResponse.json({ success: false, message: "이전 중 오류가 발생했습니다." }, { status: 500 });
  }
}
