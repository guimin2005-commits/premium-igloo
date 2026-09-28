import mongoose from "mongoose";

const InquirySchema = new mongoose.Schema({
  user: { type: String, required: true }, // 디스코드 닉네임 — 표시용(작성 당시 이름)
  mainType: { type: String, required: true }, // 일반, 오류, 신고
  subType: { type: String }, // 질문, 건의 등
  errorDesc: { type: String }, // 오류 설명
  reportDate: { type: String }, // 발생 일시
  reportType: { type: String }, // 신고 유형
  productName: { type: String }, // 환불·교환 대상 상품
  refundType: { type: String }, // 환불 · 교환 구분
  title: { type: String }, // 자동 생성 제목
  content: { type: String, required: true }, // 상세 내용
  // 📌 디스코드 유저 ID — 본인 문의 조회(ID 우선, ID 가 없는 옛 문서만 이름) · 답변 DM 발송. 비회원 문의는 빈 값
  userId: { type: String, default: "", index: true },
  notifyDiscord: { type: Boolean, default: true }, // 답변 시 디스코드 DM 수신 동의
  email: { type: String }, // 수신 이메일 (미사용)
  answer: { type: String, default: "" }, // 관리자 답변 내용
  answeredAt: { type: Date }, // 관리자 답변 일시
  status: { type: String, default: "접수 중" }, // 접수 중, 답변 완료
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Inquiry || mongoose.model("Inquiry", InquirySchema);