// 📌 할로윈 시즌 카드 스킨 「마녀의 밤」(hw_witch) — 오른쪽 위 큰 보름달 앞을 빗자루 탄 마녀가 지나가는 카드. 2026-10-09 시안, 운영자 "카드 테두리는 진짜 다 예쁜데" → 10/10 5종 모두 합격.
//   그림 원본: .claude/mockups/src/halloween/skins/s1b.js (사이트 자리는 360 폭 카드 기준 → 스탯 두 열 사이 병은 카드 가운데를 따라간다)
//   짙은 보라검정 마법서 가죽 액자(볼록 몰딩) · 네 모서리 달빛 금속 모서리쇠 · 테를 따라 박힌 금 징
//   + 오른쪽 위 구석: 위 테에 살짝 걸린 큰 보름달(왼쪽 위 빛 · 분화구) · 달 앞을 지나는 마녀 실루엣(고깔모자 · 매부리코 · 망토 · 빗자루)
//   + 바닥 띠: 오른쪽 아래 구석 장작불 위에서 초록 물약이 끓는 솥 · 둥근 물약병 / 스탯 두 열 사이 긴 물약병 · 작은 병
//     / 왼쪽 마법서 두 권 · 촛불 · 수정 구슬 / 시즌 글자 아래 작은 병 · 꼬마 호박
//   + 레벨 막대가 있는 사이트 카드(레벨 페이지 · 상점 미리보기)는 바닥 띠를 비우고 막대 오른쪽 끝 위에 한 무리로: 촛불 · 마법서 두 권 위 둥근 물약병 · 솥(아주 좁은 카드는 솥 없이)
//   카드를 칠하거나 번지게 하지 않는다 — 도트 칸만. 사이트는 마녀가 달을 가로질러 지나가고(달 밖으로는 안 보인다)
//   솥이 보글보글 · 장작불 · 촛불이 일렁인다(움직임 줄이기면 멈춤 — 마녀는 달 가운데)
import { floorLimit, sinkBy, behind, frameOut, botTopOpen, botFloorOpen } from "./hwFloor.js";

// floor: 사이트 카드 바닥 띠 그림 높이(px — 카드 아래 끝에서 가장 높은 그림 위 끝까지). 레벨 페이지 카드가 아래에 floorRoom 만큼 더 비워 주면 시안 그대로 선다(hwFloor.js)
export const meta = { key: "hw_witch", label: "마녀의 밤", grid: "dot", tint: "#ffe9a0", gridOp: 0.07, floor: 76 };

const rp = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
// 같은 색 가로 이웃 칸은 사각형 하나로 합친다(그림은 같고 문자열만 짧게)
function runsOf(cells, P) {
  const rows = new Map();
  for (const [x, y] of cells) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  let d = "";
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += rp(xs[i] * P, y * P, (j - i + 1) * P, P); i = j + 1; }
  }
  return d;
}

// ── 칸 그림판 — 칸마다 색 하나. 뒤에 찍은 물체의 외곽선이 앞서 찍은 물체 위를 덮는다(앞뒤가 또렷하게) ──
class Board {
  constructor(clip = null) { this.m = new Map(); this.clip = clip; } // clip: [x0, y0, x1, y1] 칸(포함) 밖은 버린다
  set(x, y, c) {
    const k = this.clip;
    if (k && (x < k[0] || y < k[1] || x > k[2] || y > k[3])) return;
    this.m.set(x + "," + y, c);
  }
  // rows: 문자 지도 · pal: 글자 → 색 · ramp: '#' 을 칠할 4단(밝음 → 그늘), 숫자 1~4 는 ramp 를 직접 · line: 외곽선 색
  stamp(rows, ox, oy, { pal = {}, ramp, line, r = 1, k = 1.2, base = 0.62, vy = 0.15, vx = 0.15, flip = false } = {}) {
    const H = rows.length, W = Math.max(...rows.map((s) => s.length));
    const cells = [];
    rows.forEach((row, y) => [...row].forEach((ch, x0) => { if (ch !== "." && ch !== " ") cells.push([flip ? W - 1 - x0 : x0, y, ch]); }));
    const mask = new Set(cells.map(([x, y]) => x + "," + y));
    const inM = (x, y) => mask.has(x + "," + y);
    const n = (2 * r + 1) ** 2;
    const B = (x, y) => { let s = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inM(x + dx, y + dy)) s++; return s / n; };
    const lx = -0.55, ly = -0.83;
    const tone = new Map();
    for (const [x, y, ch] of cells) {
      if (ch !== "#") continue;
      const gx = B(x + 1, y) - B(x - 1, y), gy = B(x, y + 1) - B(x, y - 1);
      const v = base + k * (-gx * lx - gy * ly) + vy * (0.5 - y / H) + vx * (0.5 - x / W);
      tone.set(x + "," + y, v > 0.88 ? 0 : v > 0.5 ? 1 : v > 0.24 ? 2 : 3);
    }
    // 외톨이 칸 정리 — 같은 단 이웃이 없으면 이웃에서 가장 많은 단으로
    for (const [key, t] of [...tone]) {
      const [x, y] = key.split(",").map(Number);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tone.get(x + dx + "," + (y + dy))).filter((v) => v != null);
      if (nb.length && !nb.includes(t)) { const cnt = {}; nb.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1)); tone.set(key, Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0])); }
    }
    for (const [x, y, ch] of cells) {
      const c = ch === "#" ? ramp[tone.get(x + "," + y)] : /[1-4]/.test(ch) ? ramp[Number(ch) - 1] : pal[ch];
      if (c) this.set(ox + x, oy + y, c);
    }
    if (line) for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!inM(x + dx, y + dy)) this.set(ox + x + dx, oy + y + dy, line);
    return this;
  }
  path(P) { return runsOf([...this.m.keys()].map((key) => key.split(",").map(Number)), P); }
  svg(P, attr = "") {
    const by = {};
    for (const [key, c] of this.m) (by[c] ||= []).push(key.split(",").map(Number));
    return `<g shape-rendering="crispEdges"${attr}>${Object.entries(by).map(([c, cells]) => `<path d="${runsOf(cells, P)}" fill="${c}"/>`).join("")}</g>`;
  }
}

// ── 색 ──
const FRAME = { k: "#120a1c", D: "#26143c", M: "#3a2160", L: "#57358a" };
const BRASS = { ramp: ["#fff6c2", "#ffd95a", "#e3a63a", "#a8661f"], line: "#4a2a10" };
const MOON = { ramp: ["#fffbe8", "#fff1a8", "#f4d56a", "#d9a944"], line: "#7a5420" };
const WITCH = "#24123a";
const IRON = { ramp: ["#8c82ac", "#5c547c", "#403a5c", "#2b2642"], line: "#100c1a" };
const IRON_RIM = { ramp: ["#c2b8e0", "#8c82ac", "#5c547c", "#403a5c"], line: "#100c1a" };
const BREW = { ramp: ["#e6ffa4", "#acec5e", "#68c040", "#3e8e36"], line: "#18421e" };
const FIRE = { y: "#fff3a8", o: "#ffb84a", O: "#f07a2a", r: "#c8401e" };
const LOG = { ramp: ["#c08a5a", "#8a5a34", "#6a4226", "#4a2c18"], line: "#24140a" };
const POTION = {
  grape: { ramp: ["#f1ddff", "#c18cf4", "#9257d8", "#6a37ad"], line: "#30175c" },
  amber: { ramp: ["#fff0c0", "#ffb84a", "#f08a2a", "#c2601e"], line: "#5e2a10" },
  mint: { ramp: ["#e0fff2", "#82e8be", "#3fbf8f", "#2a8a68"], line: "#164a3a" },
  rose: { ramp: ["#ffe2ee", "#ff9cc4", "#e9649c", "#b8447a"], line: "#6a1c42" },
  sky: { ramp: ["#e6f4ff", "#9fd2ff", "#5f9ee8", "#4070c0"], line: "#1c2f66" },
};
const GLASS = { q: "#d9d2f0", Q: "#a99ccb", c: "#b07a48", C: "#7a4a28", g: "#ffffff", L: "#fff1cf", l: "#e6cfa0", m: "#ffd95a", s: "#8a5a34", S: "#5e3a20" };
const PUMP = { ramp: ["#ffc46e", "#ff9d3e", "#e9741f", "#b9521b"], line: "#5e2412" };
const BOOK = {
  red: { ramp: ["#ff8a7a", "#d8484a", "#a8303a", "#7a1f2c"], line: "#3a0c16" },
  teal: { ramp: ["#9ff0e0", "#3fb8a8", "#2a8a82", "#1c605e"], line: "#0c302e" },
};
const PAGE = { p: "#fff1d6", P: "#e2c9a0", b: "#ffd95a" };
const WAX = { ramp: ["#fffaf0", "#f4e6cf", "#d9c4a4", "#b39a7a"], line: "#5a4630" };
const FLAME = { y: "#fff3a8", o: "#ffb84a", O: "#f07a2a" };

// ── 그림 ──
// 마녀 실루엣(23 × 18) — 왼쪽으로 난다. 고깔모자(끝이 뒤로) · 넓은 챙 · 매부리코 · 휘날리는 망토 · 빗자루(뒤에 솔) · 앞으로 뻗은 장화
const WITCH_MAP = [
  "............##.........",
  "...........###.........",
  "..........###..........",
  "........#####..........",
  ".......######..........",
  "...##############......",
  ".......#####...........",
  ".....#######.###.......",
  "......######.#####.....",
  ".......#####..######...",
  "......######...#######.",
  "....########...........",
  "..##########.......####",
  "#######################",
  "......#######.....####.",
  ".....#######.....######",
  "....######........####.",
  "..#####................",
];
// 솥(30 × 14) — 배가 둥근 쇠솥
const POT = [
  "...########################...",
  "..##########################..",
  ".############################.",
  ".############################.",
  "##############################",
  "##############################",
  "##############################",
  "##############################",
  ".############################.",
  ".############################.",
  "..##########################..",
  "...########################...",
  "....######################....",
  "......##################......",
];
// 솥 테(32 × 3) — 두꺼운 입술
const RIM = [
  ".##############################.",
  "################################",
  ".##############################.",
];
// 솥 발(4 × 8) — 짧고 굵은 받침(위쪽은 솥 배에 가린다)
const FOOT = ["####", "####", "####", "####", "####", "####", "####", "####"];
// 끓는 물약(26 × 6) — 거품 혹이 두 장면으로 바뀐다
const BREW_A = [
  "........333.........22....",
  ".......32223....2..21122..",
  "....###21123###212##1222#.",
  "..######################..",
  ".########################.",
  "##########################",
];
const BREW_B = [
  "...............333........",
  "...22.........32223...2...",
  "..21122.####..31123##212..",
  "..######################..",
  ".########################.",
  "##########################",
];
// 솥 테를 넘어 흘러내린 물약(4 × 7) — 위는 물약과 이어진다
const DRIP = ["####", "####", ".###", ".###", ".###", ".##.", "..#."];
// 장작(20 × 3) · 불꽃(두 장면)
const LOGS = ["####################", "####################", ".##################."];
const FIRE_A = ["...o.....o......o...", "..ooo...ooO....ooo..", ".ooyoO.oyyoO..oyyoO.", "OoyyyoOoyyyoOOoyyyoO"];
const FIRE_B = ["....o.....o....o....", "...ooO...ooo..ooO...", "..oyyoO.oyyoOoyyoO..", "OoyyyoOoyyyoOoyyyoOO"];
// 둥근 물약병(11 × 13) — 코르크 · 목 · 반쯤 찬 둥근 몸
const FLASK = [
  "....cCc....",
  "....cCC....",
  "...qqqQQ...",
  "....qqQ....",
  "....qqQ....",
  "..qgqqqQQ..",
  ".qgqqqqqQQ.",
  "###########",
  "###########",
  "###########",
  "###########",
  ".#########.",
  "..#######..",
];
// 긴 물약병(9 × 17) — 라벨에 달 무늬
const BOTTLE = [
  "...cCc...",
  "...cCc...",
  "...qqQ...",
  "...qqQ...",
  "..qqqqQ..",
  ".qgqqqqQ.",
  "#########",
  "#########",
  "#LLLLLLl#",
  "#LLmmLLl#",
  "#LLmLLLl#",
  "#LLmmLLl#",
  "#lllllll#",
  "#########",
  "#########",
  "#########",
  ".#######.",
];
// 작은 병
const VIAL = [".cC.", ".qQ.", "qgqQ", "####", "####", "####", ".##."];
const VIAL2 = [".cC.", ".qQ.", "qgqQ", "####", "####", "####", "####", ".##."];
// 수정 구슬(7 × 8) — 받침 위 하늘빛 구슬
const ORB = ["..###..", ".#1###.", "#1####.", "#######", "#######", ".#####.", "sSSSSSS", "SSSSSSS"];
// 마법서(누운 책) — 표지 · 쪽 가장자리 · 금 책갈피
const BOOK_A = ["#################", "#ppppppppppppppP#", "#PPPPPPPPPPPPPPP#", "#################"];
const BOOK_B = ["#############", "#pppppppppbP#", "#############"];
// 초(4 × 5) + 불꽃(3 × 4)
const CANDLE = ["####", "####", "####", "####", "####"];
const FLAME_A = [".o.", "oyo", "oyo", ".O."];
const FLAME_B = ["..o", ".oy", "oyo", ".O."];
// 꼬마 호박(9 × 7)
const PUMPKIN = ["....C....", ".##C##.#.", "#########", "#########", "#########", "#########", ".#######."];

// 보름달 — 반지름 r 칸, 왼쪽 위 빛 공 음영 + 분화구(안쪽 왼쪽 위 그늘 · 오른쪽 아래 가장자리 빛)
function moon(r) {
  const n = 2 * r + 1;
  const L = [-0.42, -0.5, 0.76];
  const ln = Math.hypot(...L);
  const craters = [[0.42, 0.34, 0.2], [-0.5, 0.38, 0.15], [0.52, -0.3, 0.13], [-0.22, -0.6, 0.12], [0.05, 0.66, 0.11]];
  const rows = [];
  for (let y = 0; y < n; y++) {
    let s = "";
    for (let x = 0; x < n; x++) {
      const dx = (x - r) / r, dy = (y - r) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1 + 0.6 / r) { s += "."; continue; }
      const nz = Math.sqrt(Math.max(0, 1 - d2));
      const v = (dx * L[0] + dy * L[1] + nz * L[2]) / ln;
      let t = v > 0.975 ? 1 : v > 0.56 ? 2 : v > 0.3 ? 3 : 4;
      for (const [cx, cy, cr] of craters) {
        const ex = dx - cx, ey = dy - cy, e = Math.hypot(ex, ey);
        if (e < cr) t = Math.min(4, t + 1);
      }
      s += String(t);
    }
    rows.push(s);
  }
  return rows;
}
// 모서리쇠(8 × 8) — 마법서 모서리를 덮는 삼각 금속판 + 징 (왼쪽 위 기준, 나머지는 뒤집는다)
const CORNER = [
  "########",
  "#######.",
  "##1###..",
  "#####...",
  "####....",
  "###.....",
  "##......",
  "#.......",
];
const STUD = [".1.", "123", ".3."];

const flipX = (rows) => rows.map((s) => [...s].reverse().join(""));
const flipY = (rows) => [...rows].reverse();

export function deco(w, h, S, site, ctx = {}) {
  const P = site ? 2 : Math.max(2, Math.round(2 * S)); // 도트 한 칸(사이트 2px · 봇 4px)
  const o = site ? frameOut(site, ctx, 5 * P, P) : 20; // 폰 레벨 페이지는 테가 글자에 겹치지 않게 바깥으로(hwFloor.js)
  const cw = Math.floor(w / P), ch = Math.floor(h / P);
  const oc = Math.round(o / P);
  const band = 5;
  const iL = oc + band, iR = cw - oc - band - 1;
  const iT = oc + band, iB = ch - oc - band - 1;
  const inner = [iL, iT, iR, iB];
  const ground = iB;

  // ── 보름달 — 오른쪽 위 구석(이름 · 순위 배지 오른쪽 위 빈자리), 위 · 오른쪽 테 뒤로 살짝 들어간다 ──
  const mr = 15;
  // 📌 폰 레벨 페이지 카드(안쪽 여백 20px)는 이름 · 순위 칩이 위로 붙어 달 아래가 '상위 N%' 칩에 걸린다 → 달을 6칸 올려 위 테 뒤에서 떠오르게
  const tight = site && Number.isFinite(ctx?.lineX0) && ctx.lineX0 < 24;
  const mcx = iR - mr + 1, mcy = iT + mr - 3 - (tight ? 6 : 0);
  const sky = new Board(inner);
  // 봇은 달 · 마녀는 레벨업 · 역할 지급, 솥 · 병 · 책 · 촛불은 역할 지급 카드만(hwFloor.js)
  const roomy = site || botTopOpen(ctx), floorOk = site || botFloorOpen(ctx);
  if (roomy) sky.stamp(moon(mr), mcx - mr, mcy - mr, MOON);
  const moonClip = sky.path(P);
  // 마녀 — 달 한가운데(빗자루 끝 · 장화 · 솔이 달 안에 들어온다). 올린 달(tight)은 위가 테 뒤라 3칸 아래로(고깔모자가 보이게)
  const wb = new Board();
  if (roomy) wb.stamp(WITCH_MAP, mcx - 11, mcy - 9 + (tight ? 3 : 0), { ramp: [WITCH, WITCH, WITCH, WITCH] });

  // ── 액자 ──
  const fr = new Board();
  const LIT = [FRAME.k, FRAME.L, FRAME.M, FRAME.D, FRAME.k];
  const DIM = [FRAME.k, FRAME.D, FRAME.M, FRAME.L, FRAME.k];
  for (let x = oc; x < cw - oc; x++) for (let b = 0; b < band; b++) { fr.set(x, oc + b, LIT[b]); fr.set(x, ch - oc - 1 - b, DIM[b]); }
  for (let y = oc + band; y < ch - oc - band; y++) for (let b = 0; b < band; b++) { fr.set(oc + b, y, LIT[b]); fr.set(cw - oc - 1 - b, y, DIM[b]); }
  const top = new Board();
  // 금 징 — 테 가운데 줄, 22칸마다(모서리쇠 근처는 비움)
  const st = 22;
  for (let x = oc + 18; x < cw - oc - 16; x += st) { top.stamp(STUD, x, oc + 1, BRASS); top.stamp(STUD, x, ch - oc - 4, BRASS); }
  for (let y = oc + 18; y < ch - oc - 16; y += st) { top.stamp(STUD, oc + 1, y, BRASS); top.stamp(STUD, cw - oc - 4, y, BRASS); }
  top.stamp(CORNER, oc, oc, BRASS);
  top.stamp(flipX(CORNER), cw - oc - 8, oc, BRASS);
  top.stamp(flipY(CORNER), oc, ch - oc - 8, BRASS);
  top.stamp(flipY(flipX(CORNER)), cw - oc - 8, ch - oc - 8, BRASS);

  // ── 바닥 띠 ──
  //   📌 레벨 페이지 카드('1회 획득' 줄이 마지막) — 그 줄 숫자보다 위로 솟는 무리는 아래 테 뒤로 내려앉아 위만 빼꼼(hwFloor.js).
  //      판 묶음이 둘 — 테 앞(F) · 테 뒤(B). 무리(솥 한 벌 · 책 두 권 · 초와 불꽃 · 병 하나)마다 위 끝을 보고 고른다
  const limit = floorLimit(h, site, ctx);
  const kit = () => ({ floor: new Board(), brewA: new Board(), brewB: new Board(), flA: new Board(), flB: new Board(), pot: new Board() });
  const F = kit(), B = kit(), H = kit(); // H: 레벨 막대 위로 올린 솥 무리(onBar)
  const gy = (rows, lift = 0, g = ground) => g - rows.length + 1 - lift;
  // 무리 위 끝 top(칸, 외곽선 포함) → [판 묶음, 내릴 칸]. 조금(2칸 이하)만 솟으면 테 앞에서 그만큼 낮게, 더 솟으면 테 뒤로
  const lay = (top) => { const d = sinkBy(limit, top * P, P) / P; return [d > 2 ? B : F, d]; };
  const one = (rows, x, opt) => { const y = gy(rows); const [L, d] = lay(y - 1); L.floor.stamp(rows, x, y + d, opt); };
  // 솥 — 발 · 장작(바닥 판) → 물약(두 장면) → 솥 몸통 · 테 · 흘러내린 물약(pot 판) → 장작불(두 장면)
  //   g: 솥이 서는 칸(장작 · 발 아래 끝), at: [판 묶음, 내릴 칸]을 정해 주면 바닥 내려앉히기를 건너뛴다(막대 위)
  const potGroup = (px, g = ground, at = null) => {
    const potY = gy(POT, 5, g);
    const rimY = potY - 2;
    const [L, d] = at || lay(rimY - 6); // 끓는 물약 거품 끝
    L.floor.stamp(FOOT, px + 4, gy(FOOT, 0, g) + d, { ...IRON, r: 1 });
    L.floor.stamp(FOOT, px + 22, gy(FOOT, 0, g) + d, { ...IRON, r: 1 });
    L.floor.stamp(LOGS, px + 5, gy(LOGS, 0, g) + d, { ...LOG, r: 1 });
    L.flA.stamp(FIRE_A, px + 5, gy(LOGS, 0, g) - 4 + d, { pal: FIRE });
    L.flB.stamp(FIRE_B, px + 5, gy(LOGS, 0, g) - 4 + d, { pal: FIRE });
    L.brewA.stamp(BREW_A, px + 2, rimY - 5 + d, BREW);
    L.brewB.stamp(BREW_B, px + 2, rimY - 5 + d, BREW);
    // 솥 몸통은 따로 판에 — 물약(두 장면) 위에 얹히고, 장작불(두 장면)은 다시 그 앞에서 솥 바닥을 핥는다
    L.pot.stamp(POT, px, potY + d, { ...IRON, r: 2, k: 1.6, base: 0.52 });
    L.pot.stamp(RIM, px - 1, rimY + d, { ...IRON_RIM, r: 1, k: 1.1, base: 0.62 });
    L.pot.stamp(DRIP, px + 6, rimY - 1 + d, { ...BREW, base: 0.7 });
  };
  // 마법서 두 권(빨강 위에 청록) · 초 + 불꽃(두 장면)
  const books = (x, two) => {
    const y = gy(BOOK_A);
    const [L, d] = lay(two ? y - 4 : y - 1);
    L.floor.stamp(BOOK_A, x, y + d, { pal: PAGE, ...BOOK.red, r: 1 });
    if (two) L.floor.stamp(BOOK_B, x + 2, y - 3 + d, { pal: PAGE, ...BOOK.teal, r: 1 });
  };
  const candle = (x, anim) => {
    const y = gy(CANDLE);
    const [L, d] = lay(y - 5);
    L.floor.stamp(CANDLE, x, y + d, { ...WAX, r: 1 });
    L.flA.stamp(FLAME_A, x, y - 4 + d, { pal: FLAME });
    if (anim) L.flB.stamp(FLAME_B, x, y - 4 + d, { pal: FLAME });
  };
  // 📌 2026-10-11 방법 1 시안 — 레벨 막대가 있는 사이트 카드(ctx.barY)는 솥 무리(솥 · 장작불 · 마법서 · 둥근 물약병 · 촛불)를 막대 오른쪽 끝 위에 올린다(검은 고양이와 같은 자리).
  //    카드 맨 아래가 스탯 두 줄이라 바닥 구석의 솥이 '누적 음성 시간' 값을 덮었다. 막대 위 오른쪽(등급 줄 오른쪽)은 비어 있다.
  //    무리 아래 끝(장작 · 발 외곽선)을 막대 위 끝에 딱 붙이고(덮지 않음), 오른쪽 끝은 막대 끝에 맞춘다. 칸 크기는 그대로(2px)
  const barTop = site && Number.isFinite(ctx?.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const innerR = (iR + 1) * P; // 테 안쪽 오른쪽 가장자리(px)
  const heroR = Math.min(Number.isFinite(ctx?.lineX1) ? ctx.lineX1 : innerR, innerR - 3 * P); // 솥 테 외곽선 오른쪽 끝(px)
  const barG = barTop == null ? null : Math.floor(barTop / P) - 2; // 장작 · 발 외곽선(g + 1 칸) 아래 끝 = 막대 위 끝
  const barDy = barTop == null ? 0 : barTop - (barG + 2) * P; // 막대 위 끝이 칸 경계에 안 맞으면(홀수 px) 무리째 1px 내려 딱 붙인다
  const barPx = Math.floor(heroR / P) - 32; // 솥 테 외곽선 오른쪽(px + 31 칸)
  const moonBottom = roomy ? (mcy + mr + 1) * P : o;
  const onBar = floorOk && barTop != null && (barG - 26) * P > moonBottom + 4 * P && (barPx - 13) * P >= w * 0.45;
  const px = onBar ? barPx : iR - 30;
  if (onBar) {
    // 📌 2026-10-11 운영자 "레벨 바로 올린 건 좋아 근데 뭐 다 올리던지 애매하게 해두냐" — 솥만 올리고 바닥에 남겨 둔 소품도 막대 위 무리로 모은다.
    //    바닥 띠는 테 · 모서리쇠만 남는다. 무리(왼쪽 → 오른쪽): 촛불 · 마법서 두 권(솥 배 밑까지 바짝) 위에 둥근 물약병 · 솥 — 낮은 것에서 높은 것으로.
    //    긴 병 · 작은 병 두 개 · 수정 구슬 · 꼬마 호박은 뺐다(다 넣으면 막대를 따라 길게 늘어선다)
    //    등급 줄(왼쪽)과 막대 사이 틈은 24px — 책(18px) · 촛불(20px)은 그 밑에 들어가고, 키 큰 물약병을 얹은 책(46px) · 솥(56px)은
    //    가장 긴 등급 글자('그랜드마스터까지 N레벨' 끝 = 글자 시작 + 176)에서 4px 더 오른쪽일 때만(10/11 저녁 네 스킨 같은 틈 — 전엔 0px).
    //    좁은 카드(PC 332 · 폰 322 폭 밑)는 물약병을 뺀다
    // 📌 10/11 저녁 — 솥도 같은 규칙. 솥 테(68px)가 등급 글자 끝에 걸리는 아주 좁은 카드(PC 304 · 폰 294 폭 밑 — 1024px 화면 노트북 등)는
    //    솥을 빼고 촛불 · 책 · 물약병을 막대 끝으로 붙인다(전엔 솥이 가장 긴 등급 글자 끝 12px 를 덮었다)
    const g = barG;
    const tierR = (Number.isFinite(ctx.lineX0) ? ctx.lineX0 : (iL + 1) * P) + 180;
    const tierB = Number.isFinite(ctx.goalY) ? ctx.goalY + 40 : Infinity; // 등급 글자 아래 끝 + 2(등급 줄 40.5px 중 글자는 38 까지)
    const clear = (x0, top) => x0 * P >= tierR || top * P + barDy >= tierB; // 칸(외곽선 포함) 왼쪽 x0 · 위 top 이 등급 글자를 비키나
    const potOk = clear(px - 2, g - 26); // 솥 테 왼쪽 외곽선 · 끓는 물약 거품 위 외곽선
    if (potOk) potGroup(px, g, [H, 0]);
    const bx = potOk ? px - 18 : Math.floor(heroR / P) - 18, by = gy(BOOK_A, 0, g); // 빨강 책 — 오른쪽 외곽선이 솥 발 앞 2칸(솥이 없으면 무리 오른쪽 끝)
    if (clear(bx - 1, by - 4)) {
      H.floor.stamp(BOOK_A, bx, by, { pal: PAGE, ...BOOK.red, r: 1 });
      H.floor.stamp(BOOK_B, bx + 2, by - 3, { pal: PAGE, ...BOOK.teal, r: 1 });
      const fy = by - 4 - FLASK.length; // 물약병 바닥 외곽선 = 청록 책 위 외곽선
      if (clear(bx + 2, fy - 1)) H.floor.stamp(FLASK, bx + 3, fy, { pal: GLASS, ...POTION.grape, r: 2, k: 1.4 });
      const cx = bx - 6, cy = gy(CANDLE, 0, g); // 촛불 — 책 왼쪽 한 칸 띄워 막대 위
      if (cx - 1 > iL && clear(cx - 1, cy - 4)) {
        H.floor.stamp(CANDLE, cx, cy, { ...WAX, r: 1 });
        H.flA.stamp(FLAME_A, cx, cy - 4, { pal: FLAME });
        H.flB.stamp(FLAME_B, cx, cy - 4, { pal: FLAME });
      }
    }
  } else if (floorOk) potGroup(px);
  if (site && !onBar) {
    one(FLASK, px - 12, { pal: GLASS, ...POTION.grape, r: 2, k: 1.4 });
    // 스탯 두 열 사이 빈칸 — 긴 병 · 작은 병
    const midC = Math.round(w / 2 / P); // 카드 가운데 칸(360 폭에서 90 — 스탯 두 열 구분선)
    one(BOTTLE, midC - 16, { pal: GLASS, ...POTION.amber, r: 1 });
    one(VIAL2, midC - 6, { pal: GLASS, ...POTION.rose, r: 1 });
    // 시즌 글자 아래 — 작은 병 · 꼬마 호박
    one(VIAL, midC + 10, { pal: GLASS, ...POTION.mint, r: 1 });
    one(PUMPKIN, midC + 17, { pal: { C: "#3f7a2f" }, ...PUMP, r: 1 });
    // 왼쪽 — 마법서 두 권 · 촛불 · 수정 구슬
    books(iL + 2, true);
    candle(iL + 22, true);
    one(ORB, iL + 30, { pal: GLASS, ...POTION.sky, r: 1 });
  } else if (!site && floorOk) {
    one(FLASK, px - 12, { pal: GLASS, ...POTION.grape, r: 2, k: 1.4 });
    books(iL + 2, false);
    candle(iL + 22, false);
  }

  const clipId = `hw_witch-moon-${w}x${h}${site ? "s" : "b"}`; // 📌 달 자리는 카드 크기마다 달라 id 에 크기를 넣는다(크기가 다른 카드 둘이 한 화면이면 같은 id 의 먼저 나온 클립을 쓴다)
  const defs = (site
    ? `<pattern id="hw_witch-st" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M7 6h1v1h-1zM22 19h1v1h-1z" fill="#ffe9a0" fill-opacity="0.16"/></pattern>` +
      `<style>@keyframes hwwFly{0%{transform:translateX(${18 * P}px)}100%{transform:translateX(${-18 * P}px)}}` +
      `.hw_witch-fly{animation:hwwFly 8s steps(36) infinite}` +
      `@keyframes hwwA{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes hwwB{0%,49.9%{opacity:0}50%,100%{opacity:1}}` +
      `.hw_witch-a{animation:hwwA 1.2s infinite}.hw_witch-b{animation:hwwB 1.2s infinite}` +
      `@media (prefers-reduced-motion:reduce){.hw_witch-fly,.hw_witch-a,.hw_witch-b{animation:none}}</style>`
    : "") + `<clipPath id="${clipId}"><path d="${moonClip}"/></clipPath>`;
  const under = site && !ctx.onScene ? `<rect width="${w}" height="${h}" fill="url(#hw_witch-st)"/>` : "";
  // 두 번째 장면은 처음엔 숨겨 둔다 — 움직임이 꺼져 있거나 CSS 를 모르는 곳에서는 첫 장면만
  const anim2 = (a, b) => (site ? `<g class="hw_witch-a">${a.svg(P)}</g><g class="hw_witch-b" opacity="0">${b.svg(P)}</g>` : a.svg(P));
  const layers = (L) => (Object.values(L).some((b) => b.m.size) ? L.floor.svg(P) + anim2(L.brewA, L.brewB) + L.pot.svg(P) + anim2(L.flA, L.flB) : "");
  const sunkG = behind(meta.key, w, h, (ground + 1) * P, layers(B));
  const heroSvg = layers(H);
  const over =
    sky.svg(P) +
    `<g clip-path="url(#${clipId})"><g${site ? ` class="hw_witch-fly"` : ""}>${wb.svg(P)}</g></g>` +
    fr.svg(P) + top.svg(P) +
    sunkG.svg + layers(F) +
    (heroSvg ? (barDy ? `<g transform="translate(0 ${barDy})">${heroSvg}</g>` : heroSvg) : "");
  return { defs: defs + sunkG.defs, under, over };
}
