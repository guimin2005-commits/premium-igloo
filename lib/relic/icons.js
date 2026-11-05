// 📌 「사건의 지평선」 아이콘 조각(2026-11-03 운영자 — 커스텀 창 「아이콘」 줄) — 대시보드 카드 단추 아이콘(인벤토리 · 시즌 패스 · 강화 · 업적)을 바꾼다
//   0 기본(지금 선 아이콘 — 운영자 "기존 것도 선택 가능하게") · 1 궤도 · 2 파편 · 3 렌즈. 색은 코어 색을 따른다. 그림 코드는 시안 .claude/mockups/season3/relicicons.mjs 와 같다(고칠 땐 시안부터)
//   relicIconSvg(kind, style, core, t, i) → viewBox "-24 -24 48 48" 안에 그릴 SVG 조각(가운데 0,0 · 아이콘 칸 30px · 고리 · 파편은 바깥까지). t 0~1 한 바퀴(4.4초) · i 아이콘 순번(서로 어긋나게)
import { colorsOf } from "./horizon.js";

export const ICON_KINDS = ["bag", "star", "bolt", "trophy"];
export const ICON_NAMES = ["기본", "궤도", "파편", "렌즈"];
export const ICON_LOOP_MS = 40 * 110;

const f2 = (n) => Math.round(n * 100) / 100;
const TAU = Math.PI * 2;

// 작은 도트 한 칸(가운데 x, y · 한 변 s)
const px = (x, y, s, c, op = 1) => `<rect x="${f2(x - s / 2)}" y="${f2(y - s / 2)}" width="${s}" height="${s}" fill="${c}"${op < 1 ? ` fill-opacity="${f2(op)}"` : ""}/>`;

// ── 1 궤도 ── 도트 아이콘(2 파편과 같은 칠, 금 없음) + 거의 가로로 누운 도트 고리 한 줄(뒤 반은 아이콘 뒤 · 앞 반은 앞) + 고리를 도는 흰 빛 칸과 꼬리
function orbit(k, C, t, i) {
  const cells = iconCells(k), on = new Set(cells.map(([x, y]) => x + "," + y));
  let icon = "";
  for (const [x, y] of cells) icon += cellR(x * 2 - ICON_O, y * 2 - ICON_O, shadeOf(C, on, x, y));
  const rot = (-9 * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot), oy = 1; // 거의 가로(많이 기울이면 도트 계단이 아이콘을 사선으로 긋는 것처럼 보였다)
  const back = new Map(), front = new Map();
  const put = (m, x, y, c) => { const kx = snap(x) + "," + snap(y); if (!m.has(kx)) m.set(kx, c); };
  for (const [rx, ry, cb, cf] of [[21, 4.4, C.p2, C.p4]]) {
    for (let q = 0; q < 240; q++) {
      const th = (q / 240) * TAU, ex = rx * Math.cos(th), ey = ry * Math.sin(th), x = ex * cr - ey * sr, y = ex * sr + ey * cr + oy;
      if (ey < 0) put(back, x, y, cb); else put(front, x, y, cf);
    }
  }
  // 도는 빛 칸 — 머리 흰색 · 꼬리 p4 둘
  const ph = i * 0.27, hot = { b: "", f: "" };
  for (let j = 0; j < 3; j++) {
    const th = TAU * (t * 2 + ph) - j * 0.16, ex = 21 * Math.cos(th), ey = 4.4 * Math.sin(th), x = snap(ex * cr - ey * sr), y = snap(ex * sr + ey * cr + oy);
    hot[ey < 0 ? "b" : "f"] += cellR(x, y, j ? C.p4 : C.w);
  }
  const rects = (m) => [...m].map(([kx, c]) => { const [x, y] = kx.split(",").map(Number); return cellR(x, y, c); }).join("");
  // 뒤 고리는 아이콘이 덮고 · 앞 고리는 아이콘 위
  return `<g shape-rendering="crispEdges">${rects(back)}${hot.b}${icon}${rects(front)}${hot.f}</g>`;
}

// ── 2 파편 ── 속을 채운 도트 아이템 아이콘(15 × 15 칸 · 칸 2px) — 아이콘 꼴 다각형으로 칸을 고르고 위 왼쪽 빛 · 아래 오른쪽 그늘로 칠한다.
//   아래 오른쪽 모서리 한 조각만 금이 가 떨어졌다 붙었다 · 둘레를 떠도는 파편
// 모양 — 24 칸 좌표 다각형(아이콘 선 모양과 같은 꼴). 칸 가운데가 안이거나 변에 아주 가까우면 칸을 켠다(가는 번개 끝이 사라지지 않게)
const STAR = Array.from({ length: 10 }, (_, j) => { const r = j % 2 ? 4.7 : 11, a = -Math.PI / 2 + (j * Math.PI) / 5; return [12 + r * Math.cos(a), 12.8 + r * Math.sin(a)]; });
const SHAPES = {
  bag: { polys: [[[5.6, 8], [18.4, 8], [20.6, 21.6], [3.4, 21.6]]], rings: [{ cx: 12, cy: 7.6, r0: 2.6, r1: 4.6, keep: (X, Y) => Y <= 8 }] },
  star: { polys: [STAR] },
  bolt: { polys: [[[13.6, 1.4], [3.6, 13.6], [10.6, 13.6], [7.6, 22.8], [20.4, 9.4], [13.4, 9.4], [18.4, 1.4]]] },
  trophy: {
    polys: [[[5.8, 2.6], [18.2, 2.6], [17.8, 8], [15.6, 11.6], [13, 13.2], [11, 13.2], [8.4, 11.6], [6.2, 8]], [[10.6, 12.8], [13.4, 12.8], [13.4, 17.4], [10.6, 17.4]], [[7.6, 17.2], [16.4, 17.2], [18, 21.8], [6, 21.8]]],
    rings: [{ cx: 5.6, cy: 6.4, r0: 1.7, r1: 3.5, keep: (X) => X < 6.6 }, { cx: 18.4, cy: 6.4, r0: 1.7, r1: 3.5, keep: (X) => X > 17.4 }],
  },
};
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const segD = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - u * dx, py - ay - u * dy); };
const cellCache = new Map();
function iconCells(k) {
  if (cellCache.has(k)) return cellCache.get(k);
  const N = 15, sc = 24 / N, S = SHAPES[k], out = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const X = (x + 0.5) * sc, Y = (y + 0.5) * sc;
    let hit = S.polys.some((P) => inPoly(P, X, Y) || P.some((p, i) => segD(X, Y, p, P[(i + 1) % P.length]) < sc * 0.28));
    if (!hit && S.rings) hit = S.rings.some((R) => { const d = Math.hypot(X - R.cx, Y - R.cy); return d >= R.r0 && d <= R.r1 && R.keep(X, Y); });
    if (hit) out.push([x, y]);
  }
  cellCache.set(k, out);
  return out;
}
// 도트 아이콘 칠 — 위 · 왼쪽 가장자리 p4, 아래 · 오른쪽 가장자리 p2, 속 p3, 위 왼쪽 몇 칸 흰 빛(어두운 p1 은 카드 바탕에 묻혀 안 씀)
function shadeOf(C, on, x, y) {
  const top = !on.has(x + "," + (y - 1)), left = !on.has(x - 1 + "," + y), bot = !on.has(x + "," + (y + 1)), right = !on.has(x + 1 + "," + y);
  let c = C.p3;
  if (top || left) c = C.p4;
  else if (bot || right) c = C.p2;
  if (x + y <= 9 && (top || left)) c = C.w;
  return c;
}
const ICON_O = 15; // 15 칸 × 2px 의 반 — 칸 왼쪽 위 = x * 2 - 15
const snap = (v) => 2 * Math.floor((v + ICON_O) / 2) - ICON_O; // 고리 · 팔 칸도 아이콘 칸과 같은 격자에
const cellR = (x, y, c) => `<rect x="${x}" y="${y}" width="2" height="2" fill="${c}"/>`;
function shards(k, C, t, i) {
  const N = 15, cs = 2, o = (N * cs) / 2, cells = iconCells(k), on = new Set(cells.map(([x, y]) => x + "," + y));
  const gap = 0.4 + 1.2 * (0.5 - 0.5 * Math.cos(TAU * (t * 2 + i * 0.3)));
  const CUT = N + 6; // x + y 가 이 값 이상 = 떨어져 나가는 모서리 조각, 같으면 금(빈 칸)
  let body = "";
  for (const [x, y] of cells) {
    const d = x + y - CUT;
    if (d === 0) continue;
    const c = shadeOf(C, on, x, y), sh = d > 0 ? gap : 0;
    body += `<rect x="${f2(x * cs - o + sh)}" y="${f2(y * cs - o + sh)}" width="${cs}" height="${cs}" fill="${c}"/>`;
  }
  // 떠도는 파편 — 둘레 반지름 15~19 를 천천히 돌며 둥실(작은 마름모 + 도트). 떨어진 모서리 쪽(아래 오른쪽)에 더 몰림
  let fl = "";
  for (let j = 0; j < 6; j++) {
    const a = TAU * (0.125 + (j - 2.5) * 0.11 + Math.sin(TAU * (t + j * 0.21)) * 0.04 + i * 0.05), r = 15 + (j % 3) * 1.8 + Math.sin(TAU * (t * 2 + j * 0.37)) * 1.1;
    const x = r * Math.cos(a), y = r * Math.sin(a);
    if (j % 2) fl += px(x, y, j === 3 ? 2 : 1.5, j === 1 ? C.w : C.p3);
    else { const s = j === 2 ? 2.8 : 2; fl += `<path d="M ${f2(x)} ${f2(y - s)} L ${f2(x + s * 0.6)} ${f2(y)} L ${f2(x)} ${f2(y + s)} L ${f2(x - s * 0.6)} ${f2(y)} Z" fill="${C.p4}" transform="rotate(${f2(a * 57.3 + t * 90)} ${f2(x)} ${f2(y)})"/>`; }
  }
  return fl + `<g shape-rendering="crispEdges">${body}</g>`;
}

// ── 3 렌즈(11/3 — 소용돌이 · 실루엣 판이 아쉬워 운영자가 「렌즈」를 고름) ──
//   도트 아이콘(1 · 2 와 같은 칠) + 둘레 빛 고리(아인슈타인 고리 — 평소엔 밝은 호 둘만 천천히 돎. 꽉 찬 고리는 동그란 판처럼 보였다).
//   한 바퀴마다: 가운데서 중력 물결이 바깥으로 지나가며 아이콘 칸이 한 칸씩 부풀었다 돌아옴 · 호가 길어짐 → 물결이 고리에 닿으면 고리 전체가 한 번 밝아짐 → 평소
function lens(k, C, t, i) {
  const cells = iconCells(k), on = new Set(cells.map(([x, y]) => x + "," + y));
  const p = (t * 2 + i * 0.15) % 1;
  const W0 = 0.18, W1 = 0.58, wave = p >= W0 && p <= W1 ? ((p - W0) / (W1 - W0)) * 13 : -9; // 물결 반지름(px)
  const flash = p > W1 && p < W1 + 0.2 ? 1 - (p - W1) / 0.2 : 0; // 고리 번쩍(물결이 닿은 뒤 옅어짐)
  // 아이콘 — 물결 띠(±2.2px)에 든 칸은 제자리에 둔 채 바깥 쪽으로 한 칸 더 번져 부풀었다 돌아옴(칸을 옮기면 속에 구멍이 뚫려 보였다)
  let icon = "", bulge = "";
  for (const [x, y] of cells) {
    const X = x * 2 - ICON_O, Y = y * 2 - ICON_O, cx = X + 1, cy = Y + 1, d = Math.hypot(cx, cy), c = shadeOf(C, on, x, y);
    icon += cellR(X, Y, c);
    if (Math.abs(d - wave) < 2.2 && d > 0.5) bulge += cellR(X + Math.round(cx / d) * 2, Y + Math.round(cy / d) * 2, c);
  }
  // 빛 고리 — 반지름 17.5, 밝은 호 둘(가운데 흰색 · 둘레 p4 · 끝 p2) · 번쩍일 땐 전체 p4
  const ring = new Map(), hot = TAU * (t + i * 0.13);
  for (let q = 0; q < 200; q++) {
    const a = (q / 200) * TAU, x = snap(17.5 * Math.cos(a)), y = snap(17.5 * Math.sin(a)), kx = x + "," + y;
    const d1 = Math.abs(Math.atan2(Math.sin(a - hot), Math.cos(a - hot))), d2 = Math.abs(Math.atan2(Math.sin(a - hot - Math.PI), Math.cos(a - hot - Math.PI))), dd = Math.min(d1, d2);
    const grow = wave > 0 ? (wave / 13) * 0.5 : 0, c = dd < 0.18 ? C.w : dd < 0.55 + grow || flash > 0.5 ? C.p4 : flash > 0.15 ? C.p3 : dd < 0.85 + grow ? C.p2 : null;
    if (c && !ring.has(kx)) ring.set(kx, c);
  }
  const ringSvg = [...ring].map(([kx, c]) => { const [x, y] = kx.split(",").map(Number); return cellR(x, y, c); }).join("");
  return `<g shape-rendering="crispEdges">${ringSvg}${icon}${bulge}</g>`;
}

const DRAW = { 1: orbit, 2: shards, 3: lens };
export function relicIconSvg(kind, style, core, t = 0.3, i = 0) {
  const f = DRAW[style];
  if (!f || !ICON_KINDS.includes(kind)) return "";
  return f(kind, colorsOf(["void", "white", "gold", "sakura"].includes(core) ? core : "void"), t, i);
}
