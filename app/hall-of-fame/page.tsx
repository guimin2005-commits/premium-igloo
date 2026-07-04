"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];

export default function HallOfFamePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [champions, setChampions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 📌 디스코드 ID → 프로필 캐시 { [id]: { avatarUrl, globalName, username } }
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  // 📌 관리자 수정/삭제 상태 (수동 기록 전용)
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
      }
    } catch {}
    setIsSaving(false);
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
            _id: p._id,
            category: p.tournamentGame || "TOURNAMENT",
            title: p.title,
            winner: p.tournamentWinner,
            winnerId: p.tournamentWinnerId || "",
            detail: p.tournamentPrize || "",
            dateLabel: p.tournamentDate || "",
            createdAt: p.createdAt,
            source: "tournament",
          }));

        const manual = (Array.isArray(hn?.data) ? hn.data : []).map((h: any) => ({
          _id: h._id,
          category: h.category || "기타",
          title: h.title,
          winner: h.winner,
          winnerId: h.winnerId || "",
          detail: h.detail || "",
          dateLabel: h.dateLabel || "",
          createdAt: h.createdAt,
          source: "manual",
        }));

        const merged = [...fromTournaments, ...manual].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setChampions(merged);

        // 📌 디스코드 ID가 있는 기록들의 프로필 조회
        const ids = Array.from(new Set(merged.map((c: any) => c.winnerId).filter(Boolean)));
        ids.forEach((id: any) => {
          fetch(`/api/discord-user?id=${id}`)
            .then((r) => r.json())
            .then((u) => {
              if (u.success) setProfiles((prev) => ({ ...prev, [id]: u }));
            })
            .catch(() => {});
        });
      })
      .finally(() => setIsLoading(false));
  }, []);

  const formatYear = (d: string) => new Date(d).getFullYear();

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Hall of Fame</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">명예의 </span><span className="lux-shimmer">전당</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 역사를 기록합니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 py-10 flex-1 flex flex-col">
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div>
        ) : champions.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-6">🏆</p>
            <p className="text-white font-black text-lg mb-2">아직 기록된 우승자가 없습니다</p>
            <p className="text-gray-500 text-sm mb-8">첫 번째 챔피언의 자리가 비어 있습니다. 대회에 도전해 보세요!</p>
            <Link href="/tournament" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors shadow-[0_8px_24px_rgba(233,30,63,0.3)]">진행 중인 대회 보기</Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {champions.map((c, idx) => (
              <Reveal key={c._id} delay={Math.min(idx, 5) * 90}>
                <div className="py-8 md:py-10 flex flex-col md:flex-row md:items-center gap-4 md:gap-10 group">
                  {/* 연도 + 순번 */}
                  <div className="shrink-0 md:w-28">
                    <p className="text-3xl md:text-4xl font-black text-white/[0.08] group-hover:text-[#e91e3f]/25 transition-colors duration-500 leading-none tracking-tighter select-none">{formatYear(c.createdAt)}</p>
                  </div>

                  {/* 기록 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <p className="text-[10px] font-black tracking-[0.25em] text-gray-600 uppercase">{c.category}</p>
                      {isAdmin && (
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {c.source === "manual" ? (
                            <>
                              <button onClick={() => setEditTarget({ ...c })} className="text-[10px] font-bold text-gray-500 hover:text-white bg-white/5 px-2 py-0.5 rounded">수정</button>
                              <button onClick={() => setDeleteTarget(c)} className="text-[10px] font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-2 py-0.5 rounded">삭제</button>
                            </>
                          ) : (
                            <button onClick={() => router.push(`/write?id=${c._id}`)} className="text-[10px] font-bold text-gray-500 hover:text-white bg-white/5 px-2 py-0.5 rounded">대회 글에서 수정</button>
                          )}
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg md:text-xl font-black text-white tracking-tight mb-1 group-hover:text-[#ff5c77] transition-colors">{c.title}</h3>
                    {c.dateLabel && <p className="text-xs text-gray-500">{c.dateLabel}</p>}
                  </div>

                  {/* 우승자 — 디스코드 ID가 있으면 실제 프로필(아바타+이름) 표시 */}
                  <div className="shrink-0 md:text-right">
                    <p className="text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-2">🏆 Champion</p>
                    {c.winnerId && profiles[c.winnerId] ? (
                      <div className="flex items-center gap-3 md:flex-row-reverse">
                        <div className="relative shrink-0">
                          <div className="absolute -inset-1 bg-[#e91e3f]/20 blur-md rounded-full pointer-events-none"></div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={profiles[c.winnerId].avatarUrl} alt={profiles[c.winnerId].globalName} className="relative w-11 h-11 md:w-12 md:h-12 rounded-full bg-gray-800 ring-2 ring-[#e91e3f]/50 ring-offset-2 ring-offset-[#090909]" />
                        </div>
                        <div className="min-w-0 md:text-right">
                          <p className="text-lg md:text-xl font-black text-[#e91e3f] tracking-tight leading-tight truncate">{profiles[c.winnerId].globalName}</p>
                          <p className="text-[10px] text-gray-500 font-medium truncate">@{profiles[c.winnerId].username}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xl md:text-2xl font-black text-[#e91e3f] tracking-tight">{c.winner}</p>
                    )}
                    {c.detail && <p className="text-[11px] text-gray-500 mt-1.5">{c.detail}</p>}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>

      {/* 📌 관리자 — 수동 기록 수정 모달 */}
      {editTarget && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <form onSubmit={executeEdit} className="bg-gradient-to-b from-[#1c1c1c] to-[#121212] border border-white/10 rounded-3xl ring-1 ring-white/5 w-full max-w-md p-8 shadow-2xl max-h-[85vh] overflow-y-auto [&::-webkit-scrollbar]:hidden">
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
                { label: "우승자 / 1등", key: "winner", required: true },
                { label: "우승자 디스코드 ID", key: "winnerId", required: false },
                { label: "부가 설명", key: "detail", required: false },
                { label: "표시 기간", key: "dateLabel", required: false },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-bold text-gray-500 mb-2">{f.label}{f.required && <span className="text-[#e91e3f]"> *</span>}</label>
                  <input
                    type="text"
                    required={f.required}
                    value={editTarget[f.key] || ""}
                    onChange={(e) => setEditTarget({ ...editTarget, [f.key]: e.target.value })}
                    className="w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors"
                  />
                </div>
              ))}
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
            <p className="text-sm text-gray-400 mb-8"><span className="text-white font-bold">{deleteTarget.title}</span> 기록을<br/>명예의 전당에서 삭제하시겠습니까?</p>
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
