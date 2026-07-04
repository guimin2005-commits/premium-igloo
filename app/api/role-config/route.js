import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import RoleConfig from "@/models/RoleConfig";

export async function GET() {
  try {
    await connectToDatabase();
    const configs = await RoleConfig.find().sort({ rewardLevel: 1, createdAt: 1 });
    return NextResponse.json({ success: true, data: configs });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
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
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await RoleConfig.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
