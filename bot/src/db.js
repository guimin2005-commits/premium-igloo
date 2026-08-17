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

  // 사이트에서 XP·레벨을 바꿨을 때 레벨 역할을 다시 맞추도록 세우는 표시
  needsRoleSync: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});
export const UserXp = mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);

// 관리자 대시보드(/admin/bot)에서 관리하는 역할 설정
const RoleConfigSchema = new mongoose.Schema({
  roleId: { type: String, required: true, unique: true },
  roleName: { type: String, default: "" },
  rewardLevel: { type: Number, default: null }, // 이 레벨 도달 시 자동 지급
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
  muteMode: { type: String, default: "reduce" },  // "off" | "reduce" | "block"
  muteReducePct: { type: Number, default: 90 },
  muteTarget: { type: String, default: "both" },  // "both" | "any"
  resetOnLeave: { type: Boolean, default: false },
  levelupChannelId: { type: String, default: "" },
  levelupMessage: { type: String, default: "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!" },
  roleGrantChannelId: { type: String, default: "" },
  roleGrantMessage: { type: String, default: "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})" },
  roleGrantEnabled: { type: Boolean, default: true },
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
  // 기간제 역할 — days가 0이면 영구. 지나면 이 봇이 회수하고 status를 expired로 바꾼다
  days: { type: Number, default: 0 },
  expiresAt: { type: Date, default: null, index: true },
  revokedAt: { type: Date, default: null },
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
  title: String, startAt: Date, days: Number, dueAt: Date, active: Boolean,
  nudge: {
    enabled: Boolean, everyHours: Number, quietFrom: Number, quietTo: Number, message: String,
  },
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
  kind: String, message: String, url: String,
  status: { type: String, index: true }, error: String, byName: String,
  createdAt: { type: Date, default: Date.now, index: true },
  sentAt: Date,
}, loose));

export const connectDb = (uri) => mongoose.connect(uri);
export const disconnectDb = () => mongoose.disconnect();

// MongoDB 중복 키 오류 (원자적 쿨타임/출석 체크에서 "이미 처리됨" 신호로 사용)
export const isDuplicateKeyError = (e) => e?.code === 11000;
