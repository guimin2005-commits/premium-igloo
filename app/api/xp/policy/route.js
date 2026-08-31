export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import BotSetting from "@/models/BotSetting";
import XpBoost from "@/models/XpBoost";

// ── [공개] 현재 XP 정책 — SYSTEM:LEVEL 페이지가 실시간으로 표시 ──
//    관리 전용 값(퇴장 초기화 등)은 내보내지 않는다
export async function GET() {
  try {
    await connectToDatabase();
    const [doc, boosts] = await Promise.all([
      BotSetting.findOne({ key: "main" }).lean(),
      XpBoost.find({ startAt: { $lte: new Date() }, endAt: { $gte: new Date() } }).lean(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        chatXp: doc?.chatXp ?? 200,
        chatCooldownSec: doc?.chatCooldownSec ?? 60,
        voiceXp: doc?.voiceXp ?? 3000,
        voiceIntervalSec: doc?.voiceIntervalSec ?? 300,
        attendXp: doc?.attendXp ?? 7000,
        attendVoiceMin: doc?.attendVoiceMin ?? 60,
        muteMode: doc?.muteMode ?? "reduce",
        muteReducePct: doc?.muteReducePct ?? 90,
        muteTarget: doc?.muteTarget ?? "both",
        shopPublic: !!doc?.shopPublic,
        // 진행 중인 부스트 (유저에게 보여줄 정보만)
        activeBoosts: boosts.map((b) => ({
          name: b.name,
          boostXp: b.boostXp,
          targetRoleName: b.targetRoleName || "",
          targetChannelName: b.targetChannelName || "",
          endAt: b.endAt,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, data: null }, { status: 500 });
  }
}
