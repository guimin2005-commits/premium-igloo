// ── 슬래시 커맨드 정의 + 핸들러 ────────────────
import { Events, REST, Routes, SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import { UserXp } from "./db.js";
import { getCumulativeXpByLevel, kstToday } from "./leveling.js";
import { grantXp, EMBED_COLOR, EMBED_FOOTER } from "./xp.js";
import { config } from "./config.js";
import { getSettings } from "./botSettings.js";
import { getAttendBuffXp } from "./roleConfigs.js";
import { getAttendEffectXp } from "./itemEffects.js";

const definitions = [
  new SlashCommandBuilder().setName("레벨").setDescription("다음 레벨까지 필요한 XP를 확인합니다."),
  new SlashCommandBuilder().setName("랭크").setDescription("내 XP, 레벨, 서버 내 순위를 확인합니다."),
  new SlashCommandBuilder().setName("출석체크").setDescription("오늘 출석을 체크합니다. 하루 한 번 받을 수 있습니다."),
].map((c) => c.toJSON());

// 길드 전용 등록 — 즉시 반영
export async function registerCommandDefinitions(client) {
  const rest = new REST().setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), { body: definitions });
}

// 📌 출석 — 받는 길이 둘이다: 이 /출석체크 명령어, 그리고 음성 채널 누적 N분 자동 출석(features/voiceXp.js).
//    둘 다 같은 자물쇠(lastAttendDate)를 조건부로 세우므로 합쳐서 하루(KST) 한 번만 지급된다.
async function handleAttend(interaction) {
  const s = getSettings();
  const today = kstToday();
  const userId = interaction.user.id;

  // 문서가 없는 유저(아직 XP 를 한 번도 못 받음)도 출석할 수 있게 먼저 만들어 둔다
  await UserXp.updateOne({ userId }, { $setOnInsert: { userId } }, { upsert: true }).catch((e) => {
    if (e?.code !== 11000) throw e; // 동시에 만들어진 경우 — 이미 있으니 그대로 간다
  });

  // 자물쇠부터 — 오늘 미출석일 때만 통과하는 조건부 갱신 (연타 · 음성 자동 출석과 겹쳐도 한 번만)
  const lock = await UserXp.findOneAndUpdate(
    { userId, lastAttendDate: { $ne: today } },
    { $set: { lastAttendDate: today }, $inc: { attendCount: 1 } },
    { new: true, projection: { attendCount: 1 } }
  );
  if (!lock) {
    return interaction.reply({ content: "오늘은 이미 출석했습니다. 내일 다시 체크해 주세요.", flags: MessageFlags.Ephemeral });
  }

  // 아이템 효과 "출석 시" · "출석 N번째마다"(방금 올린 누적 출석 수 기준)도 같은 지급에 더한다 — 음성 자동 출석과 같은 규칙
  const amount =
    (s.attendXp || 0) + getAttendBuffXp(interaction.member) + getAttendEffectXp(interaction.member, lock.attendCount);
  if (amount > 0) await grantXp(interaction.member, amount, { reason: "attend" });
  console.log(`✅ 출석 명령어: ${interaction.member.displayName} +${amount.toLocaleString()}`);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`✅ ${interaction.member.displayName} 님 출석 완료`)
    .addFields(
      { name: "받은 XP", value: `+${amount.toLocaleString()}`, inline: true },
      { name: "누적 출석", value: `${(lock.attendCount || 0).toLocaleString()}일`, inline: true },
    )
    .setFooter({ text: EMBED_FOOTER });
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
  레벨: handleLevel,
  랭크: handleRank,
  출석체크: handleAttend,
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
