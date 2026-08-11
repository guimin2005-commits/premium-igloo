"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];

// 문의 유형 — 무엇을 고를지 한눈에 보이도록 짧은 설명을 함께 둔다
const TYPE_META = [
  { key: "일반", desc: "이용 방법·건의 등" },
  { key: "오류", desc: "사이트·봇이 이상해요" },
  { key: "신고", desc: "규칙 위반·분쟁" },
  { key: "환불 및 교환", desc: "구매한 상품 관련" },
];

const ORDER_TYPE_LABEL: Record<string, string> = { role: "역할", perk: "권한", physical: "기프트카드" };

const noteLabel = "block text-[12px] font-bold text-[#5b6472] mb-1.5";
const noteInput =
  "w-full bg-transparent border-0 border-b border-[#c9cdd6] focus:border-[#c0392f] outline-none px-0 py-2 text-[14px] text-[#1f2430] placeholder:text-[#a8b0bb] transition-colors";


export default function SupportPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [viewMode, setViewMode] = useState<"user" | "admin">("user");
  const [mainType, setMainType] = useState(""); // 고르기 전에는 아래 항목을 감춰둔다
  const [subType, setSubType] = useState("");
  const [errorDesc, setErrorDesc] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportType, setReportType] = useState("");
  const [productName, setProductName] = useState("");
  const [refundType, setRefundType] = useState("환불");
  const [content, setContent] = useState("");
  const [isEmailChecked, setIsEmailChecked] = useState(false);
  const [email, setEmail] = useState("");

  const [orders, setOrders] = useState<any[]>([]); // ARCTIC 구매 내역 (환불·교환 문의에서 고른다)
  const [isReportDropdownOpen, setIsReportDropdownOpen] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [allInquiries, setAllInquiries] = useState<any[]>([]);
  const [isLoadingAdmin, setIsLoadingAdmin] = useState(false);
  const [selectedAdminInquiry, setSelectedAdminInquiry] = useState<any>(null);
  const [answerText, setAnswerText] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [popupConfig, setPopupConfig] = useState({ isOpen: false, message: "", isError: false });

  const fetchAllInquiries = async () => {
    setIsLoadingAdmin(true);
    try {
      const res = await fetch("/api/inquiry", { cache: "no-store" });
      if (res.ok) setAllInquiries((await res.json()).data);
    } catch (e) { console.error(e); } finally { setIsLoadingAdmin(false); }
  };

  useEffect(() => {
    if (viewMode === "admin" && isAdmin) fetchAllInquiries();
  }, [viewMode, isAdmin]);

  useEffect(() => {
    if (isAdmin && new URLSearchParams(window.location.search).get("admin") === "1") {
      setViewMode("admin");
    }
  }, [isAdmin]);

  // 환불·교환 문의에서 고를 수 있도록 내 ARCTIC 구매 내역을 읽어둔다
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/shop/purchase", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setOrders(Array.isArray(d?.data) ? d.data.filter((o: any) => o.status !== "cancelled") : []))
      .catch(() => {});
  }, [status]);

  const executeDelete = async () => {
    if(!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/inquiry?id=${deleteConfirmId}`, { method: 'DELETE' });
      if(res.ok) {
        setAllInquiries(prev => prev.filter(inq => inq._id !== deleteConfirmId));
        setSelectedAdminInquiry(null);
        setPopupConfig({ isOpen: true, message: "문의가 삭제되었습니다.", isError: false });
      } else { setPopupConfig({ isOpen: true, message: "삭제 중 오류가 발생했습니다.", isError: true }); }
    } catch (e) { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
    finally { setDeleteConfirmId(null); }
  };

  const handleAnswerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/inquiry`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedAdminInquiry._id, answer: answerText })
      });
      if (res.ok) {
        setSelectedAdminInquiry(null);
        fetchAllInquiries();
        setPopupConfig({ isOpen: true, message: "답변이 저장되었습니다.", isError: false });
      } else { setPopupConfig({ isOpen: true, message: "답변 저장에 실패했습니다.", isError: true }); }
    } catch(e) { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
  };

  const handleSubmit = async () => {
    // 필수 필드 검증
    if (mainType === "일반" && !subType) {
      setPopupConfig({ isOpen: true, message: "문의 분류를 선택해주세요.", isError: true });
      return;
    }
    if (mainType === "오류" && !errorDesc.trim()) {
      setPopupConfig({ isOpen: true, message: "발생 오류를 입력해주세요.", isError: true });
      return;
    }
    if (mainType === "신고" && (!reportDate.trim() || !reportType)) {
      setPopupConfig({ isOpen: true, message: "발생 일시와 신고 유형을 입력해주세요.", isError: true });
      return;
    }
    if (mainType === "환불 및 교환" && (!productName.trim() || !refundType)) {
      setPopupConfig({ isOpen: true, message: "상품명과 유형을 선택해주세요.", isError: true });
      return;
    }
    if (!content.trim()) {
      setPopupConfig({ isOpen: true, message: "상세 내용을 입력해주세요.", isError: true });
      return;
    }

    const inquiryData = { user: session?.user?.name, mainType, subType, errorDesc, reportDate, reportType, productName, refundType, content, email: "미제공" };
    try {
      const res = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inquiryData) });
      if (res.ok) setIsSubmitted(true);
      else setPopupConfig({ isOpen: true, message: "문의 접수에 실패했습니다.", isError: true });
    } catch { setPopupConfig({ isOpen: true, message: "서버와 통신하는 중 문제가 발생했습니다.", isError: true }); }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;

  if (status === "unauthenticated" || !session) {
    return (
      <main className="w-full max-w-md mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center animate-in fade-in duration-500">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">1:1 문의 서비스를 이용하시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">
          Discord 로그인
        </button>
      </main>
    );
  }

  if (viewMode === "admin" && isAdmin) {
    return (
      <main key={viewMode} className="flex-1 w-full max-w-6xl mx-auto px-6 py-16 animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="mb-8 md:mb-10 border-b border-white/10 pb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-black text-white mb-2 md:mb-3">1:1 문의 관리</h1>
            <p className="text-gray-400 text-xs md:text-sm break-keep">유저들의 모든 문의 내역을 확인하고 답변합니다.</p>
          </div>
          <button onClick={() => setViewMode("user")} className="shrink-0 self-start sm:self-auto px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">
            ← 사용자 화면
          </button>
        </div>

        {isLoadingAdmin ? <div className="text-center py-20 text-gray-500 font-bold">불러오는 중...</div> : allInquiries.length === 0 ? (
          <div className="text-center py-20 text-gray-600 bg-white/[0.02] rounded-3xl border border-white/5">등록된 문의 내역이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {allInquiries.map(inq => (
              <div key={inq._id} onClick={() => { setSelectedAdminInquiry(inq); setAnswerText(inq.answer || ""); }} className="bg-[#121212] border border-white/5 rounded-2xl p-6 cursor-pointer hover:border-[#e91e3f]/40 transition-all flex flex-col justify-between min-h-[160px] group">
                <div>
                  <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-3">
                    <span className={`text-[10px] font-black px-2 py-1 rounded-md ${inq.status === '답변 완료' ? 'bg-blue-500/10 text-blue-400' : 'bg-[#e91e3f]/10 text-[#e91e3f]'}`}>{inq.status}</span>
                    <span className="text-xs text-gray-500">{new Date(inq.createdAt).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-base font-bold text-white mb-2 line-clamp-1 group-hover:text-[#e91e3f] transition-colors">{inq.title}</h3>
                  <span className="text-[11px] text-gray-500 font-medium">작성자 : {inq.user}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedAdminInquiry && (
          <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm md:p-4 animate-in fade-in" onClick={() => setSelectedAdminInquiry(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-[#111111] border border-white/10 rounded-t-2xl md:rounded-2xl w-full max-w-5xl max-h-[92dvh] md:max-h-none md:h-[88vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200">
              {/* 문서 헤더 바 */}
              <div className="flex items-center gap-3 md:gap-4 px-4 md:px-6 py-3.5 border-b border-white/8 bg-white/[0.015] shrink-0">
                <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded ${selectedAdminInquiry.status === '답변 완료' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/25' : 'bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/25'}`}>{selectedAdminInquiry.status}</span>
                <h2 className="text-sm md:text-base font-bold text-white leading-tight truncate flex-1">{selectedAdminInquiry.title}</h2>
                <button onClick={() => setSelectedAdminInquiry(null)} className="shrink-0 p-1.5 -mr-1 text-gray-500 hover:text-white rounded-md hover:bg-white/5 transition-colors outline-none">
                  <svg className="w-5 h-5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              {/* 본문 — 모바일: 세로 스택(전체 스크롤) / 데스크톱: 좌우 2분할(각각 스크롤) */}
              <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-2 overflow-y-auto md:overflow-hidden [&::-webkit-scrollbar]:hidden">
                {/* ── 좌: 문의 내용 ── */}
                <div className="flex flex-col shrink-0 md:shrink md:min-h-0 md:border-r border-white/8 border-b md:border-b-0">
                  <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-white/5 shrink-0 bg-white/[0.01]">
                    <span className="w-1 h-3.5 bg-gray-500 rounded-full"></span>
                    <span className="text-[11px] font-black tracking-[0.2em] text-gray-400 uppercase">문의 내용</span>
                  </div>
                  <div className="md:overflow-y-auto md:flex-1 p-4 md:p-6 [&::-webkit-scrollbar]:hidden">
                    <div className="rounded-lg border border-white/8 bg-white/[0.02] divide-y divide-white/[0.06] mb-5 text-xs">
                      <div className="flex items-center justify-between px-3.5 md:px-4 py-2.5 gap-3"><span className="text-gray-500 font-bold shrink-0">작성자</span><span className="text-gray-300 font-bold truncate text-right">{selectedAdminInquiry.user}</span></div>
                      <div className="flex items-center justify-between px-3.5 md:px-4 py-2.5 gap-3"><span className="text-gray-500 font-bold shrink-0">이메일</span><span className="text-gray-300 font-bold truncate text-right">{selectedAdminInquiry.email || "—"}</span></div>
                      <div className="flex items-center justify-between px-3.5 md:px-4 py-2.5 gap-3"><span className="text-gray-500 font-bold shrink-0">분류</span><span className="text-gray-300 font-bold text-right break-keep">{selectedAdminInquiry.mainType}{selectedAdminInquiry.subType && ` › ${selectedAdminInquiry.subType}`}</span></div>
                      <div className="flex items-center justify-between px-3.5 md:px-4 py-2.5 gap-3"><span className="text-gray-500 font-bold shrink-0">접수일시</span><span className="text-gray-300 font-bold tabular-nums text-right">{new Date(selectedAdminInquiry.createdAt).toLocaleString("ko-KR")}</span></div>
                    </div>
                    <div className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed break-keep">{selectedAdminInquiry.content}</div>
                  </div>
                </div>

                {/* ── 우: 답변 작성 ── */}
                <div className="flex flex-col shrink-0 md:shrink md:min-h-0">
                  <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-white/5 shrink-0 bg-white/[0.01]">
                    <span className="w-1 h-3.5 bg-[#e91e3f] rounded-full"></span>
                    <span className="text-[11px] font-black tracking-[0.2em] text-[#e91e3f] uppercase">답변 작성</span>
                  </div>
                  <form onSubmit={handleAnswerSubmit} className="flex flex-col md:flex-1 md:min-h-0 p-4 md:p-6 gap-3">
                    {/* 자주 쓰는 답변 템플릿 원클릭 삽입 */}
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      {[
                        { l: "접수 완료", t: "안녕하세요, 고급 이글루 운영진입니다.\n문의하신 내용이 정상적으로 접수되었습니다. 확인 후 순차적으로 처리해 드리겠습니다.\n감사합니다." },
                        { l: "버그 확인", t: "안녕하세요, 고급 이글루 운영진입니다.\n제보해 주신 오류를 확인하였으며, 현재 수정 작업을 진행하고 있습니다. 빠른 시일 내에 해결하겠습니다.\n소중한 제보 감사드립니다." },
                        { l: "환불 안내", t: "안녕하세요, 고급 이글루 운영진입니다.\n환불 및 교환은 기프트 상품을 제외한 모든 상품에 한해 구매 후 30분 이내 신청 시 처리가 가능합니다.\n요청하신 건은 확인 후 처리 결과를 안내드리겠습니다." },
                        { l: "처리 완료", t: "안녕하세요, 고급 이글루 운영진입니다.\n문의하신 사항이 정상적으로 처리 완료되었습니다. 이용에 불편을 드려 죄송하며, 추가 문의 사항이 있으시면 언제든지 1:1 문의를 이용해 주세요.\n감사합니다." },
                      ].map((tpl) => (
                        <button key={tpl.l} type="button" onClick={() => setAnswerText(tpl.t)} className="px-3 py-1.5 text-[11px] font-bold rounded-md border border-white/10 bg-white/[0.03] text-gray-400 hover:text-white hover:border-[#e91e3f]/40 transition-all">
                          {tpl.l}
                        </button>
                      ))}
                    </div>
                    {/* 모바일: 고정 높이 / 데스크톱: 남는 높이를 모두 채움. text-base로 iOS 자동 확대 방지 */}
                    <textarea value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="답변을 작성해주세요..." className="h-52 md:h-auto md:flex-1 md:min-h-0 w-full bg-[#0d0d0d] border border-white/10 rounded-lg p-4 text-base md:text-sm text-white focus:border-[#e91e3f] outline-none resize-none transition-colors leading-relaxed [&::-webkit-scrollbar]:hidden" />
                    <div className="flex gap-2.5 shrink-0">
                      <button type="submit" className="flex-1 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-lg transition-all outline-none">답변 저장하기</button>
                      <button type="button" onClick={() => setDeleteConfirmId(selectedAdminInquiry._id)} className="px-5 md:px-6 py-3.5 bg-[#1a1a1a] hover:bg-red-500/20 text-red-500 font-bold rounded-lg transition-all border border-red-500/20 outline-none shrink-0">삭제</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        )}

        {deleteConfirmId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4 animate-in fade-in">
            <div className="bg-[#121212] border border-red-500/30 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-3">삭제 확인</h2>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">이 문의를 삭제하시겠습니까?<br/>삭제 후에는 복구할 수 없습니다.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] text-white rounded-xl font-bold transition-colors hover:bg-[#333]">취소</button>
                <button onClick={executeDelete} className="flex-1 py-3 bg-red-500/80 hover:bg-red-500 text-white rounded-xl font-bold transition-colors">삭제</button>
              </div>
            </div>
          </div>
        )}

        {popupConfig.isOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popupConfig.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>
                {popupConfig.isError ? (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                ) : (
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                )}
              </div>
              <h2 className="text-xl font-bold text-white mb-3">{popupConfig.isError ? "오류" : "완료"}</h2>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed whitespace-pre-line">{popupConfig.message}</p>
              <button onClick={() => setPopupConfig({ ...popupConfig, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
            </div>
          </div>
        )}
      </main>
    );
  }

  if (isSubmitted) {
    return (
      <main className="w-full max-w-2xl mx-auto px-6 py-24 flex-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
        <div className="w-20 h-20 bg-[#e91e3f]/10 border border-[#e91e3f]/20 rounded-full flex items-center justify-center mx-auto mb-8"><svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-[#e91e3f]" fill="none" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div>
        <h2 className="text-3xl font-black text-white mb-4 tracking-tight">문의 접수 완료</h2>
        <p className="text-gray-400 text-sm mb-10 leading-relaxed text-center">소중한 의견을 보내주셔서 감사합니다.<br />관리자 확인 후 빠른 시일 내에 답변해 드리겠습니다.</p>
        <button onClick={() => { setIsSubmitted(false); setMainType(""); setSubType(""); setErrorDesc(""); setReportDate(""); setReportType(""); setProductName(""); setRefundType("환불"); setContent(""); setEmail(""); setIsEmailChecked(false); }} className="px-10 py-4 bg-white hover:bg-gray-200 text-black font-bold rounded-xl transition-all shadow-lg shadow-white/10 outline-none focus:outline-none">새 문의 작성하기</button>
      </main>
    );
  }

  return (
    <main key={viewMode} className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── 머리말 ── */}
      <section className="w-full max-w-3xl mx-auto px-6 pt-14 md:pt-20 pb-6 flex items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Support Center</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-2">1:1 문의</h1>
          <p className="text-gray-400 text-sm break-keep">불편한 점이나 궁금한 점을 편하게 적어주세요.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setViewMode("admin")} className="px-5 py-2.5 bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 hover:bg-[#e91e3f]/20 text-sm font-bold rounded-full transition-colors shrink-0">
            관리자 대시보드 열기
          </button>
        )}
      </section>

      <div className="w-full max-w-3xl mx-auto px-6 pb-20 flex-1 flex flex-col">
        {/* 📒 공책 한 장 — 줄이 그어진 종이에 그대로 적는 느낌 */}
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="relative rounded-sm bg-[#fbfaf5] text-[#1f2430] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)] overflow-hidden">
          {/* 위쪽 스프링 자국 */}
          <div className="flex items-center gap-6 px-8 pt-5 pb-4 border-b border-[#e6e2d6]">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-full bg-[#e6e2d6] shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)]"></span>
            ))}
          </div>

          {/* 좌측 붉은 여백선 */}
          <div className="absolute left-12 top-[52px] bottom-0 w-px bg-[#e9a8ac]/70 pointer-events-none hidden sm:block"></div>

          <div className="px-6 sm:pl-16 sm:pr-10 py-8 space-y-9">
            {/* 1. 문의 유형 */}
            <div>
              <p className="text-[13px] font-bold text-[#5b6472] mb-3">1. 어떤 일로 오셨나요?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
                {TYPE_META.map((t) => {
                  const active = mainType === t.key;
                  return (
                    <button key={t.key} type="button"
                      onClick={() => { setMainType(t.key); setSubType(""); setReportType(""); setProductName(""); setRefundType("환불"); }}
                      className="flex items-center gap-3 py-2 text-left outline-none group">
                      {/* 공책 체크칸 */}
                      <span className={`w-[18px] h-[18px] border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${active ? "border-[#c0392f] text-[#c0392f]" : "border-[#b8bec8] text-transparent group-hover:border-[#7b8494]"}`}>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-[14px] font-bold ${active ? "text-[#c0392f]" : "text-[#1f2430]"}`}>{t.key}</span>
                        <span className="block text-[11px] text-[#7b8494]">{t.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 유형을 고르면 그 아래가 펼쳐진다 */}
            {mainType && (
              <div key={mainType} className="space-y-9 animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="h-px bg-[#e6e2d6]"></div>

                {/* 2. 유형별 상세 */}
                <div>
                  <p className="text-[13px] font-bold text-[#5b6472] mb-3">2. 자세히 알려주세요</p>

                  {mainType === "일반" && (
                    <div>
                      <label className={noteLabel}>문의 분류</label>
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {["일반", "이용", "건의/제안", "기타"].map((t) => (
                          <button type="button" key={t} onClick={() => setSubType(t)}
                            className="flex items-center gap-2 py-1 outline-none group">
                            <span className={`w-[15px] h-[15px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${subType === t ? "border-[#c0392f]" : "border-[#b8bec8] group-hover:border-[#7b8494]"}`}>
                              {subType === t && <span className="w-[7px] h-[7px] rounded-full bg-[#c0392f]"></span>}
                            </span>
                            <span className={`text-[13px] font-bold ${subType === t ? "text-[#c0392f]" : "text-[#3a4250]"}`}>{t}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {mainType === "오류" && (
                    <div>
                      <label className={noteLabel}>어떤 오류인가요?</label>
                      <input type="text" required placeholder="예: 봇 명령어가 작동하지 않습니다." value={errorDesc} onChange={(e) => setErrorDesc(e.target.value)} className={noteInput} />
                    </div>
                  )}

                  {mainType === "신고" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                      <div>
                        <label className={noteLabel}>발생 일시</label>
                        <input type="text" required placeholder="예: 2026-08-12 오전 경" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={noteInput} />
                      </div>
                      <div>
                        <label className={noteLabel}>신고 유형</label>
                        <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                          {["운영정책 위반", "테러", "분쟁", "기타"].map((opt) => (
                            <button key={opt} type="button" onClick={() => setReportType(opt)}
                              className="flex items-center gap-2 outline-none group">
                              <span className={`w-[15px] h-[15px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${reportType === opt ? "border-[#c0392f]" : "border-[#b8bec8] group-hover:border-[#7b8494]"}`}>
                                {reportType === opt && <span className="w-[7px] h-[7px] rounded-full bg-[#c0392f]"></span>}
                              </span>
                              <span className={`text-[13px] font-bold ${reportType === opt ? "text-[#c0392f]" : "text-[#3a4250]"}`}>{opt}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {mainType === "환불 및 교환" && (
                    <div className="space-y-5">
                      <div>
                        <label className={noteLabel}>구매한 상품</label>
                        {orders.length > 0 ? (
                          <div className="divide-y divide-[#e6e2d6] border-y border-[#e6e2d6] max-h-56 overflow-y-auto">
                            {orders.map((o) => {
                              const label = `${o.itemName} (${new Date(o.createdAt).toLocaleDateString("ko-KR")})`;
                              const picked = productName === label;
                              return (
                                <button key={o._id} type="button" onClick={() => setProductName(label)}
                                  className="w-full text-left py-2.5 flex items-center gap-3 outline-none group">
                                  <span className={`w-[15px] h-[15px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${picked ? "border-[#c0392f]" : "border-[#b8bec8] group-hover:border-[#7b8494]"}`}>
                                    {picked && <span className="w-[7px] h-[7px] rounded-full bg-[#c0392f]"></span>}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-[13px] font-bold truncate ${picked ? "text-[#c0392f]" : "text-[#1f2430]"}`}>{o.itemName}</span>
                                    <span className="block text-[11px] text-[#7b8494]">
                                      {ORDER_TYPE_LABEL[o.itemType] || "상품"} · {new Date(o.createdAt).toLocaleDateString("ko-KR")} · {(o.price || 0).toLocaleString()} XP
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input type="text" required placeholder="예: 쿠폰, 아이템, 역할 등" value={productName} onChange={(e) => setProductName(e.target.value)} className={noteInput} />
                        )}
                        {orders.length > 0 && (
                          <p className="text-[11px] text-[#7b8494] mt-2 break-keep">
                            목록에 없다면 <button type="button" onClick={() => setOrders([])} className="text-[#c0392f] font-bold underline">직접 적을</button> 수 있습니다.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className={noteLabel}>환불인가요, 교환인가요?</label>
                        <div className="flex gap-x-6 pt-1">
                          {["환불", "교환"].map((type) => (
                            <button type="button" key={type} onClick={() => setRefundType(type)}
                              className="flex items-center gap-2 outline-none group">
                              <span className={`w-[15px] h-[15px] rounded-full border-[1.5px] flex items-center justify-center shrink-0 ${refundType === type ? "border-[#c0392f]" : "border-[#b8bec8] group-hover:border-[#7b8494]"}`}>
                                {refundType === type && <span className="w-[7px] h-[7px] rounded-full bg-[#c0392f]"></span>}
                              </span>
                              <span className={`text-[13px] font-bold ${refundType === type ? "text-[#c0392f]" : "text-[#3a4250]"}`}>{type}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="h-px bg-[#e6e2d6]"></div>

                {/* 3. 내용 — 줄공책에 그대로 적는 칸 */}
                <div>
                  <p className="text-[13px] font-bold text-[#5b6472] mb-3">3. 무슨 일이 있었나요?</p>
                  <textarea
                    required
                    placeholder="언제, 어디서, 무슨 일이 있었는지 적어주세요."
                    rows={8}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full bg-transparent border-0 outline-none resize-none text-[15px] text-[#1f2430] placeholder:text-[#a8b0bb] px-0"
                    style={{
                      lineHeight: "32px",
                      backgroundImage:
                        "repeating-linear-gradient(to bottom, transparent 0px, transparent 31px, #dfe0d6 31px, #dfe0d6 32px)",
                      backgroundAttachment: "local",
                    }}
                  />
                  <div className="flex justify-end">
                    <span className="text-[11px] text-[#a8b0bb] tabular-nums">{content.length.toLocaleString()}자</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  <button type="submit" className="w-full sm:w-auto sm:flex-1 py-3 px-8 bg-[#1f2430] hover:bg-[#0f1420] text-white text-sm font-bold rounded-sm transition-colors outline-none">
                    문의 제출하기
                  </button>
                  <Link href="/profile?tab=inquiry" className="w-full sm:w-auto text-center py-3 px-6 text-[13px] font-bold text-[#7b8494] hover:text-[#1f2430] transition-colors">
                    내 문의 내역 보기
                  </Link>
                </div>
              </div>
            )}
          </div>
        </form>
      </div>

      {popupConfig.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl flex flex-col items-center">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 ${popupConfig.isError ? "bg-red-500/10 text-red-500" : "bg-[#e91e3f]/10 text-[#e91e3f]"}`}>
              {popupConfig.isError ? (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{popupConfig.isError ? "오류" : "완료"}</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed whitespace-pre-line">{popupConfig.message}</p>
            <button onClick={() => setPopupConfig({ ...popupConfig, isOpen: false })} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">확인</button>
          </div>
        </div>
      )}
    </main>
  );
}