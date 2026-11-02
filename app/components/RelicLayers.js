"use client";

// 📌 유물 「사건의 지평선」 카드 겹(2026-11-02 운영자 "이제 한 번 사이트에 넣어봐") — 카드 안 아무 데나 두면 부모(카드)를 덮는 캔버스 둘을 그린다
//    아래 겹(z 0) — 배경 · 사진 뒤 그림 · 사진 자리(카드 글자 칸 z-10 보다 아래) / 위 겹(z 11) — 사진 앞 그림 · 레벨바 · 카드 테두리 · 이어지는 연출 · 레벨업 효과
//    그림은 lib/relic(시안 코드 그대로) — 칸은 기기 화소에 맞춰, 선은 매끈하게(lib/relic/draw). 한 바퀴 7.04초, 12장/초 안팎(레벨업 중엔 20장)
//    카드 자리(사진 · 막대 · 이름 · 글자 칸)는 카드 DOM 을 재서 맞춘다: [data-relic-avatar](사진 칸) · [data-skin-bar](막대) · [data-relic-level](레벨 숫자 — 레벨업 때 색 어긋남)
//    preview — 인벤토리 미리보기 카드(360 × 556 판, 글자 없음). still — 멈춘 한 장(움직임 줄이기도 같다)
//    levelUpAt — 바뀔 때마다 레벨업 효과 한 번(약 4.5초). xpAt — 바뀔 때마다 「조각끼리 이어지는 연출」 한 번(약 4초 — XP 를 얻을 때. 운영자 "XP 얻을 때의 효과 아니었어?").
//    pct 0~1 — 레벨 진행(막대 — 이어지는 연출도 이 앞머리에서 터진다)
import { useEffect, useRef } from "react";
import { relicLayers, levelUpState, setGeo, normPick, coreColors, PREVIEW_GEO, LOOP_MS } from "@/lib/relic";
import { drawFrag } from "@/lib/relic/draw";

const LV_MS = 4500;

// 카드 재기 — 그림 판은 칸(3px) 정수배로 맞춘 폭(k 배 — 1 에 아주 가깝다)
function measureCard(card) {
  const R = card.getBoundingClientRect();
  if (!R.width || !R.height) return null;
  const sx = card.offsetWidth ? R.width / card.offsetWidth : 1; // 화면 배율(transform)이 걸렸으면 되돌려 잰다
  const cw = R.width / sx, ch = R.height / sx;
  const CW = Math.round(cw / 3), k = (CW * 3) / cw, CH = Math.round((ch * k) / 3);
  const box = (r) => [((r.left - R.left) / sx) * k, ((r.top - R.top) / sx) * k, ((r.right - R.left) / sx) * k, ((r.bottom - R.top) / sx) * k];
  const shown = (el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null; const cs = getComputedStyle(el); return cs.visibility === "hidden" || cs.display === "none" ? null : r; };
  // 사진 — 보이는 [data-relic-avatar] 안에서 가장 작은 정사각 사진(지름 40px 넘게)
  let pc = [76 * k, 76 * k, 34 * k], avatarBox = null;
  for (const el of card.querySelectorAll("[data-relic-avatar]")) {
    if (!shown(el)) continue;
    avatarBox = el;
    let best = null;
    for (const e of el.querySelectorAll("img, span, div")) { const r = e.getBoundingClientRect(); if (r.width / sx >= 40 && Math.abs(r.width - r.height) < 2 && (!best || r.width < best.width)) best = r; }
    const r = best || el.getBoundingClientRect(), b = box(r);
    pc = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, (b[2] - b[0]) / 2];
    break;
  }
  // 막대 — 보이지 않게 숨겨 둔 기본 막대 자리도 그대로 잰다
  let bar = null;
  for (const el of card.querySelectorAll("[data-skin-bar]")) { const r = el.getBoundingClientRect(); if (r.width && r.height) { bar = box(r); break; } }
  const W = CW * 3, H = CH * 3;
  if (!bar) bar = [28 * k, H * 0.52, W - 28 * k, H * 0.52 + 10];
  // 글자 · 아이콘 칸 — 보이는 잎 글자 + 작은 그림(사진 칸 · 뒤 큰 숫자 · 캔버스 빼고). 이름 왼쪽 끝 = 사진 오른쪽에 처음 나오는 글자
  const text = [];
  let nx = pc[0] + pc[2] + 30;
  let nameSeen = false;
  for (const e of card.querySelectorAll("*")) {
    if (e.tagName === "CANVAS" || (avatarBox && avatarBox.contains(e))) continue;
    const isText = e.children.length === 0 && (e.textContent || "").trim() && e.tagName !== "svg";
    const isIcon = (e.tagName === "svg" || e.tagName === "IMG") && !e.closest("svg svg");
    if (!isText && !isIcon) continue;
    const r = shown(e);
    if (!r) continue;
    if (isIcon && (r.width / sx > 64 || r.height / sx > 64)) continue;
    const cs = getComputedStyle(e);
    if (parseFloat(cs.fontSize) / 1 > 100 || parseFloat(cs.opacity) < 0.2) continue;
    const b = box(r);
    text.push([b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4]);
    if (!nameSeen && isText && b[1] < pc[1] + pc[2] && b[0] > pc[0]) { nx = b[0]; nameSeen = true; }
  }
  return {
    W, H, CW, CH, R: (parseFloat(getComputedStyle(card).borderTopLeftRadius) || 24) * k,
    CX: pc[0], CY: pc[1], PR: pc[2], NX: nx,
    BX0: bar[0], BX1: bar[2], BY: (bar[1] + bar[3]) / 2, BW: Math.round((bar[2] - bar[0]) / 3), TEXT: text,
  };
}
// 레벨업 새 숫자 색 어긋남 — 숫자 글자에 코어 색 · 흰 그림자를 좌우로 어긋나게 잠깐(흐림 없음)
function glitch(card, core) {
  const el = card.querySelector("[data-relic-level]");
  if (!el?.animate) return;
  const c = coreColors(core);
  el.animate(
    [
      { textShadow: `-7px 0 ${c.p3}, 7px 0 rgba(255,255,255,0.85)` },
      { textShadow: `-4px 0 ${c.p3}, 4px 0 rgba(255,255,255,0.6)`, offset: 0.4 },
      { textShadow: `-1px 0 ${c.p3}, 1px 0 rgba(255,255,255,0.3)`, offset: 0.8 },
      { textShadow: "0 0 rgba(0,0,0,0), 0 0 rgba(0,0,0,0)" },
    ],
    { duration: 1100, easing: "steps(7, end)" }
  );
}

const LINK_MS = 4000;

export default function RelicLayers({ pick, pct = 0.49, levelUpAt = 0, xpAt = 0, preview = false, still = false }) {
  const underRef = useRef(null);
  const overRef = useRef(null);
  const st = useRef({ geo: null, pick: normPick(pick), pct, prevPct: pct, lvStart: 0, lvFrom: pct, glitched: false, linkStart: 0, dirty: true });
  // 받은 값 — 그리기 고리가 늘 최신을 읽게
  const s = st.current;
  const np = normPick(pick);
  if (JSON.stringify(np) !== JSON.stringify(s.pick)) { s.pick = np; s.dirty = true; }
  if (pct !== s.pct) { s.prevPct = s.pct; s.pct = pct; s.dirty = true; }
  useEffect(() => {
    if (!levelUpAt) return;
    const c = st.current;
    c.lvStart = performance.now();
    c.lvFrom = c.prevPct;
    c.glitched = false;
  }, [levelUpAt]);
  useEffect(() => {
    if (!xpAt) return;
    st.current.linkStart = performance.now();
  }, [xpAt]);

  useEffect(() => {
    const under = underRef.current, over = overRef.current, card = under?.parentElement;
    if (!under || !over || !card) return;
    let raf = 0, last = -1e9, measured = -1e9, alive = true, visible = true;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const io = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); }) : null;
    io?.observe(card);
    const remeasure = () => {
      const c = st.current;
      c.geo = preview ? PREVIEW_GEO : measureCard(card) || c.geo;
      const r = card.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      for (const cv of [under, over]) if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      c.dirty = true;
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { measured = -1e9; }) : null;
    ro?.observe(card);
    const draw = (now) => {
      const c = st.current, geo = c.geo;
      if (!geo) return;
      setGeo(geo);
      const t = still || reduce ? 0.3 : (now % LOOP_MS) / LOOP_MS, f = Math.floor(t * 64);
      let lv = null;
      if (!preview && c.lvStart && now - c.lvStart < LV_MS) {
        const p = (now - c.lvStart) / LV_MS;
        lv = levelUpState(c.pick.core, p, { pct0: c.lvFrom, pct1: c.pct });
        if (p >= 0.62 && !c.glitched) { c.glitched = true; glitch(card, c.pick.core); }
      }
      const linkT = !preview && !lv && c.linkStart && now - c.linkStart < LINK_MS ? (now - c.linkStart) / LINK_MS : null;
      const L = relicLayers(c.pick.core, t, f, { ...c.pick, pct: c.pct, lv, linkT });
      const sc = under.width / geo.W;
      drawFrag(under.getContext("2d"), L.under, L.cells, sc);
      drawFrag(over.getContext("2d"), L.over, L.cells, sc);
      c.dirty = false;
    };
    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (now - measured > 2000) { remeasure(); measured = now; }
      const c = st.current, lvOn = (c.lvStart && now - c.lvStart < LV_MS) || (c.linkStart && now - c.linkStart < LINK_MS);
      const gap = still || reduce ? (c.dirty ? 0 : 1e9) : lvOn ? 50 : 83;
      if (now - last < gap) return;
      last = now;
      draw(now);
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); io?.disconnect(); ro?.disconnect(); };
  }, [preview, still]);

  const base = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", pointerEvents: "none" };
  return (
    <>
      <canvas ref={underRef} aria-hidden style={{ ...base, zIndex: 0 }} />
      <canvas ref={overRef} aria-hidden style={{ ...base, zIndex: 11 }} />
    </>
  );
}
