"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";

const ADMIN_USERS = ["elahw.06"];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isGuestInquiryOpen, setIsGuestInquiryOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [voucherCode, setVoucherCode] = useState("");
  const [codeResult, setCodeResult] = useState<{isOpen: boolean, message: string, isError: boolean}>({isOpen: false, message: "", isError: false});

  const [guestContent, setGuestContent] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [mounted, setMounted] = useState(false);
  
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const pathname = usePathname();
  const router = useRouter();
  
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const isVerifyPage = pathname === "/verify";
  const userSession = session?.user as any;
  const isVerified = userSession?.isVerified;
  const hasScrimRole = userSession?.hasScrimRole;
  const isBooster = userSession?.isBooster || false;
  const isAdmin = status === "authenticated" && userSession?.name && ADMIN_USERS.includes(userSession.name);

  const [isCodeSubmitting, setIsCodeSubmitting] = useState(false);

  const categories = [
    { name: "공지사항", path: "/notice" },
    { name: "이벤트", path: "/event" },
    { name: "SYSTEM : LEVEL", path: "/level" },
    { name: "대회", path: "/tournament" }, 
    { name: "구인", path: "/recruit" },
    { name: "1:1 문의", path: "/support" },
    { name: "FAQ", path: "/faq" }
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    if (isProfileOpen) { document.addEventListener("mousedown", handleClickOutside); }
    return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [isProfileOpen]);

  useEffect(() => {
    setMounted(true);
    if (error === "AccessDenied") { alert("접근이 거부되었습니다."); setIsLoginModalOpen(false); }
  }, [error]);

  useEffect(() => { setIsMobileMenuOpen(false); }, [pathname]);

  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      if (isVerified === false && !isVerifyPage) router.push("/verify");
      else if (isVerified === true && hasScrimRole === true && isVerifyPage) router.replace("/");
    }
  }, [status, session, pathname, router, isVerified, hasScrimRole, isVerifyPage]);

  const handleGuestInquiry = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const inquiryData = { user: "비회원 (게스트)", mainType: "비회원 문의", content: guestContent, email: guestEmail };
    const res = await fetch("/api/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inquiryData) });
    if (res.ok) { alert("문의가 접수되었습니다."); setIsGuestInquiryOpen(false); setGuestContent(""); setGuestEmail(""); } 
    else { alert("오류가 발생했습니다."); }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim() || isCodeSubmitting) return;
    setIsCodeSubmitting(true);
    try {
      const res = await fetch("/api/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: voucherCode,
          userId: (session?.user as any)?.id,
          userName: session?.user?.name,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCodeResult({ isOpen: true, message: data.message || "코드가 정상적으로 등록되었습니다.", isError: false });
      } else {
        setCodeResult({ isOpen: true, message: data.message || "유효하지 않은 코드입니다.", isError: true });
      }
    } catch {
      setCodeResult({ isOpen: true, message: "서버와 통신하는 중 오류가 발생했습니다.", isError: true });
    } finally {
      setIsCodeSubmitting(false);
      setVoucherCode("");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#090909]">
      <header className="sticky top-0 z-40 bg-[#090909]/80 backdrop-blur-md border-b border-white/10 px-6 h-16 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between relative h-full">
          <div className="flex-1 flex items-center z-10">
            {isVerifyPage ? (
              <span className="text-xl font-black tracking-widest text-white cursor-default select-none">고급 이글루</span>
            ) : (
              <Link href="/" className="text-xl font-black tracking-widest text-white hover:text-gray-300 transition-colors">고급 이글루</Link>
            )}
          </div>
          
          {/* 비로그인(게스트) 또는 인증 유저에게만 카테고리 노출 (로그인 후 미인증 유저는 숨김 → /verify로 유도) */}
          {!isVerifyPage && (status !== "authenticated" || isVerified) && (
            <nav className="hidden md:flex items-center justify-center gap-8 text-sm font-bold absolute left-1/2 transform -translate-x-1/2 h-full z-50">
              {categories.map((category) => {
                const isActive = pathname === category.path;
                return (
                  <Link key={category.path} href={category.path} className={`relative h-full flex items-center px-2 transition-colors outline-none focus:outline-none ${isActive ? "text-[#e91e3f]" : "text-gray-400 hover:text-white"}`}>
                    {category.name}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e91e3f]" />}
                  </Link>
                );
              })}
            </nav>
          )}
          
          <div className="flex-1 flex justify-end items-center gap-4 h-full relative z-10">
            {!mounted || status === "loading" ? (
               <div className="w-20 h-8"></div>
            ) : status === "authenticated" && session ? (
              <div className="relative flex items-center h-full" ref={profileDropdownRef}>
                <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="hidden md:flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-colors outline-none focus:outline-none">
                  <img src={session.user?.image || ""} alt="Profile" className={`w-8 h-8 rounded-full bg-gray-700 transition-all ${isBooster ? 'ring-2 ring-[#e91e3f]/60 ring-offset-2 ring-offset-[#090909]' : ''}`} />
                  <div className="flex items-center gap-2 ml-1">
                    <span className="text-sm font-bold text-white">{session.user?.name}</span>
                    {isVerified && hasScrimRole ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-green-400"><path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" /></svg>
                    ) : isVerified ? (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-yellow-400"><path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-red-400"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" /></svg>
                    )}
                  </div>
                </button>
                
                {isProfileOpen && (
                  <div className="absolute top-[60px] right-0 z-50 w-64 bg-[#1e1e1e] border border-white/10 rounded-2xl shadow-2xl p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-4 mb-4 pb-4 border-b border-white/5 relative">
                      <img src={session.user?.image || ""} alt="Profile" className={`w-12 h-12 rounded-full bg-gray-700 ${isBooster ? 'ring-2 ring-[#e91e3f]/60 ring-offset-2 ring-offset-[#1e1e1e]' : ''}`} />
                      <div>
                        <div className="font-bold text-white text-base flex items-center gap-2">{session.user?.name}</div>
                        <div className="mt-1.5 flex items-center">
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
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      {!isVerifyPage && (
                        <Link href="/profile" onClick={() => setIsProfileOpen(false)} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium">내 정보</Link>
                      )}
                      {!isVerifyPage && isVerified && (
                        <Link href="/invite" onClick={() => setIsProfileOpen(false)} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium">친구 초대 이벤트</Link>
                      )}
                      {isAdmin && (
                        <Link href="/admin" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-[#e91e3f] hover:bg-[#e91e3f]/10 rounded-lg transition-colors font-bold">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
                          관리자 페이지
                        </Link>
                      )}
                      {/* 미인증 유저는 코드 등록 버튼 숨김 */}
                      {isVerified && (
                        <button onClick={() => { setIsProfileOpen(false); setIsCodeModalOpen(true); }} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors outline-none font-medium">코드 등록</button>
                      )}
                      <button onClick={() => { setIsProfileOpen(false); signOut(); }} className="w-full text-left px-3 py-2 text-sm text-[#e91e3f] hover:bg-[#e91e3f]/10 rounded-lg transition-colors outline-none focus:outline-none font-bold">로그아웃</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setIsLoginModalOpen(true)} className="flex items-center gap-2 px-4 md:px-5 py-2 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">로그인</button>
            )}

            {!isVerifyPage && mounted && (
              <button onClick={() => setIsMobileMenuOpen(true)} aria-label="메뉴 열기" className="pc-hidden md:hidden p-2 -mr-1 text-gray-300 hover:text-white transition-colors outline-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col w-full relative z-0">
        {children}
      </main>

      <footer className="w-full border-t border-white/5 bg-[#090909] mt-auto flex-shrink-0 hidden md:block relative overflow-hidden">
        <div className="absolute bottom-[-80px] left-1/2 -translate-x-1/2 w-[500px] h-[160px] bg-[#e91e3f]/[0.04] blur-[90px] rounded-full pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-6 py-10 relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-base font-black tracking-widest text-white mb-1">고급 이글루</div>
              <div className="text-[9px] font-bold tracking-[0.35em] text-gray-600 uppercase">Premium Igloo Community</div>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://discord.gg/V2uW2nUczU" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-white transition-colors font-medium">Discord</a>
              <Link href="/faq" className="text-xs text-gray-500 hover:text-white transition-colors font-medium">FAQ</Link>
              <Link href="/policy" className="text-xs text-gray-500 hover:text-white transition-colors font-medium">이용약관 및 개인정보처리방침</Link>
            </div>
          </div>
          <div className="h-px w-full bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-6"></div>
          <p className="text-[11px] text-gray-700 font-medium tracking-wide leading-relaxed">
            © 2026 Premium Igloo. All rights reserved. Unauthorized reproduction or redistribution is strictly prohibited.
          </p>
        </div>
      </footer>

      {isCodeModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl relative p-8">
            <button onClick={() => setIsCodeModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-xl font-bold text-white mb-2">코드 등록</h2>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">상품 또는 혜택 수령을 위한 코드를 입력해주세요.</p>
            
            {codeResult.isOpen ? (
              <div className="text-center py-4">
                <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-4 ${codeResult.isError ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-400"}`}>
                  {codeResult.isError ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  )}
                </div>
                <p className="text-xs font-bold text-gray-500 mb-1.5">{codeResult.isError ? "등록 실패" : "등록 완료"}</p>
                <p className="text-sm font-bold text-white mb-6 leading-relaxed whitespace-pre-line">{codeResult.message}</p>
                <button onClick={() => setCodeResult({isOpen: false, message: "", isError: false})} className="w-full py-3 bg-[#2a2a2a] hover:bg-[#333] text-white font-bold rounded-xl transition-colors">다시 입력</button>
              </div>
            ) : (
              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-4">
                <input type="text" required placeholder="코드를 입력하세요" value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} className="w-full px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-[#e91e3f] transition-colors uppercase placeholder:normal-case" />
                <button type="submit" disabled={isCodeSubmitting} className="w-full py-3 mt-2 bg-[#e91e3f] hover:bg-[#d01634] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20 outline-none">{isCodeSubmitting ? "확인 중..." : "등록하기"}</button>
                {isAdmin && (
                  <Link href="/code" onClick={() => setIsCodeModalOpen(false)} className="text-center text-xs text-gray-500 hover:text-white transition-colors font-medium">코드 관리 (관리자) →</Link>
                )}
              </form>
            )}
          </div>
        </div>
      )}

      {isLoginModalOpen && !isGuestInquiryOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button onClick={() => setIsLoginModalOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="p-8 text-center">
              <h2 className="text-2xl font-bold text-white mb-2">로그인</h2>
              <p className="text-sm text-gray-400 mb-8 leading-relaxed">고급 이글루의 모든 기능을 이용하시려면<br/>디스코드 계정으로 로그인해주세요.</p>
              <button onClick={() => signIn("discord", { callbackUrl: "/" })} className="w-full flex items-center justify-center gap-3 py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">Discord 로그인</button>
              <button onClick={() => setIsGuestInquiryOpen(true)} className="mt-6 text-sm text-gray-400 hover:text-white underline underline-offset-4 outline-none focus:outline-none transition-colors">비회원으로 문의하시겠습니까?</button>
            </div>
          </div>
        </div>
      )}

      {isGuestInquiryOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative p-8">
            <button onClick={() => {setIsGuestInquiryOpen(false); setIsLoginModalOpen(false);}} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white bg-black/20 rounded-full transition-colors outline-none focus:outline-none">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-xl font-bold text-white mb-2">비회원 문의</h2>
            <form onSubmit={handleGuestInquiry} className="flex flex-col gap-4 mt-6">
              <input type="email" required placeholder="답변 받을 이메일 주소" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className="w-full px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none focus:border-[#e91e3f] transition-colors" />
              <textarea required placeholder="문의 내용을 상세히 적어주세요." rows={4} value={guestContent} onChange={(e) => setGuestContent(e.target.value)} className="w-full px-4 py-3 bg-[#121212] border border-white/10 rounded-xl text-white text-sm outline-none resize-none focus:border-[#e91e3f] transition-colors" />
              <button type="submit" className="w-full py-3 mt-2 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#e91e3f]/20 outline-none focus:outline-none">문의 접수하기</button>
            </form>
          </div>
        </div>
      )}

      {/* 모바일 슬라이드 메뉴 (항상 최상위 + DOM 최하단 배치로 클릭/스택 보장) */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[200]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[80%] max-w-xs bg-[#121212] border-l border-white/10 shadow-2xl flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between px-6 h-16 border-b border-white/10 shrink-0">
              <span className="text-lg font-black tracking-widest text-white">메뉴</span>
              <button onClick={() => setIsMobileMenuOpen(false)} aria-label="메뉴 닫기" className="p-2 -mr-2 text-gray-400 hover:text-white transition-colors outline-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 flex flex-col p-5 gap-1">
              {status === "authenticated" && session && (
                <div className="flex items-center gap-3 p-3 mb-3 bg-white/[0.03] rounded-2xl">
                  <img src={session.user?.image || ""} alt="Profile" className={`w-11 h-11 rounded-full bg-gray-700 ${isBooster ? 'ring-2 ring-[#e91e3f]/60 ring-offset-2 ring-offset-[#121212]' : ''}`} />
                  <div className="min-w-0">
                    <p className="font-bold text-white text-sm truncate">{session.user?.name}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold ${isVerified && hasScrimRole ? 'bg-green-500/10 text-green-400' : isVerified ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>{isVerified && hasScrimRole ? "인증" : isVerified ? "일부 인증" : "미인증"}</span>
                  </div>
                </div>
              )}

              {!isVerifyPage && (status !== "authenticated" || isVerified) && (
                <>
                  <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wider px-3 mb-1">카테고리</p>
                  {categories.map((category) => {
                    const isActive = pathname === category.path;
                    return (
                      <Link key={category.path} href={category.path} onClick={() => setIsMobileMenuOpen(false)} className={`px-3 py-3 rounded-xl text-sm font-bold transition-colors ${isActive ? "bg-[#e91e3f]/10 text-[#e91e3f]" : "text-gray-300 hover:bg-white/5 hover:text-white"}`}>{category.name}</Link>
                    );
                  })}
                </>
              )}

              <div className="mt-auto pt-4 border-t border-white/10 flex flex-col gap-1">
                {status === "authenticated" && session ? (
                  <>
                    {!isVerifyPage && (
                      <Link href="/profile" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors">내 정보</Link>
                    )}
                    {!isVerifyPage && isVerified && (
                      <Link href="/invite" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors">친구 초대 이벤트</Link>
                    )}
                    {isAdmin && (
                      <Link href="/admin" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 rounded-xl text-sm font-bold text-[#e91e3f] hover:bg-[#e91e3f]/10 transition-colors">관리자 페이지</Link>
                    )}
                    {isVerified && (
                      <button onClick={() => { setIsMobileMenuOpen(false); setIsCodeModalOpen(true); }} className="text-left px-3 py-3 rounded-xl text-sm font-medium text-gray-300 hover:bg-white/5 hover:text-white transition-colors outline-none">코드 등록</button>
                    )}
                    <button onClick={() => { setIsMobileMenuOpen(false); signOut(); }} className="text-left px-3 py-3 rounded-xl text-sm font-bold text-[#e91e3f] hover:bg-[#e91e3f]/10 transition-colors outline-none">로그아웃</button>
                  </>
                ) : (
                  <button onClick={() => { setIsMobileMenuOpen(false); signIn("discord", { callbackUrl: "/" }); }} className="w-full py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold rounded-xl transition-colors outline-none">Discord 로그인</button>
                )}
                <Link href="/policy" onClick={() => setIsMobileMenuOpen(false)} className="px-3 py-3 text-xs text-gray-500 hover:text-white transition-colors">이용약관 및 개인정보처리방침</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}