"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { salePrice, basePrice, isTimed, durationOptions, durationLabel, cardPick, discountPctOf, discountUntilLabel, isPointOnly, shownPrice, priceUnit, priceText, affordFor } from "@/lib/shopPricing";
import { saleEnded, saleUntilLabel } from "@/lib/saleWindow";
import { itemTypeColor } from "@/lib/items";
import { useAdminView } from "../../../components/AdminView";
import ArcticDock from "../../ArcticDock";
import ArcticStoreBar from "../../ArcticStoreBar";
import ArcticFooter from "../../ArcticFooter";
import ProductCard, { typeLabelOf, typeColorOf, categoryLabelOf, itemShortName } from "../../ProductCard";
import ItemIcon from "../../../components/ItemIcon";
import CardArt from "../../CardArt";
import AppliedPreview from "../../AppliedPreview";
import { ownStateOf, renewBaseOf, renewPickOf, expiryLabel, ownedCountOf, bundleViewOf, bundlePickOf } from "../../owned";
import { isBundle } from "@/lib/bundle";
import { isUnitSale, maxPerOrderOf, qtyCapOf } from "@/lib/unitSale";
import { openLogin, LOGIN_CTX } from "../../../components/LoginPrompt";
import { CART_KEY, WISH_KEY, CHECKOUT_KEY, readShopList, writeShopList, useShopUid } from "../../shopStore";
import { onCartChange } from "../../cardCart";
import { productIconOf } from "@/lib/cosmeticArt";
import { rarityOf } from "@/lib/rarity";

// 유형 배지 — 라벨·색은 lib/items.js 가 단일 원천(세트만 ProductCard 의 typeLabelOf · typeColorOf)
//    label — 분류(ProductCard categoryLabelOf — API categoryLabel, 옛 응답은 이름 머리말). 없으면 유형 이름
//    📌 칩 · 알약 폭은 정수 px 로 올림(SNAP_W) — 소수 폭이면 옆 알약이 0.5px 자리에 놓여 글자가 쏠려 보였다(2026-10-17). 못 읽는 브라우저는 그대로
const SNAP_W: React.CSSProperties = { width: "calc-size(fit-content, round(up, size, 1px))" };
const TypeBadge = ({ type, label = "", className = "" }: { type: string; label?: string; className?: string }) => (
  <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: typeColorOf(type), ...SNAP_W }}>
    {label || typeLabelOf(type)}
  </span>
);

// 📌 2026-10-17 희귀도 알약(lib/rarity.js 표 한 곳) — 상품 상세에서만(운영자 "걍 템 클릭하면 그 안에서만 희귀도 보이면 되잖아" — 상점 카드는 없음).
//    밝은 판용: 등급 색 테(60%) · 옅은 바탕(10%) · 글자는 등급 색을 그 바탕 위 4.5:1 이 될 때까지 어둡게(유물 · 일반처럼 밝은 색도 읽히게). 단색만
//    v null(연결 아이템이 없는 상품 · 세트 머리 — API rarity)이면 그리지 않는다 — 예전 모습. base 는 알약 밑 판 색(구성 칸은 #f2f2f2)
const rgbOf = (hex: string) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [154, 163, 178];
};
const lumOf = (rgb: number[]) => {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a: number[], b: number[]) => {
  const [x, y] = [lumOf(a), lumOf(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const rarityPillStyle = (hex: string, base: number[]): React.CSSProperties => {
  const c = rgbOf(hex);
  const bg = c.map((v, i) => Math.round(v * 0.1 + base[i] * 0.9));
  let ink = [0, 0, 0];
  for (let k = 1; k >= 0; k -= 0.02) {
    const t = c.map((v) => Math.round(v * k));
    if (contrastOf(t, bg) >= 4.6) { ink = t; break; }
  }
  return { color: `rgb(${ink.join(",")})`, border: `1px solid rgba(${c.join(",")},0.6)`, background: `rgba(${c.join(",")},0.1)` };
};
const RarityPill = ({ v, base = [255, 255, 255] }: { v?: string | null; base?: number[] }) => {
  if (v == null) return null;
  const r = rarityOf(v);
  // 글자 줄 높이 = 테 안 높이(18px) — 알약이 소수 위치에 놓여도 글자가 위로 뜨지 않는다(인벤토리 알약과 같은 값)
  return <span className="shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-full text-[11px] font-black leading-[18px] whitespace-nowrap" style={{ ...rarityPillStyle(r.c, base), ...SNAP_W }}>{r.l}</span>;
};

// 📌 세트 구성 한 칸의 상태 표기 — 가진 것(owned)은 빠지고 그만큼 값이 깎인다(lib/bundle.js). 기간제로만 가진 것은 — 기간제 구성이면 그 뒤에 이어 붙여 연장,
//    무제한 구성이면 무제한으로 새로 받는다(가진 기간제는 그대로 · 값은 안 깎인다). 2026-10-11 운영자 "무제한 전환은 뭐야?" → 무엇을 가져서 무엇이 되는지 그대로 쓴다
const BUNDLE_MARK: Record<string, string> = { owned: "보유 중 · 빠짐", renew: "기간제 보유 · 기간 연장", upgrade: "기간제 보유 · 무제한으로" };
// 📌 효과 타일 한 칸(API effects · bundleItems[].effects — lib/itemEffects effectTilesOf). line = 같은 말 한 줄, custom = 관리자가 직접 쓴 줄(크기를 못 찾으면 amount "")
type EffectPart = { label: string; amount: string; unit: string; cond?: string[]; once?: boolean; cosmetic?: boolean; line?: string; custom?: boolean };
type BundleInfo = {
  itemId: string; name?: string; categoryLabel?: string; shortName?: string; icon?: string; imageUrl?: string; color?: string; type?: string; hasRole?: boolean; consumable?: boolean;
  effects?: EffectPart[]; cosmeticKeys?: { skin?: string; scene?: string; frame?: string }; rarity?: string | null;
  // 📌 2026-10-18 적용 범위(lib/itemEffects effectDisplayOf) — 꾸미기 구성은 효과 대신 「적용 범위」 아래 줄에 「대시보드 / 명령어 카드 / 알림 카드」
  isCosmetic?: boolean; scopeLabel?: string;
};
// 📌 2026-10-18 꾸미기(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)의 적용 범위 글자 — API isCosmetic · scopeLabel. 꾸미기가 아니거나 옛 응답이면 ""
const scopeTextOf = (x: { isCosmetic?: boolean; scopeLabel?: string } | null | undefined) => (x?.isCosmetic && x.scopeLabel ? String(x.scopeLabel) : "");
// 효과 타일 목록 — 지금 API 는 꾸미기 조각을 싣지 않는다. 옛 응답의 꾸미기 조각(이름 · 분류와 같은 말)은 dropCosmetic 이면 뺀다
const fxTilesOf = (list: unknown, dropCosmetic: boolean): EffectPart[] =>
  (Array.isArray(list) ? (list as EffectPart[]) : []).filter((e) => e && !(dropCosmetic && e.cosmetic));


// 📌 상품 상세 — 카드에서 눌러 들어오는 화면
export default function ItemDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id || "");
  const isLoggedIn = status === "authenticated";
  // 📌 관리자로 보는 중(계정 메뉴 「유저 화면으로 보기」를 켜면 false) — 숨김 상품 목록(?all=1)도 이 값. 숨김 상품 상세는 서버(getShopAccess)가 같은 쿠키로 가른다
  const { admin: isAdmin } = useAdminView();

  const [item, setItem] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [myXp, setMyXp] = useState<number | null>(null);
  const [myPoint, setMyPoint] = useState<number | null>(null);
  // 📌 내 레벨 카드 값(/api/xp/me data) — 꾸미기 상품의 '적용 모습'을 내 이름 · 레벨로 그린다(AppliedPreview). 없으면 예시
  const [meData, setMeData] = useState<Record<string, unknown> | null>(null);
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
  // 📌 1개 단위 상품의 수량 — 고르기 전엔 null(장바구니에 담겨 있으면 그 수량, 아니면 1)
  const [qtyPick, setQtyPick] = useState<number | null>(null);
  // 📌 다른 상품 — 서버 추천(/api/shop/recommend?related=, lib/shopRecommend related)의 id 4개. 오기 전 · 실패면 null(지금 규칙으로 그린다)
  const [relIds, setRelIds] = useState<string[] | null>(null);

  // 📌 2026-10-04 장바구니 · 찜은 계정마다(../../shopStore) — 로그인 전은 빈 목록(배지 0)
  const { uid: shopUid, ready: shopReady } = useShopUid();
  useEffect(() => {
    if (!shopReady) return;
    setCart(readShopList(CART_KEY, shopUid));
    setWish(readShopList<string>(WISH_KEY, shopUid));
  }, [shopUid, shopReady]);
  // 📌 아래 「다른 상품」 카드의 장바구니 단추(../../cardCart)가 담고 빼면 다시 읽는다 — 이 화면의 담기 · 개수 단추가 옛 목록으로 덮어 카드에서 담은 것을 지우지 않게
  useEffect(() => (shopReady ? onCartChange(shopUid, () => setCart(readShopList(CART_KEY, shopUid))) : undefined), [shopUid, shopReady]);

  const saveCart = (next: { itemId: string; qty: number; days?: number }[]) => {
    setCart(next);
    writeShopList(CART_KEY, shopUid, next);
  };
  const saveWish = (next: string[]) => {
    setWish(next);
    writeShopList(WISH_KEY, shopUid, next);
  };
  // 📌 2026-10-04 로그인 전에는 상품을 보기만 — 기간 · 수량 고르기 · 담기 · 찜 · 구매는 로그인 창(ARCTIC · 구매)
  const askLogin = () => openLogin({ context: LOGIN_CTX.arcticBuy });

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
      if (me?.success) { setMyXp(me.data.xp); setMyPoint(me.data.point ?? 0); setMeData(me.data); }
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      setAllItems(Array.isArray(all?.data) ? all.data : []);
      // 세트(lib/bundle.js)는 장바구니에 둘 수 없다 — 개수 기준에서 뺀다
      if (all?.success && Array.isArray(all?.data)) setValidIds(new Set(all.data.filter((x: { type?: string }) => !isBundle(x)).map((x: { _id: string }) => String(x._id))));
    }).finally(() => setIsLoading(false));
  }, [status, id, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // 추천은 상품 · 지갑과 나란히 따로 받는다 — 늦어도 화면을 막지 않고, 오면 같은 자리에 바꿔 끼운다(카드 높이가 같아 자리가 흔들리지 않는다)
  useEffect(() => {
    if (status === "loading" || !id) return;
    let alive = true;
    setRelIds(null);
    fetch(`/api/shop/recommend?related=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.success && Array.isArray(j.data?.related)) setRelIds(j.data.related.map(String)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [status, id]);

  // 📌 세트 값 · 구성 상태 · 보유 중은 서버 견적(api/shop/bundle-quote — 결제 API 와 같은 판정)으로 — 결제 화면(../../checkout)과 같다.
  //    화면 계산(내 구매 목록)은 옛 건 · 숨김 상품 · 목록 창 밖 건을 다 못 봐 결제 화면 값과 어긋날 수 있었다. 받기 전 · 실패하면 화면 계산 그대로
  const setId = item && isBundle(item) ? String(item._id) : "";
  const [setQuote, setSetQuote] = useState<{ id: string; price: number; full: number; list: number; owned: number; all: boolean; states: string[] } | null>(null);
  useEffect(() => {
    if (!setId) return;
    let alive = true;
    fetch(`/api/shop/bundle-quote?id=${encodeURIComponent(setId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const q = j?.success ? j.data : null;
        if (!alive || !q) return;
        setSetQuote({
          id: setId, price: Number(q.price) || 0, full: Number(q.full) || 0, list: Number(q.list) || 0, owned: Number(q.owned) || 0, all: !!q.all,
          states: Array.isArray(q.states) ? q.states.map(String) : [],
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [setId, orders]);

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
  // 기간제만 가졌으면 지금 만료(ms) — 기간제를 사면 이 뒤에 이어 붙는다 (owned.ts, 서버와 같은 기준)
  const renewBase = renewBaseOf(orders, item);
  // 안 골랐으면 카드와 같은 기간(무제한, 없으면 가장 긴 기간) — 카드에서 본 값과 상세 첫 값이 같게.
  //    기간제를 가졌으면 연장이 기본 — 지금 가진 기간(없으면 가장 긴 기간제)으로 연다
  const days = timed ? (pickedDays ?? (renewBase != null ? renewPickOf(orders, item) : null) ?? cardPick(item)?.days ?? durationOptions(item)[0]?.days ?? 0) : 0;
  // 📌 세트(lib/bundle.js) — 구성마다 보유를 보고 이 사람이 낼 값(가진 구성만큼 깎은 값)을 건다. 서버 견적(setQuote)이 오면 그 값 · 상태,
  //    오기 전 · 실패하면 화면 계산(owned.ts bundleViewOf — 결제 API 와 같은 계산).
  //    다 가졌으면 판매가 그대로 · 보유 중. 기간 고르기 · 수량 · 장바구니는 없다(바로 구매만 — 결제 화면이 바로 구매 API 로 보낸다)
  const bundle = isBundle(item);
  const localBv = bundle ? bundleViewOf(orders, item, allItems) : null;
  const sq = setQuote && setQuote.id === setId ? setQuote : null;
  const bv = localBv && sq
    ? { ...localBv, states: localBv.comps.map((_, i) => ({ state: sq.states[i] || "new" })), quote: { ...localBv.quote, price: sq.price, full: sq.full, list: sq.list, owned: sq.owned, all: sq.all } }
    : localBv;
  const bundleInfo = new Map<string, BundleInfo>((bundle && Array.isArray(item.bundleItems) ? item.bundleItems : []).map((c: BundleInfo) => [String(c.itemId), c]));
  const bundleInfos = bv ? bv.comps.map((c) => bundleInfo.get(c.itemId) || { itemId: c.itemId }) : [];
  const sp = bv ? Number(bv.quote.all ? bv.quote.full : bv.quote.price) || 0 : salePrice(item, days);
  const listPrice = bv ? Number(bv.quote.list) || 0 : basePrice(item, days);
  const discounted = sp < listPrice;
  // 📌 보유 상태 — 서버와 같은 기준(owned.ts). 연결된 아이템을 수동 지급 · 시즌 패스로 받은 건(itemRef)도 보유다.
  //    무제한 보유면 더 살 수 없다(보유 중). 기간제만 가졌으면 기간제는 연장(지금 만료 뒤에 이어 붙음) · 무제한은 업그레이드로 산다
  //    세트는 구성을 다 가졌을 때만 보유 중
  const owned = bv ? !!bv.quote.all : ownStateOf(orders, item) === "forever";
  const renewing = renewBase != null && days > 0;
  const inCart = cart.some((c) => c.itemId === item._id);
  // 📌 1개 단위(lib/unitSale.js) — 1부터 min(1회 최대, 재고)까지. 장바구니에 담긴 상품이면 그 수량에서 시작하고, 바꾸면 장바구니 줄도 같이 바꾼다
  const unit = isUnitSale(item);
  const perOrder = maxPerOrderOf(item);
  const cap = Math.max(1, qtyCapOf(item));
  const cartQty = Math.floor(Number(cart.find((c) => c.itemId === item._id)?.qty) || 1);
  const qty = unit ? Math.min(cap, Math.max(1, qtyPick ?? cartQty)) : 1;
  const heldCount = unit && isLoggedIn ? ownedCountOf(orders, item) : 0;
  const stepQty = (d: number) => {
    if (!isLoggedIn) return askLogin();
    const next = qty + d;
    if (next < 1) return;
    if (next > cap) return flash(item.stock >= 0 && item.stock < next ? (item.stock > 0 ? `재고 ${item.stock}개` : "품절") : `한 번에 ${perOrder}개까지`);
    setQtyPick(next);
    if (inCart) saveCart(cart.map((c) => (c.itemId === item._id ? { ...c, qty: next } : c)));
  };
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
  // 📌 판매 종료(lib/saleWindow — 2026-10-11) — 서버가 단 saleEnded 또는 지금 시각으로. 끝났으면 구매 · 장바구니 담기를 잠근다(결제 API 도 막는다)
  const ended = !!item.saleEnded || saleEnded(item);
  const wished = wish.includes(item._id);
  // 📌 빙옥도 함께 낼 수 있다(결제 화면에서 고른다) — XP + 빙옥 × 10,000 으로 판정. 빙옥 전용 상품은 빙옥만(affordFor)
  const po = isPointOnly(item);
  // 1개 단위는 고른 수량만큼 — 빙옥 전용은 1개 값(올림) × 수량(결제 · 장바구니와 같은 계산)
  const affordable = myXp != null && (po ? shownPrice(item, sp) * qty <= (myPoint ?? 0) : affordFor(item, myXp, myPoint ?? 0)(sp * qty));
  // 빙옥 전용인데 빙옥이 모자라면 담기 · 구매를 잠근다 (지갑을 읽은 뒤에만)
  const pointShort = isLoggedIn && po && myXp != null && !affordable;
  const cartLocked = soldOut || owned || (ended && !inCart) || (pointShort && !inCart);

  // 관련 상품 — 한 줄 4개. 추천(relIds)이 오면 그 순서, 오기 전 · 실패 · 모자라면 지금 규칙(같은 유형 먼저, 나머지로 채움)으로.
  //    현재 상품 · 품절 · 판매 중 아님(숨김 · 판매 종료 — 관리자 목록 ?all=1 에만 실린다)은 뺀다
  const others = allItems.filter((x) => x._id !== item._id && x.active && x.stock !== 0);
  const fallback = [
    ...others.filter((x) => x.type === item.type),
    ...others.filter((x) => x.type !== item.type),
  ];
  const byRel = relIds ? relIds.map((rid) => others.find((x) => String(x._id) === rid)).filter(Boolean) : [];
  const related = [...byRel, ...fallback.filter((x) => !byRel.some((r: any) => r._id === x._id))].slice(0, 4);

  // 담기 ↔ 삭제 토글
  const toggleCart = () => {
    if (!isLoggedIn) return askLogin();
    if (bundle) return flash("세트는 바로 구매만 할 수 있습니다");
    if (owned) return flash("이미 구매하신 상품입니다");
    if (!inCart && pointShort) return flash("빙옥이 부족합니다");
    if (inCart) {
      // 보이던 수량(장바구니 줄 값)을 그대로 둔다 — 빼자마자 1로 돌아가 다시 담으면 1개만 담기지 않게
      if (unit) setQtyPick(qty);
      saveCart(cart.filter((c) => c.itemId !== item._id));
      flash("장바구니에서 삭제했습니다");
      return;
    }
    saveCart([...cart, { itemId: item._id, qty, days }]);
    flash(renewing ? "기간 연장을 장바구니에 담았습니다" : unit && qty > 1 ? `${qty}개를 장바구니에 담았습니다` : "장바구니에 담았습니다");
  };

  // 이 상품과 아래 '다른 상품' 카드의 하트가 같이 쓴다
  const toggleWishOf = (id: string) => {
    if (!isLoggedIn) return askLogin();
    const on = wish.includes(id);
    saveWish(on ? wish.filter((x) => x !== id) : [...wish, id]);
    flash(on ? "찜을 해제했습니다" : "찜 목록에 추가했습니다");
  };
  const toggleWish = () => toggleWishOf(item._id);

  // 구매 — 팝업 대신 결제 화면으로 넘어간다. 이 상품 하나만 결제 대상으로 넘기고(장바구니는 그대로),
  //    쿠폰 · 약관 동의 · 수령 정보는 결제 화면(app/arctic/checkout)이 맡는다
  const openBuy = () => {
    if (!isLoggedIn) return askLogin();
    if (pointShort) return flash("빙옥이 부족합니다");
    writeShopList(CHECKOUT_KEY, shopUid, [{ itemId: item._id, qty, days }]);
    router.push("/arctic/checkout");
  };

  return (
    <div className="w-full flex-1 bg-white text-[#131313] min-h-screen">
      <ArcticStoreBar
        crumbs={[{ label: typeLabelOf(item.type), href: bundle ? "/arctic?type=all" : `/arctic?type=${item.type}` }, { label: itemShortName(item) }]}
        cartCount={cartCount}
        wishCount={wish.length}
      />
      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 좌 — 이미지. 꾸미기 상품의 적용 모습은 효과 아래 '적용 미리보기'에(AppliedPreview) */}
          <div className="relative aspect-square rounded-2xl bg-[#f2f2f2] border border-[#ededed] overflow-hidden">
            <CardArt it={item} stage />
            {soldOut && (
              <div className="absolute inset-0 bg-[#131313]/55 flex items-center justify-center">
                <span className="text-lg font-black text-white tracking-wider">SOLD OUT</span>
              </div>
            )}
          </div>

          {/* 우 — 정보 */}
          <div className="flex flex-col">
            {/* 📌 2026-10-17 유형 칩 옆 희귀도 알약(연결 아이템이 있을 때만 — API rarity). 좁으면 다음 줄로 */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <TypeBadge type={item.type} label={categoryLabelOf(item)} className="inline-flex items-center justify-center h-6 px-2.5 text-[10px] leading-[24px]" />
              <RarityPill v={item.rarity} />
            </div>

            {/* 이름은 짧은 이름(API shortName) — 분류는 위 칩(「카드 테두리」 …)에 한 번만 */}
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-[#131313] mb-3 break-keep">{itemShortName(item)}</h1>

            <div className="mb-6">
              {/* 정가 취소선은 가격 위에 — 상품 카드(ProductCard)와 같은 순서(사용자: 할인 전 가격이 밑으로 가면 어색) */}
              {discounted && (
                <span className="block mb-1.5 text-[14px] text-[#a3a3a3] line-through tabular-nums leading-none">{priceText(item, listPrice)}</span>
              )}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* 세트는 가진 구성만큼 깎여도 정가 취소선만 — 할인율은 할인 중일 때만 */}
                {discounted && discountPctOf(item) > 0 && (
                  <span className="px-2 py-1 rounded-md bg-[#e91e3f] text-white text-[12px] font-black leading-none shrink-0">{discountPctOf(item)}% OFF</span>
                )}
                {/* 빙옥 전용은 단위만 빙옥 — 같은 판매가를 올림으로 바꿔 적는다 */}
                <span className="text-3xl font-black tracking-tight tabular-nums leading-none text-[#131313]">
                  {shownPrice(item, sp).toLocaleString()}<span className="text-sm font-bold text-[#8a8a8a] ml-1.5">{priceUnit(item)}</span>
                </span>
                {timed && <span className="text-[13px] font-bold text-[#8a8a8a]">/ {durationLabel(days)}</span>}
              </div>
              {/* 할인 종료 시각이 있으면 언제까지인지 */}
              {discounted && discountUntilLabel(item) && (
                <span className="block mt-2 text-[12px] font-bold text-[#e91e3f]">할인 {discountUntilLabel(item)}</span>
              )}
              {/* 판매 종료 시각 — 한 줄(끝났으면 진하게) */}
              {saleUntilLabel(item) && (
                <span className={`block mt-1.5 text-[12px] font-bold ${ended ? "text-[#131313]" : "text-[#8a8a8a]"}`}>{saleUntilLabel(item)} 판매 종료</span>
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
                      <button key={o.days} type="button" onClick={() => (isLoggedIn ? setPickedDays(o.days) : askLogin())}
                        className={`flex-1 py-3 rounded-xl border text-[13px] font-bold transition-colors ${
                          on ? "bg-[#131313] text-white border-[#131313]" : "bg-white text-[#5a5a5a] border-[#ededed] hover:border-[#131313]"
                        }`}>
                        {durationLabel(o.days)}
                        <span className={`block text-[12px] font-bold tabular-nums mt-0.5 ${on ? "text-white/70" : "text-[#a3a3a3]"}`}>
                          {priceText(item, salePrice(item, o.days))}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {renewBase == null && <p className="text-[11px] text-[#8a8a8a] mt-2">기간이 끝나면 {item.roleId ? "역할이 " : ""}자동으로 회수되며, 그 뒤 다시 구매할 수 있습니다.</p>}
              </div>
            )}

            {/* 설명 줄 높이 23px(정수) — leading-relaxed(22.75px)는 줄 수에 따라 아래 전체를 0.5px 자리로 밀어 칩 · 알약 글자가 쏠렸다(2026-10-17) */}
            {item.description && (
              <p className="text-[14px] text-[#5a5a5a] leading-[23px] mb-6 whitespace-pre-wrap break-keep">{item.description}</p>
            )}


            {/* 상세 정보 */}
            <div className="rounded-xl bg-white border border-[#ededed] divide-y divide-[#ededed] mb-6">
              {[
                { l: "상품 유형", v: typeLabelOf(item.type) },
                ...(item.roleName ? [{ l: "지급 역할", v: item.roleName }] : []),
                // 세트 — 구성 수 · 가진 수(가진 것은 빠지고 그만큼 깎인다)
                ...(bv ? [{ l: "구성", v: `아이템 ${bv.comps.length}개${bv.quote.owned > 0 ? ` · ${bv.quote.owned}개 보유` : ""}` }] : []),
                {
                  l: "재고",
                  v: item.stock < 0 ? "제한 없음" : item.stock === 0 ? "품절" : `${item.stock}개 남음`,
                  accent: item.stock >= 0 && item.stock > 0 && item.stock <= 5,
                },
                // 1개 단위는 한 번에 살 수 있는 개수, 나머지는 1인 1개 (세트는 구성마다 따로라 이 줄이 없다)
                ...(bv ? [] : [{ l: "구매 제한", v: unit ? `1회 최대 ${perOrder}개` : "1인 1개" }]),
                ...(heldCount > 0 ? [{ l: "보유 수량", v: `${heldCount.toLocaleString()}개` }] : []),
                {
                  l: "지급 방식",
                  v: bv
                    ? bundleInfos.some((c) => c.hasRole) ? "결제 후 30초 이내 자동 지급" : "결제 후 인벤토리에 보관"
                    : item.type === "physical"
                    ? "운영진 확인 후 발송"
                    : (item.type === "item" || item.type === "cosmetic") && !item.roleId
                    ? "결제 후 인벤토리에 보관"
                    : "결제 후 30초 이내 자동 지급",
                },
                // 📌 소모품(1회 소모권 · 보호막 — API consumable) — 쓴 뒤에는 취소 · 환불되지 않는다(2026-10-04 "주의 문구 써둬"). 세트는 구성 중 하나라도
                ...((bv ? bundleInfos.some((c) => c.consumable) : item.consumable) ? [{ l: "취소 · 환불", v: "사용 후 불가" }] : []),
                // 📌 수량 · 합계(1개 단위만) — 조절 칸은 폭 고정(숫자 칸 w-9, 99까지 두 자리)이라 숫자가 바뀌어도 줄이 흔들리지 않는다.
                //    합계는 따로 한 줄 — 조절 칸 옆에 두면 자릿수가 늘 때 조절 칸이 밀린다. 빙옥 전용은 1개 값(올림) × 수량(결제와 같은 계산)
                ...(unit
                  ? [
                      {
                        l: "수량",
                        v: (
                          <span className="inline-flex items-center h-8 rounded-full border border-[#ededed] overflow-hidden">
                            <button type="button" onClick={() => stepQty(-1)} aria-label="수량 빼기"
                              className={`w-8 h-8 flex items-center justify-center transition-colors ${qty <= 1 ? "text-[#d4d4d4] cursor-default" : "text-[#131313] hover:bg-[#f2f2f2]"}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M5 12h14" /></svg>
                            </button>
                            <span className="w-9 text-center text-[13px] font-black tabular-nums">{qty}</span>
                            <button type="button" onClick={() => stepQty(1)} aria-label="수량 더하기"
                              className={`w-8 h-8 flex items-center justify-center transition-colors ${qty >= cap ? "text-[#d4d4d4]" : "text-[#131313] hover:bg-[#f2f2f2]"}`}>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
                            </button>
                          </span>
                        ),
                      },
                      { l: "합계", v: <span className="tabular-nums">{(shownPrice(item, sp) * qty).toLocaleString()} {priceUnit(item)}</span> },
                    ]
                  : []),
              ].map((row: { l: string; v: React.ReactNode; accent?: boolean }, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <span className="text-[12px] font-bold text-[#8a8a8a] shrink-0">{row.l}</span>
                  <span className={`text-[13px] font-bold text-right ${row.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{row.v}</span>
                </div>
              ))}
            </div>

            {/* 📌 기간제 보유 — 지금 만료 → 고른 기간으로 산 뒤의 만료(무제한을 고르면 무제한) */}
            {isLoggedIn && renewBase != null && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-[#ededed] mb-2 text-[13px]">
                <span className="shrink-0 text-[#5a5a5a]">만료</span>
                <span className="text-right font-black tabular-nums text-[#131313] break-keep">
                  <span className="font-bold text-[#8a8a8a]">{expiryLabel(renewBase)}</span>
                  <span className="mx-1.5 font-bold text-[#a3a3a3]">→</span>
                  {days > 0 ? expiryLabel(renewBase + days * 86400000) : "무제한"}
                </span>
              </div>
            )}

            {/* 보유 XP · 빙옥 — 둘 다 결제에 쓸 수 있다. 빙옥 전용 상품은 빙옥만 */}
            {isLoggedIn && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-[#ededed] mb-4 text-[13px]">
                <span className="shrink-0 text-[#5a5a5a]">보유</span>
                <span className={`text-right font-black tabular-nums ${affordable ? "text-[#131313]" : "text-[#d01634]"}`}>
                  {po ? `${(myPoint ?? 0).toLocaleString()} 빙옥` : `${(myXp ?? 0).toLocaleString()} XP · ${(myPoint ?? 0).toLocaleString()} 빙옥`}
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

              {/* 📌 담기 · 구매 두 칸은 늘 그대로 — 빙옥 전용인데 빙옥이 모자라면(기간을 바꾸면 달라진다) 잠그고 글자만 바꾼다.
                     이미 담아 둔 건 뺄 수 있게 담기 칸은 열어 둔다. 세트는 바로 구매만이라 담기 칸이 없다 */}
              {!bundle && <button onClick={toggleCart} disabled={cartLocked}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  cartLocked
                    ? "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
                    : inCart
                    ? "bg-[#131313] text-white hover:bg-[#333]"
                    : "bg-white text-[#131313] border border-[#ededed] hover:border-[#131313]"
                }`}>
                {inCart ? "장바구니에서 삭제" : "장바구니에 담기"}
              </button>}

              <button onClick={openBuy} disabled={soldOut || ended || owned || pointShort}
                className={`flex-1 h-12 rounded-full text-[13px] font-bold transition-colors ${
                  owned || soldOut || ended || pointShort
                    ? "bg-[#f2f2f2] text-[#a3a3a3] cursor-not-allowed"
                    : isLoggedIn && !affordable
                    ? "bg-[#f2f2f2] text-[#8a8a8a]"
                    : "bg-[#e91e3f] text-white hover:bg-[#d01634]"
                }`}>
                {/* 로그인 전에도 '구매' — 누르면 로그인 창(ARCTIC · 구매)이 맥락을 말한다 */}
                {owned ? "보유 중" : ended ? "판매 종료" : soldOut ? "품절" : !isLoggedIn ? "구매" : !affordable ? (po ? "빙옥 부족" : "XP 부족") : renewing ? "기간 연장" : "구매"}
              </button>
            </div>
          </div>
        </div>

        {/* ── 세트 구성 — 효과 칸과 같은 자리 · 같은 바탕(아래 전체 폭). 칸 하나에 아이템 하나: 그림 · 이름 · 유형 · 기간 · 개수 · 효과 조각.
               가진 구성은 "보유 중 · 빠짐"(그만큼 값이 깎였다), 기간제로만 가진 것은 연장 · 무제한 전환 ── */}
        {bv && bv.comps.length > 0 && (
          <div className="mt-14 pt-10 border-t border-[#ededed]">
            <h2 className="text-base font-black text-[#131313] tracking-tight mb-5">구성 <span className="ml-0.5 text-[#e91e3f] tabular-nums">{bv.comps.length}</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {bv.comps.map((c, i) => {
                const info = bundleInfos[i];
                const st = String(bv.states[i]?.state || "new");
                const mark = BUNDLE_MARK[st] || "";
                // 꾸미기 조각(카드 스킨 · 테두리 · 배지)은 이름 · 분류와 같은 말이라 빼고 진짜 효과만(2026-10-11 운영자 "같은 내용은 몇 개인 거고").
                //    📌 2026-10-18 효과 줄은 관리자가 직접 쓴 문구 > 자동(API 가 정한다), 꾸미기 구성은 효과 대신 「적용 범위 · …」 한 줄(운영자 "효과라는 건 약간 이상하잖아")
                const fx = fxTilesOf(info.effects, true);
                const scopeTxt = scopeTextOf(info);
                // 📌 구성 분류 · 짧은 이름 — API bundleItems[].categoryLabel · shortName(2026-10-17), 옛 응답은 이름 머리말 → 유형 이름
                const nm = { kind: categoryLabelOf({ ...info, type: info.type || "item" }), short: itemShortName(info) };
                // 📌 구성 아이콘도 큰 그림(CardArt)과 같은 고르기(cosmeticKeys — lib/bundleServer · lib/cosmeticArt productIconOf). 공용 반짝 카드로 남지 않게
                const face = productIconOf(info);
                return (
                  <div key={c.itemId} className="flex gap-4 min-w-0 bg-[#f2f2f2] px-5 py-4">
                    <span className={`w-12 h-12 shrink-0 bg-white flex items-center justify-center overflow-hidden ${st === "owned" ? "opacity-50" : ""}`}>
                      <ItemIcon icon={face ? face.icon : info.icon} imageUrl={face ? face.imageUrl : info.imageUrl} type={info.type} size={28} color={info.color || itemTypeColor(info.type || "")} />
                    </span>
                    <div className="flex-1 min-w-0">
                      {/* 분류 칩(이름 위) — 이름이 같은 구성(검은 고양이 테두리 · 카드 스킨 · 배지)도 한눈에 갈린다 */}
                      {/* 📌 2026-10-17 분류 칩 옆 구성 희귀도 알약(API bundleItems[].rarity — 없으면 칩만). 표시 칸과 겹치면 다음 줄로 */}
                      <div className="flex items-start justify-between gap-3">
                        <span className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-white text-[10.5px] font-black leading-[20px] text-[#5a5a5a] whitespace-nowrap" style={SNAP_W}>{nm.kind}</span>
                          <RarityPill v={info.rarity} base={[242, 242, 242]} />
                        </span>
                        {mark && <span className={`shrink-0 mt-0.5 text-[11px] font-black whitespace-nowrap ${st === "owned" ? "text-[#8a8a8a]" : "text-[#e91e3f]"}`}>{mark}</span>}
                      </div>
                      <span className="block mt-1.5 text-[14px] font-black text-[#131313] break-keep">{nm.short || "아이템"}</span>
                      <span className="block mt-0.5 text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                        {durationLabel(c.days)}{c.qty > 1 ? ` · ${c.qty.toLocaleString()}개` : ""}
                      </span>
                      {(fx.length > 0 || !!scopeTxt) && (
                        <div className="mt-2.5 space-y-1">
                          {fx.map((e, k) => {
                            const cond = [...(Array.isArray(e.cond) ? e.cond : []), e.once ? "하루 1번" : ""].filter(Boolean);
                            return (
                              <p key={k} className="text-[12px] font-bold text-[#5a5a5a] break-keep">
                                {/* 직접 쓴 줄에서 크기를 못 찾으면(amount "") 줄 전체가 label — 그대로 한 줄 */}
                                {e.label}{e.amount ? <> <span className="font-black text-[#131313] tabular-nums">{e.amount}{e.unit === "XP" ? " XP" : e.unit}</span></> : null}
                                {cond.length > 0 && <span className="text-[11px] text-[#8a8a8a]"> · {cond.join(" · ")}</span>}
                              </p>
                            );
                          })}
                          {/* 적용 범위 — 이름 한 줄 위, 값 「대시보드 / 명령어 카드」 아래 줄(2026-10-18 운영자) */}
                          {scopeTxt && (
                            <div className="break-keep">
                              <p className="text-[12px] font-bold text-[#5a5a5a]">적용 범위</p>
                              <p className="mt-0.5 text-[12px] font-black text-[#131313]">{scopeTxt}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 효과 — 사면 붙는 것(등록 아이템 효과 + 지급 역할의 역할 버프). 오른쪽 정보 칸에 몰리지 않게 아래 전체 폭으로.
               칸 하나에 효과 하나: 무엇을 하면 · 얼마나 · 조건(요일 · 시간 · 채널 · 하루 1번). 문구는 관리자가 직접 쓴 것 > 자동(API effects).
               📌 2026-10-18 꾸미기는 효과 대신 「적용 범위」 칸 하나(API scopeLabel — 「대시보드 / 명령어 카드 / 알림 카드」). 꾸미기만 있으면 제목도 「적용 범위」 ── */}
        {(() => {
          const scopeTxt = scopeTextOf(item);
          const fx = fxTilesOf(item.effects, !!scopeTxt);
          const n = fx.length + (scopeTxt ? 1 : 0);
          if (!n) return null;
          return (
            <div className="mt-14 pt-10 border-t border-[#ededed]">
              <h2 className="text-base font-black text-[#131313] tracking-tight mb-5">{fx.length ? "효과" : "적용 범위"}</h2>
              {/* 칸 수는 개수에 맞춘다(PC 최대 4) — 빈 칸이 남지 않게. 모바일 2열에서 효과 칸이 홀수면 마지막 효과 칸이, 적용 범위 칸은 늘 한 줄을 다 쓴다(글자가 길다) */}
              <div className={`grid grid-cols-2 gap-2 ${n >= 4 ? "md:grid-cols-4" : n === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {fx.map((e, i) => {
                  const cond = [...(Array.isArray(e.cond) ? e.cond : []), e.once ? "하루 1번" : ""].filter(Boolean);
                  const wide = fx.length % 2 === 1 && i === fx.length - 1;
                  return (
                    <div key={i} className={`flex flex-col bg-[#f2f2f2] px-5 py-5 ${wide ? "col-span-2 md:col-span-1" : ""}`}>
                      {e.amount ? (
                        <>
                          <span className="text-[12px] font-bold text-[#5a5a5a] break-keep">{e.label}</span>
                          <span className="mt-2.5 text-[24px] font-black text-[#131313] tabular-nums leading-none tracking-tight">
                            {e.amount}<span className="ml-1 text-[12px] font-bold text-[#8a8a8a]">{e.unit}</span>
                          </span>
                        </>
                      ) : (
                        // 직접 쓴 줄에서 크기를 못 찾았다(lib/itemEffects effectTileOfLine) — 줄 전체를 크게
                        <span className="text-[17px] font-black text-[#131313] leading-[24px] tracking-tight break-keep">{e.label}</span>
                      )}
                      {cond.length > 0 && <span className="mt-3 text-[11px] font-bold text-[#8a8a8a] break-keep">{cond.join(" · ")}</span>}
                    </div>
                  );
                })}
                {/* 적용 범위 칸 — 제목이 이미 「적용 범위」면(꾸미기만) 칸 이름은 빼고 값만(같은 말 두 번 금지) */}
                {scopeTxt && (
                  <div className="col-span-2 md:col-span-1 flex flex-col bg-[#f2f2f2] px-5 py-5">
                    {fx.length > 0 && <span className="mb-2.5 text-[12px] font-bold text-[#5a5a5a]">적용 범위</span>}
                    <span className="text-[17px] font-black text-[#131313] leading-[24px] tracking-tight break-keep">{scopeTxt}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 적용 미리보기 — 꾸미기 상품만(카드 스킨 · 프로필 배지). 로그인했으면 내 프로필로 ── */}
        <AppliedPreview key={item._id} item={item} user={isLoggedIn ? session?.user : null} me={isLoggedIn ? meData : null} />

        {/* ── 다른 상품 — 한 줄. PC 4칸, 모바일은 옆으로 넘기는 한 줄(스냅 · 카드 폭 고정).
               가로 넘침은 이 줄 안에서만 — -mx-6 로 화면 끝까지 붙이되 섹션 여백(px-6) 안이라 페이지는 넓어지지 않는다 ── */}
        {related.length > 0 && (
          <div className="mt-16 pt-10 border-t border-[#ededed]">
            <div className="flex items-baseline justify-between gap-4 mb-5">
              <h2 className="text-base font-black text-[#131313] tracking-tight">다른 상품도 둘러보세요</h2>
              <Link href="/arctic" className="text-[12px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors shrink-0">
                전체 보기
              </Link>
            </div>

            {/* 📌 상점 목록과 같은 카드(ProductCard) — 곳마다 카드 모양이 갈라지지 않게. 모바일은 가로로 넘기고, 카드 폭은 상점 두 칸 폭과 비슷하게 */}
            <div className="no-bar -mx-6 px-6 -my-2 py-2 flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-px-6 md:mx-0 md:px-0 md:my-0 md:py-0 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible">
              {related.map((r) => (
                <ProductCard key={r._id} it={r} href={`/arctic/item/${r._id}`} cart pick={isBundle(r) ? bundlePickOf(orders, r, allItems) : undefined} wished={wish.includes(r._id)} onWish={() => toggleWishOf(r._id)}
                  className="snap-start shrink-0 w-[156px] md:w-auto" />
              ))}
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
