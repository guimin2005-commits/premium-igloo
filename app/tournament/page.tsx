"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];

const RenderFormattedText = ({ text }: { text: string }) => {
  if (!text) return null;

  const parseMarkdownWithTable = (text: string): string => {
    const lines = text.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (line.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          tableLines.push(lines[i]);
          i++;
        }

        const table = parseMarkdownTable(tableLines);
        if (table) {
          result.push(table);
        } else {
          result.push(...tableLines.map(l => formatInlineMarkdown(l)));
        }
      } else {
        result.push(formatInlineMarkdown(line));
        i++;
      }
    }

    return result.join("\n");
  };

  const parseMarkdownTable = (lines: string[]): string | null => {
    if (lines.length < 2) return null;

    const headerLine = lines[0].trim();
    const separatorLine = lines[1].trim();

    if (!/^\|.*\|$/.test(headerLine) || !/^\|[\s|-]+\|$/.test(separatorLine)) {
      return null;
    }

    const parseRow = (line: string): string[] => {
      return line.split("|").slice(1, -1).map(cell => cell.trim());
    };

    const headerCells = parseRow(headerLine);
    const dataRows = lines.slice(2).map(parseRow);

    let html = "<table class='w-full border-collapse border border-white/10 my-4'>";
    html += "<thead><tr>";
    headerCells.forEach(cell => {
      html += `<th class='border border-white/10 px-3 py-2 bg-white/5 text-left font-bold'>${formatInlineMarkdown(cell)}</th>`;
    });
    html += "</tr></thead>";

    html += "<tbody>";
    dataRows.forEach(cells => {
      html += "<tr>";
      cells.forEach(cell => {
        html += `<td class='border border-white/10 px-3 py-2'>${formatInlineMarkdown(cell)}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";

    return html;
  };

  const formatInlineMarkdown = (text: string): string => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<span class='underline'>$1</span>")
      .replace(/~~(.*?)~~/g, "<span class='line-through'>$1</span>")
      .replace(/==(.*?)==/g, "<span class='text-[#e91e3f] font-bold'>$1</span>");
  };

  const formatted = parseMarkdownWithTable(text);
  return <div dangerouslySetInnerHTML={{ __html: formatted }} />;
};

const STATUS_META: Record<string, { badge: string; label: string }> = {
  "진행중": { badge: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30", label: "진행중" },
  "예정됨": { badge: "bg-blue-500/20 text-blue-400 border border-blue-500/30", label: "예정됨" },
  "종료됨": { badge: "bg-gray-500/20 text-gray-400 border border-white/10", label: "종료됨" },
};

export default function TournamentPage() {
  const router = useRouter();
  const { data: session, status } = useSession() as any;
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [tournaments, setTournaments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popup, setPopup] = useState({ isOpen: false, message: "", isError: false, isLoginRequired: false });

  const fetchTournaments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/posts?category=대회", { cache: "no-store" });
      if (res.ok) setTournaments((await res.json()).data || []);
    } catch { console.error("대회 로드 실패"); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchTournaments(); }, []);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        if (selected && selected._id === deleteConfirmId) setSelected(null);
        setPopup({ isOpen: true, message: "대회가 삭제되었습니다.", isError: false });
        fetchTournaments();
      }
    } catch { setPopup({ isOpen: true, message: "삭제 중 오류 발생", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const getStatus = (t: any) => STATUS_META[t.tournamentStatus] ? t.tournamentStatus : "예정됨";

  const sorted = [...tournaments].sort((a, b) => {
    const order: Record<string, number> = { "진행중": 0, "예정됨": 1, "종료됨": 2 };
    return (order[getStatus(a)] ?? 1) - (order[getStatus(b)] ?? 1);
  });

  const filtered = activeFilter === "all" ? sorted : sorted.filter(t => getStatus(t) === activeFilter);

  const handleApply = (t: any) => {
    if (getStatus(t) !== "진행중") return;
    if (status !== "authenticated") {
      setPopup({ isOpen: true, message: "로그인이 필요합니다.", isError: true, isLoginRequired: true });
      return;
    }
    if (t.tournamentLink) window.open(t.tournamentLink, "_blank", "noopener,noreferrer");
    else setSelected(t);
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 animate-in fade-in">
      <div className="mb-10 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">대회</h1>
          <p className="text-gray-400 text-sm">고급 이글루의 e스포츠 리그 허브입니다.</p>
        </div>
        {isAdmin && (
          <button onClick={() => router.push("/write?category=대회")} className="bg-white text-black font-black text-xs px-5 py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-95 shrink-0">대회 등록</button>
        )}
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-10 pb-px overflow-x-auto whitespace-nowrap">
        {[{ id: "all", label: "전체 대회" }, { id: "진행중", label: "진행 중 리그" }, { id: "예정됨", label: "예정된 리그" }, { id: "종료됨", label: "종료된 리그" }].map((tab) => (
          <button key={tab.id} onClick={() => setActiveFilter(tab.id)} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 outline-none ${activeFilter === tab.id ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>{tab.label}</button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 대회가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {filtered.map((t) => {
            const st = getStatus(t);
            return (
              <div key={t._id} onClick={() => setSelected(t)} className="bg-[#121212] border border-white/5 rounded-3xl overflow-hidden hover:border-[#e91e3f]/40 transition-all duration-300 group flex flex-col relative cursor-pointer">
                <div className="w-full h-48 bg-[#1a1a1a] relative overflow-hidden">
                  {t.bannerUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.bannerUrl} alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 opacity-70" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-700">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-16 h-16"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /></svg>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#121212] to-transparent" />
                  <span className={`absolute top-5 right-5 px-3 py-1 text-xs font-bold rounded-md ${STATUS_META[st].badge}`}>{STATUS_META[st].label}</span>
                  {isAdmin && (
                    <div className="absolute top-5 left-5 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); router.push(`/write?id=${t._id}`); }} className="text-xs font-bold text-white bg-black/50 backdrop-blur px-2 py-1 rounded hover:bg-black/70">수정</button>
                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(t._id); }} className="text-xs font-bold text-red-400 bg-black/50 backdrop-blur px-2 py-1 rounded hover:bg-black/70">삭제</button>
                    </div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-black tracking-widest text-gray-500">{t.tournamentGame}</span>
                    <h3 className="text-2xl font-black text-white mt-1 mb-4">{t.title}</h3>
                    <div className="space-y-2 mb-6 bg-white/[0.02] p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 font-bold">보상 및 상금</span>
                        <span className="text-white font-black text-right">{t.tournamentPrize}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500 font-bold">리그 일정</span>
                        <span className="text-gray-400 font-medium text-right flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                          {t.tournamentDate || "미정"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={st !== "진행중"}
                    onClick={(e) => { e.stopPropagation(); handleApply(t); }}
                    className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all ${st !== "진행중" ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-[#e91e3f] text-white hover:bg-[#d01634] active:scale-95"}`}
                  >
                    {st === "진행중" ? "참가 신청하기" : st === "예정됨" ? "대진표 공개 대기" : "대회 종료"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[85vh] flex flex-col relative shadow-2xl overflow-hidden">
            <button onClick={() => setSelected(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full z-10"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>

            {selected.bannerUrl && (
              <div className="w-full h-52 bg-[#1a1a1a] relative overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.bannerUrl} alt={selected.title} className="w-full h-full object-cover opacity-70" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121212] to-transparent" />
              </div>
            )}

            <div className="p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1 text-xs font-bold rounded-md ${STATUS_META[getStatus(selected)].badge}`}>{STATUS_META[getStatus(selected)].label}</span>
                <span className="text-[10px] font-black tracking-widest text-gray-500">{selected.tournamentGame}</span>
              </div>
              <h2 className="text-3xl font-black text-white mb-4">{selected.title}</h2>

              {isAdmin && (
                <div className="flex gap-2 mb-6">
                  <button onClick={() => router.push(`/write?id=${selected._id}`)} className="text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors">수정하기</button>
                  <button onClick={() => setDeleteConfirmId(selected._id)} className="text-xs font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-4 py-2 rounded-lg transition-colors">삭제하기</button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-gray-500 font-bold mb-1">보상 및 상금</p>
                  <p className="text-white font-black">{selected.tournamentPrize}</p>
                </div>
                <div className="bg-white/[0.02] p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-gray-500 font-bold mb-1">리그 일정</p>
                  <p className="text-gray-300 font-bold">{selected.tournamentDate || "미정"}</p>
                </div>
              </div>

              {selected.content && (
                <div className="text-gray-300 text-base leading-loose whitespace-pre-wrap mb-8"><RenderFormattedText text={selected.content} /></div>
              )}

              <button
                disabled={getStatus(selected) !== "진행중"}
                onClick={() => handleApply(selected)}
                className={`w-full py-4 rounded-xl font-bold text-sm transition-all ${getStatus(selected) !== "진행중" ? "bg-white/5 text-gray-600 cursor-not-allowed" : "bg-[#e91e3f] text-white hover:bg-[#d01634] shadow-lg shadow-[#e91e3f]/20"}`}
              >
                {getStatus(selected) === "진행중" ? "참가 신청하기" : getStatus(selected) === "예정됨" ? "대진표 공개 대기" : "대회 종료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center">
            <h2 className="text-xl font-bold text-white mb-3">삭제 안내</h2>
            <p className="text-sm text-gray-400 mb-8">해당 대회를 영구 삭제하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl font-bold">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-bold transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {popup.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">{popup.isError ? "알림" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8">{popup.message}</p>
            {popup.isLoginRequired ? (
              <div className="flex gap-3">
                <button onClick={() => setPopup({ ...popup, isOpen: false })} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button>
                <button onClick={() => router.push("/auth/signin")} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors">로그인</button>
              </div>
            ) : (
              <button onClick={() => setPopup({ ...popup, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
