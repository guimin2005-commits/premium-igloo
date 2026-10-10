// 📌 티어 엠블럼 그림 생성 — public/tier-emblems/<등급 키>.svg(32칸 · 작은 자리) · <등급 키>-lg.svg(48칸 · 승급 화면처럼 크게)
//    · <등급 키>-20.svg · -24.svg(칸이 굵은 작은 판 — 사이트 작은 자리에서 또렷하게) + lib/tierEmblemBox.js(판마다 그림 영역 — app/components/TierEmblem 이 고른다)
//    실행: node scripts/gen-tier-emblems.mjs   (그림을 고치면 다시 돌려 SVG 를 커밋한다)
//
//    2026-10-08 운영자 확정("2번으로 가자"): 아바타 테두리(scripts/gen-avatar-borders.mjs)를 구멍을 작게(R=9) 찍어 날개 겹이 가운데로 모인 문장.
//    보석 없이 날개만 — 위 등급은 뿔 · 뒤 날개 · 수정 조각도 가운데로 당기고(빈 고리가 강조되지 않게), 마스터부터 아래 쐐기에서 솟는 날 하나.
//    아이언은 브론즈 아래 — 짧은 받침 하나 + 쐐기 + 리벳. 정지 그림(움직임 · 빛무리 없음)
//    <등급 키>-parts.json — 48칸 그림을 부품(받침 · 날개 겹 · 뿔 · 별 · 가운데 날 …)으로 나눈 것. 승급 화면이 한 겹씩 조립한다(app/level/PromoOverlay)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
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
  // 그림 영역 [x, y, 너비, 높이](칸) — 판(칸 수)마다
  const boxOf = (c) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; c.forEach((r, y) => r.forEach((v, x) => { if (v) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } })); return [x0, y0, x1 - x0 + 1, y1 - y0 + 1]; };
  const boxes = {}, arts = {}, mids = {};
  for (const T of EMBLEM_TIERS) {
    boxes[T.key] = {};
    arts[T.key] = {};
    for (const n of [20, 24, 32, 48]) {
      const c = renderEmblem(T, n);
      boxes[T.key][n] = boxOf(c);
      if (n < 32) writeFileSync(join(out, `${T.key}-${n}.svg`), emblemSvg(c));
    }
    const sm = emblemSvg(renderEmblem(T, 32)), lg = emblemSvg(renderEmblem(T, 48));
    // 봇 이미지 카드용 — 32 · 48칸 판의 칸 그림(바깥 svg 껍데기 없이)
    const inner = (svg) => svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    arts[T.key] = { 32: inner(sm), 48: inner(lg) };
    // 눈으로 보이는 가운데(칸 밝기로 무게를 단 무게중심) — 어두운 카드 바탕에선 짙은 외곽선은 거의 안 보이고 밝은 칸이 무게를 만든다.
    //   그림 상자 가운데에 맞추면 위가 무거운 날개 그림이 위로 떠 보였다(2026-10-10 "코드 중앙과 시각적 중앙은 다르다")
    mids[T.key] = {};
    for (const n of [32, 48]) {
      const c = renderEmblem(T, n); let sw = 0, sx = 0, sy = 0;
      c.forEach((row, y) => row.forEach((v, x) => { if (!v) return; const h = v.replace("#", ""); const L = (0.2126 * parseInt(h.slice(0, 2), 16) + 0.7152 * parseInt(h.slice(2, 4), 16) + 0.0722 * parseInt(h.slice(4, 6), 16)) / 255; const w = 0.12 + L; sw += w; sx += w * (x + 0.5); sy += w * (y + 0.5); }));
      mids[T.key][n] = [+(sx / sw).toFixed(2), +(sy / sw).toFixed(2)];
    }
    writeFileSync(join(out, `${T.key}.svg`), sm);
    writeFileSync(join(out, `${T.key}-lg.svg`), lg);
    // 📌 사이트 엠블럼(app/components/TierEmblem)용 — 같은 48칸 그림을 칸 1개 = 1px PNG 로. 화면은 image-rendering: pixelated 로 키우고 줄여
    //    어느 크기에서도 칸 경계가 섞이지 않는다(SVG 를 1배 아래로 줄이면 크롬이 칸 가장자리를 섞어 흐려졌다 — 2026-10-10 "어떤 건 흐리고 어떤 건 선명하고")
    {
      const sharp = createRequire(import.meta.url)("sharp");
      const c = renderEmblem(T, 48), raw = Buffer.alloc(48 * 48 * 4);
      c.forEach((row, y) => row.forEach((v, x) => { if (!v) return; const i = (y * 48 + x) * 4; raw[i] = parseInt(v.slice(1, 3), 16); raw[i + 1] = parseInt(v.slice(3, 5), 16); raw[i + 2] = parseInt(v.slice(5, 7), 16); raw[i + 3] = 255; }));
      await sharp(raw, { raw: { width: 48, height: 48, channels: 4 } }).png({ compressionLevel: 9 }).toFile(join(out, `${T.key}-48.png`));
    }
    writeFileSync(join(out, `${T.key}-parts.json`), JSON.stringify(emblemParts(T, 48)));
    console.log(T.key, sm.length, lg.length);
  }
  const mod = `// 📌 등급 엠블럼 그림 영역 — scripts/gen-tier-emblems.mjs 가 만든다(손으로 고치지 말 것). 판(칸 수 20 · 24 · 32 · 48)마다 [x, y, 너비, 높이](칸)
//    그림: 48칸 판 하나 — 사이트는 public/tier-emblems/<키>-48.png(칸 1개 = 1px, pixelated 로 크기 맞춤), 봇 카드는 lib|bot tierEmblemArt.js · 승급 화면은 <키>-lg.svg · -parts.json.
//    <키>-20 · -24 · <키>.svg(32) 는 예전 작은 판(같은 그림을 작게 다시 찍어 모양이 달라 지금은 안 씀)
export const EMBLEM_BOX = ${JSON.stringify(boxes)};
// 📌 눈으로 보이는 가운데 [x, y](칸 — 밝은 칸 무게중심). 그림 상자 가운데로 맞추면 위가 밝고 아래가 짙은 그림이 떠 보여 이 점을 자리 가운데에 둔다(봇 카드 emblemSvg 와 같은 값)
export const EMBLEM_MID = ${JSON.stringify(mids)};
`;
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "tierEmblemBox.js"), mod);
  console.log("box module", mod.length);
  // 📌 봇 이미지 카드(lib|bot botCards emblemSvg — /레벨 · 레벨업 · 역할 지급 사진 아래, /랭크 줄)가 쓰는 같은 그림 — 사이트 · 봇 두 곳에 같은 파일(봇은 따로 배포)
  const artMod = `// 📌 등급 엠블럼 도트 그림(봇 이미지 카드용) — scripts/gen-tier-emblems.mjs 가 만든다(손으로 고치지 말 것).
//    사이트 lib/tierEmblemArt.js · 봇 bot/src/tierEmblemArt.js 는 같은 파일. 사이트 화면은 public/tier-emblems/*.svg 를 쓴다(같은 그림).
//    EMBLEM_ART[등급 키] = { box: { 32 · 48: [x, y, 너비, 높이](칸 — 그림 영역) }, mid: { 32 · 48: [x, y](칸 — 눈으로 보이는 가운데, 밝기 무게중심) }, art: { 32 · 48: 칸 path 묶음(viewBox 0 0 n n, crispEdges) } }
export const EMBLEM_ART = ${JSON.stringify(Object.fromEntries(Object.keys(arts).map((k) => [k, { box: { 32: boxes[k][32], 48: boxes[k][48] }, mid: mids[k], art: arts[k] }])))};
`;
  for (const p of [["lib"], ["bot", "src"]]) writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ...p, "tierEmblemArt.js"), artMod);
  console.log("art module", artMod.length);
}
