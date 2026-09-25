"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ICON_PATHS } from "../components/Icons";
import { InventoryPopup } from "../components/Inventory";

// 📌 하위 화면 경로 줄 — 상품 상세 · 장바구니 · 구매 내역 위의 한 줄.
//    상점 메인의 유형 줄 · 검색창을 그대로 붙이면 상세 위가 무거워진다. 여기는 "ARCTIC › 유형 › 상품" 경로와
//    찜 · 장바구니 아이콘만 둔다. 경로의 앞 칸을 누르면 상점 메인 · 그 유형 목록으로 돌아간다.
//    찜 · 장바구니 개수는 상점 메인과 같은 저장소(iglooShopWish · iglooShopCart)를 읽고, 화면이 개수를 알면 그 값을 쓴다.
//    내 정보에서 들어오면(?from=me) 앞 칸이 ARCTIC 대신 "내 정보" — 돌아갈 길이 있어야 한다.
//    내 정보가 ARCTIC 맥락이었으면(&via=arctic) 그 모습(스토어 독)으로 돌려보낸다.
type Crumb = { label: string; href?: string };

const readCount = (key: string, byQty: boolean) => {
  try {
    const rows = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(rows)) return 0;
    return byQty ? rows.reduce((n: number, r: any) => n + (Number(r?.qty) || 1), 0) : rows.length;
  } catch {
    return 0;
  }
};

const Badge = ({ n }: { n: number }) => (
  <span key={n} className="count-pop absolute top-0 right-0 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{n}</span>
);

export default function ArcticStoreBar({ crumbs = [], active = "", cartCount, wishCount, width = "max-w-5xl" }: { crumbs?: Crumb[]; active?: string; cartCount?: number; wishCount?: number; width?: string }) {
  const [stored, setStored] = useState({ cart: 0, wish: 0 });
  const [invOpen, setInvOpen] = useState(false);
  const { status } = useSession();

  useEffect(() => {
    const load = () => setStored({ cart: readCount("iglooShopCart", true), wish: readCount("iglooShopWish", false) });
    load();
    window.addEventListener("storage", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("storage", load);
      window.removeEventListener("focus", load);
    };
  }, []);

  const cart = cartCount ?? stored.cart;
  const wish = wishCount ?? stored.wish;
  const sp = useSearchParams();
  const home: Crumb = sp.get("from") === "me"
    ? { label: "내 정보", href: sp.get("via") === "arctic" ? "/profile?from=arctic" : "/profile" }
    : { label: "ARCTIC", href: "/arctic" };
  const path: Crumb[] = [home, ...crumbs];

  return (
    <div className="w-full bg-white border-b border-[#ededed]">
      <style>{`
        @keyframes countPop { 0% { transform: scale(0.4); } 55% { transform: scale(1.3); } 100% { transform: scale(1); } }
        .count-pop { animation: countPop 0.38s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .count-pop { animation: none; } }
      `}</style>
      <div className={`${width} mx-auto px-6 flex items-center gap-4 h-12 md:h-[52px]`}>
        {/* 경로 — 앞 칸은 링크, 마지막은 지금 있는 곳 */}
        <nav aria-label="경로" className="min-w-0 flex-1 flex items-center gap-2 text-[13px] font-bold">
          {path.map((c, i) => {
            const last = i === path.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                {i > 0 && <span aria-hidden className="shrink-0 text-[#c4c4c4]">›</span>}
                {c.href && !last ? (
                  <Link href={c.href} className="shrink-0 text-[#8a8a8a] hover:text-[#131313] transition-colors">{c.label}</Link>
                ) : (
                  <span className="min-w-0 truncate text-[#131313]" aria-current={last ? "page" : undefined}>{c.label}</span>
                )}
              </Fragment>
            );
          })}
        </nav>

        {/* 인벤토리 — 산 것 · 받은 것을 그 자리에서 팝업으로. 모바일도 여기서 연다 (하단바 다섯 칸은 찼다) */}
        {status === "authenticated" && (
          <button type="button" onClick={() => setInvOpen(true)} aria-label="인벤토리" title="인벤토리"
            className="relative shrink-0 flex items-center justify-center w-9 h-9 rounded-full transition-colors text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.bag} />
            </svg>
          </button>
        )}

        {/* 찜 · 장바구니 — 상점 메인과 같은 모양 (모바일은 하단바가 맡는다). 인벤토리와 붙여 세 아이콘 간격을 맞춘다 */}
        <div className="hidden md:flex items-center gap-1 shrink-0 -ml-3">
          <Link href="/arctic/wish" aria-label={`찜한 상품 보기${wish ? ` (${wish})` : ""}`}
            className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${active === "wish" ? "text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
            </svg>
            {wish > 0 && <Badge n={wish} />}
          </Link>
          <Link href="/arctic/cart" aria-label={`장바구니${cart ? ` (${cart})` : ""}`}
            className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${active === "cart" ? "text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.cart} />
            </svg>
            {cart > 0 && <Badge n={cart} />}
          </Link>
        </div>
      </div>
      <InventoryPopup open={invOpen} onClose={() => setInvOpen(false)} />
    </div>
  );
}
