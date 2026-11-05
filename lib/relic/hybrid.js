// 유물 선 조각(강착원반 · 제트 흐름선 · 막대 불티)
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
import { G } from "./geo.js";

let CX, CY, PR, W, H; // 카드 자리 — 그릴 때마다 geo.mjs G 에서
const sync = () => { ({ CX, CY, PR, W, H } = G); }; sync();
const f2 = (n) => Math.round(n * 100) / 100;
const rndOf = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

export function vDisk(C, { rot = 0, s = 1 } = {}) {
  sync();
  const TILT = -36, back = [], front = [];
  for (let i = 0; i < 14; i++) {
    const rx = PR + 7 + i * (2 + 0.5 * s), ry = rx * 0.19, f = i / 13;
    const col = f < 0.18 ? "#fff" : f < 0.45 ? C.p4 : f < 0.75 ? C.p3 : C.p2, w = f < 0.25 ? 1.5 : f < 0.6 ? 0.9 : 0.55, op = f2(1 - f * 0.7);
    const arc = (sweep) => `<path d="M${f2(CX - rx)} ${CY} A${f2(rx)} ${f2(ry)} 0 0 ${sweep} ${f2(CX + rx)} ${CY}" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${op}" transform="rotate(${TILT} ${CX} ${CY})"/>`;
    back.push(arc(1)); front.push(arc(0));
  }
  for (let k = 0; k < 8; k++) {
    const a0 = (((rot + k * 45) % 360) * Math.PI) / 180, rx = PR + 10 + (k % 4) * 6, ry = rx * 0.19, a1 = a0 + 0.42;
    const seg = `<path d="M${f2(CX + Math.cos(a0) * rx)} ${f2(CY + Math.sin(a0) * ry)} A${f2(rx)} ${f2(ry)} 0 0 1 ${f2(CX + Math.cos(a1) * rx)} ${f2(CY + Math.sin(a1) * ry)}" fill="none" stroke="#fff" stroke-width="${k % 2 ? 1.2 : 2}" stroke-linecap="round" transform="rotate(${TILT} ${CX} ${CY})"/>`;
    (Math.sin(a0 + 0.2) > 0 ? front : back).push(seg);
  }
  return { back: back.join(""), front: front.join("") };
}
export function vSlits(C, { pulse = 1, t = 0, open = 1 } = {}) {
  sync();
  const out = [], rnd = rndOf(41);
  // 작은 블랙홀 — 모서리 안쪽 점(검은 구 · 흰 빛 고리 · 가로지르는 가는 원반) + 카드 안쪽으로 퍼지는 일그러진 동심 물결(바깥일수록 옅은 점선)
  //   t: 물결이 바깥으로 번짐(한 바퀴에 물결 한 칸)
  const hole = (px, py, sx, sy) => {
    const SP = 11, N = 5, ph = (t * 2) % 1;
    const a0 = Math.atan2(sy, sx); // 카드 안쪽 방향
    for (let i = 0; i < N + 1; i++) {
      const r = 9 + (i + ph) * SP, f = (i + ph) / N;
      if (f > 1) continue;
      let d = "";
      for (let k = 0; k <= 40; k++) {
        const a = a0 - 1.25 + (2.5 * k) / 40, wob = 1 + 0.025 * Math.sin(a * 5 + i);
        const x = px + Math.cos(a) * r * wob, y = py + Math.sin(a) * r * wob;
        d += (d ? " L" : "M") + `${f2(x)} ${f2(y)}`;
      }
      const op = f2((1 - f) * 0.9), dash = f < 0.35 ? "" : f < 0.65 ? ' stroke-dasharray="6 4"' : ' stroke-dasharray="2 5"';
      out.push(`<path d="${d}" fill="none" stroke="${f < 0.3 ? C.p4 : f < 0.6 ? C.p3 : C.p2}" stroke-width="${f < 0.3 ? 1 : 0.7}" stroke-opacity="${op}"${dash} stroke-linecap="round"/>`);
      if (i === 1) for (let k = 0; k < 3; k++) { const a = a0 - 0.8 + k * 0.8 + ph, x = px + Math.cos(a) * r, y = py + Math.sin(a) * r; out.push(`<rect x="${Math.round(x / 3) * 3}" y="${Math.round(y / 3) * 3}" width="3" height="3" fill="${k === 1 ? "#fff" : C.p4}" shape-rendering="crispEdges"/>`); }
    }
    // 점 — 프로필과 같은 문법: 뒤 반 원반(코어 색) → 검은 구 + 흰 빛 고리 → 앞 반 원반(흰빛)
    const R = 5, RX = 12, RY = 2.8, T = -36;
    out.push(`<path d="M${px - RX} ${py} A${RX} ${RY} 0 0 1 ${px + RX} ${py}" fill="none" stroke="${C.p3}" stroke-width="1" transform="rotate(${T} ${px} ${py})"/>`);
    out.push(`<circle cx="${px}" cy="${py}" r="${R + 1.6}" fill="none" stroke="${C.p3}" stroke-width="0.8" stroke-opacity="0.8"/>`);
    out.push(`<circle cx="${px}" cy="${py}" r="${R}" fill="#000" stroke="#fff" stroke-width="1.4"/>`);
    out.push(`<path d="M${px - RX} ${py} A${RX} ${RY} 0 0 0 ${px + RX} ${py}" fill="none" stroke="#fff" stroke-width="1.3" transform="rotate(${T} ${px} ${py})"/>`);
  };
  // 모서리 장식은 비움 — 운영자 "걍 비워라"(도트 틈 · 유리 금 · 가는 틈 · 작은 블랙홀 물결 모두 반려). 아래 hole() 은 쓰지 않음
  // 제트 흐름선 — 픽셀 빛줄기 안쪽으로 끊긴 가는 선 둘(흐르는 듯 대시 이동)
  const stream = (x0, y0, dx, dy, L) => {
    const nx = -dy, ny = dx;
    [[11, 0.9, C.p3, "14 6"], [16, 0.6, C.p2, "6 10"]].forEach(([off, w, col, da]) => {
      const x1 = x0 + nx * off, y1 = y0 + ny * off;
      out.push(`<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x1 + dx * L * pulse)}" y2="${f2(y1 + dy * L * pulse)}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${da}" stroke-dashoffset="${f2(-t * 200)}" stroke-linecap="round" stroke-opacity="0.85"/>`);
    });
  };
  const SX = W * 0.4167, SY = H * 0.4137; // 제트 흐름선 길이 — 변 길이 비율
  stream(42, 3, 1, 0, SX); stream(W - 3, 42, 0, 1, SY); stream(W - 42, H - 3, -1, 0, SX); stream(3, H - 42, 0, -1, SY);
  return out.join("");
}
export function vBarFx(C, { pct = 0.49, spark = 0, squeeze = 0 } = {}) {
  const rnd = rndOf(13 + spark), out = [], hx = G.BX0 + (G.BX1 - G.BX0) * pct, y0 = G.BY, h = 27 * (1 - 0.45 * squeeze);
  out.push(`<line x1="${G.BX0 + 3}" y1="${f2(y0 - h / 2 - 1)}" x2="${f2(hx)}" y2="${f2(y0 - h / 2 - 1)}" stroke="${C.p3}" stroke-width="0.8" stroke-opacity="0.8"/>`);
  out.push(`<line x1="${G.BX0 + 3}" y1="${f2(y0 + h / 2 + 1)}" x2="${f2(hx)}" y2="${f2(y0 + h / 2 + 1)}" stroke="${C.p2}" stroke-width="0.6" stroke-opacity="0.7"/>`);
  for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, l = 6 + rnd() * 14, x = hx - rnd() * 30; out.push(`<line x1="${f2(x)}" y1="${y0}" x2="${f2(x + Math.cos(a) * l)}" y2="${f2(y0 + Math.sin(a) * l * 0.7)}" stroke="${i % 3 ? C.p4 : "#fff"}" stroke-width="${i % 3 ? 0.6 : 1}" stroke-linecap="round"/>`); }
  return out.join("");
}