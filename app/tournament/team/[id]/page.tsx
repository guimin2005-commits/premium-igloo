"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { EsportsStyles } from "../../../components/Esports";
import { parseBracketSections } from "../../../components/BracketView";
import DmPreview from "../../../components/DmPreview";

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
const hourLabel = (h: number) => `${pad(h % 24)}:00`;
const midnight = (d: Date | number | string) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

type Member = { discordId: string; name: string; pos: string; leader?: boolean };
type Team = { _id: string; name: string; tag: string; color: string; wins: number; losses: number; intro?: string; members: Member[]; avail: { userId: string; userName: string; slots: string[] }[] };
type Season = { _id: string; title: string; tournamentId?: string; notice?: string; startAt: string; days: number; fromHour: number; toHour: number; stepMin: number; dueAt: string };
type Fixture = { _id: string; teamAId: string; teamBId: string; kind?: string; at: string; winnerId: string; scoreA: number; scoreB: number };
type Notice = { _id: string; title: string; body: string; pinned: boolean; important: boolean; publishAt: string };

const sL = (m: number) => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${pad(h)}:${pad(mm)}`; };
const sF = (m: number) => { const h = Math.floor(m / 60), hh = h % 24, mm = m % 60; return `${pad(hh)}:${pad(mm)}`; };

/* ⚠️ 아래 조각들은 반드시 컴포넌트 바깥에 둔다.
   컴포넌트 함수 안에서 정의하면 렌더할 때마다 새로운 컴포넌트 종류가 되어
   React 가 표를 통째로 버리고 다시 만든다. 칸 하나만 눌러도 격자가 리마운트되면서
   자리가 튀어 보인다. */

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

/* 칸은 grid 로 잡는다. button 을 기본값(inline-block)으로 두면 글자 기준선 아래에
   5px 쯤 빈 자리가 생겨 줄 높이가 칸 높이보다 커지고 간격이 어긋나 보인다. */
const cell = "grid place-items-center w-[44px] h-[34px] lg:w-[54px] lg:h-[38px] border text-[11px] font-black tabular-nums select-none transition-colors";

const density = (color: string, a: number) => `${color}${Math.round((0.12 + a * 0.55) * 255).toString(16).padStart(2, "0")}`;

type CellValue = { n: number; cap: number; me?: boolean; full?: boolean };

const Grid = ({ slots, days, color, isPast, value, readOnly, onToggle, onToggleDay, onPaint, canDrag, dragRef }: {
  slots: number[];
  days: Date[];
  color: string;
  isPast: (d: Date, s: number) => boolean;
  value: (d: Date, s: number) => CellValue;
  readOnly?: boolean;
  onToggle?: (d: Date, s: number) => void;
  onToggleDay?: (d: Date) => void;
  onPaint?: (d: Date, s: number, on: boolean) => void;
  canDrag?: boolean;
  dragRef?: React.MutableRefObject<null | boolean>;
}) => (
  <div className="overflow-x-auto no-bar -mx-1 px-1">
    <table style={{ borderCollapse: "separate", borderSpacing: 2 }}>
      <thead>
        <tr>
          <th className="w-px" />
          {slots.map((s) => (
            <th key={s} className="pb-1 text-[9px] font-black esp-mono text-gray-600 tabular-nums">
              <span className="hidden sm:inline">{sL(s)}</span>
              <span className="sm:hidden">{sL(s).slice(0, 2)}</span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {days.map((d) => (
          <tr key={d.getTime()}>
            <th onClick={readOnly ? undefined : () => onToggleDay?.(d)} tabIndex={readOnly ? -1 : 0}
              onKeyDown={(e) => { if (!readOnly && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggleDay?.(d); } }}
              className={`text-left pr-2 whitespace-nowrap ${readOnly ? "" : "cursor-pointer group"}`}>
              <span className="block text-[11px] font-black tabular-nums text-gray-300 group-hover:text-white">{dL(d)}</span>
              <span className={`block text-[9px] font-black ${d.getDay() === 6 ? "text-sky-400/70" : d.getDay() === 0 ? "text-rose-400/70" : "text-gray-600"}`}>{WD[d.getDay()]}</span>
            </th>
            {slots.map((s) => {
              const v = value(d, s);
              const a = v.cap ? v.n / v.cap : 0;
              const past = isPast(d, s);
              return (
                <td key={s} className="p-0 align-top">
                  {past ? (
                    // 이미 지나간 시간 — 고를 수 없다는 걸 빈칸이 아니라 ✕ 로 분명히 한다
                    <span className={`${cell} cursor-not-allowed`} title="이미 지난 시간입니다"
                      style={{ background: "rgba(255,255,255,.015)", borderColor: "rgba(255,255,255,.05)", color: "#3a3a3f" }}>✕</span>
                  ) : readOnly ? (
                    <span className={cell}
                      style={{ background: v.n ? density(color, a) : "rgba(255,255,255,.02)",
                        borderColor: v.full ? G : "rgba(255,255,255,.07)", boxShadow: v.full ? `inset 0 0 0 1px ${G}` : undefined,
                        color: v.n ? "#e6f7ee" : "#3f3f46" }}>{v.n || ""}</span>
                  ) : (
                    <button type="button" aria-pressed={!!v.me}
                      onClick={() => { if (!canDrag) onToggle?.(d, s); }}
                      onPointerDown={(e) => {
                        if (!canDrag || !dragRef) return;
                        e.preventDefault();
                        const on = !v.me;
                        dragRef.current = on;
                        onPaint?.(d, s, on);
                      }}
                      onPointerEnter={() => { if (canDrag && dragRef && dragRef.current !== null) onPaint?.(d, s, dragRef.current); }}
                      aria-label={`${dF(d)} ${sF(s)} · ${v.n}명 가능${v.me ? " · 내가 선택함" : ""}`}
                      className={cell}
                      style={{ background: v.n ? density(color, a) : "rgba(255,255,255,.02)",
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

export default function TeamRoom() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, status } = useSession();
  const signedIn = status === "authenticated";

  const [data, setData] = useState<{ me: string; isAdmin: boolean; season: Season; teams: Team[]; fixtures: Fixture[]; notices: Notice[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"room" | "board">("room");
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [none, setNone] = useState(false); // 이번 기간 전체 불가
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [tour, setTour] = useState<any>(null); // 연동된 대회 글

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/room", { cache: "no-store" });
      const d = await r.json();
      if (d?.success) setData(d);
    } catch { /* 네트워크 오류는 아래 빈 화면으로 드러난다 */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (signedIn) load(); else setLoading(status !== "unauthenticated"); }, [signedIn, status, load]);

  // 대회가 연동돼 있으면 그 글에서 현재 단계를 읽어 온다
  const tid = data?.season?.tournamentId;
  useEffect(() => {
    if (!tid) { setTour(null); return; }
    fetch(`/api/posts/${tid}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setTour(d.data); })
      .catch(() => {});
  }, [tid]);

  const team = useMemo(() => data?.teams.find((t) => t._id === id) || null, [data, id]);
  const season = data?.season;

  // 내가 이미 낸 응답을 편집 상태로 옮긴다
  useEffect(() => {
    if (!team || !data) return;
    const found = team.avail.find((a) => a.userId === data.me);
    // 예전에 골라둔 칸 중 이미 지나간 건 버린다 — 안 보이는 칸이 "N칸 선택함" 숫자만 부풀린다
    setMine(new Set((found?.slots || []).filter((k) => {
      const [ds, ms] = k.split("|");
      const t = new Date(`${ds}T00:00:00`);
      if (isNaN(t.getTime())) return true;
      t.setMinutes(Number(ms) || 0);
      return t.getTime() > Date.now();
    })));
    setNone(!!found && (found.slots?.length || 0) === 0); // 응답은 냈는데 칸이 0이면 전체 불가
    setDirty(false);
  }, [team, data]);

  // 지난 날짜는 뺀다 — 이미 지나간 칸을 고를 이유가 없고, 격자만 넓어진다
  const DAYS = useMemo(() => {
    if (!season) return [];
    const s = midnight(season.startAt);
    const today = midnight(Date.now()).getTime();
    return Array.from({ length: season.days }, (_, i) => { const d = new Date(s); d.setDate(d.getDate() + i); return d; })
      .filter((d) => d.getTime() >= today);
  }, [season]);
  // 조율 기간이 통째로 지났는지 (격자가 비면 안내를 대신 띄운다)
  const periodOver = !!season && DAYS.length === 0;
  const SLOTS = useMemo(() => {
    if (!season) return [];
    const o: number[] = [];
    for (let m = season.fromHour * 60; m < season.toHour * 60; m += season.stepMin) o.push(m);
    return o;
  }, [season]);
  /* 오늘 줄에서 이미 지나간 시간대는 고를 수 없다 — 날짜만 걸러도 오늘 오전이 남는다.
     (setMinutes 는 1440 이 넘어가면 알아서 다음 날로 넘어가므로 '익일' 슬롯도 맞는다) */
  const isPast = useCallback((d: Date, s: number) => {
    const t = new Date(d); t.setHours(0, 0, 0, 0); t.setMinutes(s);
    return t.getTime() <= Date.now();
  }, []);


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
    DAYS.forEach((d) => SLOTS.forEach((s) => { if (!isPast(d, s)) o.push({ d, s, n: usAt(d, s) }); }));
    return o.sort((a, b) => b.n - a.n);
  }, [DAYS, SLOTS, usAt, isPast]);
  const usTop = usRanked[0];


  const myFixtures = useMemo(() => (data?.fixtures || []).filter((f) => f.teamAId === id || f.teamBId === id), [data, id]);
  const upcoming = myFixtures.filter((f) => new Date(f.at).getTime() > Date.now() - 2 * 3600e3 && !f.winnerId);
  const played = myFixtures.filter((f) => f.winnerId);
  const teamById = (tid: string) => data?.teams.find((t) => t._id === tid);
  const notices: Notice[] = data?.notices || [];

  /* 대진표는 대회 글에 텍스트로 저장된다. 파서를 그대로 쓰고 우리 팀 이름이 든 경기만 뽑는다.
     이름으로 맞추므로 팀명을 바꾸면 대진표 표기도 함께 고쳐야 한다. */
  const ourPath = useMemo(() => {
    const text = tour?.tournamentBracket || "";
    if (!text || !team) return [];
    const norm = (v: string) => (v || "").trim().toLowerCase();
    const me = norm(team.name);
    const out: { section: string; round: string; opp: string; result: "win" | "lose" | "pending" }[] = [];
    try {
      parseBracketSections(text).forEach((sec: any) => {
        sec.rounds.forEach((r: any) => {
          r.matches.forEach((m: any) => {
            const a = norm(m.a), b = norm(m.b);
            if (a !== me && b !== me) return;
            const opp = a === me ? m.b : m.a;
            const w = norm(m.winner);
            out.push({
              section: sec.label || "", round: r.name || "",
              opp: (opp || "미정").trim(),
              result: !w ? "pending" : w === me ? "win" : "lose",
            });
          });
        });
      });
    } catch { /* 대진표 형식이 어긋나면 조용히 비운다 */ }
    return out;
  }, [tour, team]);

  // 아직 안 치른 대진 = 다음 공식 경기 (대진표에는 시각이 없어 일시는 미정으로 둔다)
  const nextBracket = ourPath.find((x) => x.result === "pending");
  // 대회 일정에서 오늘이 속한 단계 (없으면 다음 단계)
  const stage = (() => {
    const sch: any[] = Array.isArray(tour?.tournamentSchedule) ? tour.tournamentSchedule : [];
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const now = sch.find((x) => x.start && x.start <= today && (!x.end || x.end >= today));
    if (now) return { label: now.label, when: "진행 중" };
    const next = sch.find((x) => x.start && x.start > today);
    return next ? { label: next.label, when: "예정" } : null;
  })();

  /* ── 동작 ── */
  const post = async (payload: any) => {
    setBusy(true);
    try {
      const r = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
  // 드래그 칠하기 — 시작한 칸의 반대 상태로 끌고 간다 (한 번에 켜기/지우기)
  const dragRef = React.useRef<null | boolean>(null);
  const canDrag = typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  useEffect(() => {
    if (!canDrag) return;
    const up = () => { dragRef.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, [canDrag]);

  const paint = (d: Date, sm: number, on: boolean) => {
    const k = sKey(d, sm);
    setMine((p) => {
      if (on === p.has(k)) return p;   // 이미 그 상태면 건드리지 않는다
      const n = new Set(p);
      on ? n.add(k) : n.delete(k);
      return n;
    });
    setDirty(true);
  };

  const toggleDay = (d: Date) => {
    const live = SLOTS.filter((s) => !isPast(d, s));
    if (!live.length) return;
    const on = live.every((s) => mine.has(sKey(d, s)));
    setMine((p) => { const n = new Set(p); live.forEach((s) => (on ? n.delete(sKey(d, s)) : n.add(sKey(d, s)))); return n; });
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
  const iAmLeader = team.members.some((m) => m.discordId && m.discordId === data?.me && m.leader);
  // 아직 안 낸 사람 — 디스코드 ID 가 없으면 DM 을 보낼 수 없으니 대상에서 뺀다
  const waiting = team.members.filter((m) => m.discordId && !submitted.has(m.discordId));
  const C = team.color || G;
  const due = new Date(season.dueAt);
  const dueLabel = `${dF(due)} ${pad(due.getHours())}:${pad(due.getMinutes())}`;
  const dDay = Math.ceil((midnight(due).getTime() - midnight(Date.now()).getTime()) / DAY);
  const tabs = [["room", "팀 룸", "ROOM"], ["board", "스크림 캘린더", "CALENDAR"]] as const;

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
            {season.tournamentId && (
              <button onClick={() => router.push("/tournament")} className="text-[10px] font-black esp-mono text-gray-600 hover:text-white transition-colors">대회 보기 →</button>
            )}
            <span className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            {isAdmin && (
              <button onClick={() => router.push("/admin/room")}
                className="esp-cut-sm px-3 py-2 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
                운영 콘솔 →
              </button>
            )}
          </div>

          <div className="flex flex-col xl:flex-row xl:items-end gap-7 xl:gap-10">
            {/* 팀 명패 */}
            <div className="flex items-center gap-4 min-w-0 xl:w-[380px] shrink-0">
              <Emblem tag={team.tag} color={C} size={58} />
              <div className="min-w-0">
                <h1 className="text-[30px] md:text-[38px] font-black tracking-tighter leading-none truncate">{team.name}</h1>
                {team.intro && <p className="mt-2 text-[12px] font-medium text-gray-400 break-keep leading-relaxed max-w-[420px]">{team.intro}</p>}
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
                { k: "STAGE", l: stage ? stage.when : "대회 단계", v: stage ? stage.label : "—", c: stage?.when === "진행 중" ? "text-[#00e07b]" : "text-white" },
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

      {/* 운영 공지 — 관리자가 룸 설정에서 적어두면 여기에 한 줄로 뜬다 */}
      {season.notice && (
        <div className="w-full px-5 md:px-8 mt-6">
          <div className="max-w-[1240px] mx-auto esp-cut-sm flex items-center gap-3 px-4 py-3 border"
            style={{ borderColor: `${G}3d`, background: `${G}0d` }}>
            <span className="w-1.5 h-1.5 shrink-0 esp-blink" style={{ background: G }} />
            <span className="text-[9px] font-black esp-mono shrink-0" style={{ color: G }}>NOTICE</span>
            <span className="min-w-0 text-[12px] font-bold text-gray-200 break-keep">{season.notice}</span>
          </div>
        </div>
      )}

      {/* ══ 탭 ══ */}
      <div className="w-full px-5 md:px-8 bg-[#090909]/90 backdrop-blur-xl border-b border-white/[0.07] mt-7 sticky top-0 z-20">
        <div className="max-w-[1240px] mx-auto flex gap-1 overflow-x-auto whitespace-nowrap no-bar py-2.5">
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
                      {nextBracket ? (
                        <>
                          <span className="esp-cut-sm inline-block px-2 py-0.5 text-[9px] font-black mb-3" style={{ background: G, color: "#04120b" }}>공식전</span>
                          <p className="text-[15px] font-black text-white">{nextBracket.round} · vs {nextBracket.opp}</p>
                          <p className="mt-2 text-[11px] font-bold text-gray-600">대진표에 잡힌 경기입니다 — 일시는 운영진이 정합니다</p>
                        </>
                      ) : (
                        <p className="text-[13px] font-black text-gray-400">예정된 경기가 없습니다</p>
                      )}
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
                          <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black"
                            style={f.kind === "official" ? { background: G, color: "#04120b" } : { background: "rgba(255,255,255,.08)", color: "#9ca3af" }}>
                            {f.kind === "official" ? "공식전" : "스크림"}
                          </span>
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
                        {isAdmin && (
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

                {/* 우리 대진 — 대회 대진표에서 우리 팀이 낀 경기만 추려 보여준다 */}
                {ourPath.length > 0 && (
                  <section>
                    <Bar k="Our Bracket" right={
                      <button onClick={() => router.push("/tournament")} className="text-[10px] font-black esp-mono text-gray-600 hover:text-white transition-colors">전체 대진 →</button>
                    } />
                    <div className="divide-y divide-white/[0.06]">
                      {ourPath.map((m, i) => (
                        <div key={i} className="flex items-center gap-3 py-3">
                          <span className="shrink-0 w-[92px] min-w-0">
                            <span className="block text-[11px] font-black text-gray-300 truncate">{m.round || "라운드"}</span>
                            {m.section && <span className="block text-[9px] font-black esp-mono text-gray-700 truncate mt-0.5">{m.section}</span>}
                          </span>
                          <span className="flex-1 min-w-0 text-[12px] font-black text-gray-300 truncate">vs {m.opp}</span>
                          <span className="shrink-0 esp-cut-sm px-2.5 py-1 text-[10px] font-black"
                            style={m.result === "win" ? { background: G, color: "#04120b" }
                              : m.result === "lose" ? { background: "rgba(251,113,133,.18)", color: "#fda4af" }
                              : { background: "rgba(255,255,255,.06)", color: "#8b8b93" }}>
                            {m.result === "win" ? "승" : m.result === "lose" ? "패" : "예정"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
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
                          <span className="flex-1 min-w-0 text-[12px] font-black text-gray-300 truncate">
                            vs {opp?.name || "?"}
                            <span className="ml-2 text-[9px] font-black esp-mono text-gray-700">{f.kind === "official" ? "공식" : "스크림"}</span>
                          </span>
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
                {/* 대회 공지 — 글 하나가 곧 한 페이지라 여기서는 최근 몇 건만 보여주고 넘긴다 */}
                <section>
                  <Bar k="Notice" right={
                    <button onClick={() => router.push("/tournament/notice")}
                      className="text-[10px] font-black esp-mono text-gray-600 hover:text-white transition-colors">전체 →</button>
                  } />
                  {notices.length === 0 ? (
                    <p className="py-4 text-[11px] font-bold text-gray-700">등록된 공지가 없습니다.</p>
                  ) : (
                    <div className="divide-y divide-white/[0.06]">
                      {notices.slice(0, 4).map((n) => {
                        const pub = new Date(n.publishAt);
                        const scheduled = pub.getTime() > Date.now();
                        return (
                          <button key={n._id} onClick={() => router.push(`/tournament/notice/${n._id}`)}
                            className="w-full text-left py-2.5 group">
                            <span className="flex items-center gap-1.5 mb-1">
                              {n.pinned && <span className="text-[9px] font-black esp-mono" style={{ color: G }}>고정</span>}
                              {n.important && <span className="text-[9px] font-black esp-mono text-rose-400">중요</span>}
                              {scheduled && <span className="text-[9px] font-black esp-mono text-amber-300">예약</span>}
                              <span className="ml-auto text-[9px] font-black esp-mono text-gray-700 tabular-nums">{dL(pub)}</span>
                            </span>
                            <span className="block text-[12px] font-black text-gray-300 group-hover:text-white transition-colors truncate">{n.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section>
                  <Bar k="Schedule" />
                  <button onClick={() => setView("board")} className="w-full text-left esp-cut border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors p-5">
                    <p className="text-[13px] font-black">스크림 캘린더</p>
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
                  <div className="grid grid-cols-2 xl:grid-cols-1 gap-x-4 xl:gap-x-0 xl:divide-y xl:divide-white/[0.06]">
                    {team.members.map((m, i) => {
                      const ok = !!m.discordId && submitted.has(m.discordId);
                      // 응답은 냈는데 고른 칸이 하나도 없으면 '전체 불가'다 — 미제출과 구분해서 보여준다
                      const av = team.avail.find((a) => a.userId === m.discordId);
                      const isNone = ok && ((m.discordId === data?.me ? (none ? 0 : mine.size) : av?.slots.length) || 0) === 0;
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
                          <span className={`shrink-0 text-[9px] font-black esp-mono ${isNone ? "text-rose-400" : ok ? "" : "text-gray-700"}`} style={ok && !isNone ? { color: G } : undefined}>{isNone ? "전체 불가" : ok ? "제출함" : "미제출"}</span>
                          {isAdmin && ok && (
                            <button disabled={busy} onClick={async () => { const r = await post({ action: "avail:reset", teamId: id, userId: m.discordId }); if (r) setToast(`${m.name} 응답을 초기화했습니다`); }}
                              className="shrink-0 text-[9px] font-black text-rose-400/70 hover:text-rose-300 disabled:opacity-40">초기화</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 📌 미제출자 재촉 — 봇이 개인 DM 으로 찌른다. 팀장·관리자만 */}
                  {(iAmLeader || isAdmin) && waiting.length > 0 && (
                    <button disabled={busy} onClick={() => setNudgeOpen(true)}
                      className="mt-4 w-full esp-cut-sm py-3 text-[12px] font-black border transition-all active:scale-[.99] disabled:opacity-40"
                      style={{ borderColor: `${C}55`, background: `${C}14`, color: C }}>
                      미제출 {waiting.length}명 DM 으로 재촉하기
                    </button>
                  )}
                </section>
              </aside>
            </div>
          )}

          {/* ══ 스크림 캘린더 ══ */}
          {view === "board" && (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
              <div className="min-w-0">
                <Bar k="My Availability" right={<span className="text-[10px] font-black esp-mono text-gray-600">{doneCount}/{size} 제출</span>} />
                {periodOver && (
                  <div className="esp-cut border border-dashed border-white/10 px-6 py-12 text-center">
                    <p className="text-[13px] font-black text-gray-400">조율 기간이 끝났습니다</p>
                    <p className="mt-2 text-[11px] text-gray-600">운영진이 기간을 다시 열면 여기에 다시 표시됩니다</p>
                  </div>
                )}
                {!periodOver && (<>
                <p className="text-[13px] font-black text-white mb-2.5">
                  가능한 시간을 눌러주세요
                </p>
                {/* 한 문장에 다 밀어넣지 않고 조각으로 나눈다 — 좁은 화면에서도 2열로 유지 */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-4">
                  {[["누르기", "가능으로 표시"], ["다시 누르기", "해제"], ["날짜 누르기", "하루 전체"], ["제출 뒤", "언제든 수정"]].map(([k, v]) => (
                    <span key={k} className="flex items-baseline gap-2 text-[11px] min-w-0">
                      <b className="font-black text-gray-300 shrink-0">{k}</b>
                      <span className="font-medium text-gray-600 truncate">{v}</span>
                    </span>
                  ))}
                </div>
                <div className={none ? "opacity-30 pointer-events-none" : ""}>
                  <Grid
                    slots={SLOTS} days={DAYS} color={C} isPast={isPast}
                    onToggle={toggle} onToggleDay={toggleDay} onPaint={paint} canDrag={canDrag} dragRef={dragRef}
                    value={(d, s) => ({ n: usAt(d, s), cap: size || 1, me: mine.has(sKey(d, s)), full: usAt(d, s) === size && size > 0 })} />
                </div>

                {/* 되는 시간이 하나도 없는 사람도 '답을 낸' 상태가 되어야 팀이 기다리지 않는다 */}
                <button
                  onClick={() => { const v = !none; setNone(v); if (v) setMine(new Set()); setDirty(true); }}
                  aria-pressed={none}
                  className="mt-4 esp-cut-sm w-full flex items-center gap-2.5 px-4 py-3 border text-left transition-colors"
                  style={none
                    ? { borderColor: "rgba(251,113,133,.5)", background: "rgba(251,113,133,.10)" }
                    : { borderColor: "rgba(255,255,255,.09)", background: "rgba(255,255,255,.02)" }}
                >
                  <span className="w-4 h-4 shrink-0 grid place-items-center border"
                    style={none ? { borderColor: "#fb7185", background: "#fb7185" } : { borderColor: "rgba(255,255,255,.2)" }}>
                    {none && <span className="text-[10px] font-black text-[#1a0508] leading-none">✓</span>}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12px] font-black" style={{ color: none ? "#fb7185" : "#d2d2d5" }}>해당 기간 전체 불가</span>
                  </span>
                </button>

                <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center gap-4">
                  <span className="flex-1 text-[11px] font-bold text-gray-500">
                    {none
                      ? <span className="text-rose-400">전체 불가로 제출합니다</span>
                      : mine.size
                        ? <><b className="text-white tabular-nums">{mine.size}칸</b> 선택함{dirty && <span className="text-amber-300"> · 저장 안 됨</span>}</>
                        : "가능한 시간을 표시해주세요"}
                  </span>
                  <button disabled={busy || (!none && mine.size === 0) || (!inTeam && !isAdmin)}
                    onClick={async () => { const r = await post({ action: "avail:submit", teamId: id, slots: none ? [] : [...mine] }); if (r) { setDirty(false); setToast(none ? "전체 불가로 제출했습니다" : meSubmitted ? "일정을 다시 제출했습니다" : "제출했습니다"); } }}
                    className="shrink-0 esp-cut-sm px-7 py-3 text-[12px] font-black transition-all active:scale-[.97] disabled:opacity-35"
                    style={none ? { background: "#fb7185", color: "#1a0508" } : { background: G, color: "#04120b" }}>
                    {meSubmitted ? "다시 제출" : "제출"}
                  </button>
                </div>
                </>)}
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

        </div>
      </div>

      {/* 📌 재촉 DM 미리보기 — 누구에게 무엇이 가는지 보고 나서 보낸다 */}
      {nudgeOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-5" onClick={() => setNudgeOpen(false)}>
          <div className="esp-cut w-full sm:max-w-[440px] max-h-[88dvh] overflow-y-auto no-bar border border-white/10 bg-[#0b0d0c] p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] font-black esp-mono text-gray-600 mb-1">NUDGE</p>
            <h3 className="text-[17px] font-black tracking-tight mb-4">이 내용으로 개인 DM 을 보냅니다</h3>

            <span className="block text-[10px] font-black esp-mono text-gray-600 mb-2">받는 사람 {waiting.length}명</span>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {waiting.map((m, i) => (
                <span key={i} className="esp-cut-sm px-2.5 py-1 text-[11px] font-black border"
                  style={{ borderColor: `${C}44`, background: `${C}12`, color: C }}>{m.name}</span>
              ))}
            </div>

            <DmPreview teamName={team.name} dueAt={season.dueAt} copy={(season as any).nudge} />

            <div className="flex gap-2 mt-5">
              <button onClick={() => setNudgeOpen(false)}
                className="flex-1 esp-cut-sm py-3 text-[12px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">취소</button>
              <button disabled={busy} onClick={async () => {
                const r = await post({ action: "nudge:send", teamId: id });
                setNudgeOpen(false);
                if (r) setToast(r.queued ? `${r.queued}명에게 DM 을 보냅니다` : "방금 보낸 사람뿐이라 건너뛰었습니다");
              }}
                className="flex-[1.4] esp-cut-sm py-3 text-[12px] font-black transition-all active:scale-[.98] disabled:opacity-40"
                style={{ background: G, color: "#04120b" }}>
                {waiting.length}명에게 보내기
              </button>
            </div>
            <button disabled={busy} onClick={async () => {
              const r = await post({ action: "nudge:test", teamId: id });
              if (r) setToast("내 디스코드 DM 으로 보냈습니다");
            }}
              className="w-full mt-2 esp-cut-sm py-2.5 text-[11px] font-black border border-white/12 bg-white/[0.03] text-gray-400 hover:text-white transition-colors disabled:opacity-40">
              나에게 먼저 보내보기
            </button>
            <p className="mt-3 text-[10px] font-bold text-gray-600 leading-relaxed">
              DM 이 막혀 있는 사람에게는 가지 않습니다. 같은 사람에게는 30분에 한 번만 보낼 수 있습니다.
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-4 right-4 bottom-6 lg:left-auto lg:right-8 z-[60] max-w-[400px] mx-auto lg:mx-0 esp-cut-sm flex items-center gap-3 min-h-[46px] px-5 py-3 border border-white/10 bg-[#0d0f0e]/96 backdrop-blur-xl text-[12px] font-bold text-gray-200">
          <span className="w-1.5 h-1.5 shrink-0" style={{ background: G }} />
          {toast}
        </div>
      )}
    </main>
  );
}
