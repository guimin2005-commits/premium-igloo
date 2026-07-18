"use client";
import React, { useState, useEffect } from "react";
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

export default function Home() {
  const [stats, setStats] = useState<{ memberCount: number; onlineCount: number; history: any[] } | null>(null);
  const [schedule, setSchedule] = useState<any[]>([]);

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
    ]).then(([ev, tn, au]) => {
      const events = (Array.isArray(ev?.data) ? ev.data : []).slice(0, 2).map((p: any) => ({ type: "이벤트", title: p.title, path: "/event", period: p.eventPeriod }));
      const tournaments = (Array.isArray(tn?.data) ? tn.data : [])
        .filter((p: any) => p.tournamentStatus !== "종료됨")
        .slice(0, 2)
        .map((p: any) => ({ type: p.tournamentStatus === "진행중" ? "대회 진행중" : "대회 예정", title: p.title, path: "/tournament", period: p.tournamentDate }));
      // 진행 중인 선수 경매는 최상단 LIVE로 노출
      const liveAuctions = (Array.isArray(au?.data) ? au.data : [])
        .filter((a: any) => a.status === "진행중")
        .slice(0, 2)
        .map((a: any) => ({ type: "경매 LIVE", title: a.title, path: `/auction/${a._id}`, period: "" }));
      setSchedule([...liveAuctions, ...tournaments, ...events].slice(0, 4));
    });
  }, []);

  return (
    <main className="flex-1 w-full relative flex flex-col">
      <LuxStyles />

      {/* ═══ SECTION 1 · 히어로 (풀스크린 · 브랜드만) ═══ */}
      <section className="relative w-full min-h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#e91e3f]/[0.08] blur-[130px] rounded-full pointer-events-none"></div>

        <div className="flex-1 w-full max-w-7xl mx-auto px-6 flex items-center relative z-10">
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

        {/* 스크롤 유도 인디케이터 */}
        <div className="relative z-10 pb-8 flex flex-col items-center gap-2 pointer-events-none">
          <span className="text-[9px] font-black tracking-[0.35em] text-gray-600 uppercase">Scroll</span>
          <div className="w-px h-8 bg-gradient-to-b from-[#e91e3f] to-transparent animate-[scrollHint_1.8s_ease-in-out_infinite]"></div>
        </div>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes scrollHint {
            0%, 100% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(6px); opacity: 0.4; }
          }
        `}} />
      </section>

      {/* ═══ SECTION 2 · 서버 현황 ═══ */}
      {stats && (
        <section className="relative w-full py-20 md:py-28 px-6 border-t border-white/5">
          <div className="max-w-5xl mx-auto">
            <Reveal>
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">01</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-3">살아있는 커뮤니티</h2>
              <p className="text-sm text-gray-500 mb-12">고급 이글루는 지금 이 순간에도 움직이고 있습니다.</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
              <Reveal delay={100}>
                <div className="grid grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden border border-white/10">
                  {[
                    { n: stats.memberCount, l: "전체 멤버", dot: false },
                    { n: stats.onlineCount, l: "현재 온라인", dot: true },
                    { n: 2023, l: "Since", raw: true },
                  ].map((s: any, i) => (
                    <div key={i} className="bg-[#0d0d0d] px-4 py-8 text-center group hover:bg-[#121212] transition-colors">
                      <div className="text-2xl md:text-4xl font-black text-white group-hover:text-[#e91e3f] transition-colors tracking-tight flex items-center justify-center gap-2">
                        {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>}
                        {s.raw ? s.n : <CountUp end={s.n} />}
                      </div>
                      <div className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-gray-600 mt-2 uppercase">{s.l}</div>
                    </div>
                  ))}
                </div>
              </Reveal>

              <Reveal delay={200}>
                <ActivityChart history={stats.history} />
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {/* ═══ SECTION 3 · LIVE & UPCOMING ═══ */}
      {schedule.length > 0 && (
        <section className="relative w-full py-20 md:py-28 px-6 border-t border-white/5">
          <div className="absolute top-0 right-[-100px] w-[400px] h-[300px] bg-[#e91e3f]/[0.04] blur-[110px] rounded-full pointer-events-none"></div>
          <div className="max-w-5xl mx-auto relative z-10">
            <Reveal>
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">02</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
              </div>
              <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-3">지금, 이글루에서는</h2>
              <p className="text-sm text-gray-500 mb-12">진행 중인 대회와 이벤트를 확인하세요.</p>
            </Reveal>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schedule.map((item, i) => (
                <Reveal key={i} delay={i * 100}>
                  <Link href={item.path} className={`flex items-center gap-4 px-6 py-5 rounded-2xl border transition-all group/sch h-full ${item.type === "경매 LIVE" ? "bg-emerald-500/[0.05] border-emerald-500/30 hover:border-emerald-400/60 hover:bg-emerald-500/[0.08]" : "bg-white/[0.03] border-white/5 hover:border-[#e91e3f]/30 hover:bg-white/[0.05]"}`}>
                    <span className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1.5 ${item.type === "경매 LIVE" ? "bg-emerald-500/15 text-emerald-400" : item.type.includes("진행중") ? "bg-emerald-500/15 text-emerald-400" : item.type.includes("대회") ? "bg-blue-500/15 text-blue-400" : "bg-[#e91e3f]/15 text-[#e91e3f]"}`}>
                      {item.type === "경매 LIVE" && (
                        <span className="relative flex w-1.5 h-1.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                        </span>
                      )}
                      {item.type}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-200 group-hover/sch:text-white truncate transition-colors">{item.title}</p>
                      {item.period && <p className="text-[11px] text-gray-600 mt-0.5">{item.period}</p>}
                    </div>
                    <span className="ml-auto shrink-0 text-gray-600 group-hover/sch:text-[#e91e3f] group-hover/sch:translate-x-1 transition-all">→</span>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══ SECTION 4 · 핵심 콘텐츠 소개 ═══ */}
      <section className="relative w-full py-20 md:py-28 px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <Reveal>
            <div className="flex items-baseline gap-4 mb-2">
              <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
              <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
            </div>
            <h2 className="text-2xl md:text-4xl font-black text-white tracking-tight mb-3">이글루에서 즐기는 방법</h2>
            <p className="text-sm text-gray-500 mb-12">활동하고, 성장하고, 증명하세요.</p>
          </Reveal>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { no: "I", t: "SYSTEM : LEVEL", d: "채팅과 음성 활동으로 XP를 쌓아 최대 1,000레벨까지 성장하세요.", path: "/level" },
              { no: "II", t: "e스포츠 대회", d: "토너먼트에 도전하고 특별한 상금과 명예의 전당에 이름을 남기세요.", path: "/tournament" },
              { no: "III", t: "SERVER BOOSTER", d: "서버를 후원하고 전용 역할과 압도적인 XP 혜택을 받으세요.", path: "/booster" },
            ].map((f, i) => (
              <Reveal key={i} delay={i * 130}>
                <Link href={f.path} className="block relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px group h-full">
                  <div className="rounded-2xl bg-[#111111]/95 p-7 h-full group-hover:bg-[#141414] transition-colors duration-300">
                    <div className="text-3xl font-black text-white/[0.06] mb-6 group-hover:text-[#e91e3f]/20 transition-colors duration-500 select-none">{f.no}</div>
                    <div className="text-white font-bold text-base mb-2.5 tracking-tight group-hover:text-[#ff5c77] transition-colors">{f.t}</div>
                    <div className="text-gray-500 text-[13px] leading-relaxed break-keep">{f.d}</div>
                    <div className="mt-6 h-px w-8 bg-[#e91e3f]/40 group-hover:w-full transition-all duration-500"></div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5 · 마지막 CTA ═══ */}
      <section className="relative w-full py-24 md:py-32 px-6 border-t border-white/5 overflow-hidden">
        <div className="absolute bottom-[-150px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[130px] rounded-full pointer-events-none"></div>
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <Reveal>
            <p className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase mb-5">Join Premium Igloo</p>
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white mb-4 leading-tight">
              지금, <span className="lux-shimmer">이글루</span>의 문을 두드리세요
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
