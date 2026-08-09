// ── 채팅 XP (쿨타임 원자적 갱신으로 중복 지급 방지) ──
import { Events } from "discord.js";
import { UserXp, isDuplicateKeyError } from "../db.js";
import { getBuffXp } from "../roleConfigs.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp } from "../botSettings.js";
import { grantXp } from "../xp.js";
import { config } from "../config.js";

export function registerChatXp(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.member || message.guild?.id !== config.guildId) return;

      // 채널/카테고리 정책 (지급 제외 채널이면 쿨타임도 소모하지 않음)
      const channelPolicy = getChannelPolicy(message.channel);
      if (channelPolicy.excluded) return;

      const s = getSettings();

      // 쿨타임이 지난 경우에만 매치되는 조건부 갱신 — 조회·저장 사이의
      // 경쟁 상태(연속 메시지 중복 지급)가 원천적으로 불가능
      const now = new Date();
      const cutoff = new Date(now.getTime() - s.chatCooldownSec * 1000);
      try {
        const res = await UserXp.updateOne(
          {
            userId: message.author.id,
            $or: [{ lastChatXpAt: null }, { lastChatXpAt: { $lt: cutoff } }],
          },
          { $set: { lastChatXpAt: now } },
          { upsert: true }
        );
        if (res.matchedCount === 0 && !res.upsertedCount) return; // 쿨타임 중
      } catch (e) {
        if (isDuplicateKeyError(e)) return; // 문서는 있으나 쿨타임 중 → upsert 충돌
        throw e;
      }

      const amount =
        s.chatXp + getBuffXp(message.member) + channelPolicy.boostXp + getActiveBoostXp(message.member);

      await grantXp(message.member, amount, {
        reason: "chat",
        channelId: message.channel.id,
        channelName: message.channel.name || "",
      });
    } catch (e) {
      console.error("채팅 XP 오류:", e.message);
    }
  });
}
