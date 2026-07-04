"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Reveal, LuxStyles } from "../components/Lux";

export default function HallOfFamePage() {
  const [champions, setChampions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
            detail: p.tournamentPrize || "",
            dateLabel: p.tournamentDate || "",
            createdAt: p.createdAt,
          }));

        const manual = (Array.isArray(hn?.data) ? hn.data : []).map((h: any) => ({
          _id: h._id,
          category: h.category || "기타",
          title: h.title,
          winner: h.winner,
          detail: h.detail || "",
          dateLabel: h.dateLabel || "",
          createdAt: h.createdAt,
        }));

        const merged = [...fromTournaments, ...manual].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setChampions(merged);
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
                    <p className="text-[10px] font-black tracking-[0.25em] text-gray-600 uppercase mb-1.5">{c.category}</p>
                    <h3 className="text-lg md:text-xl font-black text-white tracking-tight mb-1 group-hover:text-[#ff5c77] transition-colors">{c.title}</h3>
                    {c.dateLabel && <p className="text-xs text-gray-500">{c.dateLabel}</p>}
                  </div>

                  {/* 우승자 */}
                  <div className="shrink-0 md:text-right">
                    <p className="text-[9px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-1">🏆 Champion</p>
                    <p className="text-xl md:text-2xl font-black text-[#e91e3f] tracking-tight">{c.winner}</p>
                    {c.detail && <p className="text-[11px] text-gray-500 mt-1">{c.detail}</p>}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
