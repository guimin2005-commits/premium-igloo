import mongoose from "mongoose";

// 📌 서포터즈 공지 댓글 — 공지 창 아래에 달리는 짧은 대화.
//    확인 표시(SupporterAck)와는 별개다: 확인은 "읽었다" 한 번, 댓글은 질문·답변이 오갈 수 있어 여러 건.
//    작성자 정보(userName/userImage)를 댓글에 박아 두는 이유: 화면에서 매번 디스코드를 다시 조회하지 않기 위해.
//    글이 지워져도 댓글은 남는다(고아 문서) — 관리자 목록은 공지 id 로만 묶으므로 해가 없다.
const SupporterCommentSchema = new mongoose.Schema({
  postId: { type: String, required: true },     // Post._id 문자열 (category "서포터즈" 글만 — 라우트에서 검증)
  userId: { type: String, required: true },
  userName: { type: String, default: "" },      // 작성 당시 이름
  userImage: { type: String, default: "" },     // 작성 당시 프로필 사진 URL
  content: { type: String, required: true },    // 1~1000자 (라우트에서 검증)
  createdAt: { type: Date, default: Date.now },
});

// 공지별 댓글을 오래된 순으로 — postId 단독 조회(개수 집계)도 이 인덱스의 접두로 탄다
SupporterCommentSchema.index({ postId: 1, createdAt: 1 });
// 하루 작성 건수 제한(userId + 오늘 이후)이 인덱스만 타도록
SupporterCommentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.SupporterComment || mongoose.model("SupporterComment", SupporterCommentSchema);
