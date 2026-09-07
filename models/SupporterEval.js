import mongoose from "mongoose";

// 📌 서포터즈 월간 평가 — 활동량은 객관 지표(채팅 횟수·음성 분)로 재고, 등급·지급액은 관리자가 직접 적는다.
//    chatCount/voiceMin 은 평가를 저장한 시점의 스냅샷이다. XpLog 는 60일 TTL 이라
//    나중에 다시 세면 값이 사라지므로, 지급 근거를 여기 굳혀 둔다.
//    status: draft(평가 중 — 본인 화면엔 "평가 중"으로만) → paid(지급 완료, 잠금)
const SupporterEvalSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  month: { type: String, required: true },      // "YYYY-MM" (KST)
  chatCount: { type: Number, default: 0 },
  voiceMin: { type: Number, default: 0 },
  grade: { type: String, default: "" },         // 자유 표기 — "S/A/B/C" 등 관리자가 적는다
  xp: { type: Number, default: 0 },
  point: { type: Number, default: 0 },
  note: { type: String, default: "" },          // 관리자 코멘트 — 본인에게 보인다
  status: { type: String, default: "draft", index: true }, // "draft" | "paid"
  paidAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// 한 사람에게 한 달 평가는 하나뿐 — 지급(draft→paid) 조건부 갱신이 이 유일성에 기댄다
SupporterEvalSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.models.SupporterEval || mongoose.model("SupporterEval", SupporterEvalSchema);
