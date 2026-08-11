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

// 참조 서식의 라벨-좌측 행 — 라벨은 왼쪽 고정 폭, 입력은 오른쪽
const FormRow = ({ label, required, align = "center", children }: { label: string; required?: boolean; align?: "center" | "start"; children: React.ReactNode }) => (
  <div className={`flex flex-col sm:flex-row gap-1.5 sm:gap-6 py-4 border-b border-white/[0.06] ${align === "start" ? "sm:items-start" : "sm:items-center"}`}>
    <p className={`text-[13px] font-bold text-gray-300 sm:w-28 shrink-0 ${align === "start" ? "sm:pt-2.5" : ""}`}>
      {label}{required && <span className="text-[#e91e3f] ml-0.5">*</span>}
    </p>
    <div className="min-w-0 flex-1">{children}</div>
  </div>
);

const labelClass = "block text-[11px] font-bold text-gray-500 tracking-wide mb-2.5";
const inputClass =
  "w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600";

// 구획 머리말 — 번호 + 헤어라인 (사이트 공통 톤)
const SectionHead = ({ no, title, desc }: { no: string; title: string; desc?: string }) => (
  <div className="mb-5">
    <div className="flex items-baseline gap-4 mb-2">
      <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
    </div>
    <h2 className="text-lg md:text-xl font-black text-white tracking-tight">{title}</h2>
    {desc && <p className="text-xs text-gray-500 mt-1 break-keep leading-relaxed">{desc}</p>}
  </div>
);

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
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [notifyDiscord, setNotifyDiscord] = useState(true); // 답변 시 디스코드 DM 수신 동의
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
    if (!title.trim()) {
      setPopupConfig({ isOpen: true, message: "제목을 입력해주세요.", isError: true });
      return;
    }
    if (!content.trim()) {
      setPopupConfig({ isOpen: true, message: "상세 내용을 입력해주세요.", isError: true });
      return;
    }

    const inquiryData = { user: session?.user?.name, userId: (session?.user as any)?.id || "", mainType, subType, errorDesc, reportDate, reportType, productName, refundType, title, content, notifyDiscord, email: "미제공" };
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
        <p className="text-gray-400 text-sm mb-3 leading-relaxed text-center break-keep">소중한 의견을 보내주셔서 감사합니다.<br />관리자 확인 후 빠른 시일 내에 답변해 드리겠습니다.</p>
        <p className="text-[12px] text-gray-500 mb-10 text-center break-keep">{notifyDiscord ? "답변이 등록되면 디스코드 DM으로 알려드립니다." : "답변은 내 정보 › 1:1 문의 내역에서 확인할 수 있습니다."}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => { setIsSubmitted(false); setMainType(""); setSubType(""); setErrorDesc(""); setReportDate(""); setReportType(""); setProductName(""); setRefundType("환불"); setTitle(""); setContent(""); }} className="px-8 py-3.5 bg-white hover:bg-gray-200 text-black text-sm font-bold rounded-lg transition-colors outline-none">새 문의 작성하기</button>
          <Link href="/profile?tab=inquiry" className="px-8 py-3.5 text-sm font-bold text-gray-400 hover:text-white transition-colors">내 문의 내역 보기</Link>
        </div>
      </main>
    );
  }

  return (
    <main key={viewMode} className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <div className="w-full max-w-5xl mx-auto px-6 pt-14 md:pt-20 pb-20">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
          className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-10 lg:gap-14 items-start">

          {/* ═══ 왼쪽 · 문의 입력 ═══ */}
          <div>
            <div className="flex items-baseline justify-between border-b-2 border-white/85 pb-3 mb-1">
              <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">문의 입력</h1>
              <span className="text-[11px] font-bold text-[#e91e3f]">* 필수 입력</span>
            </div>

            <FormRow label="작성자">
              <p className="text-sm text-gray-300 py-2.5">{session.user?.name}</p>
            </FormRow>

            <FormRow label="문의 유형" required>
              <div className="flex flex-wrap gap-x-6 gap-y-2 py-1.5">
                {TYPE_META.map((t) => {
                  const active = mainType === t.key;
                  return (
                    <button key={t.key} type="button"
                      onClick={() => { setMainType(t.key); setSubType(""); setReportType(""); setProductName(""); setRefundType("환불"); }}
                      className="flex items-center gap-2 py-1 outline-none group">
                      <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${active ? "border-[#e91e3f]" : "border-white/25 group-hover:border-white/50"}`}>
                        {active && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                      </span>
                      <span className={`text-[13px] font-bold ${active ? "text-[#e91e3f]" : "text-gray-300"}`}>{t.key}</span>
                    </button>
                  );
                })}
              </div>
              {mainType && <p className="text-[11px] text-gray-500 pb-1">{TYPE_META.find((t) => t.key === mainType)?.desc}</p>}
            </FormRow>

            {/* 유형을 고르면 높이까지 함께 열린다 */}
            <div className="grid transition-[grid-template-rows,opacity] duration-500 ease-out"
              style={{ gridTemplateRows: mainType ? "1fr" : "0fr", opacity: mainType ? 1 : 0 }}>
              <div className="overflow-hidden min-h-0">
                <div key={mainType} className="animate-in fade-in duration-500">

                  {mainType === "일반" && (
                    <FormRow label="문의 분류" required>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 py-1.5">
                        {["일반", "이용", "건의/제안", "기타"].map((t) => (
                          <button type="button" key={t} onClick={() => setSubType(t)} className="flex items-center gap-2 py-1 outline-none group">
                            <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${subType === t ? "border-[#e91e3f]" : "border-white/25 group-hover:border-white/50"}`}>
                              {subType === t && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                            </span>
                            <span className={`text-[13px] font-bold ${subType === t ? "text-[#e91e3f]" : "text-gray-300"}`}>{t}</span>
                          </button>
                        ))}
                      </div>
                    </FormRow>
                  )}

                  {mainType === "오류" && (
                    <FormRow label="발생 오류" required>
                      <input type="text" placeholder="예: 봇 명령어가 작동하지 않습니다." value={errorDesc} onChange={(e) => setErrorDesc(e.target.value)} className={inputClass} />
                    </FormRow>
                  )}

                  {mainType === "신고" && (
                    <>
                      <FormRow label="발생 일시" required>
                        <input type="text" placeholder="예: 2026-08-12 오전 경" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className={inputClass} />
                      </FormRow>
                      <FormRow label="신고 유형" required>
                        <div className="flex flex-wrap gap-x-6 gap-y-2 py-1.5">
                          {["운영정책 위반", "테러", "분쟁", "기타"].map((opt) => (
                            <button type="button" key={opt} onClick={() => setReportType(opt)} className="flex items-center gap-2 py-1 outline-none group">
                              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${reportType === opt ? "border-[#e91e3f]" : "border-white/25 group-hover:border-white/50"}`}>
                                {reportType === opt && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                              </span>
                              <span className={`text-[13px] font-bold ${reportType === opt ? "text-[#e91e3f]" : "text-gray-300"}`}>{opt}</span>
                            </button>
                          ))}
                        </div>
                      </FormRow>
                    </>
                  )}

                  {mainType === "환불 및 교환" && (
                    <>
                      <FormRow label="구매한 상품" required>
                        {orders.length > 0 ? (
                          <>
                            <div className="rounded-lg border border-white/10 divide-y divide-white/[0.06] overflow-hidden max-h-52 overflow-y-auto">
                              {orders.map((o) => {
                                const label = `${o.itemName} (${new Date(o.createdAt).toLocaleDateString("ko-KR")})`;
                                const picked = productName === label;
                                return (
                                  <button key={o._id} type="button" onClick={() => setProductName(label)}
                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors outline-none ${picked ? "bg-[#e91e3f]/[0.08]" : "hover:bg-white/[0.03]"}`}>
                                    <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${picked ? "border-[#e91e3f]" : "border-white/25"}`}>
                                      {picked && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className={`block text-[13px] font-bold truncate ${picked ? "text-[#e91e3f]" : "text-white"}`}>{o.itemName}</span>
                                      <span className="block text-[11px] text-gray-500">
                                        {ORDER_TYPE_LABEL[o.itemType] || "상품"} · {new Date(o.createdAt).toLocaleDateString("ko-KR")} · {(o.price || 0).toLocaleString()} XP
                                      </span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-2 break-keep">
                              목록에 없다면 <button type="button" onClick={() => setOrders([])} className="text-[#e91e3f] font-bold hover:underline">직접 입력</button>할 수 있습니다.
                            </p>
                          </>
                        ) : (
                          <input type="text" placeholder="예: 쿠폰, 아이템, 역할 등" value={productName} onChange={(e) => setProductName(e.target.value)} className={inputClass} />
                        )}
                      </FormRow>
                      <FormRow label="처리 유형" required>
                        <div className="flex gap-x-6 py-1.5">
                          {["환불", "교환"].map((type) => (
                            <button type="button" key={type} onClick={() => setRefundType(type)} className="flex items-center gap-2 py-1 outline-none group">
                              <span className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${refundType === type ? "border-[#e91e3f]" : "border-white/25 group-hover:border-white/50"}`}>
                                {refundType === type && <span className="w-2 h-2 rounded-full bg-[#e91e3f]"></span>}
                              </span>
                              <span className={`text-[13px] font-bold ${refundType === type ? "text-[#e91e3f]" : "text-gray-300"}`}>{type}</span>
                            </button>
                          ))}
                        </div>
                      </FormRow>
                    </>
                  )}

                  <FormRow label="제목" required>
                    <input type="text" maxLength={100} placeholder="제목을 입력해 주세요. (최대 100자)" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
                  </FormRow>

                  <FormRow label="문의 내용" required align="start">
                    <div className="relative">
                      <textarea rows={10} placeholder="언제, 어디서, 무슨 일이 있었는지 적어주세요." value={content} onChange={(e) => setContent(e.target.value)}
                        className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-3 text-sm text-white outline-none resize-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-600 leading-relaxed" />
                      <span className="absolute bottom-3 right-4 text-[11px] font-bold text-gray-600 tabular-nums">{content.length.toLocaleString()}자</span>
                    </div>
                  </FormRow>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ 오른쪽 · 답변 알림 · 접수 ═══ */}
          <aside className="lg:sticky lg:top-24">
            <div className="border-b-2 border-white/85 pb-3 mb-4">
              <h2 className="text-xl md:text-2xl font-black text-white tracking-tight">답변 알림</h2>
            </div>

            <button type="button" onClick={() => setNotifyDiscord(!notifyDiscord)}
              className="w-full flex items-center gap-3 py-3 text-left outline-none group">
              <span className={`w-[18px] h-[18px] rounded border flex items-center justify-center shrink-0 transition-colors ${notifyDiscord ? "bg-[#e91e3f] border-[#e91e3f] text-white" : "border-white/25 text-transparent group-hover:border-white/50"}`}>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold text-white">디스코드 알림</span>
                <span className="block text-[11px] text-gray-500 break-keep">답변이 등록되면 봇이 DM으로 알려드립니다.</span>
              </span>
            </button>
            <p className="text-[11px] text-gray-600 break-keep leading-relaxed mb-8">
              DM을 받지 않도록 설정한 경우에는 전달되지 않습니다. 답변은 언제든 내 정보 › 1:1 문의 내역에서 확인할 수 있습니다.
            </p>

            <button type="submit"
              className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-lg transition-colors outline-none">
              문의하기
            </button>
            <Link href="/profile?tab=inquiry" className="mt-3 w-full block text-center py-2.5 text-[12px] font-bold text-gray-400 hover:text-white transition-colors">
              내 문의 내역 보기
            </Link>

            {isAdmin && (
              <button type="button" onClick={() => setViewMode("admin")}
                className="mt-6 w-full py-2.5 rounded-lg border border-[#e91e3f]/20 bg-[#e91e3f]/10 text-[#e91e3f] text-[12px] font-bold hover:bg-[#e91e3f]/20 transition-colors">
                관리자 대시보드 열기
              </button>
            )}
          </aside>
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