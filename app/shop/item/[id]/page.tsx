"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { salePrice } from "@/lib/shopPricing";
import ArcticHeader from "../../ArcticHeader";

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  role: { label: "역할", cls: "bg-[#e91e3f] text-white" },
  perk: { label: "권한", cls: "bg-[#2f6fb0] text-white" },
  physical: { label: "기프트카드", cls: "bg-[#131313] text-white" },
};

// 📌 상품 상세 — 카드에서 눌러 들어오는 화면
export default function ItemDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const isLoggedIn = status === "authenticated";

  const [item, setItem] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [cart, setCart] = useState<{ itemId: string; qty: number }[]>([]);
  const [wish, setWish] = useState<string[]>([]);
  const [toast, setToast] = useState("");

  // 구매 모달
  const [buying, setBuying] = useState(false);
  const [contact, setContact] = useState("");
  const [isPaying, setIsPaying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    try {
      const c = localStorage.getItem("iglooShopCart");
      if (c) setCart(JSON.parse(c));
      const w = localStorage.getItem("iglooShopWish");
      if (w) setWish(JSON.parse(w));
    } catch {}
  }, []);

  const saveCart = (next: { itemId: string; qty: number }[]) => {
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
    ]).then(([it, me, ord]) => {
      if (it?.success) setItem(it.data);
      else setNotFound(true);
      if (me?.success) setMyXp(me.data.xp);
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
    }).finally(() => setIsLoading(false));
  }, [status, id]);

  useEffect(() => { load(); }, [load]);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 1800); };

  if (status === "loading" || isLoading) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
      </div>
    );
  }

  if (notFound || !item) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center px-6">
          <h1 className="text-2xl font-black text-[#131313] mb-3">상품을 찾을 수 없습니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">삭제되었거나 판매가 종료된 상품일 수 있어요.</p>
          <Link href="/shop" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            상점으로 가기
          </Link>
        </div>
      </div>
    );
  }

  const sp = salePrice(item);
  const discounted = sp < item.price;
  const owned = orders.some((o) => o.itemId === item._id && o.status !== "cancelled");
  const inCart = cart.some((c) => c.itemId === item._id);
  const soldOut = item.stock === 0;
  const wished = wish.includes(item._id);
  const affordable = myXp != null && myXp >= sp;
  const badge = TYPE_BADGE[item.type] || TYPE_BADGE.physical;

  // 담기 ↔ 삭제 토글
  const toggleCart = () => {
    if (!isLoggedIn) return signIn("discord");
    if (owned) return flash("이미 구매하신 상품입니다");
    if (inCart) {
      saveCart(cart.filter((c) => c.itemId !== item._id));
      flash("장바구니에서 삭제했습니다");
      return;
    }
    saveCart([...cart, { itemId: item._id, qty: 1 }]);
    flash("장바구니에 담았습니다");
  };

  const toggleWish = () => {
    saveWish(wished ? wish.filter((x) => x !== item._id) : [...wish, item._id]);
    flash(wished ? "찜을 해제했습니다" : "찜 목록에 추가했습니다");
  };

  const openBuy = () => {
    if (!isLoggedIn) return signIn("discord");
    setContact("");
    setResult(null);
    setBuying(true);
  };

  const confirmBuy = async () => {
    if (isPaying) return;
    setIsPaying(true);
    try {
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item._id, contact }),
      });
      const d = await res.json();
      setResult({ ok: !!d.success, message: d.message || (d.success ? "구매가 완료되었습니다." : "구매에 실패했습니다.") });
      if (d.success) {
        if (typeof d.data?.remainXp === "number") setMyXp(d.data.remainXp);
        if (inCart) saveCart(cart.filter((c) => c.itemId !== item._id));
        load();
      }
    } catch {
      setResult({ ok: false, message: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      <ArcticHeader />

      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">
        <button onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-6 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          뒤로
        </button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 좌 — 이미지 */}
          <div className="relative aspect-square rounded-2xl bg-[#eceae6] border border-[#e2e0dc] overflow-hidden">
            {item.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#c4c4c4]">
                <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                </svg>
              </div>
            )}
            {discounted && (
              <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-[#e91e3f] text-white text-[11px] font-black">{item.discountPct}% OFF</span>
            )}
            {soldOut && (
              <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
                <span className="text-lg font-black text-white tracking-wider">SOLD OUT</span>
              </div>
            )}
          </div>

          {/* 우 — 정보 */}
          <div className="flex flex-col">
            <span className={`self-start px-2.5 py-1 rounded-full text-[10px] font-black mb-3 ${badge.cls}`}>{badge.label}</span>

            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#131313] mb-3 break-keep">{item.name}</h1>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-3xl font-black tracking-tight tabular-nums text-[#131313]">
                {sp.toLocaleString()}<span className="text-sm font-bold text-[#8a8a8a] ml-1.5">XP</span>
              </span>
              {discounted && (
                <span className="text-[15px] text-[#a3a3a3] line-through tabular-nums">{item.price.toLocaleString()} XP</span>
              )}
            </div>

            {item.description && (
              <p className="text-[14px] text-[#4b4b4b] leading-relaxed mb-6 whitespace-pre-wrap break-keep">{item.description}</p>
            )}

            {/* 상세 정보 */}
            <div className="rounded-xl bg-white border border-[#e2e0dc] divide-y divide-[#ececea] mb-6">
              {[
                { l: "상품 유형", v: badge.label },
                ...(item.roleName ? [{ l: "지급 역할", v: item.roleName }] : []),
                {
                  l: "재고",
                  v: item.stock < 0 ? "제한 없음" : item.stock === 0 ? "품절" : `${item.stock}개 남음`,
                  accent: item.stock >= 0 && item.stock > 0 && item.stock <= 5,
                },
                { l: "구매 제한", v: "1인 1개" },
                {
                  l: "지급 방식",
                  v: item.type === "physical" ? "운영진 확인 후 발송" : "결제 후 30초 이내 자동 지급",
                },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-[12px] font-bold text-[#8a8a8a] shrink-0">{row.l}</span>
                  <span className={`text-[13px] font-bold text-right ${row.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{row.v}</span>
                </div>
              ))}
            </div>

            {/* 보유 XP */}
            {isLoggedIn && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-[#e2e0dc] mb-4 text-[13px]">
                <span className="text-[#5a5a5a]">보유 XP</span>
                <span className={`font-black tabular-nums ${affordable ? "text-[#131313]" : "text-[#c62828]"}`}>
                  {(myXp ?? 0).toLocaleString()} XP
                </span>
              </div>
            )}

            {/* 액션 */}
            <div className="mt-auto flex gap-2">
              <button onClick={toggleWish} aria-label="찜하기"
                className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border transition-colors ${
                  wished ? "bg-[#e91e3f]/10 border-[#e91e3f]/30 text-[#e91e3f]" : "bg-white border-[#e2e0dc] text-[#a3a3a3] hover:text-[#131313]"
                }`}>
                <svg className="w-5 h-5" fill={wished ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </button>

              <button onClick={toggleCart} disabled={soldOut || owned}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  soldOut || owned
                    ? "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                    : inCart
                    ? "bg-[#131313] text-white hover:bg-[#333]"
                    : "bg-white text-[#131313] border border-[#e2e0dc] hover:border-[#131313]"
                }`}>
                {inCart ? "장바구니에서 삭제" : "장바구니에 담기"}
              </button>

              <button onClick={openBuy} disabled={soldOut || owned}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  owned || soldOut
                    ? "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                    : isLoggedIn && !affordable
                    ? "bg-[#eceae6] text-[#8a8a8a]"
                    : "bg-[#e91e3f] text-white hover:bg-[#d01634]"
                }`}>
                {owned ? "보유 중" : soldOut ? "품절" : !isLoggedIn ? "로그인" : affordable ? "구매" : "XP 부족"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 토스트 */}
      {toast && (
        <div key={toast} className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-5 py-3 bg-[#131313] text-white rounded-full shadow-lg text-[12px] font-bold whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* 구매 모달 */}
      {buying && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !isPaying && setBuying(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden border border-[#e2e0dc] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {result ? (
              <div className="p-8 text-center">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5 ${result.ok ? "bg-[#e8f3e6] text-[#3f7a35]" : "bg-[#fdeaea] text-[#c62828]"}`}>
                  {result.ok
                    ? <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                </div>
                <h2 className="text-lg font-black text-[#131313] mb-2">{result.ok ? "구매 완료" : "구매 실패"}</h2>
                <p className="text-sm text-[#4b4b4b] leading-relaxed mb-7 break-keep">{result.message}</p>
                <div className="flex gap-3">
                  <button onClick={() => { setBuying(false); setResult(null); }} className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl">닫기</button>
                  {result.ok && (
                    <Link href="/shop/orders" className="flex-1 py-3.5 bg-[#e91e3f] text-white font-bold rounded-xl text-center">구매 내역</Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6">
                <h2 className="text-base font-black text-[#131313] mb-1">구매 확인</h2>
                <p className="text-[13px] text-[#8a8a8a] mb-5">{item.name}</p>

                {item.type === "physical" && (
                  <div className="mb-5">
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">수령 정보 <span className="text-[#c62828]">*</span></label>
                    <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                      placeholder="연락처 또는 기프티콘 받을 번호를 입력해주세요."
                      className="w-full bg-white border border-[#e2e0dc] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] resize-none placeholder:text-[#a3a3a3]" />
                  </div>
                )}

                <div className="bg-[#f5f3f0] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#c62828] tabular-nums">-{sp.toLocaleString()}</span></div>
                  <div className="h-px bg-[#e2e0dc]"></div>
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 잔액</span><span className="font-black tabular-nums">{Math.max(0, (myXp ?? 0) - sp).toLocaleString()}</span></div>
                </div>

                <p className="text-[11px] text-[#a3a3a3] leading-relaxed mb-5 break-keep">
                  XP를 사용하면 레벨이 함께 내려갑니다. 구매 후에는 직접 취소할 수 없습니다.
                </p>

                <div className="flex gap-3">
                  <button onClick={() => setBuying(false)} className="flex-1 py-3.5 bg-[#eceae6] hover:bg-[#e2e0dc] text-[#4b4b4b] font-bold rounded-xl transition-colors">취소</button>
                  <button onClick={confirmBuy} disabled={isPaying || !affordable || (item.type === "physical" && !contact.trim())}
                    className="flex-1 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-40 text-white font-bold rounded-xl transition-colors">
                    {isPaying ? "처리 중..." : affordable ? "구매 확정" : "XP 부족"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
