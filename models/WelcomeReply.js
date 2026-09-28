import mongoose from "mongoose";

// 📌 새 멤버 첫 답장 기록 — 아이템 효과 welcomeReply(새 멤버에게 첫 답장)를 (새 멤버, 답장한 사람) 한 쌍에 한 번만 주려고 쓴다.
//    쓰는 쪽은 봇(chatXp) — 서버 입장 7일 이내 멤버의 메시지에 답장하면 이 문서를 먼저 만들고(유니크), 만들어졌을 때만 지급한다.
//    사이트는 읽기만. bot/src/db.js 의 WelcomeReply 와 같은 모델 이름 · 칸 · 인덱스여야 한다(같은 컬렉션 welcomereplies)
const WelcomeReplySchema = new mongoose.Schema({
  newcomerId: { type: String, required: true }, // 새 멤버 디스코드 ID
  userId: { type: String, required: true },     // 답장한 사람(효과를 받은 사람) 디스코드 ID
  createdAt: { type: Date, default: Date.now },
});
WelcomeReplySchema.index({ newcomerId: 1, userId: 1 }, { unique: true });

export default mongoose.models.WelcomeReply || mongoose.model("WelcomeReply", WelcomeReplySchema);
