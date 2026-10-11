"use client";

import React, { useId } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICON_PATHS } from "../components/Icons";
import { openLogin, LOGIN_CTX } from "../components/LoginPrompt";
import { isTimed, durationOptions, durationLabel, cardPick, cardFrom, discountPctOf, shownPrice, priceUnit, priceText } from "@/lib/shopPricing";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { isBundle, BUNDLE_TYPE } from "@/lib/bundle";
import { splitItemName } from "@/lib/itemName";
import { saleEnded } from "@/lib/saleWindow";
import { playTone } from "@/lib/sfx";
import CardArt from "./CardArt";
import { ownStateOf, type OwnState } from "./owned";
import { useShopUid } from "./shopStore";
import { toggleCartRow, useCartRaw, rawHas, useCardOrders, flashCartToast, useCartToast } from "./cardCart";

// 📌 상품 카드 한 벌 — 상점 목록 · ARCTIC 홈 · 찜 · 상품 상세의 '다른 상품'이 모두 이 카드를 쓴다(곳마다 모양이 갈라지지 않게).
//    상자(테두리 · 그림자) 없이 그림 · 유형 · 이름 · 가격 · 찜 · 장바구니 만. 구매는 상세에서 (찜 목록은 아래 children 으로 '담기' 한 줄).
//    큰 값은 카드에 걸린 기간(pick — 목록 필터가 정한 것, 없으면 기본 무제한)의 판매가, 기간이면 "/ 30일".
//    그보다 싼 기간이 있으면 아래 작은 줄에 "7일 154,000 XP부터". 취소선 정가도 같은 기간 기준.
//    📌 크기 기준 — 목록 칸 폭이 PC · 태블릿 약 220~230px, 폰 2열 약 160px(국내 쇼핑몰 카드 폭).
//       글자 · 찜 버튼 크기는 화면 폭이 아니라 카드 자신의 폭으로 고른다(@container — 180px 이상이면 한 단계 크게, 150px 미만이면 가격만 한 단계 작게).
//       같은 화면 폭이라도 곳마다 카드 폭이 달라서다(태블릿 홈 반반 두 장은 144px, 상점 목록은 221px).
//       컨테이너 쿼리를 모르는 옛 브라우저는 작은 쪽 값 그대로 — 깨지지는 않는다.
//    📌 2026-10-11 장바구니 단추(운영자 "장바구니 단추 ㄱ" — 10/5 A안) — 그림 오른쪽 아래 동그라미(찜은 오른쪽 위 — 폰 2열에서 서로 멀게).
//       누르면 그 자리에서 담기 · 다시 누르면 빼기(찜과 같다). 담기는 기간은 카드에 걸린 기간(pick — 필터를 켰으면 그 기간, 아니면 기본 무제한).
//       세트(바로 구매만) · 품절 · 판매 종료 · 숨김 · 무제한 보유(더 살 수 없음)는 단추가 없다. 찜 목록 · 상품 상세는 기본으로 뺀다(cart).
//       저장 · 알림 · 보유 · 토스트는 ./cardCart
type Pick = { days?: number; price: number; list: number };

// 카드 장바구니 소리 — 담기는 오르는 두 음, 빼기는 내리는 두 음(인벤토리 열기 · 닫기와 같은 결)
const sfxCartIn = () => { playTone(392, 0.06, "sine", 0.03); setTimeout(() => playTone(587, 0.08, "sine", 0.03), 90); };
const sfxCartOut = () => { playTone(523, 0.06, "sine", 0.025); setTimeout(() => playTone(349, 0.08, "sine", 0.025), 90); };

// 📌 세트 상품(lib/bundle.js · type "bundle")은 lib/items.js 유형 목록에 없다 — 라벨 · 색만 여기서 더한다(나머지 유형은 lib/items.js 그대로).
//    상점 카드 · 상세 · 결제 · 구매 내역이 이 두 함수를 같이 쓴다
export const BUNDLE_LABEL = "세트";
export const BUNDLE_COLOR = "#b0701b";
export const typeLabelOf = (type: string) => (type === BUNDLE_TYPE ? BUNDLE_LABEL : itemTypeLabel(type));
export const typeColorOf = (type: string) => (type === BUNDLE_TYPE ? BUNDLE_COLOR : itemTypeColor(type));
// 세트 구성 수 — 목록 API 의 bundleItems(없으면 저장값 bundle)
export const bundleCountOf = (it: { bundleItems?: unknown; bundle?: unknown } | null | undefined) =>
  Array.isArray(it?.bundleItems) ? it.bundleItems.length : Array.isArray(it?.bundle) ? it.bundle.length : 0;

// 📌 NEW — 등록한 지 7일이 안 된 상품(2026-10-11 운영자 "그 new 달자" → "상품 이미지 왼쪽 상단에"). 그림 왼쪽 위 빨간 알약(찜 단추와 같은 여백)
const NEW_MS = 7 * 86400e3;
export const isNewProduct = (it: any) => { const t = Date.parse(String(it?.createdAt || "")); return Number.isFinite(t) && Date.now() - t < NEW_MS; };

// 📌 label — 이름 머리말에서 뗀 분류(「카드 스킨」 · 「프로필 배지」 …, lib/itemName). 없으면 유형 이름(「꾸미기」 …)
export function TypeBadge({ type, label = "", className = "" }: { type: string; label?: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: typeColorOf(type) }}>
      {label || typeLabelOf(type)}
    </span>
  );
}

export default function ProductCard({
  it, href, pick: pickIn, wished, onWish, wishLabel, overlay, className = "", children, cart, own,
}: {
  it: any;
  href: string;
  pick?: Pick | null;
  wished: boolean;
  onWish: () => void;
  wishLabel?: string;
  overlay?: React.ReactNode; // 그림 위 왼쪽 위 표시(관리자 '숨김' 등)
  className?: string;
  children?: React.ReactNode; // 카드 맨 아래 한 줄(관리자 수정 · 삭제, 찜 목록의 담기)
  cart?: boolean; // 장바구니 단추 — 안 주면 찜 목록 · 상품 상세만 빼고 켠다(아래 cartDefault)
  own?: OwnState; // 보유 상태를 화면이 알면(owned.ts ownStateOf) — 안 주면 카드들이 구매 목록을 한 번 받아 본다
}) {
  const soldOut = it.stock === 0;
  const pick = pickIn || cardPick(it) || { days: undefined, price: 0, list: 0 };
  const from = cardFrom(it, pick);
  const pct = pick.price < pick.list ? discountPctOf(it) : 0;
  // 📌 세트 — 가진 구성만큼 깎은 값(pick — owned.ts bundlePickOf)에도 정가 취소선을 단다. 할인율은 할인 중일 때만(할인 표기 그대로)
  const bundle = isBundle(it);
  const struck = bundle ? pick.price < pick.list : pct > 0;
  // 📌 「카드 스킨 · 새로운 세계」 → 칩 「카드 스킨」 + 이름 「새로운 세계」(분류를 칩과 이름에 두 번 쓰지 않게 — 2026-10-11 운영자)
  const nm = splitItemName(it.name);

  // 📌 장바구니 단추 — 담을 수 있는 상품만. 관리자 카드 미리보기(href "#")는 모양만(누를 수 없는 판 · 저장소 · 구매 목록을 안 본다)
  const pathname = usePathname();
  const preview = href === "#";
  const ended = !!it.saleEnded || saleEnded(it);
  // 📌 기본으로 끄는 곳 — 찜 목록(아래 '담기' 줄) · 상품 상세(다른 상품). 상세는 장바구니를 처음 읽은 state 로 통째 저장해서
  //    카드에서 담은 것을 그 화면의 담기 · 수량이 지운다 — 화면이 onCartChange 로 다시 읽게 되면 cart 를 넘겨 켠다
  const cartDefault = !pathname?.startsWith("/arctic/wish") && !pathname?.startsWith("/arctic/item/");
  const cartOn = (cart ?? cartDefault) && !!it._id && !bundle && !soldOut && !ended && it.active !== false;
  const { uid, ready } = useShopUid();
  const live = cartOn && !preview;
  // 보유 — 화면이 준 값, 없으면 카드들이 같이 받은 구매 목록(받는 중이면 null — 그동안 단추를 숨겨 산 상품에 잠깐 떴다 사라지지 않게)
  const orders = useCardOrders(uid, live && !!uid && own === undefined);
  const ownState: OwnState | null = own ?? (orders ? ownStateOf(orders, it) : null);
  const showCart = cartOn && (preview || (ready && (!uid || (ownState != null && ownState !== "forever"))));
  const cartRaw = useCartRaw(uid, live && showCart);
  const inCart = !preview && rawHas(cartRaw, String(it._id));
  const toastOwner = useId();
  const cartToast = useCartToast(toastOwner);
  const onCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (preview) return;
    // 📌 로그인 전에는 보기만 — 담기는 로그인 창(ARCTIC · 구매), 찜 · 구매와 같다
    if (!uid) return openLogin({ context: LOGIN_CTX.arcticBuy });
    const days = isTimed(it) ? (pick.days ?? durationOptions(it)[0]?.days ?? 0) : 0;
    if (toggleCartRow(uid, { itemId: String(it._id), qty: 1, days })) {
      sfxCartIn();
      flashCartToast(toastOwner, `${it.name}${days > 0 ? ` (${durationLabel(days)})` : ""} ${days > 0 && ownState === "timed" ? "연장을" : "상품을"} 장바구니에 담았습니다`);
    } else {
      sfxCartOut();
      flashCartToast(toastOwner, `${it.name} 상품을 장바구니에서 삭제했습니다`);
    }
  };

  return (
    <div className={`@container group relative flex flex-col ${className}`}>
      {/* 그림 칸 — 장바구니 단추를 그림 오른쪽 아래에 붙이려고 한 겹 감쌌다(크기 · 자리는 예전 그대로) */}
      <div className="relative">
        <Link href={href} className="block relative aspect-square overflow-hidden rounded-md bg-[#f2f2f2]">
          {/* 📌 마우스를 올리면 3% 커진다 — transform 확대는 도트가 번져 흐려졌다(운영자 "흐릿해지는 거 없애") → 크기 자체를 키우는 pz-zoom(globals.css) */}
          <CardArt it={it} imgClass="pz-zoom" stage />
          {overlay}
          {!overlay && isNewProduct(it) && (
            <span className="absolute top-2 left-2 @min-[180px]:top-2.5 @min-[180px]:left-2.5 z-10 inline-flex items-center h-[22px] @min-[180px]:h-6 px-2 rounded-full bg-[#e91e3f] text-white text-[10px] @min-[180px]:text-[11px] font-black tracking-wide leading-none">NEW</span>
          )}
          {soldOut && (
            <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
              <span className="text-[12px] font-black text-[#131313] tracking-wider">품절</span>
            </span>
          )}
        </Link>

        {/* 장바구니 — 보이는 동그라미는 찜과 같은 크기 · 같은 여백(28px · 8px, 카드 180px 이상 32px · 10px),
            누르는 칸은 그보다 넓게(36 · 40px). 담겨 있으면 검은 동그라미 */}
        {showCart && (
          <button type="button" onClick={onCart} aria-label={inCart ? "장바구니에서 빼기" : "장바구니에 담기"}
            className="group/cart absolute bottom-1 right-1 @min-[180px]:bottom-1.5 @min-[180px]:right-1.5 z-10 w-9 h-9 @min-[180px]:w-10 @min-[180px]:h-10 flex items-center justify-center">
            <span className={`w-7 h-7 @min-[180px]:w-8 @min-[180px]:h-8 rounded-full flex items-center justify-center transition group-active/cart:scale-90 ${
              inCart ? "bg-[#131313] text-white" : "bg-white/90 group-hover/cart:bg-white text-[#a3a3a3]"
            }`}>
              <svg className="w-3.5 h-3.5 @min-[180px]:w-4 @min-[180px]:h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.cart} />
              </svg>
            </span>
          </button>
        )}
      </div>

      {/* 찜 */}
      <button onClick={onWish} aria-label={wishLabel || (wished ? "찜 해제" : "찜하기")}
        className="absolute top-2 right-2 @min-[180px]:top-2.5 @min-[180px]:right-2.5 z-10 w-7 h-7 @min-[180px]:w-8 @min-[180px]:h-8 rounded-full bg-white/90 hover:bg-white flex items-center justify-center transition-colors">
        <svg className={`w-3.5 h-3.5 @min-[180px]:w-4 @min-[180px]:h-4 transition-colors ${wished ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}
          fill={wished ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
        </svg>
      </button>

      <Link href={href} className="block mt-2.5 @min-[180px]:mt-3">
        {/* 이름 앞에 분류 — 무엇을 사는 것인지 이름만으로는 모른다 */}
        {/* 세트는 유형 옆에 구성 수 — 이름 · 가격 자리는 다른 카드와 같다. 한 줄 flex 로 세로 가운데를 맞춘다(글자 크기가 달라 align-middle 로는 어긋났다) */}
        <span className="flex items-center gap-1.5 mb-1.5">
          <TypeBadge type={it.type} label={nm.kind} className="inline-flex items-center h-[18px] px-2 text-[10px] leading-none" />
          {bundle && <span className="text-[10.5px] font-bold text-[#8a8a8a] leading-none whitespace-nowrap">아이템 {bundleCountOf(it)}개</span>}
        </span>
        {/* 이름은 작고 가볍게, 가격이 주인공 — 둘이 같은 크기면 값이 안 읽힌다 */}
        <h3 className="text-[12.5px] @min-[180px]:text-[13px] font-semibold text-[#5a5a5a] leading-snug line-clamp-2 break-keep">{nm.short}</h3>
        {/* 할인 중이면 정가는 취소선으로 가격 위에(사용자 결정 — 아래로 내리면 어색), 할인율은 빨간 글자, 큰 숫자는 할인가.
            가격 줄 높이를 맞추려고 할인 없는 카드에 빈 줄을 두지는 않는다(이름-가격 사이가 떠 보여 반려) */}
        {/* 빙옥 전용 상품은 같은 규칙에 단위만 빙옥 (priceText · shownPrice — 올림) */}
        {struck && <s className="block mt-2 text-[11px] text-[#a3a3a3] tabular-nums leading-none">{priceText(it, Number(pick.list || 0))}</s>}
        <p className={`${struck ? "mt-1" : "mt-2"} text-[17px] @min-[180px]:text-[18px] @max-[150px]:text-[16px] font-black text-[#131313] tabular-nums leading-none`}>
          {/* 숫자 · 단위 · 기간은 각각 한 덩어리 — 좁은 칸(폰 2열 · 상세의 다른 상품)에서 "30 / 일"처럼 중간이 끊기지 않게, 넘치면 기간 덩어리째 다음 줄 */}
          {/* 📌 할인율도 한 덩어리 — 아주 좁은 칸(320px 폰 134px · 태블릿 홈 반반 143px)에서 할인율 + 8~9자리 값이 칸을 넘으면
                 카드 밖으로 삐져나와 옆 카드에 겹쳤다. 할인율 뒤(<wbr>)에서만 줄을 바꾼다 — 칸 안에 들어가면 지금과 같은 한 줄 */}
          {pct > 0 && <><span className="mr-1 @min-[180px]:mr-1.5 text-[13px] @max-[150px]:text-[12px] font-black text-[#e91e3f] whitespace-nowrap">{pct}%</span><wbr /></>}
          <span className="whitespace-nowrap">{shownPrice(it, pick.price).toLocaleString()}<span className="ml-0.5 @min-[180px]:ml-1 text-[10.5px] @min-[180px]:text-[11px] font-bold text-[#8a8a8a]">{priceUnit(it)}</span></span>
          {isTimed(it) && pick.days != null && pick.days > 0 && <>{" "}<span className="text-[10.5px] @min-[180px]:text-[11px] font-bold text-[#8a8a8a] whitespace-nowrap">/ {durationLabel(pick.days)}</span></>}
        </p>
        {from && <p className="mt-1.5 text-[11px] font-bold text-[#8a8a8a] tabular-nums leading-none">{durationLabel(from.days)} {priceText(it, from.price)}부터</p>}
      </Link>

      {/* 맨 아래 줄(담기 · 수정/삭제)은 카드 바닥에 붙인다 — 위의 작은 줄 수가 달라도 같은 줄 카드끼리 버튼 높이가 같게 */}
      {children && <div className="mt-auto flex flex-col">{children}</div>}

      {/* 장바구니 토스트 — 상점 토스트와 같은 모양 · 자리(상단 가운데). 카드(@container)는 fixed 의 기준이 되므로 body 로 뺀다.
          문구가 길어 폰 폭을 넘으면 줄을 바꾼다(가로 넘침 없이) */}
      {cartToast && createPortal(
        <div key={cartToast.n} role="status" className="pc-cart-toast fixed top-20 left-1/2 z-[150] pointer-events-none">
          <style>{`@keyframes pcCartToast { 0% { opacity: 0; transform: translateY(-14px) scale(0.92); } 55% { opacity: 1; transform: translateY(2px) scale(1.02); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            .pc-cart-toast { animation: pcCartToast 0.42s cubic-bezier(0.16,1,0.3,1); }
            @media (prefers-reduced-motion: reduce) { .pc-cart-toast { animation: none; } }`}</style>
          <div className="-translate-x-1/2 w-max max-w-[calc(100vw-32px)] flex items-center gap-2.5 px-5 py-3 bg-[#131313] text-white rounded-full shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.cart} />
            </svg>
            <span className="text-[12px] font-bold break-keep">{cartToast.msg}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
