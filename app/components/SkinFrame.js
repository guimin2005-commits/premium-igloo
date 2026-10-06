"use client";

import { useEffect, useRef, useState } from "react";
import { STRING_SKINS } from "@/lib/cardSkins";

// 📌 카드 스킨 장식 — 레벨 페이지 프로필 카드(잉크 판)에 착용한 카드 스킨을 얹는다.
//    "'카드' 스킨인 만큼 좀 꾸며 달라"(테두리만으론 심심) — 스킨마다 액자 + 장식 요소:
//      골드   금박 결 무늬 · 이중 테 · 네 모서리 장식 · 위아래 문장 · 반짝임
//      오로라 밤하늘 별 · 위에서 드리우는 빛 커튼(가는 세로 빛줄) · 물결 선 · 빛 테
//    아이스 · 크림슨(2026-10-05 도트로 다시 그림)과 시즌 2(새로운 세계 · 항해도 · 비공정)는 lib/cardSkins 의 SVG 문자열 함수를 그대로 쓴다 — 봇 카드와 한 벌
//    등급 색(카드 오른쪽 위 번지는 빛 · 링 · 문장)과 헷갈리지 않게 카드를 넓게 번지는 빛으로 칠하지 않는다 — 선 · 점 · 무늬 · 작은 장식만.
//    아바타(왼쪽 위)와 글자 뒤에는 옅게, 진한 장식은 가장자리 · 모서리(오른쪽 위 · 아래쪽)에. 봇 이미지 카드(lib/botCards.js SKIN_DECO)와 같은 말.
//    부모는 relative overflow-hidden 이어야 한다. 크기를 재서 그리므로 처음 한 번은 비어 있다가 나타난다(자리를 차지하지 않아 아무것도 밀지 않는다)
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

// ctx — 카드 안 표시한 자리(px, 카드 기준). 없으면 null
//   lineY · lineX0 · lineX1: 스탯 위 가로선(data-skin-line) — 항해도 배 · 새로운 세계 섬이 이 선 위에(배 · 깃발 섬은 선의 시작)
//   barY · barBottom: 레벨 막대(data-skin-bar) 가운데 · 아래 — 항해도 항로가 이 막대를 넘어간다
//   goalY: 등급 줄(data-skin-goal) 위 — LEVEL 큰 숫자와 등급 사이 높이, 항해도 도착 ✕ 자리
//   avoidLeft · avoidBottom: 등급 줄 오른쪽 단추(data-skin-avoid, 레벨 페이지 '등급 안내') — ✕ 가 단추 뒤에 숨지 않게
export function deco(skin, w, h, ctx = {}) {
  // 📌 시즌 2 스킨 — 문자열 함수(lib/cardSkins)가 그린 SVG 를 그대로 얹는다(그림은 목록에 있는 key 로만 만든다 — 사용자 입력이 섞이지 않음)
  const s2 = Object.prototype.hasOwnProperty.call(STRING_SKINS, skin) ? STRING_SKINS[skin] : null;
  if (s2) {
    const d = s2.deco(w, h, 1, true, ctx);
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
      // 📌 2026-10-06 "오로라 카드도 약간의 카드 효과" — 빛줄이 차례로 밝아지며 살짝 늘어난다(왼쪽 → 오른쪽으로 흐르는 물결). 늦춤은 가로 자리로
      rays.push(<rect key={`r${x}`} className="sf-au-ray" style={{ animationDelay: `${-(r1((x / w) * 4.8))}s` }} x={r1(x - 0.9)} y={r1(y0)} width="1.8" height={r1(len)} fill={`url(#sf-ray-${band})`} />);
    }
    const stars = [];
    for (let n = 0; n < 22; n++) {
      const x = o + 10 + rand() * (w - o * 2 - 20);
      const y = o + 14 + rand() * (h * 0.55);
      if (inAvatar(x, y)) continue;
      // 별 절반은 반짝인다(늦춤 제각각)
      stars.push(<circle key={`s${n}`} className={n % 2 ? "sf-au-tw" : undefined} style={n % 2 ? { animationDelay: `${-(n % 7) * 0.45}s` } : undefined} cx={r1(x)} cy={r1(y)} r={r1(0.6 + rand() * 0.9)} fill="#ffffff" fillOpacity={r1(0.2 + rand() * 0.4)} />);
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
          {/* 움직임 — 빛줄 물결 · 별 반짝 · 물결선 흔들림. 움직임 줄이기 설정이면 멈춘다 */}
          <style>{`@keyframes sfAuRay{0%,100%{opacity:.4;transform:scaleY(.72)}50%{opacity:1;transform:scaleY(1.12)}}
.sf-au-ray{transform-box:fill-box;transform-origin:50% 0;animation:sfAuRay 4.8s ease-in-out infinite}
@keyframes sfAuTw{0%,100%{opacity:.25}50%{opacity:1}}.sf-au-tw{animation:sfAuTw 3.2s ease-in-out infinite}
@keyframes sfAuDrift{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}.sf-au-wave{animation:sfAuDrift 9s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.sf-au-ray,.sf-au-tw,.sf-au-wave{animation:none}}`}</style>
        </defs>
        {stars}
        {rays}
        <g className="sf-au-wave">
          <path d={wavePath(0)} fill="none" stroke="url(#sf-au)" strokeOpacity="0.55" strokeWidth="1.4" />
          <path d={wavePath(9)} fill="none" stroke="url(#sf-au)" strokeOpacity="0.25" strokeWidth="0.8" />
        </g>
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="url(#sf-au)" strokeOpacity="0.55" strokeWidth="1.5" />
        <path className="sf-au-tw" d={star4(w - 34, h - 36, 5) + star4(w - 48, h - 28, 2.6)} fill="#ffffff" fillOpacity="0.55" />
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
      // 스탯 위 선 — 숨겨져 있으면(폰에서 스탯을 접었을 때) 없음. 카드가 확대 · 축소돼 있어도(상품 미리보기) 카드 기준 px 로 바꾼다
      const c = el.getBoundingClientRect();
      const at = (sel) => {
        const n = el.parentElement?.querySelector(sel);
        if (!n || n.offsetParent === null || !(c.height > 0) || !(c.width > 0)) return null;
        const r = n.getBoundingClientRect();
        const sy = h / c.height, sx = w / c.width;
        return { top: Math.round((r.top - c.top) * sy), bottom: Math.round((r.bottom - c.top) * sy), left: Math.round((r.left - c.left) * sx), right: Math.round((r.right - c.left) * sx) };
      };
      const ln = at("[data-skin-line]"), bar = at("[data-skin-bar]"), goal = at("[data-skin-goal]"), avoid = at("[data-skin-avoid]");
      const next = {
        w, h,
        lineY: ln ? ln.top : null, lineX0: ln ? ln.left : null, lineX1: ln ? ln.right : null,
        barY: bar ? Math.round((bar.top + bar.bottom) / 2) : null, barBottom: bar ? bar.bottom : null,
        goalY: goal ? goal.top : null,
        avoidLeft: avoid ? avoid.left : null, avoidBottom: avoid ? avoid.bottom : null,
      };
      setBox((b) => (b && Object.keys(next).every((k) => b[k] === next[k]) ? b : next));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const body = box && box.w > 60 && box.h > 60 ? deco(skin, box.w, box.h, box) : null;
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
