// 📌 기간제 상품 — 기간마다 값을 따로 매긴다. 옵션이 없으면 영구 상품.
export const isTimed = (item) => Array.isArray(item?.durations) && item.durations.length > 0;

// 기간 옵션 (짧은 기간부터)
export const durationOptions = (item) =>
  isTimed(item) ? [...item.durations].filter((d) => d?.days > 0).sort((a, b) => a.days - b.days) : [];

// 기간 하나의 정가 — 없는 기간이면 null
export const durationPrice = (item, days) => {
  const hit = durationOptions(item).find((d) => Number(d.days) === Number(days));
  return hit ? Math.max(0, Number(hit.price) || 0) : null;
};

// 📌 상품 판매가 계산 — 할인율이 있으면 적용 (사이트·API 공용)
//    기간제는 고른 기간의 값을, 기간을 안 골랐으면 가장 짧은 기간의 값을 기준으로 삼는다.
export const salePrice = (item, days) => {
  let base = item?.price || 0;
  if (isTimed(item)) {
    const picked = days != null ? durationPrice(item, days) : null;
    base = picked != null ? picked : (durationOptions(item)[0]?.price ?? base);
  }
  const pct = Math.max(0, Math.min(100, item?.discountPct || 0));
  if (!pct) return base;
  return Math.max(0, Math.floor((base * (100 - pct)) / 100));
};

// 기간 표기 — 7 → "7일", 30 → "30일"
export const durationLabel = (days) => (days > 0 ? `${days}일` : "영구");

// 남은 기간 표기 — 만료 시각으로부터 "3일 5시간 남음" 같은 문구
export const remainLabel = (expiresAt) => {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "기간 만료";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}일 ${h}시간 남음`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
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
