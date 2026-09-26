"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
// 관리자 판정은 공용 가드 하나만 쓴다 — 여기서 ADMIN_USERS 를 또 뒤지면 규칙이 두 곳으로 갈라진다
import { useAdminGuard } from "./ui";
import { ICON_PATHS } from "../components/Icons";

// 📌 관리자 좌측 메뉴 (2026-09 개편)
//    · 페이지만 둔다. 정책 · 역할 같은 하위 탭은 각 페이지 머리의 탭 한 줄에만 있다 —
//      예전엔 좌측 트리 · 위 탭 · 그 아래 작은 탭까지 메뉴가 세 겹이었다.
//    · 확인할 것이 쌓인 곳(답변 안 한 문의 · 심사 중 지원)은 옆에 빨간 숫자.
//    · PC 는 왼쪽에 붙은 칸, 모바일은 본문 위 "지금 페이지 ▾" 단추로 여는 판.
type NavItem = { title: string; href: string; icon: string; match?: (p: string, tab: string | null, cat: string | null) => boolean; count?: "inquiry" | "apply" };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { label: "허브", items: [{ title: "대시보드", href: "/admin", icon: ICON_PATHS.home }] },
  {
    label: "작성",
    items: [
      // 글 종류(공지 · 이벤트 · 대회 · 구인)는 글쓰기 화면 머리의 탭에서 고른다
      { title: "글쓰기", href: "/write?category=공지사항", icon: ICON_PATHS.megaphone, match: (p) => p === "/write" },
      // 경매 개최 · 목록은 공개 경매 화면에서 떼어 관리자 화면(/admin/auction)으로 옮겼다 — 공개 화면은 보기만
      { title: "경매 개최", href: "/admin/auction?tab=new", icon: ICON_PATHS.flag, match: (p, tab) => p === "/admin/auction" && tab === "new" },
    ],
  },
  {
    label: "운영",
    items: [
      { title: "1:1 문의", href: "/support?admin=1", icon: ICON_PATHS.chat, count: "inquiry" },
      { title: "구인 지원자", href: "/recruit?admin=1", icon: ICON_PATHS.briefcase, count: "apply" },
      { title: "알림 발송", href: "/admin/notify", icon: ICON_PATHS.bell },
      { title: "명예의 전당", href: "/admin/honors", icon: ICON_PATHS.trophy },
      { title: "서포터즈 평가", href: "/admin/supporters", icon: ICON_PATHS.shieldCheck },
      { title: "대회 룸", href: "/admin/room", icon: ICON_PATHS.users },
      { title: "경매 목록", href: "/admin/auction", icon: ICON_PATHS.eye, match: (p, tab) => p === "/admin/auction" && tab !== "new" },
    ],
  },
  {
    label: "SYSTEM : LEVEL",
    items: [
      { title: "레벨 설정", href: "/admin/bot", icon: ICON_PATHS.chart },
      { title: "시즌 패스", href: "/admin/pass", icon: ICON_PATHS.star },
    ],
  },
  {
    label: "ARCTIC",
    items: [
      { title: "상점 관리", href: "/admin/shop", icon: ICON_PATHS.bag, match: (p, tab) => p === "/admin/shop" && tab !== "orders" },
      { title: "구매 내역", href: "/admin/shop?tab=orders", icon: ICON_PATHS.receipt, match: (p, tab) => p === "/admin/shop" && tab === "orders" },
    ],
  },
];

export default function AdminNav() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  // gate 는 쓰지 않는다 — 내비는 권한이 없으면 자리 자체를 비운다 (본문 화면이 안내를 낸다)
  const { isAdmin } = useAdminGuard();
  const [open, setOpen] = useState(false); // 모바일 메뉴 판
  const [counts, setCounts] = useState<{ inquiry: number; apply: number }>({ inquiry: 0, apply: 0 });

  // 확인할 것 개수 — 페이지를 옮길 때마다 새로 센다 (처리하고 오면 줄어 있게)
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    Promise.all([
      fetch("/api/inquiry", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/user/applies?admin=true", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([inq, app]) => {
      if (!alive) return;
      const inquiries = Array.isArray(inq?.data) ? inq.data : [];
      const applies = Array.isArray(app?.data) ? app.data : [];
      setCounts({
        inquiry: inquiries.filter((i: any) => i.status === "접수 중").length,
        apply: applies.filter((a: any) => (a.status || "심사 중") === "심사 중").length,
      });
    });
    return () => { alive = false; };
  }, [isAdmin, pathname]);

  useEffect(() => { setOpen(false); }, [pathname, searchParams]);

  if (!isAdmin) return null;

  const tab = searchParams.get("tab");
  const cat = searchParams.get("category");
  const all = NAV_GROUPS.flatMap((g) => g.items);
  const queryMatch = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;
    if (!query) return true;
    // ?admin=1 처럼 화면을 가르는 쿼리까지 맞아야 켠다 (경매 개최 ↔ 경매 목록)
    return Array.from(new URLSearchParams(query).entries()).every(([k, v]) => searchParams.get(k) === v);
  };
  const isActive = (it: NavItem): boolean => {
    if (it.match) return it.match(pathname, tab, cat);
    const [path, query] = it.href.split("?");
    if (query) return queryMatch(it.href);
    // 쿼리 없는 항목은 같은 경로의 쿼리 달린 항목이 켜져 있으면 양보한다 (/auction ↔ /auction?admin=1)
    return pathname === path && !all.some((o) => o !== it && !o.match && o.href.startsWith(path + "?") && queryMatch(o.href));
  };
  const current = all.find(isActive);

  // 📌 대회 룸은 경기 중 화면이라 다크를 유지한다 — 메뉴도 함께 어둡게
  const dark = pathname.startsWith("/admin/room");

  const itemCls = (active: boolean) =>
    `flex items-center gap-2.5 h-9 px-3 rounded-xl text-[14px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${
      active
        ? dark ? "bg-white text-[#131313] font-bold" : "bg-[#131313] text-white font-bold"
        : dark ? "text-gray-300 hover:text-white hover:bg-white/[0.06]" : "text-[#5a5a5a] hover:text-[#131313] hover:bg-[#f2f2f2]"
    }`;

  const list = (
    <nav aria-label="관리자 메뉴" className="px-3 py-5">
      {NAV_GROUPS.map((g, gi) => (
        <div key={g.label} className={gi > 0 ? "mt-4" : ""}>
          <p className={`px-3 mb-1 text-[11px] font-black tracking-[0.04em] ${dark ? "text-gray-500" : "text-[#8a8a8a]"}`}>{g.label}</p>
          {g.items.map((it) => {
            const active = isActive(it);
            const n = it.count ? counts[it.count] : 0;
            return (
              <Link key={it.href} href={it.href} className={itemCls(active)} aria-current={active ? "page" : undefined}>
                {/* 한글 글자 몸이 줄 가운데보다 위에 앉아 아이콘을 1px 올린다 (모바일 서랍과 같은 보정) */}
                <svg aria-hidden viewBox="0 0 24 24" className="w-[17px] h-[17px] shrink-0 -translate-y-px" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={it.icon} />
                </svg>
                <span className="min-w-0 truncate">{it.title}</span>
                {n > 0 && <span className={`ml-auto text-[12px] font-black tabular-nums ${active ? "" : "text-[#e91e3f]"}`}>{n}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* ── PC: 왼쪽에 붙은 칸 — 헤더 아래부터 화면 끝까지, 메뉴만 따로 스크롤 ── */}
      <aside className={`hidden lg:block w-[232px] shrink-0 border-r ${dark ? "border-white/10 bg-[#0e0e0e]" : "border-[#ededed] bg-white"}`}>
        <div className="sticky top-16 md:top-[72px] max-h-[calc(100vh-72px)] overflow-y-auto no-bar">{list}</div>
      </aside>

      {/* ── 모바일: 지금 페이지 이름 단추 → 메뉴 판 ── */}
      <div className={`lg:hidden w-full border-b px-4 py-2.5 ${dark ? "border-white/10 bg-[#0e0e0e]" : "border-[#ededed] bg-white"}`}>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open}
          className={`w-full h-10 px-3.5 rounded-full border flex items-center gap-2 text-[14px] font-bold outline-none ${dark ? "border-white/20 text-white" : "border-[#a3a3a3] text-[#131313]"}`}>
          <span className={`text-[12px] ${dark ? "text-gray-400" : "text-[#8a8a8a]"}`}>관리자</span>
          <span className="min-w-0 truncate">{current?.title || "메뉴"}</span>
          {counts.inquiry + counts.apply > 0 && <span className="text-[12px] font-black text-[#e91e3f] tabular-nums">{counts.inquiry + counts.apply}</span>}
          <svg aria-hidden viewBox="0 0 24 24" className="ml-auto w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </button>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-[120] flex items-end bg-black/40" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="관리자 메뉴" onClick={(e) => e.stopPropagation()}
            className={`w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] ${dark ? "bg-[#141414]" : "bg-white"}`}>
            {list}
          </div>
        </div>
      )}
    </>
  );
}
