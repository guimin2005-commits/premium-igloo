"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import ItemIcon from "../../components/ItemIcon";
import { ICON_PATHS } from "../../components/Icons";
import { isTimed, durationOptions, durationLabel, durationPrice } from "@/lib/shopPricing";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { isAdminName } from "@/lib/admins";
import ArcticStoreBar from "../ArcticStoreBar";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";

// 📌 찜한 상품 — 상점 메인의 팝업 패널을 따로 뗀 페이지.
//    상품 카드는 상점 목록과 같은 모양(그림 · 유형 · 이름 · 가격 · 찜)에, 찜 목록답게 아래에 '담기' 한 줄을 더한다.
//    찜 · 장바구니는 상점 메인과 같은 저장소(iglooShopWish · iglooShopCart)를 쓴다 — 여기서 바꾸면 메인에도 그대로다.
type CartRow = { itemId: string; qty: number; days?: number };

const TypeBadge = ({ type, className = "" }: { type: string; className?: string }) => (
  <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
    {itemTypeLabel(type)}
  </span>
);

const CardArt = ({ it }: { it: any }) => {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={it.name || ""} className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
      <ItemIcon icon={it?.icon} type={it?.type} size={64} color={color} />
    </div>
  );
};

const readList = <T,>(key: string): T[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export default function WishPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isAdminName(session?.user?.name);

  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [wish, setWish] = useState<string[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [ready, setReady] = useState(false); // 저장소를 읽기 전에는 쓰지 않는다 (빈 값으로 덮지 않게)
  const [toast, setToast] = useState("");

  useEffect(() => {
    setWish(readList<string>("iglooShopWish"));
    setCart(readList<CartRow>("iglooShopCart"));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) try { localStorage.setItem("iglooShopWish", JSON.stringify(wish)); } catch {} }, [wish, ready]);
  useEffect(() => { if (ready) try { localStorage.setItem("iglooShopCart", JSON.stringify(cart)); } catch {} }, [cart, ready]);

  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
    if (isLoggedIn) {
      fetch("/api/shop/purchase", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d?.success) setOrders(d.data); })
        .catch(() => {});
    }
  }, [status, isAdmin, isLoggedIn]);

  const owned = useMemo(() => new Set(orders.filter((o) => o.status !== "cancelled").map((o) => o.itemId)), [orders]);
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
  const toggleCart = (it: any) => {
    if (!isLoggedIn) return signIn("discord");
    if (owned.has(it._id)) return say("이미 구매하신 상품입니다");
    if (cart.some((c) => c.itemId === it._id)) {
      setCart((prev) => prev.filter((c) => c.itemId !== it._id));
      return say(`${it.name} 상품을 장바구니에서 뺐습니다`);
    }
    const days = isTimed(it) ? durationOptions(it)[0]?.days ?? 0 : 0;
    setCart((prev) => [...prev, { itemId: it._id, qty: 1, days }]);
    say(`${it.name}${days > 0 ? ` (${durationLabel(days)})` : ""} 상품을 장바구니에 담았습니다`);
  };

  const cartCount = cart.reduce((n, c) => n + (c.qty || 1), 0);

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      <ArcticStoreBar crumbs={[{ label: "찜한 상품" }]} active="wish" cartCount={cartCount} wishCount={wish.length} />

      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">
        <div className="flex items-baseline gap-3 mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter">찜한 상품</h1>
          {wish.length > 0 && <span className="text-[15px] font-black text-[#e91e3f] tabular-nums">{wish.length}</span>}
        </div>

        {!loaded ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
            {rows.map((it: any) => {
              const soldOut = it.stock === 0;
              const listPrice = isTimed(it) ? (durationPrice(it, 0) ?? it.price) : it.price;
              const pct = Math.max(0, Math.min(100, Number(it.discountPct) || 0));
              const finalPrice = pct ? Math.max(0, Math.floor((Number(listPrice || 0) * (100 - pct)) / 100)) : Number(listPrice || 0);
              const has = owned.has(it._id);
              const inCart = cart.some((c) => c.itemId === it._id);
              return (
                <div key={it._id} className="group relative flex flex-col">
                  <Link href={`/arctic/item/${it._id}`} className="block relative aspect-square overflow-hidden rounded-md bg-[#f2f2f2]">
                    <CardArt it={it} />
                    {soldOut && (
                      <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="text-[12px] font-black text-[#131313] tracking-wider">품절</span>
                      </span>
                    )}
                  </Link>
                  <button onClick={() => unwish(it)} aria-label="찜 해제"
                    className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors">
                    <svg className="w-4 h-4 text-[#e91e3f]" fill="currentColor" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
                    </svg>
                  </button>
                  <Link href={`/arctic/item/${it._id}`} className="block mt-3">
                    <TypeBadge type={it.type} className="inline-block mb-1.5 px-2 py-[3px] text-[10px] leading-none align-middle" />
                    <h3 className="text-[13px] font-semibold text-[#5a5a5a] leading-snug line-clamp-2 break-keep">{it.name}</h3>
                    {pct > 0 && <s className="block mt-2 text-[11.5px] text-[#a3a3a3] tabular-nums leading-none">{Number(listPrice || 0).toLocaleString()} XP</s>}
                    <p className={`${pct > 0 ? "mt-1" : "mt-2"} text-[19px] md:text-[20px] font-black text-[#131313] tabular-nums leading-none`}>
                      {pct > 0 && <span className="mr-1.5 text-[14px] font-black text-[#e91e3f]">{pct}%</span>}
                      {finalPrice.toLocaleString()}<span className="ml-1 text-[11px] font-bold text-[#8a8a8a]">XP</span>
                    </p>
                  </Link>
                  {/* 찜 목록에서는 바로 담을 수 있게 — 다시 누르면 뺀다 */}
                  <button
                    type="button"
                    onClick={() => toggleCart(it)}
                    disabled={has || soldOut}
                    className={`mt-3 h-9 rounded-full text-[12px] font-bold transition-colors disabled:cursor-default ${
                      has || soldOut ? "bg-[#f2f2f2] text-[#a3a3a3]" : inCart ? "bg-[#131313] text-white hover:bg-black" : "border border-[#a3a3a3] text-[#131313] hover:border-[#131313]"
                    }`}
                  >
                    {has ? "보유 중" : soldOut ? "품절" : inCart ? "담김 · 빼기" : "장바구니에 담기"}
                  </button>
                </div>
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
