"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { salePrice, durationLabel } from "@/lib/shopPricing";
import ArcticHeader from "../ArcticHeader";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";

const ADMIN_USERS = ["elahw.06"];

const TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };
const TYPE_CLS: Record<string, string> = { role: "bg-[#e91e3f] text-white", perk: "bg-[#2f6fb0] text-white", physical: "bg-[#131313] text-white" };

// 📌 장바구니 페이지 — 담은 상품 확인·삭제 후 주문서로 이동
export default function CartPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 저장된 장바구니를 먼저 읽고, 그 뒤부터만 저장한다
  const [cartLoaded, setCartLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("iglooShopCart");
      if (raw) setCart(JSON.parse(raw));
    } catch {}
    setCartLoaded(true);
  }, []);
  useEffect(() => {
    if (!cartLoaded) return;
    try { localStorage.setItem("iglooShopCart", JSON.stringify(cart)); } catch {}
  }, [cart, cartLoaded]);

  useEffect(() => {
    if (status === "loading") return;
    Promise.all([
      fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([it, me]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      if (me?.success) setMyXp(me.data.xp);
    }).finally(() => setIsLoading(false));
  }, [status, isAdmin]);

  const rows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item),
    [cart, items]
  );

  // 📌 결제할 상품만 골라서 진행 — 기본은 전체 선택
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected(rows.map((r) => r.itemId)); }, [rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = rows.filter((r) => selected.includes(r.itemId));
  const allChecked = rows.length > 0 && picked.length === rows.length;
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelected(allChecked ? [] : rows.map((r) => r.itemId));

  const listTotal = picked.reduce((n, r) => n + ((r.days ?? 0) > 0 ? (r.item.durations?.find((d: any) => d.days === r.days)?.price ?? r.item.price) : r.item.price) * r.qty, 0);
  const total = picked.reduce((n, r) => n + salePrice(r.item, r.days) * r.qty, 0);
  const discount = listTotal - total;
  const enoughXp = isAdmin || (myXp != null && myXp >= total);
  const canCheckout = picked.length > 0 && enoughXp;

  // 선택한 항목만 결제로 넘긴다 (나머지는 장바구니에 남는다)
  const goCheckout = () => {
    try { localStorage.setItem("iglooShopCheckout", JSON.stringify(picked.map((r) => ({ itemId: r.itemId, qty: r.qty, days: r.days || 0 })))); } catch {}
  };

  const removeItem = (itemId: string) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  const clearCart = () => setCart([]);

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">장바구니를 보려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      <ArcticHeader />

      <section className="max-w-5xl mx-auto px-6 pt-10 pb-24">
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-5 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          계속 쇼핑하기
        </Link>

        <div className="flex items-baseline justify-between gap-4 mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter">
            장바구니 {rows.length > 0 && <span className="text-[#e91e3f]">{rows.length}</span>}
          </h1>
        </div>

        {rows.length === 0 ? (
          <div className="py-24 text-center break-keep bg-white rounded-2xl border border-[#e2e0dc]">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f5f3f0] flex items-center justify-center mb-5 text-[#c4c4c4]">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-[#131313] mb-1.5">장바구니가 비어 있습니다</p>
            <p className="text-xs text-[#8a8a8a] mb-7">마음에 드는 상품을 담아보세요.</p>
            <Link href="/shop" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
              상품 보러가기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 좌 — 담은 상품 */}
            <div className="lg:col-span-2">
              {/* 전체 선택 */}
              <div className="flex items-center justify-between px-5 py-3 mb-3 bg-white rounded-xl border border-[#e2e0dc]">
                <button onClick={toggleAll} className="flex items-center gap-2.5 text-[12px] font-bold text-[#131313]">
                  <span className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors ${
                    allChecked ? "bg-[#e91e3f] border-[#e91e3f]" : "bg-white border-[#d6d3ce]"
                  }`}>
                    {allChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  전체 선택 <span className="text-[#8a8a8a] font-medium">({picked.length}/{rows.length})</span>
                </button>
                <div className="flex items-center gap-3">
                  {picked.length > 0 && picked.length < rows.length && (
                    <span className="hidden sm:inline text-[11px] font-bold text-[#e91e3f]">선택한 {picked.length}개만 결제</span>
                  )}
                  {picked.length > 0 && picked.length < rows.length && (
                    <button onClick={() => setCart((prev) => prev.filter((c) => !selected.includes(c.itemId)))}
                      className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#c62828] transition-colors">선택 삭제</button>
                  )}
                  <button onClick={clearCart} className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#c62828] transition-colors">전체 비우기</button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden divide-y divide-[#ececea]">
                {rows.map((r) => {
                  const sp = salePrice(r.item, r.days);
                  const on = selected.includes(r.itemId);
                  const discounted = sp < r.item.price;
                  return (
                    <div key={r.itemId} className={`p-5 flex gap-4 items-center transition-colors ${on ? "" : "bg-[#fafaf9]"}`}>
                      <button onClick={() => toggleOne(r.itemId)} aria-label="선택" className="shrink-0">
                        <span className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors ${
                          on ? "bg-[#e91e3f] border-[#e91e3f]" : "bg-white border-[#d6d3ce]"
                        }`}>
                          {on && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </span>
                      </button>
                      <Link href="/shop" className="w-20 h-20 rounded-xl bg-[#eceae6] overflow-hidden shrink-0">
                        {r.item.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.item.imageUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black mb-1.5 ${TYPE_CLS[r.item.type] || TYPE_CLS.physical}`}>
                          {TYPE_LABEL[r.item.type] || "상품"}
                        </span>
                        <h3 className="text-sm font-bold text-[#131313] truncate flex items-center gap-1.5">
                        {r.item.name}
                        {(r.days ?? 0) > 0 && <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#131313] text-white text-[10px] font-black">{durationLabel(r.days)}</span>}
                      </h3>
                        {r.item.description && (
                          <p className="text-[11px] text-[#8a8a8a] truncate mt-0.5">{r.item.description}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-black text-[#131313] tabular-nums">{sp.toLocaleString()} XP</div>
                        {discounted && <div className="text-[11px] text-[#a3a3a3] line-through tabular-nums">{r.item.price.toLocaleString()} XP</div>}
                        <button onClick={() => removeItem(r.itemId)}
                          className="mt-2 text-[11px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors">
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-[#8a8a8a]">모든 상품은 1인 1개만 구매할 수 있어 수량은 조절되지 않습니다.</p>
            </div>

            {/* 우 — 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 lg:sticky lg:top-24">
                <h2 className="text-sm font-black text-[#131313] mb-5">주문 요약</h2>

                <div className="space-y-2.5 text-[13px] mb-4">
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">선택한 상품</span><span className="font-bold tabular-nums">{picked.length}개</span></div>
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 금액</span><span className="font-bold tabular-nums">{listTotal.toLocaleString()} XP</span></div>
                  {discount > 0 && (
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 할인</span><span className="font-bold text-[#e91e3f] tabular-nums">-{discount.toLocaleString()} XP</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold tabular-nums">{(myXp ?? 0).toLocaleString()} XP</span></div>
                </div>

                <div className="h-px bg-[#ececea] mb-4"></div>

                <div className="flex items-baseline justify-between mb-6">
                  <span className="text-sm font-bold text-[#131313]">예상 결제 XP</span>
                  <span className={`text-xl font-black tabular-nums ${enoughXp ? "text-[#131313]" : "text-[#c62828]"}`}>{total.toLocaleString()} XP</span>
                </div>

                <Link href="/shop/checkout"
                  onClick={(e) => { if (!canCheckout) { e.preventDefault(); return; } goCheckout(); }}
                  className={`block w-full py-4 text-center font-bold rounded-xl transition-colors ${
                    canCheckout ? "bg-[#e91e3f] text-white hover:bg-[#d01634]" : "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                  }`}>
                  {picked.length === 0 ? "상품을 선택해주세요" : !enoughXp ? "XP가 부족합니다" : "결제하러 가기"}
                </Link>

                <p className="mt-4 text-[10px] text-[#a3a3a3] leading-relaxed break-keep">
                  쿠폰은 다음 단계인 결제 화면에서 적용할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
      <ArcticFooter />
      <ArcticDock />
    </div>
  );
}
