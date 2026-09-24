"use client";

import Link from "next/link";

// 📌 ARCTIC 공용 브랜드 락업 — 작은 "고급 이글루" 위에 큰 ARCTIC (상점 홈 헤더와 같은 모양)
//    "고급 이글루" → 본 사이트 메인, "ARCTIC" → 상점 메인
export function ArcticBrand() {
  return (
    <div className="flex flex-col items-start min-w-0 shrink-0 leading-none">
      <Link href="/" className="mb-[3px] text-[9px] md:text-[9.5px] font-bold tracking-[0.14em] text-[#8a8a8a] hover:text-[#131313] transition-colors whitespace-nowrap leading-none">
        고급 이글루
      </Link>
      <Link href="/arctic" className="text-[20px] md:text-[26px] font-black tracking-[0.16em] text-[#131313] hover:text-[#e91e3f] transition-colors leading-none">
        ARCT<span className="text-[#e91e3f]">I</span>C
      </Link>
    </div>
  );
}

// 상점 본문 외 페이지(주문서·인벤토리 등)에서 쓰는 간단 헤더 — 흰 띠 하나, 알약 변형 없음
export default function ArcticHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-[95] w-full">
      <header className="w-full bg-white/95 backdrop-blur-md border-b border-[#ededed]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 md:gap-4 px-5 md:px-6 h-[68px] md:h-20">
          <ArcticBrand />
          <div className="flex items-center gap-1.5 shrink-0">{right}</div>
        </div>
      </header>
    </div>
  );
}
