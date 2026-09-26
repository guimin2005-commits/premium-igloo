"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { isAdminName } from "@/lib/admins";
import {
  HudPanel, HudSection, HudStyles, LiveDot, RingGauge, SegBar,
  StatusChip, SegLadder, TickRuler, RankRows, EmptySlot,
} from "../components/Hud";
import { SEASON, getSeasonProgress, getSeasonDday, isVoiceTimeTracked, VOICE_TIME_START } from "@/lib/season";
import { VOICE_TIERS, TIER_COLORS, getTierIndex, getVoiceBonus, tierRangeLabel } from "@/lib/voiceTiers";
import { getCumulativeXpByLevel, getLevelByXp } from "@/lib/leveling";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { buildEnhanceView, chatRange, voiceBonus, enhanceCost } from "@/lib/enhance";
// 빙옥 가격 = XP 가격 ÷ 1,000 올림 — 서버와 같은 식 (lib/pointRate)
import { xpToPoint } from "@/lib/pointRate";
import TierEmblem from "../components/TierEmblem";
import SystemGuide from "./SystemGuide";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
// 팝업 틀 · 인벤토리 팝업 · 효과음은 내 정보 · ARCTIC 도 같이 쓴다 (app/components/PopShell · Inventory, lib/sfx)
import { PopShell, PopTab, AdminReset } from "../components/PopShell";
import { BagOverlay, buildInvGroups, mergeMyItems } from "../components/Inventory";
import { playTone } from "@/lib/sfx";

const DISCORD_URL = "https://discord.gg/V2uW2nUczU";

const ICE = "#3f83b8"; // ARCTIC 동선 전용 아이스 틴트

// 📌 메인 탭 — ARCTIC 은 제 주소 /arctic 에 산다(3차). 탭 줄에서는 링크로만 서고,
//    옛 ?tab= 주소로 들어오면 아래 effect 가 /arctic 으로 보낸다.
// 순서는 "내 것 → 시즌 → 정보" — 자주 보는 것이 앞, 한 번 읽고 마는 안내는 맨 뒤.
// 📌 XP 테이블 · 시뮬레이터는 탭이 아니라 대시보드 안의 카테고리다 (옛 ?tab=table · sim 은 그리로 보낸다)
const MAIN_TABS = [
  { id: "my", name: "내 대시보드", short: "대시보드" },
  { id: "rank", name: "랭킹" },
  // 레벨에서 왔다는 표시를 달아 ARCTIC 이 돌아갈 길("LEVEL ›")을 보이게 한다 (app/arctic/fromLevel.ts)
  { id: "arctic", name: "ARCTIC", shopOnly: true, href: "/arctic?from=level" },
  { id: "intro", name: "시스템 안내", short: "안내" },
];

// 📌 랭킹 기준 — 누적 XP / 이번 달 획득 / 누적 음성 시간
const RANK_MODES = [
  { id: "all", label: "누적" },
  { id: "month", label: "이번 달" },
  { id: "voice", label: "음성 시간" },
];
const RANK_PAGE_SIZE = 20;

// 레벨 공식은 lib/leveling.js 단일 소스 (봇 지급 로직과 1:1)

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
// 📌 문서형 탭 섹션 헤더 — 대시보드 섹션과 같은 문법을 쓴다 (탭을 옮겨도 같은 화면으로 읽히게)
const SectionHeader = ({ title, desc, right }) => (
  <div className="mb-8">
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight break-keep">{title}</h3>
      </div>
      {right}
    </div>
    {desc && <p className="text-xs text-[#8a8a8a] mt-2.5 leading-relaxed break-keep">{desc}</p>}
  </div>
);

// 📌 카드 — 아이보리 배경 위에서 흐려지지 않도록 또렷한 헤어라인 + 얕은 그림자
const LuxCard = ({ children, className = "", glow = false }) => (
  <div
    className={`rounded-2xl bg-white border border-black/[0.09] ${
      glow ? "shadow-[0_24px_60px_-34px_rgba(0,0,0,0.45)]" : "shadow-[0_2px_10px_-6px_rgba(0,0,0,0.15)]"
    } ${className}`}
  >
    {children}
  </div>
);

// 📌 대시보드 공용 헬퍼 — 효과음(경매 페이지 playTone 패턴)·상대시간·KST 오늘 날짜
const sfxXp = () => { playTone(880, 0.1); setTimeout(() => playTone(1174.66, 0.14), 90); };
const sfxLevelUp = () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.05), i * 110)); };

const fmtRel = (s) => {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금 전";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
const kstTodayStr = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// XP 사유 서브팔레트 — 채팅 모노/음성 아이스/출석 레드 (그 외 유채색 금지)
const REASON_COLORS = { chat: "#a8adb8", voice: "#6fa8c4", attend: "#e91e3f", effect: "#c39220", "effect-levelup": "#c39220" };
const REASON_LABELS = { chat: "채팅", voice: "음성", attend: "출석", effect: "아이템 효과", "effect-levelup": "레벨업 효과" };

// 누적 음성 참여 시간 — 한 시간을 넘기면 시간 단위로, 그 전에는 분 단위로 읽는다
const fmtVoiceTime = (sec) => {
  const min = Math.floor((sec || 0) / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60).toLocaleString()}시간`;
};

// 음성 티어 경계·이름·색은 lib/voiceTiers.js 단일 소스 (봇 지급표와 1:1)

// 📌 XP 도구 공용 — 숫자 범위 가두기
const clampLv = (n) => Math.min(1000, Math.max(1, Math.round(Number(n) || 1)));

// 📌 XP 테이블 — 레벨 하나를 골라 크게 본다(필요 · 누적 XP · 등급 · 내 레벨에서 남은 양).
//    아래 표는 1,000 줄을 한 번에 늘어놓지 않고 등급으로 나눈다. 어디서 고르든 위 카드와 표가 같은 레벨을 가리킨다.
const XP_JUMPS = [100, 250, 500, 750, 1000];
const XpTableView = ({ myLevel = 0, myXp = null, onTone }) => {
  const mine = myLevel > 0;
  const [lv, setLv] = useState(mine ? myLevel : 1);
  const [tierTab, setTierTab] = useState(getTierIndex(mine ? myLevel : 1));
  const [draft, setDraft] = useState(""); // 숫자 칸을 고치는 중인 값
  const listRef = useRef(null);

  // 로그인 정보가 늦게 오면 한 번만 내 레벨로 맞춘다
  const seeded = useRef(mine);
  useEffect(() => {
    if (seeded.current || !mine) return;
    seeded.current = true;
    setLv(myLevel);
    setTierTab(getTierIndex(myLevel));
  }, [mine, myLevel]);

  const pick = (n, tone = true) => {
    const v = clampLv(n);
    setLv(v);
    // "전체"(-1)를 보고 있으면 그대로 두고, 등급 탭이면 고른 레벨의 등급으로 옮긴다
    setTierTab((t) => (t === -1 ? -1 : getTierIndex(v)));
    setDraft("");
    if (tone) onTone?.();
  };

  // 고른 레벨의 줄이 표 가운데 오게 (페이지는 건드리지 않는다)
  useEffect(() => {
    const box = listRef.current;
    const row = box?.querySelector(`[data-lv="${lv}"]`);
    if (!box || !row) return;
    const a = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    box.scrollTop += a.top - b.top - (box.clientHeight - a.height) / 2;
  }, [lv, tierTab]);

  const cum = getCumulativeXpByLevel(lv);
  const req = lv <= 1 ? 0 : cum - getCumulativeXpByLevel(lv - 1);
  const tier = VOICE_TIERS[getTierIndex(lv)];
  const myCum = mine ? (myXp ?? getCumulativeXpByLevel(myLevel)) : 0;
  const left = mine ? cum - myCum : 0;

  // 표 — 고른 등급 구간만, "전체"(-1)면 1 – 1000 전부 (등급이 시작되는 줄에 등급 이름을 붙인다)
  const all = tierTab === -1;
  const tt = all ? null : VOICE_TIERS[tierTab];
  const tNext = all ? null : VOICE_TIERS[tierTab + 1];
  const tierStart = new Map(VOICE_TIERS.map((t) => [Math.max(1, t.min), t]));
  const rows = [];
  for (let l = all ? 1 : Math.max(1, tt.min); l <= (all ? 1000 : tNext ? tNext.min - 1 : 1000); l++) {
    const c = getCumulativeXpByLevel(l);
    rows.push({ l, c, r: l <= 1 ? 0 : c - getCumulativeXpByLevel(l - 1) });
  }
  const COLS = { gridTemplateColumns: "88px minmax(0,1fr) minmax(0,1fr)" };

  return (
    <div className="space-y-10">
      {/* 고른 레벨 — 등급 색 빛이 도는 잉크 카드 */}
      <div
        className="relative overflow-hidden rounded-3xl shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]"
        style={{ background: `radial-gradient(560px 320px at 88% 18%, ${hexA(tier.c, 0.28)} 0%, ${hexA(tier.c, 0)} 70%), linear-gradient(180deg, #1b1b1b 0%, #131313 60%)` }}
      >
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div className="relative z-10 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-7">
            <div>
              <p className="text-[10px] font-black tracking-[0.35em] text-white/40 uppercase">LEVEL</p>
              <div className="flex items-center gap-3 mt-3">
                <button type="button" onClick={() => pick(lv - 1)} aria-label="한 레벨 아래" className="w-9 h-9 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/45 transition-colors flex items-center justify-center outline-none focus:outline-none text-lg font-black">−</button>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="레벨"
                  value={draft !== "" ? draft : lv}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => draft !== "" && pick(draft)}
                  onKeyDown={(e) => e.key === "Enter" && draft !== "" && pick(draft)}
                  className="w-[3.4ch] bg-transparent text-center text-[52px] md:text-6xl font-black text-white tabular-nums tracking-[-0.04em] leading-none outline-none focus:outline-none border-b-2 border-transparent focus:border-[#e91e3f]"
                />
                <button type="button" onClick={() => pick(lv + 1)} aria-label="한 레벨 위" className="w-9 h-9 rounded-full border border-white/20 text-white/70 hover:text-white hover:border-white/45 transition-colors flex items-center justify-center outline-none focus:outline-none text-lg font-black">+</button>
              </div>
              <div className="flex items-center gap-2.5 mt-4">
                <TierEmblem tier={tier} size={24} />
                <span className="text-[16px] font-black leading-none" style={{ color: hexLift(tier.c, 0.3) }}>{tier.name}</span>
                <span className="text-[12px] font-bold text-white/40 tabular-nums">{tierRangeLabel(getTierIndex(lv))}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-5">
              <div>
                <p className="text-[11px] font-bold text-white/45">필요 XP</p>
                <p className="mt-2 text-[22px] font-black text-[#ff5c77] tabular-nums tracking-tight leading-none">{req.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-white/45">누적 XP</p>
                <p className="mt-2 text-[22px] font-black text-white tabular-nums tracking-tight leading-none">{cum.toLocaleString()}</p>
              </div>
              {mine && (
                <div className="col-span-2 md:col-span-1">
                  <p className="text-[11px] font-bold text-white/45">내 레벨({myLevel})에서</p>
                  <p className="mt-2 text-[22px] font-black text-white tabular-nums tracking-tight leading-none">
                    {left > 0 ? <>{left.toLocaleString()}<span className="text-[12px] text-white/40 ml-1">XP 남음</span></> : <span className="text-white/60">도달함</span>}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 빠르게 고르기 */}
          <input
            type="range"
            min="1"
            max="1000"
            value={lv}
            onChange={(e) => pick(e.target.value, false)}
            aria-label="레벨 고르기"
            className="w-full mt-8 accent-[#e91e3f] cursor-pointer"
          />
          <div className="flex flex-wrap gap-1.5 mt-4">
            {mine && (
              <button type="button" onClick={() => pick(myLevel)} className={`h-8 px-3.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${lv === myLevel ? "bg-white text-[#131313]" : "bg-white/[0.08] text-white/70 hover:text-white"}`}>
                내 레벨
              </button>
            )}
            {XP_JUMPS.map((n) => (
              <button key={n} type="button" onClick={() => pick(n)} className={`h-8 px-3.5 rounded-full text-[12px] font-bold tabular-nums transition-colors outline-none focus:outline-none ${lv === n ? "bg-white text-[#131313]" : "bg-white/[0.08] text-white/70 hover:text-white"}`}>
                Lv {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 레벨 표 — 등급으로 나눈다 */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">레벨 표</h3>
          <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{all ? "Lv.1 – 1000" : tierRangeLabel(tierTab)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => { setTierTab(-1); onTone?.(); }}
            className={`shrink-0 inline-flex items-center h-8 px-3.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
              all ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"
            }`}
          >
            전체
          </button>
          {VOICE_TIERS.map((t, i) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTierTab(i); onTone?.(); }}
              className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
                tierTab === i ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313]"
              }`}
            >
              <span aria-hidden className="w-2 h-2 rounded-full" style={{ background: t.c }}></span>
              {t.name}
            </button>
          ))}
        </div>
        <div className="rounded-2xl border border-[#ededed] overflow-hidden">
          <div className="grid px-5 h-10 items-center bg-[#fafafa] border-b border-[#ededed] text-[11px] font-bold text-[#8a8a8a]" style={COLS}>
            <span>레벨</span>
            <span className="text-right">필요 XP</span>
            <span className="text-right">누적 XP</span>
          </div>
          <div ref={listRef} className="max-h-[440px] overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
            {rows.map((r) => {
              const on = r.l === lv;
              const me = mine && r.l === myLevel;
              return (
                <button
                  key={r.l}
                  type="button"
                  data-lv={r.l}
                  onClick={() => pick(r.l, false)}
                  className={`w-full grid px-5 h-10 items-center text-left tabular-nums border-b border-[#f5f5f5] last:border-0 transition-colors outline-none focus:outline-none ${
                    on ? "bg-[#e91e3f]/[0.06]" : "hover:bg-black/[0.02]"
                  }`}
                  style={COLS}
                >
                  <span className={`text-[13px] font-black ${on ? "text-[#e91e3f]" : "text-[#131313]"}`}>
                    {r.l}
                    {all && tierStart.has(r.l) && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#5a5a5a] align-middle">
                        <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: tierStart.get(r.l).c }}></span>
                        {tierStart.get(r.l).name}
                      </span>
                    )}
                    {me && <span className="ml-2 inline-flex items-center h-4 px-1.5 rounded-full bg-[#131313] text-white text-[9px] font-black align-middle">나</span>}
                  </span>
                  <span className={`text-[13px] font-bold text-right ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{r.r.toLocaleString()}</span>
                  <span className={`text-[13px] font-bold text-right ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{r.c.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};

// 📌 시뮬레이터 부품 — 밝은 바탕용 스위치 · 단계 조절 · 칩 · 줄
const SimToggle = ({ on, onChange, disabled = false, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!on)}
    className={`relative w-11 h-6 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 disabled:opacity-40 disabled:cursor-default ${on && !disabled ? "bg-[#131313]" : "bg-[#e0e0e0]"}`}
  >
    <span className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${on && !disabled ? "translate-x-5" : ""}`}></span>
  </button>
);
const SimStepper = ({ value, min = 0, max = 10, onChange, label }) => (
  <div className="flex items-center gap-2 shrink-0" aria-label={label}>
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label} 낮추기`} className="w-8 h-8 rounded-full border border-[#a3a3a3] text-[#131313] font-black flex items-center justify-center transition-colors hover:border-[#131313] disabled:opacity-30 outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">−</button>
    <span className="w-8 text-center text-[15px] font-black text-[#131313] tabular-nums">+{value}</span>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label} 올리기`} className="w-8 h-8 rounded-full border border-[#a3a3a3] text-[#131313] font-black flex items-center justify-center transition-colors hover:border-[#131313] disabled:opacity-30 outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">+</button>
  </div>
);
// 칩 한 줄 — 슬라이더 대신 자주 쓰는 값을 바로 고른다 (미선택 칩 테두리 #a3a3a3).
//    칸을 똑같이 나눠 모바일에서도 두 줄로 넘어가지 않게 한다 (임의 grid 클래스는 v4 에서 안 먹어 인라인)
const SimChips = ({ value, options, onChange, label }) => (
  <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((o) => {
      const on = value === o.v;
      return (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(o.v)}
          className={`h-8 px-1 rounded-full border text-[12px] font-bold tabular-nums whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${
            on ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:text-[#131313] hover:border-[#131313]"
          }`}
        >
          {o.l}
        </button>
      );
    })}
  </div>
);
// stack: 칩처럼 폭이 필요한 조작은 이름 아래 한 줄로
const SimRow = ({ label, sub, children, stack = false }) => (
  <div className="py-4">
    <div className={stack ? "" : "flex items-center justify-between gap-4"}>
      <div className="min-w-0">
        <p className="text-[14px] font-black text-[#131313]">{label}</p>
        {sub && <p className="text-[11px] font-bold text-[#5a5a5a] mt-1 tabular-nums break-keep">{sub}</p>}
      </div>
      {stack ? <div className="mt-3">{children}</div> : children}
    </div>
  </div>
);
const SimGroup = ({ title }) => <p className="pt-5 first:pt-4 text-[12px] font-black text-[#5a5a5a]">{title}</p>;
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);

// 📌 XP 시뮬레이터 — 봇 지급식(bot/src/features/chatXp.js · voiceXp.js · commands.js 출석)을 그대로 굴린다.
//    · 채팅: 인정 횟수 × (강화 구간 평균 + 역할·부스트). 쿨타임이 지나서 보낸 메시지만 인정되므로 "시간"이 아니라 "횟수".
//    · 음성: 지급 주기마다 1회, 1회 = floor((기본 + 그 순간 레벨의 등급 보너스 + 강화 + 역할·부스트) × 음소거 배율).
//      봇은 매 지급마다 저장된 레벨을 다시 읽으므로 하루 안에서도 등급이 바뀌는 순간부터 보너스가 커진다 — 여기도 지급마다 센다.
//    · 출석: 하루 1회, 출석 XP + 역할 출석 버프.
//    · 강화: 지금 단계보다 올린 만큼의 비용은 XP 로 낸다고 보고 시작 XP 에서 뺀다.
//    화면은 "하루 활동 프리셋 → 하루 XP · 30일 뒤 → 다음 등급까지 며칠(타임라인) → 목표 레벨" 순.
//    강화 · 추가 XP · 음소거 · 시작 레벨은 세부 조건으로 접어 둔다.
const SIM_CHAT = [0, 30, 60, 120, 240].map((v) => ({ v, l: v ? `${v}회` : "0" }));
const SIM_VOICE = [0, 60, 120, 240, 480].map((v) => ({ v, l: v ? fmtMin(v) : "0" }));
const SIM_PRESETS = [
  { k: "light", l: "가볍게", chat: 20, voice: 60 },
  { k: "normal", l: "보통", chat: 60, voice: 120 },
  { k: "hard", l: "열심히", chat: 150, voice: 300 },
  { k: "custom", l: "직접" },
];
const SIM_HORIZON = 3650; // 10년 — 그 안에 못 닿으면 "10년+"
const XpSimulator = ({ me, P, ready, onTone }) => {
  const [preset, setPreset] = useState("normal");
  const [chatC, setChatC] = useState(60);    // "직접" 일 때만 쓰는 값
  const [voiceC, setVoiceC] = useState(120);
  const [attend, setAttend] = useState(true);
  const [open, setOpen] = useState(false);   // 세부 조건
  const [start, setStart] = useState("");     // 비우면 내 레벨
  const [muted, setMuted] = useState(false);
  const [chatEnh, setChatEnh] = useState(0);
  const [voiceEnh, setVoiceEnh] = useState(0);
  const [extra, setExtra] = useState(0);
  const [goal, setGoal] = useState("");

  // 로그인하면 내 강화 단계 · 추가 XP(역할 · 부스트)를 한 번 채운다
  const mySeed = () => {
    setChatEnh(me?.chatEnhance || 0);
    setVoiceEnh(me?.voiceEnhance || 0);
    setExtra(Math.max(0, (Number(me?.buffXp) || 0) + (Number(me?.boostXp) || 0)));
  };
  const seeded = useRef(false);
  useEffect(() => {
    if (!me || seeded.current) return;
    seeded.current = true;
    mySeed();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps
  // 시뮬레이터를 연 채로 강화하면 — 강화는 영구라 지금 단계 아래로는 둘 수 없다. 내 단계가 오르면 따라 올린다
  useEffect(() => {
    if (!me) return;
    setChatEnh((v) => Math.max(v, me.chatEnhance || 0));
    setVoiceEnh((v) => Math.max(v, me.voiceEnhance || 0));
  }, [me?.chatEnhance, me?.voiceEnhance]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => {
    setStart(""); setMuted(false); setGoal("");
    mySeed();
    onTone?.();
  };
  const pickTone = (fn) => (v) => { fn(v); onTone?.(); };

  const cur = SIM_PRESETS.find((p) => p.k === preset) || SIM_PRESETS[1];
  const chatN = preset === "custom" ? chatC : cur.chat;
  const voiceMin = preset === "custom" ? voiceC : cur.voice;
  const attendOn = preset === "custom" ? attend : true;

  // ── 강화 비용 — 지금 단계보다 올린 칸만 (XP 로 낸다고 본다) ──
  const costOf = (base, growth, from, to) => {
    let s = 0;
    for (let k = from + 1; k <= to; k++) s += enhanceCost(base, growth, k);
    return s;
  };
  const chatCost = costOf(P.chatEnhanceBaseCost, P.chatEnhanceCostGrowthPct, me?.chatEnhance || 0, chatEnh);
  const voiceCost = costOf(P.voiceEnhanceBaseCost, P.voiceEnhanceCostGrowthPct, me?.voiceEnhance || 0, voiceEnh);

  // ── 시작점 ──
  const useMine = !start && !!me;
  const baseXp = useMine ? Math.max(0, me.xp || 0) : getCumulativeXpByLevel(clampLv(start || 1));
  const startXp = Math.max(0, baseXp - chatCost - voiceCost);
  const startLv = Math.max(1, Math.min(1000, getLevelByXp(startXp)));
  const startTi = getTierIndex(startLv);

  // ── 1회 지급량 ──
  const [cLo, cHi] = chatRange(P, chatEnh);
  // 보유 아이템 기본 효과 — 채팅 · 음성 따로 붙는 고정 가산(봇 basic-chat · basic-voice). 손으로 바꾸는 '추가 XP' 와는 따로 둔다
  const itemChat = Math.max(0, Number(me?.itemChatXp) || 0);
  const itemVoice = Math.max(0, Number(me?.itemVoiceXp) || 0);
  const chatPer = (cLo + cHi) / 2 + extra + itemChat; // 기댓값 — 구간 안 균등 랜덤
  const muteMult = !muted || P.muteMode === "off" ? 1 : P.muteMode === "block" ? 0 : Math.max(0, 1 - P.muteReducePct / 100);
  const vEnh = voiceBonus(P, voiceEnh);
  const voiceTickAt = (l) => Math.floor((P.voiceXp + getVoiceBonus(l) + vEnh + extra + itemVoice) * muteMult);
  const voiceN = Math.floor((voiceMin * 60) / Math.max(30, P.voiceIntervalSec));
  const attendXp = attendOn ? P.attendXp + Math.max(0, Number(me?.attendBuffXp) || 0) : 0;
  const goalLv = goal ? clampLv(goal) : 0;

  // 하루씩 굴리며 — 30일 뒤 레벨, 다음 등급(최대 셋)에 닿는 날, 목표 레벨에 닿는 날
  const sim = useMemo(() => {
    const chatDay = chatN * chatPer;
    let xp = startXp;
    let l = startLv;
    let ti = getTierIndex(l);
    const edgeOf = (i) => (i + 1 < VOICE_TIERS.length ? getCumulativeXpByLevel(VOICE_TIERS[i + 1].min) : Infinity);
    let edge = edgeOf(ti);
    let tick = voiceTickAt(l);
    // 다음 등급 문턱을 넘은 순간에만 레벨을 다시 잰다 (지급마다 레벨 계산을 돌리지 않게)
    const bump = () => {
      if (xp < edge) return;
      l = Math.min(1000, getLevelByXp(xp));
      ti = getTierIndex(l);
      edge = edgeOf(ti);
      tick = voiceTickAt(l);
    };
    const tiers = VOICE_TIERS.slice(startTi + 1, startTi + 4).map((t) => ({ t, day: null }));
    let goalDay = goalLv && goalLv <= startLv ? 0 : null;
    let lv30 = startLv;
    for (let d = 1; d <= SIM_HORIZON; d++) {
      xp += attendXp;
      bump();
      // 채팅은 음성 지급 사이사이에 고르게 흩어 넣는다 — 등급이 바뀌는 시점이 실제와 가깝게
      if (voiceN > 0) {
        const share = chatDay / voiceN;
        for (let i = 0; i < voiceN; i++) {
          xp += share + tick;
          bump();
        }
      } else {
        xp += chatDay;
        bump();
      }
      const lvNow = Math.min(1000, getLevelByXp(xp));
      if (d === 30) lv30 = lvNow;
      for (const x of tiers) if (x.day === null && lvNow >= x.t.min) x.day = d;
      if (goalLv && goalDay === null && lvNow >= goalLv) goalDay = d;
      const pending = tiers.some((x) => x.day === null) || (goalLv && goalDay === null);
      if (d >= 30 && (!pending || lvNow >= 1000)) break;
    }
    return { lv30, tiers, goalDay };
  }, [startXp, startLv, startTi, goalLv, chatN, chatPer, voiceN, vEnh, extra, itemVoice, muteMult, attendXp, P.voiceXp]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return <div className="py-24 text-center text-sm text-[#8a8a8a]">설정값을 불러오는 중...</div>;
  }

  const won = (n) => n.toLocaleString();
  const perDay = Math.round(chatN * chatPer) + voiceN * voiceTickAt(startLv) + attendXp;
  const gained30 = sim.lv30 - startLv;
  const dayLabel = (d) => (d === null ? "10년+" : d === 0 ? "도달" : `D+${won(d)}`);
  const activity = [chatN ? `채팅 ${won(chatN)}회` : null, voiceMin ? `음성 ${fmtMin(voiceMin)}` : null, attendOn ? "출석" : null].filter(Boolean).join(" · ") || "활동 없음";
  const nodes = [{ t: VOICE_TIERS[startTi], label: "지금" }, ...sim.tiers.map((x) => ({ t: x.t, label: dayLabel(x.day) }))];
  const inputCls = "w-20 h-9 px-3 rounded-full border border-[#a3a3a3] text-center text-[16px] font-black text-[#131313] tabular-nums outline-none focus:border-[#131313] placeholder:text-[#a3a3a3]";

  return (
    // 글자색을 직접 둔다 — 레벨 페이지 안에서는 흐린 색을 물려받는다
    <div className="rounded-2xl border border-[#ededed] bg-white overflow-hidden text-[#131313]">
      {/* ① 하루 활동 — 프리셋 */}
      <div className="px-5 md:px-7 pt-5 md:pt-6 pb-5">
        <SimChips value={preset} options={SIM_PRESETS.map((p) => ({ v: p.k, l: p.l }))} onChange={pickTone(setPreset)} label="하루 활동" />
        {preset === "custom" ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-[12px] font-bold text-[#5a5a5a] mb-2">채팅 <span className="tabular-nums">· 1회 {won(cLo + extra + itemChat)}~{won(cHi + extra + itemChat)} XP</span></p>
              <SimChips value={chatC} options={SIM_CHAT} onChange={pickTone(setChatC)} label="하루 채팅 인정 횟수" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-[#5a5a5a] mb-2">음성 <span className="tabular-nums">· 1회 {won(voiceTickAt(startLv))} XP</span></p>
              <SimChips value={voiceC} options={SIM_VOICE} onChange={pickTone(setVoiceC)} label="하루 음성 시간" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-bold text-[#5a5a5a]">출석 <span className="tabular-nums">· +{won(P.attendXp + Math.max(0, Number(me?.attendBuffXp) || 0))} XP</span></p>
              <SimToggle on={attend} onChange={pickTone(setAttend)} label="매일 출석" />
            </div>
          </div>
        ) : (
          <p className="mt-3 text-[13px] font-bold text-[#5a5a5a] tabular-nums">{activity}</p>
        )}
      </div>

      {/* ② 하루 XP · 30일 뒤 */}
      {/* 모바일은 위아래로 — 7자리 숫자 · "Lv 1000 +N" 이 반 칸에서 잘리지 않게 */}
      <div className="px-5 md:px-7 py-5 border-t border-[#ededed] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#5a5a5a]">하루</p>
          <p className="mt-1.5 text-[28px] md:text-[34px] font-black tracking-[-0.03em] leading-none tabular-nums truncate">{won(perDay)}<span className="ml-1 text-[12px] font-bold text-[#8a8a8a]">XP</span></p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-[#5a5a5a]">30일 뒤</p>
          <p className="mt-1.5 text-[28px] md:text-[34px] font-black tracking-[-0.03em] leading-none tabular-nums truncate">
            Lv {sim.lv30}
            {gained30 > 0 && <span className="ml-2 text-[13px] font-black text-[#d01634] tracking-normal">+{won(gained30)}</span>}
          </p>
        </div>
      </div>

      {/* ③ 등급 타임라인 — 지금 등급에서 다음 셋까지 며칠 */}
      <div className="px-5 md:px-7 py-6 border-t border-[#ededed]">
        {nodes.length > 1 ? (
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${nodes.length}, minmax(0, 1fr))` }}>
            {/* 잇는 선 — 첫 엠블럼 가운데에서 마지막 엠블럼 가운데까지 */}
            <span aria-hidden className="absolute left-[11px] top-[11px] h-px bg-[#d4d4d4]" style={{ right: `calc(${100 / nodes.length}% - 11px)` }} />
            {nodes.map((n, i) => (
              <div key={n.t.key} className="relative min-w-0">
                <span className="relative inline-flex bg-white"><TierEmblem tier={n.t} size={22} muted={i > 0 && n.label === "10년+"} /></span>
                <p className="mt-2 text-[12px] sm:text-[13px] font-extrabold leading-tight break-keep">{n.t.name}</p>
                <p className={`mt-0.5 text-[12px] font-black tabular-nums ${i === 0 ? "text-[#8a8a8a]" : n.label === "10년+" ? "text-[#a3a3a3]" : "text-[#d01634]"}`}>{n.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] font-bold text-[#5a5a5a]">최고 등급입니다</p>
        )}
      </div>

      {/* ④ 목표 레벨 */}
      <div className="px-5 md:px-7 py-4 border-t border-[#ededed] flex items-center justify-between gap-4">
        <label className="flex items-center gap-3">
          <span className="text-[13px] font-extrabold">목표 레벨</span>
          <input type="number" inputMode="numeric" aria-label="목표 레벨" value={goal} placeholder={String(Math.min(1000, startLv + 50))}
            onChange={(e) => setGoal(e.target.value === "" ? "" : String(clampLv(e.target.value)))} className={inputCls} />
        </label>
        <p className="text-[18px] font-black tabular-nums">
          {!goalLv ? <span className="text-[#a3a3a3]">—</span> : sim.goalDay === 0 ? "도달" : sim.goalDay === null ? "10년+" : `약 ${won(sim.goalDay)}일`}
        </p>
      </div>

      {/* ⑤ 세부 조건 — 접어 둔다 */}
      <div className="border-t border-[#ededed]">
        <button type="button" onClick={() => { setOpen(!open); onTone?.(); }} aria-expanded={open}
          className="w-full px-5 md:px-7 h-12 flex items-center justify-between text-[13px] font-extrabold text-[#5a5a5a] hover:text-[#131313] outline-none focus-visible:bg-[#f2f2f2]">
          세부 조건
          <svg aria-hidden viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {open && (
          <div className="px-5 md:px-7 pb-3 md:grid md:grid-cols-2 md:gap-x-10">
            <SimRow label="시작 레벨" sub={useMine ? `내 레벨 · ${won(me.xp || 0)} XP` : `${won(baseXp)} XP`}>
              <div className="flex items-center gap-2 shrink-0">
                {me && !useMine && (
                  <button type="button" onClick={() => setStart("")} className="h-8 px-3 rounded-full border border-[#a3a3a3] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] hover:border-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">내 레벨</button>
                )}
                <input type="number" inputMode="numeric" aria-label="시작 레벨" placeholder={String(me?.level || 1)} value={start}
                  onChange={(e) => setStart(e.target.value === "" ? "" : String(clampLv(e.target.value)))} className={inputCls} />
              </div>
            </SimRow>
            <SimRow label="추가 XP" sub="역할 · 부스트">
              <input type="number" inputMode="numeric" aria-label="추가 XP" value={extra}
                onChange={(e) => setExtra(Math.max(0, Math.min(99999, parseInt(e.target.value, 10) || 0)))} className={`${inputCls} w-24`} />
            </SimRow>
            <SimRow label="채팅 강화" sub={`1회 ${won(cLo)}~${won(cHi)} XP${chatCost > 0 ? ` · 비용 −${won(chatCost)} XP` : ""}`}>
              <SimStepper value={chatEnh} max={P.chatEnhanceMax} onChange={pickTone(setChatEnh)} label="채팅 강화" />
            </SimRow>
            <SimRow label="음성 강화" sub={`1회 +${won(vEnh)} XP${voiceCost > 0 ? ` · 비용 −${won(voiceCost)} XP` : ""}`}>
              <SimStepper value={voiceEnh} max={P.voiceEnhanceMax} onChange={pickTone(setVoiceEnh)} label="음성 강화" />
            </SimRow>
            {P.muteMode !== "off" && (
              <SimRow label="음소거로 참여" sub={P.muteMode === "block" ? "음성 XP 없음" : `음성 XP −${P.muteReducePct}%`}>
                <SimToggle on={muted} onChange={pickTone(setMuted)} label="음소거로 참여" />
              </SimRow>
            )}
            <div className="py-4 md:col-span-2">
              <button type="button" onClick={reset} className="w-full h-10 rounded-full border border-[#a3a3a3] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                {me ? "내 조건으로 되돌리기" : "처음으로"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 📌 등급 안내 모달 — 잉크 패널 위에 등급 사다리를 세운다.
//    현재 등급은 좌측 레일과 은은한 글로우로 표시하고, 나머지는 조용히 둔다.
// 📌 등급 색 → 반투명(카드의 등급 빛) / 흰색 쪽으로 밝히기(등급 이름 그라데이션)
const hexA = (hex, a) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};
const hexLift = (hex, t) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  const f = (h) => Math.round(parseInt(h, 16) + (255 - parseInt(h, 16)) * t).toString(16).padStart(2, "0");
  return `#${f(m[1])}${f(m[2])}${f(m[3])}`;
};

// 📌 강화 창 — 카드의 "강화" 로 연다. 틀은 PopShell, 바탕은 불씨(다홍 · 주황).
//    머리: 보유 XP · 빙옥 배지. 왼쪽: +N 링 메달(단계가 오르면 번쩍) · 지금 1회 획득 → 강화 후.
//    오른쪽: 다음 단계와 강화 버튼, 전 단계 레일(지난 단계는 채운 노드, 다음은 고리, 남은 건 빈 노드 · 1회 획득 · 비용).
//    비용은 서버와 같은 식(lib/enhance enhanceCost). 최대 단계가 0 인 쪽은 탭을 만들지 않는다.
const EMBER = "linear-gradient(135deg, #ff4d3a 0%, #ff9a3c 100%)";
const GOLD_TEXT = { background: "linear-gradient(110deg, #ffb040 20%, #fff3c4 45%, #ffb040 70%)", backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", animation: "shimmer 3s linear infinite" };
const sparksOf = (n, r0) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 + (i % 2) * 0.2;
  const r = r0 + (i % 3) * 12;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), delay: (i % 4) * 45, c: i % 3 === 0 ? "#fff1c2" : i % 2 ? "#ffb040" : "#ff7a4a" };
});
const SPARKS = sparksOf(12, 80);
const SPARKS_MAX = sparksOf(28, 96);
// 시즌 패스 해금 — 같은 불티를 보라 · 분홍 · 흰빛으로
const PASS_SPARKS = sparksOf(20, 110).map((p, i) => ({ ...p, c: ["#d9c6ff", "#ff9fd6", "#ffffff", "#b69cff"][i % 4] }));
const EnhanceModal = ({ open, onClose, enh, balance, busy, onEnhance, gain, voiceMin = 5, policy, onTone, onReset, resetBusy }) => {
  const kinds = ["chat", "voice"].filter((k) => enh[k].max > 0);
  const [pick, setPick] = useState("chat");
  const kind = kinds.includes(pick) ? pick : kinds[0];

  // 단계가 오르면 메달이 한 번 번쩍인다 (종류별로 따로 기억)
  const prevLv = useRef({ chat: enh.chat.level, voice: enh.voice.level });
  const [pop, setPop] = useState("");
  useEffect(() => {
    const up = ["chat", "voice"].find((k) => enh[k].level > prevLv.current[k]);
    prevLv.current = { chat: enh.chat.level, voice: enh.voice.level };
    if (!up) return;
    setPop(up);
    // 최종 단계에 닿으면 강화 성공음 뒤에 한 번 더 — 올라가는 팡파르
    if (enh[up].level >= enh[up].max) {
      [659.25, 783.99, 987.77, 1318.51].forEach((f, i) => setTimeout(() => playTone(f, 0.2, "triangle", 0.045), 420 + i * 120));
    }
    const t = setTimeout(() => setPop(""), 1100);
    return () => clearTimeout(t);
  }, [enh.chat.level, enh.voice.level]);

  if (!kind) return null;

  const v = enh[kind];
  const isChat = kind === "chat";
  const atMax = v.level >= v.max;
  const cost = v.nextCost || 0;
  // 📌 빙옥으로 낼 때는 XP 비용이 아니라 환산값(÷1,000 올림)과 비교한다
  const pointCost = xpToPoint(cost);
  const canXp = !atMax && !busy && (balance?.xp || 0) >= cost;
  const canPoint = !atMax && !busy && (balance?.point || 0) >= pointCost;
  const fmt = (n) => (n || 0).toLocaleString();
  const stepXp = isChat ? policy.chatEnhanceStep : policy.voiceEnhanceStep;
  // 지금 내 조건으로 1회에 받는 양 — add 만큼 더 강화했을 때
  const gainAt = (add) => (isChat ? `${fmt(gain.chatLo + add)}~${fmt(gain.chatHi + add)}` : fmt(gain.voice + add));
  const base = isChat ? policy.chatEnhanceBaseCost : policy.voiceEnhanceBaseCost;
  const growth = isChat ? policy.chatEnhanceCostGrowthPct : policy.voiceEnhanceCostGrowthPct;
  const steps = [];
  for (let n = 1; n <= v.max; n++) steps.push({ n, g: gainAt((n - v.level) * stepXp), c: enhanceCost(base, growth, n) });
  const COLS = { gridTemplateColumns: "20px 44px minmax(0,1fr) 88px" };

  return (
    <PopShell
      open={open}
      onClose={onClose}
      theme="enh"
      title="강화"
      icon="bolt"
      badge={
        <span
          className="min-w-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-black text-[#ffd2b8] tabular-nums truncate"
          style={{ background: "rgba(255,120,80,0.14)", boxShadow: "inset 0 0 0 1px rgba(255,140,90,0.3)" }}
        >
          <span className="truncate">보유 {fmt(balance?.xp)} XP</span>
          <span className="shrink-0 text-white/45">빙옥 {fmt(balance?.point)}</span>
        </span>
      }
      tabs={kinds.length > 1 ? kinds.map((k) => (
        <PopTab key={k} on={k === kind} onClick={() => { setPick(k); onTone?.(); }} label={k === "chat" ? "채팅" : "음성"} n={`+${enh[k].level}`} />
      )) : null}
      left={
        <>
          <div className="flex flex-col items-center text-center sm:pt-2">
            <div className="relative w-[136px] h-[136px]">
              {atMax && (
                <>
                  <span aria-hidden className="enh-anim absolute -inset-2 rounded-full blur-md" style={{ background: "conic-gradient(from 0deg, #ffe08a, #ff7a3c, #ff4d3a, #ffb040, #ffe08a)", animation: "auraSpin 6s linear infinite, auraPulse 2.4s ease-in-out infinite" }}></span>
                  <span aria-hidden className="absolute inset-[6px] rounded-full bg-[#1f0d0c]"></span>
                </>
              )}
              <div className="absolute inset-0">
                <GlowRing id="enhRing" from={atMax ? "#ffe08a" : "#ff4d3a"} to={atMax ? "#ff9a3c" : "#ffb040"} pct={(v.level / Math.max(1, v.max)) * 100} pop={pop === kind}>
                  <span
                    key={`${kind}-${v.level}`}
                    className="enh-anim text-[42px] font-black text-white tabular-nums tracking-[-0.03em] leading-none"
                    style={pop === kind ? { animation: "numPop .7s cubic-bezier(0.16,1,0.3,1)" } : undefined}
                  >
                    +{v.level}
                  </span>
                  {atMax
                    ? <span className="mt-1.5 text-[11px] font-black tracking-[0.2em]" style={GOLD_TEXT}>MAX</span>
                    : <span className="mt-1.5 text-[11px] font-bold text-white/40 tabular-nums">/ +{v.max}</span>}
                </GlowRing>
              </div>
              {pop === kind && (atMax ? SPARKS_MAX : SPARKS).map((p, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="enh-anim absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full pointer-events-none opacity-0"
                  style={{ background: p.c, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animation: `sparkFly .85s ${p.delay}ms cubic-bezier(0.16,1,0.3,1) forwards` }}
                ></span>
              ))}
            </div>
            <p className="mt-4 text-[13px] font-black text-white">{isChat ? "채팅 강화" : "음성 강화"}</p>
          </div>

          {/* 지금 → 강화 후 — 이 창에서 유일한 카드 */}
          <div
            className="mt-7 sm:mt-auto rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg, rgba(255,90,60,0.18), rgba(255,170,64,0.1))", boxShadow: "inset 0 0 0 1px rgba(255,140,90,0.28)" }}
          >
            <p className="text-[11px] font-bold text-white/50">{isChat ? "채팅 1회" : `음성 ${voiceMin}분`}</p>
            <p className="mt-2 text-[20px] font-black text-white tabular-nums tracking-tight leading-none">{gainAt(0)}<span className="text-[11px] text-white/40 ml-1">XP</span></p>
            {!atMax && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[12px] font-black text-[#ffb38a] tabular-nums">
                <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>
                {gainAt(stepXp)} XP
              </p>
            )}
          </div>
          {onReset && <AdminReset onReset={onReset} busy={resetBusy} label="관리자 · 강화 초기화" />}
        </>
      }
    >
      {/* 다음 단계 */}
      {atMax ? (
        <div className="py-2">
          <p className="text-[11px] font-bold text-white/45">최대 단계</p>
          <p key={`max-${kind}`} className="enh-anim mt-2 text-[32px] font-black tracking-tight leading-none" style={{ ...GOLD_TEXT, transformOrigin: "left center", ...(pop === kind ? { animation: "numPop .8s cubic-bezier(0.16,1,0.3,1), shimmer 3s linear infinite" } : {}) }}>+{v.max} MAX</p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold text-white/45">다음 단계</p>
              <p className="mt-2 text-[28px] font-black text-white tabular-nums tracking-tight leading-none">+{v.level + 1}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-white/45">{isChat ? "채팅 1회" : `음성 ${voiceMin}분`}</p>
              <p className="mt-2 text-[15px] font-black text-white tabular-nums leading-none">{gainAt(stepXp)} XP</p>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onEnhance(kind, "xp")}
              disabled={!canXp}
              className="flex-1 h-12 rounded-full text-white text-[14px] font-black tabular-nums transition-transform enabled:hover:-translate-y-px outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
              style={{ background: EMBER }}
            >
              강화 · {fmt(cost)} XP
            </button>
            <button
              type="button"
              onClick={() => onEnhance(kind, "point")}
              disabled={!canPoint}
              className="shrink-0 h-12 px-5 rounded-full bg-white/[0.07] border border-white/15 enabled:hover:bg-white/[0.13] text-white text-[13px] font-black transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
            >
              {fmt(pointCost)} 빙옥
            </button>
          </div>
        </>
      )}

      {/* 단계 레일 */}
      <div className="mt-7 grid items-center gap-x-3 px-2 -mx-2 pb-2" style={COLS}>
        <span></span>
        <span className="text-[11px] font-bold text-white/40">단계</span>
        <span className="text-[11px] font-bold text-white/40">1회 획득</span>
        <span className="text-[11px] font-bold text-white/40 text-right">비용</span>
      </div>
      <div className="relative">
        <span aria-hidden className="absolute left-[9.5px] top-5 bottom-5 w-px bg-white/12"></span>
        {steps.map((r) => {
          const done = r.n <= v.level;
          const next = r.n === v.level + 1;
          return (
            <div key={r.n} className={`relative grid items-center gap-x-3 h-10 px-2 -mx-2 rounded-xl tabular-nums ${next ? "bg-white/[0.07]" : ""}`} style={COLS}>
              <span className="relative z-10 flex justify-center">
                <span
                  className={`enh-anim w-3 h-3 rounded-full ${done ? "" : next ? "ring-2 ring-[#ff7a4a] bg-[#1f0d0c]" : "ring-1 ring-white/25 bg-[#1f0d0c]"}`}
                  style={done ? { background: EMBER, ...(pop === kind && r.n === v.level ? { animation: "nodeFill .7s cubic-bezier(0.16,1,0.3,1)" } : {}) } : undefined}
                ></span>
              </span>
              <span className={`text-[13px] font-black ${done ? "text-white/45" : next ? "text-white" : "text-white/40"}`}>+{r.n}</span>
              <span className={`text-[12px] font-bold ${done ? "text-white/35" : next ? "text-white" : "text-white/55"}`}>{r.g} XP</span>
              <span className={`text-[12px] font-black text-right ${done ? "text-white/30" : next ? "text-[#ffb38a]" : "text-white/40"}`}>{done ? "완료" : fmt(r.c)}</span>
            </div>
          );
        })}
      </div>
    </PopShell>
  );
};

// 📌 확인 창 — 브라우저 기본 confirm 대신. 팝업 틀과 같은 잉크 카드에 창마다의 색(시즌 패스 보라 · 강화 불씨 · 기본 빨강)
//    금액을 크게, 그 아래 바뀌는 값(잔액 · 레벨)을 줄로 보여 준다. Esc · 바깥 누르기는 취소, 확인 버튼에 처음 초점
const CONFIRM_TONE = {
  ink: { bg: "#131313", glow: "rgba(233,30,63,0.24)", btn: "#e91e3f" },
  pass: { bg: "linear-gradient(160deg, #2a1a4d 0%, #1a1233 55%, #120d22 100%)", glow: "rgba(155,107,255,0.42)", btn: "linear-gradient(135deg, #9b6bff 0%, #e05bb5 100%)" },
  enh: { bg: "linear-gradient(160deg, #3a1411 0%, #1f0d0c 55%, #140a0a 100%)", glow: "rgba(255,84,54,0.38)", btn: "linear-gradient(135deg, #ff4d3a 0%, #ff9a3c 100%)" },
};
const ConfirmDialog = ({ state, onDone }) => {
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => e.key === "Escape" && onDone(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onDone]);

  if (!state) return null;
  const t = CONFIRM_TONE[state.tone] || CONFIRM_TONE.ink;
  return (
    <div
      className="fixed inset-0 z-[140] flex items-center justify-center p-5"
      style={{ background: "rgba(10,10,10,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      onClick={() => onDone(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[380px] overflow-hidden rounded-3xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.75)]"
        style={{ background: t.bg, animation: "tierIn .28s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div aria-hidden className="absolute -top-24 -right-16 w-64 h-64 blur-[90px] rounded-full pointer-events-none" style={{ background: t.glow }}></div>
        <div className="relative z-10 p-6 sm:p-7">
          <span aria-hidden className="w-11 h-11 rounded-full bg-white/[0.08] ring-1 ring-white/15 flex items-center justify-center text-white/80">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={ICON_PATHS[state.icon] || ICON_PATHS.check} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h4 className="mt-4 text-[18px] font-black text-white tracking-tight break-keep">{state.title}</h4>
          {state.amount != null && (
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[30px] font-black text-white tabular-nums tracking-tight leading-none">{state.amount}</span>
              <span className="text-[13px] font-black text-white/45">{state.unit}</span>
            </p>
          )}
          {state.rows?.length > 0 && (
            <div className="mt-4 space-y-2">
              {state.rows.map((r) => (
                <div key={r.l} className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-white/45">{r.l}</span>
                  <span className={`text-[12px] font-black tabular-nums ${r.warn ? "text-[#ffb38a]" : "text-white/85"}`}>{r.v}</span>
                </div>
              ))}
            </div>
          )}
          {state.body && <p className="mt-4 text-[11px] font-bold text-white/45 leading-relaxed break-keep">{state.body}</p>}
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onDone(false)}
              className="h-11 rounded-full bg-white/[0.07] border border-white/15 hover:bg-white/[0.12] text-white/80 text-[13px] font-black transition-colors outline-none focus:outline-none"
            >
              취소
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => onDone(true)}
              className="h-11 rounded-full text-white text-[13px] font-black transition-transform hover:-translate-y-px outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              style={{ background: t.btn }}
            >
              {state.ok || "확인"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 📌 시즌 패스 창 — 카드의 "시즌 패스" 로 연다. 틀은 PopShell, 바탕은 보라 · 별빛.
//    왼쪽: 티어 메달(다음 티어까지 채워지는 보라→분홍 링) · 남은 XP · 프리미엄 카드(잠겨 있으면 해금 버튼)
//    오른쪽: 티어 레일 — 노드 · 무료 보상 칩 · 프리미엄 보상 칩(보라 · 분홍 결) · 필요 XP. 열면 다음 티어로 스크롤
//    수령 · 해금 판정은 서버가 다시 한다 — 여기서는 서버가 준 상태만 그린다.
const PASS_KIND_ICON = { xp: "bolt", point: "sparkles", role: "shieldCheck", item: "gift" };
const CROWN = "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z";
const GlowRing = ({ id, from, to, pct = 0, pop = false, children }) => {
  const R = 54;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative w-[136px] h-[136px] shrink-0" style={pop ? { animation: "ringPop .7s cubic-bezier(0.16,1,0.3,1)" } : undefined}>
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
        {pct > 0 && (
          <circle
            cx="60" cy="60" r={R} fill="none" stroke={`url(#${id})`} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, pct) / 100)}
            style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.16,1,0.3,1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
};
const PassReward = ({ r, premium = false, locked = false, busy = false, onClaim }) => {
  if (!r || !r.kind || r.kind === "none") return <span className="text-[12px] font-bold text-white/20 pl-1">—</span>;
  const icon = (
    <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d={ICON_PATHS[PASS_KIND_ICON[r.kind] || "gift"]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const chip = "min-w-0 max-w-full inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full text-[12px] font-bold";
  if (r.claimable) {
    return (
      <button
        type="button"
        onClick={onClaim}
        disabled={busy}
        className={`${chip} text-white transition-transform hover:-translate-y-px outline-none focus:outline-none disabled:opacity-60`}
        style={{ background: "linear-gradient(135deg, #9b6bff 0%, #e05bb5 100%)" }}
      >
        {icon}
        <span className="truncate">{r.label}</span>
        <span className="shrink-0 ml-0.5 text-[10px] font-black">{busy ? "…" : "받기"}</span>
      </button>
    );
  }
  return (
    <span
      className={`${chip} ${premium ? "text-[#efe6ff]" : "text-white/80"} ${r.claimed || locked ? "opacity-45" : ""}`}
      style={premium
        ? { background: "linear-gradient(135deg, rgba(182,156,255,0.22), rgba(255,122,198,0.14))", boxShadow: "inset 0 0 0 1px rgba(214,180,255,0.35)" }
        : { background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)" }}
    >
      {icon}
      <span className="truncate">{r.label}</span>
      {r.claimed ? (
        <svg aria-label="수령 완료" viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg>
      ) : locked ? (
        <svg aria-label="잠김" viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
      ) : null}
    </span>
  );
};
const PassModal = ({ open, onClose, pass, tiers = [], tierNo = 0, maxTier = 0, claimable = 0, busyKey = "", onClaim, onUnlock, balance, dday, onTone, onReset, resetBusy }) => {
  const [tab, setTab] = useState("all");
  const listRef = useRef(null);
  const nextIdx = (pass?.tierIndex ?? -1) + 1;

  // 열 때 · 탭을 바꿀 때 — 다음 티어 줄이 목록 가운데 오게.
  //    PC 에서 목록 칸이 따로 스크롤될 때만 — 모바일은 창 전체가 한 번에 스크롤돼 위의 티어 메달이 밀려난다
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const row = listRef.current?.querySelector('[data-next="1"]');
      const box = row?.closest("[data-pop-list]");
      if (!row || !box || !/auto|scroll/.test(getComputedStyle(box).overflowY) || box.scrollHeight <= box.clientHeight + 1) return;
      const a = row.getBoundingClientRect(), b = box.getBoundingClientRect();
      box.scrollTop += a.top - b.top - (box.clientHeight - a.height) / 2;
    });
    return () => cancelAnimationFrame(id);
  }, [open, tab, nextIdx]);

  // 프리미엄이 막 열리면 — 카드가 번쩍이며 부풀었다 돌아오고, 왕관이 튀고, 불티가 퍼진다
  const prevUnlocked = useRef(!!pass?.unlocked);
  const [unlockPop, setUnlockPop] = useState(false);
  useEffect(() => {
    const now = !!pass?.unlocked;
    const opened = now && !prevUnlocked.current;
    prevUnlocked.current = now;
    if (!opened) return;
    setUnlockPop(true);
    const t = setTimeout(() => setUnlockPop(false), 1300);
    return () => clearTimeout(t);
  }, [pass?.unlocked]);

  if (!pass) return null;
  const fmt = (n) => (n || 0).toLocaleString();
  const rows = tab === "claim" ? tiers.filter((t) => t.free?.claimable || t.paid?.claimable) : tiers;
  const price = pass.unlockPrice || 0;
  const pointPrice = xpToPoint(price); // 빙옥으로 해금할 때 (÷1,000 올림)
  // 링 — 지금 티어에서 다음 티어까지 얼마나 찼나
  const prevNeed = pass.tierIndex >= 0 ? tiers[pass.tierIndex]?.need || 0 : 0;
  const nextTier = tiers[nextIdx];
  const ringPct = nextTier ? Math.max(0, Math.min(100, ((pass.progress || 0) - prevNeed) / Math.max(1, nextTier.need - prevNeed) * 100)) : 100;
  const COLS = { gridTemplateColumns: "20px 34px minmax(0,1fr) minmax(0,1fr) 60px" };
  const seasonLabel = `시즌 ${pass.season?.number ?? SEASON.number} · ${pass.season?.name ?? SEASON.name}`;

  return (
    <PopShell
      open={open}
      onClose={onClose}
      theme="pass"
      title="시즌 패스"
      icon="star"
      badge={
        <span
          className="min-w-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-black text-[#e4d4ff] tabular-nums truncate"
          style={{ background: "rgba(182,156,255,0.14)", boxShadow: "inset 0 0 0 1px rgba(182,156,255,0.3)" }}
        >
          <span className="truncate">{seasonLabel}</span>
          <span className="shrink-0 text-white/45">{dday?.ended ? "종료" : `D-${Math.max(0, dday?.days ?? 0)}`}</span>
        </span>
      }
      tabs={
        <>
          <PopTab on={tab === "all"} onClick={() => { setTab("all"); onTone?.(); }} label="전체 티어" n={tiers.length} />
          <PopTab on={tab === "claim"} onClick={() => { setTab("claim"); onTone?.(); }} label="받을 보상" n={claimable} />
        </>
      }
      left={
        <>
          <div className="flex flex-col items-center text-center sm:pt-2">
            <GlowRing id="passRing" from="#b69cff" to="#ff7ac6" pct={ringPct}>
              <span className="text-[40px] font-black text-white tabular-nums tracking-[-0.03em] leading-none">T{tierNo}</span>
              <span className="mt-1.5 text-[11px] font-bold text-white/40 tabular-nums">/ T{maxTier}</span>
            </GlowRing>
            <p className="mt-4 text-[12px] font-bold text-white/55 tabular-nums">
              {pass.nextNeed > 0 ? <>T{tierNo + 1} 까지 <b className="text-white">{fmt(pass.nextNeed)} XP</b></> : "모든 티어 달성"}
            </p>
            <p className="mt-1.5 text-[11px] font-bold text-white/35 tabular-nums">이번 시즌 {fmt(pass.progress)} XP</p>
          </div>

          {/* 프리미엄 — 이 창에서 유일한 카드 */}
          <div
            className="enh-anim relative mt-7 sm:mt-auto rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(182,156,255,0.2), rgba(255,122,198,0.12))",
              boxShadow: "inset 0 0 0 1px rgba(214,180,255,0.3)",
              ...(unlockPop ? { animation: "passUnlock .9s cubic-bezier(0.16,1,0.3,1)" } : {}),
            }}
          >
            {unlockPop && PASS_SPARKS.map((p, i) => (
              <span
                key={i}
                aria-hidden
                className="enh-anim absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full pointer-events-none opacity-0"
                style={{ background: p.c, "--dx": `${p.dx}px`, "--dy": `${p.dy}px`, animation: `sparkFly .9s ${p.delay}ms cubic-bezier(0.16,1,0.3,1) forwards` }}
              ></span>
            ))}
            <div className="flex items-center gap-2">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="enh-anim w-4 h-4 shrink-0 text-[#e4d4ff]"
                fill="currentColor"
                style={unlockPop ? { animation: "numPop .8s cubic-bezier(0.16,1,0.3,1)" } : undefined}
              >
                <path d={CROWN} />
              </svg>
              {/* 📌 잠겨 있으면 "프리미엄 해금" 제목 + 단추에 값(500,000 XP · 500 빙옥)을 바로 적는다 — 머리 · 단추에 가격이 두 번 나오지 않게(사용자 요청) */}
              <span className="text-[13px] font-black text-white">{pass.unlocked ? "프리미엄" : "프리미엄 해금"}</span>
              {pass.unlocked && (
                <span
                  className="ml-auto text-[12px] font-black"
                  style={{ background: "linear-gradient(90deg, #d9c6ff, #ff9fd6)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  해금됨
                </span>
              )}
            </div>
            {!pass.unlocked && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => onUnlock("xp")}
                  disabled={!!busyKey || (balance?.xp || 0) < price}
                  className="w-full h-10 rounded-full text-white text-[12px] font-black tabular-nums transition-opacity outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                  style={{ background: "linear-gradient(135deg, #9b6bff 0%, #e05bb5 100%)" }}
                >
                  {fmt(price)} XP
                </button>
                <button
                  type="button"
                  onClick={() => onUnlock("point")}
                  disabled={!!busyKey || (balance?.point || 0) < pointPrice}
                  className="w-full h-10 rounded-full bg-white/[0.08] border border-white/15 enabled:hover:bg-white/[0.14] text-white text-[12px] font-black tabular-nums transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                >
                  {fmt(pointPrice)} 빙옥
                </button>
              </div>
            )}
          </div>
          {onReset && <AdminReset onReset={onReset} busy={resetBusy} label="관리자 · 시즌 패스 초기화" />}
        </>
      }
    >
      <div ref={listRef}>
        <div className="grid items-center gap-x-3 px-2 -mx-2 pb-3" style={COLS}>
          <span></span>
          <span></span>
          <span className="text-[11px] font-bold text-white/40">무료</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#d9c6ff]">
            <svg aria-hidden viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor"><path d={CROWN} /></svg>
            프리미엄
          </span>
          <span className="text-[11px] font-bold text-white/40 text-right">필요 XP</span>
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-[12px] font-bold text-white/35">지금 받을 보상이 없습니다</p>
        ) : (
          <div className="relative">
            {/* 티어 레일 — 노드를 잇는 세로선 */}
            {tab === "all" && <span aria-hidden className="absolute left-[9.5px] top-7 bottom-7 w-px bg-white/12"></span>}
            {rows.map((t) => {
              const i = tiers.indexOf(t);
              const next = i === nextIdx;
              return (
                <div
                  key={t.tid || t.level}
                  data-next={next ? "1" : undefined}
                  className={`relative grid items-center gap-x-3 h-14 px-2 -mx-2 rounded-xl ${next ? "bg-white/[0.06]" : ""}`}
                  style={COLS}
                >
                  <span className="relative z-10 flex justify-center">
                    <span
                      className={`w-3 h-3 rounded-full ${t.reached ? "" : next ? "ring-2 ring-[#b69cff] bg-[#1a1233]" : "ring-1 ring-white/25 bg-[#1a1233]"}`}
                      style={t.reached ? { background: "linear-gradient(135deg, #b69cff, #ff7ac6)" } : undefined}
                    ></span>
                  </span>
                  <span className={`text-[13px] font-black tabular-nums ${t.reached || next ? "text-white" : "text-white/40"}`}>T{t.level}</span>
                  <PassReward r={t.free} busy={busyKey === `${t.tid}:free`} onClaim={() => onClaim(t.tid, "free")} />
                  <PassReward r={t.paid} premium locked={!pass.unlocked} busy={busyKey === `${t.tid}:paid`} onClaim={() => onClaim(t.tid, "paid")} />
                  <span className={`text-[11px] font-black tabular-nums text-right ${next ? "text-[#d9c6ff]" : "text-white/30"}`}>{fmt(t.need)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PopShell>
  );
};

// 📌 획득 XP 한 칸 — 지금 내 조건으로 1회에 받는 양(큰 숫자)과 그 내역(칩).
const GainLine = ({ label, value, parts, padClass = "" }) => (
  <div className={padClass}>
    <div className="flex items-baseline gap-2.5 min-w-0">
      <span className="text-[12px] font-bold text-white/40 shrink-0">{label}</span>
      <span className="text-[20px] font-black text-white tabular-nums truncate">
        {value}<span className="text-[11px] font-black text-white/40 ml-1">XP</span>
      </span>
    </div>
    <div className="flex flex-wrap gap-1.5 mt-2.5">
      {parts.map((p) => (
        <span key={p.l} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-[10px] font-bold text-white/55 tabular-nums">
          <span className="text-white/35">{p.l}</span>{p.v}
        </span>
      ))}
    </div>
  </div>
);

const TierModal = ({ open, onClose, level, baseXp, intervalMin = 5, enhanceBonus = 0 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // 뒤 화면 잠금은 전역 ScrollLock 이 맡는다 — 여기서 body 에 overflow:hidden 을 주면
    // body 가 스크롤 컨테이너가 돼 sticky(따라오는 프로필 카드)가 원래 자리로 튄다
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const curIdx = getTierIndex(level || 0);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[86vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#131313] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] flex flex-col"
        style={{ animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div
          aria-hidden
          className="absolute -top-24 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none"
          style={{ background: `${VOICE_TIERS[curIdx].c}30` }}
        ></div>

        {/* 헤더 */}
        <div className="relative z-10 shrink-0 px-6 sm:px-8 pt-7 pb-5 border-b border-white/[0.08]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">등급 안내</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 w-9 h-9 rounded-full border border-white/12 text-white/50 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center outline-none focus:outline-none"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
            </button>
          </div>
          <p className="text-[12px] text-white/45 leading-relaxed mt-3 break-keep">
            <b className="text-white/75">음성 채널에서 받는 XP에 아래 금액이 더해집니다.</b>
          </p>
        </div>

        {/* 등급 사다리 */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6 sm:px-8 py-5">
          {VOICE_TIERS.map((t, i) => {
            const cur = i === curIdx;
            const passed = i < curIdx;
            return (
              <div
                key={t.key}
                className={`relative flex items-center gap-4 py-3.5 border-b border-white/[0.06] last:border-0 transition-opacity ${passed ? "opacity-45" : ""}`}
              >
                {cur && (
                  <span
                    aria-hidden
                    className="absolute -left-6 sm:-left-8 top-0 bottom-0 w-[3px]"
                    style={{ backgroundColor: t.c }}
                  ></span>
                )}
                <span
                  aria-hidden
                  className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: cur ? `${t.c}22` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${cur ? t.c + "88" : "rgba(255,255,255,0.08)"}`,
                    boxShadow: cur ? `0 0 22px -6px ${t.c}` : "none",
                  }}
                >
                  <TierEmblem tier={t} size={24} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="text-[15px] font-black tracking-tight" style={{ color: t.c }}>{t.name}</span>
                    {cur && (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[9px] font-black tracking-[0.12em] uppercase text-white" style={{ backgroundColor: t.c }}>
                        현재
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] font-black tracking-[0.16em] text-white/35 uppercase tabular-nums mt-1">
                    {t.en} · {tierRangeLabel(i)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: t.bonus > 0 ? "#ffffff" : "rgba(255,255,255,0.3)" }}>
                    {t.bonus > 0 ? `+${t.bonus.toLocaleString()}` : "—"}
                  </p>
                  <p className="text-[10px] font-bold text-white/35 mt-1">추가 XP</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 푸터 */}
        <div className="relative z-10 shrink-0 px-6 sm:px-8 py-4 border-t border-white/[0.08] bg-white/[0.02]">
          {/* 내 음성 강화가 있으면 기본 칩 옆에 강화 칩 하나 — 등급은 그 위에 더해진다 */}
          {enhanceBonus > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white text-[12px] font-bold whitespace-nowrap">기본 {baseXp.toLocaleString()}</span>
              <span className="text-[#ff5c77] font-black text-sm">+</span>
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white text-[12px] font-bold whitespace-nowrap">강화 {enhanceBonus.toLocaleString()}</span>
              <span className="text-[#ff5c77] font-black text-sm">+</span>
              <span className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/60 text-[12px] font-bold whitespace-nowrap">등급</span>
            </div>
          )}
          <p className="text-[11px] text-white/35 leading-relaxed break-keep">
            음성 {intervalMin}분당 기본 {baseXp.toLocaleString()} XP 위에 더해지는 금액입니다 — 채팅 XP에는 적용되지 않습니다.
            역할·채널 부스트가 있으면 여기에 더 붙습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

// 📌 음성 티어 계단 — 표 대신 '티어가 오를수록 쌓이는 계단'으로 지급량을 보여준다
const TierStairs = ({ base = 3000, intervalMin = 5 }) => {
  const vals = VOICE_TIERS.map((t) => base + t.bonus);
  const min = Math.min(...vals) - 400;
  const max = Math.max(...vals);
  return (
    <div>
      <div className="flex items-end gap-1.5 md:gap-2 h-48 md:h-56">
        {VOICE_TIERS.map((t, i) => {
          const xp = base + t.bonus;
          const hRatio = (xp - min) / (max - min);
          const top = i === VOICE_TIERS.length - 1;
          return (
            <div key={t.key} className="group relative flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-[9px] md:text-[11px] font-black mb-1.5 tabular-nums text-[#8a8a8a] group-hover:text-[#131313] transition-colors">
                {(xp / 1000).toFixed(xp % 1000 ? 2 : 0).replace(/\.?0+$/, "")}k
              </span>
              <div
                className="w-full rounded-t-[5px] transition-all duration-300 group-hover:brightness-110"
                style={{
                  height: `${10 + hRatio * 86}%`,
                  backgroundColor: t.c,
                  opacity: top ? 1 : 0.85,
                  boxShadow: top ? `0 0 18px ${t.c}55` : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 md:gap-2 border-t border-black/10 pt-2.5 mt-0.5">
        {VOICE_TIERS.map((t) => (
          <div key={t.key} className="flex-1 text-center min-w-0">
            <p className="text-[9px] md:text-[11px] font-black truncate" style={{ color: t.c }}>{t.name}</p>
            <p className="text-[8px] md:text-[10px] font-bold text-[#a3a3a3] tabular-nums mt-0.5">{t.min}+</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#a3a3a3] mt-3.5 break-keep">
        음성 {intervalMin}분당 기본 지급량 위에 등급별로 더해지는 금액
      </p>
    </div>
  );
};

// 📌 시즌 설정은 lib/season.js 공용 상수 사용 (홈 티커와 단일 소스)

export default function LevelPage() {
  // 리뉴얼: 정적 안내 대신 '내 대시보드'가 첫 화면
  // 탭은 URL 이 기준 — 외부에서 /level?tab=pass 처럼 바로 들어올 수 있어야 한다.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab") || "";
  const activeMainTab = MAIN_TABS.some((t) => t.id === tabParam && !t.href) ? tabParam : "my";
  const setActiveMainTab = useCallback(
    (id) => {
      const q = new URLSearchParams(Array.from(searchParams.entries()));
      const cur = q.get("tab") || "my";
      // 📌 기본 탭도 ?tab=my 로 명시한다. 쿼리를 지워 /level 로 replace 하면 페이지를 새로 연 직후
      //    첫 내비게이션이 무시되어(다른 탭을 한 번 거친 뒤에야 동작) "내 대시보드가 안 들어가진다".
      q.set("tab", id);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      // 같은 탭을 다시 눌렀을 때는 소리를 내지 않는다
      if (cur !== id) playTone(740, 0.05, "sine", 0.028);
    },
    [searchParams, router, pathname]
  );
  // 📌 옛 주소(?tab=arctic) 는 ARCTIC 의 제 주소 /arctic 으로 보낸다 — 찜·검색 패널 쿼리는 들고 간다
  useEffect(() => {
    if (tabParam !== "arctic") return;
    const panel = searchParams.get("panel");
    router.replace(panel ? `/arctic?panel=${panel}` : "/arctic");
  }, [tabParam, searchParams, router]);
  const [invTab, setInvTab] = useState("all");
  const [bagOpen, setBagOpen] = useState(false);
  // /profile 의 인벤토리 줄에서 ?bag=1 로 들어오면 가방을 바로 연다
  const bagParam = searchParams.get("bag");
  useEffect(() => {
    if (bagParam !== "1") return;
    setBagOpen(true);
    // 열고 나면 주소에서 bag 을 지운다 — 남겨 두면 뒤로가기나 다시 들어올 때
    // 가방이 제멋대로 다시 열린다
    const u = new URL(window.location.href);
    u.searchParams.delete("bag");
    window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash);
  }, [bagParam]);
  const [rankMode, setRankMode] = useState("all");
  const [rankPage, setRankPage] = useState(0);
  const [rankRows, setRankRows] = useState([]);
  const [rankTotal, setRankTotal] = useState(0);
  const [rankLoading, setRankLoading] = useState(false);
  const { data: session, status: authStatus } = useSession();

  // 하이드레이션 불일치 방지 — 서버/클라이언트 첫 페인트는 항상 스켈레톤으로 통일하고,
  // 마운트 후에만 세션 상태에 따라 CTA/대시보드를 가른다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authReady = mounted && authStatus !== "loading";

  // ── 내 대시보드: 실시간 데이터 (30초 폴링 + 창 포커스 시 갱신) ──
  const [me, setMe] = useState(null);          // /api/xp/me
  const [myLogs, setMyLogs] = useState(null);  // /api/xp/my-logs
  const [meLoaded, setMeLoaded] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const prevXpRef = useRef(null);              // XP 증가·레벨업 감지용

  // 토스트 — XP 획득/레벨업/동기화 피드백
  const [toasts, setToasts] = useState([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((msg, accent = false) => {
    const id = ++toastIdRef.current;
    setToasts((p) => [...p.slice(-3), { id, msg, accent }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  // 퀘스트 — 30초 폴링에 함께 실려 진행도가 실시간으로 찬다
  const [quests, setQuests] = useState(null);
  const [questPeriod, setQuestPeriod] = useState("daily");
  const [tierOpen, setTierOpen] = useState(false);   // 등급 안내 모달
  const [myItems, setMyItems] = useState(null);      // 보유 아이템 (디스코드 역할 대조)
  const [claiming, setClaiming] = useState("");
  const [pass, setPass] = useState(null);            // /api/pass — 시즌 패스 상태 (비활성/비로그인이면 null)
  const [passBusy, setPassBusy] = useState("");      // 수령·해금 진행 중 키 ("t2:free" / "unlock") — 티어는 인덱스가 아니라 tid 로 잡는다

  const loadMe = useCallback(async () => {
    try {
      const [meRes, logRes, qRes, itemRes, passRes] = await Promise.all([
        fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/my-logs", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/quests", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/shop/my-items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        // 패스는 30초 폴링에 같이 실어 둔다 — 봇이 XP 를 넣어 티어가 오르면 화면도 따라 오른다
        fetch("/api/pass", { cache: "no-store" })
          .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
          .catch(() => null),
      ]);
      // 로그아웃(401·403) 처럼 서버가 명시적으로 거부했을 때만 비운다.
      // 500 도 { success:false } 인 정상 JSON 이라 본문만 보면 일시 장애와 구분되지 않는다 —
      // 한 번 끊겼다고 패스 탭이 통째로 사라지면 안 되므로 상태 코드로 갈라 본다.
      if (passRes?.body?.success) setPass(passRes.body);
      else if (passRes && (passRes.status === 401 || passRes.status === 403)) setPass(null);
      if (meRes?.success) {
        const d = meRes.data;
        const prev = prevXpRef.current;
        if (prev && d.xp > prev.xp) { pushToast(`+${(d.xp - prev.xp).toLocaleString()} XP 획득`); sfxXp(); }
        if (prev && d.level > prev.level) { pushToast(`레벨 업! Lv.${prev.level} → Lv.${d.level}`, true); sfxLevelUp(); }
        prevXpRef.current = d;
        setMe(d);
        setLastSync(new Date());
      }
      if (logRes?.success) setMyLogs(logRes.data);
      if (qRes?.success) setQuests(qRes.data);
      if (itemRes?.success) setMyItems((cur) => mergeMyItems(cur, itemRes.data));
    } catch {}
    setMeLoaded(true);
  }, [pushToast]);

  // 📌 가방을 열 때 보유 목록만 새로 읽는다 — 30초 폴링을 기다리면 방금 받은 것이 안 보이거나,
  //    직전 조회가 실패했을 때 빈 가방이 새로고침 전까지 남는다
  const refreshItems = useCallback(() => {
    fetch("/api/shop/my-items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setMyItems((cur) => mergeMyItems(cur, d.data)); })
      .catch(() => {});
  }, []);

  // 보상 수령 — 서버가 진행도를 다시 세고 중복을 막는다. 결과는 토스트+효과음으로 알린다.
  const claimQuest = useCallback(async (q) => {
    setClaiming(q.id);
    try {
      const res = await fetch("/api/xp/quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId: q.id }),
      }).then((r) => r.json());

      if (res?.success) {
        setQuests(res.data);
        // 화면에 적힌 값은 배율 적용 전 기본값이다 — 실제 지급액은 서버가 돌려준 claimed 를 쓴다
        const got = res.data?.claimed;
        const gotXp = Number(got?.amount ?? q.rewardXp) || 0;
        const gotPoint = Number(got?.point) || 0;
        const parts = [];
        if (gotXp > 0) parts.push(`+${gotXp.toLocaleString()} XP`);
        if (gotPoint > 0) parts.push(`+${gotPoint.toLocaleString()} 빙옥`);
        pushToast(parts.length ? `${q.name} 보상 ${parts.join(" · ")} 수령` : `${q.name} 보상 수령`, true);
        sfxLevelUp();
      } else {
        pushToast(res?.error || "수령하지 못했습니다.");
        // 서버 상태와 어긋났을 수 있으니 다시 맞춘다
        loadMe();
      }
    } catch {
      pushToast("네트워크 오류로 수령하지 못했습니다.");
    }
    setClaiming("");
  }, [pushToast, loadMe]);

  // 시즌 패스 수령 — 진행도·중복은 서버가 다시 판정한다. 클라이언트 상태는 근거가 아니다.
  // 티어는 tid(안정 식별자)로 지목한다 — 시즌 도중 티어가 추가되면 인덱스가 밀려 엉뚱한 보상을 받게 된다
  const claimPass = useCallback(async (tid, track) => {
    const busyKey = `${tid}:${track}`;
    setPassBusy(busyKey);
    try {
      const res = await fetch("/api/pass/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tid, track }),
      }).then((r) => r.json());

      if (res?.success) {
        pushToast(res.message || `${res.reward?.label || "보상"} 수령`, true);
        sfxLevelUp();
      } else {
        pushToast(res?.message || "수령하지 못했습니다.");
      }
    } catch {
      pushToast("네트워크 오류로 수령하지 못했습니다.");
    }
    // 성공이든 실패든 서버 상태로 다시 맞춘다 (수령 기록이 어긋난 채 남으면 안 된다).
    // 재조회가 끝난 뒤에 버튼을 풀어야 낡은 claimable 로 한 번 더 눌리지 않는다.
    await loadMe();
    // 다른 작업이 그 사이 시작됐으면 남의 표시를 지우면 안 된다 — 내 키일 때만 푼다
    setPassBusy((k) => (k === busyKey ? "" : k));
  }, [pushToast, loadMe]);

  // 확인 창 — window.confirm 대신. askConfirm 이 true / false 로 풀린다
  const [confirmState, setConfirmState] = useState(null);
  const confirmRef = useRef(null);
  const askConfirm = useCallback((opts) => new Promise((resolve) => {
    confirmRef.current = resolve;
    setConfirmState(opts);
    playTone(587.33, 0.05, "sine", 0.025);
  }), []);
  const closeConfirm = useCallback((ok) => {
    const done = confirmRef.current;
    confirmRef.current = null;
    setConfirmState(null);
    done?.(ok);
  }, []);

  // 프리미엄 해금 — 되돌릴 수 없는 지출이라 한 번 확인받는다. XP 로 내면 레벨이 내려갈 수 있어 그것도 보여 준다
  const unlockPass = useCallback(async (payMethod) => {
    // 가격은 XP 로만 저장된다 — 빙옥이면 환산값(÷1,000 올림)을 보여 주고 뺀다
    const price = payMethod === "xp" ? pass?.unlockPrice || 0 : xpToPoint(pass?.unlockPrice);
    const unit = payMethod === "xp" ? "XP" : "빙옥";
    const bal = payMethod === "xp" ? me?.xp || 0 : me?.point || 0;
    const after = Math.max(0, bal - price);
    const lvNow = me?.level || 0;
    const lvAfter = payMethod === "xp" ? getLevelByXp(after) : lvNow;
    const ok = await askConfirm({
      tone: "pass",
      icon: "star",
      title: "프리미엄 트랙을 해금할까요?",
      amount: price.toLocaleString(),
      unit,
      rows: [
        { l: `보유 ${unit}`, v: `${bal.toLocaleString()} → ${after.toLocaleString()}` },
        ...(lvAfter !== lvNow ? [{ l: "레벨", v: `${lvNow} → ${lvAfter}`, warn: true }] : []),
      ],
      body: "이번 시즌에만 적용되며 되돌릴 수 없습니다.",
      ok: "해금하기",
    });
    if (!ok) return;
    setPassBusy("unlock");
    try {
      const res = await fetch("/api/pass/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payMethod }),
      }).then((r) => r.json());

      if (res?.success) {
        pushToast(res.message || "프리미엄 트랙을 해금했습니다", true);
        sfxLevelUp();
      } else {
        pushToast(res?.message || "해금하지 못했습니다.");
      }
    } catch {
      pushToast("네트워크 오류로 해금하지 못했습니다.");
    }
    // 해금 결과가 화면에 반영된 뒤에 버튼을 푼다 (중복 결제 방지)
    await loadMe();
    // 다른 작업이 그 사이 시작됐으면 남의 표시를 지우면 안 된다 — 내 키일 때만 푼다
    setPassBusy((k) => (k === "unlock" ? "" : k));
  }, [pass?.unlockPrice, me?.xp, me?.point, me?.level, askConfirm, pushToast, loadMe]);

  // 강화 — 비용·단계는 서버가 정책으로 다시 계산한다(실패 없음·영구).
  //    응답의 단계·잔액을 바로 반영하고, 레벨·순위는 /api/xp/me 재조회로 맞춘다.
  const [enhBusy, setEnhBusy] = useState("");
  const [enhModal, setEnhModal] = useState(false);
  const [passOpen, setPassOpen] = useState(false); // 시즌 패스 창
  // 📌 옛 주소(?tab=pass) — 시즌 패스는 이제 탭이 아니라 대시보드 위 창이다
  useEffect(() => {
    if (tabParam !== "pass") return;
    const q = new URLSearchParams(Array.from(searchParams.entries()));
    q.set("tab", "my");
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    setPassOpen(true);
  }, [tabParam, searchParams, router, pathname]);
  const enhance = useCallback(async (kind, payMethod) => {
    const key = `${kind}:${payMethod}`;
    setEnhBusy(key);
    try {
      const res = await fetch("/api/xp/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, payMethod }),
      }).then((r) => r.json());

      if (res?.success) {
        setMe((m) => (m ? {
          ...m,
          xp: res.balance?.xp ?? m.xp,
          point: res.balance?.point ?? m.point,
          chatEnhance: res.view?.chat?.level ?? m.chatEnhance,
          voiceEnhance: res.view?.voice?.level ?? m.voiceEnhance,
        } : m));
        pushToast(res.message || "강화 완료", true);
        sfxLevelUp();
      } else {
        pushToast(res?.message || "강화하지 못했습니다.");
      }
    } catch {
      pushToast("네트워크 오류로 강화하지 못했습니다.");
    }
    // 성공이든 실패든 서버 상태로 다시 맞춘 뒤 버튼을 푼다 (낡은 잔액으로 한 번 더 눌리지 않게)
    await loadMe();
    setEnhBusy((k) => (k === key ? "" : k));
  }, [pushToast, loadMe]);

  // 관리자 테스트 초기화 — 서버가 관리자인지 다시 확인한다 (app/api/xp/reset)
  const [resetBusy, setResetBusy] = useState("");
  const resetTest = useCallback(async (what) => {
    setResetBusy(what);
    try {
      const res = await fetch("/api/xp/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ what }),
      }).then((r) => r.json());
      pushToast(res?.message || (res?.success ? "초기화했습니다." : "초기화하지 못했습니다."), !!res?.success);
      if (res?.success) {
        playTone(523.25, 0.07, "triangle", 0.03);
        setTimeout(() => playTone(392, 0.1, "triangle", 0.03), 90);
      }
    } catch {
      pushToast("네트워크 오류로 초기화하지 못했습니다.");
    }
    await loadMe();
    setResetBusy("");
  }, [pushToast, loadMe]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session?.user) { setMe(null); setMyLogs(null); setQuests(null); setMyItems(null); setPass(null); prevXpRef.current = null; setMeLoaded(true); return; }
    loadMe();
    const t = setInterval(loadMe, 30 * 1000);
    const onFocus = () => loadMe();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [session?.user?.id, authStatus, loadMe]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 리더보드 (공개 데이터, 60초 갱신) ──
  const [lb, setLb] = useState({ all: null, month: null });
  const [lbTab, setLbTab] = useState("all");
  useEffect(() => {
    const load = () => {
      ["all", "month"].forEach((period) =>
        fetch(`/api/xp/leaderboard?period=${period}&limit=10`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => { if (d?.success) setLb((p) => ({ ...p, [period]: d })); })
          .catch(() => {})
      );
    };
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // 대시보드 파생값
  const prog = me?.levelProgress || { current: 0, required: 1, needToNext: 0 };
  const progPct = Math.min(100, Math.floor((prog.current / Math.max(1, prog.required)) * 100));
  const rankPct = me?.total ? Math.max(1, Math.ceil((me.rank / me.total) * 100)) : null;
  const attendedToday = !!me && me.lastAttendDate === kstTodayStr();
  const todayTotal = myLogs?.today?.total ?? 0;
  const seasonPct = getSeasonProgress();

  // 음성 티어 — 현재 티어와 다음 승급 정보 (lib/voiceTiers 단일 소스)
  const tierIdx = getTierIndex(me?.level ?? 0);
  const tierCur = VOICE_TIERS[tierIdx];
  const tierNext = VOICE_TIERS[tierIdx + 1] || null;
  const tierNextBound = tierNext ? tierNext.min : null;

  // 퀘스트 — 주기(일일/주간/월간)별로 나눠 본다
  const questAll = quests?.quests || [];
  const questRows = questAll.filter((q) => (q.period || "daily") === questPeriod);
  // 주기마다 무작위로 뽑아 내보내는 경우 — 안내 문구를 "교체"로 바꾼다
  // 누적 음성 시간은 시즌 2 개시일부터 쌓인다 — 그 전에는 집계 예정임을 알린다
  // 인벤토리 분류 — 가진 항목에서 탭을 만들고, 없는 탭을 고르고 있으면 전체로 되돌린다
  const invAll = myItems?.items || [];
  const invGroups = useMemo(() => buildInvGroups(invAll), [invAll]);
  const invActive = invGroups.find((g) => g.id === invTab) || invGroups[0];
  const invRows = invActive?.items || [];
  // 손봐야 할 것 — 지급 대기·확인 필요는 배지로 알린다
  const invUnread = invAll.filter((i) => i.status === "pending" || i.status === "missing").length;
  // 가방 여닫는 소리 — 기존 어휘(880·523·620Hz)와 겹치지 않게 낮은음 → 높은음
  const openBag = () => {
    setBagOpen(true);
    refreshItems();
    playTone(392, 0.06, "sine", 0.03);
    setTimeout(() => playTone(587, 0.08, "sine", 0.03), 90);
  };
  const closeBag = () => {
    setBagOpen(false);
    playTone(523, 0.06, "sine", 0.025);
    setTimeout(() => playTone(349, 0.08, "sine", 0.025), 90);
  };
  // 강화 창 여닫는 소리 — 가방과 겹치지 않게 조금 높은 삼각파
  const openEnh = () => {
    setEnhModal(true);
    playTone(440, 0.06, "triangle", 0.03);
    setTimeout(() => playTone(659.25, 0.08, "triangle", 0.03), 90);
  };
  const closeEnh = () => {
    setEnhModal(false);
    playTone(587.33, 0.06, "triangle", 0.025);
    setTimeout(() => playTone(440, 0.08, "triangle", 0.025), 90);
  };
  const openTier = () => {
    setTierOpen(true);
    playTone(660, 0.06, "sine", 0.03);
  };
  // 시즌 패스 창 여닫는 소리 — 강화 · 가방과 겹치지 않게 한 옥타브 위에서
  const openPass = () => {
    setPassOpen(true);
    playTone(523.25, 0.06, "sine", 0.03);
    setTimeout(() => playTone(783.99, 0.09, "sine", 0.03), 90);
  };
  const closePass = () => {
    setPassOpen(false);
    playTone(659.25, 0.06, "sine", 0.025);
    setTimeout(() => playTone(440, 0.08, "sine", 0.025), 90);
  };

  // 랭킹 — 탭이 열려 있을 때만 부른다. 기준이나 페이지가 바뀌면 다시 부른다.
  const rankPages = Math.max(1, Math.ceil(rankTotal / RANK_PAGE_SIZE));
  useEffect(() => {
    if (activeMainTab !== "rank") return;
    let alive = true;
    setRankLoading(true);
    const qs = new URLSearchParams({
      period: rankMode,
      limit: String(RANK_PAGE_SIZE),
      skip: String(rankPage * RANK_PAGE_SIZE),
    });
    fetch(`/api/xp/leaderboard?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRankRows(Array.isArray(d?.data) ? d.data : []);
        setRankTotal(d?.total || 0);
      })
      .catch(() => { if (alive) { setRankRows([]); setRankTotal(0); } })
      .finally(() => { if (alive) setRankLoading(false); });
    return () => { alive = false; };
  }, [activeMainTab, rankMode, rankPage]);

  const voiceTracked = isVoiceTimeTracked();
  const questPool = quests?.pool?.[questPeriod] || null;
  const questRotates = !!(questPool && questPool.pick > 0 && questPool.total > questPool.shown);
  const questDone = questRows.filter((q) => q.claimed || q.done).length;
  const questTotal = questRows.length;
  const questPct = Math.round((questDone / Math.max(1, questTotal)) * 100);
  const questClaimable = questRows.filter((q) => q.claimable).length;
  // 탭에 붙일 '받을 수 있는 보상' 개수
  const claimableBy = { daily: 0, weekly: 0, monthly: 0 };
  for (const q of questAll) if (q.claimable) claimableBy[q.period || "daily"]++;

  // 킬피드 확장 토글 — 내부 스크롤 대신 5건 + 전체 보기 (이중 스크롤 회피)
  const [feedOpen, setFeedOpen] = useState(false);

  // 진행 중 이벤트 — 대시보드 사이드 위젯
  const [events, setEvents] = useState([]);

  // 모바일 대시보드 — 섹션을 길게 늘어놓지 않고 아이콘으로 골라 하나씩 본다
  const [mSec, setMSec] = useState("quest");
  const mNavRef = useRef(null);
  // 아이콘 줄은 헤더 아래에 붙었을 때만 흰 바탕 — 평소에 깔면 위 카드 그림자가 줄 윗변에서 뚝 잘린다
  const [mNavStuck, setMNavStuck] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const n = mNavRef.current;
      const v = !!n && n.getBoundingClientRect().top <= 61;
      setMNavStuck((p) => (p === v ? p : v));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [meLoaded]);
  const dashCardRef = useRef(null);
  const mobSecs = [
    { k: "quest", l: "퀘스트", icon: "flag", n: questAll.filter((q) => q.claimable).length },
    { k: "rank", l: "랭킹", icon: "chart", n: 0 },
    ...(events.length > 0 ? [{ k: "event", l: "이벤트", icon: "gift", n: 0 }] : []),
    { k: "feed", l: "획득 피드", icon: "clock", n: 0 },
    { k: "table", l: "XP 테이블", icon: "receipt", n: 0 },
    { k: "sim", l: "시뮬레이터", icon: "sparkles", n: 0 },
  ];
  const mSecOn = mobSecs.some((x) => x.k === mSec) ? mSec : "quest";
  // PC — 오른쪽 카테고리(현황 · XP 테이블 · 시뮬레이터). 현황이면 퀘스트 · 랭킹 · 피드를 다 펼치고, 아니면 그 카테고리 하나만
  const deskOverview = mSecOn !== "table" && mSecOn !== "sim";
  const secCls = (k) => `${mSecOn === k ? "block" : "hidden"} ${deskOverview ? "lg:block" : "lg:hidden"}`;
  // 📌 옛 주소(?tab=table · ?tab=sim) — 대시보드의 그 카테고리로 연다
  useEffect(() => {
    if (tabParam !== "table" && tabParam !== "sim") return;
    setMSec(tabParam);
    const q = new URLSearchParams(Array.from(searchParams.entries()));
    q.delete("tab");
    router.replace(`${pathname}${q.toString() ? `?${q.toString()}` : ""}`, { scroll: false });
  }, [tabParam, searchParams, router, pathname]);
  const pickSec = (k) => {
    setMSec(k);
    const nav = mNavRef.current, card = dashCardRef.current;
    // 아이콘 줄이 위에 붙어 있을 때만 — 새 섹션의 첫 줄이 줄 바로 아래에 오게 올린다
    if (nav && card && nav.getBoundingClientRect().top <= 64) {
      requestAnimationFrame(() => window.scrollTo({ top: card.getBoundingClientRect().bottom + window.scrollY + 20 - nav.getBoundingClientRect().top }));
    }
  };

  // 📌 PC 프로필 카드는 따라오지 않고 제자리에 둔다 (따라오기 · 가운데 · 끝까지를 거쳐 고정으로 정리)
  useEffect(() => {
    fetch("/api/posts?category=이벤트", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setEvents((Array.isArray(d?.data) ? d.data : []).slice(0, 3)))
      .catch(() => {});
  }, []);


  // 📌 현재 XP 정책 — 레벨 대시보드에서 값을 바꾸면 이 페이지 수치도 즉시 따라간다
  const [policy, setPolicy] = useState(null);
  useEffect(() => {
    const load = () => fetch("/api/xp/policy", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setPolicy(d.data); })
      .catch(() => {});
    load();
    // 대시보드에서 저장한 값이 열려 있는 화면에도 반영되도록 주기 갱신
    const t = setInterval(load, 30 * 1000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, []);

  // 정책값 헬퍼 (로드 전에는 기존 기본값 사용)
  const P = {
    chatXp: policy?.chatXp ?? 200, // (구) 고정 지급량 — 화면은 아래 min/max 랜덤 구간을 쓴다
    // 채팅 랜덤 구간 · 강화 정책 — lib/enhance.js 가 같은 키를 읽는다
    chatXpMin: policy?.chatXpMin ?? 50,
    chatXpMax: policy?.chatXpMax ?? 500,
    chatEnhanceStep: policy?.chatEnhanceStep ?? 50,
    chatEnhanceMax: policy?.chatEnhanceMax ?? 10,
    chatEnhanceBaseCost: policy?.chatEnhanceBaseCost ?? 20000,
    chatEnhanceCostGrowthPct: policy?.chatEnhanceCostGrowthPct ?? 50,
    voiceEnhanceStep: policy?.voiceEnhanceStep ?? 300,
    voiceEnhanceMax: policy?.voiceEnhanceMax ?? 10,
    voiceEnhanceBaseCost: policy?.voiceEnhanceBaseCost ?? 50000,
    voiceEnhanceCostGrowthPct: policy?.voiceEnhanceCostGrowthPct ?? 50,
    chatCooldownSec: policy?.chatCooldownSec ?? 60,
    voiceXp: policy?.voiceXp ?? 3000,
    voiceIntervalSec: policy?.voiceIntervalSec ?? 300,
    attendXp: policy?.attendXp ?? 7000,
    // 출석 인정 기준 (음성 누적 분) — 빠져 있어서 안내 탭에 숫자가 통째로 비어 나왔다
    attendVoiceMin: policy?.attendVoiceMin ?? 60,
    muteMode: policy?.muteMode ?? "reduce",
    muteReducePct: policy?.muteReducePct ?? 90,
    muteTarget: policy?.muteTarget ?? "both",
  };
  const P_voiceMin = Math.max(1, Math.round(P.voiceIntervalSec / 60));
  const P_chatMin = Math.max(1, Math.round(P.chatCooldownSec / 60));
  // 채팅 기본 구간(강화 0) — 안내 문구용. 내 강화 상태는 정책 + 내 단계로 화면에서 바로 만든다 (서버 응답과 같은 식)
  const P_chatBase = chatRange(P, 0);
  const enh = buildEnhanceView(P, me);
  const enhOpen = enh.chat.max > 0 || enh.voice.max > 0;
  // 📌 지금 내 조건으로 1회에 받는 XP — 봇 chatXp/voiceXp 의 식과 같은 항목만 더한다
  //    (채널별 부스트·음소거 감소는 상황마다 달라 뺀다). 내역 칩은 0 인 항목을 생략한다.
  const gain = (() => {
    const buff = Math.max(0, Number(me?.buffXp) || 0);
    const boost = Math.max(0, Number(me?.boostXp) || 0);
    // 보유 아이템 기본 효과 — 채팅 · 음성 따로 (봇 basic-chat · basic-voice 와 같은 값)
    const itemChat = Math.max(0, Number(me?.itemChatXp) || 0);
    const itemVoice = Math.max(0, Number(me?.itemVoiceXp) || 0);
    const chatEnh = enh.chat.level * enh.chat.step;
    const tier = getVoiceBonus(me?.level || 0);
    const voiceEnh = enh.voice.bonus || 0;
    const fmt = (n) => n.toLocaleString();
    const extra = [buff > 0 && { l: "역할", v: `+${fmt(buff)}` }, boost > 0 && { l: "부스트", v: `+${fmt(boost)}` }].filter(Boolean);
    return {
      chatLo: enh.chat.range[0] + buff + boost + itemChat,
      chatHi: enh.chat.range[1] + buff + boost + itemChat,
      chatParts: [{ l: "기본", v: `${fmt(P_chatBase[0])}~${fmt(P_chatBase[1])}` }, chatEnh > 0 && { l: "강화", v: `+${fmt(chatEnh)}` }, ...extra, itemChat > 0 && { l: "아이템", v: `+${fmt(itemChat)}` }].filter(Boolean),
      voice: P.voiceXp + tier + voiceEnh + buff + boost + itemVoice,
      voiceParts: [{ l: "기본", v: fmt(P.voiceXp) }, tier > 0 && { l: "등급", v: `+${fmt(tier)}` }, voiceEnh > 0 && { l: "강화", v: `+${fmt(voiceEnh)}` }, ...extra, itemVoice > 0 && { l: "아이템", v: `+${fmt(itemVoice)}` }].filter(Boolean),
    };
  })();

  // 티어 지급량은 관리자가 정한 기본 음성 XP 위에 얹힌다 (P 정의 이후여야 한다)
  const tierCurXp = P.voiceXp + tierCur.bonus;
  const tierNextXp = tierNext ? P.voiceXp + tierNext.bonus : null;

  // SYSTEM : LEVEL 공개 여부 — 리뉴얼 후 10월 공개. 비공개면 관리자 외에는 아래 예고 화면만 본다.
  const isAdminUser = isAdminName(session?.user?.name);
  const levelOpen = !!policy?.levelPublic || isAdminUser;
  // ARCTIC 상점 동선 — 공개 전에는 관리자에게만 노출 (policy.shopPublic). 레벨이 닫혀 있으면 함께 닫힌다.
  const canSeeShop = (!!policy?.shopPublic && levelOpen) || isAdminUser;
  const P_chatCooldownLabel = P.chatCooldownSec >= 60 ? `${Math.round(P.chatCooldownSec / 60)}분` : `${P.chatCooldownSec}초`;

  // ── 시즌 패스 파생값 ──
  // /api/pass 는 비로그인이면 401 이라 pass 가 null 이다 → 그때는 탭을 만들지 않는다 (관리자가 끈 것과 동일 취급)
  const passEnabled = !!pass?.enabled;
  const passTiers = pass?.tiers || [];
  const passMaxTier = passTiers[passTiers.length - 1]?.level ?? passTiers.length;
  const passClaimable = passTiers.reduce(
    (n, t) => n + (t.free?.claimable ? 1 : 0) + (t.paid?.claimable ? 1 : 0), 0
  );
  const passTierNo = pass && pass.tierIndex >= 0 ? (passTiers[pass.tierIndex]?.level ?? pass.tierIndex + 1) : 0;

  // 시즌 D-Day (KST 기준) — 계산은 lib/season.js 단일 소스
  const seasonDday = useMemo(() => getSeasonDday(), []);

  // 📌 탭 줄 — 일반 탭에서는 히어로 아래, ARCTIC 에서는 상점 헤더 바로 아래에 그린다.
  //    ARCTIC 은 전역 헤더를 넘겨받은 화면이라 카테고리도 그 헤더에 붙어 있어야 자연스럽다.
  // 📌 탭 줄 — 스토어의 유형 줄과 같은 문법(흰 줄 · 밑줄 탭). 화면마다 탭 모양이 달라지면 안 된다.
  //    📌 모바일은 가로 스크롤 대신 같은 폭 칸으로 한 줄에 다 — 끝 탭이 잘려 보이면 안 된다.
  //       ARCTIC 은 모바일 하단 독에 있으므로 모바일 탭 줄에서는 빼고, 긴 이름은 짧은 이름(short)으로.
  const shownTabs = MAIN_TABS.filter((t) => (!t.shopOnly || canSeeShop) && (!t.passOnly || passEnabled));
  const mobileTabCount = shownTabs.filter((t) => !t.href).length;
  const tabBar = (
    <div className="w-full bg-white border-b border-[#ededed]">
      <div className="max-w-7xl mx-auto px-3 sm:px-5 md:px-6 flex items-center h-[52px] sm:h-[56px] md:h-[60px]">
        <nav className="grid w-full sm:w-auto sm:flex items-center sm:gap-5 md:gap-7 sm:overflow-x-auto no-bar h-full min-w-0" style={{ gridTemplateColumns: `repeat(${mobileTabCount}, minmax(0, 1fr))` }}>
          {shownTabs.map((tab) => {
            const active = activeMainTab === tab.id;
            const cls = `shrink-0 h-full items-center justify-center sm:justify-start text-[13px] sm:text-[14px] md:text-[15px] font-extrabold whitespace-nowrap transition-colors outline-none focus-visible:text-[#131313] ${
              active ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"
            }`;
            // 밑줄은 글자 폭만큼 — 칸 폭 전체로 깔리면 모바일에서 탭이 덩어리로 보인다
            const label = (
              <span className="relative h-full flex items-center">
                <span className="sm:hidden">{tab.short || tab.name}</span>
                <span className="hidden sm:inline">{tab.name}</span>
                {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
              </span>
            );
            // ARCTIC 은 다른 세계(제 주소) — 탭 줄에서는 링크로 선다 (이동 규칙 2). 모바일은 독에 있으므로 숨김
            if (tab.href) return <Link key={tab.id} href={tab.href} className={`hidden sm:flex ${cls}`}>{label}</Link>;
            return (
              <button key={tab.id} onClick={() => setActiveMainTab(tab.id)} className={`flex ${cls}`}>
                {label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );

  // 📌 예고 화면 — 비공개면 본문을 그리지 않는다. 세션·정책이 오기 전에는 판단을 미뤄 관리자에게 깜빡이지 않게 한다.
  //    훅은 전부 위에서 이미 호출됐으므로 여기서 갈라도 순서가 흔들리지 않는다.
  if (mounted && authStatus !== "loading" && policy && !levelOpen) {
    return (
      <main className="w-full flex-1 flex flex-col relative">
        <HudStyles />
        <section className="relative w-full flex-1 flex items-center justify-center px-6 py-28 md:py-40">
          <div aria-hidden className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[280px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
          <div className="relative z-10 text-center max-w-md break-keep">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none text-[#131313] mb-5">
              SYSTEM<span className="text-[#e91e3f]"> : </span>LEVEL
            </h1>
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e91e3f]/10 border border-[#e91e3f]/30 text-[12px] font-black text-[#e91e3f]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>10월 공개
            </span>
            <p className="text-[13px] text-[#5a5a5a] mt-6">리뉴얼 준비 중입니다. 활동 XP는 계속 쌓이고 있습니다.</p>
            <Link href="/" className="inline-flex items-center gap-1.5 mt-8 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">홈으로 <span aria-hidden>→</span></Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    // ⚠️ main에 overflow-hidden 금지 — 하위 sticky(탭바)가 죽는다. 글로우 가로 넘침은 body의 overflow-x: clip이 전역 처리
    <main className="w-full flex-1 flex flex-col relative">
      <HudStyles />
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 10px; }
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
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes barSheen {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
        }
        .lux-shimmer {
          background: linear-gradient(110deg, #131313 20%, #e91e3f 40%, #ff7a92 50%, #e91e3f 60%, #131313 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s linear infinite;
        }
        @keyframes emblemHop {
          0%   { transform: translateY(0) rotate(0) scale(1); }
          40%  { transform: translateY(-5px) rotate(-10deg) scale(1.14); }
          70%  { transform: translateY(-2px) rotate(5deg) scale(1.1); }
          100% { transform: translateY(-2px) rotate(0) scale(1.1); }
        }
        .tier-emblem { display: inline-block; transition: transform .3s cubic-bezier(0.16,1,0.3,1); }
        .tier-emblem:hover { animation: emblemHop .6s cubic-bezier(0.16,1,0.3,1) forwards; }
        @media (prefers-reduced-motion: reduce) { .tier-emblem:hover { animation: none; } }
        /* 팝업 목록 — 스크롤바 자리를 늘 비워 둔다. 목록이 길어 스크롤바가 생기고 없어질 때마다
           폭이 10px 바뀌어 칸이 움찔하던 것(시즌 패스 전체 ↔ 받을 보상). 어두운 창이라 막대는 얇고 옅게 */
        .pop-scroll { scrollbar-gutter: stable; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.22) transparent; }
        /* 강화 — 숫자가 튀어 오르고 불티가 퍼진다. 최종 단계는 금빛 링 둘레로 빛이 돈다 */
        @keyframes numPop {
          0%   { transform: scale(0.55); opacity: 0; filter: brightness(2.2); }
          45%  { transform: scale(1.28); opacity: 1; }
          100% { transform: scale(1); filter: brightness(1); }
        }
        @keyframes sparkFly {
          0%   { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2); opacity: 0; }
        }
        @keyframes auraSpin { to { transform: rotate(360deg); } }
        @keyframes auraPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 0.9; } }
        /* 크기는 그대로 — 카드가 커지면 팝업 왼쪽 칸이 넘쳐 스크롤바가 잠깐 생긴다. 빛과 테두리 번짐만 */
        @keyframes passUnlock {
          0%   { filter: brightness(2); box-shadow: inset 0 0 0 1px rgba(214,180,255,0.7), 0 0 0 0 rgba(182,156,255,0.75); }
          100% { filter: brightness(1); box-shadow: inset 0 0 0 1px rgba(214,180,255,0.3), 0 0 0 18px rgba(182,156,255,0); }
        }
        @keyframes nodeFill {
          0%   { transform: scale(0.3); box-shadow: 0 0 0 0 rgba(255,122,74,0.8); }
          60%  { transform: scale(1.6); box-shadow: 0 0 0 8px rgba(255,122,74,0); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) { .enh-anim { animation: none !important; } }
        @keyframes ringPop {
          0%   { transform: scale(1); filter: brightness(1); }
          35%  { transform: scale(1.08); filter: brightness(1.7); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        @keyframes tierIn {
          from { opacity: 0; transform: translateY(16px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .lux-grid-bg-dark {
          background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 46px 46px;
          -webkit-mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%);
          mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%);
        }
        .lux-grid-bg {
          background-image: linear-gradient(rgba(0,0,0,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,0.025) 1px, transparent 1px);
          background-size: 44px 44px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
          -webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%);
        }
      `}} />

      <TierModal open={tierOpen} onClose={() => setTierOpen(false)} level={me?.level || 0} baseXp={P.voiceXp} intervalMin={P_voiceMin} enhanceBonus={enh.voice.bonus} />
      <EnhanceModal open={enhModal} onClose={closeEnh} enh={enh} balance={me} busy={!!enhBusy} onEnhance={enhance} gain={gain} voiceMin={P_voiceMin} policy={P} onTone={() => playTone(620, 0.04, "sine", 0.025)} onReset={isAdminUser ? () => resetTest("enhance") : null} resetBusy={resetBusy === "enhance"} />
      <PassModal
        open={passOpen}
        onClose={closePass}
        pass={pass}
        tiers={passTiers}
        tierNo={passTierNo}
        maxTier={passMaxTier}
        claimable={passClaimable}
        busyKey={passBusy}
        onClaim={claimPass}
        onUnlock={unlockPass}
        balance={me}
        dday={seasonDday}
        onTone={() => playTone(620, 0.04, "sine", 0.025)}
        onReset={isAdminUser ? () => resetTest("pass") : null}
        resetBusy={resetBusy === "pass"}
      />
      <ConfirmDialog state={confirmState} onDone={closeConfirm} />
      <BagOverlay
        open={bagOpen}
        onClose={closeBag}
        groups={invGroups}
        tab={invTab}
        onTab={setInvTab}
        synced={myItems?.synced}
        loading={!!session?.user && myItems === null}
        onTone={() => playTone(620, 0.04, "sine", 0.025)}
        onReset={isAdminUser ? () => resetTest("shop") : null}
        resetBusy={resetBusy === "shop"}
      />

      {/* ── 탭 줄 — 어떤 탭이든 헤더 바로 아래 같은 자리. 여기가 움직이면 안 된다. ── */}
      {tabBar}

      {/* 대시보드 탭은 좌우 공간을 쓰는 와이드 HUD(7xl), 문서형 탭은 기존 에디토리얼 폭 유지 */}
      <div className={`w-full max-w-7xl mx-auto px-5 md:px-8 flex-1 ${activeMainTab === "my" ? "py-6 md:py-10" : "py-10 md:py-14"}`}>
        {/* ── 머리 한 줄 — 큰 제목(히어로)을 없앤 자리. 선으로 따로 떼지 않고 본문 맨 위에 작게:
               왼쪽 워드마크 · 시즌 이름, 오른쪽 D-day · 동기화 점 · 갱신 (PC 는 동기화 글자 · 마지막 갱신 시각까지) ── */}
        <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
          <div className="flex items-baseline gap-3 min-w-0">
            <h1 className="text-[20px] md:text-[26px] font-black tracking-tighter leading-none whitespace-nowrap">
              <span className="text-[#131313]">SYSTEM</span>
              <span className="text-[#e91e3f] mx-1">:</span>
              <span className="lux-shimmer">LEVEL</span>
            </h1>
            <span className="hidden sm:inline text-[12px] font-black text-[#d01634] whitespace-nowrap">SEASON {SEASON.number} · {SEASON.name}</span>
          </div>
          <div className="inline-flex items-center gap-2 md:gap-2.5 text-[12px] font-bold text-[#5a5a5a] tabular-nums whitespace-nowrap">
            {seasonDday.ended ? "시즌 종료" : <><span className="sm:hidden">시즌 </span><span className="hidden sm:inline">종료까지 </span>D-{seasonDday.days}</>}
            {authReady && session?.user && (
              <>
                <span className="hidden md:inline text-[#d4d4d4]" aria-hidden>·</span>
                <span aria-label="실시간 동기화 중" title="실시간 동기화 중"><LiveDot /></span>
                <span className="hidden md:inline text-[11px] text-[#5a5a5a]">실시간 동기화</span>
                {lastSync && <span className="hidden md:inline text-[11px] text-[#8a8a8a]">{lastSync.toLocaleTimeString("ko-KR", { hour12: false })}</span>}
                <button onClick={() => loadMe().then(() => pushToast("동기화 완료"))} className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 border border-[#a3a3a3] rounded-full px-2.5 py-0.5">갱신</button>
              </>
            )}
          </div>
        </div>


        {/* ══ TAB : MY DASHBOARD — 게임 프로필 화면 ══
               앵커는 플레이어 배너(레벨 링 + 대형 레벨 + 와이드 XP 게이지) 하나.
               아래는 8:4 비대칭 2열, 한국어 우선 섹션 타이틀, 헤어라인 행 배치 ══ */}
        {activeMainTab === "my" && (
          <div className="relative">
            {/* ── 로딩 스켈레톤 ── */}
            {(!authReady || (session?.user && !meLoaded)) && (
              <div>
                <div className="h-56 rounded-2xl animate-pulse bg-black/[0.03] mb-8"></div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-8 h-64 animate-pulse bg-black/[0.02] rounded-2xl"></div>
                  <div className="lg:col-span-4 h-64 animate-pulse bg-black/[0.02] rounded-2xl"></div>
                </div>
              </div>
            )}

            {/* ── 비로그인 · 관전 모드 락 스크린 ── */}
            {authReady && !session?.user && (
              <div>
                <div className="relative">
                  <div aria-hidden className="opacity-40 pointer-events-none select-none">
                    {/* 플레이어 배너 셸 — 수치는 전부 — (가짜 수치 금지) */}
                    <div className="relative rounded-3xl overflow-hidden bg-[#131313] p-6 md:p-10">
                      <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>
                      <div className="relative z-10 flex items-center gap-5 md:gap-7">
                        <RingGauge pct={0} size={112} stroke={6} trackClass="rgba(255,255,255,0.12)">
                          <span className="w-[78px] h-[78px] rounded-full bg-white/[0.07] flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-9 h-9" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" /></svg>
                          </span>
                        </RingGauge>
                        <div>
                          <p className="text-[10px] font-black tracking-[0.35em] text-white/20 uppercase mb-2">Player</p>
                          <p className="text-2xl md:text-4xl font-black text-white/15 leading-none">— — —</p>
                          <div className="flex gap-2 mt-3.5">
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-white/12 text-[10px] font-black tracking-[0.12em] uppercase text-white/25">Rank —</span>
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-white/12 text-[10px] font-black tracking-[0.12em] uppercase text-white/25">Top —%</span>
                          </div>
                        </div>
                        <p className="ml-auto text-7xl md:text-8xl font-black text-white/[0.08] tabular-nums leading-[0.85]">—</p>
                      </div>
                      <div className="relative z-10 mt-9">
                        <SegBar pct={0} segments={20} h="h-3.5" track="bg-white/10" tick="rgba(19,19,19,0.92)" />
                      </div>
                      <div className="relative z-10 grid grid-cols-2 md:grid-cols-4 border-t border-white/10 mt-8 pt-6 md:divide-x md:divide-white/10">
                        {["TOTAL", "TODAY", "STREAK", "VOICE"].map((s, i) => (
                          <div key={i} className={`px-0 md:px-6 ${i < 2 ? "pb-5 md:pb-0" : ""} ${i === 0 ? "md:pl-0" : ""}`}>
                            <p className="text-[9px] font-black tracking-[0.28em] text-white/20 uppercase mb-2">{s}</p>
                            <p className="text-xl md:text-2xl font-black text-white/15 tabular-nums leading-none">—</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* 락 카드 */}
                  <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
                    <HudPanel accent glow corners={false} className="w-full max-w-sm bg-[#ffffff] px-7 py-8 md:px-9 text-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-4" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                      <p className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase mb-2.5">관전 모드</p>
                      <p className="text-sm font-bold text-[#131313] mb-7">내 대시보드가 잠겨 있습니다</p>
                      <button onClick={() => signIn("discord", { callbackUrl: "/level" })} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors shadow-[0_10px_30px_rgba(233,30,63,0.35)] outline-none focus:outline-none">Discord로 로그인</button>
                      {process.env.NODE_ENV === "development" && (
                        <button onClick={() => signIn("devlogin", { callbackUrl: "/level" })} className="mt-3.5 text-[11px] font-bold text-[#a3a3a3] hover:text-[#131313] underline underline-offset-4 transition-colors outline-none focus:outline-none">로컬 확인용 로그인 (dev)</button>
                      )}
                    </HudPanel>
                  </div>
                </div>

                {/* 로그인 없이도 — XP 테이블 · 시뮬레이터 (예전 탭) */}
                <div className="mt-14">
                  <div role="tablist" aria-label="XP 도구" className="flex border-b border-[#ededed] mb-8">
                    {[{ k: "table", l: "XP 테이블" }, { k: "sim", l: "시뮬레이터" }].map((t) => {
                      const on = (mSecOn === "sim" ? "sim" : "table") === t.k;
                      return (
                        <button key={t.k} type="button" role="tab" aria-selected={on} onClick={() => setMSec(t.k)}
                          className={`relative py-3 mr-7 text-[15px] font-extrabold transition-colors outline-none focus-visible:text-[#131313] ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                          {t.l}
                          {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
                        </button>
                      );
                    })}
                  </div>
                  {mSecOn === "sim" ? (
                    <XpSimulator me={null} P={P} ready={!!policy} onTone={() => playTone(620, 0.04, "sine", 0.025)} />
                  ) : (
                    <XpTableView myLevel={0} myXp={null} onTone={() => playTone(620, 0.04, "sine", 0.025)} />
                  )}
                </div>

                {/* 공개 섹션 — 관전자에게도 실데이터 */}
                <div className="mt-14">
                  <div className="max-w-2xl mx-auto min-w-0">
                    <div className="flex items-end justify-between mb-5">
                      <div>
                        <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">서버 랭킹</h3>
                      </div>
                      <span className="flex items-center gap-3">
                        {["all", "month"].map((k) => (
                          <button key={k} onClick={() => setLbTab(k)} className={`text-[11px] font-black transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-[#131313] border-b-2 border-[#e91e3f]" : "text-[#a3a3a3] hover:text-[#5a5a5a]"}`}>{k === "all" ? "누적" : "이번 달"}</button>
                        ))}
                      </span>
                    </div>
                    {!lb[lbTab] ? (
                      <div className="py-10 text-center text-[11px] font-bold text-[#a3a3a3]">불러오는 중…</div>
                    ) : !lb[lbTab].data?.length ? (
                      <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                    ) : (
                      <RankRows rows={lb[lbTab].data} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── 로그인 · 내 프로필 ── */}
            {authReady && session?.user && meLoaded && me && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-5 lg:gap-y-14 items-start">

                {/* 왼쪽 기둥 — 세로 프로필 카드. PC 에서는 스크롤을 따라 내려온다 */}
                <div className="contents lg:block lg:col-span-4 min-w-0">
                    {/* 프로필 카드 — 위에서 아래로: 정체성 → 레벨 → 등급 → 경험치 → 인벤토리 · 시즌 패스 · 강화 → 스탯 */}
                    <div
                      ref={dashCardRef}
                      className="order-first relative rounded-3xl overflow-hidden shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]"
                      style={{ background: `radial-gradient(420px 320px at 86% 30%, ${hexA(tierCur.c, 0.26)} 0%, ${hexA(tierCur.c, 0)} 72%), linear-gradient(180deg, #1b1b1b 0%, #131313 55%)` }}
                    >
                      <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>
                      <span aria-hidden className="hidden lg:block absolute -right-3 -bottom-10 text-[150px] font-black text-white/[0.035] leading-none tracking-tighter tabular-nums select-none pointer-events-none">{me.level}</span>

                      <div className="relative z-10 p-5 md:p-7">
                        {/* 정체성 — 아바타 옆에 이름 */}
                        <div className="flex items-center gap-4 lg:gap-5">
                          <span className="shrink-0 lg:hidden">
                            <RingGauge pct={progPct} size={76} stroke={5} trackClass="rgba(255,255,255,0.12)">
                              {session.user.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={session.user.image} alt="" className="w-[54px] h-[54px] rounded-full object-cover" />
                              ) : (
                                <span className="w-[54px] h-[54px] rounded-full bg-white/10 flex items-center justify-center text-lg font-black text-white/60">{(session.user.name || "?").slice(0, 1)}</span>
                              )}
                            </RingGauge>
                          </span>
                          <span className="hidden lg:block">
                            <RingGauge pct={progPct} size={96} stroke={6} trackClass="rgba(255,255,255,0.12)">
                              {session.user.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={session.user.image} alt="" className="w-[68px] h-[68px] rounded-full object-cover" />
                              ) : (
                                <span className="w-[68px] h-[68px] rounded-full bg-white/10 flex items-center justify-center text-2xl font-black text-white/60">{(session.user.name || "?").slice(0, 1)}</span>
                              )}
                            </RingGauge>
                          </span>
                          <div className="min-w-0 flex-1">
                          <p className="max-w-full text-xl lg:text-[26px] font-black text-white truncate tracking-tight leading-none">{session.user.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-white/20 text-[11px] font-bold text-white/75 tabular-nums">
                              랭크 #{me.rank.toLocaleString()}<span className="text-white/40 ml-1">/ {me.total.toLocaleString()}</span>
                            </span>
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#e91e3f] text-[11px] font-bold text-white tabular-nums">상위 {rankPct}%</span>
                            {todayTotal > 0 && (
                              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-[#e91e3f]/55 text-[11px] font-bold text-[#ff5c77] tabular-nums">
                                <LiveDot color="bg-[#ff5c77]" />오늘 +{todayTotal.toLocaleString()} XP
                              </span>
                            )}
                          </div>
                          </div>
                        </div>

                        {/* 레벨 — 카드의 얼굴. 등급은 바로 아래 한 줄, 안내는 버튼으로 연다 */}
                        <div className="mt-6 lg:mt-7 pt-5 lg:pt-6 border-t border-white/10">
                          <p className="text-[10px] font-black tracking-[0.35em] text-white/40 uppercase mb-2.5">LEVEL</p>
                          <p className="text-[52px] lg:text-6xl font-black text-white tabular-nums tracking-[-0.04em] leading-[0.85]">{me.level}</p>
                          <div className="mt-4 flex items-center gap-3">
                            <span className="tier-emblem shrink-0 cursor-default"><TierEmblem tier={tierCur} size={32} /></span>
                            <div className="min-w-0 flex-1">
                              <p
                                className="text-[18px] font-black tracking-tight leading-none truncate"
                                style={{ background: `linear-gradient(180deg, ${hexLift(tierCur.c, 0.45)} 0%, ${tierCur.c} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: tierCur.c }}
                              >
                                {tierCur.name}
                              </p>
                              {tierNext && tierNextBound !== null && (
                                <p className="text-[11px] font-bold text-white/50 mt-1.5 truncate tabular-nums">
                                  <span style={{ color: hexLift(tierNext.c, 0.15) }}>{tierNext.name}</span>까지 {Math.max(0, tierNextBound - me.level)}레벨
                                </p>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={openTier}
                              className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full border border-white/20 text-[11px] font-bold text-white/75 hover:text-white hover:border-white/45 transition-colors outline-none focus:outline-none"
                            >
                              등급 안내
                            </button>
                          </div>
                        </div>

                        {/* 경험치 — 막대 하나, 글자 둘 */}
                        <div className="mt-6">
                          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#e91e3f]" style={{ width: `${progPct}%`, transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)" }}></div>
                          </div>
                          <div className="flex justify-between items-baseline mt-2.5">
                            <span className="text-[11px] font-bold text-white/45 tabular-nums">{prog.current.toLocaleString()} / {prog.required.toLocaleString()} XP</span>
                            <span className="text-[11px] font-bold text-white/60">Lv {me.level + 1} 까지 <b className="text-white tabular-nums">{prog.needToNext.toLocaleString()} XP</b></span>
                          </div>
                        </div>

                        {/* 인벤토리 · 시즌 패스 · 강화 — 한 줄에 셋. 상자도 선도 없이 아이콘과 이름만 */}
                        {(myItems || passEnabled || enhOpen) && (
                          <div className="grid grid-flow-col auto-cols-fr mt-6">
                            {myItems && (
                              <button onClick={openBag} aria-label="인벤토리 열기" className="group min-w-0 flex flex-col items-center justify-center gap-2 py-3 outline-none focus:outline-none">
                                <span aria-hidden className="relative">
                                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white/55 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d={ICON_PATHS.bag} strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {invUnread > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{invUnread}</span>}
                                </span>
                                <span className="max-w-full truncate text-[12px] font-bold text-white/80 group-hover:text-white transition-colors">인벤토리</span>
                              </button>
                            )}
                            {passEnabled && (
                              <button onClick={openPass} aria-label="시즌 패스 열기" className="group min-w-0 flex flex-col items-center justify-center gap-2 py-3 outline-none focus:outline-none">
                                <span aria-hidden className="relative">
                                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white/55 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d={ICON_PATHS.star} strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                  {passClaimable > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{passClaimable}</span>}
                                </span>
                                <span className="max-w-full truncate text-[12px] font-bold text-white/80 group-hover:text-white transition-colors">시즌 패스</span>
                              </button>
                            )}
                            {enhOpen && (
                              <button type="button" onClick={openEnh} aria-label="강화 열기" className="group min-w-0 flex flex-col items-center justify-center gap-2 py-3 outline-none focus:outline-none">
                                <span aria-hidden className="relative">
                                  <svg viewBox="0 0 24 24" className="w-6 h-6 text-white/55 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path d={ICON_PATHS.bolt} strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                                <span className="max-w-full truncate text-[12px] font-bold text-white/80 group-hover:text-white transition-colors">강화</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* 스탯 — 두 줄 두 칸. 선은 위 한 줄과 가운데 세로선만. 빙옥은 재화라 뺐다 */}
                        {/* 스탯 — 모바일에서 XP 테이블 · 시뮬레이터를 볼 때는 접는다 (화면이 너무 길어진다) */}
                        <div className={`${deskOverview ? "grid" : "hidden lg:grid"} grid-cols-2 mt-4 pt-2 border-t border-white/10`}>
                          {[
                            { l: "누적 XP", v: (me.xp || 0).toLocaleString() },
                            { l: "오늘 획득", v: `+${todayTotal.toLocaleString()}`, hot: todayTotal > 0 },
                            { l: "누적 출석", v: `${(me.attendCount || 0).toLocaleString()}일` },
                            voiceTracked
                              ? { l: "누적 음성 시간", v: fmtVoiceTime(me.voiceSeconds) }
                              : { l: "누적 음성 시간", v: `${+VOICE_TIME_START.slice(5, 7)}월 ${+VOICE_TIME_START.slice(8, 10)}일부터`, dim: true },
                          ].map((st, i) => (
                            <div key={i} className={`min-w-0 py-3 ${i % 2 === 0 ? "pr-4 border-r border-white/10" : "pl-4"}`}>
                              <p className="text-[11px] font-bold text-white/45 mb-2 truncate">{st.l}</p>
                              <p className={`text-lg font-black tabular-nums tracking-tight leading-none truncate ${st.hot ? "text-[#ff5c77]" : st.dim ? "text-white/30" : "text-white"}`}>
                                {st.v}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* 1회 획득 — 강화 · 등급 · 역할 · 부스트를 다 더한 값(내역은 강화 창). 스탯과 같은 두 칸 */}
                        <div className={`${deskOverview ? "grid" : "hidden lg:grid"} grid-cols-2 border-t border-white/10`}>
                          {[
                            { icon: "chat", l: "채팅 1회", v: `+${gain.chatLo.toLocaleString()}~${gain.chatHi.toLocaleString()}` },
                            { icon: "mic", l: `음성 ${P_voiceMin}분`, v: `+${gain.voice.toLocaleString()}` },
                          ].map((g, i) => (
                            <div key={g.icon} className={`min-w-0 py-3 ${i === 0 ? "pr-4 border-r border-white/10" : "pl-4"}`}>
                              <p className="flex items-center gap-1.5 text-[11px] font-bold text-white/45 mb-2">
                                <svg aria-hidden viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.9">
                                  <path d={ICON_PATHS[g.icon]} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {g.l}
                              </p>
                              <p className="text-lg font-black text-white tabular-nums tracking-tight leading-none truncate">
                                {g.v}<span className="text-[11px] text-white/40 ml-1">XP</span>
                              </p>
                            </div>
                          ))}
                        </div>

                      </div>
                    </div>

                </div>

                {/* 오른쪽 — 퀘스트는 위 한 줄 전체(내용이 잘리지 않게), 목록 둘은 아래에 반씩 */}
                <div className="contents lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-14 lg:col-span-8 lg:items-start min-w-0">
                    {/* 모바일 — 아래로 길게 늘어놓지 않고 아이콘으로 골라 하나씩 본다 */}
                    <nav ref={mNavRef} aria-label="대시보드 섹션" className={`lg:hidden sticky top-14 md:top-[60px] z-30 -mx-5 px-5 md:-mx-8 md:px-8 border-b border-[#ededed] transition-colors ${mNavStuck ? "bg-white" : "bg-transparent"}`}>
                      <div className="grid grid-flow-col auto-cols-fr">
                        {mobSecs.map((x) => {
                          const on = mSecOn === x.k;
                          return (
                            <button
                              key={x.k}
                              onClick={() => pickSec(x.k)}
                              aria-pressed={on}
                              className={`relative flex flex-col items-center justify-center gap-1 h-14 outline-none focus:outline-none transition-colors ${on ? "text-[#131313]" : "text-[#a3a3a3]"}`}
                            >
                              <span aria-hidden className="relative">
                                <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <path d={ICON_PATHS[x.icon]} strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {x.n > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{x.n}</span>}
                              </span>
                              <span className="text-[11px] font-bold">{x.l}</span>
                              {on && <span aria-hidden className="absolute left-4 right-4 bottom-0 h-[2px] rounded-full bg-[#e91e3f]"></span>}
                            </button>
                          );
                        })}
                      </div>
                    </nav>

                    {/* PC 카테고리 — 사이트 공통 밑줄 탭. 모바일은 위 아이콘 줄이 같은 일을 한다 */}
                    <div role="tablist" aria-label="대시보드 카테고리" className="hidden lg:flex lg:col-span-2 lg:-mb-6 border-b border-[#ededed]">
                      {[{ k: "quest", l: "현황" }, { k: "table", l: "XP 테이블" }, { k: "sim", l: "시뮬레이터" }].map((t) => {
                        const on = t.k === "quest" ? deskOverview : mSecOn === t.k;
                        return (
                          <button key={t.k} type="button" role="tab" aria-selected={on} onClick={() => { setMSec(t.k); playTone(620, 0.04, "sine", 0.025); }}
                            className={`relative py-3 mr-7 text-[15px] font-extrabold transition-colors outline-none focus-visible:text-[#131313] ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                            {t.l}
                            {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* 일일 퀘스트 — 출석(봇 지급) + 관리자가 정의한 퀘스트(원클릭 수령) */}
                    <section className={`${secCls("quest")} lg:col-span-2`}>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">퀘스트</h3>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-[#131313] tabular-nums leading-none">
                            {questDone}<span className="text-[#a3a3a3]"> / {questTotal}</span>
                          </p>
                          <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mt-1">Complete</p>
                        </div>
                      </div>

                      {/* 주기 탭 */}
                      <div className="flex gap-2 mb-5">
                        {[
                          { v: "daily", l: "일일" },
                          { v: "weekly", l: "주간" },
                          { v: "monthly", l: "월간" },
                        ].map((t) => {
                          const on = questPeriod === t.v;
                          const n = claimableBy[t.v];
                          return (
                            <button
                              key={t.v}
                              onClick={() => setQuestPeriod(t.v)}
                              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
                                on ? "bg-[#131313] text-white" : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08] hover:text-[#131313]"
                              }`}
                            >
                              {t.l}
                              {n > 0 && (
                                <span className={`inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-black ${on ? "bg-[#e91e3f] text-white" : "bg-[#e91e3f] text-white"}`}>{n}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* 전체 달성률 */}
                      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mb-1.5">
                        <div className="h-full rounded-full bg-[#e91e3f] transition-[width] duration-700" style={{ width: `${questPct}%` }}></div>
                      </div>
                      <p className="text-[10px] font-bold text-[#a3a3a3] mb-5">
                        {questClaimable > 0
                          ? <span className="text-[#e91e3f]">받을 수 있는 보상 {questClaimable}개</span>
                          : questTotal > 0 && questDone === questTotal
                          ? "이 주기의 퀘스트를 모두 마쳤습니다"
                          : questPeriod === "monthly"
                          ? questRotates ? "매월 1일(KST)에 새 퀘스트로 교체됩니다" : "매월 1일(KST)에 초기화됩니다"
                          : questPeriod === "weekly"
                          ? questRotates ? "매주 월요일(KST)에 새 퀘스트로 교체됩니다" : "매주 월요일(KST)에 초기화됩니다"
                          : questRotates ? "매일 자정(KST)에 새 퀘스트로 교체됩니다" : "매일 자정(KST)에 초기화됩니다"}
                      </p>

                      {/* 퀘스트 로그 — 카드 하나가 곧 하나의 임무 */}
                      {questRows.map((q) => {
                        const pct = Math.min(100, Math.round((q.current / Math.max(1, q.target)) * 100));
                        const unit = q.metric === "xp" ? " XP" : q.metric === "minute" ? "분" : "회";
                        const done = q.done;
                        // POINT 보상은 나중에 서버에 실린 값이라 없을 수도 있다 — 없으면 0 으로 본다
                        const rXp = Number(q.rewardXp) || 0;
                        const rPoint = Number(q.rewardPoint) || 0;
                        return (
                          <div
                            key={q.id}
                            className={`relative overflow-hidden rounded-2xl border mb-3 transition-all ${
                              q.claimable
                                ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.05] shadow-[0_14px_36px_-22px_rgba(233,30,63,0.75)]"
                                : q.claimed
                                ? "border-black/[0.07] bg-black/[0.02]"
                                : "border-black/[0.09] bg-white"
                            }`}
                          >
                            {/* 수령 가능하면 좌측에 붉은 레일 */}
                            {q.claimable && <span aria-hidden className="absolute left-0 top-0 bottom-0 w-1 bg-[#e91e3f]"></span>}

                            <div className="relative flex items-center gap-4 px-4 sm:px-5 py-4">
                              {/* 임무 인장 — 달성하면 채워진다 */}
                              <span
                                aria-hidden
                                className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${
                                  q.claimed
                                    ? "bg-emerald-600/10"
                                    : done
                                    ? "bg-emerald-600"
                                    : "bg-black/[0.05]"
                                }`}
                              >
                                {q.claimed ? (
                                  <svg viewBox="0 0 20 20" className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : done ? (
                                  <svg viewBox="0 0 20 20" className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="3">
                                    <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                ) : (
                                  <span className="text-[13px] font-black text-[#a3a3a3] tabular-nums">{pct}%</span>
                                )}
                              </span>

                              {/* 임무 내용 */}
                              <div className="min-w-0 flex-1">
                                <p className={`text-[14px] font-black tracking-tight truncate ${q.claimed ? "text-[#a3a3a3]" : "text-[#131313]"}`}>{q.name}</p>
                                {q.desc && <p className="text-[11px] text-[#a3a3a3] mt-1 truncate">{q.desc}</p>}

                                {/* 진행 게이지 */}
                                <div className="flex items-center gap-2.5 mt-2.5">
                                  <div className="flex-1 h-2 rounded-full bg-black/[0.07] overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-[width] duration-700 ${done ? "bg-emerald-600" : "bg-[#131313]/50"}`}
                                      style={{ width: `${pct}%` }}
                                    ></div>
                                  </div>
                                  <span className="shrink-0 text-[10px] font-black text-[#8a8a8a] tabular-nums">
                                    {q.current.toLocaleString()}/{q.target.toLocaleString()}{unit}
                                  </span>
                                </div>
                              </div>

                              {/* 보상 → 수령 — 오른쪽에 세로로 쌓아 "얼마를 · 받는다" 순으로 읽히게 한다 */}
                              <div className="shrink-0 flex flex-col items-end text-right">
                                {/* XP 자리는 그대로 두고 POINT 만 옆에 붙인다 (가로 flex 라 gap 이 먹는다) */}
                                {(rXp > 0 || rPoint > 0) && (
                                  <span className="flex items-baseline gap-2.5">
                                    {rXp > 0 && (
                                      <span className={`text-[15px] font-black tabular-nums leading-none ${q.claimed ? "text-[#a3a3a3]" : "text-[#e91e3f]"}`}>
                                        +{rXp.toLocaleString()}
                                        <span className={`text-[10px] font-bold ml-1 ${q.claimed ? "text-[#a3a3a3]" : "text-[#a3a3a3]"}`}>XP</span>
                                      </span>
                                    )}
                                    {rPoint > 0 && (
                                      <span className={`text-[15px] font-black tabular-nums leading-none ${q.claimed ? "text-[#a3a3a3]" : "text-[#3f9e93]"}`}>
                                        +{rPoint.toLocaleString()}
                                        <span className={`text-[10px] font-bold ml-1 ${q.claimed ? "text-[#a3a3a3]" : "text-[#a3a3a3]"}`}>빙옥</span>
                                      </span>
                                    )}
                                  </span>
                                )}
                                <div className={rXp > 0 || rPoint > 0 ? "mt-2.5" : ""}>
                                  {q.claimable ? (
                                    <button
                                      onClick={() => claimQuest(q)}
                                      disabled={claiming === q.id}
                                      className="px-4 sm:px-5 py-2.5 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-60 text-white text-[12px] font-black transition-colors outline-none focus:outline-none shadow-[0_8px_20px_-10px_rgba(233,30,63,0.9)]"
                                    >
                                      {claiming === q.id ? "…" : "받기"}
                                    </button>
                                  ) : q.claimed ? (
                                    <span className="text-[11px] font-black text-emerald-700">완료</span>
                                  ) : done ? (
                                    /* 자동 지급 퀘스트는 달성 직후 봇이 준다 — 잠깐 뜨는 상태 */
                                    <span className="text-[11px] font-black text-emerald-700">{q.auto ? "지급 중" : "달성"}</span>
                                  ) : q.auto ? (
                                    <span className="text-[11px] font-bold text-[#a3a3a3]">자동 지급</span>
                                  ) : (
                                    <span className="text-[11px] font-bold text-[#a3a3a3]">진행 중</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}


                      {/* 관리자가 아직 퀘스트를 등록하지 않은 상태 */}
                      {quests && questRows.length <= (questPeriod === "daily" ? 1 : 0) && (
                        <EmptySlot>{questPeriod === "daily" ? "추가 퀘스트가 없습니다 — 출석 보상만 진행됩니다" : "등록된 퀘스트가 없습니다"}</EmptySlot>
                      )}

                      {/* 화면에 적힌 POINT 는 배율 적용 전 기본값이라 실제 지급액과 다르다 */}
                      {questRows.some((q) => Number(q.rewardPoint) > 0) && (
                        <p className="text-[10px] text-[#a3a3a3] mt-3 break-keep">빙옥은 등급에 따라 더 받습니다.</p>
                      )}

                      {/* 지급 안내 — 보상은 봇 대기열을 거치므로 즉시가 아닐 수 있다 */}
                      {questRows.some((q) => q.claimed) && (
                        <p className="text-[10px] text-[#a3a3a3] mt-3 break-keep">수령한 보상은 잠시 뒤 XP에 반영됩니다.</p>
                      )}

                      <div className={`${questPeriod === "daily" ? "flex" : "hidden"} items-center justify-between border-t border-black/[0.08] mt-5 pt-4`}>
                        <span className="text-[11px] font-bold text-[#8a8a8a]">누적 출석 <b className="text-[#131313] tabular-nums">{(me.attendCount || 0).toLocaleString()}일</b></span>
                        <span className="text-[11px] font-bold text-[#8a8a8a]">마지막 <b className="text-[#131313] tabular-nums">{me.lastAttendDate ? me.lastAttendDate.replace(/-/g, ".") : "—"}</b></span>
                      </div>
                    </section>

                    {/* 아래 왼쪽 — 서버 랭킹 */}
                    {/* 랭킹 묶음 — 현황이 아닐 때는 빈 틀도 숨긴다 */}
                    <div className={`contents ${deskOverview ? "lg:block" : "lg:hidden"} min-w-0`}>
                    {/* 서버 랭킹 */}
                    <section className={secCls("rank")}>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">서버 랭킹 <span className="text-xs font-bold text-[#a3a3a3] ml-1">TOP 10</span></h3>
                        </div>
                        <span className="flex items-center gap-3">
                          {["all", "month"].map((k) => (
                            <button key={k} onClick={() => setLbTab(k)} className={`text-[11px] font-black transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-[#131313] border-b-2 border-[#e91e3f]" : "text-[#a3a3a3] hover:text-[#5a5a5a]"}`}>{k === "all" ? "누적" : "이번 달"}</button>
                          ))}
                          {/* 전체 순위는 랭킹 탭에서 — 여기는 TOP 10 만 */}
                          <button
                            onClick={() => { setRankMode(lbTab); setRankPage(0); setActiveMainTab("rank"); }}
                            className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                          >
                            전체 보기 →
                          </button>
                        </span>
                      </div>
                      {!lb[lbTab] ? (
                        <div className="py-10 text-center text-[11px] font-bold text-[#a3a3a3]">불러오는 중…</div>
                      ) : !lb[lbTab].data?.length ? (
                        <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                      ) : (
                        <RankRows rows={lb[lbTab].data} myId={session.user.id} me={lbTab === "all" ? me : null} myName={session.user.name} />
                      )}
                      {lbTab === "month" && <p className="text-[10px] text-[#a3a3a3] mt-2.5">이번 달 지급 로그 합산 기준 · 매월 1일(KST) 초기화</p>}
                    </section>
                    </div>

                    {/* 아래 오른쪽 — 획득 피드 · 이벤트 */}
                    {/* 피드 · 이벤트 묶음 — 현황이 아닐 때는 빈 틀도 숨긴다 (남겨 두면 빈 줄 하나만큼 간격이 벌어진다) */}
                    <div className={`contents ${deskOverview ? "lg:block" : "lg:hidden"} lg:space-y-14 min-w-0`}>
                    {/* 획득 피드 — 최근 5건만, 줄을 낮게 */}
                    <section className={secCls("feed")}>
                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">획득 피드</h3>
                        </div>
                        <span className="flex items-center gap-1.5"><LiveDot /><span className="text-[10px] font-bold text-[#a3a3a3] tabular-nums">{myLogs?.logs?.length || 0}건</span></span>
                      </div>
                      {myLogs?.logs?.length ? (
                        <>
                          <div className="border-t border-black/[0.08]">
                            {(feedOpen ? myLogs.logs : myLogs.logs.slice(0, 5)).map((l, i) => (
                              <div key={`${l.createdAt}-${i}`} className="flex items-center h-10 gap-3 border-b border-black/[0.05]">
                                <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: REASON_COLORS[l.reason] || "#6b7280" }}></span>
                                <span className="shrink-0 w-16 text-[13px] font-black text-[#131313] tabular-nums">+{(l.amount || 0).toLocaleString()}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#8a8a8a]">{l.channelName || (l.reason === "attend" ? "출석 체크" : REASON_LABELS[l.reason] || "—")}</span>
                                <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums">{fmtRel(l.createdAt)}</span>
                              </div>
                            ))}
                          </div>
                          {(myLogs.logs.length > 5) && (
                            <button onClick={() => setFeedOpen((v) => !v)} className="block w-full text-center text-[11px] font-bold text-[#a3a3a3] hover:text-[#131313] transition-colors mt-3.5 outline-none focus:outline-none">
                              {feedOpen ? "접기 ↑" : `전체 ${myLogs.logs.length}건 보기 ↓`}
                            </button>
                          )}
                        </>
                      ) : (
                        <EmptySlot>기록 없음 — 첫 활동을 시작하세요</EmptySlot>
                      )}
                    </section>

                    {/* 진행 중 이벤트 */}
                    {events.length > 0 && (
                      <section className={secCls("event")}>
                        <div className="flex items-end justify-between mb-4">
                          <div>
                            <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">진행 중 이벤트</h3>
                          </div>
                          <Link href="/event" className="text-[11px] font-bold text-[#a3a3a3] hover:text-[#e91e3f] transition-colors">전체 →</Link>
                        </div>
                        <div className="border-t border-black/[0.08]">
                          {events.map((ev) => (
                            <Link key={ev._id} href="/event" className="group flex items-center min-h-[44px] py-1.5 gap-3 border-b border-black/[0.05] hover:bg-black/[0.02] transition-colors">
                              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#5a5a5a] group-hover:text-[#131313] transition-colors">{ev.title}</span>
                              {ev.eventPeriod && <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3]">{ev.eventPeriod}</span>}
                              <span className="shrink-0 text-[#a3a3a3] group-hover:text-[#e91e3f] transition-colors">→</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}

                    </div>

                    {/* XP 테이블 · 시뮬레이터 — 예전엔 탭, 이제 대시보드 카테고리. 왼쪽 카드와 나란히 오른쪽 8칸 */}
                    <section className={`${mSecOn === "table" ? "block" : "hidden"} lg:col-span-2 min-w-0`}>
                      <XpTableView myLevel={me?.level || 0} myXp={me?.xp ?? null} onTone={() => playTone(620, 0.04, "sine", 0.025)} />
                    </section>
                    <section className={`${mSecOn === "sim" ? "block" : "hidden"} lg:col-span-2 min-w-0`}>
                      <XpSimulator me={me} P={P} ready={!!policy} onTone={() => playTone(620, 0.04, "sine", 0.025)} />
                    </section>
                </div>
              </div>
            )}

            {/* ── 로그인했지만 조회 실패 ── */}
            {authReady && session?.user && meLoaded && !me && (
              <div className="py-16 text-center">
                <p className="text-sm text-[#5a5a5a] mb-5">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
                <button onClick={() => loadMe()} className="px-6 py-2.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-xs font-bold rounded-full transition-colors outline-none focus:outline-none">다시 시도</button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB : INTRO ══════════════════ */}
        {/* 📌 시스템 안내 — 한눈에 읽히는 안내판 (app/level/SystemGuide). 숫자는 모두 지금 설정값에서 읽는다 */}
        {activeMainTab === "intro" && (
          <div>
            <SectionHeader title="시스템 안내" />
            <SystemGuide
              P={P}
              chatBase={P_chatBase}
              chatCooldownLabel={P_chatCooldownLabel}
              voiceMin={P_voiceMin}
              policy={policy}
              pass={pass}
              passEnabled={passEnabled}
              enhOpen={enhOpen}
              canSeeShop={canSeeShop}
              seasonDday={seasonDday}
              me={me}
              tierIdx={tierIdx}
            />
          </div>
        )}

        {/* ══ TAB : RANKING ════════════════ */}
        {activeMainTab === "rank" && (
          <Reveal>
            <SectionHeader
              title="서버 랭킹"
              right={
                <span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">
                  {rankTotal.toLocaleString()}명
                </span>
              }
            />

            {/* 기준 — 누적 / 이번 달 / 음성 시간 */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-bar mb-6">
              {RANK_MODES.map((m) => {
                const on = rankMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setRankMode(m.id); setRankPage(0); playTone(620, 0.04, "sine", 0.025); }}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
                      on
                        ? "bg-[#131313] text-white"
                        : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08] hover:text-[#131313]"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {rankLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[52px] rounded-lg bg-black/[0.04] animate-pulse"></div>
                ))}
              </div>
            ) : rankRows.length === 0 ? (
              <EmptySlot>
                {rankMode === "voice"
                  ? `누적 음성 시간은 ${+VOICE_TIME_START.slice(5, 7)}월 ${+VOICE_TIME_START.slice(8, 10)}일부터 집계됩니다`
                  : rankMode === "month"
                  ? "이번 달 획득 기록이 아직 없습니다"
                  : "아직 기록이 없습니다"}
              </EmptySlot>
            ) : (
              <>
                {/* 시상대 — 1~3위를 프로필 사진으로 크게. 첫 페이지에서만 나온다.
                    가운데가 1위, 왼쪽 2위, 오른쪽 3위. 단상 높이로 순위를 한 번 더 말한다. */}
                {rankPage === 0 && rankRows.length >= 3 && (
                  <div className="relative mb-10 pt-6">
                    {/* 1위 뒤에서 번지는 빛 */}
                    <div
                      aria-hidden
                      className="absolute top-0 left-1/2 -translate-x-1/2 w-[420px] h-[240px] rounded-full blur-[90px] pointer-events-none"
                      style={{ background: "rgba(233,30,63,0.16)" }}
                    ></div>

                    <div className="relative grid grid-cols-3 gap-2 sm:gap-5 items-end">
                      {[rankRows[1], rankRows[0], rankRows[2]].map((r) => {
                        const first = r.rank === 1;
                        const c = r.rank === 1 ? "#e91e3f" : r.rank === 2 ? "#8a8a8a" : "#a06a3c";
                        const isMe = r.userId === session?.user?.id;
                        const tier = VOICE_TIERS[getTierIndex(r.level || 0)];
                        const pedestal = first ? "h-16 sm:h-24" : r.rank === 2 ? "h-10 sm:h-16" : "h-7 sm:h-11";
                        return (
                          <div key={r.userId} className="flex flex-col items-center text-center min-w-0">
                            {/* 1위 왕관 */}
                            {first && (
                              <svg aria-hidden viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7 mb-1.5" fill="#e91e3f">
                                <path d="M3 8.5 7 12l5-7 5 7 4-3.5-1.8 10H4.8Z" />
                                <rect x="4.6" y="19" width="14.8" height="2.2" rx="1.1" />
                              </svg>
                            )}

                            <span className="relative shrink-0">
                              <span
                                className={`block rounded-full overflow-hidden ${first ? "w-20 h-20 sm:w-28 sm:h-28" : "w-14 h-14 sm:w-20 sm:h-20"}`}
                                style={{ boxShadow: `0 0 0 3px ${c}, 0 18px 36px -16px ${c}` }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={r.avatar || ""} alt="" className="w-full h-full object-cover bg-[#e0e0e0]" />
                              </span>
                              {/* 순위는 원에 겹쳐 붙인다 — 따로 두면 원 크기가 달라 높이가 어긋난다 */}
                              <span
                                className={`absolute left-1/2 -translate-x-1/2 -bottom-2 inline-flex items-center justify-center rounded-full text-white font-black tabular-nums ring-2 ring-[#ffffff] ${first ? "w-7 h-7 text-[13px]" : "w-6 h-6 text-[11px]"}`}
                                style={{ backgroundColor: c }}
                              >
                                {r.rank}
                              </span>
                            </span>

                            <p className={`mt-5 w-full truncate font-black ${first ? "text-[14px] sm:text-[15px]" : "text-[12px] sm:text-[13px]"} ${isMe ? "text-[#e91e3f]" : "text-[#131313]"}`}>
                              {r.name}
                            </p>

                            {/* 등급 — 레벨에서 바로 나온다 */}
                            <span className="inline-flex items-center gap-1 mt-1.5">
                              <TierEmblem tier={tier} size={12} />
                              <span className="text-[10px] font-black" style={{ color: tier.c }}>{tier.name}</span>
                            </span>

                            <p className={`font-black text-[#131313] tabular-nums mt-2 ${first ? "text-[15px]" : "text-[12px]"}`}>
                              {rankMode === "voice" ? fmtVoiceTime(r.voiceSeconds) : `${(r.xp || 0).toLocaleString()} XP`}
                            </p>

                            {/* 단상 */}
                            <div
                              className={`w-full mt-3 rounded-t-xl ${pedestal}`}
                              style={{ background: `linear-gradient(180deg, ${c}2e, ${c}08)`, boxShadow: `inset 0 1px 0 ${c}55` }}
                            ></div>
                          </div>
                        );
                      })}
                    </div>
                    <div aria-hidden className="relative h-px bg-black/[0.10]"></div>
                  </div>
                )}

                <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                  {(rankPage === 0 && rankRows.length >= 3 ? rankRows.slice(3) : rankRows).map((r) => {
                    const isMe = me && r.userId === session?.user?.id;
                    const medal = r.rank <= 3;
                    return (
                      <div
                        key={r.userId}
                        className={`flex items-center gap-3.5 py-3.5 transition-colors ${isMe ? "bg-[#e91e3f]/[0.05]" : ""}`}
                      >
                        {/* 순위 */}
                        <span
                          className={`shrink-0 w-9 text-center tabular-nums ${
                            medal ? "text-[15px] font-black text-[#e91e3f]" : "text-[13px] font-black text-[#a3a3a3]"
                          }`}
                        >
                          {r.rank}
                        </span>

                        {/* 이름 · 레벨 */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-[13px] font-black truncate ${isMe ? "text-[#e91e3f]" : "text-[#131313]"}`}>
                            {r.name}
                            {isMe && <span className="text-[10px] font-black text-[#e91e3f]/70 ml-1.5">나</span>}
                          </p>
                          <p className="text-[11px] text-[#a3a3a3] tabular-nums mt-0.5">Lv.{r.level ?? 0}</p>
                        </div>

                        {/* 값 */}
                        <span className="shrink-0 text-[13px] font-black text-[#131313] tabular-nums">
                          {rankMode === "voice"
                            ? fmtVoiceTime(r.voiceSeconds)
                            : `${(r.xp || 0).toLocaleString()} XP`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 페이지 — 옆으로 넘겨 다음 순위를 본다 */}
                {rankPages > 1 && (
                  <div className="flex items-center justify-between gap-4 mt-6">
                    <button
                      onClick={() => { setRankPage((p) => Math.max(0, p - 1)); playTone(560, 0.04, "sine", 0.025); }}
                      disabled={rankPage === 0}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-30 disabled:cursor-default bg-black/[0.04] text-[#5a5a5a] enabled:hover:bg-black/[0.08] enabled:hover:text-[#131313]"
                    >
                      <span aria-hidden>←</span> 이전
                    </button>

                    <span className="text-[12px] font-black text-[#8a8a8a] tabular-nums">
                      {rankPage + 1} <span className="text-[#a3a3a3]">/ {rankPages}</span>
                    </span>

                    <button
                      onClick={() => { setRankPage((p) => Math.min(rankPages - 1, p + 1)); playTone(680, 0.04, "sine", 0.025); }}
                      disabled={rankPage >= rankPages - 1}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-30 disabled:cursor-default bg-black/[0.04] text-[#5a5a5a] enabled:hover:bg-black/[0.08] enabled:hover:text-[#131313]"
                    >
                      다음 <span aria-hidden>→</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {rankMode === "month" && (
              <p className="text-[11px] text-[#a3a3a3] mt-5 break-keep">
                지급 기록은 60일간 보관됩니다.
              </p>
            )}
          </Reveal>
        )}

        {/* ══ TAB : POLICY ═════════════════ */}
      </div>

      {/* 토스트 — XP 획득/레벨업/동기화 피드백 (모바일 하단바 위로 띄움) */}
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{ animation: "toastIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}
            className={`mt-2 px-5 py-3 rounded-2xl border text-xs font-bold shadow-2xl backdrop-blur-md text-right ${t.accent ? "bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_10px_30px_rgba(233,30,63,0.45)]" : "bg-white/95 border-black/10 text-[#131313] shadow-xl"}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}
