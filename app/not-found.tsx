"use client";

import Link from "next/link";
import { Reveal, LuxStyles } from "./components/Lux";

export default function NotFound() {
  return (
    <main className="flex-1 w-full relative overflow-hidden flex items-center justify-center min-h-[70vh] px-6">
      <LuxStyles />
      <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#e91e3f]/[0.06] blur-[120px] rounded-full pointer-events-none"></div>

      <Reveal className="relative z-10 text-center">
        <div>
          <p className="text-[100px] md:text-[160px] font-black leading-none tracking-tighter select-none">
            <span className="text-white/[0.06]">4</span>
            <span className="lux-shimmer">0</span>
            <span className="text-white/[0.06]">4</span>
          </p>

          <p className="text-5xl mb-6 -mt-4">🐧</p>

          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Page Not Found</span>
            <span className="w-8 h-px bg-[#e91e3f]"></span>
          </div>

          <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mb-3">펭귄이 길을 잃었어요</h1>
          <p className="text-sm text-gray-500 leading-relaxed mb-10">
            요청하신 페이지가 삭제되었거나, 주소가 잘못 입력되었습니다.<br />
            빙판 위 미끄러지듯 홈으로 돌아가 볼까요?
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-all shadow-[0_10px_36px_rgba(233,30,63,0.35)] hover:-translate-y-0.5">
              홈으로 돌아가기
            </Link>
            <Link href="/notice" className="px-8 py-3.5 bg-white/[0.03] border border-white/10 text-white text-sm font-bold rounded-full hover:bg-white/[0.07] hover:border-white/25 transition-all">
              공지사항 보기
            </Link>
          </div>
        </div>
      </Reveal>
    </main>
  );
}
