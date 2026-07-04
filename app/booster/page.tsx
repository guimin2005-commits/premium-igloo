"use client";

import React from "react";
import { Reveal, LuxStyles, ScrollProgress } from "../components/Lux";

// 📌 서버 부스터 혜택 — 비로그인 유저도 볼 수 있는 공개 페이지 (부스팅 유도)
export default function BoosterPage() {
  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />
      <ScrollProgress />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6 overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute -top-4 -right-4 text-[120px] md:text-[200px] font-black text-white/[0.02] leading-none select-none pointer-events-none tracking-tighter">BOOST</div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Server Booster Program</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">SERVER </span><span className="lux-shimmer">BOOSTER</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-xl">서버의 환경 개선을 위한 직접적인 후원 시스템입니다.<br className="hidden md:block" />본 서버의 성장을 지원해 주시는 유저분들께 깊은 감사를 드립니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 py-10 flex-1 flex flex-col space-y-16">

        {/* 01. 전용 기능 권한 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">01</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">SERVER 전용 기능 권한</h4>
          <div className="divide-y divide-white/[0.06]">
            {[
              { t: "전용 역할 및 뱃지 지급", d: "@SERVER BOOSTER 고유 역할 부여 및 차별화된 프로필 전용 특수 배지 자동 장착", note: "" },
              { t: "사용자 관리 권한 제공", d: "서버 내 일부 사용자 관리 부가 기능 상시 이용 가능", note: "" },
              { t: "권한 제한 채널 이용", d: "별도의 권한 구매 없이 제한된 채널 이용 가능!", note: "* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다." },
              { t: "슬로우 모드 제한 해제", d: "채팅 대기 시간 제한 없이 연속 채팅 가능!", note: "* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다." },
            ].map((item, idx) => (
              <div key={idx} className="py-5 flex flex-col md:flex-row md:items-baseline gap-1.5 md:gap-8 group">
                <p className="font-bold text-white text-sm md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{item.t}</p>
                <div className="min-w-0">
                  <p className="text-xs md:text-[13px] text-gray-500 leading-relaxed">{item.d}</p>
                  {item.note && <p className="text-[10px] text-gray-600 mt-1">{item.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
        </Reveal>

        {/* 02. XP 혜택 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">02</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">XP BOOSTER 경험치 혜택</h4>
          <div className="divide-y divide-white/[0.06]">
            {[
              { k: "WELCOME", t: "부스팅 시작 보너스 보상 지급!", big: "100,000", unit: "XP 즉시 지급", sub: "추가 부스팅: 개당 50,000 XP 추가 지급!" },
              { k: "PASSIVE", t: "경험치 획득 조건 충족 시 상시 추가!", big: "+2,000", unit: "XP 상시 지급", sub: "" },
              { k: "SHOP", t: "경험치샵 이용 전용 정산 혜택!", big: "35%", unit: "XP 환급", sub: "경험치샵 사용 금액 기준" },
              { k: "DAILY", t: "일일 출석체크 추가 보상!", big: "10,000", unit: "XP 보너스", sub: "일일 출석체크 시 추가 지급" },
            ].map((row, idx) => (
              <div key={idx} className="py-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 group">
                <div className="min-w-0 md:flex md:items-baseline md:gap-8">
                  <p className="font-black text-white text-sm tracking-[0.2em] md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{row.k}</p>
                  <p className="text-xs text-gray-500 mt-0.5 md:mt-0">{row.t}</p>
                </div>
                <div className="md:text-right shrink-0">
                  <p className="leading-none">
                    <span className="text-2xl md:text-3xl font-black text-[#e91e3f] tracking-tighter">{row.big}</span>
                    <span className="text-[11px] font-bold text-gray-400 ml-2">{row.unit}</span>
                  </p>
                  {row.sub && <p className="text-[11px] text-gray-600 mt-1.5">{row.sub}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
        </Reveal>

        {/* 03. RANK */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">누적 유지 개월별 추가 혜택 (RANK)</h4>
          <div className="divide-y divide-white/[0.06]">
            {[{ r: "RANK 01", m: "1개월", x: "100,000" }, { r: "RANK 02", m: "3개월", x: "300,000" }, { r: "RANK 03", m: "6개월", x: "600,000" }, { r: "RANK 04", m: "9개월", x: "900,000" }, { r: "RANK 06", m: "15개월", x: "1,500,000" }, { r: "RANK 07", m: "18개월", x: "1,800,000" }, { r: "RANK 08", m: "21개월", x: "2,100,000" }, { r: "RANK 09", m: "24개월", x: "2,400,000" }].map((item, idx) => (
              <div key={idx} className="py-4 grid grid-cols-3 items-center text-sm group hover:bg-white/[0.015] transition-colors">
                <p className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase group-hover:text-[#e91e3f] transition-colors">{item.r}</p>
                <p className="font-bold text-white text-center">{item.m}</p>
                <p className="text-right"><span className="text-base md:text-lg font-black text-[#e91e3f] tracking-tight">{item.x}</span><span className="text-[10px] font-bold text-gray-500 ml-1.5">XP</span></p>
              </div>
            ))}
          </div>

          <div className="mt-10 space-y-10">
            {[
              { rank: "RANK 05 SPECIAL BLOCK", title: "🏆 12개월 연속 달성", items: [<React.Fragment key="a">누적 보너스 <span className="text-white font-bold">1,200,000 XP</span> 즉시 수령</React.Fragment>, <React.Fragment key="b"><strong>@BOOSTER RANK 05</strong> 역할 추가 지급</React.Fragment>, <React.Fragment key="c">상시 고정 버프 <strong>+2,000 XP</strong> 추가 영구 결합</React.Fragment>, <React.Fragment key="d">일일 출석 시 <span className="text-white font-bold">2,000 XP</span> 영구 가산 누적 지급</React.Fragment>] },
              { rank: "RANK 10 SPECIAL BLOCK", title: "👑 24개월 연속 달성", items: [<React.Fragment key="a">누적 보너스 <span className="text-white font-bold">2,400,000 XP</span> 즉시 수령</React.Fragment>, <React.Fragment key="b"><strong>@BOOSTER RANK 10</strong> 특수 역할 추가 지급</React.Fragment>, <React.Fragment key="c">상시 고정 버프 <strong>+4,000 XP</strong> 추가 영구 결합</React.Fragment>, <React.Fragment key="d">일일 출석 시 <span className="text-white font-bold">5,000 XP</span> 영구 가산 누적 지급</React.Fragment>] },
            ].map((block, idx) => (
              <div key={idx} className="border-l-2 border-[#e91e3f] pl-5 md:pl-7">
                <p className="text-[9px] font-black tracking-[0.25em] text-[#e91e3f] mb-1.5 uppercase">{block.rank}</p>
                <p className="text-lg font-black text-white mb-3">{block.title}</p>
                <div className="text-xs md:text-[13px] text-gray-400 space-y-1.5">
                  {block.items.map((it, i) => (
                    <p key={i} className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span>{it}</span></p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        </Reveal>

        <Reveal>
        <div className="pt-6 border-t border-white/10 text-center pb-4">
          <p className="text-sm text-gray-300 font-bold mb-6">📢 디스코드 서버 부스트 진행 시 시스템이 자동으로 감지하여 모든 혜택을 즉시 지급합니다!</p>
          <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className="inline-block px-10 py-4 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-full transition-all shadow-[0_10px_36px_rgba(233,30,63,0.35)] hover:-translate-y-0.5">
            서버에서 부스트하기
          </a>
        </div>
        </Reveal>
      </div>
    </main>
  );
}
