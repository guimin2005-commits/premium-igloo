import mongoose from "mongoose";

// 📌 유저별 · 주기별 노출 퀘스트 — 그 주기에 처음 연 순간 뽑은 퀘스트 id 를 저장해 주기 끝까지 그대로 보여 준다(lib/questKinds.js computeQuestState).
//    key = "주기:기간키:유저" (예: "weekly:2026-W0928:1234…"). 사이트 · 봇 둘 다 처음 연 쪽이 $setOnInsert 로 넣는다.
//    다음 주기를 뽑을 때 직전 기록(u · per)을 보고 겹치지 않게 고른다. bot/src/db.js QuestPickSchema 와 같은 칸 · 같은 인덱스. 120일 뒤 지운다
const QuestPickSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    u: { type: String, required: true },
    per: { type: String, required: true },
    ids: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
QuestPickSchema.index({ key: 1 }, { unique: true });
QuestPickSchema.index({ u: 1, per: 1, createdAt: -1 });
QuestPickSchema.index({ createdAt: 1 }, { expireAfterSeconds: 120 * 24 * 60 * 60 });

export default mongoose.models.QuestPick || mongoose.model("QuestPick", QuestPickSchema);
