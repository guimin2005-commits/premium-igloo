// ── 환경 변수 로드·검증 ─────────────────────
import "dotenv/config";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "MONGODB_URI"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`❌ 환경변수 누락: ${missing.join(", ")}`);
  process.exit(1);
}


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
  // 📌 2026-10-04 "옛 장치를 지우고, 가산은 관리 화면(역할 버프·부스트)으로만 함" — 환경 변수로 XP 를 더하던 옛 값
  //    (EVENT_BONUS_XP · XP_BOOST/S1_BOOST/PENGUIN_*_ROLE_ID 역할 버프)과 쓰이지 않던 출석 Boost(ATTEND_BOOST_ROLE_ID · attendBoostXp)는 없앴다
};

// ── XP 정책 (사이트 SYSTEM:LEVEL 시뮬레이터와 동일) ──
export const policy = {
  chatXp: 200,
  chatCooldownMs: 60 * 1000,

  voiceIntervalMs: 5 * 60 * 1000,
  voiceBaseXp: 3000,
  mutedMultiplier: 0.1, // 마이크+헤드셋 음소거 시 90% 감소

  attendXp: 7000,
};
