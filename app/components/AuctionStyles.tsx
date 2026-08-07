"use client";

import React from "react";

/* 📌 경매 전용 디자인 — 블랙 & 화이트
   · 코인 : 포인트를 상징하는 원형 코인. 중앙에 진행 중인 경매, 옆으로 나머지.
   · 배경 : POINT 워드마크
   · 색   : 흑백만. (강조는 명도 대비로) */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-num   { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .auc-mono  { letter-spacing: .2em; font-variant-numeric: tabular-nums; }

    /* ── 배경 POINT 워드마크 ── */
    .auc-ghost {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      font-size: clamp(7rem, 26vw, 22rem); font-weight: 900; letter-spacing: -.045em;
      line-height: 1; white-space: nowrap; pointer-events: none; user-select: none;
      color: rgba(255,255,255,.045);
      -webkit-text-stroke: 1.5px rgba(255,255,255,.16);
    }

    /* ── 코인 무대 ── */
    .auc-stage {
      --size: 280px; --gap: 260px;
      position: relative; height: 360px; display: flex; align-items: center; justify-content: center;
    }
    @media (max-width: 768px) { .auc-stage { --size: 190px; --gap: 150px; height: 250px; } }

    .auc-coin {
      position: absolute; width: var(--size); height: var(--size); border-radius: 9999px;
      cursor: pointer; overflow: hidden;
      background:
        radial-gradient(circle at 32% 26%, rgba(255,255,255,.10), rgba(255,255,255,0) 55%),
        linear-gradient(160deg, #1a1a1a 0%, #0c0c0c 60%, #050505 100%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.14);
      transform: translateX(calc(var(--gap) * var(--off))) scale(.56);
      opacity: .55;
      transition: transform .6s cubic-bezier(.16,1,.3,1), opacity .45s ease, box-shadow .45s ease;
    }
    .auc-coin:hover { opacity: .8; }

    /* 코인 안쪽 테두리(주조선) */
    .auc-coin::before {
      content: ""; position: absolute; inset: 9%; border-radius: 9999px;
      border: 1px solid rgba(255,255,255,.10); pointer-events: none;
    }
    /* 광택 */
    .auc-coin::after {
      content: ""; position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;
      background: linear-gradient(120deg, transparent 38%, rgba(255,255,255,.10) 50%, transparent 62%);
      transform: translateX(-120%);
    }
    .auc-coin-focus::after { animation: aucShine 4.5s ease-in-out infinite; }
    @keyframes aucShine { 0% { transform: translateX(-120%) } 45%,100% { transform: translateX(120%) } }

    .auc-coin-focus {
      transform: translateX(0) scale(1);
      opacity: 1;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.30), 0 24px 70px -24px rgba(0,0,0,.9);
    }
    .auc-coin-focus:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,.55), 0 24px 80px -20px rgba(0,0,0,.9); }

    /* 진행 중 — 흰 링이 번지듯 */
    .auc-coin-live { animation: aucBeat 3s ease-in-out infinite; }
    @keyframes aucBeat {
      0%,100% { box-shadow: inset 0 0 0 1px rgba(255,255,255,.55), 0 0 0 0 rgba(255,255,255,.14); }
      55%     { box-shadow: inset 0 0 0 1px rgba(255,255,255,.85), 0 0 0 16px rgba(255,255,255,0); }
    }
    .auc-coin-end { opacity: .3; }

    .auc-coin-in {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center; padding: 16%;
    }

    /* ── 진입 ── */
    .auc-in { opacity: 0; animation: aucIn .6s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }

    /* 경매방 공용 */
    .auc-head { border-bottom: 1px solid rgba(255,255,255,.09); box-shadow: 0 2px 0 -1px rgba(233,30,63,.35); }
    .auc-stamp { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid currentColor; font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }

    @media (prefers-reduced-motion: reduce) {
      .auc-in { animation: none; opacity: 1; }
      .auc-coin-live, .auc-coin-focus::after { animation: none; }
      .auc-coin { transition: none; }
    }
  `}</style>
);
