"use client";

import React from "react";
import Link from "next/link";
import { ICON_PATHS } from "../components/Icons";
import { isTimed, durationLabel, cardPick, cardFrom, discountPctOf, shownPrice, priceUnit, priceText } from "@/lib/shopPricing";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import CardArt from "./CardArt";

// 📌 상품 카드 한 벌 — 상점 목록 · ARCTIC 홈 · 찜 · 상품 상세의 '다른 상품'이 모두 이 카드를 쓴다(곳마다 모양이 갈라지지 않게).
//    상자(테두리 · 그림자) 없이 그림 · 유형 · 이름 · 가격 · 찜 만. 담기 · 구매는 상세에서 (찜 목록은 아래 children 으로 '담기' 한 줄).
//    큰 값은 카드에 걸린 기간(pick — 목록 필터가 정한 것, 없으면 기본 무제한)의 판매가, 기간이면 "/ 30일".
//    그보다 싼 기간이 있으면 아래 작은 줄에 "7일 154,000 XP부터". 취소선 정가도 같은 기간 기준.
//    📌 크기 기준 — 목록 칸 폭이 PC · 태블릿 약 220~230px, 폰 2열 약 160px(국내 쇼핑몰 카드 폭).
//       글자 · 찜 버튼 크기는 화면 폭이 아니라 카드 자신의 폭으로 고른다(@container — 180px 이상이면 한 단계 크게, 150px 미만이면 가격만 한 단계 작게).
//       같은 화면 폭이라도 곳마다 카드 폭이 달라서다(태블릿 홈 반반 두 장은 144px, 상점 목록은 221px).
//       컨테이너 쿼리를 모르는 옛 브라우저는 작은 쪽 값 그대로 — 깨지지는 않는다.
type Pick = { days?: number; price: number; list: number };

export function TypeBadge({ type, className = "" }: { type: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
      {itemTypeLabel(type)}
    </span>
  );
}

export default function ProductCard({
  it, href, pick: pickIn, wished, onWish, wishLabel, overlay, className = "", children,
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
}) {
  const soldOut = it.stock === 0;
  const pick = pickIn || cardPick(it) || { days: undefined, price: 0, list: 0 };
  const from = cardFrom(it, pick);
  const pct = pick.price < pick.list ? discountPctOf(it) : 0;
  return (
    <div className={`@container group relative flex flex-col ${className}`}>
      <Link href={href} className="block relative aspect-square overflow-hidden rounded-md bg-[#f2f2f2]">
        <CardArt it={it} imgClass="group-hover:scale-[1.03] transition-transform duration-500" stage />
        {overlay}
        {soldOut && (
          <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <span className="text-[12px] font-black text-[#131313] tracking-wider">품절</span>
          </span>
        )}
      </Link>

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
        <TypeBadge type={it.type} className="inline-block mb-1.5 px-2 py-[3px] text-[10px] leading-none align-middle" />
        {/* 이름은 작고 가볍게, 가격이 주인공 — 둘이 같은 크기면 값이 안 읽힌다 */}
        <h3 className="text-[12.5px] @min-[180px]:text-[13px] font-semibold text-[#5a5a5a] leading-snug line-clamp-2 break-keep">{it.name}</h3>
        {/* 할인 중이면 정가는 취소선으로 가격 위에(사용자 결정 — 아래로 내리면 어색), 할인율은 빨간 글자, 큰 숫자는 할인가.
            가격 줄 높이를 맞추려고 할인 없는 카드에 빈 줄을 두지는 않는다(이름-가격 사이가 떠 보여 반려) */}
        {/* 빙옥 전용 상품은 같은 규칙에 단위만 빙옥 (priceText · shownPrice — 올림) */}
        {pct > 0 && <s className="block mt-2 text-[11px] text-[#a3a3a3] tabular-nums leading-none">{priceText(it, Number(pick.list || 0))}</s>}
        <p className={`${pct > 0 ? "mt-1" : "mt-2"} text-[17px] @min-[180px]:text-[18px] @max-[150px]:text-[16px] font-black text-[#131313] tabular-nums leading-none`}>
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
    </div>
  );
}
