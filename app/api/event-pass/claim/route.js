export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminViewer } from "@/lib/adminViewServer";
import { claimEventPass } from "@/lib/eventPass";
import { denyIfLevelClosed } from "@/lib/levelAccess";
import { denyIfMaintenance } from "@/lib/apiAuth";
import { denyIfXpStopped } from "@/lib/xpStop";

// 📌 2026-10-17 미션 폐지 — "mission" 은 받지 않는다(400)
const KINDS = ["tier", "all"];
const fail = (status, error, code) => NextResponse.json({ ok: false, error, ...(code ? { code } : {}) }, { status });
// 다른 입구(점검 · 비공개 · XP 획득 중단)의 거절을 이 라우트 모양({ ok:false, error })으로 — 상태 · 문구 · code 는 그대로
async function relay(res) {
  let j = {};
  try {
    j = await res.clone().json();
  } catch {}
  return fail(res.status, j?.error || j?.message || "지금은 받을 수 없습니다.", j?.code);
}

// ── [수령] 이벤트 패스 받기 — body { kind: "tier" | "all", ref?: tid } ──
//    한 단계 = 그 단계 보상 전부(최대 4개) · 모두 받기 = 받을 수 있는 단계 전부.
//    진행도 · 받을 수 있는지는 lib/eventPass.js 가 다시 센다(클라이언트 값은 쓰지 않는다). 중복은 수령 기록 유니크 인덱스가 막는다.
//    → { ok: true, claimed: [{ kind, ref, labels }], state(조회와 같은 본문) } · { ok: false, error } 4xx/5xx
//    📌 시즌 패스 받기(app/api/pass/claim)와 같은 입구 — 점검 · LEVEL 비공개 · XP 획득 중단이면 받지 않는다
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return fail(401, "로그인이 필요합니다.");
    const maint = await denyIfMaintenance(session);
    if (maint) return relay(maint);

    const body = await request.json().catch(() => ({}));
    const kind = body?.kind;
    const ref = String(body?.ref || "").trim();
    if (!KINDS.includes(kind)) return fail(400, "요청이 올바르지 않습니다.");
    if (kind !== "all" && !ref) return fail(400, "받을 대상을 지정해 주세요.");

    await connectToDatabase();
    const closed = await denyIfLevelClosed(session);
    if (closed) return relay(closed);
    const userId = session.user.id;
    const stopped = await denyIfXpStopped(userId);
    if (stopped) return relay(stopped);

    const r = await claimEventPass({
      userId,
      userName: session.user.name || "",
      kind,
      ref,
      isAdmin: await isAdminViewer(session),
    });
    if (!r.ok) return fail(r.status || 400, r.error);
    return NextResponse.json({ ok: true, claimed: r.claimed, state: { ok: true, ...r.state } });
  } catch (e) {
    console.error("이벤트 패스 수령 오류:", e);
    return fail(500, "수령 중 오류가 발생했습니다.");
  }
}
