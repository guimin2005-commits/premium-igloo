import mongoose from "mongoose";

// 📌 사이트 전역 설정 (점검 모드 등)
//    key "itemGroups" — 상점 관리 › 아이템 그룹 순서 · 빈 그룹 [{ name }] (app/api/admin/items PATCH groupOp)
const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.Setting || mongoose.model("Setting", SettingSchema);
