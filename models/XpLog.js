import mongoose from "mongoose";

// 📌 XP 지급 로그 — 봇이 기록, 레벨 대시보드(로그 탭)·월간 랭킹에서 사용
//    60일 후 자동 삭제 (TTL 인덱스, DB 용량 보호 / 월간 집계에 한 달치가 온전히 남도록)
const XpLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  displayName: { type: String, default: "" },
  amount: { type: Number, default: 0 },
  reason: { type: String, default: "" },      // "chat" | "voice" | "attend"
  channelId: { type: String, default: "" },
  channelName: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 60 } },
});

export default mongoose.models.XpLog || mongoose.model("XpLog", XpLogSchema);
