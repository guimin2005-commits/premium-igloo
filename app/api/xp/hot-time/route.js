export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import BotSetting from "@/models/BotSetting";
import XpLog from "@/models/XpLog";
import { hotTimeState, hotTimeDays, hotTimeMults } from "@/lib/hotTime";

// 📌 핫타임 진행도 — 레벨 화면 카드 아래 핫타임 띠를 누르면 뜨는 창(app/level/HotTime.js). 2026-10-25 운영자 "클릭하면 핫타임 이벤트 진행도가 보이게"
//    기간 · 날마다 배수(lib/hotTime hotTimeDays) + 이번 핫타임 동안 내가 더 받은 XP(XpLog.hot — 봇 bot/src/xp.js 가 채팅 · 음성 줄에 남긴다).
//    XpLog.hot 은 핫타임 몫에 그 몫의 패스 가속까지 더한 값이라(이벤트 패스 진행도에서 빼려고) 줄마다 amount / (amount + passBoost) 를 곱해 XP 몫만 센다
const KST = 9 * 3600e3;
const kstDayStart = (now) => {
  const k = new Date(now + KST);
  return new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST);
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    await connectToDatabase();
    const setting = await BotSetting.findOne(
      { key: "main" },
      { hotTimeOn: 1, hotTimeName: 1, hotTimeFrom: 1, hotTimeUntil: 1, hotTimeWeekdayMult: 1, hotTimeWeekendMult: 1 },
    ).lean();
    const now = Date.now();
    const h = hotTimeState(setting, now);
    if (!h.on) return NextResponse.json({ success: true, on: false });

    const today = kstDayStart(now);
    const rows = await XpLog.aggregate([
      { $match: { userId: session.user.id, hot: { $gt: 0 }, createdAt: { $gte: new Date(h.from), $lt: new Date(h.until) } } },
      {
        $group: {
          _id: { r: "$reason", t: { $gte: ["$createdAt", today] } },
          xp: { $sum: { $round: [{ $divide: [{ $multiply: ["$hot", "$amount"] }, { $max: [1, { $add: ["$amount", { $ifNull: ["$passBoost", 0] }] }] }] }, 0] } },
        },
      },
    ]);
    const xp = { total: 0, today: 0, chat: 0, voice: 0 };
    for (const r of rows) {
      const v = Math.max(0, Math.round(Number(r.xp) || 0));
      xp.total += v;
      if (r._id?.t) xp.today += v;
      if (r._id?.r === "chat") xp.chat += v;
      else if (r._id?.r === "voice") xp.voice += v;
    }

    return NextResponse.json({
      success: true,
      on: true,
      name: h.name,
      mult: h.mult,
      weekend: h.weekend,
      from: h.from,
      until: h.until,
      mults: hotTimeMults(setting),
      days: hotTimeDays(setting),
      xp,
    });
  } catch (e) {
    console.error("[xp/hot-time]", e);
    return NextResponse.json({ success: false, error: "핫타임 정보를 불러오지 못했습니다." }, { status: 500 });
  }
}
