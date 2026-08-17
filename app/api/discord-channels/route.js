import { NextResponse } from "next/server";
import { denyIfNotAdmin } from "@/lib/apiAuth";

// 📌 서버의 디스코드 채널/카테고리 목록 (레벨 대시보드 드롭다운용, 10분 캐시)
//    카테고리 순서 → 카테고리 내 채널 순서로 정렬해 반환
//    관리자 설정 UI 전용이므로 서버 구조가 외부에 노출되지 않게 관리자만 조회한다.
const TYPE_MAP = { 0: "text", 2: "voice", 4: "category", 5: "text", 13: "voice" };

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/channels`,
      {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 600 },
      }
    );

    if (!res.ok) return NextResponse.json({ success: false, data: [] }, { status: 502 });

    const channels = await res.json();
    const usable = channels.filter((c) => TYPE_MAP[c.type] !== undefined);

    const categories = usable.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
    const byParent = (pid) =>
      usable
        .filter((c) => c.type !== 4 && (c.parent_id || null) === pid)
        .sort((a, b) => (a.type === 2 ? 1 : 0) - (b.type === 2 ? 1 : 0) || a.position - b.position);

    const data = [];
    // 카테고리 없는 최상위 채널 먼저
    for (const c of byParent(null)) {
      data.push({ id: c.id, name: c.name, type: TYPE_MAP[c.type], parentId: null, parentName: null });
    }
    for (const cat of categories) {
      data.push({ id: cat.id, name: cat.name, type: "category", parentId: null, parentName: null });
      for (const c of byParent(cat.id)) {
        data.push({ id: c.id, name: c.name, type: TYPE_MAP[c.type], parentId: cat.id, parentName: cat.name });
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}
