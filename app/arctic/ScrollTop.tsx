"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

// 📌 ARCTIC 안에서 다른 화면(상품 · 찜 · 장바구니 · 주문 …)으로 들어가면 맨 위에서 시작한다.
//    Next 는 새 화면이 보이는 자리에 있으면 스크롤을 그대로 두어, 상점을 내린 채 상품을 누르면 상세도 내려간 채로 열렸다.
//    뒤로 · 앞으로(popstate)는 브라우저가 돌려놓는 자리를 그대로 둔다 — 목록으로 돌아가면 보던 자리.
let popAt = 0;
if (typeof window !== "undefined") window.addEventListener("popstate", () => { popAt = Date.now(); });
// 방금 뒤로 · 앞으로 왔는지 — 상점 목록이 상품을 다 받은 뒤 보던 자리로 옮길 때 쓴다(ArcticShopBody, 2026-10-31)
export const poppedRecently = (ms = 5000) => Date.now() - popAt < ms;

export default function ScrollTop() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    if (Date.now() - popAt < 1000) return;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
