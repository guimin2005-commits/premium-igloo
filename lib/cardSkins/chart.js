// 항해도 — 시즌 상점(빙옥 전용) 카드 스킨. 새 세계를 찾아 나서는 옛 항해 지도
//   neatline(흑백 교차 칸 지도 테 + 경위도 눈금) · 오른쪽 위 도트 나침반 장미(끝이 지도 테에 걸친다) + 거기서 퍼지는 가는 항정선
//   · 돛단배 → 점선 항로 → 작은 섬 위 ✕ · 옅은 경위선. 색 = 양피지 크림 · 세피아 잉크 · 바다 남색 포인트(금색 그라데이션 없음)
export const meta = { key: "chart", label: "항해도", grid: "line", tint: "#e9d6ae", gridOp: 0.05 };

const CREAM = "#eedfbb";
const SEPIA = "#a3815a";
const SEPIA_D = "#6e5236";
const NAVY = "#6f9bd0";
const NAVY_D = "#35609a";
const INK = "#131313";

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// 나침반 장미 17×17 — L 크림(밝은 쪽) · D 세피아(그늘 쪽) · N/n 남색 사이 바람 · F 북쪽 끝(남색) · x 가운데
//   큰 바람 넷은 바람개비 음영(반시계 쪽이 밝다)
const ROSE = [
  "........F........",
  "........F........",
  "........L........",
  "...N...LLD...N...",
  "....N..LLD..N....",
  ".....NnLLDNN.....",
  ".....NNLLDNn.....",
  "...DDDDLLLLLLL...",
  "LLLLLLLLxLLLLLLLL",
  "...LLLLLLLDDDD...",
  ".....nNDLLNN.....",
  ".....NNDLLnN.....",
  "....N..DLL..N....",
  "...N...DLL...N...",
  "........L........",
  "........L........",
  "........L........",
];

// 돛단배 15×14 — S 돛(크림) s 돛 그늘 · T 앞돛 t 앞돛 그늘 · m 돛대 · F 깃발(남색) · h 뱃전 H 선체 k 선체 그늘 · w 물결
const SHIP = [
  ".......F.......",
  ".......mFF.....",
  ".......mF......",
  "......Sm.......",
  ".....SSmT......",
  "....SSSmTT.....",
  "...SSSSmTTT....",
  "..SSSSSmTTTT...",
  ".sssssSmTTTtt..",
  ".......m.......",
  "hhhhhhhhhhhhhhh",
  ".HHHHHHHHHHHHk.",
  "..kkkkkkkkkkk..",
  "w..ww....ww..w.",
];
const SHIP_C = { S: CREAM, s: "#cbb68b", T: "#ddc9a0", t: "#b9a273", m: SEPIA_D, F: NAVY, h: "#c79a66", H: SEPIA, k: SEPIA_D, w: NAVY };

// 섬 15×6 — a 밝은 모래 · A 모래 · k 해안(세피아) · w 물결
const ISLE = [
  ".....aaaaa.....",
  "...aaaAAAAAa...",
  "..aAAAAAAAAAk..",
  ".aAAAAAAAAAAAk.",
  "kkkkkkkkkkkkkkk",
  ".w.ww..w...ww.w",
];
const ISLE_C = { a: "#e8d6ab", A: "#c8ab78", k: SEPIA_D, w: NAVY };

// ✕ 7×7
const XMARK = ["XX...XX", "XXX.XXX", ".XXXXX.", "..XXX..", ".XXXXX.", "XXX.XXX", "XX...XX"];

function sprite(map, colors, x0, y0, P) {
  const by = {};
  map.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!colors[ch]) return;
    (by[ch] ||= []).push(rect(x0 + x * P, y0 + y * P, P, P));
  }));
  return Object.entries(by).map(([ch, d]) => {
    const [fill, op] = Array.isArray(colors[ch]) ? colors[ch] : [colors[ch], 1];
    return `<path d="${d.join("")}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ""}/>`;
  }).join("");
}
// 그림 둘레 한 칸 — 잉크 외곽(지도 테 위에 얹혀도 또렷하게)
function outline(map, x0, y0, P) {
  const H = map.length, W = map[0].length;
  const on = (x, y) => y >= 0 && y < H && x >= 0 && x < W && map[y][x] !== "." && map[y][x] !== "r";
  let d = "";
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) d += rect(x0 + x * P, y0 + y * P, P, P);
  }
  return d;
}

export function deco(w, h, S, site) {
  const id = "chart";
  const px = (n) => Math.max(1, Math.round(n * S));
  const o = site ? 12 : 14;
  const P = px(2); // 도트 한 칸
  // ── neatline: 바깥 굵은 줄 · 흑백 교차 칸 띠 · 안쪽 가는 줄 · 경위도 눈금 ──
  const t1 = px(2), band = px(4), t2 = px(1);
  const inn = o + t1 + band;
  const cellT = px(16);
  let lines = rect(o, o, w - o * 2, t1) + rect(o, h - o - t1, w - o * 2, t1) + rect(o, o, t1, h - o * 2) + rect(w - o - t1, o, t1, h - o * 2);
  lines += rect(inn, inn, w - inn * 2, t2) + rect(inn, h - inn - t2, w - inn * 2, t2) + rect(inn, inn, t2, h - inn * 2) + rect(w - inn - t2, inn, t2, h - inn * 2);
  let cells = "";
  let ticks = "";
  const b0 = o + t1;
  const tk = px(3), tw = px(1);
  const edge = (len) => { const n = Math.max(3, Math.round((len - band * 2) / cellT)); return { n, step: (len - band * 2) / n }; };
  {
    const { n, step } = edge(w - b0 * 2);
    for (let k = 0; k < n; k++) {
      const x = Math.round(b0 + band + k * step), x2 = Math.round(b0 + band + (k + 1) * step);
      if (k % 2 === 0) cells += rect(x, b0, x2 - x, band) + rect(x, h - b0 - band, x2 - x, band);
      if (k > 0) ticks += rect(x, inn + t2, tw, tk) + rect(x, h - inn - t2 - tk, tw, tk);
    }
  }
  {
    const { n, step } = edge(h - b0 * 2);
    for (let k = 0; k < n; k++) {
      const y = Math.round(b0 + band + k * step), y2 = Math.round(b0 + band + (k + 1) * step);
      if (k % 2 === 1) cells += rect(b0, y, band, y2 - y) + rect(w - b0 - band, y, band, y2 - y);
      if (k > 0) ticks += rect(inn + t2, y, tk, tw) + rect(w - inn - t2 - tk, y, tk, tw);
    }
  }
  for (const [x, y] of [[b0, b0], [w - b0 - band, b0], [b0, h - b0 - band], [w - b0 - band, h - b0 - band]]) cells += rect(x, y, band, band);

  // ── 나침반 장미 — 오른쪽 위. 북 · 동 끝이 지도 테에 걸친다 ──
  const RN = ROSE.length;
  const RP = site ? 3 : px(2.7); // 사이트 3 · 봇 6
  const half = (RN * RP) / 2;
  const cx = Math.round(w - o - half + RP * 1.5);
  const cy = Math.round(o + half - RP * 1.5);
  const rx0 = cx - RP * 8 - RP / 2, ry0 = cy - RP * 8 - RP / 2;
  const rose =
    `<path d="${outline(ROSE, rx0, ry0, RP)}" fill="${INK}"/>` +
    sprite(ROSE, { L: CREAM, D: SEPIA, N: NAVY, n: NAVY_D, F: NAVY, r: [CREAM, 0.38], x: INK }, rx0, ry0, RP);

  // ── 항정선 — 장미 가운데서 16방향, 멀어질수록 옅게 ──
  let rhumb = "";
  const far = (w + h) * 1.2;
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const r0 = half + RP;
    rhumb += `M${(cx + Math.cos(a) * r0).toFixed(1)} ${(cy + Math.sin(a) * r0).toFixed(1)}L${(cx + Math.cos(a) * far).toFixed(1)} ${(cy + Math.sin(a) * far).toFixed(1)}`;
  }
  const fadeR = Math.max(w, h) * 1.1;

  // ── 새 세계 해안 — 오른쪽 지도 테에서 솟은 땅(도트 해안선 · 땅 점묘 · 바다 쪽 물결 등고선 두 줄) ──
  //    ✕ 는 해안에 · 배는 왼쪽에서 점선 항로로 건너간다. 순위표(세로로 긴 카드)는 오른쪽 띠가 좁아 위쪽 빈자리에 작은 섬 + ✕
  const tall = !site && h / w >= 0.62;
  let bandY, xs, A, yA, yB, cap, bumps, base;
  if (site) {
    const k = w / 360;
    bandY = Math.round((326 + (h - 196 * k)) / 2) + 4;
    xs = inn + px(8); A = 40;
    yA = 118; yB = Math.round(h - 58 * k); cap = () => 18; base = 4; bumps = [[Math.round(200 * k), 8, 30], [bandY, 12, 40]];
  } else if (!tall) {
    bandY = Math.round(h * 0.56);
    xs = inn + px(10); A = 90;
    yA = 96; yB = h - 92; cap = (y) => (y < 272 ? 8 : 24); base = 5; bumps = [[bandY, 15, 90]];
  } else {
    bandY = Math.round(h * 0.135);
    xs = Math.round(w * 0.38); A = 60;
    yA = 160; yB = h - 70; cap = () => 8; base = 5; bumps = [];
  }
  const R = w - inn - t2; // 땅이 붙는 안쪽 줄
  const rows = Math.floor((yB - yA) / P);
  const depth = [];
  for (let j = 0; j < rows; j++) {
    const y = yA + j * P;
    const t = j / (rows - 1);
    const taper = Math.min(1, t / 0.12, (1 - t) / 0.12);
    const bmp = bumps.reduce((acc, [by, a, sg]) => acc + a * Math.exp(-(((y - by) / sg) ** 2)), 0);
    const wob = 2.2 * Math.sin(y / (9 * P)) + 1.4 * Math.sin(y / (3.3 * P) + 1.3);
    depth.push(Math.max(0, Math.min(cap(y), Math.round((base + bmp + wob) * taper))));
  }
  const cols = 34;
  const land = (c, j) => j >= 0 && j < rows && c >= 0 && c < depth[j];
  // 바다 쪽 거리(체비셰프) — 등고선 2 · 4 칸
  let coastD = "", landD = "", w1 = "", w2 = "";
  for (let j = -6; j < rows + 6; j++) for (let c = 0; c < cols; c++) {
    const x = R - (c + 1) * P, y = yA + j * P;
    if (land(c, j)) {
      const edge = !land(c + 1, j) || !land(c, j - 1) || !land(c, j + 1);
      if (edge) coastD += rect(x, y, P, P);
      else if ((c + j * 2) % 4 === 0) landD += rect(x, y, P, P);
      continue;
    }
    let dmin = 99;
    for (let dj = -5; dj <= 5; dj++) for (let dc = -5; dc <= 5; dc++) if (land(c + dc, j + dj)) dmin = Math.min(dmin, Math.max(Math.abs(dc), Math.abs(dj)));
    if (dmin === 2) w1 += rect(x, y, P, P);
    else if (dmin === 4 && (c + j) % 2 === 0) w2 += rect(x, y, P, P);
  }
  const coast = `<path d="${landD}" fill="${SEPIA}" fill-opacity="0.45"/><path d="${coastD}" fill="${SEPIA}" fill-opacity="0.85"/><path d="${w1}" fill="#c4a77c" fill-opacity="0.5"/><path d="${w2}" fill="${NAVY}" fill-opacity="0.5"/>`;

  const SP = site ? P : px(2.3); // 배는 봇 카드에서 한 칸 크게
  const shipW = SHIP[0].length * SP, shipH = SHIP.length * SP;
  const ship = sprite(SHIP, SHIP_C, xs, bandY - shipH + SP * 2, SP);
  const xw = XMARK.length * P;
  let isle = "", xx, xy, endX;
  if (tall) {
    const isleW = ISLE[0].length * P;
    const ix = Math.round(w * 0.82) - isleW, iy = bandY - P * 3;
    isle = sprite(ISLE, ISLE_C, ix, iy, P);
    xx = ix + Math.round((isleW - xw) / 2 / P) * P; xy = iy - xw + P * 2; endX = ix - P * 2;
  } else {
    const jb = Math.round((bandY - yA) / P);
    xx = Math.min(R - xw - P * 2, R - Math.round((depth[jb] + XMARK.length) / 2) * P); xy = bandY - Math.round(xw / 2 / P) * P;
    endX = xx - P * 3;
  }
  const xmark = `<path d="${outline(XMARK, xx, xy, P)}" fill="${INK}" fill-opacity="0.9"/>` + sprite(XMARK, { X: NAVY }, xx, xy, P);
  // 곡선을 따라 점(P 칸) — 3칸마다 하나, P 격자에 맞춤
  const p0 = [xs + shipW + P * 2, bandY + P], p3 = [endX, bandY];
  const p1 = [p0[0] + (p3[0] - p0[0]) * 0.3, p0[1] + A], p2 = [p0[0] + (p3[0] - p0[0]) * 0.65, p3[1] - A];
  const bez = (t) => {
    const u = 1 - t;
    return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
  };
  let route = "";
  let dist = 0, prev = bez(0), next = 0;
  for (let i = 0; i <= 4000; i++) {
    const q = bez(i / 4000);
    dist += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    prev = q;
    if (dist < next) continue;
    next += P * 3;
    route += rect(Math.round(q[0] / P) * P, Math.round(q[1] / P) * P, P, P);
  }

  // ── 경위선(사이트 카드만 — 봇 카드는 meta.grid 줄 무늬가 대신한다) ──
  let grat = "";
  if (site) {
    for (let x = inn + 44; x < w - inn; x += 44) grat += rect(x, inn, 1, h - inn * 2);
    for (let y = inn + 44; y < h - inn; y += 44) grat += rect(inn, y, w - inn * 2, 1);
  }

  return {
    defs: `<radialGradient id="${id}-fg" gradientUnits="userSpaceOnUse" cx="${cx}" cy="${cy}" r="${fadeR}"><stop offset="0" stop-color="#fff"/><stop offset="0.4" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0.15"/></radialGradient><clipPath id="${id}-cl"><rect x="${inn}" y="${inn}" width="${w - inn * 2}" height="${h - inn * 2}"/></clipPath><mask id="${id}-fm"><rect width="${w}" height="${h}" fill="url(#${id}-fg)"/></mask>`,
    under:
      (grat ? `<path d="${grat}" fill="${CREAM}" fill-opacity="0.05" shape-rendering="crispEdges"/>` : "") +
      `<path d="${rhumb}" stroke="${SEPIA}" stroke-opacity="0.5" stroke-width="${site ? 1 : 2.5}" fill="none" mask="url(#${id}-fm)" clip-path="url(#${id}-cl)"/>`,
    over:
      `<g shape-rendering="crispEdges">` +
      `<path d="${route}" fill="${CREAM}" fill-opacity="0.6"/>` +
      coast + `<g opacity="0.9">${ship}${isle}</g>` +
      xmark +
      `<path d="${lines}" fill="${CREAM}" fill-opacity="0.72"/>` +
      `<path d="${cells}" fill="${CREAM}" fill-opacity="0.72"/>` +
      `<path d="${ticks}" fill="${CREAM}" fill-opacity="0.42"/>` +
      rose +
      `</g>`,
  };
}
