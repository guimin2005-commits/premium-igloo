// ── 사이트 공지 → 디스코드 공지 채널 (20초 주기) ──
//    📌 사이트 글쓰기가 공지를 올리면 대기열(NoticeAnnounce)에 pending 이 쌓인다 — 여기서 공지 채널(BotSetting.noticeChannelId)에 보낸다.
//       action send: 새로 보내기(예약 글은 sendAt 이 지난 뒤) · edit: 보낸 메시지 고치기 · delete: 보낸 메시지 지우기(글 삭제 때 고른 경우)
//       모양은 봇 메시지 › 공지(noticePost) 디자인, 글마다 고친 디자인(template)이 있으면 그것. 값(vars)은 사이트가 글에서 만들어 둔다.
//    · pending → sending 으로 먼저 잡고(봇이 둘이어도 한 번만) 보낸 뒤 sent · 메시지 id 를 남긴다. 실패하면 failed + 사유(화면 칩)
//      sending 은 잡은 봇만 푼다(끝난 기록은 잡은 시각까지 같을 때만). 사이트는 그동안 상태를 두고 resync 만 남긴다
//    · 보내는 중에 사이트가 다시 저장 · 삭제했으면(resync) 끝낸 뒤 고치기 · 지우기 대기로 이어 간다
//    · 지우기는 글이 이미 없어 다시 저장할 길이 없다 — 일시 오류 · 멈춤이면 몇 번 더(1 · 2 · 3 · 4분 뒤)
//    · 멘션은 글마다 고른 것(none · everyone · here)만 울린다. 템플릿 본문에 적은 역할 멘션은 그대로 울린다
//    · 봇이 오래 꺼져 있다 켜지면 기한(6시간)이 지난 새 공지는 보내지 않고 expired 로 둔다 — 묵은 공지가 한꺼번에 나가지 않게
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { NoticeAnnounce, BotSetting } from "../db.js";
import { config } from "../config.js";
import { buildMessageFrom, loadTemplate, commonVars, dropVar } from "../botMessages.js";

const KEY = "noticePost";
const TICK_MS = 20 * 1000;
const STALE_MS = 5 * 60 * 1000; // sending 에 이만큼 멈춰 있으면 실패로(지우기는 다시 대기)
const EXPIRE_MS = 6 * 60 * 60 * 1000; // 보낼 시각에서 이만큼 지난 새 공지는 보내지 않는다
const DELETE_TRIES = 5; // 지우기 — 이만큼 해 보고 안 되면 failed
const BATCH = 5;
const BUTTON_LABEL = "사이트에서 보기"; // lib/noticeDiscord.js NOTICE_BUTTON_LABEL 과 같다
const MENTION_TEXT = { everyone: "@everyone", here: "@here" };

const safeUrl = (u) => {
  const s = String(u || "").trim();
  return /^https?:\/\/[^\s<>"]+$/i.test(s) && s.length <= 512 ? s : "";
};

// 디스코드 오류 → 화면에 보일 사유
function reasonOf(e) {
  const code = e?.code;
  if (code === 50001 || code === 50013) return "봇에게 공지 채널 권한이 없습니다.";
  if (code === 10003) return "공지 채널을 찾을 수 없습니다.";
  if (code === 10008) return "디스코드에서 지워진 글입니다.";
  if (code === 50035) return "디스코드가 메시지 모양을 거절했습니다.";
  return String(e?.message || e).slice(0, 300);
}
// 디스코드에 이미 없는 글 · 채널 — 지운 것으로 친다
const gone = (e) => e?.code === 10008 || e?.code === 10003;
// 다시 해 볼 만한 오류 — 권한 · 모양 거절 같은 4xx(429 빼고)는 다시 해도 같다
const transient = (e) => !(e?.code === 50001 || e?.code === 50013) && !(e?.status >= 400 && e?.status < 500 && e?.status !== 429);

async function channelOf(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

// 보낼 모양 — 꺼진 키 · 보낼 게 없으면 던진다(실패 사유로 남긴다)
async function compose(doc, guild) {
  const global = await loadTemplate(KEY);
  if (!global?.enabled) throw new Error("봇 메시지 › 공지가 꺼져 있습니다.");
  const mention = MENTION_TEXT[doc.mention] || "";
  const picked = doc.template && typeof doc.template === "object" ? { ...doc.template, enabled: true } : global;
  // 멘션 '없음' — {mention} 만 지운다("{mention} 새 공지" 가 줄째 빠지지 않게. 사이트 미리보기와 같은 dropVar)
  const tpl = mention ? picked : dropVar(picked, "mention");
  const vars = { ...commonVars(null, guild), ...(doc.vars && typeof doc.vars === "object" ? doc.vars : {}), mention };
  const payload = buildMessageFrom(KEY, tpl, vars);
  if (!payload) throw new Error("보낼 내용이 없습니다.");
  // 고른 멘션만 울린다(@here 도 everyone 으로 연다) — 이름 · 제목에 섞인 @everyone 은 울리지 않는다
  const roles = [...new Set([...String(tpl.content || "").matchAll(/<@&(\d{5,25})>/g)].map((m) => m[1]))].slice(0, 100);
  payload.allowedMentions = { parse: mention ? ["everyone"] : [], ...(roles.length ? { roles } : {}) };
  const url = safeUrl(vars.url);
  if (doc.button?.on !== false && url) {
    const label = String(doc.button?.label || "").trim().slice(0, 80) || BUTTON_LABEL;
    payload.components = [new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url))];
  }
  return payload;
}

// 끝난 기록 — 이 봇이 잡은 그대로일 때만(잡은 시각까지 같아야 — 다른 봇이 다시 잡은 건 건드리지 않는다). 맞았으면 true
//    잡은 동안 사이트가 다시 저장 · 삭제했으면(resync) 이어서 고치기 · 지우기 대기로 돌린다
async function finish(claimed, $set) {
  const prev = await NoticeAnnounce.findOneAndUpdate(
    { _id: claimed._id, status: "sending", claimedAt: claimed.claimedAt },
    { $set: { ...$set, resync: "" } },
    { new: false }
  ).lean();
  if (!prev) return false;
  if (prev.resync) {
    const at = { _id: claimed._id, status: $set.status }; // 그 사이 사이트가 또 바꿨으면 그쪽을 따른다
    const hasMessage = !!($set.messageId ?? prev.messageId);
    if (prev.resync === "delete") {
      // 글이 지워졌다 — 나간 글은 지우기 대기, 안 나갔으면 문서만
      if (hasMessage) await NoticeAnnounce.updateOne(at, { $set: { action: "delete", status: "pending", sendAt: new Date(), tries: 0, error: "" } });
      else await NoticeAnnounce.deleteOne(at);
    } else {
      await NoticeAnnounce.updateOne(at, { $set: { action: hasMessage ? "edit" : "send", status: "pending", error: "" } });
    }
  }
  return true;
}

// 보낸 기록 — 잡은 그대로가 아니어도(멈춤 정리로 failed 가 됐어도) 이 봇이 잡은 문서면 메시지 id 는 남긴다(고치기 · 지우기 대상)
async function recordSent(claimed, $set) {
  if (await finish(claimed, $set)) return;
  await NoticeAnnounce.updateOne({ _id: claimed._id, claimedAt: claimed.claimedAt }, { $set });
}

// ── 지우기 (글 삭제 때 고른 경우) — 디스코드에 이미 없으면 지운 것으로. 일시 오류면 몇 번 더, 그래도 안 되면 failed ──
async function removeOne(guild, claimed) {
  try {
    if (claimed.messageId && claimed.channelId) {
      const ch = guild.channels.cache.get(claimed.channelId) || (await guild.channels.fetch(claimed.channelId).catch((e) => {
        if (gone(e)) return null;
        throw e;
      }));
      if (ch?.messages) {
        await ch.messages.delete(claimed.messageId).catch((e) => {
          if (!gone(e)) throw e;
        });
      }
    }
    await NoticeAnnounce.deleteOne({ _id: claimed._id, claimedAt: claimed.claimedAt });
    console.log(`📢 공지 디스코드 글 지움: ${claimed.vars?.title || claimed.postId}`);
  } catch (e) {
    const tries = (claimed.tries || 0) + 1;
    const error = reasonOf(e);
    const again = transient(e) && tries < DELETE_TRIES;
    await finish(claimed, again ? { status: "pending", tries, sendAt: new Date(Date.now() + tries * 60 * 1000), error } : { status: "failed", tries, error }).catch(() => {});
    console.error(`📢 공지 디스코드 글 지우기 ${again ? `다시 (${tries})` : "실패"} (${claimed.postId}):`, error);
  }
}

async function processOne(guild, d) {
  // 보낼 시각도 다시 본다 — 목록을 읽은 뒤 사이트가 예약 시각을 미루면 잡지 않는다
  const claimed = await NoticeAnnounce.findOneAndUpdate(
    { _id: d._id, status: "pending", sendAt: { $lte: new Date() } },
    { $set: { status: "sending", claimedAt: new Date() } },
    { new: true }
  ).lean();
  if (!claimed) return;
  if (claimed.action === "delete") return removeOne(guild, claimed);
  let sent = null; // 새로 보낸 기록 — 나간 뒤 기록이 실패하면 한 번 더 남긴다
  try {
    // ── 고치기 (보낸 글이 있으면 send 도 고치기로) ──
    if (claimed.messageId) {
      const ch = await channelOf(guild, claimed.channelId);
      if (!ch?.messages) throw Object.assign(new Error("공지 채널을 찾을 수 없습니다."), { code: 10003 });
      const payload = await compose(claimed, guild);
      try {
        await ch.messages.edit(claimed.messageId, {
          content: payload.content ?? null,
          embeds: payload.embeds ?? [],
          components: payload.components ?? [],
          allowedMentions: payload.allowedMentions,
        });
      } catch (e) {
        // 디스코드에서 지워진 글 — 메시지 id 를 비워 다음 저장 때 새로 보낼 수 있게
        if (e?.code === 10008) {
          await finish(claimed, { status: "failed", action: "send", messageId: "", error: reasonOf(e) });
          return;
        }
        throw e;
      }
      await finish(claimed, { status: "sent", doneAt: new Date(), error: "" });
      console.log(`📢 공지 디스코드 글 고침: ${claimed.vars?.title || claimed.postId}`);
      return;
    }

    // ── 새로 보내기 ──
    if (Date.now() - new Date(claimed.sendAt || 0).getTime() > EXPIRE_MS) {
      await finish(claimed, { status: "expired", error: "기한이 지나 보내지 않았습니다." });
      return;
    }
    const setting = await BotSetting.findOne({ key: "main" }, { noticeChannelId: 1 }).lean();
    const channelId = setting?.noticeChannelId || "";
    if (!channelId) throw new Error("공지 채널이 정해지지 않았습니다.");
    const ch = await channelOf(guild, channelId);
    if (!ch?.isTextBased?.() || typeof ch.send !== "function") throw new Error("공지 채널을 찾을 수 없습니다.");
    const payload = await compose(claimed, guild);
    const msg = await ch.send(payload);
    const now = new Date();
    sent = { status: "sent", messageId: msg.id, channelId: ch.id, sentAt: now, doneAt: now, error: "" };
    await recordSent(claimed, sent);
    console.log(`📢 공지 디스코드 보냄: ${claimed.vars?.title || claimed.postId}`);
  } catch (e) {
    // 메시지는 나갔는데 기록만 실패 — 실패로 덮어쓰지 않고 한 번 더 남긴다(못 남겨도 sending 으로 멈춰 다시 보내지는 않는다)
    if (sent) {
      console.error(`📢 공지 기록 오류 (${claimed.postId}):`, e?.message || e);
      await recordSent(claimed, sent).catch((e2) => console.error(`📢 공지 기록 다시 오류 (${claimed.postId}):`, e2?.message || e2));
      return;
    }
    const error = reasonOf(e);
    await finish(claimed, { status: "failed", error }).catch(() => {});
    console.error(`📢 공지 디스코드 실패 (${claimed.postId}):`, error);
  }
}

let ticking = false;
let started = false;

async function tick(client) {
  if (ticking) return;
  ticking = true;
  try {
    // 보내다 멈춘 건(봇 재시작 등) — 기준은 잡은 시각. 지우기는 다시 대기(횟수 안에서), 나머지는 실패로 돌려 화면에 보이게
    const staleAt = new Date(Date.now() - STALE_MS);
    await NoticeAnnounce.updateMany(
      { status: "sending", action: "delete", claimedAt: { $lt: staleAt }, tries: { $not: { $gte: DELETE_TRIES - 1 } } },
      { $set: { status: "pending", sendAt: new Date() }, $inc: { tries: 1 } }
    );
    await NoticeAnnounce.updateMany(
      { status: "sending", claimedAt: { $lt: staleAt } },
      { $set: { status: "failed", resync: "", error: "보내는 중 중단되었습니다. 글을 다시 저장해 주세요." } }
    );
    const due = await NoticeAnnounce.find({ status: "pending", sendAt: { $lte: new Date() } }).sort({ sendAt: 1 }).limit(BATCH).lean();
    if (!due.length) return;
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) return;
    for (const d of due) await processOne(guild, d);
  } catch (e) {
    console.error("공지 디스코드 주기 오류:", e?.message || e);
  } finally {
    ticking = false;
  }
}

export function startNoticeAnnounce(client) {
  if (started) return;
  started = true;
  tick(client);
  setInterval(() => tick(client), TICK_MS);
  console.log("✅ 사이트 공지 → 디스코드 (20초 주기)");
}
