"use client";
import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Reveal, CountUp, LuxStyles } from "./components/Lux";


// 📌 24시간 온라인 활동 그래프 (섹션용 와이드 버전)
const ActivityChart = ({ history }: { history: { ts: string; online: number }[] }) => {
  if (!history || history.length < 2) return null;
  const w = 600, h = 120;
  const values = history.map((p) => p.online);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 8 - ((v - min) / range) * (h - 20)}`).join(" ");

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black tracking-[0.25em] text-gray-600 uppercase">24H Activity</span>
        <span className="text-[10px] font-bold text-gray-500">피크 <span className="text-[#e91e3f] font-black">{max.toLocaleString()}</span>명</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24 md:h-28 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e91e3f" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#e91e3f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#actFill)" />
        <polyline points={points} fill="none" stroke="#e91e3f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

// 📌 최신 소식 카드용 짧은 날짜 표기
const fmtDate = (s: string) => {
  const d = new Date(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

export default function Home() {
  const [stats, setStats] = useState<{ memberCount: number; onlineCount: number; history: any[] } | null>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);

  // 📌 히어로를 스크롤하는 동안 진행률(0~1)을 추적 — 라이트 패널이 그 비율만큼 위로 떠오른다
  const heroRef = useRef<HTMLElement>(null);
  const [heroProgress, setHeroProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = heroRef.current?.offsetHeight || 0;
      if (!h) return;
      setHeroProgress(Math.min(Math.max(window.scrollY / h, 0), 1));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setStats({ memberCount: data.memberCount, onlineCount: data.onlineCount, history: data.history || [] });
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/posts?category=이벤트", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/auction", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=공지사항", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([ev, tn, au, no]) => {
      const events = (Array.isArray(ev?.data) ? ev.data : []).slice(0, 2).map((p: any) => ({ type: "이벤트", title: p.title, path: "/event", period: p.eventPeriod }));
      const tournaments = (Array.isArray(tn?.data) ? tn.data : [])
        .filter((p: any) => p.tournamentStatus !== "종료됨")
        .slice(0, 2)
        .map((p: any) => ({ type: p.tournamentStatus === "진행중" ? "대회 진행중" : "대회 예정", title: p.title, path: "/tournament", period: p.tournamentDate }));
      // 진행 중인 선수 경매는 최상단 LIVE로 노출
      const liveAuctions = (Array.isArray(au?.data) ? au.data : [])
        // 테스트 방은 메인 노출 제외 (관리자에게도 표시하지 않음)
        .filter((a: any) => a.status === "진행중" && !a.isTest)
        .slice(0, 2)
        .map((a: any) => ({ type: "경매 LIVE", title: a.title, path: `/auction/${a._id}`, period: "" }));
      setSchedule([...liveAuctions, ...tournaments, ...events].slice(0, 4));

      const noticeList = (Array.isArray(no?.data) ? no.data : [])
        .slice()
        .sort((a: any, b: any) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        })
        .slice(0, 4);
      setNotices(noticeList);
    });
  }, []);

  return (
    <main className="flex-1 w-full relative flex flex-col">
      <LuxStyles />

      {/* ═══ 커튼 컨테이너 — 히어로는 화면에 고정(sticky)되고, 흰 패널이 그 위로 타고 올라온다.
             불투명한 배경 + z-10로, 아래에 깔린 CTA(스티키 리빌)가 패널이 끝나기 전엔 안 비치게 한다 ═══ */}
      <div className="relative z-10 bg-[#090909]">

      {/* ═══ SECTION 1 · 히어로 (풀스크린 · 브랜드만) ═══
             sticky로 뷰포트에 핀 고정 — 스크롤하면 히어로는 멈춰 있고 아래 흰 패널이 위로 덮으며 올라온다.
             heroProgress에 따라 내용물이 서서히 어두워지고 살짝 작아져 깊이감을 더한다 ═══ */}
      <section ref={heroRef} className="sticky top-0 w-full h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#e91e3f]/[0.08] blur-[130px] rounded-full pointer-events-none"></div>

        {/* 📌 세로 텍스트 — 가로 줄글만 있는 단조로움을 깨는 에디토리얼 스파인 */}
        <div className="hidden lg:block absolute left-8 top-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="text-[10px] font-black tracking-[0.5em] text-gray-700 uppercase [writing-mode:vertical-rl]">Premium Igloo · Since 2023</span>
        </div>
        <div className="hidden lg:block absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none select-none">
          <span className="text-[10px] font-black tracking-[0.5em] text-gray-700 uppercase [writing-mode:vertical-rl] rotate-180">활동이 곧 자산이 되는 곳</span>
        </div>

        <div
          className="flex-1 w-full max-w-7xl mx-auto px-6 flex items-center relative z-10"
          style={{ opacity: 1 - heroProgress * 0.65, transform: `scale(${1 - heroProgress * 0.05})`, willChange: "opacity, transform" }}
        >
          <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
            {/* 로고 */}
            <Reveal className="flex justify-center md:justify-end">
              <div className="relative">
                <div className="absolute inset-0 scale-90 bg-[#e91e3f]/15 blur-[80px] rounded-full animate-[pulseGlow_5s_ease-in-out_infinite] pointer-events-none"></div>
                <img
                  src="/logo.png"
                  alt="고급 이글루"
                  className="relative w-56 h-56 md:w-80 md:h-80 lg:w-96 lg:h-96 object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
                />
              </div>
            </Reveal>

            {/* 브랜드 텍스트 — 이것만! */}
            <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left">
              <Reveal>
                <div className="flex items-center gap-3 mb-6 justify-center md:justify-start">
                  <span className="w-8 h-px bg-[#e91e3f]"></span>
                  <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Since 2023 · Community</span>
                </div>
                <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white mb-3 leading-none">고급 이글루</h1>
                <p className="text-base md:text-lg font-light tracking-[0.45em] text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600 mb-5 pl-1 uppercase">Premium Igloo</p>
                <p className="text-sm md:text-base font-bold text-gray-300 mb-10">
                  <span className="lux-shimmer">활동이 곧 자산이 되는 곳.</span>
                </p>
              </Reveal>

              <Reveal delay={150}>
                <div className="flex flex-wrap justify-center md:justify-start gap-4">
                  <a
                    href="https://discord.gg/V2uW2nUczU"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-8 py-4 bg-[#e91e3f] text-white rounded-full font-bold text-base md:text-lg hover:bg-[#d01634] transition-all shadow-[0_10px_36px_rgba(233,30,63,0.35)] hover:shadow-[0_14px_44px_rgba(233,30,63,0.5)] hover:-translate-y-0.5 outline-none focus:outline-none"
                  >
                    서버 바로가기
                  </a>
                  <Link
                    href="/faq"
                    className="px-8 py-4 bg-white/[0.03] border border-white/10 text-white rounded-full font-bold text-base md:text-lg hover:bg-white/[0.07] hover:border-white/25 transition-all outline-none focus:outline-none"
                  >
                    이용 가이드
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </div>

      </section>

      {/* ═══ SECTION 2 · 통합 라이트 패널 (01 서버현황 + 02 LIVE&UPCOMING + 03 핵심콘텐츠 + 04 최신소식) ═══
             -mt로 고정된 히어로 하단을 처음부터 살짝 덮고 시작 — 스크롤하면 멈춰 있는 히어로 위로
             흰 배경이 실제로 "올라오는" 커튼 효과가 난다 ═══ */}
      <section className="relative w-full z-10 -mt-[18vh] overflow-x-clip bg-[#f5f3f0] rounded-t-[40px] md:rounded-t-[56px] rounded-b-[40px] md:rounded-b-[56px] shadow-[0_-24px_70px_-24px_rgba(0,0,0,0.6),0_40px_90px_-30px_rgba(0,0,0,0.65)] [clip-path:inset(0_round_40px)] md:[clip-path:inset(0_round_56px)]">
        {/* ※ overflow-hidden 대신 clip-path 사용 — overflow-hidden은 하위 sticky 제목의 위치 고정을 깨버린다.
               overflow-x-clip은 스크롤 컨테이너를 만들지 않아 sticky에 영향 없이, 장식용 glow(우측 음수 offset)가
               문서 가로 스크롤을 만드는 것만 막는다 (clip-path는 렌더링만 자르고 레이아웃 오버플로우는 못 막음) */}
        <div className="absolute top-[-80px] right-[-60px] w-[400px] h-[300px] bg-[#e91e3f]/[0.08] blur-[110px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 divide-y divide-black/[0.06]">

        {/* 01 · 서버 현황 — 제목 위 · 내용 아래 세로 구성 */}
        {stats && (
        <div className="w-full py-20 md:py-28 px-6">
          <div className="max-w-6xl mx-auto">
            <Reveal>
              <div className="relative mb-12">
                <span aria-hidden className="absolute -top-3 md:-top-8 left-0 text-[70px] md:text-[120px] font-black text-black/[0.05] leading-none select-none pointer-events-none tracking-tighter">01</span>
                <div className="relative flex items-baseline gap-4 mb-2">
                  <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">01</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-black/15 to-transparent"></div>
                </div>
                <h2 className="relative text-2xl md:text-4xl font-black text-[#131313] tracking-tight mb-3 break-keep">살아있는 커뮤니티</h2>
                <p className="relative text-sm text-gray-600 break-keep">고급 이글루는 지금 이 순간에도 움직이고 있습니다.</p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
              <Reveal delay={100}>
                <div className="grid grid-cols-3 gap-px bg-black/[0.08] rounded-2xl overflow-hidden border border-black/[0.06] shadow-[0_16px_44px_-28px_rgba(0,0,0,0.3)]">
                  {[
                    { n: stats.memberCount, l: "전체 멤버", dot: false },
                    { n: stats.onlineCount, l: "현재 온라인", dot: true },
                    { n: 2023, l: "Since", raw: true },
                  ].map((s: any, i) => (
                    <div key={i} className="relative bg-white px-4 py-9 text-center group hover:bg-white hover:shadow-[0_16px_44px_-18px_rgba(233,30,63,0.3)] hover:z-10 transition-all duration-300">
                      <div className="text-3xl md:text-4xl font-black text-[#131313] group-hover:text-[#e91e3f] transition-colors tracking-tight flex items-center justify-center gap-2">
                        {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>}
                        {s.raw ? s.n : <CountUp end={s.n} />}
                      </div>
                      <div className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-gray-500 mt-2.5 uppercase">{s.l}</div>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={200}>
                <ActivityChart history={stats.history} />
              </Reveal>
            </div>
          </div>
        </div>
        )}

        {/* 02 · LIVE & UPCOMING — 제목은 고정, 내용만 스크롤 (md 이상) */}
        {schedule.length > 0 && (
        <div className="relative w-full py-20 md:py-28 px-6">
          <div className="absolute top-0 right-[-100px] w-[400px] h-[300px] bg-[#e91e3f]/[0.05] blur-[110px] rounded-full pointer-events-none"></div>
          <div className="max-w-6xl mx-auto relative z-10">
            <Reveal>
              <div className="relative mb-12">
                <span aria-hidden className="absolute -top-3 md:-top-8 left-0 text-[70px] md:text-[120px] font-black text-black/[0.05] leading-none select-none pointer-events-none tracking-tighter">02</span>
                <div className="relative flex items-baseline gap-4 mb-2">
                  <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">02</span>
                  <div className="h-px flex-1 bg-gradient-to-r from-black/15 to-transparent"></div>
                </div>
                <h2 className="relative text-2xl md:text-4xl font-black text-[#131313] tracking-tight mb-3 break-keep">지금, 이글루에서는</h2>
                <p className="relative text-sm text-gray-600 break-keep">진행 중인 대회와 이벤트를 확인하세요.</p>
              </div>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedule.map((item, i) => (
                <Reveal key={i} delay={i * 100}>
                  <Link href={item.path} className={`flex items-center gap-4 px-6 py-5 rounded-2xl border backdrop-blur-sm transition-all duration-300 group/sch h-full hover:-translate-y-1 ${item.type === "경매 LIVE" ? "bg-emerald-500/[0.06] border-emerald-500/25 hover:border-emerald-400/50 hover:bg-emerald-500/10 hover:shadow-[0_20px_50px_-20px_rgba(16,185,129,0.3)]" : "bg-white/75 border-black/[0.05] hover:border-[#e91e3f]/30 hover:bg-white hover:shadow-[0_20px_50px_-20px_rgba(233,30,63,0.22)]"}`}>
                    <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 ${item.type === "경매 LIVE" ? "bg-emerald-500/15 text-emerald-600" : item.type.includes("진행중") ? "bg-emerald-500/15 text-emerald-600" : item.type.includes("대회") ? "bg-blue-500/15 text-blue-600" : "bg-[#e91e3f]/15 text-[#e91e3f]"}`}>
                      {item.type === "경매 LIVE" && (
                        <span className="relative flex w-1.5 h-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                        </span>
                      )}
                      {item.type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#131313] truncate transition-colors">{item.title}</p>
                      {item.period && <p className="text-[11px] text-gray-500 mt-0.5">{item.period}</p>}
                    </div>
                    <span className="ml-auto shrink-0 text-gray-400 group-hover/sch:text-[#e91e3f] group-hover/sch:translate-x-1 transition-all">→</span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
        )}

        {/* 03 · 핵심 콘텐츠 소개 — 제목은 왼쪽에 고정(sticky), 오른쪽엔 긴 세로 스택이 흘러간다 */}
        <div className="w-full py-20 md:py-28 px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[210px_1fr] lg:grid-cols-[250px_1fr] gap-10 md:gap-14">
            <Reveal className="md:sticky md:top-24 md:self-start">
              <div className="relative">
                <span aria-hidden className="absolute -top-2 md:-top-6 left-0 text-[56px] md:text-[84px] font-black text-black/[0.05] leading-none select-none pointer-events-none tracking-tighter">03</span>
                <div className="relative flex items-center gap-3 mb-2">
                  <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
                  <div className="h-px w-8 bg-black/15"></div>
                </div>
                <h2 className="relative text-2xl md:text-3xl font-black text-[#131313] tracking-tight mb-3 break-keep">이글루에서 즐기는 방법</h2>
                <p className="relative text-sm text-gray-600 break-keep">활동하고, 성장하고, 증명하세요.</p>
              </div>
            </Reveal>

            {/* 긴 세로 스택 — 카드 하나하나가 큼직해서 제목 고정이 확실히 체감된다 */}
            <div className="flex flex-col gap-5">
              <Reveal>
                <Link href="/level" className="group relative flex flex-col justify-between min-h-[300px] md:min-h-[340px] rounded-3xl bg-[#111111] p-8 md:p-10 overflow-hidden shadow-[0_30px_70px_-30px_rgba(0,0,0,0.55)] hover:shadow-[0_36px_80px_-24px_rgba(233,30,63,0.4)] hover:-translate-y-1.5 transition-all duration-500">
                  <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-[#e91e3f]/20 blur-[90px] rounded-full pointer-events-none group-hover:bg-[#e91e3f]/30 transition-colors duration-500"></div>
                  <div className="absolute inset-0 lux-grid-bg opacity-40 pointer-events-none"></div>
                  <span aria-hidden className="absolute top-4 right-7 text-[90px] font-black text-white/[0.04] leading-none select-none pointer-events-none">I</span>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase">Featured</span>
                    <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight mt-3 mb-4">SYSTEM : LEVEL</h3>
                    <p className="text-sm text-gray-400 leading-relaxed break-keep max-w-sm">채팅과 음성 활동으로 XP를 쌓아 최대 1,000레벨까지 성장하는 고급 이글루만의 성장 시스템.</p>
                  </div>
                  <div className="relative z-10 flex items-end justify-between mt-10">
                    <div>
                      <div className="text-4xl md:text-5xl font-black text-white tracking-tight tabular-nums"><CountUp end={1000} /></div>
                      <div className="text-[10px] font-bold tracking-[0.2em] text-gray-500 uppercase mt-1">Max Level</div>
                    </div>
                    <span className="w-11 h-11 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm flex items-center justify-center text-white group-hover:bg-[#e91e3f] group-hover:border-[#e91e3f] group-hover:rotate-45 transition-all duration-300">→</span>
                  </div>
                </Link>
              </Reveal>

              <Reveal delay={100}>
                <Link href="/tournament" className="group relative flex flex-col justify-between min-h-[260px] md:min-h-[300px] rounded-3xl bg-white/85 backdrop-blur-md border border-black/[0.05] p-8 md:p-10 overflow-hidden shadow-[0_16px_44px_-24px_rgba(0,0,0,0.18)] hover:shadow-[0_26px_60px_-20px_rgba(233,30,63,0.28)] hover:-translate-y-1.5 hover:border-[#e91e3f]/25 transition-all duration-500">
                  <span aria-hidden className="absolute top-4 right-7 text-[90px] font-black text-black/[0.04] leading-none select-none pointer-events-none">II</span>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase">Esports</span>
                    <h3 className="text-2xl md:text-3xl font-black text-[#131313] tracking-tight mt-3 mb-4 group-hover:text-[#e91e3f] transition-colors">e스포츠 대회</h3>
                    <p className="text-sm text-gray-500 leading-relaxed break-keep max-w-sm">토너먼트에 도전하고 특별한 상금과 명예의 전당에 이름을 남기세요. 참가 신청부터 대진표, 선수 경매까지.</p>
                  </div>
                  <div className="relative z-10 flex items-end justify-between mt-10">
                    <span className="text-[11px] font-black tracking-[0.2em] text-gray-400 uppercase">Tournament · Hall of Fame</span>
                    <span className="w-11 h-11 rounded-full bg-black/[0.04] border border-black/[0.06] flex items-center justify-center text-[#131313] group-hover:bg-[#e91e3f] group-hover:border-[#e91e3f] group-hover:text-white group-hover:rotate-45 transition-all duration-300">→</span>
                  </div>
                </Link>
              </Reveal>

              <Reveal delay={100}>
                <Link href="/booster" className="group relative flex flex-col justify-between min-h-[260px] md:min-h-[300px] rounded-3xl bg-white/85 backdrop-blur-md border border-black/[0.05] p-8 md:p-10 overflow-hidden shadow-[0_16px_44px_-24px_rgba(0,0,0,0.18)] hover:shadow-[0_26px_60px_-20px_rgba(233,30,63,0.28)] hover:-translate-y-1.5 hover:border-[#e91e3f]/25 transition-all duration-500">
                  <span aria-hidden className="absolute top-4 right-7 text-[90px] font-black text-black/[0.04] leading-none select-none pointer-events-none">III</span>
                  <div className="relative z-10">
                    <span className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase">Support</span>
                    <h3 className="text-2xl md:text-3xl font-black text-[#131313] tracking-tight mt-3 mb-4 group-hover:text-[#e91e3f] transition-colors">SERVER BOOSTER</h3>
                    <p className="text-sm text-gray-500 leading-relaxed break-keep max-w-sm">서버를 후원하고 전용 역할과 압도적인 XP 혜택을 받으세요.</p>
                  </div>
                  <div className="relative z-10 flex items-end justify-between mt-10">
                    <span className="text-[11px] font-black tracking-[0.2em] text-gray-400 uppercase">+2,000 XP · 35% 환급</span>
                    <span className="w-11 h-11 rounded-full bg-black/[0.04] border border-black/[0.06] flex items-center justify-center text-[#131313] group-hover:bg-[#e91e3f] group-hover:border-[#e91e3f] group-hover:text-white group-hover:rotate-45 transition-all duration-300">→</span>
                  </div>
                </Link>
              </Reveal>
            </div>
          </div>
        </div>

        {/* 04 · 최신 소식 — 제목은 고정, 내용만 스크롤 (md 이상) */}
        {notices.length > 0 && (
          <div className="w-full py-20 md:py-28 px-6 relative z-10">
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[210px_1fr] lg:grid-cols-[250px_1fr] gap-10 md:gap-14">
              <Reveal className="md:sticky md:top-24 md:self-start">
                <div className="relative">
                  <span aria-hidden className="absolute -top-2 md:-top-6 left-0 text-[56px] md:text-[84px] font-black text-black/[0.05] leading-none select-none pointer-events-none tracking-tighter">04</span>
                  <div className="relative flex items-center gap-3 mb-2">
                    <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">04</span>
                    <div className="h-px w-8 bg-black/15"></div>
                  </div>
                  <h2 className="relative text-2xl md:text-3xl font-black text-[#131313] tracking-tight mb-3 break-keep">최신 소식</h2>
                  <Link href="/notice" className="relative inline-flex items-center gap-1 text-xs font-bold text-gray-600 hover:text-[#e91e3f] transition-colors group/more">
                    전체 보기 <span className="group-hover/more:translate-x-1 transition-transform">→</span>
                  </Link>
                </div>
              </Reveal>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Reveal className="h-full">
                  <Link href={`/notice?id=${notices[0]._id}`} className="group relative flex flex-col justify-end h-full min-h-[220px] md:min-h-[320px] rounded-3xl bg-[#111111] p-7 md:p-8 overflow-hidden shadow-[0_26px_60px_-26px_rgba(0,0,0,0.5)] hover:shadow-[0_32px_70px_-20px_rgba(233,30,63,0.35)] hover:-translate-y-1.5 transition-all duration-500">
                    {notices[0].bannerUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={notices[0].bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45 group-hover:opacity-55 group-hover:scale-105 transition-all duration-700" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/10 pointer-events-none"></div>
                    <div className="relative z-10">
                      <h3 className="text-lg md:text-xl font-black text-white leading-snug break-keep line-clamp-2 mb-2">{notices[0].title}</h3>
                      <p className="text-xs text-gray-400">{fmtDate(notices[0].createdAt)}</p>
                    </div>
                  </Link>
                </Reveal>

                <div className="flex flex-col gap-3">
                  {notices.slice(1, 4).map((n, i) => (
                    <Reveal key={n._id} delay={i * 90}>
                      <Link href={`/notice?id=${n._id}`} className="group flex items-center gap-4 bg-white/85 backdrop-blur-md rounded-2xl border border-black/[0.05] px-5 py-4 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.2)] hover:shadow-[0_18px_40px_-16px_rgba(233,30,63,0.25)] hover:-translate-y-0.5 hover:border-[#e91e3f]/25 transition-all duration-300">
                        <span className="shrink-0 text-[10px] font-bold text-gray-400 tabular-nums">{fmtDate(n.createdAt)}</span>
                        <p className="min-w-0 flex-1 text-sm font-bold text-[#131313] truncate group-hover:text-[#e91e3f] transition-colors">{n.title}</p>
                        <span className="shrink-0 text-gray-300 group-hover:text-[#e91e3f] group-hover:translate-x-1 transition-all">→</span>
                      </Link>
                    </Reveal>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        </div>
      </section>

      </div>{/* 커튼 컨테이너 끝 */}

      {/* ═══ SECTION 6 · 마지막 CTA — 역방향 커튼(스티키 리빌):
             화면 하단에 미리 깔려 있다가, 흰 패널이 위로 걷히면서 밑에서 드러난다 ═══ */}
      <section className="sticky bottom-0 z-0 w-full py-24 md:py-32 px-6 overflow-hidden">
        <div className="absolute bottom-[-150px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[130px] rounded-full pointer-events-none"></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <Reveal>
            <p className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase mb-5">Join Premium Igloo</p>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4 leading-tight">
              지금 바로 <span className="lux-shimmer">참여하세요</span>
            </h2>
            <p className="text-sm md:text-base text-gray-400 mb-10">나의 활동이 나의 자산이 되는 순간을.</p>
            <a
              href="https://discord.gg/V2uW2nUczU"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-12 py-4 bg-[#e91e3f] text-white rounded-full font-bold text-base md:text-lg hover:bg-[#d01634] transition-all shadow-[0_10px_36px_rgba(233,30,63,0.35)] hover:shadow-[0_14px_44px_rgba(233,30,63,0.5)] hover:-translate-y-0.5"
            >
              디스코드 서버 입장하기
            </a>
          </Reveal>
        </div>
      </section>
    </main>
  );
}
