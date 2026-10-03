// ── 채팅 XP (쿨타임 원자적 갱신으로 중복 지급 방지) ──
//    지급량은 [chatXpMin, chatXpMax] 사이의 랜덤 정수. 강화 단계(UserXp.chatEnhance)마다
//    양끝에 chatEnhanceStep 씩 더해진다 — 사이트 lib/enhance.js chatRange 와 같은 식.
//    📌 아이템 효과: "채팅 1회당"은 이 1회 지급에 더하고(percent 는 굴린 값 기준),
//       "하루 첫 채팅"은 XP 를 받은 메시지에 한해 하루 1번 따로 준다(XpLog reason "effect").
//       "채팅 잭팟"은 XP 를 받은 메시지에서 효과마다 확률로 따로, "채팅 쿨타임 단축"은 이 유저의 쿨타임에서 초를 뺀다(상한 절반).
//       "새 멤버 첫 답장"은 쿨타임과 무관하게 — 입장 7일 이내 멤버의 메시지에 답장하면 그 멤버당 한 번(WelcomeReply 로 잠금).
//       효과는 디스코드 역할이 아니라 인벤토리 보유 아이템 기준이다(itemEffects.js — 아이템 기본 효과 포함).
import { Events, MessageType } from "discord.js";
import { UserXp, WelcomeReply, isDuplicateKeyError } from "../db.js";
import { getBuffXp } from "../roleConfigs.js";
import { effectXp, jackpotXp, welcomeReplyXp, perksOf } from "../itemEffects.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { getSettings, getActiveBoostXp, isLevelOpen } from "../botSettings.js";
import { grantXp, grantOnceEffects } from "../xp.js";
import { config } from "../config.js";

const WELCOME_DAYS = 7; // 새 멤버 — 서버 입장 뒤 이 기간 안
const DAY_MS = 24 * 60 * 60 * 1000;

// 📌 새 멤버 첫 답장 효과 — 효과를 가진 사람만 원문을 불러온다(답장마다 API 를 부르지 않게).
//    원문 작성자가 봇 · 본인이 아니고 입장 7일 이내면, WelcomeReply(newcomerId, userId) 를 먼저 넣은 쪽만 지급한다(unique 가 잠금).
async function grantWelcomeReply(message, where) {
  if (message.type !== MessageType.Reply || !message.reference?.messageId) return;
  const amount = welcomeReplyXp(message.member, { channel: message.channel });
  if (!(amount > 0)) return;

  const ref = await message.fetchReference().catch(() => null);
  const author = ref?.author;
  if (!author || author.bot || author.id === message.author.id) return;
  if (ref.guildId && ref.guildId !== message.guild.id) return;
  const newcomer = ref.member || (await message.guild.members.fetch(author.id).catch(() => null));
  const joined = newcomer?.joinedTimestamp;
  if (!joined || Date.now() - joined > WELCOME_DAYS * DAY_MS) return;

  try {
    await WelcomeReply.create({ newcomerId: author.id, userId: message.author.id });
  } catch (e) {
    if (isDuplicateKeyError(e)) return; // 이 새 멤버에게는 이미 받았다
    throw e;
  }
  await grantXp(message.member, amount, { reason: "effect", ...where });
  console.log(`✨ 아이템 효과(welcomeReply): ${message.member.displayName} → ${author.username} +${amount.toLocaleString()}`);
}

export function registerChatXp(client) {
  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot || !message.member || message.guild?.id !== config.guildId) return;
      // 📌 레벨 비공개면 채팅 XP 없음 — 쿨타임 · 문서도 건드리지 않는다 (grantXp 입구도 한 번 더 막는다)
      if (!isLevelOpen()) return;

      // 채널/카테고리 정책 (지급 제외 채널이면 쿨타임도 소모하지 않음)
      const channelPolicy = getChannelPolicy(message.channel);
      if (channelPolicy.excluded) return;

      const s = getSettings();
      // 📌 pc = 카테고리(스레드는 부모 채널의 카테고리) — 퀘스트 채널 조건이 카테고리로도 맞추게(XpLog.pc)
      const ch = message.channel;
      //    pt = 스레드면 부모 채널 — 퀘스트 채널 조건 · 채널 수는 부모로 센다(활동 횟수 activityStats 와 같은 기준)
      const thread = !!ch.isThread?.();
      const where = { channelId: ch.id, channelName: ch.name || "", pc: (thread ? ch.parent?.parentId : ch.parentId) || "", ...(thread && ch.parentId ? { pt: ch.parentId } : {}) };

      // 새 멤버 첫 답장 — 쿨타임과 따로 (오류는 여기서 삼킨다 — 채팅 지급을 막지 않게)
      await grantWelcomeReply(message, where).catch((e) => console.error("아이템 효과 지급 오류 (welcomeReply):", e.message));

      // 쿨타임이 지난 경우에만 매치되는 조건부 갱신 — 조회·저장 사이의
      // 경쟁 상태(연속 메시지 중복 지급)가 원천적으로 불가능.
      // 갱신된 문서를 돌려받아 강화 단계까지 한 번의 왕복으로 읽는다.
      // 📌 쿨타임 단축(아이템 효과 cooldownCut) — 이 유저의 쿨타임에서 뺀다. 상한(쿨타임의 절반)은 perksOf 가 건다
      const now = new Date();
      const cooldownSec = Math.max(0, (Number(s.chatCooldownSec) || 0) - perksOf(message.member).cooldownCut);
      const cutoff = new Date(now.getTime() - cooldownSec * 1000);
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

      await grantXp(message.member, amount, { reason: "chat", ...where });

      // 채팅 잭팟 — XP 를 받은 메시지에서만, 터지면 따로 지급(XpLog "effect")
      const jackpot = jackpotXp(message.member, { channel: message.channel });
      if (jackpot > 0) {
        await grantXp(message.member, jackpot, { reason: "effect", ...where })
          .then(() => console.log(`✨ 아이템 효과(chatJackpot): ${message.member.displayName} +${jackpot.toLocaleString()}`))
          .catch((e) => console.error("아이템 효과 지급 오류 (chatJackpot):", e.message));
      }

      // 하루 첫 채팅 효과 — 쿨타임을 통과해 XP 를 받은 메시지에서만 (오류는 안에서 삼킨다)
      await grantOnceEffects(message.member, "firstChat", { meta: where });
    } catch (e) {
      console.error("채팅 XP 오류:", e.message);
    }
  });
}
