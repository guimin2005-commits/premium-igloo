// 📌 이벤트 패스 「유령 펭귄의 초대」 창 그림 — public/event-pass/
//    · header-pc.png(1100 × 256) · header-m.png(640 × 256) — 창 머리 밤 장면(하늘 · 오로라 · 먼 숲 · 눈). 칸 한 개 = 4px, 줄이지 않고 제 크기로 깐다
//    · spectre.png — 유령 펭귄(투명, 칸 1px). 화면이 정수 배율(1 · 2배)로 키운다(image-rendering: pixelated)
//    · lantern-on.png · lantern-off.png — 길 위 랜턴 켜짐 · 꺼짐(7 × 11, 칸 1px) · lantern-flame.png — 켜진 랜턴 위에 깜빡 겹치는 다른 불꽃 칸(나머지는 투명)
//    · title.png — 제목 「유령 펭귄의 초대」(송명 · 짙은 테 · 그림자 · 푸른 빛 — 바로가기 띠 · 배너와 같은 판, 2배로 찍어 화면이 반으로 줄여 쓴다)
//    실행: node scripts/gen-event-pass-art.mjs   (그림을 고치면 다시 돌려 PNG 를 커밋한다)
//
//    📌 2026-10-17 운영자 "제발 AI 같은 그라데이션 좀 빼라" — 창은 그라데이션 · 흐린 빛 없이 단색 판.
//       머리 장면이 창 바탕색(PANEL)으로 녹는 것도 CSS 겹이 아니라 그림 안에서 바둑판 디더(4 × 4 Bayer)로 칸째 섞는다 — 아래 끝 줄은 PANEL 그대로
//    📌 그림 재료는 scripts/gen-halloween-banner.mjs(유령 펭귄 · 랜턴 · 오로라 · 숲)와 시안 .claude/mockups/event-pass/scene.mjs 에서 옮겨 왔다
//       (그 파일은 배너가 함께 쓰므로 가져오지 않고 필요한 함수만 베꼈다 — 유령 펭귄을 다시 그리면 두 곳 같이)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "event-pass");
const CELL = 4; // 머리 장면 칸 한 개(px)
// 📌 창 바탕 — app/level/EventPassModal.js EP.panel 과 같은 값(바꾸면 같이 · 그림도 다시 돌린다)
const PANEL = "#0f0b24";
const { Resvg } = createRequire(import.meta.url)("../bot/node_modules/@resvg/resvg-js");
const FONT_SONG = join(ROOT, "assets", "fonts", "SongMyung-Regular.ttf");

// ───────────────────────── 칸 그림판(gen-halloween-banner.mjs 와 같은 것) ─────────────────────────
function grid() {
  const m = new Map();
  const k = (x, y) => x + "," + y;
  const g = {
    m,
    set(x, y, c) { if (c) m.set(k(x, y), c); return g; },
    get(x, y) { return m.get(k(x, y)); },
    outline(c) {
      const add = [];
      for (const key of m.keys()) {
        const [x, y] = key.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!m.has(k(x + dx, y + dy))) add.push(k(x + dx, y + dy));
      }
      for (const a of add) m.set(a, c);
      return g;
    },
    box() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const key of m.keys()) { const [x, y] = key.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
  };
  return g;
}
function sprite(rows, pal, g = grid(), ox = 0, oy = 0) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) g.set(ox + x, oy + y, pal[ch]); }));
  return g;
}
function canvas(W, H) {
  const px = new Array(W * H).fill(null);
  const cv = {
    W, H, px,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < W && y < H) px[y * W + x] = c; },
    get(x, y) { return x >= 0 && y >= 0 && x < W && y < H ? px[y * W + x] : null; },
    at(g, x, y) { const b = g.box(); for (const [key, c] of g.m) { const [gx, gy] = key.split(",").map(Number); cv.set(x + gx - b.x0, y + gy - b.y0, c); } },
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
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a, b, t) => a + (b - a) * t;
const hexRgb = (h) => { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; };
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const [r0, g0, b0] = hexRgb(a), [r1, g1, b1] = hexRgb(b); return rgbHex(lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t)); };

// ───────────────────────── 밤하늘 · 오로라 · 숲 · 눈 ─────────────────────────
const SKY = ["#150d30", "#1c1240", "#25174f", "#311c5e", "#40226b", "#522875", "#682f7c", "#80367f"];
const STAR = { w: "#fff7d6", l: "#b9a2f0" };
const NIGHT = { aur0: "#4bffb4", aur1: "#3fd8ff", aur2: "#8a6bff", snow0: "#e6edff", pine: ["#2b2a63", "#1f1d4a", "#141233"], pineSnow: ["#7d86c4", "#9aa6dd", "#c9d4f5"] };
function sky(cv, R, stops) {
  const { W, H } = cv;
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
  for (let n = 0; n < W * H * 0.004; n++) {
    const x = Math.floor(R() * W), y = Math.floor(R() * H * 0.62);
    cv.set(x, y, R() < 0.5 ? STAR.l : STAR.w);
  }
}
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
      const step = Math.round((t / 0.12 + (dith(x, y) - 0.5) * 0.8)) * 0.12;
      if (step <= 0) continue;
      cv.set(x, y, mix(c, k < r.len * 0.35 ? r.c0 : r.c1, step));
    }
  }
}
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
  cv.set(cx, base - 1, col); cv.set(cx, base, col);
}
function forest(cv, layer, base, list) { for (const [x, h] of list) pine(cv, x, base(x), h, layer); }
function snowfall(cv, R, n) {
  for (let i = 0; i < n; i++) { const x = Math.floor(R() * cv.W), y = Math.floor(R() * cv.H * 0.85); cv.set(x, y, R() < 0.5 ? "#ffffff" : NIGHT.snow0); }
}
// 📌 창 바탕으로 녹이기 — y0 줄부터 y1 줄까지 PANEL 쪽으로 네 단(0 · ⅓ · ⅔ · 1) 섞고, 단 사이는 바둑판 디더. y1 아래는 PANEL 그대로(그림 아래 끝이 창 바탕과 이음매 없이)
function meltInto(cv, y0, y1) {
  const STEP = [0, 1 / 3, 2 / 3, 1];
  for (let y = y0; y < cv.H; y++) for (let x = 0; x < cv.W; x++) {
    if (y >= y1) { cv.set(x, y, PANEL); continue; }
    const t = ((y - y0) / (y1 - y0)) * 3;
    const lv = Math.min(3, Math.floor(t) + (t - Math.floor(t) > dith(x, y) ? 1 : 0));
    const c = cv.get(x, y);
    if (c) cv.set(x, y, lv >= 3 ? PANEL : mix(c, PANEL, STEP[lv]));
  }
}
// 창 머리 장면 — 시안 scene.mjs head() 그대로(달 없음) + 아래를 PANEL 로 녹인다
async function head(W, H, seed, melt) {
  const cv = canvas(W, H);
  const R = rng(seed);
  sky(cv, R, [0, 9, 18, 26, 34, 41, 48, 55]);
  aurora(cv, [
    { x0: 0, x1: W - 1, y: 3, len: 18, amp: 3, f: 19, ph: 0.6, alpha: 0.42, c0: NIGHT.aur0, c1: NIGHT.aur1 },
    { x0: 20, x1: W - 1, y: 14, len: 12, amp: 3, f: 11, ph: 2.2, alpha: 0.24, c0: NIGHT.aur1, c1: NIGHT.aur2 },
  ]);
  const farB = (x) => H - 8 + Math.round(Math.sin(x / 19) * 1.5);
  forest(cv, 0, farB, Array.from({ length: Math.ceil(W / 11) }, (_, i) => [3 + i * 11 + ((i * 5) % 4), 8 + ((i * 7) % 7)]));
  snowfall(cv, R, Math.round(W * 0.12));
  meltInto(cv, melt[0], melt[1]);
  return cv.png(CELL);
}

// ───────────────────────── 유령 펭귄(gen-halloween-banner.mjs spectre 그대로) ─────────────────────────
const SP = {
  out: "#0a0716", cloak: ["#5b48b0", "#3d2f84", "#2a2060", "#1a1340", "#110c2a"], rim: "#a493f2", lampRim: "#6fd6ef",
  face: ["#07051a", "#100b28"], eye: ["#f4ffff", "#8ff6ff", "#2fb8d8"],
  tail: ["#eafcff", "#b4ecf9", "#72c3e6", "#3f86c4", "#2a5f9e"],
  gold: ["#ffe08a", "#e2b04a", "#9c6a22", "#5a3a12"], glass: "#1a3a52", flame: ["#ffffff", "#9ff8ff", "#45b4ff", "#2a6fd6"],
};
function spectreCloak() {
  const g = grid();
  const tone = (l) => SP.cloak[l > 0.62 ? 0 : l > 0.32 ? 1 : l > 0.02 ? 2 : l > -0.3 ? 3 : 4];
  const hcx = 20, hcy = 15, hrx = 11.5, hry = 12;
  for (let y = 2; y <= 27; y++) for (let x = 6; x <= 34; x++) {
    const nx = (x - hcx) / hrx, ny = (y - hcy) / hry;
    if (nx * nx + ny * ny > 1) continue;
    g.set(x, y, tone(-0.55 * nx - 0.55 * ny + 0.15));
  }
  for (let t = 0; t <= 8; t += 0.2) {
    const x = hcx + 2 + t * 0.9, y = hcy - hry + 2.5 - t * 0.35 + (t > 4 ? (t - 4) * 0.55 : 0);
    const w = Math.max(0.7, 3.6 * (1 - t / 8));
    for (let yy = Math.floor(y - w); yy <= Math.ceil(y + w); yy++) for (let xx = Math.floor(x - w); xx <= Math.ceil(x + w); xx++) if (Math.hypot(xx - x, yy - y) <= w) g.set(xx, yy, tone(0.2 - t * 0.06));
  }
  for (let y = 22; y <= 42; y++) {
    const half = 8.5 + (y - 22) * 0.48, cx = 20 + Math.sin((y - 22) / 7) * 0.8;
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const bottom = 40 + Math.round(1.6 * Math.sin(x * 1.1) + Math.sin(x * 0.37));
      if (y > bottom) continue;
      const nx = (x - cx) / half;
      let l = -0.7 * nx + 0.05 - (y - 22) * 0.012;
      if (((x * 7 + y * 3) % 17) === 0 && y > 27) l -= 0.35;
      g.set(x, y, tone(l));
    }
  }
  for (let y = 23; y <= 39; y++) for (let x = 14; x <= 26; x++) {
    const nx = (x - 20) / 4.6, ny = (y - 30) / 7.6;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const l = -0.6 * nx - 0.3 * ny;
    g.set(x, y, d > 0.82 ? SP.tail[3] : l > 0.25 ? SP.tail[0] : l > -0.25 ? SP.tail[1] : SP.tail[2]);
  }
  for (let y = 27; y <= 39; y++) { g.set(28 + Math.round((y - 27) * 0.25), y, SP.cloak[2]); g.set(25 + Math.round((y - 27) * 0.1), y, SP.cloak[4]); }
  return g;
}
function spectreFace(g) {
  const cx = 20, cy = 16.5;
  for (let y = 9; y <= 24; y++) for (let x = 11; x <= 29; x++) {
    const nx = (x - cx) / 7.6, ny = (y - cy) / 7;
    if (nx * nx + ny * ny > 1) continue;
    g.set(x, y, ny < -0.25 ? SP.face[0] : SP.face[1]);
  }
  for (const [ex, sgn] of [[16, 1], [24, -1]]) {
    for (let y = 13; y <= 19; y++) for (let x = ex - 3; x <= ex + 3; x++) {
      const d = Math.hypot(x - ex, (y - 16) * 1.3);
      if (d < 3.2 && dith(x, y) < 0.45 && g.get(x, y) && SP.face.includes(g.get(x, y))) g.set(x, y, "#123a52");
    }
    const rows = [[-1, 0, 1], [-2, -1, 0, 1, 2], [-1, 0, 1, 2]];
    rows.forEach((xs, i) => xs.forEach((dx) => g.set(ex + dx * sgn, 15 + i, i === 1 && Math.abs(dx) <= 1 ? SP.eye[0] : SP.eye[1])));
    g.set(ex - 2 * sgn, 15, SP.eye[2]);
  }
}
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
      if (t > 0.35 && dith(xx, yy) < (t - 0.35) * 1.5) continue;
      const k = d < 0.35 ? 0 : d < 0.6 ? 1 : d < 0.85 ? 2 : 3;
      const prev = g.get(xx, yy);
      const c = SP.tail[Math.min(4, k + (t > 0.7 ? 1 : 0))];
      if (!prev || SP.tail.indexOf(prev) > SP.tail.indexOf(c)) g.set(xx, yy, c);
    }
  }
  return g;
}
// 랜턴 — 금 틀 · 유리 · 푸른 불(7 × 11). 유령 펭귄이 든 것 · 길 위 랜턴이 같은 칸 지도
const LANTERN = ["..GGG..", ".G...G.", "..ggg..", ".dgggd.", "dLFFFLd", "dFFWFFd", "dFWWWFd", "dFWWWFd", "dLFWFLd", ".dgggd.", "..ddd.."];
const PAL_ON = { G: SP.gold[1], g: SP.gold[1], d: SP.gold[3], L: SP.glass, F: SP.flame[1], W: SP.flame[0] };
// 꺼진 랜턴 — 시안(gen-mock.mjs) 값. 불 · 유리는 창 바탕 쪽 남색으로 가라앉힌다
const PAL_OFF = { G: "#6d5a3a", g: "#6d5a3a", d: "#2e2316", L: "#141a2c", F: "#232b45", W: "#2c3656" };
// 📌 깜빡임 겹(lantern-flame.png) — 켜진 랜턴과 다른 칸만: 불 속이 한 칸 오른쪽으로 흔들린 꼴. 창이 이 겹을 띄엄띄엄 켰다 껐다 한다(steps — 흐린 빛 없이 칸이 바뀌는 깜빡임)
const FLAME_ALT = [[3, 5, SP.flame[1]], [4, 5, SP.flame[0]], [2, 6, SP.flame[1]], [5, 7, SP.flame[0]]];
function spectre() {
  const cloak = spectreCloak();
  spectreFace(cloak);
  for (let y = 27; y <= 33; y++) for (let x = 9; x <= 15; x++) if (Math.hypot((x - 12) / 3.2, (y - 30) / 2.4) <= 1) cloak.set(x, y, y < 29 ? SP.cloak[1] : SP.cloak[2]);
  cloak.outline(SP.out);
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
  sprite(LANTERN, PAL_ON, g, 7, 31);
  return g;
}

// ───────────────────────── 제목 글(송명) ─────────────────────────
// 📌 바로가기 띠(.claude/mockups/event-pass/strip.mjs)와 같은 판 — 송명 · 짙은 테 · 아래 그림자 · 푸른 빛. 운영자가 배너에서 받아들인 그대로라 이 글자만 빛을 남긴다.
//    화면 글자 44px 의 2배(88px)로 찍는다 — 창은 반 크기로(폰은 더 작게) 줄여 쓴다
const TS = 88, k = TS / 66, TITLE = "유령 펭귄의 초대";
const RW = 1100, RH = 300, OX = 60, OY = 190, PAD = 32;
const svgPng = (inner) => Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${RW}" height="${RH}">${inner}</svg>`, { font: { fontFiles: [FONT_SONG], loadSystemFonts: false, defaultFontFamily: "Song Myung" } }).render().asPng());
async function titlePng() {
  const T = `font-family="Song Myung" font-weight="400" font-size="${TS}" letter-spacing="${(1.98 * k).toFixed(2)}"`;
  const body = `<text x="${OX}" y="${OY}" ${T} fill="#f3efff" stroke="#0d0820" stroke-width="${(6.8 * k).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${TITLE}</text>`;
  const full = `<defs><filter id="gl" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(7.2 * k).toFixed(1)}" result="b"/><feFlood flood-color="#3fb6ff" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/></feMerge></filter></defs>`
    + `<g filter="url(#gl)">${body}</g>`
    + `<text x="${OX}" y="${OY + 4 * k}" ${T} fill="#0b0618" stroke="#0b0618" stroke-width="${(6.8 * k).toFixed(1)}" stroke-linejoin="round">${TITLE}</text>` + body;
  // 글자 + 테 영역을 재고(빛 · 그림자 빼고) 그 둘레 PAD 만큼 잘라 낸다 — 창은 PAD 만큼 음수 여백으로 글자 자리를 맞춘다
  const { info } = await sharp(svgPng(body)).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const left = -info.trimOffsetLeft, top = -info.trimOffsetTop;
  const buf = await sharp(svgPng(full)).extract({ left: left - PAD, top: top - PAD, width: info.width + PAD * 2, height: info.height + PAD * 2 }).png({ compressionLevel: 9 }).toBuffer();
  return { buf, w: info.width, h: info.height };
}

// ───────────────────────── 내보내기 ─────────────────────────
mkdirSync(OUT, { recursive: true });
// 머리 — PC 는 창 폭(1100) 그대로, 폰은 시트가 sm(640) 아래에서만 쓰여 640 폭(가운데 기준으로 잘려 보인다). 높이 64칸(256px), 34 → 62줄에서 PANEL 로
writeFileSync(join(OUT, "header-pc.png"), await head(275, 64, 1018, [34, 62]));
writeFileSync(join(OUT, "header-m.png"), await head(160, 64, 1019, [30, 60]));

const sp = spectre(), b = sp.box();
const spc = canvas(b.w + 2, b.h + 2);
spc.at(sp, 1, 1);
writeFileSync(join(OUT, "spectre.png"), await spc.png(1, true));

const lantern = async (pal, extra = null) => {
  const cv = canvas(7, 11);
  if (pal) cv.at(sprite(LANTERN, pal), 0, 0);
  if (extra) for (const [x, y, c] of extra) cv.set(x, y, c);
  return cv.png(1, true);
};
writeFileSync(join(OUT, "lantern-on.png"), await lantern(PAL_ON));
writeFileSync(join(OUT, "lantern-off.png"), await lantern(PAL_OFF));
writeFileSync(join(OUT, "lantern-flame.png"), await lantern(null, FLAME_ALT));

const title = await titlePng();
writeFileSync(join(OUT, "title.png"), title.buf);
console.log("ok", { spectre: [b.w + 2, b.h + 2], title: { w: title.w, h: title.h, pad: PAD } });
