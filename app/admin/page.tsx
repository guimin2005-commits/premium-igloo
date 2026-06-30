"use client";

import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

const ADMIN_USERS = ["elahw.06"];

interface AdminItem {
  title: string;
  desc: string;
  href: string;
  icon: React.ReactNode;
  accent?: boolean;
}

export default function AdminHubPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [stats, setStats] = useState({ inquiries: 0, pending: 0, applies: 0, codes: 0, payoutPending: 0 });

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      fetch("/api/inquiry", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/user/applies?admin=true", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/code", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/payout", { cache: "no-store" }).then(r => r.json()).catch(() => ({ pendingCount: 0 })),
    ]).then(([inq, app, code, payout]) => {
      const inquiries = Array.isArray(inq?.data) ? inq.data : [];
      setStats({
        inquiries: inquiries.length,
        pending: inquiries.filter((i: any) => i.status === "접수 중").length,
        applies: Array.isArray(app?.data) ? app.data.length : 0,
        codes: Array.isArray(code?.data) ? code.data.length : 0,
        payoutPending: payout?.pendingCount || 0,
      });
    });
  }, [isAdmin]);

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  const Icon = ({ d }: { d: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>
  );

  const writeItems: AdminItem[] = [
    { title: "공지사항 작성", desc: "중요·일반·업데이트 공지 등록", href: "/write?category=공지사항", icon: <Icon d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /> },
    { title: "이벤트 작성", desc: "이벤트·프로모션 등록", href: "/write?category=이벤트", icon: <Icon d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /> },
    { title: "대회 등록", desc: "e스포츠 리그·토너먼트 등록", href: "/write?category=대회", icon: <Icon d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0" /> },
    { title: "구인글 작성", desc: "스태프·서포터즈 모집 등록", href: "/write?category=구인", icon: <Icon d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" /> },
  ];

  const manageItems: AdminItem[] = [
    { title: "1:1 문의 관리", desc: stats.pending > 0 ? `미답변 ${stats.pending}건 · 전체 ${stats.inquiries}건` : `전체 ${stats.inquiries}건`, href: "/support?admin=1", accent: stats.pending > 0, icon: <Icon d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /> },
    { title: "구인 지원자 관리", desc: `지원 내역 ${stats.applies}건`, href: "/recruit?admin=1", icon: <Icon d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /> },
    { title: "코드 관리", desc: `발급된 코드 ${stats.codes}개`, href: "/code", icon: <Icon d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" /> },
    { title: "XP 지급 대기열", desc: stats.payoutPending > 0 ? `지급 대기 ${stats.payoutPending}건` : "대기 중인 지급 없음", href: "/payouts", accent: stats.payoutPending > 0, icon: <Icon d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
  ];

  const Card = ({ item }: { item: AdminItem }) => (
    <button onClick={() => router.push(item.href)} className={`group text-left bg-[#121212] border rounded-2xl p-6 transition-all hover:-translate-y-0.5 ${item.accent ? "border-[#e91e3f]/40 hover:border-[#e91e3f]" : "border-white/5 hover:border-white/15"}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-colors ${item.accent ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "bg-white/5 text-gray-300 group-hover:text-white"}`}>{item.icon}</div>
      <h3 className="text-base font-bold text-white mb-1">{item.title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed break-keep">{item.desc}</p>
    </button>
  );

  return (
    <main className="w-full max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-10 border-b border-white/10 pb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black tracking-widest text-[#e91e3f] uppercase">Admin Console</span>
        </div>
        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">관리자 페이지</h1>
        <p className="text-gray-400 text-sm">{session?.user?.name}님, 고급 이글루의 모든 관리 기능을 한 곳에서 이용하세요.</p>
      </div>

      <section className="mb-12">
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">콘텐츠 작성</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {writeItems.map(item => <Card key={item.href} item={item} />)}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">운영 관리</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {manageItems.map(item => <Card key={item.href} item={item} />)}
        </div>
      </section>
    </main>
  );
}
