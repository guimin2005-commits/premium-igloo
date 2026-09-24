"use client";

import Link from "next/link";

// 📌 ARCTIC 공용 브랜드 락업 — 작은 "고급 이글루" 위에 큰 ARCTIC
//    "고급 이글루" → 본 사이트 메인, "ARCTIC" → 상점 메인
//
//    자체 헤더(ArcticHeader)는 없앴다 — 전역 상단 바(app/ClientLayout.tsx)가
//    /arctic 과 하위 페이지에도 똑같이 걸리므로, 여기서 브랜드 줄을 한 번 더
//    그리면 "고급 이글루"가 화면에 두 벌 나온다. 스토어는 제 줄(유형 탭 + 스토어 도구)만 그린다.
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
