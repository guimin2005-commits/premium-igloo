"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";
import { RenderFormattedText } from "../components/FormattedText";
import Link from "next/link";
import { ADMIN_USERS, isAdminName } from "@/lib/admins";
import { verifyBadge } from "@/lib/verifyBadge";
import ArcticDock from "../shop/ArcticDock";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
import { salePrice } from "@/lib/shopPricing";

// 미리보기(접힘)용 마크다운 기호 제거
const stripMd = (t: string) =>
  (t || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1")
    .replace(/\{([^}]+)\}/g, "$1");

// 통지 유형별 색상
const NOTI_TYPE_STYLES: Record<string, string> = {
  경고: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25",
  제재: "bg-[#fdf1e3] text-[#a8763a] border-[#f0dcc0]",
  안내: "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]",
  축하: "bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]",
  일반: "bg-[#f4f3f2] text-[#4b4b4b] border-[#dedddb]",
};

// ARCTIC 주문 상태 표기
const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "처리 대기", cls: "bg-[#fdf3e3] text-[#a8763a]" },
  completed: { label: "완료", cls: "bg-[#e8f3e6] text-[#3f7a35]" },
  cancelled: { label: "취소", cls: "bg-[#fdeaea] text-[#c62828]" },
};
const ITEM_TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };

export default function MyInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const searchParams = useSearchParams();

  // ── ARCTIC 연동 ──────────────────────────────
  //    공개 전에는 관리자만 볼 수 있으므로, 구역 자체를 숨긴다
  const [shopPublic, setShopPublic] = useState(false);
  const [levelPublic, setLevelPublic] = useState(false);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [shopWallet, setShopWallet] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [shopMe, setShopMe] = useState<any>(null);
  const [shopWish, setShopWish] = useState<string[]>([]);
  const [shopCart, setShopCart] = useState<{ itemId: string; qty: number }[]>([]);
  // 📌 아이콘을 누르면 아래에 펼쳐지는 패널 — 어느 것을 열었는지
  const [panel, setPanel] = useState("notice");
  // 인벤토리·서포터즈 요약 (패널용)
  const [myItems, setMyItems] = useState<any[] | null>(null);
  const [supMe, setSupMe] = useState<any>(null);

  const isShopAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);
  // SYSTEM : LEVEL 비공개 동안은 레벨·순위·ARCTIC 이 일반 유저 프로필에 보이지 않는다 (10월 공개)
  const canSeeLevel = levelPublic || isShopAdmin;
  const canSeeShop = (shopPublic && levelPublic) || isShopAdmin;
  const shopPendingCount = shopOrders.filter((o) => o.status === "pending").length;

  const shopWishRows = shopItems.filter((i) => shopWish.includes(i._id));
  const shopCartRows = shopCart
    .map((c) => ({ ...c, item: shopItems.find((i) => i._id === c.itemId) }))
    .filter((r): r is { itemId: string; qty: number; item: any } => !!r.item);
  const shopCartCount = shopCart.reduce((n, c) => n + (c.qty || 1), 0);
  const shopCartTotal = shopCartRows.reduce((n, r) => n + salePrice(r.item) * r.qty, 0);

  // 찜·장바구니는 브라우저에 보관하므로 화면과 저장소를 함께 갱신한다
  const removeShopWish = (id: string) =>
    setShopWish((prev) => {
      const next = prev.filter((x) => x !== id);
      try { localStorage.setItem("iglooShopWish", JSON.stringify(next)); } catch {}
      return next;
    });
  const removeShopCart = (id: string) =>
    setShopCart((prev) => {
      const next = prev.filter((c) => c.itemId !== id);
      try { localStorage.setItem("iglooShopCart", JSON.stringify(next)); } catch {}
      return next;
    });

  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isServerBooster = userSession?.isBooster || false;
  // 서포터즈 진입점은 헤더 메뉴가 아니라 프로필에 둔다 (사용자 요청). 관리자는 확인용으로 항상 보인다.
  const isSupporter = userSession?.isSupporter || false;
  const canSeeSupporter = isSupporter || isAdminName(session?.user?.name);

  // 쿠폰 코드 등록 — 쿠폰함 패널 안
  const [couponInput, setCouponInput] = useState("");
  const [isRegisteringCoupon, setIsRegisteringCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const registerCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || isRegisteringCoupon) return;
    setIsRegisteringCoupon(true);
    setCouponMsg(null);
    try {
      const res = await fetch("/api/shop/my-coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const d = await res.json();
      if (res.ok && d.success) {
        setCouponMsg({ ok: true, text: d.message || "쿠폰을 받았습니다." });
        setCouponInput("");
        Promise.all([
          fetch("/api/shop/my-coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
          fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]).then(([cou, me]) => {
          setShopWallet(Array.isArray(cou?.data) ? cou.data : []);
          if (me?.success) setShopMe(me.data);
        });
      } else {
        setCouponMsg({ ok: false, text: d.message || "사용할 수 없는 코드입니다." });
      }
    } catch {
      setCouponMsg({ ok: false, text: "서버와 통신 중 오류가 발생했습니다." });
    } finally {
      setIsRegisteringCoupon(false);
    }
  };

  // 인벤토리·서포터즈 요약 — 패널을 열기 전에 미리 받아 둔다 (개수 배지에도 쓴다)
  useEffect(() => {
    if (status !== "authenticated") return;
    if (canSeeLevel) {
      fetch("/api/shop/my-items", { cache: "no-store" }).then((r) => r.json())
        .then((d) => setMyItems(Array.isArray(d?.data?.items) ? d.data.items : []))
        .catch(() => setMyItems([]));
    }
  }, [status, canSeeLevel]);
  useEffect(() => {
    if (status !== "authenticated" || !canSeeSupporter) return;
    fetch("/api/supporters/me", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d?.success) setSupMe(d); })
      .catch(() => {});
  }, [status, canSeeSupporter]);

  useEffect(() => {
    fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setShopPublic(!!d?.data?.shopPublic); setLevelPublic(!!d?.data?.levelPublic); })
      .catch(() => {});
    try {
      const w = localStorage.getItem("iglooShopWish");
      if (w) setShopWish(JSON.parse(w));
      const c = localStorage.getItem("iglooShopCart");
      if (c) setShopCart(JSON.parse(c));
    } catch {}
  }, []);

  // 내 XP·레벨은 ARCTIC과 무관한 기본 정보라 항상 읽는다
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/xp/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((me) => { if (me?.success) setShopMe(me.data); })
      .catch(() => {});
  }, [status]);

  // ARCTIC 데이터는 볼 수 있는 사람에게만 요청한다
  useEffect(() => {
    if (status !== "authenticated" || !canSeeShop) return;
    Promise.all([
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/my-coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/items", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([ord, cou, it]) => {
      setShopOrders(Array.isArray(ord?.data) ? ord.data : []);
      setShopWallet(Array.isArray(cou?.data) ? cou.data : []);
      setShopItems(Array.isArray(it?.data) ? it.data : []);
    });
  }, [status, canSeeShop]);

  // 📌 ?tab= 으로 들어오면 그 패널을 연다 (옛 링크 호환: arctic → 주문 내역)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    window.scrollTo(0, 0);
    if (!tabParam) return;
    const map: Record<string, string> = { arctic: "orders", notice: "notice", inquiry: "inquiry", recruit: "recruit", orders: "orders", cart: "cart", wish: "wish", coupons: "coupons", bag: "bag", booster: "booster", supporter: "supporter", team: "team" };
    if (map[tabParam]) setPanel(map[tabParam]);
  }, [searchParams]);

  const [inquiryFilter, setInquiryFilter] = useState("all");
  const [recruitFilter, setRecruitFilter] = useState("all");
  const [fetchedInquiries, setFetchedInquiries] = useState<any[]>([]);
  const [fetchedRecruits, setFetchedRecruits] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // 📌 관리자 알림함
  const [notifications, setNotifications] = useState<any[]>([]);
  // 📌 대회 팀 룸 — 로스터에서 내 디스코드 ID 를 찾아 바로가기를 띄운다
  const [myTeam, setMyTeam] = useState<any>(null);
  const [scrimAdmin, setScrimAdmin] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);



  useEffect(() => {
    if (status === "authenticated" && session?.user?.name) {
      setIsDataLoading(true);
      Promise.all([
        fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" }).then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch(`/api/user/applies?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" }).then(res => res.json()).catch(() => ({ success: false, data: [] }))
      ]).then(([inqRes, recRes]) => {
        if (inqRes?.success && Array.isArray(inqRes.data)) {
          setFetchedInquiries(inqRes.data.map((item: any) => ({
            id: item._id, type: item.mainType || "일반 문의", title: item.title || "제목 없음",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : "날짜 없음",
            createdAt: item.createdAt, updatedAt: item.updatedAt, answeredAt: item.answeredAt,
            status: item.status, content: item.content, answer: item.answer
          })));
        }
        if (recRes?.success && Array.isArray(recRes.data)) {
          setFetchedRecruits(recRes.data.map((item: any) => ({
            id: item._id, title: `${item.position || "스태프"} 지원서`, role: item.position || "스태프",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : "날짜 없음", 
            status: item.status || "심사 중"
          })));
        }
      }).catch(err => console.error("데이터 로드 실패:", err)).finally(() => setIsDataLoading(false));
    }
  }, [status, session]);

  // 📌 관리자 알림 로드 (닉네임 + 디스코드 ID 매칭)
  const loadNotifications = () => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const uid = (session.user as any)?.id;
    const qs = `user=${encodeURIComponent(session.user.name)}${uid ? `&id=${encodeURIComponent(uid)}` : ""}`;
    fetch(`/api/notifications?${qs}`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => { if (data?.success && Array.isArray(data.data)) setNotifications(data.data); })
      .catch(() => {});
  };
  useEffect(() => { loadNotifications(); }, [status, session]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/room", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        setScrimAdmin(!!d.isAdmin);
        const t = (d.teams || []).find((x: any) => (x.members || []).some((m: any) => m.discordId && m.discordId === d.me));
        if (!t) return;
        const ids = new Set((t.avail || []).map((a: any) => a.userId));
        setMyTeam({ ...t, sent: (t.members || []).filter((m: any) => ids.has(m.discordId)).length, mySent: ids.has(d.me) });
      })
      .catch(() => {});
  }, [status]);

  // 📌 내 정보에 들어오면 안 읽은 알림을 읽음 처리 (알림함이 이 페이지에 펼쳐져 있다)
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    if (!notifications.some((n) => !n.read)) return;
    const uid = (session.user as any)?.id;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true, user: session.user.name, id: uid }),
    })
      .then(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))))
      .catch(() => {});
  }, [notifications, status, session]);

  const executeCancelApply = async () => {
    if (!cancelConfirmId) return;
    try {
      const res = await fetch(`/api/user/applies?id=${cancelConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setFetchedRecruits(prev => prev.filter(rec => rec.id !== cancelConfirmId));
        alert("지원이 정상적으로 취소되었습니다.");
      } else {
        alert("지원 취소 중 오류가 발생했습니다.");
      }
    } catch (e) {
      alert("서버와 통신하는 중 문제가 발생했습니다.");
    } finally {
      setCancelConfirmId(null);
    }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full text-[#131313] flex-1 flex flex-col justify-center items-center px-6 py-40 text-center animate-in fade-in duration-500 break-keep">
        <h2 className="text-2xl font-black text-[#131313] mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-[#5a5a5a] mb-8 text-sm">내 정보를 확인하시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord", { callbackUrl: "/profile" })} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">
          Discord 로그인
        </button>
      </main>
    );
  }

  const filteredInquiries = fetchedInquiries.filter(inq => {
    if (inquiryFilter === "pending") return inq.status === "접수 중";
    if (inquiryFilter === "completed") return inq.status === "답변 완료";
    return true;
  });

  const filteredRecruits = fetchedRecruits.filter(rec => {
    if (recruitFilter === "all") return true;
    if (recruitFilter === "불합격") return rec.status === "불합격" || rec.status === "취소/반려" || rec.status === "취소";
    return rec.status === recruitFilter;
  });

  // 어디서 왔는지 — 링크가 ?from= 으로 알려준다 (referrer 는 못 믿는다)
  const BACK_TARGETS: Record<string, { href: string; label: string }> = {
    arctic: { href: "/level?tab=arctic", label: "스토어로" },
    level: { href: "/level", label: "대시보드로" },
  };
  const backTo = BACK_TARGETS[searchParams.get("from") || ""] || null;

  return (
    <main className="w-full flex-1 flex flex-col relative text-[#131313] animate-in fade-in duration-500">
      <LuxStyles />

      {/* ── 프로필 카드 (ARCTIC 마이페이지와 같은 구성) ── */}
      {/* 📌 돌아갈 길 — 스토어에서 프로필로 나오면 되돌아갈 수단이 없어서,
             모바일에서는 전역 독의 레벨 → ARCTIC 알약까지 두 단계를 밟아야 했다.
             주문 내역을 훑다가도 바로 돌아갈 수 있게 헤더 아래에 붙여 둔다. */}
      {backTo && (
        <div className="sticky top-16 z-30 w-full bg-[#f4f3f2]/92 backdrop-blur-md border-b border-black/[0.06]">
          <div className="max-w-4xl mx-auto px-6 py-2.5">
            <Link
              href={backTo.href}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors"
            >
              <span aria-hidden>←</span> {backTo.label}
            </Link>
          </div>
        </div>
      )}

      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-2">

        {/* 📌 카드 없이 한 면 위에 — 이름·배지·레벨 한 줄·칩, 오른쪽에 잔액. 아래 헤어라인 하나로 구획한다 */}
        <div className="pb-6 border-b border-black/[0.08]">
          <div className="flex items-start gap-4 md:gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={session?.user?.image || ""} alt="" className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-[#dedddb] shrink-0 ${isBooster ? "ring-2 ring-[#e91e3f]/50 ring-offset-2 ring-offset-[#f4f3f2]" : ""}`} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight truncate flex items-center gap-2">
                {session?.user?.name}
                {isBooster && <span className="text-[10px] bg-[#e91e3f] text-white px-2 py-0.5 rounded shrink-0">BOOSTER</span>}
                {isSupporter && <span className="text-[10px] bg-[#3f83b8] text-white px-2 py-0.5 rounded shrink-0">SUPPORTERS</span>}
              </h1>
              {canSeeLevel && (
                <p className="text-[12px] font-bold text-[#8a8a8a] mt-0.5 tabular-nums">
                  Lv.{shopMe?.level ?? 0} · 서버 #{shopMe?.rank ?? "—"}
                </p>
              )}
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${verifyBadge(isVerified, hasScrimRole).cls}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                {verifyBadge(isVerified, hasScrimRole).label}
              </span>
              {isServerBooster && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 text-[#ff41cf] border border-[#ff41cf]/30">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d={ICON_PATHS.sparkles} /></svg>
                  SERVER BOOSTER
                </span>
              )}
              {isSupporter && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#3f83b8]/10 text-[#3f83b8] border border-[#3f83b8]/30">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.shieldCheck} /></svg>
                  SUPPORTERS
                </span>
              )}
          </div>
            </div>
            <div className="ml-auto text-right shrink-0 hidden sm:block">
              <div className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase mb-1">Balance</div>
              <div className="text-2xl font-black tracking-tight tabular-nums text-[#131313] leading-none">
                {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#e91e3f] ml-1">XP</span>
              </div>
              {canSeeShop && (
                <div className="text-[13px] font-black tabular-nums text-[#131313] leading-none mt-2">
                  {(shopMe?.point ?? 0).toLocaleString()}<span className="text-[10px] font-black text-[#3f9e93] ml-1">빙옥</span>
                </div>
              )}
            </div>
          </div>

          {/* 모바일 잔액 */}
          <div className="sm:hidden mt-4 flex items-baseline justify-between">
            <span className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase">Balance</span>
            <span className="text-xl font-black tracking-tight tabular-nums text-[#131313] leading-none">
              {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#e91e3f] ml-1">XP</span>
              {canSeeShop && <span className="ml-3 text-[13px]">{(shopMe?.point ?? 0).toLocaleString()}<span className="text-[10px] font-black text-[#3f9e93] ml-1">빙옥</span></span>}
            </span>
          </div>

          {/* 레벨 진행 바 */}
          {canSeeLevel && shopMe?.levelProgress?.required > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#8a8a8a]">다음 레벨까지</span>
                <span className="text-[11px] font-bold text-[#4b4b4b] tabular-nums">{shopMe.levelProgress.needToNext.toLocaleString()} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#e9e8e6] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] transition-[width] duration-700"
                  style={{ width: `${Math.min(100, Math.round((shopMe.levelProgress.current / shopMe.levelProgress.required) * 100))}%` }}></div>
              </div>
            </div>
          )}
        </div>

      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pt-8 pb-16 flex-1 flex flex-col">

      {/* 내전 채널 이용 권한 획득 - 고정형 배너 */}
      {isVerified && !hasScrimRole && (
        <div className="w-full mb-10 border-b border-black/[0.08] flex items-center justify-between gap-4 pb-5">
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:flex shrink-0 items-center justify-center w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-[#131313] mb-0.5 break-keep">내전 채널 이용 권한 획득</h3>
              <p className="text-xs text-[#8a8a8a] leading-relaxed break-keep">운영 정책에 동의하고 내전 채널 입장 권한을 획득해 주세요.</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/verify")}
            className="shrink-0 self-center px-4 py-2 bg-[#e91e3f] text-white text-xs font-bold rounded-lg hover:bg-[#d01634] transition-colors outline-none whitespace-nowrap"
          >
            권한 획득
          </button>
        </div>
      )}

      {/* 📌 아이콘 줄 — 누르면 다른 화면으로 가지 않고 바로 아래에 그 내용이 펼쳐진다. 균등 격자, 선택은 잉크 타일. */}
      {(() => {
        // 공용 아이콘 세트(Icons.tsx) — 헤더·독·레벨과 같은 모양
        const ic: Record<string, string> = {
          notice: ICON_PATHS.bell,
          inquiry: ICON_PATHS.chat,
          recruit: ICON_PATHS.briefcase,
          orders: ICON_PATHS.receipt,
          cart: ICON_PATHS.cart,
          wish: ICON_PATHS.heart,
          coupons: ICON_PATHS.ticket,
          bag: ICON_PATHS.bag,
          booster: ICON_PATHS.sparkles,
          supporter: ICON_PATHS.shieldCheck,
          team: ICON_PATHS.users,
        };
        const unread = notifications.filter((n) => !n.read).length;
        const items: { k: string; l: string; n?: number; accent?: boolean; on?: boolean }[] = [
          { k: "notice", l: "알림", n: unread, accent: unread > 0 },
          { k: "inquiry", l: "문의", n: fetchedInquiries.filter((i) => i.status === "접수 중").length },
          { k: "recruit", l: "구인 지원", n: fetchedRecruits.filter((r) => r.status === "심사 중").length },
        ];
        if (canSeeLevel) items.push({ k: "bag", l: "인벤토리", n: myItems?.length || 0 });
        if (canSeeShop) {
          items.push({ k: "orders", l: "주문 내역", n: shopOrders.length, accent: shopPendingCount > 0 });
          items.push({ k: "cart", l: "장바구니", n: shopCartCount });
          items.push({ k: "wish", l: "찜", n: shopWishRows.length });
          items.push({ k: "coupons", l: "쿠폰함", n: shopWallet.length });
        }
        items.push({ k: "booster", l: "부스터", on: isServerBooster });
        if (canSeeSupporter) items.push({ k: "supporter", l: "서포터즈", on: isSupporter });
        if (myTeam || scrimAdmin) items.push({ k: "team", l: myTeam ? "팀 룸" : "대회 룸", on: !!myTeam });
        const cur = items.some((i) => i.k === panel) ? panel : "notice";
        const fmtHm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? `${m % 60}분` : ""}`.trim() : `${m}분`);
        const more = (href: string, label: string) => (
          <div className="mt-4 flex justify-end">
            <Link href={href} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">{label} →</Link>
          </div>
        );

        return (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-y-5">
              {items.map((q) => {
                const on = q.k === cur;
                return (
                  <button key={q.k} type="button" onClick={() => setPanel(q.k)} aria-pressed={on}
                    className="group flex flex-col items-center outline-none focus:outline-none">
                    <span className={`relative w-12 h-12 rounded-2xl transition-colors flex items-center justify-center ${on ? "bg-[#131313] text-white" : "bg-black/[0.045] text-[#131313] group-hover:bg-black/[0.09]"}`}>
                      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={ic[q.k]} /></svg>
                      {q.n != null && q.n > 0 && (
                        <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums ${q.accent ? "bg-[#e91e3f] text-white" : on ? "bg-white text-[#131313]" : "bg-[#131313] text-white"}`}>{q.n > 99 ? "99+" : q.n}</span>
                      )}
                      {q.on && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>}
                    </span>
                    <span className={`mt-1.5 text-[11px] font-bold transition-colors whitespace-nowrap ${on ? "text-[#131313]" : "text-[#8a8a8a] group-hover:text-[#131313]"}`}>{q.l}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택한 것만 아래에 — 위 아이콘 줄과 헤어라인 하나로 이어진다 */}
            <div key={cur} className="mt-8 pt-8 border-t border-black/[0.08] animate-in fade-in duration-300">
        {cur === "notice" && (
        <section id="sec-notice">
          <div>
            <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
              <h2 className="text-sm font-black text-[#131313]">
                알림함 {notifications.length > 0 && <span className="text-[#e91e3f]">{notifications.length}</span>}
              </h2>
            </div>
            {isDataLoading && notifications.length === 0 ? (
              <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
            ) : notifications.length === 0 ? (
              <p className="py-14 px-5 text-center text-sm text-[#8a8a8a] break-keep">받은 알림이 없습니다.</p>
            ) : (
              <div className="divide-y divide-black/[0.06] max-h-[480px] overflow-y-auto">
                {notifications.map((n) => {
                  const badge = NOTI_TYPE_STYLES[n.type] || NOTI_TYPE_STYLES["일반"];
                  return (
                    <button key={n._id} onClick={() => setSelectedNotif(n)} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                      <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${badge}`}>{n.type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0 shadow-[0_0_6px_rgba(233,30,63,0.8)]"></span>}
                          <h4 className={`text-sm font-bold truncate ${n.read ? "text-[#131313]" : "text-[#131313]"}`}>{n.title}</h4>
                        </div>
                        <p className="text-xs text-[#8a8a8a] truncate mt-0.5">{stripMd(n.content)}</p>
                      </div>
                      <span className="text-[11px] text-[#a3a3a3] shrink-0 hidden sm:block tabular-nums">{n.createdAt ? new Date(n.createdAt).toLocaleDateString("ko-KR") : ""}</span>
                      <svg className="w-4 h-4 text-[#a3a3a3] group-hover:text-[#5a5a5a] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
        )}

        {cur === "inquiry" && (
        <section id="sec-inquiry">
          <div>
            <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-black text-[#131313]">
                1:1 문의 내역 {fetchedInquiries.length > 0 && <span className="text-[#e91e3f]">{fetchedInquiries.length}</span>}
              </h2>
              <div className="flex gap-1.5">
                {[{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }].map(f => (
                  <button key={f.key} onClick={() => setInquiryFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${inquiryFilter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-transparent border-[#dedddb] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            {isDataLoading ? <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p> : filteredInquiries.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-[#8a8a8a] break-keep">등록된 문의 내역이 없습니다.</p>
            ) : (
              <div className="divide-y divide-black/[0.06] max-h-[480px] overflow-y-auto">
                {filteredInquiries.map(inq => (
                  <button key={inq.id} onClick={() => setSelectedInquiry(inq)} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                    <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${inq.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25' : 'bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]'}`}>{inq.status}</span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-[#131313] truncate"><span className="text-[#8a8a8a] font-medium mr-1.5">[{inq.type}]</span>{inq.title}</h4>
                      <p className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{inq.date}</p>
                    </div>
                    <svg className="w-4 h-4 text-[#a3a3a3] group-hover:text-[#5a5a5a] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
        )}

        {cur === "recruit" && (
        <section id="sec-recruit">
          <div>
            <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-black text-[#131313]">
                구인 지원 목록 {fetchedRecruits.length > 0 && <span className="text-[#e91e3f]">{fetchedRecruits.length}</span>}
              </h2>
              <div className="flex gap-1.5 flex-wrap">
                {[{ label: "전체", key: "all" }, { label: "심사 중", key: "심사 중" }, { label: "합격", key: "합격" }, { label: "불합격", key: "불합격" }].map(f => (
                  <button key={f.key} onClick={() => setRecruitFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${recruitFilter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-transparent border-[#dedddb] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-black/[0.06] max-h-[480px] overflow-y-auto">
              {isDataLoading ? <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p> : filteredRecruits.length === 0 ? <p className="text-[#8a8a8a] text-sm py-14 text-center break-keep">해당 조건의 지원 내역이 없습니다.</p> : (
                filteredRecruits.map(rec => (
                  <div key={rec.id} className="py-4 px-1 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors">
                    <div>
                      <h4 className="text-base font-bold text-[#131313] mb-1">{rec.title}</h4>
                      <p className="text-xs text-[#8a8a8a]">분야: <span className="text-[#4b4b4b] font-medium">{rec.role}</span> | 일자: {rec.date}</p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rec.status === '합격' ? 'bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]' : rec.status === '취소' || rec.status === '취소/반려' || rec.status === '불합격' ? 'bg-[#fdeaea] text-[#c62828] border-[#f5cdcd]' : 'bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]'}`}>{rec.status}</span>
                      {rec.status === "심사 중" && (
                        <button onClick={() => setCancelConfirmId(rec.id)} className="text-xs font-bold px-3 py-1 bg-[#e9e8e6] text-[#4b4b4b] hover:bg-[#e91e3f] hover:text-white rounded-full transition-colors outline-none focus:outline-none">지원 취소</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
        )}

        {/* ═══ 인벤토리 — 보유 아이템 격자. 본진은 SYSTEM : LEVEL ═══ */}
        {cur === "bag" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">인벤토리 {(myItems?.length || 0) > 0 && <span className="text-[#e91e3f]">{myItems!.length}</span>}</h2>
          </div>
          {myItems === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : myItems.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">아직 보유한 아이템이 없습니다.</p>
          ) : (
            <div className="pt-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {myItems.map((it: any) => {
                const c = it.color || "#131313";
                const dim = it.status === "pending" || it.status === "missing";
                return (
                  <div key={it.uid} className="flex flex-col items-center text-center">
                    <span className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}33` }}>
                      <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.source === "level" ? "level" : it.type} size={26} color={c} dim={dim} />
                    </span>
                    <span className="mt-1.5 text-[11px] font-bold text-[#131313] leading-tight line-clamp-2 break-keep">{it.name}</span>
                    <span className="text-[10px] text-[#a3a3a3] tabular-nums">
                      {it.status === "pending" ? "지급 대기" : it.status === "missing" ? "역할 없음" : it.expiresAt ? `D-${Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000))}` : it.source === "level" ? "레벨 보상" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {more("/level?tab=my", "SYSTEM : LEVEL 에서 자세히")}
        </section>
        )}

        {/* ═══ 주문 내역 ═══ */}
        {cur === "orders" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">주문 내역 {shopOrders.length > 0 && <span className="text-[#e91e3f]">{shopOrders.length}</span>}</h2>
          </div>
          {shopOrders.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">아직 구매한 상품이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06] max-h-[480px] overflow-y-auto">
              {shopOrders.map((o) => {
                const meta = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
                return (
                  <div key={o._id} className="py-3.5 px-1">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${meta.cls}`}>{meta.label}</span>
                      <div className="min-w-0 flex-1">
                        <Link href={`/shop/item/${o.itemId}`} className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">{o.itemName}</Link>
                        <p className="text-[10px] text-[#a3a3a3]">
                          {ITEM_TYPE_LABEL[o.itemType] || "상품"} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString("ko-KR") : ""}
                        </p>
                      </div>
                      <span className={`text-[12px] font-black tabular-nums shrink-0 ${o.status === "cancelled" ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>
                        -{(o.price || 0).toLocaleString()} {o.payMethod === "point" ? "빙옥" : "XP"}
                      </span>
                    </div>
                    {o.adminNote && <p className="mt-1.5 text-[10px] text-[#3f7a35] bg-[#e8f3e6] rounded px-2 py-1 break-keep">운영진 메모 · {o.adminNote}</p>}
                    {o.error && <p className="mt-1.5 text-[10px] text-[#c62828] bg-[#fdeaea] rounded px-2 py-1 break-keep">지급 실패 · {o.error}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        )}

        {/* ═══ 장바구니 ═══ */}
        {cur === "cart" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">장바구니 {shopCartRows.length > 0 && <span className="text-[#e91e3f]">{shopCartRows.length}</span>}</h2>
          </div>
          {shopCartRows.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">장바구니가 비어 있습니다.</p>
          ) : (
            <>
              <div className="divide-y divide-black/[0.06] max-h-[400px] overflow-y-auto">
                {shopCartRows.map((r) => (
                  <div key={r.itemId} className="py-3.5 px-1 flex items-center gap-3">
                    <Link href={`/shop/item/${r.item._id}`} className="w-11 h-11 rounded-lg bg-[#e9e8e6] overflow-hidden shrink-0 flex items-center justify-center">
                      <ItemIcon icon={r.item.icon} imageUrl={r.item.imageUrl || r.item.itemImageUrl} type={r.item.type} size={r.item.imageUrl || r.item.itemImageUrl ? 44 : 22} color={r.item.color || undefined} />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link href={`/shop/item/${r.item._id}`} className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">{r.item.name}</Link>
                      <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(r.item).toLocaleString()} XP</p>
                    </div>
                    <button onClick={() => removeShopCart(r.itemId)} className="px-3 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors shrink-0">삭제</button>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-black/[0.06] flex items-center justify-between gap-3">
                <div className="text-[12px]">
                  <span className="text-[#5a5a5a]">합계 </span>
                  <span className="font-black text-[#131313] tabular-nums">{shopCartTotal.toLocaleString()} XP</span>
                </div>
                <Link href="/shop/cart" className="px-5 py-2.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[12px] font-bold transition-colors shrink-0">결제하러 가기</Link>
              </div>
            </>
          )}
        </section>
        )}

        {/* ═══ 찜한 상품 ═══ */}
        {cur === "wish" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">찜한 상품 {shopWishRows.length > 0 && <span className="text-[#e91e3f]">{shopWishRows.length}</span>}</h2>
          </div>
          {shopWishRows.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a]">찜한 상품이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06] max-h-[480px] overflow-y-auto">
              {shopWishRows.map((it) => (
                <div key={it._id} className="py-3.5 px-1 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-[#e9e8e6] overflow-hidden shrink-0 flex items-center justify-center">
                    <ItemIcon icon={it.icon} imageUrl={it.imageUrl || it.itemImageUrl} type={it.type} size={it.imageUrl || it.itemImageUrl ? 44 : 22} color={it.color || undefined} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#131313] truncate">{it.name}</p>
                    <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(it).toLocaleString()} XP</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/shop/item/${it._id}`} className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#e91e3f] text-white hover:bg-[#d01634] transition-colors">보러가기</Link>
                    <button onClick={() => removeShopWish(it._id)} className="px-2 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors">해제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* ═══ 쿠폰함 — 등록 + 보유 ═══ */}
        {cur === "coupons" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">쿠폰함 {shopWallet.length > 0 && <span className="text-[#e91e3f]">{shopWallet.length}</span>}</h2>
          </div>
          <div className="pt-4 flex gap-2">
            <input type="text" value={couponInput} onChange={(e) => setCouponInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") registerCoupon(); }}
              placeholder="쿠폰 코드 입력"
              className="flex-1 min-w-0 bg-white border border-[#dedddb] rounded-lg px-3 py-2.5 text-[13px] text-[#131313] outline-none focus:border-[#e91e3f] uppercase placeholder:normal-case placeholder:text-[#a3a3a3]" />
            <button onClick={registerCoupon} disabled={!couponInput.trim() || isRegisteringCoupon}
              className="px-4 py-2.5 rounded-lg bg-[#131313] hover:bg-black text-white text-[12px] font-bold disabled:opacity-40 transition-colors shrink-0">
              {isRegisteringCoupon ? "확인" : "등록"}
            </button>
          </div>
          {couponMsg && <p className={`mt-2 text-[11px] font-bold break-keep ${couponMsg.ok ? "text-[#3f7a35]" : "text-[#c62828]"}`}>{couponMsg.text}</p>}
          {shopWallet.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#8a8a8a]">보유한 쿠폰이 없습니다.</p>
          ) : (
            <div className="mt-4 divide-y divide-black/[0.06] max-h-[400px] overflow-y-auto border-t border-black/[0.06]">
              {shopWallet.map((w) => (
                <div key={w.id} className="py-3.5 px-1 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center shrink-0">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-[#131313] truncate">{w.name}</p>
                    <p className="text-[10px] text-[#8a8a8a] break-keep">
                      {w.type === "percent" ? `${w.value}% 할인` : `${w.value.toLocaleString()} XP 할인`}
                      {w.minTotal > 0 && ` · ${w.minTotal.toLocaleString()} XP 이상`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        )}

        {/* ═══ 부스터 — 상태와 핵심 혜택만, 전문은 /profile/booster ═══ */}
        {cur === "booster" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
              서버 부스터 혜택
              {isServerBooster && <span className="text-[10px] bg-[#e91e3f] text-white px-2 py-0.5 rounded">적용 중</span>}
            </h2>
          </div>
          <div className="divide-y divide-black/[0.06]">
            {[
              { t: "전용 역할·뱃지", d: "@SERVER BOOSTER 역할과 프로필 배지" },
              { t: "부스팅 시작", d: "즉시 지급", v: "100,000 XP" },
              { t: "상시 추가", d: "XP 획득 조건마다", v: "+2,000 XP" },
              { t: "ARCTIC 환급", d: "사용한 XP 기준", v: "35%" },
              { t: "일일 출석", d: "출석체크마다 추가", v: "10,000 XP" },
              { t: "권한 제한 채널·슬로우 모드 해제", d: "별도 구매 없이 이용" },
            ].map((r) => (
              <div key={r.t} className="py-3.5 px-1 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-[#131313]">{r.t}</p>
                  <p className="text-[11px] text-[#8a8a8a] break-keep">{r.d}</p>
                </div>
                {r.v && <span className="text-[12px] font-black text-[#e91e3f] tabular-nums shrink-0">{r.v}</span>}
              </div>
            ))}
          </div>
          {more("/profile/booster", "누적 유지·특별 보상까지 전체 보기")}
        </section>
        )}

        {/* ═══ 서포터즈 — 이번 달 활동·최근 평가 요약, 본진은 /supporters ═══ */}
        {cur === "supporter" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
              서포터즈
              {isSupporter && <span className="text-[10px] bg-[#3f83b8] text-white px-2 py-0.5 rounded">활동 중</span>}
            </h2>
            {supMe?.month && <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{supMe.month.replace("-", ".")}</span>}
          </div>
          {!supMe ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : (
            <>
              <div className="pt-4 grid grid-cols-2 gap-6">
                {[
                  { l: "채팅", v: `${(supMe.activity?.chatCount || 0).toLocaleString()}회`, cur: supMe.activity?.chatCount || 0, goal: supMe.goals?.chat || 0 },
                  { l: "음성", v: fmtHm(supMe.activity?.voiceMin || 0), cur: supMe.activity?.voiceMin || 0, goal: supMe.goals?.voiceMin || 0 },
                ].map((m) => (
                  <div key={m.l}>
                    <p className="text-[11px] font-bold text-[#8a8a8a]">{m.l}</p>
                    <p className="text-lg font-black text-[#131313] tabular-nums">{m.v}</p>
                    {m.goal > 0 && (
                      <>
                        <div className="mt-2 h-1 rounded-full bg-black/[0.06] overflow-hidden">
                          <div className="h-full rounded-full bg-[#3f83b8]" style={{ width: `${Math.min(100, Math.round((m.cur / m.goal) * 100))}%` }}></div>
                        </div>
                        <p className="mt-1 text-[10px] text-[#a3a3a3] tabular-nums">목표 {m.l === "채팅" ? `${m.goal.toLocaleString()}회` : fmtHm(m.goal)}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {Array.isArray(supMe.evals) && supMe.evals.length > 0 && (
                <div className="mt-5 pt-4 border-t border-black/[0.06] flex items-center gap-3 text-[12px]">
                  <span className="font-bold text-[#8a8a8a] tabular-nums">{supMe.evals[0].month.replace("-", ".")} 평가</span>
                  <span className="font-black text-[#131313]">{supMe.evals[0].grade || "—"}</span>
                  <span className="text-[#5a5a5a] tabular-nums truncate">
                    {supMe.evals[0].xp > 0 ? `+${supMe.evals[0].xp.toLocaleString()} XP` : ""}{supMe.evals[0].xp > 0 && supMe.evals[0].point > 0 ? " · " : ""}{supMe.evals[0].point > 0 ? `+${supMe.evals[0].point.toLocaleString()} 빙옥` : ""}
                  </span>
                  <span className={`ml-auto text-[10px] font-black ${supMe.evals[0].status === "paid" ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>{supMe.evals[0].status === "paid" ? "지급 완료" : "평가 중"}</span>
                </div>
              )}
            </>
          )}
          {more("/supporters", "활동 · 평가 · 공지 전체 보기")}
        </section>
        )}

        {/* ═══ 팀 룸 / 대회 룸 ═══ */}
        {cur === "team" && (
        <section>
          <div className="pb-3 border-b border-black/[0.08] flex items-center justify-between">
            <h2 className="text-sm font-black text-[#131313]">{myTeam ? "팀 룸" : "대회 룸 운영"}</h2>
          </div>
          {myTeam ? (
            <div className="pt-4 flex items-center gap-4">
              <span className="grid place-items-center shrink-0 w-14 h-14 rounded-2xl text-[15px] font-black tracking-tight"
                style={{ background: `${myTeam.color}1c`, boxShadow: `inset 0 0 0 1px ${myTeam.color}55`, color: myTeam.color }}>
                {myTeam.tag || "TM"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-black text-[#131313] truncate">{myTeam.name}</p>
                <p className="text-[12px] text-[#5a5a5a] break-keep mt-0.5">
                  {myTeam.mySent
                    ? (myTeam.sent >= myTeam.members.length ? "팀 전원이 일정을 냈습니다 — 스크림 매칭 대기" : `내 일정은 제출했습니다 · ${myTeam.members.length - myTeam.sent}명 남음`)
                    : "아직 내 일정을 내지 않았습니다"}
                </p>
              </div>
              <span className="shrink-0 text-right">
                <span className="block text-[9px] font-black text-[#a3a3a3] tracking-[0.2em]">PLAN</span>
                <span className="block text-xl font-black tabular-nums" style={{ color: myTeam.sent >= myTeam.members.length ? "#00a862" : "#c98a00" }}>{myTeam.sent}/{myTeam.members.length}</span>
              </span>
            </div>
          ) : (
            <p className="pt-4 text-[12px] text-[#5a5a5a]">팀 등록 · 대회 공지 · 스크림 매칭</p>
          )}
          {more(myTeam ? `/tournament/team/${myTeam._id}` : "/admin/room", myTeam ? "팀 룸 열기" : "대회 룸 열기")}
        </section>
        )}
            </div>
          </>
        );
      })()}

      {/* 📌 통지 상세 모달 (사무적 통지서) */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setSelectedNotif(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#dedddb] rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">Official Notice · 운영팀 통지</span>
              <button onClick={() => setSelectedNotif(null)} className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f4f3f2] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>
            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[selectedNotif.type] || NOTI_TYPE_STYLES["일반"]}`}>{selectedNotif.type}</span>
                <span className="ml-auto text-[11px] text-[#a3a3a3] tabular-nums">{selectedNotif.createdAt ? new Date(selectedNotif.createdAt).toLocaleString("ko-KR") : ""}</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-[#131313] break-keep leading-snug mb-5">{selectedNotif.title}</h3>

              <div className="rounded-lg border border-[#ececea] bg-white divide-y divide-[#ececea] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-[#8a8a8a] font-bold">수신</span>
                  <span className="text-[#4b4b4b] font-bold">{session?.user?.name}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-[#8a8a8a] font-bold">발신</span>
                  <span className="text-[#4b4b4b] font-bold">고급 이글루 운영팀{selectedNotif.sentBy ? ` (${selectedNotif.sentBy})` : ""}</span>
                </div>
              </div>

              <div className="text-sm text-[#4b4b4b] leading-relaxed break-keep">
                <RenderFormattedText text={selectedNotif.content} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📌 문의 상세 모달 (사무적) */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setSelectedInquiry(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#dedddb] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">1:1 문의 내역</span>
              <button onClick={() => setSelectedInquiry(null)} className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f4f3f2] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>

            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${selectedInquiry.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25' : 'bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]'}`}>{selectedInquiry.status}</span>
                <span className="text-[11px] text-[#a3a3a3] font-medium">[{selectedInquiry.type}]</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-[#131313] break-keep leading-snug mb-5">{selectedInquiry.title}</h3>

              <div className="rounded-lg border border-[#ececea] bg-white divide-y divide-[#ececea] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-[#8a8a8a] font-bold">접수일시</span>
                  <span className="text-[#4b4b4b] font-bold tabular-nums">{selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString("ko-KR") : selectedInquiry.date}</span>
                </div>
                {selectedInquiry.status === '답변 완료' && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="text-[#e91e3f] font-bold">답변일시</span>
                    <span className="text-[#4b4b4b] font-bold tabular-nums">{selectedInquiry.answeredAt ? new Date(selectedInquiry.answeredAt).toLocaleString("ko-KR") : selectedInquiry.updatedAt ? new Date(selectedInquiry.updatedAt).toLocaleString("ko-KR") : "처리 완료"}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] font-black tracking-wide text-[#8a8a8a] uppercase mb-2">문의 내용</p>
              <div className="text-sm text-[#4b4b4b] leading-relaxed whitespace-pre-wrap break-keep">
                {selectedInquiry.content}
              </div>

              {selectedInquiry.answer && (
                <div className="mt-6 bg-[#e91e3f]/[0.04] border border-[#e91e3f]/20 p-5 rounded-lg">
                  <span className="text-[11px] font-black text-[#e91e3f] tracking-wide uppercase mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>운영팀 답변
                  </span>
                  <p className="text-sm text-[#4b4b4b] leading-relaxed break-keep whitespace-pre-wrap">{selectedInquiry.answer}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cancelConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#131313]/45 backdrop-blur-sm p-4 overlay-in">
          <div className="bg-white border border-[#dedddb] rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-[#131313] mb-3">지원 취소 확인</h2>
            <p className="text-sm text-[#5a5a5a] mb-8 leading-relaxed">정말로 지원을 취소하시겠습니까?<br/>취소 후에는 다시 지원해야 합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirmId(null)} className="flex-1 py-3 bg-[#e9e8e6] hover:bg-[#dedddb] text-[#131313] font-bold rounded-xl transition-colors">닫기</button>
              <button onClick={executeCancelApply} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-[#131313] font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">취소하기</button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* 📌 스토어에서 넘어왔으면 스토어 독을 그대로 세운다.
             전역 독으로 갈아타면 스토어로 돌아갈 칸이 없어 엄지로 한 번에 못 돌아간다.
             ClientLayout 이 이 경우 전역 독을 비우므로 두 겹이 되지 않는다. */}
      {backTo?.href === "/level?tab=arctic" && (
        <ArcticDock activeKey="me" cartCount={shopCartCount} wishCount={shopWish.length} />
      )}
    </main>
  );
}