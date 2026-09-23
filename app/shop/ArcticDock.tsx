"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ICON_PATHS } from "../components/Icons";

// 📌 ARCTIC 모바일 하단바 — 상점 메인과 하위 페이지(내 정보·장바구니·주문 내역·상품 상세)가 같은 모양을 쓴다
//    상점 메인에서만 열 수 있는 찜·검색은 쿼리로 넘겨 메인에서 열도록 한다
type Item = { key: string; href: string; label: string; icon: string; match?: (p: string) => boolean };

const ITEMS: Item[] = [
  {
    key: "home",
    href: "/level?tab=arctic",
    label: "홈",
    icon: ICON_PATHS.home,
  },
  {
    key: "wish",
    href: "/level?tab=arctic&panel=wish",
    label: "찜한 상품",
    icon: ICON_PATHS.heart,
  },
  {
    key: "search",
    href: "/level?tab=arctic&panel=search",
    label: "상품 검색",
    icon: ICON_PATHS.search,
  },
  {
    key: "cart",
    href: "/shop/cart",
    label: "장바구니",
    icon: ICON_PATHS.cart,
  },
  {
    key: "me",
    href: "/profile?from=arctic",
    label: "내 정보",
    icon: ICON_PATHS.user,
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
    if (it.key === "me") return pathname === "/profile";
    if (it.key === "home") return pathname === "/level";
    return false;
  };

  return (
    <nav className="md:hidden fixed inset-x-3 mx-auto max-w-md bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[92] p-1.5 rounded-full border border-[#dedddb] bg-white/90 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.26)] grid grid-cols-5">
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
