import { salePrice, basePrice, isPointOnly } from "./shopPricing.js";
import { POINT_RATE } from "./pointRate.js";

// 📌 세트 상품(ShopItem.type "bundle") — 등록 아이템(models/Item) 여러 개를 한 상품으로 판다(2026-10-10 운영자 "스토어에 세트 상품 판매 예정").
//    · 구성: ShopItem.bundle = [{ itemId: Item id, days: 0 = 영구 | N일, qty: 1 ~ 99(역할 없고 영구인 아이템만 2 이상), value: 몸값 XP }]
//    · 결제하면 구성 아이템마다(qty 면 1개마다) Purchase 한 건 — itemId = 세트 상품 id, itemRef = 구성 Item id, bundleName = 세트 이름,
//      한 결제의 건은 같은 orderId, 첫 건만 bundleHead(재고 · 판매 수 · 추천 집계는 세트 한 번으로 센다 — lib/orderRefund · app/api/xp/reset).
//      그래서 인벤토리 · 아이템 효과 · 1인 1개(app/api/shop/_lib/renewal.js — itemRef 로 본다) · 봇 지급이 낱개 구매와 똑같이 돈다.
//    · 이미 가진 아이템(운영자 결정 "가진 만큼 가격을 깎아 줌"): 영구로 가진 구성은 빼고 주고, 그만큼 값을 깎는다 —
//      판매가 × (안 가진 구성 몸값 합 ÷ 전체 몸값 합). 몸값을 하나도 안 적었으면 구성마다 같은 몫. 다 가졌으면 못 산다.
//      기간제로만 가진 구성은 깎지 않는다 — 기간제 구성이면 연장(가장 늦은 만료 뒤에 이어 붙임), 영구 구성이면 영구로 올려 준다.
//      쌓이는 구성(qty 2 이상, 또는 소모형 · 1개 단위로 파는 아이템 — opts.stackable)은 가진 것으로 치지 않는다(늘 준다).
//      몸값은 모든 구성에 적거나 모두 비운다 — 일부만 적었으면 같은 몫으로 본다(몫 0 인 구성이 공짜로 나가지 않게, 저장 API 도 막는다)
//    · 바로 구매만 — 장바구니 결제(app/api/shop/checkout)는 세트를 받지 않는다.
//    DB · 서버 의존 없음 — 결제 API · 상품 저장 API · 상점 화면(가격 · 구성 표시)이 모두 이 파일을 쓴다.
export const BUNDLE_TYPE = "bundle";
export const BUNDLE_MAX = 12;
export const BUNDLE_QTY_MAX = 99;
export const BUNDLE_DAYS_MAX = 3650;

export const isBundle = (shopItem) => shopItem?.type === BUNDLE_TYPE;

const toInt = (v, lo, hi, dflt = lo) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

// 구성 목록 정리 — 모양만 맞춘다(아이템이 실제로 있는지 · 역할 조건은 상품 저장 API 가 Item 을 읽어 본다). 같은 아이템 두 번은 첫 칸만
export function normalizeBundle(list) {
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(list) ? list : []) {
    const itemId = String(c?.itemId || "").trim();
    if (!/^[0-9a-f]{24}$/i.test(itemId) || seen.has(itemId)) continue;
    seen.add(itemId);
    const days = toInt(c?.days, 0, BUNDLE_DAYS_MAX, 0);
    // 쌓기(qty 2 이상)는 영구 구성만 — 기간이 1개마다 따로 흐르지 않게(1개 단위 판매와 같은 규칙)
    const qty = days > 0 ? 1 : toInt(c?.qty, 1, BUNDLE_QTY_MAX, 1);
    out.push({ itemId, days, qty, value: toInt(c?.value, 0, 1e12, 0) });
    if (out.length >= BUNDLE_MAX) break;
  }
  return out;
}

// 구성 하나가 Item 조건에 맞나 — 저장 API 가 부른다. 맞으면 "", 아니면 이유.
//    stackable: 쌓이는 아이템인가(소모형 효과 · 1개 단위로 파는 상품이 가리킴) — 여러 개는 쌓이는 아이템만(아니면 같은 물건이 따로 여러 장 생긴다)
export function componentProblem(comp, item, { stackable = false } = {}) {
  if (!item) return "등록된 아이템을 찾을 수 없습니다.";
  if (item.type === "physical") return `기프트카드(${item.name})는 세트에 넣을 수 없습니다.`;
  if (comp.qty > 1 && String(item.roleId || "").trim()) return `역할이 있는 아이템(${item.name})은 여러 개 넣을 수 없습니다.`;
  if (comp.qty > 1 && !stackable) return `쌓이지 않는 아이템(${item.name})은 1개만 넣을 수 있습니다.`;
  return "";
}

// 몸값을 일부 구성에만 적었나 — 저장 API 가 막는다(모두 적거나 모두 비움)
export const partialValues = (comps) => {
  const n = comps.filter((c) => (Number(c.value) || 0) > 0).length;
  return n > 0 && n < comps.length;
};

// 몫 — 모든 구성에 몸값을 적었으면 몸값, 하나라도 비었으면 구성마다 1(같은 몫). qty 는 몫에 곱하지 않는다(몸값은 구성 한 줄의 값)
//    📌 몫이 0 인 구성이 있으면 그 구성만 남은 사람에게 세트가 0 XP 가 됐다(소모권이면 끝없이 공짜) — 몫은 늘 0 보다 크게
export const weightsOf = (comps) => {
  const vals = comps.map((c) => Math.max(0, Number(c.value) || 0));
  return vals.length && vals.every((v) => v > 0) ? vals : comps.map(() => 1);
};

// 📌 살아 있는 보유 — 결제 API 는 DB 에서(자물쇠 안), 화면은 내 구매 목록(GET /api/shop/purchase)에서 같은 조건으로 고른다
//    대기 · 완료, 안 쓴 것, 기간이 없거나 남은 것
export const isLiveHolding = (p, now = Date.now()) =>
  !!p &&
  (p.status === "pending" || p.status === "completed") &&
  !p.consumedAt &&
  (!p.expiresAt || new Date(p.expiresAt).getTime() > now);

// 구성 아이템 하나를 가리키는 보유 — itemRef 가 그 아이템이거나, itemRef 없는 옛 건이 그 아이템을 연결한 상품(shopIdsByItem)을 샀으면
const holdsItem = (p, itemId, shopIdsByItem) =>
  String(p.itemRef || "") === itemId || (!p.itemRef && (shopIdsByItem?.get(itemId) || new Set()).has(String(p.itemId)));

// 📌 구성마다 판정 — { state: "owned" | "renew" | "upgrade" | "new", base? (연장할 보유 건) }
//    owned   : 영구로 가졌다 → 주지 않고 값에서 뺀다
//    renew   : 기간제 구성 · 기간제로만 가졌다 → 가장 늦은 만료 뒤에 이어 붙인다
//    upgrade : 영구 구성 · 기간제로만 가졌다 → 영구로 새로 준다(기간제는 그대로)
//    new     : 안 가졌다(또는 쌓이는 구성)
/** @param {{ shopIdsByItem?: Map<string, Set<string>> | null, stackable?: Set<string> | null, now?: number }} [opts] */
export function componentStates(comps, holdings, { shopIdsByItem = null, stackable = null, now = Date.now() } = {}) {
  const live = (Array.isArray(holdings) ? holdings : []).filter((p) => isLiveHolding(p, now));
  return comps.map((c) => {
    // 쌓이는 구성(여러 개 · 소모형 · 1개 단위 아이템)은 가진 것으로 치지 않는다 — 하나 가졌다고 빼면 안 주고 값만 깎거나 세트를 못 샀다
    if (c.qty > 1 || stackable?.has(c.itemId)) return { state: "new" };
    const mine = live.filter((p) => holdsItem(p, c.itemId, shopIdsByItem));
    if (!mine.length) return { state: "new" };
    if (mine.some((p) => !p.expiresAt)) return { state: "owned" };
    if (!(c.days > 0)) return { state: "upgrade" };
    const base = mine.reduce((a, b) => (new Date(b.expiresAt).getTime() > new Date(a.expiresAt).getTime() ? b : a));
    return { state: "renew", base };
  });
}

// 📌 세트 값 — { full: 판매가(할인 반영), list: 정가, price: 이 사람이 낼 값, owned: 가진 구성 수, all: 다 가졌나 }
//    빙옥 전용 세트는 깎은 값을 빙옥 단위로 올린다(1 빙옥 = 10,000 XP 배수 — 표기 "N 빙옥"과 저장값이 끝전 없이 같게)
export function bundleQuote(set, comps, states) {
  const full = salePrice(set);
  const list = basePrice(set);
  const w = weightsOf(comps);
  const total = w.reduce((a, b) => a + b, 0);
  const keep = w.reduce((a, b, i) => a + (states[i]?.state === "owned" ? 0 : b), 0);
  const owned = states.filter((s) => s?.state === "owned").length;
  const all = comps.length > 0 && owned === comps.length;
  let price = full;
  if (owned && total > 0 && keep > 0) {
    price = Math.floor((full * keep) / total);
    // 빙옥 전용은 빙옥 단위로 반올림 — 올림이면 구성을 빼고도 값이 그대로인 경우가 있었다. 안 가진 구성이 있으면 최소 1 빙옥(정가가 1 빙옥 이상일 때)
    if (isPointOnly(set)) {
      price = Math.round(price / POINT_RATE) * POINT_RATE;
      if (full >= POINT_RATE) price = Math.max(POINT_RATE, price);
    }
    price = Math.min(full, price);
  }
  return { full, list, price: all ? 0 : price, owned, all };
}

// 📌 금액 나누기 — total 을 weights 비율로 정수로 나눈다(합이 정확히 total). 남는 끝전은 소수점이 큰 칸부터 1씩.
//    몫이 모두 0 이면 똑같이 나눈다
export function splitAmount(total, weights) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const n = weights.length;
  if (!n) return [];
  let w = weights.map((x) => Math.max(0, Number(x) || 0));
  if (!w.some((x) => x > 0)) w = w.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const raw = w.map((x) => (t * x) / sum);
  const out = raw.map(Math.floor);
  let rest = t - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; rest > 0; k = (k + 1) % n, rest--) out[order[k][1]]++;
  return out;
}

// 📌 지급할 낱개 목록 — 가진(owned) 구성은 빼고, qty 는 1개씩 펼친다. 몫(금액을 나눌 비율)은 구성 몫을 qty 로 나눈 값
export function bundleUnits(comps, states) {
  const w = weightsOf(comps);
  const units = [];
  comps.forEach((c, i) => {
    const st = states[i] || { state: "new" };
    if (st.state === "owned") return;
    for (let k = 0; k < c.qty; k++) units.push({ comp: c, index: i, state: st, weight: w[i] / c.qty || 0 });
  });
  return units;
}
