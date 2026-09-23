"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { LuxStyles } from "../../components/Lux";
import { RenderFormattedText } from "../../components/FormattedText";
import { ICON_PATHS } from "../../components/Icons";

// 미리보기용 마크다운 기호 제거
const stripMd = (t: string) =>
  (t || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/~~(.*?)~~/g, "$1").replace(/==(.*?)==/g, "$1").replace(/\{([^}]+)\}/g, "$1");

const NOTI_TYPE_STYLES: Record<string, string> = {
  경고: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25",
  제재: "bg-[#fdf1e3] text-[#a8763a] border-[#f0dcc0]",
  안내: "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]",
  축하: "bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]",
  일반: "bg-[#f4f3f2] text-[#4b4b4b] border-[#dedddb]",
};

// 📌 알림함 — 내 정보에서 분리한 페이지. 헤더 종 아이콘의 '전체 보기'가 여기로 온다.
export default function NoticeInboxPage() {
  const { data: session, status } = useSession();
  const [rows, setRows] = useState<any[] | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const searchParams = useSearchParams();
  const wantId = searchParams.get("id");

  // 헤더 종에서 누른 알림을 바로 연다
  useEffect(() => {
    if (!wantId || !rows) return;
    const hit = rows.find((n) => n._id === wantId);
    if (hit) setSelected(hit);
  }, [wantId, rows]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const uid = (session.user as any)?.id;
    const qs = `user=${encodeURIComponent(session.user.name)}${uid ? `&id=${encodeURIComponent(uid)}` : ""}`;
    fetch(`/api/notifications?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d?.success && Array.isArray(d.data) ? d.data : []))
      .catch(() => setRows([]));
  }, [status, session]);

  // 들어오면 안 읽은 알림을 읽음 처리
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name || !rows?.some((n) => !n.read)) return;
    const uid = (session.user as any)?.id;
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true, user: session.user.name, id: uid }) })
      .then(() => setRows((prev) => (prev ? prev.map((n) => ({ ...n, read: true })) : prev)))
      .catch(() => {});
  }, [rows, status, session]);

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-6 pt-8 pb-20">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-6 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          내 정보
        </Link>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-6">알림함 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>

        <div className="border-t border-black/[0.08]">
          {rows === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">받은 알림이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {rows.map((n) => (
                <button key={n._id} onClick={() => setSelected(n)} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                  <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[n.type] || NOTI_TYPE_STYLES["일반"]}`}>{n.type}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0"></span>}
                      <h4 className="text-sm font-bold truncate text-[#131313]">{n.title}</h4>
                    </div>
                    <p className="text-xs text-[#8a8a8a] truncate mt-0.5">{stripMd(n.content)}</p>
                  </div>
                  <span className="text-[11px] text-[#a3a3a3] shrink-0 hidden sm:block tabular-nums">{n.createdAt ? new Date(n.createdAt).toLocaleDateString("ko-KR") : ""}</span>
                  <svg className="w-4 h-4 text-[#b9b7b3] group-hover:text-[#5a5a5a] shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-[#131313]/45 backdrop-blur-sm sm:p-4" onClick={() => setSelected(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white border border-[#dedddb] rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[88dvh] sm:max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-[#ececea] bg-[#faf9f7] shrink-0">
              <span className="text-[10px] font-black tracking-[0.3em] text-[#8a8a8a] uppercase">Official Notice · 운영팀 통지</span>
              <button onClick={() => setSelected(null)} aria-label="닫기" className="p-1.5 -mr-1.5 text-[#8a8a8a] hover:text-[#131313] rounded-md hover:bg-[#f4f3f2] transition-colors outline-none">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.close} /></svg>
              </button>
            </div>
            <div className="p-6 md:p-7 overflow-y-auto flex-1 [&::-webkit-scrollbar]:hidden">
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[selected.type] || NOTI_TYPE_STYLES["일반"]}`}>{selected.type}</span>
                <span className="ml-auto text-[11px] text-[#a3a3a3] tabular-nums">{selected.createdAt ? new Date(selected.createdAt).toLocaleString("ko-KR") : ""}</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-[#131313] break-keep leading-snug mb-5">{selected.title}</h3>
              <div className="rounded-lg border border-[#ececea] bg-white divide-y divide-[#ececea] mb-6">
                <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">수신</span><span className="text-[#4b4b4b] font-bold">{session?.user?.name}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">발신</span><span className="text-[#4b4b4b] font-bold">고급 이글루 운영팀{selected.sentBy ? ` (${selected.sentBy})` : ""}</span></div>
              </div>
              <div className="text-sm text-[#4b4b4b] leading-relaxed break-keep"><RenderFormattedText text={selected.content} /></div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
