"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { salePrice, durationLabel } from "@/lib/shopPricing";
import ArcticHeader from "../ArcticHeader";
import ArcticFooter from "../ArcticFooter";
import ArcticDock from "../ArcticDock";

const ADMIN_USERS = ["elahw.06"];

// 📌 결제 — 장바구니에서 고른 상품을 확인하고 약관 동의 후 결제
export default function CheckoutPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [contact, setContact] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeFinal, setAgreeFinal] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // 쿠폰 — 보유 쿠폰에서 고르거나 코드를 입력 (둘 다 선택 사항)
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<any>(null);
  const [couponMsg, setCouponMsg] = useState("");
  const [couponMsgOk, setCouponMsgOk] = useState(false);
  const [isCheckingCoupon, setIsCheckingCoupon] = useState(false);
  const [wallet, setWallet] = useState<any[]>([]);
  const [showCouponPicker, setShowCouponPicker] = useState(false);

  // 장바구니에서 고른 항목이 있으면 그것만, 없으면 장바구니 전체를 결제 대상으로
  useEffect(() => {
    try {
      const picked = localStorage.getItem("iglooShopCheckout");
      const raw = picked || localStorage.getItem("iglooShopCart");
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    Promise.all([
      fetch("/api/shop/items", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([it, me]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      if (me?.success) setMyXp(me.data.xp);
    }).finally(() => setIsLoading(false));
  }, [status]);

  const rows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item),
    [cart, items]
  );
  const subtotal = rows.reduce((n, r) => n + salePrice(r.item, r.days) * r.qty, 0);
  const listTotal = rows.reduce((n, r) => n + ((r.days ?? 0) > 0 ? (r.item.durations?.find((d: any) => d.days === r.days)?.price ?? r.item.price) : r.item.price) * r.qty, 0);
  const itemDiscount = listTotal - subtotal;
  const couponDiscount = coupon?.discount || 0;
  const total = Math.max(0, subtotal - couponDiscount);
  const count = rows.reduce((n, r) => n + r.qty, 0);
  const needsContact = rows.some((r) => r.item.type === "physical");
  const enoughXp = isAdmin || (myXp != null && myXp >= total);

  // 보유 쿠폰 목록 — 주문 금액이 바뀌면 할인액도 다시 계산해 받는다
  const loadWallet = React.useCallback(() => {
    if (status !== "authenticated") return;
    fetch(`/api/shop/my-coupons?total=${subtotal}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setWallet(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, [status, subtotal]);

  useEffect(() => { loadWallet(); }, [loadWallet]);

  // 코드로 적용 — 지갑에 없으면 담고, 곧바로 적용까지
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || isCheckingCoupon) return;
    setIsCheckingCoupon(true);
    setCouponMsg("");
    setCouponMsgOk(false);
    try {
      const res = await fetch("/api/shop/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validate: true, code, total: subtotal }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCoupon(d.data);
        setCouponInput("");
        // 지갑에도 담아둔다 (이미 있으면 서버가 조용히 넘어감)
        fetch("/api/shop/my-coupons", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
        }).then(() => loadWallet()).catch(() => {});
      } else {
        setCoupon(null);
        setCouponMsg(d.message || "사용할 수 없는 쿠폰입니다.");
      }
    } catch {
      setCoupon(null);
      setCouponMsg("쿠폰 확인 중 오류가 발생했습니다.");
    } finally {
      setIsCheckingCoupon(false);
    }
  };

  // 보유 쿠폰에서 선택 — 고른 뒤 '적용'을 눌러야 반영된다 (한 장만 사용 가능)
  const [pendingCouponId, setPendingCouponId] = useState<string | null>(null);

  const pickCoupon = (w: any) => {
    if (!w.usable) return;
    setCoupon({ code: w.code, name: w.name, type: w.type, value: w.value, discount: w.discount });
    setCouponMsg("");
    setShowCouponPicker(false);
  };

  const applyPendingCoupon = () => {
    const w = wallet.find((x: any) => x.id === pendingCouponId);
    if (w) pickCoupon(w);
  };
  const canPay = rows.length > 0 && enoughXp && agreeTerms && agreeFinal && (!needsContact || contact.trim().length > 0) && !isPaying;

  const pay = async () => {
    if (!canPay) return;
    setIsPaying(true);
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart, contact, couponCode: coupon?.code || "" }),
      });
      const d = await res.json();
      setResult({ ok: !!d.success, message: d.message || (d.success ? "결제가 완료되었습니다." : "결제에 실패했습니다.") });
      if (d.success) {
        try {
          const paidIds = new Set(cart.map((c) => c.itemId));
          const all: { itemId: string; qty: number }[] = JSON.parse(localStorage.getItem("iglooShopCart") || "[]");
          localStorage.setItem("iglooShopCart", JSON.stringify(all.filter((c) => !paidIds.has(c.itemId))));
          localStorage.removeItem("iglooShopCheckout");
        } catch {}
        setCart([]);
        if (typeof d.data?.remainXp === "number") setMyXp(d.data.remainXp);
      }
    } catch {
      setResult({ ok: false, message: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsPaying(false);
    }
  };

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
        <div className="py-32 text-center break-keep px-6">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">결제하려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  // 결제 완료·실패 화면
  if (result) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="max-w-md mx-auto px-6 py-20 bg-white rounded-3xl mt-10 border border-[#e2e0dc] p-10 text-center shadow-[0_2px_16px_rgba(0,0,0,0.06)]">
          <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6 ${result.ok ? "bg-[#e8f3e6] text-[#3f7a35]" : "bg-[#fdeaea] text-[#c62828]"}`}>
            {result.ok ? (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            )}
          </div>
          <h1 className="text-xl font-black text-[#131313] mb-2">{result.ok ? "주문이 완료되었습니다" : "결제 실패"}</h1>
          <p className="text-sm text-[#4b4b4b] leading-relaxed mb-8 break-keep">{result.message}</p>
          {result.ok && myXp != null && (
            <div className="bg-[#f5f3f0] rounded-xl px-5 py-3 mb-8 flex items-center justify-between text-[13px]">
              <span className="text-[#5a5a5a]">남은 XP</span>
              <span className="font-black text-[#131313] tabular-nums">{myXp.toLocaleString()}</span>
            </div>
          )}
          <div className="flex gap-3">
            <Link href="/level?tab=arctic" className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e2e0dc] transition-colors">상점으로</Link>
            {!result.ok && (
              <button onClick={() => setResult(null)} className="flex-1 py-3.5 bg-[#e91e3f] text-white font-bold rounded-xl hover:bg-[#d01634] transition-colors">다시 시도</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen">
        <ArcticHeader />
        <div className="py-32 text-center break-keep px-6">
          <h1 className="text-2xl font-black text-[#131313] mb-3">장바구니가 비어 있습니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">상점에서 마음에 드는 상품을 담아보세요.</p>
          <Link href="/level?tab=arctic" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">상점으로 가기</Link>
        </div>
      </div>
    );
  }

  const checkbox = (checked: boolean) =>
    `w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
      checked ? "bg-[#e91e3f] border-[#e91e3f]" : "bg-white border-[#d6d3ce]"
    }`;

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      <ArcticHeader />
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-20">
        <Link href="/level?tab=arctic" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-5 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          계속 쇼핑하기
        </Link>
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-10">결제</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 좌 — 주문 상품 · 수령 정보 · 약관 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 주문 상품 */}
            <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
              <div className="px-6 py-4 border-b border-[#ececea]">
                <h2 className="text-sm font-black text-[#131313]">주문 상품 <span className="text-[#e91e3f]">{count}</span></h2>
              </div>
              <div className="divide-y divide-[#ececea]">
                {rows.map((r) => (
                  <div key={r.itemId} className="px-6 py-4 flex gap-4 items-center">
                    <div className="w-14 h-14 rounded-xl bg-[#eceae6] overflow-hidden shrink-0">
                      {r.item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.item.imageUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-[#131313] truncate flex items-center gap-1.5">
                        {r.item.name}
                        {(r.days ?? 0) > 0 && <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#131313] text-white text-[10px] font-black">{durationLabel(r.days)}</span>}
                      </h3>
                      <p className="text-[10px] font-bold text-[#8a8a8a] mt-0.5">
                        {r.item.type === "physical" ? "기프트카드" : r.item.type === "perk" ? "권한" : "역할"} · 수량 {r.qty}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-black tabular-nums">{(salePrice(r.item) * r.qty).toLocaleString()} XP</div>
                      {salePrice(r.item) < r.item.price && (
                        <div className="text-[10px] text-[#a3a3a3] line-through tabular-nums">{(r.item.price * r.qty).toLocaleString()} XP</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 수령 정보 */}
            {needsContact && (
              <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6">
                <h2 className="text-sm font-black text-[#131313] mb-1">수령 정보 <span className="text-[#c62828]">*</span></h2>
                <p className="text-[11px] text-[#8a8a8a] mb-4">기프트카드가 포함되어 있습니다. 받으실 연락처를 입력해주세요.</p>
                <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                  placeholder="휴대폰 번호 또는 기프티콘 받을 정보를 입력해주세요."
                  className="w-full bg-white border border-[#e2e0dc] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] resize-none placeholder:text-[#a3a3a3]" />
                <p className="text-[10px] text-[#a3a3a3] mt-2">운영진만 확인하며, 발송 목적으로만 사용됩니다.</p>
              </div>
            )}

            {/* 약관 동의 */}
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6">
              <h2 className="text-sm font-black text-[#131313] mb-4">약관 동의</h2>

              <button type="button" onClick={() => setAgreeTerms(!agreeTerms)} className="w-full flex items-start gap-3 text-left mb-3">
                <span className={checkbox(agreeTerms)}>
                  {agreeTerms && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className="text-[13px] text-[#4b4b4b] leading-relaxed">
                  <span className="font-bold text-[#131313]">[필수]</span> 이용약관 및 개인정보 처리방침에 동의합니다.{" "}
                  <Link href="/policy" target="_blank" className="text-[#e91e3f] underline underline-offset-2" onClick={(e) => e.stopPropagation()}>내용 보기</Link>
                </span>
              </button>

              <button type="button" onClick={() => setAgreeFinal(!agreeFinal)} className="w-full flex items-start gap-3 text-left">
                <span className={checkbox(agreeFinal)}>
                  {agreeFinal && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                </span>
                <span className="text-[13px] text-[#4b4b4b] leading-relaxed">
                  <span className="font-bold text-[#131313]">[필수]</span> 결제 후에는 직접 취소할 수 없으며, XP는 즉시 차감됨을 확인했습니다.
                </span>
              </button>
            </div>
          </div>

          {/* 우 — 결제 요약 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 lg:sticky lg:top-24">
              <h2 className="text-sm font-black text-[#131313] mb-5">결제 정보</h2>

              {/* 쿠폰 — 보유 쿠폰에서 고르거나 코드 입력 (선택) */}
              <div className="mb-5">
                <label className="block text-[11px] font-bold text-[#4b4b4b] mb-2">쿠폰 <span className="text-[#a3a3a3] font-medium">(선택)</span></label>

                {coupon ? (
                  <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-[#e91e3f]/[0.07] border border-[#e91e3f]/25">
                    <div className="min-w-0">
                      <div className="text-[12px] font-black text-[#e91e3f] truncate">{coupon.name || "할인 쿠폰"}</div>
                      <div className="text-[10px] font-bold text-[#8a8a8a]">
                        {coupon.type === "percent" ? `${coupon.value}% 할인` : `${coupon.value.toLocaleString()} XP 할인`}
                      </div>
                    </div>
                    <button onClick={() => { setCoupon(null); setCouponInput(""); }} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] shrink-0">해제</button>
                  </div>
                ) : (
                  <>
                    {/* 보유 쿠폰 — 항상 보이는 진입 버튼 */}
                    <button
                      onClick={() => { if (!showCouponPicker) setPendingCouponId(wallet.find((w: any) => w.code === coupon?.code)?.id ?? null); setShowCouponPicker(!showCouponPicker); }}
                      disabled={wallet.length === 0}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-3 mb-2 rounded-xl border text-left transition-colors ${
                        wallet.length === 0
                          ? "border-[#e2e0dc] bg-[#fafaf9] cursor-not-allowed"
                          : "border-[#e2e0dc] bg-white hover:border-[#a3a3a3]"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-[12px] font-bold text-[#131313]">
                          보유 쿠폰에서 선택
                          {wallet.length > 0 && (
                            <span className="ml-1.5 text-[#e91e3f]">{wallet.filter((w) => w.usable).length}장</span>
                          )}
                        </span>
                        <span className="block text-[10px] text-[#8a8a8a] mt-0.5">
                          {wallet.length === 0 ? "보유한 쿠폰이 없습니다" : "받아둔 쿠폰을 골라 적용합니다"}
                        </span>
                      </span>
                      {wallet.length > 0 && (
                        <svg className={`w-3.5 h-3.5 text-[#a3a3a3] shrink-0 transition-transform ${showCouponPicker ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      )}
                    </button>

                    {/* 보유 쿠폰 목록 — 하나만 고른 뒤 '적용'을 눌러야 반영된다 */}
                    {showCouponPicker && wallet.length > 0 && (
                      <div className="mb-2 rounded-xl border border-[#e2e0dc] overflow-hidden">
                        <div className="divide-y divide-[#ececea] max-h-56 overflow-y-auto">
                          {wallet.map((w) => {
                            const picked = pendingCouponId === w.id;
                            return (
                              <button key={w.id} onClick={() => w.usable && setPendingCouponId(w.id)} disabled={!w.usable}
                                className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${picked ? "bg-[#e91e3f]/[0.06]" : w.usable ? "hover:bg-[#f5f3f0]" : "opacity-50 cursor-not-allowed"}`}>
                                {/* 선택 표시 — 하나만 고를 수 있다 */}
                                <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${picked ? "border-[#e91e3f]" : "border-[#d6d3ce]"}`}>
                                  {picked && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className={`text-[12px] font-bold truncate ${picked ? "text-[#e91e3f]" : "text-[#131313]"}`}>{w.name}</span>
                                    {w.usable && <span className="text-[12px] font-black text-[#e91e3f] tabular-nums shrink-0">-{w.discount.toLocaleString()}</span>}
                                  </div>
                                  <div className="text-[10px] text-[#8a8a8a] mt-0.5 break-keep">
                                    {w.usable
                                      ? w.type === "percent" ? `${w.value}% 할인` : `${w.value.toLocaleString()} XP 할인`
                                      : w.reason}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="px-4 py-3 border-t border-[#ececea] bg-[#faf9f7] flex items-center justify-between gap-3">
                          <span className="text-[10px] text-[#8a8a8a] break-keep">쿠폰은 한 장만 사용할 수 있습니다.</span>
                          <button onClick={applyPendingCoupon} disabled={!pendingCouponId}
                            className="px-4 py-2 rounded-full bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] font-bold transition-colors shrink-0">
                            적용
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 코드 직접 입력 */}
                    <div className="flex items-center gap-2 my-2">
                      <span className="flex-1 h-px bg-[#ececea]"></span>
                      <span className="text-[10px] font-bold text-[#a3a3a3]">또는 코드 입력</span>
                      <span className="flex-1 h-px bg-[#ececea]"></span>
                    </div>
                    <div className="flex gap-2">
                      <input type="text" value={couponInput} onChange={(e) => setCouponInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
                        placeholder="쿠폰 코드 입력"
                        className="flex-1 min-w-0 bg-white border border-[#e2e0dc] rounded-lg px-3 py-2.5 text-[13px] text-[#131313] outline-none focus:border-[#e91e3f] uppercase placeholder:normal-case placeholder:text-[#a3a3a3]" />
                      <button onClick={applyCoupon} disabled={isCheckingCoupon || !couponInput.trim()}
                        className="px-4 py-2.5 rounded-lg bg-[#131313] text-white text-[12px] font-bold hover:bg-black disabled:opacity-40 transition-colors shrink-0">
                        {isCheckingCoupon ? "확인" : "적용"}
                      </button>
                    </div>
                  </>
                )}
                {couponMsg && <p className={`mt-2 text-[11px] font-bold ${couponMsgOk ? "text-[#3f7a35]" : "text-[#c62828]"}`}>{couponMsg}</p>}
              </div>

              <div className="space-y-2.5 text-[13px] mb-4">
                <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 수</span><span className="font-bold tabular-nums">{count}개</span></div>
                <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 금액</span><span className="font-bold tabular-nums">{listTotal.toLocaleString()}</span></div>
                {itemDiscount > 0 && (
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">상품 할인</span><span className="font-bold text-[#e91e3f] tabular-nums">-{itemDiscount.toLocaleString()}</span></div>
                )}
                {couponDiscount > 0 && (
                  <div className="flex justify-between"><span className="text-[#5a5a5a]">쿠폰 할인</span><span className="font-bold text-[#e91e3f] tabular-nums">-{couponDiscount.toLocaleString()}</span></div>
                )}
                <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#c62828] tabular-nums">-{total.toLocaleString()}</span></div>
              </div>

              <div className="h-px bg-[#ececea] mb-4"></div>

              <div className="flex items-baseline justify-between mb-6">
                <span className="text-sm font-bold text-[#131313]">결제 후 잔액</span>
                <span className={`text-xl font-black tabular-nums ${enoughXp ? "text-[#131313]" : "text-[#c62828]"}`}>
                  {Math.max(0, (myXp ?? 0) - total).toLocaleString()}
                </span>
              </div>

              <button onClick={pay} disabled={!canPay}
                className={`w-full py-4 font-bold rounded-xl transition-colors ${
                  canPay ? "bg-[#e91e3f] text-white hover:bg-[#d01634]" : "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                }`}>
                {isPaying ? "결제 중..." : !enoughXp ? "XP가 부족합니다" : `${total.toLocaleString()} XP 결제하기`}
              </button>

              {!canPay && enoughXp && !isPaying && (
                <p className="mt-3 text-center text-[11px] text-[#8a8a8a]">
                  {needsContact && !contact.trim() ? "수령 정보를 입력해주세요" : "필수 약관에 동의해주세요"}
                </p>
              )}

              <p className="mt-4 text-[10px] text-[#a3a3a3] leading-relaxed break-keep">
                역할 상품은 결제 후 30초 이내에 봇이 자동 지급합니다. 기프트카드는 운영진 확인 후 순차 발송됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>
      <ArcticFooter />
      <ArcticDock />
    </div>
  );
}
