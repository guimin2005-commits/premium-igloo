// 📌 카드 테두리 「유령 펭귄의 초대」(ev_ghost) — 할로윈 「유령 펭귄의 초대」 이벤트(2026-10). 카드 배경 「유령 펭귄의 밤」(sc_ghost)과 한 벌.
//   시안: .claude/mockups/ghost-event/cos/card-border.png(360 × 558 · 칸 3px — scripts/gen-halloween-banner.mjs BANNER=ghostcard ghostCardBorder)
//   볼록 몰딩 테(바깥선 · 빛 · 몸 · 그늘 · 안선) · 안쪽 푸른 점선 · 테 가운데 푸른 불꽃 장식(밝은 것 · 어두운 것 번갈아) · 네 모서리 금 메달 + 유령 깃털 · 아래 안개 자락
//   + 오른쪽: 랜턴 든 유령 펭귄(LEVEL 숫자 오른쪽 — 사이트 카드는 레벨 막대 위 8칸에 발끝) · 도깨비불 둘
//   테 · 장식 · 안개는 이 파일이 카드 크기마다 칸으로 다시 그린다(시안 그림과 칸 하나까지 같은 식). 유령 펭귄 · 도깨비불은 시안에서 뽑은 칸(ev_ghost.art.js — scripts/gen-ghost-card-border.mjs)
//   카드를 칠하지 않는다 — 바탕 무늬(카드 전체 결)가 없어 카드 배경(ctx.onScene)을 끼어도 그대로. 모든 그림은 over 겹(글자 아래)
import { SPECTRE } from "./ev_ghost.art.js";
import { botTopOpen } from "./hwFloor.js";

export const meta = { key: "ev_ghost", label: "유령 펭귄의 초대", grid: "line", tint: "#ffffff", gridOp: 0.05 };

// ── 칸 그림판 ──
const kOf = (x, y) => x + "," + y;
function board() {
  const m = new Map();
  return {
    m,
    set(x, y, c) { if (c) m.set(kOf(Math.round(x), Math.round(y)), c); },
    box() {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const key of m.keys()) { const [x, y] = key.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    },
  };
}
const sprite = (rows, pal) => { const g = board(); rows.forEach((row, y) => [...row].forEach((ch, x) => g.set(x, y, pal[ch]))); return g; };
const remap = (g, fn) => { const b = g.box(), n = board(); for (const [key, c] of g.m) { const [x, y] = key.split(",").map(Number); const [nx, ny] = fn(x, y, b); n.set(nx, ny, c); } return n; };
const flipX = (g) => remap(g, (x, y, b) => [b.x0 + b.x1 - x, y]);
const flipY = (g) => remap(g, (x, y, b) => [x, b.y0 + b.y1 - y]);
const rotate = (g) => remap(g, (x, y) => [-y, x]);
// 바둑판 디더(4×4) — 시안과 같은 값
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x, y) => (BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4] + 0.5) / 16;

const MOLD = ["#0a0716", "#8a76e6", "#4b3a9a", "#2a2068", "#0a0716"]; // 바깥선 · 빛 · 몸 · 그늘 · 안선
const FEATHER = ["..ooooo...", ".oWWWbbo..", "oWWbbbvvoo", ".obbvvvo..", "..ooo....."];
const FEATHER_PAL = { o: "#1d3d78", W: "#eafcff", b: "#b4ecf9", v: "#72c3e6" };
const MEDAL = ["...ooooo...", "..oGggggGo.", ".oGgddddgGo", "oGgddfdddgG", "oGdddFfdddG", "oGddfWFdddG", "oGdddFfdddG", "oGgdddddgGo", ".oGgddddgGo", "..oGggggGo.", "...ooooo..."];
const MEDAL_PAL = { o: "#0a0716", G: "#9c6a22", g: "#e2b04a", d: "#150f36", f: "#2a6fd6", F: "#45b4ff", W: "#ffffff" };

// 📌 테 · 장식 · 안개 칸 — 칸 cw × ch 판, 테 바깥선이 바깥에서 o 칸 안쪽. 시안(ghostCardBorder)과 같은 차례 · 같은 식
//    (scripts/gen-ghost-card-border.mjs 가 이 함수로 시안 크기(120 × 186 · o 3)를 그려 시안 그림과 맞춰 본다 — 다르면 유령 펭귄 칸을 뽑지 않는다)
//    fogRows: 안개 자락 높이 상한(칸, 아래에서부터) — 봇 카드는 아래 막대 · Lv 줄이 테 바로 위라 낮게(시안은 제한 없음)
export function frameCells(cw, ch, o = 3, fogRows = Infinity) {
  const g = board();
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < cw && y < ch) g.set(x, y, c); };
  const at = (s, x, y) => { const b = s.box(); for (const [key, c] of s.m) { const [sx, sy] = key.split(",").map(Number); set(x + sx - b.x0, y + sy - b.y0, c); } return b; };
  const x0 = o, y0 = o, x1 = cw - 1 - o, y1 = ch - 1 - o;
  for (let i = 0; i < 5; i++) {
    const j = i === 1 ? 3 : i === 3 ? 1 : i; // 아래 · 오른쪽 테는 안쪽이 밝다
    for (let x = x0 + i; x <= x1 - i; x++) { set(x, y0 + i, MOLD[i]); set(x, y1 - i, MOLD[j]); }
    for (let y = y0 + i; y <= y1 - i; y++) { set(x0 + i, y, MOLD[i]); set(x1 - i, y, MOLD[j]); }
  }
  // 안쪽 푸른 빛 한 줄(성기게)
  for (let x = x0 + 5; x <= x1 - 5; x++) if (x % 2) { set(x, y0 + 5, "#2f5fb0"); set(x, y1 - 5, "#2f5fb0"); }
  for (let y = y0 + 5; y <= y1 - 5; y++) if (y % 2) { set(x0 + 5, y, "#2f5fb0"); set(x1 - 5, y, "#2f5fb0"); }
  // 푸른 불꽃 장식 — 테 몸 가운데 줄에 9칸마다(밝은 것 · 어두운 것 번갈아)
  const stud = (x, y, on) => {
    set(x, y, on ? "#ffffff" : "#9ff8ff");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) set(x + dx, y + dy, on ? "#7ff3ff" : "#3f86c4");
    if (on) set(x, y - 2, "#45b4ff");
  };
  let n = 0;
  for (let x = x0 + 16; x <= x1 - 16; x += 9) { stud(x, y0 + 2, n % 2 === 0); stud(x, y1 - 2, n % 2 === 1); n++; }
  n = 0;
  for (let y = y0 + 16; y <= y1 - 16; y += 9) { stud(x0 + 2, y, n % 2 === 0); stud(x1 - 2, y, n % 2 === 1); n++; }
  // 네 모서리 — 유령 깃털(테를 따라 가로 · 세로 한 장씩) + 금 메달
  for (const [cx, cy, sx, sy] of [[x0 + 2, y0 + 2, 1, 1], [x1 - 2, y0 + 2, -1, 1], [x0 + 2, y1 - 2, 1, -1], [x1 - 2, y1 - 2, -1, -1]]) {
    let hz = sprite(FEATHER, FEATHER_PAL); if (sx < 0) hz = flipX(hz); if (sy < 0) hz = flipY(hz);
    const hb = hz.box(); at(hz, sx > 0 ? cx + 4 : cx - 4 - hb.w + 1, cy - 2);
    let vt = rotate(sprite(FEATHER, FEATHER_PAL)); if (sx < 0) vt = flipX(vt); if (sy < 0) vt = flipY(vt);
    const vb = vt.box(); at(vt, cx - 2, sy > 0 ? cy + 4 : cy - 4 - vb.h + 1);
    at(sprite(MEDAL, MEDAL_PAL), cx - 5, cy - 5);
  }
  // 아래 안개 자락 — 테 안쪽 아래를 따라 옅은 유령 꼬리 빛(위로 갈수록 성기게)
  for (let x = x0 + 6; x <= x1 - 6; x++) {
    const top = y1 - 6 - Math.round(2.5 + 2 * Math.sin(x / 7) + Math.sin(x / 3.1));
    for (let y = Math.max(top, y1 - 6 - fogRows + 1); y <= y1 - 6; y++) {
      const t = (y - top) / Math.max(1, y1 - 6 - top);
      if (dith(x, y) > 0.25 + t * 0.6) continue;
      set(x, y, t > 0.6 ? "#b4ecf9" : "#72c3e6");
    }
  }
  return g.m;
}

// 유령 펭귄 · 도깨비불 칸(ev_ghost.art.js — 기준점: 시안의 유령 펭귄 왼쪽 위 (76, 52), 테 오른쪽 바깥선 x1 = 116 에서 40칸 왼쪽)
const SPRITE = (() => {
  const cells = [];
  for (const [c, s] of SPECTRE.runs) for (const r of s.split(" ")) { const [x, y, l] = r.split(",").map(Number); for (let i = 0; i < l; i++) cells.push([x + i, y, c]); }
  return cells;
})();
const SPRITE_FROM_RIGHT = 40; // 기준점 x = 테 바깥선 x1 − 40
const SPRITE_GAP = 8; // 사이트 카드 — 발끝(그림 아래 끝)과 레벨 막대 위 사이 칸

// 같은 색 가로 이웃 칸을 사각형 하나로 — 색마다 path 하나
function svgOf(m, P, ox, oy) {
  const byC = new Map();
  for (const [key, c] of m) { const [x, y] = key.split(",").map(Number); if (!byC.has(c)) byC.set(c, new Map()); const rows = byC.get(c); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  let s = "";
  for (const [c, rows] of byC) {
    let d = "";
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += `M${ox + xs[i] * P} ${oy + y * P}h${(j - i + 1) * P}v${P}h${-(j - i + 1) * P}z`; i = j + 1; }
    }
    s += `<path d="${d}" fill="${c}"/>`;
  }
  return `<g shape-rendering="crispEdges">${s}</g>`;
}

// deco(w, h, S, site, ctx) → { defs, under, over } — 다른 cardSkins 와 같은 꼴
//   칸: 사이트 3px(시안 그대로) · 봇 2.25 × S(2.2 → 5px — 봇 카드 글 · 막대가 테에서 72px 안쪽이라 테가 그보다 바깥에 오게 · 안개는 아래 3칸만)
//   테 자리(o 칸): 사이트는 글자 시작(ctx.lineX0 · goalLeft — SkinFrame 이 잰다)보다 안쪽 점선이 1px 이상 바깥에 오게 3칸에서 줄인다(폰 레벨 카드 여백 26px → 2칸)
//   유령 펭귄: 사이트는 레벨 막대(ctx.barY · barBottom) 위 8칸에 발끝 · 막대를 모르면 시안 비율 높이. 봇은 가운데 정렬 카드(레벨업 · 역할 지급 — hwFloor botTopOpen)만, 아래 막대 · 글 줄 위에
export function deco(w, h, S = 1, site = true, ctx = {}) {
  const P = site ? 3 : Math.max(3, Math.round(2.25 * S));
  const cw = Math.floor(w / P), ch = Math.floor(h / P);
  const ox = Math.floor((w - cw * P) / 2), oy = Math.floor((h - ch * P) / 2);
  const tx = site ? [ctx.lineX0, ctx.goalLeft].find((v) => Number.isFinite(v)) : undefined;
  const o = Number.isFinite(tx) ? Math.max(1, Math.min(3, Math.floor((tx - 1 - ox) / P) - 6)) : 3;
  const m = frameCells(cw, ch, o, site ? Infinity : 3);
  const showSprite = site || botTopOpen(ctx);
  if (showSprite) {
    const sx = cw - 1 - o - SPRITE_FROM_RIGHT;
    let sy;
    if (site && Number.isFinite(ctx.barY)) {
      const barTop = Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5;
      sy = Math.floor((barTop - oy) / P) - SPRITE_GAP - (SPECTRE.y1 + 1);
    } else if (site) sy = Math.round((52 * ch) / 186);
    else sy = Math.floor((h - 110 - oy) / P) - (SPECTRE.y1 + 1); // 봇 — 아래 막대 · Lv 줄(아래 56 ~ 100px) 위에 발끝
    sy = Math.max(o + 6, sy);
    for (const [x, y, c] of SPRITE) { const X = sx + x, Y = sy + y; if (X >= 0 && Y >= 0 && X < cw && Y < ch) m.set(kOf(X, Y), c); }
  }
  return { defs: "", under: "", over: svgOf(m, P, ox, oy) };
}
