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

      {/* ── 히어로 (골드 프레스티지 제목 · 목록은 절제) ── */}
      <section className="relative w-full pt-20 pb-12 md:pt-28 md:pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none opacity-50"></div>
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[680px] h-[340px] rounded-full pointer-events-none" style={{ background: `${GOLD}10`, filter: "blur(130px)" }}></div>
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }}></div>
        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <Reveal>
            {/* 월계관 엠블럼 */}
            <div className="flex justify-center mb-6">
              <svg viewBox="0 0 120 120" className="w-16 h-16 md:w-[72px] md:h-[72px]" fill="none">
                <path d="M40 30c-14 8-20 26-14 44 3 9 9 16 16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                <path d="M80 30c14 8 20 26 14 44-3 9-9 16-16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                <path d="M60 24l4.6 9.3 10.3 1.5-7.4 7.3L73 52 60 47l-13 5 5.5-9.9-7.4-7.3 10.3-1.5z" fill={GOLD} />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
              <span className="text-[10px] font-black tracking-[0.5em] uppercase" style={{ color: GOLD }}>Hall of Fame</span>
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-5">
              <span className="text-white">명예의 </span>
              {/* 금속판에 새긴 듯한 메탈릭 골드 그라디언트 */}
              <span style={{
                background: "linear-gradient(180deg, #f7e7a0 0%, #d4af37 48%, #8f6f1c 100%)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: `drop-shadow(0 0 28px ${GOLD}40)`,
              }}>전당</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 역사를 기록합니다.</p>
            {/* 정적 오너먼트 — 격식 있는 마침표 */}
            <div className="flex items-center justify-center gap-3 mt-8">
              <span className="h-px w-20" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}59)` }}></span>
              <span className="text-[9px]" style={{ color: `${GOLD}b3` }}>✦</span>
              <span className="h-px w-20" style={{ background: `linear-gradient(270deg, transparent, ${GOLD}59)` }}></span>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-20 flex-1 flex flex-col">
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div>
        ) : champions.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-5xl mb-6">🏆</p>
            <p className="text-white font-black text-lg mb-2">아직 기록된 우승자가 없습니다</p>
            <p className="text-gray-500 text-sm mb-8">역사의 첫 페이지가 당신을 기다립니다.</p>
            <Link href="/tournament" className="inline-block px-8 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-full transition-colors">진행 중인 대회 보기</Link>
          </div>
        ) : (
          <div>
            {/* ── 최신 우승 — 골드 명판(plaque)으로 격상 ── */}
            {(() => {
              const c = champions[0];
              const [sy] = getYears(c);
              const members = parseIds(c.winnerId).map((id) => profiles[id]).filter(Boolean);
              return (
                <Reveal>
                  <div className="relative p-px rounded-3xl mb-14" style={{ background: `linear-gradient(160deg, ${GOLD}66, ${GOLD}14 45%, ${GOLD}4d)` }}>
                    <div className="relative rounded-3xl px-7 py-9 md:px-12 md:py-12 overflow-hidden" style={{ background: "#0b0a06" }}>
                      <div className="absolute -top-24 right-[-70px] w-80 h-52 rounded-full pointer-events-none" style={{ background: `${GOLD}12`, filter: "blur(80px)" }}></div>
                      <span aria-hidden className="absolute -top-3 right-6 text-[120px] md:text-[160px] font-black leading-none select-none pointer-events-none tabular-nums" style={{ color: `${GOLD}0f` }}>{sy}</span>
                      <div className="relative">
                        <div className="flex items-center gap-3 mb-7 min-w-0">
                          <span className="text-[9px] shrink-0" style={{ color: GOLD }}>✦</span>
                          <span className="text-[10px] font-black tracking-[0.4em] uppercase shrink-0" style={{ color: GOLD }}>Latest Champion</span>
                          <span className="text-[10px] font-black tracking-[0.28em] text-gray-600 uppercase truncate">{c.category}</span>
                          <span className="ml-auto shrink-0"><AdminBtns c={c} /></span>
                        </div>

                        <div className="flex items-center gap-5 mb-4 flex-wrap">
                          {members.length > 0 && (
                            <div className="flex -space-x-3.5 shrink-0">
                              {members.map((p, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={p.avatarUrl} alt={p.globalName} title={p.globalName} className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gray-800 object-cover ring-2" style={{ ["--tw-ring-color" as any]: `${GOLD}4d` }} />
                              ))}
                            </div>
                          )}
                          <h3 className="text-4xl md:text-6xl font-black text-white tracking-tight leading-none break-keep" style={{ textShadow: `0 0 44px ${GOLD}33` }}>{c.winner}</h3>
                        </div>

                        {members.length > 0 && (
                          <p className="text-sm md:text-base text-gray-400 font-medium mb-2.5 break-keep">
                            {members.map((p) => p.globalName).join("  ·  ")}
                          </p>
                        )}

                        <p className="text-sm text-gray-500 break-keep">
                          {c.title}
                          {c.detail && <span className="text-gray-600"> — {c.detail}</span>}
                          {c.dateLabel && <span className="text-gray-700"> · {c.dateLabel}</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              );
            })()}

            {/* ── 역대 기록 — 골드 헤어라인 연대기 ── */}
            {champions.length > 1 && (
            <div className="border-t" style={{ borderColor: `${GOLD}26` }}>
              {champions.slice(1).map((c, idx) => {
                const [sy, ey] = getYears(c);
                const members = parseIds(c.winnerId).map((id) => profiles[id]).filter(Boolean);
                return (
                  <Reveal key={c._id} delay={Math.min(idx, 6) * 50}>
                    <div className="py-9 md:py-11 border-b flex flex-col md:flex-row md:gap-12 group" style={{ borderColor: `${GOLD}1a` }}>
                      {/* 연도 — 골드 잉크로 */}
                      <div className="md:w-32 shrink-0 mb-4 md:mb-0 flex items-baseline gap-2 md:block">
                        <span className="text-4xl md:text-5xl font-black tracking-tighter transition-colors tabular-nums leading-none" style={{ color: `${GOLD}30` }}>{sy}</span>
                        {ey && <span className="text-base md:text-lg font-black tracking-tighter md:block" style={{ color: `${GOLD}21` }}>–{ey}</span>}
                      </div>

                      {/* 본문 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-4">
                          <span className="text-[10px] font-black tracking-[0.28em] text-gray-500 uppercase truncate">{c.category}</span>
                          <span className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><AdminBtns c={c} /></span>
                        </div>

                        {/* 우승자 — 크게 (누구인지 확실히) */}
                        <div className="flex items-center gap-4 mb-3">
                          {members.length > 0 && (
                            <div className="flex -space-x-3 shrink-0">
                              {members.map((p, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={i} src={p.avatarUrl} alt={p.globalName} title={p.globalName} className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800 object-cover ring-2 ring-[#080808]" />
                              ))}
                            </div>
                          )}
                          <h3 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-none break-keep">{c.winner}</h3>
                        </div>

                        {/* 팀원 이름 (읽기 쉬운 크기) */}
                        {members.length > 0 && (
                          <p className="text-sm md:text-base text-gray-400 font-medium mb-2 break-keep">
                            {members.map((p) => p.globalName).join("  ·  ")}
                          </p>
                        )}

                        {/* 기록명 + 상세 */}
                        <p className="text-sm text-gray-500 break-keep">
                          {c.title}
                          {c.detail && <span className="text-gray-600"> — {c.detail}</span>}
                        </p>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </div>
            )}
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
