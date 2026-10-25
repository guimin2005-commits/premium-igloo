export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { regrantInviteTickets } from "@/lib/invite";

// 📌 친구 초대 추첨권 다시 지급(관리자) — 관리자 판정은 서버(lib/apiAuth requireAdmin)
//    POST { inviteeId } → 그 초대 한 건의 괴담회 추첨권(초대한 사람 · 들어온 친구)을 아직 못 줬으면 준다 — 보너스 기간이 지나도 준다(운영자 덮어쓰기).
//    이미 줬거나 대상 아님 줄(ticketsSkipped — 넣은 순간 보너스가 안 돎)이면 거절(409). 장 수는 지금 설정의 보너스 장 수 · 이미 들어간 장 수는 주문 묶음으로 세어 모자란 만큼만(lib/invite.js grantInviteTickets)
//    → { ok, granted: { inviter, invitee } } · 실패는 { ok: false, error }
const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "권한이 없습니다.");
}

export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return relay(auth.deny);
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const inviteeId = String(b?.inviteeId || "").trim();
    if (!/^\d{17,20}$/.test(inviteeId)) return fail(400, "디스코드 ID가 올바르지 않습니다.");
    const r = await regrantInviteTickets(inviteeId);
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ ok: true, granted: r.granted });
  } catch (e) {
    console.error("친구 초대 추첨권 다시 지급 오류:", e);
    return fail(500, "지급 중 오류가 발생했습니다.");
  }
}
