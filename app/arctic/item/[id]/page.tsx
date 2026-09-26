"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { salePrice, basePrice, isTimed, durationOptions, durationLabel, cardPick, discountPctOf, discountUntilLabel } from "@/lib/shopPricing";
import { pointToXp } from "@/lib/pointRate";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { isAdminName } from "@/lib/admins";
import ItemIcon from "../../../components/ItemIcon";
import ArcticDock from "../../ArcticDock";
import ArcticStoreBar from "../../ArcticStoreBar";
import ArcticFooter from "../../ArcticFooter";

// 유형 배지 — 라벨·색은 lib/items.js 가 단일 원천
const TypeBadge = ({ type, className = "" }: { type: string; className?: string }) => (
  <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
    {itemTypeLabel(type)}
  </span>
);

// 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon)을 등록 색 그라데이션 위에 크게 찍는다
const ItemArt = ({ it, imgClass = "", iconSize = 72 }: { it: any; imgClass?: string; iconSize?: number }) => {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt={it.name || ""} className={`absolute inset-0 w-full h-full object-cover ${imgClass}`} />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
      <ItemIcon icon={it?.icon} type={it?.type} size={iconSize} color={color} />
    </div>
  );
};

// 📌 상품 상세 — 카드에서 눌러 들어오는 화면
export default function ItemDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const isLoggedIn = status === "authenticated";
  const isAdmin = isAdminName(session?.user?.name);

  const [item, setItem] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myPoint, setMyPoint] = useState<number | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  // 📌 장바구니 개수 기준 — 상품 목록을 제대로 받았을 때의 id 들. 실패면 null (그때는 저장된 그대로 센다)
  const [validIds, setValidIds] = useState<Set<string> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  // 무제한은 days 가 0 이라 "안 고름"과 구분해야 한다 — 안 고른 상태는 null
  const [pickedDays, setPickedDays] = useState<number | null>(null);
  const [wish, setWish] = useState<string[]>([]);
  const [toast, setToast] = useState("");


  useEffect(() => {
    try {
      const c = localStorage.getItem("iglooShopCart");
      if (c) setCart(JSON.parse(c));
      const w = localStorage.getItem("iglooShopWish");
      if (w) setWish(JSON.parse(w));
    } catch {}
  }, []);

  const saveCart = (next: { itemId: string; qty: number; days?: number }[]) => {
    setCart(next);
    try { localStorage.setItem("iglooShopCart", JSON.stringify(next)); } catch {}
  };
  const saveWish = (next: string[]) => {
    setWish(next);
    try { localStorage.setItem("iglooShopWish", JSON.stringify(next)); } catch {}
  };

  const load = useCallback(() => {
    if (status === "loading" || !id) return;
    Promise.all([
      fetch(`/api/shop/items/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      // 관리자는 장바구니 화면처럼 숨김 상품까지 받아야 장바구니 개수가 맞다 (관련 상품은 아래서 active 만 거른다)
      fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([it, me, ord, all]) => {
      if (it?.success) {
        setItem(it.data);
        // 상점 카드가 필터로 다른 기간을 걸어 보여 줬으면(?days=30) 그 기간으로 연다 — 카드에서 본 값과 첫 값이 같게
        try {
          const q = new URLSearchParams(window.location.search).get("days");
          const d = q != null && q !== "" ? Number(q) : NaN;
          if (Number.isFinite(d) && durationOptions(it.data).some((o: any) => o.days === d)) setPickedDays(d);
        } catch {}
      }
      else setNotFound(true);
      if (me?.success) { setMyXp(me.data.xp); setMyPoint(me.data.point ?? 0); }
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      setAllItems(Array.isArray(all?.data) ? all.data : []);
      if (all?.success && Array.isArray(all?.data)) setValidIds(new Set(all.data.map((x: any) => String(x._id))));
    }).finally(() => setIsLoading(false));
  }, [status, id, isAdmin]);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 1800); };

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-white min-h-screen">
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="w-full flex-1 bg-white min-h-screen">
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">상품을 찾을 수 없습니다</h1>
          <p className="text-sm text-[#5a5a5a] mb-7">삭제되었거나 판매가 종료된 상품일 수 있어요.</p>
          <Link href="/arctic" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            상점으로 가기
          </Link>
        </div>
      </div>
    );
  }

  const timed = isTimed(item);
  // 안 골랐으면 카드와 같은 기간(무제한, 없으면 가장 긴 기간) — 카드에서 본 값과 상세 첫 값이 같게
  const days = timed ? (pickedDays ?? cardPick(item)?.days ?? durationOptions(item)[0]?.days ?? 0) : 0;
  const sp = salePrice(item, days);
  const listPrice = basePrice(item, days);
  const discounted = sp < listPrice;
  const owned = orders.some((o) => o.itemId === item._id && ["pending", "completed"].includes(o.status) && (!o.expiresAt || new Date(o.expiresAt) > new Date()));
  const inCart = cart.some((c) => c.itemId === item._id);
  // 📌 장바구니 개수 — 장바구니 화면과 같은 기준: 목록에 없는(삭제·숨김) 상품 · 같은 상품 중복은 세지 않는다.
  //    목록을 못 받았으면 저장된 그대로 센다
  const cartSeen = new Set<string>();
  const cartCount = cart.reduce((n, c) => {
    const cid = String(c?.itemId);
    if (cartSeen.has(cid) || (validIds && !validIds.has(cid))) return n;
    cartSeen.add(cid);
    return n + (c?.qty || 1);
  }, 0);
  const soldOut = item.stock === 0;
  const wished = wish.includes(item._id);
  // 📌 빙옥도 함께 낼 수 있다(결제 화면에서 고른다) — XP + 빙옥 × 1,000 으로 판정
  const affordable = myXp != null && myXp + pointToXp(myPoint ?? 0) >= sp;

  // 관련 상품 — 같은 유형을 먼저, 부족하면 나머지로 채운다 (현재 상품·품절 제외)
  const others = allItems.filter((x) => x._id !== item._id && x.active && x.stock !== 0);
  const related = [
    ...others.filter((x) => x.type === item.type),
    ...others.filter((x) => x.type !== item.type),
  ].slice(0, 8);

  // 담기 ↔ 삭제 토글
  const toggleCart = () => {
    if (!isLoggedIn) return signIn("discord");
    if (owned) return flash("이미 구매하신 상품입니다");
    if (inCart) {
      saveCart(cart.filter((c) => c.itemId !== item._id));
      flash("장바구니에서 삭제했습니다");
      return;
    }
    saveCart([...cart, { itemId: item._id, qty: 1, days }]);
    flash("장바구니에 담았습니다");
  };

  const toggleWish = () => {
    saveWish(wished ? wish.filter((x) => x !== item._id) : [...wish, item._id]);
    flash(wished ? "찜을 해제했습니다" : "찜 목록에 추가했습니다");
  };

  // 구매 — 팝업 대신 결제 화면으로 넘어간다. 이 상품 하나만 결제 대상으로 넘기고(장바구니는 그대로),
  //    쿠폰 · 약관 동의 · 수령 정보는 결제 화면(app/arctic/checkout)이 맡는다
  const openBuy = () => {
    if (!isLoggedIn) return signIn("discord");
    try { localStorage.setItem("iglooShopCheckout", JSON.stringify([{ itemId: item._id, qty: 1, days }])); } catch {}
    router.push("/arctic/checkout");
  };

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      <ArcticStoreBar
        crumbs={[{ label: itemTypeLabel(item.type), href: `/arctic?type=${item.type}` }, { label: item.name }]}
        cartCount={cartCount}
        wishCount={wish.length}
      />
      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 좌 — 이미지 */}
          <div className="relative aspect-square rounded-2xl bg-[#f2f2f2] border border-[#ededed] overflow-hidden">
            <ItemArt it={item} iconSize={96} />
            {soldOut && (
              <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
                <span className="text-lg font-black text-white tracking-wider">SOLD OUT</span>
              </div>
            )}
          </div>

          {/* 우 — 정보 */}
          <div className="flex flex-col">
            <TypeBadge type={item.type} className="self-start px-2.5 py-1 text-[10px] mb-3" />

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#131313] mb-3 break-keep">{item.name}</h1>

            <div className="mb-6">
              <div className="flex items-center gap-2.5 flex-wrap">
                {discounted && (
                  <span className="px-2 py-1 rounded-md bg-[#e91e3f] text-white text-[12px] font-black leading-none shrink-0">{discountPctOf(item)}% OFF</span>
                )}
                <span className="text-3xl font-black tracking-tight tabular-nums leading-none text-[#131313]">
                  {sp.toLocaleString()}<span className="text-sm font-bold text-[#8a8a8a] ml-1.5">XP</span>
                </span>
                {timed && <span className="text-[13px] font-bold text-[#8a8a8a]">/ {durationLabel(days)}</span>}
              </div>
              {/* 할인 종료 시각이 있으면 언제까지인지 */}
              {discounted && discountUntilLabel(item) && (
                <span className="block mt-2 text-[12px] font-bold text-[#e91e3f]">할인 {discountUntilLabel(item)}</span>
              )}
              {discounted && (
                <span className="block mt-1 text-[14px] text-[#a3a3a3] line-through tabular-nums">{listPrice.toLocaleString()} XP</span>
              )}
            </div>

            {/* 📌 기간제 역할 — 기간을 고르면 값이 바뀐다 */}
            {timed && (
              <div className="mb-6">
                <p className="text-xs font-bold text-[#5a5a5a] mb-2">이용 기간</p>
                <div className="flex gap-2">
                  {durationOptions(item).map((o: any) => {
                    const on = o.days === days;
                    return (
                      <button key={o.days} type="button" onClick={() => setPickedDays(o.days)}
                        className={`flex-1 py-3 rounded-xl border text-[13px] font-bold transition-colors ${
                          on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#5a5a5a] border-[#ededed] hover:border-[#131313]"
                        }`}>
                        {durationLabel(o.days)}
                        <span className={`block text-[12px] font-bold tabular-nums mt-0.5 ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>
                          {salePrice(item, o.days).toLocaleString()} XP
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[#8a8a8a] mt-2">기간이 끝나면 역할이 자동으로 회수되며, 그 뒤 다시 구매할 수 있습니다.</p>
              </div>
            )}

            {item.description && (
              <p className="text-[14px] text-[#5a5a5a] leading-relaxed mb-6 whitespace-pre-wrap break-keep">{item.description}</p>
            )}


            {/* 상세 정보 */}
            <div className="rounded-xl bg-white border border-[#ededed] divide-y divide-[#ededed] mb-6">
              {[
                { l: "상품 유형", v: itemTypeLabel(item.type) },
                ...(item.roleName ? [{ l: "지급 역할", v: item.roleName }] : []),
                {
                  l: "재고",
                  v: item.stock < 0 ? "제한 없음" : item.stock === 0 ? "품절" : `${item.stock}개 남음`,
                  accent: item.stock >= 0 && item.stock > 0 && item.stock <= 5,
                },
                { l: "구매 제한", v: "1인 1개" },
                {
                  l: "지급 방식",
                  v: item.type === "physical"
                    ? "운영진 확인 후 발송"
                    : item.type === "item" && !item.roleId
                    ? "결제 후 인벤토리에 보관"
                    : "결제 후 30초 이내 자동 지급",
                },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-[12px] font-bold text-[#8a8a8a] shrink-0">{row.l}</span>
                  <span className={`text-[13px] font-bold text-right ${row.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{row.v}</span>
                </div>
              ))}
            </div>

            {/* 보유 XP · 빙옥 — 둘 다 결제에 쓸 수 있다 */}
            {isLoggedIn && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-[#ededed] mb-4 text-[13px]">
                <span className="shrink-0 text-[#5a5a5a]">보유</span>
                <span className={`text-right font-black tabular-nums ${affordable ? "text-[#131313]" : "text-[#d01634]"}`}>
                  {(myXp ?? 0).toLocaleString()} XP · {(myPoint ?? 0).toLocaleString()} 빙옥
                </span>
              </div>
            )}

            {/* 액션 */}
            <div className="mt-auto flex gap-2">
              <button onClick={toggleWish} aria-label="찜하기"
                className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border transition-colors ${
                  wished ? "bg-[#e91e3f]/10 border-[#e91e3f]/30 text-[#e91e3f]" : "bg-white border-[#ededed] text-[#a3a3a3] hover:text-[#131313]"
                }`}>
                <svg className="w-5 h-5" fill={wished ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </button>

              <button onClick={toggleCart} disabled={soldOut || owned}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  soldOut || owned
                    ? "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
                    : inCart
                    ? "bg-[#131313] text-white hover:bg-[#333]"
                    : "bg-white text-[#131313] border border-[#ededed] hover:border-[#131313]"
                }`}>
                {inCart ? "장바구니에서 삭제" : "장바구니에 담기"}
              </button>

              <button onClick={openBuy} disabled={soldOut || owned}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  owned || soldOut
                    ? "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
                    : isLoggedIn && !affordable
                    ? "bg-[#f2f2f2] text-[#8a8a8a]"
                    : "bg-[#e91e3f] text-white hover:bg-[#d01634]"
                }`}>
                {owned ? "보유 중" : soldOut ? "품절" : !isLoggedIn ? "로그인" : affordable ? "구매" : "XP 부족"}
              </button>
            </div>
          </div>
        </div>

        {/* ── 효과 — 사면 붙는 것(등록 아이템 효과 + 지급 역할의 역할 버프). 오른쪽 정보 칸에 몰리지 않게 아래 전체 폭으로.
               칸 하나에 효과 하나: 무엇을 하면 · 얼마나 · 조건(요일 · 시간 · 채널 · 하루 1번) ── */}
        {Array.isArray(item.effects) && item.effects.length > 0 && (
          <div className="mt-14 pt-10 border-t border-[#ededed]">
            <h2 className="text-base font-black text-[#131313] tracking-tight mb-5">효과</h2>
            {/* 칸 수는 개수에 맞춘다(PC 최대 4) — 빈 칸이 남지 않게. 모바일 2열에서 홀수면 마지막 칸이 한 줄을 다 쓴다 */}
            <div className={`grid grid-cols-2 gap-2 ${item.effects.length >= 4 ? "md:grid-cols-4" : item.effects.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
              {item.effects.map((e: any, i: number) => {
                const cond = [...(Array.isArray(e.cond) ? e.cond : []), e.once ? "하루 1번" : ""].filter(Boolean);
                const wide = item.effects.length % 2 === 1 && i === item.effects.length - 1;
                return (
                  <div key={i} className={`flex flex-col bg-[#f2f2f2] px-5 py-5 ${wide ? "col-span-2 md:col-span-1" : ""}`}>
                    <span className="text-[12px] font-bold text-[#5a5a5a] break-keep">{e.label}</span>
                    <span className="mt-2.5 text-[24px] font-black text-[#131313] tabular-nums leading-none tracking-tight">
                      {e.amount}<span className="ml-1 text-[12px] font-bold text-[#8a8a8a]">{e.unit}</span>
                    </span>
                    {cond.length > 0 && <span className="mt-3 text-[11px] font-bold text-[#8a8a8a] break-keep">{cond.join(" · ")}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 다른 상품 ── */}
        {related.length > 0 && (
          <div className="mt-16 pt-10 border-t border-[#ededed]">
            <div className="flex items-baseline justify-between gap-4 mb-5">
              <h2 className="text-base font-black text-[#131313] tracking-tight">다른 상품도 둘러보세요</h2>
              <Link href="/arctic" className="text-[12px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors shrink-0">
                전체 보기
              </Link>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {related.map((r) => {
                // 상점 카드와 같은 기준 — 기본 무제한(없으면 가장 긴 기간), 취소선도 그 기간의 정가
                const rPick = cardPick(r) || { days: undefined, price: 0, list: 0 };
                const rp = rPick.price;
                const rList = rPick.list;
                const rDiscounted = rp < rList;
                return (
                  <Link key={r._id} href={`/arctic/item/${r._id}`}
                    className="group bg-white rounded-2xl border border-[#ededed] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
                    <div className="relative aspect-[4/3] bg-[#f2f2f2] overflow-hidden">
                      <ItemArt it={r} imgClass="group-hover:scale-105 transition-transform duration-500" iconSize={48} />
                      <TypeBadge type={r.type} className="absolute top-2 left-2 px-2 py-0.5 text-[9px]" />
                    </div>
                    <div className="p-3.5 flex flex-col flex-1">
                      <h3 className="text-[13px] font-black text-[#131313] tracking-tight mb-1.5 break-keep line-clamp-2 group-hover:text-[#e91e3f] transition-colors">{r.name}</h3>
                      <div className="mt-auto">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {rDiscounted && (
                            <span className="px-1.5 py-[3px] rounded bg-[#e91e3f] text-white text-[10px] font-black leading-none shrink-0">{discountPctOf(r)}%</span>
                          )}
                          <span className="text-[15px] font-black text-[#131313] tabular-nums leading-none">
                            {rp.toLocaleString()}<span className="text-[11px] font-bold text-[#8a8a8a] ml-1">XP</span>
                            {isTimed(r) && rPick.days != null && rPick.days > 0 && <span className="text-[11px] font-bold text-[#8a8a8a] ml-1">/ {durationLabel(rPick.days)}</span>}
                          </span>
                        </div>
                        {rDiscounted && (
                          <span className="block text-[11px] text-[#a3a3a3] line-through tabular-nums">{rList.toLocaleString()} XP</span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 토스트 */}
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
