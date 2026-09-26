"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ADMIN_USERS } from "@/lib/admins";
import { ICON_PATHS } from "../components/Icons";

// 📌 공지사항 목록 — 화이트 & 블랙. 제목 · 밑줄 탭 · 검색 · 줄 목록(날짜 · 태그 · 제목 · ›).
//    읽는 것은 페이지(이동 규칙 1): 줄을 누르면 /notice/[id] 로 간다. 목록 위 모달·본문 미리보기는 없다.

// 압정(고정) — ICON_PATHS.pin 은 지도 위치 핀이라 고정 표시로는 못 쓴다
const PUSHPIN = "M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z";

// 공지 중요 여부 (구버전 '필독'/isImportant 호환)
const isImportantNotice = (n: any) => n?.noticeTag === "중요" || n?.noticeTag === "필독" || n?.isImportant;
const tagOf = (n: any) =>
  isImportantNotice(n) ? { label: "중요", cls: "text-[#e91e3f]" }
  : n?.noticeTag === "업데이트" ? { label: "업데이트", cls: "text-[#131313]" }
  : { label: "일반", cls: "text-[#8a8a8a]" };

const TABS = [
  { id: "all", label: "전체" },
  { id: "important", label: "중요" },
  { id: "update", label: "업데이트" },
];

const pad = (n: number) => String(n).padStart(2, "0");
// 올해 글은 MM.DD, 지난해 글은 YYYY.MM.DD
const fmtDate = (v: string) => {
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const md = `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
  return d.getFullYear() === new Date().getFullYear() ? md : `${d.getFullYear()}.${md}`;
};
// 예약 발행 글은 공개 시각이 게시일이다 (상세 페이지와 같은 기준)
const shownAt = (n: any) => n?.publishAt || n?.createdAt;

export default function NoticeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [notices, setNotices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  // 읽은 공지 (N 배지용)
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("readNotices") || "[]");
      if (Array.isArray(stored)) setReadIds(new Set(stored));
    } catch {}
  }, []);
  const markAsRead = (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("readNotices", JSON.stringify(Array.from(next).slice(-200))); } catch {}
      return next;
    });
  };
  const isNewNotice = (n: any) => !readIds.has(n._id) && Date.now() - new Date(shownAt(n)).getTime() < 7 * 24 * 60 * 60 * 1000;

  const fetchNotices = async (admin = false) => {
    try {
      const res = await fetch(`/api/posts?category=공지사항${admin ? "&all=1" : ""}`, { cache: "no-store" });
      if (res.ok) setNotices((await res.json()).data);
    } catch {} finally { setIsLoading(false); }
  };
  useEffect(() => { if (status !== "loading") fetchNotices(!!isAdmin); }, [status, isAdmin]);

  // 옛 주소(/notice?id=) 는 글 페이지로
  useEffect(() => {
    const noticeId = searchParams.get("id");
    if (noticeId && notices.length > 0 && notices.some((n) => n._id === noticeId)) router.replace(`/notice/${noticeId}`);
  }, [notices, searchParams, router]);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) { setToast("공지사항을 삭제했습니다"); setTimeout(() => setToast(""), 1800); fetchNotices(!!isAdmin); }
    } catch {} finally { setDeleteConfirmId(null); }
  };

  const sorted = [...notices].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(shownAt(b)).getTime() - new Date(shownAt(a)).getTime();
  });
  const tabFiltered =
    activeTab === "important" ? sorted.filter((n) => isImportantNotice(n))
    : activeTab === "update" ? sorted.filter((n) => n.noticeTag === "업데이트")
    : sorted;
  const q = searchQuery.trim().toLowerCase();
  const filtered = q ? tabFiltered.filter((n) => `${n.title || ""} ${n.content || ""}`.toLowerCase().includes(q)) : tabFiltered;

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 pb-24 flex-1">
        {/* 제목 줄 */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">공지사항</h1>
          {isAdmin && (
            <button onClick={() => router.push("/write?category=공지사항")}
              className="h-9 px-4 rounded-full bg-[#131313] hover:bg-black text-white text-[12px] font-extrabold transition-colors">글쓰기</button>
          )}
        </div>

        {/* 밑줄 탭 + 검색 */}
        <div className="flex items-center border-b border-[#ededed] mb-1">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`relative py-3 mr-6 md:mr-7 text-[14px] font-extrabold transition-colors outline-none ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                {t.label}
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
              </button>
            );
          })}
          <div className="ml-auto relative w-32 md:w-60 h-9 rounded-full border-[1.5px] border-[#131313] bg-white overflow-hidden">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="공지 검색"
              className="absolute inset-0 w-full h-full bg-transparent pl-4 pr-9 text-[12px] text-[#131313] outline-none placeholder:text-[#a3a3a3]" />
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-[#131313] pointer-events-none" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.search} />
            </svg>
          </div>
        </div>

        {/* 줄 목록 */}
        {isLoading ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">등록된 공지가 없습니다.</p>
        ) : (
          <div>
            {filtered.map((n) => {
              const tag = tagOf(n);
              return (
                <div key={n._id} onClick={() => { markAsRead(n._id); router.push(`/notice/${n._id}`); }}
                  className="group flex items-center gap-3 md:gap-4 py-4 border-b border-[#ededed] cursor-pointer">
                  <span className="w-[46px] md:w-[64px] shrink-0 text-[11.5px] text-[#8a8a8a] tabular-nums">{fmtDate(shownAt(n))}</span>
                  <span className={`hidden md:block w-14 shrink-0 text-[10.5px] font-black ${tag.cls}`}>{tag.label}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-2 text-[15px] font-extrabold leading-snug">
                    {/* 고정은 글자 대신 압정 하나 — 지도 핀(위치)과 헷갈리지 않게 면으로 채운 압정을 쓴다 */}
                    {n.isPinned && (
                      <svg className="shrink-0 w-[14px] h-[14px] text-[#131313]" viewBox="0 0 24 24" fill="currentColor" aria-label="고정">
                        <path d={PUSHPIN} />
                      </svg>
                    )}
                    <span className={`md:hidden shrink-0 text-[10.5px] font-black ${tag.cls}`}>{tag.label}</span>
                    <span className="truncate group-hover:text-[#e91e3f] transition-colors">{n.title}</span>
                    {isNewNotice(n) && <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-[#e91e3f] text-white text-[9px] font-black leading-none">N</span>}
                    {isAdmin && n.hidden && <span className="shrink-0 text-[10px] font-black text-[#131313]">숨김</span>}
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {isAdmin && (
                      <span className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/write?id=${n._id}`); }} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(n._id); }} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#d01634] transition-colors">삭제</button>
                      </span>
                    )}
                    <span className="text-[#a3a3a3] font-black">›</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 삭제 확인 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-black text-[#131313] mb-2">공지사항을 삭제할까요?</h2>
            <p className="text-[12px] text-[#8a8a8a] mb-6">되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 rounded-xl bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[13px] font-bold transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
          <div className="px-5 py-3 rounded-2xl bg-[#131313] text-white text-xs font-bold shadow-2xl">{toast}</div>
        </div>
      )}
    </main>
  );
}
