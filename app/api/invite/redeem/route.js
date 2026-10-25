export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { redeemInvite, getInviteState } from "@/lib/invite";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfXpStopped } from "@/lib/xpStop";

const fail = (status, error, code) => NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status });
// 다른 입구(점검 · 비공개 · XP 획득 중단)의 거절을 이 라우트 모양({ ok:false, error })으로 — 상태 · 문구 · code 는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "지금은 넣을 수 없습니다.", j?.code);
}

// ── [넣기] 받은 초대 코드 넣기 — body { code } ──
//    계정당 평생 한 번 · 내 코드는 안 됨 · 넣기 조건(켜짐 · 계정 나이 · 새 멤버 · 가입 후 기한 · 예전에 온 적 없음)은 전부 lib/invite.js redeemInvite 가 센다.
//    중복은 InviteUse.inviteeId 유니크가 막는다(동시에 두 번 보내도 하나만). 추첨권 보너스 · 들어온 친구 보상은 못 줘도 넣기는 성공(tickets 0 · welcome [] · 관리자가 다시 지급)
//    → { ok: true, inviterName, tickets: { me, inviter }, welcome(받은 보상 짧은 이름 — 「50,000 XP」), state(조회와 같은 본문) } · { ok: false, error, code? } 4xx/5xx
//    📌 이벤트 패스 받기(app/api/event-pass/claim)와 같은 입구 — 점검 · LEVEL 비공개 · XP 획득 중단이면 넣지 않는다
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail(401, "로그인이 필요합니다.");
    const maint = await denyIfMaintenance(session);
    if (maint) return relay(maint);

    const body = await request.json().catch(() => ({}));
    const code = String(body?.code ?? "").slice(0, 40);
    if (!code.trim()) return fail(400, "초대 코드를 입력해 주세요.", "NO_CODE");

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return relay(closed);
    const userId = session.user.id;
    const stopped = await denyIfXpStopped(userId);
    if (stopped) return relay(stopped);

    const userName = session.user.name || "";
    const r = await redeemInvite({ userId, userName, code });
    if (!r.ok) return fail(r.status || 400, r.error, r.code);
    const state = await getInviteState(userId, { isAdmin: await isAdminViewer(session), userName });
    return NextResponse.json({ ok: true, inviterName: r.inviterName, tickets: r.tickets, welcome: r.welcome, state: { ok: true, ...state } });
  } catch (e) {
    console.error("친구 초대 코드 넣기 오류:", e);
    return fail(500, "처리 중 오류가 발생했습니다.");
  }
}
