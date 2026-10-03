import mongoose from "mongoose";

// 📌 활동 횟수 묶음 — 봇(bot/src/features/activityStats.js)이 쓰고 사이트는 퀘스트 진행도(lib/questKinds.js)에서 읽기만 한다.
//    한 줄 = (유저 · KST 날짜 · KST 시 · 종류 · 채널) 의 횟수. 종류: msg · reply · replied · mention · react · reacted · threadmsg · threadnew ·
//    sticker · cmd · vjoin · levelup. 2026-10-03부터 쌓인다. 70일 뒤 지운다(exp TTL).
//    ⚠️ 인덱스는 봇(bot/src/db.js ActivityStatSchema)이 만든다 — 사이트는 autoIndex 를 꺼 같은 인덱스를 두 번 만들지 않는다
const ActivityStatSchema = new mongoose.Schema(
  {
    u: { type: String, required: true }, // 디스코드 ID
    d: { type: String, required: true }, // KST 날짜 "YYYY-MM-DD"
    h: { type: Number, default: 0 }, // KST 시 0~23
    k: { type: String, required: true }, // 종류
    ch: { type: String, default: "" }, // 채널(스레드는 부모 채널)
    pc: { type: String, default: "" }, // 카테고리
    n: { type: Number, default: 0 },
    exp: { type: Date },
  },
  { versionKey: false, autoIndex: false }
);

export default mongoose.models.ActivityStat || mongoose.model("ActivityStat", ActivityStatSchema);
