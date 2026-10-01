export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import { getShopAccess } from "@/lib/shopAccess";
import ShopBanner from "@/models/ShopBanner";

// 📌 노출 위치 — 홈(ARCTIC 홈 맨 위) · 시즌(스토어 시즌 탭 맨 위). 모델(models/ShopBanner.js)의 enum 과 같아야 한다
const PLACEMENTS = ["home", "season"];

// 📌 위치별 조회 조건 — ?placement=season 은 시즌 탭, 없거나 모르는 값이면 홈(지금까지의 홈 화면 동작 그대로).
//    placement 값이 생기기 전에 등록한 배너는 값이 없다 → 홈으로 친다(null 은 필드 없음도 잡는다).
//    ?placement=any 는 위치 구분 없이 전부 — 관리자 배너 목록용
const placementFilter = (p) => {
  if (p === "any") return {};
  if (p === "season") return { placement: "season" };
  return { placement: { $in: ["home", null] } };
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
    const banners = await ShopBanner.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
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
    await connectToDatabase();
    const b = await request.json();
    if (!b.imageUrl?.trim()) {
      return NextResponse.json({ success: false, message: "배너 이미지 URL을 입력해주세요." }, { status: 400 });
    }
    // 📌 모바일 이미지는 선택 — 비워 두면 모바일도 PC 이미지를 쓴다
    if (b.mobileImageUrl != null && typeof b.mobileImageUrl !== "string") {
      return NextResponse.json({ success: false, message: "모바일 이미지 URL을 확인해주세요." }, { status: 400 });
    }
    // 📌 노출 위치 — 안 보내면 홈. 모르는 값은 막는다(조용히 홈으로 바꿔 저장하면 엉뚱한 화면에 걸린다)
    if (b.placement != null && !PLACEMENTS.includes(b.placement)) {
      return NextResponse.json({ success: false, message: "노출 위치를 확인해주세요." }, { status: 400 });
    }

    const payload = {
      imageUrl: b.imageUrl.trim(),
      mobileImageUrl: (b.mobileImageUrl || "").trim(),
      title: (b.title || "").trim(),
      subtitle: (b.subtitle || "").trim(),
      link: (b.link || "").trim(),
      sortOrder: Math.floor(Number(b.sortOrder) || 0),
      active: b.active !== false,
    };
    // 📌 노출 위치 — 보냈으면 그 값. 새로 만들 때 안 보내면 홈, 수정 때 안 보내면 저장된 값 그대로
    //    (위치를 모르는 옛 관리자 화면이 열려 있다가 저장해도 시즌 배너가 홈으로 넘어가지 않게)
    if (b.placement != null) payload.placement = b.placement;
    else if (!b.id) payload.placement = "home";

    const doc = b.id
      ? await ShopBanner.findByIdAndUpdate(b.id, payload, { new: true })
      : await ShopBanner.create(payload);

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [삭제] 관리자 전용 ──
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await ShopBanner.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
