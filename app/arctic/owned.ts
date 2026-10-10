import { durationOptions } from "@/lib/shopPricing";
import { isUnitSale } from "@/lib/unitSale";
import { isBundle, normalizeBundle, componentStates, bundleQuote } from "@/lib/bundle";

// 📌 보유 판정 — 서버(api/shop/purchase · checkout 의 _lib/renewal.js)의 1인 1개 · 연장 규칙과 같은 기준.
//    대기 · 완료이면서 기간이 남은 구매만 보유로 본다(만료 · 환불 · 취소, 기간이 지났는데 아직 완료인 건은 제외).
//    상품 id 가 같거나, 상품에 연결된 아이템(itemId)을 수동 지급 · 시즌 패스로 받은 건(itemRef)도 보유다.
export const isLiveOwn = (o: any) =>
  ["pending", "completed"].includes(o?.status) && !o?.consumedAt && (!o.expiresAt || new Date(o.expiresAt).getTime() > Date.now());

// 📌 세트 상품(lib/bundle.js · type "bundle") — 구성 건은 itemId 가 세트 상품 id 라 아래 판정(같은 상품 id)을 그대로 쓰면 하나만 가져도 보유로 보인다.
//    그래서 세트는 구성 아이템마다 따로 본다 — 결제 API(api/shop/purchase buyBundle)와 같은 componentStates · bundleQuote.
//    다 가졌을 때만 "forever"(더 살 수 없음), 그 밖에는 "none". 세트에는 기간제 · 연장 · 1개 단위가 없다.
//    shopIdsByItem — itemRef 없는 옛 건이 그 아이템을 연결한 상품을 산 것도 보유로 친다(결제 API 와 같다). 상품 목록(items)으로 만들고, 없으면 itemRef 만 본다
type ShopLike = { _id?: unknown; itemId?: unknown; type?: unknown; bundle?: unknown; bundleItems?: unknown };
export const shopIdsByItemOf = (items?: readonly ShopLike[] | null) => {
  const m = new Map<string, Set<string>>();
  for (const s of items || []) {
    const k = String(s?.itemId || "");
    if (!k || isBundle(s)) continue;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(String(s._id));
  }
  return m;
};
// 구성 — 저장값(bundle)을 결제 API 와 같이 정리(normalizeBundle). 없으면 목록 API 의 bundleItems
export const bundleCompsOf = (item: ShopLike | null | undefined) =>
  normalizeBundle(Array.isArray(item?.bundle) && item.bundle.length ? item.bundle : item?.bundleItems);
// 쌓이는 구성 아이템 id — 상품 목록 · 상세 API 의 bundleItems[i].consumable(서버 stackableIdsOf: 소모형 효과 · 1개 단위 상품이 가리킴).
//    componentStates 의 stackable 로 넘겨 결제 API 와 같은 판정이 되게 한다(쌓이는 구성은 가져도 늘 준다). bundleItems 가 없으면 빈 모음
export const bundleStackOf = (item: ShopLike | null | undefined) =>
  new Set<string>(
    (Array.isArray(item?.bundleItems) ? item.bundleItems : [])
      .filter((c: { consumable?: unknown } | null) => !!c?.consumable)
      .map((c: { itemId?: unknown }) => String(c.itemId || ""))
  );
// lib/bundle.js 는 JS 라 옵션 기본값(null)이 그대로 타입이 된다(구조 분해 인자라 JSDoc 이 붙지 않는다) — 받는 모양을 여기 적어 둔다
type StatesFn = (
  comps: ReturnType<typeof normalizeBundle>,
  holdings: readonly unknown[],
  opts?: { shopIdsByItem?: Map<string, Set<string>> | null; stackable?: Set<string> | null; now?: number }
) => ReturnType<typeof componentStates>;
// 세트 한 벌 판정 — { comps, states: 구성마다 owned | renew | upgrade | new, quote: { full, list, price: 이 사람이 낼 값, owned, all } }
export const bundleViewOf = (orders: readonly unknown[], item: ShopLike, items?: readonly ShopLike[] | null) => {
  const comps = bundleCompsOf(item);
  const states = (componentStates as StatesFn)(comps, orders, { shopIdsByItem: shopIdsByItemOf(items), stackable: bundleStackOf(item) });
  return { comps, states, quote: bundleQuote(item, comps, states) };
};
// 세트 카드에 걸 값 — 이 사람이 낼 값(가진 구성만큼 깎은 값) · 정가(취소선). 다 가졌으면 판매가 그대로(살 수 없다).
//    ok(가격 필터 · 살 수 있는 것만)를 주면 통과할 때만 — 목록 필터 · 정렬 · 카드가 같은 값을 본다(카드의 cardPick 과 같은 모양)
export const bundlePickOf = (orders: readonly unknown[], item: ShopLike, items?: readonly ShopLike[] | null, ok?: (price: number) => boolean) => {
  const q = bundleViewOf(orders, item, items).quote;
  const price = Number(q.all ? q.full : q.price) || 0;
  if (ok && !ok(price)) return null;
  return { days: undefined, price, list: Number(q.list) || 0 };
};

// 상품 하나에 해당하는 살아 있는 보유 건 — 세트는 구성마다 따로 본다(위)
const liveOf = (orders: any[], item: any) =>
  item && !isBundle(item) ? orders.filter((o) => isLiveOwn(o) && (o.itemId === item._id || (!!item.itemId && o.itemRef === item.itemId))) : [];

// 📌 보유 상태 — "none" 보유 없음 · "timed" 기간제만 보유(기간제를 사면 연장, 무제한을 사면 업그레이드) · "forever" 무제한 보유(더 살 수 없음)
//    📌 1개 단위 상품(lib/unitSale.js)은 가져도 늘 "none" — 1인 1개 제한이 없어 더 살 수 있다(서버 planPurchase 와 같다). 개수는 ownedCountOf
//    📌 세트는 구성을 다 가졌을 때만 "forever" — items(상품 목록)를 주면 옛 건까지 본다
export type OwnState = "none" | "timed" | "forever";
export const ownStateOf = (orders: any[], item: any, items?: readonly ShopLike[] | null): OwnState => {
  if (isUnitSale(item)) return "none";
  if (isBundle(item)) return bundleViewOf(orders, item, items).quote.all ? "forever" : "none";
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

// 상품 하나를 보유했는가(기간제 포함) — 상세 화면용. 세트는 구성을 다 가졌을 때만
export const ownsItem = (orders: any[], item: any) => (isBundle(item) ? ownStateOf(orders, item) === "forever" : liveOf(orders, item).length > 0);

// 📌 가진 개수 — 1개 단위 상품의 "보유 N개"(살아 있는 건 수. 같은 아이템을 수동 지급 · 패스로 받은 것도 센다)
export const ownedCountOf = (orders: any[], item: any) => liveOf(orders, item).length;

// 보유한 상품 id 모음(기간제 포함) — 목록 화면(찜 · 홈 추천)용. 1개 단위 상품은 넣지 않는다(가져도 더 살 수 있다)
//    📌 세트 구성 건(bundleName — itemId 가 세트 상품 id)은 세트 id 로 세지 않는다. 구성 아이템(itemRef)으로만 센다 —
//       그 아이템을 연결한 낱개 상품은 보유다. 세트 자신은 구성을 다 가졌을 때만 넣는다(ownStateOf)
export const ownedIdsOf = (orders: any[], items: any[]) => {
  const live = orders.filter(isLiveOwn);
  const ids = new Set<string>(live.filter((o) => !o.bundleName).map((o) => String(o.itemId)));
  const refs = new Set<string>(live.map((o) => o.itemRef).filter(Boolean));
  for (const it of items) if (it?.itemId && refs.has(it.itemId)) ids.add(String(it._id));
  for (const it of items) if (isUnitSale(it)) ids.delete(String(it._id));
  for (const it of items) {
    if (!isBundle(it)) continue;
    ids.delete(String(it._id));
    if (ownStateOf(orders, it, items) === "forever") ids.add(String(it._id));
  }
  return ids;
};

// 기간제만 보유해 다시 살 수 있는(연장 · 업그레이드) 상품 id 모음 — ownedIdsOf 의 부분집합
export const renewableIdsOf = (orders: any[], items: any[]) =>
  new Set<string>(items.filter((it) => ownStateOf(orders, it) === "timed").map((it) => String(it._id)));
