import mongoose from "mongoose";

// 📌 채널/카테고리별 XP 정책 — 레벨 대시보드에서 설정, 봇이 1분 주기 자동 반영
//    카테고리에 설정하면 하위 채널 전체에 적용됨
const ChannelConfigSchema = new mongoose.Schema({
  channelId: { type: String, required: true, unique: true },
  channelName: { type: String, default: "" },     // 표시용
  channelType: { type: String, default: "text" }, // "text" | "voice" | "category"
  boostXp: { type: Number, default: 0 },          // 이 채널에서 XP 지급 1회당 추가
  excluded: { type: Boolean, default: false },    // true면 이 채널에서 XP 지급 안 함
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ChannelConfig || mongoose.model("ChannelConfig", ChannelConfigSchema);
