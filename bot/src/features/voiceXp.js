// ── 음성 XP (설정된 주기마다 지급) ──────────────────
import { UserXp } from "../db.js";
import { getVoiceBracketBonus } from "../leveling.js";
import { getBuffXp } from "../roleConfigs.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp, getMuteMultiplier } from "../botSettings.js";
import { grantXp } from "../xp.js";
import { config, policy } from "../config.js";

async function voiceXpTick(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;

    const s = getSettings();
    const afkChannelId = guild.afkChannelId;

    for (const [, voiceState] of guild.voiceStates.cache) {
      const member = voiceState.member;
      const channel = voiceState.channel;
      if (!member || member.user.bot || !channel) continue;
      if (channel.id === afkChannelId) continue; // 잠수 채널 제외

      // 채널/카테고리 정책 (대시보드 설정)
      const channelPolicy = getChannelPolicy(channel);
      if (channelPolicy.excluded) continue;

      // 음소거 정책 — block이면 지급 자체를 건너뜀
      const muteMultiplier = getMuteMultiplier(voiceState);
      if (muteMultiplier === 0) continue;

      // 내전 채널은 env 설정이 있을 때만 별도 기본값 사용
      const base = config.scrimChannelIds.has(channel.id) ? policy.scrimBaseXp : s.voiceXp;
      const doc = await UserXp.findOne({ userId: member.id }, { level: 1 }).lean();

      const amount = Math.floor(
        (base + getVoiceBracketBonus(doc?.level || 0) + getBuffXp(member) + channelPolicy.boostXp + getActiveBoostXp(member)) *
          muteMultiplier
      );

      await grantXp(member, amount, {
        reason: "voice",
        channelId: channel.id,
        channelName: channel.name || "",
      });
    }
  } catch (e) {
    console.error("음성 XP 오류:", e.message);
  }
}

// 설정된 주기로 루프를 돌리고, 주기가 바뀌면 타이머를 다시 건다
export function startVoiceXpLoop(client) {
  let timer = null;
  let currentSec = 0;

  const ensureTimer = () => {
    const sec = getSettings().voiceIntervalSec || 300;
    if (sec === currentSec) return;
    currentSec = sec;
    if (timer) clearInterval(timer);
    timer = setInterval(() => voiceXpTick(client), sec * 1000);
    console.log(`🔊 음성 XP 주기: ${sec}초`);
  };

  ensureTimer();
  setInterval(ensureTimer, 60 * 1000); // 대시보드에서 주기를 바꾸면 1분 내 반영
}
