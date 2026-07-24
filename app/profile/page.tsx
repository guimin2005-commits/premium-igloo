"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Reveal, LuxStyles, ScrollProgress } from "../components/Lux";
import { RenderFormattedText } from "../components/FormattedText";

// 미리보기(접힘)용 마크다운 기호 제거
const stripMd = (t: string) =>
  (t || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/==(.*?)==/g, "$1")
    .replace(/\{([^}]+)\}/g, "$1");

// 통지 유형별 색상
const NOTI_TYPE_STYLES: Record<string, string> = {
  경고: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25",
  제재: "bg-orange-500/10 text-orange-400 border-orange-500/25",
  안내: "bg-sky-500/10 text-sky-400 border-sky-500/25",
  축하: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
  일반: "bg-white/5 text-gray-300 border-white/15",
};

export default function MyInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("inquiry");

  // 📌 URL 쿼리로 탭 직접 진입 지원 (/profile?tab=booster)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) setActiveTab(tabParam);
  }, [searchParams]);
  const [inquiryFilter, setInquiryFilter] = useState("all");
  const [recruitFilter, setRecruitFilter] = useState("all");
  const [fetchedInquiries, setFetchedInquiries] = useState<any[]>([]);
  const [fetchedRecruits, setFetchedRecruits] = useState<any[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<any>(null);
  
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  // 📌 관리자 알림함
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<any | null>(null);

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

  // 📌 관리자 알림 로드 (닉네임 + 디스코드 ID 매칭)
  const loadNotifications = () => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const uid = (session.user as any)?.id;
    const qs = `user=${encodeURIComponent(session.user.name)}${uid ? `&id=${encodeURIComponent(uid)}` : ""}`;
    fetch(`/api/notifications?${qs}`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => { if (data?.success && Array.isArray(data.data)) setNotifications(data.data); })
      .catch(() => {});
  };
  useEffect(() => { loadNotifications(); }, [status, session]);

  // 📌 알림함 탭 진입 시 안 읽은 알림을 읽음 처리
  useEffect(() => {
    if (activeTab !== "notice") return;
    if (status !== "authenticated" || !session?.user?.name) return;
    if (!notifications.some((n) => !n.read)) return;
    const uid = (session.user as any)?.id;
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true, user: session.user.name, id: uid }),
    })
      .then(() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true }))))
      .catch(() => {});
  }, [activeTab, notifications, status, session]);

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
  if (status === "unauthenticated") {
    return (
      <main className="w-full max-w-md mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center animate-in fade-in duration-500">
        <h2 className="text-2xl font-black text-white mb-4 tracking-tight">로그인 필요</h2>
        <p className="text-gray-400 mb-8 text-sm">내 정보를 확인하시려면 로그인이 필요합니다.</p>
        <button onClick={() => signIn("discord", { callbackUrl: "/profile" })} className="w-full py-4 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition-all shadow-lg shadow-[#5865F2]/20 outline-none focus:outline-none">
          Discord 로그인
        </button>
      </main>
    );
  }

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
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />
      <ScrollProgress />

      {/* ── PROFILE HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[#e91e3f]/[0.07] blur-[120px] rounded-full pointer-events-none"></div>
        <div className="max-w-4xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-6">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">My Account</span>
            </div>
            <div className="flex items-center gap-5 md:gap-6">
              <div className="relative shrink-0">
                {isBooster && <div className="absolute -inset-2 bg-[#e91e3f]/15 blur-xl rounded-full pointer-events-none"></div>}
                <img src={session?.user?.image || ""} alt="Profile" className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-800 border border-white/10 shadow-xl ${isBooster ? 'ring-2 ring-[#e91e3f]/60 ring-offset-4 ring-offset-[#090909]' : ''}`} />
              </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-2 flex items-center gap-2.5">
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
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-4xl mx-auto px-6 pb-16 flex-1 flex flex-col border-t border-white/5 pt-10">

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
        {["notice", "inquiry", "recruit", "booster"].map((tab) => {
          const unread = tab === "notice" ? notifications.filter((n) => !n.read).length : 0;
          const label = tab === "notice" ? "알림함" : tab === "inquiry" ? "1:1 문의 내역" : tab === "recruit" ? "구인 지원 목록" : "서버 부스터 혜택";
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`pb-4 text-sm md:text-base font-bold whitespace-nowrap transition-colors relative outline-none flex items-center gap-1.5 ${activeTab === tab ? "text-[#e91e3f]" : "text-gray-400 hover:text-white"}`}>
              {label}
              {unread > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black rounded-full bg-[#e91e3f] text-white">{unread}</span>}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#e91e3f]" />}
            </button>
          );
        })}
      </div>

      <div>
        {activeTab === "notice" && (
          <div className="animate-in fade-in duration-300">
            {isDataLoading && notifications.length === 0 ? (
              <p className="text-gray-600 text-sm py-12 text-center">데이터 로딩 중...</p>
            ) : notifications.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-white/8 rounded-xl">
                <p className="text-gray-500 text-sm mb-1">받은 통지가 없습니다.</p>
                <p className="text-xs text-gray-700">운영팀이 보낸 경고·안내 등이 이곳에 도착합니다.</p>
              </div>
            ) : (
              <div className="border-y border-white/[0.07] divide-y divide-white/[0.07]">
                {notifications.map((n) => {
                  const badge = NOTI_TYPE_STYLES[n.type] || NOTI_TYPE_STYLES["일반"];
                  return (
                    <button key={n._id} onClick={() => setSelectedNotif(n)} className="w-full text-left py-4 px-1 flex items-center gap-3.5 hover:bg-white/[0.02] transition-colors group outline-none">
                      <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${badge}`}>{n.type}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0 shadow-[0_0_6px_rgba(233,30,63,0.8)]"></span>}
                          <h4 className={`text-sm font-bold truncate ${n.read ? "text-gray-200" : "text-white"}`}>{n.title}</h4>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{stripMd(n.content)}</p>
                      </div>
                      <span className="text-[11px] text-gray-600 shrink-0 hidden sm:block tabular-nums">{n.createdAt ? new Date(n.createdAt).toLocaleDateString("ko-KR") : ""}</span>
                      <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "inquiry" && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="flex gap-1.5">
              {[{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }].map(f => (
                <button key={f.key} onClick={() => setInquiryFilter(f.key)} className={`px-3.5 py-1.5 rounded-md text-xs font-bold border transition-colors ${inquiryFilter === f.key ? "bg-white/10 text-white border-white/20" : "bg-transparent border-white/8 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}>{f.label}</button>
              ))}
            </div>
            {isDataLoading ? <p className="text-gray-600 text-sm py-12 text-center">데이터 로딩 중...</p> : filteredInquiries.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-white/8 rounded-xl">
                <p className="text-gray-500 text-sm">등록된 문의 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="border-y border-white/[0.07] divide-y divide-white/[0.07]">
                {filteredInquiries.map(inq => (
                  <button key={inq.id} onClick={() => setSelectedInquiry(inq)} className="w-full text-left py-4 px-1 flex items-center gap-3.5 hover:bg-white/[0.02] transition-colors group outline-none">
                    <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${inq.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25' : 'bg-sky-500/10 text-sky-400 border-sky-500/25'}`}>{inq.status}</span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-white truncate"><span className="text-gray-500 font-medium mr-1.5">[{inq.type}]</span>{inq.title}</h4>
                      <p className="text-xs text-gray-600 mt-0.5 tabular-nums">{inq.date}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-400 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        
        {activeTab === "recruit" && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex gap-2 mb-4">
              {[{ label: "전체", key: "all" }, { label: "심사 중", key: "심사 중" }, { label: "합격", key: "합격" }, { label: "불합격", key: "불합격" }].map(f => (
                <button key={f.key} onClick={() => setRecruitFilter(f.key)} className={`px-3.5 py-1.5 rounded-md text-xs font-bold border transition-colors ${recruitFilter === f.key ? "bg-white/10 text-white border-white/20" : "bg-transparent border-white/8 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}>{f.label}</button>
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
          <div className="space-y-16 animate-in fade-in duration-300">
            {/* 인트로 — 플랫 에디토리얼 + 임팩트 타이포 */}
            <Reveal>
            <div className="relative pt-2 overflow-hidden">
              <div className="absolute -top-8 -right-4 text-[120px] md:text-[160px] font-black text-white/[0.025] leading-none select-none pointer-events-none tracking-tighter">BOOST</div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-px bg-[#e91e3f]"></span>
                  <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Server Booster Program</span>
                </div>
                <h3 className="text-3xl md:text-5xl font-black tracking-tighter mb-4 leading-none">
                  <span className="text-white">SERVER </span><span className="lux-shimmer">BOOSTER</span>
                </h3>
                <p className="text-sm md:text-base text-gray-400 leading-relaxed max-w-xl">서버의 환경 개선을 위한 직접적인 후원 시스템입니다.<br className="hidden md:block" />본 서버의 성장을 지원해 주시는 유저분들께 깊은 감사를 드립니다.</p>
              </div>
            </div>
            </Reveal>

            {/* 01. 전용 기능 권한 — 헤어라인 리스트 */}
            <Reveal>
            <div>
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">01</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">SERVER 전용 기능 권한</h4>
              <div className="divide-y divide-white/[0.06]">
                {[
                  { t: "전용 역할 및 뱃지 지급", d: "@SERVER BOOSTER 고유 역할 부여 및 차별화된 프로필 전용 특수 배지 자동 장착", note: "" },
                  { t: "사용자 관리 권한 제공", d: "서버 내 일부 사용자 관리 부가 기능 상시 이용 가능", note: "" },
                  { t: "권한 제한 채널 이용", d: "별도의 권한 구매 없이 제한된 채널 이용 가능!", note: "* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다." },
                  { t: "슬로우 모드 제한 해제", d: "채팅 대기 시간 제한 없이 연속 채팅 가능!", note: "* 권한이 없을 경우, XP SHOP에서 관련 권한 상품을 구매해야 합니다." },
                ].map((item, idx) => (
                  <div key={idx} className="py-5 flex flex-col md:flex-row md:items-baseline gap-1.5 md:gap-8 group">
                    <p className="font-bold text-white text-sm md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{item.t}</p>
                    <div className="min-w-0">
                      <p className="text-xs md:text-[13px] text-gray-500 leading-relaxed">{item.d}</p>
                      {item.note && <p className="text-[10px] text-gray-600 mt-1">{item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            {/* 02. XP 혜택 — 헤어라인 리스트 */}
            <Reveal>
            <div>
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">02</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">XP BOOSTER 경험치 혜택</h4>
              <div className="divide-y divide-white/[0.06]">
                {[
                  { k: "WELCOME", t: "부스팅 시작 보너스 보상 지급!", big: "100,000", unit: "XP 즉시 지급", sub: "추가 부스팅: 개당 50,000 XP 추가 지급!" },
                  { k: "PASSIVE", t: "경험치 획득 조건 충족 시 상시 추가!", big: "+2,000", unit: "XP 상시 지급", sub: "" },
                  { k: "SHOP", t: "경험치샵 이용 전용 정산 혜택!", big: "35%", unit: "XP 환급", sub: "경험치샵 사용 금액 기준" },
                  { k: "DAILY", t: "일일 출석체크 추가 보상!", big: "10,000", unit: "XP 보너스", sub: "일일 출석체크 시 추가 지급" },
                ].map((row, idx) => (
                  <div key={idx} className="py-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 group">
                    <div className="min-w-0 md:flex md:items-baseline md:gap-8">
                      <p className="font-black text-white text-sm tracking-[0.2em] md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{row.k}</p>
                      <p className="text-xs text-gray-500 mt-0.5 md:mt-0">{row.t}</p>
                    </div>
                    <div className="md:text-right shrink-0">
                      <p className="leading-none">
                        <span className="text-2xl md:text-3xl font-black text-[#e91e3f] tracking-tighter">{row.big}</span>
                        <span className="text-[11px] font-bold text-gray-400 ml-2">{row.unit}</span>
                      </p>
                      {row.sub && <p className="text-[11px] text-gray-600 mt-1.5">{row.sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            {/* 03. RANK — 플랫 테이블 */}
            <Reveal>
            <div>
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">누적 유지 개월별 추가 혜택 (RANK)</h4>
              <div className="divide-y divide-white/[0.06]">
                {[{ r: "RANK 01", m: "1개월", x: "100,000" }, { r: "RANK 02", m: "3개월", x: "300,000" }, { r: "RANK 03", m: "6개월", x: "600,000" }, { r: "RANK 04", m: "9개월", x: "900,000" }, { r: "RANK 06", m: "15개월", x: "1,500,000" }, { r: "RANK 07", m: "18개월", x: "1,800,000" }, { r: "RANK 08", m: "21개월", x: "2,100,000" }, { r: "RANK 09", m: "24개월", x: "2,400,000" }].map((item, idx) => (
                  <div key={idx} className="py-4 grid grid-cols-3 items-center text-sm group hover:bg-white/[0.015] transition-colors">
                    <p className="text-[10px] font-black tracking-[0.2em] text-gray-600 uppercase group-hover:text-[#e91e3f] transition-colors">{item.r}</p>
                    <p className="font-bold text-white text-center">{item.m}</p>
                    <p className="text-right"><span className="text-base md:text-lg font-black text-[#e91e3f] tracking-tight">{item.x}</span><span className="text-[10px] font-bold text-gray-500 ml-1.5">XP</span></p>
                  </div>
                ))}
              </div>

              {/* 스페셜 블록 — 좌측 크림슨 라인만 남긴 플랫 구성 */}
              <div className="mt-10 space-y-10">
                {[
                  { rank: "RANK 05 SPECIAL BLOCK", title: "🏆 12개월 연속 달성", items: [<>누적 보너스 <span className="text-white font-bold">1,200,000 XP</span> 즉시 수령</>, <><strong>@BOOSTER RANK 05</strong> 역할 추가 지급</>, <>상시 고정 버프 <strong>+2,000 XP</strong> 추가 영구 결합</>, <>일일 출석 시 <span className="text-white font-bold">2,000 XP</span> 영구 가산 누적 지급</>] },
                  { rank: "RANK 10 SPECIAL BLOCK", title: "👑 24개월 연속 달성", items: [<>누적 보너스 <span className="text-white font-bold">2,400,000 XP</span> 즉시 수령</>, <><strong>@BOOSTER RANK 10</strong> 특수 역할 추가 지급</>, <>상시 고정 버프 <strong>+4,000 XP</strong> 추가 영구 결합</>, <>일일 출석 시 <span className="text-white font-bold">5,000 XP</span> 영구 가산 누적 지급</>] },
                ].map((block, idx) => (
                  <div key={idx} className="border-l-2 border-[#e91e3f] pl-5 md:pl-7">
                    <p className="text-[9px] font-black tracking-[0.25em] text-[#e91e3f] mb-1.5 uppercase">{block.rank}</p>
                    <p className="text-lg font-black text-white mb-3">{block.title}</p>
                    <div className="text-xs md:text-[13px] text-gray-400 space-y-1.5">
                      {block.items.map((it, i) => (
                        <p key={i} className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span>{it}</span></p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            <Reveal>
            <div className="pt-6 border-t border-white/10 text-center">
              <p className="text-sm text-gray-300 font-bold">📢 디스코드 서버 부스트 진행 시 시스템이 자동으로 감지하여 모든 혜택을 즉시 지급합니다!</p>
            </div>
            </Reveal>
          </div>
        )}
      </div>

      {/* 📌 통지 상세 모달 (사무적 통지서) */}
      {selectedNotif && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 animate-in fade-in" onClick={() => setSelectedNotif(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#111111] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-white/8 bg-white/[0.015] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase">Official Notice · 운영팀 통지</span>
              <button onClick={() => setSelectedNotif(null)} className="p-1.5 -mr-1.5 text-gray-500 hover:text-white rounded-md hover:bg-white/5 transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[selectedNotif.type] || NOTI_TYPE_STYLES["일반"]}`}>{selectedNotif.type}</span>
                <span className="ml-auto text-[11px] text-gray-600 tabular-nums">{selectedNotif.createdAt ? new Date(selectedNotif.createdAt).toLocaleString("ko-KR") : ""}</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white break-keep leading-snug mb-5">{selectedNotif.title}</h3>

              <div className="rounded-lg border border-white/8 bg-white/[0.02] divide-y divide-white/[0.06] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-gray-500 font-bold">수신</span>
                  <span className="text-gray-300 font-bold">{session?.user?.name}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-gray-500 font-bold">발신</span>
                  <span className="text-gray-300 font-bold">고급 이글루 운영팀{selectedNotif.sentBy ? ` (${selectedNotif.sentBy})` : ""}</span>
                </div>
              </div>

              <div className="text-sm text-gray-300 leading-relaxed break-keep">
                <RenderFormattedText text={selectedNotif.content} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 📌 문의 상세 모달 (사무적) */}
      {selectedInquiry && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 animate-in fade-in" onClick={() => setSelectedInquiry(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-[#111111] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-white/8 bg-white/[0.015] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-gray-500 uppercase">1:1 문의 내역</span>
              <button onClick={() => setSelectedInquiry(null)} className="p-1.5 -mr-1.5 text-gray-500 hover:text-white rounded-md hover:bg-white/5 transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${selectedInquiry.status === '접수 중' ? 'bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25' : 'bg-sky-500/10 text-sky-400 border-sky-500/25'}`}>{selectedInquiry.status}</span>
                <span className="text-[11px] text-gray-600 font-medium">[{selectedInquiry.type}]</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-white break-keep leading-snug mb-5">{selectedInquiry.title}</h3>

              <div className="rounded-lg border border-white/8 bg-white/[0.02] divide-y divide-white/[0.06] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                  <span className="text-gray-500 font-bold">접수일시</span>
                  <span className="text-gray-300 font-bold tabular-nums">{selectedInquiry.createdAt ? new Date(selectedInquiry.createdAt).toLocaleString("ko-KR") : selectedInquiry.date}</span>
                </div>
                {selectedInquiry.status === '답변 완료' && (
                  <div className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <span className="text-[#e91e3f] font-bold">답변일시</span>
                    <span className="text-gray-300 font-bold tabular-nums">{selectedInquiry.answeredAt ? new Date(selectedInquiry.answeredAt).toLocaleString("ko-KR") : selectedInquiry.updatedAt ? new Date(selectedInquiry.updatedAt).toLocaleString("ko-KR") : "처리 완료"}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] font-black tracking-wide text-gray-500 uppercase mb-2">문의 내용</p>
              <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap break-keep">
                {selectedInquiry.content}
              </div>

              {selectedInquiry.answer && (
                <div className="mt-6 bg-[#e91e3f]/[0.04] border border-[#e91e3f]/20 p-5 rounded-lg">
                  <span className="text-[11px] font-black text-[#e91e3f] tracking-wide uppercase mb-2.5 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>운영팀 답변
                  </span>
                  <p className="text-sm text-gray-300 leading-relaxed break-keep whitespace-pre-wrap">{selectedInquiry.answer}</p>
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
      </div>
    </main>
  );
}