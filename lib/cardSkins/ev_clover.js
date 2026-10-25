// 📌 카드 테두리 「네잎클로버 덩굴」(ev_clover) — 친구 초대 전용 꾸미기(2026-10-25 운영자 콘셉트 · 시안 GIF "좋다~"). 프로필 테두리 「네잎클로버 덩굴」(evf_clover)과 한 벌.
//   시안: .claude/mockups/invite/card-border-clover.mjs frame(f, 48)(360 × 556 카드 · 칸 3px · 120 × 185칸) — "좋은 인연(행운)을 물고 온 친구"
//   카드를 타고 오르는 얇은 클로버 줄기(오른쪽 테 → 위 오른쪽 덩굴손 · 아래 테 · 왼쪽 테는 레벨 막대 높이까지) + 덩굴 잎 · 토끼풀 꽃
//   + 세잎클로버 사이에 돋은 큰 네잎클로버 하나(덤불). 줄기 · 잎 · 덤불은 시안과 같은 식으로 카드 크기마다 칸으로 다시 그린다(360 × 556 · 막대 모름은 시안과 칸 하나까지 같다)
//   덤불 자리 — 시안은 아래 오른쪽 구석. 그런데 레벨 페이지 · 상점 미리보기 카드는 그 구석에 스탯 「누적 음성 시간」 값이 있어 덮는다 →
//     레벨 막대를 아는 사이트 카드는 덤불을 막대 높이 오른쪽 덩굴에 붙여 키운다(아래 「덩굴에 붙은 덤불」).
//     📌 2026-10-25 운영자 — 덤불만 막대 위로 옮긴 판은 "개대충 옮기기만 해놨네" · "중간에 그냥 옮겨서 좀 부자연스러운데" →
//        시안 A(막대 위를 기는 줄기) · B(덩굴에 붙어 자란 덤불) 중 "B ㄱ" + "왼쪽 아래도 좀 채워라" + "나비 애니메이션도 다른 거 하나만 더"
//        (.claude/mockups/invite/카드테두리-네잎클로버-덤불자리-시안.png · -움직임.gif)
//     덩굴에 붙은 덤불: 오른쪽 덩굴이 덤불 한가운데를 지나가고 네잎이 덩굴 위에 바로 앉는다 · 세잎 셋(위 · 왼쪽 위 · 왼쪽 아래) + 작은 싹 · 꽃.
//       비게 된 아래 오른쪽 구석은 작은 풀숲(키 다른 싹 · 꽃 · 풀잎 — 스탯 글자 아래 7칸 안)에서 덩굴 둘이 갈라져 나간다.
//       왼쪽 끝 잎은 가장 긴 등급 글자 「그랜드마스터까지 N레벨」 끝보다 오른쪽에만(좁으면 바깥 것부터 뺀다)
//     봇: 구석이 비는 역할 지급 카드는 시안대로 구석(위 왼쪽 세잎은 뺀다 — 가운데 정렬 긴 역할 이름 끝에 닿았다) · 레벨업 카드는 아래 막대 · Lv 줄 위 덩굴에 붙은 덤불 · 다른 카드는 덤불 없이 줄기 + 구석 풀숲(hwFloor botFloorOpen · botTopOpen)
//   움직임(사이트만 — 움직임 줄이기면 멈춘다): 120ms 마다 한 장 · 96장 한 바퀴 —
//     바람(48장마다 한 번): 앞자락이 왼쪽 아래 → 오른쪽 위로 지나며 덩굴 잎 · 덤불 잎이 한 칸 기운다.
//     나비 두 장면: 앞 48장은 흰 나비가 오른쪽 위에서 내려와 네잎에 앉았다가 다시 날아가고(시안 GIF), 뒤 48장은 노랑나비가 왼쪽 아래에서 들어와
//     아래 덩굴을 따라 낮게 날아 오른쪽 아래 덩굴 꽃에 앉았다가 오른쪽 위 테 밖으로 날아간다. 봇은 첫 장(나비 없음)
//   카드를 칠하지 않는다 — 바탕 결이 없어 카드 배경(ctx.onScene)을 끼어도 그대로. 모든 그림은 over 겹(글자 아래)
import { botTopOpen, botFloorOpen } from "./hwFloor.js";

export const meta = { key: "ev_clover", label: "네잎클로버 덩굴", grid: "line", tint: "#ffffff", gridOp: 0.05 };

const N = 96, WIND = 48, STEP_MS = 120; // 시안 GIF 48장 × 120ms 한 바퀴를 나비 두 장면으로 두 번(바람은 장면마다 한 번)

// ── 색 — 풀빛(따뜻한 연두 쪽) ──
const OUT = "#1d3a1a"; // 잎 테
const STEM = "#5aa83e", STEM_D = "#3a7a2c"; // 줄기 · 줄기 그늘
const LEAF = "#6cc24a", LEAF_H = "#a6e57c", LEAF_D = "#3f8a35";
const LUCK = "#7fdc56", LUCK_H = "#d2f7a8", LUCK_D = "#46a03a"; // 네잎(조금 더 밝게)
const BLOOM = "#fff6f0", BLOOM_P = "#ffc2d1";

// ── 잎 — 손 그림 하트 잎(5 × 6, 끝이 아래 = 줄기 쪽). 돌려서 위 · 왼 · 오 · 아래 잎 ──
const HEART = [".o.o.", "oHoHo", "oHGGo", "oGGDo", ".oGo.", "..o.."];
const rot90 = (rows) => rows[0].split("").map((_, i) => rows.map((r) => r[i]).reverse().join("")); // 시계 방향
const four = (h) => ({ up: h, right: rot90(h), down: rot90(rot90(h)), left: rot90(rot90(rot90(h))) });
const HEARTS = four(HEART);
// 네잎용 큰 하트 잎(7 × 8) — 덤불에서 한눈에 보이게 한 치수 크게
const HEARTS_L = four([".oo.oo.", "oHHoHGo", "oHGGGGo", "oGGGGDo", "oGGGDDo", ".oGGDo.", "..oDo..", "...o..."]);
const LEAF_PAL = { o: OUT, H: LEAF_H, G: LEAF, D: LEAF_D };
const LUCK_PAL = { o: OUT, H: LUCK_H, G: LUCK, L: LUCK, D: LUCK_D, c: "#2f6a2a" };
// 덩굴 잎(작은 세잎 5 × 5) · 바람에 기운 싹(위 두 줄이 한 칸 오른쪽)
const SMALL = ["..h..", ".hGg.", "hGgGg", ".gGg.", "..s.."];
const SMALL_T = ["...h.", "..hGg", ".hGgG", ".gGg.", "..s.."];
const SMALL_PAL = { h: LEAF_H, G: LEAF, g: LEAF_D, s: STEM_D };
// 토끼풀 꽃(작은 흰 꽃)
const FLOWER = [".w.", "wpw", ".w."];
const FLOWER_PAL = { w: BLOOM, p: BLOOM_P };
// 나비 — 열린 날개 · 닫힌 날개. 흰 나비(네잎에 앉는 장면) · 노랑나비(덩굴 꽃에 앉는 장면)
const BFLY_O = [".oo...oo.", "oWWo.oWWo", "oWpWoWpWo", ".oWWbWWo.", "..oWbWo..", ".oWwowWo.", ".oo...oo."];
const BFLY_C = [".o...o.", "oWo.oWo", "oWpopWo", ".oWbWo.", "..oWo..", "...b...", "......."];
const BFLY_PALS = {
  w: { o: "#4a4060", W: "#fff6f0", w: "#ffd6e2", p: "#ffb3c8", b: "#2a2238" },
  y: { o: "#6b5320", W: "#ffe27a", w: "#fff3b8", p: "#f2a33a", b: "#3d2c12" },
};

const kOf = (x, y) => x + "," + y;
// 물결 경로 — (ax, ay) → (bx, by), 진행 방향에 수직으로 amp 칸 흔들림(주기 per 칸)
const wave = (ax, ay, bx, by, amp, per, ph = 0) => {
  const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L), nx = -(by - ay) / L, ny = (bx - ax) / L;
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = Math.sin((i / per) * Math.PI * 2 + ph) * amp; return [ax + (bx - ax) * t + nx * s, ay + (by - ay) * t + ny * s]; });
};
// 잎자루 — a → b 를 c 쪽으로 휘는 2차 곡선
const curve = (a, c, b) => {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.5) + 2;
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; });
};

// 📌 판 짜기 — 칸 cw × ch · 테 자리 o(테 바깥선이 바깥에서 o 칸 안쪽 — 시안 3).
//    bush: "corner"(시안 — 아래 오른쪽 구석) · "vine"(덩굴에 붙은 덤불 — 막대 바로 위 줄 yb 에서 위로) · null(덤불 없음). 구석 덤불이 없으면 구석은 작은 풀숲
//    dropTop: 구석 덤불 위 왼쪽 세잎(c2) 빼기 · leftMin: 덩굴 덤불 잎이 넘지 않을 왼쪽 칸 · leftTop: 왼쪽 덩굴 끝(덩굴손 아래) 칸
function layout(cw, ch, o, { bush = "corner", yb = 0, leftMin = 0, dropTop = false, leftTop } = {}) {
  const X0 = o, Y0 = o, X1 = cw - 1 - o, Y1 = ch - 1 - o;
  const lt = Math.max(Y0 + 20, Math.min(Y1 - 20, leftTop ?? Y0 + 96));
  // ② 아래 덩굴 · ③ 왼쪽 덩굴(위 끝은 덩굴손) · ① 오른쪽 덩굴이 위 오른쪽에서 위 테로 넘어가 동그랗게 말린 덩굴손
  const bottom = wave(X1 - 16, Y1 - 1, X0 + 6, Y1 - 1, 1, 16, 2);
  const left = wave(X0 + 2, Y1 - 3, X0 + 1, lt, 1, 14, 0.5);
  const stems = [
    wave(X1 - 2, Y0 + 7, X1 - 26, Y0 + 1, 1, 12, 1),
    [[X1 - 26, Y0 + 1], [X1 - 29, Y0 + 1], [X1 - 30, Y0 + 3], [X1 - 28, Y0 + 4], [X1 - 27, Y0 + 3]],
    bottom,
    [[X0 + 6, Y1 - 1], [X0 + 3, Y1 - 2], [X0 + 2, Y1 - 3]],
    left,
    [[X0 + 1, lt], [X0 + 1, lt - 4], [X0 + 3, lt - 6], [X0 + 4, lt - 4], [X0 + 3, lt - 3]],
  ];
  const sprouts = [], flowers = [], grass = [], petioles = [], clovers = [];
  const ly = Math.round((ch * 128) / 185);
  flowers.push([Math.round((cw * 56) / 120), Y1 - 3], ...(ly > lt + 3 ? [[X0 + 2, ly]] : []));
  let rights, B = null, perch2 = null, keep = () => true;

  if (bush === "corner") {
    // ── 시안 그대로 — 오른쪽 덩굴은 아래 오른쪽 구석 덤불에서 위로. 세잎클로버 셋 사이에 네잎클로버 하나 · 밑동에서 잎자루 · 밑동 풀 몇 가닥 ──
    const right = wave(X1 - 1, Y1 - 14, X1 - 1, Y0 + 8, 1, 15);
    rights = [right];
    stems.push(right);
    const base = [X1 - 8, Y1 - 3];
    clovers.push(
      ...[
        { id: "c0", x: X1 - 27, y: Y1 - 7 }, { id: "c1", x: X1 - 3, y: Y1 - 27 }, { id: "c2", x: X1 - 22, y: Y1 - 23 },
        { id: "q", x: X1 - 11, y: Y1 - 14, q: true }, // 네잎 — 가운데 앞, 크게 · 조금 더 밝게
      ].filter((c) => !(dropTop && c.id === "c2")),
    );
    clovers.forEach((c) => petioles.push([base, [(base[0] + c.x) / 2 + (c.x < base[0] ? 1 : -1), (base[1] + c.y) / 2 + 1], [c.x, c.y + 1]]));
    B = { clovers, tufts: [[X1 - 14, Y1 - 1], [X1 - 12, Y1 - 2], [X1 - 3, Y1 - 2], [X1 - 1, Y1 - 4]] };
    const ry = Math.round((ch * 98) / 185);
    flowers.push([X1 - 1, ry]);
    perch2 = [X1 - 1, ry - 4];
  } else {
    // ── 구석 덤불이 없는 판(덩굴에 붙은 덤불 · 덤불 없음) — 아래 오른쪽 구석은 작은 풀숲, 오른쪽 · 아래 덩굴이 여기서 갈라져 나간다 ──
    //   📌 2026-10-25 운영자 "얘네도 구석 수정해줘야지" — 덤불 없는 봇 카드(/레벨 등)도 구석이 줄기만 둥글게 꺾여 비었다 → 같은 풀숲
    //   풀숲: 키 다른 싹(가운데가 높게) · 작은 꽃 둘 · 풀잎. 위로 7칸을 넘지 않는다(사이트 스탯 글자 아래 · 봇 글 여백 72px 안). 노랑나비는 덩굴 쪽 꽃에 앉는다
    const vx = X1 - 1, rootY = Y1 - 8;
    sprouts.push({ id: "k1", x: X1 - 6, y: Y1 - 3 }, { id: "k2", x: X1 - 10, y: Y1 - 1 }, { id: "k3", x: X1 - 3, y: Y1 - 1 }, { id: "k4", x: vx - 1, y: Y1 - 10 });
    petioles.push([[X1 - 6, Y1 - 1], [X1 - 6, Y1 - 3]], [[X1 - 14, Y1 - 1], [X1 - 14, Y1 - 2]]);
    flowers.push([X1 - 14, Y1 - 3], [X1 - 1, Y1 - 5]);
    grass.push([X1 - 8, Y1 - 1, 2], [X1 - 12, Y1 - 1, 2], [X1 - 17, Y1 - 1, 3], [X1 - 18, Y1 - 1, 2]);
    const root = { x0: X1 - 20, y0: Y1 - 12, x1: X1 + 4, y1: Y1 + 2 };
    const hit = (b, x0, y0, x1, y1) => x1 >= b.x0 - 1 && x0 <= b.x1 + 1 && y1 >= b.y0 - 1 && y0 <= b.y1 + 1;
    if (bush === "vine") {
      // ── 덩굴에 붙은 덤불(B) — 막대 바로 위 줄 yb 에서 위로 37칸. 오른쪽 덩굴은 구석 풀숲 → 덤불 마디(ny) → 위 오른쪽 덩굴손 ──
      const ny = yb - 4;
      const low = wave(vx, rootY, vx, ny, 1, 15), up = wave(vx, ny, vx, Y0 + 8, 1, 15, Math.PI * 0.4);
      rights = [low, up];
      // 덤불 — 네잎은 덩굴 위에 바로(덩굴이 덤불 가운데를 지나간다) · 세잎 위(덩굴 위) · 왼쪽 위 · 왼쪽 아래 · 왼쪽 아래 끝 싹 · 꽃 · 마디 둘레 싹
      const q = { id: "q", x: X1 - 6, y: yb - 15, q: true };
      const t1 = { id: "t1", x: X1 - 2, y: yb - 31 };
      const t3 = { id: "t3", x: X1 - 17, y: yb - 24 };
      const t2 = { id: "t2", x: X1 - 17, y: yb - 7 };
      const okL = (x) => x >= leftMin; // 잎 왼쪽 끝 칸이 등급 글자 끝보다 오른쪽
      clovers.push(q, t1);
      petioles.push(curve([vx, ny], [X1 - 2, yb - 10], [q.x + 1, q.y + 2]), curve([vx, yb - 20], [vx + 1, yb - 26], [t1.x, t1.y + 1]));
      if (okL(t3.x - 6)) { clovers.push(t3); petioles.push(curve([vx, ny - 2], [X1 - 10, yb - 8], [t3.x + 1, t3.y + 1])); }
      if (okL(t2.x - 6)) {
        clovers.push(t2);
        petioles.push(curve([vx, ny], [X1 - 9, yb - 1], [t2.x + 1, t2.y + 1]));
        if (okL(X1 - 22)) { petioles.push(curve([X1 - 21, yb - 6], [X1 - 21, yb - 10], [X1 - 21, yb - 14])); flowers.push([X1 - 21, yb - 15]); }
        if (okL(X1 - 26)) { petioles.push(curve([X1 - 13, yb - 2], [X1 - 19, yb], [X1 - 24, yb - 1])); sprouts.push({ id: "n3", x: X1 - 24, y: yb - 1 }); }
      }
      sprouts.push({ id: "n1", x: X1 - 8, y: yb - 1 }, { id: "n2", x: vx - 1, y: yb + 1 });
      perch2 = [X1 - 1, Y1 - 9];
      // 덩굴 잎 — 덤불 · 구석 풀숲과 겹치는 자리는 뺀다 · 덩굴 꽃은 구석과 덤불 사이
      const box = { x0: Math.min(...clovers.map((c) => c.x)) - 9, y0: t1.y - 9, x1: X1 + 4, y1: yb + 2 };
      keep = (sx, sy) => !hit(box, sx, sy, sx + 4, sy + 4) && !hit(root, sx, sy, sx + 4, sy + 4);
      flowers.push([X1 - 1, Math.round((ny + rootY) / 2)]);
      B = { clovers };
    } else {
      // ── 덤불 없음 — 오른쪽 덩굴은 풀숲에서 위 오른쪽 덩굴손까지 한 줄 · 덩굴 꽃은 시안 높이 ──
      rights = [wave(vx, rootY, vx, Y0 + 8, 1, 15)];
      keep = (sx, sy) => !hit(root, sx, sy, sx + 4, sy + 4);
      flowers.push([X1 - 1, Math.round((ch * 98) / 185)]);
    }
    stems.push(...rights, [rights[0][0], [vx, Y1 - 4], [X1 - 3, Y1 - 2], [X1 - 6, Y1 - 1], [X1 - 16, Y1 - 1]]);
  }
  // 덩굴 잎 — 줄기를 따라 13칸마다
  const along = (pts, every, skip, tag) => pts.forEach(([x, y], i) => {
    if (i < skip || i % every) return;
    if (keep(Math.round(x) - 2, Math.round(y) - 4)) sprouts.push({ id: tag + i, x, y });
  });
  if (rights.length > 1) { along(rights[0], 11, 6, "r"); along(rights[1], 14, 10, "u"); } else along(rights[0], 13, 14, "r");
  along(bottom, 13, 10, "b"); along(left, 13, 8, "l");
  return { cw, ch, o, X1, stems, petioles, shade: [...rights.map((p) => [p, 0]), [bottom, 1], [left, 2]], sprouts, flowers, grass, B, perch2, wind: [...sprouts, ...clovers] };
}

// 칸 그림 — tilt: 기운 잎 id 모음 · fly: 나비 { x, y, open, kind } | null. 시안 frame() 과 같은 차례(줄기 → 그늘 → 덩굴 잎 → 꽃 → 덤불 → 나비 → 밑동 풀)
function paint(L, tilt, fly) {
  const m = new Map();
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < L.cw && y < L.ch) m.set(kOf(x, y), c); };
  const spr = (rows, pal, x, y) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (pal[r[i]]) set(x + i, y + j, pal[r[i]]); });
  const stem = (pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      let [x0, y0] = pts[i].map(Math.round);
      const [x1, y1] = pts[i + 1].map(Math.round);
      const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      for (;;) { set(x0, y0, STEM); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 > -dy) { err -= dy; x0 += sx; } if (e2 < dx) { err += dx; y0 += sy; } }
    }
  };
  L.stems.forEach(stem);
  // 줄기 그늘 — 3칸마다 한 칸 안쪽(오른쪽 · 왼쪽 덩굴) · 아래(아래 덩굴)
  L.shade.forEach(([pts, k]) => pts.forEach(([x, y], i) => { if (i % 3 === 0) set(Math.round(x) + (k === 0 ? -1 : k === 2 ? 1 : 0), Math.round(y) + (k === 1 ? 1 : 0), STEM_D); }));
  // 풀잎 — 아래가 짙고 끝이 밝은 한 칸 굵기
  L.grass.forEach(([x, y, n]) => { for (let j = 0; j < n; j++) set(x, y - j, j === n - 1 ? LEAF_H : j ? LEAF : STEM_D); });
  L.sprouts.forEach((s) => spr(tilt.has(s.id) ? SMALL_T : SMALL, SMALL_PAL, Math.round(s.x) - 2, Math.round(s.y) - 4));
  const B = L.B;
  L.petioles.forEach(stem);
  L.flowers.forEach(([x, y]) => spr(FLOWER, FLOWER_PAL, x - 1, y - 1));
  if (B) {
    // 세잎(위 · 왼 · 오 — 기울면 위 잎이 한 칸 오른쪽) · 네잎(큰 잎 넷)
    B.clovers.forEach((c) => {
      const t = tilt.has(c.id) ? 1 : 0;
      if (c.q) {
        spr(HEARTS_L.up, LUCK_PAL, c.x - 3 + t, c.y - 8); spr(HEARTS_L.left, LUCK_PAL, c.x - 8, c.y - 3); spr(HEARTS_L.right, LUCK_PAL, c.x + 1, c.y - 3); spr(HEARTS_L.down, LUCK_PAL, c.x - 3, c.y + 1);
        set(c.x, c.y, LUCK_PAL.D);
      } else {
        spr(HEARTS.up, LEAF_PAL, c.x - 2 + t, c.y - 6); spr(HEARTS.left, LEAF_PAL, c.x - 6, c.y - 2); spr(HEARTS.right, LEAF_PAL, c.x + 1, c.y - 2);
        set(c.x, c.y, LEAF_PAL.D);
      }
    });
  }
  if (fly) spr(fly.open ? BFLY_O : BFLY_C, BFLY_PALS[fly.kind], fly.x - (fly.open ? 4 : 3), fly.y - 3);
  if (B && B.tufts) B.tufts.forEach(([x, y]) => { set(x, y, STEM); set(x, y - 1, LEAF_D); });
  return m;
}

// 장 f 의 바람 — 앞자락(x − 0.6y 가 이 값 ± 5 인 잎이 기운다)이 48장마다 왼쪽 아래 끝 → 오른쪽 위 끝을 지난다(시안 120 × 185 판: −130 → 150)
const frontAt = (L, f) => -0.6 * L.ch - 19 + ((f % WIND) / WIND) * (L.cw + 0.6 * L.ch + 49);
const tiltAt = (L, f) => new Set(L.wind.filter((e) => Math.abs(e.x - 0.6 * e.y - frontAt(L, f)) < 5).map((e) => e.id));
// 장 f 의 나비 — 덤불이 없으면 없음. 장면마다 48장: 날아듦(1/3) · 앉음(날개 천천히 · 1/3) · 날아감(1/3)
//   앞 장면 흰 나비: 오른쪽 위에서 팔랑팔랑 내려와 네잎에 앉았다가 다시 오른쪽 위로(시안 GIF)
//   뒤 장면 노랑나비: 왼쪽 아래 테 밖에서 들어와 아래 덩굴을 따라 낮게 출렁이며(스탯 글자 아래) 오른쪽 아래 구석 덩굴 꽃(perch2)에 앉았다가 오른쪽 위 테 밖으로 날아 나간다
function flyAt(L, f) {
  const q = L.B && L.B.clovers.find((c) => c.q);
  if (!q) return null;
  const X1 = L.X1, k = f % 48, t = k / 48, second = f >= 48 && L.perch2;
  let bx, by, open;
  if (!second) {
    const perch = [q.x, q.y - 12];
    if (t < 0.34) { const u = t / 0.34; bx = X1 - 4 - u * (X1 - 4 - perch[0]) + Math.sin(u * Math.PI * 3) * 4; by = 30 + u * (perch[1] - 30); open = k % 2 === 0; }
    else if (t < 0.66) { bx = perch[0]; by = perch[1]; open = Math.floor(k / 3) % 2 === 0; }
    else { const u = (t - 0.66) / 0.34; bx = perch[0] + u * (X1 + 10 - perch[0]) + Math.sin(u * Math.PI * 2) * 3; by = perch[1] - u * (perch[1] + 10); open = k % 2 === 0; }
    return { x: Math.round(bx), y: Math.round(by), open, kind: "w" };
  }
  const [px, py] = L.perch2, sy = L.ch - L.o - 5; // 아래 덩굴 바로 위(스탯 글자 아래) 높이로 들어온다
  if (t < 0.34) { const u = t / 0.34; bx = -6 + u * (px + 6); by = sy + u * u * (py - sy) + Math.sin(u * Math.PI * 5) * 2; open = k % 2 === 0; }
  else if (t < 0.66) { bx = px; by = py; open = Math.floor(k / 4) % 2 === 0; }
  else { const u = (t - 0.66) / 0.34; bx = px + u * 14 - Math.sin(u * Math.PI) * 4; by = py - u * 28; open = k % 2 === 0; }
  return { x: Math.round(bx), y: Math.round(by), open, kind: "y" };
}

// 카드 크기 · 자리 → 칸 판
//   칸: 사이트 3px(시안 그대로) · 봇 2.25 × S(2.2 → 5px — 봇 카드 글 · 막대가 테에서 72px 안쪽이라 줄기 · 잎(안쪽 끝 o + 6칸)이 그보다 바깥에 온다)
//   테 자리(o 칸): 사이트는 왼쪽 덩굴 잎 안쪽 끝이 글자 시작(ctx.lineX0 · goalLeft — SkinFrame 이 잰다)보다 1px 이상 바깥에 오게 3칸에서 줄인다(폰 레벨 카드 여백 26px → 2칸)
//   왼쪽 덩굴 끝: 사이트는 레벨 막대 위 12칸(시안과 같은 자리) · 막대를 모르면 시안 비율 높이
function boardOf(w, h, S, site, ctx) {
  const P = site ? 3 : Math.max(3, Math.round(2.25 * S));
  const cw = Math.floor(w / P), ch = Math.floor(h / P);
  const ox = Math.floor((w - cw * P) / 2), oy = Math.floor((h - ch * P) / 2);
  const tx = site ? [ctx.lineX0, ctx.goalLeft].find((v) => Number.isFinite(v)) : undefined;
  const o = Number.isFinite(tx) ? Math.max(1, Math.min(3, Math.floor((tx - 1 - ox) / P) - 6)) : 3;
  const barTop = site && Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const opt = { leftTop: barTop != null ? Math.floor((barTop - oy) / P) - 12 : o + Math.round((ch * 96) / 185) };
  const small = cw < 48 || ch < 64;
  // 덩굴에 붙은 덤불은 위 끝(yb − 37)이 위 오른쪽 덩굴손 아래에 다 들어갈 때만
  const fits = (yb) => yb - 37 >= o + 12;
  if (small) opt.bush = null;
  else if (site && barTop != null) {
    // 막대 바로 위 줄에서 위로 · 왼쪽 끝 잎은 가장 긴 등급 글자 끝(goalLeft + 180)보다 오른쪽
    const yb = Math.floor((barTop - oy) / P) - 1;
    if (fits(yb)) {
      const tierR = (Number.isFinite(ctx.goalLeft) ? ctx.goalLeft : Number.isFinite(tx) ? tx : ox + (o + 6) * P) + 180;
      Object.assign(opt, { bush: "vine", yb, leftMin: Math.ceil((tierR - ox) / P) });
    }
  } else if (!site) {
    // 📌 역할 지급 구석 덤불 — 위 왼쪽 세잎(c2)이 가운데 정렬 긴 역할 이름 끝(x 1056 · 아래 100px 위)에 닿아 뺀다
    if (botFloorOpen(ctx)) Object.assign(opt, { bush: "corner", dropTop: true });
    else if (botTopOpen(ctx)) {
      const yb = Math.floor((h - 110 - oy) / P) - 1; // 아래 막대 · Lv 줄(아래 56 ~ 100px) 위
      Object.assign(opt, fits(yb) ? { bush: "vine", yb } : { bush: null });
    } else opt.bush = null;
  }
  return { P, ox, oy, L: layout(cw, ch, o, opt) };
}

// 같은 색 가로 이웃 칸을 사각형 하나로 — 색마다 path 하나(ev_ghost 와 같은 꼴)
function svgOf(m, P, ox, oy) {
  const byC = new Map();
  for (const [key, c] of m) { const [x, y] = key.split(",").map(Number); if (!byC.has(c)) byC.set(c, new Map()); const rows = byC.get(c); if (!rows.has(y)) rows.set(y, []); rows.get(y).push(x); }
  let s = "";
  for (const [c, rows] of byC) {
    let d = "";
    for (const [y, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length; ) { let j = i; while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++; d += `M${ox + xs[i] * P} ${oy + y * P}h${(j - i + 1) * P}v${P}h${-(j - i + 1) * P}z`; i = j + 1; }
    }
    s += `<path d="${d}" fill="${c}"/>`;
  }
  return `<g shape-rendering="crispEdges">${s}</g>`;
}

const NONE = new Set();
const fx = (v) => +v.toFixed(4);
const ranges = (list) => { const out = []; for (const f of list) { const r = out[out.length - 1]; if (r && r[0] + r[1] === f) r[1]++; else out.push([f, 1]); } return out; };
const hashOf = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// 📌 검증용 — 장 f 의 칸 지도 전부(바람 · 나비 포함, 봇은 늘 첫 장 · 나비 없음). 키 "x,y" → 색
export function cloverCells(w, h, S = 1, site = true, ctx = {}, f = 0) {
  const { L } = boardOf(w, h, S, site, ctx);
  return site ? paint(L, tiltAt(L, f), flyAt(L, f)) : paint(L, NONE, null);
}

// deco(w, h, S, site, ctx) → { defs, under, over } — 다른 cardSkins 와 같은 꼴
//   사이트 움직임: 정지 칸(바람 없음 · 나비 없음)에서 잎마다 바뀌는 칸(mask)을 빼고, 잎(겹치면 한 묶음)마다 상태(정지 · 기움) <g> 를 그 상태의 장 동안만 보인다.
//   나비는 종류(흰 · 노랑)마다 날개 두 장을 장마다 자리로 옮긴다(transform) · 그 장면 동안만 보인다. 칸을 통째로 넘긴다(steps(1)) — 움직임 줄이기면 끄고(잎 정지 · 나비 없음) = 봇 그림과 같은 모습
//   키프레임 이름: 잎 상태는 장 묶음 그대로(ecl-k<첫 장>-<장 수>… — 같은 이름은 같은 내용), 나비 길은 카드 크기마다 달라 내용 해시(ecl-m<해시>) — 한 화면에 카드가 여럿이어도 안 섞인다
export function deco(w, h, S = 1, site = true, ctx = {}) {
  const { P, ox, oy, L } = boardOf(w, h, S, site, ctx);
  const still = paint(L, NONE, null);
  if (!site) return { defs: "", under: "", over: svgOf(still, P, ox, oy) };

  // 바람 — 잎마다 바뀌는 칸 → 겹치는 잎은 한 묶음
  const tilts = Array.from({ length: N }, (_, f) => tiltAt(L, f));
  const ever = [...new Set(tilts.flatMap((t) => [...t]))];
  const D = new Map(ever.map((id) => {
    const m = paint(L, new Set([id]), null), out = new Set();
    for (const k of new Set([...still.keys(), ...m.keys()])) if (still.get(k) !== m.get(k)) out.add(k);
    return [id, out];
  }));
  const groups = [];
  for (const id of ever) {
    const hit = groups.filter((g) => [...D.get(id)].some((k) => g.mask.has(k)));
    const g = { ids: [id, ...hit.flatMap((x) => x.ids)], mask: new Set([...D.get(id), ...hit.flatMap((x) => [...x.mask])]) };
    hit.forEach((x) => groups.splice(groups.indexOf(x), 1));
    groups.push(g);
  }
  const masked = new Set(groups.flatMap((g) => [...g.mask]));
  const base = new Map([...still].filter(([k]) => !masked.has(k)));

  const css = new Map();
  const cls = (on) => {
    const name = "ecl-k" + on.map(([a, l]) => `${a}-${l}`).join("_");
    if (!css.has(name)) {
      let s = "", prev = null;
      for (let f = 0; f < N; f++) { const v = on.some(([a, l]) => f >= a && f < a + l) ? 1 : 0; if (v !== prev) { s += `${fx((f * 100) / N)}%{opacity:${v}}`; prev = v; } }
      css.set(name, `.${name}{animation-name:${name}}@keyframes ${name}{${s}100%{opacity:${prev}}}`);
    }
    return "ecl-a " + name;
  };
  let over = svgOf(base, P, ox, oy);
  for (const g of groups) {
    const byState = new Map();
    tilts.forEach((t, f) => { const s = g.ids.filter((id) => t.has(id)).sort().join("+"); if (!byState.has(s)) byState.set(s, []); byState.get(s).push(f); });
    // 정지 상태가 먼저(기본으로 보이는 것) · 나머지는 opacity 0 으로 숨겨 두고 그 장에만
    [...byState].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[1][0] - b[1][0])).forEach(([s, frames], i) => {
      const m = s ? paint(L, new Set(s.split("+")), null) : still;
      const cells = new Map([...g.mask].filter((k) => m.has(k)).map((k) => [k, m.get(k)]));
      over += `<g class="${cls(ranges(frames))}"${i ? ' opacity="0"' : ""}>${cells.size ? svgOf(cells, P, ox, oy) : ""}</g>`;
    });
  }
  // 나비 — 종류마다 날개 두 장(나비 자리 기준 칸)을 그 장면의 장마다 옮긴다. 기본은 숨김(움직임이 돌 때만 · 그 장면 동안만 보인다)
  let flyCss = "";
  const path = Array.from({ length: N }, (_, f) => flyAt(L, f));
  for (const kind of Object.keys(BFLY_PALS)) {
    const on = path.map((p, f) => (p && p.kind === kind ? f : -1)).filter((f) => f >= 0);
    if (!on.length) continue;
    const pal = BFLY_PALS[kind];
    const sprite = (rows, dx) => { const m = new Map(); rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) m.set(kOf(i - dx, j - 3), pal[ch]); })); return svgOf(m, P, 0, 0); };
    const openOn = ranges(on.filter((f) => path[f].open)), shutOn = ranges(on.filter((f) => !path[f].open));
    let moves = "", last = "";
    on.forEach((f) => { const p = path[f], t = `translate(${ox + p.x * P}px,${oy + p.y * P}px)`; if (t !== last) { moves += `${fx((f * 100) / N)}%{transform:${t}}`; last = t; } });
    const mv = "ecl-m" + hashOf(kind + moves);
    over += `<g class="ecl-a ecl-fo" opacity="0"><g class="ecl-a ${mv}">` +
      (openOn.length ? `<g class="${cls(openOn)}" opacity="0">${sprite(BFLY_O, 4)}</g>` : "") +
      (shutOn.length ? `<g class="${cls(shutOn)}" opacity="0">${sprite(BFLY_C, 3)}</g>` : "") + "</g></g>";
    flyCss += `.${mv}{animation-name:${mv}}@keyframes ${mv}{${moves}100%{transform:${last}}}`;
  }
  if (flyCss) flyCss = `.ecl-fo{animation-name:eclOn}@keyframes eclOn{0%,100%{opacity:1}}` + flyCss;
  const defs = `<style>.ecl-a{animation-duration:${fx((N * STEP_MS) / 1000)}s;animation-iteration-count:infinite;animation-timing-function:steps(1)}${[...css.values()].join("")}${flyCss}` +
    `@media (prefers-reduced-motion:reduce){.ecl-a{animation:none}}</style>`;
  return { defs, under: "", over };
}
