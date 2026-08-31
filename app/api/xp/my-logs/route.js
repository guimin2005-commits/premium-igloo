export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import XpLog from "@/models/XpLog";

// KST 기준 오늘 00:00 / 이번 달 1일 00:00 (UTC Date로 반환) — leaderboard의 kstMonthStart와 동일 방식
const kstDayStart = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0);
  return new Date(start - 9 * 60 * 60 * 1000);
};
const kstMonthStart = () => {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const start = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), 1, 0, 0, 0);
  return new Date(start - 9 * 60 * 60 * 1000);
};

// ── [조회] 로그인한 유저 본인의 최근 XP 로그 + 오늘/이번 달 획득 합산 ──
//    내 대시보드(/level) 실시간 위젯용. 로그는 봇이 기록하며 60일 TTL.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const dayStart = kstDayStart();

    const [logs, sums] = await Promise.all([
      XpLog.find({ userId }, { amount: 1, reason: 1, channelName: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(15)
        .lean(),
      // 이번 달치를 reason별로 묶고, 그 안에서 오늘치만 조건 합산
      XpLog.aggregate([
        { $match: { userId, createdAt: { $gte: kstMonthStart() } } },
        {
          $group: {
            _id: "$reason",
            month: { $sum: "$amount" },
            today: { $sum: { $cond: [{ $gte: ["$createdAt", dayStart] }, "$amount", 0] } },
          },
        },
      ]),
    ]);

    const today = { total: 0, chat: 0, voice: 0, attend: 0 };
    const month = { total: 0, chat: 0, voice: 0, attend: 0 };
    for (const s of sums) {
      const key = ["chat", "voice", "attend"].includes(s._id) ? s._id : null;
      if (key) {
        today[key] = s.today;
        month[key] = s.month;
      }
      today.total += s.today;
      month.total += s.month;
    }

    return NextResponse.json({
      success: true,
      data: {
        logs: logs.map((l) => ({
          amount: l.amount,
          reason: l.reason,
          channelName: l.channelName || "",
          createdAt: l.createdAt,
        })),
        today,
        month,
      },
    });
  } catch (e) {
    console.error("내 XP 로그 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
