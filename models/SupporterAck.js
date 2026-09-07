import mongoose from "mongoose";

// 📌 서포터즈 공지 확인 표시 — "이 공지를 읽었다"를 한 사람당 한 공지에 한 번만 남긴다.
//    댓글 대신 체크 하나로 끝내는 이유: 관리자가 원하는 건 "누가 아직 안 읽었나"이지 대화가 아니다.
//    체크를 풀면 문서를 지운다(상태 필드 없음) — 있으면 확인, 없으면 미확인.
const SupporterAckSchema = new mongoose.Schema({
  postId: { type: String, required: true },     // Post._id 문자열 (category "서포터즈" 글만 — 라우트에서 검증)
  userId: { type: String, required: true },
  userName: { type: String, default: "" },      // 체크 당시 이름 — 관리자 현황에 그대로 보인다
  createdAt: { type: Date, default: Date.now },
});

// (postId, userId) 유일 — 연타·동시 요청이 와도 한 건만 남고, postId 단독 조회는 이 인덱스의 접두로 탄다
SupporterAckSchema.index({ postId: 1, userId: 1 }, { unique: true });
// 본인이 확인한 공지 목록(userId 로만 찾는다)
SupporterAckSchema.index({ userId: 1 });

export default mongoose.models.SupporterAck || mongoose.model("SupporterAck", SupporterAckSchema);
