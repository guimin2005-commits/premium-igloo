export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import { denyIfNotAdmin, requireUser, requireSelfOrAdmin } from "@/lib/apiAuth";
import Apply from "../../../models/Apply";

// 지원서에는 나이·자기소개 등 개인정보가 담기고, 상태(합격/불합격)는 운영 판단이므로
// 조회는 본인 한정, 전체 조회와 상태 변경은 관리자 한정으로 나눈다.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get("user");
    const admin = searchParams.get("admin");

    if (admin === "true") {
      const deny = await denyIfNotAdmin();
      if (deny) return deny;
    } else if (user) {
      const auth = await requireSelfOrAdmin(user);
      if (auth.deny) return auth.deny;
    } else {
      return NextResponse.json({ success: false, error: "파라미터 누락" }, { status: 400 });
    }

    await connectToDatabase();
    const records = admin === "true"
      ? await Apply.find().sort({ createdAt: -1 })
      : await Apply.find({ discordTag: user }).sort({ createdAt: -1 });

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
    const auth = await requireUser();
    if (auth.deny) return auth.deny;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID 누락" }, { status: 400 });

    await connectToDatabase();
    const target = await Apply.findById(id);
    if (!target) return NextResponse.json({ success: false, error: "지원 내역을 찾을 수 없습니다." }, { status: 404 });

    // 남의 지원서를 지우지 못하게 소유자를 확인한다
    if (!auth.isAdmin && target.discordTag !== auth.name) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }

    await Apply.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}