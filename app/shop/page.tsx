"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import Dropdown from "../components/Dropdown";
import { salePrice } from "@/lib/shopPricing";

const ADMIN_USERS = ["elahw.06"];

// 📌 IGLOO SHOP — 사이트 전체(다크)와 달리 메인 화면 라이트 패널 톤을 쓰는 상점 공간
//    공개 전에는 관리자만 볼 수 있다 (레벨 대시보드 → 기본 정책 → IGLOO SHOP 공개)
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
  { v: "physical", l: "기프트카드" },
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
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [shopPublic, setShopPublic] = useState<boolean | null>(null);
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
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // 📌 장바구니 — 로컬에 보관해 새로고침해도 유지 ([{ itemId, qty }])
  const [cart, setCart] = useState<{ itemId: string; qty: number }[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [cartToast, setCartToast] = useState("");

  // 배너를 지나 스크롤하면 상단에 컴팩트 바(보유 XP·장바구니)를 띄운다
  const [pastBanner, setPastBanner] = useState(false);
  useEffect(() => {
    const onScroll = () => setPastBanner(window.scrollY > 260);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("iglooShopCart");
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("iglooShopCart", JSON.stringify(cart)); } catch {}
  }, [cart]);

  const addToCart = (item: any) => {
    if (!isLoggedIn) return signIn("discord");
    setCart((prev) => {
      const found = prev.find((c) => c.itemId === item._id);
      // 한정 수량 상품은 재고를 넘겨 담지 않는다
      const max = item.stock < 0 ? 99 : item.stock;
      if (found) {
        if (found.qty >= max) return prev;
        return prev.map((c) => (c.itemId === item._id ? { ...c, qty: c.qty + 1 } : c));
      }
      return [...prev, { itemId: item._id, qty: 1 }];
    });
    setCartToast(`${item.name} 담김`);
    setTimeout(() => setCartToast(""), 1800);
  };

  const setQty = (itemId: string, qty: number) =>
    setCart((prev) => (qty <= 0 ? prev.filter((c) => c.itemId !== itemId) : prev.map((c) => (c.itemId === itemId ? { ...c, qty } : c))));
  const removeFromCart = (itemId: string) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));

  // 장바구니 줄 = 저장된 수량 + 최신 상품 정보
  const cartRows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item),
    [cart, items]
  );
  const cartCount = cartRows.reduce((n, r) => n + r.qty, 0);
  const cartTotal = cartRows.reduce((n, r) => n + salePrice(r.item) * r.qty, 0);

  // 관리자 — 상점 안에서 바로 상품 추가·수정
  const EMPTY_ITEM = { id: "", name: "", description: "", imageUrl: "", type: "role", roleId: "", roleName: "", price: "", stock: "", sortOrder: "", active: true };
  const [editForm, setEditForm] = useState<any>(null);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGuildRoles(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, [isAdmin]);

  const openEdit = (it?: any) => {
    setEditError("");
    setEditForm(it
      ? { id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "", type: it.type, roleId: it.roleId || "", roleName: it.roleName || "", price: String(it.price), stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active }
      : { ...EMPTY_ITEM });
  };

  const saveItem = async () => {
    if (!editForm || isSavingItem) return;
    setIsSavingItem(true);
    setEditError("");
    try {
      const role = guildRoles.find((r) => r.id === editForm.roleId);
      const res = await fetch("/api/shop/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, roleName: role?.name || editForm.roleName || "" }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setItems((prev) => {
          const exists = prev.some((x) => x._id === d.data._id);
          return exists ? prev.map((x) => (x._id === d.data._id ? d.data : x)) : [...prev, d.data];
        });
        setEditForm(null);
      } else {
        setEditError(d.message || "저장에 실패했습니다.");
      }
    } catch {
      setEditError("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setIsSavingItem(false);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/shop/items?id=${deleteTarget._id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setItems((prev) => prev.filter((x) => x._id !== deleteTarget._id));
    setDeleteTarget(null);
  };

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
    fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setShopPublic(!!d?.data?.shopPublic))
      .catch(() => setShopPublic(false));
  }, []);

  // 세션 확정 후 조회 — 공개 전에는 관리자 세션이 있어야 200이 온다
  // 관리자는 숨김 상품까지 함께 본다 (카드에 '숨김' 배지 표시)
  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [status, isAdmin]);

  useEffect(() => { loadMine(); }, [loadMine]);

  const visible = useMemo(() => {
    const range = PRICE_RANGES.find((r) => r.v === priceFilter) || PRICE_RANGES[0];
    const q = query.trim().toLowerCase();

    const filtered = items.filter((it) => {
      if (typeFilter !== "all" && it.type !== typeFilter) return false;
      const sp = salePrice(it);
      if (sp < range.min || sp >= range.max) return false;
      if (inStockOnly && it.stock === 0) return false;
      if (affordableOnly && myXp != null && sp > myXp) return false;
      if (q && !`${it.name} ${it.description} ${it.roleName || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === "priceAsc") sorted.sort((a, b) => salePrice(a) - salePrice(b));
    else if (sort === "priceDesc") sorted.sort((a, b) => salePrice(b) - salePrice(a));
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
      active ? "bg-[#e91e3f] text-[#ffffff] border-[#e91e3f]" : "bg-white/70 text-[#4b4b4b] border-[#e2e0dc] hover:border-[#a3a3a3]"
    }`;

  // 공개 전 · 비관리자 → 준비 중 안내
  if (status === "loading" || shopPublic === null) {
    return <div className="w-full flex-1 bg-[#f5f3f0] min-h-screen flex items-center justify-center text-sm text-[#8a8a8a]">불러오는 중...</div>;
  }
  if (!shopPublic && !isAdmin) {
    return (
      <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Coming Soon</span>
            <span className="w-8 h-px bg-[#e91e3f]"></span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-3">IGLOO SHOP 준비 중</h1>
          <p className="text-sm text-[#4b4b4b] leading-relaxed mb-8">
            쌓아온 XP로 역할과 혜택을 교환할 수 있는 상점을 준비하고 있습니다.<br />오픈 소식은 공지사항으로 안내드릴게요.
          </p>
          <Link href="/level" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            SYSTEM : LEVEL 보러가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#f5f3f0] text-[#131313] min-h-screen">
      {/* 공개 전 관리자 미리보기 배너 */}
      {!shopPublic && isAdmin && (
        <div className="w-full bg-[#e91e3f] text-white text-center py-2 px-6 text-[11px] font-bold tracking-wide">
          비공개 상태입니다 · 관리자만 볼 수 있습니다 ·{" "}
          <Link href="/admin/bot?tab=settings" className="underline underline-offset-2">기본 정책에서 공개 전환</Link>
        </div>
      )}
      {/* ── 상단 배너 ── */}
      <section className="w-full bg-gradient-to-b from-[#eceae6] to-[#f5f3f0] border-b border-[#e2e0dc]">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
          {/* 좌 — 타이틀 */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-px bg-[#8a8a8a]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Premium Igloo</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-[#131313] mb-3">IGLOO SHOP</h1>
            <p className="text-sm md:text-base text-[#4b4b4b] leading-relaxed break-keep">
              쌓아온 XP로 역할과 혜택을 만나보세요. 역할 상품은 구매 즉시 자동 지급됩니다.
            </p>

            {/* 관리자에게만 보이는 상품 관리 진입점 */}
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <button onClick={() => openEdit()}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#131313] hover:bg-black text-white text-[12px] font-bold rounded-full transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  상품 추가
                </button>
                <Link href="/admin/shop?tab=items"
                  className="text-[12px] font-bold text-[#4b4b4b] hover:text-[#131313] underline underline-offset-4">
                  전체 상품 관리
                </Link>
                <Link href="/admin/shop?tab=orders"
                  className="text-[12px] font-bold text-[#4b4b4b] hover:text-[#131313] underline underline-offset-4">
                  구매 관리
                </Link>
              </div>
            )}
          </div>

          {/* 우 — 내 XP·레벨 */}
          <div className="lg:w-72 shrink-0 bg-white border border-[#e2e0dc] rounded-2xl px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.05)]">
            <div className="text-[10px] font-black tracking-[0.2em] text-[#8a8a8a] uppercase mb-2">My Balance</div>
            {!isLoggedIn ? (
              <button onClick={() => signIn("discord")} className="text-sm font-bold text-[#e91e3f] underline underline-offset-4">
                로그인하고 보유 XP 확인하기
              </button>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black tracking-tight tabular-nums text-[#131313]">
                    {myXp == null ? "—" : myXp.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-[#e91e3f]">XP</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#ececea]">
                  <span className="text-[11px] font-bold text-[#8a8a8a]">현재 레벨 <span className="text-[#131313]">Lv.{myLevel}</span></span>
                  <button onClick={() => setShowOrders(true)} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] underline underline-offset-2">
                    구매 내역{orders.length > 0 ? ` ${orders.length}` : ""}
                  </button>
                </div>

                {/* 장바구니 진입 */}
                <button onClick={() => setShowCart(true)}
                  className="w-full mt-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-[#131313] hover:bg-black text-white transition-colors">
                  <span className="flex items-center gap-2.5">
                    <span className="relative">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                      {cartCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#e91e3f] text-[9px] font-black flex items-center justify-center">{cartCount}</span>
                      )}
                    </span>
                    <span className="text-[12px] font-bold">장바구니</span>
                  </span>
                  <span className="text-[12px] font-bold tabular-nums">{cartTotal.toLocaleString()} XP</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 검색 · 필터 ── */}
      <section className="max-w-6xl mx-auto px-6 pt-8">
        {/* 📌 아이콘 상태로 접혀 있다가 호버·포커스·입력 시 펼쳐지는 검색창
               (모바일은 터치라 호버가 없으므로 항상 펼친 상태) */}
        <div className="mb-5 flex justify-end">
          <div
            className={`group relative h-12 rounded-full bg-white border border-[#e2e0dc] transition-[width,border-color] duration-500 ease-out overflow-hidden
              w-full md:w-12 md:hover:w-80 md:focus-within:w-80 hover:border-[#a3a3a3] focus-within:border-[#e91e3f]
              ${query ? "md:w-80" : ""}`}
          >
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[#a3a3a3] group-focus-within:text-[#e91e3f] transition-colors pointer-events-none z-10"
              fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="상품명, 설명, 역할로 검색"
              className="absolute inset-0 w-full h-full bg-transparent pl-11 pr-10 text-sm text-[#131313] outline-none placeholder:text-[#a3a3a3]
                opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity duration-300"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="검색어 지우기"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#a3a3a3] hover:text-[#131313] transition-colors z-10">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {TYPES.map((t) => (
            <button key={t.v} onClick={() => setTypeFilter(t.v)} className={chip(typeFilter === t.v)}>{t.l}</button>
          ))}
          <span className="w-px h-5 bg-[#e2e0dc] mx-1"></span>
          {PRICE_RANGES.map((r) => (
            <button key={r.v} onClick={() => setPriceFilter(r.v)} className={chip(priceFilter === r.v)}>{r.l}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#e2e0dc]">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setInStockOnly(!inStockOnly)} className={chip(inStockOnly)}>재고 있는 상품만</button>
            {isLoggedIn && (
              <button onClick={() => setAffordableOnly(!affordableOnly)} className={chip(affordableOnly)}>구매 가능한 상품만</button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-bold text-[#8a8a8a]">{visible.length}개</span>
            <Dropdown
              theme="light"
              value={sort}
              onChange={setSort}
              options={SORTS.map((s) => ({ value: s.v, label: s.l }))}
              className="w-36"
              buttonClassName="!rounded-full !py-2 !text-[12px] !font-bold"
            />
          </div>
        </div>
      </section>

      {/* ── 상품 목록 ── */}
      <section className="max-w-6xl mx-auto px-6 py-10 pb-24">
        {isLoading ? (
          <div className="py-24 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-sm font-bold text-[#4b4b4b] mb-1">조건에 맞는 상품이 없습니다.</p>
            <p className="text-xs text-[#8a8a8a]">필터를 조정하거나 다른 검색어를 입력해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((it) => {
              const soldOut = it.stock === 0;
              const affordable = canAfford(it.price);
              return (
                <div key={it._id} className="group bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
                  {/* 이미지 */}
                  <div className="relative aspect-[4/3] bg-[#eceae6] overflow-hidden">
                    {it.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.imageUrl} alt={it.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#c4c4c4]">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                        </svg>
                      </div>
                    )}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${it.type === "role" ? "bg-[#e91e3f] text-[#ffffff]" : "bg-[#131313] text-white"}`}>
                      {it.type === "role" ? "역할 · 자동 지급" : "기프트카드"}
                    </span>
                    {!it.active && (
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-[#131313] border border-[#e2e0dc]">숨김</span>
                    )}
                    {soldOut && (
                      <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
                        <span className="text-sm font-black text-white tracking-wider">SOLD OUT</span>
                      </div>
                    )}

                    {/* 관리자 — 카드에서 바로 수정·삭제 */}
                    {isAdmin && (
                      <div className="absolute bottom-3 right-3 flex gap-1.5 z-10">
                        <button onClick={() => openEdit(it)}
                          className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#131313] border border-[#e2e0dc] hover:bg-white shadow-sm transition-colors">
                          수정
                        </button>
                        <button onClick={() => setDeleteTarget(it)}
                          className="px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#c62828] border border-[#e2e0dc] hover:bg-white shadow-sm transition-colors">
                          삭제
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-base font-black text-[#131313] tracking-tight mb-1.5 break-keep">{it.name}</h3>
                    {it.description && (
                      <p className="text-[12px] text-[#5a5a5a] leading-relaxed mb-3 line-clamp-2 break-keep">{it.description}</p>
                    )}

                    <div className="flex items-center gap-2 mb-4 text-[11px] font-bold text-[#8a8a8a]">
                      {it.stock < 0 ? <span>재고 무제한</span> : <span>남은 수량 {it.stock}개</span>}
                      {it.soldCount > 0 && <><span className="text-[#e2e0dc]">·</span><span>{it.soldCount}개 판매</span></>}
                    </div>

                    <div className="mt-auto">
                      <div className="mb-3">
                        <div className="text-xl font-black text-[#131313] tracking-tight tabular-nums">{it.price.toLocaleString()}</div>
                        <div className="text-[10px] font-bold text-[#8a8a8a] tracking-wider">XP</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => addToCart(it)}
                          disabled={soldOut}
                          aria-label="장바구니 담기"
                          className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all ${
                            soldOut
                              ? "bg-[#eceae6] text-[#c4c4c4] cursor-not-allowed"
                              : "bg-white text-[#131313] border border-[#e2e0dc] hover:border-[#131313]"
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => openBuy(it)}
                          disabled={soldOut}
                          className={`flex-1 px-5 py-2.5 rounded-full text-[12px] font-bold transition-all ${
                            soldOut
                              ? "bg-[#e2e0dc] text-[#a3a3a3] cursor-not-allowed"
                              : isLoggedIn && !affordable
                              ? "bg-[#eceae6] text-[#8a8a8a] hover:bg-[#e2e0dc]"
                              : "bg-[#e91e3f] text-[#ffffff] hover:bg-[#d01634] shadow-[0_4px_12px_rgba(233,30,63,0.25)]"
                          }`}
                        >
                          {soldOut ? "품절" : !isLoggedIn ? "로그인" : affordable ? "바로 구매" : "XP 부족"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 스크롤 시 따라다니는 컴팩트 바 (보유 XP · 장바구니) ── */}
      {isLoggedIn && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-[90] transition-all duration-300 ${
          pastBanner ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3 pointer-events-none"
        }`}>
          <div className="flex items-center gap-1 p-1.5 rounded-full bg-white/90 backdrop-blur-xl border border-[#e2e0dc] shadow-[0_10px_30px_-8px_rgba(0,0,0,0.18)]">
            <div className="flex items-baseline gap-1.5 pl-4 pr-3">
              <span className="text-[10px] font-black tracking-wider text-[#8a8a8a] uppercase">XP</span>
              <span className="text-[13px] font-black text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span>
            </div>
            <span className="w-px h-5 bg-[#e2e0dc]"></span>
            <button onClick={() => setShowCart(true)}
              className="flex items-center gap-2 pl-3 pr-4 py-2 rounded-full hover:bg-[#f5f3f0] transition-colors">
              <span className="relative">
                <svg className="w-4 h-4 text-[#131313]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                </svg>
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center">{cartCount}</span>
                )}
              </span>
              <span className="text-[12px] font-bold text-[#131313] tabular-nums">{cartTotal.toLocaleString()}</span>
            </button>
          </div>
        </div>
      )}

      {/* 담김 토스트 — 상단 중앙 */}
      {cartToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[150] px-5 py-3 bg-[#131313] text-white rounded-full shadow-[0_12px_32px_rgba(0,0,0,0.28)] text-[12px] font-bold animate-in fade-in slide-in-from-top-2">
          🛒 {cartToast}
        </div>
      )}

      {/* ── 장바구니 팝업 (화면 중앙) ── */}
      {showCart && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowCart(false)}>
          <div className="w-full max-w-lg max-h-[82vh] bg-white rounded-3xl border border-[#e2e0dc] flex flex-col shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)] overflow-hidden animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ececea] flex items-center justify-between shrink-0">
              <h2 className="text-base font-black text-[#131313]">장바구니 <span className="text-[#e91e3f]">{cartCount}</span></h2>
              <button onClick={() => setShowCart(false)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {cartRows.length === 0 ? (
                <div className="py-24 text-center px-6">
                  <p className="text-sm font-bold text-[#4b4b4b] mb-1">장바구니가 비어 있습니다.</p>
                  <p className="text-xs text-[#8a8a8a]">마음에 드는 상품을 담아보세요.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#ececea]">
                  {cartRows.map((r) => {
                    const max = r.item.stock < 0 ? 99 : r.item.stock;
                    return (
                      <div key={r.itemId} className="p-5 flex gap-4">
                        <div className="w-16 h-16 rounded-xl bg-[#eceae6] overflow-hidden shrink-0">
                          {r.item.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.item.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-[#131313] truncate">{r.item.name}</h3>
                            <button onClick={() => removeFromCart(r.itemId)} className="p-1 text-[#a3a3a3] hover:text-[#c62828] transition-colors shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <p className="text-[10px] font-bold text-[#8a8a8a] mb-2.5">{r.item.type === "role" ? "역할 · 자동 지급" : "기프트카드"}</p>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center border border-[#e2e0dc] rounded-full">
                              <button onClick={() => setQty(r.itemId, r.qty - 1)} className="w-8 h-8 flex items-center justify-center text-[#4b4b4b] hover:text-[#131313]">−</button>
                              <span className="w-8 text-center text-[13px] font-bold tabular-nums">{r.qty}</span>
                              <button onClick={() => setQty(r.itemId, Math.min(max, r.qty + 1))} disabled={r.qty >= max}
                                className="w-8 h-8 flex items-center justify-center text-[#4b4b4b] hover:text-[#131313] disabled:text-[#d6d3ce]">+</button>
                            </div>
                            <span className="text-sm font-black text-[#131313] tabular-nums">{(salePrice(r.item) * r.qty).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {cartRows.length > 0 && (
              <div className="border-t border-[#ececea] p-6 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#5a5a5a]">보유 XP</span>
                  <span className="text-[12px] font-bold text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex items-baseline justify-between mb-5">
                  <span className="text-sm font-bold text-[#131313]">총 결제 XP</span>
                  <span className={`text-xl font-black tabular-nums ${cartTotal > (myXp ?? 0) ? "text-[#c62828]" : "text-[#131313]"}`}>{cartTotal.toLocaleString()}</span>
                </div>
                <Link
                  href="/shop/checkout"
                  onClick={(e) => { if (cartTotal > (myXp ?? 0)) e.preventDefault(); else setShowCart(false); }}
                  className={`block w-full py-4 text-center font-bold rounded-xl transition-colors ${
                    cartTotal > (myXp ?? 0)
                      ? "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                      : "bg-[#e91e3f] text-white hover:bg-[#d01634]"
                  }`}
                >
                  {cartTotal > (myXp ?? 0) ? "XP가 부족합니다" : "주문서 작성"}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 구매 모달 ── */}
      {buyTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#ffffff] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-[#e2e0dc]">
            {result ? (
              <div className="p-8 text-center">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5 ${result.ok ? "bg-[#e8f3e6] text-[#3f7a35]" : "bg-[#fdeaea] text-[#c62828]"}`}>
                  {result.ok ? (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  )}
                </div>
                <h2 className="text-lg font-black text-[#131313] mb-2">{result.ok ? "구매 완료" : "구매 실패"}</h2>
                <p className="text-sm text-[#4b4b4b] leading-relaxed mb-7 break-keep">{result.message}</p>
                <button onClick={() => { setBuyTarget(null); setResult(null); }} className="w-full py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] transition-colors">확인</button>
              </div>
            ) : (
              <>
                <div className="flex gap-4 p-6 border-b border-[#ececea]">
                  <div className="w-20 h-20 rounded-xl bg-[#eceae6] overflow-hidden shrink-0">
                    {buyTarget.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={buyTarget.imageUrl} alt={buyTarget.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black mb-1.5 ${buyTarget.type === "role" ? "bg-[#e91e3f] text-[#ffffff]" : "bg-[#131313] text-white"}`}>
                      {buyTarget.type === "role" ? "역할 · 자동 지급" : "기프트카드"}
                    </span>
                    <h2 className="text-base font-black text-[#131313] truncate">{buyTarget.name}</h2>
                    <p className="text-sm font-black text-[#e91e3f] tabular-nums mt-0.5">{buyTarget.price.toLocaleString()} XP</p>
                  </div>
                </div>

                <div className="p-6">
                  {buyTarget.type === "physical" && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#4b4b4b] mb-2">수령 정보 <span className="text-[#c62828]">*</span></label>
                      <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                        placeholder="연락처 / 배송지 또는 기프티콘 받을 번호를 입력해주세요."
                        className="w-full bg-white border border-[#e2e0dc] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#8a8a8a] resize-none placeholder:text-[#a3a3a3]" />
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">운영진만 확인하며, 발송 목적으로만 사용됩니다.</p>
                    </div>
                  )}

                  <div className="bg-[#f5f3f0] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#c62828] tabular-nums">-{buyTarget.price.toLocaleString()}</span></div>
                    <div className="h-px bg-[#e2e0dc]"></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 잔액</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myXp ?? 0) - buyTarget.price).toLocaleString()}</span></div>
                  </div>

                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-5 break-keep">
                    {buyTarget.type === "role"
                      ? "구매 즉시 XP가 차감되며, 봇이 30초 이내에 역할을 지급합니다."
                      : "구매 즉시 XP가 차감되며, 운영진 확인 후 순차적으로 발송됩니다."}
                    {" "}구매 후에는 직접 취소할 수 없습니다.
                  </p>

                  <div className="flex gap-3">
                    <button onClick={() => setBuyTarget(null)} className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e2e0dc] transition-colors">취소</button>
                    <button onClick={confirmBuy} disabled={isBuying || !canAfford(buyTarget.price)}
                      className="flex-1 py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {isBuying ? "처리 중..." : canAfford(buyTarget.price) ? "구매 확정" : "XP 부족"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 상품 추가·수정 (관리자, 상점 내 인라인) ── */}
      {editForm && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setEditForm(null)}>
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[88vh] overflow-hidden shadow-2xl border border-[#e2e0dc] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ececea] flex items-center justify-between shrink-0">
              <h2 className="text-base font-black text-[#131313]">{editForm.id ? "상품 수정" : "상품 추가"}</h2>
              <button onClick={() => setEditForm(null)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="overflow-y-auto grid grid-cols-1 md:grid-cols-2">
              {/* 좌 — 입력 폼 */}
              <div className="p-6 space-y-4 md:border-r border-[#ececea]">
                <div>
                  <label className="block text-xs font-bold text-[#4b4b4b] mb-2">상품명 <span className="text-[#c62828]">*</span></label>
                  <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="예: [XP] Boost+" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#4b4b4b] mb-2">상품 유형 <span className="text-[#c62828]">*</span></label>
                  <div className="flex gap-2">
                    {[{ v: "role", l: "역할 · 자동 지급" }, { v: "physical", l: "기프트카드" }].map((o) => (
                      <button key={o.v} type="button" onClick={() => setEditForm({ ...editForm, type: o.v })}
                        className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold border transition-colors ${editForm.type === o.v ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#4b4b4b] border-[#e2e0dc] hover:border-[#a3a3a3]"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {editForm.type === "role" && (
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">지급할 역할 <span className="text-[#c62828]">*</span></label>
                    <Dropdown
                      theme="light"
                      value={editForm.roleId}
                      onChange={(v) => setEditForm({ ...editForm, roleId: v })}
                      placeholder="역할을 선택하세요"
                      options={guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-[#4b4b4b] mb-2">상품 설명</label>
                  <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="카드에 표시될 설명" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] resize-none placeholder:text-[#a3a3a3]" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#4b4b4b] mb-2">상품 이미지 URL</label>
                  <input type="text" value={editForm.imageUrl} onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                    placeholder="https://..." className="w-full bg-white border border-[#e2e0dc] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">가격 <span className="text-[#c62828]">*</span></label>
                    <input type="number" min={1} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      placeholder="500000" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">재고</label>
                    <input type="number" min={0} value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                      placeholder="무제한" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">추천 순서</label>
                    <input type="number" value={editForm.sortOrder} onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })}
                      placeholder="0" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                  </div>
                </div>
                <p className="text-[10px] text-[#8a8a8a] -mt-1">추천 순서가 작을수록 상점 앞쪽에 노출됩니다</p>

                <button type="button" onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors ${editForm.active ? "border-[#e91e3f] bg-[#e91e3f]/[0.06]" : "border-[#e2e0dc] bg-white"}`}>
                  <span className={editForm.active ? "font-bold text-[#e91e3f]" : "text-[#8a8a8a]"}>{editForm.active ? "판매 중" : "숨김"}</span>
                  <span className={`w-9 h-5 rounded-full relative transition-colors ${editForm.active ? "bg-[#e91e3f]" : "bg-[#d6d3ce]"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${editForm.active ? "left-[18px]" : "left-0.5"}`}></span>
                  </span>
                </button>

                {editError && <p className="text-[12px] font-bold text-[#c62828]">{editError}</p>}
              </div>

              {/* 우 — 실시간 카드 미리보기 */}
              <div className="p-6 bg-[#f5f3f0]">
                <div className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase mb-3">Preview</div>
                <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col">
                  <div className="relative aspect-[4/3] bg-[#eceae6] overflow-hidden">
                    {editForm.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editForm.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#c4c4c4]">
                        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                        </svg>
                      </div>
                    )}
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${editForm.type === "role" ? "bg-[#e91e3f] text-white" : "bg-[#131313] text-white"}`}>
                      {editForm.type === "role" ? "역할 · 자동 지급" : "기프트카드"}
                    </span>
                    {!editForm.active && (
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-[#131313] border border-[#e2e0dc]">숨김</span>
                    )}
                    {editForm.stock === "0" && (
                      <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
                        <span className="text-sm font-black text-white tracking-wider">SOLD OUT</span>
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex flex-col flex-1">
                    <h3 className="text-base font-black text-[#131313] tracking-tight mb-1.5 break-keep">{editForm.name || "상품명을 입력하세요"}</h3>
                    {editForm.description && <p className="text-[12px] text-[#5a5a5a] leading-relaxed mb-3 line-clamp-2 break-keep">{editForm.description}</p>}
                    <div className="flex items-center gap-2 mb-4 text-[11px] font-bold text-[#8a8a8a]">
                      <span>{editForm.stock === "" ? "재고 무제한" : `남은 수량 ${editForm.stock}개`}</span>
                    </div>
                    <div className="mt-auto flex items-end justify-between gap-3">
                      <div>
                        <div className="text-xl font-black text-[#131313] tracking-tight tabular-nums">{(Number(editForm.price) || 0).toLocaleString()}</div>
                        <div className="text-[10px] font-bold text-[#8a8a8a] tracking-wider">XP</div>
                      </div>
                      <span className="px-5 py-2.5 rounded-full text-[12px] font-bold bg-[#e91e3f] text-white shadow-[0_4px_12px_rgba(233,30,63,0.25)]">구매하기</span>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-[#8a8a8a] leading-relaxed">입력하는 대로 상점에 보일 모습이 그대로 반영됩니다.</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#ececea] flex gap-3 shrink-0">
              <button onClick={() => setEditForm(null)} className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e2e0dc] transition-colors">취소</button>
              <button onClick={saveItem} disabled={isSavingItem}
                className="flex-1 py-3.5 bg-[#e91e3f] text-white font-bold rounded-xl hover:bg-[#d01634] disabled:opacity-40 transition-colors">
                {isSavingItem ? "저장 중..." : editForm.id ? "수정 저장" : "상품 등록"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 상품 삭제 확인 (관리자) ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl border border-[#e2e0dc]">
            <h2 className="text-lg font-black text-[#131313] mb-2">상품 삭제</h2>
            <p className="text-sm text-[#4b4b4b] leading-relaxed mb-7">
              <span className="font-bold text-[#131313]">{deleteTarget.name}</span> 상품을 삭제하시겠습니까?<br />기존 구매 내역은 그대로 유지됩니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e2e0dc] transition-colors">취소</button>
              <button onClick={deleteItem} className="flex-1 py-3.5 bg-[#c62828] text-white font-bold rounded-xl hover:bg-[#a81f1f] transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 구매 내역 ── */}
      {showOrders && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setShowOrders(false)}>
          <div className="bg-[#ffffff] rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl border border-[#e2e0dc] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ececea] flex items-center justify-between">
              <h2 className="text-base font-black text-[#131313]">구매 내역</h2>
              <button onClick={() => setShowOrders(false)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="overflow-y-auto">
              {orders.length === 0 ? (
                <p className="px-6 py-14 text-center text-sm text-[#8a8a8a]">아직 구매한 상품이 없습니다.</p>
              ) : (
                <div className="divide-y divide-[#ececea]">
                  {orders.map((o) => (
                    <div key={o._id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-sm font-bold text-[#131313]">{o.itemName}</span>
                        <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                          o.status === "completed" ? "bg-[#e8f3e6] text-[#3f7a35]"
                          : o.status === "cancelled" ? "bg-[#fdeaea] text-[#c62828]"
                          : "bg-[#fdf3e3] text-[#a8763a]"}`}>
                          {STATUS_LABEL[o.status] || o.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-[#8a8a8a]">
                        <span className="tabular-nums">-{o.price.toLocaleString()} XP</span>
                        <span>·</span>
                        <span>{new Date(o.createdAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                      {o.adminNote && <p className="mt-1.5 text-[11px] text-[#5a5a5a]">운영진 메모: {o.adminNote}</p>}
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
