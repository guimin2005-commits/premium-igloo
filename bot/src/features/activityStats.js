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
//    📌 XP 획득 중단(관리자 — xpStop.js) 중인 사람은 아무것도 세지 않는다(받기 · 레벨 업 포함) — 퀘스트 진행도도 그동안 멈춘다
//    📌 2026-10-04 #203 "지운 메시지는 뺌" — 센 메시지(msg, 스레드면 threadmsg 도)를 메시지 id 로 48시간 기억했다가 지워지면
//       (게이트웨이 MESSAGE_DELETE · MESSAGE_DELETE_BULK — raw 패킷이라 봇 캐시에 없는 메시지도 받는다) 센 그 줄(유저 · 날짜 · 시 · 채널)에서 1씩 뺀다.
//       0 아래로는 내리지 않는다. 메시지 퀘스트 · 서포터즈 채팅 수(lib/supporters.js)가 이 수를 읽으므로 같이 빠진다.
//       ⚠ 기억은 메모리뿐이다 — 봇이 재시작하기 전에 센 메시지 · 48시간보다 오래된 메시지는 지워져도 빼지 못한다(그대로 둔다).
//       3초 간격 · 제외 채널 등으로 세지 않은 메시지는 기억하지 않는다(뺄 것도 없다). 답장 · 멘션 · 스티커 같은 다른 종류는 그대로 둔다
import { Events, MessageType } from "discord.js";
import { ActivityStat } from "../db.js";
import { getChannelPolicy } from "../channelConfigs.js";
import { isLevelOpen } from "../botSettings.js";
import { isXpStopped } from "../xpStop.js";
import { config } from "../config.js";

const FLUSH_MS = 20_000;
const MSG_GAP_MS = 3_000;
const JOIN_GAP_MS = 60_000;
const TTL_DAYS = 70;
const KST = 9 * 60 * 60 * 1000;
const SEEN_TTL_MS = 48 * 60 * 60 * 1000; // 센 메시지를 기억하는 시간(지우면 빼려고)
const SEEN_MAX = 50_000; // 넘치면 오래된 것부터 잊는다(메모리 상한)

const pending = new Map(); // "u|d|h|k|ch" → { u, d, h, k, ch, pc, n }
const minus = new Map(); // "u|d|h|k|ch" → { u, d, h, k, ch, n } — 이미 DB 에 쓴 줄에서 뺄 수(지운 메시지)
const counted = new Map(); // 메시지 id → { at, rows: [센 줄 { u, d, h, k, ch }] } — 넣은 순서 = 오래된 순
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

// 📌 한 번 세기 — 다른 기능(xp.js 레벨 업 등)도 이걸 부른다. channel 이 없으면 chId(글자)만 적는다.
//    레벨 비공개 · XP 획득 중단 중이면 세지 않는다(맨 위 📌). 센 줄 { u, d, h, k, ch } 을 돌려준다(안 셌으면 null — 지운 메시지 빼기가 쓴다)
export function bumpActivity(userId, k, n = 1, channel = null, chId = "") {
  if (!started || !userId || !(n > 0) || !isLevelOpen() || isXpStopped(userId)) return null;
  const { d, h } = kstParts();
  const ch = channel ? chanOf(channel) : String(chId || "");
  const pc = channel ? catOf(channel) : "";
  const key = `${userId}|${d}|${h}|${k}|${ch}`;
  const p = pending.get(key) || { u: userId, d, h, k, ch, pc, n: 0 };
  p.n += n;
  pending.set(key, p);
  return { u: userId, d, h, k, ch };
}

// 센 메시지 기억 — 48시간 · 최대 SEEN_MAX 건. 오래된 것(앞)부터 잊는다
function rememberMessage(id, rows) {
  if (!id || !rows.length) return;
  const now = Date.now();
  counted.set(id, { at: now, rows });
  for (const [k, v] of counted) {
    if (counted.size <= SEEN_MAX && now - v.at < SEEN_TTL_MS) break;
    counted.delete(k);
  }
}

// 지운 메시지 하나 — 센 줄마다 1 뺀다. 아직 안 쓴 몫(pending)이 있으면 거기서, 없으면 DB 에서 뺄 수(minus)로
function unbumpMessage(id) {
  const c = counted.get(id);
  if (!c) return;
  counted.delete(id);
  if (Date.now() - c.at >= SEEN_TTL_MS) return;
  for (const r of c.rows) {
    const key = `${r.u}|${r.d}|${r.h}|${r.k}|${r.ch}`;
    const p = pending.get(key);
    if (p && p.n > 0) {
      p.n -= 1;
      if (p.n <= 0) pending.delete(key);
      continue;
    }
    const m = minus.get(key) || { u: r.u, d: r.d, h: r.h, k: r.k, ch: r.ch, n: 0 };
    m.n += 1;
    minus.set(key, m);
  }
}

// 퇴장 초기화(leaveReset.js) — 아직 안 쓴 이 사람 몫도 버린다(지운 기록이 다시 생기지 않게). 지운 메시지 기억 · 뺄 수도 같이
export function dropActivity(userId) {
  for (const [key, p] of pending) if (p.u === userId) pending.delete(key);
  for (const [key, m] of minus) if (m.u === userId) minus.delete(key);
  for (const [id, c] of counted) if (c.rows[0]?.u === userId) counted.delete(id);
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
  if (!pending.size && !minus.size) return;
  const rows = [...pending.values()].filter((r) => r.n > 0);
  pending.clear();
  const subs = [...minus.values()].filter((r) => r.n > 0);
  minus.clear();
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
  //    더하기를 먼저 끝낸 뒤 빼기 — 같은 줄의 더하기가 아직 안 들어갔는데 빼기가 0 에 걸려 사라지지 않게
  let err = null;
  if (ops.length) await ActivityStat.bulkWrite(ops, { ordered: false }).catch((e) => (err = e));
  // 📌 지운 메시지 빼기 — 있는 줄에서만(새로 만들지 않는다), 0 아래로는 안 내린다(파이프라인 갱신 — 봇 mongoose 8 은 옵션 없이 된다)
  if (subs.length) {
    await ActivityStat.bulkWrite(
      subs.map((r) => ({
        updateOne: {
          filter: { u: r.u, d: r.d, h: r.h, k: r.k, ch: r.ch, n: { $gt: 0 } },
          update: [{ $set: { n: { $max: [0, { $subtract: ["$n", r.n] }] } } }],
        },
      })),
      { ordered: false }
    ).catch((e) => (err = err || e));
  }
  if (err) throw err;
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
      // 센 줄을 메시지 id 로 기억한다 — 지우면 같은 줄에서 뺀다(맨 위 📌 #203)
      const seen = [bumpActivity(u, "msg", 1, m.channel)];
      if (isThread(m.channel)) seen.push(bumpActivity(u, "threadmsg", 1, m.channel));
      rememberMessage(m.id, seen.filter(Boolean));
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

  // 📌 지운 메시지 — raw 패킷(MESSAGE_DELETE { id } · MESSAGE_DELETE_BULK { ids }). discord.js 의 MessageDelete 는 캐시에 있는 메시지만 오므로 패킷을 본다.
  //    센 적 있는 메시지(48시간 기억)만 뺀다 — 맨 위 📌 #203
  client.on("raw", (p) => {
    try {
      if (p?.t !== "MESSAGE_DELETE" && p?.t !== "MESSAGE_DELETE_BULK") return;
      if (p.d?.guild_id !== config.guildId) return;
      const ids = p.t === "MESSAGE_DELETE" ? [p.d.id] : Array.isArray(p.d.ids) ? p.d.ids : [];
      for (const id of ids) unbumpMessage(String(id || ""));
    } catch (e) {
      console.error("활동 횟수(지운 메시지) 오류:", e?.message || e);
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

  // 간격 기억은 한 시간마다 10분 넘게 지난 것을 비운다(지난 사람이 쌓이지 않게). 센 메시지 기억은 48시간 지난 것을 앞에서부터 비운다
  setInterval(() => {
    const now = Date.now();
    const cut = now - 10 * 60 * 1000;
    for (const [k, t] of lastMsg) if (t < cut) lastMsg.delete(k);
    for (const [k, t] of lastJoin) if (t < cut) lastJoin.delete(k);
    for (const [k, v] of counted) {
      if (now - v.at < SEEN_TTL_MS) break;
      counted.delete(k);
    }
  }, 60 * 60 * 1000);
  setInterval(() => flushActivity(), FLUSH_MS);
  console.log(`✅ 활동 횟수 기록 시작 — 메시지 · 답장 · 멘션 · 반응 · 스레드 · 스티커 · 명령어 · 음성 입장 · 레벨 업, ${FLUSH_MS / 1000}초마다 기록`);
}
