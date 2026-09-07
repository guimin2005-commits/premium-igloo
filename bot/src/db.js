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
  // POINT 관련 — 봇은 쓰지 않지만 upsert 로 문서를 만들 때 default 가 필요하다
  point: { type: Number, default: 0 },
  pointTierPaid: { type: Number, default: 0 },
  // 누적 음성 참여 시간(초) — 시즌 무관 통산 기록 (VOICE_TIME_START 이후부터 적립)
  voiceSeconds: { type: Number, default: 0 },
  // 오늘(KST) 음성 누적 분 — 출석 자동 지급 판정용
  voiceTodayMin: { type: Number, default: 0 },
  voiceTodayDate: { type: String, default: "" },

  // 사이트에서 XP·레벨을 바꿨을 때 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },

  // 📌 시즌 패스 — 봇은 읽지 않지만 사이트와 같은 문서라 스키마를 맞춰 둔다.
  //    빠지면 봇의 upsert 가 문서를 만들 때 사이트가 기대하는 기본값이 없어진다.
  //    (models/UserXp.js 와 이름·기본값이 반드시 같아야 한다)
  passSeason: { type: Number, default: 0 },        // SEASON.number 와 다르면 새 시즌 — 사이트가 진행도를 다시 스냅샷한다
  passBaseXp: { type: Number, default: 0 },        // 시즌 시작 시점의 누적 XP (진행도 = xp - passBaseXp)
  passUnlocked: { type: Boolean, default: false }, // 프리미엄 트랙 해금 여부 (시즌마다 초기화)
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

// 대시보드에서 관리하는 XP 기본 정책 (단일 문서 key:"main")
const BotSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },
  chatXp: { type: Number, default: 200 },
  chatCooldownSec: { type: Number, default: 60 },
  voiceXp: { type: Number, default: 3000 },
  voiceIntervalSec: { type: Number, default: 300 },
  attendXp: { type: Number, default: 7000 },
  // 출석 인정 기준(음성 누적 분) — 자동 출석 지급이 이 값을 읽는다.
  // 스키마에 없으면 strict 모드에서 조용히 버려져 관리자가 바꿔도 60으로 굳는다.
  attendVoiceMin: { type: Number, default: 60 },
  attendPoint: { type: Number, default: 0 },      // 출석 1회 POINT
  attendPassPoint: { type: Number, default: 0 },  // 출석 1회 패스 포인트
  // 봇은 안 쓰지만 사이트와 같은 문서라 빠지면 저장 때 날아갈 수 있다
  shopPublic: { type: Boolean, default: false },
  levelPublic: { type: Boolean, default: false }, // SYSTEM : LEVEL 공개 (봇은 읽지 않지만 스키마 동기화)
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
  reason: { type: String, default: "" },   // "chat" | "voice" | "attend"
  channelId: { type: String, default: "" },
  channelName: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 60 } },
});
export const XpLog = mongoose.models.XpLog || mongoose.model("XpLog", XpLogSchema);

// ARCTIC 구매 — 역할 상품은 봇이 pending 건을 보고 자동 지급
const PurchaseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  userName: { type: String, default: "" },
  itemId: { type: String, required: true },
  itemName: { type: String, default: "" },
  itemType: { type: String, default: "role" },
  roleId: { type: String, default: "" },
  price: { type: Number, default: 0 },
  payMethod: { type: String, default: "xp" },
  paidXp: { type: Number, default: 0 },
  paidPoint: { type: Number, default: 0 },
  // 기간제 역할 — days가 0이면 영구. 지나면 이 봇이 회수하고 status를 expired로 바꾼다
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
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
  status: { type: String, default: "pending" }, // pending | paid | failed
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
