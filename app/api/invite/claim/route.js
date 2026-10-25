export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { claimInviteTier } from "@/lib/invite";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfXpStopped } from "@/lib/xpStop";

const fail = (status, error, extra = {}) => NextResponse.json({ ok: false, error, ...extra }, { status });
// 다른 입구(점검 · 비공개 · XP 획득 중단)의 거절을 이 라우트 모양({ ok:false, error })으로 — 상태 · 문구 · code 는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "지금은 받을 수 없습니다.", j?.code ? { code: j.code } : {});
}

// ── [수령] 친구 초대 누적 보상 받기 — body { tid } ──
//    한 단계 = 그 단계 보상 전부(최대 4개). 누적 수 · 받을 수 있는지는 lib/invite.js claimInviteTier 가 다시 센다(클라이언트 값은 쓰지 않는다).
//    중복은 수령 기록(InviteClaim) 유니크가 막는다. 지급은 lib/rewardGrant.js(표식 "invite" · 칸 이름 「친구 초대 N명」)
//    → { ok: true, labels, state(조회와 같은 본문) } · { ok: false, error, hold? } 4xx/5xx(hold — 실사이트에 없는 아이템 · 409)
//    📌 이벤트 패스 받기(app/api/event-pass/claim)와 같은 입구 — 점검 · LEVEL 비공개 · XP 획득 중단이면 받지 않는다
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail(401, "로그인이 필요합니다.");
    const maint = await denyIfMaintenance(session);
    if (maint) return relay(maint);

    const body = await request.json().catch(() => ({}));
    const tid = String(body?.tid || "").trim().slice(0, 40);
    if (!tid) return fail(400, "받을 단계를 지정해 주세요.");

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return relay(closed);
    const userId = session.user.id;
    const stopped = await denyIfXpStopped(userId);
    if (stopped) return relay(stopped);

    const r = await claimInviteTier({
      userId,
      userName: session.user.name || "",
      tid,
      isAdmin: await isAdminViewer(session),
    });
    if (!r.ok) return fail(r.status || 400, r.error, r.hold ? { hold: true } : {});
    return NextResponse.json({ ok: true, labels: r.labels, ...(r.partial ? { partial: true } : {}), state: { ok: true, ...r.state } });
  } catch (e) {
    console.error("친구 초대 보상 수령 오류:", e);
    return fail(500, "수령 중 오류가 발생했습니다.");
  }
}
