// 📌 할로윈 시즌 카드 스킨 「달빛 묘지」(hw_grave) — 무섭지 않은, 귀여운 달밤의 작은 묘지. 2026-10-09 시안, 운영자 "카드 테두리는 진짜 다 예쁜데" → 10/10 5종 모두 합격.
//   그림 원본: .claude/mockups/src/halloween/skins/s2b.js (사이트 자리는 360 폭 카드 기준 → 언덕 시작 · 가운데 소품은 카드 가운데를 따라간다)
//   테두리 = 밤 보라 띠(위 · 왼쪽 밝게 / 아래 · 오른쪽 짙게) + 띠에 박힌 달빛 별 징 · 모서리 별 판
//   + 오른쪽 위: 테 모서리에 걸린 보름달(분화구) + 달 앞을 지나는 박쥐 둘(달에 겹쳐 한 덩어리)
//   + 위 가운데 작은 호박 문장
//   + 바닥 띠: 이끼 낀 풀 둔덕 → 오른쪽 아래 구석 언덕에 둥근 묘비 둘(하트 새김 · 호박 그림) · 묘비 뒤에서 빼꼼 내다보는 작은 유령 · 웃는 호박
//     · 왼쪽 낮은 둔덕엔 작은 호박과 하트 묘비 하나. RIP 같은 글자 · 해골 · 거미 없음
//     레벨 막대가 있는 사이트 카드(레벨 페이지 · 상점 미리보기)는 묘비 · 호박 · 유령을 다 막대 오른쪽 끝 위 작은 풀 언덕으로 올린다 — 아래 테 위엔 풀 둔덕 띠만(10/11).
//     그 유령은 큰 묘비 위로 떠 있다(묘비에 가리지 않게)
//   사이트(site)는 박쥐가 날갯짓하고 유령이 살짝 떠오른다(움직임 줄이기 설정이면 멈춤).
//   등급 색과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸만. 아바타(왼쪽 위)는 모서리 판만.
import { floorLimit, sinkBy, behind, frameOut, botTopOpen } from "./hwFloor.js";

// floor: 사이트 카드 바닥 띠 그림 높이(px — 카드 아래 끝에서 가장 높은 그림 위 끝까지). 레벨 페이지 카드가 아래에 floorRoom 만큼 더 비워 주면 시안 그대로 선다(hwFloor.js)
export const meta = { key: "hw_grave", label: "달빛 묘지", grid: "dot", tint: "#cdbcff", gridOp: 0.08, floor: 82 };

// 색 사다리 — [빛, 밝은, 바탕, 그늘, 외곽(가장 짙은 같은 색)]
const NI = ["#c3b2f4", "#9480dc", "#6a52b0", "#46338a", "#1b1038"]; // 밤 보라(테)
const ST = ["#ecE8fa", "#c4bde0", "#9890c0", "#6e6698", "#2a2448"]; // 묘비 돌
const MO = ["#fffce8", "#fff1a8", "#ffdf6a", "#eab84c", "#7a4e14"]; // 달 노랑
const GH = ["#ffffff", "#f5f2ff", "#ddd7f5", "#b0a7d8", "#564c88"]; // 유령 흰색
const GR = ["#c8f28c", "#88d45a", "#52a446", "#307238", "#12301a"]; // 이끼 · 풀
const PK = ["#ffd08a", "#ffa64a", "#ff7f24", "#d4521a", "#6b200c"]; // 호박 주황
const BT = ["#a48ed0", "#7660a8", "#55418a", "#3b2b66", "#150b28"]; // 박쥐(달 앞 실루엣)
const INK = "#2a0e06"; // 호박 얼굴
const BLUSH = "#ff9db8";

const rp = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// ── 칸 그림판 — 칸마다 색. 외곽선은 4이웃(끊김 없이 둘러진다) ──
function grid() {
  const m = new Map();
  const k = (x, y) => x + "," + y;
  const g = {
    m,
    set(x, y, c) { if (c) m.set(k(x, y), c); return g; },
    get(x, y) { return m.get(k(x, y)); },
    has(x, y) { return m.has(k(x, y)); },
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
//   같은 색 가로 이웃 칸은 네모 하나로 합친다(그림은 같고 문자열만 짧게 — 테 · 둔덕이 길어 칸마다 네모면 160KB 가 넘었다)
function draw(g, x, y, P, attr = "") {
  const by = {};
  for (const [key, c] of g.m) { const [cx, cy] = key.split(",").map(Number); ((by[c] ||= new Map()).get(cy) || by[c].set(cy, []).get(cy)).push(cx); }
  let body = "";
  for (const [c, rows] of Object.entries(by)) {
    let d = "";
    for (const [cy, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += rp(x + xs[i] * P, y + cy * P, (j - i + 1) * P, P); i = j + 1; }
    }
    body += `<path d="${d}" fill="${c}"/>`;
  }
  return `<g${attr}>${body}</g>`;
}
function put(g, left, bottom, P, attr) { const b = g.box(); return draw(g, left - b.x0 * P, bottom - (b.y1 + 1) * P, P, attr); }
function center(g, cx, cy, P, attr) { const b = g.box(); return draw(g, Math.round((cx - (b.w * P) / 2) / P) * P - b.x0 * P, Math.round((cy - (b.h * P) / 2) / P) * P - b.y0 * P, P, attr); }
// 글자 지도 → 그림판. pal: 글자 → 색
function sprite(rows, pal, g = grid(), ox = 0, oy = 0) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) g.set(ox + x, oy + y, pal[ch]); }));
  return g;
}
const tone = (nx, ny) => { const d = Math.hypot(nx + 0.45, ny + 0.45); return d < 0.34 ? 0 : d < 0.74 ? 1 : d < 1.3 ? 2 : 3; };

// ── 보름달 — 반지름 r 칸, 왼쪽 위 빛 + 분화구(그늘 칸 · 아래 오른쪽 가장자리 밝게) ──
function moon(r) {
  const g = grid();
  const inC = (x, y) => Math.hypot(x, y) <= r + 0.35;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (inC(x, y)) g.set(x + r, y + r, MO[tone(x / (r + 0.5), y / (r + 0.5))]);
  // 분화구 [가운데 x, y(칸, 달 가운데 기준), 반지름] — 오른쪽에만(왼쪽 위는 빛 · 박쥐와 "눈 · 입" 얼굴처럼 보이지 않게)
  for (const [cx, cy, cr] of (r >= 13 ? [[6, -7, 2.4], [10, 3, 1.5], [3, 10, 1.3]] : [[-3, -1, 2.2], [3, 4, 1.6], [4, -4, 1.2], [-2, 5, 1.1]])) {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d > cr + 0.2) continue;
      const X = Math.round(cx + x), Y = Math.round(cy + y);
      if (!inC(X, Y)) continue;
      const rim = d > cr - 0.9 && x + y > 0; // 아래 오른쪽 가장자리 = 빛 받는 벽
      g.set(X + r, Y + r, rim ? MO[1] : MO[3]);
    }
  }
  return g.outline(MO[4]);
}

// 박쥐 — V 자로 펼친 날개(아래는 둥근 물결 — 발 · 가는 가시 없이) · 귀 · 달빛 눈. 두 장면(날개 위 · 아래)
const BAT = [
  [
    "W......B...B......W",
    "WW.....BBBBB.....WW",
    ".WWW..BBBBBBB..WWW.",
    ".WWWWWBBeBeBBWWWWW.",
    "..WWWWWBBBBBWWWWW..",
    "..WWWWWWBBBWWWWWW..",
    "...WW.WWW.WWW.WW...",
  ],
  [
    ".......B...B.......",
    ".......BBBBB.......",
    "......BBBBBBB......",
    "..WWWWBBeBeBBWWWW..",
    ".WWWWWWBBBBBWWWWWW.",
    "WWWWWWWWBBBWWWWWWWW",
    "WWW.WWW.....WWW.WWW",
  ],
];
const BAT_S = [
  [
    "W....B.B....W",
    "WW...BBB...WW",
    ".WWWBeBeBWWW.",
    "..WWWBBBWWW..",
    "..WW.WWW.WW..",
  ],
  [
    ".....B.B.....",
    ".....BBB.....",
    "..WWBeBeBWW..",
    ".WWWWBBBWWWW.",
    "WWWW.WWW.WWWW",
  ],
];
function bat(rows) {
  const g = grid();
  const H = rows.length, W = rows[0].length;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    if (ch === "e") { g.set(x, y, MO[1]); return; }
    let t = tone(((x + 0.5) / W) * 2 - 1, ((y + 0.5) / H) * 2 - 1);
    if (ch === "B") t = Math.max(1, Math.min(2, t)); // 몸통은 밝은 · 바탕
    g.set(x, y, BT[t]);
  }));
  return g.outline(BT[4]);
}

// ── 둥근 묘비 — 둥근 머리 + 몸 + 받침돌. mark: "heart"(새김) · "pumpkin"(그림) ──
function stone(W, H, mark, moss = true) {
  const g = grid();
  const r = (W - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y < r && Math.hypot(x - r, y - r) > r + 0.4) continue;
    const t = tone(((x + 0.5) / W) * 2 - 1, ((y + 0.5) / H) * 1.6 - 1);
    g.set(x, y, ST[x === W - 1 || (x >= W - 2 && y > r) ? 3 : Math.min(3, t)]);
  }
  // 받침돌 — 양옆 한 칸씩 넓게
  for (let x = -1; x <= W; x++) { g.set(x, H, x < W * 0.3 ? ST[1] : ST[2]); g.set(x, H + 1, x > W * 0.7 ? ST[3] : ST[2]); }
  const mx = Math.round(r) - 2, my = Math.round(r * 0.75);
  if (mark === "heart") {
    // 새긴 하트 — 홈은 그늘 · 홈 아래 오른쪽 벽은 빛
    const HEART = W >= 11 ? [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."] : ["XX.XX", "XXXXX", ".XXX.", "..X.."];
    const hx = Math.round(r) - (HEART[0].length - 1) / 2;
    HEART.forEach((row, j) => [...row].forEach((ch, i) => {
      if (ch !== "X") return;
      const below = HEART[j + 1]?.[i] === "X", rightOf = row[i + 1] === "X";
      if (!below || !rightOf) g.set(hx + i + (rightOf ? 0 : 1), my + j + (below ? 0 : 1), ST[0]);
    }));
    HEART.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "X") g.set(hx + i, my + j, j < 2 && i < 3 ? "#5a5288" : "#4a4272"); }));
  } else if (mark === "pumpkin") {
    // 작은 호박 그림(주황 · 초록 꼭지)
    const PKM = ["..s..", ".ooo.", "ooOoo", "oOOOo", ".ooo."];
    PKM.forEach((row, j) => [...row].forEach((ch, i) => {
      const c = { s: GR[2], o: PK[2], O: PK[1] }[ch];
      if (c) g.set(mx + i, my + j, j >= 3 && i >= 3 && ch === "o" ? PK[3] : c);
    }));
  }
  // 이끼 — 왼쪽 아래 몸과 받침에 한 덩어리
  if (moss) {
    const MOSS = [[0, H - 3], [0, H - 2], [1, H - 2], [0, H - 1], [1, H - 1], [2, H - 1], [-1, H], [0, H], [1, H], [2, H], [3, H]];
    for (const [x, y] of MOSS) g.set(x, y, y >= H ? GR[2] : GR[1]);
    g.set(0, H - 3, GR[0]);
  }
  return g.outline(ST[4]);
}

// ── 호박 — 가로로 넓은 둥근 몸 + 세로 골(그늘 줄) + 초록 꼭지 · 잎. face: 웃는 얼굴(둥근 눈 · 작은 입 · 볼) ──
function pumpkin(W, H, face = false) {
  const g = grid();
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) / (W / 2), dy = (y - cy) / (H / 2);
    if (dx * dx + dy * dy > 1.0) continue;
    let t = tone(dx, dy);
    const rib = Math.abs(x - cx) > 0.6 && (Math.abs(Math.abs(x - cx) - W * 0.22) < 0.5); // 골 두 줄
    if (rib && t < 3 && y > 0 && y < H - 1) t += 1;
    g.set(x, y, PK[t]);
  }
  if (face) {
    const ex = Math.round(cx - W * 0.2), ex2 = Math.round(cx + W * 0.2), ey = Math.round(cy - 0.5);
    for (const X of [ex, ex2]) { g.set(X, ey, INK); g.set(X, ey + 1, INK); }
    g.set(ex - 1, ey + 2, BLUSH); g.set(ex2 + 1, ey + 2, BLUSH);
    const my = ey + 2;
    g.set(Math.round(cx) - 1, my, INK); g.set(Math.round(cx), my + 1, INK); g.set(Math.round(cx) + 1, my, INK);
  }
  // 꼭지 · 잎
  const sx = Math.round(cx);
  g.set(sx, -1, GR[2]).set(sx, -2, GR[1]).set(sx + 1, -2, GR[2]);
  g.set(sx + 2, -1, GR[1]).set(sx + 3, -1, GR[2]).set(sx + 2, -2, GR[0]);
  return g.outline(PK[4]);
}

// ── 유령 — 둥근 머리 · 물결 꼬리(둥근 세 갈래) · 까만 눈 · 볼 ──
const GHOST = [
  "....GGGGG....",
  "..GGGGGGGGG..",
  ".GGGGGGGGGGG.",
  ".GGGGGGGGGGG.",
  "GGGGGGGGGGGGG",
  "GGGeGGGGGeGGG",
  "GGGeGGGGGeGGG",
  "GGpGGGmGGGpGG",
  "GGGGGGGGGGGGG",
  "GGGGGGGGGGGGG",
  "GGGGGGGGGGGGG",
  "GGGGGGGGGGGGG",
  ".GGG.GGG.GGG.",
];
function ghost() {
  const g = grid();
  const H = GHOST.length, W = GHOST[0].length;
  GHOST.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === ".") return;
    if (ch === "e" || ch === "m") { g.set(x, y, "#2b2148"); return; }
    if (ch === "p") { g.set(x, y, BLUSH); return; }
    g.set(x, y, GH[tone(((x + 0.5) / W) * 2 - 1, ((y + 0.5) / H) * 2 - 1)]);
  }));
  return g.outline(GH[4]);
}

// ── 별 — 십자 별(징 · 모서리 판) ──
function star(big) {
  const rows = big
    ? ["...a...", "...b...", "..abc..", "abbwbcc", "..bcc..", "...c...", "...c..."]
    : ["..a..", "..b..", "abwbc", "..c..", "..c.."];
  const g = sprite(rows, { a: MO[0], b: MO[1], w: "#ffffff", c: MO[3] });
  return g.outline(MO[4]);
}

export function deco(w, h, S, site, ctx = {}) {
  const id = "hw_grave";
  const P = site ? 2 : Math.max(2, Math.round(2 * S)); // 테 칸
  const Q = site ? 2 : Math.max(2, Math.round(1.4 * S)); // 그림 칸(봇은 한 칸 작게 — 좁은 바닥 줄)
  const o = site ? frameOut(site, ctx, 5 * P, P) : 4 * P; // 폰 레벨 페이지는 테가 글자에 겹치지 않게 바깥으로(hwFloor.js)
  const oc = o / P;
  const NC = Math.floor(w / P), NR = Math.floor(h / P);

  // ── 밤 보라 띠 — 5칸: 외곽 · 밝은 · 바탕 · 그늘 · 외곽(위 · 왼쪽), 아래 · 오른쪽은 한 단 짙게 ──
  const fr = grid();
  for (let x = oc; x < NC - oc; x++) for (let j = 0; j < 5; j++) {
    fr.set(x, oc + j, j === 0 || j === 4 ? NI[4] : NI[j]);
    fr.set(x, NR - oc - 1 - j, j === 0 || j === 4 ? NI[4] : NI[Math.min(3, j + 1)]);
  }
  for (let y = oc; y < NR - oc; y++) for (let j = 0; j < 5; j++) {
    if (y >= oc + 4 && y < NR - oc - 4) {
      fr.set(oc + j, y, j === 0 || j === 4 ? NI[4] : NI[j]);
      fr.set(NC - oc - 1 - j, y, j === 0 || j === 4 ? NI[4] : NI[Math.min(3, j + 1)]);
    }
  }
  // 띠 위 빛 점 — 위 · 왼쪽 띠 밝은 줄에 세 칸마다(돌 결)
  for (let x = oc + 2; x < NC - oc - 2; x += 6) fr.set(x, oc + 1, NI[0]);
  for (let y = oc + 6; y < NR - oc - 6; y += 6) fr.set(oc + 1, y, NI[0]);
  let frame = draw(fr, 0, 0, P);

  // ── 오른쪽 위 — 보름달(카드 둥근 모서리에 잘리지 않게 안쪽으로, 테 모서리에 걸친다) ──
  const moonR = site ? 14 : 10;
  // 📌 폰 레벨 페이지 카드(안쪽 여백 20px)는 이름 · 순위 칩이 위로 붙어 달 · 작은 박쥐가 '상위 N%' 칩에 걸린다 → 5칸 올린다(위 테에 더 걸친다)
  const tight = site && Number.isFinite(ctx?.lineX0) && ctx.lineX0 < 24;
  const moonC = [w - o - (site ? 18 : 13) * Q, o + (site ? (tight ? 11 : 16) : 13) * Q];
  const roomy = site || botTopOpen(ctx); // 봇은 레벨업 · 역할 지급 카드만 달 · 박쥐 · 바닥 호박(hwFloor.js — 호박은 낮아 레벨 막대 끝 밖)
  // ── 바닥 — 사이트는 아래 테 띠를 풀 둔덕이 덮는다(floor = 테 바깥 줄). 봇은 레벨 막대 아래 좁은 줄이라 낮게 ──
  const floor = site ? h - o : h - o - 3 * P;
  // 📌 2026-10-11 방법 1(시안) — 레벨 막대가 있는 사이트 카드(레벨 페이지 · 상점 미리보기 — ctx.barY)는 묘비 · 유령 · 호박 무리를 막대 오른쪽 끝 위에 세운다(검은 고양이와 같은 규칙).
  //    카드 맨 아래가 스탯 두 줄이라 바닥 오른쪽 언덕에 두면 '누적 음성 시간' 값에 겹쳤다. 막대 위 오른쪽(등급 줄 오른쪽 · 달 아래)은 비어 있다
  const barTop = site && Number.isFinite(ctx?.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  // 📌 10/11 저녁 — 막대 위 유령은 큰 묘비 꼭대기 위로 띄운다(운영자 "묘가 귀신 가리는 게 맞냐 … 움직이는 귀신을 위로 올리면 안 되냐" — 어깨 뒤에서 빼꼼이라 묘비가 몸을 거의 다 가렸다)
  const GH_GAP = 2; // 큰 묘비 꼭대기(외곽선) ~ 유령 아래 끝 틈(칸)
  const GH_X = 1; // 유령 왼쪽 칸(큰 묘비 왼쪽 = 0) — 묘비(17칸) 가운데 위에 유령(15칸)
  const HILL = 5; // 막대 위 풀 언덕 꼭대기 높이(칸, 외곽선 빼고) — 큰 묘비는 세 칸 박혀 HILL − 1 칸 올라선다
  const heroH = (HILL - 1 + stone(13, 15, "heart").box().h + GH_GAP + ghost().box().h) * Q + 2; // 언덕 · 큰 묘비 · 틈 · 유령 · 둥실(2px)까지
  const onBar = barTop != null && barTop - heroH > o + 20;

  // 별 징 — 띠 가운데 줄에 ~44px 마다(달 · 위 가운데 문장 자리 · 둔덕에 덮인 아래 띠 · 오른쪽 아래 언덕 옆은 비움)
  let studs = "";
  const mid = (oc + 2.5) * P;
  const step = Math.round(44 * (site ? 1 : S));
  const nearMoon = (x, y) => roomy && Math.hypot(x - moonC[0], y - moonC[1]) < (moonR + 8) * Q;
  const nearCrest = (x, y) => y < h / 2 && Math.abs(x - w / 2) < 22 * P;
  const nearHill = (x, y) => site && !onBar && y > h - 100 && x > w / 2;
  for (let x = o + 44; x < w - o - 30; x += step) if (!nearMoon(x, mid) && !nearCrest(x, mid)) studs += center(star(false), x, mid, P);
  if (!site) for (let x = o + 44; x < w - o - 30; x += step) studs += center(star(false), x, h - mid, P);
  for (let y = o + 44; y < h - o - (site ? 40 : 30); y += step) for (const x of [mid, w - mid]) if (!nearMoon(x, y) && !nearHill(x, y)) studs += center(star(false), x, y, P);
  // 모서리 별 판(오른쪽 위는 달) — 아래 둘은 둔덕 위에 얹는다(나중에 그림)
  const cornerStars = [[mid, h - mid], [w - mid, h - mid]].map(([x, y]) => center(star(true), x, y, P)).join("");
  studs += center(star(true), mid, mid, P);
  if (!roomy) studs += center(star(true), w - mid, mid, P); // 달을 뺀 봇 카드는 오른쪽 위에도 별 판
  // 위 가운데 — 작은 호박 문장(밤 보라 판 위)
  const crest = grid();
  for (let x = -9; x <= 9; x++) for (let y = -1; y <= 6; y++) if (Math.abs(x) + Math.max(0, y - 4) * 2 <= 9 && Math.abs(x) <= 9 - Math.max(0, -y) * 2) crest.set(x, y, y === -1 ? NI[1] : y >= 5 ? NI[3] : NI[2]);
  crest.outline(NI[4]);
  // 봇 레벨업 · 역할 지급 카드는 사진이 위 가운데라 문장을 한 칸 올린다(사진 테에 덜 닿게)
  const crestY = mid + P - (!site && ctx?.kind && botTopOpen(ctx) ? P : 0);
  studs += center(crest, w / 2, crestY, P) + center(pumpkin(11, 8, true), w / 2, crestY, P);

  // ── 달 + 달 앞 박쥐 둘(날개 끝이 달 밖으로 조금 — 달에 겹쳐 한 덩어리) ──
  let sky = roomy ? center(moon(moonR), moonC[0], moonC[1], Q) : "";
  const batA = [moonC[0] - 1 * Q, moonC[1] + 2 * Q], batB = [moonC[0] - 13 * Q, moonC[1] + 11 * Q]; // 큰 박쥐는 달 한가운데(달빛에 비친 실루엣) · 작은 박쥐는 왼쪽 아래 가장자리에 걸쳐
  if (site) {
    sky += `<g class="${id}-fa">${center(bat(BAT[0]), batA[0], batA[1], Q)}${center(bat(BAT_S[0]), batB[0], batB[1], Q)}</g>`;
    sky += `<g class="${id}-fb" opacity="0">${center(bat(BAT[1]), batA[0], batA[1] + Q, Q)}${center(bat(BAT_S[1]), batB[0], batB[1] + Q, Q)}</g>`;
  } else if (roomy) {
    sky += center(bat(BAT[0]), batA[0], batA[1], Q) + center(bat(BAT_S[0]), batB[0], batB[1], Q);
  }

  // ── 바닥 띠 — 풀 둔덕 + 묘비 · 호박 · 유령 ──
  //   왼쪽 · 가운데는 낮은 둔덕(스탯 글자 아래 빈 줄 — 물건 위 끝 ≥ 514px),
  //   오른쪽 아래 구석(360 폭에서 x ≥ 232 — 스탯 오른쪽 칸 글자 밖, 카드 가운데 + 46)만 언덕으로 솟아 묘비 · 유령을 올린다. 봇은 낮은 둔덕 + 작은 호박만
  const fc = Math.round(floor / Q); // 바닥 칸(그림 칸 Q 기준)
  const x0 = Math.ceil(o / Q), x1 = Math.floor((w - o) / Q) - 1;
  const hillL = site && !onBar ? Math.round((w / 2 + 46) / Q) : x1 + 99; // 언덕 시작 칸(360 폭에서 226px). 무리가 막대 위로 가면 언덕 없이 낮은 둔덕만
  const ground = grid();
  // 📌 레벨 페이지 카드('1회 획득' 줄이 마지막) — 둔덕은 그 줄 숫자 아래까지만(풀 무더기 2칸 · 외곽선 1칸 포함), 솟는 묘비 · 유령 · 호박은
  //    둔덕 뒤로 내려앉아 위만 빼꼼(hwFloor.js — 바닥 줄 아래는 자른다). 조금(2칸 이하)만 솟으면 둔덕 앞에서 그만큼 낮게
  const limit = floorLimit(h, site, ctx);
  const capH = limit == null ? 99 : Math.max(2, Math.floor((floor - limit) / Q) - 3);
  const lay = (top) => { const d = sinkBy(limit, top, Q); return [d, d > 2 * Q]; };
  const hash = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 97;
  const height = (c) => {
    let H = site ? 6 : 3;
    if (site && c > hillL) { const u = Math.min(1, (c - hillL) / 26); H += Math.round(8 * Math.sin((u * Math.PI) / 2)); }
    H += Math.round(0.9 * Math.sin(c / 5.1) + 0.5 * Math.sin(c / 2.3 + 1));
    return Math.max(2, Math.min(capH, H));
  };
  for (let c = x0; c <= x1; c++) {
    const H = height(c);
    for (let j = 0; j < H; j++) {
      const y = fc - 1 - j;
      // 윗줄 밝게(가끔 빛) · 둘째 줄 바탕 · 아래는 그늘에 흙덩이(바탕 칸 두 개씩)를 드문드문
      let c0 = j === H - 1 ? (hash(c, 1) < 14 ? GR[0] : GR[1]) : j >= H - 3 ? GR[2] : GR[3];
      if (j < H - 3 && hash(c >> 1, y) < 9) c0 = GR[2];
      ground.set(c, y, c0);
    }
    // 풀 무더기 — 굵은 두 칸 덩이(가는 풀잎 없이)
    if (hash(c, 7) < 11 && c < x1 - 2 && c > x0 + 2) { ground.set(c, fc - 1 - H, GR[1]); ground.set(c + 1, fc - 1 - H, GR[2]); ground.set(c, fc - 2 - H, GR[0]); ground.set(c + 1, fc - 2 - H, GR[1]); }
  }
  ground.outline(GR[4]);
  const topAt = (px) => fc - height(Math.round(px / Q)); // 그 칸 둔덕 윗면 y(칸)
  let props = "", ghostSvg = "", back = "", sunk = "", hill = "";
  // 둔덕 위에 앉히기 — d: 더 내릴 거리(px). sitTop: 앉혔을 때 위 끝(px)
  const sitB = (g, xpx, sink) => (topAt(xpx + (g.box().w * Q) / 2) + sink) * Q;
  const sit = (g, xpx, sink = 1, d = 0) => put(g, Math.round(xpx / Q) * Q, sitB(g, xpx, sink) + d, Q);
  const sitTop = (g, xpx, sink = 1) => sitB(g, xpx, sink) - g.box().h * Q;
  if (site) {
    const gG = ghost(), sS = stone(9, 10, "pumpkin"), bS = stone(13, 15, "heart"), pF = pumpkin(13, 9, true), pS = pumpkin(8, 6);
    if (onBar) {
      // 막대 위 — 같은 무리(웃는 호박 · 작은 묘비 · 큰 묘비 · 뒤 유령 · 작은 호박)를 막대 윗면에 닿게(덮지 않게) 세운다. 오른쪽 끝은 테 안쪽에서 10px
      //   평평한 막대라 높낮이가 없어 웃는 호박이 작은 묘비의 호박 그림을 덮었다 → 두 칸 왼쪽으로(묘비 받침에만 살짝 겹침)
      // 📌 2026-10-11 오후 — 바닥 띠 소품(작은 호박 둘 · 작은 하트 묘비)까지 다 올린다(운영자 "다 올리던지 애매하게 해두냐" — 큰 무리만 올라가고 작은 것은 바닥에 남아 있었다).
      //    무리 밑엔 작은 풀 언덕 하나, 작은 호박 하나는 웃는 호박 옆 아기 호박으로. 작은 하트 묘비 · 다른 작은 호박은 무리가 길게 늘어져 뺐다(큰 묘비 + 작은 것 몇 개로 한 덩어리)
      //    아래 테 위 풀 둔덕 띠는 그대로 둔다 — 풀만, 그 위 소품 없이(10/11 저녁 운영자 "달빛 묘지는 잔디가 아래 있어서 어쩔 수 없다")
      //    왼쪽 등급 줄(가장 긴 '그랜드마스터까지 N레벨' = 글자 시작 + 176)에 닿지 않게, 좁은 카드는 작은 묘비 → 웃는 호박 → 오른쪽 작은 호박 순으로 뺀다.
      //    아기 호박은 낮아(위 끝이 막대 위 22px) 등급 줄 아래 틈에 들어가도 글자에 닿지 않는다 — 어느 폭이든 남긴다
      const G = Math.floor(barTop);
      const R = w - o - 5 * P - 10;
      const room = R - ((Number.isFinite(ctx.lineX0) ? ctx.lineX0 : o + 5 * P) + 180); // 등급 줄 글자 끝(가장 긴 경우 + 4px) ~ 무리 오른쪽 끝
      const hasS = room >= 51 * Q, hasF = room >= 41 * Q, hasR = room >= 27 * Q;
      const cR = hasR ? 27 : 24; // 오른쪽 끝 칸(큰 묘비 왼쪽 = 0) — 작은 호박(17 ~ 27). 빠지면 24(풀 언덕 오른쪽 비탈 — 무리 자리는 그대로)
      const bigX = R - cR * Q;
      const pT = pumpkin(7, 5);
      const fL = hasS ? -24 : -14, tL = hasF ? fL - 8 : -8; // 웃는 호박 · 아기 호박 왼쪽 칸
      // 풀 언덕 — 큰 묘비 밑(0 ~ 16칸)이 꼭대기(풀 HILL 칸), 양옆으로 둥글게 한 칸까지 낮아진다. 아래 외곽선이 막대 윗면 바로 위
      const cL = tL - 2;
      const hm = (c) => { const u = c < 0 ? -c / -cL : c > 16 ? (c - 16) / (cR + 1 - 16) : 0; return 1 + Math.round((HILL - 1) * Math.max(0, 1 - u * u)); };
      const hl = grid();
      for (let c = cL; c <= cR + 1; c++) {
        const H = hm(c);
        for (let j = 0; j < H; j++) hl.set(c, -2 - j, j === H - 1 ? (hash(c + 40, 1) < 14 ? GR[0] : GR[1]) : j === 0 && H > 2 ? GR[3] : GR[2]);
        if (hash(c + 40, 7) < 13 && c > cL + 1 && c < cR - 1) hl.set(c, -2 - H, GR[1]).set(c + 1, -2 - H, GR[2]); // 풀 무더기(두 칸)
      }
      hl.outline(GR[4]);
      hill = draw(hl, bigX, G, Q);
      // 언덕에 앉히기 — 물건 가운데 칸의 언덕 윗면(외곽선)에서 sink 칸 박는다. 막대 밑으로는 안 내려간다
      const on = (g, c, sink) => Math.min(G, G - (hm(Math.round(c + g.box().w / 2)) + 2 - sink) * Q);
      const bB = on(bS, 0, 3);
      ghostSvg = put(gG, bigX + GH_X * Q, bB - (bS.box().h + GH_GAP) * Q, Q); // 큰 묘비 꼭대기보다 GH_GAP 칸 위에 아래 끝 — 몸 전체가 보인다(둥실 2px 은 위로)
      if (hasS) back += put(sS, bigX - 12 * Q, on(sS, -12, 2), Q); // 작은 묘비는 언덕 뒤(풀이 받침을 덮는다)
      props += put(bS, bigX, bB, Q);
      if (hasF) props += put(pF, bigX + fL * Q, on(pF, fL, 3), Q);
      props += put(pT, bigX + tL * Q, Math.max(on(pT, tL, 2), G - 2 * Q), Q); // 언덕 비탈이 높아도 위 끝은 막대 위 22px 아래(등급 줄 밑 틈)
      if (hasR) props += put(pS, bigX + 17 * Q, on(pS, 17, 2), Q);
    } else {
      // 오른쪽 아래 구석 — 큰 묘비(하트 새김) · 작은 묘비(호박 그림) · 묘비 뒤 유령 · 웃는 호박 · 작은 호박(한 무리로 같이 내린다)
      const bigX = w - o - 6 * P - 56;
      const ghB = (topAt(bigX + 16 * Q) - 6) * Q; // 유령 아래 끝
      const [d, bk] = lay(Math.min(ghB - gG.box().h * Q, sitTop(sS, bigX - 12 * Q, 2), sitTop(bS, bigX, 2), sitTop(pF, bigX - 22 * Q, 3), sitTop(pS, bigX + 17 * Q, 2)));
      // 유령 — 큰 묘비 오른쪽 뒤에서 빼꼼(묘비보다 먼저 그려 뒤로)
      const gh = put(gG, bigX + 9 * Q, ghB + d, Q);
      const bs = sit(sS, bigX - 12 * Q, 2, d);
      const fs = sit(bS, bigX, 2, d) + sit(pF, bigX - 22 * Q, 3, d) + sit(pS, bigX + 17 * Q, 2, d);
      if (bk) sunk += `<g class="${id}-gh">${gh}</g>` + bs + fs;
      else { ghostSvg = gh; back += bs; props += fs; }
    }
    // 왼쪽 · 가운데 낮은 둔덕 — 작은 호박 둘 · 작은 하트 묘비 하나(막대 위 시안은 바닥 띠째 위 무리로 올렸다)
    if (!onBar) for (const [g, x] of [[pumpkin(7, 5), 56], [stone(7, 7, "heart", false), Math.round(w / 2) - 34], [pumpkin(7, 5), Math.round(w / 2) - 12]]) {
      const [d2, bk2] = lay(sitTop(g, x, 2));
      const s = sit(g, x, 2, d2);
      if (bk2) sunk += s;
      else props += s;
    }
  } else if (roomy) {
    for (const [xx, W, H] of [[0.05, 8, 6], [0.22, 7, 5], [0.78, 8, 6], [0.92, 7, 5]]) props += sit(pumpkin(W, H), Math.round(w * xx), 2);
  }
  props += site ? cornerStars : "";
  if (!site) studs += cornerStars;

  const defs =
    `<pattern id="${id}-st" width="46" height="46" patternUnits="userSpaceOnUse"><path d="M6 9h1v1h-1zM30 4h1v1h-1zM19 27h1v1h-1zM40 35h1v1h-1zM11 40h1v1h-1z" fill="#fff1a8" fill-opacity="0.22"/></pattern>` +
    (site
      ? `<style>@keyframes ${id}A{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes ${id}B{0%,49.9%{opacity:0}50%,100%{opacity:1}}` +
        `@keyframes ${id}Bob{0%,49.9%{transform:translateY(0)}50%,100%{transform:translateY(-2px)}}` +
        `.${id}-fa{animation:${id}A .7s infinite}.${id}-fb{animation:${id}B .7s infinite}.${id}-gh{animation:${id}Bob 2.4s infinite}` +
        `@media (prefers-reduced-motion:reduce){.${id}-fa,.${id}-fb,.${id}-gh{animation:none}}</style>`
      : "");
  const under = ctx.onScene ? "" : `<rect width="${w}" height="${h}" fill="url(#${id}-st)"/>`;
  const sunkG = behind(meta.key, w, h, floor, sunk);
  const over =
    `<g shape-rendering="crispEdges">${frame}${studs}${sky}${sunkG.svg}` +
    `<g${site ? ` class="${id}-gh"` : ""}>${ghostSvg}</g>` +
    `${back}${draw(ground, 0, 0, Q)}${hill}${props}</g>`;
  return { defs: defs + sunkG.defs, under, over };
}
