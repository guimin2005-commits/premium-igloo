"use client";

import React from "react";
import { Reveal } from "./Lux";

// 📌 안내 화면 골격 — 서버 부스터(/booster · /profile/booster) · 시스템 안내(/level?tab=intro)가 같은 부품을 쓴다.
//    화이트 & 블랙: 홈의 번호 섹션(워터마크 · 빨간 번호 · 헤어라인) + 헤어라인 줄 목록.
//    상자 · 격자 · 그림자 · 다크 히어로는 쓰지 않는다.

// 본문 폭 — 안내 화면이 같은 폭 · 같은 여백
export const INFO_WRAP = "w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 flex-1";

// 제목 한 덩어리 — 굵은 제목 · 한 줄 설명 · 아래 먹선. badge 는 제목 옆 알약(적용 중 · 상시 등)
export function InfoHead({ title, sub, badge }: { title: string; sub?: string; badge?: React.ReactNode }) {
  return (
    <div className="border-b border-[#131313] pb-5">
      <div className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">{title}</h1>
        {badge}
      </div>
      {sub && <p className="mt-3 text-[14px] text-[#5a5a5a] break-keep">{sub}</p>}
    </div>
  );
}

// 제목 옆 알약 — 옅은 빨강 바탕 · 글자는 누른 빨강(#d01634). #e91e3f 는 이 바탕에서 대비가 4.5:1 에 못 미친다
export function InfoBadge({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 px-2.5 py-1 rounded-full bg-[#e91e3f]/[0.08] text-[#d01634] text-[11px] font-black">{children}</span>;
}

// 번호 섹션 — 홈(app/page.tsx)의 Sec 골격을 본문 폭 안으로
export function InfoSec({ no, title, right, children }: { no: string; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="relative border-b border-[#ededed] py-12 md:py-14 last:border-b-0">
      <div aria-hidden className="absolute -top-1 md:-top-2 left-0 text-[70px] md:text-[120px] font-black tracking-[-0.04em] leading-none text-[#131313]/[0.05] pointer-events-none select-none">{no}</div>
      <Reveal>
        <div className="relative flex items-center gap-3.5 mb-3.5">
          <b className="text-[11px] font-black tracking-[0.3em] text-[#e91e3f]">{no}</b>
          <i className="h-px flex-1 bg-gradient-to-r from-[#131313]/20 to-transparent" />
          {right && <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{right}</span>}
        </div>
        <h2 className="relative text-[24px] md:text-[30px] font-black tracking-tight leading-tight break-keep">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

// 헤어라인 줄 — 모바일은 [이름 · 값] 한 줄 + 설명 아래, 데스크톱은 [이름 · 설명 · 값] 한 줄.
//    word: 값이 숫자가 아니라 말(자동 지급 · 달성 등). on: 달성한 줄은 이름 · 값을 빨강으로
export function InfoRow({ k, d, note, v, unit, word, compact = false, on = false }: { k: string; d?: string; note?: string; v?: string; unit?: string; word?: boolean; compact?: boolean; on?: boolean }) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-5 md:gap-x-6 py-[18px] border-b border-[#ededed]">
      <p className={`order-1 flex-1 min-w-0 sm:flex-none ${compact ? "sm:w-[108px]" : "sm:w-[176px]"} text-[15px] md:text-[16px] font-extrabold tracking-tight break-keep ${on ? "text-[#e91e3f]" : ""}`}>{k}</p>
      {v && (
        <p className={`order-2 sm:order-3 shrink-0 ml-auto sm:ml-0 text-right whitespace-nowrap ${word ? "text-[13px] font-extrabold text-[#5a5a5a]" : "text-[18px] md:text-[20px] font-black tracking-[-0.02em] tabular-nums"} ${on ? "text-[#e91e3f]" : ""}`}>
          {v}
          {unit && <span className="ml-1.5 text-[11px] font-bold tracking-[0.04em] text-[#8a8a8a]">{unit}</span>}
        </p>
      )}
      <div className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 min-w-0 mt-1 sm:mt-0">
        {d && <p className="text-[13px] leading-relaxed text-[#5a5a5a] break-keep">{d}</p>}
        {note && <p className="mt-1 text-[11px] leading-relaxed text-[#5a5a5a] break-keep">{note}</p>}
      </div>
    </div>
  );
}

// 줄 목록 — 위에 먹선 한 줄
export function InfoList({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`relative mt-6 md:mt-7 border-t border-[#131313] ${className}`}>{children}</div>;
}

// 먹 알약 버튼 — 화면 맨 아래 한 번 (부스트하기 등)
export const INK_BTN = "inline-flex items-center justify-center h-12 px-8 rounded-full bg-[#131313] hover:bg-[#3a3a3a] disabled:opacity-40 text-white text-[14px] font-extrabold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40";
