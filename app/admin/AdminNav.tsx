"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
// 관리자 판정은 공용 가드 하나만 쓴다 — 여기서 ADMIN_USERS 를 또 뒤지면 규칙이 두 곳으로 갈라진다
import { useAdminGuard } from "./ui";
import { ICON_PATHS } from "../components/Icons";
import { NAV_GROUPS, ADMIN_PAGES, EMPTY_COUNTS, ADMIN_COUNTS_EVENT, isNavActive, type AdminCounts } from "./adminIndex";
import AdminSearch, { SearchBox, SearchButton } from "./AdminSearch";

// 📌 관리자 좌측 메뉴 (2026-09 개편 · 2026-10-17 정리 20칸 → 18칸)
//    · 페이지만 둔다. 정책 · 역할 같은 하위 탭은 각 페이지 머리의 탭 한 줄에만 있다 —
//      예전엔 좌측 트리 · 위 탭 · 그 아래 작은 탭까지 메뉴가 세 겹이었다.
//    · 칸 목록은 app/admin/adminIndex.ts 한 곳 — 기능 검색(AdminSearch)과 같은 목록이다.
//    · 확인할 것이 쌓인 곳(미답변 문의 · 심사 중 지원 · 구매 처리 대기 · 서포터즈 미처리 신고)은 옆에 빨간 숫자 —
//      개수만 세는 /api/admin/counts 하나로 받는다(페이지를 옮길 때 · 검색을 열 때 · 화면이 "igloo:admin-counts" 를 알릴 때).
//    · PC 는 왼쪽에 붙은 칸(맨 위 기능 검색), 모바일은 본문 위 "지금 페이지 ▾" 단추 + 돋보기로 여는 판.
const toCount = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
const badge = (n: number) => (n > 99 ? "99+" : String(n));

export default function AdminNav() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();
  // gate 는 쓰지 않는다 — 내비는 권한이 없으면 자리 자체를 비운다 (본문 화면이 안내를 낸다)
  const { isAdmin } = useAdminGuard();
  // 모바일 메뉴 판 — 연 주소에서만 열려 있다(주소가 바뀌면 저절로 닫힌다)
  const loc = `${pathname}?${searchParams.toString()}`;
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === loc;
  const [searchOpen, setSearchOpen] = useState(false);
  const [counts, setCounts] = useState<AdminCounts>(EMPTY_COUNTS);

  // 확인할 것 개수 — 처리하고 오면 줄어 있게 다시 센다
  const loadCounts = useCallback(() => {
    return fetch("/api/admin/counts", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return null;
        return { inquiry: toCount(d.inquiry), apply: toCount(d.apply), orders: toCount(d.orders), supportReports: toCount(d.supportReports) };
      })
      .catch(() => null);
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const run = () => { loadCounts().then((c) => { if (alive && c) setCounts(c); }); };
    run();
    window.addEventListener(ADMIN_COUNTS_EVENT, run);
    return () => { alive = false; window.removeEventListener(ADMIN_COUNTS_EVENT, run); };
  }, [isAdmin, pathname, loadCounts]);

  const openSearch = useCallback(() => {
    setOpenAt(null);
    setSearchOpen(true);
    loadCounts().then((c) => { if (c) setCounts(c); });
  }, [loadCounts]);
  const onSearchChange = useCallback((v: boolean) => { if (v) openSearch(); else setSearchOpen(false); }, [openSearch]);

  if (!isAdmin) return null;

  const current = ADMIN_PAGES.find((p) => isNavActive(p, pathname, searchParams));
  const total = counts.inquiry + counts.apply + counts.orders + counts.supportReports;

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
            const active = current?.id === it.id;
            const n = it.count ? counts[it.count] : 0;
            return (
              <Link key={it.id} href={it.href} onClick={() => setOpenAt(null)} className={itemCls(active)} aria-current={active ? "page" : undefined}>
                {/* 한글 글자 몸이 줄 가운데보다 위에 앉아 아이콘을 1px 올린다 (모바일 서랍과 같은 보정) */}
                <svg aria-hidden viewBox="0 0 24 24" className="w-[17px] h-[17px] shrink-0 -translate-y-px" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[it.icon]} />
                </svg>
                <span className="min-w-0 truncate">{it.label}</span>
                {n > 0 && (
                  <span className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#e91e3f] text-white text-[11px] font-black tabular-nums leading-5 text-center">{badge(n)}</span>
                )}
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
        <div className="sticky top-16 md:top-[72px] max-h-[calc(100vh-72px)] overflow-y-auto no-bar">
          <div className="px-3 pt-5">
            <SearchBox onOpen={openSearch} dark={dark} />
          </div>
          {list}
        </div>
      </aside>

      {/* ── 모바일: 지금 페이지 이름 단추 + 돋보기 → 메뉴 판 / 검색 판 ── */}
      <div className={`lg:hidden w-full border-b px-4 py-2.5 flex items-center ${dark ? "border-white/10 bg-[#0e0e0e]" : "border-[#ededed] bg-white"}`}>
        <button type="button" onClick={() => setOpenAt(loc)} aria-expanded={open}
          className={`flex-1 min-w-0 h-10 px-3.5 rounded-full border flex items-center gap-2 text-[14px] font-bold outline-none ${dark ? "border-white/20 text-white" : "border-[#a3a3a3] text-[#131313]"}`}>
          <span className={`shrink-0 text-[12px] ${dark ? "text-gray-400" : "text-[#8a8a8a]"}`}>관리자</span>
          <span className="min-w-0 truncate">{current?.label || "메뉴"}</span>
          {total > 0 && <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-[#e91e3f] text-white text-[11px] font-black tabular-nums leading-5 text-center">{badge(total)}</span>}
          <svg aria-hidden viewBox="0 0 24 24" className="ml-auto shrink-0 w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
        </button>
        <div className="ml-2 shrink-0">
          <SearchButton onOpen={openSearch} dark={dark} />
        </div>
      </div>
      {open && (
        <div className="lg:hidden fixed inset-0 z-[120] flex items-end bg-black/40" onClick={() => setOpenAt(null)}>
          <div role="dialog" aria-modal="true" aria-label="관리자 메뉴" onClick={(e) => e.stopPropagation()}
            className={`w-full max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)] ${dark ? "bg-[#141414]" : "bg-white"}`}>
            {list}
          </div>
        </div>
      )}

      <AdminSearch open={searchOpen} onOpenChange={onSearchChange} counts={counts} />
    </>
  );
}
