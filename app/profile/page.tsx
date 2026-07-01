"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function MyInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("inquiry");
  const [inquiryFilter, setInquiryFilter] = useState("all");
  const [recruitFilter, setRecruitFilter] = useState("all");
  const [fetchedInquiries, setFetchedInquiries] = useState<any[]>([]);
  const [fetchedRecruits, setFetchedRecruits] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isServerBooster = userSession?.isBooster || false;

  useEffect(() => {
    if (status === "authenticated" && session?.user?.name) {
      setIsDataLoading(true);
      Promise.all([
        fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" }).then(res => res.json()).catch(() => ({ success: false, data: [] })),
        fetch(`/api/user/applies?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" }).then(res => res.json()).catch(() => ({ success: false, data: [] }))
      ]).then(([inqRes, recRes]) => {
        if (inqRes?.success && Array.isArray(inqRes.data)) {
          setFetchedInquiries(inqRes.data.map((item: any) => ({
            id: item._id, type: item.mainType || "일반 문의", title: item.title || "제목 없음",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : "날짜 없음",
            createdAt: item.createdAt, updatedAt: item.updatedAt, answeredAt: item.answeredAt,
            status: item.status, content: item.content, answer: item.answer
          })));
        }
        if (recRes?.success && Array.isArray(recRes.data)) {
          setFetchedRecruits(recRes.data.map((item: any) => ({
            id: item._id, title: `${item.position || "스태프"} 지원서`, role: item.position || "스태프",
            date: item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : "날짜 없음", 
            status: item.status || "심사 중"
          })));
        }
      }).catch(err => console.error("데이터 로드 실패:", err)).finally(() => setIsDataLoading(false));
    }
  }, [status, session]);

  const executeCancelApply = async () => {
    if (!cancelConfirmId) return;
    try {
      const res = await fetch(`/api/user/applies?id=${cancelConfirmId}`, { method: "DELETE" });
      if (res.ok) {
        setFetchedRecruits(prev => prev.filter(rec => rec.id !== cancelConfirmId));
        alert("지원이 정상적으로 취소되었습니다.");
      } else {
        alert("지원 취소 중 오류가 발생했습니다.");
      }
    } catch (e) {
      alert("서버와 통신하는 중 문제가 발생했습니다.");
    } finally {
      setCancelConfirmId(null);
    }
  };

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (status === "unauthenticated") { router.push("/"); return null; }

  const filteredInquiries = fetchedInquiries.filter(inq => {
    if (inquiryFilter === "pending") return inq.status === "접수 중";
    if (inquiryFilter === "completed") return inq.status === "답변 완료";
    return true;
  });

  const filteredRecruits = fetchedRecruits.filter(rec => {
    if (recruitFilter === "all") return true;
    if (recruitFilter === "불합격") return rec.status === "불합격" || rec.status === "취소/반려" || rec.status === "취소";
    return rec.status === recruitFilter;
  });

  return (
    <main className="w-full max-w-4xl mx-auto px-6 py-16 flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 border-b border-white/10 pb-8 mb-8">
        <div className="flex items-center gap-5">
          <img src={session?.user?.image || ""} alt="Profile" className={`w-20 h-20 rounded-full bg-gray-800 border border-white/10 shadow-xl ${isBooster ? 'ring-2 ring-[#e91e3f]/60 ring-offset-4 ring-offset-[#090909]' : ''}`} />
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1.5 flex items-center gap-2">
              {session?.user?.name}
              {isBooster && <span className="text-[10px] bg-[#e91e3f]/20 text-[#e91e3f] px-2 py-0.5 rounded border border-[#e91e3f]/30">BOOSTER</span>}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {isVerified && hasScrimRole ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                  인증
                </span>
              ) : isVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                  일부 인증
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" /></svg>
                  미인증
                </span>
              )}
              {isServerBooster && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-[#ff41cf]/10 text-[#ff41cf] border border-[#ff41cf]/30">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M8.684 2.687C8.886 1.148 10.379.5 11.77.5h.46c1.39 0 2.884.648 3.086 2.187l.272 1.95h3.6c1.39 0 2.643 1.253 2.643 2.643v.31c0 .844-.224 1.668-.648 2.392l-1.276 2.037a3.5 3.5 0 01-.921 1.023V19.5a2.5 2.5 0 01-2.5 2.5h-8a2.5 2.5 0 01-2.5-2.5V10.979a3.5 3.5 0 01-.921-1.023L2.204 7.92A3.5 3.5 0 011.556 5.527v-.31C1.556 3.822 2.809 2.57 4.199 2.57h3.6l.272-1.95zM9.5 16a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm6 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>
                  SERVER BOOSTER
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 내전 채널 이용 권한 획득 - 고정형 배너 */}
      {isVerified && !hasScrimRole && (
        <div className="relative w-full mb-12 rounded-xl border border-white/10 bg-[#161616] flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="hidden sm:flex shrink-0 items-center justify-center w-9 h-9 rounded-lg bg-[#e91e3f]/10 text-[#e91e3f]">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-[18px] h-[18px]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white mb-0.5 break-keep">내전 채널 이용 권한 획득</h3>
              <p className="text-xs text-gray-500 leading-relaxed break-keep">운영 정책에 동의하고 내전 채널 입장 권한을 획득해 주세요.</p>
            </div>
          </div>
          <button
            onClick={() => router.push("/verify")}
            className="shrink-0 self-center px-4 py-2 bg-[#e91e3f] text-white text-xs font-bold rounded-lg hover:bg-[#d01634] transition-colors outline-none whitespace-nowrap"
          >
            권한 획득
          </button>
        </div>
      )}

      <div className="flex gap-8 border-b border-white/10 mb-8 overflow-x-auto scrollbar-hide">
        {["inquiry", "recruit", "booster"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 text-sm md:text-base font-bold whitespace-nowrap transition-colors relative outline-none ${activeTab === tab ? "text-[#e91e3f]" : "text-gray-400 hover:text-white"}`}>
            {tab === "inquiry" ? "1:1 문의 내역" : tab === "recruit" ? "구인 지원 목록" : "서버 부스터 혜택"}
            {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e91e3f]" />}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "inquiry" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex gap-2 mb-4">
              {[{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }].map(f => (
                <button key={f.key} onClick={() => setInquiryFilter(f.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${inquiryFilter === f.key ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-400 hover:border-white/20"}`}>{f.label}</button>
              ))}
            </div>
            <div className="border-t border-white/5 divide-y divide-white/5">
              {isDataLoading ? <p className="text-gray-600 text-sm py-12 text-center">데이터 로딩 중...</p> : filteredInquiries.length === 0 ? <p className="text-gray-600 text-sm py-12 text-center">등록된 문의 내역이 없습니다.</p> : (
                filteredInquiries.map(inq => (
                  <div key={inq.id} onClick={() => setSelectedInquiry(inq)} className="py-5 px-3 cursor-pointer hover:bg-white/[0.02] rounded-xl transition-colors">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inq.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f]' : 'bg-blue-500/10 text-blue-400'}`}>{inq.status}</span>
                      <span className="text-xs text-gray-600">{inq.date}</span>
                    </div>
                    <h4 className="text-sm font-bold text-white"><span className="text-gray-500 mr-2">[{inq.type}]</span> {inq.title}</h4>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "recruit" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex gap-2 mb-4">
              {[{ label: "전체", key: "all" }, { label: "심사 중", key: "심사 중" }, { label: "합격", key: "합격" }, { label: "불합격", key: "불합격" }].map(f => (
                <button key={f.key} onClick={() => setRecruitFilter(f.key)} className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors ${recruitFilter === f.key ? "bg-white text-black border-white" : "bg-transparent border-white/10 text-gray-400 hover:border-white/20"}`}>{f.label}</button>
              ))}
            </div>
            <div className="border-t border-white/5 divide-y divide-white/5">
              {isDataLoading ? <p className="text-gray-600 text-sm py-12 text-center">데이터 로딩 중...</p> : filteredRecruits.length === 0 ? <p className="text-gray-600 text-sm py-12 text-center">해당 카테고리의 지원 내역이 없습니다.</p> : (
                filteredRecruits.map(rec => (
                  <div key={rec.id} className="py-5 px-1 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-white/[0.01] transition-colors">
                    <div>
                      <h4 className="text-base font-bold text-white mb-1">{rec.title}</h4>
                      <p className="text-xs text-gray-500">분야: <span className="text-gray-300 font-medium">{rec.role}</span> | 일자: {rec.date}</p>
                    </div>
                    <div className="flex gap-3 items-center">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${rec.status === '합격' ? 'bg-green-500/10 text-green-400 border-green-500/20' : rec.status === '취소' || rec.status === '취소/반려' || rec.status === '불합격' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{rec.status}</span>
                      {rec.status === "심사 중" && (
                        <button onClick={() => setCancelConfirmId(rec.id)} className="text-xs font-bold px-3 py-1 bg-[#2a2a2a] text-white hover:bg-[#e91e3f] rounded-full transition-colors outline-none focus:outline-none">지원 취소</button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "booster" && (
          <div className="space-y-12 animate-in fade-in duration-300">
            <div className="border border-white/10 bg-white/[0.01] rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><span className="text-[#e91e3f]">✨</span> SERVER BOOSTER 시스템이란?</h3>
              <p className="text-sm text-gray-400 leading-relaxed">서버의 환경 개선을 위한 직접적인 후원 시스템입니다. 본 서버의 성장을 지원해 주시는 유저분들께 깊은 감사를 드립니다.</p>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-white mb-5 flex items-center gap-3"><span className="w-1.5 h-5 bg-[#e91e3f] rounded-full"></span>01. SERVER 전용 기능 권한</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-white/[0.01] border border-white/5 rounded-xl"><p className="font-bold text-white text-sm mb-1">전용 역할 및 뱃지 지급</p><p className="text-xs text-gray-500">@SERVER BOOSTER 고유 역할 부여 및 차별화된 프로필 전용 특수 배지 자동 장착</p></div>
                <div className="p-5 bg-white/[0.01] border border-white/5 rounded-xl"><p className="font-bold text-white text-sm mb-1">사용자 관리 권한 제공</p><p className="text-xs text-gray-500 mb-2">서버 내 일부 사용자 관리 부가 기능 상시 이용 가능</p></div>
                <div className="p-5 bg-white/[0.01] border border-white/5 rounded-xl"><p className="font-bold text-white text-sm mb-1">권한 제한 채널 이용</p><p className="text-xs text-gray-500 mb-2">별도의 권한 구매 없이 제한된 채널 이용 가능!</p><p className="text-[10px] text-gray-600">* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다.</p></div>
                <div className="p-5 bg-white/[0.01] border border-white/5 rounded-xl"><p className="font-bold text-white text-sm mb-1">슬로우 모드 제한 해제</p><p className="text-xs text-gray-500 mb-2">채팅 대기 시간 제한 없이 연속 채팅 가능!</p><p className="text-[10px] text-gray-600">* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다.</p></div>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-white mb-5 flex items-center gap-3"><span className="w-1.5 h-5 bg-[#e91e3f] rounded-full"></span>02. XP BOOSTER 경험치 혜택</h4>
              <div className="border border-white/5 divide-y divide-white/5 rounded-xl overflow-hidden bg-white/[0.005]">
                <div className="p-5 flex justify-between items-center"><div><p className="font-bold text-white text-sm">WELCOME BOOSTING</p><p className="text-xs text-gray-500 mt-0.5">부스팅 시작 보너스 보상 지급!</p></div><div className="text-right text-xs"><p className="text-white font-bold">최초 부스팅: <span className="text-[#e91e3f]">100,000 XP</span> 즉시 지급!</p><p className="text-gray-500">추가 부스팅: 개당 <span className="text-white">50,000 XP</span> 추가 지급!</p></div></div>
                <div className="p-5 flex justify-between items-center"><div><p className="font-bold text-white text-sm">PASSIVE</p><p className="text-xs text-gray-500 mt-0.5">경험치 획득 조건 충족 시 상시 추가!</p></div><div className="text-right text-xs"><p className="text-[#e91e3f] font-bold">상시 <span className="text-white">+2,000 XP</span> 추가 지급!</p></div></div>
                <div className="p-5 flex justify-between items-center"><div><p className="font-bold text-white text-sm">SHOP</p><p className="text-xs text-gray-500 mt-0.5">경험치샵 이용 전용 정산 혜택!</p></div><div className="text-right text-xs"><p className="text-white font-bold">사용 금액의 <span className="text-[#e91e3f]">35% XP</span> 환급!</p></div></div>
                <div className="p-5 flex justify-between items-center"><div><p className="font-bold text-white text-sm">DAILY</p><p className="text-xs text-gray-500 mt-0.5">일일 출석체크 추가 보상!</p></div><div className="text-right text-xs"><p className="text-white font-bold">일일 출석체크 시 <span className="text-[#e91e3f]">10,000 XP</span> 보너스 추가!</p></div></div>
              </div>
            </div>
            
            <div>
              <h4 className="text-lg font-bold text-white mb-5 flex items-center gap-3"><span className="w-1.5 h-5 bg-[#e91e3f] rounded-full"></span>03. 누적 유지 개월별 추가 혜택 (RANK)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {[{ r: "RANK 01", m: "1개월", x: "100,000 XP" }, { r: "RANK 02", m: "3개월", x: "300,000 XP" }, { r: "RANK 03", m: "6개월", x: "600,000 XP" }, { r: "RANK 04", m: "9개월", x: "900,000 XP" }, { r: "RANK 06", m: "15개월", x: "1,500,000 XP" }, { r: "RANK 07", m: "18개월", x: "1,800,000 XP" }, { r: "RANK 08", m: "21개월", x: "2,100,000 XP" }, { r: "RANK 09", m: "24개월", x: "2,400,000 XP" }].map((item, idx) => (
                  <div key={idx} className="p-4 border border-white/5 bg-white/[0.005] rounded-xl text-center flex flex-col justify-center"><p className="text-[10px] font-bold text-gray-600 mb-0.5">{item.r}</p><p className="text-sm font-black text-white mb-1">{item.m}</p><p className="text-xs font-bold text-[#e91e3f]">{item.x}</p></div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div className="p-4 border border-[#e91e3f]/30 bg-[#e91e3f]/5 rounded-xl flex flex-col justify-center"><p className="text-[10px] font-bold text-[#e91e3f] mb-0.5">RANK 05 SPECIAL BLOCK</p><p className="text-sm font-black text-white mb-2">🏆 12개월 연속 달성</p><div className="text-xs text-gray-400 space-y-1 text-left pl-1"><p>• 누적 보너스 <span className="text-white font-bold">1,200,000 XP</span> 즉시 수령</p><p>• <strong>@BOOSTER RANK 05</strong> 역할 추가 지급</p><p>• 상시 고정 버프 <strong>+2,000 XP</strong> 추가 영구 결합</p><p>• 일일 출석 시 <span className="text-white font-bold">2,000 XP</span> 영구 가산 누적 지급</p></div></div>

                <div className="p-4 border border-[#e91e3f]/30 bg-[#e91e3f]/5 rounded-xl flex flex-col justify-center"><p className="text-[10px] font-bold text-[#e91e3f] mb-0.5">RANK 10 SPECIAL BLOCK</p><p className="text-sm font-black text-white mb-2">👑 24개월 연속 달성</p><div className="text-xs text-gray-400 space-y-1 text-left pl-1"><p>• 누적 보너스 <span className="text-white font-bold">2,400,000 XP</span> 즉시 수령</p><p>• <strong>@BOOSTER RANK 10</strong> 특수 역할 추가 지급</p><p>• 상시 고정 버프 <strong>+4,000 XP</strong> 추가 영구 결합</p><p>• 일일 출석 시 <span className="text-white font-bold">5,000 XP</span> 영구 가산 누적 지급</p></div></div>
              </div>
            </div>
            <div className="text-center pt-4 border-t border-white/10"><p className="text-sm text-gray-300 font-bold">📢 디스코드 서버 부스트 진행 시 시스템이 자동으로 감지하여 모든 혜택을 즉시 지급합니다!</p></div>
          </div>
        )}
      </div>

      {selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-white/10 rounded-3xl w-full max-w-2xl h-[600px] max-h-[80vh] shadow-2xl relative flex flex-col overflow-hidden">
            <div className="p-8 pb-6 shrink-0 border-b border-white/10 relative">
              <button onClick={() => setSelectedInquiry(null)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full transition-colors outline-none focus:outline-none">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded mb-4 inline-block ${selectedInquiry.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f]' : 'bg-blue-500/10 text-blue-400'}`}>
                {selectedInquiry.status}
              </span>
              <h3 className="text-xl font-bold text-white pr-12 break-words leading-snug">
                {selectedInquiry.title}
              </h3>
            </div>
            
            <div className="p-8 pt-8 overflow-y-auto flex-1 flex flex-col [&::-webkit-scrollbar]:hidden">
              <div className="flex flex-col gap-4 mb-8 bg-[#1a1a1a] rounded-xl p-6 border border-white/5 shadow-inner">
                <div className="flex justify-between items-center text-xs w-full">
                  <span className="text-gray-500 font-bold shrink-0">문의 접수일시</span>
                  <span className="text-gray-300 font-bold text-right">{selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString() : selectedInquiry.date}</span>
                </div>
                {selectedInquiry.status === '답변 완료' && (
                  <div className="flex justify-between items-center text-xs pt-4 border-t border-white/5 w-full">
                    <span className="text-[#e91e3f] font-bold shrink-0">답변 완료일시</span>
                    <span className="text-gray-300 font-bold text-right">{selectedInquiry.answeredAt ? new Date(selectedInquiry.answeredAt).toLocaleString() : selectedInquiry.updatedAt ? new Date(selectedInquiry.updatedAt).toLocaleString() : "처리 완료"}</span>
                  </div>
                )}
              </div> 
              
              <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap flex-1 px-1">
                {selectedInquiry.content}
              </div>
              
              {selectedInquiry.answer && (
                <div className="mt-8 bg-[#e91e3f]/5 border border-[#e91e3f]/20 p-6 rounded-2xl text-sm shrink-0">
                  <span className="block text-xs font-black text-[#e91e3f] tracking-wide mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>관리자 답변
                  </span>
                  <p className="text-gray-300 leading-relaxed break-words">{selectedInquiry.answer}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {cancelConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-3">지원 취소 확인</h2>
            <p className="text-sm text-gray-400 mb-8 leading-relaxed">정말로 지원을 취소하시겠습니까?<br/>취소 후에는 다시 지원해야 합니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setCancelConfirmId(null)} className="flex-1 py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">닫기</button>
              <button onClick={executeCancelApply} className="flex-1 py-3 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-colors shadow-lg shadow-[#e91e3f]/20">취소하기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}