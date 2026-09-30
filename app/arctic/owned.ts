import { durationOptions } from "@/lib/shopPricing";
import { isUnitSale } from "@/lib/unitSale";

// 📌 보유 판정 — 서버(api/shop/purchase · checkout 의 _lib/renewal.js)의 1인 1개 · 연장 규칙과 같은 기준.
//    대기 · 완료이면서 기간이 남은 구매만 보유로 본다(만료 · 환불 · 취소, 기간이 지났는데 아직 완료인 건은 제외).
//    상품 id 가 같거나, 상품에 연결된 아이템(itemId)을 수동 지급 · 시즌 패스로 받은 건(itemRef)도 보유다.
export const isLiveOwn = (o: any) =>
  ["pending", "completed"].includes(o?.status) && !o?.consumedAt && (!o.expiresAt || new Date(o.expiresAt).getTime() > Date.now());

// 상품 하나에 해당하는 살아 있는 보유 건
const liveOf = (orders: any[], item: any) =>
  item ? orders.filter((o) => isLiveOwn(o) && (o.itemId === item._id || (!!item.itemId && o.itemRef === item.itemId))) : [];

// 📌 보유 상태 — "none" 보유 없음 · "timed" 기간제만 보유(기간제를 사면 연장, 무제한을 사면 업그레이드) · "forever" 무제한 보유(더 살 수 없음)
//    📌 1개 단위 상품(lib/unitSale.js)은 가져도 늘 "none" — 1인 1개 제한이 없어 더 살 수 있다(서버 planPurchase 와 같다). 개수는 ownedCountOf
export type OwnState = "none" | "timed" | "forever";
export const ownStateOf = (orders: any[], item: any): OwnState => {
  if (isUnitSale(item)) return "none";
  const live = liveOf(orders, item);
  if (!live.length) return "none";
  return live.some((o) => !o.expiresAt) ? "forever" : "timed";
};

// 연장 기준 — 가장 늦게 끝나는 살아 있는 기간제 보유의 만료 시각(ms). 연장할 수 없으면(보유 없음 · 무제한 보유) null.
//    연장분은 이 시각부터 고른 일수만큼 이어 붙는다
export const renewBaseOf = (orders: any[], item: any): number | null => {
  const live = liveOf(orders, item);
  if (!live.length || live.some((o) => !o.expiresAt)) return null;
  return Math.max(...live.map((o) => new Date(o.expiresAt).getTime()));
};

// 연장할 때 먼저 고를 기간 — 지금 가진 것과 같은 기간(상품에 있으면), 없으면 가장 긴 기간제. 연장할 수 없으면 null
export const renewPickOf = (orders: any[], item: any): number | null => {
  const live = liveOf(orders, item);
  if (!live.length || live.some((o) => !o.expiresAt)) return null;
  const timed = durationOptions(item).map((o: any) => Number(o.days)).filter((d: number) => d > 0);
  if (!timed.length) return null;
  const latest = live.reduce((a, b) => (new Date(b.expiresAt).getTime() > new Date(a.expiresAt).getTime() ? b : a));
  return timed.includes(Number(latest.days)) ? Number(latest.days) : Math.max(...timed);
};

// 이 기간으로 사면 연장인가 — 기간제만 보유 + 기간제(days > 0)를 고름
export const isRenewal = (orders: any[], item: any, days?: number) =>
  (days ?? 0) > 0 && renewBaseOf(orders, item) != null;

// 만료 표기 — "10월 3일 14:00" (KST). 올해가 아니면 "2027년 1월 3일 14:00"
export const expiryLabel = (ms: number) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value])
  );
  const thisYear = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" }).formatToParts(new Date()).find((x) => x.type === "year")?.value;
  return `${p.year !== thisYear ? `${p.year}년 ` : ""}${p.month}월 ${p.day}일 ${p.hour}:${p.minute}`;
};

// 상품 하나를 보유했는가(기간제 포함) — 상세 화면용
export const ownsItem = (orders: any[], item: any) => liveOf(orders, item).length > 0;

// 📌 가진 개수 — 1개 단위 상품의 "보유 N개"(살아 있는 건 수. 같은 아이템을 수동 지급 · 패스로 받은 것도 센다)
export const ownedCountOf = (orders: any[], item: any) => liveOf(orders, item).length;

// 보유한 상품 id 모음(기간제 포함) — 목록 화면(찜 · 홈 추천)용. 1개 단위 상품은 넣지 않는다(가져도 더 살 수 있다)
export const ownedIdsOf = (orders: any[], items: any[]) => {
  const live = orders.filter(isLiveOwn);
  const ids = new Set<string>(live.map((o) => String(o.itemId)));
  const refs = new Set<string>(live.map((o) => o.itemRef).filter(Boolean));
  for (const it of items) if (it?.itemId && refs.has(it.itemId)) ids.add(String(it._id));
  for (const it of items) if (isUnitSale(it)) ids.delete(String(it._id));
  return ids;
};

// 기간제만 보유해 다시 살 수 있는(연장 · 업그레이드) 상품 id 모음 — ownedIdsOf 의 부분집합
export const renewableIdsOf = (orders: any[], items: any[]) =>
  new Set<string>(items.filter((it) => ownStateOf(orders, it) === "timed").map((it) => String(it._id)));
