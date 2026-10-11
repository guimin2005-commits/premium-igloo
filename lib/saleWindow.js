// 📌 판매 종료(2026-10-11 운영자 "할인 종료처럼 판매 종료 기간도 — 자동으로 판매 종료 되게") — ShopItem.saleUntil(없으면 끝 없음).
//    그 시각이 지나면: 상점 목록 · 검색 · 홈 · 추천에서 빠지고(목록 · 추천 API 가 거른다), 상세는 「판매 종료」로 보이며 구매가 잠기고,
//    바로 구매 · 장바구니 결제 · 세트 견적 API 가 막는다. 관리 목록에는 「판매 종료」 딱지. 판매 중(active) 토글은 그대로 둔다(기간이 지나 저절로 안 보일 뿐)
export const saleUntilMs = (it) => {
  const t = it?.saleUntil ? new Date(it.saleUntil).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};
export const saleEnded = (it, now = Date.now()) => {
  const t = saleUntilMs(it);
  return t != null && t <= now;
};
export const SALE_ENDED_MSG = "판매가 끝난 상품입니다.";
// 판매 종료 표기 — "10월 31일 23:59" (KST). 기한이 없으면 ""
export const saleUntilLabel = (it) => {
  const t = saleUntilMs(it);
  if (t == null) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(t)).map((x) => [x.type, x.value])
  );
  return `${p.month}월 ${p.day}일 ${p.hour}:${p.minute}`;
};
