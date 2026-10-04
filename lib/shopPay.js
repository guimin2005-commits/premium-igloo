// 📌 상점 결제 금액 나누기 — 바로 구매(app/api/shop/purchase) · 장바구니 결제(app/api/shop/checkout) · 결제 화면(app/arctic/checkout)이
//    이 함수 하나로 같은 값을 낸다. DB 의존이 없어 화면에서도 부르고, Node 로 바로 돌려 볼 수 있게 상대 경로(.js)로 부른다.
//
//    규칙 (1 빙옥 = 10,000 XP — lib/pointRate.js)
//    1) 쿠폰 할인(XP)은 주문 전체(일반 + 빙옥 전용) 판매가 비율로 줄마다 나눈다(최대 나머지 — 합이 정확히 할인액).
//    2) 빙옥 전용 줄은 XP 로 절대 내지 않는다 — 빙옥 전용 줄 전체의 쿠폰 몫을 합쳐 빙옥으로 한 번만 반영하고(아래 2 번), 줄마다는 카드 빙옥 비율로 나눈다.
//       쿠폰이 없으면 카드 · 장바구니에 보인 값(줄마다 올림) 그대로다.
//    3) 일반 줄은 지금까지처럼 — 합계(판매가 − 쿠폰 몫)에서 고른 빙옥(pointUse, 상한 xpToPoint(합계))만큼 빼고 나머지를 XP 로.
//    4) 줄별 기록(paidXp · paidPoint)의 합은 실제로 뺀 값과 정확히 같다 — 환불(app/api/shop/orders)이 이 값을 그대로 돌려준다.
//       빙옥 전용 줄: paidXp 0 · paidPoint 제 빙옥. 일반 줄: 뺀 XP · 빙옥을 각각 판매가 비율로 나눈다.
import { xpToPoint, POINT_RATE } from "./pointRate.js";
import { couponDiscount, couponScope } from "./shopPricing.js";

// 📌 실제 차감액(amount)을 가격(prices) 비율로 나눈다 — 합이 amount 와 정확히 같다(최대 나머지 방식).
//    먼저 각 줄에 비례 몫의 버림을 주고, 모자란 만큼을 소수점 아래가 큰 줄부터 1 씩 더 준다.
//    빙옥은 1 = 10,000 XP 라 몫이 작아서, 끝전을 마지막 줄에 몰면 그 줄만 몇 배로 커지고 나머지가 0 이 된다.
export function splitByPrice(amount, prices) {
  const sum = prices.reduce((s, p) => s + p, 0);
  if (amount <= 0 || sum <= 0) {
    // 가격이 전부 0 인데 뺀 값이 있을 수는 없지만, 있더라도 합이 어긋나지 않게 마지막 줄에 둔다
    return prices.map((_, i) => (i === prices.length - 1 ? Math.max(0, amount) : 0));
  }
  const shares = prices.map((p) => Math.floor((p * amount) / sum));
  let left = amount - shares.reduce((s, v) => s + v, 0);
  const order = prices
    .map((p, i) => ({ i, rem: (p * amount) % sum }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) shares[order[k].i] += 1;
  return shares;
}

const methodOf = (xp, point) => (point > 0 ? (xp > 0 ? "mixed" : "point") : "xp");

// ── 결제 계획 ──
//    lines    : [{ price: 판매가(XP, 쿠폰 전 · 수량 1건), pointOnly: boolean }] — 수량만큼 풀어 둔 한 건씩
//    discount : 쿠폰 할인액(XP, 주문 전체 기준 — couponDiscount(coupon, subtotal)). 합계보다 크면 합계로 자른다
//    coupon   : (선택) 쿠폰 { type, value, maxDiscount, payScope } — 주면 discount 대신 여기서 잰다.
//               payScope "xp" · "point"(XP 전용 · 빙옥 전용)는 쿠폰 없이 결제 수단을 먼저 나눈 뒤 그 수단으로 내는 금액에서만 깎는다(아래 planPayment)
//    pointUse : 일반 줄에 쓰겠다는 빙옥 개수. "max" 면 상한만큼(옛 요청의 payMethod "point")
//    pointBalance : (화면용, 선택) 보유 빙옥 — 주면 일반 줄 빙옥 상한을 '보유 − 빙옥 전용 몫'으로도 자른다. 서버는 주지 않는다(잔액은 따로 확인해 400)
//    반환 : {
//      subtotal, discount, total        — 전부 XP (쿠폰 전 합계 · 쿠폰 할인 · 쿠폰 뒤 합계)
//      normalSubtotal, normalDiscount, normalTotal        — 일반 줄 XP
//      pointOnlySubtotal, pointOnlyDiscount, pointOnlyTotal — 빙옥 전용 줄 XP(참고용)
//      pointOnlyListPoint                — 빙옥 전용 줄 쿠폰 전 빙옥 합(줄마다 올림)
//      pointOnlyPoint                    — 빙옥 전용 줄에서 뺄 빙옥(쿠폰 뒤, 쿠폰 몫은 합쳐 한 번만 반영)
//      maxPoint, pointUse, chargedXp     — 일반 줄: 빙옥 상한 · 쓸 빙옥 · 뺄 XP
//      point                             — 뺄 빙옥 합(pointOnlyPoint + pointUse)
//      payMethod                         — 주문 전체 "xp" | "point" | "mixed"
//      lines: [{ price, pointOnly, discount, net, paidXp, paidPoint, payMethod }]
//    }
/**
 * @param {{ lines?: { price: number, pointOnly?: boolean }[], discount?: number, pointUse?: number | string | null, pointBalance?: number | null }} [opts]
 */
function planCore({ lines = [], discount = 0, pointUse = 0, pointBalance } = {}) {
  const rows = (Array.isArray(lines) ? lines : []).map((l) => ({
    price: Math.max(0, Math.floor(Number(l?.price) || 0)),
    pointOnly: !!l?.pointOnly,
  }));
  const prices = rows.map((r) => r.price);
  const subtotal = prices.reduce((s, p) => s + p, 0);
  const disc = Math.min(subtotal, Math.max(0, Math.floor(Number(discount) || 0)));

  // 1) 쿠폰 할인을 줄마다 — 판매가 비율(최대 나머지)
  const discShares = splitByPrice(disc, prices);
  const net = prices.map((p, i) => Math.max(0, p - discShares[i]));

  // 2) 빙옥 전용 줄 — 쿠폰 몫은 합쳐서 한 번만 빙옥으로 반영한다.
  //    📌 줄마다 올리면 줄에 나뉜 10,000 XP 미만 몫이 줄마다 올림에 묻혀, 쿠폰은 쓰였는데 빙옥이 안 줄어든다.
  //    쿠폰 없는 값 = 카드에 보인 줄별 빙옥(올림)의 합. 쿠폰이 줄여 주는 빙옥 = 합계로 한 번 올려 잰 차이와 줄마다 잰 차이 중 큰 쪽
  //    (할인가가 10,000 의 배수가 아니면 줄별 올림 여유 때문에 줄마다 잰 쪽이 클 수 있다 — 그래도 예전보다 비싸지지 않게)
  const poIdx = [];
  const nmIdx = [];
  rows.forEach((r, i) => (r.pointOnly ? poIdx : nmIdx).push(i));
  const sumOf = (idx, arr) => idx.reduce((s, i) => s + arr[i], 0);
  const poList = poIdx.map((i) => xpToPoint(prices[i]));
  const pointOnlyListPoint = poList.reduce((s, v) => s + v, 0);
  const cutGroup = xpToPoint(sumOf(poIdx, prices)) - xpToPoint(sumOf(poIdx, net));
  const cutLine = pointOnlyListPoint - poIdx.reduce((s, i) => s + xpToPoint(net[i]), 0);
  const pointOnlyPoint = Math.max(0, pointOnlyListPoint - Math.max(cutGroup, cutLine));
  // 줄별 기록은 카드 빙옥 비율로 나눈다 — 합이 정확히 pointOnlyPoint 이고, 어느 줄도 제 카드 값을 넘지 않는다(부분 환불이 어긋나지 않게)
  const poShares = splitByPrice(pointOnlyPoint, poList);
  const poPoint = rows.map(() => 0);
  poIdx.forEach((i, k) => { poPoint[i] = poShares[k]; });

  // 3) 일반 줄 — 합계에서 빙옥 몫을 한 번 빼고 나머지를 XP 로
  const normalSubtotal = sumOf(nmIdx, prices);
  const normalTotal = sumOf(nmIdx, net);
  let maxPoint = xpToPoint(normalTotal);
  if (pointBalance != null) maxPoint = Math.min(maxPoint, Math.max(0, Math.floor(Number(pointBalance) || 0) - pointOnlyPoint));
  const asked = pointUse === "max" ? maxPoint : Math.max(0, Math.floor(Number(pointUse) || 0));
  const usePoint = Math.min(asked, maxPoint);
  const chargedXp = Math.max(0, normalTotal - usePoint * POINT_RATE);

  // 4) 줄별 기록 — 일반 줄은 뺀 XP · 빙옥을 판매가 비율로, 빙옥 전용 줄은 제 빙옥만
  const nmPrices = nmIdx.map((i) => prices[i]);
  const xpS = splitByPrice(chargedXp, nmPrices);
  const ptS = splitByPrice(usePoint, nmPrices);
  const normalMethod = methodOf(chargedXp, usePoint);
  const out = rows.map((r, i) => ({ price: r.price, pointOnly: r.pointOnly, discount: discShares[i], net: net[i], paidXp: 0, paidPoint: 0, payMethod: "xp" }));
  poIdx.forEach((i) => { out[i].paidPoint = poPoint[i]; out[i].payMethod = "point"; });
  nmIdx.forEach((i, k) => { out[i].paidXp = xpS[k]; out[i].paidPoint = ptS[k]; out[i].payMethod = normalMethod; });

  const point = pointOnlyPoint + usePoint;
  return {
    subtotal, discount: disc, total: subtotal - disc,
    normalSubtotal, normalDiscount: normalSubtotal - normalTotal, normalTotal,
    pointOnlySubtotal: sumOf(poIdx, prices), pointOnlyDiscount: sumOf(poIdx, discShares), pointOnlyTotal: sumOf(poIdx, net),
    pointOnlyListPoint, pointOnlyPoint,
    maxPoint, pointUse: usePoint, chargedXp,
    point,
    payMethod: methodOf(chargedXp, point),
    lines: out,
  };
}

// 📌 결제 계획 — 쿠폰 범위(lib/shopPricing couponScope)에 따라 할인 바탕이 다르다.
//    both : 예전 그대로 — 주문 전체(쿠폰 전 합계)로 할인액을 재고 줄마다 판매가 비율로 나눈 뒤 결제 수단을 나눈다.
//    xp   : XP 전용 — 쿠폰 없이 나눈 계획의 "뺄 XP"(chargedXp)로 할인액을 재고 그 XP 만 줄인다. 빙옥 몫은 그대로.
//    point: 빙옥 전용 — 쿠폰 없이 나눈 계획의 "뺄 빙옥"(빙옥 전용 줄 + 일반 줄에 쓴 빙옥)을 XP 로 쳐서(× 10,000) 할인액을 재고,
//           빙옥 단위로 버린 만큼(할인액 ÷ 10,000) 빙옥만 줄인다. XP 몫은 그대로.
//           📌 할인액이 1 빙옥이 안 되면(예: 10% 쿠폰으로 5 빙옥 — 0.5 빙옥) 1 빙옥으로 올려 준다(2026-10-04 추천대로 —
//              버려서 0 이 되면 빙옥으로 내는데도 "빙옥으로 결제할 때 쓰는 쿠폰"이라며 거절됐다). 1 빙옥 이상이면 그대로 버림.
//              올림은 쿠폰 스스로 1 빙옥(10,000 XP)까지 깎을 수 있을 때만(couponReachesPoint — 정률은 최대 할인액이 없거나 10,000 이상,
//              정액은 10,000 이상) · 올려도 빙옥이 1 개 이상 남을 때만(1 빙옥 주문이 쿠폰으로 무료가 되지 않게).
//              그 밖에는 할인 0 + couponReject(COUPON_TOO_SMALL) — 결제 API 가 이 문구로 거절하고 결제 화면도 같은 문구를 보인다
//    줄별 기록은 깎인 수단의 몫을 줄마다 그 수단 값 비율로 나눠 빼므로, 합이 실제로 뺀 값과 정확히 같다(환불이 그대로 돌려준다).
//    반환에 couponScope · pointAsked(쿠폰 전에 일반 줄에 쓰겠다고 한 빙옥 — 상한으로 자른 값) · couponReject(거절 문구, 없으면 "")를 붙인다. 화면 · 요청은 pointAsked 를 쓴다
//    (빙옥 전용 쿠폰은 pointUse 가 쿠폰 뒤 값이라, 그걸 다시 보내면 할인이 두 번 들어간다). 범위가 있는 쿠폰인데 그 수단으로 낼 금액이 없으면 discount 0 — 결제 API 가 쿠폰을 거절한다
export const COUPON_TOO_SMALL = "할인액이 1 빙옥보다 적은 쿠폰입니다.";
// 쿠폰 스스로 1 빙옥(10,000 XP) 이상 깎을 수 있는가 — 정률: 최대 할인액이 없거나 10,000 이상 · 정액: 10,000 이상
export const couponReachesPoint = (coupon) =>
  coupon?.type === "flat"
    ? Math.max(0, Number(coupon.value) || 0) >= POINT_RATE
    : (Number(coupon?.value) || 0) > 0 && (!(Number(coupon?.maxDiscount) > 0) || Number(coupon.maxDiscount) >= POINT_RATE);
/**
 * @param {{ lines?: { price: number, pointOnly?: boolean }[], discount?: number, coupon?: any, pointUse?: number | string | null, pointBalance?: number | null }} [opts]
 */
export function planPayment({ lines = [], discount = 0, coupon = null, pointUse = 0, pointBalance } = {}) {
  const scope = coupon ? couponScope(coupon) : "both";
  if (scope === "both") {
    const subtotal = (Array.isArray(lines) ? lines : []).reduce((t, l) => t + Math.max(0, Math.floor(Number(l?.price) || 0)), 0);
    const d = coupon ? couponDiscount(coupon, subtotal) : discount;
    const r = planCore({ lines, discount: d, pointUse, pointBalance });
    return { ...r, pointAsked: r.pointUse, couponScope: scope, couponReject: "" };
  }
  const core = planCore({ lines, discount: 0, pointUse, pointBalance });
  const base = { ...core, pointAsked: core.pointUse, couponReject: "" };
  const out = base.lines.map((l) => ({ ...l }));
  if (scope === "xp") {
    const cut = Math.min(base.chargedXp, couponDiscount(coupon, base.chargedXp));
    if (cut <= 0) return { ...base, couponScope: scope };
    const idx = out.map((_, i) => i).filter((i) => out[i].paidXp > 0);
    const shares = splitByPrice(cut, idx.map((i) => out[i].paidXp));
    idx.forEach((i, k) => {
      out[i].paidXp -= shares[k];
      out[i].discount += shares[k];
      out[i].net -= shares[k];
      out[i].payMethod = methodOf(out[i].paidXp, out[i].paidPoint);
    });
    const chargedXp = base.chargedXp - cut;
    return {
      ...base,
      discount: cut, total: base.subtotal - cut,
      normalDiscount: cut, normalTotal: base.normalTotal - cut,
      chargedXp,
      payMethod: methodOf(chargedXp, base.point),
      lines: out,
      couponScope: scope,
    };
  }
  // point — 빙옥 전용
  const cutXp = couponDiscount(coupon, base.point * POINT_RATE);
  let cutPoint = Math.min(base.point, Math.floor(cutXp / POINT_RATE));
  if (cutPoint <= 0 && base.point > 0) {
    // 1 빙옥이 안 되는 할인 — 올릴 수 있으면 1 빙옥, 아니면 거절(위 📌)
    if (couponReachesPoint(coupon) && base.point > 1) cutPoint = 1;
    else return { ...base, couponScope: scope, couponReject: COUPON_TOO_SMALL };
  }
  if (cutPoint <= 0) return { ...base, couponScope: scope };
  const idx = out.map((_, i) => i).filter((i) => out[i].paidPoint > 0);
  const shares = splitByPrice(cutPoint, idx.map((i) => out[i].paidPoint));
  let poCut = 0;
  let nmCut = 0;
  idx.forEach((i, k) => {
    out[i].paidPoint -= shares[k];
    out[i].discount += shares[k] * POINT_RATE;
    out[i].net = Math.max(0, out[i].net - shares[k] * POINT_RATE);
    out[i].payMethod = out[i].pointOnly ? "point" : methodOf(out[i].paidXp, out[i].paidPoint);
    if (out[i].pointOnly) poCut += shares[k];
    else nmCut += shares[k];
  });
  const disc = cutPoint * POINT_RATE;
  const pointOnlyPoint = base.pointOnlyPoint - poCut;
  const usePoint = base.pointUse - nmCut;
  const point = pointOnlyPoint + usePoint;
  return {
    ...base,
    discount: disc, total: Math.max(0, base.subtotal - disc),
    normalDiscount: nmCut * POINT_RATE, normalTotal: Math.max(0, base.normalTotal - nmCut * POINT_RATE),
    pointOnlyDiscount: poCut * POINT_RATE, pointOnlyTotal: Math.max(0, base.pointOnlyTotal - poCut * POINT_RATE),
    pointOnlyPoint, pointUse: usePoint, point,
    payMethod: methodOf(base.chargedXp, point),
    lines: out,
    couponScope: scope,
  };
}
