import mongoose from "mongoose";

// 답변 1개
// ⚠️ 필드명이 'type'이라 인라인으로 쓰면 몽구스가 객체 전체를 타입 선언으로 오인함.
//    반드시 별도 스키마 + { type: String } 형태로 감싸야 함.
const AnswerSchema = new mongoose.Schema({
  qid: { type: String, default: "" },
  label: { type: String, default: "" },   // 제출 시점의 질문 문구 (질문이 바뀌어도 보존)
  type: { type: String, default: "short" },
  value: { type: mongoose.Schema.Types.Mixed, default: "" }, // 문자열 또는 문자열 배열
}, { _id: false });

// 📌 대회 참가 설문 응답
const SurveyResponseSchema = new mongoose.Schema({
  postId: { type: String, required: true, index: true },  // 대상 대회 글 id
  userId: { type: String, default: "" },                   // 디스코드 ID (중복 제출 방지)
  userName: { type: String, default: "" },                 // 디스코드 닉네임
  avatar: { type: String, default: "" },
  answers: { type: [AnswerSchema], default: [] },
  // 📌 개인정보 수집·이용 동의 기록 — 무엇에 동의했는지(snapshot)까지 남겨야 근거가 된다
  privacyConsent: {
    agreed: { type: Boolean, default: false },
    at: { type: Date, default: null },
    snapshot: { type: String, default: "" },   // 동의 시점의 안내문 원문
  },
  createdAt: { type: Date, default: Date.now },
});

// 한 대회당 유저 1회 제출
SurveyResponseSchema.index({ postId: 1, userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: "string", $ne: "" } } });

export default mongoose.models.SurveyResponse || mongoose.model("SurveyResponse", SurveyResponseSchema);
