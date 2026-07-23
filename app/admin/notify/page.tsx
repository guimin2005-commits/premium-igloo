"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";

const ADMIN_USERS = ["elahw.06"];

// 통지 유형별 색상 프리셋
const TYPE_STYLES: Record<string, { badge: string }> = {
  경고: { badge: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" },
  제재: { badge: "bg-orange-500/10 text-orange-400 border-orange-500/25" },
  안내: { badge: "bg-sky-500/10 text-sky-400 border-sky-500/25" },
  축하: { badge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  일반: { badge: "bg-white/5 text-gray-300 border-white/15" },
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  // ── 마크다운 서식 삽입 (글 작성 페이지와 동일) ──
  const insertWrap = (symbol: string, placeholder = "텍스트") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const cur = ta.value;
    const selected = cur.substring(start, end);
    const inner = selected || placeholder;
    const next = cur.substring(0, start) + symbol + inner + symbol + cur.substring(end);
    setContent(next);
    setTimeout(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(start + symbol.length, start + symbol.length + inner.length);
    }, 0);
  };

  const insertTable = (rows = 2, cols = 2) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const cur = ta.value;
    const headerRow = Array(cols).fill("헤더").map((h, i) => `${h}${i + 1}`).join(" | ");
    const separatorRow = Array(cols).fill("---").join(" | ");
    const dataRow = Array(cols).fill("데이터").map((d, i) => `${d}${i + 1}`).join(" | ");
    const tableLines = [`| ${headerRow} |`, `| ${separatorRow} |`];
    for (let i = 0; i < rows; i++) tableLines.push(`| ${dataRow} |`);
    const table = tableLines.join("\n");
    const next = cur.substring(0, start) + (start > 0 ? "\n" : "") + table + "\n" + cur.substring(start);
    setContent(next);
    setTimeout(() => ta.focus({ preventScroll: true }), 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!recipient.trim() || !title.trim() || !content.trim()) {
      setPopup({ isOpen: true, message: "수신자·제목·본문을 모두 입력해 주세요.", isError: true });
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
            ? "통지를 저장하고 디스코드 DM 알림도 발송했습니다."
            : "통지는 저장됐지만 DM 발송에 실패했습니다. (수신자가 DM을 막아뒀을 수 있습니다) 수신자는 사이트 알림함에서 확인할 수 있습니다."
          : "통지를 저장했습니다. 다만 디스코드에서 해당 닉네임의 유저를 찾지 못해 DM은 발송하지 못했습니다. 사용자명을 확인해 주세요. (수신자가 로그인하면 사이트 알림함에서 확인 가능합니다)";
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
        setPopup({ isOpen: true, message: "통지 기록을 삭제했습니다.", isError: false });
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

  const inputClass = "w-full bg-[#0d0d0d] border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";
  const labelClass = "block text-[11px] font-bold text-gray-500 tracking-wide mb-2 uppercase";

  const ToolBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className="px-2.5 py-1.5 text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 rounded-md transition-all flex items-center gap-1">{children}</button>
  );

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO (사무적 톤) ── */}
      <section className="relative w-full pt-14 pb-8 md:pt-20 md:pb-10 px-6 border-b border-white/5">
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Official Dispatch</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none mb-3 text-white">회원 통지 발송</h1>
            <p className="text-gray-500 text-sm leading-relaxed break-keep">특정 회원에게 경고·제재·안내 등 공식 통지를 전달합니다. 통지 내용은 사이트 알림함에 기록되며, 디스코드로 도착 알림(DM)이 함께 전송됩니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 py-10 flex-1 flex flex-col space-y-10">

        {/* 통지서 작성 */}
        <Reveal>
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-[#111111] overflow-hidden">
          {/* 문서 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.015]">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-4 bg-[#e91e3f] rounded-full"></span>
              <span className="text-sm font-black text-white tracking-tight">통지서 작성</span>
            </div>
            <span className="text-[10px] font-bold text-gray-600 tracking-wide">발신 · 고급 이글루 운영팀</span>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {/* 수신자 / 유형 */}
            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
              <div>
                <label className={labelClass}>수신자 (디스코드 사용자명) <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: elahw.06" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} />
                <p className="text-[10px] text-gray-600 mt-1.5 leading-relaxed">표시 이름·별명이 아닌 <span className="text-gray-400">고유 사용자명(핸들)</span>을 정확히 입력하세요.</p>
              </div>
              <div>
                <label className={labelClass}>통지 유형 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button type="button" key={t} onClick={() => setType(t)} className={`px-3.5 py-2 text-xs font-bold rounded-md border transition-all ${type === t ? TYPE_STYLES[t].badge : "bg-transparent border-white/10 text-gray-500 hover:border-white/25"}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 제목 */}
            <div>
              <label className={labelClass}>제목 <span className="text-[#e91e3f]">*</span></label>
              <input type="text" required placeholder="예: 커뮤니티 이용 규칙 위반에 대한 경고 통지" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              <p className="text-[10px] text-gray-600 mt-1.5">제목은 디스코드 DM 알림에도 표시됩니다.</p>
            </div>

            {/* 본문 + 서식 툴바 */}
            <div>
              <label className={labelClass}>본문 <span className="text-[#e91e3f]">*</span></label>
              <div className="border border-white/10 rounded-lg overflow-hidden focus-within:border-[#e91e3f] transition-colors">
                <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-white/[0.02] border-b border-white/5">
                  <ToolBtn onClick={() => insertWrap("**")}><span className="font-extrabold text-sm">B</span> 굵게</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("__")}><span className="underline text-sm">U</span> 밑줄</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("~~")}><span className="line-through text-sm">S</span> 취소선</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("==")}><span className="text-sm font-extrabold text-[#e91e3f]">A</span> 강조</ToolBtn>
                  <span className="w-px h-4 bg-white/10 mx-1"></span>
                  <ToolBtn onClick={() => insertTable(2, 2)}><span className="text-sm font-bold">⊞</span> 표</ToolBtn>
                </div>
                <textarea ref={textareaRef} required rows={7} placeholder="회원에게 전달할 통지 내용을 작성하세요. 위 버튼으로 굵게·밑줄·강조 등 서식을 넣을 수 있습니다. (본문은 사이트 알림함에서 표시됩니다)" value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-[#0d0d0d] px-4 py-3.5 text-sm text-white outline-none resize-none leading-relaxed placeholder:text-gray-600 [&::-webkit-scrollbar]:hidden" />
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">서식: <code className="text-gray-500">**굵게**</code> · <code className="text-gray-500">__밑줄__</code> · <code className="text-gray-500">~~취소선~~</code> · <code className="text-gray-500">==강조==</code></p>
            </div>

            {/* 미리보기 */}
            {(title.trim() || content.trim()) && (
              <div>
                <label className={labelClass}>수신자에게 표시될 미리보기</label>
                <div className={`rounded-lg border p-5 ${type === "경고" || type === "제재" ? "border-[#e91e3f]/20 bg-[#e91e3f]/[0.03]" : "border-white/10 bg-white/[0.02]"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black tracking-wider border px-2 py-0.5 rounded-full ${TYPE_STYLES[type].badge}`}>{type}</span>
                    <span className="ml-auto text-[11px] text-gray-600">운영팀 · 방금</span>
                  </div>
                  <h4 className="text-sm md:text-base font-bold text-white break-keep mb-2">{title || <span className="text-gray-600">제목 미입력</span>}</h4>
                  <div className="text-sm text-gray-300">
                    {content.trim() ? <RenderFormattedText text={content} /> : <span className="text-gray-600 text-sm">본문 미입력</span>}
                  </div>
                </div>
              </div>
            )}

            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 text-white font-bold rounded-lg transition-all">
              {isSubmitting ? "발송 중..." : "통지 발송"}
            </button>
          </div>
        </form>
        </Reveal>

        {/* 발송 이력 */}
        <Reveal>
        <div>
          <div className="flex items-baseline gap-4 mb-4">
            <span className="text-[11px] font-black tracking-[0.3em] text-gray-500 uppercase">발송 이력</span>
            <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent"></div>
            <span className="text-[11px] font-bold text-gray-600">{sent.length}건</span>
          </div>
          {isLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm">불러오는 중...</div>
          ) : sent.length === 0 ? (
            <div className="text-center py-10 text-gray-600 text-sm bg-white/[0.02] rounded-xl border border-white/5">발송한 통지가 없습니다.</div>
          ) : (
            <div className="divide-y divide-white/[0.06] border-y border-white/[0.06]">
              {sent.map((n) => {
                const ts = TYPE_STYLES[n.type] || TYPE_STYLES["일반"];
                return (
                  <div key={n._id} className="py-4 flex items-start gap-4 group">
                    <span className={`shrink-0 mt-0.5 text-[9px] font-black tracking-wider border px-2 py-1 rounded ${ts.badge}`}>{n.type}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{n.content}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[10px] font-bold">
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
            <p className="text-sm text-gray-400 mb-8">해당 통지 기록을 삭제하시겠습니까? 수신자의 알림함에서도 사라집니다.</p>
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
