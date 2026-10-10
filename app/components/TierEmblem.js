"use client";

// 📌 등급 엠블럼 — 날개 도트 엠블럼(public/tier-emblems/<키>.svg · <키>-lg.svg, scripts/gen-tier-emblems.mjs — 승급 화면과 같은 그림).
//    2026-10-10 운영자: 예전 육각 각인(2026-09 시안 A) 대신 사이트 전체를 날개 도트로.
//    그림은 32칸(큰 크기는 48칸 -lg) 안에 작게 들어 있어 등급마다 그림 영역(BOX)만 잘라 크게 보인다.
//    자리(레이아웃)는 지금처럼 size × size 정사각 — 날개가 옆으로 넓은 아래 등급은 좌우로 조금 넘친다(overflow visible).

const RANK = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
// 그림 영역 [x, y, 너비, 높이](칸) — s: <키>.svg(32칸), lg: <키>-lg.svg(48칸). 그림을 다시 찍으면 같이 고칠 것
const BOX = {
  iron: { s: [9, 16, 14, 7], lg: [15, 25, 18, 9] },
  bronze: { s: [7, 15, 18, 9], lg: [11, 23, 26, 13] },
  silver: { s: [7, 15, 18, 9], lg: [10, 21, 28, 15] },
  gold: { s: [6, 14, 20, 11], lg: [10, 19, 28, 18] },
  platinum: { s: [6, 13, 20, 12], lg: [10, 20, 28, 17] },
  diamond: { s: [6, 12, 20, 13], lg: [9, 18, 30, 20] },
  master: { s: [6, 8, 20, 17], lg: [9, 13, 30, 25] },
  grandmaster: { s: [5, 8, 22, 18], lg: [8, 11, 32, 28] },
  challenger: { s: [5, 5, 22, 21], lg: [7, 7, 34, 32] },
  igloo: { s: [4, 7, 24, 19], lg: [6, 9, 36, 31] },
};
const WIDE = 1.3; // 옆으로 넓은 날개는 자리 너비의 1.3배까지 쓴다(넘친 만큼은 좌우로)
const LG_FROM = 44; // 이 크기(px)부터 48칸 그림 — 작은 크기는 칸이 굵은 32칸이 또렷하다

/** 등급 엠블럼 · tier = VOICE_TIERS 항목 */
export default function TierEmblem({ tier, size = 24, className = "", muted = false }) {
  const key = RANK.includes(tier?.key) ? tier.key : "iron";
  const lg = size >= LG_FROM;
  const [x, y, w, h] = BOX[key][lg ? "lg" : "s"];
  // 자리(정사각)에 맞춘 보기 창 — 그림 높이를 꽉 채우되, 너비가 WIDE 를 넘으면 너비 기준으로 줄인다
  const side = Math.max(h, w / WIDE);
  const vx = x + w / 2 - side / 2, vy = y + h / 2 - side / 2;
  const grid = lg ? 48 : 32;
  return (
    <svg
      viewBox={`${vx} ${vy} ${side} ${side}`}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ opacity: muted ? 0.45 : 1, overflow: "visible" }}
      aria-hidden
    >
      <image href={`/tier-emblems/${key}${lg ? "-lg" : ""}.svg`} x="0" y="0" width={grid} height={grid} style={{ imageRendering: "pixelated" }} />
    </svg>
  );
}
