"use client";

import { useState, useEffect, useRef, FormEvent, RefObject, ReactNode } from "react";
import { createPortal } from "react-dom";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import AdminNav from "./admin/AdminNav";
import ScrollLock from "./components/ScrollLock";
import { verifyBadge } from "@/lib/verifyBadge";

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

  // 📌 스크롤 시 상단바를 알약형 독 바로 전환
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [myCoupons, setMyCoupons] = useState<any[]>([]); // 쿠폰함에 보여줄 보유 쿠폰
  const [isLoadingCoupons, setIsLoadingCoupons] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [codeResult, setCodeResult] = useState<{isOpen: boolean, message: string, isError: boolean}>({isOpen: false, message: "", isError: false});

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
  // 📌 ARCTIC은 라이트 테마 — 헤더/푸터도 밝은 톤으로 전환한다
  const isShopPage = pathname === "/shop" || pathname?.startsWith("/shop/"); // ARCTIC은 자체 헤더를 쓰므로 전역 크롬을 숨긴다
  const isLightPage = isShopPage || pathname === "/profile" || pathname?.startsWith("/profile/");   // 라이트 톤만 따라가는 페이지
  // 📌 경매방 안에서는 모바일 하단 탭을 숨긴다.
  //    입찰·채팅 바가 화면 아래에 붙는데 그 위에 전역 탭까지 있으면 잘못 눌러 방을 나가게 된다.
  const isAuctionRoom = /^\/auction\/[^/]+$/.test(pathname || "");
  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isAdmin = status === "authenticated" && userSession?.name && ADMIN_USERS.includes(userSession.name);

  // 📌 ARCTIC 공개 여부 — 비공개면 관리자에게만 메뉴에 노출한다
  const [shopPublic, setShopPublic] = useState(false);
  useEffect(() => {
    fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setShopPublic(!!d?.data?.shopPublic))
      .catch(() => {});
  }, []);

  // 📌 관리자 패널 표시 여부 — 관리자 전용 화면에서만 좌측 패널을 붙인다
  const isAdminSurface =
    isAdmin &&
    (pathname?.startsWith("/admin") ||
      ADMIN_SURFACE_PATHS.includes(pathname || "") ||
      (ADMIN_QUERY_PATHS.includes(pathname || "") && searchParams.get("admin") === "1"));

  const [isCodeSubmitting, setIsCodeSubmitting] = useState(false);

  // 📌 카테고리 그룹화: 큰 카테고리 → 세부 카테고리 (메가 메뉴)
  const rawCategoryGroups = [
    { name: "소식", desc: "고급 이글루의 최신 소식", tagline: "고급 이글루의 소식", items: [{ name: "공지사항", path: "/notice", desc: "최신 소식과 주요 안내" }, { name: "이벤트", path: "/event", desc: "다양한 이벤트와 혜택" }, { name: "구인", path: "/recruit", desc: "스태프 및 서포터즈 모집" }] },
    { name: "콘텐츠", desc: "서버의 핵심 콘텐츠", tagline: "서버의 핵심 콘텐츠", items: [{ name: "SYSTEM : LEVEL", path: "/level", desc: "레벨 시스템 및 XP 대시보드" }, { name: "ARCTIC", path: "/shop", desc: "XP로 역할과 혜택을 구매" }, { name: "대회", path: "/tournament", desc: "e스포츠 리그 허브" }, { name: "경매", path: "/auction", desc: "실시간 포인트 경매 관전 및 참여" }, { name: "명예의 전당", path: "/hall-of-fame", desc: "역대 대회 우승 기록" }, { name: "부스터 혜택", path: "/booster", desc: "서버 부스터 전용 혜택 안내" }] },
    { name: "지원", desc: "도움이 필요하신가요?", tagline: "무엇을 도와드릴까요?", items: [{ name: "1:1 문의", path: "/support", desc: "불편 사항 및 문의 접수" }, { name: "FAQ", path: "/faq", desc: "자주 묻는 질문" }] },
  ];

  // ARCTIC이 비공개면 일반 유저 메뉴에서 제외 (관리자는 그대로 보인다)
  const categoryGroups = rawCategoryGroups.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.path !== "/shop" || shopPublic || isAdmin),
  }));

  const [openMegaMenu, setOpenMegaMenu] = useState<string | null>(null);

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

  const unreadAdminCount = adminNotifs.filter((n) => !n.read).length;
  const unseenCount = notifications.filter((n) => !seenNotifIds.has(n._id)).length + unreadAdminCount;

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
      if (isVerified === false && !isVerifyPage) router.push("/verify");
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

  // 쿠폰함을 열면 보유 쿠폰을 불러온다
  const loadMyCoupons = () => {
    setIsLoadingCoupons(true);
    fetch("/api/shop/my-coupons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMyCoupons(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setMyCoupons([]))
      .finally(() => setIsLoadingCoupons(false));
  };
  useEffect(() => {
    if (isCodeModalOpen && status === "authenticated") loadMyCoupons();
  }, [isCodeModalOpen, status]);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim() || isCodeSubmitting) return;
    setIsCodeSubmitting(true);
    try {
      const res = await fetch("/api/shop/my-coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: voucherCode,
          userId: (session?.user as any)?.id,
          userName: session?.user?.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCodeResult({ isOpen: true, message: data.message || "쿠폰이 정상적으로 등록되었습니다.", isError: false });
        setVoucherCode("");
        loadMyCoupons();
      } else {
        setCodeResult({ isOpen: true, message: data.message || "사용할 수 없는 쿠폰입니다.", isError: true });
      }
    } catch {
      setCodeResult({ isOpen: true, message: "서버와 통신하는 중 오류가 발생했습니다.", isError: true });
    } finally {
      setIsCodeSubmitting(false);
      setVoucherCode("");
    }
  };

  return (
    <div className={`flex flex-col min-h-screen ${isLightPage ? "bg-[#f5f3f0]" : "bg-[#090909]"}`}>
      <ScrollLock />
      <RouteProgress pathname={pathname} />
      {/* 📌 경매방 모바일에서는 전역 헤더를 감춘다 — 경매 바가 자체 뒤로가기를 갖고 있고,
             헤더가 두 겹으로 쌓이면 내용 영역이 그만큼 좁아진다 */}
      <div className={`sticky top-0 z-40 transition-[padding] duration-500 ease-out flex-shrink-0 ${isAuctionRoom || isShopPage ? "hidden" : ""} ${scrolled ? "pt-3 px-3 md:px-6" : ""}`} onMouseLeave={() => setOpenMegaMenu(null)}>
      <header className={`mx-auto transition-[max-width,border-radius,padding,height] duration-500 ease-out ${
        scrolled
          ? isLightPage
            ? "max-w-3xl rounded-full border border-black/[0.06] bg-white/80 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.18)] px-5 md:px-6 h-14"
            : "max-w-3xl rounded-full border border-white/[0.06] bg-[#0b0b0b]/70 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] px-5 md:px-6 h-14"
          : isLightPage
            ? "max-w-[1600px] border border-x-transparent border-t-transparent border-b-black/[0.08] bg-[#f5f3f0]/85 backdrop-blur-md px-6 h-16"
            : "max-w-[1600px] border border-x-transparent border-t-transparent border-b-white/10 bg-[#090909]/80 backdrop-blur-md shadow-[0_0_0_rgba(0,0,0,0)] px-6 h-16"
      }`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between relative h-full">
          <div className="flex-1 flex items-center z-10">
            {isVerifyPage ? (
              <span className={`font-bold cursor-default select-none transition-[font-size,letter-spacing] duration-500 ease-out ${isLightPage ? "text-[#131313]" : "text-white"} ${scrolled ? "text-[15px] tracking-[0.12em]" : "text-[17px] tracking-[0.18em]"}`}>고급 이글루</span>
            ) : (
              <Link href="/" className={`font-bold transition-[font-size,letter-spacing] duration-500 ease-out ${isLightPage ? "text-[#131313] hover:text-[#e91e3f]" : "text-white hover:text-gray-300"} ${scrolled ? "text-[15px] tracking-[0.12em]" : "text-[17px] tracking-[0.18em]"}`}>고급 이글루</Link>
            )}
          </div>
          
          {/* 비로그인(게스트) 또는 인증 유저에게만 카테고리 노출 (로그인 후 미인증 유저는 숨김 → /verify로 유도) */}
          {!isVerifyPage && (status !== "authenticated" || isVerified) && (
            <nav className={`hidden md:flex items-center justify-center font-bold absolute left-1/2 transform -translate-x-1/2 h-full z-50 transition-all duration-500 ${scrolled ? "gap-0.5 text-[13px]" : "gap-2 text-sm"}`}>
              {categoryGroups.map((group) => {
                const isGroupActive = group.items.some((item) => pathname === item.path);
                const isOpen = openMegaMenu === group.name;
                return (
                  <div key={group.name} className="relative h-full flex items-center group/gnav" onMouseEnter={() => setOpenMegaMenu(group.name)}>
                    <button className={`relative h-full flex items-center transition-all duration-500 ease-out outline-none focus:outline-none ${scrolled ? "px-3" : "px-4"} ${isGroupActive || isOpen ? "text-[#e91e3f]" : isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"}`}>
                      {group.name}
                      {/* 대분류 라인 차오름 이펙트 — 평소엔 숨김, 호버 시 왼쪽부터 차오름. 알약 모드에선 라인 위치도 함께 올라온다 */}
                      <span className={`absolute h-px bg-[#e91e3f] origin-left transition-all duration-500 ${scrolled ? "bottom-2.5 left-3 right-3" : "bottom-4 left-4 right-4"} ${isGroupActive || isOpen ? "scale-x-100" : "scale-x-0 group-hover/gnav:scale-x-100"}`} />
                    </button>

                  </div>
                );
              })}
            </nav>
          )}
          
          <div className="flex-1 flex justify-end items-center gap-4 h-full relative z-10">
            {!mounted || status === "loading" ? (
               <div className="w-20 h-8"></div>
            ) : status === "authenticated" && session ? (
              <>
              {/* 📌 쿠폰 등록 — 알림 옆에 두어 어디서든 바로 쓸 수 있게 (미인증 유저는 숨김) */}
              {isVerified && (
                <button onClick={() => setIsCodeModalOpen(true)} aria-label="쿠폰함" title="쿠폰함"
                  className={`relative transition-[padding,color] duration-500 ease-out outline-none focus:outline-none ${isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"} ${scrolled ? "p-1.5" : "p-2"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`transition-all duration-500 ${scrolled ? "w-[18px] h-[18px]" : "w-5 h-5"}`}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                  </svg>
                </button>
              )}

              {/* 📌 알림 센터 종 아이콘 */}
              <div className="relative flex items-center" ref={notifRef}>
                <button onClick={() => { setIsNotifOpen(!isNotifOpen); if (!isNotifOpen) markNotifsSeen(); }} aria-label="알림" className={`relative transition-[padding,color] duration-500 ease-out outline-none focus:outline-none ${isNotifOpen ? "text-[#e91e3f]" : isLightPage ? "text-[#5a5a5a] hover:text-[#131313]" : "text-gray-400 hover:text-white"} ${scrolled ? "p-1.5" : "p-2"}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill={isNotifOpen ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className={`transition-all duration-500 ${scrolled ? "w-[18px] h-[18px]" : "w-5 h-5"}`}><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
                  {unseenCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#e91e3f] shadow-[0_0_6px_rgba(233,30,63,0.8)]"></span>
                  )}
                </button>

                {isNotifOpen && (
                  <HeaderPopover anchorRef={notifRef} panelRef={notifPanelRef} className={`w-auto sm:w-[300px] rounded-3xl backdrop-blur-2xl border overflow-hidden overlay-in ${isLightPage ? "bg-white/75 border-black/[0.07] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.28)]" : "bg-[#111111]/75 border-white/[0.07] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.9)]"}`}>
                    <div className={`px-5 pt-4 pb-3.5 border-b flex items-center justify-between relative overflow-hidden ${isLightPage ? "border-black/[0.06]" : "border-white/[0.06]"}`}>
                      <div className="absolute top-[-30px] right-[-20px] w-32 h-16 bg-[#e91e3f]/[0.12] blur-[36px] rounded-full pointer-events-none"></div>
                      <div className="relative flex items-center gap-2.5">
                        <span className="w-4 h-px bg-[#e91e3f]"></span>
                        <span className={`text-sm font-black tracking-tight ${isLightPage ? "text-[#131313]" : "text-white"}`}>알림</span>
                      </div>
                      <Link href="/profile?tab=notice" onClick={() => setIsNotifOpen(false)} className={`relative text-[11px] font-black hover:text-[#e91e3f] transition-colors ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>전체 보기</Link>
                    </div>
                    {notifications.length === 0 && adminNotifs.length === 0 ? (
                      <div className={`px-5 py-8 text-center text-xs ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>아직 알림이 없습니다.</div>
                    ) : (
                      <div className={`max-h-72 overflow-y-auto [&::-webkit-scrollbar]:hidden divide-y ${isLightPage ? "divide-black/[0.05]" : "divide-white/[0.04]"}`}>
                        {adminNotifs.slice(0, 5).map((n) => {
                          const warn = n.type === "경고" || n.type === "제재";
                          return (
                            <Link key={n._id} href="/profile?tab=notice" onClick={() => setIsNotifOpen(false)} className={`block px-5 py-3.5 transition-colors ${isLightPage ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[9px] font-black tracking-wider px-1.5 py-0.5 rounded border ${warn ? "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" : "bg-sky-500/10 text-sky-400 border-sky-500/20"}`}>{n.type || "안내"}</span>
                                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>}
                                <span className="ml-auto text-[10px] text-gray-600">운영팀</span>
                              </div>
                              <p className={`text-xs font-bold line-clamp-1 ${isLightPage ? "text-[#131313]" : "text-gray-200"}`}>{n.title}</p>
                            </Link>
                          );
                        })}
                        {notifications.slice(0, 5).map((n) => (
                          <Link key={n._id} href="/profile" onClick={() => setIsNotifOpen(false)} className={`block px-5 py-3.5 transition-colors ${isLightPage ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[9px] font-black tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">답변 완료</span>
                              <span className="text-[10px] text-gray-600">{n.mainType || "문의"}</span>
                            </div>
                            <p className={`text-xs font-bold line-clamp-1 ${isLightPage ? "text-[#4b4b4b]" : "text-gray-300"}`}>{n.title || n.content?.slice(0, 40) || "문의 내역"}</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </HeaderPopover>
                )}
              </div>

              <div className="relative flex items-center h-full" ref={profileDropdownRef}>
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className={`hidden md:flex items-center gap-2 rounded-full hover:bg-white/5 transition-all duration-500 outline-none focus:outline-none ${scrolled ? "p-1" : "p-1.5"}`}>
                  <img src={session.user?.image || ""} alt="Profile" className={`rounded-full bg-gray-700 transition-all duration-500 ${scrolled ? "w-7 h-7" : "w-8 h-8"}`} />
                  <div className="flex items-center gap-2 ml-1">
                    <span className={`font-bold transition-[font-size,letter-spacing] duration-500 ease-out ${isLightPage ? "text-[#131313]" : "text-white"} ${scrolled ? "text-[13px]" : "text-sm"}`}>{session.user?.name}</span>
                    {isVerified && hasScrimRole ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-400"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                    ) : isVerified ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-400"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-400"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" /></svg>
                    )}
                  </div>
                </button>
                
                {isProfileOpen && (
                  <HeaderPopover anchorRef={profileDropdownRef} panelRef={profilePanelRef} className={`w-auto sm:w-[272px] rounded-3xl backdrop-blur-2xl border p-5 overflow-hidden overlay-in ${isLightPage ? "bg-white/75 border-black/[0.07] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.28)]" : "bg-[#111111]/75 border-white/[0.07] shadow-[0_30px_70px_-18px_rgba(0,0,0,0.9)]"}`}>
                    <div className="absolute top-[-40px] left-1/2 -translate-x-1/2 w-48 h-24 bg-[#e91e3f]/[0.1] blur-[44px] rounded-full pointer-events-none"></div>
                    <div className={`relative flex items-center gap-4 mb-4 pb-4 border-b ${isLightPage ? "border-black/[0.06]" : "border-white/[0.06]"}`}>
                      <div className="relative shrink-0">
                        <img src={session.user?.image || ""} alt="Profile" className="relative w-12 h-12 rounded-full bg-gray-700" />
                      </div>
                      <div>
                        <div className={`font-bold text-base flex items-center gap-2 ${isLightPage ? "text-[#131313]" : "text-white"}`}>{session.user?.name}</div>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${verifyBadge(isVerified, hasScrimRole).cls}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                            {verifyBadge(isVerified, hasScrimRole).label}
                          </span>
                          {isBooster && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 text-[#ff41cf] border border-[#ff41cf]/25">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
                              SERVER BOOSTER
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="relative flex flex-col gap-0.5">
                      {!isVerifyPage && (
                        <Link href="/profile" onClick={() => setIsProfileOpen(false)} className={`w-full block px-3.5 py-2.5 text-[13px] rounded-xl transition-colors font-bold ${isLightPage ? "text-[#4b4b4b] hover:text-[#131313] hover:bg-black/[0.05]" : "text-gray-300 hover:text-white hover:bg-white/[0.06]"}`}>내 정보</Link>
                      )}
                      {!isVerifyPage && isVerified && (
                        <Link href="/invite" onClick={() => setIsProfileOpen(false)} className={`w-full block px-3.5 py-2.5 text-[13px] rounded-xl transition-colors font-bold ${isLightPage ? "text-[#4b4b4b] hover:text-[#131313] hover:bg-black/[0.05]" : "text-gray-300 hover:text-white hover:bg-white/[0.06]"}`}>친구 초대 이벤트</Link>
                      )}
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-[#e91e3f] hover:bg-[#e91e3f]/10 rounded-xl transition-colors font-bold">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
                          관리자 페이지
                        </Link>
                      )}
                      <div className={`h-px my-1.5 mx-1 ${isLightPage ? "bg-black/[0.07]" : "bg-white/[0.06]"}`}></div>
                      <button onClick={() => { setIsProfileOpen(false); signOut(); }} className="w-full text-left px-3.5 py-2.5 text-[13px] text-[#e91e3f] hover:bg-[#e91e3f]/10 rounded-xl transition-colors outline-none focus:outline-none font-black">로그아웃</button>
                    </div>
                  </HeaderPopover>
                )}
              </div>
              </>
            ) : (
              <button onClick={() => setIsLoginModalOpen(true)} className="flex items-center px-4 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[13px] font-bold rounded-full transition-colors outline-none focus:outline-none">로그인</button>
            )}

            {!isVerifyPage && mounted && (
              <button onClick={() => { setIsMenuClosing(false); setIsMobileMenuOpen(true); }} aria-label="메뉴 열기" className={`pc-hidden md:hidden p-2 -mr-1 outline-none ${isLightPage ? "text-[#4b4b4b] hover:text-[#131313]" : "text-gray-300 hover:text-white"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 📌 메가 메뉴 — 풀폭 · 좌측 헤딩 + 깔끔한 텍스트 리스트 (프리미엄 톤)
             ※ header(알약 상태에서 좁아짐) 밖, 바깥 래퍼 기준으로 위치시켜 항상 풀폭으로 펼쳐지게 한다 */}
      {openMegaMenu && (() => {
        const group = categoryGroups.find((g) => g.name === openMegaMenu);
        if (!group) return null;
        // 바깥 div는 위치 잡기 + 알약 모드에선 pt-2 투명 다리(마우스가 알약→메뉴로 건너갈 때 호버가 안 끊기게)
        // 📌 기준을 항상 가운데로 두고 폭만 바꾼다 — 알약↔전체폭 전환 때 메뉴가 튀지 않고 헤더와 같이 움직인다
        return (
          <div className={`hidden md:block absolute top-full left-1/2 -translate-x-1/2 w-full transition-[max-width,padding] duration-500 ease-out ${scrolled ? "pt-2 px-3 md:px-6 max-w-3xl" : "pt-0 max-w-[1600px]"}`} style={{ animation: "megaReveal 0.34s cubic-bezier(0.16,1,0.3,1)" }}>
            <style dangerouslySetInnerHTML={{ __html: `@keyframes megaReveal{from{opacity:0;clip-path:inset(0 0 100% 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}@keyframes megaDrop{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}` }} />
            <div className={`backdrop-blur-2xl origin-top transition-[border-radius,border-color,box-shadow,background-color] duration-500 ease-out ${isLightPage ? "bg-[#f5f3f0]/75" : "bg-[#0c0c0c]/70"} ${scrolled ? (isLightPage ? "rounded-3xl border border-black/[0.07] overflow-hidden shadow-[0_40px_90px_-20px_rgba(0,0,0,0.25)]" : "rounded-3xl border border-white/[0.07] overflow-hidden shadow-[0_40px_90px_-20px_rgba(0,0,0,0.95)]") : (isLightPage ? "border-b border-black/[0.08] shadow-[0_40px_80px_-24px_rgba(0,0,0,0.2)]" : "border-b border-white/10 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.9)]")}`}>
            <div className="h-px w-full bg-gradient-to-r from-transparent via-[#e91e3f]/50 to-transparent"></div>
            <div className={`mx-auto grid grid-cols-12 gap-10 items-start transition-[max-width,padding] duration-500 ease-out ${scrolled ? "max-w-3xl px-8 py-7" : "max-w-7xl px-8 py-8 lg:py-10"}`} style={{ animation: "megaDrop 0.42s cubic-bezier(0.16,1,0.3,1) 0.06s both" }}>
              {/* 좌: 섹션 헤딩 */}
              <div className="col-span-12 lg:col-span-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <span className="w-6 h-px bg-[#e91e3f]"></span>
                  <span className="text-[10px] font-black tracking-[0.35em] text-[#e91e3f] uppercase">{group.name}</span>
                </div>
                <p className={`text-xl lg:text-2xl font-black tracking-tight leading-snug break-keep max-w-md ${isLightPage ? "text-[#131313]" : "text-white"}`}>{group.tagline}</p>
              </div>
              {/* 우: 텍스트 링크 리스트 */}
              <div className="col-span-12 lg:col-span-7">
                {group.items.map((item) => {
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setOpenMegaMenu(null)}
                      className={`group/item relative flex items-center justify-between gap-4 py-3 transition-colors ${isLightPage ? "border-b border-black/[0.08] first:border-t first:border-black/[0.08]" : "border-b border-white/[0.08] first:border-t first:border-white/[0.08]"}`}
                    >
                      {/* 상단 내비(소식·콘텐츠·지원)와 같은 밑줄 애니메이션 */}
                      <span className={`absolute bottom-[-1px] left-0 right-0 h-px bg-[#e91e3f] origin-left transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0 group-hover/item:scale-x-100"}`} />
                      <div className="min-w-0">
                        <p className={`text-[15px] lg:text-base font-bold tracking-tight transition-colors ${isActive ? "text-[#e91e3f]" : isLightPage ? "text-[#131313] group-hover/item:text-[#e91e3f]" : "text-gray-100 group-hover/item:text-[#ff5c77]"}`}>{item.name}</p>
                        <p className={`text-[11px] mt-0.5 truncate ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>{item.desc}</p>
                      </div>
                      <svg className={`w-4 h-4 shrink-0 -translate-x-2 opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-0 group-hover/item:text-[#e91e3f] transition-all duration-300 ${isLightPage ? "text-[#a3a3a3]" : "text-gray-600"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </Link>
                  );
                })}
              </div>
            </div>
            </div>
          </div>
        );
      })()}
      </div>


      {/* pb-24 — 떠 있는 알약 독(12px 여백 + 약 58px 높이)에 콘텐츠 끝이 가리지 않게 */}
      <main className={`flex-1 flex flex-col w-full relative ${isShopPage ? "" : "pb-24 md:pb-0"}`}>
        {isMaintenance && mounted && !isAdmin && status !== "loading" ? (
          /* 📌 점검 모드 화면 (관리자는 정상 이용 가능) */
          <div className="flex-1 flex items-center justify-center px-6 py-32 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#e91e3f]/[0.06] blur-[120px] rounded-full pointer-events-none"></div>
            <div className="relative z-10 text-center max-w-md">
              <p className="text-5xl mb-8">🔧</p>
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="w-8 h-px bg-[#e91e3f]"></span>
                <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Under Maintenance</span>
                <span className="w-8 h-px bg-[#e91e3f]"></span>
              </div>
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
      {!isVerifyPage && !isAuctionRoom && !isShopPage && mounted && (
        <nav className={`md:hidden fixed inset-x-3 mx-auto max-w-md bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 p-1.5 rounded-full border backdrop-blur-2xl grid grid-cols-5 ${isLightPage ? "border-black/[0.07] bg-white/85 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.22)]" : "border-white/[0.07] bg-[#0b0b0b]/75 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.85)]"}`}>
          {[
            { name: "홈", path: "/", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75" },
            { name: "공지", path: "/notice", icon: "M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73" },
            { name: "이벤트", path: "/event", icon: "M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
            { name: "레벨", path: "/level", icon: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
            { name: "내 정보", path: "/profile", icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" },
          ].map((tab) => {
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

      <footer className={`w-full mt-auto flex-shrink-0 ${isShopPage ? "hidden" : "hidden md:block"} relative overflow-hidden ${isLightPage ? "border-t border-black/[0.06] bg-[#f5f3f0]" : "border-t border-white/5 bg-[#090909]"}`}>
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

      {/* 📌 쿠폰함 — 코드 등록과 보유 쿠폰을 한 창에서 */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setIsCodeModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className={`rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88dvh] sm:max-h-[80vh] overflow-hidden shadow-2xl relative flex flex-col animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200 border ${isLightPage ? "bg-white border-[#e2e0dc]" : "bg-[#121212] border-white/10"}`}>
            {/* 머리 */}
            <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isLightPage ? "border-[#ececea]" : "border-white/[0.07]"}`}>
              <div className="flex items-center gap-2.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px] text-[#e91e3f]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                </svg>
                <h2 className={`text-base font-black tracking-tight ${isLightPage ? "text-[#131313]" : "text-white"}`}>쿠폰함</h2>
              </div>
              <button onClick={() => setIsCodeModalOpen(false)} aria-label="닫기" className={`p-1.5 -mr-1.5 rounded-md transition-colors outline-none ${isLightPage ? "text-[#8a8a8a] hover:text-[#131313] hover:bg-black/[0.05]" : "text-gray-400 hover:text-white hover:bg-white/[0.06]"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 코드 등록 */}
            <div className={`shrink-0 px-6 pt-5 pb-4 border-b ${isLightPage ? "border-[#ececea]" : "border-white/[0.07]"}`}>
              <form onSubmit={handleCodeSubmit} className="flex gap-2">
                <input type="text" required placeholder="쿠폰 코드 입력" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)}
                  className={`flex-1 min-w-0 px-4 py-3 rounded-xl text-sm outline-none focus:border-[#e91e3f] transition-colors uppercase placeholder:normal-case border ${isLightPage ? "bg-white border-[#e2e0dc] text-[#131313] placeholder:text-[#a3a3a3]" : "bg-white/[0.03] border-white/10 text-white placeholder:text-gray-600"}`} />
                <button type="submit" disabled={isCodeSubmitting}
                  className="px-5 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-[13px] font-bold rounded-xl transition-colors outline-none shrink-0">
                  {isCodeSubmitting ? "확인" : "등록"}
                </button>
              </form>
              {codeResult.isOpen && (
                <p className={`mt-2.5 text-[12px] font-bold break-keep ${codeResult.isError ? (isLightPage ? "text-[#c62828]" : "text-red-400") : (isLightPage ? "text-[#3f7a35]" : "text-emerald-400")}`}>{codeResult.message}</p>
              )}
            </div>

            {/* 보유 쿠폰 */}
            <div className="flex-1 min-h-0 overflow-y-auto [&::-webkit-scrollbar]:hidden">
              <div className="px-6 pt-4 pb-2 flex items-center justify-between">
                <span className={`text-[11px] font-black tracking-[0.2em] uppercase ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>My Coupons</span>
                {myCoupons.length > 0 && <span className="text-[11px] font-black text-[#e91e3f]">{myCoupons.length}장</span>}
              </div>
              {isLoadingCoupons ? (
                <p className="px-6 py-10 text-center text-xs text-gray-500">불러오는 중...</p>
              ) : myCoupons.length === 0 ? (
                <p className="px-6 py-10 text-center text-xs text-gray-500 break-keep">보유한 쿠폰이 없습니다.</p>
              ) : (
                <div className={`divide-y ${isLightPage ? "divide-[#ececea]" : "divide-white/[0.05]"}`}>
                  {myCoupons.map((c) => (
                    <div key={c.id} className="px-6 py-3.5 flex items-center gap-3">
                      <span className="w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center shrink-0">
                        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[13px] font-bold truncate ${isLightPage ? "text-[#131313]" : "text-white"}`}>{c.name}</p>
                        <p className={`text-[11px] break-keep ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>
                          {c.type === "percent" ? `${c.value}% 할인` : `${(c.value || 0).toLocaleString()} XP 할인`}
                          {c.minTotal > 0 && ` · ${c.minTotal.toLocaleString()} XP 이상`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className={`shrink-0 px-6 py-3 border-t ${isLightPage ? "border-[#ececea]" : "border-white/[0.07]"}`}>
                <Link href="/admin/shop?tab=coupons" onClick={() => setIsCodeModalOpen(false)} className={`block text-center text-[12px] font-bold transition-colors ${isLightPage ? "text-[#8a8a8a] hover:text-[#131313]" : "text-gray-500 hover:text-white"}`}>쿠폰 관리 (관리자) →</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {isLoginModalOpen && !isGuestInquiryOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-b from-[#1c1c1c] to-[#121212] border border-white/10 rounded-3xl ring-1 ring-white/5 w-full max-w-md overflow-hidden shadow-2xl relative">
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
        // 계정 영역 — 링크/버튼이 섞여 있어 한 배열로 모아 같은 스타일로 렌더한다
        const accountItems: { name: string; path?: string; onClick?: () => void; accent?: boolean }[] = [];
        if (status === "authenticated" && session) {
          if (!isVerifyPage) accountItems.push({ name: "내 정보", path: "/profile" });
          if (!isVerifyPage && isVerified) accountItems.push({ name: "친구 초대 이벤트", path: "/invite" });
          if (isVerified) accountItems.push({ name: "쿠폰함", onClick: () => { closeMobileMenu(); setIsCodeModalOpen(true); } });
          if (isAdmin) accountItems.push({ name: "관리자 페이지", path: "/admin", accent: true });
        }
        const showCategories = !isVerifyPage && (status !== "authenticated" || isVerified);
        const itemCls = (active: boolean, accent?: boolean) =>
          `w-full flex items-center rounded-xl px-3 py-3 mb-0.5 text-left text-sm font-bold outline-none transition-colors ${
            active ? "bg-[#e91e3f]/10 text-[#e91e3f]"
              : accent ? "text-[#e91e3f] " + (isLightPage ? "active:bg-black/[0.05]" : "active:bg-white/[0.05]")
              : isLightPage ? "text-[#4b4b4b] active:bg-black/[0.05] active:text-[#131313]" : "text-gray-300 active:bg-white/[0.05] active:text-white"
          }`;

        return (
        <div className="md:hidden fixed inset-0 z-[200]">
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes mmFadeIn{from{opacity:0}to{opacity:1}}
            @keyframes mmFadeOut{from{opacity:1}to{opacity:0}}
            @keyframes mmSlideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
            @keyframes mmSlideOut{from{transform:translateX(0)}to{transform:translateX(100%)}}
          `}} />

          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            style={{ animation: isMenuClosing ? "mmFadeOut 0.24s ease-in forwards" : "mmFadeIn 0.26s ease-out" }}
            onClick={closeMobileMenu}
          />

          <div
            className={`absolute right-0 top-0 bottom-0 w-[82%] max-w-xs backdrop-blur-2xl border-l rounded-l-[28px] flex flex-col overflow-hidden ${isLightPage ? "bg-[#f5f3f0]/92 border-black/[0.07] shadow-[-24px_0_70px_-20px_rgba(0,0,0,0.25)]" : "bg-[#0d0d0d]/90 border-white/[0.07] shadow-[-24px_0_70px_-20px_rgba(0,0,0,0.8)]"}`}
            style={{ animation: isMenuClosing ? "mmSlideOut 0.26s cubic-bezier(0.4,0,1,1) forwards" : "mmSlideIn 0.32s cubic-bezier(0.22,1,0.36,1)" }}
          >
            {/* 상단 크림슨 글로우 */}
            <div className="absolute top-[-60px] right-[-30px] w-56 h-32 bg-[#e91e3f]/[0.1] blur-[60px] rounded-full pointer-events-none"></div>

            {/* ── 헤더 ── */}
            <div className={`relative shrink-0 flex items-center justify-between px-5 h-16 border-b ${isLightPage ? "border-black/[0.07]" : "border-white/[0.07]"}`}>
              <div className="flex items-center gap-2.5">
                <span className="w-4 h-px bg-[#e91e3f]"></span>
                <span className={`text-[15px] font-bold tracking-[0.15em] ${isLightPage ? "text-[#131313]" : "text-white"}`}>고급 이글루</span>
              </div>
              <button onClick={closeMobileMenu} aria-label="메뉴 닫기" className={`p-2 -mr-1 rounded-full transition-colors outline-none ${isLightPage ? "text-[#8a8a8a] active:text-[#131313] bg-black/[0.05]" : "text-gray-400 active:text-white bg-white/[0.05]"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* ── 스크롤 영역 ── */}
            <div className="relative flex-1 overflow-y-auto overscroll-contain px-4 py-4 [&::-webkit-scrollbar]:hidden">
              {status === "authenticated" && session && (
                /* 눌러서 내 정보로 — 부스터 역할이 있으면 인증 배지 옆에 표시한다 */
                <Link href="/profile" onClick={closeMobileMenu}
                  className={`relative flex items-center gap-3.5 p-3.5 mb-5 border rounded-2xl overflow-hidden transition-colors ${isLightPage ? "bg-black/[0.03] border-black/[0.06] active:bg-black/[0.06]" : "bg-white/[0.04] border-white/[0.06] active:bg-white/[0.07]"}`}>
                  <img src={session.user?.image || ""} alt="Profile" className={`relative w-11 h-11 rounded-full ${isLightPage ? "bg-[#e2e0dc]" : "bg-gray-700"}`} />
                  <div className="relative min-w-0 flex-1">
                    <p className={`font-bold text-sm truncate ${isLightPage ? "text-[#131313]" : "text-white"}`}>{session.user?.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${verifyBadge(isVerified, hasScrimRole).cls}`}>{verifyBadge(isVerified, hasScrimRole).label}</span>
                      {isBooster && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 text-[#ff41cf]">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>
                          BOOSTER
                        </span>
                      )}
                    </div>
                  </div>
                  <svg className={`w-4 h-4 shrink-0 ${isLightPage ? "text-[#a3a3a3]" : "text-gray-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </Link>
              )}

              {showCategories && categoryGroups.map((group, gIdx) => (
                <div key={group.name} className={gIdx > 0 ? "mt-6" : ""}>
                  <div className="flex items-center gap-2 px-3 mb-1.5">
                    <span className="w-3 h-px bg-[#e91e3f]/70"></span>
                    <p className={`text-[11px] font-black tracking-[0.14em] ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>{group.name}</p>
                  </div>
                  {group.items.map((item) => {
                    const active = pathname === item.path;
                    return (
                      <Link key={item.path} href={item.path} onClick={closeMobileMenu} className={itemCls(active)}>
                        {item.name}
                        {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#e91e3f] shadow-[0_0_8px_rgba(233,30,63,0.8)]"></span>}
                      </Link>
                    );
                  })}
                </div>
              ))}

              {accountItems.length > 0 && (
                <div className="mt-6">
                  <div className="flex items-center gap-2 px-3 mb-1.5">
                    <span className="w-3 h-px bg-[#e91e3f]/70"></span>
                    <p className={`text-[11px] font-black tracking-[0.14em] ${isLightPage ? "text-[#8a8a8a]" : "text-gray-500"}`}>계정</p>
                  </div>
                  {accountItems.map((item) =>
                    item.path ? (
                      <Link key={item.name} href={item.path} onClick={closeMobileMenu} className={itemCls(pathname === item.path, item.accent)}>{item.name}</Link>
                    ) : (
                      <button key={item.name} onClick={item.onClick} className={itemCls(false)}>{item.name}</button>
                    )
                  )}
                </div>
              )}
            </div>

            {/* ── 푸터 ── */}
            <div className={`relative shrink-0 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${isLightPage ? "border-black/[0.07]" : "border-white/[0.07]"}`}>
              {status === "authenticated" && session ? (
                <button onClick={() => { closeMobileMenu(); signOut(); }} className="w-full text-left px-3 py-3 rounded-xl text-sm font-black text-[#e91e3f] active:bg-[#e91e3f]/10 transition-colors outline-none">로그아웃</button>
              ) : (
                <button onClick={() => { closeMobileMenu(); signIn("discord", { callbackUrl: "/" }); }} className="w-full py-3 rounded-full bg-[#5865F2] active:bg-[#4752C4] text-white text-sm font-bold transition-colors outline-none">Discord 로그인</button>
              )}

              <div className="flex items-center gap-4 px-3 pt-3">
                <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 active:text-white transition-colors font-medium">Discord</a>
                <a href="https://open.kakao.com/o/gJDUnf0e" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 active:text-white transition-colors font-medium">Kakao Talk</a>
              </div>

              <div className="flex items-center gap-3 px-3 pt-3 pb-1">
                <Link href="/policy" onClick={closeMobileMenu} className="text-[11px] text-gray-600 active:text-gray-400 transition-colors">이용약관</Link>
                <span className="w-px h-2.5 bg-white/10"></span>
                <Link href="/policy?tab=privacy" onClick={closeMobileMenu} className="text-[11px] text-gray-600 active:text-gray-400 transition-colors">개인정보처리방침</Link>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}