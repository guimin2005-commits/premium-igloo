// 📌 주문 묶기 — 1개 단위 상품(lib/unitSale.js)은 1개가 Purchase 한 건이라, 한 결제(orderId)의 같은 상품 건들을 한 줄로 모은다.
//    orderId 가 "" 인 옛 건은 한 건이 한 줄. 관리자 주문 목록(app/admin/shop) · 내 구매 내역(app/arctic/orders)이 같은 규칙을 쓴다.
//    원장(app/api/xp/ledger)은 같은 기준(orderId + 상품)으로 DB 에서 묶는다. DB 의존 없음(화면에서 부른다)
//
//    반환: 입력 순서(첫 건 기준)대로 [{ ...첫 건, _id: 묶음 키, key, rows, ids, qty,
//            status: 대표 상태(대기가 있으면 대기 → 완료가 있으면 완료 → 첫 건), counts: { 상태: 개수 }, used: 쓴 개수,
//            paidXp · paidPoint · cashbackXp: 돌려주지 않은 건의 합(모두 돌려줬으면 전부), paidQty: 그 건 수 }]
const PRIORITY = ["pending", "completed"];
const GONE = ["cancelled", "refunded"];

export const orderKeyOf = (r) => (r?.orderId ? `o:${r.orderId}|${r.itemId}` : `p:${r?._id}`);

export function groupOrders(rows) {
  const byKey = new Map();
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    const key = orderKeyOf(r);
    let g = byKey.get(key);
    if (!g) {
      g = { key, head: r, rows: [] };
      byKey.set(key, g);
      out.push(g);
    }
    g.rows.push(r);
  }
  return out.map(({ key, head, rows: list }) => {
    const counts = {};
    for (const r of list) counts[r.status] = (counts[r.status] || 0) + 1;
    const status = PRIORITY.find((s) => counts[s]) || head.status;
    // 📌 금액은 돌려주지 않은 건만 더한다 — 일부만 환불 · 취소한 줄이 낸 값 전부로 보이지 않게(상단 "사용한 XP" 합계와 같은 기준).
    //    모두 돌려줬으면 전부(그 줄은 취소선으로 보인다). paidQty: 금액에 든 건 수(관리자 목록의 정가 × 개수)
    const kept = list.filter((r) => !GONE.includes(r.status));
    const base = kept.length ? kept : list;
    const sum = (k) => base.reduce((n, r) => n + (Number(r[k]) || 0), 0);
    return {
      ...head,
      _id: key,
      key,
      rows: list,
      ids: list.map((r) => String(r._id)),
      qty: list.length,
      paidQty: base.length,
      status,
      counts,
      used: list.filter((r) => r.consumedAt).length,
      paidXp: sum("paidXp"),
      paidPoint: sum("paidPoint"),
      cashbackXp: sum("cashbackXp"),
      // 옛 기록처럼 낸 값이 비어 있는 건이 섞였는지 — 금액을 가격으로 떨어뜨려 보이는 판정(billed)과 같은 뜻
      billed: base.every((r) => !!r.billed || (r.paidXp || 0) > 0 || (r.paidPoint || 0) > 0),
    };
  });
}

// 묶음의 상태 요약 — 대표 상태와 다른 것만 "사용 1 · 환불 1" 처럼(대표 상태만 있으면 "")
const LABEL = { pending: "대기", completed: "완료", cancelled: "취소", refunded: "환불", expired: "만료" };
export function orderSummary(g) {
  if (!g || g.qty <= 1) return "";
  const parts = [];
  if (g.used) parts.push(`사용 ${g.used}`);
  for (const [s, n] of Object.entries(g.counts || {})) if (s !== g.status && n > 0) parts.push(`${LABEL[s] || s} ${n}`);
  return parts.join(" · ");
}
