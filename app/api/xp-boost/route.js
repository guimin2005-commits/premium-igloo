export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import XpBoost from "@/models/XpBoost";

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
    const boosts = await XpBoost.find().sort({ startAt: -1 });
    return NextResponse.json({ success: true, data: boosts });
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
    const b = await request.json();

    const startAt = new Date(b.startAt);
    const endAt = new Date(b.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return NextResponse.json({ success: false, message: "기간을 올바르게 입력해주세요." }, { status: 400 });
    }
    if (endAt <= startAt) {
      return NextResponse.json({ success: false, message: "종료 시각은 시작 시각보다 뒤여야 합니다." }, { status: 400 });
    }
    const boostXp = Math.max(0, Math.floor(Number(b.boostXp) || 0));
    if (boostXp <= 0) {
      return NextResponse.json({ success: false, message: "추가 XP를 입력해주세요." }, { status: 400 });
    }

    const payload = {
      name: (b.name || "").trim() || "이름 없는 부스트",
      targetRoleId: (b.targetRoleId || "").trim(),
      targetRoleName: (b.targetRoleName || "").trim(),
      boostXp,
      startAt,
      endAt,
    };

    const doc = b.id
      ? await XpBoost.findByIdAndUpdate(b.id, payload, { new: true })
      : await XpBoost.create(payload);

    return NextResponse.json({ success: true, data: doc });
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
    await XpBoost.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
