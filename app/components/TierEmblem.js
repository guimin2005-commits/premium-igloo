"use client";

import { EMBLEM_BOX } from "@/lib/tierEmblemBox";

// 📌 등급 엠블럼 — 날개 도트 엠블럼(public/tier-emblems, scripts/gen-tier-emblems.mjs — 승급 화면과 같은 그림).
//    2026-10-10 운영자: 예전 육각 각인 대신 사이트 전체를 날개 도트로 → "사이트로 가면 너무 안 보여"(외곽이 검은 그림이라 어두운 바탕에 묻힘).
//    · 칸 판(20 · 24 · 32 · 48칸) 중 그 자리에서 가장 크게 들어가는 판을 반 칸 단위 배율로(칸이 또렷하게) — 같은 높이면 칸이 많은 판(모양이 덜 뭉개진다)
//    · 어두운 바탕(onDark, 기본)에는 뒤에 은은한 등급색 빛(운영자가 고른 "1 — 은은하게"). 흰 바탕에는 빛 없이(onDark={false})
//    ⚠️ 밝은 외곽선은 "개짜치잖아"로 반려 — 그림에 선을 두르지 않는다
//    자리: size × size 정사각 그대로(크기는 바꾸지 않는다 — 2026-10-10 "티어 표기 크기가 너무 커졌잖아"). 날개가 옆으로 넓은 그림은 좌우로 조금 넘친다(예전과 같은 1.3배까지)
//    빛도 자리 안쪽 가까이만(자리 × 1.3 · 1.1 까지) — 등급 칸 밖으로 번지지 않게

const RANK = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
const COLOR = { iron: "#8a8a8a", bronze: "#a06a3c", silver: "#8d99a6", gold: "#c39220", platinum: "#3f9e93", diamond: "#5a6ad8", master: "#8557b0", grandmaster: "#d8352a", challenger: "#2f9cf0", igloo: "#e0609e" }; // lib/voiceTiers 대표색
const FILE = { 20: "-20", 24: "-24", 32: "", 48: "-lg" };
const lighten = (hex, t) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  return `#${[1, 2, 3].map((i) => { const v = parseInt(m[i], 16); return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0"); }).join("")}`;
};

// 그 자리(size px)에 쓸 판 · 배율 — 너비는 size × 1.3, 높이는 size 까지(예전 그림 크기를 넘지 않게)
function pick(key, size) {
  const ns = size >= 28 ? [48, 32] : size >= 18 ? [32, 24] : [32, 24, 20];
  let best = null;
  for (const n of ns) {
    const [x, y, w, h] = EMBLEM_BOX[key][n];
    const fit = Math.min((size * 1.3) / w, size / h);
    const s = fit >= 1 ? Math.floor(fit * 2) / 2 : n === 48 && fit >= 0.75 ? fit : 0; // 48칸 판만 1배 아래로 줄여도 된다(높은 등급의 큰 그림)
    if (!s) continue;
    if (!best || h * s > best.H || (h * s === best.H && n > best.n)) best = { n, s, x, y, w, h, H: h * s };
  }
  if (!best) { const n = ns[ns.length - 1], [x, y, w, h] = EMBLEM_BOX[key][n]; best = { n, s: 1, x, y, w, h, H: h }; }
  return best;
}

/** 등급 엠블럼 · tier = VOICE_TIERS 항목 · onDark: 어두운 바탕(뒤에 은은한 빛) */
export default function TierEmblem({ tier, size = 24, className = "", muted = false, onDark = true }) {
  const key = RANK.includes(tier?.key) ? tier.key : "iron";
  const p = pick(key, size);
  const W = Math.round(p.w * p.s), H = Math.round(p.h * p.s);
  const c = COLOR[key];
  const glowW = Math.round(Math.min(Math.max(W, H) * 1.5, size * 1.3)), glowH = Math.round(Math.min(Math.max(W, H) * 1.25, size * 1.1));
  return (
    <span
      aria-hidden
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, overflow: "visible", opacity: muted ? 0.45 : 1 }}
    >
      {onDark && (
        <span
          className="absolute left-1/2 top-1/2 rounded-full pointer-events-none"
          style={{ width: glowW, height: glowH, transform: "translate(-50%, -50%)", background: `radial-gradient(closest-side, ${lighten(c, 0.55)}5c 0%, ${lighten(c, 0.15)}26 55%, transparent 100%)` }}
        />
      )}
      <svg width={W} height={H} viewBox={`${p.x} ${p.y} ${p.w} ${p.h}`} className="relative shrink-0" style={{ overflow: "visible" }}>
        <image href={`/tier-emblems/${key}${FILE[p.n]}.svg`} x="0" y="0" width={p.n} height={p.n} />
      </svg>
    </span>
  );
}
