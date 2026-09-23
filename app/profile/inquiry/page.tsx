"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { LuxStyles } from "../../components/Lux";
import { ICON_PATHS } from "../../components/Icons";

const FILTERS = [{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }];

// 📌 1:1 문의 내역 — 내 정보에서 분리한 페이지. 새 문의는 /support 에서.
export default function MyInquiriesPage() {
  const { data: session, status } = useSession();
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d?.success && Array.isArray(d.data) ? d.data.map((item: any) => ({
        id: item._id, type: item.mainType || "일반 문의", title: item.title || "제목 없음",
        date: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : "날짜 없음",
        createdAt: item.createdAt, updatedAt: item.updatedAt, answeredAt: item.answeredAt,
        status: item.status, content: item.content, answer: item.answer,
      })) : []))
      .catch(() => setRows([]));
  }, [status, session]);

  const list = (rows || []).filter((inq) => (filter === "pending" ? inq.status === "접수 중" : filter === "completed" ? inq.status === "답변 완료" : true));

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-6 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          내 정보
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">1:1 문의 내역 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${filter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-transparent border-[#dedddb] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
              ))}
            </div>
            <Link href="/support" className="px-3.5 py-1.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[11px] font-bold transition-colors">새 문의</Link>
          </div>
        </div>

        <div className="border-t border-black/[0.08]">
          {rows === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : list.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">등록된 문의 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {list.map((inq) => (
                <button key={inq.id} onClick={() => setSelected(inq)} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                  <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${inq.status === "접수 중" ? "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" : "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]"}`}>{inq.status}</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[#131313] truncate"><span className="text-[#8a8a8a] font-medium mr-1.5">[{inq.type}]</span>{inq.title}</h4>
                    <p className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{inq.date}</p>
                  </div>
                  <svg className="w-4 h-4 text-[#b9b7b3] group-hover:text-[#5a5a5a] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#dedddb] rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">1:1 문의 내역</span>
              <button onClick={() => setSelected(null)} aria-label="닫기" className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f4f3f2] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>
            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${selected.status === "접수 중" ? "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" : "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]"}`}>{selected.status}</span>
                <span className="text-[11px] text-[#a3a3a3] font-medium">[{selected.type}]</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-[#131313] break-keep leading-snug mb-5">{selected.title}</h3>
              <div className="rounded-lg border border-[#ececea] bg-white divide-y divide-[#ececea] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">접수일시</span><span className="text-[#4b4b4b] font-bold tabular-nums">{selected.createdAt ? new Date(selected.createdAt).toLocaleString("ko-KR") : selected.date}</span></div>
                {selected.status === "답변 완료" && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#e91e3f] font-bold">답변일시</span><span className="text-[#4b4b4b] font-bold tabular-nums">{selected.answeredAt ? new Date(selected.answeredAt).toLocaleString("ko-KR") : selected.updatedAt ? new Date(selected.updatedAt).toLocaleString("ko-KR") : "처리 완료"}</span></div>
                )}
              </div>
              <p className="text-[11px] font-black tracking-wide text-[#8a8a8a] uppercase mb-2">문의 내용</p>
              <div className="text-sm text-[#4b4b4b] leading-relaxed whitespace-pre-wrap break-keep">{selected.content}</div>
              {selected.answer && (
                <div className="mt-6 bg-[#e91e3f]/[0.04] border border-[#e91e3f]/20 p-5 rounded-lg">
                  <span className="text-[11px] font-black text-[#e91e3f] tracking-wide uppercase mb-2.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>운영팀 답변</span>
                  <p className="text-sm text-[#4b4b4b] leading-relaxed break-keep whitespace-pre-wrap">{selected.answer}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
