// 📌 상품 판매가 계산 — 할인율이 있으면 적용 (사이트·API 공용)
export const salePrice = (item) => {
  const pct = Math.max(0, Math.min(100, item?.discountPct || 0));
  if (!pct) return item?.price || 0;
  return Math.max(0, Math.floor((item.price * (100 - pct)) / 100));
};

// 쿠폰 할인액 (주문 총액 기준)
export const couponDiscount = (coupon, total) => {
  if (!coupon) return 0;
  if (coupon.type === "flat") return Math.min(total, Math.max(0, coupon.value));
  const raw = Math.floor((total * Math.max(0, coupon.value)) / 100);
  const capped = coupon.maxDiscount > 0 ? Math.min(raw, coupon.maxDiscount) : raw;
  return Math.min(total, capped);
};

// 쿠폰 사용 가능 여부 — 사용 불가 사유를 문자열로, 가능하면 null
export const couponError = (coupon, total, userId) => {
  if (!coupon || !coupon.active) return "유효하지 않은 쿠폰입니다.";
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return "만료된 쿠폰입니다.";
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return "사용 한도가 초과된 쿠폰입니다.";
  if (coupon.minTotal > 0 && total < coupon.minTotal) {
    return `${coupon.minTotal.toLocaleString()} XP 이상 주문 시 사용할 수 있습니다.`;
  }
  if (coupon.perUserLimit > 0 && userId) {
    const mine = (coupon.usedBy || []).filter((u) => u === userId).length;
    if (mine >= coupon.perUserLimit) return "이미 사용한 쿠폰입니다.";
  }
  return null;
};
