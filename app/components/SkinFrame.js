"use client";

import { useEffect, useRef, useState } from "react";

// 📌 카드 스킨 장식 — 레벨 페이지 프로필 카드(잉크 판)에 착용한 카드 스킨을 옅게 얹는다.
//    봇 이미지 카드(lib/botCards.js SKIN_DECO)와 같은 모양 말(골드 이중 테 + 모서리 마름모 · 오로라 가는 빛 선 + 테 · 아이스 픽셀 액자 ·
//    크림슨 모서리 꺾쇠 + 빗금)을 더 옅게. 등급 색(카드 오른쪽 위 빛 · 링 · 문장)과 헷갈리지 않게 카드를 번지는 빛으로 칠하지 않고
//    테두리 · 무늬로만 표시한다. 테 · 모서리 장식은 글자 여백(모바일 20px) 가장자리에 — 아바타 · 글자 뒤로 들어가지 않게.
//    부모는 relative overflow-hidden 이어야 한다. 크기를 재서 그리므로 처음 한 번은 비어 있다가 나타난다(자리를 차지하지 않아 아무것도 밀지 않는다)
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}Z`;

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

export function deco(skin, w, h) {
  const o = 12; // 바깥 테 여백 — 카드 모서리(24px 둥근 모서리) 안쪽
  if (skin === "gold") {
    const i = 19;
    const dia = (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`;
    return (
      <>
        <defs>
          <linearGradient id="sf-gd" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2={h}>
            <stop offset="0" stopColor="#f7de9c" /><stop offset="0.45" stopColor="#b8862b" /><stop offset="0.7" stopColor="#e9c46a" /><stop offset="1" stopColor="#9c6e1e" />
          </linearGradient>
        </defs>
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="url(#sf-gd)" strokeOpacity="0.75" strokeWidth="2" />
        <rect x={i} y={i} width={w - i * 2} height={h - i * 2} fill="none" stroke="#f0cf7e" strokeOpacity="0.18" strokeWidth="1" />
        <path d={[[i, i], [w - i, i], [i, h - i], [w - i, h - i]].map(([x, y]) => dia(x, y, 5)).join("")} fill="url(#sf-gd)" fillOpacity="0.85" />
      </>
    );
  }
  if (skin === "aurora") {
    // 가는 빛 선만 — 굵게 겹쳐 번지게 하면 등급 빛(플래티넘 · 다이아 · 마스터 색)처럼 보인다
    const ribbon = (d, a) => <path d={d} fill="none" stroke="url(#sf-au)" strokeWidth="2" strokeOpacity={(0.14 * a).toFixed(3)} />;
    return (
      <>
        <defs>
          <linearGradient id="sf-au" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
            <stop offset="0" stopColor="#2fe3a0" /><stop offset="0.5" stopColor="#38b4ff" /><stop offset="1" stopColor="#a879ff" />
          </linearGradient>
        </defs>
        {ribbon(`M-60 ${h * 0.07}C${w * 0.2} ${h * 0.0} ${w * 0.42} ${h * 0.12} ${w * 0.64} ${h * 0.05}S${w * 0.93} ${h * 0.0} ${w + 60} ${h * 0.06}`, 1)}
        {ribbon(`M-60 ${h * 0.13}C${w * 0.24} ${h * 0.06} ${w * 0.5} ${h * 0.16} ${w * 0.76} ${h * 0.09}S${w * 0.98} ${h * 0.07} ${w + 60} ${h * 0.11}`, 0.45)}
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="url(#sf-au)" strokeOpacity="0.55" strokeWidth="1.5" />
      </>
    );
  }
  if (skin === "ice") {
    // 바깥 픽셀 액자(12~16px) + 안쪽 가는 픽셀 선(18~20px) — 둘 다 글자 여백 안.
    //    봇 카드의 모서리 눈송이는 이 여백에 들어가지 않아(아바타 · 글자 뒤로 겹친다) 사이트에서는 그리지 않는다
    const outer = pixelFrame(w, h, o, 4, 2);
    const inner = pixelFrame(w, h, o + 6, 2, 2);
    return (
      <g shapeRendering="crispEdges">
        <path d={outer.lt} fill="#cdeeff" fillOpacity="0.6" />
        <path d={outer.rb} fill="#79b4d8" fillOpacity="0.55" />
        <path d={inner.lt + inner.rb} fill="#b4e3ff" fillOpacity="0.14" />
      </g>
    );
  }
  if (skin === "crimson") {
    const L = 36;
    const br =
      `M${o} ${o + L}V${o}H${o + L}M${w - o - L} ${o}H${w - o}V${o + L}` +
      `M${w - o} ${h - o - L}V${h - o}H${w - o - L}M${o + L} ${h - o}H${o}V${h - o - L}`;
    return (
      <>
        <defs>
          <pattern id="sf-hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="1" height="10" fill="#ff5a76" fillOpacity="0.05" />
          </pattern>
        </defs>
        <rect width={w} height={h} fill="url(#sf-hatch)" />
        <rect x={o} y={o} width={w - o * 2} height={h - o * 2} fill="none" stroke="#ff5a76" strokeOpacity="0.35" strokeWidth="1.2" />
        <path d={br} fill="none" stroke="#ff3a5c" strokeOpacity="0.85" strokeWidth="3" strokeLinecap="square" />
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
