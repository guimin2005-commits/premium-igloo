// ── 마지막 활동 시각 (봇 메모리) ──────────────────
//    📌 "활동" = 서버 안 채팅(messageCreate) · 음성 상태 바뀜(마이크 · 헤드셋 · 화면 공유 · 캠 · 채널 입장/이동) · 슬래시 명령 · 버튼(interactionCreate).
//       음성 XP 로그의 ctx.idle(마지막 활동 뒤 지난 분)에 쓴다(features/voiceXp.js). DB 에는 남기지 않는다.
//    📌 기록이 없으면 봇이 켜진 시각부터 센다 — 재시작 직후에는 모두 "방금 활동"으로 시작한다.
//       음성에서 나가면 지운다(다시 들어오는 것 자체가 활동이라 그때 새로 찍힌다).
import { Events } from "discord.js";
import { config } from "../config.js";

const bootAt = Date.now();
const lastAt = new Map(); // userId → 마지막 활동 ms

function mark(userId, at = Date.now()) {
  if (userId) lastAt.set(userId, at);
}

// 마지막 활동 뒤 지난 분 (기록이 없으면 봇이 켜진 시각부터)
export function idleMinutes(userId, now = Date.now()) {
  const at = lastAt.get(userId) ?? bootAt;
  return Math.max(0, Math.floor((now - at) / 60000));
}

// 음성 상태 중 "본인이 바꾼 것"만 활동으로 본다 — 서버 음소거 · 서버 헤드셋(운영진 조작)은 제외
const VOICE_KEYS = ["channelId", "selfMute", "selfDeaf", "streaming", "selfVideo"];

export function registerActivity(client) {
  client.on(Events.MessageCreate, (message) => {
    if (message.author?.bot || message.guild?.id !== config.guildId) return;
    mark(message.author.id);
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.guild?.id !== config.guildId) return;
    const userId = newState.id;
    if (!userId || newState.member?.user?.bot) return;
    if (!newState.channelId) {
      lastAt.delete(userId); // 음성에서 나감
      return;
    }
    if (VOICE_KEYS.some((k) => oldState[k] !== newState[k])) mark(userId);
  });

  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.user?.bot || interaction.guildId !== config.guildId) return;
    if (!interaction.isCommand() && !interaction.isMessageComponent()) return;
    mark(interaction.user.id);
  });
}
