"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import Dropdown from "../components/Dropdown";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
import IconPicker from "../components/IconPicker";
import { salePrice, isTimed, durationOptions, durationLabel, durationPrice } from "@/lib/shopPricing";
import { itemTypeLabel, itemTypeColor, ITEM_TYPE_OPTIONS } from "@/lib/items";
import {
  EMPTY_PRODUCT_FORM, SOURCE_OPTIONS, sourceOf, isLinked, formFromShopItem,
  buildDurations, pickType as pickProductType, applyItem, unlinkItem, toPayload,
} from "./productForm";
import ArcticFooter from "./ArcticFooter";
import ArcticDock from "./ArcticDock";
import ArcticHome from "./ArcticHome";
import { useSearchParams } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];

// 📌 ARCTIC 본문 — /shop 라우트와 SYSTEM:LEVEL 의 ARCTIC 탭이 이 한 벌을 함께 쓴다.
//    공개 전에는 관리자만 볼 수 있다 (레벨 대시보드 → 기본 정책 → ARCTIC 공개)
//
//    ARCTIC 은 제 주소 /arctic 에 산다(3차) — 전역 상단 바(ClientLayout)는 여기에도 그대로 걸린다.
//    그래서 브랜드·쿠폰함·알림·프로필은 전역 바에 두고, 여기서는 스토어에만 있는 줄
//    (유형 탭 · 검색 · 재화 · 찜 · 장바구니)만 그린다. 모바일 독·푸터는 여전히 여기 몫.
//    embedded 는 레이아웃 차이 하나만 흡수한다 — /level 래퍼가 이미 min-h-screen 이라
//    루트에서 한 번 더 주면 빈 화면 하나만큼 세로가 늘어난다.
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
  { v: "item", l: "아이템" },
  { v: "physical", l: "기프트카드" },
  { v: "timed", l: "기간제" },
];

// 상품 유형 배지 — 라벨·색은 lib/items.js 가 단일 원천 (역할·권한은 자동 지급, 기프트카드는 운영진 발송)
function TypeBadge({ type, className = "" }: { type: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
      {itemTypeLabel(type)}
    </span>
  );
}

// 📌 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon: 프리셋 SVG·이모지·유형 기본).
//    배경은 등록 색을 연하게 깐 그라데이션이라 이미지 없는 상품도 서로 구분된다.
function CardArt({ it, imgClass = "", iconSize = 48 }: { it: any; imgClass?: string; iconSize?: number }) {
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
}

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

// 📌 관리자 상품 폼 묶음 — 기간·시즌 항목이 붙으면서 폼이 화면보다 길어졌다.
//    접힌 상태에서도 값을 알 수 있게 한 줄 요약을 오른쪽에 남긴다.
//    (컴포넌트를 본문 안에서 정의하면 입력할 때마다 새로 마운트돼 포커스를 잃는다 — 모듈 최상단에 둔다)
function FormGroup({ title, summary, open, onToggle, children }: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-black/[0.08]">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 py-3.5 text-left">
        <span className="text-[13px] font-black text-[#131313] shrink-0">{title}</span>
        <span className="flex items-center gap-2 min-w-0">
          {/* min-w-0 이 없으면 flex 안에서 줄어들지 못해 truncate 가 안 걸린다 */}
          {!open && summary && <span className="min-w-0 text-[11px] text-[#8a8a8a] truncate">{summary}</span>}
          <svg className={`w-3.5 h-3.5 shrink-0 text-[#a3a3a3] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>
      {open && (
        <div className="pb-5 space-y-4" style={{ animation: "menuDrop 0.22s cubic-bezier(0.16,1,0.3,1)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// 관리자 폼 입력칸 공통 모양
const F_LABEL = "block text-xs font-bold text-[#4b4b4b] mb-2";
const F_INPUT = "w-full bg-white border border-[#e0e0e0] rounded-lg px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]";
const F_INPUT_SM = "w-full bg-white border border-[#e0e0e0] rounded-lg px-3 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]";
const F_NOTE = "text-[10px] text-[#8a8a8a] mt-1.5";

// 판매 상태 · 기간제 · 시즌 동작이 같은 모양을 쓴다
function FormToggle({ on, onClick, onLabel, offLabel, disabled = false }: { on: boolean; onClick: () => void; onLabel: string; offLabel: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors disabled:opacity-60 disabled:cursor-default ${on ? "border-[#e91e3f] bg-[#e91e3f]/[0.06]" : "border-[#e0e0e0] bg-white"}`}>
      <span className={on ? "font-bold text-[#e91e3f]" : "text-[#8a8a8a]"}>{on ? onLabel : offLabel}</span>
      <span className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${on ? "bg-[#e91e3f]" : "bg-[#d4d4d4]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}></span>
      </span>
    </button>
  );
}

export default function ArcticShopBody({
  embedded = false,
  topSlot = null,
}: {
  embedded?: boolean;
  /** 스토어 줄 바로 아래에 끼워 넣을 것 — /level 은 카테고리 줄을 여기에 넣어
   *  어느 탭이든 카테고리가 같은 높이에 오게 한다 */
  topSlot?: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const isLoggedIn = status === "authenticated";
  const realAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);
  // 📌 관리 버튼이 화면 곳곳에 박혀 있어 일반 유저가 보는 모습을 확인할 수 없었다.
  //    미리보기를 켜면 관리 UI 만 숨긴다 — 접근 권한(비공개 상점 열람)은 그대로 둔다.
  const [userPreview, setUserPreview] = useState(false);
  const isAdmin = realAdmin && !userPreview;

  const [shopPublic, setShopPublic] = useState<boolean | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myPoint, setMyPoint] = useState<number | null>(null);
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
  // 📌 검색어가 있으면 어느 화면이든 상품(검색 결과)을 보인다 — 지우면 원래 화면으로
  const showing: "home" | "products" = query.trim() ? "products" : view;

  // 구매 모달
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // 📌 장바구니 — 로컬에 보관해 새로고침해도 유지 ([{ itemId, qty }])
  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [cartToast, setCartToast] = useState("");

  // 스토어 줄 — 모바일 검색 시트 · 필터 접기
  //  (알림·프로필은 전역 상단 바가 가져갔다)
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

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

  // 관리자 — 상점 안에서 바로 상품 추가·수정 (폼 상태·기간·유형·아이템 적용 규칙은 ./productForm 공용)
  const [editForm, setEditForm] = useState<any>(null);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  // 등록된 아이템(/api/admin/items) — 상품 폼에서 "등록된 아이템" 으로 고른다
  const [regItems, setRegItems] = useState<any[]>([]);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [editError, setEditError] = useState("");
  const [openGroups, setOpenGroups] = useState({ basic: true, price: false, stock: false, season: false });
  const toggleGroup = (k: "basic" | "price" | "stock" | "season") => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

  const pickType = (v: string) => setEditForm((f: any) => pickProductType(f, v));

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGuildRoles(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
    fetch("/api/admin/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRegItems(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, [isAdmin]);

  const openEdit = (it?: any) => {
    setEditError("");
    setOpenGroups({ basic: true, price: false, stock: false, season: false });
    setEditForm(it ? formFromShopItem(it) : { ...EMPTY_PRODUCT_FORM });
  };

  const saveItem = async () => {
    if (!editForm || isSavingItem) return;
    const durations = buildDurations(editForm);
    if (editForm.timed && editForm.type !== "physical" && durations.length === 0) {
      setEditError("기간 가격을 하나 이상 입력해주세요.");
      return;
    }
    setIsSavingItem(true);
    setEditError("");
    try {
      const role = guildRoles.find((r) => r.id === editForm.roleId);
      const res = await fetch("/api/shop/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(editForm, role?.name || "")),
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
      .then((d) => { if (d?.success) { setMyXp(d.data.xp); setMyPoint(d.data.point ?? 0); setMyLevel(d.data.level); setMyProgress(d.data.levelProgress || null); } })
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
      if (typeFilter !== "all" && (typeFilter === "timed" ? !isTimed(it) : it.type !== typeFilter)) return false;
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
      active ? "bg-[#e91e3f] text-[#ffffff] border-[#e91e3f]" : "bg-white/70 text-[#4b4b4b] border-[#e0e0e0] hover:border-[#a3a3a3]"
    }`;

  // 공개 전 · 비관리자 → 준비 중 안내
  if (status === "loading" || shopPublic === null) {
    return <div className={`w-full flex-1 bg-white ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center text-sm text-[#8a8a8a]`}>불러오는 중...</div>;
  }
  // 접근은 실제 권한으로 판정한다 — 미리보기는 관리 UI 만 숨기는 것이지
  // 스토어를 못 보게 하는 게 아니다 (공개 전에도 유저 화면을 확인할 수 있어야 한다)
  if (!shopPublic && !realAdmin) {
    return (
      <div className={`w-full flex-1 bg-white text-[#131313] ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center px-6`}>
        {/* break-keep을 주지 않으면 한국어가 단어 중간에서 잘려 내려간다 */}
        <div className="text-center max-w-md break-keep">
          <h1 className="text-3xl font-black tracking-tighter mb-3">ARCTIC 준비 중</h1>
          {/* 오픈 시점은 화면에 없는 정보라 이 한 줄만 남긴다 */}
          <p className="text-sm text-[#4b4b4b] leading-relaxed mb-8">오픈 소식은 공지사항으로 안내드릴게요.</p>
          <Link href="/level" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            SYSTEM : LEVEL 보러가기
          </Link>
        </div>
      </div>
    );
  }


  // 📌 상품 하나 — 상자(카드) 없이 그림 · 상품명 · 정가(무제한) · 찜 만. 담기·구매는 상세에서.
  //    표시 가격은 정가(무제한): 기간제는 무제한 옵션의 정가, 없으면 기준가. 할인·기간은 상세가 말한다.
  const renderCard = (it: any) => {
    const soldOut = it.stock === 0;
    const wished = wish.includes(it._id);
    const listPrice = isTimed(it) ? (durationPrice(it, 0) ?? it.price) : it.price;
    const pct = Math.max(0, Math.min(100, Number(it.discountPct) || 0));
    const finalPrice = pct ? Math.max(0, Math.floor((Number(listPrice || 0) * (100 - pct)) / 100)) : Number(listPrice || 0);
    return (
      <div key={it._id} className="group relative flex flex-col">
        <Link href={`/arctic/item/${it._id}`} className="block relative aspect-square overflow-hidden rounded-md bg-[#f2f2f2]">
          <CardArt it={it} imgClass="group-hover:scale-[1.03] transition-transform duration-500" iconSize={64} />
          {isAdmin && !it.active && (
            <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">숨김</span>
          )}
          {soldOut && (
            <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="text-[12px] font-black text-[#131313] tracking-wider">품절</span>
            </span>
          )}
        </Link>

        {/* 찜 */}
        <button onClick={() => toggleWish(it)} aria-label={wished ? "찜 해제" : "찜하기"}
          className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors">
          <svg className={`w-4 h-4 transition-colors ${wished ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}
            fill={wished ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
          </svg>
        </button>

        <Link href={`/arctic/item/${it._id}`} className="block mt-3">
          {/* 이름은 작고 가볍게, 가격이 주인공 — 둘이 같은 크기면 값이 안 읽힌다 */}
          <h3 className="text-[13px] font-semibold text-[#4b4b4b] leading-snug line-clamp-2 break-keep">{it.name}</h3>
          {/* 할인 중이면 정가는 취소선으로 위에, 할인율은 빨간 글자, 큰 숫자는 할인가 */}
          {pct > 0 && <s className="block mt-2 text-[11.5px] text-[#a3a3a3] tabular-nums leading-none">{Number(listPrice || 0).toLocaleString()} XP</s>}
          <p className={`${pct > 0 ? "mt-1" : "mt-2"} text-[19px] md:text-[20px] font-black text-[#131313] tabular-nums leading-none`}>
            {pct > 0 && <span className="mr-1.5 text-[14px] font-black text-[#e91e3f]">{pct}%</span>}
            {finalPrice.toLocaleString()}<span className="ml-1 text-[11px] font-bold text-[#8a8a8a]">XP</span>
          </p>
        </Link>

        {isAdmin && (
          <div className="mt-2 flex gap-2 text-[11px] font-bold">
            <button onClick={() => openEdit(it)} className="text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
            <button onClick={() => setDeleteTarget(it)} className="text-[#e91e3f] hover:text-[#c62828] transition-colors">삭제</button>
          </div>
        )}
      </div>
    );
  };

  // 접힌 묶음에서도 값을 알 수 있게 만드는 한 줄 요약 (editForm 이 없으면 폼도 안 그린다)
  const efDiscount = Math.min(100, Math.max(0, Number(editForm?.discountPct) || 0));
  const efSale = Math.max(0, Math.floor(((Number(editForm?.price) || 0) * (100 - efDiscount)) / 100));
  const efDurations = buildDurations(editForm);
  const efRoleName = guildRoles.find((r) => r.id === editForm?.roleId)?.name || editForm?.roleName || "";
  const efLinked = isLinked(editForm);
  const efBasicSummary = [efLinked ? "등록된 아이템" : "", editForm?.name || "이름 없음", itemTypeLabel(editForm?.type), efRoleName].filter(Boolean).join(" · ");
  const efPriceSummary = Number(editForm?.price) > 0
    ? `${efSale.toLocaleString()} XP${efDiscount > 0 ? ` (-${efDiscount}%)` : ""}${editForm?.timed ? ` · 기간제 ${efDurations.length}종` : ""}`
    : "가격 미입력";
  const efStockSummary = `${editForm?.stock === "" ? "재고 무제한" : `재고 ${editForm?.stock}`} · 추천 ${editForm?.sortOrder || 0} · ${editForm?.active ? "판매 중" : "숨김"}`;
  const efSeasonSummary = editForm?.detachOnSeason ? "시즌 바뀌면 디스코드 표기 뗌" : "디스코드 역할 계속 유지";

  return (
    <div className={`w-full flex-1 bg-white text-[#131313] ${embedded ? "" : "min-h-screen"}`}>
      {/* ── 스토어 줄 — 유형 탭 + 스토어 도구(검색 · 재화 · 찜 · 장바구니) 한 줄.
             브랜드 · 쿠폰함 · 알림 · 프로필은 전역 상단 바가 이미 갖고 있어 여기서는 빼둔다 —
             같은 창을 여는 진입점이 두 벌이면 어느 쪽이 진짜인지 알 수 없다.
             sticky 도 전역 바 하나면 된다. ── */}
      <div className="w-full bg-white border-b border-[#ededed]">
        <div className="max-w-7xl mx-auto px-5 md:px-6 flex items-center gap-3 md:gap-5 h-16 md:h-[72px]">
          {/* 유형 탭 — 홈 · 역할 · 권한 · 아이템 · 기프트카드 · 기간제. 고른 것만 빨간 밑줄 */}
          <nav className="flex items-center gap-6 md:gap-7 overflow-x-auto no-bar h-full min-w-0 flex-1">
            {[{ v: "home", l: "홈" }, ...TYPES.filter((t) => t.v !== "all")].map((t) => {
              const on = t.v === "home" ? showing === "home" : showing === "products" && typeFilter === t.v;
              return (
                <button key={t.v}
                  onClick={() => {
                    if (t.v === "home") { setView("home"); setQuery(""); setShowWishList(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
                    else goProducts(t.v);
                  }}
                  className={`relative shrink-0 h-full flex items-center text-[15px] font-extrabold transition-colors ${on ? "text-[#131313]" : "text-[#6a6a6a] hover:text-[#131313]"}`}>
                  {t.l}
                  {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
                </button>
              );
            })}
            {/* 시즌 패스 — 유형이 아니라 가는 곳이라 탭 뒤에 선 하나 두고 붙인다 */}
            <span className="shrink-0 w-px h-4 bg-[#e0e0e0]" />
            <Link href="/level?tab=pass" className="shrink-0 text-[13px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors whitespace-nowrap">
              시즌 패스
            </Link>
          </nav>

          {/* 스토어 전용 도구 — 여기 말고는 어디에도 없는 것들만 */}
          <div className="flex items-center gap-1.5 md:gap-2.5 shrink-0">
            {/* 관리자 — 일반 유저에게 보이는 화면으로 바꿔 보기 */}
            {realAdmin && (
              <button
                onClick={() => setUserPreview((v) => !v)}
                title={userPreview ? "관리 화면으로 돌아가기" : "일반 유저에게 보이는 화면으로 보기"}
                className={`inline-flex shrink-0 items-center gap-1.5 h-8 px-2.5 md:px-3 rounded-full text-[11px] font-bold border transition-colors ${
                  userPreview
                    ? "bg-[#131313] text-white border-[#131313]"
                    : "bg-white text-[#5a5a5a] border-[#e0e0e0] hover:text-[#131313] hover:border-[#a3a3a3]"
                }`}
              >
                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" strokeLinejoin="round" />
                  <circle cx="10" cy="10" r="2.6" />
                </svg>
                <span className="hidden sm:inline">{userPreview ? "미리보기 중" : "유저 화면"}</span>
              </button>
            )}

            {/* 비공개 상태 — 관리자에게만 작은 점으로 알린다 */}
            {!shopPublic && isAdmin && (
              <Link href="/admin/bot?tab=policy&sec=mute" title="비공개 상태입니다 · 눌러서 공개 전환"
                className="group/dot relative flex items-center shrink-0 mr-1">
                <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>
                <span className="absolute left-0 w-2 h-2 rounded-full bg-[#e91e3f] animate-ping opacity-60"></span>
                <span className="absolute left-4 top-1/2 -translate-y-1/2 whitespace-nowrap px-2 py-1 rounded-md bg-[#131313] text-white text-[10px] font-bold opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                  비공개
                </span>
              </Link>
            )}

            {/* 검색 — 상품을 찾는 건 스토어에서만 한다. 입력하면 곧바로 검색 결과 */}
            <div className="hidden md:block relative w-[200px] lg:w-[280px] xl:w-[320px] h-10 rounded-full border-2 border-[#131313] bg-white overflow-hidden">
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품, 유형, 역할 검색"
                className="absolute inset-0 w-full h-full bg-transparent pl-4 pr-10 text-[13px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
              {query ? (
                <button onClick={() => setQuery("")} aria-label="검색어 지우기"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#a3a3a3] hover:text-[#131313] transition-colors outline-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                </button>
              ) : (
                <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#131313] pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.search} />
                </svg>
              )}
            </div>

            {isLoggedIn && (
              <>
                {/* 재화 — 테두리·알약 없이 글자만. XP 와 빙옥은 각각.
                    좁은 화면에서는 검색·장바구니에 자리를 내준다 */}
                <span className="hidden lg:inline-flex items-baseline gap-3.5 ml-1 text-[12.5px] font-black text-[#131313] tabular-nums whitespace-nowrap">
                  <span>{(myXp ?? 0).toLocaleString()}<span className="ml-[3px] text-[9.5px] text-[#e91e3f]">XP</span></span>
                  <span>{(myPoint ?? 0).toLocaleString()}<span className="ml-[3px] text-[9.5px] text-[#3f9e93]">빙옥</span></span>
                </span>

                {/* 찜 — 찜한 상품 목록 열기 */}
                <button
                  onClick={() => setShowWishList(true)}
                  aria-label="찜한 상품 보기"
                  className={`relative hidden md:flex items-center justify-center w-9 h-9 rounded-full transition-colors ${showWishList ? "bg-[#e91e3f]/10 text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
                  <svg className={`w-[18px] h-[18px] transition-all duration-300 ${wish.length > 0 ? "text-[#e91e3f]" : ""}`}
                    fill={wish.length > 0 ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
                  </svg>
                </button>

                {/* 장바구니 */}
                <Link href="/arctic/cart"
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
              </>
            )}
          </div>
        </div>
      </div>

      {topSlot}

      {/* ── 홈 — 배너 · 유형 타일 · 두 갈래 큐레이션 · 이번 주 (ArcticHome) ── */}
      {showing === "home" && (
        <ArcticHome
          items={items} isLoading={isLoading} isAdmin={isAdmin} isLoggedIn={isLoggedIn}
          myXp={myXp} myLevel={myLevel} ownedItemIds={ownedItemIds}
          banners={banners} bannerIdx={bannerIdx} setBannerIdx={setBannerIdx} bannerRatio={bannerRatio} fitRatio={fitRatio}
          renderCard={renderCard} goProducts={goProducts} openEdit={() => openEdit()}
        />
      )}

      {/* ── 상품 · 검색 · 필터 ── */}
      {showing === "products" && (<>
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
        {/* 📌 아이콘 상태로 접혀 있다가 호버·포커스·입력 시 펼쳐지는 검색창
               (모바일은 터치라 호버가 없으므로 항상 펼친 상태) */}
        {/* 검색어 표시 (검색은 헤더에서) */}
        {query && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[12px] text-[#8a8a8a]">&ldquo;<span className="font-bold text-[#131313]">{query}</span>&rdquo; 검색 결과</span>
            <button onClick={() => setQuery("")} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">검색 해제</button>
          </div>
        )}

        {/* 어느 유형인지는 유형 줄이 말한다 — 여기는 '전체 보기' 로 돌아가는 글자 하나 */}
        {typeFilter !== "all" && !query && (
          <div className="flex items-center gap-2.5 mb-4">
            <span className="text-[13px] font-black text-[#131313]">{TYPES.find((t) => t.v === typeFilter)?.l}</span>
            <button onClick={() => setTypeFilter("all")} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">전체 보기</button>
          </div>
        )}

        {/* 📌 모바일은 필터 칩이 너무 많아지므로 접어 두고, 필요할 때만 편다 */}
        <div className="md:hidden flex items-center justify-between gap-3 pb-4 border-b border-[#e0e0e0]">
          <button onClick={() => setShowFilters(!showFilters)}
            className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full border text-[12px] font-bold transition-colors ${
              activeFilterCount > 0 ? "bg-[#e91e3f] text-white border-[#e91e3f]" : "bg-white text-[#4b4b4b] border-[#e0e0e0]"
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
          <div className="md:hidden pt-4 pb-5 border-b border-[#e0e0e0] space-y-4" style={{ animation: "menuDrop 0.24s cubic-bezier(0.16,1,0.3,1)" }}>
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

          <div className="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-[#e0e0e0]">
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
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 pb-32 md:pb-24">
        <div id="shop-list" className="scroll-mt-24"></div>

        {/* 찜만 보기 — 해제 버튼을 눈에 띄게 */}

        {isLoading ? (
          <div className="py-24 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center break-keep">
            <p className="text-sm font-bold text-[#4b4b4b]">조건에 맞는 상품이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5 lg:gap-6">
            {visible.map((it) => renderCard(it))}
          </div>
        )}
      </section>
      </>)}


      {/* ── 장바구니에 이미 담긴 상품을 '구매'로 눌렀을 때 ── */}
      {cartConflict && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCartConflict(null)}>
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-7 border border-[#e0e0e0] shadow-2xl"
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setCartConflict(null)} aria-label="닫기"
              className="absolute top-4 right-4 p-1.5 rounded-full text-[#a3a3a3] hover:text-[#131313] hover:bg-[#f5f5f5] transition-colors">
              <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} />
              </svg>
            </button>

            <div className="w-12 h-12 rounded-full bg-[#f5f5f5] flex items-center justify-center mb-4 text-[#131313]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>

            <h2 className="text-base font-black text-[#131313] mb-1.5">이미 장바구니에 있는 상품입니다</h2>
            {/* 무엇을 고르는지는 아래 두 버튼이 말한다 — 여기는 어떤 상품인지만 */}
            <p className="text-[13px] font-bold text-[#131313] mb-6 break-keep">{cartConflict.name}</p>

            <div className="space-y-2">
              <Link href="/arctic/cart"
                className="block w-full py-3.5 text-center bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">
                장바구니에서 함께 결제 ({cartCount})
              </Link>
              <button
                onClick={() => { const it = cartConflict; setCartConflict(null); removeFromCart(it._id); startBuy(it); }}
                className="w-full py-3.5 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#4b4b4b] font-bold rounded-xl transition-colors">
                이 상품만 지금 구매
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 찜 목록 패널 ── */}
      {showWishList && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowWishList(false)}>
          <div className="w-full max-w-lg max-h-[80vh] bg-white rounded-3xl border border-[#e0e0e0] flex flex-col shadow-[0_30px_80px_-20px_rgba(0,0,0,0.4)] overflow-hidden"
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ededed] flex items-center justify-between shrink-0">
              <h2 className="text-base font-black text-[#131313] flex items-center gap-2">
                <svg className="w-4 h-4 text-[#e91e3f]" fill="currentColor" viewBox="0 0 24 24">
                  <path d={ICON_PATHS.heart} />
                </svg>
                찜한 상품 {wishRows.length > 0 && <span className="text-[#e91e3f]">{wishRows.length}</span>}
              </h2>
              <button onClick={() => setShowWishList(false)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>

            <div className="overflow-y-auto">
              {wishRows.length === 0 ? (
                <div className="py-16 text-center px-6 break-keep">
                  <p className="text-sm font-bold text-[#131313]">찜한 상품이 없습니다</p>
                </div>
              ) : (
                <div className="divide-y divide-[#ededed]">
                  {wishRows.map((it) => {
                    const owned = ownedItemIds.has(it._id);
                    const inCart = cart.some((c) => c.itemId === it._id);
                    const soldOut = it.stock === 0;
                    return (
                      <div key={it._id} className="p-5 flex gap-4 items-center">
                        <div className="relative w-16 h-16 rounded-xl bg-[#f2f2f2] overflow-hidden shrink-0">
                          <CardArt it={it} iconSize={30} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <TypeBadge type={it.type} className="inline-block px-2 py-0.5 text-[9px] mb-1" />
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
                                ? "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
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

      {/* ── 모바일 하단바 — 하위 페이지와 같은 공용 컴포넌트를 쓴다.
             ARCTIC 탭에서는 ClientLayout 이 전역 독을 숨기므로 겹치지 않는다. */}
      <ArcticDock
        activeKey={showWishList ? "wish" : showMobileSearch || query ? "search" : showing === "home" ? "home" : ""}
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
                  className="w-full bg-[#f5f5f5] rounded-full pl-9 pr-4 py-3 text-[14px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
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
          <div className="bg-[#ffffff] rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-[#e0e0e0]">
            {result ? (
              <div className="p-8 text-center">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5 ${result.ok ? "bg-[#e8f3e6] text-[#3f7a35]" : "bg-[#fdeaea] text-[#c62828]"}`}>
                  {result.ok ? (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                  )}
                </div>
                <h2 className="text-lg font-black text-[#131313] mb-2">{result.ok ? "구매 완료" : "구매 실패"}</h2>
                <p className="text-sm text-[#4b4b4b] leading-relaxed mb-7 break-keep">{result.message}</p>
                <button onClick={() => { setBuyTarget(null); setResult(null); }} className="w-full py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] transition-colors">확인</button>
              </div>
            ) : (
              <>
                <div className="flex gap-4 p-6 border-b border-[#ededed]">
                  <div className="relative w-20 h-20 rounded-xl bg-[#f2f2f2] overflow-hidden shrink-0">
                    <CardArt it={buyTarget} iconSize={36} />
                  </div>
                  <div className="min-w-0">
                    <TypeBadge type={buyTarget.type} className="inline-block px-2 py-0.5 text-[10px] mb-1.5" />
                    <h2 className="text-base font-black text-[#131313] truncate">{buyTarget.name}</h2>
                    <p className="text-sm font-black text-[#e91e3f] tabular-nums mt-0.5">
                      {salePrice(buyTarget, buyTarget._days).toLocaleString()} XP
                      {isTimed(buyTarget) && <span className="text-[11px] font-bold text-[#8a8a8a] ml-1.5">/ {durationLabel(buyTarget._days)}</span>}
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  {buyTarget.type === "physical" && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#4b4b4b] mb-2">수령 정보 <span className="text-[#c62828]">*</span></label>
                      <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                        placeholder="연락처 / 배송지 또는 기프티콘 받을 번호를 입력해주세요."
                        className="w-full bg-white border border-[#e0e0e0] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#8a8a8a] resize-none placeholder:text-[#a3a3a3]" />
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">운영진만 확인하며, 발송 목적으로만 사용됩니다.</p>
                    </div>
                  )}

                  {isTimed(buyTarget) && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#4b4b4b] mb-2">이용 기간</label>
                      <div className="flex gap-2">
                        {durationOptions(buyTarget).map((o) => {
                          const on = o.days === buyTarget._days;
                          return (
                            <button key={o.days} type="button" onClick={() => { setPickDays((prev) => ({ ...prev, [buyTarget._id]: o.days })); setBuyTarget({ ...buyTarget, _days: o.days }); }}
                              className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#5a5a5a] border-[#e0e0e0] hover:border-[#131313]"}`}>
                              {durationLabel(o.days)}
                              <span className={`block text-[11px] font-bold tabular-nums mt-0.5 ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>{salePrice(buyTarget, o.days).toLocaleString()} XP</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">기간이 끝나면 역할이 자동으로 회수됩니다.</p>
                    </div>
                  )}

                  <div className="bg-[#f5f5f5] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#c62828] tabular-nums">-{salePrice(buyTarget, buyTarget._days).toLocaleString()}</span></div>
                    <div className="h-px bg-[#e0e0e0]"></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 잔액</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myXp ?? 0) - salePrice(buyTarget, buyTarget._days)).toLocaleString()}</span></div>
                  </div>

                  {/* 화면에 안 보이는 것만 남긴다 — 지급까지 걸리는 시간과 되돌릴 수 없다는 경고
                      (기간 만료 회수는 위 '이용 기간' 칸이 이미 말한다) */}
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-5 break-keep">
                    {buyTarget.type !== "physical"
                      ? "역할은 30초 이내에 지급되며, 구매 후 취소할 수 없습니다."
                      : "운영진 확인 후 발송되며, 구매 후 취소할 수 없습니다."}
                  </p>

                  <div className="flex gap-3">
                    <button onClick={() => setBuyTarget(null)} className="flex-1 py-3.5 bg-[#f2f2f2] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e0e0e0] transition-colors">취소</button>
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
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[88vh] overflow-hidden shadow-2xl border border-[#e0e0e0] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#ededed] flex items-center justify-between shrink-0">
              <h2 className="text-base font-black text-[#131313]">{editForm.id ? "상품 수정" : "상품 추가"}</h2>
              <button onClick={() => setEditForm(null)} className="p-1.5 text-[#8a8a8a] hover:text-[#131313] transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>

            <div className="overflow-y-auto grid grid-cols-1 md:grid-cols-2">
              {/* 좌 — 입력 폼 */}
              <div className="p-6 md:border-r border-[#ededed]">
                <div className="border-t border-black/[0.08]">

                  {/* ── 기본 정보 ── */}
                  <FormGroup title="기본 정보" summary={efBasicSummary} open={openGroups.basic} onToggle={() => toggleGroup("basic")}>
                    {/* 📌 직접 설정 | 등록된 아이템 — 아이템을 고르면 표기 필드는 채워지고 잠긴다 */}
                    <div>
                      <div className="grid grid-cols-2 gap-2">
                        {SOURCE_OPTIONS.map((o) => {
                          const on = sourceOf(editForm) === o.v;
                          return (
                            <button key={o.v} type="button"
                              onClick={() => {
                                if (on) return; // 이미 그 상태 — 연결 아이템이 첫 항목으로 바뀌지 않게
                                if (o.v === "custom") setEditForm(unlinkItem(editForm));
                                else if (regItems[0]) setEditForm(applyItem(editForm, regItems[0]));
                                else setEditError("등록된 아이템이 없습니다. 아이템 등록에서 먼저 만들어 주세요.");
                              }}
                              className={`py-2.5 rounded-lg text-[12px] font-bold border transition-colors ${on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#4b4b4b] border-[#e0e0e0] hover:border-[#a3a3a3]"}`}>
                              {o.l}
                            </button>
                          );
                        })}
                      </div>
                      {efLinked && (
                        <div className="mt-3">
                          <Dropdown
                            theme="light"
                            value={editForm.itemId}
                            onChange={(v) => { const it = regItems.find((x) => x._id === v); if (it) setEditForm(applyItem(editForm, it)); }}
                            placeholder="아이템을 선택하세요"
                            options={regItems.map((x) => ({
                              value: x._id, label: x.name, hint: itemTypeLabel(x.type),
                              icon: <ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={18} color={x.color || itemTypeColor(x.type)} />,
                            }))}
                          />
                          <p className={F_NOTE}>
                            <Link href="/admin/shop?tab=items" className="font-bold text-[#e91e3f] hover:underline">아이템 등록에서 수정</Link>
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className={F_LABEL}>상품명 <span className="text-[#c62828]">*</span></label>
                      <input type="text" value={editForm.name} disabled={efLinked} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="예: [XP] Boost+" className={`${F_INPUT} disabled:bg-[#f5f5f5] disabled:text-[#8a8a8a]`} />
                    </div>

                    <div>
                      <label className={F_LABEL}>상품 유형 <span className="text-[#c62828]">*</span></label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {ITEM_TYPE_OPTIONS.map((o) => (
                          <button key={o.v} type="button" disabled={efLinked} onClick={() => pickType(o.v)}
                            className={`py-2.5 rounded-lg text-[12px] font-bold border transition-colors disabled:cursor-default ${editForm.type === o.v ? "bg-[#e91e3f] text-white border-[#e91e3f]" : `bg-white text-[#4b4b4b] border-[#e0e0e0] ${efLinked ? "opacity-40" : "hover:border-[#a3a3a3]"}`}`}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 아이템은 역할이 없어도 된다 — 사이트 인벤토리에만 두는 수집품도 판다 */}
                    {(editForm.type === "role" || editForm.type === "perk" || editForm.type === "item") && (
                      <div>
                        <label className={F_LABEL}>
                          지급할 역할 {editForm.type === "item" ? <span className="font-normal text-[#8a8a8a]">(선택)</span> : <span className="text-[#c62828]">*</span>}
                        </label>
                        {efLinked ? (
                          <div className={`${F_INPUT} bg-[#f5f5f5] text-[#8a8a8a]`}>{efRoleName || "역할 없음"}</div>
                        ) : (
                          <Dropdown
                            theme="light"
                            value={editForm.roleId}
                            onChange={(v) => setEditForm({ ...editForm, roleId: v })}
                            placeholder="역할을 선택하세요"
                            options={guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                          />
                        )}
                        {editForm.type === "item" && !efLinked && <p className={F_NOTE}>비우면 사이트 인벤토리에만 남습니다</p>}
                      </div>
                    )}

                    <div>
                      <label className={F_LABEL}>상품 설명</label>
                      <textarea rows={2} value={editForm.description} disabled={efLinked} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        placeholder="카드에 표시될 설명" className={`${F_INPUT} resize-none disabled:bg-[#f5f5f5] disabled:text-[#8a8a8a]`} />
                    </div>

                    {/* 상품 이미지는 상품 고유 값 — 아이템을 연동해도 따로 넣을 수 있다 */}
                    <div>
                      <label className={F_LABEL}>상품 이미지 URL</label>
                      <input type="text" value={editForm.imageUrl} onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                        placeholder="https://..." className={F_INPUT} />
                      <p className={F_NOTE}>비우면 아이템 이미지·아이콘</p>
                    </div>

                    <div>
                      <label className={F_LABEL}>아이콘</label>
                      <IconPicker value={editForm.icon} disabled={efLinked} onChange={(v) => setEditForm({ ...editForm, icon: v })}
                        color={editForm.color || itemTypeColor(editForm.type)} inputClassName={`${F_INPUT_SM} disabled:bg-[#f5f5f5] disabled:text-[#8a8a8a]`} />
                      <p className={F_NOTE}>이미지가 없을 때 카드에 크게</p>
                    </div>

                    <div>
                      <label className={F_LABEL}>색상</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={editForm.color || itemTypeColor(editForm.type)} disabled={efLinked}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="w-11 h-11 shrink-0 rounded-lg border border-[#e0e0e0] bg-white p-1 disabled:opacity-50" />
                        <input type="text" value={editForm.color} disabled={efLinked} maxLength={7} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          placeholder={itemTypeColor(editForm.type)} className={`${F_INPUT_SM} disabled:bg-[#f5f5f5] disabled:text-[#8a8a8a]`} />
                      </div>
                      <p className={F_NOTE}>비우면 유형 기본색</p>
                    </div>
                  </FormGroup>

                  {/* ── 가격 · 기간 ── */}
                  <FormGroup title="가격 · 기간" summary={efPriceSummary} open={openGroups.price} onToggle={() => toggleGroup("price")}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={F_LABEL}>정가 <span className="text-[#c62828]">*</span></label>
                        <input type="number" min={1} value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                          placeholder="500000" className={F_INPUT_SM} />
                      </div>
                      <div>
                        <label className={F_LABEL}>할인율 (%)</label>
                        <input type="number" min={0} max={100} value={editForm.discountPct} onChange={(e) => setEditForm({ ...editForm, discountPct: e.target.value })}
                          placeholder="0" className={F_INPUT_SM} />
                      </div>
                    </div>
                    {efDiscount > 0 && Number(editForm.price) > 0 && (
                      <p className="text-[11px] font-bold text-[#e91e3f]">판매가 {efSale.toLocaleString()} XP</p>
                    )}

                    {/* 📌 기간제 — 기프트카드는 기간 개념이 없어 아예 감춘다 */}
                    {editForm.type !== "physical" && (
                      <div>
                        <label className={F_LABEL}>판매 방식</label>
                        <FormToggle on={!!editForm.timed} onClick={() => setEditForm({ ...editForm, timed: !editForm.timed })}
                          onLabel="기간제" offLabel="영구 보유" />
                        {editForm.timed && (
                          <>
                            <div className="grid grid-cols-3 gap-2 mt-3">
                              {([{ k: "price7", l: "7일" }, { k: "price30", l: "30일" }, { k: "priceInf", l: "무제한" }] as const).map(({ k, l }) => (
                                <div key={k}>
                                  <label className="block text-[11px] font-bold text-[#4b4b4b] mb-1.5">{l}</label>
                                  {/* 세 칸이 나란히 서므로 좌우 여백·글자를 한 단계 줄인다
                                      (v4 는 ! 접두 important 를 안 먹어 클래스를 따로 쓴다) */}
                                  <input type="number" min={0} value={editForm[k]}
                                    onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                                    placeholder="0" className="w-full bg-white border border-[#e0e0e0] rounded-lg px-2.5 py-3 text-[13px] text-[#131313] outline-none focus:border-[#e91e3f] placeholder:text-[#a3a3a3]" />
                                </div>
                              ))}
                            </div>
                            {/* 값이 0이면 그 기간은 안 판다는 뜻이라, 아무것도 안 넣으면 저장이 막힌다 */}
                            <p className={F_NOTE}>값을 넣은 기간만 판매합니다. 기간이 끝나면 봇이 역할을 회수합니다.</p>
                          </>
                        )}
                      </div>
                    )}
                  </FormGroup>

                  {/* ── 재고 · 노출 ── */}
                  <FormGroup title="재고 · 노출" summary={efStockSummary} open={openGroups.stock} onToggle={() => toggleGroup("stock")}>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={F_LABEL}>재고</label>
                        <input type="number" min={0} value={editForm.stock} onChange={(e) => setEditForm({ ...editForm, stock: e.target.value })}
                          placeholder="무제한" className={F_INPUT_SM} />
                        <p className={F_NOTE}>비우면 무제한</p>
                      </div>
                      <div>
                        <label className={F_LABEL}>추천 순서</label>
                        <input type="number" value={editForm.sortOrder} onChange={(e) => setEditForm({ ...editForm, sortOrder: e.target.value })}
                          placeholder="0" className={F_INPUT_SM} />
                        <p className={F_NOTE}>작을수록 상점 앞쪽</p>
                      </div>
                    </div>
                    <div>
                      <label className={F_LABEL}>판매 상태</label>
                      <FormToggle on={!!editForm.active} onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                        onLabel="판매 중" offLabel="숨김" />
                    </div>
                  </FormGroup>

                  {/* ── 시즌 동작 ── 기프트카드는 시즌과 무관하고,
                       권한은 역할이 곧 디스코드 기능이라 떼면 기능이 사라진다 — 둘 다 감춘다 */}
                  {editForm.type !== "physical" && editForm.type !== "perk" && (
                    <FormGroup title="시즌 동작" summary={efSeasonSummary} open={openGroups.season} onToggle={() => toggleGroup("season")}>
                      <FormToggle on={!!editForm.detachOnSeason} disabled={efLinked} onClick={() => setEditForm({ ...editForm, detachOnSeason: !editForm.detachOnSeason })}
                        onLabel="시즌 바뀌면 디스코드 표기 뗌" offLabel="디스코드 역할 계속 유지" />
                      <p className={F_NOTE}>{efLinked ? "등록된 아이템의 설정을 따릅니다." : "표기만 내려가고 인벤토리 소유는 남습니다."}</p>
                    </FormGroup>
                  )}
                </div>

                {editError && <p className="mt-4 text-[12px] font-bold text-[#c62828]">{editError}</p>}
              </div>

              {/* 우 — 실시간 카드 미리보기 */}
              <div className="p-6 bg-[#f5f5f5]">
                <div className="text-[12px] font-black text-[#131313] mb-3">카드 미리보기</div>
                <div className="bg-white rounded-2xl border border-[#e0e0e0] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col">
                  <div className="relative aspect-[4/3] bg-[#f2f2f2] overflow-hidden">
                    <CardArt it={editForm} iconSize={60} />
                    <TypeBadge type={editForm.type} className="absolute top-3 left-3 px-2.5 py-1 text-[10px] tracking-wide" />
                    {!editForm.active && (
                      <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-black bg-white/90 text-[#131313] border border-[#e0e0e0]">숨김</span>
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
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#ededed] flex gap-3 shrink-0">
              <button onClick={() => setEditForm(null)} className="flex-1 py-3.5 bg-[#f2f2f2] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e0e0e0] transition-colors">취소</button>
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
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl border border-[#e0e0e0]">
            <h2 className="text-lg font-black text-[#131313] mb-2">상품 삭제</h2>
            <p className="text-sm text-[#4b4b4b] leading-relaxed mb-7">
              <span className="font-bold text-[#131313]">{deleteTarget.name}</span> 상품을 삭제하시겠습니까?<br />기존 구매 내역은 그대로 유지됩니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3.5 bg-[#f2f2f2] text-[#4b4b4b] font-bold rounded-xl hover:bg-[#e0e0e0] transition-colors">취소</button>
              <button onClick={deleteItem} className="flex-1 py-3.5 bg-[#c62828] text-white font-bold rounded-xl hover:bg-[#a81f1f] transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      <ArcticFooter />
    </div>
  );
}
