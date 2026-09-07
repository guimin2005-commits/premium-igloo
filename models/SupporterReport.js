import mongoose from "mongoose";

// 📌 서포터즈 → 관리자 제출함 — 유저 신고(report)와 운영 피드백(feedback)을 한 컬렉션에 둔다.
//    유형이 달라도 처리 흐름(접수 → 관리자 답변 → 완료)이 같아서 나누지 않는다.
//    status: open(접수) → done(처리 완료). 답변은 본인에게 보이므로 adminReply 를 넣을 때 repliedAt 을 함께 굳힌다.
const SupporterReportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  type: { type: String, required: true, enum: ["report", "feedback"] },
  target: { type: String, default: "" },        // 신고 대상(닉네임/ID) — feedback 이면 빈 문자열
  content: { type: String, required: true },    // 1~2000자 (라우트에서 검증)
  status: { type: String, default: "open", enum: ["open", "done"] },
  adminReply: { type: String, default: "" },
  repliedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

// 본인 목록(최신순)과 관리자 상태별 목록이 각각 인덱스만 타도록
SupporterReportSchema.index({ userId: 1, createdAt: -1 });
SupporterReportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.models.SupporterReport || mongoose.model("SupporterReport", SupporterReportSchema);
