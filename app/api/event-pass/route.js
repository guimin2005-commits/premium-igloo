export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { getEventPassState, getEventPassGuest } from "@/lib/eventPass";

// ── [조회] 이벤트 패스(「유령 펭귄의 초대」) ──
//    비로그인 → { ok, guest: true, enabled, title, startsAt, endsAt } (바로가기 띠 · 열림 안내용)
//    로그인   → { ok, ...상태 } — 진행도 · 단계 · 받을 수 있는 수는 전부 서버가 계산한다(lib/eventPass.js). 화면은 받은 그대로 그린다.
//    ?meta=1  → { ok, enabled, title, startsAt, endsAt } — 레벨 페이지 바로가기 띠용. 로그인해도 진행도 계산 없이 설정만
//    📌 꺼져 있으면 단계를 비워 보낸다(관리자는 미리 본다 — 「유저 화면으로 보기」 중엔 유저와 같게) · 2026-10-17 미션 폐지 — 진행도는 기간 중 번 XP 만
export async function GET(request) {
  try {
    if (new URL(request.url).searchParams.get("meta") === "1") {
      await connectToDatabase();
      return NextResponse.json({ ok: true, ...(await getEventPassGuest()) });
    }
    const session = await getServerSession(authOptions);
    await connectToDatabase();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: true, guest: true, ...(await getEventPassGuest()) });
    }
    const state = await getEventPassState(session.user.id, { isAdmin: await isAdminViewer(session) });
    return NextResponse.json({ ok: true, ...state });
  } catch (e) {
    console.error("이벤트 패스 조회 오류:", e);
    return NextResponse.json({ ok: false, error: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}
