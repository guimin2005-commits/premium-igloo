"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];

export default function AdminHonorsPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [honors, setHonors] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  const [category, setCategory] = useState("SYSTEM : LEVEL");
  const [title, setTitle] = useState("");
  const [winner, setWinner] = useState("");
  const [winnerId, setWinnerId] = useState("");
  const [detail, setDetail] = useState("");
  const [dateLabel, setDateLabel] = useState("");

  const fetchHonors = () => {
    fetch("/api/honors", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setHonors(Array.isArray(data?.data) ? data.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { fetchHonors(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/honors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, title, winner, winnerId, detail, dateLabel }),
      });
      if (res.ok) {
        setTitle(""); setWinner(""); setWinnerId(""); setDetail(""); setDateLabel("");
        fetchHonors();
        setPopup({ isOpen: true, message: "명예의 전당에 기록되었습니다.", isError: false });
      } else {
        setPopup({ isOpen: true, message: "등록에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류가 발생했습니다.", isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/honors?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setHonors((prev) => prev.filter((h) => h._id !== deleteConfirmId));
        setPopup({ isOpen: true, message: "기록이 삭제되었습니다.", isError: false });
      } else {
        setPopup({ isOpen: true, message: "삭제에 실패했습니다.", isError: true });
      }
    } catch {
      setPopup({ isOpen: true, message: "서버 통신 오류가 발생했습니다.", isError: true });
    } finally {
      setDeleteConfirmId(null);
    }
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

  const inputClass = "w-full bg-[#121212] border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";

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
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Admin · Hall of Fame</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">명예의 전당 </span><span className="lux-shimmer">관리</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">LEVEL 시즌 1등, 이벤트 우승 등 대회 외 기록을 직접 등재합니다. (대회 우승은 대회 글의 &lsquo;우승팀&rsquo; 필드로 자동 등재)</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-12">

        {/* 등록 폼 */}
        <Reveal>
        <form onSubmit={handleSubmit} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px">
          <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8">
            <h3 className="text-base font-black text-white mb-6 flex items-center gap-3"><span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>새 기록 등재</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">분류 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {["SYSTEM : LEVEL", "대회", "이벤트", "기타"].map((c) => (
                    <button type="button" key={c} onClick={() => setCategory(c)} className={`px-4 py-2 text-xs font-bold rounded-full border transition-all ${category === c ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">표시 기간 (선택)</label>
                <input type="text" placeholder="예: 2026.01 ~ 2026.06" value={dateLabel} onChange={(e) => setDateLabel(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">기록 제목 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: LEVEL SEASON 1" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">우승자 / 1등 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: elahw.06" value={winner} onChange={(e) => setWinner(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">우승자 디스코드 ID (선택 · 복사 버튼 표시)</label>
                <input type="text" placeholder="예: 1104242935664492666" value={winnerId} onChange={(e) => setWinnerId(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">부가 설명 (선택)</label>
                <input type="text" placeholder="예: 최종 레벨 512 달성 · 보상 문화상품권 5만원" value={detail} onChange={(e) => setDetail(e.target.value)} className={inputClass} />
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">
              {isSubmitting ? "등재 중..." : "명예의 전당에 등재"}
            </button>
          </div>
        </form>
        </Reveal>

        {/* 등재된 기록 목록 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">LIST</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight mb-4">등재된 수동 기록 ({honors.length})</h3>
          {isLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm">불러오는 중...</div>
          ) : honors.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm bg-white/[0.02] rounded-2xl border border-white/5">등재된 기록이 없습니다.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {honors.map((h) => (
                <div key={h._id} className="py-4 flex items-center gap-4 group">
                  <span className="shrink-0 text-[9px] font-black tracking-wider bg-white/5 text-gray-400 border border-white/10 px-2 py-1 rounded-full">{h.category}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{h.title}</p>
                    <p className="text-xs text-gray-500 truncate">🏆 {h.winner}{h.detail ? ` · ${h.detail}` : ""}{h.dateLabel ? ` · ${h.dateLabel}` : ""}</p>
                  </div>
                  <button onClick={() => setDeleteConfirmId(h._id)} className="shrink-0 text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-3 py-1.5 rounded-lg transition-colors">삭제</button>
                </div>
              ))}
            </div>
          )}
        </div>
        </Reveal>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">해당 기록을 명예의 전당에서 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
