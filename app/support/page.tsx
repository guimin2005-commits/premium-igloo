"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";

const ADMIN_USERS = ["elahw.06"];

const FAQ_DATA = [
  {
    category: "XP & LEVEL 시스템",
    items: [
      { q: "레벨업에 필요한 XP 양은 모든 구간이 같나요?", a: "상위 레벨로 진입할수록 다음 단계 달성에 필요한 XP 요구량이 점진적으로 증가합니다." },
      { q: "채팅을 빠르고 많이 치면 XP를 빨리 획득할 수 있나요?", a: "획득할 수 있는 쿨타임이 존재합니다." },
      { q: "음성 채널에 혼자 있어도 XP 획득이 가능한가요?", a: "네, 가능합니다. 단, 마이크 및 헤드셋 음소거 시 XP 획득량이 90% 감소됩니다." },
      { q: "레벨이 오르면 어떤 구체적인 혜택이 있나요?", a: "특정 레벨마다 전용 레벨 역할 및 색상 혜택이 적용됩니다." },
      { q: "서버 퇴장 시 XP 및 LEVEL이 유지 되나요?", a: "유지되지 않습니다. 서버 퇴장 시 즉시 XP 및 LEVEL이 모두 초기화 됩니다." }
    ]
  },
  {
    category: "XP SHOP 및 아이템 상품",
    items: [
      { q: "레벨에 따라 구매할 수 있는 상품이 다른가요?", a: "네, 레벨이 높아질수록 구매할 수 있는 상품의 폭이 커집니다." },
      { q: "상품 구매 후 환불 및 교환이 가능한가요?", a: "네, 가능합니다. 구매 후 30분 이내로 1:1 문의를 통해 환불 및 교환 신청 시에만 처리 가능합니다." },
      { q: "실물 상품 수령을 위해 꼭 개인정보를 입력해야 하나요?", a: "네, 이벤트 경품이나 기프트 상품을 전송해 드리기 위해 최소한의 정보가 필요합니다." }
    ]
  },
  {
    category: "MUSIC BOT",
    items: [
      { q: "MUSIC BOT이 무엇인지, 어떻게 사용하는지 궁금해요.", a: "음성 채널에서 사용자가 원하는 음악을 재생할 수 있는 봇입니다." },
      { q: "재생이 끊기거나 소리가 들리지 않아요.", a: "사용자의 네트워크 상태 또는 봇 서버가 불안정할 때 발생합니다." },
      { q: "MUSIC BOT이 재생되지 않거나, 음성 채널에 접속하지 않아요.", a: "봇의 내부적인 시스템 문제이거나 봇 자체가 오프라인 상태일 가능성이 높습니다." }
    ]
  }
];

export default function SupportPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [viewMode, setViewMode] = useState<"user" | "admin">("user");
  const [mainType, setMainType] = useState("일반");
  const [subType, setSubType] = useState("");
  const [errorDesc, setErrorDesc] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [reportType, setReportType] = useState("");
  const [productName, setProductName] = useState("");
  const [refundType, setRefundType] = useState("환불");
  const [content, setContent] = useState("");
  const [isEmailChecked, setIsEmailChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [suggestedFaqs, setSuggestedFaqs] = useState<any[]>([]);

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

  useEffect(() => {
    const trimmedContent = content.trim();
    if (trimmedContent.length < 5) {
      setSuggestedFaqs([]);
      return;
    }

    const searchText = trimmedContent.toLowerCase();
    const suggestions: any[] = [];
    const seenQuestions = new Set<string>();

    FAQ_DATA.forEach((section: any) => {
      section.items.forEach((faq: any) => {
        if (seenQuestions.has(faq.q)) return;

        const questionLower = faq.q.toLowerCase();
        const answerLower = faq.a.toLowerCase();
        let matchScore = 0;

        const keywords = searchText.split(/[\s,.!?]+/).filter((k: string) => k.length > 2);
        keywords.forEach((keyword: string) => {
          if (questionLower.includes(keyword)) matchScore += 3;
          if (answerLower.includes(keyword)) matchScore += 1;
        });

        if (matchScore > 0) {
          suggestions.push({ ...faq, category: section.category, score: matchScore });
          seenQuestions.add(faq.q);
        }
      });
    });

    suggestions.sort((a, b) => b.score - a.score);
    setSuggestedFaqs(suggestions.slice(0, 3));
  }, [content]);

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

    const inquiryData = { user: session?.user?.name, mainType, subType, errorDesc, reportDate, reportType, productName, refundType, content, email: isEmailChecked ? email : "미제공" };
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
        <div className="mb-10 border-b border-white/10 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black text-white mb-3">1:1 문의 관리</h1>
            <p className="text-gray-400 text-sm">유저들의 모든 문의 내역을 확인하고 답변합니다.</p>
          </div>
          <button onClick={() => setViewMode("user")} className="px-5 py-2.5 bg-[#2a2a2a] hover:bg-[#333] text-white text-sm font-bold rounded-xl transition-colors">
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-[#121212] border border-[#e91e3f]/20 rounded-3xl w-full max-w-3xl shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-8 pb-4 shrink-0 border-b border-white/5 relative">
                <button onClick={() => setSelectedAdminInquiry(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors z-10">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <div className="pr-12">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-md mb-3 inline-block ${selectedAdminInquiry.status === '답변 완료' ? 'bg-blue-500/10 text-blue-400' : 'bg-[#e91e3f]/10 text-[#e91e3f]'}`}>{selectedAdminInquiry.status}</span>
                  <h2 className="text-2xl font-bold text-white leading-tight break-words">{selectedAdminInquiry.title}</h2>
                </div>
              </div>
              
              <div className="p-8 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 mb-6 text-sm bg-[#1a1a1a] p-5 rounded-xl border border-white/5">
                  <div className="text-gray-300"><strong className="text-gray-500 mr-2">작성자</strong> {selectedAdminInquiry.user}</div>
                  <div className="text-gray-300"><strong className="text-gray-500 mr-2">이메일</strong> {selectedAdminInquiry.email}</div>
                  <div className="text-gray-300"><strong className="text-gray-500 mr-2">분류</strong> {selectedAdminInquiry.mainType} {selectedAdminInquiry.subType && `> ${selectedAdminInquiry.subType}`}</div>
                  <div className="text-gray-300"><strong className="text-gray-500 mr-2">접수일</strong> {new Date(selectedAdminInquiry.createdAt).toLocaleString()}</div>
                </div>

                <div className="mb-8">
                  <span className="block text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">상세 내용</span>
                  <div className="text-gray-300 text-sm bg-white/[0.02] p-5 rounded-xl border border-white/5 whitespace-pre-wrap leading-relaxed min-h-[120px]">
                    {selectedAdminInquiry.content}
                  </div>
                </div>

                <form onSubmit={handleAnswerSubmit} className="space-y-4 border-t border-white/5 pt-6">
                  <span className="block text-xs font-bold text-[#e91e3f] mb-2 uppercase tracking-wider">MANAGER ANSWER</span>
                  <textarea rows={5} value={answerText} onChange={(e) => setAnswerText(e.target.value)} placeholder="답변을 작성해주세요..." className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl p-5 text-sm text-white focus:border-[#e91e3f] outline-none resize-none transition-colors" />
                  <div className="flex gap-4 pt-2">
                    <button type="submit" className="flex-1 py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20 outline-none">답변 저장하기</button>
                    <button type="button" onClick={() => setDeleteConfirmId(selectedAdminInquiry._id)} className="px-8 py-3.5 bg-[#1a1a1a] hover:bg-red-500/20 text-red-500 font-bold rounded-xl transition-all border border-red-500/20 outline-none">삭제</button>
                  </div>
                </form>
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
        <button onClick={() => { setIsSubmitted(false); setMainType("일반"); setSubType(""); setErrorDesc(""); setReportDate(""); setReportType(""); setProductName(""); setRefundType("환불"); setContent(""); setEmail(""); setIsEmailChecked(false); }} className="px-10 py-4 bg-white hover:bg-gray-200 text-black font-bold rounded-xl transition-all shadow-lg shadow-white/10 outline-none focus:outline-none">새 문의 작성하기</button>
      </main>
    );
  }

  return (
    <main key={viewMode} className="w-full max-w-3xl mx-auto px-6 py-16 flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white mb-3 tracking-tight">1:1 문의 접수</h1>
          <p className="text-gray-400 text-sm">이용 중 불편한 사항 또는 궁금하신 사항을 남겨주세요.</p>
        </div>
        {isAdmin && (
          <button onClick={() => setViewMode("admin")} className="px-5 py-2.5 bg-[#e91e3f]/10 text-[#e91e3f] border border-[#e91e3f]/20 hover:bg-[#e91e3f]/20 text-sm font-bold rounded-xl transition-colors shrink-0">
            관리자 대시보드 열기
          </button>
        )}
      </div>

      <div className="flex gap-8 border-b border-white/10 mb-10 overflow-x-auto scrollbar-hide">
        {["일반", "오류", "신고", "환불 및 교환"].map((type) => (
          <button key={type} type="button" onClick={() => { setMainType(type); setSubType(""); setReportType(""); setProductName(""); setRefundType("환불"); }} className={`pb-4 text-sm font-bold whitespace-nowrap transition-colors outline-none focus:outline-none relative ${mainType === type ? "text-[#e91e3f]" : "text-gray-500 hover:text-white"}`}>
            {type}{mainType === type && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e91e3f]" />}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex flex-col gap-10">
        <div className="flex flex-col gap-8">
          {mainType === "일반" && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">문의 분류 <span className="text-[#e91e3f]">*</span></label>
              <div className="flex flex-wrap gap-3">
                {["일반", "이용", "건의/제안", "기타"].map((t) => (
                  <button type="button" key={t} onClick={() => setSubType(t)} className={`px-6 py-2.5 text-sm font-bold rounded-full border outline-none focus:outline-none transition-all ${subType === t ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-400 hover:border-white/30"}`}>{t}</button>
                ))}
              </div>
            </div>
          )}

          {mainType === "오류" && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">발생 오류 <span className="text-[#e91e3f]">*</span></label>
              <input type="text" required placeholder="예시: 봇 명령어가 작동하지 않습니다." value={errorDesc} onChange={(e) => setErrorDesc(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-3 text-white focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-700" />
            </div>
          )}

          {mainType === "신고" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">발생 일시 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예시 : 20XX-XX-XX 오전 경" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-3 text-white focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-700" />
              </div>
              <div className="relative">
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">신고 유형 <span className="text-[#e91e3f]">*</span></label>
                <button type="button" onClick={() => setIsReportDropdownOpen(!isReportDropdownOpen)} className="w-full bg-transparent border-b border-white/10 py-3 text-white focus:outline-none transition-colors flex justify-between items-center text-left hover:border-white/30">
                  <span className={reportType ? "text-white font-bold" : "text-gray-700"}>{reportType || "선택해주세요"}</span><svg className={`w-4 h-4 text-gray-500 transition-transform ${isReportDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </button>
                {isReportDropdownOpen && (
                  <><div className="fixed inset-0 z-40" onClick={() => setIsReportDropdownOpen(false)}></div>
                    <div className="absolute top-[100%] left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      {["운영정책 위반", "테러", "분쟁", "기타"].map((opt) => (
                        <button key={opt} type="button" onClick={() => { setReportType(opt); setIsReportDropdownOpen(false); }} className={`w-full text-left px-5 py-3.5 text-sm transition-colors outline-none focus:outline-none relative z-50 ${reportType === opt ? 'bg-[#e91e3f]/10 text-[#e91e3f] font-bold' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>{opt}</button>
                      ))}
                    </div></>
                )}
              </div>
            </div>
          )}

          {mainType === "환불 및 교환" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">상품명 <span className="text-[#e91e3f]">*</span></label>
                <input type="text" required placeholder="예시: 쿠폰, 아이템, 역할 등" value={productName} onChange={(e) => setProductName(e.target.value)} className="w-full bg-transparent border-b border-white/10 py-3 text-white focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-700" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">유형 <span className="text-[#e91e3f]">*</span></label>
                <div className="flex gap-4">
                  {["환불", "교환"].map((type) => (
                    <button type="button" key={type} onClick={() => setRefundType(type)} className={`px-5 py-2.5 text-sm font-bold rounded-full border transition-all outline-none focus:outline-none ${refundType === type ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-400 hover:border-white/30"}`}>{type}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-4 uppercase tracking-wider">상세 내용 <span className="text-[#e91e3f]">*</span></label>
            <textarea required placeholder="상세한 내용을 입력해 주세요." rows={6} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-5 py-4 bg-white/[0.02] border border-white/10 rounded-xl text-white outline-none resize-none focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-700" />

            {suggestedFaqs.length > 0 && (
              <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <p className="text-xs font-bold text-blue-400 mb-3">💡 관련 FAQ</p>
                <div className="flex flex-col gap-2">
                  {suggestedFaqs.map((faq, idx) => (
                    <div key={idx} className="p-3 bg-white/5 rounded border border-white/5 hover:border-blue-500/30 transition-colors cursor-pointer group">
                      <p className="text-xs text-blue-300 group-hover:text-blue-200 transition-colors font-medium line-clamp-2">{faq.q}</p>
                      <p className="text-xs text-gray-500 mt-1">{faq.category}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6 pt-6 border-t border-white/10">
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-3 text-sm text-gray-400 cursor-pointer w-max group">
              <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${isEmailChecked ? "bg-[#e91e3f] border-[#e91e3f]" : "border-gray-600 group-hover:border-gray-400"}`}>
                {isEmailChecked && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <input type="checkbox" className="hidden" checked={isEmailChecked} onChange={(e) => setIsEmailChecked(e.target.checked)} />
              답변 알림을 이메일로 받겠습니다. (선택)
            </label>
            {isEmailChecked && <input type="email" required placeholder="이메일 주소" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full md:w-1/2 bg-transparent border-b border-white/10 py-3 text-white focus:outline-none focus:border-[#e91e3f] transition-colors placeholder:text-gray-700" />}
          </div>

          <button type="submit" className="w-full py-4 mt-2 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none">문의 등록하기</button>
        </div>
      </form>

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