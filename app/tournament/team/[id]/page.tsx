"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { EsportsStyles } from "../../../components/Esports";

/* 📌 팀 룸 — 대회에 소속된 팀이 머무는 공간
   디자인은 새로 만들지 않고 /tournament 의 e스포츠 언어를 그대로 상속한다.
   컷 코너(esp-cut) · 모노 라벨 · 하드 그린은 '대회' 크롬, 팀 색은 '팀 정체성'에만 쓴다.
   레이아웃은 세로 스택이 아니라 좌우로 갈라진 대시보드다. */

const G = "#00e07b";                 // 대회 크롬 (사이트 공통)
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const DAY = 864e5;
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sKey = (d: Date, m: number) => `${ymd(d)}|${m}`;
const dL = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const dF = (d: Date) => `${dL(d)}(${WD[d.getDay()]})`;
const hourLabel = (h: number) => (h >= 24 ? `${h - 24}시` : h === 0 ? "자정" : `${h}시`);
const midnight = (d: Date | number | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

type Member = { discordId: string; name: string; pos: string; leader?: boolean };
type Team = { _id: string; name: string; tag: string; color: string; wins: number; losses: number; members: Member[]; avail: { userId: string; userName: string; slots: string[] }[] };
type Season = { _id: string; title: string; startAt: string; days: number; fromHour: number; toHour: number; stepMin: number; dueAt: string };
type Fixture = { _id: string; teamAId: string; teamBId: string; at: string; winnerId: string; scoreA: number; scoreB: number };

export default function TeamRoom() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";

  const [data, setData] = useState<{ me: string; isAdmin: boolean; season: Season; teams: Team[]; fixtures: Fixture[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminMode, setAdminMode] = useState(false);
  const [view, setView] = useState<"room" | "board" | "match" | "cfg">("room");
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/scrim", { cache: "no-store" });
      const d = await r.json();
      if (d?.success) setData(d);
    } catch { /* 네트워크 오류는 아래 빈 화면으로 드러난다 */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (signedIn) load(); else setLoading(status !== "unauthenticated"); }, [signedIn, status, load]);

  const team = useMemo(() => data?.teams.find((t) => t._id === id) || null, [data, id]);
  const season = data?.season;

  // 내가 이미 낸 응답을 편집 상태로 옮긴다
  useEffect(() => {
    if (!team || !data) return;
    const found = team.avail.find((a) => a.userId === data.me);
    setMine(new Set(found?.slots || []));
    setDirty(false);
  }, [team, data]);

  const DAYS = useMemo(() => {
    if (!season) return [];
    const s = midnight(season.startAt);
    return Array.from({ length: season.days }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; });
  }, [season]);
  const SLOTS = useMemo(() => {
    if (!season) return [];
    const o: number[] = [];
    for (let m = season.fromHour * 60; m < season.toHour * 60; m += season.stepMin) o.push(m);
    return o;
  }, [season]);
  const sL = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return season?.stepMin === 60 ? `${h}` : `${h}:${pad(mm)}`; };
  const sF = (m: number) => { const h = Math.floor(m / 60), hh = h % 24, mm = m % 60; return `${hh === 0 ? "자정" : `${hh}시`}${mm ? ` ${mm}분` : ""}${h >= 24 ? "(익일)" : ""}`; };

  /* ── 집계 ── */
  const submitted = useMemo(() => new Set((team?.avail || []).map((a) => a.userId)), [team]);
  const meSubmitted = !!data && submitted.has(data.me);
  const doneCount = useMemo(() => (team?.members || []).filter((m) => m.discordId && submitted.has(m.discordId)).length, [team, submitted]);
  const size = team?.members.length || 0;
  const usReady = size > 0 && doneCount >= size;

  // 내 편집분은 실시간으로 합쳐 보여준다 (제출 전에도 결과가 움직인다)
  const usAt = useCallback((d: Date, s: number) => {
    if (!team || !data) return 0;
    const k = sKey(d, s);
    let n = team.avail.filter((a) => a.userId !== data.me && a.slots.includes(k)).length;
    if (mine.has(k)) n += 1;
    return n;
  }, [team, data, mine]);

  const usRanked = useMemo(() => {
    const o: { d: Date; s: number; n: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => o.push({ d, s, n: usAt(d, s) })));
    return o.sort((a, b) => b.n - a.n);
  }, [DAYS, SLOTS, usAt]);
  const usTop = usRanked[0];

  const oppTeams = useMemo(() => (data?.teams || []).filter((t) => t._id !== id), [data, id]);
  const oppReady = (t: Team) => t.members.length > 0 && t.members.filter((m) => m.discordId && t.avail.some((a) => a.userId === m.discordId)).length >= t.members.length;
  const themAt = (t: Team, d: Date, s: number) => t.avail.filter((a) => a.slots.includes(sKey(d, s))).length;

  const mRanked = useMemo(() => {
    const t = oppTeams.find((x) => x._id === pick);
    if (!t) return [];
    const o: { d: Date; s: number; us: number; them: number; min: number }[] = [];
    DAYS.forEach((d) => SLOTS.forEach((s) => {
      const us = usAt(d, s), them = themAt(t, d, s);
      o.push({ d, s, us, them, min: Math.min(us, them) });
    }));
    return o.sort((a, b) => b.min - a.min || b.us + b.them - (a.us + a.them));
  }, [pick, oppTeams, DAYS, SLOTS, usAt]);
  const mTop = mRanked[0];

  const myFixtures = useMemo(() => (data?.fixtures || []).filter((f) => f.teamAId === id || f.teamBId === id), [data, id]);
  const upcoming = myFixtures.filter((f) => new Date(f.at).getTime() > Date.now() - 2 * 3600e3 && !f.winnerId);
  const played = myFixtures.filter((f) => f.winnerId);
  const teamById = (tid: string) => data?.teams.find((t) => t._id === tid);

  /* ── 동작 ── */
  const post = async (payload: any) => {
    setBusy(true);
    try {
      const r = await fetch("/api/scrim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!d?.success) { setToast(d?.message || "처리하지 못했습니다"); return null; }
      await load();
      return d;
    } catch { setToast("서버 통신 오류"); return null; }
    finally { setBusy(false); }
  };

  const toggle = (d: Date, s: number) => {
    const k = sKey(d, s);
    setMine((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
    setDirty(true);
  };
  const toggleDay = (d: Date) => {
    const on = SLOTS.every((s) => mine.has(sKey(d, s)));
    setMine((p) => { const n = new Set(p); SLOTS.forEach((s) => (on ? n.delete(sKey(d, s)) : n.add(sKey(d, s)))); return n; });
    setDirty(true);
  };

  /* ── 게이트 ── */
  if (status === "loading" || loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;
  if (!signedIn) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">로그인이 필요합니다</h2>
        <p className="text-gray-400 text-sm mb-4">팀 룸은 팀원만 볼 수 있습니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }
  if (!team || !season) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center">
        <h2 className="text-xl font-black text-white mb-2">팀을 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-6">삭제되었거나 아직 등록되지 않은 팀입니다.</p>
        <button onClick={() => router.push("/tournament")} className="esp-cut-sm bg-white/[0.06] text-gray-300 text-xs font-black px-5 py-3">대회로 돌아가기</button>
      </main>
    );
  }

  const isAdmin = !!data?.isAdmin;
  const inTeam = team.members.some((m) => m.discordId && m.discordId === data?.me);
  const C = team.color || G;
  const due = new Date(season.dueAt);
  const dueLabel = `${dF(due)} ${pad(due.getHours())}:${pad(due.getMinutes())}`;
  const dDay = Math.ceil((midnight(due).getTime() - midnight(Date.now()).getTime()) / DAY);
  const tabs = adminMode
    ? ([["room", "팀 룸", "ROOM"], ["board", "일정 계획판", "PLAN"], ["match", "스크림 매칭", "MATCH"], ["cfg", "통합 시간", "TIME"]] as const)
    : ([["room", "팀 룸", "ROOM"], ["board", "일정 계획판", "PLAN"]] as const);

  /* ── 조각 ── */
  const Emblem = ({ tag, color, size: sz = 46 }: { tag: string; color: string; size?: number }) => (
    <span className="esp-cut-sm grid place-items-center shrink-0 font-black tracking-tight"
      style={{ width: sz, height: sz, background: `${color}1c`, border: `1px solid ${color}55`, color, fontSize: sz * 0.3 }}>
      {tag || "TM"}
    </span>
  );
  const Bar = ({ k, right }: { k: string; right?: React.ReactNode }) => (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>{k}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
      {right}
    </div>
  );
  const cell = "w-[38px] h-[30px] lg:w-[46px] lg:h-[34px] border text-[11px] font-black tabular-nums transition-transform active:scale-[.92]";

  const Grid = ({ readOnly, value }: { readOnly?: boolean; value: (d: Date, s: number) => { n: number; cap: number; me?: boolean; full?: boolean } }) => (
    <div className="overflow-x-auto -mx-1 px-1">
      <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
        <thead>
          <tr>
            <th className="w-px" />
            {SLOTS.map((s) => <th key={s} className="pb-1 text-[9px] font-black esp-mono text-gray-600">{sL(s)}</th>)}
          </tr>
        </thead>
        <tbody>
          {DAYS.map((d) => (
            <tr key={d.getTime()}>
              <th onClick={readOnly ? undefined : () => toggleDay(d)} tabIndex={readOnly ? -1 : 0}
                onKeyDown={(e) => { if (!readOnly && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleDay(d); } }}
                className={`text-left pr-2 whitespace-nowrap ${readOnly ? "" : "cursor-pointer group"}`}>
                <span className="block text-[11px] font-black tabular-nums text-gray-300 group-hover:text-white">{dL(d)}</span>
                <span className={`block text-[9px] font-black ${d.getDay() === 6 ? "text-sky-400/70" : d.getDay() === 0 ? "text-rose-400/70" : "text-gray-600"}`}>{WD[d.getDay()]}</span>
              </th>
              {SLOTS.map((s) => {
                const v = value(d, s);
                const a = v.cap ? v.n / v.cap : 0;
                return (
                  <td key={s} className="p-0">
                    {readOnly ? (
                      <span className={`${cell} grid place-items-center active:scale-100`}
                        style={{ background: v.n ? `${C}${Math.round((0.12 + a * 0.55) * 255).toString(16).padStart(2, "0")}` : "rgba(255,255,255,.02)",
                          borderColor: v.full ? G : "rgba(255,255,255,.07)", boxShadow: v.full ? `inset 0 0 0 1px ${G}` : undefined,
                          color: v.n ? "#e6f7ee" : "#3f3f46" }}>{v.n || ""}</span>
                    ) : (
                      <button type="button" onClick={() => toggle(d, s)} aria-pressed={!!v.me}
                        aria-label={`${dF(d)} ${sF(s)} · ${v.n}명 가능${v.me ? " · 내가 선택함" : ""}`}
                        className={cell}
                        style={{ background: v.n ? `${C}${Math.round((0.12 + a * 0.55) * 255).toString(16).padStart(2, "0")}` : "rgba(255,255,255,.02)",
                          borderColor: v.me ? "#fff" : v.full ? G : "rgba(255,255,255,.07)",
                          boxShadow: v.me ? "inset 0 0 0 1px #fff" : v.full ? `inset 0 0 0 1px ${G}` : undefined,
                          color: v.n ? "#e6f7ee" : "#3f3f46" }}>{v.n || ""}</button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <main className="flex-1 w-full flex flex-col relative">
      <EsportsStyles />

      {/* ══ HERO — 좌: 팀 명패 / 우: HUD 지표 (세로로 쌓지 않는다) ══ */}
      <section className="relative w-full px-5 md:px-8 pt-10 pb-0 overflow-hidden">
        <div className="absolute inset-0 esp-mesh pointer-events-none" />
        <div className="absolute inset-0 esp-scan pointer-events-none opacity-30" />
        <p className="absolute -top-3 right-6 hidden xl:block text-[104px] font-black tracking-tighter leading-none pointer-events-none select-none text-transparent"
          style={{ WebkitTextStroke: `1px ${C}1f` }}>{team.tag || "TEAM"}</p>

        <div className="max-w-[1240px] mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 esp-blink" style={{ background: G, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>{season.title}</span>
            <span className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            {isAdmin && (
              <button onClick={() => { const v = !adminMode; setAdminMode(v); if (!v && (view === "match" || view === "cfg")) setView("room"); }}
                aria-pressed={adminMode}
                className="esp-cut-sm flex items-center gap-2 px-3 py-2 text-[10px] font-black transition-colors"
                style={adminMode ? { background: G, color: "#04120b" } : { background: "rgba(255,255,255,.05)", color: "#8b8b93" }}>
                <span className="relative w-6 h-3.5" style={{ background: adminMode ? "rgba(4,18,11,.35)" : "rgba(255,255,255,.16)" }}>
                  <span className="absolute top-0.5 w-2.5 h-2.5 bg-white transition-[left] duration-200" style={{ left: adminMode ? 13 : 2 }} />
                </span>
                운영 화면
              </button>
            )}
          </div>

          <div className="flex flex-col xl:flex-row xl:items-end gap-7 xl:gap-10">
            {/* 팀 명패 */}
            <div className="flex items-center gap-4 min-w-0 xl:w-[380px] shrink-0">
              <Emblem tag={team.tag} color={C} size={58} />
              <div className="min-w-0">
                <h1 className="text-[30px] md:text-[38px] font-black tracking-tighter leading-none truncate">{team.name}</h1>
                <p className="mt-2 text-[11px] font-bold text-gray-500">
                  {team.members.length}인 로스터
                  {inTeam && <span style={{ color: C }}> · 내 팀</span>}
                </p>
              </div>
            </div>

            {/* HUD 지표 — 대회 페이지와 같은 헤어라인 그리드 */}
            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 border-t" style={{ borderColor: `${G}33` }}>
              {[
                { k: "RECORD", l: "전적", v: `${team.wins}-${team.losses}`, c: "text-white" },
                { k: "PLAN", l: "일정 제출", v: `${doneCount}/${size}`, c: usReady ? "text-[#00e07b]" : "text-amber-300" },
                { k: "NEXT", l: "다음 경기", v: upcoming[0] ? dL(new Date(upcoming[0].at)) : "—", c: "text-white" },
                { k: "DUE", l: "응답 마감", v: dDay >= 0 ? `D-${dDay}` : "마감", c: dDay <= 1 ? "text-[#ff6b83]" : "text-gray-300" },
              ].map((m, i) => (
                <div key={m.k} className={`py-3.5 md:px-5 ${i > 0 ? "md:border-l border-white/[0.07]" : ""} ${i % 2 === 1 ? "border-l border-white/[0.07] pl-4 md:pl-5" : ""} ${i < 2 ? "border-b md:border-b-0 border-white/[0.07]" : ""}`}>
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">{m.k}</p>
                  <p className="flex items-baseline gap-1.5">
                    <span className={`text-2xl md:text-[28px] font-black tabular-nums ${m.c}`}>{m.v}</span>
                    <span className="text-[10px] font-bold text-gray-600">{m.l}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 탭 ══ */}
      <div className="w-full px-5 md:px-8 bg-[#090909]/90 backdrop-blur-xl border-b border-white/[0.07] mt-7 sticky top-0 z-20">
        <div className="max-w-[1240px] mx-auto flex gap-1 overflow-x-auto whitespace-nowrap py-2.5">
          {tabs.map(([k, label, code]) => {
            const on = view === k;
            return (
              <button key={k} onClick={() => setView(k as any)}
                className={`esp-cut-sm px-4 md:px-5 py-2.5 text-xs font-black shrink-0 flex items-center gap-2 transition-all ${on ? "text-[#04120b]" : "bg-white/[0.03] text-gray-500 hover:text-white hover:bg-white/[0.07]"}`}
                style={on ? { background: G } : undefined}>
                <span className={`text-[9px] esp-mono ${on ? "text-[#04120b]/60" : "text-gray-700"}`}>{code}</span>
                {label}
              </button>
            );
          })}
          <button onClick={() => router.push("/tournament")}
            className="ml-auto esp-cut-sm px-4 py-2.5 text-xs font-black shrink-0 bg-white/[0.03] text-gray-600 hover:text-white transition-colors">← 대회</button>
        </div>
      </div>

      <div className="w-full px-5 md:px-8 py-8">
        <div className="max-w-[1240px] mx-auto">

          {/* ══ 팀 룸 — 좌우 2단 대시보드 ══ */}
          {view === "room" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] items-start">
              {/* 좌 */}
              <div className="space-y-7 min-w-0">
                <section>
                  <Bar k="Next Match" right={<span className="text-[10px] font-black esp-mono text-gray-600">{upcoming.length}건 예정</span>} />
                  {upcoming.length === 0 ? (
                    <div className="esp-cut border border-white/[0.08] bg-white/[0.02] px-6 py-10 text-center">
                      <p className="text-[13px] font-black text-gray-400">예정된 스크림이 없습니다</p>
                      <p className="mt-2 text-[11px] text-gray-600">팀 일정이 모이면 운영진이 상대 팀과 맞춰줍니다</p>
                      {!meSubmitted && (
                        <button onClick={() => setView("board")} className="mt-5 esp-cut-sm px-5 py-3 text-[11px] font-black" style={{ background: G, color: "#04120b" }}>
                          내 일정 내러 가기
                        </button>
                      )}
                    </div>
                  ) : upcoming.map((f) => {
                    const opp = teamById(f.teamAId === id ? f.teamBId : f.teamAId);
                    const at = new Date(f.at);
                    return (
                      <div key={f._id} className="esp-cut border border-white/[0.08] bg-white/[0.02] mb-2.5">
                        <div className="px-5 py-2.5 flex items-center gap-2 border-b border-white/[0.07]">
                          <span className="w-1.5 h-1.5" style={{ background: G }} />
                          <span className="text-[10px] font-black esp-mono text-gray-400">{dF(at)} {pad(at.getHours())}:{pad(at.getMinutes())}</span>
                          <span className="ml-auto text-[9px] font-black esp-mono" style={{ color: G }}>CONFIRMED</span>
                        </div>
                        {/* 가로 배치 — 좌 팀 · 중앙 VS · 우 팀 */}
                        <div className="px-5 py-6 flex items-center gap-4">
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                            <Emblem tag={team.tag} color={C} size={42} />
                            <span className="text-[13px] font-black truncate">{team.name}</span>
                          </div>
                          <span className="text-[13px] font-black esp-mono text-gray-700 shrink-0">VS</span>
                          <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                            <span className="text-[13px] font-black truncate text-right">{opp?.name || "?"}</span>
                            <Emblem tag={opp?.tag || "?"} color={opp?.color || "#888"} size={42} />
                          </div>
                        </div>
                        {isAdmin && adminMode && (
                          <div className="flex border-t border-white/[0.07]">
                            {[["우리 승", id], ["상대 승", f.teamAId === id ? f.teamBId : f.teamAId], ["무승부", "draw"]].map(([l, w]) => (
                              <button key={l as string} disabled={busy}
                                onClick={async () => { const r = await post({ action: "fixture:result", fixtureId: f._id, winnerId: w }); if (r) setToast(`결과를 기록했습니다 — ${l}`); }}
                                className="flex-1 py-3 text-[11px] font-black text-gray-400 border-l border-white/[0.07] first:border-l-0 hover:bg-white/[0.05] hover:text-white transition-colors disabled:opacity-40">{l as string}</button>
                            ))}
                            <button disabled={busy} onClick={async () => { const r = await post({ action: "fixture:delete", fixtureId: f._id }); if (r) setToast("경기를 취소했습니다"); }}
                              className="px-4 py-3 text-[11px] font-black text-rose-400/80 border-l border-white/[0.07] hover:bg-rose-500/10 transition-colors disabled:opacity-40">취소</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>

                <section>
                  <Bar k="Results" right={<span className="text-[10px] font-black esp-mono text-gray-600">{team.wins}승 {team.losses}패</span>} />
                  {played.length === 0
                    ? <p className="py-6 text-[11px] font-bold text-gray-700">아직 치른 경기가 없습니다.</p>
                    : played.map((f) => {
                      const opp = teamById(f.teamAId === id ? f.teamBId : f.teamAId);
                      const at = new Date(f.at);
                      const win = f.winnerId === id;
                      return (
                        <div key={f._id} className="flex items-center gap-3 py-3 border-b border-white/[0.06]">
                          <span className="w-[92px] shrink-0 text-[11px] font-bold esp-mono text-gray-500">{dF(at)}</span>
                          <Emblem tag={opp?.tag || "?"} color={opp?.color || "#888"} size={26} />
                          <span className="flex-1 min-w-0 text-[12px] font-black text-gray-300 truncate">vs {opp?.name || "?"}</span>
                          <span className={`shrink-0 esp-cut-sm px-2.5 py-1 text-[10px] font-black ${f.winnerId === "draw" ? "bg-white/[0.07] text-gray-400" : win ? "text-[#04120b]" : "bg-rose-500/15 text-rose-300"}`}
                            style={f.winnerId !== "draw" && win ? { background: G } : undefined}>
                            {f.winnerId === "draw" ? "무" : win ? "승" : "패"}
                          </span>
                        </div>
                      );
                    })}
                </section>
              </div>

              {/* 우 — 붙박이 사이드 */}
              <aside className="space-y-6 xl:sticky xl:top-20">
                <section>
                  <Bar k="Schedule" />
                  <button onClick={() => setView("board")} className="w-full text-left esp-cut border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors p-5">
                    <p className="text-[13px] font-black">일정 계획판</p>
                    <p className="mt-2 text-[11px] font-bold text-gray-500 leading-relaxed">
                      {meSubmitted
                        ? usReady
                          ? <>전원 제출 완료 — 가장 많이 겹치는 시간 <b className="text-white tabular-nums">{usTop?.n ? `${dF(usTop.d)} ${sF(usTop.s)}` : "—"}</b></>
                          : <>내 일정은 냈습니다 · <b className="text-amber-300">{size - doneCount}명</b> 남음</>
                        : <>아직 내 일정을 내지 않았습니다 · 마감 <b className="tabular-nums text-gray-300">{dueLabel}</b></>}
                    </p>
                    <div className="mt-4 h-1.5 bg-white/[0.06]">
                      <span className="block h-full transition-[width] duration-500" style={{ width: `${size ? (doneCount / size) * 100 : 0}%`, background: G }} />
                    </div>
                  </button>
                </section>

                <section>
                  <Bar k="Roster" right={<span className="text-[10px] font-black esp-mono text-gray-600">{size}</span>} />
                  <div className="divide-y divide-white/[0.06]">
                    {team.members.map((m, i) => {
                      const ok = !!m.discordId && submitted.has(m.discordId);
                      return (
                        <div key={i} className="flex items-center gap-3 py-2.5">
                          <span className="esp-cut-sm w-8 h-8 grid place-items-center text-[11px] font-black shrink-0"
                            style={{ background: `${C}18`, color: C, border: `1px solid ${C}44` }}>{m.name.slice(0, 1)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[12px] font-black truncate">
                              {m.name}{m.leader && <span className="ml-1.5 text-[9px] font-black esp-mono" style={{ color: C }}>LEADER</span>}
                            </span>
                            <span className="block text-[10px] font-bold text-gray-600 mt-0.5">{m.pos || "포지션 미정"}</span>
                          </span>
                          <span className={`shrink-0 text-[9px] font-black esp-mono ${ok ? "" : "text-gray-700"}`} style={ok ? { color: G } : undefined}>{ok ? "SENT" : "WAIT"}</span>
                          {isAdmin && adminMode && ok && (
                            <button disabled={busy} onClick={async () => { const r = await post({ action: "avail:reset", teamId: id, userId: m.discordId }); if (r) setToast(`${m.name} 응답을 초기화했습니다`); }}
                              className="shrink-0 text-[9px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">초기화</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </aside>
            </div>
          )}

          {/* ══ 일정 계획판 ══ */}
          {view === "board" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
              <div className="min-w-0">
                <Bar k="My Availability" right={<span className="text-[10px] font-black esp-mono text-gray-600">{doneCount}/{size} 제출</span>} />
                <p className="text-[12px] font-bold text-gray-300 mb-4">
                  가능한 시간을 눌러주세요. <span className="font-medium text-gray-600">다시 누르면 해제됩니다. 날짜를 누르면 하루 전체가 켜집니다.</span>
                </p>
                <Grid value={(d, s) => ({ n: usAt(d, s), cap: size || 1, me: mine.has(sKey(d, s)), full: usAt(d, s) === size && size > 0 })} />

                <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center gap-4">
                  <span className="flex-1 text-[11px] font-bold text-gray-500">
                    {mine.size ? <><b className="text-white tabular-nums">{mine.size}칸</b> 선택함{dirty && <span className="text-amber-300"> · 저장 안 됨</span>}</> : "가능한 시간을 표시해주세요"}
                  </span>
                  <button disabled={busy || mine.size === 0 || (!inTeam && !isAdmin)}
                    onClick={async () => { const r = await post({ action: "avail:submit", teamId: id, slots: [...mine] }); if (r) { setDirty(false); setToast(meSubmitted ? "일정을 다시 제출했습니다" : "제출했습니다"); } }}
                    className="shrink-0 esp-cut-sm px-7 py-3 text-[12px] font-black transition-all active:scale-[.97] disabled:opacity-35"
                    style={{ background: G, color: "#04120b" }}>
                    {meSubmitted ? "다시 제출" : "제출"}
                  </button>
                </div>
              </div>

              <aside className="xl:sticky xl:top-20">
                <Bar k="Best Slot" />
                <div className="esp-cut border p-5" style={{ borderColor: `${G}3d`, background: `${G}0f` }}>
                  <p className="text-[18px] font-black tracking-tight tabular-nums">{usTop?.n ? `${dF(usTop.d)} ${sF(usTop.s)}` : "—"}</p>
                  <p className="mt-2 text-[11px] font-bold text-gray-400">
                    {usTop?.n ? (() => {
                      const miss = team.members.filter((m) => m.discordId && submitted.has(m.discordId) && !(m.discordId === data?.me ? mine.has(sKey(usTop.d, usTop.s)) : team.avail.find((a) => a.userId === m.discordId)?.slots.includes(sKey(usTop.d, usTop.s)))).map((m) => m.name);
                      return <><b className="text-white">{usTop.n}/{size}명</b> 가능{miss.length ? ` · 빠지는 사람 ${miss.join(", ")}` : ""}</>;
                    })() : "아직 겹치는 시간이 없습니다"}
                  </p>
                </div>
                <div className="mt-3">
                  {usRanked.slice(1, 6).map((x, i) => (
                    <div key={i} className="flex items-baseline gap-2.5 py-2.5 border-b border-white/[0.06] text-[12px]">
                      <b className="font-black tabular-nums">{dF(x.d)} {sF(x.s)}</b>
                      <span className="ml-auto text-[11px] font-black esp-mono text-gray-600">{x.n}/{size}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {/* ══ 스크림 매칭 (운영) ══ */}
          {view === "match" && isAdmin && adminMode && (
            <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] items-start">
              <aside className="xl:sticky xl:top-20">
                <Bar k="Opponents" />
                <div className="space-y-2">
                  {oppTeams.length === 0 && <p className="text-[11px] font-bold text-gray-700 py-4">등록된 다른 팀이 없습니다.</p>}
                  {oppTeams.map((t) => {
                    const ready = oppReady(t);
                    const on = pick === t._id;
                    const cnt = t.members.filter((m) => m.discordId && t.avail.some((a) => a.userId === m.discordId)).length;
                    return (
                      <button key={t._id} disabled={!ready} onClick={() => setPick(on ? null : t._id)} aria-pressed={on}
                        className={`esp-cut-sm w-full flex items-center gap-3 p-3 text-left border transition-colors ${!ready ? "opacity-40 cursor-not-allowed" : "hover:bg-white/[0.05]"}`}
                        style={on ? { borderColor: t.color, background: `${t.color}14` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
                        <Emblem tag={t.tag} color={t.color} size={34} />
                        <span className="min-w-0 flex-1">
                          <b className="block text-[12px] font-black truncate">{t.name}</b>
                          <span className="block text-[10px] font-black esp-mono mt-0.5" style={{ color: ready ? G : "#5c5c63" }}>
                            {ready ? "READY" : `${cnt}/${t.members.length}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!usReady && (
                  <p className="mt-4 esp-cut-sm border border-dashed border-white/10 p-3.5 text-[11px] font-bold text-gray-500 leading-relaxed">
                    우리 팀이 <b className="text-amber-300">{size - doneCount}명</b> 미제출입니다. 전원이 내야 매칭할 수 있습니다.
                  </p>
                )}
              </aside>

              <div className="min-w-0">
                {pick && usReady ? (() => {
                  const t = oppTeams.find((x) => x._id === pick)!;
                  const cap = Math.min(size, t.members.length);
                  return (
                    <>
                      <Bar k="Overlap" right={<span className="text-[10px] font-black esp-mono text-gray-600">우리 {size} · {t.name} {t.members.length}</span>} />
                      <p className="text-[11px] font-bold text-gray-600 mb-4">숫자는 <b className="text-gray-300">더 적은 쪽 팀</b>의 가능 인원입니다. 양 팀 전원 가능한 칸에 초록 테두리가 붙습니다.</p>
                      <Grid readOnly value={(d, s) => {
                        const us = usAt(d, s), them = themAt(t, d, s);
                        return { n: Math.min(us, them), cap, full: us === size && them === t.members.length && Math.min(us, them) > 0 };
                      }} />

                      <div className="esp-cut border border-white/[0.08] bg-white/[0.02] mt-6">
                        <div className="px-5 py-2.5 border-b border-white/[0.07] flex items-center gap-2">
                          <span className="text-[10px] font-black esp-mono text-gray-500">RECOMMENDED</span>
                          <span className="ml-auto text-[12px] font-black tabular-nums" style={{ color: G }}>
                            {mTop?.min ? `${dF(mTop.d)} ${sF(mTop.s)}` : "겹치는 시간 없음"}
                          </span>
                        </div>
                        <div className="px-5 py-5 flex items-center gap-4">
                          <div className="flex-1 flex items-center gap-3 min-w-0">
                            <Emblem tag={team.tag} color={C} size={38} />
                            <span className="min-w-0">
                              <span className="block text-[12px] font-black truncate">{team.name}</span>
                              <span className="block text-[10px] font-black esp-mono text-gray-600">{mTop ? `${mTop.us}/${size}` : "—"}</span>
                            </span>
                          </div>
                          <span className="text-[13px] font-black esp-mono text-gray-700">VS</span>
                          <div className="flex-1 flex items-center justify-end gap-3 min-w-0">
                            <span className="min-w-0 text-right">
                              <span className="block text-[12px] font-black truncate">{t.name}</span>
                              <span className="block text-[10px] font-black esp-mono text-gray-600">{mTop ? `${mTop.them}/${t.members.length}` : "—"}</span>
                            </span>
                            <Emblem tag={t.tag} color={t.color} size={38} />
                          </div>
                        </div>
                        <button disabled={busy || !mTop?.min}
                          onClick={async () => {
                            if (!mTop?.min) return;
                            const at = new Date(mTop.d); at.setHours(Math.floor(mTop.s / 60), mTop.s % 60, 0, 0);
                            const r = await post({ action: "fixture:create", teamAId: id, teamBId: t._id, at: at.toISOString(), usCount: mTop.us, themCount: mTop.them });
                            if (r) setToast(`${dF(mTop.d)} ${sF(mTop.s)} · ${t.name} 전 확정`);
                          }}
                          className="w-full py-3.5 text-[12px] font-black border-t border-white/[0.07] transition-colors disabled:opacity-35"
                          style={{ background: G, color: "#04120b" }}>
                          이 시각으로 스크림 확정
                        </button>
                      </div>
                    </>
                  );
                })() : (
                  <div className="esp-cut border border-dashed border-white/10 px-6 py-16 text-center">
                    <p className="text-[12px] font-bold text-gray-500">왼쪽에서 상대 팀을 고르면 겹치는 시간이 나옵니다</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ 통합 시간 (운영) ══ */}
          {view === "cfg" && isAdmin && adminMode && (
            <SeasonForm season={season} busy={busy} onSave={async (p) => { const r = await post({ action: "season:update", ...p }); if (r) setToast("통합 시간을 바꿨습니다 — 모든 팀에 적용됩니다"); }} />
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed left-4 right-4 bottom-6 lg:left-auto lg:right-8 z-[60] max-w-[400px] mx-auto lg:mx-0 esp-cut-sm flex items-center gap-3 min-h-[46px] px-5 py-3 border border-white/10 bg-[#0d0f0e]/96 backdrop-blur-xl text-[12px] font-bold text-gray-200">
          <span className="w-1.5 h-1.5 shrink-0" style={{ background: G }} />
          {toast}
        </div>
      )}
    </main>
  );
}

/* ── 통합 시간 조정 — 전 팀 공통. 네이티브 select/date 는 쓰지 않는다 ── */
function SeasonForm({ season, busy, onSave }: { season: Season; busy: boolean; onSave: (p: any) => void }) {
  const G2 = "#00e07b";
  const [start, setStart] = useState(() => midnight(season.startAt));
  const [days, setDays] = useState(season.days);
  const [from, setFrom] = useState(season.fromHour);
  const [to, setTo] = useState(season.toHour);
  const [step, setStep] = useState(season.stepMin);
  const [dueDay, setDueDay] = useState(() => midnight(season.dueAt));
  const [dueMin, setDueMin] = useState(() => { const d = new Date(season.dueAt); return d.getHours() * 60 + d.getMinutes(); });

  const end = (() => { const e = new Date(start); e.setDate(e.getDate() + days - 1); return e; })();
  const cells = days * Math.max(0, Math.ceil(((to - from) * 60) / step));

  const Step = ({ label, value, sub, minus, plus, mOff, pOff }: any) => (
    <div>
      <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">{label}</span>
      <div className="esp-cut-sm inline-flex items-stretch border border-white/10 bg-white/[0.03]">
        <button type="button" onClick={minus} disabled={mOff} className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent transition-colors">−</button>
        <span className="min-w-[92px] px-2 py-2.5 text-center border-x border-white/10">
          <span className="block text-[13px] font-black tabular-nums">{value}</span>
          {sub && <span className="block text-[9px] font-bold text-gray-600 mt-0.5">{sub}</span>}
        </span>
        <button type="button" onClick={plus} disabled={pOff} className="w-9 text-[16px] font-black text-gray-400 hover:bg-white/[0.06] hover:text-white disabled:text-gray-700 disabled:hover:bg-transparent transition-colors">+</button>
      </div>
    </div>
  );
  const Strip = ({ sel, onPick }: { sel: Date; onPick: (d: Date) => void }) => (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
      {Array.from({ length: 21 }, (_, i) => {
        const d = midnight(Date.now() + DAY * i);
        const on = d.getTime() === sel.getTime();
        return (
          <button key={i} type="button" onClick={() => onPick(d)} aria-pressed={on}
            className="esp-cut-sm shrink-0 min-w-[52px] px-1 py-2 border text-center transition-colors"
            style={on ? { borderColor: G2, background: `${G2}1a` } : { borderColor: "rgba(255,255,255,.08)", background: "rgba(255,255,255,.02)" }}>
            <span className="block text-[12px] font-black tabular-nums" style={{ color: on ? G2 : "#cbd5e1" }}>{dL(d)}</span>
            <span className="block text-[9px] font-black esp-mono text-gray-600 mt-0.5">{i === 0 ? "TODAY" : WD[d.getDay()]}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Period</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">시작 날짜</span>
          <Strip sel={start} onPick={setStart} />
          <div className="flex flex-wrap gap-4 mt-4">
            <Step label="기간" value={`${days}일`} sub={`~ ${dF(end)}`} minus={() => setDays((v) => Math.max(1, v - 1))} plus={() => setDays((v) => Math.min(21, v + 1))} mOff={days <= 1} pOff={days >= 21} />
            <div>
              <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">단위</span>
              <div className="esp-cut-sm inline-flex border border-white/10 bg-white/[0.03]">
                {[60, 30].map((v) => (
                  <button key={v} onClick={() => setStep(v)} aria-pressed={step === v}
                    className="px-4 py-2.5 text-[12px] font-black border-l border-white/10 first:border-l-0 transition-colors"
                    style={step === v ? { background: `${G2}1f`, color: G2 } : { color: "#8b8b93" }}>{v === 60 ? "1시간" : "30분"}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Hours</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <div className="flex flex-wrap gap-4">
            <Step label="시작 시각" value={hourLabel(from)} minus={() => setFrom((v) => Math.max(0, v - 1))} plus={() => setFrom((v) => Math.min(to - 1, v + 1))} mOff={from <= 0} pOff={from >= to - 1} />
            <Step label="종료 시각" value={hourLabel(to)} sub={to > 24 ? "익일" : undefined} minus={() => setTo((v) => Math.max(from + 1, v - 1))} plus={() => setTo((v) => Math.min(30, v + 1))} mOff={to <= from + 1} pOff={to >= 30} />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Deadline</span>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
          </div>
          <Strip sel={dueDay} onPick={setDueDay} />
          <div className="mt-4">
            <Step label="마감 시각" value={`${pad(Math.floor(dueMin / 60))}:${pad(dueMin % 60)}`}
              minus={() => setDueMin((v) => (v + 1440 - 30) % 1440)} plus={() => setDueMin((v) => (v + 30) % 1440)} />
          </div>
        </div>
      </div>

      <aside className="xl:sticky xl:top-20">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G2 }}>Summary</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
        </div>
        <div className="esp-cut border border-white/[0.08] bg-white/[0.02] p-5 text-[12px] font-bold text-gray-400 leading-relaxed">
          <b className="text-white tabular-nums">{dF(start)}</b> 부터 <b className="text-white tabular-nums">{days}일</b>간<br />
          매일 <b className="text-white">{hourLabel(from)}~{hourLabel(to)}</b> · <b className="text-white">{step === 60 ? "1시간" : "30분"}</b> 단위<br />
          한 사람이 볼 칸 <b className="text-white tabular-nums">{cells}칸</b>
          {cells > 90 && <span className="text-amber-300"> — 많으면 응답률이 떨어집니다</span>}
        </div>
        <p className="mt-3 text-[11px] font-bold text-gray-600 leading-relaxed">
          이 설정은 <b className="text-gray-300">모든 팀에 함께</b> 적용됩니다. 팀마다 다르면 팀 간 겹치는 시간을 계산할 수 없습니다.
        </p>
        <button disabled={busy}
          onClick={() => {
            const due = new Date(dueDay); due.setHours(Math.floor(dueMin / 60), dueMin % 60, 0, 0);
            onSave({ startAt: start.toISOString(), days, fromHour: from, toHour: to, stepMin: step, dueAt: due.toISOString() });
          }}
          className="w-full mt-4 esp-cut-sm py-3.5 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-40"
          style={{ background: G2, color: "#04120b" }}>
          전체 팀에 적용
        </button>
        <p className="mt-3 text-[10px] font-bold text-rose-400/70 leading-relaxed">
          기간이나 시간대를 줄이면 그 바깥의 기존 응답은 계산에서 빠집니다.
        </p>
      </aside>
    </div>
  );
}
