import { NextResponse } from "next/server";

// 📌 서버 통계 (멤버 수 / 온라인 수) — 5분 캐시
export async function GET() {
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
    return NextResponse.json({
      success: true,
      memberCount: data.approximate_member_count || 0,
      onlineCount: data.approximate_presence_count || 0,
    });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
