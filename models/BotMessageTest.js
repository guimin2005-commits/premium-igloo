import mongoose from "mongoose";

// 📌 봇 메시지 테스트 발송 대기열 — 관리자가 누르면 pending 으로 쌓이고, 봇이 요청한 관리자(userId)에게 예시 값으로 DM 을 보낸다.
//    template 이 있으면(저장 전 초안) 그 모양으로, 없으면 저장된 디자인으로 보낸다. 7일 뒤 자동 삭제.
//    bot/src/botMessages.js 의 BotMessageTestSchema 와 이름 · 모양 · 기본값이 같아야 한다.
const BotMessageTestSchema = new mongoose.Schema({
  key: { type: String, required: true },
  userId: { type: String, required: true },
  template: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, default: "pending", index: true }, // pending → sending → sent | failed
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: { expires: 60 * 60 * 24 * 7 } },
  claimedAt: { type: Date, default: null }, // 봇이 선점(sending)한 시각 — 5분 넘게 멈추면 봇이 failed 로 돌린다
  sentAt: { type: Date, default: null },
});

export default mongoose.models.BotMessageTest || mongoose.model("BotMessageTest", BotMessageTestSchema);
