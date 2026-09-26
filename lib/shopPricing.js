// 📌 기간제 상품 — 기간마다 값을 따로 매긴다. 옵션이 없으면 영구 상품.
export const isTimed = (item) => Array.isArray(item?.durations) && item.durations.length > 0;

// 기간 옵션 (짧은 기간부터, 무제한은 맨 뒤)
//   days 0 = 무제한 — 기간 옵션과 나란히 팔 수 있다
export const durationOptions = (item) =>
  isTimed(item)
    ? [...item.durations]
        .filter((d) => d && d.days >= 0 && d.price > 0)
        .sort((a, b) => (a.days === 0 ? 1 : b.days === 0 ? -1 : a.days - b.days))
    : [];

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

// 📌 정가(할인 전) — salePrice 와 같은 기준으로 고른 기간의 값. 취소선 표기용
export const basePrice = (item, days) => {
  let base = item?.price || 0;
  if (isTimed(item)) {
    const picked = days != null ? durationPrice(item, days) : null;
    base = picked != null ? picked : (durationOptions(item)[0]?.price ?? base);
  }
  return Math.max(0, Number(base) || 0);
};

// 기간 옵션이 둘 이상인가 — 카드 가격 뒤에 "부터" 를 붙인다
export const hasOptions = (item) => durationOptions(item).length >= 2;

// 카드에 걸 기간 — 할인 적용 판매가가 가장 싼 기간 (기간제가 아니면 undefined)
export const cardDays = (item) => {
  const opts = durationOptions(item);
  if (!opts.length) return undefined;
  let best = opts[0];
  for (const o of opts) if (salePrice(item, o.days) < salePrice(item, best.days)) best = o;
  return best.days;
};

// 📌 카드 · 가격 필터 · 정렬 · "살 수 있는 것만" 이 모두 이 값을 본다 — 표기와 걸러지는 기준이 어긋나지 않게.
//    기간제는 모든 기간 옵션의 판매가 중 가장 싼 값, 아니면 salePrice(item)
export const cardPrice = (item) => salePrice(item, cardDays(item));

// 카드 취소선 가격 — cardPrice 와 같은 기간의 정가
export const cardListPrice = (item) => basePrice(item, cardDays(item));

// 기간 표기 — 7 → "7일", 30 → "30일"
export const durationLabel = (days) => (days > 0 ? `${days}일` : "무제한");

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
