import mongoose from "mongoose";

// 📌 ARCTIC 상단 이미지 배너 — 관리자가 등록, 상점 최상단에 슬라이드로 노출
const ShopBannerSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  // 📌 모바일(768px 미만) 이미지 (선택) — 지금 보이는 배너가 전부 갖고 있을 때만 모바일에서 이것으로 바꿔 건다
  mobileImageUrl: { type: String, default: "" },
  title: { type: String, default: "" },      // 이미지 위 오버레이 제목 (선택)
  subtitle: { type: String, default: "" },
  link: { type: String, default: "" },       // 클릭 시 이동할 경로 (선택)
  // 📌 노출 위치 — "home"(ARCTIC 홈 맨 위) · "season"(스토어 시즌 탭 맨 위) · 테마 키(스토어 그 테마 탭 맨 위 — lib/shopThemes.js, "halloween" 등).
  //    테마는 관리자가 만들고 지우므로 enum 으로 묶지 않는다 — 값 검사는 저장 API(app/api/shop/banners POST)가 지금 있는 테마로 한다.
  //    지운 테마의 배너는 어디에도 안 뜬다(홈으로 넘기지 않는다). 이 값이 생기기 전에 등록한 배너는 값이 없다 → 홈으로 친다
  placement: { type: String, default: "home" },
  sortOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ShopBanner || mongoose.model("ShopBanner", ShopBannerSchema);
