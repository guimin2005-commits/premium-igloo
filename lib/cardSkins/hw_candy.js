// 📌 할로윈 시즌 카드 스킨 「사탕 가게」(hw_candy) — 2026-10-11 리뉴얼(운영자 "사탕 가게 카드는.. 좀 리뉴얼 좀 해라 복잡하고 어지러워" → 시안 A · B · C 중 "a 틀에 b c의 구조물을 합쳐", "c 구조물의 차양은 제외임")
//   시안 원본: .claude/mockups/halloween-final/candy-redesign(A · B · C · D.js, 사탕가게-3안.png · 사탕가게-D.png)
//   테두리(A) = 얇은 두 줄(바깥 분홍 · 안쪽 민트)에 16칸마다 크림 사선 두 칸 — 사탕 막대 줄무늬. 깜빡이는 점선 없음
//   + 네 모서리 작은 박하사탕 + 위 가운데 작은 포장 사탕
//   + 레벨 막대 오른쪽 끝 위 한 무리: 큰 유리 사탕 병(B — 자두빛 뚜껑 · 분홍 리본 · 사탕 2/3) + 왼쪽 앞에 줄무늬 컵 막대사탕 한 쌍(C, 작게)
//     바닥은 비운다(운영자 "다 올리던지"). 좁은 카드는 컵이 병 앞으로 들어와 등급 줄(오른쪽 끝 어림 lineX0 + 172)을 넘지 않는다
//   + 반짝이 둘(위 하늘 하나 · 병 어깨 하나) — 사이트만 천천히(움직임 줄이기면 멈춤)
//   캔디콘은 쓰지 않는다(운영자 "캔디콘 처분해"). 카드를 칠하거나 번지게 하지 않는다 — 도트 칸만. 아바타(왼쪽 위)는 모서리 사탕만.
//   봇 카드: 테 · 모서리 · 위 가운데 사탕만, 바닥 사탕 줄 없음. 병 · 컵 무리는 역할 지급 카드에만(hwFloor botFloorOpen)
import { floorLimit, sinkBy, behind, frameOut, botTopOpen, botFloorOpen } from "./hwFloor.js";

// floor: 막대가 없는 사이트 카드에서 오른쪽 아래 구석에 앉는 무리 높이(px). 막대가 있는 카드(레벨 페이지 · 상점 미리보기)는 바닥이 비어 0 과 같다
export const meta = { key: "hw_candy", label: "사탕 가게", grid: "dot", tint: "#ffc4dc", gridOp: 0.07, floor: 66 };

// 색 사다리 — [빛, 밝은, 바탕, 그늘, 외곽(가장 짙은 같은 색)]
const PK = ["#ffe6f0", "#ffb6d2", "#f584b0", "#c85685", "#5c1a3a"]; // 딸기 분홍
const MT = ["#e4fff5", "#a8f2d8", "#62d6b0", "#33a07f", "#0f4838"]; // 박하 민트
const CR = ["#ffffff", "#fff6e6", "#f2dfc0", "#d3b68a", "#5a3c22"]; // 크림
const LE = ["#fffad2", "#fff08c", "#ffd84e", "#dba42c", "#6b4810"]; // 레몬
const PU = ["#ecd6ff", "#c39af5", "#9a64de", "#6c3db0", "#2e1260"]; // 포도 보라
const OR = ["#ffd9a6", "#ffab55", "#ff8a33", "#d65d1f", "#6b240e"]; // 귤 주황
const GL = ["#ffffff", "#d8f3ff", "#9fd3ea", "#5f93b0", "#24445a"]; // 유리

const rp = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// ── 칸 그림판 — 칸마다 색("색|불투명도" 도 된다). 외곽선은 4이웃 ──
function grid() {
  const m = new Map();
  const k = (x, y) => x + "," + y;
  const g = {
    m,
    set(x, y, c) { if (c) m.set(k(x, y), c); return g; },
    get(x, y) { return m.get(k(x, y)); },
    has(x, y) { return m.has(k(x, y)); },
    outline(c) {
      const add = [];
      for (const key of m.keys()) {
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(k(x + dx, y + dy))) add.push(k(x + dx, y + dy));
      }
      for (const a of add) m.set(a, c);
      return g;
    },
    // 다른 그림판을 (ox, oy) 칸에 찍는다 — 나중 것이 덮는다(앞 물체의 외곽선이 뒤 물체를 또렷하게 가른다)
    stamp(src, ox, oy) { for (const [key, c] of src.m) { const [x, y] = key.split(",").map(Number); m.set(k(x + ox, y + oy), c); } return g; },
    box() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const key of m.keys()) { const [x, y] = key.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
  };
  return g;
}
// 그림판 → SVG(색마다 경로 하나, 같은 색 가로 이웃은 네모 하나로). (x, y) = 칸 (0, 0) 의 왼쪽 위(px)
function draw(g, x, y, P, attr = "") {
  const by = {};
  for (const [key, c] of g.m) { const [cx, cy] = key.split(",").map(Number); ((by[c] ||= new Map()).get(cy) || by[c].set(cy, []).get(cy)).push(cx); }
  let body = "";
  for (const [c, rows] of Object.entries(by)) {
    let d = "";
    for (const [cy, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += rp(x + xs[i] * P, y + cy * P, (j - i + 1) * P, P); i = j + 1; }
    }
    const [fill, op] = c.split("|");
    body += `<path d="${d}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ""}/>`;
  }
  return `<g${attr}>${body}</g>`;
}
// 바닥에 세우기 — 외곽 포함 왼쪽 끝 left · 아래 끝 bottom(px)
function put(g, left, bottom, P, attr) { const b = g.box(); return draw(g, left - b.x0 * P, bottom - (b.y1 + 1) * P, P, attr); }
// 가운데에 놓기 — 외곽 포함 상자 가운데 (cx, cy)(px). 칸 격자(P)에 맞춘다
function center(g, cx, cy, P, attr) { const b = g.box(); return draw(g, Math.round((cx - (b.w * P) / 2) / P) * P - b.x0 * P, Math.round((cy - (b.h * P) / 2) / P) * P - b.y0 * P, P, attr); }

// 왼쪽 위 빛 4단 — (nx, ny) ∈ [-1, 1] → 0 빛 · 1 밝은 · 2 바탕 · 3 그늘
const tone = (nx, ny) => { const d = Math.hypot(nx + 0.45, ny + 0.45); return d < 0.34 ? 0 : d < 0.74 ? 1 : d < 1.3 ? 2 : 3; };

// ── 사탕들 ──
// 박하사탕(모서리) — 여섯 갈래 바람개비, 가운데 한 칸 크림
function mint(r, A) {
  const g = grid();
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const rho = Math.hypot(x, y);
    if (rho > r + 0.35) continue;
    const t = tone(x / (r + 0.5), y / (r + 0.5));
    const th = Math.atan2(y, x) + rho * 0.3;
    const ramp = rho < 0.9 ? CR : ((Math.floor((th / (2 * Math.PI)) * 6) % 2) + 2) % 2 ? CR : A;
    g.set(x + r, y + r, ramp === CR ? CR[Math.min(2, t)] : A[Math.max(1, Math.min(3, t))]);
  }
  return g.outline(A[4]);
}
// 포장 사탕 — 둥근 몸통(S 가 있으면 사선 줄무늬) + 양옆 부채꼴 포장 끝
function bonbon(R, bw = 7, bh = 5, fl = 2, S = null) {
  const g = grid();
  const cy = (bh - 1) / 2;
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const dx = (x - (bw - 1) / 2) / (bw / 2), dy = (y - cy) / (bh / 2);
    if (dx * dx + dy * dy > 1.0) continue;
    const ramp = S && (x + y) % 4 < 2 ? S : R;
    g.set(fl + x, y, ramp[Math.min(3, tone(dx * 1.05, dy * 1.05) + (ramp === S ? 1 : 0))]);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < fl; k++) {
      const x = side < 0 ? fl - 1 - k : fl + bw + k;
      const half = k === 0 ? 0.6 : 0.6 + (k / Math.max(1, fl - 1)) * (bh / 2 - 0.5);
      for (let y = 0; y < bh; y++) {
        if (Math.abs(y - cy) > half) continue;
        let t = k === 0 ? 3 : (y < cy ? 1 : 2) + (side > 0 ? 1 : 0);
        g.set(x, y, R[Math.min(3, t)]);
      }
    }
  }
  return g.outline(R[4]);
}
// 소용돌이(막대사탕 머리) — 두 색 소용돌이
function swirl(r, A, B, twist = 1.15, arms = 2) {
  const g = grid();
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const rho = Math.hypot(x, y);
    if (rho > r + 0.35) continue;
    const t = tone(x / (r + 0.5), y / (r + 0.5));
    const ph = (arms * Math.atan2(y, x)) / (2 * Math.PI) + twist * (rho / r);
    const ramp = rho < 0.9 ? A : ((Math.floor(ph * 2) % 2) + 2) % 2 ? B : A;
    g.set(x + r, y + r, ramp === B ? B[Math.min(2, t)] : A[Math.max(1, Math.min(3, t))]);
  }
  return g.outline(A[4]);
}
// 반짝이 — 십자 3 × 3
function spark() { return grid().set(1, 0, CR[1]).set(0, 1, CR[1]).set(1, 1, CR[0]).set(2, 1, CR[1]).set(1, 2, CR[1]); }

const PL = ["#e9b9e6", "#a5579f", "#7a3480", "#521f5c", "#1f0723"]; // 짙은 자두 보라(테 · 뚜껑)

// 큰 유리 사탕 병 — 몸통 30 × 26 칸(둥근 어깨 · 바닥). e 유리 밝은 테 · E 유리 그늘 테 · t 속(옅은 유리빛)
const JW = 30, JH = 26;
const JAR = (() => {
  const rows = [];
  // 줄마다 [왼쪽 들여쓰기] — 목(2줄) · 어깨 · 배 · 바닥
  const ind = [9, 9, 9, 7, 5, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 2, 4];
  for (let y = 0; y < JH; y++) {
    const a = ind[y], b = JW - 1 - a;
    let r = "";
    for (let x = 0; x < JW; x++) {
      if (x < a || x > b) { r += "."; continue; }
      const up = y === 0 || x < ind[y - 1] || x > JW - 1 - ind[y - 1];
      const dn = y === JH - 1 || x < ind[y + 1] || x > JW - 1 - ind[y + 1];
      r += x === b || dn ? "E" : x === a || up ? "e" : "t";
    }
    rows.push(r);
  }
  return rows;
})();
// 병 속 사탕 — [왼쪽 위 x, y, 색, 줄무늬] 뒤 → 앞(7 × 7 동그라미, 외곽선 없이 아래 · 오른쪽 그늘로 가른다). 2/3 쯤 차고 위는 유리가 비친다
const JAR_FILL = [[12, 9, LE], [18, 10, PU], [3, 13, OR], [9, 13, PK, 1], [15, 14, MT], [21, 13, PK], [0, 18, PU], [6, 18, MT], [12, 18, LE], [18, 18, OR], [24, 18, MT]];
const LID = [".......pppp.......", "......pppppp......", "....LLLLLLLLLL....", "...LLLLLLLLLLLL...", "..LLLLLLLLLLLLLL..", ".MMMMMMMMMMMMMMMM."];
function jar() {
  const body = grid();
  const isT = (x, y) => JAR[y] && JAR[y][x] === "t";
  JAR.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") body.set(x, y, ch === "e" ? GL[1] : ch === "E" ? GL[3] : GL[2] + "|0.18"); }));
  for (const [cx, cy, R, st] of JAR_FILL) {
    for (let dy = 0; dy < 7; dy++) for (let dx = 0; dx < 7; dx++) {
      const nx = (dx - 3) / 3.5, ny = (dy - 3) / 3.5;
      if (nx * nx + ny * ny > 1.05) continue;
      const x = cx + dx, y = cy + dy;
      if (!isT(x, y)) continue;
      let t = dx === 2 && dy === 2 ? 0 : tone(nx, ny);
      if (t === 0 && !(dx === 2 && dy === 2)) t = 1;
      body.set(x, y, st && t >= 1 && t <= 2 && (dx + dy) % 3 === 0 ? CR[t] : R[t]);
    }
  }
  // 빛줄기 — 왼쪽 안쪽 긴 토막 + 짧은 토막, 오른쪽 어깨 두 점
  [[5, 4], [4, 5], [3, 6], [2, 7], [2, 8], [2, 9], [2, 10], [2, 11], [2, 12], [2, 14], [2, 15]].forEach(([x, y]) => body.set(x, y, GL[0]));
  [[24, 5], [25, 6], [26, 7]].forEach(([x, y]) => body.set(x, y, GL[1]));
  // 목 리본 띠
  for (let x = 9; x <= 20; x++) { body.set(x, 1, PK[x < 11 ? 1 : 2]); body.set(x, 2, PK[3]); }
  // 매듭 · 짧은 꼬리
  [[14, 1, 1], [15, 1, 1], [14, 2, 2], [15, 2, 2], [13, 3, 3], [16, 3, 3], [13, 4, 3], [16, 4, 3]].forEach(([x, y, t]) => body.set(x, y, PK[t]));
  body.outline(GL[4]);
  const lid = grid(), knob = grid();
  LID.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === "p") knob.set(x, y, LE[y === 0 ? (x === 7 ? 0 : 1) : x < 8 ? 2 : 3]);
    else if (ch === "L") lid.set(x, y, PL[y === 2 && x < 8 ? 0 : x < 8 ? 1 : x > 12 ? 3 : 2]);
    else if (ch === "M") lid.set(x, y, PL[x < 4 ? 2 : 3]);
  }));
  lid.outline(PL[4]); knob.outline(LE[4]);
  const g = grid();
  g.stamp(body, 0, 0).stamp(lid, 6, -6).stamp(knob, 6, -6);
  return g;
}

// 줄무늬 컵 — 위 테 + 아래로 살짝 좁아지는 몸통(민트 · 크림 세로 줄 2칸씩)
function cup(cw = 14, ch = 9) {
  const g = grid();
  for (let x = -1; x <= cw; x++) g.set(x, 0, MT[x < 2 ? 0 : x > cw - 3 ? 3 : 1]);
  for (let y = 1; y < ch; y++) {
    const ins = Math.floor((y - 1) / 4);
    for (let x = ins; x < cw - ins; x++) {
      const u = (x - ins) / (cw - 2 * ins - 1);
      const cream = Math.floor(x / 2) % 2 === 1;
      const t = u < 0.25 ? 0 : u > 0.72 ? 2 : 1;
      g.set(x, y, y === 1 ? MT[3] : cream ? CR[t] : MT[t + 1]);
    }
  }
  return g.outline(MT[4]);
}
// 비스듬한 막대 — 위로 len 칸, 4줄마다 dir 칸 옆으로
function lean(len, dir) {
  const g = grid();
  for (let t = 0; t < len; t++) { const x = Math.round((t * dir) / 4); g.set(x, -t, CR[1]); g.set(x + 1, -t, CR[3]); }
  return g.outline(CR[4]);
}
// 줄무늬 컵 막대사탕 한 쌍(작게) — 컵(앞) 뒤로 분홍(왼쪽 · 높게) · 레몬(오른쪽 · 낮게). 아래 끝 = 0 줄
function cupPair() {
  const g = grid();
  const c = cup(10, 6);
  const top = -c.box().y1; // 컵 위 테 줄(컵 바닥 = 0 줄)
  const L1 = 11, L2 = 9, x1 = 3, x2 = 6;
  g.stamp(lean(L1, -1), x1, top + 2);
  g.stamp(lean(L2, 1), x2, top + 2);
  const e1 = { x: x1 + Math.round(-(L1 - 1) / 4), y: top + 2 - (L1 - 1) }, e2 = { x: x2 + Math.round((L2 - 1) / 4), y: top + 2 - (L2 - 1) };
  g.stamp(swirl(3, LE, CR, 1.2), e2.x + 1 - 3, e2.y - 3);
  g.stamp(swirl(4, PK, CR, 1.2), e1.x + 1 - 4, e1.y - 4);
  g.stamp(c, 0, top);
  return g;
}

export function deco(w, h, S, site, ctx = {}) {
  const id = "hw_candy";
  const P = site ? 2 : Math.max(2, Math.round(2 * S)); // 테 칸(사이트 2px · 봇 4px)
  const BAND = 4; // 테 띠 칸 수 — 분홍 외곽 · 분홍 · 민트 · 민트 외곽
  const o = site ? frameOut(site, ctx, BAND * P, P) : 4 * P;
  const oc = o / P;
  const NC = Math.floor(w / P), NR = Math.floor(h / P);

  // ── 테 — 바깥에서 k 번째 줄. 분홍 줄은 위 · 왼쪽 밝게, 민트 줄은 아래 · 오른쪽 그늘. 16칸마다 크림 사선 두 칸(사탕 막대 줄무늬) ──
  const fr = grid();
  const T = 16;
  const cell = (k, along, lit) => {
    if (k === 0) return PK[4];
    if (k === 3) return MT[4];
    const s = ((along - (k - 1)) % T + T) % T; // 사선 — 안쪽 줄은 한 칸 밀린다
    if (s < 2) return CR[k === 1 ? 1 : 2];
    return k === 1 ? PK[lit ? 1 : 2] : MT[lit ? 2 : 3];
  };
  for (let k = 0; k < BAND; k++) {
    const x0 = oc + k, y0 = oc + k, x1 = NC - oc - 1 - k, y1 = NR - oc - 1 - k;
    for (let x = x0; x <= x1; x++) { fr.set(x, y0, cell(k, x, true)); fr.set(x, y1, cell(k, x, false)); }
    for (let y = y0 + 1; y < y1; y++) { fr.set(x0, y, cell(k, y, true)); fr.set(x1, y, cell(k, y, false)); }
  }

  // ── 모서리 박하사탕 · 위 가운데 포장 사탕 ──
  let plates = "";
  const pc = (oc + BAND / 2) * P; // 띠 가운데(px)
  const pw = [PK, MT, MT, PK];
  [[pc, pc], [w - pc, pc], [pc, h - pc], [w - pc, h - pc]].forEach(([x, y], i) => { plates += center(mint(4, pw[i]), x, y, P); });
  // 봇 레벨업 · 역할 지급 카드는 사진이 위 가운데라 한 칸 올린다
  const crestUp = !site && ctx?.kind && botTopOpen(ctx) ? P : 0;
  plates += center(bonbon(PK, 7, 5, 2, CR), w / 2, pc - crestUp, P);

  // ── 병 · 컵 무리 ──
  //   사이트: 막대가 있으면 막대 오른쪽 끝 위(아래 끝 = 막대 위 끝, 덮지 않음). 병은 오른쪽 테에서 6px 안쪽, 컵은 병 왼쪽 아래 앞(3칸 겹침).
  //           컵 왼쪽 끝은 등급 줄 오른쪽 끝(어림 — 가장 긴 '그랜드마스터까지 N레벨' 기준 lineX0 + 172)을 넘지 않는다 → 좁은 카드는 컵이 병 앞으로 들어온다.
  //           막대가 없으면 오른쪽 아래 구석(스탯 글자보다 솟으면 아래 테 뒤로 내려앉는다).
  //   봇: 역할 지급 카드만 오른쪽 아래 구석(칸 한 단 작게 — 봇 카드 규칙 hwFloor botFloorOpen)
  let heap = "", tw = "";
  let sunkG = { defs: "", svg: "" };
  const jg = jar(), cg = cupPair();
  const jb = jg.box(), cb = cg.box();
  const edge = h - o - BAND * P; // 테 안쪽 아래 가장자리
  // 무리 그리기 — 병 오른쪽 끝 right · 아래 끝 bottom(px), 칸 q. 컵 왼쪽 끝은 minLeft 보다 왼쪽으로 가지 않는다
  const group = (right, bottom, q, minLeft = -Infinity) => {
    const jl = Math.round((right - jb.w * q) / q) * q;
    // 컵 몸통 오른쪽 외곽(컵 칸 x = 11)이 병 왼쪽 아래 둥근 자리에 3칸 들어온다. 좁으면 minLeft 까지 병 앞으로 더 들어온다
    const cl = Math.max(jl + 3 * q - (12 - cb.x0) * q, Math.ceil(minLeft / q) * q);
    const glint = draw(spark(), jl - jb.x0 * q + 2 * q, bottom - (jb.y1 + 1) * q + 2 * q, q, ` class="${id}-tw" style="animation-delay:-2.1s"`);
    return { svg: put(jg, jl, bottom, q) + put(cg, cl, bottom, q), glint };
  };
  if (site) {
    const barTop = Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
    const gh = Math.max(jb.h, cb.h) * P;
    const right = w - o - BAND * P - 6;
    const tierR = (Number.isFinite(ctx.lineX0) ? ctx.lineX0 : 28) + 172;
    if (barTop != null && barTop - gh > o + 20) {
      const r = group(right, Math.floor(barTop / P) * P, P, tierR);
      heap = r.svg; tw = r.glint;
    } else {
      const limit = floorLimit(h, site, ctx);
      const d = sinkBy(limit, edge - gh, P);
      const r = group(right, edge + d, P);
      if (d > 2 * P) sunkG = behind(meta.key, w, h, edge, r.svg); else { heap = r.svg; tw = r.glint; }
    }
    // 위 하늘 반짝이 하나(이름 줄 오른쪽 위 빈칸)
    tw += center(spark(), w - 98, 30, P, ` class="${id}-tw"`);
  } else if (botFloorOpen(ctx)) {
    const Q = Math.max(2, Math.round(1.4 * S));
    heap = group(w - o - BAND * P - 14 * Q, edge, Q).svg;
  }

  const defs =
    `<pattern id="${id}-dt" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M11 11h2v2h-2z" fill="#ffc4dc" fill-opacity="0.08"/></pattern>` +
    (site
      ? `<style>@keyframes ${id}Tw{0%,100%{opacity:.2}50%{opacity:1}}.${id}-tw{animation:${id}Tw 4s ease-in-out infinite}` +
        `@media (prefers-reduced-motion:reduce){.${id}-tw{animation:none}}</style>`
      : "");
  const under = site ? `<rect width="${w}" height="${h}" fill="url(#${id}-dt)"/>` : "";
  const over = `<g shape-rendering="crispEdges">${draw(fr, 0, 0, P)}${plates}${sunkG.svg}${heap}${tw}</g>`;
  return { defs: defs + sunkG.defs, under, over };
}
