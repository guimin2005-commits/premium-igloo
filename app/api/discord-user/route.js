import { NextResponse } from "next/server";
import { fetchGuildMember } from "@/lib/discordMember";

// 📌 디스코드 사용자 ID → 프로필(아바타/이름) 조회 (1시간 캐시)
//    📌 2026-11-01 globalName = 서버 별명(길드 멤버 nick → 디스코드 표시 이름 → 계정 이름). 명예의 전당 · 경매 선수 이름 · ID 칩이 그대로 받는다
//       서버에 없거나 멤버 조회가 실패하면 예전처럼 /users/{id} 로 표시 이름을 쓴다
export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d{15,21}$/.test(id)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  try {
    const g = await fetchGuildMember(id);
    let user = g.status === "ok" ? g.member?.user : null;
    if (!user?.id) {
      const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 3600 },
      });

      if (!res.ok) return NextResponse.json({ success: false }, { status: 404 });
      user = await res.json();
    }
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

    return NextResponse.json({
      success: true,
      id: user.id,
      username: user.username,
      globalName: (g.status === "ok" && String(g.member?.nick || "").trim()) || user.global_name || user.username,
      avatarUrl,
    });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
