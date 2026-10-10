"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ICON_PATHS } from "../../components/Icons";
import { openLogin, LOGIN_CTX } from "../../components/LoginPrompt";
import { isTimed, durationOptions, durationLabel, cardPick, isPointOnly, affordFor } from "@/lib/shopPricing";
import { isAdminName } from "@/lib/admins";
import ArcticStoreBar from "../ArcticStoreBar";
import ProductCard from "../ProductCard";
import { ownedIdsOf, renewableIdsOf, bundlePickOf } from "../owned";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";
import { CART_KEY, WISH_KEY, CHECKOUT_KEY, readShopList, writeShopList, useShopUid } from "../shopStore";
import { isBundle } from "@/lib/bundle";
import { useRouter } from "next/navigation";
import { useGuestShopLogin } from "../useGuestShopLogin";

// 📌 찜한 상품 — 상점 메인의 팝업 패널을 따로 뗀 페이지.
//    상품 카드는 상점 목록과 같은 모양(그림 · 유형 · 이름 · 가격 · 찜)에, 찜 목록답게 아래에 '담기' 한 줄을 더한다.
//    찜 · 장바구니는 상점 메인과 같은 저장소(iglooShopWish · iglooShopCart — 계정마다, ../shopStore)를 쓴다 — 여기서 바꾸면 메인에도 그대로다.
type CartRow = { itemId: string; qty: number; days?: number };

export default function WishPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isAdminName(session?.user?.name);
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wish, setWish] = useState<string[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  // 내 빙옥 — 빙옥 전용 상품은 모자라면 담기를 잠근다 (지갑을 못 읽었으면 null — 잠그지 않는다)
  const [myPoint, setMyPoint] = useState<number | null>(null);

  // 📌 2026-10-04 로그인 전 — 빈 찜 목록 위에 로그인 창(ARCTIC · 구매), 닫으면 상점 메인으로 (../useGuestShopLogin)
  useGuestShopLogin();

  // 저장소를 읽기 전에는 쓰지 않는다 (빈 값으로 덮지 않게) — 📌 2026-10-04 계정마다(../shopStore), 읽은 계정과 지금 계정이 같을 때만 저장
  const { uid: shopUid, ready: shopReady } = useShopUid();
  const [shopOwner, setShopOwner] = useState<string | null>(null);
  const ready = shopOwner !== null;
  useEffect(() => {
    if (!shopReady) return;
    setWish(readShopList<string>(WISH_KEY, shopUid));
    setCart(readShopList<CartRow>(CART_KEY, shopUid));
    setShopOwner(shopUid);
  }, [shopUid, shopReady]);
  const owns = shopOwner !== null && shopOwner === shopUid;
  useEffect(() => { if (owns) writeShopList(WISH_KEY, shopUid, wish); }, [wish, owns, shopUid]);
  useEffect(() => { if (owns) writeShopList(CART_KEY, shopUid, cart); }, [cart, owns, shopUid]);

  // 📌 장바구니 정리 기준 — 상품 목록을 제대로 받아 왔을 때의 id 들. 받기 전·실패면 null
  const [validIds, setValidIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : [];
        setItems(list);
        // 📌 세트(lib/bundle.js)는 장바구니에 둘 수 없다(바로 구매만) — 기준에서 빼 두면 아래 정리가 담겨 있던 세트를 뺀다
        if (d?.success && Array.isArray(d?.data)) setValidIds(new Set(list.filter((i: { type?: string }) => !isBundle(i)).map((i: { _id: string }) => String(i._id))));
      })
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
    if (isLoggedIn) {
      fetch("/api/shop/purchase", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d?.success) setOrders(d.data); })
        .catch(() => {});
      fetch("/api/xp/me", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d?.success) setMyPoint(d.data.point ?? 0); })
        .catch(() => {});
    }
  }, [status, isAdmin, isLoggedIn]);

  // 📌 목록에 없는(삭제·숨김) 상품 · 같은 상품 중복은 장바구니에서 뺀다 — 안 그러면 개수 배지에 유령 "1" 이 남는다.
  //    목록을 제대로 받았을 때만 정리한다 (실패로 장바구니를 날리지 않게). 저장은 위 저장 effect 가 한다.
  useEffect(() => {
    if (!ready || !validIds) return;
    setCart((prev) => {
      const seen = new Set<string>();
      const next = prev.filter((c) => {
        if (!c || !validIds.has(String(c.itemId)) || seen.has(String(c.itemId))) return false;
        seen.add(String(c.itemId));
        return true;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [ready, validIds]);

  // 서버와 같은 기준 — 만료 · 환불 건은 보유가 아니다 (owned.ts).
  //    기간제만 가진 상품은 다시 담을 수 있다(기간제는 연장 · 무제한은 업그레이드) — 막는 건 무제한 보유뿐
  const owned = useMemo(() => ownedIdsOf(orders, items), [orders, items]);
  const renewable = useMemo(() => renewableIdsOf(orders, items), [orders, items]);
  const locked = (id: string) => owned.has(id) && !renewable.has(id);
  // 찜한 순서대로 — 최근에 찜한 것이 앞에 오게
  const rows = useMemo(() => [...wish].reverse().map((id) => items.find((i) => i._id === id)).filter(Boolean), [wish, items]);

  const say = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1800);
  };
  const unwish = (it: any) => {
    setWish((prev) => prev.filter((x) => x !== it._id));
    say(`${it.name} 상품의 찜을 해제했습니다`);
  };
  // 📌 빙옥 전용 상품 — 카드에 걸린 값(담길 값)을 빙옥으로 낼 수 없으면 담기 잠금
  //    세트는 이 사람이 낼 값(가진 구성만큼 깎은 값 — owned.ts bundlePickOf)으로
  const pointShort = (it: any) => isLoggedIn && isPointOnly(it) && myPoint != null && !affordFor(it, 0, myPoint)(isBundle(it) ? (bundlePickOf(orders, it, items)?.price ?? 0) : (cardPick(it)?.price ?? 0));
  // 📌 세트는 장바구니에 넣지 않는다(장바구니 결제가 받지 않는다) — 담기 대신 바로 구매: 이 세트 하나만 결제 화면으로 넘긴다(상품 상세의 구매와 같다)
  const buyNow = (it: { _id: string }) => {
    if (!isLoggedIn) return openLogin({ context: LOGIN_CTX.arcticBuy });
    if (locked(it._id)) return say("이미 구매하신 상품입니다");
    if (pointShort(it)) return say("빙옥이 부족합니다");
    writeShopList(CHECKOUT_KEY, shopUid, [{ itemId: it._id, qty: 1, days: 0 }]);
    router.push("/arctic/checkout");
  };
  const toggleCart = (it: any) => {
    if (!isLoggedIn) return openLogin({ context: LOGIN_CTX.arcticBuy });
    if (isBundle(it)) return buyNow(it);
    if (locked(it._id)) return say("이미 구매하신 상품입니다");
    if (cart.some((c) => c.itemId === it._id)) {
      setCart((prev) => prev.filter((c) => c.itemId !== it._id));
      return say(`${it.name} 상품을 장바구니에서 뺐습니다`);
    }
    if (pointShort(it)) return say("빙옥이 부족합니다");
    // 카드에 보이는 기간(기본 무제한)으로 담는다 — 보이는 값과 담기는 값이 같게
    const days = isTimed(it) ? (cardPick(it)?.days ?? durationOptions(it)[0]?.days ?? 0) : 0;
    setCart((prev) => [...prev, { itemId: it._id, qty: 1, days }]);
    say(`${it.name}${days > 0 ? ` (${durationLabel(days)})` : ""} ${days > 0 && renewable.has(it._id) ? "연장을" : "상품을"} 장바구니에 담았습니다`);
  };

  // 개수는 상품 목록에 있는 것만 — 저장소 원본을 세면 장바구니 화면엔 없는 상품까지 센다
  const cartCount = useMemo(
    () => cart.filter((c) => items.some((i) => i._id === c.itemId)).reduce((n, c) => n + (c.qty || 1), 0),
    [cart, items]
  );

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      <ArcticStoreBar crumbs={[{ label: "찜한 상품" }]} active="wish" cartCount={cartCount} wishCount={wish.length} />

      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">
        <div className="flex items-baseline gap-3 mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter">찜한 상품</h1>
          {wish.length > 0 && <span className="text-[15px] font-black text-[#e91e3f] tabular-nums">{wish.length}</span>}
        </div>

        {!loaded ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-8 md:gap-y-10">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-square rounded-md bg-[#f2f2f2] animate-pulse"></div>)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-24 flex flex-col items-center text-center">
            <span aria-hidden className="w-14 h-14 rounded-full bg-[#f2f2f2] flex items-center justify-center text-[#a3a3a3]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} /></svg>
            </span>
            <p className="mt-5 text-[15px] font-black text-[#131313]">찜한 상품이 없습니다</p>
            <Link href="/arctic?type=all" className="mt-5 h-10 px-5 inline-flex items-center rounded-full bg-[#131313] hover:bg-black text-white text-[13px] font-bold transition-colors">
              상품 둘러보기
            </Link>
          </div>
        ) : (
          // 📌 칸 수는 상점 목록과 같은 기준(카드 폭 약 220~230px) — 폰 2 · 태블릿 3 · lg 4 (본문 폭이 max-w-5xl 이라 4열이면 232px)
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 sm:gap-x-4 gap-y-8 md:gap-y-10">
            {rows.map((it: any) => {
              const soldOut = it.stock === 0;
              const has = locked(it._id);
              // 세트는 장바구니에 없다 — 담기 자리가 바로 구매
              const bundle = isBundle(it);
              const inCart = !bundle && cart.some((c) => c.itemId === it._id);
              const short = !inCart && pointShort(it);
              // 상점 카드와 같은 카드(ProductCard) — 찜 목록이라 하트는 늘 채워져 있고, 누르면 찜 해제
              return (
                <ProductCard key={it._id} it={it} href={`/arctic/item/${it._id}`} pick={bundle ? bundlePickOf(orders, it, items) : undefined} wished onWish={() => unwish(it)} wishLabel="찜 해제">
                  {/* 찜 목록에서는 바로 담을 수 있게 — 다시 누르면 뺀다 */}
                  <button
                    type="button"
                    onClick={() => toggleCart(it)}
                    disabled={has || soldOut || short}
                    className={`mt-3 h-9 rounded-full text-[12px] font-bold transition-colors disabled:cursor-default ${
                      has || soldOut || short ? "bg-[#f2f2f2] text-[#a3a3a3]" : inCart ? "bg-[#131313] text-white hover:bg-black" : "border border-[#a3a3a3] text-[#131313] hover:border-[#131313]"
                    }`}
                  >
                    {has ? "보유 중" : soldOut ? "품절" : inCart ? "담김 · 빼기" : short ? "빙옥 부족" : bundle ? "바로 구매" : "장바구니에 담기"}
                  </button>
                </ProductCard>
              );
            })}
          </div>
        )}
      </section>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-10 z-[150] px-5 py-3 rounded-full bg-[#131313] text-white text-[12px] font-bold shadow-[0_18px_44px_-14px_rgba(0,0,0,0.4)] pointer-events-none">
          {toast}
        </div>
      )}

      <ArcticFooter />
      <ArcticDock activeKey="wish" cartCount={cartCount} wishCount={wish.length} />
    </div>
  );
}
