export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { denyIfNotAdmin, denyIfMaintenance, requireUser, requireSelfOrAdmin } from "@/lib/apiAuth";
import Apply from "../../../models/Apply";

// 📌 내 지원서 — 디스코드 ID 로 찾는다(이름은 바뀔 수 있다). ID 가 비어 있는 옛 문서만 이름(discordTag)으로 찾는다
function mineQuery(userId: string, name: string) {
  const or: any[] = [];
  if (userId) or.push({ userId });
  if (name) or.push({ discordTag: name, userId: { $in: ["", null] } });
  return or.length ? { $or: or } : null;
}

// 본인 지원서인지 — 문서에 ID 가 있으면 ID 로만, 없을 때(옛 문서)만 이름으로 본다
const isOwnApply = (doc: any, userId: string, name: string) =>
  doc?.userId ? !!userId && doc.userId === userId : !!name && doc?.discordTag === name;

// 지원서에는 나이·자기소개 등 개인정보가 담기고, 상태(합격/불합격)는 운영 판단이므로
// 조회는 본인 한정, 전체 조회와 상태 변경은 관리자 한정으로 나눈다.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const admin = searchParams.get("admin");

    let filter: any = {};
    if (admin === "true") {
      const deny = await denyIfNotAdmin();
      if (deny) return deny;
    } else if (searchParams.get("mine") === "1") {
      // 📌 내 지원서 — 대상은 세션으로만 정한다(이름이 막 바뀌어 화면의 세션 이름이 옛것이어도 그대로 보인다)
      const auth: any = await requireUser();
      if (auth.deny) return auth.deny;
      filter = mineQuery(String(auth.userId || ""), auth.name) || { _id: null };
    } else if (user) {
      const auth: any = await requireSelfOrAdmin(user);
      if (auth.deny) return auth.deny;
      // 내 이름으로 물으면 ID 우선(이름을 바꿔도 내 지원서가 그대로 보인다). 관리자가 남의 이름으로 물으면 이름으로
      filter = user === auth.name ? mineQuery(String(auth.userId || ""), auth.name) || { _id: null } : { discordTag: user };
    } else {
      return NextResponse.json({ success: false, error: "파라미터 누락" }, { status: 400 });
    }

    await connectToDatabase();
    const records = await Apply.find(filter).sort({ createdAt: -1 });

    return NextResponse.json({ success: true, data: records }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // ⚠️ 합격/불합격 판정이므로 관리자만 — 본인이 자기 지원을 합격 처리하지 못하게 한다
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { id, status } = await request.json();
    const updatedApply = await Apply.findByIdAndUpdate(id, { status }, { new: true });
    return NextResponse.json({ success: true, data: updatedApply });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 본인 지원 취소(내 정보 > 구인 지원 목록) 또는 관리자 삭제
export async function DELETE(request: Request) {
  try {
    const auth: any = await requireUser();
    if (auth.deny) return auth.deny;
    const maint = await denyIfMaintenance(auth.session);
    if (maint) return maint;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID 누락" }, { status: 400 });

    await connectToDatabase();
    const target = await Apply.findById(id);
    if (!target) return NextResponse.json({ success: false, error: "지원 내역을 찾을 수 없습니다." }, { status: 404 });

    // 남의 지원서를 지우지 못하게 소유자를 확인한다 — ID 기준(옛 문서만 이름)
    if (!auth.isAdmin && !isOwnApply(target, String(auth.userId || ""), auth.name)) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    // 본인은 심사 중인 지원만 취소할 수 있다 — 판정이 난 기록은 운영 근거로 남긴다
    if (!auth.isAdmin && (target.status || "심사 중") !== "심사 중") {
      return NextResponse.json({ success: false, error: "심사가 끝난 지원은 취소할 수 없습니다." }, { status: 403 });
    }

    if (auth.isAdmin) {
      await Apply.findByIdAndDelete(id);
    } else {
      // 확인과 삭제 사이에 판정이 나면 지우지 않는다 — 심사 중일 때만 지우는 조건부 삭제
      const r = await Apply.deleteOne({ _id: id, $or: [{ status: "심사 중" }, { status: { $in: ["", null] } }] });
      if (!r.deletedCount) {
        return NextResponse.json({ success: false, error: "심사가 끝난 지원은 취소할 수 없습니다." }, { status: 409 });
      }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}