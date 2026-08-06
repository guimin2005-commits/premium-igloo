import mongoose from "mongoose";

// 📌 대회 참가 설문 응답
const SurveyResponseSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },  // 대상 대회 글 id
  userId: { type: String, default: "" },                   // 디스코드 ID (중복 제출 방지)
  userName: { type: String, default: "" },                 // 디스코드 닉네임
  avatar: { type: String, default: "" },
  answers: {
    type: [{
      qid: String,
      label: String,                                        // 제출 시점의 질문 문구 (질문이 바뀌어도 보존)
      type: String,
      value: mongoose.Schema.Types.Mixed,                   // 문자열 또는 문자열 배열
    }],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
});

// 한 대회당 유저 1회 제출
SurveyResponseSchema.index({ postId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "string", $ne: "" } } });

export default mongoose.models.SurveyResponse || mongoose.model("SurveyResponse", SurveyResponseSchema);
