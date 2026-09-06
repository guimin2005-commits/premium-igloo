export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import UserXp from "@/models/UserXp";
import { settleTierPoints } from "@/lib/points";

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

    // 승급 보상 정산 — 봇이 레벨을 올리고, 그에 따른 POINT 는 사이트가 여기서 갚는다.
    //    pointTierPaid 조건부 갱신이라 몇 번을 불러도 한 번만 지급된다.
    const tierGain = await settleTierPoints(session.user.id, level).catch(() => 0);
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
        point: (doc?.point || 0) + tierGain,
        // 이번 조회에서 새로 정산된 승급 보상 — 화면에서 알림으로 쓸 수 있다
        pointGain: tierGain,
        attendCount: doc?.attendCount || 0,
        // 통산 음성 참여 시간(초) — 시즌이 바뀌어도 이어진다
        voiceSeconds: doc?.voiceSeconds || 0,
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
