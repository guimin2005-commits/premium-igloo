// 📌 티어 아바타 테두리 그림 생성 — public/avatar-borders/<등급 키>.svg(움직임 있음) · lib/avatarFrameArt.js · bot/src/avatarFrameArt.js(정지 그림, 두 파일 같음)
//    실행: node scripts/gen-avatar-frames.mjs   (그림을 고치면 다시 돌려 결과를 커밋한다. 끝에 찍히는 FRAME_REACH 를 app/components/AvatarFrame.js 에 옮긴다)
//
//    2026-10-10 운영자 지정 짜임: 지금 티어 엠블럼(scripts/gen-tier-emblems.mjs)을 사진 아래 받침으로 — 가로는 사진 너비 정도, 두께는 세로로만 얇게(세부 그대로).
//    옆: 마스터부터 「겹선 테」(운영자가 8안 중 고름) — 뿔 · 날개 · 떠다니는 보석 · 위 문장 · 닫힌 고리 · 빛줄기는 반려되어 없음. 마스터부터 받침에서 사진 양옆을 감싸 오르는 빛줄기 + 타고 오르는 빛,
//    반짝이 · 빛무리 · 빛 훑기(움직임은 마스터부터).
//    색은 엠블럼과 같게(이글루 그라데이션은 해 보고 되돌림 — 테두리 · 엠블럼 색이 같아야 함). 다이아는 테두리에서 결정 조각 대신 날개 보석(FRAME_TIER, 색은 엠블럼 그대로).
//
//    판: 128칸 정사각형, 가운데 구멍 반지름 24칸(app/components/AvatarFrame.js · lib/botCards ringAvatar — 사진 지름의 128/48 배, 구멍은 사진의 0.92).
//    → 사진 반지름은 24 / 0.92 ≈ 26.1칸. 구멍(24칸) 안은 비우고, 그 바깥 2칸은 받침이 사진 가장자리를 살짝 덮는다.
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { BORDER_TIERS, renderBorder, toSvg, staticSvg } from "./gen-avatar-borders.mjs";
import { renderEmblem } from "./gen-tier-emblems.mjs";

const N = 128, C = 64, HOLE = 24, RP = HOLE / 0.92;
const CUT = RP - 0.6;
const PIX = 1; // 받침 칸 크기(2 로 키워 봤으나 사진이 엠블럼 가운데를 가려 어두운 아래만 남아 뭉개짐 — 1) // 받침 · 별이 끝나는 반지름 — 사진 가장자리에 반 칸 걸쳐 틈 없이, 그 안은 사진 뒤
const U = RP / 23.25; // 시안(.claude/mockups/src/tier-emblemframe) 단위 → 칸
const SY = 0.7; // 받침 세로 두께 — 날개 폭은 그대로 두고 세로로만 눌러 얇게("받침 전체 두께 줄여")
// 받침 가로 목표(사진 지름의 배) — 사진 너비보다 조금 넓게, 등급이 오를수록 조금씩
const WIDTH = { bronze: 1.16, silver: 1.2, gold: 1.24, platinum: 1.24, diamond: 1.28, master: 1.3, grandmaster: 1.32, challenger: 1.36, igloo: 1.4 };
const FLOAT = {}; // 떠다니는 보석 — 빼기로 함(2026-10-10)
const PRISM_GEM = [
  { o: "#0e2a40", d: "#2f7fb0", m: "#3fc0ea", l: "#a8ecff", h: "#ffffff" },
  { o: "#241048", d: "#5a3cc0", m: "#9a7cff", l: "#d6c8ff", h: "#ffffff" },
  { o: "#3a0f2a", d: "#b03a78", m: "#ef6aa8", l: "#ffc2dc", h: "#ffffff" },
];
const GLOW_PRISM = ["#d0b8ff", "#a8ecff", "#ffc8e8"]; // toSvg 의 오로라 색(빛무리가 이 셋을 돌며 흐른다)

const blank = () => Array.from({ length: N }, () => Array(N).fill(null));
const dist = (x, y) => Math.hypot(x + 0.5 - C, y + 0.5 - C);

// 받침 — 엠블럼(위 장식 · 반짝이 · 빛무리 없이)을 가로 S배 · 세로 S×SY배로 찍어 사진 아래에 둔다
function base(T, S) {
  const hi = !!T.glow;
  const TB = {
    ...T, key: `${T.key}-base`, horns: undefined, back: undefined, star: 0, orb: false, serrate: false, glow: false, fxAt: [], sy: SY, // glow: false — 가운데 흰 날 빼기
    inlayBand: T.inlayBand ?? 2, // 결(파랑 · 보라 등)은 빛 면에 붙은 2칸 띠만 — 크게 그리면 결이 넓은 면이 되어 엠블럼(작은 칸이라 가는 결)과 색 비율이 달라 보였음
    outer: hi ? T.outer.slice(0, 4).map((o) => ({ ...o, W: (o.W ?? 3.3) * 0.85, ext: o.ext * 0.88 })) : T.outer.map((o) => ({ ...o, W: (o.W ?? 3.3) * 0.9, ext: o.ext * 0.92 })),
    lower: hi ? (T.lower || []).map((f) => ({ ...f, ext: f.ext * 0.8 })) : (T.lower || []).map((f) => ({ ...f, W: (f.W ?? 2.4) * 0.9, ext: f.ext * 0.92 })),
    inner: { ...T.inner, W: (T.inner.W ?? 3.3) * 0.92 }, wedge: { ...T.wedge, s: T.wedge.s * (T.wedgeScale ?? (hi ? 0.8 : 0.92)) },
  };
  // 엠블럼과 같은 칸 크기로 그려 두 배로 키운다(PIX) — 고운 칸으로 크게 그리면 파랑 결이 넓은 면이 되어 엠블럼과 색 비율이 달라 보였음
  const n = Math.max(12, Math.round((96 * S * U) / PIX / 2) * 2);
  const c = renderEmblem(TB, n);
  const Ke = ((Math.round((n * 4) / 3 / 2) * 2) / 128) * PIX; // 엠블럼 설계 1단위 = Ke 칸(판 기준)
  // 사진 아래 끝이 받침의 같은 자리에 오게(시안: 사진 아래 끝 = 엠블럼 가운데 아래 12.75 · 13.25 단위)
  const dy = RP - (hi ? 12.75 : 13.25) * S * SY * U;
  const g = blank();
  const off = C - (n * PIX) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = c[y][x]; if (!v) continue;
    for (let i = 0; i < PIX; i++) for (let j = 0; j < PIX; j++) {
      const X = Math.round(x * PIX + i + off), Y = Math.round(y * PIX + j + off + dy);
      if (X < 0 || Y < 0 || X >= N || Y >= N || dist(X, Y) < CUT) continue;
      g[Y][X] = v;
    }
  }
  // 쐐기 보석 가운데(엠블럼 설계: 가운데 아래 R(9) + s × 1.3 × 0.8, 세로는 SY 로 눌림)
  const gemY = C + dy + (9 + TB.wedge.s * 1.3 * 0.8) * SY * Ke;
  return Object.assign(g, { gem: [C, gemY], Ke });
}
// 빛줄기(마스터부터, "프로필을 감싸는 느낌이나 옆에 효과") — 받침 날개 끝 근처(a0)에서 사진 양옆을 감싸 올라가(a1) 가늘어지며 옅어지는 빛 띠 + 줄기를 타고 오르는 밝은 빛.
//   a0 · a1: 시작 · 끝 각도(0 오른쪽 · −90 위), w: 시작 두께(칸), lights: 오르는 빛 개수, period: 한 번 오르는 초
const RING = {}; // 옆 빛줄기 — "밤티"로 반려(2026-10-10), 뺌
const ORBIT_STEPS = 16;
// 뿔(마스터부터) — 엠블럼 뿔을 사진 둘레에 맞춰: a0 받침 옆에서 시작, tip 끝 각도(머리 위에서 닫히지 않게), r 사진 가장자리에서 떨어진 칸, W 굵기 배율
const HORN = {}; // 뿔 — 운영자가 떼라고 한 것(2026-10-10) · 다시 달았다가 반려, 달지 않는다
const widthOf = (g) => { let x0 = 1e9, x1 = -1e9; g.forEach((r) => r.forEach((v, x) => { if (v) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); } })); return (x1 - x0) / (2 * RP); };

// 연 모양 보석 한 개(칸 단위) — 왼쪽 위 빛
function kite(cx, cy, rx, ry, P) {
  const cells = [];
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const k = Math.abs(dx) + Math.abs(dy);
    if (k > 1.25) continue;
    const c = k > 0.95 ? P.o : dy < -0.15 ? (dx < 0 ? P.h : P.l) : dy < 0.3 ? (dx < 0 ? P.l : P.m) : P.d;
    cells.push([x, y, c]);
  }
  return cells;
}

// 다이아(테두리만) — 색은 엠블럼 그대로("엠블럼이랑 색감 안 맞다"), 아래로 늘어진 결정 조각 대신 아래 날개(날개 위 보석은 사진에 잘려 뺌)
const FRAME_TIER = {
  igloo: (T) => ({ ...T, M: { o: "#4a4378", d: "#a9a5c8", m: "#d6d2ea", l: "#f2effb", h: "#ffffff" } }), // 밝게 — 외곽 #2a2040 → #4a4378, 그늘 한 단계 위
  // 챌린저 — 색은 엠블럼 그대로, 쐐기 자리 4갈래 별만 더함(STAR)
  challenger: (T) => ({ ...T, wedgeScale: 0.95, innerLitShift: 0.28, rimLight: 2 }), // 앞쪽 날 노란 가장자리를 사진 가장자리 따라 끝까지("끝까지 늘리는 게 어렵냐") — 파랑 면은 그대로
  diamond: (T) => ({ ...T, shards: [], sideGems: false, lower: [{ a1: 52, ext: 10 }, { a1: 68, ext: 11, W: 2 }] }),
};

function star(c, cx, cy, arms, rIn, M, J) {
  const pts = [];
  arms.forEach(([a, L], i) => {
    const r = (d) => (d * Math.PI) / 180, b = arms[(i + 1) % arms.length][0], mid = a + ((((b - a) % 360) + 360) % 360) / 2;
    pts.push([cx + L * Math.cos(r(a)), cy + L * Math.sin(r(a))], [cx + rIn * Math.cos(r(mid)), cy + rIn * Math.sin(r(mid))]);
  });
  const inside = (x, y) => { let k = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k; } return k; };
  const m = new Set();
  for (let y = Math.floor(cy - 14); y <= Math.ceil(cy + 14); y++) for (let x = Math.floor(cx - 14); x <= Math.ceil(cx + 14); x++) if (inside(x + 0.5, y + 0.5) && dist(x, y) >= CUT) m.add(`${x},${y}`);
  for (const k of m) {
    const [x, y] = k.split(",").map(Number);
    if (x < 0 || y < 0 || x >= N || y >= N) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([p, q]) => !m.has(`${x + p},${y + q}`));
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    let best = arms[0][0], bd = 1e9;
    for (const [a] of arms) { const d = Math.abs(((ang - a + 540) % 360) - 180); if (d < bd) { bd = d; best = a; } }
    const ax = Math.cos((best * Math.PI) / 180), ay = Math.sin((best * Math.PI) / 180);
    const side = dx * -ay + dy * ax; // 갈래 축에서 어느 쪽인지
    const sg = side < 0 ? -1 : 1, lit = (-ay * sg) * -0.6 + (ax * sg) * -0.8 > 0; // 축에서 벗어난 쪽이 빛(왼쪽 위)을 보면 밝게
    c[y][x] = edge ? M.o : Math.abs(side) < 0.7 ? M.h : lit ? M.l : M.m;
  }
  for (const [x, y, col] of kite(cx, cy, 2.2, 3, J)) if (c[y]?.[x] !== undefined) c[y][x] = col;
}
const STAR = {
  challenger: { arms: [[-90, 9], [0, 9], [90, 12], [180, 9]], rIn: 4.4 },
  igloo: { arms: [[-90, 10], [-45, 6.5], [0, 9], [45, 6.5], [90, 12], [135, 6.5], [180, 9], [-135, 6.5]], rIn: 4.2 },
};

// ── 옆면 「겹선 테」(마스터부터, 2026-10-10 운영자가 8안 중 고름 — 시안 .claude/mockups/src/frame-side/free) ──────────────
//   받침 날개 밑에서 가는 금속선 · 결 선이 사진 둘레를 바짝 따라 오르고 끝은 가늘어지며 사라진다(머리 위는 열림). 선 위 박힌 보석.
//   등급이 오를수록 선이 한 줄씩 쌓이고 더 높이 오른다. 움직임: 한 바퀴를 「모으기 → 터짐 → 흩어짐 → 쉼」 한 박자로(addSide 끝 · ANIM)
const rad = (d) => (d * Math.PI) / 180;
// 등급별 짜임 — 각: 0 = 옆 가운데(3시), − 위, + 아래(오른쪽 기준, 왼쪽은 대칭). r: 사진 가장자리(RP)에서 바깥으로 몇 칸
//   kind: metal(금속 두 칸 선) · gem(결 색 한 칸 선) · dash(결 밝은 색 점선) · a0: 받침 밑에서 시작하는 각 · a1: 끝 각
//   clasps: 선들을 묶는 마름모 죔쇠 자리(각)
// 움직임 세기 — tip: 선 끝 네 갈래 빛 길이(칸) · core: 받침 보석 빛 길이 · flash: 테두리 전체 번쩍 세기 · sparks: 끝에서 튀는 알갱이 방향(바깥 기준 ± 도)
const CYCLE = 4.8; // 한 바퀴(초)
const ANIM = {
  master: { tip: 3, core: 5, flash: 0.3, sparks: [-50, -10, 30, 70] },
  grandmaster: { tip: 4, core: 5, flash: 0.35, sparks: [-60, -25, 10, 45, 80] },
  challenger: { tip: 4, core: 6, flash: 0.45, sparks: [-65, -35, -5, 25, 55, 85] },
  igloo: { tip: 5, core: 7, flash: 0.5, sparks: [-70, -42, -14, 14, 42, 70, 98] },
};
const LINES = {
  master: { lines: [{ r: 1.6, a0: 26, a1: -40, kind: "metal" }], clasps: [-12] },
  grandmaster: { lines: [{ r: 1.6, a0: 26, a1: -47, kind: "metal" }, { r: 6, a0: 30, a1: -27, kind: "gem", col: "m" }], clasps: [-14] },
  challenger: { lines: [{ r: 1.6, a0: 26, a1: -54, kind: "metal" }, { r: 5, a0: 22, a1: -45, kind: "dash", col: "l" }, { r: 7.5, a0: 30, a1: -34, kind: "gem", col: "m" }], clasps: [-12, -36] },
  igloo: { lines: [{ r: 1.6, a0: 26, a1: -60, kind: "metal" }, { r: 5, a0: 22, a1: -51, kind: "dash", col: "l" }, { r: 7.5, a0: 30, a1: -42, kind: "gem", col: "p1" }, { r: 10.5, a0: 34, a1: -24, kind: "gem", col: "p2" }], clasps: [-10, -37] },
};

// 1칸 원호(오른쪽) — 각을 잘게 돌며 칸을 모으고 계단 모서리(L자)를 지워 고른 1칸 선으로. [x, y, 진행률 u(0 아래 → 1 위)]
function arcCells(R, a0, a1) {
  const kept = [];
  for (let t = a0; t >= a1; t -= 0.05) {
    const x = Math.floor(C + R * Math.cos(rad(t))), y = Math.floor(C + R * Math.sin(rad(t)));
    const last = kept[kept.length - 1];
    if (last && last[0] === x && last[1] === y) continue;
    const prev = kept[kept.length - 2];
    if (prev && Math.abs(prev[0] - x) === 1 && Math.abs(prev[1] - y) === 1) kept.pop(); // L자 모서리 칸 지움
    kept.push([x, y, (a0 - t) / (a0 - a1)]);
  }
  return kept;
}

function addSide(g, T) {
  const sd = LINES[T.key]; if (!sd) return g;
  const c = g.c, M = T.M, J = T.J;
  const fxCell = new Set(); g.roles.fx.forEach((st) => st.forEach((k) => fxCell.add(k)));
  const isBase = (x, y) => { const v = c[y]?.[x]; return v && !v.includes("|") && !fxCell.has(`${x},${y}`); };
  const baseSet = new Set(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (isBase(x, y)) baseSet.add(`${x},${y}`); // 선을 칠하기 전의 받침 칸
  const paint = new Map(); // key → 색 (오른쪽만 모았다가 마지막에 좌우 대칭)
  const flow = []; // 움직임용 — 선마다 { i: 안쪽부터 순서, metal, cells: [x, y, u, 색] }
  const nb4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // 바깥 줄부터 깔고 안쪽 줄을 위에(외곽선이 안쪽 선을 덮지 않게)
  const lines = [...sd.lines].map((l, i) => ({ ...l, i })).sort((a, b) => b.r - a.r);
  for (const ln of lines) {
    const lc = ln.col === "p1" ? T.prism[1] : ln.col === "p2" ? T.prism[2] : ln.col === "l" ? J.l : J.m;
    const core = new Map(); // key → [색, u]
    const R = RP + ln.r;
    if (ln.kind === "metal") {
      // 금속 w 칸: 안쪽 칸 빛(M.h, 아래쪽은 M.l) · 바깥 칸은 한 칸씩 일찍 끝나 끝이 한 칸으로 가늘어진다(뾰족 · 부스러기 없이)
      const at = (f) => ln.a0 - (ln.a0 - ln.a1) * f;
      const key = (x, y) => `${x},${y}`;
      for (const [x, y, u] of arcCells(R, ln.a0, ln.a1)) core.set(key(x, y), [u < 0.35 ? M.l : M.h, u]);
      const rows = (ln.w || 2) === 3 ? [[1, M.l, 0.8], [2, M.m, 0.6]] : [[1, M.m, 0.78]];
      for (const [dr, col, f] of rows) for (const [x, y] of arcCells(R + dr, ln.a0, at(f))) if (!core.has(key(x, y))) core.set(key(x, y), [col, 0]);
    } else {
      const cells = arcCells(R, ln.a0, ln.a1);
      cells.forEach(([x, y, u], j) => {
        if (ln.kind === "dash" && Math.floor(j / 2) % 2) return; // 두 칸 켜고 두 칸 끔
        core.set(`${x},${y}`, [lc, u]);
      });
    }
    // 외곽선(진한 금속 외곽) — 점선은 외곽선 없이
    if (ln.kind !== "dash") for (const [k] of core) {
      const [x, y] = k.split(",").map(Number);
      for (const [a, b] of nb4) { const q = `${x + a},${y + b}`; if (!core.has(q) && !paint.has(q)) paint.set(q, M.o); }
    }
    const fl = { i: ln.i, metal: ln.kind === "metal", cells: [] };
    for (const [k, [col, u]] of core) { paint.set(k, col); if (ln.kind !== "metal" || col !== M.m) fl.cells.push([...k.split(",").map(Number), u, col]); }
    flow.push(fl);
  }
  // 박힌 보석 — 금속선 위에 연 모양 보석(엠블럼 쐐기 보석과 같은 칠: 위 왼쪽 빛 · 아래 그늘 · 진한 외곽, 흰 반짝 한 칸)
  const gems = []; // 보석마다 안쪽 칸 [x, y]
  for (const tc of sd.clasps) {
    const gemCells = []; gems.push(gemCells);
    const rr = RP + 2.2, cx = C + rr * Math.cos(rad(tc)), cy = C + rr * Math.sin(rad(tc)), rx = 2.5, ry = 3.4;
    const P = T.key === "igloo" ? { o: "#241048", d: "#5a3cc0", m: "#8fe0ff", l: "#d8f6ff", h: "#ffffff" } : J; // 이글루는 받침 별 보석과 같은 하늘 보석
    for (let y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, k = Math.abs(dx) + Math.abs(dy);
      if (k > 1.3) continue;
      const col = k > 0.98 ? M.o : dy < -0.15 ? (dx < 0 ? P.h : P.l) : dy < 0.3 ? (dx < 0 ? P.l : P.m) : P.d;
      paint.set(`${x},${y}`, col);
      if (k <= 0.98) gemCells.push([x, y]);
    }
  }
  // 칠하기(좌우 대칭) — 받침이 앞, 얼굴 안으로는 안 들어감, 덮인 반짝이는 그 반짝이에서 뺀다
  const drawn = [];
  for (const [k, col] of paint) {
    const [x0, y] = k.split(",").map(Number);
    for (const x of [x0, N - 1 - x0]) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      if (dist(x, y) < RP - 0.6) continue;
      if (isBase(x, y)) continue;
      const kk = `${x},${y}`;
      g.roles.glow.delete(kk); g.roles.fx.forEach((st) => st.delete(kk));
      c[y][x] = col; drawn.push([x, y]);
    }
  }
  // 움직임(마스터부터) — 한 바퀴(CYCLE 초)를 「모으기 → 터짐 → 흩어짐 → 쉼」 한 박자로 맞춘다(제각각 깜빡이지 않게). 시각은 한 바퀴 비율(0 ~ 1)
  //   ① 모으기: 받침에서 선을 따라 빛이 차오르고 지나간 자리는 결 색으로 남는다(이글루는 아래 분홍 → 하늘 → 위 보라) · 선 위 보석은 빛이 닿을 때 켜진다
  //   ② 터짐: 짧은 바깥 선 끝부터 작게 톡 · 톡 터지다가(PEAK 직전) 맨 위 금속선 끝 · 받침 보석에서 네 갈래 빛이 크게 번쩍(작게 → 크게 → 작게) · 테두리 전체가 한 번 하얗게 번쩍
  //   ③ 흩어짐: 빛 알갱이가 바깥으로 튀며 사라지고 선의 빛은 아래부터 빠진다 · 금속 빛 띠가 훑는다(g.cycle — toSvg)
  //   ④ 쉼: 빛무리만 숨 쉬고 보석이 은은하게 반짝
  const AN = ANIM[T.key];
  const PEAK = 0.34, DR0 = 0.42, DR1 = 0.64, SEG = 12, EPS = 0.004;
  const both = (x) => [x, N - 1 - x];
  const inPhoto = (x, y) => x < 0 || y < 0 || x >= N || y >= N || dist(x, y) < RP - 0.6;
  const deep = (x, y) => x < 0 || y < 0 || x >= N || y >= N || dist(x, y) < RP - 4; // 번쩍 빛 · 알갱이는 사진 가장자리를 살짝 넘어도 된다(잠깐이라)
  const on = (t0, t1, op = 1, fade = 0.01) => [[Math.max(0, t0 - EPS), 0], [t0, op], [t1, op], [Math.min(1, t1 + fade), 0]];
  const PR = [GLOW_PRISM[2], GLOW_PRISM[1], GLOW_PRISM[0]]; // 이글루 결 색 — 아래 분홍 → 하늘 → 위 보라
  const FL = T.key === "igloo" ? { h: "#c8f4ff", l: "#8fe0ff" } : J; // 번쩍 빛 색(이글루는 받침 별 보석과 같은 하늘)
  g.extra = [];
  const add = (kf, cells) => { if (cells.length) g.extra.push({ kf, cells }); };
  // ① 모으기 — 선을 SEG 마디로 나눠 아래부터 차례로: 빛무리 두른 흰 머리가 지나가고 결 색 꼬리가 남는다 → 터진 뒤 아래부터 빠진다. 바깥 선일수록 일찍 끝난다(pop)
  const tips = [];
  for (const fl of flow) {
    const pop = PEAK - fl.i * 0.025, s0 = 0.02 + fl.i * 0.015, s1 = pop - 0.012, dt = (s1 - s0) / SEG;
    const own = new Set(fl.cells.flatMap(([x, y]) => both(x).map((X) => X + "," + y)));
    for (let k = 0; k < SEG; k++) {
      const seg = fl.cells.filter(([, , u]) => u >= k / SEG && (u < (k + 1) / SEG || k === SEG - 1));
      const t0 = s0 + dt * k, t1 = DR0 + ((DR1 - DR0) * k) / SEG;
      const tail = T.key === "igloo" ? PR[Math.min(2, Math.floor((k * 3) / SEG))] : fl.metal ? J.h : J.l;
      const cT = [], cH = [], cR = new Map();
      for (const [x, y, , col] of seg) for (const X of both(x)) if (c[y][X] === col) {
        cT.push([X, y, tail]); cH.push([X, y, "#ffffff"]);
        for (const [p, q] of nb4) if (!own.has(X + p + "," + (y + q)) && !inPhoto(X + p, y + q) && !baseSet.has(X + p + "," + (y + q))) cR.set(X + p + "," + (y + q), [X + p, y + q, FL.l]);
      }
      add([[0, 0], [t0 - EPS, 0], [t0 + dt, 0.7], [PEAK - 0.01, 0.95], [PEAK + 0.02, 1], [t1, 0.8], [t1 + 0.04, 0], [1, 0]], cT);
      add(on(t0, t0 + dt * 1.5, 1, dt * 1.5), cH);
      add(on(t0, t0 + dt * 1.5, 0.55, dt * 1.5), [...cR.values()]); // 머리 둘레 빛무리
    }
    // 끝 — 빛이 선 끝을 막 떠난 자리(선이 뻗던 쪽으로 1.5칸 더)
    const byU = [...fl.cells].sort((p, q) => q[2] - p[2]), tip = byU[0], prev = byU.find((q) => Math.hypot(q[0] - tip[0], q[1] - tip[1]) >= 2) || tip;
    const dl = Math.hypot(tip[0] - prev[0], tip[1] - prev[1]) || 1;
    if (tip) tips.push([tip[0] + ((tip[0] - prev[0]) / dl) * 1.5, tip[1] + ((tip[1] - prev[1]) / dl) * 1.5, fl.i, pop]);
  }
  // 선 위 보석 — 빛이 닿을 때 켜지고, 터질 때 하얗게, 쉴 때 은은하게 한 번
  const ln0 = sd.lines[0];
  gems.forEach((gc, i) => {
    const u = (ln0.a0 - sd.clasps[i]) / (ln0.a0 - ln0.a1), t0 = 0.02 + (PEAK - 0.032) * u, t1 = DR0 + (DR1 - DR0) * u;
    const cells = [];
    for (const [x0, y] of gc) for (const x of both(x0)) if (!baseSet.has(x + "," + y) && !inPhoto(x, y) && c[y][x]) cells.push([x, y, "#ffffff"]);
    add([[t0 - EPS, 0], [t0 + 0.01, 0.9], [t0 + 0.05, 0.3], [PEAK - 0.006, 0.3], [PEAK + 0.004, 1], [PEAK + 0.07, 0.35], [t1, 0.3], [t1 + 0.04, 0], [0.78 + i * 0.06, 0], [0.84 + i * 0.06, 0.55], [0.9 + i * 0.06, 0]], cells);
  });
  // ② 터짐 — 네 갈래 빛(가운데 흰 → 결 밝은 색, 대각선은 짧게). 선 끝마다 · 받침 보석 하나
  const flare = (cx, cy, L) => {
    const out = [], Ld = L >= 4 ? Math.floor(L * 0.45) : 0; // 작은 빛은 대각선 없이 + 모양
    for (let y = Math.floor(cy - L - 1); y <= Math.ceil(cy + L + 1); y++) for (let x = Math.floor(cx - L - 1); x <= Math.ceil(cx + L + 1); x++) {
      if (deep(x, y)) continue;
      const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy);
      const d = dy < 1 && dx <= L + 0.5 ? dx : dx < 1 && dy <= L + 0.5 ? dy : Ld >= 1 && Math.abs(dx - dy) < 0.6 && dx <= Ld + 0.5 ? dx * 1.6 : -1;
      if (d >= 0) out.push([x, y, d <= Math.max(1, L * 0.35) ? "#ffffff" : d <= L * 0.7 ? FL.h : FL.l]);
    }
    return out;
  };
  for (const [x, y, i, pop] of tips) if (i > 0) { // 바깥 선 끝 — 작게 톡
    const at2 = [[x + 0.5, y + 0.5], [N - 0.5 - x, y + 0.5]];
    add(on(pop - 0.004, pop + 0.025, 1, 0.004), at2.flatMap(([px, py]) => flare(px, py, 2)));
    add(on(pop + 0.025, pop + 0.05, 1, 0.004), at2.flatMap(([px, py]) => flare(px, py, 1)));
  }
  const stars = tips.filter((t) => t[2] === 0).flatMap(([x, y]) => [[x + 0.5, y + 0.5, AN.tip], [N - 0.5 - x, y + 0.5, AN.tip]]);
  if (g.gem) stars.push([g.gem[0], g.gem[1], AN.core]);
  for (const [sc, t0, t1] of [[0.45, PEAK - 0.012, PEAK + 0.006], [1, PEAK + 0.006, PEAK + 0.05], [0.65, PEAK + 0.05, PEAK + 0.09], [0.35, PEAK + 0.09, PEAK + 0.125]])
    add(on(t0, t1, 1, 0.004), stars.flatMap(([x, y, L]) => flare(x, y, Math.max(1, Math.round(L * sc)))));
  // 테두리 전체 번쩍 — 진한 칸 전부(빛무리 · 반짝이 빼고)를 한 번 하얗게
  const flash = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const v = c[y][x]; if (v && !v.includes("|") && !g.roles.fx.some((st) => st.has(x + "," + y))) flash.push([x, y, "#ffffff"]); }
  add([[PEAK - 0.004, 0], [PEAK + 0.004, AN.flash], [PEAK + 0.04, 0]], flash);
  // ③ 흩어짐 — 선 끝마다 바깥으로, 받침 보석은 아래로 부채꼴. 5 걸음(첫 걸음은 + 모양), 이글루는 알갱이마다 오로라 색
  const steps = Array.from({ length: 5 }, () => []);
  const shoot = (cx, cy, base, offs, spd) => offs.forEach((o, j) => {
    const th = rad(base + o);
    for (let st = 0; st < 5; st++) {
      const r = 1.5 + (st + 1) * spd * (1 + (j % 2) * 0.25), x = Math.floor(cx + r * Math.cos(th)), y = Math.floor(cy + r * Math.sin(th));
      if (deep(x, y)) continue;
      steps[st].push([x, y, st < 2 ? "#ffffff" : T.key === "igloo" ? PR[j % 3] : st < 4 ? FL.h : FL.l]);
      if (st === 0) for (const [p, q] of nb4) if (!deep(x + p, y + q)) steps[st].push([x + p, y + q, FL.l]);
    }
  });
  for (const [x, y] of stars.slice(0, 2)) shoot(x, y, (Math.atan2(y - C, x - C) * 180) / Math.PI, AN.sparks, 1.7);
  if (g.gem) shoot(g.gem[0], g.gem[1], 90, [-70, -35, 0, 35, 70], 1.9);
  steps.forEach((cells, st) => add(on(PEAK + 0.015 + st * 0.03, PEAK + 0.045 + st * 0.03, st < 4 ? 1 : 0.6, 0.006), cells));
  // 빛무리 · 금속 빛 띠도 같은 박자(toSvg) — 모을 때 차오르고 터질 때 가장 밝게, 빛 띠는 터진 직후 훑는다
  g.cycle = { period: CYCLE, shine: [PEAK + 0.03, PEAK + 0.24], glow: [[0, 0.5], [PEAK - 0.02, 0.75], [PEAK + 0.01, 1], [0.62, 0.6], [1, 0.5]] };
  return g;

}


export function renderFrame(T0) {
  const T = FRAME_TIER[T0.key] ? FRAME_TIER[T0.key](T0) : T0;
  const hi = !!T.glow;
  // 1) 받침 — 가로 목표에 가장 가까운 크기를 고른다
  let best = null;
  for (let S = 0.7; S <= 1.6; S += 0.02) {
    const g = base(T, S), w = widthOf(g), e = Math.abs(w - WIDTH[T.key]);
    if (!best || e < best.e) best = { g, e, S };
  }
  let c = best.g;
  if (T.rimLight) c = c.map((row, y) => row.map((v, x) => (v && !v.includes("|") && v !== T.M.o && dist(x, y) < CUT + T.rimLight && !(T.J && Object.values(T.J).includes(v) && dist(x, y) > CUT + 1) ? (dist(x, y) < CUT + 1 ? T.M.h : T.M.l) : v)));
  // 사진에 잘리고 남은 자잘한 조각(이어진 칸 10개 미만)은 지운다 — 잘린 날 끝이 부스러기처럼 보이지 않게
  {
    const seen = new Set();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!c[y][x] || seen.has(y * N + x)) continue;
      const comp = [[x, y]], st = [[x, y]]; seen.add(y * N + x);
      while (st.length) { const [px, py] = st.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + a, qy = py + b; if (qx >= 0 && qy >= 0 && qx < N && qy < N && c[qy][qx] && !seen.has(qy * N + qx)) { seen.add(qy * N + qx); comp.push([qx, qy]); st.push([qx, qy]); } } }
      if (comp.length < 10) for (const [qx, qy] of comp) c[qy][qx] = null;
    }
  }
  if (STAR[T.key]) { const [gx, gy0] = best.g.gem, gy = Math.max(gy0, C + RP + 3.5); star(c, gx, gy, STAR[T.key].arms, STAR[T.key].rIn, T.starM || T.keyM || T.M, T.key === "igloo" ? { o: "#241048", d: "#5a3cc0", m: "#8fe0ff", l: "#d8f6ff", h: "#ffffff" } : T.J); }
  let extra = [];
  if (HORN[T.key] && T.horns) {
    const H = HORN[T.key];
    const TH = { ...T, outer: [], lower: [], shards: [], back: undefined, star: 0, orb: false, glow: false, sideGems: false, fxAt: [], inner: { tip: 90, W: 0.01 }, wedge: { s: 0.01, gem: false }, inlayBand: 2,
      horns: T.horns.slice(0, H.tip.length).map((h, i) => ({ ...h, a0: H.a0 - i * 6, r0: RP - 2 + i * 2, r1: RP + H.r[i], tip: H.tip[i], W: (h.W ?? 3.6) * H.W * (i ? 0.85 : 1), hook: h.hook ? 2 : 0, prof: undefined })) };
    const gh = renderBorder(TH, N, { R: 24 });
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = gh.c[y][x], id = gh.part[y][x] || "";
      if (!v || v.includes("|") || !id.startsWith("horn") || c[y][x] || dist(x, y) < CUT) continue; // 받침이 앞, 사진 안은 비움
      c[y][x] = v;
    }
  }
  if (RING[T.key]) {
    const rg = RING[T.key], r0 = RP + 0.2;
    const IGP = ["#3fc0ea", "#9a7cff", "#ef6aa8"]; // 이글루 — 아래 하늘 → 보라 → 위 분홍
    const BY = [[0, 2], [3, 1]];
    const colAt = (t, x, y) => {
      if (T.key === "igloo") { const u = t * 2, i = Math.min(1, Math.floor(u)), fr = u - i; return IGP[fr > (BY[y & 1][x & 1] + 0.5) / 4 ? i + 1 : i]; }
      return T.key === "challenger" ? (t < 0.45 ? T.M.l : T.J.l) : T.J.m;
    };
    const wisp = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (c[y][x]) continue; // 받침이 앞
      const dx = x + 0.5 - C, dy = y + 0.5 - C, d = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI; // 좌우 대칭(오른쪽 기준 각도)
      const t = (rg.a0 - ang) / (rg.a0 - rg.a1); if (t < 0 || t > 1) continue;
      const w = rg.w * Math.pow(1 - t, 0.7) + 0.4;
      if (d < r0 || d >= r0 + w) continue;
      const op = t < 0.55 ? "" : t < 0.8 ? "|0.7" : "|0.4"; // 위로 갈수록 옅게
      c[y][x] = colAt(t, x, y) + op; wisp.push([x, y, t]);
    }
    // 오르는 빛 — 줄기를 ORBIT_STEPS 칸으로 나눠 아래 → 위 차례로 켠다(양옆 같이)
    for (let k = 0; k < ORBIT_STEPS; k++) {
      const t0 = k / ORBIT_STEPS, t1 = t0 + 1.6 / ORBIT_STEPS;
      const cells = wisp.filter(([, , t]) => t >= t0 && t < t1).map(([x, y, t]) => [x, y, t < 0.7 ? "#ffffff" : T.J.h]);
      for (let j = 0; j < rg.lights; j++) extra.push({ cls: "ob", delay: -(((k / ORBIT_STEPS) + j / rg.lights) % 1) * rg.period, cells });
    }
  }
  const roles = { glow: new Set(), rays: new Set(), fx: [], float: [] };
  if (hi) {
    // 2) 떠다니는 보석 — 사진 위 양옆에 한 쌍씩(좌우 같은 박자로 둥실)
    const gemPal = (side, i) => (T.key === "igloo" ? PRISM_GEM[side < 0 ? (i % 2 ? 1 : 0) : (i % 2 ? 1 : 2)] : T.key === "grandmaster" ? T.J : T.J);
    (FLOAT[T.key] || []).forEach(([a, gap, rx, ry], i) => {
      const set = new Set();
      for (const side of [1, -1]) {
        const r = RP + gap, ang = (a * Math.PI) / 180;
        const cx = C + side * r * Math.cos(ang), cy = C + r * Math.sin(ang);
        for (const [x, y, col] of kite(cx, cy, rx, ry, gemPal(side, i))) if (x >= 0 && y >= 0 && x < N && y < N && !c[y][x]) { c[y][x] = col; set.add(`${x},${y}`); }
      }
      roles.float.push(set);
    });
    // 3) 반짝이 — 시안 14 자리를 사진 가까이로 당겨서(그리기 도구의 반짝이 모양 그대로)
    const TF = { ...T, outer: [], lower: [], shards: [], horns: undefined, back: undefined, star: 0, orb: false, glow: false, sideGems: false, inner: { tip: 90, W: 0.01 }, wedge: { s: 0.01, gem: false },
      fxAt: (T.fxAt || []).map(([r, a, sd, nn]) => [24 + (r - 24) * 0.6 + 3, a, sd, nn]) };
    const gf = renderBorder(TF, N, { R: 24 });
    for (const st of gf.roles.fx) {
      const set = new Set();
      for (const k of st) { const [x, y] = k.split(",").map(Number); const v = gf.c[y][x]; if (v && !c[y][x] && dist(x, y) >= HOLE + 2) { c[y][x] = v; set.add(k); } }
      if (set.size) roles.fx.push(set);
    }
    // 4) 빛무리 — 받침 · 보석 둘레 한 겹(숨쉬듯). 이글루는 오로라 색이 흐른다
    const solid = (x, y) => { const v = c[y]?.[x]; return v && !v.includes("|") && !roles.fx.some((s) => s.has(`${x},${y}`)); };
    const colAt = (y) => (T.glow === "prism" ? GLOW_PRISM[y < C - 6 ? 0 : y < C + 18 ? 1 : 2] : T.J.l);
    let edge = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (solid(x, y)) edge.push([x, y]);
    const seen = new Set(edge.map(([x, y]) => `${x},${y}`));
    for (const [alpha, dotted] of [["0.32", false]]) {
      const next = [];
      for (const [x, y] of edge) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const X = x + a, Y = y + b, k = `${X},${Y}`;
        if (X < 0 || Y < 0 || X >= N || Y >= N || seen.has(k) || c[Y][X] || dist(X, Y) < HOLE + 1) continue;
        seen.add(k); next.push([X, Y]);
      }
      for (const [x, y] of next) { if (dotted && (x + y) % 2) continue; c[y][x] = `${colAt(y)}|${alpha}`; roles.glow.add(`${x},${y}`); }
      edge = next;
    }
  }
  const gem = STAR[T.key] ? [best.g.gem[0], Math.max(best.g.gem[1], C + RP + 3.5)] : best.g.gem; // 받침 보석(별) 가운데 — 움직임의 터짐 자리
  const g = { c, roles, S: best.S, extra, gem, orbitSteps: ORBIT_STEPS, orbitPeriod: RING[T.key]?.period };
  return LINES[T.key] ? addSide(g, T) : g;
}

// 그림이 가운데에서 뻗는 거리(칸) [위, 아래, 옆, 옆(테두리 몸만)] — 앞의 셋은 빛무리 · 반짝이까지, 넷째는 반투명 빛무리 · 반짝이를 뺀 테두리 몸.
//    화면은 카드 가장자리 쪽 여백엔 앞의 셋(잘리지 않게), 옆 글자 쪽 여백엔 넷째(반짝이는 글자 칸에 살짝 걸쳐도 된다 — 2026-10-10 이글루만 칩이 3줄 되던 것)
export function reachOf(g) {
  let up = 0, down = 0, side = 0, core = 0;
  const fx = new Set(); (g.roles?.fx || []).forEach((st) => st.forEach((k) => fx.add(k)));
  g.c.forEach((row, y) => row.forEach((v, x) => {
    if (!v) return;
    const d = Math.abs(x + 0.5 - C) + 0.5;
    up = Math.max(up, C - y); down = Math.max(down, y + 1 - C); side = Math.max(side, d);
    if (!v.includes("|") && !fx.has(x + "," + y)) core = Math.max(core, d);
  }));
  return [Math.max(0, Math.round(up)), Math.round(down), Math.round(side), Math.round(core)];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const out = join(root, "public", "avatar-borders");
  mkdirSync(out, { recursive: true });
  const art = {}, reach = {};
  for (const T of BORDER_TIERS) {
    const g = renderFrame(T);
    const svg = toSvg(g, T);
    writeFileSync(join(out, `${T.key}.svg`), svg);
    art[T.key] = staticSvg(g);
    reach[T.key] = reachOf(g);
    console.log(T.key.padEnd(12), "크기", g.S.toFixed(2), "SVG", svg.length);
  }
  // 📌 lib/avatarFrameArt.js · bot/src/avatarFrameArt.js — 디스코드 /레벨 · 레벨업 카드(lib/botCards 공용 블록)가 쓰는 정지 그림. 두 파일은 같아야 한다(여기서만 만든다)
  const mod = `// 📌 아바타 테두리 정지 그림 — scripts/gen-avatar-frames.mjs 가 만든다(손으로 고치지 말 것). lib/avatarFrameArt.js 와 bot/src/avatarFrameArt.js 는 같은 파일이다
//    디스코드 이미지 카드(botCards 공용 블록 profileCard)가 쓴다 — 사이트 화면은 public/avatar-borders/<키>.svg(움직임 있음)
export const FRAME_ART = ${JSON.stringify(art)};
// 그림이 사진 가운데에서 뻗는 거리(칸, 128칸 · 구멍 48칸) [위, 아래, 옆] — 카드가 사진 크기 · 자리를 맞출 때 쓴다(app/components/AvatarFrame FRAME_REACH 와 같은 값)
export const FRAME_REACH = ${JSON.stringify(reach)};
`;
  writeFileSync(join(root, "lib", "avatarFrameArt.js"), mod);
  writeFileSync(join(root, "bot", "src", "avatarFrameArt.js"), mod);
  console.log("frame art module", mod.length);
  console.log("FRAME_REACH", JSON.stringify(reach));
}
