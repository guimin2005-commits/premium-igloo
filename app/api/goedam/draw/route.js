export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { drawGoedam } from "@/lib/goedam";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfXpStopped } from "@/lib/xpStop";

const fail = (status, error) => NextResponse.json({ success: false, error }, { status });

// ── [추첨] 괴담회 추첨권 쓰기 — body { count: 1 | 10 }(없으면 1) ──
//    → { success: true, data: { result(첫 결과), results(뽑은 결과 전부 — 10장이면 최대 10개), tickets(남은 수) } } · result = { id, pid, name, kind, amount, itemName, count(아이템 개수 — 아이템이 아니면 0), rarity, code }
//    📌 2026-10-24 10장 — 10장 이상 가졌을 때만(모자라면 「추첨권이 부족합니다.」), 중간에 상품이 다 나가면 거기까지(lib/goedam.js drawGoedam)
//    → { success: false, error } — 추첨권이 없습니다 · 추첨 기간이 아닙니다 · 남은 상품이 없습니다 · 처리 중인 추첨이 있습니다 …
//    기간 · 추첨권 · 남은 상품 · 고르기 · 지급은 전부 lib/goedam.js drawGoedam 이 한다(클라이언트 값은 받지 않는다)
//    📌 이벤트 패스 받기(app/api/event-pass/claim)와 같은 입구 — 점검 · LEVEL 비공개 · XP 획득 중단이면 뽑지 않는다(거절 응답은 { success:false, message, error } 그대로)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail(401, "로그인이 필요합니다.");
    const maint = await denyIfMaintenance(session);
    if (maint) return maint;

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return closed;
    const userId = session.user.id;
    const stopped = await denyIfXpStopped(userId);
    if (stopped) return stopped;

    const body = await request.json().catch(() => ({}));
    const r = await drawGoedam({
      userId,
      userName: session.user.name || "",
      isAdmin: await isAdminViewer(session),
      count: Number(body?.count) === 10 ? 10 : 1,
    });
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ success: true, data: { result: r.result, results: r.results, tickets: r.tickets } });
  } catch (e) {
    console.error("괴담회 추첨 오류:", e);
    return fail(500, "추첨 중 오류가 발생했습니다.");
  }
}
