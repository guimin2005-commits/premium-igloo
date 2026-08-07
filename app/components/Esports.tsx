"use client";

import React from "react";

/* 📌 대회(e스포츠 리그 허브) 전용 디자인 시스템
   · 주 색(브랜드 / 구조 / 실행 버튼) = 네온 그린 #00e07b
   · 상태 색에는 그린을 절대 쓰지 않는다 (모집중=앰버 / 진행중=레드 / 예정=블루 / 종료=그레이)
     → "그린 = 이 허브와 실행", "앰버·레드 = 지금의 상태"로 역할이 겹치지 않게 분리 */
export const ESP = "#00e07b";

export const EsportsStyles = () => (
  <style>{`
    /* 구조 언어(각진 프레임·헤어라인·모노 라벨)는 공유하고 색만 갈라진다
       대회  = 주 네온 그린
       경매  = 주 레드(사이트 대표색) + 블루를 포인트로 소량 섞음 */
    :root { --esp-rgb: 0,224,123; --esp-pt-rgb: 0,224,123; }
    .esp-theme-auction { --esp-rgb: 233,30,63; --esp-pt-rgb: 77,124,254; }
    .esp-accent { color: rgb(var(--esp-rgb)); }
    .esp-pt { color: rgb(var(--esp-pt-rgb)); }
    .esp-pt-bd { border-color: rgba(var(--esp-pt-rgb), .45); }
    .esp-pt-bg { background-color: rgba(var(--esp-pt-rgb), .12); }
    .esp-cut { clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px)); }
    .esp-cut-sm { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }
    /* 모달용 — 모바일(바텀시트)에서는 자르지 않고, sm 이상에서만 각을 낸다 */
    .esp-cut-md { clip-path: none; }
    @media (min-width: 640px) { .esp-cut-md { clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px)); } }
    .esp-frame { padding: 1px; background: linear-gradient(150deg, rgba(255,255,255,.16), rgba(255,255,255,.05) 45%, rgba(var(--esp-rgb),.16)); transition: background .35s ease, filter .35s ease; }
    .group:hover .esp-frame { background: linear-gradient(150deg, rgba(var(--esp-rgb),.7), rgba(var(--esp-rgb),.2) 50%, rgba(var(--esp-rgb),.6)); filter: drop-shadow(0 0 16px rgba(var(--esp-rgb),.18)); }
    .esp-mesh { background-image: linear-gradient(rgba(var(--esp-rgb),.05) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--esp-rgb),.05) 1px, transparent 1px); background-size: 42px 42px; }
    .esp-scan { background-image: repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0px, rgba(255,255,255,.03) 1px, transparent 1px, transparent 3px); }
    .esp-stripe { background-image: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 6px, transparent 6px 12px); }
    @keyframes espSweep { 0% { transform: translateX(-120%); } 100% { transform: translateX(220%); } }
    .esp-sweep::after { content:""; position:absolute; inset:0; pointer-events:none; background: linear-gradient(105deg, transparent 40%, rgba(var(--esp-rgb),.14) 50%, transparent 60%); transform: translateX(-120%); }
    .group:hover .esp-sweep::after { animation: espSweep 1.1s ease-out; }
    @keyframes espBlink { 0%,100% { opacity:1 } 50% { opacity:.25 } }
    .esp-blink { animation: espBlink 1.4s ease-in-out infinite; }
    .esp-mono { font-variant-numeric: tabular-nums; letter-spacing: .18em; }
  `}</style>
);

// 📌 대회 상태 표기 — 색·코드가 브랜드 그린과 겹치지 않게 구성
export const STATUS_META: Record<string, { badge: string; label: string; code: string; dot: string; bar: string; text: string }> = {
  "모집중": { badge: "bg-amber-400/15 text-amber-300 border border-amber-400/40", label: "모집중", code: "ENTRY OPEN", dot: "bg-amber-400", bar: "bg-amber-400", text: "text-amber-300" },
  "진행중": { badge: "bg-[#ff3b5c]/15 text-[#ff6b83] border border-[#ff3b5c]/40", label: "리그 진행중", code: "LIVE", dot: "bg-[#ff3b5c]", bar: "bg-[#ff3b5c]", text: "text-[#ff6b83]" },
  "예정됨": { badge: "bg-[#5b8cff]/15 text-[#8fb0ff] border border-[#5b8cff]/40", label: "예정됨", code: "STANDBY", dot: "bg-[#5b8cff]", bar: "bg-[#5b8cff]", text: "text-[#8fb0ff]" },
  "종료됨": { badge: "bg-white/[0.06] text-gray-400 border border-white/12", label: "종료됨", code: "CLOSED", dot: "bg-gray-500", bar: "bg-gray-600", text: "text-gray-400" },
};
