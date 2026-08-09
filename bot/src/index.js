// ═══════════════════════════════════════════════════════
// 고급 이글루 레벨링 봇 v2
//  · 채팅 / 음성 / 출석 XP — 지급량·쿨타임·주기 모두 대시보드에서 설정
//  · 역할·채널·기간제 부스트, 음소거 정책, 퇴장 시 초기화
//  · /출석체크 /레벨 /랭크 · 레벨업 알림 · 보상 역할 자동 지급 · XP 로그
//  사이트와 동일한 MongoDB 사용 → 웹 레벨 대시보드·랭킹과 실시간 연동
// ═══════════════════════════════════════════════════════
import { Client, GatewayIntentBits, Events } from "discord.js";
import { config } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { refreshRoleConfigs, startRoleConfigLoop } from "./roleConfigs.js";
import { refreshChannelConfigs, startChannelConfigLoop } from "./channelConfigs.js";
import { refreshBotSettings, startBotSettingLoop } from "./botSettings.js";
import { registerChatXp } from "./features/chatXp.js";
import { startVoiceXpLoop } from "./features/voiceXp.js";
import { registerLeaveReset } from "./features/leaveReset.js";
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
registerLeaveReset(client);
registerCommandHandlers(client);

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ 봇 로그인: ${c.user.tag}`);

  await registerCommandDefinitions(c);
  console.log("✅ 슬래시 커맨드 등록 완료");

  await Promise.all([refreshRoleConfigs(), refreshChannelConfigs(), refreshBotSettings()]);
  startRoleConfigLoop();
  startChannelConfigLoop();
  startBotSettingLoop();
  console.log("✅ 설정 로드 완료 — 역할·채널·기본 정책 (1분 주기 갱신)");

  startVoiceXpLoop(c);
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
