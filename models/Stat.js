import mongoose from "mongoose";

// 📌 서버 온라인 인원 시계열 샘플 (시간대별 활동 그래프용)
const StatSchema = new mongoose.Schema({
  ts: { type: Date, default: Date.now, index: true },
  online: { type: Number, default: 0 },
  members: { type: Number, default: 0 },
});

export default mongoose.models.Stat || mongoose.model("Stat", StatSchema);
