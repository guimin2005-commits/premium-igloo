"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

// 📌 ARCTIC 공용 헤더 브랜드 — 고급 이글루 / ARCTIC 계층을 드러낸다
//    "고급 이글루" → 본 사이트 메인, "ARCTIC" → 상점 메인
export function ArcticBrand() {
  return (
    <div className="flex flex-row items-center gap-2 sm:gap-3 min-w-0 shrink-0 leading-none">
      <Link href="/" className="text-[9px] sm:text-[10px] font-bold tracking-[0.18em] text-[#8a8a8a] hover:text-[#131313] transition-colors whitespace-nowrap">
        고급 이글루
      </Link>
      <span className="w-px h-3.5 sm:h-4 bg-[#d6d3ce]"></span>
      <Link href="/level?tab=arctic" className="text-[15px] sm:text-[17px] font-black tracking-[0.16em] sm:tracking-[0.2em] text-[#131313] hover:text-[#e91e3f] transition-colors">
        ARCTIC
      </Link>
    </div>
  );
}

// 상점 본문 외 페이지(주문서 등)에서 쓰는 간단 헤더
export default function ArcticHeader({ right }: { right?: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 📌 상점 메인과 같은 방식 — 스크롤하면 알약 형태로 좁아진다
  return (
    <div className={`sticky top-0 z-[95] w-full transition-[padding] duration-500 ease-out ${scrolled ? "pt-3 px-3 md:px-6" : ""}`}>
      <header className={`mx-auto transition-all duration-500 ease-out ${
        scrolled
          ? "max-w-5xl rounded-full border border-[#e2e0dc] bg-white/85 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.26)]"
          : "max-w-[1600px] rounded-none border-x-transparent border-t-transparent border-b border-b-[#e2e0dc] bg-[#f5f3f0]/92 backdrop-blur-md shadow-[0_0_0_rgba(0,0,0,0)]"
      }`}>
        {/* 좌우 시작점을 전역 헤더와 같게 (ArcticShopBody 와 동일) */}
        <div className={`mx-auto flex items-center justify-between gap-3 md:gap-4 transition-all duration-500 ease-out ${scrolled ? "max-w-5xl px-5 md:px-6 h-14" : "max-w-7xl px-6 h-16"}`}>
          <ArcticBrand />
          <div className="flex items-center gap-1.5 shrink-0">{right}</div>
        </div>
      </header>
    </div>
  );
}
