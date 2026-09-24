"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Reveal, CountUp } from "./components/Lux";
import { statusOf } from "@/lib/tournamentPhase";
import { SEASON } from "@/lib/season";

// 📌 홈 — 화이트 & 블랙 편집형 골격 (승인된 2안 목업).
//    마스트헤드(상자 없음) → 헤어라인 티커 → 01 살아있는 커뮤니티 → 02 지금, 이글루에서는
//    → 03 즐기는 방법(잉크 섬은 SYSTEM : LEVEL 한 장) → 04 최신 소식 → 참여.
//    커튼(sticky) 구조는 없앴다. 배너 상자 · 두 갈래 · 타일은 상점 문법이라 쓰지 않는다.

const DISCORD = "https://discord.gg/V2uW2nUczU";

// 24시간 온라인 곡선 — 면 + 선 + 끝점
const ActivityChart = ({ history }: { history: { ts: string; online: number }[] }) => {
  if (!history || history.length < 2) return null;
  const w = 340, h = 96;
  const values = history.map((p) => p.online);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 6 - ((v - min) / range) * (h - 18)] as const);
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 text-[10.5px] font-medium tracking-wide text-[#8a8a8a] tabular-nums">
        <span>24H ACTIVITY</span>
        <span>피크 {max.toLocaleString()}명</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="homeAct" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e91e3f" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#e91e3f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${line} ${w},${h}`} fill="url(#homeAct)" />
        <polyline points={line} fill="none" stroke="#e91e3f" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill="#e91e3f" />
      </svg>
    </div>
  );
};

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDate = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
const fmtShort = (s: string) => {
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
// 미리보기용 — 마크다운 기호를 걷어낸 한 줄
const strip = (t: string) =>
  (t || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/\*\*|__|~~|==/g, "")
    .replace(/^\|.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
const isImportant = (n: any) => n?.noticeTag === "중요" || n?.noticeTag === "필독" || n?.isImportant;

// 번호 섹션 — 워터마크 번호 · 빨간 라벨 · 헤어라인 (지금 홈의 골격)
function Sec({ no, title, desc, more, children }: { no: string; title: React.ReactNode; desc?: string; more?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="w-full border-b border-[#ededed]">
      <div className="relative max-w-7xl mx-auto px-6 md:px-10 py-14 md:py-[72px]">
        <div aria-hidden className="absolute top-4 md:top-5 left-4 md:left-8 text-[80px] md:text-[120px] font-black tracking-[-0.04em] leading-none text-[#131313]/[0.05] pointer-events-none select-none">{no}</div>
        <Reveal>
          <div className="relative flex items-center gap-3.5 mb-3.5">
            <b className="text-[11px] font-black tracking-[0.3em] text-[#e91e3f]">{no}</b>
            <i className="h-px flex-1 bg-gradient-to-r from-[#131313]/20 to-transparent" />
            {more && <Link href={more.href} className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors shrink-0">{more.label}</Link>}
          </div>
          <h3 className="relative text-[26px] md:text-[34px] font-black tracking-tight leading-tight break-keep">{title}</h3>
          {desc && <p className="relative mt-2 text-[14px] text-[#6a6a6a] break-keep">{desc}</p>}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

const rowCls = "flex items-center gap-4 md:gap-[18px] py-[18px] border-b border-[#ededed] last:border-b-0 group";

export default function Home() {
  const [stats, setStats] = useState<{ memberCount: number; onlineCount: number; history: any[] } | null>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [notices, setNotices] = useState<any[]>([]);
  const [tnCount, setTnCount] = useState({ all: 0, open: 0 });
  const [policy, setPolicy] = useState({ levelPublic: true, shopPublic: false });

  useEffect(() => {
    fetch("/api/xp/policy", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setPolicy({ levelPublic: !!d?.data?.levelPublic, shopPublic: !!d?.data?.shopPublic })).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => { if (data.success) setStats({ memberCount: data.memberCount, onlineCount: data.onlineCount, history: data.history || [] }); })
      .catch(() => {});

    Promise.all([
      fetch("/api/posts?category=이벤트", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/auction", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=공지사항", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([ev, tn, au, no]) => {
      const tnAll = Array.isArray(tn?.data) ? tn.data : [];
      const tnOpen = tnAll.filter((p: any) => statusOf(p) !== "종료됨");
      setTnCount({ all: tnAll.length, open: tnOpen.length });

      const liveAuctions = (Array.isArray(au?.data) ? au.data : [])
        .filter((a: any) => a.status === "진행중" && !a.isTest && !a.isPrivate)
        .slice(0, 2)
        .map((a: any) => ({ chip: "경매", live: true, title: a.title, sub: "포인트 경매 · 진행 중", path: `/auction/${a._id}`, when: "" }));
      const tournaments = tnOpen.slice(0, 2).map((p: any) => {
        const live = statusOf(p) === "진행중";
        return { chip: "대회", live, title: p.title, sub: `${p.tournamentGame || "e스포츠"} · ${live ? "진행 중" : "접수 중"}`, path: `/tournament/${p._id}`, when: p.tournamentDate || p.tournamentPeriod || "" };
      });
      const events = (Array.isArray(ev?.data) ? ev.data : []).slice(0, 2)
        .map((p: any) => ({ chip: "이벤트", live: false, title: p.title, sub: p.eventPeriod ? "" : "상시", path: `/event/${p._id}`, when: p.eventPeriod || "상시" }));
      const rows = [...liveAuctions, ...tournaments, ...events];
      // 비어 있을 때도 줄 하나는 있어야 한다 — 상시 진행 중인 친구 초대 이벤트
      if (rows.length < 2) rows.push({ chip: "이벤트", live: false, title: "친구 초대 이벤트", sub: "코드 공유하고 함께 XP 받기", path: "/invite", when: "상시" });
      setSchedule(rows.slice(0, 4));
      setScheduleLoaded(true);

      const noticeList = (Array.isArray(no?.data) ? no.data : [])
        .slice()
        .sort((a: any, b: any) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, 5);
      setNotices(noticeList);
    });
  }, []);

  const peak = stats?.history?.length ? Math.max(...stats.history.map((h: any) => h.online || 0)) : null;
  const lead = notices[0];
  const rest = notices.slice(1, 5);
  const levelOpen = policy.levelPublic;

  return (
    <main className="flex-1 w-full flex flex-col text-[#131313]">
      {/* ── 마스트헤드 — 상자 없이 흰 종이 위 큰 활자와 로고 ── */}
      <section className="relative w-full overflow-hidden">
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(19,19,19,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(19,19,19,.035) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            WebkitMaskImage: "radial-gradient(ellipse 60% 70% at 25% 40%, #000 10%, transparent 100%)",
            maskImage: "radial-gradient(ellipse 60% 70% at 25% 40%, #000 10%, transparent 100%)",
          }} />
        <div className="relative max-w-7xl mx-auto px-6 md:px-10 pt-12 md:pt-20 pb-10 md:pb-14 flex flex-col md:flex-row md:items-center gap-8 md:gap-10">
          <Reveal className="flex-1 min-w-0">
            <h1 className="text-[52px] sm:text-[64px] md:text-[76px] font-black tracking-[-0.035em] leading-[0.98] whitespace-nowrap">고급 이글루</h1>
            <p className="mt-4 md:mt-5 text-[18px] md:text-[22px] font-black tracking-[-0.01em] break-keep">활동이 곧 <span className="text-[#e91e3f]">자산</span>이 되는 곳.</p>
            <div className="mt-7 md:mt-8 flex flex-wrap gap-2.5">
              <a href={DISCORD} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center h-11 md:h-[46px] px-6 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13.5px] font-extrabold shadow-[0_10px_30px_rgba(233,30,63,0.28)] transition-colors">
                서버 바로가기
              </a>
              <Link href="/faq"
                className="inline-flex items-center h-11 md:h-[46px] px-6 rounded-full border border-[#131313] text-[#131313] hover:bg-[#131313] hover:text-white text-[13.5px] font-extrabold transition-colors">
                이용 가이드
              </Link>
            </div>
          </Reveal>
          <Reveal delay={120} className="order-first md:order-last shrink-0 self-center md:self-auto">
            <div className="relative w-[200px] h-[200px] md:w-[300px] md:h-[300px]">
              <div aria-hidden className="absolute inset-[10%] rounded-full blur-[20px]" style={{ background: "radial-gradient(circle, rgba(233,30,63,.22), rgba(233,30,63,0) 70%)" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="고급 이글루" className="relative w-full h-full object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,0.28)]" />
            </div>
          </Reveal>
        </div>

        {/* 티커 — 헤어라인 사이 글자 한 줄 */}
        <div className="relative max-w-7xl mx-auto px-6 md:px-10">
          <div className="flex flex-wrap items-center gap-x-8 md:gap-x-10 gap-y-2.5 py-4 border-t border-[#131313] border-b border-[#ededed] text-[12.5px] font-bold text-[#5a5a5a] tabular-nums">
            <span><b className="text-[#131313] font-black mr-1.5">{stats ? stats.memberCount.toLocaleString() : "—"}</b>전체 멤버</span>
            <span><i className="inline-block w-[7px] h-[7px] rounded-full bg-emerald-500 mr-2 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]" /><b className="text-[#131313] font-black mr-1.5">{stats ? stats.onlineCount.toLocaleString() : "—"}</b>지금 접속</span>
            <span><b className="text-[#131313] font-black mr-1.5">{peak != null ? peak.toLocaleString() : "—"}</b>24시간 피크</span>
            <span><b className="text-[#131313] font-black mr-1.5">2023</b>Since</span>
            <span className="ml-auto text-[11px] font-medium text-[#8a8a8a] tracking-wide">LIVE · 5분마다 갱신</span>
          </div>
        </div>
      </section>

      {/* ── 01 살아있는 커뮤니티 — 박스 없이 큰 숫자 ── */}
      <Sec no="01" title="살아있는 커뮤니티" desc="고급 이글루는 지금 이 순간에도 움직이고 있습니다.">
        <Reveal delay={100}>
          <div className="relative mt-9 md:mt-10 flex flex-col md:flex-row md:items-end gap-6 md:gap-8">
            <div className="flex-1 grid grid-cols-3 gap-4 md:gap-6">
              <div className="border-t border-[#131313] pt-3.5">
                <b className="block text-[30px] sm:text-[38px] md:text-[44px] font-black tracking-[-0.03em] leading-none tabular-nums">{stats ? <CountUp end={stats.memberCount} /> : "—"}</b>
                <small className="block mt-2 text-[12px] font-bold text-[#6a6a6a]">전체 멤버</small>
              </div>
              <div className="border-t border-[#131313] pt-3.5">
                <b className="block text-[30px] sm:text-[38px] md:text-[44px] font-black tracking-[-0.03em] leading-none tabular-nums">{stats ? <CountUp end={stats.onlineCount} /> : "—"}</b>
                <small className="block mt-2 text-[12px] font-bold text-[#6a6a6a]"><i className="inline-block w-[7px] h-[7px] rounded-full bg-emerald-500 mr-1.5" />현재 온라인</small>
              </div>
              <div className="border-t border-[#131313] pt-3.5">
                <b className="block text-[30px] sm:text-[38px] md:text-[44px] font-black tracking-[-0.03em] leading-none tabular-nums">2023</b>
                <small className="block mt-2 text-[12px] font-bold text-[#6a6a6a]">Since</small>
              </div>
            </div>
            <div className="md:w-[340px] shrink-0 border-t border-[#131313] pt-3.5">
              {stats && stats.history && stats.history.length >= 2 ? <ActivityChart history={stats.history} /> : <div className="h-24" />}
            </div>
          </div>
        </Reveal>
      </Sec>

      {/* ── 02 지금, 이글루에서는 — 줄 목록 ── */}
      <Sec no="02" title="지금, 이글루에서는" more={{ href: "/event", label: "전체 ›" }}>
        <div className="relative mt-6 md:mt-7">
          {!scheduleLoaded ? (
            <div className="py-10 text-center text-sm text-[#a3a3a3]">불러오는 중...</div>
          ) : schedule.map((it, i) => (
            <Reveal key={`${it.path}-${i}`} delay={Math.min(i, 4) * 60}>
              <Link href={it.path} className={rowCls}>
                <span className={`w-[52px] md:w-[76px] shrink-0 text-[11px] font-black ${it.live ? "text-[#e91e3f]" : "text-[#131313]"}`}>
                  {it.live && <i className="inline-block w-1.5 h-1.5 rounded-full bg-[#e91e3f] mr-1.5 align-[1px]" />}{it.chip}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] md:text-[16px] font-extrabold truncate group-hover:text-[#e91e3f] transition-colors">{it.title}</span>
                  {it.sub && <span className="block mt-1 text-[12px] text-[#8a8a8a] truncate">{it.sub}</span>}
                </span>
                {it.when && <span className="hidden sm:block shrink-0 text-[12px] text-[#8a8a8a] tabular-nums">{it.when}</span>}
                <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Sec>

      {/* ── 03 즐기는 방법 — 잉크 섬 하나 + 번호 줄 두 개 ── */}
      <Sec no="03" title="이글루에서 즐기는 방법" desc="활동하고, 성장하고, 증명하세요.">
        <div className="relative mt-8 md:mt-9">
          <Reveal>
            <Link href="/level" className="group relative block overflow-hidden bg-[#131313] text-white px-7 md:px-11 py-9 md:py-10">
              <div aria-hidden className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)",
                  backgroundSize: "46px 46px",
                  WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 30% 0%, #000 30%, transparent 100%)",
                  maskImage: "radial-gradient(ellipse 80% 70% at 30% 0%, #000 30%, transparent 100%)",
                }} />
              <div aria-hidden className="absolute -right-16 -top-20 w-[380px] h-[300px] rounded-full bg-[#e91e3f]/20 blur-[110px] pointer-events-none" />
              <div className="relative flex flex-col md:flex-row md:items-end gap-6">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-black tracking-[0.3em] text-[#ff5c77] mb-3.5">SYSTEM : LEVEL</div>
                  <h4 className="text-[24px] md:text-[36px] font-black tracking-tight leading-[1.1] break-keep">
                    채팅과 음성으로 XP 를 쌓아<br />최대 <span className="text-[#e91e3f]">1,000</span> 레벨까지
                  </h4>
                  <p className="mt-3.5 text-[13.5px] md:text-[14px] text-white/70 max-w-[52ch] break-keep">활동이 XP 가 되고, 레벨이 등급이 됩니다. 아이언에서 이글루까지, 등급마다 보상이 다릅니다.</p>
                </div>
                <div className="md:text-right shrink-0">
                  <div aria-hidden className="hidden md:block text-[96px] font-black tracking-[-0.05em] leading-[0.9] text-white/[0.08]">1000</div>
                  <span className="inline-flex items-center gap-2 md:-mt-3.5 px-3.5 py-2 rounded-full border border-white/30 text-[12px] font-black">
                    <i className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />{levelOpen ? "보러 가기" : "10월 공개"}
                  </span>
                </div>
              </div>
            </Link>
          </Reveal>
          <Reveal delay={80}>
            <Link href="/tournament" className="group flex items-center gap-4 md:gap-[18px] py-6 border-b border-[#ededed]">
              <span className="w-[52px] md:w-[76px] shrink-0 text-[24px] md:text-[28px] font-black tracking-[-0.03em] text-[#131313]/[0.18] tabular-nums">02</span>
              <span className="flex-1 min-w-0">
                <span className="block text-[18px] md:text-[20px] font-black tracking-tight group-hover:text-[#e91e3f] transition-colors">e스포츠 대회</span>
                <span className="block mt-1 text-[13px] text-[#6a6a6a] break-keep">리그를 신청하고, 대진표와 팀 룸에서 경기 준비까지</span>
              </span>
              <span className="hidden sm:block shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">대회 {tnCount.all} · 접수 중 {tnCount.open}</span>
              <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
            </Link>
          </Reveal>
          <Reveal delay={140}>
            {policy.shopPublic && levelOpen ? (
              <Link href="/arctic" className="group flex items-center gap-4 md:gap-[18px] py-6 border-b border-[#ededed]">
                <span className="w-[52px] md:w-[76px] shrink-0 text-[24px] md:text-[28px] font-black tracking-[-0.03em] text-[#131313]/[0.18] tabular-nums">03</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[18px] md:text-[20px] font-black tracking-[0.06em] group-hover:text-[#e91e3f] transition-colors">ARCT<span className="text-[#e91e3f]">I</span>C</span>
                  <span className="block mt-1 text-[13px] text-[#6a6a6a] break-keep">모은 XP 로 역할 · 권한 · 아이템을 삽니다</span>
                </span>
                <span className="hidden sm:block shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">시즌 {SEASON.number}</span>
                <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
              </Link>
            ) : (
              <Link href="/booster" className="group flex items-center gap-4 md:gap-[18px] py-6 border-b border-[#ededed]">
                <span className="w-[52px] md:w-[76px] shrink-0 text-[24px] md:text-[28px] font-black tracking-[-0.03em] text-[#131313]/[0.18] tabular-nums">03</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[18px] md:text-[20px] font-black tracking-tight group-hover:text-[#e91e3f] transition-colors">서버 부스터</span>
                  <span className="block mt-1 text-[13px] text-[#6a6a6a] break-keep">부스팅하면 전용 역할과 XP 혜택이 따라옵니다</span>
                </span>
                <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
              </Link>
            )}
          </Reveal>
        </div>
      </Sec>

      {/* ── 04 최신 소식 — 대표 한 건 + 줄 ── */}
      {notices.length > 0 && (
        <Sec no="04" title="최신 소식" more={{ href: "/notice", label: "전체 보기 ›" }}>
          <div className="relative mt-6 md:mt-7 grid md:grid-cols-2 gap-8 md:gap-14">
            <Reveal>
              <Link href={`/notice/${lead._id}`} className="group block">
                <span className="text-[11px] font-black text-[#e91e3f]">
                  {[isImportant(lead) ? "중요" : "", lead.isPinned ? "고정" : ""].filter(Boolean).join(" · ") || "일반"}
                </span>
                <h4 className="mt-2.5 mb-3 text-[22px] md:text-[26px] font-black tracking-tight leading-[1.3] break-keep group-hover:text-[#e91e3f] transition-colors">{lead.title}</h4>
                {strip(lead.content) && <p className="text-[14px] leading-[1.75] text-[#6a6a6a] line-clamp-3 break-keep">{strip(lead.content)}</p>}
                <span className="block mt-3.5 text-[12px] text-[#8a8a8a] tabular-nums">{fmtDate(lead.createdAt)}</span>
              </Link>
            </Reveal>
            <Reveal delay={80}>
              <div>
                {rest.map((n) => (
                  <Link key={n._id} href={`/notice/${n._id}`} className="group flex items-center gap-4 py-4 first:pt-1 border-b border-[#ededed] last:border-b-0">
                    <span className="w-[46px] shrink-0 text-[12px] text-[#8a8a8a] tabular-nums">{fmtShort(n.createdAt)}</span>
                    <span className="flex-1 min-w-0 text-[15px] font-extrabold truncate group-hover:text-[#e91e3f] transition-colors">{n.title}</span>
                    <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
                  </Link>
                ))}
              </div>
            </Reveal>
          </div>
        </Sec>
      )}

      {/* ── 참여 ── */}
      <section className="w-full">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-20 text-center">
          <Reveal>
            <h3 className="text-[34px] md:text-[44px] font-black tracking-[-0.03em] break-keep">지금 바로 <span className="text-[#e91e3f]">참여</span>하세요</h3>
            <p className="mt-3.5 mb-7 text-[14px] text-[#6a6a6a]">나의 활동이 나의 자산이 되는 순간을.</p>
            <a href={DISCORD} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center h-[52px] px-8 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[15px] font-black shadow-[0_12px_34px_rgba(233,30,63,0.3)] transition-colors">
              디스코드 서버 입장하기
            </a>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
