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
// 📌 2026-10-14 운영자 "폰트도 넘 구려" — 이벤트 배너 글은 송명(붓 느낌 명조 · OFL, assets/fonts/SongMyung-OFL.txt)
const FONT_SONG = join(ROOT, "assets", "fonts", "SongMyung-Regular.ttf");
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
// ───────────────────────── 유령 펭귄의 초대(핫타임) ─────────────────────────
// 📌 2026-10-14 운영자 "유령 펭귄의 초대 < 타이틀로 하고 메인 컨셉으로" — 할로윈 핫타임(10/16 ~ 10/31 · 금토일 2배 · 평일 1.5배) 알림 배너.
//    로고 펭귄을 반투명 유령으로(꼬리가 흩날리고 주황 목도리 · 초대장), 뒤에 호박불이 새어 나오는 유령 이글루
// 📌 2026-10-14 운영자 "로고 펭귄은 좀 버려라" — 유령 펭귄을 새로: 후드 망토를 쓴 펭귄 유령(얼굴은 그늘, 눈만 빛남 · 부리 끝) · 망토 아래는 푸른 유령 꼬리로 흩어짐 ·
//    앞발로 푸른 도깨비불 랜턴(아이템 「호박불 랜턴」과 같은 불). 빛 — 랜턴(왼쪽 아래 푸른빛) · 달(오른쪽 위 보랏빛 테두리 빛)
const SP = {
  out: "#0a0716", cloak: ["#5b48b0", "#3d2f84", "#2a2060", "#1a1340", "#110c2a"], rim: "#a493f2", lampRim: "#6fd6ef",
  face: ["#07051a", "#100b28"], eye: ["#f4ffff", "#8ff6ff", "#2fb8d8"], beak: ["#f0a640", "#a8601a"],
  tail: ["#eafcff", "#b4ecf9", "#72c3e6", "#3f86c4", "#2a5f9e"],
  gold: ["#ffe08a", "#e2b04a", "#9c6a22", "#5a3a12"], glass: "#1a3a52", flame: ["#ffffff", "#9ff8ff", "#45b4ff", "#2a6fd6"],
};
const lerp = (a, b, t) => a + (b - a) * t;
// 망토 · 후드 — 그림판 하나(밖 테두리 따로). 빛 방향으로 다섯 단 명암
function spectreCloak() {
  const g = grid();
  const tone = (l) => SP.cloak[l > 0.62 ? 0 : l > 0.32 ? 1 : l > 0.02 ? 2 : l > -0.3 ? 3 : 4];
  // 후드 — 둥근 머리(펭귄 머리처럼 크게) · 오른쪽으로 꺾인 뾰족 끝
  const hcx = 20, hcy = 15, hrx = 11.5, hry = 12;
  for (let y = 2; y <= 27; y++) for (let x = 6; x <= 34; x++) {
    const nx = (x - hcx) / hrx, ny = (y - hcy) / hry;
    if (nx * nx + ny * ny > 1) continue;
    const l = -0.55 * nx - 0.55 * ny + 0.15; // 왼쪽 위가 밝게(랜턴 · 하늘)
    g.set(x, y, tone(l));
  }
  for (let t = 0; t <= 8; t += 0.2) { // 뾰족 끝 — 머리 위에서 오른쪽 뒤로 처진다(속이 꽉 찬 원뿔)
    const x = hcx + 2 + t * 0.9, y = hcy - hry + 2.5 - t * 0.35 + (t > 4 ? (t - 4) * 0.55 : 0);
    const w = Math.max(0.7, 3.6 * (1 - t / 8));
    for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) if (Math.hypot(xx - x, yy - y) <= w) g.set(xx, yy, tone(0.2 - t * 0.06));
  }
  // 망토 — 어깨에서 아래로 퍼지고 아래 끝은 너덜너덜
  for (let y = 22; y <= 42; y++) {
    const half = 8.5 + (y - 22) * 0.48, cx = 20 + Math.sin((y - 22) / 7) * 0.8;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const bottom = 40 + Math.round(1.6 * Math.sin(x * 1.1) + Math.sin(x * 0.37));
      if (y > bottom) continue;
      const nx = (x - cx) / half;
      let l = -0.7 * nx + 0.05 - (y - 22) * 0.012;
      if (((x * 7 + y * 3) % 17) === 0 && y > 27) l -= 0.35; // 옷 주름 결
      g.set(x, y, tone(l));
    }
  }
  // 앞섶이 벌어져 유령 펭귄의 흰 배가 보인다(위가 넓고 아래로 좁아짐) · 옆 주름
  for (let y = 23; y <= 39; y++) for (let x = 14; x <= 26; x++) {
    const nx = (x - 20) / 4.6, ny = (y - 30) / 7.6;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const l = -0.6 * nx - 0.3 * ny; // 랜턴 쪽(왼쪽)이 밝게
    g.set(x, y, d > 0.82 ? SP.tail[3] : l > 0.25 ? SP.tail[0] : l > -0.25 ? SP.tail[1] : SP.tail[2]);
  }
  // 오른쪽 망토 — 빛 받은 주름 한 줄 · 그늘 주름
  for (let y = 27; y <= 39; y++) { g.set(28 + Math.round((y - 27) * 0.25), y, SP.cloak[2]); g.set(25 + Math.round((y - 27) * 0.1), y, SP.cloak[4]); }
  return g;
}
// 얼굴 — 후드 안 그늘 · 매섭게 빛나는 두 눈(부리 없음)
function spectreFace(g) {
  const cx = 20, cy = 16.5;
  for (let y = 9; y <= 24; y++) for (let x = 11; x <= 29; x++) {
    const nx = (x - cx) / 7.6, ny = (y - cy) / 7;
    if (nx * nx + ny * ny > 1) continue;
    g.set(x, y, ny < -0.25 ? SP.face[0] : SP.face[1]);
  }
  // 눈빛 번짐(디더) → 눈 — 안쪽이 아래로 내려간 매서운 눈
  for (const [ex, sgn] of [[16, 1], [24, -1]]) {
    for (let y = 13; y <= 19; y++) for (let x = ex - 3; x <= ex + 3; x++) {
      const d = Math.hypot(x - ex, (y - 16) * 1.3);
      if (d < 3.2 && dith(x, y) < 0.45 && g.get(x, y) && SP.face.includes(g.get(x, y))) g.set(x, y, "#123a52");
    }
    const rows = [[-1, 0, 1], [-2, -1, 0, 1, 2], [-1, 0, 1, 2]];
    rows.forEach((xs, i) => xs.forEach((dx) => g.set(ex + dx * sgn, 15 + i, i === 1 && Math.abs(dx) <= 1 ? SP.eye[0] : SP.eye[1])));
    g.set(ex - 2 * sgn, 15, SP.eye[2]);
  }
  // 📌 부리 없음(2026-10-14 운영자 "유령 펭귄 부리 좀 없애라") — 그늘진 얼굴에 눈빛만
}
// 유령 꼬리 — 망토 아래에서 왼쪽 아래로 휘어 흩어진다(끝으로 갈수록 성기게)
function spectreTail() {
  const g = grid();
  const wisps = [
    { x0: 21, y0: 38, x1: 8, y1: 53, w: 5.6, bend: -4 },
    { x0: 26, y0: 39, x1: 32, y1: 49, w: 2.6, bend: 2 },
    { x0: 14, y0: 39, x1: 11, y1: 47, w: 2.2, bend: -1.5 },
  ];
  for (const wv of wisps) for (let t = 0; t <= 1; t += 0.02) {
    const x = lerp(wv.x0, wv.x1, t) + Math.sin(t * Math.PI) * wv.bend, y = lerp(wv.y0, wv.y1, t);
    const w = wv.w * (1 - t) + 0.4;
    for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) {
      const d = Math.hypot(xx - x, yy - y) / w;
      if (d > 1) continue;
      if (t > 0.35 && dith(xx, yy) < (t - 0.35) * 1.5) continue; // 끝으로 갈수록 성기게 흩어짐
      const k = d < 0.35 ? 0 : d < 0.6 ? 1 : d < 0.85 ? 2 : 3;
      const prev = g.get(xx, yy);
      const c = SP.tail[Math.min(4, k + (t > 0.7 ? 1 : 0))];
      if (!prev || SP.tail.indexOf(prev) > SP.tail.indexOf(c)) g.set(xx, yy, c);
    }
  }
  return g;
}
// 랜턴 — 금 틀 · 유리 · 푸른 불(7 × 11) + 손잡이 고리
const LANTERN = [
  "..GGG..",
  ".G...G.",
  "..ggg..",
  ".dgggd.",
  "dLFFFLd",
  "dFFWFFd",
  "dFWWWFd",
  "dFWWWFd",
  "dLFWFLd",
  ".dgggd.",
  "..ddd..",
];
const LANTERN_PAL = () => ({ G: SP.gold[1], g: SP.gold[1], d: SP.gold[3], L: SP.glass, f: SP.flame[2], F: SP.flame[1], W: SP.flame[0] });
// 한 벌 — { g, lamp: [x, y] 불 자리(그림판 기준) }
function spectre() {
  const cloak = spectreCloak();
  spectreFace(cloak);
  // 앞발 — 왼쪽 앞으로 내밀어 랜턴을 든다
  for (let y = 27; y <= 33; y++) for (let x = 9; x <= 15; x++) if (Math.hypot((x - 12) / 3.2, (y - 30) / 2.4) <= 1) cloak.set(x, y, y < 29 ? SP.cloak[1] : SP.cloak[2]);
  cloak.outline(SP.out);
  // 테두리 빛 — 오른쪽 가장자리(달) 보라 · 왼쪽 아래(랜턴) 푸른
  for (const [key, c] of [...cloak.m]) {
    if (c === SP.out) continue;
    const [x, y] = key.split(",").map(Number);
    if (cloak.get(x + 1, y) === SP.out && (y < 24 || (y < 36 && y % 3 === 0))) cloak.set(x, y, SP.rim);
    else if (cloak.get(x - 1, y) === SP.out && y > 22 && y < 40) cloak.set(x, y, SP.lampRim);
  }
  const tail = spectreTail();
  const g = grid();
  for (const [key, c] of tail.m) { const [x, y] = key.split(",").map(Number); g.set(x, y, c); }
  for (const [key, c] of cloak.m) { const [x, y] = key.split(",").map(Number); g.set(x, y, c); }
  // 랜턴 — 앞발 아래에 매달림
  sprite(LANTERN, LANTERN_PAL(), g, 7, 31);
  return { g, lamp: [10, 37] };
}
// 랜턴 불빛 — 둘레 칸을 푸른빛으로 섞는다(세 단 · 디더). 장면을 다 그린 뒤 부른다
const hexRgb = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function lampLight(cv, lx, ly, r, color = "#7ff3ff", maxT = 0.42) {
  const [cr, cg, cb] = hexRgb(color);
  for (let y = Math.round(ly - r); y <= Math.round(ly + r); y++) for (let x = Math.round(lx - r); x <= Math.round(lx + r); x++) {
    const c = cv.get(x, y);
    if (!c) continue;
    const d = Math.hypot(x - lx, y - ly) / r;
    if (d >= 1) continue;
    const raw = (1 - d) ** 1.6 * maxT;
    const step = maxT / 3;
    const lv = Math.floor(raw / step), frac = raw / step - lv;
    const t = (lv + (frac > 0.65 && dith(x, y) < (frac - 0.65) / 0.35 ? 1 : 0)) * step; // 단 사이 경계만 디더
    if (t <= 0) continue;
    const [r0, g0, b0] = hexRgb(c);
    cv.set(x, y, rgbHex(lerp(r0, cr, t), lerp(g0, cg, t), lerp(b0, cb, t)));
  }
}
// 떠다니는 도깨비불(작은 푸른 불꽃 3 × 5)
const WISP = [".f.", "fFf", "fWf", "fFf", ".f."];
function wisps(cv, list) { for (const [x, y] of list) { cv.at(sprite(WISP, { f: SP.flame[2], F: SP.flame[1], W: SP.flame[0] }), x, y); } }
// 2배 — 도트 한 칸을 2 × 2 로
function x2g(g) { const n = grid(); for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) n.set(2 * x + a, 2 * y + b, c); } return n; }
// 유령빛 — 몸 둘레 옅은 보라 빛(디더)
function ghostAura(cv, cx, cy, rx, ry) {
  for (let y = Math.round(cy - ry); y <= Math.round(cy + ry); y++) for (let x = Math.round(cx - rx); x <= Math.round(cx + rx); x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 0.75 || (d < 0.9 && dith(x, y) < 0.5)) cv.set(x, y, "#4a3c86");
    else if (d < 1 && dith(x, y) < 0.35) cv.set(x, y, "#3e3176");
  }
}
function moonPlain(cv, cx, cy, r) {
  for (let y = cy - r - 8; y <= cy + r + 8; y++) for (let x = cx - r - 8; x <= cx + r + 8; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d < r + 3.5 || (d < r + 5 && dith(x, y) < 0.5)) cv.set(x, y, HALO[1]);
    else if (d < r + 7 || (d < r + 8.5 && dith(x, y) < 0.5)) cv.set(x, y, HALO[0]);
  }
  cv.at(moon(r), cx - r, cy - r);
}
// 유령 이글루 — 얼음 벽돌 돔(엇갈린 줄눈 · 오른쪽 그늘 · 꼭대기 눈빛) + 왼쪽 앞 입구(안에서 호박불) + 거미줄
const IG = { ice: "#6f86c2", hi: "#a3b8e6", sh: "#4c5f9a", line: "#3c4a80", out: "#121633", door: "#0b0b26", glow0: "#ffb04e", glow1: "#e2621a", icicle: "#cfe2ff" };
function igloo(cv, cx, base, rx, ry) {
  const inDome = (x, y, a, b) => ((x - cx) / a) ** 2 + ((y - base) / b) ** 2 <= 1 && y <= base;
  for (let y = base - ry - 1; y <= base; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
    if (!inDome(x, y, rx, ry)) { if (inDome(x, y, rx + 1, ry + 1)) cv.set(x, y, IG.out); continue; }
    const row = base - y;
    let c = (x - cx) / rx > 0.35 ? IG.sh : (x - cx) / rx < -0.55 ? IG.hi : IG.ice;
    if (row > ry - 3) c = IG.hi; // 꼭대기 눈빛
    if (row % 5 === 0) c = IG.line; // 가로 줄눈
    else if (((x - cx + (Math.floor(row / 5) % 2) * 4) % 8 + 8) % 8 === 0) c = IG.line; // 세로 줄눈(엇갈림)
    cv.set(x, y, c);
  }
  // 입구 — 왼쪽 앞 작은 반원(안은 어둡고 호박불)
  const dx = cx - Math.round(rx * 0.32), drx = Math.round(rx * 0.3), dry = Math.round(ry * 0.5);
  for (let y = base - dry - 1; y <= base; y++) for (let x = dx - drx - 1; x <= dx + drx + 1; x++) {
    const d = ((x - dx) / drx) ** 2 + ((y - base) / dry) ** 2;
    if (d <= 1) cv.set(x, y, d < 0.35 ? IG.glow0 : d < 0.6 ? IG.glow1 : IG.door);
    else if (((x - dx) / (drx + 1)) ** 2 + ((y - base) / (dry + 1)) ** 2 <= 1) cv.set(x, y, IG.out);
  }
  // 입구 위 고드름 · 꼭대기 달빛 · 서리 반짝이
  for (let i = -drx; i <= drx; i += 2) { const len = 1 + ((i + 9) % 3); for (let k = 1; k <= len; k++) cv.set(dx + i, base - dry - 1 + k, IG.icicle); }
  for (let x = cx - Math.round(rx * 0.3); x <= cx + Math.round(rx * 0.55); x++) { const y = Math.round(base - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2))); cv.set(x, y, "#d9cbff"); }
  for (const [fx, fy] of [[0.45, 0.55], [0.7, 0.3], [-0.6, 0.45], [0.2, 0.8]]) cv.set(Math.round(cx + fx * rx), Math.round(base - fy * ry), "#ffffff");
}
const GP_TITLE = Object.assign([[1, "#ffffff"]], { under: "#d9cbff" });
// 📌 2026-10-14 운영자 "그 글을 굳이 도트로 하지마" — 이벤트 배너 글은 도트 칸(fineLine)이 아니라 최종 해상도에서 글꼴 그대로 그린다.
//    items: { str, x, y(글 윗선 · 칸), h(대문자 높이 · 칸), fill, stroke, sw(테두리 · 칸), shadow(아래로 · 칸), track(자간 em) } — 칸 → px 은 scale
function smoothText(W, H, scale, items) {
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/ {2,}/g, (m) => " ".repeat(m.length)); // 여러 칸 띄어쓰기 그대로
  const parts = items.map((it) => {
    const size = it.h * scale * (it.font === "song" ? 1.32 : 1.36); // 글자 윗선~아랫선 ≈ 0.75em
    const x = it.x * scale, base = it.y * scale + it.h * scale;
    const sw = (it.sw ?? 0.9) * scale, sh = (it.shadow ?? 0.9) * scale;
    const fam = it.font === "song" ? "Song Myung" : "Pretendard";
    const attrs = `font-family="${fam}" font-weight="${it.font === "song" ? 400 : 900}" font-size="${size.toFixed(1)}" letter-spacing="${((it.track ?? 0) * size).toFixed(2)}"${it.anchor ? ` text-anchor="${it.anchor}"` : ""}`;
    const shadow = sh > 0 ? `<text x="${x}" y="${base + sh}" ${attrs} fill="${it.shade || "#0b0618"}" stroke="${it.shade || "#0b0618"}" stroke-width="${sw * 2}" stroke-linejoin="round">${esc(it.str)}</text>` : "";
    const body = `<text x="${x}" y="${base}" ${attrs} fill="${it.fill}" stroke="${it.stroke || "#1a0d2e"}" stroke-width="${sw * 2}" stroke-linejoin="round" paint-order="stroke">${esc(it.str)}</text>`;
    if (!it.glow) return shadow + body;
    const id = `gl${Math.random().toString(36).slice(2, 8)}`;
    const filt = `<filter id="${id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(scale * 1.8).toFixed(1)}" result="b"/><feFlood flood-color="${it.glow}" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/></feMerge></filter>`;
    return `<defs>${filt}</defs><g filter="url(#${id})">${body}</g>` + shadow + body;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}">${parts}</svg>`;
  return Buffer.from(new Resvg(svg, { font: { fontFiles: [FONT, FONT_SONG], loadSystemFonts: false, defaultFontFamily: "Pretendard" } }).render().asPng());
}
// 📌 운영자 "'초대' 니까 초대를 강조하는 느낌을 줘야지" — 「유령 펭귄의」는 작게 위, 「초대」는 크게 · 랜턴처럼 푸르게 빛나게
const GP_TEXT_PC = [
  { str: "HALLOWEEN HOT TIME", x: 22, y: 9, h: 4.6, fill: "#fff4e0", track: 0.12, sw: 0.6, shadow: 0.5 },
  { str: "유령 펭귄의", x: 21, y: 18, h: 9, fill: "#e8e2ff", sw: 0.9, shadow: 0.9 },
  { str: "초대", x: 19, y: 31, h: 25, fill: "#dffcff", stroke: "#0d1638", sw: 1.3, shadow: 1.6, glow: "#38c8ff", track: 0.04 },
  { str: "XP 최대", x: 98, y: 41, h: 8, fill: "#ffffff", sw: 0.8, shadow: 0.8 },
  { str: "2배", x: 136, y: 38, h: 11, fill: "#ffe066", sw: 0.9, shadow: 0.9 },
  { str: "금 · 토 · 일 2배 · 평일 1.5배", x: 99, y: 54, h: 4.6, fill: "#fff4e0", sw: 0.55, shadow: 0.5 },
  { str: "10. 16. ~ 10. 31.", x: 22, y: 66, h: 6.2, fill: "#fff1c2", sw: 0.7, shadow: 0.6, track: 0.03 },
];
const GP_TEXT_M = [
  { str: "HALLOWEEN HOT TIME", x: 9, y: 7, h: 4.2, fill: "#fff4e0", track: 0.1, sw: 0.55, shadow: 0.5 },
  { str: "유령 펭귄의", x: 8, y: 15, h: 8, fill: "#e8e2ff", sw: 0.8, shadow: 0.8 },
  { str: "초대", x: 7, y: 27, h: 21, fill: "#dffcff", stroke: "#0d1638", sw: 1.1, shadow: 1.3, glow: "#38c8ff", track: 0.04 },
  { str: "XP 최대", x: 9, y: 57, h: 6.8, fill: "#ffffff", sw: 0.7, shadow: 0.7 },
  { str: "2배", x: 41, y: 55, h: 8.8, fill: "#ffe066", sw: 0.8, shadow: 0.8 },
  { str: "10. 16. ~ 10. 31.", x: 9, y: 71, h: 5, fill: "#fff1c2", sw: 0.6, shadow: 0.5 },
  { str: "금토일 2배 · 평일 1.5배", x: 9, y: 80, h: 4.2, fill: "#fff4e0", sw: 0.5, shadow: 0.4 },
];
// 초대장 — 크림 종이 · 금테 · 봉투 날개 선 · 보라 봉랍(가운데 호박 무늬). w × h 칸, 살짝 기울임
const INV = { paper: "#f1e6cc", shade: "#d3c19a", gold: "#e2b04a", goldD: "#9c6a22", out: "#2a1830", seal: ["#a46ae6", "#7a3fc4", "#4e2290"], mark: "#ff9a3c" };
function invitation(w = 26, h = 17, tilt = -0.12) {
  const g = grid();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.round(x + (y - h / 2) * tilt);
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const gold = x === 1 || y === 1 || x === w - 2 || y === h - 2;
    const flap = Math.abs(y - Math.round((Math.abs(x - (w - 1) / 2) * (h * 0.62)) / ((w - 1) / 2))) < 1 && y < h * 0.62; // 위 V 날개 선
    g.set(sx, y, edge ? INV.out : gold ? INV.gold : flap ? INV.goldD : y > h * 0.6 ? INV.shade : INV.paper);
  }
  // 봉랍
  const cx = Math.round((w - 1) / 2 + (Math.round(h * 0.6) - h / 2) * tilt), cy = Math.round(h * 0.6);
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, y);
    if (d > 3.3) continue;
    g.set(cx + x, cy + y, d > 2.6 ? INV.seal[2] : x + y < -1 ? INV.seal[0] : INV.seal[1]);
  }
  g.set(cx, cy, INV.mark); g.set(cx - 1, cy, INV.mark); g.set(cx + 1, cy, INV.mark); g.set(cx, cy - 1, "#3f7a2f");
  return g;
}
// ── 배경: 오로라 · 침엽수 · 눈 · 안개 ──
const NIGHT = { aur0: "#4bffb4", aur1: "#3fd8ff", aur2: "#8a6bff", snow0: "#e6edff", snow1: "#a9b6e6", snow2: "#6f7cb8", snowSh: "#4a5590",
  pine: ["#2b2a63", "#1f1d4a", "#141233"], pineSnow: ["#7d86c4", "#9aa6dd", "#c9d4f5"], fog: "#5b5aa0" };
// 오로라 — 하늘에 흔들리는 커튼 두 줄(위가 진하고 아래로 옅게 · 띠마다 색이 다르다)
function aurora(cv, ribbons) {
  for (const r of ribbons) for (let x = r.x0; x <= r.x1; x++) {
    const top = r.y + Math.sin(x / r.f + r.ph) * r.amp + Math.sin(x / (r.f * 0.37)) * 1.2;
    const fade = Math.min(1, (x - r.x0) / 16, (r.x1 - x) / 16);
    for (let k = 0; k < r.len; k++) {
      const t = (1 - k / r.len) * r.alpha * fade;
      if (t < 0.04) continue;
      const y = Math.round(top + k);
      const c = cv.get(x, y);
      if (!c) continue;
      const mix = k < r.len * 0.35 ? r.c0 : r.c1;
      const step = Math.round((t / 0.12 + (dith(x, y) - 0.5) * 0.8)) * 0.12;
      if (step <= 0) continue;
      const [r0, g0, b0] = hexRgb(c), [r1, g1, b1] = hexRgb(mix);
      cv.set(x, y, rgbHex(lerp(r0, r1, step), lerp(g0, g1, step), lerp(b0, b1, step)));
    }
  }
}
// 침엽수 한 그루 — 층층이 넓어지는 삼각 · 가지 끝에 눈(달빛 쪽 오른쪽 위가 밝게)
function pine(cv, cx, base, h, layer) {
  const col = NIGHT.pine[layer], snow = NIGHT.pineSnow[layer];
  const tiers = Math.max(3, Math.round(h / 6));
  for (let i = 0; i < tiers; i++) {
    const ty = base - h + Math.round((i * h) / tiers), th = Math.round(h / tiers) + 3;
    for (let y = 0; y < th; y++) {
      const half = Math.round(((i + 1) / tiers) * (h * 0.28) * ((y + 1) / th) + 0.5);
      for (let x = -half; x <= half; x++) cv.set(cx + x, ty + y, col);
      if (layer > 0 && y === th - 1) for (let x = -half + 1; x <= half - 1; x += 3) cv.set(cx + x, ty + y - 1, snow);
    }
  }
  cv.rect(cx, base - 1, 1, 2, col);
}
function forest(cv, layer, base, list) { for (const [x, h] of list) pine(cv, x, base(x), h, layer); }
// 눈밭 — 위 끝 빛 · 결
function snowField(cv, top) {
  const { W, H } = cv;
  for (let x = 0; x < W; x++) {
    const t = Math.round(top(x));
    for (let y = t; y < H; y++) cv.set(x, y, y === t ? NIGHT.snow1 : y < t + 3 ? NIGHT.snow2 : (x * 3 + y * 5) % 23 === 0 ? NIGHT.snow2 : NIGHT.snowSh);
  }
}
// 안개 — 땅 위 옅은 띠(디더)
function fogBand(cv, y0, y1, alpha = 0.35) {
  const [fr, fg, fb] = hexRgb(NIGHT.fog);
  for (let y = y0; y <= y1; y++) for (let x = 0; x < cv.W; x++) {
    const t = alpha * Math.sin(((y - y0) / (y1 - y0)) * Math.PI) * (0.7 + 0.3 * Math.sin(x / 13 + y));
    if (dith(x, y) > t * 2.2) continue;
    const c = cv.get(x, y); if (!c) continue;
    const [r, g, b] = hexRgb(c);
    cv.set(x, y, rgbHex(lerp(r, fr, 0.45), lerp(g, fg, 0.45), lerp(b, fb, 0.45)));
  }
}
function snowfall(cv, R, n, avoid = () => false) {
  for (let i = 0; i < n; i++) { const x = Math.floor(R() * cv.W), y = Math.floor(R() * cv.H * 0.85); if (avoid(x, y)) continue; cv.set(x, y, R() < 0.5 ? "#ffffff" : NIGHT.snow0); }
}
// 먼 이글루 — 작은 돔 실루엣 · 따뜻한 창(브랜드 이글루를 숲 사이에 작게)
function farIgloo(cv, cx, base, rx, ry) {
  for (let y = base - ry; y <= base; y++) for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - base) / ry) ** 2 <= 1) cv.set(x, y, (base - y) % 3 === 0 ? "#3f4a86" : "#4f5c9c");
  for (let y = base - 2; y <= base; y++) for (let x = cx - 2; x <= cx + 1; x++) cv.set(x, y, y === base - 2 && (x === cx - 2 || x === cx + 1) ? "#3f4a86" : "#ffb04e");
}
// ── 초대장 — 오래된 크림 종이(얼룩 결 · 가장자리 그을음) · 금 이중 테 · 모서리 박쥐 · 위 가운데 초승달 · 아래 보라 봉랍 + 리본 ──
const CARD = { paper: "#efe2c4", paperL: "#f7eedb", paperD: "#e0cfa8", edge: "#cdb78a", burn: "#a88f62", out: "#2a1830", gold: "#c9993e", goldL: "#ffe08a", goldD: "#8a6324",
  seal: ["#b07af0", "#7a3fc4", "#4e2290", "#2e1258"], ribbon: ["#8a2a4a", "#5a1630"], mark: "#ff9a3c", shadow: "#0c0a22" };
function inviteCard(cv, x0, y0, w, h, R) {
  // 그림자(오른쪽 아래)
  cv.rect(x0 + 3, y0 + 3, w, h, CARD.shadow);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    const ex = Math.min(x, w - 1 - x), ey = Math.min(y, h - 1 - y), e = Math.min(ex, ey);
    let c = CARD.paper;
    if (e === 0) c = CARD.out;
    else if (e === 1) c = CARD.burn;
    else if (e === 2) c = CARD.edge;
    else {
      const r = R();
      c = y < h * 0.18 ? CARD.paperL : CARD.paper;
      if (y > h * 0.8 && dith(X, Y) < (y / h - 0.8) * 2.5) c = CARD.paperD; // 아래쪽 살짝 짙게
      if (r < 0.025) c = CARD.paperD; else if (r > 0.985) c = CARD.paperL; // 고운 종이 결
      if (e === 3 && dith(X, Y) < 0.35) c = CARD.paperD;
    }
    // 금 이중 테 — 바깥 굵은 줄(빛 · 그늘) · 안쪽 가는 줄
    if (e === 4) c = x < w / 2 && y < h / 2 ? CARD.goldL : CARD.gold;
    if (e === 5) c = CARD.goldD;
    if (e === 8) c = (X + Y) % 2 ? CARD.gold : CARD.paperD;
    cv.set(X, Y, c);
  }
  // 모서리 장식 — 금 사각 꼭지 + 박쥐(위) · 꼬마 호박(아래)
  for (const [cx, cy] of [[x0 + 6, y0 + 6], [x0 + w - 7, y0 + 6], [x0 + 6, y0 + h - 7], [x0 + w - 7, y0 + h - 7]]) {
    cv.rect(cx - 1, cy - 1, 3, 3, CARD.goldD); cv.set(cx, cy, CARD.goldL);
  }
  cv.at(sprite(BAT_SIL, { "#": "#3a1f52" }), x0 + 10, y0 + 9);
  cv.at(sprite(BAT_SIL, { "#": "#3a1f52" }).flip(), x0 + w - 19, y0 + 9);
  // 위 가운데 초승달(금)
  const mx = x0 + Math.round(w / 2), my = y0 + 7;
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (Math.hypot(x, y) <= 3.2 && Math.hypot(x + 1.6, y - 0.8) > 2.6) cv.set(mx + x, my + y, y < 0 ? CARD.goldL : CARD.gold);
  // 아래 봉랍 + 리본 꼬리
  const sx = x0 + Math.round(w / 2), sy = y0 + h - 2;
  for (const [dx, len] of [[-3, 9], [3, 8]]) for (let k = 0; k < len; k++) { const xx = sx + dx + Math.round(k * (dx < 0 ? -0.35 : 0.35)); cv.rect(xx - 1, sy + k, 3, 1, k % 3 === 2 ? CARD.ribbon[1] : CARD.ribbon[0]); }
  for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
    const d = Math.hypot(x, y);
    if (d > 6.3) continue;
    const wobble = d > 5.2 && (Math.atan2(y, x) * 4 + 9) % 2 < 1;
    cv.set(sx + x, sy + y, d > 5.6 || wobble ? CARD.seal[3] : d > 4.4 ? CARD.seal[2] : x + y < -3 ? CARD.seal[0] : CARD.seal[1]);
  }
  // 봉랍 무늬 — 작은 호박
  for (const [dx, dy, c] of [[-1, 0, CARD.mark], [0, 0, CARD.mark], [1, 0, CARD.mark], [-1, 1, CARD.mark], [0, 1, CARD.mark], [1, 1, CARD.mark], [0, -1, "#3f7a2f"]]) cv.set(sx + dx, sy + dy, c);
}
// 📌 2026-10-14 운영자 "초대 글자가 좀 아쉬운데 · 진짜 약간 필기체? 느낌 · 도트로 해도 상관 없어" — 「초대」는 글꼴이 아니라 붓펜으로 흘려 쓴 도트(반 칸 = 3px).
//    넓은 촉(각도 −38°)으로 획을 쓰고 압력으로 굵기를 바꾼다 → 높은 해상도에서 칠한 뒤 도트로 끊는다. 오른쪽으로 기울이고(SLANT),
//    ㅗ 가로획이 「대」로 이어 올라가며 · ㅐ 끝 세로가 아래로 휘어 밑줄 꼬리가 된다. 단위: 글자 높이 100 · [x, y, 압력]
const C_INK_V_ = "#4a1d6e";
//    10/14 "짜치는데 · 너무 얇아" → 굵은 붓 → "영어 필기체 느낌 몰라?" — 영어 손글씨(캘리그라피)처럼: 크게 기울이고(SLANT 0.3), 굵기는 획 방향으로
//    (아래로 내려 긋는 획 굵게 · 올라가는 · 가로 획 가늘게), 획을 이어 쓰고 ㅐ 세로는 'l' 처럼 왼쪽으로 감는 고리, 끝 세로는 아래 고리 돌아 밑줄.
//    짙은 테두리 · 윗면 빛 · 아랫면 그늘 · 금 그림자 두 도트. 단위: 글자 높이 100(y 아래로) · [x, y, 최소 압력]
const CHODAE = [
  [[60, 0], [57, 6], [53, 13]], // ㅊ 꼭지
  [[12, 40, 0.25], [16, 32, 0.3], [28, 26, 0.3], [56, 22, 0.3], [84, 18, 0.3], [104, 14, 0.15]], // ㅊ 가로
  [[70, 22], [62, 30], [48, 46], [32, 62], [22, 74], [26, 78], [38, 66], [52, 52], [58, 50], [66, 58], [80, 70], [92, 78], [102, 74]], // ㅅ 왼 내림 → 고리 → 오른 내림
  [[58, 76], [57, 84], [56, 90]], // ㅗ 세로
  [[2, 102, 0.15], [20, 99, 0.32], [60, 96, 0.36], [100, 93, 0.3], [126, 88, 0.15], [140, 76], [150, 56], [158, 36], [166, 26], [184, 21, 0.25], [198, 19, 0.2], [202, 20]], // ㅗ 가로 → 올라가는 이음 → ㄷ 위
  [[176, 28], [172, 42], [170, 58], [170, 70], [176, 79], [194, 80, 0.3], [212, 75], [219, 58], [221, 34], [224, 10], [230, -5], [238, -8], [243, -1], [240, 24], [237, 54], [234, 86], [233, 96], [237, 99]], // ㄷ 아래 → 'l' 고리 → ㅐ 첫 세로
  [[240, 50, 0.45], [254, 48, 0.45], [266, 46, 0.3], [268, 26], [272, 6], [279, -7], [287, -8], [290, 2], [287, 30], [284, 62], [280, 92], [272, 108], [258, 116, 0.3], [232, 120, 0.32], [190, 120, 0.3], [148, 117, 0.22], [118, 113, 0.1], [98, 110]], // ㅐ 가운데 → 'l' 고리 → 끝 세로 → 밑줄
];
const SCRIPT = { slant: 0.3, wmax: 15, wmin: 3.6, top: -12, bottom: 124, wide: 330, hi: "#a97be0", body: "#521f7a", low: "#3a1358", line: "#22093a", gold: "#d7a94a" };
function catmull(pts, step = 0.25) {
  const out = [], P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}
// 획 → 도트 지도(글자 높이 dotsH 도트). 둥근 붓 · 굵기 = 아래로 긋는 정도(앞뒤 고르게) · 획 끝은 가늘게, 8 × 8 로 칠해 45% 넘게 덮인 도트만 · 가운데 선은 늘 찍는다
function scriptMask(strokes, dotsH) {
  const S = SCRIPT, ss = 8, u = dotsH / 100, pad = 3;
  const W = Math.ceil(S.wide * u) + pad * 2, H = Math.ceil((S.bottom - S.top) * u) + pad * 2;
  const SW = W * ss, SH = H * ss, cov = new Uint8Array(SW * SH), on = new Uint8Array(W * H);
  for (const st of strokes) {
    const P = catmull(st).map(([x, y]) => [x + (100 - y) * S.slant, y]);
    const minAt = (i) => { const f = (i / (P.length - 1)) * (st.length - 1), k = Math.floor(f), t = f - k; return (st[k][2] ?? 0) * (1 - t) + (st[Math.min(k + 1, st.length - 1)][2] ?? 0) * t; };
    const raw = P.map((p, i) => {
      const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return Math.max(minAt(i), Math.min(1, 0.1 + Math.max(0, (b[1] - a[1]) / l - 0.25) / 0.75));
    });
    const pr = raw.map((_, i) => { let sum = 0, n = 0; for (let j = Math.max(0, i - 6); j <= Math.min(raw.length - 1, i + 6); j++) { sum += raw[j]; n++; } return sum / n; });
    let L = 0;
    const acc = P.map((p, i) => (L += i ? Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0));
    P.forEach(([x, y], i) => {
      const p = pr[i] * (0.35 + 0.65 * Math.min(1, acc[i] / 10, (L - acc[i]) / 12));
      const cx = (x * u + pad) * ss, cy = ((y - S.top) * u + pad) * ss;
      if (cx < 0 || cy < 0 || cx >= SW || cy >= SH) return;
      on[Math.floor(cy / ss) * W + Math.floor(cx / ss)] = 1;
      const r = ((S.wmin + (S.wmax - S.wmin) * p) * u * ss) / 2, rr = Math.ceil(r);
      for (let yy = Math.max(0, Math.floor(cy - rr)); yy <= Math.min(SH - 1, cy + rr); yy++) for (let xx = Math.max(0, Math.floor(cx - rr)); xx <= Math.min(SW - 1, cx + rr); xx++)
        if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) cov[yy * SW + xx] = 1;
    });
  }
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let n = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) n += cov[(y * ss + j) * SW + x * ss + i];
    if (n / (ss * ss) >= 0.45) on[y * W + x] = 1;
    if (on[y * W + x]) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  }
  return { W, H, box: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, at: (x, y) => x >= 0 && y >= 0 && x < W && y < H && on[y * W + x] === 1 };
}
// 도트 지도 → 그림판(반 칸 층) — 몸 · 윗면 빛 · 아랫면 그늘 · 짙은 테두리(4이웃) · 오른쪽 아래 금 그림자 두 도트
function drawScript(layer, m, x0, y0) {
  const S = SCRIPT, at = m.at;
  const near = (x, y) => at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1);
  for (let y = -3; y <= m.H + 3; y++) for (let x = -3; x <= m.W + 3; x++) {
    let c = null;
    if (at(x, y)) c = !at(x, y + 1) || !at(x + 1, y + 1) ? S.low : !at(x, y - 1) || !at(x - 1, y - 1) ? S.hi : S.body;
    else if (near(x, y)) c = S.line;
    else if (at(x - 2, y - 2) || at(x - 1, y - 2) || at(x - 2, y - 1)) c = S.gold;
    if (c) layer.set(x0 + x, y0 + y, c);
  }
}
// 초대장 위 「초대」 — 가운데 cx · 윗선 top(칸), 글자 높이 h(칸) → 반 칸 층 그림판
function chodaeLayer(W, H, cx, top, h) {
  const layer = canvas(W * 2, H * 2), m = scriptMask(CHODAE, Math.round(h * 2)), b = m.box;
  drawScript(layer, m, Math.round(cx * 2 - (b.x0 + b.x1) / 2), Math.round(top * 2) - b.y0);
  return layer;
}
// ── 글(송명) — 초대장 위 잉크 · 「초대」는 크게 보랏빛 잉크에 금 그림자 ──
const C_INK = "#2a1830";
function cardText(x0, y0, w, sc) {
  const cx = x0 + w / 2;
  return [
    { str: "HALLOWEEN  HOT  TIME", x: cx, y: y0 + 13 * sc, h: 3.6 * sc, fill: "#8a6324", stroke: "#8a6324", sw: 0.12, shadow: 0, track: 0.18, font: "song", anchor: "middle" },
    { str: "유령 펭귄의", x: cx, y: y0 + 20 * sc, h: 7.4 * sc, fill: C_INK, stroke: C_INK, sw: 0.22, shadow: 0, font: "song", anchor: "middle" },
    { str: "XP 최대 2배", x: cx, y: y0 + 58 * sc, h: 6.6 * sc, fill: "#a3360f", stroke: "#a3360f", sw: 0.2, shadow: 0, font: "song", anchor: "middle" },
    { str: "금 · 토 · 일 2배    평일 1.5배", x: cx, y: y0 + 67.5 * sc, h: 3.9 * sc, fill: C_INK, stroke: C_INK, sw: 0.1, shadow: 0, font: "song", anchor: "middle" },
    { str: "10. 16.  ~  10. 31.", x: cx, y: y0 + 74.5 * sc, h: 3.9 * sc, fill: "#6b4a2a", stroke: "#6b4a2a", sw: 0.1, shadow: 0, font: "song", anchor: "middle", track: 0.05 },
  ];
}
// 📌 10/14 운영자 "초대장 빼버리고 · 유령 펭귄 중앙에 두고 그 아래에 타이틀 내용 적어" — 초대장 · 필기체 「초대」 없이, 가운데 유령 펭귄 + 아래 글(송명)
// 📌 10/14 배수 줄(금토일 2배 · 평일 1.5배)은 글 · 판 둘 다 "별로" → 운영자 "XP 최대 2배랑 이벤트 패스" — 한 줄에 두 문구를 나란히, 가운데 도깨비불로 나눈다
function titleText(cx, y0, k, { big = 9.4 } = {}) {
  const line = (str, y, h, fill, o = {}) => ({ str, x: cx, y: y0 + y * k, h: h * k, fill, stroke: "#0d0820", sw: 0.55 * k, shadow: 0.7 * k, font: "song", anchor: "middle", ...o });
  // 10/14 "핫타임 글자 내려 · 아니다 그냥 기간만 표기해" — 「HALLOWEEN HOT TIME」 빼고 기간만, 맨 아래로
  const gap = 6 * k, hy = big + 3;
  const text = [
    line("유령 펭귄의 초대", 0, big, "#f3efff", { glow: "#3fb6ff", sw: 0.8 * k, shadow: 1 * k, track: 0.03 }),
    line("XP 최대 2배", hy, 5.8, "#ffb347", { x: cx - gap, anchor: "end", sw: 0.65 * k, glow: "#ff6a1a" }),
    line("이벤트 패스", hy, 5.8, "#bff4ff", { x: cx + gap, anchor: "start", sw: 0.65 * k, glow: "#2fa8ff" }),
    // 10/18 운영자 "날짜 10.19부터라고 · 지금 올라가있는 배너들 다 바꿔라" — 10. 16. → 10. 19.(끝 10. 31. 은 그대로)
    line("10. 19.  ~  10. 31.", hy + 8.6, 3.6, "#ffd98a", { track: 0.08, sw: 0.45 * k, shadow: 0.5 * k }),
  ];
  return { text, wisp: [Math.round(cx) - 1, Math.round(y0 + (hy + 0.2) * k)] };
}
function ghostPc() {
  const W = 400, H = 100;
  const cv = canvas(W, H);
  const R = rng(1016);
  const moonC = [362, 18], mr = 11;
  sky(cv, R, { stops: [0, 14, 27, 39, 50, 60, 70, 80], avoid: [[moonC[0] - mr - 9, moonC[1] - mr - 9, 2 * mr + 18, 2 * mr + 18]] });
  aurora(cv, [
    { x0: 0, x1: 399, y: 6, len: 26, amp: 5, f: 19, ph: 0.4, alpha: 0.5, c0: NIGHT.aur0, c1: NIGHT.aur1 },
    { x0: 40, x1: 360, y: 20, len: 18, amp: 4, f: 13, ph: 2.1, alpha: 0.32, c0: NIGHT.aur1, c1: NIGHT.aur2 },
  ]);
  moonPlain(cv, moonC[0], moonC[1], mr);
  sparkles(cv, [[300, 6, true], [392, 40, false], [250, 12, false], [70, 10, true], [120, 30, false], [24, 36, false]]);
  // 숲 — 양옆은 촘촘 · 가운데(글 자리)는 먼 줄만
  const farB = (x) => 74 + Math.round(Math.sin(x / 23) * 2), midB = (x) => 82 + Math.round(Math.sin(x / 17 + 1) * 2);
  forest(cv, 0, farB, Array.from({ length: 36 }, (_, i) => [4 + i * 11 + ((i * 5) % 4), 13 + ((i * 7) % 8)]));
  farIgloo(cv, 334, farB(334) + 1, 9, 6);
  forest(cv, 1, midB, [...Array.from({ length: 6 }, (_, i) => [8 + i * 22 + ((i * 3) % 7), 20 + ((i * 11) % 10)]), ...Array.from({ length: 6 }, (_, i) => [272 + i * 22 + ((i * 3) % 7), 20 + ((i * 11) % 10)])]);
  snowField(cv, (x) => 90 - 2 * Math.sin(x / 31) - bump(x, 300, 50, 2));
  fogBand(cv, 74, 94, 0.28);
  forest(cv, 2, (x) => 101, [[10, 46], [28, 32], [392, 52], [374, 34]]);
  snowfall(cv, R, 90, () => true);
  // 유령 펭귄 — 가운데
  const sp = spectre(), b = sp.g.box();
  const ox = Math.round(W / 2 - b.w / 2), oy = 2;
  lampLight(cv, ox + 20, oy + 24, 34, "#6b5bd6", 0.3);
  cv.at(sp.g, ox, oy);
  wisps(cv, [[ox - 16, oy + 10], [ox + b.w + 10, oy + 6], [ox + b.w + 18, oy + 32], [ox - 26, oy + 34]]);
  lampLight(cv, ox + sp.lamp[0] - b.x0, oy + sp.lamp[1] - b.y0, 40, "#7ff3ff", 0.42);
  const t = titleText(W / 2, oy + b.h + 2, 1, { big: 11 });
  wisps(cv, [t.wisp]);
  return { cv, text: t.text };
}
function ghostMobile() {
  const W = 180, H = 120;
  const cv = canvas(W, H);
  const R = rng(1016);
  const moonC = [154, 16], mr = 8;
  sky(cv, R, { stops: [0, 16, 32, 46, 60, 72, 84, 96], avoid: [[moonC[0] - mr - 9, moonC[1] - mr - 9, 2 * mr + 18, 2 * mr + 18]] });
  aurora(cv, [{ x0: 0, x1: 179, y: 4, len: 24, amp: 4, f: 15, ph: 1, alpha: 0.48, c0: NIGHT.aur0, c1: NIGHT.aur1 }]);
  moonPlain(cv, moonC[0], moonC[1], mr);
  sparkles(cv, [[20, 10, true], [40, 30, false], [140, 40, false]]);
  const farB = (x) => 100 + Math.round(Math.sin(x / 19) * 2);
  forest(cv, 0, farB, Array.from({ length: 17 }, (_, i) => [4 + i * 11 + ((i * 5) % 3), 12 + ((i * 7) % 8)]));
  forest(cv, 1, (x) => 108, [[8, 24], [26, 18], [156, 22], [174, 26]]);
  snowField(cv, (x) => 112 - 2 * Math.sin(x / 23));
  fogBand(cv, 96, 114, 0.3);
  snowfall(cv, R, 46, () => true);
  const sp = spectre(), b = sp.g.box();
  const ox = Math.round(W / 2 - b.w / 2), oy = 5;
  lampLight(cv, ox + 20, oy + 24, 26, "#6b5bd6", 0.3);
  cv.at(sp.g, ox, oy);
  wisps(cv, [[ox - 14, oy + 10], [ox + b.w + 8, oy + 8], [ox + b.w + 12, oy + 34]]);
  lampLight(cv, ox + sp.lamp[0] - b.x0, oy + sp.lamp[1] - b.y0, 30, "#7ff3ff", 0.42);
  const t = titleText(W / 2, oy + b.h + 4, 1.12);
  wisps(cv, [t.wisp]);
  return { cv, text: t.text };
}

// 이벤트 꾸미기 시안 — 배지(16 칸) · 아바타 테두리(64 칸) · 카드 스킨(200 × 64 칸)
const GP_BADGE = [
  "................",
  ".....OOOOOO.....",
  "....OKKKKKKO....",
  "...OKGKKKKKKO...",
  "...OKWWKKWWKO...",
  "...OWWWWWWWWO...",
  "...OWEWWWWEWO...",
  "...OWBWYYWBWO...",
  "...ORRRRRRRRO...",
  "..OTWWWWWWWWTO..",
  "..OTWWWWWWWWTO..",
  "...OWWWWWWWWO...",
  "...OWWWWWWWWO...",
  "...OWWOWWOWWO...",
  "....OO.OO.OO....",
  "................",
];
// 테두리 — 유령 날개(바깥 깃털 흰빛 → 푸른빛) · 보라 고리 · 네 방향 호박불 · 위 가운데 유령 펭귄 · 아래 초대장 문장
function ghostFrame() {
  const N = 72, cv = canvas(N, N);
  const c = (N - 1) / 2, r0 = 24, r1 = 29;
  // 유령 날개 — 양옆 깃털 네 장(고리 옆에서 뻗어 위로 휘며 끝이 가늘어진다 · 끝으로 갈수록 흰빛) · 짙은 남색 테
  const wing = grid();
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) {
    const L = 15 - k * 2.5, base = 0.25 - k * 0.38; // 시작 각(라디안, 0 = 옆 · 음수 = 위)
    for (let t = 0; t <= L; t += 0.25) {
      const ang = base - (t / L) * 0.55;
      const rr = r1 - 2 + t;
      const px = c + side * rr * Math.cos(ang), py = c + rr * Math.sin(ang);
      const w = 3.2 * (1 - t / L) + 0.6;
      for (let yy = Math.floor(py - w); yy <= Math.ceil(py + w); yy++) for (let xx = Math.floor(px - w); xx <= Math.ceil(px + w); xx++) {
        if (Math.hypot(xx - px, yy - py) > w) continue;
        if (Math.hypot(xx - c, yy - c) < r1) continue; // 고리 안쪽은 비운다
        const col = t > L * 0.8 ? "#ffffff" : t > L * 0.45 ? "#dce8fb" : "#a9bbe8";
        const prev = wing.get(xx, yy);
        if (!prev || prev === "#a9bbe8" || (prev === "#dce8fb" && col === "#ffffff")) wing.set(xx, yy, col);
      }
    }
  }
  wing.outline("#2a2f5e");
  for (const [key, col] of wing.m) { const [x, y] = key.split(",").map(Number); cv.set(x, y, col); }
  // 고리 — 금 테두리 · 짙은 보라 · 주황 점(룬)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d >= r0 - 0.5 && d <= r1 + 0.5) {
      const edge = d < r0 + 0.6 || d > r1 - 0.6;
      const ang = Math.atan2(y - c, x - c);
      const rune = !edge && Math.abs(d - (r0 + r1) / 2) < 0.8 && Math.round((ang + Math.PI) / (Math.PI / 12)) % 2 === 0;
      cv.set(x, y, edge ? "#ffd447" : rune ? "#ff8a24" : "#4a2785");
    } else if (d < r0 - 0.5) cv.set(x, y, "#e9edf5"); // 사진 자리(시안)
  }
  // 아래 양옆 꼬마 호박
  cv.stand(pumpkinSmall(), Math.round(c - 18), Math.round(c + 26));
  cv.stand(pumpkinSmall(), Math.round(c + 18), Math.round(c + 26));
  // 위 가운데 유령 펭귄(고리에 걸터앉음) · 아래 초대장 문장
  cv.at(sprite(GP_BADGE, GP_PAL), Math.round(c) - 8, Math.round(c - r1) - 11);
  cv.at(sprite(ENVELOPE, ENV_PAL), Math.round(c) - 4, Math.round(c + r1) - 3);
  return cv;
}
// 카드 스킨 — 밤하늘 · 오른쪽 유령 이글루 · 레벨 막대 끝에 유령 펭귄이 앉아 있고 꼬리가 막대를 따라 흩날림
function ghostCard() {
  const W = 200, H = 64, cv = canvas(W, H);
  const R = rng(1031);
  sky(cv, R, { stops: [0, 8, 16, 24, 32, 40, 48, 56], avoid: [[4, 4, 110, 56]] });
  sparkles(cv, [[120, 6, true], [150, 14, false], [96, 4, false]]);
  moonPlain(cv, 186, 12, 8);
  const fore = (x) => 58 - bump(x, 170, 30, 3);
  ground(cv, R, { far: (x) => 52 - bump(x, 160, 24, 2), mid: (x) => 55, fore });
  igloo(cv, 172, Math.round(fore(172)), 20, 15);
  // 카드 칸(시안) — 아바타 · 이름 · 레벨 막대
  for (let y = 10; y < 34; y++) for (let x = 8; x < 32; x++) if (Math.hypot(x - 19.5, y - 21.5) < 12) cv.set(x, y, "#e9edf5");
  cv.rect(38, 14, 52, 5, "#ffffff"); // 이름 자리
  cv.rect(38, 22, 30, 3, "#c9c2e6");
  // 레벨 막대 — 칸 · 채움(호박색)
  cv.rect(8, 42, 150, 7, "#1a1030");
  cv.rect(9, 43, 148, 5, "#2d2350");
  cv.rect(9, 43, 96, 5, "#ff8a24");
  cv.rect(9, 43, 96, 1, "#ffc46e");
  // 막대 끝 유령 펭귄 + 꼬리빛
  for (let x = 60; x < 104; x++) if (dith(x, 40) < (x - 60) / 44) cv.set(x, 40, "#9fb0e0");
  cv.at(sprite(GP_BADGE, GP_PAL), 98, 27);
  return cv;
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
if (process.env.BANNER === "spectre") {
  const dir = join(ROOT, ".claude", "mockups", "ghost-event");
  mkdirSync(dir, { recursive: true });
  const cv = canvas(48, 60);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 48; x++) cv.set(x, y, y < 30 ? "#1c1440" : "#241a52");
  const sp = spectre();
  cv.at(sp.g, 4, 3);
  lampLight(cv, 4 + sp.lamp[0], 3 + sp.lamp[1], 22, "#7ff3ff", 0.42);
  await sharp(await cv.png(10)).toFile(join(dir, "spectre.png"));
  console.log("ghost-event/spectre.png");
  process.exit(0);
}
if (process.env.BANNER === "ghostcos") {
  const dir = join(ROOT, ".claude", "mockups", "ghost-event");
  mkdirSync(dir, { recursive: true });
  const badge = canvas(16, 16); badge.at(sprite(GP_BADGE, GP_PAL), 0, 0);
  const bBuf = await badge.png(12, true); // 192
  const fBuf = await ghostFrame().png(5, true); // 360
  const cBuf = await ghostCard().png(5); // 1000 × 320
  await sharp({ create: { width: 1000 + 40, height: 360 + 320 + 60, channels: 4, background: "#f2f2f2" } })
    .composite([{ input: bBuf, left: 40, top: 60 }, { input: fBuf, left: 320, top: 0 }, { input: cBuf, left: 20, top: 400 }])
    .png().toFile(join(dir, "cosmetics-preview.png"));
  console.log("ghost-event/cosmetics-preview.png");
  process.exit(0);
}
// 📌 10/14 운영자 "진짜 카드 스킨은 모든 게 바뀌는 게 스킨" — 첫 카드 스킨 「유령 펭귄의 초대」 바탕 장면 시안(레벨 카드 360 × 556 = 120 × 186칸 · 칸 3px).
//    글 자리(이름 · LEVEL · 막대 · 스탯)는 어둡게 두고, 오른쪽 빈자리(LEVEL 숫자 옆)에 유령 펭귄 · 아래는 숲 · 눈밭
function ghostCardScene() {
  const W = 120, H = 186;
  const cv = canvas(W, H);
  const R = rng(1031);
  const moonC = [106, 13], mr = 7;
  // 글 자리(칸) — 이름 · LEVEL 숫자 · 등급 · 막대 · 스탯. 별 · 눈송이 · 반짝이를 두지 않는다
  const TEXT = [[45, 13, 62, 25], [6, 56, 38, 32], [6, 87, 64, 17], [6, 108, 108, 18], [6, 133, 108, 42]];
  const onText = (x, y) => TEXT.some(([ax, ay, aw, ah]) => x >= ax && y >= ay && x < ax + aw && y < ay + ah);
  sky(cv, R, { stops: [0, 26, 52, 78, 102, 124, 144, 162], avoid: [[moonC[0] - mr - 8, moonC[1] - mr - 8, 2 * mr + 16, 2 * mr + 16], ...TEXT] });
  aurora(cv, [
    { x0: 0, x1: 119, y: 6, len: 16, amp: 3, f: 13, ph: 0.8, alpha: 0.32, c0: NIGHT.aur0, c1: NIGHT.aur1 },
    { x0: 10, x1: 119, y: 18, len: 12, amp: 3, f: 9, ph: 2.4, alpha: 0.22, c0: NIGHT.aur1, c1: NIGHT.aur2 },
  ]);
  moonPlain(cv, moonC[0], moonC[1], mr);
  sparkles(cv, [[60, 44, false], [114, 40, true]]);
  const farB = (x) => 168 + Math.round(Math.sin(x / 13) * 2);
  forest(cv, 0, farB, Array.from({ length: 12 }, (_, i) => [3 + i * 10 + ((i * 5) % 4), 14 + ((i * 7) % 8)]));
  farIgloo(cv, 104, farB(104) + 3, 8, 5);
  forest(cv, 1, (x) => 179, [[4, 26], [16, 18], [112, 28], [100, 18]]);
  snowField(cv, (x) => 180 - 1.5 * Math.sin(x / 17));
  fogBand(cv, 158, 182, 0.24);
  snowfall(cv, R, 34, onText);
  // 📌 10/14 운영자 "배경에 있는 유령 펭귄을 제거하고, 카드 테두리에 동일한 위치에 유령 펭귄을 넣자" — 장면엔 도깨비불만
  wisps(cv, [[64, 56], [110, 82], [52, 62]]);
  return cv;
}
// 카드 테두리 「유령 펭귄의 초대」 — 테 · 네 모서리 보석 · 유령 펭귄(스킨 때와 같은 자리, LEVEL 숫자 오른쪽)
const GC_SPECTRE = [76, 52];
// 📌 10/14 운영자 "테두리가 좀 더 예쁘면 좋겠어" — 가는 선 · 점선 → 볼록 몰딩 테 · 푸른 불꽃 장식(꼬마전구처럼) · 모서리 금 메달 + 유령 날개 깃털 · 아래 안개 자락
function ghostCardBorder() {
  const W = 120, H = 186, cv = canvas(W, H);
  const x0 = 3, y0 = 3, x1 = 116, y1 = 182; // 테 바깥선(칸)
  const MOLD = ["#0a0716", "#8a76e6", "#4b3a9a", "#2a2068", "#0a0716"]; // 바깥선 · 빛 · 몸 · 그늘 · 안선
  for (let i = 0; i < 5; i++) {
    for (let x = x0 + i; x <= x1 - i; x++) { cv.set(x, y0 + i, MOLD[i]); cv.set(x, y1 - i, MOLD[i === 1 ? 3 : i === 3 ? 1 : i]); }
    for (let y = y0 + i; y <= y1 - i; y++) { cv.set(x0 + i, y, MOLD[i]); cv.set(x1 - i, y, MOLD[i === 1 ? 3 : i === 3 ? 1 : i]); }
  }
  // 안쪽 푸른 빛 한 줄(성기게)
  for (let x = x0 + 5; x <= x1 - 5; x++) { if (x % 2) { cv.set(x, y0 + 5, "#2f5fb0"); cv.set(x, y1 - 5, "#2f5fb0"); } }
  for (let y = y0 + 5; y <= y1 - 5; y++) { if (y % 2) { cv.set(x0 + 5, y, "#2f5fb0"); cv.set(x1 - 5, y, "#2f5fb0"); } }
  // 푸른 불꽃 장식 — 테 몸 가운데 줄에 촘촘히(밝은 것 · 어두운 것 번갈아)
  const stud = (x, y, on) => { cv.set(x, y, on ? "#ffffff" : "#9ff8ff"); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) cv.set(x + dx, y + dy, on ? "#7ff3ff" : "#3f86c4"); cv.set(x, y - 2, on ? "#45b4ff" : null); };
  let n = 0;
  for (let x = x0 + 16; x <= x1 - 16; x += 9) { stud(x, y0 + 2, n % 2 === 0); stud(x, y1 - 2, n % 2 === 1); n++; }
  n = 0;
  for (let y = y0 + 16; y <= y1 - 16; y += 9) { stud(x0 + 2, y, n % 2 === 0); stud(x1 - 2, y, n % 2 === 1); n++; }
  // 모서리 — 유령 날개 깃털(테를 따라 두 장씩) + 금 메달 · 푸른 불꽃
  const FEATHER = ["..ooooo...", ".oWWWbbo..", "oWWbbbvvoo", ".obbvvvo..", "..ooo....."];
  const fp = { o: "#1d3d78", W: "#eafcff", b: "#b4ecf9", v: "#72c3e6" };
  const fg = (rows) => sprite(rows, fp);
  const rotate = (g) => { const n2 = grid(); for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); n2.set(-y, x, c); } return n2; };
  const flipX = (g) => g.flip();
  const flipY = (g) => { const b2 = g.box(); const n2 = grid(); for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); n2.set(x, b2.y0 + b2.y1 - y, c); } return n2; };
  const MED = ["...ooooo...", "..oGggggGo.", ".oGgddddgGo", "oGgddfdddgGo".slice(0, 11), "oGdddFfdddG", "oGddfWFdddG".slice(0, 11), "oGdddFfdddG", "oGgdddddgGo", ".oGgddddgGo", "..oGggggGo.", "...ooooo..."];
  const mp = { o: "#0a0716", G: "#9c6a22", g: "#e2b04a", d: "#150f36", f: "#2a6fd6", F: "#45b4ff", W: "#ffffff" };
  const corners = [[x0 + 2, y0 + 2, 1, 1], [x1 - 2, y0 + 2, -1, 1], [x0 + 2, y1 - 2, 1, -1], [x1 - 2, y1 - 2, -1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    // 가로 깃털(테 따라) · 세로 깃털
    let h = fg(FEATHER); if (sx < 0) h = flipX(h); if (sy < 0) h = flipY(h);
    const hb = h.box(); cv.at(h, sx > 0 ? cx + 4 : cx - 4 - hb.w + 1, cy - 2);
    let v = rotate(fg(FEATHER)); if (sx < 0) v = flipX(v); if (sy < 0) v = flipY(v);
    const vb = v.box(); cv.at(v, cx - 2, sy > 0 ? cy + 4 : cy - 4 - vb.h + 1);
    cv.at(sprite(MED, mp), cx - 5, cy - 5);
  }
  // 아래 안개 자락 — 테 안쪽 아래를 따라 옅은 유령 꼬리 빛(위로 갈수록 성기게)
  for (let x = x0 + 6; x <= x1 - 6; x++) {
    const top = y1 - 6 - Math.round(2.5 + 2 * Math.sin(x / 7) + Math.sin(x / 3.1));
    for (let y = top; y <= y1 - 6; y++) {
      const t = (y - top) / Math.max(1, y1 - 6 - top);
      if (dith(x, y) > 0.25 + t * 0.6) continue;
      cv.set(x, y, t > 0.6 ? "#b4ecf9" : "#72c3e6");
    }
  }
  // 유령 펭귄(스킨 때와 같은 자리)
  const [ox, oy] = GC_SPECTRE;
  const sp = spectre();
  cv.at(sp.g, ox, oy);
  wisps(cv, [[ox - 12, oy + 4], [ox + 34, oy + 26]]);
  return cv;
}
if (process.env.BANNER === "ghostcard") {
  const dir = join(ROOT, ".claude", "mockups", "ghost-event", "cos");
  mkdirSync(dir, { recursive: true });
  await sharp(await ghostCardScene().png(3)).toFile(join(dir, "card-bg.png")); // 360 × 558
  await sharp(await ghostCardBorder().png(3, true)).toFile(join(dir, "card-border.png")); // 투명 바탕
  console.log("ghost-event/cos/card-bg.png");
  process.exit(0);
}
if (process.env.BANNER === "ghost") {
  const flat = async ({ cv, text }) => sharp(await cv.png(CELL)).composite([{ input: smoothText(cv.W, cv.H, CELL, text) }]).png({ compressionLevel: 9 }).toBuffer();
  const gp = await flat(ghostPc()), gm = await flat(ghostMobile());
  const dir = join(ROOT, ".claude", "mockups", "ghost-event");
  mkdirSync(dir, { recursive: true });
  await sharp(gp).toFile(join(dir, "ghost-invite-pc.png"));
  await sharp(gm).toFile(join(dir, "ghost-invite-mobile.png"));
  // 📌 10/14 운영자 "이대로 ㄱㄱ" — 할로윈 탭 기본 배너 네 번째(app/arctic/ArcticShopBody HW_BANNERS · 관리 상점 HW_DEFAULT_BANNERS)
  await sharp(gp).toFile(join(outDir, "ghost-invite-pc.png")); // 2400 × 600
  await sharp(gm).toFile(join(outDir, "ghost-invite-mobile.png")); // 1080 × 720
  await sharp({ create: { width: 1200 + 540 + 60, height: 400, channels: 4, background: "#f2f2f2" } })
    .composite([{ input: await sharp(gp).resize(1200, 300, { kernel: "nearest" }).toBuffer(), left: 20, top: 20 }, { input: await sharp(gm).resize(540, 360, { kernel: "nearest" }).toBuffer(), left: 1240, top: 20 }])
    .png().toFile(join(dir, "preview.png"));
  console.log("ghost-event/preview.png");
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
// 📌 2026-10-11 public/banners/halloween-pc · mobile.png 은 다른 세션이 새 디자인(할로윈 꾸미기 세트 · 최소 65% 할인 · 부채꼴 카드)으로 바꿨다 —
//    이 스크립트의 옛 HALLOWEEN 그림이 그걸 덮지 않게, 기본은 미리보기 폴더에만 쓴다. 정말 옛 그림으로 되돌릴 때만 OVERWRITE_MAIN=1
const mainDir = process.env.OVERWRITE_MAIN === "1" ? outDir : prevDir;
await sharp(pcBuf).toFile(join(mainDir, "halloween-pc.png"));
await sharp(mBuf).toFile(join(mainDir, "halloween-mobile.png"));
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
