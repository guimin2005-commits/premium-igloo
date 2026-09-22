// 📌 상품 폼 공용 로직 — 상점 인라인 폼(ArcticShopBody)과 관리자 상품 화면(admin/shop)이 함께 쓴다.
//    두 폼이 따로 굴러가면 "등록된 아이템 선택" 같은 규칙이 한쪽에서만 고쳐져 조용히 갈라진다.
//    화면(JSX)은 각자 두되 상태 모양·기간 계산·유형 전환·아이템 적용은 여기 한 곳에서 정한다.

import { isItemType } from "@/lib/items";

export type ProductForm = {
  id: string;
  // 등록된 아이템(models/Item) 참조 — "" 이면 직접 설정. 값이 있으면 표기 필드는 잠기고 서버가 다시 복사한다
  itemId: string;
  name: string;
  description: string;
  imageUrl: string;
  icon: string;
  color: string;
  type: string;
  roleId: string;
  roleName: string;
  detachOnSeason: boolean;
  price: string;
  discountPct: string;
  stock: string;
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
  name: "",
  description: "",
  imageUrl: "",
  icon: "",
  color: "",
  type: "role",
  roleId: "",
  roleName: "",
  detachOnSeason: false,
  price: "",
  discountPct: "",
  stock: "",
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

// 저장된 상품 → 폼. 기존 기간·시즌 설정을 입력칸으로 되돌린다 (안 채우면 수정 저장할 때마다 조용히 꺼진다)
export const formFromShopItem = (it: any): ProductForm => ({
  id: it._id,
  itemId: it.itemId || "",
  name: it.name || "",
  description: it.description || "",
  imageUrl: it.imageUrl || "",
  icon: it.icon || "",
  color: it.color || "",
  type: isItemType(it.type) ? it.type : "role",
  roleId: it.roleId || "",
  roleName: it.roleName || "",
  detachOnSeason: !!it.detachOnSeason,
  price: String(it.price ?? ""),
  discountPct: it.discountPct ? String(it.discountPct) : "",
  stock: it.stock < 0 || it.stock == null ? "" : String(it.stock),
  sortOrder: String(it.sortOrder || 0),
  active: it.active !== false,
  timed: Array.isArray(it.durations) && it.durations.length > 0,
  price7: String(it.durations?.find((d: any) => d.days === 7)?.price ?? ""),
  price30: String(it.durations?.find((d: any) => d.days === 30)?.price ?? ""),
  priceInf: String(it.durations?.find((d: any) => d.days === 0)?.price ?? ""),
});

// 📌 기간제 — 값을 매긴 기간만 판매 목록에 올린다 (days 0 = 무제한, 기간 옵션과 나란히 팔 수 있다)
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
export const pickType = (f: ProductForm, v: string): ProductForm => ({
  ...f,
  type: v,
  roleId: v === "physical" ? "" : f.roleId,
  timed: v === "physical" ? false : f.timed,
  detachOnSeason: v === "physical" || v === "perk" ? false : f.detachOnSeason,
});

// 등록된 아이템을 고르면 표기 필드를 채우고 잠근다. 가격·기간·할인·재고·판매·정렬은 그대로 둔다.
export const applyItem = (f: ProductForm, item: any): ProductForm => {
  const type = isItemType(item?.type) ? item.type : "item";
  return {
    ...f,
    itemId: String(item?._id || ""),
    name: item?.name || "",
    description: item?.description || "",
    imageUrl: item?.imageUrl || "",
    icon: item?.icon || "",
    color: item?.color || "",
    type,
    roleId: item?.roleId || "",
    roleName: item?.roleName || "",
    detachOnSeason: type === "role" ? !!item?.detachOnSeason : false,
    timed: type === "physical" ? false : f.timed,
  };
};

// 직접 설정으로 되돌린다 — 값은 남겨 두어 그 자리에서 고쳐 쓸 수 있게 한다
export const unlinkItem = (f: ProductForm): ProductForm => ({ ...f, itemId: "" });

// 서버로 보낼 본문 — 등록된 아이템이면 서버가 표기를 다시 복사하므로 여기 값은 참고용이다
export const toPayload = (f: ProductForm, roleName: string) => ({
  ...f,
  roleName: roleName || f.roleName || "",
  durations: buildDurations(f),
});
