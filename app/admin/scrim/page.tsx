"use client";

import React from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { ADMIN_USERS } from "@/lib/admins";

/* 📌 스크림 운영 — 팀 목록 (관리자 전용)
   실제 화면은 각 팀의 룸(/tournament/team/[id])이고, 여기서는 어느 팀 룸으로 들어갈지 고른다.
   운영 기능(스크림 매칭·기간 설정)은 룸 안의 '운영 화면' 스위치를 켜면 나온다. */

const TEAMS = [
  { id: "demo", name: "이글루 페이커즈", tag: "IGL", color: "#7dd3fc", done: 5, size: 6, next: "8/12(수) 22시 · 서리 늑대단" },
  { id: "frostwolf", name: "서리 늑대단", tag: "FRW", color: "#a5b4fc", done: 6, size: 6, next: "8/12(수) 22시 · 이글루 페이커즈" },
  { id: "white", name: "화이트 클랜", tag: "WHT", color: "#fcd34d", done: 6, size: 6, next: null },
  { id: "blackout", name: "블랙아웃", tag: "BLK", color: "#f0abfc", done: 3, size: 6, next: null },
];

export default function AdminScrimPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && !!session?.user?.name && ADMIN_USERS.includes(session.user.name);

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

  return (
    <main className="w-full max-w-[900px] mx-auto px-4 pb-24">
      <header className="pt-8 pb-6">
        <p className="text-[11px] font-bold tracking-[0.3em] uppercase text-slate-500">2026 여름 스크림 리그</p>
        <h1 className="mt-3 text-[26px] font-black tracking-[-0.03em]">스크림 운영</h1>
        <p className="mt-2.5 text-[12px] font-medium text-slate-400">
          팀 룸으로 들어가 <b className="text-slate-200">운영 화면</b> 스위치를 켜면 스크림 매칭과 기간 설정을 쓸 수 있습니다.
        </p>
      </header>

      <div className="flex items-baseline gap-3 pb-2.5 border-b border-white/[0.08]">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase text-slate-400">참가 팀</span>
        <span className="ml-auto text-[11px] font-medium text-slate-500">{TEAMS.length}팀</span>
      </div>

      <div className="grid gap-2.5 mt-4 sm:grid-cols-2">
        {TEAMS.map((t) => {
          const ready = t.done >= t.size;
          return (
            <Link key={t.id} href={`/tournament/team/${t.id}`}
              className="flex items-center gap-3.5 p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
              <span className="grid place-items-center shrink-0 w-11 h-11 rounded-2xl text-[13px] font-black tracking-tight"
                style={{ background: `linear-gradient(150deg, ${t.color}2e, ${t.color}0a)`, border: `1px solid ${t.color}55`, color: t.color }}>
                {t.tag}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[13px] font-bold">{t.name}</b>
                <span className="block text-[11px] font-medium mt-1 text-slate-500">
                  <span className={ready ? "text-emerald-400" : "text-amber-400"}>
                    {ready ? "조율 완료" : `조율 중 ${t.done}/${t.size}`}
                  </span>
                  {t.next && <><span className="mx-1.5 text-slate-700">·</span>다음 {t.next}</>}
                </span>
              </span>
              <span className="shrink-0 text-slate-600 text-[18px]">›</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 p-4 rounded-2xl border border-dashed border-white/[0.08]">
        <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
          <b className="text-slate-300">프로토타입입니다.</b> 팀 목록은 예시 데이터이고, 실제로는 대회에 등록된 팀과 경매 로스터를 그대로 가져옵니다.
        </p>
      </div>
    </main>
  );
}
