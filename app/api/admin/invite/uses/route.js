export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import { inviteUses } from "@/lib/invite";

// 📌 친구 초대 기록(관리자) — 관리자 판정은 서버(lib/apiAuth requireAdmin)
//    GET ?page=(1부터)&q=(이름 · ID · 코드 일부) → { ok, rows: [{ inviteeId, inviteeName, inviterId, inviterName, code, at, joinedAt, ticketsGrantedAt, ticketsSkipped, inviterTickets, inviteeTickets }], total, page, perPage }
//    ticketsSkipped — 추첨권 대상 아님 까닭("off" · "zero" · 넣은 순간 보너스가 안 돎) · null 이면 줬거나 못 줌(ticketsGrantedAt 으로 가른다)
//    최신순 50줄 한 쪽(lib/invite.js inviteUses). 실패는 { ok: false, error }
const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "권한이 없습니다.");
}

export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return relay(auth.deny);
    await connectToDatabase();
    const sp = new URL(request.url).searchParams;
    const r = await inviteUses({ page: Number(sp.get("page")) || 1, q: String(sp.get("q") || "") });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("친구 초대 기록 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}
