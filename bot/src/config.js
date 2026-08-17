// ── 환경 변수 로드·검증 ─────────────────────
import "dotenv/config";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "MONGODB_URI"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ 환경변수 누락: ${missing.join(", ")}`);
  process.exit(1);
}

const csv = (v) => new Set((v || "").split(",").map((s) => s.trim()).filter(Boolean));

/* 📌 재촉 DM 전용 모드
   레벨링·상점 처리는 켜지 않고 캘린더 재촉 DM 만 보낸다.
   `npm run start:nudge` 로 켠다 — 다른 곳에서 봇이 돌고 있어도 XP 가 두 번 지급되지 않는다. */
export const nudgeOnly =
  process.argv.includes("--nudge-only") || process.env.BOT_ONLY === "nudge";

export const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,
  mongoUri: process.env.MONGODB_URI,

  levelupChannelId: process.env.LEVELUP_CHANNEL_ID || null,
  scrimChannelIds: csv(process.env.SCRIM_CHANNEL_IDS),
  eventBonusXp: parseInt(process.env.EVENT_BONUS_XP || "0", 10) || 0,

  // env 기반 역할 버프 (하위 호환 — 대시보드 RoleConfig가 우선)
  legacyRoleBuffs: [
    { id: process.env.XP_BOOST_ROLE_ID, buff: 300 },
    { id: process.env.S1_BOOST_ROLE_ID, buff: 100 },
    { id: process.env.PENGUIN_CHILD_ROLE_ID, buff: 250 },
    { id: process.env.PENGUIN_YOUTH_ROLE_ID, buff: 350 },
    { id: process.env.PENGUIN_ADULT_ROLE_ID, buff: 450 },
    { id: process.env.PENGUIN_MOTHER_ROLE_ID, buff: 550 },
  ].filter((r) => r.id),
  attendBoostRoleId: process.env.ATTEND_BOOST_ROLE_ID || null,
};

// ── XP 정책 (사이트 SYSTEM:LEVEL 시뮬레이터와 동일) ──
export const policy = {
  chatXp: 200,
  chatCooldownMs: 60 * 1000,

  voiceIntervalMs: 5 * 60 * 1000,
  voiceBaseXp: 3000,
  scrimBaseXp: 3500,
  mutedMultiplier: 0.1, // 마이크+헤드셋 음소거 시 90% 감소

  attendXp: 7000,
  attendBoostXp: 7000, // 출석 Boost 역할 보유 시 추가
};
