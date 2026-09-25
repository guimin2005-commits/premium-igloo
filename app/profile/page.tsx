"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LuxStyles } from "../components/Lux";
import { ADMIN_USERS, isAdminName } from "@/lib/admins";
import { verifyBadge } from "@/lib/verifyBadge";
import BackLink from "../components/BackLink";
import ArcticDock from "../arctic/ArcticDock";
import { ICON_PATHS } from "../components/Icons";
import { getTier } from "@/lib/voiceTiers";

// 📌 내 정보 — A(잉크 헤더) + D(묶음 줄 목록).
//    줄은 전부 '해당하는 곳'으로 간다. 알림·문의·구인 내역은 /profile/notice · /profile/inquiry · /profile/recruit 로 분리했고,
//    ARCTIC 항목은 상점 화면으로, 부스터·서포터즈·팀 룸은 각자 페이지로. 대표 4개만 헤더 아래 아이콘으로 올린다.
type Row = {
  k: string;
  g: "account" | "arctic" | "member";
  l: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  n?: number;
  accent?: boolean;
  pill?: string;
  pillCls?: string;
};

const GROUPS: { g: Row["g"]; t: string }[] = [
  { g: "account", t: "계정" },
  { g: "arctic", t: "ARCTIC" },
  { g: "member", t: "멤버십" },
];

export default function MyInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [shopPublic, setShopPublic] = useState(false);
  const [levelPublic, setLevelPublic] = useState(false);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [shopWallet, setShopWallet] = useState<any[]>([]);
  const [shopMe, setShopMe] = useState<any>(null);
  const [shopWish, setShopWish] = useState<string[]>([]);
  const [shopCart, setShopCart] = useState<{ itemId: string; qty: number }[]>([]);
  const [myItemCount, setMyItemCount] = useState(0);
  const [pendingInquiries, setPendingInquiries] = useState(0);
  const [pendingApplies, setPendingApplies] = useState(0);
  const [myTeam, setMyTeam] = useState<any>(null);
  const [scrimAdmin, setScrimAdmin] = useState(false);

  const isShopAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);
  // SYSTEM : LEVEL 비공개 동안은 레벨·순위·ARCTIC 이 일반 유저 프로필에 보이지 않는다 (10월 공개)
  const canSeeLevel = levelPublic || isShopAdmin;
  const canSeeShop = (shopPublic && levelPublic) || isShopAdmin;
  const shopPendingCount = shopOrders.filter((o) => o.status === "pending").length;
  const shopCartCount = shopCart.reduce((n, c) => n + (c.qty || 1), 0);

  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isSupporter = userSession?.isSupporter || false;
  const canSeeSupporter = isSupporter || isAdminName(session?.user?.name);

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

  // ARCTIC 개수는 볼 수 있는 사람에게만 요청한다
  useEffect(() => {
    if (status !== "authenticated" || !canSeeShop) return;
    Promise.all([
      fetch("/api/shop/purchase", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/my-coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([ord, cou]) => {
      setShopOrders(Array.isArray(ord?.data) ? ord.data : []);
      setShopWallet(Array.isArray(cou?.data) ? cou.data : []);
    });
  }, [status, canSeeShop]);

  useEffect(() => {
    if (status !== "authenticated" || !canSeeLevel) return;
    fetch("/api/shop/my-items", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setMyItemCount(Array.isArray(d?.data?.items) ? d.data.items.length : 0))
      .catch(() => {});
  }, [status, canSeeLevel]);

  // 문의·구인은 진행 중인 건수만 (목록은 각자 페이지)
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const u = encodeURIComponent(session.user.name);
    fetch(`/api/inquiry?user=${u}`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => setPendingInquiries(Array.isArray(d?.data) ? d.data.filter((i: any) => i.status === "접수 중").length : 0))
      .catch(() => {});
    fetch(`/api/user/applies?user=${u}`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => setPendingApplies(Array.isArray(d?.data) ? d.data.filter((a: any) => (a.status || "심사 중") === "심사 중").length : 0))
      .catch(() => {});
  }, [status, session]);

  // 대회 팀 룸 — 로스터에서 내 디스코드 ID 를 찾는다
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

  // 옛 링크(/profile?tab=…)는 해당 화면으로 보낸다
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) { window.scrollTo(0, 0); return; }
    const to: Record<string, string> = {
      notice: "/profile/notice", inquiry: "/profile/inquiry", recruit: "/profile/recruit",
      arctic: "/arctic/orders", orders: "/arctic/orders", cart: "/arctic/cart", wish: "/arctic?panel=wish",
      bag: "/level?tab=my&bag=1", booster: "/profile/booster", supporter: "/supporters", coupons: "/profile/coupons",
    };
    if (to[tab]) router.replace(to[tab]);
  }, [searchParams, router]);

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full text-[#131313] flex-1 flex flex-col justify-center items-center px-6 py-40 text-center break-keep">
        <h2 className="text-2xl font-black text-[#131313] mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-[#5a5a5a] mb-8 text-sm">내 정보를 확인하시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord", { callbackUrl: "/profile" })} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">
          Discord 로그인
        </button>
      </main>
    );
  }

  // 어디서 왔는지 — 링크가 ?from= 으로 알려준다 (referrer 는 못 믿는다). 규칙 4: 왼쪽 위 '← 상위 이름' 한 줄
  const from = searchParams.get("from") || "";
  const back = from === "arctic" ? { href: "/arctic", label: "ARCTIC" } : from === "level" ? { href: "/level", label: "SYSTEM : LEVEL" } : null;
  // ARCTIC 맥락은 하위 페이지까지 이어진다 — 독이 바뀌지 않게 from 을 들고 간다
  const fromArctic = from === "arctic";
  const q = fromArctic ? "?from=arctic" : "";

  // ── 줄 목록 ──
  const rows: Row[] = [
    { k: "inquiry", g: "account", l: "1:1 문의", icon: ICON_PATHS.chat, href: `/profile/inquiry${q}`, n: pendingInquiries },
    { k: "recruit", g: "account", l: "구인 지원", icon: ICON_PATHS.briefcase, href: `/profile/recruit${q}`, n: pendingApplies },
  ];
  // ARCTIC 맥락이면 스토어 안 인벤토리(/shop/inventory) — 잉크 HUD 로 튀지 않는다
  if (canSeeLevel) rows.push({ k: "bag", g: "arctic", l: "인벤토리", icon: ICON_PATHS.bag, href: fromArctic ? "/arctic/inventory?from=me" : "/level?tab=my&bag=1", n: myItemCount });
  if (canSeeShop) {
    rows.push({ k: "orders", g: "arctic", l: "주문 내역", icon: ICON_PATHS.receipt, href: "/arctic/orders", n: shopOrders.length, accent: shopPendingCount > 0 });
    rows.push({ k: "cart", g: "arctic", l: "장바구니", icon: ICON_PATHS.cart, href: "/arctic/cart", n: shopCartCount });
    rows.push({ k: "wish", g: "arctic", l: "찜", icon: ICON_PATHS.heart, href: "/arctic?panel=wish", n: shopWish.length });
    rows.push({ k: "coupons", g: "arctic", l: "쿠폰함", icon: ICON_PATHS.ticket, href: `/profile/coupons${q}`, n: shopWallet.length });
  }
  rows.push({ k: "booster", g: "member", l: "서버 부스터", icon: ICON_PATHS.sparkles, href: `/profile/booster${q}`, pill: isBooster ? "적용 중" : undefined, pillCls: "bg-[#e91e3f]/[0.08] text-[#e91e3f]" });
  if (canSeeSupporter) rows.push({ k: "supporter", g: "member", l: "서포터즈", icon: ICON_PATHS.shieldCheck, href: "/supporters", pill: isSupporter ? "활동 중" : undefined, pillCls: "bg-[#3f83b8]/[0.1] text-[#3f83b8]" });
  if (myTeam || scrimAdmin) rows.push({ k: "team", g: "member", l: myTeam ? "팀 룸" : "대회 룸", icon: ICON_PATHS.users, href: myTeam ? `/tournament/team/${myTeam._id}` : "/admin/room", pill: myTeam ? `PLAN ${myTeam.sent}/${myTeam.members.length}` : undefined, pillCls: "bg-black/[0.05] text-[#5a5a5a]" });

  const RowShell = ({ r, children, className }: { r: Row; children: React.ReactNode; className: string }) =>
    r.href ? <Link href={r.href} className={className}>{children}</Link> : <button type="button" onClick={r.onClick} className={className}>{children}</button>;

  return (
    <main className="w-full flex-1 flex flex-col relative text-[#131313]">
      <LuxStyles />

      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20 flex-1">
        {back && <BackLink href={back.href} label={back.label} />}
        {/* ═══ 잉크 헤더 — SYSTEM : LEVEL 과 같은 패널. 이 화면에서 들어 올리는 건 이것 하나 ═══ */}
        <div className="relative overflow-hidden rounded-3xl bg-[#131313] text-white px-6 py-6 md:px-8 md:py-7">
          <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60"
            style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }}></div>
          <div aria-hidden className="absolute -top-24 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none" style={{ background: "rgba(233,30,63,0.26)" }}></div>

          <div className="relative z-10 flex items-start gap-4 md:gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={session?.user?.image || ""} alt="" className={`w-16 h-16 md:w-[72px] md:h-[72px] rounded-full bg-white/10 shrink-0 ${isBooster ? "ring-2 ring-[#e91e3f]/70 ring-offset-2 ring-offset-[#131313]" : ""}`} />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight truncate flex items-center gap-2">
                {session?.user?.name}
                {isBooster && <span className="text-[10px] bg-[#e91e3f] text-white px-2 py-0.5 rounded shrink-0">BOOSTER</span>}
                {isSupporter && <span className="text-[10px] bg-[#3f83b8] text-white px-2 py-0.5 rounded shrink-0">SUPPORTERS</span>}
              </h1>
              {canSeeLevel && (
                <Link href="/level" className="inline-block text-[12px] font-bold text-white/45 hover:text-white/80 mt-0.5 tabular-nums transition-colors">
                  Lv.{shopMe?.level ?? 0} · 서버 #{shopMe?.rank ?? "—"} · {getTier(shopMe?.level ?? 0).name}
                </Link>
              )}
              <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${verifyBadge(isVerified, hasScrimRole).cls}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.check} /></svg>
                  {verifyBadge(isVerified, hasScrimRole).label}
                </span>
                {isBooster && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#ff41cf]/40 bg-[#ff41cf]/10 text-[#ff8ae4]">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d={ICON_PATHS.sparkles} /></svg>
                    SERVER BOOSTER
                  </span>
                )}
                {isSupporter && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#3f83b8]/40 bg-[#3f83b8]/10 text-[#8ec2ec]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.shieldCheck} /></svg>
                    SUPPORTERS
                  </span>
                )}
              </div>
            </div>
            <div className="ml-auto text-right shrink-0 hidden sm:block">
              <div className="text-[9px] font-black tracking-[0.25em] text-white/35 uppercase mb-1">Balance</div>
              <div className="text-2xl font-black tracking-tight tabular-nums text-white leading-none">
                {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#ff5c77] ml-1">XP</span>
              </div>
              {canSeeShop && (
                <div className="text-[13px] font-black tabular-nums text-white/85 leading-none mt-2">
                  {(shopMe?.point ?? 0).toLocaleString()}<span className="text-[10px] font-black text-[#5ec8bb] ml-1">빙옥</span>
                </div>
              )}
            </div>
          </div>

          <div className="relative z-10 sm:hidden mt-4 flex items-baseline justify-between">
            <span className="text-[9px] font-black tracking-[0.25em] text-white/35 uppercase">Balance</span>
            <span className="text-xl font-black tracking-tight tabular-nums text-white leading-none">
              {(shopMe?.xp ?? 0).toLocaleString()}<span className="text-[11px] font-black text-[#ff5c77] ml-1">XP</span>
              {canSeeShop && <span className="ml-3 text-[13px] text-white/85">{(shopMe?.point ?? 0).toLocaleString()}<span className="text-[10px] font-black text-[#5ec8bb] ml-1">빙옥</span></span>}
            </span>
          </div>

          {canSeeLevel && shopMe?.levelProgress?.required > 0 && (
            <div className="relative z-10 mt-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-white/45">다음 레벨까지</span>
                <span className="text-[11px] font-bold text-white/80 tabular-nums">{shopMe.levelProgress.needToNext.toLocaleString()} XP</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e91e3f] to-[#ff5c77] transition-[width] duration-700"
                  style={{ width: `${Math.min(100, Math.round((shopMe.levelProgress.current / shopMe.levelProgress.required) * 100))}%` }}></div>
              </div>
            </div>
          )}
        </div>

        {/* ═══ 묶음 줄 목록 — 계정 / ARCTIC / 멤버십. 줄은 전부 해당 화면으로 ═══ */}
        <div className="mt-10 grid grid-cols-1 gap-y-9">
          {GROUPS.map((grp) => {
            const list = rows.filter((r) => r.g === grp.g);
            const verifyRow = grp.g === "account" && isVerified && !hasScrimRole;
            if (list.length === 0 && !verifyRow) return null;
            return (
              <section key={grp.g}>
                <p className="text-[10px] font-black tracking-[0.16em] text-[#a3a3a3] uppercase mb-1">{grp.t}</p>
                <div className="border-t border-black/[0.08]">
                  {verifyRow && (
                    <div className="flex items-center gap-3 py-3.5 border-b border-black/[0.06]">
                      <span className="w-9 h-9 rounded-xl bg-[#e91e3f]/10 text-[#e91e3f] flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.lock} /></svg>
                      </span>
                      <span className="text-[14px] font-bold text-[#131313]">내전 채널 권한</span>
                      <button type="button" onClick={() => router.push("/verify")}
                        className="ml-auto shrink-0 h-8 px-3.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[11px] font-bold transition-colors outline-none focus:outline-none">획득</button>
                    </div>
                  )}
                  {list.map((r) => (
                    <RowShell key={r.k} r={r} className="w-full flex items-center gap-3 py-3.5 border-b border-black/[0.06] text-left outline-none focus:outline-none group">
                      <span className="w-9 h-9 rounded-xl bg-black/[0.045] group-hover:bg-black/[0.09] flex items-center justify-center shrink-0 text-[#131313] transition-colors">
                        <svg viewBox="0 0 24 24" className="w-[19px] h-[19px]" fill="none" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={r.icon} /></svg>
                      </span>
                      <span className="text-[14px] font-bold text-[#131313]">{r.l}</span>
                      <span className="ml-auto flex items-center gap-2.5 shrink-0">
                        {r.pill && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums ${r.pillCls}`}>{r.pill}</span>}
                        {r.n != null && r.n > 0 && <span className={`text-[12px] font-black tabular-nums ${r.accent ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>{r.n > 99 ? "99+" : r.n}</span>}
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#b9b7b3] group-hover:text-[#5a5a5a] transition-colors" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                      </span>
                    </RowShell>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* ARCTIC 에서 왔으면 스토어 독을 그대로 — 전역 독으로 바뀌면 상점으로 돌아갈 칸이 사라진다 (ClientLayout 이 전역 독을 숨긴다) */}
      {fromArctic && <ArcticDock activeKey="me" cartCount={shopCartCount} wishCount={shopWish.length} />}
    </main>
  );
}
