"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { RenderFormattedText } from "../../components/FormattedText";
import { BracketView } from "../../components/BracketView";
import { EsportsStyles, STATUS_META } from "../../components/Esports";
import { PHASES, phaseOf, phaseMeta, phaseShows } from "@/lib/tournamentPhase";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 대회 상세 — 팝업이 아니라 페이지.
   대진표를 팝업 안에 넣으면 좁아서 '크게 보기' 전체화면을 또 띄워야 했다.
   페이지로 빼면 폭이 생겨 대진표가 제자리에서 읽힌다. */

const G = "#00e07b";
const fmtDate = (v: string) => (v || "").replace(/-/g, ".");

export default function TournamentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [full, setFull] = useState(false);
  const [myTeam, setMyTeam] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/posts/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setPost(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // 이 대회에 내 팀이 있으면 룸으로 바로 보낸다
  useEffect(() => {
    fetch("/api/room", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success) return;
        const mine = (d.teams || []).find((t: any) => (t.members || []).some((m: any) => m.discordId && m.discordId === d.me));
        if (mine) setMyTeam(mine);
      })
      .catch(() => {});
  }, []);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;
  if (!post) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center">
        <EsportsStyles />
        <h2 className="text-xl font-black text-white mb-2">대회를 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-6">삭제되었거나 잘못된 주소입니다.</p>
        <button onClick={() => router.push("/tournament")} className="esp-cut-sm bg-white/[0.06] text-gray-300 text-xs font-black px-5 py-3">대회 목록으로</button>
      </main>
    );
  }

  const cur = phaseOf(post);
  const idx = PHASES.findIndex((p) => p.id === cur);
  const show = phaseShows(cur);
  const st = post.tournamentStatus && STATUS_META[post.tournamentStatus] ? post.tournamentStatus : "예정됨";
  const meta = STATUS_META[st];

  return (
    <main className="flex-1 w-full flex flex-col">
      <EsportsStyles />

      {/* ── 헤더 ── */}
      <section className="relative w-full overflow-hidden">
        {post.bannerUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.bannerUrl} alt="" className="w-full h-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-[#090909]/80 to-[#090909]/40" />
          </div>
        )}
        <div className="absolute inset-0 esp-mesh pointer-events-none" />
        <div className="absolute inset-0 esp-scan pointer-events-none opacity-30" />

        <div className="relative max-w-[1180px] mx-auto px-5 md:px-8 pt-9 pb-7">
          <div className="flex items-center gap-3 mb-5">
            <Link href="/tournament" className="text-[10px] font-black esp-mono text-gray-500 hover:text-white transition-colors shrink-0">← 대회</Link>
            <span className="w-2 h-2 esp-blink" style={{ background: G, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
            <span className="text-[10px] font-black esp-mono uppercase truncate" style={{ color: G }}>{post.tournamentGame || "TOURNAMENT"}</span>
            <span className="h-px flex-1 min-w-0 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            {isAdmin && (
              <span className="flex gap-2 shrink-0">
                <button onClick={() => router.push(`/write?id=${post._id}`)} className="esp-cut-sm px-3 py-1.5 text-[10px] font-black bg-white/[0.06] text-gray-300 hover:text-white transition-colors">수정</button>
                {post.survey?.enabled && (
                  <button onClick={() => router.push(`/tournament/survey/${post._id}`)} className="esp-cut-sm px-3 py-1.5 text-[10px] font-black text-[#04120b]" style={{ background: G }}>설문 결과</button>
                )}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className={`px-2.5 py-1 text-[11px] font-black esp-cut-sm ${meta.badge}`}>{meta.label}</span>
            {post.tournamentDate && <span className="text-[11px] font-bold text-gray-400 tabular-nums">{fmtDate(post.tournamentDate)}</span>}
          </div>
          <h1 className="text-[26px] md:text-[38px] font-black tracking-tighter leading-[1.05] break-keep">{post.title}</h1>

          {/* 진행 띠 */}
          <div className="flex gap-1 mt-7">
            {PHASES.map((p, i) => {
              const done = i < idx, on = i === idx;
              return (
                <div key={p.id} className="flex-1 min-w-0">
                  <div className="h-1" style={{ background: on ? G : done ? "rgba(0,224,123,.35)" : "rgba(255,255,255,.08)" }} />
                  <p className={`mt-2 text-[9px] font-black esp-mono truncate ${on ? "text-[#00e07b]" : done ? "text-gray-500" : "text-gray-700"}`}>{p.code}</p>
                  <p className={`text-[10px] font-bold truncate ${on ? "text-white" : "text-gray-600"}`}>{p.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 본문 — 좌: 대진표·내용 / 우: 정보·행동 ── */}
      <div className="w-full px-5 md:px-8 py-8">
        <div className="max-w-[1180px] mx-auto grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] items-start">

          <div className="min-w-0 space-y-9">
            {/* 대진표 — 페이지 폭을 그대로 쓴다 */}
            {show.bracket && post.tournamentBracket && (
              <section>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-[10px] font-black esp-mono shrink-0" style={{ color: G }}>BRACKET</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent" />
                  <button onClick={() => setFull(true)} className="shrink-0 esp-cut-sm px-3 py-1.5 text-[10px] font-black bg-white/[0.05] text-gray-300 hover:text-white transition-colors">전체화면</button>
                </div>
                <div className="esp-cut border border-white/[0.08] bg-white/[0.015] p-4">
                  <BracketView text={post.tournamentBracket} showHeader={false} maxScale={1.6} />
                </div>
              </section>
            )}

            {post.content && (
              <section>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-[10px] font-black esp-mono shrink-0" style={{ color: G }}>ABOUT</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent" />
                </div>
                <div className="text-gray-300 text-[15px] leading-[1.9] break-keep">
                  <RenderFormattedText text={post.content} />
                </div>
              </section>
            )}
          </div>

          {/* 우측 정보 */}
          <aside className="xl:sticky xl:top-5 space-y-5">
            <div className="esp-cut border border-white/[0.08] bg-white/[0.02]">
              {[
                { k: "PRIZE", l: "보상", v: post.tournamentPrize || "미정" },
                { k: "DRAFT", l: "팀 배정일", v: post.tournamentTeamDay ? fmtDate(post.tournamentTeamDay) : "미정" },
                { k: "MATCHDAY", l: "대회 당일", v: post.tournamentEventDay ? fmtDate(post.tournamentEventDay) : "미정" },
              ].map((m, i) => (
                <div key={m.k} className={`px-5 py-4 ${i > 0 ? "border-t border-white/[0.07]" : ""}`}>
                  <p className="text-[9px] font-black esp-mono text-gray-600 mb-1.5">{m.k}</p>
                  <p className="text-[14px] font-black text-white break-keep tabular-nums">{m.v}</p>
                  <p className="text-[10px] font-bold text-gray-600 mt-0.5">{m.l}</p>
                </div>
              ))}
            </div>

            {/* 지금 할 일 — 단계에 따라 하나만 */}
            {show.survey && (
              <button
                onClick={() => router.push(post.survey?.enabled ? `/tournament/survey/${post._id}` : post.tournamentLink || "/tournament")}
                disabled={!!post.survey?.closed}
                className="w-full esp-cut-sm py-4 text-[13px] font-black transition-all active:scale-[.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: G, color: "#04120b" }}>
                {post.survey?.closed ? "접수 마감" : "참가 신청하기"}
              </button>
            )}
            {show.scrim && (
              <button
                onClick={() => router.push(myTeam ? `/tournament/team/${myTeam._id}` : "/tournament")}
                className="w-full esp-cut-sm py-4 text-[13px] font-black transition-all active:scale-[.99]"
                style={{ background: G, color: "#04120b" }}>
                {myTeam ? "팀 룸에서 스크림 잡기" : "연습 주간 진행 중"}
              </button>
            )}
            {cur === "팀배정" && (
              <div className="esp-cut border border-white/12 bg-white/[0.03] px-5 py-4">
                <p className="text-[9px] font-black esp-mono text-gray-500 mb-1">DRAFT DAY</p>
                <p className="text-[13px] font-black text-white">오늘 경매로 팀을 나눕니다</p>
              </div>
            )}
            {cur === "종료" && (
              <div className="esp-cut border border-white/12 bg-white/[0.03] px-5 py-4 text-center">
                <p className="text-[13px] font-black text-gray-400">종료된 대회입니다</p>
              </div>
            )}

            <Link href="/tournament/notice" className="block esp-cut-sm border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-4 py-3">
              <span className="block text-[9px] font-black esp-mono text-gray-600 mb-1">NOTICE</span>
              <span className="block text-[12px] font-black text-gray-300">대회 공지 보기 →</span>
            </Link>
          </aside>
        </div>
      </div>

      {/* 전체화면 대진표 */}
      {full && post.tournamentBracket && (
        <div className="fixed inset-0 z-[130] bg-[#0a0a0a] flex flex-col animate-in fade-in duration-200">
          <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10 shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-black text-white truncate">{post.title}</p>
              <p className="text-[10px] font-black esp-mono text-gray-500 uppercase truncate">{post.tournamentGame || "TOURNAMENT"} · BRACKET</p>
            </div>
            <button onClick={() => setFull(false)} className="shrink-0 esp-cut-sm px-4 py-2 text-[11px] font-black bg-white/[0.06] text-gray-300 hover:text-white transition-colors">닫기</button>
          </div>
          <div className="flex-1 min-h-0 p-4">
            <BracketView text={post.tournamentBracket} showHeader={false} maxScale={2.4} mode="contain" />
          </div>
        </div>
      )}
    </main>
  );
}
