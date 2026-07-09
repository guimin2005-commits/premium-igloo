"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function VerifyPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [agreements, setAgreements] = useState({ rules: false, privacy: false, caution: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [openTab, setOpenTab] = useState<string | null>(null);
  const [savedScrimChoice, setSavedScrimChoice] = useState(false);
  const [friendCode, setFriendCode] = useState("");

  const isAllChecked = agreements.rules && agreements.privacy && agreements.caution;
  
  const isRevisiting = (session?.user as any)?.isVerified === true;

  useEffect(() => {
    if (status === "authenticated") {
      const isVerified = (session?.user as any)?.isVerified;
      const hasScrimRole = (session?.user as any)?.hasScrimRole;

      if (isVerified && hasScrimRole && !isSuccessModalOpen) {
        router.replace("/");
      } else if (isVerified && !hasScrimRole && step === 1) {
        setStep(2);
      }
    }
  }, [status, session, isSuccessModalOpen, router, step]);

  const handleAllCheck = () => {
    const newValue = !isAllChecked;
    setAgreements({ rules: newValue, privacy: newValue, caution: newValue });
    setOpenTab(null);
  };

  const handleCheck = (key: string) => {
    setAgreements((prev: any) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTab = (tab: string) => {
    setOpenTab(openTab === tab ? null : tab);
  };

  const handleNextStep = () => {
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async (acceptScrim: boolean) => {
    const userId = (session?.user as any)?.id;
    if (!userId) {
      setErrorMessage("사용자 정보를 찾을 수 없습니다.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: userId, acceptScrim: acceptScrim }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // 친구 초대 코드를 입력했다면 함께 등록 (실패해도 인증은 진행)
        if (friendCode.trim()) {
          try {
            await fetch("/api/referral", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: friendCode, userId, userName: session?.user?.name }),
            });
          } catch { /* 인증 흐름을 막지 않음 */ }
        }
        setSavedScrimChoice(acceptScrim);
        setIsSuccessModalOpen(true);
      } else {
        setErrorMessage(`오류 발생: ${data.error}`);
        setStep(1); 
      }
    } catch (error) {
      setErrorMessage("서버 요청 중 오류가 발생했습니다.");
      setStep(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (status === "loading") return <div className="min-h-screen bg-[#090909] text-white flex justify-center items-center">로딩 중...</div>;
  if (status === "unauthenticated") {
    router.push("/");
    return null;
  }

  // 📌 디스코드 서버에 입장하지 않은 유저 — 입장 안내 화면
  if ((session?.user as any)?.isGuildMember === false) {
    return (
      <div className="w-full flex-1 bg-[#090909] text-white flex flex-col items-center justify-center py-24 px-6 relative min-h-[70vh]">
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[500px] h-[280px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="relative z-10 text-center max-w-md">
          <p className="text-5xl mb-8">🧊</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="w-8 h-px bg-[#e91e3f]"></span>
            <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Join Required</span>
            <span className="w-8 h-px bg-[#e91e3f]"></span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-4">아직 이글루에 입장하지 않으셨네요!</h1>
          <p className="text-sm text-gray-400 leading-relaxed mb-10">
            사이트의 모든 기능을 이용하시려면<br />
            먼저 <span className="text-white font-bold">고급 이글루 디스코드 서버</span>에 입장해야 합니다.<br />
            입장 후 아래 버튼으로 다시 확인해주세요.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://discord.gg/V2uW2nUczU"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#5865F2]/20"
            >
              디스코드 서버 입장하기
            </a>
            <button
              onClick={() => signIn("discord", { callbackUrl: "/verify" })}
              className="w-full py-4 bg-white/[0.04] border border-white/10 text-white font-bold rounded-2xl hover:bg-white/[0.08] hover:border-white/25 transition-all"
            >
              입장 완료 — 다시 확인하기
            </button>
          </div>
          <p className="text-[11px] text-gray-600 mt-6">서버 입장 후 &lsquo;다시 확인하기&rsquo;를 누르면 인증 절차가 시작됩니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 bg-[#090909] text-white flex flex-col items-center py-16 px-4 relative">
      <div className="w-full max-w-2xl bg-[#090909] p-2 relative overflow-hidden">
        
        <div className="w-full h-0.5 bg-white/10 rounded-full mb-12">
          <div className={`h-full bg-[#e91e3f] transition-all duration-500 rounded-full ${step === 1 ? 'w-1/2' : 'w-full'}`}></div>
        </div>

        {errorMessage && (
          <div className="mb-6 mt-4 p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-400 text-sm text-center font-bold">
            {errorMessage}
          </div>
        )}

        {step === 1 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="mb-12">
              <h1 className="text-3xl font-black mb-3 tracking-tight text-white">서버 이용 동의</h1>
              <p className="text-gray-400 text-sm">고급 이글루의 원활한 이용을 위해 아래 약관에 동의해 주세요.</p>
            </div>

            <div onClick={handleAllCheck} className="flex items-center gap-3 py-4 mb-6 cursor-pointer group w-fit">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors border-2 ${isAllChecked ? 'bg-[#e91e3f] border-[#e91e3f]' : 'bg-transparent border-gray-600 group-hover:border-gray-400'}`}>
                {isAllChecked && <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <span className={`font-bold text-lg transition-colors ${isAllChecked ? 'text-white' : 'text-gray-400 group-hover:text-gray-200'}`}>
                모든 필수 약관에 동의합니다.
              </span>
            </div>

            <div className="flex flex-col mb-10 border-t border-white/10">
              <div className="border-b border-white/10">
                <div className="flex items-center justify-between py-5 cursor-pointer hover:bg-white/[0.02] px-2 transition-colors" onClick={() => toggleTab('rules')}>
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={(e) => { e.stopPropagation(); handleCheck("rules"); }}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${agreements.rules ? 'bg-[#e91e3f] border-[#e91e3f]' : 'bg-transparent border-gray-600'}`}
                    >
                      {agreements.rules && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="font-semibold text-gray-200 select-none">
                      <span className="text-[#e91e3f] mr-1.5">[필수]</span> 커뮤니티 이용 규칙 동의
                    </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${openTab === 'rules' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {openTab === 'rules' && (
                  <div className="px-10 pb-6 text-sm text-gray-400 space-y-3">
                    <p className="text-gray-300 font-semibold">건전한 커뮤니티 조성을 위해 아래 행위를 금지합니다.</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 소란 행위 및 도배: 동일·유사 메시지·이미지·이모지를 연속 게시하여 대화를 방해하는 행위(소음·멘션 테러 포함)</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 불법 및 유해 정보 유포: 성인물, 잔혹 매체, 저작권 침해 자료, 불법 도박 링크 공유</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 개인정보 침해: 당사자 동의 없이 타인의 사생활 정보를 유포·추적하는 행위</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 무단 홍보 및 상업적 활동: 운영진 승인 없는 타 서버·제품 홍보 및 금전 거래 유도</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 계정 도용 및 사칭: 타인·운영진의 닉네임·프로필·역할 사칭</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 친목질 및 파벌 조성: 과도한 사적 친목으로 분란을 일으키거나 신규 멤버에게 소외감을 주는 행위</p>
                  </div>
                )}
              </div>

              <div className="border-b border-white/10">
                <div className="flex items-center justify-between py-5 cursor-pointer hover:bg-white/[0.02] px-2 transition-colors" onClick={() => toggleTab('privacy')}>
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={(e) => { e.stopPropagation(); handleCheck("privacy"); }}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${agreements.privacy ? 'bg-[#e91e3f] border-[#e91e3f]' : 'bg-transparent border-gray-600'}`}
                    >
                      {agreements.privacy && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="font-semibold text-gray-200 select-none">
                      <span className="text-[#e91e3f] mr-1.5">[필수]</span> 개인정보 수집 및 이용 동의
                    </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${openTab === 'privacy' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {openTab === 'privacy' && (
                  <div className="px-10 pb-6 text-sm text-gray-400 space-y-3">
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">수집 항목:</span> 디스코드 고유 ID(Snowflake), 닉네임 및 사용자명, 프로필 이미지, 서버 내 활동 로그, 입·퇴장 일시, 보유 역할 정보</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">수집 방법:</span> 디스코드 API 및 서버 관리용 봇(Bot)을 통한 자동 수집</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">이용 목적:</span> 멤버 식별 및 본인 확인, 악성 유저 방지 및 운영정책 위반 조사·제재, 이벤트 진행 및 보상 지급, 통계 분석 및 서비스 개선</p>
                    <p className="text-gray-500 text-xs">※ 주민등록번호·금융정보 등 민감 정보는 직접 수집하지 않습니다.</p>
                  </div>
                )}
              </div>

              <div className="border-b border-white/10">
                <div className="flex items-center justify-between py-5 cursor-pointer hover:bg-white/[0.02] px-2 transition-colors" onClick={() => toggleTab('caution')}>
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={(e) => { e.stopPropagation(); handleCheck("caution"); }}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${agreements.caution ? 'bg-[#e91e3f] border-[#e91e3f]' : 'bg-transparent border-gray-600'}`}
                    >
                      {agreements.caution && <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="font-semibold text-gray-200 select-none">
                      <span className="text-[#e91e3f] mr-1.5">[필수]</span> 규정 위반 시 제재 사항 확인
                    </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${openTab === 'caution' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                </div>
                {openTab === 'caution' && (
                  <div className="px-10 pb-6 text-sm text-gray-400 space-y-3 leading-relaxed">
                    <p>운영정책 위반 시 경중에 따라 다음과 같은 제재가 단계적으로 적용될 수 있습니다.</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 주의 및 경고: 경미한 위반 시 구두 주의 또는 시스템 경고 부여</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 타임 아웃: 일정 시간 동안 채팅·음성 채널 이용 권한 박탈</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 추방: 서버에서 강제 퇴장 처리 (재입장 가능)</p>
                    <p className="flex items-start gap-2"><span className="text-[#e91e3f] font-bold shrink-0">·</span> 차단: 영구 강제 퇴장 및 재입장 차단</p>
                    <p className="text-[#e91e3f] font-medium">※ 중대한 위반(범죄 행위, 서버 테러 등)의 경우 경고 절차 없이 즉시 영구 차단될 수 있습니다.</p>
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={handleNextStep} 
              disabled={!isAllChecked}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all outline-none focus:outline-none ${isAllChecked ? 'bg-[#e91e3f] hover:bg-[#d01634] text-white shadow-lg shadow-[#e91e3f]/20' : 'bg-white/5 text-gray-600 cursor-not-allowed'}`}
            >
              다음
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="mb-10">
              <h1 className="text-3xl font-black mb-3 tracking-tight text-white flex items-baseline gap-2">
                내전 채널 이용 인증
                <span className="text-[#e91e3f] text-sm font-bold align-middle bg-[#e91e3f]/10 px-2 py-0.5 rounded">선택</span>
              </h1>
              <p className="text-gray-400 text-sm">내전 참가를 위해, 아래 운영 정책을 확인해 주세요.</p>
            </div>

            <div className="flex flex-col gap-6 mb-10">
              <div className="border-l-2 border-[#e91e3f] pl-4">
                <h3 className="font-bold text-white mb-1">01. 참여 규정</h3>
                <p className="text-sm text-gray-400 leading-relaxed">모든 인원은 내전을 자유롭게 주최 및 참여할 수 있습니다. 참가 확정 인원은 지정된 시간을 엄수해야 하며, 무단 불참이나 상습적인 지각 시에는 참여 권한이 제한될 수 있습니다.</p>
              </div>
              <div className="border-l-2 border-[#e91e3f] pl-4">
                <h3 className="font-bold text-white mb-1">02. 상호 존중 및 매너 준수</h3>
                <p className="text-sm text-gray-400 leading-relaxed">모든 내전은 상호 존중을 바탕으로 진행하며, 상대방에게 불쾌감을 주는 행위(비하 발언, 티배깅 등)를 엄격히 금지합니다.</p>
              </div>
              <div className="border-l-2 border-[#e91e3f] pl-4">
                <h3 className="font-bold text-white mb-1">03. 분쟁 규정</h3>
                <p className="text-sm text-gray-400 leading-relaxed">분쟁 발생 시 직접 대응을 금하며, 반드시 웹사이트의 <span className="text-white font-semibold">문의</span> 채널을 통해 접수해야 합니다. 모든 사안은 관리자 판단 하에 검토되며, 규정 위반 시 즉각 제재됩니다.</p>
              </div>
              <div className="border-l-2 border-[#e91e3f] pl-4">
                <h3 className="font-bold text-white mb-1">04. 채널 이용</h3>
                <p className="text-sm text-gray-400 leading-relaxed">내전은 반드시 지정된 <span className="text-white font-semibold">내전 전용 음성 채널</span>에서만 진행해야 하며, 내전 목적 외 해당 채널의 사적 이용은 제한됩니다.</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-5 mb-8 text-sm text-gray-300 leading-relaxed">
              {!isRevisiting && (
                <p className="mb-4">
                  운영 정책에 동의하지 않으실 경우 내전 참가가 제한됩니다.<br/>
                  <span className="text-[#e91e3f] font-bold">추후 내 정보 페이지에서 언제든지 동의 후 권한을 획득하실 수 있습니다.</span>
                </p>
              )}
              <div className={`text-xs text-gray-500 ${!isRevisiting ? 'border-t border-white/10 pt-4 mt-2' : ''}`}>
                <p className="mb-1"><span className="text-[#e91e3f] font-bold">[주의]</span> 위 운영 정책 미확인으로 인해 발생하는 불이익이나 제재에 대한 책임은 이용자 본인에게 있습니다.</p>
                <p>원활한 내전 진행 환경을 위해 참가 권한 획득 전 반드시 상세 내용을 다시 한 번 확인해 주시기 바랍니다.</p>
              </div>
            </div>

            {!isRevisiting && (
              <div className="bg-[#161213] border border-[#e91e3f]/20 rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-black tracking-widest text-[#e91e3f] uppercase">Invite Event</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e91e3f]/10 text-[#e91e3f]">선택</span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">친구 초대 코드가 있으신가요?</h3>
                <p className="text-xs text-gray-500 mb-3">친구에게 받은 코드를 입력하면 웰컴 보상을 받습니다. (나중에 친구 초대 메뉴에서도 입력 가능)</p>
                <input
                  value={friendCode}
                  onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  placeholder="친구 초대 코드 (선택)"
                  className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white text-sm font-mono tracking-widest uppercase outline-none focus:border-[#e91e3f] transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:normal-case placeholder:text-gray-600"
                />
              </div>
            )}

            <div className="flex flex-col gap-3 mt-4">
              <button 
                onClick={() => handleFinalSubmit(true)} 
                disabled={isSubmitting}
                className="w-full py-4 bg-[#e91e3f] text-white font-bold text-lg rounded-xl hover:bg-[#d01634] transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none flex items-center justify-center"
              >
                {isSubmitting ? "처리 중..." : "동의"}
              </button>
              
              {isRevisiting ? (
                <button 
                  onClick={() => router.push("/profile")} 
                  disabled={isSubmitting}
                  className="w-full py-3 text-gray-500 hover:text-white text-sm font-medium transition-colors outline-none focus:outline-none"
                >
                  취소(내 정보 돌아가기)
                </button>
              ) : (
                <button 
                  onClick={() => handleFinalSubmit(false)} 
                  disabled={isSubmitting}
                  className="w-full py-3 text-gray-500 hover:text-white text-sm font-medium transition-colors outline-none focus:outline-none"
                >
                  동의하지 않고 기본 권한만 받기
                </button>
              )}
            </div>

          </div>
        )}
      </div>

      {isSuccessModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#1e1e1e] border border-[#e91e3f]/40 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl transform transition-all scale-100 animate-in zoom-in-95 duration-300">
            <div className="mx-auto w-20 h-20 bg-[#e91e3f]/10 border border-[#e91e3f]/20 rounded-full flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-[#e91e3f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-white mb-2">
              {isRevisiting ? "권한 획득 완료!" : "인증 완료"}
            </h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              {isRevisiting ? (
                <>내전 채널 이용 권한이 부여되었습니다.<br/>이제 내전에 참가하실 수 있습니다.</>
              ) : (
                <>환영합니다!<br/>고급 이글루 서버를 이용하실 수 있습니다.</>
              )}
            </p>
            <button 
              onClick={async () => {
                await update({ isVerified: true, hasScrimRole: savedScrimChoice });
                setIsSuccessModalOpen(false);
                router.replace(isRevisiting ? "/profile" : "/");
              }}
              className="w-full py-3.5 bg-[#e91e3f] text-white font-bold rounded-xl hover:bg-[#d01634] transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none"
            >
              {isRevisiting ? "내 정보로 돌아가기" : "메인으로 이동"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}