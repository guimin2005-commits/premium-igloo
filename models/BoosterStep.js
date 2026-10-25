import mongoose from "mongoose";

// 📌 연속 부스팅 보상 받은 기록 — 한 사람 한 단계 한 줄(userId · months 유니크). 봇(bot/src/features/boosterBonus.js)이 쓰고, 사이트는 읽기만 한다(혜택 화면 「받음」 · GET /api/booster).
//    ⚠️ 봇 bot/src/db.js BoosterStepSchema 와 같은 칸 · 같은 유니크. 사이트 · 테스트 사이트가 같은 DB 를 읽어 autoCreate · autoIndex 를 끈다(쓰지 않는다)
const BoosterStepSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    months: { type: Number, required: true },
    userName: { type: String, default: "" },
    premiumSince: { type: Date, default: null },
    xp: { type: Number, default: 0 },
    point: { type: Number, default: 0 },
    payoutId: { type: String, default: "" },
    error: { type: String, default: "" },
    at: { type: Date, default: Date.now },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);
BoosterStepSchema.index({ userId: 1, months: 1 }, { unique: true });

export default mongoose.models.BoosterStep || mongoose.model("BoosterStep", BoosterStepSchema);
