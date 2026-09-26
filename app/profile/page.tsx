"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LuxStyles } from "../components/Lux";
import { ADMIN_USERS, isAdminName } from "@/lib/admins";
import { VerifyBadge } from "../components/VerifyMark";
import BackLink from "../components/BackLink";
import ArcticDock from "../arctic/ArcticDock";
import { ICON_PATHS } from "../components/Icons";
import { VOICE_TIERS, getTierIndex } from "@/lib/voiceTiers";

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
      booster: "/profile/booster", supporter: "/supporters", coupons: "/profile/coupons",
      // 인벤토리는 내 정보에서 뺐다(사용자 요청) — 옛 링크는 레벨 대시보드의 가방 팝업으로
      bag: "/level?tab=my&bag=1",
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
  // 📌 인벤토리 줄은 뺐다(사용자 요청) — 레벨 대시보드 카드 · ARCTIC 상점 줄의 가방 단추가 같은 팝업을 연다
  // 📌 ARCTIC 하위 화면은 ?from=me 를 달고 간다 — 경로 줄 · 뒤로가기가 "내 정보"로 돌아온다 (ARCTIC 맥락이면 &via=arctic)
  const meQ = `from=me${fromArctic ? "&via=arctic" : ""}`;
  if (canSeeShop) {
    rows.push({ k: "orders", g: "arctic", l: "구매 내역", icon: ICON_PATHS.receipt, href: `/arctic/orders?${meQ}`, n: shopOrders.length, accent: shopPendingCount > 0 });
    rows.push({ k: "cart", g: "arctic", l: "장바구니", icon: ICON_PATHS.cart, href: `/arctic/cart?${meQ}`, n: shopCartCount });
    rows.push({ k: "wish", g: "arctic", l: "찜", icon: ICON_PATHS.heart, href: `/arctic/wish?${meQ}`, n: shopWish.length });
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
        {/* ═══ 잉크 헤더 — 게임 프로필(A안). 사진 둘레 링 = 다음 레벨까지 진행, 아래 Lv 배지.
               등급 · 서버 순위 한 줄(다음 등급까지 몇 레벨은 사용자 요청으로 뺐다), 오른쪽에 보유 XP · 빙옥을 크게. 이 화면에서 들어 올리는 건 이것 하나 ═══ */}
        {(() => {
          const lv = shopMe?.level ?? 0;
          const tIdx = getTierIndex(lv);
          const tier = VOICE_TIERS[tIdx];
          const lp = shopMe?.levelProgress;
          const pct = lp?.required > 0 ? Math.min(1, Math.max(0, lp.current / lp.required)) : 0;
          const C = 2 * Math.PI * 46; // 링 둘레 (viewBox 100, r 46)
          return (
            <div className="relative overflow-hidden rounded-3xl bg-[#131313] text-white px-6 py-6 md:px-8 md:py-7">
              <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60"
                style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }}></div>

              <div className="relative z-10 flex flex-wrap items-center gap-x-5 md:gap-x-6 gap-y-5">
                {/* 사진 + 레벨 링 */}
                <div className="relative shrink-0 w-20 h-20 md:w-24 md:h-24">
                  {canSeeLevel && (
                    <svg aria-hidden viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                      <circle cx="50" cy="50" r="46" fill="none" stroke="#e91e3f" strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={C} strokeDashoffset={C * (1 - pct)} className="transition-[stroke-dashoffset] duration-700" />
                    </svg>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={session?.user?.image || ""} alt="" className="absolute rounded-full bg-white/10 object-cover"
                    style={canSeeLevel ? { inset: 10, width: "calc(100% - 20px)", height: "calc(100% - 20px)" } : { inset: 0, width: "100%", height: "100%" }} />
                  {canSeeLevel && (
                    <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center h-6 px-2.5 rounded-full bg-[#e91e3f] text-white text-[12px] font-black tabular-nums whitespace-nowrap ring-[3px] ring-[#131313]">
                      Lv.{lv.toLocaleString()}
                    </span>
                  )}
                </div>

                {/* 이름 · 등급 줄 · 배지 */}
                <div className="min-w-0 flex-1 basis-[180px]">
                  <h1 className="text-[22px] md:text-[26px] font-black text-white tracking-tight leading-tight truncate">{session?.user?.name}</h1>
                  {canSeeLevel && (
                    <Link href="/level" className="mt-1.5 inline-flex items-center gap-x-1.5 gap-y-0.5 flex-wrap text-[12px] md:text-[13px] font-bold text-white/65 hover:text-white tabular-nums transition-colors">
                      <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: tier.c }}></span>
                      <span className="text-white">{tier.name}</span>
                      <span aria-hidden>·</span>
                      <span>서버 #{shopMe?.rank ?? "—"}</span>
                    </Link>
                  )}
                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    <VerifyBadge isVerified={isVerified} hasScrimRole={hasScrimRole} dark />
                    {isBooster && (
                      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold border border-[#ff41cf]/40 bg-[#ff41cf]/10 text-[#ff8ae4]">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d={ICON_PATHS.sparkles} /></svg>
                        SERVER BOOSTER
                      </span>
                    )}
                    {isSupporter && (
                      <span className="inline-flex items-center gap-1 h-5 px-2 rounded-full text-[10px] font-bold border border-[#3f83b8]/40 bg-[#3f83b8]/10 text-[#8ec2ec]">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.shieldCheck} /></svg>
                        SUPPORTERS
                      </span>
                    )}
                  </div>
                </div>

                {/* 보유 XP · 빙옥 — 모바일은 아래 줄 전체 폭 */}
                <div className="w-full sm:w-auto sm:ml-auto flex gap-8 pt-4 sm:pt-0 border-t border-white/10 sm:border-t-0">
                  <div>
                    <p className="text-[11px] font-bold text-white/50">보유 XP</p>
                    <p className="mt-1 text-[22px] md:text-[26px] font-black tracking-[-0.02em] tabular-nums leading-none">{(shopMe?.xp ?? 0).toLocaleString()}</p>
                    {canSeeLevel && lp?.required > 0 && (
                      <p className="mt-1.5 text-[11px] font-bold text-white/45 tabular-nums">다음 레벨까지 {lp.needToNext.toLocaleString()}</p>
                    )}
                  </div>
                  {canSeeShop && (
                    <div>
                      <p className="text-[11px] font-bold text-white/50">빙옥</p>
                      <p className="mt-1 text-[22px] md:text-[26px] font-black tracking-[-0.02em] tabular-nums leading-none">{(shopMe?.point ?? 0).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

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
