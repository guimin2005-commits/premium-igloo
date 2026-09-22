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
        chatXp: doc?.chatXp ?? 200, // (구) 고정 지급량 — 화면은 min/max 를 쓴다
        // 채팅 랜덤 구간 · 강화 정책 — 레벨 페이지 강화 카드/시뮬레이터가 lib/enhance.js 로 같은 식을 돌린다
        chatXpMin: doc?.chatXpMin ?? 50,
        chatXpMax: doc?.chatXpMax ?? 500,
        chatEnhanceStep: doc?.chatEnhanceStep ?? 50,
        chatEnhanceMax: doc?.chatEnhanceMax ?? 10,
        chatEnhanceBaseCost: doc?.chatEnhanceBaseCost ?? 20000,
        chatEnhanceCostGrowthPct: doc?.chatEnhanceCostGrowthPct ?? 50,
        voiceEnhanceStep: doc?.voiceEnhanceStep ?? 300,
        voiceEnhanceMax: doc?.voiceEnhanceMax ?? 10,
        voiceEnhanceBaseCost: doc?.voiceEnhanceBaseCost ?? 50000,
        voiceEnhanceCostGrowthPct: doc?.voiceEnhanceCostGrowthPct ?? 50,
        chatCooldownSec: doc?.chatCooldownSec ?? 60,
        voiceXp: doc?.voiceXp ?? 3000,
        voiceIntervalSec: doc?.voiceIntervalSec ?? 300,
        attendXp: doc?.attendXp ?? 7000,
        attendVoiceMin: doc?.attendVoiceMin ?? 60,
        muteMode: doc?.muteMode ?? "reduce",
        muteReducePct: doc?.muteReducePct ?? 90,
        muteTarget: doc?.muteTarget ?? "both",
        shopPublic: !!doc?.shopPublic,
        levelPublic: !!doc?.levelPublic,
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
