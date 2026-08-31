import mongoose from "mongoose";

// 📌 일일 퀘스트 정의 — 관리자가 /admin/bot?tab=quests 에서 직접 등록·수정한다.
//    진행도는 XpLog(봇이 기록하는 XP 지급 로그)의 "오늘(KST)" 분량으로 서버에서 계산한다.
//    별도 추적 컬렉션을 만들지 않으므로, 봇이 기록하는 활동만 퀘스트 대상이 될 수 있다.
const DailyQuestSchema = new mongoose.Schema({
  name: { type: String, required: true },              // "첫 대화"
  desc: { type: String, default: "" },                 // 유저에게 보여줄 한 줄 설명
  // 무엇을 세는가 — XpLog.reason 과 1:1. "any"는 사유 무관 전체.
  reason: { type: String, default: "chat", enum: ["chat", "voice", "attend", "any"] },
  // 세는 방식 — count: 지급 건수 / xp: XP 합계
  metric: { type: String, default: "count", enum: ["count", "xp"] },
  target: { type: Number, default: 1, min: 1 },        // 목표치
  rewardXp: { type: Number, default: 0, min: 0 },      // 달성 보상 (0이면 보상 없는 목표)
  enabled: { type: Boolean, default: true },
  order: { type: Number, default: 0 },                 // 표시 순서 (작을수록 위)
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.DailyQuest || mongoose.model("DailyQuest", DailyQuestSchema);
