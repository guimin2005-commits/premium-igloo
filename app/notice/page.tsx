"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

// 📌 [관리자 명단 설정]
const ADMIN_USERS = ["elahw.06"]; 

const RenderFormattedText = ({ text, onCopy }: { text: string; onCopy?: () => void }) => {
  if (!text) return null;

  const renderContent = (content: string) => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let key = 0;

    // 모든 패턴을 찾기 위한 정규표현식
    const patterns = [
      { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: "link" },
      { regex: /\{([^}]+)\}/g, type: "copy-box" },
      { regex: /\*\*(.*?)\*\*/g, type: "bold" },
      { regex: /__(.*?)__/g, type: "underline" },
      { regex: /~~(.*?)~~/g, type: "strikethrough" },
      { regex: /==(.*?)==/g, type: "highlight" },
    ];

    // 모든 매치를 수집
    const matches: { index: number; length: number; type: string; groups: string[] }[] = [];
    patterns.forEach(({ regex, type }) => {
      let match;
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          index: match.index,
          length: match[0].length,
          type,
          groups: Array.from(match).slice(1),
        });
      }
    });

    // 매치를 인덱스 기준으로 정렬하고 중복 제거 (더 긴 매치 우선)
    matches.sort((a, b) => a.index - b.index || b.length - a.length);
    const filtered: typeof matches = [];
    const used = new Set<number>();
    matches.forEach(m => {
      if (!Array.from({ length: m.length }, (_, i) => m.index + i).some(i => used.has(i))) {
        filtered.push(m);
        for (let i = 0; i < m.length; i++) used.add(m.index + i);
      }
    });

    filtered.sort((a, b) => a.index - b.index);

    // 부분을 렌더링
    filtered.forEach(match => {
      if (match.index > lastIndex) {
        parts.push(
          <span key={key++}>
            {content.substring(lastIndex, match.index).split("\n").map((line, i) => (
              <React.Fragment key={i}>
                {i > 0 && <br />}
                {line}
              </React.Fragment>
            ))}
          </span>
        );
      }

      if (match.type === "link") {
        parts.push(
          <a key={key++} href={match.groups[1]} target="_blank" rel="noopener noreferrer" className="text-[#e91e3f] hover:underline">
            {match.groups[0]}
          </a>
        );
      } else if (match.type === "copy-box") {
        parts.push(
          <span key={key++} className="inline-flex items-center gap-1.5 bg-[#2a2a2a] px-2.5 py-1 rounded">
            <code className="text-[#e91e3f] font-mono text-sm">{match.groups[0]}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(match.groups[0]);
                onCopy?.();
              }}
              className="text-[#e91e3f] hover:text-white transition-colors flex-shrink-0"
              title="복사"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </span>
        );
      } else if (match.type === "bold") {
        parts.push(<strong key={key++}>{match.groups[0]}</strong>);
      } else if (match.type === "underline") {
        parts.push(<span key={key++} className="underline">{match.groups[0]}</span>);
      } else if (match.type === "strikethrough") {
        parts.push(<span key={key++} className="line-through">{match.groups[0]}</span>);
      } else if (match.type === "highlight") {
        parts.push(<span key={key++} className="text-[#e91e3f] font-bold">{match.groups[0]}</span>);
      }

      lastIndex = match.index + match.length;
    });

    if (lastIndex < content.length) {
      parts.push(
        <span key={key++}>
          {content.substring(lastIndex).split("\n").map((line, i) => (
            <React.Fragment key={i}>
              {i > 0 && <br />}
              {line}
            </React.Fragment>
          ))}
        </span>
      );
    }

    return parts;
  };

  // 테이블 처리
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      const isValidTable = tableLines.length >= 2 && /^\|[\s|-]+\|$/.test(tableLines[1].trim());
      if (isValidTable) {
        const parseRow = (line: string): string[] => line.split("|").slice(1, -1).map(cell => cell.trim());
        const headerCells = parseRow(tableLines[0]);
        const dataRows = tableLines.slice(2).map(parseRow);

        elements.push(
          <table key={key++} className="w-full border-collapse border border-white/10 my-4">
            <thead>
              <tr>
                {headerCells.map((cell, idx) => (
                  <th key={idx} className="border border-white/10 px-3 py-2 bg-white/5 text-left font-bold">
                    {renderContent(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((cells, rowIdx) => (
                <tr key={rowIdx}>
                  {cells.map((cell, cellIdx) => (
                    <td key={cellIdx} className="border border-white/10 px-3 py-2">
                      {renderContent(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      } else {
        tableLines.forEach(tableLine => {
          elements.push(
            <p key={key++}>{renderContent(tableLine)}</p>
          );
        });
      }
    } else {
      elements.push(
        <p key={key++}>{renderContent(line)}</p>
      );
      i++;
    }
  }

  return <div className="space-y-2">{elements}</div>;
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

  const filteredNotices =
    activeTab === "important" ? sortedNotices.filter(n => isImportantNotice(n)) :
    activeTab === "update" ? sortedNotices.filter(n => n.noticeTag === "업데이트") :
    sortedNotices;

  const currentIndex = selectedNotice ? sortedNotices.findIndex(n => n._id === selectedNotice._id) : -1;
  const prevNotice = currentIndex > 0 ? sortedNotices[currentIndex - 1] : null;
  const nextNotice = currentIndex !== -1 && currentIndex < sortedNotices.length - 1 ? sortedNotices[currentIndex + 1] : null;

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col relative">
      
      {/* 📌 관리자 글쓰기 버튼이 추가된 헤더 영역 */}
      <div className="mb-10 border-b border-white/10 pb-6 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">공지사항</h1>
          <p className="text-gray-400 text-sm">고급 이글루의 최신 소식과 주요 안내를 확인하세요.</p>
        </div>
        
        {/* 관리자(isAdmin)일 때만 글쓰기 버튼 표출 */}
        {isAdmin && (
          <button 
            onClick={() => router.push("/write?category=공지사항")}
            className="bg-white text-black font-black text-xs px-5 py-3 rounded-xl hover:bg-gray-200 transition-all active:scale-95"
          >
            글쓰기
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b border-white/10 mb-8 pb-px overflow-x-auto whitespace-nowrap">
        {[{ id: "all", label: "전체 공지" }, { id: "important", label: "중요 공지" }, { id: "update", label: "업데이트" }].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-6 py-3 text-sm font-bold transition-all border-b-2 outline-none ${activeTab === tab.id ? "border-[#e91e3f] text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>{tab.label}</button>
        ))}
      </div>

      {isLoading ? <div className="text-center py-20 text-gray-500 font-bold">로딩 중...</div> : filteredNotices.length === 0 ? <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 공지가 없습니다.</div> : (
        <div className="flex flex-col gap-4">
          {filteredNotices.map((notice) => {
            const tagMeta = getNoticeTagMeta(notice);
            return (
              <div key={notice._id} onClick={() => setSelectedNotice(notice)} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6 cursor-pointer hover:border-[#e91e3f]/30 transition-all duration-300 relative group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3 min-h-[28px]">
                    {notice.isPinned && (
                      <div className="bg-white/10 p-1.5 rounded-md shrink-0 text-white" title="고정 공지">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M5.25 7.5A6.75 6.75 0 0 1 12 .75h.008a6.75 6.75 0 0 1 6.742 6.75v3.19l1.644 4.931a.75.75 0 0 1-.712.987h-6.932v5.642a.75.75 0 0 1-1.5 0v-5.642H4.25a.75.75 0 0 1-.712-.987l1.644-4.931V7.5Z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-md shrink-0 ${tagMeta.className}`}>{tagMeta.label}</span>
                    <h3 className="text-lg font-bold text-white transition-colors">{notice.title}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    {isAdmin && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleEdit(notice._id, e)} className="text-xs font-bold text-gray-500 hover:text-white bg-white/5 px-2 py-1 rounded">수정</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(notice._id); }} className="text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-2 py-1 rounded">삭제</button>
                      </div>
                    )}
                    <span className="text-sm text-gray-500">{formatDate(notice.createdAt)}</span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{stripMarkdown(notice.content)}</p>
              </div>
            );
          })}
        </div>
      )}

      {selectedNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-[2rem] w-full max-w-2xl h-[80vh] flex flex-col relative shadow-2xl overflow-hidden [&::-webkit-scrollbar]:hidden">
            <div className="absolute top-6 right-6 flex gap-2 z-10">
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
    </main>
  );
}