"use client";

import { useEffect, useRef, useState } from "react";
import { STRING_SKINS } from "@/lib/cardSkins";

// 📌 카드 스킨 장식 — 레벨 페이지 프로필 카드(잉크 판)에 착용한 카드 스킨을 얹는다.
//    "'카드' 스킨인 만큼 좀 꾸며 달라"(테두리만으론 심심) — 스킨마다 액자 + 장식 요소:
//      골드   금박 결 무늬 · 이중 테 · 네 모서리 장식 · 위아래 문장 · 반짝임
//      오로라 밤하늘 별 · 위에서 드리우는 빛 커튼(가는 세로 빛줄) · 물결 선 · 빛 테
//      아이스 서리 점 무늬 · 픽셀 액자 · 모서리 눈송이 · 흩날리는 도트 눈
//      크림슨 빗금 · 붉은 테 · 모서리 꺾쇠 · 바닥 불꽃 선 · 떠오르는 불씨
//    시즌 2(새로운 세계 · 항해도 · 비공정)는 lib/cardSkins 의 SVG 문자열 함수를 그대로 쓴다 — 봇 카드와 한 벌
//    등급 색(카드 오른쪽 위 번지는 빛 · 링 · 문장)과 헷갈리지 않게 카드를 넓게 번지는 빛으로 칠하지 않는다 — 선 · 점 · 무늬 · 작은 장식만.
//    아바타(왼쪽 위)와 글자 뒤에는 옅게, 진한 장식은 가장자리 · 모서리(오른쪽 위 · 아래쪽)에. 봇 이미지 카드(lib/botCards.js SKIN_DECO)와 같은 말.
//    부모는 relative overflow-hidden 이어야 한다. 크기를 재서 그리므로 처음 한 번은 비어 있다가 나타난다(자리를 차지하지 않아 아무것도 밀지 않는다)
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;
const dia = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
// 네 갈래 반짝임(오목한 별)
const star4 = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;
// 스킨마다 같은 자리에 찍히도록 씨앗 고정 난수
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r1 = (n) => Math.round(n * 10) / 10;
// 아바타 · 이름 자리(왼쪽 위) — 진한 점 장식은 피한다
const inAvatar = (x, y) => x < 120 && y < 118;

// 모서리를 steps 칸 깎은 픽셀 테 — { lt: 위 · 왼쪽, rb: 아래 · 오른쪽 }
function pixelFrame(w, h, o, P, steps) {
  const L = o, T = o, R = w - o, B = h - o, c = P * steps;
  let lt = rect(L + c, T, R - L - c * 2, P) + rect(L, T + c, P, B - T - c * 2);
  let rb = rect(L + c, B - P, R - L - c * 2, P) + rect(R - P, T + c, P, B - T - c * 2);
  for (let s = 1; s < steps; s++) {
    const a = P * s, b = c - a;
    lt += rect(L + a, T + b, P, P) + rect(R - a - P, T + b, P, P);
    rb += rect(L + a, B - b - P, P, P) + rect(R - a - P, B - b - P, P, P);
  }
  return { lt, rb };
}
const FLAKE = ["...#...", ".#.#.#.", "..###..", "###.###", "..###..", ".#.#.#.", "...#..."];
function flake(cx, cy, P) {
  let d = "";
  FLAKE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") d += rect(r1(cx + (x - 3.5) * P), r1(cy + (y - 3.5) * P), P, P); }));
  return d;
}

export function deco(skin, w, h) {
  // 📌 시즌 2 스킨 — 문자열 함수(lib/cardSkins)가 그린 SVG 를 그대로 얹는다(그림은 목록에 있는 key 로만 만든다 — 사용자 입력이 섞이지 않음)
  const s2 = Object.prototype.hasOwnProperty.call(STRING_SKINS, skin) ? STRING_SKINS[skin] : null;
  if (s2) {
    const d = s2.deco(w, h, 1, true);
    return <g dangerouslySetInnerHTML={{ __html: (d.defs ? `<defs>${d.defs}</defs>` : "") + (d.under || "") + (d.over || "") }} />;
  }
  const o = 12; // 바깥 테 여백 — 카드 모서리(24px 둥근 모서리) 안쪽

  if (skin === "gold") {
    const i = 19;
    // 모서리 장식 — 둥근 L 두 겹 + 끝 점. 왼쪽 위 기준으로 그려 네 모서리로 뒤집는다
    const corner = `M0 38V12Q0 0 12 0H38M7 24V16Q7 7 16 7H24`;
    const corners = [[i + 4, i + 4, 1, 1], [w - i - 4, i + 4, -1, 1], [i + 4, h - i - 4, 1, -1], [w - i - 4, h - i - 4, -1, -1]];
    const crest = (y, s) => (
      <g key={`c${y}`}>
        <path d={`M${w / 2 - 46} ${y + s * 5}H${w / 2 - 12}M${w / 2 + 12} ${y + s * 5}H${w / 2 + 46}`} stroke="url(#sf-gd)" strokeOpacity="0.6" strokeWidth="1" />
        <circle cx={w / 2 - 48} cy={y + s * 5} r="1.4" fill="#f0cf7e" fillOpacity="0.7" />
        <circle cx={w / 2 + 48} cy={y + s * 5} r="1.4" fill="#f0cf7e" fillOpacity="0.7" />
        <path d={dia(w / 2, y, 7)} fill="url(#sf-gd)" />
        <path d={dia(w / 2, y, 2.6)} fill="#1b1b1b" fillOpacity="0.85" />
      </g>
    );
    return (
      <>
        <defs>
          <linearGradient id="sf-gd" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2={h}>
            <stop offset="0" stopColor="#f7de9c" /><stop offset="0.45" stopColor="#b8862b" /><stop offset="0.7" stopColor="#e9c46a" /><stop offset="1" stopColor="#9c6e1e" />
          </linearGradient>
          <pattern id="sf-foil" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.7" height="7" fill="#f0cf7e" fillOpacity="0.05" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#sf-foil)" />
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="url(#sf-gd)" strokeOpacity="0.8" strokeWidth="2" />
        <rect x={i} y={i} width={w - i * 2} height={h - i * 2} fill="none" stroke="#f0cf7e" strokeOpacity="0.22" strokeWidth="1" />
        {corners.map(([x, y, sx, sy]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${sx} ${sy})`}>
            <path d={corner} fill="none" stroke="url(#sf-gd)" strokeOpacity="0.75" strokeWidth="1.3" />
            <circle cx="42" cy="0" r="1.3" fill="#f0cf7e" fillOpacity="0.7" />
            <circle cx="0" cy="42" r="1.3" fill="#f0cf7e" fillOpacity="0.7" />
          </g>
        ))}
        <path d={[[i, i], [w - i, i], [i, h - i], [w - i, h - i]].map(([x, y]) => dia(x, y, 4.5)).join("")} fill="url(#sf-gd)" />
        {crest(o, 1)}
        {crest(h - o, -1)}
        {/* 아래 두 모서리 부챗살 — 아르데코 금박 카드 느낌(가는 선만) */}
        {[[i + 2, h - i - 2, 1], [w - i - 2, h - i - 2, -1]].map(([x, y, sx]) => (
          <g key={`fan${x}`} transform={`translate(${x} ${y}) scale(${sx} 1)`}>
            <path d={[10, 22, 34, 46, 58, 70, 80].map((a) => { const t = (a * Math.PI) / 180; return `M0 0L${r1(Math.cos(t) * 64)} ${r1(-Math.sin(t) * 64)}`; }).join("")}
              stroke="url(#sf-gd)" strokeOpacity="0.28" strokeWidth="0.8" />
            <path d="M52 0A52 52 0 0 0 0 -52M40 0A40 40 0 0 0 0 -40" fill="none" stroke="#f0cf7e" strokeOpacity="0.22" strokeWidth="0.8" />
          </g>
        ))}
        <path d={star4(w - 44, h * 0.46, 6) + star4(w - 30, h * 0.5, 3.5) + star4(34, h * 0.64, 4)} fill="#f7de9c" fillOpacity="0.55" />
      </>
    );
  }

  if (skin === "aurora") {
    const rand = rng(7);
    const wave = (x) => o + 12 + Math.sin((x / w) * Math.PI * 2.2 + 0.6) * 6;
    const wavePath = (dy) => {
      let d = "";
      for (let x = -10; x <= w + 10; x += 8) d += `${d ? "L" : "M"}${x} ${r1(wave(x) + dy)}`;
      return d;
    };
    const rays = [];
    const step = 11;
    for (let x = o + 8; x < w - o - 4; x += step) {
      const len = 8 + rand() * 16; // 이름 줄 위에서 끝나게
      if (x < 124) { rand(); continue; } // 아바타 위는 비운다
      const y0 = wave(x);
      const band = x < w / 3 ? "g" : x < (w * 2) / 3 ? "b" : "p";
      rays.push(<rect key={`r${x}`} x={r1(x - 0.9)} y={r1(y0)} width="1.8" height={r1(len)} fill={`url(#sf-ray-${band})`} />);
    }
    const stars = [];
    for (let n = 0; n < 22; n++) {
      const x = o + 10 + rand() * (w - o * 2 - 20);
      const y = o + 14 + rand() * (h * 0.55);
      if (inAvatar(x, y)) continue;
      stars.push(<circle key={`s${n}`} cx={r1(x)} cy={r1(y)} r={r1(0.6 + rand() * 0.9)} fill="#ffffff" fillOpacity={r1(0.2 + rand() * 0.4)} />);
    }
    const rayGrad = (id, c) => (
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={c} stopOpacity="0.5" /><stop offset="1" stopColor={c} stopOpacity="0" />
      </linearGradient>
    );
    return (
      <>
        <defs>
          <linearGradient id="sf-au" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
            <stop offset="0" stopColor="#2fe3a0" /><stop offset="0.5" stopColor="#38b4ff" /><stop offset="1" stopColor="#a879ff" />
          </linearGradient>
          {rayGrad("sf-ray-g", "#2fe3a0")}
          {rayGrad("sf-ray-b", "#38b4ff")}
          {rayGrad("sf-ray-p", "#a879ff")}
        </defs>
        {stars}
        {rays}
        <path d={wavePath(0)} fill="none" stroke="url(#sf-au)" strokeOpacity="0.55" strokeWidth="1.4" />
        <path d={wavePath(9)} fill="none" stroke="url(#sf-au)" strokeOpacity="0.25" strokeWidth="0.8" />
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="url(#sf-au)" strokeOpacity="0.55" strokeWidth="1.5" />
        <path d={star4(w - 34, h - 36, 5) + star4(w - 48, h - 28, 2.6)} fill="#ffffff" fillOpacity="0.55" />
      </>
    );
  }

  if (skin === "ice") {
    const rand = rng(11);
    const outer = pixelFrame(w, h, o, 4, 2);
    const inner = pixelFrame(w, h, o + 6, 2, 2);
    const q = o + 24;
    let snow = "";
    for (let n = 0; n < 34; n++) {
      const x = Math.round(o + 8 + rand() * (w - o * 2 - 16));
      const y = Math.round(o + 8 + rand() * (h - o * 2 - 16));
      if (inAvatar(x, y)) continue;
      const s = rand() < 0.3 ? 3 : 2;
      snow += rect(x, y, s, s);
    }
    // 위 테에 매달린 픽셀 고드름 — 아바타 위쪽은 비운다
    let icicles = "";
    for (let x = 132; x < w - o - 20; x += 16 + Math.floor(rand() * 18)) {
      const len = 2 + Math.floor(rand() * 5); // 칸 수(2px) — 위는 굵고 끝은 가늘게
      icicles += rect(x, o + 4, 6, 2) + rect(x + 1, o + 6, 4, 2);
      for (let k = 0; k < len; k++) icicles += rect(x + 2, o + 8 + k * 2, 2, 2);
    }
    // 바닥 눈 둔덕 — 아래 테 안쪽에 높낮이가 다른 계단
    let drift = "";
    for (let x = o + 4; x < w - o - 4; x += 4) {
      const hh = Math.round((3 + Math.sin(x / 23) * 2 + Math.sin(x / 9) * 1.2 + 2) * 2) / 2;
      drift += rect(x, h - o - 4 - hh * 2, 4, hh * 2);
    }
    return (
      <>
        <defs>
          <pattern id="sf-frost" width="9" height="9" patternUnits="userSpaceOnUse">
            <rect x="4" y="4" width="1" height="1" fill="#cdeeff" fillOpacity="0.1" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#sf-frost)" />
        <g shapeRendering="crispEdges">
          <path d={snow} fill="#e6f6ff" fillOpacity="0.28" />
          <path d={outer.lt} fill="#cdeeff" fillOpacity="0.65" />
          <path d={outer.rb} fill="#79b4d8" fillOpacity="0.6" />
          <path d={inner.lt + inner.rb} fill="#b4e3ff" fillOpacity="0.16" />
          <path d={drift} fill="#e6f6ff" fillOpacity="0.16" />
          <path d={icicles} fill="#cdeeff" fillOpacity="0.5" />
          <path d={flake(w - q, q, 3) + flake(q, h - q, 3) + flake(w - q, h - q, 3)} fill="#e6f6ff" fillOpacity="0.5" />
        </g>
      </>
    );
  }

  if (skin === "crimson") {
    const rand = rng(23);
    const L = 36;
    const br = (m, len) =>
      `M${m} ${m + len}V${m}H${m + len}M${w - m - len} ${m}H${w - m}V${m + len}` +
      `M${w - m} ${h - m - len}V${h - m}H${w - m - len}M${m + len} ${h - m}H${m}V${h - m - len}`;
    // 바닥 불꽃 선 — 가장자리 안쪽에 높이가 다른 불꽃 혀 여러 개(선만)
    let flames = "";
    const base = h - o - 2;
    const n = Math.max(6, Math.round((w - o * 2) / 34));
    const tw = (w - o * 2 - 8) / n;
    for (let k = 0; k < n; k++) {
      const x0 = o + 4 + k * tw - tw * 0.25;
      const ww = tw * 1.5; // 옆 불꽃과 겹치게
      const th = 22 + rand() * 30;
      const lean = (rand() - 0.5) * ww * 0.5; // 끝이 좌우로 살짝 휜다
      flames += `M${r1(x0)} ${base}C${r1(x0 + ww * 0.1)} ${r1(base - th * 0.45)} ${r1(x0 + ww * 0.35 + lean * 0.3)} ${r1(base - th * 0.6)} ${r1(x0 + ww * 0.5 + lean)} ${r1(base - th)}`
        + `C${r1(x0 + ww * 0.55 + lean * 0.3)} ${r1(base - th * 0.55)} ${r1(x0 + ww * 0.95)} ${r1(base - th * 0.4)} ${r1(x0 + ww)} ${base}Z`;
    }
    const embers = [];
    const colors = ["#ff5a76", "#ffae3c", "#ffd8a0"];
    for (let n = 0; n < 30; n++) {
      const x = o + 10 + rand() * (w - o * 2 - 20);
      const y = h * 0.42 + rand() * (h * 0.58 - o - 14);
      const nearBottom = (y - h * 0.42) / (h * 0.58);
      embers.push(<path key={`e${n}`} d={dia(r1(x), r1(y), r1(1 + rand() * 2.2))} fill={colors[n % 3]} fillOpacity={r1(0.15 + nearBottom * 0.5)} />);
    }
    return (
      <>
        <defs>
          <pattern id="sf-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1" height="10" fill="#ff5a76" fillOpacity="0.05" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#sf-hatch)" />
        {embers}
        <path d={flames} fill="#ff3a5c" fillOpacity="0.07" stroke="#ff5a76" strokeOpacity="0.38" strokeWidth="1.1" strokeLinejoin="round" />
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="#ff5a76" strokeOpacity="0.35" strokeWidth="1.2" />
        <path d={br(o, L)} fill="none" stroke="#ff3a5c" strokeOpacity="0.9" strokeWidth="3" strokeLinecap="square" />
        <path d={br(o + 7, 18)} fill="none" stroke="#ff5a76" strokeOpacity="0.5" strokeWidth="1" />
        <path d={dia(w / 2, o, 6)} fill="#ff3a5c" />
        <path d={dia(w / 2, o, 2.4)} fill="#1b1b1b" fillOpacity="0.85" />
        <path d={dia(w / 2, h - o, 6)} fill="#ff3a5c" />
        <path d={dia(w / 2, h - o, 2.4)} fill="#1b1b1b" fillOpacity="0.85" />
      </>
    );
  }
  return null;
}

export default function SkinFrame({ skin }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      const h = Math.round(e.contentRect.height);
      setBox((b) => (b && b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const body = box && box.w > 60 && box.h > 60 ? deco(skin, box.w, box.h) : null;
  return (
    <div ref={ref} aria-hidden className="absolute inset-0 pointer-events-none">
      {body && (
        <svg width={box.w} height={box.h} viewBox={`0 0 ${box.w} ${box.h}`} className="absolute inset-0 block">
          {body}
        </svg>
      )}
    </div>
  );
}
