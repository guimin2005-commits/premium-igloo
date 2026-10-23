export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { grantGoedamTickets, regrantGoedamDraw } from "@/lib/goedam";

// 📌 괴담회 수동 지급(관리자) — 관리자 판정은 서버(lib/apiAuth requireAdmin)
//    POST { sid, userId } → 그 회차 장 수만큼 추첨권. 완청 못 한 사람 · 기록이 빠진 사람에게 손으로(봇 자동 지급과 같은 조건 — 이미 받았으면 거절)
//         → { success, data: { row(명단 한 줄), tickets(준 장 수) } }
//    POST { drawId } → 지급이 실패해 미지급으로 남은 추첨 결과를 다시 지급(granted false 인 기록만) → { success, data: { id, granted, error } }
//    실패는 { success: false, error, message }
const fail = (status, error) => NextResponse.json({ success: false, message: error, error }, { status });

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));

    if (b?.drawId !== undefined) {
      const r = await regrantGoedamDraw(String(b.drawId || "").trim());
      if (!r.ok) return fail(r.status || 400, r.error);
      return NextResponse.json({ success: true, data: r.draw });
    }

    const sid = String(b?.sid || "").trim();
    const userId = String(b?.userId || "").trim();
    if (!sid) return fail(400, "회차를 지정해 주십시오.");
    if (!/^\d{17,20}$/.test(userId)) return fail(400, "디스코드 ID가 올바르지 않습니다.");
    const r = await grantGoedamTickets({ sid, userId });
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ success: true, data: { row: r.row, tickets: r.tickets } });
  } catch (e) {
    console.error("괴담회 수동 지급 오류:", e);
    return fail(500, "지급 중 오류가 발생했습니다.");
  }
}
