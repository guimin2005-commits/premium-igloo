"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { ScrollProgress } from "../components/Lux";

const getCumulativeXpByLevel = (lvl) => {
  if (lvl <= 0) return 0;
  return Math.floor(((23 * lvl) ** 2 - 525) / 5) + 1;
};

const getLevelByXp = (xp) => {
  if (xp <= 0) return 0;
  for (let l = 1; l <= 1000; l++) {
    let requiredTotalXp = Math.floor(((23 * l) ** 2 - 525) / 5) + 1;
    if (xp < requiredTotalXp) return l - 1;
  }
  return 1000;
};

// 📌 스크롤 등장 모션 컴포넌트 (Intersection Observer)
const Reveal = ({ children, delay = 0, className = "" }) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// 📌 숫자 카운트업 모션
const CountUp = ({ end, duration = 1400, suffix = "" }) => {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(end * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, end, duration]);

  return <span ref={ref}>{value.toLocaleString()}{suffix}</span>;
};

// 📌 섹션 헤더 (에디토리얼 넘버링 스타일)
const SectionHeader = ({ no, title, desc }) => (
  <div className="mb-8">
    <div className="flex items-baseline gap-4 mb-2">
      <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
    </div>
    <h3 className="text-xl md:text-2xl font-black text-white tracking-tight">{title}</h3>
    {desc && <p className="text-xs text-gray-500 mt-2 leading-relaxed">{desc}</p>}
  </div>
);

// 📌 그라디언트 보더 카드 (고급 글래스 스타일)
const LuxCard = ({ children, className = "", glow = false }) => (
  <div className={`relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px ${glow ? "shadow-[0_20px_60px_-20px_rgba(233,30,63,0.25)]" : ""}`}>
    <div className={`rounded-2xl bg-[#111111]/95 backdrop-blur-sm h-full ${className}`}>
      {children}
    </div>
  </div>
);

// 📌 시즌 설정 — 시즌 교체 시 여기만 수정
const SEASON = {
  number: 1,
  name: "UP!",
  start: "2026-05-01",
  end: "2026-09-30",
};

export default function LevelPage() {
  const [activeMainTab, setActiveMainTab] = useState("intro");

  // 시즌 D-Day (KST 기준)
  const seasonDday = useMemo(() => {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().slice(0, 10);
    const end = new Date(`${SEASON.end}T23:59:59+09:00`).getTime();
    const days = Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000));
    return { days, ended: todayStr > SEASON.end };
  }, []);

  const [searchLevel, setSearchLevel] = useState("");
  const searchResult = useMemo(() => {
    if (!searchLevel) return { cumXp: null, reqXp: null };
    let inputVal = parseInt(searchLevel);
    if (inputVal < 1) inputVal = 1;
    if (inputVal > 1000) inputVal = 1000;
    const cumXp = getCumulativeXpByLevel(inputVal);
    const reqXp = inputVal === 1 ? 0 : cumXp - getCumulativeXpByLevel(inputVal - 1);
    return { cumXp, reqXp, inputVal };
  }, [searchLevel]);

  const fullTableRows = useMemo(() => {
    let rows = [];
    for (let i = 1; i <= 1000; i++) {
      const cumXp = getCumulativeXpByLevel(i);
      const reqXp = i === 1 ? 0 : cumXp - getCumulativeXpByLevel(i - 1);
      rows.push({ level: i, cumXp, reqXp });
    }
    return rows;
  }, []);

  const handleSearch = () => {
    let val = parseInt(searchLevel);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 1000) val = 1000;
    setSearchLevel(val.toString());

    setTimeout(() => {
      const row = document.getElementById(`row-lvl-${val}`);
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  };

  const [simLevel, setSimLevel] = useState("");
  const [simChannel, setSimChannel] = useState("chat");
  const [simTime, setSimTime] = useState("");
  const [simBoost1, setSimBoost1] = useState(false);
  const [simBoost2, setSimBoost2] = useState(false);
  const [simEvent, setSimEvent] = useState(false);
  const [penChild, setPenChild] = useState(false);
  const [penYouth, setPenYouth] = useState(false);
  const [penAdult, setPenAdult] = useState(false);
  const [penMother, setPenMother] = useState(false);
  const [simAttend, setSimAttend] = useState("");
  const [simAttendBoost, setSimAttendBoost] = useState(false);

  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  // 📌 목표 모드 — 목표 레벨까지 예상 소요일 계산
  const [goalLevel, setGoalLevel] = useState("");
  const [goalDailyTime, setGoalDailyTime] = useState("");

  const handleLimitInput = (setter, maxLimit) => (e) => {
    let val = e.target.value;
    if (val === "") {
      setter("");
      return;
    }
    let num = parseInt(val, 10);
    if (num < 0) num = 0;
    if (num > maxLimit) num = maxLimit;
    setter(num.toString());
  };

  const resetSimulator = () => {
    setSimLevel(""); setSimChannel("chat"); setSimTime("");
    setSimBoost1(false); setSimBoost2(false); setSimEvent(false);
    setPenChild(false); setPenYouth(false); setPenAdult(false); setPenMother(false);
    setSimAttend(""); setSimAttendBoost(false);
    setIsChannelDropdownOpen(false);
  };

  const simResult = useMemo(() => {
    const level = Math.max(0, parseInt(simLevel) || 0);
    const time = Math.max(0, parseInt(simTime) || 0);
    const attendanceCount = Math.max(0, parseInt(simAttend) || 0);

    let channelBaseXp = 0;
    let levelBonusXp = 0;
    let checkInterval = 1;

    if (simChannel === "chat") {
      channelBaseXp = 200; levelBonusXp = 0; checkInterval = 1;
    } else {
      checkInterval = 5;
      channelBaseXp = simChannel === "voice" ? 3000 : 3500;
      if (level >= 700) levelBonusXp = 1000;
      else if (level >= 649) levelBonusXp = 1000;
      else if (level >= 600) levelBonusXp = 1000;
      else if (level >= 550) levelBonusXp = 1000;
      else if (level >= 500) levelBonusXp = 1000;
      else if (level >= 450) levelBonusXp = 700;
      else if (level >= 400) levelBonusXp = 600;
      else if (level >= 350) levelBonusXp = 500;
      else if (level >= 300) levelBonusXp = 400;
      else if (level >= 250) levelBonusXp = 350;
      else if (level >= 200) levelBonusXp = 300;
      else if (level >= 150) levelBonusXp = 250;
      else if (level >= 100) levelBonusXp = 200;
      else if (level >= 50) levelBonusXp = 150;
      else levelBonusXp = 0;
    }

    const channelCycles = Math.floor(time / checkInterval);
    const channelTotalXp = (channelBaseXp + levelBonusXp) * channelCycles;

    const b1Add = simBoost1 ? 300 : 0;
    const b2Add = simBoost2 ? 100 : 0;
    const evAdd = simEvent ? 200 : 0;
    let penguinAdd = 0;
    if (penChild) penguinAdd += 250;
    if (penYouth) penguinAdd += 350;
    if (penAdult) penguinAdd += 450;
    if (penMother) penguinAdd += 550;

    const buffTotalXp = (b1Add + b2Add + evAdd + penguinAdd) * channelCycles;
    const attendanceBaseTotal = attendanceCount * 7000;
    const attendanceBoostTotal = simAttendBoost ? attendanceCount * 7000 : 0;

    const finalGrandTotal = channelTotalXp + buffTotalXp + attendanceBaseTotal + attendanceBoostTotal;
    const currentCumulativeXp = getCumulativeXpByLevel(level);
    const projectedTotalXp = currentCumulativeXp + finalGrandTotal;
    const finalLevel = getLevelByXp(projectedTotalXp);

    const cycleText = simChannel === "chat" ? "1분당" : "5분당";
    const cycleBaseText = simChannel === "chat" ? "1분" : "5분";

    return {
      channelBaseXp, levelBonusXp, channelCycles, channelTotalXp,
      b1Add, b2Add, evAdd, penguinAdd, buffTotalXp,
      attendanceBaseTotal, attendanceBoostTotal,
      finalGrandTotal, projectedTotalXp, finalLevel,
      cycleText, cycleBaseText
    };
  }, [simLevel, simChannel, simTime, simBoost1, simBoost2, simEvent, penChild, penYouth, penAdult, penMother, simAttend, simAttendBoost]);

  // 📌 목표 모드 계산 — 현재 시뮬레이터 조건(레벨/채널/버프) 기준 하루 활동량으로 예상 소요일 산출
  const goalResult = useMemo(() => {
    const currentLv = Math.max(0, parseInt(simLevel) || 0);
    const targetLv = Math.min(1000, Math.max(0, parseInt(goalLevel) || 0));
    const dailyMin = Math.max(0, parseInt(goalDailyTime) || 0);
    if (!targetLv || targetLv <= currentLv || dailyMin <= 0) return null;

    const neededXp = getCumulativeXpByLevel(targetLv) - getCumulativeXpByLevel(currentLv);
    const checkInterval = simChannel === "chat" ? 1 : 5;
    const perCycle = simResult.channelBaseXp + simResult.levelBonusXp + simResult.b1Add + simResult.b2Add + simResult.evAdd + simResult.penguinAdd;
    const cyclesPerDay = Math.floor(dailyMin / checkInterval);
    const attendDaily = 7000 + (simAttendBoost ? 7000 : 0); // 하루 1회 출석 가정
    const dailyXp = perCycle * cyclesPerDay + attendDaily;
    if (dailyXp <= 0) return null;

    const days = Math.ceil(neededXp / dailyXp);
    return { neededXp, dailyXp, days, months: Math.floor(days / 30), remDays: days % 30, targetLv };
  }, [simLevel, goalLevel, goalDailyTime, simChannel, simResult, simAttendBoost]);

  return (
    <main className="w-full flex-1 flex flex-col relative overflow-hidden">
      <ScrollProgress />
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #e91e3f; }
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .lux-shimmer {
          background: linear-gradient(110deg, #ffffff 20%, #e91e3f 40%, #ff7a92 50%, #e91e3f 60%, #ffffff 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s linear infinite;
        }
        .lux-grid-bg {
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
        }
      `}} />

      {/* ── HERO ───────────────────────────── */}
      <section className="relative w-full pt-20 pb-14 md:pt-28 md:pb-20 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>

        <div className="max-w-5xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Premium Igloo Official</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-6">
              <span className="text-white">SYSTEM</span>
              <span className="text-[#e91e3f] mx-2 md:mx-3">:</span>
              <span className="lux-shimmer">LEVEL</span>
            </h1>

            {/* 📌 현재 시즌 배지 */}
            <div className="flex flex-wrap items-center gap-2.5 mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#e91e3f]/10 border border-[#e91e3f]/30">
                <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-[pulseGlow_2.5s_ease-in-out_infinite]"></span>
                <span className="text-xs font-black text-[#e91e3f] tracking-wide">SEASON {SEASON.number} · {SEASON.name}</span>
              </span>
              <span className="text-[11px] font-bold text-gray-500">{SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")}</span>
              {!seasonDday.ended && seasonDday.days >= 0 && (
                <span className="text-[11px] font-black text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">종료까지 D-{seasonDday.days}</span>
              )}
            </div>

            <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-xl">
              활동이 곧 자산이 되는 곳. 채팅과 음성으로 XP를 쌓고,<br className="hidden md:block" />
              레벨이 오를수록 깊어지는 프리미엄 혜택을 경험하세요.
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="grid grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden mt-12 max-w-2xl border border-white/10">
              {[
                { n: 1000, l: "MAX LEVEL", s: "" },
                { n: 7000, l: "출석 1회 XP", s: "" },
                { n: 3500, l: "내전 채널 XP", s: "" },
              ].map((stat, i) => (
                <div key={i} className="bg-[#0d0d0d] px-4 py-6 md:px-8 md:py-8 text-center group hover:bg-[#121212] transition-colors">
                  <div className="text-2xl md:text-4xl font-black text-white group-hover:text-[#e91e3f] transition-colors tracking-tight">
                    <CountUp end={stat.n} suffix={stat.s} />
                  </div>
                  <div className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-gray-600 mt-2 uppercase">{stat.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── TAB NAV (스티키 세그먼트) ─────── */}
      <div className="sticky top-16 z-30 w-full px-6 py-3 bg-[#090909]/85 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-5xl mx-auto flex gap-1.5 overflow-x-auto custom-scrollbar">
          {[
            { id: "intro", name: "시스템 소개" },
            { id: "policy", name: "XP 획득 및 혜택" },
            { id: "table", name: "XP 테이블" },
            { id: "sim", name: "XP 시뮬레이터" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveMainTab(tab.id)}
              className={`px-5 py-2.5 text-xs md:text-sm font-bold rounded-full shrink-0 outline-none focus:outline-none transition-all duration-300 ${
                activeMainTab === tab.id
                  ? "bg-[#e91e3f] text-white shadow-[0_4px_20px_rgba(233,30,63,0.35)]"
                  : "bg-white/[0.04] text-gray-500 hover:text-white hover:bg-white/[0.08] border border-white/5"
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-6 py-14 flex-1">

        {/* ══ TAB : INTRO ══════════════════ */}
        {activeMainTab === "intro" && (
          <div className="space-y-16">
            <Reveal>
              <SectionHeader no="01" title="성장의 3가지 축" desc="고급 이글루 레벨 시스템을 구성하는 핵심 가치" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { no: "I", t: "XP 획득 및 한계 돌파", d: "채팅과 음성 활동으로 끊임없이 성장하세요. 상한선은 1,000레벨입니다." },
                  { no: "II", t: "전용 역할 부여", d: "특정 레벨 도달 시 전용 역할과 색상, 프리미엄 권한이 부여됩니다." },
                  { no: "III", t: "XP SHOP 혜택", d: "축적한 XP로 시즌 상품과 특별 권한을 구매할 수 있습니다." },
                ].map((f, i) => (
                  <Reveal key={i} delay={i * 130}>
                    <LuxCard className="p-7 group hover:bg-[#141414] transition-colors duration-300 h-full">
                      <div className="text-3xl font-black text-white/[0.06] mb-6 group-hover:text-[#e91e3f]/20 transition-colors duration-500 select-none">{f.no}</div>
                      <div className="text-white font-bold text-base mb-2.5 tracking-tight">{f.t}</div>
                      <div className="text-gray-500 text-[13px] leading-relaxed break-keep">{f.d}</div>
                      <div className="mt-6 h-px w-8 bg-[#e91e3f]/40 group-hover:w-full transition-all duration-500"></div>
                    </LuxCard>
                  </Reveal>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="02" title="기본 명령어" desc="디스코드 서버 내에서 사용 가능한 슬래시 커맨드" />
              <LuxCard className="divide-y divide-white/5">
                {[
                  { c: "/레벨", d: "다음 레벨 도달까지 필요 XP 확인" },
                  { c: "/랭크", d: "XP, 레벨, 서버 내 순위 확인" },
                  { c: "/출석체크", d: "출석체크를 통한 7,000 XP 지급" },
                  { c: "/경험치샵", d: "XP SHOP 상점으로 이동" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-5 group hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-4">
                      <span className="text-[#e91e3f] font-mono font-bold text-sm tracking-tight">{item.c}</span>
                    </div>
                    <span className="text-gray-500 text-xs md:text-sm text-right">{item.d}</span>
                  </div>
                ))}
              </LuxCard>
            </Reveal>

            {/* 📌 시즌 안내 */}
            <Reveal>
              <SectionHeader no="03" title={`시즌 안내 — SEASON ${SEASON.number} '${SEASON.name}'`} desc={`레벨 시스템은 시즌제로 운영됩니다 · 현재 시즌 기간 ${SEASON.start.replace(/-/g, ".")} ~ ${SEASON.end.replace(/-/g, ".")}`} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 시즌 한정 상품 */}
                <LuxCard className="p-7">
                  <div className="flex items-center gap-2.5 mb-6">
                    <span className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">Season Limited</span>
                    <span className="text-sm font-bold text-white">시즌 한정 상품</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-5 leading-relaxed">실물 기프트카드로 구성된 시즌 한정 라인업입니다. 한정 수량 소진 시 조기 마감됩니다.</p>
                  <div className="space-y-2">
                    {[
                      { name: "올리브영 기프트카드", value: "3만원권", stock: 1 },
                      { name: "배달의민족 기프트카드", value: "3만원권", stock: 1 },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-4 py-3.5 hover:border-[#e91e3f]/25 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-white">{item.name}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{item.value} · 실물 상품</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-black bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25 px-2.5 py-1 rounded-full">한정 {item.stock}개</span>
                      </div>
                    ))}
                  </div>
                </LuxCard>

                {/* 시즌 종료 보상 — RANKER */}
                <div className="relative rounded-2xl bg-gradient-to-b from-[#e91e3f]/50 via-[#e91e3f]/15 to-transparent p-px">
                  <div className="rounded-2xl bg-[#150b0e] p-7 h-full relative overflow-hidden">
                    <div className="absolute -top-12 -right-12 w-40 h-40 bg-[#e91e3f]/12 blur-[60px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite]"></div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-2.5 mb-6">
                        <span className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">Season Finale</span>
                        <span className="text-sm font-bold text-white">시즌 종료 보상</span>
                      </div>
                      <p className="text-2xl font-black text-white tracking-tight mb-1.5">TOP 3 <span className="lux-shimmer">RANKER</span></p>
                      <p className="text-xs text-gray-400 leading-relaxed mb-5">시즌 종료 시 최종 레벨 상위 3인은 RANKER로 선정됩니다.</p>
                      <div className="space-y-2 text-xs text-gray-400">
                        <p className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span><strong className="text-white">@RANKER</strong> 전용 역할 지급</span></p>
                        <p className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span>다음 시즌 특전 <strong className="text-white">[XP] Boost+</strong> 제공</span></p>
                        <p className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span>명예의 전당 영구 등재</span></p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="04" title="이용 시 주의사항" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { t: "XP 획득 제한", d: "잠수 음성 채널 이용 시 XP 획득이 전면 제한되며, 마이크/헤드셋 음소거 시 XP 획득량이 90% 감소됩니다." },
                  { t: "상점 이용 주의", d: "XP SHOP 상품은 보유 XP 소모 방식입니다. 구매로 인해 레벨이 하락할 수 있습니다." },
                ].map((item, i) => (
                  <Reveal key={i} delay={i * 130}>
                    <div className="relative rounded-2xl border border-[#e91e3f]/15 bg-gradient-to-b from-[#e91e3f]/[0.04] to-transparent p-6 h-full">
                      <div className="absolute top-6 right-6 w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-[pulseGlow_2.5s_ease-in-out_infinite]"></div>
                      <strong className="text-white text-sm font-bold block mb-2">{item.t}</strong>
                      <p className="text-gray-500 text-[13px] leading-relaxed break-keep">{item.d}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </Reveal>
          </div>
        )}

        {/* ══ TAB : POLICY ═════════════════ */}
        {activeMainTab === "policy" && (
          <div className="space-y-16">
            <Reveal>
              <SectionHeader no="01" title="기본 XP 획득량" desc="채널 활동별 기본 지급량 및 쿨타임 기준" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { t: "채팅 채널", x: "200", c: "쿨타임 1분", d: "채팅 입력 시 XP를 획득하며, 오남용 방지를 위해 쿨타임 1분이 적용됩니다." },
                  { t: "음성 채널", x: "3,000", c: "쿨타임 5분", d: "음성 채널에서 최소 5분 동안 접속 지속 시 XP가 지급됩니다." },
                  { t: "내전 음성 채널", x: "3,500", c: "쿨타임 5분", d: "음성 채널과 동일하게 적용되며, 보너스 500 XP가 추가 지급됩니다." },
                ].map((item, i) => (
                  <Reveal key={i} delay={i * 130}>
                    <LuxCard className="p-7 h-full group hover:bg-[#141414] transition-colors duration-300">
                      <div className="flex items-center justify-between mb-6">
                        <span className="text-xs font-bold text-gray-400 tracking-wide">{item.t}</span>
                        <span className="text-[10px] font-bold text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">{item.c}</span>
                      </div>
                      <div className="mb-5">
                        <span className="text-4xl font-black text-white tracking-tighter group-hover:text-[#e91e3f] transition-colors duration-300">+{item.x}</span>
                        <span className="text-xs font-bold text-gray-600 ml-1.5">XP</span>
                      </div>
                      <p className="text-gray-500 text-xs leading-relaxed break-keep">{item.d}</p>
                    </LuxCard>
                  </Reveal>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="02" title="추가 XP & 출석 보상" desc="아이템 및 시즌 상품 보유 시 추가 획득량" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                <LuxCard className="p-7">
                  <div className="flex items-center gap-2.5 mb-7">
                    <span className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">Permanent</span>
                    <span className="text-sm font-bold text-white">아이템 상품 [영구제]</span>
                  </div>

                  <div className="flex justify-between items-center pb-5 border-b border-white/5">
                    <div>
                      <div className="text-sm font-bold text-white mb-1">[XP] Boost+</div>
                      <div className="text-xs text-gray-500">조건 충족 시 기본 XP에 추가 획득</div>
                    </div>
                    <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+300</span>
                  </div>

                  <div className="pt-6">
                    <div className="text-sm font-bold text-white mb-1">[역할] 펭귄 패밀리</div>
                    <div className="text-xs text-gray-500 mb-5">보유 시 기본 XP에 추가 획득 [중첩 누적 가능]</div>
                    <div className="space-y-2">
                      {[
                        { r: "어린이 펭귄", x: "+250" },
                        { r: "청소년 펭귄", x: "+350" },
                        { r: "어른 펭귄", x: "+450" },
                        { r: "어미 펭귄", x: "+550" },
                      ].map((p, i) => (
                        <div key={i} className="flex justify-between items-center bg-white/[0.03] hover:bg-white/[0.06] transition-colors rounded-xl px-4 py-3">
                          <span className="text-xs text-gray-300 font-medium">{p.r}</span>
                          <span className="text-[#e91e3f] text-xs font-black">{p.x} XP</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </LuxCard>

                <div className="space-y-4">
                  <LuxCard className="p-7">
                    <div className="flex items-center gap-2.5 mb-7">
                      <span className="text-[10px] font-black tracking-[0.2em] text-gray-400 uppercase">Seasonal</span>
                      <span className="text-sm font-bold text-white">시즌 상품 [기간제]</span>
                    </div>
                    <div className="flex justify-between items-center pb-5 border-b border-white/5">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">[XP] S1 Boost+</div>
                        <div className="text-xs text-gray-500">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+100</span>
                    </div>
                    <div className="flex justify-between items-center pt-5">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">[이벤트] 7월 Bonus</div>
                        <div className="text-xs text-gray-500">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+550</span>
                    </div>
                  </LuxCard>

                  <LuxCard className="p-7">
                    <div className="flex items-center gap-2.5 mb-7">
                      <span className="text-[10px] font-black tracking-[0.2em] text-gray-400 uppercase">Daily</span>
                      <span className="text-sm font-bold text-white">출석 보상 시스템</span>
                    </div>
                    <div className="flex justify-between items-center pb-5 border-b border-white/5">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">기본 출석 체크</div>
                        <div className="text-xs text-gray-500">출석 체크 시, 1회당 7,000 XP가 지급됩니다.</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+7,000</span>
                    </div>
                    <div className="flex justify-between items-center pt-5">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">[XP] 출석 Boost</div>
                        <div className="text-xs text-gray-500">상품 보유 시 출석 기본 XP에 추가로 획득합니다.</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+7,000</span>
                    </div>
                  </LuxCard>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="03" title="레벨 구간별 추가 기준" desc="음성/내전 채널 이용 시 레벨 구간에 따른 추가 XP" />
              <LuxCard>
                <div className="grid grid-cols-3 px-6 py-4 border-b border-white/10 text-[10px] font-black tracking-[0.15em] text-gray-500 uppercase text-center">
                  <div className="text-left">진입 조건 레벨</div><div>구간 추가 XP</div><div className="text-right">변동량</div>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    { l: "0 ~ 49 Lv", x: "+3,000", d: "기본값", c: "text-gray-600" },
                    { l: "50 ~ 99 Lv", x: "+3,150", d: "▲ 150", c: "text-[#e91e3f]" },
                    { l: "100 ~ 149 Lv", x: "+3,250", d: "▲ 100", c: "text-[#e91e3f]" },
                    { l: "150 ~ 199 Lv", x: "+3,350", d: "▲ 100", c: "text-[#e91e3f]" },
                    { l: "200 ~ 249 Lv", x: "+3,500", d: "▲ 150", c: "text-[#e91e3f]" },
                    { l: "250 ~ 299 Lv", x: "+3,600", d: "▲ 100", c: "text-[#e91e3f]" },
                    { l: "300 ~ 349 Lv", x: "+3,700", d: "▲ 100", c: "text-[#e91e3f]" },
                    { l: "350 ~ 399 Lv", x: "+3,800", d: "▲ 100", c: "text-[#e91e3f]" },
                    { l: "400 ~ 449 Lv", x: "+4,000", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "450 ~ 499 Lv", x: "+4,200", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "500 ~ 549 Lv", x: "+4,400", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "550 ~ 599 Lv", x: "+4,600", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "600 ~ 649 Lv", x: "+4,800", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "649 ~ 699 Lv", x: "+5,000", d: "▲ 200", c: "text-[#e91e3f]" },
                    { l: "700 Lv 이상 최고 구간", x: "+6,000", d: "▲ 1,000", c: "text-[#e91e3f]" },
                  ].map((row, i) => (
                    <div key={i} className="grid grid-cols-3 px-6 py-3.5 text-xs items-center hover:bg-white/[0.03] transition-colors group">
                      <div className="text-gray-300 text-left font-medium">{row.l}</div>
                      <div className="text-white font-bold text-center group-hover:text-[#e91e3f] transition-colors">{row.x} <span className="text-gray-600 font-medium">XP</span></div>
                      <div className={`font-bold text-right ${row.c}`}>{row.d}</div>
                    </div>
                  ))}
                </div>
              </LuxCard>
            </Reveal>
          </div>
        )}

        {/* ══ TAB : TABLE ══════════════════ */}
        {activeMainTab === "table" && (
          <Reveal>
            <SectionHeader no="01" title="XP 테이블" desc="레벨별 필요 및 누적 XP를 검색하세요 (1~1000)" />

            <LuxCard className="p-6 md:p-8 mb-6" glow>
              <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center">
                <div className="flex gap-2 shrink-0 w-full lg:w-auto">
                  <input
                    type="number"
                    value={searchLevel}
                    onChange={(e) => setSearchLevel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="레벨 입력"
                    className="w-full lg:w-40 px-5 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white text-sm outline-none focus:outline-none focus:border-[#e91e3f] text-center transition-colors font-bold"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-6 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-all outline-none focus:outline-none shadow-[0_8px_24px_rgba(233,30,63,0.3)] shrink-0"
                  >
                    검색
                  </button>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-px bg-white/10 rounded-xl overflow-hidden border border-white/10">
                  <div className="bg-[#0d0d0d] px-4 py-5 text-center">
                    <span className="block text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2">누적 XP</span>
                    <span className="text-base md:text-xl font-black text-[#e91e3f] tracking-tight">{searchResult.cumXp ? `${searchResult.cumXp.toLocaleString()}` : "—"}</span>
                  </div>
                  <div className="bg-[#0d0d0d] px-4 py-5 text-center">
                    <span className="block text-[10px] font-bold tracking-[0.2em] text-gray-600 uppercase mb-2">레벨업 필요 XP</span>
                    <span className="text-base md:text-xl font-black text-white tracking-tight">{searchResult.reqXp !== null ? `${searchResult.reqXp.toLocaleString()}` : "—"}</span>
                  </div>
                </div>
              </div>
            </LuxCard>

            <LuxCard className="overflow-hidden">
              <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-center text-xs">
                  <thead className="bg-[#0d0d0d] sticky top-0 z-10">
                    <tr className="text-[10px] font-black tracking-[0.15em] text-gray-500 uppercase">
                      <th className="p-4 border-b border-white/10">Level</th>
                      <th className="p-4 border-b border-white/10">누적 XP 총량</th>
                      <th className="p-4 border-b border-white/10">필요 XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04] text-gray-400">
                    {fullTableRows.map((row) => (
                      <tr
                        key={row.level}
                        id={`row-lvl-${row.level}`}
                        className={`hover:bg-white/[0.03] transition-colors ${searchResult.inputVal === row.level ? 'bg-[#e91e3f]/10' : ''}`}
                      >
                        <td className={`p-3 font-black ${searchResult.inputVal === row.level ? 'text-[#e91e3f]' : 'text-white/80'}`}>{row.level}</td>
                        <td className="p-3 text-gray-300 font-medium">{row.cumXp.toLocaleString()}</td>
                        <td className="p-3">{row.reqXp.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </LuxCard>
          </Reveal>
        )}

        {/* ══ TAB : SIMULATOR ══════════════ */}
        {activeMainTab === "sim" && (
          <Reveal>
            <SectionHeader no="01" title="XP 시뮬레이터" desc="조건을 설정하면 예상 획득 XP와 도달 레벨을 실시간으로 계산합니다" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

              {/* ── 좌: 조건 설정 ── */}
              <LuxCard className="p-6 md:p-7">
                <div className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase mb-6">Configuration</div>

                {[
                  { l: "현재 유저 레벨", val: simLevel, set: setSimLevel, p: "0~1000", max: 1000 },
                  { l: "총 활동 시간 (분)", val: simTime, set: setSimTime, p: "0~999999", max: 999999 },
                  { l: "총 출석 횟수", val: simAttend, set: setSimAttend, p: "0~9999", max: 9999 },
                ].map((input, idx) => (
                  <div key={idx} className="flex justify-between items-center py-3.5 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">{input.l}</label>
                    <input
                      type="number"
                      placeholder={input.p}
                      value={input.val}
                      onChange={handleLimitInput(input.set, input.max)}
                      className="w-32 px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs text-center outline-none focus:outline-none focus:border-[#e91e3f] transition-colors font-bold"
                    />
                  </div>
                ))}

                <div className="relative">
                  <div className="flex justify-between items-center py-3.5 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">이용 활동 채널</label>
                    <div className="w-32">
                      <button
                        type="button"
                        onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                        className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-xs outline-none focus:outline-none transition-colors hover:border-[#e91e3f]/50 flex justify-between items-center font-bold"
                      >
                        <span className="truncate">
                          {simChannel === 'chat' ? '채팅 (1분)' : simChannel === 'voice' ? '음성 (5분)' : '내전 (5분)'}
                        </span>
                        <span className="text-[9px] text-gray-500 ml-1">▼</span>
                      </button>

                      {isChannelDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                          <div className="absolute top-full right-0 w-36 mt-1.5 bg-[#161616] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                            {[
                              { val: 'chat', label: '채팅 채널 (1분)' },
                              { val: 'voice', label: '음성 채널 (5분)' },
                              { val: 'scrim', label: '내전 채널 (5분)' }
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                onClick={() => { setSimChannel(opt.val); setIsChannelDropdownOpen(false); }}
                                className={`w-full text-left px-4 py-3 text-xs transition-colors outline-none focus:outline-none relative z-50 ${simChannel === opt.val ? 'bg-[#e91e3f]/15 text-[#e91e3f] font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* 아이템 상품 [영구제] */}
                <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-5">
                  <div className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase mb-4">Permanent Items</div>
                  <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] XP Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost1(!simBoost1)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost1 ? 'bg-[#e91e3f]' : 'bg-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simBoost1 ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] 출석 Boost 적용</label>
                    <button type="button" onClick={() => setSimAttendBoost(!simAttendBoost)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simAttendBoost ? 'bg-[#e91e3f]' : 'bg-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simAttendBoost ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>

                  <div className="pt-3">
                    <label className="text-xs font-medium text-gray-300 block mb-3">[아이템] 보유 펭귄 선택 (중복 가능)</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { l: "어린이 +250", val: penChild, set: setPenChild },
                        { l: "청소년 +350", val: penYouth, set: setPenYouth },
                        { l: "어른 +450", val: penAdult, set: setPenAdult },
                        { l: "어미 +550", val: penMother, set: setPenMother },
                      ].map((p, idx) => (
                        <button key={idx} type="button" onClick={() => p.set(!p.val)} className={`px-3.5 py-2 rounded-lg text-[11px] font-bold outline-none focus:outline-none transition-all border ${p.val ? 'bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_4px_14px_rgba(233,30,63,0.3)]' : 'bg-transparent border-white/10 text-gray-500 hover:border-white/30 hover:text-gray-300'}`}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 시즌 상품 [기간제] */}
                <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-5">
                  <div className="text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase mb-4">Seasonal Items</div>
                  <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                    <label className="text-xs font-medium text-gray-300">[아이템] [XP] S1 Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost2(!simBoost2)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost2 ? 'bg-[#e91e3f]' : 'bg-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simBoost2 ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <label className="text-xs font-medium text-gray-300">[이벤트] 7월 Bonus 적용</label>
                    <button type="button" onClick={() => setSimEvent(!simEvent)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simEvent ? 'bg-[#e91e3f]' : 'bg-white/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simEvent ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>
                </div>

                <button onClick={resetSimulator} className="mt-5 w-full py-3 bg-transparent border border-white/10 rounded-xl text-xs font-bold outline-none focus:outline-none text-gray-500 hover:text-white hover:border-white/30 transition-all">
                  전체 초기화
                </button>
              </LuxCard>

              {/* ── 우: 결과 ── */}
              <div className="md:sticky md:top-36 space-y-4">
                <div className="relative rounded-2xl bg-gradient-to-b from-[#e91e3f]/60 via-[#e91e3f]/20 to-transparent p-px shadow-[0_24px_70px_-20px_rgba(233,30,63,0.4)]">
                  <div className="rounded-2xl bg-[#120a0c] p-7 relative overflow-hidden">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-[#e91e3f]/15 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite]"></div>
                    <div className="relative z-10">
                      <div className="text-[10px] font-black tracking-[0.25em] text-[#e91e3f]/80 uppercase mb-5">Projection Result</div>
                      <div className="flex items-end justify-between mb-1.5">
                        <span className="text-xs text-gray-400 font-medium pb-1.5">예상 최종 누적</span>
                        <span className="text-3xl md:text-4xl font-black text-white tracking-tighter">{simResult.projectedTotalXp.toLocaleString()}<span className="text-sm text-[#e91e3f] ml-1.5 font-bold">XP</span></span>
                      </div>
                      <div className="flex items-center justify-between mt-5 pt-5 border-t border-white/10">
                        <span className="text-xs text-gray-400 font-medium">도달 예상 레벨</span>
                        <span className="bg-[#e91e3f] text-white px-4 py-1.5 rounded-full text-sm font-black shadow-[0_4px_16px_rgba(233,30,63,0.4)]">Lv. {simResult.finalLevel}</span>
                      </div>
                      <div className="text-right text-[11px] text-gray-500 mt-3">예상 추가 획득 + {simResult.finalGrandTotal.toLocaleString()} XP</div>
                    </div>
                  </div>
                </div>

                <LuxCard className="p-6">
                  <div className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase mb-4">Breakdown</div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-white/[0.04]">
                      {[
                        { l: "선택 채널 기본 XP (1회당)", v: `${simResult.channelBaseXp.toLocaleString()} XP` },
                        { l: "레벨별 구간 추가 XP (1회당)", v: `${simResult.levelBonusXp.toLocaleString()} XP` },
                        { l: "[채널] 1회 지급당 합계 XP", v: `${(simResult.channelBaseXp + simResult.levelBonusXp).toLocaleString()} XP` },
                        { l: "[채널] 예상 활동 인정 횟수", v: `${simResult.channelCycles}회` },
                        { l: "[채널] 활동 XP 획득 총량", v: `${simResult.channelTotalXp.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] XP Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b1Add.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] 펭귄 패밀리 추가 합산 (${simResult.cycleText})`, v: `${simResult.penguinAdd.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] 출석 Boost 추가 합계`, v: `${simResult.attendanceBoostTotal.toLocaleString()} XP` },
                        { l: `시즌 상품 [기간제] S1 Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b2Add.toLocaleString()} XP` },
                        { l: `시즌 상품 [기간제] 7월 Bonus 추가합산 (${simResult.cycleText})`, v: `${simResult.evAdd.toLocaleString()} XP` },
                        { l: `[아이템] 적용 인정 횟수 (${simResult.cycleBaseText} 지속 기준)`, v: `${simResult.channelCycles}회` },
                        { l: "[버프] 아이템/이벤트 획득 총량", v: `${simResult.buffTotalXp.toLocaleString()} XP` },
                        { l: "[출석] 기본 출석 보상 합계", v: `${simResult.attendanceBaseTotal.toLocaleString()} XP` },
                      ].map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 text-gray-500 break-keep pr-4">{row.l}</td>
                          <td className="py-2.5 text-right text-white font-bold whitespace-nowrap">{row.v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </LuxCard>

                {/* 🎯 목표 모드 */}
                <LuxCard className="p-6">
                  <div className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase mb-1.5">Goal Mode</div>
                  <p className="text-[11px] text-gray-600 mb-5 leading-relaxed">위 조건(레벨·채널·아이템) 기준으로, 목표 레벨까지 걸리는 예상 기간을 계산합니다.</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">목표 레벨</label>
                      <input type="number" placeholder="예: 500" value={goalLevel} onChange={handleLimitInput(setGoalLevel, 1000)} className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs text-center outline-none focus:border-[#e91e3f] transition-colors font-bold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">하루 활동 시간 (분)</label>
                      <input type="number" placeholder="예: 120" value={goalDailyTime} onChange={handleLimitInput(setGoalDailyTime, 1440)} className="w-full px-3 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs text-center outline-none focus:border-[#e91e3f] transition-colors font-bold" />
                    </div>
                  </div>

                  {goalResult ? (
                    <div className="rounded-xl border border-[#e91e3f]/20 bg-gradient-to-b from-[#e91e3f]/[0.06] to-transparent p-5 text-center">
                      <p className="text-[10px] font-bold text-gray-500 mb-2">Lv.{goalResult.targetLv} 도달까지</p>
                      <p className="text-3xl font-black text-[#e91e3f] tracking-tighter mb-1.5">
                        약 {goalResult.days.toLocaleString()}일
                        {goalResult.months > 0 && <span className="text-sm text-gray-400 font-bold ml-2">({goalResult.months}개월 {goalResult.remDays}일)</span>}
                      </p>
                      <p className="text-[10px] text-gray-500">필요 XP {goalResult.neededXp.toLocaleString()} · 일일 예상 획득 {goalResult.dailyXp.toLocaleString()} XP (출석 1회 포함)</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-white/5 bg-black/20 p-5 text-center text-[11px] text-gray-600">
                      목표 레벨과 하루 활동 시간을 입력하면<br/>예상 소요 기간이 표시됩니다.
                    </div>
                  )}
                </LuxCard>
              </div>

            </div>
          </Reveal>
        )}
      </div>
    </main>
  );
}
