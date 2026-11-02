// 유물 「사건의 지평선」 도트 조각(배경 · 프로필 · 테두리 · 막대)
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
import { grid, circlePts } from "./grid";
import { G, inTextCell, textFadeCell } from "./geo";

const hyp = Math.hypot, PR = 28, TAU = Math.PI * 2;
export const GW = 96, GH = 92, PCX = 48, PCY = 48; // 프로필 판(시안 profile.mjs 와 같다)
export const CORES = {
  void: { name: "보이드 바이올렛", sub: "기본", p0: "#1a0b2e", p1: "#3b1e54", p2: "#7a3fc2", p3: "#c08cff", p4: "#efe0ff" },
  crimson: { name: "크림슨 레드", sub: "폭주", p0: "#2a0710", p1: "#6e0f22", p2: "#d4213b", p3: "#ff6a5a", p4: "#ffd6cc" },
  gold: { name: "황금", sub: "초월", p0: "#3a1d08", p1: "#8a4a12", p2: "#efb043", p3: "#ffe08f", p4: "#fff8e7" },
  cyan: { name: "네온 시안", sub: "특이점", p0: "#04232c", p1: "#05606f", p2: "#00bccf", p3: "#00f0ff", p4: "#d6ffff" },
  // 11/2 운영자 "레드 빼고 하얀색 넣고 파란색 대신 벚꽃" → 고르기 넷 = 보이드 · 순백 · 골드 · 벚꽃(크림슨 · 시안은 옛 판 비교용으로만 남김)
  white: { name: "순백", sub: "화이트 홀", p0: "#17171f", p1: "#3c3d4b", p2: "#9496aa", p3: "#d9dbe7", p4: "#f5f6fb" },
  sakura: { name: "벚꽃", sub: "만개", p0: "#2b0c1d", p1: "#6e2348", p2: "#e66a9c", p3: "#ffb0cd", p4: "#ffe8f0" },
};
export const colorsOf = (k) => ({ ...(CORES[k] || CORES.void), w: "#ffffff", k0: "#000000", k1: "#05040a", k2: "#0a0812", k3: "#100c1c" });
const rndOf = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
export const inText = (x, y) => inTextCell(x, y);
const noise = (a, b) => 0.5 + 0.25 * Math.sin(a * 2 + b * 0.9) + 0.15 * Math.sin(a * 3 - b * 1.3 + 1.1) + 0.1 * Math.sin(a * 5 + b * 2.2 + 2.3);

export function hzBg({ s = 1, t = 0, streaks = true, threads = true, wave = null } = {}) { // wave: { R, A, W } 칸 — 렌즈 파동(지나가는 자리를 바깥으로 밀어 휨) // streaks: 별 꼬리(끄면 머리 한 칸만) · threads: 유입 줄기
  const CW = G.CW, CH = G.CH, AX = G.CX / 3, AY = G.CY / 3, g = grid(CW, CH), rnd = rndOf(21);
  const K = 1.35 * s; // 나선 감김
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const dx = x + 0.5 - AX, dy = y + 0.5 - AY, r = Math.max(hyp(dx, dy), 1), th = Math.atan2(dy, dx);
    const rw = wave ? Math.max(r - wave.A * Math.exp(-(((r - wave.R) / wave.W) ** 2)), 1) : r;
    const phi = th + K * Math.log(rw) - t * TAU;
    const arm = 0.5 + 0.5 * Math.cos(2 * phi);
    const neb = arm * noise(phi * 2, r * 0.05) * Math.max(0.3, 1 - r / 230);
    const ck = (x + y) % 2 === 0, nb = neb * (0.4 + 0.6 * textFadeCell(x, y)); // 글자 자리는 성운을 눌러 옅게 — 경계는 24px 에 걸쳐 서서히(딱 끊으면 글자마다 네모 상자가 보였다)
    let c = r < 70 ? "k3" : r < 120 ? "k2" : "k1";
    if (nb > 0.62) c = ck ? "p2" : "p1";
    else if (nb > 0.48) c = ck ? "p1" : "p0";
    else if (nb > 0.34) c = ck ? "p0" : c;
    g.put(x, y, c);
  }
  // 유입 줄기 — 멀리서 프로필로 감겨 드는 밝은 실 두 가닥(글자 자리는 짙게)
  for (const [th0, r0] of threads ? [[0.55, 200], [-0.35, 150]] : []) {
    for (let r = r0; r > 17; r -= 0.4) {
      const th = th0 + K * Math.log(r0 / r) * 0.9 - t * TAU;
      const x = Math.round(AX + Math.cos(th) * r), y = Math.round(AY + Math.sin(th) * r);
      if (x < 0 || y < 0 || x >= CW || y >= CH) continue;
      const f = 1 - r / r0;
      if (inText(x, y)) { if ((x + y) % 2 === 0) g.put(x, y, "p1"); continue; }
      g.put(x, y, f > 0.75 ? "p4" : f > 0.45 ? "p3" : f > 0.2 ? "p2" : (x + y) % 2 ? "p2" : "p1");
    }
  }
  // 별 — 나선 길을 따라 끌려감. 프로필에 가까울수록 꼬리가 길고 밝다
  const RMAX = 195, RMIN = 16;
  for (let i = 0; i < 230; i++) {
    const p0 = rnd(), thA = rnd() * TAU, b = rnd();
    const u = (p0 + t * (1 + (i % 3))) % 1;              // 별마다 빠르기 1 · 2 · 3 배(한 바퀴에 정수 번 돌아 이음새 없음)
    const r0 = RMAX - u * (RMAX - RMIN), th0 = thA + K * Math.log(RMAX / r0);
    const len = streaks ? (2 + 20 * Math.max(0, 1 - r0 / 160)) * s : 0;
    for (let k = 0; k <= len; k++) {
      const r = r0 + k * 0.9, th = th0 - (k * 0.9 * K) / r, rr = wave ? r + wave.A * Math.exp(-(((r - wave.R) / wave.W) ** 2)) : r;
      const x = Math.round(AX + Math.cos(th) * rr), y = Math.round(AY + Math.sin(th) * rr);
      if (x < 0 || y < 0 || x >= CW || y >= CH) break;
      const f = k / Math.max(len, 1);
      if (inText(x, y)) { if (k === 0 && b < 0.5) g.put(x, y, "p1"); continue; }
      g.put(x, y, k === 0 ? (b < 0.3 ? "w" : b < 0.7 ? "p4" : "p3") : f < 0.35 ? "p3" : f < 0.7 ? "p2" : (x + y) % 2 ? "p1" : null);
    }
  }
  const RR = 16.5 + 1.2 * s;
  for (const [x, y] of circlePts(Math.round(AX), Math.round(AY), Math.round(RR))) {
    const a = Math.atan2(y - AY, x - AX) + (t * TAU) / 3, band = Math.sin(a * 3);
    if (band > 0.35) g.put(x, y, band > 0.8 ? "p3" : "p2");
  }
  return g;
}
export function hzFrame({ rot = 0, s = 1, disk = true, shadow = true, lens = true } = {}) { // disk: 도트 강착원반 · shadow: 사진 둘레 칠흑 띠 · lens: 위로 휘어 넘는 빛 띠
  const back = grid(GW, GH), front = grid(GW, GH);
  const TILT = (-22 * Math.PI) / 180, A_IN = PR + 4, A_OUT = PR + 20 + 3 * s, FLAT = 0.21;
  // 강착원반 — 사진 뒤(뒤쪽 반)와 사진 밖 앞쪽 반. 사진 위로는 그리지 않는다(금 간 것처럼 보였음). 왼쪽(다가오는 쪽)이 더 밝다
  for (let y = 0; y < (disk ? GH : 0); y++) for (let x = 0; x < GW; x++) {
    const px = x + 0.5 - PCX, py = y + 0.5 - PCY;
    const u = px * Math.cos(TILT) + py * Math.sin(TILT), v = -px * Math.sin(TILT) + py * Math.cos(TILT);
    const rho = hyp(u, v / FLAT);
    if (rho < A_IN || rho > A_OUT) continue;
    if (hyp(px, py) <= PR + 2) { // 사진 앞을 지나는 원반 띠(앞 반쪽만) — 안쪽 뜨거운 겹을 또렷한 띠로(11/2 운영자 "프로필에 지나가던 고리가 왜 없어졌어")
      if (v <= 0) continue;
      const f2 = (rho - A_IN) / (A_OUT - A_IN);
      if (f2 > 0.62) continue;
      const ang2 = (Math.atan2(v / FLAT, u) * 180) / Math.PI, sw2 = Math.sin(((ang2 * 2 - rot) * Math.PI) / 40);
      front.put(x, y, f2 < 0.18 ? "w" : f2 < 0.42 ? (sw2 > 0.2 ? "w" : "p4") : f2 < 0.54 ? "p3" : "p2");
      continue;
    }
    const f = (rho - A_IN) / (A_OUT - A_IN), lead = u < 0;
    const ang = (Math.atan2(v / FLAT, u) * 180) / Math.PI, swirl = Math.sin(((ang * 2 - rot) * Math.PI) / 40);
    const c = f < 0.22 ? (lead ? "w" : "p4") : f < 0.5 ? (lead || swirl > 0.2 ? "p4" : "p3") : f < 0.78 ? (swirl > 0.4 ? "p4" : "p3") : (x + y) % 2 ? "p2" : "p1";
    (v > 0 ? front : back).put(x, y, c);
  }
  // 위로 휘어 넘어온 원반 빛(렌즈) — 사진 위쪽을 두껍게 감싸는 초승 띠(가운데 두껍고 양끝 가늘게) · 아래는 가는 호
  for (let y = 0; y < (lens ? GH : 0); y++) for (let x = 0; x < GW; x++) {
    const dx = x + 0.5 - PCX, dy = y + 0.5 - PCY, d = hyp(dx, dy);
    const L0 = shadow ? PR + 3 : PR + 1; // 휘어 넘는 빛 띠 시작(칠흑 띠를 빼면 빛 고리 바로 바깥부터)
    if (d <= L0) continue;
    const a = Math.atan2(dy, dx);
    const up = Math.max(0, -Math.sin(a + 0.2));
    const top = L0 + (2 + 7 * s) * Math.pow(up, 0.8);
    if (dy < 4 && d <= top) { const f = (d - L0) / Math.max(top - L0, 0.1); back.put(x, y, f < 0.28 ? "w" : f < 0.55 ? "p4" : f < 0.8 ? "p3" : (x + y) % 2 ? "p2" : "p1"); }
    else if (dy >= 4 && d <= PR + 4.6) back.put(x, y, d <= PR + 3.8 ? "p3" : "p2");
  }
  // 사건의 지평선 — 사진 둘레 칠흑 띠(두 칸) + 흰 빛 고리(광자 고리) + 회전하는 뜨거운 점 둘
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const d = hyp(x + 0.5 - PCX, y + 0.5 - PCY);
    const R1 = shadow ? PR + 2 : PR; // 칠흑 띠를 빼면 빛 고리가 사진에 바로 붙는다
    if (shadow && d > PR && d <= PR + 2) front.put(x, y, "k0");
    else if (d > R1 && d <= R1 + 1) {
      const a = (Math.atan2(y + 0.5 - PCY, x + 0.5 - PCX) * 180) / Math.PI;
      const hot = Math.abs(((a - rot + 540) % 360) - 180) < 28 || Math.abs(((a - rot - 180 + 540) % 360) - 180) < 18;
      front.put(x, y, hot ? "w" : "p4");
    }
  }
  return { back, front };
}
export function hzBorder({ pulse = 1, shard = 0, jets = true, tears = true, runners = [], glow = 0 } = {}) { // runners: 제트를 달리는 밝은 매듭 위치(0~1) · glow: 뿌리 충전 빛(0~1) // tears: 도트 틈(끄면 제트만 — 모서리는 선 판이 그린다)
  const CW = G.CW, CH = G.CH, g = grid(CW, CH), rnd = rndOf(77);
  // 틈 — 모서리에서 안쪽으로 찢긴 번개 모양(꺾이는 점 다섯), 속 칠흑 · 둘레 한 칸 흰빛 · 그 바깥 한 칸 코어 색 · 떨어져 나가는 파편 셋
  const tear = (cx, cy, sx, sy, pts) => {
    const poly = pts.map(([a, b]) => [cx + sx * a, cy + sy * b]);
    const inP = (px, py) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };
    const cells = new Set();
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inP(x + 0.5, y + 0.5)) cells.add(x + "," + y);
    const has = (x, y) => cells.has(x + "," + y);
    for (const k of cells) { const [x, y] = k.split(",").map(Number); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { if (has(x + a, y + b)) continue; const o2 = [[a * 2, b * 2]].some(([p, q]) => !has(x + p, y + q)); g.put(x + a, y + b, "w"); if (o2 && !has(x + a * 2, y + b * 2)) g.put(x + a * 2, y + b * 2, g.get(x + a * 2, y + b * 2) || "p3"); } }
    for (const k of cells) { const [x, y] = k.split(",").map(Number); g.put(x, y, "k0"); }
    // 파편(흰 테 마름모)은 뺌 — 운영자 "주변에 이런거 좀 짜친다"
  };
  // 꺾이는 점(모서리 기준 안쪽 칸) — 번개처럼 들쭉날쭉한 쐐기
  const SHAPE = [[0, 0], [7, 1], [5, 3], [11, 4], [8, 6], [13, 9], [6, 7], [4, 11], [3, 6], [1, 8]];
  if (tears) { tear(0, 0, 1, 1, SHAPE); tear(CW - 1, 0, -1, 1, SHAPE); tear(CW - 1, CH - 1, -1, -1, SHAPE); tear(0, CH - 1, 1, -1, SHAPE); }
  // 제트 — 틈에서 시계 방향으로 테를 따라 뻗는 빛줄기: 뿌리 세 칸 → 끝 한 칸으로 뾰족, 가운데 줄 흰빛 → 코어 색
  const jet = (x0, y0, dx, dy, L) => {
    L = Math.round(L * pulse);
    const nx = -dy, ny = dx;
    for (let k = 0; k < L; k++) {
      const f = k / L, x = x0 + dx * k, y = y0 + dy * k;
      const root = k < 8 ? 1 : k < 16 ? 2 : 3; // 뿌리: 한 칸 바늘(8칸) → 세 칸(8칸) → 다섯 칸
      g.put(x + nx, y + ny, k < 2 ? "w" : f < 0.4 ? "w" : f < 0.75 ? "p4" : "p3");
      if (root >= 2 && f < 0.7) { g.put(x, y, f < 0.35 ? "p4" : "p3"); g.put(x + nx * 2, y + ny * 2, f < 0.35 ? "p3" : "p2"); }
      if (root >= 3 && f < 0.35) { g.put(x - nx, y - ny, "p2"); g.put(x + nx * 3, y + ny * 3, "p1"); }
    }
    // 질주 매듭 — 세 칸 굵기 흰 덩어리 + 뒤로 네 칸 꼬리
    for (const q of runners) {
      const k0 = Math.round(q * (L - 1)), x = x0 + dx * k0, y = y0 + dy * k0;
      for (let a = -1; a <= 1; a++) for (let b = 0; b <= 2; b++) g.put(x + dx * a + nx * b, y + dy * a + ny * b, a === 0 || b === 1 ? "w" : "p4");
      for (let k = 2; k <= 5; k++) g.put(x - dx * k + nx, y - dy * k + ny, k < 4 ? "w" : "p4");
    }
    // 뿌리 충전 빛 — 제트 뿌리가 테를 따라 짧고 굵은 흰 토막으로 달아오름(길이 · 굵기 ∝ glow). 모서리에 공을 만들지 않는다
    if (glow > 0) { const len = Math.round(3 + glow * 9); for (let k = 0; k < len; k++) for (let b2 = -1; b2 <= 3; b2++) { if ((b2 === -1 || b2 === 3) && k > len * glow) continue; g.put(x0 + dx * k + nx * b2, y0 + dy * k + ny * b2, b2 === 1 || (b2 >= 0 && b2 <= 2 && k < len * 0.6) ? "w" : "p4"); } }
  };
  const LX = Math.round(CW * 0.525), LY = Math.round(CH * 0.481); // 제트 길이 — 변 길이의 반쯤
  if (jets) { jet(6, 1, 1, 0, LX); jet(CW - 2, 6, 0, 1, LY); jet(CW - 7, CH - 2, -1, 0, LX); jet(1, CH - 7, 0, -1, LY); }
  return g;
}
export function hzBarCells(pct = 0.49, { spark = 0, squeeze = 0, pulses = [] } = {}) { // pulses: 달리는 빛 덩어리 위치(0~1)
  const BW = G.BW, W = BW + 8, H = 19, ox = 3, oy = 5, g = grid(W, H), rnd = rndOf(3 + spark);
  const T = 9 - Math.round(squeeze * 4); // 관 높이(칸)
  const top = oy + Math.floor((9 - T) / 2);
  for (let x = 0; x < BW; x++) for (let y = 0; y < T; y++) {
    if ((x === 0 || x === BW - 1) && (y === 0 || y === T - 1)) continue;
    const edge = y === 0 || y === T - 1 || x === 0 || x === BW - 1, ring = x % 17 >= 15;
    g.put(x + ox, y + top, ring ? (y === 0 ? "#6a6290" : "#3a3456") : edge ? (y === 0 ? "p1" : "p0") : "k1");
  }
  const head = Math.round(2 + (BW - 6) * pct);
  for (let x = 1; x < head; x++) for (let y = 1; y < T - 1; y++) {
    if (x % 17 >= 15) continue;
    const mid = Math.abs(y - (T - 1) / 2), f = x / head;
    g.put(x + ox, y + top, mid < 0.6 ? (f > 0.7 ? "p4" : "p3") : mid < 1.6 ? (f > 0.5 ? "p3" : "p2") : "p1");
  }
  for (const p of pulses) { const px = Math.round(1 + p * (head - 6)); for (let x = px; x < px + 5; x++) for (let y = 1; y < T - 1; y++) { if (x % 17 >= 15) continue; g.put(x + ox, y + top, Math.abs(y - (T - 1) / 2) < 1.6 ? "w" : "p4"); } }
  // 입자 · 스파크 — 차오른 쪽 안에서 흰 점, 앞머리 가까이 십자 불꽃
  for (let i = 0; i < 26; i++) { const x = 2 + Math.floor(rnd() * (head - 3)), y = 1 + Math.floor(rnd() * (T - 2)); if (x % 17 < 15) g.put(x + ox, y + top, "w"); }
  for (let i = 0; i < 3; i++) { const x = head - 4 - Math.floor(rnd() * 14) + ox, y = top + Math.floor(T / 2) + (i - 1); [[0, 0, "w"], [1, 0, "p4"], [-1, 0, "p4"], [0, 1, "p4"], [0, -1, "p4"]].forEach(([a, b, c]) => g.put(x + a, y + b, c)); }
  for (let x = head + 3; x < BW - 2; x += 4) if (x % 17 < 15) g.put(x + ox, top + Math.floor(T / 2), "p0");
  // 앞머리 충돌 섬광 — 세로로 관 밖까지 튀는 네 갈래
  const hx = head + ox, hy = top + Math.floor(T / 2);
  for (const [dx, dy, L] of [[1, 0, 4], [-1, 0, 3], [0, -1, 6], [0, 1, 6], [1, -1, 3], [1, 1, 3], [-1, -1, 2], [-1, 1, 2]]) for (let k = 1; k <= L; k++) g.put(hx + dx * k, hy + dy * k, k <= 1 ? "w" : k <= 3 ? "p4" : "p3");
  g.put(hx, hy, "w");
  return { g, ox, oy };
}