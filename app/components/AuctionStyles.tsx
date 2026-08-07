"use client";

import React from "react";

/* 📌 경매 전용 디자인 시스템 — 대회(각진 네온 그린 HUD)와 완전히 분리
   시그니처: 레드 × 블루 듀오톤 · 사선(skew) 슬래브 · 흐르는 티커 · 움직이는 그라디언트
   단일 색이 아니라 두 색이 섞여 흐르는 것이 이 화면의 정체성 */
export const AuctionStyles = () => (
  <style>{`
    /* ── 듀오톤 ── */
    .auc-duo { background-image: linear-gradient(115deg, #e91e3f 0%, #a52a86 48%, #4d7cfe 100%); background-size: 220% 100%; animation: aucFlow 7s ease-in-out infinite; }
    .auc-duo-soft { background-image: linear-gradient(115deg, rgba(233,30,63,.18) 0%, rgba(165,42,134,.14) 48%, rgba(77,124,254,.18) 100%); background-size: 220% 100%; animation: aucFlow 7s ease-in-out infinite; }
    .auc-duo-text { background-image: linear-gradient(100deg, #ff4d68 0%, #c04ba6 45%, #6b93ff 100%); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: aucFlow 6s ease-in-out infinite; }
    @keyframes aucFlow { 0%,100% { background-position: 0% 50% } 50% { background-position: 100% 50% } }

    /* ── 사선 슬래브 ── */
    .auc-skew { transform: skewX(-12deg); }
    .auc-unskew { transform: skewX(12deg); display: inline-block; }

    /* ── 흐르는 티커 ── */
    .auc-ticker { display: flex; width: max-content; animation: aucTick 30s linear infinite; }
    .auc-ticker:hover { animation-play-state: paused; }
    @keyframes aucTick { from { transform: translateX(0) } to { transform: translateX(-50%) } }

    /* ── 행(슬래브) ── */
    .auc-slab { position: relative; overflow: hidden; transition: background-color .3s ease, transform .3s cubic-bezier(.16,1,.3,1); }
    .auc-slab:hover { background-color: rgba(255,255,255,.025); transform: translateX(4px); }
    /* 좌측 듀오톤 척추 — 평소 얇게, 호버 시 확장 */
    .auc-spine { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; transition: width .3s cubic-bezier(.16,1,.3,1); }
    .auc-slab:hover .auc-spine { width: 7px; }
    /* 호버 시 대각선 광택이 스쳐 지나감 */
    .auc-slab::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(105deg, transparent 42%, rgba(255,255,255,.06) 50%, transparent 58%); transform: translateX(-130%); }
    .auc-slab:hover::after { animation: aucSheen .9s ease-out; }
    @keyframes aucSheen { to { transform: translateX(130%) } }

    /* ── LIVE 맥박 ── */
    .auc-pulse { animation: aucPulse 1.8s ease-in-out infinite; }
    @keyframes aucPulse { 0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(233,30,63,.45) } 50% { opacity:.85; box-shadow: 0 0 0 7px rgba(233,30,63,0) } }

    /* ── 숫자/라벨 ── */
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-mono { letter-spacing: .2em; font-variant-numeric: tabular-nums; }
    .auc-num { font-variant-numeric: tabular-nums; letter-spacing: -.01em; }

    /* ── 진입 애니메이션 ── */
    .auc-in { opacity: 0; animation: aucIn .7s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucIn { from { opacity:0; transform: translateY(14px) skewX(-2deg) } to { opacity:1; transform:none } }

    /* ── 배경 오라 ── */
    .auc-aura { position:absolute; border-radius:9999px; filter: blur(120px); animation: aucDrift 14s ease-in-out infinite; }
    @keyframes aucDrift { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(40px,-20px) scale(1.12) } }

    /* 패널 머리 — 얇은 이중선 (경매방 공용) */
    .auc-head { border-bottom: 1px solid rgba(255,255,255,.09); box-shadow: 0 2px 0 -1px rgba(233,30,63,.35); }
    .auc-stamp { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid currentColor; font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }

    @media (prefers-reduced-motion: reduce) {
      .auc-duo, .auc-duo-soft, .auc-duo-text, .auc-ticker, .auc-pulse, .auc-aura, .auc-in { animation: none !important; }
      .auc-in { opacity: 1; }
    }
  `}</style>
);
