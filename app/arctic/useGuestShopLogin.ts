"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { openLogin, LOGIN_CTX } from "../components/LoginPrompt";

// 📌 2026-10-04 장바구니 · 찜 · 결제 화면에 로그인 전으로 들어오면(주소 · 뒤로가기) — 빈 화면 위에 로그인 창(ARCTIC · 구매).
//    닫으면 상점 메인으로 — 로그인 전에는 볼 것이 없는 화면이다(장바구니 · 찜은 계정마다, ./shopStore).
//    상점 안의 찜 · 장바구니 아이콘은 화면을 옮기지 않고 그 자리에서 창을 연다(ArcticDock · ArcticStoreBar).
//    로그인했지만 인증 전인 사람은 전역 레이아웃이 /verify 로 보낸다(예전 그대로)
export function useGuestShopLogin() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status !== "unauthenticated") return;
    openLogin({ context: LOGIN_CTX.arcticBuy, onClose: () => router.replace("/arctic") });
  }, [status, router]);
}
