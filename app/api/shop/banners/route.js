export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import ShopBanner from "@/models/ShopBanner";
import { isDraftMode, catalogWriteBlocked, liveLockedResponse, catalogFind, forWrite, catalogCreate, catalogDelete, stripDraft, loadShopThemes } from "@/lib/catalogDraft";
import { isThemeKey, themeOf } from "@/lib/shopThemes";

// 📌 배너 초안(lib/catalogDraft.js) — 초안 모드(localhost)는 목록이 초안을 덧씌운 보기이고 관리 쓰기는 draft_shopbanners 로 간다.
//    실사이트(Vercel)에서는 관리 쓰기를 막는다(LIVE_LOCKED). 실사이트 모드에서는 지금의 직접 호출과 같다

// 📌 노출 위치 — 홈(ARCTIC 홈 맨 위) · 시즌(스토어 시즌 탭 맨 위) · 테마 키(스토어 그 테마 탭 맨 위 — lib/shopThemes.js, 2026-10-11 할로윈 → 만들 수 있는 테마).
//    테마는 만들고 지우므로 모델 enum 이 없다 — 저장(POST)은 지금 있는 테마 키만 받는다(꺼진 테마 포함)
const BASE_PLACEMENTS = ["home", "season"];
// 📌 위치 값 하나로 — 홈 · 시즌 · 테마 키 모양이면 그 값, 없거나 모르는 값이면 홈(placement 값이 생기기 전 배너 · 옛 화면).
//    테마 키는 모양만 본다(조회 · 순서는 테마 목록을 읽지 않는다 — 지운 테마면 그 위치 배너가 그대로 빈 목록 · 남은 줄)
const placeOf = (p) => (BASE_PLACEMENTS.includes(p) || isThemeKey(p) ? p : "home");
// 저장해도 되는 위치인가 — 홈 · 시즌, 또는 지금 있는 테마(테마 목록은 테마 위치일 때만 읽는다)
const placementOk = async (p) => BASE_PLACEMENTS.includes(p) || (isThemeKey(p) && !!themeOf(await loadShopThemes(), p));

// 📌 위치별 조회 조건 — ?placement=season 은 시즌 탭 · 테마 키는 그 테마 탭, 없거나 모르는 값이면 홈(지금까지의 홈 화면 동작 그대로).
//    placement 값이 생기기 전에 등록한 배너는 값이 없다 → 홈으로 친다(null 은 필드 없음도 잡는다).
//    ?placement=any 는 위치 구분 없이 전부 — 관리자 배너 목록용
const placementFilter = (p) => {
  if (p === "any") return {};
  const place = placeOf(p);
  if (place !== "home") return { placement: place };
  return { placement: { $in: ["home", null] } };
};

// 그 위치 맨 뒤 순서 — 그 위치 배너(초안 모드는 초안을 덧씌운 보기)의 가장 큰 sortOrder + 1
const nextBannerOrder = async (place) => {
  let max = -1;
  for (const r of await catalogFind(ShopBanner, placementFilter(place), { select: { sortOrder: 1 } })) {
    const n = Number(r.sortOrder);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Math.floor(max) + 1;
};

// ── [조회] 배너 목록 — 공개 전에는 관리자만 ──
export async function GET(request) {
  try {
    await connectToDatabase();
    const { isAdmin, canView } = await getShopAccess();
    if (!canView) {
      return NextResponse.json({ success: false, data: [] }, { status: 403 });
    }
    const params = new URL(request.url).searchParams;
    const all = params.get("all") === "1";
    const filter = { ...(isAdmin && all ? {} : { active: true }), ...placementFilter(params.get("placement")) };
    // 관리자 전체 목록(?all=1)이면 초안 행에 _draft("new" | "edit")를 단다
    const banners = await catalogFind(ShopBanner, filter, { sort: { sortOrder: 1, createdAt: -1 }, mark: isAdmin && all });
    return NextResponse.json({ success: true, data: banners });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

// ── [등록·수정] 관리자 전용 ──
export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const b = await request.json();
    if (!b.imageUrl?.trim()) {
      return NextResponse.json({ success: false, message: "배너 이미지 URL을 입력해주세요." }, { status: 400 });
    }
    // 📌 모바일 이미지는 선택 — 비워 두면 모바일도 PC 이미지를 쓴다
    if (b.mobileImageUrl != null && typeof b.mobileImageUrl !== "string") {
      return NextResponse.json({ success: false, message: "모바일 이미지 URL을 확인해주세요." }, { status: 400 });
    }
    // 📌 노출 위치 — 안 보내면 홈. 모르는 값 · 지운 테마는 막는다(조용히 홈으로 바꿔 저장하면 엉뚱한 화면에 걸린다)
    if (b.placement != null && !(await placementOk(b.placement))) {
      return NextResponse.json({ success: false, message: "노출 위치를 확인해주세요." }, { status: 400 });
    }

    const payload = {
      imageUrl: b.imageUrl.trim(),
      mobileImageUrl: (b.mobileImageUrl || "").trim(),
      title: (b.title || "").trim(),
      subtitle: (b.subtitle || "").trim(),
      link: (b.link || "").trim(),
      active: b.active !== false,
    };
    // 📌 노출 위치 — 보냈으면 그 값. 새로 만들 때 안 보내면 홈, 수정 때 안 보내면 저장된 값 그대로
    //    (위치를 모르는 옛 관리자 화면이 열려 있다가 저장해도 시즌 배너가 홈으로 넘어가지 않게)
    if (b.placement != null) payload.placement = b.placement;
    else if (!b.id) payload.placement = "home";
    // 📌 노출 순서(2026-10-11 운영자 "배너도 노출 순서 편하게") — 순서는 목록에서 끌어서 정한다(아래 PATCH). 숫자를 보냈으면(옛 화면) 그 값,
    //    새 배너 · 위치를 바꾼 배너는 그 위치 맨 뒤, 그 밖의 수정은 저장된 순서 그대로(예전엔 수정할 때마다 폼 숫자로 덮었다)
    if (b.sortOrder != null && b.sortOrder !== "") payload.sortOrder = Math.floor(Number(b.sortOrder) || 0);
    else {
      const was = b.id ? (await catalogFind(ShopBanner, { _id: b.id }, { select: { placement: 1 } }))[0] : null;
      const wasPlace = was ? placeOf(was.placement) : null;
      const place = payload.placement || wasPlace || "home";
      if (!b.id || (was && place !== wasPlace)) payload.sortOrder = await nextBannerOrder(place);
    }

    // 수정은 쓸 모델에 — 실사이트 모드는 ShopBanner 그대로, 초안 모드는 그 배너를 초안으로 복사한 뒤 초안 모델
    const doc = b.id
      ? await (await forWrite(ShopBanner, { _id: b.id })).findByIdAndUpdate(b.id, payload, { new: true })
      : await catalogCreate(ShopBanner, payload);
    // 응답 — 실사이트 모드는 지금과 같은 문서 그대로, 초안 모드는 _draft* 칸을 뺀 것
    const data = doc && isDraftMode() ? stripDraft(doc.toObject ? doc.toObject() : doc) : doc;

    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [순서] { order: [배너 id, ...], placement: "home" | "season" | 테마 키 } — 관리자 전용(2026-10-11 운영자 "배너도 노출 순서 편하게").
//    그 위치 배너의 노출 순서를 목록 차례대로 0, 1, 2 …(관리 목록에서 끌어 놓으면 바로). 목록에 빠진 그 위치 배너는 뒤에 지금 차례로,
//    다른 위치 · 없는 id 는 건너뛴다. 바뀐 것만 쓴다(초안 모드는 그 배너만 초안이 된다). 응답 order = 그 위치의 새 차례 전체
export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    const place = placeOf(b?.placement);
    const ids = [...new Set((Array.isArray(b?.order) ? b.order : []).map((v) => String(v || "")))].filter((v) => mongoose.isValidObjectId(v)).slice(0, 500);
    if (ids.length === 0) return NextResponse.json({ success: false, message: "순서를 받지 못했습니다." }, { status: 400 });
    const list = await catalogFind(ShopBanner, placementFilter(place), { select: { sortOrder: 1, createdAt: 1 }, sort: { sortOrder: 1, createdAt: -1 } });
    const byId = new Map(list.map((r) => [String(r._id), r]));
    const listed = ids.filter((id) => byId.has(id));
    const listedSet = new Set(listed);
    const next = [...listed, ...list.map((r) => String(r._id)).filter((id) => !listedSet.has(id))];
    const ch = next.map((id, i) => ({ id, i })).filter(({ id, i }) => Number(byId.get(id)?.sortOrder) !== i);
    if (ch.length) {
      const W = await forWrite(ShopBanner, { _id: { $in: ch.map((c) => c.id) } });
      await W.bulkWrite(ch.map((c) => ({ updateOne: { filter: { _id: c.id }, update: { $set: { sortOrder: c.i } } } })), { ordered: false });
    }
    return NextResponse.json({ success: true, placement: place, order: next });
  } catch (e) {
    console.error("배너 순서 저장 오류:", e);
    return NextResponse.json({ success: false, message: "순서를 저장하지 못했습니다." }, { status: 500 });
  }
}

// ── [삭제] 관리자 전용 ──
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    if (catalogWriteBlocked()) return liveLockedResponse();
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    // 실사이트 모드는 지금처럼 바로 지운다. 초안 모드는 새 초안이면 지우고, 실사이트 배너면 삭제 예정(반영 때 지움)으로 둔다
    await catalogDelete(ShopBanner, id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
