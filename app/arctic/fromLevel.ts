"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

// 📌 ARCTIC 에 레벨 탭(/arctic?from=level)으로 들어왔는지 — 그때만 "LEVEL ›" · "‹ 레벨" 로 돌아갈 길을 보인다.
//    상단 메뉴 · 홈에서 들어오면 ARCTIC 은 레벨과 나란한 곳이라 붙이지 않는다.
//    상품 · 장바구니로 옮겨 다녀도 이어지게 세션에 적어 두고, ARCTIC 을 벗어나면 전역 레이아웃이 지운다.
export const ARCTIC_FROM_KEY = "arcticFrom";

export function useArcticFromLevel() {
  const searchParams = useSearchParams();
  const [fromLevel, setFromLevel] = useState(false);
  useEffect(() => {
    const now = searchParams.get("from") === "level";
    try {
      if (now) sessionStorage.setItem(ARCTIC_FROM_KEY, "level");
      setFromLevel(sessionStorage.getItem(ARCTIC_FROM_KEY) === "level");
    } catch {
      setFromLevel(now); // 저장소를 못 쓰는 환경 — 이번 주소만 본다
    }
  }, [searchParams]);
  return fromLevel;
}
