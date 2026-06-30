import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { userId, acceptScrim } = await request.json();
    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    const AUTH_ROLE = process.env.DISCORD_AUTH_ROLE_ID;
    const UNAUTH_ROLE = process.env.DISCORD_UNAUTH_ROLE_ID;
    const SCRIM_ROLE = process.env.DISCORD_SCRIM_ROLE_ID; // 📌 새로 추가된 내전 역할 변수
    const TOKEN = process.env.DISCORD_BOT_TOKEN;

    if (!userId) {
      return NextResponse.json({ error: "유저 ID가 없습니다." }, { status: 400 });
    }

    // 1. 기본 서버 인증 역할 지급 (필수)
    const addRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${AUTH_ROLE}`, {
      method: 'PUT',
      headers: { "Authorization": `Bot ${TOKEN}`, "Content-Length": "0" }
    });

    if (!addRes.ok) {
      const err = await addRes.text();
      return NextResponse.json({ error: `기본 인증 실패: ${err}` }, { status: addRes.status });
    }

    // 2. 미인증 역할(펭귄 알) 제거 (필수)
    await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${UNAUTH_ROLE}`, {
      method: 'DELETE',
      headers: { "Authorization": `Bot ${TOKEN}` }
    });

    // 3. 내전 역할 지급 (유저가 동의했고, 환경변수에 역할 ID가 있을 때만)
    if (acceptScrim && SCRIM_ROLE) {
      await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${userId}/roles/${SCRIM_ROLE}`, {
        method: 'PUT',
        headers: { "Authorization": `Bot ${TOKEN}`, "Content-Length": "0" }
      });
    }

    return NextResponse.json({ success: true, message: "인증이 완료되었습니다." });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}