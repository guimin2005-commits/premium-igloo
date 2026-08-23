"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Reveal, LuxStyles, CountUp } from "../components/Lux";
import { parseIds, useDiscordProfiles } from "../components/DiscordIds";
import { ADMIN_USERS } from "@/lib/admins";
import { HONOR_GROUPS, GROUP_LABEL_EN, groupOf, rankLabelOf } from "@/lib/honors";

const GOLD = "#d4af37";

/* 📌 명예의 전당 — 모든 기록을 같은 격의 카드로 세운다.
   (최신 기록만 크게 그리던 예전 방식은 목록이 들쭉날쭉해 보여서, 강조는 마우스를 올린 카드로 옮겼다) */

export default function HallOfFamePage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [champions, setChampions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("전체");
  const { profiles, load } = useDiscordProfiles();

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
        load(Array.from(new Set(merged.flatMap((c: any) => parseIds(c.winnerId)))));
      })
      .finally(() => setIsLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getYears = (c: any): [string, string | null] => {
    const years = Array.from(new Set((c.dateLabel || "").match(/20\d{2}/g) || [])).map(Number).sort();
    if (years.length >= 2) return [`${years[0]}`, `${years[years.length - 1]}`];
    if (years.length === 1) return [`${years[0]}`, null];
    return [`${new Date(c.createdAt).getFullYear()}`, null];
  };

  // 실제 기록이 있는 분류만 필터로 노출한다
  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    champions.forEach((c) => counts.set(groupOf(c), (counts.get(groupOf(c)) || 0) + 1));
    return [
      { key: "전체", en: "All", count: champions.length },
      ...HONOR_GROUPS.filter((g) => counts.get(g)).map((g) => ({ key: g, en: (GROUP_LABEL_EN as Record<string, string>)[g], count: counts.get(g) || 0 })),
    ];
  }, [champions]);

  const visible = useMemo(
    () => (filter === "전체" ? champions : champions.filter((c) => groupOf(c) === filter)),
    [champions, filter]
  );

  const latestId = champions[0]?._id;

  return (
    <main className="w-full flex-1 flex flex-col relative bg-[#080808]">
      <LuxStyles />
      <HofStyles />

      {/* ── 히어로 ── */}
      <section className="relative w-full pt-20 pb-10 md:pt-28 md:pb-14 px-6 overflow-hidden">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none opacity-50"></div>
        <div className="absolute top-[-150px] left-1/2 -translate-x-1/2 w-[680px] h-[340px] rounded-full pointer-events-none hof-breathe" style={{ background: `${GOLD}12`, filter: "blur(130px)" }}></div>
        <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}55, transparent)` }}></div>

        {/* 금가루 — 은은하게 반짝이는 점들 */}
        {[
          { l: "18%", t: "22%", d: "0s" }, { l: "31%", t: "62%", d: "1.1s" }, { l: "47%", t: "16%", d: "2.3s" },
          { l: "68%", t: "58%", d: "0.6s" }, { l: "82%", t: "28%", d: "1.7s" }, { l: "90%", t: "70%", d: "2.9s" },
        ].map((s, i) => (
          <span key={i} aria-hidden className="hof-dust absolute w-1 h-1 rounded-full pointer-events-none" style={{ left: s.l, top: s.t, background: GOLD, animationDelay: s.d }} />
        ))}

        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <Reveal>
            {/* 월계관 엠블럼 — 회전하는 골드 후광 */}
            <div className="flex justify-center mb-6">
              <div className="relative w-[92px] h-[92px] md:w-[104px] md:h-[104px] grid place-items-center">
                <span aria-hidden className="hof-halo absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${GOLD}55 90deg, transparent 200deg, ${GOLD}33 300deg, transparent 360deg)`, filter: "blur(9px)" }} />
                <svg viewBox="0 0 120 120" className="relative w-16 h-16 md:w-[72px] md:h-[72px] hof-float" fill="none">
                  <path d="M40 30c-14 8-20 26-14 44 3 9 9 16 16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                  <path d="M80 30c14 8 20 26 14 44-3 9-9 16-16 20" stroke={GOLD} strokeWidth="3" strokeLinecap="round" opacity="0.9" />
                  <path d="M60 24l4.6 9.3 10.3 1.5-7.4 7.3L73 52 60 47l-13 5 5.5-9.9-7.4-7.3 10.3-1.5z" fill={GOLD} />
                </svg>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 mb-5">
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
              <span className="text-[10px] font-black tracking-[0.5em] uppercase" style={{ color: GOLD }}>Hall of Fame</span>
              <span className="w-10 h-px" style={{ background: `${GOLD}80` }}></span>
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-5">
              <span className="text-white">명예의 </span>
              <span className="hof-gold-text">전당</span>
            </h1>

            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 역사를 기록합니다.</p>

            {!isLoading && champions.length > 0 && (
              <p className="mt-5 text-xs md:text-sm font-bold tracking-[0.2em] uppercase" style={{ color: `${GOLD}cc` }}>
                <CountUp end={champions.length} duration={1200} /> Records Engraved
              </p>
            )}

            <div className="flex items-center justify-center gap-3 mt-7">
              <span className="h-px w-20" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}59)` }}></span>
              <span className="hof-star text-[9px]" style={{ color: `${GOLD}b3` }}>✦</span>
              <span className="h-px w-20" style={{ background: `linear-gradient(270deg, transparent, ${GOLD}59)` }}></span>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-20 flex-1 flex flex-col">
        {/* ── 분류 필터 ── */}
        {!isLoading && champions.length > 0 && (
          <div className="mb-8 md:mb-10">
            <div className="flex gap-2 overflow-x-auto no-bar -mx-6 px-6 pb-1">
              {tabs.map((t) => {
                const active = filter === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setFilter(t.key)}
                    className={`hof-chip shrink-0 px-4 py-2 rounded-full border text-[11px] font-black tracking-[0.14em] uppercase whitespace-nowrap ${active ? "hof-chip-on text-[#0d0b05]" : "text-gray-400 hover:text-white"}`}
                    style={active ? undefined : { borderColor: `${GOLD}26` }}
                  >
                    {t.en}
                    <span className={`ml-2 tabular-nums ${active ? "opacity-70" : "opacity-50"}`}>{t.count}</span>
                  </button>
                );
              })}
            </div>
            {isAdmin && (
              <div className="flex justify-end mt-3">
                <Link href="/admin/honors" className="text-[11px] font-bold text-gray-500 hover:text-white border border-white/10 hover:border-white/25 px-3 py-1.5 rounded-full transition-colors">
                  관리자 · 기록 관리
                </Link>
              </div>
            )}
          </div>
        )}

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
          /* key에 필터를 걸어, 분류를 바꿀 때마다 카드가 다시 차례로 올라오게 한다 */
          <div key={filter} className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {visible.map((c, idx) => {
              const [sy, ey] = getYears(c);
              const members = parseIds(c.winnerId).map((id) => profiles[id]).filter((p) => p && !p.failed);
              return (
                <article key={c._id} className="hof-card hof-rise" style={{ animationDelay: `${Math.min(idx, 8) * 70}ms` }}>
                  {/* 연도 워터마크 */}
                  <span aria-hidden className="hof-year absolute -top-3 right-2 text-[92px] md:text-[112px] font-black leading-none select-none pointer-events-none tabular-nums">{sy}</span>

                  <div className="relative p-6 md:p-7">
                    {/* 수식어 + 분류 */}
                    <div className="flex items-center gap-2 mb-5 min-w-0">
                      <span className="inline-flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-full border text-[10px] font-black tracking-[0.22em] uppercase" style={{ borderColor: `${GOLD}40`, color: GOLD, background: `${GOLD}0f` }}>
                        <span className="hof-star">✦</span>{rankLabelOf(c)}
                      </span>
                      <span className="text-[10px] font-black tracking-[0.24em] text-gray-500 uppercase truncate">{c.category}</span>
                      {c._id === latestId && (
                        <span className="ml-auto shrink-0 text-[9px] font-black tracking-[0.24em] uppercase px-2 py-1 rounded-full border border-white/12 text-gray-400">Latest</span>
                      )}
                    </div>

                    {/* 우승자 — 모든 카드 같은 크기 */}
                    <div className="flex items-center flex-wrap gap-4 mb-3">
                      {members.length > 0 && (
                        <div className="flex -space-x-3 shrink-0">
                          {members.map((p, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={p.avatarUrl} alt={p.globalName} title={p.globalName} className="hof-avatar w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800 object-cover ring-2 ring-[#0e0e0e]" />
                          ))}
                        </div>
                      )}
                      <h3 className="hof-name font-black text-white tracking-tight leading-none break-keep text-3xl md:text-4xl min-w-0">{c.winner}</h3>
                    </div>

                    {members.length > 0 && (
                      <p className="text-sm text-gray-400 font-medium mb-2 break-keep">{members.map((p) => p.globalName).join("  ·  ")}</p>
                    )}

                    <p className="text-sm text-gray-500 break-keep">
                      {c.title}
                      {c.detail && <span className="text-gray-600"> — {c.detail}</span>}
                    </p>

                    {/* 기간 */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t" style={{ borderColor: `${GOLD}14` }}>
                      <span className="text-[11px] font-black tabular-nums tracking-wider" style={{ color: `${GOLD}99` }}>{sy}{ey ? `–${ey}` : ""}</span>
                      {c.dateLabel && <span className="text-[11px] text-gray-600 truncate">· {c.dateLabel}</span>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

// 📌 명예의 전당 전용 모션 — 카드 등장 · 골드 스윕 · 반짝임
const HofStyles = () => (
  <style dangerouslySetInnerHTML={{ __html: `
    @keyframes hofRise { from { opacity: 0; transform: translateY(26px) scale(0.985); } to { opacity: 1; transform: none; } }
    @keyframes hofShine { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    @keyframes hofTwinkle { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.3); } }
    @keyframes hofFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes hofSpin { to { transform: rotate(360deg); } }
    @keyframes hofBreathe { 0%, 100% { opacity: 0.75; } 50% { opacity: 1; } }
    @keyframes hofDust { 0%, 100% { opacity: 0; transform: translateY(0) scale(0.6); } 50% { opacity: 0.9; transform: translateY(-14px) scale(1); } }

    .hof-rise { animation: hofRise 0.65s cubic-bezier(0.16,1,0.3,1) both; }
    .hof-float { animation: hofFloat 4.5s ease-in-out infinite; }
    .hof-halo { animation: hofSpin 14s linear infinite; }
    .hof-breathe { animation: hofBreathe 6s ease-in-out infinite; }
    .hof-dust { animation: hofDust 5.5s ease-in-out infinite; }
    .hof-star { display: inline-block; animation: hofTwinkle 2.8s ease-in-out infinite; }

    .hof-gold-text {
      background: linear-gradient(100deg, #8f6f1c 8%, #d4af37 30%, #fff6d0 50%, #d4af37 70%, #8f6f1c 92%);
      background-size: 200% auto;
      -webkit-background-clip: text; background-clip: text; color: transparent;
      animation: hofShine 6s linear infinite;
      filter: drop-shadow(0 0 28px #d4af3740);
    }

    /* ── 카드 — 강조는 마우스를 올린 곳에만 ── */
    .hof-card {
      position: relative; overflow: hidden; border-radius: 18px;
      border: 1px solid rgba(212,175,55,0.16);
      background: linear-gradient(158deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012));
      transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), border-color 0.45s ease, box-shadow 0.45s ease;
    }
    .hof-card:hover {
      transform: translateY(-6px);
      border-color: rgba(212,175,55,0.46);
      box-shadow: 0 26px 60px -30px rgba(212,175,55,0.55);
    }
    .hof-card:active { transform: translateY(-2px); }
    /* 상단 골드 헤어라인이 좌우로 그어진다 */
    .hof-card::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; pointer-events: none;
      background: linear-gradient(90deg, transparent, rgba(212,175,55,0.85), transparent);
      transform: scaleX(0); transform-origin: center; transition: transform 0.6s cubic-bezier(0.16,1,0.3,1);
    }
    .hof-card:hover::before { transform: scaleX(1); }
    /* 금박이 스치는 스윕 */
    .hof-card::after {
      content: ""; position: absolute; inset: -20% -60%; pointer-events: none;
      background: linear-gradient(115deg, transparent 42%, rgba(255,240,190,0.13) 50%, transparent 58%);
      transform: translateX(-60%); opacity: 0; transition: opacity 0.2s ease;
    }
    .hof-card:hover::after { opacity: 1; animation: hofSweep 1.1s cubic-bezier(0.16,1,0.3,1); }
    @keyframes hofSweep { from { transform: translateX(-60%); } to { transform: translateX(60%); } }

    .hof-year { color: rgba(212,175,55,0.07); transition: color 0.45s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1); }
    .hof-card:hover .hof-year { color: rgba(212,175,55,0.15); transform: translateY(-3px); }
    .hof-name { transition: text-shadow 0.45s ease; }
    .hof-card:hover .hof-name { text-shadow: 0 0 40px rgba(212,175,55,0.33); }
    .hof-avatar { transition: transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s ease; }
    .hof-card:hover .hof-avatar { transform: translateY(-2px); box-shadow: 0 0 0 2px rgba(212,175,55,0.35); }

    /* ── 분류 칩 ── */
    .hof-chip { border-width: 1px; border-style: solid; background: transparent; transition: color 0.25s ease, border-color 0.25s ease, background 0.25s ease, transform 0.25s ease; }
    .hof-chip:hover { border-color: rgba(212,175,55,0.55); }
    .hof-chip-on { border-color: transparent; background: linear-gradient(135deg, #f7e7a0, #d4af37); box-shadow: 0 10px 30px -14px rgba(212,175,55,0.8); }

    @media (prefers-reduced-motion: reduce) {
      .hof-rise, .hof-float, .hof-halo, .hof-breathe, .hof-dust, .hof-star, .hof-gold-text { animation: none !important; }
      .hof-card, .hof-card:hover { transform: none; }
    }
  `}} />
);
