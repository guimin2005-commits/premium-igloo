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
          setChat((prev) => [...prev, ...d.chat].slice(-150));
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
      if (!d.success && d.message) showToast(d.message);
      return d;
    } catch {
      showToast("서버 통신 오류");
      return { success: false };
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    if (Date.now() - chatCooldown.current < 2000) { showToast("도배 방지: 2초에 한 번만 보낼 수 있어요"); return; }
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

  // 슬롯 배정 대기 상태
  const pa = auction.pendingAssign;
  const hasPending = pa && pa.playerIdx !== null && pa.playerIdx !== undefined;
  const pendingPlayer = hasPending ? auction.players[pa.playerIdx] : null;
  const pendingLeader = hasPending ? auction.leaders[pa.leaderIdx] : null;
  const iAmAssigner = hasPending && (role === "host" || myLeaderIdx === pa.leaderIdx);

  const basePrice = curPlayer?.isAllPos ? S.goldenBasePrice : S.basePrice;
  const nextMinBid = cur.leaderIdx === null ? basePrice : cur.price + S.minIncrement;

  const slotFilled = (leader: any, slot: string) => leader.roster.filter((r: any) => r.slot === slot).length;
  const canSeePos = (p: any) =>
    role === "host" || p.status === "낙찰" || (myLeaderIdx !== null && p.scoutedBy.includes(myLeaderIdx));

  const doBid = async (amount: number) => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 팀장 역할을 선택하세요"); return; }
    await act({ action: "bid", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx, amount });
  };

  const doAllin = async () => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 팀장 역할을 선택하세요"); return; }
    if (!confirm("올인하시겠습니까? (남은 슬롯 최소 예산을 제외한 전액 베팅)")) return;
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
            <option value="host">진행자</option>
            {auction.leaders.map((l: any, i: number) => (
              <option key={i} value={i}>팀장 · {l.name}{l.position ? ` (${l.position})` : ""}</option>
            ))}
          </select>

          {role === "host" && auction.status === "준비중" && (
            <button onClick={() => act({ action: "host:start" })} className="text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg transition-colors">경매 시작</button>
          )}
          {role === "host" && auction.status === "진행중" && (
            <button onClick={() => { if (confirm("경매를 종료하시겠습니까?")) act({ action: "host:end" }); }} className="text-xs font-black bg-white/10 hover:bg-red-500/80 text-white px-4 py-1.5 rounded-lg transition-colors">종료</button>
          )}
        </div>
      </div>

      <div className="w-full max-w-[1720px] mx-auto px-4 md:px-8 py-6 flex-1 flex flex-col xl:flex-row gap-5 items-start">

        {/* ═══ 좌측 세로 레일: 팀 현황판 ═══ */}
        <aside className="w-full xl:w-[300px] shrink-0 order-2 xl:order-1 xl:sticky xl:top-36 xl:max-h-[calc(100vh-11rem)] xl:overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full xl:pr-1">
          <div className="flex items-baseline gap-3 mb-3 px-1">
            <span className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f]">TEAMS</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
            {auction.leaders.map((l: any, li: number) => (
              <div key={li} className={`rounded-2xl border p-4 transition-colors ${cur.leaderIdx === li ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.05]" : "border-white/5 bg-[#111111]/95"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-black text-white truncate">{l.name}</p>
                  {l.position && <span className="text-[9px] font-black text-gray-500 bg-white/5 px-2 py-0.5 rounded-full shrink-0">{l.position}</span>}
                </div>
                <p className="text-lg font-black text-[#e91e3f] tabular-nums mb-3">{l.points.toLocaleString()}<span className="text-[10px] text-gray-500 ml-1">pt</span></p>
                <div className="space-y-1.5">
                  {l.roster.map((r: any, ri: number) => (
                    <div key={ri} className="flex items-center gap-2 text-[11px] bg-black/25 rounded-lg px-2.5 py-1.5">
                      <span className={`shrink-0 w-7 text-center font-black rounded px-1 py-0.5 text-[10px] ${r.slot === "탱커" ? "bg-blue-500/15 text-blue-400" : r.slot === "딜러" ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "bg-emerald-500/15 text-emerald-400"}`}>{r.slot[0]}</span>
                      <span className="text-gray-300 font-bold truncate">
                        {r.playerIdx === -1 ? <>{l.name} <span className="text-[9px] text-gray-500 font-black">팀장</span></> : auction.players[r.playerIdx]?.alias}
                        {r.golden ? <span className="ml-1 text-[9px] text-[#e91e3f] font-black">ALL</span> : ""}
                      </span>
                      <span className="ml-auto text-gray-600 tabular-nums text-[10px]">{r.playerIdx === -1 ? "" : `${r.price.toLocaleString()}`}</span>
                    </div>
                  ))}
                  {Array.from({ length: totalSlots - l.roster.length }).map((_, i) => (
                    <div key={`e${i}`} className="h-[26px] rounded-lg border border-dashed border-white/5 flex items-center justify-center">
                      <span className="text-[8px] font-black tracking-widest text-white/10">EMPTY</span>
                    </div>
                  ))}
                </div>
                {auction.status === "종료" && role === "host" && !l.positionChanged && l.roster.length >= 2 && (
                  <button onClick={() => {
                    const a = prompt(`${l.name} 팀 — 교환할 첫 번째 선수 번호 (1~${l.roster.length})`);
                    const b = prompt(`두 번째 선수 번호 (1~${l.roster.length})`);
                    if (a && b) act({ action: "host:posSwap", leaderIdx: li, a: Number(a) - 1, b: Number(b) - 1 });
                  }} className="mt-2.5 w-full text-[10px] font-bold text-gray-500 hover:text-white bg-white/5 py-1.5 rounded-lg transition-colors">포지션 체인지 ({S.posChangeCost.toLocaleString()}pt · 1회)</button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* ═══ 중앙: 경매 메인 ═══ */}
        <div className="flex-1 min-w-0 w-full space-y-5 order-1 xl:order-2">

          {/* 슬롯 배정 대기 배너 */}
          {hasPending && !iAmAssigner && (
            <div className="rounded-2xl border border-[#e91e3f]/25 bg-[#e91e3f]/[0.05] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#e91e3f] animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{pendingLeader?.name}</span> 팀장이 <span className="text-[#e91e3f]">{pendingPlayer?.alias}</span> 선수의 슬롯을 배정하고 있습니다...</p>
            </div>
          )}

          {/* 현재 경매 카드 */}
          <div className="relative rounded-2xl bg-gradient-to-b from-[#e91e3f]/50 via-[#e91e3f]/15 to-transparent p-px">
            <div className="rounded-2xl bg-[#120a0c] p-6 md:p-8 relative overflow-hidden min-h-[220px]">
              <div className="absolute -top-16 -right-16 w-52 h-52 bg-[#e91e3f]/12 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite]"></div>

              {curPlayer ? (
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f]/80 uppercase mb-2">
                        {curPlayer.isAllPos ? "Golden Card" : curPlayer.phase === 1 ? "Phase 1 · 탱일까? 아닐까?" : "Phase 2"}
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
                          {canSeePos(curPlayer) && (
                            <span className="text-[11px] font-bold bg-[#e91e3f]/10 border border-[#e91e3f]/25 text-[#e91e3f] px-2.5 py-1 rounded-full">주 {curPlayer.mainPos || "?"} / 부 {curPlayer.subPos || "-"}</span>
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
                      <p className="text-[10px] font-bold text-gray-500 mb-1">{cur.leaderIdx === null ? "시작가" : `현재 최고가${cur.isAllin ? " · 올인" : ""}`}</p>
                      <p className="text-4xl md:text-5xl font-black text-[#e91e3f] tracking-tighter tabular-nums">
                        {(cur.leaderIdx === null ? basePrice : cur.price).toLocaleString()}<span className="text-base text-gray-400 ml-1.5">pt</span>
                      </p>
                      {curLeader && <p className="text-xs font-bold text-white mt-1.5">{curLeader.name}</p>}
                    </div>

                    {/* 카운트다운 종료 시 입찰 마감 */}
                    {role !== "host" && auction.status === "진행중" && timeLeft === 0 && (
                      <div className="px-5 py-3 rounded-xl border border-white/10 bg-white/[0.03]">
                        <p className="text-xs font-black text-gray-400">입찰 마감 — 진행자의 낙찰/유찰 처리를 기다리는 중</p>
                      </div>
                    )}

                    {/* 입찰 컨트롤 (팀장 역할일 때) */}
                    {role !== "host" && auction.status === "진행중" && timeLeft !== 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {[S.minIncrement, S.minIncrement * 5, S.minIncrement * 10].map((inc) => (
                          <button key={inc} onClick={() => doBid(cur.leaderIdx === null ? basePrice : cur.price + inc)} className="px-4 py-2.5 text-xs font-black bg-white/5 border border-white/10 hover:border-[#e91e3f]/50 hover:bg-[#e91e3f]/10 text-white rounded-xl transition-all">
                            +{inc.toLocaleString()}
                          </button>
                        ))}
                        <input type="number" placeholder={`${nextMinBid.toLocaleString()}~`} value={bidInput} onChange={(e) => setBidInput(e.target.value)} className="w-28 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs text-center outline-none focus:border-[#e91e3f] font-bold" />
                        <button onClick={() => { const v = Number(bidInput); if (v) { doBid(v); setBidInput(""); } }} className="px-4 py-2.5 text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl transition-colors shadow-[0_4px_16px_rgba(233,30,63,0.4)]">입찰</button>
                        <button onClick={doAllin} className="px-4 py-2.5 text-xs font-black bg-gradient-to-r from-orange-600 to-[#e91e3f] hover:brightness-110 text-white rounded-xl transition-all">올인</button>
                      </div>
                    )}

                    {/* 진행자 컨트롤 */}
                    {role === "host" && (
                      <div className="flex gap-2">
                        <button onClick={() => { if (cur.leaderIdx !== null && confirm(`${curLeader?.name}에게 ${cur.price.toLocaleString()}pt 낙찰 확정합니까? (슬롯은 팀장이 배정)`)) act({ action: "host:sold" }); }} disabled={cur.leaderIdx === null} className="px-5 py-2.5 text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors">낙찰</button>
                        <button onClick={() => act({ action: "host:pass", playerIdx: cur.playerIdx })} className="px-5 py-2.5 text-xs font-black bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">유찰</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative z-10 h-full flex flex-col items-center justify-center py-10 text-center">
                  <p className="text-[10px] font-black tracking-[0.35em] text-gray-600 uppercase mb-3">Standby</p>
                  <p className="text-white font-black">대기 중</p>
                  <p className="text-xs text-gray-500 mt-1.5">{hasPending ? "낙찰 선수의 슬롯 배정을 기다리고 있습니다." : role === "host" ? "아래 선수 목록에서 호명할 선수를 선택하세요." : "진행자가 다음 선수를 호명할 때까지 기다려주세요."}</p>
                </div>
              )}
            </div>
          </div>

          {/* 내 팀장 정보 */}
          {myLeader && (
            <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5 flex flex-wrap items-center gap-x-8 gap-y-2">
              <div><p className="text-[9px] font-black tracking-widest text-gray-600 uppercase">My Points</p><p className="text-xl font-black text-[#e91e3f] tabular-nums">{myLeader.points.toLocaleString()}pt</p></div>
              <div><p className="text-[9px] font-black tracking-widest text-gray-600 uppercase">Slots</p>
                <p className="text-xs font-bold text-gray-300 mt-1">
                  탱 {slotFilled(myLeader, "탱커")}/{S.slotTank} · 딜 {slotFilled(myLeader, "딜러")}/{S.slotDealer} · 힐 {slotFilled(myLeader, "힐러")}/{S.slotHealer}
                </p>
              </div>
              {myLeader.position === "탱커" && <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-full">탱커 팀장 — 1페이즈 참가 불가</span>}
            </div>
          )}

          {/* 선수 목록 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">선수 목록</p>
              {role === "host" && auction.status === "진행중" && auction.players.some((p: any) => p.status === "유찰") && !auction.players.some((p: any) => p.status === "대기" || p.status === "경매중" || p.status === "배정중") && (
                <button onClick={() => { if (confirm("유찰 선수를 빈 슬롯 팀에 랜덤 배정하시겠습니까? (포인트 최저 팀 우선)")) act({ action: "host:assignPassed" }); }} className="text-[10px] font-black bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">유찰 랜덤 배정</button>
              )}
            </div>

            {[1, 2].map((phase) => {
              const list = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.phase === phase);
              if (list.length === 0) return null;
              return (
                <div key={phase} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-black text-gray-600 mb-2">{phase === 1 ? "PHASE 1 · 탱일까? 아닐까?" : "PHASE 2 · 일반 + 황금카드"}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                    {list.map(({ p, i }: any) => (
                      <div key={i} className={`flex flex-col rounded-xl border p-3.5 transition-colors ${p.status === "경매중" ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.06]" : p.status === "낙찰" ? "border-white/5 bg-black/20 opacity-45" : p.status === "유찰" ? "border-orange-500/20 bg-orange-500/[0.03]" : p.status === "배정중" ? "border-[#e91e3f]/25 bg-[#e91e3f]/[0.03]" : "border-white/5 bg-black/25 hover:border-white/15"}`}>
                        {/* 상태 라벨 */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[8px] font-black tracking-[0.2em] text-gray-600 uppercase">{p.isAllPos ? "Golden" : `P${String(i + 1).padStart(2, "0")}`}</span>
                          {p.status === "경매중" ? <span className="text-[9px] font-black text-[#e91e3f] animate-pulse">LIVE</span>
                            : p.status === "배정중" ? <span className="text-[9px] font-black text-[#e91e3f]">배정 중</span>
                            : p.status === "유찰" ? <span className="text-[9px] font-black text-orange-400">유찰</span>
                            : p.status === "낙찰" ? <span className="text-[9px] font-black text-gray-500">SOLD</span>
                            : null}
                        </div>
                        {/* 이름 */}
                        <p className={`text-sm font-black truncate mb-1 ${p.isAllPos ? "lux-shimmer" : "text-white"}`}>{p.isAllPos ? "올 포지션" : p.alias}</p>
                        {/* 티어 / 포지션 */}
                        {p.isAllPos ? (
                          <p className="text-[10px] text-gray-600 mb-2">티어 비공개</p>
                        ) : (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-500">최고 {p.peakTier || "?"} · 현재 {p.currentTier || "?"}</p>
                            {canSeePos(p) && <p className="text-[10px] font-bold text-[#e91e3f] mt-0.5">주 {p.mainPos || "?"}{p.subPos ? ` / 부 ${p.subPos}` : ""}</p>}
                          </div>
                        )}
                        {/* 하단 액션 */}
                        <div className="mt-auto pt-1.5 border-t border-white/[0.05]">
                          {p.status === "낙찰" ? (
                            <p className="text-[10px] font-bold text-gray-500 truncate">{auction.leaders[p.soldTo]?.name} · {p.soldPrice?.toLocaleString()}pt</p>
                          ) : role === "host" && auction.status === "진행중" && (p.status === "대기" || p.status === "유찰") ? (
                            <button onClick={() => act({ action: "host:call", playerIdx: i })} className="w-full text-[10px] font-black text-white bg-[#e91e3f]/80 hover:bg-[#e91e3f] py-1.5 rounded-lg transition-colors">호명</button>
                          ) : myLeaderIdx !== null && !p.isAllPos && !p.scoutedBy.includes(myLeaderIdx) && p.status === "대기" ? (
                            <button onClick={() => { if (confirm(`스카우터 사용 (${S.scoutCost.toLocaleString()}pt) — ${p.alias}의 포지션을 확인합니까?`)) act({ action: "scout", leaderIdx: myLeaderIdx, playerIdx: i }); }} className="w-full text-[10px] font-bold text-gray-400 hover:text-white bg-white/5 py-1.5 rounded-lg transition-colors">스카우터</button>
                          ) : (
                            <p className="text-[10px] text-gray-700">{p.status === "경매중" ? "경매 진행 중" : "대기"}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ 우측: 실시간 채팅 + 로그 ═══ */}
        <div className="w-full xl:w-[360px] shrink-0 order-3 flex flex-col gap-5 xl:sticky xl:top-36 xl:self-start xl:max-h-[calc(100vh-11rem)]">
          {/* 채팅 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 flex flex-col flex-1 min-h-[380px] lg:min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
              <span className="text-xs font-black text-white">실시간 채팅</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {chat.length === 0 && <p className="text-center text-[11px] text-gray-700 py-6">아직 메시지가 없습니다.</p>}
              {chat.map((m, i) => m.isSystem ? (
                <div key={i} className="flex items-start gap-2 bg-[#e91e3f]/[0.05] border border-[#e91e3f]/10 rounded-lg px-3 py-2">
                  {/* 확성기 아이콘 */}
                  <span className="shrink-0 mt-px w-5 h-5 rounded-md bg-[#e91e3f]/15 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3 text-[#e91e3f]">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73" />
                    </svg>
                  </span>
                  <p className="text-[11px] font-bold text-[#e91e3f]/90 leading-relaxed min-w-0">{m.message}</p>
                </div>
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

      {/* 낙찰 팀장 슬롯 배정 모달 — 낙찰받은 팀장(또는 진행자 대행)에게 표시 */}
      {hasPending && iAmAssigner && pendingLeader && pendingPlayer && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center">
            <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-3">Slot Assignment</p>
            <h2 className="text-lg font-black text-white mb-2">
              {role === "host" ? `${pendingLeader.name} 팀장 대행 배정` : "낙찰 — 슬롯을 배정하세요"}
            </h2>
            <p className="text-xs text-gray-400 mb-6">
              {pendingPlayer.isAllPos ? "올 포지션 선수" : pendingPlayer.alias} · {pa.price.toLocaleString()}pt
              {pendingPlayer.isAllPos && <><br /><span className="text-[#e91e3f] font-bold">황금카드: 자유 배정 가능 (이후 변경 불가)</span></>}
              {!pendingPlayer.isAllPos && canSeePos(pendingPlayer) && <><br /><span className="text-gray-500">주 {pendingPlayer.mainPos || "?"} / 부 {pendingPlayer.subPos || "-"}</span></>}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {["탱커", "딜러", "힐러"].map((slot) => {
                const limit = slot === "탱커" ? S.slotTank : slot === "딜러" ? S.slotDealer : S.slotHealer;
                const filled = slotFilled(pendingLeader, slot);
                const full = filled >= limit;
                return (
                  <button key={slot} disabled={full} onClick={() => act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })} className={`py-4 rounded-xl text-sm font-black border transition-all ${full ? "border-white/5 bg-white/[0.02] text-gray-700 cursor-not-allowed" : "border-white/10 bg-white/5 text-white hover:border-[#e91e3f] hover:bg-[#e91e3f]/10"}`}>
                    {slot}<br /><span className="text-[10px] font-bold text-gray-500">{filled}/{limit}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-5">배정 즉시 확정되며 변경할 수 없습니다.</p>
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
