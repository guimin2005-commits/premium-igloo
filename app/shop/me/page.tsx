"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { salePrice, durationLabel, remainLabel } from "@/lib/shopPricing";
import ArcticHeader from "../ArcticHeader";
import ArcticDock from "../ArcticDock";
import ArcticFooter from "../ArcticFooter";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "처리 대기", cls: "bg-[#fdf3e3] text-[#a8763a]" },
  completed: { label: "완료", cls: "bg-[#e8f3e6] text-[#3f7a35]" },
  cancelled: { label: "취소", cls: "bg-[#fdeaea] text-[#c62828]" },
  expired: { label: "기간 만료", cls: "bg-[#efedea] text-[#8a8a8a]" },
};
const TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };

const fmtDate = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

// 📌 ARCTIC 마이페이지 — 내 XP·주문·찜·쿠폰·문의를 한 화면에서
export default function ShopMePage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const [me, setMe] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any[]>([]);
  const [wish, setWish] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    try {
      const raw = localStorage.getItem("iglooShopWish");
      if (raw) setWish(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("iglooShopWish", JSON.stringify(wish)); } catch {}
  }, [wish]);

  const load = useCallback(() => {
    if (status === "loading") return;
    Promise.all([
      fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/items", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/my-coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([m, ord, it, cou]) => {
      if (m?.success) setMe(m.data);
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      setItems(Array.isArray(it?.data) ? it.data : []);
      setWallet(Array.isArray(cou?.data) ? cou.data : []);
    }).finally(() => setIsLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const wishRows = useMemo(() => items.filter((i) => wish.includes(i._id)), [items, wish]);
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const totalSpent = orders.filter((o) => o.status !== "cancelled").reduce((n, o) => n + (o.price || 0), 0);

  const removeWish = (id: string) => setWish((prev) => prev.filter((x) => x !== id));

  // 장바구니 — 로컬 보관분을 최신 상품 정보와 합쳐 보여준다
  const [cart, setCart] = useState<{ itemId: string; qty: number }[]>([]);
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

  const cartRows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item),
    [cart, items]
  );
  const cartTotal = cartRows.reduce((n, r) => n + salePrice(r.item) * r.qty, 0);
  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.itemId !== id));

  // 쿠폰 코드 등록 — 내 지갑에 담는다
  const [codeInput, setCodeInput] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const registerCode = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code || isRegistering) return;
    setIsRegistering(true);
    setCodeMsg(null);
    try {
      const res = await fetch("/api/shop/my-coupons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCodeMsg({ ok: true, text: d.message || "쿠폰을 받았습니다." });
        setCodeInput("");
        load();
      } else {
        setCodeMsg({ ok: false, text: d.message || "사용할 수 없는 코드입니다." });
      }
    } catch {
      setCodeMsg({ ok: false, text: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsRegistering(false);
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
        <div className="py-32 text-center px-6 break-keep">
          <h1 className="text-2xl font-black text-[#131313] mb-3">로그인이 필요합니다</h1>
          <p className="text-sm text-[#4b4b4b] mb-7">내 정보를 보려면 로그인해주세요.</p>
          <button onClick={() => signIn("discord")} className="px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드 로그인</button>
        </div>
      </div>
    );
  }

  const progress = me?.levelProgress;

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      <ArcticHeader />

      <section className="max-w-5xl mx-auto px-6 pt-10 pb-32 md:pb-24">
        <Link href="/shop" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-5 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          계속 쇼핑하기
        </Link>

        {/* 프로필 + XP */}
        <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 mb-6">
          <div className="flex items-center gap-4 mb-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={session?.user?.image || ""} alt="" className="w-14 h-14 rounded-full bg-[#e2e0dc] shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg font-black text-[#131313] truncate">{session?.user?.name}</h1>
              <p className="text-[12px] font-bold text-[#8a8a8a]">Lv.{me?.level ?? 0} · 서버 #{me?.rank ?? "—"}</p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <div className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase mb-1">Balance</div>
              <div className="text-2xl font-black tracking-tight tabular-nums text-[#131313]">
                {(me?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#e91e3f] ml-1">XP</span>
              </div>
            </div>
          </div>

          {progress?.required > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#8a8a8a]">다음 레벨까지</span>
                <span className="text-[11px] font-bold text-[#4b4b4b] tabular-nums">{progress.needToNext.toLocaleString()} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#eceae6] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] transition-[width] duration-700"
                  style={{ width: `${Math.min(100, Math.round((progress.current / progress.required) * 100))}%` }}></div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 mt-6 pt-5 border-t border-[#ececea] divide-x divide-[#ececea]">
            {[
              { n: orders.length, l: "전체 주문" },
              { n: pendingCount, l: "처리 대기", accent: pendingCount > 0 },
              { n: totalSpent, l: "사용한 XP" },
            ].map((s, i) => (
              <div key={i} className="text-center break-keep">
                <div className={`text-lg font-black tabular-nums ${s.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{s.n.toLocaleString()}</div>
                <div className="text-[10px] font-bold tracking-[0.12em] text-[#8a8a8a] mt-0.5 uppercase">{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 주문 내역 */}
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
              <h2 className="text-sm font-black text-[#131313]">주문 내역 {orders.length > 0 && <span className="text-[#e91e3f]">{orders.length}</span>}</h2>
              {orders.length > 0 && (
                <Link href="/shop/orders" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">자세히 보기</Link>
              )}
            </div>
            {orders.length === 0 ? (
              <p className="px-5 py-12 text-center text-xs text-[#8a8a8a] break-keep">아직 구매한 상품이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#ececea] max-h-[320px] overflow-y-auto">
                {orders.slice(0, 8).map((o) => {
                  const meta = STATUS_META[o.status] || STATUS_META.pending;
                  return (
                    <div key={o._id} className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${meta.cls}`}>{meta.label}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/shop/item/${o.itemId}`}
                            className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">
                            {o.itemName}
                          </Link>
                          <p className="text-[10px] text-[#a3a3a3]">
                            {TYPE_LABEL[o.itemType] || "상품"} · {fmtDate(o.createdAt)}
                            {o.days > 0 && <span className="text-[#5a5a5a] font-bold"> · {durationLabel(o.days)}권</span>}
                          </p>
                          {o.days > 0 && o.expiresAt && o.status !== "cancelled" && (
                            <p className={`text-[10px] font-bold mt-0.5 ${o.status === "expired" || new Date(o.expiresAt) <= new Date() ? "text-[#a3a3a3]" : "text-[#e91e3f]"}`}>
                              {remainLabel(o.expiresAt)}{o.status !== "expired" && new Date(o.expiresAt) > new Date() ? ` · ${fmtDate(o.expiresAt)}까지` : ""}
                            </p>
                          )}
                        </div>
                        <span className={`text-[12px] font-black tabular-nums shrink-0 ${o.status === "cancelled" ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>
                          -{(o.price || 0).toLocaleString()} XP
                        </span>
                      </div>

                      {/* 처리 상황 */}
                      {o.contact && (
                        <p className="mt-2 text-[10px] text-[#8a8a8a] truncate break-keep">수령 정보 · {o.contact}</p>
                      )}
                      {o.adminNote && (
                        <p className="mt-1.5 text-[10px] text-[#3f7a35] bg-[#e8f3e6] rounded px-2 py-1 break-keep">운영진 메모 · {o.adminNote}</p>
                      )}
                      {o.error && (
                        <p className="mt-1.5 text-[10px] text-[#c62828] bg-[#fdeaea] rounded px-2 py-1 break-keep">지급 실패 · {o.error}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 장바구니 */}
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
              <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#131313]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                장바구니 {cartRows.length > 0 && <span className="text-[#e91e3f]">{cartRows.length}</span>}
              </h2>
              {cartRows.length > 0 && (
                <Link href="/shop/cart" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">자세히 보기</Link>
              )}
            </div>
            {cartRows.length === 0 ? (
              <p className="px-5 py-12 text-center text-xs text-[#8a8a8a] break-keep">장바구니가 비어 있습니다.</p>
            ) : (
              <>
                <div className="divide-y divide-[#ececea] max-h-[260px] overflow-y-auto">
                  {cartRows.map((r) => (
                    <div key={r.itemId} className="px-5 py-3.5 flex items-center gap-3">
                      <Link href={`/shop/item/${r.item._id}`} className="w-11 h-11 rounded-lg bg-[#eceae6] overflow-hidden shrink-0">
                        {r.item.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.item.imageUrl} alt="" className="w-full h-full object-cover" />
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/shop/item/${r.item._id}`}
                          className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">
                          {r.item.name}
                        </Link>
                        <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(r.item).toLocaleString()} XP</p>
                      </div>
                      <button onClick={() => removeFromCart(r.itemId)}
                        className="px-3 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors shrink-0">삭제</button>
                    </div>
                  ))}
                </div>
                <div className="px-5 py-4 border-t border-[#ececea] flex items-center justify-between gap-3">
                  <div className="text-[12px]">
                    <span className="text-[#5a5a5a]">합계 </span>
                    <span className="font-black text-[#131313] tabular-nums">{cartTotal.toLocaleString()} XP</span>
                  </div>
                  <Link href="/shop/cart"
                    className="px-5 py-2.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[12px] font-bold transition-colors shrink-0">
                    결제하러 가기
                  </Link>
                </div>
              </>
            )}
          </div>

          {/* 찜 목록 */}
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea]">
              <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
                <svg className="w-3.5 h-3.5 text-[#e91e3f]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                찜한 상품 {wishRows.length > 0 && <span className="text-[#e91e3f]">{wishRows.length}</span>}
              </h2>
            </div>
            {wishRows.length === 0 ? (
              <p className="px-5 py-12 text-center text-xs text-[#8a8a8a]">찜한 상품이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#ececea] max-h-[320px] overflow-y-auto">
                {wishRows.map((it) => (
                  <div key={it._id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-[#eceae6] overflow-hidden shrink-0">
                      {it.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#131313] truncate">{it.name}</p>
                      <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(it).toLocaleString()} XP</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Link href="/shop" className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#e91e3f] text-white hover:bg-[#d01634] transition-colors text-center">보러가기</Link>
                      <button onClick={() => removeWish(it._id)} className="px-3 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors">해제</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 보유 쿠폰 */}
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea]">
              <h2 className="text-sm font-black text-[#131313]">보유 쿠폰 {wallet.length > 0 && <span className="text-[#e91e3f]">{wallet.length}</span>}</h2>
            </div>

            {/* 쿠폰 코드 등록 */}
            <div className="px-5 pt-4 pb-3 border-b border-[#ececea]">
              <div className="flex gap-2">
                <input type="text" value={codeInput} onChange={(e) => setCodeInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") registerCode(); }}
                  placeholder="쿠폰 코드 입력"
                  className="flex-1 min-w-0 bg-white border border-[#e2e0dc] rounded-lg px-3 py-2.5 text-[13px] text-[#131313] outline-none focus:border-[#e91e3f] uppercase placeholder:normal-case placeholder:text-[#a3a3a3]" />
                <button onClick={registerCode} disabled={!codeInput.trim() || isRegistering}
                  className="px-4 py-2.5 rounded-lg bg-[#131313] hover:bg-black text-white text-[12px] font-bold disabled:opacity-40 transition-colors shrink-0">
                  {isRegistering ? "확인" : "등록"}
                </button>
              </div>
              {codeMsg && (
                <p className={`mt-2 text-[11px] font-bold ${codeMsg.ok ? "text-[#3f7a35]" : "text-[#c62828]"}`}>{codeMsg.text}</p>
              )}
            </div>

            {wallet.length === 0 ? (
              <p className="px-5 py-12 text-center text-xs text-[#8a8a8a]">보유한 쿠폰이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#ececea] max-h-[280px] overflow-y-auto">
                {wallet.map((w) => (
                  <div key={w.id} className="px-5 py-3.5 flex items-center gap-3">
                    {/* 쿠폰 아이콘 */}
                    <span className="w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center shrink-0">
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-bold text-[#131313] truncate">{w.name}</p>
                      <p className="text-[10px] text-[#8a8a8a] break-keep">
                        {w.type === "percent" ? `${w.value}% 할인` : `${w.value.toLocaleString()} XP 할인`}
                        {w.minTotal > 0 && ` · ${w.minTotal.toLocaleString()} XP 이상`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 문의 — 접수는 1:1 문의에서만 받는다 */}
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
              <h2 className="text-sm font-black text-[#131313]">문의</h2>
              <Link href="/profile?tab=inquiry" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">내 문의 보기</Link>
            </div>
            <div className="p-5">
              <p className="text-[12px] text-[#8a8a8a] mb-4 break-keep">상품·지급 관련 문의는 1:1 문의로 접수해 주세요.</p>
              <Link href="/support"
                className="w-full flex items-center justify-center gap-1.5 py-3.5 rounded-xl bg-[#131313] hover:bg-black text-white text-[13px] font-bold transition-colors">
                1:1 문의로 이동
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </Link>
            </div>
          </div>
        </div>
      </section>
      <ArcticFooter />
      <ArcticDock />
    </div>
  );
}
