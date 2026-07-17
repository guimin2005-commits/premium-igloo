"use client";

import React, { useState, useEffect, useRef, use, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];
const POLL_MS = 1500;

// 확성기 SVG
const MegaphoneIcon = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38c-.551.318-1.26.117-1.527-.461a20.845 20.845 0 01-1.44-4.282m3.102.069a18.03 18.03 0 01-.59-4.59c0-1.586.205-3.124.59-4.59m0 9.18a23.848 23.848 0 018.835 2.535M10.34 6.66a23.847 23.847 0 008.835-2.535m0 0A23.74 23.74 0 0018.795 3m.38 1.125a23.91 23.91 0 011.014 5.395m-1.014 8.855c-.118.38-.245.754-.38 1.125m.38-1.125a23.91 23.91 0 001.014-5.395m0-3.46c.495.413.811 1.035.811 1.73 0 .695-.316 1.317-.811 1.73" />
  </svg>
);

const SLOT_COLORS: Record<string, string> = {
  탱커: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  딜러: "bg-[#e91e3f]/15 text-[#e91e3f] border-[#e91e3f]/25",
  힐러: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
};

export default function AuctionRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);
  const myDiscordId = (session?.user as any)?.id;

  const [auction, setAuction] = useState<any>(null);
  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [role, setRole] = useState<string>("host");
  const [bidInput, setBidInput] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [soundOn, setSoundOn] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [confirmCfg, setConfirmCfg] = useState<any>(null); // {title, message, confirmLabel, onConfirm}
  const [strategyModalOpen, setStrategyModalOpen] = useState(false);
  const [posSwapTarget, setPosSwapTarget] = useState<any>(null); // {leaderIdx} 포지션 체인지 모달
  const [swapA, setSwapA] = useState(""); const [swapB, setSwapB] = useState("");
  const [moveFrom, setMoveFrom] = useState<number | null>(null); // 오버플로우: 이동할 선수 rosterIdx

  const chatBoxRef = useRef<HTMLDivElement>(null);
  const lastChatAt = useRef<string | null>(null);
  const chatIds = useRef<Set<string>>(new Set());
  const chatCooldown = useRef(0);
  const pollBusy = useRef(false);
  const autoRoleDone = useRef(false);
  const prevState = useRef<{ price: number; playerIdx: any; soldCount: number; lastTick: number }>({ price: 0, playerIdx: null, soldCount: 0, lastTick: 0 });
  const audioCtx = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(true);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // ── 사운드 (적당한 볼륨의 신스 톤) ──
  const playTone = useCallback((freq: number, dur = 0.08, gain = 0.04, type: OscillatorType = "sine") => {
    if (!soundOnRef.current) return;
    try {
      if (!audioCtx.current) audioCtx.current = new AudioContext();
      const ctx = audioCtx.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);
  const sfxBid = useCallback(() => playTone(760, 0.07, 0.035), [playTone]);
  const sfxCall = useCallback(() => { playTone(520, 0.1, 0.04); setTimeout(() => playTone(780, 0.12, 0.04), 110); }, [playTone]);
  const sfxSold = useCallback(() => { playTone(660, 0.1, 0.04); setTimeout(() => playTone(880, 0.16, 0.045), 120); }, [playTone]);
  const sfxTick = useCallback(() => playTone(1050, 0.05, 0.03, "square"), [playTone]);

  // ── 폴링 (중복 방지: in-flight 가드 + 메시지 _id 중복 제거) ──
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const poll = async () => {
      if (pollBusy.current) return;
      pollBusy.current = true;
      try {
        const url = `/api/auction/${id}${lastChatAt.current ? `?chatSince=${encodeURIComponent(lastChatAt.current)}` : ""}`;
        const res = await fetch(url, { cache: "no-store" });
        const d = await res.json();
        if (!alive || !d.success) return;

        // 사운드 트리거 (상태 변화 감지)
        const a = d.auction;
        const soldCount = a.players.filter((p: any) => p.status === "낙찰").length;
        if (prevState.current.playerIdx !== a.current.playerIdx && a.current.playerIdx !== null) sfxCall();
        else if (a.current.price > prevState.current.price && a.current.playerIdx === prevState.current.playerIdx) sfxBid();
        if (soldCount > prevState.current.soldCount) sfxSold();
        prevState.current = { ...prevState.current, price: a.current.price, playerIdx: a.current.playerIdx, soldCount };

        setAuction(a);
        if (d.chat?.length) {
          const fresh = d.chat.filter((m: any) => !chatIds.current.has(m._id));
          if (fresh.length) {
            fresh.forEach((m: any) => chatIds.current.add(m._id));
            setChat((prev) => [...prev, ...fresh].slice(-150));
            lastChatAt.current = d.chat[d.chat.length - 1].createdAt;
          }
        }
      } catch {} finally { pollBusy.current = false; }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [id, isAdmin, sfxBid, sfxCall, sfxSold]);

  // 타이머 시계 + 마감 3초 전 틱
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      const endsAt = auction?.current?.endsAt ? new Date(auction.current.endsAt).getTime() : null;
      if (endsAt) {
        const left = Math.ceil((endsAt - Date.now()) / 1000);
        if (left >= 1 && left <= 3 && left !== prevState.current.lastTick) {
          prevState.current.lastTick = left;
          sfxTick();
        }
      }
    }, 250);
    return () => clearInterval(t);
  }, [auction, sfxTick]);

  // 채팅 자동 스크롤 — 채팅 박스 내부만 스크롤 (페이지 스크롤 강제 이동 방지)
  useEffect(() => {
    const box = chatBoxRef.current;
    if (!box) return;
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  }, [chat.length]);

  // 디스코드 프로필 로드 (팀장 + 공개된 선수)
  useEffect(() => {
    if (!auction) return;
    const ids = new Set<string>();
    auction.leaders.forEach((l: any) => { if (l.discordId) ids.add(l.discordId); });
    auction.players.forEach((p: any) => { if (p.revealed && p.discordId) ids.add(p.discordId); });
    ids.forEach((did) => {
      if (profiles[did]) return;
      fetch(`/api/discord-user?id=${did}`)
        .then((r) => r.json())
        .then((u) => { if (u.success) setProfiles((prev) => ({ ...prev, [did]: u })); })
        .catch(() => {});
    });
  }, [auction]); // eslint-disable-line

  // 접속 유저 디스코드 ID가 팀장과 일치하면 자동으로 해당 팀장 화면 지정
  useEffect(() => {
    if (!auction || autoRoleDone.current || !myDiscordId) return;
    const idx = auction.leaders.findIndex((l: any) => l.discordId && l.discordId === myDiscordId);
    if (idx >= 0) { setRole(String(idx)); autoRoleDone.current = true; }
  }, [auction, myDiscordId]);

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
  const scoutLeft = cur.scoutUntil ? Math.max(0, Math.ceil((new Date(cur.scoutUntil).getTime() - now) / 1000)) : 0;
  const strategyLeft = auction.strategyUntil ? Math.max(0, Math.ceil((new Date(auction.strategyUntil).getTime() - now) / 1000)) : 0;

  const pa = auction.pendingAssign;
  const hasPending = pa && pa.playerIdx !== null && pa.playerIdx !== undefined;
  const pendingPlayer = hasPending ? auction.players[pa.playerIdx] : null;
  const pendingLeader = hasPending ? auction.leaders[pa.leaderIdx] : null;
  const iAmAssigner = hasPending && (role === "host" || myLeaderIdx === pa.leaderIdx);
  const isMyPending = hasPending && myLeaderIdx === pa.leaderIdx;

  const po = auction.pendingOverflow;
  const hasOverflow = po && po.leaderIdx !== null && po.leaderIdx !== undefined;
  const overflowLeader = hasOverflow ? auction.leaders[po.leaderIdx] : null;
  const isMyOverflow = hasOverflow && myLeaderIdx === po.leaderIdx;

  const revealPlayer = auction.reveal?.playerIdx !== null && auction.reveal?.playerIdx !== undefined ? auction.players[auction.reveal.playerIdx] : null;
  const revealProfile = revealPlayer?.discordId ? profiles[revealPlayer.discordId] : null;

  const basePrice = curPlayer?.isAllPos ? S.goldenBasePrice : S.basePrice;
  const nextMinBid = cur.leaderIdx === null ? basePrice : cur.price + S.minIncrement;

  const slotFilled = (leader: any, slot: string) => leader.roster.filter((r: any) => r.slot === slot).length;
  const slotLimitOf = (slot: string) => (slot === "탱커" ? S.slotTank : slot === "딜러" ? S.slotDealer : S.slotHealer);
  const canSeePos = (p: any) =>
    role === "host" || p.status === "낙찰" || (myLeaderIdx !== null && p.scoutedBy.includes(myLeaderIdx));
  // 팀장에게 익명 처리: 대기/경매중이 아닌 선수만 정보 공개 (호명 중엔 메인 카드에 표시)
  const isHiddenFor = (p: any) => role !== "host" && (p.status === "대기" || p.status === "배정중");

  const emptySlotsOf = (leader: any) => totalSlots - leader.roster.length;
  const allinMax = myLeader ? myLeader.points - Math.max(0, emptySlotsOf(myLeader) - 1) * S.basePrice : 0;

  const doBid = async (amount: number) => {
    if (myLeaderIdx === null) { showToast("입찰하려면 상단에서 팀장 역할을 선택하세요"); return; }
    if (myLeader && amount > myLeader.points) { showToast(`보유 Point가 부족합니다. (보유 ${myLeader.points.toLocaleString()} Point)`); return; }
    await act({ action: "bid", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx, amount });
  };

  const rosterName = (l: any, r: any) => (r.playerIdx === -1 ? l.name : auction.players[r.playerIdx]?.alias);

  // ── 팀장 슬롯 보드 (배정/오버플로우 인라인 처리) ──
  const SlotBoard = ({ leader, leaderIdx, big }: { leader: any; leaderIdx: number; big?: boolean }) => {
    const assigning = hasPending && pa.leaderIdx === leaderIdx && (role === "host" || myLeaderIdx === leaderIdx);
    const overflowing = hasOverflow && po.leaderIdx === leaderIdx && (role === "host" || myLeaderIdx === leaderIdx);
    const isGoldenAssign = assigning && pendingPlayer?.isAllPos;

    return (
      <div className={big ? "grid grid-cols-3 gap-3" : "space-y-1.5"}>
        {["탱커", "딜러", "힐러"].map((slot) => {
          const limit = slotLimitOf(slot);
          const entries = leader.roster.map((r: any, ri: number) => ({ r, ri })).filter(({ r }: any) => r.slot === slot);
          const emptyCount = Math.max(0, limit - entries.length);
          const canAssignHere = assigning && (entries.length < limit || isGoldenAssign);
          const isOverflowSlot = overflowing && po.slot === slot;

          return (
            <div key={slot} className={big ? "" : "flex flex-col gap-1"}>
              {big && (
                <p className={`text-[9px] font-black tracking-[0.2em] uppercase mb-1.5 ${slot === "탱커" ? "text-blue-400" : slot === "딜러" ? "text-[#e91e3f]" : "text-emerald-400"}`}>
                  {slot} {entries.length}/{limit}
                </p>
              )}
              <div className={big ? "space-y-1.5" : "space-y-1"}>
                {entries.map(({ r, ri }: any) => {
                  // 오버플로우 정리: 초과 슬롯의 비황금 선수 클릭 → 이동 대상 선택
                  const movable = isOverflowSlot && !r.golden;
                  const selected = moveFrom === ri;
                  return (
                    <button
                      key={ri}
                      type="button"
                      disabled={!movable}
                      onClick={() => movable && setMoveFrom(selected ? null : ri)}
                      className={`w-full flex items-center gap-2 rounded-lg px-2.5 border text-left transition-all ${big ? "py-2.5 text-xs" : "py-1.5 text-[11px]"} ${selected ? "border-[#e91e3f] bg-[#e91e3f]/15" : movable ? "border-[#e91e3f]/40 bg-[#e91e3f]/[0.06] animate-pulse cursor-pointer" : "border-white/5 bg-black/25 cursor-default"}`}
                    >
                      <span className="text-gray-200 font-bold truncate">
                        {rosterName(leader, r)}
                        {r.playerIdx === -1 && <span className="ml-1 text-[9px] text-gray-500 font-black">팀장</span>}
                        {r.golden && <span className="ml-1 text-[9px] text-[#e91e3f] font-black">ALL</span>}
                      </span>
                      <span className="ml-auto text-gray-600 tabular-nums text-[10px] shrink-0">{r.playerIdx === -1 ? "" : `${r.price.toLocaleString()} Pt`}</span>
                    </button>
                  );
                })}
                {Array.from({ length: emptyCount }).map((_, ei) => (
                  <button
                    key={`e${ei}`}
                    type="button"
                    disabled={!canAssignHere}
                    onClick={() => canAssignHere && act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })}
                    className={`w-full rounded-lg border border-dashed flex items-center justify-center transition-all ${big ? "h-10" : "h-[26px]"} ${canAssignHere ? "border-[#e91e3f] bg-[#e91e3f]/[0.08] animate-pulse cursor-pointer hover:bg-[#e91e3f]/20" : "border-white/5"}`}
                  >
                    <span className={`text-[8px] font-black tracking-widest ${canAssignHere ? "text-[#e91e3f]" : "text-white/10"}`}>{canAssignHere ? "여기에 배정" : "EMPTY"}</span>
                  </button>
                ))}
                {/* 황금카드: 꽉 찬 슬롯에도 배정 가능 */}
                {isGoldenAssign && emptyCount === 0 && (
                  <button
                    type="button"
                    onClick={() => act({ action: "assignSlot", slot, byLeaderIdx: myLeaderIdx })}
                    className={`w-full rounded-lg border border-dashed border-[#e91e3f]/60 bg-[#e91e3f]/[0.05] flex items-center justify-center transition-all hover:bg-[#e91e3f]/15 ${big ? "h-10" : "h-[26px]"}`}
                  >
                    <span className="text-[8px] font-black tracking-widest text-[#e91e3f]/80">초과 배정 (선수 이동 필요)</span>
                  </button>
                )}
                {/* 오버플로우: 이동 대상 슬롯 선택 */}
                {overflowing && moveFrom !== null && slot !== po.slot && entries.length < limit && (
                  <button
                    type="button"
                    onClick={async () => { const d = await act({ action: "moveSlot", rosterIdx: moveFrom, toSlot: slot, byLeaderIdx: myLeaderIdx }); if (d.success) setMoveFrom(null); }}
                    className={`w-full rounded-lg border border-emerald-500/60 bg-emerald-500/[0.08] flex items-center justify-center transition-all hover:bg-emerald-500/20 ${big ? "h-10" : "h-[26px]"}`}
                  >
                    <span className="text-[8px] font-black tracking-widest text-emerald-400">이곳으로 이동</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* 상단 바 */}
      <div className="sticky top-16 z-30 w-full px-4 md:px-6 py-3 bg-[#090909]/90 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-[1720px] mx-auto flex flex-wrap items-center gap-3">
          <button onClick={() => router.push("/auction")} className="text-xs font-bold text-gray-500 hover:text-white transition-colors">← 목록</button>
          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${auction.status === "진행중" ? "bg-emerald-500/15 text-emerald-400" : auction.status === "종료" ? "bg-white/5 text-gray-500" : "bg-blue-500/15 text-blue-400"}`}>{auction.status}</span>
          {auction.phase > 0 && auction.status === "진행중" && (
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25">PHASE {auction.phase}</span>
          )}
          <h1 className="text-sm md:text-base font-black text-white truncate flex-1">{auction.title}</h1>

          {/* 사운드 토글 */}
          <button onClick={() => setSoundOn(!soundOn)} title="효과음" className={`text-[10px] font-black px-3 py-1.5 rounded-lg border transition-colors ${soundOn ? "border-white/15 bg-white/5 text-gray-300" : "border-white/5 text-gray-600"}`}>
            {soundOn ? "SOUND ON" : "SOUND OFF"}
          </button>

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
            <>
              {auction.phase < 1 && <button onClick={() => act({ action: "host:phase", phase: 1 })} className="text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white px-4 py-1.5 rounded-lg transition-colors">1페이즈 시작</button>}
              {auction.phase === 1 && <button onClick={() => setConfirmCfg({ title: "2페이즈 시작", message: "1페이즈를 마치고 2페이즈를 시작합니다. 미낙찰 탱커 가능 선수들은 2페이즈로 편입됩니다.", confirmLabel: "시작", onConfirm: () => act({ action: "host:phase", phase: 2 }) })} className="text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white px-4 py-1.5 rounded-lg transition-colors">2페이즈 시작</button>}
              {strategyLeft > 0 ? (
                <button onClick={() => act({ action: "host:strategy", seconds: 0 })} className="text-xs font-black bg-blue-500/80 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-colors">전략 타임 종료</button>
              ) : (
                <button onClick={() => setStrategyModalOpen(true)} className="text-xs font-black bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-lg transition-colors">전략 타임</button>
              )}
              <button onClick={() => setConfirmCfg({ title: "경매 종료", message: "모든 경매를 종료하시겠습니까?", confirmLabel: "종료", onConfirm: () => act({ action: "host:end" }) })} className="text-xs font-black bg-white/10 hover:bg-red-500/80 text-white px-4 py-1.5 rounded-lg transition-colors">종료</button>
            </>
          )}
        </div>
      </div>

      <div className="w-full max-w-[1720px] mx-auto px-4 md:px-8 py-6 flex-1 flex flex-wrap gap-5 items-start">

        {/* ═══ 좌측 세로 레일: 팀 현황판 ═══ */}
        <aside className="w-full lg:w-[280px] shrink-0 order-2 lg:order-1 lg:sticky lg:top-36 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full lg:pr-1">
          <div className="flex items-baseline gap-3 mb-3 px-1">
            <span className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f]">TEAMS</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
            {auction.leaders.map((l: any, li: number) => {
              const prof = l.discordId ? profiles[l.discordId] : null;
              return (
                <div key={li} className={`rounded-2xl border p-4 transition-colors ${cur.leaderIdx === li ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.05]" : myLeaderIdx === li ? "border-white/20 bg-[#141414]" : "border-white/5 bg-[#111111]/95"}`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    {prof ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prof.avatarUrl} alt="" className="w-8 h-8 rounded-full bg-gray-800 ring-1 ring-white/15 shrink-0" />
                    ) : (
                      <span className="w-8 h-8 rounded-full bg-white/5 border border-white/10 shrink-0 flex items-center justify-center text-[10px] font-black text-gray-600">{l.name[0]}</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-white truncate leading-tight">{l.name}</p>
                      <p className="text-[9px] font-bold text-gray-500">{l.position || "포지션 미지정"}</p>
                    </div>
                    {myLeaderIdx === li && <span className="text-[8px] font-black tracking-widest text-[#e91e3f] shrink-0">ME</span>}
                  </div>
                  <p className="text-lg font-black text-[#e91e3f] tabular-nums mb-3">{l.points.toLocaleString()}<span className="text-[10px] text-gray-500 ml-1">Point</span></p>
                  <SlotBoard leader={l} leaderIdx={li} />
                  {auction.status === "종료" && role === "host" && !l.positionChanged && l.roster.length >= 2 && (
                    <button onClick={() => { setPosSwapTarget({ leaderIdx: li }); setSwapA(""); setSwapB(""); }} className="mt-2.5 w-full text-[10px] font-bold text-gray-500 hover:text-white bg-white/5 py-1.5 rounded-lg transition-colors">포지션 체인지 ({S.posChangeCost.toLocaleString()} Point · 1회)</button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ═══ 중앙: 경매 메인 ═══ */}
        <div className="flex-1 min-w-0 w-full lg:w-auto space-y-5 order-1 lg:order-2" style={{ minWidth: "min(100%, 400px)" }}>

          {/* 전략 타임 배너 */}
          {strategyLeft > 0 && (
            <div className="rounded-2xl border border-blue-500/30 bg-blue-500/[0.06] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300 flex-1">전략 타임 진행 중 — 팀장과 팀원들이 전략을 논의하는 시간입니다. 입찰이 일시 중지됩니다.</p>
              <span className="text-lg font-black text-blue-400 tabular-nums shrink-0">{Math.floor(strategyLeft / 60)}:{String(strategyLeft % 60).padStart(2, "0")}</span>
            </div>
          )}

          {/* 슬롯 배정/이동 안내 배너 */}
          {hasPending && !iAmAssigner && (
            <div className="rounded-2xl border border-[#e91e3f]/25 bg-[#e91e3f]/[0.05] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-[#e91e3f] animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{pendingLeader?.name}</span> 팀장이 슬롯을 배정하고 있습니다...</p>
            </div>
          )}
          {isMyPending && (
            <div className="rounded-2xl border border-[#e91e3f]/40 bg-[#e91e3f]/[0.07] px-5 py-4">
              <p className="text-xs font-black text-white mb-1">낙찰 완료 — 아래 내 팀 슬롯에서 배정할 위치를 선택하세요</p>
              <p className="text-[11px] text-gray-400">{pendingPlayer?.isAllPos ? "올 포지션 선수 · 꽉 찬 슬롯에도 배정할 수 있습니다 (배정 후 기존 선수 이동 필요)" : `${pendingPlayer?.alias} · ${pa.price?.toLocaleString()} Point`}</p>
            </div>
          )}
          {hasOverflow && (isMyOverflow || role === "host") && (
            <div className="rounded-2xl border border-orange-500/40 bg-orange-500/[0.06] px-5 py-4">
              <p className="text-xs font-black text-white mb-1">슬롯 초과 — [{po.slot}] 슬롯에서 이동할 선수를 선택한 뒤, 옮길 슬롯을 클릭하세요</p>
              <p className="text-[11px] text-gray-400">깜빡이는 선수를 클릭 → 초록색 &quot;이곳으로 이동&quot; 버튼 클릭</p>
            </div>
          )}
          {hasOverflow && !isMyOverflow && role !== "host" && (
            <div className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.04] px-5 py-4 flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-[pulseGlow_1.5s_ease-in-out_infinite] shrink-0"></span>
              <p className="text-xs font-bold text-gray-300"><span className="text-white">{overflowLeader?.name}</span> 팀장이 슬롯을 정리하고 있습니다...</p>
            </div>
          )}

          {/* 현재 경매 카드 */}
          <div className="relative rounded-2xl bg-gradient-to-b from-[#e91e3f]/50 via-[#e91e3f]/15 to-transparent p-px">
            <div className="rounded-2xl bg-[#120a0c] p-6 md:p-8 relative overflow-hidden min-h-[230px]">
              <div className="absolute -top-16 -right-16 w-52 h-52 bg-[#e91e3f]/12 blur-[70px] rounded-full pointer-events-none animate-[pulseGlow_4s_ease-in-out_infinite]"></div>

              {curPlayer ? (
                <div className="relative z-10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f]/80 uppercase mb-2">
                        {curPlayer.isAllPos ? "Golden Card" : `Phase ${curPlayer.phase}`}
                      </p>
                      <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2">
                        {curPlayer.isAllPos ? <span className="lux-shimmer">올 포지션 선수</span> : curPlayer.alias}
                      </h2>
                      {curPlayer.isAllPos ? (
                        <p className="text-xs text-gray-400">티어 비공개 · 스카우터 불가 · 슬롯 자유 배정</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <span className="text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">최고 {curPlayer.peakTier || "?"}</span>
                          <span className="text-[11px] font-bold bg-white/5 border border-white/10 text-gray-300 px-2.5 py-1 rounded-full">현재 {curPlayer.currentTier || "?"}</span>
                          {canSeePos(curPlayer) && (
                            <span className="text-[11px] font-bold bg-[#e91e3f]/10 border border-[#e91e3f]/25 text-[#e91e3f] px-2.5 py-1 rounded-full">주 {curPlayer.mainPos || "?"} / 부 {curPlayer.subPos || "-"}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 스카우터 타임 / 입찰 타이머 */}
                    {scoutLeft > 0 ? (
                      <div className="shrink-0 text-center px-4 py-3 rounded-2xl border border-[#e91e3f]/40 bg-[#e91e3f]/10">
                        <p className="text-[8px] font-black tracking-[0.25em] text-[#e91e3f] uppercase mb-0.5">Scout Time</p>
                        <span className="text-2xl font-black tabular-nums text-white">{scoutLeft}</span>
                        <span className="text-[9px] font-bold text-gray-400 ml-1">초</span>
                      </div>
                    ) : timeLeft !== null && (
                      <div className={`shrink-0 w-16 h-16 rounded-2xl border flex flex-col items-center justify-center ${timeLeft <= 5 ? "border-[#e91e3f] bg-[#e91e3f]/10" : "border-white/10 bg-black/30"}`}>
                        <span className={`text-2xl font-black tabular-nums ${timeLeft <= 5 ? "text-[#e91e3f]" : "text-white"}`}>{timeLeft}</span>
                        <span className="text-[8px] font-bold text-gray-500 tracking-widest">SEC</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-500 mb-1">{cur.leaderIdx === null ? "시작가" : `현재 최고가${cur.isAllin ? " · 올인" : ""}`}</p>
                      <p className="text-4xl md:text-5xl font-black text-[#e91e3f] tracking-tighter tabular-nums">
                        {(cur.leaderIdx === null ? basePrice : cur.price).toLocaleString()}<span className="text-base text-gray-400 ml-2">Point</span>
                      </p>
                      {curLeader && <p className="text-xs font-bold text-white mt-1.5">{curLeader.name}</p>}
                    </div>

                    {/* 팀장: 스카우터 + 입찰 */}
                    {role !== "host" && auction.status === "진행중" && (
                      <div className="flex flex-col items-end gap-2.5">
                        {/* 스카우터 버튼 (호명된 선수 대상, 경매 중에도 사용 가능) */}
                        {myLeaderIdx !== null && !curPlayer.isAllPos && !curPlayer.scoutedBy.includes(myLeaderIdx) && (
                          <button onClick={() => setConfirmCfg({ title: "스카우터 사용", message: `${S.scoutCost.toLocaleString()} Point를 사용하여 이 선수의 주/부 포지션을 확인합니다.`, confirmLabel: "사용", onConfirm: () => act({ action: "scout", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx }) })} className="px-4 py-2 text-[11px] font-black bg-white/5 border border-white/15 hover:border-[#e91e3f]/50 hover:bg-[#e91e3f]/10 text-gray-200 rounded-xl transition-all">
                            스카우터 사용 ({S.scoutCost.toLocaleString()} Point)
                          </button>
                        )}

                        {scoutLeft > 0 ? (
                          <p className="text-[11px] font-bold text-gray-500">스카우터 타임 종료 후 입찰이 시작됩니다</p>
                        ) : timeLeft === 0 ? (
                          <div className="px-5 py-3 rounded-xl border border-white/10 bg-white/[0.03]">
                            <p className="text-xs font-black text-gray-400">입찰 마감 — 진행자의 처리를 기다리는 중</p>
                          </div>
                        ) : strategyLeft > 0 ? (
                          <p className="text-[11px] font-bold text-blue-400">전략 타임 중 — 입찰 일시 중지</p>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {[S.minIncrement, S.minIncrement * 5, S.minIncrement * 10].map((inc) => (
                              <button key={inc} onClick={() => doBid(cur.leaderIdx === null ? basePrice : cur.price + inc)} className="px-4 py-2.5 text-xs font-black bg-white/5 border border-white/10 hover:border-[#e91e3f]/50 hover:bg-[#e91e3f]/10 text-white rounded-xl transition-all">
                                +{inc.toLocaleString()}
                              </button>
                            ))}
                            <input type="number" placeholder={`${nextMinBid.toLocaleString()}~`} value={bidInput} onChange={(e) => setBidInput(e.target.value)} className="w-28 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs text-center outline-none focus:border-[#e91e3f] font-bold" />
                            <button onClick={() => { const v = Number(bidInput); if (v) { doBid(v); setBidInput(""); } }} className="px-4 py-2.5 text-xs font-black bg-[#e91e3f] hover:bg-[#d01634] text-white rounded-xl transition-colors shadow-[0_4px_16px_rgba(233,30,63,0.4)]">입찰</button>
                            <button onClick={() => setConfirmCfg({ title: "올인", message: `남은 슬롯 최소 예산을 제외한 전액 ${allinMax.toLocaleString()} Point를 베팅합니다.`, confirmLabel: "올인", onConfirm: () => act({ action: "allin", leaderIdx: myLeaderIdx, playerIdx: cur.playerIdx }) })} className="px-4 py-2.5 text-xs font-black bg-gradient-to-r from-orange-600 to-[#e91e3f] hover:brightness-110 text-white rounded-xl transition-all">올인</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 진행자 컨트롤 */}
                    {role === "host" && (
                      <div className="flex gap-2">
                        <button onClick={() => { if (cur.leaderIdx !== null) setConfirmCfg({ title: "낙찰 확정", message: `${curLeader?.name} — ${cur.price.toLocaleString()} Point 낙찰을 확정합니다.${auction.phase === 1 ? " (1페이즈: 탱커 슬롯 자동 배정)" : " 슬롯은 팀장이 배정합니다."}`, confirmLabel: "낙찰", onConfirm: () => act({ action: "host:sold" }) }); }} disabled={cur.leaderIdx === null} className="px-5 py-2.5 text-xs font-black bg-emerald-500/90 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl transition-colors">낙찰</button>
                        <button onClick={() => act({ action: "host:pass", playerIdx: cur.playerIdx })} className="px-5 py-2.5 text-xs font-black bg-white/10 hover:bg-white/20 text-white rounded-xl transition-colors">유찰</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : revealPlayer && revealProfile ? (
                /* 프로필 공개 화면 */
                <div className="relative z-10 flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-[10px] font-black tracking-[0.35em] text-[#e91e3f] uppercase mb-5">Player Revealed</p>
                  <div className="relative mb-4">
                    <div className="absolute -inset-3 bg-[#e91e3f]/20 blur-2xl rounded-full pointer-events-none"></div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={revealProfile.avatarUrl} alt="" className="relative w-24 h-24 rounded-full bg-gray-800 ring-2 ring-[#e91e3f]/60 ring-offset-4 ring-offset-[#120a0c]" />
                  </div>
                  <p className="text-2xl font-black text-white tracking-tight">{revealProfile.globalName}</p>
                  <p className="text-xs text-gray-500 font-medium mb-2">@{revealProfile.username}</p>
                  <p className="text-sm font-bold text-[#e91e3f]">{revealPlayer.alias} → {auction.leaders[revealPlayer.soldTo]?.name} 팀</p>
                </div>
              ) : (
                <div className="relative z-10 h-full flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-[10px] font-black tracking-[0.35em] text-gray-600 uppercase mb-3">{auction.status === "종료" ? "Finished" : "Standby"}</p>
                  <p className="text-white font-black text-lg">{auction.status === "종료" ? "경매 종료" : "대기 중"}</p>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {auction.status === "종료" ? "모든 경매가 종료되었습니다. 최종 팀 구성을 확인하세요."
                      : hasPending || hasOverflow ? "슬롯 배정을 기다리고 있습니다."
                      : auction.phase === 0 && auction.status === "진행중" ? "진행자가 페이즈를 시작하면 경매가 진행됩니다."
                      : role === "host" ? "아래 선수 목록에서 호명할 선수를 선택하세요."
                      : "진행자가 다음 선수를 호명할 때까지 기다려주세요."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 팀장 전용: 내 팀 슬롯 보드 (크게) */}
          {myLeader && (
            <div className={`rounded-2xl border p-5 transition-colors ${isMyPending || isMyOverflow ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.03]" : "border-white/5 bg-[#111111]/95"}`}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">My Team Slots</p>
                <p className="text-sm font-black text-[#e91e3f] tabular-nums">{myLeader.points.toLocaleString()} <span className="text-[10px] text-gray-500">Point</span></p>
              </div>
              <SlotBoard leader={myLeader} leaderIdx={myLeaderIdx!} big />
            </div>
          )}

          {/* 선수 목록 */}
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">선수 목록</p>
              {role === "host" && auction.status === "진행중" && auction.players.some((p: any) => p.status === "유찰") && !auction.players.some((p: any) => ["대기", "경매중", "배정중"].includes(p.status)) && (
                <button onClick={() => setConfirmCfg({ title: "유찰 랜덤 배정", message: "유찰 선수를 빈 슬롯 팀에 기본가로 랜덤 배정합니다. (잔여 Point 최저 팀 우선)", confirmLabel: "배정", onConfirm: () => act({ action: "host:assignPassed" }) })} className="text-[10px] font-black bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25 px-3 py-1.5 rounded-full hover:bg-[#e91e3f]/20 transition-colors">유찰 랜덤 배정</button>
              )}
            </div>

            {[1, 2].map((phase) => {
              const list = auction.players.map((p: any, i: number) => ({ p, i })).filter(({ p }: any) => p.phase === phase);
              if (list.length === 0) return null;
              return (
                <div key={phase} className="mb-4 last:mb-0">
                  <p className="text-[10px] font-black text-gray-600 mb-2">PHASE {phase}{phase === 2 ? " · 일반 + 황금카드" : ""}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-2.5">
                    {list.map(({ p, i }: any) => {
                      const hidden = isHiddenFor(p);
                      const prof = p.revealed && p.discordId ? profiles[p.discordId] : null;
                      const callable = role === "host" && auction.status === "진행중" && (p.status === "대기" || p.status === "유찰") && !(auction.phase === 1 && p.phase !== 1) && auction.phase > 0;
                      return (
                        <div key={i} className={`flex flex-col rounded-xl border p-3.5 transition-colors ${p.status === "경매중" ? "border-[#e91e3f]/50 bg-[#e91e3f]/[0.06]" : p.status === "낙찰" ? "border-white/5 bg-black/20" : p.status === "유찰" ? "border-orange-500/20 bg-orange-500/[0.03]" : p.status === "배정중" ? "border-[#e91e3f]/25 bg-[#e91e3f]/[0.03]" : "border-white/5 bg-black/25 hover:border-white/15"}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[8px] font-black tracking-[0.2em] text-gray-600 uppercase">{p.isAllPos && !hidden ? "Golden" : `P${String(i + 1).padStart(2, "0")}`}</span>
                            {p.status === "경매중" ? <span className="text-[9px] font-black text-[#e91e3f] animate-pulse">LIVE</span>
                              : p.status === "배정중" ? <span className="text-[9px] font-black text-[#e91e3f]">배정 중</span>
                              : p.status === "유찰" ? <span className="text-[9px] font-black text-orange-400">유찰</span>
                              : p.status === "낙찰" ? <span className="text-[9px] font-black text-gray-500">SOLD</span>
                              : null}
                          </div>

                          {hidden ? (
                            /* 팀장에겐 익명 — 물음표 표시 */
                            <div className="flex-1 flex flex-col items-center justify-center py-3">
                              <span className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1.5">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-600"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
                              </span>
                              <p className="text-[9px] font-bold text-gray-600">비공개</p>
                            </div>
                          ) : (
                            <>
                              {prof ? (
                                <div className="flex items-center gap-2 mb-1">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={prof.avatarUrl} alt="" className="w-6 h-6 rounded-full bg-gray-800 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-black text-white truncate leading-tight">{prof.globalName}</p>
                                    <p className="text-[9px] text-gray-500 truncate">{p.alias}</p>
                                  </div>
                                </div>
                              ) : (
                                <p className={`text-sm font-black truncate mb-1 ${p.isAllPos ? "lux-shimmer" : "text-white"}`}>{p.isAllPos ? "올 포지션" : p.alias}</p>
                              )}
                              {p.isAllPos ? (
                                <p className="text-[10px] text-gray-600 mb-2">티어 비공개</p>
                              ) : (
                                <div className="mb-2">
                                  <p className="text-[10px] text-gray-500">최고 {p.peakTier || "?"} · 현재 {p.currentTier || "?"}</p>
                                  {canSeePos(p) && <p className="text-[10px] font-bold text-[#e91e3f] mt-0.5">주 {p.mainPos || "?"}{p.subPos ? ` / 부 ${p.subPos}` : ""}</p>}
                                </div>
                              )}
                            </>
                          )}

                          <div className="mt-auto pt-1.5 border-t border-white/[0.05]">
                            {p.status === "낙찰" ? (
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] font-bold text-gray-500 truncate flex-1">{auction.leaders[p.soldTo]?.name} · {p.soldPrice?.toLocaleString()} Pt</p>
                                {role === "host" && p.discordId && !p.revealed && (
                                  <button onClick={() => act({ action: "host:reveal", playerIdx: i })} className="shrink-0 text-[9px] font-black text-[#e91e3f] bg-[#e91e3f]/10 border border-[#e91e3f]/25 px-2 py-0.5 rounded hover:bg-[#e91e3f]/20 transition-colors">공개</button>
                                )}
                              </div>
                            ) : callable ? (
                              <button onClick={() => act({ action: "host:call", playerIdx: i })} className="w-full text-[10px] font-black text-white bg-[#e91e3f]/80 hover:bg-[#e91e3f] py-1.5 rounded-lg transition-colors">호명</button>
                            ) : (
                              <p className="text-[10px] text-gray-700">{p.status === "경매중" ? "경매 진행 중" : p.status === "배정중" ? "슬롯 배정 중" : "대기"}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══ 우측: 실시간 채팅 + 로그 ═══ */}
        <div className="w-full xl:w-[350px] shrink-0 order-3 flex flex-col gap-5 xl:sticky xl:top-36 xl:self-start xl:max-h-[calc(100vh-11rem)]">
          <div className="rounded-2xl bg-[#111111]/95 border border-white/5 flex flex-col flex-1 min-h-[380px] xl:min-h-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulseGlow_2s_ease-in-out_infinite]"></span>
              <span className="text-xs font-black text-white">실시간 채팅</span>
            </div>
            <div ref={chatBoxRef} className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              {chat.length === 0 && <p className="text-center text-[11px] text-gray-700 py-6">아직 메시지가 없습니다.</p>}
              {chat.map((m, i) => m.isSystem ? (
                <div key={m._id || i} className="flex items-start gap-2 bg-[#e91e3f]/[0.05] border border-[#e91e3f]/10 rounded-lg px-3 py-2">
                  <span className="shrink-0 mt-px w-5 h-5 rounded-md bg-[#e91e3f]/15 flex items-center justify-center">
                    <MegaphoneIcon className="w-3 h-3 text-[#e91e3f]" />
                  </span>
                  <p className="text-[11px] font-bold text-[#e91e3f]/90 leading-relaxed min-w-0">{m.message}</p>
                </div>
              ) : (
                <div key={m._id || i} className="flex items-start gap-2">
                  {m.avatar ? <img src={m.avatar} alt="" className="w-5 h-5 rounded-full shrink-0 mt-0.5" /> : <span className="w-5 h-5 rounded-full bg-white/10 shrink-0 mt-0.5"></span>}
                  <p className="text-xs leading-relaxed min-w-0"><span className="font-bold text-gray-300">{m.userName}</span> <span className="text-gray-400 break-all">{m.message}</span></p>
                </div>
              ))}
            </div>
            <form onSubmit={sendChat} className="p-3 border-t border-white/5 flex gap-2">
              <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} maxLength={200} placeholder="메시지 입력..." className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white text-xs outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600" />
              <button type="submit" className="px-4 py-2.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-xs font-black rounded-xl transition-colors">전송</button>
            </form>
          </div>

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

      {/* 진행자 대행 슬롯 배정 (진행자 화면에서 배정 대기 시 — 좌측 레일 SlotBoard로도 가능) */}

      {/* 공용 확인 모달 (럭스 디자인) */}
      {confirmCfg && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative rounded-3xl bg-gradient-to-b from-white/[0.1] to-white/[0.02] p-px w-full max-w-sm">
            <div className="rounded-3xl bg-[#121212] p-8 text-center">
              <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-3">Confirm</p>
              <h2 className="text-lg font-black text-white mb-3">{confirmCfg.title}</h2>
              <p className="text-xs text-gray-400 leading-relaxed mb-8 whitespace-pre-line">{confirmCfg.message}</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmCfg(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">취소</button>
                <button onClick={() => { confirmCfg.onConfirm(); setConfirmCfg(null); }} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">{confirmCfg.confirmLabel || "확인"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 전략 타임 시작 모달 */}
      {strategyModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="relative rounded-3xl bg-gradient-to-b from-white/[0.1] to-white/[0.02] p-px w-full max-w-sm">
            <div className="rounded-3xl bg-[#121212] p-8 text-center">
              <p className="text-[10px] font-black tracking-[0.3em] text-blue-400 uppercase mb-3">Strategy Time</p>
              <h2 className="text-lg font-black text-white mb-3">전략 타임 시작</h2>
              <p className="text-xs text-gray-400 mb-6">팀장과 선정된 팀원들이 전략을 논의하는 시간입니다.<br/>진행 시간을 선택하세요. (진행 중 입찰 중지)</p>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {[1, 3, 5].map((min) => (
                  <button key={min} onClick={() => { act({ action: "host:strategy", seconds: min * 60 }); setStrategyModalOpen(false); }} className="py-3.5 rounded-xl text-sm font-black border border-white/10 bg-white/5 text-white hover:border-blue-400 hover:bg-blue-500/10 transition-all">{min}분</button>
                ))}
              </div>
              <button onClick={() => setStrategyModalOpen(false)} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 포지션 체인지 모달 */}
      {posSwapTarget && (() => {
        const leader = auction.leaders[posSwapTarget.leaderIdx];
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="relative rounded-3xl bg-gradient-to-b from-white/[0.1] to-white/[0.02] p-px w-full max-w-sm">
              <div className="rounded-3xl bg-[#121212] p-8">
                <p className="text-[10px] font-black tracking-[0.3em] text-[#e91e3f] uppercase mb-3 text-center">Position Change</p>
                <h2 className="text-lg font-black text-white mb-2 text-center">{leader.name} — 포지션 체인지</h2>
                <p className="text-xs text-gray-400 mb-6 text-center">교환할 두 선수를 선택하세요. ({S.posChangeCost.toLocaleString()} Point · 팀당 1회)</p>
                {[{ v: swapA, set: setSwapA, l: "첫 번째 선수" }, { v: swapB, set: setSwapB, l: "두 번째 선수" }].map((f, fi) => (
                  <div key={fi} className="mb-3">
                    <label className="block text-[10px] font-bold text-gray-500 mb-1.5">{f.l}</label>
                    <select value={f.v} onChange={(e) => f.set(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white font-bold outline-none focus:border-[#e91e3f] [color-scheme:dark]">
                      <option value="">선택...</option>
                      {leader.roster.map((r: any, ri: number) => (
                        <option key={ri} value={ri}>[{r.slot}] {rosterName(leader, r)}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex gap-3 mt-6">
                  <button onClick={() => setPosSwapTarget(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">취소</button>
                  <button onClick={async () => { if (swapA !== "" && swapB !== "" && swapA !== swapB) { const d = await act({ action: "host:posSwap", leaderIdx: posSwapTarget.leaderIdx, a: Number(swapA), b: Number(swapB) }); if (d.success) setPosSwapTarget(null); } else showToast("서로 다른 두 선수를 선택해주세요"); }} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors">교환</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-[200] bg-[#1a1a1a] border border-white/15 text-white text-xs font-bold px-5 py-3 rounded-full shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {toast}
        </div>
      )}
    </main>
  );
}
