"use client";

import { useEffect, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";

// 📌 ARCTIC 에 레벨 탭(/arctic?from=level)으로 들어왔는지 — 그때만 "LEVEL ›" · "‹ 레벨" 로 돌아갈 길을 보인다.
//    상단 메뉴 · 홈에서 들어오면 ARCTIC 은 레벨과 나란한 곳이라 붙이지 않는다.
//    상품 · 장바구니로 옮겨 다녀도 이어지게 세션에 적어 두고, ARCTIC 을 벗어나면 전역 레이아웃이 지운다.
export const ARCTIC_FROM_KEY = "arcticFrom";

// 📌 ARCTIC 에 들어온 곳 — 어디서 왔든 모바일 상점 줄 맨 앞 "‹ 메인 · ‹ 레벨 …" 이 그리로 돌려보낸다.
//    (모바일 독으로 들어오면 돌아갈 길이 메인밖에 없었다.) 적는 쪽은 전역 레이아웃, 지우는 것도 레이아웃이 ARCTIC 을 벗어날 때.
export const ARCTIC_ORIGIN_KEY = "arcticOrigin";
const ORIGIN_LABELS: [string, string][] = [
  ["/level", "레벨"], ["/profile", "내 정보"], ["/tournament", "대회"], ["/notice", "소식"], ["/event", "이벤트"],
  ["/auction", "경매"], ["/booster", "부스터"], ["/support", "1:1 문의"], ["/faq", "FAQ"], ["/supporters", "서포터즈"], ["/hall-of-fame", "명예의 전당"],
];
// 사이트 첫 화면은 "메인" — 상점 유형 줄의 "홈"(상점 첫 화면)과 헷갈리지 않게
export const originLabel = (href: string) => {
  const p = href.split("?")[0];
  if (p === "/") return "메인";
  return ORIGIN_LABELS.find(([r]) => p === r || p.startsWith(r + "/"))?.[1] ?? "이전";
};
export function useArcticOrigin() {
  const pathname = usePathname();
  const [origin, setOrigin] = useState<{ href: string; label: string } | null>(null);
  useEffect(() => {
    try {
      const h = sessionStorage.getItem(ARCTIC_ORIGIN_KEY);
      setOrigin(h ? { href: h, label: originLabel(h) } : null);
    } catch {
      setOrigin(null);
    }
  }, [pathname]);
  return origin;
}

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
