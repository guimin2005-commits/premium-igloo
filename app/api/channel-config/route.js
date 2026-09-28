export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import ChannelConfig from "@/models/ChannelConfig";

// 📌 봇의 채널별 XP 지급 정책이므로 전 메서드 관리자 전용

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const configs = await ChannelConfig.find().sort({ channelType: 1, createdAt: 1 });
    return NextResponse.json({ success: true, data: configs });
  } catch (e) {
    return NextResponse.json({ success: false, data: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const body = await request.json();
    if (!body.channelId?.trim()) {
      return NextResponse.json({ success: false, message: "채널을 선택해주세요." }, { status: 400 });
    }
    const config = await ChannelConfig.findOneAndUpdate(
      { channelId: body.channelId },
      {
        channelName: body.channelName || "",
        channelType: body.channelType || "text",
        boostXp: Number(body.boostXp) || 0,
        excluded: !!body.excluded,
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
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false }, { status: 400 });
    await ChannelConfig.findByIdAndDelete(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
