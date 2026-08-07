"use client";

import React from "react";

/* 📌 경매 전용 디자인 시스템 — 대회(각진 네온 HUD)와 완전히 분리한 '경매 원장' 톤
   · 직각 패널 (컷코너 없음)  · 얇은 규칙선  · LOT 번호  · 등폭 숫자  · 도장형 상태 라벨
   · 주 색은 사이트 대표색 레드(#e91e3f), 블루는 전략타임 등 소수 포인트로만 사용 */
export const AuctionStyles = () => (
  <style>{`
    .auc-label { font-size: 10px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; }
    .auc-mono { letter-spacing: .2em; font-variant-numeric: tabular-nums; }
    .auc-num { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
    .auc-serif { font-weight: 800; letter-spacing: -.02em; }
    .auc-rule-top { height: 3px; border-top: 1px solid rgba(233,30,63,.55); border-bottom: 1px solid rgba(255,255,255,.10); }
    /* 낙찰 도장 느낌의 상태 라벨 */
    .auc-stamp { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border:1px solid currentColor; font-size:10px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; }
    /* 원장 행 — 좌측 인디케이터 */
    .auc-row { position:relative; transition: background .2s ease; }
    .auc-row::before { content:""; position:absolute; left:0; top:0; bottom:0; width:2px; background:#e91e3f; transform:scaleY(0); transition:transform .25s ease; }
    .auc-row:hover::before { transform:scaleY(1); }
    .auc-row:hover { background: rgba(255,255,255,.022); }
    /* 패널 머리 — 얇은 이중선 */
    .auc-head { border-bottom: 1px solid rgba(255,255,255,.09); box-shadow: 0 2px 0 -1px rgba(233,30,63,.35); }
  `}</style>
);
