"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { LuxStyles } from "../../components/Lux";
import BackLink from "../../components/BackLink";
import ArcticDock from "../../arctic/ArcticDock";
import { useSearchParams } from "next/navigation";
import { ICON_PATHS } from "../../components/Icons";

const FILTERS = [{ label: "전체", key: "all" }, { label: "접수 중", key: "pending" }, { label: "답변 완료", key: "completed" }];

// 📌 1:1 문의 내역 — 내 정보에서 분리한 페이지. 새 문의는 /support 에서.
export default function MyInquiriesPage() {
  const { data: session, status } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [rows, setRows] = useState<any[] | null>(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d?.success && Array.isArray(d.data) ? d.data.map((item: any) => ({
        id: item._id, type: item.mainType || "일반 문의", title: item.title || "제목 없음",
        date: item.createdAt ? new Date(item.createdAt).toISOString().split("T")[0] : "날짜 없음",
        createdAt: item.createdAt, updatedAt: item.updatedAt, answeredAt: item.answeredAt,
        status: item.status, content: item.content, answer: item.answer,
      })) : []))
      .catch(() => setRows([]));
  }, [status, session]);

  const list = (rows || []).filter((inq) => (filter === "pending" ? inq.status === "접수 중" : filter === "completed" ? inq.status === "답변 완료" : true));

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20">
        <BackLink href={`/profile${q}`} label="내 정보" />
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">1:1 문의 내역 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${filter === f.key ? "bg-[#131313] text-white border-[#131313]" : "bg-transparent border-[#e0e0e0] text-[#8a8a8a] hover:border-[#a3a3a3] hover:text-[#4b4b4b]"}`}>{f.label}</button>
              ))}
            </div>
            <Link href="/support" className="px-3.5 py-1.5 rounded-full bg-[#e91e3f] hover:bg-[#d01634] text-white text-[11px] font-bold transition-colors">새 문의</Link>
          </div>
        </div>

        <div className="border-t border-black/[0.08]">
          {rows === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : list.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">등록된 문의 내역이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {list.map((inq) => (
                <Link key={inq.id} href={`/profile/inquiry/${inq.id}${q}`} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                  <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${inq.status === "접수 중" ? "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" : "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]"}`}>{inq.status}</span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-[#131313] truncate"><span className="text-[#8a8a8a] font-medium mr-1.5">[{inq.type}]</span>{inq.title}</h4>
                    <p className="text-xs text-[#a3a3a3] mt-0.5 tabular-nums">{inq.date}</p>
                  </div>
                  <svg className="w-4 h-4 text-[#b9b7b3] group-hover:text-[#5a5a5a] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
