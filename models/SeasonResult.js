import mongoose from "mongoose";

// 📌 시즌 결산 — 시즌이 끝나면 봇(seasonSettle)이 XP 상위 3인을 자동으로 굳혀 둔다. 명예의 전당 등재는 관리자가 수기로.
//    시즌당 한 문서(season unique) — 두 번 결산되지 않게. bot/src/db.js 의 SeasonResultSchema 와 같아야 한다
const SeasonTopSchema = new mongoose.Schema({
  rank: { type: Number, default: 0 },
  userId: { type: String, default: "" },
  name: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
}, { _id: false });

const SeasonResultSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true }, // 시즌 번호 (lib/season.js SEASONS)
  name: { type: String, default: "" },
  start: { type: String, default: "" }, // "YYYY-MM-DD" (KST)
  end: { type: String, default: "" },
  settledAt: { type: Date, default: Date.now },
  top: { type: [SeasonTopSchema], default: [] },
  rankerRoleId: { type: String, default: "" },               // 결산 때의 RANKER 역할 (비면 역할 지급 없음)
  roleGrantRequested: { type: Boolean, default: false },
  roleGrantedAt: { type: Date, default: null },
  announcedAt: { type: Date, default: null },
  error: { type: String, default: "" },
});

export default mongoose.models.SeasonResult || mongoose.model("SeasonResult", SeasonResultSchema);
