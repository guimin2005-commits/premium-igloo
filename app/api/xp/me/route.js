export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import UserXp from "@/models/UserXp";

// ── [조회] 로그인한 유저 본인의 XP·레벨·순위 ──────────────────
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const doc = await UserXp.findOne({ userId: session.user.id }).lean();

    const xp = doc?.xp || 0;
    const level = doc?.level || 0;
    const [above, total] = await Promise.all([
      UserXp.countDocuments({ xp: { $gt: xp } }),
      UserXp.countDocuments(),
    ]);

    const currentCum = getCumulativeXpByLevel(level);
    const nextCum = getCumulativeXpByLevel(level + 1);

    return NextResponse.json({
      success: true,
      data: {
        xp,
        level,
        rank: above + 1,
        total,
        attendCount: doc?.attendCount || 0,
        lastAttendDate: doc?.lastAttendDate || "",
        // 진행률 표시용: 현재 레벨 구간 내 진행 XP / 구간 총 XP
        levelProgress: {
          current: Math.max(0, xp - currentCum),
          required: Math.max(1, nextCum - currentCum),
          needToNext: Math.max(0, nextCum - xp),
        },
      },
    });
  } catch (e) {
    console.error("XP 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
