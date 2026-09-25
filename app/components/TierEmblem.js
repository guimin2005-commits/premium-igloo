"use client";

import { useId } from "react";

// 📌 등급 엠블럼 — 육각 각인 (2026-09 시안 A 채택).
//    열 등급이 같은 육각 틀을 쓰고, 안쪽 표식이 한 단계씩 올라간다:
//    줄 → 갈매기 1·2·3 → 보석 테 → 보석 → 별 → 별(중심) → 왕관 → 왕관(보석).
//    마스터부터 바깥 테, 그랜드마스터부터 양옆 날개, 챌린저부터 머리 보석이 붙는다.
//    확대해도 싸 보이지 않게: 금속 결 그라데이션 · 위가 밝고 아래가 어두운 테 · 한 단 파인 안쪽 판 ·
//    부드러운 광택(딱딱한 면 음영 대신) · 표식의 얕은 그림자.
//    색은 등급색(tier.c) 하나에서 밝히고 어둡혀 만든다. 한 화면에 여럿 그려도 그라데이션 id 가 겹치지 않게 useId 를 쓴다.

const mix = (hex, t, toWhite) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  const f = (h) => {
    const v = parseInt(h, 16);
    return Math.round(v + ((toWhite ? 255 : 0) - v) * t).toString(16).padStart(2, "0");
  };
  return `#${f(m[1])}${f(m[2])}${f(m[3])}`;
};

// 꼭짓점이 위인 육각 — 중심 (24, 25)
const hex = (r) =>
  [-90, -30, 30, 90, 150, 210]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      return `${(24 + r * Math.cos(rad)).toFixed(2)},${(25 + r * Math.sin(rad)).toFixed(2)}`;
    })
    .join(" ");
const BODY = hex(19);
const RIM = hex(18.2);
const FIELD = hex(14.6);
const OUTER = hex(22.2);

const STAR = "M24 13.6l2.7 8.7 8.7 2.7-8.7 2.7L24 36.4l-2.7-8.7-8.7-2.7 8.7-2.7z";
const CROWN = "M15.2 31.4V19.8l4.9 4.5 3.9-7 3.9 7 4.9-4.5v11.6z";

// 표식 — fill 은 흰 면, stroke 는 흰 선. 그림자는 같은 모양을 어두운 색으로 한 번 더 그린다
const glyph = (key, ink, accent) => {
  const line = { fill: "none", stroke: ink, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (key) {
    case "iron":
      return <path d="M17.6 25h12.8" {...line} strokeWidth="2.8" />;
    case "bronze":
      return <path d="M17.2 28.2 24 21.4l6.8 6.8" {...line} strokeWidth="2.8" />;
    case "silver":
      return <path d="M17.6 24.6 24 18.2l6.4 6.4M17.6 31 24 24.6l6.4 6.4" {...line} strokeWidth="2.7" />;
    case "gold":
      return <path d="M18.6 21.6 24 16.2l5.4 5.4M18.6 27.4 24 22l5.4 5.4M18.6 33.2 24 27.8l5.4 5.4" {...line} strokeWidth="2.4" />;
    case "platinum":
      return <path d="M24 16 32.2 25 24 34 15.8 25z" {...line} strokeWidth="2.5" />;
    case "diamond":
      return (
        <>
          <path d="M24 15.2 33 25 24 34.8 15 25z" fill={ink} />
          {accent && <path d="M15 25h18M24 15.2 20.9 25 24 34.8 27.1 25z" fill="none" stroke={accent} strokeWidth="1" opacity="0.5" />}
        </>
      );
    case "master":
      return <path d={STAR} fill={ink} />;
    case "grandmaster":
      return (
        <>
          <path d={STAR} fill={ink} />
          {accent && <circle cx="24" cy="25" r="2.1" fill={accent} />}
        </>
      );
    case "challenger":
      return <path d={CROWN} fill={ink} />;
    case "igloo":
      return (
        <>
          <path d={CROWN} fill={ink} />
          {accent && <path d="M24 23.2l2.1 2.3-2.1 2.3-2.1-2.3z" fill={accent} />}
        </>
      );
    default:
      return null;
  }
};

const RANK = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];

/** 등급 엠블럼 · tier = VOICE_TIERS 항목 */
export default function TierEmblem({ tier, size = 24, className = "", muted = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const key = RANK.includes(tier?.key) ? tier.key : "iron";
  const r = RANK.indexOf(key);
  const c = tier?.c || "#8a8a8a";
  const hi = mix(c, 0.5, true);
  const light = mix(c, 0.62, true);
  const lo = mix(c, 0.32, false);
  const deep = mix(c, 0.55, false);
  const id = (n) => `te-${n}-${uid}`;

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ opacity: muted ? 0.45 : 1, overflow: "visible" }}
      aria-hidden
    >
      <defs>
        {/* 몸통 — 금속 결 */}
        <linearGradient id={id("metal")} x1="0.15" y1="0" x2="0.55" y2="1">
          <stop offset="0%" stopColor={hi} />
          <stop offset="48%" stopColor={c} />
          <stop offset="100%" stopColor={lo} />
        </linearGradient>
        {/* 테 · 날개 · 머리 보석 — 위는 밝고 아래는 어둡다 */}
        <linearGradient id={id("rim")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={mix(c, 0.15, true)} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
        {/* 안쪽 판 — 한 단 파여 위가 어둡다 */}
        <linearGradient id={id("field")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix(c, 0.22, false)} />
          <stop offset="100%" stopColor={mix(c, 0.06, true)} />
        </linearGradient>
        {/* 광택 — 왼쪽 위에서 번지는 부드러운 빛 */}
        <radialGradient id={id("shine")} cx="0.32" cy="0.18" r="0.72">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 그랜드마스터부터 — 양옆 칼날 날개 */}
      {r >= 7 && (
        <>
          <path d="M7.4 16.4 0.9 25l6.5 8.6-1.9-8.6z" fill={`url(#${id("rim")})`} />
          <path d="M40.6 16.4 47.1 25l-6.5 8.6 1.9-8.6z" fill={`url(#${id("rim")})`} />
        </>
      )}
      {/* 마스터부터 — 바깥 테 */}
      {r >= 6 && <polygon points={OUTER} fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1.3" strokeLinejoin="round" />}

      {/* 몸통 · 테 · 안쪽 판 · 광택 */}
      <polygon points={BODY} fill={`url(#${id("metal")})`} strokeLinejoin="round" />
      <polygon points={RIM} fill="none" stroke={`url(#${id("rim")})`} strokeWidth="1.4" strokeLinejoin="round" />
      <polygon points={FIELD} fill={`url(#${id("field")})`} stroke={deep} strokeOpacity="0.55" strokeWidth="0.9" strokeLinejoin="round" />
      <polygon points={BODY} fill={`url(#${id("shine")})`} />

      {/* 챌린저부터 — 머리 보석 */}
      {r >= 8 && (
        <>
          <path d="M24 0.6 27.4 3.9 24 7.4 20.6 3.9z" fill={`url(#${id("rim")})`} />
          <path d="M20.6 3.9h6.8M24 0.6v6.8" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.7" />
        </>
      )}

      {/* 표식 — 얕은 그림자 위에 흰 표식 */}
      <g transform="translate(0 0.9)" opacity="0.55">{glyph(key, deep, null)}</g>
      {glyph(key, "#ffffff", c)}
    </svg>
  );
}
