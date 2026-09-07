import mongoose from "mongoose";

// 📌 서포터즈 공지 이모지 반응 — 디스코드 메시지 반응처럼 한 사람이 한 공지에 이모지별로 한 번씩.
//    글로 적기엔 가벼운 "봤어요 👍 / 알겠습니다 ✅" 를 댓글 대신 받는 자리다.
//    이모지 종류는 라우트의 화이트리스트로 잠근다 — 아무 문자나 들어오면 목록이 지저분해진다.
const SupporterReactionSchema = new mongoose.Schema({
  postId: { type: String, required: true },     // Post._id 문자열 (category "서포터즈" 글만 — 라우트에서 검증)
  userId: { type: String, required: true },
  emoji: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// (postId, userId, emoji) 유일 — 같은 이모지를 두 번 누르면 토글로 지운다
SupporterReactionSchema.index({ postId: 1, userId: 1, emoji: 1 }, { unique: true });
SupporterReactionSchema.index({ postId: 1 });

export default mongoose.models.SupporterReaction || mongoose.model("SupporterReaction", SupporterReactionSchema);
