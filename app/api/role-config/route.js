export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import RoleConfig from "@/models/RoleConfig";

// 📌 봇이 역할 지급·XP 버프에 그대로 사용하는 설정이므로 전 메서드 관리자 전용
const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const configs = await RoleConfig.find().sort({ rewardLevel: 1, createdAt: 1 });
    return NextResponse.json({ success: true, data: configs });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const body = await request.json();
    if (!body.roleId?.trim()) {
      return NextResponse.json({ success: false, message: "역할을 선택해주세요." }, { status: 400 });
    }
    const config = await RoleConfig.findOneAndUpdate(
      { roleId: body.roleId },
      {
        roleName: body.roleName || "",
        rewardLevel: body.rewardLevel === "" || body.rewardLevel == null ? null : Number(body.rewardLevel),
        buffXp: Number(body.buffXp) || 0,
        attendBuffXp: Number(body.attendBuffXp) || 0,
        exclusive: !!body.exclusive,
      },
      { upsert: true, new: true }
    );
    return NextResponse.json({ success: true, data: config });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await RoleConfig.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
