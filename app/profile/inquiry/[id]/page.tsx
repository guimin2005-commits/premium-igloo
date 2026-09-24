"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useParams, useSearchParams } from "next/navigation";
import { LuxStyles } from "../../../components/Lux";
import BackLink from "../../../components/BackLink";
import ArcticDock from "../../../arctic/ArcticDock";

// 📌 문의 상세 — 읽는 것은 페이지. 목록(/profile/inquiry)에서 온다.
export default function InquiryDetailPage() {
  const { data: session, status } = useSession();
  const { id } = useParams<{ id: string }>();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [item, setItem] = useState<any | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/inquiry?user=${encodeURIComponent(session.user.name)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = d?.success && Array.isArray(d.data) ? d.data : [];
        setItem(rows.find((x: any) => x._id === id) || null);
      })
      .catch(() => setItem(null));
  }, [status, session, id]);

  const pending = item?.status === "접수 중";

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <article className="w-full max-w-3xl mx-auto px-6 pt-8 pb-20">
        <BackLink href={`/profile/inquiry${q}`} label="1:1 문의" />
        {item === undefined ? (
          <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
        ) : item === null ? (
          <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">문의를 찾을 수 없습니다.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${pending ? "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25" : "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]"}`}>{item.status}</span>
              <span className="text-[11px] text-[#a3a3a3] font-medium">[{item.mainType || "일반 문의"}]</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-[#131313] break-keep leading-snug tracking-tight mb-6">{item.title || "제목 없음"}</h1>
            <div className="rounded-lg border border-[#ededed] bg-white divide-y divide-[#ededed] mb-8">
              <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">접수일시</span><span className="text-[#4b4b4b] font-bold tabular-nums">{item.createdAt ? new Date(item.createdAt).toLocaleString("ko-KR") : "-"}</span></div>
              {item.status === "답변 완료" && (
                <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#e91e3f] font-bold">답변일시</span><span className="text-[#4b4b4b] font-bold tabular-nums">{item.answeredAt ? new Date(item.answeredAt).toLocaleString("ko-KR") : item.updatedAt ? new Date(item.updatedAt).toLocaleString("ko-KR") : "처리 완료"}</span></div>
              )}
            </div>
            <p className="text-[11px] font-black tracking-wide text-[#8a8a8a] uppercase mb-2">문의 내용</p>
            <div className="text-[15px] text-[#4b4b4b] leading-relaxed whitespace-pre-wrap break-keep">{item.content}</div>
            {item.answer && (
              <div className="mt-8 bg-[#e91e3f]/[0.04] border border-[#e91e3f]/20 p-5 rounded-lg">
                <span className="text-[11px] font-black text-[#e91e3f] tracking-wide uppercase mb-2.5 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>운영팀 답변</span>
                <p className="text-[15px] text-[#4b4b4b] leading-relaxed break-keep whitespace-pre-wrap">{item.answer}</p>
              </div>
            )}
          </>
        )}
      </article>
      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
