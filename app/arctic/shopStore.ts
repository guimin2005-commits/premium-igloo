"use client";

import { useSession } from "next-auth/react";

// 📌 2026-10-04 장바구니 · 찜은 계정마다(운영자 확정) — 이 브라우저 저장소 키 끝에 디스코드 id 를 붙인다(iglooShopCart:<id>).
//    로그인하지 않았으면 비어 있다(배지 0) — 읽기는 [] 이고 쓰기는 하지 않는다.
//    옛 전역 키(iglooShopCart · iglooShopWish)는 이 브라우저에서 처음 로그인한 계정으로 한 번 옮기고 지운다.
//    결제로 넘기는 목록(iglooShopCheckout)도 같은 이유로 계정마다 — 다른 계정이 로그인해 결제 화면을 열면 남의 목록이 보였다.
//    상점 메인 · 상품 상세 · 장바구니 · 찜 · 결제 · 상점 줄이 모두 이 파일로 읽고 쓴다.
export const CART_KEY = "iglooShopCart";
export const WISH_KEY = "iglooShopWish";
export const CHECKOUT_KEY = "iglooShopCheckout";
type ShopKey = typeof CART_KEY | typeof WISH_KEY | typeof CHECKOUT_KEY;

export const shopKeyOf = (base: ShopKey, uid: string) => `${base}:${uid}`;

const parseList = (raw: string | null): unknown[] => {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
// 같은 상품은 한 번만 — 장바구니 줄은 itemId, 찜은 id 그대로
const idOf = (row: unknown) => String(row && typeof row === "object" ? (row as { itemId?: unknown }).itemId : row);

// 옛 전역 키 → 이 계정 키. 이 계정 키가 이미 있으면(옛 화면이 열린 탭이 뒤늦게 전역 키에 쓴 경우) 없는 상품만 뒤에 붙인다
export function migrateLegacyShop(uid: string) {
  if (!uid) return;
  try {
    for (const base of [CART_KEY, WISH_KEY] as const) {
      const legacy = localStorage.getItem(base);
      if (legacy == null) continue;
      const key = shopKeyOf(base, uid);
      const mine = localStorage.getItem(key);
      if (mine == null) {
        localStorage.setItem(key, JSON.stringify(parseList(legacy)));
      } else {
        const cur = parseList(mine);
        const seen = new Set(cur.map(idOf));
        const add = parseList(legacy).filter((r) => !seen.has(idOf(r)));
        if (add.length) localStorage.setItem(key, JSON.stringify([...cur, ...add]));
      }
      localStorage.removeItem(base);
    }
    // 옛 결제 목록은 누구 것인지 모른다 — 옮기지 않고 지운다(결제 화면은 장바구니 전체로 연다)
    localStorage.removeItem(CHECKOUT_KEY);
  } catch {}
}

// 이 계정의 목록 — 로그인 전(uid 없음)은 늘 빈 목록
export function readShopList<T>(base: ShopKey, uid: string): T[] {
  if (!uid) return [];
  migrateLegacyShop(uid);
  try {
    return parseList(localStorage.getItem(shopKeyOf(base, uid))) as T[];
  } catch {
    return [];
  }
}

// 결제로 넘긴 목록이 있는지까지 봐야 하는 곳(결제 화면)을 위해 — 없으면 null
export function readShopRaw(base: ShopKey, uid: string): string | null {
  if (!uid) return null;
  migrateLegacyShop(uid);
  try {
    return localStorage.getItem(shopKeyOf(base, uid));
  } catch {
    return null;
  }
}

export function writeShopList(base: ShopKey, uid: string, list: unknown[]) {
  if (!uid) return;
  try { localStorage.setItem(shopKeyOf(base, uid), JSON.stringify(list)); } catch {}
}

export function removeShopKey(base: ShopKey, uid: string) {
  if (!uid) return;
  try { localStorage.removeItem(shopKeyOf(base, uid)); } catch {}
}

// 지금 계정 — uid 는 로그인했을 때만(디스코드 id), ready 는 세션을 다 읽었는지(읽기 전에는 저장소를 건드리지 않는다)
export function useShopUid() {
  const { data: session, status } = useSession();
  const uid = status === "authenticated" ? String((session?.user as { id?: string } | undefined)?.id || "") : "";
  return { uid, ready: status !== "loading" };
}
