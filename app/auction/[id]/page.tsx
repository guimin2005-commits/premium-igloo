"use client";

import React, { useState, useEffect, useRef, use } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];
const POLL_MS = 1500;

export default function AuctionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [auction, setAuction] = useState<any>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [role, setRole] = useState<string>("host"); // "host" | 리더 인덱스 문자열
  const [bidInput, setBidInput] = useState("");
  const [soldSlotOpen, setSoldSlotOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastChatAt = useRef<string | null>(null);
  const chatCooldown = useRef(0);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── 폴링 ──
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const poll = async () => {
      try {
        const url = `/api/auction/${id}${lastChatAt.current ? `?chatSince=${encodeURIComponent(lastChatAt.current)}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();
        if (!alive || !d.success) return;
        setAuction(d.auction);
        if (d.chat?.length) {
          setChat((prev) => {
            const merged = [...prev, ...d.chat];
            return merged.slice(-150);
          });
          lastChatAt.current = d.chat[d.chat.length - 1].createdAt;
        }
      } catch {}
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [id, isAdmin]);

  // 타이머 표시용 시계
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // 채팅 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  const act = async (payload: any) => {
    try {
      const res = await fetch(`/api/auction/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!d.success && d.message) showToast(`⚠️ ${d.message}`);
      return d;
    } catch {
      showToast("⚠️ 서버 통신 오류");
      return { success: false };
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    if (Date.now() - chatCooldown.current < 2000) { showToast("⏱ 도배 방지: 2초에 한 번만 보낼 수 있어요"); return; }
    chatCooldown.current = Date.now();
    setChatInput("");
    await act({ action: "chat", message: msg, userName: session?.user?.name, avatar: session?.user?.image || "" });
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }
  if (!auction) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">경매장 입장 중...</div>;

  const S = auction.settings;
  const totalSlots = S.slotTank + S.slotDealer + S.slotHealer;
  const cur = auction.current;
  const curPlayer = cur.playerIdx !== null ? auction.players[cur.playerIdx] : null;
  const curLeader = cur.leaderIdx !== null ? auction.leaders[cur.leaderIdx] : null;
  const myLeaderIdx = role === "host" ? null : Number(role);
  const myLeader = myLeaderIdx !== null ? auction.leaders[myLeaderIdx] : null;
  const timeLeft = cur.endsAt ? Math.max(0, Math.ceil((new Date(cur.endsAt).getTime() - now) / 1000)) : null;

  const basePrice = curPlayer?.isAllPos ? S.goldenBasePrice : S.basePrice;
  const nextMinBid = cur.leaderIdx === null ? basePrice : cur.price + S.minIncrement;

  const slotFilled = (leader: any, slot: string) => leader.roster.filter((r: any) => r.slot === slot).length;
  const canSeePos = (p: any, pIdx: number) =>
    role === "host" || p.status === "낙찰" || (myLeaderIdx !== null && p.scoutedBy.includes(myLeaderIdx));

  const doBid = async (amount: number) => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 리더 역할을 선택하세요"); return; }
    await act({ action: "bid", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx, amount });
  };

  const doAllin = async () => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 리더 역할을 선택하세요"); return; }
    if (!confirm("🔥 올인하시겠습니까? (남은 슬롯 최소 예산 제외 전액 베팅)")) return;
    await act({ action: "allin", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx });
  };

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* 상단 바 */}
      <div className="sticky top-16 z-30 w-full px-4 md:px-6 py-3 bg-[#090909]/90 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
          <button onClick={() => router.push("/auction")} className="text-xs font-bold text-gray-500 hover:text-white transition-colors">← 목록</button>
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${auction.status === "진행중" ? "bg-emerald-500/15 text-emerald-400" : auction.status === "종료" ? "bg-white/5 text-gray-500" : "bg-blue-500/15 text-blue-400"}`}>{auction.status}</span>
          <h1 className="text-sm md:text-base font-black text-white truncate flex-1">{auction.title}</h1>

          {/* 역할 선택 */}
          <select value={role} onChange={(e) => setRole(e.target.value)} className="bg-[#1a1a1a] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-bold outline-none focus:border-[#e91e3f] [color-scheme:dark]">
            <option value="host">🎙 진행자</option>
            {auction.leaders.map((l: any, i: number) => (
              <option key={i} value={i}>👑 {l.name}{l.position ? ` (${l.position})` : ""}</option>
            ))}
          </select>

          {role === "host" && auction.status === "준비중" && (
            <button onClick={() => act({ action: "host:start" })} className="text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg transition-colors">▶ 경매 시작</button>
          )}
          {role === "host" && auction.status === "진행중" && (
            <button onClick={() => { if (confirm("경매를 종료하시겠습니까?")) act({ action: "host:end" }); }} className="text-xs font-black bg-white/10 hover:bg-red-500/80 text-white px-4 py-1.5 rounded-lg transition-colors">■ 종료</button>
          )}
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-6 flex-1 grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ═══ 좌측 2열: 경매 메인 ═══ */}
        <div className="lg:col-span-2 space-y-5">

          {/* 현재 경매 카드 */}
          <div className="relative rounded-2xl bg-gradient-to-b from-[#e91e3f]/50 via-[#e91e3f]/15 to-transparent p-px">
            <div className="rounded-2xl bg-[#120a0c] p-6 md:p-8 relative overflow-hidden min-h-[220px]">
              <div className="absolute -top-16 -right-16 w-52 h-52 bg-[#e91e3f]/12 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite]"></div>

              {curPlayer ? (
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f]/80 uppercase mb-2">
                        {curPlayer.isAllPos ? "✨ Golden Card" : curPlayer.phase === 1 ? "Phase 1 · 탱일까? 아닐까?" : "Phase 2"}
                      </p>
                      <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
                        {curPlayer.isAllPos ? <span className="lux-shimmer">올 포지션 선수</span> : curPlayer.alias}
                      </h2>
                      {curPlayer.isAllPos ? (
                        <p className="text-xs text-gray-400">티어 비공개 · 스카우터 불가 · 낙찰 시 슬롯 자유 배정 (이후 변경 불가)</p>
                      ) : (
                        <div className="flex gap-2">
                          <span className="text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">최고 {curPlayer.peakTier || "?"}</span>
                          <span className="text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">현재 {curPlayer.currentTier || "?"}</span>
                          {canSeePos(curPlayer, cur.playerIdx) && (
                            <span className="text-[11px] font-bold bg-[#e91e3f]/10 border border-[#e91e3f]/25 text-[#e91e3f] px-2.5 py-1 rounded-full">🔍 주 {curPlayer.mainPos || "?"} / 부 {curPlayer.subPos || "-"}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 타이머 */}
                    {timeLeft !== null && (
                      <div className={`shrink-0 w-16 h-16 rounded-2xl border flex flex-col items-center justify-center ${timeLeft <= 5 ? "border-[#e91e3f] bg-[#e91e3f]/10" : "border-white/10 bg-black/30"}`}>
                        <span className={`text-2xl font-black tabular-nums ${timeLeft <= 5 ? "text-[#e91e3f]" : "text-white"}`}>{timeLeft}</span>
                        <span className="text-[8px] font-bold text-gray-500 tracking-widest">SEC</span>
                      </div>
                    )}
                  </div>

                  {/* 현재가 */}
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 mb-1">{cur.leaderIdx === null ? `시작가` : `현재 최고가${cur.isAllin ? " · 🔥 올인" : ""}`}</p>
                      <p className="text-4xl md:text-5xl font-black text-[#e91e3f] tracking-tighter tabular-nums">
                        {(cur.leaderIdx === null ? basePrice : cur.price).toLocaleString()}<span className="text-base text-gray-400 ml-1.5">pt</span>
                      </p>
                      {curLeader && <p className="text-xs font-bold text-white mt-1.5">👑 {curLeader.name}</p>}
                    </div>

                    {/* 입찰 컨트롤 (리더 역할일 때) */}
                    {role !== "host" && auction.status === "진행중" && (
                      <div className="flex flex-wrap items-center gap-2">
                        {[S.minIncrement, S.minIncrement * 5, S.minIncrement * 10].map((inc) => (
                          <button key={inc} onClick={() => doBid((cur.leaderIdx === null ? basePrice : cur.price + inc) )} className="px-4 py-2.5 text-xs font-black bg-white/5 border border-white/10 hover:border-[#e91e3f]/50 hover:bg-[#e91e3f]/10 text-white rounded-xl transition-all">
                            +{inc.toLocaleString()}
                          </button>
                        ))}
                        <input type="number" placeholder={`${nextMinBid.toLocaleString()}~`} value={bidInput} onChange={(e) => setBidInput(e.target.value)} className="w-28 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs text-center outline-none focus:border-[#e91e3f] font-bold" />
                        <button onClick={() => { const v = Number(bidInput); if (v) { doBid(v); setBidInput(""); } }} className="px-4 py-2.5 text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl transition-colors shadow-[0_4px_16px_rgba(233,30,63,0.4)]">입찰</button>
                        <button onClick={doAllin} className="px-4 py-2.5 text-xs font-black bg-gradient-to-r from-orange-600 to-[#e91e3f] hover:brightness-110 text-white rounded-xl transition-all">🔥 올인</button>
                      </div>
                    )}

                    {/* 진행자 컨트롤 */}
                    {role === "host" && (
                      <div className="flex gap-2">
                        <button onClick={() => setSoldSlotOpen(true)} disabled={cur.leaderIdx === null} className="px-5 py-2.5 text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors">✅ 낙찰</button>
                        <button onClick={() => act({ action: "host:pass", playerIdx: cur.playerIdx })} className="px-5 py-2.5 text-xs font-black bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">↩ 유찰</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative z-10 h-full flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-4xl mb-4">🔨</p>
                  <p className="text-white font-black">대기 중</p>
                  <p className="text-xs text-gray-500 mt-1.5">{role === "host" ? "아래 선수 목록에서 호명할 선수를 선택하세요." : "진행자가 다음 선수를 호명할 때까지 기다려주세요."}</p>
                </div>
              )}
            </div>
          </div>

          {/* 내 리더 정보 (리더 역할) */}
          {myLeader && (
            <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5 flex flex-wrap items-center gap-x-8 gap-y-2">
              <div><p className="text-[9px] font-black tracking-widest text-gray-600 uppercase">My Points</p><p className="text-xl font-black text-[#e91e3f] tabular-nums">{myLeader.points.toLocaleString()}pt</p></div>
              <div><p className="text-[9px] font-black tracking-widest text-gray-600 uppercase">Slots</p>
                <p className="text-xs font-bold text-gray-300 mt-1">
                  탱 {slotFilled(myLeader, "탱커")}/{S.slotTank} · 딜 {slotFilled(myLeader, "딜러")}/{S.slotDealer} · 힐 {slotFilled(myLeader, "힐러")}/{S.slotHealer}
                </p>
              </div>
              {myLeader.position === "탱커" && <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full">탱커 리더 — 1페이즈 참가 불가</span>}
            </div>
          )}

          {/* 팀 현황판 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5">
            <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase mb-4">팀 현황판</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {auction.leaders.map((l: any, li: number) => (
                <div key={li} className={`rounded-xl border p-4 ${cur.leaderIdx === li ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.05]" : "border-white/5 bg-black/20"}`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-sm font-black text-white">👑 {l.name} <span className="text-[10px] text-gray-500 font-bold">{l.position && `· ${l.position}`}</span></p>
                    <p className="text-xs font-black text-[#e91e3f] tabular-nums">{l.points.toLocaleString()}pt</p>
                  </div>
                  <div className="space-y-1">
                    {l.roster.map((r: any, ri: number) => (
                      <div key={ri} className="flex items-center gap-2 text-[11px]">
                        <span className={`shrink-0 w-8 text-center font-black rounded px-1 py-0.5 ${r.slot === "탱커" ? "bg-blue-500/15 text-blue-400" : r.slot === "딜러" ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "bg-emerald-500/15 text-emerald-400"}`}>{r.slot[0]}</span>
                        <span className="text-gray-300 font-bold truncate">{r.golden ? "✨ " : ""}{auction.players[r.playerIdx]?.alias}</span>
                        <span className="ml-auto text-gray-600 tabular-nums">{r.price.toLocaleString()}pt</span>
                      </div>
                    ))}
                    {l.roster.length === 0 && <p className="text-[10px] text-gray-700">아직 낙찰 선수 없음</p>}
                    {Array.from({ length: totalSlots - l.roster.length }).map((_, i) => (
                      <div key={`e${i}`} className="h-[18px] rounded border border-dashed border-white/5"></div>
                    ))}
                  </div>
                  {/* 종료 후 포지션 체인지 */}
                  {auction.status === "종료" && role === "host" && !l.positionChanged && l.roster.length >= 2 && (
                    <button onClick={() => {
                      const a = prompt(`${l.name} 팀 — 교환할 첫 번째 선수 번호 (1~${l.roster.length})`);
                      const b = prompt(`두 번째 선수 번호 (1~${l.roster.length})`);
                      if (a && b) act({ action: "host:posSwap", leaderIdx: li, a: Number(a) - 1, b: Number(b) - 1 });
                    }} className="mt-2.5 w-full text-[10px] font-bold text-gray-500 hover:text-white bg-white/5 py-1.5 rounded-lg transition-colors">🔄 포지션 체인지 ({S.posChangeCost.toLocaleString()}pt · 1회)</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 선수 목록 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">선수 목록</p>
              {role === "host" && auction.status === "진행중" && auction.players.some((p: any) => p.status === "유찰") && !auction.players.some((p: any) => p.status === "대기" || p.status === "경매중") && (
                <button onClick={() => { if (confirm("유찰 선수를 빈 슬롯 팀에 랜덤 배정하시겠습니까? (포인트 최저 팀 우선)")) act({ action: "host:assignPassed" }); }} className="text-[10px] font-black bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">🎲 유찰 랜덤 배정</button>
              )}
            </div>

            {[1, 2].map((phase) => {
              const list = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.phase === phase);
              if (list.length === 0) return null;
              return (
                <div key={phase} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-black text-gray-600 mb-2">{phase === 1 ? "PHASE 1 · 탱일까? 아닐까?" : "PHASE 2 · 일반 + 황금카드"}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {list.map(({ p, i }: any) => (
                      <div key={i} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border text-xs ${p.status === "경매중" ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.06]" : p.status === "낙찰" ? "border-white/5 bg-black/20 opacity-50" : p.status === "유찰" ? "border-orange-500/20 bg-orange-500/[0.03]" : "border-white/5 bg-black/20"}`}>
                        <span className="font-bold text-white truncate">{p.isAllPos ? "✨ 올 포지션" : p.alias}</span>
                        {!p.isAllPos && <span className="text-gray-600 shrink-0">{p.peakTier}/{p.currentTier}</span>}
                        {canSeePos(p, i) && !p.isAllPos && <span className="text-[#e91e3f] font-bold shrink-0">{p.mainPos}{p.subPos ? `·${p.subPos}` : ""}</span>}
                        <span className="ml-auto shrink-0">
                          {p.status === "낙찰" ? <span className="text-gray-500">→ {auction.leaders[p.soldTo]?.name}</span>
                            : p.status === "유찰" ? <span className="text-orange-400 font-bold">유찰</span>
                            : p.status === "경매중" ? <span className="text-[#e91e3f] font-black animate-pulse">LIVE</span>
                            : role === "host" && auction.status === "진행중" ? (
                              <button onClick={() => act({ action: "host:call", playerIdx: i })} className="text-[10px] font-black text-white bg-[#e91e3f]/80 hover:bg-[#e91e3f] px-2.5 py-1 rounded transition-colors">📢 호명</button>
                            ) : myLeaderIdx !== null && !p.isAllPos && !p.scoutedBy.includes(myLeaderIdx) && p.status === "대기" ? (
                              <button onClick={() => { if (confirm(`스카우터 사용 (${S.scoutCost.toLocaleString()}pt) — ${p.alias}의 포지션을 확인합니까?`)) act({ action: "scout", leaderIdx: myLeaderIdx, playerIdx: i }); }} className="text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 px-2 py-1 rounded transition-colors">🔍</button>
                            ) : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ 우측: 실시간 채팅 + 로그 ═══ */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-36 lg:self-start lg:max-h-[calc(100vh-11rem)]">
          {/* 채팅 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 flex flex-col flex-1 min-h-[380px] lg:min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
              <span className="text-xs font-black text-white">실시간 채팅</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {chat.length === 0 && <p className="text-center text-[11px] text-gray-700 py-6">아직 메시지가 없습니다.</p>}
              {chat.map((m, i) => m.isSystem ? (
                <p key={i} className="text-[11px] font-bold text-[#e91e3f]/90 bg-[#e91e3f]/[0.05] border border-[#e91e3f]/10 rounded-lg px-3 py-1.5">{m.message}</p>
              ) : (
                <div key={i} className="flex items-start gap-2">
                  {m.avatar ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full shrink-0 mt-0.5" /> : <span className="w-5 h-5 rounded-full bg-white/10 shrink-0 mt-0.5"></span>}
                  <p className="text-xs leading-relaxed min-w-0"><span className="font-bold text-gray-300">{m.userName}</span> <span className="text-gray-400 break-all">{m.message}</span></p>
                </div>
              ))}
              <div ref={chatEndRef}></div>
            </div>
            <form onSubmit={sendChat} className="p-3 border-t border-white/5 flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} maxLength={200} placeholder="메시지 입력..." className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600" />
              <button type="submit" className="px-4 py-2.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-xs font-black rounded-xl transition-colors">전송</button>
            </form>
          </div>

          {/* 입찰 로그 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-4 max-h-44 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10">
            <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase mb-2.5">경매 로그</p>
            <div className="space-y-1">
              {[...auction.log].reverse().map((l: any, i: number) => (
                <p key={i} className="text-[10px] text-gray-500 leading-relaxed"><span className="text-gray-700">{new Date(l.t).toLocaleTimeString("ko-KR", { hour12: false })}</span> {l.msg}</p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 낙찰 슬롯 선택 모달 */}
      {soldSlotOpen && curLeader && curPlayer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-lg font-black text-white mb-2">✅ 낙찰 — 슬롯 배정</h2>
            <p className="text-xs text-gray-400 mb-6">{curPlayer.isAllPos ? "올 포지션 선수" : curPlayer.alias} → {curLeader.name} · {cur.price.toLocaleString()}pt<br/>{curPlayer.isAllPos && <span className="text-[#e91e3f] font-bold">황금카드: 슬롯제 무시, 자유 배정 (이후 변경 불가)</span>}</p>
            <div className="grid grid-cols-3 gap-2 mb-6">
              {["탱커", "딜러", "힐러"].map((slot) => {
                const limit = slot === "탱커" ? S.slotTank : slot === "딜러" ? S.slotDealer : S.slotHealer;
                const filled = slotFilled(curLeader, slot);
                const full = filled >= limit;
                return (
                  <button key={slot} disabled={full} onClick={async () => { const d = await act({ action: "host:sold", slot }); if (d.success) setSoldSlotOpen(false); }} className={`py-4 rounded-xl text-sm font-black border transition-all ${full ? "border-white/5 bg-white/[0.02] text-gray-700 cursor-not-allowed" : "border-white/10 bg-white/5 text-white hover:border-[#e91e3f] hover:bg-[#e91e3f]/10"}`}>
                    {slot}<br/><span className="text-[10px] font-bold text-gray-500">{filled}/{limit}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSoldSlotOpen(false)} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">취소</button>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-[#1a1a1a] border border-white/15 text-white text-xs font-bold px-5 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </main>
  );
}
