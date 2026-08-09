import mongoose from "mongoose";

// 📌 코드 사용 시 지급할 역할 대기열 — 봇이 30초 주기로 처리
const CodeGrantSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  roleId: { type: String, default: "" },
  code: { type: String, default: "" },
  status: { type: String, default: "pending", index: true }, // pending | completed
  error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date },
});

export default mongoose.models.CodeGrant || mongoose.model("CodeGrant", CodeGrantSchema);
