"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ICON_PATHS } from "../components/Icons";
import { useArcticFromLevel } from "./fromLevel";

// 📌 상점 줄 — 상품 상세 · 장바구니 · 구매 내역 위에도 상점 메인(ArcticShopBody)과 같은 줄을 둔다.
//    하위 화면에 전역 상단 바만 있으면 나가기가 불편했다.
//    유형을 누르면 상점 목록의 그 유형으로(?type=), 검색은 목록의 검색 결과로(?q=) 간다.
//    찜 · 장바구니 개수는 상점 메인과 같은 저장소(iglooShopWish · iglooShopCart)를 읽고, 화면이 개수를 알면 그 값을 쓴다.
const TABS = [
  { v: "", l: "홈" },
  { v: "all", l: "전체" },
  { v: "role", l: "역할" },
  { v: "perk", l: "권한" },
  { v: "item", l: "아이템" },
  { v: "physical", l: "기프트카드" },
  { v: "timed", l: "기간제" },
];

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

export default function ArcticStoreBar({ active = "", cartCount, wishCount }: { active?: string; cartCount?: number; wishCount?: number }) {
  const router = useRouter();
  const fromLevel = useArcticFromLevel();
  const [q, setQ] = useState("");
  const [stored, setStored] = useState({ cart: 0, wish: 0 });

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
  const search = () => {
    const t = q.trim();
    if (t) router.push(`/arctic?q=${encodeURIComponent(t)}`);
  };

  return (
    <div className="w-full bg-white border-b border-[#ededed]">
      <style>{`
        @keyframes countPop { 0% { transform: scale(0.4); } 55% { transform: scale(1.3); } 100% { transform: scale(1); } }
        .count-pop { animation: countPop 0.38s cubic-bezier(0.16,1,0.3,1); }
        @media (prefers-reduced-motion: reduce) { .count-pop { animation: none; } }
      `}</style>
      <div className="max-w-7xl mx-auto px-5 md:px-6 flex items-center gap-4 md:gap-6 h-[56px] md:h-[60px]">
        {/* 유형 — 누르면 상점 목록의 그 유형으로 */}
        <nav className="flex items-center gap-5 md:gap-7 overflow-x-auto no-bar h-full min-w-0 flex-1 md:flex-none">
          {fromLevel && (
            <>
              <Link href="/level" className="md:hidden shrink-0 flex items-center gap-1 text-[13px] font-extrabold text-[#a3a3a3] hover:text-[#131313] transition-colors">
                <span aria-hidden>‹</span>레벨
              </Link>
              <span aria-hidden className="md:hidden shrink-0 w-px h-4 bg-[#e0e0e0] -ml-1"></span>
            </>
          )}
          {TABS.map((t) => {
            const on = active === (t.v || "home");
            return (
              <Link key={t.l} href={t.v ? `/arctic?type=${t.v}` : "/arctic"}
                className={`relative shrink-0 h-full flex items-center text-[14px] md:text-[15px] font-extrabold transition-colors ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                {t.l}
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
              </Link>
            );
          })}
        </nav>

        {/* 검색 — 상점 목록의 검색 결과로 */}
        <div className="hidden md:flex flex-1 justify-end min-w-0">
          <div className="relative w-full max-w-[300px] lg:max-w-[360px] h-10 rounded-full border-2 border-[#131313] bg-white overflow-hidden">
            <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="상품, 유형, 역할 검색"
              className="absolute inset-0 w-full h-full bg-transparent pl-4 pr-10 text-[13px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
            <button type="button" onClick={search} aria-label="검색"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-[#131313] outline-none">
              <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.search} />
              </svg>
            </button>
          </div>
        </div>

        {/* 찜 · 장바구니 — 상점 메인과 같은 모양: 테두리 아이콘 + 빨간 개수 점 */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link href="/arctic?panel=wish" aria-label={`찜한 상품 보기${wish ? ` (${wish})` : ""}`}
            className="relative flex items-center justify-center w-9 h-9 rounded-full text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors">
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.heart} />
            </svg>
            {wish > 0 && <Badge n={wish} />}
          </Link>
          <Link href="/arctic/cart" aria-label={`장바구니${cart ? ` (${cart})` : ""}`}
            className={`relative flex items-center justify-center w-9 h-9 rounded-full transition-colors ${active === "cart" ? "bg-[#e91e3f]/10 text-[#e91e3f]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-black/[0.05]"}`}>
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.cart} />
            </svg>
            {cart > 0 && <Badge n={cart} />}
          </Link>
        </div>
      </div>
    </div>
  );
}
