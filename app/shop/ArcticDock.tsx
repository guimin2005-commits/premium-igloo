"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 📌 ARCTIC 하위 페이지(내 정보·장바구니·주문 내역·상품 상세)용 모바일 하단바
//    상점 메인은 자체 하단바(홈·찜·검색·장바구니·프로필)를 쓰므로 여기서는 이동만 담당한다
const ITEMS = [
  {
    href: "/shop",
    label: "홈",
    icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  },
  {
    href: "/shop/cart",
    label: "장바구니",
    icon: "M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
  },
  {
    href: "/shop/orders",
    label: "주문 내역",
    icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  },
  {
    href: "/shop/me",
    label: "내 정보",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  },
];

export default function ArcticDock() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed inset-x-3 mx-auto max-w-md bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[92] p-1.5 rounded-full border border-[#e2e0dc] bg-white/90 backdrop-blur-2xl shadow-[0_18px_44px_-14px_rgba(0,0,0,0.26)] grid grid-cols-4">
      {ITEMS.map((it) => {
        const active = pathname === it.href;
        return (
          <Link key={it.href} href={it.href} aria-label={it.label} title={it.label}
            className={`flex items-center justify-center py-2 rounded-full transition-all active:scale-95 ${
              active ? "text-[#e91e3f] bg-[#e91e3f]/[0.08]" : "text-[#8a8a8a] active:text-[#131313]"
            }`}>
            <svg className="w-[19px] h-[19px]" fill="none" viewBox="0 0 24 24" strokeWidth={active ? 2 : 1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={it.icon} />
            </svg>
          </Link>
        );
      })}
    </nav>
  );
}
