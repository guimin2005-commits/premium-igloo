// 📌 등급 카드 스킨 「랭크 깃발」(2026-10-10 운영자 합격) — 시즌 티어 보상(브론즈 ~ 이글루). 아바타 테두리와 같은 보상: 시즌 결산 때 적힌
//    UserXp.seasonFrame.frame 등급의 카드 스킨을 아이템 없이 가진 것으로 친다(lib/itemEffects seasonSkinOf). 키는 "rank_<등급 키>".
//    · 카드 오른쪽 위 깃대에 등급 색 세로 깃발 — 천(세로 주름) · 금속 테두리 띠 · 고리 4개 · 깃대(왼쪽 끝 장식 · 오른쪽 벽 받침) · 왼쪽 술.
//      깃발 안 표식이 등급마다 한 단계씩 쌓인다: 방패 + V 갈매기(1 · 2 · 3) → 작은 보석 → 큰 보석 → 받침 → 불꽃 → 금별 → 이글루 북극성.
//      깃발 끝: 일자 → 뾰족 → 제비꼬리 → 세 갈래, 높을수록 길다. 마스터부터 끝에 술이 달리고 아래쪽이 펄럭인다(3장면 왕복 1.6초).
//    · 카드 테: 가는 금속 줄 + 모서리 = 테를 따라 계단으로 가늘어지는 칼날 막대 2개 · 45° 자리 마름모 받침(다이아부터 보석) · 골드부터 코등이 ·
//      마스터부터 막대 뒤 작은 마름모 징(그마부터 보석 알), 가운데 장식(플래티넘 아래 · 그마 옆 · 챌린저 위).
//    칸 2px × 배율(S), 단색 도트. 광택 그라데이션 없음. 색은 아바타 테두리 색표(scripts/gen-avatar-borders.mjs BORDER_TIERS) 사본 — 그마는 빨강 J 가 금속, 이글루는 연보라 금속.
//    ⚠️ 이 칸 크기에선 곡선 · 1칸 대각선 · 이웃 칸 기준 명암이 체크무늬로 지글거린다 — 곧은 줄 · 마름모 거리 명암 · 보석 외곽선 없이(시안 기록 .claude/mockups/src/tier-card9).
//    시안 원본 .claude/mockups/src/tier-card9/banner/rankBanner.js(FRAMESTYLE=corner · CREST=S4)
const TB = {"bronze":{"M":{"o":"#2a1208","d":"#6e3a1c","m":"#a8622f","l":"#d68c4f","h":"#ffd09a"},"J":{"o":"#2a160a","d":"#7a3a10","m":"#c0661e","l":"#f0a040","h":"#ffe0a0"}},"silver":{"M":{"o":"#151a24","d":"#4a5568","m":"#8a96a8","l":"#c9d2de","h":"#ffffff"},"J":{"o":"#0e1e3a","d":"#2a4a78","m":"#4f7fc0","l":"#8fb8ea","h":"#d0e6ff"}},"gold":{"M":{"o":"#3a1e04","d":"#8e5410","m":"#d0911e","l":"#f7c548","h":"#fff3b0"},"J":{"o":"#3a0606","d":"#8e1414","m":"#d8302a","l":"#ff7a5a","h":"#ffd0c0"}},"platinum":{"M":{"o":"#12302c","d":"#3f6e69","m":"#86b6b0","l":"#c6e6e1","h":"#f4fffd"},"J":{"o":"#06362c","d":"#118a6e","m":"#27caa0","l":"#86f2d2","h":"#e6fff7"}},"diamond":{"M":{"o":"#121e48","d":"#3550a0","m":"#6a8ae0","l":"#a9c4ff","h":"#eef4ff"},"J":{"o":"#1e1250","d":"#4a3cb8","m":"#7f78f0","l":"#c4c0ff","h":"#ffffff"}},"master":{"M":{"o":"#1c0e30","d":"#4c2c7c","m":"#8058c0","l":"#b694e8","h":"#efe2ff"},"J":{"o":"#2a0a40","d":"#7a2ab8","m":"#b45cf0","l":"#e2b2ff","h":"#ffffff"}},"grandmaster":{"M":{"o":"#140a0e","d":"#3a2a30","m":"#6a5660","l":"#9c8a92","h":"#e0d2d6"},"J":{"o":"#3a0408","d":"#a01418","m":"#ee3a2a","l":"#ff9a6a","h":"#ffe8c8"}},"challenger":{"M":{"o":"#3e2406","d":"#9a6618","m":"#dca434","l":"#ffd666","h":"#fff6c4"},"J":{"o":"#0a2450","d":"#1d5fc8","m":"#3fa0ff","l":"#a8dcff","h":"#ffffff"}},"igloo":{"M":{"o":"#2a2040","d":"#8a86a8","m":"#c8c4dc","l":"#eeeaf8","h":"#ffffff"},"J":{"o":"#241048","d":"#6a4ad8","m":"#9a8cff","l":"#8ff0ff","h":"#ffffff"}}};

export const TIER_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
export const TIER_LABELS = { bronze: "브론즈", silver: "실버", gold: "골드", platinum: "플래티넘", diamond: "다이아몬드", master: "마스터", grandmaster: "그랜드마스터", challenger: "챌린저", igloo: "이글루" };
const IGLOO_M = { o: "#2c2556", d: "#8a84b4", m: "#c4bfe0", l: "#e9e6f8", h: "#ffffff" };
const GM_GEM = { o: "#3a0408", d: "#b4281a", m: "#ff7a3a", l: "#ffb47a", h: "#fff0c8" };
const PRISM = { a: ["#bff0ff", "#5cc8f0", "#2a8ec8"], b: ["#d6c8ff", "#a48cff", "#6a4ad8"], c: ["#ffd0e6", "#f07ab4", "#c04480"] };

// 등급표 — cloth: 천 [밝 · 중 · 그늘] · B: 몸 끝 줄(칸) · tail: 끝 꼭짓점 [위치(0~27) · 깊이] · hw: 꼭짓점 반폭 · chev: 방패 갈매기 수 · crest: 방패 위 장식
const SPEC = {
  bronze: { cloth: ["#94502a", "#73391c", "#522610"], B: 110, tail: [], chev: 1, crest: null, fin: "ball", tip: null },
  silver: { cloth: ["#5e6c84", "#465269", "#30394c"], B: 114, tail: [[13.5, 9]], hw: 14, chev: 2, crest: null, fin: "ball", tip: "bead" },
  gold: { cloth: ["#8e5e12", "#6e460a", "#4e3006"], B: 118, tail: [[0, 11], [27, 11]], hw: 14, chev: 3, crest: null, fin: "spear", tip: "bead", band: 1 },
  platinum: { cloth: ["#22867a", "#18665c", "#0f4640"], B: 122, tail: [[0, 11], [13.5, 11], [27, 11]], hw: 7, chev: 3, crest: "small", fin: "spear", tip: "bead", band: 1 },
  diamond: { cloth: ["#4a5ac8", "#3442a4", "#252f7a"], B: 126, tail: [[0, 11], [13.5, 15], [27, 11]], hw: 7, chev: 3, crest: "gem", fin: "spear", tip: "bead", band: 1 },
  master: { cloth: ["#8252bc", "#62389a", "#442270"], B: 126, tail: [[0, 12], [13.5, 16], [27, 12]], hw: 7, chev: 3, crest: "gemStar", fin: "spearGem", tip: "tassel", band: 2, wave: 1 },
  grandmaster: { cloth: ["#741414", "#540c0c", "#380808"], B: 128, tail: [[0, 12], [13.5, 18], [27, 12]], hw: 7, chev: 3, crest: "gemStar", flames: 1, fin: "spearGem", tip: "tassel", band: 2, wave: 1 },
  challenger: { cloth: ["#2a86de", "#1c62b8", "#124488"], B: 130, tail: [[0, 13], [13.5, 18], [27, 13]], hw: 7, chev: 3, crest: "star", fin: "spearGem", tip: "tassel", band: 2, wave: 1 },
  igloo: { cloth: ["#8a6ae6", "#6a4ac8", "#4a30a0"], B: 132, tail: [[0, 14], [13.5, 21], [27, 14]], hw: 7, chev: 3, crest: "prism", fin: "spearGem", tip: "crystal", band: 2, wave: 1, prismField: 1 },
};

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
class Bd {
  constructor() { this.m = new Map(); }
  set(x, y, c) { if (c) this.m.set(x + "," + y, c); }
  get(x, y) { return this.m.get(x + "," + y); }
  del(x, y) { this.m.delete(x + "," + y); }
  svg(P, attr = "") {
    const by = {};
    for (const [k, c] of this.m) (by[c] ||= []).push(k.split(",").map(Number));
    let out = "";
    for (const [c, cells] of Object.entries(by)) {
      const rows = new Map();
      for (const [x, y] of cells) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
      let d = "";
      for (const [y, xs] of rows) {
        xs.sort((a, b) => a - b);
        for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += `M${xs[i] * P} ${y * P}h${(j - i + 1) * P}v${P}h${-(j - i + 1) * P}z`; i = j + 1; }
      }
      const [col, op] = c.split("|");
      out += `<path d="${d}" fill="${col}"${op ? ` fill-opacity="${op}"` : ""}/>`;
    }
    return `<g shape-rendering="crispEdges"${attr}>${out}</g>`;
  }
}
const keyset = (cells) => new Set(cells.map(([x, y]) => x + "," + y));
// 칸 묶음을 칠하고(colorOf) 바깥 한 칸에 외곽선 — 외곽선은 뒤에 찍힌 것을 덮어 앞뒤가 또렷하다
function paint(bd, cells, colorOf, line) {
  const S = keyset(cells), has = (x, y) => S.has(x + "," + y);
  for (const c of cells) bd.set(c[0], c[1], typeof colorOf === "function" ? colorOf(c[0], c[1], has, c[2]) : colorOf);
  if (line) for (const [x, y] of cells) for (const [dx, dy] of N4) if (!has(x + dx, y + dy)) bd.set(x + dx, y + dy, line);
}
const bevel = (R) => (x, y, has) => {
  const t = !has(x, y - 1), l = !has(x - 1, y), b = !has(x, y + 1), r = !has(x + 1, y);
  if (t && l) return R.h; if (t || l) return R.l; if (b || r) return R.d; return R.m;
};
const fromMap = (rows, ox, oy, flip = false) => {
  const W = Math.max(...rows.map((s) => s.length)), out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") out.push([ox + (flip ? W - 1 - x : x), oy + y, ch]); }));
  return out;
};
// 바깥까지 거리(4방향) — 테두리 띠 · 방패 테 두께에 쓴다
function depthOf(cells) {
  const S = keyset(cells), D = new Map(), q = [];
  for (const [x, y] of cells) if (N4.some(([a, b]) => !S.has(x + a + "," + (y + b)))) { D.set(x + "," + y, 1); q.push([x, y]); }
  while (q.length) { const [x, y] = q.shift(), d = D.get(x + "," + y); for (const [a, b] of N4) { const k = x + a + "," + (y + b); if (S.has(k) && !D.has(k)) { D.set(k, d + 1); q.push([x + a, y + b]); } } }
  return D;
}

// ── 그림 지도 ──
const SHIELD = [ // 20 × 23 — 위 모서리가 뾰족 솟고 가운데가 살짝 꺼진 방패
  "##................##",
  "###..............###",
  "#####..........#####",
  "#######......#######",
  "####################",
  "####################",
  "####################",
  "####################",
  "####################",
  "####################",
  "####################",
  "####################",
  ".##################.",
  ".##################.",
  "..################..",
  "..################..",
  "...##############...",
  "....############....",
  ".....##########.....",
  "......########......",
  ".......######.......",
  "........####........",
  ".........##.........",
];
const GEM = [
  "...hhhhhh...",
  "..hlhhhhlm..",
  ".hllllllmmm.",
  "hllllllmmmmd",
  "dmllllmmmmdd",
  ".dmllmmmmdd.",
  "..dmlmmmdd..",
  "...dmmmdd...",
  "....dmdd....",
  ".....dd.....",
];
const GEM_S = [
  "..hh..",
  ".hllm.",
  "hllmmd",
  "dlmmdd",
  ".dmdd.",
  "..dd..",
];
const STAR5 = [
  ".......##.......",
  ".......##.......",
  "......####......",
  "......####......",
  ".....######.....",
  "################",
  ".##############.",
  "...##########...",
  "....########....",
  "....########....",
  "...##########...",
  "...####..####...",
  "..###......###..",
  "..##........##..",
];
const FLAME = [ // 24 × 22 — 방패 뒤로 솟는 불꽃
  "..#..................#..",
  "..##................##..",
  ".###.......##.......###.",
  ".####.....###......####.",
  ".####....####.....#####.",
  "#####...#####....######.",
  "######..######..#######.",
  "#######.######.########.",
  "########################",
  "########################",
  "########################",
  "########################",
  "########################",
  ".######################.",
  ".######################.",
  "..####################..",
  "..####################..",
  "...##################...",
  "....################....",
  ".....##############.....",
  "......############......",
  ".......##########.......",
];
const SPEAR = [
  "......#..##",
  "....###..##",
  "..#######.#",
  "######.####",
  "..#######.#",
  "....###..##",
  "......#..##",
];
const BALL = [
  "..###.##",
  ".#####.#",
  "########",
  "########",
  "########",
  ".#####.#",
  "..###.##",
];

// 이글루 문장 칠 — 프리즘 세 결(하늘 · 보라 · 분홍) × 밝기 셋
const PC = { 1: PRISM.a[0], 2: PRISM.a[1], 3: PRISM.a[2], 4: PRISM.b[0], 5: PRISM.b[1], 6: PRISM.b[2], 7: PRISM.c[0], 8: PRISM.c[1], 9: PRISM.c[2], W: "#ffffff" };
const IGL = "#241048";
const P3 = (hue, shade) => String(hue * 3 + shade + 1); // hue 0 하늘 · 1 보라 · 2 분홍, shade 0 밝 · 1 중 · 2 그늘
const hueAt = (c, w) => { const u = (c + 0.5) / w; return u < 0.36 ? 0 : u < 0.64 ? 1 : 2; };

// ── 이글루 문장 — 북극성(긴 네 갈래 + 짧은 네 갈래 프리즘 별, 가운데 흰 빛). 챌린저(금속 오각별 + 작은 보석)보다 한 단계 위로 보이게
//    (2026-10-10 운영자 "왜 챌린저는 별인데 얘는 이거야" → 별 계열 4안 중 북극성)
function starPoly(cx, cy, tips, rIn) {
  const pts = [], n = tips.length;
  for (let k = 0; k < n; k++) {
    const [a, R] = tips[k], a2 = tips[(k + 1) % n][0] + (k === n - 1 ? 2 * Math.PI : 0), am = (a + a2) / 2;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)], [cx + rIn * Math.cos(am), cy + rIn * Math.sin(am)]);
  }
  const inP = (x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const Rm = Math.ceil(Math.max(...tips.map((t) => t[1]))) + 1, cells = [];
  for (let y = Math.floor(cy - Rm); y <= Math.ceil(cy + Rm); y++) for (let x = Math.floor(cx - Rm); x <= Math.ceil(cx + Rm); x++) if (inP(x + 0.5, y + 0.5)) cells.push([x, y]);
  return cells;
}
// 면 그늘 — 가장 가까운 갈래의 어느 쪽 면인가 · 빛은 왼쪽 위에서(0 밝 · 1 중 · 2 그늘)
function facetOf(x, y, cx, cy, tips) {
  const phi = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
  let best = null;
  for (const [a] of tips) { const d = Math.atan2(Math.sin(phi - a), Math.cos(phi - a)); if (!best || Math.abs(d) < Math.abs(best.d)) best = { a, d }; }
  const na = best.a + (best.d < 0 ? -1 : 1) * (Math.PI / 2), b = Math.cos(na) * -0.55 + Math.sin(na) * -0.83;
  return b > 0.25 ? 0 : b > -0.35 ? 1 : 2;
}
const tipsN = (n, R, rot = 0) => Array.from({ length: n }, (_, k) => [-Math.PI / 2 + rot + (k * 2 * Math.PI) / n, typeof R === "function" ? R(k) : R]);
// 프리즘 별 칠 — 결은 가로 위치(하늘 · 보라 · 분홍), 그늘은 면, 가운데 흰 빛
function prismStar(bd, cx, cy, tips, rIn, glow = 1.2) {
  const cells = starPoly(cx, cy, tips, rIn), xs = cells.map((c) => c[0]), x0 = Math.min(...xs), w = Math.max(...xs) - x0 + 1;
  paint(bd, cells, (x, y) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= glow ? PC.W : PC[P3(hueAt(x - x0, w), facetOf(x, y, cx, cy, tips))]), IGL);
}
function polaris(bd, sT) {
  prismStar(bd, 154, sT - 6, tipsN(8, (k) => (k === 0 ? 12.5 : k === 4 ? 11.5 : k % 2 ? 6.6 : 10.5)), 3.5);
}

// ── 깃발 한 장면 ──
const CX0 = 140, CW = 28, ROD = 58, TOP = 57;
// fit: 아래가 막힌 카드(레벨 페이지 — 등급 줄 오른쪽 "등급 안내" 단추)에서 줄일 줄 수. 먼저 방패 아래 민 천을, 그래도 넘치면 끝 꼬리 길이를 줄인다(방패 · 문장 · 끝 모양 · 장식은 그대로)
const TIP_EXTRA = { bead: 2, tassel: 8, crystal: 6 };
const flagBottom = (key) => { const sp = SPEC[key]; return sp.B + Math.max(0, ...sp.tail.map((t) => t[1])) + (TIP_EXTRA[sp.tip] || 0); };
function banner(key, f, fit = 0) {
  const sp = SPEC[key], T = TB[key];
  const M = key === "igloo" ? IGLOO_M : key === "grandmaster" ? T.J : T.M;
  const J = key === "grandmaster" ? GM_GEM : T.J;
  const [cl, cm, cd] = sp.cloth;
  const bd = new Bd();
  const sT = sp.crest ? 78 : 68; // 방패 위 줄
  const cutB = Math.max(0, Math.min(fit, sp.B - (sT + 33))); // 아래 띠(B-9 ~ B-4)가 방패 밑(sT+22)에 닿지 않을 만큼만
  const B = sp.B - cutB;
  const tMax = Math.max(0, ...sp.tail.map((t) => t[1])), rest = fit - cutB;
  const tk = rest > 0 && tMax > 0 ? Math.max(0.4, (tMax - rest) / tMax) : 1;
  const tail = sp.tail.map(([c, d]) => [c, Math.max(2, Math.round(d * tk))]);
  // 끝 모양 — 꼭짓점마다 깊이, 사이는 곧게
  const depthAt = (c) => { let d = 0; for (const [ck, dk] of tail) d = Math.max(d, Math.round(dk * Math.max(0, 1 - Math.abs(c - ck) / sp.hw))); return d; };
  const maxY = B + Math.max(0, ...tail.map((t) => t[1]));
  // 펄럭임 — 표식 아래부터 끝으로 갈수록 크게, 3장면 왕복
  const wv0 = sT + 26;
  const shift = (y) => {
    if (!sp.wave || y < wv0 || maxY <= wv0) return 0;
    const t = (y - wv0) / (maxY - wv0);
    return Math.round(1.25 * t * Math.sin(Math.PI * 1.1 * t - (f * 2 * Math.PI) / 3 + 0.6));
  };
  // 천 칸
  const cloth = [];
  for (let y = TOP; y <= maxY; y++) { const s = shift(y); for (let c = 0; c < CW; c++) if (y <= B + depthAt(c)) cloth.push([CX0 + c + s, y, c]); }
  const D = depthOf(cloth);
  const band = (y) => (key === "igloo" ? (y < 66 ? 0 : y > B - 4 ? 2 : 1) : 1);
  const IGC = [["#5cc0ee", "#3a96d0", "#2470a8"], sp.cloth, ["#ee70ac", "#cc4c8c", "#963266"]];
  paint(bd, cloth, (x, y, has, c) => {
    const d = D.get(x + "," + y);
    const [L, Mm, Dd] = key === "igloo" ? IGC[band(y)] : [cl, cm, cd];
    if (d === 1) return c < 14 ? M.l : M.m;
    if (d === 2) return M.d;
    if (d === 3) return Dd;
    // 머리 띠 · 아래 띠
    if (y === 62) return M.l; if (y === 63) return M.d; if (y === 64) return Dd;
    if (sp.band && (y === B - 6 || y === B - 5)) return y === B - 6 ? M.l : M.d;
    if (sp.band && y === B - 4) return Dd;
    if (sp.band === 2 && (y === B - 9)) return M.m;
    // 세로 주름
    if (c === 5) return L;
    if (c === 13) return Dd;
    if (c === 14) return L;
    if (c >= 22) return Dd;
    return Mm;
  }, M.o);
  // ── 표식 ── 방패(가운데 153.5) + 갈매기 + 위 장식
  const gemPaint = (map, ox, oy) => paint(bd, fromMap(map, ox, oy), (x, y, h, t) => J[t], J.o);
  if (sp.flames) {
    const cells = fromMap(FLAME, 142, sT - 12);
    const FD = depthOf(cells);
    paint(bd, cells, (x, y) => { const d = FD.get(x + "," + y); return d === 1 ? "#ff5a2a" : d === 2 ? "#ffa23a" : "#ffe08a"; }, "#2a0406");
  }
  // 보석 받침(마스터부터) — 보석 둘레 두 칸 금속 테 + 위 · 옆 뾰족
  if (sp.crest === "gemStar") {
    const g = fromMap(GEM, 148, sT - 9);
    const cells = new Map();
    for (const [x, y] of g) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.abs(a) + Math.abs(b) <= 3) cells.set(x + a + "," + (y + b), [x + a, y + b]);
    const top = Math.min(...g.map((c) => c[1])), mid = sT - 6;
    for (let i = 0; i < 4; i++) for (let k = -1 + Math.floor(i / 2); k <= 2 - Math.floor(i / 2); k++) cells.set(153 + k - 1 + "," + (top - 3 - i), [152 + k, top - 3 - i]);
    for (let i = 0; i < 3; i++) for (let k = 0; k <= 2 - i; k++) { cells.set(144 - i + "," + (mid - 1 + k), [144 - i, mid - 1 + k]); cells.set(163 + i + "," + (mid - 1 + k), [163 + i, mid - 1 + k]); }
    paint(bd, [...cells.values()], bevel(M), M.o);
  }
  {
    const cells = fromMap(SHIELD, 144, sT);
    const SD = depthOf(cells);
    const PF = [PRISM.a, PRISM.b, PRISM.c];
    paint(bd, cells, (x, y, has) => {
      const d = SD.get(x + "," + y);
      if (d === 1) return bevel(M)(x, y, has);
      if (d === 2) return x < 154 && y < sT + 10 ? M.m : M.d;
      if (sp.prismField) { const p = PF[x < 151 ? 0 : x < 157 ? 1 : 2]; return d === 3 ? p[2] : p[1]; }
      if (d === 3) return x < 154 && y < sT + 9 ? J.l : J.m;
      return key === "gold" || key === "silver" || key === "bronze" ? J.m : J.d;
    }, M.o);
    // 갈매기(V) — 수가 곧 단계
    const apex = { 1: [sT + 15], 2: [sT + 17, sT + 12], 3: [sT + 18, sT + 13, sT + 8] }[sp.chev];
    for (const ay of apex) for (let dx = 0; dx <= 5; dx++) for (const x of [153 - dx, 154 + dx]) {
      // 금속 두 줄(위 밝게) + 아래 그림자 한 줄 — 외곽선 없이 바탕에 박힌 띠
      bd.set(x, ay - dx - 1, dx === 0 ? M.h : M.l); bd.set(x, ay - dx, M.m); bd.set(x, ay - dx + 1, M.o);
    }
  }
  if (sp.crest === "small") gemPaint(GEM_S, 151, sT - 4);
  if (sp.crest === "gem" || sp.crest === "gemStar") gemPaint(GEM, 148, sT - 9);
  if (sp.crest === "star") { paint(bd, fromMap(STAR5, 146, sT - 12), bevel(M), M.o); gemPaint(GEM_S, 151, sT - 7); }
  if (sp.crest === "prism") polaris(bd, sT);

  // ── 깃대 · 고리 ──
  const rodC = [M.o, M.l, M.m, M.d, M.o];
  for (let x = 134; x <= 169; x++) for (let i = 0; i < 5; i++) bd.set(x, ROD - 2 + i, rodC[i]);
  for (const a of [142, 149, 155, 162]) {
    const cells = []; for (let y = 55; y <= 61; y++) for (let x = a; x < a + 4; x++) cells.push([x, y]);
    const [L, Mm, Dd] = key === "igloo" ? IGC[0] : [cl, cm, cd];
    paint(bd, cells, (x, y) => (y === 55 ? L : x === a ? L : x === a + 3 ? Dd : Mm), M.o);
    bd.set(a + 1, 58, Dd); bd.set(a + 2, 58, Dd); // 바느질 자국
  }
  // 왼쪽 끝 장식
  {
    const map = sp.fin === "ball" ? BALL : SPEAR;
    const ox = 134 - map[0].length;
    const cells = fromMap(map, ox, ROD - 3);
    paint(bd, cells, bevel(M), M.o);
    if (sp.fin === "spearGem") { bd.set(ox + 4, ROD - 1, J.h); bd.set(ox + 5, ROD - 1, J.l); bd.set(ox + 4, ROD, J.l); bd.set(ox + 5, ROD, J.m); bd.set(ox + 4, ROD + 1, J.m); bd.set(ox + 5, ROD + 1, J.d); }
  }
  // 오른쪽 벽 받침(테에 박힌 판 + 징 두 개)
  {
    const cells = []; for (let y = 51; y <= 65; y++) for (let x = 170; x <= 175; x++) if (!((y === 51 || y === 65) && (x === 170 || x === 175))) cells.push([x, y]);
    paint(bd, cells, bevel(M), M.o);
    for (const ry of [53, 62]) { bd.set(172, ry, M.h); bd.set(173, ry, M.l); bd.set(172, ry + 1, M.l); bd.set(173, ry + 1, M.d); }
    for (let x = 168; x <= 169; x++) for (let i = 0; i < 5; i++) bd.set(x, ROD - 2 + i, i === 0 || i === 4 ? M.o : M.m);
  }
  // 왼쪽 술 — 꼰 끈 · 매듭 구슬 · 술
  const sway = (y, y0) => (sp.wave ? [0, 1, 1][f] * (y >= y0 + 4 ? 1 : 0) + [0, 0, 1][f] * (y >= y0 + 8 ? 1 : 0) : 0);
  const tassel = (x, y, long, J2) => {
    const cells = [];
    for (let i = 0; i < 5; i++) cells.push([x, y + i, i % 2 ? "d" : "l"]);
    for (const [a, b, t] of [[-1, 5, "l"], [0, 5, "h"], [1, 5, "m"], [-1, 6, "m"], [0, 6, "m"], [1, 6, "d"], [-1, 7, "d"], [0, 7, "d"], [1, 7, "d"]]) cells.push([x + a, y + b, "M" + t]);
    for (let k = -2; k <= 2; k++) cells.push([x + k, y + 8, "Mm"]);
    for (let i = 0; i < long; i++) for (let k = -2; k <= 2; k++) { if (i === long - 1 && (k === -2 || k === 2)) continue; cells.push([x + k + sway(y + 9 + i, y + 9), y + 9 + i, k === -2 ? "l" : k === 2 ? "d" : k === 0 ? "l" : "m"]); }
    paint(bd, cells, (xx, yy, h, t) => (t[0] === "M" ? M[t[1]] : J2[t]), M.o);
  };
  tassel(136, 61, 10, J);
  // 끝 장식 — 꼭짓점 아래
  const tips = tail.map(([ck, dk]) => { const c = Math.min(CW - 1, Math.max(0, Math.round(ck))); return [c, B + dk]; });
  for (const [c, ty] of tips) {
    const x = CX0 + c + shift(ty);
    if (sp.tip === "bead") {
      const cells = [[x, ty + 1, "l"], [x + (c >= 14 ? -1 : 1), ty + 1, "m"], [x, ty + 2, "m"], [x + (c >= 14 ? -1 : 1), ty + 2, "d"]];
      paint(bd, cells, (xx, yy, h, t) => M[t], M.o);
    } else if (sp.tip === "tassel") {
      const cells = [];
      cells.push([x, ty + 1, "Ml"], [x, ty + 2, "Md"]);
      for (let i = 0; i < 5; i++) for (const k of [-1, 0, 1]) cells.push([x + k + (sp.wave ? [0, 1, 0][f] * (i >= 2 ? 1 : 0) + [0, 0, -1][f] * (i >= 3 ? 1 : 0) : 0), ty + 3 + i, k === -1 ? "l" : k === 0 ? "m" : "d"]);
      paint(bd, cells, (xx, yy, h, t) => (t[0] === "M" ? M[t[1]] : J[t]), M.o);
    } else if (sp.tip === "crystal") {
      const cells = [];
      const P = [PRISM.a, PRISM.b, PRISM.c][(c / 7) % 3 | 0];
      for (let i = 0; i < 6; i++) { const w = i < 4 ? 1 : 0; for (let k = -w; k <= w; k++) cells.push([x + k + (sp.wave ? [0, 1, 0][f] * (i >= 3 ? 1 : 0) : 0), ty + 1 + i, k < 0 ? 0 : k > 0 ? 2 : 1]); }
      paint(bd, cells, (xx, yy, h, t) => P[t], "#241048");
    }
  }
  return bd;
}

// ── 카드 테 — "깔끔하면서도 화려하게"(2026-10-10 테 1 모서리 장식 채택): 곧은 줄은 단정하게, 화려함은 모서리 · 가운데 장식에 모은다
//    등급마다 한 단계씩: 칼날 길이 · 안쪽 가는 줄(실버) · 가운데 장식(플래티넘) · 보석(다이아) · 두 겹 칼날(마스터) · 옆 가운데 장식(그마) · 위 가운데(챌린저)
const FL = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4, master: 5, grandmaster: 6, challenger: 7, igloo: 8 };
const rrTest = (W, H) => (x, y, ins, r) => {
  const px = x + 0.5, py = y + 0.5, x0 = ins, y0 = ins, x1 = W - ins, y1 = H - ins;
  if (px < x0 || py < y0 || px > x1 || py > y1) return false;
  const qx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px, qy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  return (px - qx) ** 2 + (py - qy) ** 2 <= r * r;
};
const quad = (x, y, W, H) => (y < H / 2 && x < W / 2 ? 0 : y < H / 2 || x < W / 2 ? 1 : 2);
const metalOfT = (key) => (key === "igloo" ? IGLOO_M : key === "grandmaster" ? TB[key].J : TB[key].M);
const gemOfT = (key, i = 0) => {
  if (key === "igloo") { const r = [PRISM.a, PRISM.b, PRISM.c][i % 3]; return { h: "#ffffff", l: r[0], m: r[1], d: r[2], o: IGL }; }
  return key === "grandmaster" ? GM_GEM : TB[key].J;
};
// 보석 한 알 — 가운데(cx, cy · 칸 경계 좌표) · 마름모 반지름 r
function gemAt(bd, cx, cy, r, G, line) {
  const cells = [];
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) <= r) cells.push([x, y]);
  const top = Math.min(...cells.map((c) => c[1]));
  // 마름모 거리로 칠한다(바깥 한 칸 중 왼위 반쪽 밝게 · 오아래 반쪽 어둡게) — 이웃 칸으로 칠하면 계단마다 밝 · 어둠이 번갈아 체크무늬가 됐다
  paint(bd, cells, (x, y) => { const u = x + 0.5 - cx, w = y + 0.5 - cy; return y === top ? G.h : Math.abs(u) + Math.abs(w) > r - 1.05 ? (u + w < 0 ? G.l : u + w > 0 ? G.d : G.m) : u + w < -0.5 ? G.l : G.m; }, line);
}
const rivetAt = (bd, x, y, M) => { bd.set(x, y, M.h); bd.set(x + 1, y, M.l); bd.set(x, y + 1, M.l); bd.set(x + 1, y + 1, M.d); };
// 왼쪽 위 모서리 칸 묶음 → 네 모서리(같은 빛 방향으로 칠하려고 칸만 뒤집는다)
const mirror4 = (cells, W, H) => [cells, cells.map(([x, y]) => [W - 1 - x, y]), cells.map(([x, y]) => [x, H - 1 - y]), cells.map(([x, y]) => [W - 1 - x, H - 1 - y])];
const at4 = (x, y, W, H) => [[x, y], [W - x, y], [x, H - y], [W - x, H - y]]; // 칸 경계 좌표(보석 가운데)

// 가운데 장식 — 레일 위 마름모 받침 + 레일 따라 짧은 칼날, side: b 아래 · t 위 · l 왼 · r 오른
function midOrn(bd, key, side, W, H, railIns, gi) {
  const M = metalOfT(key), lv = FL[key], cells = [], TL = 7, hz = side === "b" || side === "t";
  const c = hz ? W / 2 : H / 2, rr = side === "b" ? H - 1 - railIns : side === "r" ? W - 1 - railIns : railIns;
  const put = (u, v) => cells.push(hz ? [u, v] : [v, u]); // u 레일 방향 · v 레일 가로
  for (let u = Math.floor(c - 5); u <= Math.ceil(c + 5); u++) for (let v = rr - 5; v <= rr + 5; v++) if (Math.abs(u + 0.5 - c) + Math.abs(v - rr) <= 4.2) put(u, v);
  for (let i = 0; i <= TL; i++) { const e = i < TL / 2 ? 1 : 0; for (let v = rr - 1 - e; v <= rr + 1 + e; v++) { put(Math.floor(c + 4 + i), v); put(Math.floor(c - 5 - i), v); } }
  paint(bd, cells, bevel(M), M.o);
  const [gx, gy] = hz ? [c, rr + 0.5] : [rr + 0.5, c];
  if (lv >= 4) gemAt(bd, gx, gy, 2.4, gemOfT(key, gi), null);
  else rivetAt(bd, Math.floor(gx - 0.5), Math.floor(gy - 0.5), M);
}
function midOrns(bd, key, W, H, railIns) {
  const lv = FL[key];
  if (lv >= 3) midOrn(bd, key, "b", W, H, railIns, 1);
  if (lv >= 6) { midOrn(bd, key, "l", W, H, railIns, 0); midOrn(bd, key, "r", W, H, railIns, 2); }
  if (lv >= 7) midOrn(bd, key, "t", W, H, railIns, 1);
}

function frameCorner(key, W, H) {
  const lv = FL[key], M = metalOfT(key), bd = new Bd(), inRR = rrTest(W, H);
  const ring = (x, y, ins, r) => inRR(x, y, ins, r) && !inRR(x, y, ins + 1, r - 1);
  // ① 가는 금속 줄(외곽 · 금속 한 칸 · 외곽) + 안쪽 가는 줄(실버부터)
  // 모서리 둥근 곳의 줄은 그리지 않는다 — 한 칸 굵기 줄이 45° 로 꺾이면 체크무늬처럼 지글거린다(모서리 장식이 그 자리를 덮는다)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if ((x < 12 || x >= W - 12) && (y < 12 || y >= H - 12)) continue;
    const q = quad(x, y, W, H);
    if (ring(x, y, 2, 10) || ring(x, y, 4, 8)) bd.set(x, y, M.o);
    else if (ring(x, y, 3, 9)) bd.set(x, y, [M.l, M.m, M.d][q]);
    else if (lv >= 1 && ring(x, y, 6, 6)) bd.set(x, y, M.d + "|0.6");
  }
  // ② 모서리 — 테를 따라 곧게 뻗다 끝이 뾰족해지는 쇠 막대 두 개(위 · 옆) + 모서리 45° 자리에 마름모 받침
  //    곡선 · 대각 줄은 이 칸 크기에서 울퉁불퉁 · 지글지글해 보여서 곧은 줄과 마름모만 쓴다(2026-10-10 운영자 "모서리 부분 디자인 좀만 더 다듬어")
  //    막대는 두 칸 · 한 칸 계단으로 가늘어지는 칼날 꼴("날카롭고 묵직하게"), 골드부터 첫머리에 코등이, 다이아부터 받침이 커지고 보석, 마스터부터 막대 뒤 작은 마름모 징(그마부터 징에 보석 알)
  const L = [8, 9, 10, 11, 12, 13, 14, 15, 16][lv], R = lv >= 4 ? 4.6 : 3.8, C = 6.5;
  const bar = new Map(), put = (x, y, b) => bar.set(x + "," + y, [x, y, b]);
  for (let i = 0; i <= L; i++) {
    const x = 9 + i, tip = i > L - 3, half = i === L - 2, e = i < Math.round(L * 0.45) ? 2 : 1;
    for (let v = tip && !half ? 3 : 2; v <= (tip ? (half ? 4 : 3) : 4 + e); v++) {
      const b = v === 2 ? "bo" : v >= 4 ? "bi" : "bm";
      put(x, v, "h" + b); put(v, x, "v" + b);
    }
  }
  const rings = []; // 코등이 — 받침 옆 막대 첫머리에 가로지르는 쇠(골드부터, 다이아부터 한 칸 더 길게)
  if (lv >= 2) for (let x = 11; x < 13; x++) for (let v = 1; v <= (lv >= 4 ? 8 : 7); v++) { rings.push([x, v, "h"]); rings.push([v, x, "v"]); }
  const plate = [];
  for (let y = 0; y <= 12; y++) for (let x = 0; x <= 12; x++) if (Math.abs(x + 0.5 - C) + Math.abs(y + 0.5 - C) <= R) plate.push([x, y]);
  const studs = [];
  if (lv >= 5) { const s = 9 + L + 4; for (let y = 1; y <= 6; y++) for (let x = s - 3; x <= s + 3; x++) if (Math.abs(x - s) + Math.abs(y + 0.5 - 3.5) <= 2.1) { studs.push([x, y, "h"]); studs.push([y, x, "v"]); } }
  const blade = (dir, i, b) => { // dir h · v, 모서리 i(0 왼위 · 1 오위 · 2 왼아래 · 3 오아래), b bo 바깥 · bm 가운데 · bi 안쪽
    const outerLit = dir === "h" ? i < 2 : i % 2 === 0;
    return b === "bm" ? M.m : (b === "bo") === outerLit ? M.l : M.d;
  };
  const src = [...bar.values()], bq = mirror4(src, W, H), rq = mirror4(rings, W, H), pq = mirror4(plate, W, H), sq = mirror4(studs, W, H), centers = at4(C, C, W, H);
  const split = (cells, from) => ["h", "v"].map((d) => cells.filter((_, j) => from[j][2][0] === d));
  for (let i = 0; i < 4; i++) {
    for (const s of split(bq[i].map(([x, y], j) => [x, y, src[j][2]]), src)) paint(bd, s, (x, y, has, b) => blade(b[0], i, b.slice(1)), M.o);
    for (const s of split(rq[i], rings)) paint(bd, s, bevel(M), M.o);
    if (studs.length) for (const s of split(sq[i], studs)) {
      paint(bd, s, bevel(M), M.o);
      if (lv >= 6) { const G = gemOfT(key, i + 1), mx = s.reduce((a, c) => a + c[0], 0) / s.length, my = s.reduce((a, c) => a + c[1], 0) / s.length; bd.set(Math.round(mx), Math.round(my), G.m); }
    }
    // 받침은 마름모 거리로 칠한다(바깥 한 칸 · 왼위 반쪽 밝게 · 오아래 반쪽 어둡게) — 칸 이웃으로 칠하면 계단 칸마다 밝 · 어둠이 번갈아 체크무늬가 됐다
    { const [pcx, pcy] = centers[i]; paint(bd, pq[i], (x, y) => { const u = x + 0.5 - pcx, w = y + 0.5 - pcy; return Math.abs(u) + Math.abs(w) > R - 1.05 ? (u + w < 0 ? M.l : u + w > 0 ? M.d : M.m) : M.m; }, M.o); }
    const [gx, gy] = centers[i];
    if (lv >= 4) gemAt(bd, gx, gy, 2.4, gemOfT(key, i), null); // 보석 외곽선 없이 받침에 바로 박는다(외곽선 · 받침 · 외곽선이 한 칸씩 겹쳐 체크무늬로 보였다)
    else rivetAt(bd, Math.floor(gx - 1), Math.floor(gy - 1), M);
  }
  midOrns(bd, key, W, H, 3);
  return bd;
}

// ── 움직임(마스터부터) — 깃발 3장면을 1.6초에 왕복(펄럭임 · 술 흔들림). 움직임 줄이기 설정이면 첫 장면에 멈춘다.
//    클래스 이름은 다른 스킨 · 화면과 겹치지 않게 rk 로 시작. 봇 카드(그림 한 장)는 첫 장면만 그린다
const STYLE = `<style>.rkf{animation:rkk 1.6s infinite steps(1)}.rkf1{animation-name:rkk1}.rkf2{animation-name:rkk2}
@keyframes rkk{0%{opacity:1}25%{opacity:0}100%{opacity:0}}@keyframes rkk1{0%{opacity:0}25%{opacity:1}50%{opacity:0}75%{opacity:1}100%{opacity:1}}@keyframes rkk2{0%{opacity:0}50%{opacity:1}75%{opacity:0}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.rkf{animation:none}.rkf1,.rkf2{opacity:0}}</style>`;

// 깃발 자리 — 깃발은 카드 폭 180칸(사이트 프로필 카드 360px) 기준 좌표로 그리고 오른쪽 끝에 맞춰 옮긴다(dx).
//    사이트(site): 위아래 그대로(깃대 줄 58칸 = 116px — 이름 · 랭크 칩 아래). 봇 카드(가로로 넓고 낮다): 깃대를 위 테 가까이로 올린다(dy)
const BOT_DY = -50;
const shiftBd = (bd, dx, dy) => {
  const o = new Bd();
  for (const [k, c] of bd.m) { const i = k.indexOf(","); o.m.set(Number(k.slice(0, i)) + dx + "," + (Number(k.slice(i + 1)) + dy), c); }
  return o;
};

function makeSkin(key) {
  return {
    meta: { key: "rank_" + key, label: `${TIER_LABELS[key]} 등급`, tier: key },
    // deco(w, h, S, site, ctx) → { defs, under, over } — 다른 문자열 스킨(lib/cardSkins)과 같은 꼴. ctx.frame(0 · 1 · 2)을 주면 그 장면만(미리보기 · 시험용),
    //   ctx.flag === false 면 테만(봇 카드 중 오른쪽 위까지 글이 찬 카드 — lib/botCards RANK_FLAG_KINDS)
    deco(w, h, S = 1, site = true, ctx = {}) {
      const P = 2 * S, GW = Math.round(w / P), GH = Math.round(h / P);
      const dx = GW - 180, dy = site ? 0 : BOT_DY;
      // 📌 등급 줄 오른쪽에 단추가 있는 카드(레벨 페이지 "등급 안내" — SkinFrame ctx.avoidLeft · goalY)는 깃발이 단추 위에서 끝나게 줄인다
      const avoidRight = site && ctx.avoidLeft != null && ctx.goalY != null && ctx.avoidLeft > w - 150;
      const fit = avoidRight ? Math.max(0, flagBottom(key) - (Math.floor((ctx.goalY - 8) / P) - dy)) : 0;
      const fr = frameCorner(key, GW, GH).svg(P);
      if (ctx.flag === false) return { defs: "", under: fr, over: "" };
      const flag = (f) => shiftBd(banner(key, f, fit), dx, dy);
      const shadowOf = (bd) => { const s = new Bd(); for (const k of bd.m.keys()) { const i = k.indexOf(","); s.set(Number(k.slice(0, i)) + 1, Number(k.slice(i + 1)) + 2, "#000000|0.45"); } return s.svg(P); };
      const anim = SPEC[key].wave && site && ctx.frame == null;
      if (!anim) {
        const bd = flag(ctx.frame ?? 0);
        return { defs: "", under: fr + shadowOf(bd), over: bd.svg(P) };
      }
      const frames = [0, 1, 2].map(flag);
      // 안 움직이는 칸(모든 장면에 같은 색)은 한 번만, 바뀌는 칸만 장면마다
      const still = new Bd();
      for (const [k, c] of frames[0].m) if (frames.every((b) => b.m.get(k) === c)) still.m.set(k, c);
      const diff = frames.map((b) => { const d = new Bd(); for (const [k, c] of b.m) if (still.m.get(k) !== c) d.m.set(k, c); return d; });
      const sh = frames.map((b) => shadowOf(b));
      const over = still.svg(P) + diff.map((d, i) => `<g class="rkf${i ? " rkf" + i : ""}"${i ? ' opacity="0"' : ""}>${d.svg(P)}</g>`).join("");
      return { defs: STYLE, under: fr + `<g class="rkf">${sh[0]}</g><g class="rkf rkf1" opacity="0">${sh[1]}</g><g class="rkf rkf2" opacity="0">${sh[2]}</g>`, over };
    },
  };
}

// 📌 스킨 키 "rank_<등급 키>" — lib/itemEffects SKINS · lib/botCards CARD_SKINS · 봇 bot/src/itemEffects SKIN_KEYS 와 같아야 한다
export const RANK_SKIN_KEYS = TIER_KEYS.map((k) => "rank_" + k);
export const RANK_SKINS = Object.fromEntries(TIER_KEYS.map((k) => ["rank_" + k, makeSkin(k)]));
