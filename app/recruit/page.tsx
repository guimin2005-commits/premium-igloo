"use client";
import React, { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];

interface RecruitPost { _id: string; title: string; author: string; category: string; recruitSubCategory: string; createdAt: string; recruitRole: string; recruitPeriod: string; recruitTasks: string; recruitQual: string; recruitExtra?: string; }

export default function RecruitPage() {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && session?.user?.name && ADMIN_USERS.includes(session.user.name);
  
  const [viewMode, setViewMode] = useState<"user" | "admin">("user");
  const [posts, setPosts] = useState<RecruitPost[]>([]);
 const [isLoading, setIsLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<string>("all");
  const [isLoginReqModalOpen, setIsLoginReqModalOpen] = useState(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [applyDeleteConfirmId, setApplyDeleteConfirmId] = useState<string | null>(null);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });
  const [formData, setFormData] = useState({ discordTag: "", age: "", intro: "", experience: "" });

  const [applies, setApplies] = useState<any[]>([]);
 const [isLoadingApplies, setIsLoadingApplies] = useState(false);

  useEffect(() => { setIsMounted(true); if (session?.user?.name) setFormData(prev => ({ ...prev, discordTag: String(session.user.name) })); }, [session]);

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
      if (res.ok) { setPopupConfig({ isOpen: true, message: "삭제되었습니다.", isError: false }); fetchRecruitPosts(); }
    } catch { setPopupConfig({ isOpen: true, message: "오류 발생", isError: true }); }
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

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name as keyof typeof formData]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirm("제출한 지원서는 추후 수정하지 못합니다. 정말 제출하시겠습니까?")) {
      return;
    }
    try {
      const response = await fetch("/api/recruit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...formData, position: selectedPosition }) });
      const result = await response.json();
      if (result.success) {
        setPopupConfig({ isOpen: true, message: `${selectedPosition} 지원이 완료되었습니다.`, isError: false });
        setFormData({ discordTag: session?.user?.name || "", age: "", intro: "", experience: "" });
        setIsApplyModalOpen(false);
      }
    } catch { setPopupConfig({ isOpen: true, message: "접수 오류", isError: true }); }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    const res = await fetch("/api/user/applies", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: newStatus }) });
    if (res.ok) fetchApplies();
  };

  const getRecruitStatus = (post: RecruitPost) => {
    if (!post.recruitPeriod) return "ongoing";
    const parts = post.recruitPeriod.split("~");
    if (parts.length === 2) {
      const endDateStr = parts[1].trim();
      if (endDateStr === "상시") return "ongoing";
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstDate.toISOString().split('T')[0].replace(/-/g, ".");
      if (endDateStr < todayStr) return "ended";
    }
    return "ongoing";
  };

  const filteredPositions = posts.filter(p => {
    const status = getRecruitStatus(p);
    if (activeTab === "ended") return status === "ended";
    if (activeTab === "all") return true;
    if (status === "ended") return false;
    return (p.recruitSubCategory || "staff") === activeTab;
  });

  const sortedPositions = [...filteredPositions].sort((a, b) => {
    const isAEnded = getRecruitStatus(a) === "ended" ? 1 : 0;
    const isBEnded = getRecruitStatus(b) === "ended" ? 1 : 0;
    return isAEnded - isBEnded;
  });

  const handleApplyClick = (postTitle: string) => {
    if (status === "unauthenticated" || !session) {
      setIsLoginReqModalOpen(true);
      return;
    }
    setSelectedPosition(postTitle);
    setIsApplyModalOpen(true);
  };

  if (!isMounted) return null;

  if (viewMode === "admin" && isAdmin) {
    return (
      <main key={viewMode} className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="mb-10 flex justify-between items-end border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-black text-white mb-3">지원자 대시보드</h1>
            <p className="text-gray-400 text-sm">유저들의 모든 구인 지원 내역을 관리합니다.</p>
          </div>
          <button onClick={() => setViewMode("user")} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">← 구인 페이지</button>
        </div>
        {isLoadingApplies ? <div className="text-center py-20 text-gray-500 font-bold">로딩 중...</div> : applies.length === 0 ? <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">지원 내역이 없습니다.</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {applies.map((app) => (
              <div key={app._id} className="p-8 rounded-3xl bg-[#121212] border border-white/5 flex flex-col transition-all hover:border-white/10 shadow-lg">
                <div className="flex justify-between items-center border-b border-white/10 pb-6 mb-6">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-black tracking-wider px-2.5 py-1 bg-blue-500/10 text-blue-400 rounded-md">{app.position}</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${app.status === '합격' ? 'bg-green-500/10 text-green-400' : app.status === '취소' || app.status === '취소/반려' || app.status === '불합격' ? 'bg-red-500/10 text-red-400' : 'bg-gray-500/10 text-gray-400'}`}>{app.status || "심사 중"}</span>
                  </div>
                  <span className="text-xs text-gray-500 font-medium">{new Date(app.createdAt).toLocaleDateString()}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-6 px-1">
                  <div>
                    <span className="block text-[11px] font-bold text-gray-500 mb-1">지원자</span>
                    <span className="text-sm font-bold text-white">{app.discordTag}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] font-bold text-gray-500 mb-1">나이</span>
                    <span className="text-sm font-bold text-gray-300">{app.age}세</span>
                  </div>
                </div>

                <div className="flex flex-col gap-4 mt-2">
                  <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5">
                    <span className="text-[11px] font-bold text-[#e91e3f] block mb-2.5">자기소개 및 포부</span>
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{app.intro}</p>
                  </div>
                  {app.experience && (
                    <div className="bg-[#1a1a1a] p-5 rounded-2xl border border-white/5">
                      <span className="text-[11px] font-bold text-blue-400 block mb-2.5">관련 경험</span>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{app.experience}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 mt-8 pt-8 border-t border-white/10">
                  <button onClick={() => handleUpdateStatus(app._id, "합격")} className="flex-1 py-3.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-bold rounded-xl transition-colors">합격 처리</button>
                  <button onClick={() => handleUpdateStatus(app._id, "불합격")} className="flex-1 py-3.5 bg-gray-500/10 hover:bg-gray-500/20 text-gray-400 text-xs font-bold rounded-xl transition-colors">불합격 처리</button>
                  <button onClick={() => setApplyDeleteConfirmId(app._id)} className="flex-1 py-3.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-xl transition-colors">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {applyDeleteConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-3">지원 내역 삭제</h2>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">해당 지원 내역을 완전히 삭제하시겠습니까?<br/>이 작업은 되돌릴 수 없습니다.</p>
              <div className="flex gap-3">
                <button onClick={() => setApplyDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl font-bold hover:bg-[#333] transition-colors">취소</button>
                <button onClick={executeApplyDelete} className="flex-1 py-3 bg-[#e91e3f] text-white rounded-xl font-bold hover:bg-[#d01634] transition-colors shadow-lg shadow-[#e91e3f]/20">삭제</button>
              </div>
            </div>
          </div>
        )}
      </main>
    )
  }

  return (
    <main key={viewMode} className="flex-1 w-full flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-24 md:pb-14 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10 flex justify-between items-end gap-6">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Join Our Team</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">구</span><span className="lux-shimmer">인</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">고급 이글루의 가치를 높여줄 역량 있는 분을 모십니다.</p>
          </Reveal>
          {isAdmin && (
            <div className="flex gap-3 shrink-0">
              <button onClick={() => setViewMode("admin")} className="px-5 py-2.5 bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 hover:bg-[#e91e3f]/20 text-sm font-bold rounded-full transition-colors">지원자 관리</button>
              <button onClick={() => router.push("/write?category=구인")} className="px-5 py-2.5 bg-white text-black font-bold text-sm rounded-full hover:bg-gray-200 transition-colors">구인글 작성</button>
            </div>
          )}
        </div>
      </section>

      {/* ── 탭 (알약 스타일 · 스티키) ── */}
      <div className="sticky top-16 z-30 w-full px-6 py-3 bg-[#090909]/85 backdrop-blur-xl border-y border-white/5">
        <div className="max-w-5xl mx-auto flex gap-1.5 overflow-x-auto whitespace-nowrap">
          {[{ id: "all", label: "전체보기" }, { id: "staff", label: "스태프 모집" }, { id: "sup", label: "서포터즈 모집" }, { id: "ended", label: "마감" }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 py-2.5 text-xs md:text-sm font-bold rounded-full shrink-0 outline-none focus:outline-none transition-all duration-300 ${
              activeTab === tab.id
                ? "bg-[#e91e3f] text-white shadow-[0_4px_20px_rgba(233,30,63,0.35)]"
                : "bg-white/[0.04] text-gray-500 hover:text-white hover:bg-white/[0.08] border border-white/5"
            }`}>{tab.label}</button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-5xl mx-auto px-6 py-10 flex-1 flex flex-col">

      {isLoading ? <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div> : sortedPositions.length === 0 ? <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 구인글이 없습니다.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-16">
          {sortedPositions.map((post, listIdx) => {
            const isEnded = getRecruitStatus(post) === "ended";
            return (
              <Reveal key={post._id} delay={Math.min(listIdx, 5) * 90} className="h-full">
              <div className="p-6 md:p-7 rounded-2xl bg-[#111111]/95 border border-white/5 hover:border-[#e91e3f]/40 hover:bg-[#141414] transition-all duration-300 flex flex-col justify-between group h-full">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black tracking-widest text-[#e91e3f] bg-[#e91e3f]/10 px-2.5 py-1 rounded-md">{post.recruitRole?.toUpperCase()}</span>
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => router.push(`/write?id=${post._id}`)} className="text-xs font-bold text-gray-500 hover:text-white bg-white/5 px-2 py-1 rounded">수정</button>
                          <button onClick={() => setDeleteConfirmId(post._id)} className="text-xs font-bold text-red-500/60 hover:text-red-500 bg-white/5 px-2 py-1 rounded">삭제</button>
                        </div>
                      )}
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${isEnded ? 'bg-gray-500/10 text-gray-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{isEnded ? "마감" : "모집 중"}</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{post.title}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 font-medium">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>
                    {post.recruitPeriod || "미지정"}
                  </div>
                  <div className="space-y-4 mb-8">
                    <div><h4 className="text-xs font-bold text-gray-500 mb-1.5">지원 자격</h4><div className="text-sm text-gray-300 whitespace-pre-wrap pl-1">{post.recruitQual}</div></div>
                    <div><h4 className="text-xs font-bold text-gray-500 mb-1.5">주요 업무</h4><div className="text-sm text-gray-400 whitespace-pre-wrap pl-1">{post.recruitTasks}</div></div>
                    {post.recruitExtra && post.recruitExtra.trim() !== "" && (
                      <div><h4 className="text-xs font-bold text-[#e91e3f] mb-1.5">우대 사항 및 추가 안내</h4><div className="text-sm text-gray-400 whitespace-pre-wrap pl-1">{post.recruitExtra}</div></div>
                    )}
                  </div>
                </div>
                <button disabled={isEnded} onClick={() => handleApplyClick(post.title)} className={`w-full py-3 rounded-xl font-bold text-sm transition-all ${isEnded ? "bg-white/5 text-gray-500 cursor-not-allowed" : "bg-[#e91e3f] text-white hover:bg-[#d01634] shadow-lg shadow-[#e91e3f]/20"}`}>{isEnded ? "마감됨" : "지원하기"}</button>
              </div>
              </Reveal>
            );
          })}
        </div>
      )}

      {isLoginReqModalOpen && (
         <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl relative">
            <div className="w-16 h-16 bg-[#5865F2]/10 rounded-full flex items-center justify-center mb-6 mx-auto">
              <svg className="w-8 h-8 text-[#5865F2]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">로그인 필요</h2>
            <p className="text-sm text-gray-400 mb-8 whitespace-pre-line">스태프 지원을 위해서는<br/>디스코드 로그인이 필요합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLoginReqModalOpen(false)} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#2a2a2a] hover:bg-[#333] text-white transition-colors">취소</button>
              <button onClick={() => signIn("discord")} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white transition-colors">Discord 로그인</button>
            </div>
          </div>
        </div>
      )}

      {isApplyModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-[#e91e3f]/30 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
            <button onClick={() => setIsApplyModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full z-10 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="p-8 pb-4 border-b border-white/5">
              <span className="text-xs font-bold text-[#e91e3f]">APPLICATION FORM</span>
              <h2 className="text-2xl font-bold text-white mt-1">{selectedPosition} 지원서</h2>
            </div>
            
            <div className="p-8 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2">디스코드 태그</label>
                    <input type="text" name="discordTag" required readOnly value={formData.discordTag} className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-gray-500 text-sm cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2">나이 (만 나이)</label>
                    <input type="number" min="19" name="age" required value={formData.age} onChange={handleChange} placeholder="숫자만 입력" className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white focus:border-[#e91e3f] text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2">자기소개 및 지원 포부</label>
                  <textarea name="intro" required rows={4} value={formData.intro} onChange={handleChange} placeholder="자세히 작성해 주실수록 좋습니다." className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm focus:border-[#e91e3f] resize-none" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2">관련 경험 (선택)</label>
                  <textarea name="experience" rows={3} value={formData.experience} onChange={handleChange} placeholder="과거 스태프 경험이 있다면 적어주세요." className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm focus:border-[#e91e3f] resize-none" />
                </div>
                
                <div className="pt-4">
                  <button type="submit" className="w-full py-4 bg-[#e91e3f] text-white font-bold rounded-xl shadow-lg shadow-[#e91e3f]/20 hover:bg-[#d01634] transition-all">제출하기</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 animate-in fade-in"><div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl"><h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2><p className="text-sm text-gray-400 mb-8">해당 구인글을 삭제하시겠습니까?</p><div className="flex gap-3"><button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">취소</button><button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white font-bold rounded-xl transition-colors">삭제</button></div></div></div>}
      {popupConfig.isOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"><div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center"><div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popupConfig.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>{popupConfig.isError ? <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}</div><h2 className="text-xl font-bold text-white mb-3">{popupConfig.isError ? "오류" : "완료"}</h2><p className="text-sm text-gray-400 mb-8 whitespace-pre-line leading-relaxed">{popupConfig.message}</p><button onClick={() => setPopupConfig({ ...popupConfig, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-all">확인</button></div></div>}
      </div>
    </main>
  );
}