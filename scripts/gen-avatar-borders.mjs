// 📌 티어 그림 그리기 도구 · 등급 색표(BORDER_TIERS) — 티어 엠블럼(scripts/gen-tier-emblems.mjs)과 아바타 테두리(scripts/gen-avatar-frames.mjs)가 쓴다.
//    2026-10-10 부터 아바타 테두리 그림은 gen-avatar-frames.mjs 가 만든다(지금 엠블럼을 사진 아래 받침으로). 아래 설명은 이 도구로 처음 그린 옛 테두리(시안 14) 기록
//
//    2026-10-06 운영자 확정 시안(롤 랭크 테두리 짜임): 링으로 다 감싸지 않고 아래 받침(겹친 칼날) + 가운데 쐐기 보석.
//    등급이 오를수록 겹이 늘고 끝이 위로 솟는다 — 마스터부터 뿔 · 빛무리, 챌린저 · 이글루는 두 뿔이 머리 위에서 만나 별 보석.
//    128×128 칸 도트, 가운데 아바타 구멍 반지름 24칸 → 아바타 지름의 128/48 배 크기로 아바타 가운데에 겹쳐 그린다(lib/avatarBorders.js).
import { fileURLToPath } from "url";

// 그림은 설계 좌표(128 단위, 가운데 C = 64, 아바타 구멍 반지름 R = 24)로 정하고, 칸 수 N 으로 찍는다(K = N / 128).
//    화면 크기에 맞춰 한 칸이 정확히 2px 가 되도록 N 을 고른다(lib/avatarBorders.js) — 128칸을 작게 줄이면 칸이 1.3px 처럼 어중간해져 도트가 깨져 보인다
const C = 64;
let R = 24; // 아바타 구멍 반지름 — 티어 엠블럼(scripts/gen-tier-emblems.mjs)은 작게(9) 찍어 날개가 가운데로 모이게 한다
let N = 128, K = 1, GC = 64;
let SY = 1; // 세로 눌림 — 설계 좌표 y 를 가운데(C) 기준으로 SY 배(칸의 굵기 · 폭은 그대로라 세부가 남는다)
const yIn = (y) => C + ((y + 0.5) / K - C) / SY; // 칸 y → 설계 좌표 y(눌림 되돌림)
const yOut = (Y) => C + (Y - C) * SY; // 설계 좌표 y → 눌린 설계 좌표 y
const rad = (d) => (d * Math.PI) / 180;
const P = (r, a) => [C + r * Math.cos(rad(a)), C + r * Math.sin(rad(a))];
const lerp = (a, b, t) => a + (b - a) * t;
const Rm = (o, d, m, l, h) => ({ o, d, m, l, h }); // 외곽 · 그늘 · 중간 · 밝음 · 빛

class G {
  constructor() { this.c = Array.from({ length: N }, () => Array(N).fill(null)); }
  get(x, y) { return x >= 0 && y >= 0 && x < N && y < N ? this.c[y][x] : null; }
  set(x, y, c) { if (x >= 0 && y >= 0 && x < N && y < N && c) this.c[y][x] = c; }
  over(b) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (b.c[y][x]) this.c[y][x] = b.c[y][x]; return this; }
  outline(col) { const add = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!this.c[y][x] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => this.get(x + a, y + b))) add.push([x, y]); for (const [x, y] of add) this.c[y][x] = col; return this; }
}
function inPoly(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }
function fill(m, pts, v) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.max(0, Math.floor(yOut(y0) * K) - 1); y <= Math.min(N - 1, Math.ceil(yOut(y1) * K) + 1); y++)
    for (let x = Math.max(0, Math.floor(x0 * K)); x <= Math.min(N - 1, Math.ceil(x1 * K)); x++)
      if (inPoly((x + 0.5) / K, yIn(y), pts)) m[y][x] = v;
}
// 칼날 폭 — 밑동 base 배에서 peak 까지 넓어졌다가 끝으로 좁아짐
const wBlade = (W0, base = 0.7, peak = 0.3) => (t) => {
  const W = W0 * 1.6;
  if (t < peak) return W * (base + (1 - base) * (t / peak));
  return W * Math.pow(Math.max(0, 1 - (t - peak) / (1 - peak)), 0.85);
};
// 칼날 한 장 — 등뼈 기준 빛 받는 면 / 그늘 면. 능선 밝게, 위 가장자리 빛, 아래 가장자리 그늘, 외곽선
function blade(spine, w, M, o = {}) {
  const S = 64, sp = [], A = [], B = [], nr = [];
  for (let i = 0; i <= S; i++) sp.push(spine(i / S));
  let dot = 0;
  for (let i = 0; i <= S; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(S, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = -ty, ny = tx, ww = Math.max(0, w(i / S));
    nr.push([nx, ny, ww]);
    A.push([sp[i][0] + nx * ww, sp[i][1] + ny * ww]); B.push([sp[i][0] - nx * ww, sp[i][1] - ny * ww]);
    dot += -0.37 * nx - 0.93 * ny;
  }
  const sg = dot > 0 ? 1 : -1, lit = sg > 0 ? A : B, dark = sg > 0 ? B : A;
  const sh = o.litShift || 0, mid = sh ? sp.map((p, i) => [p[0] - sg * nr[i][0] * nr[i][2] * sh, p[1] - sg * nr[i][1] * nr[i][2] * sh]) : sp;
  const m = Array.from({ length: N }, () => new Uint8Array(N));
  fill(m, [...mid, ...dark.slice().reverse()], 2);
  fill(m, [...lit, ...mid.slice().reverse()], 1);
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? m[y][x] : 0);
  const g = new G();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = m[y][x]; if (!v) continue;
    let c;
    if (v === 1) {
      const ridge = at(x + 1, y) === 2 || at(x - 1, y) === 2 || at(x, y + 1) === 2 || at(x, y - 1) === 2;
      c = ridge || !at(x, y - 1) ? M.h : M.l;
    } else {
      const band = !o.inlayBand || [...Array(o.inlayBand * 2 + 1).keys()].some((i) => [...Array(o.inlayBand * 2 + 1).keys()].some((j) => at(x + i - o.inlayBand, y + j - o.inlayBand) === 1));
      c = !at(x, y + 1) ? M.d : (band && o.inlay) || M.m;
      if (!at(x, y - 1)) c = M.l;
    }
    g.c[y][x] = c;
  }
  const cellAt = (i, f) => { const [nx, ny, ww] = nr[i]; return [Math.floor((sp[i][0] + sg * nx * ww * f) * K), Math.floor(yOut(sp[i][1] + sg * ny * ww * f) * K)]; };
  // 새김 홈 — 넓은 곳에만
  if (o.groove) for (let i = Math.round(S * 0.12); i <= Math.round(S * 0.72); i++) {
    if (nr[i][2] < 2.9) continue;
    const [x, y] = cellAt(i, 0.62);
    if (at(x, y) === 1 && g.c[y][x] === M.l) g.c[y][x] = M.m;
  }
  // 리벳(브론즈)
  if (o.rivets) for (const t of o.rivets) { const [x, y] = cellAt(Math.round(t * S), 0.5); if (at(x, y)) { g.c[y][x] = M.h; if (at(x + 1, y + 1)) g.c[y + 1][x + 1] = M.d; } }
  return g.outline(M.o);
}
// 좌우 대칭 조각(쐐기 · 별) — 가운데 능선 밝게, midY 아래는 그늘
function sym(pts, M, midY, o = {}) {
  const m = Array.from({ length: N }, () => new Uint8Array(N));
  fill(m, pts, 1);
  const at = (x, y) => (x >= 0 && y >= 0 && x < N && y < N ? m[y][x] : 0);
  const g = new G();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!m[y][x]) continue;
    let c = yIn(y) < midY ? M.l : o.inlay || M.m;
    if (x === GC - 1 || x === GC) c = yIn(y) < midY ? M.h : M.l;
    if (!at(x, y - 1)) c = M.h;
    else if (!at(x, y + 1)) c = M.d;
    g.c[y][x] = c;
  }
  return g.outline(M.o);
}
function gemKite(g, cx, cy, rx, ry, J, M) {
  const l = new G();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = ((x + 0.5) / K - cx) / rx, dy = ((y + 0.5) / K - yOut(cy)) / ry;
    if (Math.abs(dx) + Math.abs(dy) > 1) continue;
    l.c[y][x] = dy < -0.2 ? (dx < 0 ? J.h : J.l) : dy < 0.3 ? (dx < 0 ? J.l : J.m) : J.d;
  }
  l.outline(M.o);
  g.over(l);
  g.set(Math.floor((cx - rx * 0.35) * K), Math.floor((yOut(cy) - ry * 0.4) * K), "#ffffff");
}
function orb(g, cx, cy, r, J) {
  const l = new G();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = (x + 0.5) / K, Y = yIn(y);
    const d = Math.hypot(X - cx, Y - cy); if (d > r) continue;
    const h = Math.hypot(X - (cx - r * 0.35), Y - (cy - r * 0.35));
    l.c[y][x] = h < r * 0.35 ? J.h : h < r * 0.8 ? J.l : d > r - 1 / K && X > cx && Y > cy - 1 ? J.d : J.m;
  }
  l.outline(J.o);
  g.over(l);
  g.set(Math.floor((cx - r * 0.4) * K), Math.floor(yOut(cy - r * 0.45) * K), "#ffffff");
}
// 둘레 반짝이 — 등급마다 모양 · 자리 따로(다이아 반짝 · 마스터 빛 알갱이 · 그마 불씨 · 챌린저 · 이글루 별빛)
function fx(g, T) {
  let cur = null;
  const put = (x, y, c) => { const v = g.get(x, y); if (!v || v.includes("|")) { g.set(x, y, c); if (cur && x >= 0 && y >= 0 && x < N && y < N) cur.add(`${x},${y}`); } };
  const J = T.J;
  for (const [r, a, side, n = 1] of T.fxAt || []) {
    cur = new Set(); g.roles.fx.push(cur);
    let [x, y] = P(r, a); x = Math.floor(x * K); y = Math.floor(y * K); if (side < 0) x = N - 1 - x;
    if (T.fx === "glint" || T.fx === "star") {
      put(x, y, "#ffffff");
      const arm = T.fx === "star" ? n + 1 : n;
      for (const [a2, b2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let k = 1; k <= arm; k++) put(x + a2 * k, y + b2 * k, k === 1 ? J.h : `${J.l}|${(0.85 - (k - 2) * 0.25).toFixed(2)}`);
      if (T.fx === "star" && n > 1) for (const [a2, b2] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(x + a2, y + b2, `${J.l}|0.5`);
    } else if (T.fx === "mote") {
      put(x, y, J.h);
      if (n > 1) put(x + 1, y, J.l), put(x, y + 1, J.l), put(x + 1, y + 1, J.m);
      for (const [a2, b2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + a2 * (n > 1 ? 1.5 : 1) | 0, y + b2, `${J.l}|0.4`);
    } else if (T.fx === "ember") {
      put(x, y, "#ffe0a8"); put(x, y + 1, `${J.m}|0.75`); put(x, y + 2, `${J.d}|0.4`);
      if (n > 1) put(x + 1, y, `${J.l}|0.7`);
    }
  }
}

const BR = Rm("#2a1208", "#6e3a1c", "#a8622f", "#d68c4f", "#ffd09a");
const SI = Rm("#151a24", "#4a5568", "#8a96a8", "#c9d2de", "#ffffff");
const GO = Rm("#3a1e04", "#8e5410", "#d0911e", "#f7c548", "#fff3b0");
const PL = Rm("#12302c", "#3f6e69", "#86b6b0", "#c6e6e1", "#f4fffd");
const DI = Rm("#121e48", "#3550a0", "#6a8ae0", "#a9c4ff", "#eef4ff");
const MA = Rm("#1c0e30", "#4c2c7c", "#8058c0", "#b694e8", "#efe2ff");
const GM = Rm("#140a0e", "#3a2a30", "#6a5660", "#9c8a92", "#e0d2d6");
const CH = Rm("#3e2406", "#9a6618", "#dca434", "#ffd666", "#fff6c4");
const PR = Rm("#2a2040", "#8a86a8", "#c8c4dc", "#eeeaf8", "#ffffff");
const CRY = Rm("#1a2a6a", "#7aa6e8", "#b8d8ff", "#e6f4ff", "#ffffff");
const J = {
  br: Rm("#2a160a", "#7a3a10", "#c0661e", "#f0a040", "#ffe0a0"),
  si: Rm("#0e1e3a", "#2a4a78", "#4f7fc0", "#8fb8ea", "#d0e6ff"),
  go: Rm("#3a0606", "#8e1414", "#d8302a", "#ff7a5a", "#ffd0c0"),
  pl: Rm("#06362c", "#118a6e", "#27caa0", "#86f2d2", "#e6fff7"),
  di: Rm("#1e1250", "#4a3cb8", "#7f78f0", "#c4c0ff", "#ffffff"),
  ma: Rm("#2a0a40", "#7a2ab8", "#b45cf0", "#e2b2ff", "#ffffff"),
  gm: Rm("#3a0408", "#a01418", "#ee3a2a", "#ff9a6a", "#ffe8c8"),
  ch: Rm("#0a2450", "#1d5fc8", "#3fa0ff", "#a8dcff", "#ffffff"),
  pr: Rm("#241048", "#6a4ad8", "#9a8cff", "#8ff0ff", "#ffffff"),
};
// 받침(inner) · 바깥 날개(outer) · 아래 날개(lower) · 뿔(horns) · 뒤 큰 날개(back) — 각도는 오른쪽 기준(왼쪽은 좌우 대칭)
export const BORDER_TIERS = [
  { key: "bronze", M: BR, J: J.br, rivets: true, groove: true, inner: { tip: 14, W: 3, fl: 6 }, outer: [{ tip: -2, ext: 11, W: 2.6 }, { tip: 24, ext: 10, W: 2.4 }], lower: [{ a1: 72, ext: 9, W: 2.2 }], wedge: { s: 3.8, gem: true } },
  { key: "silver", M: SI, J: J.si, groove: true, inlay: "#5d6b82", inner: { tip: 4, W: 3, fl: 5 }, outer: [{ tip: -12, ext: 13, W: 2.8 }, { tip: 12, ext: 13, W: 2.6 }, { tip: 34, ext: 9, W: 2.2 }], lower: [{ a1: 58, ext: 9, W: 2.2 }, { a1: 74, ext: 10, W: 2 }], wedge: { s: 4.4, gem: true } },
  { key: "gold", M: GO, J: J.go, groove: true, inlay: "#b06a14", inner: { tip: -12, W: 3.2, fl: 5 }, outer: [{ tip: -20, ext: 14, W: 3 }, { tip: 2, ext: 14, W: 2.9 }, { tip: 24, ext: 12, W: 2.6 }], lower: [{ a1: 52, ext: 10, W: 2.4 }, { a1: 70, ext: 11, W: 2.1 }], wedge: { s: 5.4, gem: true }, sideGems: true },
  { key: "platinum", M: PL, J: J.pl, groove: true, inlay: "d", inner: { tip: -32 }, outer: [{ tip: -12, ext: 13 }, { tip: 8, ext: 13 }, { tip: 28, ext: 10, W: 2.6 }], lower: [{ a1: 50, ext: 9 }, { a1: 66, ext: 11, W: 2 }], wedge: { s: 5.5, gem: true } },
  { key: "diamond", M: DI, J: J.di, inlay: "d", inner: { tip: -40 }, outer: [{ tip: -20, ext: 14 }, { tip: 2, ext: 15 }, { tip: 24, ext: 12 }], lower: [], shards: [{ a: 46, r: R + 7, len: 12, W: 2 }, { a: 60, r: R + 6, len: 16, W: 2.3 }, { a: 75, r: R + 5, len: 11, W: 1.8 }], wedge: { s: 6, gem: true },
    fx: "glint", fxAt: [[R + 23, -26, 1, 2], [R + 22, 52, -1, 2], [R + 31, 6, -1, 1]] },
  { key: "master", M: MA, J: J.ma, inlay: "m", glow: true, horns: [{ tip: -80, r1: R + 16, W: 3.6 }], inner: { tip: -38 }, outer: [{ tip: -16, ext: 15 }, { tip: 6, ext: 16 }, { tip: 26, ext: 13 }], lower: [{ a1: 50, ext: 10 }, { a1: 66, ext: 12, W: 2 }], wedge: { s: 6, gem: true }, orb: true,
    fx: "mote", fxAt: [[R + 19, -64, 1, 2], [R + 26, -36, -1, 1], [R + 29, 2, 1, 1], [R + 22, 44, -1, 2], [R + 33, -12, -1, 1], [R + 16, 78, 1, 1]] },
  { key: "grandmaster", M: GM, J: J.gm, inlay: "m", glow: true, serrate: true, horns: [{ tip: -82, r1: R + 18, W: 4, hook: 3.2 }], inner: { tip: -42 }, outer: [{ tip: -22, ext: 16 }, { tip: -2, ext: 17 }, { tip: 18, ext: 16 }, { tip: 36, ext: 12, W: 2.6 }], lower: [{ a1: 54, ext: 14 }, { a1: 70, ext: 15, W: 2.2 }], wedge: { s: 7, gem: true },
    fx: "ember", fxAt: [[R + 21, -88, 1, 2], [R + 27, -80, -1, 1], [R + 33, -86, 1, 1], [R + 25, -62, -1, 2], [R + 36, -70, -1, 1], [R + 30, -48, 1, 1], [R + 17, -96, -1, 1]] },
  { key: "challenger", M: CH, J: J.ch, inlay: "m", glow: true, horns: [{ tip: -90, r1: R + 17, W: 4.2, prof: "lin" }, { tip: -58, r1: R + 12, W: 3 }], inner: { tip: -44 }, outer: [{ tip: -24, ext: 17 }, { tip: -4, ext: 18 }, { tip: 16, ext: 17 }, { tip: 34, ext: 13 }], lower: [{ a1: 48, ext: 12 }, { a1: 62, ext: 14 }, { a1: 76, ext: 12, W: 2 }], wedge: { s: 7, gem: true }, star: 4,
    fx: "star", fxAt: [[R + 26, -62, -1, 2], [R + 31, -24, 1, 2], [R + 34, 12, -1, 1], [R + 27, 52, 1, 1]] },
  { key: "igloo", M: PR, J: J.pr, inlay: "#a98cff", glow: "prism", prism: ["#6fd8f0", "#a98cff", "#ff8fc8"], innerM: CH, keyM: CH, starM: CH, sideGems: true,
    horns: [{ tip: -90, r1: R + 18, W: 4.4, prof: "lin" }, { tip: -64, r1: R + 13.5, W: 3.2 }, { tip: -40, r1: R + 9.5, W: 2.6 }], inner: { tip: -46 },
    outer: [{ tip: -28, ext: 18 }, { tip: -8, ext: 19 }, { tip: 12, ext: 19 }, { tip: 30, ext: 16 }, { tip: 46, ext: 12, W: 2.4 }], lower: [{ a1: 50, ext: 13 }, { a1: 64, ext: 15 }, { a1: 78, ext: 12, W: 2 }], wedge: { s: 7.4, gem: true },
    star: 8, back: [{ a0: 34, tip: -50, r0: R + 9, ext: 27, W: 3.4 }, { a0: 46, tip: -26, r0: R + 9, ext: 26, W: 3 }],
    fx: "star", fxAt: [[R + 30, -70, 1, 2], [R + 34, -38, -1, 2], [R + 37, -4, 1, 1], [R + 31, 30, -1, 2], [R + 25, 62, 1, 1], [R + 39, -56, -1, 1]] },
];

// n: 칸 수(짝수) — 128 이면 시안 그대로, 작을수록 굵은 도트 · opt.R: 구멍 반지름(설계 단위, 기본 24)
export function renderBorder(T, n = 128, opt = {}) {
  N = n; K = n / 128; GC = n / 2; R = opt.R ?? 24; SY = opt.sy ?? 1;
  const { M, J: Jw } = T;
  const inlay = T.inlay === "m" ? Jw.m : T.inlay === "d" ? Jw.d : T.inlay || null;
  const prism = (k) => (T.prism ? { inlay: T.prism[k % T.prism.length] } : {});
  const g = new G();
  // 움직임용 표시 — 빛무리 · 별 빛살 · 반짝이 알갱이(toSvg 가 묶어 CSS 움직임을 단다)
  g.roles = { glow: new Set(), rays: new Set(), fx: [] };
  // 부품 표시 — 그리기 한 덩어리(fn)가 바꾼 칸마다 부품 이름(id). 승급 화면이 부품 단위로 조립한다(scripts/gen-tier-emblems.mjs)
  g.part = Array.from({ length: N }, () => Array(N).fill(null));
  const as = (id, fn) => {
    const before = g.c.map((r) => r.slice());
    fn();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g.c[y][x] !== before[y][x]) g.part[y][x] = id;
  };
  const B = (spine, w, o = {}) => g.over(blade(spine, w, o.M || M, { inlay, groove: T.groove, inlayBand: T.inlayBand, ...o }));
  // 뒤 큰 날개(이글루)
  (T.back || []).forEach((bw, bi) => as(`back${bi}`, () => B((t) => P(bw.r0 + bw.ext * Math.pow(t, 1.25), lerp(bw.a0, bw.tip, t)), wBlade(bw.W, 0.45, 0.35), prism(0))));
  // 뿔 — 옆에서 솟아 위로(그마는 끝이 갈고리, 챌린저 · 이글루는 머리 위에서 만남)
  (T.horns || []).forEach((h, hi) => {
    const hs = (t) => {
      const grow = h.prof === "lin" ? Math.pow(t, 0.9) : Math.sin((t * Math.PI) / 2);
      const hook = h.hook && t > 0.82 ? Math.pow((t - 0.82) / 0.18, 2) * h.hook : 0;
      const r0 = h.r0 ?? R + 5;
      return P(r0 + (h.r1 - r0) * grow - hook, lerp(h.a0 ?? 16, h.tip, t));
    };
    if (T.serrate && hi === 0) for (const t of [0.32, 0.5, 0.68]) {
      const p = hs(t), q = hs(t + 0.02);
      let ox = p[0] - C, oy = p[1] - C; const ol = Math.hypot(ox, oy); ox /= ol; oy /= ol;
      let tx = q[0] - p[0], ty = q[1] - p[1]; const tl = Math.hypot(tx, ty); tx /= tl; ty /= tl;
      const dx = ox * 0.75 + tx * 0.65, dy = oy * 0.75 + ty * 0.65, dl = Math.hypot(dx, dy);
      as("horn0", () => B((s) => [p[0] + ox * 1.5 + (dx / dl) * 6.5 * s, p[1] + oy * 1.5 + (dy / dl) * 6.5 * s], wBlade(1.7, 1, 0.15)));
    }
    as(`horn${hi}`, () => B(hs, wBlade(h.W, 0.95, 0.18), prism(hi + 1)));
  });
  // 아래 날개(아래로 길게 뻗는 것부터)
  for (const f of [...(T.lower || [])].sort((a, b) => b.a1 - a.a1)) as("lower", () => B((t) => P(lerp(R + 5, R + 5 + f.ext, Math.pow(t, 1.1)), lerp(86, f.a1, t)), wBlade(f.W ?? 2.4, 0.6, 0.3), prism(2)));
  // 수정 조각(다이아몬드)
  for (const s of T.shards || []) as("shard", () => B((t) => P(s.r + s.len * t, s.a - 6 * t), wBlade(s.W, 0.5, 0.35), { M: CRY, inlay: null, groove: false }));
  // 바깥 날개 — 아래 겹부터
  for (let k = T.outer.length - 1; k >= 0; k--) {
    const ow = T.outer[k], a0 = 76 - k * 2.5, r0 = R + 4 + k * 0.5;
    as(`outer${k}`, () => B((t) => P(r0 + ow.ext * Math.pow(t, 1.35), lerp(a0, ow.tip, t)), wBlade(ow.W ?? 3.3 - k * 0.15, 0.5, 0.3), { rivets: T.rivets ? [0.45] : null, ...prism(k) }));
  }
  // 안쪽 받침 — 아바타 아래를 받친다
  as("inner", () => B((t) => P(R + 4.6 + (t > 0.7 ? Math.pow((t - 0.7) / 0.3, 2) * (T.inner.fl ?? 3.5) : 0), lerp(91, T.inner.tip, t)), wBlade(T.inner.W ?? 3.3, 0.9, 0.3),
    { rivets: T.rivets ? [0.28, 0.6] : null, litShift: T.innerLitShift, ...(T.innerM ? { M: T.innerM, inlay: T.prism ? T.prism[1] : T.innerM.m } : {}) }));
  // 좌우 대칭(오른쪽 → 왼쪽)
  for (let y = 0; y < N; y++) for (let x = 0; x < GC; x++) { g.c[y][x] = g.c[y][N - 1 - x]; g.part[y][x] = g.part[y][N - 1 - x]; }
  // 가운데 쐐기 · 보석
  const KM = T.keyM || M, s = T.wedge.s * 1.3, mid = C + R + s * 0.8;
  as("wedge", () => g.over(sym([[C, C + R - 2], [C + s, mid], [C + s * 0.5, mid + s * 0.55], [C, C + R + s * 2.4], [C - s * 0.5, mid + s * 0.55], [C - s, mid]], KM, mid, { inlay: T.keyM ? KM.m : inlay })));
  if (T.wedge.gem) as("wedge", () => gemKite(g, C, mid - 0.2, Math.max(1.6, s * 0.45), Math.max(2.2, s * 0.68), Jw, KM));
  if (T.sideGems) for (const sx of [-1, 1]) { const [x, y] = P(R + 5.2, 50); as("inner", () => gemKite(g, sx > 0 ? x : 2 * C - x, y, 1.6, 2.2, Jw, M)); }
  if (T.orb) as("orb", () => orb(g, C, C - R - 8, 3.4, Jw));
  // 두 뿔이 만나는 꼭대기의 별 보석 · 빛살(챌린저 4각 · 이글루 8각)
  if (T.star) {
    const sy = C - T.horns[0].r1, SM = T.starM || M, s8 = T.star === 8;
    for (const [dx, dy, L, op] of [[0, -1, 9, 0.5], [0.7, -0.7, 6, 0.4], [-0.7, -0.7, 6, 0.4], [1, 0, 5, 0.3], [-1, 0, 5, 0.3]])
      for (let k = s8 ? 13 : 9; k < (s8 ? 10 : 9) + L; k++) {
        const x = Math.floor((C - 0.5 + dx * k + (dx > 0 ? 1 : 0)) * K), y = Math.floor((sy + dy * k) * K);
        if (!g.get(x, y)) { g.set(x, y, `${Jw.l}|${op}`); g.roles.rays.add(`${x},${y}`); }
        if (dx === 0 && !g.get(x - 1, y)) { g.set(x - 1, y, `${Jw.l}|${op}`); g.roles.rays.add(`${x - 1},${y}`); }
      }
    const pts = s8
      ? Array.from({ length: 16 }, (_, k) => { const a = -90 + k * 22.5, r = k % 2 ? 3.4 : [17, 7, 12, 7, 11, 7, 12, 7][k / 2]; return [C + r * Math.cos(rad(a)), sy + r * Math.sin(rad(a))]; })
      : [[C, sy - 15], [C + 2.8, sy - 2.8], [C + 11, sy], [C + 2.8, sy + 2.8], [C, sy + 10], [C - 2.8, sy + 2.8], [C - 11, sy], [C - 2.8, sy - 2.8]];
    as("star", () => { g.over(sym(pts, SM, sy + 0.5, { inlay: SM.m })); gemKite(g, C, sy, s8 ? 3.6 : 3.2, s8 ? 5 : 4.6, Jw, SM); });
  }
  // 아바타 구멍 · 잘린 안쪽 가장자리 외곽선
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot((x + 0.5) / K - C, (y + 0.5) / K - C);
    if (d < R) g.c[y][x] = null;
    else if (d < R + 1 / K && g.c[y][x]) g.c[y][x] = M.o;
  }
  // 빛무리(마스터 ~) — 이글루는 위 보라 · 가운데 하늘 · 아래 분홍
  if (T.glow) {
    const col = (y) => (T.glow === "prism" ? (y / K < C - 12 ? "#d0b8ff" : y / K < C + 12 ? "#a8ecff" : "#ffc8e8") : Jw.l);
    const ring = (alpha) => {
      const add = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (g.c[y][x] || Math.hypot((x + 0.5) / K - C, (y + 0.5) / K - C) < R) continue;
        let hit = false;
        for (let a = -1; a <= 1 && !hit; a++) for (let b = -1; b <= 1 && !hit; b++) { const v = g.get(x + a, y + b); if (v && !v.endsWith("|0.2")) hit = true; }
        if (hit) add.push([x, y]);
      }
      for (const [x, y] of add) { g.c[y][x] = `${col(y)}|${alpha}`; g.roles.glow.add(`${x},${y}`); }
    };
    ring(0.45); ring(0.2);
  }
  fx(g, T);
  return g;
}
// 📌 움직임 — 등급이 오를수록 하나씩 붙는다(같은 장식이 커지는 것처럼). 그림 SVG 안의 CSS 라 <img> 로 넣어도 돈다 · 움직임 줄이기면 멈춘다
//    shine: 금속 위를 훑는 빛 [세기, 주기 초] — 마스터부터(2026-10-06 "마스터?" — 아래 등급은 가만히) · 반짝이(fx): 다이아 반짝 · 마스터 빛 알갱이 둥실 · 그마 불씨 올라감 · 챌린저 · 이글루 별빛
//    빛무리(glow): 마스터부터 숨쉬듯, 이글루는 오로라처럼 색이 흐른다 · 별 빛살(rays): 챌린저 · 이글루 맥동
const SHINE = { master: [0.36, 5.5], grandmaster: [0.3, 5.5], challenger: [0.5, 5], igloo: [0.55, 4.6] };
const PRISM = ["#d0b8ff", "#a8ecff", "#ffc8e8"];
const FX_ANIM = { glint: "tw 2.6s ease-in-out infinite", star: "tw 2.2s ease-in-out infinite", mote: "mo 3.4s ease-in-out infinite", ember: "em 2.8s linear infinite" };

// 칸 → 같은 색 가로 줄을 한 조각으로 합친 경로 묶음 { 색: [조각] }
const runs = (keep) => {
  const by = {};
  for (let y = 0; y < N; y++) for (let x = 0; x < N;) {
    const c = keep(x, y); if (!c) { x++; continue; }
    let e = x; while (e + 1 < N && keep(e + 1, y) === c) e++;
    (by[c] ||= []).push(`M${x} ${y}h${e - x + 1}v1h-${e - x + 1}z`);
    x = e + 1;
  }
  return by;
};
const paths = (by, cls) => Object.entries(by).map(([c, a]) => {
  const [f, op] = c.split("|");
  return `<path${cls ? ` class="${cls(f)}"` : ""} d="${a.join("")}" fill="${f}"${op ? ` fill-opacity="${op}"` : ""}/>`;
}).join("");

// 칸 → SVG. 빛무리 · 별 빛살 · 반짝이 알갱이는 따로 묶어 움직임을 단다(g.roles — renderBorder 가 기록)
// 열쇠 장면 [[비율, 불투명도]] 의 ph(0 ~ 1) 값 — 처음 · 끝이 없으면 0(CSS 와 같게 .x 기본 불투명도 0)
const kfAt = (kf, ph) => {
  const k = [...(kf[0][0] > 0 ? [[0, 0]] : []), ...kf, ...(kf[kf.length - 1][0] < 1 ? [[1, 0]] : [])];
  for (let i = 1; i < k.length; i++) if (ph <= k[i][0]) { const [a, va] = k[i - 1], [b, vb] = k[i]; return b > a ? va + ((vb - va) * (ph - a)) / (b - a) : vb; }
  return 0;
};
// 칸 [x, y, 색] → 같은 색 가로 줄을 합친 경로
const cellPaths = (cells) => {
  const m = new Map();
  for (const [x, y, col] of cells) m.set(y * 4096 + x, col);
  const ks = [...m.keys()].sort((a, b) => a - b), by = {};
  for (let i = 0; i < ks.length;) {
    const col = m.get(ks[i]); let e = i;
    while (e + 1 < ks.length && ks[e + 1] === ks[e] + 1 && m.get(ks[e + 1]) === col) e++;
    (by[col] ||= []).push(`M${ks[i] % 4096} ${Math.floor(ks[i] / 4096)}h${e - i + 1}v1h-${e - i + 1}z`);
    i = e + 1;
  }
  return paths(by);
};

// opt.at(초): 그 순간에 멈춘 장면(움직임 CSS 없이 불투명도 · 위치를 박아서) — 미리보기 GIF 용
export function toSvg(g, T = {}, opt = {}) {
  N = g.c.length;
  const when = typeof opt.at === "number" ? opt.at : null, cyc = g.cycle || null;
  const phase = (t, per) => ((((t % per) + per) % per) / per);
  const roles = g.roles || { glow: new Set(), rays: new Set(), fx: [] };
  const fxOf = new Map();
  roles.fx.forEach((set, i) => set.forEach((k) => fxOf.set(k, i)));
  const at = (x, y) => g.c[y][x];
  const flOf = new Map();
  (roles.float || []).forEach((set, i) => set.forEach((k) => flOf.set(k, i)));
  const role = (x, y) => { const k = `${x},${y}`; return fxOf.has(k) ? "fx" : flOf.has(k) ? "float" : roles.rays.has(k) ? "ray" : roles.glow.has(k) ? "glow" : "art"; };
  const art = paths(runs((x, y) => (role(x, y) === "art" ? at(x, y) : null)));
  const glow = paths(runs((x, y) => (role(x, y) === "glow" ? at(x, y) : null)), T.glow === "prism" ? (f) => `au au${Math.max(0, PRISM.indexOf(f))}` : null);
  const rays = paths(runs((x, y) => (role(x, y) === "ray" ? at(x, y) : null)));
  const shineOf = SHINE[T.key] || null;
  // 반짝이는 알갱이마다 한 묶음 — 시차(animation-delay)로 따로 깜빡인다
  const sparks = roles.fx.map((set, i) => {
    const by = runs((x, y) => (fxOf.get(`${x},${y}`) === i ? at(x, y) : null));
    // 📌 움직임은 마스터부터(2026-10-06 "자꾸 낮은 티어에 효과 넣지마") — 다이아 반짝이는 그림으로만
    if (shineOf && when !== null) { const per = parseFloat((FX_ANIM[T.fx] || FX_ANIM.glint).split(" ")[1]); return `<g opacity="${(0.2 + 0.4 * (1 - Math.cos(2 * Math.PI * phase(when + ((i * 0.83) % 2.6), per)))).toFixed(2)}">${paths(by)}</g>`; }
    return shineOf ? `<g class="fx" style="animation-delay:-${((i * 0.83) % 2.6).toFixed(2)}s">${paths(by)}</g>` : paths(by);
  }).join("");
  // 덧칠 묶음 — e.kf(한 박자 열쇠 장면, g.cycle.period) 또는 e.cls(옛 ob · gm)
  const kfName = new Map();
  const extra = (g.extra || []).map((e) => {
    if (e.kf) {
      if (when !== null) { const op = kfAt(e.kf, phase(when - (e.delay || 0), cyc.period)); return op > 0.005 ? `<g opacity="${op.toFixed(3)}">${cellPaths(e.cells)}</g>` : ""; }
      const sig = e.kf.map(([t, o]) => `${+(t * 100).toFixed(2)}%{opacity:${+o.toFixed(3)}}`).join("");
      if (!kfName.has(sig)) kfName.set(sig, `k${kfName.size}`);
      return `<g class="x ${kfName.get(sig)}"${e.delay ? ` style="animation-delay:${e.delay.toFixed(2)}s"` : ""}>${cellPaths(e.cells)}</g>`;
    }
    const by = {};
    for (const [x, y, col] of e.cells) (by[col] ||= []).push(`M${x} ${y}h1v1h-1z`);
    return `<g class="${e.cls}" style="animation-delay:${e.delay.toFixed(2)}s">${paths(by)}</g>`;
  }).join("");
  const floats = (roles.float || []).map((set, i) => `<g class="fl" style="animation-delay:-${((i * 1.7) % 3.6).toFixed(2)}s">${paths(runs((x, y) => (flOf.get(`${x},${y}`) === i ? at(x, y) : null)))}</g>`).join("");
  // 빛이 훑는 곳 = 그림의 진한 칸 전부(반투명 빛무리 · 빛살 · 반짝이 빼고) 한 조각
  const sil = !shineOf ? "" : Object.values(runs((x, y) => (role(x, y) === "art" && at(x, y) && !at(x, y).includes("|") ? "#fff" : null))).flat().join("");
  const [sa, sp] = shineOf || [0, 0];
  const shPct = cyc ? cyc.shine.map((v) => +(v * 100).toFixed(2)) : null;
  const css = when !== null ? "" : [
    shineOf && cyc ? `@keyframes sh{0%,${shPct[0]}%{transform:translateX(-60px)}${shPct[1]}%,100%{transform:translateX(${N + 40}px)}}.sh{animation:sh ${cyc.period}s linear infinite}` : "",
    shineOf && !cyc ? `@keyframes sh{0%{transform:translateX(-60px)}60%,100%{transform:translateX(${N + 40}px)}}.sh{animation:sh ${sp}s ease-in-out infinite}` : "",
    "@keyframes tw{0%,100%{opacity:.2}50%{opacity:1}}",
    "@keyframes mo{0%,100%{opacity:.35;transform:translateY(1px)}50%{opacity:1;transform:translateY(-2px)}}",
    "@keyframes em{0%{opacity:0;transform:translateY(3px)}25%{opacity:1}100%{opacity:0;transform:translateY(-9px)}}",
    `.fx{animation:${FX_ANIM[T.fx] || FX_ANIM.glint}}`,
    T.glow && cyc ? `@keyframes gp{${cyc.glow.map(([t, o]) => `${+(t * 100).toFixed(2)}%{opacity:${o}}`).join("")}}.gl{animation:gp ${cyc.period}s linear infinite}` : "",
    T.glow && !cyc ? "@keyframes gp{0%,100%{opacity:.55}50%{opacity:1}}.gl{animation:gp 3.4s ease-in-out infinite}" : "",
    kfName.size ? `.x{opacity:0}${[...kfName].map(([sig, id]) => `@keyframes ${id}{${sig}}.${id}{animation:${id} ${cyc.period}s linear infinite}`).join("")}` : "",
    T.glow === "prism" ? `@keyframes au{0%,100%{fill:${PRISM[0]}}33%{fill:${PRISM[1]}}66%{fill:${PRISM[2]}}}.au{animation:au 6s linear infinite}.au1{animation-delay:-2s}.au2{animation-delay:-4s}` : "",
    roles.rays.size ? "@keyframes rp{0%,100%{opacity:.35}50%{opacity:1}}.ry{animation:rp 2.4s ease-in-out infinite}" : "",
    (g.extra || []).some((e) => e.cls === "ob") ? `@keyframes ob{0%,100%{opacity:0}1%,${(100 / (g.orbitSteps || 12) + 1).toFixed(1)}%{opacity:1}${(100 / (g.orbitSteps || 12) + 2).toFixed(1)}%{opacity:0}}.ob{opacity:0;animation:ob ${g.orbitPeriod || 4}s linear infinite}` : "",
    (g.extra || []).some((e) => e.cls === "gm") ? "@keyframes gm{0%,100%{opacity:0}40%,60%{opacity:.8}}.gm{opacity:0;animation:gm 2.4s ease-in-out infinite}" : "",
    (roles.float || []).length ? "@keyframes fl{0%,100%{transform:translateY(1px)}50%{transform:translateY(-2px)}}.fl{animation:fl 3.6s ease-in-out infinite}" : "",
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}}",
  ].join("");
  // 빛 띠 — 비스듬한 흰 띠가 왼쪽에서 오른쪽으로(그림 모양 안에서만 보인다)
  const defs = sil
    ? `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${N}" height="${N}"><path d="${sil}" fill="#fff"/></mask>`
      + `<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${sa}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    : "";
  // 멈춘 장면 — 빛 띠 위치 · 빛무리 불투명도를 그 순간 값으로
  let shX = null, glOp = null;
  if (when !== null) {
    if (cyc) { const ph = phase(when, cyc.period), [a, b] = cyc.shine; shX = ph <= a ? -60 : ph >= b ? N + 40 : -60 + ((N + 100) * (ph - a)) / (b - a); glOp = kfAt(cyc.glow, ph); }
    else { const ph = phase(when, sp || 1); shX = ph >= 0.6 ? N + 40 : -60 + ((N + 100) * (1 - Math.cos((Math.PI * ph) / 0.6))) / 2; glOp = 0.775 - 0.225 * Math.cos(2 * Math.PI * phase(when, 3.4)); }
  }
  const shine = sil ? `<g mask="url(#m)"><g transform="rotate(24 ${N / 2} ${N / 2})"><rect${shX === null ? ' class="sh"' : ` transform="translate(${shX.toFixed(1)} 0)"`} x="0" y="${-N / 2}" width="${Math.round(N * 0.16)}" height="${N * 2}" fill="url(#s)"/></g></g>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><defs><style>${css}</style>${defs}</defs>`
    + (glow ? (glOp === null ? `<g class="gl">${glow}</g>` : `<g opacity="${glOp.toFixed(2)}">${glow}</g>`) : "") + art + shine + (rays ? `<g class="ry">${rays}</g>` : "") + extra + floats + sparks + "</svg>";
}

// 정지 그림(움직임 · 가림판 없이 칸 그대로) — 디스코드 이미지 카드용(봇은 사이트 public 을 못 읽는다)
export function staticSvg(g) {
  N = g.c.length;
  const by = runs((x, y) => g.c[y][x]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${paths(by)}</svg>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // 📌 2026-10-10 테두리 그림은 scripts/gen-avatar-frames.mjs 가 만든다(지금 티어 엠블럼을 사진 아래 받침으로). 이 파일은 그리기 도구 · 등급 색표만 낸다
  console.log("테두리 그림은 node scripts/gen-avatar-frames.mjs 로 만든다 — 이 파일을 직접 돌리면 아무것도 쓰지 않는다");
}
