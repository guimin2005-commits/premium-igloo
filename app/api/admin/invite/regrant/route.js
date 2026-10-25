export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { regrantInvite } from "@/lib/invite";

// 📌 친구 초대 다시 지급(관리자) — 관리자 판정은 서버(lib/apiAuth requireAdmin)
//    POST { inviteeId } → 그 초대 한 건에서 아직 못 준 것만 한 번에 준다(lib/invite.js regrantInvite):
//      · 괴담회 추첨권(초대한 사람 · 들어온 친구) — 보너스 기간이 지나도 준다(운영자 덮어쓰기). 대상 아님 줄(ticketsSkipped)은 건너뜀.
//        장 수는 지금 설정의 보너스 장 수 · 이미 들어간 장 수는 주문 묶음으로 세어 모자란 만큼만(grantInviteTickets)
//      · 들어온 친구 보상 — 지금 설정의 welcome · 받은 줄이 있거나 대상 아님 줄(welcomeSkipped)이면 건너뜀(grantInviteWelcome)
//    둘 다 줄 것이 없으면 거절(409). 하나라도 줬으면 성공 — 못 준 쪽 까닭은 warning
//    → { ok, granted: { inviter, invitee }, welcome(준 보상 짧은 이름), warning? } · 실패는 { ok: false, error }
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
    const r = await regrantInvite(inviteeId);
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ ok: true, granted: r.granted, welcome: r.welcome, ...(r.warning ? { warning: r.warning } : {}) });
  } catch (e) {
    console.error("친구 초대 다시 지급 오류:", e);
    return fail(500, "지급 중 오류가 발생했습니다.");
  }
}
