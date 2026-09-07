"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
// 관리자 판정은 공용 가드 하나만 쓴다 — 여기서 ADMIN_USERS 를 또 뒤지면 규칙이 두 곳으로 갈라진다
import { useAdminGuard } from "./ui";

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
      { title: "시즌 패스", href: "/admin/pass" },
      { title: "서포터즈 평가", href: "/admin/supporters" },
      { title: "대회 룸", href: "/admin/room" },
      { title: "경매 목록", href: "/auction" },
      {
        // 📌 9탭 → 4탭 재편 (2026-09). 채널·부스트·퀘스트·인벤토리 역할은 성격별로
        //    정책 / 역할 / 콘텐츠 안으로 접혔고, XP 수동 지급과 XP 로그는 '지급·내역' 하나로 합쳤다.
        //    리더보드는 유저 화면 /level?tab=rank 가 상위호환이라 관리자 쪽에서 뺐다.
        title: "레벨 대시보드",
        href: "/admin/bot",
        children: [
          { title: "정책", href: "/admin/bot?tab=policy" },
          { title: "역할", href: "/admin/bot?tab=roles" },
          { title: "콘텐츠", href: "/admin/bot?tab=content" },
          { title: "지급·내역", href: "/admin/bot?tab=ledger" },
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
          // 모바일 칩 바는 부모를 빼고 children 만 펼치므로, 여기 없으면 시즌 전환으로 갈 길이 없다
          { title: "시즌 전환", href: "/admin/shop?tab=season" },
        ],
      },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // gate 는 쓰지 않는다 — 내비는 권한이 없으면 자리 자체를 비운다 (본문 화면이 안내를 낸다)
  const { isAdmin } = useAdminGuard();

  if (!isAdmin) return null;

  // 경로 + 구분용 쿼리(tab/category)까지 일치해야 활성
  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;

    const want = new URLSearchParams(query || "");
    const wantTab = want.get("tab");
    if (wantTab != null) {
      // ?tab 없이 들어와도 첫 탭이 활성으로 보이도록 화면별 기본 탭을 알고 있어야 한다.
      // 각 화면이 정하는 값이라, 그 화면의 탭 id 가 바뀌면 여기도 같이 고쳐야 한다.
      const DEFAULT_TAB: Record<string, string> = { "/admin/shop": "items", "/admin/bot": "policy" };
      return (searchParams.get("tab") || DEFAULT_TAB[path]) === wantTab;
    }

    const wantCategory = want.get("category");
    if (wantCategory != null) return searchParams.get("category") === wantCategory;

    return true;
  };

  // 📌 대회 룸은 경기 중 화면이라 다크를 유지한다 — 좌측 패널도 함께 어둡게
  const isDark = pathname?.startsWith("/admin/room");

  const linkClass = (active: boolean, child = false) =>
    `relative flex items-center gap-2.5 px-3 py-2 rounded-lg font-bold transition-colors ${child ? "text-[12px] ml-4" : "text-[13px]"} ${
      active
        ? isDark
          ? "text-white bg-[#e91e3f]/25"
          : "text-[#e91e3f] bg-[#e91e3f]/[0.12]"
        : isDark
        ? "text-gray-400 hover:text-white hover:bg-white/[0.06]"
        : "text-[#4b4b4b] hover:text-[#131313] hover:bg-black/[0.06]"
    }`;

  return (
    <>
      {/* ── 데스크톱: 좌측 사이드 패널 ── */}
      <aside className={`hidden lg:block w-60 shrink-0 border-r ${isDark ? "border-white/10 bg-[#0e0e0e]" : "border-black/10 bg-[#edecea]"}`}>
        <nav className="sticky top-24 px-6 py-10 space-y-8">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className={`text-[10px] font-black tracking-[0.28em] uppercase mb-3 ${isDark ? "text-[#ff5c77]" : "text-[#e91e3f]"}`}>{group.label}</div>
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
                        <div className={`mt-0.5 space-y-0.5 border-l ml-3 ${isDark ? "border-white/15" : "border-black/15"}`}>
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
      <div className={`lg:hidden w-full border-b ${isDark ? "border-white/10 bg-[#0e0e0e]" : "border-black/10 bg-[#edecea]"}`}>
        <div className="flex gap-2 overflow-x-auto no-bar px-4 py-3">
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
                    : isDark
                    ? "text-gray-300 border-white/20 hover:text-white hover:border-white/40"
                    : "text-[#3a3a3a] border-black/20 hover:text-[#131313] hover:border-black/40"
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
