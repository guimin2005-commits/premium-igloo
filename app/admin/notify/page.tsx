"use client";

import React, { useState, useEffect, useRef } from "react";
import { Reveal, LuxStyles } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
// 알림 모달 · 확인 모달 · 라벨은 관리자 공용 것을 쓴다 — 이 파일이 따로 들고 있던 복사본은 뺐다
import { inputClass, labelClass, useAdminGuard, useNotice, ConfirmDialog } from "../ui";

// 통지 유형별 색상 프리셋
const TYPE_STYLES: Record<string, { badge: string }> = {
  경고: { badge: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" },
  제재: { badge: "bg-orange-500/10 text-orange-700 border-orange-500/25" },
  안내: { badge: "bg-sky-500/10 text-sky-700 border-sky-500/25" },
  축하: { badge: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25" },
  일반: { badge: "bg-black/5 text-[#4b4b4b] border-black/15" },
};
const TYPES = ["경고", "제재", "안내", "축하", "일반"];

export default function AdminNotifyPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/notifications 가 서버에서 한 번 더 한다.
  // 예전에는 이 파일이 관리자 목록을 직접 들고 있어, 관리자가 늘면 여기만 조용히 어긋났다.
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const [sent, setSent] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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
      notify("수신자 · 제목 · 본문을 모두 입력해 주세요.", true);
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
        // 저장은 됐는데 DM 만 실패하는 경우가 있어, 어디까지 갔는지는 알려야 한다
        const msg = data.userFound
          ? data.dmSent
            ? "통지를 발송했습니다."
            : "통지를 저장했지만 DM 발송에 실패했습니다. 수신자가 DM을 막아 뒀을 수 있습니다."
          : "통지를 저장했지만 디스코드에서 해당 사용자명을 찾지 못해 DM은 보내지 못했습니다.";
        notify(msg);
      } else {
        notify(data.error || "발송에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/notifications?id=${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setSent((prev) => prev.filter((n) => n._id !== deleteConfirmId));
        notify("통지 기록을 삭제했습니다.");
      } else {
        notify("삭제에 실패했습니다.", true);
      }
    } catch {
      notify("서버 통신 오류가 발생했습니다.", true);
    } finally {
      setIsDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (관리자 화면마다 복사돼 있던 것)
  if (gate) return gate;

  const ToolBtn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className="px-2.5 py-1.5 text-xs font-bold text-[#5a5a5a] hover:text-[#131313] hover:bg-black/5 rounded-md transition-all flex items-center gap-1">{children}</button>
  );

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO (사무적 톤) ── */}
      <section className="relative w-full pt-14 pb-8 md:pt-20 md:pb-10 px-6 border-b border-black/5">
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            {/* 가로선 + 영문 라벨(eyebrow)은 뺐다 — 제목이 첫 줄이다 */}
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none mb-3 text-[#131313]">회원 통지 발송</h1>
            {/* 화면 밖에서 일어나는 것만 남긴다 — 알림함 기록과 디스코드 DM */}
            <p className="text-[#8a8a8a] text-sm leading-relaxed break-keep">통지는 사이트 알림함에 기록되고 디스코드 DM으로도 전송됩니다.</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 py-10 flex-1 flex flex-col space-y-10">

        {/* 통지서 작성 */}
        <Reveal>
        <form onSubmit={handleSubmit} className="rounded-xl border border-black/10 bg-[#ffffff] overflow-hidden">
          {/* 문서 헤더 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 bg-black/[0.015]">
            <div className="flex items-center gap-2.5">
              <span className="w-1 h-4 bg-[#e91e3f] rounded-full"></span>
              <span className="text-sm font-black text-[#131313] tracking-tight">통지서 작성</span>
            </div>
            <span className="text-[10px] font-bold text-[#5a5a5a] tracking-wide">발신 · 고급 이글루 운영팀</span>
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {/* 수신자 / 유형 */}
            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
              <div>
                <label className={labelClass}>수신자 (디스코드 사용자명) <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예: elahw.06" value={recipient} onChange={(e) => setRecipient(e.target.value)} className={inputClass} />
                {/* 표시 이름으로 넣으면 유저를 못 찾아 DM 만 조용히 빠진다 */}
                <p className="text-[10px] text-[#5a5a5a] mt-1.5">표시 이름이 아닌 고유 사용자명(핸들)이어야 합니다.</p>
              </div>
              <div>
                <label className={labelClass}>통지 유형 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex flex-wrap gap-1.5">
                  {TYPES.map((t) => (
                    <button type="button" key={t} onClick={() => setType(t)} className={`px-3.5 py-2 text-xs font-bold rounded-md border transition-all ${type === t ? TYPE_STYLES[t].badge : "bg-transparent border-black/10 text-[#8a8a8a] hover:border-black/25"}`}>{t}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 제목 */}
            <div>
              <label className={labelClass}>제목 <span className="text-[#e91e3f]">*</span></label>
              <input type="text" required placeholder="예: 커뮤니티 이용 규칙 위반에 대한 경고 통지" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
              <p className="text-[10px] text-[#5a5a5a] mt-1.5">제목은 디스코드 DM 알림에도 표시됩니다.</p>
            </div>

            {/* 본문 + 서식 툴바 */}
            <div>
              <label className={labelClass}>본문 <span className="text-[#e91e3f]">*</span></label>
              <div className="border border-black/10 rounded-lg overflow-hidden focus-within:border-[#e91e3f] transition-colors">
                <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-black/[0.02] border-b border-black/5">
                  <ToolBtn onClick={() => insertWrap("**")}><span className="font-extrabold text-sm">B</span> 굵게</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("__")}><span className="underline text-sm">U</span> 밑줄</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("~~")}><span className="line-through text-sm">S</span> 취소선</ToolBtn>
                  <ToolBtn onClick={() => insertWrap("==")}><span className="text-sm font-extrabold text-[#e91e3f]">A</span> 강조</ToolBtn>
                  <span className="w-px h-4 bg-black/10 mx-1"></span>
                  <ToolBtn onClick={() => insertTable(2, 2)}><span className="text-sm font-bold">⊞</span> 표</ToolBtn>
                </div>
                <textarea ref={textareaRef} required rows={7} placeholder="통지 내용을 작성하세요" value={content} onChange={(e) => setContent(e.target.value)} className="w-full bg-[#ffffff] px-4 py-3.5 text-sm text-[#131313] outline-none resize-none leading-relaxed placeholder:text-[#8a8a8a] [&::-webkit-scrollbar]:hidden" />
              </div>
              {/* 서식 문법 안내는 뺐다 — 위 툴바 버튼이 같은 일을 하고 아래 미리보기가 결과를 보여 준다 */}
            </div>

            {/* 미리보기 */}
            {(title.trim() || content.trim()) && (
              <div>
                <label className={labelClass}>수신자에게 표시될 미리보기</label>
                <div className={`rounded-lg border p-5 ${type === "경고" || type === "제재" ? "border-[#e91e3f]/20 bg-[#e91e3f]/[0.03]" : "border-black/10 bg-black/[0.02]"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-black tracking-wider border px-2 py-0.5 rounded-full ${TYPE_STYLES[type].badge}`}>{type}</span>
                    <span className="ml-auto text-[11px] text-[#5a5a5a]">운영팀 · 방금</span>
                  </div>
                  <h4 className="text-sm md:text-base font-bold text-[#131313] break-keep mb-2">{title || <span className="text-[#5a5a5a]">제목 미입력</span>}</h4>
                  <div className="text-sm text-[#4b4b4b]">
                    {content.trim() ? <RenderFormattedText text={content} /> : <span className="text-[#5a5a5a] text-sm">본문 미입력</span>}
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
            <span className="text-[11px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">발송 이력</span>
            <div className="h-px flex-1 bg-gradient-to-r from-black/10 to-transparent"></div>
            <span className="text-[11px] font-bold text-[#5a5a5a]">{sent.length}건</span>
          </div>
          {isLoading ? (
            <div className="text-center py-10 text-[#8a8a8a] text-sm">불러오는 중...</div>
          ) : sent.length === 0 ? (
            <div className="text-center py-10 text-[#5a5a5a] text-sm bg-black/[0.02] rounded-xl border border-black/5">발송한 통지가 없습니다.</div>
          ) : (
            <div className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
              {sent.map((n) => {
                const ts = TYPE_STYLES[n.type] || TYPE_STYLES["일반"];
                return (
                  <div key={n._id} className="py-4 flex items-start gap-4 group">
                    <span className={`shrink-0 mt-0.5 text-[9px] font-black tracking-wider border px-2 py-1 rounded ${ts.badge}`}>{n.type}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#131313] truncate">{n.title}</p>
                      <p className="text-xs text-[#8a8a8a] truncate mt-0.5">{n.content}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[10px] font-bold">
                        <span className="text-[#5a5a5a]">→ {n.recipientName}</span>
                        <span className={n.dmSent ? "text-emerald-700/80" : "text-[#5a5a5a]"}>{n.dmSent ? "DM 발송됨" : "DM 미발송"}</span>
                        <span className={n.read ? "text-sky-700/80" : "text-[#5a5a5a]"}>{n.read ? "읽음" : "안 읽음"}</span>
                        <span className="text-[#5a5a5a]">{new Date(n.createdAt).toLocaleString("ko-KR")}</span>
                      </div>
                    </div>
                    <button onClick={() => setDeleteConfirmId(n._id)} className="shrink-0 text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] bg-black/5 px-3 py-1.5 rounded-lg transition-colors">삭제</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </Reveal>
      </div>

      {/* ── 통지 기록 삭제 확인 — 수신자 알림함에서도 사라지므로 되돌릴 수 없다 ── */}
      <ConfirmDialog
        open={!!deleteConfirmId}
        danger
        busy={isDeleting}
        title="통지 기록 삭제"
        confirmLabel="삭제"
        body="수신자의 알림함에서도 사라집니다."
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {noticeEl}
    </main>
  );
}
