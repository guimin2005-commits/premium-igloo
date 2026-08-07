"use client";

import React from "react";

/* 📌 경매 전용 디자인 — 블랙 & 화이트 '초대장 티켓'
   · 티켓 : 절취선 + 노치로 잘린 입장권. 중앙이 본권, 좌우는 뒤에 겹쳐 놓인 초대장.
   · 배경 : POINT / AUCTION 두 줄 워드마크
   · 상태 : LIVE는 흰 테두리로 번지고, CLOSED는 탈색 + 도장 */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-num   { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
    .auc-mono  { letter-spacing: .2em; font-variant-numeric: tabular-nums; }

    /* ── 배경 워드마크 ── */
    .auc-ghost {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
      display: flex; flex-direction: column; align-items: center;
      pointer-events: none; user-select: none; white-space: nowrap; line-height: .82;
    }
    .auc-ghost span { font-weight: 900; letter-spacing: -.045em; }
    .auc-ghost .g1 { font-size: clamp(3.6rem, 12vw, 9.5rem); color: rgba(255,255,255,.055); -webkit-text-stroke: 1.5px rgba(255,255,255,.17); }
    .auc-ghost .g2 { font-size: clamp(2.4rem, 8vw, 6.4rem); color: transparent; -webkit-text-stroke: 1px rgba(255,255,255,.10); letter-spacing: .06em; }

    /* ── 티켓 무대 ── */
    .auc-stage { --tw: 460px; --th: 210px; --gap: 210px; position: relative; height: 330px; display: flex; align-items: center; justify-content: center; }
    @media (max-width: 860px) { .auc-stage { --tw: 320px; --th: 170px; --gap: 120px; height: 280px; } }
    @media (max-width: 520px) { .auc-stage { --tw: 270px; --th: 156px; --gap: 78px; height: 250px; } }

    .auc-ticket {
      position: absolute; width: var(--tw); height: var(--th);
      --notch: 13px; --split: 70%;
      cursor: pointer; overflow: hidden;
      background: linear-gradient(150deg, #17171a 0%, #101012 55%, #08080a 100%);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.16), 0 22px 60px -26px #000;
      /* 절취선 위치의 노치 — 배경색과 무관하게 진짜로 뚫는다 */
      -webkit-mask:
        radial-gradient(circle var(--notch) at var(--split) 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at var(--split) 100%, transparent 97%, #000 100%);
      -webkit-mask-composite: source-in;
      mask:
        radial-gradient(circle var(--notch) at var(--split) 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at var(--split) 100%, transparent 97%, #000 100%);
      mask-composite: intersect;
      transform: translateX(calc(var(--gap) * var(--off))) scale(.86) rotate(calc(var(--off) * 4deg));
      opacity: .45;
      transition: transform .6s cubic-bezier(.16,1,.3,1), opacity .45s ease, box-shadow .45s ease, filter .45s ease;
    }
    /* ⚠️ 중앙 티켓까지 반투명해지면 뒤 티켓이 비쳐 보인다 — 뒤 티켓에만 적용 */
    .auc-ticket:not(.auc-ticket-focus):hover { opacity: .72; }

    /* 절취선 */
    .auc-ticket .auc-perf {
      position: absolute; left: var(--split); top: 14px; bottom: 14px; width: 0;
      border-left: 1px dashed rgba(255,255,255,.22);
    }
    /* 광택 — 티켓 안에서만 (overflow:hidden 으로 밖으로 새지 않음) */
    .auc-ticket .auc-shine {
      position: absolute; inset: -20% -40%; pointer-events: none;
      background: linear-gradient(118deg, transparent 42%, rgba(255,255,255,.10) 50%, transparent 58%);
      transform: translateX(-100%);
    }
    .auc-ticket-focus .auc-shine { animation: aucShine 5.5s ease-in-out infinite; }
    @keyframes aucShine { 0% { transform: translateX(-100%) } 42%,100% { transform: translateX(100%) } }

    .auc-ticket-focus {
      transform: translateX(0) scale(1) rotate(0deg);
      opacity: 1;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.30), 0 26px 70px -24px #000;
      z-index: 20;
    }
    .auc-ticket-focus:hover { box-shadow: inset 0 0 0 1px rgba(255,255,255,.6), 0 26px 80px -20px #000; }

    /* LIVE */
    .auc-ticket-live { box-shadow: inset 0 0 0 2px rgba(255,255,255,.8), 0 26px 70px -24px #000; animation: aucBeat 2.8s ease-in-out infinite; }
    @keyframes aucBeat {
      0%,100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,.75), 0 0 0 0 rgba(255,255,255,.18), 0 26px 70px -24px #000; }
      60%     { box-shadow: inset 0 0 0 2px rgba(255,255,255,1),   0 0 0 14px rgba(255,255,255,0), 0 26px 70px -24px #000; }
    }
    /* CLOSED */
    .auc-ticket-closed { filter: grayscale(1) brightness(.5); }
    .auc-ticket-closed.auc-ticket-focus { filter: grayscale(1) brightness(.7); opacity: .92; }

    /* 종료 도장 */
    .auc-seal {
      position: absolute; right: 14%; top: 50%; transform: translateY(-50%) rotate(-14deg);
      border: 2px solid rgba(255,255,255,.35); color: rgba(255,255,255,.45);
      padding: 4px 10px; font-size: 11px; font-weight: 900; letter-spacing: .2em;
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
      .auc-ticket-live, .auc-ticket-focus .auc-shine { animation: none; }
      .auc-ticket { transition: none; }
    }
  `}</style>
);
