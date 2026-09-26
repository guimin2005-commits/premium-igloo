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

// 📌 할인 — 할인율(discountPct)과 종료 시각(discountUntil, 비면 기한 없음). 종료 시각이 지나면 할인이 저절로 끝난다.
//    판매가(salePrice)가 이 값을 쓰므로 카드 · 상세 · 장바구니 · 결제 API 가 모두 같은 순간에 할인을 끝낸다
export const discountActive = (item, now = Date.now()) => {
  const pct = Math.max(0, Math.min(100, Number(item?.discountPct) || 0));
  if (!pct) return false;
  if (!item?.discountUntil) return true;
  const t = new Date(item.discountUntil).getTime();
  return !Number.isFinite(t) || t > now;
};
export const discountPctOf = (item, now) => (discountActive(item, now) ? Math.max(0, Math.min(100, Number(item?.discountPct) || 0)) : 0);

// 할인 종료 표기 — "9월 30일 23:59까지" (KST). 기한이 없거나 할인 중이 아니면 ""
export const discountUntilLabel = (item) => {
  if (!discountActive(item) || !item?.discountUntil) return "";
  const d = new Date(item.discountUntil);
  if (!Number.isFinite(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value])
  );
  return `${p.month}월 ${p.day}일 ${p.hour}:${p.minute}까지`;
};

// 📌 상품 판매가 계산 — 할인이 살아 있으면 적용 (사이트·API 공용)
//    기간제는 고른 기간의 값을, 기간을 안 골랐으면 가장 짧은 기간의 값을 기준으로 삼는다.
export const salePrice = (item, days) => {
  let base = item?.price || 0;
  if (isTimed(item)) {
    const picked = days != null ? durationPrice(item, days) : null;
    base = picked != null ? picked : (durationOptions(item)[0]?.price ?? base);
  }
  const pct = discountPctOf(item);
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

// 기간 옵션이 둘 이상인가
export const hasOptions = (item) => durationOptions(item).length >= 2;

// 📌 카드에 걸 가격 — { days, price, list } (기간제가 아니면 days 는 undefined). 조건을 통과하는 게 없으면 null.
//    기본은 무제한(없으면 가장 긴 기간) — 상품의 제값을 크게 보여 준다(사용자 결정 2026-09-26).
//    ok(판매가) 를 주면(가격 필터 · 살 수 있는 것만) 통과하는 기간 중 무제한 > 가장 긴 기간을 건다 —
//    "100만 미만"을 고르면 무제한은 빠지고 7일 · 30일 값이 카드에 뜬다. 필터 · 정렬 · 카드가 모두 이 값을 본다.
export const cardPick = (item, ok) => {
  const opts = durationOptions(item); // 짧은 기간 → 긴 기간, 무제한은 맨 뒤
  const cands = opts.length ? opts.map((o) => o.days) : [undefined];
  for (let i = cands.length - 1; i >= 0; i--) {
    const days = cands[i];
    const price = salePrice(item, days);
    if (!ok || ok(price)) return { days, price, list: basePrice(item, days) };
  }
  return null;
};

// 카드 아래 작은 줄 — 가장 싼 기간 { days, price }. 걸린 기간보다 싼 게 있을 때만("7일 154,000 XP부터")
export const cardFrom = (item, pick) => {
  if (!pick) return null;
  let best = null;
  for (const o of durationOptions(item)) {
    const price = salePrice(item, o.days);
    if (!best || price < best.price) best = { days: o.days, price };
  }
  return best && best.days !== pick.days && best.price < pick.price ? best : null;
};

// 옛 이름 — 조건 없는 카드 가격(무제한 기준)
export const cardDays = (item) => cardPick(item)?.days;
export const cardPrice = (item) => cardPick(item)?.price ?? 0;
export const cardListPrice = (item) => cardPick(item)?.list ?? 0;

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
