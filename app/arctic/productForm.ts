// 📌 상품 폼 공용 로직 — 상점 인라인 폼(ArcticShopBody)과 관리자 상품 화면(admin/shop)이 함께 쓴다.
//    두 폼이 따로 굴러가면 "등록된 아이템 선택" 같은 규칙이 한쪽에서만 고쳐져 조용히 갈라진다.
//    화면(JSX)은 각자 두되 상태 모양·기간 계산·유형 전환·아이템 적용은 여기 한 곳에서 정한다.

import { isItemType } from "@/lib/items";
import { POINT_RATE, xpToPoint, pointToXp } from "@/lib/pointRate";

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
  type: string;
  roleId: string;
  roleName: string;
  detachOnSeason: boolean;
  // 📌 빙옥 전용 결제 — 켜면 가격 칸(price · price7 · price30 · priceInf)은 빙옥 단위다. 저장할 때 ×1,000 해 XP 로 보낸다(toPayload)
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
  timed: boolean;
  price7: string;
  price30: string;
  priceInf: string;
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
  price7: "",
  price30: "",
  priceInf: "",
};

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
// 저장값(XP) → 입력칸 값. 빙옥 전용이면 빙옥(저장값은 1,000 의 배수라 끝전이 없다 — 옛 값은 올림)
const toField = (xp: any, pointOnly: boolean) => {
  if (xp == null || xp === "") return "";
  return String(pointOnly ? xpToPoint(xp) : xp);
};
// 입력칸 값 → 저장할 XP
const toXpValue = (v: string, pointOnly: boolean) => {
  const n = Math.max(0, Math.floor(Number(v) || 0));
  return pointOnly ? pointToXp(n) : n;
};

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
  timed: Array.isArray(it.durations) && it.durations.length > 0,
  price7: toField(it.durations?.find((d: any) => d.days === 7)?.price, !!it.pointOnly),
  price30: toField(it.durations?.find((d: any) => d.days === 30)?.price, !!it.pointOnly),
  priceInf: toField(it.durations?.find((d: any) => d.days === 0)?.price, !!it.pointOnly),
});

// 📌 빙옥 전용 켜기 · 끄기 — 입력해 둔 값은 같은 값어치로 바꿔 둔다(XP → 빙옥은 올림, 빙옥 → XP 는 ×1,000)
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
//    일반: "빙옥으로 내면 N 빙옥 · 1 빙옥 = 1,000 XP" · 빙옥 전용: "N 빙옥 = N×1,000 XP 상당"
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
  const list = ([["price7", "7일"], ["price30", "30일"], ["priceInf", "무제한"]] as const)
    .map(([k, l]) => ({ l, n: Math.max(0, Math.floor(Number(f[k]) || 0)) }))
    .filter((x) => x.n > 0);
  if (!list.length) return "";
  return f.pointOnly
    ? `${list.map((x) => `${x.l} ${pointToXp(x.n).toLocaleString()}`).join(" · ")} XP 상당`
    : `빙옥으로 내면 ${list.map((x) => `${x.l} ${xpToPoint(x.n).toLocaleString()}`).join(" · ")} 빙옥`;
};
// 할인 뒤 판매가 — 입력칸 단위 그대로. 빙옥 전용은 XP 로 할인한 뒤 올림(상점 · 결제와 같은 계산 — lib/shopPricing salePrice + xpToPoint)
export const formSalePrice = (f: ProductForm | null | undefined, raw: string | number, pct: number) => {
  const xp = toXpValue(String(raw ?? ""), !!f?.pointOnly);
  const sale = Math.max(0, Math.floor((xp * (100 - pct)) / 100));
  return f?.pointOnly ? xpToPoint(sale) : sale;
};

// 📌 기간제 — 값을 매긴 기간만 판매 목록에 올린다 (days 0 = 무제한, 기간 옵션과 나란히 팔 수 있다)
//    값은 입력칸 단위 그대로다(빙옥 전용이면 빙옥) — 서버로 보낼 때 toPayload 가 XP 로 바꾼다
export const buildDurations = (f: ProductForm | null | undefined) => {
  if (!f?.timed || f.type === "physical") return [];
  return [
    { days: 7, price: Math.max(0, Math.floor(Number(f.price7) || 0)) },
    { days: 30, price: Math.max(0, Math.floor(Number(f.price30) || 0)) },
    { days: 0, price: Math.max(0, Math.floor(Number(f.priceInf) || 0)) },
  ].filter((d) => d.price > 0);
};

// 유형을 바꾸면 그 유형에 없는 설정을 함께 끈다 — 감춰진 채로 저장되면 안 된다.
//   기프트카드는 기간 개념이 없고, 권한은 역할이 곧 디스코드 기능이라 시즌에 떼면 기능이 사라진다.
//   📌 새로 만드는 상품은 기프트카드로 바꾸면 빙옥 전용을 켜 두고(끌 수 있다), 기프트카드에서 다른 유형으로 옮기면 끈다.
//      그 밖의 유형끼리 옮길 때와 저장된 상품은 손대지 않는다(직접 켠 값을 지우지 않게)
const autoPointOnly = (f: ProductForm, v: string): ProductForm =>
  f.id || f.type === v ? f : v === "physical" ? setPointOnly(f, true) : f.type === "physical" ? setPointOnly(f, false) : f;
export const pickType = (f: ProductForm, v: string): ProductForm => {
  const base = autoPointOnly(f, v);
  return {
    ...base,
    type: v,
    roleId: v === "physical" || v === "cosmetic" ? "" : f.roleId,
    timed: v === "physical" ? false : f.timed,
    detachOnSeason: v === "physical" || v === "perk" || v === "cosmetic" ? false : f.detachOnSeason,
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
  };
};

// 직접 설정으로 되돌린다 — 값은 남겨 두어 그 자리에서 고쳐 쓸 수 있게 한다 (아이템 이미지 스냅샷만 비운다)
export const unlinkItem = (f: ProductForm): ProductForm => ({ ...f, itemId: "", itemImageUrl: "" });

// 서버로 보낼 본문 — 등록된 아이템이면 서버가 표기를 다시 복사하므로 여기 값은 참고용이다 (imageUrl 은 항상 이 값이 저장된다)
//    📌 가격은 늘 XP 로 보낸다 — 빙옥 전용이면 입력칸(빙옥) × 1,000. 서버도 1,000 의 배수로 한 번 더 맞춘다
export const toPayload = (f: ProductForm, roleName: string) => ({
  ...f,
  pointOnly: !!f.pointOnly,
  price: String(toXpValue(f.price, !!f.pointOnly) || ""),
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
