"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ICON_PATHS } from "../components/Icons";
import { salePrice, isTimed, durationOptions, durationLabel, cardPick, cardFrom, discountPctOf, isPointOnly, shownPrice, priceUnit, priceText, affordFor } from "@/lib/shopPricing";
import { POINT_RATE } from "@/lib/pointRate";
import { planPayment } from "@/lib/shopPay";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import ArcticFooter from "./ArcticFooter";
import ArcticDock from "./ArcticDock";
import ArcticHome from "./ArcticHome";
import BannerSlider, { useBanners } from "./BannerSlider";
import { BUILTIN_BANNER_THEME, DEFAULT_THEMES, isThemeKey, onThemes, themeNameOf } from "@/lib/shopThemes";
import { SeasonHead, SeasonPicks, seasonPicks } from "./ArcticSeason";
import CardArt from "./CardArt";
import ProductCard, { typeLabelOf, categoryLabelOf, itemShortName } from "./ProductCard";
import { isBundle } from "@/lib/bundle";
import ShopFilterBar from "./ShopFilterBar";
import { priceBuckets, inBucket } from "./priceBuckets";
import { useSearchParams, useRouter } from "next/navigation";
import { useArcticOrigin } from "./fromLevel";
import { ownedIdsOf, bundlePickOf } from "./owned";
import { InventoryPopup } from "../components/Inventory";
import { openLogin, LOGIN_CTX } from "../components/LoginPrompt";
import { CART_KEY, WISH_KEY, readShopList, writeShopList, useShopUid } from "./shopStore";
import { onCartChange } from "./cardCart";
import { saleEnded } from "@/lib/saleWindow";
import { useAdminView } from "../components/AdminView";

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
  { v: "cosmetic", l: "꾸미기" },
  { v: "physical", l: "기프트카드" },
  { v: "timed", l: "기간제" },
  // 📌 시즌 — 빙옥 전용(pointOnly) 상품만 모은 프리미엄 스토어(시즌 상품). 유형이 아니라 결제 방식으로 거른다. 탭 줄에서는 구분선 뒤
  { v: "season", l: "시즌" },
];
// 유형 탭 값 — 이 밖의 탭 값은 이벤트 테마 키다(lib/shopThemes.js — 키는 이 값들과 겹치지 않는다 RESERVED_THEME_KEYS)
const TYPE_VALUES = new Set(TYPES.map((t) => t.v));
// 📌 모바일 유형 줄은 홈 · 전체 · 시즌(· 이벤트 테마)만 두고 나머지는 "카테고리 ▾" 칩 패널로 접는다
const MOBILE_TABS = [{ v: "home", l: "홈" }, ...TYPES.filter((t) => t.v === "all" || t.v === "season")];
const PANEL_TYPES = TYPES.filter((t) => t.v !== "all" && t.v !== "season");

// 📌 이벤트 테마(2026-10-11 할로윈 하나 → 관리자가 만드는 테마 — lib/shopThemes.js · app/api/shop/themes) — 켜진 테마마다 탭 하나(시즌 바로 뒤 · 테마 차례 · 이름 그대로).
//    손님에게는 그 테마 상품이 하나라도 있을 때만, 관리자에게는 비어 있어도(탭이 어디 생기는지 보고 상품에 테마를 고르도록). ?type=<테마 키>
//    지난번에 받은 목록 — 모듈에 둔다(화면을 떠났다 돌아와도 탭이 늦게 붙지 않게). 클라이언트에서 받은 뒤에만 채워진다
type ShopTheme = { key: string; name: string; on: boolean };
let themeCache: ShopTheme[] | null = null;
// 📌 할로윈 탭 맨 위 기본 배너 — 노출 위치 「할로윈 탭」(관리자 → 상점 관리 → 배너)에 켜진 배너가 하나도 없으면 이것(PC · 모바일 그림 한 벌, 링크 없음).
//    기본 배너는 할로윈(BUILTIN_BANNER_THEME)만 — 다른 테마는 배너가 없으면 배너 자리 자체가 없다
//    📌 두 장(2026-10-11 운영자 "세트 상품 다 65% 할인 · 그걸로 할로윈 배너 좀 더") — HALLOWEEN · 검은 고양이 세트 68%(scripts/gen-halloween-banner.mjs, BANNER=cat — 운영자 "한 상품을 테마 잡아서 · 고양이 테마 상품을 주로")가 넘어간다
const HW_BANNERS = [
  { _id: "builtin-halloween", imageUrl: "/banners/halloween-pc.png", mobileImageUrl: "/banners/halloween-mobile.png", title: "", subtitle: "", link: "" },
  { _id: "builtin-halloween-cat", imageUrl: "/banners/halloween-cat-pc.png", mobileImageUrl: "/banners/halloween-cat-mobile.png", title: "", subtitle: "", link: "" },
  // 세 번째(2026-10-11 운영자 "arctic 배너로 · 추가") — 할로윈 꾸미기 세트 최소 65% 할인 · ~ 11. 5. 23:59 + 부채꼴 카드(디스코드 홍보 이미지 윗부분)
  { _id: "builtin-halloween-set", imageUrl: "/banners/halloween-set-pc.png", mobileImageUrl: "/banners/halloween-set-mobile.png", title: "", subtitle: "", link: "" },
  // 네 번째(2026-10-14 운영자 "이대로 ㄱㄱ") — 핫타임 「유령 펭귄의 초대」 · XP 최대 2배 · 이벤트 패스 · 10. 19. ~ 10. 31.(10/18 시작일 10. 16. → 10. 19. · scripts/gen-halloween-banner.mjs, BANNER=ghost)
  { _id: "builtin-ghost-invite", imageUrl: "/banners/ghost-invite-pc.png", mobileImageUrl: "/banners/ghost-invite-mobile.png", title: "", subtitle: "", link: "" },
];
// 📌 기본 배너 중 아직 「등록」 안 된 것(같은 그림인 배너가 없는 것)은 등록된 켜진 배너 뒤에 같이 돈다 — 관리자는 숨김 배너가 맨 뒤에(점으로 넘겨 본다).
//    예전엔 켜진 배너가 하나라도 있으면 기본 배너를 통째로 뺐다 → HALLOWEEN 을 등록해 둔 탓에 검은 고양이 배너가 안 보였다(2026-10-11 "적용한 거 맞아?").
//    useBanners withDefaults 로 넘긴다(자동 넘김 · 점이 얹은 목록을 센다)
const withHwDefaults = (list: any[]) => {
  const taken = new Set(list.map((b) => String(b?.imageUrl || "")));
  const on = list.filter((b) => b.active !== false);
  return [...on, ...HW_BANNERS.filter((d) => !taken.has(d.imageUrl)), ...list.filter((b) => b.active === false)];
};

// 상품 유형 배지 — 라벨·색은 lib/items.js 가 단일 원천 (역할·권한은 자동 지급, 기프트카드는 운영진 발송)
//    label — 분류(ProductCard categoryLabelOf — API categoryLabel). 없으면 유형 이름
function TypeBadge({ type, label = "", className = "" }: { type: string; label?: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
      {label || itemTypeLabel(type)}
    </span>
  );
}

// 📌 가격 필터 구간은 고정 값이 아니라 지금 탭 상품의 가격 분포로 만든다 (./priceBuckets — 시즌 탭은 빙옥 구간)

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "지급 완료", cancelled: "취소됨" };

export default function ArcticShopBody({
  embedded = false,
  topSlot = null,
}: {
  embedded?: boolean;
  /** 스토어 줄 바로 아래에 끼워 넣을 것 — /level 은 카테고리 줄을 여기에 넣어
   *  어느 탭이든 카테고리가 같은 높이에 오게 한다 */
  topSlot?: React.ReactNode;
}) {
  const { status } = useSession();
  const isLoggedIn = status === "authenticated";
  // 📌 관리자로 보는 중(useAdminView().admin) — 계정 메뉴 「유저 화면으로 보기」를 켜면 false(2026-10-17 — 이 화면만의 「유저 화면」 미리보기 토글은 걷었다).
  //    관리 줄 · 카드 「관리에서 수정 · 삭제」 · 숨김 딱지 · ?all=1 숨김 상품 · 비공개 상점 열람이 모두 이 값 하나를 따른다(서버 lib/shopAccess 도 같은 쿠키)
  const { admin: isAdmin } = useAdminView();

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
  // 고른 가격 구간의 v (./priceBuckets), 없으면 "all" — 탭이 바뀌어 그 탭 구간에 없으면 풀린다
  const [priceFilter, setPriceFilter] = useState("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [query, setQuery] = useState("");
  // 📌 검색은 엔터를 쳐야 결과가 바뀐다. 치는 동안에는 추천 단어만 보여 준다.
  const [submitted, setSubmitted] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [recentOn, setRecentOn] = useState(true);
  const showing: "home" | "products" = submitted.trim() ? "products" : view;

  // 최근 검색어는 이 브라우저에만 남는다
  useEffect(() => {
    try {
      const raw = localStorage.getItem("arcticRecentSearch");
      if (raw) setRecents(JSON.parse(raw));
      setRecentOn(localStorage.getItem("arcticRecentOff") !== "1");
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("arcticRecentSearch", JSON.stringify(recents.slice(0, 8))); } catch {}
  }, [recents]);

  const submitSearch = (term?: string) => {
    const t = (term ?? query).trim();
    if (!t) return;
    setQuery(t);
    setSubmitted(t);
    if (recentOn) setRecents((prev) => [t, ...prev.filter((x) => x !== t)].slice(0, 8));
    setSearchOpen(false);
    setShowMobileSearch(false);
    setView("products");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const clearSearch = () => { setQuery(""); setSubmitted(""); };
  const toggleRecent = () => {
    setRecentOn((v) => {
      const next = !v;
      try { localStorage.setItem("arcticRecentOff", next ? "0" : "1"); } catch {}
      return next;
    });
  };

  // 구매 모달
  const [buyTarget, setBuyTarget] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [isBuying, setIsBuying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // 📌 쓸 빙옥 개수 — 나머지는 XP 로. 창 · 요청은 0 ~ 최대로 자른 값만 쓴다 (결제 화면과 같은 계산)
  const [pointUse, setPointUse] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // 📌 장바구니 — 로컬에 보관해 새로고침해도 유지 ([{ itemId, qty }])
  const [cart, setCart] = useState<{ itemId: string; qty: number; days?: number }[]>([]);
  const [cartToast, setCartToast] = useState("");

  // 스토어 줄 — 모바일 검색 시트
  //  (알림·프로필은 전역 상단 바가 가져갔다 · 필터 시트는 ShopFilterBar 가 들고 있다)
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  // 모바일 "카테고리 ▾" 칩 패널 — 바깥을 누르거나 Esc 면 닫힌다
  const [catOpen, setCatOpen] = useState(false);
  const catBtnRef = useRef<HTMLButtonElement>(null);
  const catPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (catBtnRef.current?.contains(t) || catPanelRef.current?.contains(t)) return;
      setCatOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setCatOpen(false);
      catBtnRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [catOpen]);

  // 저장된 장바구니를 먼저 읽고, 그 뒤부터만 저장한다 (첫 렌더에 빈 배열로 덮어쓰지 않게)
  //    📌 2026-10-04 계정마다(./shopStore) — 세션을 다 읽은 뒤 그 계정 것을 읽는다. 로그인 전은 빈 장바구니(배지 0) · 저장 안 함.
  //       읽은 계정(shopOwner)과 지금 계정이 같을 때만 저장한다 — 계정이 바뀌는 순간 옛 목록을 새 계정 키에 쓰지 않게
  const { uid: shopUid, ready: shopReady } = useShopUid();
  const [shopOwner, setShopOwner] = useState<string | null>(null);
  const [wish, setWish] = useState<string[]>([]);
  const cartLoaded = shopOwner !== null;
  useEffect(() => {
    if (!shopReady) return;
    setCart(readShopList(CART_KEY, shopUid));
    setWish(readShopList<string>(WISH_KEY, shopUid));
    setShopOwner(shopUid);
  }, [shopUid, shopReady]);
  useEffect(() => {
    if (shopOwner === null || shopOwner !== shopUid) return;
    writeShopList(CART_KEY, shopUid, cart);
  }, [cart, shopOwner, shopUid]);
  // 📌 상품 카드의 장바구니 단추(./cardCart)가 담고 빼면 다시 읽는다 — 머리 · 아래 칸 장바구니 수가 바로 맞게(다른 탭도 같은 이벤트).
  //    다시 읽은 목록을 위 저장이 한 번 더 쓰지만 같은 값이라 알림은 다시 안 난다(돌지 않는다)
  useEffect(() => (shopReady ? onCartChange(shopUid, () => setCart(readShopList(CART_KEY, shopUid))) : undefined), [shopUid, shopReady]);

  // 📌 상품은 1인 1개 — 이미 구매한 상품은 다시 담거나 살 수 없다 (만료 · 환불 건은 보유가 아니다 — owned.ts)
  const ownedItemIds = useMemo(
    () => ownedIdsOf(orders, items),
    [orders, items]
  );

  // 📌 기간제 상품에서 고른 기간 (상품별). 안 고르면 카드에 걸린 기간(기본 무제한 · 필터를 켰으면 그에 맞는 기간)이 기본.
  const [pickDays, setPickDays] = useState<Record<string, number>>({});
  const daysFor = (item: any) => (isTimed(item) ? (pickDays[item._id] ?? item._pick?.days ?? cardPick(item)?.days ?? durationOptions(item)[0]?.days ?? 0) : 0);

  const addToCart = (item: any) => {
    if (!isLoggedIn) return openLogin({ context: LOGIN_CTX.arcticBuy });
    // 📌 세트(lib/bundle.js)는 바로 구매만 — 장바구니 결제(api/shop/checkout)가 받지 않는다
    if (isBundle(item)) {
      setCartToast("세트는 바로 구매만 할 수 있습니다");
      setTimeout(() => setCartToast(""), 1800);
      return;
    }
    if (ownedItemIds.has(item._id)) {
      setCartToast("이미 구매하신 상품입니다");
      setTimeout(() => setCartToast(""), 1800);
      return;
    }
    // 이미 담겨 있으면 다시 눌러 뺀다 (상품은 1인 1개라 수량 개념이 없다)
    if (cart.some((c) => c.itemId === item._id)) {
      setCart((prev) => prev.filter((c) => c.itemId !== item._id));
      setCartToast(`${itemShortName(item)} 상품을 장바구니에서 삭제했습니다`);
      setTimeout(() => setCartToast(""), 1800);
      return;
    }
    const days = daysFor(item);
    setCart((prev) => [...prev, { itemId: item._id, qty: 1, days }]);
    setCartToast(`${itemShortName(item)}${days > 0 ? ` (${durationLabel(days)})` : ""} 상품을 장바구니에 담았습니다`);
    setTimeout(() => setCartToast(""), 1800);
  };

  const setQty = (itemId: string, qty: number) =>
    setCart((prev) => (qty <= 0 ? prev.filter((c) => c.itemId !== itemId) : prev.map((c) => (c.itemId === itemId ? { ...c, qty } : c))));
  const removeFromCart = (itemId: string) => setCart((prev) => prev.filter((c) => c.itemId !== itemId));

  // 장바구니 줄 = 저장된 수량 + 최신 상품 정보
  const cartRows = useMemo(
    () => cart.map((c) => ({ ...c, item: items.find((i) => i._id === c.itemId) })).filter((r) => r.item && !isBundle(r.item)),
    [cart, items]
  );
  const cartCount = cartRows.reduce((n, r) => n + r.qty, 0);

  // 📌 찜 — 로컬에 보관 (상품 id 목록 — state 는 위 장바구니 옆에 둔다, 같이 읽는다)
  const [wishOnly, setWishOnly] = useState(false);
  const [invOpen, setInvOpen] = useState(false); // 인벤토리 팝업 — 옛 주소 /arctic/inventory 는 ?panel=bag 로 여기서 연다

  // 하위 페이지 하단바에서 찜·검색을 누르면 ?panel= 로 넘어온다
  const searchParams = useSearchParams();
  const router = useRouter();
  const origin = useArcticOrigin(); // 들어온 곳 — 모바일 유형 줄 맨 앞 "‹ 메인 · ‹ 레벨 …"
  useEffect(() => {
    const panel = searchParams.get("panel");
    // 찜한 상품은 따로 페이지가 됐다 — 옛 주소(?panel=wish)는 그리로 보낸다
    if (panel === "wish") router.replace("/arctic/wish");
    if (panel === "search") setShowMobileSearch(true);
    if (panel === "bag" && status !== "loading") {
      if (isLoggedIn) setInvOpen(true);
      else openLogin();
      // 레벨의 ?bag=1 과 같이 — 남겨 두면 뒤로가기 · 새로고침 때 팝업이 제멋대로 다시 열린다
      const u = new URL(window.location.href);
      u.searchParams.delete("panel");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
    // 상품 상세 · 장바구니 위 상점 줄(ArcticStoreBar)에서 유형 · 검색어를 들고 온다
    //    테마 탭(?type=<테마 키>)은 모양만 보고 연다 — 테마 목록 · 상품을 받은 뒤 없는 탭이면 전체로(아래 themeTabs)
    const type = searchParams.get("type");
    if (type && (TYPE_VALUES.has(type) || isThemeKey(type))) goProducts(type);
    const q = searchParams.get("q");
    if (q) submitSearch(q);
  }, [searchParams, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // 찜도 장바구니와 같이 계정마다 — 읽기는 위 장바구니 effect 가 함께 한다
  useEffect(() => {
    if (shopOwner === null || shopOwner !== shopUid) return;
    writeShopList(WISH_KEY, shopUid, wish);
  }, [wish, shopOwner, shopUid]);


  const toggleWish = (item: any) => {
    // 📌 2026-10-04 로그인 전에는 상품을 보기만 — 찜 · 담기 · 구매는 로그인 창(ARCTIC · 구매)
    if (!isLoggedIn) return openLogin({ context: LOGIN_CTX.arcticBuy });
    setWish((prev) => (prev.includes(item._id) ? prev.filter((x) => x !== item._id) : [...prev, item._id]));
    setCartToast(wish.includes(item._id) ? `${itemShortName(item)} 상품의 찜을 해제했습니다` : `${itemShortName(item)} 상품을 찜했습니다`);
    setTimeout(() => setCartToast(""), 1600);
  };

  // 📌 상단 이미지 배너 — 관리자가 노출 위치(홈 · 시즌 탭)를 골라 등록, 한 장에 7초씩 자동 전환.
  //    위치마다 한 벌씩 여기서 들고 있다(목록 · 지금 장 · 틀 비율 · 불러오기 · 자동 넘김은 BannerSlider 의 useBanners)
  const homeBanner = useBanners("home", status, isAdmin);
  // 📌 시즌 탭 첫 화면 — 맨 위 시즌 배너 · 시즌 머리줄. 검색 중이면 결과가 먼저라 뺀다
  const seasonTop = showing === "products" && typeFilter === "season" && !submitted.trim();
  // 시즌 배너는 처음부터 같이 받아 둔다(탭을 열 때 늦게 떠 아래가 밀리지 않게). 넘김은 시즌 탭이 보일 때만
  const seasonBanner = useBanners("season", status, isAdmin, seasonTop);
  // ── 이벤트 테마 탭 ──
  //    관리자는 꺼진 테마까지(인라인 상품 폼 고르기 칸) — 탭은 켜진 것만. 못 받으면 지난 목록.
  //    📌 처음(지난 목록 없음)은 기본 목록(설정이 없을 때와 같은 할로윈 하나 — 관리 화면과 같다) — 받기 전 할로윈 탭 · 검색 · 폼 고르기 칸이 예전처럼 바로 서게(늦게 붙어 카테고리가 밀리지 않게)
  const [themes, setThemes] = useState<ShopTheme[]>(() => themeCache ?? DEFAULT_THEMES.map((t) => ({ ...t })));
  // 이번에 받았는가 — 지난 목록(themeCache)으로 그리는 동안엔 없는 탭이라고 전체로 돌리지 않는다(그 사이 새로 켠 테마일 수 있다)
  const [themesReady, setThemesReady] = useState(false);
  useEffect(() => {
    if (status === "loading") return;
    let live = true;
    fetch(`/api/shop/themes${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!live || !d?.success || !Array.isArray(d.data)) return;
        themeCache = d.data;
        setThemes(d.data);
      })
      .catch(() => {})
      .finally(() => { if (live) setThemesReady(true); });
    return () => { live = false; };
  }, [status, isAdmin]);
  // 켜진 테마(차례대로 · 최대 2개 — lib/shopThemes THEME_ON_MAX) — 배너 자리 두 벌이 이 차례를 따른다
  const onList = useMemo(() => onThemes(themes), [themes]);
  // 그 테마 탭이 보이는가 — 손님은 그 테마 상품이 하나라도 있을 때(관리자는 숨김 상품까지 — 목록에 실린 상품 기준), 관리자는 비어 있어도
  const themeShown = useCallback((key: string) => isAdmin || items.some((it) => it.theme === key), [isAdmin, items]);
  const themeTabs = useMemo(() => onList.filter((t) => themeShown(t.key)).map((t) => ({ v: t.key, l: t.name })), [onList, themeShown]);
  // 📌 없는 테마 탭(지운 · 꺼진 · 상품 없는 테마 — ?type= 로 들어왔거나 보던 중 바뀜)이면 전체로. 테마 목록 · 상품을 다 받은 뒤에만
  const isThemeTab = !TYPE_VALUES.has(typeFilter);
  if (isThemeTab && themesReady && !isLoading && !themeTabs.some((t) => t.v === typeFilter)) setTypeFilter("all");
  // 📌 테마 탭 첫 화면 — 맨 위 그 테마 배너(노출 위치 = 테마 키 · 시즌 탭과 같은 자리 · 같은 한 벌). 켜진 테마는 둘까지라 두 벌을 처음부터 받아 둔다
  //    (탭을 열 때 늦게 떠 아래가 밀리지 않게). 탭이 숨어 있으면 부르지 않는다. 넘김은 그 탭이 보일 때만
  const themeTop = isThemeTab && showing === "products" && !submitted.trim();
  const slot0 = onList[0]?.key || "";
  const slot1 = onList[1]?.key || "";
  const themeBanner0 = useBanners(slot0, slot0 && themeShown(slot0) ? status : "loading", isAdmin, themeTop && typeFilter === slot0, slot0 === BUILTIN_BANNER_THEME ? withHwDefaults : undefined);
  const themeBanner1 = useBanners(slot1, slot1 && themeShown(slot1) ? status : "loading", isAdmin, themeTop && typeFilter === slot1, slot1 === BUILTIN_BANNER_THEME ? withHwDefaults : undefined);
  const themeBanner = !themeTop ? null : typeFilter === slot0 ? themeBanner0 : typeFilter === slot1 ? themeBanner1 : null;
  // 할로윈만 — 켜진 배너가 없으면 기본 배너 두 장(useBanners withDefaults — 자동 넘김도 두 장을 센다)
  const themeBannerList = themeBanner?.banners || [];

  // 📌 2026-10-17 상점 안 상품 인라인 편집 폼을 걷었다 — 상품을 고치는 곳은 관리 › 상점 관리 하나(카드 「관리에서 수정」 → /admin/shop?edit=<id>, 「상품 추가」 → 새 상품 폼).
  //    규칙(app/arctic/productForm)도 그 한 곳에서만 지킨다
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
      // 서버(lib/shopAccess)와 같은 조건 — ARCTIC 은 SYSTEM : LEVEL 안에 있어 레벨도 공개여야 열린다
      .then((d) => setShopPublic(!!d?.data?.shopPublic && !!d?.data?.levelPublic))
      .catch(() => setShopPublic(false));
  }, []);

  // 📌 장바구니 정리 기준 — 상품 목록을 제대로 받아 왔을 때의 id 들. 받기 전·실패(403·네트워크)면 null
  const [cartValidIds, setCartValidIds] = useState<Set<string> | null>(null);

  // 세션 확정 후 조회 — 공개 전에는 관리자 세션이 있어야 200이 온다
  const [itemsReload, setItemsReload] = useState(0);
  // 관리자는 숨김 상품까지 함께 본다 (카드에 '숨김' 배지 표시)
  useEffect(() => {
    if (status === "loading") return;
    fetch(`/api/shop/items${isAdmin ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : [];
        setItems(list);
        // 📌 유저 화면으로 보는 중이면 유저와 같은 목록이라 정리도 유저처럼 돈다(숨김 · 판매 종료 상품이 빠지고 토스트 한 번)
        //    📌 세트(lib/bundle.js)는 장바구니에 둘 수 없다 — 기준에서 빼 두면 아래 정리가 담겨 있던 세트를 뺀다
        if (d?.success && Array.isArray(d?.data)) setCartValidIds(new Set(list.filter((i: { type?: string }) => !isBundle(i)).map((i: { _id: string }) => String(i._id))));
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [status, isAdmin, itemsReload]);

  // 📌 목록에 없는(삭제·숨김) 상품 · 같은 상품 중복은 장바구니에서 뺀다 — 안 그러면 개수 배지에 유령 "1" 이 남는다.
  //    목록을 제대로 받았을 때만 정리한다 (실패로 장바구니를 날리지 않게). 저장은 위 저장 effect 가 한다.
  useEffect(() => {
    if (!cartLoaded || !cartValidIds) return;
    setCart((prev) => {
      const seen = new Set<string>();
      const next = prev.filter((c) => {
        if (!c || !cartValidIds.has(String(c.itemId)) || seen.has(String(c.itemId))) return false;
        seen.add(String(c.itemId));
        return true;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [cartLoaded, cartValidIds]);
  // 📌 판매가 끝났거나 목록에서 빠진 상품을 위 정리가 뺐으면 한 번 알린다(불러올 때 한 번 · 뺀 것이 있을 때만 — 장바구니 페이지와 같은 문구).
  //    정리 전 장바구니(이 그림의 cart)에서 목록에 없는 상품 수 — 중복 줄 · 담을 수 없는 세트(목록엔 있다)는 세지 않는다
  const goneNoted = useRef(false);
  useEffect(() => {
    if (!cartLoaded || !cartValidIds || goneNoted.current) return;
    goneNoted.current = true;
    const listed = new Set(items.map((i) => String(i._id)));
    const gone = new Set(cart.filter((c) => c && !listed.has(String(c.itemId))).map((c) => String(c.itemId))).size;
    if (!gone) return;
    setCartToast(`판매가 끝난 상품 ${gone}개를 뺐습니다`);
    setTimeout(() => setCartToast(""), 1800);
  }, [cartLoaded, cartValidIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMine(); }, [loadMine]);

  // 📌 지금 탭(유형) · 검색 · 찜에 걸린 상품 — 가격 구간은 이 목록의 가격 분포로 만든다.
  //    재고 · 구매 가능 토글은 여기 넣지 않는다(토글을 켤 때마다 구간이 바뀌면 고른 구간이 풀리고 칩 목록이 출렁인다)
  const scoped = useMemo(() => {
    const q = submitted.trim().toLowerCase();
    return items.filter((it) => {
      // 유형 탭이 아닌 값은 이벤트 테마 키 — 그 테마 상품만(지운 테마 키를 가리키는 상품은 어느 테마 탭에도 없다)
      if (typeFilter !== "all" && (typeFilter === "timed" ? !isTimed(it) : typeFilter === "season" ? !isPointOnly(it) : TYPE_VALUES.has(typeFilter) ? it.type !== typeFilter : it.theme !== typeFilter)) return false;
      if (wishOnly && !wish.includes(it._id)) return false;
      // 세트는 "세트"와 구성 아이템 이름 · 분류로도 찾는다
      const setText = isBundle(it) ? (Array.isArray(it.bundleItems) ? it.bundleItems.map((c: { name?: string; categoryLabel?: string }) => ` ${c?.name || ""} ${c?.categoryLabel || ""}`).join("") : "") : "";
      // 테마 상품은 테마 이름으로도 찾는다(받은 목록에 있는 테마만 — 손님은 켜진 테마)
      const themeName = themeNameOf(themes, it.theme);
      // 📌 분류(categoryLabelOf — 「카드 테두리」 · 직접 정한 분류)로도 찾는다(2026-10-17). 유형 이름(「꾸미기」 …)도 그대로
      if (q && !`${it.name} ${it.description} ${it.roleName || ""} ${typeLabelOf(it.type)} ${categoryLabelOf(it)}${isTimed(it) ? " 기간제" : ""}${isPointOnly(it) ? " 빙옥 시즌" : ""}${themeName ? ` ${themeName}` : ""}${setText}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, typeFilter, wishOnly, wish, submitted, themes]);
  const buckets = useMemo(() => priceBuckets(scoped), [scoped]);
  // 고른 구간 — 탭 · 검색이 바뀌어 지금 구간 목록에 없으면 풀린다.
  //    effect 를 기다리지 않고 그리는 중에 바로 '전체'로 되돌린다(React 의 '이전 값에 맞춰 상태 고치기' 방식) —
  //    한 번이라도 맞지 않는 구간이 걸린 채 그려지지 않고, 다른 탭에 갔다 돌아와도 옛 구간이 되살아나지 않는다
  const priceBucket = buckets.find((b) => b.v === priceFilter) || null;
  if (priceFilter !== "all" && !priceBucket) setPriceFilter("all");

  const visible = useMemo(() => {
    // 📌 카드 가격은 기본 무제한. 가격 필터 · "살 수 있는 것만" 을 켜면 그 조건을 통과하는 기간(무제한 > 가장 긴 기간)의 값을 건다 —
    //    필터 · 정렬 · 카드 표기가 모두 그 값(_pick)을 본다. 조건을 통과하는 기간이 하나도 없으면 목록에서 빠진다
    // 빙옥도 함께 낼 수 있으니 XP + 빙옥 × 10,000 까지 산다 — 빙옥 전용 상품은 빙옥만 (affordFor)
    //    가격 구간은 단위별(XP 구간엔 일반 상품, 빙옥 구간엔 빙옥 전용 상품) · 카드에 적힌 값 기준 (inBucket)
    const filtered = scoped.flatMap((it) => {
      const afford = affordableOnly && myXp != null ? affordFor(it, myXp, myPoint ?? 0) : null;
      const priceOk = !priceBucket && !afford ? undefined : (p: number) => (!priceBucket || inBucket(priceBucket, it, p)) && (!afford || afford(p));
      // 📌 세트는 이 사람이 낼 값(가진 구성만큼 깎은 값 — owned.ts bundlePickOf)으로 거르고 · 줄 세우고 · 카드에 건다
      const pick = isBundle(it) ? bundlePickOf(orders, it, items, priceOk) : cardPick(it, priceOk);
      if (!pick) return [];
      if (inStockOnly && it.stock === 0) return [];
      return [{ ...it, _pick: pick }];
    });

    const sorted = [...filtered];
    if (sort === "priceAsc") sorted.sort((a, b) => a._pick.price - b._pick.price);
    else if (sort === "priceDesc") sorted.sort((a, b) => b._pick.price - a._pick.price);
    else if (sort === "newest") sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sort === "popular") sorted.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    else sorted.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return sorted;
  }, [scoped, priceBucket, inStockOnly, affordableOnly, sort, myXp, myPoint, orders, items]);

  // 📌 시즌 탭 두 갈래 큐레이션 — 기본 상태(필터 · 정렬을 안 건)에서만. 무엇이든 걸면 지금처럼 격자 결과만.
  //    시즌 상품이 적으면 null → 바로 격자 (ArcticSeason)
  const seasonPlain = seasonTop && !priceBucket && !inStockOnly && !affordableOnly && !wishOnly && sort === "recommended";
  const seasonCur = useMemo(() => (seasonPlain ? seasonPicks(visible) : null), [seasonPlain, visible]);

  // 📌 이미 장바구니에 있는 상품을 '구매'로 누르면, 낱개 구매인지
  //    장바구니와 함께 결제할지 먼저 물어본다 (모르고 따로 사는 걸 막는다)
  const [cartConflict, setCartConflict] = useState<any>(null);

  const startBuy = (item: any) => {
    setContact("");
    setResult(null);
    setPointUse(0);
    setBuyTarget(item);
  };

  // 바로 구매 창의 금액 — 총액(XP) · 쓸 수 있는 빙옥 최대 · 실제로 쓸 빙옥 · 결제 XP (서버와 같은 lib/shopPay planPayment)
  //    빙옥 전용 상품은 빙옥 칸이 없다 — 판매가 전부를 빙옥으로(buyPointAll)
  const buyTotal = buyTarget ? salePrice(buyTarget, buyTarget._days) : 0;
  const buyPO = isPointOnly(buyTarget);
  const buyPlan = planPayment({ lines: [{ price: buyTotal, pointOnly: buyPO }], pointUse, pointBalance: myPoint ?? 0 });
  const buyMaxPoint = buyPlan.maxPoint;
  const buyPoint = buyPlan.pointUse;
  const buyXp = buyPlan.chargedXp;
  const buyPointAll = buyPlan.point;
  const buyEnough = myXp != null && myXp >= buyXp && buyPointAll <= (myPoint ?? 0);

  const openBuy = (item: any) => {
    if (!isLoggedIn) return openLogin({ context: LOGIN_CTX.arcticBuy });
    // 📌 세트는 이 창이 아니라 상품 상세 → 결제 화면에서(가진 구성만큼 깎은 값 · 구성 표시)
    if (isBundle(item)) return router.push(`/arctic/item/${item._id}`);
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
        body: JSON.stringify({ itemId: buyTarget._id, contact, days: buyTarget._days || 0, pointUse: buyPoint, expectedPrice: buyTotal, expectedPointOnly: buyPO }),
      });
      const d = await res.json();
      setResult({ ok: !!d.success, message: d.message || (d.success ? "구매가 완료되었습니다." : "구매에 실패했습니다.") });
      // 보는 사이 가격이 바뀌었으면 상품을 다시 읽어 새 값을 보여 준다
      if (d.code === "PRICE_CHANGED") setItemsReload((k) => k + 1);
      if (d.success) {
        // 결제 뒤 잔액 — remain { xp, point } (옛 응답의 remainXp · remainPoint 도 받는다)
        const remain = d.data?.remain ?? d.remain;
        const rx = typeof remain?.xp === "number" ? remain.xp : d.data?.remainXp;
        const rp = typeof remain?.point === "number" ? remain.point : d.data?.remainPoint;
        if (typeof rx === "number") setMyXp(rx);
        if (typeof rp === "number") setMyPoint(rp);
        setPointUse(0);
        setItems((prev) => prev.map((it) => (it._id === buyTarget._id ? { ...it, stock: it.stock > 0 ? it.stock - 1 : it.stock, soldCount: (it.soldCount || 0) + 1 } : it)));
        loadMine();
      }
    } catch {
      setResult({ ok: false, message: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsBuying(false);
    }
  };

  // 추천 단어 — 지금 있는 상품의 이름(짧은 이름) · 역할 이름 · 유형 · 분류에서 뽑는다
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    const out: string[] = [];
    const push = (v?: string) => { const t = (v || "").trim(); if (t && t.toLowerCase().includes(q) && !out.includes(t)) out.push(t); };
    for (const t of TYPES) if (t.v !== "all") push(t.l);
    for (const t of themeTabs) push(t.l);
    for (const it of items) { push(itemShortName(it)); push(it.roleName); push(categoryLabelOf(it)); }
    return out.slice(0, 7);
  }, [items, query, themeTabs]);

  // 검색창 아래 패널 — 입력 중이면 추천 단어, 비어 있으면 최근 검색어
  //    📌 floating — PC 상단 검색칸 아래에 뜨는 카드(absolute · 테두리 · 그림자, 줄 여백 px-4).
  //       아니면 모바일 검색 시트 안 · 검색칸 바로 아래에 붙는 목록(2026-10-11 운영자 "모바일 이거 좀 수정해" — 떠 있는 카드가 흰 시트 밖으로 반쯤 삐져나왔다, 줄 여백 px-1).
  //       한 벌을 같이 쓰다 PC 도 카드 없이 펼쳐져 상단 줄이 깨졌다(운영자 "pc 검색창 버그") — 자리마다 모양을 고른다
  const searchPanelOf = (floating: boolean) => {
    const px = floating ? "px-4" : "px-1";
    return (
    <div className={floating ? "absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl border border-[#ededed] bg-white shadow-[0_24px_48px_-24px_rgba(0,0,0,0.22)] overflow-hidden" : "overflow-hidden"}>
      {query.trim() ? (
        suggestions.length > 0 ? (
          <div className="py-2">
            {suggestions.map((sg) => (
              <button key={sg} onMouseDown={(e) => { e.preventDefault(); submitSearch(sg); }}
                className={`w-full text-left ${px} py-2.5 text-[14px] font-bold text-[#131313] hover:bg-black/[0.03] transition-colors truncate`}>
                {sg}
              </button>
            ))}
          </div>
        ) : (
          <div className={`${px} py-4 text-[13px] text-[#a3a3a3]`}>추천할 단어가 없습니다.</div>
        )
      ) : recentOn ? (
        <>
          <div className={`flex items-center justify-between gap-3 ${px} pt-3 pb-1.5`}>
            <span className="text-[12px] font-black text-[#131313]">최근 검색어</span>
            <span className="flex items-center gap-3">
              {recents.length > 0 && (
                <button onMouseDown={(e) => { e.preventDefault(); setRecents([]); }}
                  className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">전체 삭제</button>
              )}
              <button onMouseDown={(e) => { e.preventDefault(); toggleRecent(); }}
                className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">저장 끄기</button>
            </span>
          </div>
          {recents.length === 0 ? (
            <div className={`${px} pb-4 pt-1 text-[13px] text-[#a3a3a3]`}>최근 검색어가 없습니다.</div>
          ) : (
            <div className="pb-2">
              {recents.map((r) => (
                <div key={r} className={`group/rc flex items-center gap-2 ${px} py-2 hover:bg-black/[0.03] transition-colors`}>
                  <button onMouseDown={(e) => { e.preventDefault(); submitSearch(r); }}
                    className="flex-1 min-w-0 text-left text-[14px] font-bold text-[#5a5a5a] hover:text-[#131313] truncate transition-colors">{r}</button>
                  <button onMouseDown={(e) => { e.preventDefault(); setRecents((prev) => prev.filter((x) => x !== r)); }}
                    aria-label={`${r} 삭제`} className="shrink-0 p-1 text-[#a3a3a3] hover:text-[#131313] transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={`flex items-center justify-between gap-3 ${px} py-3.5`}>
          <span className="text-[13px] text-[#8a8a8a]">최근 검색어 저장이 꺼져 있습니다.</span>
          <button onMouseDown={(e) => { e.preventDefault(); toggleRecent(); }}
            className="shrink-0 text-[11px] font-bold text-[#e91e3f] hover:text-[#d01634] transition-colors">켜기</button>
        </div>
      )}
    </div>
    );
  };

  // 공개 전 · 비관리자 → 준비 중 안내
  if (status === "loading" || shopPublic === null) {
    return <div className={`w-full flex-1 bg-white ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center text-sm text-[#8a8a8a]`}>불러오는 중...</div>;
  }
  // 📌 공개 전 상점은 관리자로 보는 중일 때만 연다 — 유저 화면이면 유저처럼 준비 중 화면(서버 getShopAccess 도 같은 판정)
  if (!shopPublic && !isAdmin) {
    return (
      <div className={`w-full flex-1 bg-white text-[#131313] ${embedded ? "py-24" : "min-h-screen"} flex items-center justify-center px-6`}>
        {/* break-keep을 주지 않으면 한국어가 단어 중간에서 잘려 내려간다 */}
        <div className="text-center max-w-md break-keep">
          <h1 className="text-3xl font-black tracking-tighter mb-3">ARCTIC 준비 중</h1>
          {/* 오픈 시점은 화면에 없는 정보라 이 한 줄만 남긴다 */}
          <p className="text-sm text-[#5a5a5a] leading-relaxed mb-8">오픈 소식은 공지사항으로 안내드릴게요.</p>
          <Link href="/level" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">
            SYSTEM : LEVEL 보러가기
          </Link>
        </div>
      </div>
    );
  }


  // 📌 상품 하나 — 모양은 ProductCard 한 벌(상점 · 홈 · 찜 · 상세의 다른 상품이 같이 쓴다).
  //    카드에 걸린 기간은 it._pick(목록 필터가 정한 것, 없으면 기본 무제한)
  const renderCard = (it: any) => {
    // 필터로 기본(무제한)과 다른 기간을 걸었으면 상세도 그 기간으로 열리게
    const href = `/arctic/item/${it._id}${isTimed(it) && it._pick && it._pick.days != null && it._pick.days !== cardPick(it)?.days ? `?days=${it._pick.days}` : ""}`;
    return (
      <ProductCard key={it._id} it={it} href={href} pick={isBundle(it) ? bundlePickOf(orders, it, items) : it._pick} wished={wish.includes(it._id)} onWish={() => toggleWish(it)}
        overlay={isAdmin && (!it.active || saleEnded(it)) ? (
          // 📌 판매 종료(lib/saleWindow) — 관리자 목록(?all=1)에만 실린다. 숨김과 같은 자리 · 같은 모양(숨김이 먼저)
          <span className="absolute top-2 left-2 @min-[180px]:top-2.5 @min-[180px]:left-2.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">{!it.active ? "숨김" : "판매 종료"}</span>
        ) : null}>
        {isAdmin && (
          <div className="mt-2 flex gap-2 text-[11px] font-bold">
            {/* 📌 상품 편집은 관리 화면 하나(2026-10-17 — 상점 안 인라인 폼을 걷었다). 그 상품의 편집기가 열린다 */}
            <Link href={`/admin/shop?edit=${it._id}`} className="text-[#8a8a8a] hover:text-[#131313] transition-colors">관리에서 수정</Link>
            <button onClick={() => setDeleteTarget(it)} className="text-[#e91e3f] hover:text-[#d01634] transition-colors">삭제</button>
          </div>
        )}
      </ProductCard>
    );
  };

  // ── 스토어 줄 부품 (PC 두 줄 · 모바일 한 줄이 같이 쓴다) ──
  const tabOn = (v: string) => (v === "home" ? showing === "home" : showing === "products" && typeFilter === v);
  const pickTab = (v: string) => {
    if (v === "home") { setView("home"); clearSearch(); window.scrollTo({ top: 0, behavior: "smooth" }); }
    else goProducts(v);
  };
  // 유형 탭 — 고른 것만 빨간 밑줄. 고르든 말든 굵기 · 크기 · 여백이 같다(탭 줄이 안 움직이게)
  const tabButton = (t: { v: string; l: string }) => {
    const on = tabOn(t.v);
    return (
      <button key={t.v} onClick={() => pickTab(t.v)}
        className={`relative shrink-0 h-full flex items-center text-[14px] md:text-[15px] font-extrabold transition-colors ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
        {t.l}
        {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
      </button>
    );
  };
  // 모바일 카테고리 단추에 걸 이름 — 패널 쪽 유형을 보고 있을 때만
  const catType = PANEL_TYPES.find((t) => tabOn(t.v));
  // 이벤트 테마 탭(themeTabs — 위 「이벤트 테마 탭」)은 시즌 바로 뒤에 테마 차례로 선다(PC · 모바일 같다)
  // 인벤토리 — 산 것 · 받은 것을 그 자리에서 팝업으로. PC 도구 칸 · 모바일 줄 끝 두 곳에 건다 (하단바 다섯 칸은 찼다)
  const invButton = (
    <button type="button" onClick={() => setInvOpen(true)} aria-label="인벤토리" title="인벤토리"
      className="relative flex items-center justify-center w-9 h-9 rounded-full transition-colors text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.bag} />
      </svg>
    </button>
  );
  // 📌 PC 첫 줄 좌우 칸의 최소 폭 = 오른쪽 도구 폭. 아이콘 3개(36) + 사이 8 = 124, xl 는 재화 188 + 선(좌우 12 · 1) 을 더해 337.
  //    좌우가 같은 최소 폭이라 검색창이 정가운데에 남는다 (도구 모양을 바꾸면 이 값도 같이)
  //    재화는 xl 부터 — lg(1024~) 에 두면 좌우 337 씩 빠져 검색창이 300px 로 줄었다
  const storeSide = isLoggedIn ? "min-w-[124px] xl:min-w-[337px]" : "";

  return (
    <div className={`w-full flex-1 bg-white text-[#131313] ${embedded ? "" : "min-h-screen"}`}>
      {/* ── 스토어 줄 — ARCTIC 표기와 브랜드 · 쿠폰함 · 알림 · 프로필은 전역 상단 바가 갖고 있다.
             PC(md~) 두 줄: ① 가운데 검색 · 오른쪽 재화 · 인벤토리 · 찜 · 장바구니 ② 가운데 유형 탭.
             모바일 한 줄: 돌아갈 길 · 홈 · 전체 · 시즌 | 카테고리 ▾ (나머지 유형은 칩 패널). 검색은 독에서 연다. ── */}
      <div className="relative w-full bg-white border-b border-[#ededed]">
        {/* ① PC — 검색 · 재화 · 도구
             📌 좌우 칸은 flex-1 basis-0 에 같은 최소 폭(오른쪽 도구가 차지하는 폭)을 준다 → 검색창은 늘 정가운데.
                검색창은 560px 에서 시작해 좌우 최소 폭이 모자랄 때만 줄어든다. 재화 칸이 폭 고정이라 자릿수가 바뀌어도 안 움직인다 */}
        <div className="hidden md:flex max-w-7xl mx-auto px-6 h-[60px] items-center">
          <div aria-hidden className={`flex-1 basis-0 ${storeSide}`} />

          <div className="relative basis-[560px] min-w-0">
            <div className="relative h-10 rounded-full border-2 border-[#131313] bg-white overflow-hidden">
              <input type="text" value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
                onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); if (e.key === "Escape") setSearchOpen(false); }}
                placeholder="상품, 유형, 역할 검색"
                className="absolute inset-0 w-full h-full bg-transparent pl-4 pr-10 text-[13px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
              {query ? (
                <button onClick={clearSearch} aria-label="검색어 지우기"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#a3a3a3] hover:text-[#131313] transition-colors outline-none">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                </button>
              ) : (
                <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-[#131313] pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.search} />
                </svg>
              )}
            </div>
            {searchOpen && searchPanelOf(true)}
          </div>

          <div className={`flex-1 basis-0 ${storeSide} flex items-center justify-end`}>
            {isLoggedIn && (
              <>
                {/* 소지 — 보는 값이라 조용하게. 도구와는 가는 선으로 나눈다.
                    📌 폭 고정 · 오른쪽 정렬 — 자릿수가 늘어도 칸이 그대로다(메모: tabs-never-move). 1억 XP · 10만 빙옥까지 한 칸에 든다 */}
                <span className="hidden xl:inline-flex w-[188px] shrink-0 justify-end items-baseline gap-3 text-[12px] font-bold text-[#5a5a5a] tabular-nums whitespace-nowrap overflow-hidden">
                  <span>{(myXp ?? 0).toLocaleString()}<span className="ml-[3px] text-[9.5px] text-[#a3a3a3]">XP</span></span>
                  <span>{(myPoint ?? 0).toLocaleString()}<span className="ml-[3px] text-[9.5px] text-[#a3a3a3]">빙옥</span></span>
                </span>
                <span className="hidden xl:block shrink-0 w-px h-4 mx-3 bg-[#e0e0e0]" />

                <div className="flex items-center gap-2 shrink-0">
                  {invButton}

                  {/* 찜 · 장바구니 — 같은 모양: 테두리 아이콘 + 빨간 개수 점. 개수가 바뀌면 점이 한 번 튄다 */}
                  <Link href="/arctic/wish" aria-label={`찜한 상품 보기${wish.length ? ` (${wish.length})` : ""}`}
                    className="relative flex items-center justify-center w-9 h-9 rounded-full transition-colors text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
                    </svg>
                    {wish.length > 0 && (
                      <span key={wish.length} className="count-pop absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{wish.length}</span>
                    )}
                  </Link>

                  <Link href="/arctic/cart" aria-label={`장바구니${cartCount ? ` (${cartCount})` : ""}`}
                    className="relative flex items-center justify-center w-9 h-9 rounded-full text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors">
                    <span>
                      <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                      </svg>
                    </span>
                    {cartCount > 0 && (
                      <span key={cartCount} className="count-pop absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{cartCount}</span>
                    )}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ② PC — 유형 탭, 가운데. 고른 것만 빨간 밑줄
             📌 w-max + mx-auto — 들어가면 가운데, 모자라면(768~) 왼쪽부터 가로 스크롤 (justify-center 는 넘칠 때 앞쪽이 잘려 못 간다).
                overflow-y-hidden — 밑줄이 1px 삐져나가 세로로 1px 굴러가며 탭 줄이 들썩이던 것을 막는다 */}
        <div className="hidden md:block max-w-7xl mx-auto px-6">
          <div className="overflow-x-auto overflow-y-hidden no-bar">
            <nav className="w-max mx-auto flex items-center gap-7 h-[46px]">
              {[{ v: "home", l: "홈" }, ...TYPES, ...themeTabs].map((t) => (
                <React.Fragment key={t.v}>
                  {/* 시즌 스토어는 유형 탭과 한 칸 떨어뜨린다 */}
                  {t.v === "season" && <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0]" />}
                  {tabButton(t)}
                </React.Fragment>
              ))}
            </nav>
          </div>
        </div>

        {/* 모바일 — 한 줄 */}
        <div className="md:hidden px-5 h-[56px] flex items-center gap-3">
          {/* 돌아갈 길 · 홈 · 전체 · 시즌 — 카테고리는 늘 보이게 밖에 둔다
               📌 좁은 폰(360 · 로그인 · "명예의 전당" 등 긴 이름)에선 돌아갈 길 이름이 먼저 … 으로 줄어 시즌이 잘리지 않는다. 그래도 넘치면 이 칸만 가로로 민다 */}
          <nav className="flex items-center gap-3 overflow-x-auto overflow-y-hidden no-bar h-full min-w-0">
            {/* 들어온 곳으로 돌아갈 길 (독 · 메뉴 · 레벨 탭 어디서 왔든). 넓은 화면은 상단 바 · 브라우저 뒤로 */}
            {origin && (
              <>
                <Link href={origin.href} className="min-w-0 flex items-center gap-1 text-[13px] font-extrabold text-[#5a5a5a] hover:text-[#131313] transition-colors">
                  <span aria-hidden>‹</span><span className="truncate">{origin.label}</span>
                </Link>
                <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0] -ml-1"></span>
              </>
            )}
            {/* 📌 테마 탭은 시즌 뒤에 붙는다(켜진 테마 둘까지). 320 폭에서 넘치면 이 칸만 가로로 민다 — 카테고리 · 인벤토리는 밖이라 자리가 그대로 */}
            {[...MOBILE_TABS, ...themeTabs].map((t) => tabButton(t))}
          </nav>
          <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0]" />
          {/* 📌 카테고리 — 패널의 유형을 고르면 그 이름 + 밑줄. 폭은 가장 긴 "기프트카드" + ▾ (실측 약 81px) 로 고정 → 이름이 바뀌어도 줄이 안 움직인다.
                 밑줄은 bottom-0 · 1px — 옆 탭은 스크롤 칸이 밑줄 아래 1px 을 잘라 1px 로 보인다, 같은 굵기로 */}
          <button ref={catBtnRef} type="button" onClick={() => setCatOpen((o) => !o)}
            aria-expanded={catOpen} aria-controls="arctic-cat-panel"
            className={`shrink-0 w-[84px] h-full flex items-center whitespace-nowrap text-[14px] font-extrabold transition-colors ${catType || catOpen ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
            <span className="relative h-full flex items-center">
              {catType ? catType.l : "카테고리"}
              {catType && <span className="absolute left-0 right-0 bottom-0 h-px bg-[#e91e3f]" />}
            </span>
            <svg className={`ml-1 w-3 h-3 shrink-0 transition-transform duration-200 ${catOpen ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={2.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {isLoggedIn && <div className="ml-auto shrink-0">{invButton}</div>}
        </div>

        {/* 모바일 — 카테고리 칩 패널. 줄 아래에 겹쳐 띄운다 (유형 줄은 그대로)
             📌 본문을 밀어내면 바깥 탭(pointerdown)에 닫히는 순간 본문이 패널 높이만큼 올라와, 손가락 밑에 들어온 다른 카드가 눌렸다 */}
        {catOpen && (
          <div ref={catPanelRef} id="arctic-cat-panel" className="md:hidden absolute left-0 right-0 top-full z-30 bg-white border-y border-[#ededed] px-5 py-3 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.22)]"
            style={{ animation: "menuDrop 0.22s cubic-bezier(0.16,1,0.3,1)" }}>
            <div className="flex flex-wrap gap-2">
              {PANEL_TYPES.map((t) => {
                const on = tabOn(t.v);
                return (
                  <button key={t.v} type="button" onClick={() => { goProducts(t.v); setCatOpen(false); }}
                    className={`h-8 px-3.5 rounded-full border text-[13px] font-bold transition-colors ${
                      on ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#ededed] text-[#5a5a5a] hover:border-[#a3a3a3]"
                    }`}>
                    {t.l}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {topSlot}

      {/* ── 홈 — 배너 · 유형 타일 · 두 갈래 큐레이션 · 이번 주 (ArcticHome) ── */}
      {showing === "home" && (
        <ArcticHome
          items={items} isLoading={isLoading} isAdmin={isAdmin} isLoggedIn={isLoggedIn}
          myXp={myXp} myPoint={myPoint} myLevel={myLevel} ownedItemIds={ownedItemIds}
          banners={homeBanner.banners} bannersLoaded={homeBanner.loaded} bannerIdx={homeBanner.idx} setBannerIdx={homeBanner.setIdx} bannerRatio={homeBanner.ratio} fitRatio={homeBanner.fitRatio}
          renderCard={renderCard} goProducts={goProducts} openEdit={() => router.push("/admin/shop?tab=products&new=1")}
          adminTools={
            // 📌 「유저 화면」 미리보기 토글은 계정 메뉴 「유저 화면으로 보기」로 옮겼다(사이트 전체 · 새로고침해도 유지)
            !shopPublic && isAdmin ? (
              <Link href="/admin/shop?open=settings" className="text-[12px] font-bold text-[#e91e3f] hover:text-[#d01634] underline underline-offset-4 transition-colors">
                비공개 · 공개로 바꾸기
              </Link>
            ) : null
          }
        />
      )}

      {/* ── 상품 · 검색 · 필터 ── */}
      {showing === "products" && (<>
      {/* 시즌 탭 — 맨 위 시즌 배너(노출 위치 '시즌 탭'). 홈과 같은 한 벌 · 같은 규칙(없으면 이 자리 없음) */}
      {seasonTop && (
        <BannerSlider banners={seasonBanner.banners} bannerIdx={seasonBanner.idx} setBannerIdx={seasonBanner.setIdx}
          bannerRatio={seasonBanner.ratio} fitRatio={seasonBanner.fitRatio} isAdmin={isAdmin} loaded={seasonBanner.loaded} />
      )}
      {/* 테마 탭 — 맨 위 그 테마 배너(노출 위치 = 테마 키). 할로윈만 켜진 배너가 없으면 기본 배너(HW_BANNER), 다른 테마는 없으면 이 자리 없음 */}
      {themeBanner && (
        <BannerSlider banners={themeBannerList} bannerIdx={themeBanner.idx} setBannerIdx={themeBanner.setIdx}
          bannerRatio={themeBanner.ratio} fitRatio={themeBanner.fitRatio} isAdmin={isAdmin} loaded={themeBanner.loaded} />
      )}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
        {/* 시즌 탭 — 시즌 번호 · 이름 · D-day 머리줄. 필터 줄은 그 아래 (큐레이션이 빠져도 필터 줄이 안 움직이게) */}
        {seasonTop && <SeasonHead />}
        {/* 📌 아이콘 상태로 접혀 있다가 호버·포커스·입력 시 펼쳐지는 검색창
               (모바일은 터치라 호버가 없으므로 항상 펼친 상태) */}
        {/* 검색어 표시 (검색은 헤더에서) */}
        {submitted && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[12px] text-[#8a8a8a]">&ldquo;<span className="font-bold text-[#131313]">{submitted}</span>&rdquo; 검색 결과</span>
            <button onClick={clearSearch} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">검색 해제</button>
          </div>
        )}

        {/* 📌 필터 줄 — 일반 탭 · 시즌 탭 같은 한 벌(ShopFilterBar). PC 는 한 줄 칩 바, 폰은 "필터" 버튼 → 아래 시트.
               가격 구간은 지금 탭 상품의 가격으로 만든다(buckets — 시즌 탭은 빙옥 구간, 상품 3개 미만이면 가격 칩 없음) */}
        <ShopFilterBar
          buckets={buckets}
          value={{ price: priceBucket ? priceBucket.v : "all", inStock: inStockOnly, afford: affordableOnly }}
          onChange={(v) => { setPriceFilter(v.price); setInStockOnly(v.inStock); setAffordableOnly(v.afford); }}
          showAfford={isLoggedIn}
          count={visible.length}
          sort={sort}
          sorts={SORTS}
          onSort={setSort}
        />
      </section>

      {/* ── 상품 목록 ── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 pb-32 md:pb-24">
        <div id="shop-list" className="scroll-mt-24"></div>

        {/* 찜만 보기 — 해제 버튼을 눈에 띄게 */}

        {isLoading ? (
          <div className="py-24 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : visible.length === 0 ? (
          <div className="py-24 text-center break-keep">
            <p className="text-sm font-bold text-[#5a5a5a]">{typeFilter === "season" && !items.some((it) => isPointOnly(it)) ? "시즌 상품 준비 중입니다." : "조건에 맞는 상품이 없습니다."}</p>
          </div>
        ) : (<>
          {/* 시즌 탭 기본 상태 — 두 갈래 큐레이션 + '전체' 머리, 그 아래 전체 격자 */}
          {seasonCur && <SeasonPicks picks={seasonCur} renderCard={renderCard} />}
          {/* 📌 칸 수 — 카드 폭이 PC · 태블릿 약 220~230px(국내 쇼핑몰 기준)이 되게: 폰 2 · 태블릿 3 · lg 4 · xl 5 (예전 3열은 카드가 386px 라 너무 컸다) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-7 sm:gap-x-4 lg:gap-x-5 lg:gap-y-9">
            {visible.map((it) => renderCard(it))}
          </div>
        </>)}
      </section>
      </>)}


      {/* ── 장바구니에 이미 담긴 상품을 '구매'로 눌렀을 때 ── */}
      {cartConflict && (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setCartConflict(null)}>
          <div className="relative bg-white rounded-3xl w-full max-w-sm p-7 border border-[#ededed] shadow-2xl"
            style={{ animation: "menuDrop 0.26s cubic-bezier(0.16,1,0.3,1)" }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setCartConflict(null)} aria-label="닫기"
              className="absolute top-4 right-4 p-1.5 rounded-full text-[#a3a3a3] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors">
              <svg className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} />
              </svg>
            </button>

            <div className="w-12 h-12 rounded-full bg-[#f2f2f2] flex items-center justify-center mb-4 text-[#131313]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>

            <h2 className="text-base font-black text-[#131313] mb-1.5">이미 장바구니에 있는 상품입니다</h2>
            {/* 무엇을 고르는지는 아래 두 버튼이 말한다 — 여기는 어떤 상품인지만 */}
            <p className="text-[13px] font-bold text-[#131313] mb-6 break-keep">{itemShortName(cartConflict)}</p>

            <div className="space-y-2">
              <Link href="/arctic/cart"
                className="block w-full py-3.5 text-center bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">
                장바구니에서 함께 결제 ({cartCount})
              </Link>
              <button
                onClick={() => { const it = cartConflict; setCartConflict(null); removeFromCart(it._id); startBuy(it); }}
                className="w-full py-3.5 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] font-bold rounded-xl transition-colors">
                이 상품만 지금 구매
              </button>
            </div>
          </div>
        </div>
      )}

      <InventoryPopup open={invOpen} onClose={() => setInvOpen(false)} />

      {/* ── 모바일 하단바 — 하위 페이지와 같은 공용 컴포넌트를 쓴다.
             ARCTIC 탭에서는 ClientLayout 이 전역 독을 숨기므로 겹치지 않는다. */}
      <ArcticDock
        activeKey={showMobileSearch || submitted ? "search" : showing === "home" ? "home" : ""}
        cartCount={cartCount}
        wishCount={wish.length}
        onSelect={(key) => {
          if (key === "home") { setView("home"); clearSearch(); window.scrollTo({ top: 0, behavior: "smooth" }); return true; }
          if (key === "search") { setShowMobileSearch(true); return true; }
          return false; // 장바구니·내 정보는 이동 (로그인 전이면 독이 로그인 창을 연다 — ArcticDock)
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
                  onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                  placeholder="상품명, 설명, 역할로 검색"
                  className="w-full bg-[#f2f2f2] rounded-full pl-9 pr-4 py-3 text-[14px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
              </div>
              <button onClick={() => setShowMobileSearch(false)} className="px-4 py-3 text-[13px] font-bold text-[#131313]">닫기</button>
            </div>
            <div className="mt-4 pt-1 border-t border-[#ededed]">{searchPanelOf(false)}</div>
            {query && (
              <button onClick={clearSearch} className="mt-3 ml-1 text-[12px] font-bold text-[#e91e3f]">검색어 지우기</button>
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
        @keyframes countPop {
          0%   { transform: scale(0.4); }
          55%  { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
        .count-pop { animation: countPop 0.38s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .count-pop, .wish-pop { animation: none; } }
        @keyframes menuDrop {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}} />

      {/* ── 구매 모달 ── */}
      {buyTarget && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          {/* 낮은 화면(모바일 가로 · 기프트카드 수령 칸 + 기간 + 빙옥 칸)에서도 위아래가 잘리지 않게 창 안에서 스크롤 */}
          <div className="bg-[#ffffff] rounded-3xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto shadow-2xl border border-[#ededed]">
            {result ? (
              <div className="p-8 text-center">
                <div className={`w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-5 ${result.ok ? "bg-[#e8f3e6] text-[#3f7a35]" : "bg-[#fdeaea] text-[#d01634]"}`}>
                  {result.ok ? (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
                  )}
                </div>
                <h2 className="text-lg font-black text-[#131313] mb-2">{result.ok ? "구매 완료" : "구매 실패"}</h2>
                <p className="text-sm text-[#5a5a5a] leading-relaxed mb-7 break-keep">{result.message}</p>
                <button onClick={() => { setBuyTarget(null); setResult(null); }} className="w-full py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] transition-colors">확인</button>
              </div>
            ) : (
              <>
                <div className="flex gap-4 p-6 border-b border-[#ededed]">
                  <div className="relative w-20 h-20 rounded-xl bg-[#f2f2f2] overflow-hidden shrink-0">
                    <CardArt it={buyTarget} iconSize={36} />
                  </div>
                  <div className="min-w-0">
                    <TypeBadge type={buyTarget.type} label={categoryLabelOf(buyTarget)} className="inline-block px-2 py-0.5 text-[10px] mb-1.5" />
                    <h2 className="text-base font-black text-[#131313] truncate">{itemShortName(buyTarget)}</h2>
                    <p className="text-sm font-black text-[#e91e3f] tabular-nums mt-0.5">
                      {priceText(buyTarget, salePrice(buyTarget, buyTarget._days))}
                      {isTimed(buyTarget) && <span className="text-[11px] font-bold text-[#8a8a8a] ml-1.5">/ {durationLabel(buyTarget._days)}</span>}
                    </p>
                  </div>
                </div>

                <div className="p-6">
                  {buyTarget.type === "physical" && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#5a5a5a] mb-2">수령 정보 <span className="text-[#d01634]">*</span></label>
                      <textarea rows={3} value={contact} onChange={(e) => setContact(e.target.value)}
                        placeholder="연락처 / 배송지 또는 기프티콘 받을 번호를 입력해주세요."
                        className="w-full bg-white border border-[#ededed] rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#8a8a8a] resize-none placeholder:text-[#a3a3a3]" />
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">운영진만 확인하며, 발송 목적으로만 사용됩니다.</p>
                    </div>
                  )}

                  {isTimed(buyTarget) && (
                    <div className="mb-5">
                      <label className="block text-xs font-bold text-[#5a5a5a] mb-2">이용 기간</label>
                      <div className="flex gap-2">
                        {durationOptions(buyTarget).map((o) => {
                          const on = o.days === buyTarget._days;
                          return (
                            <button key={o.days} type="button" onClick={() => { setPickDays((prev) => ({ ...prev, [buyTarget._id]: o.days })); setBuyTarget({ ...buyTarget, _days: o.days }); }}
                              className={`flex-1 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#5a5a5a] border-[#ededed] hover:border-[#131313]"}`}>
                              {durationLabel(o.days)}
                              <span className={`block text-[11px] font-bold tabular-nums mt-0.5 ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>{priceText(buyTarget, salePrice(buyTarget, o.days))}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-[#8a8a8a] mt-1.5">기간이 끝나면 {buyTarget.roleId ? "역할이 " : ""}자동으로 회수됩니다.</p>
                    </div>
                  )}

                  {/* 📌 빙옥 사용 — 원하는 만큼 쓰고 나머지는 XP 로. 결제 화면(arctic/checkout)과 같은 모양. 빙옥 전용 상품은 고를 게 없어 감춘다 */}
                  {!buyPO && <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <label htmlFor="buy-point" className="shrink-0 text-[11px] font-bold text-[#5a5a5a]">빙옥 사용</label>
                      <input id="buy-point" type="text" inputMode="numeric" autoComplete="off"
                        value={buyPoint ? String(buyPoint) : ""} placeholder="0"
                        onChange={(e) => setPointUse(Math.min(buyMaxPoint, parseInt(e.target.value.replace(/\D/g, "") || "0", 10) || 0))}
                        disabled={buyMaxPoint === 0}
                        className="min-w-0 flex-1 max-w-[88px] min-h-9 px-3 py-1.5 rounded-lg border border-[#a3a3a3] bg-white text-[14px] text-right text-[#131313] tabular-nums outline-none transition-colors placeholder:text-[#a3a3a3] focus:border-[#131313] focus:ring-2 focus:ring-[#131313]/10 disabled:bg-[#f2f2f2] disabled:text-[#8a8a8a] disabled:border-[#e0e0e0]" />
                      <button type="button" onClick={() => setPointUse(buyMaxPoint > 0 && buyPoint === buyMaxPoint ? 0 : buyMaxPoint)} disabled={buyMaxPoint === 0}
                        className={`shrink-0 px-2.5 py-1 rounded-full border text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          buyMaxPoint > 0 && buyPoint === buyMaxPoint ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] text-[#131313] hover:border-[#131313]"
                        }`}>
                        전액 사용
                      </button>
                      <span className="ml-auto shrink-0 text-[11px] text-[#8a8a8a] tabular-nums">보유 {(myPoint ?? 0).toLocaleString()}</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-[#8a8a8a]">1 빙옥 = {POINT_RATE.toLocaleString()} XP</p>
                  </div>}

                  {buyPO ? (
                    <div className="bg-[#f2f2f2] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                      <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 빙옥</span><span className="font-bold text-[#131313] tabular-nums">{(myPoint ?? 0).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 빙옥</span><span className="font-bold text-[#d01634] tabular-nums">-{buyPointAll.toLocaleString()}</span></div>
                      <div className="h-px bg-[#e0e0e0]"></div>
                      <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 빙옥</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myPoint ?? 0) - buyPointAll).toLocaleString()}</span></div>
                    </div>
                  ) : (
                  <div className="bg-[#f2f2f2] rounded-xl px-4 py-3 mb-5 text-[12px] space-y-1.5">
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">보유 XP</span><span className="font-bold text-[#131313] tabular-nums">{(myXp ?? 0).toLocaleString()}</span></div>
                    {buyPoint > 0 && (
                      <div className="flex justify-between gap-3">
                        <span className="shrink-0 text-[#5a5a5a]">빙옥 사용</span>
                        <span className="text-right font-bold text-[#d01634] tabular-nums">-{buyPoint.toLocaleString()} 빙옥 <span className="text-[11px] font-medium text-[#8a8a8a]">(−{(buyPoint * POINT_RATE).toLocaleString()} XP)</span></span>
                      </div>
                    )}
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">결제 XP</span><span className="font-bold text-[#d01634] tabular-nums">-{buyXp.toLocaleString()}</span></div>
                    <div className="h-px bg-[#e0e0e0]"></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 XP</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myXp ?? 0) - buyXp).toLocaleString()}</span></div>
                    <div className="flex justify-between"><span className="text-[#5a5a5a]">구매 후 빙옥</span><span className="font-black text-[#131313] tabular-nums">{Math.max(0, (myPoint ?? 0) - buyPoint).toLocaleString()}</span></div>
                  </div>
                  )}

                  {/* 화면에 안 보이는 것만 남긴다 — 지급까지 걸리는 시간과 되돌릴 수 없다는 경고
                      (기간 만료 회수는 위 '이용 기간' 칸이 이미 말한다)
                      📌 소모품(1회 소모권 · 보호막 — 상품 목록 API consumable)은 쓴 뒤 취소 · 환불되지 않는다는 것까지(2026-10-04 "주의 문구 써둬") */}
                  <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-5 break-keep">
                    {buyTarget.type === "physical"
                      ? "운영진 확인 후 발송되며, 구매 후 취소할 수 없습니다."
                      : buyTarget.consumable
                      ? "인벤토리에 보관되며, 구매 후 취소할 수 없고 사용한 뒤에는 환불되지 않습니다."
                      : (buyTarget.type === "item" || buyTarget.type === "cosmetic") && !buyTarget.roleId
                      ? "인벤토리에 보관되며, 구매 후 취소할 수 없습니다."
                      : "역할은 30초 이내에 지급되며, 구매 후 취소할 수 없습니다."}
                  </p>

                  <div className="flex gap-3">
                    <button onClick={() => setBuyTarget(null)} className="flex-1 py-3.5 bg-[#f2f2f2] text-[#5a5a5a] font-bold rounded-xl hover:bg-[#e0e0e0] transition-colors">취소</button>
                    <button onClick={confirmBuy} disabled={isBuying || !buyEnough}
                      className="flex-1 py-3.5 bg-[#e91e3f] text-[#ffffff] font-bold rounded-xl hover:bg-[#d01634] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {isBuying ? "처리 중..." : buyEnough ? "구매 확정" : buyPO ? "빙옥 부족" : "XP 부족"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── 상품 삭제 확인 (관리자) ── */}
      {deleteTarget && isAdmin && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl border border-[#ededed]">
            <h2 className="text-lg font-black text-[#131313] mb-2">상품 삭제</h2>
            <p className="text-sm text-[#5a5a5a] leading-relaxed mb-7">
              <span className="font-bold text-[#131313]">{deleteTarget.name}</span> 상품을 삭제하시겠습니까?<br />기존 구매 내역은 그대로 유지됩니다.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3.5 bg-[#f2f2f2] text-[#5a5a5a] font-bold rounded-xl hover:bg-[#e0e0e0] transition-colors">취소</button>
              <button onClick={deleteItem} className="flex-1 py-3.5 bg-[#d01634] text-white font-bold rounded-xl hover:bg-[#a81f1f] transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      <ArcticFooter />
    </div>
  );
}
