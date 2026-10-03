import mongoose from "mongoose";

// 📌 디스코드 공지 대기열 — 공지 글 하나에 한 문서. 사이트(글쓰기 · lib/noticeAnnounce.js)가 넣고 봇(bot/src/features/noticeAnnounce.js)이 보낸다.
//    action: send(새로 보내기) · edit(보낸 글 고치기) · delete(보낸 글 지우기)
//    status: pending → sending → sent | failed · off(끔 · 가린 글) · expired(봇이 늦게 켜져 기한 지남)
//    sending 은 봇만 푼다 — 그동안 사이트는 resync 만 남긴다(봇이 둘이어도 한 번만 보내게)
//    봇은 Post 를 읽지 않는다 — 보낼 값(vars)은 사이트가 글에서 만들어 넣는다(lib/noticeDiscord.js noticeVars).
//    bot/src/db.js 의 NoticeAnnounceSchema 와 이름 · 모양 · 기본값이 같아야 한다.
const NoticeAnnounceSchema = new mongoose.Schema({
  postId: { type: String, required: true, unique: true },
  on: { type: Boolean, default: true },                          // 글쓰기의 '디스코드 공지' 스위치
  vars: { type: mongoose.Schema.Types.Mixed, default: {} },      // { title, summary, url, tag, banner, author }
  template: { type: mongoose.Schema.Types.Mixed, default: null }, // 글마다 고친 디자인 — null 이면 봇 메시지 › 공지(noticePost)
  mention: { type: String, default: "none" },                    // none | everyone | here
  button: {
    on: { type: Boolean, default: true },
    label: { type: String, default: "" },                        // 비우면 "사이트에서 보기"
  },
  sendAt: { type: Date, default: Date.now, index: true },        // 예약 글은 공개 시각
  action: { type: String, default: "send" },
  status: { type: String, default: "pending", index: true },
  channelId: { type: String, default: "" },                      // 보낸 채널 · 메시지 — 고치기 · 지우기에 쓴다
  messageId: { type: String, default: "" },
  error: { type: String, default: "" },
  claimedAt: { type: Date, default: null },                      // 봇이 잡은 시각 — 5분 넘게 멈추면 봇이 failed 로 돌린다(지우기는 다시 대기)
  resync: { type: String, default: "" },                         // 봇이 처리하는 중(sending)에 사이트가 다시 저장 · 삭제함 — edit | delete. 봇이 끝낸 뒤 이어 간다
  tries: { type: Number, default: 0 },                           // 지우기를 다시 한 횟수 — 일시 오류면 몇 번 더
  sentAt: { type: Date, default: null },                         // 처음 보낸 시각
  doneAt: { type: Date, default: null },                         // 마지막으로 처리한 시각(보내기 · 고치기)
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.NoticeAnnounce || mongoose.model("NoticeAnnounce", NoticeAnnounceSchema);
