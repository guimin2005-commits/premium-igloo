"use client";

import { useState, useEffect, useLayoutEffect, useRef, FormEvent, RefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ICON_PATHS } from "./components/Icons";
import AdminNav from "./admin/AdminNav";
import ScrollLock from "./components/ScrollLock";
import { useArcticFromLevel, ARCTIC_FROM_KEY, ARCTIC_ORIGIN_KEY } from "./arctic/fromLevel";
import { agoLabel } from "@/lib/ago";

// 서버에서는 layout effect 가 돌지 않으므로 경고 없이 effect 로 대신한다
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import { VerifyIcon, VerifyBadge } from "./components/VerifyMark";

// 📌 헤더에서 내려오는 카드(알림·내 프로필)
//    헤더 자체가 backdrop-blur를 갖고 있어, 그 안에 두면 카드가 뒤 배경을 읽지 못해 블러가 걸리지 않는다.
//    (backdrop-filter를 가진 조상은 backdrop root가 되어 자손은 그 안쪽만 샘플링한다)
//    그래서 body로 띄우고, 버튼 위치를 따라가게 한다.
function HeaderPopover({
  anchorRef, panelRef, className, children, offset = 10,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
  className: string;
  children: ReactNode;
  offset?: number;
}) {
  const [pos, setPos] = useState<{ top: number; right: number; narrow: boolean } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // 좁은 화면에서는 버튼에 매달지 않고 화면 폭에 맞춘다 (구석에 몰려 답답해 보이지 않게)
      setPos({ top: r.bottom + offset, right: Math.max(12, window.innerWidth - r.right), narrow: window.innerWidth < 640 });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [anchorRef, offset]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      style={
        pos.narrow
          ? { position: "fixed", top: pos.top, left: 12, right: 12, zIndex: 45 }
          : { position: "fixed", top: pos.top, right: pos.right, zIndex: 45 }
      }
      className={className}
    >
      {children}
    </div>,
    document.body
  );
}

const ADMIN_USERS = ["elahw.06"];

// 📌 관리자 패널(좌측)을 띄울 경로 — /admin 하위 + 관리자만 쓰는 외부 페이지들
const ADMIN_SURFACE_PATHS = ["/write"];
// ?admin=1 일 때만 관리자 화면이 되는 페이지
const ADMIN_QUERY_PATHS = ["/support", "/recruit", "/auction"];

// 📌 페이지 전환 시 상단 크림슨 프로그레스 바
function RouteProgress({ pathname }: { pathname: string }) {
  const [animKey, setAnimKey] = useState(0);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setAnimKey((k) => k + 1);
  }, [pathname]);

  if (animKey === 0) return null;
  return (
    <div key={animKey} className="fixed top-0 left-0 right-0 z-[300] h-[2px] pointer-events-none">
      <div className="h-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] shadow-[0_0_10px_rgba(233,30,63,0.7)] animate-[routeBar_0.7s_cubic-bezier(0.16,1,0.3,1)_forwards]"></div>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes routeBar {
          0% { width: 0%; opacity: 1; }
          70% { width: 100%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
      `}} />
    </div>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isGuestInquiryOpen, setIsGuestInquiryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 📌 내리면 상단 바가 한 줄로 접힌다.
  //    접히는 지점과 펴지는 지점을 벌려 둔다 — 한 점으로 두면 경계에서 두 줄↔한 줄이 떨리며 깜빡인다.
  const [scrolledRaw, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled((was) => (was ? window.scrollY > 24 : window.scrollY > 96));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  
  // 📌 쿠폰함은 페이지(/profile/coupons)다 — 예전 모달 · 여는 이벤트(igloo:open-coupons)는 없앴다

  const [guestContent, setGuestContent] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const pathname = usePathname();
  const router = useRouter();
  
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);

  const isVerifyPage = pathname === "/verify";
  // 📌 ARCTIC(/shop) 은 라이트 테마에 자체 헤더 — 전역 크롬(헤더·모바일 독·푸터·하단 패딩)을 통째로 넘긴다.
  // 스토어에서 넘어온 프로필은 스토어 독을 그대로 쓴다 — 전역 독과 겹치므로 이쪽을 비운다.
  // 헤더·푸터는 그대로 두므로 isShopPage 에는 넣지 않는다.

  // 메뉴 활성 판정 — 항목 경로에 쿼리가 붙어 있으면(예: /level?tab=pass)
  // pathname 만으로는 절대 맞지 않고, 반대로 /level 항목이 ARCTIC 탭에서도 켜진다.
  const isMenuActive = (itemPath?: string) => {
    if (!itemPath) return false;
    const [base, qs] = itemPath.split("?");
    if (pathname !== base) return false;
    if (!qs) return !searchParams.get("tab"); // 쿼리 없는 항목은 기본 탭일 때만
    return new URLSearchParams(qs).get("tab") === searchParams.get("tab");
  };

  const isShopPage = pathname === "/arctic" || pathname?.startsWith("/arctic/");
  const arcticFromLevel = useArcticFromLevel();
  // 📌 지금 있는 세계 — 브랜드 옆 한 칸. 줄을 따로 만들지 않는다.
  //    레벨 탭에서 ARCTIC 으로 들어왔을 때만 넓은 화면에서 앞에 "LEVEL ›" 을 붙여 돌아갈 길을 둔다
  //    (상단 메뉴에서는 둘이 나란한 곳이라 붙이지 않는다 — app/arctic/fromLevel.ts)
  const section: { name: ReactNode; href: string; parent?: { name: string; href: string } } | null = isShopPage
    ? { name: <>ARCT<span className="text-[#e91e3f]">I</span>C</>, href: "/arctic", parent: arcticFromLevel ? { name: "LEVEL", href: "/level" } : undefined }
    : (pathname === "/level" || pathname?.startsWith("/level/"))
      ? { name: <>SYSTEM <span className="text-[#e91e3f]">:</span> LEVEL</>, href: "/level" }
      : null;
  // 📌 흰 바탕 페이지 — 화이트 & 블랙으로 옮긴 곳. 종이색 라이트와 구분한다.
  //    경매·대회·명예의 전당은 일부러 개성 있게 만든 화면이라 여기 넣지 않는다.
  const WHITE_ROOTS = ["/notice", "/event", "/recruit", "/faq", "/support", "/booster", "/level", "/profile", "/verify", "/policy"];
  const isWhitePage = isShopPage || pathname === "/" || WHITE_ROOTS.some((r) => pathname === r || !!pathname?.startsWith(r + "/"));
  // 알약 변형은 없앴다 — 내리면 로고 줄과 카테고리 줄이 한 줄로 접힌다
  const scrolled = scrolledRaw;
  // ARCTIC 에서 넘어온 내 정보(와 그 하위) — 스토어 독을 그대로 두므로 전역 독은 숨긴다
  const isArcticProfile = (pathname === "/profile" || !!pathname?.startsWith("/profile/")) && searchParams.get("from") === "arctic";
  // ARCTIC 을 벗어나면 "레벨에서 왔다" 표시를 지운다 (ARCTIC 에서 넘어간 내 정보는 ARCTIC 의 연장이라 둔다)
  useEffect(() => {
    if (isShopPage || isArcticProfile) return;
    try { sessionStorage.removeItem(ARCTIC_FROM_KEY); } catch {}
  }, [isShopPage, isArcticProfile]);
  // 📌 ARCTIC 에 들어온 곳을 적는다 (app/arctic/fromLevel.ts useArcticOrigin 이 읽는다).
  //    ARCTIC 밖 → 안으로 넘어오는 순간 직전 주소를 적고, ARCTIC 을 벗어나면 지운다. ARCTIC 에서 넘어간 내 정보는 ARCTIC 의 연장.
  //    상점 화면(자식)이 effect 에서 읽기 전에 적혀 있도록 layout effect 로.
  const lastPathRef = useRef<{ path: string; arctic: boolean } | null>(null);
  const qsNow = searchParams.toString();
  const fullPath = `${pathname || ""}${qsNow ? `?${qsNow}` : ""}`;
  useIsoLayoutEffect(() => {
    const inArctic = isShopPage || isArcticProfile;
    const prev = lastPathRef.current;
    try {
      if (inArctic && prev && !prev.arctic) sessionStorage.setItem(ARCTIC_ORIGIN_KEY, prev.path);
      if (!inArctic) sessionStorage.removeItem(ARCTIC_ORIGIN_KEY);
    } catch {}
    lastPathRef.current = { path: fullPath, arctic: inArctic };
  }, [fullPath, isShopPage, isArcticProfile]);
  const isLightPage = isWhitePage || pathname === "/profile" || pathname?.startsWith("/profile/") || pathname === "/level" || pathname?.startsWith("/level/") || (pathname?.startsWith("/admin") && !pathname.startsWith("/admin/room")) || pathname === "/write" || pathname === "/supporters" || pathname?.startsWith("/supporters/");   // 라이트 톤만 따라가는 페이지 (SYSTEM:LEVEL·관리자 화면은 ARCTIC 테마)
  // 📌 경매방 안에서는 모바일 하단 탭을 숨긴다.
  //    입찰·채팅 바가 화면 아래에 붙는데 그 위에 전역 탭까지 있으면 잘못 눌러 방을 나가게 된다.
  const isAuctionRoom = /^\/auction\/[^/]+$/.test(pathname || "");
  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isSupporter = userSession?.isSupporter || false;
  const isAdmin = status === "authenticated" && userSession?.name && ADMIN_USERS.includes(userSession.name);

  // 📌 ARCTIC 공개 여부 — 비공개면 관리자에게만 메뉴에 노출한다
  const [shopPublic, setShopPublic] = useState(false);
  const [levelPublic, setLevelPublic] = useState(false);
  useEffect(() => {
    fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setShopPublic(!!d?.data?.shopPublic); setLevelPublic(!!d?.data?.levelPublic); })
      .catch(() => {});
  }, []);

  // 📌 관리자 패널 표시 여부 — 관리자 전용 화면에서만 좌측 패널을 붙인다
  const isAdminSurface =
    isAdmin &&
    (pathname?.startsWith("/admin") ||
      ADMIN_SURFACE_PATHS.includes(pathname || "") ||
      (ADMIN_QUERY_PATHS.includes(pathname || "") && searchParams.get("admin") === "1"));


  // 📌 카테고리 그룹화: 큰 카테고리 → 세부 카테고리 (메가 메뉴)
  const rawCategoryGroups = [
    { name: "소식", desc: "고급 이글루의 최신 소식", tagline: "고급 이글루의 소식", items: [{ name: "공지사항", path: "/notice", desc: "최신 소식과 주요 안내" }, { name: "이벤트", path: "/event", desc: "다양한 이벤트와 혜택" }, { name: "구인", path: "/recruit", desc: "스태프 및 서포터즈 모집" }] },
    { name: "콘텐츠", desc: "서버의 핵심 콘텐츠", tagline: "서버의 핵심 콘텐츠", items: [{ name: "SYSTEM : LEVEL", path: "/level", desc: "레벨 시스템 및 XP 대시보드" }, { name: "ARCTIC", path: "/arctic", desc: "XP로 역할과 혜택을 구매" }, { name: "대회", path: "/tournament", desc: "e스포츠 리그 허브" }, { name: "경매", path: "/auction", desc: "실시간 포인트 경매 관전 및 참여" }, { name: "명예의 전당", path: "/hall-of-fame", desc: "역대 대회 우승 기록" }, { name: "부스터 혜택", path: "/booster", desc: "서버 부스터 전용 혜택 안내" }] },
    { name: "지원", desc: "도움이 필요하신가요?", tagline: "무엇을 도와드릴까요?", items: [{ name: "1:1 문의", path: "/support", desc: "불편 사항 및 문의 접수" }, { name: "FAQ", path: "/faq", desc: "자주 묻는 질문" }] },
  ];

  // SYSTEM : LEVEL 이 비공개면 레벨·ARCTIC 둘 다, ARCTIC 만 비공개면 ARCTIC 만 일반 유저 메뉴에서 제외 (관리자는 그대로)
  const levelOpen = levelPublic || isAdmin;

  // 📌 모바일 독 — 카테고리 줄(소식 · 이벤트 · 대회 · 경매 · 고객센터)과 겹치지 않는 것만.
  //    세계를 오가는 길과 내 것으로 채운다. 닫힌 세계는 자리에서 빠진다.
  //    알림은 상단 바 종이 맡는다 (새 알림 점 · 미리보기 · 알림함 열기) — 독에 또 두면 한 화면에 알림이 둘이 된다.
  //    📌 늘 다섯 칸 — 홈 · 내 정보는 양 끝 고정, 가운데 세 칸은 열린 세계부터 채운다.
  //       LEVEL · ARCTIC 이 닫혀 있으면(공개 전 일반 유저) 대회 · 소식 · 이벤트가 그 자리를 잇는다.
  //       네 칸이면 비어 보이고, 공개 전에는 두 칸뿐이었다.
  const dockMid = [
    ...(levelOpen ? [{ name: "SYSTEM : LEVEL", path: "/level", icon: ICON_PATHS.chart }] : []),
    ...(levelOpen && (shopPublic || isAdmin) ? [{ name: "ARCTIC", path: "/arctic", icon: ICON_PATHS.bag }] : []),
    { name: "대회", path: "/tournament", icon: ICON_PATHS.trophy },
    { name: "소식", path: "/notice", icon: ICON_PATHS.megaphone },
    { name: "이벤트", path: "/event", icon: ICON_PATHS.gift },
  ].slice(0, 3);
  const dockTabs = [
    { name: "홈", path: "/", icon: ICON_PATHS.home },
    ...dockMid,
    { name: "내 정보", path: "/profile", icon: ICON_PATHS.user },
  ];

  const categoryGroups = rawCategoryGroups.map((g) => ({
    ...g,
    items: g.items.filter((it) => {
      if (it.path === "/level") return true; // 비공개여도 메뉴엔 남긴다 — 들어가면 예고 화면
      if (it.name === "ARCTIC") return levelOpen && (shopPublic || isAdmin);
      // 로그인한 사람은 내 정보 › 서버 부스터로 본다 — 메뉴에 두 번 두지 않는다
      if (it.path === "/booster") return status !== "authenticated";
      return true;
    }),
  }));

  // 로고 줄·도구 줄의 높이 — 내리면 한 줄로 접히므로 둘이 늘 같아야 한다
  const barH = scrolled ? "h-14 md:h-[60px]" : "h-16 md:h-[72px]";

  // 📌 점검 모드 — 관리자 외에는 점검 화면 표시
  const [isMaintenance, setIsMaintenance] = useState(false);
  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsMaintenance(!!d.maintenance))
      .catch(() => {});
  }, [pathname]);

  // 📌 알림 센터 — 내 문의에 답변이 달리면 종 아이콘에 빨간 점
  const [notifications, setNotifications] = useState<any[]>([]);
  const [adminNotifs, setAdminNotifs] = useState<any[]>([]);
  const [seenNotifIds, setSeenNotifIds] = useState<Set<string>>(new Set());
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("seenAnswerIds") || "[]");
      if (Array.isArray(stored)) setSeenNotifIds(new Set(stored));
    } catch {}
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        const answered = list
          .filter((i: any) => i.status === "답변 완료")
          .sort((a: any, b: any) => new Date(b.answeredAt || b.updatedAt || b.createdAt).getTime() - new Date(a.answeredAt || a.updatedAt || a.createdAt).getTime());
        setNotifications(answered);
      })
      .catch(() => {});

    // 📌 관리자 발송 알림 (경고·안내 등)
    const uid = (session.user as any)?.id;
    const qs = `user=${encodeURIComponent(session.user.name)}${uid ? `&id=${encodeURIComponent(uid)}` : ""}`;
    fetch(`/api/notifications?${qs}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data?.data)) setAdminNotifs(data.data); })
      .catch(() => {});
  }, [status, session?.user?.name, pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (notifRef.current?.contains(t) || notifPanelRef.current?.contains(t)) return;
      setIsNotifOpen(false);
    };
    if (isNotifOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isNotifOpen]);

  // 📌 전체 삭제(누르면 바로) — 운영팀 알림은 서버에서 지우고(본인 것만), 문의 답변은 문의 내역에 남으니 종 목록에서만 치운다
  const [clearedAnswerIds, setClearedAnswerIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("clearedAnswerIds") || "[]");
      if (Array.isArray(stored)) setClearedAnswerIds(new Set(stored));
    } catch {}
  }, []);
  const visibleAnswers = notifications.filter((n) => !clearedAnswerIds.has(n._id));
  const clearAllNotifs = async () => {
    try { await fetch("/api/notifications?mine=all", { method: "DELETE" }); } catch {}
    setAdminNotifs([]);
    const next = new Set(clearedAnswerIds);
    notifications.forEach((n) => next.add(n._id));
    setClearedAnswerIds(next);
    try { localStorage.setItem("clearedAnswerIds", JSON.stringify(Array.from(next).slice(-300))); } catch {}
  };
  // 종 목록 — 운영팀 알림 · 문의 답변을 받은 시각 순으로 한 줄에
  const bellItems = [
    ...adminNotifs.map((n) => ({ key: n._id, kind: "admin", href: `/profile/notice/${n._id}`, chip: n.type || "안내", warn: n.type === "경고" || n.type === "제재", unread: !n.read, title: n.title, at: n.createdAt })),
    ...visibleAnswers.map((n) => ({ key: n._id, kind: "answer", href: "/profile/inquiry", chip: "답변 완료", warn: false, unread: !seenNotifIds.has(n._id), title: n.title || n.content?.slice(0, 40) || "문의 내역", at: n.answeredAt || n.updatedAt || n.createdAt })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);
  const bellChip = (it: { kind: string; warn: boolean }) =>
    it.kind === "answer" ? (isLightPage ? "bg-emerald-500/10 text-emerald-700" : "bg-emerald-500/10 text-emerald-400")
    : it.warn ? (isLightPage ? "bg-[#e91e3f]/10 text-[#d01634]" : "bg-[#e91e3f]/15 text-[#ff5c77]")
    : (isLightPage ? "bg-[#131313]/[0.06] text-[#5a5a5a]" : "bg-white/[0.08] text-gray-300");

  const unreadAdminCount = adminNotifs.filter((n) => !n.read).length;
  const unseenCount = visibleAnswers.filter((n) => !seenNotifIds.has(n._id)).length + unreadAdminCount;

  const markNotifsSeen = () => {
    const next = new Set(seenNotifIds);
    notifications.forEach((n) => next.add(n._id));
    setSeenNotifIds(next);
    try { localStorage.setItem("seenAnswerIds", JSON.stringify(Array.from(next).slice(-200))); } catch {}
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (profileDropdownRef.current?.contains(t) || profilePanelRef.current?.contains(t)) return;
      setIsProfileOpen(false);
    };
    if (isProfileOpen) { document.addEventListener("mousedown", handleClickOutside); }
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [isProfileOpen]);

  useEffect(() => {
    setMounted(true);
    if (error === "AccessDenied") { alert("접근이 거부되었습니다."); setIsLoginModalOpen(false); }
  }, [error]);

  // 📌 모바일 메뉴 닫힘 애니메이션 — 바로 언마운트하면 옆으로 사라지는 모션이 안 보이므로
  //    isMenuClosing 동안 slide-out을 재생한 뒤 실제로 닫는다.
  const [isMenuClosing, setIsMenuClosing] = useState(false);
  const menuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeMobileMenu = () => {
    if (menuCloseTimer.current) return; // 이미 닫히는 중이면 무시
    setIsMenuClosing(true);
    menuCloseTimer.current = setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsMenuClosing(false);
      menuCloseTimer.current = null;
    }, 260);
  };

  useEffect(() => {
    // 페이지가 바뀌면(링크 이동) 애니메이션을 기다리지 않고 즉시 정리
    if (menuCloseTimer.current) { clearTimeout(menuCloseTimer.current); menuCloseTimer.current = null; }
    setIsMobileMenuOpen(false);
    setIsMenuClosing(false);
  }, [pathname]);

  // 📌 모바일 메뉴 열림 시 배경 스크롤 잠금.
  //    ⚠️ body가 아니라 html(뷰포트)에 걸어야 한다 — body에 overflow를 주면 body가 스크롤
  //    컨테이너로 승격되어 전역 sticky(알약 헤더 등)가 기준을 잃고 화면에서 사라진다.
  useEffect(() => {
    document.documentElement.style.overflowY = isMobileMenuOpen ? "hidden" : "";
    return () => { document.documentElement.style.overflowY = ""; };
  }, [isMobileMenuOpen]);

  // 📌 모바일 메뉴 — Esc로 닫기 (좁은 창의 PC 브라우저에서도 열리므로)
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeMobileMenu(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      // 약관 페이지는 미인증이어도 열린다 — 인증 화면의 '전문 보기'가 여기로 오는데, 되돌려보내면 읽을 수가 없다
      if (isVerified === false && !isVerifyPage && pathname !== "/policy") router.push("/verify");
      else if (isVerified === true && hasScrimRole === true && isVerifyPage) router.replace("/");
    }
  }, [status, session, pathname, router, isVerified, hasScrimRole, isVerifyPage]);

  const handleGuestInquiry = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inquiryData = { user: "비회원 (게스트)", mainType: "비회원 문의", content: guestContent, email: guestEmail };
    const res = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inquiryData) });
    if (res.ok) { alert("문의가 접수되었습니다."); setIsGuestInquiryOpen(false); setGuestContent(""); setGuestEmail(""); } 
    else { alert("오류가 발생했습니다."); }
  };

  return (
    <div className={`flex flex-col min-h-screen ${isWhitePage ? "bg-white" : isLightPage ? "bg-[#f4f3f2]" : "bg-[#090909]"}`}>
      <ScrollLock />
      <RouteProgress pathname={pathname} />
      {/* 📌 경매방 모바일에서는 전역 헤더를 감춘다 — 경매 바가 자체 뒤로가기를 갖고 있고,
             헤더가 두 겹으로 쌓이면 내용 영역이 그만큼 좁아진다 */}
      {/* 📌 상단 바 — 로고 줄과 카테고리 줄이 한 덩어리로 붙어 다닌다.
             처음엔 두 줄(로고 · 카테고리), 내리면 한 줄로 접혀 카테고리가 계속 따라온다.
             ⚠️ sticky 가 아니라 fixed + 같은 높이의 자리(아래 spacer)다. sticky 로 두면 바가 접힐 때
                문서 높이가 76px 줄고, 그만큼 스크롤 위치가 당겨져 다시 펴지는 일이 반복돼 카테고리가 위아래로 튄다. */}
      {!isAuctionRoom && <div aria-hidden className="h-16 md:h-[72px] flex-shrink-0" />}
      <div className={`fixed top-0 left-0 right-0 z-40 ${isAuctionRoom ? "hidden" : ""}`}>
      <header className={`w-full border-b backdrop-blur-md transition-colors duration-300 ${
        isWhitePage ? "border-[#ededed] bg-white/95"
          : isLightPage ? "border-black/[0.08] bg-[#f4f3f2]/95"
          : "border-white/10 bg-[#090909]/90"
      }`}>
        <div className={`max-w-7xl mx-auto px-5 md:px-6 flex items-center gap-4 md:gap-6 relative transition-[height] duration-200 ease-out ${barH}`}>
          <div className="flex items-center gap-3 md:gap-4 h-full z-10 min-w-0 flex-1 md:basis-0">
            {isVerifyPage ? (
              <span className={`font-bold cursor-default select-none text-[15px] sm:text-[17px] tracking-[0.16em] sm:tracking-[0.2em] ${isLightPage ? "text-[#131313]" : "text-white"}`}>고급 이글루</span>
            ) : (
              /* 📌 브랜드는 어느 화면에서나 "고급 이글루" 하나. 지금 있는 곳(SYSTEM : LEVEL · ARCTIC)은
                     아래 카테고리 줄이 알려 준다 — 화면마다 로고가 달라지면 같은 사이트로 안 읽힌다. */
              <>
                <Link href="/" className={isWhitePage
                  ? `shrink-0 font-black tracking-[0.04em] leading-none text-[#131313] hover:text-[#e91e3f] transition-[color,font-size] duration-200 ease-out ${scrolled ? "text-[18px] md:text-[20px]" : "text-[19px] md:text-[22px]"}`
                  : `shrink-0 font-bold text-[15px] sm:text-[17px] tracking-[0.16em] sm:tracking-[0.2em] transition-colors ${isLightPage ? "text-[#131313] hover:text-[#e91e3f]" : "text-white hover:text-gray-300"}`}>고급 이글루</Link>
                {section && (
                  <>
                    <span className={`hidden md:block shrink-0 w-px h-4 ${isLightPage ? "bg-[#d4d4d4]" : "bg-white/20"}`} />
                    {section.parent && (
                      <>
                        <Link href={section.parent.href} className={`hidden lg:inline shrink-0 font-black tracking-[0.14em] leading-none whitespace-nowrap transition-colors ${scrolled ? "text-[14px] md:text-[15px]" : "text-[15px] md:text-[17px]"} ${isLightPage ? "text-[#a3a3a3] hover:text-[#131313]" : "text-white/40 hover:text-white"}`}>
                          {section.parent.name}
                        </Link>
                        <span aria-hidden className={`hidden lg:inline shrink-0 font-black leading-none ${isLightPage ? "text-[#c4c4c4]" : "text-white/25"}`}>›</span>
                      </>
                    )}
                    <Link href={section.href} className={`hidden md:inline shrink-0 font-black tracking-[0.14em] leading-none whitespace-nowrap transition-colors ${scrolled ? "text-[14px] md:text-[15px]" : "text-[15px] md:text-[17px]"} ${isLightPage ? "text-[#131313] hover:text-[#e91e3f]" : "text-white hover:text-[#ff5c77]"}`}>
                      {section.name}
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
          
<div className="order-3 flex flex-1 md:basis-0 min-w-0 justify-end items-center gap-3 md:gap-4 relative z-10 h-full">
            {!mounted || status === "loading" ? (
               <div className="w-20 h-8"></div>
            ) : status === "authenticated" && session ? (
              <>
              {/* 📌 쿠폰 등록 — 알림 옆에 두어 어디서든 바로 쓸 수 있게 (미인증 유저는 숨김) */}
              {isVerified && (
                <Link href="/profile/coupons" aria-label="쿠폰함" title="쿠폰함"
                  className={`relative transition-[padding,color] duration-500 ease-out outline-none focus:outline-none ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"} ${scrolled ? "p-1.5" : "p-2"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`transition-all duration-500 ${scrolled ? "w-[18px] h-[18px]" : "w-5 h-5"}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.ticket} />
                  </svg>
                </Link>
              )}

              {/* 📌 알림 센터 종 아이콘 */}
              <div className="relative flex items-center" ref={notifRef}>
                <button onClick={() => { setIsNotifOpen(!isNotifOpen); if (!isNotifOpen) markNotifsSeen(); }} aria-label="알림" className={`relative transition-[padding,color] duration-500 ease-out outline-none focus:outline-none ${isNotifOpen ? "text-[#e91e3f]" : isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"} ${scrolled ? "p-1.5" : "p-2"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill={isNotifOpen ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`transition-all duration-500 ${scrolled ? "w-[18px] h-[18px]" : "w-5 h-5"}`}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.bell} /></svg>
                  {unseenCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#e91e3f] shadow-[0_0_6px_rgba(233,30,63,0.8)]"></span>
                  )}
                </button>

                {isNotifOpen && (
                  <HeaderPopover anchorRef={notifRef} panelRef={notifPanelRef} className={`w-auto sm:w-[320px] rounded-2xl border overflow-hidden overlay-in backdrop-blur-xl ${isLightPage ? "bg-white/95 border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" : "bg-[#141414]/90 border-white/[0.08] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.8)]"}`}>
                    {/* 머리 — 제목 · 새 알림 수 · 전체 삭제. 판은 프로필 창과 같은 블러 (색 번짐 없음) */}
                    <div className={`px-5 h-12 flex items-center justify-between border-b ${isLightPage ? "border-[#ededed]" : "border-white/[0.07]"}`}>
                      <span className={`text-[14px] font-black ${isLightPage ? "text-[#131313]" : "text-white"}`}>
                        알림{unseenCount > 0 && <span className="ml-1.5 text-[#e91e3f] tabular-nums">{unseenCount}</span>}
                      </span>
                      {bellItems.length > 0 && (
                        <button type="button" onClick={clearAllNotifs} className={`text-[11px] font-bold transition-colors outline-none focus-visible:underline ${isLightPage ? "text-[#8a8a8a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>
                          전체 삭제
                        </button>
                      )}
                    </div>
                    {bellItems.length === 0 ? (
                      <div className={`px-5 py-10 text-center text-[12px] ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>알림이 없습니다.</div>
                    ) : (
                      <div className={`max-h-80 overflow-y-auto [&::-webkit-scrollbar]:hidden divide-y ${isLightPage ? "divide-[#f0f0f0]" : "divide-white/[0.05]"}`}>
                        {bellItems.map((it) => (
                          <Link key={it.key} href={it.href} onClick={() => setIsNotifOpen(false)} className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${isLightPage ? "hover:bg-[#f7f7f7]" : "hover:bg-white/[0.04]"}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${bellChip(it)}`}>{it.chip}</span>
                                {it.unread && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
                              </div>
                              <p className={`text-[13px] font-bold line-clamp-1 ${isLightPage ? "text-[#131313]" : "text-gray-100"}`}>{it.title}</p>
                            </div>
                            {/* 언제 왔는지 */}
                            <span className={`shrink-0 pt-0.5 text-[11px] tabular-nums ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>{agoLabel(it.at)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                    <Link href="/profile/notice" onClick={() => setIsNotifOpen(false)}
                      className={`block text-center px-5 py-3.5 text-[12px] font-black border-t transition-colors ${isLightPage ? "border-[#ededed] text-[#131313] hover:bg-[#f7f7f7]" : "border-white/[0.07] text-white hover:bg-white/[0.05]"}`}>
                      알림함 열기
                    </Link>
                  </HeaderPopover>
                )}
              </div>

              <div className="relative flex items-center h-full" ref={profileDropdownRef}>
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className={`hidden md:flex items-center gap-2 rounded-full hover:bg-white/5 transition-all duration-500 outline-none focus:outline-none ${scrolled ? "p-1" : "p-1.5"}`}>
                  <img src={session.user?.image || ""} alt="Profile" className={`rounded-full bg-gray-700 transition-all duration-500 ${scrolled ? "w-7 h-7" : "w-8 h-8"}`} />
                  <div className="flex items-center gap-2 ml-1">
                    <span className={`font-bold transition-[font-size,letter-spacing] duration-500 ease-out ${isLightPage ? "text-[#131313]" : "text-white"} ${scrolled ? "text-[13px]" : "text-sm"}`}>{session.user?.name}</span>
                    <VerifyIcon isVerified={isVerified} hasScrimRole={hasScrimRole} dark={!isLightPage} />
                  </div>
                </button>
                
                {isProfileOpen && (
                  <HeaderPopover anchorRef={profileDropdownRef} panelRef={profilePanelRef} className={`w-auto sm:w-[280px] rounded-2xl border overflow-hidden overlay-in backdrop-blur-xl ${isLightPage ? "bg-white/95 border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" : "bg-[#141414]/90 border-white/[0.08] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.8)]"}`}>
                    {/* 머리 — 사진 · 이름 · 배지. 판은 색 번짐 없이 뒤가 살짝 비치는 블러 (헤더 바와 같은 결) */}
                    <div className="px-5 pt-5 pb-4 flex items-center gap-3.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={session.user?.image || ""} alt="" className="w-11 h-11 rounded-full bg-gray-700 shrink-0" />
                      <div className="min-w-0">
                        <p className={`text-[15px] font-black truncate ${isLightPage ? "text-[#131313]" : "text-white"}`}>{session.user?.name}</p>
                        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                          <VerifyBadge isVerified={isVerified} hasScrimRole={hasScrimRole} dark={!isLightPage} />
                          {isBooster && <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 border border-[#ff41cf]/25 ${isLightPage ? "text-[#c2189b]" : "text-[#ff6fdc]"}`}>SERVER BOOSTER</span>}
                          {isSupporter && <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-[#3f83b8]/10 border border-[#3f83b8]/25 ${isLightPage ? "text-[#2f6fa3]" : "text-[#7db4df]"}`}>SUPPORTERS</span>}
                        </div>
                      </div>
                    </div>
                    {/* 메뉴 — 아이콘 + 이름 한 줄씩 (관리자도 같은 모양, 빨강은 로그아웃에만) */}
                    <div className={`border-t px-2 py-2 ${isLightPage ? "border-[#ededed]" : "border-white/[0.07]"}`}>
                      {!isVerifyPage && (
                        <Link href="/profile" onClick={() => setIsProfileOpen(false)} className={`flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-bold transition-colors ${isLightPage ? "text-[#131313] hover:bg-[#f2f2f2]" : "text-gray-200 hover:bg-white/[0.06]"}`}>
                          <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] -translate-y-px ${isLightPage ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.user} /></svg>
                          내 정보
                        </Link>
                      )}
                      {!isVerifyPage && (isSupporter || isAdmin) && (
                        <Link href="/supporters" onClick={() => setIsProfileOpen(false)} className={`flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-bold transition-colors ${isLightPage ? "text-[#131313] hover:bg-[#f2f2f2]" : "text-gray-200 hover:bg-white/[0.06]"}`}>
                          <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] -translate-y-px ${isLightPage ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.shieldCheck} /></svg>
                          서포터즈
                        </Link>
                      )}
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setIsProfileOpen(false)} className={`flex items-center gap-3 h-10 px-3 rounded-xl text-[13px] font-bold transition-colors ${isLightPage ? "text-[#131313] hover:bg-[#f2f2f2]" : "text-gray-200 hover:bg-white/[0.06]"}`}>
                          <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] -translate-y-px ${isLightPage ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.key} /></svg>
                          관리자 페이지
                        </Link>
                      )}
                    </div>
                    <div className={`border-t px-2 py-2 ${isLightPage ? "border-[#ededed]" : "border-white/[0.07]"}`}>
                      <button type="button" onClick={() => { setIsProfileOpen(false); signOut(); }} className={`w-full h-10 px-3 rounded-xl text-left text-[13px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${isLightPage ? "text-[#d01634] hover:bg-[#e91e3f]/[0.06]" : "text-[#ff5c77] hover:bg-[#e91e3f]/10"}`}>로그아웃</button>
                    </div>
                  </HeaderPopover>
                )}
              </div>
              </>
            ) : (
              <button onClick={() => setIsLoginModalOpen(true)} className="flex items-center px-4 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[13px] font-bold rounded-full transition-colors outline-none focus:outline-none">로그인</button>
            )}

            {!isVerifyPage && mounted && (
              <button onClick={() => { setIsMenuClosing(false); setIsMobileMenuOpen(true); }} aria-label="메뉴 열기" className={`pc-hidden md:hidden p-2 -mr-1 outline-none ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-300 hover:text-white"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.menu} /></svg>
              </button>
            )}
          </div>

          {/* ── 카테고리 줄 — 모든 화면이 같은 방식. 내리면 로고 옆으로 접혀 계속 보인다 ── */}
          {!isVerifyPage && (status !== "authenticated" || isVerified) && (
            <div className="order-2 relative group/gnb hidden md:flex items-center shrink-0 h-full">
              {/* 큰 분류만 이 줄에 세우고, 세부는 아래 패널 한 장이 전부 맡는다.
                     모바일은 펼치지 않고 햄버거 메뉴가 같은 일을 한다. ── */}
              <nav className="flex items-center gap-6 md:gap-10 h-full min-w-0 overflow-x-auto md:overflow-visible no-bar md:justify-center">
                {categoryGroups.map((group) => {
                  const on = group.items.some((it) => pathname === it.path || !!pathname?.startsWith(it.path + "/"));
                  return (
                    <div key={group.name} className="shrink-0 h-full">
                      <Link href={group.items[0]?.path || "/"}
                        className={`relative h-full flex items-center font-extrabold transition-colors ${scrolled ? "text-[14px]" : "text-[14px] md:text-[15px]"} ${
                          on ? (isLightPage ? "text-[#131313]" : "text-white")
                             : (isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white")
                        }`}>
                        {group.name}
                        {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
                      </Link>
                    </div>
                  );
                })}
              </nav>

              {/* ── 세부 카테고리 패널 — 큰 분류 어디에 올려도 한 장으로 펼쳐진다.
                     분류마다 따로 뜨면 작은 상자가 여기저기 튀어나와 산만하다.
                     바 아래에 매달린 한 장이라 위쪽 모서리는 각지고 아래만 둥글다. ── */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 opacity-0 invisible group-hover/gnb:opacity-100 group-hover/gnb:visible transition-opacity duration-150"
                   style={{ width: "min(92vw, 900px)" }}>
                <div className={`rounded-b-2xl border-x border-b backdrop-blur-2xl ${isLightPage ? "border-[#ededed] bg-white/97 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" : "border-white/[0.08] bg-[#0c0c0c]/97 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.7)]"}`}>
                  <div className="grid grid-cols-3 gap-10 px-9 py-8">
                    {categoryGroups.map((group) => (
                      <div key={group.name}>
                        <div className="flex items-center gap-2.5 mb-3.5">
                          <span className="w-4 h-px bg-[#e91e3f]" />
                          <span className="text-[11px] font-black tracking-[0.2em] text-[#e91e3f]">{group.name}</span>
                        </div>
                        <div className="flex flex-col">
                          {group.items.map((it) => {
                            const cur = pathname === it.path || !!pathname?.startsWith(it.path + "/");
                            return (
                              <Link key={it.path} href={it.path}
                                className={`py-[8px] text-[16px] font-semibold tracking-tight transition-colors ${
                                  cur ? "text-[#e91e3f]" : isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"
                                }`}>{it.name}</Link>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 📌 SYSTEM : LEVEL · ARCTIC 은 카테고리 줄에 세우지 않는다 —
                     홈 가운데(브랜드와 소식 사이)에서 크게 안내하고, 줄에서는 '콘텐츠' 묶음 안으로 간다. */}
            </div>
          )}
        </div>

      </header>
      </div>

      {/* pb-24 — 떠 있는 알약 독(12px 여백 + 약 58px 높이)에 콘텐츠 끝이 가리지 않게 */}
      <main className={`flex-1 flex flex-col w-full relative ${isShopPage ? "" : "pb-24 md:pb-0"}`}>
        {isMaintenance && mounted && !isAdmin && status !== "loading" ? (
          /* 📌 점검 모드 화면 (관리자는 정상 이용 가능) */
          <div className="flex-1 flex items-center justify-center px-6 py-32 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#e91e3f]/[0.06] blur-[120px] rounded-full pointer-events-none"></div>
            <div className="relative z-10 text-center max-w-md">
              <p className="text-5xl mb-8">🔧</p>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-4">더 나은 이글루를 짓는 중입니다</h1>
              <p className="text-sm text-gray-400 leading-relaxed mb-8">현재 사이트 점검이 진행 중입니다.<br />잠시 후 다시 방문해 주세요.</p>
              <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className="inline-block px-8 py-3.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-full transition-colors">디스코드에서 소식 받기</a>
            </div>
          </div>
        ) : isAdminSurface ? (
          /* 📌 관리자 화면 — 좌측 패널(데스크톱) / 상단 칩 바(모바일) + 콘텐츠 */
          <div className="w-full flex-1 flex flex-col lg:flex-row">
            <AdminNav />
            <div className="flex-1 min-w-0 flex flex-col">{children}</div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* 📌 모바일 하단 독 바 — 화면에 붙은 사각 바 대신 떠 있는 알약 독.
             스크롤 시 상단 헤더가 변하는 알약과 같은 톤(bg #0b0b0b/75 + backdrop-blur-2xl + 얇은 흰 테두리).
             ※ bottom은 홈 인디케이터/제스처 바를 피하도록 safe-area와 12px 중 큰 값.
             (경매방에서는 오조작 방지를 위해 숨김) */}
      {!isVerifyPage && !isAuctionRoom && !isShopPage && !isArcticProfile && mounted && (
        <nav style={{ gridTemplateColumns: `repeat(${dockTabs.length}, minmax(0, 1fr))` }}
          className={`md:hidden fixed inset-x-3 mx-auto max-w-md bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 p-1.5 rounded-full border backdrop-blur-2xl grid ${isLightPage ? "border-black/[0.07] bg-white/85 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.22)]" : "border-white/[0.07] bg-[#0b0b0b]/75 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)]"}`}>
          {dockTabs.map((tab) => {
            const isActive = pathname === tab.path;
            return (
              // 라벨 없이 아이콘만 (ARCTIC 하단바와 동일한 형태)
              <Link key={tab.path} href={tab.path} aria-label={tab.name} title={tab.name}
                className={`flex items-center justify-center py-2 rounded-full transition-all active:scale-95 ${isActive ? "text-[#e91e3f] bg-[#e91e3f]/[0.1]" : isLightPage ? "text-[#8a8a8a] active:text-[#131313]" : "text-gray-500 active:text-white"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={isActive ? 2 : 1.6} stroke="currentColor" className="w-[19px] h-[19px]"><path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} /></svg>
              </Link>
            );
          })}
        </nav>
      )}

      <footer className={`w-full mt-auto flex-shrink-0 ${isShopPage ? "hidden" : "hidden md:block"} relative overflow-hidden ${isLightPage ? "border-t border-black/[0.06] bg-white" : "border-t border-white/5 bg-[#090909]"}`}>
        <div className="absolute bottom-[-80px] left-1/2 -translate-x-1/2 w-[500px] h-[160px] bg-[#e91e3f]/[0.04] blur-[90px] rounded-full pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className={`text-base font-black tracking-widest mb-1 ${isLightPage ? "text-[#131313]" : "text-white"}`}>고급 이글루</div>
              <div className="text-[9px] font-bold tracking-[0.35em] text-gray-600 uppercase mb-1.5">Premium Igloo Community</div>
              <div className="text-[11px] font-bold text-gray-500">활동이 곧 자산이 되는 곳.</div>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>Discord</a>
              <a href="https://open.kakao.com/o/gJDUnf0e" target="_blank" rel="noopener noreferrer" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>Kakao Talk</a>
              <Link href="/faq" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>FAQ</Link>
              <Link href="/support" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>1:1 문의</Link>
              <Link href="/policy" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>이용약관</Link>
              <Link href="/policy?tab=privacy" className={`text-xs transition-colors font-medium ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>개인정보처리방침</Link>
            </div>
          </div>
          <div className={`h-px w-full mb-6 ${isLightPage ? "bg-gradient-to-r from-black/10 via-black/5 to-transparent" : "bg-gradient-to-r from-white/10 via-white/5 to-transparent"}`}></div>
          <p className={`text-[11px] font-medium tracking-wide leading-relaxed ${isLightPage ? "text-[#a3a3a3]" : "text-gray-700"}`}>
            © 2026 Premium Igloo. All rights reserved. Unauthorized reproduction or redistribution is strictly prohibited.
          </p>
        </div>
      </footer>

      {isLoginModalOpen && !isGuestInquiryOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-b from-[#1c1c1c] to-[#121212] border border-white/10 rounded-3xl ring-1 ring-white/5 w-full max-w-md overflow-hidden shadow-2xl relative">
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
            </button>
            <div className="p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">로그인</h2>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">고급 이글루의 모든 기능을 이용하시려면<br/>디스코드 계정으로 로그인해주세요.</p>
              <button onClick={() => signIn("discord", { callbackUrl: "/" })} className="w-full flex items-center justify-center gap-3 py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">Discord 로그인</button>
              <button onClick={() => setIsGuestInquiryOpen(true)} className="mt-6 text-sm text-gray-400 hover:text-white underline underline-offset-4 outline-none focus:outline-none transition-colors">비회원으로 문의하시겠습니까?</button>
            </div>
          </div>
        </div>
      )}

      {isGuestInquiryOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-b from-[#1c1c1c] to-[#121212] border border-white/10 rounded-3xl ring-1 ring-white/5 w-full max-w-md overflow-hidden shadow-2xl relative p-8">
            <button onClick={() => {setIsGuestInquiryOpen(false); setIsLoginModalOpen(false);}} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
            </button>
            <h2 className="text-xl font-bold text-white mb-2">비회원 문의</h2>
            <form onSubmit={handleGuestInquiry} className="flex flex-col gap-4 mt-6">
              <input type="email" required placeholder="답변 받을 이메일 주소" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="w-full px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-[#e91e3f] transition-colors" />
              <textarea required placeholder="문의 내용을 상세히 적어주세요." rows={4} value={guestContent} onChange={(e) => setGuestContent(e.target.value)} className="w-full px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none resize-none focus:border-[#e91e3f] transition-colors" />
              <button type="submit" className="w-full py-3 mt-2 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none">문의 접수하기</button>
            </form>
          </div>
        </div>
      )}

      {/* 📌 모바일 슬라이드 메뉴 — 장식 없이 담백하게. 우측에서 통째로 밀려 나오고, 닫을 때도
             같은 궤적으로 밀려 들어간다. 왼쪽 모서리에만 라운드를 줘 패널이 화면 밖에서
             들어온 판처럼 보이게 한다. 항상 최상위 + DOM 최하단 배치로 클릭/스택 보장 */}
      {isMobileMenuOpen && (() => {
        const L = isLightPage;
        // 계정 영역 — 프로필 창과 같은 항목 · 같은 아이콘
        const accountItems: { name: string; path: string; icon: string }[] = [];
        if (status === "authenticated" && session) {
          if (!isVerifyPage) accountItems.push({ name: "내 정보", path: "/profile", icon: ICON_PATHS.user });
          // 서포터즈 바로가기 — 헤더 메뉴 대신 계정 팝업과 프로필에서만 들어간다 (관리자는 확인용으로 항상)
          if (!isVerifyPage && (isSupporter || isAdmin)) accountItems.push({ name: "서포터즈", path: "/supporters", icon: ICON_PATHS.shieldCheck });
          if (isVerified) accountItems.push({ name: "쿠폰함", path: "/profile/coupons", icon: ICON_PATHS.ticket });
          if (isAdmin) accountItems.push({ name: "관리자 페이지", path: "/admin", icon: ICON_PATHS.key });
        }
        const showCategories = !isVerifyPage && (status !== "authenticated" || isVerified);
        // 메뉴 줄 아이콘 — 프로필 창처럼 아이콘 + 이름 한 줄
        const NAV_ICON: Record<string, string> = {
          "/notice": ICON_PATHS.megaphone, "/event": ICON_PATHS.gift, "/recruit": ICON_PATHS.briefcase,
          "/level": ICON_PATHS.chart, "/arctic": ICON_PATHS.bag, "/tournament": ICON_PATHS.trophy, "/auction": ICON_PATHS.flag,
          "/hall-of-fame": ICON_PATHS.star, "/booster": ICON_PATHS.sparkles, "/support": ICON_PATHS.chat, "/faq": ICON_PATHS.search,
        };
        const rowCls = (active: boolean) =>
          `w-full flex items-center gap-3 h-11 px-3 rounded-xl text-left text-[15px] font-bold outline-none transition-colors ${
            active ? (L ? "bg-[#f2f2f2] text-[#131313]" : "bg-white/[0.08] text-white")
              : L ? "text-[#131313] active:bg-[#f2f2f2]" : "text-gray-200 active:bg-white/[0.06]"
          }`;
        const row = (href: string, icon: string | undefined, name: string) => {
          const active = isMenuActive(href);
          return (
            <Link key={href} href={href} onClick={closeMobileMenu} className={rowCls(active)}>
              {/* 한글(Noto Sans KR)은 글자 몸이 줄 가운데보다 1px 위에 앉는다 — 아이콘을 1px 올려 눈높이를 맞춘다 */}
              <svg aria-hidden viewBox="0 0 24 24" className={`w-[18px] h-[18px] shrink-0 -translate-y-px ${active ? "text-[#e91e3f]" : L ? "text-[#5a5a5a]" : "text-gray-400"}`} fill="none" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={icon || ICON_PATHS.chevronRight} />
              </svg>
              <span className="min-w-0 truncate">{name}</span>
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0"></span>}
            </Link>
          );
        };
        const groupHead = `px-3 mb-1 text-[11px] font-black tracking-[0.08em] ${L ? "text-[#8a8a8a]" : "text-gray-500"}`;
        const groupGap = `mt-3 pt-3 border-t ${L ? "border-[#ededed]" : "border-white/[0.07]"}`;

        // 📌 모바일 서랍 — 헤더 팝업(프로필 · 알림)과 같은 결: 블러 판(농도는 헤더 바와 같은 95%), 색 번짐 없음, 아이콘 + 이름 줄.
        //    뒤 딤은 인벤토리 같은 팝업과 같게 흐리게(6px). 80%로 두면 잉크 카드 위에서만 회색이 돼 한 판이 갈라져 보였다.
        //    data-scroll-lock-skip: 전역 ScrollLock의 body position:fixed 잠금을 건너뛴다.
        //    이 메뉴는 폭 84%라 옆에 헤더가 보이는데, body를 고정하면 sticky 헤더가 사라진다.
        //    대신 위 useEffect에서 html에 스크롤 잠금을 걸어 sticky를 살린다.
        return (
        <div className="md:hidden fixed inset-0 z-[200]" data-scroll-lock-skip="">
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes mmFadeIn{from{opacity:0}to{opacity:1}}
            @keyframes mmFadeOut{from{opacity:1}to{opacity:0}}
            @keyframes mmSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
            @keyframes mmSlideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}
          `}} />

          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-[6px]"
            style={{ animation: isMenuClosing ? "mmFadeOut 0.24s ease-in forwards" : "mmFadeIn 0.26s ease-out" }}
            onClick={closeMobileMenu}
          />

          <div
            className={`absolute right-0 top-0 bottom-0 w-[84%] max-w-[340px] rounded-l-2xl border-l flex flex-col overflow-hidden backdrop-blur-xl ${L ? "bg-white/95 border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" : "bg-[#141414]/90 border-white/[0.08] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.8)]"}`}
            style={{ animation: isMenuClosing ? "mmSlideOut 0.26s cubic-bezier(0.4,0,1,1) forwards" : "mmSlideIn 0.32s cubic-bezier(0.22,1,0.36,1)" }}
          >
            {/* ── 머리 — 브랜드 · 닫기 ── */}
            <div className={`shrink-0 flex items-center justify-between pl-5 pr-4 h-16 border-b ${L ? "border-[#ededed]" : "border-white/[0.08]"}`}>
              <span className={`text-[18px] font-black tracking-[0.02em] ${L ? "text-[#131313]" : "text-white"}`}>고급 이글루</span>
              <button onClick={closeMobileMenu} aria-label="메뉴 닫기" className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors outline-none ${L ? "bg-[#f2f2f2] text-[#5a5a5a] active:text-[#131313] active:bg-[#e0e0e0]" : "bg-white/[0.07] text-gray-300 active:text-white"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>

            {/* ── 스크롤 영역 ── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3 [&::-webkit-scrollbar]:hidden">
              {status === "authenticated" && session && (
                /* 눌러서 내 정보로 — 배지는 프로필 창과 같은 한 벌. 칸은 흰색이 아니라 판과 같은 옅은 톤(혼자 떠 보이지 않게) */
                <Link href="/profile" onClick={closeMobileMenu}
                  className={`flex items-center gap-3 p-3 mb-2 rounded-2xl transition-colors ${L ? "bg-black/[0.04] active:bg-black/[0.07]" : "bg-white/[0.05] active:bg-white/[0.08]"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={session.user?.image || ""} alt="" className={`w-11 h-11 rounded-full shrink-0 ${L ? "bg-[#e0e0e0]" : "bg-gray-700"}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-black truncate ${L ? "text-[#131313]" : "text-white"}`}>{session.user?.name}</p>
                    <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                      <VerifyBadge isVerified={isVerified} hasScrimRole={hasScrimRole} dark={!isLightPage} />
                      {isBooster && <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 border border-[#ff41cf]/25 ${L ? "text-[#c2189b]" : "text-[#ff6fdc]"}`}>SERVER BOOSTER</span>}
                      {isSupporter && <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] font-bold bg-[#3f83b8]/10 border border-[#3f83b8]/25 ${L ? "text-[#2f6fa3]" : "text-[#7db4df]"}`}>SUPPORTERS</span>}
                    </div>
                  </div>
                  <svg aria-hidden className={`w-4 h-4 shrink-0 ${L ? "text-[#a3a3a3]" : "text-gray-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                </Link>
              )}

              {showCategories && categoryGroups.map((group, gIdx) => (
                <div key={group.name} className={gIdx > 0 || (status === "authenticated" && session) ? groupGap : ""}>
                  <p className={groupHead}>{group.name}</p>
                  {group.items.map((item) => row(item.path, NAV_ICON[item.path], item.name))}
                </div>
              ))}

              {accountItems.length > 0 && (
                <div className={groupGap}>
                  <p className={groupHead}>계정</p>
                  {accountItems.map((item) => row(item.path, item.icon, item.name))}
                </div>
              )}
            </div>

            {/* ── 바닥 — 로그아웃(빨강은 여기만) · 바깥 링크 ── */}
            <div className={`shrink-0 border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${L ? "border-[#ededed]" : "border-white/[0.08]"}`}>
              {status === "authenticated" && session ? (
                <button onClick={() => { closeMobileMenu(); signOut(); }} className={`w-full h-11 px-3 rounded-xl text-left text-[15px] font-bold transition-colors outline-none ${L ? "text-[#d01634] active:bg-[#e91e3f]/[0.06]" : "text-[#ff5c77] active:bg-[#e91e3f]/10"}`}>로그아웃</button>
              ) : (
                <button onClick={() => { closeMobileMenu(); signIn("discord", { callbackUrl: "/" }); }} className="w-full h-11 rounded-full bg-[#5865F2] active:bg-[#4752C4] text-white text-sm font-bold transition-colors outline-none">Discord 로그인</button>
              )}
              <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 px-3 pt-2.5 pb-1 text-[11px] font-bold ${L ? "text-[#8a8a8a]" : "text-gray-500"}`}>
                <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className={L ? "active:text-[#131313]" : "active:text-white"}>Discord</a>
                <a href="https://open.kakao.com/o/gJDUnf0e" target="_blank" rel="noopener noreferrer" className={L ? "active:text-[#131313]" : "active:text-white"}>Kakao Talk</a>
                <Link href="/policy" onClick={closeMobileMenu} className={L ? "active:text-[#131313]" : "active:text-white"}>이용약관</Link>
                <Link href="/policy?tab=privacy" onClick={closeMobileMenu} className={L ? "active:text-[#131313]" : "active:text-white"}>개인정보처리방침</Link>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}