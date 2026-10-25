export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { getShopAccess } from "@/lib/shopAccess";
import { getGoedamMeta, getGoedamState } from "@/lib/goedam";

// ── [조회] 방구석 심야 괴담회 ──
//    ?meta=1 → { success, data: { visible, at, end, tickets } } — 레벨 화면 괴담회 띠 노출 · 띠 배지용(설정 + 내 추첨권 수만)
//    그 밖   → { success, data: { phase, adminPreview, title, drawOpensAt, drawClosesAt, tickets, screenings, prizes, history, voice, shop } } — 창 본문
//    로그인 안 했으면 손님 모양(tickets 0 · mySeconds 0 · todaySec 0 · history []). 추첨권 수 · 남은 상품 · 완청 · 음성 진행은 전부 서버가 센다(lib/goedam.js)
//    📌 꺼져 있으면 운영진만 본다(「유저 화면으로 보기」 중엔 유저와 같게 — isAdminViewer)
//    📌 2026-10-24 shop(추첨권을 파는 상품 바로가기)은 ARCTIC 을 볼 수 있을 때만 — 비공개 중 유저에게는 null(lib/shopAccess.js 와 같은 판정 · 상점 화면이 「준비 중」으로 막는다)
export async function GET(request) {
  try {
    const meta = new URL(request.url).searchParams.get("meta") === "1";
    const session = await getServerSession(authOptions);
    await connectToDatabase();
    const userId = session?.user?.id || "";
    const isAdmin = session ? await isAdminViewer(session) : false;
    const data = meta
      ? await getGoedamMeta(userId, { isAdmin })
      : await getGoedamState(userId, { isAdmin, shopOpen: (await getShopAccess()).canView });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    console.error("괴담회 조회 오류:", e);
    return NextResponse.json({ success: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
