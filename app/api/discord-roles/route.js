import { NextResponse } from "next/server";

// 📌 서버의 디스코드 역할 목록 (관리자 대시보드 드롭다운용, 10분 캐시)
export async function GET() {
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/roles`,
      {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 600 },
      }
    );

    if (!res.ok) return NextResponse.json({ success: false, data: [] }, { status: 502 });

    const roles = await res.json();
    const data = roles
      .filter((r) => r.name !== "@everyone" && !r.managed)
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#99aab5",
      }));

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
