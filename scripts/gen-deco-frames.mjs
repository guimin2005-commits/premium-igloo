// 📌 프로필 꾸미기 테두리 그림 생성 — 할로윈(hwf_*) · A New World 카드 짝(nwf_*) · 이벤트(evf_* — 유령 펭귄의 초대) · 서버 부스터(bsf_* — 2026-10-25). 등급 테두리(scripts/gen-avatar-frames.mjs)와 따로 둔다(그쪽 결과는 그대로).
//    실행: node scripts/gen-deco-frames.mjs   (그림을 고치면 다시 돌려 결과를 커밋한다. 끝에 찍히는 DECO_FRAME_REACH 를 app/components/AvatarFrame.js FRAME_REACH 에 옮긴다)
//    만드는 것: public/avatar-borders/<키>.svg(사이트 — app/components/AvatarFrame) · lib/avatarDecoArt.js · bot/src/avatarDecoArt.js(디스코드 카드 정지 그림, 두 파일 같음 —
//    lib/avatarFrameArt.js 가 FRAME_ART · FRAME_REACH 에 합쳐 내보낸다).
//
//    그림 원본: scripts/deco-frames-art.mjs(합격 시안에서 뽑은 칸 지도 — 운영자 10/9 ~ 10/10). 정지 그림(시안 그대로, 움직임 없음).
//      📌 anim 이 있는 키(evf_clover · bsf_aura — 2026-10-25)만 사이트 SVG 에 CSS 움직임을 넣는다(animBody). 봇 정지 그림(avatarDecoArt)은 front 그대로
//    판 맞추기: 등급 테두리와 같은 자리 규칙을 쓴다 — 그림 상자 = 사진 지름 × 0.92 × 128/48(AvatarFrame frameSizeOf · botCards ringAvatar), 사진 가운데에 둔다.
//      등급 테두리는 128칸 판에 사진 반지름 24/0.92 칸이지만, 꾸미기는 시안 칸(사진 반지름 r 칸 — 112px 사진에서 2px)을 그대로 쓰고
//      viewBox 를 128 × r / (24/0.92) 칸으로 잡아 사진 반지름이 정확히 r 칸에 오게 한다(칸을 늘리거나 줄이지 않아 도트가 뭉개지지 않는다).
//    층: 시안의 back(사진 뒤)은 사진 원 밖으로만 보이게 잘라(clip — 원 반지름 r − 0.5 칸, 사진 가장자리와 틈이 없게) 앞층 밑에 깐다.
//      화면 · 카드는 테두리를 사진 위에 한 장 얹으므로, 사진 뒤 층을 따로 두지 않고도 시안(back → 사진 → front)과 같은 그림이 된다.
//      (사진이 반투명이거나 없을 때 — 이름 첫 글자 칸 · 상품 그림 — 사진 자리 안쪽 뒤층이 비쳐 보이지 않는 것도 이 자르기 덕)
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { DECO_FRAMES } from "./deco-frames-art.mjs";

const GRID = 128, HOLE = 24, OVERLAP = 0.92; // 등급 테두리 판(app/components/AvatarFrame FRAME_GRID · FRAME_HOLE, 구멍 = 사진의 0.92)
const RP = HOLE / OVERLAP; // 128칸 판에서 사진 반지름(칸) — FRAME_REACH 는 이 판 단위로 적는다
const fx = (v) => +v.toFixed(4);

// 칸 지도(줄 글자) → 칸 목록 [x, y, 글자]
const cellsOf = (d, rows) => rows.flatMap((row, j) => [...row].map((c, i) => [d.x0 + i, d.y0 + j, c]).filter(([, , c]) => c !== "."));
// 같은 색 가로 줄을 한 조각으로 합친 경로(색마다 path 하나, pal 순서) — 등급 테두리 runs · paths 와 같은 모양
function paths(d, rows) {
  const by = {};
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length;) {
      const c = row[i]; if (c === ".") { i++; continue; }
      let e = i; while (e + 1 < row.length && row[e + 1] === c) e++;
      (by[c] ||= []).push(`M${d.x0 + i} ${d.y0 + j}h${e - i + 1}v1h-${e - i + 1}z`);
      i = e + 1;
    }
  });
  return Object.keys(d.pal).filter((c) => by[c]).map((c) => `<path d="${by[c].join("")}" fill="${d.pal[c]}"/>`).join("");
}

// 📌 still — 움직임(d.anim)이 있는 키도 정지 그림으로(봇 카드 · avatarDecoArt). 움직임이 없는 키는 still 과 무관하게 같은 SVG
export function decoSvg(d, { still = false } = {}) {
  const V = fx((GRID * d.r) / RP), H = fx(V / 2);
  const back = d.back.length ? paths(d, d.back) : "";
  const cr = d.r - 0.5; // 사진 뒤층을 자르는 원 — 사진 가장자리 밑으로 반 칸 들어가 틈이 없게
  const clip = back
    ? `<defs><clipPath id="o"><path clip-rule="evenodd" d="M${-H} ${-H}H${H}V${H}H${-H}ZM${cr} 0A${cr} ${cr} 0 1 0 ${-cr} 0A${cr} ${cr} 0 1 0 ${cr} 0Z"/></clipPath></defs><g clip-path="url(#o)">${back}</g>`
    : "";
  if (d.anim && !still) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-H} ${-H} ${V} ${V}" shape-rendering="crispEdges">${clip}${animBody(d)}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-H} ${-H} ${V} ${V}" shape-rendering="crispEdges">${clip}${paths(d, d.front)}</svg>`;
}

// 📌 움직이는 앞층(2026-10-25 evf_clover 「네잎클로버 덩굴」 — 이 키만 anim 이 있다. 다른 키 SVG 는 그대로).
//    사이트는 SVG 를 <img> 로 얹어 스크립트는 못 돌지만 CSS 움직임은 돈다 — 장(ms)마다 칸을 통째로 넘긴다(steps(1) · 흐림 없음).
//    · 바람 잎(anim.parts): mask 칸은 front 에서 빼고, 상태마다 <g> 하나를 그 상태의 장 동안만 보인다. 첫 상태(정지)만 기본으로 보인다
//    · 나비(anim.fly): 날개 두 장을 장마다 자리로 옮긴다(transform). 기본은 안 보인다
//    움직임 줄이기(prefers-reduced-motion)면 움직임을 끈다 → 잎은 정지 상태, 나비는 없음 = 정지 그림(still)과 같은 모습
//    · 궤도 그림(anim.movers — 2026-10-25 bsf_aura 「부스트 오라 & 깃털 궤도」): 그림마다 <g> 하나를 장마다 자리로 옮기고(transform), 그 안의 상태(깃 방향 · 반짝이 크기)를
//      그 상태의 장 동안만 보인다. 첫 장에 보이는 상태 칸은 front 에도 있어(봇 정지 그림) 움직일 땐 front 에서 뺀다. 움직임 줄이기면 첫 장 자리 · 첫 장 상태 그대로
const atFrame0 = (on) => on.some(([a, l]) => 0 >= a && 0 < a + l);
function animBody(d) {
  const { n, ms, parts = [], fly, movers = [] } = d.anim;
  const key = (x, y) => x + "," + y;
  const masked = new Set();
  for (const p of parts) p.mask.forEach((row, j) => [...row].forEach((c, i) => { if (c === "x") masked.add(key(p.x0 + i, p.y0 + j)); }));
  for (const mv of movers) for (const s of mv.states) if (atFrame0(s.on)) s.rows.forEach((row, j) => [...row].forEach((c, i) => { if (c !== ".") masked.add(key(s.x0 + i, s.y0 + j)); }));
  const front = d.front.map((row, j) => [...row].map((c, i) => (masked.has(key(d.x0 + i, d.y0 + j)) ? "." : c)).join(""));
  // 장 묶음(on: [첫 장, 장 수] …) → 클래스 · 키프레임 이름(같은 묶음은 같은 이름)
  const css = new Map();
  const cls = (on) => {
    const name = "k" + on.map(([a, l]) => `${a}-${l}`).join("_");
    if (!css.has(name)) {
      const vis = (f) => on.some(([a, l]) => f >= a && f < a + l);
      let s = "", prev = null;
      for (let f = 0; f < n; f++) { const v = vis(f) ? 1 : 0; if (v !== prev) { s += `${fx((f * 100) / n)}%{opacity:${v}}`; prev = v; } }
      css.set(name, `.${name}{animation-name:${name}}@keyframes ${name}{${s}100%{opacity:${prev}}}`);
    }
    return "a " + name;
  };
  const comp = (on) => { const out = []; for (let f = 0; f < n; f++) if (!on.some(([a, l]) => f >= a && f < a + l)) { const r = out[out.length - 1]; if (r && r[0] + r[1] === f) r[1]++; else out.push([f, 1]); } return out; };
  let body = paths(d, front);
  for (const p of parts) p.states.forEach((s, i) => { body += `<g class="${cls(s.on)}"${i ? ' opacity="0"' : ""}>${paths({ ...d, x0: p.x0, y0: p.y0 }, s.rows)}</g>`; });
  let flyCss = "";
  if (fly) {
    const sp = (g) => paths({ ...d, x0: g.x0, y0: g.y0 }, g.rows);
    let moves = "", last = "";
    fly.path.forEach(([x, y], f) => { const t = `translate(${x}px,${y}px)`; if (t !== last) { moves += `${fx((f * 100) / n)}%{transform:${t}}`; last = t; } });
    body += `<g class="a fo" opacity="0"><g class="a fm"><g class="${cls(fly.openOn)}">${sp(fly.open)}</g><g class="${cls(comp(fly.openOn))}" opacity="0">${sp(fly.closed)}</g></g></g>`;
    flyCss = `.fo{animation-name:fo}@keyframes fo{0%,100%{opacity:1}}.fm{animation-name:fm}@keyframes fm{${moves}100%{transform:${last}}}`;
  }
  let moverCss = "";
  movers.forEach((mv, k) => {
    let moves = "", last = "";
    mv.path.forEach(([x, y], f) => { const t = `translate(${x}px,${y}px)`; if (t !== last) { moves += `${fx((f * 100) / n)}%{transform:${t}}`; last = t; } });
    body += `<g class="a mv${k}">${mv.states.map((s) => `<g class="${cls(s.on)}"${atFrame0(s.on) ? "" : ' opacity="0"'}>${paths({ ...d, x0: s.x0, y0: s.y0 }, s.rows)}</g>`).join("")}</g>`;
    moverCss += `.mv${k}{animation-name:mv${k}}@keyframes mv${k}{${moves}100%{transform:${last}}}`;
  });
  const style = `<style>.a{animation-duration:${fx((n * ms) / 1000)}s;animation-iteration-count:infinite;animation-timing-function:steps(1)}${[...css.values()].join("")}${flyCss}${moverCss}` +
    `@media (prefers-reduced-motion:reduce){.a{animation:none}}</style>`;
  return style + body;
}

// 그림이 사진 가운데에서 뻗는 거리(128칸 판 단위) [위, 아래, 옆, 옆(테두리 몸만)] — gen-avatar-frames reachOf 와 같은 뜻.
//   꾸미기는 반투명 빛무리 · 반짝이가 없어 넷째 = 셋째. 사진 원 안에 다 가려지는 뒤층 칸은 뺀다. 칸 끝까지 재고 올림(잘리지 않게)
//   움직임(anim)은 재지 않는다 — 기운 잎은 정지 칸 안쪽이고, 나비(evf_clover)는 잠깐 날아드는 그림이라 자리(이름 칸 여백)를 늘리지 않는다
const dMax = (x, y) => Math.hypot(Math.max(Math.abs(x), Math.abs(x + 1)), Math.max(Math.abs(y), Math.abs(y + 1)));
//   📌 궤도 그림(anim.movers — bsf_aura)은 잰다 — 늘 사진 둘레를 도는 그림이라 모든 장의 자리를 다 넣는다(잘리지 않게)
export function decoReach(d) {
  let up = 0, down = 0, side = 0;
  const seen = [...cellsOf(d, d.front), ...cellsOf(d, d.back).filter(([x, y]) => dMax(x, y) > d.r - 0.5)];
  for (const mv of d.anim?.movers || []) for (const s of mv.states) for (const [a, l] of s.on) for (let f = a; f < a + l; f++) {
    const [tx, ty] = mv.path[f];
    seen.push(...cellsOf({ x0: s.x0 + tx, y0: s.y0 + ty }, s.rows));
  }
  for (const [x, y] of seen) { up = Math.max(up, -y); down = Math.max(down, y + 1); side = Math.max(side, -x, x + 1); }
  const k = RP / d.r, s = Math.ceil(side * k);
  return [Math.max(0, Math.ceil(up * k)), Math.ceil(down * k), s, s];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const out = join(root, "public", "avatar-borders");
  mkdirSync(out, { recursive: true });
  const art = {}, reach = {};
  for (const d of DECO_FRAMES) {
    if (!/^(hwf|nwf|evf|bsf)_[a-z]+$/.test(d.key)) throw new Error(`꾸미기 테두리 키는 hwf_ · nwf_ · evf_ · bsf_ + 영문 소문자: ${d.key}`); // 등급 키와 겹치지 않게 · 착용 API 가 소문자로 바꾼다
    const svg = decoSvg(d);
    writeFileSync(join(out, `${d.key}.svg`), svg);
    art[d.key] = d.anim ? decoSvg(d, { still: true }) : svg; // 봇 카드는 정지 그림 — 움직임이 없는 키는 사이트 그림과 같은 SVG
    reach[d.key] = decoReach(d);
    console.log(d.key.padEnd(13), d.label.padEnd(8), "SVG", svg.length, "reach", JSON.stringify(reach[d.key]));
  }
  // 📌 lib/avatarDecoArt.js · bot/src/avatarDecoArt.js — lib/avatarFrameArt.js(등급 테두리, scripts/gen-avatar-frames.mjs)가 받아 FRAME_ART · FRAME_REACH 에 합친다. 두 파일은 같아야 한다(여기서만 만든다)
  const mod = `// 📌 프로필 꾸미기 테두리(할로윈 hwf_* · A New World nwf_*) 정지 그림 — scripts/gen-deco-frames.mjs 가 만든다(손으로 고치지 말 것). lib/avatarDecoArt.js 와 bot/src/avatarDecoArt.js 는 같은 파일이다
//    ./avatarFrameArt.js(등급 테두리)가 FRAME_ART · FRAME_REACH 에 합쳐 내보낸다 — 디스코드 이미지 카드(botCards)는 그쪽만 읽는다. 사이트 화면은 public/avatar-borders/<키>.svg(같은 그림)
export const DECO_FRAME_ART = ${JSON.stringify(art)};
// 그림이 사진 가운데에서 뻗는 거리(128칸 판 단위 · 구멍 48칸) [위, 아래, 옆, 옆(몸만)] — app/components/AvatarFrame FRAME_REACH 와 같은 값
export const DECO_FRAME_REACH = ${JSON.stringify(reach)};
`;
  writeFileSync(join(root, "lib", "avatarDecoArt.js"), mod);
  writeFileSync(join(root, "bot", "src", "avatarDecoArt.js"), mod);
  console.log("deco art module", mod.length);
  console.log("DECO_FRAME_REACH", JSON.stringify(reach));
}
