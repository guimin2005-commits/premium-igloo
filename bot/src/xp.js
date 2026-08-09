// ── XP 지급 · 레벨업 감지 · 보상 역할 지급 ──────
import { EmbedBuilder } from "discord.js";
import { UserXp } from "./db.js";
import { getLevelByXp } from "./leveling.js";
import { getRoleConfigs } from "./roleConfigs.js";
import { config } from "./config.js";

export const EMBED_COLOR = 0xe91e3f;
export const EMBED_FOOTER = "고급 이글루 · SYSTEM : LEVEL";

// 도달한 레벨 이하의 보상 역할 중 미보유분 지급
async function grantRewardRoles(member, level) {
  for (const cfg of getRoleConfigs()) {
    if (cfg.rewardLevel != null && level >= cfg.rewardLevel && !member.roles.cache.has(cfg.roleId)) {
      try {
        await member.roles.add(cfg.roleId, `레벨 ${cfg.rewardLevel} 도달 보상`);
        console.log(`🎖 ${member.displayName} → ${cfg.roleName || cfg.roleId} 지급 (Lv.${level})`);
      } catch (e) {
        console.error(`역할 지급 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
}

function announceLevelUp(member, newLevel) {
  if (!config.levelupChannelId) return;
  const channel = member.guild.channels.cache.get(config.levelupChannelId);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(`🎉 <@${member.id}> 님이 **Lv.${newLevel}** 에 도달했습니다!`)
    .setFooter({ text: EMBED_FOOTER });
  channel.send({ embeds: [embed] }).catch(() => {});
}

// XP 지급 + 레벨 재계산. 레벨업 시 알림·보상 역할까지 처리
export async function grantXp(member, amount) {
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
    await UserXp.updateOne({ userId: member.id }, { $set: { level: newLevel } });

    if (newLevel > oldLevel) {
      grantRewardRoles(member, newLevel).catch(() => {});
      announceLevelUp(member, newLevel);
    }
  }
  return doc;
}
