// ── XP 지급 · 레벨업 감지 · 보상 역할 지급 · 로그 기록 ──────
import { EmbedBuilder } from "discord.js";
import { UserXp, XpLog } from "./db.js";
import { getLevelByXp } from "./leveling.js";
import { getRoleConfigs } from "./roleConfigs.js";
import { getSettings } from "./botSettings.js";
import { config } from "./config.js";

export const EMBED_COLOR = 0xe91e3f;
export const EMBED_FOOTER = "고급 이글루 · SYSTEM : LEVEL";

// 지정 채널에 임베드 알림 전송 (채널 미설정·미존재 시 조용히 무시)
function sendNotice(guild, channelId, text) {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setDescription(text).setFooter({ text: EMBED_FOOTER });
  channel.send({ embeds: [embed] }).catch(() => {});
}

// 도달한 레벨 이하의 보상 역할 중 미보유분 지급 + 알림
async function grantRewardRoles(member, level) {
  const s = getSettings();

  for (const cfg of getRoleConfigs()) {
    if (cfg.rewardLevel != null && level >= cfg.rewardLevel && !member.roles.cache.has(cfg.roleId)) {
      try {
        await member.roles.add(cfg.roleId, `레벨 ${cfg.rewardLevel} 도달 보상`);
        console.log(`🎖 ${member.displayName} → ${cfg.roleName || cfg.roleId} 지급 (Lv.${level})`);

        if (s.roleGrantEnabled) {
          const roleName = cfg.roleName || member.guild.roles.cache.get(cfg.roleId)?.name || "역할";
          const text = (s.roleGrantMessage || "🎖 {user} 님에게 **{role}** 역할이 지급되었습니다! (Lv.{level})")
            .replaceAll("{user}", `<@${member.id}>`)
            .replaceAll("{role}", roleName)
            .replaceAll("{level}", String(level));
          // 역할 지급 전용 채널이 없으면 레벨업 채널을 함께 사용
          sendNotice(member.guild, s.roleGrantChannelId || s.levelupChannelId || config.levelupChannelId, text);
        }
      } catch (e) {
        console.error(`역할 지급 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
}

// 대시보드에서 지정한 채널·문구로 레벨업 알림 ({user}, {level}, {xp} 치환)
function announceLevelUp(member, newLevel, totalXp) {
  const s = getSettings();
  const text = (s.levelupMessage || "🎉 {user} 님이 **Lv.{level}** 에 도달했습니다!")
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{level}", String(newLevel))
    .replaceAll("{xp}", totalXp.toLocaleString());

  sendNotice(member.guild, s.levelupChannelId || config.levelupChannelId, text);
}

// XP 지급 + 레벨 재계산. 레벨업 시 알림·보상 역할까지 처리
// meta: { reason, channelId, channelName } — 로그 기록용
export async function grantXp(member, amount, meta = {}) {
  if (!amount) return null;

  const doc = await UserXp.findOneAndUpdate(
    { userId: member.id },
    {
      $inc: { xp: amount },
      $set: { username: member.user.username, displayName: member.displayName, updatedAt: new Date() },
    },
    { upsert: true, new: true }
  );

  // 지급 로그 (실패해도 지급 자체는 유지)
  XpLog.create({
    userId: member.id,
    displayName: member.displayName,
    amount,
    reason: meta.reason || "",
    channelId: meta.channelId || "",
    channelName: meta.channelName || "",
  }).catch(() => {});

  const newLevel = getLevelByXp(doc.xp);
  if (newLevel !== doc.level) {
    const oldLevel = doc.level;
    doc.level = newLevel;
    await UserXp.updateOne({ userId: member.id }, { $set: { level: newLevel } });

    if (newLevel > oldLevel) {
      grantRewardRoles(member, newLevel).catch(() => {});
      announceLevelUp(member, newLevel, doc.xp);
    }
  }
  return doc;
}
