export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import {
  isDraftMode, catalogWriteBlocked, draftSummary, publishAll, discardAll, discardOne, DRAFT_KINDS, PUBLISH_BUSY,
} from "@/lib/catalogDraft";
import { loadEffectTemplates } from "@/lib/effectTemplatesServer";

// 📌 상품 초안 — 상점 관리 머리의 "초안 N" · "초안 버리기" · "실사이트 반영"(lib/catalogDraft.js).
//    GET  → { success, draftMode, liveLocked, total, counts, rows, warnings }  (초안 모드가 아니면 빈 요약)
//    POST { action: "publish" }             실사이트 반영 → { applied, skipped, hidden }
//         { action: "discard" }             초안 전부 버리기 → { removed }
//         { action: "revert", kind, id }    초안 한 건 되돌리기 → { removed }
//    POST 는 초안 모드(localhost)에서만 — 아니면 404. 반영 · 버리기가 진행 중이면 409
//    📌 2026-10-18 반영 · 버리기 · 되돌리기 뒤에는 종류별 효과 문구(초안 설정 effectTemplates)를 바로 다시 읽는다(15초를 기다리지 않게 — lib/effectTemplatesServer)

const bad = (message, status = 400) => NextResponse.json({ success: false, message, error: message }, { status });
const EMPTY = { total: 0, counts: {}, rows: [], warnings: [] };

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    const draftMode = isDraftMode();
    if (draftMode) await connectToDatabase();
    return NextResponse.json({
      success: true,
      draftMode,
      liveLocked: catalogWriteBlocked(),
      ...(draftMode ? await draftSummary() : EMPTY),
    });
  } catch (e) {
    console.error("상품 초안 조회 오류:", e);
    return NextResponse.json({ success: false, draftMode: false, liveLocked: catalogWriteBlocked(), ...EMPTY, message: "조회 중 오류가 발생했습니다." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (!isDraftMode()) return bad("초안 모드가 아닙니다.", 404);
    const b = await request.json().catch(() => ({}));
    const action = String(b?.action || "");
    if (action === "revert") {
      const kind = String(b?.kind || "");
      const id = String(b?.id || "");
      if (!DRAFT_KINDS.includes(kind) || !mongoose.isValidObjectId(id)) return bad("되돌릴 초안을 지정해 주세요.");
      await connectToDatabase();
      const r = await discardOne(kind, id);
      if (!r.removed) return bad("초안을 찾을 수 없습니다.", 404);
      if (kind === "setting") await loadEffectTemplates({ force: true });
      return NextResponse.json({ success: true, ...r });
    }
    if (action === "publish") {
      await connectToDatabase();
      const r = await publishAll();
      await loadEffectTemplates({ force: true });
      return NextResponse.json({ success: true, ...r });
    }
    if (action === "discard") {
      await connectToDatabase();
      const r = await discardAll();
      await loadEffectTemplates({ force: true });
      return NextResponse.json({ success: true, ...r });
    }
    return bad("알 수 없는 요청입니다.");
  } catch (e) {
    if (e?.code === PUBLISH_BUSY) return bad("다른 반영이 진행 중입니다.", 409);
    console.error("상품 초안 처리 오류:", e);
    return bad("처리 중 오류가 발생했습니다.", 500);
  }
}
