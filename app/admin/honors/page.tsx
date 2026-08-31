"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";
import { DiscordIdInput, parseIds, useDiscordProfiles } from "../../components/DiscordIds";
import { ADMIN_USERS } from "@/lib/admins";
import { HONOR_CATEGORIES } from "@/lib/honors";

/* 📌 명예의 전당 관리 — 등재·수정·삭제를 이 한 곳에서 처리한다.
   (예전에는 공개 페이지 위에서 수정·삭제를 했는데, 관리 동선이 두 군데로 갈라져 있었다) */

type Honor = { _id: string; category: string; title: string; winner: string; winnerId: string; detail: string; dateLabel: string; createdAt?: string };
type TournamentRow = { _id: string; title: string; game: string; winner: string; winnerId: string; dateLabel: string; prize: string; status: string };

const EMPTY: Omit<Honor, "_id"> = { category: "SYSTEM : LEVEL", title: "", winner: "", winnerId: "", detail: "", dateLabel: "" };

export default function AdminHonorsPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [honors, setHonors] = useState<Honor[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<"manual" | "tournament">("manual");
  const [query, setQuery] = useState("");

  const [form, setForm] = useState<{ mode: "create" | "edit"; data: any } | null>(null);
  const [winnerEdit, setWinnerEdit] = useState<TournamentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Honor | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const { profiles, load } = useDiscordProfiles();

  // ── 소리 (짧은 신스 톤) ──
  const audioCtx = useRef<AudioContext | null>(null);
  const playTone = useCallback((freq: number, dur = 0.09, gainBase = 0.035, type: OscillatorType = "sine") => {
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gainBase, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);
  const sfxOk = useCallback(() => { [523, 659, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.11, 0.035), i * 85)); }, [playTone]);
  const sfxErr = useCallback(() => { playTone(300, 0.14, 0.04, "square"); setTimeout(() => playTone(220, 0.2, 0.04, "square"), 130); }, [playTone]);

  const toastTimer = useRef<any>(null);
  const notify = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    error ? sfxErr() : sfxOk();
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, [sfxOk, sfxErr]);

  // ── 불러오기 ──
  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/honors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/posts?category=대회&all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([hn, tn]) => {
        const h: Honor[] = (Array.isArray(hn?.data) ? hn.data : []).map((x: any) => ({
          _id: x._id, category: x.category || "기타", title: x.title || "", winner: x.winner || "",
          winnerId: x.winnerId || "", detail: x.detail || "", dateLabel: x.dateLabel || "", createdAt: x.createdAt,
        }));
        const t: TournamentRow[] = (Array.isArray(tn?.data) ? tn.data : [])
          .filter((p: any) => p.tournamentStatus === "종료됨")
          .map((p: any) => ({
            _id: p._id, title: p.title || "", game: p.tournamentGame || "", winner: p.tournamentWinner || "",
            winnerId: p.tournamentWinnerId || "", dateLabel: p.tournamentDate || "", prize: p.tournamentPrize || "", status: p.tournamentStatus,
          }));
        setHonors(h);
        setTournaments(t);
        load(Array.from(new Set([...h, ...t].flatMap((r) => parseIds(r.winnerId)))));
      })
      .finally(() => setIsLoading(false));
  }, [load]);

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 저장 ──
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || isSaving) return;
    if (!form.data.title?.trim() || !form.data.winner?.trim()) { notify("기록 제목과 우승자는 필수입니다.", true); return; }
    setIsSaving(true);
    try {
      const creating = form.mode === "create";
      // _id·createdAt까지 함께 보내면 몽고가 불변 필드 수정으로 보고 막는다 — 입력 필드만 추린다
      const fields = {
        category: form.data.category, title: form.data.title.trim(), winner: form.data.winner.trim(),
        winnerId: form.data.winnerId || "", detail: form.data.detail || "", dateLabel: form.data.dateLabel || "",
      };
      const res = await fetch("/api/honors", {
        method: creating ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? fields : { id: form.data._id, ...fields }),
      });
      if (res.ok) {
        setForm(null);
        fetchAll();
        notify(creating ? "명예의 전당에 등재되었습니다." : "기록이 수정되었습니다.");
      } else {
        notify(creating ? "등재에 실패했습니다." : "수정에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const submitWinner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!winnerEdit || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/posts/${winnerEdit._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentWinner: winnerEdit.winner, tournamentWinnerId: winnerEdit.winnerId }),
      });
      if (res.ok) {
        setTournaments((prev) => prev.map((t) => (t._id === winnerEdit._id ? winnerEdit : t)));
        load(parseIds(winnerEdit.winnerId));
        setWinnerEdit(null);
        notify("대회 우승 정보가 수정되었습니다.");
      } else {
        notify("수정에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/honors?id=${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) {
        setHonors((prev) => prev.filter((h) => h._id !== deleteTarget._id));
        notify("기록이 삭제되었습니다.");
      } else {
        notify("삭제에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setDeleteTarget(null);
    }
  };

  // ── 검색 ──
  const match = (s: string) => s.toLowerCase().includes(query.trim().toLowerCase());
  const manualRows = useMemo(
    () => (!query.trim() ? honors : honors.filter((h) => match(h.title) || match(h.winner) || match(h.category) || match(h.detail))),
    [honors, query]
  );
  const tournamentRows = useMemo(
    () => (!query.trim() ? tournaments : tournaments.filter((t) => match(t.title) || match(t.winner) || match(t.game))),
    [tournaments, query]
  );
  const missingWinner = tournaments.filter((t) => !t.winner.trim()).length;

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-[#8a8a8a]">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-[#131313] mb-2">권한 없음</h2>
        <p className="text-[#5a5a5a] text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const Members = ({ ids }: { ids: string }) => {
    const list = parseIds(ids).map((id) => profiles[id]).filter((p) => p && !p.failed);
    if (list.length === 0) return null;
    return (
      <span className="inline-flex -space-x-2 align-middle shrink-0">
        {list.slice(0, 5).map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={p.avatarUrl} alt={p.globalName} title={p.globalName} className="w-6 h-6 rounded-full bg-gray-800 object-cover ring-2 ring-[#efece7]" />
        ))}
        {list.length > 5 && <span className="w-6 h-6 rounded-full bg-black/10 ring-2 ring-[#efece7] grid place-items-center text-[9px] font-bold text-[#4b4b4b]">+{list.length - 5}</span>}
      </span>
    );
  };

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-8 md:pt-20 md:pb-10 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Admin · Hall of Fame</span>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-3">
                  <span className="text-[#131313]">명예의 전당 </span><span className="text-[#e91e3f]">관리</span>
                </h1>
                <p className="text-[#5a5a5a] text-sm leading-relaxed">기록 등재·수정·삭제를 이곳에서 처리합니다. 대회 우승은 대회 글의 우승팀 정보를 그대로 가져옵니다.</p>
              </div>
              <Link href="/hall-of-fame" className="shrink-0 text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] border border-black/12 hover:border-black/30 px-3.5 py-2 rounded-full transition-colors">공개 페이지 보기 ↗</Link>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-16 flex-1 flex flex-col">
        {/* ── 요약 ── */}
        <Reveal>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[
              { label: "전체 기록", value: honors.length + tournaments.filter((t) => t.winner.trim()).length },
              { label: "수동 기록", value: honors.length },
              { label: "대회 우승", value: tournaments.filter((t) => t.winner.trim()).length },
              { label: "우승자 미기재", value: missingWinner, warn: missingWinner > 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-black/[0.07] bg-black/[0.02] px-4 py-3.5">
                <p className="text-[10px] font-black tracking-[0.2em] text-[#8a8a8a] uppercase mb-1.5">{s.label}</p>
                <p className={`text-2xl font-black tabular-nums ${s.warn ? "text-[#e91e3f]" : "text-[#131313]"}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </Reveal>

        {/* ── 탭 + 도구 막대 ── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div className="inline-flex p-1 rounded-full bg-black/[0.04] border border-black/[0.07] self-start">
            {([
              { key: "manual", label: "수동 기록", count: honors.length },
              { key: "tournament", label: "대회 우승", count: tournaments.length },
            ] as const).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-full text-xs font-bold transition-colors ${tab === t.key ? "bg-[#e91e3f] text-white" : "text-[#5a5a5a] hover:text-[#131313]"}`}
              >
                {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="제목·우승자 검색"
              className="flex-1 md:w-56 bg-[#ffffff] border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#a3a3a3]"
            />
            {tab === "manual" && (
              <button
                onClick={() => setForm({ mode: "create", data: { ...EMPTY } })}
                className="shrink-0 px-4 py-2.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20"
              >
                + 새 기록 등재
              </button>
            )}
          </div>
        </div>

        {/* ── 목록 ── */}
        {isLoading ? (
          <div className="text-center py-16 text-[#8a8a8a] text-sm">불러오는 중...</div>
        ) : tab === "manual" ? (
          manualRows.length === 0 ? (
            <EmptyBox text={query.trim() ? "검색 결과가 없습니다." : "등재된 수동 기록이 없습니다."} />
          ) : (
            <div className="rounded-2xl border border-black/[0.07] overflow-hidden divide-y divide-black/[0.06]">
              {manualRows.map((h) => (
                <div key={h._id} className="flex flex-col md:flex-row md:items-center gap-3 px-4 md:px-5 py-4 hover:bg-black/[0.02] transition-colors">
                  <span className="shrink-0 self-start text-[9px] font-black tracking-wider bg-black/5 text-[#4b4b4b] border border-black/10 px-2.5 py-1 rounded-full">{h.category}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Members ids={h.winnerId} />
                      <p className="text-sm font-bold text-[#131313] truncate">{h.winner}</p>
                    </div>
                    <p className="text-xs text-[#8a8a8a] truncate mt-1">
                      {h.title}{h.detail ? ` · ${h.detail}` : ""}{h.dateLabel ? ` · ${h.dateLabel}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setForm({ mode: "edit", data: { ...h } })} className="text-xs font-bold text-[#4b4b4b] hover:text-[#131313] bg-black/5 hover:bg-black/10 border border-black/10 px-3 py-1.5 rounded-lg transition-colors">수정</button>
                    <button onClick={() => setDeleteTarget(h)} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] bg-black/5 hover:bg-black/10 border border-black/10 px-3 py-1.5 rounded-lg transition-colors">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tournamentRows.length === 0 ? (
          <EmptyBox text={query.trim() ? "검색 결과가 없습니다." : "종료된 대회가 없습니다."} />
        ) : (
          <div className="rounded-2xl border border-black/[0.07] overflow-hidden divide-y divide-black/[0.06]">
            {tournamentRows.map((t) => (
              <div key={t._id} className="flex flex-col md:flex-row md:items-center gap-3 px-4 md:px-5 py-4 hover:bg-black/[0.02] transition-colors">
                <span className="shrink-0 self-start text-[9px] font-black tracking-wider bg-black/5 text-[#4b4b4b] border border-black/10 px-2.5 py-1 rounded-full truncate max-w-[10rem]">{t.game || "대회"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Members ids={t.winnerId} />
                    {t.winner.trim() ? (
                      <p className="text-sm font-bold text-[#131313] truncate">{t.winner}</p>
                    ) : (
                      <p className="text-sm font-bold text-[#e91e3f]">우승자 미기재</p>
                    )}
                  </div>
                  <p className="text-xs text-[#8a8a8a] truncate mt-1">{t.title}{t.dateLabel ? ` · ${t.dateLabel}` : ""}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setWinnerEdit({ ...t })} className="text-xs font-bold text-[#4b4b4b] hover:text-[#131313] bg-black/5 hover:bg-black/10 border border-black/10 px-3 py-1.5 rounded-lg transition-colors">우승 정보 수정</button>
                  <Link href={`/write?id=${t._id}`} className="text-xs font-bold text-[#5a5a5a] hover:text-[#131313] bg-black/5 hover:bg-black/10 border border-black/10 px-3 py-1.5 rounded-lg transition-colors">대회 글 ↗</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[#a3a3a3] mt-4 leading-relaxed">
          {tab === "manual"
            ? "수동 기록은 SYSTEM : LEVEL 시즌 1등, 이벤트 우승 등 대회 외 기록을 위한 항목입니다."
            : "대회 우승은 대회 글에 저장된 값이라 이곳에서 우승팀·우승자만 고쳐도 공개 페이지에 그대로 반영됩니다."}
        </p>
      </div>

      {/* 📌 등재 / 수정 모달 */}
      {form && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <form onSubmit={submitForm} className="bg-gradient-to-b from-[#1c1c1c] to-[#ffffff] border border-black/10 rounded-3xl w-full max-w-lg p-7 md:p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] max-h-[88vh] overflow-y-auto no-bar">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>
              <h2 className="text-lg font-black text-[#131313]">{form.mode === "create" ? "새 기록 등재" : "기록 수정"}</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8a8a8a] mb-2">분류 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {HONOR_CATEGORIES.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setForm({ ...form, data: { ...form.data, category: c } })}
                      className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all ${form.data.category === c ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-black/10 text-[#5a5a5a] hover:border-black/30"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {[
                { label: "기록 제목", key: "title", required: true, placeholder: "예: LEVEL SEASON 1" },
                { label: "우승자 / 팀명", key: "winner", required: true, placeholder: "예: 팀 이글루 · elahw.06" },
                { label: "표시 기간", key: "dateLabel", required: false, placeholder: "예: 2026.01 ~ 2026.06" },
                { label: "부가 설명", key: "detail", required: false, placeholder: "예: 최종 레벨 512 달성 · 보상 문화상품권 5만원" },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-[#8a8a8a] mb-2">
                    {f.label}
                    {f.required ? <span className="text-[#e91e3f]"> *</span> : <span className="text-[#a3a3a3] font-medium"> (선택)</span>}
                  </label>
                  <input
                    type="text"
                    required={f.required}
                    placeholder={f.placeholder}
                    value={form.data[f.key] || ""}
                    onChange={(e) => setForm({ ...form, data: { ...form.data, [f.key]: e.target.value } })}
                    className="w-full bg-[#ffffff] border border-black/10 rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#a3a3a3]"
                  />
                </div>
              ))}

              <DiscordIdInput
                value={form.data.winnerId || ""}
                onChange={(next) => setForm({ ...form, data: { ...form.data, winnerId: next } })}
                label="우승자 명단"
              />
            </div>

            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => setForm(null)} className="flex-1 py-3 bg-[#e6e3de] hover:bg-[#d6d3ce] text-[#131313] font-bold rounded-xl transition-colors">취소</button>
              <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">
                {isSaving ? "저장 중..." : form.mode === "create" ? "등재" : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 📌 대회 우승 정보 수정 모달 */}
      {winnerEdit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overlay-in">
          <form onSubmit={submitWinner} className="bg-gradient-to-b from-[#1c1c1c] to-[#ffffff] border border-black/10 rounded-3xl w-full max-w-lg p-7 md:p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] max-h-[88vh] overflow-y-auto no-bar">
            <div className="flex items-center gap-3 mb-2">
              <span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>
              <h2 className="text-lg font-black text-[#131313]">대회 우승 정보 수정</h2>
            </div>
            <p className="text-xs text-[#8a8a8a] mb-6 pl-4 truncate">{winnerEdit.title}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#8a8a8a] mb-2">우승팀 / 우승자 <span className="text-[#e91e3f]">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="예: 이글루A"
                  value={winnerEdit.winner}
                  onChange={(e) => setWinnerEdit({ ...winnerEdit, winner: e.target.value })}
                  className="w-full bg-[#ffffff] border border-black/10 rounded-xl px-4 py-3 text-sm text-[#131313] outline-none focus:border-[#e91e3f] transition-colors placeholder:text-[#a3a3a3]"
                />
              </div>
              <DiscordIdInput
                value={winnerEdit.winnerId}
                onChange={(next) => setWinnerEdit({ ...winnerEdit, winnerId: next })}
                label="우승 팀원 명단"
              />
            </div>

            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => setWinnerEdit(null)} className="flex-1 py-3 bg-[#e6e3de] hover:bg-[#d6d3ce] text-[#131313] font-bold rounded-xl transition-colors">취소</button>
              <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">{isSaving ? "저장 중..." : "저장"}</button>
            </div>
          </form>
        </div>
      )}

      {/* 📌 삭제 확인 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#ffffff] border border-[#e91e3f]/25 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-[#131313] mb-3">삭제 확인</h2>
            <p className="text-sm text-[#5a5a5a] mb-8"><span className="text-[#131313] font-bold">{deleteTarget.title}</span> 기록을<br />명예의 전당에서 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-[#e6e3de] hover:bg-[#d6d3ce] text-[#131313] rounded-xl transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 📌 결과 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] px-5 py-3 rounded-full border shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] text-sm font-bold backdrop-blur-sm"
          style={toast.error
            ? { background: "rgba(40,12,16,0.95)", borderColor: "rgba(233,30,63,0.45)", color: "#ffb3c0" }
            : { background: "rgba(14,14,14,0.95)", borderColor: "rgba(0,0,0,0.14)", color: "#ffffff" }}>
          {toast.error ? "⚠ " : "✓ "}{toast.msg}
        </div>
      )}
    </main>
  );
}

const EmptyBox = ({ text }: { text: string }) => (
  <div className="text-center py-14 text-[#5a5a5a] text-sm bg-black/[0.02] rounded-2xl border border-black/[0.06]">{text}</div>
);
