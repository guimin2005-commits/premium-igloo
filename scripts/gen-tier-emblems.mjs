// 📌 티어 엠블럼 그림 생성 — public/tier-emblems/<등급 키>.svg(32칸 · 작은 자리) · <등급 키>-lg.svg(48칸 · 승급 화면처럼 크게)
//    실행: node scripts/gen-tier-emblems.mjs   (그림을 고치면 다시 돌려 SVG 를 커밋한다)
//
//    2026-10-08 운영자 확정("2번으로 가자"): 아바타 테두리(scripts/gen-avatar-borders.mjs)를 구멍을 작게(R=9) 찍어 날개 겹이 가운데로 모인 문장.
//    보석 없이 날개만 — 위 등급은 뿔 · 뒤 날개 · 수정 조각도 가운데로 당기고(빈 고리가 강조되지 않게), 마스터부터 아래 쐐기에서 솟는 날 하나.
//    아이언은 브론즈 아래 — 짧은 받침 하나 + 쐐기 + 리벳. 정지 그림(움직임 · 빛무리 없음)
//    <등급 키>-parts.json — 48칸 그림을 부품(받침 · 날개 겹 · 뿔 · 별 · 가운데 날 …)으로 나눈 것. 승급 화면이 한 겹씩 조립한다(app/level/PromoOverlay)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { BORDER_TIERS, renderBorder } from "./gen-avatar-borders.mjs";

const IR = { o: "#1c1c1e", d: "#4a4a4e", m: "#77777c", l: "#a3a3a8", h: "#cfcfd4" };
const IRON = { key: "iron", M: IR, J: IR, rivets: true, inner: { tip: 12, W: 3.3, fl: 5 }, outer: [], lower: [], wedge: { s: 3, gem: false } };
export const EMBLEM_TIERS = [IRON, ...BORDER_TIERS];

// 구멍이 작아진 만큼 바깥 장식도 가운데로(설계 단위 — 테두리 표는 R=24 기준이라 그 차이만큼 당긴다)
const tight = (T) => ({
  ...T,
  horns: T.horns?.map((h) => ({ ...h, r1: 9 + (h.r1 - 24) * 0.72 })),
  back: T.back?.map((bw) => ({ ...bw, r0: 9 + (bw.r0 - 24), ext: bw.ext * 0.78 })),
  shards: T.shards?.map((sh) => ({ ...sh, r: 9 + (sh.r - 24) + 2 })),
});

// n × n 엠블럼 — 크게(n × 4/3) 찍어 가운데만 잘라 쓴다(모든 등급 같은 배율이라 커지는 게 보인다). withParts: 칸마다 부품 이름도 돌려준다
export function renderEmblem(T, n = 32, withParts = false) {
  const nb = Math.round((n * 4) / 3 / 2) * 2, off = (nb - n) / 2;
  const sy = T.sy ?? 1; // 세로 눌림 — 아바타 테두리 받침(scripts/gen-avatar-frames.mjs)이 얇게 쓸 때만
  const big = renderBorder(tight(T), nb, { R: 9, sy });
  const fx = new Set(); for (const s of big.roles.fx) for (const k of s) fx.add(k);
  const c = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
    const v = big.c[y + off]?.[x + off] ?? null, k = `${x + off},${y + off}`;
    return v && !v.includes("|") && !fx.has(k) ? v : null; // 반투명 빛무리 · 반짝이는 뺀다
  }));
  const part = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (c[y][x] ? big.part[y + off]?.[x + off] || "inner" : null)));
  // 마스터부터 — 아래 쐐기에서 가운데로 솟는 날(좌우 대칭, 가운데 능선 밝게 · 왼쪽 밝은 면 · 오른쪽 결 색 · 아래 그늘)
  if (T.glow) {
    const K = nb / 128, C = n / 2, R9 = 9 * K, M = T.M, J = T.J;
    const inl = T.prism ? T.prism[1] : T.inlay === "m" ? J.m : J.d;
    const top = C - R9 * 1.6 * sy, bot = C + R9 * 1.15 * sy, w = R9 * 0.55;
    const inside = (x, y) => { const t = (y - top) / (bot - top); if (t < 0 || t > 1) return false; const hw = w * (t < 0.62 ? t / 0.62 : 1 - ((t - 0.62) / 0.38) * 0.55); return Math.abs(x - C) <= hw; };
    const m = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => inside(x + 0.5, y + 0.5)));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!m[y][x]) { if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([p, q]) => m[y + q]?.[x + p]) && !c[y][x]) { c[y][x] = M.o; part[y][x] = "fin"; } continue; }
      const ridge = x === C - 1 || x === C;
      c[y][x] = !m[y - 1]?.[x] ? M.h : ridge ? M.h : x < C ? M.l : inl;
      if (!m[y + 1]?.[x]) c[y][x] = M.d;
      part[y][x] = "fin";
    }
  }
  return withParts ? { c, part } : c;
}

// 부품 묶음 — 가운데 부품(쐐기 · 구슬 · 별 · 날)은 한 덩어리, 나머지는 왼쪽 · 오른쪽을 따로(좌우가 거울처럼 펼쳐지게)
const CENTER = new Set(["wedge", "orb", "star", "fin"]);
export function emblemParts(T, n = 48) {
  const { c, part } = renderEmblem(T, n, true);
  const groups = new Map();
  for (let y = 0; y < n; y++) for (let x = 0; x < n;) {
    const v = c[y][x]; if (!v) { x++; continue; }
    const id = part[y][x], side = CENTER.has(id) ? "C" : x < n / 2 ? "L" : "R", key = `${id}:${side}`;
    let e = x; while (e + 1 < n && c[y][e + 1] === v && part[y][e + 1] === id && (CENTER.has(id) || (e + 1 < n / 2) === (x < n / 2))) e++;
    if (!groups.has(key)) groups.set(key, { id, side, paths: {} });
    const g = groups.get(key);
    (g.paths[v] ||= []).push(`M${x} ${y}h${e - x + 1}v1h-${e - x + 1}z`);
    x = e + 1;
  }
  return { n, parts: [...groups.values()].map((g) => ({ ...g, paths: Object.entries(g.paths).map(([col, a]) => [col, a.join("")]) })) };
}
export function emblemSvg(c) {
  const n = c.length, by = {};
  for (let y = 0; y < n; y++) for (let x = 0; x < n;) {
    const v = c[y][x]; if (!v) { x++; continue; }
    let e = x; while (e + 1 < n && c[y][e + 1] === v) e++;
    (by[v] ||= []).push(`M${x} ${y}h${e - x + 1}v1h-${e - x + 1}z`);
    x = e + 1;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${Object.entries(by).map(([f, a]) => `<path d="${a.join("")}" fill="${f}"/>`).join("")}</svg>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "tier-emblems");
  mkdirSync(out, { recursive: true });
  for (const T of EMBLEM_TIERS) {
    const sm = emblemSvg(renderEmblem(T, 32)), lg = emblemSvg(renderEmblem(T, 48));
    writeFileSync(join(out, `${T.key}.svg`), sm);
    writeFileSync(join(out, `${T.key}-lg.svg`), lg);
    writeFileSync(join(out, `${T.key}-parts.json`), JSON.stringify(emblemParts(T, 48)));
    console.log(T.key, sm.length, lg.length);
  }
}
