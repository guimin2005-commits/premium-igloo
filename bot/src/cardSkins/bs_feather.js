// 📌 카드 테두리 「흩날리는 깃털과 엔젤 링」(bs_feather) — 서버 부스터 전용(2026-10-25 운영자 콘셉트). 프로필 테두리 「부스트 오라 & 깃털 궤도」(bsf_aura)와 한 벌.
//   시안: .claude/mockups/booster/frames2/card.mjs(360 × 556 · 칸 3px · 120 × 185칸) · 움직임 card-anim.mjs(GIF)
//   운영자 글: "얇고 정갈한 화이트 · 연보라 픽셀 라인이 카드를 두르고, 라인을 따라 드문드문 작은 하얀 깃털들이 흩날리듯 얹혀 있는 디자인"
//   테: 바깥 흰 줄 · 안쪽 연보라 줄(두 칸, 모서리 3칸 깎음) · 테 위 흰 깃 여섯(방향 · 크기 섞음) · 반짝이 다섯 · 위 테 오른쪽 엔젤 링(테가 링 가운데를 지나감)
//   깃 · 링 · 반짝이 자리는 시안 칸 자리를 카드 크기 비율로 옮긴다(가로 위치 · 세로 위치). 카드를 칠하지 않는다 — 카드 배경(ctx.onScene)을 끼어도 그대로. 모든 그림은 over 겹
//   📌 움직임(2026-10-25 운영자 "부스터 카드 테두리는 좀 애니메이션 넣어줘야 하는 거 아니냐 · 그래도 신화급인데") — 사이트만(봇 카드는 첫 장 그대로).
//     120ms 마다 한 장 · 96장 한 바퀴(약 11.5초), 칸을 통째로 넘긴다(steps(1) · 번짐 없음). 움직임 줄이기면 멈춘다(= 봇 그림).
//     · 테 위 깃 여섯: 차례로 한 칸 바깥으로 들썩(24장마다 4장 — 물결처럼 하나씩)
//     · 반짝이 다섯: 크기를 바꿔 반짝 · 잠깐 꺼짐(32장마다)
//     · 떨어지는 깃 하나: 엔젤 링 아래에서 좌우로 흔들리며(흔들리는 쪽으로 기운 그림) 오른쪽 띠를 따라 내려와 레벨 막대 위에서 사라진다(앞 72장 · 뒤 24장은 쉼)
export const meta = { key: "bs_feather", label: "흩날리는 깃털과 엔젤 링", grid: "line", tint: "#ffffff", gridOp: 0.05 };

const N = 96, STEP_MS = 120, FALL_ON = 72;
const LINE = "#ffffff", LINE_IN = "#b3a6f2";
const PAL = { o: "#8c84c9", w: "#ffffff", l: "#eceafd", s: "#cdc6f3", q: "#a79fe0", W: "#ffffff", L: "#d9d3fb", h: "#8c84c9" };
// 깃 — 끝이 위(V) · 위 오른쪽(D), 나머지 방향은 돌려서. 방향 번호 0 = 위, 1 = 위 오른쪽 … 7 = 위 왼쪽(45°씩 시계 방향)
const V = ["..o..", ".owo.", ".owo.", "owwlo", "owwlo", "owwso", "owlso", ".olo.", "..q..", "..q..", "..q.."];
const D = ["......oo.", ".....owwo", "....owwwo", "...owwwlo", "..owwwlo.", "..owwso..", ".oolso...", ".qoo.....", "q........"];
const v = ["..o..", ".owo.", "owwlo", "owlso", ".oso.", "..q..", "..q.."];
const d = ["....oo", "...owo", "..owlo", ".owso.", ".oso..", "q.o..."];
const rot = (rows) => rows[0].split("").map((_, i) => rows.map((r) => r[i]).reverse().join("")); // 시계 방향 90°
const eight = (a, b) => [a, b, rot(a), rot(b), rot(rot(a)), rot(rot(b)), rot(rot(rot(a))), rot(rot(rot(b)))];
const FEATHER = eight(V, D), SMALL = eight(v, d);
const SPARK = ["..L..", "..W..", "LWWWL", "..W..", "..L.."];
const SPARK_S = [".L.", "LWL", ".L."];
const HALO = ["...hhhhhh...", ".hhWWWWWWhh.", "hWs......sWh", ".hhsssssssh.", "...hhhhhh..."];

// 칸 판 위 그림 자리 — 시안(120 × 185칸) 자리를 카드 크기 비율로. fallTo: 떨어지는 깃이 사라지는 높이(칸 — 모르면 시안 비율)
function layout(cw, ch, o = 3, fallTo = null) {
  const L = o + 0.5, R = cw - 1 - o - 0.5, T = o + 0.5, B = ch - 1 - o - 0.5;
  const X = (f) => f * cw, Y = (f) => f * ch;
  return {
    cw, ch, o,
    halo: [cw - 20, T],
    // 깃 — rows · 가운데 · 들썩이는 쪽(테 바깥으로 한 칸) · 들썩 시작 장(24장마다 4장)
    feathers: [
      { rows: FEATHER[2], c: [X(62 / 120), T + 1], lift: [0, -1] }, // 위 — 누운 깃(끝 오른쪽)
      { rows: SMALL[1], c: [X(80 / 120), T - 0.5], lift: [0, -1] }, // 위 — 작은 깃(끝 위 오른쪽)
      { rows: FEATHER[3], c: [R, Y(58 / 185)], lift: [1, 0] }, // 오른쪽 — 비스듬히 내려오는 깃
      { rows: SMALL[4], c: [R + 0.5, Y(120 / 185)], lift: [1, 0] }, // 오른쪽 — 작은 깃(끝 아래)
      { rows: FEATHER[6], c: [X(74 / 120), B], lift: [0, 1] }, // 아래 — 누운 깃(끝 왼쪽)
      { rows: FEATHER[5], c: [L, Y(118 / 185)], lift: [-1, 0] }, // 왼쪽 — 비스듬히 내려오는 깃(끝 아래 왼쪽)
    ].map((f, i) => ({ ...f, at: 1 + i * 3 })),
    // 반짝이 — 쉴 때 그림 · 반짝일 때 그림(크기 바꿈) · 반짝 시작 장(32장마다 3장 반짝 · 10장 뒤 4장 꺼짐 — 첫 장은 모두 쉴 때 그림)
    sparks: [
      { rest: SPARK, c: [cw - 12, o + 7] }, { rest: SPARK_S, c: [X(54 / 120), o + 4] }, { rest: SPARK_S, c: [R - 4, Y(68 / 185)] },
      { rest: SPARK, c: [X(86 / 120), B - 3] }, { rest: SPARK_S, c: [L + 4, Y(128 / 185)] },
    ].map((s, i) => ({ ...s, tw: s.rest === SPARK ? SPARK_S : SPARK, at: [2, 7, 12, 17, 24][i] })),
    // 떨어지는 깃 — 엔젤 링 아래 → 오른쪽 띠를 따라 fallTo 까지, 좌우 2칸 흔들림
    fall: { x: cw - 16, y0: T + 9, y1: Number.isFinite(fallTo) ? Math.max(T + 30, fallTo) : Y(100 / 185) },
  };
}
const liftOn = (ft, f) => (((f - ft.at) % 24) + 24) % 24 < 4;
const sparkState = (s, f) => { const k = (((f - s.at) % 32) + 32) % 32; return k < 3 ? "tw" : k >= 10 && k < 14 ? "off" : "rest"; };
const fallAt = (Lay, f) => {
  if (f >= FALL_ON) return null;
  const t = f / (FALL_ON - 1), ph = (f / 24) * Math.PI * 2;
  const sway = Math.cos(ph);
  return { x: Lay.fall.x + 2 * Math.sin(ph), y: Lay.fall.y0 + (Lay.fall.y1 - Lay.fall.y0) * t, rows: sway > 0.4 ? SMALL[3] : sway < -0.4 ? SMALL[5] : SMALL[4] };
};

// 칸 그림판
function painter(cw, ch) {
  const m = new Map();
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < cw && y < ch && c) m.set(x + "," + y, c); };
  const stamp = (rows, cx, cy, dx = 0, dy = 0) => { const x0 = Math.round(cx - rows[0].length / 2) + dx, y0 = Math.round(cy - rows.length / 2) + dy; rows.forEach((r, j) => [...r].forEach((k, i) => put(x0 + i, y0 + j, PAL[k]))); };
  return { m, put, stamp };
}
// 테 · 엔젤 링(움직이지 않는 칸)
function baseCells(Lay) {
  const { cw, ch, o } = Lay, g = painter(cw, ch);
  const ring = (inset, c, cut) => {
    for (let x = inset + cut; x <= cw - 1 - inset - cut; x++) { g.put(x, inset, c); g.put(x, ch - 1 - inset, c); }
    for (let y = inset + cut; y <= ch - 1 - inset - cut; y++) { g.put(inset, y, c); g.put(cw - 1 - inset, y, c); }
    for (let k = 1; k < cut; k++) [[inset + k, inset + cut - k], [cw - 1 - inset - k, inset + cut - k], [inset + k, ch - 1 - inset - cut + k], [cw - 1 - inset - k, ch - 1 - inset - cut + k]].forEach(([x, y]) => g.put(x, y, c));
  };
  ring(o, LINE, 3); ring(o + 1, LINE_IN, 3);
  g.stamp(HALO, ...Lay.halo);
  return g.m;
}
// 장 f 의 칸 지도 전부(검증 · 시안 GIF 용). f = 0 이 봇 · 움직임 줄이기 그림(떨어지는 깃은 fall 을 켤 때만)
export function featherFrame(cw, ch, o = 3, f = 0, { fall = false, fallTo = null } = {}) {
  const Lay = layout(cw, ch, o, fallTo), g = painter(cw, ch);
  for (const [k, c] of baseCells(Lay)) g.m.set(k, c);
  for (const ft of Lay.feathers) { const up = liftOn(ft, f); g.stamp(ft.rows, ...ft.c, up ? ft.lift[0] : 0, up ? ft.lift[1] : 0); }
  for (const s of Lay.sparks) { const st = sparkState(s, f); if (st !== "off") g.stamp(st === "tw" ? s.tw : s.rest, ...s.c); }
  const fl = fall ? fallAt(Lay, f) : null;
  if (fl) g.stamp(fl.rows, fl.x, fl.y);
  return g.m;
}
// 정지 그림(봇 카드) — 첫 장
export const featherCells = (cw, ch, o = 3) => featherFrame(cw, ch, o, 0);

// 같은 색 가로 이웃 칸을 사각형 하나로 — 색마다 path 하나(ev_ghost · ev_clover 와 같은 꼴)
function svgOf(m, P, ox, oy) {
  const byC = new Map();
  for (const [key, c] of m) { const [x, y] = key.split(",").map(Number); if (!byC.has(c)) byC.set(c, new Map()); const rows = byC.get(c); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  let s = "";
  for (const [c, rows] of byC) {
    let p = "";
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; p += `M${ox + xs[i] * P} ${oy + y * P}h${(j - i + 1) * P}v${P}h${-(j - i + 1) * P}z`; i = j + 1; }
    }
    s += `<path d="${p}" fill="${c}"/>`;
  }
  return `<g shape-rendering="crispEdges">${s}</g>`;
}
const fx = (v) => +v.toFixed(4);
const ranges = (list) => { const out = []; for (const f of list) { const r = out[out.length - 1]; if (r && r[0] + r[1] === f) r[1]++; else out.push([f, 1]); } return out; };
const hashOf = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// deco(w, h, S, site, ctx) → { defs, under, over } — 다른 cardSkins 와 같은 꼴
//   칸: 사이트 3px(시안 그대로) · 봇 2.25 × S(2.2 → 5px — 봇 카드 글 · 막대가 테에서 72px 안쪽이라 깃이 그보다 바깥에 온다)
//   테 자리(o 칸): 사이트는 깃 안쪽 끝이 글자 시작(ctx.lineX0 · goalLeft — SkinFrame 이 잰다)보다 바깥에 오게 3칸에서 줄인다(ev_clover 와 같은 식 — 폰 레벨 카드 여백 26px → 2칸)
//   떨어지는 깃: 사이트는 레벨 막대(ctx.barY · barBottom) 위 8칸에서 사라진다 · 막대를 모르면 시안 비율 높이
//   키프레임 이름: 상태는 장 묶음 그대로(bsf-k<첫 장>-<장 수>… — 같은 이름은 같은 내용), 떨어지는 깃 길은 카드 크기마다 달라 내용 해시(bsf-m<해시>)
export function deco(w, h, S = 1, site = true, ctx = {}) {
  const P = site ? 3 : Math.max(3, Math.round(2.25 * S));
  const cw = Math.floor(w / P), ch = Math.floor(h / P);
  const ox = Math.floor((w - cw * P) / 2), oy = Math.floor((h - ch * P) / 2);
  const tx = site ? [ctx.lineX0, ctx.goalLeft].find((v) => Number.isFinite(v)) : undefined;
  const o = Number.isFinite(tx) ? Math.max(1, Math.min(3, Math.floor((tx - 1 - ox) / P) - 6)) : 3;
  if (!site) return { defs: "", under: "", over: svgOf(featherCells(cw, ch, o), P, ox, oy) };

  const barTop = Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const Lay = layout(cw, ch, o, barTop != null ? Math.floor((barTop - oy) / P) - 8 : null);
  const css = new Map();
  const cls = (on) => {
    const name = "bsf-k" + on.map(([a, l]) => `${a}-${l}`).join("_");
    if (!css.has(name)) {
      let s = "", prev = null;
      for (let f = 0; f < N; f++) { const vis = on.some(([a, l]) => f >= a && f < a + l) ? 1 : 0; if (vis !== prev) { s += `${fx((f * 100) / N)}%{opacity:${vis}}`; prev = vis; } }
      css.set(name, `.${name}{animation-name:${name}}@keyframes ${name}{${s}100%{opacity:${prev}}}`);
    }
    return "bsf-a " + name;
  };
  const frames = Array.from({ length: N }, (_, f) => f);
  const cells = (rows, cx, cy, dx = 0, dy = 0) => { const g = painter(cw, ch); g.stamp(rows, cx, cy, dx, dy); return g.m; };
  let over = svgOf(baseCells(Lay), P, ox, oy);
  // 깃 — 쉴 때(기본으로 보임) · 들썩일 때
  for (const ft of Lay.feathers) {
    const up = frames.filter((f) => liftOn(ft, f)), rest = frames.filter((f) => !liftOn(ft, f));
    over += `<g class="${cls(ranges(rest))}">${svgOf(cells(ft.rows, ...ft.c), P, ox, oy)}</g>`;
    over += `<g class="${cls(ranges(up))}" opacity="0">${svgOf(cells(ft.rows, ...ft.c, ...ft.lift), P, ox, oy)}</g>`;
  }
  // 반짝이 — 쉴 때(기본으로 보임) · 반짝일 때 · 꺼짐(둘 다 안 보임)
  for (const s of Lay.sparks) {
    const rest = frames.filter((f) => sparkState(s, f) === "rest"), tw = frames.filter((f) => sparkState(s, f) === "tw");
    over += `<g class="${cls(ranges(rest))}">${svgOf(cells(s.rest, ...s.c), P, ox, oy)}</g>`;
    over += `<g class="${cls(ranges(tw))}" opacity="0">${svgOf(cells(s.tw, ...s.c), P, ox, oy)}</g>`;
  }
  // 떨어지는 깃 — 기운 그림 셋(오른쪽 · 가운데 · 왼쪽)을 그 장에만, 자리는 장마다 옮김(transform). 기본은 숨김(움직임이 돌 때만 보인다)
  const path = frames.map((f) => fallAt(Lay, f));
  const sprite = (rows) => { const m = new Map(); rows.forEach((r, j) => [...r].forEach((k, i) => { if (PAL[k]) m.set(`${i - Math.floor(r.length / 2)},${j - Math.floor(rows.length / 2)}`, PAL[k]); })); return svgOf(m, P, 0, 0); };
  let moves = "", last = "";
  frames.forEach((f) => { const p = path[f]; if (!p) return; const t = `translate(${ox + Math.round(p.x) * P}px,${oy + Math.round(p.y) * P}px)`; if (t !== last) { moves += `${fx((f * 100) / N)}%{transform:${t}}`; last = t; } });
  const mv = "bsf-m" + hashOf(moves);
  over += `<g class="bsf-a bsf-fo" opacity="0"><g class="bsf-a ${mv}">` +
    [SMALL[3], SMALL[4], SMALL[5]].map((rows) => { const on = frames.filter((f) => path[f] && path[f].rows === rows); return on.length ? `<g class="${cls(ranges(on))}" opacity="0">${sprite(rows)}</g>` : ""; }).join("") + "</g></g>";
  const defs = `<style>.bsf-a{animation-duration:${fx((N * STEP_MS) / 1000)}s;animation-iteration-count:infinite;animation-timing-function:steps(1)}${[...css.values()].join("")}` +
    `.bsf-fo{animation-name:bsfOn}@keyframes bsfOn{0%,100%{opacity:1}}.${mv}{animation-name:${mv}}@keyframes ${mv}{${moves}100%{transform:${last}}}` +
    `@media (prefers-reduced-motion:reduce){.bsf-a{animation:none}}</style>`;
  return { defs, under: "", over };
}
