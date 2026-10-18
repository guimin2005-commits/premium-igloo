// 📌 할로윈 시즌 카드 스킨 「호박 밭」(hw_pumpkin) — 2026-10-09 시안, 운영자 "카드 테두리는 진짜 다 예쁜데" → 10/10 5종 모두 합격. 사이트 · 봇 같은 그림 함수.
//   그림 원본: .claude/mockups/src/halloween/halloween.js (사이트 자리는 360 폭 카드 기준 → 오른쪽에 붙은 별은 카드 폭을 따라간다)
//   얇은 보라 도트 테(위 · 왼쪽 밝게 / 아래 · 오른쪽 짙게) + 테에 붙은 작은 모서리 판(호박색 보석)
//   + 오른쪽 위 모서리에 걸친 도트 보름달 · 작은 박쥐 셋 · 별 몇 점
//   + 바닥 띠(스탯 아래 — 운영자가 정한 자리)에 호박 밭: 가운데 큰 잭오랜턴 + 작은 호박 여럿 + 땅에 붙은 짧은 잎
//     (레벨 막대가 있는 사이트 카드 — 레벨 페이지 · 상점 미리보기 — 는 바닥 띠를 비우고 막대 오른쪽 끝 위 한 무리로: 잎 · 호박 · 잭오랜턴 · 작은 호박)
//   그림마다 제 색의 가장 짙은 단계로 끊김 없는 외곽선, 빛은 왼쪽 위(3~4단 음영). 무섭지 않게 웃는 얼굴.
//   사이트(site)는 잭오랜턴 눈 · 입 불빛이 깜빡이고 박쥐가 날갯짓한다(움직임 줄이기 설정이면 멈춤).
//   등급 색과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸만.
import { floorLimit, sinkBy, behind, botCornerOk } from "./hwFloor.js";

// floor: 사이트 카드 바닥 띠 그림 높이(px — 카드 아래 끝에서 가장 높은 그림 위 끝까지). 레벨 페이지 카드가 아래에 floorRoom 만큼 더 비워 주면 시안 그대로 선다(hwFloor.js)
export const meta = { key: "hw_pumpkin", label: "호박 밭", grid: "dot", tint: "#b48cff", gridOp: 0.07, floor: 46 };

export const C = {
  // 호박 — 외곽 · 그늘 · 바탕 · 빛 · 반짝
  k: "#4a1c08", s: "#b4460f", m: "#e66e17", l: "#ff9838", h: "#ffc76c",
  // 잭오랜턴 불빛 — 바깥 · 안쪽(깜빡이는 칸)
  y: "#ffc93c", Y: "#fff2a6",
  // 덩굴 초록 — 외곽 · 그늘 · 바탕 · 빛
  q: "#1c3510", v: "#3a7022", V: "#5fa034", w: "#95d257",
  // 달 노랑 — 외곽 · 그늘 · 바탕 · 빛 · 반짝
  a: "#80591a", b: "#d8a630", c: "#f2cf52", e: "#ffe78a", f: "#fff8d2",
  // 박쥐 짙은 보라검정 — 외곽 · 몸 · 날개 · 날개 끝 빛 · 눈
  n: "#12081a", p: "#3f2457", P: "#5a3680", r: "#8a63b8", E: "#ffe78a",
  // 밤 보라 테 — 외곽 · 그늘 · 바탕 · 빛
  z: "#1d0e27", u: "#5c3394", U: "#7d4fc0", i: "#a87de2",
  // 유령 흰색(작은 별)
  g: "#f4f0ff",
};

const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;

// ── 그림판 — 칸 지도(문자열 줄) → 칸 모음. outlineOf(ch) 가 주는 색으로 4이웃 외곽선을 두른다(호박 외곽이 줄기 외곽보다 앞선다) ──
const PRI = { k: 3, a: 3, n: 3, z: 3, q: 2 };
function sprite(rows, outlineOf) {
  const m = new Map();
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") m.set(`${x},${y}`, ch); }));
  if (outlineOf) {
    const add = new Map();
    for (const [key, ch] of m) {
      const [x, y] = key.split(",").map(Number);
      const o = outlineOf(ch);
      if (!o) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const kk = `${x + dx},${y + dy}`;
        if (m.has(kk)) continue;
        const prev = add.get(kk);
        if (!prev || (PRI[o] || 0) > (PRI[prev] || 0)) add.set(kk, o);
      }
    }
    for (const [kk, o] of add) m.set(kk, o);
  }
  // 왼쪽 위를 (0, 0) 으로 옮긴다(외곽선 때문에 -1 칸이 생긴다)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of m.keys()) { const [x, y] = key.split(",").map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cells = [];
  for (const [key, ch] of m) { const [x, y] = key.split(",").map(Number); cells.push([x - x0, y - y0, ch]); }
  return { cells, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// 칸 모음판 — 같은 칸은 나중 것이 덮는다. 그릴 때는 색마다 가로로 이어진 칸을 한 네모로 합친다
class Layer {
  constructor(P) { this.P = P; this.m = new Map(); }
  // (x, y) = 그림 왼쪽 위 px. 칸 크기 P
  stamp(sp, x, y, pick, swap) {
    for (const [cx, cy, ch] of sp.cells) {
      if (pick && !pick(ch)) continue;
      this.m.set(`${Math.round(x + cx * this.P)},${Math.round(y + cy * this.P)}`, swap ? swap(ch) : ch);
    }
  }
  svg(cls = "", attr = "") {
    const P = this.P;
    const rows = {};
    for (const [key, ch] of this.m) { const [x, y] = key.split(",").map(Number); ((rows[ch] ||= {})[y] ||= []).push(x); }
    let body = "";
    for (const [ch, byY] of Object.entries(rows)) {
      let d = "";
      for (const [y, xs] of Object.entries(byY)) {
        xs.sort((a, b) => a - b);
        let s = xs[0], e = xs[0];
        for (let i = 1; i <= xs.length; i++) {
          if (i < xs.length && xs[i] === e + P) { e = xs[i]; continue; }
          d += R(s, Number(y), e - s + P, P);
          if (i < xs.length) s = e = xs[i];
        }
      }
      body += `<path d="${d}" fill="${C[ch]}"/>`;
    }
    return body ? `<g${cls ? ` class="${cls}"` : ""}${attr}>${body}</g>` : "";
  }
}

const isGreen = (ch) => "qvVw".includes(ch);
const pumpkinOutline = (ch) => (isGreen(ch) ? "q" : "k");

// ── 잭오랜턴 17 × 12(+ 줄기 · 잎 3줄) — 세 쪽(왼 · 가운데 · 오른)으로 나뉜 몸, 쪽 사이 골은 위 · 아래만. 삼각 눈 · 이 두 개 웃는 입 ──
//   y 불빛 바깥 · Y 불빛 안쪽(사이트에서 깜빡) · 줄기 위 끝은 오른쪽으로 살짝 굽는다 · 왼쪽에 잎 하나
const JACK = [
  ".........Vv......",
  ".....wV.Vv.......",
  "....wVVvVv.......",
  "...lshhllmmmsm...",
  ".llhshllllmmsmms.",
  "lhllslllmmmmsmsss",
  "llllmymmmmmymssss",
  "lllmyYymmmyYyssss",
  "llmmmmmmmmmmmssss",
  "lmmymmmmmmmmmysss",
  "mmmyYYmYYYmYYysss",
  "mmmmyYYYYYYYyssss",
  "mmmmmmyyyyymsssss",
  ".smmsmmmmmmsssss.",
  "...sssssssssss...",
];
// 중간 호박 11 × 8 · 작은 호박 9 × 6 — 골 두 줄, 짧은 줄기
const MID = [
  "......Vv...",
  ".....Vv....",
  "..lshllsm..",
  ".lhshllsms.",
  "lllslllsmms",
  "llmslmmsmss",
  "mmmsmmmssss",
  "mmmsmmmssss",
  ".smsmmssss.",
  "..sssssss..",
];
const SMALL = [
  "....V....",
  "....Vv...",
  "..shlls..",
  ".lshllsm.",
  "lhsllmsms",
  "lmsmmmsss",
  ".msmmsss.",
  "..sssss..",
];
// 땅에 붙은 짧은 잎(누운 잎) — 두 갈래 · 한 갈래
const LEAF_W = [".wV.wV.", "wVVvVVv"];
const LEAF_S = [".wV", "wVv"];

// ── 박쥐 13 × 5~6 — 두 장면(날개 위 V · 날개 아래 Λ, 날개를 내리면 몸이 한 칸 뜬다). 동그란 머리 · 두 귀 · 노란 눈 · 날개 아래 홈 ──
const BAT_A = ["r...........r", "Pr..p...p..rP", "PPr.ppppp.rPP", "PPPrpEpEprPPP", ".PP.PpppP.PP."];
const BAT_B = ["....p...p....", "....ppppp....", "..rrpEpEprr..", ".rPPPpppPPPr.", "rPPP.....PPPr", "PP.........PP"];

// ── 보름달 13 × 13 — 칸 원, 왼쪽 위 빛 4단 + 분화구 몇 개(한 단 짙게) ──
function moonRows() {
  const N = 13, c = 6, r2 = 6.5 * 6.5;
  const crater = new Set(["4,4", "5,4", "4,5", "8,3", "9,7", "8,8", "9,8", "4,9", "5,9", "10,5"]);
  const down = { f: "e", e: "c", c: "b", b: "b" };
  const rows = [];
  for (let y = 0; y < N; y++) {
    let row = "";
    for (let x = 0; x < N; x++) {
      if ((x - c) ** 2 + (y - c) ** 2 > r2) { row += "."; continue; }
      const t = ((x - c) * 0.72 + (y - c) * 0.7) / 6.5; // 음수 = 왼쪽 위(빛)
      let ch = t < -0.42 ? "f" : t < 0.12 ? "e" : t < 0.55 ? "c" : "b";
      if (crater.has(`${x},${y}`)) ch = down[ch];
      row += ch;
    }
    rows.push(row);
  }
  return rows;
}

// 모서리 판 6 × 6(+ 외곽) — 위 · 왼쪽 밝은 보라 / 아래 · 오른쪽 짙은 보라, 가운데 호박색 팔각 보석(왼쪽 위 반짝)
const PLATE = ["iiiiiU", "iihlUu", "ihlmsu", "ilmssu", "iUmsuu", "Uuuuuu"];
// 별 — 네 갈래(3 × 3) · 점
const STAR = [".e.", "efe", ".e."];
const DOT = ["g"];

export function deco(w, h, S, site, ctx = {}) {
  const P = site ? 2 : Math.round(2 * S); // 테 · 달 · 박쥐 · 별 칸(사이트 2px · 봇 4px)
  // 호박 밭 칸 — 봇 카드는 레벨 막대 아래가 좁아 한 단 작게(3px)
  const Q = site ? 2 : Math.max(2, Math.round(1.4 * S));
  const o = 12;
  const snap = (v, q = P) => Math.round(v / q) * q;

  // ── 테 — 네 겹(바깥 외곽 · 보라 두 줄 · 안쪽 외곽). 보라 두 줄은 막대 하나처럼 위 · 왼쪽 반이 밝고 아래 · 오른쪽 반이 짙다 ──
  const ring = (k) => {
    const x0 = o + k * P, y0 = o + k * P, x1 = w - o - k * P, y1 = h - o - k * P;
    return { top: R(x0, y0, x1 - x0, P), bottom: R(x0, y1 - P, x1 - x0, P), left: R(x0, y0 + P, P, y1 - y0 - 2 * P), right: R(x1 - P, y0 + P, P, y1 - y0 - 2 * P), x0, y0, x1, y1 };
  };
  const r0 = ring(0), r1 = ring(1), r2 = ring(2), r3 = ring(3);
  const frame =
    `<path d="${r0.top + r0.bottom + r0.left + r0.right + r3.top + r3.bottom + r3.left + r3.right}" fill="${C.z}"/>` +
    `<path d="${r1.top + r1.left}" fill="${C.i}"/><path d="${r1.bottom + r1.right}" fill="${C.u}"/>` +
    `<path d="${r2.top + r2.bottom + r2.left + r2.right}" fill="${C.U}"/>`;
  // 모서리 판 — 보라 두 줄이 만나는 모서리 2 × 2 칸에 판 가운데를 맞춘다(오른쪽 위는 달이 대신)
  //   📌 봇 /출석체크 · /퀘스트 카드는 맨 윗줄 오른쪽 칩 · 글에 달 · 박쥐가 닿아 빼고 그 자리에도 판(hwFloor.js botCornerOk)
  const moonOn = site || botCornerOk(ctx);
  const plates = new Layer(P);
  const plate = sprite(PLATE, () => "z");
  const corners = [[r1.x0, r1.y0], [r1.x0, r2.y1 - P], [r2.x1 - P, r2.y1 - P], ...(moonOn ? [] : [[r2.x1 - P, r1.y0]])];
  for (const [cx, cy] of corners) plates.stamp(plate, cx - 3 * P, cy - 3 * P);

  // ── 보름달 — 오른쪽 위 모서리에 걸친다(사이트는 이름 줄 위 · 봇은 LEVEL 글자 위) ──
  const sky = new Layer(P);
  const moon = sprite(moonRows(), () => "a");
  const mx = snap(w - o - moon.w * P), my = o;
  if (moonOn) sky.stamp(moon, mx, my);

  // 📌 2026-10-11 방법 1(시안) — 레벨 막대가 있는 사이트 카드(ctx.barY)는 잭오랜턴을 막대 오른쪽 끝 위에 앉힌다(검은 고양이와 같은 자리).
  //    카드 맨 아래가 스탯 두 줄이라 바닥 가운데에 두면 열 구분선 · '누적 음성 시간' 값에 겹쳤다. 막대 위 오른쪽(등급 줄 오른쪽)은 비어 있다
  //    → 같은 날 운영자 "레벨 바로 올린 건 좋아 근데 뭐 다 올리던지 애매하게 해두냐" — 바닥 띠(작은 호박 · 잎 줄)도 통째로 막대 위 한 무리로(아래 호박 밭)
  const jack = sprite(JACK, pumpkinOutline);
  const jw = jack.w * Q, jh = jack.h * Q;
  const barTop = site && Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const onBar = barTop != null && barTop - jh > o + 20;

  // ── 별 — 위 빈 띠 · 오른쪽 가장자리 · 등급 줄 오른쪽 하늘에 몇 점(왼쪽 가장자리는 글자 앞 점처럼 보여 비운다) ──
  //    막대 위에 잭오랜턴이 앉으면 그 옆 오른쪽 가장자리 점(막대 높이 — 폰은 'XP' 글자 끝에 붙었다)은 뺀다
  const stars = site
    ? [[STAR, 166, 26], [STAR, w - 26, 138], ...(onBar ? [] : [[DOT, w - 22, 318]]), [STAR, w - 114, 184], [DOT, w - 56, 222], [STAR, w - 60, 462]]
    : [[DOT, 470, 28], [STAR, 560, 36], [DOT, 700, 30], [STAR, 760, 52], [DOT, 850, 30], [STAR, w - 50, 300], [DOT, w - 44, 460]];
  for (const [rows, x, y] of stars) sky.stamp(sprite(rows), snap(x), snap(y));

  // ── 박쥐 셋 — 하나는 달 왼쪽 아래 가장자리에 걸치고, 둘은 이름 줄 위 빈 띠에 ──
  const batA = sprite(BAT_A, () => "n");
  const batB = sprite(BAT_B, () => "n");
  //   📌 폰 레벨 페이지 카드(안쪽 여백 20px — 사진 · 이름이 작고 위로 붙는다)는 셋째 박쥐가 이름 윗줄에 걸려 둘만
  const tight = site && Number.isFinite(ctx?.lineX0) && ctx.lineX0 < 24;
  const bats = site
    ? [[mx - 9 * P, 28], [mx - 36 * P, 22], [mx - 61 * P, 30]].slice(0, tight ? 2 : 3)
    : [[mx - 9 * P, my + 8 * P], [mx - 28 * P, 32], [mx - 49 * P, 58]];
  const batA_L = [], batB_L = [];
  if (moonOn) bats.forEach(([x, y]) => {
    const a = new Layer(P), b = new Layer(P);
    a.stamp(batA, snap(x), snap(y));
    b.stamp(batB, snap(x), snap(y) - P); // 날개를 내린 장면은 한 칸 위에서(몸이 뜬다)
    batA_L.push(a); batB_L.push(b);
  });

  // ── 호박 밭 — 밑동을 바닥 테 바깥 줄에 맞춰 테 앞에 선다. 봇은 레벨 막대 아래가 좁아 칸을 한 단 작게 + 테 아래로 조금 내린다 ──
  const mid = sprite(MID, pumpkinOutline);
  const small = sprite(SMALL, pumpkinOutline);
  const leafW = sprite(LEAF_W, () => "q");
  const leafS = sprite(LEAF_S, () => "q");
  const ground = site ? h - o : snap(h - 6, Q);
  const patch = new Layer(Q);
  const face = new Layer(Q);
  // 📌 레벨 페이지 카드('1회 획득' 줄이 마지막) — 그 줄 숫자보다 위로 솟는 호박은 내린다(hwFloor.js).
  //    조금(카드 끝 여백 안)이면 테 앞에서 그만큼 낮게, 많으면 아래 테 뒤로 내려앉아 위만 빼꼼(테 안쪽 가장자리에서 자른다)
  //    방법 1(막대 위 무리) 카드는 바닥 띠를 비우므로 쓰지 않는다
  const limit = floorLimit(h, site, ctx);
  const sunk = new Layer(Q), sunkFace = new Layer(Q);
  const edge = h - o - 4 * P; // 테 안쪽 아래 가장자리
  const place = (sp, x, pick, swap, front = patch, back = sunk) => {
    const top = ground - sp.h * Q;
    const d = sinkBy(limit, top, Q);
    (d > o - 2 ? back : front).stamp(sp, x, top + d, pick, swap);
  };
  const put = (sp, cx) => { const x = snap(cx - (sp.w * Q) / 2, Q); place(sp, x); return x; };
  // [그림, 가로 자리(카드 폭 비율)] — 뒤 → 앞 순서(나중 것이 덮는다). 왼쪽 무리 · 가운데 무리 · 오른쪽 무리
  //    📌 방법 1(막대 위 무리) 카드는 바닥 띠를 비운다 — 아래 테 위에는 테 · 모서리 판만
  const items = onBar
    ? []
    : site
    ? [[leafS, 0.085], [mid, 0.12], [small, 0.178], [leafW, 0.235], [leafW, 0.385], [small, 0.41], [leafS, 0.648], [small, 0.59], [mid, 0.79], [small, 0.848], [leafW, 0.9]]
    : [[leafS, 0.045], [mid, 0.07], [small, 0.1], [leafW, 0.127], [small, 0.28], [leafS, 0.3], [leafW, 0.445], [small, 0.465], [leafS, 0.567], [small, 0.538], [leafS, 0.7], [small, 0.72], [leafS, 0.873], [mid, 0.9], [small, 0.93], [leafW, 0.957]];
  for (const [sp, f] of items) put(sp, w * f);
  const lit = (ch) => (ch === "Y" ? "y" : ch);
  if (onBar) {
    // 📌 방법 1 막대 위 무리 — 바닥 띠의 호박 밭을 막대 오른쪽 끝 위에 한 무리로 모은다(뒤 → 앞):
    //    잎 · 왼쪽 뒤 호박(잭오랜턴 뒤로 3칸) → 잭오랜턴 → 오른쪽 앞 작은 호박(잭오랜턴 오른쪽 아래 그늘만 4칸 가린다 — 얼굴 불빛 칸은 안 가린다)
    //    밑동은 모두 막대 위 끝에 닿는다(막대를 덮지 않는다) · 무리 오른쪽 끝은 테 안쪽 가장자리에서 8px 안쪽
    //    등급 줄(문장 · 이름 · 'N까지 N레벨')과 막대 사이는 24px — 그보다 키 큰 잭오랜턴(34px)만 등급 줄 높이에 닿아 등급 글자 오른쪽에 둔다.
    //    왼쪽 뒤 호박은 중간(24px)이 가장 긴 등급 글자('그랜드마스터까지 N레벨' = 글자 시작 + 176) 오른쪽에 다 들어갈 때만,
    //    그보다 좁은 카드(PC 303 · 폰 295px 아래)는 한 단 낮은 작은 호박(20px — 등급 글자 아래로 4px 띄운다)
    const gy = Math.floor(barTop / Q) * Q;
    const sx = snap(w - o - 4 * P - 8 - small.w * Q, Q);
    const jx = sx + 4 * Q - jw, jy = gy - jh;
    const tierR = (Number.isFinite(ctx.lineX0) ? ctx.lineX0 : 28) + 176; // 스탯을 접은 폰 화면은 글자 시작을 몰라 PC 여백(28)으로 넉넉히
    const back = jx + 3 * Q - mid.w * Q >= tierR ? mid : small;
    const bx = jx + 3 * Q - back.w * Q;
    patch.stamp(back, bx, gy - back.h * Q);
    patch.stamp(leafW, bx - 3 * Q, gy - leafW.h * Q); // 왼쪽 뒤 호박 밑동 앞에 누운 잎
    patch.stamp(jack, jx, jy, null, lit);
    face.stamp(jack, jx, jy, (ch) => ch === "Y");
    patch.stamp(small, sx, gy - small.h * Q);
  } else {
    // 잭오랜턴 — 바닥 가운데
    const jx = snap(w / 2 - (jack.w * Q) / 2, Q);
    place(jack, jx, null, lit);
    // 잭오랜턴 불빛 안쪽 칸(Y)은 따로 한 겹 — 사이트는 깜빡인다(꺼지면 바깥 불빛 색 y 만 남아 한 단 어두워진다)
    place(jack, jx, (ch) => ch === "Y", null, face, sunkFace);
  }

  const defs = site
    ? `<pattern id="hw_pumpkin-dt" width="24" height="24" patternUnits="userSpaceOnUse"><rect x="11" y="11" width="2" height="2" fill="#b48cff" fill-opacity="0.11"/></pattern>` +
      `<style>@keyframes hwpFlick{0%,31%,35%,62%,64%,100%{opacity:1}32%,34%,63%{opacity:0}}` +
      `@keyframes hwpBatA{0%,49.9%{opacity:1}50%,100%{opacity:0}}@keyframes hwpBatB{0%,49.9%{opacity:0}50%,100%{opacity:1}}` +
      `.hw_pumpkin-fl{animation:hwpFlick 3.4s steps(1) infinite}.hw_pumpkin-ba{animation:hwpBatA .46s infinite}.hw_pumpkin-bb{animation:hwpBatB .46s infinite}` +
      `@media (prefers-reduced-motion:reduce){.hw_pumpkin-fl,.hw_pumpkin-ba,.hw_pumpkin-bb{animation:none}}</style>`
    : "";
  // 박쥐 — 사이트는 두 장면을 번갈아(두 번째 장면은 처음엔 숨김 — 움직임이 꺼져 있거나 CSS 를 모르는 곳에서는 첫 장면만)
  const batSvg = batA_L.map((a, i) => {
    if (!site) return a.svg();
    const dl = ` style="animation-delay:-${(i * 0.17).toFixed(2)}s"`;
    return a.svg("hw_pumpkin-ba", dl) + batB_L[i].svg("hw_pumpkin-bb", `${dl} opacity="0"`);
  }).join("");
  const under = site && !ctx.onScene ? `<rect width="${w}" height="${h}" fill="url(#hw_pumpkin-dt)"/>` : "";
  const sunkG = behind(meta.key, w, h, edge, sunk.svg() + sunkFace.svg(site ? "hw_pumpkin-fl" : ""));
  const over =
    `<g shape-rendering="crispEdges">${frame}${plates.svg()}${sky.svg()}${batSvg}${sunkG.svg}${patch.svg()}${face.svg(site ? "hw_pumpkin-fl" : "")}</g>`;
  return { defs: defs + sunkG.defs, under, over };
}
