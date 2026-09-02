"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import ArcticShopBody from "../shop/ArcticShopBody";
import { isAdminName } from "@/lib/admins";
import {
  HudPanel, HudSection, HudStyles, LiveDot, RingGauge, SegBar,
  StatusChip, SegLadder, TickRuler, RankRows, EmptySlot,
} from "../components/Hud";
import { SEASON, getSeasonProgress, isVoiceTimeTracked, VOICE_TIME_START } from "@/lib/season";
import { VOICE_TIERS, TIER_COLORS, getTierIndex, getVoiceBonus, tierRangeLabel } from "@/lib/voiceTiers";
import { getCumulativeXpByLevel, getLevelByXp } from "@/lib/leveling";
import TierEmblem from "../components/TierEmblem";

const DISCORD_URL = "https://discord.gg/V2uW2nUczU";
const INV_CAT = { perk: "특전", title: "칭호", notify: "알림", etc: "기타" };

// 인벤토리 행의 보조 한 줄 — 어디서 온 것인지 / 어떤 조건인지
const invSubLabel = (it) => {
  if (it.description) return it.description;
  if (it.kind === "physical") return "실물 상품";
  if (it.source === "level") return it.rewardLevel != null ? `레벨 보상 · Lv.${it.rewardLevel} 도달` : "레벨 보상";
  if (it.source === "inventory") return INV_CAT[it.category] || "특전";
  if (it.source === "shop") return it.days > 0 ? `상점 · ${it.days}일 이용권` : "상점 · 영구 보유";
  return "운영진 지급";
};

// 분류 탭 — 실제로 가진 것만 만든다 (빈 탭을 띄우지 않는다)
const invGroupOf = (it) => {
  if (it.kind === "physical") return { id: "physical", label: "실물" };
  if (it.source === "level") return { id: "level", label: "레벨 보상" };
  if (it.source === "shop") return { id: "shop", label: "상점" };
  if (it.source === "inventory") {
    const c = it.category || "etc";
    return { id: c, label: INV_CAT[c] || "기타" };
  }
  return { id: "grant", label: "지급" };
};
const ICE = "#3f83b8"; // ARCTIC 동선 전용 아이스 틴트

// 📌 메인 탭 — ARCTIC 은 /shop 과 같은 본문(ArcticShopBody)을 탭 안에서 그린다.
//    탭이 URL(?tab=)에 남아야 상점 링크가 이 탭을 바로 가리킬 수 있다.
const MAIN_TABS = [
  { id: "my", name: "내 대시보드" },
  { id: "intro", name: "시스템 안내" },
  { id: "arctic", name: "ARCTIC", shopOnly: true },
  { id: "rank", name: "랭킹" },
  { id: "table", name: "XP 테이블" },
  { id: "sim", name: "시뮬레이터" },
];
// 내전 채널은 기본 음성 XP에 더하는 게 아니라 통째로 대체한다 (bot/src/config.js policy.scrimBaseXp)
// SCRIM_CHANNEL_IDS 가 비어 있으면 봇이 내전 채널을 인식하지 못해 실제로는 적용되지 않는다.
const SCRIM_BASE_XP = 3500;

// 📌 랭킹 기준 — 누적 XP / 이번 달 획득 / 누적 음성 시간
const RANK_MODES = [
  { id: "all", label: "누적" },
  { id: "month", label: "이번 달" },
  { id: "voice", label: "음성 시간" },
];
const RANK_PAGE_SIZE = 20;

// 📌 시스템 안내 = 6단계 튜토리얼. 한 번에 한 단계만 보여주고 하단에서 이어 간다.
//    번호는 권장 순서일 뿐이라 알약을 눌러 바로 건너뛸 수도 있다.
const INTRO_STEPS = [
  { id: "overview", no: "01", label: "한눈에" },
  { id: "earn", no: "02", label: "모으기" },
  { id: "grow", no: "03", label: "레벨·등급" },
  { id: "claim", no: "04", label: "받기" },
  { id: "rules", no: "05", label: "규칙·시즌" },
];

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
const SectionHeader = ({ en, title, desc, right }) => (
  <div className="mb-8">
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5">
          <span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>{en}
        </span>
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
const playTone = (freq = 880, dur = 0.12, type = "sine", vol = 0.04) => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!playTone.ctx) playTone.ctx = new Ctx();
    const ctx = playTone.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {}
};
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
const REASON_COLORS = { chat: "#a8adb8", voice: "#6fa8c4", attend: "#e91e3f" };
const REASON_LABELS = { chat: "채팅", voice: "음성", attend: "출석" };

// 누적 음성 참여 시간 — 한 시간을 넘기면 시간 단위로, 그 전에는 분 단위로 읽는다
const fmtVoiceTime = (sec) => {
  const min = Math.floor((sec || 0) / 60);
  if (min < 60) return `${min}분`;
  return `${Math.floor(min / 60).toLocaleString()}시간`;
};

// 음성 티어 경계·이름·색은 lib/voiceTiers.js 단일 소스 (봇 지급표와 1:1)

// 📌 레벨 성장 곡선 — 이 페이지의 시그니처. Lv 1~1000 누적 XP를 곡선으로 그리고,
//    마우스/터치를 따라 임의 레벨의 누적·필요 XP를 실시간으로 읽어준다.
//    myLevel이 있으면(로그인) 곡선 위에 'YOU' 마커로 내 위치를 표시한다.
const LevelCurve = ({ myLevel = null }) => {
  const boxRef = useRef(null);
  const [probe, setProbe] = useState(null); // { lv }
  const W = 800, H = 300, PB = 34, PT = 14;
  const maxXp = getCumulativeXpByLevel(1000);
  const X = (lv) => (lv / 1000) * W;
  const Y = (xp) => H - PB - (xp / maxXp) * (H - PB - PT);

  const path = useMemo(() => {
    let d = "";
    for (let lv = 1; lv <= 1000; lv += 5) d += `${d ? "L" : "M"}${X(lv).toFixed(1)},${Y(getCumulativeXpByLevel(lv)).toFixed(1)}`;
    d += `L${X(1000).toFixed(1)},${Y(maxXp).toFixed(1)}`;
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const milestones = [100, 250, 500, 750, 1000];
  const hasMe = typeof myLevel === "number" && myLevel > 0;
  const lv = probe?.lv ?? (hasMe ? myLevel : 1000);
  const cum = getCumulativeXpByLevel(lv);
  const req = lv <= 1 ? 0 : cum - getCumulativeXpByLevel(lv - 1);
  const modeLabel = probe ? "탐색 중" : hasMe ? "내 위치" : "MAX";

  const onMove = (e) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const ratio = Math.min(Math.max((cx - rect.left) / rect.width, 0), 1);
    setProbe({ lv: Math.max(1, Math.round(ratio * 1000)) });
  };

  return (
    <div>
      {/* 판독값 — 곡선 위 어느 지점이든 짚으면 갱신 */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-black tracking-[0.3em] text-[#a3a3a3] uppercase mb-1.5">Growth Curve · Lv 1 → 1,000</p>
          <p className="text-3xl md:text-4xl font-black text-[#131313] tracking-tight tabular-nums">
            Lv {lv.toLocaleString()}
            <span className={`ml-2 text-xs font-bold align-middle ${probe ? "text-[#e91e3f]" : hasMe ? "text-[#131313]" : "text-[#a3a3a3]"}`}>{modeLabel}</span>
          </p>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase mb-1">누적 XP</p>
            <p className="text-base md:text-lg font-black text-[#e91e3f] tabular-nums">{cum.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-black tracking-[0.25em] text-[#a3a3a3] uppercase mb-1">이 레벨 필요 XP</p>
            <p className="text-base md:text-lg font-black text-[#131313] tabular-nums">{req.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div
        ref={boxRef}
        className="relative cursor-crosshair select-none touch-none"
        onMouseMove={onMove}
        onTouchStart={onMove}
        onTouchMove={onMove}
        onMouseLeave={() => setProbe(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52 md:h-72 overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="lvFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e91e3f" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#e91e3f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 가로 눈금 */}
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} x1="0" x2={W} y1={PT + (H - PB - PT) * r} y2={PT + (H - PB - PT) * r} stroke="rgba(0,0,0,0.05)" strokeWidth="1" />
          ))}
          <polygon points={`0,${H - PB} ${path.replace(/[ML]/g, " ").trim()} ${W},${H - PB}`} fill="url(#lvFill)" />
          <path d={path} fill="none" stroke="#e91e3f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 8px rgba(233,30,63,0.5))" }} />
          {/* 마일스톤 */}
          {milestones.map((m) => (
            <g key={m}>
              <circle cx={X(m)} cy={Y(getCumulativeXpByLevel(m))} r="3.5" fill="#f5f3f0" stroke="#e91e3f" strokeWidth="2" />
              <text x={X(m)} y={H - PB + 20} textAnchor={m === 1000 ? "end" : "middle"} fill="rgba(0,0,0,0.35)" fontSize="11" fontWeight="800">{m}</text>
            </g>
          ))}
          {/* 내 위치(YOU) 마커 — 로그인 시 실데이터 연동 */}
          {hasMe && (
            <g>
              <line x1={X(myLevel)} x2={X(myLevel)} y1={Y(getCumulativeXpByLevel(myLevel))} y2={H - PB} stroke="rgba(0,0,0,0.25)" strokeWidth="1" strokeDasharray="2 4" />
              <circle cx={X(myLevel)} cy={Y(getCumulativeXpByLevel(myLevel))} r="5" fill="#ffffff" stroke="#e91e3f" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 8px rgba(233,30,63,0.35))" }} />
              <text
                x={Math.min(Math.max(X(myLevel), 30), W - 30)}
                y={Math.max(Y(getCumulativeXpByLevel(myLevel)) - 14, 12)}
                textAnchor="middle" fill="#e91e3f" stroke="#f5f3f0" strokeWidth="3" paintOrder="stroke" fontSize="11" fontWeight="900" letterSpacing="1"
              >YOU</text>
            </g>
          )}
          {/* 프로브(탐색) 라인 */}
          {probe && (
            <g>
              <line x1={X(lv)} x2={X(lv)} y1={PT} y2={H - PB} stroke="rgba(233,30,63,0.4)" strokeWidth="1" strokeDasharray="3 4" />
              <circle cx={X(lv)} cy={Y(cum)} r="5" fill="#e91e3f" style={{ filter: "drop-shadow(0 0 10px rgba(233,30,63,0.9))" }} />
            </g>
          )}
          {/* 바닥 축 */}
          <line x1="0" x2={W} y1={H - PB} y2={H - PB} stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
};

// 📌 등급 안내 모달 — 잉크 패널 위에 등급 사다리를 세운다.
//    현재 등급은 좌측 레일과 은은한 글로우로 표시하고, 나머지는 조용히 둔다.
const TierModal = ({ open, onClose, level, baseXp, intervalMin = 5 }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
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
              <p className="text-[9px] font-black tracking-[0.35em] text-white/35 uppercase mb-2">Rank Ladder</p>
              <h3 className="text-2xl font-black text-white tracking-tight">등급 안내</h3>
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 w-9 h-9 rounded-full border border-white/12 text-white/50 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center outline-none focus:outline-none"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" /></svg>
            </button>
          </div>
          <p className="text-[12px] text-white/45 leading-relaxed mt-3 break-keep">
            레벨이 오르면 등급이 올라가고, <b className="text-white/75">음성 채널에서 받는 XP에 아래 금액이 더해집니다.</b>
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
          <p className="text-[11px] text-white/35 leading-relaxed break-keep">
            음성 {intervalMin}분당 기본 {baseXp.toLocaleString()} XP 위에 더해지는 금액입니다 — 채팅 XP에는 적용되지 않습니다.
            역할·채널 부스트가 있으면 여기에 더 붙습니다.
          </p>
        </div>
      </div>
    </div>
  );
};

// 📌 아이템 아이콘 — 종류가 한눈에 갈리도록 모양을 나눈다.
//    부스트류는 이름으로 가른다 (상품명·역할명에 Boost/부스트가 들어간다).
const invIconKind = (it) => {
  const n = `${it.name || ""} ${it.description || ""}`.toLowerCase();
  if (/boost|부스트/.test(n)) return "boost";
  if (it.kind === "physical") return "box";
  if (it.category === "notify") return "bell";
  if (it.category === "title") return "title";
  if (it.source === "level") return "medal";
  return "shield";
};

const InvIcon = ({ it, size = 24, color = "#fff", dim = false }) => {
  const k = invIconKind(it);
  const c = dim ? "rgba(255,255,255,0.3)" : color;
  const p = { viewBox: "0 0 24 24", width: size, height: size };
  if (k === "boost")
    // 번개 — 부스트
    return <svg {...p} fill={c}><path d="M13.2 2 5 13.4h5.3L9.9 22l8.4-11.6H12.8Z" /></svg>;
  if (k === "box")
    return (
      <svg {...p} fill="none" stroke={c} strokeWidth="1.7">
        <path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" strokeLinejoin="round" />
        <path d="M3 8.5 12 13l9-4.5M12 13v7" strokeLinejoin="round" />
      </svg>
    );
  if (k === "bell")
    return (
      <svg {...p} fill="none" stroke={c} strokeWidth="1.7">
        <path d="M6 9a6 6 0 1 1 12 0c0 4 1.2 5.5 1.8 6.2.3.4 0 .9-.5.9H4.7c-.5 0-.8-.5-.5-.9C4.8 14.5 6 13 6 9Z" strokeLinejoin="round" />
        <path d="M10 19.5a2 2 0 0 0 4 0" strokeLinecap="round" />
      </svg>
    );
  if (k === "title")
    // 리본 — 칭호
    return (
      <svg {...p} fill="none" stroke={c} strokeWidth="1.7">
        <path d="M7 3h10v11l-5-3-5 3Z" strokeLinejoin="round" />
        <path d="M9 16.5 7 21l5-2.6L17 21l-2-4.5" strokeLinejoin="round" />
      </svg>
    );
  if (k === "medal")
    return (
      <svg {...p} fill="none" stroke={c} strokeWidth="1.7">
        <circle cx="12" cy="14.5" r="5.5" />
        <path d="M8.5 9 6.5 3h11l-2 6" strokeLinejoin="round" />
      </svg>
    );
  return <svg {...p} fill={c}><path d="M12 2.6 20 5.4V12c0 4.6-3.4 7.6-8 9.2C7.4 19.6 4 16.6 4 12V5.4Z" opacity="0.92" /></svg>;
};

// 📌 가방 — 인벤토리를 대시보드에 펼치지 않고 오버레이로 연다.
//    껍데기는 TierModal 과 같은 문법(모바일 바텀시트 / 데스크톱 모달, 잉크 패널).
//    스크롤 잠금은 손대지 않는다 — 루트 className 에 "fixed inset-0" 이 붙어 있고
//    z-index 가 50 이상이면 ScrollLock 이 알아서 건다(iOS 대응 포함).
const BagOverlay = ({ open, onClose, groups, tab, onTab, synced, onTone }) => {
  const [sel, setSel] = useState(null); // 선택한 아이템 uid

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => { if (!open) setSel(null); }, [open]);

  if (!open) return null;

  const active = groups.find((g) => g.id === tab) || groups[0];
  const rows = active?.items || [];
  // uid 로 되짚는다 — 30초 폴링이 배열을 갈아끼워도 엉뚱한 것을 가리키지 않는다
  const selItem = sel ? rows.find((r) => r.uid === sel) || null : null;
  const slots = Math.max(8, Math.ceil(rows.length / 4) * 4);
  const accentOf = (it) => it.color || (it.source === "level" ? "#ff5c77" : it.source === "inventory" ? "#5aa9dd" : "#ffffff");
  const ddayOf = (it) =>
    it.expiresAt && it.status === "completed"
      ? Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000))
      : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[86vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#131313] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.7)] flex flex-col"
        style={{ animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div aria-hidden className="absolute -top-24 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none" style={{ background: "rgba(63,131,184,0.28)" }}></div>

        {/* 헤더 */}
        <div className="relative z-10 shrink-0 px-5 sm:px-7 pt-5 sm:pt-6 pb-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#ff5c77] uppercase mb-1.5">
                <span aria-hidden className="w-4 h-px bg-[#ff5c77]"></span>Inventory
              </span>
              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                인벤토리
                <span className="text-sm font-black text-white/35 ml-2 tabular-nums">{groups[0]?.items.length ?? 0}</span>
              </h3>
            </div>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="shrink-0 w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white flex items-center justify-center transition-colors outline-none focus:outline-none"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {groups.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-bar mt-4 -mb-1 pb-1">
              {groups.map((g) => {
                const on = active?.id === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => { onTab(g.id); setSel(null); onTone(); }}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
                      on ? "bg-white text-[#131313]" : "text-white/45 hover:text-white"
                    }`}
                  >
                    {g.label}
                    <span className={`tabular-nums text-[10px] font-black ${on ? "text-[#8a8a8a]" : "opacity-60"}`}>{g.items.length}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 본문 — 왼쪽 아이템 정보 / 오른쪽 칸 */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto sm:overflow-hidden sm:flex">
          {/* 왼쪽 — 고른 아이템 */}
          <div className="shrink-0 sm:w-[236px] sm:border-r border-white/[0.08] px-5 sm:px-6 pt-5 pb-4 sm:py-6 sm:overflow-y-auto">
            {selItem ? (
              <div>
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: `linear-gradient(160deg, ${accentOf(selItem)}33, ${accentOf(selItem)}0f)`,
                    boxShadow: `inset 0 0 0 1px ${accentOf(selItem)}55`,
                  }}
                >
                  <InvIcon it={selItem} size={38} color={accentOf(selItem)} dim={selItem.status !== "completed"} />
                </div>
                <p className="text-[15px] font-black text-white leading-snug break-keep">{selItem.name}</p>
                <p className="text-[11px] text-white/45 mt-2 leading-relaxed break-keep">{invSubLabel(selItem)}</p>

                <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-black tracking-[0.15em] text-white/30 uppercase">Status</span>
                    <span className={`text-[11px] font-black ${selItem.status === "missing" ? "text-[#ff5c77]" : selItem.status === "pending" ? "text-white/60" : "text-emerald-400"}`}>
                      {selItem.status === "pending" ? "지급 대기" : selItem.status === "missing" ? "확인 필요" : "보유 중"}
                    </span>
                  </div>
                  {ddayOf(selItem) !== null && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black tracking-[0.15em] text-white/30 uppercase">Expires</span>
                      <span className={`text-[11px] font-black tabular-nums ${ddayOf(selItem) <= 3 ? "text-[#ff5c77]" : "text-white/70"}`}>
                        D-{ddayOf(selItem)}
                      </span>
                    </div>
                  )}
                  {selItem.rewardLevel != null && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-black tracking-[0.15em] text-white/30 uppercase">Level</span>
                      <span className="text-[11px] font-black tabular-nums text-white/70">Lv.{selItem.rewardLevel}</span>
                    </div>
                  )}
                </div>

                {selItem.status === "missing" && (
                  <p className="text-[10px] text-[#ff5c77]/80 mt-4 leading-relaxed break-keep">
                    구매 기록은 있는데 디스코드 역할이 확인되지 않습니다. 운영진에 문의해 주세요.
                  </p>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center py-6 sm:py-0">
                <span aria-hidden className="w-14 h-14 rounded-2xl border border-dashed border-white/15 flex items-center justify-center mb-3">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6">
                    <path d="M4 9h16l-1 10.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" strokeLinejoin="round" />
                    <path d="M8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="text-[11px] font-bold text-white/30 break-keep">칸을 누르면 여기에 보입니다</p>
              </div>
            )}
          </div>

          {/* 오른쪽 — 칸 */}
          <div className="min-w-0 flex-1 px-5 sm:px-6 pb-5 pt-1 sm:py-6 sm:overflow-y-auto">
            <div className="grid grid-cols-4 gap-2.5">
              {Array.from({ length: slots }, (_, i) => {
                const it = rows[i];
                if (!it) {
                  return <div key={`empty-${i}`} className="aspect-square rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02]"></div>;
                }
                const dead = it.status === "pending" || it.status === "missing";
                const accent = accentOf(it);
                const dday = ddayOf(it);
                const on = sel === it.uid;
                return (
                  <button
                    key={it.uid || `i-${i}`}
                    onClick={() => { setSel(on ? null : it.uid); onTone(); }}
                    title={it.name}
                    className={`relative aspect-square rounded-xl flex flex-col items-center justify-center px-1.5 transition-all outline-none focus:outline-none ${
                      on ? "ring-2 ring-white/70 -translate-y-0.5" : "hover:-translate-y-0.5"
                    }`}
                    style={{
                      background: dead ? "rgba(255,255,255,0.03)" : `linear-gradient(160deg, ${accent}2e, ${accent}0d)`,
                      boxShadow: dead ? "inset 0 0 0 1px rgba(255,255,255,0.07)" : `inset 0 0 0 1px ${accent}44`,
                    }}
                  >
                    <span aria-hidden className="mb-1.5">
                      <InvIcon it={it} size={24} color={accent} dim={dead} />
                    </span>
                    <span className={`w-full text-[9px] font-black leading-tight text-center line-clamp-2 ${dead ? "text-white/35" : "text-white/85"}`}>
                      {it.name}
                    </span>
                    {dday !== null && (
                      <span className={`absolute top-1 right-1 text-[8px] font-black tabular-nums px-1 py-0.5 rounded ${dday <= 3 ? "bg-[#e91e3f] text-white" : "bg-white/15 text-white/70"}`}>
                        D-{dday}
                      </span>
                    )}
                    {it.status === "pending" && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-white/40"></span>}
                    {it.status === "missing" && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                  </button>
                );
              })}
            </div>

            {/* invGroups 는 보유 0개면 [] 를 돌려준다 — groups[0] 로 판정하면 신규 유저에게 문구가 안 뜬다 */}
            {rows.length === 0 && (
              <p className="text-[12px] font-bold text-white/35 text-center mt-6">아직 보유한 아이템이 없습니다</p>
            )}
          </div>
        </div>

        {synced === false && (
          <div className="relative z-10 shrink-0 border-t border-white/[0.08] bg-white/[0.02] px-5 sm:px-7 py-3">
            <p className="text-[11px] text-white/30 break-keep">디스코드 역할을 확인하지 못해 구매 기록 기준으로 표시하고 있습니다.</p>
          </div>
        )}
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
      <p className="text-[10px] text-[#c4c4c4] mt-3.5 break-keep">
        음성 {intervalMin}분당 기본 지급량 위에 등급별로 더해지는 금액
      </p>
    </div>
  );
};

// 📌 시즌 설정은 lib/season.js 공용 상수 사용 (홈 티커와 단일 소스)

export default function LevelPage() {
  // 리뉴얼: 정적 안내 대신 '내 대시보드'가 첫 화면
  // 탭은 URL 이 기준 — 외부에서 /level?tab=arctic 로 바로 들어올 수 있어야 한다.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab") || "";
  const activeMainTab = MAIN_TABS.some((t) => t.id === tabParam) ? tabParam : "my";
  const setActiveMainTab = useCallback(
    (id) => {
      const q = new URLSearchParams(Array.from(searchParams.entries()));
      if (id === "my") q.delete("tab");
      else q.set("tab", id);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );
  const [introSec, setIntroSec] = useState(INTRO_STEPS[0].id);
  const [invTab, setInvTab] = useState("all");
  const [bagOpen, setBagOpen] = useState(false);
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

  const loadMe = useCallback(async () => {
    try {
      const [meRes, logRes, qRes, itemRes] = await Promise.all([
        fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/my-logs", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/quests", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/shop/my-items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
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
      if (itemRes?.success) setMyItems(itemRes.data);
    } catch {}
    setMeLoaded(true);
  }, [pushToast]);

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
        pushToast(`${q.name} 보상 +${q.rewardXp.toLocaleString()} XP 수령`, true);
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

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session?.user) { setMe(null); setMyLogs(null); setQuests(null); setMyItems(null); prevXpRef.current = null; setMeLoaded(true); return; }
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
  const invGroups = useMemo(() => {
    if (invAll.length === 0) return [];
    const byId = new Map();
    for (const it of invAll) {
      const g = invGroupOf(it);
      if (!byId.has(g.id)) byId.set(g.id, { ...g, items: [] });
      byId.get(g.id).items.push(it);
    }
    return [{ id: "all", label: "전체", items: invAll }, ...byId.values()];
  }, [invAll]);
  const invActive = invGroups.find((g) => g.id === invTab) || invGroups[0];
  const invRows = invActive?.items || [];
  // 손봐야 할 것 — 지급 대기·확인 필요는 배지로 알린다
  const invUnread = invAll.filter((i) => i.status === "pending" || i.status === "missing").length;
  // 가방 여닫는 소리 — 기존 어휘(880·523·620Hz)와 겹치지 않게 낮은음 → 높은음
  const openBag = () => {
    setBagOpen(true);
    playTone(392, 0.06, "sine", 0.03);
    setTimeout(() => playTone(587, 0.08, "sine", 0.03), 90);
  };
  const closeBag = () => {
    setBagOpen(false);
    playTone(523, 0.06, "sine", 0.025);
    setTimeout(() => playTone(349, 0.08, "sine", 0.025), 90);
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
  const introIdx = Math.max(0, INTRO_STEPS.findIndex((x) => x.id === introSec));
  const introPrev = introIdx > 0 ? INTRO_STEPS[introIdx - 1] : null;
  const introNext = introIdx < INTRO_STEPS.length - 1 ? INTRO_STEPS[introIdx + 1] : null;
  const goIntro = (id) => { setIntroSec(id); playTone(660, 0.05, "sine", 0.03); };
  const questPool = quests?.pool?.[questPeriod] || null;
  const questRotates = !!(questPool && questPool.pick > 0 && questPool.total > questPool.shown);
  const questDone = questRows.filter((q) => q.claimed || q.done).length;
  const questTotal = questRows.length;
  const questPct = Math.round((questDone / Math.max(1, questTotal)) * 100);
  const questClaimable = questRows.filter((q) => q.claimable).length;
  // 탭에 붙일 '받을 수 있는 보상' 개수
  const claimableBy = { daily: 0, weekly: 0, monthly: 0 };
  for (const q of questAll) if (q.claimable) claimableBy[q.period || "daily"]++;

  // 킬피드 확장 토글 — 내부 스크롤 대신 6건 + 전체 보기 (이중 스크롤 회피)
  const [feedOpen, setFeedOpen] = useState(false);

  // 진행 중 이벤트 — 대시보드 사이드 위젯
  const [events, setEvents] = useState([]);
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
    chatXp: policy?.chatXp ?? 200,
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

  // 티어 지급량은 관리자가 정한 기본 음성 XP 위에 얹힌다 (P 정의 이후여야 한다)
  const tierCurXp = P.voiceXp + tierCur.bonus;
  const tierNextXp = tierNext ? P.voiceXp + tierNext.bonus : null;

  // ARCTIC 상점 동선 — 공개 전에는 관리자에게만 노출 (policy.shopPublic)
  const canSeeShop = !!policy?.shopPublic || isAdminName(session?.user?.name);
  const P_chatCooldownLabel = P.chatCooldownSec >= 60 ? `${Math.round(P.chatCooldownSec / 60)}분` : `${P.chatCooldownSec}초`;

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
      channelBaseXp = P.chatXp; levelBonusXp = 0; checkInterval = Math.max(1, Math.round(P.chatCooldownSec / 60));
    } else {
      checkInterval = P_voiceMin;
      channelBaseXp = simChannel === "voice" ? P.voiceXp : SCRIM_BASE_XP;
      // 봇의 지급표와 같은 값을 쓴다 (lib/voiceTiers 단일 소스)
      levelBonusXp = getVoiceBonus(level);
    }

    const channelCycles = Math.floor(time / checkInterval);
    const channelTotalXp = (channelBaseXp + levelBonusXp) * channelCycles;

    const b1Add = simBoost1 ? 300 : 0;
    let penguinAdd = 0;
    if (penChild) penguinAdd += 250;
    if (penYouth) penguinAdd += 350;
    if (penAdult) penguinAdd += 450;
    if (penMother) penguinAdd += 550;

    const buffTotalXp = (b1Add + penguinAdd) * channelCycles;
    const attendanceBaseTotal = attendanceCount * P.attendXp;
    const attendanceBoostTotal = simAttendBoost ? attendanceCount * P.attendXp : 0;

    const finalGrandTotal = channelTotalXp + buffTotalXp + attendanceBaseTotal + attendanceBoostTotal;
    const currentCumulativeXp = getCumulativeXpByLevel(level);
    const projectedTotalXp = currentCumulativeXp + finalGrandTotal;
    const finalLevel = getLevelByXp(projectedTotalXp);

    const cycleText = simChannel === "chat" ? "1분당" : `${P_voiceMin}분당`;
    const cycleBaseText = simChannel === "chat" ? "1분" : `${P_voiceMin}분`;

    return {
      channelBaseXp, levelBonusXp, channelCycles, channelTotalXp,
      b1Add, penguinAdd, buffTotalXp,
      attendanceBaseTotal, attendanceBoostTotal,
      finalGrandTotal, projectedTotalXp, finalLevel,
      cycleText, cycleBaseText
    };
  }, [simLevel, simChannel, simTime, simBoost1, penChild, penYouth, penAdult, penMother, simAttend, simAttendBoost, P_voiceMin]);

  // 📌 목표 모드 계산 — 현재 시뮬레이터 조건(레벨/채널/버프) 기준 하루 활동량으로 예상 소요일 산출
  const goalResult = useMemo(() => {
    const currentLv = Math.max(0, parseInt(simLevel) || 0);
    const targetLv = Math.min(1000, Math.max(0, parseInt(goalLevel) || 0));
    const dailyMin = Math.max(0, parseInt(goalDailyTime) || 0);
    if (!targetLv || targetLv <= currentLv || dailyMin <= 0) return null;

    const neededXp = getCumulativeXpByLevel(targetLv) - getCumulativeXpByLevel(currentLv);
    const checkInterval = simChannel === "chat" ? Math.max(1, Math.round(P.chatCooldownSec / 60)) : P_voiceMin;
    const perCycle = simResult.channelBaseXp + simResult.levelBonusXp + simResult.b1Add + simResult.penguinAdd;
    const cyclesPerDay = Math.floor(dailyMin / checkInterval);
    const attendDaily = P.attendXp + (simAttendBoost ? P.attendXp : 0); // 하루 1회 출석 가정
    const dailyXp = perCycle * cyclesPerDay + attendDaily;
    if (dailyXp <= 0) return null;

    const days = Math.ceil(neededXp / dailyXp);
    return { neededXp, dailyXp, days, months: Math.floor(days / 30), remDays: days % 30, targetLv };
  }, [simLevel, goalLevel, goalDailyTime, simChannel, simResult, simAttendBoost]);

  // 📌 탭 줄 — 일반 탭에서는 히어로 아래, ARCTIC 에서는 상점 헤더 바로 아래에 그린다.
  //    ARCTIC 은 전역 헤더를 넘겨받은 화면이라 카테고리도 그 헤더에 붙어 있어야 자연스럽다.
  const tabBar = (
    <div className="w-full px-5 md:px-8 pt-5 pb-3">
      {/* 정렬은 탭마다 바뀌지 않는다 — ARCTIC 으로 넘어갈 때 카테고리가 좌우로 튀면 안 된다 */}
      <div className="max-w-7xl mx-auto flex items-center justify-center">
        <div className="min-w-0 flex gap-2 overflow-x-auto no-bar">
          {MAIN_TABS.filter((t) => !t.shopOnly || canSeeShop).map((tab) => {
            const active = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-colors outline-none focus:outline-none ${
                  active ? "bg-[#131313] text-white" : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08] hover:text-[#131313]"
                }`}
              >
                {tab.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    // ⚠️ main에 overflow-hidden 금지 — 하위 sticky(탭바)가 죽는다. 글로우 가로 넘침은 body의 overflow-x: clip이 전역 처리
    <main className="w-full flex-1 flex flex-col relative">
      <HudStyles />
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d6d3ce; border-radius: 10px; }
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

      <TierModal open={tierOpen} onClose={() => setTierOpen(false)} level={me?.level || 0} baseXp={P.voiceXp} intervalMin={P_voiceMin} />
      <BagOverlay
        open={bagOpen}
        onClose={closeBag}
        groups={invGroups}
        tab={invTab}
        onTab={setInvTab}
        synced={myItems?.synced}
        onTone={() => playTone(620, 0.04, "sine", 0.025)}
      />

      {/* ── 탭 줄 — 어떤 탭이든 헤더 바로 아래 같은 자리. 여기가 움직이면 안 된다.
             ARCTIC 은 전역 헤더 대신 상점 헤더가 서므로 그쪽 topSlot 으로 넘긴다. ── */}
      {activeMainTab !== "arctic" && tabBar}

      {/* ── 공통 헤더 — ARCTIC 에서는 상점 헤더가 그 자리를 대신하므로 감춘다 ── */}
      {activeMainTab !== "arctic" && (<>
      <div className="relative w-full px-5 md:px-8 pt-14 pb-10">
        <div aria-hidden className="absolute -top-16 left-1/2 -translate-x-1/2 w-[560px] h-[280px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="relative max-w-7xl mx-auto">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none">
              <span className="text-[#131313]">SYSTEM</span>
              <span className="text-[#e91e3f] mx-1.5">:</span>
              <span className="lux-shimmer">LEVEL</span>
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3.5">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e91e3f]/10 border border-[#e91e3f]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-[pulseGlow_2.5s_ease-in-out_infinite]"></span>
              <span className="text-[10px] font-black text-[#e91e3f] tracking-wide">SEASON {SEASON.number} · {SEASON.name}</span>
            </span>
            {!seasonDday.ended && seasonDday.days >= 0 && (
              <span className="text-[11px] font-black text-[#131313] bg-black/5 border border-black/10 px-2.5 py-1 rounded-full">종료까지 D-{seasonDday.days}</span>
            )}
            </div>
          </div>
          {authReady && session?.user && (
            <div className="flex items-center justify-center md:justify-end gap-2.5 mt-5 md:mt-0 md:absolute md:top-0 md:right-0">
              <LiveDot />
              <span className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase">실시간 동기화</span>
              {lastSync && <span className="hidden md:inline text-[10px] font-bold text-[#a3a3a3] tabular-nums">{lastSync.toLocaleTimeString("ko-KR", { hour12: false })}</span>}
              <button onClick={() => loadMe().then(() => pushToast("동기화 완료"))} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none border border-black/10 hover:border-black/30 rounded-full px-3 py-1">갱신</button>
            </div>
          )}
        </div>
      </div>

      </>)}

      {/* 대시보드 탭은 좌우 공간을 쓰는 와이드 HUD(7xl), 문서형 탭은 기존 에디토리얼 폭 유지 */}
      <div
        className={
          activeMainTab === "arctic"
            ? "w-full flex-1" // ARCTIC 본문이 자체 폭(최대 1600px)과 여백을 갖는다
            : `w-full max-w-7xl mx-auto px-5 md:px-8 flex-1 ${activeMainTab === "my" ? "py-6 md:py-10" : "py-10 md:py-14"}`
        }
      >

        {/* ══ TAB : ARCTIC — /shop 과 같은 본문 한 벌 ══ */}
        {/* 접근 판정(공개 여부·관리자)은 ArcticShopBody 가 스스로 한다 — 여기서 또 막으면
            정책이 로드되기 전 한순간 전역 헤더도 본문도 없는 빈 화면이 된다 */}
        {activeMainTab === "arctic" && <ArcticShopBody embedded topSlot={tabBar} />}


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
                      <p className="text-sm font-bold text-[#131313] mb-1.5">내 대시보드가 잠겨 있습니다</p>
                      <p className="text-[11px] text-[#8a8a8a] leading-relaxed mb-7 break-keep">로그인하면 레벨·순위·획득 기록이<br />실시간으로 활성화됩니다.</p>
                      <button onClick={() => signIn("discord", { callbackUrl: "/level" })} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors shadow-[0_10px_30px_rgba(233,30,63,0.35)] outline-none focus:outline-none">Discord로 로그인</button>
                      {process.env.NODE_ENV === "development" && (
                        <button onClick={() => signIn("devlogin", { callbackUrl: "/level" })} className="mt-3.5 text-[11px] font-bold text-[#a3a3a3] hover:text-[#131313] underline underline-offset-4 transition-colors outline-none focus:outline-none">로컬 확인용 로그인 (dev)</button>
                      )}
                    </HudPanel>
                  </div>
                </div>

                {/* 공개 섹션 — 관전자에게도 실데이터 */}
                <div className="mt-14">
                  <div className="max-w-2xl mx-auto min-w-0">
                    <div className="flex items-end justify-between mb-5">
                      <div>
                        <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Ranking</span>
                        <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">서버 랭킹</h3>
                      </div>
                      <span className="flex items-center gap-3">
                        {["all", "month"].map((k) => (
                          <button key={k} onClick={() => setLbTab(k)} className={`text-[11px] font-black transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-[#131313] border-b-2 border-[#e91e3f]" : "text-[#a3a3a3] hover:text-[#5a5a5a]"}`}>{k === "all" ? "누적" : "이번 달"}</button>
                        ))}
                      </span>
                    </div>
                    {!lb[lbTab] ? (
                      <div className="py-10 text-center text-[11px] font-bold text-[#c4c4c4]">불러오는 중…</div>
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
              <div>
                {/* 플레이어 배너 — 아이보리 위 잉크 카드. 이 화면의 유일한 볼륨 앵커 */}
                <div className="relative rounded-3xl overflow-hidden bg-[#131313] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
                  <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>
                  <div aria-hidden className="absolute -top-28 -right-20 w-[420px] h-[420px] bg-[#e91e3f]/[0.18] blur-[120px] rounded-full pointer-events-none"></div>
                  <span aria-hidden className="absolute top-5 right-8 text-[120px] md:text-[150px] font-black text-white/[0.03] leading-none select-none pointer-events-none tracking-tighter tabular-nums">{me.level}</span>

                  <div className="relative z-10 p-6 md:p-10">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-5 md:gap-7 min-w-0">
                        {/* 아바타를 감싼 레벨 진행 링 */}
                        <RingGauge pct={progPct} size={112} stroke={6} trackClass="rgba(255,255,255,0.12)">
                          {session.user.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={session.user.image} alt="" className="w-[78px] h-[78px] rounded-full object-cover" />
                          ) : (
                            <span className="w-[78px] h-[78px] rounded-full bg-white/10 flex items-center justify-center text-2xl font-black text-white/60">{(session.user.name || "?").slice(0, 1)}</span>
                          )}
                        </RingGauge>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black tracking-[0.35em] text-white/35 uppercase mb-2">Player</p>
                          <p className="text-2xl md:text-4xl font-black text-white truncate tracking-tight leading-none">{session.user.name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3.5">
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-white/20 text-[10px] font-black tracking-[0.12em] uppercase text-white/70 tabular-nums">
                              Rank #{me.rank.toLocaleString()}<span className="text-white/35 ml-1">/ {me.total.toLocaleString()}</span>
                            </span>
                            <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#e91e3f] text-[10px] font-black tracking-[0.12em] uppercase text-white tabular-nums">Top {rankPct}%</span>
                            {todayTotal > 0 && (
                              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-[#e91e3f]/55 text-[10px] font-black tracking-[0.12em] uppercase text-[#ff5c77] tabular-nums">
                                <LiveDot color="bg-[#ff5c77]" />오늘 +{todayTotal.toLocaleString()} XP
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-8 md:mt-0 md:text-right shrink-0 md:pl-10">
                        {/* 등급 — 레벨과 함께 이 화면의 주인공. 누르면 등급 사다리를 편다 */}
                        <button
                          onClick={() => setTierOpen(true)}
                          className="group inline-flex items-center gap-2 h-8 pl-2.5 pr-3 rounded-full border transition-colors mb-3.5 outline-none focus:outline-none"
                          style={{ borderColor: `${tierCur.c}66`, backgroundColor: `${tierCur.c}1f` }}
                        >
                          <TierEmblem tier={tierCur} size={16} />
                          <span className="text-[12px] font-black tracking-tight" style={{ color: tierCur.c }}>{tierCur.name}</span>
                          <span className="text-[10px] font-bold text-white/35 group-hover:text-white/70 transition-colors">등급 안내</span>
                        </button>
                        <p className="text-[10px] font-black tracking-[0.35em] text-white/35 uppercase mb-1">Level</p>
                        <p className="text-7xl md:text-8xl font-black text-white tabular-nums tracking-tighter leading-[0.85]" style={{ textShadow: "0 0 50px rgba(233,30,63,0.55)" }}>{me.level}</p>
                      </div>
                    </div>

                    {/* 와이드 XP 게이지 */}
                    <div className="mt-9 md:mt-11">
                      <div className="flex justify-between items-baseline mb-2.5">
                        <span className="text-[11px] font-bold text-white/55">Lv {me.level} <span className="text-white/25 mx-1.5">→</span> Lv {me.level + 1}</span>
                        <span className="text-base font-black text-white tabular-nums">{progPct}<span className="text-[11px] text-white/40 ml-0.5">%</span></span>
                      </div>
                      <div aria-hidden className="flex justify-between mb-1">
                        {Array.from({ length: 21 }, (_, i) => (
                          <span key={i} className={`w-px ${i % 5 === 0 ? "h-2 bg-white/30" : "h-1 bg-white/12"}`}></span>
                        ))}
                      </div>
                      <SegBar pct={progPct} segments={20} h="h-3.5" track="bg-white/10" tick="rgba(19,19,19,0.92)" />
                      <div className="flex justify-between mt-2.5">
                        <span className="text-[11px] font-bold text-white/40 tabular-nums">{prog.current.toLocaleString()} / {prog.required.toLocaleString()} XP</span>
                        <span className="text-[11px] font-bold text-white/50">다음 레벨까지 <b className="text-[#ff5c77] tabular-nums">{prog.needToNext.toLocaleString()} XP</b></span>
                      </div>
                    </div>

                    {/* 배너 하단 스탯 스트립 — 세로 구분선으로 계기판 느낌 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 border-t border-white/10 mt-8 pt-6 md:divide-x md:divide-white/10">
                      {[
                        { l: "누적 XP", v: (me.xp || 0).toLocaleString(), s: "TOTAL" },
                        { l: "오늘 획득", v: `+${todayTotal.toLocaleString()}`, s: "TODAY", hot: todayTotal > 0 },
                        { l: "누적 출석", v: `${(me.attendCount || 0).toLocaleString()}일`, s: "STREAK" },
                        voiceTracked
                          ? { l: "누적 음성 시간", v: fmtVoiceTime(me.voiceSeconds), s: "VOICE" }
                          : { l: `${+VOICE_TIME_START.slice(5, 7)}월 ${+VOICE_TIME_START.slice(8, 10)}일부터 집계`, v: "—", s: "VOICE", dim: true },
                      ].map((st, i) => (
                        <div key={i} className={`px-0 md:px-6 ${i === 0 ? "md:pl-0" : ""} ${i >= 2 ? "pt-5 md:pt-0 border-t md:border-t-0 border-white/10" : ""}`}>
                          <p className="text-[9px] font-black tracking-[0.28em] text-white/30 uppercase mb-2">{st.s}</p>
                          <p
                            className={`text-xl md:text-2xl font-black tabular-nums tracking-tight leading-none ${st.hot ? "text-[#ff5c77]" : st.dim ? "text-white/25" : "text-white"}`}
                            style={st.tint ? { color: st.tint } : undefined}
                          >{st.v}</p>
                          <p className="text-[10px] font-bold text-white/40 mt-1.5">{st.l}</p>
                        </div>
                      ))}
                    </div>

                    {/* 가방 — 스탯 스트립 아래 헤어라인 줄. 카드(면·테두리·둥근 상자)는 쓰지 않는다.
                        눌리는 것임은 오른쪽 "열기" 버튼 하나로 드러낸다. */}
                    {myItems && (
                      <button
                        onClick={openBag}
                        aria-label="인벤토리 열기"
                        className="group w-full mt-8 pt-6 md:pt-10 border-t border-white/10 flex items-center gap-4 text-left outline-none focus:outline-none"
                      >
                        <span aria-hidden className="relative shrink-0">
                          <svg viewBox="0 0 24 24" className="w-7 h-7 text-white/45 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M4 9h16l-1 10.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" strokeLinejoin="round" />
                            <path d="M8.5 9V6.5a3.5 3.5 0 0 1 7 0V9" strokeLinecap="round" />
                          </svg>
                          {invUnread > 0 && (
                            <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#e91e3f] text-white text-[9px] font-black flex items-center justify-center tabular-nums">{invUnread}</span>
                          )}
                        </span>

                        <span className="min-w-0 flex-1 flex items-baseline gap-2.5">
                          <span className="text-[15px] font-black text-white shrink-0">인벤토리</span>
                          <span className="text-[15px] font-black text-white/45 tabular-nums shrink-0">{myItems.items.length}</span>
                          <span className="text-[11px] text-white/35 truncate">
                            {myItems.items.length === 0
                              ? "아직 보유한 아이템이 없습니다"
                              : invGroups.slice(1).map((g) => `${g.label} ${g.items.length}`).join(" · ")}
                          </span>
                        </span>

                        <span aria-hidden className="shrink-0 text-white/30 group-hover:text-white text-base transition-all group-hover:translate-x-0.5">→</span>
                      </button>
                    )}

                  </div>
                </div>


                {/* 본문 — 8:4 비대칭 2열 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-12 mt-12">

                  {/* 메인 열 */}
                  <div className="lg:col-span-8 min-w-0 space-y-14">
                    {/* 일일 퀘스트 — 출석(봇 지급) + 관리자가 정의한 퀘스트(원클릭 수령) */}
                    <section>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Quests</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">퀘스트</h3>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-[#131313] tabular-nums leading-none">
                            {questDone}<span className="text-[#c4c4c4]"> / {questTotal}</span>
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
                                {q.rewardXp > 0 && (
                                  <span className={`text-[15px] font-black tabular-nums leading-none ${q.claimed ? "text-[#c4c4c4]" : "text-[#e91e3f]"}`}>
                                    +{q.rewardXp.toLocaleString()}
                                    <span className={`text-[10px] font-bold ml-1 ${q.claimed ? "text-[#c4c4c4]" : "text-[#a3a3a3]"}`}>XP</span>
                                  </span>
                                )}
                                <div className={q.rewardXp > 0 ? "mt-2.5" : ""}>
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
                                    <span className="text-[11px] font-black text-emerald-700">달성</span>
                                  ) : (
                                    <span className="text-[11px] font-bold text-[#c4c4c4]">진행 중</span>
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

                      {/* 지급 안내 — 보상은 봇 대기열을 거치므로 즉시가 아닐 수 있다 */}
                      {questRows.some((q) => q.claimed) && (
                        <p className="text-[10px] text-[#c4c4c4] mt-3 break-keep">수령한 보상은 잠시 뒤 XP에 반영됩니다.</p>
                      )}

                      <div className={`${questPeriod === "daily" ? "flex" : "hidden"} items-center justify-between border-t border-black/[0.08] mt-5 pt-4`}>
                        <span className="text-[11px] font-bold text-[#8a8a8a]">누적 출석 <b className="text-[#131313] tabular-nums">{(me.attendCount || 0).toLocaleString()}일</b></span>
                        <span className="text-[11px] font-bold text-[#8a8a8a]">마지막 <b className="text-[#131313] tabular-nums">{me.lastAttendDate ? me.lastAttendDate.replace(/-/g, ".") : "—"}</b></span>
                      </div>
                    </section>

                    {/* 서버 랭킹 */}
                    <section>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Ranking</span>
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
                        <div className="py-10 text-center text-[11px] font-bold text-[#c4c4c4]">불러오는 중…</div>
                      ) : !lb[lbTab].data?.length ? (
                        <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                      ) : (
                        <RankRows rows={lb[lbTab].data} myId={session.user.id} me={lbTab === "all" ? me : null} myName={session.user.name} />
                      )}
                      {lbTab === "month" && <p className="text-[10px] text-[#c4c4c4] mt-2.5">이번 달 지급 로그 합산 기준 · 매월 1일(KST) 초기화</p>}
                    </section>
                  </div>

                  {/* 사이드 열 */}
                  <div className="lg:col-span-4 min-w-0 space-y-14 mt-14 lg:mt-0">
                    {/* ═══ 등급 — 랭크 플라크 ═══ */}
                    <section>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Rank</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">등급</h3>
                        </div>
                        <button
                          onClick={() => setTierOpen(true)}
                          className="shrink-0 h-8 px-3 rounded-lg bg-black/[0.05] hover:bg-black/[0.09] text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                        >
                          등급 안내
                        </button>
                      </div>

                      {/* 랭크 플라크 — 엠블럼을 가운데 세우고 등급색으로 감싼다 */}
                      <div
                        className="relative rounded-2xl overflow-hidden px-5 pt-7 pb-6 text-center"
                        style={{
                          background: `radial-gradient(120% 90% at 50% 0%, ${tierCur.c}26, ${tierCur.c}08 60%, transparent)`,
                          border: `1px solid ${tierCur.c}3d`,
                        }}
                      >
                        <div
                          aria-hidden
                          className="absolute -top-16 left-1/2 -translate-x-1/2 w-52 h-52 rounded-full blur-[54px] pointer-events-none"
                          style={{ background: `${tierCur.c}3a` }}
                        ></div>

                        {/* 엠블럼 */}
                        <div className="relative z-10 flex justify-center mb-4">
                          <span
                            className="w-[74px] h-[74px] rounded-2xl bg-white flex items-center justify-center"
                            style={{ boxShadow: `0 14px 34px -14px ${tierCur.c}, inset 0 0 0 1px ${tierCur.c}33` }}
                          >
                            <TierEmblem tier={tierCur} size={42} />
                          </span>
                        </div>

                        {/* 등급명 */}
                        <p className="relative z-10 text-3xl font-black tracking-tight leading-none" style={{ color: tierCur.c }}>
                          {tierCur.name}
                        </p>
                        <p className="relative z-10 text-[10px] font-black tracking-[0.28em] text-[#a3a3a3] uppercase mt-2 tabular-nums">
                          {tierCur.en} · {tierRangeLabel(tierIdx)}
                        </p>

                        {/* 등급 진행 핍 — 10칸 중 현재 위치 */}
                        <div className="relative z-10 flex justify-center gap-1 mt-5">
                          {VOICE_TIERS.map((t, i) => (
                            <span
                              key={t.key}
                              title={t.name}
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: i === tierIdx ? 22 : 10,
                                backgroundColor: i < tierIdx ? tierCur.c + "55" : i === tierIdx ? tierCur.c : "rgba(0,0,0,0.10)",
                              }}
                            ></span>
                          ))}
                        </div>

                        {/* 음성 추가 XP */}
                        <div className="relative z-10 mt-5 pt-4 border-t" style={{ borderColor: `${tierCur.c}26` }}>
                          <p className={`text-2xl font-black tabular-nums leading-none ${tierCur.bonus > 0 ? "text-[#131313]" : "text-[#c4c4c4]"}`}>
                            {tierCur.bonus > 0 ? `+${tierCur.bonus.toLocaleString()}` : "—"}
                          </p>
                          <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mt-1.5">음성 추가 XP</p>
                        </div>
                      </div>

                      {/* 다음 등급 */}
                      {tierNext && tierNextBound !== null && (
                        <div className="flex items-center gap-3 mt-4 px-4 py-3 rounded-xl bg-black/[0.03]">
                          <TierEmblem tier={tierNext} size={22} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] font-black truncate" style={{ color: tierNext.c }}>다음 · {tierNext.name}</p>
                            <p className="text-[10px] font-bold text-[#a3a3a3] tabular-nums mt-0.5">
                              Lv.{tierNextBound} 도달 시 음성 추가 +{tierNext.bonus.toLocaleString()}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-black text-[#131313] tabular-nums">
                            {Math.max(0, tierNextBound - me.level)}
                            <span className="text-[9px] font-bold text-[#a3a3a3] ml-0.5">레벨</span>
                          </span>
                        </div>
                      )}
                    </section>

                    {/* 획득 현황 */}
                    <section>
                      <div className="flex items-end justify-between mb-6">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Intake</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">획득 현황</h3>
                        </div>
                        <span className="text-[11px] font-bold text-[#a3a3a3]">채팅 · 음성 · 출석</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        {[
                          { key: "today", label: "오늘", data: myLogs?.today },
                          { key: "month", label: "이번 달", data: myLogs?.month },
                        ].map(({ key, label, data }) => {
                          const total = data?.total ?? 0;
                          return (
                            <div key={key}>
                              <div className="flex items-baseline justify-between mb-3">
                                <span className="text-[12px] font-bold text-[#5a5a5a]">{label}</span>
                                <span className="text-3xl md:text-4xl font-black text-[#131313] tabular-nums tracking-tight">+{total.toLocaleString()}<span className="text-[11px] font-bold text-[#a3a3a3] ml-1">XP</span></span>
                              </div>
                              {total > 0 ? (
                                <>
                                  <div className="flex h-3 rounded-full overflow-hidden bg-black/[0.05]">
                                    {["chat", "voice", "attend"].map((r) => (
                                      <div key={r} style={{ width: `${((data?.[r] || 0) / total) * 100}%`, background: REASON_COLORS[r] }}></div>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
                                    {["chat", "voice", "attend"].map((r) => (
                                      <span key={r} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                                        <span className="w-2 h-2 rounded-full" style={{ background: REASON_COLORS[r] }}></span>
                                        {REASON_LABELS[r]} {(data?.[r] || 0).toLocaleString()}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <EmptySlot className="h-[56px]">아직 획득 없음 — 활동하면 채워집니다</EmptySlot>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    {/* 진행 중 이벤트 */}
                    {events.length > 0 && (
                      <section>
                        <div className="flex items-end justify-between mb-4">
                          <div>
                            <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Event</span>
                            <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">진행 중 이벤트</h3>
                          </div>
                          <Link href="/event" className="text-[11px] font-bold text-[#a3a3a3] hover:text-[#e91e3f] transition-colors">전체 →</Link>
                        </div>
                        <div className="border-t border-black/[0.08]">
                          {events.map((ev) => (
                            <Link key={ev._id} href="/event" className="group flex items-center min-h-[44px] py-1.5 gap-3 border-b border-black/[0.05] hover:bg-black/[0.02] transition-colors">
                              <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#4b4b4b] group-hover:text-[#131313] transition-colors">{ev.title}</span>
                              {ev.eventPeriod && <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3]">{ev.eventPeriod}</span>}
                              <span className="shrink-0 text-[#c4c4c4] group-hover:text-[#e91e3f] transition-colors">→</span>
                            </Link>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* 획득 피드 */}
                    <section>
                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Feed</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">획득 피드</h3>
                        </div>
                        <span className="flex items-center gap-1.5"><LiveDot /><span className="text-[10px] font-bold text-[#a3a3a3] tabular-nums">{myLogs?.logs?.length || 0}건</span></span>
                      </div>
                      {myLogs?.logs?.length ? (
                        <>
                          <div className="border-t border-black/[0.08]">
                            {(feedOpen ? myLogs.logs : myLogs.logs.slice(0, 6)).map((l, i) => (
                              <div key={`${l.createdAt}-${i}`} className="flex items-center h-11 gap-3 border-b border-black/[0.05]">
                                <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: REASON_COLORS[l.reason] || "#6b7280" }}></span>
                                <span className="shrink-0 w-16 text-[13px] font-black text-[#131313] tabular-nums">+{(l.amount || 0).toLocaleString()}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-[#8a8a8a]">{l.channelName || (l.reason === "attend" ? "출석 체크" : REASON_LABELS[l.reason] || "—")}</span>
                                <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums">{fmtRel(l.createdAt)}</span>
                              </div>
                            ))}
                          </div>
                          {(myLogs.logs.length > 6) && (
                            <button onClick={() => setFeedOpen((v) => !v)} className="block w-full text-center text-[11px] font-bold text-[#a3a3a3] hover:text-[#131313] transition-colors mt-3.5 outline-none focus:outline-none">
                              {feedOpen ? "접기 ↑" : `전체 ${myLogs.logs.length}건 보기 ↓`}
                            </button>
                          )}
                        </>
                      ) : (
                        <EmptySlot>기록 없음 — 첫 활동을 시작하세요</EmptySlot>
                      )}
                    </section>

                    {/* 시즌 진행 */}
                    <section>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Season</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">시즌 진행</h3>
                        </div>
                        {!seasonDday.ended && seasonDday.days >= 0 && <span className="text-xl font-black text-[#e91e3f] tabular-nums leading-none">D-{seasonDday.days}</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
                        <div className="h-full bg-black/30 rounded-full" style={{ width: `${seasonPct}%` }}></div>
                      </div>
                      <p className="text-[10px] font-bold text-[#a3a3a3] tabular-nums mt-2">{SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")} · 경과 {seasonPct}%</p>
                    </section>
                  </div>
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
        {activeMainTab === "intro" && (
          <div>
            {/* 단계 알약 — 번호는 권장 순서일 뿐, 눌러서 바로 건너뛸 수 있다 */}
            <div className="mb-9 flex items-center gap-1.5 overflow-x-auto no-bar">
              {INTRO_STEPS.map((x) => {
                const on = introSec === x.id;
                return (
                  <button
                    key={x.id}
                    onClick={() => goIntro(x.id)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-bold transition-colors outline-none focus:outline-none ${
                      on
                        ? "bg-white text-[#131313] ring-1 ring-black/10 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.3)]"
                        : "text-[#a3a3a3] hover:text-[#131313]"
                    }`}
                  >
                    <span className="tabular-nums mr-1.5 text-[10px] font-black opacity-40">{x.no}</span>
                    {x.label}
                  </button>
                );
              })}
            </div>

            {/* key 로 매 전환마다 Reveal 페이드를 다시 태운다 — 전환 자체가 피드백 */}
            <div key={introSec}>

              {/* ═══ 01 한눈에 ═══ */}
              {introSec === "overview" && (
                <Reveal>
                  <SectionHeader en="Overview" title="성장은 이렇게 이어집니다" />

                  {/* 인과 사슬 — 읽기 전에 지도를 먼저 준다 */}
                  <div className="relative rounded-3xl overflow-hidden bg-[#131313] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)] p-6 md:p-9">
                    <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70"></div>
                    <div aria-hidden className="absolute -top-28 -right-20 w-[420px] h-[420px] bg-[#e91e3f]/[0.18] blur-[120px] rounded-full pointer-events-none"></div>
                    <div className="relative z-10 flex items-stretch gap-2 overflow-x-auto no-bar">
                      {[
                        { no: "01", t: "활동", d: "채팅하고 음성 채널에 머무릅니다" },
                        { no: "02", t: "XP", d: "활동한 만큼 XP가 쌓입니다" },
                        { no: "03", t: "레벨", d: "XP가 모이면 레벨이 오릅니다" },
                        { no: "04", t: "등급", d: "레벨이 오르면 등급도 따라 오릅니다" },
                        { no: "05", t: "보상", d: "역할이 붙고, 퀘스트 보상을 받습니다" },
                      ].map((n, i) => (
                        <React.Fragment key={n.no}>
                          {i > 0 && (
                            <span aria-hidden className="shrink-0 self-center text-[#ff5c77] font-black text-sm px-0.5">→</span>
                          )}
                          <div className="shrink-0 w-[142px] md:w-auto md:flex-1 px-4 py-5 rounded-xl bg-white/[0.05]">
                            <p className="text-[9px] font-black tracking-[0.25em] text-white/30 tabular-nums mb-2.5">{n.no}</p>
                            <p className="text-[15px] font-black text-white leading-none mb-2.5">{n.t}</p>
                            <p className="text-[11px] text-white/45 leading-relaxed break-keep">{n.d}</p>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 border-y border-black/[0.08] md:divide-x divide-black/[0.08] mt-12">
                    {[
                      { t: "상한은 1,000레벨", d: `채팅 ${P.chatXp.toLocaleString()} XP, 음성 ${P.voiceXp.toLocaleString()} XP부터 시작합니다. 위로 갈수록 필요한 XP가 가팔라집니다.` },
                      { t: "등급은 따로 올리지 않습니다", d: "레벨이 오르면 자동으로 따라 오르고, 음성으로 받는 XP가 등급만큼 더 커집니다." },
                    ].map((f, i) => (
                      <div key={i} className={`py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-black/[0.08]" : ""}`}>
                        <div className="text-[#131313] font-bold text-base mb-2.5 tracking-tight break-keep">{f.t}</div>
                        <div className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{f.d}</div>
                      </div>
                    ))}
                  </div>

                  {!me && (
                    <p className="text-[12px] font-bold text-[#a3a3a3] mt-6">로그인하면 내 레벨과 등급이 함께 표시됩니다.</p>
                  )}
                </Reveal>
              )}

              {/* ═══ 02 모으기 ═══ */}
              {introSec === "earn" && (
                <Reveal>
                  <SectionHeader en="Earn" title="XP는 이렇게 쌓입니다" />
                  <div className="grid grid-cols-1 md:grid-cols-2 border-y border-black/[0.08] md:divide-x divide-black/[0.08]">
                    {[
                      { t: "채팅", x: P.chatXp.toLocaleString(), c: `쿨타임 ${P_chatCooldownLabel}`, d: "메시지를 보내면 지급됩니다. 쿨타임 안에 보낸 메시지는 지급도 진행도 집계도 되지 않습니다." },
                      { t: "음성", x: P.voiceXp.toLocaleString(), c: `${P_voiceMin}분마다`, d: `${P_voiceMin}분마다 돌아오는 지급 시각에 음성 채널에 있으면 받습니다. 그 시각에 접속해 있기만 하면 됩니다.` },
                    ].map((item, i) => (
                      <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-black/[0.08]" : ""}`}>
                        <div className="flex items-center justify-between mb-5">
                          <span className="text-xs font-bold text-[#5a5a5a] tracking-wide">{item.t}</span>
                          <span className="text-[10px] font-black text-emerald-700">{item.c}</span>
                        </div>
                        <div className="mb-4">
                          <span className="text-4xl font-black text-[#131313] tracking-tighter group-hover:text-[#e91e3f] transition-colors duration-300 tabular-nums">+{item.x}</span>
                          <span className="text-xs font-bold text-[#a3a3a3] ml-1.5">XP</span>
                        </div>
                        <p className="text-[#8a8a8a] text-xs leading-relaxed break-keep">{item.d}</p>
                      </div>
                    ))}
                  </div>

                  {/* 출석 — 받는 길이 둘인데 자물쇠는 하나 */}
                  <LuxCard className="p-6 md:p-7 mt-10">
                    <div className="flex items-center justify-between gap-4 pb-5 border-b border-black/[0.07]">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[#131313]">출석 — 하루 1회</p>
                        <p className="text-xs text-[#8a8a8a] mt-1 break-keep">음성 채널에 오늘 {P.attendVoiceMin}분 이상 머무르면 받을 수 있습니다.</p>
                      </div>
                      <span className="shrink-0 text-2xl font-black text-[#e91e3f] tabular-nums leading-none">
                        +{P.attendXp.toLocaleString()}
                        <span className="text-[10px] font-bold text-[#a3a3a3] ml-1">XP</span>
                      </span>
                    </div>
                    <div className="divide-y divide-black/[0.05]">
                      {[
                        { t: "자동으로 집계", d: `음성 채널에 머문 시간이 쌓여 ${P.attendVoiceMin}분을 넘으면 달성됩니다. 따로 할 일은 없습니다.` },
                        { t: "직접 받기", d: "달성한 뒤 대시보드 퀘스트에서 눌러야 XP가 들어옵니다. 자정(KST)에 초기화됩니다." },
                      ].map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-4 py-3.5">
                          <span className="shrink-0 text-[12px] font-bold text-[#131313] w-24">{r.t}</span>
                          <span className="min-w-0 flex-1 text-[11px] text-[#8a8a8a] leading-relaxed break-keep">{r.d}</span>
                        </div>
                      ))}
                    </div>
                  </LuxCard>

                  {/* 지급이 막히는 경우 */}
                  <div className="mt-12">
                    <SectionHeader en="Blocked" title="활동해도 XP가 안 붙을 때" />
                    <div className="space-y-5">
                      {[
                        { t: "잠수 채널", d: "잠수 채널에 있는 동안에는 음성 XP가 지급되지 않습니다." },
                        { t: "제외된 채널", d: "운영진이 제외한 채널·카테고리에서는 채팅도 음성도 지급되지 않습니다." },
                        {
                          t: "음소거",
                          d:
                            P.muteMode === "off"
                              ? "음소거는 지급에 영향을 주지 않습니다."
                              : P.muteMode === "block"
                              ? `${P.muteTarget === "any" ? "마이크나 헤드셋 중 하나라도" : "마이크와 헤드셋을 모두"} 끄면 지급이 멈춥니다.`
                              : `${P.muteTarget === "any" ? "마이크나 헤드셋 중 하나라도" : "마이크와 헤드셋을 모두"} 끄면 지급량이 ${P.muteReducePct}% 줄어듭니다.`,
                        },
                      ].map((item, i) => (
                        <div key={i} className="border-l-2 border-[#e91e3f]/50 pl-5 py-0.5">
                          <strong className="text-[#131313] text-sm font-bold block mb-1.5">{item.t}</strong>
                          <p className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{item.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              )}

              {/* ═══ 03 레벨·등급 ═══ */}
              {introSec === "grow" && (
                <Reveal>
                  <SectionHeader
                    en="Grow"
                    title="레벨이 오르면 음성 지급량이 커집니다"
                    right={
                      <button
                        onClick={() => setTierOpen(true)}
                        className="shrink-0 h-8 px-3.5 rounded-full border border-black/12 hover:border-black/30 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                      >
                        등급표 전체 보기
                      </button>
                    }
                  />

                  {me && (
                    <div className="mb-10">
                      <div className="flex items-center gap-3">
                        <TierEmblem tier={tierCur} size={22} />
                        <span className="text-sm font-black" style={{ color: tierCur.c }}>{tierCur.name}</span>
                        <span className="text-[11px] font-bold text-[#a3a3a3] tabular-nums">{tierRangeLabel(tierIdx)}</span>
                        <StatusChip accent>YOU</StatusChip>
                        <span className="ml-auto shrink-0 text-sm font-black text-[#131313] tabular-nums">
                          {tierCur.bonus > 0 ? `+${tierCur.bonus.toLocaleString()} XP` : "—"}
                        </span>
                      </div>
                      <SegLadder total={VOICE_TIERS.length} currentIndex={tierIdx} titles={VOICE_TIERS.map((t) => t.name)} colors={TIER_COLORS} />
                    </div>
                  )}

                  <TierStairs base={P.voiceXp} intervalMin={P_voiceMin} />

                  {/* 지급식 — 등급이 어디에 더해지는지 */}
                  <div className="relative rounded-3xl overflow-hidden bg-[#131313] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)] p-6 md:p-9 mt-12">
                    <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70"></div>
                    <div aria-hidden className="absolute -top-28 -right-20 w-[420px] h-[420px] bg-[#e91e3f]/[0.18] blur-[120px] rounded-full pointer-events-none"></div>
                    <div className="relative z-10">
                      <p className="text-[9px] font-black tracking-[0.3em] text-white/35 uppercase mb-5">Voice Formula</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {[`기본 ${P.voiceXp.toLocaleString()}`, "등급", "역할", "채널", "진행 중 부스트"].map((c, i) => (
                          <React.Fragment key={c}>
                            {i > 0 && <span className="text-[#ff5c77] font-black text-sm">+</span>}
                            <span className="px-3 py-1.5 rounded-lg bg-white/[0.06] text-white text-[12px] font-bold whitespace-nowrap">{c}</span>
                          </React.Fragment>
                        ))}
                        <span className="text-white/40 font-black text-sm ml-1">×</span>
                        <span className="text-white/50 text-[12px] font-bold">음소거 배율</span>
                      </div>
                      <p className="text-[11px] text-white/40 mt-5 break-keep">
                        내게 실제로 붙어 있는 항목은 대시보드 인벤토리에서 확인할 수 있습니다.
                      </p>
                    </div>
                  </div>

                  {/* 진행 중인 부스트 — 실제 DB를 읽으므로 낡지 않는다 */}
                  <div className="mt-12">
                    <SectionHeader en="Active" title="지금 진행 중인 부스트" />
                    {!policy ? (
                      <div className="space-y-2">
                        {[0, 1].map((i) => <div key={i} className="h-[72px] rounded-lg bg-black/[0.04] animate-pulse"></div>)}
                      </div>
                    ) : (policy.activeBoosts || []).length === 0 ? (
                      <EmptySlot>진행 중인 부스트가 없습니다</EmptySlot>
                    ) : (
                      <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                        {policy.activeBoosts.map((b, i) => {
                          const left = b.endAt ? Math.max(0, Math.ceil((new Date(b.endAt).getTime() - Date.now()) / 86400000)) : null;
                          return (
                            <div key={i} className="flex items-center gap-4 py-4">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-[#131313] truncate">{b.name}</p>
                                {(b.targetRoleName || b.targetChannelName) && (
                                  <p className="text-[11px] text-[#a3a3a3] mt-1 truncate">
                                    {b.targetRoleName || b.targetChannelName} 대상
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-sm font-black text-[#e91e3f] tabular-nums">+{(b.boostXp || 0).toLocaleString()} XP</span>
                              {left !== null && <StatusChip accent dot>D-{left}</StatusChip>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </Reveal>
              )}

              {/* ═══ 04 받기 ═══ */}
              {introSec === "claim" && (
                <Reveal>
                  <SectionHeader
                    en="Claim"
                    title="쌓은 것을 받는 법"
                    right={
                      <button
                        onClick={() => setActiveMainTab("my")}
                        className="shrink-0 text-[11px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                      >
                        내 대시보드 →
                      </button>
                    }
                  />
                  <div className="grid grid-cols-1 md:grid-cols-3 border-y border-black/[0.08] md:divide-x divide-black/[0.08]">
                    {[
                      { n: "01", t: "일일 · 주간 · 월간", d: "세 주기로 나뉘고 각각 자정 · 월요일 · 1일(KST)에 초기화됩니다." },
                      { n: "02", t: "주기마다 새로 뽑힙니다", d: "등록된 퀘스트 중 일부만 나옵니다. 같은 주기 동안 모두에게 같은 목록이 보이고, 주기가 바뀌면 다시 뽑힙니다." },
                      { n: "03", t: "직접 눌러서 받기", d: "달성해도 자동 지급이 아닙니다. 대시보드에서 받아야 XP가 들어옵니다." },
                    ].map((f, i) => (
                      <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-black/[0.08]" : ""}`}>
                        <div className="text-2xl font-black text-[#131313]/[0.08] mb-5 group-hover:text-[#e91e3f]/30 transition-colors duration-500 select-none tabular-nums">{f.n}</div>
                        <div className="text-[#131313] font-bold text-base mb-2.5 tracking-tight break-keep">{f.t}</div>
                        <div className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{f.d}</div>
                      </div>
                    ))}
                  </div>

                  <div className="border-l-2 border-[#e91e3f]/50 pl-5 py-0.5 mt-8">
                    <strong className="text-[#131313] text-sm font-bold block mb-1.5">진행도는 XP를 받은 활동만 셉니다</strong>
                    <p className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">
                      쿨타임에 걸린 채팅, 제외된 채널에서의 활동, 음소거로 막힌 음성은 진행도에 들어가지 않습니다.
                    </p>
                  </div>

                  <div className="mt-12">
                    <SectionHeader en="Inventory" title="받은 것은 인벤토리에 남습니다" />
                    <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                      {[
                        { t: "영구 보유 · N일 이용권", d: "기간이 있는 상품은 남은 날짜가 D-day로 붙습니다." },
                        { t: "지급 대기", d: "결제는 끝났고 역할 지급을 기다리는 중입니다." },
                        { t: "확인 필요", d: "구매 기록은 있는데 디스코드 역할이 확인되지 않습니다. 운영진에 문의해 주세요." },
                      ].map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-4 py-4">
                          <span className="shrink-0 text-[12px] font-bold text-[#131313] w-32 md:w-44">{r.t}</span>
                          <span className="min-w-0 flex-1 text-[12px] text-[#8a8a8a] leading-relaxed break-keep">{r.d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              )}

              {/* ═══ 05 규칙·시즌 ═══ */}
              {introSec === "rules" && (
                <Reveal>
                  <SectionHeader en="Commands" title="디스코드 명령어" />
                  <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                    {[
                      { c: "/레벨", d: "다음 레벨까지 필요한 XP" },
                      { c: "/랭크", d: "XP · 레벨 · 서버 순위" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-1 py-[18px] group hover:bg-black/[0.02] transition-colors">
                        <span className="text-[#e91e3f] font-mono font-bold text-sm tracking-tight">{item.c}</span>
                        <span className="text-[#8a8a8a] text-xs md:text-sm text-right">{item.d}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-12">
                    <SectionHeader
                      en="Season"
                      title={`SEASON ${SEASON.number} · ${SEASON.name}`}
                      right={<StatusChip accent dot>{seasonDday.ended ? "종료" : `D-${seasonDday.days}`}</StatusChip>}
                    />
                    <p className="text-[11px] font-bold text-[#a3a3a3] tabular-nums mb-3">
                      {SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")} · 경과 {seasonPct}%
                    </p>
                    <SegBar pct={seasonPct} segments={20} />
                    {!voiceTracked && (
                      <p className="text-[11px] text-[#a3a3a3] mt-4 break-keep">
                        누적 음성 시간은 {+VOICE_TIME_START.slice(5, 7)}월 {+VOICE_TIME_START.slice(8, 10)}일부터 집계되며, 시즌이 바뀌어도 이어집니다.
                      </p>
                    )}
                  </div>

                  <div className="mt-12">
                    <SectionHeader en="Notice" title="알아두실 것" />
                    <div className="space-y-5">
                      {[
                        ...(canSeeShop
                          ? [{ t: "구매하면 XP가 줄어듭니다", d: "ARCTIC 상품은 보유 XP를 소모합니다. 구매 후 레벨이 내려갈 수 있습니다." }]
                          : []),
                        ...(policy?.resetOnLeave
                          ? [{ t: "서버를 나가면 XP가 사라집니다", d: "서버 퇴장 시 보유 XP와 레벨이 삭제되며 복구되지 않습니다." }]
                          : []),
                        { t: "지급량은 바뀔 수 있습니다", d: "이 안내의 숫자는 현재 설정값입니다. 운영 상황에 따라 조정될 수 있습니다." },
                      ].map((item, i) => (
                        <div key={i} className="border-l-2 border-[#e91e3f]/50 pl-5 py-0.5">
                          <strong className="text-[#131313] text-sm font-bold block mb-1.5">{item.t}</strong>
                          <p className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{item.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              )}

              {/* 이전 / 다음 — 순서대로 완주할 수 있는 경로 */}
              <div className="mt-14 pt-5 border-t border-black/[0.08] flex items-center justify-between gap-4">
                {introPrev ? (
                  <button
                    onClick={() => goIntro(introPrev.id)}
                    className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                  >
                    ← {introPrev.label}
                  </button>
                ) : (
                  <span />
                )}
                <span className="shrink-0 text-[11px] font-black text-[#c4c4c4] tabular-nums">
                  {INTRO_STEPS[introIdx].no} / {INTRO_STEPS[INTRO_STEPS.length - 1].no}
                </span>
                {introNext ? (
                  <button
                    onClick={() => goIntro(introNext.id)}
                    className="text-[12px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                  >
                    {introNext.label} →
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveMainTab("my")}
                    className="text-[12px] font-bold text-[#e91e3f] hover:text-[#d01634] transition-colors outline-none focus:outline-none"
                  >
                    내 대시보드로 →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB : RANKING ════════════════ */}
        {activeMainTab === "rank" && (
          <Reveal>
            <SectionHeader
              en="Ranking"
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
                                <img src={r.avatar || ""} alt="" className="w-full h-full object-cover bg-[#e2e0dc]" />
                              </span>
                              {/* 순위는 원에 겹쳐 붙인다 — 따로 두면 원 크기가 달라 높이가 어긋난다 */}
                              <span
                                className={`absolute left-1/2 -translate-x-1/2 -bottom-2 inline-flex items-center justify-center rounded-full text-white font-black tabular-nums ring-2 ring-[#f5f3f0] ${first ? "w-7 h-7 text-[13px]" : "w-6 h-6 text-[11px]"}`}
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
                            medal ? "text-[15px] font-black text-[#e91e3f]" : "text-[13px] font-black text-[#c4c4c4]"
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
                      {rankPage + 1} <span className="text-[#c4c4c4]">/ {rankPages}</span>
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
                이번 달 획득은 봇이 기록한 지급 로그로 셉니다 — 기록은 60일간 보관됩니다.
              </p>
            )}
            {rankMode === "voice" && !voiceTracked && (
              <p className="text-[11px] text-[#a3a3a3] mt-5 break-keep">
                누적 음성 시간은 {+VOICE_TIME_START.slice(5, 7)}월 {+VOICE_TIME_START.slice(8, 10)}일부터 쌓이며, 시즌이 바뀌어도 이어집니다.
              </p>
            )}
          </Reveal>
        )}

        {/* ══ TAB : POLICY ═════════════════ */}
        {/* ══ TAB : TABLE ══════════════════ */}
        {activeMainTab === "table" && (
          <Reveal>
            <SectionHeader en="Table" title="XP 테이블" />

            <LuxCard className="p-6 md:p-8 mb-6" glow>
              <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-center">
                <div className="flex gap-2 shrink-0 w-full lg:w-auto">
                  <input
                    type="number"
                    value={searchLevel}
                    onChange={(e) => setSearchLevel(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="레벨 입력"
                    className="w-full lg:w-40 px-5 py-3.5 bg-white border border-black/10 rounded-xl text-[#131313] text-sm outline-none focus:outline-none focus:border-[#e91e3f] text-center transition-colors font-bold"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-6 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-all outline-none focus:outline-none shadow-[0_8px_24px_rgba(233,30,63,0.3)] shrink-0"
                  >
                    검색
                  </button>
                </div>
                <div className="flex-1 grid grid-cols-2 rounded-xl overflow-hidden bg-[#131313] divide-x divide-white/10">
                  <div className="px-4 py-5 text-center">
                    <span className="block text-[10px] font-black tracking-[0.2em] text-white/35 uppercase mb-2">누적 XP</span>
                    <span className="text-lg md:text-2xl font-black text-white tabular-nums tracking-tight">{searchResult.cumXp ? searchResult.cumXp.toLocaleString() : "—"}</span>
                  </div>
                  <div className="px-4 py-5 text-center">
                    <span className="block text-[10px] font-black tracking-[0.2em] text-white/35 uppercase mb-2">레벨업 필요 XP</span>
                    <span className="text-lg md:text-2xl font-black text-[#ff5c77] tabular-nums tracking-tight">{searchResult.reqXp !== null ? searchResult.reqXp.toLocaleString() : "—"}</span>
                  </div>
                </div>
              </div>
            </LuxCard>

            {/* 성장 곡선 — 표의 숫자를 한눈에 보는 그림 */}
            <div className="mb-10">
              <SectionHeader en="Curve" title="성장 곡선" />
              <LevelCurve myLevel={me?.level || null} />
            </div>

            <SectionHeader en="Full Table" title="전체 레벨 표" />
            <LuxCard className="overflow-hidden">
              <div className="max-h-[520px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-center text-xs">
                  <thead className="bg-[#ffffff] sticky top-0 z-10">
                    <tr className="text-[10px] font-black tracking-[0.15em] text-[#8a8a8a] uppercase">
                      <th className="p-4 border-b border-black/10">Level</th>
                      <th className="p-4 border-b border-black/10">누적 XP 총량</th>
                      <th className="p-4 border-b border-black/10">필요 XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.04] text-[#5a5a5a]">
                    {fullTableRows.map((row) => (
                      <tr
                        key={row.level}
                        id={`row-lvl-${row.level}`}
                        className={`hover:bg-black/[0.03] transition-colors ${searchResult.inputVal === row.level ? 'bg-[#e91e3f]/10' : ''}`}
                      >
                        <td className={`p-3 font-black ${searchResult.inputVal === row.level ? 'text-[#e91e3f]' : 'text-[#131313]/80'}`}>{row.level}</td>
                        <td className="p-3 text-[#4b4b4b] font-medium">{row.cumXp.toLocaleString()}</td>
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
            <SectionHeader en="Simulator" title="XP 시뮬레이터" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

              {/* ── 좌: 조건 설정 ── */}
              <LuxCard className="p-6 md:p-7">
                <div className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase mb-6">Configuration</div>

                {[
                  { l: "현재 유저 레벨", val: simLevel, set: setSimLevel, p: "0~1000", max: 1000 },
                  { l: "총 활동 시간 (분)", val: simTime, set: setSimTime, p: "0~999999", max: 999999 },
                  { l: "총 출석 횟수", val: simAttend, set: setSimAttend, p: "0~9999", max: 9999 },
                ].map((input, idx) => (
                  <div key={idx} className="flex justify-between items-center py-3.5 border-b border-black/5">
                    <label className="text-xs font-medium text-[#4b4b4b]">{input.l}</label>
                    <input
                      type="number"
                      placeholder={input.p}
                      value={input.val}
                      onChange={handleLimitInput(input.set, input.max)}
                      className="w-32 px-3 py-2 bg-white border border-black/10 rounded-lg text-[#131313] text-xs text-center outline-none focus:outline-none focus:border-[#e91e3f] transition-colors font-bold"
                    />
                  </div>
                ))}

                <div className="relative">
                  <div className="flex justify-between items-center py-3.5 border-b border-black/5">
                    <label className="text-xs font-medium text-[#4b4b4b]">이용 활동 채널</label>
                    <div className="w-32">
                      <button
                        type="button"
                        onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                        className="w-full px-3 py-2 bg-white border border-black/10 rounded-lg text-[#131313] text-xs outline-none focus:outline-none transition-colors hover:border-[#e91e3f]/50 flex justify-between items-center font-bold"
                      >
                        <span className="truncate">
                          {simChannel === 'chat' ? '채팅 (1분)' : simChannel === 'voice' ? `음성 (${P_voiceMin}분)` : `내전 (${P_voiceMin}분)`}
                        </span>
                        <span className="text-[9px] text-[#8a8a8a] ml-1">▼</span>
                      </button>

                      {isChannelDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsChannelDropdownOpen(false)}></div>
                          <div className="absolute top-full right-0 w-36 mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-2xl z-50">
                            {[
                              { val: 'chat', label: '채팅 채널 (1분)' },
                              { val: 'voice', label: '음성 채널 (5분)' },
                              { val: 'scrim', label: '내전 채널 (5분)' }
                            ].map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                onClick={() => { setSimChannel(opt.val); setIsChannelDropdownOpen(false); }}
                                className={`w-full text-left px-4 py-3 text-xs transition-colors outline-none focus:outline-none relative z-50 ${simChannel === opt.val ? 'bg-[#e91e3f]/15 text-[#e91e3f] font-bold' : 'text-[#5a5a5a] hover:bg-black/5 hover:text-[#131313]'}`}
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
                <div className="mt-5 rounded-xl border border-black/10 bg-black/[0.03] p-5">
                  <div className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase mb-4">Permanent Items</div>
                  <div className="flex justify-between items-center py-2.5 border-b border-black/5">
                    <label className="text-xs font-medium text-[#4b4b4b]">[아이템] XP Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost1(!simBoost1)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost1 ? 'bg-[#e91e3f]' : 'bg-black/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simBoost1 ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-2.5 border-b border-black/5">
                    <label className="text-xs font-medium text-[#4b4b4b]">[아이템] 출석 Boost 적용</label>
                    <button type="button" onClick={() => setSimAttendBoost(!simAttendBoost)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simAttendBoost ? 'bg-[#e91e3f]' : 'bg-black/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simAttendBoost ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>

                  <div className="pt-3">
                    <label className="text-xs font-medium text-[#4b4b4b] block mb-3">[아이템] 보유 펭귄 선택 (중복 가능)</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { l: "어린이 +250", val: penChild, set: setPenChild },
                        { l: "청소년 +350", val: penYouth, set: setPenYouth },
                        { l: "어른 +450", val: penAdult, set: setPenAdult },
                        { l: "어미 +550", val: penMother, set: setPenMother },
                      ].map((p, idx) => (
                        <button key={idx} type="button" onClick={() => p.set(!p.val)} className={`px-3.5 py-2 rounded-lg text-[11px] font-bold outline-none focus:outline-none transition-all border ${p.val ? 'bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_4px_14px_rgba(233,30,63,0.3)]' : 'bg-transparent border-black/10 text-[#8a8a8a] hover:border-black/30 hover:text-[#4b4b4b]'}`}>
                          {p.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={resetSimulator} className="mt-5 w-full py-3 bg-transparent border border-black/10 rounded-xl text-xs font-bold outline-none focus:outline-none text-[#8a8a8a] hover:text-[#131313] hover:border-black/30 transition-all">
                  전체 초기화
                </button>
              </LuxCard>

              {/* ── 우: 결과 ── */}
              <div className="md:sticky md:top-36 space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-[#131313] shadow-[0_30px_70px_-34px_rgba(0,0,0,0.55)]">
                  <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>
                  <div aria-hidden className="absolute -top-20 -right-16 w-72 h-72 bg-[#e91e3f]/[0.18] blur-[100px] rounded-full pointer-events-none"></div>
                  <div className="relative z-10 p-7">
                    <p className="text-[10px] font-black tracking-[0.3em] text-white/35 uppercase mb-6">Projection Result</p>
                    <p className="text-[11px] font-bold text-white/50 mb-2">예상 최종 누적</p>
                    <p className="text-4xl md:text-5xl font-black text-white tabular-nums tracking-tighter leading-none">
                      {simResult.projectedTotalXp.toLocaleString()}<span className="text-sm text-[#ff5c77] ml-2 font-bold">XP</span>
                    </p>
                    <div className="flex items-end justify-between mt-7 pt-6 border-t border-white/10">
                      <span className="text-[11px] font-bold text-white/50">도달 예상 레벨</span>
                      <span className="text-3xl font-black text-white tabular-nums leading-none" style={{ textShadow: "0 0 40px rgba(233,30,63,0.55)" }}>
                        <span className="text-[11px] font-black text-white/40 align-middle mr-1.5">LV</span>{simResult.finalLevel}
                      </span>
                    </div>
                    <p className="text-right text-[11px] font-bold text-white/40 mt-3 tabular-nums">예상 추가 획득 +{simResult.finalGrandTotal.toLocaleString()} XP</p>
                  </div>
                </div>

                <LuxCard className="p-6">
                  <div className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase mb-4">Breakdown</div>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-black/[0.04]">
                      {[
                        { l: "선택 채널 기본 XP (1회당)", v: `${simResult.channelBaseXp.toLocaleString()} XP` },
                        { l: "레벨별 구간 추가 XP (1회당)", v: `${simResult.levelBonusXp.toLocaleString()} XP` },
                        { l: "[채널] 1회 지급당 합계 XP", v: `${(simResult.channelBaseXp + simResult.levelBonusXp).toLocaleString()} XP` },
                        { l: "[채널] 예상 활동 인정 횟수", v: `${simResult.channelCycles}회` },
                        { l: "[채널] 활동 XP 획득 총량", v: `${simResult.channelTotalXp.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] XP Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b1Add.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] 펭귄 패밀리 추가 합산 (${simResult.cycleText})`, v: `${simResult.penguinAdd.toLocaleString()} XP` },
                        { l: `아이템 상품 [영구제] 출석 Boost 추가 합계`, v: `${simResult.attendanceBoostTotal.toLocaleString()} XP` },
                        { l: `[아이템] 적용 인정 횟수 (${simResult.cycleBaseText} 지속 기준)`, v: `${simResult.channelCycles}회` },
                        { l: "[버프] 아이템/이벤트 획득 총량", v: `${simResult.buffTotalXp.toLocaleString()} XP` },
                        { l: "[출석] 기본 출석 보상 합계", v: `${simResult.attendanceBaseTotal.toLocaleString()} XP` },
                      ].map((row, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 text-[#8a8a8a] break-keep pr-4">{row.l}</td>
                          <td className="py-2.5 text-right text-[#131313] font-bold whitespace-nowrap">{row.v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </LuxCard>

                {/* 🎯 목표 모드 */}
                <LuxCard className="p-6">
                  <div className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase mb-1.5">Goal Mode</div>
                  <p className="text-[11px] text-[#a3a3a3] mb-5 leading-relaxed">위 조건(레벨·채널·아이템) 기준으로, 목표 레벨까지 걸리는 예상 기간을 계산합니다.</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div>
                      <label className="block text-[10px] font-bold text-[#8a8a8a] mb-1.5">목표 레벨</label>
                      <input type="number" placeholder="예: 500" value={goalLevel} onChange={handleLimitInput(setGoalLevel, 1000)} className="w-full px-3 py-2.5 bg-white border border-black/10 rounded-lg text-[#131313] text-xs text-center outline-none focus:border-[#e91e3f] transition-colors font-bold" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8a8a8a] mb-1.5">하루 활동 시간 (분)</label>
                      <input type="number" placeholder="예: 120" value={goalDailyTime} onChange={handleLimitInput(setGoalDailyTime, 1440)} className="w-full px-3 py-2.5 bg-white border border-black/10 rounded-lg text-[#131313] text-xs text-center outline-none focus:border-[#e91e3f] transition-colors font-bold" />
                    </div>
                  </div>

                  {goalResult ? (
                    <div className="rounded-xl border border-[#e91e3f]/20 bg-gradient-to-b from-[#e91e3f]/[0.06] to-transparent p-5 text-center">
                      <p className="text-[10px] font-bold text-[#8a8a8a] mb-2">Lv.{goalResult.targetLv} 도달까지</p>
                      <p className="text-3xl font-black text-[#e91e3f] tracking-tighter mb-1.5">
                        약 {goalResult.days.toLocaleString()}일
                        {goalResult.months > 0 && <span className="text-sm text-[#5a5a5a] font-bold ml-2">({goalResult.months}개월 {goalResult.remDays}일)</span>}
                      </p>
                      <p className="text-[10px] text-[#8a8a8a]">필요 XP {goalResult.neededXp.toLocaleString()} · 일일 예상 획득 {goalResult.dailyXp.toLocaleString()} XP (출석 1회 포함)</p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-black/5 bg-black/[0.02] p-5 text-center text-[11px] text-[#a3a3a3]">
                      목표 레벨과 하루 활동 시간을 입력하면<br/>예상 소요 기간이 표시됩니다.
                    </div>
                  )}
                </LuxCard>
              </div>

            </div>
          </Reveal>
        )}
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
