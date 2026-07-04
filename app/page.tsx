"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Reveal, CountUp, LuxStyles } from "./components/Lux";

export default function Home() {
  const [stats, setStats] = useState<{ memberCount: number; onlineCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStats({ memberCount: data.memberCount, onlineCount: data.onlineCount });
      })
      .catch(() => {});
  }, []);

  return (
    <main className="flex-1 w-full relative overflow-hidden flex flex-col">
      <LuxStyles />

      {/* 배경 레이어 */}
      <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
      <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#e91e3f]/[0.08] blur-[130px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-200px] right-[-100px] w-[500px] h-[400px] bg-[#e91e3f]/[0.04] blur-[130px] rounded-full pointer-events-none"></div>

      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-16 md:py-12 flex items-center relative z-10">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* 로고 — 투명 PNG 경계선이 보이지 않도록 프레임 없이 글로우만 */}
          <Reveal className="flex justify-center md:justify-end">
            <div className="relative">
              <div className="absolute inset-0 scale-90 bg-[#e91e3f]/15 blur-[80px] rounded-full animate-[pulseGlow_5s_ease-in-out_infinite] pointer-events-none"></div>
              <img
                src="/logo.png"
                alt="고급 이글루"
                className="relative w-56 h-56 md:w-80 md:h-80 lg:w-96 lg:h-96 object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
              />
            </div>
          </Reveal>

          {/* 텍스트 */}
          <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left">
            <Reveal>
              <div className="flex items-center gap-3 mb-6 justify-center md:justify-start">
                <span className="w-8 h-px bg-[#e91e3f]"></span>
                <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Since 2023 · Community</span>
              </div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white mb-3 leading-none">고급 이글루</h1>
              <p className="text-base md:text-lg font-light tracking-[0.45em] text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600 mb-10 pl-1 uppercase">Premium Igloo</p>
            </Reveal>

            <Reveal delay={150}>
              <div className="flex flex-wrap justify-center md:justify-start gap-4">
                <a
                  href="https://discord.gg/V2uW2nUczU"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-4 bg-[#e91e3f] text-white rounded-full font-bold text-base md:text-lg hover:bg-[#d01634] transition-all shadow-[0_10px_36px_rgba(233,30,63,0.35)] hover:shadow-[0_14px_44px_rgba(233,30,63,0.5)] hover:-translate-y-0.5 outline-none focus:outline-none"
                >
                  서버 바로가기
                </a>
                <Link
                  href="/faq"
                  className="px-8 py-4 bg-white/[0.03] border border-white/10 text-white rounded-full font-bold text-base md:text-lg hover:bg-white/[0.07] hover:border-white/25 transition-all outline-none focus:outline-none"
                >
                  이용 가이드
                </Link>
              </div>
            </Reveal>

            {stats && (
              <Reveal delay={300}>
                <div className="flex items-center gap-8 md:gap-10 mt-12 pt-8 border-t border-white/5 w-full justify-center md:justify-start">
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight">
                      <CountUp end={stats.memberCount} />
                    </div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">전체 멤버</div>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2 justify-center md:justify-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
                      <CountUp end={stats.onlineCount} />
                    </div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">현재 온라인</div>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight">2023</div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">Since</div>
                  </div>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
