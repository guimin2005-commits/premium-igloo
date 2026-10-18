// 📌 카드 테두리 「유령 펭귄의 초대」(ev_ghost) 칸 뽑기 — 시안 그림(.claude/mockups/ghost-event/cos/card-border.png · 360 × 558 · 칸 3px)에서
//    테 · 장식 · 안개(lib/cardSkins/ev_ghost.js frameCells 가 카드 크기마다 다시 그린다)를 뺀 나머지 칸 = 유령 펭귄 · 도깨비불을 뽑아
//    lib/cardSkins/ev_ghost.art.js · bot/src/cardSkins/ev_ghost.art.js(같은 파일)에 같은 색 가로 줄(runs)로 적는다.
//    실행: node scripts/gen-ghost-card-border.mjs   (시안을 고치면 다시 돌린다)
//    확인: frameCells(120, 186, 3) + 뽑은 칸 = 시안 그림(칸 하나까지) — 다르면 멈춘다
import { createRequire } from "module";
import { existsSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = createRequire(join(ROOT, "package.json"))("sharp");
const SRC = join(ROOT, ".claude", "mockups", "ghost-event", "cos", "card-border.png");
const CELL = 3, CW = 120, CH = 186, O = 3;
const ORIGIN = [76, 52]; // 시안의 유령 펭귄 왼쪽 위 칸(gen-halloween-banner GC_SPECTRE) — 테 바깥선 x1 = 116 에서 40칸 왼쪽
const OUT = [join(ROOT, "lib", "cardSkins", "ev_ghost.art.js"), join(ROOT, "bot", "src", "cardSkins", "ev_ghost.art.js")];

const modOf = (sp) => `// 📌 카드 테두리 「유령 펭귄의 초대」 유령 펭귄 · 도깨비불 칸 — scripts/gen-ghost-card-border.mjs 가 시안(card-border.png)에서 뽑는다(손으로 고치지 말 것).
//    lib/cardSkins/ev_ghost.art.js 와 bot/src/cardSkins/ev_ghost.art.js 는 같은 파일. 좌표는 기준점(시안 (${ORIGIN[0]}, ${ORIGIN[1]}) 칸) 기준, runs: [색, "x,y,길이 …"]
//    x0 · y0 · x1 · y1: 칸이 있는 자리(기준점 기준, 끝 포함)
export const SPECTRE = ${JSON.stringify(sp)};
`;
// ev_ghost.js 가 이 파일을 import 하므로 처음 한 번은 빈 판을 둔다
for (const f of OUT) if (!existsSync(f)) writeFileSync(f, modOf({ x0: 0, y0: 0, x1: 0, y1: 0, runs: [] }));
const { frameCells } = await import(pathToFileURL(join(ROOT, "lib", "cardSkins", "ev_ghost.js")).href);

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== CW * CELL || info.height !== CH * CELL) throw new Error(`시안 크기 ${info.width}×${info.height} — ${CW * CELL}×${CH * CELL} 이어야 한다`);
const hex = (p) => "#" + [0, 1, 2].map((c) => data[p + c].toString(16).padStart(2, "0")).join("");
const png = new Map();
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
  const p = (y * CELL * info.width + x * CELL) * 4;
  for (let j = 0; j < CELL; j++) for (let i = 0; i < CELL; i++) { const q = ((y * CELL + j) * info.width + x * CELL + i) * 4; if (data.compare(data, p, p + 4, q, q + 4) !== 0) throw new Error(`칸 (${x}, ${y}) 안 색이 다르다 — 칸 ${CELL}px 도트가 아니다`); }
  const a = data[p + 3];
  if (a === 255) png.set(`${x},${y}`, hex(p));
  else if (a !== 0) throw new Error(`칸 (${x}, ${y}) 반투명(${a})`);
}

const frame = frameCells(CW, CH, O);
let erased = 0;
for (const key of frame.keys()) if (!png.has(key)) erased++;
if (erased) throw new Error(`테 칸 ${erased}개가 시안에 없다 — frameCells 가 시안과 다르다`);
const cells = [];
for (const [key, c] of png) if (frame.get(key) !== c) { const [x, y] = key.split(",").map(Number); cells.push([x - ORIGIN[0], y - ORIGIN[1], c]); }

// 같은 색 가로 줄
const byC = new Map();
for (const [x, y, c] of cells) { if (!byC.has(c)) byC.set(c, []); byC.get(c).push([x, y]); }
const runs = [];
for (const [c, list] of byC) {
  list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const parts = [];
  for (let i = 0; i < list.length; ) { let j = i; while (j + 1 < list.length && list[j + 1][1] === list[i][1] && list[j + 1][0] === list[j][0] + 1) j++; parts.push(`${list[i][0]},${list[i][1]},${j - i + 1}`); i = j + 1; }
  runs.push([c, parts.join(" ")]);
}
runs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
const sp = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), runs };

// 다시 맞춰 보기 — 테 + 뽑은 칸 = 시안
const back = new Map(frame);
for (const [c, s] of runs) for (const r of s.split(" ")) { const [x, y, l] = r.split(",").map(Number); for (let i = 0; i < l; i++) back.set(`${ORIGIN[0] + x + i},${ORIGIN[1] + y}`, c); }
let diff = 0;
for (const [key, c] of png) if (back.get(key) !== c) diff++;
if (diff || back.size !== png.size) throw new Error(`다시 맞춰 보기 실패 — 다른 칸 ${diff} · 칸 수 ${back.size}/${png.size}`);

const mod = modOf(sp);
for (const f of OUT) writeFileSync(f, mod);
console.log("ev_ghost 유령 펭귄 칸", cells.length, "줄", runs.reduce((n, [, s]) => n + s.split(" ").length, 0), "색", runs.length, "자리", JSON.stringify([sp.x0, sp.y0, sp.x1, sp.y1]), "모듈", mod.length, "B");
console.log("테 칸", frame.size, "· 시안 칸", png.size, "· 다시 맞춰 보기 OK");
