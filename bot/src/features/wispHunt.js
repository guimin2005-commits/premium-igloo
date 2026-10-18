// ── 도깨비불 사냥 (아이템 효과 wispHunt — 호박불 랜턴) ──────────────────
//    📌 2026-10-14 할로윈 「유령 펭귄의 초대」 부스터 — 랜턴(효과 wispHunt)을 든 사람이 채팅 XP 를 받으면 효과마다 chance% 로 그 채널에
//       도깨비불이 뜬다(features/chatXp.js 가 itemEffects.js wispHuntXp 로 굴리고 spawnWisp 를 부른다).
//       [잡기] 를 먼저 누른 사람이 +500~1,500 XP(itemEffects.js 할로윈 효과 공용 블록 WISP_CATCH_XP), 랜턴 주인은 효과 크기(amount)만큼 받는다.
//       핫타임 배수는 붙지 않는다(운영자 "아이템에는 핫타임 효과가 적용되지 않음").
//    · 한 채널에는 10분에 하나(떠 있는 것 포함) · 한 주인도 10분에 하나. 60초 안에 아무도 못 잡으면 사라진다(버튼을 뗀다).
//    · 주인 · 봇은 잡을 수 없다. 잡는 사람도 XP 를 받을 수 있어야 한다 — 레벨 공개(isLevelOpen) · XP 획득 중단 아님(xpStop.js).
//    · 지급은 grantXp(reason "effect") — XpLog · 레벨업 · 패스가 그대로 돈다. 그 사이 중단된 사람은 grantXp 가 막는다(잡기는 다시 열린다).
//    · 멘션은 보내지 않는다(allowedMentions 없음). 디스코드 오류는 전부 삼킨다 — 봇이 죽지 않게.
//    · 봇 메모리에만 둔다 — 재시작 뒤 남은 버튼을 누르면 사라진 것으로 보고 버튼을 뗀다.
import { Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } from "discord.js";
import { isLevelOpen } from "../botSettings.js";
import { xpStoppedUntil, xpStopText } from "../xpStop.js";
import { grantXp } from "../xp.js";
import { WISP_CATCH_XP, pickWispXp } from "../itemEffects.js";
import { config } from "../config.js";

const PREFIX = "wisp:";
const LIFE_MS = 60_000; // 떠 있는 시간
const GAP_MS = 10 * 60_000; // 같은 채널 · 같은 주인 사이 간격
const NO_PINGS = { parse: [] };

const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const SPAWN_TEXT = `🕯️ 도깨비불이 나타났어요! 먼저 잡는 사람 +${fmt(WISP_CATCH_XP[0])}~${fmt(WISP_CATCH_XP[1])} XP`;
const GONE_TEXT = "🕯️ 도깨비불이 사라졌어요";

// id → { channelId, ownerId, amount, where, message, state: "live" | "busy"(잡는 중) | "caught" | "gone", born, at, timer }
const wisps = new Map();
const lastByChannel = new Map(); // 채널 id → 마지막으로 띄운 시각(ms)
const lastByOwner = new Map(); // 주인 id → 마지막으로 띄운 시각(ms)
let registered = false;

// 10분 지난 기록은 지운다 — 끝난 도깨비불도 그동안은 들고 있어 늦은 클릭에 "이미 잡혔어요"를 답한다
function prune(now) {
  for (const [k, t] of lastByChannel) if (now - t >= GAP_MS) lastByChannel.delete(k);
  for (const [k, t] of lastByOwner) if (now - t >= GAP_MS) lastByOwner.delete(k);
  for (const [id, w] of wisps) if ((w.state === "caught" || w.state === "gone") && now - w.at >= GAP_MS) wisps.delete(id);
}

// 메시지를 끝난 모양으로 — 버튼을 뗀다
function endMessage(w, content) {
  if (!w.message) return Promise.resolve();
  return w.message.edit({ content, components: [], allowedMentions: NO_PINGS }).catch((e) => console.error("도깨비불 메시지 고치기 실패:", e?.message || e));
}

// 60초 — 아무도 못 잡았으면 사라진다. 잡는 중(busy)이면 그쪽이 끝낸다
function expire(id) {
  const w = wisps.get(id);
  if (!w || w.state !== "live") return;
  w.state = "gone";
  w.at = Date.now();
  endMessage(w, GONE_TEXT);
}

/**
 * 📌 도깨비불 띄우기 — features/chatXp.js 가 채팅 XP 를 받은 메시지에서 터지면 부른다(기다리지 않는다).
 *    amount: 주인 몫(효과 크기), where: XpLog 채널 칸(chatXp 의 where). 띄웠으면 true
 */
export async function spawnWisp(message, amount, where = {}) {
  const ch = message?.channel;
  const owner = message?.member;
  if (!ch || !owner || !(amount > 0) || typeof ch.send !== "function") return false;
  const now = Date.now();
  prune(now);
  if (now - (lastByChannel.get(ch.id) || 0) < GAP_MS) return false;
  if (now - (lastByOwner.get(owner.id) || 0) < GAP_MS) return false;
  for (const w of wisps.values()) if (w.channelId === ch.id && (w.state === "live" || w.state === "busy")) return false;
  const me = message.guild?.members.me;
  const perms = me ? ch.permissionsFor?.(me) : null;
  const sendFlag = ch.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, sendFlag])) return false;

  // 보내기 전에 자리를 잡는다 — 같은 채널 · 같은 주인에게 동시에 터져도 하나만. 버튼보다 먼저 넣어 두어 아주 빠른 클릭도 알아본다
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const w = { channelId: ch.id, ownerId: owner.id, amount, where, message: null, state: "live", born: now, at: now, timer: null };
  wisps.set(id, w);
  lastByChannel.set(ch.id, now);
  lastByOwner.set(owner.id, now);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PREFIX}${id}`).setLabel("잡기").setEmoji("🕯️").setStyle(ButtonStyle.Success)
  );
  const msg = await ch.send({ content: SPAWN_TEXT, components: [row], allowedMentions: NO_PINGS }).catch((e) => {
    console.error(`도깨비불 보내기 실패 (#${ch.name || ch.id}):`, e?.message || e);
    return null;
  });
  if (!msg) {
    // 못 보냈다 — 자리를 돌려준다(그 사이 다른 것이 잡은 자리는 건드리지 않는다)
    wisps.delete(id);
    if (lastByChannel.get(ch.id) === now) lastByChannel.delete(ch.id);
    if (lastByOwner.get(owner.id) === now) lastByOwner.delete(owner.id);
    return false;
  }
  w.message = msg;
  w.timer = setTimeout(() => expire(id), Math.max(0, LIFE_MS - (Date.now() - now)));
  w.timer.unref?.();
  console.log(`🕯️ 아이템 효과(wispHunt): ${owner.displayName} → #${ch.name || ch.id} 도깨비불`);
  return true;
}

async function onButton(i) {
  if (!i.isButton?.() || !i.customId.startsWith(PREFIX)) return;
  const id = i.customId.slice(PREFIX.length);
  const w = wisps.get(id);
  const say = (content) => i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  if (!w) {
    // 모르는 도깨비불(재시작 뒤 남은 버튼 등) — 사라진 것으로 보고 버튼을 뗀다
    await i.update({ content: GONE_TEXT, components: [], allowedMentions: NO_PINGS }).catch(() => say("도깨비불이 사라졌어요"));
    return;
  }
  if (w.state === "caught" || w.state === "busy") return say("이미 잡혔어요");
  if (w.state === "gone") return say("도깨비불이 사라졌어요");
  if (i.user?.bot) return;
  if (i.user.id === w.ownerId) return say("랜턴 주인은 잡을 수 없어요");
  if (!isLevelOpen()) return say("지금은 XP를 받을 수 없어요");
  const until = xpStoppedUntil(i.user.id);
  if (until) return say(xpStopText(until));

  // 📌 먼저 누른 한 사람만 — 여기까지는 await 가 없어 이 줄을 먼저 지난 클릭이 잡는다. 아래 await 사이에 온 클릭은 "이미 잡혔어요"
  w.state = "busy";
  let caught = false;
  try {
    await i.deferUpdate().catch(() => {});
    const guild = i.guild;
    const member = guild?.members.cache.get(i.user.id) || (await guild?.members.fetch(i.user.id).catch(() => null));
    if (!member || member.user?.bot) return;
    const xp = pickWispXp();
    const doc = await grantXp(member, xp, { reason: "effect", ...w.where });
    if (!doc) {
      // 그 사이 중단 · 비공개 — 이 사람은 못 잡는다(도깨비불은 남은 시간 동안 다시 열린다)
      await i.followUp({ content: "지금은 XP를 받을 수 없어요", flags: MessageFlags.Ephemeral }).catch(() => {});
      return;
    }
    caught = true;
    w.state = "caught";
    w.at = Date.now();
    clearTimeout(w.timer);
    const content = `🕯️ ${member.displayName} 님이 도깨비불을 잡았어요! +${fmt(xp)} XP`;
    await i.editReply({ content, components: [], allowedMentions: NO_PINGS }).catch(() => endMessage(w, content));
    console.log(`✨ 아이템 효과(wispHunt): ${member.displayName} 잡음 +${xp.toLocaleString()}`);

    // 랜턴 주인 몫 — 서버를 나갔으면 없음
    const owner = guild.members.cache.get(w.ownerId) || (await guild.members.fetch(w.ownerId).catch(() => null));
    if (owner) {
      await grantXp(owner, w.amount, { reason: "effect", ...w.where })
        .then((d) => d && console.log(`✨ 아이템 효과(wispHunt): ${owner.displayName} 랜턴 +${w.amount.toLocaleString()}`))
        .catch((e) => console.error(`아이템 효과 지급 오류 (wispHunt / ${owner.displayName}):`, e?.message || e));
    }
  } catch (e) {
    console.error("도깨비불 잡기 오류:", e?.message || e);
  } finally {
    if (!caught && w.state === "busy") {
      // 못 잡았다 — 시간이 남았으면 다시 열고, 그 사이 60초가 지났으면 사라진다
      w.state = "live";
      if (Date.now() - w.born >= LIFE_MS) expire(id);
    }
  }
}

// 버튼 처리 — 봇이 켜질 때 한 번(index.js)
export function registerWispHunt(client) {
  if (registered) return;
  registered = true;
  client.on(Events.InteractionCreate, (i) => {
    if (i.guildId && i.guildId !== config.guildId) return;
    onButton(i).catch((e) => console.error("도깨비불 버튼 오류:", e?.message || e));
  });
}
