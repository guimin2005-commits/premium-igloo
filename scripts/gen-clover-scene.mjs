// 📌 카드 배경 「바람의 클로버 언덕」(sc_clover) 그림 원본 — 친구 초대 「네잎클로버 덩굴」 한 벌 · 신화(2026-10-25 운영자 "좋다").
//    바람이 클로버 잎을 모아 마법진을 그린다: 평소(승인 판 — 바람 리본 · 잠든 수정 셋 · 잎 · 첫 별) → 모임(소용돌이 · 잎 넷 · 수정 깨어남) →
//    그림(빛 펜이 고리 · 룬 띠 · 안 고리를 한 바퀴씩) → 완성(잎이 하나씩 박혀 금빛 네잎) → 절정(번쩍 · 충격파 · 불씨 · 금빛) → 흩어짐(금가루 · 잎이 초록으로 돌아가 날아감)
//    📌 운영자 반려 이력: "신화라기에는 좀.." · "구름도 가다가 다시 원복"(구름은 끝없이 흘러야) · "느닷없이 마법진이냐 — 만들어진다거나 빌드업이 있던지"(평소엔 마법진 없음)
//    120 × 186칸(1칸 = 사이트 3px) · 한 바퀴 N = 144칸 × STEP 120ms = 17.28초. 글 자리(세 카드 배치 — PC 315 × 653 · 폰 343 × 612 · 상점 미리보기 360 × 556)는 움직이는 것도 피한다(겹침 0 — 실행 때 확인)
//    실행: node scripts/gen-clover-scene.mjs   (그림을 고치면 다시 돌리고 node scripts/gen-card-scenes.mjs 도)
//    만드는 것(public/card-scenes/):
//      sc_clover.png        멈춘 그림(360 × 558 · 칸 3px) — 움직임 줄이기 · 봇 · 서버 이미지 카드(gen-card-scenes 원본)
//      sc_clover-base.png   바탕(하늘 · 언덕 · 첫 별 — 120 × 186 · 칸 1px)
//      sc_clover-clouds.png 구름만(투명 · 칸 1px) — 사이트가 CSS 로 오른쪽으로 끝없이 흘린다(칸 하나 = CLOUD_EVERY × STEP ms)
//      sc_clover-live.webp  움직이는 겹(투명 · 칸 1px · 144칸 · STEP ms · 무한 반복)
//    겹 순서: base → clouds → live (app/components/SceneBack — meta.anim)
//    + assets/card-scenes/sc_clover-bot.png — 봇 · 서버 가로 카드 원본(scripts/gen-card-scenes.mjs). 하늘 · 구름 · 언덕만(바람 리본 · 수정 · 잎 · 별은 가로 카드 글 줄에 걸려서 뺀다)
import { createRequire } from "module";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "package.json"))("sharp");

// 글 자리 — 세 카드 배치(SceneBack 위 레벨 카드 · 인벤토리 장착 판 · 상점 미리보기)를 장면 좌표(360 × 558 px)로 옮긴 네모
//   kind: "white"(흰 글) · "label"(옅은 글 45~50%) · "ui"(링 · 칩 · 막대 · 아이콘 칸)
const LAYS = {
  pc: { w: 315, px: 28, ring: [76, 76, 44], name: [144, 66], chips: [144, 83], level: 189, num: 250, tierY: 269, bar: 336, xp: 367, icons: [394, 468], stats: [504, 570], col2: 174 },
  phone: { w: 343, px: 26, ring: [69, 63, 40], name: [128, 51], chips: [128, 65], level: 163, num: 217, tierY: 236, bar: 303, xp: 334, icons: [361, 435], stats: [471, 537], col2: 172 },
  preview: { w: 360, px: 28, ring: [76, 76, 44], name: [144, 66], chips: [144, 83], level: 189, num: 250, tierY: 269, bar: 336, xp: 367, icons: null, stats: [406, 472], col2: 196 },
};
export function textRects() {
  const out = [];
  for (const [k, L] of Object.entries(LAYS)) {
    const s = L.w / 360, R = L.w - L.px;
    const add = (name, kind, op, x0, y0, x1, y1) => {
      const r = { k, name, kind, op, x0: x0 / s, y0: y0 / s, x1: x1 / s, y1: y1 / s };
      if (r.y0 < 558) out.push({ ...r, y1: Math.min(557, r.y1), x0: Math.max(0, r.x0), x1: Math.min(359, r.x1) });
    };
    const [cx, cy, r] = L.ring;
    add("ring", "ui", 1, cx - r - 3, cy - r - 3, cx + r + 3, cy + r + 3);
    add("name", "white", 1, L.name[0], L.name[1] - 17, L.name[0] + 70, L.name[1] + 2);
    add("chips", "ui", 1, L.chips[0], L.chips[1], L.chips[0] + 158, L.chips[1] + 24);
    add("LEVEL", "label", 0.5, L.px, L.level - 8, L.px + 62, L.level + 1);
    add("num", "white", 1, L.px - 2, L.num - 44, L.px + 112, L.num + 1);
    add("num4", "white", 1, L.px + 112, L.num - 44, L.px + 150, L.num + 1); // 네 자리 레벨
    add("emblem", "ui", 1, L.px - 8, L.tierY - 4, L.px + 40, L.tierY + 44);
    add("tier", "white", 1, L.px + 44, L.tierY + 2, L.px + 76, L.tierY + 17);
    add("tierSub", "label", 0.5, L.px + 44, L.tierY + 28, L.px + 180, L.tierY + 39);
    add("bar", "ui", 1, L.px, L.bar - 1, R, L.bar + 13);
    add("xpL", "label", 0.5, L.px, L.xp - 9, L.px + 112, L.xp + 2);
    add("xpR", "label", 0.5, R - 108, L.xp - 9, R, L.xp + 2);
    if (L.icons) add("icons", "ui", 1, L.px, L.icons[0], R, L.icons[1]);
    L.stats.forEach((y, i) => [L.px, L.col2].forEach((x, j) => {
      add(`stat${i}${j}L`, "label", 0.45, x, y + 3, x + 112, y + 15);
      add(`stat${i}${j}V`, "white", 1, x, y + 23, x + 126, y + 40);
    }));
  }
  return out;
}

export const W = 120, H = 186, CELL = 3, N = 144, STEP = 120;
export const STILL = 0; // 멈춘 그림에 쓰는 칸
export const CLOUD_EVERY = 6; // 구름 한 칸 흐르는 데 걸리는 칸 수(6 × 120ms = 0.72초 → 120칸 한 바퀴 86.4초 = 다섯 바퀴 — 끊김 없이 이어짐)

// ───────── 색(바탕 · 리본 · 수정은 10/25 승인 시안 「바람의 클로버 언덕」 그대로) ─────────
const SKY = ["#080b1d", "#0e142d", "#161b3c", "#212248", "#2c2649", "#382a47", "#44304a"];
const SKY_AT = [0, 20, 46, 72, 94, 110, 119];
const CLOUD = { top: "#20214a", body: "#262650", lit: "#342b55", rose: "#5a3b64" };
const FAR2 = { body: "#272b4a", rim: "#3a3a5e" };
const FAR = { body: "#1c2140", rim: "#2c3152" };
const MID = { body: "#0f2026", lit: "#13282d", rim: "#24454a", dim: "#18323a", deep: "#0e1d22" };
const NEAR = ["#0d1b1e", "#10221f", "#142a25", "#19332b", "#224032", "#2f5b41"];
export const FOOT = NEAR[0];
export const BG = "#0e142d";
const ARC = { line: "#2e3d6e", out: "#3a4c80", in: "#4f6a9c", rune: "#9fd8c8" };
const SHARD = { o: "#142f3c", D: "#1d5560", M: "#2e8a82", L: "#50b496", S: "#e2fff4" };
const SHARD_FL = { o: "#2e8a82", D: "#50b496", M: "#9fe8cc", L: "#e2fff4", S: "#ffffff" }; // 터질 때 한 번 하얗게
const WIND = ["#222c58", "#2f4374", "#456592", "#6f9cbc", "#b4e2d6"];
const WIND_TOP = "#e9fff8";
const LEAF = { o: "#0f2a24", D: "#1f5038", G: "#2f7046", H: "#5fae64", r: "#173a2c" };
const LEAF_BACK = { o: "#0f2a24", D: "#1f5038", G: "#2a6440", H: "#4a9a56", r: "#173a2c" }; // 뒤집힌 면(빛 칸만 한 톤 낮게 — 어둡게 하면 박쥐처럼 보임)
const GOLD = { o: "#5c3a0c", D: "#c27a1a", M: "#f2b134", L: "#ffe27a", H: "#fff6c8" };

// ───────── 칸 그림판(겹마다 따로) ─────────
const layer = () => new Array(W * H).fill(null);
let cur = null;
const paintOn = (l) => (cur = l);
const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < W && y < H) cur[y * W + x] = c; };
const get = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? cur[y * W + x] : null);
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
const sprite = (rows, pal, x0, y0, ok = () => true) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch] && ok(x0 + x, y0 + y)) set(x0 + x, y0 + y, pal[ch]); }));
const K = (x, y) => x + "," + y;
const mirror = (rows) => rows.map((r) => [...r].reverse().join(""));

// 글 자리 — 세 카드 배치(PC · 폰 · 상점 미리보기)를 장면 칸으로. TEXT: 흰 글 · 옅은 글(멈춘 장식이 피함) · AVOID: + 링 · 칩 · 막대 · 아이콘 칸(움직이는 것이 피함)
function maskOf(kinds, pad) {
  const m = new Uint8Array(W * H);
  for (const r of textRects()) {
    if (!kinds.includes(r.kind)) continue;
    const x0 = Math.max(0, Math.floor((r.x0 - pad) / CELL)), x1 = Math.min(W - 1, Math.floor((r.x1 + pad) / CELL));
    const y0 = Math.max(0, Math.floor((r.y0 - pad) / CELL)), y1 = Math.min(H - 1, Math.floor((r.y1 + pad) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  }
  return m;
}
export const TEXT = maskOf(["white", "label"], 3);
export const AVOID = maskOf(["white", "label", "ui"], 3);
const inText = (x, y) => x < 0 || y < 0 || x >= W || y >= H || TEXT[y * W + x] === 1;
const avoid = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H && AVOID[y * W + x] === 1; };
const free = (x, y) => !avoid(x, y);

// ───────── 곡선 → 1칸 선 ─────────
function catmull(pts, step = 0.004) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let t = 0; t < 1; t += step) {
      const t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function cells(path) {
  const c = [];
  for (const [x, y] of path) { const p = [Math.round(x), Math.round(y)]; const l = c[c.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) c.push(p); }
  const f = [c[0]];
  for (let i = 1; i < c.length; i++) {
    let [x, y] = f[f.length - 1]; const [tx, ty] = c[i];
    while (Math.abs(tx - x) > 1 || Math.abs(ty - y) > 1) { x += Math.sign(tx - x); y += Math.sign(ty - y); f.push([x, y]); }
    f.push([tx, ty]);
  }
  const o = [f[0]];
  for (let i = 1; i < f.length - 1; i++) {
    const a = o[o.length - 1], d = f[i + 1];
    if (Math.abs(a[0] - d[0]) === 1 && Math.abs(a[1] - d[1]) === 1) continue;
    o.push(f[i]);
  }
  o.push(f[f.length - 1]);
  return o;
}
// 곡선 위 u(0~1) 자리 — 길이 기준
function along(pts) {
  const p = catmull(pts, 0.01), d = [0];
  for (let i = 1; i < p.length; i++) d.push(d[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const L = d[d.length - 1];
  return (u) => {
    const t = Math.max(0, Math.min(1, u)) * L;
    let i = 1; while (i < d.length - 1 && d[i] < t) i++;
    const k = (t - d[i - 1]) / Math.max(1e-9, d[i] - d[i - 1]);
    return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k];
  };
}

// ═════════ base — 하늘 · 언덕 · 결 · 땅 마무리(승인 판 그대로) ═════════
const skyW = (y) => Math.max(0, Math.min(1, (108 - y) / 46));
const skyT = (x, y) => y + 0.035 * (x - 60) + skyW(y) * (0.12 * (x - 60) + 2.4 * Math.sin((x + 0.8 * y) / 14 + 0.7));
function skyAt(x, y) {
  const t = skyT(x, y);
  let i = 0; while (i + 1 < SKY_AT.length && t >= SKY_AT[i + 1]) i++;
  let c = SKY[i];
  const nx = SKY_AT[i + 1];
  if (nx != null && t >= nx - 3) { const z = Math.floor(t - (nx - 3)); if (dith(x, y) < [0.25, 0.5, 0.75][z]) c = SKY[i + 1]; }
  return c;
}
function cloud({ x0, x1, yb, steps, lobes, dropL = [] }) {
  const m = new Map(), bot = new Map();
  let b = yb, si = 0, run = 0;
  for (let x = x0; x <= x1; x++) { bot.set(x, b); run++; if (si < steps.length && run >= steps[si]) { b--; si++; run = 0; } }
  dropL.forEach((n) => { for (let x = x0; x < x0 + n; x++) bot.set(x, bot.get(x) + 1); });
  const owner = new Map();
  for (let x = x0; x <= x1; x++) {
    let h = -1, who = -1;
    lobes.forEach(([cx, wl, wr, hh], li) => {
      const u = (x - cx) / (x < cx ? wl : wr);
      if (Math.abs(u) <= 1) { const v = Math.round(hh * Math.sqrt(1 - u * u) - 0.2); if (v > h) { h = v; who = li; } }
    });
    if (h < 0) continue;
    owner.set(x, who);
    const by = bot.get(x);
    for (let y = by - h; y <= by; y++) m.set(K(x, y), by);
  }
  for (const [k, by] of m) {
    const [x, y] = k.split(",").map(Number);
    const d = by - y;
    const [cx, wl, wr] = lobes[owner.get(x)];
    const u = (x - cx) / (x < cx ? wl : wr);
    let c = CLOUD.body;
    if (!m.has(K(x, y - 1))) c = CLOUD.top;
    else if (d === 0) c = Math.abs(u) < 0.62 ? CLOUD.rose : CLOUD.lit;
    else if (d === 1) c = CLOUD.lit;
    else if (d === 2 && dith(x, y) < 0.5) c = CLOUD.lit;
    // 구름은 가로로 이어 붙는 띠(사이트에서 흘러감) — 왼쪽 밖 칸은 오른쪽 끝으로 돈다
    set(((x % W) + W) % W, y, c);
  }
}
const far2Y = (x) => 122 + Math.round(2.2 * Math.sin(x / 14 + 2.4) + 1.0 * Math.sin(x / 5.3 + 0.3));
const farY = (x) => 128 + Math.round(2.6 * Math.sin(x / 10 + 0.4) + 1.0 * Math.sin(x / 4.4 + 1.1) - 0.03 * x);
const midY = (x) => 133 + Math.round(0.8 * Math.sin(x / 7 + 1.2) + (x > 48 ? ((x - 48) / 5.6) ** 2 : 0));
const nearY = (x) => Math.round(190 - 70 * Math.pow(Math.max(0, x) / 120, 1.45) + 0.8 * Math.sin(x / 7 + 0.4));
function ridge(fy, body, rim) { for (let x = 0; x < W; x++) { const t = fy(x); for (let y = t; y < H; y++) set(x, y, body); set(x, t, rim); } }
function hills() {
  ridge(far2Y, FAR2.body, FAR2.rim);
  ridge(farY, FAR.body, FAR.rim);
  for (let x = 0; x < W; x++) {
    const t = midY(x);
    if (t >= H) continue;
    for (let y = t; y < H; y++) { const d = y - t; let c = MID.body; if (d <= 2) c = MID.lit; else if (d <= 4 && dith(x, y) < (d === 3 ? 0.5 : 0.25)) c = MID.lit; set(x, y, c); }
    set(x, t, inText(x, t) ? MID.dim : MID.rim);
  }
  const bands = [[0, 4], [2, 3], [8, 2], [20, 1], [34, 0]];
  for (let x = 0; x < W; x++) {
    const t = nearY(x);
    for (let y = Math.max(0, t); y < H; y++) {
      const d = y - t;
      let lv = 0;
      for (const [dd, l] of bands) if (d >= dd) lv = l;
      if (d === 0) lv = inText(x, y) || inText(x, y - 1) ? 3 : x >= 96 ? 5 : 4;
      if (d === 1 && inText(x, y)) lv = 3;
      let c = NEAR[lv];
      for (const [dd, l] of bands.slice(2)) if (d === dd || d === dd + 1) { const up = Math.min(5, l + 1); if (dith(x, y) < (d === dd ? 0.5 : 0.25)) c = NEAR[up]; }
      set(x, y, c);
    }
  }
}
function cloverMarks() {
  const g = ["x.x", ".x."];
  for (let x = 92; x < W - 6; x += 5) for (const d of [3, 7]) {
    const jx = x + (d === 7 ? 2 : 0), y = nearY(jx + 1) + d;
    let ok = true;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if (inText(jx + i, y + j)) ok = false;
    if (!ok) continue;
    const lv = NEAR.indexOf(get(jx + 1, y));
    if (lv < 2 || lv > 4) continue;
    sprite(g, { x: NEAR[lv + 1] }, jx, y);
  }
}
const DARKER = new Map([
  [NEAR[5], NEAR[4]], [NEAR[4], NEAR[3]], [NEAR[3], NEAR[2]], [NEAR[2], NEAR[1]], [NEAR[1], NEAR[0]],
  [MID.rim, MID.lit], [MID.dim, MID.lit], [MID.lit, MID.body], [MID.body, MID.deep], [MID.deep, FOOT],
]);
const darker = (c, k) => { for (let i = 0; i < k && DARKER.has(c); i++) c = DARKER.get(c); return c; };
function groundFade() {
  const top = H - 24;
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) {
    const r = y - top, k = Math.floor(r / 4) + 1, inEdge = r % 4 < 2;
    set(x, y, darker(get(x, y), inEdge && dith(x, y) >= 0.5 ? k - 1 : k));
  }
}
export const BASE = layer();
paintOn(BASE);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, skyAt(x, y));
hills();
cloverMarks();
groundFade();
for (let x = 0; x < W; x++) set(x, H - 1, FOOT);
set(80, 45, "#6f6cb4"); // 첫 저녁별

export const CLOUDS = layer();
paintOn(CLOUDS);
cloud({ x0: -3, x1: 33, yb: 52, steps: [11, 7, 5, 4, 3], lobes: [[3, 7, 6, 4], [14, 7, 8, 6], [26, 6, 6, 4]], dropL: [6] });
cloud({ x0: 38, x1: 72, yb: 57, steps: [12, 8, 6, 4, 3], lobes: [[44, 6, 6, 4], [55, 7, 9, 7], [66, 5, 5, 4]], dropL: [5] });

// ═════════ fg(f) — 신화 판 v3: 바람이 클로버 잎을 모아 마법진을 그린다 ═════════
//   평소(0~55 · 128~143): 승인 판 그대로 — 바람 리본 둘 · 잠든 수정 셋(둥실 · 반짝) · 잎 둘 · 첫 별 · 풀 흔들림(마법진 없음)
//   모임(56~71): 리본이 걷히고 소용돌이 줄기가 생김 · 클로버 잎 넷이 왼쪽 틈으로 날아 들어와 소용돌이를 탐 · 수정이 깨어나 궤도로 · 금빛 가루가 오름
//   그림(72~87): 빛 펜이 바깥 고리 → 점선 → 룬 띠(거꾸로) → 안 고리 → 살 차례로 한 바퀴씩 그음 · 마디가 하나씩 켜짐
//   완성(88~95): 소용돌이 잎이 하나씩 가운데 자리에 박히며 금빛 하트 잎으로 → 금빛 네잎
//   절정(96~107): 번쩍 · 별 터짐 · 충격파 · 불씨 · 마법진 전체 금빛
//   흩어짐(108~127): 고리가 왼쪽부터 시계로 금가루가 되어 바람에 날림 · 금빛 잎 넷은 초록 잎으로 돌아가 구르며 오른쪽으로 · 수정은 제자리로 · 리본이 돌아옴
const md = (a, m) => ((a % m) + m) % m;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
const T = { gather: 56, draw: 72, lock: 88, flash: 96, hold: 107, dis: 108, disEnd: 123, back: 128 };
const C = [88, 62];
const R1 = 20, R1B = 22, R2 = 17, R3 = 14, R4 = 9;
const polar = (a, r, c = C) => [c[0] + Math.cos((a * Math.PI) / 180) * r, c[1] + Math.sin((a * Math.PI) / 180) * r];
const angOf = ([x, y], c = C) => ((Math.atan2(y - c[1], x - c[0]) * 180) / Math.PI + 360) % 360;
function ring(r, c = C) {
  const pts = [];
  for (let i = 0; i <= 1440; i++) pts.push(polar(270 + (360 * i) / 1440, r, c));
  const cs = cells(pts);
  const a = cs[0], b = cs[cs.length - 1];
  if (cs.length > 1 && a[0] === b[0] && a[1] === b[1]) cs.pop();
  return cs.map((p) => [p[0], p[1], angOf(p)]);
}
const RING1 = ring(R1), RING1B = ring(R1B), RING2 = ring(R2), RING3 = ring(R3), RING4 = ring(R4);

const RJ = { line: "#2a6f6a", dim: "#1a4a4c", tick: "#9fe8cc", glyph: "#50b496", glyphHi: "#c8fff0", seg: "#2e8a82", node: "#2e8a82", nodeHi: "#e2fff4" };
const RG = { line: "#c27a1a", dim: "#8f5512", tick: "#fff6c8", glyph: "#f2b134", glyphHi: "#fff6c8", seg: "#c27a1a", node: "#f2b134", nodeHi: "#ffffff" };
const RF = { line: "#ffe27a", dim: "#f2b134", tick: "#ffffff", glyph: "#fff6c8", glyphHi: "#ffffff", seg: "#ffe27a", node: "#fff6c8", nodeHi: "#ffffff" };
const SHARD_DIM = { o: "#0f2630", D: "#163f48", M: "#1d5560", L: "#2e8a82", S: "#9fd8c8" };
const pal = (f) => (f === T.flash ? RF : f > T.flash ? RG : RJ);

// ── 마법진 고리 — 그려지는 때(start · dur · 방향) · 흩어짐(왼쪽 180°부터 시계로) ──
//    dir 1: 꼭대기(270°)에서 시계 · -1: 거꾸로
const DRAW = { r1: [72, 6, 1], r1b: [74, 6, 1], r2: [76, 6, -1], r3: [78, 6, 1], r4: [80, 4, 1] };
const progOf = (a, dir) => (dir > 0 ? md(a - 270, 360) : md(270 - a, 360));
const disP = (f) => clamp01((f - T.dis) / (T.disEnd - T.dis)) * 360; // 흩어진 각도(180°부터 시계)
function shown(key, a, f) {
  const [s, d, dir] = DRAW[key];
  if (f < s || f >= T.disEnd) return false;
  if (f < s + d && progOf(a, dir) > ((f - s + 1) / d) * 360) return false;
  if (f >= T.dis && md(a - 180, 360) <= disP(f)) return false;
  return true;
}
// 펜 끝(그리는 중인 고리의 앞 끝 각도)
const penOf = (key, f) => { const [s, d, dir] = DRAW[key]; if (f < s || f >= s + d) return null; return md(270 + dir * ((f - s + 1) / d) * 360, 360); };

const NODES = [270, 0, 90, 180].map((a) => polar(a, R3).map(Math.round));
const nearNode = (x, y) => NODES.some(([nx, ny]) => Math.abs(nx - x) <= 1 && Math.abs(ny - y) <= 1);
const ok = (x, y) => free(x, y) && !inText(x, y) && y <= 112;

function magic(f) {
  if (f < T.draw || f >= T.disEnd) return;
  const P = pal(f);
  const put = (x, y, key) => { if (ok(x, y)) set(x, y, P[key]); };
  const t1 = Math.floor(f / 3), t2 = Math.floor(f / 2);
  RING1.forEach(([x, y, a], i) => { if (shown("r1", a, f)) put(x, y, md(i - t1, 8) === 0 ? "tick" : "line"); });
  RING1B.forEach(([x, y, a], i) => { if (i % 2 === 0 && shown("r1b", a, f)) put(x, y, "dim"); });
  RING2.forEach(([x, y, a], i) => {
    if (!shown("r2", a, f)) return;
    const k = md(i + t2, 12);
    if (k === 0) for (const r of [R2 - 1, R2, R2 + 1]) { const [px, py] = polar(a, r).map(Math.round); put(px, py, r === R2 ? "glyphHi" : "glyph"); }
    else if (k === 4) put(x, y, "glyphHi");
    else if (k === 7 || k === 8) put(x, y, "seg");
  });
  RING3.forEach(([x, y, a]) => { if (!nearNode(x, y) && shown("r3", a, f)) put(x, y, "dim"); });
  RING4.forEach(([x, y, a], i) => { if (i % 2 === 0 && shown("r4", a, f)) put(x, y, "dim"); });
  for (const a of [0, 90, 180, 270]) if (shown("r4", a, f)) for (let r = R4 + 2; r < R3 - 1; r += 2) { const [px, py] = polar(a, r).map(Math.round); put(px, py, "seg"); }
  // 마디 — 84칸부터 하나씩 켜짐(시계) · 흩어질 때 고리와 같이 사라짐
  NODES.forEach(([x, y], j) => {
    const a = [270, 0, 90, 180][j];
    if (f < 84 + j || !shown("r3", a, f)) return;
    const hot = f <= 84 + j + 1 || f === T.flash;
    for (const [dx, dy] of [[0, -2], [1, -1], [2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1]]) put(x + dx, y + dy, hot ? "nodeHi" : "glyph");
    put(x, y, hot ? "tick" : "nodeHi");
  });
  // 빛 펜 — 그리는 고리 앞 끝에 흰 십자 + 지나온 두 칸
  for (const [key, r] of [["r1", R1], ["r1b", R1B], ["r2", R2], ["r3", R3], ["r4", R4]]) {
    const a = penOf(key, f);
    if (a == null) continue;
    const dir = DRAW[key][2];
    for (const back of [6, 3]) { const [px, py] = polar(a - dir * back, r).map(Math.round); if (ok(px, py)) set(px, py, RJ.tick); }
    const [px, py] = polar(a, r).map(Math.round);
    if (ok(px, py)) set(px, py, "#ffffff");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(px + dx, py + dy)) set(px + dx, py + dy, RJ.nodeHi);
  }
}
// 흩어지는 금가루 — 막 사라진 고리 칸(5칸에 하나)이 바람(오른쪽 위)에 실려 9칸 동안
const DUST = (() => {
  const out = [];
  for (let s = T.dis; s <= T.disEnd; s++) {
    const p0 = disP(s - 1), p1 = disP(s);
    [RING1, RING2, RING3].forEach((R, ri) => R.forEach(([x, y, a], i) => { const d = md(a - 180, 360); if (d > p0 && d <= p1 && (i + ri) % 5 === 0) out.push({ s, x, y, i }); }));
  }
  return out;
})();
function dust(f) {
  for (const p of DUST) {
    const k = f - p.s;
    if (k < 0 || k > 9) continue;
    if (k >= 7 && k % 2) continue;
    const x = Math.round(p.x + k * 1.1 + Math.sin(k / 2 + p.i) * 0.8), y = Math.round(p.y - k * 0.5 - (p.i % 3) * 0.3 * k);
    if (!ok(x, y)) continue;
    set(x, y, k < 3 ? GOLD.L : k < 6 ? GOLD.M : "#8fd46a");
  }
}

// ── 네잎(완성) — 하트 잎 넷 13 × 13 ──
const HEART = [".oo.oo.", "oHLDLLo", "oLLLLMo", ".oLLMo.", "..oMo..", "...M..."];
const rot90 = (rows) => rows[0].split("").map((_, i) => rows.map((r) => r[i]).reverse().join(""));
const SLOTS = [[HEART, 3, 0], [rot90(HEART), 7, 3], [rot90(rot90(HEART)), 3, 7], [rot90(rot90(rot90(HEART))), 0, 3]]; // 위 · 오른쪽 · 아래 · 왼쪽(문장 왼쪽 위 칸 기준)
const SX = C[0] - 6, SY = C[1] - 6;
const slotCenter = (j) => { const [rows, dx, dy] = SLOTS[j]; return [SX + dx + Math.floor(rows[0].length / 2), SY + dy + Math.floor(rows.length / 2)]; };
const CORE = [[6, 6, "H"], [7, 7, "M"], [8, 8, "M"], [9, 9, "D"], [10, 10, "D"], [11, 10, "D"]]; // 가운데 · 줄기
const LEAF_GREEN = { o: "#0f2a24", H: "#c8f2a0", L: "#8fd46a", M: "#5aa83e", D: "#2f7046" }; // 소용돌이 · 흩어지는 잎(테두리 덤불 잎처럼 밝게)
const LEAF_GREEN_S = { o: "#0f2a24", H: "#c8f2a0", G: "#6cc24a", r: "#2f7046", D: "#3f8a35" };

// ── 소용돌이 잎 넷 — 왼쪽 틈(48줄)으로 날아 들어와 → 납작한 소용돌이(세로 0.6)를 감아 돌며 안으로 → 제자리에 박힘 ──
const SQ = 0.6;
const VC = [88, 65]; // 소용돌이 가운데(마법진보다 세 줄 아래 — 납작한 소용돌이 꼭대기가 칩 줄에 닿지 않게)
const ENTRY = [62, 50]; // 잎 가운데 — 틈(48~52줄)에 잎 다섯 줄이 꼭 맞게
const LEAF_S = ["..oo", ".oHo", "oGro", "orDo", "r.o."];
const LEAF_S_EDGE = ["...o", ".oHo", "oro.", "r..."];
const LEAF_S_POSES = [LEAF_S, LEAF_S_EDGE, mirror(LEAF_S), mirror(LEAF_S_EDGE)];
const IN = (j) => [T.gather + 3 * j, T.gather + 10 + 3 * j]; // 틈 지나는 칸
const ARRIVE = (j) => T.lock + 2 + j; // 박히는 칸(90 · 91 · 92 · 93)
export function swirlLeafAt(j, f) {
  const [a, b] = IN(j), e = ARRIVE(j);
  if (f < a || f >= e) return null;
  let x, y;
  if (f <= b) { const u = (f - a) / (b - a); x = -8 + (ENTRY[0] + 8) * u; y = ENTRY[1]; }
  else {
    const u = ease((f - b) / (e - b));
    const [sx, sy] = slotCenter(j);
    const a0 = angOf([ENTRY[0], ENTRY[1]], VC), r0 = Math.hypot(ENTRY[0] - VC[0], (ENTRY[1] - VC[1]) / SQ);
    const a1 = angOf([sx, sy], VC), r1 = Math.hypot(sx - VC[0], sy - VC[1]);
    let da = md(a1 - a0, 360); if (da < 200) da += 360;
    const ang = ((a0 + da * u) * Math.PI) / 180, r = r0 + (r1 - r0) * u, sq = SQ + (1 - SQ) * u;
    x = VC[0] + Math.cos(ang) * r; y = VC[1] + Math.sin(ang) * r * sq;
  }
  // 틈 · 소용돌이 바깥(반지름 26 넘게)은 작은 잎(5 × 5), 안쪽은 제자리와 같은 하트 잎이 90°씩 구르며(2칸마다) — 박힐 때 그 꼴 그대로
  const rNow = Math.hypot(x - VC[0], (y - VC[1]) / SQ);
  if (f <= b || rNow > 26) { const g = LEAF_S_POSES[Math.floor(f / 2) % 4]; return { g, pal: LEAF_GREEN_S, x: Math.round(x) - 2, y: Math.round(y) - 2 }; }
  let g = SLOTS[j][0];
  const turns = md(Math.floor((e - f) / 2), 4); // 박히는 칸에 제 방향이 되게 거꾸로 셈
  for (let t = 0; t < turns; t++) g = rot90(g);
  return { g, pal: LEAF_GREEN, x: Math.round(x) - Math.floor(g[0].length / 2), y: Math.round(y) - Math.floor(g.length / 2) };
}
function swirlLeaves(f) {
  for (let j = 0; j < 4; j++) { const p = swirlLeafAt(j, f); if (p) sprite(p.g, p.pal, p.x, p.y, free); }
}
// 박힌 잎 · 가운데 · 흩어지는 잎
function clover(f) {
  // 박힌 잎(ARRIVE ~ 흩어짐 전) — 박히는 칸은 흰빛, 그 뒤 금빛(번쩍 칸은 밝게)
  for (let j = 0; j < 4; j++) {
    const e = ARRIVE(j);
    if (f < e || f >= T.dis + 2) continue;
    const [rows, dx, dy] = SLOTS[j];
    const P = f === e ? { o: GOLD.L, H: "#ffffff", L: "#ffffff", M: GOLD.H, D: GOLD.H } : f === T.flash ? { o: GOLD.M, H: "#ffffff", L: GOLD.H, M: GOLD.H, D: GOLD.L } : GOLD;
    sprite(rows, P, SX + dx, SY + dy, free);
  }
  if (f >= T.lock + 6 && f < T.dis + 2) CORE.forEach(([x, y, c]) => { if (free(SX + x, SY + y)) set(SX + x, SY + y, f === T.lock + 6 || f === T.flash ? "#ffffff" : GOLD[c]); });
  // 흩어짐 — 잎마다 구르며(90°씩) 오른쪽으로 · 116칸부터 초록 잎으로
  const VEL = [[1.5, -0.35], [1.9, 0.1], [1.4, 0.35], [1.1, -0.15]];
  for (let j = 0; j < 4; j++) {
    const k = f - (T.dis + 2);
    if (k < 0 || k > 16) continue;
    const [cx, cy] = slotCenter(j);
    let rows = SLOTS[j][0];
    for (let r = 0; r < Math.floor(k / 3) % 4; r++) rows = rot90(rows);
    const x = Math.round(cx + VEL[j][0] * k + 0.04 * k * k) - Math.floor(rows[0].length / 2), y = Math.round(cy + VEL[j][1] * k - 0.03 * k * k) - Math.floor(rows.length / 2);
    if (k >= 14 && k % 2) continue;
    sprite(rows, f >= 116 ? LEAF_GREEN : GOLD, x, y, (px, py) => free(px, py) && !inText(px, py));
  }
}

// ── 소용돌이 줄기 — 60~87칸, 다섯 줄기가 납작한 소용돌이를 시계로 감으며 안으로 ──
function vortex(f) {
  const k = f - 60;
  if (k < 0 || f > 87) return;
  const r = 30 - k * 0.4, len = f < 63 ? 10 + k * 6 : f > 83 ? 30 - (f - 83) * 7 : 30;
  for (let i = 0; i < 5; i++) {
    const head = i * 72 + k * 14;
    for (let d = 0; d <= len; d += 1.5) {
      const a = head - d, rr = r + d * 0.06;
      const [x, y] = [Math.round(VC[0] + Math.cos((a * Math.PI) / 180) * rr), Math.round(VC[1] + Math.sin((a * Math.PI) / 180) * rr * SQ)];
      if (!ok(x, y)) continue;
      if (d > len * 0.6 && Math.floor(d) % 3 === 2) continue;
      set(x, y, d < 2 ? WIND_TOP : d < 6 ? WIND[4] : d < 14 ? WIND[3] : d < 22 ? WIND[2] : WIND[1]);
    }
  }
}

// ── 바람 리본(승인 판 그대로 · 마법진 MC 둘레) — 모일 때 걷히고 흩어진 뒤 돌아옴 ──
const MC = [110, 98];
const orbit = (pairs) => pairs.map(([a, r]) => polar(a, r, MC));
const RIBBONS = [
  { cs: cells(catmull(orbit([[188, 47.5], [194, 46], [200, 45], [208, 44], [220, 44], [232, 44], [244, 44.5], [251, 45], [255, 45.5]]))), gaps: [4, 2], dim: 0, pulse: 12 },
  { cs: cells(catmull(orbit([[208, 52], [219, 51], [230, 51], [238, 51.5], [243, 52]]))), gaps: [2, 2], dim: 1, pulse: 36 },
];
const ribVis = (f) => (f < 60 ? 1 : f < 68 ? 1 - (f - 59) / 8 : f < 120 ? 0 : f < 128 ? (f - 119) / 8 : 1);
function ribbon({ cs, gaps, dim, pulse }, f) {
  const vis = ribVis(f);
  if (vis <= 0) return;
  const n = cs.length, per = gaps[0] + gaps[1], shift = Math.floor(f / 2);
  const pk = f - pulse, ph = pk >= 0 && pk < 14 ? Math.round(0.3 * n + ((n - 1 - 0.3 * n) * pk) / 13) : -99;
  const main = [];
  cs.forEach(([x, y], i) => {
    const s = i / (n - 1);
    if (s < 0.42 && md(i - shift, per) >= gaps[0]) return;
    if (vis < 1 && dith(x, y) >= vis) return;
    let c = s > 0.97 ? WIND[4] : s > 0.8 ? WIND[3] : s > 0.58 ? WIND[2] : s > 0.3 ? WIND[1] : WIND[0];
    if (dim && c === WIND[4]) c = WIND[3];
    if (dim && s < 0.8) c = WIND[Math.max(0, WIND.indexOf(c) - 1)];
    if (i <= ph && i > ph - 3) c = c === WIND[4] ? WIND_TOP : WIND[Math.min(4, WIND.indexOf(c) + 2)];
    if (inText(x, y) && c !== WIND[0]) c = WIND[0];
    main.push([x, y, c, i, s]);
  });
  for (const [x, y, c, i, s] of main) {
    if (s <= 0.62 || i >= n - 3) continue;
    const [ax, ay] = cs[Math.max(0, i - 2)], [bx, by] = cs[Math.min(n - 1, i + 2)];
    const [ox, oy] = Math.abs(bx - ax) >= Math.abs(by - ay) ? [0, 1] : [1, 0];
    set(x + ox, y + oy, WIND[Math.max(0, WIND.indexOf(c) - 1)]);
  }
  for (const [x, y, c] of main) set(x, y, c);
}

// ── 수정 셋 — 잠든 자리(승인 판) ↔ 궤도(가로 22 · 세로 7, 앞은 그대로 · 뒤는 어둡게 고리 뒤로) ──
const SHARD_L = ["....o.", "...oSo", "..oLLo", "..oLMDo", ".oLLMDo", ".oLMDo.", "oLMDDo.", "oMDDo..", ".ooo..."];
const SHARD_M = ["...o", "..oSo", ".oLMo", ".oLDo", "oLMDo", "oMDo.", ".oo.."];
const SHARD_S = ["..o", ".oSo", "oLDo", "oMo.", ".o.."];
const CRYST = [
  { g: SHARD_L, home: polar(204, 25, MC), ph: 0, tw: 20, th0: 150 },
  { g: SHARD_M, home: polar(228, 36, MC), ph: 15, tw: 44, th0: 270 },
  { g: SHARD_S, home: polar(264, 36, MC), ph: 31, tw: 36, th0: 30 },
];
const ORB = { rx: 22, ry: 7, spd: 4 };
export function crystalAt(j, f) {
  const c = CRYST[j];
  const bob = md(f + c.ph, 48) >= 16 && md(f + c.ph, 48) < 40 ? -1 : 0;
  const th = c.th0 + (f - 64) * ORB.spd, t = (th * Math.PI) / 180;
  const ox = C[0] + Math.cos(t) * ORB.rx, oy = C[1] + Math.sin(t) * ORB.ry;
  const w = f < 64 || f >= 132 ? 0 : f < 76 ? ease((f - 64) / 12) : f < 116 ? 1 : 1 - ease((f - 116) / 16);
  const [hx, hy] = c.home;
  const x = hx + (ox - hx) * w, y = hy + (oy - hy) * w + (w < 1 ? bob : 0);
  const front = w < 0.5 || Math.sin(t) >= 0;
  return { g: c.g, x: Math.round(x) - Math.floor(c.g[0].length / 2), y: Math.round(y) - Math.floor(c.g.length / 2), front, w };
}
function crystals(f, front) {
  for (let j = 0; j < 3; j++) {
    const c = crystalAt(j, f);
    if (c.front !== front) continue;
    const flash = f === T.flash || f === T.flash + 1 || f === 64;
    sprite(c.g, flash ? SHARD_FL : front ? SHARD : SHARD_DIM, c.x, c.y, free);
    const k = f - CRYST[j].tw;
    if (front && k >= 0 && k < 3) {
      const sy = c.g.findIndex((r) => r.includes("S")), sx = c.g[sy].indexOf("S"), px = c.x + sx, py = c.y + sy;
      set(px, py, "#ffffff");
      for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 1; d <= (k === 1 ? 2 : 1); d++) if (free(px + ux * d, py + uy * d)) set(px + ux * d, py + uy * d, d === 1 ? SHARD.S : ARC.rune);
    }
  }
}

// ── 금빛 가루 — 모임 ~ 절정(64~110) 동안 아래에서 떠올라 소용돌이 쪽으로 ──
const MOTES = Array.from({ length: 12 }, (_, i) => ({ x: 72 + ((i * 29) % 44), t0: (i * 17) % 48, sp: 0.8 + (i % 3) * 0.2, amp: 1 + (i % 2), tw: i % 4 === 0 }));
function motes(f) {
  if (f < 64 || f > 110) return;
  for (const m of MOTES) {
    const k = md(f - m.t0, 48), y = Math.round(100 - k * m.sp);
    if (y < 40 || (f < 70 && k > (f - 64) * 3)) continue;
    const x = m.x + Math.round(Math.sin((2 * Math.PI * k) / 24 + m.x) * m.amp);
    if (!ok(x, y)) continue;
    set(x, y, f >= T.flash && f <= T.hold ? "#fff6c8" : k % 8 >= 6 ? GOLD.M : GOLD.L);
    if (m.tw && k % 16 < 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(x + dx, y + dy)) set(x + dx, y + dy, GOLD.M);
  }
}
// ── 별 반짝(오른쪽 위 · 이름 위 빈 하늘) ──
const STARS = [[108, 8, 0], [116, 17, 9], [96, 5, 17], [111, 27, 26], [74, 5, 5], [64, 8, 30]];
function stars(f) {
  for (const [x, y, ph] of STARS) {
    if (!free(x, y)) continue;
    const k = md(f + ph * 3, 48);
    if (k < 2) { set(x, y, "#ffffff"); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, y + dy, "#8f8fd8"); }
    else set(x, y, k < 24 ? "#6f6cb4" : "#4a4a8a");
  }
}
// ── 번쩍 · 별 터짐 · 충격파 · 불씨 ──
function burst(f) {
  const k = f - T.flash;
  if (k < 0 || k > 3) return;
  const [cx, cy] = C;
  const put = (x, y, c) => { if (free(x, y)) set(x, y, c); };
  const arm = (r0, r1, cols) => { for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let r = r0; r <= r1; r++) put(cx + ux * r, cy + uy * r, cols[Math.min(cols.length - 1, r - r0)]); };
  const diag = (r0, r1, col) => { for (const [ux, uy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let r = r0; r <= r1; r++) put(cx + ux * r, cy + uy * r, col); };
  if (k === 0) { arm(7, 11, ["#ffffff", GOLD.H, GOLD.H, GOLD.L, GOLD.M]); diag(5, 7, GOLD.H); }
  if (k === 1) { arm(10, 14, [GOLD.H, GOLD.L, GOLD.L, GOLD.M, GOLD.D]); diag(7, 9, GOLD.L); }
  if (k === 2) { arm(13, 16, [GOLD.L, GOLD.M, GOLD.M, GOLD.D]); diag(9, 10, GOLD.M); }
  if (k === 3) { arm(16, 17, [GOLD.M, GOLD.D]); diag(11, 11, GOLD.D); }
}
const SHOCK = [24, 27, 30, 34, 38, 42, 46].map((r) => ring(r));
function shock(f) {
  const k = f - T.flash;
  if (k < 0 || k >= SHOCK.length) return;
  const dens = [1, 1, 0.75, 0.5, 0.5, 0.25, 0.125][k], col = k < 2 ? GOLD.H : k < 4 ? GOLD.L : GOLD.M;
  SHOCK[k].forEach(([x, y]) => { if (ok(x, y) && dith(x, y) < dens) set(x, y, col); });
}
const SPARKS = Array.from({ length: 16 }, (_, i) => [i * 22.5 + (i % 2) * 9, 1.3 + ((i * 7) % 5) * 0.25, 10 + (i % 4) * 2, i % 3]);
const TREFOIL = [[0, 0], [1, 0], [0, -1]];
function sparks(f) {
  SPARKS.forEach(([a, v, life, kind]) => {
    const k = f - T.flash - 1;
    if (k < 0 || k >= life || (k >= life - 3 && k % 2)) return;
    const t = (a * Math.PI) / 180, r0 = 8;
    const sx = Math.round(C[0] + Math.cos(t) * (r0 + v * k) + 0.06 * k * k), sy = Math.round(C[1] + Math.sin(t) * (r0 + v * k) - 0.05 * k * k);
    const col = kind === 2 ? (k < life * 0.5 ? "#8fd46a" : "#4c9a3a") : k < life * 0.45 ? GOLD.L : k < life * 0.75 ? GOLD.M : GOLD.D;
    const put = (x, y, c) => { if (ok(x, y)) set(x, y, c); };
    if (kind === 1 && k < 4) { put(sx, sy, k < 2 ? "#ffffff" : GOLD.H); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(sx + dx, sy + dy, col); return; }
    if (kind === 2) { const r = k % 4; TREFOIL.forEach(([dx, dy]) => { const [rx, ry] = [[dx, dy], [-dy, dx], [-dx, -dy], [dy, -dx]][r]; put(sx + rx, sy + ry, col); }); return; }
    put(sx, sy, col);
  });
}


// 날리는 잎 — 바람 띠(구름 앞 · 글 위)를 왼쪽 밖에서 들어와 리본 머리 쪽에서 살짝 들려 오른쪽 밖으로. 잎 뒤집힘 4자세
const LEAF_A = ["....ooo", "..ooHGo", ".oHGGro", "oHGGrDo", "oGGrDo.", "oGrDo..", ".rDo...", "r.o...."];
const LEAF_A_EDGE = [".....oo", "...ooHo", ".ooGro.", "oGrDo..", "rDo...."];
const LEAF_B = ["..oo", ".oHo", "oGro", "orDo", "r.o."];
const LEAF_B_EDGE = ["...o", ".oHo", "oro.", "r..."];
// 왼쪽은 사진 링(위)과 LEVEL(아래) 사이 틈(48~52줄 — 세 카드 모두 비는 다섯 줄)만 지나간다 → x < NARROW 동안은 위아래로 흔들리지 않고, 큰 잎은 옆으로 누운 자세(다섯 줄)로만
const NARROW = 48;
const LEAVES = [
  // path: 잎 왼쪽 위 칸 자리 · t0: 왼쪽 밖에서 들어오는 칸 · len: 가로지르는 칸 수 · thin: 틈에서 쓰는 자세
  { pts: [[-9, 48], [20, 48], [46, 48], [60, 47], [76, 45], [94, 43], [108, 44], [127, 46]], t0: 124, len: 40, poses: [[LEAF_A, LEAF], [LEAF_A_EDGE, LEAF], [mirror(LEAF_A), LEAF_BACK], [mirror(LEAF_A_EDGE), LEAF_BACK]], thin: [1, 3] },
  { pts: [[-6, 48], [22, 48], [46, 48], [56, 50], [66, 54], [76, 58], [86, 55], [100, 50], [124, 47]], t0: 14, len: 44, poses: [[LEAF_B, LEAF], [LEAF_B_EDGE, LEAF], [mirror(LEAF_B), LEAF_BACK], [mirror(LEAF_B_EDGE), LEAF_BACK]], thin: [0, 1, 2, 3] },
];
LEAVES.forEach((l) => (l.at = along(l.pts)));
export function leafAt(l, f) {
  const k = md(f - l.t0, N);
  if (k >= l.len) return null;
  const [x, y] = l.at(k / (l.len - 1));
  const narrow = x < NARROW;
  const pi = narrow ? l.thin[Math.floor(k / 3) % l.thin.length] : Math.floor(k / 3) % 4;
  const [g, pal] = l.poses[pi];
  return { g, pal, x: Math.round(x), y: Math.round(y) + (narrow ? 0 : Math.round(Math.sin(k / 3.2))) };
}
function leaves(f) { for (const l of LEAVES) { const p = leafAt(l, f); if (p) sprite(p.g, p.pal, p.x, p.y); } }
// 능선 풀 — 24칸마다 왼쪽에서 오른쪽으로 바람 물결(포기마다 2칸 늦게 · 4칸 동안 기욺) · 돌풍 때 크게
const TUFTS = [["h.h.", "hgg.", ".gd.", "..d."], ["h.h", ".g.", ".d."], ["..h.h", "..hgg", ".hg..", ".d...", ".d..."], ["h.", "gd", "d."]];
const sway = (g, k) => g.map((r, j) => { const n = Math.max(0, k - j); return ".".repeat(n) + r + ".".repeat(2 - n); });
function tufts(f) {
  const T = { d: NEAR[2], g: NEAR[4], h: NEAR[5] };
  [[99, 3], [103, 1], [107, 0], [111, 2]].forEach(([x, k], i) => {
    const g0 = TUFTS[k], t = nearY(x + 1);
    let ok = true;
    g0.forEach((r, j) => [...r].forEach((ch, ii) => { if (ch !== "." && inText(x + ii, t - g0.length + 1 + j)) ok = false; }));
    if (!ok) return;
    const gk = f - i;
    const pose = (gk >= 60 && gk <= 87) || (gk >= T.flash && gk <= T.flash + 6) ? 2 : md(f - i * 2, 24) < 4 ? 1 : 0;
    // 기운 자세에서 비는 아래쪽 칸은 바탕 언덕 색으로(뿌리는 그대로)
    sprite(sway(g0, pose), T, x, t - g0.length + 1);
  });
}

export function fg(f) {
  const Lr = layer();
  paintOn(Lr);
  tufts(f);
  stars(f);
  RIBBONS.forEach((r) => ribbon(r, f));
  crystals(f, false); // 뒤 수정(고리 뒤)
  vortex(f);
  magic(f);
  motes(f);
  dust(f);
  clover(f);
  crystals(f, true);
  swirlLeaves(f);
  shock(f);
  burst(f);
  sparks(f);
  leaves(f);
  return Lr;
}
// ───────── 합치기 · 내보내기 ─────────
const hexRgb = (c) => { const v = parseInt(c.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
// 한 칸(f) 전체 그림 — cloudShift: 구름이 오른쪽으로 흐른 칸 수
export function frameCells(f, cloudShift = 0) {
  const out = BASE.slice(), F = fg(f);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = CLOUDS[y * W + md(x - cloudShift, W)]; if (c) out[y * W + x] = c; }
  F.forEach((c, i) => { if (c) out[i] = c; });
  return out;
}
export function rawOf(cellsArr, alpha = false) {
  const buf = Buffer.alloc(W * H * 4);
  cellsArr.forEach((c, i) => { if (!c) { if (!alpha) { const [r, g, b] = hexRgb(BG); buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = 255; } return; } const [r, g, b] = hexRgb(c); buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = 255; });
  return buf;
}
export const pngOf = (cellsArr, scale = CELL, alpha = false) => sharp(rawOf(cellsArr, alpha), { raw: { width: W, height: H, channels: 4 } }).resize(W * scale, H * scale, { kernel: "nearest" }).png({ compressionLevel: 9 }).toBuffer();
// 움직이는 것이 글 자리에 걸치는지(칸 수) — 잎 · 네잎 · 불씨
// 움직이는 것이 글 자리에 걸치는지(칸 수) — 잎 · 수정 · 소용돌이 잎
export function overlapReport() {
  const out = [];
  const chk = (name, f, g, x0, y0) => { let n = 0; g.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== "." && avoid(x0 + i, y0 + j)) n++; })); if (n) out.push(`${name}@${f}:${n}`); };
  for (let f = 0; f < N; f++) {
    LEAVES.forEach((l, li) => { const p = leafAt(l, f); if (p) chk("leaf" + li, f, p.g, p.x, p.y); });
    for (let j = 0; j < 3; j++) { const c = crystalAt(j, f); chk("crystal" + j, f, c.g, c.x, c.y); }
    for (let j = 0; j < 4; j++) { const s = swirlLeafAt(j, f); if (s) chk("swirl" + j, f, s.g, s.x, s.y); }
  }
  return out;
}

// ───────── 내보내기 ─────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = (f) => join(ROOT, "public", "card-scenes", f);
  const ov = overlapReport();
  if (ov.length) throw new Error("움직이는 것이 글 자리에 걸침: " + ov.join(" "));
  writeFileSync(out("sc_clover.png"), await pngOf(frameCells(STILL, 0), CELL));
  writeFileSync(out("sc_clover-base.png"), await pngOf(BASE, 1));
  writeFileSync(out("sc_clover-clouds.png"), await pngOf(CLOUDS, 1, true));
  // 봇 원본 — 바탕(첫 별은 하늘색으로 지움) + 구름(0칸)
  const bot = BASE.slice();
  bot[45 * W + 80] = skyAt(80, 45);
  CLOUDS.forEach((c, i) => { if (c) bot[i] = c; });
  mkdirSync(join(ROOT, "assets", "card-scenes"), { recursive: true });
  writeFileSync(join(ROOT, "assets", "card-scenes", "sc_clover-bot.png"), await pngOf(bot, CELL));
  const raws = [];
  for (let f = 0; f < N; f++) raws.push(rawOf(fg(f), true));
  const frames = await Promise.all(raws.map((r) => sharp(r, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()));
  const webp = await sharp(frames, { join: { animated: true } }).webp({ lossless: true, delay: frames.map(() => STEP), loop: 0, effort: 6 }).toBuffer();
  // 되읽어 칸이 그대로인지(무손실 · 투명 칸 포함)
  const back = await sharp(webp, { animated: true, pages: -1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (back.info.pageHeight !== H || back.data.length !== W * H * 4 * N) throw new Error("webp 쪽 수가 다르다");
  for (let f = 0; f < N; f++) {
    const a0 = raws[f], b0 = back.data.subarray(f * W * H * 4, (f + 1) * W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const aa = a0[i * 4 + 3], bb = b0[i * 4 + 3];
      if (aa !== bb || (aa && (a0[i * 4] !== b0[i * 4] || a0[i * 4 + 1] !== b0[i * 4 + 1] || a0[i * 4 + 2] !== b0[i * 4 + 2]))) throw new Error(`webp ${f}칸 (${i % W}, ${Math.floor(i / W)}) 이 원본과 다르다`);
    }
  }
  writeFileSync(out("sc_clover-live.webp"), webp);
  console.log("sc_clover", N + "칸 ×", STEP + "ms", "· 구름 한 칸", CLOUD_EVERY * STEP + "ms(한 바퀴", (120 * CLOUD_EVERY * STEP) / 1000 + "초)", "· live.webp", webp.length, "B");
}
