"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 팀 룸 · 스크림 매칭 (관리자 전용 · 프로토타입)
   구조: 팀 룸(홈) → 일정 계획판 → [관리자] 스크림 매칭 / 기간 설정
   디자인: 경매장이 '차가운 블랙 + 레드(긴장)'이라면 팀 룸은 그 반대편이다.
          레드를 걷어내고 팀 고유 색을 쓰며, 여백을 넓혀 머무는 공간으로 만든다.
   네이티브 select/date 는 쓰지 않는다 — 다크 화면에서 브라우저 기본 UI가 튄다. */

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const midnight = (d: Date | number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dL = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const dF = (d: Date) => `${dL(d)}(${WD[d.getDay()]})`;
const hourLabel = (h: number) => (h >= 24 ? `${h - 24}시` : h === 0 ? "자정" : `${h}시`);
const keyOf = (d: Date, m: number) => `${d.getTime()}|${m}`;
const mkRnd = (s0: number) => { let s = s0; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

const TEAM = { name: "이글루 페이커즈", tag: "IGL", color: "#7dd3fc", founded: "2026 여름 경매", w: 3, l: 1 };
const ROSTER = [
  { n: "나", i: "나", pos: "팀장", me: true },
  { n: "구민", i: "구", pos: "TOP" },
  { n: "주전자", i: "주", pos: "JGL" },
  { n: "레비", i: "레", pos: "MID" },
  { n: "한별", i: "한", pos: "ADC" },
  { n: "도윤", i: "도", pos: "SUP" },
];

type Cfg = { start: Date; days: number; from: number; to: number; step: number; due: Date; dueMin: number };
type Opp = { n: string; tag: string; i: string; c: string; size: number; ready: boolean; got?: number; bias: number; counts: Map<string, number> };
type Fixture = { d: Date; s: number; opp: Opp; us: number; them: number };

export default function TeamRoom() {
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";
  const isAdmin = signedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  // 관리자도 기본은 팀원과 같은 화면을 본다. 스위치를 켜야 운영 화면이 열린다.
  const [adminMode, setAdminMode] = useState(false);
  const [view, setView] = useState<"room" | "board" | "match" | "cfg">("room");
  const [cfg, setCfg] = useState<Cfg>(() => ({
    start: midnight(Date.now() + DAY), days: 7, from: 19, to: 24, step: 60,
    due: midnight(Date.now() + DAY), dueMin: 23 * 60 + 59,
  }));
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [meDone, setMeDone] = useState(false);
  const [pick, setPick] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [showAlts, setShowAlts] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const DAYS = useMemo(() => Array.from({ length: cfg.days }, (_, i) => { const d = new Date(cfg.start); d.setDate(d.getDate() + i); return d; }), [cfg.start, cfg.days]);
  const SLOTS = useMemo(() => { const o: number[] = []; for (let m = cfg.from * 60; m < cfg.to * 60; m += cfg.step) o.push(m); return o; }, [cfg.from, cfg.to, cfg.step]);
  const sL = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return cfg.step === 60 ? `${h}시` : `${h}:${pad(mm)}`; };
  const sF = (m: number) => { const h = Math.floor(m / 60), hh = h % 24, mm = m % 60; return `${hh === 0 ? "자정" : `${hh}시`}${mm ? ` ${mm}분` : ""}${h >= 24 ? " (익일)" : ""}`; };

  const mateSets = useMemo(() => ROSTER.filter((r) => !r.me).map((_, idx) => {
    const rnd = mkRnd(20260809 + idx * 7919); const set = new Set<string>();
    DAYS.forEach((d) => SLOTS.forEach((s) => {
      const h = Math.floor(s / 60) % 24, wk = d.getDay() === 0 || d.getDay() === 6;
      let p = h >= 22 || h < 6 ? 0.69 : 0.49; if (wk) p += 0.12;
      if (rnd() < p) set.add(keyOf(d, s));
    }));
    return set;
  }), [DAYS, SLOTS]);

  const opps = useMemo<Opp[]>(() => {
    const base: Omit<Opp, "counts">[] = [
      { n: "서리 늑대단", tag: "FRW", i: "서", c: "#a5b4fc", size: 6, ready: true, bias: 0.60 },
      { n: "화이트 클랜", tag: "WHT", i: "화", c: "#fcd34d", size: 6, ready: true, bias: 0.48 },
      { n: "블랙아웃", tag: "BLK", i: "블", c: "#f0abfc", size: 6, ready: false, got: 3, bias: 0.55 },
    ];
    return base.map((t, i) => {
      const counts = new Map<string, number>();
      DAYS.forEach((d) => SLOTS.forEach((s) => {
        const rnd = mkRnd(31337 + i * 104729 + d.getDate() * 97 + s);
        const h = Math.floor(s / 60) % 24, wk = d.getDay() === 0 || d.getDay() === 6;
        let p = h >= 22 || h < 6 ? t.bias + 0.16 : t.bias - 0.10; if (wk) p += 0.12;
        let c = 0; for (let k = 0; k < t.size; k++) if (rnd() < p) c++;
        counts.set(keyOf(d, s), c);
      }));
      return { ...t, counts };
    });
  }, [DAYS, SLOTS]);

  const usTotal = ROSTER.length;
  const doneCount = mateSets.length + (meDone ? 1 : 0);
  const usReady = doneCount === usTotal;
  const usAt = (d: Date, s: number) => mateSets.filter((m) => m.has(keyOf(d, s))).length + (mine.has(keyOf(d, s)) ? 1 : 0);
  const memberSet = (idx: number) => (ROSTER[idx].me ? mine : mateSets[idx - 1]);

  const usRanked = useMemo(() => {
    const o: { d: Date; s: number; n: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => o.push({ d, s, n: usAt(d, s) })));
    return o.sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DAYS, SLOTS, mine, mateSets]);

  const bothAt = (d: Date, s: number, t: Opp) => { const us = usAt(d, s), them = t.counts.get(keyOf(d, s)) || 0; return { us, them, min: Math.min(us, them) }; };
  const mRanked = useMemo(() => {
    if (pick === null) return [];
    const t = opps[pick]; const o: { d: Date; s: number; us: number; them: number; min: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => o.push({ d, s, ...bothAt(d, s, t) })));
    return o.sort((a, b) => b.min - a.min || b.us + b.them - (a.us + a.them));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, opps, DAYS, SLOTS, mine, mateSets]);

  const patch = (p: Partial<Cfg>) => { setCfg((c) => ({ ...c, ...p })); setMine(new Set()); setMeDone(false); setPick(null); };
  const toggle = (d: Date, s: number) => { const k = keyOf(d, s); setMine((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; }); };
  const toggleDay = (d: Date) => {
    const on = SLOTS.every((s) => mine.has(keyOf(d, s)));
    setMine((p) => { const n = new Set(p); SLOTS.forEach((s) => (on ? n.delete(keyOf(d, s)) : n.add(keyOf(d, s)))); return n; });
    setToast(`${dF(d)} 전체를 ${on ? "해제했습니다" : "가능으로 표시했습니다"}`);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!signedIn) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">로그인이 필요합니다</h2>
        <p className="text-gray-400 text-sm mb-4">팀 룸은 팀원만 볼 수 있습니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const C = TEAM.color;
  const usTop = usRanked[0];
  const mTop = mRanked[0];
  const next = fixtures[0];
  const dueLabel = `${dF(cfg.due)} ${pad(Math.floor(cfg.dueMin / 60))}:${pad(cfg.dueMin % 60)}`;
  const endDate = (() => { const e = new Date(cfg.start); e.setDate(e.getDate() + cfg.days - 1); return e; })();
  const cells = cfg.days * SLOTS.length;

  /* ── 공용 조각 ── */
  const Emblem = ({ tag, color, size = 48 }: { tag: string; color: string; size?: number }) => (
    <span className="relative grid place-items-center shrink-0 rounded-2xl font-black tracking-tight"
      style={{ width: size, height: size, background: `linear-gradient(150deg, ${color}2e, ${color}0a)`, border: `1px solid ${color}55`, color, fontSize: size * 0.29 }}>
      {tag}
    </span>
  );

  const HeadRow = () => (
    <tr>
      <th className="w-px" />
      {SLOTS.map((s) => <th key={s} className="pb-1 text-[9px] font-bold text-slate-500 tabular-nums whitespace-nowrap">{sL(s)}</th>)}
    </tr>
  );
  const DayTh = ({ d, tap }: { d: Date; tap?: () => void }) => (
    <th onClick={tap} tabIndex={tap ? 0 : -1}
      onKeyDown={(e) => { if (tap && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(); } }}
      className={`text-left pr-2.5 whitespace-nowrap ${tap ? "cursor-pointer group" : ""}`}>
      <span className="block text-[12px] font-bold text-slate-300 tabular-nums group-hover:text-white">{dL(d)}</span>
      <span className={`block text-[9px] font-bold mt-px ${d.getDay() === 6 ? "text-sky-400/80" : d.getDay() === 0 ? "text-rose-400/80" : "text-slate-500"}`}>{WD[d.getDay()]}</span>
    </th>
  );
  const cellCls = "w-[44px] h-[36px] lg:w-[56px] lg:h-[42px] rounded-md border text-[12px] font-bold tabular-nums transition-transform active:scale-[.93]";

  const Stepper = ({ label, value, sub, onMinus, onPlus, minusOff, plusOff }: {
    label: string; value: string; sub?: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean;
  }) => (
    <div>
      <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 mb-2">{label}</span>
      <div className="inline-flex items-stretch rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
        <button type="button" onClick={onMinus} disabled={minusOff} aria-label={`${label} 줄이기`}
          className="w-[38px] text-[17px] font-bold leading-none text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:text-slate-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors">−</button>
        <span className="min-w-[94px] px-2 py-2.5 text-center border-x border-white/[0.08]">
          <span className="block text-[13px] font-bold tabular-nums">{value}</span>
          {sub && <span className="block text-[9px] font-medium text-slate-500 mt-0.5">{sub}</span>}
        </span>
        <button type="button" onClick={onPlus} disabled={plusOff} aria-label={`${label} 늘리기`}
          className="w-[38px] text-[17px] font-bold leading-none text-slate-400 hover:bg-white/[0.06] hover:text-white disabled:text-slate-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors">+</button>
      </div>
    </div>
  );

  const DateStrip = ({ sel, onPick }: { sel: Date; onPick: (d: Date) => void }) => (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
      {Array.from({ length: 21 }, (_, i) => {
        const d = midnight(Date.now() + DAY * i);
        const on = d.getTime() === sel.getTime();
        return (
          <button key={i} type="button" onClick={() => onPick(d)} aria-pressed={on}
            className="shrink-0 min-w-[54px] px-1 py-2 rounded-xl border text-center transition-colors"
            style={on ? { borderColor: C, background: `${C}1a` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.03)" }}>
            <span className="block text-[12px] font-bold tabular-nums" style={{ color: on ? C : "#cbd5e1" }}>{dL(d)}</span>
            <span className="block text-[9px] font-bold mt-0.5 text-slate-500">{i === 0 ? "오늘" : i === 1 ? "내일" : WD[d.getDay()]}</span>
          </button>
        );
      })}
    </div>
  );

  const SecTitle = ({ k, c }: { k: string; c?: string }) => (
    <div className="flex items-baseline gap-3 pb-2.5 border-b border-white/[0.08]">
      <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-slate-400">{k}</span>
      {c && <span className="ml-auto text-[11px] font-medium text-slate-500">{c}</span>}
    </div>
  );

  return (
    /* 룸은 경매장보다 한 톤 부드러운 청회색 바닥 위에 놓인다 */
    <main className="w-full">
      <div className="mx-auto max-w-[1060px] px-4 pb-28">

        {/* ═══ 대회 · 팀 명패 ═══ */}
        <header className="relative pt-8 pb-7">
          <div aria-hidden className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[520px] h-[220px] blur-[90px] opacity-25 rounded-full" style={{ background: C }} />
          <p className="relative text-[11px] font-bold tracking-[0.3em] uppercase text-slate-500">2026 여름 스크림 리그</p>

          <div className="relative mt-4 flex items-center gap-5">
            <Emblem tag={TEAM.tag} color={C} size={62} />
            <div className="min-w-0">
              <h1 className="text-[26px] sm:text-[32px] font-black tracking-[-0.03em] leading-none">{TEAM.name}</h1>
              <p className="mt-2.5 flex items-center gap-2.5 text-[12px] font-medium text-slate-400">
                <span className="tabular-nums" style={{ color: C }}>{TEAM.w}승 {TEAM.l}패</span>
                <span className="w-px h-3 bg-white/15" />
                <span>창단 · {TEAM.founded}</span>
              </p>
            </div>

            {/* 관리자만 — 팀원 화면 ↔ 운영 화면 전환 */}
            {isAdmin && (
              <button
                onClick={() => { const v = !adminMode; setAdminMode(v); if (!v && (view === "match" || view === "cfg")) setView("room"); }}
                aria-pressed={adminMode}
                className="ml-auto shrink-0 flex items-center gap-2.5 pl-3 pr-3.5 py-2 rounded-full border text-[11px] font-bold transition-colors"
                style={adminMode
                  ? { borderColor: "rgba(52,211,153,.5)", background: "rgba(52,211,153,.12)", color: "#34d399" }
                  : { borderColor: "rgba(255,255,255,.09)", color: "#94a3b8" }}
              >
                <span className="relative w-7 h-4 rounded-full transition-colors"
                  style={{ background: adminMode ? "#34d399" : "rgba(255,255,255,.14)" }}>
                  <span className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-[left] duration-200"
                    style={{ left: adminMode ? 14 : 2 }} />
                </span>
                운영 화면
              </button>
            )}
          </div>

          {/* 이동 — 룸에서 각 공간으로 */}
          <nav className="relative mt-7 flex flex-wrap gap-1.5">
            {(adminMode
              ? ([["room", "팀 룸"], ["board", "일정 계획판"], ["match", "스크림 매칭"], ["cfg", "기간 설정"]] as const)
              : ([["room", "팀 룸"], ["board", "일정 계획판"]] as const)
            ).map(([k, t]) => {
              const on = view === k;
              return (
                <button key={k} onClick={() => setView(k)}
                  className="px-4 py-2 rounded-full text-[12px] font-bold border transition-colors"
                  style={on ? { borderColor: C, background: `${C}1f`, color: C } : { borderColor: "rgba(255,255,255,.09)", color: "#94a3b8" }}>
                  {t}
                </button>
              );
            })}
          </nav>
        </header>

        {/* ═══ 팀 룸 ═══ */}
        {view === "room" && (
          <div className="space-y-9">

            {/* 다음 경기 — 방의 중심 */}
            <section>
              <SecTitle k="Next Match" c={next ? "확정됨" : "아직 없음"} />
              {next ? (
                <div className="mt-4 rounded-3xl border border-white/[0.09] bg-white/[0.02] overflow-hidden">
                  <div className="px-6 py-3 flex items-center gap-2 border-b border-white/[0.07]">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: C }} />
                    <span className="text-[11px] font-bold tabular-nums text-slate-300">{dF(next.d)} {sF(next.s)}</span>
                    <span className="ml-auto text-[10px] font-bold tracking-[0.16em] uppercase text-emerald-400">Confirmed</span>
                  </div>
                  <div className="px-6 py-7 flex items-center justify-center gap-5 sm:gap-9">
                    <div className="flex-1 flex flex-col items-center gap-3">
                      <Emblem tag={TEAM.tag} color={C} size={54} />
                      <span className="text-[13px] font-bold text-center leading-tight">{TEAM.name}</span>
                    </div>
                    <span className="text-[15px] font-black tracking-[0.2em] text-slate-600">VS</span>
                    <div className="flex-1 flex flex-col items-center gap-3">
                      <Emblem tag={next.opp.tag} color={next.opp.c} size={54} />
                      <span className="text-[13px] font-bold text-center leading-tight">{next.opp.n}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-3xl border border-dashed border-white/10 px-6 py-10 text-center">
                  <p className="text-[13px] font-bold text-slate-400">예정된 스크림이 없습니다</p>
                  <p className="mt-2 text-[11px] text-slate-600">팀 일정을 모으면 상대 팀과 맞춰볼 수 있습니다</p>
                  <button onClick={() => setView("board")}
                    className="mt-5 px-5 py-2.5 rounded-full text-[12px] font-bold border transition-colors"
                    style={{ borderColor: `${C}66`, color: C }}>일정 계획판 열기</button>
                </div>
              )}
            </section>

            {/* 로스터 */}
            <section>
              <SecTitle k="Roster" c={`${usTotal}명`} />
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ROSTER.map((p, i) => {
                  const done = p.me ? meDone : true;
                  return (
                    <div key={i} className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                      <span className="w-9 h-9 rounded-full grid place-items-center text-[12px] font-bold shrink-0"
                        style={{ background: `${C}1f`, color: C, border: `1px solid ${C}44` }}>{p.i}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-bold truncate">{p.n}</span>
                        <span className="block text-[10px] font-medium text-slate-500 mt-0.5">
                          {p.pos}<span className="mx-1.5 text-slate-700">·</span>
                          <span className={done ? "text-emerald-400" : "text-amber-400"}>{done ? "일정 제출" : "미제출"}</span>
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 일정 계획판 진입 */}
            <section>
              <SecTitle k="Schedule" c={usReady ? "조율 완료" : `${doneCount}/${usTotal} 제출`} />
              <button onClick={() => setView("board")}
                className="mt-4 w-full text-left rounded-3xl border border-white/[0.09] bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold">일정 계획판</p>
                    <p className="mt-1.5 text-[12px] text-slate-400">
                      {usReady
                        ? <>팀 전원이 제출했습니다 — 가장 많이 겹치는 시간은 <b className="text-white tabular-nums">{usTop && usTop.n ? `${dF(usTop.d)} ${sF(usTop.s)}` : "—"}</b></>
                        : <>아직 <b className="text-amber-400">{usTotal - doneCount}명</b>이 제출하지 않았습니다 · 마감 <b className="tabular-nums text-slate-300">{dueLabel}</b></>}
                    </p>
                  </div>
                  <span className="shrink-0 text-slate-600 group-hover:text-white transition-colors text-[18px]">›</span>
                </div>
                <div className="mt-5 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                  <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${(doneCount / usTotal) * 100}%`, background: C }} />
                </div>
              </button>
            </section>

            {/* 지난 경기 */}
            <section>
              <SecTitle k="Results" c={`${TEAM.w}승 ${TEAM.l}패`} />
              <div className="mt-2">
                {[["8/2(토) 22시", "화이트 클랜", "승", true], ["7/29(화) 21시", "블랙아웃", "승", true],
                  ["7/25(금) 23시", "서리 늑대단", "패", false], ["7/21(월) 22시", "화이트 클랜", "승", true]].map(([w, o, r, win], i) => (
                  <div key={i} className="flex items-center gap-3 py-3.5 border-b border-white/[0.055]">
                    <span className="w-[104px] shrink-0 text-[12px] font-medium text-slate-400 tabular-nums">{w as string}</span>
                    <span className="flex-1 min-w-0 text-[12px] font-bold text-slate-300 truncate">vs {o as string}</span>
                    <span className={`shrink-0 w-6 text-center text-[12px] font-black ${win ? "text-emerald-400" : "text-slate-600"}`}>{r as string}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ═══ 일정 계획판 ═══ */}
        {view === "board" && (
          <section>
            <SecTitle k="일정 계획판" c={`${doneCount}/${usTotal} 제출 · 마감 ${dueLabel}`} />
            <p className="mt-4 text-[13px] font-bold text-slate-200">
              가능한 시간을 눌러주세요. <span className="font-medium text-slate-500">다시 누르면 해제됩니다. 날짜를 누르면 하루 전체가 켜집니다.</span>
            </p>

            <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-8 lg:items-start">
              <div className="overflow-x-auto">
                <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
                  <thead><HeadRow /></thead>
                  <tbody>
                    {DAYS.map((d) => (
                      <tr key={d.getTime()}>
                        <DayTh d={d} tap={() => toggleDay(d)} />
                        {SLOTS.map((s) => {
                          const n = usAt(d, s), isMine = mine.has(keyOf(d, s));
                          const best = usTop && usTop.n > 0 && usTop.d.getTime() === d.getTime() && usTop.s === s;
                          return (
                            <td key={s} className="p-0">
                              <button type="button" onClick={() => toggle(d, s)} aria-pressed={isMine}
                                aria-label={`${dF(d)} ${sF(s)} · ${n}명 가능${isMine ? " · 내가 선택함" : ""}`}
                                style={{
                                  background: n ? `${C}${Math.round((0.10 + (n / usTotal) * 0.55) * 255).toString(16).padStart(2, "0")}` : "rgba(255,255,255,.025)",
                                  borderColor: isMine ? C : best ? "#34d399" : "rgba(255,255,255,.06)",
                                  boxShadow: isMine ? `inset 0 0 0 1px ${C}` : best ? "inset 0 0 0 1.5px #34d399" : undefined,
                                  color: n ? "#e2e8f0" : "#475569",
                                }}
                                className={cellCls}>
                                {n || ""}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <aside className="mt-6 lg:mt-0 lg:sticky lg:top-5">
                <div className="rounded-2xl border p-5" style={{ borderColor: `${C}3d`, background: `${C}12` }}>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: C }}>가장 많이 겹치는 시간</p>
                  <p className="mt-2.5 text-[19px] font-black tracking-tight tabular-nums">{usTop && usTop.n ? `${dF(usTop.d)} ${sF(usTop.s)}` : "—"}</p>
                  <p className="mt-2 text-[12px] font-medium text-slate-400">
                    {usTop && usTop.n ? (() => {
                      const miss = ROSTER.map((p, i) => ({ p, i })).filter(({ p, i }) => (p.me ? meDone : true) && !memberSet(i).has(keyOf(usTop.d, usTop.s))).map(({ p }) => p.n);
                      return <><b className="text-white">{usTop.n}/{usTotal}명</b> 가능{miss.length ? ` · 빠지는 사람 ${miss.join(", ")}` : " · 전원 가능"}</>;
                    })() : "아직 겹치는 시간이 없습니다"}
                  </p>
                </div>
                <button type="button" onClick={() => setShowAlts((v) => !v)} aria-expanded={showAlts}
                  className="w-full mt-3 py-2.5 rounded-xl border border-white/[0.08] text-[12px] font-bold text-slate-400 hover:border-white/25 hover:text-white transition-colors">
                  {showAlts ? "접기" : "다른 시간도 보기"}
                </button>
                {showAlts && usRanked.slice(1, 5).map((x, i) => (
                  <div key={i} className="flex items-baseline gap-2.5 py-2.5 border-b border-white/[0.055] text-[12px]">
                    <b className="font-bold tabular-nums">{dF(x.d)} {sF(x.s)}</b>
                    <span className="ml-auto text-[11px] font-bold text-slate-500 tabular-nums">{x.n}/{usTotal}</span>
                  </div>
                ))}
              </aside>
            </div>

            <div className="mt-7 pt-5 border-t border-white/[0.08] flex items-center gap-4">
              <span className="flex-1 text-[12px] font-medium text-slate-400">
                {mine.size ? <><b className="text-white tabular-nums">{mine.size}칸</b> 선택함</> : "가능한 시간을 표시해주세요"}
              </span>
              <button type="button" disabled={mine.size === 0}
                onClick={() => { const f = !meDone; setMeDone(true); setToast(f ? "제출했습니다 — 팀 전원 조율 완료" : "다시 제출했습니다"); }}
                className="shrink-0 px-8 py-3 rounded-full text-[13px] font-bold transition-all active:scale-[.97] disabled:cursor-not-allowed"
                style={mine.size === 0 ? { background: "rgba(255,255,255,.05)", color: "#475569" } : { background: C, color: "#0b1220", boxShadow: `0 12px 32px -12px ${C}` }}>
                {meDone ? "다시 제출" : "제출"}
              </button>
            </div>
          </section>
        )}

        {/* ═══ 스크림 매칭 ═══ */}
        {view === "match" && (
          <section>
            <SecTitle k="상대 팀" c="조율이 끝난 팀만 매칭됩니다" />
            <div className="grid gap-2.5 mt-4 sm:grid-cols-2">
              {opps.map((t, i) => (
                <button key={i} type="button" disabled={!t.ready} aria-pressed={pick === i}
                  onClick={() => setPick(pick === i ? null : i)}
                  className={`flex items-center gap-3.5 p-4 rounded-2xl border text-left w-full transition-colors ${!t.ready ? "opacity-40 cursor-not-allowed" : "hover:bg-white/[0.04]"}`}
                  style={pick === i ? { borderColor: t.c, background: `${t.c}14` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                  <Emblem tag={t.tag} color={t.c} size={40} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13px] font-bold">{t.n}</b>
                    <span className={`block text-[11px] font-medium mt-0.5 ${t.ready ? "text-emerald-400" : "text-slate-500"}`}>
                      {t.ready ? `조율 완료 · ${t.size}명` : `조율 중 ${t.got}/${t.size}`}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {!usReady && (
              <div className="mt-4 p-4 rounded-2xl border border-dashed border-white/10 text-[12px] font-medium text-slate-400 leading-relaxed">
                우리 팀 조율이 끝나야 매칭할 수 있습니다 — <b className="text-amber-400">{usTotal - doneCount}명</b> 미제출
              </div>
            )}

            {pick !== null && usReady && (
              <>
                <div className="mt-8"><SecTitle k="양 팀이 겹치는 시간" c={`우리 ${usTotal}명 · ${opps[pick].n} ${opps[pick].size}명`} /></div>
                <p className="mt-4 text-[12px] font-medium text-slate-500">
                  숫자는 <b className="text-slate-300">더 적은 쪽 팀</b>의 가능 인원입니다. 양 팀 모두 전원 가능한 칸에 초록 테두리가 붙습니다.
                </p>
                <div className="overflow-x-auto mt-4">
                  <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
                    <thead><HeadRow /></thead>
                    <tbody>
                      {DAYS.map((d) => (
                        <tr key={d.getTime()}>
                          <DayTh d={d} />
                          {SLOTS.map((s) => {
                            const x = bothAt(d, s, opps[pick]);
                            const cap = Math.min(usTotal, opps[pick].size);
                            const full = x.us === usTotal && x.them === opps[pick].size && x.min > 0;
                            return (
                              <td key={s} className="p-0">
                                <span aria-label={`${dF(d)} ${sF(s)} · 우리 ${x.us}명 / ${opps[pick].n} ${x.them}명`}
                                  style={{
                                    background: x.min ? `${C}${Math.round((0.10 + (x.min / cap) * 0.55) * 255).toString(16).padStart(2, "0")}` : "rgba(255,255,255,.025)",
                                    borderColor: full ? "#34d399" : "rgba(255,255,255,.06)",
                                    boxShadow: full ? "inset 0 0 0 1.5px #34d399" : undefined,
                                    color: x.min ? "#e2e8f0" : "#475569",
                                  }}
                                  className={`${cellCls} grid place-items-center active:scale-100`}>
                                  {x.min || ""}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 rounded-3xl border border-white/[0.09] bg-white/[0.02] overflow-hidden">
                  <div className="px-6 py-3 border-b border-white/[0.07] flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400">추천 경기 시각</span>
                    <span className="ml-auto text-[12px] font-bold tabular-nums" style={{ color: C }}>
                      {mTop && mTop.min ? `${dF(mTop.d)} ${sF(mTop.s)}` : "겹치는 시간 없음"}
                    </span>
                  </div>
                  <div className="px-6 py-7 flex items-center justify-center gap-5 sm:gap-9">
                    <div className="flex-1 flex flex-col items-center gap-3">
                      <Emblem tag={TEAM.tag} color={C} size={50} />
                      <span className="text-[12px] font-bold">{TEAM.name}</span>
                      <span className="text-[11px] font-bold tabular-nums text-slate-500">{mTop ? `${mTop.us}/${usTotal}` : "—"}</span>
                    </div>
                    <span className="text-[15px] font-black tracking-[0.2em] text-slate-600">VS</span>
                    <div className="flex-1 flex flex-col items-center gap-3">
                      <Emblem tag={opps[pick].tag} color={opps[pick].c} size={50} />
                      <span className="text-[12px] font-bold">{opps[pick].n}</span>
                      <span className="text-[11px] font-bold tabular-nums text-slate-500">{mTop ? `${mTop.them}/${opps[pick].size}` : "—"}</span>
                    </div>
                  </div>
                  <button type="button" disabled={!mTop || !mTop.min}
                    onClick={() => {
                      if (!mTop || !mTop.min || pick === null) return;
                      const t = opps[pick];
                      setFixtures((prev) => [...prev, { d: mTop.d, s: mTop.s, opp: t, us: mTop.us, them: mTop.them }]
                        .sort((a, b) => a.d.getTime() - b.d.getTime() || a.s - b.s));
                      setToast(`${dF(mTop.d)} ${sF(mTop.s)} · ${t.n} 전 확정 — 양 팀에 공지됩니다`);
                    }}
                    className="w-full py-4 text-[13px] font-bold border-t border-white/[0.07] transition-colors disabled:cursor-not-allowed"
                    style={!mTop || !mTop.min ? { color: "#475569" } : { background: C, color: "#0b1220" }}>
                    이 시각으로 스크림 확정
                  </button>
                </div>
              </>
            )}

            <div className="mt-9"><SecTitle k="확정된 스크림" /></div>
            {fixtures.length === 0
              ? <p className="py-7 text-[12px] font-medium text-slate-600">아직 확정된 스크림이 없습니다.</p>
              : fixtures.map((f, i) => (
                <div key={i} className="flex items-center gap-3.5 py-4 border-b border-white/[0.055]">
                  <span className="w-[108px] shrink-0 text-[12px] font-bold tabular-nums text-slate-300">{dF(f.d)} {sF(f.s)}</span>
                  <Emblem tag={f.opp.tag} color={f.opp.c} size={28} />
                  <span className="flex-1 min-w-0 text-[12px] font-bold text-slate-300 truncate">vs {f.opp.n}</span>
                  <span className="shrink-0 text-[10px] font-bold tracking-[0.14em] uppercase text-emerald-400">확정</span>
                </div>
              ))}
          </section>
        )}

        {/* ═══ 기간 설정 ═══ */}
        {view === "cfg" && (
          <section>
            <SecTitle k="조율 기간" c="바꾸면 계획판이 다시 그려집니다" />

            <div className="mt-5">
              <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 mb-2">시작 날짜</span>
              <DateStrip sel={cfg.start} onPick={(d) => { patch({ start: d }); setToast(`시작 날짜를 ${dF(d)}로 바꿨습니다`); }} />
            </div>

            <div className="flex flex-wrap gap-4 items-end mt-5">
              <Stepper label="기간" value={`${cfg.days}일`} sub={`~ ${dF(endDate)}`}
                onMinus={() => patch({ days: cfg.days - 1 })} onPlus={() => patch({ days: cfg.days + 1 })}
                minusOff={cfg.days <= 1} plusOff={cfg.days >= 21} />
              <div>
                <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 mb-2">시간 단위</span>
                <div className="inline-flex rounded-xl overflow-hidden border border-white/[0.08] bg-white/[0.03]">
                  {[60, 30].map((v) => (
                    <button key={v} type="button" aria-pressed={cfg.step === v} onClick={() => patch({ step: v })}
                      className="px-4 py-2.5 text-[12px] font-bold border-l border-white/[0.08] first:border-l-0 transition-colors"
                      style={cfg.step === v ? { background: `${C}1f`, color: C } : { color: "#94a3b8" }}>
                      {v === 60 ? "1시간" : "30분"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 items-end mt-5">
              <Stepper label="시작 시각" value={hourLabel(cfg.from)}
                onMinus={() => patch({ from: cfg.from - 1 })} onPlus={() => patch({ from: cfg.from + 1 })}
                minusOff={cfg.from <= 0} plusOff={cfg.from >= cfg.to - 1} />
              <Stepper label="종료 시각" value={hourLabel(cfg.to)} sub={cfg.to > 24 ? "익일" : undefined}
                onMinus={() => patch({ to: cfg.to - 1 })} onPlus={() => patch({ to: cfg.to + 1 })}
                minusOff={cfg.to <= cfg.from + 1} plusOff={cfg.to >= 30} />
            </div>

            <div className="mt-7">
              <span className="block text-[10px] font-bold tracking-[0.14em] uppercase text-slate-500 mb-2">응답 마감 — 날짜</span>
              <DateStrip sel={cfg.due} onPick={(d) => setCfg((c) => ({ ...c, due: d }))} />
            </div>
            <div className="mt-5">
              <Stepper label="응답 마감 — 시각" value={`${pad(Math.floor(cfg.dueMin / 60))}:${pad(cfg.dueMin % 60)}`}
                onMinus={() => setCfg((c) => ({ ...c, dueMin: (c.dueMin + 1440 - 30) % 1440 }))}
                onPlus={() => setCfg((c) => ({ ...c, dueMin: (c.dueMin + 30) % 1440 }))} />
            </div>

            <p className="mt-6 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-[12px] font-medium text-slate-400 leading-relaxed">
              <b className="text-white tabular-nums">{dF(cfg.start)}</b> 부터 <b className="text-white tabular-nums">{cfg.days}일</b>간 · 매일{" "}
              <b className="text-white">{hourLabel(cfg.from)}~{hourLabel(cfg.to)}</b> · <b className="text-white">{cfg.step === 60 ? "1시간" : "30분"}</b> 단위
              <br />한 사람이 볼 칸 <b className="text-white tabular-nums">{cells}칸</b>
              {cells > 90 && <span className="text-amber-400"> — 칸이 많으면 응답률이 떨어집니다</span>}
            </p>
          </section>
        )}

        <div className="mt-10 p-4 rounded-2xl border border-dashed border-white/[0.08]">
          <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
            <b className="text-slate-300">프로토타입입니다.</b> 팀·로스터·상대 팀·전적은 예시 데이터이고, 실제로는 대회에 등록된 팀과 경매 로스터를 그대로 가져옵니다.
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed left-3 right-3 bottom-6 lg:left-auto lg:right-6 z-[60] max-w-[400px] mx-auto lg:mx-0 flex items-center gap-3 min-h-[46px] px-5 py-3 rounded-2xl border border-white/10 bg-[#12141a]/95 backdrop-blur-xl shadow-[0_20px_50px_-16px_#000] text-[12px] font-medium text-slate-200 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: C }} />
          {toast}
        </div>
      )}
    </main>
  );
}
