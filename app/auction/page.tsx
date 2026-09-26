"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Reveal, LuxStyles } from "../components/Lux";
import { AuctionStyles } from "../components/AuctionStyles";


const ADMIN_USERS = ["elahw.06"];

// 📌 공개 경매 화면 — 보는 곳이다(티켓 무대 · 지난 경매). 경매 개최 · 제목 수정 · 공개 전환 · 삭제는
//    관리자 화면(/admin/auction)으로 옮겼다. 옛 주소 ?admin=1 은 그리로 보낸다.
export default function AuctionListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 옛 개최 주소(?admin=1)는 관리자 경매 화면으로 — 개최 폼은 거기로 옮겼다
  useEffect(() => {
    if (searchParams.get("admin") === "1") router.replace("/admin/auction?tab=new");
  }, [searchParams, router]);
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [auctions, setAuctions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [focus, setFocus] = useState(0); // 📌 무대 중앙에 세울 경매
  const [tearing, setTearing] = useState<string | null>(null); // 📌 티켓을 찢는 중인 경매

  const fetchList = () => {
    fetch("/api/auction", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d?.data) ? d.data : [];
        setAuctions(list);
        // 진행 중인 경매가 있으면 그걸 중앙에 세운다 (최근 5개 안에서)
        const liveIdx = list.slice(0, 5).findIndex((a: any) => a.status === "진행중");
        setFocus(liveIdx >= 0 ? liveIdx : 0);
      })
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchList(); }, []);


  // 📌 티켓 무대는 최근 5개까지, 그 이전 경매는 아래 목록으로
  const recent = auctions.slice(0, 5);
  const past = auctions.slice(5);

  // 📌 종이가 찢어지는 소리 — 밴드패스를 훑는 노이즈로 '드드득' 결을 만들고 끝에 탁 끊는다.
  //    (클릭으로 호출되므로 AudioContext 자동재생 정책에 걸리지 않는다)
  const playTear = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const dur = 0.42;
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      // 균일한 노이즈가 아니라 불규칙하게 끊기는 결 — 종이 섬유가 뜯기는 느낌
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const grain = Math.random() < 0.55 + t * 0.4 ? 1 : 0.25;
        d[i] = (Math.random() * 2 - 1) * grain;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.Q.value = 1.8;
      bp.frequency.setValueAtTime(700, now);
      bp.frequency.exponentialRampToValueAtTime(3400, now + dur * 0.82);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.05);
      g.gain.setValueAtTime(0.16, now + dur * 0.72);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp).connect(g).connect(ctx.destination);
      src.start(now);
      src.stop(now + dur);
      // 마지막으로 완전히 끊기는 '탁'
      const snap = ctx.createOscillator();
      const sg = ctx.createGain();
      snap.type = "triangle";
      snap.frequency.value = 240;
      sg.gain.setValueAtTime(0.09, now + dur * 0.8);
      sg.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.8 + 0.09);
      snap.connect(sg).connect(ctx.destination);
      snap.start(now + dur * 0.8);
      snap.stop(now + dur * 0.8 + 0.1);
      setTimeout(() => ctx.close().catch(() => {}), 1200);
    } catch {}
  };

  // 📌 입장 — 티켓이 절취선을 따라 찢어지고 사라진 뒤 이동한다
  //    종료된 경매는 이미 찢긴 티켓이라 연출 없이 바로 들어간다
  const enter = (id: string, skipTear = false) => {
    if (tearing) return;
    if (skipTear) { router.push(`/auction/${id}`); return; }
    setTearing(id);
    playTear();
    setTimeout(() => router.push(`/auction/${id}`), 720);
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">경매를 보시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20">Discord 로그인</button>
      </main>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col relative auc">
      <LuxStyles />
      <AuctionStyles />

      {/* ══ 경매장 — 포인트 코인 무대 (최근 5개) ══ */}
      {(
      <section className="relative w-full pt-24 md:pt-32 pb-16 px-6 overflow-hidden">
        <div className="relative z-10 max-w-6xl mx-auto">
          {/* 제목 — 가운데 '포인트 경매', 뒤에 POINT / AUCTION */}
          <div className="relative flex flex-col items-center mb-16 md:mb-20">
            <div className="auc-ghost" aria-hidden>
              <span className="g1">POINT</span>
              <span className="g2">AUCTION</span>
            </div>
            <h1 className="auc-in relative text-[2.5rem] md:text-[4.4rem] font-black leading-none tracking-[0.28em] pl-[0.28em] md:tracking-[0.4em] md:pl-[0.4em] text-white">
              포인트 경매
            </h1>
          </div>

          {isLoading ? (
            <p className="text-center py-24 text-sm text-gray-600">불러오는 중…</p>
          ) : recent.length === 0 ? (
            <div className="auc-in flex flex-col items-center py-16">
              <div className="auc-ticket auc-ticket-focus" style={{ position: "relative", cursor: "default", transform: "none", opacity: 1 }}>
                <div className="auc-half auc-half-l">
                  <div className="absolute inset-0 flex items-center justify-center"><p className="auc-label text-gray-600">No Ticket</p></div>
                </div>
                <div className="auc-half auc-half-r" />
                <span className="auc-perf" />
              </div>
              <p className="mt-12 text-sm text-gray-500">대회 시즌이 시작되면 이곳에서 경매가 열립니다.</p>
            </div>
          ) : (
            <>
              {/* 티켓 무대 — 초대장이 겹쳐 놓인 형태 */}
              <div className="auc-stage auc-in" style={{ animationDelay: "120ms" }}>
                {recent.map((a, i) => {
                  const off = i - focus;
                  if (Math.abs(off) > 2) return null;
                  const isCenter = off === 0;
                  const isLive = a.status === "진행중";
                  const isEnd = a.status === "종료";
                  return (
                    <div
                      key={a._id}
                      onClick={() => (isCenter ? enter(a._id, isEnd) : setFocus(i))}
                      className={`auc-ticket ${isCenter ? "auc-ticket-focus" : ""} ${isLive && isCenter ? "auc-ticket-live" : ""} ${isEnd ? "auc-ticket-closed" : ""} ${tearing === a._id ? "auc-ticket-tear" : ""}`}
                      style={{ ["--off" as any]: off, zIndex: tearing === a._id ? 40 : 10 - Math.abs(off) }}
                    >
                      {/* 본권 */}
                      <div className="auc-half auc-half-l">
                        <span className="auc-shine" />
                        <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-6">
                          <div className="flex items-center gap-2">
                            {isLive && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                            <span className={`auc-label ${isLive ? "text-white" : "text-gray-500"}`}>
                              {isLive ? "Live Now" : isEnd ? "Closed" : "Ready"}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <p className="auc-label text-gray-600 mb-1.5">Invitation</p>
                            <p className="text-base md:text-xl font-black text-white leading-snug break-keep truncate">
                              {a.game || "경매"}
                            </p>
                          </div>

                          {/* 티켓 정보란 — 좌석표처럼 */}
                          <div className="flex items-end gap-5">
                            <div>
                              <p className="auc-label text-gray-600 mb-1">Teams</p>
                              <p className="auc-num text-xl font-black text-white leading-none">{String(a.leaderCount).padStart(2, "0")}</p>
                            </div>
                            <span className="w-px h-7 bg-white/12 mb-0.5" />
                            <div>
                              <p className="auc-label text-gray-600 mb-1">Players</p>
                              <p className="auc-num text-xl font-black text-white leading-none">{String(a.playerCount).padStart(2, "0")}</p>
                            </div>
                          </div>
                        </div>
                        {isEnd && isCenter && <span className="auc-seal">CLOSED</span>}
                      </div>

                      {/* 절취 스텁 */}
                      <div className="auc-half auc-half-r">
                        <span className="auc-shine" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-2">
                          <p className="auc-label text-gray-500 leading-[1.6] text-center">Admit<br />One</p>
                          <span className="w-6 h-px bg-white/15" />
                          <p className="auc-label text-gray-700 auc-num">
                            {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                          </p>
                        </div>
                      </div>

                      {/* 절취선 */}
                      <span className="auc-perf" />
                    </div>
                  );
                })}
              </div>

              {/* 중앙 경매 — 제목 + 진입 */}
              {(() => {
                const a: any = recent[focus];
                if (!a) return null;
                const isLive = a.status === "진행중";
                const isEnd = a.status === "종료";
                return (
                  <div key={a._id} className="auc-in mt-10 flex flex-col items-center text-center">
                    <h2 className={`text-2xl md:text-4xl font-black leading-snug break-keep max-w-3xl ${isEnd ? "text-gray-500" : "text-white"}`}>
                      {a.title}
                    </h2>

                    <button
                      onClick={() => enter(a._id, isEnd)}
                      disabled={!!tearing}
                      className={`group mt-8 inline-flex items-center gap-3 px-9 py-4 transition-colors disabled:opacity-60 ${isLive ? "bg-white text-black hover:bg-gray-200" : "border border-white/25 text-gray-300 hover:bg-white hover:text-black"}`}
                    >
                      <span className="auc-label">{isLive ? "지금 입장" : isEnd ? "결과 보기" : "경매장 보기"}</span>
                      <span className="text-base leading-none transition-transform group-hover:translate-x-1">→</span>
                    </button>

                    {recent.length > 1 && (
                      <div className="flex items-center gap-2 mt-10">
                        {recent.map((x, i) => (
                          <button key={x._id} onClick={() => setFocus(i)} aria-label={`${i + 1}번째 경매`}
                            className={`h-[3px] transition-all ${i === focus ? "w-6 bg-white" : "w-[3px] bg-white/25 hover:bg-white/60"}`} />
                        ))}
                      </div>
                    )}

                  </div>
                );
              })()}
            </>
          )}

          {isAdmin && (
            <div className="mt-16 flex justify-center">
              {/* 관리(개최 · 제목 · 공개 전환 · 삭제)는 관리자 화면에서 */}
              <Link href="/admin/auction" className="auc-label text-gray-500 hover:text-white border-b border-white/15 hover:border-white pb-1 transition-colors">
                경매 관리 →
              </Link>
            </div>
          )}
        </div>
      </section>
      )}

      {/* ══ 지난 경매 — 스크롤하면 부드럽게 올라온다 ══ */}
      {past.length > 0 && (
        <section className="w-full px-6 pb-4">
          <div className="max-w-3xl mx-auto">
            <Reveal>
              <div className="flex items-center gap-4 mb-2">
                <span className="auc-label text-gray-600">지난 경매</span>
                <span className="h-px flex-1 bg-white/10" />
                <span className="auc-label text-gray-700 auc-num">{past.length}</span>
              </div>
            </Reveal>
            {past.map((a, i) => (
              <Reveal key={a._id} delay={Math.min(i, 8) * 70}>
                <div
                  onClick={() => router.push(`/auction/${a._id}`)}
                  className="auc-past group cursor-pointer border-b border-white/[0.07] py-5 flex items-center gap-5"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white/15 shrink-0 group-hover:bg-white transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-gray-300 truncate group-hover:text-white transition-colors">{a.title}</p>
                    <p className="auc-label text-gray-700 mt-1.5">
                      {a.game || "경매"} · 팀 {a.leaderCount} · 선수 {a.playerCount}
                    </p>
                  </div>
                  <span className="auc-label text-gray-700 shrink-0 hidden sm:block auc-num">
                    {new Date(a.createdAt).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                  </span>
                  <svg className="w-4 h-4 text-gray-800 group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}


    </main>
  );
}
