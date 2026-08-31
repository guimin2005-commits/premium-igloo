"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Reveal } from "./components/Lux";
import {
  HudStyles, HudLabel, HudSection, HudCount, LiveDot, StatusChip,
  Sparkline, SegBar, RankRows, EmptySlot,
} from "./components/Hud";
import { SEASON, getSeasonDday } from "@/lib/season";
import { isAdminName } from "@/lib/admins";

/* ═══════════════════════════════════════════════════════════════
   메인 홈 — OBSERVER DECK (중계 오버레이 시점)
   서버 전체의 '경기'를 옵저버 화면처럼 보여준다. 세로 1칼럼 대신
   스코어바 + 티커 + 3열 레일. 박스 카드 대신 헤어라인·타이포 직결 배치.
   레드(#e91e3f)는 LIVE·나·1위·게이지 전용 신호색, 시머는 워드마크 1곳.
   ═══════════════════════════════════════════════════════════════ */

const DISCORD_URL = "https://discord.gg/V2uW2nUczU";
const ICE = "#9fc9e8"; // ARCTIC 동선 전용 아이스 틴트 — 이글루 세계관 예외색

const fmtDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

// ── 뉴스 티커 — 카테고리 라벨만 유색, 저속(장식이 아니라 정보 스트립) ──
const Ticker = ({ items }: { items: any[] }) => {
  if (!items.length) return null;
  // 항목이 적어도 트랙이 화면을 덮도록 반복 후 2배 복제 (translateX(-50%) 루프)
  const repeat = Math.max(1, Math.ceil(6 / items.length));
  const half: any[] = [];
  for (let i = 0; i < repeat; i++) half.push(...items);
  const track = [...half, ...half];
  return (
    <div className="hud-ticker relative overflow-hidden border-y border-white/[0.08] h-9">
      <div
        className="hud-ticker-track absolute left-0 top-0 h-full flex items-center whitespace-nowrap will-change-transform"
        style={{ animation: `hudTicker ${Math.max(36, half.length * 11)}s linear infinite` }}
      >
        {track.map((it, i) => (
          <Link key={i} href={it.href} className="inline-flex items-center h-full px-6 group">
            {it.tone === "live" && <LiveDot color="bg-[#e91e3f]" />}
            <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${it.tone === "live" ? "text-[#e91e3f] ml-2" : it.tone === "ice" ? "" : "text-gray-600"}`} style={it.tone === "ice" ? { color: ICE } : undefined}>{it.tag}</span>
            <span className="text-[12px] font-bold text-white/70 group-hover:text-white transition-colors ml-2.5">{it.text}</span>
            <span aria-hidden className="text-white/15 ml-6 text-[9px]">◆</span>
          </Link>
        ))}
      </div>
    </div>
  );
};

// ── 매치 카드용 미니 브래킷 글리프 (대진선 3단) ──
const BracketGlyph = ({ live = false }: { live?: boolean }) => (
  <svg viewBox="0 0 44 28" className="w-11 h-7 shrink-0" fill="none">
    <path d="M2 4 h10 v8 h10 M2 20 h10 v-8" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
    <path d="M22 12 h10 v2 h10" stroke={live ? "#e91e3f" : "rgba(255,255,255,0.2)"} strokeWidth="1.5" />
  </svg>
);

// ── 플레이어 위젯 — 우 레일(데스크톱)·상단(모바일) 겸용 ──
const PlayerBlock = ({ session, me }: { session: any; me: any }) => {
  if (!session?.user) {
    return (
      <div>
        <p className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase mb-2">Spectator Mode</p>
        <p className="text-sm font-bold text-white mb-1.5">현재 관전 중입니다</p>
        <p className="text-[11px] text-gray-500 leading-relaxed mb-5 break-keep">로그인하면 내 레벨·순위가 이 자리에 실시간으로 표시됩니다.</p>
        <button
          onClick={() => signIn("discord", { callbackUrl: "/" })}
          className="w-full py-3 rounded-lg border border-[#e91e3f]/40 text-[#e91e3f] text-xs font-black tracking-[0.15em] uppercase hover:bg-[#e91e3f] hover:text-white transition-colors outline-none focus:outline-none"
        >
          Join the Roster
        </button>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="block text-center text-[11px] font-bold text-gray-600 hover:text-white transition-colors mt-3">디스코드 서버 입장 →</a>
      </div>
    );
  }
  const prog = me?.levelProgress || { current: 0, required: 1, needToNext: 0 };
  const pct = Math.min(100, Math.floor((prog.current / Math.max(1, prog.required)) * 100));
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={session.user.image} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-[#e91e3f]/50" />
        ) : (
          <span className="w-10 h-10 rounded-lg bg-white/[0.06] ring-1 ring-white/15 flex items-center justify-center text-sm font-black text-white/60">{(session.user.name || "?").slice(0, 1)}</span>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-white truncate">{session.user.name}</p>
          <p className="text-[10px] font-bold text-gray-600 tabular-nums">{me ? `RANK #${me.rank.toLocaleString()} / ${me.total.toLocaleString()}` : "—"}</p>
        </div>
        <span className="ml-auto text-2xl font-black text-white tabular-nums tracking-tight shrink-0">
          <span className="text-[10px] font-black text-gray-600 align-middle mr-1">LV</span>{me ? me.level : "—"}
        </span>
      </div>
      <SegBar pct={me ? pct : 0} segments={10} h="h-1.5" />
      <div className="flex justify-between mt-2 mb-5">
        <span className="text-[10px] font-bold text-gray-600 tabular-nums">{me ? `${prog.current.toLocaleString()} / ${prog.required.toLocaleString()} XP` : "동기화 중…"}</span>
        {me && <span className="text-[10px] font-bold text-gray-500">다음 레벨까지 <b className="text-[#e91e3f]">{prog.needToNext.toLocaleString()}</b></span>}
      </div>
      <Link href="/level" className="block w-full py-3 rounded-lg border border-[#e91e3f]/40 text-center text-[#e91e3f] text-xs font-black tracking-[0.15em] uppercase hover:bg-[#e91e3f] hover:text-white transition-colors">
        내 대시보드 →
      </Link>
    </div>
  );
};

export default function Home() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<any>(null);
  const [notices, setNotices] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [auctions, setAuctions] = useState<any[]>([]);
  const [shopPublic, setShopPublic] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [lb, setLb] = useState<any>({ all: null, month: null });
  const [lbTab, setLbTab] = useState<"all" | "month">("all");

  const isAdmin = isAdminName(session?.user?.name);
  const canSeeShop = shopPublic || isAdmin;
  const dday = getSeasonDday();

  // 서버 통계 — 60초 폴링 (스코어바가 '살아있는 중계'가 되도록)
  useEffect(() => {
    const load = () =>
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d.success) setStats({ memberCount: d.memberCount, onlineCount: d.onlineCount, history: d.history || [] }); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 소식·대회·경매·상점 공개 여부 — 1회
  useEffect(() => {
    Promise.all([
      fetch("/api/posts?category=공지사항", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=이벤트", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/auction", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/xp/policy", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([no, ev, tn, au, po]) => {
      const noticeList = (Array.isArray(no?.data) ? no.data : [])
        .slice()
        .sort((a: any, b: any) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, 4);
      setNotices(noticeList);
      setEvents((Array.isArray(ev?.data) ? ev.data : []).slice(0, 2));
      setMatches(
        (Array.isArray(tn?.data) ? tn.data : [])
          .filter((p: any) => p.tournamentStatus !== "종료됨")
          .slice(0, 2)
      );
      setAuctions(
        (Array.isArray(au?.data) ? au.data : [])
          .filter((a: any) => a.status === "진행중" && !a.isTest && !a.isPrivate)
          .slice(0, 2)
      );
      if (po?.success) setShopPublic(!!po.data?.shopPublic);
    });
  }, []);

  // 내 레벨 요약 — 로그인 시에만
  useEffect(() => {
    if (!session?.user) { setMe(null); return; }
    fetch("/api/xp/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setMe(d.data); })
      .catch(() => {});
  }, [(session?.user as any)?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 스탠딩 TOP 5
  useEffect(() => {
    (["all", "month"] as const).forEach((period) =>
      fetch(`/api/xp/leaderboard?period=${period}&limit=5`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => { if (d?.success) setLb((p: any) => ({ ...p, [period]: d })); })
        .catch(() => {})
    );
  }, []);

  const liveMatch = matches.some((m: any) => m.tournamentStatus === "진행중");

  // 티커 항목 — 데스크톱은 ARCTIC 포함, 모바일은 배너로 승격되므로 CSS에서 티커 자체가 공용
  const tickerItems = [
    ...(canSeeShop ? [{ tag: "ARCTIC", text: "ARCTIC STORE NOW OPEN →", href: "/shop", tone: "ice" }] : []),
    ...(notices[0] ? [{ tag: "Notice", text: notices[0].title, href: `/notice?id=${notices[0]._id}`, tone: "" }] : []),
    ...matches.map((m: any) => ({ tag: "Match", text: `${m.title} · ${m.tournamentStatus}`, href: "/tournament", tone: m.tournamentStatus === "진행중" ? "live" : "" })),
    ...auctions.map((a: any) => ({ tag: "Auction", text: a.title, href: `/auction/${a._id}`, tone: "live" })),
    { tag: "Season", text: `SEASON ${SEASON.number} '${SEASON.name}' · ${dday.ended ? "종료" : `D-${dday.days}`}`, href: "/level", tone: "" },
  ];

  const featured = notices[0];
  const bulletin = notices.slice(1, 4);

  return (
    <main className="flex-1 w-full relative">
      <HudStyles />
      <div className="absolute inset-x-0 top-0 h-[420px] hud-grid-bg pointer-events-none"></div>
      <div className="absolute top-[-140px] left-1/2 -translate-x-1/2 w-[640px] h-[320px] bg-[#e91e3f]/[0.06] blur-[130px] rounded-full pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-5 md:px-8">

        {/* ═══ 밴드 1 · 서버 스코어바 — 방송 상단바 (패널 아님) ═══ */}
        <Reveal>
          <div className="border-b border-white/[0.08] py-5 md:py-0 md:h-24 grid grid-cols-1 md:grid-cols-12 items-center gap-y-4">
            {/* 좌 — 아이덴티티 */}
            <div className="md:col-span-4 flex items-center gap-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="고급 이글루" className="w-10 h-10 md:w-11 md:h-11 object-contain" />
              <div>
                <p className="text-lg md:text-xl font-black tracking-tight leading-none"><span className="hud-shimmer">고급 이글루</span></p>
                <p className="text-[9px] font-black tracking-[0.35em] text-gray-600 uppercase mt-1.5">Premium Igloo · Since 2023</p>
              </div>
            </div>
            {/* 중 — 스코어 블록 */}
            <div className="md:col-span-4 flex items-center justify-start md:justify-center gap-6 md:gap-8">
              <div>
                <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1">전체 멤버</p>
                <p className="text-xl md:text-2xl font-black text-white tabular-nums tracking-tight leading-none">{stats ? <HudCount end={stats.memberCount} /> : "—"}</p>
              </div>
              <span aria-hidden className="w-px h-9 bg-white/10"></span>
              <div>
                <p className="flex items-center gap-1.5 text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1"><LiveDot />현재 온라인</p>
                <p className="text-xl md:text-2xl font-black text-[#e91e3f] tabular-nums tracking-tight leading-none">{stats ? <HudCount end={stats.onlineCount} /> : "—"}</p>
              </div>
            </div>
            {/* 우 — 미니 ID / 입장 */}
            <div className="md:col-span-4 flex md:justify-end">
              {session?.user ? (
                <Link href="/level" className="group flex items-center gap-3">
                  {session.user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.user.image} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-[#e91e3f]/60" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-white/[0.06] ring-1 ring-white/15 flex items-center justify-center text-xs font-black text-white/60">{(session.user.name || "?").slice(0, 1)}</span>
                  )}
                  <span className="text-right">
                    <span className="block text-[12px] font-bold text-white group-hover:text-[#e91e3f] transition-colors leading-none">{session.user.name}</span>
                    <span className="block text-[10px] font-bold text-gray-600 tabular-nums mt-1">{me ? `LV.${me.level} · RANK #${me.rank.toLocaleString()}` : "SYNC…"}</span>
                  </span>
                </Link>
              ) : (
                <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 rounded-lg border border-white/15 text-[11px] font-black tracking-[0.2em] uppercase text-white/70 hover:border-[#e91e3f]/50 hover:text-white transition-colors">
                  Enter the Server
                </a>
              )}
            </div>
          </div>
        </Reveal>

        {/* ═══ 모바일 전용 · ARCTIC 진입 배너 (기획안: 최상단 동선) ═══ */}
        {canSeeShop && (
          <Link href="/shop" className="lg:hidden flex items-center justify-between h-12 px-4 mt-4 rounded-lg border transition-colors" style={{ borderColor: "rgba(180,220,255,0.22)", background: "rgba(180,220,255,0.05)" }}>
            <span className="flex items-center gap-2.5">
              <LiveDot color="bg-[#9fc9e8]" />
              <span className="text-[11px] font-black tracking-[0.25em] uppercase" style={{ color: ICE }}>Arctic Store Open</span>
            </span>
            <span className="text-[12px] font-bold" style={{ color: ICE }}>→</span>
          </Link>
        )}

        {/* ═══ 밴드 2 · 뉴스 티커 ═══ */}
        <Reveal delay={60}>
          <div className="mt-4">
            <Ticker items={tickerItems} />
          </div>
        </Reveal>

        {/* ═══ 밴드 3 · 메인 3열 — 좌 텔레메트리·모듈 / 중앙 스테이지 / 우 플레이어·경매·스탠딩 ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 mt-8 lg:mt-10 lg:divide-x lg:divide-white/[0.06]">

          {/* ── 중앙 스테이지 (모바일 1순위) ── */}
          <div className="order-1 lg:order-2 lg:col-span-6 lg:px-8 space-y-10 min-w-0">
            {/* 03 · FEATURED — 화면에서 유일하게 '이미지 볼륨'을 허용하는 블록 */}
            {featured && (
              <Reveal delay={80}>
                <HudSection label="01 · Featured" right={<span className="text-[11px] font-bold text-gray-600">주요 소식</span>}>
                  <Link href={`/notice?id=${featured._id}`} className="group block relative overflow-hidden rounded-lg border border-white/[0.09]">
                    {featured.bannerUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={featured.bannerUrl} alt="" className="w-full aspect-video lg:aspect-[16/7] object-cover opacity-80 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0c] via-[#0b0b0c]/40 to-transparent pointer-events-none"></div>
                      </>
                    ) : (
                      <div className="w-full aspect-video lg:aspect-[16/7] bg-[#0d0d0d] hud-grid-bg"></div>
                    )}
                    {/* 로어서드 캡션 */}
                    <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                      <div className="flex items-center gap-2 mb-2">
                        {featured.isPinned && <StatusChip>Pinned</StatusChip>}
                        <span className="text-[10px] font-bold text-gray-400 tabular-nums">{fmtDate(featured.createdAt)}</span>
                      </div>
                      <h2 className="text-lg md:text-xl font-black text-white leading-snug break-keep line-clamp-2 group-hover:text-[#ffd7de] transition-colors">{featured.title}</h2>
                    </div>
                  </Link>
                </HudSection>
              </Reveal>
            )}

            {/* 04 · BULLETIN */}
            {bulletin.length > 0 && (
              <Reveal delay={120}>
                <HudSection label="02 · Bulletin" right={<Link href="/notice" className="text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors">전체보기 →</Link>}>
                  <div>
                    {bulletin.map((n: any) => (
                      <Link key={n._id} href={`/notice?id=${n._id}`} className="group relative flex items-center h-12 gap-4 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        {n.isPinned && <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#e91e3f]"></span>}
                        <span className="pl-3 shrink-0 text-[10px] font-bold text-gray-600 tabular-nums">{fmtDate(n.createdAt)}</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-300 group-hover:text-white transition-colors">{n.title}</span>
                        <span className="shrink-0 pr-1 text-gray-700 group-hover:text-[#e91e3f] group-hover:translate-x-0.5 transition-all">→</span>
                      </Link>
                    ))}
                  </div>
                </HudSection>
              </Reveal>
            )}

            {/* 05 · MATCHES — 0건이면 섹션 숨김 (중앙 스테이지는 빈 패널을 남기지 않는다) */}
            {matches.length > 0 && (
              <Reveal delay={160}>
                <HudSection label="03 · Matches" live={liveMatch} accent={liveMatch} right={<Link href="/tournament" className="text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors">대회 허브 →</Link>}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {matches.map((m: any) => {
                      const live = m.tournamentStatus === "진행중";
                      return (
                        <Link key={m._id} href="/tournament" className={`group border-l-2 pl-4 py-1 transition-colors ${live ? "border-[#e91e3f]" : "border-white/15 hover:border-white/40"}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <StatusChip accent={live} dot={live}>{live ? "Live" : "Upcoming"}</StatusChip>
                            {m.tournamentDate && <span className="text-[10px] font-bold text-gray-600">{m.tournamentDate}</span>}
                          </div>
                          <p className="text-sm font-bold text-white leading-snug break-keep line-clamp-2 mb-3 group-hover:text-[#ffd7de] transition-colors">{m.title}</p>
                          <div className="flex items-center justify-between">
                            <BracketGlyph live={live} />
                            <span className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase group-hover:text-gray-400 transition-colors">Bracket →</span>
                          </div>
                        </Link>
                      );
                    })}
                    {matches.length === 1 && <EmptySlot className="hidden md:flex">NO ACTIVE OPS — 대기 중</EmptySlot>}
                  </div>
                </HudSection>
              </Reveal>
            )}

            {/* 06 · EVENTS — 조용한 행 (시각 위계는 대회 아래) */}
            {events.length > 0 && (
              <Reveal delay={200}>
                <HudSection label="04 · Events" right={<Link href="/event" className="text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors">이벤트 →</Link>}>
                  <div>
                    {events.map((ev: any) => (
                      <Link key={ev._id} href="/event" className="group flex items-center h-12 gap-4 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <span className="shrink-0 text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase border border-white/10 rounded-full px-2 py-0.5">Event</span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-gray-300 group-hover:text-white transition-colors">{ev.title}</span>
                        {ev.eventPeriod && <span className="shrink-0 text-[10px] font-bold text-gray-600">{ev.eventPeriod}</span>}
                      </Link>
                    ))}
                  </div>
                </HudSection>
              </Reveal>
            )}
          </div>

          {/* ── 우 레일 (모바일 2순위: 플레이어·경매·스탠딩) ── */}
          <div className="order-2 lg:order-3 lg:col-span-3 lg:pl-8 mt-10 lg:mt-0 space-y-10 min-w-0">
            {/* 07 · PLAYER */}
            <Reveal delay={160}>
              <HudSection label="05 · Player" right={session?.user ? <StatusChip dot>Online</StatusChip> : <StatusChip>Spectator</StatusChip>}>
                <PlayerBlock session={session} me={me} />
              </HudSection>
            </Reveal>

            {/* 08 · AUCTION */}
            <Reveal delay={200}>
              <HudSection label="06 · Auction" live={auctions.length > 0} accent={auctions.length > 0} right={<Link href="/auction" className="text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors">경매장 →</Link>}>
                {auctions.length > 0 ? (
                  <div>
                    {auctions.map((a: any) => (
                      <Link key={a._id} href={`/auction/${a._id}`} className="group flex items-center h-12 gap-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                        <LiveDot color="bg-[#e91e3f]" />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-white group-hover:text-[#ffd7de] transition-colors">{a.title}</span>
                        <span className="shrink-0 text-[10px] font-black tracking-[0.15em] text-[#e91e3f] uppercase">Live</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptySlot>NO SIGNAL — 진행 중인 경매 없음</EmptySlot>
                )}
              </HudSection>
            </Reveal>

            {/* 09 · STANDINGS */}
            <Reveal delay={240}>
              <HudSection
                label="07 · Standings"
                right={
                  <span className="flex items-center gap-3">
                    {(["all", "month"] as const).map((k) => (
                      <button key={k} onClick={() => setLbTab(k)} className={`relative text-[10px] font-black tracking-[0.15em] uppercase transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-white border-b-2 border-[#e91e3f]" : "text-gray-600 hover:text-gray-400"}`}>
                        {k === "all" ? "누적" : "이번 달"}
                      </button>
                    ))}
                  </span>
                }
              >
                {!lb[lbTab] ? (
                  <div className="py-8 text-center text-[11px] font-bold text-gray-700">불러오는 중…</div>
                ) : !lb[lbTab].data?.length ? (
                  <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                ) : (
                  <>
                    <RankRows
                      rows={lb[lbTab].data}
                      myId={(session?.user as any)?.id || null}
                      me={lbTab === "all" ? me : null}
                      myName={session?.user?.name || ""}
                    />
                    <Link href="/level" className="block text-right text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors mt-3">풀 랭킹 →</Link>
                  </>
                )}
              </HudSection>
            </Reveal>
          </div>

          {/* ── 좌 레일 (모바일 3순위: 텔레메트리·모듈) ── */}
          <div className="order-3 lg:order-1 lg:col-span-3 lg:pr-8 mt-10 lg:mt-0 space-y-10 min-w-0">
            {/* 01 · TELEMETRY */}
            <Reveal delay={80}>
              <HudSection label="08 · Telemetry" live right={<span className="text-[11px] font-bold text-gray-600">24H 접속 추이</span>}>
                <Sparkline history={stats?.history || []} h={104} />
              </HudSection>
            </Reveal>

            {/* 02 · MODULES — 게임 메인 메뉴식 내비게이션 */}
            <Reveal delay={120}>
              <HudSection label="09 · Modules" right={<span className="text-[11px] font-bold text-gray-600">바로가기</span>}>
                <div>
                  {canSeeShop && (
                    <Link href="/shop" className="group relative flex items-center h-11 gap-3 border-b transition-colors hover:bg-white/[0.03]" style={{ borderColor: "rgba(180,220,255,0.18)" }}>
                      <span className="w-6 shrink-0 text-[10px] font-black tabular-nums text-center" style={{ color: ICE }}>00</span>
                      <span className="min-w-0 flex-1 text-[13px] font-bold" style={{ color: ICE }}>ARCTIC <span className="text-[10px] font-black tracking-[0.2em] uppercase opacity-70 ml-1.5">Store Open</span></span>
                      <span className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: ICE }}>→</span>
                    </Link>
                  )}
                  {[
                    { n: "01", t: "SYSTEM : LEVEL", href: "/level", live: false },
                    { n: "02", t: "e스포츠 대회", href: "/tournament", live: liveMatch },
                    { n: "03", t: "선수 경매", href: "/auction", live: auctions.length > 0 },
                    { n: "04", t: "명예의 전당", href: "/hall-of-fame", live: false },
                    { n: "05", t: "서버 부스터", href: "/booster", live: false },
                  ].map((m) => (
                    <Link key={m.n} href={m.href} className="group relative flex items-center h-11 gap-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                      <span aria-hidden className="absolute left-0 top-2 bottom-2 w-0.5 bg-[#e91e3f] scale-y-0 group-hover:scale-y-100 origin-center transition-transform"></span>
                      <span className="w-6 shrink-0 text-[10px] font-black tabular-nums text-white/30 text-center">{m.n}</span>
                      <span className="min-w-0 flex-1 text-[13px] font-bold text-white/70 group-hover:text-white transition-colors flex items-center gap-2">{m.t}{m.live && <LiveDot color="bg-[#e91e3f]" />}</span>
                      <span className="shrink-0 text-gray-700 group-hover:text-[#e91e3f] group-hover:translate-x-0.5 transition-all">→</span>
                    </Link>
                  ))}
                  <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="group flex items-center h-11 gap-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
                    <span className="w-6 shrink-0 text-[10px] font-black tabular-nums text-white/30 text-center">06</span>
                    <span className="min-w-0 flex-1 text-[13px] font-bold text-white/70 group-hover:text-white transition-colors">디스코드 입장</span>
                    <span className="shrink-0 text-gray-700 group-hover:text-[#e91e3f] transition-colors">↗</span>
                  </a>
                </div>
              </HudSection>
            </Reveal>

            {/* 시즌 — 좌 레일 하단의 조용한 상태 표기 */}
            <Reveal delay={160}>
              <HudSection label="10 · Season">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-sm font-black text-white tracking-tight">SEASON {SEASON.number} <span className="text-gray-500">&apos;{SEASON.name}&apos;</span></p>
                    <p className="text-[10px] font-bold text-gray-600 tabular-nums mt-1">{SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")}</p>
                  </div>
                  {!dday.ended && dday.days >= 0 && <StatusChip accent>D-{dday.days}</StatusChip>}
                </div>
                <Link href="/level" className="block text-[11px] font-bold text-gray-600 hover:text-[#e91e3f] transition-colors">시즌 대시보드 →</Link>
              </HudSection>
            </Reveal>
          </div>
        </div>

        {/* ═══ 밴드 4 · 클로징 — 밀도 뒤의 호흡 (럭셔리 톤 유지 장치) ═══ */}
        <Reveal delay={100}>
          <div className="border-t border-white/[0.08] mt-14 py-16 md:py-20 text-center">
            <p className="text-[10px] font-black tracking-[0.4em] text-gray-600 uppercase mb-5">Join Premium Igloo</p>
            <h2 className="text-2xl md:text-4xl font-black tracking-tighter text-white mb-3 leading-tight break-keep">활동이 곧 자산이 되는 곳</h2>
            <p className="text-sm text-gray-500 mb-9">지금 이 순간에도 서버는 움직이고 있습니다.</p>
            <div className="flex items-center justify-center gap-3">
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="px-8 py-3.5 bg-[#e91e3f] text-white rounded-lg font-bold text-sm hover:bg-[#d01634] transition-all shadow-[0_10px_36px_rgba(233,30,63,0.3)]">
                디스코드 서버 입장
              </a>
              <Link href="/faq" className="px-8 py-3.5 border border-white/15 text-white/80 rounded-lg font-bold text-sm hover:border-white/35 hover:text-white transition-colors">
                이용 가이드
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </main>
  );
}
