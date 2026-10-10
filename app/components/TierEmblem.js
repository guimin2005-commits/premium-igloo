"use client";

import { EMBLEM_BOX, EMBLEM_MID } from "@/lib/tierEmblemBox";

// 📌 등급 엠블럼 — 날개 도트 엠블럼(public/tier-emblems, scripts/gen-tier-emblems.mjs — 승급 화면과 같은 그림).
//    2026-10-10 운영자: 예전 육각 각인 대신 사이트 전체를 날개 도트로 → "사이트로 가면 너무 안 보여"(외곽이 검은 그림이라 어두운 바탕에 묻힘).
//    · 📌 판은 늘 48칸 하나(디스코드 카드 lib/botCards emblemSvg 와 같다) — 32 · 24 · 20칸 판은 같은 그림을 작게 다시 찍은 것이라 고티어(챌린저 · 이글루)는
//      모양이 꽤 달라 자리마다 엠블럼이 달라 보였다(2026-10-10 "동일해야지").
//    · 📌 등급마다 자기 그림이 자리(너비 size × 1.3 · 높이 size)에 꽉 차는 배율 그대로 — 반 칸 단위로 끊으면 같은 32px 에서 브론즈(1.5배)가 실버(1배)보다 커지는 등
//      들쭉날쭉했고("뒤죽박죽"), 모든 등급을 같은 배율로 하면 브 · 실 · 골 · 플이 너무 작았다("너무 작잖아"). 아이언만 브론즈 배율(꽉 채우면 칸이 뚱뚱해진다)
//    · 📌 그림은 칸 1개 = 1px PNG(<키>-48.png)를 image-rendering: pixelated 로 — SVG 를 1배 아래로 줄이면 크롬이 칸 가장자리를 섞어 흐렸다("어떤 건 흐리고 어떤 건 선명하고")
//    · 📌 세로는 눈으로 보이는 가운데(EMBLEM_MID — 밝은 칸 무게중심)를 자리 가운데에("코드 중앙과 시각적 중앙은 다르다")
//    · 어두운 바탕(onDark, 기본)에는 뒤에 은은한 등급색 빛(운영자가 고른 "1 — 은은하게"). 흰 바탕에는 빛 없이(onDark={false})
//    ⚠️ 밝은 외곽선은 "개짜치잖아"로 반려 — 그림에 선을 두르지 않는다
//    자리: size × size 정사각 그대로(크기는 바꾸지 않는다 — 2026-10-10 "티어 표기 크기가 너무 커졌잖아"). 날개가 옆으로 넓은 그림은 좌우로 조금 넘친다(예전과 같은 1.3배까지)
//    빛도 자리 안쪽 가까이만(자리 × 1.3 · 1.1 까지) — 등급 칸 밖으로 번지지 않게

const RANK = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
const COLOR = { iron: "#8a8a8a", bronze: "#a06a3c", silver: "#8d99a6", gold: "#c39220", platinum: "#3f9e93", diamond: "#5a6ad8", master: "#8557b0", grandmaster: "#d8352a", challenger: "#2f9cf0", igloo: "#e0609e" }; // lib/voiceTiers 대표색
const lighten = (hex, t) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  return `#${[1, 2, 3].map((i) => { const v = parseInt(m[i], 16); return Math.round(v + (255 - v) * t).toString(16).padStart(2, "0"); }).join("")}`;
};

// 그 자리(size px)에 쓸 배율 — 그림 상자가 너비 size × 1.3 · 높이 size 안에 꽉 차게(PNG 를 pixelated 로 키우고 줄여 어떤 배율이든 칸이 섞이지 않는다)
const N = 48;
const scaleOf = (key, size) => { const [, , w, h] = EMBLEM_BOX[key === "iron" ? "bronze" : key][N]; return Math.min((size * 1.3) / w, size / h); };

/** 등급 엠블럼 · tier = VOICE_TIERS 항목 · onDark: 어두운 바탕(뒤에 은은한 빛) */
export default function TierEmblem({ tier, size = 24, className = "", muted = false, onDark = true }) {
  const key = RANK.includes(tier?.key) ? tier.key : "iron";
  const sc = scaleOf(key, size), [bx, by, bw, bh] = EMBLEM_BOX[key][N];
  const W = Math.round(bw * sc), H = Math.round(bh * sc);
  // 눈 가운데로 옮길 만큼(px) — 그림 상자 가운데 − 밝기 무게중심. 자리(size) 밖으로는 안 나가게
  const mid = EMBLEM_MID?.[key]?.[N]?.[1];
  const dy = mid == null ? 0 : Math.max(-(size - H) / 2, Math.min((size - H) / 2, Math.round((by + bh / 2 - mid) * sc * 2) / 2));
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
      <span className="relative shrink-0 overflow-hidden" style={{ width: W, height: H, transform: dy ? `translateY(${dy}px)` : undefined }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/tier-emblems/${key}-48.png`} alt="" draggable={false}
          style={{ position: "absolute", left: -bx * sc, top: -by * sc, width: N * sc, height: N * sc, maxWidth: "none", imageRendering: "pixelated" }} />
      </span>
    </span>
  );
}
