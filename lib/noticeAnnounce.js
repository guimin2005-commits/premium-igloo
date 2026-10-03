/* 📌 디스코드 공지 대기열(models/NoticeAnnounce.js) 쓰기 — 글 등록 · 수정 · 삭제(app/api/posts)가 부른다. 서버 전용.
   사이트는 넣기만 하고 보내기 · 고치기 · 지우기는 봇(bot/src/features/noticeAnnounce.js)이 한다.
   · 보내기: 공지사항 · 스위치 켬 · 가리지 않은 글. 예약 글은 공개 시각(sendAt)에
   · 보낸 글을 고치면: 글쓰기에서 '같이 고치기'를 켠 저장만 edit
   · 글을 지우면: '디스코드 공지도 지우기'를 고른 삭제만 delete, 아니면 대기열 문서만 지운다
   상태는 status 하나로 본다 — 봇은 pending 만 잡는다. sending 은 봇만 풀고, 사이트는 그동안 resync(edit | delete)만 남겨 봇이 끝낸 뒤 이어 가게 한다
   사이트 쓰기는 읽은 상태 그대로일 때만 — 그 사이 봇이 잡았거나 끝냈으면 다시 읽어 맞춘다 */
import NoticeAnnounce from "@/models/NoticeAnnounce";
import { cleanTemplate } from "@/lib/botMessageClean";
import { NOTICE_KEY, noticeVars, cleanMention, cleanButton } from "@/lib/noticeDiscord";

const isNotice = (post) => post?.category === "공지사항";
const wantSend = (post, on) => !!on && isNotice(post) && !post?.hidden;

// 예약 글은 공개 시각, 이미 공개된 글은 지금
function sendAtOf(post) {
  const now = new Date();
  const p = post?.publishAt ? new Date(post.publishAt) : null;
  return p && Number.isFinite(p.getTime()) && p > now ? p : now;
}

// 📌 글쓰기가 보낸 discord 칸 → { input } (없으면 input:null) 또는 { error }
//    { on, sync, mention, button:{on,label}, template|null } — template 은 봇 메시지 저장과 같은 검사
export function readDiscordInput(raw) {
  if (raw == null) return { input: null };
  if (typeof raw !== "object" || Array.isArray(raw)) return { error: "디스코드 공지 값이 올바르지 않습니다." };
  let template = null;
  if (raw.template != null) {
    const c = cleanTemplate(NOTICE_KEY, raw.template);
    if (c.error) return { error: `디스코드 공지 — ${c.error}` };
    template = { ...c.tpl, enabled: true, card: false };
  }
  return {
    input: {
      on: raw.on === true,
      sync: raw.sync === true,
      mention: cleanMention(raw.mention),
      button: cleanButton(raw.button),
      template,
    },
  };
}

// 화면에 돌려줄 모양 — 메시지 id 는 내보내지 않는다
export function announceView(doc) {
  if (!doc) return null;
  return {
    on: doc.on !== false,
    status: doc.status || "pending",
    action: doc.action || "send",
    sendAt: doc.sendAt || null,
    sentAt: doc.sentAt || null,
    doneAt: doc.doneAt || null,
    error: doc.error || "",
    hasMessage: !!doc.messageId,
    mention: cleanMention(doc.mention),
    button: cleanButton(doc.button),
    template: doc.template && typeof doc.template === "object" ? doc.template : null,
    updatedAt: doc.updatedAt || null,
  };
}

// 처음 넣기 · 다시 넣기 — 스위치를 끈 새 글은 넣지 않는다
export async function queueNotice(post, input, by = "") {
  if (!input?.on || !isNotice(post)) return null;
  const now = new Date();
  return NoticeAnnounce.findOneAndUpdate(
    { postId: String(post._id) },
    {
      $set: {
        on: true,
        vars: noticeVars(post),
        template: input.template,
        mention: input.mention,
        button: input.button,
        action: "send",
        status: wantSend(post, true) ? "pending" : "off",
        sendAt: sendAtOf(post),
        error: "",
        updatedAt: now,
        updatedBy: by,
      },
      $setOnInsert: { channelId: "", messageId: "", claimedAt: null, sentAt: null, doneAt: null, createdAt: now },
    },
    { upsert: true, returnDocument: "after" }
  ).lean();
}

// 📌 글 수정 뒤 — input 은 글쓰기에서 온 값(없으면 다른 화면의 수정: 고정 · 우승자 등)
//    · 아직 안 보낸 글: 글쓰기 저장이면 그 뜻대로(켬 → 대기 · 끔 → off), 다른 수정이면 대기 · off 만 값 · 시각을 따라간다(실패 · 기한 지남은 그대로)
//    · 보낸 글: 값만 새로 두고, 글쓰기에서 '같이 고치기'를 켰을 때만 edit
//    · 봇이 처리하는 중(sending): 상태는 두고 값만 — 글쓰기 저장이 켬(보낸 글은 '같이 고치기')이면 resync=edit 를 남겨 봇이 끝낸 뒤 고치기로 이어 간다
export async function syncNotice(post, input, by = "", again = true) {
  const postId = String(post._id);
  const doc = await NoticeAnnounce.findOne({ postId }).lean();
  if (!doc) return input?.on ? queueNotice(post, input, by) : null;

  const now = new Date();
  const $set = { vars: noticeVars(post), updatedAt: now, updatedBy: by };
  if (input) Object.assign($set, { template: input.template, mention: input.mention, button: input.button });

  if (doc.status === "sending") {
    const redo = doc.messageId ? input?.sync : input?.on && wantSend(post, true);
    if (redo && doc.resync !== "delete") $set.resync = "edit";
  } else if (doc.messageId) {
    if (input?.sync) Object.assign($set, { action: "edit", status: "pending", error: "" });
  } else {
    const on = input ? input.on : doc.on !== false;
    if (input) $set.on = on;
    const follow = input || (on && (doc.status === "pending" || doc.status === "off"));
    if (follow) {
      Object.assign(
        $set,
        wantSend(post, on) ? { action: "send", status: "pending", sendAt: sendAtOf(post), error: "" } : { action: "send", status: "off", error: "" }
      );
    }
  }
  // 읽은 상태 그대로일 때만 — 그 사이 봇이 잡았거나 끝냈으면 한 번 더 읽어 맞춘다
  const r = await NoticeAnnounce.findOneAndUpdate({ _id: doc._id, status: doc.status }, { $set }, { returnDocument: "after" }).lean();
  if (r || !again) return r;
  return syncNotice(post, input, by, false);
}

// 📌 글 삭제 뒤 — removeMessage 면 봇이 디스코드 글을 지운다. 아니면 대기열 문서만 지운다
//    · 보낸 글 + 지우기: delete 대기 · 보낸 글 + 남기기 · 안 보낸 글: 문서만 지운다(예약 공지는 취소)
//    · 봇이 처리하는 중(sending): 상태는 두고 resync=delete — 봇이 끝낸 뒤 나간 글은 지우고 문서도 지운다(안 나간 글을 지우는 삭제도 같다)
export async function dropNotice(postId, removeMessage, by = "") {
  for (let i = 0; i < 3; i++) {
    const doc = await NoticeAnnounce.findOne({ postId: String(postId) }).lean();
    if (!doc) return null;
    const at = { _id: doc._id, status: doc.status }; // 읽은 상태 그대로일 때만 — 바뀌었으면 다시 읽는다
    const sending = doc.status === "sending";
    const stamp = { updatedAt: new Date(), updatedBy: by };
    let done;
    if (doc.messageId ? !removeMessage : !sending) done = (await NoticeAnnounce.deleteOne(at)).deletedCount;
    else if (sending) done = (await NoticeAnnounce.updateOne(at, { $set: { resync: "delete", ...stamp } })).matchedCount;
    else done = (await NoticeAnnounce.updateOne(at, { $set: { action: "delete", status: "pending", sendAt: new Date(), tries: 0, error: "", ...stamp } })).matchedCount;
    if (done) return null;
  }
  return null;
}
