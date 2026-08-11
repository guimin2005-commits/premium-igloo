"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ADMIN_USERS } from "@/lib/admins";

// 📌 관리자 영역 공용 좌측 패널 — /admin 하위 전 페이지에 표시 (layout.tsx에서 사용)
//    하위 카테고리가 있는 항목은 트리로 표시, 모바일에서는 상단 가로 스크롤 칩 바로 변형

type NavItem = { title: string; href: string; children?: NavItem[] };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "허브",
    items: [{ title: "대시보드", href: "/admin" }],
  },
  {
    label: "콘텐츠 작성",
    items: [
      { title: "공지사항 작성", href: "/write?category=공지사항" },
      { title: "이벤트 작성", href: "/write?category=이벤트" },
      { title: "대회 등록", href: "/write?category=대회" },
      { title: "구인글 작성", href: "/write?category=구인" },
      { title: "경매 개최", href: "/auction?admin=1" },
    ],
  },
  {
    label: "운영 관리",
    items: [
      { title: "1:1 문의 관리", href: "/support?admin=1" },
      { title: "구인 지원자 관리", href: "/recruit?admin=1" },
      { title: "유저 알림 발송", href: "/admin/notify" },
      { title: "명예의 전당 관리", href: "/admin/honors" },
      { title: "경매 목록", href: "/auction" },
      {
        title: "레벨 대시보드",
        href: "/admin/bot",
        children: [
          { title: "기본 정책", href: "/admin/bot?tab=settings" },
          { title: "역할 설정", href: "/admin/bot?tab=roles" },
          { title: "채널·카테고리", href: "/admin/bot?tab=channels" },
          { title: "기간제 부스트", href: "/admin/bot?tab=boosts" },
          { title: "XP 수동 지급", href: "/admin/bot?tab=grant" },
          { title: "리더보드", href: "/admin/bot?tab=leaderboard" },
          { title: "XP 로그", href: "/admin/bot?tab=logs" },
        ],
      },
      {
        title: "ARCTIC 관리",
        href: "/admin/shop",
        children: [
          { title: "상품 관리", href: "/admin/shop?tab=items" },
          { title: "이미지 배너", href: "/admin/shop?tab=banners" },
          { title: "쿠폰 관리", href: "/admin/shop?tab=coupons" },
          { title: "구매 내역", href: "/admin/shop?tab=orders" },
        ],
      },
    ],
  },
];

export default function AdminNav() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  if (!isAdmin) return null;

  // 경로 + 구분용 쿼리(tab/category)까지 일치해야 활성
  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;

    const want = new URLSearchParams(query || "");
    const wantTab = want.get("tab");
    if (wantTab != null) {
      const defaultTab = path === "/admin/shop" ? "items" : "settings";
      return (searchParams.get("tab") || defaultTab) === wantTab;
    }

    const wantCategory = want.get("category");
    if (wantCategory != null) return searchParams.get("category") === wantCategory;

    return true;
  };

  const linkClass = (active: boolean, child = false) =>
    `relative flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold transition-colors ${child ? "text-[12px] ml-4" : "text-[13px]"} ${
      active ? "text-white bg-[#e91e3f]/[0.12]" : "text-gray-300 hover:text-white hover:bg-white/[0.06]"
    }`;

  return (
    <>
      {/* ── 데스크톱: 좌측 사이드 패널 ── */}
      <aside className="hidden lg:block w-60 shrink-0 border-r border-white/10 bg-[#0e0e0e]">
        <nav className="sticky top-24 px-6 py-10 space-y-8">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-[10px] font-black tracking-[0.28em] text-[#e91e3f] uppercase mb-3">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const parentActive = isActive(item.href) && !item.children?.some((c) => isActive(c.href));
                  return (
                    <div key={item.href}>
                      <Link href={item.href} className={linkClass(item.children ? parentActive : isActive(item.href))}>
                        {(item.children ? parentActive : isActive(item.href)) && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#e91e3f] rounded-full"></span>
                        )}
                        <span className="truncate">{item.title}</span>
                      </Link>
                      {item.children && (
                        <div className="mt-0.5 space-y-0.5 border-l border-white/15 ml-3">
                          {item.children.map((child) => {
                            const active = isActive(child.href);
                            return (
                              <Link key={child.href} href={child.href} className={linkClass(active, true)}>
                                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3.5 bg-[#e91e3f] rounded-full"></span>}
                                <span className="truncate">{child.title}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── 모바일: 상단 가로 스크롤 칩 바 (하위 카테고리는 펼쳐서 표시) ── */}
      <div className="lg:hidden w-full border-b border-white/10 bg-[#0e0e0e]">
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {NAV_GROUPS.flatMap((g) => g.items).flatMap((item) =>
            item.children
              ? item.children.map((c) => ({ title: `${item.title} · ${c.title}`, href: c.href }))
              : [item]
          ).map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${
                  active
                    ? "bg-[#e91e3f] text-white border-[#e91e3f]"
                    : "text-gray-200 border-white/20 hover:text-white hover:border-white/40"
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
