export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { getInviteMeta, getInviteState, getInviteEnter } from "@/lib/invite";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfXpStopped } from "@/lib/xpStop";

// 📌 넣기 입구가 열려 있나 — POST /api/invite/redeem 이 라우트에서 거절하는 것과 같은 가드 · 같은 순서(점검 → LEVEL 비공개 → XP 획득 중단).
//    입력 칸(enter.show)은 여기까지 통과할 때만 — 칸을 보여 놓고 넣기에서 막히지 않게. 어떤 실패든 닫힘(칸을 숨긴다 · 넣기가 다시 확인한다)
async function redeemGateOpen(session) {
  try {
    const userId = session?.user?.id;
    if (!userId) return false;
    if (await denyIfMaintenance(session)) return false;
    if (await denyIfLevelClosed(session)) return false;
    if (await denyIfXpStopped(userId)) return false;
    return true;
  } catch {
    return false;
  }
}

// ── [조회] 친구 초대(상시 이벤트) ──
//    ?meta=1  → { ok, visible, enabled, claimable } — 레벨 화면 이벤트 탭 노출 · 탭 배지용. 디스코드에 묻지 않는다(손님 claimable 0)
//    ?enter=1 → { ok, enter:{ show } } — 입력 칸만(인증 화면 /verify). 내 코드를 만들지 않고 보상 · 친구 · 수령 기록도 읽지 않는다(lib/invite.js getInviteEnter)
//    그 밖    → { ok, guest, enabled, open, adminPreview, code, count, friends:[{ name, at }], tiers, claimable, bonus, enter:{ show } } — 창 본문(lib/invite.js getInviteState)
//    손님도 받는다(code null · count 0 · friends [] · enter.show false). 내 코드는 로그인한 사람이 처음 볼 때 만든다.
//    수 · 단계 상태 · 받을 수 있는 수 · 입력 칸 노출은 전부 서버가 센다. friends 는 이름 · 시각만(남의 ID 는 내보내지 않는다)
//    📌 enter.show 는 넣기 입구(redeemGateOpen)까지 통과해야 참 — 창 본문 · ?enter=1 둘 다
//    📌 꺼져 있으면 관리자만 미리 본다(「유저 화면으로 보기」 중엔 유저와 같게 — isAdminViewer)
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const meta = params.get("meta") === "1";
    const enter = params.get("enter") === "1";
    const session = await getServerSession(authOptions);
    await connectToDatabase();
    const userId = session?.user?.id || "";
    const isAdmin = session ? await isAdminViewer(session) : false;
    if (meta) return NextResponse.json({ ok: true, ...(await getInviteMeta(userId, { isAdmin })) });
    if (enter) {
      const { show } = await getInviteEnter(userId, { isAdmin });
      return NextResponse.json({ ok: true, enter: { show: show && (await redeemGateOpen(session)) } });
    }
    const state = await getInviteState(userId, { isAdmin, userName: session?.user?.name || "" });
    if (state.enter?.show && !(await redeemGateOpen(session))) state.enter = { show: false };
    return NextResponse.json({ ok: true, ...state });
  } catch (e) {
    console.error("친구 초대 조회 오류:", e);
    return NextResponse.json({ ok: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
