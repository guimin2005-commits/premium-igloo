"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 스크림 매칭 룸 (관리자 전용 · 프로토타입)
   흐름: 우리 팀 조율 완료 + 상대 팀 조율 완료 → 겹치는 시간 도출 → 관리자가 경기 확정.
   아직 Team 모델이 없어 팀·응답은 예시 데이터로 채우고, 화면과 조작만 실제로 굴려본다.
   네이티브 select/date 는 쓰지 않는다 — 다크 화면에서 브라우저 기본 UI가 튄다. */

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const midnight = (d: Date | number) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const dL = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const dF = (d: Date) => `${dL(d)}(${WD[d.getDay()]})`;
const hourLabel = (h: number) => (h >= 24 ? `${h - 24}시` : h === 0 ? "자정" : `${h}시`);

type Cfg = { start: Date; days: number; from: number; to: number; step: number; due: Date; dueMin: number };
type Member = { n: string; i: string; me?: boolean; done: boolean; set: Set<string> };
type Opp = { n: string; i: string; c: string; size: number; ready: boolean; got?: number; bias: number; counts: Map<string, number> };
type Fixture = { d: Date; s: number; oppName: string; us: number; them: number };

const keyOf = (d: Date, m: number) => `${d.getTime()}|${m}`;

// 예시 데이터를 항상 같은 모양으로 만들기 위한 고정 시드 난수
const mkRnd = (s0: number) => { let s = s0; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); };

export default function AdminScrimPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [view, setView] = useState<"us" | "match" | "cfg">("us");
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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2300);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── 격자 축 ── */
  const DAYS = useMemo(
    () => Array.from({ length: cfg.days }, (_, i) => { const d = new Date(cfg.start); d.setDate(d.getDate() + i); return d; }),
    [cfg.start, cfg.days]
  );
  const SLOTS = useMemo(() => {
    const out: number[] = [];
    for (let m = cfg.from * 60; m < cfg.to * 60; m += cfg.step) out.push(m);
    return out;
  }, [cfg.from, cfg.to, cfg.step]);

  const sL = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return cfg.step === 60 ? `${h}시` : `${h}:${pad(mm)}`; };
  const sF = (m: number) => {
    const h = Math.floor(m / 60), hh = h % 24, mm = m % 60;
    return `${hh === 0 ? "자정" : `${hh}시`}${mm ? ` ${mm}분` : ""}${h >= 24 ? " (익일)" : ""}`;
  };

  /* ── 예시 팀원·상대 팀 ── */
  const mates = useMemo<Member[]>(() => {
    const base = [["구민", "구"], ["주전자", "주"], ["레비", "레"], ["한별", "한"], ["도윤", "도"]];
    return base.map(([n, i], idx) => {
      const rnd = mkRnd(20260809 + idx * 7919);
      const set = new Set<string>();
      DAYS.forEach((d) => SLOTS.forEach((s) => {
        const h = Math.floor(s / 60) % 24, wk = d.getDay() === 0 || d.getDay() === 6;
        let p = h >= 22 || h < 6 ? 0.69 : 0.49; if (wk) p += 0.12;
        if (rnd() < p) set.add(keyOf(d, s));
      }));
      return { n, i, done: true, set };
    });
  }, [DAYS, SLOTS]);

  const opps = useMemo<Opp[]>(() => {
    const base: Omit<Opp, "counts">[] = [
      { n: "서리 늑대단", i: "서", c: "#7aa2ff", size: 6, ready: true, bias: 0.60 },
      { n: "화이트 클랜", i: "화", c: "#fbbf24", size: 6, ready: true, bias: 0.48 },
      { n: "블랙아웃", i: "블", c: "#a78bfa", size: 6, ready: false, got: 3, bias: 0.55 },
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

  const me: Member = { n: "나", i: "나", me: true, done: meDone, set: mine };
  const everyone = [me, ...mates];
  const usTotal = mates.length + 1;
  const usAt = (d: Date, s: number) =>
    mates.filter((p) => p.set.has(keyOf(d, s))).length + (mine.has(keyOf(d, s)) ? 1 : 0);
  const usReady = everyone.every((p) => p.done);

  const usRanked = useMemo(() => {
    const o: { d: Date; s: number; n: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => o.push({ d, s, n: usAt(d, s) })));
    return o.sort((a, b) => b.n - a.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DAYS, SLOTS, mine, mates]);

  const bothAt = (d: Date, s: number, t: Opp) => {
    const us = usAt(d, s), them = t.counts.get(keyOf(d, s)) || 0;
    return { us, them, min: Math.min(us, them) };
  };
  const mRanked = useMemo(() => {
    if (pick === null) return [];
    const t = opps[pick];
    const o: { d: Date; s: number; us: number; them: number; min: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => o.push({ d, s, ...bothAt(d, s, t) })));
    return o.sort((a, b) => b.min - a.min || b.us + b.them - (a.us + a.them));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, opps, DAYS, SLOTS, mine, mates]);

  /* ── 설정 조작 ── */
  const patch = (p: Partial<Cfg>) => { setCfg((c) => ({ ...c, ...p })); setMine(new Set()); setMeDone(false); setPick(null); };
  const cells = cfg.days * SLOTS.length;

  const toggle = (d: Date, s: number) => {
    const k = keyOf(d, s);
    setMine((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const toggleDay = (d: Date) => {
    const on = SLOTS.every((s) => mine.has(keyOf(d, s)));
    setMine((prev) => {
      const n = new Set(prev);
      SLOTS.forEach((s) => (on ? n.delete(keyOf(d, s)) : n.add(keyOf(d, s))));
      return n;
    });
    setToast(`${dF(d)} 전체를 ${on ? "해제했습니다" : "가능으로 표시했습니다"}`);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  /* ── 공용 조각 ── */
  const cellCls = "w-[44px] h-[36px] lg:w-[56px] lg:h-[42px] border text-[12px] font-black tabular-nums transition-transform active:scale-[.93]";
  const HeadRow = () => (
    <tr>
      <th className="w-px" />
      {SLOTS.map((s) => (
        <th key={s} className="pb-[3px] text-[9px] font-black text-gray-600 tabular-nums whitespace-nowrap">{sL(s)}</th>
      ))}
    </tr>
  );
  const DayTh = ({ d, tap }: { d: Date; tap?: () => void }) => (
    <th
      onClick={tap}
      tabIndex={tap ? 0 : -1}
      onKeyDown={(e) => { if (tap && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tap(); } }}
      className={`text-left pr-2 whitespace-nowrap ${tap ? "cursor-pointer group" : ""}`}
    >
      <span className="block text-[12px] font-black text-gray-300 tabular-nums group-hover:text-white">{dL(d)}</span>
      <span className={`block text-[9px] font-black mt-px ${d.getDay() === 6 ? "text-[#7aa2ff]" : d.getDay() === 0 ? "text-[#ff5c77]" : "text-gray-600"}`}>{WD[d.getDay()]}</span>
    </th>
  );

  const Stepper = ({ label, value, sub, onMinus, onPlus, minusOff, plusOff }: {
    label: string; value: string; sub?: string; onMinus: () => void; onPlus: () => void; minusOff?: boolean; plusOff?: boolean;
  }) => (
    <div>
      <span className="block text-[10px] font-black tracking-[0.16em] uppercase text-gray-600 mb-2">{label}</span>
      <div className="inline-flex items-stretch border border-white/10 rounded-[10px] overflow-hidden bg-[#0e0e10]">
        <button type="button" onClick={onMinus} disabled={minusOff} aria-label={`${label} 줄이기`}
          className="w-[38px] text-[16px] font-black leading-none text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors">−</button>
        <span className="min-w-[92px] px-1.5 py-2.5 text-center border-x border-white/10">
          <span className="block text-[13px] font-black tabular-nums">{value}</span>
          {sub && <span className="block text-[9px] font-bold text-gray-600 mt-0.5">{sub}</span>}
        </span>
        <button type="button" onClick={onPlus} disabled={plusOff} aria-label={`${label} 늘리기`}
          className="w-[38px] text-[16px] font-black leading-none text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors">+</button>
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
            className={`shrink-0 min-w-[52px] px-1 py-2 rounded-[10px] border text-center transition-colors ${on ? "border-white bg-[#17171a]" : "border-white/10 bg-[#0e0e10] hover:border-white/25"}`}>
            <span className={`block text-[12px] font-black tabular-nums ${on ? "text-white" : "text-gray-300"}`}>{dL(d)}</span>
            <span className={`block text-[9px] font-black mt-0.5 ${d.getDay() === 6 ? "text-[#7aa2ff]" : d.getDay() === 0 ? "text-[#ff5c77]" : "text-gray-600"}`}>
              {i === 0 ? "오늘" : i === 1 ? "내일" : WD[d.getDay()]}
            </span>
          </button>
        );
      })}
    </div>
  );

  const usTop = usRanked[0];
  const mTop = mRanked[0];
  const dueLabel = `${dF(cfg.due)} ${pad(Math.floor(cfg.dueMin / 60))}:${pad(cfg.dueMin % 60)}`;
  const endDate = (() => { const e = new Date(cfg.start); e.setDate(e.getDate() + cfg.days - 1); return e; })();

  return (
    <main className="w-full max-w-[1000px] mx-auto px-4 pb-24">
      {/* ── 헤더 ── */}
      <header className="relative pt-6 border-b border-white/10">
        <span className="absolute top-0 inset-x-0 h-[2px] bg-[#e91e3f]" />
        <h1 className="text-[19px] font-black tracking-tight">이글루 페이커즈 · 팀 룸</h1>
        <p className="mt-1.5 text-[11px] font-bold text-gray-400">응답 마감 <b className="text-[#ff5c77] tabular-nums">{dueLabel}</b></p>
        <nav className="flex mt-4" role="tablist">
          {([["us", "우리 팀 일정"], ["match", "스크림 매칭"], ["cfg", "일정 설정"]] as const).map(([k, t]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
              className={`py-3 mr-6 text-[12px] font-black border-b-2 transition-colors ${view === k ? "text-white border-[#e91e3f]" : "text-gray-600 border-transparent hover:text-gray-300"}`}>{t}</button>
          ))}
        </nav>
      </header>

      {/* ══ 우리 팀 일정 ══ */}
      {view === "us" && (
        <section className="pt-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black text-gray-300 tabular-nums">
              {everyone.filter((p) => p.done).length}<span className="text-gray-600">/{usTotal}명 응답</span>
            </span>
            <span className="flex gap-1">
              {everyone.map((p, i) => (
                <span key={i} title={p.n}
                  className={`w-[22px] h-[22px] rounded-full grid place-items-center text-[10px] font-black text-[#0b0b0c] ${p.done ? "bg-emerald-400" : "bg-gray-700"} ${p.me ? "ring-[3px] ring-white ring-offset-2 ring-offset-[#0b0b0c]" : ""}`}>{p.i}</span>
              ))}
            </span>
            <span className="text-[10px] font-bold text-gray-600">
              {everyone.some((p) => !p.done)
                ? <>· <b className="text-[#ff5c77]">{everyone.filter((p) => !p.done).map((p) => p.n).join(", ")}</b> 대기 중</>
                : "· 조율 완료"}
            </span>
          </div>

          <p className="mt-4 text-[12px] font-extrabold text-gray-300">
            가능한 시간을 눌러주세요. <span className="font-bold text-gray-600">다시 누르면 해제됩니다. 날짜를 누르면 하루 전체가 켜집니다.</span>
          </p>

          <div className="mt-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-7 lg:items-start">
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
                              style={{ background: n ? `rgba(233,30,63,${(0.10 + (n / usTotal) * 0.60).toFixed(3)})` : "#0e0e10" }}
                              className={`${cellCls} ${isMine ? "border-white text-white shadow-[inset_0_0_0_1px_#fff]" : "border-white/[0.06] text-gray-700"} ${best ? "!border-[#e91e3f] shadow-[inset_0_0_0_2px_#e91e3f]" : ""}`}>
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

            <aside className="mt-5 lg:mt-0 lg:sticky lg:top-5">
              <div className="border border-[#e91e3f]/40 bg-[#e91e3f]/[0.08] rounded-[14px] p-4">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-[#ff5c77]">우리 팀이 가장 많이 겹치는 시간</p>
                <p className="mt-2 text-[19px] font-black tracking-tight tabular-nums">
                  {usTop && usTop.n ? `${dF(usTop.d)} ${sF(usTop.s)}` : "—"}
                </p>
                <p className="mt-1.5 text-[11px] font-bold text-gray-400">
                  {usTop && usTop.n ? (() => {
                    const miss = everyone.filter((p) => (p.done || p.me) && !p.set.has(keyOf(usTop.d, usTop.s))).map((p) => p.n);
                    return <><b className="text-white">{usTop.n}/{usTotal}명</b> 가능{miss.length ? ` · 빠지는 사람 ${miss.join(", ")}` : " · 전원 가능"}</>;
                  })() : "아직 겹치는 시간이 없습니다"}
                </p>
              </div>
              <button type="button" onClick={() => setShowAlts((v) => !v)} aria-expanded={showAlts}
                className="w-full mt-3 py-2.5 rounded-[9px] border border-white/10 text-[11px] font-extrabold text-gray-400 hover:border-white/25 hover:text-white transition-colors">
                {showAlts ? "접기" : "다른 시간도 보기"}
              </button>
              {showAlts && (
                <div>
                  {usRanked.slice(1, 5).map((x, i) => (
                    <div key={i} className="flex items-baseline gap-2.5 py-2.5 border-b border-white/[0.055] text-[12px]">
                      <b className="font-black tabular-nums">{dF(x.d)} {sF(x.s)}</b>
                      <span className="ml-auto text-[11px] font-extrabold text-gray-600 tabular-nums">{x.n}/{usTotal}</span>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-3">
            <span className="flex-1 text-[11px] font-extrabold text-gray-400">
              {mine.size ? <><b className="text-white tabular-nums">{mine.size}칸</b> 선택함</> : "가능한 시간을 표시해주세요"}
            </span>
            <button type="button" disabled={mine.size === 0}
              onClick={() => { const first = !meDone; setMeDone(true); setToast(first ? "제출했습니다 — 우리 팀 조율 완료" : "다시 제출했습니다"); }}
              className="shrink-0 px-7 py-3 rounded-full bg-[#e91e3f] text-white text-[13px] font-black shadow-[0_12px_32px_-10px_rgba(233,30,63,.85)] hover:bg-[#d01634] active:scale-[.97] disabled:bg-white/[0.06] disabled:text-gray-700 disabled:shadow-none disabled:cursor-not-allowed transition-all">
              {meDone ? "다시 제출" : "제출"}
            </button>
          </div>
        </section>
      )}

      {/* ══ 스크림 매칭 ══ */}
      {view === "match" && (
        <section className="pt-5">
          <div className="flex items-baseline gap-2.5 pb-2 border-b border-white/25">
            <span className="text-[10px] font-black tracking-[0.2em] uppercase">상대 팀</span>
            <span className="ml-auto text-[10px] font-bold text-gray-600">조율이 끝난 팀만 매칭됩니다</span>
          </div>

          <div className="grid gap-2 mt-3.5 sm:grid-cols-2">
            {opps.map((t, i) => (
              <button key={i} type="button" disabled={!t.ready} aria-pressed={pick === i}
                onClick={() => setPick(pick === i ? null : i)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left w-full transition-colors ${pick === i ? "border-white bg-[#17171a]" : "border-white/10 bg-[#0e0e10] hover:border-white/25"} ${!t.ready ? "opacity-45 cursor-not-allowed" : ""}`}>
                <span className="w-[34px] h-[34px] rounded-[10px] grid place-items-center text-[13px] font-black text-[#0b0b0c] shrink-0" style={{ background: t.c }}>{t.i}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-[13px] font-black text-white">{t.n}</b>
                  <span className={`block text-[10px] font-extrabold mt-0.5 ${t.ready ? "text-emerald-400" : "text-gray-600"}`}>
                    {t.ready ? `조율 완료 · ${t.size}명` : `조율 중 ${t.got}/${t.size}`}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {!usReady && (
            <div className="mt-3.5 p-3.5 border border-dashed border-white/10 rounded-xl text-[11px] font-extrabold text-gray-600 leading-relaxed">
              우리 팀 조율이 끝나야 매칭할 수 있습니다 — <b className="text-[#ff5c77]">{everyone.filter((p) => !p.done).map((p) => p.n).join(", ")}</b> 응답 대기 중
            </div>
          )}

          {pick !== null && usReady && (
            <>
              <div className="flex items-baseline gap-2.5 pb-2 border-b border-white/25 mt-7">
                <span className="text-[10px] font-black tracking-[0.2em] uppercase">양 팀이 겹치는 시간</span>
                <span className="ml-auto text-[10px] font-bold text-gray-600">우리 {usTotal}명 · {opps[pick].n} {opps[pick].size}명</span>
              </div>
              <p className="mt-3.5 text-[12px] font-bold text-gray-600">
                숫자는 <b className="text-gray-300">더 적은 쪽 팀</b>의 가능 인원입니다. 양 팀 모두 전원 가능한 칸에 붉은 테두리가 붙습니다.
              </p>
              <div className="overflow-x-auto mt-3">
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
                                style={{ background: x.min ? `rgba(233,30,63,${(0.10 + (x.min / cap) * 0.60).toFixed(3)})` : "#0e0e10" }}
                                className={`${cellCls} grid place-items-center border-white/[0.06] text-gray-300 active:scale-100 ${full ? "!border-[#e91e3f] shadow-[inset_0_0_0_2px_#e91e3f]" : ""}`}>
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

              <div className="mt-4 border border-emerald-400/35 bg-emerald-400/[0.06] rounded-[14px] p-4">
                <p className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-400">추천 경기 시각</p>
                <p className="mt-2 text-[19px] font-black tracking-tight tabular-nums">
                  {mTop && mTop.min ? `${dF(mTop.d)} ${sF(mTop.s)}` : "겹치는 시간 없음"}
                </p>
                <p className="mt-1.5 text-[11px] font-bold text-gray-400">
                  {mTop && mTop.min
                    ? <>우리 <b className="text-white">{mTop.us}/{usTotal}</b> · {opps[pick].n} <b className="text-white">{mTop.them}/{opps[pick].size}</b></>
                    : "조율 기간을 넓히거나 시간대를 늘려보세요"}
                </p>
                <button type="button" disabled={!mTop || !mTop.min}
                  onClick={() => {
                    if (!mTop || !mTop.min || pick === null) return;
                    const t = opps[pick];
                    setFixtures((prev) => [...prev, { d: mTop.d, s: mTop.s, oppName: t.n, us: mTop.us, them: mTop.them }]
                      .sort((a, b) => a.d.getTime() - b.d.getTime() || a.s - b.s));
                    setToast(`${dF(mTop.d)} ${sF(mTop.s)} · ${t.n} 전 확정 — 양 팀에 공지됩니다`);
                  }}
                  className="w-full mt-3.5 py-3 rounded-[10px] bg-[#e91e3f] text-white text-[12px] font-black shadow-[0_10px_28px_-10px_rgba(233,30,63,.8)] hover:bg-[#d01634] active:scale-[.98] disabled:bg-white/[0.06] disabled:text-gray-700 disabled:shadow-none disabled:cursor-not-allowed transition-all">
                  이 시각으로 스크림 확정
                </button>
              </div>
            </>
          )}

          <div className="flex items-baseline gap-2.5 pb-2 border-b border-white/25 mt-8">
            <span className="text-[10px] font-black tracking-[0.2em] uppercase">확정된 스크림</span>
          </div>
          {fixtures.length === 0
            ? <p className="py-6 text-[11px] font-bold text-gray-700">아직 확정된 스크림이 없습니다.</p>
            : fixtures.map((f, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-white/[0.055]">
                <span className="w-[104px] shrink-0 text-[12px] font-black tabular-nums">{dF(f.d)} {sF(f.s)}</span>
                <span className="flex-1 min-w-0 text-[12px] font-extrabold text-gray-300">
                  이글루 페이커즈 <span className="text-gray-600 mx-1.5">vs</span> {f.oppName}
                </span>
                <span className="shrink-0 text-[9px] font-black tracking-[0.14em] uppercase text-emerald-400">확정</span>
              </div>
            ))}
        </section>
      )}

      {/* ══ 일정 설정 ══ */}
      {view === "cfg" && (
        <section className="pt-5">
          <div className="flex items-baseline gap-2.5 pb-2 border-b border-white/25">
            <span className="text-[10px] font-black tracking-[0.2em] uppercase">조율 기간</span>
            <span className="ml-auto text-[10px] font-bold text-gray-600">바꾸면 격자가 다시 그려집니다</span>
          </div>

          <div className="mt-4">
            <span className="block text-[10px] font-black tracking-[0.16em] uppercase text-gray-600 mb-2">시작 날짜</span>
            <DateStrip sel={cfg.start} onPick={(d) => { patch({ start: d }); setToast(`시작 날짜를 ${dF(d)}로 바꿨습니다`); }} />
          </div>

          <div className="flex flex-wrap gap-3 items-end mt-4">
            <Stepper label="기간" value={`${cfg.days}일`} sub={`~ ${dF(endDate)}`}
              onMinus={() => patch({ days: cfg.days - 1 })} onPlus={() => patch({ days: cfg.days + 1 })}
              minusOff={cfg.days <= 1} plusOff={cfg.days >= 21} />
            <div>
              <span className="block text-[10px] font-black tracking-[0.16em] uppercase text-gray-600 mb-2">시간 단위</span>
              <div className="inline-flex border border-white/10 rounded-[10px] overflow-hidden bg-[#0e0e10]">
                {[60, 30].map((v) => (
                  <button key={v} type="button" aria-pressed={cfg.step === v} onClick={() => patch({ step: v })}
                    className={`px-4 py-2.5 text-[12px] font-black border-l border-white/10 first:border-l-0 transition-colors ${cfg.step === v ? "bg-[#17171a] text-white" : "text-gray-600 hover:text-gray-300"}`}>
                    {v === 60 ? "1시간" : "30분"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end mt-4">
            <Stepper label="시작 시각" value={hourLabel(cfg.from)}
              onMinus={() => patch({ from: cfg.from - 1 })} onPlus={() => patch({ from: cfg.from + 1 })}
              minusOff={cfg.from <= 0} plusOff={cfg.from >= cfg.to - 1} />
            <Stepper label="종료 시각" value={hourLabel(cfg.to)} sub={cfg.to > 24 ? "익일" : undefined}
              onMinus={() => patch({ to: cfg.to - 1 })} onPlus={() => patch({ to: cfg.to + 1 })}
              minusOff={cfg.to <= cfg.from + 1} plusOff={cfg.to >= 30} />
          </div>

          <div className="mt-6">
            <span className="block text-[10px] font-black tracking-[0.16em] uppercase text-gray-600 mb-2">응답 마감 — 날짜</span>
            <DateStrip sel={cfg.due} onPick={(d) => setCfg((c) => ({ ...c, due: d }))} />
          </div>
          <div className="mt-4">
            <Stepper label="응답 마감 — 시각" value={`${pad(Math.floor(cfg.dueMin / 60))}:${pad(cfg.dueMin % 60)}`}
              onMinus={() => setCfg((c) => ({ ...c, dueMin: (c.dueMin + 1440 - 30) % 1440 }))}
              onPlus={() => setCfg((c) => ({ ...c, dueMin: (c.dueMin + 30) % 1440 }))} />
          </div>

          <p className="mt-5 p-3.5 border border-white/10 rounded-[11px] bg-[#0e0e10] text-[11px] font-extrabold text-gray-400 leading-relaxed">
            <b className="text-white tabular-nums">{dF(cfg.start)}</b> 부터 <b className="text-white tabular-nums">{cfg.days}일</b>간 · 매일{" "}
            <b className="text-white">{hourLabel(cfg.from)}~{hourLabel(cfg.to)}</b> · <b className="text-white">{cfg.step === 60 ? "1시간" : "30분"}</b> 단위
            <br />한 사람이 볼 칸 <b className="text-white tabular-nums">{cells}칸</b>
            {cells > 90 && <span className="text-[#ff5c77]"> — 칸이 많으면 응답률이 떨어집니다</span>}
          </p>

          <div className="mt-6 p-3.5 border border-dashed border-white/10 rounded-xl">
            <p className="text-[11px] font-bold text-gray-600 leading-relaxed">
              <b className="text-gray-300">프로토타입입니다.</b> 팀·응답·상대 팀은 예시 데이터이고, 설정을 바꾸면 격자와 예시 응답이 함께 다시 만들어집니다.
              실제로는 대회 팀 페이지에서 로스터를 그대로 가져옵니다.
            </p>
          </div>
        </section>
      )}

      {toast && (
        <div className="fixed left-3 right-3 bottom-6 lg:left-auto lg:right-6 z-[60] max-w-[380px] mx-auto lg:mx-0 flex items-center gap-2.5 min-h-[44px] px-4 py-2.5 rounded-2xl border border-white/10 bg-[#121214]/95 backdrop-blur-xl shadow-[0_20px_50px_-16px_#000] text-[12px] font-bold animate-in fade-in slide-in-from-bottom-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0" />
          {toast}
        </div>
      )}
    </main>
  );
}
