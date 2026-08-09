export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import UserXp from "@/models/UserXp";

// ── [조회] XP 리더보드 (상위 N명, 기본 50) ─────────────────────
export async function GET(request) {
  try {
    await connectToDatabase();
    const limit = Math.min(100, Math.max(1, parseInt(new URL(request.url).searchParams.get("limit") || "50", 10) || 50));

    const [rows, total] = await Promise.all([
      UserXp.find({}, { userId: 1, displayName: 1, username: 1, xp: 1, level: 1, attendCount: 1 })
        .sort({ xp: -1 })
        .limit(limit)
        .lean(),
      UserXp.countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
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
