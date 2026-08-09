export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { connectToDatabase } from "@/lib/mongodb";
import { authOptions } from "@/lib/authOptions";
import { isAdminName } from "@/lib/admins";
import BotSetting from "@/models/BotSetting";

const requireAdmin = async () => {
  const session = await getServerSession(authOptions);
  return isAdminName(session?.user?.name);
};

// 숫자 필드는 음수/NaN을 막고 상한을 둔다 (봇이 그대로 지급에 사용하므로)
const num = (v, def, { min = 0, max = 10_000_000 } = {}) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

export async function GET() {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    // 없으면 스키마 기본값으로 생성
    const doc = await BotSetting.findOneAndUpdate(
      { key: "main" },
      { $setOnInsert: { key: "main" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await requireAdmin())) {
      return NextResponse.json({ success: false, error: "권한이 없습니다." }, { status: 403 });
    }
    await connectToDatabase();
    const b = await request.json();

    const doc = await BotSetting.findOneAndUpdate(
      { key: "main" },
      {
        chatXp: num(b.chatXp, 200),
        chatCooldownSec: num(b.chatCooldownSec, 60, { min: 0, max: 86400 }),
        voiceXp: num(b.voiceXp, 3000),
        voiceIntervalSec: num(b.voiceIntervalSec, 300, { min: 30, max: 86400 }),
        attendXp: num(b.attendXp, 7000),
        muteMode: ["off", "reduce", "block"].includes(b.muteMode) ? b.muteMode : "reduce",
        muteReducePct: num(b.muteReducePct, 90, { min: 0, max: 100 }),
        muteTarget: ["both", "any"].includes(b.muteTarget) ? b.muteTarget : "both",
        resetOnLeave: !!b.resetOnLeave,
        levelupChannelId: (b.levelupChannelId || "").trim(),
        levelupMessage: (b.levelupMessage || "").trim() || "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!",
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
