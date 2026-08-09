// ═══════════════════════════════════════════════════════
// 고급 이글루 레벨링 봇 v2
//  · 채팅 XP (200 XP / 쿨타임 1분)
//  · 음성 XP (5분마다 3,000 / 내전 채널 3,500 + 레벨 구간 보너스)
//    - 음소거 시 90% 감소, 잠수(AFK) 채널 제외
//  · /출석체크 (7,000 XP, 1일 1회, KST 기준)
//  · /레벨 /랭크 조회 · 레벨업 알림 · 보상 역할 자동 지급
//  사이트와 동일한 MongoDB 사용 → 웹 XP SHOP·랭킹과 실시간 연동
// ═══════════════════════════════════════════════════════
import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { refreshRoleConfigs, startRoleConfigLoop } from "./roleConfigs.js";
import { registerChatXp } from "./features/chatXp.js";
import { startVoiceXpLoop } from "./features/voiceXp.js";
import { registerCommandDefinitions, registerCommandHandlers } from "./commands.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

registerChatXp(client);
registerCommandHandlers(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ 봇 로그인: ${c.user.tag}`);

  await registerCommandDefinitions(c);
  console.log("✅ 슬래시 커맨드 등록 완료");

  await refreshRoleConfigs();
  startRoleConfigLoop();
  console.log("✅ 역할 설정 로드 완료 (1분 주기 갱신)");

  startVoiceXpLoop(c);
  console.log("✅ 음성 XP 루프 시작 (5분 주기)");
});

// ── 부팅 ──────────────────────────────────
(async () => {
  try {
    await connectDb(config.mongoUri);
    console.log("✅ MongoDB 연결 완료");
    await client.login(config.token);
  } catch (e) {
    console.error("❌ 부팅 실패:", e.message);
    process.exit(1);
  }
})();

// ── 종료·오류 처리 ─────────────────────────
const shutdown = async (signal) => {
  console.log(`\n${signal} 수신 — 종료 중…`);
  client.destroy();
  await disconnectDb().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
