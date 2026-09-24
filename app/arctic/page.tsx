import { Suspense } from "react";
import ArcticShopBody from "./ArcticShopBody";

// 📌 ARCTIC 의 제 주소 — 다른 세계는 자기 주소를 갖는다 (이동 규칙 2, 3차).
//    본문(ArcticShopBody)이 useSearchParams 를 쓰므로 Suspense 로 감싼다.
export const metadata = { title: "ARCTIC · 고급 이글루" };

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <ArcticShopBody />
    </Suspense>
  );
}
