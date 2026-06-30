"use client";

import React, { useState, useEffect, ChangeEvent, FormEvent } from "react";
import { useSession, signIn, signOut } from "next-auth/react";

interface Position {
  id: string;
  title: string;
  status: "모집중" | "마감";
  badge: string;
  period: string;
  requirements: string[];
  responsibilities: string[];
}

export default function RecruitPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 🚨 [핵심 해결책] 'as any'를 붙여서 TypeScript의 깐깐한 에러 검사를 강제로 꺼버렸습니다!
  const { data: session, status } = useSession() as any; 
  const isLoggedIn = status === "authenticated";

  const [activeTab, setActiveTab] = useState<string>("all");
  const [isLoginReqModalOpen, setIsLoginReqModalOpen] = useState<boolean>(false);
  const [isApplyModalOpen, setIsApplyModalOpen] = useState<boolean>(false);
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  
  const [formData, setFormData] = useState({
    discordTag: "",
    age: "",
    intro: "",
    experience: "",
  });

  // 이제 에러 없이 닉네임이 잘 들어갑니다.
  useEffect(() => {
    if (session && session.user && session.user.name) {
      setFormData(prev => ({ ...prev, discordTag: String(session.user.name) }));
    }
  }, [session]);

  const positions: Position[] = [
    {
      id: "staff",
      title: "정식 운영진 (General Staff)",
      status: "모집중",
      badge: "MANAGEMENT",
      period: "2026.06.01 ~ 2026.06.30 23:59",
      requirements: ["만 19세 이상 성인", "디스코드 커뮤니티 케어 경험자", "책임감이 강하고 유저 소통이 원활하신 분"],
      responsibilities: ["채널 모니터링 및 유저 분쟁 조정", "서버 내 이벤트 기획 및 진행 서포트", "신규 유저 가이드 제공"],
    },
    {
      id: "dev",
      title: "개발 스태프 (Developer)",
      status: "모집중",
      badge: "BOT & WEB",
      period: "상시 모집 (채용 시 마감)",
      requirements: ["Next.js 또는 Discord.js 봇 개발 가능자", "Git/GitHub 활용 및 협업 가능자", "포트폴리오 제출 가능자"],
      responsibilities: ["고급 이글루 전용 웹 포탈 기능 개발", "디스코드 맞춤형 커스텀 봇 유지보수", "DB 관리"],
    },
    {
      id: "sup",
      title: "공식 서포터즈 (Supporters)",
      status: "마감",
      badge: "COMMUNITY",
      period: "2026.05.01 ~ 2026.05.15 (모집 종료)",
      requirements: ["고급 이글루 서버 실시간 활성 유저", "서버 홍보 및 디자인/콘텐츠 제작 관심자"],
      responsibilities: ["신규 유저 온보딩 환영 리액션", "커뮤니티 활성화를 위한 채팅 및 소통 주도"],
    },
  ];

  const filteredPositions = activeTab === "all" ? positions : positions.filter(p => p.id === activeTab);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleApplyClick = (posId: string) => {
    if (!isLoggedIn) {
      setIsLoginReqModalOpen(true);
      return;
    }
    setSelectedPosition(posId);
    setIsApplyModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const positionTitle = positions.find(p => p.id === selectedPosition)?.title || "알 수 없는 직책";
    
    try {
      const response = await fetch("/api/recruit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          position: positionTitle
        }),
      });

      if (!response.ok) throw new Error("서버 응답 실패");
      const result = await response.json();

      if (result.success) {
        alert(`🎉 [지원서 접수 완료]\n\n${positionTitle} 직책에 지원하셨습니다.\n운영진 디스코드 채널로 지원서가 전송되었습니다.`);
        setFormData({ discordTag: session?.user?.name || "", age: "", intro: "", experience: "" });
        setIsApplyModalOpen(false);
      } else {
        alert(`❌ 제출 실패: ${result.error || "알 수 없는 오류"}`);
      }
    } catch (error) {
      alert("❌ 서버와 통신 중 에러가 발생했습니다. 백엔드 주소를 확인해주세요.");
    }
  };

  if (!isMounted) return null;

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16">
      
      <div className="mb-12 text-center md:text-left border-b border-white/10 pb-6">
        <h1 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">스태프 구인</h1>
        <p className="text-gray-400 text-lg">고급 이글루의 생태계를 함께 디자인하고 이끌어갈 크루를 찾습니다.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-10 border-b border-white/5 pb-4">
        {[{ id: "all", label: "전체 보기" }, { id: "staff", label: "정식 운영진" }, { id: "dev", label: "개발 스태프" }, { id: "sup", label: "서포터즈" }].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${
              activeTab === tab.id ? "bg-[#e91e3f] text-white shadow-lg shadow-[#e91e3f]/20" : "bg-[#121212] text-gray-400 hover:text-white border border-white/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        {filteredPositions.map((pos) => (
          <div key={pos.id} className={`p-6 rounded-3xl bg-[#121212] border ${pos.status === "모집중" ? "border-white/5 hover:border-[#e91e3f]/40" : "border-white/5 opacity-50"} transition-all flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black tracking-widest text-[#e91e3f] bg-[#e91e3f]/10 px-2.5 py-1 rounded-md">{pos.badge}</span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${pos.status === "모집중" ? "bg-green-500/10 text-green-400" : "bg-gray-800 text-gray-500"}`}>{pos.status}</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{pos.title}</h3>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 font-medium">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" /></svg>
                {pos.period}
              </div>
              <div className="space-y-4 mb-8">
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">지원 자격</h4>
                  <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">{pos.requirements.map((req, i) => <li key={i}>{req}</li>)}</ul>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">담당 업무</h4>
                  <ul className="list-disc list-inside text-sm text-gray-400 space-y-1">{pos.responsibilities.map((res, i) => <li key={i}>{res}</li>)}</ul>
                </div>
              </div>
            </div>
            {pos.status === "모집중" && (
              <button onClick={() => handleApplyClick(pos.id)} className="w-full py-3 rounded-xl font-bold text-sm bg-[#e91e3f] hover:bg-[#d01634] text-white shadow-lg shadow-[#e91e3f]/20 transition-all active:scale-95">
                지원하기
              </button>
            )}
          </div>
        ))}
      </div>

      {isLoginReqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-3xl w-full max-w-sm p-8 text-center shadow-2xl relative">
            <h2 className="text-xl font-bold text-white mb-2">로그인이 필요합니다</h2>
            <p className="text-sm text-gray-400 mb-8">스태프 지원은 디스코드 계정 연동 후<br/>진행하실 수 있습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLoginReqModalOpen(false)} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#2a2a2a] hover:bg-[#333] text-white transition-all">닫기</button>
              <button onClick={() => signIn("discord")} className="flex-1 py-3 rounded-xl font-bold text-sm bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-lg shadow-[#5865F2]/20 transition-all">
                Discord로 로그인
              </button>
            </div>
          </div>
        </div>
      )}

      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#121212] border border-[#e91e3f]/30 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden max-h-[90vh] flex flex-col">
            <button onClick={() => setIsApplyModalOpen(false)} className="absolute top-6 right-6 p-2 text-gray-400 hover:text-white bg-white/5 rounded-full z-10">닫기</button>
            <div className="p-8 pb-4 border-b border-white/5">
              <span className="text-xs font-bold text-[#e91e3f]">APPLICATION FORM</span>
              <h2 className="text-2xl font-bold text-white mt-1">{positions.find(p => p.id === selectedPosition)?.title} 지원</h2>
            </div>
            <div className="p-8 overflow-y-auto">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2">디스코드 사용자명 (자동입력됨)</label>
                    <input type="text" name="discordTag" required readOnly value={formData.discordTag} className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-gray-500 text-sm cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-2">나이</label>
                    <input type="number" name="age" required value={formData.age} onChange={handleChange} placeholder="숫자만 입력" className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white focus:border-[#e91e3f] text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2">자기소개 및 지원 동기</label>
                  <textarea name="intro" required rows={4} value={formData.intro} onChange={handleChange} className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white focus:border-[#e91e3f] text-sm resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-2">관련 경력 이력 (선택)</label>
                  <textarea name="experience" rows={3} value={formData.experience} onChange={handleChange} className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/10 rounded-xl text-white focus:border-[#e91e3f] text-sm resize-none" />
                </div>
                <div className="pt-4">
                  <button type="submit" className="w-full py-4 bg-[#e91e3f] hover:bg-[#d01634] text-white font-bold rounded-xl transition-all">지원서 최종 제출</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 flex items-center gap-3 bg-black/80 p-3 rounded-full border border-white/10 backdrop-blur-md z-40 shadow-xl">
        {status === "loading" ? (
          <span className="text-xs text-gray-400 px-4">로딩중...</span>
        ) : isLoggedIn ? (
          <>
            <img src={session?.user?.image || ""} alt="profile" className="w-8 h-8 rounded-full border border-white/20" />
            <span className="text-xs font-bold text-white mr-2">{session?.user?.name} 님</span>
            <button onClick={() => signOut()} className="px-3 py-1.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors">
              로그아웃
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-400 px-2">게스트 모드</span>
            <button onClick={() => signIn("discord")} className="px-4 py-1.5 rounded-full text-xs font-bold bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-lg shadow-[#5865F2]/20 transition-all">
              <i className="fa-brands fa-discord mr-1"></i> 로그인
            </button>
          </>
        )}
      </div>

    </main>
  );
} 