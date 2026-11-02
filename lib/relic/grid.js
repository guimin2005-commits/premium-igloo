// 칸 그림판 · 원 칸 · 칸 표식
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
export function grid(w, h) {
  const m = new Map();
  const key = (x, y) => x + "," + y;
  const g = {
    w, h, m,
    put(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h && c) m.set(key(x, y), c); },
    get(x, y) { return m.get(key(x, y)); },
    del(x, y) { m.delete(key(x, y)); },
    has(x, y) { return m.has(key(x, y)); },
    // rows: 문자열 줄 · pal: 글자→색 이름(S3) · "." 투명
    stamp(rows, x0, y0, pal) { rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== "." && ch !== " ") g.put(x0 + i, y0 + j, pal ? pal[ch] : ch); })); },
    // 빈 칸 중 채워진 칸과 4방향으로 닿는 칸에 외곽
    outline(c, diag = false) {
      const add = [];
      for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
        if (g.has(x, y)) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].concat(diag ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : []);
        if (n.some(([a, b]) => g.has(x + a, y + b))) add.push([x, y]);
      }
      add.forEach(([x, y]) => g.put(x, y, c));
    },
  };
  return g;
}
export function circlePts(cx, cy, r) {
  const out = new Set(); let x = r, y = 0, e = 1 - r;
  while (x >= y) { for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) out.add((cx + a) + "," + (cy + b)); y++; if (e < 0) e += 2 * y + 1; else { x--; e += 2 * (y - x) + 1; } }
  return [...out].map((k) => k.split(",").map(Number));
}
// 칸 그림 표식 — 문자열 대신 판을 모아 두고 <cells i="n"/> 만 남긴다(사이트 캔버스가 fillRect 로 그린다)
let REG = [];
export const resetCells = () => { REG = []; };
export const cellsOf = () => REG;
export const cellsSvg = (g, colors, cs = 3, ox = 0, oy = 0) => { REG.push({ g, colors, cs, ox, oy }); return `<cells i="${REG.length - 1}"/>`; };
