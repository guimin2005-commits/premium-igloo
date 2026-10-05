// 크림슨 — 카드 스킨 중 가장 비싼 한 벌(2026-10-05 "골드에 비해 안 예쁘다 — 비싼 값을 하는 디자인")을 도트로 다시 그렸다.
//   금 테를 두른 진홍 벨벳 액자(판마다 금 징 · 위 · 왼쪽 밝게 / 아래 · 오른쪽 어둡게)
//   + 네 모서리 금 받침에 박힌 루비(면마다 다른 빛 · 흰 반짝임) + 받침에서 테를 따라 뻗은 금 가지 · 매듭
//   + 위 가운데 루비 문장 + 아래 가운데 큰 루비 문장 + 바닥 테에서 타오르는 3단 도트 불꽃(빨강 → 주황 → 노랑 · 흰 심지)
//   + 떠오르는 도트 불씨. 사이트(site)는 불꽃이 두 장면으로 일렁이고 불씨가 천천히 떠오른다(움직임 줄이기 설정이면 멈춤).
//   등급 색(오른쪽 위 번지는 빛)과 헷갈리지 않게 카드를 칠하지 않는다 — 가장자리 · 모서리의 도트만.
export const meta = { key: "crimson", label: "크림슨", grid: "hatch", tint: "#ff5a76", gridOp: 0.045 };

export const C = {
  k: "#1a0610", // 이음매 그늘
  o: "#3b0d2c", // 진홍 실루엣
  r: "#6e0c2a", // 진홍 그늘
  m: "#b3123a", // 진홍
  M: "#e2263f", // 진홍 빛
  R: "#931a45", // 루비 깊은 면
  l: "#ff6a4f", // 루비 밝은 면
  p: "#ffbf94", // 루비 하이라이트
  w: "#ffffff", // 반짝임
  n: "#4c1f1c", // 금 실루엣
  d: "#c0651a", // 금 그늘
  g: "#fbbd2a", // 금
  G: "#ffdd45", // 금 빛
  h: "#fff7b0", // 금 반짝
  f: "#f2731f", // 불 주황
  F: "#ffae3c", // 불 호박
  e: "#ffe48c", // 불 노랑
};

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// 색별 경로 모음 — 한 겹(layer)을 한 번에 그린다. 같은 칸에 나중 것이 덮는다(그리는 순서 = 색 순서가 아니라 칸 지도로 정리)
class Layer {
  constructor() { this.cells = new Map(); }
  cell(ch, x, y, w, h) { if (C[ch]) this.cells.set(`${x},${y},${w},${h}`, ch); }
  svg(op = 1, cls = "") {
    const by = {};
    for (const [k, ch] of this.cells) { const [x, y, w, h] = k.split(","); (by[ch] ||= []).push(R(x, y, w, h)); }
    const body = Object.entries(by).map(([ch, a]) => `<path d="${a.join("")}" fill="${C[ch]}"/>`).join("");
    return body ? `<g shape-rendering="crispEdges"${op < 1 ? ` opacity="${op}"` : ""}${cls ? ` class="${cls}"` : ""}>${body}</g>` : "";
  }
}

// ── 루비 받침 — 금 마름모 받침(반지름 rb) 안에 루비(반지름 rr). 칸 좌표(dx, dy)로 색을 고른다(빛은 왼쪽 위) ──
function jewel(rb, rr) {
  const out = [];
  for (let dy = -rb; dy <= rb; dy++) for (let dx = -rb; dx <= rb; dx++) {
    const d = Math.abs(dx) + Math.abs(dy);
    if (d > rb) continue;
    const s = dx + dy; // 음수 = 왼쪽 위(빛)
    let ch;
    if (d === rb) ch = "n";
    else if (d > rr) ch = d === rr + 1 ? (s < 0 ? "G" : s > 0 ? "d" : "g") : s < -1 ? "h" : s < 0 ? "G" : s > 1 ? "d" : "g";
    else if (d === rr) ch = "o";
    else if ((dx === -1 && dy === -2) || (dx === -2 && dy === -1)) ch = "w";
    else if (dx === -1 && dy === -1) ch = "p";
    else if (s <= -2) ch = "l";
    else if (s >= 2) ch = "R";
    else if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) ch = "M";
    else ch = s < 0 ? "M" : "m";
    out.push([dx, dy, ch]);
  }
  return out;
}

// ── 도트 불꽃 — 혀(가운데 칸 cx, 높이 ht, 밑동 반폭 hw, 기울기 lean) 여럿을 겹친다.
//    칸마다 가장자리까지 남은 칸 수로 색을 고른다: 바깥 진홍 → 빨강 → 주황 → 호박 → 노랑(심지) ──
function flameCells(tongues, cols) {
  const depth = new Map(); // "i,j" → 가장자리까지 깊이(가장 깊은 혀 기준)
  for (const t of tongues) {
    for (let j = 0; j < t.ht; j++) {
      const u = j / t.ht; // 0 바닥 · 1 끝
      const half = t.hw * Math.pow(1 - u, 0.8);
      const c = t.cx + t.lean * u * u;
      const i0 = Math.ceil(c - half), i1 = Math.floor(c + half);
      for (let i = i0; i <= i1; i++) {
        if (i < 0 || i >= cols) continue;
        const dd = Math.min(i - (c - half), c + half - i, (t.ht - j) * 0.6) + 0.5;
        const k = `${i},${j}`;
        if (!depth.has(k) || depth.get(k) < dd) depth.set(k, dd);
      }
    }
  }
  const out = [];
  for (const [k, dd] of depth) {
    const [i, j] = k.split(",").map(Number);
    const ch = dd < 1.1 ? "r" : dd < 2 ? "m" : dd < 2.8 ? "M" : dd < 3.6 ? "f" : dd < 4.4 ? "F" : "e";
    out.push([i, j, ch]);
  }
  return out;
}

export function deco(w, h, S, site) {
  const rand = seeded(23);
  const P = Math.max(2, Math.round(2 * S)); // 액자 칸(사이트 2px · 봇 4px)
  const Q = site ? 2 : Math.round(2 * S); // 장식 칸(사이트 2px · 봇 4px)
  const o = site ? 12 : 20; // 봇은 모서리 루비가 그림 끝에 잘리지 않게 테를 안쪽으로
  const band = 5;
  const B = band * P;
  const cols = Math.floor((w - o * 2) / P);
  const rows = Math.floor((h - o * 2) / P);
  const X = (i) => o + i * P;
  const Y = (j) => o + j * P;
  const snap = (v) => Math.round(v);

  // ── 금 테 두른 진홍 벨벳 액자 ── 단면(바깥 → 안): 금 · 진홍 빛 · 진홍 · 진홍 그늘 · 금
  const fr = new Layer();
  const lit = ["G", "m", "R", "r", "d"]; // 위 · 왼쪽 (바깥 → 안)
  const dim = ["d", "r", "r", "R", "g"]; // 아래 · 오른쪽 (바깥 → 안)
  const stud = (x, y) => { // 금 징 — 3칸 마름모
    fr.cell("h", x, y - P, P, P); fr.cell("G", x - P, y, P, P); fr.cell("g", x, y, P, P); fr.cell("d", x + P, y, P, P); fr.cell("d", x, y + P, P, P);
  };
  const step = Math.round((44 * S) / P);
  for (const top of [true, false]) {
    const j0 = top ? 0 : rows - band;
    for (let i = 0; i < cols; i++) for (let k = 0; k < band; k++) fr.cell((top ? lit : dim)[top ? k : band - 1 - k], X(i), Y(j0 + k), P, P);
    for (let i = band + step; i < cols - band - 3; i += step) { stud(X(i), Y(j0 + 2)); fr.cell("M", X(i - Math.round(step / 2)), Y(j0 + 2), P, P); }
  }
  for (const left of [true, false]) {
    const i0 = left ? 0 : cols - band;
    for (let j = band; j < rows - band; j++) for (let k = 0; k < band; k++) fr.cell((left ? lit : dim)[left ? k : band - 1 - k], X(i0 + k), Y(j), P, P);
    for (let j = band + step; j < rows - band - 3; j += step) { stud(X(i0 + 2), Y(j)); fr.cell("M", X(i0 + 2), Y(j - Math.round(step / 2)), P, P); }
  }
  // 모서리 이음 — 금 테가 모서리에서 끊기지 않게(바깥 · 안쪽 금 줄을 모서리 칸까지)
  for (const [i0, j0] of [[0, 0], [cols - band, 0], [0, rows - band], [cols - band, rows - band]]) {
    for (let a = 0; a < band; a++) for (let b = 0; b < band; b++) {
      const edge = a === 0 || b === 0 || a === band - 1 || b === band - 1;
      const right = i0 > 0, bottom = j0 > 0;
      fr.cell(edge ? (right || bottom ? "d" : "G") : "r", X(i0 + a), Y(j0 + b), P, P);
    }
  }

  // ── 루비 받침 · 금 가지 ──
  const jw = new Layer();
  // 칸 (dx, dy) — 가운데(cx, cy)를 칸 한가운데로 두는 좌표
  const at = (cx, cy, dx, dy, q, ch) => jw.cell(ch, snap(cx + dx * q - q / 2), snap(cy + dy * q - q / 2), q, q);
  const putJewel = (cx, cy, rb, rr, q) => { for (const [dx, dy, ch] of jewel(rb, rr)) at(cx, cy, dx, dy, q, ch); };
  // 받침에서 테를 따라 뻗는 금 가지 — 굵기 3칸(빛 · 금 · 그늘) + 양쪽 실루엣, 세 칸마다 반짝. 끝은 작은 매듭
  const arm = (cx, cy, [ux, uy], len, q, from = 1) => {
    for (let s = from; s < from + len; s++) {
      const sec = ["n", s % 3 === 0 ? "h" : "G", "g", "d", "n"];
      for (let k = -2; k <= 2; k++) at(cx, cy, ux ? ux * s : k, ux ? k : uy * s, q, sec[k + 2]);
    }
    const e = from + len + 1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const d = Math.abs(dx) + Math.abs(dy);
      if (d > 2) continue;
      at(cx, cy, (ux || 0) * e + dx, (uy || 0) * e + dy, q, d === 2 ? "n" : dx + dy < 0 ? "h" : dx + dy > 0 ? "d" : "G");
    }
  };
  const mid = o + B / 2; // 테 가운데 줄
  const cq = Q;
  const corners = [[mid, mid, 1, 1], [w - mid, mid, -1, 1], [mid, h - mid, 1, -1], [w - mid, h - mid, -1, -1]];
  const armLen = site ? 7 : 10;
  for (const [cx, cy, sx, sy] of corners) {
    arm(cx, cy, [sx, 0], armLen, cq, 6);
    arm(cx, cy, [0, sy], armLen, cq, 6);
  }
  for (const [cx, cy] of corners) putJewel(cx, cy, 7, 4, cq);
  // 위 · 아래 가운데 문장 — 큰 루비, 양옆으로 금 가지와 작은 루비
  for (const [cy, big] of [[mid, site ? 8 : 7], [h - mid, site ? 9 : 7]]) {
    for (const sx of [1, -1]) {
      arm(w / 2, cy, [sx, 0], site ? 6 : 12, cq, big);
      putJewel(w / 2 + sx * (big + (site ? 6 : 12) + 5) * cq, cy, 4, 2, cq);
    }
    putJewel(w / 2, cy, big, big - 3, cq);
  }

  // ── 바닥 불꽃(두 장면 — 사이트는 번갈아 보이며 일렁인다) ──
  // 불꽃 칸 = Q. 바닥 = 아래 테 안쪽 금 줄. 가운데는 낮게(사이트는 스탯 아래 · 봇은 레벨 막대 아래), 모서리 쪽은 높게
  const fq = Q;
  const fcols = Math.floor((w - o * 2 - B * 2) / fq);
  const fx0 = o + B + Math.floor(((w - o * 2 - B * 2) - fcols * fq) / 2);
  const fbase = h - o - B; // 불꽃 바닥선(이 줄 위로 자란다)
  const lowH = site ? 4 : 4; // 가운데 혀 높이(칸) — 봇은 레벨 막대 · Lv 글자 아래로
  const highH = site ? 8 : 9; // 모서리 혀 높이(칸)
  const flameFrame = (seed) => {
    const fr2 = seeded(seed);
    const tongues = [];
    for (let i = 1; i < fcols - 1; i += 3 + Math.floor(fr2() * 2)) {
      const t = Math.abs(i / (fcols - 1) - 0.5) * 2; // 0 가운데 · 1 끝
      const e0 = site ? 0.7 : 0.88; // 높은 혀는 양끝(봇은 Lv 글자 바깥)만
      const edge = Math.pow(Math.max(0, t - e0) / (1 - e0), 1.4);
      const ht = Math.round(lowH * (0.55 + fr2() * 0.6) + (highH - lowH) * edge * (0.75 + fr2() * 0.35));
      tongues.push({ cx: i, ht: Math.max(3, ht), hw: 2.2 + fr2() * 1.6 + edge * 1.2, lean: (fr2() - 0.5) * 3 });
    }
    const L = new Layer();
    for (const [i, j, ch] of flameCells(tongues, fcols)) L.cell(ch, fx0 + i * fq, fbase - (j + 1) * fq, fq, fq);
    return L;
  };
  const flA = flameFrame(101);
  const flB = flameFrame(202);

  // ── 불씨 — 아래쪽에 많이, 위로 갈수록 드물고 옅게. 사이트는 천천히 떠오른다 ──
  const emb = [];
  const ecols = ["e", "F", "f", "M"];
  const nE = site ? 26 : 40;
  // 양옆 테 안쪽 좁은 길에서만 피어오른다 — 가운데는 글자 · 레벨 막대 자리라 비운다
  const laneW = site ? 10 : 30;
  for (let n = 0; n < nE; n++) {
    const side = rand() < 0.5;
    const t = rand(); // 0 위 · 1 아래 — 아래일수록 진하다
    const x = side ? o + B + 2 + rand() * laneW : w - o - B - 2 - rand() * laneW;
    const y = h * (site ? 0.45 : 0.3) + t * (h * (site ? 0.55 : 0.7) - o - B - 20);
    const sz = rand() < 0.25 ? 2 : 1;
    emb.push({ x: snap(x), y: snap(y), s: sz * Q, ch: ecols[n % ecols.length], op: 0.35 + t * 0.55, d: (rand() * 6).toFixed(2), dur: (4 + rand() * 3).toFixed(2) });
  }
  const embSvg = emb.map((e) => `<rect x="${e.x}" y="${e.y}" width="${e.s}" height="${e.s}" fill="${C[e.ch]}" fill-opacity="${e.op.toFixed(2)}"${site ? ` class="crimson-em" style="animation-delay:-${e.d}s;animation-duration:${e.dur}s"` : ""}/>`).join("");

  // ── 사이트 바탕 — 진홍 다이아 격자(아주 옅게) + 움직임 ──
  const defs = site
    ? `<pattern id="crimson-dm" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M8 3h1v1h-1zM7 4h1v1h-1zM9 4h1v1h-1zM8 5h1v1h-1z" fill="#ff5a76" fill-opacity="0.13"/></pattern>` +
      `<style>@keyframes crimsonRise{0%{transform:translateY(0);opacity:0}18%{opacity:1}100%{transform:translateY(-46px);opacity:0}}` +
      `@keyframes crimsonA{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes crimsonB{0%,49.9%{opacity:0}50%,100%{opacity:1}}` +
      `.crimson-em{animation:crimsonRise 5s linear infinite}.crimson-fa{animation:crimsonA .9s infinite}.crimson-fb{animation:crimsonB .9s infinite}` +
      `@media (prefers-reduced-motion:reduce){.crimson-em,.crimson-fa,.crimson-fb{animation:none}}</style>`
    : "";
  const under = (site ? `<rect width="${w}" height="${h}" fill="url(#crimson-dm)"/>` : "") + embSvg +
    // 두 번째 장면은 처음엔 숨겨 둔다(opacity 0) — 움직임이 꺼져 있거나 CSS 를 모르는 곳에서는 첫 장면만 보인다
    `<g opacity="0.92">${site ? `<g class="crimson-fa">${flA.svg()}</g><g class="crimson-fb" opacity="0">${flB.svg()}</g>` : flA.svg()}</g>`;
  const over = fr.svg(0.9) + jw.svg(0.97);
  return { defs, under, over };
}
