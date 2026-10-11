"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CART_KEY, shopKeyOf, readShopList, writeShopList } from "./shopStore";

// 📌 상품 카드(ProductCard)의 장바구니 단추 — 2026-10-11 운영자 "장바구니 단추 ㄱ"(10/5 A안).
//    카드가 혼자 담고 빼므로 저장 · 알림 · 보유 · 토스트를 여기 한 곳에 둔다(카드는 상점 목록 · 홈 · 상품 상세의 다른 상품이 같이 쓴다).
//    📌 장바구니는 계정마다(./shopStore — iglooShopCart:<id>). 바꾸면 storage 이벤트를 이 탭에도 쏜다 —
//       다른 탭은 브라우저가 같은 이벤트를 쏘므로, 듣는 쪽(ArcticStoreBar · 카드끼리 · onCartChange 를 붙인 화면)은 한 갈래로 듣는다.
export type CartRow = { itemId: string; qty: number; days?: number };

// 이 계정 장바구니가 바뀌면 fn — 다른 탭(브라우저) · 이 탭(announceCart) 모두. 돌려주는 함수로 듣기를 끝낸다.
//    장바구니를 state 로 들고 있는 화면은 이걸 붙여 다시 읽으면 카드에서 담은 것이 배지 · 목록에 바로 보인다
export function onCartChange(uid: string, fn: () => void) {
  if (typeof window === "undefined" || !uid) return () => {};
  const key = shopKeyOf(CART_KEY, uid);
  const h = (e: StorageEvent) => { if (e.key == null || e.key === key) fn(); };
  window.addEventListener("storage", h);
  return () => window.removeEventListener("storage", h);
}

export function announceCart(uid: string) {
  if (typeof window === "undefined" || !uid) return;
  try { window.dispatchEvent(new StorageEvent("storage", { key: shopKeyOf(CART_KEY, uid) })); } catch {}
}

// 담겨 있으면 빼고, 없으면 담는다 — 저장소를 그때 다시 읽어서(다른 화면 · 탭이 바꾼 것을 덮지 않게). 담았으면 true
export function toggleCartRow(uid: string, row: CartRow) {
  if (!uid) return false;
  const cur = readShopList<CartRow>(CART_KEY, uid);
  const has = cur.some((c) => String(c?.itemId) === row.itemId);
  writeShopList(CART_KEY, uid, has ? cur.filter((c) => String(c?.itemId) !== row.itemId) : [...cur, row]);
  announceCart(uid);
  return !has;
}

// 저장된 원문(문자열) — 같은 값이면 같은 스냅숏이라 다시 그리지 않는다. 읽기만 한다(옛 키 옮기기는 화면들이 처음 읽을 때 한다)
const readRaw = (uid: string) => {
  try { return localStorage.getItem(shopKeyOf(CART_KEY, uid)) || ""; } catch { return ""; }
};
export function useCartRaw(uid: string, on: boolean) {
  const sub = useCallback((fn: () => void) => (on && uid ? onCartChange(uid, fn) : () => {}), [uid, on]);
  return useSyncExternalStore(sub, () => (on && uid ? readRaw(uid) : ""), () => "");
}
export const rawHas = (raw: string, id: string) => {
  if (!raw || !id) return false;
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) && v.some((c) => !!c && typeof c === "object" && String((c as { itemId?: unknown }).itemId) === id);
  } catch {
    return false;
  }
};

// 📌 보유 — 카드는 구매 목록을 모른다. 카드들이 한 번만 받아 나눠 본다(/api/shop/purchase — owned.ts 가 보는 그 목록).
//    카드가 하나도 안 남으면(다른 화면으로 옮김) 버린다 — 결제하고 돌아오면 새로 받는다. 실패면 빈 목록(막지 않는다 — 결제 API 가 다시 본다)
type Orders = { uid: string; rows: unknown[] | null }; // rows null = 받는 중
let held: Orders | null = null;
const orderSubs = new Set<() => void>();
let dropTimer: ReturnType<typeof setTimeout> | null = null;
const emitOrders = () => orderSubs.forEach((f) => f());
function loadOrders(uid: string) {
  if (held && held.uid === uid) return;
  const mine: Orders = { uid, rows: null };
  held = mine;
  fetch("/api/shop/purchase", { cache: "no-store" })
    .then((r) => r.json())
    .then((d) => (d?.success && Array.isArray(d.data) ? d.data : []))
    .catch(() => [])
    .then((rows: unknown[]) => {
      if (held !== mine) return;
      held = { uid, rows };
      emitOrders();
    });
}
export function useCardOrders(uid: string, on: boolean) {
  const sub = useCallback((fn: () => void) => {
    if (!on || !uid) return () => {};
    if (dropTimer) { clearTimeout(dropTimer); dropTimer = null; }
    orderSubs.add(fn);
    loadOrders(uid);
    return () => {
      orderSubs.delete(fn);
      // 목록이 다시 그려지며 카드가 한꺼번에 바뀌는 순간(탭 · 필터)에는 버리지 않는다 — 다음 틱에도 아무도 없을 때만
      if (!orderSubs.size && !dropTimer) dropTimer = setTimeout(() => { dropTimer = null; if (!orderSubs.size) held = null; }, 0);
    };
  }, [uid, on]);
  return useSyncExternalStore(sub, () => (on && uid && held && held.uid === uid ? held.rows : null), () => null);
}

// 📌 토스트 — 카드마다 따로 띄우면 연달아 누를 때 겹친다. 한 장만 두고, 마지막에 누른 카드(owner)가 그린다
type Toast = { owner: string; msg: string; n: number };
let toast: Toast | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const toastSubs = new Set<() => void>();
const emitToast = () => toastSubs.forEach((f) => f());
export function flashCartToast(owner: string, msg: string) {
  toast = { owner, msg, n: (toast?.n || 0) + 1 };
  if (toastTimer) clearTimeout(toastTimer);
  const mine = toast;
  toastTimer = setTimeout(() => { if (toast === mine) { toast = null; emitToast(); } }, 1800);
  emitToast();
}
const subToast = (fn: () => void) => { toastSubs.add(fn); return () => { toastSubs.delete(fn); }; };
export function useCartToast(owner: string) {
  return useSyncExternalStore(subToast, () => (toast && toast.owner === owner ? toast : null), () => null);
}
