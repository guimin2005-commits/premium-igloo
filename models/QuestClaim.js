import mongoose from "mongoose";

// 📌 일일 퀘스트 보상 수령 기록 — 하루 한 퀘스트당 한 번만 받을 수 있게 막는 자물쇠.
//    (userId, date, questId) 유니크 인덱스가 중복 수령의 최종 방어선이다.
//    동시에 두 번 눌러도 두 번째 insert가 11000(duplicate key)으로 튕긴다.
const QuestClaimSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  // 주기 잠금 키 — daily "2026-08-31" / weekly "2026-W0825" / monthly "2026-08"
  date: { type: String, required: true },
  questId: { type: String, required: true },           // DailyQuest._id 문자열
  questName: { type: String, default: "" },            // 수령 당시 이름 (정의가 바뀌어도 기록은 남게)
  amount: { type: Number, default: 0 },                // 지급한 XP
  createdAt: { type: Date, default: Date.now },
});

QuestClaimSchema.index({ userId: 1, date: 1, questId: 1 }, { unique: true });

export default mongoose.models.QuestClaim || mongoose.model("QuestClaim", QuestClaimSchema);
