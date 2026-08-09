// ── 슬래시 커맨드 정의 + 핸들러 ────────────────
import { Events, REST, Routes, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { UserXp, isDuplicateKeyError } from "./db.js";
import { getCumulativeXpByLevel, kstToday } from "./leveling.js";
import { getAttendBuffXp } from "./roleConfigs.js";
import { grantXp, EMBED_COLOR, EMBED_FOOTER } from "./xp.js";
import { config, policy } from "./config.js";

const definitions = [
  new SlashCommandBuilder().setName("출석체크").setDescription(`일일 출석체크로 ${policy.attendXp.toLocaleString()} XP를 받습니다.`),
  new SlashCommandBuilder().setName("레벨").setDescription("다음 레벨까지 필요한 XP를 확인합니다."),
  new SlashCommandBuilder().setName("랭크").setDescription("내 XP, 레벨, 서버 내 순위를 확인합니다."),
].map((c) => c.toJSON());

// 길드 전용 등록 — 즉시 반영
export async function registerCommandDefinitions(client) {
  const rest = new REST().setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: definitions });
}

// /출석체크 — 오늘 미출석인 경우에만 매치되는 원자적 갱신 (중복 수령 방지)
async function handleAttend(interaction) {
  const today = kstToday();
  try {
    const res = await UserXp.updateOne(
      { userId: interaction.user.id, lastAttendDate: { $ne: today } },
      { $set: { lastAttendDate: today }, $inc: { attendCount: 1 } },
      { upsert: true }
    );
    if (res.matchedCount === 0 && !res.upsertedCount) {
      return interaction.reply({ content: "⛔ 오늘은 이미 출석체크를 완료했습니다. 내일 다시 만나요!", flags: MessageFlags.Ephemeral });
    }
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      return interaction.reply({ content: "⛔ 오늘은 이미 출석체크를 완료했습니다. 내일 다시 만나요!", flags: MessageFlags.Ephemeral });
    }
    throw e;
  }

  let amount = policy.attendXp;
  if (config.attendBoostRoleId && interaction.member.roles.cache.has(config.attendBoostRoleId)) {
    amount += policy.attendBoostXp;
  }
  amount += getAttendBuffXp(interaction.member);

  const updated = await grantXp(interaction.member, amount);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("✅ 출석체크 완료!")
    .setDescription(`**+${amount.toLocaleString()} XP** 지급되었습니다.\n현재 누적 XP: **${updated.xp.toLocaleString()}** · Lv.**${updated.level}**`)
    .setFooter({ text: `누적 출석 ${updated.attendCount || 0}회 · 고급 이글루` });
  return interaction.reply({ embeds: [embed] });
}

async function handleLevel(interaction) {
  const doc = await UserXp.findOne({ userId: interaction.user.id }).lean();
  const xp = doc?.xp || 0;
  const level = doc?.level || 0;
  const need = Math.max(0, getCumulativeXpByLevel(level + 1) - xp);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`📊 ${interaction.member.displayName} 님의 레벨`)
    .addFields(
      { name: "현재 레벨", value: `Lv.${level}`, inline: true },
      { name: "누적 XP", value: xp.toLocaleString(), inline: true },
      { name: `Lv.${level + 1}까지`, value: `${need.toLocaleString()} XP`, inline: true },
    )
    .setFooter({ text: EMBED_FOOTER });
  return interaction.reply({ embeds: [embed] });
}

async function handleRank(interaction) {
  const doc = await UserXp.findOne({ userId: interaction.user.id }).lean();
  const xp = doc?.xp || 0;
  const [above, total] = await Promise.all([
    UserXp.countDocuments({ xp: { $gt: xp } }),
    UserXp.countDocuments(),
  ]);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`🏆 ${interaction.member.displayName} 님의 랭크`)
    .addFields(
      { name: "서버 순위", value: `#${above + 1} / ${total}`, inline: true },
      { name: "레벨", value: `Lv.${doc?.level || 0}`, inline: true },
      { name: "누적 XP", value: xp.toLocaleString(), inline: true },
    )
    .setFooter({ text: EMBED_FOOTER });
  return interaction.reply({ embeds: [embed] });
}

const handlers = {
  출석체크: handleAttend,
  레벨: handleLevel,
  랭크: handleRank,
};

export function registerCommandHandlers(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const handler = handlers[interaction.commandName];
    if (!handler) return;

    try {
      await handler(interaction);
    } catch (e) {
      console.error(`커맨드 오류 (/${interaction.commandName}):`, e.message);
      if (!interaction.replied) {
        interaction.reply({ content: "⚠️ 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}
