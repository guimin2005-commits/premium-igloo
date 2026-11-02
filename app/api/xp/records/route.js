export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { kstToday, kstDateKey } from "@/lib/kst";
import XpLog from "@/models/XpLog";
import ActivityStat from "@/models/ActivityStat";

// 📌 기록 화면(app/level/RecordView.js — 2026-11-02 대시보드 오른쪽 「기록」) — 본인 것만(세션). 읽기만 한다.
//    · days      출석한 날(KST "YYYY-MM-DD") — 출석 XP 기록(XpLog reason "attend" — 봇 attend.js 가 출석 · 연속 보너스 XP 를 남긴다, 100일 보관)
//                달력은 일요일부터 5주(start = 이번 주 일요일에서 4주 전 일요일) · 이번 달 출석 일수를 위해 그달 1일이 더 이르면 거기부터 읽는다
//    · chatToday 오늘 보낸 메시지 수(ActivityStat k "msg" — 봇 activityStats.js, 퀘스트 진행도와 같은 기록)
const KST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });

    const today = kstToday();
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const dow = new Date(todayMs).getUTCDay(); // 일 = 0
    const start = keyOf(todayMs - (dow + 28) * DAY);
    const monthKey = `${today.slice(0, 7)}-01`;
    const fromKey = monthKey < start ? monthKey : start;
    const from = new Date(Date.parse(`${fromKey}T00:00:00Z`) - KST);

    await connectToDatabase();
    const [logs, chat] = await Promise.all([
      XpLog.find({ userId, reason: "attend", createdAt: { $gte: from } }, { createdAt: 1, _id: 0 }).lean(),
      ActivityStat.aggregate([{ $match: { u: userId, d: today, k: "msg" } }, { $group: { _id: null, n: { $sum: "$n" } } }]),
    ]);
    const all = [...new Set(logs.map((l) => kstDateKey(l.createdAt)))].sort();

    return NextResponse.json({
      success: true,
      data: {
        today,
        start,
        days: all.filter((d) => d >= start),
        monthDays: all.filter((d) => d.startsWith(today.slice(0, 7))).length,
        chatToday: Math.max(0, Math.floor(Number(chat[0]?.n) || 0)),
      },
    });
  } catch (e) {
    console.error("기록 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
