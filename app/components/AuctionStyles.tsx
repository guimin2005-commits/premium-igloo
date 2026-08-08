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
    /* 한글 캡션 — auc-label-xs 의 자간(.2em)·uppercase 는 영문 전용이다.
       한글에 걸면 '최 고  티 어' 처럼 벌어져 읽기 나쁘므로 자간 없는 별도 클래스를 쓴다. */
    .auc-cap { font-size: 9px; font-weight: 900; letter-spacing: 0; }
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

    /* ── 무대 배경 ── */
    /* 일반 매물 — 메인 화면 티켓과 같은 블랙&화이트 패널 */
    .auc-stage-panel { background: linear-gradient(150deg, #17171a 0%, #101012 55%, #08080a 100%); }

    /* 올 포지션(황금카드) 매물 — 배경 자체가 골드 그라데이션으로 바뀐다 (강도는 절제) */
    .auc-stage-golden {
      background:
        radial-gradient(ellipse 120% 80% at 50% -10%, rgba(251,191,36,.17) 0%, rgba(180,83,9,.06) 45%, transparent 72%),
        linear-gradient(150deg, #1f1706 0%, #150f04 48%, #0a0703 100%);
      border-color: rgba(251,191,36,.32) !important;
      box-shadow: inset 0 0 90px rgba(251,191,36,.055), 0 0 40px -18px rgba(251,191,36,.25);
    }
    /* 배경 위를 천천히 훑는 금빛 광택 */
    .auc-stage-golden::before {
      content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 0;
      background: linear-gradient(112deg, transparent 34%, rgba(255,240,180,.07) 47%, rgba(255,246,210,.11) 50%, rgba(255,240,180,.07) 53%, transparent 66%);
      background-size: 260% 100%;
      animation: aucGoldSweep 5.2s ease-in-out infinite;
    }
    @keyframes aucGoldSweep {
      0%   { background-position: 130% 0; }
      55%  { background-position: -30% 0; }
      100% { background-position: -30% 0; }
    }
    /* 상단 포인트 라인도 금빛으로 흐른다 */
    .auc-stage-goldline {
      background: linear-gradient(90deg, #b45309, #fde047, #fef9c3, #f59e0b, #b45309);
      background-size: 300% 100%;
      animation: aucGoldLine 3.2s linear infinite;
    }
    @keyframes aucGoldLine { 0% { background-position: 0% 0 } 100% { background-position: 300% 0 } }

    /* 올 포지션 매물 이름 — 금빛으로 흐르는 글자 (기본 lux-shimmer 는 레드 계열이라 별도) */
    .auc-gold-text {
      background: linear-gradient(110deg, #fef3c7 18%, #f59e0b 38%, #fffbeb 50%, #f59e0b 62%, #fef3c7 82%);
      background-size: 220% auto;
      -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; color: transparent;
      animation: aucGoldText 5s linear infinite;
      filter: drop-shadow(0 0 14px rgba(251,191,36,.28));
    }
    @keyframes aucGoldText { 0% { background-position: 0% center } 100% { background-position: 220% center } }

    /* ══ 골든 티켓 ══
       메인 화면 초대장 티켓(.auc-ticket)과 같은 해부 구조 — 본권 + 스텁, 절취선, 노치 — 를
       금장으로 다시 칠한 것. 올 포지션 매물 등장 연출에 쓴다. */
    .auc-gticket {
      position: relative; --notch: 13px; --split: 70%;
      width: 460px; height: 210px;
      background: #090909; /* 노치 구멍으로 뒤가 비치지 않도록 */
    }
    @media (max-width: 860px) { .auc-gticket { width: 340px; height: 172px; --notch: 11px; } }
    @media (max-width: 520px) { .auc-gticket { width: 282px; height: 152px; --notch: 10px; } }

    .auc-gticket .auc-half {
      background: linear-gradient(150deg, #4d3808 0%, #2b1f05 52%, #150e02 100%);
      border-color: rgba(251,191,36,.7);
      box-shadow: 0 26px 70px -22px #000, 0 0 46px -8px rgba(251,191,36,.45);
    }
    /* 금박 테두리 이중선 */
    .auc-gticket .auc-half::after {
      content: ""; position: absolute; inset: 6px; pointer-events: none;
      border: 1px solid rgba(251,191,36,.28);
    }
    /* 절취선 — .auc-ticket 스코프를 쓰지 않으므로 별도로 둔다 */
    .auc-gticket .auc-perf {
      position: absolute; left: var(--split); top: 15px; bottom: 15px; width: 0;
      border-left: 1px dashed rgba(251,191,36,.55);
    }
    /* 광택 — 본권/스텁을 가로질러 이어지도록 폭을 환산 (메인 티켓과 동일 규칙) */
    .auc-gticket .auc-shine {
      background: linear-gradient(118deg, transparent 40%, rgba(255,244,196,.34) 50%, transparent 60%);
      animation: aucShine 2.6s ease-in-out infinite;
    }

    /* 등장 — 아래에서 떠오르며 자리를 잡고, 임팩트 순간 절취선에서 번쩍 */
    .auc-gt-scene { animation: aucGtIn 4.3s cubic-bezier(.16,1,.3,1) forwards; }
    @keyframes aucGtIn {
      0%   { transform: translate(-50%, -18%) scale(.58) rotate(-7deg); opacity: 0; filter: blur(12px); }
      18%  { opacity: 1; }
      44%  { transform: translate(-50%, -52%) scale(1.04) rotate(1.5deg); opacity: 1; filter: blur(0); }
      50%  { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
      55%  { transform: translate(-50%, -50.5%) scale(1.015) rotate(0deg); }
      60%, 85% { transform: translate(-50%, -50%) scale(1) rotate(0deg); opacity: 1; filter: blur(0); }
      100% { transform: translate(-50%, -52%) scale(1.14) rotate(0deg); opacity: 0; filter: blur(7px); }
    }
    /* 착지 섬광 — 절취선을 따라 흰 빛이 터진다 */
    .auc-gt-flash {
      position: absolute; left: var(--split); top: 0; bottom: 0; width: 2px;
      transform: translateX(-1px); background: #fff; opacity: 0; pointer-events: none; z-index: 6;
      animation: aucGtFlash 4.3s ease-out forwards;
    }
    @keyframes aucGtFlash {
      0%, 44% { opacity: 0; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
      50%     { opacity: 1; box-shadow: 0 0 34px 7px rgba(255,240,190,.7); }
      64%,100%{ opacity: 0; box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    }

    /* ══ 골든 카드 — 홀로그램 포일 ══
       수집가용 트레이딩 카드 질감. 금박 테두리 + 기요셰(지폐 인그레이빙) 음각 위로
       무지개 홀로 시트가 흐르고, 카드가 옆면에서 정면으로 회전하며 착지한다. */
    .auc-gcard-stage { position: absolute; top: 50%; left: 50%; perspective: 1300px; }
    .auc-gcard-outer { animation: aucGcDeal 4.3s cubic-bezier(.18,.86,.28,1) forwards; }
    .auc-gcard-spin  { animation: aucGcFlat 4.3s cubic-bezier(.18,.86,.28,1) forwards; }

    .auc-gcard { position: relative; width: 214px; height: 300px; border-radius: 14px; padding: 3px;
      background: linear-gradient(135deg, #fff7d6, #f59e0b, #fde68a, #b45309, #fde047, #f59e0b);
      background-size: 300% 300%;
      animation: aucGcFoil 3s linear infinite;
      box-shadow: 0 0 62px rgba(250,204,21,.45), 0 30px 60px -20px #000;
    }

    .auc-gcard-face { position: relative; width: 100%; height: 100%; border-radius: 11px; overflow: hidden;
      display: flex; flex-direction: column;
      background: radial-gradient(ellipse at 50% 30%, #3b2b0a 0%, #1b1305 62%, #0d0902 100%); }

    /* 기요셰 음각 — 동심원 + 방사선이 겹쳐 로제트 문양을 만든다 */
    .auc-gcard-guilloche { position: absolute; inset: 0; opacity: .5; mix-blend-mode: screen;
      background:
        repeating-radial-gradient(circle at 50% 40%, transparent 0 4px, rgba(251,191,36,.14) 4px 5px),
        repeating-conic-gradient(from 0deg at 50% 40%, transparent 0 3deg, rgba(251,191,36,.07) 3deg 6deg);
    }
    /* 착지 후 표면을 천천히 지나는 광원 */
    .auc-gcard-light { position: absolute; inset: -30%; pointer-events: none;
      background: radial-gradient(circle at 50% 50%, rgba(255,250,220,.34) 0%, transparent 46%);
      animation: aucGcLight 4.3s ease-in-out forwards; }

    /* 초상 창 — 정체를 감춘 실루엣이 앉는 자리 */
    /* ⚠️ 창/명판을 57%·43% 로 고정하면 좁은 화면에서 명판 글이 카드 밖으로 잘린다.
       명판은 내용만큼만 차지하고 남는 높이를 창이 가져가게 한다. */
    .auc-gcard-window { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
      background: radial-gradient(ellipse at 50% 118%, rgba(251,191,36,.30) 0%, rgba(120,53,15,.12) 42%, transparent 72%), linear-gradient(180deg, #0a0702 0%, #150e03 100%); }
    /* 카드를 가로지르는 거대 워드마크 — 잘려 나갈 만큼 크게 */
    .auc-gcard-word { position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%);
      font-size: 132px; font-weight: 900; letter-spacing: -.06em; line-height: 1; white-space: nowrap;
      color: transparent; -webkit-text-stroke: 1.5px rgba(251,191,36,.22); user-select: none; }
    /* 실루엣 — 검게 채우고 아래에서 금빛을 받는다 */
    .auc-gcard-figure { position: absolute; left: 50%; bottom: -8%; transform: translateX(-50%);
      width: 74%; color: #05040100; }
    .auc-gcard-figure svg { width: 100%; height: auto; display: block; fill: #07050f;
      filter: drop-shadow(0 -2px 0 rgba(251,191,36,.5)) drop-shadow(0 0 18px rgba(251,191,36,.28)); }
    /* 창 하단 비네트 */
    .auc-gcard-window::after { content: ""; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(180deg, rgba(0,0,0,.55) 0%, transparent 32%, transparent 68%, rgba(0,0,0,.6) 100%); }

    /* 명판 — 이름과 능력치 */
    .auc-gcard-plate { position: relative; flex: 0 0 auto; padding: 12px 14px 10px;
      background: linear-gradient(180deg, #1c1405 0%, #0d0902 100%); }
    .auc-gcard-plate::before { content: ""; position: absolute; inset-inline: 10px; top: 0; height: 1px;
      background: linear-gradient(90deg, transparent, rgba(251,191,36,.75), transparent); }
    /* 리플 — 덱에서 튕겨 나온 '일반 카드'들이 화면을 가로질러 스쳐 간다.
       ⚠️ 특징 없는 사각형이면 그래픽 오류로 보인다 → 뒷면 문양·이중 프레임을 넣어 카드로 읽히게 하고,
          흑백으로 칠해 금색 본 카드와 한눈에 구분되게 한다. */
    .auc-gdeal-fly { position: absolute; top: 50%; left: 50%; width: 194px; height: 272px; border-radius: 12px;
      background:
        repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 6px, transparent 6px 12px),
        linear-gradient(150deg, #1a1b1e 0%, #0e0f11 100%);
      border: 1px solid rgba(255,255,255,.3);
      box-shadow: 0 18px 40px -18px #000;
      opacity: 0; will-change: transform;
      animation: aucGcFly 1.25s cubic-bezier(.28,.6,.42,1) forwards; }
    /* 뒷면 이중 프레임 */
    .auc-gdeal-fly::before { content: ""; position: absolute; inset: 8px; border-radius: 6px;
      border: 1px solid rgba(255,255,255,.16); }
    /* 뒷면 중앙 마름모 문양 — '카드'라는 신호 */
    .auc-gdeal-fly::after { content: ""; position: absolute; left: 50%; top: 50%; width: 28px; height: 28px;
      margin: -14px 0 0 -14px; border: 1px solid rgba(255,255,255,.32); transform: rotate(45deg); }

    /* 착지 스냅 — 테이블에 꽂히는 느낌이라 원이 아니라 납작한 타원 */
    .auc-gcard-snap { position: absolute; top: 50%; left: 50%; width: 340px; height: 122px;
      margin: -61px 0 0 -170px; border-radius: 999px; border: 2px solid rgba(255,244,200,.8);
      opacity: 0; animation: aucGcSnap 4.3s ease-out forwards; }

    @keyframes aucGcFoil { 0% { background-position: 0% 50% } 100% { background-position: 300% 50% } }
    @keyframes aucGcLight {
      0%, 45% { transform: translate(-42%, -32%); opacity: 0; }
      56%     { opacity: 1; }
      86%     { transform: translate(42%, 32%); opacity: .85; }
      100%    { opacity: 0; }
    }
    /* 바깥: 위치·크기·페이드 (3D 평면화를 막기 위해 회전과 분리) */
    @keyframes aucGcDeal {
      0%   { transform: translate(calc(-50% + 640px), calc(-50% + 200px)) scale(.60); opacity: 0; filter: blur(9px); }
      24%  { opacity: 0; }
      31%  { opacity: 1; filter: blur(5px); }
      47%  { transform: translate(-50%, -50%) scale(1.03); opacity: 1; filter: blur(0); }
      52%  { transform: translate(-50%, -50%) scale(.985); }
      58%  { transform: translate(-50%, -50%) scale(1); }
      86%  { transform: translate(-50%, -50%) scale(1); opacity: 1; filter: blur(0); }
      100% { transform: translate(-50%, -54%) scale(1.1); opacity: 0; filter: blur(6px); }
    }
    /* 안쪽: 순수 3D 회전. 착지 뒤 살짝 흔들려 홀로 색이 한 번 더 돈다 */
    @keyframes aucGcFlat {
      0%       { transform: rotate(-535deg); }
      47%      { transform: rotate(0deg); }
      53%      { transform: rotate(2.6deg); }
      62%,100% { transform: rotate(0deg); }
    }
    @keyframes aucGcSnap {
      0%, 45%  { opacity: 0; transform: scale(.3); }
      48%      { opacity: 1; transform: scale(.62); }
      64%,100% { opacity: 0; transform: scale(2.7); }
    }
    @keyframes aucGcFly {
      /* ⚠️ 회전을 크게 주면 지나갈수록 카드가 "눕는" 것처럼 보인다 → 기울기만 살짝 */
      0%   { opacity: 0; transform: translate(calc(-50% + 600px), calc(-50% - 34px)) rotate(9deg) scale(1); }
      12%  { opacity: 1; }
      74%  { opacity: 1; filter: blur(0); }
      100% { opacity: 0; transform: translate(calc(-50% - 640px), calc(-50% + 46px)) rotate(-22deg) scale(.97); filter: blur(3px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .auc-gcard, .auc-gcard-holo { animation: none; }
    }

    /* ── 입찰 순간, 좌측 팀 레일에서 해당 팀이 번쩍인다 ──
       ⚠️ 행 자체의 background 에 애니메이션을 걸면 행이 이미 가진 transition-colors·기본 배경과
          충돌해 잔상이 남는다. 독립된 오버레이 한 겹으로 처리한다. */
    .auc-bidfx { position: absolute; inset: 0; pointer-events: none; overflow: hidden; z-index: 4; }
    /* 붉은 섬광 — 행 전체를 덮으면 글자가 묻히므로 왼쪽이 진하고 오른쪽으로 옅어지는 그라디언트 */
    .auc-bidfx::before {
      content: ""; position: absolute; inset: 0; opacity: 0;
      background: linear-gradient(90deg, rgba(233,30,63,.55) 0%, rgba(233,30,63,.16) 45%, transparent 80%);
      animation: aucBidTint 1s ease-out;
    }
    @keyframes aucBidTint {
      0%   { opacity: 1; }
      35%  { opacity: .45; }
      100% { opacity: 0; }
    }
    /* 왼쪽 가장자리에서 가로로 퍼지는 파동 */
    .auc-bidfx::after {
      content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
      background: linear-gradient(90deg, #e91e3f, rgba(233,30,63,.3));
      transform-origin: left center; animation: aucBidWave .9s ease-out;
    }
    @keyframes aucBidWave {
      0%   { opacity: 1; transform: scaleX(1); }
      55%  { opacity: .45; transform: scaleX(42); }
      100% { opacity: 0; transform: scaleX(75); }
    }
    /* 금액이 튀어오른다 */
    .auc-bidpop { animation: aucBidPop .55s cubic-bezier(.2,1.4,.4,1); }
    @keyframes aucBidPop {
      0%   { transform: scale(1); }
      28%  { transform: scale(1.28); }
      100% { transform: scale(1); }
    }
    @media (prefers-reduced-motion: reduce) {
      .auc-bidfx::before, .auc-bidfx::after, .auc-bidpop { animation: none; }
      .auc-bidfx { display: none; }
    }

    /* ── 주 행동 버튼 광택 ── 버튼 전체를 깜빡이는 animate-pulse 대신,
          표면을 한 줄기 빛이 천천히 지나가게 한다. 시선은 끌되 요란하지 않다. */
    .auc-btn-sheen { position: relative; overflow: hidden; }
    .auc-btn-sheen::after {
      content: ""; position: absolute; top: 0; bottom: 0; width: 45%;
      background: linear-gradient(100deg, transparent 0%, rgba(255,255,255,.32) 50%, transparent 100%);
      transform: skewX(-18deg);
      animation: aucBtnSheen 3.4s cubic-bezier(.4,0,.2,1) infinite;
      pointer-events: none;
    }
    @keyframes aucBtnSheen {
      0%       { left: -60%; }
      34%,100% { left: 130%; }
    }
    @media (prefers-reduced-motion: reduce) { .auc-btn-sheen::after { animation: none; opacity: 0; } }

    /* ── 경매장 공용 팝업 ── 방 안의 모든 모달이 같은 골격을 쓴다 */
    /* 모바일에서도 하단에 꽂지 않고 화면 중앙에 띄운다 */
    .auc-modal-back { position: fixed; inset: 0; z-index: 120; display: flex; align-items: center; justify-content: center; padding: 14px; background: rgba(0,0,0,.84); backdrop-filter: blur(4px); }
    @media (min-width: 640px) { .auc-modal-back { padding: 16px; } }
    .auc-modal {
      position: relative; width: 100%;
      background: linear-gradient(160deg, #141416 0%, #0e0e10 60%, #0a0a0b 100%);
      border: 1px solid rgba(255,255,255,.15);
      box-shadow: 0 30px 90px -20px #000;
    }
    /* 상단 포인트 라인 — 성격에 따라 색만 갈아끼운다 */
    .auc-modal-line { position: absolute; inset-inline: 0; top: 0; height: 2px; }

    @media (prefers-reduced-motion: reduce) { .auc-gold-text { animation: none; } }

    @media (prefers-reduced-motion: reduce) {
      .auc-stage-golden::before, .auc-stage-goldline { animation: none; }
      .auc-in { animation: none; opacity: 1; }
      .auc-ticket-live .auc-half, .auc-ticket-focus .auc-shine { animation: none; }
      .auc-ticket { transition: none; }
      /* 찢기 연출은 유지하되 짧게 */
      .auc-ticket-tear .auc-half-l, .auc-ticket-tear .auc-half-r { animation-duration: .3s; }
    }
  `}</style>
);
