// 유물 카드 자리(geo)
//   📌 .claude/mockups/season3 시안 코드를 옮겨 온 것(_port_relic.mjs) — 그림을 고치면 시안 쪽에서 고치고 다시 옮긴다. 손으로 고치지 말 것
export const G = {
  W: 360, H: 556, CW: 120, CH: 185, CX: 62, CY: 70, PR: 34, NX: 112, BX0: 28, BX1: 332, BY: 338, BW: 104, R: 16,
  TEXT: [[102, 39, 282, 117], [18, 168, 144, 258], [18, 258, 216, 306], [18, 324, 342, 375], [18, 393, 342, 510]],
};
export const setGeo = (o) => Object.assign(G, o);
export const inTextPx = (x, y) => G.TEXT.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);
export const inTextCell = (x, y) => G.TEXT.some(([a, b, c, d]) => x >= a / 3 && x <= c / 3 && y >= b / 3 && y <= d / 3);
// 글자 자리에서 떨어진 정도 0(글자 위) ~ 1(R px 넘게 떨어짐) — 배경을 글자 둘레에서 서서히 옅게(딱 끊으면 글자마다 네모 상자가 보였다, 11/2 운영자 "레벨에 네모 박스")
export const textFade = (x, y, R = 24) => { let d = Infinity; for (const [a, b, c, e] of G.TEXT) { const dx = Math.max(a - x, 0, x - c), dy = Math.max(b - y, 0, y - e); d = Math.min(d, Math.hypot(dx, dy)); if (d === 0) return 0; } return Math.min(1, d / R); };
export const textFadeCell = (x, y) => textFade(x * 3 + 1.5, y * 3 + 1.5);
