"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../components/Lux";

const MILESTONES = [
  { count: 1, reward: "+10,000 XP", desc: "첫 친구 초대 보너스" },
  { count: 3, reward: "+40,000 XP", desc: "@INVITER 역할 + 누적 보너스" },
  { count: 5, reward: "+80,000 XP", desc: "경험치샵 5,000P 지급" },
  { count: 10, reward: "+200,000 XP", desc: "@TOP INVITER 특수 역할 영구 부여" },
];

export default function InvitePage() {
  const { data: session, status } = useSession();
  const userName = session?.user?.name;
  const userId = (session?.user as any)?.id;

  const [code, setCode] = useState("");
  const [invites, setInvites] = useState(0);
  const [hasUsed, setHasUsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const [friendCode, setFriendCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  const fetchInfo = async () => {
    if (!userName) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/referral?user=${encodeURIComponent(userName)}&userId=${encodeURIComponent(userId || "")}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setCode(json.data.code);
        setInvites(json.data.invites);
        setHasUsed(json.data.hasUsed);
      }
    } catch { /* noop */ } finally { setIsLoading(false); }
  };

  useEffect(() => { if (status === "authenticated") fetchInfo(); }, [status, userName]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendCode.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: friendCode, userId, userName }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setPopup({ isOpen: true, message: json.message, isError: false });
        setHasUsed(true);
        setFriendCode("");
      } else {
        setPopup({ isOpen: true, message: json.message || "코드 등록에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버와 통신하는 중 오류가 발생했습니다.", isError: true });
    } finally { setIsSubmitting(false); }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated" || !session) {
    return (
      <main className="w-full max-w-md mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">친구 초대 이벤트에 참여하시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20">Discord 로그인</button>
      </main>
    );
  }

  const nextMilestone = MILESTONES.find(m => m.count > invites);

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-3xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Invite Event</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">친구 초대 </span><span className="lux-shimmer">이벤트</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">내 초대 코드를 친구에게 공유하세요. 친구가 코드를 입력하면 둘 다 보상을 받습니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-3xl mx-auto px-6 pb-16 flex-1 flex flex-col">

      {/* 내 초대 코드 카드 */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-[#e91e3f]/20 bg-[#161213] mb-8">
        <div className="absolute -top-20 -right-20 w-56 h-56 rounded-full bg-[#e91e3f]/10 blur-3xl pointer-events-none" />
        <div className="relative p-6 md:p-8">
          <p className="text-xs font-bold text-gray-400 mb-3">내 초대 코드</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 bg-black/30 border border-white/10 rounded-xl px-5 py-4 font-mono text-2xl md:text-3xl font-black text-white tracking-[0.3em] text-center">
              {isLoading ? "······" : code}
            </div>
            <button onClick={copyCode} disabled={isLoading || !code} className="shrink-0 px-6 py-4 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">
              {copied ? "복사됨!" : "코드 복사"}
            </button>
          </div>
          <div className="flex items-center gap-2 mt-5 pt-5 border-t border-white/5">
            <span className="text-sm text-gray-400">누적 초대</span>
            <span className="text-2xl font-black text-[#e91e3f]">{isLoading ? "-" : invites}</span>
            <span className="text-sm text-gray-400">명</span>
            {nextMilestone && !isLoading && (
              <span className="ml-auto text-xs text-gray-500">다음 보상까지 <span className="text-white font-bold">{nextMilestone.count - invites}</span>명</span>
            )}
          </div>
        </div>
      </div>

      {/* 친구 코드 입력 */}
      <div className="bg-[#121212] border border-white/5 rounded-2xl p-6 md:p-8 mb-12">
        <h3 className="text-base font-bold text-white mb-1">친구 코드 입력</h3>
        <p className="text-xs text-gray-500 mb-5">초대받은 친구라면 코드를 입력하고 웰컴 보상을 받으세요. (1인 1회)</p>
        {hasUsed ? (
          <div className="flex items-center gap-2 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-sm font-bold rounded-xl px-5 py-4">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            이미 친구 초대 코드를 입력하셨습니다.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input value={friendCode} onChange={(e) => setFriendCode(e.target.value.toUpperCase())} placeholder="친구의 초대 코드" maxLength={6} className="flex-1 px-5 py-3.5 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm font-mono tracking-widest uppercase outline-none focus:border-[#e91e3f] transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:normal-case" />
            <button type="submit" disabled={isSubmitting} className="shrink-0 px-7 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors">{isSubmitting ? "확인 중..." : "입력하기"}</button>
          </form>
        )}
      </div>

      {/* 보상 안내 */}
      <div>
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><span className="w-1.5 h-5 bg-[#e91e3f] rounded-full" />초대 보상 안내</h3>
        <p className="text-xs text-gray-500 mb-5">친구가 내 코드를 입력하면 <span className="text-white font-bold">나 +10,000 XP</span>, 코드를 입력한 <span className="text-white font-bold">친구 +5,000 XP</span>가 즉시 지급되며, 누적 초대 수에 따라 추가 보상이 열립니다.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MILESTONES.map((m) => {
            const achieved = invites >= m.count;
            return (
              <div key={m.count} className={`p-5 rounded-2xl border transition-colors ${achieved ? "border-[#e91e3f]/40 bg-[#e91e3f]/5" : "border-white/5 bg-white/[0.01]"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-black ${achieved ? "text-[#e91e3f]" : "text-white"}`}>{m.count}명 초대</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${achieved ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "bg-white/5 text-gray-500"}`}>{achieved ? "달성" : "대기"}</span>
                </div>
                <p className="text-base font-black text-white mb-1">{m.reward}</p>
                <p className="text-xs text-gray-500 break-keep">{m.desc}</p>
              </div>
            );
          })}
        </div>
        <p className="text-center text-xs text-gray-600 mt-8">📢 모든 보상은 운영진 확인 후 순차 지급됩니다. 어뷰징(자기 초대, 부계정 등) 적발 시 보상이 회수되고 제재될 수 있습니다.</p>
      </div>

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popup.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>
              {popup.isError ? (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "초대 완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed whitespace-pre-line">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
