export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";
import XpLog from "@/models/XpLog";

// KST 기준 이번 달 1일 00:00 (UTC Date로 반환)
const kstMonthStart = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1, 0, 0, 0);
  return new Date(start - 9 * 60 * 60 * 1000);
};

// ── [조회] XP 리더보드 — period=all(누적) | month(이번 달) ──
export async function GET(request) {
  try {
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "50", 10) || 50));
    const period = sp.get("period") === "month" ? "month" : "all";

    if (period === "month") {
      // 이번 달 지급 로그를 유저별로 합산 (로그 기반이라 봇 가동 이후분만 집계됨)
      const rows = await XpLog.aggregate([
        { $match: { createdAt: { $gte: kstMonthStart() } } },
        {
          $group: {
            _id: "$userId",
            xp: { $sum: "$amount" },
            displayName: { $last: "$displayName" },
          },
        },
        { $sort: { xp: -1 } },
        { $limit: limit },
      ]);

      // 현재 레벨은 누적 문서에서 채워 넣는다
      const levels = new Map(
        (await UserXp.find({ userId: { $in: rows.map((r) => r._id) } }, { userId: 1, level: 1, displayName: 1 }).lean())
          .map((u) => [u.userId, u])
      );

      return NextResponse.json({
        success: true,
        period,
        monthStart: kstMonthStart(),
        data: rows.map((r, i) => ({
          rank: i + 1,
          userId: r._id,
          name: levels.get(r._id)?.displayName || r.displayName || "이름 없음",
          xp: r.xp,
          level: levels.get(r._id)?.level ?? 0,
        })),
        total: rows.length,
      });
    }

    const [rows, total] = await Promise.all([
      UserXp.find({}, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 })
        .sort({ xp: -1 })
        .limit(limit)
        .lean(),
      UserXp.countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
      period,
      data: rows.map((r, i) => ({
        rank: i + 1,
        userId: r.userId,
        name: r.displayName || r.username || "이름 없음",
        xp: r.xp,
        level: r.level,
        attendCount: r.attendCount || 0,
      })),
      total,
    });
  } catch (e) {
    console.error("리더보드 조회 오류:", e);
    return NextResponse.json({ success: false, data: [], total: 0 }, { status: 500 });
  }
}
