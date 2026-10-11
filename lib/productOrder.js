// 📌 상품 순서 · 묶음(2026-10-11 운영자 「상품 정리 B안」) — 순수 함수(DB · 화면 없음). 상품 저장 API(app/api/shop/items)와 상점 관리 › 상품(app/admin/shop/page.tsx)이 같이 쓴다.
//
//    상품 순서는 상품마다 따로(ShopItem.sortOrder = 상점 노출 순서). 묶음은 아이템에서 정한다 — 상품의 그룹 = 연결 아이템의 그룹,
//    세트 = 첫 구성 아이템의 그룹(세트가 그 아이템 상품 바로 뒤에 서도 그룹 덩어리가 끊기지 않게). 상위 그룹도 아이템 것 그대로(lib/itemOrder.js parentOf).
//    규칙 — 같은 그룹 상품은 늘 붙어 있다(목록 순서 = 상점 순서). 같은 상위의 그룹 덩어리도 이어진다(lib/itemOrder.js normalizeOrder · nestParents).
//    「아이템 순서대로」(syncProductOrder) — 연결 상품은 아이템 순서대로, 세트는 첫 구성 아이템 상품 바로 뒤, 아이템 없는 상품은 지금 차례로 맨 뒤.
//
//    product: { _id | id, itemId?, type?, bundle?: [{ itemId }] } · items: 아이템 순서대로 [{ id | _id, group }]
import { normalizeOrder, nestParents } from "./itemOrder.js";

const BUNDLE = "bundle";
/** @param {any} v */
const sid = (v) => String(v?._id ?? v?.id ?? "");
/** @param {any} p */
const firstComp = (p) => (p?.type === BUNDLE && Array.isArray(p?.bundle) && p.bundle[0] ? String(p.bundle[0].itemId || "") : "");
/** 상품이 따르는 아이템 id — 연결 아이템, 세트면 첫 구성 아이템("" = 없음) @param {any} p */
export const anchorItemOf = (p) => (p?.type === BUNDLE ? firstComp(p) : String(p?.itemId || ""));

/**
 * 아이템 표(id → { group, at }) — at = 아이템 순서 자리
 * @param {any[]} items 아이템 순서대로
 */
export function itemIndexOf(items) {
  /** @type {Map<string, { group: string, at: number }>} */
  const m = new Map();
  (Array.isArray(items) ? items : []).forEach((it, at) => m.set(sid(it), { group: typeof it?.group === "string" ? it.group : "", at }));
  return m;
}

/**
 * 상품의 그룹("" = 묶지 않음) — 연결 아이템(세트는 첫 구성 아이템)의 그룹
 * @param {any} p @param {Map<string, { group: string, at: number }>} idx
 */
export const productGroupOf = (p, idx) => idx.get(anchorItemOf(p))?.group || "";

/**
 * 순서 계산용 줄 — [{ id, group, sortOrder }] (지금 순서 그대로)
 * @param {any[]} products 지금 순서 @param {Map<string, { group: string, at: number }>} idx
 */
export const productRowsOf = (products, idx) =>
  (Array.isArray(products) ? products : []).map((p) => ({ id: sid(p), group: productGroupOf(p, idx), sortOrder: p?.sortOrder }));

/**
 * 규칙에 맞춘 순서(같은 그룹 · 같은 상위가 이어지게) — 받은 줄 차례에서 덩어리만 모은다. 줄 객체는 그대로.
 * pin = 방금 끌어 옮긴 그룹(상위 안 그룹 하나를 밖으로 끌면 상위 전체가 딸려가지 않고 형제 곁으로 — 아이템 순서와 같다)
 * @template {{ id: string, group?: string }} T
 * @param {T[]} rows @param {import("./itemOrder.js").ParentMap} parentOf @param {string} [pin]
 * @returns {T[]}
 */
export const normalizeProductOrder = (rows, parentOf, pin = "") => nestParents(normalizeOrder(rows), parentOf, pin);

/**
 * 「아이템 순서대로」 — 연결 상품은 아이템 순서대로(같은 아이템의 상품끼리는 지금 차례), 세트는 첫 구성 아이템 상품 바로 뒤,
 * 아이템 없는 상품(연결 아이템이 지워진 것 포함)은 지금 차례로 맨 뒤. 그 뒤 규칙(덩어리)으로 맞춘다 — 아이템이 이미 덩어리 순서라 대개 그대로다
 * @param {any[]} products 지금 순서 @param {any[]} items 아이템 순서대로 @param {import("./itemOrder.js").ParentMap} parentOf
 * @returns {{ id: string, group: string, sortOrder?: number }[]}
 */
export function syncProductOrder(products, items, parentOf) {
  const idx = itemIndexOf(items);
  const rows = productRowsOf(products, idx);
  const list = Array.isArray(products) ? products : [];
  const keyed = rows.map((r, i) => {
    const p = list[i];
    const a = idx.get(anchorItemOf(p));
    return { r, i, at: a ? a.at : Infinity, set: p?.type === BUNDLE ? 1 : 0 };
  });
  // 아이템 없는 상품끼리는 세트 · 아닌 것 가리지 않고 지금 차례
  keyed.sort((x, y) => (x.at === y.at ? 0 : x.at < y.at ? -1 : 1) || (x.at !== Infinity ? x.set - y.set : 0) || x.i - y.i);
  return normalizeProductOrder(keyed.map((k) => k.r), parentOf);
}
