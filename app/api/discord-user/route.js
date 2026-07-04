import { NextResponse } from "next/server";

// 📌 디스코드 사용자 ID → 프로필(아바타/이름) 조회 (1시간 캐시)
export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^\d{15,21}$/.test(id)) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
      next: { revalidate: 3600 },
    });

    if (!res.ok) return NextResponse.json({ success: false }, { status: 404 });

    const user = await res.json();
    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

    return NextResponse.json({
      success: true,
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatarUrl,
    });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
