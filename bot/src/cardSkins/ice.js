// 아이스 — 2026-10-05 "아이스도 약간"(값에 비해 심심) — 도트를 여러 톤으로 다시 그렸다. 사이트 · 봇 같은 그림 함수.
//   모서리를 깎은 얼음 판 액자(위 · 왼쪽 밝게 / 아래 · 오른쪽 짙게 + 흰 서리 반짝 · 금 간 이음매)
//   + 위 가운데 큰 눈 결정 문장(가운데 파란 얼음 보석) + 위 테에 매달린 음영 고드름(왼쪽 빛 · 오른쪽 그늘 · 흰 끝)
//   + 아래 두 모서리에서 솟은 얼음 결정 무리 · 오른쪽 위 모서리에 매달린 결정 + 바닥 눈 둔덕(두 톤) + 반짝임 · 도트 눈.
//   사이트(site)는 눈이 천천히 내린다(움직임 줄이기 설정이면 멈춤). 아바타(왼쪽 위) 자리는 작은 눈송이만.
export const meta = { key: "ice", label: "아이스", grid: "dot", tint: "#bfe6ff", gridOp: 0.1 };

export const C = {
  w: "#ffffff", // 반짝
  I: "#e6f6ff", // 얼음 빛
  L: "#cdeeff", // 얼음 밝은
  A: "#9fd3f0", // 얼음
  B: "#79b4d8", // 얼음 그늘
  D: "#3f7fae", // 얼음 짙은
  K: "#1d4a73", // 실루엣
  M: "#2896de", // 얼음 보석
  N: "#7ad4f5", // 얼음 보석 빛
};

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
class Layer {
  constructor() { this.cells = new Map(); }
  cell(ch, x, y, w, h) { if (C[ch]) this.cells.set(`${x},${y},${w},${h}`, ch); }
  has(x, y, w, h) { return this.cells.has(`${x},${y},${w},${h}`); }
  svg(op = 1, cls = "") {
    const by = {};
    for (const [k, ch] of this.cells) { const [x, y, w, h] = k.split(","); (by[ch] ||= []).push(R(x, y, w, h)); }
    const body = Object.entries(by).map(([ch, a]) => `<path d="${a.join("")}" fill="${C[ch]}"/>`).join("");
    return body ? `<g shape-rendering="crispEdges"${op < 1 ? ` opacity="${op}"` : ""}${cls ? ` class="${cls}"` : ""}>${body}</g>` : "";
  }
}

// 눈 결정 — 반지름 r 칸, 여덟 갈래(가로 · 세로는 길고 대각은 짧게) + 갈래 중간 잔가지, 가운데 얼음 보석
function flakeCells(r) {
  const out = new Map();
  const put = (x, y, ch) => out.set(`${x},${y}`, ch);
  for (let k = 1; k <= r; k++) {
    const ch = k === r ? "w" : k > r * 0.6 ? "I" : "L";
    put(k, 0, ch); put(-k, 0, ch); put(0, k, ch); put(0, -k, ch);
  }
  const rd = Math.max(1, Math.round(r * 0.6));
  for (let k = 1; k <= rd; k++) {
    const ch = k === rd ? "w" : "A";
    put(k, k, ch); put(-k, k, ch); put(k, -k, ch); put(-k, -k, ch);
  }
  if (r >= 4) {
    const m = Math.round(r * 0.55);
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // 잔가지 — 갈래 중간에서 바깥쪽 비스듬히 두 칸
      const bx = ax * m, by = ay * m;
      const px = ay, py = ax; // 갈래에 수직
      put(bx + px + ax, by + py + ay, "I"); put(bx - px + ax, by - py + ay, "I");
      if (r >= 6) { put(bx + 2 * px + 2 * ax, by + 2 * py + 2 * ay, "w"); put(bx - 2 * px + 2 * ax, by - 2 * py + 2 * ay, "w"); }
    }
  }
  put(0, 0, "M"); put(-1, 0, "N"); put(0, -1, "N"); put(1, 0, "D"); put(0, 1, "D");
  if (r >= 6) { put(-1, -1, "w"); put(1, 1, "B"); put(1, -1, "N"); put(-1, 1, "D"); }
  return [...out].map(([k, ch]) => { const [x, y] = k.split(",").map(Number); return [x, y, ch]; });
}

// 얼음 결정 한 개(위로 솟음) — 폭 wd(3~4) · 높이 ht. 왼쪽 열이 빛, 오른쪽 열이 그늘, 끝은 뾰족, 흰 반짝 한 줄
function shard(wd, ht) {
  const out = [];
  const tip = Math.ceil(wd / 2) + 1;
  for (let j = 0; j < ht; j++) {
    const fromTop = ht - 1 - j;
    const cut = fromTop < tip ? tip - fromTop : 0; // 끝으로 갈수록 좁게
    for (let i = 0; i < wd; i++) {
      if (i < Math.floor(cut / 2) || i >= wd - Math.ceil(cut / 2)) continue;
      const col = wd === 3 ? ["I", "A", "B"][i] : ["I", "L", "A", "B"][i];
      const glint = i === 0 && (j === Math.floor(ht * 0.55) || j === Math.floor(ht * 0.55) + 1);
      out.push([i, j, glint ? "w" : fromTop === 0 ? "w" : col]);
    }
  }
  return out;
}

export function deco(w, h, S, site) {
  const rand = seeded(11);
  const P = Math.max(2, Math.round(2 * S)); // 액자 칸(사이트 2px · 봇 4px)
  const Q = site ? 2 : Math.round(2 * S); // 장식 칸(사이트 2px · 봇 4px)
  const o = site ? 12 : 16;
  const band = 4;
  const B = band * P;
  const cols = Math.floor((w - o * 2) / P);
  const rows = Math.floor((h - o * 2) / P);
  const X = (i) => o + i * P;
  const Y = (j) => o + j * P;
  const snap = (v) => Math.round(v);

  // ── 얼음 판 액자 — 모서리를 두 칸 깎고, 단면(바깥 → 안) 위 · 왼쪽: 얼음 빛 · 밝은 · 얼음 · 그늘 / 아래 · 오른쪽: 그늘 · 얼음 · 짙은 · 실루엣 ──
  const fr = new Layer();
  const lit = ["I", "L", "A", "B"];
  const dim = ["D", "B", "A", "K"];
  const cut = 2;
  const plate = Math.round((52 * S) / P);
  for (const top of [true, false]) {
    const j0 = top ? 0 : rows - band;
    for (let i = cut; i < cols - cut; i++) for (let k = 0; k < band; k++) {
      const ch = (top ? lit : dim)[top ? k : band - 1 - k];
      fr.cell(ch, X(i), Y(j0 + k), P, P);
    }
    // 이음매(금 간 자리) — 판마다 한 줄 짙게 + 옆 칸 빛, 위 판은 서리 반짝
    for (let i = cut + plate; i < cols - cut - 4; i += plate) {
      for (let k = 0; k < band; k++) { fr.cell("D", X(i), Y(j0 + k), P, P); fr.cell(top ? "w" : "A", X(i + 1), Y(j0 + k), P, P); }
      if (top) { fr.cell("w", X(i - 3), Y(j0), P, P); fr.cell("w", X(i - 2), Y(j0 + 1), P, P); fr.cell("w", X(i + 5), Y(j0 + 1), P, P); }
    }
  }
  for (const left of [true, false]) {
    const i0 = left ? 0 : cols - band;
    for (let j = cut; j < rows - cut; j++) for (let k = 0; k < band; k++) {
      const ch = (left ? lit : dim)[left ? k : band - 1 - k];
      if (!fr.has(X(i0 + k), Y(j), P, P) || (j >= band && j < rows - band)) fr.cell(ch, X(i0 + k), Y(j), P, P);
    }
    for (let j = cut + plate; j < rows - cut - 4; j += plate) {
      for (let k = 0; k < band; k++) { fr.cell("D", X(i0 + k), Y(j), P, P); fr.cell(left ? "w" : "A", X(i0 + k), Y(j + 1), P, P); }
    }
  }
  // 깎은 모서리 — 계단 두 칸
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (let s = 0; s < cut; s++) {
      const i = sx ? cols - 1 - s : s;
      const j = sy ? rows - 1 - (cut - 1 - s) : cut - 1 - s;
      for (let k = 0; k < band; k++) {
        const ii = sx ? i - k : i + k, jj = sy ? j - k : j + k;
        fr.cell(sy || sx ? (k === 0 ? "D" : "B") : k === 0 ? "I" : "L", X(ii), Y(jj), P, P);
      }
    }
  }

  // ── 장식 칸(Q) ──
  const dc = new Layer();
  const at = (L, x, y, ch) => L.cell(ch, snap(x), snap(y), Q, Q);
  // 가운데(cx, cy) 칸 좌표 → 화면
  const putCells = (L, cells, cx, cy) => { for (const [dx, dy, ch] of cells) at(L, cx + dx * Q - Q / 2, cy + dy * Q - Q / 2, ch); };
  // 실루엣 — 그린 칸 둘레(상하좌우)에 짙은 테
  const outline = (L, cells, cx, cy) => {
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    const ring = [];
    for (const [x, y] of cells) for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + ax},${y + ay}`;
      if (!set.has(k)) { set.add(k); ring.push([x + ax, y + ay, "K"]); }
    }
    putCells(L, ring, cx, cy);
    putCells(L, cells, cx, cy);
  };
  const mid = o + B / 2;

  // 위 가운데 눈 결정 문장
  const crestR = site ? 7 : 7;
  outline(dc, flakeCells(crestR), w / 2, mid + (site ? 4 : 6));
  // 왼쪽 위(아바타 옆) · 오른쪽 아래쪽 작은 눈송이
  outline(dc, flakeCells(3), mid + (site ? 2 : 8), mid + (site ? 2 : 8));

  // 아래 두 모서리 — 솟은 얼음 결정 무리(가운데 키 큰 것 + 양옆)
  const cluster = (cx, base, dir, scale) => {
    const parts = [[0, 3, Math.round(7 * scale)], [3, 4, Math.round(12 * scale)], [7, 3, Math.round(9 * scale)], [10, 3, Math.round(5 * scale)]];
    for (const [off, wd, ht] of parts) {
      const cells = shard(wd, ht).map(([i, j, ch]) => [dir > 0 ? off + i : -(off + i), -j, dir > 0 ? ch : ch === "I" ? "B" : ch === "B" ? "I" : ch]);
      outline(dc, cells, cx, base);
    }
  };
  const bBase = h - o - B - Q / 2; // 아래 테 바로 위 칸
  const cs = site ? 1 : 0.9;
  cluster(o + B + Q * 1.5, bBase, 1, cs);
  cluster(w - o - B - Q * 1.5, bBase, -1, cs);
  // 오른쪽 위 모서리 — 테에 매달린 결정(아래로)
  {
    const parts = [[0, 3, site ? 8 : 9], [3, 4, site ? 12 : 13], [7, 3, site ? 6 : 7]];
    for (const [off, wd, ht] of parts) {
      const cells = shard(wd, ht).map(([i, j, ch]) => [-(off + i), j, ch === "I" ? "B" : ch === "B" ? "I" : ch]);
      outline(dc, cells, w - o - B - Q * 1.5, o + B + Q / 2);
    }
  }

  // 고드름 — 위 테 안쪽에 매달린다. 위는 굵고 끝은 가늘게, 왼쪽 빛 · 오른쪽 그늘 · 흰 끝. 아바타 · 문장 · 오른쪽 결정 자리는 비운다
  const ic = new Layer();
  const icTop = o + B;
  const skip = (x) => (site ? x < 128 : x < 330) || Math.abs(x - w / 2) < (crestR + 3) * Q || x > w - o - B - (site ? 34 : 70);
  for (let x = o + B + 8; x < w - o - B - 8; x += (site ? 14 : 34) + Math.floor(rand() * (site ? 14 : 40))) {
    if (skip(x)) continue;
    const len = (site ? 3 : 4) + Math.floor(rand() * (site ? 5 : 6));
    const cells = [];
    for (let j = 0; j < len; j++) {
      const wd = j < 2 ? 3 : j < len - 2 ? 2 : 1;
      for (let i = 0; i < wd; i++) cells.push([i - (wd === 3 ? 1 : 0), j, j === len - 1 ? "w" : i === 0 ? "I" : wd === 3 && i === 1 ? "A" : "B"]);
    }
    outline(ic, cells, x, icTop + Q / 2);
  }

  // 바닥 눈 둔덕 — 두 톤(위 흰 · 아래 얼음 그늘), 가운데는 낮게
  const dr = new Layer();
  const dq = Q;
  const dTop = h - o - B;
  for (let x = o + B; x < w - o - B; x += dq) {
    const t = Math.abs((x - w / 2) / (w / 2 - o - B));
    const hh = Math.max(1, Math.round((site ? 2 : 2) + Math.sin(x / (23 * S)) * 1 + Math.sin(x / (9 * S)) * 0.7 + t * t * (site ? 3 : 4)));
    for (let k = 0; k < hh; k++) dr.cell(k === hh - 1 ? "I" : k === hh - 2 ? "L" : "A", x, dTop - (k + 1) * dq, dq, dq);
  }

  // 반짝임 — 십자 네 갈래
  const sp = new Layer();
  const spark = (x, y, big) => {
    at(sp, x, y, "w");
    for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { at(sp, x + ax * Q, y + ay * Q, "I"); if (big) at(sp, x + ax * 2 * Q, y + ay * 2 * Q, "L"); }
  };
  if (site) { spark(w - 52, 150, true); spark(w - 36, 176, false); spark(40, h - 82, false); }
  else { spark(w - 120, 300, true); spark(w - 90, 330, false); spark(150, h - 120, false); }

  // 도트 눈 — 사이트는 천천히 내린다
  let snow = "";
  const nS = site ? 30 : 60;
  for (let n = 0; n < nS; n++) {
    const x = snap(o + B + 6 + rand() * (w - o * 2 - B * 2 - 12));
    const y = snap(o + B + 6 + rand() * (h - o * 2 - B * 2 - 12));
    if (site && x < 124 && y < 124) continue;
    const s = (rand() < 0.3 ? 2 : 1) * Q;
    const op = (0.18 + rand() * 0.3).toFixed(2);
    snow += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${C.I}" fill-opacity="${op}"${site ? ` class="ice-sn" style="animation-delay:-${(rand() * 8).toFixed(2)}s;animation-duration:${(6 + rand() * 4).toFixed(2)}s"` : ""}/>`;
  }

  const defs = site
    ? `<pattern id="ice-fr" width="9" height="9" patternUnits="userSpaceOnUse"><rect x="4" y="4" width="1" height="1" fill="#cdeeff" fill-opacity="0.1"/></pattern>` +
      `<style>@keyframes iceFall{0%{transform:translate(0,-14px);opacity:0}20%{opacity:1}80%{opacity:1}100%{transform:translate(6px,30px);opacity:0}}` +
      `.ice-sn{animation:iceFall 8s linear infinite}@media (prefers-reduced-motion:reduce){.ice-sn{animation:none}}</style>`
    : "";
  const under = (site ? `<rect width="${w}" height="${h}" fill="url(#ice-fr)"/>` : "") + `<g shape-rendering="crispEdges">${snow}</g>` + dr.svg(0.5) + sp.svg(0.7);
  const over = fr.svg(0.78) + ic.svg(0.85) + dc.svg(0.92);
  return { defs, under, over };
}
