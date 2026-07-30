"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];
const GOLD = "#d4af37";

// 여러 명(팀 로스터)의 디스코드 ID 파싱 — 쉼표/공백/줄바꿈 구분
const parseIds = (s: string): string[] =>
  (s || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

export default function HallOfFamePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [champions, setChampions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/honors?id=${deleteTarget._id}`, { method: "DELETE" });
      if (res.ok) setChampions((prev) => prev.filter((c) => c._id !== deleteTarget._id));
    } catch {}
    setDeleteTarget(null);
  };

  const executeEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/honors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget._id,
          category: editTarget.category,
          title: editTarget.title,
          winner: editTarget.winner,
          winnerId: editTarget.winnerId,
          detail: editTarget.detail,
          dateLabel: editTarget.dateLabel,
        }),
      });
      if (res.ok) {
        setChampions((prev) => prev.map((c) => (c._id === editTarget._id ? { ...c, ...editTarget } : c)));
        setEditTarget(null);
        parseIds(editTarget.winnerId).forEach((id) => fetchProfile(id));
      }
    } catch {}
    setIsSaving(false);
  };

  const fetchProfile = (id: string) => {
    if (!id || profiles[id]) return;
    fetch(`/api/discord-user?id=${id}`)
      .then((r) => r.json())
      .then((u) => { if (u.success) setProfiles((prev) => ({ ...prev, [id]: u })); })
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/posts?category=대회", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/honors", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([tn, hn]) => {
        const posts = Array.isArray(tn?.data) ? tn.data : [];
        const fromTournaments = posts
          .filter((p: any) => p.tournamentStatus === "종료됨" && p.tournamentWinner?.trim())
          .map((p: any) => ({
            _id: p._id, category: p.tournamentGame || "TOURNAMENT", title: p.title,
            winner: p.tournamentWinner, winnerId: p.tournamentWinnerId || "",
            detail: p.tournamentPrize || "", dateLabel: p.tournamentDate || "", createdAt: p.createdAt, source: "tournament",
          }));
        const manual = (Array.isArray(hn?.data) ? hn.data : []).map((h: any) => ({
          _id: h._id, category: h.category || "기타", title: h.title,
          winner: h.winner, winnerId: h.winnerId || "",
          detail: h.detail || "", dateLabel: h.dateLabel || "", createdAt: h.createdAt, source: "manual",
        }));
        const merged = [...fromTournaments, ...manual].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setChampions(merged);

        const ids = Array.from(new Set(merged.flatMap((c: any) => parseIds(c.winnerId))));
        ids.forEach((id) => fetchProfile(id));
      })
      .finally(() => setIsLoading(false));
  }, []);

  const getYears = (c: any): [string, string | null] => {
    const years = Array.from(new Set((c.dateLabel || "").match(/20\d{2}/g) || [])).map(Number).sort();
    if (years.length >= 2) return [`${years[0]}`, `${years[years.length - 1]}`];
    if (years.length === 1) return [`${years[0]}`, null];
    return [`${new Date(c.createdAt).getFullYear()}`, null];
  };

  // ── 팀원 로스터 (한 명 한 명 아바타+이름 칩으로, 컴팩트) ──
  const Roster = ({ c }: { c: any }) => {
    const ids = parseIds(c.winnerId);
    const ready = ids.filter((id) => profiles[id]);
    if (ready.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const p = profiles[id];
          if (!p) return null;
          return (
            <div key={id} className="flex items-center gap-1.5 bg-white/[0.04] border border-white/10 rounded-full pl-1 pr-2.5 py-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.avatarUrl} alt={p.globalName} className="w-5 h-5 rounded-full bg-gray-800 object-cover" style={{ boxShadow: `0 0 0 1px ${GOLD}99` }} />
              <span className="text-[11px] font-bold text-gray-200 truncate max-w-[100px]">{p.globalName}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const AdminBtns = ({ c }: { c: any }) => (
    isAdmin ? (
      <div className="flex gap-1.5">
        {c.source === "manual" ? (
          <>
            <button onClick={() => setEditTarget({ ...c })} className="text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">수정</button>
            <button onClick={() => setDeleteTarget(c)} className="text-[10px] font-bold text-red-500/70 hover:text-red-500 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">삭제</button>
          </>
        ) : (
          <button onClick={() => router.push(`/write?id=${c._id}`)} className="text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-md">대회 글에서 수정</button>
        )}
      </div>
    ) : null
  );

  return (
    <main className="w-full flex-1 flex flex-col relative bg-[#080808]">
      <LuxStyles />

      {/* ── 웅장한 히어로 (골드 프레스티지) ── */}
      <section className="relative w-full pt-20 pb-12 md:pt-28 md:pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none opacity-60"></div>
        <div className="absolute top-[-160px] left-1/2 -translate-x-1/2 w-[720px] h-[360px] rounded-full pointer-events-none" style={{ background: `${GOLD}12`, filter: "blur(130px)" }}></div>
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }}></div>
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <Reveal>
            {/* 월계관 엠블럼 */}
            <div className="flex justify-center mb-6">
              <svg viewBox="0 0 120 120" className="w-16 h-16 md:w-20 md:h-20" fill="none">
                <path d="M40 30c-14 8-20 26-14 44 3 9 9 16 16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                <path d="M80 30c14 8 20 26 14 44-3 9-9 16-16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                <path d="M60 24l4.6 9.3 10.3 1.5-7.4 7.3L73 52 60 47l-13 5 5.5-9.9-7.4-7.3 10.3-1.5z" fill={GOLD} />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
              <span className="text-[10px] font-black tracking-[0.5em] uppercase" style={{ color: GOLD }}>Hall of Fame · Est.</span>
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-5">
              <span className="text-white">명예의 </span>
              <span style={{ color: GOLD, textShadow: `0 0 40px ${GOLD}55` }}>전당</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 역사를 기록합니다.</p>
            {champions.length > 0 && (
              <div className="inline-flex items-center gap-6 mt-8 px-6 py-3 rounded-full border" style={{ borderColor: `${GOLD}33`, background: `${GOLD}08` }}>
                <div className="text-center">
                  <p className="text-xl font-black text-white leading-none">{champions.length}</p>
                  <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase mt-1">기록</p>
                </div>
                <div className="w-px h-8 bg-white/10"></div>
                <div className="text-center">
                  <p className="text-xl font-black leading-none" style={{ color: GOLD }}>{getYears(champions[champions.length - 1])[0]}</p>
                  <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase mt-1">Since</p>
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-20 flex-1 flex flex-col">
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div>
        ) : champions.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-6">🏆</p>
            <p className="text-white font-black text-lg mb-2">아직 기록된 챔피언이 없습니다</p>
            <p className="text-gray-500 text-sm mb-8">역사의 첫 페이지가 당신을 기다립니다.</p>
            <Link href="/tournament" className="inline-block px-8 py-3.5 text-white text-sm font-bold rounded-full transition-colors" style={{ background: GOLD, color: "#111" }}>진행 중인 대회 보기</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {champions.map((c, idx) => {
              const [sy, ey] = getYears(c);
              const latest = idx === 0;
              return (
                <Reveal key={c._id} delay={Math.min(idx, 6) * 60}>
                  <div className="rounded-2xl border p-5 md:p-6 transition-colors hover:border-white/20" style={{ borderColor: latest ? `${GOLD}44` : "rgba(255,255,255,0.10)", background: latest ? `${GOLD}0d` : "rgba(17,17,17,0.7)" }}>
                    {/* 헤더 — 연도 · 분류 · (현 챔피언) */}
                    <div className="flex items-center gap-2.5 mb-3">
                      <span className="text-lg md:text-xl font-black tracking-tighter" style={{ color: latest ? GOLD : "#8f8256" }}>{ey ? `${sy}–${ey}` : sy}</span>
                      <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase truncate">{c.category}</span>
                      {latest && <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0" style={{ background: `${GOLD}1f`, color: GOLD }}>현 챔피언</span>}
                      <span className="ml-auto shrink-0"><AdminBtns c={c} /></span>
                    </div>
                    <h3 className="text-base md:text-lg font-black text-white tracking-tight mb-4 break-keep">{c.title}</h3>
                    {/* 챔피언(팀명) + 팀원 로스터 */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pt-4 border-t border-white/[0.07]">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" fill={GOLD}><path d="M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.3L12 15l-4.7 2.4.9-5.3L4.3 7.6l5.3-.8z" /></svg>
                          <span className="text-[9px] font-black tracking-[0.25em] uppercase shrink-0" style={{ color: GOLD }}>Champion</span>
                          <span className="text-sm md:text-base font-black text-white truncate">{c.winner}</span>
                        </div>
                        <Roster c={c} />
                      </div>
                      {c.detail && <p className="text-[11px] text-gray-500 shrink-0 sm:text-right sm:max-w-[45%] break-keep">🏆 {c.detail}</p>}
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>

      {/* 📌 관리자 — 수동 기록 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <form onSubmit={executeEdit} className="bg-gradient-to-b from-[#1c1c1c] to-[#121212] border border-white/10 rounded-3xl w-full max-w-md p-8 shadow-2xl max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <h2 className="text-xl font-bold text-white mb-6">기록 수정</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">분류</label>
                <div className="flex flex-wrap gap-2">
                  {["SYSTEM : LEVEL", "대회", "이벤트", "기타"].map((cat) => (
                    <button type="button" key={cat} onClick={() => setEditTarget({ ...editTarget, category: cat })} className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all ${editTarget.category === cat ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{cat}</button>
                  ))}
                </div>
              </div>
              {[
                { label: "기록 제목", key: "title", required: true },
                { label: "우승자 / 팀명", key: "winner", required: true },
                { label: "부가 설명", key: "detail", required: false },
                { label: "표시 기간", key: "dateLabel", required: false },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-gray-500 mb-2">{f.label}{f.required && <span className="text-[#e91e3f]"> *</span>}</label>
                  <input type="text" required={f.required} value={editTarget[f.key] || ""} onChange={(e) => setEditTarget({ ...editTarget, [f.key]: e.target.value })} className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors" />
                </div>
              ))}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">우승자 디스코드 ID <span className="text-gray-600 font-medium">— 여러 명이면 쉼표(,)로 구분</span></label>
                <textarea rows={2} value={editTarget.winnerId || ""} onChange={(e) => setEditTarget({ ...editTarget, winnerId: e.target.value })} placeholder="예: 1104..., 2205..., 3306..." className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors resize-none leading-relaxed" />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button type="button" onClick={() => setEditTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button>
              <button type="submit" disabled={isSaving} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">{isSaving ? "저장 중..." : "저장"}</button>
            </div>
          </form>
        </div>
      )}

      {/* 📌 관리자 — 삭제 확인 모달 */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8"><span className="text-white font-bold">{deleteTarget.title}</span> 기록을<br />명예의 전당에서 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
