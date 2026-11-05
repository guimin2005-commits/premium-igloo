// 유물 선 배경(나선 성운 · 별 줄기)
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
import { G, inTextPx, textFade } from "./geo.js";

let CX, CY, PR, W, H; // 카드 자리 — 그릴 때마다 geo.mjs G 에서
const sync = () => { ({ CX, CY, PR, W, H } = G); }; sync();
const TAU = Math.PI * 2;
const rndOf = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const f2 = (n) => Math.round(n * 100) / 100;
const inText = inTextPx; // px

// 나선 점 — 반지름 r, 시작 각 th0 에서 프로필로 감겨 드는 길(감김 K)
const spiralPt = (th0, r, K, R0) => { const th = th0 + K * Math.log(R0 / r); return [CX + Math.cos(th) * r, CY + Math.sin(th) * r]; };

export function vBg(C, { s = 1, t = 0, base = true, nStars = 260, wave = null } = {}) { // wave: { R, A, W } px — 렌즈 파동
  sync();
  const rnd = rndOf(9), K = 1.25 * s, out = [];
  const warp = ([x, y]) => { if (!wave) return [x, y]; const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy) || 1, d = wave.A * Math.exp(-(((r - wave.R) / wave.W) ** 2)); return [x + (dx / r) * d, y + (dy / r) * d]; };
  if (base) out.push(`<rect width="${W}" height="${H}" fill="#07060c"/>`);
  // 성운 결 — 나선 팔을 따라 겹친 가는 곡선 다발(바깥은 짙게, 안은 밝게). 글자 자리를 지나는 마디는 아주 옅게
  for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 26; i++) {
    const th0 = arm * Math.PI + (i - 13) * 0.035 - t * TAU, R0 = 560;
    let d = "", prevLv = null; // 글자에서 떨어진 정도를 네 단으로 — 단이 바뀌면 마디를 끊고(이어 붙여) 옅기만 달리한다
    const segs = [];
    for (let r = R0; r > 52; r *= 0.97) {
      const [x, y] = warp(spiralPt(th0, r, K, R0)); const lv = Math.round(textFade(x, y) * 3) / 3;
      if (prevLv === null || lv !== prevLv) { if (d) segs.push([d + ` L${f2(x)} ${f2(y)}`, prevLv]); d = `M${f2(x)} ${f2(y)}`; } else d += ` L${f2(x)} ${f2(y)}`;
      prevLv = lv;
    }
    if (d) segs.push([d, prevLv]);
    const op = 0.08 + 0.14 * (1 - Math.abs(i - 13) / 13);
    for (const [p, it] of segs) out.push(`<path d="${p}" fill="none" stroke="${i % 5 === 0 ? C.p3 : C.p2}" stroke-width="${i % 5 === 0 ? 1.1 : 0.7}" stroke-opacity="${f2(op * (0.3 + 0.7 * it))}"/>`);
  }
  // 별 줄기 — 나선 길을 따라 짧은 곡선, 머리(안쪽)는 밝은 점
  for (let i = 0; i < nStars; i++) {
    const R0 = 560, u = (rnd() + t * (1 + (i % 3))) % 1, r = 560 - u * 500, th0 = rnd() * TAU, b = rnd();
    if (r < 50) continue;
    const len = (10 + 70 * Math.max(0, 1 - r / 420)) * s;
    let d = "", hx = 0, hy = 0;
    for (let q = 0; q <= len; q += 3) { const [x, y] = warp(spiralPt(th0, r + q, K, R0)); if (!d) { d = `M${f2(x)} ${f2(y)}`; hx = x; hy = y; } else d += ` L${f2(x)} ${f2(y)}`; }
    if (hx < -10 || hy < -10 || hx > W + 10 || hy > H + 10) continue;
    const fd = textFade(hx, hy), it = fd < 0.5, op = 0.25 + (0.3 + 0.4 * b) * fd;
    out.push(`<path d="${d}" fill="none" stroke="${b < 0.3 ? C.p4 : C.p3}" stroke-width="${b < 0.3 ? 1 : 0.6}" stroke-opacity="${f2(op * 0.7)}" stroke-linecap="round"/>`);
    out.push(`<circle cx="${f2(hx)}" cy="${f2(hy)}" r="${b < 0.3 ? 1.3 : 0.8}" fill="${b < 0.3 ? "#fff" : C.p4}" fill-opacity="${f2(op)}"/>`);
  }
  // 유입 줄기 — 굵은 밝은 실 두 가닥
  for (const [th0, w] of [[0.5 - t * TAU, 1.6], [-2.6 - t * TAU, 1.1]]) {
    let d = ""; for (let r = 520; r > 48; r *= 0.975) { const [x, y] = warp(spiralPt(th0, r, K, 520)); d += (d ? " L" : "M") + `${f2(x)} ${f2(y)}`; }
    out.push(`<path d="${d}" fill="none" stroke="${C.p3}" stroke-width="${w}" stroke-opacity="0.55" stroke-linecap="round"/>`);
  }
  // 렌즈 호 — 프로필 둘레 끊긴 가는 고리 세 겹(아인슈타인 고리)
  [[50, 0.9, "8 6"], [56, 0.6, "3 9"], [63, 0.5, "2 12"]].forEach(([r, w, da], i) => out.push(`<circle cx="${CX}" cy="${CY}" r="${r}" fill="none" stroke="${i ? C.p2 : C.p3}" stroke-width="${w}" stroke-dasharray="${da}" stroke-opacity="${0.7 - i * 0.2}" transform="rotate(${f2(t * 120 + i * 40)} ${CX} ${CY})"/>`));
  return out.join("");
}