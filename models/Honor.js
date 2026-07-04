import mongoose from "mongoose";

// 📌 명예의 전당 수동 기록 (LEVEL 시즌 1등, 이벤트 우승 등 대회 외 기록용)
const HonorSchema = new mongoose.Schema({
  category: { type: String, default: "대회" },   // 예: SYSTEM : LEVEL, 대회, 이벤트
  title: { type: String, required: true },        // 예: LEVEL SEASON 1
  winner: { type: String, required: true },       // 우승자/1등
  detail: { type: String, default: "" },          // 부가 설명 (보상 등)
  dateLabel: { type: String, default: "" },       // 표시용 기간 (예: 2026.01 ~ 2026.06)
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Honor || mongoose.model("Honor", HonorSchema);
