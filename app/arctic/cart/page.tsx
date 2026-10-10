"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ArcticStoreBar from "../ArcticStoreBar";
import CardArt from "../CardArt";
import { basePrice, salePrice, durationLabel, isPointOnly, isTimed, priceText, shownPrice, priceUnit } from "@/lib/shopPricing";
import { isUnitSale, maxPerOrderOf, qtyCapOf } from "@/lib/unitSale";
import { pointToXp } from "@/lib/pointRate";
import { planPayment } from "@/lib/shopPay";
import { ITEM_TYPE_LABEL, itemTypeColor } from "@/lib/items";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";
import { isRenewal } from "../owned";
import { isBundle } from "@/lib/bundle";
import { CART_KEY, CHECKOUT_KEY, readShopList, writeShopList, useShopUid } from "../shopStore";
import { useGuestShopLogin } from "../useGuestShopLogin";

import { ADMIN_USERS } from "@/lib/admins";

// 유형 라벨 · 색 — lib/items.js 가 단일 원천
const TYPE_LABEL: Record<string, string> = ITEM_TYPE_LABEL;

// 📌 장바구니 페이지 — 담은 상품 확인·삭제 후 주문서로 이동
export default function CartPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myPoint, setMyPoint] = useState(0);
  // 내 구매 — 기간제를 가진 상품을 기간제로 담았으면 '연장'으로 표시한다 (owned.ts)
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 📌 2026-10-04 로그인 전 — 빈 장바구니 위에 로그인 창(ARCTIC · 구매), 닫으면 상점 메인으로 (../useGuestShopLogin)
  useGuestShopLogin();

  // 저장된 장바구니를 먼저 읽고, 그 뒤부터만 저장한다
  //    📌 2026-10-04 계정마다(../shopStore) — 읽은 계정과 지금 계정이 같을 때만 저장한다
  const { uid: shopUid, ready: shopReady } = useShopUid();
  const [shopOwner, setShopOwner] = useState<string | null>(null);
  const cartLoaded = shopOwner !== null;
  useEffect(() => {
    if (!shopReady) return;
    setCart(readShopList(CART_KEY, shopUid));
    setShopOwner(shopUid);
  }, [shopUid, shopReady]);
  useEffect(() => {
    if (shopOwner === null || shopOwner !== shopUid) return;
    writeShopList(CART_KEY, shopUid, cart);
  }, [cart, shopOwner, shopUid]);

  // 📌 장바구니 정리 기준 — 상품 목록을 제대로 받아 왔을 때의 id 들. 받기 전·실패면 null
  const [validIds, setValidIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    Promise.all([
      fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([it, me, ord]) => {
      const list = Array.isArray(it?.data) ? it.data : [];
      setItems(list);
      // 📌 세트(lib/bundle.js)는 장바구니에 둘 수 없다(바로 구매만) — 기준에서 빼 두면 아래 정리가 담겨 있던 세트를 뺀다
      if (it?.success && Array.isArray(it?.data)) setValidIds(new Set(list.filter((i: { type?: string }) => !isBundle(i)).map((i: { _id: string }) => String(i._id))));
      if (me?.success) { setMyXp(me.data.xp); setMyPoint(me.data.point || 0); }
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
    }).finally(() => setIsLoading(false));
  }, [status, isAdmin]);

  // 📌 목록에 없는(삭제·숨김) 상품 · 같은 상품 중복은 장바구니에서 뺀다 — 목록엔 없는데 배지만 "1" 로 남던 원인.
  //    목록을 제대로 받았을 때만 정리한다 (실패로 장바구니를 날리지 않게). 저장은 위 저장 effect 가 한다.
  //    수량은 1개 단위 상품만 1 ~ min(1회 최대, 재고) — 1개 단위가 꺼졌거나 1회 최대가 줄었으면 거기에 맞춰 줄인다(lib/unitSale.js)
  useEffect(() => {
    if (!cartLoaded || !validIds) return;
    setCart((prev) => {
      const seen = new Set<string>();
      let changed = false;
      const next = prev.filter((c) => {
        if (!c || !validIds.has(String(c.itemId)) || seen.has(String(c.itemId))) return false;
        seen.add(String(c.itemId));
        return true;
      }).map((c) => {
        const it = items.find((i) => String(i._id) === String(c.itemId));
        const q = Math.floor(Number(c.qty) || 1);
        const fit = isUnitSale(it) ? Math.min(Math.max(1, qtyCapOf(it)), Math.max(1, q)) : 1;
        if (fit === c.qty) return c;
        changed = true;
        return { ...c, qty: fit };
      });
      return next.length === prev.length && !changed ? prev : next;
    });
  }, [cartLoaded, validIds, items]);

  const [toast, setToast] = useState("");
  const flash = (t: string) => { setToast(t); setTimeout(() => setToast((cur) => (cur === t ? "" : cur)), 1800); };
  // 1개 단위 수량 조절 — 끝에 닿으면 알린다(1회 최대 · 재고)
  const stepQty = (item: any, cur: number, d: number) => {
    const next = cur + d;
    if (next < 1) return;
    const cap = Math.max(1, qtyCapOf(item));
    if (next > cap) return flash(item.stock >= 0 && item.stock < next ? (item.stock > 0 ? `재고 ${item.stock}개` : "품절") : `한 번에 ${maxPerOrderOf(item)}개까지`);
    setCart((prev) => prev.map((c) => (c.itemId === item._id ? { ...c, qty: next } : c)));
  };

  const rows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item && !isBundle(r.item)),
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

  // 정가 합 — 줄마다 고른 기간의 정가(무제한이면 무제한 옵션 값). 결제 화면과 같은 basePrice
  //    📌 빙옥 전용 줄은 따로 — 일반 줄은 XP 로, 빙옥 전용 줄은 빙옥으로 합친다(lib/shopPay planPayment — 결제 화면 · 서버와 같은 계산)
  const normal = picked.filter((r) => !isPointOnly(r.item));
  const listTotal = normal.reduce((n, r) => n + basePrice(r.item, r.days) * r.qty, 0);
  const plan = planPayment({
    lines: picked.flatMap((r) => Array.from({ length: r.qty }, () => ({ price: salePrice(r.item, r.days), pointOnly: isPointOnly(r.item) }))),
  });
  const total = plan.normalTotal;
  const discount = listTotal - total;
  const poPoint = plan.pointOnlyPoint;
  const hasPO = picked.some((r) => isPointOnly(r.item));
  // 빙옥 전용 몫이 보유 빙옥보다 크면 결제할 수 없다
  const pointShort = myXp != null && poPoint > myPoint;
  // 빙옥을 결제 화면에서 섞어 쓸 수 있다 — XP 만으로 모자라도 (빙옥 전용 몫을 뺀) 빙옥까지 합쳐 되면 결제로 보낸다
  const enoughXp = myXp != null && !pointShort && myXp + pointToXp(Math.max(0, myPoint - poPoint)) >= total;
  const canCheckout = picked.length > 0 && enoughXp;

  // 선택한 항목만 결제로 넘긴다 (나머지는 장바구니에 남는다)
  const goCheckout = () => {
    writeShopList(CHECKOUT_KEY, shopUid, picked.map((r) => ({ itemId: r.itemId, qty: r.qty, days: r.days || 0 })));
  };

  const removeItem = (itemId: string) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));
  const clearCart = () => setCart([]);

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-white min-h-screen">
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      {/* 개수는 화면에 보이는 줄 기준 — 저장소 원본을 세면 목록에 없는 상품까지 센다 */}
      <ArcticStoreBar crumbs={[{ label: "장바구니" }]} active="cart" cartCount={rows.reduce((n, r) => n + (r.qty || 1), 0)} />
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-24">

        <div className="flex items-baseline justify-between gap-4 mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter">
            {/* 개수는 수량 합 — 위 장바구니 배지와 같은 기준 */}
            장바구니 {rows.length > 0 && <span className="text-[#e91e3f]">{rows.reduce((n, r) => n + (r.qty || 1), 0)}</span>}
          </h1>
        </div>

        {rows.length === 0 ? (
          <div className="py-24 text-center break-keep bg-white rounded-2xl border border-[#ededed]">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f2f2f2] flex items-center justify-center mb-5 text-[#a3a3a3]">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-[#131313] mb-1.5">장바구니가 비어 있습니다</p>
            <p className="text-xs text-[#8a8a8a] mb-7">마음에 드는 상품을 담아보세요.</p>
            <Link href="/arctic" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
              상품 보러가기
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 좌 — 담은 상품 */}
            <div className="lg:col-span-2">
              {/* 전체 선택 */}
              <div className="flex items-center justify-between px-5 py-3 mb-3 bg-white rounded-xl border border-[#ededed]">
                <button onClick={toggleAll} className="flex items-center gap-2.5 text-[12px] font-bold text-[#131313]">
                  <span className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors ${
                    allChecked ? "bg-[#e91e3f] border-[#e91e3f]" : "bg-white border-[#ededed]"
                  }`}>
                    {allChecked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                  </span>
                  전체 선택 <span className="text-[#8a8a8a] font-medium">({picked.length}/{rows.length})</span>
                </button>
                <div className="flex items-center gap-3">
                  {picked.length > 0 && picked.length < rows.length && (
                    <span className="hidden sm:inline text-[11px] font-bold text-[#e91e3f]">선택한 {picked.reduce((n, r) => n + (r.qty || 1), 0)}개만 결제</span>
                  )}
                  {picked.length > 0 && picked.length < rows.length && (
                    <button onClick={() => setCart((prev) => prev.filter((c) => !selected.includes(c.itemId)))}
                      className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#d01634] transition-colors">선택 삭제</button>
                  )}
                  <button onClick={clearCart} className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#d01634] transition-colors">전체 비우기</button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden divide-y divide-[#ededed]">
                {rows.map((r) => {
                  const sp = salePrice(r.item, r.days);
                  const on = selected.includes(r.itemId);
                  const list = basePrice(r.item, r.days);
                  const discounted = sp < list;
                  const renew = isRenewal(orders, r.item, r.days);
                  // 상품 상세 — 기간 상품은 담은 기간으로 연다(상세는 ?days= 가 그 상품의 기간일 때만 받는다)
                  const itemHref = `/arctic/item/${r.itemId}${isTimed(r.item) ? `?days=${r.days || 0}` : ""}`;
                  // 📌 1개 단위 — 줄 값은 판매가 × 수량(빙옥 전용은 1개 값(올림) × 수량 — 결제와 같은 계산).
                  //    값 칸은 1회 최대 수량일 때의 값 폭을 미리 잡아 둔다(보이지 않는 글자) — 수량을 바꿔 자릿수가 늘어도 칸 · 이름이 밀리지 않게
                  const unit = isUnitSale(r.item);
                  const q = r.qty || 1;
                  const lineText = (xp: number, n: number) => `${(shownPrice(r.item, xp) * n).toLocaleString()} ${priceUnit(r.item)}`;
                  const capQ = unit ? Math.max(1, qtyCapOf(r.item)) : 1;
                  // 줄 합계(1회 최대 폭을 미리 잡은 칸) · 수량 조절 — PC 는 오른쪽 칸, 폰은 아래 한 줄(아래 참고)에 같은 것을 둔다
                  const lineTotal = unit && (
                    <>
                      <div className="grid justify-items-end text-base font-black text-[#131313] tabular-nums">
                        <span aria-hidden className="col-start-1 row-start-1 invisible">{lineText(sp, capQ)}</span>
                        <span className="col-start-1 row-start-1">{lineText(sp, q)}</span>
                      </div>
                      {discounted && <div className="text-[11px] text-[#a3a3a3] line-through tabular-nums">{lineText(list, q)}</div>}
                    </>
                  );
                  // 수량 조절 — 폭 고정(숫자 칸 w-7, 99까지 두 자리)
                  const stepper = unit && (
                    <span className="inline-flex items-center h-7 rounded-full border border-[#ededed] overflow-hidden">
                      <button type="button" onClick={() => stepQty(r.item, q, -1)} aria-label="수량 빼기"
                        className={`w-7 h-7 flex items-center justify-center transition-colors ${q <= 1 ? "text-[#d4d4d4] cursor-default" : "text-[#131313] hover:bg-[#f2f2f2]"}`}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M5 12h14" /></svg>
                      </button>
                      <span className="w-7 text-center text-[12px] font-black tabular-nums">{q}</span>
                      <button type="button" onClick={() => stepQty(r.item, q, 1)} aria-label="수량 더하기"
                        className={`w-7 h-7 flex items-center justify-center transition-colors ${q >= capQ ? "text-[#d4d4d4]" : "text-[#131313] hover:bg-[#f2f2f2]"}`}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                      </button>
                    </span>
                  );
                  return (
                    // 📌 flex-wrap(폰만) — 1개 단위 줄은 합계 · 수량 조절을 아래 한 줄(basis-full)로 내린다. 오른쪽 칸에 두면 1회 최대 폭을
                    //    잡은 합계 칸이 375px 에서 이름을 두세 글자로 줄인다. PC(sm~)는 한 줄 그대로
                    <div key={r.itemId} className={`p-5 flex flex-wrap sm:flex-nowrap gap-4 items-center transition-colors ${on ? "" : "bg-[#f2f2f2]"}`}>
                      <button onClick={() => toggleOne(r.itemId)} aria-label="선택" className="shrink-0">
                        <span className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center transition-colors ${
                          on ? "bg-[#e91e3f] border-[#e91e3f]" : "bg-white border-[#ededed]"
                        }`}>
                          {on && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </span>
                      </button>
                      {/* 썸네일 — 상점 카드와 같은 그림(이미지 없으면 등록 색 + 아이콘). 누르면 그 상품 상세(담은 기간으로) */}
                      <Link href={itemHref} className="relative block w-20 h-20 rounded-xl bg-[#f2f2f2] overflow-hidden shrink-0">
                        <CardArt it={r.item} iconSize={36} />
                      </Link>
                      <div className="flex-1 min-w-0">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black text-white mb-1.5" style={{ backgroundColor: itemTypeColor(r.item.type) }}>
                          {TYPE_LABEL[r.item.type] || "상품"}
                        </span>
                        <h3 className="text-sm font-bold text-[#131313] truncate flex items-center gap-1.5">
                        <Link href={itemHref} className="truncate hover:underline underline-offset-4">{r.item.name}</Link>
                        {/* 기간제를 가진 상품이면 "30일 연장" — 지금 만료 뒤에 이어 붙는다 */}
                        {(r.days ?? 0) > 0 && <span className={`shrink-0 px-1.5 py-0.5 rounded ${renew ? "bg-[#e91e3f]" : "bg-[#131313]"} text-white text-[10px] font-black`}>{durationLabel(r.days)}{renew ? " 연장" : ""}</span>}
                      </h3>
                        {r.item.description && (
                          <p className="text-[11px] text-[#8a8a8a] truncate mt-0.5">{r.item.description}</p>
                        )}
                        {unit && <p className="text-[11px] font-bold text-[#8a8a8a] tabular-nums truncate mt-0.5">개당 {priceText(r.item, sp)}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {unit ? (
                          <div className="hidden sm:block">
                            {lineTotal}
                            <div className="mt-2">{stepper}</div>
                          </div>
                        ) : (
                          <>
                            <div className="text-base font-black text-[#131313] tabular-nums">{priceText(r.item, sp)}</div>
                            {discounted && <div className="text-[11px] text-[#a3a3a3] line-through tabular-nums">{priceText(r.item, list)}</div>}
                          </>
                        )}
                        <button onClick={() => removeItem(r.itemId)}
                          className={`${unit ? "sm:mt-2" : "mt-2"} text-[11px] font-bold text-[#a3a3a3] hover:text-[#d01634] transition-colors`}>
                          삭제
                        </button>
                      </div>
                      {/* 폰 — 썸네일 줄 아래에 수량 조절(왼쪽, 썸네일과 같은 시작선) · 합계(오른쪽) */}
                      {unit && (
                        <div className="sm:hidden basis-full min-w-0 flex items-center justify-between gap-3 pl-[34px]">
                          <span className="shrink-0">{stepper}</span>
                          <div className="min-w-0 text-right">{lineTotal}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 우 — 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-[#ededed] p-6 lg:sticky lg:top-24">
                <h2 className="text-sm font-black text-[#131313] mb-5">주문 요약</h2>

                <div className="space-y-2.5 text-[13px] mb-4">
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">선택한 상품</span><span className="font-bold tabular-nums">{picked.reduce((n, r) => n + (r.qty || 1), 0)}개</span></div>
                  {(!hasPO || normal.length > 0) && (
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 금액</span><span className="font-bold tabular-nums">{listTotal.toLocaleString()} XP</span></div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 할인</span><span className="font-bold text-[#e91e3f] tabular-nums">-{discount.toLocaleString()} XP</span></div>
                  )}
                  {/* 빙옥 전용 상품 — 빙옥으로만 결제 (줄마다 보인 값의 합) */}
                  {hasPO && (
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">빙옥 전용</span><span className="font-bold tabular-nums">{poPoint.toLocaleString()} 빙옥</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold tabular-nums">{(myXp ?? 0).toLocaleString()} XP</span></div>
                  {(myPoint > 0 || hasPO) && <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 빙옥</span><span className={`font-bold tabular-nums ${pointShort ? "text-[#d01634]" : ""}`}>{myPoint.toLocaleString()} 빙옥</span></div>}
                </div>

                <div className="h-px bg-[#ededed] mb-4"></div>

                <div className="flex items-baseline justify-between gap-3 mb-6">
                  <span className="shrink-0 text-sm font-bold text-[#131313]">{hasPO ? "예상 결제" : "예상 결제 XP"}</span>
                  <span className={`text-right tabular-nums ${enoughXp ? "text-[#131313]" : "text-[#d01634]"}`}>
                    {(!hasPO || normal.length > 0) && <span className="block text-xl font-black">{total.toLocaleString()} XP</span>}
                    {hasPO && (
                      <span className={`block ${normal.length > 0 ? "mt-0.5 text-[13px] font-bold" : "text-xl font-black"}`}>
                        {normal.length > 0 ? "+ " : ""}{poPoint.toLocaleString()} 빙옥
                      </span>
                    )}
                  </span>
                </div>

                <Link href="/arctic/checkout"
                  onClick={(e) => { if (!canCheckout) { e.preventDefault(); return; } goCheckout(); }}
                  className={`block w-full py-4 text-center font-bold rounded-xl transition-colors ${
                    canCheckout ? "bg-[#e91e3f] text-white hover:bg-[#d01634]" : "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
                  }`}>
                  {picked.length === 0 ? "상품을 선택해주세요" : pointShort ? "빙옥이 부족합니다" : !enoughXp ? "XP · 빙옥이 부족합니다" : "결제하러 가기"}
                </Link>

                <p className="mt-4 text-[10px] text-[#a3a3a3] leading-relaxed break-keep">
                  쿠폰은 다음 단계인 결제 화면에서 적용할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 토스트 — 수량 끝에 닿았을 때 */}
      {toast && (
        <div key={toast} className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-5 py-3 bg-[#131313] text-white rounded-full shadow-lg text-[12px] font-bold whitespace-nowrap">
          {toast}
        </div>
      )}
      <ArcticFooter />
      <ArcticDock />
    </div>
  );
}
