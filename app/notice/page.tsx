"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";

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
        let target = e.target as HTMLElement;
        while (target && !target.classList.contains('copy-btn')) {
          target = target.parentElement as HTMLElement;
        }
        if (target?.classList.contains('copy-btn')) {
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

// 공지 중요 여부 판별 (구버전 '필독'/isImportant 호환)
const isImportantNotice = (n: any) => n?.noticeTag === "중요" || n?.noticeTag === "필독" || n?.isImportant;

// 카테고리 태그 라벨 및 색상 메타데이터
const getNoticeTagMeta = (n: any) => {
  if (isImportantNotice(n)) return { label: "중요", className: "bg-[#e91e3f]/10 text-[#e91e3f]" };
  if (n?.noticeTag === "업데이트") return { label: "업데이트", className: "bg-blue-500/10 text-blue-400" };
  return { label: "일반", className: "bg-white/10 text-white" };
};

export default function NoticePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";

  const isAdmin = isLoggedIn && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [notices, setNotices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNotice, setSelectedNotice] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [copyNotification, setCopyNotification] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // 📌 읽은 공지 ID 로드 (NEW 뱃지용)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("readNotices") || "[]");
      if (Array.isArray(stored)) setReadIds(new Set(stored));
    } catch {}
  }, []);

  const markAsRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("readNotices", JSON.stringify(Array.from(next).slice(-200))); } catch {}
      return next;
    });
  };

  const isNewNotice = (notice: any) =>
    !readIds.has(notice._id) && Date.now() - new Date(notice.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });

  const fetchNotices = async () => {
    try {
      const res = await fetch("/api/posts?category=공지사항");
      if (res.ok) setNotices((await res.json()).data);
    } catch { console.error("로드 에러"); } finally { setIsLoading(false); }
  };

  useEffect(() => { fetchNotices(); }, []);

  useEffect(() => {
    const noticeId = searchParams.get("id");
    if (noticeId && notices.length > 0) {
      const notice = notices.find(n => n._id === noticeId);
      if (notice) setSelectedNotice(notice);
    }
  }, [notices, searchParams]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedNotice && selectedNotice._id === deleteConfirmId) setSelectedNotice(null);
        setPopupConfig({ isOpen: true, message: "공지사항이 삭제되었습니다.", isError: false });
        fetchNotices();
      }
    } catch { setPopupConfig({ isOpen: true, message: "에러 발생", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const copyNoticeUrl = () => {
    if (!selectedNotice) return;
    const url = `${window.location.origin}/notice?id=${selectedNotice._id}`;
    navigator.clipboard.writeText(url);
    setCopyNotification(true);
    setTimeout(() => setCopyNotification(false), 2000);
  };


  const handleEdit = (id: string, e: React.MouseEvent) => { e.stopPropagation(); router.push(`/write?id=${id}`); };

  const sortedNotices = [...notices].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const tabFiltered =
    activeTab === "important" ? sortedNotices.filter(n => isImportantNotice(n)) :
    activeTab === "update" ? sortedNotices.filter(n => n.noticeTag === "업데이트") :
    sortedNotices;

  // 📌 검색어 필터 (제목 + 내용)
  const filteredNotices = searchQuery.trim()
    ? tabFiltered.filter(n =>
        (n.title || "").toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (n.content || "").toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : tabFiltered;

  const currentIndex = selectedNotice ? sortedNotices.findIndex(n => n._id === selectedNotice._id) : -1;
  const prevNotice = currentIndex > 0 ? sortedNotices[currentIndex - 1] : null;
  const nextNotice = currentIndex !== -1 && currentIndex < sortedNotices.length - 1 ? sortedNotices[currentIndex + 1] : null;

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10 flex justify-between items-end gap-6">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Official Announcements</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">공지</span><span className="lux-shimmer">사항</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 최신 소식과 주요 안내를 확인하세요.</p>
          </Reveal>
          {isAdmin && (
            <button
              onClick={() => router.push("/write?category=공지사항")}
              className="shrink-0 bg-white text-black font-black text-xs px-5 py-3 rounded-full hover:bg-gray-200 transition-all active:scale-95"
            >
              글쓰기
            </button>
          )}
        </div>
      </section>

      {/* ── 탭 (알약 스타일) ── */}
      <div className="sticky top-16 z-30 w-full px-6 py-3 bg-[#090909]/85 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap flex-1 min-w-0">
            {[{ id: "all", label: "전체 공지" }, { id: "important", label: "중요 공지" }, { id: "update", label: "업데이트" }].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-2.5 text-xs md:text-sm font-bold rounded-full shrink-0 outline-none focus:outline-none transition-all duration-300 ${
                activeTab === tab.id
                  ? "bg-[#e91e3f] text-white shadow-[0_4px_20px_rgba(233,30,63,0.35)]"
                  : "bg-white/[0.04] text-gray-500 hover:text-white hover:bg-white/[0.08] border border-white/5"
              }`}>{tab.label}</button>
            ))}
          </div>
          {/* 📌 공지 검색 */}
          <div className="relative shrink-0 w-36 md:w-56">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="공지 검색"
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/5 rounded-full text-xs md:text-sm text-white outline-none focus:border-[#e91e3f]/50 focus:bg-white/[0.06] transition-colors placeholder:text-gray-600"
            />
          </div>
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-6 py-10 flex-1 flex flex-col">
      {isLoading ? <div className="text-center py-20 text-gray-500 font-bold">로딩 중...</div> : filteredNotices.length === 0 ? <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 공지가 없습니다.</div> : (
        <div className="flex flex-col gap-2 md:gap-3">
          {filteredNotices.map((notice, listIdx) => {
            const tagMeta = getNoticeTagMeta(notice);
            return (
              <Reveal key={notice._id} delay={Math.min(listIdx, 5) * 70}>
              <div onClick={() => { markAsRead(notice._id); setSelectedNotice(notice); }} className="relative rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-px cursor-pointer group hover:from-[#e91e3f]/40 hover:to-white/[0.02] transition-all duration-300">
              <div className="rounded-2xl bg-[#111111]/95 p-4 md:p-6 group-hover:bg-[#141414] transition-colors duration-300">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 min-h-[24px] shrink-0">
                    {notice.isPinned && (
                      <div className="bg-[#e91e3f]/10 border border-[#e91e3f]/20 p-1.5 rounded-md shrink-0 text-[#e91e3f]" title="고정 공지">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                          <path fillRule="evenodd" d="M5.25 7.5A6.75 6.75 0 0 1 12 .75h.008a6.75 6.75 0 0 1 6.742 6.75v3.19l1.644 4.931a.75.75 0 0 1-.712.987h-6.932v5.642a.75.75 0 0 1-1.5 0v-5.642H4.25a.75.75 0 0 1-.712-.987l1.644-4.931V7.5Z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded shrink-0 whitespace-nowrap ${tagMeta.className}`}>{tagMeta.label}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-auto shrink-0">
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleEdit(notice._id, e)} className="text-xs font-bold text-gray-500 hover:text-white bg-white/5 px-2 py-1 rounded">수정</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(notice._id); }} className="text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-2 py-1 rounded">삭제</button>
                      </div>
                    )}
                    <span className="text-xs text-gray-500 whitespace-nowrap">{formatDate(notice.createdAt)}</span>
                  </div>
                </div>
                <h3 className="text-base font-bold text-white transition-colors line-clamp-1 mb-2.5 group-hover:text-[#ff5c77] flex items-center gap-2">
                  {isNewNotice(notice) && <span className="shrink-0 text-[8px] font-black tracking-widest bg-[#e91e3f] text-white px-1.5 py-0.5 rounded animate-[pulseGlow_2.5s_ease-in-out_infinite]">N</span>}
                  <span className="truncate">{notice.title}</span>
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed line-clamp-2">{stripMarkdown(notice.content)}</p>
              </div>
              </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {selectedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-2xl h-[80vh] flex flex-col relative shadow-2xl overflow-hidden [&::-webkit-scrollbar]:hidden">
            <div className="absolute top-6 right-6 flex gap-2 z-10">
              {isAdmin && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(selectedNotice._id, e); }} className="px-3 py-2 text-xs font-bold text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors">수정</button>
                  <button onClick={() => { setDeleteConfirmId(selectedNotice._id); setSelectedNotice(null); }} className="px-3 py-2 text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 hover:bg-red-500/10 rounded-lg transition-colors">삭제</button>
                </>
              )}
              <button onClick={copyNoticeUrl} className={`p-2 rounded-full transition-all ${copyNotification ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-gray-400 hover:text-white"}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
              <button onClick={() => setSelectedNotice(null)} className="p-2 text-gray-400 hover:text-white bg-white/5 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            
            <div className="p-8 pb-0 shrink-0">
              <div className="flex items-center gap-3 mb-4 min-h-[28px]">
                {selectedNotice.isPinned && <div className="bg-white/10 p-1.5 rounded-md shrink-0 text-white"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M5.25 7.5A6.75 6.75 0 0 1 12 .75h.008a6.75 6.75 0 0 1 6.742 6.75v3.19l1.644 4.931a.75.75 0 0 1-.712.987h-6.932v5.642a.75.75 0 0 1-1.5 0v-5.642H4.25a.75.75 0 0 1-.712-.987l1.644-4.931V7.5Z" clipRule="evenodd" /></svg></div>}
                {(() => { const m = getNoticeTagMeta(selectedNotice); return <span className={`px-2.5 py-1 text-xs font-bold rounded-md ${m.className}`}>{m.label}</span>; })()}
                <span className="text-sm text-gray-500">{formatDate(selectedNotice.createdAt)}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-6 pb-6 border-b border-white/5 line-clamp-2">{selectedNotice.title}</h2>
            </div>
            
            <div className="p-8 pt-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden flex flex-col">
              <p className="text-gray-300 text-base leading-loose whitespace-pre-wrap flex-1 select-text"><RenderFormattedText text={selectedNotice.content} onCopy={() => { setCopyNotification(true); setTimeout(() => setCopyNotification(false), 2000); }} /></p>
              
              {selectedNotice.bannerUrl && (
                <div className="mt-8 w-full h-52 bg-[#1a1a1a] rounded-2xl flex items-center justify-center border border-white/5 relative overflow-hidden shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedNotice.bannerUrl} alt="공지 이미지" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="p-6 shrink-0 border-t border-white/5 bg-[#1a1a1a]/50 rounded-b-[2rem] flex items-center justify-between">
              <button onClick={() => nextNotice && setSelectedNotice(nextNotice)} disabled={!nextNotice} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg> 이전 공지
              </button>
              <button onClick={() => prevNotice && setSelectedNotice(prevNotice)} disabled={!prevNotice} className="flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                다음 공지 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
              </button>
            </div>

          </div>
        </div>
      )}

      {deleteConfirmId && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"><div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center"><h2 className="text-xl font-bold text-white mb-3">삭제 안내</h2><p className="text-sm text-gray-400 mb-8">영구 삭제하시겠습니까?</p><div className="flex gap-3"><button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl">취소</button><button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 text-white rounded-xl">삭제</button></div></div></div>}
      </div>
    </main>
  );
}