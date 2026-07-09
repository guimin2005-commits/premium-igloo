"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Reveal, CountUp, LuxStyles } from "./components/Lux";

// 📌 24시간 온라인 활동 스파크라인 (컴팩트)
const Sparkline = ({ history }: { history: { ts: string; online: number }[] }) => {
  if (!history || history.length < 2) return null;
  const w = 220, h = 34;
  const values = history.map((p) => p.online);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 4 - ((v - min) / range) * (h - 8)}`).join(" ");

  return (
    <div className="mt-5 w-full max-w-[240px]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase">24H Activity</span>
        <span className="text-[9px] font-bold text-gray-600">피크 {max.toLocaleString()}명</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 overflow-visible" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e91e3f" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#e91e3f" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="url(#sparkFill)" />
        <polyline points={points} fill="none" stroke="#e91e3f" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

// 📌 다가오는 일정 — 한 줄 롤링 티커 (5초마다 교체, 높이 1줄 고정)
const ScheduleTicker = ({ items }: { items: any[] }) => {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % items.length);
        setVisible(true);
      }, 300);
    }, 5000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;
  const item = items[index];

  return (
    <div className="mt-5 w-full">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase">Live &amp; Upcoming</span>
        {items.length > 1 && (
          <span className="flex gap-1">
            {items.map((_, i) => (
              <span key={i} className={`w-1 h-1 rounded-full transition-colors duration-300 ${i === index ? "bg-[#e91e3f]" : "bg-white/15"}`}></span>
            ))}
          </span>
        )}
      </div>
      <Link
        href={item.path}
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-[#e91e3f]/30 hover:bg-white/[0.05] transition-all group/sch"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(6px)", transition: "opacity 0.3s ease, transform 0.3s ease, border-color 0.3s, background-color 0.3s" }}
      >
        <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${item.type.includes("진행중") ? "bg-emerald-500/15 text-emerald-400" : item.type.includes("대회") ? "bg-blue-500/15 text-blue-400" : "bg-[#e91e3f]/15 text-[#e91e3f]"}`}>{item.type}</span>
        <span className="text-xs font-bold text-gray-300 group-hover/sch:text-white truncate transition-colors">{item.title}</span>
        {item.period && <span className="ml-auto shrink-0 text-[10px] text-gray-600 hidden sm:block">{item.period}</span>}
      </Link>
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

    // 📌 다가오는 일정: 최신 이벤트 + 진행/예정 대회
    Promise.all([
      fetch("/api/posts?category=이벤트", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([ev, tn]) => {
      const events = (Array.isArray(ev?.data) ? ev.data : []).slice(0, 2).map((p: any) => ({ type: "이벤트", title: p.title, path: "/event", period: p.eventPeriod }));
      const tournaments = (Array.isArray(tn?.data) ? tn.data : [])
        .filter((p: any) => p.tournamentStatus !== "종료됨")
        .slice(0, 2)
        .map((p: any) => ({ type: p.tournamentStatus === "진행중" ? "대회 진행중" : "대회 예정", title: p.title, path: "/tournament", period: p.tournamentDate }));
      setSchedule([...tournaments, ...events].slice(0, 3));
    });
  }, []);

  return (
    <main className="flex-1 w-full relative overflow-hidden flex flex-col">
      <LuxStyles />

      {/* 배경 레이어 */}
      <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
      <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-[#e91e3f]/[0.08] blur-[130px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-200px] right-[-100px] w-[500px] h-[400px] bg-[#e91e3f]/[0.04] blur-[130px] rounded-full pointer-events-none"></div>

      <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-16 md:py-12 flex items-center relative z-10">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">

          {/* 로고 — 투명 PNG 경계선이 보이지 않도록 프레임 없이 글로우만 */}
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

          {/* 텍스트 */}
          <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left">
            <Reveal>
              <div className="flex items-center gap-3 mb-6 justify-center md:justify-start">
                <span className="w-8 h-px bg-[#e91e3f]"></span>
                <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Since 2023 · Community</span>
              </div>
              <h1 className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter text-white mb-3 leading-none">고급 이글루</h1>
              <p className="text-base md:text-lg font-light tracking-[0.45em] text-transparent bg-clip-text bg-gradient-to-r from-gray-400 to-gray-600 mb-5 pl-1 uppercase">Premium Igloo</p>
              {/* 📌 서버 대표 슬로건 */}
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

            {stats && (
              <Reveal delay={300}>
                <div className="flex items-center gap-8 md:gap-10 mt-10 pt-7 border-t border-white/5 w-full justify-center md:justify-start">
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight">
                      <CountUp end={stats.memberCount} />
                    </div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">전체 멤버</div>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2 justify-center md:justify-start">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
                      <CountUp end={stats.onlineCount} />
                    </div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">현재 온라인</div>
                  </div>
                  <div className="text-center md:text-left">
                    <div className="text-xl md:text-2xl font-black text-white tracking-tight">2023</div>
                    <div className="text-[9px] font-bold tracking-[0.25em] text-gray-600 mt-1 uppercase">Since</div>
                  </div>
                </div>
                <Sparkline history={stats.history} />
              </Reveal>
            )}

            {/* 📌 일정 — 한 줄 롤링 티커 (3건이 5초마다 교체) */}
            {schedule.length > 0 && (
              <Reveal delay={400} className="w-full">
                <ScheduleTicker items={schedule} />
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
