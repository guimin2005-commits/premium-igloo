// 📌 상품 폼 공용 로직 — 상점 인라인 폼(ArcticShopBody)과 관리자 상품 화면(admin/shop)이 함께 쓴다.
//    두 폼이 따로 굴러가면 "등록된 아이템 선택" 같은 규칙이 한쪽에서만 고쳐져 조용히 갈라진다.
//    화면(JSX)은 각자 두되 상태 모양·기간 계산·유형 전환·아이템 적용은 여기 한 곳에서 정한다.

import { isItemType } from "@/lib/items";
import { POINT_RATE, xpToPoint, pointToXp } from "@/lib/pointRate";
import { unitSaleAllowed, clampPerOrder, DEFAULT_PER_ORDER } from "@/lib/unitSale";
import { isBackdropKey } from "@/lib/itemBackdrops";

export type ProductForm = {
  id: string;
  // 등록된 아이템(models/Item) 참조 — "" 이면 직접 설정. 값이 있으면 표기 필드는 잠기고 서버가 다시 복사한다
  itemId: string;
  // 연동한 아이템의 이미지 스냅샷 — 미리보기용. 서버는 이 값을 무시하고 Item 에서 다시 읽는다
  itemImageUrl: string;
  name: string;
  description: string;
  // 상품 고유 이미지 — 연동 여부와 무관하게 편집한다. 비우면 아이템 이미지 → 아이콘 순으로 보인다
  imageUrl: string;
  icon: string;
  color: string;
  // 📌 카드 배경 장면 키(lib/itemBackdrops.js) — "" 이면 기본 바탕. 상품 고유 값이라 아이템을 연동해도 잠그지 않는다
  backdrop: string;
  type: string;
  roleId: string;
  roleName: string;
  detachOnSeason: boolean;
  // 📌 빙옥 전용 결제 — 켜면 가격 칸(price · price7 · price30 · priceInf)은 빙옥 단위다. 저장할 때 ×10,000 해 XP 로 보낸다(toPayload)
  pointOnly: boolean;
  price: string;
  discountPct: string;
  // 할인 종료 — datetime-local 값(KST "YYYY-MM-DDTHH:mm"). 비우면 기한 없음
  discountUntil: string;
  stock: string;
  // 편집을 시작할 때의 재고(-1 = 무제한) — 서버가 그 사이 팔린 수량을 되살리지 않게 바꾼 폭만 반영한다
  stockBase: string;
  sortOrder: string;
  active: boolean;
  // 📌 기간 판매 — timed: 7일 · 30일 기간을 판다. withInf: 기간과 나란히 무제한도 판다(timed 일 때만 뜻이 있다).
  //    판매 방식(saleModeOf): 무제한 = 둘 다 꺼짐 · 기간제 = timed · 기간제 + 무제한 = timed + withInf
  timed: boolean;
  withInf: boolean;
  price7: string;
  price30: string;
  // 기간제 + 무제한일 때 무제한 가격. 무제한만 팔 때는 price(정가)가 그 값이다
  priceInf: string;
  // 📌 1개 단위 판매(lib/unitSale.js) — 기간제(timed)와 함께 켤 수 없다. 판매 방식 세 갈래(saleModeOf)로 고른다
  unitSale: boolean;
  // 1회 최대 수량(1~99) — 1개 단위일 때만 저장된다
  maxPerOrder: string;
};

export const EMPTY_PRODUCT_FORM: ProductForm = {
  id: "",
  itemId: "",
  itemImageUrl: "",
  name: "",
  description: "",
  imageUrl: "",
  icon: "",
  color: "",
  backdrop: "",
  type: "role",
  roleId: "",
  roleName: "",
  detachOnSeason: false,
  pointOnly: false,
  price: "",
  discountPct: "",
  discountUntil: "",
  stock: "",
  stockBase: "",
  sortOrder: "",
  active: true,
  timed: false,
  withInf: false,
  price7: "",
  price30: "",
  priceInf: "",
  unitSale: false,
  maxPerOrder: String(DEFAULT_PER_ORDER),
};

// 📌 판매 방식 — 무제한 · 기간제 · 기간제 + 무제한 · 1개 단위(수량 판매). 네 칸 고정(고를 수 없는 칸도 자리를 지킨다)
//    무제한 = 정가 한 값(durations 비움) · 기간제 = 7일 · 30일만 · 기간제 + 무제한 = 7일 · 30일 + 무제한(days 0)
export type SaleMode = "forever" | "timed" | "both" | "unit";
export const SALE_MODES: { v: SaleMode; l: string }[] = [
  { v: "forever", l: "무제한" },
  { v: "timed", l: "기간제" },
  { v: "both", l: "기간제 + 무제한" },
  { v: "unit", l: "1개 단위" },
];
export const saleModeOf = (f: ProductForm | null | undefined): SaleMode =>
  f?.unitSale ? "unit" : f?.timed ? (f.withInf ? "both" : "timed") : "forever";
// 1개 단위로 팔 수 있는 폼인가 — 역할 없는 아이템 · 꾸미기만(연결 아이템이면 그 아이템의 유형 · 역할)
export const unitSaleOk = (f: ProductForm | null | undefined) => !!f && unitSaleAllowed(f.type, f.roleId);
// 판매 방식 바꾸기 — 1개 단위를 못 고르는 폼이면 그대로 둔다(부르는 쪽이 알림을 띄운다).
//    무제한 값은 정가(무제한만) ↔ 무제한 칸(기간제 + 무제한)을 오가므로, 옮겨 갈 칸이 비어 있으면 넣어 둔 값을 옮겨 준다
export const setSaleMode = (f: ProductForm, mode: SaleMode): ProductForm => {
  if (mode === "unit" && !unitSaleOk(f)) return f;
  const next: ProductForm = { ...f, timed: mode === "timed" || mode === "both", withInf: mode === "both", unitSale: mode === "unit" };
  if (mode === "both" && !String(f.priceInf ?? "").trim() && !f.timed) next.priceInf = f.price;
  if ((mode === "forever" || mode === "unit") && !String(f.price ?? "").trim() && f.timed && f.withInf) next.price = f.priceInf;
  return next;
};
// 지급할 역할 고르기 — 역할이 생기면 1개 단위는 끈다(역할은 여러 개 가질 수 없다)
export const pickRole = (f: ProductForm, roleId: string): ProductForm => ({ ...f, roleId, unitSale: roleId ? false : f.unitSale });

// 폼 소스 — 직접 설정 | 등록된 아이템
export const SOURCE_OPTIONS = [
  { v: "custom", l: "직접 설정" },
  { v: "item", l: "등록된 아이템" },
];
export const sourceOf = (f: ProductForm | null | undefined) => (f?.itemId ? "item" : "custom");
export const isLinked = (f: ProductForm | null | undefined) => !!f?.itemId;

// 📌 가격 칸 단위 — 빙옥 전용이면 빙옥, 아니면 XP. 저장값(XP) ↔ 입력칸 값을 여기서만 바꾼다
export const formUnit = (f: ProductForm | null | undefined) => (f?.pointOnly ? "빙옥" : "XP");
const PRICE_KEYS = ["price", "price7", "price30", "priceInf"] as const;
// 저장값(XP) → 입력칸 값. 빙옥 전용이면 빙옥(저장값은 10,000 의 배수라 끝전이 없다 — 옛 값은 올림)
const toField = (xp: any, pointOnly: boolean) => {
  if (xp == null || xp === "") return "";
  return String(pointOnly ? xpToPoint(xp) : xp);
};
// 입력칸 값 → 저장할 XP
const toXpValue = (v: string, pointOnly: boolean) => {
  const n = Math.max(0, Math.floor(Number(v) || 0));
  return pointOnly ? pointToXp(n) : n;
};

// 저장된 상품의 기간 옵션 — 값이 있는 것만. 기간(1일 이상) · 무제한(days 0)
type SavedDuration = { days?: number; price?: number };
const savedDurations = (it: { durations?: SavedDuration[] } | null | undefined): SavedDuration[] => (Array.isArray(it?.durations) ? it.durations : []);
const timedDurations = (it: { durations?: SavedDuration[] } | null | undefined) => savedDurations(it).filter((d) => Number(d?.days) > 0 && Number(d?.price) > 0);
const infDuration = (it: { durations?: SavedDuration[] } | null | undefined) => savedDurations(it).find((d) => Number(d?.days) === 0 && Number(d?.price) > 0) || null;

// 저장된 상품 → 폼. 기존 기간·시즌 설정을 입력칸으로 되돌린다 (안 채우면 수정 저장할 때마다 조용히 꺼진다)
//    빙옥 전용이면 가격 칸은 빙옥으로 되돌린다
export const formFromShopItem = (it: any): ProductForm => ({
  id: it._id,
  itemId: it.itemId || "",
  itemImageUrl: it.itemImageUrl || "",
  name: it.name || "",
  description: it.description || "",
  imageUrl: it.imageUrl || "",
  icon: it.icon || "",
  color: it.color || "",
  // 목록에서 빠진 옛 키는 비운다 — 고를 수 없는 장면이 선택된 채로 남지 않게
  backdrop: isBackdropKey(it.backdrop) ? String(it.backdrop) : "",
  type: isItemType(it.type) ? it.type : "role",
  roleId: it.roleId || "",
  roleName: it.roleName || "",
  detachOnSeason: !!it.detachOnSeason,
  pointOnly: !!it.pointOnly,
  price: toField(it.price, !!it.pointOnly),
  discountPct: it.discountPct ? String(it.discountPct) : "",
  discountUntil: toKstInput(it.discountUntil),
  stock: it.stock < 0 || it.stock == null ? "" : String(it.stock),
  stockBase: String(it.stock ?? -1),
  sortOrder: String(it.sortOrder || 0),
  active: it.active !== false,
  // 기간(7일 · 30일)이 하나라도 있어야 기간제 — 무제한(days 0) 하나만 있는 옛 값은 무제한 판매로 읽는다(정가가 그 값)
  timed: !it.unitSale && timedDurations(it).length > 0,
  withInf: !it.unitSale && timedDurations(it).length > 0 && infDuration(it) != null,
  price7: toField(it.durations?.find((d: any) => d.days === 7)?.price, !!it.pointOnly),
  price30: toField(it.durations?.find((d: any) => d.days === 30)?.price, !!it.pointOnly),
  priceInf: toField(infDuration(it)?.price, !!it.pointOnly),
  unitSale: !!it.unitSale,
  maxPerOrder: String(it.unitSale ? clampPerOrder(it.maxPerOrder || DEFAULT_PER_ORDER) : DEFAULT_PER_ORDER),
});

// 📌 빙옥 전용 켜기 · 끄기 — 입력해 둔 값은 같은 값어치로 바꿔 둔다(XP → 빙옥은 올림, 빙옥 → XP 는 ×10,000)
export const setPointOnly = (f: ProductForm, on: boolean): ProductForm => {
  if (!!f.pointOnly === on) return f;
  const next: ProductForm = { ...f, pointOnly: on };
  for (const k of PRICE_KEYS) {
    const v = String(f[k] ?? "").trim();
    if (!v || !(Number(v) > 0)) continue;
    next[k] = on ? String(xpToPoint(Number(v))) : String(pointToXp(Math.floor(Number(v))));
  }
  return next;
};

// 📌 가격 칸 아래 계산 한 줄(관리자 화면) — 입력할 때마다 바로 계산한다. 사용자가 직접 요청한 안내(빙옥 계산 방식)
//    일반: "빙옥으로 내면 N 빙옥 · 1 빙옥 = 10,000 XP" · 빙옥 전용: "N 빙옥 = N×10,000 XP 상당"
export const priceCalc = (f: ProductForm | null | undefined, raw: string | number) => {
  const n = Math.max(0, Math.floor(Number(raw) || 0));
  if (!n) return "";
  return f?.pointOnly
    ? `${n.toLocaleString()} 빙옥 = ${pointToXp(n).toLocaleString()} XP 상당`
    : `빙옥으로 내면 ${xpToPoint(n).toLocaleString()} 빙옥 · 1 빙옥 = ${POINT_RATE.toLocaleString()} XP`;
};
// 기간별 가격 칸이 좁을 때의 한 줄 요약 — "빙옥으로 내면 7일 30 · 30일 100 빙옥" / "7일 30,000 · 30일 100,000 XP 상당"
export const durationsCalc = (f: ProductForm | null | undefined) => {
  if (!f) return "";
  const list = ([["price7", "7일"], ["price30", "30일"], ...(f.withInf ? [["priceInf", "무제한"]] : [])] as const)
    .map(([k, l]) => ({ l, n: Math.max(0, Math.floor(Number(f[k as "price7" | "price30" | "priceInf"]) || 0)) }))
    .filter((x) => x.n > 0);
  if (!list.length) return "";
  return f.pointOnly
    ? `${list.map((x) => `${x.l} ${pointToXp(x.n).toLocaleString()}`).join(" · ")} XP 상당`
    : `빙옥으로 내면 ${list.map((x) => `${x.l} ${xpToPoint(x.n).toLocaleString()}`).join(" · ")} 빙옥`;
};
// 할인 뒤 판매가 — 입력칸 단위 그대로. 상점 · 결제와 같은 계산(lib/shopPricing applyDiscount):
//    빙옥 전용은 XP 로 할인한 뒤 빙옥 단위로 내린다(2026-10-04 — 할인이 빙옥 값에 반영되게). 할인이 없으면 정가 그대로
export const formSalePrice = (f: ProductForm | null | undefined, raw: string | number, pct: number) => {
  const xp = toXpValue(String(raw ?? ""), !!f?.pointOnly);
  if (!(pct > 0)) return f?.pointOnly ? xpToPoint(xp) : xp;
  const sale = Math.max(0, Math.floor((xp * (100 - pct)) / 100));
  return f?.pointOnly ? Math.floor(sale / POINT_RATE) : sale;
};

// 📌 기간제 — 값을 매긴 기간만 판매 목록에 올린다. 기간제 + 무제한이면 무제한(days 0)을 나란히 붙인다
//    값은 입력칸 단위 그대로다(빙옥 전용이면 빙옥) — 서버로 보낼 때 toPayload 가 XP 로 바꾼다
const intOf = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
export const buildDurations = (f: ProductForm | null | undefined) => {
  if (!f?.timed || f.unitSale || f.type === "physical") return [];
  return [
    { days: 7, price: intOf(f.price7) },
    { days: 30, price: intOf(f.price30) },
    ...(f.withInf ? [{ days: 0, price: intOf(f.priceInf) }] : []),
  ].filter((d) => d.price > 0);
};

// 📌 저장 전 확인 — 판매 방식마다 꼭 필요한 값. 두 폼(관리자 상품 관리 · 상점 인라인)이 같은 문구로 막는다. 문제가 없으면 ""
export const saleModeError = (f: ProductForm | null | undefined) => {
  if (!f) return "";
  const mode = f.type === "physical" ? "forever" : saleModeOf(f);
  if (mode === "forever" || mode === "unit") return intOf(f.price) > 0 ? "" : "가격을 입력해 주세요.";
  if (!(intOf(f.price7) > 0 || intOf(f.price30) > 0)) return "기간 가격(7일 · 30일)을 하나 이상 입력해 주세요.";
  if (mode === "both" && !(intOf(f.priceInf) > 0)) return "무제한 가격을 입력해 주세요.";
  return "";
};

// 📌 저장할 정가(price) — 무제한 · 1개 단위는 입력한 정가. 기간제는 따로 입력하지 않는다:
//    상점 카드가 크게 거는 값(무제한, 없으면 가장 긴 기간 — lib/shopPricing cardPick)을 표시 · 정렬 기준가로 넣는다
export const basePriceOf = (f: ProductForm) => {
  const list = buildDurations(f);
  if (!list.length) return f.price;
  const inf = list.find((d) => d.days === 0);
  const longest = list.filter((d) => d.days > 0).sort((a, b) => b.days - a.days)[0];
  return String((inf || longest)?.price ?? f.price);
};

// 유형을 바꾸면 그 유형에 없는 설정을 함께 끈다 — 감춰진 채로 저장되면 안 된다.
//   기프트카드는 기간 개념이 없고, 권한은 역할이 곧 디스코드 기능이라 시즌에 떼면 기능이 사라진다.
//   📌 새로 만드는 상품은 기프트카드로 바꾸면 빙옥 전용을 켜 두고(끌 수 있다), 기프트카드에서 다른 유형으로 옮기면 끈다.
//      그 밖의 유형끼리 옮길 때와 저장된 상품은 손대지 않는다(직접 켠 값을 지우지 않게)
const autoPointOnly = (f: ProductForm, v: string): ProductForm =>
  f.id || f.type === v ? f : v === "physical" ? setPointOnly(f, true) : f.type === "physical" ? setPointOnly(f, false) : f;
export const pickType = (f: ProductForm, v: string): ProductForm => {
  const base = autoPointOnly(f, v);
  const roleId = v === "physical" || v === "cosmetic" ? "" : f.roleId;
  return {
    ...base,
    type: v,
    roleId,
    timed: v === "physical" ? false : f.timed,
    withInf: v === "physical" ? false : f.withInf,
    detachOnSeason: v === "physical" || v === "perk" || v === "cosmetic" ? false : f.detachOnSeason,
    // 1개 단위는 역할 없는 아이템 · 꾸미기만 — 다른 유형으로 옮기면 끈다
    unitSale: f.unitSale && unitSaleAllowed(v, roleId),
  };
};

// 등록된 아이템을 고르면 표기 필드를 채우고 잠근다. 가격·기간·할인·재고·판매·정렬은 그대로 둔다.
//   상품 이미지(imageUrl)는 상품 고유 값이라 덮지 않는다 — 아이템 이미지는 itemImageUrl 로만 따라온다.
export const applyItem = (f: ProductForm, item: any): ProductForm => {
  const type = isItemType(item?.type) ? item.type : "item";
  // 유형이 바뀌면 새 상품의 빙옥 전용 기본값도 pickType 과 같이 따라간다
  const base = autoPointOnly(f, type);
  return {
    ...base,
    itemId: String(item?._id || ""),
    itemImageUrl: item?.imageUrl || "",
    name: item?.name || "",
    description: item?.description || "",
    icon: item?.icon || "",
    color: item?.color || "",
    type,
    roleId: item?.roleId || "",
    roleName: item?.roleName || "",
    detachOnSeason: type === "role" ? !!item?.detachOnSeason : false,
    timed: type === "physical" ? false : f.timed,
    withInf: type === "physical" ? false : f.withInf,
    // 역할이 연결된 아이템 · 1개 단위가 안 되는 유형이면 끈다
    unitSale: f.unitSale && unitSaleAllowed(type, item?.roleId || ""),
  };
};

// 직접 설정으로 되돌린다 — 값은 남겨 두어 그 자리에서 고쳐 쓸 수 있게 한다 (아이템 이미지 스냅샷만 비운다)
export const unlinkItem = (f: ProductForm): ProductForm => ({ ...f, itemId: "", itemImageUrl: "" });

// 서버로 보낼 본문 — 등록된 아이템이면 서버가 표기를 다시 복사하므로 여기 값은 참고용이다 (imageUrl 은 항상 이 값이 저장된다)
//    📌 가격은 늘 XP 로 보낸다 — 빙옥 전용이면 입력칸(빙옥) × 10,000. 서버도 10,000 의 배수로 한 번 더 맞춘다
export const toPayload = (f: ProductForm, roleName: string) => ({
  ...f,
  pointOnly: !!f.pointOnly,
  backdrop: isBackdropKey(f.backdrop) ? f.backdrop : "",
  // 1개 단위 — 못 고르는 폼(역할 · 유형)이면 끈다. 기간제 가격표는 buildDurations 가 비운다(timed 가 꺼져 있다)
  unitSale: !!f.unitSale && unitSaleOk(f),
  maxPerOrder: f.unitSale ? clampPerOrder(f.maxPerOrder) : 0,
  // 기간제는 정가 칸이 없다 — 카드 기준가(무제한, 없으면 가장 긴 기간)를 넣는다(basePriceOf)
  price: String(toXpValue(basePriceOf(f), !!f.pointOnly) || ""),
  roleName: roleName || f.roleName || "",
  durations: buildDurations(f).map((d) => ({ ...d, price: toXpValue(String(d.price), !!f.pointOnly) })),
  // 입력칸 값은 KST 벽시계 — 서버가 헷갈리지 않게 시간대를 붙여 보낸다
  //    "23:59까지" 가 그 1분이 끝날 때까지 되도록 59초로 보낸다
  discountUntil: f.discountUntil ? `${f.discountUntil}:59+09:00` : "",
});

// 저장된 시각(ISO) → datetime-local 입력값(KST)
export function toKstInput(v: any): string {
  if (!v) return "";
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 16);
}
