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
  // 빈 칸·null 은 "입력 안 함" — Number("") 은 0 이라 그냥 두면 0 이 저장된다 (명시한 0 은 그대로 0)
  if (v == null || String(v).trim() === "") return def;
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
    // 📌 숫자 칸을 비우고 저장하면 "" 가 온다 — 기본값으로 되돌리지 않고 지금 저장된 값을 그대로 둔다
    //    (문자열 칸의 "" 는 '알림 끄기' 같은 뜻이 있으니 저장값이 숫자인 칸만)
    const cur = await BotSetting.findOne({ key: "main" }).lean();
    for (const k of Object.keys(b)) {
      if (typeof b[k] === "string" && !b[k].trim() && typeof cur?.[k] === "number") b[k] = cur[k];
    }

    // 채팅 랜덤 구간 — 최소 ≤ 최대 보장 (최소가 더 크면 최대를 최소로 끌어올린다)
    const chatXpMin = num(b.chatXpMin, 50);
    const chatXpMax = Math.max(chatXpMin, num(b.chatXpMax, 500));

    const doc = await BotSetting.findOneAndUpdate(
      { key: "main" },
      {
        chatXp: num(b.chatXp, 200),
        chatXpMin,
        chatXpMax,
        // 강화 — 단계당 가산 0~1e6 · 최대 단계 0~100 · 비용 0~1e9 · 상승 % 0~1000
        chatEnhanceStep: num(b.chatEnhanceStep, 50, { min: 0, max: 1_000_000 }),
        chatEnhanceMax: num(b.chatEnhanceMax, 10, { min: 0, max: 100 }),
        chatEnhanceBaseCost: num(b.chatEnhanceBaseCost, 20000, { min: 0, max: 1_000_000_000 }),
        chatEnhanceCostGrowthPct: num(b.chatEnhanceCostGrowthPct, 50, { min: 0, max: 1000 }),
        voiceEnhanceStep: num(b.voiceEnhanceStep, 300, { min: 0, max: 1_000_000 }),
        voiceEnhanceMax: num(b.voiceEnhanceMax, 10, { min: 0, max: 100 }),
        voiceEnhanceBaseCost: num(b.voiceEnhanceBaseCost, 50000, { min: 0, max: 1_000_000_000 }),
        voiceEnhanceCostGrowthPct: num(b.voiceEnhanceCostGrowthPct, 50, { min: 0, max: 1000 }),
        chatCooldownSec: num(b.chatCooldownSec, 60, { min: 0, max: 86400 }),
        voiceXp: num(b.voiceXp, 3000),
        voiceIntervalSec: num(b.voiceIntervalSec, 300, { min: 30, max: 86400 }),
        attendXp: num(b.attendXp, 7000),
        attendVoiceMin: num(b.attendVoiceMin, 60, { min: 1, max: 1440 }),
        muteMode: ["off", "reduce", "block"].includes(b.muteMode) ? b.muteMode : "reduce",
        muteReducePct: num(b.muteReducePct, 90, { min: 0, max: 100 }),
        muteTarget: ["both", "any"].includes(b.muteTarget) ? b.muteTarget : "both",
        resetOnLeave: !!b.resetOnLeave,
        questPickDaily: num(b.questPickDaily, 0, { min: 0, max: 20 }),
        questPickWeekly: num(b.questPickWeekly, 0, { min: 0, max: 20 }),
        questPickMonthly: num(b.questPickMonthly, 0, { min: 0, max: 20 }),
        shopPublic: !!b.shopPublic,
        levelPublic: !!b.levelPublic,
        // 시즌 전환 보호 역할 — 화이트리스트에 없으면 조용히 무시되어 detach 쪽 안전장치가 항상 빈 배열이 된다.
        // 역할 ID 문자열만 남기고 개수도 제한한다 (관리자 실수·비정상 입력으로 문서가 부풀지 않게)
        protectedRoleIds: Array.isArray(b.protectedRoleIds)
          ? b.protectedRoleIds.filter((s) => typeof s === "string" && s.trim()).slice(0, 50)
          : [],
        levelupChannelId: (b.levelupChannelId || "").trim(),
        levelupMessage: (b.levelupMessage || "").trim() || "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!",
        roleGrantChannelId: (b.roleGrantChannelId || "").trim(),
        roleGrantMessage: (b.roleGrantMessage || "").trim() || "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})",
        roleGrantEnabled: b.roleGrantEnabled !== false,
        // 서포터즈 — 화이트리스트에 없으면 조용히 무시되어 역할 탭에서 저장해도 안 남는다
        supporterRoleId: typeof b.supporterRoleId === "string" ? b.supporterRoleId.trim() : "",
        supporterBaseXp: num(b.supporterBaseXp, 150000),
        supporterGoalChat: num(b.supporterGoalChat, 0),
        supporterGoalVoiceMin: num(b.supporterGoalVoiceMin, 0),
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
