"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { signIn, useSession } from "next-auth/react";
import { ScrollProgress } from "../components/Lux";
import {
  HudPanel, HudSection, HudStyles, LiveDot, RingGauge, SegBar,
  StatusChip, SegLadder, TickRuler, RankRows, EmptySlot,
} from "../components/Hud";
import { SEASON, getSeasonProgress } from "@/lib/season";

const DISCORD_URL = "https://discord.gg/V2uW2nUczU";

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

// 음성 XP 구간 경계 — TIER_STEPS와 1:1 (15구간)
const TIER_BOUNDS = [0, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 649, 700];

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
          <p className="text-[10px] font-black tracking-[0.3em] text-gray-600 uppercase mb-1.5">Growth Curve · Lv 1 → 1,000</p>
          <p className="text-3xl md:text-4xl font-black text-white tracking-tight tabular-nums">
            Lv {lv.toLocaleString()}
            <span className={`ml-2 text-xs font-bold align-middle ${probe ? "text-[#e91e3f]" : hasMe ? "text-white" : "text-gray-600"}`}>{modeLabel}</span>
          </p>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1">누적 XP</p>
            <p className="text-base md:text-lg font-black text-[#e91e3f] tabular-nums">{cum.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1">이 레벨 필요 XP</p>
            <p className="text-base md:text-lg font-black text-white tabular-nums">{req.toLocaleString()}</p>
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
            <line key={r} x1="0" x2={W} y1={PT + (H - PB - PT) * r} y2={PT + (H - PB - PT) * r} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          ))}
          <polygon points={`0,${H - PB} ${path.replace(/[ML]/g, " ").trim()} ${W},${H - PB}`} fill="url(#lvFill)" />
          <path d={path} fill="none" stroke="#e91e3f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 8px rgba(233,30,63,0.5))" }} />
          {/* 마일스톤 */}
          {milestones.map((m) => (
            <g key={m}>
              <circle cx={X(m)} cy={Y(getCumulativeXpByLevel(m))} r="3.5" fill="#0b0b0b" stroke="#e91e3f" strokeWidth="2" />
              <text x={X(m)} y={H - PB + 20} textAnchor={m === 1000 ? "end" : "middle"} fill="rgba(255,255,255,0.35)" fontSize="11" fontWeight="800">{m}</text>
            </g>
          ))}
          {/* 내 위치(YOU) 마커 — 로그인 시 실데이터 연동 */}
          {hasMe && (
            <g>
              <line x1={X(myLevel)} x2={X(myLevel)} y1={Y(getCumulativeXpByLevel(myLevel))} y2={H - PB} stroke="rgba(255,255,255,0.25)" strokeWidth="1" strokeDasharray="2 4" />
              <circle cx={X(myLevel)} cy={Y(getCumulativeXpByLevel(myLevel))} r="5" fill="#ffffff" stroke="#e91e3f" strokeWidth="2.5" style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.8))" }} />
              <text
                x={Math.min(Math.max(X(myLevel), 30), W - 30)}
                y={Math.max(Y(getCumulativeXpByLevel(myLevel)) - 14, 12)}
                textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="900" letterSpacing="1"
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
          <line x1="0" x2={W} y1={H - PB} y2={H - PB} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        </svg>
      </div>
      <p className="text-[10px] text-gray-700 mt-2">곡선 위에 마우스를 올리거나 터치하면 해당 레벨의 XP를 확인할 수 있습니다.</p>
    </div>
  );
};

// 📌 레벨 구간별 음성 XP 계단 차트 — 표 대신 '레벨이 오를수록 쌓이는 계단'을 그대로 보여준다
const TIER_STEPS = [
  { lv: "0", xp: 3000 }, { lv: "50", xp: 3150 }, { lv: "100", xp: 3250 }, { lv: "150", xp: 3350 },
  { lv: "200", xp: 3500 }, { lv: "250", xp: 3600 }, { lv: "300", xp: 3700 }, { lv: "350", xp: 3800 },
  { lv: "400", xp: 4000 }, { lv: "450", xp: 4200 }, { lv: "500", xp: 4400 }, { lv: "550", xp: 4600 },
  { lv: "600", xp: 4800 }, { lv: "649", xp: 5000 }, { lv: "700+", xp: 6000 },
];
const TierStairs = () => {
  const min = 2700, max = 6000;
  return (
    <div>
      <div className="flex items-end gap-[3px] md:gap-1.5 h-44 md:h-52">
        {TIER_STEPS.map((t, i) => {
          const hRatio = (t.xp - min) / (max - min);
          const top = i === TIER_STEPS.length - 1;
          return (
            <div key={t.lv} className="group relative flex-1 flex flex-col items-center justify-end h-full">
              <span className={`hidden md:block text-[9px] font-black mb-1.5 tabular-nums transition-colors ${top ? "text-[#e91e3f]" : "text-gray-600 group-hover:text-white"}`}>{(t.xp / 1000).toFixed(t.xp % 1000 ? 2 : 0).replace(/\.?0+$/, "")}k</span>
              <div
                className={`w-full rounded-t-[4px] transition-all duration-300 ${top ? "bg-gradient-to-t from-[#e91e3f]/60 to-[#e91e3f] shadow-[0_0_18px_rgba(233,30,63,0.4)]" : "bg-gradient-to-t from-white/[0.07] to-white/[0.16] group-hover:from-[#e91e3f]/30 group-hover:to-[#e91e3f]/70"}`}
                style={{ height: `${8 + hRatio * 88}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] md:gap-1.5 border-t border-white/10 pt-2 mt-0.5">
        {TIER_STEPS.map((t) => (
          <span key={t.lv} className="flex-1 text-center text-[8px] md:text-[10px] font-bold text-gray-600 tabular-nums">{t.lv}</span>
        ))}
      </div>
      <p className="text-[10px] text-gray-700 mt-3">진입 레벨 구간별 음성 채널 5분당 지급 XP · 700 레벨 이상은 최고 구간(+6,000)</p>
    </div>
  );
};

// 📌 시즌 설정은 lib/season.js 공용 상수 사용 (홈 티커와 단일 소스)

export default function LevelPage() {
  // 리뉴얼: 정적 안내 대신 '내 대시보드'가 첫 화면
  const [activeMainTab, setActiveMainTab] = useState("my");
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

  const loadMe = useCallback(async () => {
    try {
      const [meRes, logRes] = await Promise.all([
        fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/my-logs", { cache: "no-store" }).then((r) => r.json()),
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
    } catch {}
    setMeLoaded(true);
  }, [pushToast]);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!session?.user) { setMe(null); setMyLogs(null); prevXpRef.current = null; setMeLoaded(true); return; }
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

  // 음성 티어 — 현재 구간 인덱스와 다음 승급 정보
  const tierIdx = TIER_BOUNDS.reduce((acc, b, i) => ((me?.level ?? 0) >= b ? i : acc), 0);
  const tierCur = TIER_STEPS[tierIdx];
  const tierNext = TIER_STEPS[tierIdx + 1] || null;
  const tierNextBound = TIER_BOUNDS[tierIdx + 1] ?? null;

  // 킬피드 확장 토글 — 내부 스크롤 대신 6건 + 전체 보기 (이중 스크롤 회피)
  const [feedOpen, setFeedOpen] = useState(false);

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
  };
  const P_voiceMin = Math.max(1, Math.round(P.voiceIntervalSec / 60));
  const P_chatCooldownLabel = P.chatCooldownSec >= 60 ? `${Math.round(P.chatCooldownSec / 60)}분` : `${P.chatCooldownSec}초`;
  const P_scrimXp = P.voiceXp + 500; // 내전 채널은 기본 음성 + 500

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
      channelBaseXp = P.chatXp; levelBonusXp = 0; checkInterval = Math.max(1, Math.round(P.chatCooldownSec / 60));
    } else {
      checkInterval = P_voiceMin;
      channelBaseXp = simChannel === "voice" ? P.voiceXp : P_scrimXp;
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
    const attendanceBaseTotal = attendanceCount * P.attendXp;
    const attendanceBoostTotal = simAttendBoost ? attendanceCount * P.attendXp : 0;

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
    const checkInterval = simChannel === "chat" ? Math.max(1, Math.round(P.chatCooldownSec / 60)) : P_voiceMin;
    const perCycle = simResult.channelBaseXp + simResult.levelBonusXp + simResult.b1Add + simResult.b2Add + simResult.evAdd + simResult.penguinAdd;
    const cyclesPerDay = Math.floor(dailyMin / checkInterval);
    const attendDaily = P.attendXp + (simAttendBoost ? P.attendXp : 0); // 하루 1회 출석 가정
    const dailyXp = perCycle * cyclesPerDay + attendDaily;
    if (dailyXp <= 0) return null;

    const days = Math.ceil(neededXp / dailyXp);
    return { neededXp, dailyXp, days, months: Math.floor(days / 30), remDays: days % 30, targetLv };
  }, [simLevel, goalLevel, goalDailyTime, simChannel, simResult, simAttendBoost]);

  return (
    // ⚠️ main에 overflow-hidden 금지 — 하위 sticky(탭바)가 죽는다. 글로우 가로 넘침은 body의 overflow-x: clip이 전역 처리
    <main className="w-full flex-1 flex flex-col relative">
      <ScrollProgress />
      <HudStyles />
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
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes barSheen {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(320%); }
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

      {/* ── HERO — 문서형 탭에서만. '내 대시보드'는 자체 HUD 헤더를 쓴다 ── */}
      {activeMainTab !== "my" && (
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

          {/* 📌 시그니처 — 레벨 성장 곡선. 박스 대신 곡선 하나가 이 페이지의 얼굴이 된다 */}
          <Reveal delay={200}>
            <div className="mt-14 border-t border-white/[0.08] pt-10">
              <LevelCurve myLevel={session?.user ? me?.level ?? null : null} />
            </div>
          </Reveal>

          {/* 핵심 수치 — 카드 없이 헤어라인으로만 구분 */}
          <Reveal delay={300}>
            <div className="grid grid-cols-3 mt-10 border-y border-white/[0.08] divide-x divide-white/[0.08]">
              {[
                { n: 1000, l: "MAX LEVEL" },
                { n: P.attendXp, l: "출석 1회 XP" },
                { n: P_scrimXp, l: "내전 채널 XP" },
              ].map((stat, i) => (
                <div key={i} className="py-6 md:py-8 text-center group">
                  <div className="text-2xl md:text-4xl font-black text-white group-hover:text-[#e91e3f] transition-colors tracking-tight tabular-nums">
                    <CountUp end={stat.n} />
                  </div>
                  <div className="text-[9px] md:text-[10px] font-bold tracking-[0.25em] text-gray-600 mt-2 uppercase">{stat.l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
      )}

      {/* ── TAB NAV — 섹션 넘버링과 호응하는 에디토리얼 인덱스 탭 ─────── */}
      <div className="w-full px-6 bg-[#090909]/85 backdrop-blur-xl border-b border-white/[0.08]">
        <div className={`${activeMainTab === "my" ? "max-w-7xl" : "max-w-5xl"} mx-auto flex gap-7 md:gap-10 overflow-x-auto no-bar`}>
          {[
            { id: "my", name: "내 대시보드" },
            { id: "intro", name: "시스템 소개" },
            { id: "policy", name: "XP 획득 및 혜택" },
            { id: "table", name: "XP 테이블" },
            { id: "sim", name: "XP 시뮬레이터" },
          ].map((tab, i) => {
            const active = activeMainTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveMainTab(tab.id)}
                className={`group relative py-4 flex items-baseline gap-2 text-[13px] md:text-sm font-black shrink-0 outline-none focus:outline-none transition-colors duration-300 ${
                  active ? "text-white" : "text-gray-600 hover:text-gray-300"
                }`}
              >
                <span className={`text-[10px] font-black tabular-nums transition-colors duration-300 ${active ? "text-[#e91e3f]" : "text-gray-700 group-hover:text-gray-500"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {tab.name}
                <span className={`absolute left-0 right-0 bottom-0 h-[2px] bg-[#e91e3f] origin-left transition-transform duration-300 ${active ? "scale-x-100 shadow-[0_0_10px_rgba(233,30,63,0.6)]" : "scale-x-0"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* 대시보드 탭은 좌우 공간을 쓰는 와이드 HUD(7xl), 문서형 탭은 기존 에디토리얼 폭 유지 */}
      <div className={activeMainTab === "my" ? "w-full max-w-7xl mx-auto px-5 md:px-8 py-6 md:py-10 flex-1" : "w-full max-w-5xl mx-auto px-6 py-14 flex-1"}>

        {/* ══ TAB : MY DASHBOARD — OBSERVER OVERLAY (선수 1인칭 시점) ══
               박스 카드 대신 헤어라인·타이포 직결 배치. 박스는 킬피드 1곳만.
               시머 예산: LV 수치 1곳 · 레드는 신호(LIVE/나/게이지) 전용 ══ */}
        {activeMainTab === "my" && (
          <div>
            {/* ── 밴드 0 · 상태 바 ── */}
            <div className="flex flex-wrap items-center justify-between gap-y-2.5 border-b border-white/[0.08] pb-3.5">
              <div className="flex items-center gap-3">
                <span aria-hidden className="w-1.5 h-1.5 rotate-45 bg-[#e91e3f] shrink-0"></span>
                <span className="text-[10px] font-black tracking-[0.3em] text-gray-400 uppercase">Season {SEASON.number} · <span className="text-white/80">{SEASON.name}</span></span>
                <span className="hidden md:inline text-[10px] font-bold text-gray-600 tabular-nums">{SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")}</span>
                {!seasonDday.ended && seasonDday.days >= 0 && <StatusChip accent>D-{seasonDday.days}</StatusChip>}
              </div>
              {authReady && session?.user && (
                <div className="flex items-center gap-2.5">
                  <LiveDot />
                  <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">Sync 30s</span>
                  {lastSync && <span className="hidden md:inline text-[10px] font-bold text-gray-600 tabular-nums">{lastSync.toLocaleTimeString("ko-KR", { hour12: false })}</span>}
                  <button onClick={() => loadMe().then(() => pushToast("동기화 완료"))} className="text-[10px] font-black tracking-[0.15em] uppercase text-gray-600 hover:text-white transition-colors outline-none focus:outline-none">갱신</button>
                </div>
              )}
            </div>

            {/* ── 로딩 스켈레톤 ── */}
            {(!authReady || (session?.user && !meLoaded)) && (
              <div className="pt-8">
                <div className="h-20 border-b border-white/[0.06] mb-8 animate-pulse bg-white/[0.02] rounded"></div>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-3 h-72 animate-pulse bg-white/[0.03] rounded"></div>
                  <div className="lg:col-span-6 h-72 animate-pulse bg-white/[0.03] rounded"></div>
                  <div className="lg:col-span-3 h-72 animate-pulse bg-white/[0.03] rounded"></div>
                </div>
              </div>
            )}

            {/* ── 비로그인 · SPECTATOR MODE 락 스크린 (가짜 수치 금지 — 전부 —) ── */}
            {authReady && !session?.user && (
              <div className="pt-8">
                <div className="relative">
                  <div aria-hidden className="opacity-40 pointer-events-none select-none">
                    {/* 플레이어 스코어바 셸 */}
                    <div className="grid grid-cols-2 md:grid-cols-12 items-center gap-y-4 border-b border-white/[0.08] pb-6">
                      <div className="col-span-2 md:col-span-5 flex items-center gap-4">
                        <div className="relative w-14 h-14 rounded-lg bg-white/[0.05] flex items-center justify-center">
                          <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" /></svg>
                          <span className="hud-c hud-c-tl"></span><span className="hud-c hud-c-tr"></span><span className="hud-c hud-c-bl"></span><span className="hud-c hud-c-br"></span>
                        </div>
                        <p className="text-xl font-black text-gray-700">— — —</p>
                      </div>
                      <div className="md:col-span-4 grid grid-cols-3 text-center">
                        {["Level", "Rank", "Top"].map((l) => (
                          <div key={l}><p className="text-[9px] font-black tracking-[0.25em] text-gray-700 uppercase mb-1.5">{l}</p><p className="text-2xl font-black text-gray-700 tabular-nums">—</p></div>
                        ))}
                      </div>
                      <div className="hidden md:flex md:col-span-3 justify-end"><StatusChip>— XP</StatusChip></div>
                    </div>
                    {/* 3열 축약 셸 */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-white/[0.06] pt-8 pb-4">
                      <div className="lg:col-span-3 lg:pr-7">
                        <div className="flex justify-center mb-4"><RingGauge pct={0} size={140}><p className="text-2xl font-black text-gray-700">—</p></RingGauge></div>
                        <TickRuler /><SegBar pct={0} segments={10} />
                      </div>
                      <div className="lg:col-span-6 lg:px-7 mt-8 lg:mt-0">
                        <div className="h-2.5 rounded-[3px] bg-white/[0.05] mb-6"></div>
                        <div className="h-2.5 rounded-[3px] bg-white/[0.05] mb-6"></div>
                        <div className="h-28 border border-dashed border-white/10 rounded-lg"></div>
                      </div>
                      <div className="lg:col-span-3 lg:pl-7 mt-8 lg:mt-0">
                        {[0, 1, 2].map((i) => <div key={i} className="flex items-center h-10 gap-3 border-b border-white/[0.05]"><span className="w-1.5 h-1.5 rounded-full bg-white/15"></span><span className="text-xs font-black text-gray-700">+ —</span><span className="flex-1 text-[11px] text-gray-800">———</span></div>)}
                      </div>
                    </div>
                  </div>
                  {/* 락 카드 — 화면 유일의 솔리드 레드 버튼 */}
                  <div className="absolute inset-0 z-10 flex items-center justify-center px-4">
                    <HudPanel accent glow className="w-full max-w-sm bg-[#0c0c0c] px-7 py-9 md:px-9 text-center">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto mb-4" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5"><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                      <p className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase mb-2.5">Spectator Mode — Overlay Locked</p>
                      <p className="text-sm font-bold text-white mb-1.5">나의 오버레이가 잠겨 있습니다</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed mb-7 break-keep">로그인하면 레벨·순위·획득 로그가<br />실시간 오버레이로 활성화됩니다.</p>
                      <button onClick={() => signIn("discord", { callbackUrl: "/level" })} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-xs font-black tracking-[0.2em] uppercase rounded-lg transition-colors shadow-[0_10px_30px_rgba(233,30,63,0.35)] outline-none focus:outline-none">Discord로 로그인</button>
                      {process.env.NODE_ENV === "development" && (
                        <button onClick={() => signIn("devlogin", { callbackUrl: "/level" })} className="mt-3.5 text-[11px] font-bold text-gray-600 hover:text-white underline underline-offset-4 transition-colors outline-none focus:outline-none">로컬 확인용 로그인 (dev)</button>
                      )}
                    </HudPanel>
                  </div>
                </div>

                {/* 공개 섹션 — 관전자에게도 실데이터 (리더보드가 후킹) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-white/[0.06] mt-12">
                  <div className="lg:col-span-6 lg:pr-8 min-w-0">
                    <HudSection label="01 · Trajectory" right={<span className="text-[11px] font-bold text-gray-600">Lv 1 → 1,000 성장 곡선</span>}>
                      <LevelCurve />
                    </HudSection>
                  </div>
                  <div className="lg:col-span-6 lg:pl-8 mt-10 lg:mt-0 min-w-0">
                    <HudSection
                      label="02 · Standings"
                      right={
                        <span className="flex items-center gap-3">
                          {["all", "month"].map((k) => (
                            <button key={k} onClick={() => setLbTab(k)} className={`text-[10px] font-black tracking-[0.15em] uppercase transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-white border-b-2 border-[#e91e3f]" : "text-gray-600 hover:text-gray-400"}`}>{k === "all" ? "누적" : "이번 달"}</button>
                          ))}
                        </span>
                      }
                    >
                      {!lb[lbTab] ? (
                        <div className="py-10 text-center text-[11px] font-bold text-gray-700">불러오는 중…</div>
                      ) : !lb[lbTab].data?.length ? (
                        <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                      ) : (
                        <RankRows rows={lb[lbTab].data} />
                      )}
                    </HudSection>
                  </div>
                </div>
              </div>
            )}

            {/* ── 로그인 · 활성 오버레이 ── */}
            {authReady && session?.user && meLoaded && me && (
              <div>
                {/* 밴드 1 · 플레이어 스코어바 */}
                <div className="grid grid-cols-2 md:grid-cols-12 items-center gap-y-5 border-b border-white/[0.08] py-6 md:py-7">
                  <div className="col-span-2 md:col-span-5 flex items-center gap-4 min-w-0">
                    <div className="relative shrink-0 w-14 h-14 md:w-16 md:h-16">
                      {session.user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={session.user.image} alt="" className="w-full h-full rounded-lg object-cover" />
                      ) : (
                        <span className="w-full h-full rounded-lg bg-white/[0.06] flex items-center justify-center text-xl font-black text-white/50">{(session.user.name || "?").slice(0, 1)}</span>
                      )}
                      <span aria-hidden className="hud-c hud-c-tl hud-c-accent"></span>
                      <span aria-hidden className="hud-c hud-c-tr hud-c-accent"></span>
                      <span aria-hidden className="hud-c hud-c-bl hud-c-accent"></span>
                      <span aria-hidden className="hud-c hud-c-br hud-c-accent"></span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl md:text-2xl font-black text-white truncate tracking-tight leading-none">{session.user.name}</p>
                      <p className="text-[10px] font-black tracking-[0.25em] text-gray-600 uppercase mt-2">Player Overlay · Season {SEASON.number}</p>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-4 grid grid-cols-3 md:divide-x md:divide-white/[0.08]">
                    <div className="text-center">
                      <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1.5">Level</p>
                      <p className="text-3xl md:text-4xl font-black tabular-nums tracking-tight leading-none"><span className="lux-shimmer">{me.level}</span></p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1.5">Rank</p>
                      <p className="text-xl md:text-2xl font-black text-white tabular-nums leading-none pt-1.5">#{me.rank.toLocaleString()}<span className="text-[10px] text-gray-600 font-bold"> /{me.total.toLocaleString()}</span></p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1.5">Top</p>
                      <p className="text-xl md:text-2xl font-black text-[#e91e3f] tabular-nums leading-none pt-1.5">{rankPct}%</p>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex md:justify-end">
                    <StatusChip accent={todayTotal > 0} dot={todayTotal > 0} dotColor="bg-[#e91e3f]">Today +{todayTotal.toLocaleString()} XP</StatusChip>
                  </div>
                </div>

                {/* 밴드 2 · 3열 본체 — 좌 계기 / 중앙 전장 / 우 퀘스트·피드 */}
                <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x lg:divide-white/[0.06] pt-9">

                  {/* 좌 레일 — 내 상태 계기 */}
                  <div className="order-1 lg:col-span-3 lg:pr-7 space-y-10 min-w-0">
                    <HudSection label="01 · Progress" right={<span className="text-[11px] font-bold text-gray-600">레벨 진행</span>}>
                      <div className="flex justify-center mb-6">
                        <RingGauge pct={progPct} size={160}>
                          <div className="text-center">
                            <p className="text-[9px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1">Level</p>
                            <p className="text-3xl font-black text-white tabular-nums leading-none">{me.level}</p>
                            <p className="text-[11px] font-black text-[#e91e3f] tabular-nums mt-1.5">{progPct}%</p>
                          </div>
                        </RingGauge>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-gray-600 tabular-nums mb-2">
                        <span>{prog.current.toLocaleString()}</span>
                        <span>{prog.required.toLocaleString()} XP</span>
                      </div>
                      <TickRuler />
                      <SegBar pct={progPct} segments={10} sheen />
                      <p className="text-[11px] font-bold text-gray-500 mt-3 text-right">다음 레벨까지 <b className="text-[#e91e3f] tabular-nums">{prog.needToNext.toLocaleString()} XP</b></p>
                    </HudSection>

                    <HudSection label="02 · Voice Tier" right={<span className="text-[11px] font-bold text-gray-600">음성 5분당</span>}>
                      <div className="flex items-end justify-between mb-1.5">
                        <p className="text-3xl font-black text-white tabular-nums leading-none">+{tierCur.xp.toLocaleString()}</p>
                        {tierNext ? (
                          <span className="text-[10px] font-bold text-gray-600 tabular-nums">NEXT +{tierNext.xp.toLocaleString()}</span>
                        ) : (
                          <StatusChip accent>Max Tier</StatusChip>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-gray-600 tabular-nums mb-2">현재 구간 Lv.{TIER_BOUNDS[tierIdx]}{tierNextBound !== null ? ` – ${tierNextBound - 1}` : "+"}</p>
                      <SegLadder total={TIER_STEPS.length} currentIndex={tierIdx} titles={TIER_STEPS.map((t) => `Lv.${t.lv} — +${t.xp.toLocaleString()} XP`)} />
                      {tierNext && tierNextBound !== null && (
                        <p className="text-[11px] font-bold text-gray-500 mt-3.5 break-keep">
                          <span className="text-[#e91e3f]">▲</span> Lv.{tierNextBound} 도달 시 +{tierNext.xp.toLocaleString()}
                          <span className="text-gray-600 tabular-nums ml-2">{Math.max(0, tierNextBound - me.level)} LEVELS TO GO</span>
                        </p>
                      )}
                    </HudSection>

                    <HudSection label="03 · Season">
                      <div className="flex items-end justify-between mb-3">
                        <p className="text-sm font-black text-white tracking-tight">SEASON {SEASON.number} <span className="text-gray-500">&apos;{SEASON.name}&apos;</span></p>
                        {!seasonDday.ended && seasonDday.days >= 0 && <p className="text-2xl font-black text-[#e91e3f] tabular-nums leading-none">D-{seasonDday.days}</p>}
                      </div>
                      <TickRuler />
                      {/* 시즌 경과율 — 모노크롬 fill (레드는 신호 전용) */}
                      <div className="h-1.5 rounded-[3px] bg-white/[0.06] overflow-hidden">
                        <div className="h-full bg-white/25" style={{ width: `${seasonPct}%` }}></div>
                      </div>
                      <p className="text-[10px] font-bold text-gray-600 tabular-nums mt-2">{SEASON.start.replace(/-/g, ".")} ~ {SEASON.end.replace(/-/g, ".")} · 경과 {seasonPct}%</p>
                    </HudSection>
                  </div>

                  {/* 중앙 스테이지 — 전장 정보 */}
                  <div className="order-3 lg:order-2 lg:col-span-6 lg:px-7 mt-10 lg:mt-0 space-y-10 min-w-0">
                    <HudSection label="04 · Acquisition" live accent right={<span className="text-[11px] font-bold text-gray-600">채팅 · 음성 · 출석</span>}>
                      <div className="space-y-6">
                        {[
                          { key: "today", label: "Today", data: myLogs?.today },
                          { key: "month", label: "This Month", data: myLogs?.month },
                        ].map(({ key, label, data }) => {
                          const total = data?.total ?? 0;
                          return (
                            <div key={key}>
                              <div className="flex items-baseline justify-between mb-2">
                                <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">{label}</span>
                                <span className="text-xl font-black text-white tabular-nums">+{total.toLocaleString()} <span className="text-[10px] font-bold text-gray-600">XP</span></span>
                              </div>
                              {total > 0 ? (
                                <>
                                  <div className="flex h-2.5 rounded-[3px] overflow-hidden bg-white/[0.05]">
                                    {["chat", "voice", "attend"].map((r) => (
                                      <div key={r} style={{ width: `${((data?.[r] || 0) / total) * 100}%`, background: REASON_COLORS[r] }}></div>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                                    {["chat", "voice", "attend"].map((r) => (
                                      <span key={r} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-gray-500 tabular-nums">
                                        <span className="w-2 h-2 rounded-[2px]" style={{ background: REASON_COLORS[r] }}></span>
                                        {REASON_LABELS[r]} {(data?.[r] || 0).toLocaleString()}
                                        <span className="text-gray-700">{Math.round(((data?.[r] || 0) / total) * 100)}%</span>
                                      </span>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <EmptySlot className="h-[52px]">NO INTAKE — 활동하면 채워집니다</EmptySlot>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </HudSection>

                    <HudSection label="05 · Trajectory" right={<span className="text-[11px] font-bold text-gray-600">Lv 1 → 1,000 성장 곡선</span>}>
                      <LevelCurve myLevel={me.level} />
                    </HudSection>

                    <HudSection
                      label="06 · Standings"
                      right={
                        <span className="flex items-center gap-3">
                          {["all", "month"].map((k) => (
                            <button key={k} onClick={() => setLbTab(k)} className={`text-[10px] font-black tracking-[0.15em] uppercase transition-colors outline-none focus:outline-none pb-0.5 ${lbTab === k ? "text-white border-b-2 border-[#e91e3f]" : "text-gray-600 hover:text-gray-400"}`}>{k === "all" ? "누적" : "이번 달"}</button>
                          ))}
                        </span>
                      }
                    >
                      {!lb[lbTab] ? (
                        <div className="py-10 text-center text-[11px] font-bold text-gray-700">불러오는 중…</div>
                      ) : !lb[lbTab].data?.length ? (
                        <EmptySlot>아직 집계된 기록이 없습니다</EmptySlot>
                      ) : (
                        <RankRows rows={lb[lbTab].data} myId={session.user.id} me={lbTab === "all" ? me : null} myName={session.user.name} />
                      )}
                      {lbTab === "month" && <p className="text-[10px] text-gray-700 mt-2.5">이번 달 지급 로그 합산 기준 · 매월 1일(KST) 초기화</p>}
                    </HudSection>
                  </div>

                  {/* 우 레일 — 퀘스트·피드 */}
                  <div className="order-2 lg:order-3 lg:col-span-3 lg:pl-7 mt-10 lg:mt-0 space-y-10 min-w-0">
                    <HudSection label="07 · Daily" right={attendedToday ? <StatusChip dot>Complete</StatusChip> : <StatusChip accent>Open</StatusChip>}>
                      <div className={attendedToday ? "opacity-50" : ""}>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-sm font-bold text-white">매일 출석 체크</p>
                          <p className="text-[11px] font-black text-[#e91e3f] tabular-nums shrink-0">+{P.attendXp.toLocaleString()} XP</p>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed mb-4 break-keep">디스코드에서 아래 명령을 입력하면 즉시 지급되고, 이 화면에 실시간 반영됩니다.</p>
                        <div className="flex items-center gap-3">
                          <code className="px-3 py-1.5 rounded bg-white/[0.05] border border-white/10 text-[12px] font-mono font-bold text-white/80">/출석체크</code>
                          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-gray-600 hover:text-white transition-colors">디스코드에서 받기 ↗</a>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-white/[0.08] border-t border-white/[0.08] mt-5 pt-4">
                        <div className="text-center">
                          <p className="text-[9px] font-black tracking-[0.22em] text-gray-600 uppercase mb-1.5">누적 출석</p>
                          <p className="text-base font-black text-white tabular-nums">{(me.attendCount || 0).toLocaleString()}<span className="text-[10px] text-gray-600 font-bold ml-0.5">일</span></p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] font-black tracking-[0.22em] text-gray-600 uppercase mb-1.5">마지막 출석</p>
                          <p className="text-base font-black text-white tabular-nums">{me.lastAttendDate ? me.lastAttendDate.replace(/-/g, ".") : "—"}</p>
                        </div>
                      </div>
                    </HudSection>

                    <HudSection label="08 · Killfeed" live accent right={<span className="text-[11px] font-bold text-gray-600 tabular-nums">{myLogs?.logs?.length || 0}건</span>}>
                      {/* 화면 유일의 박스 — 피드는 담을 그릇이 필요하다 */}
                      <HudPanel accent className="px-4 py-1.5">
                        {myLogs?.logs?.length ? (
                          <>
                            {(feedOpen ? myLogs.logs : myLogs.logs.slice(0, 6)).map((l, i) => (
                              <div key={`${l.createdAt}-${i}`} className="flex items-center h-10 gap-3 border-b border-white/[0.05] last:border-0">
                                <span aria-hidden className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: REASON_COLORS[l.reason] || "#6b7280" }}></span>
                                <span className="shrink-0 w-14 text-xs font-black text-[#e91e3f] tabular-nums">+{(l.amount || 0).toLocaleString()}</span>
                                <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-gray-400">{l.channelName || (l.reason === "attend" ? "출석 체크" : REASON_LABELS[l.reason] || "—")}</span>
                                <span className="shrink-0 text-[10px] font-bold text-gray-600 tabular-nums">{fmtRel(l.createdAt)}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="py-8 text-center text-[11px] font-bold text-gray-700 leading-relaxed">기록 없음 — 첫 활동을 시작하세요</p>
                        )}
                      </HudPanel>
                      {(myLogs?.logs?.length || 0) > 6 && (
                        <button onClick={() => setFeedOpen((v) => !v)} className="block w-full text-center text-[11px] font-bold text-gray-600 hover:text-white transition-colors mt-3 outline-none focus:outline-none">
                          {feedOpen ? "접기 ↑" : `전체 ${myLogs.logs.length}건 보기 ↓`}
                        </button>
                      )}
                    </HudSection>
                  </div>
                </div>
              </div>
            )}

            {/* ── 로그인했지만 조회 실패 ── */}
            {authReady && session?.user && meLoaded && !me && (
              <div className="py-16 text-center">
                <p className="text-sm text-gray-400 mb-5">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
                <button onClick={() => loadMe()} className="px-6 py-2.5 border border-[#e91e3f]/40 text-[#e91e3f] hover:bg-[#e91e3f] hover:text-white text-xs font-black tracking-[0.15em] uppercase rounded-lg transition-colors outline-none focus:outline-none">다시 시도</button>
              </div>
            )}
          </div>
        )}

        {/* ══ TAB : INTRO ══════════════════ */}
        {activeMainTab === "intro" && (
          <div className="space-y-16">
            <Reveal>
              <SectionHeader no="01" title="성장의 3가지 축" desc="고급 이글루 레벨 시스템을 구성하는 핵심 가치" />
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-white/[0.08] md:divide-x divide-white/[0.08]">
                {[
                  { no: "I", t: "XP 획득 및 한계 돌파", d: "채팅과 음성 활동으로 끊임없이 성장하세요. 상한선은 1,000레벨입니다." },
                  { no: "II", t: "전용 역할 부여", d: "특정 레벨 도달 시 전용 역할과 색상, 프리미엄 권한이 부여됩니다." },
                  { no: "III", t: "ARCTIC 혜택", d: "축적한 XP로 시즌 상품과 특별 권한을 구매할 수 있습니다." },
                ].map((f, i) => (
                  <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-white/[0.08]" : ""}`}>
                    <div className="text-2xl font-black text-white/[0.08] mb-5 group-hover:text-[#e91e3f]/30 transition-colors duration-500 select-none">{f.no}</div>
                    <div className="text-white font-bold text-base mb-2.5 tracking-tight">{f.t}</div>
                    <div className="text-gray-500 text-[13px] leading-relaxed break-keep">{f.d}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="02" title="기본 명령어" desc="디스코드 서버 내에서 사용 가능한 슬래시 커맨드" />
              <div className="border-t border-white/[0.08] divide-y divide-white/[0.06]">
                {[
                  { c: "/레벨", d: "다음 레벨 도달까지 필요 XP 확인" },
                  { c: "/랭크", d: "XP, 레벨, 서버 내 순위 확인" },
                  { c: "/출석체크", d: `출석체크를 통한 ${P.attendXp.toLocaleString()} XP 지급` },
                  { c: "/경험치샵", d: "ARCTIC 상점으로 이동" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-1 py-[18px] group hover:bg-white/[0.02] transition-colors">
                    <span className="text-[#e91e3f] font-mono font-bold text-sm tracking-tight">{item.c}</span>
                    <span className="text-gray-500 text-xs md:text-sm text-right">{item.d}</span>
                  </div>
                ))}
              </div>
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
              <div className="space-y-5">
                {[
                  { t: "XP 획득 제한", d: "잠수 음성 채널 이용 시 XP 획득이 전면 제한되며, 마이크/헤드셋 음소거 시 XP 획득량이 90% 감소됩니다." },
                  { t: "상점 이용 주의", d: "ARCTIC 상품은 보유 XP 소모 방식입니다. 구매로 인해 레벨이 하락할 수 있습니다." },
                ].map((item, i) => (
                  <div key={i} className="border-l-2 border-[#e91e3f]/50 pl-5 py-0.5">
                    <strong className="text-white text-sm font-bold block mb-1.5">{item.t}</strong>
                    <p className="text-gray-500 text-[13px] leading-relaxed break-keep">{item.d}</p>
                  </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-white/[0.08] md:divide-x divide-white/[0.08]">
                {[
                  { t: "채팅 채널", x: P.chatXp.toLocaleString(), c: `쿨타임 ${P_chatCooldownLabel}`, d: `채팅 입력 시 XP를 획득하며, 오남용 방지를 위해 쿨타임 ${P_chatCooldownLabel}이 적용됩니다.` },
                  { t: "음성 채널", x: P.voiceXp.toLocaleString(), c: `쿨타임 ${P_voiceMin}분`, d: `음성 채널에서 최소 ${P_voiceMin}분 동안 접속 지속 시 XP가 지급됩니다.` },
                  { t: "내전 음성 채널", x: P_scrimXp.toLocaleString(), c: `쿨타임 ${P_voiceMin}분`, d: "음성 채널과 동일하게 적용되며, 보너스 500 XP가 추가 지급됩니다." },
                ].map((item, i) => (
                  <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-white/[0.08]" : ""}`}>
                    <div className="flex items-center justify-between mb-5">
                      <span className="text-xs font-bold text-gray-400 tracking-wide">{item.t}</span>
                      <span className="text-[10px] font-bold text-emerald-400/80">{item.c}</span>
                    </div>
                    <div className="mb-4">
                      <span className="text-4xl font-black text-white tracking-tighter group-hover:text-[#e91e3f] transition-colors duration-300 tabular-nums">+{item.x}</span>
                      <span className="text-xs font-bold text-gray-600 ml-1.5">XP</span>
                    </div>
                    <p className="text-gray-500 text-xs leading-relaxed break-keep">{item.d}</p>
                  </div>
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
                        <div className="text-xs text-gray-500">출석 체크 시, 1회당 {P.attendXp.toLocaleString()} XP가 지급됩니다.</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+{P.attendXp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-5">
                      <div>
                        <div className="text-sm font-bold text-white mb-1">[XP] 출석 Boost</div>
                        <div className="text-xs text-gray-500">상품 보유 시 출석 기본 XP에 추가로 획득합니다.</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+{P.attendXp.toLocaleString()}</span>
                    </div>
                  </LuxCard>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader no="03" title="레벨 구간별 추가 기준" desc="음성/내전 채널 이용 시 레벨 구간에 따른 추가 XP — 레벨이 오를수록 계단처럼 쌓입니다" />

              {/* 📌 계단 차트 — 표 15줄 대신 '성장의 계단'을 그대로 시각화 */}
              <TierStairs />

              {/* 정확한 수치가 필요한 사람을 위한 콤팩트 표 (플랫) */}
              <div className="mt-10 border-t border-white/[0.08]">
                <div className="grid grid-cols-3 px-1 py-3.5 border-b border-white/[0.08] text-[10px] font-black tracking-[0.15em] text-gray-500 uppercase">
                  <div>진입 조건 레벨</div><div className="text-center">구간 추가 XP</div><div className="text-right">변동량</div>
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
                    <div key={i} className="grid grid-cols-3 px-1 py-3 text-xs items-center hover:bg-white/[0.02] transition-colors group">
                      <div className="text-gray-300 text-left font-medium">{row.l}</div>
                      <div className="text-white font-bold text-center group-hover:text-[#e91e3f] transition-colors tabular-nums">{row.x} <span className="text-gray-600 font-medium">XP</span></div>
                      <div className={`font-bold text-right ${row.c}`}>{row.d}</div>
                    </div>
                  ))}
                </div>
              </div>
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

      {/* 토스트 — XP 획득/레벨업/동기화 피드백 (모바일 하단바 위로 띄움) */}
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{ animation: "toastIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}
            className={`mt-2 px-5 py-3 rounded-2xl border text-xs font-bold shadow-2xl backdrop-blur-md text-right ${t.accent ? "bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_10px_30px_rgba(233,30,63,0.45)]" : "bg-[#161616]/95 border-white/10 text-white"}`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}
