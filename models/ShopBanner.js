import mongoose from "mongoose";

// 📌 ARCTIC 상단 이미지 배너 — 관리자가 등록, 상점 최상단에 슬라이드로 노출
const ShopBannerSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  title: { type: String, default: "" },      // 이미지 위 오버레이 제목 (선택)
  subtitle: { type: String, default: "" },
  link: { type: String, default: "" },       // 클릭 시 이동할 경로 (선택)
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ShopBanner || mongoose.model("ShopBanner", ShopBannerSchema);
