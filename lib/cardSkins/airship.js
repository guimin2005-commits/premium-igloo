// 비공정 — 시즌 상점(빙옥 전용) 카드 스킨. 하늘을 나는 배를 탄 개척단.
//   리벳 박힌 강철 판 액자(판마다 위 · 왼쪽 밝게 / 아래 · 오른쪽 어둡게 + 이음매 + 도트 리벳 + 흘러내린 청록 녹)
//   + 네 모서리 도트 톱니바퀴(바퀴살 · 놋쇠 축, 큰 것 + 맞물린 작은 것) + 위 가장자리를 지나는 도트 비공정
//   (녹빛 천 풍선 · 강철 갈빗대 · 꼬리날개 · 리깅 밧줄 · 선체 · 불 켜진 창 · 놋쇠 프로펠러 · 닻 밧줄)
//   + 프로펠러 바람결 · 배기 김 + 양옆 테를 감은 밧줄 + 아래 테 가운데 놋쇠 나침반.
//   색: 강철 회색 · 청록 녹 · 작은 놋쇠 포인트 — 한 가지 색 테두리(등급색)로 보이지 않게 여러 톤 · 무늬로.
//   잉크 바탕에선 검은 외곽선이 안 보여 실루엣은 짙은 강철 · 짙은 녹으로 두른다.
export const meta = { key: "airship", label: "비공정", grid: "line", tint: "#b9c8ce", gridOp: 0.045 };

export const C = {
  k: "#161c20", // 이음매 그늘
  o: "#38434a", // 실루엣(짙은 강철)
  1: "#d9e2e6", // 강철 빛
  L: "#aab6bc", // 강철 밝은 중간
  2: "#76838a", // 강철
  3: "#4b565e", // 강철 그늘
  a: "#97e6cc", // 녹 빛
  b: "#4fb396", // 녹
  c: "#2d7a67", // 녹 그늘
  d: "#1e5547", // 녹 실루엣
  y: "#f3d27a", // 놋쇠 빛
  z: "#b98a30", // 놋쇠 그늘
  r: "#dfcda6", // 밧줄 빛
  s: "#9c845b", // 밧줄 그늘
  w: "#f3f9fb", // 흰 빛(창 · 김)
  g: "#aebec5", // 김 그늘
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

// 색별 경로 모음 — 한 겹(layer)을 한 번에 그린다
class Layer {
  constructor() { this.d = {}; }
  cell(ch, x, y, w, h) { if (!C[ch]) return; (this.d[ch] ||= []).push(R(x, y, w, h)); }
  sprite(map, ox, oy, P) {
    map.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") this.cell(ch, ox + i * P, oy + j * P, P, P); }));
  }
  svg(op = 1) {
    const body = Object.entries(this.d).map(([ch, a]) => `<path d="${a.join("")}" fill="${C[ch]}"/>`).join("");
    return body ? `<g shape-rendering="crispEdges"${op < 1 ? ` opacity="${op}"` : ""}>${body}</g>` : "";
  }
}

// ── 도트 톱니바퀴 — 손으로 찍은 대칭 실루엣(이 8개) + 좌상단 빛 3단 · 오른쪽 아래 실루엣만 짙게
//    (잉크 바탕이라 둘레 전체를 짙게 두르면 이가 사라진다) + 놋쇠 축 + (큰 것은) 구멍 4개 + 그늘진 쪽에 고인 녹 ──
const GEAR_MASKS = {
  13: [".....###.....", ".##..###..##.", ".###########.", "..#########..", "..#########..", "#############", "#############", "#############", "..#########..", "..#########..", ".###########.", ".##..###..##.", ".....###....."],
  11: ["....###....", ".##.###.##.", ".#########.", "..#######..", "###########", "###########", "###########", "..#######..", ".#########.", ".##.###.##.", "....###...."],
  9: ["...###...", ".#######.", ".#######.", "#########", "#########", "#########", ".#######.", ".#######.", "...###..."],
};
export function gearMap(n, rand) {
  const mask = GEAR_MASKS[n];
  const c = n / 2;
  const big = n >= 11;
  const rIn = n / 2 - 1.6;
  const solidAt = (i, j) => i >= 0 && j >= 0 && i < n && j < n && mask[j][i] === "#";
  const holes = n >= 13 ? [[3, 3], [9, 3], [3, 9], [9, 9]] : [];
  const rows = [];
  for (let j = 0; j < n; j++) {
    let row = "";
    for (let i = 0; i < n; i++) {
      if (!solidAt(i, j)) { row += "."; continue; }
      const dx = i + 0.5 - c, dy = j + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const l = -(dx + dy) / (Math.max(r, 0.01) * 1.414);
      if (r <= (big ? 1.6 : 1.0)) { row += r <= 0.5 ? "k" : l > -0.2 ? "y" : "z"; continue; } // 놋쇠 축
      if (holes.some(([hx, hy]) => hx === i && hy === j)) { row += "k"; continue; }
      const darkEdge = !solidAt(i + 1, j) || !solidAt(i, j + 1);
      const liteEdge = !solidAt(i - 1, j) || !solidAt(i, j - 1);
      if (darkEdge && l < 0.4) { row += "o"; continue; }
      if (liteEdge && l > -0.4) { row += r > rIn && l > 0.3 ? "1" : "L"; continue; } // 이 끝만 가장 밝게
      let ch = l > 0.35 ? "L" : l < -0.35 ? "3" : "2";
      if (l < -0.2 && r > 1.6 && rand() < 0.22) ch = l < -0.5 ? "c" : "b"; // 녹
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

// ── 도트 비공정(오른쪽으로 난다) — 녹빛 천 풍선 · 강철 갈빗대 · 꼬리날개 · 리깅 밧줄 · 선체(놋쇠 난간 · 불 켜진 창) · 프로펠러 · 닻 ──
export const SHIP_W = 32;
export function shipMap(anchorCol, ropeLen) {
  const H = 20 + (anchorCol ? ropeLen + 5 : 0);
  const W = SHIP_W;
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const mat = Array.from({ length: H }, () => Array(W).fill(""));
  const put = (x, y, m) => { if (x >= 0 && y >= 0 && x < W && y < H) mat[y][x] = m; };
  // 꼬리날개(강철) — 위 · 아래 삼각 날개 + 가운데 수평 날개(3줄)
  [[0, 2, 3], [1, 2, 5], [2, 3, 6], [3, 4, 6]].forEach(([y, x0, len]) => { for (let x = x0; x < x0 + len; x++) put(x, y, "F"); });
  [[7, 4, 6], [8, 3, 6], [9, 2, 5], [10, 2, 3]].forEach(([y, x0, len]) => { for (let x = x0; x < x0 + len; x++) put(x, y, "F"); });
  for (let x = 0; x < 8; x++) put(x, 5, "F");
  for (let x = 1; x < 8; x++) { put(x, 4, "F"); put(x, 6, "F"); }
  // 풍선 — 뒤는 길게 · 앞은 둥글게
  const cx = 19, cy = 5.5, ry = 5.6;
  for (let y = 0; y < 11; y++) for (let x = 3; x < W; x++) {
    const rx = x + 0.5 < cx ? 15.5 : 11.6;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) put(x, y, "E");
  }
  // 선체 — 뱃머리 뾰족
  [[13, 11, 27], [14, 10, 29], [15, 10, 28], [16, 11, 27], [17, 12, 26], [18, 14, 24]].forEach(([y, x0, x1]) => { for (let x = x0; x <= x1; x++) put(x, y, "H"); });
  const has = (x, y, set) => x >= 0 && y >= 0 && x < W && y < H && set.includes(mat[y][x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = mat[y][x];
    if (!m) continue;
    const set = m === "H" ? ["H"] : ["E", "F"];
    const darkEdge = !has(x + 1, y, set) || !has(x, y + 1, set);
    const liteEdge = !has(x - 1, y, set) || !has(x, y - 1, set);
    if (m === "E") {
      const rx = x + 0.5 < cx ? 15.5 : 11.6;
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const l = -dy * 0.8 - dx * 0.35;
      let ch = l > 0.42 ? "a" : l < -0.28 ? "c" : "b";
      if (x === 10 || x === 17 || x === 24) ch = l > 0.42 ? "1" : l < -0.28 ? "3" : "2"; // 강철 갈빗대
      if (x >= 28) ch = l > 0.1 ? "1" : "2"; // 강철 뱃머리 덮개
      if (darkEdge && l < 0.3) ch = x >= 28 ? "o" : "d";
      g[y][x] = ch;
    } else if (m === "F") {
      g[y][x] = darkEdge && y >= 4 ? "o" : liteEdge || y <= 3 ? "1" : y === 5 ? "2" : "L";
    } else if (m === "H") {
      if (y === 13) { g[y][x] = x % 4 === 1 ? "z" : "y"; continue; } // 놋쇠 난간
      if (darkEdge) { g[y][x] = "o"; continue; }
      g[y][x] = y === 14 ? "1" : y === 15 ? "L" : y === 16 ? "2" : "3";
    }
  }
  g[2][13] = "w"; g[2][14] = "w"; g[1][16] = "w"; g[2][15] = "a"; // 천 빛
  [14, 18, 22, 26].forEach((x) => { g[15][x] = "y"; }); // 불 켜진 창
  // 리깅 밧줄
  [[14, 11], [13, 12], [20, 11], [20, 12], [26, 11], [27, 12]].forEach(([x, y]) => { g[y][x] = y === 11 ? "r" : "s"; });
  // 프로펠러 — 축 + 놋쇠 날(옆에서 본 세로 날) + 배기관
  g[15][9] = "3"; g[15][8] = "y";
  [[7, 12, "y"], [7, 13, "y"], [7, 14, "z"], [7, 15, "o"], [7, 16, "z"], [7, 17, "y"], [7, 18, "z"]].forEach(([x, y, ch]) => { g[y][x] = ch; });
  g[17][10] = "2"; g[17][9] = "L"; g[17][8] = "L"; // 배기관
  // 닻 밧줄 + 놋쇠 닻
  if (anchorCol) {
    for (let k = 0; k < ropeLen; k++) g[19 + k][anchorCol] = k % 2 ? "s" : "r";
    ["..z..", "yyyyy", "..y..", "y.y.y", ".yzy."].forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") g[19 + ropeLen + j][anchorCol - 2 + i] = ch; }));
  }
  return g.map((r) => r.join(""));
}

// 김 · 구름 — 몽글한 도트
const PUFF_L = ["...ww.....", ".wwwwww.w.", "wwwwwwwwww", ".gwwwwwgg.", "..gg..g..."];
const PUFF_M = [".ww..", "wwwww", ".ggw."];
const PUFF_S = [".w.", "wwg"];

// 놋쇠 나침반(9칸) — 아래 테 가운데
export function compassMap() {
  const n = 9, c = 4.5;
  const rows = [];
  for (let j = 0; j < n; j++) {
    let row = "";
    for (let i = 0; i < n; i++) {
      const dx = i + 0.5 - c, dy = j + 0.5 - c;
      const r = Math.hypot(dx, dy);
      const l = -(dx + dy) / (Math.max(r, 0.01) * 1.414);
      if (r > 4.6) row += ".";
      else if (r > 3.6) row += l > 0.2 ? "y" : "z";
      else row += "3";
    }
    rows.push([...row]);
  }
  rows[1][4] = "w"; rows[2][4] = "w"; rows[3][4] = "a"; rows[4][4] = "y"; rows[5][4] = "b"; rows[6][4] = "c"; rows[7][4] = "c";
  rows[4][2] = "L"; rows[4][3] = "L"; rows[4][5] = "2"; rows[4][6] = "2";
  return rows.map((r) => r.join(""));
}

// 감은 밧줄 — 사선 꼬임으로 세 번 감고, 안쪽으로 꼬리가 늘어진다
function lashing(wide, tail) {
  const rows = [];
  for (let n = 0; n < 3; n++) {
    let a = "", b = "";
    for (let i = 0; i < wide; i++) { a += i === wide - 1 ? "s" : "r"; b += i === 0 ? "s" : i === wide - 1 ? "o" : "s"; }
    rows.push(a, b);
    if (n < 2) rows.push(".".repeat(wide));
  }
  for (let k = 0; k < tail; k++) rows.push(".".repeat(wide - 2) + (k % 2 ? "s" : "r") + ".");
  rows.push(".".repeat(wide - 3) + "r.r");
  return rows;
}

export function deco(w, h, S, site) {
  const rand = seeded(41);
  const P = Math.max(2, Math.round(2 * S)); // 액자 칸(사이트 2px · 봇 4px)
  const Q = site ? (w >= 340 ? 3 : 2) : Math.round(3 * S); // 그림 칸(사이트 3px(좁으면 2px) · 봇 7px)
  const o = site ? 12 : 14;
  const band = 4;
  const B = band * P;
  const cols = Math.floor((w - o * 2) / P);
  const rows = Math.floor((h - o * 2) / P);
  const X = (i) => o + i * P;
  const Y = (j) => o + j * P;
  const snap = (v) => Math.round(v);

  // ── 리벳 판 액자 ──
  const fr = new Layer();
  const plate = Math.round((60 * S) / P);
  const rivet = (x, y) => { fr.cell("1", x, y, P, P); fr.cell("L", x + P, y, P, P); fr.cell("L", x, y + P, P, P); fr.cell("k", x + P, y + P, P, P); };
  for (const top of [true, false]) {
    const j0 = top ? 0 : rows - band;
    for (let i = 0; i < cols; i++) for (let k = 0; k < band; k++) fr.cell(k === 0 ? "1" : k === band - 1 ? "3" : "2", X(i), Y(j0 + k), P, P);
    for (let i = band + plate; i < cols - band - 4; i += plate) {
      for (let k = 0; k < band; k++) { fr.cell("k", X(i), Y(j0 + k), P, P); fr.cell("L", X(i + 1), Y(j0 + k), P, P); }
      rivet(X(i - 3), Y(j0 + 1));
      rivet(X(i + 3), Y(j0 + 1));
      if (rand() < 0.75) { // 녹 — 리벳 아래로 흘러내린 몇 칸
        const x = i + (rand() < 0.5 ? -3 : 4);
        fr.cell("b", X(x), Y(j0 + band - 1), P, P);
        fr.cell("c", X(x + 1), Y(j0 + band - 1), P, P);
        fr.cell("a", X(x - 1), Y(j0 + band - 2), P, P);
        if (rand() < 0.5) fr.cell("b", X(x + 2), Y(j0 + band - 2), P, P);
      }
    }
  }
  for (const left of [true, false]) {
    const i0 = left ? 0 : cols - band;
    for (let j = band; j < rows - band; j++) for (let k = 0; k < band; k++) fr.cell(k === 0 ? "1" : k === band - 1 ? "3" : "2", X(i0 + k), Y(j), P, P);
    for (let j = band + plate; j < rows - band - 4; j += plate) {
      for (let k = 0; k < band; k++) { fr.cell("k", X(i0 + k), Y(j), P, P); fr.cell("L", X(i0 + k), Y(j + 1), P, P); }
      rivet(X(i0 + 1), Y(j - 3));
      rivet(X(i0 + 1), Y(j + 3));
      if (rand() < 0.75) {
        const y = j + 5 + Math.floor(rand() * 3);
        fr.cell("b", X(i0 + band - 1), Y(y), P, P);
        fr.cell("c", X(i0 + band - 1), Y(y + 1), P, P);
        fr.cell("b", X(i0 + band - 2), Y(y + 1), P, P);
        fr.cell("a", X(i0 + band - 2), Y(y), P, P);
      }
    }
  }
  // 안쪽 가는 레일(봇만 — 사이트는 글자가 가깝다)
  const rail = new Layer();
  if (!site) {
    const ri = band + 3;
    for (let i = ri; i < cols - ri; i++) { rail.cell("L", X(i), Y(ri), P, P); rail.cell("L", X(i), Y(rows - ri - 1), P, P); }
    for (let j = ri + 1; j < rows - ri - 1; j++) { rail.cell("L", X(ri), Y(j), P, P); rail.cell("L", X(cols - ri - 1), Y(j), P, P); }
  }

  // ── 톱니바퀴 + 나침반 ──
  const gr = new Layer();
  const gearAt = (n, teeth, rot, cx, cy) => gr.sprite(gearMap(n, rand), snap(cx - (n * Q) / 2), snap(cy - (n * Q) / 2), Q);
  const pitch = (a, b) => ((a / 2 - 0.8) + (b / 2 - 0.8)) * Q;
  if (site) {
    const nb = w >= 340 ? 11 : 9;
    const k = Q / 3;
    gearAt(9, 8, 0, 20, 20); // 아바타 옆이라 작게
    gearAt(nb, 8, 0.2, w - 24 * k, 24 * k);
    gearAt(9, 8, 0.4, 19, h - 19);
    gearAt(9, 8, 0.1, w - 19, h - 19);
    gearAt(9, 8, 0.3, 19 + pitch(9, 9), h - o - B / 2);
    gearAt(9, 8, 0.1, w - 19 - pitch(9, 9), h - o - B / 2);
  } else {
    const nb = 13;
    const c0 = 46;
    gearAt(nb, 8, 0, c0, c0);
    gearAt(nb, 8, 0.2, w - c0, c0);
    gearAt(9, 8, 0.5, w - c0 - pitch(nb, 9), o + B / 2 + 4);
    gearAt(11, 8, 0.4, 40, h - 40);
    gearAt(11, 8, 0.1, w - 40, h - 40);
    gearAt(9, 8, 0.3, o + B / 2 + 4, h - 40 - pitch(11, 9));
    gearAt(9, 8, 0.1, w - o - B / 2 - 4, h - 40 - pitch(11, 9));
  }
  const cq = site ? 2 : Math.round(2 * S);
  gr.sprite(compassMap(), snap(w / 2 - 4.5 * cq), snap(h - o - B / 2 - 4.5 * cq), cq);

  // ── 밧줄 감기(양옆 테) ──
  const rp = new Layer();
  const lashL = lashing(band + 2, site ? 4 : 5);
  const lashR = lashL.map((r) => [...r].reverse().join(""));
  const ly = Y(Math.round(rows * (site ? 0.62 : 0.42)));
  rp.sprite(lashL, X(-1), ly, P);
  rp.sprite(lashR, X(cols - band - 1), ly, P);

  // ── 비공정 + 바람결 + 배기 김 ──
  const sh = new Layer();
  const map = site ? shipMap(27, w >= 340 ? 4 : 2) : shipMap(0, 0);
  const sw = SHIP_W * Q;
  const sx = site ? w - 54 - sw : 740;
  const sy = site ? 2 : 6;
  sh.sprite(map, sx, sy, Q);
  const wind = new Layer();
  const streak = (x0, y, len) => { for (let i = 0; i < len; i++) if (i % 6 !== 4) wind.cell("w", sx + 6 * Q - (x0 + i) * Q, sy + y * Q, Q, Q); };
  if (!site) { streak(2, 13, 6); streak(4, 17, 5); } // 프로펠러 뒤(사이트는 이름 자리라 뺀다)
  streak(1, 2, 5); // 꼬리 뒤
  streak(4, 6, 8);
  const steam = new Layer();
  steam.sprite(PUFF_S, sx + 3 * Q, sy + 17 * Q, Q);
  if (!site) steam.sprite(PUFF_M, sx - 3 * Q, sy + 15 * Q, Q);
  steam.sprite(PUFF_S, sx - 9 * Q, sy + 9 * Q, Q);

  // ── 사이트 바탕 — 판 이음매 · 리벳 무늬(아주 옅게) ──
  const defs = site
    ? `<pattern id="airship-pl" width="60" height="60" patternUnits="userSpaceOnUse"><rect width="60" height="1" fill="#b9c8ce" fill-opacity="0.05"/><rect width="1" height="60" fill="#b9c8ce" fill-opacity="0.05"/><rect x="4" y="4" width="2" height="2" fill="#b9c8ce" fill-opacity="0.12"/><rect x="54" y="4" width="2" height="2" fill="#b9c8ce" fill-opacity="0.12"/></pattern>`
    : "";
  const under = (site ? `<rect width="${w}" height="${h}" fill="url(#airship-pl)"/>` : "") + wind.svg(0.3) + steam.svg(0.5);
  const over = rail.svg(0.14) + fr.svg(0.8) + rp.svg(0.92) + gr.svg(0.94) + sh.svg(0.96);
  return { defs, under, over };
}
