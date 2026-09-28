import mongoose from "mongoose";

// 📌 봇 생존 신호 — 봇(heartbeat)이 주기적으로 lastSeen 을 찍고, 관리자 대시보드가 읽어 켜짐/꺼짐을 판단한다.
//    단일 문서(key: "main"). bot/src/db.js 의 BotStatusSchema 와 같아야 한다
const BotStatusSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "main" },
  lastSeen: { type: Date, default: null },    // 마지막 신호
  startedAt: { type: Date, default: null },   // 이번 구동 시작 시각
  version: { type: String, default: "" },
  lastError: { type: String, default: "" },
  lastErrorAt: { type: Date, default: null },
});

export default mongoose.models.BotStatus || mongoose.model("BotStatus", BotStatusSchema);
