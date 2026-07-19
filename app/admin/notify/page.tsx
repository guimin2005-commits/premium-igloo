"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";

const ADMIN_USERS = ["elahw.06"];

// 알림 유형별 색상 프리셋
const TYPE_STYLES: Record<string, { badge: string; dot: string }> = {
  경고: { badge: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25", dot: "bg-[#e91e3f]" },
  제재: { badge: "bg-orange-500/10 text-orange-400 border-orange-500/25", dot: "bg-orange-400" },
  안내: { badge: "bg-sky-500/10 text-sky-400 border-sky-500/25", dot: "bg-sky-400" },
  축하: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25", dot: "bg-emerald-400" },
  일반: { badge: "bg-white/5 text-gray-300 border-white/15", dot: "bg-gray-400" },
};
const TYPES = ["경고", "제재", "안내", "축하", "일반"];

export default function AdminNotifyPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [sent, setSent] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false });

  const [recipient, setRecipient] = useState("");
  const [type, setType] = useState("경고");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const fetchSent = () => {
    fetch("/api/notifications?sent=1", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSent(Array.isArray(data?.data) ? data.data : []))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isAdmin) fetchSent();
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!recipient.trim() || !title.trim() || !content.trim()) {
      setPopup({ isOpen: true, message: "수신자·제목·내용을 모두 입력해 주세요.", isError: true });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, type, title, content }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTitle("");
        setContent("");
        // 수신자/유형은 연속 발송 편의를 위해 유지
        fetchSent();
        const msg = data.userFound
          ? data.dmSent
            ? "알림을 저장하고 디스코드 DM도 발송했습니다."
            : "알림은 저장됐지만 DM 발송에 실패했습니다. (유저가 DM을 막아뒀을 수 있어요) 유저는 사이트 알림함에서 확인할 수 있습니다."
          : "알림을 저장했습니다. 다만 디스코드에서 해당 닉네임의 유저를 찾지 못해 DM은 보내지 못했습니다. 닉네임을 확인해 주세요. (유저가 로그인하면 사이트 알림함에서 볼 수 있습니다)";
        setPopup({ isOpen: true, message: msg, isError: false });
      } else {
        setPopup({ isOpen: true, message: data.error || "발송에 실패했습니다.", isError: true });
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
      const res = await fetch(`/api/notifications?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setSent((prev) => prev.filter((n) => n._id !== deleteConfirmId));
        setPopup({ isOpen: true, message: "알림을 삭제했습니다.", isError: false });
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
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Admin · Direct Notice</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">유저 </span><span className="lux-shimmer">알림 발송</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">특정 유저에게 경고·제재·안내 등을 직접 전달합니다. 사이트 알림함에 기록되고, 디스코드로 도착 알림(DM)이 함께 전송됩니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col space-y-12">

        {/* 발송 폼 */}
        <Reveal>
        <form onSubmit={handleSubmit} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px">
          <div className="rounded-2xl bg-[#111111]/95 p-6 md:p-8">
            <h3 className="text-base font-black text-white mb-6 flex items-center gap-3"><span className="w-1 h-5 bg-[#e91e3f] rounded-full"></span>새 알림 작성</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">수신자 디스코드 닉네임 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: elahw.06" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} />
                <p className="text-[10px] text-gray-600 mt-1.5">닉네임으로 유저를 찾아 DM을 보냅니다. 정확한 디스코드 사용자명을 입력하세요.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2">알림 유형 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button type="button" key={t} onClick={() => setType(t)} className={`px-4 py-2 text-xs font-bold rounded-full border transition-all ${type === t ? TYPE_STYLES[t].badge.replace("/10", "/20") + " ring-1 ring-inset ring-white/10" : "bg-transparent border-white/10 text-gray-500 hover:border-white/30"}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-2">제목 <span className="text-[#e91e3f]">*</span></label>
              <input type="text" required placeholder="예: 커뮤니티 이용 규칙 위반 경고" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              <p className="text-[10px] text-gray-600 mt-1.5">제목은 디스코드 DM에도 표시됩니다.</p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 mb-2">상세 내용 <span className="text-[#e91e3f]">*</span></label>
              <textarea required rows={5} placeholder="유저에게 전달할 상세 내용을 입력하세요. (본문은 사이트 알림함에서만 표시됩니다)" value={content} onChange={(e) => setContent(e.target.value)} className={inputClass + " resize-none leading-relaxed"} />
            </div>

            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20">
              {isSubmitting ? "발송 중..." : "알림 발송"}
            </button>
          </div>
        </form>
        </Reveal>

        {/* 발송 이력 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-2">
            <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">LOG</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight mb-4">발송 이력 ({sent.length})</h3>
          {isLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm">불러오는 중...</div>
          ) : sent.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm bg-white/[0.02] rounded-2xl border border-white/5">발송한 알림이 없습니다.</div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {sent.map((n) => {
                const ts = TYPE_STYLES[n.type] || TYPE_STYLES["일반"];
                return (
                  <div key={n._id} className="py-4 flex items-start gap-4 group">
                    <span className={`shrink-0 mt-0.5 text-[9px] font-black tracking-wider border px-2 py-1 rounded-full ${ts.badge}`}>{n.type}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{n.content}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold">
                        <span className="text-gray-400">→ {n.recipientName}</span>
                        <span className={n.dmSent ? "text-emerald-400/80" : "text-gray-600"}>{n.dmSent ? "DM 발송됨" : "DM 미발송"}</span>
                        <span className={n.read ? "text-sky-400/80" : "text-gray-600"}>{n.read ? "읽음" : "안 읽음"}</span>
                        <span className="text-gray-600">{new Date(n.createdAt).toLocaleString("ko-KR")}</span>
                      </div>
                    </div>
                    <button onClick={() => setDeleteConfirmId(n._id)} className="shrink-0 text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-3 py-1.5 rounded-lg transition-colors">삭제</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </Reveal>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
            <p className="text-sm text-gray-400 mb-8">해당 알림 기록을 삭제하시겠습니까? 유저의 알림함에서도 사라집니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-md p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "오류" : "발송 완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed break-keep">{popup.message}</p>
            <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}
