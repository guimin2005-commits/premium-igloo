"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// 📌 [관리자 명단 설정]
const ADMIN_USERS = ["elahw.06"]; 

const RenderFormattedText = ({ text, onCopy }: { text: string; onCopy?: () => void }) => {
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
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer' class='text-[#e91e3f] hover:underline'>$1</a>")
      .replace(/\{([^}]+)\}/g, (match, code) => `<span class='inline-flex items-center gap-1.5 bg-[#2a2a2a] px-2.5 py-1 rounded'><code class='text-[#e91e3f] font-mono text-sm'>${code}</code><button class='copy-btn text-[#e91e3f] hover:text-white transition-colors flex-shrink-0' data-copy='${code}' title='복사'><svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' strokeWidth='2' stroke='currentColor' class='w-3.5 h-3.5'><path strokeLinecap='round' strokeLinejoin='round' d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' /></svg></button></span>`)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<span class='underline'>$1</span>")
      .replace(/~~(.*?)~~/g, "<span class='line-through'>$1</span>")
      .replace(/==(.*?)==/g, "<span class='text-[#e91e3f] font-bold'>$1</span>");
  };

  const formatted = parseMarkdownWithTable(text);

  return (
    <div
      dangerouslySetInnerHTML={{ __html: formatted }}
      onClick={(e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('copy-btn')) {
          const code = target.getAttribute('data-copy');
          if (code) {
            navigator.clipboard.writeText(code);
            onCopy?.();
          }
        }
      }}
    />
  );
};

const stripMarkdown = (text: string) => {
  if (!text) return "";
  let result = text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1");
  // 마크다운 표 제거
  result = result.replace(/^\|[\s\S]*?\n(?:\|[\s\S]*?\n)*(?:\|.*?\|)?$/gm, "");
  return result.trim();
};

export default function EventPage() {
  const router = useRouter();
  const { data: session, status } = useSession() as any; 
  const isLoggedIn = status === "authenticated";

  const isAdmin = isLoggedIn && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [activeTab, setActiveTab] = useState("ongoing");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copyNotification, setCopyNotification] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });

  const fetchEvents = async () => {
    try {
      const res = await fetch("/api/posts?category=이벤트");
      if (res.ok) setPosts((await res.json()).data);
    } catch { console.error("로드 에러"); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchEvents(); }, []);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedEvent && selectedEvent._id === deleteConfirmId) setSelectedEvent(null);
        setPopupConfig({ isOpen: true, message: "이벤트가 삭제되었습니다.", isError: false });
        fetchEvents();
      }
    } catch { setPopupConfig({ isOpen: true, message: "에러 발생", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const handleEdit = (id: string, e: React.MouseEvent) => { e.stopPropagation(); router.push(`/write?id=${id}`); };

  const getEventStatus = (event: any) => {
    if (event.eventTag === "종료") return "ended";
    if (event.eventPeriod) {
      const startDateStr = event.eventPeriod.split("~")[0].trim(); 
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstDate.toISOString().split('T')[0].replace(/-/g, "."); 
      if (startDateStr > todayStr) return "upcoming"; 
    }
    return "ongoing"; 
  };

  const ongoingEvents = posts.filter(p => getEventStatus(p) === "ongoing");
  const upcomingEvents = posts.filter(p => getEventStatus(p) === "upcoming");
  const endedEvents = posts.filter(p => getEventStatus(p) === "ended");

  const currentDisplayEvents = activeTab === "ongoing" ? ongoingEvents : activeTab === "upcoming" ? upcomingEvents : endedEvents;

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 flex flex-col relative">
      
      {/* 📌 관리자 글쓰기 버튼이 추가된 헤더 영역 */}
      <div className="mb-10 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">이벤트</h1>
          <p className="text-gray-400 text-sm">고급 이글루의 다양한 이벤트와 혜택들의 소식을 확인하세요.</p>
        </div>
        
        {/* 관리자(isAdmin)일 때만 글쓰기 버튼 표출 */}
        {isAdmin && (
          <button 
            onClick={() => router.push("/write?category=이벤트")}
            className="bg-white text-black font-black text-xs px-5 py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
          >
            글쓰기
          </button>
        )}
      </div>

      {/* 친구 초대 이벤트 배너 */}
      <button onClick={() => router.push("/invite")} className="group w-full text-left mb-8 rounded-2xl border border-[#e91e3f]/20 bg-[#161213] relative overflow-hidden flex items-center justify-between gap-4 px-5 py-4 hover:border-[#e91e3f]/50 transition-colors">
        <div className="absolute -top-16 -right-10 w-40 h-40 rounded-full bg-[#e91e3f]/10 blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-3 min-w-0">
          <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f]">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-[18px] h-[18px]"><path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black tracking-widest text-[#e91e3f] uppercase mb-0.5">Invite Event</p>
            <h3 className="text-sm font-bold text-white break-keep">친구 초대 이벤트 — 코드 공유하고 함께 XP 받기</h3>
          </div>
        </div>
        <span className="relative shrink-0 inline-flex items-center gap-1 text-xs font-bold text-[#e91e3f]">참여하기
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
        </span>
      </button>

      <div className="flex gap-2 border-b border-white/10 mb-8 pb-px overflow-x-auto whitespace-nowrap">
        <button onClick={() => setActiveTab("ongoing")} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === "ongoing" ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>진행 중인 이벤트</button>
        <button onClick={() => setActiveTab("upcoming")} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === "upcoming" ? "border-blue-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>예정된 이벤트</button>
        <button onClick={() => setActiveTab("ended")} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 ${activeTab === "ended" ? "border-gray-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>종료된 이벤트</button>
      </div>

      {isLoading ? <div className="text-center py-20 text-gray-500 font-bold">로딩 중...</div> : currentDisplayEvents.length === 0 ? <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 이벤트가 없습니다.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {currentDisplayEvents.map((event) => {
            const status = getEventStatus(event);
            const isUpcoming = status === "upcoming";
            const displayTag = isUpcoming ? "예정" : event.eventTag;

            return (
              <div key={event._id} onClick={() => setSelectedEvent(event)} className="group flex flex-col justify-between p-1 rounded-3xl bg-gradient-to-br from-white/10 to-transparent hover:from-[#e91e3f]/30 transition-all duration-300 cursor-pointer relative" >
                {isAdmin && (
                  <div className="absolute top-6 right-6 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => handleEdit(event._id, e)} className="bg-black/80 text-white px-2.5 py-1.5 rounded-md text-xs font-bold border border-white/10 hover:bg-gray-800">수정</button>
                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(event._id); }} className="bg-red-500/80 text-white px-2.5 py-1.5 rounded-md text-xs font-bold border border-red-500/50 hover:bg-red-500">삭제</button>
                  </div>
                )}

                <div className="bg-[#121212] rounded-[1.4rem] p-6 h-full border border-white/5">
                  <div className="w-full h-40 bg-[#1a1a1a] rounded-xl mb-6 flex items-center justify-center border border-white/5 overflow-hidden">
                    {event.bannerUrl ? <img src={event.bannerUrl} alt="배너" className="w-full h-full object-cover" /> : <span className="text-gray-600 text-sm">이벤트 배너 이미지</span>}
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    {displayTag && displayTag !== "NONE" && (
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${isUpcoming ? "bg-blue-500 text-white" : displayTag === "NEW" ? "bg-emerald-500/10 text-emerald-400" : activeTab === "ongoing" ? "bg-[#e91e3f] text-white" : "bg-gray-700 text-gray-300"}`}>{displayTag}</span>
                    )}
                    <div className="flex items-center gap-1 text-gray-500">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                      <span className="text-xs font-medium">{event.eventPeriod || "날짜 미정"}</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold mb-2 text-white">{event.title}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{stripMarkdown(event.content)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-2xl p-8 shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            <div className="flex justify-end mb-4 shrink-0"><button onClick={() => setSelectedEvent(null)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="overflow-y-auto [&::-webkit-scrollbar]:hidden">
              <div className="w-full h-52 bg-[#1a1a1a] rounded-2xl mb-6 flex items-center justify-center border border-white/5 relative overflow-hidden shrink-0">
                {selectedEvent.bannerUrl ? <img src={selectedEvent.bannerUrl} alt="배너" className="w-full h-full object-cover" /> : <span className="text-gray-500 text-sm">이벤트 배너 이미지</span>}
              </div>

              <div className="flex items-center gap-4 mb-4">
                {getEventStatus(selectedEvent) === "upcoming" ? (
                  <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-500 text-white">예정</span>
                ) : (
                  selectedEvent.eventTag && selectedEvent.eventTag !== "NONE" && (
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${
                      selectedEvent.eventTag === "NEW" ? "bg-emerald-500/10 text-emerald-400" 
                      : activeTab === "ongoing" ? "bg-[#e91e3f] text-white" 
                      : "bg-gray-700 text-gray-300"
                    }`}>
                      {selectedEvent.eventTag}
                    </span>
                  )
                )}
                <div className="flex items-center gap-1.5 text-gray-400">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                  <span className="text-sm font-medium">{selectedEvent.eventPeriod || "날짜 미정"}</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 border-b border-white/5 pb-4">{selectedEvent.title}</h2>
              <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap"><RenderFormattedText text={selectedEvent.content} onCopy={() => { setCopyNotification(true); setTimeout(() => setCopyNotification(false), 2000); }} /></div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"><div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center"><h2 className="text-xl font-bold text-white mb-3">삭제 안내</h2><p className="text-sm text-gray-400 mb-8">영구 삭제하시겠습니까?</p><div className="flex gap-3"><button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button><button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button></div></div></div>}
      {popupConfig.isOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"><div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center"><div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popupConfig.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>{popupConfig.isError ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</div><h2 className="text-xl font-bold text-white mb-3">{popupConfig.isError ? "알림" : "처리 완료"}</h2><p className="text-sm text-gray-400 mb-8 whitespace-pre-line leading-relaxed">{popupConfig.message}</p><button onClick={() => setPopupConfig({ ...popupConfig, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-all">확인</button></div></div>}
    </main>
  );
}