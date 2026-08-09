// ── 음성 XP (5분 주기 지급) ──────────────────
import { UserXp } from "../db.js";
import { getVoiceBracketBonus } from "../leveling.js";
import { getBuffXp } from "../roleConfigs.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { grantXp } from "../xp.js";
import { config, policy } from "../config.js";

async function voiceXpTick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    const afkChannelId = guild.afkChannelId;

    for (const [, voiceState] of guild.voiceStates.cache) {
      const member = voiceState.member;
      const channel = voiceState.channel;
      if (!member || member.user.bot || !channel) continue;
      if (channel.id === afkChannelId) continue; // 잠수 채널 제외

      // 채널/카테고리 정책 (대시보드 설정)
      const channelPolicy = getChannelPolicy(channel);
      if (channelPolicy.excluded) continue;

      const base = config.scrimChannelIds.has(channel.id) ? policy.scrimBaseXp : policy.voiceBaseXp;
      const doc = await UserXp.findOne({ userId: member.id }, { level: 1 }).lean();
      let amount = base + getVoiceBracketBonus(doc?.level || 0) + getBuffXp(member) + channelPolicy.boostXp;

      // 마이크 & 헤드셋 모두 음소거 시 90% 감소
      if (voiceState.selfMute && voiceState.selfDeaf) {
        amount = Math.floor(amount * policy.mutedMultiplier);
      }

      await grantXp(member, amount);
    }
  } catch (e) {
    console.error("음성 XP 오류:", e.message);
  }
}

export function startVoiceXpLoop(client) {
  setInterval(() => voiceXpTick(client), policy.voiceIntervalMs);
}
