"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";

// 📌 XP SHOP — 사이트 전체(다크)와 달리 포근한 베이지 톤의 상점 공간
const SORTS = [
  { v: "recommended", l: "추천순" },
  { v: "priceAsc", l: "낮은 가격순" },
  { v: "priceDesc", l: "높은 가격순" },
  { v: "newest", l: "최신순" },
  { v: "popular", l: "인기순" },
];

const TYPES = [
  { v: "all", l: "전체" },
  { v: "role", l: "역할 · 권한" },
  { v: "physical", l: "실물 혜택" },
];

const PRICE_RANGES = [
  { v: "all", l: "전체", min: 0, max: Infinity },
  { v: "u100k", l: "10만 XP 미만", min: 0, max: 100000 },
  { v: "100k-500k", l: "10만 ~ 50만", min: 100000, max: 500000 },
  { v: "500k-1m", l: "50만 ~ 100만", min: 500000, max: 1000000 },
  { v: "o1m", l: "100만 XP 이상", min: 1000000, max: Infinity },
];

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "지급 완료", cancelled: "취소됨" };

export default function ShopPage() {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";

  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myLevel, setMyLevel] = useState(0);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 필터·정렬·검색
  const [sort, setSort] = useState("recommended");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [query, setQuery] = useState("");

  // 구매 모달
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [showOrders, setShowOrders] = useState(false);

  const loadMine = useCallback(() => {
    if (!isLoggedIn) return;
    fetch("/api/xp/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) { setMyXp(d.data.xp); setMyLevel(d.data.level); } })
      .catch(() => {});
    fetch("/api/shop/purchase", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setOrders(d.data); })
      .catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    fetch("/api/shop/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const visible = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.v === priceFilter) || PRICE_RANGES[0];
    const q = query.trim().toLowerCase();

    const filtered = items.filter((it) => {
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      if (it.price < range.min || it.price >= range.max) return false;
      if (inStockOnly && it.stock === 0) return false;
      if (affordableOnly && myXp != null && it.price > myXp) return false;
      if (q && !`${it.name} ${it.description} ${it.roleName || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === "priceAsc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "priceDesc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "newest") sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sort === "popular") sorted.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    else sorted.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [items, typeFilter, priceFilter, inStockOnly, affordableOnly, query, sort, myXp]);

  const openBuy = (item: any) => {
    if (!isLoggedIn) return signIn("discord");
    setContact("");
    setResult(null);
    setBuyTarget(item);
  };

  const confirmBuy = async () => {
    if (!buyTarget || isBuying) return;
    setIsBuying(true);
    try {
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: buyTarget._id, contact }),
      });
      const d = await res.json();
      setResult({ ok: !!d.success, message: d.message || (d.success ? "구매가 완료되었습니다." : "구매에 실패했습니다.") });
      if (d.success) {
        if (typeof d.data?.remainXp === "number") setMyXp(d.data.remainXp);
        setItems((prev) => prev.map((it) => (it._id === buyTarget._id ? { ...it, stock: it.stock > 0 ? it.stock - 1 : it.stock, soldCount: (it.soldCount || 0) + 1 } : it)));
        loadMine();
      }
    } catch {
      setResult({ ok: false, message: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsBuying(false);
    }
  };

  const canAfford = (p: number) => myXp != null && myXp >= p;
  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
      active ? "bg-[#8a6f52] text-[#fdfaf5] border-[#8a6f52]" : "bg-white/70 text-[#6b5842] border-[#e0d3c0] hover:border-[#b9a488]"
    }`;

  return (
    <div className="w-full flex-1 bg-[#f6efe4] text-[#3d3226] min-h-screen">
      {/* ── 상단 배너 ── */}
      <section className="w-full bg-gradient-to-b from-[#efe3d2] to-[#f6efe4] border-b border-[#e2d5c2]">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-px bg-[#a8896a]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-[#a8896a] uppercase">Premium Igloo</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-[#3d3226] mb-3">XP SHOP</h1>
          <p className="text-sm md:text-base text-[#6b5842] leading-relaxed mb-8">
            쌓아온 XP로 역할과 혜택을 만나보세요. 역할 상품은 구매 즉시 자동 지급됩니다.
          </p>

          {/* 보유 XP */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8">
            <div className="bg-white/80 border border-[#e0d3c0] rounded-2xl px-6 py-4 shadow-[0_2px_12px_rgba(160,130,100,0.08)]">
              <div className="text-[10px] font-black tracking-[0.2em] text-[#a8896a] uppercase mb-1">My Balance</div>
              {!isLoggedIn ? (
                <button onClick={() => signIn("discord")} className="text-sm font-bold text-[#8a6f52] underline underline-offset-4">
                  로그인하고 보유 XP 확인하기
                </button>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black tracking-tight tabular-nums text-[#3d3226]">
                    {myXp == null ? "—" : myXp.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-[#8a6f52]">XP</span>
                  <span className="ml-2 text-[11px] font-bold text-[#a8896a]">Lv.{myLevel}</span>
                </div>
              )}
            </div>

            {isLoggedIn && (
              <button onClick={() => setShowOrders(true)}
                className="self-start sm:self-auto text-[12px] font-bold text-[#8a6f52] hover:text-[#3d3226] underline underline-offset-4 pb-2">
                구매 내역 {orders.length > 0 && `(${orders.length})`}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 검색 · 필터 ── */}
      <section className="max-w-6xl mx-auto px-6 pt-8">
        <div className="relative mb-5">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명, 설명, 역할로 검색"
            className="w-full bg-white border border-[#e0d3c0] rounded-full pl-12 pr-5 py-3.5 text-sm text-[#3d3226] outline-none focus:border-[#a8896a] transition-colors placeholder:text-[#b9a488]"
          />
          <svg className="absolute left-4.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#b9a488] pointer-events-none" style={{ left: "1.1rem" }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {TYPES.map((t) => (
            <button key={t.v} onClick={() => setTypeFilter(t.v)} className={chip(typeFilter === t.v)}>{t.l}</button>
          ))}
          <span className="w-px h-5 bg-[#e0d3c0] mx-1"></span>
          {PRICE_RANGES.map((r) => (
            <button key={r.v} onClick={() => setPriceFilter(r.v)} className={chip(priceFilter === r.v)}>{r.l}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#e2d5c2]">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setInStockOnly(!inStockOnly)} className={chip(inStockOnly)}>재고 있는 상품만</button>
            {isLoggedIn && (
              <button onClick={() => setAffordableOnly(!affordableOnly)} className={chip(affordableOnly)}>구매 가능한 상품만</button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-[#a8896a]">{visible.length}개</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="bg-white border border-[#e0d3c0] rounded-full px-4 py-2 text-[12px] font-bold text-[#6b5842] outline-none focus:border-[#a8896a] cursor-pointer">
              {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
            </select>
          </div>
        </div>
      </section>

      {/* ── 상품 목록 ── */}
      <section className="max-w-6xl mx-auto px-6 py-10 pb-24">
        {isLoading ? (
          <div className="py-24 text-center text-sm text-[#a8896a]">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm font-bold text-[#6b5842] mb-1">조건에 맞는 상품이 없습니다.</p>
            <p className="text-xs text-[#a8896a]">필터를 조정하거나 다른 검색어를 입력해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((it) => {
              const soldOut = it.stock === 0;
              const affordable = canAfford(it.price);
              return (
                <div key={it._id} className="group bg-white rounded-2xl border border-[#e8dccb] overflow-hidden shadow-[0_2px_12px_rgba(160,130,100,0.06)] hover:shadow-[0_8px_28px_rgba(160,130,100,0.16)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
                  {/* 이미지 */}
                  <div className="relative aspect-[4/3] bg-[#f0e7da] overflow-hidden">
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#cbb89e]">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                        </svg>
                      </div>
                    )}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${it.type === "role" ? "bg-[#8a6f52] text-[#fdfaf5]" : "bg-[#c98a5e] text-white"}`}>
                      {it.type === "role" ? "역할 · 자동 지급" : "실물 혜택"}
                    </span>
                    {soldOut && (
                      <div className="absolute inset-0 bg-[#3d3226]/55 flex items-center justify-center">
                        <span className="text-sm font-black text-white tracking-wider">SOLD OUT</span>
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-base font-black text-[#3d3226] tracking-tight mb-1.5 break-keep">{it.name}</h3>
                    {it.description && (
                      <p className="text-[12px] text-[#7a6851] leading-relaxed mb-3 line-clamp-2 break-keep">{it.description}</p>
                    )}

                    <div className="flex items-center gap-2 mb-4 text-[11px] font-bold text-[#a8896a]">
                      {it.stock < 0 ? <span>재고 무제한</span> : <span>남은 수량 {it.stock}개</span>}
                      {it.soldCount > 0 && <><span className="text-[#e0d3c0]">·</span><span>{it.soldCount}개 판매</span></>}
                    </div>

                    <div className="mt-auto flex items-end justify-between gap-3">
                      <div>
                        <div className="text-xl font-black text-[#3d3226] tracking-tight tabular-nums">{it.price.toLocaleString()}</div>
                        <div className="text-[10px] font-bold text-[#a8896a] tracking-wider">XP</div>
                      </div>
                      <button
                        onClick={() => openBuy(it)}
                        disabled={soldOut}
                        className={`px-5 py-2.5 rounded-full text-[12px] font-bold transition-all ${
                          soldOut
                            ? "bg-[#e8dccb] text-[#b9a488] cursor-not-allowed"
                            : isLoggedIn && !affordable
                            ? "bg-[#efe3d2] text-[#a8896a] hover:bg-[#e8dccb]"
                            : "bg-[#8a6f52] text-[#fdfaf5] hover:bg-[#6f5940] shadow-[0_4px_12px_rgba(138,111,82,0.25)]"
                        }`}
                      >
                        {soldOut ? "품절" : !isLoggedIn ? "로그인" : affordable ? "구매하기" : "XP 부족"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 구매 모달 ── */}
      {buyTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#3d3226]/60 backdrop-blur-sm p-4">
          <div className="bg-[#fdfaf5] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-[#e8dccb]">
            {result ? (
              <div className="p-8 text-center">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5 ${result.ok ? "bg-[#e6efe2] text-[#5b8a52]" : "bg-[#f6e4e4] text-[#c05656]"}`}>
                  {result.ok ? (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>
                <h2 className="text-lg font-black text-[#3d3226] mb-2">{result.ok ? "구매 완료" : "구매 실패"}</h2>
                <p className="text-sm text-[#6b5842] leading-relaxed mb-7 break-keep">{result.message}</p>
                <button onClick={() => { setBuyTarget(null); setResult(null); }} className="w-full py-3.5 bg-[#8a6f52] text-[#fdfaf5] font-bold rounded-xl hover:bg-[#6f5940] transition-colors">확인</button>
              </div>
            ) : (
              <>
                <div className="flex gap-4 p-6 border-b border-[#eee3d4]">
                  <div className="w-20 h-20 rounded-xl bg-[#f0e7da] overflow-hidden shrink-0">
                    {buyTarget.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={buyTarget.imageUrl} alt={buyTarget.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black mb-1.5 ${buyTarget.type === "role" ? "bg-[#8a6f52] text-[#fdfaf5]" : "bg-[#c98a5e] text-white"}`}>
                      {buyTarget.type === "role" ? "역할 · 자동 지급" : "실물 혜택"}
                    </span>
                    <h2 className="text-base font-black text-[#3d3226] truncate">{buyTarget.name}</h2>
                    <p className="text-sm font-black text-[#8a6f52] tabular-nums mt-0.5">{buyTarget.price.toLocaleString()} XP</p>
                  </div>
                </div>

                <div className="p-6">
                  {buyTarget.type === "physical" && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#6b5842] mb-2">수령 정보 <span className="text-[#c05656]">*</span></label>
                      <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                        placeholder="연락처 / 배송지 또는 기프티콘 받을 번호를 입력해주세요."
                        className="w-full bg-white border border-[#e0d3c0] rounded-xl px-4 py-3 text-sm text-[#3d3226] outline-none focus:border-[#a8896a] resize-none placeholder:text-[#b9a488]" />
                      <p className="text-[10px] text-[#a8896a] mt-1.5">운영진만 확인하며, 발송 목적으로만 사용됩니다.</p>
                    </div>
                  )}

                  <div className="bg-[#f6efe4] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#7a6851]">보유 XP</span><span className="font-bold text-[#3d3226] tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-[#7a6851]">결제 XP</span><span className="font-bold text-[#c05656] tabular-nums">-{buyTarget.price.toLocaleString()}</span></div>
                    <div className="h-px bg-[#e0d3c0]"></div>
                    <div className="flex justify-between"><span className="text-[#7a6851]">구매 후 잔액</span><span className="font-black text-[#3d3226] tabular-nums">{Math.max(0, (myXp ?? 0) - buyTarget.price).toLocaleString()}</span></div>
                  </div>

                  <p className="text-[11px] text-[#a8896a] leading-relaxed mb-5 break-keep">
                    {buyTarget.type === "role"
                      ? "구매 즉시 XP가 차감되며, 봇이 30초 이내에 역할을 지급합니다."
                      : "구매 즉시 XP가 차감되며, 운영진 확인 후 순차적으로 발송됩니다."}
                    {" "}구매 후에는 직접 취소할 수 없습니다.
                  </p>

                  <div className="flex gap-3">
                    <button onClick={() => setBuyTarget(null)} className="flex-1 py-3.5 bg-[#efe3d2] text-[#6b5842] font-bold rounded-xl hover:bg-[#e8dccb] transition-colors">취소</button>
                    <button onClick={confirmBuy} disabled={isBuying || !canAfford(buyTarget.price)}
                      className="flex-1 py-3.5 bg-[#8a6f52] text-[#fdfaf5] font-bold rounded-xl hover:bg-[#6f5940] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {isBuying ? "처리 중..." : canAfford(buyTarget.price) ? "구매 확정" : "XP 부족"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 구매 내역 ── */}
      {showOrders && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#3d3226]/60 backdrop-blur-sm p-4" onClick={() => setShowOrders(false)}>
          <div className="bg-[#fdfaf5] rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl border border-[#e8dccb] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#eee3d4] flex items-center justify-between">
              <h2 className="text-base font-black text-[#3d3226]">구매 내역</h2>
              <button onClick={() => setShowOrders(false)} className="p-1.5 text-[#a8896a] hover:text-[#3d3226] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              {orders.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-[#a8896a]">아직 구매한 상품이 없습니다.</p>
              ) : (
                <div className="divide-y divide-[#eee3d4]">
                  {orders.map((o) => (
                    <div key={o._id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-sm font-bold text-[#3d3226]">{o.itemName}</span>
                        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          o.status === "completed" ? "bg-[#e6efe2] text-[#5b8a52]"
                          : o.status === "cancelled" ? "bg-[#f6e4e4] text-[#c05656]"
                          : "bg-[#f5ead6] text-[#a8763a]"}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#a8896a]">
                        <span className="tabular-nums">-{o.price.toLocaleString()} XP</span>
                        <span>·</span>
                        <span>{new Date(o.createdAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                      {o.adminNote && <p className="mt-1.5 text-[11px] text-[#7a6851]">운영진 메모: {o.adminNote}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
