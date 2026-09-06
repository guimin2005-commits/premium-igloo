import { NextResponse } from "next/server";
import { requireUser } from "@/lib/apiAuth";

// 📌 서버의 디스코드 역할 목록 (관리자 대시보드 + ARCTIC 역할 상품 표시용, 10분 캐시)
//    ARCTIC(상점)에서도 쓰므로 관리자 한정은 아니지만, 비로그인 노출은 막는다.
export async function GET(request) {
  try {
    const auth = await requireUser();
    if (auth.deny) return auth.deny;
    // 📌 서버 부스트처럼 디스코드가 직접 관리하는 역할은 봇이 지급할 수 없어
    //    기본 목록에서 빠진다. 다만 인벤토리 표시용으로는 골라야 하므로
    //    includeManaged=1 일 때만 함께 내려보내고, managed 플래그로 구분한다.
    const includeManaged = new URL(request.url).searchParams.get("includeManaged") === "1";
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
      .filter((r) => r.name !== "@everyone" && (includeManaged || !r.managed))
      .sort((a, b) => b.position - a.position)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color ? `#${r.color.toString(16).padStart(6, "0")}` : "#99aab5",
        managed: !!r.managed,
      }));

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
