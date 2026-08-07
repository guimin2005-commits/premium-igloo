"use client";

import React from "react";

/* 📌 경매 전용 디자인 — '경매' 그 자체에서 출발
   ① POINT : 판돈이 주인공. 등폭 대형 숫자가 화면의 중심.
   ② VS    : 팀과 선수가 맞붙는 대치 구도.
   ③ 낙찰  : 망치가 내려치듯 좌→우로 그어지는 스트라이크.
   색은 두 개의 역할로만 쓴다 — 레드=경합/낙찰, 블루=포인트. 사선·무지개 없음. */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-num   { font-variant-numeric: tabular-nums; letter-spacing: -.02em; }

    /* ── 낙찰 스트라이크 : 호버 시 망치가 지나가듯 밑줄이 그어진다 ── */
    .auc-lot { position: relative; transition: background-color .25s ease; }
    .auc-lot:hover { background-color: rgba(255,255,255,.022); }
    .auc-lot .auc-strike { position:absolute; left:0; right:0; bottom:-1px; height:2px; background:#e91e3f; transform:scaleX(0); transform-origin:left; transition: transform .45s cubic-bezier(.16,1,.3,1); }
    .auc-lot:hover .auc-strike { transform: scaleX(1); }

    /* ── VS 배지 ── */
    .auc-vs { position: relative; display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; }
    .auc-vs::before { content:""; position:absolute; inset:0; border:1px solid rgba(255,255,255,.14); transform: rotate(45deg); transition: transform .5s cubic-bezier(.16,1,.3,1), border-color .3s ease; }
    .group:hover .auc-vs::before { transform: rotate(135deg); border-color: rgba(233,30,63,.7); }

    /* ── LIVE 맥박 ── */
    .auc-live { animation: aucLive 1.8s ease-in-out infinite; }
    @keyframes aucLive { 0%,100% { box-shadow: 0 0 0 0 rgba(233,30,63,.5) } 70% { box-shadow: 0 0 0 8px rgba(233,30,63,0) } }

    /* ── 호가 눈금 : 포인트 수치 아래 얇은 게이지 ── */
    .auc-gauge { height:2px; background: rgba(255,255,255,.08); overflow:hidden; }
    .auc-gauge > span { display:block; height:100%; background:#4d7cfe; transform-origin:left; animation: aucFill 1.1s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucFill { from { transform: scaleX(0) } to { transform: scaleX(1) } }

    /* ── 진입 ── */
    .auc-in { opacity:0; animation: aucIn .6s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucIn { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform:none } }

    /* ── 숫자 롤업 (헤드라인 포인트 풀) ── */
    .auc-roll { display:inline-block; animation: aucRoll .9s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucRoll { from { opacity:0; transform: translateY(.35em) } to { opacity:1; transform:none } }

    /* 경매방 공용 */
    .auc-head { border-bottom: 1px solid rgba(255,255,255,.09); box-shadow: 0 2px 0 -1px rgba(233,30,63,.35); }
    .auc-mono { letter-spacing: .2em; font-variant-numeric: tabular-nums; }
    .auc-stamp { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid currentColor; font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }

    @media (prefers-reduced-motion: reduce) {
      .auc-in, .auc-roll, .auc-live, .auc-gauge > span { animation: none !important; }
      .auc-in, .auc-roll { opacity:1; }
      .auc-gauge > span { transform:none; }
    }
  `}</style>
);
