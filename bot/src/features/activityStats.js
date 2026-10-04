// ── 활동 횟수 (퀘스트 감지 범위 — 2026-10-03 "퀘스트를 감지하는 범위가 넓어지고 다양해지면") ──
//    📌 XP 지급 로그(XpLog)에 남지 않는 활동을 (유저 · KST 날짜 · KST 시 · 종류 · 채널) 묶음으로 세어 20초마다 ActivityStat 에 $inc 한다.
//       사이트 · 봇 /퀘스트가 lib/questKinds.js 공용 블록(computeQuestState)으로 읽는다. 종류 이름은 QUEST_REASONS 의 act 대상과 같다:
//       msg 메시지(쿨타임 무관) · reply 답장하기 · replied 답장 받기 · mention 멘션하기 · react 반응 달기 · reacted 반응 받기 ·
//       threadmsg 스레드 대화 · threadnew 스레드 · 포럼 글 만들기 · sticker 스티커 · cmd 봇 명령어 · vjoin 음성 채널 입장 · levelup 레벨 업
//    📌 도배로 부풀리지 않게 — 메시지 계열은 사람마다 3초에 한 번만, 음성 입장은 1분에 한 번만, 반응은 (사람 · 메시지 · 이모지)당 하루 한 번만 센다.
//       봇 · 시스템 메시지 · 자기 자신에게 한 답장/반응 · 지급 제외 채널(채널 정책)은 세지 않는다.
//    📌 2026-10-04 "비공개 중에는 활동 횟수도 멈추면 XP 퀘스트와 기준이 같아집니다" — 레벨 비공개(isLevelOpen false)면 아무것도 세지 않는다(레벨 업 포함).
//       예전엔 비공개 중에도 세어, 공개 뒤 같은 주 · 달 퀘스트에 비공개 동안의 횟수가 바로 들어갔다
//    📌 반응은 raw 게이트웨이 패킷(MESSAGE_REACTION_ADD)으로 받는다 — 메시지 작성자(message_author_id)가 패킷에 있어 캐시 · 조회 없이 "받기"까지 센다.
//       GuildMessageReactions 인텐트가 필요하다(index.js). 메시지 본문 · 첨부는 MessageContent 인텐트가 없어 세지 않는다
//    📌 스레드 안 활동은 부모 채널로 적는다(관리 화면 채널 고르기에 스레드는 없다). pc = 카테고리
//    📌 Railway 는 SIGTERM 뒤 곧바로 SIGKILL 이라 마지막 기록 뒤 몇 초는 잃을 수 있다 — 그래서 20초마다 쓴다(voiceTime.js 와 같다)
import { Events, MessageType } from "discord.js";
import { ActivityStat } from "../db.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { isLevelOpen } from "../botSettings.js";
import { config } from "../config.js";

const FLUSH_MS = 20_000;
const MSG_GAP_MS = 3_000;
const JOIN_GAP_MS = 60_000;
const TTL_DAYS = 70;
const KST = 9 * 60 * 60 * 1000;

const pending = new Map(); // "u|d|h|k|ch" → { u, d, h, k, ch, pc, n }
const lastMsg = new Map(); // userId → ms (메시지 계열 3초 간격)
const lastJoin = new Map(); // userId → ms (음성 입장 1분 간격)
let reactSeen = new Set(); // "u|메시지|이모지" — 하루치
let reactDay = "";
let started = false;
let flushing = null;

const kstParts = (ms = Date.now()) => {
  const t = new Date(ms + KST);
  return { d: t.toISOString().slice(0, 10), h: t.getUTCHours() };
};
const isThread = (c) => typeof c?.isThread === "function" && c.isThread();
// 스레드는 부모 채널로 · 카테고리는 (스레드면 부모의) parentId
const chanOf = (c) => (isThread(c) ? c.parentId || c.id : c?.id) || "";
const catOf = (c) => (isThread(c) ? c.parent?.parentId : c?.parentId) || "";

// 📌 한 번 세기 — 다른 기능(xp.js 레벨 업 등)도 이걸 부른다. channel 이 없으면 chId(글자)만 적는다. 레벨 비공개면 세지 않는다(맨 위 📌)
export function bumpActivity(userId, k, n = 1, channel = null, chId = "") {
  if (!started || !userId || !(n > 0) || !isLevelOpen()) return;
  const { d, h } = kstParts();
  const ch = channel ? chanOf(channel) : String(chId || "");
  const pc = channel ? catOf(channel) : "";
  const key = `${userId}|${d}|${h}|${k}|${ch}`;
  const p = pending.get(key) || { u: userId, d, h, k, ch, pc, n: 0 };
  p.n += n;
  pending.set(key, p);
}

// 퇴장 초기화(leaveReset.js) — 아직 안 쓴 이 사람 몫도 버린다(지운 기록이 다시 생기지 않게)
export function dropActivity(userId) {
  for (const [key, p] of pending) if (p.u === userId) pending.delete(key);
}

const excluded = (channel) => !!channel && getChannelPolicy(isThread(channel) ? channel.parent || channel : channel).excluded;

export function flushActivity() {
  if (!started) return Promise.resolve();
  if (flushing) return flushing;
  flushing = doFlush()
    .catch((e) => console.error("활동 횟수 기록 오류:", e?.message || e))
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function doFlush() {
  if (!pending.size) return;
  const rows = [...pending.values()];
  pending.clear();
  // 날짜(KST 0시) + 70일 뒤 지운다
  const exp = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - KST + TTL_DAYS * 86400000);
  const ops = rows.map((r) => ({
    updateOne: {
      filter: { u: r.u, d: r.d, h: r.h, k: r.k, ch: r.ch },
      update: { $inc: { n: r.n }, $setOnInsert: { pc: r.pc, exp: exp(r.d) } },
      upsert: true,
    },
  }));
  // 쓰기 실패는 되돌리지 않는다 — 일부만 들어갔을 수 있어 다시 쓰면 두 번 센다
  await ActivityStat.bulkWrite(ops, { ordered: false });
}

// ClientReady 에서 채널 정책을 읽은 뒤에 켠다(지급 제외 채널 판정)
export function startActivityStats(client) {
  if (started) return;
  started = true;
  ActivityStat.createIndexes().catch((e) => console.error("활동 횟수 인덱스 오류:", e?.message || e));

  client.on(Events.MessageCreate, (m) => {
    try {
      if (m.author?.bot || m.system || !m.guild || m.guild.id !== config.guildId) return;
      if (excluded(m.channel)) return;
      const u = m.author.id;
      const now = Date.now();
      if (now - (lastMsg.get(u) || 0) < MSG_GAP_MS) return;
      lastMsg.set(u, now);
      bumpActivity(u, "msg", 1, m.channel);
      if (isThread(m.channel)) bumpActivity(u, "threadmsg", 1, m.channel);
      // 답장 — 대상은 패킷의 referenced_message 작성자(조회 없음). 자기 자신 · 봇은 빼고
      const to = m.type === MessageType.Reply ? m.mentions?.repliedUser : null;
      if (to && !to.bot && to.id !== u) {
        bumpActivity(u, "reply", 1, m.channel);
        bumpActivity(to.id, "replied", 1, m.channel);
      }
      // 멘션 — 메시지당 한 번(여러 명을 불러도 1). 답장 대상 · 자기 자신 · 봇은 빼고
      const others = m.mentions?.users?.filter((x) => !x.bot && x.id !== u && x.id !== to?.id);
      if (others?.size) bumpActivity(u, "mention", 1, m.channel);
      if (m.stickers?.size) bumpActivity(u, "sticker", 1, m.channel);
    } catch (e) {
      console.error("활동 횟수(메시지) 오류:", e?.message || e);
    }
  });

  // 스레드 · 포럼 글 만들기 — 새로 만든 것만(봇이 들어가며 받는 옛 스레드는 newlyCreated 가 false)
  client.on(Events.ThreadCreate, (thread, newlyCreated) => {
    try {
      if (!newlyCreated || thread.guildId !== config.guildId || !thread.ownerId) return;
      if (thread.ownerId === client.user?.id || thread.guild?.members?.cache?.get(thread.ownerId)?.user?.bot) return;
      if (excluded(thread)) return;
      bumpActivity(thread.ownerId, "threadnew", 1, thread);
    } catch (e) {
      console.error("활동 횟수(스레드) 오류:", e?.message || e);
    }
  });

  // 반응 — raw 패킷. 같은 (사람 · 메시지 · 이모지)는 하루 한 번(달았다 뗐다 반복으로 부풀리지 않게)
  client.on("raw", (p) => {
    try {
      if (p?.t !== "MESSAGE_REACTION_ADD") return;
      const x = p.d;
      if (!x || x.guild_id !== config.guildId || !x.user_id) return;
      if (x.member?.user?.bot || x.user_id === client.user?.id) return;
      const { d } = kstParts();
      if (d !== reactDay) {
        reactSeen = new Set();
        reactDay = d;
      }
      const key = `${x.user_id}|${x.message_id}|${x.emoji?.id || x.emoji?.name || ""}`;
      if (reactSeen.has(key)) return;
      reactSeen.add(key);
      const channel = client.channels.cache.get(x.channel_id) || null;
      if (excluded(channel)) return;
      const owner = x.message_author_id;
      if (owner && owner === x.user_id) return; // 자기 메시지에 단 반응은 세지 않는다
      bumpActivity(x.user_id, "react", 1, channel, x.channel_id);
      if (owner && owner !== client.user?.id) {
        const om = client.guilds.cache.get(config.guildId)?.members?.cache?.get(owner);
        if (!om?.user?.bot) bumpActivity(owner, "reacted", 1, channel, x.channel_id);
      }
    } catch (e) {
      console.error("활동 횟수(반응) 오류:", e?.message || e);
    }
  });

  // 봇 명령어(슬래시) — 버튼은 세지 않는다
  client.on(Events.InteractionCreate, (i) => {
    try {
      if (typeof i.isChatInputCommand !== "function" || !i.isChatInputCommand()) return;
      if (i.guildId !== config.guildId || i.user?.bot) return;
      bumpActivity(i.user.id, "cmd", 1, i.channel, i.channelId);
    } catch (e) {
      console.error("활동 횟수(명령어) 오류:", e?.message || e);
    }
  });

  // 음성 채널 입장 — 들어오거나 다른 채널로 옮길 때. 잠수 채널 · 제외 채널은 빼고, 사람마다 1분에 한 번
  client.on(Events.VoiceStateUpdate, (o, n) => {
    try {
      if (n.guild?.id !== config.guildId || n.member?.user?.bot) return;
      if (!n.channelId || n.channelId === o.channelId) return;
      if (n.channelId === n.guild.afkChannelId) return;
      if (excluded(n.channel)) return;
      const now = Date.now();
      if (now - (lastJoin.get(n.id) || 0) < JOIN_GAP_MS) return;
      lastJoin.set(n.id, now);
      bumpActivity(n.id, "vjoin", 1, n.channel, n.channelId);
    } catch (e) {
      console.error("활동 횟수(음성 입장) 오류:", e?.message || e);
    }
  });

  // 간격 기억은 한 시간마다 10분 넘게 지난 것을 비운다(지난 사람이 쌓이지 않게)
  setInterval(() => {
    const cut = Date.now() - 10 * 60 * 1000;
    for (const [k, t] of lastMsg) if (t < cut) lastMsg.delete(k);
    for (const [k, t] of lastJoin) if (t < cut) lastJoin.delete(k);
  }, 60 * 60 * 1000);
  setInterval(() => flushActivity(), FLUSH_MS);
  console.log(`✅ 활동 횟수 기록 시작 — 메시지 · 답장 · 멘션 · 반응 · 스레드 · 스티커 · 명령어 · 음성 입장 · 레벨 업, ${FLUSH_MS / 1000}초마다 기록`);
}
