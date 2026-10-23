"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
import { openLogin } from "../components/LoginPrompt";
import { itemTypeColor } from "@/lib/items";
import { rarityOf, rarityRank } from "@/lib/rarity";
import { CURRENCY_PIXEL } from "@/lib/currencyIcons";
import { playTone } from "@/lib/sfx";
import { preloadSfx, playSfx } from "@/lib/sfxFiles";

// 📌 「방구석 심야 괴담회」 추첨 창 — 레벨 대시보드 이벤트 패스 띠 바로 아래 괴담회 띠로 연다(app/level/page.js openGoedam). 화면 이동 없음.
//    약속 .claude/mockups/goedam/SPEC.md 「화면 · 창」. 서버는 app/api/goedam(GET 상태 · POST draw — lib/goedam.js). 남은 추첨권 · 상품 · 당첨은 서버가 센다 — 화면은 받은 대로만 그린다.
//    틀은 이벤트 패스 창(EventPassModal — 고치지 않고 결만 따름)과 같은 문법: fixed inset-0 z-[120] 오버레이(전역 ScrollLock) · 닫기 단추 포커스 · Esc · PC 가운데 창 · 폰 아래 시트(dvh).
//      위   제목 「방구석 심야 괴담회」 + 기간 알약(운영진 미리보기면 「비공개」)
//      가운데 스크린(어두운 영사막) — 평소 내 추첨권 큰 판(public/goedam/ticket.png) + ×N / 뽑으면 애니메이션 → 결과 카드
//      단추 큰 금색 「추첨권 1장 쓰기」(없으면 잠김 · 기간 전 「10. 30. 20:00 에 열립니다」 · 끝나면 「종료」 · 로그인 전 「로그인」)
//      아래 상품(희귀도 칩 · 이름 · 남은 수/전체) · 회차(날짜 · 시간 · 제목 · 완청 ✓ / 진행 중 / –) · 내 당첨(code 는 코드 + 복사)
//        PC 세 칸 나란히 · 폰 밑줄 탭 셋(칸 폭 고정 — 탭을 바꿔도 줄이 밀리지 않는다). 위 스크린 · 단추는 늘 보이고 아래 목록만 스크롤
//    📌 애니메이션(약 2.6초 · 스크린을 누르면 건너뜀 · 움직임 줄이기면 바로 결과):
//      ① 추첨권이 스크린 아래에서 올라옴 ② 꼬리표(ticket-stub.png)가 찢겨 살짝 돌며 떨어지고 몸통(ticket-main.png)은 가라앉음
//      ③ 필름 카운트다운 3 · 2 · 1 — 도트 원판(테 · 십자 · 도는 선 · 지나간 부채꼴, 칸마다 단색 rect) ④ 결과 카드(희귀도 색 테 · 이름 · 양 · code 는 코드 + 「복사」 · none 은 유령 펭귄 + 「다음 기회에」)
//      결과가 오기 전엔 ③ 의 「1」 에서 멈춰 기다리고, 오류면 애니메이션을 접고 토스트. 효과음: 시작 promo-rise → 결과 promo-fanfare(희귀 이상) · promo-boom(그 아래) · promo-click(꽝)
//    📌 도트 결 — 판 · 칸 · 단추 = 짙은 테 3px + 안쪽 단(위·왼쪽 밝게 / 아래·오른쪽 어둡게) + 계단 모서리(clip-path). 단색만, 그라데이션 · 흐린 빛 금지. 안내 문장 없이 라벨 · 기호만

const API = "/api/goedam";
const ART = "/goedam"; // public/goedam — ticket.png(464 × 224) · ticket-main.png(왼쪽 0~331px) · ticket-stub.png(332px~)
// 📌 추첨권 큰 판 칸 수 — 그림 1칸 = 4px(116 × 56칸). 절취선은 83칸(332px) 경계. 화면에선 --u(칸 하나 px — PC 4 · 폰 3 · 좁은 폰 2)로 정수 배율만
const TK = { w: 116, h: 56, cut: 83 };
// 📌 애니메이션 시간표(ms) — ① 0~520 올라옴 · ② 560 찢김(꼬리표 .62s · 몸통 .42s 뒤 가라앉음) · ③ 1220 부터 숫자 하나에 DIGIT · ④ 1220 + 3 × DIGIT 에 결과(등장 .26s) ≈ 2.6초
const T_TEAR = 560;
const T_COUNT = 1220;
const DIGIT = 380;
// 소리 크기 — 승급 화면(PromoOverlay VOL)과 같은 값을 곱한다(운영자 "너무 크다" 뒤 맞춘 크기)
const VOL = 0.16;
const SFX = ["promo-rise", "promo-boom", "promo-fanfare", "promo-click"];
// 📌 폰 판 기준 — 이벤트 패스 창(NARROW_MQ)과 같은 sm 경계
const NARROW_MQ = "(max-width: 639.98px)";
const subNarrow = (cb) => {
  const mq = window.matchMedia(NARROW_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);

// 📌 색 — 짙은 밤 보라 단색. 스크린은 그보다 더 짙은 영사막
const GD = { panel: "#120c26", ink: "#07051a", text: "#f1ecff", sub: "#8f88c8", mute: "#6f68a0", screen: "#07050f", cyan: "#9ff8ff", gold: "#ffe08a" };
// 계단 모서리 — 3px 한 단 · 6px 두 단 · 위만(폰 시트). 이벤트 패스 창과 같은 값
const NOTCH = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,3px calc(100% - 3px),0 calc(100% - 3px),0 3px,3px 3px)";
const NOTCH6 = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px,6px 3px)";
const NOTCH_TOP = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% 100%,0 100%,0 3px,3px 3px)";
const NOTCH6_TOP = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% 100%,0 100%,0 6px,3px 6px,3px 3px,6px 3px)";

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
// ── 시각 — 서버가 ISO 글자 · ms 숫자 어느 쪽으로 줘도 같게. 표기는 KST ──
const KST = 9 * 3600000;
const msOf = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v || "");
  return Number.isFinite(t) ? t : NaN;
};
// 끝은 들어가지 않으므로(11. 9. 00:00) 1ms 빼서 마지막 날로
const kstOf = (v, endExclusive = false) => {
  const t = msOf(v);
  return Number.isFinite(t) ? new Date(t - (endExclusive ? 1 : 0) + KST) : null;
};
const dayOf = (v, endExclusive = false) => {
  const d = kstOf(v, endExclusive);
  return d ? `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.` : "";
};
const hmOf = (v) => {
  const d = kstOf(v);
  return d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : "";
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wdOf = (v) => {
  const d = kstOf(v);
  return d ? WD[d.getUTCDay()] : "";
};
// 칩 단 색 — 희귀도 색을 흰색 · 검정 쪽으로(위 밝은 단 · 아래 어두운 단). 이벤트 패스 칩과 같은 셈
const mixHex = (hex, to, t) => {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || "")) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex), b = p(to);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};
// 당첨 알림 · 결과 글자 — 꽝은 「다음 기회에」, 나머지는 상품 이름
const nameOf = (r) => (r?.kind === "none" ? "다음 기회에" : String(r?.name || "").trim() || "상품");
const winText = (r) => (r?.kind === "none" ? "다음 기회에" : `${nameOf(r)} 당첨`);
// 결과 카드 둘째 줄 — XP · 빙옥은 양, 아이템은 기간. 이름에 이미 그 숫자가 있으면 빼서 같은 글자를 두 번 찍지 않는다
const amountOf = (r) => {
  if (!r) return "";
  const n = Math.floor(Number(r.amount) || 0);
  const name = String(r.name || "");
  if ((r.kind === "xp" || r.kind === "point") && n > 0) {
    if (name.includes(fmt(n)) || name.includes(String(n))) return "";
    return `+${fmt(n)} ${r.kind === "xp" ? "XP" : "빙옥"}`;
  }
  const days = Math.floor(Number(r.days) || 0);
  if (r.kind === "item" && days > 0) return `${fmt(days)}일`;
  return "";
};

// 📌 코드 복사 — 클립보드 API, 막혀 있으면(옛 브라우저 · http) 숨은 글 상자로 한 번 더
const copyText = async (t) => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
};

// ── 효과음 — 이벤트 패스 창과 같은 playTone 어휘(거절 · 틱) + 찢김 · 카운트다운 틱. 큰 소리는 public/sfx 파일(playSfx) ──
const sfxNo = () => playTone(330, 0.12, "sine", 0.03);
const sfxTick = () => playTone(660, 0.05, "sine", 0.025);
const sfxRip = () => {
  playTone(220, 0.07, "sawtooth", 0.018);
  setTimeout(() => playTone(165, 0.09, "sawtooth", 0.016), 60);
};
const sfxCount = (digit) => playTone(digit === 1 ? 1046.5 : 784, 0.06, "triangle", 0.03);

// ── 필름 카운트다운 원판(49 × 49칸 — 가운데 칸 24) — 바탕 원판 · 지나간 부채꼴 · 십자 · 안쪽 원 · 바깥 테(2칸) · 도는 선 · 숫자(5 × 7 글꼴을 3배). ──
//    도는 선 · 부채꼴은 12걸음(30°)마다 한 벌씩 미리 만들어 두고 CSS 로 한 걸음씩만 켠다(돌리기 변형 없이 — 칸이 번지지 않게). 같은 색 가로 줄은 rect 하나
const CD_N = 49;
const CD_M = 24;
const CD_RO = 24; // 바깥 테 반지름(칸)
const CD_RI = 19; // 안쪽 원 반지름(칸)
const CD_STEPS = 12;
const cdD = (x, y) => Math.hypot(x - CD_M, y - CD_M);
// 12시에서 시계 방향 각도(0 ~ 2π)
const cdA = (x, y) => {
  const a = Math.atan2(x - CD_M, CD_M - y);
  return a < 0 ? a + Math.PI * 2 : a;
};
const cdRuns = (hit) => {
  const out = [];
  for (let y = 0; y < CD_N; y++) {
    for (let x = 0; x < CD_N; ) {
      if (!hit(x, y)) { x++; continue; }
      let e = x;
      while (e + 1 < CD_N && hit(e + 1, y)) e++;
      out.push([x, y, e - x + 1, 1]);
      x = e + 1;
    }
  }
  return out;
};
const CD_DIGITS = {
  3: ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  2: [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  1: ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
};
// 숫자 rect — 글꼴 1칸 = 원판 3칸, 가운데 정렬(15 × 21칸 → 17~31 · 14~34). dx · dy 는 그림자 밀기
const digitRuns = (d, dx = 0, dy = 0) =>
  (CD_DIGITS[d] || []).flatMap((row, r) => {
    const out = [];
    for (let c = 0; c < row.length; ) {
      if (row[c] !== "#") { c++; continue; }
      let e = c;
      while (e + 1 < row.length && row[e + 1] === "#") e++;
      out.push([CD_M - 7 + c * 3 + dx, CD_M - 10 + r * 3 + dy, (e - c + 1) * 3, 3]);
      c = e + 1;
    }
    return out;
  });
const CD = (() => {
  const inDisc = (x, y) => cdD(x, y) < CD_RI - 0.5;
  const steps = Array.from({ length: CD_STEPS }, (_, k) => {
    const th = ((k + 1) / CD_STEPS) * Math.PI * 2;
    const sx = Math.sin(th), sy = -Math.cos(th);
    return {
      fan: cdRuns((x, y) => inDisc(x, y) && cdA(x, y) < th),
      line: cdRuns((x, y) => {
        const dx = x - CD_M, dy = y - CD_M;
        return dx * sx + dy * sy >= 0 && Math.abs(dx * sy - dy * sx) <= 0.55 && inDisc(x, y);
      }),
    };
  });
  return {
    base: cdRuns((x, y) => cdD(x, y) < CD_RO - 1.5),
    ring: cdRuns((x, y) => { const d = cdD(x, y); return d < CD_RO + 0.5 && d >= CD_RO - 1.5; }),
    inner: cdRuns((x, y) => { const d = cdD(x, y); return d < CD_RI + 0.5 && d >= CD_RI - 0.5; }),
    cross: cdRuns((x, y) => (x === CD_M || y === CD_M) && cdD(x, y) < CD_RO - 1.5),
    steps,
  };
})();
const CD_COL = { base: "#150f30", fan: "#2c2468", cross: "#3a3186", inner: "#5d5790", ring: "#d8d2f5", line: "#f1ecff", digit: GD.gold, shadow: GD.ink };
const Rects = ({ runs, fill }) => runs.map(([x, y, w, h]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} fill={fill} />);

// ── 창 CSS — 단색 · 도트 테만(그라데이션 · 흐린 빛 금지). 움직임은 창 열림 · 추첨권 떠 있기 · 뽑기 애니메이션 · 결과 카드 등장 ──
//    📌 스크린 치수는 CSS 변수로 — --u 추첨권 칸 하나 px(정수만) · --sh 스크린 높이(짝수 — 가운데 자리가 반 픽셀에 걸리지 않게)
const GD_CSS = `
@keyframes gdIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes gdFloat { 0%, 100% { transform: translateY(0); } 25%, 75% { transform: translateY(calc(var(--u) * -1)); } 50% { transform: translateY(calc(var(--u) * -2)); } }
@keyframes gdRise { from { transform: translateY(var(--sh)); } to { transform: none; } }
@keyframes gdTear { 0% { transform: none; } 22% { transform: translateX(calc(var(--u) * 2)) rotate(5deg); } 100% { transform: translate(calc(var(--u) * 10), var(--sh)) rotate(28deg); } }
@keyframes gdJolt { 0%, 100% { transform: none; } 50% { transform: translateX(calc(var(--u) * -1)); } }
@keyframes gdSink { to { transform: translateY(var(--sh)); } }
@keyframes gdStep { 0% { opacity: 1; } 8.333% { opacity: 0; } 100% { opacity: 0; } }
@keyframes gdDigit { 0% { transform: scale(1.25); } 100% { transform: none; } }
@keyframes gdPop { 0% { opacity: 0; transform: scale(.72); } 70% { opacity: 1; transform: scale(1.04); } 100% { opacity: 1; transform: none; } }
.gd-win { position: relative; width: 100%; height: 88vh; height: 88dvh; padding: 3px 3px 0; background: ${GD.ink}; clip-path: ${NOTCH6_TOP}; animation: gdIn .32s cubic-bezier(0.16,1,0.3,1); color: ${GD.text}; }
.gd-wi { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: ${GD.panel}; clip-path: ${NOTCH_TOP}; }
.gd-wi::after { content: ""; position: absolute; inset: 0; z-index: 40; pointer-events: none; box-shadow: inset 3px 3px 0 #2c2468, inset -3px 0 0 #0b0822; }
@media (min-width: 640px) {
  .gd-win { max-width: 960px; height: auto; padding: 3px; clip-path: ${NOTCH6}; }
  .gd-wi { height: auto; max-height: calc(min(780px, 94vh) - 6px); clip-path: ${NOTCH}; }
  .gd-wi::after { box-shadow: inset 3px 3px 0 #2c2468, inset -3px -3px 0 #0b0822; }
}
.gd-wi *, .gd-wi *::before, .gd-wi *::after { box-sizing: border-box; }
.gd-px { image-rendering: pixelated; }
.gd-pp { border: 3px solid ${GD.ink}; background: var(--bg, #17123a); box-shadow: inset 3px 3px 0 var(--hi, #2c2468), inset -3px -3px 0 var(--sh, #0d0a26); clip-path: ${NOTCH}; }
.gd-grab { position: absolute; z-index: 20; left: 50%; top: 9px; width: 36px; height: 6px; margin-left: -18px; background: #3a3186; }
.gd-x { position: absolute; z-index: 30; right: 12px; top: 14px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; --bg: #221a52; --hi: #3a3186; --sh: #120e30; outline: none; cursor: pointer; }
.gd-x:hover { --bg: #2c2468; }
.gd-x:focus-visible { border-color: ${GD.cyan}; }
@media (min-width: 640px) { .gd-x { right: 18px; top: 18px; width: 36px; height: 36px; } }
/* 머리 — 제목 · 기간 알약(줄 높이 고정 — 알약이 늦게 와도 아래가 밀리지 않게) */
.gd-hd { flex: none; position: relative; display: flex; align-items: center; flex-wrap: wrap; min-height: 75px; padding: 27px 56px 12px 18px; }
.gd-hd h2 { margin: 0 10px 0 0; font-size: 19px; font-weight: 900; line-height: 30px; letter-spacing: -.01em; color: #f3efff; text-shadow: 0 3px 0 #0b0618; white-space: nowrap; }
.gd-tags { display: flex; align-items: center; }
.gd-tags > * + * { margin-left: 6px; }
@media (min-width: 640px) { .gd-hd { min-height: 78px; padding: 21px 72px 15px 24px; } .gd-hd h2 { margin-right: 14px; font-size: 26px; line-height: 36px; } }
.gd-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; font-size: 12px; font-weight: 700; color: ${GD.text}; white-space: nowrap; font-variant-numeric: tabular-nums; --bg: #0f0b28; --hi: #241d58; --sh: ${GD.ink}; }
.gd-off { padding: 0 8px; font-size: 11px; font-weight: 900; color: rgba(241,236,255,.6); --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
/* 📌 스크린 — 폰은 시트 폭 그대로(양옆 틀은 시트 테가 맡는다 — 360 폭에서도 추첨권 3배 348px 가 들어간다), PC 는 양옆 여백 + 제 테 */
.gd-scr { flex: none; position: relative; height: var(--sh); overflow: hidden; background: ${GD.screen}; border-top: 3px solid ${GD.ink}; border-bottom: 3px solid ${GD.ink}; box-shadow: inset 0 3px 0 #1b1440, inset 0 -3px 0 #1b1440; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; --u: 3px; --sh: 204px; }
.gd-scr.tap { cursor: pointer; }
@media (max-width: 359.98px), (max-width: 639.98px) and (max-height: 600px) { .gd-scr { --u: 2px; --sh: 140px; } }
@media (min-width: 640px) {
  .gd-scr { margin: 0 24px; border: 3px solid ${GD.ink}; box-shadow: inset 0 0 0 3px #1b1440; clip-path: ${NOTCH}; --u: 4px; --sh: 300px; }
}
@media (min-width: 640px) and (max-height: 700px) { .gd-scr { --u: 3px; --sh: 230px; } }
.gd-tk, .gd-tka { position: absolute; left: 50%; top: 50%; width: calc(var(--u) * ${TK.w}); height: calc(var(--u) * ${TK.h}); margin: calc(var(--u) * ${-TK.h / 2}) 0 0 calc(var(--u) * ${-TK.w / 2}); }
.gd-tk img, .gd-tka img { display: block; height: 100%; }
.gd-tk img { width: 100%; }
.gd-tk.live img { animation: gdFloat 3s steps(1, end) infinite; }
.gd-tk.none img { opacity: .35; }
.gd-xn { position: absolute; right: calc(var(--u) * 3); bottom: calc(var(--u) * -3); display: inline-flex; align-items: center; height: 28px; padding: 0 10px 1px; font-size: 16px; font-weight: 900; line-height: 1; color: ${GD.gold}; background: ${GD.ink}; clip-path: ${NOTCH}; font-variant-numeric: tabular-nums; }
.gd-tk.none .gd-xn { color: ${GD.mute}; }
@media (min-width: 640px) { .gd-xn { height: 34px; padding: 0 12px 1px; font-size: 20px; } }
.gd-tm, .gd-ts { position: absolute; top: 0; height: 100%; }
.gd-tm { left: 0; width: calc(var(--u) * ${TK.cut}); }
.gd-ts { left: calc(var(--u) * ${TK.cut}); width: calc(var(--u) * ${TK.w - TK.cut}); }
.gd-tm img, .gd-ts img { width: 100%; }
.gd-tka.rise { animation: gdRise .52s cubic-bezier(.2,.9,.3,1) both; }
.gd-tka.tear .gd-ts { transform-origin: 0 100%; animation: gdTear .62s cubic-bezier(.45,0,.85,.55) forwards; }
.gd-tka.tear .gd-tm { animation: gdJolt .16s steps(2, end), gdSink .24s cubic-bezier(.5,0,.9,.5) .42s forwards; }
.gd-cd { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.gd-cd svg { display: block; width: calc(var(--u) * ${CD_N}); height: calc(var(--u) * ${CD_N}); }
.gd-cs { opacity: 0; animation: gdStep ${DIGIT}ms steps(1, end) infinite; }
.gd-dg { transform-origin: 50% 50%; transform-box: view-box; animation: gdDigit .14s steps(2, end); }
.gd-msg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: rgba(241,236,255,.55); }
.gd-msg .gd-gb { margin-top: 12px; }
/* 📌 결과 카드 — 짙은 테 3px 안에 희귀도 색 테 3px(--rc) · 안쪽 단. 그림 | 칩 · 이름 · 양(또는 코드 + 복사) */
.gd-rs { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 12px; }
.gd-card { position: relative; display: flex; align-items: center; width: 100%; max-width: 440px; min-height: 0; padding: 15px 18px; border: 3px solid ${GD.ink}; background: #17123a; box-shadow: inset 0 0 0 3px var(--rc), inset 6px 6px 0 #2c2468, inset -6px -6px 0 #0d0a26; clip-path: ${NOTCH}; animation: gdPop .26s cubic-bezier(.2,.9,.3,1) both; cursor: default; }
.gd-ci { flex: none; display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; line-height: 0; color: #fff; }
.gd-ct { flex: 1 1 0%; min-width: 0; margin-left: 15px; }
.gd-cn { margin: 0; font-size: 17px; font-weight: 900; line-height: 1.3; color: #fff; overflow-wrap: anywhere; }
.gd-ca { margin: 3px 0 0; font-size: 13px; font-weight: 800; color: ${GD.gold}; font-variant-numeric: tabular-nums; }
.gd-ct .gd-chip { margin-bottom: 6px; }
.gd-card.none .gd-cn { color: #d8d2f5; }
@media (min-width: 640px) { .gd-card { padding: 21px 24px; } .gd-ci { width: 96px; height: 96px; } .gd-ct { margin-left: 21px; } .gd-cn { font-size: 21px; } .gd-ca { font-size: 14px; } }
@media (max-width: 359.98px), (max-width: 639.98px) and (max-height: 600px) { .gd-card { padding: 9px 12px; } .gd-ci { width: 48px; height: 48px; } .gd-cn { font-size: 15px; } .gd-ct .gd-chip { display: none; } }
/* 코드 줄 — 고정폭 글자 칸 + 「복사」 */
.gd-code { display: flex; align-items: center; margin-top: 6px; min-width: 0; }
.gd-code code { flex: 1 1 auto; min-width: 0; height: 30px; padding: 0 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; font-weight: 700; line-height: 30px; color: #fff; background: ${GD.ink}; clip-path: ${NOTCH}; user-select: all; -webkit-user-select: all; }
.gd-code .gd-sb { flex: none; margin-left: 6px; }
/* 금색 도트 단추 — 이벤트 패스 받기 단추와 같은 결 */
.gd-gb { position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: #e2b04a; color: #2a1606; font-weight: 900; white-space: nowrap; border: 3px solid ${GD.ink}; box-shadow: inset 0 3px 0 #ffe08a, inset 0 -4px 0 #9c6a22; clip-path: ${NOTCH}; outline: none; cursor: pointer; }
.gd-gb:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 2px 0 #ffe08a, inset 0 -2px 0 #9c6a22; }
.gd-gb:focus-visible { border-color: #fff; }
.gd-gb:disabled { cursor: default; }
.gd-gb.md { height: 34px; padding: 0 16px 2px; font-size: 12.5px; }
.gd-act { flex: none; display: flex; justify-content: center; padding: 12px 15px; }
.gd-go { width: 100%; height: 56px; padding: 0 20px 3px; font-size: 17px; }
.gd-go.off { background: #2a2458; color: rgba(241,236,255,.45); box-shadow: inset 0 3px 0 #3a3186, inset 0 -4px 0 #17133a; }
.gd-go .gd-lk { display: block; margin-right: 9px; line-height: 0; }
.gd-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
@media (min-width: 640px) { .gd-act { padding: 15px 24px 12px; } .gd-go { width: 400px; } }
/* 보라 도트 단추(복사) */
.gd-sb { display: inline-flex; align-items: center; justify-content: center; min-width: 52px; height: 30px; padding: 0 10px 2px; font-size: 12px; font-weight: 900; color: ${GD.text}; white-space: nowrap; outline: none; cursor: pointer; --bg: #2c2468; --hi: #4a3fa0; --sh: #17133a; }
.gd-sb:hover { --bg: #3a3186; }
.gd-sb:active { transform: translateY(2px); }
.gd-sb:focus-visible { border-color: ${GD.cyan}; }
/* 희귀도 칩 — 등급 색 단색 판 + 짙은 글자(두 글자라 폭이 같다) */
.gd-chip { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 42px; height: 22px; padding: 0 6px; font-size: 11px; font-weight: 900; line-height: 16px; color: ${GD.ink}; white-space: nowrap; }
/* 📌 폰 밑줄 탭 — 세 칸 같은 폭 · 같은 굵기(켜짐은 색 · 밑줄만) — 탭을 바꿔도 글자 · 줄이 움직이지 않는다 */
.gd-tabs { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 15px; box-shadow: inset 0 -3px 0 #1d1745; }
.gd-tab { position: relative; height: 42px; padding: 0; background: none; border: 0; font-size: 13px; font-weight: 800; line-height: 18px; color: ${GD.sub}; outline: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.gd-tab.on { color: #fff; }
.gd-tab.on::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3px; background: ${GD.gold}; }
.gd-tab:focus-visible { color: ${GD.cyan}; }
/* 아래 목록 — 이 칸만 스크롤 */
.gd-body { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; padding: 3px 15px calc(18px + env(safe-area-inset-bottom)); }
.gd-body::-webkit-scrollbar { display: none; }
@media (min-width: 640px) {
  .gd-body { padding: 6px 24px 24px; }
  .gd-cols { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); grid-gap: 12px; align-items: start; }
}
.gd-sec { min-width: 0; padding: 12px 15px 6px; --bg: #120e2e; --hi: #241d58; --sh: #0b0822; }
.gd-st { margin: 0 0 3px; font-size: 12px; font-weight: 900; letter-spacing: .24em; color: #fff; }
.gd-row { display: flex; align-items: center; min-height: 48px; padding: 6px 0; }
.gd-row + .gd-row { box-shadow: inset 0 3px 0 #1d1745; }
.gd-row.out, .gd-row.dim { opacity: .45; }
.gd-nm { display: block; min-width: 0; font-size: 13.5px; font-weight: 700; color: ${GD.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gd-sm { display: flex; align-items: center; margin-top: 2px; font-size: 11px; font-weight: 700; color: ${GD.sub}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gd-sm > * + * { margin-left: 4px; }
.gd-mi { display: flex; line-height: 0; } /* 작은 추첨권 도트 — ItemIcon 이 제 여백(가운데 맞춤)을 인라인으로 쓰므로 한 겹 감싼다 */
.gd-tx { flex: 1 1 0%; min-width: 0; }
.gd-pz .gd-nm { flex: 1 1 0%; margin-left: 9px; }
.gd-cnt { flex: none; margin-left: 9px; font-size: 12.5px; font-weight: 800; color: #d8d2f5; font-variant-numeric: tabular-nums; }
.gd-dt { flex: none; width: 52px; margin-right: 9px; font-variant-numeric: tabular-nums; }
.gd-dt b { display: block; font-size: 13px; font-weight: 900; line-height: 17px; color: #fff; }
.gd-dt i { display: block; font-style: normal; font-size: 11px; font-weight: 700; line-height: 15px; color: ${GD.sub}; }
.gd-stt { flex: none; display: flex; align-items: center; justify-content: center; width: 60px; margin-left: 6px; font-size: 13px; font-weight: 900; color: ${GD.mute}; line-height: 0; }
.gd-live { height: 22px; padding: 0 6px; font-size: 11px; font-weight: 900; line-height: 16px; color: #2a1006; --bg: #ff8a3d; --hi: #ffc08a; --sh: #b4521b; }
.gd-hs { flex-wrap: wrap; }
.gd-hs .gd-tx { display: flex; align-items: center; flex: 1 0 100%; } /* 코드 줄은 그 아래 한 줄 통째로 */
.gd-hs .gd-chip { margin-right: 9px; }
.gd-hs .gd-nm { flex: 1 1 0%; }
.gd-hs .gd-at { flex: none; margin-left: 9px; font-size: 11px; font-weight: 700; color: ${GD.sub}; font-variant-numeric: tabular-nums; }
.gd-hs .gd-code { flex: 1 0 100%; margin: 6px 0 3px; }
.gd-none { margin: 0; padding: 15px 0 12px; font-size: 12.5px; font-weight: 700; color: ${GD.mute}; text-align: center; }
@media (prefers-reduced-motion: reduce) { .gd-win, .gd-tk img, .gd-tka, .gd-tka *, .gd-cs, .gd-dg, .gd-card { animation: none !important; } .gd-cs { opacity: 0; } }
`;

// 도트 그림(rows · pal) — 같은 색 가로 줄을 rect 하나로(crispEdges · 정수 배율 u). 이벤트 패스 창 Sprite 와 같은 그리기
const Sprite = ({ rows, pal, u = 3, size }) => {
  const W = rows[0].length, H = rows.length;
  const rects = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < W; ) {
      const ch = row[x];
      if (!pal[ch]) { x++; continue; }
      let e = x;
      while (e + 1 < W && row[e + 1] === ch) e++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={e - x + 1} height="1" fill={pal[ch]} />);
      x = e + 1;
    }
  });
  return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={size || W * u} height={size || H * u} shapeRendering="crispEdges" className="shrink-0">{rects}</svg>;
};
// 칸 장식 도트 — 이벤트 패스 창 LOCK · CHECK(둥근 도트 배지 — 가는 선 체크는 "밤티"로 반려) · XMARK 와 같은 그림
const LOCK = { rows: [".ooo.", "o...o", "ooooo", "oyyyo", "oyoyo", "ooooo"], pal: { o: GD.ink, y: GD.sub } };
const CHECK = {
  rows: ["..ooooo..", ".oHHHCCo.", "oHHCCCWCo", "oHCCCWWSo", "oCWCWWCSo", "oCWWWCCSo", "oCCWCCSSo", ".oCSSSSo.", "..ooooo.."],
  pal: { o: GD.ink, H: "#b4ecf9", C: "#72c3e6", S: "#3f86c4", W: "#ffffff" },
};
const XMARK = { rows: ["xx....xx", "xxx..xxx", ".xxxxxx.", "..xxxx..", "..xxxx..", ".xxxxxx.", "xxx..xxx", "xx....xx"], pal: { x: GD.text } };

// 희귀도 칩 — lib/rarity 글자 · 색(안 고른 것은 일반)
const RarityChip = ({ v }) => {
  const r = rarityOf(v);
  return (
    <span className="gd-chip gd-pp" style={{ "--bg": r.c, "--hi": mixHex(r.c, "#ffffff", 0.32), "--sh": mixHex(r.c, "#000000", 0.4) }}>
      {r.l}
    </span>
  );
};
// 상품 그림 — XP 번개 도트 · 빙옥 구슬 도트 · 아이템 유형 기본 모양 · 역할 방패 · 코드는 선물 상자 도트(lib/itemArt "starter-pack") · 꽝은 유령 펭귄("ghost-penguin")
const PrizeIcon = ({ kind, size }) => {
  if (kind === "xp") return <ItemIcon icon="art:xp-bolt" size={size} />;
  if (kind === "point") return <Sprite rows={CURRENCY_PIXEL.point.rows} pal={CURRENCY_PIXEL.point.pal} size={size} />;
  if (kind === "item") return <ItemIcon type="item" size={size} color={itemTypeColor("item")} />;
  if (kind === "none") return <ItemIcon icon="art:ghost-penguin" size={size} />;
  if (kind === "code") return <ItemIcon icon="art:starter-pack" size={size} />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={Math.round(size * 0.85)} height={Math.round(size * 0.85)} className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={ICON_PATHS.shieldCheck} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ③ 필름 카운트다운 — 숫자가 바뀔 때마다 새로 그려(key) 도는 선이 12시에서 다시 시작한다. 「1」 에서 결과를 기다리면 선은 계속 돈다
const Countdown = ({ digit }) => (
  <div className="gd-cd" aria-hidden>
    <svg viewBox={`0 0 ${CD_N} ${CD_N}`} shapeRendering="crispEdges">
      <Rects runs={CD.base} fill={CD_COL.base} />
      {CD.steps.map((s, k) => (
        <g key={`f${k}`} className="gd-cs" style={{ animationDelay: `${Math.round((k * DIGIT) / CD_STEPS)}ms` }}>
          <Rects runs={s.fan} fill={CD_COL.fan} />
        </g>
      ))}
      <Rects runs={CD.cross} fill={CD_COL.cross} />
      <Rects runs={CD.inner} fill={CD_COL.inner} />
      <Rects runs={CD.ring} fill={CD_COL.ring} />
      {CD.steps.map((s, k) => (
        <g key={`l${k}`} className="gd-cs" style={{ animationDelay: `${Math.round((k * DIGIT) / CD_STEPS)}ms` }}>
          <Rects runs={s.line} fill={CD_COL.line} />
        </g>
      ))}
      <g className="gd-dg">
        <Rects runs={digitRuns(digit, 1, 1)} fill={CD_COL.shadow} />
        <Rects runs={digitRuns(digit)} fill={CD_COL.digit} />
      </g>
    </svg>
  </div>
);

// 상태 읽기 — 실패면 null
const fetchState = async () => {
  try {
    const res = await fetch(API, { cache: "no-store" });
    const j = await res.json();
    return j?.success && j.data ? j.data : null;
  } catch {
    return null;
  }
};

// pushToast(msg, accent) — 레벨 페이지 토스트. onDrawn — 뽑은 뒤 페이지 잔액 · XP 를 다시 읽는다(loadMe). onCount — 띠 배지(내 추첨권 수)
export default function GoedamModal({ open, onClose, pushToast, onDrawn, onCount }) {
  const narrow = useNarrow();
  const { data: session, status: authStatus } = useSession();
  const signedIn = !!session?.user;
  const [data, setData] = useState(null); // 마지막으로 받은 상태 — 다시 열면 바로 그리고 뒤에서 새로 읽는다
  const [status, setStatus] = useState("idle"); // idle · loading · ok · error
  const [nowMs, setNowMs] = useState(0); // 회차 「진행 중」 판단 — 읽을 때 · 30초마다
  const [tab, setTab] = useState("prizes"); // 폰 탭 — prizes · screenings · history
  // 📌 애니메이션 — null(평소) | { run, step: "rise" | "tear" | "count" | "wait" | "result", digit, result }. wait = 움직임 줄이기(결과만 기다림)
  const [anim, setAnim] = useState(null);
  const runRef = useRef(0); // 뽑기마다 +1 — 닫기 · 다음 뽑기가 앞 뽑기의 늦은 응답 · 타이머를 무시하게
  const drawingRef = useRef(false);
  const resultRef = useRef(null); // 도착했지만 아직 안 보인 결과
  const leftRef = useRef(null); // 그 결과의 남은 추첨권 수
  const endRef = useRef(false); // 시간표(카운트다운 「1」)가 끝났는지
  const timersRef = useRef([]);
  const sndRef = useRef([]); // 재생 중인 소리 끄기 함수
  const closeRef = useRef(null);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);
  const stopSnd = useCallback(() => {
    sndRef.current.forEach((c) => { try { c(); } catch {} });
    sndRef.current = [];
  }, []);
  useEffect(() => () => {
    clearTimers();
    stopSnd();
  }, [clearTimers, stopSnd]);

  // 읽은 상태 반영 — 실패면 이미 그린 상태는 그대로 둔다(뒤에서 새로 읽기만 실패)
  const apply = useCallback((d) => {
    setNowMs(Date.now());
    if (d) {
      setData(d);
      setStatus("ok");
    } else setStatus((s) => (s === "ok" ? "ok" : "error"));
  }, []);
  const load = useCallback(() => fetchState().then(apply), [apply]);
  // 📌 내 추첨권 수를 띠 배지(app/level/page.js)에 알린다 — 열 때 · 뽑은 뒤 · 다시 읽을 때마다(쓰고 닫으면 바로 줄어든다)
  useEffect(() => {
    if (data && onCount) onCount(Math.max(0, Math.floor(Number(data.tickets) || 0)));
  }, [data, onCount]);

  // 열 때마다 새로 읽는다 · 소리 파일은 미리 불러 둔다(첫 뽑기에 늦지 않게)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchState().then((d) => { if (alive) apply(d); });
    preloadSfx(SFX);
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, apply]);

  // ④ 결과 보이기 — 시간표가 끝났고(또는 건너뜀) 결과가 와 있을 때만. 소리 · 알림 · 잔액 · 목록 새로 읽기
  const finish = useCallback((run) => {
    if (run !== runRef.current || !endRef.current || !resultRef.current) return;
    const r = resultRef.current;
    const left = leftRef.current;
    resultRef.current = null;
    clearTimers();
    stopSnd();
    drawingRef.current = false;
    setAnim({ run, step: "result", result: r });
    if (left != null) setData((d) => (d ? { ...d, tickets: left } : d));
    const none = r.kind === "none";
    const high = !none && rarityRank(r.rarity) >= 2; // 희귀 이상
    sndRef.current.push(playSfx(none ? "promo-click" : high ? "promo-fanfare" : "promo-boom", { vol: (none ? 0.8 : high ? 0.75 : 0.9) * VOL }));
    pushToast?.(winText(r), !none);
    onDrawn?.();
    load();
  }, [clearTimers, stopSnd, pushToast, onDrawn, load]);

  // 📌 추첨권 1장 쓰기 — 누르는 즉시 서버에 묻고(POST) 그동안 ①~③ 을 돌린다. 시간표는 처음에 한 번에 건다(run 이 바뀌면 다 무시)
  const draw = useCallback(async () => {
    if (drawingRef.current) return;
    drawingRef.current = true;
    clearTimers();
    stopSnd();
    resultRef.current = null;
    leftRef.current = null;
    endRef.current = false;
    const run = ++runRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const later = (ms, fn) => timersRef.current.push(setTimeout(() => { if (run === runRef.current) fn(); }, ms));
    const to = (patch) => setAnim((a) => (a && a.run === run ? { ...a, ...patch } : a));
    if (reduce) {
      endRef.current = true;
      setAnim({ run, step: "wait" });
    } else {
      setAnim({ run, step: "rise" });
      sndRef.current.push(playSfx("promo-rise", { vol: 0.7 * VOL }));
      later(T_TEAR, () => { to({ step: "tear" }); sfxRip(); });
      [3, 2, 1].forEach((digit, i) => later(T_COUNT + i * DIGIT, () => { to({ step: "count", digit }); sfxCount(digit); }));
      later(T_COUNT + 3 * DIGIT, () => { endRef.current = true; finish(run); });
    }
    let res = null;
    try {
      const r = await fetch(`${API}/draw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      res = await r.json().catch(() => null);
    } catch {
      res = null;
    }
    const result = res?.success && res.data?.result ? res.data.result : null;
    const left = res?.success && res.data && Number.isFinite(Number(res.data.tickets)) ? Math.max(0, Math.floor(Number(res.data.tickets))) : null;
    // 📌 뽑는 중에 창을 닫았으면(run 이 바뀜) 결과는 알림으로만 — 다음에 열면 내 당첨에 있다
    if (run !== runRef.current) {
      if (result) {
        pushToast?.(winText(result), result.kind !== "none");
        if (left != null) onCount?.(left);
        onDrawn?.();
      }
      return;
    }
    if (result) {
      resultRef.current = result;
      leftRef.current = left;
      finish(run);
      return;
    }
    // 실패 — 애니메이션을 접고 서버 글(추첨권이 없습니다 · 추첨 기간이 아닙니다 · 남은 상품이 없습니다)을 알림으로, 상태를 다시 맞춘다
    clearTimers();
    stopSnd();
    drawingRef.current = false;
    setAnim(null);
    sfxNo();
    // (점검 · LEVEL 비공개 · XP 중단 입구 거절은 message 에 글이 올 수 있다 — 이벤트 패스 받기와 같은 입구)
    pushToast?.(res ? res.error || res.message || "추첨하지 못했습니다." : "네트워크 오류로 추첨하지 못했습니다.");
    load();
  }, [clearTimers, stopSnd, finish, pushToast, onCount, onDrawn, load]);

  // 건너뛰기(스크린 누르기) — 결과가 와 있으면 바로 ④, 아니면 「1」 에서 기다린다. 결과 카드를 누르면 평소 화면(추첨권 ×N)으로
  const onScreen = useCallback(() => {
    if (!anim) return;
    if (anim.step === "result") {
      sfxTick();
      setAnim(null);
      return;
    }
    if (anim.step === "wait" || endRef.current) return;
    clearTimers();
    endRef.current = true;
    if (resultRef.current) finish(anim.run);
    else {
      const run = anim.run;
      setAnim((a) => (a && a.run === run ? { ...a, step: "count", digit: 1 } : a));
    }
  }, [anim, clearTimers, finish]);

  // 닫기 — 시간표 · 소리를 접는다. 도착했지만 아직 안 보인 결과는 알림으로(닫아도 결과를 놓치지 않게)
  const closeAll = useCallback(() => {
    const r = resultRef.current;
    if (r) {
      pushToast?.(winText(r), r.kind !== "none");
      if (leftRef.current != null) onCount?.(leftRef.current);
      onDrawn?.();
    }
    runRef.current++;
    resultRef.current = null;
    leftRef.current = null;
    drawingRef.current = false;
    clearTimers();
    stopSnd();
    setAnim(null);
    onClose();
  }, [pushToast, onCount, onDrawn, clearTimers, stopSnd, onClose]);

  // 열리면 닫기 단추에 포커스 · Esc 로 닫기 — 이벤트 패스 창과 같다
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAll]);

  const copy = useCallback(async (code) => {
    const ok = await copyText(String(code || ""));
    if (ok) {
      sfxTick();
      pushToast?.("코드를 복사했습니다.", true);
    } else {
      sfxNo();
      pushToast?.("복사하지 못했습니다.");
    }
  }, [pushToast]);

  if (!open) return null;

  const title = String(data?.title || "").trim() || "방구석 심야 괴담회";
  const phase = data?.phase || "";
  const tickets = Math.max(0, Math.floor(Number(data?.tickets) || 0));
  const span = data?.drawOpensAt && data?.drawClosesAt ? `${dayOf(data.drawOpensAt)} ~ ${dayOf(data.drawClosesAt, true)}` : "";
  const prizes = Array.isArray(data?.prizes) ? data.prizes : [];
  const screenings = Array.isArray(data?.screenings) ? data.screenings : [];
  const history = Array.isArray(data?.history) ? data.history : [];
  const rarityByPid = Object.fromEntries(prizes.map((p) => [p.pid, p.rarity]));
  const running = !!anim && anim.step !== "result";

  // 📌 나올 수 있는 상품 — 서버 고르기(lib/goedam.js pickPrize — 줄 수 있고(ready) 남은 것)와 같은 판정. 하나도 없으면 누르기 전에 잠근다
  //    (눌러 봐야 서버가 추첨권을 되돌리고 「남은 상품이 없습니다」 — 애니메이션을 돌렸다 접지 않게). 운영진 미리보기의 반영 전 상품(ready false)은 빼고 센다
  const drawableCount = prizes.filter((p) => p.ready !== false && (p.left == null || Number(p.left) > 0)).length;
  // 📌 단추 — 로그인 전 「로그인」 · 기간 전 「10. 30. 20:00 에 열립니다」 · 끝 「종료」 · 상품 소진 「남은 상품 없음」 · 추첨권 없음 잠김 · 뽑는 중 그대로(글자 자리 유지)
  const lockText = !data
    ? ""
    : phase === "before"
      ? `${dayOf(data.drawOpensAt)} ${hmOf(data.drawOpensAt)} 에 열립니다`
      : phase === "closed"
        ? "종료"
        : phase !== "open"
          ? "준비 중"
          : !drawableCount
            ? "남은 상품 없음"
            : "";
  const busyDots = <span className="gd-busy">…</span>;
  let action;
  if (data && !signedIn && authStatus !== "loading") {
    action = <button type="button" className="gd-gb gd-go" onClick={() => { closeAll(); openLogin(); }}>로그인</button>;
  } else if (!data || lockText) {
    action = (
      <button type="button" className="gd-gb gd-go off" disabled aria-label={lockText || "추첨권 1장 쓰기"}>
        <span className="inline-flex items-center" style={!data ? { visibility: "hidden" } : undefined}>{lockText || "추첨권 1장 쓰기"}</span>
      </button>
    );
  } else {
    const off = tickets <= 0;
    action = (
      <button type="button" className={`gd-gb gd-go${off ? " off" : ""}`} onClick={draw} disabled={off || running || authStatus === "loading"}>
        <span className="inline-flex items-center" style={anim?.step === "wait" ? { visibility: "hidden" } : undefined}>
          {off && <i className="gd-lk"><Sprite {...LOCK} u={2} /></i>}
          추첨권 1장 쓰기
        </span>
        {anim?.step === "wait" && busyDots}
      </button>
    );
  }

  // ── 스크린 — 읽는 중 · 실패 / 평소(추첨권 큰 판 ×N) / ①② 추첨권 / ③ 카운트다운 / ④ 결과 카드 ──
  let screen;
  if (!data) {
    screen = status === "error" ? (
      <div className="gd-msg">
        불러오지 못했습니다
        <button type="button" className="gd-gb md" onClick={() => { setStatus("loading"); load(); }}>다시 시도</button>
      </div>
    ) : <div className="gd-msg">…</div>;
  } else if (anim && (anim.step === "rise" || anim.step === "tear")) {
    screen = (
      <div className={`gd-tka ${anim.step}`} aria-hidden>
        <span className="gd-tm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/ticket-main.png`} alt="" draggable={false} className="gd-px" />
        </span>
        <span className="gd-ts">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/ticket-stub.png`} alt="" draggable={false} className="gd-px" />
        </span>
      </div>
    );
  } else if (anim?.step === "count") {
    screen = <Countdown key={anim.digit} digit={anim.digit} />;
  } else if (anim?.step === "result" && anim.result) {
    const r = anim.result;
    const none = r.kind === "none";
    const rc = none ? "#3a3186" : rarityOf(r.rarity).c;
    const amt = amountOf(r);
    screen = (
      <div className="gd-rs">
        <div className={`gd-card${none ? " none" : ""}`} style={{ "--rc": rc }} role="status" onClick={(e) => { if (r.code) e.stopPropagation(); }}>
          <span className="gd-ci"><PrizeIcon kind={r.kind} size={narrow ? 48 : 96} /></span>
          <div className="gd-ct">
            {!none && <RarityChip v={r.rarity} />}
            <p className="gd-cn">{nameOf(r)}</p>
            {amt && <p className="gd-ca">{amt}</p>}
            {r.code && (
              <div className="gd-code">
                <code>{r.code}</code>
                <button type="button" className="gd-sb gd-pp" onClick={(e) => { e.stopPropagation(); copy(r.code); }}>복사</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } else {
    const has = signedIn && tickets > 0;
    screen = (
      <div className={`gd-tk ${has ? "live" : "none"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/ticket.png`} alt="할로윈 추첨권" draggable={false} className="gd-px" />
        <span className="gd-xn" aria-label={`추첨권 ${tickets}장`}>×{fmt(tickets)}</span>
      </div>
    );
  }

  // ── 아래 목록 셋 ──
  const prizeRows = prizes.filter((p) => p.kind !== "none");
  const prizesList = prizeRows.length ? prizeRows.map((p) => {
    const unlimited = p.total == null;
    const out = !unlimited && Number(p.left) <= 0;
    return (
      <div key={p.pid} className={`gd-row gd-pz${out ? " out" : ""}`}>
        <RarityChip v={p.rarity} />
        <span className="gd-nm">{p.name}</span>
        <span className="gd-cnt">{unlimited ? "∞" : `${fmt(p.left)}/${fmt(p.total)}`}</span>
      </div>
    );
  }) : <p className="gd-none">준비 중</p>;
  const screeningsList = screenings.length ? screenings.map((s) => {
    const a = msOf(s.startsAt), b = msOf(s.endsAt);
    const live = !s.earned && nowMs > 0 && nowMs >= a && nowMs < b;
    const past = nowMs > 0 && nowMs >= b;
    return (
      <div key={s.sid} className={`gd-row gd-sc${past && !s.earned ? " dim" : ""}`}>
        <span className="gd-dt"><b>{dayOf(s.startsAt)}</b><i>{wdOf(s.startsAt)}</i></span>
        <span className="gd-tx">
          <span className="gd-nm">{s.title}</span>
          <span className="gd-sm">
            <span>{hmOf(s.startsAt)}–{hmOf(s.endsAt)}</span>
            <span className="gd-mi"><ItemIcon icon="art:goedam-ticket" size={16} /></span>
            <span>×{fmt(s.tickets || 1)}</span>
          </span>
        </span>
        <span className="gd-stt">
          {s.earned ? <span role="img" aria-label="완청"><Sprite {...CHECK} u={2} /></span> : live ? <span className="gd-live gd-pp">진행 중</span> : "–"}
        </span>
      </div>
    );
  }) : <p className="gd-none">준비 중</p>;
  const historyList = !signedIn ? <p className="gd-none">로그인 필요</p> : history.length ? history.map((h) => {
    const none = h.kind === "none";
    return (
      <div key={h.id} className={`gd-row gd-hs${none ? " dim" : ""}`}>
        <span className="gd-tx">
          {/* 희귀도 — 서버가 기록 줄에 실어 준 값(지금 상품 목록에서 빠진 상품도 등급 그대로), 없으면 상품 목록에서 */}
          {!none && <RarityChip v={h.rarity || rarityByPid[h.pid]} />}
          <span className="gd-nm">{nameOf(h)}</span>
          <span className="gd-at">{dayOf(h.at)} {hmOf(h.at)}</span>
        </span>
        {h.code && (
          <span className="gd-code">
            <code>{h.code}</code>
            <button type="button" className="gd-sb gd-pp" onClick={() => copy(h.code)}>복사</button>
          </span>
        )}
      </div>
    );
  }) : <p className="gd-none">없음</p>;
  const SECS = [
    { k: "prizes", l: "상품", body: prizesList },
    { k: "screenings", l: "회차", body: screeningsList },
    { k: "history", l: "내 당첨", body: historyList },
  ];
  const secOn = SECS.find((s) => s.k === tab) || SECS[0];

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={closeAll}
    >
      <style>{GD_CSS}</style>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="gd-win">
        <div className="gd-wi">
          {narrow && <span aria-hidden className="gd-grab"></span>}
          <button ref={closeRef} type="button" onClick={closeAll} aria-label="닫기" className="gd-x gd-pp">
            <Sprite {...XMARK} u={2} />
          </button>

          <div className="gd-hd">
            <h2>{title}</h2>
            <div className="gd-tags">
              {span && <span className="gd-tag gd-pp">{span}</span>}
              {/* 운영진 미리보기(꺼져 있을 때 — 서버 adminPreview) */}
              {data?.adminPreview && <span className="gd-tag gd-off gd-pp">비공개</span>}
            </div>
          </div>

          {/* 스크린 — 뽑는 중 누르면 건너뛰기 · 결과 카드를 누르면 평소 화면(추첨권 ×N) */}
          <div className={`gd-scr${running || anim?.step === "result" ? " tap" : ""}`} onClick={onScreen}>
            {screen}
          </div>

          <div className="gd-act">{action}</div>

          {narrow ? (
            <>
              <div className="gd-tabs" role="tablist">
                {SECS.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    role="tab"
                    aria-selected={s.k === secOn.k}
                    className={`gd-tab${s.k === secOn.k ? " on" : ""}`}
                    onClick={() => { if (s.k !== tab) { setTab(s.k); sfxTick(); } }}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
              <div className="gd-body" role="tabpanel">{data ? secOn.body : null}</div>
            </>
          ) : (
            <div className="gd-body">
              {data && (
                <div className="gd-cols">
                  {SECS.map((s) => (
                    <section key={s.k} className="gd-sec gd-pp">
                      <p className="gd-st">{s.l}</p>
                      {s.body}
                    </section>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
