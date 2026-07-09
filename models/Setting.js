import mongoose from "mongoose";

// 📌 사이트 전역 설정 (점검 모드 등)
const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
