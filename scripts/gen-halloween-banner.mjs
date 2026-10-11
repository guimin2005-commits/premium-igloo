// 📌 ARCTIC 「할로윈」 탭 배너 — public/banners/halloween-pc.png(2400×600 · 4:1) · halloween-mobile.png(1080×720 · 3:2)
//    + 나란히 미리보기 .claude/mockups/halloween-banner/preview.png
//    · 도트 그림(운영자 "그림은 도트로") — 칸 한 개 = 6px(시즌 2 배너와 같은 칸 크기), 칸 그림을 정수 배율 nearest 로만 키운다.
//      그라데이션 · 흐림 · 반투명 없음. 하늘 띠 경계만 바둑판 디더(시즌 배너와 같은 결)
//    · 자리는 시즌 상점 배너 그대로 — 왼쪽 글자(작은 영문 + 큰 한글) · 오른쪽 장면, 폰은 위 글자 · 아래 장면.
//      오른쪽 아래(배너 점) · 오른쪽 위(관리자 「배너 관리」)는 비워 둔다
//    · 그림 재료(새로 그리지 않고 가져온다)
//      - 할로윈 아이템 도트: lib/itemArt.js — 잭오랜턴 · 꼬마 유령 · 박쥐 · 마녀 모자 · 마녀의 솥 · 막대사탕 · 검은 고양이 · 해골 사탕 · 캔디콘
//      - 카드 스킨 「마녀의 밤」(lib/cardSkins/hw_witch.js): 보름달 음영 · 빗자루 탄 마녀 실루엣 · 꼬마 호박 / 「달빛 묘지」(hw_grave.js): 하트 묘비 · 달 앞 박쥐
//      - 시즌 배너 망토 펭귄(public/banners/season2-pass-pc.png 의 칸 그대로) — 왕관 대신 마녀 모자를 씌운다
//    · 글자는 아래 글자표(칸 지도)로만 찍는다 — 시스템 글꼴을 쓰지 않는다
//    실행: node scripts/gen-halloween-banner.mjs   (그림을 고치면 다시 돌려 PNG 를 커밋한다)
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { createRequire } from "module";
import { itemArtSvg } from "../lib/itemArt.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CELL = 6; // 칸 한 개(px)
const { Resvg } = createRequire(import.meta.url)("../bot/node_modules/@resvg/resvg-js");
const FONT = join(ROOT, "assets", "fonts", "Pretendard-Black.otf");
// 📌 글씨 꼴(2026-10-11 운영자 "할로윈 글씨 너무 못 썼는데") — A 호박불 · B 유령 흰 + 초록 물약 방울 · C 흰 글씨 + 주황 테. 환경 변수 TITLE 로 고른다
const TITLE = process.env.TITLE || "A"; // 10/11 운영자 A안(호박불 주황) 확정
// 📌 판매 기간 — 제목 아래 작은 줄(2026-10-11 운영자 "~ 11. 5. 이것도 넣어 상품 판매 기간임"). 기간이 바뀌면 이 값만 고치고 다시 돌린다
const SALE_LINE = "11. 5."; // 앞에 물결(~)을 도트로 붙인다 — 글꼴의 ~ 는 작게 찍으면 납작한 줄(-)이 된다
const DATE_BANDS = Object.assign([[1, "#fff1c2"]], { light: "#ffffff", under: "#e8c97a" });

// ───────────────────────── 칸 그림판 ─────────────────────────
// 물체 한 개 = 칸 → 색 지도. 외곽선은 4이웃(hw_grave 와 같은 방식)
function grid() {
  const m = new Map();
  const k = (x, y) => x + "," + y;
  const g = {
    m,
    set(x, y, c) { if (c) m.set(k(x, y), c); return g; },
    get(x, y) { return m.get(k(x, y)); },
    has(x, y) { return m.has(k(x, y)); },
    outline(c, { skip = () => false } = {}) {
      const add = [];
      for (const key of m.keys()) {
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(k(x + dx, y + dy)) && !skip(x + dx, y + dy)) add.push(k(x + dx, y + dy));
      }
      for (const a of add) m.set(a, c);
      return g;
    },
    box() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const key of m.keys()) { const [x, y] = key.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
    flip() { const b = g.box(); const n = grid(); for (const [key, c] of m) { const [x, y] = key.split(",").map(Number); n.set(b.x0 + b.x1 - x, y, c); } return n; },
  };
  return g;
}
// 글자 지도 → 그림판
function sprite(rows, pal, g = grid(), ox = 0, oy = 0) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) g.set(ox + x, oy + y, pal[ch]); }));
  return g;
}
// 아이템 도트(lib/itemArt.js) → 그림판 — SVG 의 rect 를 칸으로 되돌린다(아이콘 그림과 칸 하나까지 같다)
function art(key) {
  const svg = itemArtSvg(key, { size: 16 });
  if (!svg) throw new Error(`아이템 도트 없음: ${key}`);
  const g = grid();
  for (const [, x, y, w, h, c] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-fA-F]{3,8})"\/>/g))
    for (let j = 0; j < +h; j++) for (let i = 0; i < +w; i++) g.set(+x + i, +y + j, c);
  return g;
}

// 배너 한 장 — 칸 W × H. 뒤에 찍은 것이 앞
function canvas(W, H) {
  const px = new Array(W * H).fill(null);
  const cv = {
    W, H, px,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; },
    get(x, y) { return x >= 0 && y >= 0 && x < W && y < H ? px[y * W + x] : null; },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) cv.set(x + i, y + j, c); },
    // 그림판을 왼쪽 위 (x, y) 에
    at(g, x, y) { const b = g.box(); for (const [key, c] of g.m) { const [gx, gy] = key.split(",").map(Number); cv.set(x + gx - b.x0, y + gy - b.y0, c); } return { x, y, w: b.w, h: b.h }; },
    // 그림판을 아래 가운데 (cx, bottom) 에 — 바닥에 세우는 물건
    stand(g, cx, bottom) { const b = g.box(); return cv.at(g, Math.round(cx - b.w / 2), bottom - b.h + 1); },
    async png(scale, clear = false) {
      const buf = Buffer.alloc(W * H * 4);
      px.forEach((c, i) => {
        const v = parseInt((c || "#000000").slice(1), 16);
        buf[i * 4] = v >> 16; buf[i * 4 + 1] = (v >> 8) & 255; buf[i * 4 + 2] = v & 255; buf[i * 4 + 3] = clear && !c ? 0 : 255;
      });
      return sharp(buf, { raw: { width: W, height: H, channels: 4 } }).resize(W * scale, H * scale, { kernel: "nearest" }).png({ compressionLevel: 9 }).toBuffer();
    },
  };
  return cv;
}

// 바둑판 디더(4×4) — 띠 경계만 칸 단위로 섞는다
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
// 정해진 씨앗의 난수(돌릴 때마다 같은 그림)
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ───────────────────────── 색 ─────────────────────────
// 밤하늘 띠(위 → 아래) — 짙은 남보라에서 지평선 쪽 자줏빛으로
const SKY = ["#150d30", "#1c1240", "#25174f", "#311c5e", "#40226b", "#522875", "#682f7c", "#80367f"];
const HALO = ["#3d2a78", "#4f3790"]; // 달무리(바깥 · 안)
const STAR = { w: "#fff7d6", y: "#ffe9a0", l: "#b9a2f0" };
const HILL_FAR = "#3a2163"; // 먼 언덕(유령의 집)
const HILL_MID = "#27163f"; // 가운데 언덕(묘비 · 울타리 그림자)
const GROUND = "#180e2a"; // 앞 땅
const RIM = "#43296f"; // 앞 땅 위 끝 달빛
const GRASS = "#2b1b47";
const TREE = "#120a20";
const FRONT = "#0c0716"; // 맨 앞 풀숲
const PEBBLE = "#24163d"; // 흙 결
const SHADOW = "#0e0820";
const LIT = { y: "#ffd95a", o: "#ffae3c" }; // 유령의 집 불 켜진 창
const INK = "#1a0d2e"; // 글자 외곽
const INK_SH = "#0b0618"; // 글자 그림자
// hw_witch 「마녀의 밤」 — 달 · 마녀 · 꼬마 호박
const MOON = { ramp: ["#fffbe8", "#fff1a8", "#f4d56a", "#d9a944"], line: "#7a5420" };
const WITCH = "#24123a";
const PUMP = { ramp: ["#ffc46e", "#ff9d3e", "#e9741f", "#b9521b"], line: "#5e2412" };
// hw_grave 「달빛 묘지」 — 묘비 돌 · 박쥐 · 이끼(빛 → 외곽)
const ST = ["#ece8fa", "#c4bde0", "#9890c0", "#6e6698", "#2a2448"];
const BT = ["#a48ed0", "#7660a8", "#55418a", "#3b2b66", "#150b28"];
const GR = ["#c8f28c", "#88d45a", "#52a446", "#307238", "#12301a"];
const PK = ["#ffd08a", "#ffa64a", "#ff7f24", "#d4521a", "#6b200c"];
const BREW = ["#dcf48e", "#86d44a", "#2ea447"]; // 솥 거품(아이템 솥 물약과 같은 초록)

// ───────────────────────── 그림 ─────────────────────────
// 보름달 — hw_witch moon() 그대로(왼쪽 위 빛 공 음영 + 분화구). 숫자 1~4 = 밝음 → 그늘
function moonRows(r) {
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
      for (const [cx, cy, cr] of craters) if (Math.hypot(dx - cx, dy - cy) < cr) t = Math.min(4, t + 1);
      s += String(t);
    }
    rows.push(s);
  }
  return rows;
}
function moon(r) {
  const g = sprite(moonRows(r), { 1: MOON.ramp[0], 2: MOON.ramp[1], 3: MOON.ramp[2], 4: MOON.ramp[3] });
  return g;
}
// 마녀 실루엣(23 × 18) — hw_witch WITCH_MAP 그대로. 왼쪽으로 난다(고깔모자 · 매부리코 · 망토 · 빗자루)
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
// 꼬마 호박(9 × 7) — hw_witch PUMPKIN, 왼쪽 위 빛 음영 + 외곽선
const PUMPKIN = ["....C....", ".##C##.#.", "#########", "#########", "#########", "#########", ".#######."];
function shade(rows, { ramp, line, pal = {} }) {
  const g = grid();
  const H = rows.length, W = Math.max(...rows.map((s) => s.length));
  const inM = (x, y) => rows[y]?.[x] && rows[y][x] !== ".";
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    if (ch !== "#") { g.set(x, y, pal[ch]); return; }
    // 빛은 왼쪽 위 — 위 · 왼쪽이 비면 밝게, 아래 · 오른쪽이 비면 그늘, 가운데는 위치로
    const lit = !inM(x, y - 1) || !inM(x - 1, y), dark = !inM(x, y + 1) || !inM(x + 1, y);
    const v = 0.55 - (x / W) * 0.35 - (y / H) * 0.35 + (lit ? 0.3 : 0) - (dark ? 0.3 : 0);
    g.set(x, y, ramp[v > 0.5 ? 0 : v > 0.2 ? 1 : v > -0.05 ? 2 : 3]);
  }));
  return line ? g.outline(line) : g;
}
const pumpkinSmall = () => shade(PUMPKIN, { ...PUMP, pal: { C: "#3f7a2f" } });

// 달 앞 박쥐(13 × 5) — hw_grave BAT_S(날개 펼친 장면), 몸은 밝게 · 날개는 그늘 · 달빛 눈
const BAT_S = [
  "W....B.B....W",
  "WW...BBB...WW",
  ".WWWBeBeBWWW.",
  "..WWWBBBWWW..",
  "..WW.WWW.WW..",
];
function batSmall(flip = false) {
  const g = sprite(BAT_S, { W: BT[3], B: BT[2], e: MOON.ramp[1] });
  g.outline(BT[4]);
  return flip ? g.flip() : g;
}

// 하트 묘비 — hw_grave stone() (둥근 머리 · 받침돌 · 새긴 하트 · 이끼)
const tone = (nx, ny) => { const d = Math.hypot(nx + 0.45, ny + 0.45); return d < 0.34 ? 0 : d < 0.74 ? 1 : d < 1.3 ? 2 : 3; };
function stone(W, H) {
  const g = grid();
  const r = (W - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < r && Math.hypot(x - r, y - r) > r + 0.4) continue;
    const t = tone(((x + 0.5) / W) * 2 - 1, ((y + 0.5) / H) * 1.6 - 1);
    g.set(x, y, ST[x === W - 1 || (x >= W - 2 && y > r) ? 3 : Math.min(3, t)]);
  }
  for (let x = -1; x <= W; x++) { g.set(x, H, x < W * 0.3 ? ST[1] : ST[2]); g.set(x, H + 1, x > W * 0.7 ? ST[3] : ST[2]); }
  const my = Math.round(r * 0.75);
  const HEART = W >= 11 ? [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."] : ["XX.XX", "XXXXX", ".XXX.", "..X.."];
  const hx = Math.round(r) - (HEART[0].length - 1) / 2;
  HEART.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== "X") return;
    const below = HEART[j + 1]?.[i] === "X", rightOf = row[i + 1] === "X";
    if (!below || !rightOf) g.set(hx + i + (rightOf ? 0 : 1), my + j + (below ? 0 : 1), ST[0]);
  }));
  HEART.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "X") g.set(hx + i, my + j, j < 2 && i < 3 ? "#5a5288" : "#4a4272"); }));
  for (const [x, y] of [[0, H - 3], [0, H - 2], [1, H - 2], [0, H - 1], [1, H - 1], [2, H - 1], [-1, H], [0, H], [1, H], [2, H], [3, H]]) g.set(x, y, y >= H ? GR[2] : GR[1]);
  return g.outline(ST[4]);
}

// 망토 펭귄(18 × 18) — 시즌 배너 펭귄의 칸 그대로(반짝 눈 · 볼 · 빨간 망토 · 금 단추), 왕관 자리는 비워 마녀 모자를 씌운다
const PENGUIN = [
  ".....OOOOOOOO.....",
  "...OKKKKKKKKKKO...",
  "..OKKKKKKKKKKKKO..",
  ".OKGGKKKKKKKKKKKO.",
  ".OKGKKKKKKKKKKKKO.",
  ".OKKWWWWKKWWWWKKO.",
  ".OKWWWWWWWWWWWWKO.",
  ".OKWWWEWWWWWEWWKO.",
  ".OKWWEEWWWWEEWWKO.",
  ".OKWBWWWEEWWWBWKO.",
  "..OKWWWWWWWWWWKO..",
  ".ORRRRRRYYRRRRRRO.",
  "OTrRRRRWWWWRRRRrTO",
  "OTVrRWWWWWWWWRrVTO",
  "OOVrWWWWWWWWWWrVOO",
  "..OXWWWWWWWWWWXO..",
  "...OFFOOOOOOFFO...",
  "....OO......OO....",
];
const PENGUIN_PAL = {
  O: "#2a1840", K: "#2b2b3a", G: "#55566e", W: "#ffffff", E: "#131313", B: "#ff9fb5",
  R: "#e2263f", r: "#931a45", Y: "#fbbd2a", T: "#7e88a8", V: "#464a6e", X: "#d6d9e8", F: "#f2731f",
};
function witchPenguin() {
  const g = sprite(PENGUIN, PENGUIN_PAL, grid(), 0, 11);
  // 마녀 모자(아이템 도트 그대로) — 챙 아래 끝이 머리 윗줄에 걸리게
  const hat = art("witch-hat");
  for (const [key, c] of hat.m) { const [x, y] = key.split(",").map(Number); g.set(x + 1, y, c); }
  return g;
}

// 앙상한 나무 실루엣 — 굵은 줄기에서 갈라지는 가지(정해진 씨앗)
function deadTree(seed, h, lean = 1) {
  const R = rng(seed);
  const g = grid();
  const line = (x0, y0, x1, y1, t) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (let dy = -Math.floor((t - 1) / 2); dy <= Math.ceil((t - 1) / 2); dy++) for (let dx = -Math.floor((t - 1) / 2); dx <= Math.ceil((t - 1) / 2); dx++) g.set(Math.round(x + dx), Math.round(y + dy), TREE);
    }
  };
  // 가지 — 갈래마다 한 칸씩 가늘어지고(2칸 아래로는 안 내려감 · 끝 잔가지만 1칸), 두 갈래로만 나뉜다(잔가지 덤불이 되지 않게)
  const branch = (x, y, ang, len, t, depth) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    line(x, y, x1, y1, t);
    if (depth <= 0 || len < 4) return;
    for (const s of [-1, 1]) {
      const a = ang + s * (0.45 + R() * 0.3) + (R() - 0.5) * 0.2;
      branch(x1, y1, a, len * (0.62 + R() * 0.14), depth <= 1 ? 1 : Math.max(2, t - 1), depth - 1);
    }
  };
  // 줄기 — 아래가 넓은 뿌리
  for (let x = -5; x <= 5; x++) g.set(x, 0, TREE);
  for (let x = -4; x <= 3; x++) g.set(x, -1, TREE);
  for (let x = -3; x <= 3; x++) g.set(x, -2, TREE);
  line(0, 0, lean * 3, -h * 0.5, 5);
  branch(lean * 3, -h * 0.5, -Math.PI / 2 + lean * 0.3, h * 0.26, 4, 3);
  branch(lean * 2, -h * 0.4, -Math.PI / 2 + lean * 1.05, h * 0.3, 3, 3);
  branch(lean * 1, -h * 0.28, -Math.PI / 2 - lean * 0.95, h * 0.2, 3, 2);
  return g;
}

// 먼 언덕의 유령의 집(실루엣 · 불 켜진 창)
const HOUSE = [
  "........X.....................",
  "........X.....................",
  ".......XXX....................",
  "......XXXXX...................",
  ".....XXXXXXX..................",
  "....XXXXXXXXX.........X.......",
  "......XyyXX..........XXX......",
  "......XyyXX.........XXXXX.....",
  "......XXXXX........XXXXXXX....",
  "......XXXXX.......XXXXXXXXX...",
  "....XXXXXXXXXXXXXXXXXXXXXXXXX.",
  "...XXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "......XXXXXXXXXXXXXXXXXXXXXX..",
  "......XXyyXXXXXXyyXXXXXyyXXX..",
  "......XXyyXXXXXXyyXXXXXyyXXX..",
  "......XXXXXXXXXXXXXXXXXXXXXX..",
  "......XXXXXXXXXXXXXXXXXXXXXX..",
  "......XXyyXXXXXXooXXXXXyyXXX..",
  "......XXyyXXXXXXooXXXXXyyXXX..",
  "......XXXXXXXXXXooXXXXXXXXXX..",
];
const house = () => sprite(HOUSE, { X: HILL_FAR, y: LIT.y, o: LIT.o });

// 묘비 · 십자가 그림자(가운데 언덕 위)
const TOMB_SIL = ["..XX..", ".XXXX.", "XXXXXX", "XXXXXX", "XXXXXX"];
const CROSS_SIL = [".X.", "XXX", ".X.", ".X.", ".X."];

// 반짝 별(5칸 십자) · 큰 별(9칸)
const SPARK = ["..a..", "..a..", "aawaa", "..a..", "..a.."];
const SPARK_S = [".a.", "awa", ".a."];

// 깃발 줄(호박 주황 · 보라 · 초록 · 크림) — 삼각 깃발
const FLAG = ["HHHHH", "MMMMM", ".MMD.", ".MD..", "..D.."];
const FLAG_COLORS = [
  { H: PK[1], M: PK[2], D: PK[3] },
  { H: "#cf82f0", M: "#9447d8", D: "#5b2698" },
  { H: GR[0], M: GR[1], D: GR[2] },
  { H: "#fffbe8", M: "#fff1a8", D: "#eab84c" },
];

// 동글 사탕(4 × 3) — 캔디콘 옆에 쏟아진 사탕 무더기. 왼쪽 위 한 칸은 빛
const CANDY = [".h#.", "####", ".##."];
const CANDY_COLORS = [
  { h: "#ffd8d0", "#": "#ea508f" },
  { h: "#ffe48c", "#": "#f2731f" },
  { h: "#f7cbf3", "#": "#9447d8" },
  { h: "#dcf48e", "#": "#2ea447" },
];
function candyPile(cv, x, bottom, n) {
  // 아래 줄부터 쌓는다 — 아래 3알 · 위 2알 · 맨 위 1알
  const spots = [[0, 0], [4, 0], [8, 0], [2, -2], [6, -2], [4, -4]].slice(0, n);
  spots.forEach(([dx, dy], i) => { const g = sprite(CANDY, CANDY_COLORS[i % 4]); g.outline(INK); cv.at(g, x + dx, bottom - 3 + dy); });
}
// ───────────────────────── 글자표 ─────────────────────────
// 작은 영문(7줄 · 획 2칸)
const LATIN = {
  H: ["##..##", "##..##", "##..##", "######", "##..##", "##..##", "##..##"],
  A: [".####.", "##..##", "##..##", "######", "##..##", "##..##", "##..##"],
  L: ["##...", "##...", "##...", "##...", "##...", "#####", "#####"],
  O: [".####.", "##..##", "##..##", "##..##", "##..##", "##..##", ".####."],
  W: ["##...##", "##...##", "##.#.##", "#######", "#######", "###.###", "##...##"],
  E: ["#####", "##...", "##...", "####.", "##...", "##...", "#####"],
  N: ["##..##", "###.##", "######", "##.###", "##..##", "##..##", "##..##"],
};
// 큰 한글(27 × 32 · 세로 획 4칸 · 가로 획 3칸 · 획 사이 2칸 이상 — 외곽선이 그 틈을 메운다)
const HANGUL = {
  할: [
    ".....#######.......####....",
    ".....#######.......####....",
    "...................####....",
    "...................####....",
    "#################..####....",
    "#################..####....",
    "#################..########",
    "...................########",
    "...................########",
    "....#########......####....",
    "..#############....####....",
    ".###############...####....",
    ".#####.....#####...####....",
    ".#####.....#####...####....",
    ".###############...####....",
    "..#############....####....",
    "....#########..............",
    "...........................",
    "...........................",
    ".########################..",
    ".########################..",
    ".########################..",
    ".....................####..",
    ".....................####..",
    ".########################..",
    ".########################..",
    ".########################..",
    ".####......................",
    ".####......................",
    ".#########################.",
    ".#########################.",
    ".#########################.",
  ],
  로: [
    "...........................",
    "...........................",
    "...#####################...",
    "...#####################...",
    "...#####################...",
    "....................####...",
    "....................####...",
    "....................####...",
    "....................####...",
    "...#####################...",
    "...#####################...",
    "...#####################...",
    "...####....................",
    "...####....................",
    "...####....................",
    "...####....................",
    "...######################..",
    "...######################..",
    "...######################..",
    "...........................",
    "...........................",
    "...........####............",
    "...........####............",
    "...........####............",
    "...........####............",
    "...........####............",
    "...........####............",
    "...........####............",
    "...........####............",
    "###########################",
    "###########################",
    "###########################",
  ],
  윈: [
    ".....########.......####...",
    "...############.....####...",
    "..##############....####...",
    ".#####......#####...####...",
    ".####........####...####...",
    ".####........####...####...",
    ".####........####...####...",
    ".#####......#####...####...",
    "..##############....####...",
    "...############.....####...",
    ".....########.......####...",
    "....................####...",
    "....................####...",
    "##################..####...",
    "##################..####...",
    "##################..####...",
    ".......####.........####...",
    ".......####.........####...",
    ".......####.........####...",
    ".......####.........####...",
    "...........................",
    "...........................",
    "..####.....................",
    "..####.....................",
    "..####.....................",
    "..####.....................",
    "..####.....................",
    "..####.....................",
    "..####.....................",
    "..########################.",
    "..########################.",
    "..########################.",
  ],
};
// 글자 줄 → 칸 마스크(Set) · 폭
function textMask(str, table, gap) {
  const cells = new Set();
  let x = 0, h = 0;
  for (const ch of str) {
    if (ch === " ") { x += gap * 3; continue; }
    const rows = table[ch];
    if (!rows) throw new Error(`글자표에 없음: ${ch}`);
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, y) => [...row].forEach((c, i) => { if (c === "#") cells.add(x + i + "," + y); }));
    x += w + gap;
    h = Math.max(h, rows.length);
  }
  return { cells, w: x - gap, h };
}
// 글꼴 → 칸 마스크 — h = 잉크 높이(칸). 8배로 그린 뒤 잉크 상자를 h 칸으로 나눠 칸마다 덮인 비율 0.5 넘으면 칸
function fontMask(str, h, { track = 0, sx = 1 } = {}) {
  const SS = 8;
  const size = Math.round(h * 1.5 * SS);
  const W = Math.ceil((str.length * h * 1.5 + 24) * SS), H = Math.ceil(h * 2.6 * SS);
  const esc = str.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><g transform="scale(${sx},1)"><text x="${4 * SS}" y="${Math.round(h * 1.9 * SS)}" font-family="Pretendard" font-weight="900" font-size="${size}" letter-spacing="${track * SS * (size / (h * SS))}" fill="#000">${esc}</text></g></svg>`;
  const img = new Resvg(svg, { font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: "Pretendard" } }).render();
  const { width: iw, height: ih, pixels: P } = img;
  const on = (x, y) => P[(y * iw + x) * 4 + 3] > 127;
  let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) if (on(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const cp = (y1 - y0 + 1) / h;
  const w = Math.max(1, Math.round((x1 - x0 + 1) / cp));
  const cells = new Set();
  for (let cy = 0; cy < h; cy++) for (let cx = 0; cx < w; cx++) {
    const ax = Math.floor(x0 + cx * cp), bx = Math.min(iw, Math.floor(x0 + (cx + 1) * cp));
    const ay = Math.floor(y0 + cy * cp), by = Math.min(ih, Math.floor(y0 + (cy + 1) * cp));
    let n = 0, t = 0;
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) { t++; if (on(x, y)) n++; }
    if (t && n / t > 0.5) cells.add(cx + "," + cy);
  }
  return { cells, w, h };
}
// 글자 찍기 — 그림자(아래로 sh 칸) → 외곽선(o 칸 둘레) → 글자 띠 색(위 → 아래)
function drawText(cv, mask, x0, y0, { bands, o = 2, sh = 2, ink = INK, shade = INK_SH, ring2 = null }) {
  const has = (x, y) => mask.cells.has(x + "," + y);
  const ring = new Set();
  for (const key of mask.cells) {
    const [x, y] = key.split(",").map(Number);
    for (let dy = -o; dy <= o; dy++) for (let dx = -o; dx <= o; dx++) if (Math.abs(dx) + Math.abs(dy) <= o + (o > 1 ? 1 : 0)) ring.add(x + dx + "," + (y + dy));
  }
  for (const key of ring) { const [x, y] = key.split(",").map(Number); for (let s = 1; s <= sh; s++) cv.set(x0 + x, y0 + y + s, shade); }
  for (const key of ring) { const [x, y] = key.split(",").map(Number); cv.set(x0 + x, y0 + y, ink); }
  // 안쪽 테 한 칸(C — 흰 글씨 둘레 주황)
  if (ring2) for (const key of mask.cells) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (!has(x + dx, y + dy)) cv.set(x0 + x + dx, y0 + y + dy, ring2);
  }
  for (const key of mask.cells) {
    const [x, y] = key.split(",").map(Number);
    const t = y / mask.h;
    let c = bands[bands.length - 1][1];
    for (const [until, col] of bands) if (t < until) { c = col; break; }
    // 획 위 끝 한 줄은 빛 · 아래 끝 한 줄은 그늘(도톰한 획)
    if (!has(x, y - 1) && bands.light) c = bands.light;
    else if (!has(x, y + 1) && bands.under) c = bands.under;
    cv.set(x0 + x, y0 + y, c);
  }
}
const BIG_BANDS = Object.assign([[1, "#ffffff"]], { under: "#d9c8ff" });
const SMALL_BANDS = Object.assign([[0.5, "#ffc24a"], [1, "#ff8a24"]], { light: "#ffe48c" });

// ───────────────────────── 장면 ─────────────────────────
function sky(cv, R, { stops, avoid }) {
  const { W, H } = cv;
  // 띠 위치 — stops[i] 줄에서 SKY[i] 시작, 경계 아래 3줄을 디더로 섞는다
  for (let y = 0; y < H; y++) {
    let i = 0;
    while (i + 1 < stops.length && y >= stops[i + 1]) i++;
    for (let x = 0; x < W; x++) {
      let c = SKY[i];
      const next = stops[i + 1];
      if (next != null && y >= next - 3) { const f = (y - (next - 4)) / 4; if (f > dith(x, y)) c = SKY[i + 1]; }
      cv.set(x, y, c);
    }
  }
  // 별 — 글자 · 달 자리는 비운다
  const free = (x, y) => !avoid.some(([ax, ay, aw, ah]) => x >= ax && y >= ay && x < ax + aw && y < ay + ah);
  for (let n = 0; n < W * H * 0.004; n++) {
    const x = Math.floor(R() * W), y = Math.floor(R() * H * 0.62);
    if (!free(x, y)) continue;
    cv.set(x, y, R() < 0.5 ? STAR.l : STAR.w);
  }
}
function sparkles(cv, list) {
  for (const [x, y, big] of list) cv.at(sprite(big ? SPARK : SPARK_S, { a: STAR.y, w: "#ffffff" }), x, y);
}
function moonWithWitch(cv, cx, cy, r) {
  // 달무리 — 바깥 · 안 두 겹(경계는 디더)
  for (let y = cy - r - 8; y <= cy + r + 8; y++) for (let x = cx - r - 8; x <= cx + r + 8; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r + 3.5 || (d < r + 5 && dith(x, y) < 0.5)) cv.set(x, y, HALO[1]);
    else if (d < r + 7 || (d < r + 8.5 && dith(x, y) < 0.5)) cv.set(x, y, HALO[0]);
  }
  cv.at(moon(r), cx - r, cy - r);
  // 마녀 — 달 한가운데를 왼쪽으로(카드 스킨 「마녀의 밤」 그대로)
  cv.at(sprite(WITCH_MAP, { "#": WITCH }), cx - 11, cy - 9);
}
function garland(cv, x0, y0, x1, y1, sag) {
  const pts = [];
  const n = x1 - x0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = Math.round(y0 + (y1 - y0) * t + sag * 4 * t * (1 - t));
    pts.push([x0 + i, y]);
  }
  for (const [x, y] of pts) cv.set(x, y, "#8f78b8");
  let k = 0;
  for (let i = 4; i < pts.length - 4; i += 9) {
    const [x, y] = pts[i];
    const f = sprite(FLAG, FLAG_COLORS[k++ % FLAG_COLORS.length]);
    f.outline(INK);
    cv.at(f, x - 3, y);
  }
}
// 땅 — 먼 언덕 · 가운데 언덕 · 앞 땅(위 끝 달빛 한 줄 + 풀)
function ground(cv, R, { far, mid, fore }) {
  const { W, H } = cv;
  for (let x = 0; x < W; x++) { for (let y = Math.round(far(x)); y < H; y++) cv.set(x, y, HILL_FAR); }
  for (let x = 0; x < W; x++) { for (let y = Math.round(mid(x)); y < H; y++) cv.set(x, y, HILL_MID); }
  for (let x = 0; x < W; x++) {
    const top = Math.round(fore(x));
    for (let y = top; y < H; y++) cv.set(x, y, GROUND);
    cv.set(x, top, RIM);
    if (R() < 0.18) { cv.set(x, top - 1, GRASS); if (R() < 0.4) cv.set(x, top - 2, GRASS); }
    // 흙 결 — 드문드문 자갈 · 풀 점(넓은 어두운 띠가 비어 보이지 않게)
    for (let y = top + 2; y < H; y++) if (R() < 0.03) { cv.set(x, y, PEBBLE); if (R() < 0.3) cv.set(x + 1, y, PEBBLE); }
  }
}
// 호박 불빛 — 잭오랜턴 둘레 땅 칸만 따뜻하게(두 겹 · 경계 디더). 하늘 칸은 건드리지 않는다
const WARM = { [GROUND]: ["#3a1838", "#2a1232"], [RIM]: ["#b8583e", "#7a3a52"], [GRASS]: ["#5a2440", "#3e1a3c"], [PEBBLE]: ["#4a1f3e", "#341838"] };
function glow(cv, cx, cy, rx, ry) {
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
    const c = cv.get(x, y);
    if (!WARM[c]) continue;
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 0.55 || (d < 0.7 && dith(x, y) < 0.5)) cv.set(x, y, WARM[c][0]);
    else if (d < 0.9 || (d < 1 && dith(x, y) < 0.5)) cv.set(x, y, WARM[c][1]);
  }
}
// 맨 앞 풀숲 실루엣 — 아래 끝을 따라 뾰족한 풀(장면 앞에 한 겹 더 · 깊이)
function frontTufts(cv, R, ranges) {
  for (const [x0, x1, hmax] of ranges) for (let x = x0; x <= x1; x++) {
    const env = Math.sin(((x - x0) / (x1 - x0)) * Math.PI);
    const h = Math.round(env * hmax * (0.55 + R() * 0.45));
    for (let y = cv.H - 1; y >= cv.H - 1 - h; y--) cv.set(x, y, FRONT);
    if (R() < 0.25) cv.set(x, cv.H - 2 - h, FRONT);
  }
}
// 바닥 그림자(납작한 타원)
function shadow(cv, cx, y, w) {
  for (let x = Math.round(cx - w / 2); x <= Math.round(cx + w / 2); x++) cv.set(x, y, SHADOW);
  for (let x = Math.round(cx - w / 2) + 2; x <= Math.round(cx + w / 2) - 2; x++) cv.set(x, y + 1, SHADOW);
}
// 솥 거품 — 위로 떠오르는 초록 방울
function bubbles(cv, x, y) {
  const B = [[0, 0, 2], [4, -5, 1], [-2, -9, 1], [3, -12, 0]];
  for (const [dx, dy, s] of B) {
    if (s === 2) { cv.rect(x + dx, y + dy, 2, 2, BREW[1]); cv.set(x + dx, y + dy, BREW[0]); }
    else if (s === 1) { cv.set(x + dx, y + dy, BREW[1]); }
    else cv.set(x + dx, y + dy, BREW[0]);
  }
}

// ───────────────────────── 두 장 ─────────────────────────
const TITLE_STYLE = {
  // A 호박불 — 노랑 → 주황 → 짙은 주황, 위 끝 빛 · 아래 끝 그늘, 작은 영문은 연보라
  A: { big: Object.assign([[0.3, "#ffd65a"], [0.64, "#ffa733"], [1, "#ff7a1f"]], { light: "#fff1a8", under: "#d9561a" }), small: Object.assign([[1, "#d9c8ff"]], { light: "#ffffff" }) },
  // B 유령 흰 + 초록 물약 방울(글자 아래 끝에서 흘러내림), 작은 영문은 주황
  B: { big: BIG_BANDS, small: SMALL_BANDS, drip: true },
  // C 흰 글씨 + 주황 안쪽 테 + 보라 바깥 테, 작은 영문은 노랑
  C: { big: Object.assign([[1, "#ffffff"]], { under: "#e6dcff" }), small: Object.assign([[1, "#ffd65a"]], { light: "#fff1a8" }), ring2: "#ff8a24" },
};
const SLIME = ["#c9ff9e", "#8fe36a", "#4fa83a", "#2d6b22"];
// 물약 방울 — 글자 아래 끝 칸 중 몇 곳(칸 자리로 정해진 순서 — 매번 같다)에서 2 ~ 5칸 흘러내림, 끝은 둥근 방울
function drips(cv, mask, x0, y0) {
  const has = (x, y) => mask.cells.has(x + "," + y);
  // 두 칸 폭으로 끝이 같이 닿는 아래 끝(글자 획 바닥)만 — 왼쪽부터 6칸 넘게 띄워 몇 곳
  const bottoms = [...mask.cells].map((k) => k.split(",").map(Number)).filter(([x, y]) => !has(x, y + 1) && has(x + 1, y) && !has(x + 1, y + 1) && y > mask.h * 0.6).sort((a, b) => a[0] - b[0]);
  let last = -99, k = 0;
  for (const [x, y] of bottoms) {
    if (x - last < 7) continue;
    if ((k++ % 3) === 1) continue; // 세 곳 중 한 곳은 건너뛴다(고르게 늘어서지 않게)
    last = x;
    const len = 2 + ((x * 7 + y) % 3);
    for (let i = 1; i <= len; i++) { cv.set(x0 + x, y0 + y + i, SLIME[1]); cv.set(x0 + x + 1, y0 + y + i, SLIME[2]); }
    // 끝 방울 — 3칸 폭 · 2줄, 왼쪽 위 빛
    for (const dx of [-1, 0, 1, 2]) cv.set(x0 + x + dx, y0 + y + len + 1, dx === -1 || dx === 2 ? SLIME[3] : SLIME[2]);
    for (const dx of [0, 1]) cv.set(x0 + x + dx, y0 + y + len + 2, SLIME[3]);
    cv.set(x0 + x, y0 + y + len, SLIME[1]); cv.set(x0 + x, y0 + y + len + 1, SLIME[0]);
  }
}
// 📌 2026-10-11 운영자 "걍 한국어 박은 게 개 짜치게 생겻다" — 한국어 「할로윈」 은 빼고 영문 HALLOWEEN 한 줄(가로 0.82 로 눌러 좁게)
function titleEn(cv, x, y, h, dh) {
  const st = TITLE === "B" ? TITLE_STYLE.C : TITLE_STYLE.A;
  const big = fontMask("HALLOWEEN", h, { sx: 0.82, track: 0.4 });
  drawText(cv, big, x, y, { bands: st.big, o: 2, sh: 3, ring2: st.ring2 || null });
  // 판매 기간 — 제목 왼쪽 끝에 맞춰 아래(그림자 아래로 한 칸 더 띄움)
  if (SALE_LINE) {
    const d = fontMask(SALE_LINE, dh, { track: 0.6 });
    // 굵은 물결 — PC(8칸 글자) 8 × 4 · 폰 6 × 3, 글자 높이 가운데
    const TILDE = dh >= 8 ? [".##.....", "####...#", "#...####", ".....##."] : [".##...", "#.##.#", "...##."];
    const tw = TILDE[0].length, ty = Math.round((dh - TILDE.length) / 2);
    const cells = new Set();
    TILDE.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === "#") cells.add(xx + "," + (yy + ty)); }));
    const gap = dh >= 8 ? 3 : 2;
    for (const k of d.cells) { const [xx, yy] = k.split(",").map(Number); cells.add(xx + tw + gap + "," + yy); }
    drawText(cv, { cells, w: d.w + tw + gap, h: dh }, x + 1, y + h + 6, { bands: DATE_BANDS, o: 1, sh: 1 });
  }
  return big;
}
function titleBlock(cv, x, ySmall, yBig) {
  const st = TITLE_STYLE[TITLE] || TITLE_STYLE.A;
  const small = fontMask("HALLOWEEN", 8, { track: 1 });
  const big = fontMask("할로윈", 30);
  drawText(cv, small, x + 1, ySmall, { bands: st.small, o: 1, sh: 1 });
  drawText(cv, big, x, yBig, { bands: st.big, o: 2, sh: 3, ring2: st.ring2 || null });
  if (st.drip) drips(cv, big, x, yBig);
  return { small, big };
}
// 📌 고양이 — 리뉴얼 중인 사선 정면 고양이(2026-10-11 운영자 "고양이 리뉴얼 중이잖아" — 옛 배지 고양이 대신). 원본 = 검은 고양이 세션 scratchpad/cat/final34.json SMALL(28 × 23)
const CAT_PAL = { o: "#100d1c", d: "#191629", b: "#221f36", m: "#34304f", l: "#5a5488", k: "#f59ab8", K: "#d9688f", Y: "#ffe066", y: "#f7b733", e: "#9c5a12", w: "#ffffff", R: "#ff7a3d", r: "#c94a1d", G: "#ffd447", g: "#d18f1a" };
const NEW_CAT = [
  "...oo..........o............",
  "..ollo.......oolo...........",
  "..olbmooooooollbdo..........",
  "..olkbmllllllbbkddo.........",
  "..olkkbbbbbbbbkkKdo.........",
  "..olKkbbbbbbbbbkKdo.........",
  "..olbbbbbbbbbbbbbdo.........",
  ".olbbbbbbbbbbbbbbbbo........",
  ".olbbwYbbbbbbwYbbbdo........",
  ".olbYwYYbbbbYwYYbbdo........",
  "..omyyyybbbbyyyybddo........",
  "..olbeebkkbbbeebddo...oo....",
  "...ombbmbbmbbbbddo...oldo...",
  "....ombbbbbbbbbdo.....oldo..",
  ".....oRRRRRRRRRRRo....olbdo.",
  ".....olbGGddddbbddoo...oldo.",
  ".....olbggbbbbddllbbo..oldo.",
  "......ombbbbbollbbbbbo.oldo.",
  "......obbolmbolbbbbbbbolbdo.",
  ".....olmbolmbolbbbbbbbobdo..",
  ".....omdollmbolbbbbbbobddo..",
  "......ooomdmboddddddoddoo...",
  ".........oooo.ooooooooo.....",
];
// 묘비 옆 고양이 — 묘비를 고양이 오른쪽 뒤에 세우고, 고양이는 앞 땅에 앉는다(그림자 먼저)
function catByStone(cv, cx, gyf) {
  cv.stand(stone(11, 12), cx + 10, gyf(cx + 10) + 1);
  shadow(cv, cx, gyf(cx) + 1, 20);
  cv.stand(sprite(NEW_CAT, CAT_PAL), cx, gyf(cx) + 1);
}
const bump = (x, c, w, h) => h * Math.exp(-(((x - c) / w) ** 2));

function pc() {
  const W = 400, H = 100;
  const cv = canvas(W, H);
  const R = rng(1031);
  const TX = 42, TY = 30, TH = 22;
  const moonC = [302, 30], mr = 20;
  sky(cv, R, {
    stops: [0, 14, 27, 39, 50, 60, 70, 80],
    avoid: [[TX - 4, TY - 6, 166, TH + 24], [moonC[0] - mr - 9, moonC[1] - mr - 9, 2 * mr + 18, 2 * mr + 18]],
  });
  sparkles(cv, [[160, 8, true], [226, 28, false], [352, 10, true], [380, 38, false], [36, 6, false], [130, 14, false], [250, 50, false], [176, 46, false]]);
  garland(cv, 146, -1, 262, 1, 10);
  moonWithWitch(cv, moonC[0], moonC[1], mr);
  cv.at(batSmall(), 284, 14);
  cv.at(batSmall(true), 334, 46);
  cv.at(batSmall(), 214, 16);
  // 먼 언덕 · 유령의 집
  const far = (x) => 76 - bump(x, 374, 26, 6) - 2 * Math.sin(x / 23);
  cv.stand(house(), 376, Math.round(far(376)) + 1);
  const mid = (x) => 81 - 2 * Math.sin(x / 17 + 1) - bump(x, 120, 40, 3);
  // 앞 땅 — 사탕 둔덕(왼쪽) · 가운데 큰 둔덕(펭귄 · 호박 · 솥) · 묘비 둔덕(오른쪽)
  const fore = (x) => 89 - bump(x, 205, 22, 5) - bump(x, 288, 44, 10) - bump(x, 350, 16, 4);
  ground(cv, R, { far, mid, fore });
  for (const [x, cross] of [[150, false], [166, true], [178, false], [358, true], [394, false]]) cv.stand(sprite(cross ? CROSS_SIL : TOMB_SIL, { X: HILL_MID }), x, Math.round(mid(x)));
  const gy = (x) => Math.round(fore(x));
  glow(cv, 268, gy(268) + 2, 16, 4);
  // 왼쪽 앙상한 나무(글자 왼쪽 틀)
  cv.stand(deadTree(7, 72, 1), 16, gy(16));
  // 물건 — 뒤 → 앞
  cv.at(art("ghost"), 226, 38);
  cv.at(art("bat"), 244, 12);
  // 사탕 둔덕 — 막대사탕(꽂힘) · 쏟아진 사탕 · 해골 사탕 · 쏟아진 사탕
  cv.stand(art("lollipop"), 186, gy(186) + 1);
  candyPile(cv, 197, gy(203) + 1, 4);
  shadow(cv, 221, gy(221) + 1, 12); cv.stand(art("sugar-skull"), 221, gy(221));
  candyPile(cv, 229, gy(233) + 1, 6);
  // 가운데 둔덕 — 꼬마 호박 · 잭오랜턴 · 마녀 모자 펭귄 · 솥
  cv.stand(pumpkinSmall(), 252, gy(252));
  shadow(cv, 268, gy(268) + 1, 16); cv.stand(art("jack-o-lantern"), 268, gy(268));
  shadow(cv, 290, gy(290) + 1, 18); cv.stand(witchPenguin(), 290, gy(290));
  shadow(cv, 313, gy(313) + 1, 16); cv.stand(art("cauldron"), 313, gy(313));
  bubbles(cv, 314, gy(313) - 20);
  // 묘비 둔덕 — 묘비 위 고양이 · 발치 꼬마 호박
  cv.stand(pumpkinSmall(), 334, gy(334));
  catByStone(cv, 348, gy);
  frontTufts(cv, R, [[0, 64, 5], [150, 186, 3], [372, 399, 4]]);
  titleEn(cv, TX, TY, TH, 8);
  return cv;
}

function mobile() {
  const W = 180, H = 120;
  const cv = canvas(W, H);
  const R = rng(1031);
  const TX = 10, TY = 24, TH = 14;
  const moonC = [146, 30], mr = 18;
  sky(cv, R, {
    stops: [0, 16, 32, 46, 60, 72, 84, 96],
    avoid: [[TX - 4, TY - 6, 110, TH + 22], [moonC[0] - mr - 9, moonC[1] - mr - 9, 2 * mr + 18, 2 * mr + 18]],
  });
  sparkles(cv, [[110, 8, true], [8, 6, false], [116, 52, false], [174, 64, false], [98, 36, false]]);
  moonWithWitch(cv, moonC[0], moonC[1], mr);
  cv.at(batSmall(), 128, 12);
  cv.at(batSmall(true), 112, 44);
  const far = (x) => 96 - bump(x, 128, 20, 5) - 2 * Math.sin(x / 19);
  cv.stand(house(), 128, Math.round(far(128)) + 1);
  const mid = (x) => 101 - 2 * Math.sin(x / 15 + 2);
  const fore = (x) => 112 - bump(x, 84, 40, 7) - bump(x, 20, 16, 3) - bump(x, 152, 14, 3);
  ground(cv, R, { far, mid, fore });
  for (const [x, cross] of [[8, false], [20, true], [168, false]]) cv.stand(sprite(cross ? CROSS_SIL : TOMB_SIL, { X: HILL_MID }), x, Math.round(mid(x)));
  const gy = (x) => Math.round(fore(x));
  glow(cv, 60, gy(60) + 2, 15, 4);
  cv.at(art("ghost"), 146, 56);
  cv.stand(art("lollipop"), 10, gy(10) + 1);
  candyPile(cv, 22, gy(27) + 1, 3);
  cv.stand(pumpkinSmall(), 44, gy(44));
  shadow(cv, 60, gy(60) + 1, 16); cv.stand(art("jack-o-lantern"), 60, gy(60));
  shadow(cv, 83, gy(83) + 1, 18); cv.stand(witchPenguin(), 83, gy(83));
  shadow(cv, 106, gy(106) + 1, 16); cv.stand(art("cauldron"), 106, gy(106));
  bubbles(cv, 107, gy(106) - 20);
  shadow(cv, 127, gy(127) + 1, 12); cv.stand(art("sugar-skull"), 127, gy(127));
  candyPile(cv, 136, gy(140) + 1, 3);
  catByStone(cv, 154, gy);
  frontTufts(cv, R, [[0, 22, 3], [164, 179, 3]]);
  titleEn(cv, TX, TY, TH, 7);
  return cv;
}

// ───────────────────────── 세트 할인 · 디스코드 ─────────────────────────
// 📌 2026-10-11 운영자 "세트 상품 다 65% 할인 상품이거든? 그걸로 할로윈 배너 좀 더 만들어" · "디스코드 배너 있지? 거기에 들어갈만한 것도 하나".
const WHITE_BANDS = Object.assign([[1, "#ffffff"]], { under: "#e6dcff" });
// 글자 한 줄(글꼴 마스크 + 띠 색)
function line(cv, str, x, y, h, bands, { sx = 0.82, track = 0.4, o = 2, sh = 3 } = {}) {
  const m = fontMask(str, h, { sx, track });
  drawText(cv, m, x, y, { bands, o, sh });
  return m;
}
// 판매 기간 「~11. 5.」 — 물결은 도트(titleEn 과 같은 모양)
function saleDate(cv, x, y, dh) {
  const d = fontMask(SALE_LINE, dh, { track: 0.6 });
  const TILDE = dh >= 8 ? [".##.....", "####...#", "#...####", ".....##."] : [".##...", "#.##.#", "...##."];
  const tw = TILDE[0].length, ty = Math.round((dh - TILDE.length) / 2);
  const cells = new Set();
  TILDE.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === "#") cells.add(xx + "," + (yy + ty)); }));
  const gap = dh >= 8 ? 3 : 2;
  for (const k of d.cells) { const [xx, yy] = k.split(",").map(Number); cells.add(xx + tw + gap + "," + yy); }
  drawText(cv, { cells, w: d.w + tw + gap, h: dh }, x, y, { bands: DATE_BANDS, o: 1, sh: 1 });
}
// 세트 대표 여섯 — 잭오랜턴 · 검은 고양이 · 꼬마 유령 · 막대사탕 · 마녀 모자 · 해골 사탕(세트마다 하나)
const SET_HEROES = ["jack-o-lantern", "black-cat", "ghost", "lollipop", "witch-hat", "sugar-skull"];
function heroRow(cv, gy, xs) {
  SET_HEROES.forEach((k, i) => { const x = xs[i]; shadow(cv, x, gy(x) + 1, 14); cv.stand(art(k), x, gy(x)); });
}
// 📌 세트 할인 홍보 배너(2026-10-11 운영자 "최소 65% 이상 할인! 해서 상품 홍보하는 배너 · 기존 거랑 너무 비슷") — 밤 장면 대신 주황 판에 세트 여섯을 진열.
//    칸마다 그 세트 대표 그림 + 할인율 꼬리표(실제 할인율 — 바뀌면 SALE_SETS 만 고친다)
const SALE_SETS = [
  { art: "jack-o-lantern", pct: 68 }, { art: "black-cat", pct: 68 }, { art: "ghost", pct: 65 },
  { art: "lollipop", pct: 67 }, { art: "witch-hat", pct: 69 }, { art: "sugar-skull", pct: 66 },
];
const PROMO = { bg0: "#ff8a24", bg1: "#ff9f3a", bg2: "#ffb04e", edge: "#e2621a", deep: "#2a1640", tile: "#fff4e0", tileEdge: "#3a1f52", tag: "#e91e3f", tagHi: "#ff5c77" };
const PROMO_WHITE = Object.assign([[1, "#ffffff"]], { under: "#ffe1b8" });
const PROMO_YELLOW = Object.assign([[1, "#ffe066"]], { light: "#fff6c2", under: "#f2b13a" });
const PROMO_CREAM = Object.assign([[1, "#fff4e0"]], { under: "#ffd9a8" });
// 판 — 위에서 아래로 주황 세 띠(디더 경계) + 가장자리 짙은 주황 + 사선 줄무늬(아주 옅게)
function promoBg(cv) {
  const { W, H } = cv;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H;
    let c = t < 0.38 ? PROMO.bg2 : t < 0.72 ? PROMO.bg1 : PROMO.bg0;
    if (((x + y) % 14) < 2) c = t < 0.38 ? PROMO.bg1 : PROMO.bg0; // 사선 줄무늬
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) c = PROMO.edge;
    cv.set(x, y, c);
  }
}
// 박쥐 실루엣(짙은 보라) — 모서리 장식
const BAT_SIL = ["#.......#", "##.###.##", "#########", ".#######.", "...#.#..."];
function bats(cv, list) { for (const [x, y] of list) cv.at(sprite(BAT_SIL, { "#": PROMO.deep }), x, y); }
// 진열 칸 — 크림 칸(짙은 테 · 그림자) 안에 대표 그림, 아래 빨간 꼬리표에 할인율
const FINE = 3; // 고운 층 배율(칸 6px → 2px)
function tile(cv, x, y, sz, artKey, pct, fh = 8, ft = null) {
  cv.rect(x + 1, y + sz, sz, 2, PROMO.edge); // 그림자
  cv.rect(x, y, sz, sz, PROMO.tileEdge);
  cv.rect(x + 1, y + 1, sz - 2, sz - 2, PROMO.tile);
  const g = art(artKey);
  const bx = g.box();
  cv.at(g, x + Math.round((sz - bx.w) / 2), y + Math.round((sz - bx.h) / 2) - 1);
  if (!fh || !ft) return; // 폰 — 꼬리표 없이 진열만(작은 % 글자는 폰에서 안 읽힌다 · 제목이 「최소 65%」)
  // 꼬리표 판은 굵은 칸, 글자는 고운 칸(FINE 배)
  const m = fontMask(`${pct}%`, fh * FINE, { track: 0.6 });
  const tw = Math.ceil((m.w + 8) / FINE) + 1, th = fh + 3;
  const tx = x + Math.round((sz - tw) / 2), ty = y + sz - 4;
  cv.rect(tx, ty, tw, th, PROMO.tag);
  cv.rect(tx, ty, tw, 1, PROMO.tagHi);
  drawText(ft, m, tx * FINE + Math.round((tw * FINE - m.w) / 2), ty * FINE + Math.round((th * FINE - m.h) / 2) + 1, { bands: PROMO_WHITE, o: 0, sh: 0 });
}
// 고운 층 글자 한 줄 — 좌표 · 크기는 굵은 칸 단위로 받아 FINE 배로 찍는다(외곽선 · 그림자는 고운 칸 3 · 4)
function fineLine(ft, str, x, y, h, bands, { sx = 0.92, track = 0.3, o = 3, sh = 4, ink = PROMO.deep, shade = "#1a0d2e" } = {}) {
  const m = fontMask(str, Math.round(h * FINE), { sx, track });
  drawText(ft, m, Math.round(x * FINE), Math.round(y * FINE), { bands, o, sh, ink, shade });
  return m.w / FINE;
}
function salePc() {
  const W = 400, H = 100;
  const cv = canvas(W, H);
  const ft = canvas(W * FINE, H * FINE);
  promoBg(cv);
  bats(cv, [[200, 10], [214, 78], [384, 8]]);
  // 왼쪽 글 — HALLOWEEN SET · 최소 65% 이상 할인! · 판매 기간
  fineLine(ft, "HALLOWEEN SET", 22, 21, 9, PROMO_CREAM, { sx: 0.95, track: 1 });
  const bw = fineLine(ft, "최소 65% 이상", 20, 37, 20, PROMO_WHITE);
  fineLine(ft, "할인!", 20 + bw + 5, 37, 20, PROMO_YELLOW);
  fineLine(ft, "~ 11. 5.", 22, 68, 9, DATE_BANDS, { sx: 1, track: 0.8, o: 2, sh: 2 });
  // 오른쪽 진열 — 여섯 칸 두 줄(3 × 2)
  const sz = 30, gap = 8, x0 = 270, y0 = 8;
  SALE_SETS.forEach((st, i) => tile(cv, x0 + (i % 3) * (sz + gap), y0 + Math.floor(i / 3) * (sz + 14), sz, st.art, st.pct, 8, ft));
  return { cv, ft };
}
function saleMobile() {
  const W = 180, H = 120;
  const cv = canvas(W, H);
  const ft = canvas(W * FINE, H * FINE);
  promoBg(cv);
  bats(cv, [[160, 8], [150, 46]]);
  fineLine(ft, "HALLOWEEN SET", 10, 10, 8, PROMO_CREAM, { sx: 0.95, track: 1 });
  fineLine(ft, "최소 65% 이상", 9, 24, 15, PROMO_WHITE);
  const hw = fineLine(ft, "할인!", 9, 46, 15, PROMO_YELLOW);
  fineLine(ft, "~ 11. 5.", 9 + hw + 6, 52, 8, DATE_BANDS, { sx: 1, track: 0.8, o: 2, sh: 2 });
  // 아래 진열 — 여섯 칸 한 줄
  const sz = 26, gap = 3, x0 = Math.round((W - (6 * sz + 5 * gap)) / 2), y0 = 81;
  SALE_SETS.forEach((st, i) => tile(cv, x0 + i * (sz + gap), y0, sz, st.art, st.pct, 0));
  return { cv, ft };
}
// 디스코드 서버 배너(16:9 · 960 × 540 이상) — 디스코드가 위쪽 띠에 서버 이름을 얹으므로 글자는 그 아래(위 25% 비움) · 크게, 세트 대표 여섯이 땅에 선다
function discordBanner() {
  const W = 160, H = 90;
  const cv = canvas(W, H);
  const R = rng(3011);
  const moonC = [130, 24], mr = 15;
  sky(cv, R, { stops: [0, 12, 24, 36, 46, 56, 66, 76], avoid: [[6, 22, 104, 36], [moonC[0] - mr - 9, moonC[1] - mr - 9, 2 * mr + 18, 2 * mr + 18]] });
  sparkles(cv, [[112, 6, true], [6, 4, false], [150, 50, false], [96, 44, false]]);
  moonWithWitch(cv, moonC[0], moonC[1], mr);
  cv.at(batSmall(true), 96, 12);
  const far = (x) => 70 - bump(x, 140, 18, 4) - 2 * Math.sin(x / 17);
  cv.stand(house(), 140, Math.round(far(140)) + 1);
  const mid = (x) => 75 - 2 * Math.sin(x / 13 + 1);
  const fore = (x) => 84 - bump(x, 80, 60, 5);
  ground(cv, R, { far, mid, fore });
  const gy = (x) => Math.round(fore(x));
  glow(cv, 80, gy(80) + 2, 56, 3);
  heroRow(cv, gy, [17, 42, 67, 92, 117, 142]);
  frontTufts(cv, R, [[0, 8, 3], [152, 159, 3]]);
  line(cv, "HALLOWEEN", 8, 26, 14, TITLE_STYLE.A.big);
  saleDate(cv, 9, 47, 7);
  return cv;
}

// ───────────────────────── 검은 고양이 세트 ─────────────────────────
// 📌 2026-10-11 운영자 "그냥 한 상품을 테마 잡아서 이만큼 할인해요! 하고 보여주는 게 나을지도" · "고양이 테마 상품을 주로 잡아봐".
//    보라 판 · 큰 달 앞 지붕 끝에 앉은 검은 고양이(배너 고양이 2배) · 털실 · 이름 + 68% + 정가 → 할인가 + 판매 기간, 오른쪽에 구성 셋(테두리 · 카드 스킨 · 배지).
//    값이 바뀌면 CAT_SALE 만 고친다(할인가 = 정가 × (100 − 할인율) / 100 내림 — lib/shopPricing applyDiscount)
const CAT_SALE = { name: "검은 고양이 꾸미기 세트", pct: 68, list: 16704000, parts: ["deco-black-cat", "skin-black-cat", "black-cat"] };
const CATP = { bg0: "#3a2468", bg1: "#452a7c", bg2: "#50308c", paw: "#5a3a9a", paw2: "#4c2f86", halo0: "#5e3e9e", halo1: "#7050ae",
  moon: "#ffe9a0", moonSh: "#f4d56a", crater: "#efcd74", roof: "#1f1438", roofHi: "#3a2a5e", tile: "#f3eaff", tileEdge: "#2a1640", strike: "#c9b8ec" };
const CAT_YELLOW = Object.assign([[1, "#ffe066"]], { light: "#fff6c2", under: "#f2b13a" });
const CAT_WHITE = Object.assign([[1, "#ffffff"]], { under: "#e2d6ff" });
const CAT_CREAM = Object.assign([[1, "#fff4e0"]], { under: "#e8d4ff" });
const CAT_LILAC = Object.assign([[1, "#d9cbf5"]], {});
const PAW = [".#.#.", "#...#", ".###.", ".###."];
const YARN = ["..###..", ".#hh##.", "#h####x", "###x###", "##x####", ".####x.", "..###.."];
const YARN_PAL = { "#": "#ff7ab8", h: "#ffb8d9", x: "#d94a8f" };
// 그림판 2배(도트 한 칸 → 2 × 2)
function x2(g) { const n = grid(); for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) n.set(2 * x + a, 2 * y + b, c); } return n; }
function catBg(cv) {
  const { W, H } = cv;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H;
    let c = t < 0.34 ? CATP.bg0 : t < 0.68 ? CATP.bg1 : CATP.bg2;
    const next = t < 0.34 ? CATP.bg1 : t < 0.68 ? CATP.bg2 : null;
    const edge = t < 0.34 ? 0.34 : 0.68;
    if (next && (edge * H - y) < 3 && dith(x, y) > (edge * H - y) / 3) c = next;
    cv.set(x, y, c);
  }
}
function paws(cv, list) { for (const [x, y, alt] of list) cv.at(sprite(PAW, { "#": alt ? CATP.paw2 : CATP.paw }), x, y); }
function bigMoon(cv, cx, cy, r) {
  for (let y = -r - 5; y <= r + 5; y++) for (let x = -r - 5; x <= r + 5; x++) {
    const d = Math.hypot(x, y);
    if (d <= r) {
      let c = CATP.moon;
      if (Math.hypot(x - r * 0.35, y - r * 0.3) > r * 0.92 && x + y > r * 0.4) c = CATP.moonSh; // 아래 오른쪽 그늘
      cv.set(cx + x, cy + y, c);
    } else if (d <= r + 2) cv.set(cx + x, cy + y, CATP.halo1);
    else if (d <= r + 5 && dith(cx + x, cy + y) < 0.5) cv.set(cx + x, cy + y, CATP.halo0);
  }
  for (const [dx, dy, rr] of [[-0.42, -0.35, 0.13], [0.2, -0.5, 0.08], [-0.15, 0.1, 0.1], [0.45, -0.05, 0.07]])
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.hypot(x, y) <= rr * r) cv.set(cx + Math.round(dx * r) + x, cy + Math.round(dy * r) + y, CATP.crater);
}
function roof(cv, x0, x1, y) {
  cv.rect(x0, y, x1 - x0, cv.H - y, CATP.roof);
  cv.rect(x0, y, x1 - x0, 1, CATP.roofHi);
  for (let x = x0 + 3; x < x1; x += 8) cv.rect(x, y + 3, 1, cv.H - y - 3, CATP.roofHi); // 기와 줄
}
function catHero(cv, cx, bottom) {
  shadow(cv, cx, bottom + 1, 40);
  cv.stand(x2(sprite(NEW_CAT, CAT_PAL)), cx, bottom);
}
function catTile(cv, x, y, sz, key) {
  cv.rect(x + 1, y + sz, sz, 2, CATP.roof);
  cv.rect(x, y, sz, sz, CATP.tileEdge);
  cv.rect(x + 1, y + 1, sz - 2, sz - 2, CATP.tile);
  const g = art(key); const b = g.box();
  cv.at(g, x + Math.round((sz - b.w) / 2), y + Math.round((sz - b.h) / 2));
}
// 정가(취소선) → 할인가
function catPrice(ft, x, y, h, gap = 3) {
  const sale = Math.floor((CAT_SALE.list * (100 - CAT_SALE.pct)) / 100);
  const lw = fineLine(ft, CAT_SALE.list.toLocaleString("en-US"), x, y, h, CAT_LILAC, { sx: 1, track: 0.4, o: 2, sh: 2 });
  ft.rect(Math.round(x * FINE) - 2, Math.round((y + h / 2) * FINE), Math.round(lw * FINE) + 4, 3, "#e91e3f");
  return { sale, lw, after: x + lw + gap };
}
function catPc() {
  const W = 400, H = 100;
  const cv = canvas(W, H);
  const ft = canvas(W * FINE, H * FINE);
  catBg(cv);
  paws(cv, [[150, 8], [318, 14, true], [300, 80], [200, 90, true], [8, 10, true], [372, 52]]);
  sparkles(cv, [[140, 30, true], [16, 40, false], [330, 40, false], [290, 6, true]]);
  bigMoon(cv, 84, 50, 38);
  cv.at(batSmall(), 22, 18);
  roof(cv, 0, W, 90);
  catHero(cv, 84, 90);
  cv.stand(sprite(YARN, YARN_PAL), 128, 90);
  for (const [xx, yy] of [[121, 88], [119, 89], [116, 89], [113, 88]]) cv.set(xx, yy, YARN_PAL.x); // 풀린 실
  // 글 — 이름 · 68% 할인 · 정가 → 할인가 · 판매 기간
  fineLine(ft, CAT_SALE.name, 172, 12, 9, CAT_CREAM, { sx: 0.95, track: 0.4 });
  const pw = fineLine(ft, `${CAT_SALE.pct}%`, 170, 25, 36, CAT_YELLOW, { sx: 0.95, track: 0.2, o: 3, sh: 5 });
  fineLine(ft, "할인", 170 + pw + 4, 44, 16, CAT_WHITE);
  const p = catPrice(ft, 172, 68, 7);
  fineLine(ft, `→ ${p.sale.toLocaleString("en-US")} XP`, p.after, 67, 8, CAT_WHITE, { sx: 1, track: 0.4, o: 2, sh: 2 });
  fineLine(ft, "~ 11. 5.", 172, 82, 7, DATE_BANDS, { sx: 1, track: 0.8, o: 2, sh: 2 });
  // 구성 셋 — 오른쪽 세로
  CAT_SALE.parts.forEach((k, i) => catTile(cv, 360, 4 + i * 28, 24, k));
  return { cv, ft };
}
function catMobile() {
  const W = 180, H = 120;
  const cv = canvas(W, H);
  const ft = canvas(W * FINE, H * FINE);
  catBg(cv);
  paws(cv, [[8, 104, true], [60, 108], [150, 6, true]]);
  sparkles(cv, [[96, 14, true], [172, 30, false], [84, 50, false]]);
  bigMoon(cv, 132, 66, 32);
  cv.at(batSmall(true), 160, 14);
  roof(cv, 0, W, 112);
  catHero(cv, 132, 112);
  fineLine(ft, CAT_SALE.name, 9, 9, 7, CAT_CREAM, { sx: 0.95, track: 0.3 });
  fineLine(ft, `${CAT_SALE.pct}%`, 8, 22, 30, CAT_YELLOW, { sx: 0.95, track: 0.2, o: 3, sh: 5 });
  fineLine(ft, "할인", 9, 59, 13, CAT_WHITE);
  const p = catPrice(ft, 10, 80, 6);
  fineLine(ft, `→ ${p.sale.toLocaleString("en-US")} XP`, 9, 89, 7, CAT_WHITE, { sx: 1, track: 0.4, o: 2, sh: 2 });
  fineLine(ft, "~ 11. 5.", 10, 103, 6, DATE_BANDS, { sx: 1, track: 0.8, o: 2, sh: 2 });
  return { cv, ft };
}
// 디스코드 서버 배너(16:9) 검은 고양이판 — 디스코드가 위 25% 띠에 서버 이름을 얹으므로 글은 그 아래, 고양이 · 달은 오른쪽
function catDiscord() {
  const W = 160, H = 90;
  const cv = canvas(W, H);
  const ft = canvas(W * FINE, H * FINE);
  catBg(cv);
  paws(cv, [[70, 6, true], [92, 26], [6, 8], [140, 4, true]]);
  sparkles(cv, [[84, 14, true], [8, 22, false], [154, 30, false]]);
  bigMoon(cv, 120, 50, 30);
  cv.at(batSmall(true), 64, 18);
  roof(cv, 0, W, 84);
  catHero(cv, 120, 84);
  cv.stand(sprite(YARN, YARN_PAL), 156, 84);
  fineLine(ft, CAT_SALE.name, 8, 27, 6, CAT_CREAM, { sx: 0.95, track: 0.3, o: 2, sh: 3 });
  fineLine(ft, `${CAT_SALE.pct}%`, 7, 37, 24, CAT_YELLOW, { sx: 0.95, track: 0.2, o: 3, sh: 5 });
  const hw = fineLine(ft, "할인", 8, 66, 11, CAT_WHITE);
  fineLine(ft, "~ 11. 5.", 8 + hw + 5, 70, 6, DATE_BANDS, { sx: 1, track: 0.8, o: 2, sh: 2 });
  return { cv, ft };
}

// ───────────────────────── 내보내기 ─────────────────────────
const outDir = join(ROOT, "public", "banners");
const prevDir = join(ROOT, ".claude", "mockups", "halloween-banner");
mkdirSync(outDir, { recursive: true });
mkdirSync(prevDir, { recursive: true });
if (process.env.BANNER === "sale") {
  const flat = async ({ cv, ft }) => sharp(await cv.png(CELL)).composite([{ input: await ft.png(CELL / FINE, true) }]).png({ compressionLevel: 9 }).toBuffer();
  const sp = await flat(salePc()), sm = await flat(saleMobile());
  await sharp(sp).toFile(join(outDir, "halloween-sale-pc.png"));
  await sharp(sm).toFile(join(outDir, "halloween-sale-mobile.png"));
  await sharp({ create: { width: 1200 + 540 + 60, height: 400, channels: 4, background: "#f2f2f2" } })
    .composite([{ input: await sharp(sp).resize(1200, 300, { kernel: "nearest" }).toBuffer(), left: 20, top: 20 }, { input: await sharp(sm).resize(540, 360, { kernel: "nearest" }).toBuffer(), left: 1240, top: 20 }])
    .png().toFile(join(prevDir, "sale-preview.png"));
  console.log("halloween-sale-pc.png · halloween-sale-mobile.png · sale-preview.png");
  process.exit(0);
}
if (process.env.BANNER === "cat") {
  const flat = async ({ cv, ft }) => sharp(await cv.png(CELL)).composite([{ input: await ft.png(CELL / FINE, true) }]).png({ compressionLevel: 9 }).toBuffer();
  const cp = await flat(catPc()), cm = await flat(catMobile());
  await sharp(cp).toFile(join(outDir, "halloween-cat-pc.png"));
  await sharp(cm).toFile(join(outDir, "halloween-cat-mobile.png"));
  await sharp({ create: { width: 1200 + 540 + 60, height: 400, channels: 4, background: "#f2f2f2" } })
    .composite([{ input: await sharp(cp).resize(1200, 300, { kernel: "nearest" }).toBuffer(), left: 20, top: 20 }, { input: await sharp(cm).resize(540, 360, { kernel: "nearest" }).toBuffer(), left: 1240, top: 20 }])
    .png().toFile(join(prevDir, "cat-preview.png"));
  console.log("halloween-cat-pc.png · halloween-cat-mobile.png · cat-preview.png");
  process.exit(0);
}
if (process.env.BANNER === "catdiscord") {
  const d = catDiscord();
  const one = async (cell) => sharp(await d.cv.png(cell)).composite([{ input: await d.ft.png(cell / FINE, true) }]).png({ compressionLevel: 9 }).toBuffer();
  await sharp(await one(CELL)).toFile(join(prevDir, "discord-cat-960.png")); // 960 × 540
  await sharp(await one(CELL * 2)).toFile(join(prevDir, "discord-cat-1920.png")); // 1920 × 1080(올리기 권장)
  console.log("discord-cat-960.png · discord-cat-1920.png");
  process.exit(0);
}
if (process.env.BANNER === "discord") {
  const cv = discordBanner();
  await sharp(await cv.png(CELL)).toFile(join(prevDir, "discord-banner-960.png")); // 960 × 540
  await sharp(await cv.png(CELL * 2)).toFile(join(prevDir, "discord-banner-1920.png")); // 1920 × 1080(올리기 권장)
  console.log("discord-banner-960.png · discord-banner-1920.png");
  process.exit(0);
}
const pcBuf = await pc().png(CELL);
const mBuf = await mobile().png(CELL);
if (process.env.TITLE_PREVIEW) {
  await sharp(pcBuf).toFile(join(prevDir, `title-${TITLE}-pc.png`));
  await sharp(mBuf).toFile(join(prevDir, `title-${TITLE}-mobile.png`));
  console.log(`title-${TITLE}`);
  process.exit(0);
}
await sharp(pcBuf).toFile(join(outDir, "halloween-pc.png"));
await sharp(mBuf).toFile(join(outDir, "halloween-mobile.png"));
// 미리보기 — PC(절반) 옆에 폰(절반), 아래에 작게(PC 608 · 폰 350 — 작은 화면에서도 글자가 읽히는지)
const pcHalf = await sharp(pcBuf).resize(1200, 300, { kernel: "nearest" }).toBuffer();
const mHalf = await sharp(mBuf).resize(540, 360, { kernel: "nearest" }).toBuffer();
const pcReal = await sharp(pcBuf).resize(608, 152, { kernel: "lanczos3" }).toBuffer();
const mReal = await sharp(mBuf).resize(350, 233, { kernel: "lanczos3" }).toBuffer();
await sharp({ create: { width: 1200 + 540 + 60, height: 360 + 40 + 233 + 20, channels: 4, background: "#f2f2f2" } })
  .composite([
    { input: pcHalf, left: 20, top: 20 },
    { input: mHalf, left: 1240, top: 20 },
    { input: pcReal, left: 20, top: 400 },
    { input: mReal, left: 660, top: 400 },
  ])
  .png().toFile(join(prevDir, "preview.png"));
console.log("halloween-pc.png · halloween-mobile.png · preview.png");
