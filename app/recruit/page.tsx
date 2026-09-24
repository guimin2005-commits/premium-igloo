"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ADMIN_USERS } from "@/lib/admins";

// 📌 구인 목록 — 화이트 & 블랙. 제목 줄 · 밑줄 탭 · 헤어라인 줄 목록.
//    지원하는 것도 페이지(이동 규칙 1): 줄을 누르면 /recruit/[id] 로 간다. 목록 안 펼침·지원 모달은 없다.
//    ?admin=1 은 지원자 대시보드 — 구조는 그대로 두고 색만 화이트 & 블랙.

interface RecruitPost {
  _id: string;
  title: string;
  author: string;
  category: string;
  recruitSubCategory: string;
  createdAt: string;
  recruitRole: string;
  recruitPeriod: string;
  recruitTasks: string;
  recruitQual: string;
  recruitExtra?: string;
}

const TABS = [
  { id: "all", label: "전체" },
  { id: "staff", label: "스태프" },
  { id: "sup", label: "서포터즈" },
  { id: "ended", label: "마감" },
];

// 줄 아래 한 줄 미리보기용 — 서식 기호를 걷어낸다
const stripMarkdown = (text: string) => {
  if (!text) return "";
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\{([^}]+)\}/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1")
    .replace(/^[\s*·-]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
};

const getRecruitStatus = (post: RecruitPost) => {
  if (!post.recruitPeriod) return "ongoing";
  const parts = post.recruitPeriod.split("~");
  if (parts.length === 2) {
    const endDateStr = parts[1].trim();
    if (endDateStr === "상시") return "ongoing";
    const now = new Date();
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const todayStr = kstDate.toISOString().split("T")[0].replace(/-/g, ".");
    if (endDateStr < todayStr) return "ended";
  }
  return "ongoing";
};

export default function RecruitPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [viewMode, setViewMode] = useState<"user" | "admin">("user");
  const [posts, setPosts] = useState<RecruitPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<string>("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [applyDeleteConfirmId, setApplyDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [applies, setApplies] = useState<any[]>([]);
  const [isLoadingApplies, setIsLoadingApplies] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  const fetchRecruitPosts = async () => {
    try {
      const res = await fetch("/api/posts?category=구인");
      if (res.ok) setPosts((await res.json()).data);
    } catch { console.error("데이터 로드 실패"); } finally { setIsLoading(false); }
  };

  const fetchApplies = async () => {
    setIsLoadingApplies(true);
    try {
      const res = await fetch("/api/user/applies?admin=true", { cache: "no-store" });
      if (res.ok) setApplies((await res.json()).data);
    } catch (e) { console.error("지원자 로드 실패"); } finally { setIsLoadingApplies(false); }
  };

  useEffect(() => { fetchRecruitPosts(); }, []);
  useEffect(() => { if (viewMode === "admin" && isAdmin) fetchApplies(); }, [viewMode, isAdmin]);
  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get("admin") === "1") {
      setViewMode("admin");
    }
  }, [isAdmin]);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) { showToast("구인글을 삭제했습니다"); fetchRecruitPosts(); }
      else showToast("삭제하지 못했습니다");
    } catch { showToast("오류가 발생했습니다"); }
    finally { setDeleteConfirmId(null); }
  };

  const executeApplyDelete = async () => {
    if (!applyDeleteConfirmId) return;
    try {
      const res = await fetch(`/api/user/applies?id=${applyDeleteConfirmId}`, { method: "DELETE" });
      if (res.ok) fetchApplies();
    } catch (e) { console.error(e); }
    finally { setApplyDeleteConfirmId(null); }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const res = await fetch("/api/user/applies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: newStatus }) });
    if (res.ok) fetchApplies();
  };

  const filteredPositions = posts.filter((p) => {
    const st = getRecruitStatus(p);
    if (activeTab === "ended") return st === "ended";
    if (activeTab === "all") return true;
    if (st === "ended") return false;
    return (p.recruitSubCategory || "staff") === activeTab;
  });

  const sortedPositions = [...filteredPositions].sort((a, b) => {
    const isAEnded = getRecruitStatus(a) === "ended" ? 1 : 0;
    const isBEnded = getRecruitStatus(b) === "ended" ? 1 : 0;
    return isAEnded - isBEnded;
  });

  const countOf = (tabId: string) => posts.filter((p) => {
    const st = getRecruitStatus(p);
    if (tabId === "ended") return st === "ended";
    if (tabId === "all") return true;
    if (st === "ended") return false;
    return (p.recruitSubCategory || "staff") === tabId;
  }).length;

  if (!isMounted) return null;

  /* ── 지원자 대시보드 ── */
  if (viewMode === "admin" && isAdmin) {
    return (
      <main key={viewMode} className="flex-1 w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 pb-24 md:pb-16 text-[#131313]">
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">지원자</h1>
          <button onClick={() => setViewMode("user")}
            className="h-9 px-4 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[12px] font-extrabold transition-colors shrink-0">구인으로</button>
        </div>

        <div className="border-b border-[#ededed] mb-1">
          <span className="inline-block py-3 text-[14px] font-extrabold text-[#131313] relative">
            전체
            <span className="ml-1.5 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{applies.length}</span>
            <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />
          </span>
        </div>

        {isLoadingApplies ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">불러오는 중...</p>
        ) : applies.length === 0 ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">지원 내역이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
            {applies.map((app) => {
              const st = app.status || "심사 중";
              const stCls = st === "합격" ? "text-[#131313]" : (st === "불합격" || st === "취소" || st === "취소/반려") ? "text-[#5a5a5a]" : "text-[#e91e3f]";
              return (
                <div key={app._id} className="border border-[#ededed] bg-white p-6 flex flex-col">
                  <div className="flex items-center gap-3 pb-4 border-b border-[#ededed]">
                    <span className="text-[11.5px] font-black tracking-[0.04em] text-[#131313]">{String(app.position || "").toUpperCase()}</span>
                    <span className={`text-[11px] font-black ${stCls}`}>{st}</span>
                    <span className="ml-auto text-[11px] font-bold text-[#a3a3a3] tabular-nums">{new Date(app.createdAt).toLocaleDateString("ko-KR")}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-5">
                    <div>
                      <span className="block text-[11px] font-black text-[#8a8a8a] mb-1.5">지원자</span>
                      <span className="text-[14px] font-extrabold text-[#131313]">{app.discordTag}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-black text-[#8a8a8a] mb-1.5">나이</span>
                      <span className="text-[14px] font-extrabold text-[#5a5a5a] tabular-nums">{app.age}세</span>
                    </div>
                  </div>

                  <div className="space-y-5 pb-6">
                    <div>
                      <span className="block text-[11px] font-black text-[#8a8a8a] mb-2">자기소개 및 포부</span>
                      <p className="text-[14px] text-[#5a5a5a] whitespace-pre-wrap leading-[1.8] break-keep">{app.intro}</p>
                    </div>
                    {app.experience && (
                      <div>
                        <span className="block text-[11px] font-black text-[#8a8a8a] mb-2">관련 경험</span>
                        <p className="text-[14px] text-[#5a5a5a] whitespace-pre-wrap leading-[1.8] break-keep">{app.experience}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2 pt-5 border-t border-[#ededed]">
                    <button onClick={() => handleUpdateStatus(app._id, "합격")} className="flex-1 h-10 bg-[#131313] hover:bg-[#3a3a3a] text-white text-[12px] font-extrabold transition-colors">합격</button>
                    <button onClick={() => handleUpdateStatus(app._id, "불합격")} className="flex-1 h-10 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[12px] font-extrabold transition-colors">불합격</button>
                    <button onClick={() => setApplyDeleteConfirmId(app._id)} className="flex-1 h-10 border border-[#ededed] text-[#e91e3f] hover:bg-[#e91e3f] hover:text-white hover:border-[#e91e3f] text-[12px] font-extrabold transition-colors">삭제</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {applyDeleteConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setApplyDeleteConfirmId(null)}>
            <div className="bg-white rounded-2xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-base font-black text-[#131313] mb-2">지원 내역을 삭제할까요?</h2>
              <p className="text-[12px] text-[#8a8a8a] mb-6">되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button onClick={() => setApplyDeleteConfirmId(null)} className="flex-1 py-3 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[13px] font-bold transition-colors">취소</button>
                <button onClick={executeApplyDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">삭제</button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  /* ── 구인 목록 ── */
  return (
    <main key={viewMode} className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 pb-24 md:pb-16 flex-1">
        {/* 제목 줄 */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">구인</h1>
          {isAdmin ? (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode("admin")}
                className="h-9 px-4 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[12px] font-extrabold transition-colors">지원자</button>
              <button onClick={() => router.push("/write?category=구인")}
                className="h-9 px-4 bg-[#131313] hover:bg-[#3a3a3a] text-white text-[12px] font-extrabold transition-colors">구인글 작성</button>
            </div>
          ) : (
            <span className="text-[12px] font-bold text-[#a3a3a3] tabular-nums shrink-0">{posts.length}</span>
          )}
        </div>

        {/* 밑줄 탭 */}
        <div className="flex items-center border-b border-[#ededed] mb-1">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`relative py-3 mr-6 md:mr-7 text-[14px] font-extrabold transition-colors outline-none ${on ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                {t.label}
                <span className="ml-1.5 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{countOf(t.id)}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
              </button>
            );
          })}
        </div>

        {/* 줄 목록 */}
        {isLoading ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">불러오는 중...</p>
        ) : sortedPositions.length === 0 ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">등록된 구인글이 없습니다.</p>
        ) : (
          <div>
            {sortedPositions.map((post) => {
              const isEnded = getRecruitStatus(post) === "ended";
              const role = (post.recruitRole || "").toUpperCase();
              const period = post.recruitPeriod || "미지정";
              const tasks = stripMarkdown(post.recruitTasks);
              return (
                <div key={post._id} onClick={() => router.push(`/recruit/${post._id}`)}
                  className="group flex items-start md:items-center gap-3 md:gap-4 py-4 border-b border-[#ededed] cursor-pointer">
                  {/* 역할 (데스크톱) */}
                  <span className={`hidden md:block w-[112px] shrink-0 text-[11.5px] font-bold tracking-[0.04em] ${isEnded ? "text-[#a3a3a3]" : "text-[#131313]"}`}>{role}</span>

                  <span className="flex-1 min-w-0">
                    {/* 역할 · 상태 (모바일) */}
                    <span className="md:hidden flex items-center gap-2 mb-1">
                      <span className={`text-[10.5px] font-bold tracking-[0.04em] ${isEnded ? "text-[#a3a3a3]" : "text-[#131313]"}`}>{role}</span>
                      <span className={`text-[10.5px] font-black ${isEnded ? "text-[#8a8a8a]" : "text-[#e91e3f]"}`}>{isEnded ? "마감" : "모집 중"}</span>
                    </span>
                    <span className={`block text-[15px] font-extrabold leading-snug truncate transition-colors ${isEnded ? "text-[#5a5a5a]" : "group-hover:text-[#e91e3f]"}`}>{post.title}</span>
                    {tasks && <span className="hidden md:block mt-1 text-[12px] text-[#8a8a8a] truncate">{tasks}</span>}
                    {/* 기간 · 관리 (모바일) */}
                    <span className="md:hidden flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-[#8a8a8a] tabular-nums">{period}</span>
                      {isAdmin && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); router.push(`/write?id=${post._id}`); }} className="text-[11px] font-bold text-[#8a8a8a]">수정</button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(post._id); }} className="text-[11px] font-bold text-[#e91e3f]">삭제</button>
                        </>
                      )}
                    </span>
                  </span>

                  {/* 기간 (데스크톱) */}
                  <span className="hidden md:block shrink-0 text-[12px] text-[#8a8a8a] tabular-nums text-right">{period}</span>

                  <span className="flex items-center gap-3 shrink-0">
                    {isAdmin && (
                      <span className="hidden md:flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/write?id=${post._id}`); }} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(post._id); }} className="text-[11px] font-bold text-[#e91e3f] hover:text-[#d01634] transition-colors">삭제</button>
                      </span>
                    )}
                    <span className={`hidden md:block w-[54px] text-right text-[11px] font-black whitespace-nowrap ${isEnded ? "text-[#8a8a8a]" : "text-[#e91e3f]"}`}>{isEnded ? "마감" : "모집 중"}</span>
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
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-7 text-center border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-black text-[#131313] mb-2">구인글을 삭제할까요?</h2>
            <p className="text-[12px] text-[#8a8a8a] mb-6">되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#5a5a5a] text-[13px] font-bold transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
          <div className="px-5 py-3 bg-[#131313] text-white text-xs font-bold shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]">{toast}</div>
        </div>
      )}
    </main>
  );
}
