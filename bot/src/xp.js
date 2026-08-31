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

// 배타 역할(티어) 중 지금 레벨에서 유지해야 할 최상위 하나를 고른다.
//    없으면 null — 아직 어떤 티어에도 도달하지 못한 경우다.
function topExclusive(level) {
  let best = null;
  for (const cfg of getRoleConfigs()) {
    if (!cfg.exclusive || cfg.rewardLevel == null) continue;
    if (level >= cfg.rewardLevel && (best === null || cfg.rewardLevel > best.rewardLevel)) best = cfg;
  }
  return best;
}

// 도달한 레벨 이하의 보상 역할 중 미보유분 지급 + 알림
//    배타 역할은 최상위 하나만 지급한다 (하위 티어는 아래 revoke가 거둬간다)
async function grantRewardRoles(member, level) {
  const s = getSettings();
  const top = topExclusive(level);

  for (const cfg of getRoleConfigs()) {
    // 배타 역할인데 최상위가 아니면 지급하지 않는다
    if (cfg.exclusive && (!top || cfg.roleId !== top.roleId)) continue;
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

// 들고 있으면 안 되는 보상 역할을 회수한다
//    ① 레벨이 내려가 지급 기준에 못 미치는 역할 (ARCTIC 구매·관리자 초기화 등)
//    ② 배타 역할(티어) 중 최상위가 아닌 하위 티어 — 승급하면 아래 티어는 떨어져 나간다
export async function revokeRewardRoles(member, level) {
  const top = topExclusive(level);

  for (const cfg of getRoleConfigs()) {
    if (cfg.rewardLevel == null || !member.roles.cache.has(cfg.roleId)) continue;
    const belowThreshold = level < cfg.rewardLevel;
    const staleTier = cfg.exclusive && (!top || cfg.roleId !== top.roleId);
    if (belowThreshold || staleTier) {
      try {
        await member.roles.remove(cfg.roleId, staleTier ? `상위 티어 승급 (Lv.${level})` : `레벨 ${cfg.rewardLevel} 미만으로 하락`);
        console.log(`🧹 ${member.displayName} → ${cfg.roleName || cfg.roleId} 회수 (Lv.${level})`);
      } catch (e) {
        console.error(`역할 회수 실패 (${cfg.roleName || cfg.roleId}):`, e.message);
      }
    }
  }
}

// 보상 역할을 현재 레벨에 맞춘다 — 모자란 건 주고, 넘치는 건 거둔다
export async function syncRewardRoles(member, level) {
  await grantRewardRoles(member, level);
  await revokeRewardRoles(member, level);
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
    } else {
      // 회수(음수 지급)로 레벨이 내려가면 그만큼 보상 역할도 거둔다
      revokeRewardRoles(member, newLevel).catch(() => {});
    }
  }
  return doc;
}
