"use client";

import React from "react";

/* 📌 경매 전용 디자인 — 블랙 & 화이트
   · 코인 : 실제 주화처럼 톱니 테두리(널링) + 이중 림 + 음각 면. 바둑알처럼 밋밋하지 않게.
   · 배경 : POINT / AUCTION 두 줄 워드마크
   · 상태 : LIVE는 밝고 링이 번지고, CLOSED는 탈색되어 확실히 구분 */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-num   { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .auc-mono  { letter-spacing: .2em; font-variant-numeric: tabular-nums; }

    /* ── 배경 워드마크 (POINT / AUCTION) ── */
    .auc-ghost {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      display: flex; flex-direction: column; align-items: center; gap: .02em;
      pointer-events: none; user-select: none; white-space: nowrap; line-height: .82;
    }
    .auc-ghost span { font-weight: 900; letter-spacing: -.045em; }
    .auc-ghost .g1 { font-size: clamp(5rem, 17vw, 14rem); color: rgba(255,255,255,.055); -webkit-text-stroke: 1.5px rgba(255,255,255,.17); }
    .auc-ghost .g2 { font-size: clamp(3.4rem, 11.5vw, 9.4rem); color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,.10); letter-spacing: .06em; }

    /* ── 코인 무대 ── */
    .auc-stage { --size: 280px; --gap: 260px; position: relative; height: 360px; display: flex; align-items: center; justify-content: center; }
    @media (max-width: 768px) { .auc-stage { --size: 190px; --gap: 150px; height: 250px; } }

    .auc-coin {
      position: absolute; width: var(--size); height: var(--size); border-radius: 9999px;
      cursor: pointer;
      /* 톱니(널링) 테두리 — 안쪽 원반이 덮어서 림에만 보인다 */
      background:
        repeating-conic-gradient(from 0deg, rgba(255,255,255,.20) 0deg 1.1deg, rgba(255,255,255,0) 1.1deg 3.2deg),
        linear-gradient(155deg, #262626 0%, #101010 55%, #050505 100%);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.22),
        inset 0 3px 10px rgba(255,255,255,.07),
        inset 0 -12px 26px rgba(0,0,0,.75),
        0 22px 60px -24px #000;
      transform: translateX(calc(var(--gap) * var(--off))) scale(.56);
      opacity: .5;
      transition: transform .6s cubic-bezier(.16,1,.3,1), opacity .45s ease, box-shadow .45s ease, filter .45s ease;
    }
    .auc-coin:hover { opacity: .78; }

    /* 안쪽 원반(음각 면) — 톱니를 가리고 이중 림을 만든다 */
    .auc-coin::before {
      content: ""; position: absolute; inset: 7.5%; border-radius: 9999px; pointer-events: none;
      background:
        radial-gradient(circle at 36% 26%, rgba(255,255,255,.09), rgba(255,255,255,0) 58%),
        linear-gradient(160deg, #191919 0%, #0d0d0d 60%, #060606 100%);
      box-shadow:
        inset 0 0 0 1px rgba(255,255,255,.13),
        inset 0 8px 20px rgba(0,0,0,.65),
        0 1px 0 rgba(255,255,255,.06);
    }
    /* 광택 */
    .auc-coin::after {
      content: ""; position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;
      background: linear-gradient(118deg, transparent 40%, rgba(255,255,255,.13) 50%, transparent 60%);
      transform: translateX(-130%);
    }
    .auc-coin-focus::after { animation: aucShine 5s ease-in-out infinite; }
    @keyframes aucShine { 0% { transform: translateX(-130%) } 45%,100% { transform: translateX(130%) } }

    .auc-coin-focus { transform: translateX(0) scale(1); opacity: 1; }

    /* LIVE — 밝고 링이 번진다 */
    .auc-coin-live {
      box-shadow:
        inset 0 0 0 2px rgba(255,255,255,.75),
        inset 0 3px 10px rgba(255,255,255,.10),
        inset 0 -12px 26px rgba(0,0,0,.7),
        0 0 0 0 rgba(255,255,255,.18),
        0 22px 60px -24px #000;
      animation: aucBeat 2.8s ease-in-out infinite;
    }
    @keyframes aucBeat {
      0%,100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,.75), inset 0 -12px 26px rgba(0,0,0,.7), 0 0 0 0 rgba(255,255,255,.20), 0 22px 60px -24px #000; }
      60%     { box-shadow: inset 0 0 0 2px rgba(255,255,255,1),   inset 0 -12px 26px rgba(0,0,0,.7), 0 0 0 18px rgba(255,255,255,0), 0 22px 60px -24px #000; }
    }
    /* CLOSED — 탈색 + 어둡게 */
    .auc-coin-closed { filter: grayscale(1) brightness(.45) contrast(.9); }
    .auc-coin-closed.auc-coin-focus { filter: grayscale(1) brightness(.62); opacity: .9; }
    /* 종료 사선 각인 */
    .auc-coin-closed .auc-bar { position:absolute; left:8%; right:8%; top:50%; height:1px; background:rgba(255,255,255,.28); transform: rotate(-18deg); }

    .auc-coin-in {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center; padding: 19%;
    }

    /* ── 이전 경매 행 ── */
    .auc-past { transition: background-color .25s ease, padding-left .3s cubic-bezier(.16,1,.3,1); }
    .auc-past:hover { background-color: rgba(255,255,255,.03); padding-left: 14px; }

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
