export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/apiAuth";
import {
  loadGroupConfig,
  checkConfigPatch,
  writeGroupConfig,
  toAdminConfig,
  getGroupAdmin,
  getGroupDetail,
  giftCodeStats,
  approveGroup,
  rejectGroup,
  regrantGroupBonus,
  addGiftCodes,
  deleteGiftCode,
} from "@/lib/goedamGroup";

// 📌 게임 그룹 지원 관리(약속 문서 .claude/mockups/goedam-group/SPEC.md §4). 규칙 · 계산은 전부 lib/goedamGroup.js — 여기는 입구만.
//    · 관리자 판정은 서버(lib/apiAuth requireAdmin — getServerSession + isAdminName · 승인 · 반려한 사람 이름을 같이 받는다)
//    · 설정은 온 칸만 덮어쓴다(빠진 칸이 통째로 꺼지거나 지워지지 않게) · 설정 문서는 초안 밖이라 저장이 바로 실사이트에 뜬다
//    GET        → { success, config, codes: { total, assigned, left }, groups: [{ id, code, name, game, when, status, reason, leader: { id, name }, count, submittedAt, reviewedAt, reviewedBy, createdAt }] }
//                 — 심사 중 먼저, 그다음 최근
//    GET ?id=   → { success, group: { ...위 한 줄, members: [{ id, name, joinedAt, bonus: { tickets, grantedAt } | null, check: { accountAt, guildJoinedAt, level, xp, firstXpAt, xp30 } }], giftCodes: [{ name, code }] } }
//    PUT { config: { enabled?, startsAt?, endsAt?, minMembers?(2~20), maxMembers?(최소~50), applyTickets?(0~20) } } → { success, config }
//    POST { action: "approve", id } · { action: "reject", id, reason } → { success, group(상세) }
//         { action: "regrant", id } → { success, granted(받은 사람 수), tickets(넣은 장 수 합), failed, group(상세) }
//           — 지원한 그룹(심사 중 · 승인 · 반려)의 보너스 미지급 멤버에게 추첨권 다시 지급
//         { action: "codes-add", text }(줄마다 하나 · 최대 500줄) → { success, added, dup, codes } · { action: "code-delete", code }(배정 안 된 것만) → { success, codes }
//    실패는 { success: false, error, message }
const fail = (status, error) => NextResponse.json({ success: false, message: error, error }, { status });
// 붙여 넣기 글 상한(500줄 × 100자 + 줄바꿈이 넉넉히 들어간다 — 줄 수 · 글자 수 검사는 lib/goedamGroup.js parseGiftCodes)
const TEXT_MAX = 200_000;

// ── [조회] 목록 · 상세 ──
export async function GET(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (id != null) {
      const group = await getGroupDetail(String(id));
      if (!group) return fail(404, "그룹을 찾을 수 없습니다.");
      return NextResponse.json({ success: true, group });
    }
    return NextResponse.json({ success: true, ...(await getGroupAdmin()) });
  } catch (e) {
    console.error("게임 그룹 지원 관리 조회 오류:", e);
    return fail(500, "조회 중 오류가 발생했습니다.");
  }
}

// ── [저장] 설정 ──
export async function PUT(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const cur = await loadGroupConfig();
    const r = checkConfigPatch(cur, b?.config);
    if (!r.ok) return fail(400, r.error);
    const cfg = await writeGroupConfig({ ...r.set, updatedAt: new Date() });
    return NextResponse.json({ success: true, config: toAdminConfig(cfg) });
  } catch (e) {
    console.error("게임 그룹 지원 설정 저장 오류:", e);
    return fail(500, "저장 중 오류가 발생했습니다.");
  }
}

// ── [처리] 승인 · 반려 · 추첨권 다시 지급 · 상품권 번호 ──
export async function POST(request) {
  try {
    const auth = await requireAdmin();
    if (auth.deny) return auth.deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const action = String(b?.action ?? "");
    const adminName = auth.name || "";

    if (action === "approve" || action === "reject") {
      const id = String(b?.id ?? "");
      const r = action === "approve" ? await approveGroup({ id, adminName }) : await rejectGroup({ id, reason: b?.reason, adminName });
      if (!r.ok) return fail(r.status || 400, r.error);
      return NextResponse.json({ success: true, group: await getGroupDetail(id) });
    }
    if (action === "regrant") {
      const id = String(b?.id ?? "");
      const r = await regrantGroupBonus({ id });
      if (!r.ok) return fail(r.status || 400, r.error);
      return NextResponse.json({ success: true, granted: r.granted, tickets: r.tickets, failed: r.failed, group: await getGroupDetail(id) });
    }
    if (action === "codes-add") {
      const text = typeof b?.text === "string" ? b.text : "";
      if (text.length > TEXT_MAX) return fail(400, "붙여 넣은 글이 너무 깁니다.");
      const r = await addGiftCodes(text);
      if (!r.ok) return fail(r.status || 400, r.error);
      return NextResponse.json({ success: true, added: r.added, dup: r.dup, codes: await giftCodeStats() });
    }
    if (action === "code-delete") {
      const r = await deleteGiftCode(b?.code);
      if (!r.ok) return fail(r.status || 400, r.error);
      return NextResponse.json({ success: true, codes: await giftCodeStats() });
    }
    return fail(400, "알 수 없는 요청입니다.");
  } catch (e) {
    console.error("게임 그룹 지원 관리 처리 오류:", e);
    return fail(500, "처리 중 오류가 발생했습니다.");
  }
}
