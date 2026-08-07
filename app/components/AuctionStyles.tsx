"use client";

import React from "react";

/* 📌 경매 전용 디자인
   · 무대 : 진행 중인 경매를 큰 마름모로 중앙에, 나머지는 옆에 작고 흐릿하게
   · 배경 : POINT 워드마크가 크게 깔림
   · 색   : 무채색 + 레드 하나. (여러 색 섞지 않는다) */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-num   { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .auc-mono  { letter-spacing: .2em; font-variant-numeric: tabular-nums; }

    /* ── 배경 POINT 워드마크 ── */
    .auc-ghost {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      font-size: clamp(9rem, 30vw, 26rem); font-weight: 900; letter-spacing: -.04em;
      line-height: 1; white-space: nowrap; pointer-events: none; user-select: none;
      color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,.055);
      opacity: .9;
    }

    /* ── 마름모 무대 ── */
    .auc-stage {
      --size: 250px; --gap: 240px;
      position: relative; height: 420px; display: flex; align-items: center; justify-content: center;
    }
    @media (max-width: 768px) { .auc-stage { --size: 168px; --gap: 152px; height: 300px; } }

    .auc-dia {
      position: absolute; width: var(--size); height: var(--size);
      transform: rotate(45deg) translate3d(0,0,0);
      border: 1px solid rgba(255,255,255,.13);
      background: rgba(255,255,255,.018);
      cursor: pointer;
      transition: transform .6s cubic-bezier(.16,1,.3,1), opacity .5s ease, border-color .4s ease, background-color .4s ease, filter .5s ease;
      /* --off : -2 ~ 2 (중앙 기준 좌우 위치) */
      transform: translateX(calc(var(--gap) * var(--off))) rotate(45deg) scale(.52);
      opacity: .3; filter: blur(1px);
    }
    .auc-dia:hover { opacity: .6; filter: none; }

    .auc-dia-focus {
      transform: translateX(0) rotate(45deg) scale(1);
      opacity: 1; filter: none;
      border-color: rgba(255,255,255,.28);
      background: rgba(255,255,255,.028);
    }
    .auc-dia-focus:hover { border-color: rgba(255,255,255,.5); background: rgba(255,255,255,.05); }

    /* 진행 중 — 레드 테두리 + 은은한 맥박 */
    .auc-dia-live { border-color: rgba(233,30,63,.85); animation: aucBeat 2.6s ease-in-out infinite; }
    @keyframes aucBeat {
      0%,100% { box-shadow: 0 0 0 0 rgba(233,30,63,.30), 0 0 40px -8px rgba(233,30,63,.35) inset; }
      50%     { box-shadow: 0 0 0 12px rgba(233,30,63,0),  0 0 60px -6px rgba(233,30,63,.5) inset; }
    }
    .auc-dia-end { opacity: .18; }
    .auc-dia-end.auc-dia-focus { opacity: .75; }
    .auc-dia-empty { position: relative; width: 190px; height: 190px; transform: rotate(45deg) scale(1); opacity: 1; filter: none; cursor: default; }

    /* 마름모 내용 — 다시 -45° 돌려 수평으로 */
    .auc-dia-in {
      position: absolute; inset: 0; transform: rotate(-45deg);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 19%; text-align: center;
    }

    /* ── 진입 ── */
    .auc-in { opacity: 0; animation: aucIn .6s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucIn { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }

    /* 경매방 공용 */
    .auc-head { border-bottom: 1px solid rgba(255,255,255,.09); box-shadow: 0 2px 0 -1px rgba(233,30,63,.35); }
    .auc-stamp { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid currentColor; font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }

    @media (prefers-reduced-motion: reduce) {
      .auc-in { animation: none; opacity: 1; }
      .auc-dia-live { animation: none; }
      .auc-dia { transition: none; }
    }
  `}</style>
);
