"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import Dropdown from "../components/Dropdown";
import { salePrice, isTimed, durationOptions, durationLabel } from "@/lib/shopPricing";
import ArcticFooter from "./ArcticFooter";
import ArcticDock from "./ArcticDock";
import { useSearchParams } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];

// 📌 ARCTIC 본문 — /shop 라우트와 SYSTEM:LEVEL 의 ARCTIC 탭이 이 한 벌을 함께 쓴다.
//    공개 전에는 관리자만 볼 수 있다 (레벨 대시보드 → 기본 정책 → ARCTIC 공개)
//
//    embedded=true (= /level 안에 들어갈 때)
//      전역 헤더·하단 독·푸터가 이미 살아 있으므로 ARCTIC 자체 크롬과 겹친다.
//      특히 ArcticDock 은 전역 모바일 독과 위치·크기·격자가 같아 그대로 두면
//      전역 독을 완전히 덮어 LEVEL 을 빠져나갈 수단이 사라진다. 그래서 독과 푸터는
//      끄고, 헤더는 기능(검색·장바구니·쿠폰·찜·보유 XP)을 살리되 sticky 만 해제한다.
//      바깥이 이미 min-h-screen 이라 루트의 min-h-screen 도 뺀다 (한 화면만큼 늘어남).
const SORTS = [
  { v: "recommended", l: "추천순" },
  { v: "priceAsc", l: "낮은 가격순" },
  { v: "priceDesc", l: "높은 가격순" },
  { v: "newest", l: "최신순" },
  { v: "popular", l: "인기순" },
];

const TYPES = [
  { v: "all", l: "전체" },
  { v: "role", l: "역할" },
  { v: "perk", l: "권한" },
  { v: "physical", l: "기프트카드" },
];

// 상품 유형 배지 (역할·권한은 자동 지급, 기프트카드는 운영진 발송)
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  role: { label: "역할", cls: "bg-[#e91e3f] text-white" },
  perk: { label: "권한", cls: "bg-[#2f6fb0] text-white" },
  physical: { label: "기프트카드", cls: "bg-[#131313] text-white" },
};

// 상품가는 천만·오천만 단위까지 올라간다
const PRICE_RANGES = [
  { v: "all", l: "전체", min: 0, max: Infinity },
  { v: "u1m", l: "100만 미만", min: 0, max: 1_000_000 },
  { v: "1m-5m", l: "100만 ~ 500만", min: 1_000_000, max: 5_000_000 },
  { v: "5m-10m", l: "500만 ~ 1000만", min: 5_000_000, max: 10_000_000 },
  { v: "10m-30m", l: "1000만 ~ 3000만", min: 10_000_000, max: 30_000_000 },
  { v: "o30m", l: "3000만 이상", min: 30_000_000, max: Infinity },
];

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "지급 완료", cancelled: "취소됨" };

export default function ArcticShopBody({ embedded = false }: { embedded?: boolean }) {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [shopPublic, setShopPublic] = useState<boolean | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myLevel, setMyLevel] = useState(0);
  const [myProgress, setMyProgress] = useState<{ current: number; required: number; needToNext: number } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 필터·정렬·검색
  const [sort, setSort] = useState("recommended");
  const [typeFilter, setTypeFilter] = useState("all");
  // 📌 홈(브랜드·배너·추천) / 상품(전체 목록) 두 화면으로 나눈다
  const [view, setView] = useState<"home" | "products">("home");
  const goProducts = (t = "all") => { setView("products"); setTypeFilter(t); setWishOnly(false); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const [priceFilter, setPriceFilter] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [query, setQuery] = useState("");

  // 구매 모달
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // 📌 장바구니 — 로컬에 보관해 새로고침해도 유지 ([{ itemId, qty }])
  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [cartToast, setCartToast] = useState("");

  // 스크롤하면 헤더·유틸바에 그림자를 넣어 떠 있는 느낌을 준다
  const [pastBanner, setPastBanner] = useState(false);
  useEffect(() => {
    const onScroll = () => setPastBanner(window.scrollY > 40);
    // (카드가 지나간 뒤 유틸바를 띄우는 기준)
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ARCTIC 헤더 — 알림·프로필 드롭다운
  const [showNotif, setShowNotif] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // 저장된 장바구니를 먼저 읽고, 그 뒤부터만 저장한다 (첫 렌더에 빈 배열로 덮어쓰지 않게)
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

  // 📌 상품은 1인 1개 — 이미 구매한 상품은 다시 담거나 살 수 없다
  const ownedItemIds = useMemo(
    () => new Set(orders.filter((o) => o.status !== "cancelled").map((o) => o.itemId)),
    [orders]
  );

  // 📌 기간제 상품에서 고른 기간 (상품별). 안 고르면 가장 짧은 기간이 기본.
  const [pickDays, setPickDays] = useState<Record<string, number>>({});
  const daysFor = (item: any) => (isTimed(item) ? (pickDays[item._id] ?? durationOptions(item)[0]?.days ?? 0) : 0);

  const addToCart = (item: any) => {
    if (!isLoggedIn) return signIn("discord");
    if (ownedItemIds.has(item._id)) {
      setCartToast("이미 구매하신 상품입니다");
      setTimeout(() => setCartToast(""), 1800);
      return;
    }
    // 이미 담겨 있으면 다시 눌러 뺀다 (상품은 1인 1개라 수량 개념이 없다)
    if (cart.some((c) => c.itemId === item._id)) {
      setCart((prev) => prev.filter((c) => c.itemId !== item._id));
      setCartToast(`${item.name} 상품을 장바구니에서 삭제했습니다`);
      setTimeout(() => setCartToast(""), 1800);
      return;
    }
    const days = daysFor(item);
    setCart((prev) => [...prev, { itemId: item._id, qty: 1, days }]);
    setCartToast(`${item.name}${days > 0 ? ` (${durationLabel(days)})` : ""} 상품을 장바구니에 담았습니다`);
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
  const cartTotal = cartRows.reduce((n, r) => n + salePrice(r.item, r.days) * r.qty, 0);

  // 📌 찜 — 로컬에 보관 (상품 id 목록)
  const [wish, setWish] = useState<string[]>([]);
  const [wishOnly, setWishOnly] = useState(false);
  const [showWishList, setShowWishList] = useState(false);

  // 하위 페이지 하단바에서 찜·검색을 누르면 ?panel= 로 넘어온다
  const searchParams = useSearchParams();
  useEffect(() => {
    const panel = searchParams.get("panel");
    if (panel === "wish") setShowWishList(true);
    if (panel === "search") setShowMobileSearch(true);
  }, [searchParams]);

  // 📌 쿠폰함 — 코드 등록과 보유 쿠폰을 한 창에서 (ARCTIC 전용, 라이트 톤)
  const [showCoupons, setShowCoupons] = useState(false);
  const [myCoupons, setMyCoupons] = useState<any[]>([]);
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [isRegisteringCoupon, setIsRegisteringCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadMyCoupons = () => {
    setIsLoadingCoupons(true);
    fetch("/api/shop/my-coupons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMyCoupons(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setMyCoupons([]))
      .finally(() => setIsLoadingCoupons(false));
  };
  useEffect(() => { if (showCoupons) loadMyCoupons(); }, [showCoupons]);

  const registerCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code || isRegisteringCoupon) return;
    setIsRegisteringCoupon(true);
    setCouponMsg(null);
    try {
      const res = await fetch("/api/shop/my-coupons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCouponMsg({ ok: true, text: d.message || "쿠폰을 받았습니다." });
        setCouponCode("");
        loadMyCoupons();
      } else {
        setCouponMsg({ ok: false, text: d.message || "사용할 수 없는 쿠폰입니다." });
      }
    } catch {
      setCouponMsg({ ok: false, text: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsRegisteringCoupon(false);
    }
  };
  useEffect(() => {
    try {
      const raw = localStorage.getItem("iglooShopWish");
      if (raw) setWish(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("iglooShopWish", JSON.stringify(wish)); } catch {}
  }, [wish]);

  // 찜한 상품 목록 (패널용)
  const wishRows = useMemo(() => items.filter((i) => wish.includes(i._id)), [items, wish]);

  const toggleWish = (item: any) => {
    setWish((prev) => (prev.includes(item._id) ? prev.filter((x) => x !== item._id) : [...prev, item._id]));
    setCartToast(wish.includes(item._id) ? `${item.name} 상품의 찜을 해제했습니다` : `${item.name} 상품을 찜했습니다`);
    setTimeout(() => setCartToast(""), 1600);
  };

  // 📌 상단 이미지 배너 — 관리자가 등록, 5초마다 자동 전환
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerIdx, setBannerIdx] = useState(0);
  /* 📌 배너 틀 비율 — 이미지가 실제로 가진 비율에 맞춘다.
     틀을 3/1(모바일)·4/1(PC) 로 고정해 두면 object-cover 가 남는 쪽을 잘라내
     같은 배너가 기기마다 다르게 보인다(모바일에서 좌우가 잘렸다).
     여러 장이면 가장 넓은 비율에 맞춰 어느 것도 좌우가 잘리지 않게 한다. */
  const [bannerRatio, setBannerRatio] = useState(4);
  const fitRatio = (img: HTMLImageElement) => {
    const r = img.naturalWidth / img.naturalHeight;
    if (!Number.isFinite(r) || r <= 0) return;
    setBannerRatio((prev) => Math.min(8, Math.max(2.5, Math.max(prev, r))));
  };

  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/shop/banners${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setBannerRatio(4); setBanners(Array.isArray(d?.data) ? d.data : []); })
      .catch(() => {});
  }, [status, isAdmin]);

  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setBannerIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  // 관리자 — 상점 안에서 바로 상품 추가·수정
  const EMPTY_ITEM = { id: "", name: "", description: "", imageUrl: "", type: "role", roleId: "", roleName: "", price: "", discountPct: "", stock: "", sortOrder: "", active: true };
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
      ? { id: it._id, name: it.name, description: it.description || "", imageUrl: it.imageUrl || "", type: it.type, roleId: it.roleId || "", roleName: it.roleName || "", price: String(it.price), discountPct: it.discountPct ? String(it.discountPct) : "", stock: it.stock < 0 ? "" : String(it.stock), sortOrder: String(it.sortOrder || 0), active: it.active }
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
      .then((d) => { if (d?.success) { setMyXp(d.data.xp); setMyLevel(d.data.level); setMyProgress(d.data.levelProgress || null); } })
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
      if (wishOnly && !wish.includes(it._id)) return false;
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
  }, [items, typeFilter, priceFilter, inStockOnly, affordableOnly, wishOnly, wish, query, sort, myXp]);

  // 홈 아래에 세울 전체 상품 미리보기 — 추천과 겹치지 않게 뒤에서 네 개
  // (상품이 적으면 겹칠 수 있으므로 부족할 때는 앞에서 채운다)

  // 홈에 세울 추천 상품 — 관리자가 매긴 추천 순서 상위 8개
  const recommended = useMemo(
    () => [...items].sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0) || (new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())).slice(0, 8),
    [items]
  );

  const preview = useMemo(() => {
    const rest = items.filter((i) => !recommended.some((r) => r._id === i._id));
    return (rest.length >= 4 ? rest : items).slice(0, 4);
  }, [items, recommended]);

  // 📌 이미 장바구니에 있는 상품을 '구매'로 누르면, 낱개 구매인지
  //    장바구니와 함께 결제할지 먼저 물어본다 (모르고 따로 사는 걸 막는다)
  const [cartConflict, setCartConflict] = useState<any>(null);

  const startBuy = (item: any) => {
    setContact("");
    setResult(null);
    setBuyTarget(item);
  };

  const openBuy = (item: any) => {
    if (!isLoggedIn) return signIn("discord");
    // 고른 기간을 그대로 들고 모달로 넘어간다
    item = isTimed(item) ? { ...item, _days: daysFor(item) } : item;
    if (cart.some((c) => c.itemId === item._id)) {
      setCartConflict(item);
      return;
    }
    startBuy(item);
  };

  const confirmBuy = async () => {
    if (!buyTarget || isBuying) return;
    setIsBuying(true);
    try {
      const res = await fetch("/api/shop/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: buyTarget._id, contact, days: buyTarget._days || 0 }),
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

  // 관리자는 잔액과 무관하게 구매 가능 (테스트 구매)
  // 적용 중인 필터 개수 (모바일 필터 버튼 배지용)
  const activeFilterCount = (priceFilter !== "all" ? 1 : 0) + (inStockOnly ? 1 : 0) + (affordableOnly ? 1 : 0);

  const canAfford = (p: number) => isAdmin || (myXp != null && myXp >= p);
  const chip = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-[12px] font-bold border transition-colors ${
      active ? "bg-[#e91e3f] text-[#ffffff] border-[#e91e3f]" : "bg-white/70 text-[#4b4b4b] border-[#e2e0dc] hover:border-[#a3a3a3]"
    }`;

  // 공개 전 · 비관리자 → 준비 중 안내
  if (status === "loading" || shopPublic === null) {
    return <div className={`w-full flex-1 bg-[#f5f3f0] ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center text-sm text-[#8a8a8a]`}>불러오는 중...</div>;
  }
  if (!shopPublic && !isAdmin) {
    return (
      <div className={`w-full flex-1 bg-[#f5f3f0] text-[#131313] ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center px-6`}>
        {/* break-keep을 주지 않으면 한국어가 단어 중간에서 잘려 내려간다 */}
        <div className="text-center max-w-md break-keep">
          <div className="flex items-center justify-center gap-3 mb-5">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Coming Soon</span>
            <span className="w-8 h-px bg-[#e91e3f]"></span>
          </div>
          <h1 className="text-3xl font-black tracking-tighter mb-3">ARCTIC 준비 중</h1>
          <p className="text-sm text-[#4b4b4b] leading-relaxed mb-8">
            쌓아온 XP로 역할과 혜택을 교환할 수 있는 상점을 준비하고 있습니다.
            <br />
            오픈 소식은 공지사항으로 안내드릴게요.
          </p>
          <Link href="/level" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            SYSTEM : LEVEL 보러가기
          </Link>
        </div>
      </div>
    );
  }


  // 📌 상품 카드 하나 — 홈(추천·전체 미리보기)과 상품 화면이 같은 카드를 쓴다
  //    (홈 카드에만 찜·장바구니·구매가 없어서 반쪽짜리였다)
  const renderCard = (it: any) => {
    const soldOut = it.stock === 0;
    const timed = isTimed(it);
    const days = daysFor(it);
    const price = salePrice(it, days);
    const affordable = canAfford(price);
    const owned = ownedItemIds.has(it._id);
    const inCart = cart.some((c) => c.itemId === it._id);
    return (
            <div key={it._id} className="group bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
              {/* 이미지 */}
              <div className="relative aspect-[4/3] bg-[#eceae6] overflow-hidden">
                {/* 상세로 가는 오버레이 — 위에 얹힌 버튼(z-10)은 그대로 눌린다 */}
                <Link href={`/shop/item/${it._id}`} aria-label={`${it.name} 상세보기`} className="absolute inset-0 z-[1]"></Link>
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt={it.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#c4c4c4]">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12A1.125 1.125 0 0119.75 22H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" />
                    </svg>
                  </div>
                )}
                <span className={`absolute top-2 left-2 sm:top-3 sm:left-3 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wide ${TYPE_BADGE[it.type]?.cls || "bg-[#131313] text-white"}`}>
                  {TYPE_BADGE[it.type]?.label || "상품"}
                </span>
                {!it.active && (
                  <span className="absolute top-11 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-[#131313] border border-[#e2e0dc]">숨김</span>
                )}

                {/* 찜 */}
                <button onClick={() => toggleWish(it)} aria-label="찜하기"
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 hover:bg-white border border-[#e2e0dc] flex items-center justify-center shadow-sm transition-colors z-10">
                  <svg className={`w-4 h-4 transition-colors ${wish.includes(it._id) ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}
                    fill={wish.includes(it._id) ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </button>
                {soldOut && (
                  <div className="absolute inset-0 z-[2] bg-[#131313]/55 flex items-center justify-center pointer-events-none">
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
              <div className="p-3.5 sm:p-5 flex flex-col flex-1">
                <Link href={`/shop/item/${it._id}`} className="block">
                  <h3 className="text-[13px] sm:text-base font-black text-[#131313] tracking-tight mb-1.5 break-keep line-clamp-2 hover:text-[#e91e3f] transition-colors">{it.name}</h3>
                </Link>
                {it.description && (
                  <p className="hidden sm:block text-[12px] text-[#5a5a5a] leading-relaxed mb-3 line-clamp-2 break-keep">{it.description}</p>
                )}

                {/* 재고는 얼마 안 남았을 때만 알린다 (무제한·넉넉할 땐 표시 안 함) */}
                {it.stock >= 0 && it.stock <= 5 && it.stock > 0 && (
                  <div className="flex items-center gap-1.5 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-pulse"></span>
                    <span className="text-[11px] font-bold text-[#e91e3f]">한정 수량 · {it.stock}개 남음</span>
                  </div>
                )}

                <div className="mt-auto">
                  {/* 📌 기간제 — 기간을 고르면 값이 바로 바뀐다 */}
                  {timed && (
                    <div className="flex items-center gap-1.5 mb-2.5">
                      {durationOptions(it).map((o: any) => {
                        const on = o.days === days;
                        return (
                          <button key={o.days} type="button"
                            onClick={() => setPickDays((prev) => ({ ...prev, [it._id]: o.days }))}
                            className={`px-2.5 h-7 rounded-full text-[11px] font-bold border transition-colors ${
                              on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#8a8a8a] border-[#e2e0dc] hover:border-[#131313] hover:text-[#131313]"
                            }`}>
                            {durationLabel(o.days)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {it.discountPct > 0 && (
                        <span className="px-1.5 py-[3px] rounded bg-[#e91e3f] text-white text-[10px] font-black leading-none shrink-0">{it.discountPct}%</span>
                      )}
                      <span className="text-[15px] sm:text-xl font-black text-[#131313] tracking-tight tabular-nums leading-none">
                        {price.toLocaleString()}<span className="text-[11px] sm:text-[12px] font-bold text-[#8a8a8a] ml-1">XP</span>
                      </span>
                      {timed && <span className="text-[11px] font-bold text-[#8a8a8a]">/ {durationLabel(days)}</span>}
                    </div>
                    {it.discountPct > 0 && (
                      <span className="block text-[11px] text-[#a3a3a3] line-through tabular-nums">
                        {(timed ? durationOptions(it).find((o: any) => o.days === days)?.price ?? it.price : it.price).toLocaleString()} XP
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={() => addToCart(it)}
                      disabled={soldOut || owned}
                      aria-label={inCart ? "장바구니에서 삭제" : "장바구니에 담기"}
                      title={inCart ? "다시 누르면 장바구니에서 삭제됩니다" : "장바구니에 담기"}
                      className={`w-8 h-8 sm:w-11 sm:h-11 shrink-0 rounded-full flex items-center justify-center transition-all ${
                        soldOut || owned
                          ? "bg-[#eceae6] text-[#c4c4c4] cursor-not-allowed"
                          : inCart
                          ? "bg-[#131313] text-white"
                          : "bg-white text-[#131313] border border-[#e2e0dc] hover:border-[#131313]"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => openBuy(it)}
                      disabled={soldOut || owned}
                      className={`flex-1 min-w-0 px-2 sm:px-5 h-8 sm:h-11 rounded-full text-[11px] sm:text-[12px] font-bold transition-all ${
                        owned
                          ? "bg-[#eceae6] text-[#8a8a8a] cursor-not-allowed"
                          : soldOut
                          ? "bg-[#e2e0dc] text-[#a3a3a3] cursor-not-allowed"
                          : isLoggedIn && !affordable
                          ? "bg-[#eceae6] text-[#8a8a8a] hover:bg-[#e2e0dc]"
                          : "bg-[#e91e3f] text-[#ffffff] hover:bg-[#d01634] shadow-[0_4px_12px_rgba(233,30,63,0.25)]"
                      }`}
                    >
                      {owned ? "보유 중" : soldOut ? "품절" : !isLoggedIn ? "로그인" : affordable ? "구매" : "XP 부족"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
    );
  };

  return (
    <div className={`w-full flex-1 bg-[#f5f3f0] text-[#131313] ${embedded ? "" : "min-h-screen"}`}>
      {/* ── ARCTIC 전용 헤더 — 스크롤하면 알약 독으로 좁아진다 ── */}
      <div className={`w-full transition-[padding] duration-500 ease-out ${embedded ? "relative z-30" : "sticky top-0 z-[95]"} ${pastBanner ? "pt-3 px-3 md:px-6" : ""}`}>
      {/* max-width를 고정값끼리 오가게 해야 알약 전환이 부드럽게 애니메이션된다 */}
      <header className={`mx-auto transition-all duration-500 ease-out ${
        pastBanner
          ? "max-w-5xl rounded-full border border-[#e2e0dc] bg-white/85 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.26)]"
          : "max-w-[1600px] rounded-none border-x-transparent border-t-transparent border-b border-b-[#e2e0dc] bg-[#f5f3f0]/92 backdrop-blur-md shadow-[0_0_0_rgba(0,0,0,0)]"
      }`}>
        <div className={`mx-auto flex items-center gap-3 md:gap-6 transition-all duration-500 ease-out ${pastBanner ? "max-w-5xl px-4 md:px-5 h-14" : "max-w-6xl px-4 md:px-6 h-16"}`}>
          {/* 브랜드 — 고급 이글루의 ARCTIC (좁은 화면에서도 가로로) */}
          <div className="flex flex-row items-center gap-2 lg:gap-3 min-w-0 leading-none">
            <Link href="/" className="text-[9px] lg:text-[10px] font-bold tracking-[0.18em] text-[#8a8a8a] hover:text-[#131313] transition-colors whitespace-nowrap">
              고급 이글루
            </Link>
            <span className="w-px h-3.5 lg:h-4 bg-[#d6d3ce]"></span>
            <Link href="/shop" className="text-[15px] lg:text-[17px] font-black tracking-[0.16em] lg:tracking-[0.2em] text-[#131313] hover:text-[#e91e3f] transition-colors">
              ARCTIC
            </Link>

            {/* 비공개 상태 — 관리자에게만 작은 점으로 알린다 */}
            {!shopPublic && isAdmin && (
              <Link href="/admin/bot?tab=settings" title="비공개 상태입니다 · 눌러서 공개 전환"
                className="group/dot relative flex items-center shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>
                <span className="absolute left-0 w-2 h-2 rounded-full bg-[#e91e3f] animate-ping opacity-60"></span>
                <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-[#131313] text-white text-[10px] font-bold opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                  비공개
                </span>
              </Link>
            )}
          </div>

          {/* 카테고리 내비 */}
          <nav className="hidden md:flex items-center gap-1 min-w-0">
            {[{ v: "home", l: "홈" }, { v: "products", l: "상품" }].map((m) => {
              const on = view === m.v;
              return (
                <button key={m.v} onClick={() => (m.v === "home" ? setView("home") : goProducts(typeFilter))}
                  className={`relative px-3 py-2 text-[13px] font-bold transition-colors ${on ? "text-[#131313]" : "text-[#8a8a8a] hover:text-[#131313]"}`}>
                  {m.l}
                  <span className={`absolute bottom-1 left-3 right-3 h-px bg-[#e91e3f] origin-left transition-transform duration-300 ${on ? "scale-x-100" : "scale-x-0"}`} />
                </button>
              );
            })}
          </nav>

          {/* 우측 도구 */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {/* 검색 — 늘 펼쳐진 상태로 둔다 */}
            <div className="hidden md:block relative h-9 w-44 lg:w-56 shrink-0 rounded-full border bg-white border-[#e2e0dc] focus-within:border-[#e91e3f] transition-colors overflow-hidden">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#a3a3a3] pointer-events-none"
                fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품 검색"
                className="absolute inset-0 w-full h-full bg-transparent pl-9 pr-8 text-[13px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
              {query && (
                <button onClick={() => setQuery("")} aria-label="검색어 지우기"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#a3a3a3] hover:text-[#131313] transition-colors outline-none">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>

            {isLoggedIn ? (
              <>

                {/* 보유 XP — 모바일에서는 우측 카드가 없으므로 헤더에 둔다 */}
                <span className="md:hidden inline-flex items-center h-9 px-2.5 rounded-full border border-[#e2e0dc] bg-white text-[11px] font-black text-[#131313] tabular-nums shrink-0">
                  {(myXp ?? 0).toLocaleString()}
                  <span className="ml-1 text-[10px] font-black text-[#e91e3f]">XP</span>
                </span>

                {/* 쿠폰함 */}
                <button onClick={() => setShowCoupons(true)} aria-label="쿠폰함" title="쿠폰함"
                  className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${showCoupons ? "bg-[#e91e3f]/10 text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
                  <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                  </svg>
                </button>

                {/* 찜 — 찜한 상품 목록 열기 */}
                <button
                  onClick={() => setShowWishList(true)}
                  aria-label="찜한 상품 보기"
                  className={`relative hidden md:flex items-center justify-center w-9 h-9 rounded-full transition-colors ${showWishList ? "bg-[#e91e3f]/10 text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
                  <svg className={`w-[18px] h-[18px] transition-all duration-300 ${wish.length > 0 ? "text-[#e91e3f]" : ""}`}
                    fill={wish.length > 0 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                </button>

                {/* 장바구니 */}
                <Link href="/shop/cart"
                  className="hidden md:flex items-center justify-center gap-2 h-9 pl-3.5 pr-4 rounded-full bg-[#131313] hover:bg-black text-white transition-colors">
                  <span className="relative">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center">{cartCount}</span>
                    )}
                  </span>
                  <span className="text-[12px] font-bold tabular-nums hidden sm:inline">{cartTotal.toLocaleString()}</span>
                </Link>

                {/* 프로필 — 내 정보 페이지로 */}
                <Link href="/shop/me" aria-label="내 정보" className="relative shrink-0 hidden md:flex items-center justify-center w-9 h-9">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={session?.user?.image || ""} alt=""
                    className="w-[30px] h-[30px] rounded-full bg-[#e2e0dc] ring-1 ring-[#e2e0dc] hover:ring-[#131313] transition-all" />
                  {pendingOrders > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#e91e3f] ring-2 ring-[#f5f3f0]"></span>
                  )}
                </Link>
              </>
            ) : (
              <button onClick={() => signIn("discord")}
                className="h-9 px-4 rounded-full bg-[#5865F2] hover:bg-[#4752C4] text-white text-[12px] font-bold transition-colors shrink-0">
                디스코드 로그인
              </button>
            )}
          </div>
        </div>

      </header>
      </div>

      {/* ── 모바일 유틸 줄 (/level 안 전용) ──
             하단 독을 끄면서 사라지는 검색·찜·장바구니를 여기서 되살린다.
             fixed 가 아니라 흐름 안에 있어 전역 독과 겹치지 않는다. */}
      {embedded && (
        <div className="md:hidden w-full px-4 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMobileSearch(true)}
              className="flex-1 flex items-center gap-2 h-10 px-3.5 rounded-full border border-[#d6d3ce] bg-white text-[12px] font-bold text-[#8a8a8a] outline-none focus:outline-none"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="9" r="6" /><path d="m14 14 4 4" strokeLinecap="round" />
              </svg>
              {query || "상품 검색"}
            </button>
            <button
              onClick={() => setShowWishList(true)}
              aria-label="찜 목록"
              className="relative shrink-0 w-10 h-10 rounded-full border border-[#d6d3ce] bg-white flex items-center justify-center outline-none focus:outline-none"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#5a5a5a]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M10 16.5 3.8 10.3a3.6 3.6 0 1 1 5.1-5.1l1.1 1.1 1.1-1.1a3.6 3.6 0 1 1 5.1 5.1Z" strokeLinejoin="round" />
              </svg>
              {wish.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{wish.length}</span>
              )}
            </button>
            <Link
              href="/shop/cart"
              aria-label="장바구니"
              className="relative shrink-0 w-10 h-10 rounded-full border border-[#d6d3ce] bg-white flex items-center justify-center"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4 text-[#5a5a5a]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 4h2l1.6 8.4a1 1 0 0 0 1 .8h6.8a1 1 0 0 0 1-.8L17 7H6" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="8.5" cy="16" r="1.2" /><circle cx="14.5" cy="16" r="1.2" />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#131313] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{cartCount}</span>
              )}
            </Link>
          </div>
        </div>
      )}

      {/* ── 홈 · 브랜드 ── */}
      {view === "home" && (<>
      <section className="w-full bg-gradient-to-b from-[#eceae6] to-[#f5f3f0] border-b border-[#e2e0dc]">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
          {/* 중앙 — 타이틀 */}
          <div className="text-center break-keep">
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="w-8 h-px bg-[#8a8a8a]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Premium Igloo SHOP</span>
              <span className="w-8 h-px bg-[#8a8a8a]"></span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-[#131313] mb-4">ARCTIC</h1>

            {/* 관리자에게만 보이는 상품 관리 진입점 */}
            {isAdmin && (
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
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

        </div>
      </section>

      {/* ── 이미지 배너 (관리자 등록) ── */}
      {banners.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pt-10">
          <div className="relative rounded-2xl overflow-hidden border border-[#e2e0dc] bg-[#eceae6] shadow-[0_10px_30px_-14px_rgba(0,0,0,0.25)]">
            <div className="relative" style={{ aspectRatio: String(bannerRatio) }}>
              {banners.map((b, i) => {
                const inner = (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.imageUrl} alt={b.title || ""} onLoad={(e) => fitRatio(e.currentTarget)}
                      className="absolute inset-0 w-full h-full object-cover" />
                    {(b.title || b.subtitle) && (
                      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-5 sm:px-10 md:px-12">
                        {b.title && <h2 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-white mb-0.5 sm:mb-1 break-keep line-clamp-2">{b.title}</h2>}
                        {b.subtitle && <p className="text-[11px] sm:text-sm text-white/85 break-keep line-clamp-1 sm:line-clamp-2">{b.subtitle}</p>}
                      </div>
                    )}
                  </>
                );
                return (
                  <div key={b._id}
                    className={`absolute inset-0 transition-opacity duration-700 ${i === bannerIdx ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                    {b.link ? <Link href={b.link} className="block w-full h-full relative">{inner}</Link> : inner}
                  </div>
                );
              })}
            </div>

            {/* 인디케이터 */}
            {banners.length > 1 && (
              <div className="absolute bottom-4 right-5 flex gap-1.5 z-10">
                {banners.map((b, i) => (
                  <button key={b._id} onClick={() => setBannerIdx(i)} aria-label={`배너 ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}></button>
                ))}
              </div>
            )}

            {/* 관리자 — 배너 관리 진입 */}
            {isAdmin && (
              <Link href="/admin/shop?tab=banners"
                className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#131313] border border-[#e2e0dc] hover:bg-white shadow-sm transition-colors">
                배너 관리
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── 홈 · 카테고리 (모바일) — 상품 화면과 같은 탭 모양 ── */}
      <section className="md:hidden max-w-6xl mx-auto px-6 pt-8">
        <div className="flex items-center gap-1 overflow-x-auto no-bar border-b border-[#e2e0dc]">
          {TYPES.map((t) => (
            <button key={t.v} onClick={() => goProducts(t.v)}
              className="relative shrink-0 px-4 py-3 text-[13px] font-bold text-[#8a8a8a] active:text-[#131313] transition-colors">
              {t.l}
            </button>
          ))}
        </div>
      </section>

      {/* ── 홈 · 추천 상품 ── */}
      <section className="max-w-6xl mx-auto px-6 pt-14">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="w-6 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.35em] text-[#8a8a8a] uppercase">Recommended</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">추천 상품</h2>
          </div>
          <button onClick={() => goProducts("all")} className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors shrink-0">더 보기</button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : recommended.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8a8a8a]">등록된 상품이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {recommended.map((it) => renderCard(it))}
          </div>
        )}

        {/* 전체 상품 맛보기 — 네 개만 세워두고 아래에서 전체로 넘어간다 */}
        {!isLoading && preview.length > 0 && (
          <div className="mt-14">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-6 h-px bg-[#131313]"></span>
              <h2 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">전체 상품</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {preview.map((it) => renderCard(it))}
            </div>
          </div>
        )}

        <button onClick={() => goProducts("all")}
          className="mt-10 w-full py-4 rounded-2xl border border-[#e2e0dc] bg-white hover:border-[#131313] text-[13px] font-bold text-[#131313] transition-colors">
          전체 상품 보기
        </button>
      </section>
      </>)}



      {/* ── 상품 · 검색 · 필터 ── */}
      {view === "products" && (<>
      <section className="max-w-6xl mx-auto px-6 pt-8">
        {/* 📌 아이콘 상태로 접혀 있다가 호버·포커스·입력 시 펼쳐지는 검색창
               (모바일은 터치라 호버가 없으므로 항상 펼친 상태) */}
        {/* 검색어 표시 (검색은 헤더에서) */}
        {query && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[12px] text-[#8a8a8a]">&ldquo;<span className="font-bold text-[#131313]">{query}</span>&rdquo; 검색 결과</span>
            <button onClick={() => setQuery("")} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">검색 해제</button>
          </div>
        )}

        {/* 카테고리 — 헤더 아래에 붙어 따라오고, 스크롤하면 함께 좁아진다 */}
        <div
          className="-mx-6 px-6 mb-5 border-b border-[#e2e0dc]">
          <div className="flex items-center gap-1 overflow-x-auto no-bar">
            {TYPES.map((t) => {
              const on = typeFilter === t.v;
              return (
                <button key={t.v} onClick={() => setTypeFilter(t.v)}
                  className={`relative shrink-0 px-4 text-[13px] font-bold transition-[padding,color,font-size] duration-500 ease-out ${pastBanner ? "py-2 text-[12px]" : "py-3 text-[13px]"} ${on ? "text-[#131313]" : "text-[#8a8a8a] hover:text-[#131313]"}`}>
                  {t.l}
                  <span className={`absolute bottom-0 left-3 right-3 h-[2px] bg-[#e91e3f] origin-left transition-transform duration-300 ${on ? "scale-x-100" : "scale-x-0"}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* 📌 모바일은 필터 칩이 너무 많아지므로 접어 두고, 필요할 때만 편다 */}
        <div className="md:hidden flex items-center justify-between gap-3 pb-4 border-b border-[#e2e0dc]">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full border text-[12px] font-bold transition-colors ${
              activeFilterCount > 0 ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#4b4b4b] border-[#e2e0dc]"
            }`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
            </svg>
            필터{activeFilterCount > 0 ? ` ${activeFilterCount}` : ""}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold text-[#8a8a8a] shrink-0">{visible.length}개</span>
            <Dropdown
              theme="light"
              value={sort}
              onChange={setSort}
              options={SORTS.map((s) => ({ value: s.v, label: s.l }))}
              className="w-[116px]"
              buttonClassName="!rounded-full !py-1.5 !px-3 !text-[12px] !font-bold"
            />
          </div>
        </div>

        {/* 모바일 — 펼친 필터 */}
        {showFilters && (
          <div className="md:hidden pt-4 pb-5 border-b border-[#e2e0dc] space-y-4" style={{ animation: "menuDrop 0.24s cubic-bezier(0.16,1,0.3,1)" }}>
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mb-2">가격대</p>
              <div className="flex flex-wrap gap-2">
                {PRICE_RANGES.map((r) => (
                  <button key={r.v} onClick={() => setPriceFilter(r.v)} className={chip(priceFilter === r.v)}>{r.l}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mb-2">조건</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setInStockOnly(!inStockOnly)} className={chip(inStockOnly)}>재고 있는 상품만</button>
                {isLoggedIn && (
                  <button onClick={() => setAffordableOnly(!affordableOnly)} className={chip(affordableOnly)}>구매 가능한 상품만</button>
                )}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setPriceFilter("all"); setInStockOnly(false); setAffordableOnly(false); }}
                className="text-[11px] font-bold text-[#e91e3f]">필터 초기화</button>
            )}
          </div>
        )}

        {/* 데스크톱 — 필터를 그대로 펼쳐 둔다 */}
        <div className="hidden md:block">
          <div className="flex flex-wrap items-center gap-2 mb-3">
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
        </div>
      </section>

      {/* ── 상품 목록 ── */}
      <section className="max-w-6xl mx-auto px-6 py-10 pb-32 md:pb-24">
        <div id="shop-list" className="scroll-mt-24"></div>

        {/* 찜만 보기 — 해제 버튼을 눈에 띄게 */}

        {isLoading ? (
          <div className="py-24 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center break-keep">
            <p className="text-sm font-bold text-[#4b4b4b] mb-1">조건에 맞는 상품이 없습니다.</p>
            <p className="text-xs text-[#8a8a8a]">필터를 조정하거나 다른 검색어를 입력해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-6">
            {visible.map((it) => renderCard(it))}
          </div>
        )}
      </section>
      </>)}


      {/* ── 우측 하단 고정 XP 카드 (PC) ── */}
      {isLoggedIn && (
        <div className="hidden md:block fixed bottom-6 right-6 z-[92] w-[268px]">
          <div className="rounded-2xl p-px bg-gradient-to-b from-white via-[#e6e3de] to-[#dcd8d1] shadow-[0_18px_50px_-16px_rgba(0,0,0,0.3)]">
            <div className="relative rounded-[15px] bg-gradient-to-b from-white to-[#fbfaf8] px-5 py-4 overflow-hidden">
              <div className="absolute top-0 left-5 right-5 h-px bg-gradient-to-r from-transparent via-[#e91e3f]/50 to-transparent"></div>

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-[9px] font-black tracking-[0.3em] text-[#a3a3a3] uppercase mb-1.5">Balance</div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[26px] leading-none font-black tracking-tighter text-[#131313] tabular-nums">
                      {myXp == null ? "—" : myXp.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-black tracking-[0.12em] text-[#e91e3f]">XP</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] font-black tracking-[0.3em] text-[#a3a3a3] uppercase mb-1.5">Lv</div>
                  <div className="text-[17px] leading-none font-black text-[#131313] tabular-nums">{myLevel}</div>
                </div>
              </div>

              {myProgress && myProgress.required > 0 && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-[#8a8a8a]">다음 레벨까지</span>
                    <span className="text-[10px] font-bold text-[#4b4b4b] tabular-nums">{myProgress.needToNext.toLocaleString()} XP</span>
                  </div>
                  <div className="h-1 rounded-full bg-[#eceae6] overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, Math.round((myProgress.current / myProgress.required) * 100))}%` }}></div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1 pt-3 border-t border-[#ececea]">
                <button onClick={() => setShowWishList(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold text-[#4b4b4b] hover:text-[#131313] hover:bg-[#f5f3f0] transition-colors">
                  <svg className={`w-3.5 h-3.5 transition-colors ${wish.length > 0 ? "text-[#e91e3f]" : ""}`}
                    fill={wish.length > 0 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                  </svg>
                  찜{wish.length > 0 ? ` ${wish.length}` : ""}
                </button>
                <span className="w-px h-3.5 bg-[#ececea]"></span>
                <Link href="/shop/cart"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-bold text-[#4b4b4b] hover:text-[#131313] hover:bg-[#f5f3f0] transition-colors">
                  <svg className={`w-3.5 h-3.5 ${cartCount > 0 ? "text-[#131313]" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                  장바구니{cartCount > 0 ? ` ${cartCount}` : ""}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 장바구니에 이미 담긴 상품을 '구매'로 눌렀을 때 ── */}
      {cartConflict && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCartConflict(null)}>
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-7 border border-[#e2e0dc] shadow-2xl"
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setCartConflict(null)} aria-label="닫기"
              className="absolute top-4 right-4 p-1.5 rounded-full text-[#a3a3a3] hover:text-[#131313] hover:bg-[#f5f3f0] transition-colors">
              <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="w-12 h-12 rounded-full bg-[#f5f3f0] flex items-center justify-center mb-4 text-[#131313]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>

            <h2 className="text-base font-black text-[#131313] mb-1.5">이미 장바구니에 있는 상품입니다</h2>
            <p className="text-[13px] text-[#5a5a5a] leading-relaxed mb-6 break-keep">
              <span className="font-bold text-[#131313]">{cartConflict.name}</span> 은(는) 장바구니에 담겨 있어요.
              지금 이 상품만 결제할지, 장바구니에 담은 다른 상품과 함께 결제할지 골라주세요.
            </p>

            <div className="space-y-2">
              <Link href="/shop/cart"
                className="block w-full py-3.5 text-center bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">
                장바구니에서 함께 결제 ({cartCount})
              </Link>
              <button
                onClick={() => { const it = cartConflict; setCartConflict(null); removeFromCart(it._id); startBuy(it); }}
                className="w-full py-3.5 bg-[#eceae6] hover:bg-[#e2e0dc] text-[#4b4b4b] font-bold rounded-xl transition-colors">
                이 상품만 지금 구매
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 찜 목록 패널 ── */}
      {showWishList && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowWishList(false)}>
          <div className="w-full max-w-lg max-h-[80vh] bg-white rounded-3xl border border-[#e2e0dc] flex flex-col shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)] overflow-hidden"
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ececea] flex items-center justify-between shrink-0">
              <h2 className="text-base font-black text-[#131313] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#e91e3f]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                찜한 상품 {wishRows.length > 0 && <span className="text-[#e91e3f]">{wishRows.length}</span>}
              </h2>
              <button onClick={() => setShowWishList(false)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="overflow-y-auto">
              {wishRows.length === 0 ? (
                <div className="py-16 text-center px-6 break-keep">
                  <p className="text-sm font-bold text-[#131313] mb-1.5">찜한 상품이 없습니다</p>
                  <p className="text-xs text-[#8a8a8a]">상품 카드의 하트를 눌러 담아보세요.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#ececea]">
                  {wishRows.map((it) => {
                    const owned = ownedItemIds.has(it._id);
                    const inCart = cart.some((c) => c.itemId === it._id);
                    const soldOut = it.stock === 0;
                    return (
                      <div key={it._id} className="p-5 flex gap-4 items-center">
                        <div className="w-16 h-16 rounded-xl bg-[#eceae6] overflow-hidden shrink-0">
                          {it.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black mb-1 ${TYPE_BADGE[it.type]?.cls || "bg-[#131313] text-white"}`}>
                            {TYPE_BADGE[it.type]?.label || "상품"}
                          </span>
                          <h3 className="text-sm font-bold text-[#131313] truncate">{it.name}</h3>
                          <p className="text-[12px] font-black text-[#131313] tabular-nums mt-0.5">
                            {salePrice(it).toLocaleString()} XP
                            {salePrice(it) < it.price && (
                              <span className="ml-1.5 text-[10px] font-normal text-[#a3a3a3] line-through">{it.price.toLocaleString()} XP</span>
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <button
                            onClick={() => addToCart(it)}
                            disabled={owned || soldOut || inCart}
                            className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-colors ${
                              owned || soldOut || inCart
                                ? "bg-[#eceae6] text-[#a3a3a3] cursor-not-allowed"
                                : "bg-[#e91e3f] text-white hover:bg-[#d01634]"
                            }`}>
                            {owned ? "보유 중" : soldOut ? "품절" : inCart ? "담김" : "장바구니"}
                          </button>
                          <button onClick={() => toggleWish(it)}
                            className="px-3.5 py-2 rounded-full text-[11px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors">
                            찜 해제
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 쿠폰함 (ARCTIC) ── */}
      {showCoupons && (
        <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setShowCoupons(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-white border border-[#e2e0dc] rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88dvh] sm:max-h-[80vh] overflow-hidden shadow-[0_30px_70px_-18px_rgba(0,0,0,0.3)] flex flex-col animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200">
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#ececea]">
              <div className="flex items-center gap-2.5">
                <svg className="w-[18px] h-[18px] text-[#e91e3f]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                </svg>
                <h2 className="text-base font-black text-[#131313] tracking-tight">쿠폰함</h2>
              </div>
              <button onClick={() => setShowCoupons(false)} aria-label="닫기"
                className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-black/[0.05] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="shrink-0 px-6 pt-5 pb-4 border-b border-[#ececea]">
              <div className="flex gap-2">
                <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") registerCoupon(); }}
                  placeholder="쿠폰 코드 입력"
                  className="flex-1 min-w-0 bg-white border border-[#e2e0dc] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors uppercase placeholder:normal-case placeholder:text-[#a3a3a3]" />
                <button onClick={registerCoupon} disabled={!couponCode.trim() || isRegisteringCoupon}
                  className="px-5 py-3 rounded-xl bg-[#131313] hover:bg-black disabled:opacity-40 text-white text-[13px] font-bold transition-colors shrink-0">
                  {isRegisteringCoupon ? "확인" : "등록"}
                </button>
              </div>
              {couponMsg && (
                <p className={`mt-2.5 text-[12px] font-bold break-keep ${couponMsg.ok ? "text-[#3f7a35]" : "text-[#c62828]"}`}>{couponMsg.text}</p>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden">
              <div className="px-6 pt-4 pb-2 flex items-center justify-between">
                <span className="text-[11px] font-black tracking-[0.2em] text-[#8a8a8a] uppercase">My Coupons</span>
                {myCoupons.length > 0 && <span className="text-[11px] font-black text-[#e91e3f]">{myCoupons.length}장</span>}
              </div>
              {isLoadingCoupons ? (
                <p className="px-6 py-10 text-center text-xs text-[#8a8a8a]">불러오는 중...</p>
              ) : myCoupons.length === 0 ? (
                <p className="px-6 py-10 text-center text-xs text-[#8a8a8a] break-keep">보유한 쿠폰이 없습니다.</p>
              ) : (
                <div className="divide-y divide-[#ececea]">
                  {myCoupons.map((c) => (
                    <div key={c.id} className="px-6 py-3.5 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center shrink-0">
                        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-[#131313] truncate">{c.name}</p>
                        <p className="text-[11px] text-[#8a8a8a] break-keep">
                          {c.type === "percent" ? `${c.value}% 할인` : `${(c.value || 0).toLocaleString()} XP 할인`}
                          {c.minTotal > 0 && ` · ${c.minTotal.toLocaleString()} XP 이상`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 px-6 py-3 border-t border-[#ececea]">
              <p className="text-[11px] text-[#a3a3a3] text-center break-keep">할인 쿠폰은 결제 화면에서 사용할 수 있습니다.</p>
            </div>
          </div>
        </div>
      )}

      {/* ── 모바일 하단바 ──
             /level 안에서는 전역 모바일 독과 위치·크기·격자가 같아 정확히 포개진다.
             그대로 두면 전역 독을 덮어 LEVEL 을 빠져나갈 수 없으므로 끄고,
             독에만 있던 검색·찜·장바구니는 위쪽 인라인 줄로 대신한다. */}
      {!embedded && (
      <ArcticDock
        activeKey={showWishList ? "wish" : showMobileSearch || query ? "search" : view === "home" ? "home" : ""}
        cartCount={cartCount}
        wishCount={wish.length}
        onSelect={(key) => {
          if (key === "home") { setView("home"); setQuery(""); setShowWishList(false); window.scrollTo({ top: 0, behavior: "smooth" }); return true; }
          if (key === "wish") { setShowWishList(true); return true; }
          if (key === "search") { setShowMobileSearch(true); return true; }
          if (key === "me" && !isLoggedIn) { signIn("discord"); return true; }
          return false; // 장바구니·내 정보는 이동
        }}
      />
      )}

      {/* ── 모바일 검색 시트 ── */}
      {showMobileSearch && (
        <div className="md:hidden fixed inset-0 z-[145] bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileSearch(false)}>
          <div className="bg-white px-5 pt-5 pb-6 rounded-b-3xl shadow-lg" onClick={(e) => e.stopPropagation()}
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }}>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a3a3a3] pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                <input autoFocus type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") setShowMobileSearch(false); }}
                  placeholder="상품명, 설명, 역할로 검색"
                  className="w-full bg-[#f5f3f0] rounded-full pl-9 pr-4 py-3 text-[14px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
              </div>
              <button onClick={() => setShowMobileSearch(false)} className="px-4 py-3 text-[13px] font-bold text-[#131313]">닫기</button>
            </div>
            {query && (
              <button onClick={() => setQuery("")} className="mt-3 text-[12px] font-bold text-[#e91e3f]">검색어 지우기</button>
            )}
          </div>
        </div>
      )}

      {/* 토스트 — 상단 중앙에서 튀어나오듯 등장 */}
      {cartToast && (
        <div key={cartToast} className="fixed top-20 left-1/2 z-[150] pointer-events-none" style={{ animation: "toastPop 0.42s cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="-translate-x-1/2 flex items-center gap-2.5 px-5 py-3 bg-[#131313] text-white rounded-full shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
            <span className="text-[12px] font-bold whitespace-nowrap">{cartToast}</span>
          </div>
        </div>
      )}

      {/* 상점 전용 마이크로 애니메이션 */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes toastPop {
          0%   { opacity: 0; transform: translateY(-14px) scale(0.92); }
          55%  { opacity: 1; transform: translateY(2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cartBump {
          0%, 100% { transform: scale(1); }
          40%      { transform: scale(1.18); }
        }
        .cart-bump { animation: cartBump 0.36s cubic-bezier(0.16,1,0.3,1); }
        @keyframes wishPop {
          0%   { transform: scale(1); }
          45%  { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .wish-pop { animation: wishPop 0.34s cubic-bezier(0.16,1,0.3,1); }
        @keyframes menuDrop {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />

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
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black mb-1.5 ${TYPE_BADGE[buyTarget.type]?.cls || "bg-[#131313] text-white"}`}>
                      {TYPE_BADGE[buyTarget.type]?.label || "상품"}
                    </span>
                    <h2 className="text-base font-black text-[#131313] truncate">{buyTarget.name}</h2>
                    <p className="text-sm font-black text-[#e91e3f] tabular-nums mt-0.5">
                      {salePrice(buyTarget, buyTarget._days).toLocaleString()} XP
                      {buyTarget._days > 0 && <span className="text-[11px] font-bold text-[#8a8a8a] ml-1.5">/ {durationLabel(buyTarget._days)}</span>}
                    </p>
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

                  {buyTarget._days > 0 && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#4b4b4b] mb-2">이용 기간</label>
                      <div className="flex gap-2">
                        {durationOptions(buyTarget).map((o) => {
                          const on = o.days === buyTarget._days;
                          return (
                            <button key={o.days} type="button" onClick={() => { setPickDays((prev) => ({ ...prev, [buyTarget._id]: o.days })); setBuyTarget({ ...buyTarget, _days: o.days }); }}
                              className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#5a5a5a] border-[#e2e0dc] hover:border-[#131313]"}`}>
                              {durationLabel(o.days)}
                              <span className={`block text-[11px] font-bold tabular-nums mt-0.5 ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>{salePrice(buyTarget, o.days).toLocaleString()} XP</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">기간이 끝나면 역할이 자동으로 회수됩니다.</p>
                    </div>
                  )}

                  <div className="bg-[#f5f3f0] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#c62828] tabular-nums">-{salePrice(buyTarget, buyTarget._days).toLocaleString()}</span></div>
                    <div className="h-px bg-[#e2e0dc]"></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 잔액</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myXp ?? 0) - salePrice(buyTarget, buyTarget._days)).toLocaleString()}</span></div>
                  </div>

                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-5 break-keep">
                    {buyTarget.type !== "physical"
                      ? (buyTarget._days > 0 ? `구매 즉시 XP가 차감되며, 봇이 30초 이내에 역할을 지급합니다. ${durationLabel(buyTarget._days)} 뒤 자동으로 회수됩니다.` : "구매 즉시 XP가 차감되며, 봇이 30초 이내에 역할을 지급합니다.")
                      : "구매 즉시 XP가 차감되며, 운영진 확인 후 순차적으로 발송됩니다."}
                    {" "}구매 후에는 직접 취소할 수 없습니다.
                  </p>

                  <div className="flex gap-3">
                    <button onClick={() => setBuyTarget(null)} className="flex-1 py-3.5 bg-[#eceae6] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e2e0dc] transition-colors">취소</button>
                    <button onClick={confirmBuy} disabled={isBuying || !canAfford(salePrice(buyTarget, buyTarget._days))}
                      className="flex-1 py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {isBuying ? "처리 중..." : canAfford(salePrice(buyTarget, buyTarget._days)) ? "구매 확정" : "XP 부족"}
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
                    {[{ v: "role", l: "역할" }, { v: "perk", l: "권한" }, { v: "physical", l: "기프트카드" }].map((o) => (
                      <button key={o.v} type="button" onClick={() => setEditForm({ ...editForm, type: o.v })}
                        className={`flex-1 py-2.5 rounded-lg text-[12px] font-bold border transition-colors ${editForm.type === o.v ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#4b4b4b] border-[#e2e0dc] hover:border-[#a3a3a3]"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>

                {(editForm.type === "role" || editForm.type === "perk") && (
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">정가 <span className="text-[#c62828]">*</span></label>
                    <input type="number" min={1} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                      placeholder="500000" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#4b4b4b] mb-2">할인율 (%)</label>
                    <input type="number" min={0} max={100} value={editForm.discountPct} onChange={(e) => setEditForm({ ...editForm, discountPct: e.target.value })}
                      placeholder="0" className="w-full bg-white border border-[#e2e0dc] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                  </div>
                </div>
                {Number(editForm.discountPct) > 0 && Number(editForm.price) > 0 && (
                  <p className="text-[11px] font-bold text-[#e91e3f] -mt-1">
                    판매가 {Math.max(0, Math.floor((Number(editForm.price) * (100 - Math.min(100, Number(editForm.discountPct)))) / 100)).toLocaleString()} XP
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
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
                    <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide ${TYPE_BADGE[editForm.type]?.cls || "bg-[#131313] text-white"}`}>
                      {TYPE_BADGE[editForm.type]?.label || "상품"}
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
                      <span>{Number(editForm.stock) > 0 && Number(editForm.stock) <= 5 ? `한정 수량 · ${editForm.stock}개 남음` : " "}</span>
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

      {/* 전역 푸터와 내용이 같으므로 /level 안에서는 그리지 않는다 */}
      {!embedded && <ArcticFooter />}
    </div>
  );
}
