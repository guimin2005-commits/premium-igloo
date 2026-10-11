export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import Setting from "@/models/Setting";
import { catalogWriteBlocked, liveLockedResponse, forWrite, loadShopThemes } from "@/lib/catalogDraft";
import { THEMES_KEY, applyThemeOp, onThemes, sameThemes } from "@/lib/shopThemes";

// 📌 이벤트 테마 목록(lib/shopThemes.js — Setting "shopThemes" = [{ key, name, on }], 2026-10-11)
//    GET  : 켜진 테마만 차례대로(ARCTIC 탭). 관리자 ?all=1 은 꺼진 것까지 전부(상점 관리 · 상품 폼 테마 고르기)
//    POST : 관리자 — { op: "create", name } · { op: "rename", key, name } · { op: "delete", key } · { op: "order", keys } · { op: "toggle", key, on }
//           응답 data = 저장한 뒤의 전체 목록, theme = 그 작업의 테마(만들기 · 이름 · 켜기 · 삭제)
//    📌 초안(lib/catalogDraft.js) — localhost 초안 모드는 draft_settings 의 shopThemes 로 쓰고 「반영」 때 실사이트로. 실사이트(Vercel) 관리 쓰기는 막는다(LIVE_LOCKED).
//       테마를 지워도 상품 · 배너는 고쳐 쓰지 않는다 — 모르는 키는 테마 없음으로 친다(lib/shopThemes.js)

export async function GET(request) {
  try {
    await connectToDatabase();
    const { isAdmin, canView } = await getShopAccess();
    if (!canView) return NextResponse.json({ success: false, data: [] }, { status: 403 });
    const all = new URL(request.url).searchParams.get("all") === "1";
    const list = await loadShopThemes();
    return NextResponse.json({ success: true, data: isAdmin && all ? list : onThemes(list) });
  } catch (e) {
    console.error("테마 목록 조회 오류:", e);
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const body = await request.json().catch(() => ({}));
    const list = await loadShopThemes();
    const r = applyThemeOp(list, body);
    if (!r.ok) return NextResponse.json({ success: false, message: r.message, error: r.message }, { status: 400 });
    // 바뀐 게 없으면 쓰지 않는다(초안 모드에서 빈 초안이 생기지 않게)
    if (!sameThemes(list, r.list)) {
      const W = await forWrite(Setting, { key: THEMES_KEY });
      await W.updateOne({ key: THEMES_KEY }, { $set: { value: r.list, updatedAt: new Date() } }, { upsert: true });
    }
    return NextResponse.json({ success: true, data: r.list, ...(r.theme ? { theme: r.theme } : {}) });
  } catch (e) {
    console.error("테마 저장 오류:", e);
    return NextResponse.json({ success: false, message: "테마를 저장하지 못했습니다." }, { status: 500 });
  }
}
