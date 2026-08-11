"use client";

import Link from "next/link";

// 📌 ARCTIC 하단 정보 — 본 사이트 푸터와 같은 내용을 ARCTIC 팔레트로
//    (ARCTIC은 전역 푸터를 감추므로 여기서 따로 세운다)
export default function ArcticFooter() {
  return (
    <footer className="w-full mt-auto border-t border-[#e2e0dc] bg-[#f5f3f0]">
      <div className="max-w-6xl mx-auto px-6 py-10 pb-28 md:pb-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 mb-6">
          <div>
            <div className="text-base font-black tracking-widest text-[#131313] mb-1">고급 이글루</div>
            <div className="text-[9px] font-bold tracking-[0.35em] text-[#a3a3a3] uppercase mb-1.5">Premium Igloo Community</div>
            <div className="text-[11px] font-bold text-[#8a8a8a]">활동이 곧 자산이 되는 곳.</div>
          </div>
          <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
            <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#5a5a5a] hover:text-[#131313] transition-colors">Discord</a>
            <a href="https://open.kakao.com/o/gJDUnf0e" target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[#5a5a5a] hover:text-[#131313] transition-colors">Kakao Talk</a>
            <Link href="/faq" className="text-xs font-medium text-[#5a5a5a] hover:text-[#131313] transition-colors">FAQ</Link>
            <Link href="/policy" className="text-xs font-medium text-[#5a5a5a] hover:text-[#131313] transition-colors">이용약관</Link>
            <Link href="/policy?tab=privacy" className="text-xs font-medium text-[#5a5a5a] hover:text-[#131313] transition-colors">개인정보처리방침</Link>
          </div>
        </div>
        <div className="h-px w-full mb-6 bg-gradient-to-r from-black/10 via-black/5 to-transparent"></div>
        <p className="text-[11px] font-medium tracking-wide leading-relaxed text-[#a3a3a3] break-keep">
          © 2026 Premium Igloo. All rights reserved. Unauthorized reproduction or redistribution is strictly prohibited.
        </p>
      </div>
    </footer>
  );
}
