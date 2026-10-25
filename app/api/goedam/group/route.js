export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { MSG, getGroupMeta, getGroupState, groupAction } from "@/lib/goedamGroup";

// 📌 게임 그룹 지원(방구석 심야 괴담회 — 약속 문서 .claude/mockups/goedam-group/SPEC.md §3). 규칙 · 계산은 전부 lib/goedamGroup.js — 여기는 입구만.
//    GET ?meta=1     → { ok, visible, n, end } — 이벤트 창 탭 노출 · 탭 숫자(디스코드에 묻지 않는다 · end = 끝 시각 ms)
//    GET [?code=XXX] → { ok, guest, enabled, open, adminPreview, startsAt, endsAt, minMembers, maxMembers, applyTickets, my, invite } — 창 본문(손님도 받는다 · 초대 미리보기 why "guest")
//    POST { action, ... } → 성공이면 GET 과 같은 상태 { ok: true, ...state } · 실패면 { ok: false, error }(4xx)
//      submit 은 bonus: { tickets }(지원 보너스 추첨권 — 이번에 나에게 실제로 넣은 장 수 · 이미 받았거나 못 주면 0)를 같이
//      action: create { name, game, when? } · join { code } · leave · kick { mid } · edit { name?, game?, when? } · disband · submit
//    남의 디스코드 ID 는 내보내지 않는다(멤버는 mid). 📌 꺼져 있으면 관리자만 미리 본다(「유저 화면으로 보기」 중엔 유저와 같게 — isAdminViewer)
//    📌 쓰기는 친구 초대 넣기(app/api/invite/redeem)와 같은 입구 — 점검 · LEVEL 비공개면 막는다
const fail = (status, error) => NextResponse.json({ ok: false, error }, { status });
// 다른 입구(점검 · 비공개)의 거절을 이 라우트 모양({ ok:false, error })으로 — 상태 · 문구는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "지금은 할 수 없습니다");
}

// ── [조회] 탭 노출 · 창 본문 ──
export async function GET(request) {
  try {
    const sp = new URL(request.url).searchParams;
    const session = await getServerSession(authOptions);
    await connectToDatabase();
    const userId = session?.user?.id || "";
    const isAdmin = session ? await isAdminViewer(session) : false;
    if (sp.get("meta") === "1") return NextResponse.json({ ok: true, ...(await getGroupMeta(userId, { isAdmin })) });
    const code = String(sp.get("code") ?? "").slice(0, 40);
    return NextResponse.json({ ok: true, ...(await getGroupState(userId, { isAdmin, code })) });
  } catch (e) {
    console.error("게임 그룹 지원 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다");
  }
}

// ── [동작] 만들기 · 참여 · 나가기 · 내보내기 · 고치기 · 해체 · 지원하기 ──
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail(401, MSG.login);
    const maint = await denyIfMaintenance(session);
    if (maint) return relay(maint);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return relay(closed);

    const userId = session.user.id;
    const r = await groupAction({ action, userId, userName: session.user.name || "", body });
    if (!r.ok) return fail(r.status || 400, r.error);
    const state = await getGroupState(userId, { isAdmin: await isAdminViewer(session) });
    return NextResponse.json({ ok: true, ...state, ...(r.bonus ? { bonus: r.bonus } : {}) });
  } catch (e) {
    console.error("게임 그룹 지원 처리 오류:", e);
    return fail(500, "처리 중 오류가 발생했습니다");
  }
}
