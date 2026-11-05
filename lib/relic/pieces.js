// 유물 고르기 조각(조각마다 1 · 2 · 3) · 조각끼리 이어지는 연출 · 레벨업 효과
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
import { grid, cellsSvg } from "./grid.js";
import { G, inTextPx, textFade } from "./geo.js";
import { colorsOf } from "./horizon.js";

let CX, CY, PR, W, H, GCW, GCH, TEXTPX; // 카드 자리 — 그릴 때마다 geo.mjs G 에서(옛 시안 카드 · 실제 카드)
const sync = () => { ({ CX, CY, PR, W, H, CW: GCW, CH: GCH, TEXT: TEXTPX } = G); }; sync();
const TAU = Math.PI * 2;
const f2 = (n) => Math.round(n * 100) / 100;
const rndOf = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
export const NAMES2 = {
  frame: ["가르강튀아", "파편 고리", "소용돌이"],
  border: ["제트", "렌즈 테", "지평선 잠식"],
  bg: ["나선 흡입", "중력 우물", "워프 터널"],
  bar: ["입자 충돌기", "플라즈마 나선", "블랙홀 흡입"], // 3 「번개 관」은 운영자 "ㄹㅇ 짜치는디"로 교체
};

export function plainBg(seed = 3) {
  const g = grid(GCW, GCH), rnd = rndOf(seed);
  // 카드 전체 같은 바탕(체크 섞기) — 위아래로 띠를 나누던 것은 「LEVEL」 줄 위에 가로 경계가 보였다(11/2)
  for (let y = 0; y < GCH; y++) for (let x = 0; x < GCW; x++) g.put(x, y, (x + y) % 2 ? "k1" : "k2");
  for (let i = 0; i < 60; i++) { const x = Math.floor(rnd() * GCW), y = Math.floor(rnd() * GCH), b = rnd(); g.put(x, y, b < 0.2 ? "p4" : b < 0.6 ? "p2" : "p1"); }
  return g;
}
export function vWell(C, { t = 0 } = {}) {
  const out = [], STEP = 22, A = 1800;
  const pull = (x, y) => { const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy) || 1, d = Math.min(r * 0.82, A / (r + 18)); const sw = 0.25 * Math.exp(-r / 120) * Math.sin(t * TAU); const c = Math.cos(sw), s = Math.sin(sw); const ux = (dx * c - dy * s) / r, uy = (dx * s + dy * c) / r; return [CX + ux * (r - d), CY + uy * (r - d)]; };
  // 격자 선 — 카드 전체 같은 옅기(가는 선이라 글자 뒤로 지나가도 읽힌다).
  //   📌 글자 자리를 피하려다 두 번 반려: 글자마다 짙은 판 → 「상자」, 글자 둘레 선을 지움 → 운영자 "주변에 뭐 검은게 있는디"(격자 빈 구멍이 검게 보였다, 11/2)
  const line = (pts) => `<path d="M${pts.map(([x, y]) => { const [px, py] = pull(x, y); return `${f2(px)} ${f2(py)}`; }).join(" L")}" fill="none" stroke="${C.p2}" stroke-width="0.7" stroke-opacity="0.32"/>`;
  for (let gy = -STEP * 2; gy <= H + STEP * 2; gy += STEP) { const pts = []; for (let x = -40; x <= W + 40; x += 4) pts.push([x, gy]); out.push(line(pts)); }
  for (let gx = -STEP * 2; gx <= W + STEP * 2; gx += STEP) { const pts = []; for (let y = -40; y <= H + 40; y += 4) pts.push([gx, y]); out.push(line(pts)); }
  // 우물 목 — 프로필 둘레 밝은 동심 고리 셋(깔때기 입구)
  [[PR + 10, 1.4, C.p4, 0.9], [PR + 18, 1, C.p3, 0.7], [PR + 30, 0.8, C.p3, 0.45]].forEach(([r, w, c, o]) => out.push(`<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}" stroke-opacity="${o}"/>`));
  return out.join("");
}
export function vWarp(C, { t = 0 } = {}) {
  const out = [], rnd = rndOf(17);
  [60, 100, 160, 240, 340].forEach((r, i) => { const q = (t + i * 0.2) % 1; out.push(`<circle cx="${CX}" cy="${CY}" r="${f2(r * (1 + q * 0.2))}" fill="none" stroke="${i < 2 ? C.p3 : C.p2}" stroke-width="${i < 2 ? 1.2 : 0.9}" stroke-opacity="${f2((0.6 - i * 0.09) * Math.sin(Math.PI * q))}"/>`); });
  for (let i = 0; i < 340; i++) {
    const a = rnd() * TAU, u = (rnd() + t * (1 + (i % 3))) % 1, r1 = 560 - u * 500, len = 30 + 120 * (r1 / 560), b = rnd();
    const r0 = Math.max(PR + 14, r1 - len);
    const x0 = CX + Math.cos(a) * r0, y0 = CY + Math.sin(a) * r0, x1 = CX + Math.cos(a) * r1, y1 = CY + Math.sin(a) * r1;
    if (r0 > 640) continue;
    const fd = Math.min(...[0, 0.25, 0.5, 0.75, 1].map((q) => textFade(x1 + (x0 - x1) * q, y1 + (y0 - y1) * q))), it = fd < 0.5; // 글자 가까이 지나는 빛줄기는 가늘고 옅게(서서히)
    out.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x0)}" y2="${f2(y0)}" stroke="${it ? C.p2 : b < 0.25 ? "#fff" : b < 0.6 ? C.p4 : C.p3}" stroke-width="${it ? 0.7 : b < 0.25 ? 1.4 : 0.8}" stroke-opacity="${f2(0.3 + (0.25 + 0.4 * (1 - u)) * fd)}" stroke-linecap="round"/>`);
  }
  return out.join("");
}
export function vDebris(C, { rot = 0 } = {}) {
  const back = [], front = [], TILT = (-36 * Math.PI) / 180, rnd = rndOf(23), t = (((rot / 360) % 1) + 1) % 1;
  const P = (u, v) => [CX + u * Math.cos(TILT) - v * Math.sin(TILT), CY + u * Math.sin(TILT) + v * Math.cos(TILT)];
  // 조각 모양 — 꼭짓점 몇 개(각 · 반지름 비)를 한 번 정해 두고, 움직일 땐 통째로 돌린다
  const mkShape = () => { const n = 3 + Math.floor(rnd() * 2), k = rnd() * TAU; return Array.from({ length: n }, (_, q) => [k + q * (TAU / n) + (rnd() - 0.5) * 0.7, 0.55 + rnd() * 0.6]); };
  const poly = (x, y, size, shape, spin, fill, edge) => `<polygon points="${shape.map(([a, f]) => `${f2(x + Math.cos(a + spin) * size * f)},${f2(y + Math.sin(a + spin) * size * f)}`).join(" ")}" fill="${fill}"${edge ? ` stroke="#fff" stroke-width="0.6"` : ""}/>`;
  // 산산조각 난 빛 띠 — 사진 위쪽 호를 따라 떠 있는 조각들. 조각마다 호를 따라 살짝 오가고 · 위아래로 둥실 · 제자리 돌기 · 가끔 흰빛으로 번쩍(한 바퀴에 정수 번 — 이음새 없음)
  for (let i = 0; i < 46; i++) {
    const a0 = -172 + (i / 45) * 164 + (rnd() - 0.5) * 3, rr = rnd(), size = 1.6 + rnd() * 2.6, shape = mkShape(), c0 = rnd(), edge = rnd() < 0.2;
    const a = (a0 + 6 * Math.sin(TAU * t + i * 0.7)) * (Math.PI / 180);
    const r = PR + 4 + rr * (6 + 6 * Math.sin(-a)) + 1.8 * Math.sin(TAU * t * 2 + i * 1.3);
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
    if (x > G.NX - 8 && y > CY - 26) continue; // 이름 자리
    const spin = TAU * t * ((i % 3) - 1), flash = Math.sin(TAU * t * 3 + i * 2.1) > 0.92;
    back.push(poly(x, y, size * (flash ? 1.25 : 1), shape, spin, flash ? "#fff" : c0 < 0.3 ? "#fff" : c0 < 0.6 ? C.p4 : C.p3, edge || flash));
  }
  // 파편 띠 — 기운 타원 위 먼지(도트) + 굵은 바위 · 결정
  for (const [rx, op] of [[50, 0.45], [64, 0.3]]) back.push(`<ellipse cx="${CX}" cy="${CY}" rx="${rx}" ry="${f2(rx * 0.2)}" fill="none" stroke="${C.p2}" stroke-width="0.6" stroke-opacity="${op}" transform="rotate(-36 ${CX} ${CY})"/>`);
  for (let i = 0; i < 260; i++) {
    const a = rnd() * TAU + (rot * Math.PI) / 180, rr = 42 + Math.pow(rnd(), 0.7) * 34, big = rnd() < 0.22, size = big ? 2.4 + rnd() * 3 : 0.9 + rnd() * 1.1, shape = mkShape();
    const [x, y] = P(Math.cos(a) * rr, Math.sin(a) * rr * 0.2), isFront = Math.sin(a) > 0, b = rnd();
    if (x > G.NX - 6 && y > CY - 28) continue;
    const fill = isFront ? (b < 0.25 ? "#fff" : b < 0.6 ? C.p4 : C.p3) : b < 0.4 ? C.p3 : b < 0.8 ? C.p2 : C.p1;
    (isFront ? front : back).push(big ? poly(x, y, size, shape, TAU * t * (i % 2 ? 1 : -1), fill, isFront && b < 0.5) : `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(size)}" height="${f2(size)}" fill="${fill}"/>`);
  }
  for (const [a, rr] of [[0.9 + (rot * Math.PI) / 180, 56], [3.6 + (rot * Math.PI) / 180, 66]]) {
    const [x, y] = P(Math.cos(a) * rr, Math.sin(a) * rr * 0.2); if (x > G.NX - 6 && y > CY - 28) continue;
    (Math.sin(a) > 0 ? front : back).push(`<polygon points="${f2(x)},${f2(y - 7)} ${f2(x + 3.2)},${f2(y)} ${f2(x)},${f2(y + 7)} ${f2(x - 3.2)},${f2(y)}" fill="${C.p4}" stroke="#fff" stroke-width="0.8"/><line x1="${f2(x - 9)}" y1="${f2(y)}" x2="${f2(x + 9)}" y2="${f2(y)}" stroke="#fff" stroke-width="0.7"/><line x1="${f2(x)}" y1="${f2(y - 10)}" x2="${f2(x)}" y2="${f2(y + 10)}" stroke="#fff" stroke-width="0.5"/>`);
  }
  return { back: back.join(""), front: front.join("") };
}
export function vVortex(C, { rot = 0 } = {}) {
  const back = [], front = [], rnd = rndOf(29), K = 0.95;
  // 팔 셋 — 팔마다 가는 선 열 겹(안쪽 굵고 흰빛 → 바깥 가늘고 코어 색), 사진 가장자리까지 감겨 듦
  for (let arm = 0; arm < 3; arm++) for (let j = 0; j < 10; j++) {
    const a0 = (arm * TAU) / 3 + (rot * Math.PI) / 180 + j * 0.055;
    let d = "", segs = [];
    for (let r = 88; r >= PR + 1; r -= 1) {
      const th = a0 + K * Math.log(88 / r) * 2.4, x = CX + Math.cos(th) * r, y = CY + Math.sin(th) * r;
      const lim = Math.cos(th) > 0.3 && Math.sin(th) > -0.9 ? G.NX - CX - 3 : 88; // 오른쪽(이름 자리)은 짧게
      if (r > lim) { if (d) segs.push(d); d = ""; continue; }
      d += (d ? " L" : "M") + `${f2(x)} ${f2(y)}`;
    }
    if (d) segs.push(d);
    const f = j / 9;
    for (const p of segs) back.push(`<path d="${p}" fill="none" stroke="${f < 0.15 ? "#fff" : f < 0.45 ? C.p4 : f < 0.75 ? C.p3 : C.p2}" stroke-width="${f < 0.15 ? 2.2 : f < 0.45 ? 1.4 : 0.9}" stroke-opacity="${f2(1 - f * 0.55)}" stroke-linecap="round"/>`);
  }
  // 도트 먼지 — 팔을 따라
  for (let i = 0; i < 140; i++) { const r = PR + 3 + rnd() * 50, arm = i % 3, th = (arm * TAU) / 3 + (rot * Math.PI) / 180 + K * Math.log(88 / r) * 2.4 + (rnd() - 0.2) * 0.45; const x = CX + Math.cos(th) * r, y = CY + Math.sin(th) * r; if (Math.cos(th) > 0.3 && Math.sin(th) > -0.9 && r > G.NX - CX - 3) continue; back.push(`<rect x="${Math.round(x / 2) * 2}" y="${Math.round(y / 2) * 2}" width="2" height="2" fill="${rnd() < 0.3 ? "#fff" : rnd() < 0.6 ? C.p4 : C.p3}"/>`); }
  // 사건의 지평선 테 — 소용돌이가 빨려 드는 입구, 흰 굵은 고리
  front.push(`<circle cx="${CX}" cy="${CY}" r="${PR + 1.4}" fill="none" stroke="#fff" stroke-width="2.4"/>`);
  return { back: back.join(""), front: front.join("") };
}
export function vLensFrame(C, { t = 0 } = {}) {
  const out = [];
  const rr = (inset, R) => { // 둥근 사각 둘레 점들
    const pts = [], x0 = inset, y0 = inset, x1 = W - inset, y1 = H - inset;
    const seg = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 4); for (let i = 0; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]); };
    const arc = (cx, cy, a0) => { for (let k = 0; k < 8; k++) { const a = a0 + (k / 8) * (Math.PI / 2); pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); } };
    seg(x0 + R, y0, x1 - R, y0); arc(x1 - R, y0 + R, -Math.PI / 2); seg(x1, y0 + R, x1, y1 - R); arc(x1 - R, y1 - R, 0); seg(x1 - R, y1, x0 + R, y1); arc(x0 + R, y1 - R, Math.PI / 2); seg(x0, y1 - R, x0, y0 + R); arc(x0 + R, y0 + R, Math.PI);
    return pts;
  };
  const pull = ([x, y]) => { const dx = CX - x, dy = CY - y, r = Math.hypot(dx, dy) || 1, d = Math.min(r - (PR + 22), 26 * Math.exp(-(r - 40) / 55)); return d > 0 ? [x + (dx / r) * d, y + (dy / r) * d] : [x, y]; };
  [[4, 13, "#fff", 1.6, 1], [6.5, 11, C.p4, 1, 0.9], [9, 10, C.p3, 0.9, 0.75], [12, 9, C.p2, 0.8, 0.6], [16, 8, C.p1, 0.7, 0.5]].forEach(([inset, R, col, w, op]) => {
    const p = rr(inset, R).map(pull);
    out.push(`<path d="M${p.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L")} Z" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${op}" stroke-linejoin="round"/>`);
  });
  // 흐르는 빛 — 가장 안쪽 흰 줄을 따라 도는 밝은 토막 둘(대시)
  const P0 = rr(4, 13).map(pull);
  out.push(`<path d="M${P0.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L")} Z" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="26 560" stroke-dashoffset="${f2(-t * 1172)}" stroke-linecap="round"/>`);
  for (let k = 0; k < 10; k++) { const [x, y] = P0[Math.floor((k / 10 + t) % 1 * P0.length)]; out.push(`<rect x="${Math.round(x / 3) * 3}" y="${Math.round(y / 3) * 3}" width="3" height="3" fill="${k % 2 ? C.p4 : "#fff"}"/>`); }
  return out.join("");
}
export function encroach(C, { t = 0 } = {}) {
  const g = grid(GCW, GCH), lineOut = [];
  const spike = (s) => { const u = ((s * 0.061) % 1 + 1) % 1, c = Math.abs(u - 0.5); return c < 0.05 ? (0.05 - c) * 90 : 0; }; // 촉수 — 잡아 늘인 뾰족한 갈래
  const depth0 = (s) => 3 + 1.4 * Math.sin(s * 0.13 + t * TAU) + 0.9 * Math.sin(s * 0.53 + 1.3 - t * TAU * 2) + 0.6 * Math.sin(s * 1.37 + 2) + spike(s + t * (2 / 0.061)) * (0.7 + 0.3 * Math.sin(s * 0.02));
  // 둘레 거리 s(칸) — 위(왼→오) · 오른쪽(위→아래) · 아래(오→왼) · 왼쪽(아래→위)
  const per = [];
  for (let x = 0; x < GCW; x++) per.push([x, 0, 0, 1]);
  for (let y = 0; y < GCH; y++) per.push([GCW - 1, y, -1, 0]);
  for (let x = GCW - 1; x >= 0; x--) per.push([x, GCH - 1, 0, -1]);
  for (let y = GCH - 1; y >= 0; y--) per.push([0, y, 1, 0]);
  // 글자 앞에서 멈춤 — 둘레 칸마다 안쪽으로 글자 · 아이콘 자리까지 남은 칸(폰은 여백 20px 라 촉수가 글자를 찔렀다). 앞뒤 넉 칸 중 가장 좁은 값, 넘치면 부드럽게 눌러 담음
  const room = per.map(([x, y, nx, ny]) => { for (let k = 0; k < 16; k++) if (inTextPx((x + 0.5 + nx * k) * 3, (y + 0.5 + ny * k) * 3)) return k - 1.4; return 99; });
  const LIM = room.map((_, i) => Math.min(...[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => room[(i + d + room.length) % room.length])));
  const depth = (s) => { const D = depth0(s), L = LIM[((Math.round(s) % LIM.length) + LIM.length) % LIM.length], a = L * 0.6; return D <= a ? D : a + (L - a) * Math.tanh((D - a) / Math.max(L - a, 0.1)); };
  const sOf = (x, y) => { const dT = y, dB = GCH - 1 - y, dL = x, dR = GCW - 1 - x, m = Math.min(dT, dB, dL, dR); if (m === dT) return [x, dT]; if (m === dR) return [GCW + y, dR]; if (m === dB) return [GCW + GCH + (GCW - 1 - x), dB]; return [2 * GCW + GCH + (GCH - 1 - y), dL]; };
  for (let y = 0; y < GCH; y++) for (let x = 0; x < GCW; x++) {
    const [s, m] = sOf(x, y), D = depth(s);
    if (m < D) g.put(x, y, m < D - 1 ? "k0" : (x + y) % 2 ? "k0" : "p0");
    else if (m < D + 1.2 && (x * 7 + y * 3) % 11 === 0) g.put(x, y, "p4"); // 불티
  }
  // 경계 실선 — 둘레를 따라 depth 만큼 안쪽 점을 이은 선(흰 + 코어 색)
  const pts = per.map(([x, y, nx, ny], i) => { const D = depth(i); return [(x + 0.5 + nx * D) * 3, (y + 0.5 + ny * D) * 3]; });
  const d = "M" + pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L") + " Z";
  lineOut.push(`<path d="${d}" fill="none" stroke="${C.p2}" stroke-width="4" stroke-opacity="0.35" stroke-linejoin="miter"/>`);
  lineOut.push(`<path d="${d}" fill="none" stroke="${C.p3}" stroke-width="2.2" stroke-opacity="0.7" stroke-linejoin="miter"/>`);
  lineOut.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="1" stroke-linejoin="miter"/>`);
  return { cells: g, lines: lineOut.join("") };
}
export function vHelix(C, { t = 0, pct = 0.49 } = {}) {
  const g = grid(GCW, GCH), out = [], R0 = Math.round((G.BY - 1.5) / 3), X0 = Math.ceil(G.BX0 / 3), X1 = Math.floor(G.BX1 / 3), HX = Math.round((G.BX0 + (G.BX1 - G.BX0) * pct) / 3);
  // 홈 띠 — 다섯 줄 높이, 끝 둥글게, 테 짙게
  for (let x = X0; x <= X1; x++) for (let y = R0 - 3; y <= R0 + 3; y++) { const edge = y === R0 - 3 || y === R0 + 3, end = (x === X0 || x === X1) && Math.abs(y - R0) > 1; if (end) continue; g.put(x, y, edge ? (y < R0 ? "p0" : "k0") : "k1"); }
  for (let x = HX + 3; x < X1; x += 3) g.put(x, R0, "p0");
  // 두 가닥 — 칸마다 위치를 사인으로, 앞(cos>0) 가닥은 밝게 세 칸 · 뒤 가닥은 어둡게 두 칸
  const A = 2.2, K = 0.42, ph0 = -t * Math.PI * 2 * 2;
  const strands = [0, Math.PI].map((ph) => []);
  for (let x = X0 + 1; x <= HX; x++) {
    const fade = Math.min(1, (x - X0) / 8);
    [0, Math.PI].forEach((ph, si) => {
      const a = K * x + ph + ph0, y = R0 + Math.round(A * fade * Math.sin(a)), frontS = Math.cos(a) > 0;
      strands[si].push([x, y, frontS]);
      if (frontS) { g.put(x, y, "w"); g.put(x, y - 1, si ? "p3" : "p4"); g.put(x, y + 1, si ? "p2" : "p3"); }
      else { g.put(x, y, si ? "p1" : "p2"); g.put(x, y + 1, "p0"); }
    });
  }
  // 꼬이는 자리 — 두 가닥이 만나면 십자 빛
  for (let x = X0 + 4; x <= HX; x++) { const a = K * x + ph0; if (Math.abs(Math.sin(a)) < 0.2 && Math.abs(Math.sin(a - K)) >= 0.2) [[0, 0, "w"], [1, 0, "w"], [-1, 0, "w"], [0, -2, "p4"], [0, 2, "p4"], [0, -1, "w"], [0, 1, "w"]].forEach(([dx, dy, c]) => g.put(x + dx, R0 + dy, c)); }
  // 앞머리 — 도트 구슬
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d <= 3.2) g.put(HX + dx, R0 + dy, d < 1.6 ? "w" : d < 2.5 ? "p4" : "p3"); }
  out.push(`<g shape-rendering="crispEdges">${cellsSvg(g, C)}</g>`);
  // 선 — 앞 가닥 가운데 가는 흰 선(부드러운 곡선) · 앞머리 고리
  for (let si = 0; si < 2; si++) { const d = "M" + strands[si].map(([x, y]) => `${f2(x * 3 + 1.5)} ${f2(R0 * 3 + 1.5 + (y - R0) * 3)}`).join(" L"); out.push(`<path d="${d}" fill="none" stroke="${si ? C.p4 : "#fff"}" stroke-width="0.8" stroke-opacity="0.85" stroke-linejoin="round"/>`); }
  out.push(`<circle cx="${HX * 3 + 1.5}" cy="${R0 * 3 + 1.5}" r="13" fill="none" stroke="${C.p3}" stroke-width="0.9" stroke-opacity="0.8"/>`);
  return out.join("");
}
export function vBolt(C, { t = 0, pct = 0.49 } = {}) {
  // 블랙홀 흡입 — 짙은 홈 위로 빛 알갱이가 점점 빨라지며 앞머리의 작은 블랙홀로 빨려 듦(가까울수록 꼬리가 길고 가운데로 모임)
  const g = grid(GCW, GCH), out = [], R0 = Math.round((G.BY - 1.5) / 3), X0 = Math.ceil(G.BX0 / 3), X1 = Math.floor(G.BX1 / 3), HX = Math.round((G.BX0 + (G.BX1 - G.BX0) * pct) / 3), rnd = rndOf(61);
  for (let x = X0; x <= X1; x++) for (let y = R0 - 3; y <= R0 + 3; y++) { const dy = y - R0, edge = Math.abs(dy) === 3, end = (x === X0 || x === X1) && Math.abs(dy) > 1; if (end) continue; g.put(x, y, edge ? (dy < 0 ? "p1" : "k0") : x <= HX ? (dy === 0 ? "p1" : Math.abs(dy) === 1 ? "p0" : "k2") : "k1"); } // 다섯 줄 홈(채운 쪽은 가운데가 달아오름)
  for (let x = HX + 6; x < X1; x += 3) g.put(x, R0, "p0");
  const hx = HX * 3 + 1.5, hy = R0 * 3 + 1.5, sx = X0 * 3 + 4;
  for (let i = 0; i < 26; i++) {
    const p0 = rnd(), sp = 1 + (i % 3), yj = (rnd() - 0.5) * 9, u = (p0 + t * sp) % 1, e = u * u; // 점점 빨라짐
    const x = sx + (hx - 14 - sx) * e, y = hy + yj * (1 - e) * (1 - e);
    const len = 2 + 22 * e, bright = rnd() < 0.35;
    out.push(`<line x1="${f2(x - len)}" y1="${f2(y + yj * 0.08 * len / 10)}" x2="${f2(x)}" y2="${f2(y)}" stroke="${bright ? "#fff" : C.p4}" stroke-width="${bright ? 1.8 : 1.3}" stroke-opacity="${f2(0.4 + 0.6 * e)}" stroke-linecap="round"/>`);
    const cx = Math.round(x / 3), cy = Math.round((y - 1.5) / 3); g.put(cx, cy, bright ? "w" : "p4"); g.put(cx - 1, cy, bright ? "p4" : "p3"); if (e > 0.5) g.put(cx - 2, cy, "p3");
  }
  out.unshift(`<g shape-rendering="crispEdges">${cellsSvg(g, C)}</g>`);
  // 앞머리 작은 블랙홀 — 뒤 원반 → 검은 구 + 흰 고리(돌아가는 뜨거운 호) → 앞 원반 · 위로 휜 빛 호
  const T = -18, RX = 15, RY = 3.4, rot = t * 720;
  out.push(`<path d="M${f2(hx - RX)} ${hy} A${RX} ${RY} 0 0 1 ${f2(hx + RX)} ${hy}" fill="none" stroke="${C.p3}" stroke-width="1.4" transform="rotate(${T} ${hx} ${hy})"/>`);
  out.push(`<path d="M${f2(hx - 9)} ${f2(hy - 2)} A9 9 0 0 1 ${f2(hx + 9)} ${f2(hy - 2)}" fill="none" stroke="${C.p4}" stroke-width="1.2" stroke-opacity="0.85"/>`);
  out.push(`<circle cx="${hx}" cy="${hy}" r="6.4" fill="#000" stroke="#fff" stroke-width="1.6"/>`);
  const a0 = (rot * Math.PI) / 180, a1 = a0 + 1.1;
  out.push(`<path d="M${f2(hx + Math.cos(a0) * 7.2)} ${f2(hy + Math.sin(a0) * 7.2)} A7.2 7.2 0 0 1 ${f2(hx + Math.cos(a1) * 7.2)} ${f2(hy + Math.sin(a1) * 7.2)}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`);
  out.push(`<path d="M${f2(hx - RX)} ${hy} A${RX} ${RY} 0 0 0 ${f2(hx + RX)} ${hy}" fill="none" stroke="#fff" stroke-width="1.6" transform="rotate(${T} ${hx} ${hy})"/>`);
  return out.join("");
}
export function vLink(C, { t = 0, pct = 0.49 } = {}) {
  // 3판(11/2 사이트) — 터지는 자리 = 실제 막대 앞머리(pct). 49% 로 박아 둬 진행이 다른 카드에선 막대 밖에서 터졌다(운영자 "레벨바 끝도 아니고 벗어나서")
  //   사이트는 XP 를 얻을 때만 한 번 돌린다(운영자 "XP 얻을 때의 효과 아니었어?") — t 는 그 한 번의 진행(0~1)
  // 2판 — 1x 에서 빛 덩이가 안 보였다: 머리 다섯 칸 마름모 · 꼬리 세 겹 굵게(바깥 코어 8 · 밝은 코어 5 · 흰 2.6) · 지나간 길이 잠깐 하얗게 남음 · 터짐 · 충격 고리 크게
  const under = [], over = [], hx = G.BX0 + (G.BX1 - G.BX0) * Math.max(0.006, Math.min(1, pct)), by = G.BY;
  const seg = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a))), live = (a, b) => t >= a && t < b;
  const sm = (u) => u * u * (3 - 2 * u);
  const poly = (pts, col, w, op) => pts.length > 1 ? `<path d="M${pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L")}" fill="none" stroke="${col}" stroke-width="${f2(w)}" stroke-opacity="${f2(op)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const cell = (x, y, c, op = 1) => `<rect x="${Math.round(x / 3) * 3 - 1.5}" y="${Math.round(y / 3) * 3 - 1.5}" width="3" height="3" fill="${c}"${op < 1 ? ` fill-opacity="${f2(op)}"` : ""}/>`;
  const comet = (pts, k = 1) => {
    const n = pts.length;
    if (n < 2) return;
    const part = (a) => pts.slice(Math.floor(a * (n - 1)));
    over.push(poly(pts, C.p3, 8 * k, 0.45), poly(part(0.3), C.p4, 5 * k, 0.9), poly(part(0.55), "#fff", 2.6 * k, 1));
    const [x, y] = pts[n - 1], R = k > 1.2 ? 3 : 2; // 머리 — 3px 칸 마름모(흰 속 · 밝은 코어 테 · 코어 끝)
    const cells = [];
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= R - 1) cells.push(cell(x + dx * 3, y + dy * 3, "#fff")); else if (m === R) cells.push(cell(x + dx * 3, y + dy * 3, C.p4)); else if (m === R + 1 && (dx === 0 || dy === 0)) cells.push(cell(x + dx * 3, y + dy * 3, C.p3)); }
    for (let i = 1; i <= 6; i++) { const [px, py] = pts[Math.max(0, n - 1 - Math.round((i * n) / 7))], j = ((i * 5 + Math.floor(t * 64)) % 3) - 1; cells.push(cell(px + j * 3, py + (i % 2 ? 6 : -6), i % 2 ? C.p4 : "#fff", 1 - i * 0.12)); }
    over.push(`<g shape-rendering="crispEdges">${cells.join("")}</g>`);
  };
  const path = (P) => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); return { P, L, len: L[L.length - 1] }; };
  const at = ({ P, L }, d) => { let i = 1; while (i < L.length - 1 && L[i] < d) i++; const u = (d - L[i - 1]) / Math.max(L[i] - L[i - 1], 1e-6); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; };
  const span = (p, d0, d1) => { const out = []; for (let q = Math.max(0, d0); q < d1; q += 3) out.push(at(p, q)); out.push(at(p, d1)); return out; };
  // ① 테두리를 타는 길 — 아래 변(오른쪽 → 왼쪽) · 왼쪽 아래 모서리 · 왼쪽 변(위로) · 레벨바 높이에서 안쪽으로 꺾어 막대 왼쪽 끝
  const e = 6, rc = 18, P1 = [];
  for (let x = W * 0.66; x > e + rc; x -= 4) P1.push([x, H - e]);
  for (let a = 90; a <= 180; a += 10) P1.push([e + rc + Math.cos((a * Math.PI) / 180) * rc, H - e - rc + Math.sin((a * Math.PI) / 180) * rc]);
  for (let y = H - e - rc; y > by + 14; y -= 4) P1.push([e, y]);
  for (let a = 180; a <= 270; a += 10) P1.push([e + 14 + Math.cos((a * Math.PI) / 180) * 14, by + 14 + Math.sin((a * Math.PI) / 180) * 14]);
  P1.push([G.BX0 + 2, by]);
  const p1 = path(P1);
  if (live(0.02, 0.33)) {
    const d = sm(seg(0.02, 0.27)) * p1.len, fade = 1 - seg(0.27, 0.33);
    over.push(poly(span(p1, 0, d), "#fff", 1.6, 0.55 * fade)); // 지나간 테가 잠깐 하얗게
    if (t < 0.27) comet(span(p1, d - 130, d), 1.2);
  }
  // ② 레벨바 안 — 점점 빨라짐, 흰 덩어리(막대 높이 도트) · 지나간 자리 달아오름
  if (live(0.27, 0.54)) {
    const u = seg(0.27, 0.44), x = G.BX0 + (hx - G.BX0) * u * u, fade = 1 - seg(0.44, 0.54);
    over.push(`<rect x="${f2(G.BX0 + 2)}" y="${f2(by - 2)}" width="${f2(Math.max(0, x - G.BX0 - 2))}" height="4" fill="#fff" fill-opacity="${f2(0.7 * fade)}"/>`);
    if (t < 0.44) {
      const cells = []; // 막대 높이 흰 덩어리 — 앞 두 칸 흰 · 뒤로 코어 색 꼬리
      for (let k = 0; k < 10; k++) for (let dy = -2; dy <= 2; dy++) { const c = k < 3 ? (Math.abs(dy) < 2 ? "#fff" : C.p4) : k < 6 ? (Math.abs(dy) < 2 ? C.p4 : C.p3) : Math.abs(dy) < 1 ? C.p3 : null; if (c) cells.push(cell(x - k * 3, by + dy * 3, c)); }
      over.push(`<g shape-rendering="crispEdges">${cells.join("")}</g>`);
      comet([[Math.max(G.BX0, x - 60), by], [x, by]], 1);
    }
  }
  // 앞머리 터짐 — 빛살 여덟 · 퍼지는 고리 둘 · 도트 불티
  if (live(0.44, 0.58)) {
    const p = seg(0.44, 0.58), L = 8 + 26 * Math.sin(Math.PI * Math.min(1, p * 1.4));
    [[0, "#fff", 2.4], [0.18, C.p4, 1.4]].forEach(([lag, col, w]) => { const q = Math.max(0, p - lag); if (q > 0) over.push(`<circle cx="${f2(hx)}" cy="${f2(by)}" r="${f2(6 + 40 * q)}" fill="none" stroke="${col}" stroke-width="${f2(w * (1 - q) + 0.4)}" stroke-opacity="${f2(1 - q)}"/>`); });
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4, l = k % 2 ? L * 0.55 : L; over.push(`<line x1="${f2(hx + Math.cos(a) * 5)}" y1="${f2(by + Math.sin(a) * 5)}" x2="${f2(hx + Math.cos(a) * (5 + l))}" y2="${f2(by + Math.sin(a) * (5 + l))}" stroke="${k % 2 ? C.p4 : "#fff"}" stroke-width="${k % 2 ? 1.4 : 2.4}" stroke-linecap="round" stroke-opacity="${f2(1 - p * 0.6)}"/>`); }
    const cells = []; for (let k = 0; k < 10; k++) { const a = k * 0.63 + 0.3, r = 10 + 34 * p + (k % 3) * 4; cells.push(cell(hx + Math.cos(a) * r, by + Math.sin(a) * r, k % 2 ? C.p4 : "#fff", 1 - p)); }
    over.push(`<g shape-rendering="crispEdges">${cells.join("")}</g>`);
  }
  // ③ 혜성 — 막대 앞머리 → 글자 없는 오른쪽으로 휘어 → 프로필 오른쪽 아래 가장자리. 꺾임점은 글자를 피할 때까지 오른쪽으로 민다
  const E = [CX + (PR + 2) * 0.7071, CY + (PR + 2) * 0.7071];
  const Q = [Math.max(hx + 40, W * 0.68), (by + E[1]) / 2 - 20];
  const bz = (u) => [(1 - u) ** 2 * hx + 2 * (1 - u) * u * Q[0] + u * u * E[0], (1 - u) ** 2 * by + 2 * (1 - u) * u * Q[1] + u * u * E[1]];
  const hits = () => { for (let u = 0.08; u < 0.94; u += 0.02) { const [x, y] = bz(u); if (inTextPx(x, y)) return true; } return false; };
  while (hits() && Q[0] < W - 30) Q[0] += 8;
  if (live(0.48, 0.76)) {
    const s = seg(0.48, 0.74), u = s * s * (3 - 2 * s), pts = [], fade = 1 - seg(0.72, 0.76);
    // 지나온 길 — 가는 흰 선이 잠깐 남음(글자 뒤 겹)
    const trail = []; for (let q = 0; q < u; q += 0.02) trail.push(bz(q)); trail.push(bz(u));
    under.push(poly(trail, C.p4, 1.2, 0.5 * fade));
    if (t < 0.74) {
      for (let q = Math.max(0, u - 0.3); q < u; q += 0.01) pts.push(bz(q));
      pts.push(bz(u));
      const cells = []; // 끌려오는 알갱이 — 혜성 길 양옆 도트가 길 쪽으로 모여듦
      for (let i = 0; i < 16; i++) { const q = Math.max(0, u - 0.025 * i), [x, y] = bz(q), off = (i % 2 ? 1 : -1) * (6 + i * 1.8); cells.push(cell(x + off * 0.7, y - off * 0.7, i % 3 ? C.p3 : C.p4, 0.95 - i * 0.05)); }
      under.push(`<g shape-rendering="crispEdges">${cells.join("")}</g>`);
      comet(pts, 1.5);
    }
  }
  // ④ 프로필 — 빛 고리 굵게 번쩍(사진 앞) + 충격 고리 셋이 카드 쪽으로 크게(글자 뒤)
  if (live(0.74, 0.94)) {
    const p = seg(0.74, 0.94), q0 = seg(0.74, 0.86);
    over.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 2)}" fill="none" stroke="#fff" stroke-width="${f2(1 + 5 * (1 - q0))}" stroke-opacity="${f2(1 - q0 * 0.8)}"/>`);
    over.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 7 + 4 * q0)}" fill="none" stroke="${C.p4}" stroke-width="2" stroke-opacity="${f2(1 - q0)}"/>`);
    for (let k = 0; k < 3; k++) { const a0 = 0.6 + (k * TAU) / 3 + q0 * 2.2, a1 = a0 + 0.8, r = PR + 11 + 6 * q0; over.push(`<path d="M${f2(CX + Math.cos(a0) * r)} ${f2(CY + Math.sin(a0) * r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(CX + Math.cos(a1) * r)} ${f2(CY + Math.sin(a1) * r)}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-opacity="${f2(1 - q0)}"/>`); }
    for (let i = 0; i < 3; i++) { const q = Math.max(0, p - i * 0.14); if (q <= 0 || q >= 1) continue; under.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 8 + q * 120)}" fill="none" stroke="${i ? C.p3 : "#fff"}" stroke-width="${i ? 1.4 : 2.2}" stroke-opacity="${f2((1 - q) * (0.9 - i * 0.2))}"${i === 2 ? ' stroke-dasharray="5 5"' : ""}/>`); }
  }
  return { under: under.join(""), over: over.join("") };
}
export function levelUpState(core, p, { pct0 = 0.49, pct1 = 0.04 } = {}) {
  sync();
  const C = colorsOf(core), under = [], over = [], rnd = rndOf(71);
  const seg = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a))), sm = (u) => u * u * (3 - 2 * u), live = (a, b) => p >= a && p < b;
  const cell = (x, y, c, op = 1, z = 3) => `<rect x="${Math.round(x / 3) * 3 - z / 2}" y="${Math.round(y / 3) * 3 - z / 2}" width="${z}" height="${z}" fill="${c}"${op < 1 ? ` fill-opacity="${f2(op)}"` : ""}/>`;
  const poly = (pts, col, w, op) => pts.length > 1 ? `<path d="M${pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L")}" fill="none" stroke="${col}" stroke-width="${f2(w)}" stroke-opacity="${f2(op)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  const diamond = (x, y, R) => { const cs = []; for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) { const m = Math.abs(dx) + Math.abs(dy); if (m <= R - 1) cs.push(cell(x + dx * 3, y + dy * 3, "#fff")); else if (m === R) cs.push(cell(x + dx * 3, y + dy * 3, C.p4)); else if (m === R + 1 && (dx === 0 || dy === 0)) cs.push(cell(x + dx * 3, y + dy * 3, C.p3)); } return `<g shape-rendering="crispEdges">${cs.join("")}</g>`; };
  // 막대 진행 · 눌림
  let pct = pct0, sy = 1;
  if (live(0.08, 0.3)) pct = pct0 + (1 - pct0) * seg(0.08, 0.3) ** 2;
  else if (live(0.3, 0.42)) { pct = 1; sy = 1 - 0.85 * sm(seg(0.3, 0.42)); }
  else if (live(0.42, 0.74)) { pct = 1; sy = 0; }
  else if (p >= 0.74) { sy = sm(seg(0.74, 0.8)); pct = Math.max(0.006, pct1 * sm(seg(0.76, 0.92))); }
  // 차오를 때 앞머리 불티 — 막대 앞머리에서 위아래로 튐
  if (live(0.1, 0.3)) { const hx = G.BX0 + (G.BX1 - G.BX0) * pct, cs = []; for (let i = 0; i < 8; i++) { const a = rnd() * Math.PI * 2, r = 6 + rnd() * 16 * seg(0.1, 0.3); cs.push(cell(hx + Math.cos(a) * r, G.BY + Math.sin(a) * r * 0.8, i % 2 ? C.p4 : "#fff")); } over.push(`<g shape-rendering="crispEdges">${cs.join("")}</g>`); }
  // ③ 한 줄이 오른쪽 끝으로 말려 들어감 → 끝 점 빛 덩이
  if (live(0.42, 0.49)) {
    const u = sm(seg(0.42, 0.47)), x0 = G.BX0 + (G.BX1 - G.BX0) * u;
    if (u < 1) over.push(`<line x1="${f2(x0)}" y1="${f2(G.BY)}" x2="${f2(G.BX1)}" y2="${f2(G.BY)}" stroke="#fff" stroke-width="${f2(3 - 1.6 * u)}"/>`);
    over.push(diamond(G.BX1 - 3, G.BY, 1 + Math.round(2 * seg(0.42, 0.47))));
  }
  // 빛 덩이 길 — 막대 오른쪽 끝 → 오른쪽 변을 따라 위로 → 이름 줄 아래로 왼쪽 → 프로필 오른쪽 아래 가장자리
  const E = [CX + (PR + 2) * 0.7071, CY + (PR + 2) * 0.7071];
  const B = [[G.BX1 - 3, G.BY], [W - 14, G.BY - 140], [W * 0.62, E[1] + 46], E];
  const bz = (u) => { const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3; return [a * B[0][0] + b * B[1][0] + c * B[2][0] + d * B[3][0], a * B[0][1] + b * B[1][1] + c * B[2][1] + d * B[3][1]]; };
  if (live(0.47, 0.64)) {
    const s = seg(0.47, 0.6), u = s * s, fade = 1 - seg(0.6, 0.64);
    const trail = []; for (let q = 0; q < u; q += 0.02) trail.push(bz(q)); trail.push(bz(u));
    over.push(poly(trail, C.p4, 1.4, 0.6 * fade));
    if (p < 0.6) {
      const pts = []; for (let q = Math.max(0, u - 0.3); q < u; q += 0.01) pts.push(bz(q)); pts.push(bz(u));
      const n = pts.length, part = (a) => pts.slice(Math.floor(a * (n - 1)));
      over.push(poly(pts, C.p3, 12, 0.45), poly(part(0.3), C.p4, 7, 0.9), poly(part(0.55), "#fff", 3.4, 1));
      const [x, y] = pts[n - 1]; over.push(diamond(x, y, 3));
      const cs = []; for (let i = 0; i < 18; i++) { const q = Math.max(0, u - 0.02 * i), [px, py] = bz(q), off = (i % 2 ? 1 : -1) * (7 + i * 1.6); cs.push(cell(px + off * 0.7, py - off * 0.7, i % 3 ? C.p3 : C.p4, 0.95 - i * 0.045)); }
      over.push(`<g shape-rendering="crispEdges">${cs.join("")}</g>`);
    }
  }
  // 프로필 달아오름(빛 덩이가 다가올수록 고리가 굵어지고 뜨거운 호 둘이 빨리 돎)
  if (live(0.44, 0.62)) {
    const q = seg(0.44, 0.6);
    over.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 2)}" fill="none" stroke="#fff" stroke-width="${f2(1 + 4 * q)}" stroke-opacity="${f2(0.5 + 0.5 * q)}"/>`);
    for (let k = 0; k < 2; k++) { const a0 = k * Math.PI + q * 14, a1 = a0 + 0.9, r = PR + 7; over.push(`<path d="M${f2(CX + Math.cos(a0) * r)} ${f2(CY + Math.sin(a0) * r)} A${r} ${r} 0 0 1 ${f2(CX + Math.cos(a1) * r)} ${f2(CY + Math.sin(a1) * r)}" fill="none" stroke="${C.p4}" stroke-width="2.4" stroke-linecap="round" stroke-opacity="${f2(0.4 + 0.6 * q)}"/>`); }
  }
  // ④ 특이점 — 사진 위 흰 원판 번쩍(두세 장) · 둘레 굵은 고리
  if (live(0.58, 0.66)) { const q = seg(0.58, 0.66); over.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 1)}" fill="#fff" fill-opacity="${f2(0.95 * (1 - q))}"/><circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 4 + 6 * q)}" fill="none" stroke="#fff" stroke-width="${f2(6 * (1 - q) + 1)}"/>`); }
  // ⑤ 폭발 — 충격 고리 셋(카드 밖까지) · 도트 파편 · 테두리 둘레 번쩍
  if (live(0.62, 0.98)) {
    const far = Math.hypot(W, H) * 1.05;
    [[0, "#fff", 3.6, ""], [0.05, C.p4, 2.2, ""], [0.1, C.p3, 1.4, ' stroke-dasharray="6 6"']].forEach(([lag, col, w, da]) => {
      const q = seg(0.62 + lag, 0.88 + lag); if (q <= 0 || q >= 1) return;
      over.push(`<circle cx="${f2(CX)}" cy="${f2(CY)}" r="${f2(PR + 6 + q * far)}" fill="none" stroke="${col}" stroke-width="${f2(w * (1 - q) + 0.6)}" stroke-opacity="${f2((1 - q) ** 0.6)}"${da}/>`);
    });
    const q = seg(0.62, 0.95), cs = [];
    for (let i = 0; i < 56; i++) { const a = rnd() * Math.PI * 2, v = 0.25 + rnd() * 0.75, big = rnd() < 0.2, c = rnd(); const r = PR + 6 + sm(q) * (60 + 320 * v); cs.push(cell(CX + Math.cos(a) * r, CY + Math.sin(a) * r, c < 0.3 ? "#fff" : c < 0.7 ? C.p4 : C.p3, 1 - q, big ? 6 : 3)); }
    over.push(`<g shape-rendering="crispEdges">${cs.join("")}</g>`);
    const qb = seg(0.66, 0.82); if (qb > 0 && qb < 1) over.push(`<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="${f2(G.R - 2)}" fill="none" stroke="#fff" stroke-width="3" stroke-opacity="${f2(Math.sin(Math.PI * qb))}"/><rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="${f2(G.R - 7)}" fill="none" stroke="${C.p4}" stroke-width="1.6" stroke-opacity="${f2(0.8 * Math.sin(Math.PI * qb))}"/>`);
  }
  // 어둠막 · 시간 덤 · 글자 겹 바꿈 · 새 숫자 색 어긋남
  const veil = p < 0.3 ? 0 : p < 0.42 ? 0.5 * sm(seg(0.3, 0.42)) : p < 0.62 ? 0.5 : 0.5 * (1 - sm(seg(0.62, 0.7)));
  return {
    pct, sy, tb: 0.4 * sm(seg(0.08, 0.6)), tr: 0.9 * sm(seg(0.3, 0.62)),
    veil: veil > 0 ? `<rect width="${W}" height="${H}" fill="#000" fill-opacity="${f2(veil)}"/>` : "",
    under: under.join(""), over: over.join(""),
    swap: p >= 0.62, glitch: live(0.62, 0.78) ? { off: Math.max(1, Math.round(7 * (1 - seg(0.62, 0.78)))), op: 1 - seg(0.62, 0.78), c: C.p3 } : null,
  };
}
export const syncPieces = sync; // 그리기 전에 카드 자리를 다시 읽는다(index.js)
