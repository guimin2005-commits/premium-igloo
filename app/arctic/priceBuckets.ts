import { cardPick, shownPrice, priceUnit } from "@/lib/shopPricing";

// 📌 상점 가격 필터 구간 — 고정 XP 구간(100만 미만 · 100만~500만 …) 대신 지금 탭(유형 · 검색)에 걸린 상품의 카드 가격 분포로 만든다.
//    · 단위별로 따로 — 일반 상품은 XP, 빙옥 전용 상품은 빙옥 값(shownPrice). 시즌 탭(빙옥 전용만)이면 빙옥 구간만 나온다.
//    · 값은 카드에 크게 뜨는 기본 가격(cardPick — 무제한, 없으면 가장 긴 기간). 구간을 고르면 목록은 지금처럼 cardPick 으로 맞는 기간을 건다.
//    · 경계는 보기 좋은 수(1 · 2 · 5 × 10ⁿ)만, 그리고 늘 두 상품 가격 사이에서만 고른다 → 빈 구간이 생기지 않는다.
//    · 구간은 [아래, 위) — 아래 값은 들고 위 값은 다음 구간으로("50~100 빙옥" = 50 이상 100 미만). 첫 구간은 "… 미만", 끝은 "… 이상".
//    · 상품이 많으면 4~5개, 적으면 줄이고, 한 단위의 상품이 3개 미만이거나 나눌 경계가 없으면 그 단위는 구간 없음.

export type PriceUnit = "XP" | "빙옥";
export type PriceBucket = {
  /** 고른 값 — 단위 · 아래 · 위가 같으면 탭을 바꿔도 같은 값(그대로 유지된다) */
  v: string;
  /** 칩 · 목록 글자 — "10만~50만", "50 빙옥 미만" */
  l: string;
  unit: PriceUnit;
  /** 표기 단위(XP 또는 빙옥) 값. lo 이상 · hi 미만 */
  lo: number;
  hi: number;
};

const MIN_ITEMS = 3;
const NICE = [1, 2, 5];

// 상품 수에 맞춘 구간 수 — 3~5개 2 · 6~8개 3 · 9~13개 4 · 14개~ 5
const targetCount = (n: number) => (n < 6 ? 2 : n < 9 ? 3 : n < 14 ? 4 : 5);

// (lo, hi] 안의 보기 좋은 수 중 두 값의 기하 평균에 가장 가까운 것. 없으면 null
function niceIn(lo: number, hi: number): number | null {
  const g = lo > 0 ? Math.sqrt(lo * hi) : hi / 2;
  const top = Math.ceil(Math.log10(Math.max(hi, 1))) + 1;
  let best: number | null = null;
  let bestD = Infinity;
  for (let e = 0; e <= top; e++) {
    for (const m of NICE) {
      const v = m * 10 ** e;
      if (v <= lo || v > hi) continue;
      const d = Math.abs(Math.log(v / g));
      if (d < bestD) { best = v; bestD = d; }
    }
  }
  return best;
}

type Cut = { j: number; b: number }; // j = 위 구간 첫 상품의 순번(정렬 기준), b = 경계

// 📌 k 개 구간이 되게 경계 k-1 개를 고른다 — 구간 크기가 고르게(이상적 크기와의 차 제곱합이 가장 작게).
//    k ≥ 3 이면 너무 작은 구간(이상적 크기의 절반 미만)은 받지 않는다 → 그런 조합뿐이면 null (구간 수를 줄여 다시)
function pickCuts(n: number, cuts: Cut[], k: number): Cut[] | null {
  const m = k - 1;
  if (cuts.length < m) return null;
  const ideal = n / k;
  const minSize = k > 2 ? Math.ceil(ideal / 2) : 1;
  const cost = (size: number) => (size < minSize ? Infinity : (size - ideal) ** 2);
  // dp[c][i] — 경계 c+1 개를 골랐고 마지막이 cuts[i] 일 때 앞쪽 구간들의 최소 비용
  const dp: number[][] = [];
  const from: number[][] = [];
  for (let c = 0; c < m; c++) {
    dp.push(new Array(cuts.length).fill(Infinity));
    from.push(new Array(cuts.length).fill(-1));
    for (let i = 0; i < cuts.length; i++) {
      if (c === 0) { dp[0][i] = cost(cuts[i].j); continue; }
      for (let p = 0; p < i; p++) {
        const v = dp[c - 1][p] + cost(cuts[i].j - cuts[p].j);
        if (v < dp[c][i]) { dp[c][i] = v; from[c][i] = p; }
      }
    }
  }
  let end = -1;
  let best = Infinity;
  for (let i = 0; i < cuts.length; i++) {
    const v = dp[m - 1][i] + cost(n - cuts[i].j);
    if (v < best) { best = v; end = i; }
  }
  if (end < 0 || !Number.isFinite(best)) return null;
  const out: Cut[] = [];
  for (let c = m - 1, i = end; c >= 0; i = from[c][i], c--) out.unshift(cuts[i]);
  return out;
}

// 1만 이상은 만 · 억 단위("10만", "1000만", "1억"), 그 아래는 쉼표("5,000")
const fmt = (n: number) =>
  n >= 1e8 && n % 1e8 === 0 ? `${n / 1e8}억` : n >= 1e4 && n % 1e4 === 0 ? `${n / 1e4}만` : n.toLocaleString("ko-KR");

function unitBuckets(prices: number[], unit: PriceUnit): PriceBucket[] {
  const ps = prices.filter((p) => Number.isFinite(p) && p >= 0).sort((a, b) => a - b);
  const n = ps.length;
  if (n < MIN_ITEMS) return [];
  // 나눌 수 있는 자리 — 이웃한 두 가격 사이에 보기 좋은 수가 있는 곳
  const cuts: Cut[] = [];
  for (let j = 1; j < n; j++) {
    if (ps[j - 1] === ps[j]) continue;
    const b = niceIn(ps[j - 1], ps[j]);
    if (b != null) cuts.push({ j, b });
  }
  let chosen: Cut[] | null = null;
  for (let k = targetCount(n); k >= 2 && !chosen; k--) chosen = pickCuts(n, cuts, k);
  if (!chosen) return [];
  const bounds = chosen.map((c) => c.b);
  const key = unit === "빙옥" ? "pt" : "xp";
  const u = unit === "빙옥" ? " 빙옥" : "";
  const edges = [0, ...bounds, Infinity];
  return edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1];
    const l = i === 0 ? `${fmt(hi)}${u} 미만` : hi === Infinity ? `${fmt(lo)}${u} 이상` : `${fmt(lo)}~${fmt(hi)}${u}`;
    return { v: `${key}:${lo}-${hi === Infinity ? "" : hi}`, l, unit, lo, hi };
  });
}

// 📌 지금 탭에 걸린 상품 목록 → 구간 목록(XP 구간 다음 빙옥 구간). 비면 가격 필터를 숨긴다
export function priceBuckets(list: object[]): PriceBucket[] {
  const by: Record<PriceUnit, number[]> = { XP: [], 빙옥: [] };
  for (const it of list) {
    const pick = cardPick(it);
    if (!pick) continue;
    by[priceUnit(it) as PriceUnit].push(shownPrice(it, pick.price));
  }
  return [...unitBuckets(by.XP, "XP"), ...unitBuckets(by["빙옥"], "빙옥")];
}

// 📌 이 상품 · 이 가격(XP 로 저장된 판매가)이 구간에 드는가 — 단위가 다른 상품은 들지 않는다
export const inBucket = (b: PriceBucket, item: object, xpPrice: number) => {
  if (priceUnit(item) !== b.unit) return false;
  const p = shownPrice(item, xpPrice);
  return p >= b.lo && p < b.hi;
};
