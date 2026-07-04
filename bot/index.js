// ═══════════════════════════════════════════════════════
// 고급 이글루 레벨링 봇 — Stage 1
//  · 채팅 XP (200 XP / 쿨타임 1분)
//  · 음성 XP (5분마다 3,000 / 내전 채널 3,500 + 레벨 구간 보너스)
//    - 음소거 시 90% 감소, 잠수(AFK) 채널 제외
//  · /출석체크 (7,000 XP, 1일 1회, KST 기준)
//  · /레벨 /랭크 조회
//  · 레벨업 알림
//  사이트와 동일한 MongoDB를 사용 → 웹 XP SHOP·랭킹과 실시간 연동
// ═══════════════════════════════════════════════════════

import "dotenv/config";
import { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import mongoose from "mongoose";

// ── 환경 변수 ──────────────────────────────
const {
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  MONGODB_URI,
  LEVELUP_CHANNEL_ID,      // 레벨업 알림 채널 (선택)
  SCRIM_CHANNEL_IDS,       // 내전 음성 채널 ID들 (쉼표 구분, 선택)
  XP_BOOST_ROLE_ID,        // [XP] Boost+ 역할 (선택, +300)
  S1_BOOST_ROLE_ID,        // [XP] S1 Boost+ 역할 (선택, +100)
  EVENT_BONUS_XP,          // 이벤트 추가 XP (선택, 예: 200)
  ATTEND_BOOST_ROLE_ID,    // [XP] 출석 Boost 역할 (선택, 출석 +7,000)
  PENGUIN_CHILD_ROLE_ID,   // 어린이 펭귄 (+250)
  PENGUIN_YOUTH_ROLE_ID,   // 청소년 펭귄 (+350)
  PENGUIN_ADULT_ROLE_ID,   // 어른 펭귄 (+450)
  PENGUIN_MOTHER_ROLE_ID,  // 어미 펭귄 (+550)
} = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_GUILD_ID || !MONGODB_URI) {
  console.error("❌ DISCORD_BOT_TOKEN / DISCORD_GUILD_ID / MONGODB_URI 환경변수가 필요합니다.");
  process.exit(1);
}

const scrimChannelIds = new Set((SCRIM_CHANNEL_IDS || "").split(",").map((s) => s.trim()).filter(Boolean));

// ── 레벨 공식 (사이트 시뮬레이터와 동일) ──────
const getCumulativeXpByLevel = (lvl) => {
  if (lvl <= 0) return 0;
  return Math.floor(((23 * lvl) ** 2 - 525) / 5) + 1;
};

const getLevelByXp = (xp) => {
  if (xp <= 0) return 0;
  for (let l = 1; l <= 1000; l++) {
    if (xp < getCumulativeXpByLevel(l)) return l - 1;
  }
  return 1000;
};

// 레벨 구간별 음성/내전 추가 XP (사이트 정책과 동일)
const getLevelBonusXp = (level) => {
  if (level >= 700) return 6000 - 3000 + 0; // 최고 구간: 총 +6,000 기준 → 아래 표로 대체
  return 0;
};

const VOICE_BRACKET_BONUS = [
  [700, 3000], [649, 2000], [600, 1800], [550, 1600], [500, 1400],
  [450, 1200], [400, 1000], [350, 800], [300, 700], [250, 600],
  [200, 500], [150, 350], [100, 250], [50, 150], [0, 0],
];
// ⚠️ 위 표는 사이트 "레벨 구간별 추가 기준"(+3,000 → +6,000 총량)에서 기본 3,000을 뺀 순수 추가분입니다.
const getVoiceBracketBonus = (level) => {
  for (const [minLv, bonus] of VOICE_BRACKET_BONUS) {
    if (level >= minLv) return bonus;
  }
  return 0;
};

// ── DB 모델 (사이트와 공유되는 컬렉션) ─────────
const UserXpSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  username: { type: String, default: "" },
  displayName: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastChatXpAt: { type: Date, default: null },
  lastAttendDate: { type: String, default: "" }, // "2026-07-05" (KST)
  attendCount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});
const UserXp = mongoose.models.UserXp || mongoose.model("UserXp", UserXpSchema);

// ── 유틸 ──────────────────────────────────
const kstToday = () => {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
};

// 역할 기반 버프 합산 (채팅/음성 공통 추가분)
const getBuffXp = (member) => {
  let buff = 0;
  const has = (id) => id && member.roles.cache.has(id);
  if (has(XP_BOOST_ROLE_ID)) buff += 300;
  if (has(S1_BOOST_ROLE_ID)) buff += 100;
  if (has(PENGUIN_CHILD_ROLE_ID)) buff += 250;
  if (has(PENGUIN_YOUTH_ROLE_ID)) buff += 350;
  if (has(PENGUIN_ADULT_ROLE_ID)) buff += 450;
  if (has(PENGUIN_MOTHER_ROLE_ID)) buff += 550;
  buff += parseInt(EVENT_BONUS_XP || "0", 10) || 0;
  return buff;
};

// XP 지급 + 레벨업 감지
async function grantXp(member, amount, reason) {
  const doc = await UserXp.findOneAndUpdate(
    { userId: member.id },
    {
      $inc: { xp: amount },
      $set: { username: member.user.username, displayName: member.displayName, updatedAt: new Date() },
    },
    { upsert: true, new: true }
  );

  const newLevel = getLevelByXp(doc.xp);
  if (newLevel !== doc.level) {
    const oldLevel = doc.level;
    doc.level = newLevel;
    await doc.save();

    if (newLevel > oldLevel && LEVELUP_CHANNEL_ID) {
      const channel = member.guild.channels.cache.get(LEVELUP_CHANNEL_ID);
      if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xe91e3f)
          .setDescription(`🎉 <@${member.id}> 님이 **Lv.${newLevel}** 에 도달했습니다!`)
          .setFooter({ text: "고급 이글루 · SYSTEM : LEVEL" });
        channel.send({ embeds: [embed] }).catch(() => {});
      }
    }
  }
  return doc;
}

// ── 클라이언트 ─────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── 채팅 XP (200 XP / 쿨타임 1분) ────────────
const CHAT_XP = 200;
const CHAT_COOLDOWN_MS = 60 * 1000;

client.on(Events.MessageCreate, async (message) => {
  try {
    if (message.author.bot || !message.guild || message.guild.id !== DISCORD_GUILD_ID) return;

    const doc = await UserXp.findOne({ userId: message.author.id });
    if (doc?.lastChatXpAt && Date.now() - doc.lastChatXpAt.getTime() < CHAT_COOLDOWN_MS) return;

    await UserXp.updateOne(
      { userId: message.author.id },
      { $set: { lastChatXpAt: new Date() } },
      { upsert: true }
    );

    const buff = getBuffXp(message.member);
    await grantXp(message.member, CHAT_XP + buff, "chat");
  } catch (e) {
    console.error("채팅 XP 오류:", e.message);
  }
});

// ── 음성 XP (5분 주기 지급) ──────────────────
const VOICE_INTERVAL_MS = 5 * 60 * 1000;
const VOICE_BASE = 3000;
const SCRIM_BASE = 3500;

async function voiceXpTick() {
  try {
    const guild = client.guilds.cache.get(DISCORD_GUILD_ID);
    if (!guild) return;

    const afkChannelId = guild.afkChannelId;

    for (const [, voiceState] of guild.voiceStates.cache) {
      const member = voiceState.member;
      const channel = voiceState.channel;
      if (!member || member.user.bot || !channel) continue;
      if (channel.id === afkChannelId) continue; // 잠수 채널 제외

      const base = scrimChannelIds.has(channel.id) ? SCRIM_BASE : VOICE_BASE;
      const doc = await UserXp.findOne({ userId: member.id });
      const bracketBonus = getVoiceBracketBonus(doc?.level || 0);
      const buff = getBuffXp(member);

      let amount = base + bracketBonus + buff;

      // 마이크 & 헤드셋 음소거 시 90% 감소
      if (voiceState.selfMute && voiceState.selfDeaf) amount = Math.floor(amount * 0.1);

      await grantXp(member, amount, "voice");
    }
  } catch (e) {
    console.error("음성 XP 오류:", e.message);
  }
}

// ── 슬래시 커맨드 ────────────────────────────
const commands = [
  new SlashCommandBuilder().setName("출석체크").setDescription("일일 출석체크로 7,000 XP를 받습니다."),
  new SlashCommandBuilder().setName("레벨").setDescription("다음 레벨까지 필요한 XP를 확인합니다."),
  new SlashCommandBuilder().setName("랭크").setDescription("내 XP, 레벨, 서버 내 순위를 확인합니다."),
].map((c) => c.toJSON());

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    // /출석체크
    if (interaction.commandName === "출석체크") {
      const today = kstToday();
      const doc = await UserXp.findOne({ userId: interaction.user.id });

      if (doc?.lastAttendDate === today) {
        return interaction.reply({ content: "⛔ 오늘은 이미 출석체크를 완료했습니다. 내일 다시 만나요!", ephemeral: true });
      }

      let amount = 7000;
      if (ATTEND_BOOST_ROLE_ID && interaction.member.roles.cache.has(ATTEND_BOOST_ROLE_ID)) amount += 7000;

      await UserXp.updateOne(
        { userId: interaction.user.id },
        { $set: { lastAttendDate: today }, $inc: { attendCount: 1 } },
        { upsert: true }
      );
      const updated = await grantXp(interaction.member, amount, "attend");

      const embed = new EmbedBuilder()
        .setColor(0xe91e3f)
        .setTitle("✅ 출석체크 완료!")
        .setDescription(`**+${amount.toLocaleString()} XP** 지급되었습니다.\n현재 누적 XP: **${updated.xp.toLocaleString()}** · Lv.**${updated.level}**`)
        .setFooter({ text: `누적 출석 ${(updated.attendCount || 0)}회 · 고급 이글루` });
      return interaction.reply({ embeds: [embed] });
    }

    // /레벨
    if (interaction.commandName === "레벨") {
      const doc = await UserXp.findOne({ userId: interaction.user.id });
      const xp = doc?.xp || 0;
      const level = doc?.level || 0;
      const nextCum = getCumulativeXpByLevel(level + 1);
      const need = Math.max(0, nextCum - xp);

      const embed = new EmbedBuilder()
        .setColor(0xe91e3f)
        .setTitle(`📊 ${interaction.member.displayName} 님의 레벨`)
        .addFields(
          { name: "현재 레벨", value: `Lv.${level}`, inline: true },
          { name: "누적 XP", value: xp.toLocaleString(), inline: true },
          { name: `Lv.${level + 1}까지`, value: `${need.toLocaleString()} XP`, inline: true },
        )
        .setFooter({ text: "고급 이글루 · SYSTEM : LEVEL" });
      return interaction.reply({ embeds: [embed] });
    }

    // /랭크
    if (interaction.commandName === "랭크") {
      const doc = await UserXp.findOne({ userId: interaction.user.id });
      const xp = doc?.xp || 0;
      const rank = (await UserXp.countDocuments({ xp: { $gt: xp } })) + 1;
      const total = await UserXp.countDocuments();

      const embed = new EmbedBuilder()
        .setColor(0xe91e3f)
        .setTitle(`🏆 ${interaction.member.displayName} 님의 랭크`)
        .addFields(
          { name: "서버 순위", value: `#${rank} / ${total}`, inline: true },
          { name: "레벨", value: `Lv.${doc?.level || 0}`, inline: true },
          { name: "누적 XP", value: xp.toLocaleString(), inline: true },
        )
        .setFooter({ text: "고급 이글루 · SYSTEM : LEVEL" });
      return interaction.reply({ embeds: [embed] });
    }
  } catch (e) {
    console.error("커맨드 오류:", e.message);
    if (!interaction.replied) {
      interaction.reply({ content: "⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", ephemeral: true }).catch(() => {});
    }
  }
});

// ── 시작 ──────────────────────────────────
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ 봇 로그인: ${c.user.tag}`);

  // 슬래시 커맨드 등록 (길드 전용 — 즉시 반영)
  const rest = new REST().setToken(DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(c.user.id, DISCORD_GUILD_ID), { body: commands });
  console.log("✅ 슬래시 커맨드 등록 완료");

  // 음성 XP 루프 시작
  setInterval(voiceXpTick, VOICE_INTERVAL_MS);
  console.log("✅ 음성 XP 루프 시작 (5분 주기)");
});

// ── 부팅 ──────────────────────────────────
(async () => {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ MongoDB 연결 완료");
  await client.login(DISCORD_BOT_TOKEN);
})();

// 예기치 못한 오류로 죽지 않도록
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));
