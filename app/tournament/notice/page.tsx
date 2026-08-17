"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EsportsStyles } from "../../components/Esports";

/* 📌 대회 공지 목록 — 사이트 '소식'과는 다른 개념이다.
   소식은 서버 전체에 알리는 글이고, 이건 대회에 참가한 팀이 보는 운영 공지다.
   글 하나가 곧 한 페이지(/tournament/notice/[id])로 존재한다. */

const G = "#00e07b";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const dOnly = (d: Date) => `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]})`;
const tOnly = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function TournamentNoticeListPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/room", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;

  const notices: any[] = data?.notices || [];
  const season = data?.season;
  const isAdmin = !!data?.isAdmin;

  return (
    <main className="flex-1 w-full flex flex-col">
      <EsportsStyles />

      <section className="relative w-full px-5 md:px-8 pt-10 pb-0 overflow-hidden">
        <div className="absolute inset-0 esp-mesh pointer-events-none" />
        <div className="absolute inset-0 esp-scan pointer-events-none opacity-30" />
        <p className="absolute -top-3 right-6 hidden xl:block text-[100px] font-black tracking-tighter leading-none pointer-events-none select-none text-transparent"
          style={{ WebkitTextStroke: `1px ${G}1f` }}>NOTICE</p>

        <div className="max-w-[900px] mx-auto relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 esp-blink" style={{ background: G, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
            <span className="text-[10px] font-black esp-mono uppercase" style={{ color: G }}>{season?.title || "대회 룸"}</span>
            <span className="h-px flex-1 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
            {isAdmin && (
              <button onClick={() => router.push("/admin/room")} className="text-[10px] font-black esp-mono text-gray-600 hover:text-white transition-colors">공지 관리 →</button>
            )}
          </div>
          <h1 className="text-[28px] md:text-[36px] font-black tracking-tighter leading-none">대회 공지</h1>
          <p className="mt-3 text-[12px] font-bold text-gray-500">대회 진행에 관한 운영 공지입니다.</p>
        </div>
      </section>

      <div className="w-full px-5 md:px-8 py-8">
        <div className="max-w-[900px] mx-auto">
          {notices.length === 0 ? (
            <div className="esp-cut border border-dashed border-white/10 px-6 py-16 text-center">
              <p className="text-[13px] font-bold text-gray-500">아직 등록된 공지가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {notices.map((n: any) => {
                const pub = new Date(n.publishAt);
                const scheduled = pub.getTime() > Date.now();
                return (
                  <Link key={n._id} href={`/tournament/notice/${n._id}`}
                    className="esp-cut flex items-start gap-4 border bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-5 py-4"
                    style={{ borderColor: n.important ? "rgba(251,113,133,.35)" : "rgba(255,255,255,.08)" }}>
                    <span className="min-w-0 flex-1">
                      {(n.pinned || n.important || scheduled) && (
                        <span className="flex items-center gap-1.5 mb-2 flex-wrap">
                          {n.pinned && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black" style={{ background: G, color: "#04120b" }}>고정</span>}
                          {n.important && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-rose-500/20 text-rose-300">중요</span>}
                          {scheduled && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-amber-400/15 text-amber-300">예약 · 관리자만 보임</span>}
                        </span>
                      )}
                      <span className="block text-[15px] md:text-[16px] font-black text-white break-keep leading-snug">{n.title}</span>
                      {n.body && <span className="block mt-2 text-[12px] font-medium text-gray-500 line-clamp-2 break-keep">{n.body}</span>}
                    </span>
                    {/* 날짜는 제목과 같은 줄의 오른쪽 — 따로 한 줄을 쓰면 빈 줄이 생긴다 */}
                    <span className="shrink-0 text-right pt-0.5">
                      <span className="block text-[10px] font-black esp-mono text-gray-500 tabular-nums">{dOnly(pub)}</span>
                      <span className="block text-[10px] font-black esp-mono text-gray-700 tabular-nums mt-0.5">{tOnly(pub)}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
