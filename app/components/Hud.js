"use client";

// 📌 게임형 HUD 공용 프리미티브 — 메인 홈(/)과 SYSTEM:LEVEL 대시보드가 공유하는 디자인 시스템.
//    다크 럭셔리(#f5f3f0 + #e91e3f) 위에 절제된 게임 HUD 요소(브래킷 패널·게이지·라이브 인디케이터)를 얹는다.
//    ⚠️ Tailwind v4 빌드 특성: flex-col + gap 미적용(간격은 space-y/마진), 임의 grid-template 값 금지(표준 grid-cols-N만).

import React, { useState, useEffect, useRef } from "react";

export const ACCENT = "#e91e3f";

// ── 모서리 브래킷 패널 — HUD의 기본 컨테이너 ──────────────────
//    corners: 네 모서리 L자 브래킷 표시 여부 · accent: 포인트 컬러 보더/브래킷
/** @type {import("react").FC<any>} */
export const HudPanel = ({ children, className = "", accent = false, corners = true, glow = false }) => (
  <div
    className={`relative rounded-lg border bg-[#ffffff]/92 ${accent ? "border-[#e91e3f]/35" : "border-black/[0.09]"} ${
      glow ? "shadow-[0_20px_60px_-24px_rgba(233,30,63,0.45)]" : ""
    } ${className}`}
  >
    {corners && (
      <>
        <span aria-hidden className={`hud-c hud-c-tl ${accent ? "hud-c-accent" : ""}`}></span>
        <span aria-hidden className={`hud-c hud-c-tr ${accent ? "hud-c-accent" : ""}`}></span>
        <span aria-hidden className={`hud-c hud-c-bl ${accent ? "hud-c-accent" : ""}`}></span>
        <span aria-hidden className={`hud-c hud-c-br ${accent ? "hud-c-accent" : ""}`}></span>
      </>
    )}
    {children}
  </div>
);

// ── 패널 헤더 라벨 — [◈ LABEL ───── 우측 액션] 한 줄 문법 ─────
/** @type {import("react").FC<any>} */
export const HudLabel = ({ text, live = false, accent = false, right, className = "" }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    {live ? (
      <LiveDot />
    ) : (
      <span className={`w-1 h-1 rotate-45 shrink-0 ${accent ? "bg-[#e91e3f]" : "bg-gray-600"}`}></span>
    )}
    <span className={`text-[10px] font-black tracking-[0.25em] uppercase whitespace-nowrap ${accent ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>{text}</span>
    <span className="h-px flex-1 bg-black/[0.08]"></span>
    {right}
  </div>
);

// ── 라이브 인디케이터 (핑 도트) ──────────────────────────────
/** @type {import("react").FC<any>} */
export const LiveDot = ({ color = "bg-emerald-400" }) => (
  <span className="relative flex h-1.5 w-1.5 shrink-0">
    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${color}`}></span>
    <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${color}`}></span>
  </span>
);

// ── 레이디얼 게이지 — 캐릭터 XP 링 (중앙에 children 배치) ─────
/** @type {import("react").FC<any>} */
export const RingGauge = ({ pct = 0, size = 148, stroke = 7, children, trackClass = "rgba(0,0,0,0.07)" }) => {
  const R = (120 - stroke) / 2 - 2;
  const C = 2 * Math.PI * R;
  const off = C * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke={trackClass} strokeWidth={stroke} />
        <circle
          cx="60" cy="60" r={R} fill="none"
          stroke={ACCENT} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)", filter: "drop-shadow(0 0 6px rgba(233,30,63,0.55))" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};

// ── 세그먼트 게이지 바 — 칸이 나뉜 게임식 XP 바 ───────────────
/** @type {import("react").FC<any>} */
export const SegBar = ({ pct = 0, segments = 10, h = "h-2.5", sheen = false }) => {
  const step = 100 / segments;
  return (
    <div className={`relative ${h} rounded-[3px] bg-black/[0.06] overflow-hidden`}>
      <div
        className="h-full rounded-[3px] bg-[#e91e3f] relative overflow-hidden"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }}
      >
      </div>
      {/* 세그먼트 눈금 오버레이 */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent calc(${step}% - 1px), rgba(245,243,240,1) calc(${step}% - 1px), rgba(245,243,240,1) ${step}%)` }}
      ></div>
    </div>
  );
};

// ── 스탯 타일 — 라벨/값/보조값 ───────────────────────────────
/** @type {import("react").FC<any>} */
export const HudStat = ({ label, value, sub, accent = false, className = "" }) => (
  <div className={`bg-[#ffffff] px-3 py-4 md:px-4 md:py-5 text-center ${className}`}>
    <p className="text-[9px] font-black tracking-[0.22em] text-[#a3a3a3] uppercase mb-2 whitespace-nowrap">{label}</p>
    <p className={`text-lg md:text-2xl font-black tabular-nums tracking-tight leading-none ${accent ? "text-[#e91e3f]" : "text-[#131313]"}`}>{value}</p>
    {sub && <p className="text-[10px] text-[#a3a3a3] font-bold mt-1.5 whitespace-nowrap">{sub}</p>}
  </div>
);

// ── 숫자 카운트업 (뷰포트 진입 시 시작) ──────────────────────
/** @type {import("react").FC<any>} */
export const HudCount = ({ end, duration = 1200, suffix = "" }) => {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ob = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setStarted(true); ob.unobserve(el); } }, { threshold: 0.3 });
    ob.observe(el);
    return () => ob.disconnect();
  }, []);
  useEffect(() => {
    if (!started) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      setValue(Math.floor(end * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, end, duration]);
  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
};

// ── 상태 캡슐 — LIVE / UPCOMING / OPEN / COMPLETE / PINNED / D-n / YOU 어휘 전용 ──
/** @type {import("react").FC<any>} */
export const StatusChip = ({ children, accent = false, dot = false, dotColor, className = "" }) => (
  <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-full border text-[10px] font-black tracking-[0.15em] uppercase tabular-nums whitespace-nowrap ${accent ? "border-[#e91e3f]/40 text-[#e91e3f]" : "border-black/15 text-[#131313]/60"} ${className}`}>
    {dot && <LiveDot color={dotColor || (accent ? "bg-[#e91e3f]" : "bg-emerald-400")} />}
    {children}
  </span>
);

// ── 오픈 섹션 — 박스 없이 헤더 라벨 + 내용 (카드 최소화 원칙의 기본 단위) ──
/** @type {import("react").FC<any>} */
export const HudSection = ({ label, live = false, accent = false, right, children, className = "" }) => (
  <section className={className}>
    <HudLabel text={label} live={live} accent={accent} right={right} className="mb-4" />
    {children}
  </section>
);

// ── 눈금자 — 대형 수평 게이지 위에 계기 감성 디테일 ──
/** @type {import("react").FC<any>} */
export const TickRuler = ({ className = "" }) => (
  <div aria-hidden className={`flex justify-between mb-1 ${className}`}>
    {Array.from({ length: 11 }, (_, i) => (
      <span key={i} className={`w-px ${i % 5 === 0 ? "h-1.5 bg-black/30" : "h-1 bg-black/15"}`}></span>
    ))}
  </div>
);

// ── 세그먼트 래더 — 이산 티어 표시 (지난/현재/미래) ──
/** @type {import("react").FC<any>} */
export const SegLadder = ({ total, currentIndex, titles = [] }) => (
  <div className="pt-2.5">
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          title={titles[i] || ""}
          className={`relative flex-1 h-2 rounded-[1px] ${i < currentIndex ? "bg-black/25" : i === currentIndex ? "bg-[#e91e3f] animate-pulse" : "bg-black/[0.08]"}`}
        >
          {i === currentIndex && <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rotate-45 bg-[#e91e3f]"></span>}
        </div>
      ))}
    </div>
  </div>
);

// ── 스파크라인 — 24h 온라인 히스토리 (축·그리드 없는 미니 라인) ──
/** @type {import("react").FC<any>} */
export const Sparkline = ({ history = [], h = 96 }) => {
  if (!history || history.length < 2) {
    return <div className="h-24 flex items-center justify-center text-[11px] font-bold text-[#c4c4c4] tracking-wide">NO DATA</div>;
  }
  const W = 300, H = 80;
  const vals = history.map((p) => p.online);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * W, H - 6 - ((v - min) / range) * (H - 14)]);
  const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <div>
      <div className="flex justify-between text-[9px] font-bold text-[#a3a3a3] tabular-nums mb-1">
        <span>PEAK {max.toLocaleString()}</span>
        <span>LOW {min.toLocaleString()}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
        <polyline points={line} fill="none" stroke={ACCENT} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill={ACCENT} />
      </svg>
      <div className="flex justify-between text-[9px] font-bold text-[#a3a3a3] mt-1">
        <span>-24H</span>
        <span className="text-[#e91e3f]">NOW</span>
      </div>
    </div>
  );
};

// ── 리더보드 행 — 홈 TOP5·레벨 TOP10 공용 (아바타 없음: 순위 숫자가 아이덴티티) ──
//    행 하단 1px 상대치 바(1위 XP 대비)로 격차를 데이터로 시각화
/** @type {import("react").FC<any>} */
export const RankRows = ({ rows = [], myId, me, myName = "" }) => {
  const topXp = rows[0]?.xp || 0;
  const inList = !!myId && rows.some((r) => r.userId === myId);
  const Row = ({ rank, name, level, xp, mine }) => (
    <div className={`relative border-b border-black/[0.06] ${mine ? "bg-black/[0.05]" : ""}`}>
      {mine && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#e91e3f]"></span>}
      <div className="flex items-center h-10 pl-2 pr-1 gap-3">
        <span className={`w-7 shrink-0 text-right text-sm font-black tabular-nums ${rank === 1 ? "text-[#e91e3f]" : rank <= 3 ? "text-[#131313]/90" : "text-[#a3a3a3]"}`}>{String(rank).padStart(2, "0")}</span>
        <span className={`min-w-0 flex-1 truncate text-[13px] font-bold ${mine ? "text-[#131313]" : "text-[#4b4b4b]"}`}>
          {name}
          {mine && <StatusChip accent className="ml-2 align-middle">YOU</StatusChip>}
        </span>
        <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums">LV {level}</span>
        <span className="shrink-0 w-20 md:w-24 text-right text-xs font-black text-[#131313] tabular-nums">{(xp || 0).toLocaleString()}</span>
      </div>
      {topXp > 0 && <div aria-hidden className="h-px bg-black/10" style={{ width: `${Math.max(2, ((xp || 0) / topXp) * 100)}%` }}></div>}
    </div>
  );
  return (
    <div>
      {rows.map((r) => <Row key={r.userId} rank={r.rank} name={r.name} level={r.level} xp={r.xp} mine={!!myId && r.userId === myId} />)}
      {myId && !inList && me && (
        <>
          <div className="py-1 text-center text-[#c4c4c4] text-[10px] font-black tracking-[0.3em]">···</div>
          <Row rank={me.rank} name={myName} level={me.level} xp={me.xp} mine />
        </>
      )}
    </div>
  );
};

// ── 빈 슬롯 — 0건 상태를 게임의 빈 퀘스트 슬롯 문법으로 ──
/** @type {import("react").FC<any>} */
export const EmptySlot = ({ children, className = "" }) => (
  <div className={`border border-dashed border-black/10 rounded-lg h-[72px] flex items-center justify-center text-center text-[11px] font-bold text-[#c4c4c4] tracking-wide px-4 ${className}`}>
    {children}
  </div>
);

// ── 공용 스타일 — 브래킷·시머·스캔·그리드 (페이지당 1회 렌더) ──
/** @type {import("react").FC<any>} */
export const HudStyles = () => (
  <style dangerouslySetInnerHTML={{ __html: `
    .hud-c { position: absolute; width: 9px; height: 9px; pointer-events: none; z-index: 1;
             border: 0 solid rgba(0,0,0,0.28); }
    .hud-c-accent { border-color: rgba(233,30,63,0.75); }
    .hud-c-tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; border-top-left-radius: 3px; }
    .hud-c-tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; border-top-right-radius: 3px; }
    .hud-c-bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; border-bottom-left-radius: 3px; }
    .hud-c-br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; border-bottom-right-radius: 3px; }
    @keyframes hudSheen { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
    @keyframes hudTicker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
    @keyframes hudRowFlash { 0% { background-color: rgba(233,30,63,0.10); } 100% { background-color: transparent; } }
    .hud-ticker:hover .hud-ticker-track { animation-play-state: paused; }
    @media (prefers-reduced-motion: reduce) {
      .hud-ticker-track { animation: none !important; }
      .animate-ping { animation: none !important; }
    }
    @keyframes hudPulse { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } }
    @keyframes hudToastIn { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .hud-shimmer {
      background: linear-gradient(110deg, #131313 20%, #e91e3f 40%, #ff7a92 50%, #e91e3f 60%, #131313 80%);
      background-size: 200% auto;
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
      animation: hudShimmer 6s linear infinite;
    }
    @keyframes hudShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    .hud-grid-bg {
      background-image: linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px);
      background-size: 44px 44px;
      mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
      -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
    }
    /* 미세 스캔라인 — 패널 배경 질감 (아주 옅게) */
    .hud-scan { background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.014) 0 1px, transparent 1px 3px); }
  ` }} />
);
