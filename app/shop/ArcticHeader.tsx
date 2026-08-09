"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import ArcticLogo from "./ArcticLogo";

// 📌 ARCTIC 공용 헤더 브랜드 — 고급 이글루 / ARCTIC 계층을 드러낸다
//    "고급 이글루" → 본 사이트 메인, "ARCTIC" → 상점 메인
export function ArcticBrand() {
  return (
    <div className="flex items-center gap-3 min-w-0 shrink-0">
      <Link href="/" className="text-[10px] font-bold tracking-[0.18em] text-[#8a8a8a] hover:text-[#131313] transition-colors hidden sm:block">
        고급 이글루
      </Link>
      <span className="w-px h-4 bg-[#d6d3ce] hidden sm:block"></span>
      <Link href="/shop" className="text-[#131313] hover:text-[#e91e3f] transition-colors">
        <ArcticLogo size={26} />
      </Link>
    </div>
  );
}

// 상점 본문 외 페이지(주문서 등)에서 쓰는 간단 헤더
export default function ArcticHeader({ right }: { right?: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`sticky top-0 z-[95] w-full border-b transition-all duration-300 ${
      scrolled
        ? "bg-white/92 backdrop-blur-xl border-[#e2e0dc] shadow-[0_6px_20px_-10px_rgba(0,0,0,0.14)]"
        : "bg-[#f5f3f0]/90 backdrop-blur-md border-[#e2e0dc]"
    }`}>
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        <ArcticBrand />
        <div className="flex items-center gap-1.5 shrink-0">{right}</div>
      </div>
    </header>
  );
}
