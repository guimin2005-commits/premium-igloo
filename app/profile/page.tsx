"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";
import { RenderFormattedText } from "../components/FormattedText";
import Link from "next/link";
import { ADMIN_USERS } from "@/lib/admins";
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
  일반: "bg-[#f5f3f0] text-[#4b4b4b] border-[#e2e0dc]",
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
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [shopWallet, setShopWallet] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);
  const [shopMe, setShopMe] = useState<any>(null);
  const [shopWish, setShopWish] = useState<string[]>([]);
  const [shopCart, setShopCart] = useState<{ itemId: string; qty: number }[]>([]);

  const isShopAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);
  const canSeeShop = shopPublic || isShopAdmin;
  const shopPendingCount = shopOrders.filter((o) => o.status === "pending").length;

  const shopWishRows = shopItems.filter((i) => shopWish.includes(i._id));
  const shopCartRows = shopCart
    .map((c) => ({ ...c, item: shopItems.find((i) => i._id === c.itemId) }))
    .filter((r): r is { itemId: string; qty: number; item: any } => !!r.item);
  const shopCartTotal = shopCartRows.reduce((n, r) => n + salePrice(r.item) * r.qty, 0);
  const shopSpent = shopOrders.filter((o) => o.status !== "cancelled").reduce((n, o) => n + (o.price || 0), 0);

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

  // 쿠폰 코드 등록
  const [couponInput, setCouponInput] = useState("");
  const [isRegisteringCoupon, setIsRegisteringCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const registerCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code || isRegisteringCoupon) return;
    setIsRegisteringCoupon(true);
    setCouponMsg(null);
    try {
      const res = await fetch("/api/shop/my-coupons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setCouponMsg({ ok: true, text: d.message || "쿠폰을 받았습니다." });
        setCouponInput("");
        // 지갑·XP를 다시 읽어 반영
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

  useEffect(() => {
    fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setShopPublic(!!d?.data?.shopPublic))
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

  // 📌 예전 탭 링크(/profile?tab=inquiry)로 들어와도 해당 구역까지 내려준다
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    // 지정한 구역이 없으면 맨 위에서 시작한다 (이전 페이지의 스크롤 위치가 남지 않도록)
    if (!tabParam) { window.scrollTo(0, 0); return; }
    if (tabParam === "booster") { router.replace("/profile/booster"); return; }
    const t = setTimeout(() => {
      document.getElementById("sec-" + tabParam)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
    return () => clearTimeout(t);
  }, [searchParams, router]);

  const [inquiryFilter, setInquiryFilter] = useState("all");
  const [recruitFilter, setRecruitFilter] = useState("all");
  const [fetchedInquiries, setFetchedInquiries] = useState<any[]>([]);
  const [fetchedRecruits, setFetchedRecruits] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // 📌 관리자 알림함
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);

  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isServerBooster = userSession?.isBooster || false;

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

  return (
    <main className="w-full flex-1 flex flex-col relative text-[#131313] animate-in fade-in duration-500">
      <LuxStyles />

      {/* ── 프로필 카드 (ARCTIC 마이페이지와 같은 구성) ── */}
      <section className="w-full max-w-4xl mx-auto px-6 pt-10 pb-2">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-8 h-px bg-[#e91e3f]"></span>
          <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">My Account</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6">
          <div className="flex items-center gap-4 md:gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={session?.user?.image || ""} alt="" className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-[#e2e0dc] shrink-0 ${isBooster ? "ring-2 ring-[#e91e3f]/50 ring-offset-2 ring-offset-white" : ""}`} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight truncate flex items-center gap-2">
                {session?.user?.name}
                {isBooster && <span className="text-[10px] bg-[#e91e3f] text-white px-2 py-0.5 rounded shrink-0">BOOSTER</span>}
              </h1>
              <p className="text-[12px] font-bold text-[#8a8a8a] mt-0.5">Lv.{shopMe?.level ?? 0} · 서버 #{shopMe?.rank ?? "—"}</p>
            </div>
            <div className="ml-auto text-right shrink-0 hidden sm:block">
              <div className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase mb-1">Balance</div>
              <div className="text-2xl font-black tracking-tight tabular-nums text-[#131313] leading-none">
                {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#e91e3f] ml-1">XP</span>
              </div>
            </div>
          </div>

          {/* 모바일 보유 XP */}
          <div className="sm:hidden mt-4 flex items-baseline justify-between">
            <span className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase">Balance</span>
            <span className="text-xl font-black tracking-tight tabular-nums text-[#131313] leading-none">
              {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#e91e3f] ml-1">XP</span>
            </span>
          </div>

          {shopMe?.levelProgress?.required > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-[#8a8a8a]">다음 레벨까지</span>
                <span className="text-[11px] font-bold text-[#4b4b4b] tabular-nums">{shopMe.levelProgress.needToNext.toLocaleString()} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-[#eceae6] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] transition-[width] duration-700"
                  style={{ width: `${Math.min(100, Math.round((shopMe.levelProgress.current / shopMe.levelProgress.required) * 100))}%` }}></div>
              </div>
            </div>
          )}

          <div className="mt-5 pt-5 border-t border-[#ececea] flex items-center gap-2 flex-wrap">
              {isVerified && hasScrimRole ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#e8f3e6] text-[#3f7a35] border border-[#cfe5cb]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                  인증
                </span>
              ) : isVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#fdf3e3] text-[#a8763a] border border-[#f0dcc0]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                  일부 인증
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#fdeaea] text-[#c62828] border border-[#f5cdcd]">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" /></svg>
                  미인증
                </span>
              )}
              {isServerBooster && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 text-[#ff41cf] border border-[#ff41cf]/30">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M4.5 15.75l7.5-7.5 7.5 7.5" /><path d="M4.5 19.5l7.5-7.5 7.5 7.5" /></svg>
                  SERVER BOOSTER
                </span>
              )}
          </div>

          {/* ARCTIC 요약 — 볼 수 있는 사람에게만 */}
          {canSeeShop && (
            <div className="grid grid-cols-3 mt-5 pt-5 border-t border-[#ececea] divide-x divide-[#ececea]">
              {[
                { n: shopOrders.length, l: "전체 주문" },
                { n: shopPendingCount, l: "처리 대기", accent: shopPendingCount > 0 },
                { n: shopSpent, l: "사용한 XP" },
              ].map((s, i) => (
                <div key={i} className="text-center break-keep">
                  <div className={`text-lg font-black tabular-nums ${s.accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{s.n.toLocaleString()}</div>
                  <div className="text-[10px] font-bold tracking-[0.12em] text-[#8a8a8a] mt-0.5 uppercase">{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pt-8 pb-16 flex-1 flex flex-col">

      {/* 내전 채널 이용 권한 획득 - 고정형 배너 */}
      {isVerified && !hasScrimRole && (
        <div className="relative w-full mb-12 rounded-xl border border-[#e2e0dc] bg-white flex items-center justify-between gap-4 px-5 py-4">
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

      {/* 📌 탭도 바로가기 바도 없이, 카드로 나란히 펼친다 */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ═══ 알림함 ═══ */}
        <section id="sec-notice" className="scroll-mt-32">
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
              <h2 className="text-sm font-black text-[#131313]">
                알림함 {notifications.length > 0 && <span className="text-[#e91e3f]">{notifications.length}</span>}
              </h2>
            </div>
            {isDataLoading && notifications.length === 0 ? (
              <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
            ) : notifications.length === 0 ? (
              <div className="text-center py-14 px-5 break-keep">
                <p className="text-[#8a8a8a] text-sm mb-1">받은 알림이 없습니다.</p>
                <p className="text-xs text-[#a3a3a3]">운영팀이 보낸 경고·안내 등이 이곳에 도착합니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#ececea] max-h-[420px] overflow-y-auto">
                {notifications.map((n) => {
                  const badge = NOTI_TYPE_STYLES[n.type] || NOTI_TYPE_STYLES["일반"];
                  return (
                    <button key={n._id} onClick={() => setSelectedNotif(n)} className="w-full text-left py-3.5 px-5 flex items-center gap-3.5 hover:bg-[#faf9f7] transition-colors group outline-none">
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

        {/* ═══ 1:1 문의 내역 ═══ */}
        <section id="sec-inquiry" className="scroll-mt-32">
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-black text-[#131313]">
                1:1 문의 내역 {fetchedInquiries.length > 0 && <span className="text-[#e91e3f]">{fetchedInquiries.length}</span>}
              </h2>
              <div className="flex gap-1.5">
                {[{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }].map(f => (
                  <button key={f.key} onClick={() => setInquiryFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${inquiryFilter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-white border-[#e2e0dc] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            {isDataLoading ? <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p> : filteredInquiries.length === 0 ? (
              <p className="px-5 py-14 text-center text-sm text-[#8a8a8a] break-keep">등록된 문의 내역이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#ececea] max-h-[420px] overflow-y-auto">
                {filteredInquiries.map(inq => (
                  <button key={inq.id} onClick={() => setSelectedInquiry(inq)} className="w-full text-left py-3.5 px-5 flex items-center gap-3.5 hover:bg-[#faf9f7] transition-colors group outline-none">
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

        {/* ═══ 구인 지원 목록 ═══ */}
        <section id="sec-recruit" className="scroll-mt-32">
          <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-sm font-black text-[#131313]">
                구인 지원 목록 {fetchedRecruits.length > 0 && <span className="text-[#e91e3f]">{fetchedRecruits.length}</span>}
              </h2>
              <div className="flex gap-1.5 flex-wrap">
                {[{ label: "전체", key: "all" }, { label: "심사 중", key: "심사 중" }, { label: "합격", key: "합격" }, { label: "불합격", key: "불합격" }].map(f => (
                  <button key={f.key} onClick={() => setRecruitFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${recruitFilter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-white border-[#e2e0dc] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-[#ececea] max-h-[420px] overflow-y-auto">
              {isDataLoading ? <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p> : filteredRecruits.length === 0 ? <p className="text-[#8a8a8a] text-sm py-14 text-center break-keep">해당 조건의 지원 내역이 없습니다.</p> : (
                filteredRecruits.map(rec => (
                  <div key={rec.id} className="py-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-[#faf9f7] transition-colors">
                    <div>
                      <h4 className="text-base font-bold text-[#131313] mb-1">{rec.title}</h4>
                      <p className="text-xs text-[#8a8a8a]">분야: <span className="text-[#4b4b4b] font-medium">{rec.role}</span> | 일자: {rec.date}</p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rec.status === '합격' ? 'bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]' : rec.status === '취소' || rec.status === '취소/반려' || rec.status === '불합격' ? 'bg-[#fdeaea] text-[#c62828] border-[#f5cdcd]' : 'bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]'}`}>{rec.status}</span>
                      {rec.status === "심사 중" && (
                        <button onClick={() => setCancelConfirmId(rec.id)} className="text-xs font-bold px-3 py-1 bg-[#eceae6] text-[#4b4b4b] hover:bg-[#e91e3f] hover:text-white rounded-full transition-colors outline-none focus:outline-none">지원 취소</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* ═══ 서버 부스터 혜택 — 분량이 커서 전용 페이지로 분리 ═══ */}
        <section id="sec-booster" className="scroll-mt-32">
          <Link href="/profile/booster"
            className="group block bg-white rounded-2xl border border-[#e2e0dc] px-6 py-6 hover:border-[#a3a3a3] transition-colors">
            <div className="flex items-center gap-4">
              <span className="w-11 h-11 rounded-xl bg-[#ff41cf]/10 text-[#ff41cf] flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M4.5 15.75l7.5-7.5 7.5 7.5" /><path d="M4.5 19.5l7.5-7.5 7.5 7.5" /></svg>
              </span>
              <div className="min-w-0 flex-1 break-keep">
                <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
                  서버 부스터 혜택
                  {isServerBooster && <span className="text-[10px] bg-[#e91e3f] text-white px-2 py-0.5 rounded">적용 중</span>}
                </h2>
                <p className="text-xs text-[#8a8a8a] mt-1">전용 역할·XP 보너스·누적 개월 혜택을 확인해 주세요.</p>
              </div>
              <svg className="w-4 h-4 text-[#a3a3a3] group-hover:text-[#e91e3f] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </div>
          </Link>
        </section>
        </div>

        {/* ═══ ARCTIC — 공개 전에는 관리자만 볼 수 있다 ═══ */}
        {canSeeShop && (
          <section id="sec-arctic" className="scroll-mt-32 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="w-8 h-px bg-[#e91e3f]"></span>
                <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">ARCTIC</span>
                {!shopPublic && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#e91e3f]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>비공개
                  </span>
                )}
              </div>
              <Link href="/shop" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">ARCTIC 둘러보기</Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 주문 내역 */}
              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
                  <h2 className="text-sm font-black text-[#131313]">주문 내역 {shopOrders.length > 0 && <span className="text-[#e91e3f]">{shopOrders.length}</span>}</h2>
                  {shopOrders.length > 0 && (
                    <Link href="/shop/orders" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">자세히 보기</Link>
                  )}
                </div>
                {shopOrders.length === 0 ? (
                  <p className="px-5 py-12 text-center text-xs text-[#8a8a8a] break-keep">아직 구매한 상품이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-[#ececea] max-h-[320px] overflow-y-auto">
                    {shopOrders.slice(0, 8).map((o) => {
                      const meta = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
                      return (
                        <div key={o._id} className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black shrink-0 ${meta.cls}`}>{meta.label}</span>
                            <div className="min-w-0 flex-1">
                              <Link href={`/shop/item/${o.itemId}`} className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">{o.itemName}</Link>
                              <p className="text-[10px] text-[#a3a3a3]">
                                {ITEM_TYPE_LABEL[o.itemType] || "상품"} · {o.createdAt ? new Date(o.createdAt).toLocaleDateString("ko-KR") : ""}
                              </p>
                            </div>
                            <span className={`text-[12px] font-black tabular-nums shrink-0 ${o.status === "cancelled" ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>
                              -{(o.price || 0).toLocaleString()} XP
                            </span>
                          </div>
                          {o.adminNote && <p className="mt-1.5 text-[10px] text-[#3f7a35] bg-[#e8f3e6] rounded px-2 py-1 break-keep">운영진 메모 · {o.adminNote}</p>}
                          {o.error && <p className="mt-1.5 text-[10px] text-[#c62828] bg-[#fdeaea] rounded px-2 py-1 break-keep">지급 실패 · {o.error}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 장바구니 */}
              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#ececea] flex items-center justify-between">
                  <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-[#131313]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                    </svg>
                    장바구니 {shopCartRows.length > 0 && <span className="text-[#e91e3f]">{shopCartRows.length}</span>}
                  </h2>
                  {shopCartRows.length > 0 && (
                    <Link href="/shop/cart" className="text-[11px] font-bold text-[#e91e3f] hover:text-[#131313] transition-colors">자세히 보기</Link>
                  )}
                </div>
                {shopCartRows.length === 0 ? (
                  <p className="px-5 py-12 text-center text-xs text-[#8a8a8a] break-keep">장바구니가 비어 있습니다.</p>
                ) : (
                  <>
                    <div className="divide-y divide-[#ececea] max-h-[260px] overflow-y-auto">
                      {shopCartRows.map((r) => (
                        <div key={r.itemId} className="px-5 py-3.5 flex items-center gap-3">
                          <Link href={`/shop/item/${r.item._id}`} className="w-11 h-11 rounded-lg bg-[#eceae6] overflow-hidden shrink-0">
                            {r.item.imageUrl && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.item.imageUrl} alt="" className="w-full h-full object-cover" />
                            )}
                          </Link>
                          <div className="min-w-0 flex-1">
                            <Link href={`/shop/item/${r.item._id}`} className="block text-[13px] font-bold text-[#131313] truncate hover:text-[#e91e3f] transition-colors">{r.item.name}</Link>
                            <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(r.item).toLocaleString()} XP</p>
                          </div>
                          <button onClick={() => removeShopCart(r.itemId)} className="px-3 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors shrink-0">삭제</button>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 py-4 border-t border-[#ececea] flex items-center justify-between gap-3">
                      <div className="text-[12px]">
                        <span className="text-[#5a5a5a]">합계 </span>
                        <span className="font-black text-[#131313] tabular-nums">{shopCartTotal.toLocaleString()} XP</span>
                      </div>
                      <Link href="/shop/cart" className="px-5 py-2.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[12px] font-bold transition-colors shrink-0">결제하러 가기</Link>
                    </div>
                  </>
                )}
              </div>

              {/* 찜한 상품 */}
              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#ececea]">
                  <h2 className="text-sm font-black text-[#131313] flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-[#e91e3f]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                    찜한 상품 {shopWishRows.length > 0 && <span className="text-[#e91e3f]">{shopWishRows.length}</span>}
                  </h2>
                </div>
                {shopWishRows.length === 0 ? (
                  <p className="px-5 py-12 text-center text-xs text-[#8a8a8a]">찜한 상품이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-[#ececea] max-h-[320px] overflow-y-auto">
                    {shopWishRows.map((it) => (
                      <div key={it._id} className="px-5 py-3.5 flex items-center gap-3">
                        <div className="w-11 h-11 rounded-lg bg-[#eceae6] overflow-hidden shrink-0">
                          {it.imageUrl && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-[#131313] truncate">{it.name}</p>
                          <p className="text-[11px] font-black text-[#131313] tabular-nums">{salePrice(it).toLocaleString()} XP</p>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Link href={`/shop/item/${it._id}`} className="px-3 py-1.5 rounded-full text-[10px] font-bold bg-[#e91e3f] text-white hover:bg-[#d01634] transition-colors text-center">보러가기</Link>
                          <button onClick={() => removeShopWish(it._id)} className="px-3 py-1 text-[10px] font-bold text-[#a3a3a3] hover:text-[#c62828] transition-colors">해제</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 보유 쿠폰 */}
              <div className="bg-white rounded-2xl border border-[#e2e0dc] overflow-hidden">
                <div className="px-5 py-4 border-b border-[#ececea]">
                  <h2 className="text-sm font-black text-[#131313]">보유 쿠폰 {shopWallet.length > 0 && <span className="text-[#e91e3f]">{shopWallet.length}</span>}</h2>
                </div>

                {/* 쿠폰 코드 등록 — 보상형 코드도 이곳에서 사용한다 */}
                <div className="px-5 pt-4 pb-3 border-b border-[#ececea]">
                  <div className="flex gap-2">
                    <input type="text" value={couponInput} onChange={(e) => setCouponInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") registerCoupon(); }}
                      placeholder="쿠폰 코드 입력"
                      className="flex-1 min-w-0 bg-white border border-[#e2e0dc] rounded-lg px-3 py-2.5 text-[13px] text-[#131313] outline-none focus:border-[#e91e3f] uppercase placeholder:normal-case placeholder:text-[#a3a3a3]" />
                    <button onClick={registerCoupon} disabled={!couponInput.trim() || isRegisteringCoupon}
                      className="px-4 py-2.5 rounded-lg bg-[#131313] hover:bg-black text-white text-[12px] font-bold disabled:opacity-40 transition-colors shrink-0">
                      {isRegisteringCoupon ? "확인" : "등록"}
                    </button>
                  </div>
                  {couponMsg && (
                    <p className={`mt-2 text-[11px] font-bold break-keep ${couponMsg.ok ? "text-[#3f7a35]" : "text-[#c62828]"}`}>{couponMsg.text}</p>
                  )}
                </div>

                {shopWallet.length === 0 ? (
                  <p className="px-5 py-12 text-center text-xs text-[#8a8a8a]">보유한 쿠폰이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-[#ececea] max-h-[280px] overflow-y-auto">
                    {shopWallet.map((w) => (
                      <div key={w.id} className="px-5 py-3.5 flex items-center gap-3">
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
              </div>
            </div>
          </section>
        )}
      </div>

      {/* 📌 통지 상세 모달 (사무적 통지서) */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4 animate-in fade-in" onClick={() => setSelectedNotif(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#e2e0dc] rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">Official Notice · 운영팀 통지</span>
              <button onClick={() => setSelectedNotif(null)} className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f5f3f0] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4 animate-in fade-in" onClick={() => setSelectedInquiry(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#e2e0dc] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">1:1 문의 내역</span>
              <button onClick={() => setSelectedInquiry(null)} className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f5f3f0] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#131313]/45 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white border border-[#e2e0dc] rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-[#131313] mb-3">지원 취소 확인</h2>
            <p className="text-sm text-[#5a5a5a] mb-8 leading-relaxed">정말로 지원을 취소하시겠습니까?<br/>취소 후에는 다시 지원해야 합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirmId(null)} className="flex-1 py-3 bg-[#eceae6] hover:bg-[#e2e0dc] text-[#131313] font-bold rounded-xl transition-colors">닫기</button>
              <button onClick={executeCancelApply} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-[#131313] font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">취소하기</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}