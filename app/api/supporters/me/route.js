export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isSupporterSession, monthKeyKST, prevMonthKey, shiftMonthKey, getActivity, getActivityDaily, getSupporterSettings } from "@/lib/supporters";
import SupporterEval from "@/models/SupporterEval";
import UserXp from "@/models/UserXp";

// ── [조회] 내 서포터즈 현황 — 이번 달·지난 달 활동, 시즌 누적 음성, 내 평가 내역 ──
//    평가는 본인 것만 내려간다. draft 도 내려가되 화면은 "평가 중"으로만 보여 준다.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.name) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    if (!isSupporterSession(session)) {
      return NextResponse.json({ success: false, error: "서포터즈 전용입니다." }, { status: 403 });
    }
    await connectToDatabase();

    const userId = session.user.id || "";
    const month = monthKeyKST();
    const prev = prevMonthKey(month);
    const settings = await getSupporterSettings();

    // XpLog 는 60일 TTL — 지난 달까지만 셀 수 있고 그 이전 달은 평가 스냅샷(SupporterEval)에만 남는다
    const since = shiftMonthKey(month, -11); // 최근 12개월
    const [activity, prevActivity, daily, user, evals] = await Promise.all([
      getActivity(userId, month, settings.tickMin),
      getActivity(userId, prev, settings.tickMin),
      getActivityDaily(userId, month, settings.tickMin),
      UserXp.findOne({ userId }, { voiceSeconds: 1 }).lean(),
      SupporterEval.find({ userId, month: { $gte: since } }).sort({ month: -1 }).limit(12).lean(),
    ]);

    return NextResponse.json({
      success: true,
      month,
      activity,
      daily,
      prev: { month: prev, ...prevActivity },
      voiceSeasonSec: user?.voiceSeconds || 0,
      goals: settings.goals,
      baseXp: settings.baseXp,
      evals: evals.map((e) => ({
        month: e.month,
        grade: e.grade || "",
        xp: e.xp || 0,
        point: e.point || 0,
        note: e.note || "",
        status: e.status === "paid" ? "paid" : "draft",
        paidAt: e.paidAt || null,
      })),
    });
  } catch (e) {
    console.error("서포터즈 현황 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
