"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 📌 ARCTIC 모바일 하단바 — 상점 메인과 하위 페이지(내 정보·장바구니·주문 내역·상품 상세)가 같은 모양을 쓴다
//    상점 메인에서만 열 수 있는 찜·검색은 쿼리로 넘겨 메인에서 열도록 한다
type Item = { key: string; href: string; label: string; icon: string; match?: (p: string) => boolean };

const ITEMS: Item[] = [
  {
    key: "home",
    href: "/shop",
    label: "홈",
    icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  },
  {
    key: "wish",
    href: "/shop?panel=wish",
    label: "찜한 상품",
    icon: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  },
  {
    key: "search",
    href: "/shop?panel=search",
    label: "상품 검색",
    icon: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
  },
  {
    key: "cart",
    href: "/shop/cart",
    label: "장바구니",
    icon: "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
  },
  {
    key: "me",
    href: "/shop/me",
    label: "내 정보",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  },
];

export default function ArcticDock({
  activeKey,
  onSelect,
  cartCount = 0,
  wishCount = 0,
}: {
  activeKey?: string;
  onSelect?: (key: string) => boolean | void; // true를 돌려주면 이동 대신 그 자리에서 처리한다
  cartCount?: number;
  wishCount?: number;
}) {
  const pathname = usePathname();

  const isActive = (it: Item) => {
    if (activeKey) return activeKey === it.key;
    if (it.key === "cart") return pathname === "/shop/cart";
    if (it.key === "me") return pathname === "/shop/me";
    if (it.key === "home") return pathname === "/shop";
    return false;
  };

  return (
    <nav className="md:hidden fixed inset-x-3 mx-auto max-w-md bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[92] p-1.5 rounded-full border border-[#e2e0dc] bg-white/90 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.26)] grid grid-cols-5">
      {ITEMS.map((it) => {
        const active = isActive(it);
        const badge = it.key === "cart" ? cartCount : it.key === "wish" ? wishCount : 0;
        const cls = `relative flex items-center justify-center py-2 rounded-full transition-all active:scale-95 ${
          active ? "text-[#e91e3f] bg-[#e91e3f]/[0.08]" : "text-[#8a8a8a] active:text-[#131313]"
        }`;
        const icon = (
          <>
            {/* 채워도 모양이 남는 건 하트뿐 — 집 아이콘은 윤곽선이라 채우면 덩어리로 뭉갠다 */}
            <svg className="w-[19px] h-[19px]" fill={active && it.key === "wish" ? "currentColor" : "none"}
              viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={it.icon} />
            </svg>
            {badge > 0 && (
              <span className="absolute top-0.5 right-1/2 translate-x-3.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center">
                {badge}
              </span>
            )}
          </>
        );

        // 상점 메인에서는 이동 없이 그 자리에서 처리한다 (찜·검색 패널 등)
        if (onSelect) {
          return (
            <button key={it.key} type="button" aria-label={it.label} title={it.label} className={cls}
              onClick={() => { if (!onSelect(it.key)) window.location.href = it.href; }}>
              {icon}
            </button>
          );
        }
        return (
          <Link key={it.key} href={it.href} aria-label={it.label} title={it.label} className={cls}>
            {icon}
          </Link>
        );
      })}
    </nav>
  );
}
