"use client";

import React from "react";

/* 📌 경매 전용 디자인 — 블랙 & 화이트 '초대장 티켓'
   · 티켓 : 절취선 + 노치로 잘린 입장권. 중앙이 본권, 좌우는 뒤에 겹쳐 놓인 초대장.
   · 배경 : POINT / AUCTION 두 줄 워드마크
   · 상태 : LIVE는 흰 테두리로 번지고, CLOSED는 탈색 + 도장 */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    /* 보조 라벨 — 경매방 라인 레이아웃에서 캡션으로 사용 (utility 로 font-size 를 덮으면 .auc-label 이 이겨서 별도 클래스로 둔다) */
    .auc-label-xs { font-size: 8px; font-weight: 900; letter-spacing: .2em; text-transform: uppercase; }
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
      cursor: pointer;
      /* ⚠️ 루트에 페이지색 배경 — 노치 구멍·찢긴 틈으로 뒤 티켓이 비치는 것을 차단
         (구멍으로는 페이지 배경색만 보이므로 '뚫린' 연출은 유지된다) */
      background: #090909;
      transform: translateX(calc(var(--gap) * var(--off))) scale(.86) rotate(calc(var(--off) * 4deg));
      transition: transform .6s cubic-bezier(.16,1,.3,1);
    }
    /* ⚠️ 흐리게 하는 처리는 '조각'에만 건다.
       루트까지 어둡게 하면 배경(#090909)이 페이지보다 더 검어져 검은 판으로 보이고,
       조각이 어긋난 틈(찢긴 자국)도 그 검은 판에 묻혀 안 보인다. */
    .auc-ticket .auc-half, .auc-ticket .auc-perf { filter: brightness(.5); }
    .auc-ticket:not(.auc-ticket-focus):hover .auc-half,
    .auc-ticket:not(.auc-ticket-focus):hover .auc-perf { filter: brightness(.8); }

    /* 본권 / 스텁 — 절취선을 기준으로 실제 두 조각이다 (그래야 찢어진다) */
    /* ⚠️ 이음새 쪽 테두리는 그리지 않는다 — 안 그러면 점선 절취선이 실선에 묻힌다 */
    .auc-half {
      position: absolute; top: 0; bottom: 0; overflow: hidden;
      background: linear-gradient(150deg, #17171a 0%, #101012 55%, #08080a 100%);
      border: 1px solid rgba(255,255,255,.16);
      box-shadow: 0 22px 60px -26px #000;
      transition: border-color .45s ease, box-shadow .45s ease, filter .45s ease, transform .45s cubic-bezier(.16,1,.3,1);
    }
    /* 절취선 위 노치 — 배경색과 무관하게 진짜로 뚫는다 */
    .auc-half-l {
      left: 0; width: var(--split); border-right: 0;
      -webkit-mask:
        radial-gradient(circle var(--notch) at 100% 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at 100% 100%, transparent 97%, #000 100%);
      -webkit-mask-composite: source-in;
      mask:
        radial-gradient(circle var(--notch) at 100% 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at 100% 100%, transparent 97%, #000 100%);
      mask-composite: intersect;
    }
    .auc-half-r {
      right: 0; width: calc(100% - var(--split)); border-left: 0;
      -webkit-mask:
        radial-gradient(circle var(--notch) at 0% 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at 0% 100%, transparent 97%, #000 100%);
      -webkit-mask-composite: source-in;
      mask:
        radial-gradient(circle var(--notch) at 0% 0%,   transparent 97%, #000 100%),
        radial-gradient(circle var(--notch) at 0% 100%, transparent 97%, #000 100%);
      mask-composite: intersect;
    }

    /* 절취선 */
    .auc-ticket .auc-perf {
      position: absolute; left: var(--split); top: 15px; bottom: 15px; width: 0;
      border-left: 1px dashed rgba(255,255,255,.22);
      transition: opacity .2s ease, filter .45s ease;
    }
    /* 광택 — 두 조각에 각각 두되, 폭·기준점을 '티켓 전체'로 맞춰 절취선을 가로질러 이어지게 한다
       (조각마다 overflow:hidden 이라 밖으로는 새지 않는다) */
    .auc-shine {
      position: absolute; top: -20%; bottom: -20%; pointer-events: none;
      background: linear-gradient(118deg, transparent 42%, rgba(255,255,255,.11) 50%, transparent 58%);
      transform: translateX(-100%);
    }
    /* split 70/30 기준: 두 조각의 광택이 같은 폭·같은 시작점을 갖도록 환산 */
    .auc-half-l .auc-shine { left: 0;          width: 142.857%; }
    .auc-half-r .auc-shine { left: -233.333%;  width: 333.333%; }
    .auc-ticket-focus .auc-shine { animation: aucShine 5.5s ease-in-out infinite; }
    @keyframes aucShine { 0% { transform: translateX(-100%) } 42%,100% { transform: translateX(100%) } }

    .auc-ticket-focus { transform: translateX(0) scale(1) rotate(0deg); z-index: 20; }
    .auc-ticket-focus .auc-half, .auc-ticket-focus .auc-perf { filter: none; }
    .auc-ticket-focus .auc-half { border-color: rgba(255,255,255,.32); box-shadow: 0 26px 70px -24px #000; }
    .auc-ticket-focus:hover .auc-half { border-color: rgba(255,255,255,.6); box-shadow: 0 26px 80px -20px #000; }

    /* LIVE — 테두리가 밝아지며 바깥으로 번진다 */
    .auc-ticket-live .auc-half { border-color: rgba(255,255,255,.8); animation: aucBeat 2.8s ease-in-out infinite; }
    @keyframes aucBeat {
      0%,100% { box-shadow: 0 0 0 0 rgba(255,255,255,.20), 0 26px 70px -24px #000; }
      60%     { box-shadow: 0 0 0 14px rgba(255,255,255,0), 0 26px 70px -24px #000; }
    }

    /* ── 입장 : 절취선을 따라 찢고 두 조각이 흩어진다 ── */
    .auc-ticket-tear { pointer-events: none; }
    .auc-ticket-tear .auc-perf { opacity: 0; }
    .auc-ticket-tear .auc-half { animation: none; }
    .auc-ticket-tear .auc-half-l { animation: aucTearL .72s cubic-bezier(.34,.02,.2,1) forwards; }
    .auc-ticket-tear .auc-half-r { animation: aucTearR .72s cubic-bezier(.34,.02,.2,1) forwards; }
    @keyframes aucTearL {
      0%   { transform: none; opacity: 1; }
      14%  { transform: translate(-5px, 3px) rotate(-1.2deg); }
      100% { transform: translate(-160px, 54px) rotate(-13deg); opacity: 0; }
    }
    @keyframes aucTearR {
      0%   { transform: none; opacity: 1; }
      14%  { transform: translate(5px, -3px) rotate(1.4deg); }
      100% { transform: translate(170px, 74px) rotate(16deg); opacity: 0; }
    }
    /* 찢기는 순간 절취선에서 번쩍 */
    .auc-ticket-tear::after {
      content: ""; position: absolute; left: var(--split); top: 0; bottom: 0; width: 2px;
      background: #fff; transform: translateX(-1px); animation: aucRip .5s ease-out forwards;
    }
    @keyframes aucRip {
      0%   { opacity: 0; box-shadow: 0 0 0 0 rgba(255,255,255,.5); }
      18%  { opacity: 1; box-shadow: 0 0 26px 5px rgba(255,255,255,.55); }
      100% { opacity: 0; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    }
    /* CLOSED — 이미 찢겨 어긋난 상태로 놓인다 (다시 찢을 게 없으니 바로 입장) */
    .auc-ticket-closed .auc-half, .auc-ticket-closed .auc-perf { filter: grayscale(1) brightness(.62); }
    .auc-ticket-closed:not(.auc-ticket-focus):hover .auc-half,
    .auc-ticket-closed:not(.auc-ticket-focus):hover .auc-perf { filter: grayscale(1) brightness(.85); }
    .auc-ticket-closed.auc-ticket-focus .auc-half { filter: grayscale(1) brightness(.9); }
    /* 찢긴 조각이 페이지 바닥에서 떠 보이도록 테두리를 조금 살려둔다 */
    .auc-ticket-closed .auc-half { animation: none; border-color: rgba(255,255,255,.2); }
    .auc-ticket-closed .auc-half-l { transform: translate(-7px, 4px) rotate(-1.4deg); }
    .auc-ticket-closed .auc-half-r { transform: translate(10px, 7px) rotate(2.4deg); }
    .auc-ticket-closed:hover .auc-half-l { transform: translate(-11px, 6px) rotate(-2deg); }
    .auc-ticket-closed:hover .auc-half-r { transform: translate(15px, 10px) rotate(3.4deg); }
    .auc-ticket-closed .auc-perf { opacity: 0; }

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
      .auc-ticket-live .auc-half, .auc-ticket-focus .auc-shine { animation: none; }
      .auc-ticket { transition: none; }
      /* 찢기 연출은 유지하되 짧게 */
      .auc-ticket-tear .auc-half-l, .auc-ticket-tear .auc-half-r { animation-duration: .3s; }
    }
  `}</style>
);
