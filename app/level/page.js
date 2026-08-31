"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { isAdminName } from "@/lib/admins";
import {
  HudPanel, HudSection, HudStyles, LiveDot, RingGauge, SegBar,
  StatusChip, SegLadder, TickRuler, RankRows, EmptySlot,
} from "../components/Hud";
import { SEASON, getSeasonProgress } from "@/lib/season";
import { VOICE_TIERS, TIER_COLORS, getTierIndex, getVoiceBonus, tierRangeLabel } from "@/lib/voiceTiers";

const DISCORD_URL = "https://discord.gg/V2uW2nUczU";
const ICE = "#3f83b8"; // ARCTIC 동선 전용 아이스 틴트

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
      <p className="text-[10px] text-[#c4c4c4] mt-2">곡선 위에 마우스를 올리거나 터치하면 해당 레벨의 XP를 확인할 수 있습니다.</p>
    </div>
  );
};

// 📌 음성 티어 계단 — 표 대신 '티어가 오를수록 쌓이는 계단'으로 지급량을 보여준다
const TierStairs = ({ base = 3000 }) => {
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
        레벨이 오르면 음성 티어가 올라가고, 음성 채널 5분당 지급량이 함께 늘어납니다 · 700 레벨부터는 최고 티어 이글루
      </p>
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

  // 일일 퀘스트 — 30초 폴링에 함께 실려 진행도가 실시간으로 찬다
  const [quests, setQuests] = useState(null);
  const [claiming, setClaiming] = useState("");

  const loadMe = useCallback(async () => {
    try {
      const [meRes, logRes, qRes] = await Promise.all([
        fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/my-logs", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/xp/quests", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
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
    if (!session?.user) { setMe(null); setMyLogs(null); setQuests(null); prevXpRef.current = null; setMeLoaded(true); return; }
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

  // 일일 퀘스트 요약 — 출석(봇이 지급)도 한 칸으로 세어 전체 달성률을 만든다
  const questRows = quests?.quests || [];
  const questDone = questRows.filter((q) => q.claimed || q.done).length;
  const questTotal = questRows.length;
  const questPct = Math.round((questDone / Math.max(1, questTotal)) * 100);
  const questClaimable = questRows.filter((q) => q.claimable).length;

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
  };
  const P_voiceMin = Math.max(1, Math.round(P.voiceIntervalSec / 60));

  // 티어 지급량은 관리자가 정한 기본 음성 XP 위에 얹힌다 (P 정의 이후여야 한다)
  const tierCurXp = P.voiceXp + tierCur.bonus;
  const tierNextXp = tierNext ? P.voiceXp + tierNext.bonus : null;

  // ARCTIC 상점 동선 — 공개 전에는 관리자에게만 노출 (policy.shopPublic)
  const canSeeShop = !!policy?.shopPublic || isAdminName(session?.user?.name);
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
      // 봇의 지급표와 같은 값을 쓴다 (lib/voiceTiers 단일 소스)
      levelBonusXp = getVoiceBonus(level);
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

      {/* ── 공통 헤더 — 모든 탭 동일 프레임 ── */}
      <div className="relative w-full px-5 md:px-8 pt-10 md:pt-12 pb-6">
        <div aria-hidden className="absolute -top-16 left-1/2 -translate-x-1/2 w-[560px] h-[280px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="relative max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter leading-none">
              <span className="text-[#131313]">SYSTEM</span>
              <span className="text-[#e91e3f] mx-1.5">:</span>
              <span className="lux-shimmer">LEVEL</span>
            </h1>
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e91e3f]/10 border border-[#e91e3f]/30">
              <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] animate-[pulseGlow_2.5s_ease-in-out_infinite]"></span>
              <span className="text-[10px] font-black text-[#e91e3f] tracking-wide">SEASON {SEASON.number} · {SEASON.name}</span>
            </span>
            {!seasonDday.ended && seasonDday.days >= 0 && (
              <span className="text-[11px] font-black text-[#131313] bg-black/5 border border-black/10 px-2.5 py-1 rounded-full">종료까지 D-{seasonDday.days}</span>
            )}
          </div>
          {authReady && session?.user && (
            <div className="flex items-center gap-2.5">
              <LiveDot />
              <span className="text-[10px] font-black tracking-[0.25em] text-[#8a8a8a] uppercase">실시간 동기화</span>
              {lastSync && <span className="hidden md:inline text-[10px] font-bold text-[#a3a3a3] tabular-nums">{lastSync.toLocaleTimeString("ko-KR", { hour12: false })}</span>}
              <button onClick={() => loadMe().then(() => pushToast("동기화 완료"))} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none border border-black/10 hover:border-black/30 rounded-full px-3 py-1">갱신</button>
            </div>
          )}
        </div>
      </div>

      {/* ── TAB NAV — ARCTIC 알약 탭 ─────── */}
      <div className="w-full px-5 md:px-8 pb-2">
        <div className="max-w-7xl mx-auto flex gap-2 overflow-x-auto no-bar">
          {[
            { id: "my", name: "내 대시보드" },
            { id: "intro", name: "시스템 소개" },
            { id: "policy", name: "XP 획득 가이드" },
            { id: "table", name: "XP 테이블" },
            { id: "sim", name: "시뮬레이터" },
          ].map((tab) => {
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

      {/* 대시보드 탭은 좌우 공간을 쓰는 와이드 HUD(7xl), 문서형 탭은 기존 에디토리얼 폭 유지 */}
      <div className={`w-full max-w-7xl mx-auto px-5 md:px-8 flex-1 ${activeMainTab === "my" ? "py-6 md:py-10" : "py-10 md:py-14"}`}>

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
                        {["TOTAL", "TODAY", "STREAK", "PER 5MIN"].map((s, i) => (
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
                        { l: `${tierCur.name} · +${tierCurXp.toLocaleString()}`, v: tierCur.en, s: "VOICE TIER", tint: tierCur.c },
                      ].map((st, i) => (
                        <div key={i} className={`px-0 md:px-6 ${i < 2 ? "pb-5 md:pb-0" : ""} ${i % 2 === 1 ? "text-right md:text-left" : ""} ${i === 0 ? "md:pl-0" : ""}`}>
                          <p className="text-[9px] font-black tracking-[0.28em] text-white/30 uppercase mb-2">{st.s}</p>
                          <p
                            className={`text-xl md:text-2xl font-black tabular-nums tracking-tight leading-none ${st.hot ? "text-[#ff5c77]" : "text-white"}`}
                            style={st.tint ? { color: st.tint } : undefined}
                          >{st.v}</p>
                          <p className="text-[10px] font-bold text-white/40 mt-1.5">{st.l}</p>
                        </div>
                      ))}
                    </div>
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
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Daily</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">일일 퀘스트</h3>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-[#131313] tabular-nums leading-none">
                            {questDone}<span className="text-[#c4c4c4]"> / {questTotal}</span>
                          </p>
                          <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mt-1">Complete</p>
                        </div>
                      </div>

                      {/* 전체 달성률 */}
                      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden mb-1.5">
                        <div className="h-full rounded-full bg-[#e91e3f] transition-[width] duration-700" style={{ width: `${questPct}%` }}></div>
                      </div>
                      <p className="text-[10px] font-bold text-[#a3a3a3] mb-5">
                        {questClaimable > 0
                          ? <span className="text-[#e91e3f]">받을 수 있는 보상 {questClaimable}개</span>
                          : questDone === questTotal ? "오늘 퀘스트를 모두 마쳤습니다" : "매일 자정(KST)에 초기화됩니다"}
                      </p>

                      {/* 퀘스트 목록 — 첫 항목은 내장 출석(음성 N분) */}
                      {questRows.map((q) => {
                        const pct = Math.min(100, Math.round((q.current / Math.max(1, q.target)) * 100));
                        const unit = q.metric === "xp" ? " XP" : q.metric === "minute" ? "분" : "회";
                        return (
                          <div
                            key={q.id}
                            className={`rounded-2xl border p-4 mb-2.5 transition-all ${
                              q.claimable
                                ? "border-[#e91e3f]/45 bg-[#e91e3f]/[0.06] shadow-[0_10px_30px_-18px_rgba(233,30,63,0.6)]"
                                : q.claimed || q.done
                                ? "border-black/[0.08] bg-black/[0.02]"
                                : "border-black/[0.08]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className={`text-sm font-bold ${q.claimed ? "text-[#8a8a8a]" : "text-[#131313]"}`}>{q.name}</p>
                                {q.desc && <p className="text-[11px] text-[#a3a3a3] mt-0.5 break-keep">{q.desc}</p>}
                                {q.builtin && !q.done && (
                                  <p className="text-[11px] font-bold text-[#8a8a8a] mt-1 tabular-nums">
                                    오늘 음성 {quests?.voiceMin ?? 0}분 · {Math.max(0, q.target - q.current)}분 남음
                                  </p>
                                )}
                              </div>
                              {q.rewardXp > 0 && (
                                <p className={`shrink-0 text-sm font-black tabular-nums ${q.claimed ? "text-[#c4c4c4]" : "text-[#e91e3f]"}`}>
                                  +{q.rewardXp.toLocaleString()}<span className="text-[10px] ml-0.5">XP</span>
                                </p>
                              )}
                            </div>

                            {/* 진행 게이지 */}
                            <div className="flex items-center gap-3 mt-3">
                              <div className="flex-1 h-1.5 rounded-full bg-black/[0.07] overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-[width] duration-700 ${q.done ? "bg-emerald-600" : "bg-[#131313]/45"}`}
                                  style={{ width: `${pct}%` }}
                                ></div>
                              </div>
                              <span className="shrink-0 text-[10px] font-black text-[#a3a3a3] tabular-nums">
                                {q.current.toLocaleString()} / {q.target.toLocaleString()}{unit}
                              </span>
                            </div>

                            {/* 상태 · 수령 */}
                            {q.claimable ? (
                              <button
                                onClick={() => claimQuest(q)}
                                disabled={claiming === q.id}
                                className="w-full sm:w-auto sm:ml-auto sm:block sm:px-7 mt-3 py-2.5 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-60 text-white text-[13px] font-bold transition-colors outline-none focus:outline-none"
                              >
                                {claiming === q.id ? "수령 중…" : `보상 ${q.rewardXp.toLocaleString()} XP 받기`}
                              </button>
                            ) : q.claimed ? (
                              <p className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-black text-emerald-700">
                                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                보상 수령 완료
                              </p>
                            ) : q.done ? (
                              <p className="mt-2.5 text-[11px] font-black text-emerald-700">달성</p>
                            ) : null}
                          </div>
                        );
                      })}

                      {/* 관리자가 아직 퀘스트를 등록하지 않은 상태 */}
                      {quests && questRows.length <= 1 && (
                        <EmptySlot>추가 퀘스트가 없습니다 — 출석 보상만 진행됩니다</EmptySlot>
                      )}

                      {/* 지급 안내 — 보상은 봇 대기열을 거치므로 즉시가 아닐 수 있다 */}
                      {questRows.some((q) => q.claimed) && (
                        <p className="text-[10px] text-[#c4c4c4] mt-3 break-keep">수령한 보상은 잠시 뒤 XP에 반영됩니다.</p>
                      )}

                      <div className="flex items-center justify-between border-t border-black/[0.08] mt-5 pt-4">
                        <span className="text-[11px] font-bold text-[#8a8a8a]">누적 출석 <b className="text-[#131313] tabular-nums">{(me.attendCount || 0).toLocaleString()}일</b></span>
                        <span className="text-[11px] font-bold text-[#8a8a8a]">마지막 <b className="text-[#131313] tabular-nums">{me.lastAttendDate ? me.lastAttendDate.replace(/-/g, ".") : "—"}</b></span>
                      </div>
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
                    {/* ARCTIC 상점 바로가기 — 레벨 ↔ 상점 동선 (아이스 틴트 전용색) */}
                    {canSeeShop && (
                      <section>
                        <Link href="/shop" className="group relative block rounded-xl border p-5 overflow-hidden transition-transform hover:-translate-y-0.5" style={{ borderColor: "rgba(90,150,200,0.45)", background: "rgba(160,200,235,0.16)" }}>
                          <div aria-hidden className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-[50px] pointer-events-none" style={{ background: "rgba(160,200,235,0.28)" }}></div>
                          <div className="relative z-10 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] uppercase mb-2" style={{ color: ICE }}><LiveDot color="bg-[#3f83b8]" />Arctic Store</p>
                              <p className="text-lg font-black text-[#131313] tracking-tight">ARCTIC <span style={{ color: ICE }}>상점</span></p>
                              <p className="text-[11px] font-bold text-[#8a8a8a] mt-1 break-keep">쌓은 XP로 역할과 혜택을 구매하세요</p>
                            </div>
                            <span className="shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-transform group-hover:translate-x-0.5" style={{ borderColor: "rgba(90,150,200,0.55)", color: ICE }}>→</span>
                          </div>
                        </Link>
                      </section>
                    )}

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

                    {/* 음성 티어 */}
                    <section>
                      <div className="flex items-end justify-between mb-5">
                        <div>
                          <span className="flex items-center gap-2 text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1.5"><span aria-hidden className="w-4 h-px bg-[#e91e3f]"></span>Tier</span>
                          <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">음성 티어</h3>
                        </div>
                        {!tierNext && <StatusChip accent>최고 티어</StatusChip>}
                      </div>

                      {/* 현재 티어 — 이름을 앞세운 배지 */}
                      <div className="flex items-center gap-3.5 mb-4">
                        <span
                          aria-hidden
                          className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center rotate-45"
                          style={{ backgroundColor: `${tierCur.c}1f`, border: `2px solid ${tierCur.c}` }}
                        >
                          <span className="-rotate-45 text-[13px] font-black" style={{ color: tierCur.c }}>
                            {tierIdx + 1}
                          </span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-2xl font-black tracking-tight leading-none" style={{ color: tierCur.c }}>{tierCur.name}</p>
                          <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase mt-1.5 tabular-nums">
                            {tierCur.en} · {tierRangeLabel(tierIdx)}
                          </p>
                        </div>
                        <div className="ml-auto text-right shrink-0">
                          <p className="text-xl font-black text-[#131313] tabular-nums leading-none">+{tierCurXp.toLocaleString()}</p>
                          <p className="text-[10px] font-bold text-[#a3a3a3] mt-1">XP / 5분</p>
                        </div>
                      </div>

                      <SegLadder
                        total={VOICE_TIERS.length}
                        currentIndex={tierIdx}
                        colors={TIER_COLORS}
                        titles={VOICE_TIERS.map((t) => `${t.name} · ${tierRangeLabel(VOICE_TIERS.indexOf(t))} — +${(P.voiceXp + t.bonus).toLocaleString()} XP`)}
                      />

                      {tierNext && tierNextBound !== null && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-black/[0.08]">
                          <span className="shrink-0 text-[11px] font-black" style={{ color: tierNext.c }}>▲ {tierNext.name}</span>
                          <span className="text-[11px] font-bold text-[#8a8a8a] break-keep">
                            Lv.{tierNextBound} 도달 시 <b className="text-[#131313] tabular-nums">+{tierNextXp.toLocaleString()}</b>
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">
                            {Math.max(0, tierNextBound - me.level)}레벨 남음
                          </span>
                        </div>
                      )}
                    </section>

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
          <div className="space-y-16">
            <Reveal>
              <SectionHeader en="Pillars" title="성장의 3가지 축" desc="고급 이글루 레벨 시스템을 구성하는 핵심 가치" />
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-black/[0.08] md:divide-x divide-black/[0.08]">
                {[
                  { no: "I", t: "XP 획득 및 한계 돌파", d: "채팅과 음성 활동으로 끊임없이 성장하세요. 상한선은 1,000레벨입니다." },
                  { no: "II", t: "전용 역할 부여", d: "특정 레벨 도달 시 전용 역할과 색상, 프리미엄 권한이 부여됩니다." },
                  { no: "III", t: "ARCTIC 혜택", d: "축적한 XP로 시즌 상품과 특별 권한을 구매할 수 있습니다." },
                ].map((f, i) => (
                  <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-black/[0.08]" : ""}`}>
                    <div className="text-2xl font-black text-[#131313]/[0.08] mb-5 group-hover:text-[#e91e3f]/30 transition-colors duration-500 select-none">{f.no}</div>
                    <div className="text-[#131313] font-bold text-base mb-2.5 tracking-tight">{f.t}</div>
                    <div className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{f.d}</div>
                  </div>
                ))}
              </div>
            </Reveal>


            {/* 📌 일일 퀘스트 & 음성 티어 — 새로 들어온 두 시스템 */}
            <Reveal>
              <SectionHeader
                en="Daily"
                title="일일 퀘스트"
                desc="매일 자정(KST)에 초기화되는 하루치 목표입니다. 달성하면 내 대시보드에서 직접 보상을 받습니다."
                right={<Link href="/level" onClick={() => setActiveMainTab("my")} className="shrink-0 text-[11px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors">내 대시보드 →</Link>}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-black/[0.08] md:divide-x divide-black/[0.08]">
                {[
                  { n: "01", t: "활동하면 자동 집계", d: "채팅·음성 활동이 그대로 퀘스트 진행도가 됩니다. 별도 명령어를 칠 필요가 없습니다." },
                  { n: "02", t: `출석 = 음성 ${P.attendVoiceMin}분`, d: `하루 동안 음성 채널에 ${P.attendVoiceMin}분 이상 머무르면 출석 보상 ${P.attendXp.toLocaleString()} XP를 받을 수 있습니다.` },
                  { n: "03", t: "직접 수령", d: "달성한 보상은 대시보드에서 눌러서 받습니다. 받은 XP는 잠시 뒤 반영됩니다." },
                ].map((f, i) => (
                  <div key={i} className={`group py-7 md:px-7 first:md:pl-0 last:md:pr-0 ${i > 0 ? "border-t md:border-t-0 border-black/[0.08]" : ""}`}>
                    <div className="text-2xl font-black text-[#131313]/[0.08] mb-5 group-hover:text-[#e91e3f]/30 transition-colors duration-500 select-none tabular-nums">{f.n}</div>
                    <div className="text-[#131313] font-bold text-base mb-2.5 tracking-tight break-keep">{f.t}</div>
                    <div className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{f.d}</div>
                  </div>
                ))}
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader
                en="Tier"
                title="음성 티어"
                desc="레벨이 오르면 음성 티어가 함께 오르고, 음성 채널 5분당 받는 XP가 늘어납니다. 8단계이며 최고 티어는 이글루입니다."
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {VOICE_TIERS.map((t, i) => (
                  <div
                    key={t.key}
                    className="rounded-xl border px-4 py-4 transition-colors hover:bg-black/[0.02]"
                    style={{ borderColor: `${t.c}44` }}
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <span aria-hidden className="w-2 h-2 rotate-45 shrink-0" style={{ backgroundColor: t.c }}></span>
                      <span className="text-sm font-black truncate" style={{ color: t.c }}>{t.name}</span>
                    </div>
                    <p className="text-[10px] font-black tracking-[0.15em] text-[#a3a3a3] uppercase tabular-nums">{tierRangeLabel(i)}</p>
                    <p className="text-[13px] font-black text-[#131313] tabular-nums mt-1.5">
                      +{(P.voiceXp + t.bonus).toLocaleString()}<span className="text-[10px] font-bold text-[#a3a3a3] ml-1">XP / 5분</span>
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-[#a3a3a3] mt-3.5 break-keep">
                표시 금액은 현재 기본 음성 XP({P.voiceXp.toLocaleString()})에 티어 보너스를 더한 값입니다. 역할·채널 부스트가 있으면 더 받습니다.
              </p>
            </Reveal>

            <Reveal>
              <SectionHeader en="Commands" title="기본 명령어" desc="디스코드 서버 내에서 사용 가능한 슬래시 커맨드" />
              <div className="border-t border-black/[0.08] divide-y divide-black/[0.06]">
                {[
                  { c: "/레벨", d: "다음 레벨 도달까지 필요 XP 확인" },
                  { c: "/랭크", d: "XP, 레벨, 서버 내 순위 확인" },

                  { c: "/경험치샵", d: "ARCTIC 상점으로 이동" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-1 py-[18px] group hover:bg-black/[0.02] transition-colors">
                    <span className="text-[#e91e3f] font-mono font-bold text-sm tracking-tight">{item.c}</span>
                    <span className="text-[#8a8a8a] text-xs md:text-sm text-right">{item.d}</span>
                  </div>
                ))}
              </div>
            </Reveal>

            {/* 📌 시즌 안내 */}
            <Reveal>
              <SectionHeader en="Season" title={`시즌 안내 — SEASON ${SEASON.number} '${SEASON.name}'`} desc={`레벨 시스템은 시즌제로 운영됩니다 · 현재 시즌 기간 ${SEASON.start.replace(/-/g, ".")} ~ ${SEASON.end.replace(/-/g, ".")}`} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 시즌 한정 상품 */}
                <LuxCard className="p-7">
                  <div className="flex items-center gap-2.5 mb-6">
                    <span className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">Season Limited</span>
                    <span className="text-sm font-bold text-[#131313]">시즌 한정 상품</span>
                  </div>
                  <p className="text-xs text-[#8a8a8a] mb-5 leading-relaxed">실물 기프트카드로 구성된 시즌 한정 라인업입니다. 한정 수량 소진 시 조기 마감됩니다.</p>
                  <div className="space-y-2">
                    {[
                      { name: "올리브영 기프트카드", value: "3만원권", stock: 1 },
                      { name: "배달의민족 기프트카드", value: "3만원권", stock: 1 },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between bg-black/[0.03] border border-black/5 rounded-xl px-4 py-3.5 hover:border-[#e91e3f]/25 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-[#131313]">{item.name}</p>
                          <p className="text-[11px] text-[#8a8a8a] mt-0.5">{item.value} · 실물 상품</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-black bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25 px-2.5 py-1 rounded-full">한정 {item.stock}개</span>
                      </div>
                    ))}
                  </div>
                </LuxCard>

                {/* 시즌 종료 보상 — RANKER */}
                <div className="relative rounded-2xl overflow-hidden bg-[#131313] shadow-[0_26px_60px_-32px_rgba(0,0,0,0.5)]">
                  <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>
                  <div aria-hidden className="absolute -top-16 -right-14 w-56 h-56 bg-[#e91e3f]/[0.18] blur-[90px] rounded-full pointer-events-none"></div>
                  <div className="relative z-10 p-7">
                    <div className="flex items-center gap-2.5 mb-6">
                      <span className="text-[10px] font-black tracking-[0.25em] text-[#ff5c77] uppercase">Season Finale</span>
                      <span className="text-sm font-bold text-white/70">시즌 종료 보상</span>
                    </div>
                    <p className="text-3xl font-black text-white tracking-tight mb-2">TOP 3 <span className="text-[#ff5c77]">RANKER</span></p>
                    <p className="text-xs text-white/50 leading-relaxed mb-6">시즌 종료 시 최종 레벨 상위 3인은 RANKER로 선정됩니다.</p>
                    <div className="space-y-2.5 text-xs text-white/60">
                      <p className="flex gap-2.5"><span className="text-[#ff5c77] shrink-0">—</span><span><strong className="text-white">@RANKER</strong> 전용 역할 지급</span></p>
                      <p className="flex gap-2.5"><span className="text-[#ff5c77] shrink-0">—</span><span>다음 시즌 특전 <strong className="text-white">[XP] Boost+</strong> 제공</span></p>
                      <p className="flex gap-2.5"><span className="text-[#ff5c77] shrink-0">—</span><span>명예의 전당 영구 등재</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader en="Notice" title="이용 시 주의사항" />
              <div className="space-y-5">
                {[
                  { t: "XP 획득 제한", d: "잠수 음성 채널 이용 시 XP 획득이 전면 제한되며, 마이크/헤드셋 음소거 시 XP 획득량이 90% 감소됩니다." },
                  { t: "상점 이용 주의", d: "ARCTIC 상품은 보유 XP 소모 방식입니다. 구매로 인해 레벨이 하락할 수 있습니다." },
                ].map((item, i) => (
                  <div key={i} className="border-l-2 border-[#e91e3f]/50 pl-5 py-0.5">
                    <strong className="text-[#131313] text-sm font-bold block mb-1.5">{item.t}</strong>
                    <p className="text-[#8a8a8a] text-[13px] leading-relaxed break-keep">{item.d}</p>
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
              <SectionHeader en="Base" title="기본 XP 획득량" desc="채널 활동별 기본 지급량 및 쿨타임 기준" />
              <div className="grid grid-cols-1 md:grid-cols-3 border-y border-black/[0.08] md:divide-x divide-black/[0.08]">
                {[
                  { t: "채팅 채널", x: P.chatXp.toLocaleString(), c: `쿨타임 ${P_chatCooldownLabel}`, d: `채팅 입력 시 XP를 획득하며, 오남용 방지를 위해 쿨타임 ${P_chatCooldownLabel}이 적용됩니다.` },
                  { t: "음성 채널", x: P.voiceXp.toLocaleString(), c: `쿨타임 ${P_voiceMin}분`, d: `음성 채널에서 최소 ${P_voiceMin}분 동안 접속 지속 시 XP가 지급됩니다.` },
                  { t: "내전 음성 채널", x: P_scrimXp.toLocaleString(), c: `쿨타임 ${P_voiceMin}분`, d: "음성 채널과 동일하게 적용되며, 보너스 500 XP가 추가 지급됩니다." },
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
            </Reveal>

            <Reveal>
              <SectionHeader en="Bonus" title="추가 XP & 출석 보상" desc="아이템 및 시즌 상품 보유 시 추가 획득량" />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                <LuxCard className="p-7">
                  <div className="flex items-center gap-2.5 mb-7">
                    <span className="text-[10px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">Permanent</span>
                    <span className="text-sm font-bold text-[#131313]">아이템 상품 [영구제]</span>
                  </div>

                  <div className="flex justify-between items-center pb-5 border-b border-black/5">
                    <div>
                      <div className="text-sm font-bold text-[#131313] mb-1">[XP] Boost+</div>
                      <div className="text-xs text-[#8a8a8a]">조건 충족 시 기본 XP에 추가 획득</div>
                    </div>
                    <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+300</span>
                  </div>

                  <div className="pt-6">
                    <div className="text-sm font-bold text-[#131313] mb-1">[역할] 펭귄 패밀리</div>
                    <div className="text-xs text-[#8a8a8a] mb-5">보유 시 기본 XP에 추가 획득 [중첩 누적 가능]</div>
                    <div className="space-y-2">
                      {[
                        { r: "어린이 펭귄", x: "+250" },
                        { r: "청소년 펭귄", x: "+350" },
                        { r: "어른 펭귄", x: "+450" },
                        { r: "어미 펭귄", x: "+550" },
                      ].map((p, i) => (
                        <div key={i} className="flex justify-between items-center bg-black/[0.03] hover:bg-black/[0.06] transition-colors rounded-xl px-4 py-3">
                          <span className="text-xs text-[#4b4b4b] font-medium">{p.r}</span>
                          <span className="text-[#e91e3f] text-xs font-black">{p.x} XP</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </LuxCard>

                <div className="space-y-4">
                  <LuxCard className="p-7">
                    <div className="flex items-center gap-2.5 mb-7">
                      <span className="text-[10px] font-black tracking-[0.2em] text-[#5a5a5a] uppercase">Seasonal</span>
                      <span className="text-sm font-bold text-[#131313]">시즌 상품 [기간제]</span>
                    </div>
                    <div className="flex justify-between items-center pb-5 border-b border-black/5">
                      <div>
                        <div className="text-sm font-bold text-[#131313] mb-1">[XP] S1 Boost+</div>
                        <div className="text-xs text-[#8a8a8a]">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+100</span>
                    </div>
                    <div className="flex justify-between items-center pt-5">
                      <div>
                        <div className="text-sm font-bold text-[#131313] mb-1">[이벤트] 7월 Bonus</div>
                        <div className="text-xs text-[#8a8a8a]">조건 충족 시 기본 XP에 추가 획득</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+550</span>
                    </div>
                  </LuxCard>

                  <LuxCard className="p-7">
                    <div className="flex items-center gap-2.5 mb-7">
                      <span className="text-[10px] font-black tracking-[0.2em] text-[#5a5a5a] uppercase">Daily</span>
                      <span className="text-sm font-bold text-[#131313]">일일 출석 보상</span>
                    </div>
                    <div className="flex justify-between items-center pb-5 border-b border-black/5">
                      <div className="pr-4">
                        <div className="text-sm font-bold text-[#131313] mb-1">음성 {P.attendVoiceMin}분 접속</div>
                        <div className="text-xs text-[#8a8a8a] break-keep">하루 동안 음성 채널에 {P.attendVoiceMin}분 이상 머무르면 달성됩니다. 별도 명령어 없이 자동으로 집계됩니다.</div>
                      </div>
                      <span className="text-[#e91e3f] font-black text-lg tracking-tight shrink-0">+{P.attendXp.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center pt-5">
                      <div className="pr-4">
                        <div className="text-sm font-bold text-[#131313] mb-1">보상 수령</div>
                        <div className="text-xs text-[#8a8a8a] break-keep">달성 후 내 대시보드의 일일 퀘스트에서 직접 받습니다. 하루 한 번, 자정(KST)에 초기화됩니다.</div>
                      </div>
                      <span className="shrink-0 text-[11px] font-black text-[#8a8a8a] border border-black/12 rounded-full px-3 py-1">1일 1회</span>
                    </div>
                  </LuxCard>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <SectionHeader en="Tier" title="음성 티어별 지급량" desc="음성/내전 채널 이용 시 레벨 구간에 따른 추가 XP — 레벨이 오를수록 계단처럼 쌓입니다" />

              {/* 📌 계단 차트 — 표 15줄 대신 '성장의 계단'을 그대로 시각화 */}
              <TierStairs base={P.voiceXp} />

              {/* 정확한 수치가 필요한 사람을 위한 콤팩트 표 (플랫) */}
              <div className="mt-10 border-t border-black/[0.08]">
                <div className="grid grid-cols-3 px-1 py-3.5 border-b border-black/[0.08] text-[10px] font-black tracking-[0.15em] text-[#8a8a8a] uppercase">
                  <div>진입 조건 레벨</div><div className="text-center">구간 추가 XP</div><div className="text-right">변동량</div>
                </div>
                <div className="divide-y divide-black/[0.04]">
                  {[
                    { l: "0 ~ 49 Lv", x: "+3,000", d: "기본값", c: "text-[#a3a3a3]" },
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
                    <div key={i} className="grid grid-cols-3 px-1 py-3 text-xs items-center hover:bg-black/[0.02] transition-colors group">
                      <div className="text-[#4b4b4b] text-left font-medium">{row.l}</div>
                      <div className="text-[#131313] font-bold text-center group-hover:text-[#e91e3f] transition-colors tabular-nums">{row.x} <span className="text-[#a3a3a3] font-medium">XP</span></div>
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
            <SectionHeader en="Table" title="XP 테이블" desc="레벨별 필요 및 누적 XP를 검색하세요 (1~1000)" />

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
              <SectionHeader en="Curve" title="성장 곡선" desc="Lv 1 → 1,000 누적 XP 곡선 · 곡선 위를 짚으면 해당 레벨의 XP를 읽어줍니다" />
              <LevelCurve myLevel={me?.level || null} />
            </div>

            <SectionHeader en="Full Table" title="전체 레벨 표" desc="레벨별 필요 XP와 누적 XP" />
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
            <SectionHeader en="Simulator" title="XP 시뮬레이터" desc="조건을 설정하면 예상 획득 XP와 도달 레벨을 실시간으로 계산합니다" />
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
                          {simChannel === 'chat' ? '채팅 (1분)' : simChannel === 'voice' ? '음성 (5분)' : '내전 (5분)'}
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

                {/* 시즌 상품 [기간제] */}
                <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.03] p-5">
                  <div className="text-[10px] font-black tracking-[0.2em] text-[#8a8a8a] uppercase mb-4">Seasonal Items</div>
                  <div className="flex justify-between items-center py-2.5 border-b border-black/5">
                    <label className="text-xs font-medium text-[#4b4b4b]">[아이템] [XP] S1 Boost+ 적용</label>
                    <button type="button" onClick={() => setSimBoost2(!simBoost2)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simBoost2 ? 'bg-[#e91e3f]' : 'bg-black/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simBoost2 ? 'translate-x-5' : ''}`}></div>
                    </button>
                  </div>
                  <div className="flex justify-between items-center py-2.5">
                    <label className="text-xs font-medium text-[#4b4b4b]">[이벤트] 7월 Bonus 적용</label>
                    <button type="button" onClick={() => setSimEvent(!simEvent)} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${simEvent ? 'bg-[#e91e3f]' : 'bg-black/10'}`}>
                      <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${simEvent ? 'translate-x-5' : ''}`}></div>
                    </button>
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
                        { l: `시즌 상품 [기간제] S1 Boost+ 추가합산 (${simResult.cycleText})`, v: `${simResult.b2Add.toLocaleString()} XP` },
                        { l: `시즌 상품 [기간제] 7월 Bonus 추가합산 (${simResult.cycleText})`, v: `${simResult.evAdd.toLocaleString()} XP` },
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
