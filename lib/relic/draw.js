// 📌 유물 그림 조각(SVG 조각 문자열 + <cells i/> 표식)을 캔버스에 그린다 — lib/relic relicLayers 가 만든 것만 받는다(쓰는 태그 · 속성이 정해져 있다)
//   태그: g(transform) · cells · path · line · circle · ellipse · rect · polygon. 속성: fill · stroke · *-opacity · stroke-width · dasharray · dashoffset · linecap · linejoin · transform
//   칸(cells)은 기기 화소에 맞춰 반올림해 채운다 — 칸 사이 틈 · 번짐 없이. 선은 그대로(매끈하게)
const TAG = /<(\/?)([a-z]+)\b([^>]*?)(\/?)>/g;
// 속성 이름에 숫자도(x1 · y1 · x2 · y2 — 11/2 빠뜨려 사이트에서 선이 하나도 안 그려졌다: 워프 빛줄기 · 막대 불티 · 흡입 알갱이 · 터지는 빛살)
const ATTR = /([a-zA-Z][a-zA-Z0-9-]*)="([^"]*)"/g;
const attrs = (s) => { const o = {}; let m; ATTR.lastIndex = 0; while ((m = ATTR.exec(s))) o[m[1]] = m[2]; return o; };
const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
function applyTransform(ctx, tr) {
  const re = /(rotate|translate|scale)\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(tr))) {
    const v = m[2].trim().split(/[\s,]+/).map(Number);
    if (m[1] === "translate") ctx.translate(v[0] || 0, v[1] || 0);
    else if (m[1] === "scale") ctx.scale(v[0], v.length > 1 ? v[1] : v[0]);
    else { const [a, cx = 0, cy = 0] = v; ctx.translate(cx, cy); ctx.rotate((a * Math.PI) / 180); ctx.translate(-cx, -cy); }
  }
}
function paint(ctx, path, a) {
  const fill = a.fill === undefined ? "#000" : a.fill;
  if (fill !== "none") { ctx.globalAlpha = num(a["fill-opacity"], 1); ctx.fillStyle = fill; ctx.fill(path); }
  if (a.stroke && a.stroke !== "none") {
    ctx.globalAlpha = num(a["stroke-opacity"], 1);
    ctx.strokeStyle = a.stroke;
    ctx.lineWidth = num(a["stroke-width"], 1);
    ctx.lineCap = a["stroke-linecap"] || "butt";
    ctx.lineJoin = a["stroke-linejoin"] || "miter";
    ctx.setLineDash(a["stroke-dasharray"] ? a["stroke-dasharray"].trim().split(/[\s,]+/).map(Number) : []);
    ctx.lineDashOffset = num(a["stroke-dashoffset"], 0);
    ctx.stroke(path);
  }
  ctx.globalAlpha = 1;
}
// 칸 판 — 지금 변환(이동 · 늘림만)으로 기기 화소 자리를 구해 반올림, 색마다 묶어 채운다
function drawCells(ctx, rec) {
  if (!rec) return;
  const { g, colors, cs, ox, oy } = rec, m = ctx.getTransform(), by = new Map();
  for (const [k, c] of g.m) { const col = (colors && colors[c]) || c; let arr = by.get(col); if (!arr) by.set(col, (arr = [])); arr.push(k); }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [col, keys] of by) {
    ctx.fillStyle = col;
    for (const k of keys) {
      const i = k.indexOf(","), x = ox + +k.slice(0, i) * cs, y = oy + +k.slice(i + 1) * cs;
      const x0 = Math.round(m.a * x + m.e), y0 = Math.round(m.d * y + m.f), x1 = Math.round(m.a * (x + cs) + m.e), y1 = Math.round(m.d * (y + cs) + m.f);
      if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  ctx.restore();
}
// frag 를 ctx 에 — scale: 기기 화소 / 그림 px(지운 뒤 그린다)
export function drawFrag(ctx, frag, cells, scale) {
  const cv = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!frag) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  let m, depth = 0;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(frag))) {
    const [, close, tag, rest, self] = m;
    if (tag === "g") {
      if (close) { if (depth > 0) { ctx.restore(); depth--; } continue; }
      ctx.save(); depth++;
      const a = attrs(rest);
      if (a.transform) applyTransform(ctx, a.transform);
      if (self) { ctx.restore(); depth--; }
      continue;
    }
    if (close) continue;
    const a = attrs(rest);
    if (tag === "cells") { drawCells(ctx, cells[+a.i]); continue; }
    let p;
    if (tag === "path") p = new Path2D(a.d || "");
    else if (tag === "line") { p = new Path2D(); p.moveTo(num(a.x1, 0), num(a.y1, 0)); p.lineTo(num(a.x2, 0), num(a.y2, 0)); }
    else if (tag === "circle") { p = new Path2D(); p.arc(num(a.cx, 0), num(a.cy, 0), Math.max(0, num(a.r, 0)), 0, Math.PI * 2); }
    else if (tag === "ellipse") { p = new Path2D(); p.ellipse(num(a.cx, 0), num(a.cy, 0), Math.max(0, num(a.rx, 0)), Math.max(0, num(a.ry, 0)), 0, 0, Math.PI * 2); }
    else if (tag === "rect") { p = new Path2D(); const rx = num(a.rx, 0), w = num(a.width, 0), h = num(a.height, 0); if (rx > 0 && p.roundRect) p.roundRect(num(a.x, 0), num(a.y, 0), w, h, rx); else p.rect(num(a.x, 0), num(a.y, 0), w, h); }
    else if (tag === "polygon") { p = new Path2D(); const v = (a.points || "").trim().split(/[\s,]+/).map(Number); for (let i = 0; i + 1 < v.length; i += 2) (i ? p.lineTo : p.moveTo).call(p, v[i], v[i + 1]); p.closePath(); }
    else continue;
    if (a.transform) { ctx.save(); applyTransform(ctx, a.transform); paint(ctx, p, a); ctx.restore(); }
    else paint(ctx, p, a);
  }
  while (depth-- > 0) ctx.restore();
}
