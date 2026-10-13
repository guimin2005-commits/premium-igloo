import mongoose from "mongoose";

// 📌 잠수 채널 이동 기록 — 봇이 잠수 확인에 응답하지 않은 사람을 서버 잠수 채널로 옮길 때마다 한 줄(bot/src/features/afkCheck.js).
//    관리 › 제재 · 잠수 기록(app/admin/sanctions · app/api/admin/sanctions)이 읽는다. 1년 뒤 자동 삭제. bot/src/db.js AfkLog 와 같은 칸
const AfkLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  displayName: { type: String, default: "" },
  channelId: { type: String, default: "" },
  channelName: { type: String, default: "" },
  sanctioned: { type: Boolean, default: false },
  waitMin: { type: Number, default: 0 },
  moves: { type: Number, default: 0 },
  sanctionMoves: { type: Number, default: 0 },
  nextWaitMin: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 365 } },
});

export default mongoose.models.AfkLog || mongoose.model("AfkLog", AfkLogSchema);
