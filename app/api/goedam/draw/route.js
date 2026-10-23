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

// ── [추첨] 괴담회 추첨권 1장 쓰기 — body 없음 ──
//    → { success: true, data: { result: { id, pid, name, kind, amount, itemName, days, rarity, code }, tickets(남은 수) } }
//    → { success: false, error } — 추첨권이 없습니다 · 추첨 기간이 아닙니다 · 남은 상품이 없습니다 · 처리 중인 추첨이 있습니다 …
//    기간 · 추첨권 · 남은 상품 · 고르기 · 지급은 전부 lib/goedam.js drawGoedam 이 한다(클라이언트 값은 받지 않는다)
//    📌 이벤트 패스 받기(app/api/event-pass/claim)와 같은 입구 — 점검 · LEVEL 비공개 · XP 획득 중단이면 뽑지 않는다(거절 응답은 { success:false, message, error } 그대로)
export async function POST() {
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

    const r = await drawGoedam({
      userId,
      userName: session.user.name || "",
      isAdmin: await isAdminViewer(session),
    });
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ success: true, data: { result: r.result, tickets: r.tickets } });
  } catch (e) {
    console.error("괴담회 추첨 오류:", e);
    return fail(500, "추첨 중 오류가 발생했습니다.");
  }
}
