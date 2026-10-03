export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import BotSetting from "@/models/BotSetting";

// 숫자 필드는 음수/NaN을 막고 상한을 둔다 (봇이 그대로 지급에 사용하므로)
const num = (v, def, { min = 0, max = 10_000_000 } = {}) => {
  // 빈 칸·null 은 "입력 안 함" — Number("") 은 0 이라 그냥 두면 0 이 저장된다 (명시한 0 은 그대로 0)
  if (v == null || String(v).trim() === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

// 📌 새로 붙은 칸은 본문에 없으면(이 칸을 모르는 옛 화면이 저장) 저장된 값을 그대로 둔다 — 기본값으로 덮지 않게
const bool = (v, cur, def) => (typeof v === "boolean" ? v : typeof cur === "boolean" ? cur : def);

// 연속 출석 보너스 규칙 정리 — days 1~365 정수 · xp/point 0~10,000,000 · 보상 없는 줄과 같은 일수 중복은 버림 · 최대 10줄
const MAX_STREAK_RULES = 10;
const cleanStreakRules = (rows) => {
  const seen = new Set();
  const out = [];
  for (const r of (Array.isArray(rows) ? rows : []).slice(0, 50)) {
    // 📌 일수는 자르지 않고 범위 밖이면 버린다 — 400 을 365 로 바꾸면 관리자가 적은 365 줄이 중복으로 밀려난다
    const days = num(r?.days, 0, { min: 0, max: Infinity });
    const xp = num(r?.xp, 0);
    const point = num(r?.point, 0);
    if (days < 1 || days > 365 || (xp <= 0 && point <= 0) || seen.has(days)) continue;
    seen.add(days);
    out.push({ days, xp, point, repeat: r?.repeat === true });
    if (out.length >= MAX_STREAK_RULES) break;
  }
  return out.sort((a, b) => a.days - b.days);
};

export async function GET() {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
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
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
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

    // 📌 연산자 없는 본문은 mongoose 가 $set 으로 감싼다 — 아래에 적은 칸만 바뀌고 문서를 통째로 덮지 않는다.
    //    내역 기준 시각(ledgerSince)은 여기서 받지 않으므로 화면이 GET 으로 받은 값을 되돌려 보내도 그대로 남는다
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
        // 자동 출석 알림 채널 — "" 는 레벨업 채널과 동일. 본문에 없으면(이 칸을 모르는 옛 화면) 저장값 유지
        attendChannelId: typeof b.attendChannelId === "string" ? b.attendChannelId.trim().slice(0, 32) : cur?.attendChannelId || "",
        // 서포터즈 — 화이트리스트에 없으면 조용히 무시되어 역할 탭에서 저장해도 안 남는다
        supporterRoleId: typeof b.supporterRoleId === "string" ? b.supporterRoleId.trim() : "",
        supporterBaseXp: num(b.supporterBaseXp, 150000),
        supporterGoalChat: num(b.supporterGoalChat, 0),
        supporterGoalVoiceMin: num(b.supporterGoalVoiceMin, 0),
        // 시즌 결산 RANKER 역할 — "" 는 '역할 주지 않음'. 본문에 없으면 저장값 유지
        rankerRoleId: typeof b.rankerRoleId === "string" ? b.rankerRoleId.trim().slice(0, 32) : cur?.rankerRoleId || "",
        // 연속 출석 보너스 — 본문에 배열이 없으면 저장된 규칙 유지
        attendStreakEnabled: bool(b.attendStreakEnabled, cur?.attendStreakEnabled, false),
        attendStreakRules: cleanStreakRules(Array.isArray(b.attendStreakRules) ? b.attendStreakRules : cur?.attendStreakRules),
        // 만료 임박 DM — 1~168시간 전
        expiryReminderEnabled: bool(b.expiryReminderEnabled, cur?.expiryReminderEnabled, true),
        expiryReminderHours: num(b.expiryReminderHours, cur?.expiryReminderHours ?? 24, { min: 1, max: 168 }),
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: doc });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
