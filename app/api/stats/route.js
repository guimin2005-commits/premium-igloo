import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import Stat from "@/models/Stat";

// 📌 서버 통계 (멤버 수 / 온라인 수 / 활동 그래프) — 5분 캐시
// ?days=N 으로 히스토리 기간 지정 가능 (기본 1일, 최대 60일)
export async function GET(request) {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}?with_counts=true`,
      {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 300 },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ success: false }, { status: 502 });
    }

    const data = await res.json();
    const memberCount = data.approximate_member_count || 0;
    const onlineCount = data.approximate_presence_count || 0;

    let history = [];
    try {
      await connectToDatabase();

      // 10분에 1개만 샘플 저장 (과도한 적재 방지)
      const last = await Stat.findOne().sort({ ts: -1 }).lean();
      if (!last || Date.now() - new Date(last.ts).getTime() > 10 * 60 * 1000) {
        await Stat.create({ online: onlineCount, members: memberCount });
      }

      // 요청 기간만큼 샘플 반환 (기본 1일, 최대 60일) + 60일 지난 데이터 정리
      const days = Math.min(60, Math.max(1, parseInt(new URL(request.url).searchParams.get("days") || "1", 10) || 1));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      history = await Stat.find({ ts: { $gte: since } }).sort({ ts: 1 }).select("ts online members -_id").lean();
      Stat.deleteMany({ ts: { $lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }).catch(() => {});
    } catch (dbErr) {
      // DB 실패해도 기본 통계는 반환
    }

    return NextResponse.json({ success: true, memberCount, onlineCount, history });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
