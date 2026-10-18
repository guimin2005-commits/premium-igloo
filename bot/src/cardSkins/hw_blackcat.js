// 📌 할로윈 시즌 카드 스킨 「검은 고양이」(hw_blackcat) — 사이트 · 봇 같은 그림 함수.
//   2026-10-11 다시 그림(운영자 "검은 고양이 디자인 다시 해봐 · 고양이는 무조건 귀엽게" → "오 개귀엽다" · "약간 사선 정면의 느낌으로" → "ㄱㄱ").
//   꼬리가 오른쪽 테가 되는 안은 반려("카드 테두리 꼬리 왜저래") — 테는 할로윈 세트와 같은 얇은 도트 테로 둔다.
//   얇은 남보라 도트 테(위 · 왼쪽 밝게 / 아래 · 오른쪽 짙게) + 테를 따라 찍힌 작은 분홍 발자국 점선 + 네 모서리 발바닥 판
//   + 위 가운데 문장: 주황 나비 리본 + 금 방울(고양이 목줄 · 방울과 같은 주황 · 금)
//   + 레벨 막대 오른쪽 끝 위(주인공): 사선 정면으로 앉은 검은 고양이(몸은 카드 가운데 쪽, 얼굴은 거의 정면 — 동공 없는 금빛 눈 · 분홍 코 · 입 2칸 · 주황 목줄 + 금 방울)
//     + 앞에 분홍 털실 공. 사이트는 고양이가 가끔 두 번 깜빡이고(‿) 꼬리 끝을 살랑인다(A → B → C → B, 움직임 줄이기 설정이면 멈춤 — 꼬리 A · 뜬 눈)
//   + 봇 카드: 레벨업 · /레벨은 막대 끝, 역할 지급은 오른쪽 아래 바닥에 같은 고양이(정지). 다른 봇 카드는 고양이 없음(빼꼼 머리는 반려)
//   봇 카드(site=false)는 카드 종류마다 글자 자리가 달라 테 · 문장 · 발자국 · 바닥 소품(호박 · 생선 · 털실) + 빈자리가 있는 카드만 고양이.
//   그림 원본: 세션 407f55a0 scratchpad/cat/final34.json(사선 정면) · final-cat.json(빼꼼 머리)
//   등급 색과 헷갈리지 않게 카드를 칠하거나 번지게 하지 않는다 — 도트 칸만.

// floor: 사이트 카드 바닥 띠 그림 높이 — 바닥 그림이 없어(고양이 · 털실은 레벨 막대 위) 0
export const meta = { key: "hw_blackcat", label: "검은 고양이", grid: "dot", tint: "#8f88c8", gridOp: 0.07, floor: 0 };

export const C = {
  // 고양이 — 남보라 털 · 금빛 눈 · 분홍 · 주황 목줄 · 금 방울(그림 지도 글자 앞에 _)
  _o: "#100d1c", _d: "#191629", _b: "#221f36", _m: "#34304f", _l: "#5a5488", _k: "#f59ab8", _K: "#d9688f", _Y: "#ffe066", _y: "#f7b733", _e: "#9c5a12", _w: "#ffffff", _R: "#ff7a3d", _r: "#c94a1d", _G: "#ffd447", _g: "#d18f1a", _P: "#460f34", _U: "#ffd8d0", _p: "#ff92ad", _q: "#ff7aa0", _s: "#ea508f", _t: "#b8336f",
  // 발바닥 판 외곽 · 생선 눈
  o: "#140822", W: "#ffffff",
  // 분홍(발바닥 판 · 발자국 · 털실) — 바탕 · 결 · 짙은 · 빛
  k: "#ff92ad", c: "#ff7aa0", K: "#ea508f", H: "#ffd8d0",
  // 리본 주황 — 외곽 · 그늘 · 바탕 · 빛
  O: "#4a1428", q: "#b33a1c", Q: "#f2731f", h: "#ffae3c",
  // 금 방울 — 외곽 · 그늘 · 바탕 · 빛 · 반짝
  G: "#4c1f1c", g: "#c0651a", j: "#fbbd2a", J: "#ffdd45", z: "#fff7b0",
  // 털실 분홍 외곽
  P: "#460f34",
  // 생선 은빛 — 외곽 · 그늘 · 바탕 · 밝음 · 빛
  X: "#1c1a31", f: "#464a6e", F: "#7e88a8", t: "#bec7d9", T: "#eef2f6",
  // 호박 — 외곽 · 그늘 · 바탕 · 빛 · 반짝 / 꼭지 초록 — 외곽 · 그늘 · 바탕
  A: "#4a1c08", s: "#b4460f", M: "#e66e17", L: "#ff9838", n: "#ffc76c", x: "#1c3510", v: "#3a7022", V: "#5fa034",
  // 테 남보라(고양이 털과 한 벌) — 외곽 · 그늘 · 바탕 · 빛
  Z: "#100d1c", D: "#1c1930", U: "#34304f", i: "#6a64a0",
};

const R = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const key = (x, y) => `${x},${y}`;
const xy = (k) => k.split(",").map(Number);

// ── 그림판 ──
function grid(rows) {
  const m = new Map();
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") m.set(key(x, y), ch); }));
  return m;
}
// 부품 — 글자마다 그 색. outline 글자로 4이웃 외곽선(끊김 없이)
function part(src, outline = "o") {
  const m = Array.isArray(src) ? grid(src) : src;
  const out = new Map(m);
  if (outline) for (const k of m.keys()) {
    const [x, y] = xy(k);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k2 = key(x + dx, y + dy);
      if (!m.has(k2) && !out.has(k2)) out.set(k2, outline);
    }
  }
  return out;
}
// 겹치기 — [부품, dx, dy] 차례로(나중 것이 위)
function compose(list) {
  const m = new Map();
  for (const [p, dx, dy] of list) for (const [k, ch] of p) { const [x, y] = xy(k); m.set(key(x + dx, y + dy), ch); }
  return m;
}
function bounds(...maps) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of maps) for (const k of m.keys()) { const [x, y] = xy(k); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
// 칸 모음판 — 같은 칸은 나중 것이 덮는다. 그릴 때는 색마다 가로로 이어진 칸을 한 네모로 합친다
class Layer {
  constructor(P) { this.P = P; this.m = new Map(); }
  // (x, y) = 그림 칸 (0, 0) 의 px 자리. keep(px, py) 가 거짓이면 그 칸은 버린다
  stamp(map, x, y, keep) {
    for (const [k, ch] of map) {
      const [cx, cy] = xy(k);
      const px = Math.round(x + cx * this.P), py = Math.round(y + cy * this.P);
      if (keep && !keep(px, py)) continue;
      this.m.set(key(px, py), ch);
    }
  }
  svg(cls = "", attr = "") {
    const P = this.P;
    const rows = {};
    for (const [k, ch] of this.m) { const [x, y] = xy(k); ((rows[ch] ||= {})[y] ||= []).push(x); }
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


// ── 고양이 ── 사선 정면 앉은 고양이(41 × 34 칸). BIG = 꼬리 A, BIG_B · BIG_C = 꼬리 끝 살랑(꼬리 칸만 다름), BIG_SHUT = 감은 눈
const BIG = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbYYbbbbbbbbbYYYbbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbddo............",
  "...olbyyyybbbbbbbyyyyybbbbdo.............",
  "...olbyywybbkkbbbyyywybbbddo.............",
  "....ombeebbmbbmbbbeeebbbddo.......oo.....",
  ".....ombbbbbbbbbbbbbbbbddo.......oldo....",
  "......omddbbbbbbbbbbbbddo........olbdo...",
  ".......ooRRRRRRRRRRRRRRooo.......olbdo...",
  "........orrrrrrrrrrrrrrrrro.......olbdo..",
  "........olbbbGGbbbbbbbbbbbbo......olbdo..",
  "........olbbGwGgbbbbbbbbddddoo.....olbdo.",
  ".........ombbggbbbbdbbddlllbbbo....olbdo.",
  "..........ombbbbbbmbodllbbbbbbbo...olbdo.",
  "...........ombdblmmbolbbbbbbbbbbo.olbdo..",
  "...........ombdolmmbolbbbbbbbbbdo.olbdo..",
  "...........ombdommmbombbbbbbbbbdoolbbdo..",
  "...........ombdommmbombbbbbbbbbbolbbbdo..",
  "..........olmmolmmmbobbbbbbbbbbobbbbdo...",
  "..........omdmommmmbobbbbbbbbbobbbddo....",
  "...........oooomdmdbodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
const BIG_B = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbYYbbbbbbbbbYYYbbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbddo............",
  "...olbyyyybbbbbbbyyyyybbbbdo.............",
  "...olbyywybbkkbbbyyywybbbddo.............",
  "....ombeebbmbbmbbbeeebbbddo..............",
  ".....ombbbbbbbbbbbbbbbbddo.........ooo...",
  "......omddbbbbbbbbbbbbddo.........olldo..",
  ".......ooRRRRRRRRRRRRRRooo........olbdo..",
  "........orrrrrrrrrrrrrrrrro........olbdo.",
  "........olbbbGGbbbbbbbbbbbbo.......olbdo.",
  "........olbbGwGgbbbbbbbbddddoo.....olbdo.",
  ".........ombbggbbbbdbbddlllbbbo....olbdo.",
  "..........ombbbbbbmbodllbbbbbbbo...olbdo.",
  "...........ombdblmmbolbbbbbbbbbbo..olbdo.",
  "...........ombdolmmbolbbbbbbbbbdo.olbbdo.",
  "...........ombdommmbombbbbbbbbbdoolbbdo..",
  "...........ombdommmbombbbbbbbbbbolbbbdo..",
  "..........olmmolmmmbobbbbbbbbbbobbbbdo...",
  "..........omdmommmmbobbbbbbbbbobbbddo....",
  "...........oooomdmdbodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
const BIG_C = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbYYbbbbbbbbbYYYbbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbddo............",
  "...olbyyyybbbbbbbyyyyybbbbdo.............",
  "...olbyywybbkkbbbyyywybbbddo.............",
  "....ombeebbmbbmbbbeeebbbddo..............",
  ".....ombbbbbbbbbbbbbbbbddo......ooo......",
  "......omddbbbbbbbbbbbbddo......olldo.....",
  ".......ooRRRRRRRRRRRRRRooo.....oldbdo....",
  "........orrrrrrrrrrrrrrrrro.....oolbdo...",
  "........olbbbGGbbbbbbbbbbbbo.....olbbdo..",
  "........olbbGwGgbbbbbbbbddddoo....olbdo..",
  ".........ombbggbbbbdbbddlllbbbo...olbdo..",
  "..........ombbbbbbmbodllbbbbbbbo..olbdo..",
  "...........ombdblmmbolbbbbbbbbbbo.olbdo..",
  "...........ombdolmmbolbbbbbbbbbdo.olbdo..",
  "...........ombdommmbombbbbbbbbbdoolbbdo..",
  "...........ombdommmbombbbbbbbbbbolbbdo...",
  "..........olmmolmmmbobbbbbbbbbbobbbbdo...",
  "..........omdmommmmbobbbbbbbbbobbbddo....",
  "...........oooomdmdbodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
const BIG_SHUT = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbbbbbbbbbbbbbbbbbbbbbdo............",
  "...olbbbbbbbbbbbbbbbbbbbbbbdo............",
  "...olbbbbbbbbbbbbbbbbbbbbbddo............",
  "...olbblbblbbbbbblbbblbbbbdo.............",
  "...olbbbllbbkkbbbblllbbbbddo.............",
  "....ombbbbbmbbmbbbbbbbbbddo.......oo.....",
  ".....ombbbbbbbbbbbbbbbbddo.......oldo....",
  "......omddbbbbbbbbbbbbddo........olbdo...",
  ".......ooRRRRRRRRRRRRRRooo.......olbdo...",
  "........orrrrrrrrrrrrrrrrro.......olbdo..",
  "........olbbbGGbbbbbbbbbbbbo......olbdo..",
  "........olbbGwGgbbbbbbbbddddoo.....olbdo.",
  ".........ombbggbbbbdbbddlllbbbo....olbdo.",
  "..........ombbbbbbmbodllbbbbbbbo...olbdo.",
  "...........ombdblmmbolbbbbbbbbbbo.olbdo..",
  "...........ombdolmmbolbbbbbbbbbdo.olbdo..",
  "...........ombdommmbombbbbbbbbbdoolbbdo..",
  "...........ombdommmbombbbbbbbbbbolbbbdo..",
  "..........olmmolmmmbobbbbbbbbbbobbbbdo...",
  "..........omdmommmmbobbbbbbbbbobbbddo....",
  "...........oooomdmdbodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
// 털실 놀이 — 앞발 든 자세(CAT_UP) · 앞발로 공을 친 자세(CAT_TAP) · 구르는 털실 공 네 장면(무늬가 돈다) · 땅에 풀린 실(고양이 칸 기준 [x, y, 글자])
const CAT_UP = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbYYbbbbbbbbbYYYbbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbddo............",
  "...olbyyyybbbbbbbyyyyybbbbdo.............",
  "...olbyywybbkkbbbyyywybbbddo.............",
  "....ombeebbmbbmbbbeeebbbddo.......oo.....",
  ".....ombbbbbbbbbbbbbbbbddo.......oldo....",
  "......omddbbbbbbbbbbbbddo........olbdo...",
  ".......ooRRRRRRRRRRRRRRooo.......olbdo...",
  "........orrrrrrrrrrrrrrrrro.......olbdo..",
  "........olbbbGGbbbbbbbbbbbbo......olbdo..",
  "........olbbGwGgbbbbbbbbddddoo.....olbdo.",
  ".........ombbggoobbdbbddlllbbbo....olbdo.",
  "..........ooooollobbodllbbbbbbbo...olbdo.",
  "..........olllmmmmodolbbbbbbbbbbo.olbdo..",
  ".........ollmmmmmbmoolbbbbbbbbbdo.olbdo..",
  ".........ommmmmbbbbbombbbbbbbbbdoolbbdo..",
  "..........omdmboobbbombbbbbbbbbbolbbbdo..",
  "..........oooooddobbobbbbbbbbbbobbbbdo...",
  "..........omdmodddooobbbbbbbbbobbbddo....",
  "...........oooodddddodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
const CAT_TAP = [
  "......o..............oo..................",
  ".....olo............ollo.................",
  ".....olmoo..oooooooolbdo.................",
  "....olbbmloollllllllbkddo................",
  "....olKkbbmlbbbbbbbbkkKddo...............",
  "....olKkkbbbbbbbbbbkkkKdbdo..............",
  "....olKkkbbbbbbbbbbbkkKbbdo..............",
  "....olKbbbbbbbbbbbbbbbKbbdo..............",
  "...olbbbbbbbbbbbbbbbbbbbbbbo.............",
  "...olbbbbbbbbbbbbbbbbbbbbbbbo............",
  "...olbbYYbbbbbbbbbYYYbbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbbdo............",
  "...olbYwwYbbbbbbbYwwYYbbbbddo............",
  "...olbyyyybbbbbbbyyyyybbbbdo.............",
  "...olbyywybbkkbbbyyywybbbddo.............",
  "....ombeebbmbbmbbbeeebbbddo.......oo.....",
  ".....ombbbbbbbbbbbbbbbbddo.......oldo....",
  "......omddbbbbbbbbbbbbddo........olbdo...",
  ".......ooRRRRRRRRRRRRRRooo.......olbdo...",
  "........orrrrrrrrrrrrrrrrro.......olbdo..",
  "........olbbbGGbbbbbbbbbbbbo......olbdo..",
  "........olbbGwGgbbbbbbbbddddoo.....olbdo.",
  ".........ombbggbbbbdbbddlllbbbo....olbdo.",
  "..........ombbbbobmbodllbbbbbbbo...olbdo.",
  "........oooomboolmmbolbbbbbbbbbbo.olbdo..",
  ".......ollmooollmmmbolbbbbbbbbbdo.olbdo..",
  "......ollmmmllmmmmmbombbbbbbbbbdoolbbdo..",
  "......odmmmmmmmbbbboombbbbbbbbbbolbbbdo..",
  "......ommmmbbbboooodobbbbbbbbbbobbbbdo...",
  ".......omdboooodddddobbbbbbbbbobbbddo....",
  "........ooooooodddddodddddddddodddoo.....",
  "...............ooooooooooooooooooo.......",
];
const BALL_A = [
  "...PPPP...",
  ".PPqUppPP.",
  ".PUqppppP.",
  "PqpssppppP",
  "PsspsspppP",
  "PpsppsspsP",
  "PpssppsttP",
  ".PpsstssP.",
  ".PPssttPP.",
  "...PPPP...",
];
const BALL_B = [
  "...PPPP...",
  ".PPUUppPP.",
  ".PUUppppP.",
  "PqppppppsP",
  "PssssssssP",
  "PpppppppsP",
  "PsssppsttP",
  ".PpssttsP.",
  ".PPssssPP.",
  "...PPPP...",
];
const BALL_C = [
  "...PPPP...",
  ".PPUUpsPP.",
  ".PUUppspP.",
  "PUpppsspsP",
  "PpppsspssP",
  "PppssppssP",
  "PsssppstsP",
  ".PppsttsP.",
  ".PPttssPP.",
  "...PPPP...",
];
const BALL_D = [
  "...PPPP...",
  ".PPqqpsPP.",
  ".PUUspspP.",
  "PUppspsspP",
  "PpppsppspP",
  "PpppsppssP",
  "PpppspstsP",
  ".PppsstsP.",
  ".PPttstPP.",
  "...PPPP...",
];
const THREAD = [[-8,31,"s"],[-7,30,"q"],[-6,30,"q"],[-5,31,"q"],[-4,31,"q"],[-3,31,"q"],[-2,31,"q"],[-1,31,"q"]];
// 공 자리(고양이 칸 기준 왼쪽 위) · 놀이 차례(한 바퀴 3620ms) — 자세 · 공 장면 · 공이 왼쪽으로 구른 칸 · 시간
const BALL_AT = [-3, 22];
const PLAY = [["BIG","BALL_A",0,1500],["CAT_UP","BALL_A",0,340],["CAT_TAP","BALL_A",0,90],["CAT_TAP","BALL_B",-1,80],["CAT_UP","BALL_C",-2,90],["CAT_UP","BALL_D",-3,150],["CAT_UP","BALL_C",-3,130],["CAT_UP","BALL_D",-3,170],["BIG","BALL_D",-3,650],["BIG","BALL_C",-2,190],["BIG","BALL_B",-1,230]];
// 칸 지도 → 그림 칸(색 글자 앞에 _ — C 의 고양이 색)
const catMap = (r) => {
  const m = new Map();
  r.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") m.set(key(x, y), "_" + ch); }));
  return m;
};
// b 에서 a 와 다른 칸만(감은 눈 덮개)
const diff = (a, b) => { const m = new Map(); for (const [k, v] of b) if (a.get(k) !== v) m.set(k, v); return m; };
// 세 장면에서 같은 칸 = 몸(늘 보임), 다른 칸 = 장면마다 따로(꼬리 끝)
function split3(a, b, c) {
  const same = new Map(), onlyA = new Map(), onlyB = new Map(), onlyC = new Map();
  for (const k of new Set([...a.keys(), ...b.keys(), ...c.keys()])) {
    const va = a.get(k), vb = b.get(k), vc = c.get(k);
    if (va === vb && vb === vc) { same.set(k, va); continue; }
    if (va) onlyA.set(k, va);
    if (vb) onlyB.set(k, vb);
    if (vc) onlyC.set(k, vc);
  }
  return { same, onlyA, onlyB, onlyC };
}
const HERO = split3(catMap(BIG), catMap(BIG_B), catMap(BIG_C));
// 앞발 자세 — BIG · CAT_UP · CAT_TAP 이 다른 칸(앞다리 자리)만 자세마다 따로, 나머지는 몸에 그대로(꼬리 살랑과 따로 돈다)
const POSE = split3(catMap(BIG), catMap(CAT_UP), catMap(CAT_TAP));
for (const k of [...POSE.onlyA.keys(), ...POSE.onlyB.keys(), ...POSE.onlyC.keys()]) HERO.same.delete(k);
// 공 장면 — 놀이 차례에 나오는 [장면, 구른 칸] 짝마다 한 겹
const BALLS = { BALL_A, BALL_B, BALL_C, BALL_D };
const BALL_KEYS = [...new Set(PLAY.map(([, b, dx]) => b + ":" + dx))];
const ballMap = (k) => { const [b, dx] = k.split(":"); const m = new Map(); BALLS[b].forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") m.set(key(BALL_AT[0] + Number(dx) + x, BALL_AT[1] + y), "_" + ch); })); return m; };
const THREAD_MAP = new Map(THREAD.map(([x, y, c]) => [key(x, y), "_" + c]));
// 겹마다 보이는 때(놀이 차례) → CSS 키프레임 — 같은 상태가 이어지는 구간을 묶어 끊어지듯(0.01% 틈) 켜고 끈다
const PLAY_MS = PLAY.reduce((s, f) => s + f[3], 0);
function playKeys(name, on) {
  let t = 0, out = [], cur = null, from = 0;
  for (const f of PLAY) { const v = on(f) ? 1 : 0; if (cur !== null && v !== cur) { out.push([from, t, cur]); from = t; } cur = v; t += f[3]; }
  out.push([from, t, cur]);
  const pct = (ms) => +(ms / PLAY_MS * 100).toFixed(3);
  return "@keyframes " + name + "{" + out.map(([a, b2, v], i) => pct(a) + "%," + (i === out.length - 1 ? 100 : +(pct(b2) - 0.01).toFixed(3)) + "%{opacity:" + v + "}").join("") + "}";
}
const HEAD_SHUT = diff(catMap(BIG), catMap(BIG_SHUT));
const CAT_BOX = bounds(HERO.same, HERO.onlyA, HERO.onlyB, HERO.onlyC);

// 위 가운데 문장 — 주황 나비 리본 + 금 방울(고양이 목줄 · 방울과 같은 주황 · 금)
const BOW = ["hh.....hQ", "hQQ.h.QQq", "QQQhhqQqq", "qQ.....qq"];
const BELL = [".JJ.", "zJJj", "Jjjg", ".gg."];
const BOW_PART = part(BOW, "O"), BELL_PART = part(BELL, "G");



// ── 털실 공 — 칸 원(지름 10) + 감긴 실 결(호 두 줄) · 땅에 풀린 짧은 실 끝 ──
function yarn() {
  const m = new Map();
  const N = 10, c = 4.5, rr = 4.9;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if ((x - c) ** 2 + (y - c) ** 2 > rr * rr) continue;
    const t = ((x - c) + (y - c)) / 7; // 음수 = 왼쪽 위(빛)
    let ch = t < -0.5 ? "H" : t < 0.42 ? "k" : "K";
    const d = Math.hypot(x - 0.5, y - 10); // 왼쪽 아래를 중심으로 감긴 실 결
    if (Math.abs(d - 5.6) < 0.55 || Math.abs(d - 8.6) < 0.55) ch = ch === "K" ? "c" : "K";
    m.set(key(x, y), ch);
  }
  m.set(key(10, 9), "k"); m.set(key(11, 9), "k"); // 풀린 실 끝 — 땅에 붙어 두 칸
  return part(m, "P");
}
// ── 작은 호박(할로윈 호박 밭과 같은 그림) ──
const PUMPKIN = [
  "....V....",
  "....Vv...",
  "..sLnLs..",
  ".LsnLLsM.",
  "LnsLLMsMs",
  "LMsMMMsss",
  ".MsMMsss.",
  "..sssss..",
];
function pumpkin() {
  const m = grid(PUMPKIN);
  const out = new Map(m);
  for (const k of m.keys()) {
    const [x, y] = xy(k);
    const o = "vV".includes(m.get(k)) ? "x" : "A"; // 호박 외곽이 꼭지 외곽보다 앞선다
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k2 = key(x + dx, y + dy);
      if (m.has(k2)) continue;
      if (!out.has(k2) || (out.get(k2) === "x" && o === "A")) out.set(k2, o);
    }
  }
  return out;
}
// ── 생선 — 왼쪽을 보는 은빛 생선(타원 몸 + 세모 꼬리), 큰 눈 하나 ──
function fish() {
  const m = new Map();
  for (let y = 0; y < 7; y++) for (let x = 0; x < 14; x++) {
    const body = ((x - 4.6) / 5) ** 2 + ((y - 3) / 3.1) ** 2 <= 1;
    const tail = x >= 9 && x <= 12 && Math.abs(y - 3) <= (x - 9) * 0.95 + 0.6;
    if (!body && !tail) continue;
    const t = ((x - 4.6) / 5 + (y - 3) / 3) / 2; // 음수 = 왼쪽 위(빛)
    m.set(key(x, y), tail ? (y < 3 ? "F" : "f") : t < -0.35 ? "T" : t < 0.1 ? "t" : t < 0.45 ? "F" : "f");
  }
  m.set(key(2, 2), "o"); m.set(key(2, 1), "W"); // 눈
  m.set(key(7, 1), "F"); m.set(key(7, 2), "F"); m.set(key(7, 3), "F"); // 아가미 선
  return part(m, "X");
}
const FISH = fish();
const YARN = yarn();
const PUMP = pumpkin();

// ── 발바닥 판(모서리) — 발가락 셋 + 발볼, 콩마다 외곽선 ──
const BEAN = ["Hk", "kK"];
const PAD = [".Hkkk.", "Hkkkkk", "kkkkkK", ".kkKK."];
const PAW_PLATE = compose([[part(BEAN), 0, 1], [part(BEAN), 3, 0], [part(BEAN), 6, 1], [part(PAD), 1, 4]]);
// 테 무늬 발자국 — 발가락 셋 + 발볼(분홍 칸만 — 테 색이 바탕)
const PRINT = grid(["k.k.k", ".....", ".kkk.", ".kkk."]);


export function deco(w, h, S, site, ctx = {}) {
  const P = site ? 2 : Math.round(2 * S); // 테 칸(사이트 2px · 봇 4px)
  const Q = site ? 2 : Math.max(2, Math.round(1.4 * S)); // 고양이 · 소품 칸
  const o = 12;
  const alt = !!ctx.altFrame;
  const K = meta.key; // 미리보기 — 두 번째 장면(꼬리 C · 감은 눈)
  const snap = (v, q = P) => Math.round(v / q) * q;
  const at = (box, q, x, y) => [snap(x, q) - box.x0 * q, snap(y, q) - box.y0 * q]; // 그림 왼쪽 위를 (x, y) 에

  // ── 테 — 네 겹(바깥 외곽 · 남보라 두 줄 · 안쪽 외곽). 두 줄은 위 · 왼쪽 반이 밝고 아래 · 오른쪽 반이 짙다 ──
  const ring = (k) => {
    const x0 = o + k * P, y0 = o + k * P, x1 = w - o - k * P, y1 = h - o - k * P;
    return { top: R(x0, y0, x1 - x0, P), bottom: R(x0, y1 - P, x1 - x0, P), left: R(x0, y0 + P, P, y1 - y0 - 2 * P), right: R(x1 - P, y0 + P, P, y1 - y0 - 2 * P), x0, y0, x1, y1 };
  };
  const r0 = ring(0), r1 = ring(1), r2 = ring(2), r3 = ring(3);
  const frame =
    `<path d="${r0.top + r0.bottom + r0.left + r0.right + r3.top + r3.bottom + r3.left + r3.right}" fill="${C.Z}"/>` +
    `<path d="${r1.top + r1.left}" fill="${C.i}"/><path d="${r1.bottom + r1.right}" fill="${C.D}"/>` +
    `<path d="${r2.top + r2.bottom + r2.left + r2.right}" fill="${C.U}"/>`;
  const inX1 = r3.x1 - P, inY0 = r3.y0 + P; // 테 안쪽 가장자리(오른쪽 · 위)

  // ── 주인공 고양이(사이트) — 레벨 막대 오른쪽 끝 위에 앉아 카드 가운데를 본다(운영자 "고양이 경험치 바 위로 옮겨").
  //    막대가 없는 카드는 아래 테 안쪽 오른쪽 구석. 봇 카드는 카드 종류마다 글자 자리가 달라 빼꼼 고양이 · 소품만 ──
  const catW = CAT_BOX.w * Q, catH = CAT_BOX.h * Q;
  const barTop = site && Number.isFinite(ctx.barY) ? (Number.isFinite(ctx.barBottom) ? 2 * ctx.barY - ctx.barBottom : ctx.barY - 5) : null;
  const onBar = barTop != null && barTop - catH > o + 20;
  const ground = site ? (onBar ? Math.floor(barTop / Q) * Q : h - o - 4 * P) : snap(h - 6, Q);
  const catX = snap(w - o - 4 * P - 2 * Q - catW, Q), catY = ground - catH; // 꼬리 끝(C 장면)이 테 안쪽 외곽선에 붙지 않게 두 칸 띄움
  const [cx0, cy0] = at(CAT_BOX, Q, catX, catY);

  // ── 봇 카드 주인공 — 빈자리가 있는 카드만(운영자 "넣을 곳 없을라낭"). 움직임 없이 첫 장면(꼬리 A · 앉은 자세 · 털실 공).
  //    레벨업: 레벨 막대 오른쪽 끝 위 · /레벨: 막대 오른쪽 끝 위(스탯 글자 밑이라 한 단 작게) · 역할 지급: 오른쪽 아래 바닥(그 자리 털실 · 호박 대신)
  //    자리는 봇 카드 판(1200 × 630, lib/botCards.js 레이아웃) 실측 비율. 다른 봇 카드는 글자 · 칸이 차서 고양이 없음 ──
  //    자세: 모두 털실 옆에 앉은 같은 고양이(만세 점프 · 식빵은 반려 — 운영자 "만세는 뒤질래?" · "처맞을래?")
  const BOT_HERO = { levelUp: { q: Q, ground: h * 0.889, right: w * 0.92 }, cmdLevel: { q: 2, ground: h * 0.876, right: w * 0.825 }, roleGrant: { q: Q, ground: snap(h - 6, Q), right: w - o - 4 * P - 8 * Q } };
  const hb = !site && BOT_HERO[ctx.kind];
  const botCat = new Layer(hb ? hb.q : Q);
  if (hb) {
    const bx = Math.round((hb.right - CAT_BOX.w * hb.q) / hb.q) * hb.q, by = Math.floor(hb.ground / hb.q) * hb.q - CAT_BOX.h * hb.q;
    const [ox, oy] = at(CAT_BOX, hb.q, bx, by);
    for (const m of [HERO.same, HERO.onlyA, POSE.onlyA, ballMap(BALL_KEYS[0]), THREAD_MAP]) botCat.stamp(m, ox, oy);
  }

  // 빼꼼(머리만 내민) 고양이는 뺐다 — 운영자 "얼굴만 나와있는 건 다 별로야 없애"

  // ── 위 가운데 문장 — 고양이 목줄과 같은 주황 리본 + 금 방울 ──
  const crest = new Layer(P);
  const bw = bounds(BOW_PART), bl = bounds(BELL_PART);
  const crestX = w / 2 - (bw.w * P) / 2, crestY = o + 2 * P - (bw.h * P) / 2;
  crest.stamp(BOW_PART, ...at(bw, P, crestX, crestY));
  crest.stamp(BELL_PART, ...at(bl, P, crestX + 2 * P, crestY + (bw.h - 2) * P));

  // ── 소품 — 사이트: 고양이 · 털실 공은 레벨 막대 위(주인공 겹), 아래 테 위는 비운다(할로윈 스킨 규칙 — 운영자 "레벨 바로 올린 건 좋아").
  //    봇 카드는 다른 할로윈 스킨과 같이 바닥 띠를 따라 호박 · 생선 · 털실(디스코드 카드 모양은 그대로) ──
  const props = new Layer(Q);
  const busy = [];
  const floorCat = hb && ctx.kind === "roleGrant"; // 역할 지급은 고양이가 오른쪽 바닥 — 그 자리 소품은 뺀다
  if (!site) for (const [sp, cxm] of [[PUMP, w * 0.09], [FISH, w * 0.3], [PUMP, w * 0.5], [YARN, w * 0.7], [PUMP, w * 0.91]].filter(([, cxm]) => !(floorCat && cxm > w * 0.6))) {
    const b = bounds(sp);
    props.stamp(sp, ...at(b, Q, cxm - (b.w * Q) / 2, ground - b.h * Q));
    busy.push([cxm - (b.w * Q) / 2 - 3 * P, cxm + (b.w * Q) / 2 + 3 * P]);
  }

  // ── 모서리 발바닥 판 ──
  const bandMid = o + 2 * P; // 남보라 두 줄 가운데(바깥에서)
  const plates = new Layer(P);
  const ppb = bounds(PAW_PLATE);
  for (const [cx, cy] of [[bandMid, bandMid], [bandMid, h - bandMid], [w - bandMid, bandMid], [w - bandMid, h - bandMid]])
    plates.stamp(PAW_PLATE, ...at(ppb, P, cx - (ppb.w * P) / 2, cy - (ppb.h * P) / 2));

  // ── 테 무늬 — 작은 발자국 점선(남보라 두 줄 가운데). 네 변 모두 같은 간격 · 좌우 / 위아래 대칭(운영자 "대칭을 맞추던지 간격을 맞추던지").
  //    위 변은 가운데 문장 자리를 양쪽 똑같이 비운다. 봇 카드 빼꼼 고양이 자리만 예외 ──
  const prints = new Layer(P);
  const pb = bounds(PRINT), pw = pb.w * P, ph = pb.h * P;
  const step = site ? 46 : 96;
  const corner = site ? 34 : 60;
  const evenly = (lo, hi, even) => { let n = Math.max(1, Math.round((hi - lo) / step)); if (even && n % 2) n++; return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / n); };
  const crestHalf = (bw.w * P) / 2 + 6 * P;
  for (const cx of evenly(o + corner, w - o - corner, true)) {
    if (cx > w / 2) continue; // 왼쪽 반만 셈하고 거울로
    const x = snap(cx - pw / 2), xr = w - x - pw;
    for (const xx of [x, xr]) {
      const c = xx + pw / 2;
      if (Math.abs(c - w / 2) > crestHalf) prints.stamp(PRINT, xx, snap(bandMid - ph / 2));
      if (!busy.some(([l, r]) => xx + pw > l && xx < r)) prints.stamp(PRINT, xx, h - snap(bandMid - ph / 2) - ph);
    }
  }
  for (const cy of evenly(o + corner, h - o - corner, false)) {
    if (cy > h / 2) continue;
    const y = snap(cy - ph / 2), yb2 = h - y - ph;
    for (const yy of [y, yb2]) {
      prints.stamp(PRINT, snap(bandMid - pw / 2), yy);
      prints.stamp(PRINT, w - snap(bandMid - pw / 2) - pw, yy);
    }
  }

  // ── 주인공 고양이 겹 — 몸(늘 보임) + 꼬리 세 장면(A → B → C → B 살랑) + 감은 눈 ──
  const cat = new Layer(Q), tA = new Layer(Q), tB = new Layer(Q), tC = new Layer(Q), shut = new Layer(Q);
  const poses = [new Layer(Q), new Layer(Q), new Layer(Q)], balls = BALL_KEYS.map(() => new Layer(Q)), thread = new Layer(Q);
  if (site) {
    cat.stamp(HERO.same, cx0, cy0);
    tA.stamp(HERO.onlyA, cx0, cy0); tB.stamp(HERO.onlyB, cx0, cy0); tC.stamp(HERO.onlyC, cx0, cy0);
    shut.stamp(HEAD_SHUT, cx0, cy0);
    [POSE.onlyA, POSE.onlyB, POSE.onlyC].forEach((m, i) => poses[i].stamp(m, cx0, cy0));
    BALL_KEYS.forEach((k, i) => balls[i].stamp(ballMap(k), cx0, cy0));
    thread.stamp(THREAD_MAP, cx0, cy0);
  }

  const defs = site
    ? `<pattern id="${K}-dt" width="24" height="24" patternUnits="userSpaceOnUse"><rect x="11" y="11" width="2" height="2" fill="${meta.tint}" fill-opacity="0.1"/></pattern>` +
      `<style>@keyframes ${K}-blink{0%,90%,94%,98%,100%{opacity:0}91%,95%{opacity:1}}` +
      `@keyframes ${K}-ta{0%,34.9%{opacity:1}35%,89.9%{opacity:0}90%,100%{opacity:1}}` +
      `@keyframes ${K}-tb{0%,34.9%{opacity:0}35%,44.9%{opacity:1}45%,79.9%{opacity:0}80%,89.9%{opacity:1}90%,100%{opacity:0}}` +
      `@keyframes ${K}-tc{0%,44.9%{opacity:0}45%,79.9%{opacity:1}80%,100%{opacity:0}}` +
      `.${K}-bl{animation:${K}-blink 5.2s steps(1) infinite}` +
      `.${K}-ta{animation:${K}-ta 2.4s infinite}.${K}-tb{animation:${K}-tb 2.4s infinite}.${K}-tc{animation:${K}-tc 2.4s infinite}` +
      // 털실 놀이 — 앞발 자세 셋 · 공 장면마다 놀이 차례대로 켜고 끈다
      ["BIG", "CAT_UP", "CAT_TAP"].map((p, i) => playKeys(`${K}-p${i}`, (f) => f[0] === p)).join("") +
      BALL_KEYS.map((k, i) => playKeys(`${K}-y${i}`, (f) => f[1] + ":" + f[2] === k)).join("") +
      [0, 1, 2].map((i) => `.${K}-p${i}{animation:${K}-p${i} ${PLAY_MS}ms infinite}`).join("") +
      BALL_KEYS.map((_, i) => `.${K}-y${i}{animation:${K}-y${i} ${PLAY_MS}ms infinite}`).join("") +
      `@media (prefers-reduced-motion:reduce){.${K}-bl,.${K}-ta,.${K}-tb,.${K}-tc,${[0, 1, 2].map((i) => `.${K}-p${i}`).join(",")},${BALL_KEYS.map((_, i) => `.${K}-y${i}`).join(",")}{animation:none}}</style>`
    : "";
  const under = site && !ctx.onScene ? `<rect width="${w}" height="${h}" fill="url(#${K}-dt)"/>` : "";
  // 두 번째 · 세 번째 장면은 처음엔 숨김(움직임이 꺼져 있거나 CSS 를 모르는 곳에서는 꼬리 A · 뜬 눈). alt = 꼬리 C · 감은 눈
  const hide = ` opacity="0"`;
  const tails = site ? tA.svg(`${K}-ta`, alt ? hide : "") + tB.svg(`${K}-tb`, hide) + tC.svg(`${K}-tc`, alt ? "" : hide) : "";
  const blink = (L, cls) => (site ? L.svg(cls, alt ? "" : hide) : "");
  const altBall = BALL_KEYS.length > 1 ? 1 : 0;
  const play = site ? thread.svg() + poses.map((L, i) => L.svg(`${K}-p${i}`, (alt ? i === 2 : i === 0) ? "" : hide)).join("") + balls.map((L, i) => L.svg(`${K}-y${i}`, (alt ? i === altBall : i === 0) ? "" : hide)).join("") : "";
  const over =
    `<g shape-rendering="crispEdges">${frame}${prints.svg()}${plates.svg()}${crest.svg()}` +
    `${props.svg()}${botCat.svg()}${tails}${cat.svg()}${play}${blink(shut, `${K}-bl`)}</g>`;
  return { defs, under, over };
}
