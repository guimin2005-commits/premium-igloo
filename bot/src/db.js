// ── MongoDB 연결 + 모델 (사이트와 공유되는 컬렉션) ──
import mongoose from "mongoose";

const UserXpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: "" },
  displayName: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastChatXpAt: { type: Date, default: null },
  lastAttendDate: { type: String, default: "" }, // "2026-07-05" (KST)
  // 스키마에 없으면 strict 모드에서 $inc 가 조용히 버려진다 — 사이트가 이 값을 보여주므로 반드시 필요
  attendCount: { type: Number, default: 0 },
  // 📌 연속 출석 — claimAttendance(attend.js)가 씀. 어제 출석이면 +1, 끊기면 1 부터 (models/UserXp.js 와 같아야 한다)
  attendStreak: { type: Number, default: 0 },     // 지금 연속 일수
  attendBestStreak: { type: Number, default: 0 }, // 최고 연속 일수
  // POINT 관련 — 봇은 출석 때 빙옥(연속 출석 보너스 · 아이템 효과 출석 빙옥, attend.js)만 $inc 한다. upsert 로 문서를 만들 때 default 도 필요하다
  point: { type: Number, default: 0 },
  pointTierPaid: { type: Number, default: 0 },
  // 누적 음성 참여 시간(초) — 시즌 무관 통산 기록 (VOICE_TIME_START 이후부터 적립)
  voiceSeconds: { type: Number, default: 0 },
  // 오늘(KST) 음성 누적 분 — 출석 자동 지급 판정용
  voiceTodayMin: { type: Number, default: 0 },
  voiceTodayDate: { type: String, default: "" },
  // 📌 아이템 효과 "하루 1번" 기록 — 키 "<itemId>:<effectId>" → 마지막으로 받은 날(KST "YYYY-MM-DD").
  //    하루 첫 채팅 · 하루 음성 N분 효과가 itemEffects.js claimDaily 로 조건부 갱신해 하루 한 번만 지급한다.
  //    (Map 키에 점 · $ 가 들어가면 안 되므로 claimDaily 가 키를 정리해서 쓴다)
  effectDaily: { type: Map, of: String, default: {} },
  // 지금까지 도달한 최고 레벨 — 레벨업 효과를 같은 레벨에서 두 번 주지 않으려고(xp.js). 사이트 models/UserXp.js 와 같이
  maxLevel: { type: Number, default: 0 },

  // 사이트에서 XP·레벨을 바꿨을 때 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },

  // 📌 강화 단계 — 사이트(app/api/xp/enhance)가 올리고 봇은 읽기만 한다. 영구 값(시즌 무관).
  //    채팅: 1회 지급 구간 양끝에 단계 × chatEnhanceStep 가산 / 음성: 1회 지급에 단계 × voiceEnhanceStep 가산
  //    (models/UserXp.js 와 이름·기본값이 반드시 같아야 한다)
  chatEnhance: { type: Number, default: 0 },
  voiceEnhance: { type: Number, default: 0 },
  // 강화에 실제로 낸 값 누적 — 사이트의 관리자 테스트 초기화가 환불에 쓴다 (models/UserXp.js 와 같은 모양)
  enhancePaid: {
    xp: { type: Number, default: 0 },
    point: { type: Number, default: 0 },
  },

  // 📌 시즌 패스 — 봇은 읽지 않지만 사이트와 같은 문서라 스키마를 맞춰 둔다.
  //    빠지면 봇의 upsert 가 문서를 만들 때 사이트가 기대하는 기본값이 없어진다.
  //    (models/UserXp.js 와 이름·기본값이 반드시 같아야 한다)
  passSeason: { type: Number, default: 0 },        // SEASON.number 와 다르면 새 시즌 — 사이트가 진행도를 다시 스냅샷한다
  passBaseXp: { type: Number, default: 0 },        // 시즌 시작 시점의 누적 XP (진행도 = xp - passBaseXp)
  passUnlocked: { type: Boolean, default: false }, // 프리미엄 트랙 해금 여부 (시즌마다 초기화)
  // 고른 카드 스킨 — "" 안 고름 · "none" 끔 · 스킨 키 (models/UserXp.js 와 같은 칸). 이미지 카드 그릴 때 읽는다(botMessages withSkin)
  cardSkinPick: { type: String, default: "" },
  // 단 프로필 배지 — 아이템 id 배열, 칸 없음 = 안 고름(자동) · [] = 전부 뗌 (models/UserXp.js 와 같은 칸). 봇은 읽지 않는다
  //    📌 default: undefined — 배열 칸 기본값([])이 봇 upsert 로 들어가면 기존 유저가 "전부 뗌"이 된다
  badgePick: { type: [String], default: undefined },
  // 해금 때 낸 값 — 사이트의 관리자 테스트 초기화가 환불에 쓴다 (models/UserXp.js 와 같은 모양)
  passUnlockPaid: {
    method: { type: String, default: "" },
    amount: { type: Number, default: 0 },
  },
  // 수령 기록은 티어의 안정 식별자(tid, "t1"·"t2" …)를 담는다. 인덱스로 담으면 시즌 도중
  // 티어를 중간에 추가할 때 뒤쪽이 밀려 이미 받은 보상을 다시 받을 수 있다 (models/SeasonPass.js 참고).
  passClaimedFree: { type: [String], default: [] }, // 수령한 무료 티어 tid
  passClaimedPaid: { type: [String], default: [] }, // 수령한 프리미엄 티어 tid

  updatedAt: { type: Date, default: Date.now },
});
export const UserXp = mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);

// 관리자 대시보드(/admin/bot)에서 관리하는 역할 설정
const RoleConfigSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },
  rewardLevel: { type: Number, default: null }, // 이 레벨 도달 시 자동 지급
  exclusive: { type: Boolean, default: false },  // 티어 사다리 — 최상위 하나만 유지
  buffXp: { type: Number, default: 0 },         // 채팅/음성 1회당 추가 XP
  attendBuffXp: { type: Number, default: 0 },   // 출석 1회당 추가 XP
  createdAt: { type: Date, default: Date.now },
});
export const RoleConfig = mongoose.models.RoleConfig || mongoose.model("RoleConfig", RoleConfigSchema);

// 📌 아이템 등록 (사이트 models/Item.js — 컬렉션 items) · ARCTIC 상품 (사이트 models/ShopItem.js — 컬렉션 shopitems)
//    봇은 읽기만 한다(lean) — 아이템 효과 보유 판정(itemEffects.js)에 필요한 칸만 옮겨 둔다. 절대 저장하지 말 것.
//    효과 칸의 모양 · 규칙 원본은 사이트 lib/itemEffects.js — 키를 바꾸면 사이트 모델과 같이 고칠 것.
const ItemSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  type: { type: String, default: "item" },       // "role" | "perk" | "item" | "cosmetic"(꾸미기 — 역할 없음) | "physical"(기프트카드 — 효과 없음)
  roleId: { type: String, default: "" },
  visible: { type: Boolean, default: true },     // false 면 (B) 역할 보유 판정에서 "없는 것"으로 본다
  sortOrder: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  chatBuffXp: { type: Number, default: 0 },      // 채팅 1회당 +N XP
  voiceBuffXp: { type: Number, default: 0 },     // 음성 1회당 +N XP
  attendBuffXp: { type: Number, default: 0 },    // 출석 시 +N XP
  // 조건 효과 — 한 칸: { id, on, mode, amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds? }
  effects: { type: [mongoose.Schema.Types.Mixed], default: [] },
});
export const Item = mongoose.models.Item || mongoose.model("Item", ItemSchema);

const ShopItemSchema = new mongoose.Schema({
  itemId: { type: String, default: "" },         // 아이템 등록(Item) 참조 — "" 이면 직접 설정한 상품
  roleId: { type: String, default: "" },
  type: { type: String, default: "role" },
  // 1개 단위 판매 · 기간제 가격표 — 봇은 읽기만(/인벤토리 ×N 묶음 판정 — itemEffects.js ownedItemList). 사이트 models/ShopItem.js 가 원천
  unitSale: { type: Boolean, default: false },
  durations: { type: [mongoose.Schema.Types.Mixed], default: [] },
});
export const ShopItem =mongoose.models.ShopItem || mongoose.model("ShopItem", ShopItemSchema);

// 레벨 대시보드에서 관리하는 채널/카테고리별 XP 정책
const ChannelConfigSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  channelName: { type: String, default: "" },
  channelType: { type: String, default: "text" }, // "text" | "voice" | "category"
  boostXp: { type: Number, default: 0 },          // 이 채널에서 XP 지급 1회당 추가
  excluded: { type: Boolean, default: false },    // true면 이 채널에서 XP 지급 안 함
  createdAt: { type: Date, default: Date.now },
});
export const ChannelConfig = mongoose.models.ChannelConfig || mongoose.model("ChannelConfig", ChannelConfigSchema);

// 연속 출석 보너스 규칙 한 줄 (models/BotSetting.js 의 AttendStreakRuleSchema 와 같아야 한다)
const AttendStreakRuleSchema = new mongoose.Schema({
  days: { type: Number, default: 1 },       // 연속 일수
  xp: { type: Number, default: 0 },
  point: { type: Number, default: 0 },      // 빙옥
  repeat: { type: Boolean, default: false }, // true 면 days 의 배수마다
}, { _id: false });

// 대시보드에서 관리하는 XP 기본 정책 (단일 문서 key:"main")
const BotSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },
  chatXp: { type: Number, default: 200 }, // (구) 고정 지급량 — 호환용. 채팅 지급은 아래 min/max 랜덤을 쓴다
  // 채팅 1회 지급 = [chatXpMin, chatXpMax] 랜덤 정수, 강화 단계마다 양끝 + chatEnhanceStep
  chatXpMin: { type: Number, default: 50 },
  chatXpMax: { type: Number, default: 500 },
  chatEnhanceStep: { type: Number, default: 50 },
  chatEnhanceMax: { type: Number, default: 10 },           // 사이트 전용(강화 상한) — 스키마 동기화
  chatEnhanceBaseCost: { type: Number, default: 20000 },   // 사이트 전용(1단계 비용)
  chatEnhanceCostGrowthPct: { type: Number, default: 50 }, // 사이트 전용(단계당 비용 상승 %)
  chatCooldownSec: { type: Number, default: 60 },
  voiceXp: { type: Number, default: 3000 },
  voiceIntervalSec: { type: Number, default: 300 },
  // 음성 강화 — 단계당 음성 1회 지급에 voiceEnhanceStep 가산 (나머지 셋은 사이트 전용)
  voiceEnhanceStep: { type: Number, default: 300 },
  voiceEnhanceMax: { type: Number, default: 10 },
  voiceEnhanceBaseCost: { type: Number, default: 50000 },
  voiceEnhanceCostGrowthPct: { type: Number, default: 50 },
  attendXp: { type: Number, default: 7000 },
  // 출석 인정 기준(음성 누적 분) — 자동 출석 지급이 이 값을 읽는다.
  // 스키마에 없으면 strict 모드에서 조용히 버려져 관리자가 바꿔도 60으로 굳는다.
  attendVoiceMin: { type: Number, default: 60 },
  attendPoint: { type: Number, default: 0 },      // 출석 1회 POINT
  attendPassPoint: { type: Number, default: 0 },  // 출석 1회 패스 포인트
  // 📌 연속 출석 보너스 — 기본 꺼짐. days 일 연속 달성 시 xp·point, repeat 면 days 의 배수마다 (attend.js)
  attendStreakEnabled: { type: Boolean, default: false },
  attendStreakRules: { type: [AttendStreakRuleSchema], default: [] },
  // 📌 시즌 결산 RANKER 역할 — 비우면 결산 기록만 하고 역할은 주지 않는다
  rankerRoleId: { type: String, default: "" },
  // 📌 기간제 만료 임박 DM — 만료 N시간 전에 한 번 (features/expiryReminder.js)
  expiryReminderEnabled: { type: Boolean, default: true },
  expiryReminderHours: { type: Number, default: 24 },
  // 봇은 안 쓰지만 사이트와 같은 문서라 빠지면 저장 때 날아갈 수 있다
  shopPublic: { type: Boolean, default: false },
  levelPublic: { type: Boolean, default: false }, // SYSTEM : LEVEL 공개 — false 면 봇이 XP 를 주지 않는다 (botSettings.js isLevelOpen)
  // 시즌 전환 때도 절대 떼지 않는 역할 (펭귄 등급 등) — 표기 떼기가 이 목록을 먼저 읽는다
  protectedRoleIds: { type: [String], default: [] },
  muteMode: { type: String, default: "reduce" },  // "off" | "reduce" | "block"
  muteReducePct: { type: Number, default: 90 },
  muteTarget: { type: String, default: "both" },  // "both" | "any"
  resetOnLeave: { type: Boolean, default: false },
  // 사이트 전용 — 주기별 퀘스트 무작위 노출 개수 (봇은 쓰지 않지만 스키마를 맞춰 둔다)
  questPickDaily: { type: Number, default: 0 },
  questPickWeekly: { type: Number, default: 0 },
  questPickMonthly: { type: Number, default: 0 },
  levelupChannelId: { type: String, default: "" },
  levelupMessage: { type: String, default: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!" },
  roleGrantChannelId: { type: String, default: "" },
  roleGrantMessage: { type: String, default: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})" },
  roleGrantEnabled: { type: Boolean, default: true },
  // 📌 서포터즈 — 봇은 읽지 않지만 사이트와 같은 문서라 스키마를 맞춰 둔다
  //    (models/BotSetting.js 와 이름·기본값이 반드시 같아야 한다 — 빠지면 upsert 때 기본값이 사라진다)
  supporterRoleId:      { type: String, default: "" },      // 서포터즈 역할 — 관리자가 /admin/bot 역할 탭에서 지정
  supporterBaseXp:      { type: Number, default: 150000 },  // 월 기본 지급 XP (평가 입력의 기본값)
  supporterGoalChat:    { type: Number, default: 0 },       // 월 목표 채팅 횟수 (0 = 목표 없음)
  supporterGoalVoiceMin:{ type: Number, default: 0 },       // 월 목표 음성 분 (0 = 목표 없음)
  // 📌 내역 기준 시각 — 사이트 원장(/api/xp/ledger)이 이 시각 이전 움직임을 보이지 않는다. 봇은 읽지 않지만 같은 문서라 맞춰 둔다
  ledgerSince: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now },
});
export const BotSetting = mongoose.models.BotSetting || mongoose.model("BotSetting", BotSettingSchema);

// 기간제 XP 부스트 (대상 역할 비면 전체)
const XpBoostSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  targetRoleId: { type: String, default: "" },
  targetRoleName: { type: String, default: "" },
  targetChannelId: { type: String, default: "" },
  targetChannelName: { type: String, default: "" },
  targetChannelType: { type: String, default: "" },
  boostXp: { type: Number, default: 0 },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
export const XpBoost = mongoose.models.XpBoost || mongoose.model("XpBoost", XpBoostSchema);

// XP 지급 로그 (60일 TTL — 월간 랭킹 집계에도 사용)
const XpLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  displayName: { type: String, default: "" },
  amount: { type: Number, default: 0 },
  reason: { type: String, default: "" },   // "chat" | "voice" | "attend" | "effect"(아이템 효과 따로 지급) | "effect-levelup"
  channelId: { type: String, default: "" },
  channelName: { type: String, default: "" },
  // 📌 시즌 패스 가속(아이템 효과 passBoost) — 이 지급과 함께 passBaseXp 를 낮춘 폭(진행도에만 더해진 XP). 없으면 0.
  //    시즌 기준선을 로그로 되짚을 때(seasonStartBaseXp) amount 와 함께 빼야 가속분이 사라지지 않는다
  passBoost: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 60 } },
});
export const XpLog = mongoose.models.XpLog || mongoose.model("XpLog", XpLogSchema);

// ARCTIC 구매 — 역할 상품은 봇이 pending 건을 보고 자동 지급
const PurchaseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  itemId: { type: String, required: true },
  itemRef: { type: String, default: "" }, // 아이템 등록(사이트 models/Item) id 스냅샷 — 봇은 아이템 효과 보유 판정(itemEffects.js)에 읽기만 한다
  itemName: { type: String, default: "" },
  itemType: { type: String, default: "role" },
  roleId: { type: String, default: "" },
  price: { type: Number, default: 0 },
  payMethod: { type: String, default: "xp" },
  paidXp: { type: Number, default: 0 },
  paidPoint: { type: Number, default: 0 },
  billed: { type: Boolean, default: false }, // 지갑에서 실제로 빠졌는지 (models/Purchase.js 와 같은 뜻)
  // 기간제 역할 — days가 0이면 영구. 지나면 이 봇이 회수하고 status를 expired로 바꾼다
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
  // 📌 만료 임박 DM 을 보낸 시각 — 조건부로 세워 한 번만 보낸다. 연장은 새 구매 문서라 연장분은 자기 값으로 따로 알린다
  reminderSentAt: { type: Date, default: null },
  // 📌 연장 구매 — 이어 붙인 원래 구매 _id("" 이면 새 구매) · 연장분이 시작되는 시각(표시용) (models/Purchase.js 와 같아야 한다)
  renewOf: { type: String, default: "" },
  startsAt: { type: Date, default: null },
  // 📌 소모형 아이템(연속 출석 보호막 · 1회 소모권)을 쓴 시각 — 세워지면 보유에서 빠진다(itemEffects.js · 사이트 lib/ownedItems.js).
  //    itemEffects.js consumeOne(attend.js 보호막) · 사이트 관리자 1개 사용이 consumedAt 이 비어 있을 때만 세운다(조건부 — 두 번 쓰지 않게).
  //    consumedBy: 누가 썼는지("bot:<효과 키>" · "admin:<이름>"). models/Purchase.js 와 같아야 한다
  consumedAt: { type: Date, default: null },
  consumedBy: { type: String, default: "" },
  // 📌 주문 묶음 — 한 결제(장바구니 · 수동 지급 한 사람분)의 건들이 같은 값. 1개 단위 상품은 1개가 한 건이라
  //    지급 큐(features/grantQueue.js)가 이 값 + 상품으로 한 번에 완료하고 DM 을 한 통만 보낸다. "" 이면 옛 건. models/Purchase.js 와 같아야 한다
  orderId: { type: String, default: "" },
  // 📌 사이트 보유 — 소유는 그대로 두고 디스코드 역할 표기만 뗀 상태.
  //    시즌이 바뀌면 디스코드가 역할로 지저분해지므로 표기를 사이트로 옮긴다.
  //    만료(expired)와는 다르다 — 물건은 계속 갖고 있고 인벤토리에도 그대로 뜬다.
  siteOnly: { type: Boolean, default: false },
  siteOnlyAt: { type: Date, default: null },
  // 봇이 디스코드 역할을 실제로 뗐는지 (사이트가 표시를 바꾼 시점과 다를 수 있다)
  roleDetached: { type: Boolean, default: false },
  status: { type: String, default: "pending", index: true },
  contact: { type: String, default: "" },
  adminNote: { type: String, default: "" },
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});
export const Purchase = mongoose.models.Purchase || mongoose.model("Purchase", PurchaseSchema);

// XP 지급 대기열 — 코드·초대 보상 등이 쌓이면 봇이 자동 지급
const PayoutSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userId: { type: String, default: "" },
  amount: { type: Number, required: true },
  reason: { type: String, default: "" },
  source: { type: String, default: "etc" },   // referral | code | manual | shop | etc
  status: { type: String, default: "pending" }, // pending | processing(봇이 선점해 지급 중) | paid | failed
  // "xp" | "point" — 빙옥(point) 건은 사이트가 즉시 반영하고 paid 로 남기므로 봇은 집지 않는다 (models/Payout.js 와 동일)
  currency: { type: String, default: "xp" },
  // 📌 "reset" = 관리자 초기화 기록(사이트가 paid 로만 남긴다 — 봇은 집지 않는다) · 처리한 관리자 이름(감사용). 봇은 읽지 않지만 models/Payout.js 와 맞춰 둔다
  kind: { type: String, default: "" },
  by: { type: String, default: "" },
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  paidAt: { type: Date },
});
export const Payout = mongoose.models.Payout || mongoose.model("Payout", PayoutSchema);

// 코드 사용 시 지급할 역할 — 봇이 처리 (코드 자체는 사이트에서 검증)
const CodeGrantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  roleId: { type: String, default: "" },
  code: { type: String, default: "" },
  status: { type: String, default: "pending", index: true },
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});
export const CodeGrant = mongoose.models.CodeGrant || mongoose.model("CodeGrant", CodeGrantSchema);

// 📌 XP·빙옥 입출금 원장(보충분) — XpLog·Payout·Purchase 에 남지 않는 움직임만 (연속 출석 보너스 등).
//    기록은 wallet.js 의 logWallet 으로만. 사이트 models/WalletLog.js 와 같아야 한다
const WalletLogSchema = new mongoose.Schema({
  userId: { type: String, required: true },   // (userId, createdAt) 인덱스의 앞머리로 조회된다
  currency: { type: String, default: "xp" },   // "xp" | "point"(빙옥)
  amount: { type: Number, default: 0 },        // + 들어옴 / - 나감
  // enhance | pass-unlock | pass-point | tier-point | attend-point | streak | quest-point | admin | etc
  kind: { type: String, default: "etc" },
  label: { type: String, default: "" },
  refId: { type: String, default: "" },
  meta: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now, index: true },
});
WalletLogSchema.index({ userId: 1, createdAt: -1 });
export const WalletLog = mongoose.models.WalletLog || mongoose.model("WalletLog", WalletLogSchema);

// 📌 새 멤버 첫 답장 기록 — 아이템 효과 welcomeReply 를 새 멤버(newcomerId)당 답장한 사람(userId)별로 한 번만 주려고 남긴다.
//    unique(newcomerId, userId) 가 잠금이다 — 먼저 넣은 쪽만 지급(features/chatXp.js). 사이트 models/WelcomeReply.js 와 같아야 한다
const WelcomeReplySchema = new mongoose.Schema({
  newcomerId: { type: String, required: true },
  userId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
WelcomeReplySchema.index({ newcomerId: 1, userId: 1 }, { unique: true });
export const WelcomeReply = mongoose.models.WelcomeReply || mongoose.model("WelcomeReply", WelcomeReplySchema);

// 📌 봇 생존 신호 (단일 문서 key:"main") — 관리자 대시보드가 lastSeen 으로 켜짐/꺼짐을 본다. 사이트 models/BotStatus.js 와 같아야 한다
const BotStatusSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },
  lastSeen: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  version: { type: String, default: "" },
  lastError: { type: String, default: "" },
  lastErrorAt: { type: Date, default: null },
});
export const BotStatus = mongoose.models.BotStatus || mongoose.model("BotStatus", BotStatusSchema);

// 📌 시즌 결산 — 시즌당 한 문서(season unique)라 두 번 결산되지 않는다. 사이트 models/SeasonResult.js 와 같아야 한다
const SeasonTopSchema = new mongoose.Schema({
  rank: { type: Number, default: 0 },
  userId: { type: String, default: "" },
  name: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
}, { _id: false });
const SeasonResultSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true },
  name: { type: String, default: "" },
  start: { type: String, default: "" }, // "YYYY-MM-DD" (KST)
  end: { type: String, default: "" },
  settledAt: { type: Date, default: Date.now },
  top: { type: [SeasonTopSchema], default: [] },
  rankerRoleId: { type: String, default: "" },
  roleGrantRequested: { type: Boolean, default: false },
  roleGrantedAt: { type: Date, default: null },
  announcedAt: { type: Date, default: null },
  error: { type: String, default: "" },
});
export const SeasonResult = mongoose.models.SeasonResult || mongoose.model("SeasonResult", SeasonResultSchema);

/* ── 대회 룸 (사이트와 공유) ──────────────────
   ⚠️ 컬렉션 이름은 사이트의 models/Scrim.js 와 반드시 같아야 한다.
   봇은 캘린더를 읽어 미제출자를 찾고, 쌓인 DM 대기열을 보낸다.
   스키마는 필요한 필드만 느슨하게 잡는다 (strict:false) — 사이트가 필드를 늘려도 안 깨지게. */
const loose = { strict: false, versionKey: false };

export const ScrimSeason = mongoose.models.ScrimSeason || mongoose.model("ScrimSeason", new mongoose.Schema({
  // 봇은 시즌 문구를 직접 읽지 않는다 — 보낼 문구는 사이트가 ScrimNudge 에 굳혀서 넣는다
  title: String, startAt: Date, days: Number, dueAt: Date, active: Boolean,
}, loose));

export const ScrimTeam = mongoose.models.ScrimTeam || mongoose.model("ScrimTeam", new mongoose.Schema({
  seasonId: { type: String, index: true },
  name: String,
  members: [{ discordId: String, name: String, pos: String, leader: Boolean }],
}, loose));

export const ScrimAvailability = mongoose.models.ScrimAvailability || mongoose.model("ScrimAvailability", new mongoose.Schema({
  seasonId: { type: String, index: true }, teamId: String, userId: String, slots: [String],
}, loose));

export const ScrimNudge = mongoose.models.ScrimNudge || mongoose.model("ScrimNudge", new mongoose.Schema({
  seasonId: { type: String, index: true },
  teamId: String, teamName: String,
  userId: { type: String, index: true }, userName: String,
  kind: String, type: String, title: String, message: String, footer: String, cta: String, url: String, dueAt: Date,
  fixtureId: String, oppName: String, matchKind: String, at: Date,
  sendAt: Date,
  status: { type: String, index: true }, error: String, byName: String,
  createdAt: { type: Date, default: Date.now, index: true },
  sentAt: Date,
}, loose));

export const connectDb = (uri) => mongoose.connect(uri);
export const disconnectDb = () => mongoose.disconnect();

// MongoDB 중복 키 오류 (원자적 쿨타임/출석 체크에서 "이미 처리됨" 신호로 사용)
export const isDuplicateKeyError = (e) => e?.code === 11000;
