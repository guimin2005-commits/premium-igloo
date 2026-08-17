"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";
import { BracketView } from "../components/BracketView";
import { EsportsStyles, STATUS_META } from "../components/Esports";
import { PHASES, phaseOf, phaseMeta, phaseShows } from "@/lib/tournamentPhase";

const ADMIN_USERS = ["elahw.06"];

const RenderFormattedText = ({ text, onCopy }: { text: string; onCopy?: () => void }) => {
  if (!text) return null;

  const parseMarkdownWithTable = (text: string): string => {
    const lines = text.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }

        const table = parseMarkdownTable(tableLines);
        if (table) {
          result.push(table);
        } else {
          result.push(...tableLines.map(l => formatInlineMarkdown(l)));
        }
      } else {
        result.push(formatInlineMarkdown(line));
        i++;
      }
    }

    return result.join("\n");
  };

  const parseMarkdownTable = (lines: string[]): string | null => {
    if (lines.length < 2) return null;

    const headerLine = lines[0].trim();
    const separatorLine = lines[1].trim();

    if (!/^\|.*\|$/.test(headerLine) || !/^\|[\s|-]+\|$/.test(separatorLine)) {
      return null;
    }

    const parseRow = (line: string): string[] => {
      return line.split("|").slice(1, -1).map(cell => cell.trim());
    };

    const headerCells = parseRow(headerLine);
    const dataRows = lines.slice(2).map(parseRow);

    let html = "<table class='w-full border-collapse border border-white/10 my-4'>";
    html += "<thead><tr>";
    headerCells.forEach(cell => {
      html += `<th class='border border-white/10 px-3 py-2 bg-white/5 text-left font-bold'>${formatInlineMarkdown(cell)}</th>`;
    });
    html += "</tr></thead>";

    html += "<tbody>";
    dataRows.forEach(cells => {
      html += "<tr>";
      cells.forEach(cell => {
        html += `<td class='border border-white/10 px-3 py-2'>${formatInlineMarkdown(cell)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";

    return html;
  };

  const formatInlineMarkdown = (text: string): string => {
    return text
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer' class='text-[#e91e3f] hover:underline'>$1</a>")
      .replace(/\{([^}]+)\}/g, (match, code) => `<span class='inline-flex items-center gap-1.5 bg-[#2a2a2a] px-2.5 py-1 rounded'><code class='text-[#e91e3f] font-mono text-sm'>${code}</code><button class='copy-btn text-[#e91e3f] hover:text-white transition-colors flex-shrink-0' data-copy='${code}' title='복사'><svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor' class='w-3.5 h-3.5'><path strokeLinecap='round' strokeLinejoin='round' d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' /></svg></button></span>`)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<span class='underline'>$1</span>")
      .replace(/~~(.*?)~~/g, "<span class='line-through'>$1</span>")
      .replace(/==(.*?)==/g, "<span class='text-[#e91e3f] font-bold'>$1</span>")
      .replace(/^(\s*)\*[ \t]+/, "$1<span class='text-[#e91e3f]'>·</span> ");
  };

  const formatted = parseMarkdownWithTable(text);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: formatted }}
      onClick={(e: React.MouseEvent) => {
        let target = e.target as HTMLElement;
        while (target && !target.classList.contains('copy-btn')) {
          target = target.parentElement as HTMLElement;
        }
        if (target?.classList.contains('copy-btn')) {
          const code = target.getAttribute('data-copy');
          if (code) {
            navigator.clipboard.writeText(code);
            onCopy?.();
          }
        }
      }}
    />
  );
};

// 📌 대진표 렌더러는 공용 컴포넌트로 분리 (작성 페이지 미리보기와 공유)

// 📌 대회 상태: 예정됨 → 모집중(참가 신청 접수) → 진행중(리그 진행) → 종료됨
// 디자인 시스템과 상태 팔레트는 components/Esports 에서 공유

// 📌 리그 상세 일정 타임라인 (팀원 배정, 스크림, 본선 등)
const fmtDate = (s: string) => (s ? s.replace(/-/g, ".").slice(2) : "");
const ScheduleTimeline = ({ schedule }: { schedule: any[] }) => {
  if (!schedule?.length) return null;
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return (
    <div>
      <div className="flex items-baseline gap-4 mb-4">
        <span className="text-xs font-black esp-mono text-[#00e07b]">SCHEDULE</span>
        <div className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent"></div>
      </div>
      <div className="space-y-0">
        {schedule.map((ph: any, i: number) => {
          const isPast = ph.end && ph.end < today;
          const isNow = ph.start && ph.start <= today && (!ph.end || ph.end >= today);
          return (
            <div key={i} className="flex gap-3.5 group/ph">
              {/* 타임라인 선 + 점 */}
              <div className="flex flex-col items-center shrink-0">
                <span className={`w-3 h-3 rounded-full border-2 mt-1 ${isNow ? "border-[#00e07b] bg-[#00e07b] shadow-[0_0_10px_rgba(0,224,123,0.6)]" : isPast ? "border-white/20 bg-white/20" : "border-white/30 bg-transparent"}`}></span>
                {i < schedule.length - 1 && <span className={`w-px flex-1 min-h-[24px] ${isPast ? "bg-white/15" : "bg-white/8"}`}></span>}
              </div>
              <div className="pb-4 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`text-sm font-black ${isNow ? "text-[#00e07b]" : isPast ? "text-gray-500" : "text-white"}`}>{ph.label}</p>
                  {isNow && <span className="text-[9px] font-black esp-mono bg-[#00e07b]/15 text-[#00e07b] px-2 py-0.5 esp-cut-sm animate-pulse">진행 중</span>}
                </div>
                {(ph.start || ph.end) && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{fmtDate(ph.start)}{ph.end ? ` ~ ${fmtDate(ph.end)}` : ""}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function TournamentPage() {
  const router = useRouter();
  const { data: session, status } = useSession() as any;
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);

  const [copyNotification, setCopyNotification] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });
  const [isLoginReqModalOpen, setIsLoginReqModalOpen] = useState(false);
  // 📌 참가 설문
  const [surveyTarget, setSurveyTarget] = useState<any>(null);          // 설문 작성 대상 대회
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, any>>({});
  const [surveyEtc, setSurveyEtc] = useState<Record<string, string>>({}); // 기타 직접 입력
  const [surveyMine, setSurveyMine] = useState<any>(null);              // 내 기존 응답
  const [surveyCount, setSurveyCount] = useState(0);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [invalidQid, setInvalidQid] = useState<string | null>(null);        // 검증 실패 시 흔들림 표시할 문항
  const qidRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 📌 내 팀 룸 — 스크림 로스터에서 내 디스코드 ID 를 찾아 입구를 띄운다
  const [myTeam, setMyTeam] = useState<any>(null);
  useEffect(() => {
    if (status !== "authenticated") { setMyTeam(null); return; }
    fetch("/api/room", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        const mine = (d.teams || []).find((t: any) => (t.members || []).some((m: any) => m.discordId && m.discordId === d.me));
        if (!mine) return;
        const ids = new Set((mine.avail || []).map((a: any) => a.userId));
        setMyTeam({ ...mine, submitted: (mine.members || []).filter((m: any) => ids.has(m.discordId)).length });
      })
      .catch(() => {});
  }, [status]);

  const fetchTournaments = async (admin = false) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/posts?category=대회${admin ? "&all=1" : ""}`, { cache: "no-store" });
      if (res.ok) setTournaments((await res.json()).data || []);
    } catch { console.error("대회 로드 실패"); } finally { setIsLoading(false); }
  };

  useEffect(() => { if (status !== "loading") fetchTournaments(!!isAdmin); }, [status, isAdmin]);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        if (selected && selected._id === deleteConfirmId) setSelected(null);
        setPopup({ isOpen: true, message: "대회가 삭제되었습니다.", isError: false });
        fetchTournaments();
      }
    } catch { setPopup({ isOpen: true, message: "삭제 중 오류 발생", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const getStatus = (t: any) => {
    const manual = STATUS_META[t.tournamentStatus] ? t.tournamentStatus : "예정됨";
    if (manual === "종료됨") return manual;
    // 📌 리그 일정 종료일이 지나면 자동으로 종료 처리
    if (t.tournamentDate?.includes("~")) {
      const endDateStr = t.tournamentDate.split("~")[1]?.trim();
      if (endDateStr) {
        const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const todayStr = kstDate.toISOString().split("T")[0].replace(/-/g, ".");
        if (endDateStr < todayStr) return "종료됨";
      }
    }
    return manual;
  };

  const sorted = [...tournaments].sort((a, b) => {
    const order: Record<string, number> = { "모집중": 0, "진행중": 1, "예정됨": 2, "종료됨": 3 };
    return (order[getStatus(a)] ?? 2) - (order[getStatus(b)] ?? 2);
  });

  const filtered = activeFilter === "all" ? sorted : sorted.filter(t => getStatus(t) === activeFilter);

  // 참가 신청은 "모집중" 상태에서만 가능
  const handleApply = (t: any) => {
    if (getStatus(t) !== "모집중") return;
    if (status !== "authenticated") {
      setIsLoginReqModalOpen(true);
      return;
    }
    // 📌 참가 설문이 있으면 설문 폼을 우선 (외부 링크보다 우선)
    // 마감된 설문도 '내 제출 내용 확인'은 가능해야 하므로 모달을 열고 안에서 처리한다
    if (t.survey?.enabled) { openSurvey(t); return; }
    if (t.tournamentLink) window.open(t.tournamentLink, "_blank", "noopener,noreferrer");
    else setSelected(t);
  };

  // 📌 상세를 열면 설문 접수 현황(인원/내 제출 여부)을 미리 가져온다
  useEffect(() => {
    if (!selected?.survey?.enabled) { setSurveyCount(0); setSurveyMine(null); return; }
    let alive = true;
    fetch(`/api/survey?postId=${selected._id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (alive && d?.success) { setSurveyCount(d.count || 0); setSurveyMine(d.mine || null); } })
      .catch(() => {});
    return () => { alive = false; };
  }, [selected]);

  // ── 참가 설문 ──
  const openSurvey = async (t: any) => {
    setSurveyTarget(t);
    setSurveyAnswers({});
    setSurveyEtc({});
    setSurveyMine(null);
    setInvalidQid(null);
    try {
      const d = await fetch(`/api/survey?postId=${t._id}`, { cache: "no-store" }).then((r) => r.json());
      if (d?.success) { setSurveyMine(d.mine || null); setSurveyCount(d.count || 0); }
    } catch {}
  };

  // 📌 필수 문항 미작성 시 — 해당 문항으로 스크롤 + 흔들림으로 즉시 위치를 알려준다
  const flagInvalidQuestion = (qid: string) => {
    setInvalidQid(qid);
    qidRefs.current[qid]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setInvalidQid((cur) => (cur === qid ? null : cur)), 650);
  };

  const submitSurvey = async () => {
    if (!surveyTarget || surveySubmitting) return;
    // 설명 블록은 응답 대상이 아니므로 제외
    const qs = (surveyTarget.survey?.questions || []).filter((q: any) => q.type !== "note");
    // 필수 검증
    for (const q of qs) {
      const v = surveyAnswers[q.qid];
      const etcText = (surveyEtc[q.qid] || "").trim();
      let empty = v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
      // '기타'만 고른 뒤 직접 입력을 비워두면 미작성으로 간주
      if (!empty && v === "__etc__" && !etcText) empty = true;
      if (!empty && Array.isArray(v) && v.filter((x: string) => x !== "__etc__").length === 0 && !etcText) empty = true;
      if (q.required && empty) { flagInvalidQuestion(q.qid); setPopup({ isOpen: true, message: `필수 항목입니다.\n${q.label}`, isError: true }); return; }
      if (!q.required && v === "__etc__" && !etcText) {
        flagInvalidQuestion(q.qid);
        setPopup({ isOpen: true, message: `'기타'를 선택하셨습니다.\n직접 입력란을 작성해주세요.\n\n${q.label}`, isError: true }); return;
      }
    }
    setSurveySubmitting(true);
    try {
      const answers = qs.map((q: any) => {
        let value: any = surveyAnswers[q.qid] ?? (q.type === "multi" ? [] : "");
        // '기타' 직접 입력 반영
        if (q.etc && surveyEtc[q.qid]?.trim()) {
          const etcText = `기타: ${surveyEtc[q.qid].trim()}`;
          if (q.type === "multi") value = [...(Array.isArray(value) ? value.filter((x: string) => x !== "__etc__") : []), etcText];
          else if (value === "__etc__") value = etcText;
        } else if (q.type === "multi" && Array.isArray(value)) {
          value = value.filter((x: string) => x !== "__etc__");
        } else if (value === "__etc__") value = "";
        return { qid: q.qid, value };
      });
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: surveyTarget._id, answers }),
      });
      const d = await res.json();
      if (d.success) {
        setSurveyTarget(null);
        setPopup({ isOpen: true, message: "참가 신청이 접수되었습니다.\n감사합니다!", isError: false });
      } else {
        setPopup({ isOpen: true, message: d.message || "제출에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류가 발생했습니다.", isError: true });
    } finally { setSurveySubmitting(false); }
  };

  return (
    <main className="flex-1 w-full flex flex-col relative">
      <LuxStyles />
      <EsportsStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-14 pb-0 md:pt-20 px-6 overflow-hidden">
        <div className="absolute inset-0 esp-mesh pointer-events-none" />
        <div className="absolute inset-0 esp-scan pointer-events-none opacity-40" />
        <div className="absolute top-[-160px] left-1/2 -translate-x-1/2 w-[720px] h-[320px] bg-[#00e07b]/[0.09] blur-[130px] rounded-full pointer-events-none" />
        {/* 배경 워터마크 */}
        <p className="absolute -top-2 right-4 hidden lg:block text-[110px] font-black tracking-tighter leading-none pointer-events-none select-none text-transparent" style={{ WebkitTextStroke: "1px rgba(0,224,123,0.10)" }}>LEAGUE</p>

        <div className="max-w-6xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-2 h-2 bg-[#00e07b] esp-blink" style={{ clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
              <span className="text-[10px] font-black esp-mono text-[#00e07b] uppercase">E-Sports League Hub</span>
              <span className="h-px flex-1 max-w-[220px] bg-gradient-to-r from-[#00e07b]/50 to-transparent" />
              <button onClick={() => router.push("/tournament/notice")}
                className="esp-cut-sm px-3 py-1.5 text-[10px] font-black bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.09] transition-colors">
                대회 공지
              </button>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mb-3">
                  <span className="text-white">TOUR</span><span className="text-[#00e07b]">NAMENT</span>
                </h1>
                <p className="text-gray-400 text-sm md:text-base">고급 이글루 e스포츠 룸에서 열리는 모든 리그를 신청하고 확인하는 곳입니다.</p>
              </div>
              {isAdmin && (
                <button onClick={() => router.push("/write?category=대회")} className="group/btn relative shrink-0 esp-cut-sm bg-[#00e07b] text-[#04120b] font-black text-xs px-6 py-3.5 hover:bg-[#3dffa6] transition-all active:scale-95">
                  + 대회 등록
                </button>
              )}
            </div>
          </Reveal>

          {/* HUD 지표 스트립 */}
          <Reveal delay={120}>
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 border-t border-[#00e07b]/20">
              {[
                { k: "TOTAL", l: "전체 대회", v: tournaments.length, c: "text-white" },
                { k: "OPEN", l: "접수 중", v: tournaments.filter((x) => getStatus(x) === "모집중").length, c: "text-amber-300" },
                { k: "LIVE", l: "진행 중", v: tournaments.filter((x) => getStatus(x) === "진행중").length, c: "text-[#ff6b83]" },
                { k: "CLOSED", l: "종료", v: tournaments.filter((x) => getStatus(x) === "종료됨").length, c: "text-gray-500" },
              ].map((m, i) => (
                <div key={m.k} className={`py-4 md:px-5 ${i > 0 ? "md:border-l border-white/[0.07]" : ""} ${i % 2 === 1 ? "border-l border-white/[0.07] pl-5 md:pl-5" : ""} ${i < 2 ? "border-b md:border-b-0 border-white/[0.07]" : ""}`}>
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">{m.k}</p>
                  <p className="flex items-baseline gap-1.5">
                    <span className={`text-2xl md:text-3xl font-black tabular-nums ${m.c}`}>{String(m.v).padStart(2, "0")}</span>
                    <span className="text-[11px] font-bold text-gray-600">{m.l}</span>
                  </p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* 📌 내 팀 룸 — 로스터에 내 디스코드 ID가 있으면 바로 들어가는 입구.
                 선수는 팀 id를 알 수 없으므로 시스템이 찾아서 띄워준다. */}
          {!myTeam && isAdmin && (
            <Reveal delay={180}>
              <button onClick={() => router.push("/admin/room")}
                className="mt-8 w-full text-left esp-cut-sm border border-white/[0.09] bg-white/[0.02] hover:bg-white/[0.05] transition-colors p-5 flex items-center gap-4">
                <span className="grid place-items-center shrink-0 w-12 h-12 esp-cut-sm text-[#00e07b] text-xl font-black" style={{ background: "rgba(0,224,123,.10)", border: "1px solid rgba(0,224,123,.35)" }}>⚙</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-black esp-mono text-[#00e07b] mb-1.5">ROOM OPERATIONS</span>
                  <span className="block text-white font-black text-base leading-tight">대회 룸 운영</span>
                  <span className="block text-[11px] font-bold text-gray-500 mt-1.5">팀 등록 · 대회 공지 · 스크림 매칭 · 기간 설정. 소속 팀이 없어도 모든 팀 룸에 들어갈 수 있습니다.</span>
                </span>
                <span className="shrink-0 text-gray-600 text-2xl">›</span>
              </button>
            </Reveal>
          )}

          {myTeam && (
            <Reveal delay={180}>
              <button
                onClick={() => router.push(`/tournament/team/${myTeam._id}`)}
                className="mt-8 w-full text-left esp-cut-sm border border-[#00e07b]/30 bg-[#00e07b]/[0.06] hover:bg-[#00e07b]/[0.11] transition-colors p-5 md:p-6 flex items-center gap-4 md:gap-5"
              >
                <span className="grid place-items-center shrink-0 w-12 h-12 md:w-14 md:h-14 rounded-2xl text-sm md:text-base font-black tracking-tight"
                  style={{ background: `linear-gradient(150deg, ${myTeam.color}2e, ${myTeam.color}0a)`, border: `1px solid ${myTeam.color}55`, color: myTeam.color }}>
                  {myTeam.tag || myTeam.name.slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-black esp-mono text-[#00e07b] mb-1.5">TEAM ROOM</span>
                  <span className="block text-white font-black text-lg md:text-xl leading-tight truncate">{myTeam.name}</span>
                  <span className="block text-[11px] md:text-xs font-bold text-gray-400 mt-1.5">
                    {myTeam.submitted >= myTeam.members.length
                      ? "팀 전원이 일정을 냈습니다 — 스크림 매칭 대기"
                      : <>스크림 캘린더에서 가능한 시간을 알려주세요 · <span className="text-amber-300 tabular-nums">{myTeam.members.length - myTeam.submitted}명</span> 미제출</>}
                  </span>
                </span>
                <span className="shrink-0 text-[#00e07b] text-2xl">›</span>
              </button>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 탭 (앵귤러 세그먼트 · 스티키) ── */}
      <div className="w-full px-6 bg-[#090909]/90 backdrop-blur-xl border-b border-white/[0.07] mt-8">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto whitespace-nowrap no-bar py-2.5">
          {[{ id: "all", label: "전체", code: "ALL" }, { id: "모집중", label: "참가 접수", code: "OPEN" }, { id: "진행중", label: "리그 진행", code: "LIVE" }, { id: "예정됨", label: "예정", code: "SOON" }, { id: "종료됨", label: "종료", code: "END" }].map((tab) => {
            const on = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`esp-cut-sm px-4 md:px-5 py-2.5 text-xs md:text-sm font-black shrink-0 outline-none transition-all duration-200 flex items-center gap-2 ${
                  on ? "bg-[#00e07b] text-[#04120b]" : "bg-white/[0.03] text-gray-500 hover:text-white hover:bg-white/[0.07]"
                }`}
              >
                <span className={`text-[9px] esp-mono ${on ? "text-[#04120b]/60" : "text-gray-700"}`}>{tab.code}</span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full max-w-6xl mx-auto px-6 py-10 flex-1 flex flex-col">

      {isLoading ? (
        <div className="text-center py-24">
          <p className="text-[10px] font-black esp-mono text-[#00e07b] mb-3">LOADING</p>
          <p className="text-sm text-gray-500 font-bold">대회 정보를 불러오는 중…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="esp-frame esp-cut">
          <div className="esp-cut bg-[#0b0b0b] py-24 px-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 esp-mesh opacity-70 pointer-events-none" />
            <div className="relative z-10">
              <div className="w-14 h-14 mx-auto mb-6 esp-cut-sm border border-[#00e07b]/25 bg-[#00e07b]/[0.06] flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.4} stroke="currentColor" className="w-6 h-6 text-[#00e07b]"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35" /></svg>
              </div>
              <p className="text-white font-black text-lg mb-2">{activeFilter === "all" ? "등록된 대회가 없습니다" : "해당하는 대회가 없습니다"}</p>
              <p className="text-sm text-gray-500">대회 시즌이 시작되면 이곳에서 참가 신청과 리그 진행이 열립니다.</p>
            </div>
          </div>
        </div>
      ) : (
        /* 📌 e스포츠 매치 모듈 — 각진 프레임 + 내부는 헤어라인(박스 중첩 없음) */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map((t, listIdx) => {
            const st = getStatus(t);
            const meta = STATUS_META[st];
            const ph = phaseOf(t);
            const isRecruit = phaseShows(ph).survey; // 접수 단계면 신청 카드로 보인다
            const isLive = st === "모집중" || st === "진행중";
            return (
              <Reveal key={t._id} delay={Math.min(listIdx, 5) * 70} className={`group h-full ${st === "종료됨" ? "opacity-65 hover:opacity-100 transition-opacity" : ""}`}>
              <div className="esp-frame esp-cut h-full">
              <div onClick={() => router.push(`/tournament/${t._id}`)} className="esp-cut esp-sweep relative bg-[#0b0b0b] h-full flex flex-col cursor-pointer overflow-hidden">
                {/* 상단 상태 바 */}
                <div className="relative h-[3px] shrink-0 bg-white/[0.06]">
                  <span className={`absolute inset-y-0 left-0 ${meta.bar} ${st === "모집중" ? "w-2/3" : st === "진행중" ? "w-full esp-blink" : st === "예정됨" ? "w-1/4" : "w-full opacity-30"}`} />
                </div>

                {/* 배너 밴드 */}
                <div className="w-full h-36 bg-[#0f0f0f] relative overflow-hidden shrink-0 border-b border-white/[0.07]">
                  {t.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.bannerUrl} alt={t.title} className="w-full h-full object-cover opacity-55 group-hover:opacity-75 group-hover:scale-[1.04] transition-all duration-700 ease-out" />
                  ) : (
                    <div className="absolute inset-0 esp-mesh opacity-80" />
                  )}
                  <div className="absolute inset-0 esp-scan opacity-50 pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/30 to-transparent" />

                  {/* 매치 번호 */}
                  <span className="absolute top-3 left-4 text-[10px] font-black esp-mono text-white/35">MATCH {String(listIdx + 1).padStart(2, "0")}</span>

                  {/* 상태 + 타입 뱃지 (그린 사용 안 함 — 브랜드 컬러와 구분) */}
                  <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-black esp-cut-sm ${meta.badge}`}>
                      {isLive && <span className="relative flex w-1.5 h-1.5"><span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${meta.dot} opacity-60`}></span><span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${meta.dot}`}></span></span>}
                      {meta.label}
                    </span>
                    <span className={`text-[9px] font-black esp-mono px-2 py-0.5 esp-cut-sm ${isRecruit ? "bg-white/[0.07] text-gray-300 border border-white/15" : "bg-white/[0.07] text-gray-400 border border-white/12"}`}>{isRecruit ? "참가 신청" : "대진표"}</span>
                  </div>

                  {isAdmin && (
                    <div className="absolute bottom-3 left-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/write?id=${t._id}`); }} className="text-[10px] font-black text-white bg-black/70 backdrop-blur px-2 py-1 esp-cut-sm hover:bg-black">수정</button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(t._id); }} className="text-[10px] font-black text-red-400 bg-black/70 backdrop-blur px-2 py-1 esp-cut-sm hover:bg-black">삭제</button>
                      {t.survey?.enabled && (
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/tournament/survey/${t._id}`); }} className="text-[10px] font-black text-[#00e07b] bg-black/70 backdrop-blur px-2 py-1 esp-cut-sm hover:bg-black">설문 결과</button>
                      )}
                    </div>
                  )}
                </div>

                {/* 제목 블록 */}
                <div className="px-5 py-5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-3 h-3 shrink-0 border border-[#00e07b]/60" style={{ clipPath: "polygon(0 0,100% 0,100% 35%,35% 35%,35% 100%,0 100%)" }} />
                    <span className="text-[10px] font-black esp-mono text-gray-500 uppercase truncate">{t.tournamentGame || "TOURNAMENT"}</span>
                    {isAdmin && t.hidden && <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 border border-amber-400/30">숨김</span>}
                    <span className={`ml-auto text-[9px] font-black esp-mono shrink-0 ${meta.text}`}>{meta.code}</span>
                  </div>
                  <h3 className="text-xl font-black text-white leading-tight line-clamp-2 break-keep group-hover:text-[#00e07b] transition-colors">{t.title}</h3>
                </div>

                {/* 메타 — 세로 헤어라인 분할 */}
                <div className="grid grid-cols-2 border-t border-white/[0.07]">
                  <div className="px-5 py-3.5 min-w-0">
                    <p className="text-[9px] font-black esp-mono text-gray-600 mb-1">PRIZE</p>
                    <p className="text-[13px] font-black text-white truncate">{t.tournamentPrize || "미정"}</p>
                  </div>
                  <div className="px-5 py-3.5 min-w-0 border-l border-white/[0.07]">
                    <p className="text-[9px] font-black esp-mono text-gray-600 mb-1">PERIOD</p>
                    <p className="text-[13px] font-black text-gray-300 truncate">{t.tournamentDate || "미정"}</p>
                  </div>
                </div>

                {/* 일정 라인 마커 */}
                {Array.isArray(t.tournamentSchedule) && t.tournamentSchedule.length > 0 && (
                  <div className="px-5 py-3 border-t border-white/[0.07] flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    {t.tournamentSchedule.slice(0, 4).map((ph: any, i: number) => (
                      <span key={i} className="text-[10px] font-bold text-gray-500 border-l border-[#00e07b]/30 pl-2 leading-none">{ph.label}</span>
                    ))}
                    {t.tournamentSchedule.length > 4 && <span className="text-[10px] font-bold text-gray-700">+{t.tournamentSchedule.length - 4}</span>}
                  </div>
                )}

                <div className="flex-1" />

                {/* CTA — 모듈 하단 전면 바 (그린 = 실행) */}
                <button
                  disabled={st !== "모집중"}
                  onClick={(e) => { e.stopPropagation(); handleApply(t); }}
                  className={`w-full px-5 py-4 border-t border-white/[0.07] flex items-center justify-between gap-3 text-sm font-black transition-all ${
                    st === "모집중" ? "bg-[#00e07b]/[0.08] text-[#00e07b] hover:bg-[#00e07b] hover:text-[#04120b]"
                    : st === "진행중" ? "text-gray-200 hover:bg-white/[0.05]"
                    : "esp-stripe text-gray-600 cursor-not-allowed"}`}
                >
                  <span>{st === "모집중" ? (t.survey?.enabled ? (t.survey.closed ? "접수 마감" : "참가 신청서 작성") : "참가 신청하기") : st === "진행중" ? "대진표 확인하기" : st === "예정됨" ? "오픈 예정" : "대회 종료"}</span>
                  {(st === "모집중" || st === "진행중") && (
                    <svg className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                  )}
                </button>
              </div>
              </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className={`esp-frame esp-cut-md w-full ${selected.tournamentBracket ? "max-w-4xl" : "max-w-2xl"}`}>
          <div className={`esp-cut-md bg-[#0b0b0b] w-full max-h-[92dvh] sm:max-h-[85vh] flex flex-col relative overflow-hidden`}>
            {/* 상단 상태 바 */}
            <div className="relative h-[3px] shrink-0 bg-white/[0.06]">
              <span className={`absolute inset-y-0 left-0 w-full ${STATUS_META[getStatus(selected)].bar} ${getStatus(selected) === "진행중" ? "esp-blink" : ""}`} />
            </div>
            <button onClick={() => setSelected(null)} className="absolute top-6 right-5 p-2 text-gray-400 hover:text-white bg-black/60 backdrop-blur esp-cut-sm z-10"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>

            {selected.bannerUrl && (
              <div className="w-full h-44 sm:h-52 bg-[#0f0f0f] relative overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.bannerUrl} alt={selected.title} className="w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 esp-scan opacity-50" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
              </div>
            )}

            <div className="px-6 sm:px-8 py-7 overflow-y-auto [&::-webkit-scrollbar]:hidden flex-1">
              <div className="flex flex-wrap items-center gap-2.5 mb-3">
                <span className={`px-2.5 py-1 text-[11px] font-black esp-cut-sm ${STATUS_META[getStatus(selected)].badge}`}>{STATUS_META[getStatus(selected)].label}</span>
                <span className="text-[10px] font-black esp-mono text-gray-500 uppercase">{selected.tournamentGame}</span>
                <span className={`text-[9px] font-black esp-mono ml-auto ${STATUS_META[getStatus(selected)].text}`}>{STATUS_META[getStatus(selected)].code}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white mb-5 break-keep leading-tight">{selected.title}</h2>

              {isAdmin && (
                <div className="flex flex-wrap gap-2 mb-6">
                  <button onClick={() => router.push(`/write?id=${selected._id}`)} className="text-xs font-black text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 esp-cut-sm transition-colors">수정하기</button>
                  <button onClick={() => setDeleteConfirmId(selected._id)} className="text-xs font-black text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 esp-cut-sm transition-colors">삭제하기</button>
                  {selected.survey?.enabled && (
                    <button onClick={() => router.push(`/tournament/survey/${selected._id}`)} className="text-xs font-black text-[#00e07b] hover:text-[#04120b] bg-[#00e07b]/10 hover:bg-[#00e07b] px-4 py-2 esp-cut-sm transition-colors">설문 결과 · 통계</button>
                  )}
                </div>
              )}

              {/* 📌 대회 진행 띠 — 접수부터 종료까지 지금 어디인지 한 줄로 */}
              {(() => {
                const cur = phaseOf(selected);
                const idx = PHASES.findIndex((p) => p.id === cur);
                return (
                  <div className="flex gap-1 mb-6">
                    {PHASES.map((p, i) => {
                      const done = i < idx, on = i === idx;
                      return (
                        <div key={p.id} className="flex-1 min-w-0">
                          <div className="h-1" style={{ background: on ? "#00e07b" : done ? "rgba(0,224,123,.35)" : "rgba(255,255,255,.08)" }} />
                          <p className={`mt-2 text-[9px] font-black esp-mono truncate ${on ? "text-[#00e07b]" : done ? "text-gray-500" : "text-gray-700"}`}>{p.code}</p>
                          <p className={`text-[10px] font-bold truncate ${on ? "text-white" : "text-gray-600"}`}>{p.label}</p>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* 단계에 따라 다른 안내를 띄운다 — 지금 참가자가 할 일 */}
              {(() => {
                const cur = phaseOf(selected);
                const show = phaseShows(cur);
                if (show.scrim) return (
                  <div className="esp-cut border border-[#00e07b]/30 bg-[#00e07b]/[0.06] px-5 py-4 mb-6 flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[9px] font-black esp-mono text-[#00e07b] mb-1">PRACTICE WEEK</span>
                      <span className="block text-[13px] font-black text-white">연습 주간입니다 — 팀 룸에서 스크림 일정을 잡으세요</span>
                    </span>
                    <button onClick={() => router.push("/tournament")} className="shrink-0 esp-cut-sm px-4 py-2.5 text-[11px] font-black bg-[#00e07b] text-[#04120b]">팀 룸</button>
                  </div>
                );
                if (cur === "팀배정") return (
                  <div className="esp-cut border border-white/12 bg-white/[0.03] px-5 py-4 mb-6">
                    <span className="block text-[9px] font-black esp-mono text-gray-500 mb-1">DRAFT DAY</span>
                    <span className="block text-[13px] font-black text-white">오늘 경매로 팀을 나눕니다</span>
                  </div>
                );
                return null;
              })()}

              <div className="grid grid-cols-2 sm:grid-cols-3 border-y border-white/[0.08] mb-8">
                <div className="py-4 pr-4 min-w-0">
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">PRIZE</p>
                  <p className="text-white font-black leading-snug break-keep">{selected.tournamentPrize || "미정"}</p>
                </div>
                <div className="py-4 px-4 min-w-0 border-l border-white/[0.08]">
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">PERIOD</p>
                  {/* 좁은 칸에서 잘리지 않도록 시작/종료를 두 줄로 */}
                  {(() => {
                    const d = (selected.tournamentDate || "").trim();
                    const parts = d.split(/\s*~\s*/);
                    if (!d) return <p className="text-gray-300 font-bold">미정</p>;
                    if (parts.length < 2) return <p className="text-gray-300 font-bold leading-snug break-keep tabular-nums">{d}</p>;
                    return (
                      <p className="font-bold leading-snug tabular-nums">
                        <span className="block text-gray-300">{parts[0]}</span>
                        <span className="block text-gray-500">~ {parts[1]}</span>
                      </p>
                    );
                  })()}
                </div>
                {/* 📌 지금 이 대회가 어느 단계인지 — 일정이 있으면 현재/다음 단계, 없으면 진행 방식 */}
                {(() => {
                  const sch: any[] = Array.isArray(selected.tournamentSchedule) ? selected.tournamentSchedule : [];
                  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
                  const now = sch.find((p) => p.start && p.start <= today && (!p.end || p.end >= today));
                  const next = sch.find((p) => p.start && p.start > today);
                  const key = now ? "NOW" : next ? "NEXT" : "FORMAT";
                  const pm = phaseMeta(phaseOf(selected));
                  const value = now ? now.label : next ? next.label : pm ? pm.label : "참가 신청제";
                  const sub = now
                    ? `${fmtDate(now.start)}${now.end ? ` ~ ${fmtDate(now.end)}` : ""}`
                    : next ? `${fmtDate(next.start)} 시작`
                    : "";
                  return (
                    <div className="py-4 sm:px-4 min-w-0 col-span-2 sm:col-span-1 border-t sm:border-t-0 sm:border-l border-white/[0.08]">
                      <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">{key === "NOW" ? "현재 단계" : key === "NEXT" ? "다음 일정" : "진행 방식"}</p>
                      <p className={`font-black leading-snug break-keep ${key === "NOW" ? "text-[#00e07b]" : "text-gray-300"}`}>{value}</p>
                      {sub && <p className="text-[11px] text-gray-600 mt-0.5 tabular-nums">{sub}</p>}
                    </div>
                  );
                })()}
              </div>

              {selected.content && (
                <div className="text-gray-300 text-base leading-loose whitespace-pre-wrap mb-8"><RenderFormattedText text={selected.content} onCopy={() => { setCopyNotification(true); setTimeout(() => setCopyNotification(false), 2000); }} /></div>
              )}

              {/* 리그 상세 일정 타임라인 */}
              {Array.isArray(selected.tournamentSchedule) && selected.tournamentSchedule.length > 0 && (
                <div className="mb-8"><ScheduleTimeline schedule={selected.tournamentSchedule} /></div>
              )}

              {selected.tournamentBracket && (
                <div className="mb-8">
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-xs font-black esp-mono text-[#00e07b] shrink-0">BRACKET</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent"></div>
                  </div>
                  <BracketView text={selected.tournamentBracket} showHeader={false} maxScale={1.4} />
                </div>
              )}

              <button
                disabled={getStatus(selected) !== "모집중"}
                onClick={() => handleApply(selected)}
                className={`w-full py-4 esp-cut-sm font-black text-sm transition-all flex items-center justify-center gap-2 ${getStatus(selected) === "모집중" ? "bg-[#00e07b] text-[#04120b] hover:bg-[#3dffa6] active:scale-[0.99]" : getStatus(selected) === "진행중" ? "bg-white/[0.04] text-gray-300 border border-white/10 cursor-default" : "esp-stripe text-gray-600 cursor-not-allowed"}`}
              >
                {getStatus(selected) === "모집중"
                  ? (selected.survey?.enabled
                      ? (surveyMine ? "신청 완료 — 제출 내용 확인하기" : selected.survey.closed ? "설문 접수 마감" : "참가 신청서 작성하기")
                      : "참가 신청하기")
                  : getStatus(selected) === "진행중" ? "리그 진행 중 — 위 대진표를 확인하세요" : getStatus(selected) === "예정됨" ? "오픈 예정" : "대회 종료"}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="esp-cut border border-red-500/30 bg-[#0b0b0b] w-full max-w-sm p-8 text-center">
            <p className="text-[10px] font-black esp-mono text-red-400 mb-2">DELETE</p>
            <h2 className="text-xl font-black text-white mb-3">삭제 안내</h2>
            <p className="text-sm text-gray-400 mb-8">해당 대회를 영구 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white esp-cut-sm font-black transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white esp-cut-sm font-black transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {isLoginReqModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
          <div className="esp-cut border border-white/10 bg-[#0b0b0b] w-full max-w-sm p-8 text-center shadow-2xl relative">
            <div className="w-16 h-16 bg-[#5865F2]/10 esp-cut-sm flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-[#5865F2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">로그인 필요</h2>
            <p className="text-sm text-gray-400 mb-8 whitespace-pre-line">대회 참가 신청을 위해서는<br/>디스코드 로그인이 필요합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLoginReqModalOpen(false)} className="flex-1 py-3 esp-cut-sm font-black text-sm bg-white/5 hover:bg-white/10 text-white transition-colors">취소</button>
              <button onClick={() => signIn("discord")} className="flex-1 py-3 esp-cut-sm font-black text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white transition-colors">Discord 로그인</button>
            </div>
          </div>
        </div>
      )}

      {/* 📌 참가 설문 작성 폼 */}
      {surveyTarget && (
        <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm sm:p-4 overlay-in" onClick={() => setSurveyTarget(null)}>
          <div onClick={(e) => e.stopPropagation()} className="esp-frame esp-cut-md w-full max-w-2xl">
          <div className="esp-cut-md bg-[#0b0b0b] w-full max-h-[92dvh] flex flex-col overflow-hidden">
            {/* 진행 게이지 */}
            {(() => {
              const qs = (surveyTarget.survey?.questions || []).filter((q: any) => q.type !== "note");
              const done = qs.filter((q: any) => {
                const v = surveyAnswers[q.qid];
                return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
              }).length;
              const pct = qs.length ? Math.round((done / qs.length) * 100) : 0;
              return (
                <div className="relative h-[3px] shrink-0 bg-white/[0.06]">
                  <span className="absolute inset-y-0 left-0 bg-[#00e07b] transition-all duration-500" style={{ width: `${surveyMine ? 100 : pct}%` }} />
                </div>
              );
            })()}
            {/* 헤더 */}
            <div className="shrink-0 px-5 sm:px-8 pt-6 pb-5 border-b border-white/[0.08] relative overflow-hidden">
              <div className="absolute inset-0 esp-mesh opacity-70 pointer-events-none" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-1.5 h-1.5 bg-[#00e07b] esp-blink" style={{ clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
                    <p className="text-[10px] font-black esp-mono text-[#00e07b]">ENTRY FORM</p>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-white leading-tight break-keep">{surveyTarget.survey?.title || `${surveyTarget.title} 참가 신청서`}</h2>
                  {surveyTarget.survey?.desc && <p className="text-xs sm:text-sm text-gray-400 mt-2 leading-relaxed whitespace-pre-wrap">{surveyTarget.survey.desc}</p>}
                </div>
                <button onClick={() => setSurveyTarget(null)} className="shrink-0 p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 esp-cut-sm transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="relative flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4">
                <span className="text-[10px] font-bold text-gray-500 border-l border-[#00e07b]/40 pl-2 leading-none">문항 {(surveyTarget.survey?.questions || []).filter((q: any) => q.type !== "note").length}개</span>
                <span className="text-[10px] font-bold text-gray-500 border-l border-white/15 pl-2 leading-none tabular-nums">현재 {surveyCount}명 신청</span>
                <span className="text-[10px] font-bold text-red-400/90 border-l border-red-500/40 pl-2 leading-none">* 표시는 필수</span>
              </div>
            </div>

            {/* 본문 */}
            {surveyTarget.survey?.closed && !surveyMine ? (
              <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-16 text-center">
                <div className="w-14 h-14 esp-cut-sm bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                </div>
                <p className="text-[10px] font-black esp-mono text-gray-600 mb-2">ENTRY CLOSED</p>
                <h3 className="text-lg font-black text-white mb-2">참가 신청이 마감되었습니다</h3>
                <p className="text-sm text-gray-500">접수 기간이 종료되어 더 이상 신청서를 받지 않습니다.</p>
              </div>
            ) : surveyMine ? (
              <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-10 text-center">
                <div className="w-14 h-14 esp-cut-sm bg-[#00e07b]/10 border border-[#00e07b]/30 flex items-center justify-center mx-auto mb-5">
                  <svg className="w-7 h-7 text-[#00e07b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
                </div>
                <p className="text-[10px] font-black esp-mono text-[#00e07b] mb-2">REGISTERED</p>
                <h3 className="text-lg font-black text-white mb-2">참가 신청이 접수되었습니다</h3>
                <p className="text-sm text-gray-400 mb-8">한 대회당 한 번만 신청할 수 있습니다.<br />수정이 필요하면 운영진에게 문의해주세요.</p>
                <div className="text-left max-w-md mx-auto border-t border-white/[0.08]">
                  {(surveyMine.answers || []).map((a: any, i: number) => (
                    <div key={i} className="py-3.5 border-b border-white/[0.08] flex gap-3">
                      <span className="shrink-0 text-[10px] font-black esp-mono text-gray-700 mt-0.5">{String(i + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-gray-500 mb-1">{a.label}</p>
                        <p className="text-sm text-gray-100 whitespace-pre-wrap break-words">{Array.isArray(a.value) ? (a.value.join(", ") || "-") : (a.value || "-")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-8">
                {(surveyTarget.survey?.questions || []).length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-16">등록된 문항이 없습니다.</p>
                )}
                {(() => { let n = 0; return (surveyTarget.survey?.questions || []).map((q: any) => {
                  const v = surveyAnswers[q.qid];
                  const setV = (val: any) => setSurveyAnswers((p) => ({ ...p, [q.qid]: val }));
                  // 밑줄형 입력 — 박스 대신 선으로
                  const inputCls = "w-full bg-transparent border-b border-white/12 focus:border-[#00e07b] px-0.5 py-2.5 text-base text-white placeholder-gray-600 outline-none transition-colors";
                  const filled = q.type === "multi" ? Array.isArray(v) && v.length > 0 : !!v;

                  // 📌 설명 전용 블록 — 입력칸 없이 안내만
                  if (q.type === "note") {
                    return (
                      <div key={q.qid} className="py-5 border-b border-white/[0.07] last:border-b-0">
                        <div className="border-l-2 border-[#00e07b]/60 pl-4">
                          {q.label && <p className="text-sm sm:text-base font-black text-white mb-1.5 break-keep">{q.label}</p>}
                          {q.desc && <p className="text-[13px] text-gray-400 leading-relaxed whitespace-pre-wrap break-keep">{q.desc}</p>}
                        </div>
                      </div>
                    );
                  }

                  n += 1;
                  const idx = n - 1;
                  return (
                    <div
                      key={q.qid}
                      ref={(el) => { qidRefs.current[q.qid] = el; }}
                      className={`py-6 border-b border-white/[0.07] last:border-b-0 transition-[box-shadow] duration-300 ${invalidQid === q.qid ? "esp-shake" : ""}`}
                      style={invalidQid === q.qid ? { boxShadow: "inset 3px 0 0 0 #ff3b5c" } : undefined}
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <span className={`shrink-0 mt-0.5 text-[11px] font-black esp-mono transition-colors ${filled ? "text-[#00e07b]" : invalidQid === q.qid ? "text-[#ff3b5c]" : "text-gray-700"}`}>{String(idx + 1).padStart(2, "0")}</span>
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-bold text-white leading-snug break-keep">
                            {q.label}
                            {q.required && <span className="text-red-400 ml-1">*</span>}
                          </p>
                          {q.desc && <p className="text-xs text-gray-500 mt-1.5 leading-relaxed whitespace-pre-wrap break-keep">{q.desc}</p>}
                        </div>
                      </div>

                      <div className="pl-0 sm:pl-7">
                        {q.type === "short" && (
                          <input value={v || ""} onChange={(e) => setV(e.target.value)} placeholder="답변을 입력해주세요" className={inputCls} />
                        )}
                        {q.type === "long" && (
                          <textarea value={v || ""} onChange={(e) => setV(e.target.value)} placeholder="답변을 입력해주세요" rows={4} className={`${inputCls} resize-none leading-relaxed`} />
                        )}
                        {(q.type === "single" || q.type === "multi") && (
                          <div className="border-t border-white/[0.07]">
                            {(q.options || []).map((opt: string, oi: number) => {
                              const checked = q.type === "multi" ? Array.isArray(v) && v.includes(opt) : v === opt;
                              return (
                                <button
                                  key={oi}
                                  type="button"
                                  onClick={() => {
                                    if (q.type === "multi") {
                                      const cur: string[] = Array.isArray(v) ? [...v] : [];
                                      setV(checked ? cur.filter((x) => x !== opt) : [...cur, opt]);
                                    } else setV(opt);
                                  }}
                                  className={`w-full flex items-center gap-3 text-left px-1 py-3 border-b border-white/[0.07] transition-colors active:scale-[0.99] ${checked ? "bg-[#00e07b]/[0.09]" : "hover:bg-white/[0.03]"}`}
                                >
                                  <span key={checked ? "on" : "off"} className={`shrink-0 w-4 h-4 border-2 flex items-center justify-center transition-colors ${checked ? "esp-pop" : ""} ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"} ${checked ? "border-[#00e07b] bg-[#00e07b]" : "border-gray-600"}`}>
                                    {checked && <svg className="w-2.5 h-2.5 text-[#101010]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                                  </span>
                                  <span className={`text-sm break-keep ${checked ? "text-white font-bold" : "text-gray-300"}`}>{opt}</span>
                                </button>
                              );
                            })}
                            {q.etc && (() => {
                              const etcChecked = q.type === "multi" ? Array.isArray(v) && v.includes("__etc__") : v === "__etc__";
                              return (
                                <div className={`border-b border-white/[0.07] transition-colors ${etcChecked ? "bg-[#00e07b]/[0.09]" : ""}`}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (q.type === "multi") {
                                        const cur: string[] = Array.isArray(v) ? [...v] : [];
                                        setV(etcChecked ? cur.filter((x) => x !== "__etc__") : [...cur, "__etc__"]);
                                      } else setV("__etc__");
                                    }}
                                    className="w-full flex items-center gap-3 text-left px-1 py-3 active:scale-[0.99] transition-transform"
                                  >
                                    <span key={etcChecked ? "on" : "off"} className={`shrink-0 w-4 h-4 border-2 flex items-center justify-center transition-colors ${etcChecked ? "esp-pop" : ""} ${q.type === "multi" ? "rounded-[4px]" : "rounded-full"} ${etcChecked ? "border-[#00e07b] bg-[#00e07b]" : "border-gray-600"}`}>
                                      {etcChecked && <svg className="w-2.5 h-2.5 text-[#101010]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>}
                                    </span>
                                    <span className={`text-sm ${etcChecked ? "text-white font-bold" : "text-gray-300"}`}>기타 (직접 입력)</span>
                                  </button>
                                  {etcChecked && (
                                    <div className="pl-8 pr-1 pb-3">
                                      <input
                                        value={surveyEtc[q.qid] || ""}
                                        onChange={(e) => setSurveyEtc((p) => ({ ...p, [q.qid]: e.target.value }))}
                                        placeholder="직접 입력해주세요"
                                        className="w-full bg-transparent border-b border-white/15 focus:border-[#00e07b] px-0.5 py-2 text-base text-white placeholder-gray-600 outline-none transition-colors"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }); })()}
              </div>
            )}

            {/* 하단 */}
            <div className="shrink-0 px-5 sm:px-8 py-4 border-t border-white/[0.08] bg-[#080808] flex gap-3">
              <button onClick={() => setSurveyTarget(null)} className="px-6 py-3.5 esp-cut-sm font-black text-sm bg-white/5 hover:bg-white/10 text-gray-300 transition-colors">닫기</button>
              {!surveyMine && !surveyTarget.survey?.closed && (
                <button
                  onClick={submitSurvey}
                  disabled={surveySubmitting}
                  className="flex-1 py-3.5 esp-cut-sm font-black text-sm bg-[#00e07b] hover:bg-[#3dffa6] disabled:opacity-50 disabled:cursor-not-allowed text-[#04120b] transition-colors active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {surveySubmitting ? "제출 중…" : "참가 신청서 제출"}
                  {!surveySubmitting && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>}
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overlay-in">
          <div className={`esp-cut border bg-[#0b0b0b] w-full max-w-sm p-8 text-center shadow-2xl ${popup.isError ? "border-red-500/30" : "border-[#00e07b]/30"}`}>
            <p className={`text-[10px] font-black esp-mono mb-2 ${popup.isError ? "text-red-400" : "text-[#00e07b]"}`}>{popup.isError ? "ERROR" : "COMPLETE"}</p>
            <h2 className="text-xl font-black text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 whitespace-pre-line">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className={`w-full py-3 font-black esp-cut-sm transition-colors ${popup.isError ? "bg-white/5 hover:bg-white/10 text-white" : "bg-[#00e07b] hover:bg-[#3dffa6] text-[#04120b]"}`}>확인</button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
