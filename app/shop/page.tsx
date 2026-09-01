"use client";

// 📌 /shop 라우트 — 본문은 ArcticShopBody 한 벌이고, SYSTEM:LEVEL 의 ARCTIC 탭도
//    같은 컴포넌트를 쓴다. 이 경로로 들어오면 ARCTIC 자체 크롬(헤더 sticky·하단 독·
//    푸터)을 그대로 세운다 — ClientLayout 이 /shop 에서 전역 크롬을 끄기 때문이다.
import ArcticShopBody from "./ArcticShopBody";

export default function ShopPage() {
  return <ArcticShopBody />;
}
