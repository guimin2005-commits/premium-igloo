export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import Code from "@/models/Code";

// [조회] 관리자용 전체 코드 목록
// ⚠️ 미사용 코드 문자열이 그대로 담기므로 반드시 관리자만 볼 수 있어야 한다
export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const codes = await Code.find().sort({ createdAt: -1 });
    return NextResponse.json({ success: true, data: codes });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [수정] 관리자용 코드 수정 (유저 사용 경로는 닫혔다 — 아래 410)
export async function POST(request) {
  try {
    await connectToDatabase();
    const body = await request.json();
    const { id, reward, roleId, requiredRoleId, requiredRoleName, maxUses, expiresAt } = body;

    // 관리자: 코드 수정
    if (id) {
      const deny = await denyIfNotAdmin();
      if (deny) return deny;
      if (!reward || !reward.trim()) {
        return NextResponse.json({ success: false, error: "보상 설명은 필수입니다." }, { status: 400 });
      }

      const updated = await Code.findByIdAndUpdate(id, {
        reward: reward.trim(),
        roleId: roleId || "",
        requiredRoleId: requiredRoleId || "",
        requiredRoleName: requiredRoleName || "",
        maxUses: maxUses === undefined || maxUses === null ? 1 : Number(maxUses),
        xpAmount: Math.max(0, Math.floor(Number(body.xpAmount) || 0)),
        expiresAt: expiresAt || undefined,
      }, { new: true });

      if (!updated) {
        return NextResponse.json({ success: false, error: "코드를 찾을 수 없습니다." }, { status: 404 });
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // 유저: 코드 사용 — 쿠폰 등록(app/api/shop/my-coupons)으로 옮겨 이 경로는 닫는다.
    //    사용 기록이 닉네임 기준이고 선점 없이 지급해, 동시 요청 · 이름 변경 · 쿠폰 이전 뒤 재사용으로 여러 번 받을 수 있었다.
    //    화면에서 부르는 곳은 없다.
    return NextResponse.json({ success: false, message: "코드 입력은 쿠폰 등록으로 바뀌었습니다." }, { status: 410 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// [발급] 관리자용 코드 생성
export async function PUT(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { code, reward, roleId, requiredRoleId, requiredRoleName, maxUses, expiresAt, xpAmount } = await request.json();

    if (!code || !code.trim() || !reward || !reward.trim()) {
      return NextResponse.json({ success: false, error: "코드와 보상 설명은 필수입니다." }, { status: 400 });
    }

    const newCode = await Code.create({
      code: code.trim().toUpperCase(),
      reward: reward.trim(),
      roleId: roleId || "",
      requiredRoleId: requiredRoleId || "",
      requiredRoleName: requiredRoleName || "",
      maxUses: maxUses === undefined || maxUses === null ? 1 : Number(maxUses),
      xpAmount: Math.max(0, Math.floor(Number(xpAmount) || 0)),
      expiresAt: expiresAt || undefined,
    });

    return NextResponse.json({ success: true, data: newCode });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json({ success: false, error: "이미 존재하는 코드입니다." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// [삭제] 관리자용 코드 삭제
export async function DELETE(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID가 없습니다." }, { status: 400 });
    await Code.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
