export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { denyIfNotAdmin } from "@/lib/apiAuth";
import BotSetting from "@/models/BotSetting";
import { cleanBoosterLadder, BOOSTER_LADDER_DEFAULT, BOOSTER_REWARD_MAX } from "@/lib/booster";

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
// 핫타임 — 배수는 1~5 · 소수 첫째 자리, 날짜는 본문에 없으면 저장값 유지 · ""/null 이면 비움
const hotMult = (v, def) => {
  if (v == null || String(v).trim() === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n * 10) / 10)) : def;
};
const dateOr = (v, cur) => {
  if (v === undefined) return cur ?? null;
  if (v === null || v === "") return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : cur ?? null;
};

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

// 📌 서버 부스터 보상(2026-10-25) — 사다리 칸이 없는 옛 문서는 기본 사다리로 보여 준다(관리 화면 표가 비어 보이지 않게). 봇은 「사용」(boosterLadderOn)을 켜야만 준다(lib/booster.js boosterRewardsOf)
const withBoosterDefaults = (doc) => {
  const data = doc?.toObject ? doc.toObject() : doc;
  if (data && !Array.isArray(data.boosterLadder)) data.boosterLadder = BOOSTER_LADDER_DEFAULT.map((r) => ({ ...r }));
  return data;
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
    return NextResponse.json({ success: true, data: withBoosterDefaults(doc) });
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
        // 잠수 확인 — 무작위 범위는 최대가 최소보다 작으면 최소로 맞춘다
        afkCheckOn: b.afkCheckOn !== false,
        afkCheckFirstMin: num(b.afkCheckFirstMin, 60, { min: 1, max: 1440 }),
        afkCheckSanctionMin: num(b.afkCheckSanctionMin, 30, { min: 1, max: 1440 }),
        afkCheckMinMin: num(b.afkCheckMinMin, 20, { min: 1, max: 1440 }),
        afkCheckMaxMin: Math.max(num(b.afkCheckMinMin, 20, { min: 1, max: 1440 }), num(b.afkCheckMaxMin, 60, { min: 1, max: 1440 })),
        afkCheckReplyMin: num(b.afkCheckReplyMin, 5, { min: 1, max: 60 }),
        // 📌 핫타임(lib/hotTime.js) — 본문에 없으면(이 칸을 모르는 옛 화면) 저장값 유지
        hotTimeOn: bool(b.hotTimeOn, cur?.hotTimeOn, false),
        hotTimeName: typeof b.hotTimeName === "string" ? b.hotTimeName.trim().slice(0, 40) : cur?.hotTimeName || "",
        hotTimeFrom: dateOr(b.hotTimeFrom, cur?.hotTimeFrom),
        hotTimeUntil: dateOr(b.hotTimeUntil, cur?.hotTimeUntil),
        hotTimeWeekdayMult: hotMult(b.hotTimeWeekdayMult, cur?.hotTimeWeekdayMult ?? 1.5),
        hotTimeWeekendMult: hotMult(b.hotTimeWeekendMult, cur?.hotTimeWeekendMult ?? 2),
        muteMode: ["off", "reduce", "block"].includes(b.muteMode) ? b.muteMode : "reduce",
        muteReducePct: num(b.muteReducePct, 90, { min: 0, max: 100 }),
        muteTarget: ["both", "any"].includes(b.muteTarget) ? b.muteTarget : "both",
        resetOnLeave: !!b.resetOnLeave,
        questPickDaily: num(b.questPickDaily, 0, { min: 0, max: 20 }),
        questPickWeekly: num(b.questPickWeekly, 0, { min: 0, max: 20 }),
        questPickMonthly: num(b.questPickMonthly, 0, { min: 0, max: 20 }),
        // 퀘스트 바꾸기 무료 횟수(0~5) · 유료 바꾸기 값(빙옥 0~100, 0 = 유료 끔) — 본문에 없으면(이 칸을 모르는 옛 화면) 저장값 유지
        ...Object.fromEntries(["questRerollDaily", "questRerollWeekly", "questRerollMonthly"].map((k) => [
          k, b[k] !== undefined && b[k] !== null && b[k] !== "" ? num(b[k], 3, { min: 0, max: 5 }) : cur?.[k] ?? 3,
        ])),
        ...Object.fromEntries([["questRerollPriceDaily", 1], ["questRerollPriceWeekly", 2], ["questRerollPriceMonthly", 3]].map(([k, def]) => [
          k, b[k] !== undefined && b[k] !== null && b[k] !== "" ? num(b[k], def, { min: 0, max: 100 }) : cur?.[k] ?? def,
        ])),
        levelPublic: !!b.levelPublic,
        // 시즌 전환 보호 역할 — 화이트리스트에 없으면 조용히 무시되어 detach 쪽 안전장치가 항상 빈 배열이 된다.
        // 역할 ID 문자열만 남기고 개수도 제한한다 (관리자 실수·비정상 입력으로 문서가 부풀지 않게)
        protectedRoleIds: Array.isArray(b.protectedRoleIds)
          ? b.protectedRoleIds.filter((s) => typeof s === "string" && s.trim()).slice(0, 50)
          : [],
        // 연속 출석 보너스 — 본문에 배열이 없으면 저장된 규칙 유지
        attendStreakEnabled: bool(b.attendStreakEnabled, cur?.attendStreakEnabled, false),
        attendStreakRules: cleanStreakRules(Array.isArray(b.attendStreakRules) ? b.attendStreakRules : cur?.attendStreakRules),
        // 📌 서버 부스터 보상 — 본문에 없으면(이 칸을 모르는 옛 화면) 저장값 유지. 사다리는 배열로 왔을 때만 쓴다(빈 배열 = 끔).
        //    정리는 봇과 같은 규칙(lib/booster.js cleanBoosterLadder — 개월 1~120 · 중복 · 보상 없는 줄 버림 · 최대 12줄). 「사용」은 본문에 없으면 저장값 유지(기본 꺼짐)
        boosterLadderOn: bool(b.boosterLadderOn, cur?.boosterLadderOn, false),
        boosterStartXp: num(b.boosterStartXp, cur?.boosterStartXp ?? 150000, { min: 0, max: BOOSTER_REWARD_MAX }),
        boosterStartPoint: num(b.boosterStartPoint, cur?.boosterStartPoint ?? 30, { min: 0, max: BOOSTER_REWARD_MAX }),
        ...(Array.isArray(b.boosterLadder) ? { boosterLadder: cleanBoosterLadder(b.boosterLadder) } : {}),
        // 📌 2026-10-17 관리 화면 정리 — 아래 칸은 POST 가 쓰지 않는다(다른 화면으로 옮겼다 · 본문에 와도 무시). 바꾸기는 PATCH 로만:
        //    shopPublic(상점 관리 › 설정) · supporterRoleId · supporterBaseXp · supporterGoalChat · supporterGoalVoiceMin(서포터즈 › 설정) ·
        //    levelupChannelId · roleGrantChannelId · attendChannelId · noticeChannelId · expiryReminderHours(봇 메시지 › 보내는 곳) · rankerRoleId(시즌 전환 › RANKER).
        //    레벨 설정 화면은 GET 으로 받은 문서 전체를 되돌려 보낸다 — 여기서 쓰면 그 화면을 연 뒤 다른 화면에서 바꾼 값을 옛 값으로 되돌린다(예: 상점 공개).
        //    옛 한 줄 문구(levelupMessage · roleGrantMessage)와 옛 알림 스위치(roleGrantEnabled · expiryReminderEnabled)도 쓰지 않는다 —
        //    문구 · 켜고 끄기는 봇 메시지(BotMessage)의 「보내기」 하나다. 저장된 값은 그대로 남는다(봇 메시지 legacyKey 반영용)
        updatedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, data: withBoosterDefaults(doc) });
  } catch (e) {
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── [칸만 바꾸기] PATCH ──
//    📌 본문에 온 칸 중 아래 표(PATCH_FIELDS)에 있는 칸만 $set 한다 — 나머지 봇 설정은 건드리지 않는다.
//       POST 는 레벨 설정 화면이 보낸 문서 전체로 칸마다 다시 쓴다. 다른 화면이 일부만 POST 하면 나머지가 기본값으로 덮이므로,
//       레벨 설정 밖으로 옮긴 칸은 이 길로만 바꾼다(POST 는 이 칸들을 쓰지 않는다 — 레벨 설정 저장이 되돌리지 않게).
//       부르는 곳: 상점 관리 › 설정(캐시백 · 상점 공개) · 서포터즈 › 설정 · 봇 메시지 › 보내는 곳 · 시즌 전환 › RANKER
//    값 검사는 POST 와 같은 규칙(숫자 범위 · 자르기). 빈 칸("" · null)은 "안 바꿈"으로 건너뛴다(채널 · 역할 ID 의 "" 는 '지정 안 함' 으로 저장)
//    표에 없는 칸은 조용히 무시한다. 쓸 칸이 하나도 없으면 400. 잘못된 값이 하나라도 있으면 아무것도 쓰지 않고 400(어느 칸인지 message)
const badValue = (message) => ({ error: message });
const isEmpty = (v) => v == null || String(v).trim() === "";
// 디스코드 ID(역할 · 채널) — "" 는 '지정 안 함'. 숫자만 · 32자까지
const snowflake = (label) => (v) => {
  if (typeof v !== "string") return badValue(`${label} 값이 올바르지 않습니다.`);
  const s = v.trim();
  return /^\d{0,32}$/.test(s) ? { value: s } : badValue(`${label} 값이 올바르지 않습니다.`);
};
// 정수 칸 — POST 의 num 과 같은 범위(소수는 버림). 빈 칸은 건너뜀
const intIn = (label, min, max) => (v) => {
  if (isEmpty(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return badValue(`${label}은(는) ${min.toLocaleString()}~${max.toLocaleString()} 사이로 입력해 주세요.`);
  return { value: Math.floor(n) };
};
const boolOnly = (label) => (v) => (typeof v === "boolean" ? { value: v } : badValue(`${label} 값이 올바르지 않습니다.`));
const PATCH_FIELDS = {
  // 상점 관리 › 설정 — 캐시백 합 상한 %(0~100 정수) · 빙옥으로 낸 몫에도 캐시백 · ARCTIC 상점 공개
  shopCashbackCap: (v) => {
    if (isEmpty(v)) return null;
    const n = Number(v);
    return !Number.isFinite(n) || n < 0 || n > 100 ? badValue("캐시백 상한은 0~100% 사이로 입력해 주세요.") : { value: Math.floor(n) };
  },
  cashbackOnPoint: boolOnly("빙옥 결제분 캐시백"),
  shopPublic: boolOnly("ARCTIC 상점 공개"),
  // 서포터즈 › 설정 — 📌 2026-10-04 서포터즈 평가 XP 상한 없앰(app/api/admin/supporters EVAL_NUM_MAX) — 월 기본 XP 도 같은 끝(1조)
  supporterRoleId: snowflake("서포터즈 역할"),
  supporterBaseXp: intIn("월 기본 XP", 0, 1_000_000_000_000),
  supporterGoalChat: intIn("월 목표 채팅", 0, 10_000_000),
  supporterGoalVoiceMin: intIn("월 목표 음성", 0, 10_000_000),
  // 봇 메시지 › 보내는 곳 — 레벨업("" = 알림 끄기) · 역할 지급 · 자동 출석("" = 레벨업 채널과 동일) · 공지("" = 보내지 않음) · 만료 임박 DM 시점(1~168시간 전)
  levelupChannelId: snowflake("레벨업 채널"),
  roleGrantChannelId: snowflake("역할 지급 채널"),
  attendChannelId: snowflake("자동 출석 채널"),
  noticeChannelId: snowflake("공지 채널"),
  expiryReminderHours: intIn("만료 알림 시점", 1, 168),
  // 시즌 전환 › RANKER — 시즌 결산 RANKER 역할("" = 역할 주지 않음)
  rankerRoleId: snowflake("RANKER 역할"),
};

export async function PATCH(request) {
  try {
    const deny = await denyIfNotAdmin();
    if (deny) return deny;
    await connectToDatabase();
    const b = await request.json().catch(() => ({}));
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      return NextResponse.json({ success: false, message: "바꿀 값이 없습니다." }, { status: 400 });
    }
    const set = {};
    for (const [k, check] of Object.entries(PATCH_FIELDS)) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      const r = check(b[k]);
      if (!r) continue;
      if (r.error) return NextResponse.json({ success: false, message: r.error }, { status: 400 });
      set[k] = r.value;
    }
    if (!Object.keys(set).length) {
      return NextResponse.json({ success: false, message: "바꿀 값이 없습니다." }, { status: 400 });
    }
    const doc = await BotSetting.findOneAndUpdate(
      { key: "main" },
      { $set: { ...set, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ success: true, data: withBoosterDefaults(doc) });
  } catch (e) {
    console.error("봇 설정 칸 저장 오류:", e);
    return NextResponse.json({ success: false, message: "저장에 실패했습니다." }, { status: 500 });
  }
}
