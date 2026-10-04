// ═══════════════════════════════════════════════════════
// 고급 이글루 레벨링 봇 v2
//  · 채팅 / 음성 / 출석 XP — 지급량·쿨타임·주기 모두 대시보드에서 설정
//  · 역할·채널·기간제 부스트, 음소거 정책, 퇴장 시 초기화
//  · /레벨 /랭크 /출석체크 /퀘스트 /인벤토리 /시즌패스 · 레벨업 알림 · 보상 역할 자동 지급 · XP 로그
//  · 출석은 /출석체크 또는 음성 누적 자동 출석 (attend.js) · 레벨 비공개(levelPublic) 동안은 XP 를 주지 않는다
//  · XP 획득 중단(관리자가 사이트에서 세움 — xpStop.js)인 사람은 그 기간 동안 XP · 출석 · 활동 횟수가 멈춘다
//  · 상점 지급 큐 · 만료 임박 DM · 시즌 패스 미수령 DM · 시즌 결산(RANKER) · 사이트 공지 → 공지 채널 · 생존 신호(대시보드 봇 상태)
//  사이트와 동일한 MongoDB 사용 → 웹 레벨 대시보드·랭킹과 실시간 연동
// ═══════════════════════════════════════════════════════
import { Client, GatewayIntentBits, Events } from "discord.js";
import { config, nudgeOnly } from "./config.js";
import { connectDb, disconnectDb } from "./db.js";
import { refreshRoleConfigs, startRoleConfigLoop } from "./roleConfigs.js";
import { refreshItemEffects, startItemEffectLoop } from "./itemEffects.js";
import { refreshChannelConfigs, startChannelConfigLoop } from "./channelConfigs.js";
import { refreshBotSettings, startBotSettingLoop } from "./botSettings.js";
import { refreshXpStops, startXpStopLoop } from "./xpStop.js";
import { registerChatXp } from "./features/chatXp.js";
import { startVoiceTime, flushVoiceTime } from "./features/voiceTime.js";
import { startActivityStats, flushActivity } from "./features/activityStats.js";
import { startAfkCheck } from "./features/afkCheck.js";
import { registerActivity, startActivity, flushLastActive } from "./features/activity.js";
import { registerLeaveReset } from "./features/leaveReset.js";
import { startGrantQueue } from "./features/grantQueue.js";
import { startScrimNudge } from "./features/scrimNudge.js";
import { startHeartbeat, recordBotError } from "./features/heartbeat.js";
import { startExpiryReminder } from "./features/expiryReminder.js";
import { startPassReminder } from "./features/passReminder.js";
import { startScheduledChanges } from "./features/scheduledChanges.js";
import { startSeasonSettle } from "./features/seasonSettle.js";
import { startNoticeAnnounce } from "./features/noticeAnnounce.js";
import { refreshBotMessages, startBotMessageLoop } from "./botMessages.js";
import { registerCommandDefinitions, registerCommandHandlers } from "./commands.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    // 📌 반응 달기 · 받기 퀘스트(features/activityStats.js — raw MESSAGE_REACTION_ADD). 특권 인텐트 아님
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// 재촉 DM 전용 모드에서는 XP·역할을 건드리는 것을 아예 붙이지 않는다
if (!nudgeOnly) {
  registerActivity(client); // 마지막 활동 시각(채팅 · 음성 상태 · 명령 · 버튼) — 음성 XP 로그 ctx.idle 용
  registerChatXp(client);
  registerLeaveReset(client);
  registerCommandHandlers(client);
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ 봇 로그인: ${c.user.tag}`);
  // 생존 신호는 모드와 상관없이 가장 먼저 — 아래 등록 · 설정 로드가 늦어도 대시보드가 켜짐을 본다
  startHeartbeat();

  if (nudgeOnly) {
    console.log("⚙️  재촉 DM 전용 모드 — 레벨링·출석·상점 지급은 켜지 않습니다");
    startScrimNudge(c);
    return;
  }

  // 등록이 실패해도(디스코드 API 장애 · 권한) 설정 로드 · 음성 XP · 지급 큐는 계속 시작한다 — 이미 등록된 명령은 그대로 쓸 수 있다
  try {
    await registerCommandDefinitions(c);
    console.log("✅ 슬래시 커맨드 등록 완료");
  } catch (e) {
    console.error("❌ 슬래시 커맨드 등록 실패 — 나머지는 계속 시작합니다:", e.message);
  }

  // 📌 봇 메시지 디자인도 여기서 먼저 읽는다 — 지급 큐 · 레벨업이 첫 메시지부터 저장된 디자인으로 나가게
  //    📌 XP 획득 중단(관리자 — xpStop.js)도 같이 읽는다 — 첫 지급부터 막히게
  await Promise.all([refreshRoleConfigs(), refreshItemEffects(), refreshChannelConfigs(), refreshBotSettings(), refreshBotMessages(), refreshXpStops()]);
  startRoleConfigLoop();
  startItemEffectLoop(); // 보유 아이템 효과 — 아이템 등록 · 구매 변경을 1분 주기로 반영
  startChannelConfigLoop();
  startBotSettingLoop();
  startXpStopLoop(); // XP 획득 중단 — 끝나지 않은 중단을 1분 주기로 다시 읽는다
  startBotMessageLoop(c); // 봇 메시지 디자인 1분 주기 갱신 + 관리자 테스트 발송
  console.log("✅ 설정 로드 완료 — 역할·아이템 효과·채널·기본 정책·봇 메시지·XP 획득 중단 (1분 주기 갱신)");

  startActivity(c); // 마지막 활동 시각 — 적어 둔 값을 읽어 재시작 뒤에도 무활동을 이어 세고, 음성에 있는 사람 것만 20초마다 기록
  startVoiceTime(c); // 음성 시간 · 음성 XP — 사람마다 실제 접속 초(들어옴 · 나감 · 옮김 · 마이크 변경), 5분 채우면 1회분 · 못 채우고 나가면 머문 만큼, 20초마다 기록
  startAfkCheck(c); // 잠수 확인 — 음성 채널에 혼자 1시간이면 [확인] 버튼, 이후 20~60분 무작위, 5분 안에 안 누르면 잠수 채널로(관리자 · 서포터즈 제외)
  startActivityStats(c); // 퀘스트용 활동 횟수 — 메시지 · 답장 · 멘션 · 반응 · 스레드 · 스티커 · 명령어 · 음성 입장 · 레벨 업, 20초마다 기록
  startGrantQueue(c);
  startExpiryReminder(c); // 기간제 만료 임박 DM (10분 주기)
  startPassReminder(c); // 시즌 종료 D-7 · D-1 안 받은 시즌 패스 보상 DM (10분 주기)
  startScheduledChanges(); // 예약 변경 — 정한 시각에 설정 · 아이템 값 바꾸기 (1분 주기)
  startSeasonSettle(c); // 끝난 시즌 결산 · RANKER (5분 주기)
  startNoticeAnnounce(c); // 사이트 공지 → 공지 채널 (20초 주기, 대기열 NoticeAnnounce)
  startScrimNudge(c);
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
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} 수신 — 종료 중…`);
  // 📌 밀린 음성 시간 · 활동 횟수 · 마지막 활동 시각(최대 20초)을 마저 쓴다 — 음성 XP 는 주지 않고 진행 중 · 닫힌 바퀴를 DB 에 적어 다음 기동 때 준다. 오래 걸리면 5초에서 끊는다. Railway 는 기본이 SIGTERM 뒤 곧바로 SIGKILL 이라 못 마칠 수 있다(features/voiceTime.js)
  await Promise.race([Promise.all([flushVoiceTime({ final: true }), flushActivity(), flushLastActive({ final: true })]), new Promise((r) => setTimeout(r, 5000))]).catch(() => {});
  client.destroy();
  await disconnectDb().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// 처리되지 않은 오류는 대시보드에서도 보이게 BotStatus.lastError 에 남긴다
process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e);
  recordBotError(e);
});
process.on("uncaughtException", (e) => {
  console.error("uncaughtException:", e);
  recordBotError(e);
});
