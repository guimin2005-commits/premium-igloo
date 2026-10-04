export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import XpLog from "@/models/XpLog";
import Payout from "@/models/Payout";
import { stripAdminTag } from "@/lib/admins";

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

// 📌 보상 XP — 퀘스트 · 시즌 패스 · 운영진 지급 · 쿠폰 · 서포터즈 등 지급 대기열(Payout)로 들어온 XP.
//    봇 processPayouts 는 UserXp.xp 만 올리고 XpLog 를 쓰지 않아, XpLog 만 보면 피드 · '오늘 획득'에서 빠진다.
//    2026-10-04 "보상 XP도 같이 보여서 'XP가 어디서 늘었는지' 바로 알 수 있습니다" — 반영된(paid) 양수 XP 지급만 더한다.
//    운영진 회수 · 초기화(음수 · 0)는 '획득'이 아니라 넣지 않는다 — 초기화 기록(kind "reset" · 관리자 · 퇴장)은 금액과 상관없이 뺀다(랭킹 monthBoard 와 같다).
//    빙옥(currency "point")은 XP 가 아니라 뺀다.
//    줄 이름은 내역(app/api/xp/ledger)과 같다 — 사유(관리자 이름 꼬리는 뗀다), 비었으면 출처 이름
const FEED_LIMIT = 15;
const PAYOUT_SOURCE = {
  manual: "운영진 지급",
  admin: "운영진 지급",
  quest: "퀘스트 보상",
  pass: "시즌 패스 보상",
  code: "쿠폰 보상",
  supporter: "서포터즈 보상",
  referral: "초대 보상",
  "role-refund": "역할 환불",
};
const GAIN_PAYOUT = (userId) => ({ userId, status: "paid", currency: { $ne: "point" }, amount: { $gt: 0 }, kind: { $ne: "reset" } });

// ── [조회] 로그인한 유저 본인의 최근 XP 로그 + 오늘/이번 달 획득 합산 ──
//    내 대시보드(/level) 실시간 위젯용. 로그는 봇이 기록하며 100일 TTL(models/XpLog). 보상 XP(Payout)는 위 GAIN_PAYOUT 을 함께 센다.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const userId = session.user.id;
    const dayStart = kstDayStart();
    const monthStart = kstMonthStart();

    const [logs, sums, pays, paySums] = await Promise.all([
      XpLog.find({ userId }, { amount: 1, reason: 1, channelName: 1, createdAt: 1 })
        .sort({ createdAt: -1 })
        .limit(FEED_LIMIT)
        .lean(),
      // 이번 달치를 reason별로 묶고, 그 안에서 오늘치만 조건 합산
      XpLog.aggregate([
        { $match: { userId, createdAt: { $gte: monthStart } } },
        {
          $group: {
            _id: "$reason",
            month: { $sum: "$amount" },
            today: { $sum: { $cond: [{ $gte: ["$createdAt", dayStart] }, "$amount", 0] } },
          },
        },
      ]),
      // 보상 XP 최근 줄 — 시각은 반영된 때(paidAt, 없으면 만든 때)
      Payout.aggregate([
        { $match: GAIN_PAYOUT(userId) },
        { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
        { $sort: { at: -1 } },
        { $limit: FEED_LIMIT },
        { $project: { at: 1, amount: 1, reason: 1, source: 1 } },
      ]),
      // 보상 XP 이번 달 · 오늘 합
      Payout.aggregate([
        { $match: { ...GAIN_PAYOUT(userId), $or: [{ paidAt: { $gte: monthStart } }, { createdAt: { $gte: monthStart } }] } },
        { $addFields: { at: { $ifNull: ["$paidAt", "$createdAt"] } } },
        { $match: { at: { $gte: monthStart } } },
        {
          $group: {
            _id: null,
            month: { $sum: "$amount" },
            today: { $sum: { $cond: [{ $gte: ["$at", dayStart] }, "$amount", 0] } },
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
    today.total += paySums[0]?.today || 0;
    month.total += paySums[0]?.month || 0;

    // 피드 — 활동 XP 와 보상 XP 를 시각 순으로 섞어 최근 FEED_LIMIT 건
    const feed = [
      ...logs.map((l) => ({
        amount: l.amount,
        reason: l.reason,
        channelName: l.channelName || "",
        createdAt: l.createdAt,
      })),
      ...pays.map((p) => ({
        amount: p.amount,
        reason: "payout",
        channelName: "",
        label: stripAdminTag(String(p.reason || "").trim()) || PAYOUT_SOURCE[p.source] || "지급",
        createdAt: p.at,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, FEED_LIMIT);

    return NextResponse.json({
      success: true,
      data: {
        logs: feed,
        today,
        month,
      },
    });
  } catch (e) {
    console.error("내 XP 로그 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
