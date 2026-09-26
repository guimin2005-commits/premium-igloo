// ── 채팅 XP (쿨타임 원자적 갱신으로 중복 지급 방지) ──
//    지급량은 [chatXpMin, chatXpMax] 사이의 랜덤 정수. 강화 단계(UserXp.chatEnhance)마다
//    양끝에 chatEnhanceStep 씩 더해진다 — 사이트 lib/enhance.js chatRange 와 같은 식.
//    📌 아이템 효과: "채팅할 때마다"는 이 1회 지급에 더하고(percent 는 굴린 값 기준),
//       "하루 첫 채팅"은 XP 를 받은 메시지에 한해 하루 1번 따로 준다(XpLog reason "effect").
import { Events } from "discord.js";
import { UserXp, isDuplicateKeyError } from "../db.js";
import { getBuffXp, effectXp } from "../roleConfigs.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp } from "../botSettings.js";
import { grantXp, grantOnceEffects } from "../xp.js";
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
      // 경쟁 상태(연속 메시지 중복 지급)가 원천적으로 불가능.
      // 갱신된 문서를 돌려받아 강화 단계까지 한 번의 왕복으로 읽는다.
      const now = new Date();
      const cutoff = new Date(now.getTime() - s.chatCooldownSec * 1000);
      let doc = null;
      try {
        doc = await UserXp.findOneAndUpdate(
          {
            userId: message.author.id,
            $or: [{ lastChatXpAt: null }, { lastChatXpAt: { $lt: cutoff } }],
          },
          { $set: { lastChatXpAt: now } },
          { upsert: true, new: true, projection: { chatEnhance: 1 } }
        );
        if (!doc) return; // 쿨타임 중
      } catch (e) {
        if (isDuplicateKeyError(e)) return; // 문서는 있으나 쿨타임 중 → upsert 충돌
        throw e;
      }

      // 랜덤 구간 — 양끝 포함 정수. 강화 단계만큼 구간 전체가 위로 밀린다.
      const lvl = Math.max(0, Math.floor(Number(doc.chatEnhance) || 0));
      const step = Math.max(0, Number(s.chatEnhanceStep) || 0);
      const min = Math.max(0, Math.floor(Number(s.chatXpMin) || 0)) + lvl * step;
      const max = Math.max(min, Math.floor(Number(s.chatXpMax) || 0) + lvl * step);
      const rolled = min + Math.floor(Math.random() * (max - min + 1));

      const amount =
        rolled +
        getBuffXp(message.member) +
        channelPolicy.boostXp +
        getActiveBoostXp(message.member, message.channel) +
        effectXp(message.member, "chat", { base: rolled, channel: message.channel });

      const where = { channelId: message.channel.id, channelName: message.channel.name || "" };
      await grantXp(message.member, amount, { reason: "chat", ...where });

      // 하루 첫 채팅 효과 — 쿨타임을 통과해 XP 를 받은 메시지에서만 (오류는 안에서 삼킨다)
      await grantOnceEffects(message.member, "firstChat", { meta: where });
    } catch (e) {
      console.error("채팅 XP 오류:", e.message);
    }
  });
}
