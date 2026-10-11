// 📌 할로윈 시즌 카드 스킨 「유령 파티」(hw_ghost) — 꼬마 유령들이 사탕 바구니를 두고 모인 카드. 2026-10-09 시안, 운영자 "카드 테두리는 진짜 다 예쁜데" → 10/10 5종 모두 합격.
//   그림 원본: .claude/mockups/src/halloween/skins/s1a.js (사이트 자리는 360 폭 카드 기준 → 스탯 두 열 사이 자리는 카드 가운데를 따라간다)
//   밤 보라 꼬마전구 액자(볼록 몰딩 테 가운데 박힌 십자 전구 — 주황 · 노랑 · 민트 · 분홍 차례) · 네 모서리 주황 박하사탕 판
//   + 오른쪽 아래 구석: 고깔모자 큰 유령 · 호박 사탕 바구니(사탕이 넘친다) · 바구니 옆 꼬마 유령
//   + 바닥 띠: 막대사탕 든 중간 유령(스탯 두 열 사이 빈칸) · 왼쪽 낮은 꼬마 유령 · 사탕 · 캔디콘
//   + 오른쪽 위 구석: 오른쪽 테 뒤에서 빼꼼 내다보는 작은 유령(몸 오른쪽은 테에 가린다)
//   레벨 막대가 있는 사이트 카드(레벨 페이지 · 상점 미리보기)는 바닥 띠 없이 막대 오른쪽 끝 위 무리 하나로(사탕 · 꼬마 유령 · 바구니 · 큰 유령 — 좁은 카드는 바구니 없이)
//   카드를 칠하거나 번지게 하지 않는다 — 도트 칸만. 사이트는 전구가 두 박자로 번갈아 켜진다(움직임 줄이기면 멈춰 모두 켜진 채)
import { floorLimit, sinkBy, behind, frameOut, botTopOpen, botFloorOpen } from "./hwFloor.js";

// floor: 사이트 카드 바닥 띠 그림 높이(px — 카드 아래 끝에서 가장 높은 그림 위 끝까지). 레벨 페이지 카드가 아래에 floorRoom 만큼 더 비워 주면 시안 그대로 선다(hwFloor.js)
export const meta = { key: "hw_ghost", label: "유령 파티", grid: "dot", tint: "#cfc4f0", gridOp: 0.08, floor: 92 };

const rp = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
// 같은 색 가로 이웃 칸은 사각형 하나로 합친다(그림은 같고 문자열만 짧게)
function runsOf(cells, P, ox = 0, oy = 0) {
  const rows = new Map();
  for (const [x, y] of cells) { if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  let d = "";
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += rp(ox + xs[i] * P, oy + y * P, (j - i + 1) * P, P); i = j + 1; }
  }
  return d;
}

// ── 칸 그림판 — 칸마다 색 하나. 앞에 찍은 물체 위에 뒤 물체의 외곽선이 덮인다(앞뒤가 또렷하게) ──
class Board {
  constructor() { this.m = new Map(); }
  k(x, y) { return x + "," + y; }
  set(x, y, c) { this.m.set(this.k(x, y), c); }
  get(x, y) { return this.m.get(this.k(x, y)); }
  // rows: 문자 지도 · pal: 글자 → 색 · ramp: '#' 을 칠할 4단(밝음 → 그늘), 숫자 1~4 는 ramp 를 직접 · line: 외곽선 색
  stamp(rows, ox, oy, { pal = {}, ramp, line, r = 1, k = 1.2, base = 0.62, vy = 0.15, vx = 0.15, flip = false, hideRight = null } = {}) {
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
      let v = base + k * (-gx * lx - gy * ly) + vy * (0.5 - y / H) + vx * (0.5 - x / W);
      tone.set(x + "," + y, v > 0.88 ? 0 : v > 0.5 ? 1 : v > 0.24 ? 2 : 3);
    }
    // 외톨이 칸 정리 — 같은 단 이웃이 없으면 이웃에서 가장 많은 단으로
    for (const [key, t] of [...tone]) {
      const [x, y] = key.split(",").map(Number);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tone.get(x + dx + "," + (y + dy))).filter((v) => v != null);
      if (nb.length && !nb.includes(t)) { const cnt = {}; nb.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1)); tone.set(key, Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0])); }
    }
    const put = (x, y, c) => { if (hideRight != null && ox + x >= hideRight) return; this.set(ox + x, oy + y, c); };
    for (const [x, y, ch] of cells) {
      const c = ch === "#" ? ramp[tone.get(x + "," + y)] : /[1-4]/.test(ch) ? ramp[Number(ch) - 1] : pal[ch];
      if (c) put(x, y, c);
    }
    if (line) for (const [x, y] of cells) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!inM(x + dx, y + dy)) put(x + dx, y + dy, line);
    return this;
  }
  svg(P, ox = 0, oy = 0, attr = "") {
    const by = {};
    for (const [key, c] of this.m) (by[c] ||= []).push(key.split(",").map(Number));
    return `<g shape-rendering="crispEdges"${attr}>${Object.entries(by).map(([c, cells]) => `<path d="${runsOf(cells, P, ox, oy)}" fill="${c}"/>`).join("")}</g>`;
  }
}

// ── 색 ──
const GHOST = { ramp: ["#ffffff", "#f1ecff", "#d3c8f2", "#a797d8"], line: "#5a4994" };
const FACE = { E: "#2b1d3f", g: "#ffffff", p: "#ff9cbc", T: "#ff6f8f" };
const PUMP = { ramp: ["#ffc46e", "#ff9d3e", "#e9741f", "#b9521b"], line: "#6b2914" };
const PUMP_PAL = { f: "#4a1b2c", r: "#3b1424", R: "#6b2914", y: "#ffd94a" };
const CANDY = {
  pink: { ramp: ["#ffe1ec", "#ff9cc4", "#ef6a9f", "#c24479"], line: "#7c2350" },
  mint: { ramp: ["#e3fff2", "#86e6b8", "#46b989", "#2c8a64"], line: "#1c5a42" },
  lemon: { ramp: ["#fff8c8", "#ffdc52", "#efb12c", "#c8831c"], line: "#7a4a10" },
  grape: { ramp: ["#efdcff", "#bb8cf0", "#8f5fd0", "#6a3fab"], line: "#3b2170" },
};
const CORN = { pal: { W: "#fff8ec", w: "#f0dcc4", o: "#ff9a3c", O: "#dc6e1e", y: "#ffd94a", Y: "#e3a92a" }, line: "#83431a" };
const HAT = { pal: { o: "#ff9d3e", O: "#d8661e", m: "#86e6b8", M: "#46b989", y: "#ffe066", Y: "#e0a92a", w: "#fff8c8" }, line: "#6b2f14" };
const FRAME = { k: "#1d1030", L: "#8a62c2", M: "#6a40a0", D: "#4a2a74" };
const BULB = [["#ffb24a", "#ffe2a8", "#8a4a1c"], ["#ffe066", "#fff6c4", "#8a6a1c"], ["#7fe6b4", "#d6fff0", "#2c6a50"], ["#ff8fbd", "#ffd6e6", "#7c2350"]];

// ── 그림 ──
// 큰 유령(24 × 24) — 두 팔을 벌린 파티 유령
const GHOST_BIG = [
  ".........######.........",
  ".......##########.......",
  "......############......",
  ".....##############.....",
  "....################....",
  "....################....",
  "...##################...",
  "...##################...",
  "...#####gE####gE#####...",
  "...#####EE####EE#####...",
  "...#####EE####EE#####...",
  "...###pp##EEEE##pp###...",
  ".#########ETTE#########.",
  "###########TT###########",
  "########################",
  ".######################.",
  "..####################..",
  "..####################..",
  "..####################..",
  "..####################..",
  "..####################..",
  "..####################..",
  "..####################..",
  "..###..####..####..###..",
];
// 중간 유령(16 × 18)
const GHOST_MID = [
  "......####......",
  "....########....",
  "...##########...",
  "..############..",
  "..############..",
  ".##############.",
  ".###gE####gE###.",
  ".###EE####EE###.",
  ".##pp##EE##pp##.",
  "################",
  "################",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".##############.",
  ".###..####..###.",
];
// 꼬마 유령(12 × 8) — 바닥 띠 낮은 자리용
const GHOST_SMALL = [
  "....####....",
  "..########..",
  ".##gE##gE##.",
  "###EE##EE###",
  "##pp#EE#pp##",
  ".##########.",
  ".##########.",
  ".###.##.###.",
];
// 빼꼼 유령(13 × 15) — 왼쪽을 본다(오른쪽 4칸은 테 뒤)
const GHOST_PEEK = [
  ".....####....",
  "...########..",
  "..##########.",
  ".###########.",
  ".###########.",
  "##gE##gE#####",
  "##EE##EE#####",
  "##EE##EE#####",
  "#pp#EE#pp####",
  "#############",
  "#############",
  "#############",
  "#############",
  "#############",
  ".###..####..#",
];
// 손(4 × 4) — 테를 잡거나 막대사탕을 쥔다
const HAND = [".##.", "####", "####", ".##."];
// 사탕 알(5 × 5) — 바구니 위 수북한 더미
const BALL = [".122.", "12223", "22233", "22334", ".334."];
// 고깔모자(9 × 10) — 주황 · 민트 줄무늬, 노란 방울
const PARTY_HAT = [
  "...yyw...",
  "...yYY...",
  "....o....",
  "...ooO...",
  "...mmM...",
  "..mmmMM..",
  "..oooOO..",
  ".ooooOOO.",
  ".mmmmmMM.",
  "mmmmmmMMM",
];
// 호박 사탕 바구니(18 × 13) — 웃는 눈(^ ^) · 이 하나 웃는 입, 위는 열린 입구
const BUCKET = [
  "....RRRRRRRRRR....",
  "..##rrrrrrrrrr##..",
  ".################.",
  "##################",
  "####ff######ff####",
  "###f##f####f##f###",
  "##################",
  "###f##########f###",
  "####ffffffffff####",
  "######ffffff######",
  ".################.",
  "..##############..",
  "....##########....",
];
// 사탕(11 × 5) — 가운데 동그란 알 + 양쪽 비틀린 포장
const WRAP = [
  "2...122...4",
  "23.12223.34",
  "23312223334",
  "23.22334.34",
  "3...334...4",
];
// 캔디콘(5 × 6)
const CORN_MAP = ["..W..", ".WWw.", ".ooO.", "ooooO", "yyyyY", ".yyY."];
// 막대사탕(7 × 7 알 + 막대) — 동심 고리
const LOLLY = [
  "..222..",
  ".21113.",
  "21w2w13",
  "21232w3",
  "2w2223 ",
  ".3ww33.",
  "..333..",
];

// 박하사탕 판(9 × 9) — 주황 · 흰 바람개비 8조각
function mint9() {
  const rows = [];
  for (let y = 0; y < 9; y++) {
    let s = "";
    for (let x = 0; x < 9; x++) {
      const dx = x - 4, dy = y - 4, d = Math.hypot(dx, dy);
      if (d > 4.4) { s += "."; continue; }
      if (dx === 0 && dy === 0) { s += "w"; continue; }
      const a = Math.atan2(dy, dx) + Math.PI;
      const orange = Math.floor(a / (Math.PI / 4) + 0.5) % 2 === 0;
      const shade = dx + dy > 2; // 오른쪽 아래 그늘
      s += orange ? (shade ? "O" : "o") : (shade ? "W" : "w");
    }
    rows.push(s);
  }
  return rows;
}
const MINT_PAL = { o: "#ff9d3e", O: "#d8661e", w: "#fff8ec", W: "#e6d2c0" };

export function deco(w, h, S, site, ctx = {}) {
  const P = site ? 2 : Math.max(2, Math.round(2 * S)); // 도트 한 칸(사이트 2px · 봇 4px)
  const o = site ? frameOut(site, ctx, 5 * P, P) : 20; // 폰 레벨 페이지는 테가 글자에 겹치지 않게 바깥으로(hwFloor.js)
  const cw = Math.floor(w / P), ch = Math.floor(h / P);
  const oc = Math.round(o / P); // 테 바깥 칸
  const band = 5; // 테 두께(칸) — 잉크 · 빛 · 가운데 · 그늘 · 잉크(볼록한 몰딩: 위 · 왼쪽 테는 바깥이 밝고, 아래 · 오른쪽 테는 안쪽이 밝다)
  const iL = oc + band, iR = cw - oc - band - 1; // 테 안쪽 첫 칸 · 끝 칸
  const iT = oc + band, iB = ch - oc - band - 1;
  const ground = iB; // 바닥 띠 물체가 서는 마지막 칸(외곽선은 테 안쪽 잉크 줄에 겹친다)

  // ── 찍는 순서: 빼꼼 유령(테 뒤) → 테 → 전구 → 손 · 박하사탕 → 바닥 띠 ──
  const back = new Board();
  const peekY = iT + (site ? 7 : 10);
  // 봇은 빼꼼 유령은 레벨업 · 역할 지급, 바닥 무리는 역할 지급 카드만(hwFloor.js)
  if (site || botTopOpen(ctx)) back.stamp(GHOST_PEEK, iR - 8, peekY, { pal: FACE, ...GHOST, r: 2, k: 1.5, hideRight: iR + 1 });

  const fr = new Board();
  const LIT = [FRAME.k, FRAME.L, FRAME.M, FRAME.D, FRAME.k];
  const DIM = [FRAME.k, FRAME.D, FRAME.M, FRAME.L, FRAME.k];
  for (let x = oc; x < cw - oc; x++) for (let b = 0; b < band; b++) {
    fr.set(x, oc + b, LIT[b]);
    fr.set(x, ch - oc - 1 - b, DIM[b]);
  }
  for (let y = oc + band; y < ch - oc - band; y++) for (let b = 0; b < band; b++) {
    fr.set(oc + b, y, LIT[b]);
    fr.set(cw - oc - 1 - b, y, DIM[b]);
  }
  // 꼬마전구(십자 3 × 3) — 테 가운데, 14칸마다. 두 무리(A · B)가 번갈아 켜진다
  const bulbs = [new Board(), new Board()];
  const dim = new Board();
  let bi = 0;
  const bulb = (x, y) => {
    const [c, hi, off] = BULB[bi % 4];
    const grp = bulbs[bi % 2];
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) { // 둥근 알(십자 5칸) — 위 · 왼쪽 칸이 빛
      grp.set(x + dx, y + dy, (dx === 1 && dy === 0) || (dx === 0 && dy === 1) ? hi : c);
      dim.set(x + dx, y + dy, off);
    }
    bi++;
  };
  const stepB = 14, b1 = oc + 1;
  for (let x = oc + 12; x < cw - oc - 13; x += stepB) bulb(x, b1);
  for (let y = oc + 12; y < ch - oc - 13; y += stepB) bulb(cw - oc - 4, y);
  for (let x = cw - oc - 15; x > oc + 10; x -= stepB) bulb(x, ch - oc - 4);
  for (let y = ch - oc - 15; y > oc + 10; y -= stepB) bulb(b1, y);

  // 모서리 박하사탕 판
  const top = new Board();
  const m9 = mint9();
  const mc = oc + 2 - 4; // 판 가운데 = 테 가운데 줄
  for (const [x, y] of [[mc, mc], [cw - mc - 9, mc], [mc, ch - mc - 9], [cw - mc - 9, ch - mc - 9]]) top.stamp(m9, x, y, { pal: MINT_PAL, line: "#6b2914" });


  // ── 바닥 띠 ──
  //   📌 레벨 페이지 카드('1회 획득' 줄이 마지막) — 그 줄 숫자보다 위로 솟는 무리는 아래 테 뒤로 내려앉아 위만 빼꼼(hwFloor.js).
  //      그림은 무리(같이 움직이는 물체 묶음)마다 따로 판에 찍고 → 차례대로 바닥 판(floor) 또는 테 뒤 판(sunk)에 옮긴다(겹침 순서는 그대로)
  const limit = floorLimit(h, site, ctx);
  const floor = new Board(), sunk = new Board();
  const groups = [];
  let open = null;
  const F = { stamp: (rows, x, y, opt) => { const b = open || new Board(); b.stamp(rows, x, y, opt); if (!open) groups.push(b); } };
  const together = (fn) => { open = new Board(); const r = fn(); groups.push(open); open = null; return r; };
  const gy = (rows, lift = 0) => ground - rows.length + 1 - lift; // 바닥에 세우는 y
  const ghost = (rows, x, lift = 0, flip = false) => F.stamp(rows, x, gy(rows, lift), { pal: FACE, ...GHOST, r: rows.length > 12 ? 2 : 1, k: rows.length > 12 ? 1.5 : 1.2, flip });
  const heap = (bkX, bkY) => {
    // 바구니 입구에 수북한 사탕 알 — 바구니보다 먼저(바구니 테두리가 앞)
    F.stamp(CORN_MAP, bkX + 12, bkY - 5, CORN);
    F.stamp(BALL, bkX + 2, bkY - 2, CANDY.pink);
    F.stamp(BALL, bkX + 10, bkY - 2, CANDY.mint);
    F.stamp(BALL, bkX + 6, bkY - 3, CANDY.lemon);
  };
  // base: 무리가 서는 마지막 칸(바구니 아래 줄 — 외곽선은 한 칸 아래) · bgX: 큰 유령 왼쪽 칸 · bucket: 호박 바구니(+ 사탕 더미)까지
  const corner = (base = ground, bgX = iR - 24, bucket = true) => {
    // 오른쪽 아래 구석 — 큰 유령(뒤) · 고깔모자 · 호박 바구니(앞)
    const at = (rows, lift = 0) => base - rows.length + 1 - lift;
    F.stamp(GHOST_BIG, bgX, at(GHOST_BIG, 1), { pal: FACE, ...GHOST, r: 2, k: 1.5 });
    F.stamp(PARTY_HAT, bgX + 11, at(GHOST_BIG, 1) - 9, HAT);
    const bkX = bgX - 12, bkY = at(BUCKET);
    if (!bucket) return bkX;
    heap(bkX, bkY);
    F.stamp(BUCKET, bkX, bkY, { pal: PUMP_PAL, ...PUMP, r: 2, k: 1.4 });
    return bkX;
  };
  const cornerGroup = (base, bgX) => together(() => corner(base, bgX));
  // 📌 방법 1 시안(2026-10-11) — 레벨 막대가 있는 사이트 카드(ctx.barY: 레벨 페이지 · 상점 미리보기)는 큰 무리(큰 유령 · 고깔모자 · 호박 바구니)를
  //    레벨 막대 오른쪽 끝 위에 세운다(검은 고양이와 같은 자리). 카드 맨 아래가 스탯 두 줄이라 바닥 구석에 두면 '누적 음성 시간' 값에 겹쳤다.
  //    무리 아래 끝(바구니 외곽선) = 막대 위 끝, 오른쪽은 테 안쪽에서 5칸(10px) 띄움. 테 뒤로 내려앉히지 않는다
  const barTop = site && Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const heroBase = barTop != null ? Math.floor(barTop / P) - 2 : null;
  const onBar = heroBase != null && heroBase - 34 > peekY + 17; // 고깔모자 외곽선 위 끝이 빼꼼 유령 아래
  let hero = null;
  if (site && onBar) {
    // 📌 2026-10-11 오후 — 바닥 띠 그림을 전부 막대 위 무리로(운영자 "레벨 바로 올린 건 좋아 근데 뭐 다 올리던지 애매하게 해두냐").
    //    큰 무리만 올리고 사탕 줄 · 꼬마 유령 둘 · 막대사탕 유령을 스탯 값 밑에 남겨 두니 반쯤 옮긴 것 같았다 → 아래 테 위는 테 · 모서리 박하사탕 판만.
    //    무리(왼쪽 → 오른쪽): 사탕 · 꼬마 유령(바구니 옆 — 상점 시안 구석 무리 그대로) · 호박 바구니 · 큰 유령 + 고깔모자.
    //    꼬마 유령 · 사탕은 등급 줄 아래 띠(…까지 N레벨 글자 아래 ~ 막대 위 끝, 24px)에 드는 키라 좁은 카드도 등급 글자를 안 덮는다. 막대사탕 유령은 키가 커 뺀다
    // 📌 10/11 저녁 네 스킨 맞춤 — 무리 오른쪽 끝(큰 유령 외곽선)을 막대 오른쪽 끝에(마녀의 밤 솥 · 호박 밭 · 달빛 묘지와 같은 자리.
    //    폰은 막대 끝이 테 안쪽 가장자리라 테에서 6px 안쪽). 전에는 막대 끝보다 4 ~ 5px 안쪽이라 무리만 왼쪽으로 쏠려 보였다
    const innerR = (iR + 1) * P; // 테 안쪽 오른쪽 가장자리(px)
    const rx = Math.floor(Math.min(Number.isFinite(ctx.lineX1) ? ctx.lineX1 : innerR, innerR - 3 * P) / P); // 무리 오른쪽 끝(칸 — 이 칸부터 비움)
    const bgX = rx - 25; // 큰 유령 왼쪽 칸(몸 24칸 + 오른쪽 외곽선 한 칸)
    //    키 큰 그림은 가장 긴 등급 글자('그랜드마스터까지 N레벨' 끝 = 글자 시작 + 176)에서 4px 더 오른쪽부터(달빛 묘지와 같은 틈).
    //    바구니(사탕 더미까지 36px — 등급 줄 높이에 닿는다)가 그보다 왼쪽에 걸리는 좁은 카드(PC 312 · 폰 302 폭 밑)는 바구니를 빼고
    //    꼬마 유령을 큰 유령 옆으로 붙인다(사탕 · 꼬마 유령 · 큰 유령 — 큰 유령은 PC 288 · 폰 280 폭까지 등급 글자를 비킨다)
    const tierR = (Number.isFinite(ctx.lineX0) ? ctx.lineX0 : (iL + 1) * P) + 180;
    const bucket = (bgX - 13) * P >= tierR; // 바구니 왼쪽 외곽선 칸 = bgX − 13
    together(() => {
      const at = (rows) => heroBase - rows.length + 1;
      const sgX = bucket ? bgX - 25 : bgX - 11; // 꼬마 유령 — 외곽선이 바구니(없으면 큰 유령 아랫몸) 외곽선과 한 줄
      F.stamp(GHOST_SMALL, sgX, at(GHOST_SMALL), { pal: FACE, ...GHOST, r: 1, k: 1.2, flip: true });
      F.stamp(WRAP, sgX - 13, at(WRAP), CANDY.grape); // 포도 사탕 — 꼬마 유령과 한 칸 띄워 막대 위에 눕힌다
      corner(heroBase, bgX, bucket);
    });
    hero = groups.pop();
  } else if (site) {
    const bkX = cornerGroup();
    // 꼬마 유령 — 바구니 옆(시즌 글자 오른쪽 아래 빈자리)
    ghost(GHOST_SMALL, bkX - 12, 0, true);
    // 중간 유령 + 막대사탕 — 스탯 두 열 사이 빈칸(왼쪽 글자 끝 ~ 오른쪽 열 시작)
    const midC = Math.round(w / 2 / P); // 카드 가운데 칸(360 폭에서 90 — 스탯 두 열 구분선)
    const mgX = midC - 20;
    together(() => {
      F.stamp(["#", "#", "#", "#", "#", "#", "#", "#"], mgX + 16, gy(GHOST_MID) - 1, { ramp: ["#fff6e6", "#f3dcb4", "#d9b98a", "#b8956a"], line: "#6b4a2a", r: 0, k: 0, base: 0.7, vy: 0, vx: 0 });
      F.stamp(LOLLY, mgX + 13, gy(GHOST_MID) - 8, { ...CANDY.grape, pal: { w: "#ffffff" } });
      ghost(GHOST_MID, mgX);
      F.stamp(HAND, mgX + 14, gy(GHOST_MID) + 5, { ...GHOST, r: 1 });
    });
    const candy = (rows, x, opt) => F.stamp(rows, x, gy(rows), opt);
    candy(CORN_MAP, mgX - 6, CORN);
    // 왼쪽 — 낮은 꼬마 유령 · 사탕(스탯 글자 아래 8칸 안)
    candy(WRAP, iL + 1, CANDY.mint);
    ghost(GHOST_SMALL, iL + 13);
    candy(WRAP, iL + 26, CANDY.pink);
    candy(CORN_MAP, iL + 38, CORN);
    candy(WRAP, iL + 45, CANDY.grape);
    // 오른쪽 열 아래(시즌 글자 아래) — 낮은 사탕 둘
    candy(WRAP, midC + 8, CANDY.lemon);
    candy(CORN_MAP, midC + 20, CORN);
  } else {
    // 봇 카드 — 오른쪽 아래 구석 무리 + 왼쪽 아래 꼬마 유령(레벨업 · 역할 지급만 — 다른 카드는 아래 구석에 레벨 · 순위 글자가 있다)
    if (botFloorOpen(ctx)) {
      cornerGroup();
      ghost(GHOST_SMALL, iL + 2);
      F.stamp(WRAP, iL + 15, gy(WRAP), CANDY.lemon);
    }
  }
  // 무리 → 판. 조금(2칸 이하)만 솟으면 테 앞에서 그만큼 낮게, 더 솟으면 테 뒤로(테 안쪽 가장자리에서 자른다)
  for (const g of groups) {
    let top = Infinity;
    for (const key of g.m.keys()) top = Math.min(top, +key.split(",")[1]);
    const d = sinkBy(limit, top * P, P) / P;
    const to = d > 2 ? sunk : floor;
    for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); to.set(x, y + d, c); }
  }
  if (hero) for (const [key, c] of hero.m) floor.m.set(key, c); // 막대 위 무리는 그대로(내려앉힘 없음)
  const sunkG = behind(meta.key, w, h, (ground + 1) * P, sunk.m.size ? sunk.svg(P) : "");

  // 사이트 바탕 — 아주 옅은 도트 십자 무늬 + 움직임(전구 두 박자 · 움직임 줄이기면 멈춘다)
  const defs = site
    ? `<pattern id="hw_ghost-dt" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M13 11h1v1h-1zM12 12h1v1h-1zM14 12h1v1h-1zM13 13h1v1h-1z" fill="#cfc4f0" fill-opacity="0.1"/></pattern>` +
      `<style>@keyframes hwgA{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes hwgB{0%,49.9%{opacity:0}50%,100%{opacity:1}}` +
      `.hw_ghost-a{animation:hwgA 1.6s infinite}.hw_ghost-b{animation:hwgB 1.6s infinite}` +
      `@media (prefers-reduced-motion:reduce){.hw_ghost-a,.hw_ghost-b{animation:none}}</style>`
    : "";
  const under = site ? `<rect width="${w}" height="${h}" fill="url(#hw_ghost-dt)"/>` : "";
  // 전구: 꺼진 판 위에 A · B 를 번갈아(움직임이 없거나 CSS 를 모르는 곳에서는 둘 다 켜진 채)
  const lights = site
    ? dim.svg(P) + bulbs[0].svg(P, 0, 0, ` class="hw_ghost-a"`) + bulbs[1].svg(P, 0, 0, ` class="hw_ghost-b"`)
    : bulbs[0].svg(P) + bulbs[1].svg(P);
  const over = back.svg(P) + fr.svg(P) + lights + top.svg(P) + sunkG.svg + floor.svg(P);
  return { defs: defs + sunkG.defs, under, over };
}
