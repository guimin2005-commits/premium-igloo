"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Reveal } from "../components/Lux";
import { ADMIN_USERS } from "@/lib/admins";

// 📌 이벤트 목록 — 화이트 & 블랙. 제목 · 밑줄 탭(개수) · 친구 초대 한 줄 · 배너 격자.
//    보이는 건 배너와 제목뿐 — 본문 미리보기는 두지 않는다(공지 목록과 같다).
//    읽는 것은 페이지(이동 규칙 1): 항목을 누르면 /event/[id] 로 간다. 목록 위 모달은 없다.

// 진행 중 빨강 · 예정 검정 · 종료 회색 (글자만)
const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  ongoing: { label: "진행 중", cls: "text-[#e91e3f]" },
  upcoming: { label: "예정", cls: "text-[#131313]" },
  ended: { label: "종료", cls: "text-[#a3a3a3]" },
};

export default function EventPage() {
  const router = useRouter();
  const { data: session, status } = useSession() as any;
  const isLoggedIn = status === "authenticated";
  const isAdmin = isLoggedIn && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [activeTab, setActiveTab] = useState("ongoing");
  const [posts, setPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 1800); };

  const fetchEvents = async (admin = false) => {
    try {
      const res = await fetch(`/api/posts?category=이벤트${admin ? "&all=1" : ""}`, { cache: "no-store" });
      if (res.ok) setPosts((await res.json()).data);
    } catch { console.error("로드 에러"); } finally { setIsLoading(false); }
  };

  useEffect(() => { if (status !== "loading") fetchEvents(!!isAdmin); }, [status, isAdmin]);

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      const res = await fetch(`/api/posts/${deleteConfirmId}`, { method: "DELETE" });
      if (res.ok) { showToast("이벤트가 삭제되었습니다"); fetchEvents(!!isAdmin); }
    } catch { showToast("에러 발생"); }
    finally { setDeleteConfirmId(null); }
  };

  const handleEdit = (id: string, e: React.MouseEvent) => { e.stopPropagation(); router.push(`/write?id=${id}`); };

  const getEventStatus = (event: any) => {
    if (event.eventTag === "종료") return "ended";
    if (event.eventPeriod) {
      const parts = event.eventPeriod.split("~").map((s: string) => s.trim());
      const startDateStr = parts[0];
      const endDateStr = parts[1] || "";
      const now = new Date();
      const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const todayStr = kstDate.toISOString().split('T')[0].replace(/-/g, ".");
      // 📌 종료일이 지나면 자동 마감 ("상시"는 제외)
      if (endDateStr && endDateStr !== "상시" && endDateStr < todayStr) return "ended";
      if (startDateStr > todayStr) return "upcoming";
    }
    return "ongoing";
  };

  const ongoingEvents = posts.filter(p => getEventStatus(p) === "ongoing");
  const upcomingEvents = posts.filter(p => getEventStatus(p) === "upcoming");
  const endedEvents = posts.filter(p => getEventStatus(p) === "ended");

  const TABS = [
    { id: "ongoing", label: "진행 중", count: ongoingEvents.length },
    { id: "upcoming", label: "예정", count: upcomingEvents.length },
    { id: "ended", label: "종료", count: endedEvents.length },
  ];

  const currentDisplayEvents = activeTab === "ongoing" ? ongoingEvents : activeTab === "upcoming" ? upcomingEvents : endedEvents;

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 pb-24 md:pb-16 flex-1">
        {/* 제목 줄 */}
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">이벤트</h1>
          {isAdmin ? (
            <button onClick={() => router.push("/write?category=이벤트")}
              className="shrink-0 h-9 px-4 rounded-full bg-[#131313] hover:bg-black text-white text-[12px] font-extrabold transition-colors">글쓰기</button>
          ) : (
            <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{posts.length}건</span>
          )}
        </div>

        {/* 밑줄 탭 */}
        <div className="flex items-center border-b border-[#ededed]">
          {TABS.map((t) => {
            const on = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`relative py-3 mr-6 md:mr-7 text-[14px] font-extrabold transition-colors outline-none ${on ? "text-[#131313]" : "text-[#6a6a6a] hover:text-[#131313]"}`}>
                {t.label}
                <span className="ml-1.5 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{t.count}</span>
                {on && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#e91e3f]" />}
              </button>
            );
          })}
        </div>

        {/* 친구 초대 이벤트 — 격자 위 한 줄 */}
        <button onClick={() => router.push("/invite")}
          className="group w-full flex items-center gap-3 py-4 border-b border-[#ededed] text-left outline-none">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-extrabold leading-snug group-hover:text-[#e91e3f] transition-colors">친구 초대 이벤트</span>
            <span className="block mt-1 text-[12px] text-[#8a8a8a] truncate">코드 공유하고 함께 XP 받기</span>
          </span>
          <span className="shrink-0 text-[11.5px] font-black text-[#e91e3f]">상시</span>
          <span className="shrink-0 text-[#a3a3a3] font-black">›</span>
        </button>

        {/* 배너 격자 */}
        {isLoading ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">로딩 중...</p>
        ) : currentDisplayEvents.length === 0 ? (
          <p className="py-20 text-center text-sm text-[#8a8a8a]">등록된 이벤트가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10 pt-8">
            {currentDisplayEvents.map((event, listIdx) => {
              const st = getEventStatus(event);
              const badge = STATUS_LABEL[st];
              const extraTag = event.eventTag && event.eventTag !== "NONE" && event.eventTag !== "종료" && event.eventTag !== badge.label
                ? event.eventTag : "";

              return (
                <Reveal key={event._id} delay={Math.min(listIdx, 5) * 90}>
                  <div onClick={() => router.push(`/event/${event._id}`)} className="group cursor-pointer">
                    {/* 배너 */}
                    <div className="w-full aspect-[16/7] rounded-none bg-[#f2f2f2] overflow-hidden flex items-center justify-center">
                      {event.bannerUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={event.bannerUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[12px] font-bold text-[#a3a3a3]">이벤트</span>
                      )}
                    </div>

                    {/* 태그 · 기간 */}
                    <div className="flex items-center gap-2.5 mt-3.5">
                      <span className={`text-[11px] font-black ${badge.cls}`}>{badge.label}</span>
                      {extraTag && <span className="text-[11px] font-black text-[#131313]">{extraTag}</span>}
                      <span className="min-w-0 text-[11.5px] font-bold text-[#8a8a8a] tabular-nums truncate">{event.eventPeriod || "날짜 미정"}</span>
                    </div>

                    {/* 제목 */}
                    <h3 className="mt-1.5 flex items-center gap-2 text-[18px] md:text-[20px] font-black tracking-tight leading-snug break-keep">
                      {isAdmin && event.hidden && <span className="shrink-0 text-[11px] font-black text-[#a3a3a3]">숨김</span>}
                      <span className="min-w-0 group-hover:text-[#e91e3f] transition-colors">{event.title}</span>
                    </h3>

                    {/* 관리자 — 제목 아래 작은 글자 */}
                    {isAdmin && (
                      <div className="mt-2 flex items-center gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleEdit(event._id, e)}
                          className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors">수정</button>
                        <span className="text-[11px] text-[#e0e0e0]">·</span>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(event._id); }}
                          className="text-[11px] font-bold text-[#e91e3f] hover:text-[#d01634] transition-colors">삭제</button>
                      </div>
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}
      </section>

      {/* 삭제 확인 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-7 text-center border border-[#e0e0e0] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-black text-[#131313] mb-2">이벤트를 삭제할까요?</h2>
            <p className="text-[12px] text-[#8a8a8a] mb-6">되돌릴 수 없습니다.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 rounded-xl bg-[#f2f2f2] hover:bg-[#e0e0e0] text-[#4b4b4b] text-[13px] font-bold transition-colors">취소</button>
              <button onClick={executeDelete} className="flex-1 py-3 rounded-xl bg-[#e91e3f] hover:bg-[#d01634] text-white text-[13px] font-bold transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
          <div className="px-5 py-3 rounded-2xl bg-[#131313] text-white text-xs font-bold shadow-2xl">{toast}</div>
        </div>
      )}
    </main>
  );
}
