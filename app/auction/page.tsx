"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];

export default function AuctionListPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [auctions, setAuctions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  // 생성 폼
  const [title, setTitle] = useState("");
  const [settings, setSettings] = useState({
    leaderPoints: 100000, basePrice: 1000, goldenBasePrice: 4000,
    scoutCost: 2000, posChangeCost: 10000, minIncrement: 100, timerSeconds: 15, scoutSeconds: 7,
    slotTank: 1, slotDealer: 2, slotHealer: 2,
  });
  const [leaders, setLeaders] = useState<any[]>([{ name: "", position: "", discordId: "" }]);
  const [players, setPlayers] = useState<any[]>([{ alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", isAllPos: false }]);

  const updateLeader = (i: number, key: string, value: any) =>
    setLeaders((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: value } : l)));
  const updatePlayer = (i: number, key: string, value: any) =>
    setPlayers((prev) => prev.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));

  const fetchList = () => {
    fetch("/api/auction", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAuctions(Array.isArray(d?.data) ? d.data : []))
      .finally(() => setIsLoading(false));
  };
  useEffect(() => { fetchList(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const validLeaders = leaders.filter((l) => l.name.trim());
    const validPlayers = players.filter((p) => p.alias.trim()).map((p) => ({
      ...p,
      mainPos: p.isAllPos ? "" : p.mainPos,
      subPos: p.isAllPos ? "" : p.subPos,
    }));

    if (!title.trim() || validLeaders.length < 2 || validPlayers.length < 1) {
      setPopup({ isOpen: true, message: "제목, 리더 2명 이상, 선수 1명 이상이 필요합니다.", isError: true });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, settings, leaders: validLeaders, players: validPlayers }),
      });
      const d = await res.json();
      if (d.success) {
        router.push(`/auction/${d.data._id}`);
      } else {
        setPopup({ isOpen: true, message: d.message || "생성 실패", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류", isError: true });
    } finally { setIsSubmitting(false); }
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    await fetch(`/api/auction?id=${deleteId}`, { method: "DELETE" }).catch(() => {});
    setDeleteId(null);
    fetchList();
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated") {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">선수 경매를 보시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20">Discord 로그인</button>
      </main>
    );
  }

  const inputClass = "w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";
  const numClass = "w-full bg-[#121212] border border-white/10 rounded-lg px-3 py-2 text-xs text-white text-center outline-none focus:border-[#e91e3f] transition-colors font-bold";

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10 flex justify-between items-end gap-6">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Player Auction</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">선수 </span><span className="lux-shimmer">경매</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">실시간 선수 경매! 실시간 라이브 채팅으로 모두 함께!</p>
          </Reveal>
          {isAdmin && (
            <button onClick={() => setShowCreate(!showCreate)} className="shrink-0 bg-[#e91e3f] hover:bg-[#d01634] text-white font-black text-xs px-5 py-3 rounded-full transition-all active:scale-95 shadow-[0_8px_24px_rgba(233,30,63,0.3)]">
              {showCreate ? "닫기" : "+ 경매 개최"}
            </button>
          )}
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-8">

        {/* 생성 폼 */}
        {showCreate && (
          <Reveal>
          <form onSubmit={handleCreate} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px">
            <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8 space-y-6">
              <h3 className="text-base font-black text-white flex items-center gap-3"><span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>경매 개최</h3>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">경매 제목 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: 제 1회 종합 e스포츠 대회 선수 경매" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </div>

              {/* 룰 설정 — 전부 개최자가 조정 가능 */}
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-3">경매 룰 설정</label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { k: "leaderPoints", l: "리더 시작 Point" },
                    { k: "basePrice", l: "기본 시작가" },
                    { k: "goldenBasePrice", l: "황금카드 시작가" },
                    { k: "scoutCost", l: "스카우터 비용" },
                    { k: "posChangeCost", l: "포지션 체인지" },
                    { k: "minIncrement", l: "최소 입찰 단위" },
                    { k: "timerSeconds", l: "입찰 타이머(초)" },
                    { k: "scoutSeconds", l: "스카우터 타임(초)" },
                    { k: "slotTank", l: "탱커 슬롯" },
                    { k: "slotDealer", l: "딜러 슬롯" },
                    { k: "slotHealer", l: "힐러 슬롯" },
                  ].map((f) => (
                    <div key={f.k}>
                      <p className="text-[10px] font-bold text-gray-600 mb-1">{f.l}</p>
                      <input type="number" min={0} value={(settings as any)[f.k]} onChange={(e) => setSettings({ ...settings, [f.k]: Number(e.target.value) })} className={numClass} />
                    </div>
                  ))}
                </div>
              </div>

              {/* 리더 카드 목록 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500">리더 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({leaders.filter(l => l.name.trim()).length}명)</span></label>
                  <button type="button" onClick={() => setLeaders([...leaders, { name: "", position: "", discordId: "" }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">리더 추가</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {leaders.map((l, i) => (
                    <div key={i} className="relative rounded-xl border border-white/10 bg-black/25 p-4 hover:border-white/20 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">Leader {String(i + 1).padStart(2, "0")}</span>
                        {leaders.length > 1 && (
                          <button type="button" onClick={() => setLeaders(leaders.filter((_, idx) => idx !== i))} className="text-[10px] font-bold text-gray-600 hover:text-red-400 transition-colors">제거</button>
                        )}
                      </div>
                      <input type="text" placeholder="리더 이름" value={l.name} onChange={(e) => updateLeader(i, "name", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <input type="text" placeholder="디스코드 ID (선택 · 프로필 표시)" value={l.discordId} onChange={(e) => updateLeader(i, "discordId", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <div className="flex gap-1.5">
                        {["탱커", "딜러", "힐러"].map((pos) => (
                          <button type="button" key={pos} onClick={() => updateLeader(i, "position", l.position === pos ? "" : pos)} className={`flex-1 py-2 text-[11px] font-bold rounded-lg border transition-all ${l.position === pos ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">탱커 포지션 리더은 1페이즈 참가가 자동 차단됩니다. 디스코드 ID를 입력하면 팀 현황판에 프로필이 표시되고, 해당 유저는 접속 시 자동으로 리더 화면이 지정됩니다.</p>
              </div>

              {/* 선수 카드 목록 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-gray-500">선수 명단 <span className="text-[#e91e3f]">*</span> <span className="text-gray-600 font-medium">({players.filter(p => p.alias.trim()).length}명)</span></label>
                  <button type="button" onClick={() => setPlayers([...players, { alias: "", discordId: "", peakTier: "", currentTier: "", mainPos: "", subPos: "", isAllPos: false }])} className="text-[11px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-3.5 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">선수 추가</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {players.map((p, i) => (
                    <div key={i} className={`relative rounded-xl border p-4 transition-colors ${p.isAllPos ? "border-[#e91e3f]/35 bg-[#e91e3f]/[0.04]" : "border-white/10 bg-black/25 hover:border-white/20"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[9px] font-black tracking-[0.2em] text-gray-600 uppercase">Player {String(i + 1).padStart(2, "0")}</span>
                        <div className="flex items-center gap-2.5">
                          <button type="button" onClick={() => updatePlayer(i, "isAllPos", !p.isAllPos)} className={`text-[10px] font-black px-2.5 py-1 rounded-full border transition-all ${p.isAllPos ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "border-white/10 text-gray-600 hover:border-white/30"}`}>올 포지션</button>
                          {players.length > 1 && (
                            <button type="button" onClick={() => setPlayers(players.filter((_, idx) => idx !== i))} className="text-[10px] font-bold text-gray-600 hover:text-red-400 transition-colors">제거</button>
                          )}
                        </div>
                      </div>
                      <input type="text" placeholder="익명 닉네임" value={p.alias} onChange={(e) => updatePlayer(i, "alias", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <input type="text" placeholder="디스코드 ID (선택 · 낙찰 후 프로필 공개용)" value={p.discordId} onChange={(e) => updatePlayer(i, "discordId", e.target.value)} className={`${inputClass} mb-2.5`} />
                      <div className="grid grid-cols-2 gap-2 mb-2.5">
                        <input type="text" placeholder="최고 티어" value={p.peakTier} onChange={(e) => updatePlayer(i, "peakTier", e.target.value)} className={inputClass} />
                        <input type="text" placeholder="현재 티어" value={p.currentTier} onChange={(e) => updatePlayer(i, "currentTier", e.target.value)} className={inputClass} />
                      </div>
                      {p.isAllPos ? (
                        <p className="text-[10px] text-[#e91e3f]/80 font-bold">황금카드 — 티어 비공개 · 스카우터 불가 · 시작가 {settings.goldenBasePrice.toLocaleString()}pt · 슬롯 자유 배정</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-[9px] font-bold text-gray-600 mb-1">주 포지션</p>
                            <div className="flex gap-1">
                              {["탱커", "딜러", "힐러"].map((pos) => (
                                <button type="button" key={pos} onClick={() => updatePlayer(i, "mainPos", p.mainPos === pos ? "" : pos)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md border transition-all ${p.mainPos === pos ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos[0]}</button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-gray-600 mb-1">부 포지션</p>
                            <div className="flex gap-1">
                              {["탱커", "딜러", "힐러"].map((pos) => (
                                <button type="button" key={pos} onClick={() => updatePlayer(i, "subPos", p.subPos === pos ? "" : pos)} className={`flex-1 py-1.5 text-[10px] font-bold rounded-md border transition-all ${p.subPos === pos ? "bg-white/60 text-black border-white/60" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{pos[0]}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-600 mt-2">주/부 포지션에 탱커가 포함된 선수는 1페이즈로 자동 분류됩니다.</p>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">
                {isSubmitting ? "생성 중..." : "경매장 생성"}
              </button>
            </div>
          </form>
          </Reveal>
        )}

        {/* 이용 안내 — 3단계 */}
        <Reveal>
        <div className="grid grid-cols-3 gap-px bg-white/10 rounded-2xl overflow-hidden border border-white/10">
          {[
            { no: "01", t: "리더는 입찰", d: "Point로 원하는 선수를 낙찰" },
            { no: "02", t: "모두가 관전", d: "실시간 라이브 채팅으로 즐기기" },
            { no: "03", t: "팀 완성", d: "종료 후 최종 로스터 공개" },
          ].map((s, i) => (
            <div key={i} className="bg-[#0d0d0d] px-3 py-5 md:px-6 md:py-6 text-center group hover:bg-[#121212] transition-colors">
              <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] mb-1.5">{s.no}</p>
              <p className="text-xs md:text-sm font-black text-white mb-1">{s.t}</p>
              <p className="text-[9px] md:text-[11px] text-gray-500 break-keep">{s.d}</p>
            </div>
          ))}
        </div>
        </Reveal>

        {/* 목록 */}
        {isLoading ? (
          <div className="text-center py-16 text-gray-500">불러오는 중...</div>
        ) : auctions.length === 0 ? (
          <Reveal>
          <div className="relative rounded-2xl bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-px">
            <div className="rounded-2xl bg-[#111111]/95 py-20 px-6 text-center relative overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[200px] bg-[#e91e3f]/[0.05] blur-[90px] rounded-full pointer-events-none"></div>
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-6 rounded-2xl bg-[#e91e3f]/10 border border-[#e91e3f]/20 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-6 h-6 text-[#e91e3f]"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <p className="text-white font-black text-lg mb-2">{isAdmin ? "개최된 경매가 없습니다" : "현재 진행 중인 경매가 없습니다"}</p>
                <p className="text-sm text-gray-500 leading-relaxed">{isAdmin ? "우측 상단에서 첫 경매를 개최해보세요." : <>대회 시즌이 시작되면 이곳에서 실시간 선수 경매가 열립니다.<br/>공지사항을 통해 일정을 확인해주세요.</>}</p>
              </div>
            </div>
          </div>
          </Reveal>
        ) : (
          <div className="space-y-3">
            {auctions.map((a, idx) => {
              const isLive = a.status === "진행중";
              return (
                <Reveal key={a._id} delay={Math.min(idx, 4) * 80}>
                  <div
                    onClick={() => router.push(`/auction/${a._id}`)}
                    className={`relative rounded-2xl p-px cursor-pointer group transition-all duration-300 ${isLive ? "bg-gradient-to-r from-emerald-500/50 via-white/[0.06] to-white/[0.02] shadow-[0_10px_40px_-12px_rgba(16,185,129,0.25)]" : "bg-gradient-to-b from-white/[0.08] to-white/[0.02] hover:from-[#e91e3f]/40"}`}
                  >
                    <div className="rounded-2xl bg-[#111111]/95 p-5 md:p-6 flex items-center gap-4 md:gap-5 group-hover:bg-[#141414] transition-colors">
                      {/* 상태 */}
                      <div className="shrink-0 flex flex-col items-center gap-1.5 w-16">
                        {isLive ? (
                          <>
                            <span className="relative flex w-3 h-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
                            </span>
                            <span className="text-[9px] font-black tracking-widest text-emerald-400">LIVE</span>
                          </>
                        ) : a.status === "종료" ? (
                          <>
                            <span className="w-3 h-3 rounded-full bg-white/15"></span>
                            <span className="text-[9px] font-black tracking-widest text-gray-500">종료</span>
                          </>
                        ) : (
                          <>
                            <span className="w-3 h-3 rounded-full bg-blue-400/70"></span>
                            <span className="text-[9px] font-black tracking-widest text-blue-400">준비중</span>
                          </>
                        )}
                      </div>

                      <div className="w-px self-stretch bg-white/5 shrink-0"></div>

                      {/* 정보 */}
                      <div className="min-w-0 flex-1">
                        <p className={`text-base md:text-lg font-black truncate transition-colors ${isLive ? "text-white" : "text-gray-200"} group-hover:text-[#ff5c77]`}>{a.title}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="text-[10px] font-bold text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">리더 {a.leaderCount}</span>
                          <span className="text-[10px] font-bold text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">선수 {a.playerCount}</span>
                          <span className="text-[10px] font-bold text-gray-600 px-1">{new Date(a.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}</span>
                        </div>
                      </div>

                      {isLive && <span className="hidden sm:block shrink-0 text-[11px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-1.5 rounded-full">지금 입장하기</span>}
                      {isAdmin && <button onClick={(e) => { e.stopPropagation(); setDeleteId(a._id); }} className="shrink-0 text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-3 py-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100">삭제</button>}
                      <span className="shrink-0 text-gray-600 group-hover:text-[#e91e3f] group-hover:translate-x-1 transition-all">→</span>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </div>

      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">경매장과 모든 기록·채팅이 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 whitespace-pre-line">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
