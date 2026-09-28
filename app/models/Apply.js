import mongoose from "mongoose";

const ApplySchema = new mongoose.Schema({
  discordTag: { type: String, required: true }, // 디스코드 사용자명 — 표시용(지원 당시 이름)
  // 📌 본인 확인은 ID 로 — 이름은 바뀔 수 있다. ID 가 없는 옛 문서만 이름으로 찾는다 (app/api/user/applies)
  userId: { type: String, default: "", index: true },
  position: { type: String, required: true },
  age: { type: Number, required: true },
  intro: { type: String, required: true },
  experience: { type: String, default: "" },
  status: { type: String, default: "심사 중" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Apply || mongoose.model("Apply", ApplySchema);