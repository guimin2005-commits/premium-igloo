// 새로운 세계(newworld) — 시즌 2 「A New World」 시즌 패스 보상 카드 스킨. 하늘 군도 카드
//   항해 지도 테(하늘 · 구름 두 톤이 번갈아 가는 눈금 띠 + 살구빛 모서리 칸) · 위 나침반 / 아래 별 문장
//   + 모서리 · 가장자리에 떠 있는 도트 공중섬(풀 윗면 · 계단처럼 뾰족한 흙/바위 밑면 · 나무 · 폭포 · 개척 깃발)
//   + 섬 사이 작은 새 · 바닥을 흐르는 도트 뭉게구름(모서리는 높게, 가운데는 낮게 — 글자 자리 비움)
//   등급 빛과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸만. 글자 자리(봇 카드 x 65~1135)는 피한다
export const meta = { key: "newworld", label: "새로운 세계", grid: "line", tint: "#ffe3c4", gridOp: 0.045 };

const PAL = {
  o: "#1d1916", // 외곽선(가장 짙은 색)
  G: "#c8f07e", g: "#7cc84f", d: "#3f8b3f", D: "#2a6233", // 풀
  E: "#e2a66a", e: "#ad7243", b: "#744a2c", B: "#4f3220", // 흙
  r: "#9a8b80", R: "#62554d", // 바위
  T: "#8a5a32", // 줄기 · 깃대
  w: "#f4fbff", W: "#8fd3f5", V: "#4fa9dd", // 물
  f: "#ffa57c", F: "#ffd9b6", // 새벽 살구
  c: "#fffaf2", C: "#dfe9f4", s: "#a9bfd6", // 구름
  k: "#7cc6f0", K: "#4f9fd6", // 하늘
  n: "#131313", // 잉크(문장 뒤 판)
};

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
const rp = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// ── 칸 그림판 — 음수 좌표 허용, 마지막에 외곽선(4이웃)을 두른다 ──
function grid() {
  const m = new Map();
  const key = (x, y) => x + "," + y;
  return {
    set(x, y, ch) { if (ch && ch !== ".") m.set(key(x, y), ch); },
    get(x, y) { return m.get(key(x, y)); },
    has(x, y) { return m.has(key(x, y)); },
    map(rows, ox, oy) { rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") m.set(key(ox + x, oy + y), ch); })); },
    outline() {
      const add = [];
      for (const k of m.keys()) {
        const [x, y] = k.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(key(x + dx, y + dy))) add.push(key(x + dx, y + dy));
      }
      for (const k of add) m.set(k, "o");
      return this;
    },
    cells() { return [...m.entries()].map(([k, ch]) => { const [x, y] = k.split(",").map(Number); return [x, y, ch]; }); },
  };
}
// 그림판 → SVG (색마다 경로 하나). (x, y) = 칸 (0, 0) 의 왼쪽 위
function draw(g, x, y, P, op = 1) {
  const by = {};
  for (const [cx, cy, ch] of g.cells()) (by[ch] ||= []).push(rp(Math.round(x + cx * P), Math.round(y + cy * P), P, P));
  return `<g opacity="${op}">${Object.entries(by).map(([ch, d]) => `<path d="${d.join("")}" fill="${PAL[ch]}"/>`).join("")}</g>`;
}

// ── 공중섬 — 두꺼운 풀 윗면(밝은 윗줄 · 흘러내린 덩굴) + 줄마다 좁아지는 계단 흙 · 바위 끝. (0,0) = 풀 윗줄 왼쪽 끝 ──
//   opts.pond: 윗면 오른쪽 물웅덩이(폭포 시작) · opts.flowers: 살구빛 꽃 수
function island(g, W, D, seed, opts = {}) {
  const R = rng(seed);
  // 풀 — 0줄(밝게) · 1줄 · 2줄(그늘)
  for (let x = 0; x < W; x++) {
    const edge = x === 0 || x === W - 1;
    if (!edge) g.set(x, 0, x < W * 0.68 ? "G" : "g");
    g.set(x, 1, x < W * 0.8 ? "g" : "d");
    if (!edge) g.set(x, 2, x < W * 0.25 ? "g" : "d");
  }
  // 흙 — 위는 넓고 아래로 빠르게 좁아지는 뒤집힌 봉우리(줄마다 계단, 양쪽 높낮이 다르게) → 끝은 1~2칸
  const mid = (W - 1) / 2 + (R() - 0.5) * W * 0.12;
  let L = 1;
  let Rr = W - 2;
  const rows = [];
  for (let r = 0; r < D; r++) {
    const f = (r + 1) / (D + 0.6);
    const half = (W / 2 - 1) * (1 - Math.pow(f, 1.25));
    L = Math.max(L, Math.round(mid - half - (R() < 0.5 ? 1 : 0)));
    Rr = Math.min(Rr, Math.round(mid + half + (R() < 0.5 ? 1 : 0)));
    if (Rr < L) break;
    rows.push([L, Rr]);
  }
  const n = rows.length;
  rows.forEach(([a, b], r) => {
    const y = 3 + r;
    for (let x = a; x <= b; x++) {
      const u = (x - a) / Math.max(1, b - a);
      let ch = u < 0.32 ? "E" : u < 0.7 ? "e" : "b";
      if (r === 0) ch = u < 0.5 ? "b" : "B"; // 풀 아래 그늘 한 줄
      else if (r >= n - 2) ch = u < 0.55 ? "r" : "R"; // 끝은 바위
      else if (r >= n - 3 && u > 0.5) ch = "R";
      else if ((x * 7 + r * 3) % 11 === 0) ch = ch === "E" ? "e" : ch === "e" ? "b" : "B"; // 박힌 돌 · 지층
      g.set(x, y, ch);
    }
  });
  // 끝에 매달린 바위 한두 칸
  const last = rows[n - 1];
  if (last) { const mx = Math.round((last[0] + last[1]) / 2); g.set(mx, 3 + n, "R"); if (R() < 0.6) g.set(mx, 4 + n, "R"); }
  // 덩굴 — 풀이 흙 위로 흘러내린 자국(가장자리는 더 길게)
  for (let x = 1; x < W - 1; x++) {
    if (R() < 0.22) {
      const len = 1 + Math.floor(R() * 3);
      for (let k = 0; k < len; k++) if (g.has(x, 3 + k)) g.set(x, 3 + k, k === len - 1 ? "D" : "d");
    }
  }
  // 윗면 — 낮은 언덕 하나 + 풀잎 · 꽃
  if (W >= 14) {
    const a = 2 + Math.floor(R() * W * 0.2);
    const len = Math.round(W * 0.3);
    for (let x = a; x < a + len; x++) { g.set(x, -1, "G"); g.set(x, 0, "G"); }
  }
  for (let x = 2; x < W - 2; x++) if (R() < 0.12) g.set(x, g.has(x, -1) ? -2 : -1, x < W * 0.68 ? "G" : "g");
  for (let i = 0; i < (opts.flowers || 0); i++) { const x = 2 + Math.floor(R() * (W - 4)); g.set(x, -1, "f"); }
  if (opts.pond) for (let x = W - 6; x < W - 1; x++) g.set(x, 0, x === W - 6 ? "W" : "w");
  return { rows: n };
}
const TREE = [
  "....GGGg....",
  "..GGGGGGgg..",
  ".GGGGGGgggd.",
  "GGGGGGggggdd",
  "GGGGGgggggdD",
  "GGGgggggdddD",
  ".gGgggddddD.",
  "..gdddddDD..",
  "....dDDD....",
  ".....TT.....",
  ".....Tb.....",
];
const BUSH = [".GGg.", "GGggd"];
const FLAG = ["TFffff", "Tfffff.", "Tff....", "T......", "T......", "T......"];

// 폭포 — 2칸 폭, 아래로 내려갈수록 끊기며 사라진다
//   외곽선을 두르지 않는다(관처럼 보이지 않게) — 섬 외곽선을 그린 뒤에 얹는다
function fall(g, x, y0, len) {
  for (let y = y0; y < y0 + len; y++) {
    const k = y - y0;
    const fade = k > len - 6;
    if (fade && (y + x) % 2) { if (y % 3 === 0) g.set(x + 2, y, "w"); continue; }
    g.set(x, y, (y + 1) % 3 ? "w" : "W");
    if (!fade || y % 2) g.set(x + 1, y, y % 3 ? "W" : "V");
  }
  // 물보라
  for (const [dx, dy, ch] of [[-1, len, "w"], [2, len - 1, "W"], [0, len + 1, "W"], [3, len + 1, "w"], [1, len + 2, "w"]]) g.set(x + dx, y0 + dy, ch);
}

// 새 — 갈매기
const BIRD = [[".cc...cc.", "c..c.c..c", "....c...."], ["..c...c..", ".c.c.c.c.", "c...c...c"]];

// 나침반 — 11칸. 네 갈래 끝은 두 톤(밝은 쪽 · 하늘빛 쪽), 북쪽 끝은 살구빛, 대각 짧은 살
function compass() {
  const g = grid();
  const c = 5;
  const arms = [[0, -1, 1, 0], [1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1]];
  arms.forEach(([dx, dy, px, py], ai) => {
    for (let k = 1; k <= 5; k++) {
      const hw = k <= 2 ? 1 : 0;
      for (let j = -hw; j <= hw; j++) {
        const ch = ai === 0 ? (j > 0 ? "f" : "F") : j < 0 ? "c" : j > 0 ? "k" : "c";
        g.set(c + dx * k + px * j, c + dy * k + py * j, ch);
      }
    }
  });
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.set(c + sx * 2, c + sy * 2, "k"); g.set(c + sx * 3, c + sy * 3, "K"); }
  g.set(c, c, "f");
  return g.outline();
}
// 아래 문장 — 네 갈래 별
function star() {
  const g = grid();
  g.map(["....c....", "...cFk...", "..cFFFk..", "ccFFfFFkk", "..cFFFk..", "...cFk...", "....k...."], 0, 0);
  return g.outline();
}

// ── 뭉게구름 — 원 여러 개를 칸으로 채운다. 위가 비면 밝은 칸, 원의 오른쪽 아래는 그늘 ──
function clouds(circles, base, P, w) {
  const n = Math.ceil(w / P);
  const inC = (x, y) => {
    for (const [cx, cy, r] of circles) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r) return [cx, cy, r]; }
    return null;
  };
  const by = { c: "", u: "", C: "", s: "" };
  const rows = Math.ceil(Math.max(...circles.map(([, cy, r]) => r - cy)) + 1);
  for (let x = 0; x < n; x++) {
    for (let y = -rows; y < 0; y++) {
      const hit = inC(x, y);
      if (!hit) continue;
      // 위가 비면 밝은 윗줄, 그 아래 한 줄 · 왼쪽 끝은 반쯤 밝게, 오른쪽 끝 두 칸은 그늘
      let ch = "C";
      if (!inC(x, y - 1)) ch = "c";
      else if (!inC(x, y - 2) || !inC(x - 1, y)) ch = "u";
      else if (!inC(x + 1, y) || (!inC(x + 2, y) && y > -3)) ch = "s";
      by[ch] += rp(x * P, base + y * P, P, P);
    }
  }
  return by;
}

// ── 지도 테 — 하늘 · 구름 칸이 번갈아 가는 눈금 띠 ──
function neatline(w, h, o, t, seg) {
  let a = "";
  let b = "";
  const edge = (x0, y0, len, horiz) => {
    const n = Math.max(2, Math.round(len / seg));
    const L = len / n;
    for (let i = 0; i < n; i++) {
      const s = Math.round(i * L);
      const e = Math.round((i + 1) * L);
      const d = horiz ? rp(x0 + s, y0, e - s, t) : rp(x0, y0 + s, t, e - s);
      if (i % 2) b += d; else a += d;
    }
  };
  edge(o + t, o, w - 2 * o - 2 * t, true);
  edge(o + t, h - o - t, w - 2 * o - 2 * t, true);
  edge(o, o + t, h - 2 * o - 2 * t, false);
  edge(w - o - t, o + t, h - 2 * o - 2 * t, false);
  const corners = [[o, o], [w - o - t, o], [o, h - o - t], [w - o - t, h - o - t]];
  return { a, b, corners };
}

export function deco(w, h, S, site) {
  const id = "newworld";
  const P = site ? 2 : Math.round(2 * S); // 도트 한 칸
  const o = site ? 12 : 14;
  const t = site ? 4 : Math.round(4 * S); // 눈금 띠 두께
  const seg = site ? 18 : Math.round(18 * S);
  const inL = o + t; // 테 안쪽 시작
  const inR = w - o - t;
  const base = h - o - t; // 구름 바닥

  // 바탕 — 사이트 카드에는 지도 경위선(점선)을 깐다(봇은 meta.grid 선 무늬)
  const defs = site
    ? `<pattern id="${id}-gr" width="36" height="36" patternUnits="userSpaceOnUse"><path d="M0 0h1v1h-1zM4 0h1v1h-1zM8 0h1v1h-1zM12 0h1v1h-1zM0 4h1v1h-1zM0 8h1v1h-1zM0 12h1v1h-1z" fill="#ffe3c4" fill-opacity="0.16"/></pattern>`
    : "";
  let under = site ? `<rect width="${w}" height="${h}" fill="url(#${id}-gr)"/>` : "";

  // ── 구름 — 칸 단위 원(cx, cy, r) · cy 는 바닥(base) 기준 칸(양수 = 아래로 묻힘). 모서리는 높게 피어오르고 가운데는 낮게 ──
  const nC = Math.ceil(w / P);
  const R = rng(41);
  const cl = [];
  const cH = site ? 7 : 12;
  const c0 = Math.round(inL / P) - 1;
  for (const side of [0, 1]) {
    const X = (v) => (side ? nC - v : v);
    const u = cH / 12; // 모서리 뭉게구름 — 봉우리 여럿이 계단처럼 오른다
    cl.push([X(c0 - 2 * u), 2, 9 * u], [X(c0 + 6 * u), -1, 6.5 * u], [X(c0 + 12 * u), 2, 6 * u], [X(c0 + 1 * u), -7 * u, 5.5 * u], [X(c0 + 17 * u), 3, 4.6 * u]);
  }
  for (let x = c0 + cH * 1.5; x < nC - c0 - cH * 1.5; x += (site ? 6 : 8) + R() * 5) cl.push([x, 2, (site ? 4.2 : 5.4) + R() * 1.6]);
  if (site) cl.push([Math.round(nC * 0.3), 3, 8], [Math.round(nC * 0.42), 2, 9.5], [Math.round(nC * 0.54), 3, 7.5], [Math.round(nC * 0.36), -3, 5]);
  const cc = clouds(cl, base, P, w);
  const cloudSvg =
    `<path d="${cc.C}" fill="${PAL.C}" fill-opacity="0.68"/><path d="${cc.s}" fill="${PAL.s}" fill-opacity="0.62"/><path d="${cc.u}" fill="#ffffff" fill-opacity="0.78"/><path d="${cc.c}" fill="#ffffff" fill-opacity="0.95"/>`;

  // ── 섬들 ──
  let isles = "";
  // 큰 섬 — 나무 + 윗면 웅덩이에서 오른쪽 끝으로 떨어지는 폭포 (사이트: 오른쪽 위 · 봇: 위 가운데 오른쪽, 글자 없는 띠)
  {
    const g = grid();
    const W = site ? 30 : 36;
    island(g, W, site ? 8 : 9, 5, { pond: true, flowers: 2 });
    g.map(TREE, 3, -TREE.length);
    g.map(BUSH, 17, -2);
    g.outline();
    fall(g, W - 1, 0, site ? 20 : 17);
    const x = site ? inR - (W + 3) * P : Math.round(w * 0.68 - (W / 2) * P);
    const y = site ? 46 : 10 + TREE.length * P;
    isles += draw(g, x, y, P, 0.95);
  }
  // 오른쪽 위 모서리 섬(봇) — 덤불
  if (!site) {
    const g = grid();
    island(g, 16, 5, 13, { flowers: 1 });
    g.map(BUSH, 9, -2);
    g.outline();
    isles += draw(g, inR - 19 * P, 40, P, 0.92);
  }
  // 작은 섬 — 개척 깃발 (사이트: 가운데 빈 줄 왼쪽 · 봇: 왼쪽 위 모서리)
  {
    const g = grid();
    const W = site ? 18 : 10;
    island(g, W, site ? 6 : 4, 9, { flowers: 1 });
    g.map(FLAG, 2, -FLAG.length);
    g.outline();
    // 📌 2026-10-05 사이트 — 레벨 막대 줄(gap)에 걸쳤다. 운영자가 고른 바닥 띠로 — 두 스탯 칸 사이, 바닥 구름 위
    if (site) isles += draw(g, Math.round(w * 0.37), base - 9 * P, P, 0.9);
    else isles += draw(g, inL + P, inL + 8 * P, P, 0.92);
  }
  // 중간 섬 — 덤불 (사이트: 가운데 빈 줄 오른쪽 · 봇: 오른쪽 가장자리)
  {
    const g = grid();
    const W = site ? 24 : 10;
    island(g, W, site ? 7 : 4, 17, { flowers: 2 });
    g.map(BUSH, site ? 3 : 2, -2);
    g.outline();
    if (site) isles += draw(g, inR - (W + 4) * P, base - 13 * P, P, 0.88); // 오른쪽 아래 — 시즌 글자 오른쪽 빈칸
    else isles += draw(g, inR - (W + 2) * P, Math.round(h * 0.5), P, 0.88);
  }
  // 아주 작은 섬 — 봇: 왼쪽 가장자리 · 왼쪽 아래 구름 위 / 사이트: 아래 구름 위(출석 글자 옆)
  {
    const g = grid();
    island(g, 9, 3, 23);
    g.outline();
    if (site) isles += draw(g, Math.round(w * 0.64), base - P * 6, P, 0.88); // 바닥 구름 위(스탯 글자 아래)
    else {
      isles += draw(g, inL + 2 * P, base - P * 24, P, 0.88);
      const g2 = grid();
      island(g2, 9, 3, 31);
      g2.map([".Gg"], 3, -1);
      g2.outline();
      isles += draw(g2, inL + P * 2, Math.round(h * 0.36), P, 0.82);
    }
  }
  // 새 — 섬 사이(글자 자리 밖)
  const birds = site
    ? [[150, 22, 0], [170, 28, 1], [w * 0.7, base - 40, 1], [w * 0.77, base - 46, 0], [w * 0.52, base - 12, 1]]
    : [[w * 0.56, inL + 3 * P, 0], [w * 0.585, inL + 7 * P, 1], [w * 0.86, inL + 4 * P, 1], [inR - 11 * P, h * 0.4, 0], [inL + 2 * P, h * 0.27, 1]];
  for (const [bx, by, v] of birds) {
    const g = grid();
    g.map(BIRD[v], 0, 0);
    isles += draw(g, Math.round(bx), Math.round(by), P, 0.7);
  }


  // ── 테 · 문장 ──
  const nl = neatline(w, h, o, t, seg);
  const hair = site ? 1 : 2;
  let frame = `<path d="${nl.a}" fill="${PAL.k}" fill-opacity="0.8"/><path d="${nl.b}" fill="${PAL.c}" fill-opacity="0.8"/>` +
    `<path d="${nl.corners.map(([x, y]) => rp(x, y, t, t)).join("")}" fill="${PAL.f}"/>` +
    `<rect x="${inL + hair * 2 + hair / 2}" y="${inL + hair * 2 + hair / 2}" width="${w - 2 * (inL + hair * 2) - hair}" height="${h - 2 * (inL + hair * 2) - hair}" fill="none" stroke="${PAL.F}" stroke-opacity="0.2" stroke-width="${hair}"/>`;
  const cx = Math.round(w / 2 - 5.5 * P);
  const cy = Math.round(o + t / 2 - 5.5 * P + (site ? 0 : P));
  let crests = `<rect x="${cx - P}" y="${o - 2}" width="${13 * P}" height="${t + 4}" fill="${PAL.n}"/>` + draw(compass(), cx, cy, P, 1);
  const sx = Math.round(w / 2 - 4.5 * P);
  const sy = Math.round(h - o - t / 2 - 3.5 * P);
  crests += `<rect x="${sx - P}" y="${h - o - t - 2}" width="${11 * P}" height="${t + 4}" fill="${PAL.n}"/>` + draw(star(), sx, sy, P, 1);

  return {
    defs,
    under,
    // 테 → 섬(테 위로 걸쳐 떠 있게) → 구름(아래 섬 밑동을 가린다) → 문장
    over: `<g shape-rendering="crispEdges">${frame}${isles}${cloudSvg}${crests}</g>`,
  };
}
