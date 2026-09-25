"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { LuxStyles } from "../../components/Lux";
import BackLink from "../../components/BackLink";
import ArcticDock from "../../arctic/ArcticDock";
import { useSearchParams } from "next/navigation";
import { ICON_PATHS } from "../../components/Icons";
import { agoLabel } from "@/lib/ago";

// 미리보기용 마크다운 기호 제거
const stripMd = (t: string) =>
  (t || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/~~(.*?)~~/g, "$1").replace(/==(.*?)==/g, "$1").replace(/\{([^}]+)\}/g, "$1");

const NOTI_TYPE_STYLES: Record<string, string> = {
  경고: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25",
  제재: "bg-[#fdf1e3] text-[#a8763a] border-[#f0dcc0]",
  안내: "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]",
  축하: "bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]",
  일반: "bg-[#f2f2f2] text-[#5a5a5a] border-[#ededed]",
};

// 📌 알림함 — 내 정보에서 분리한 페이지. 헤더 종 아이콘의 '전체 보기'가 여기로 온다.
export default function NoticeInboxPage() {
  const { data: session, status } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    const uid = (session.user as any)?.id;
    const qs = `user=${encodeURIComponent(session.user.name)}${uid ? `&id=${encodeURIComponent(uid)}` : ""}`;
    fetch(`/api/notifications?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setRows(d?.success && Array.isArray(d.data) ? d.data : []))
      .catch(() => setRows([]));
  }, [status, session]);

  // 📌 전체 삭제 — 누르면 바로 (본인 알림만 · 서버가 세션으로 확인)
  const clearAll = async () => {
    try {
      const r = await fetch("/api/notifications?mine=all", { method: "DELETE" }).then((x) => x.json());
      if (r?.success) setRows([]);
    } catch {}
  };

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
        <BackLink href={`/profile${q}`} label="내 정보" />
        <div className="flex items-end justify-between gap-4 mb-6">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">알림함 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>
          {(rows?.length || 0) > 0 && (
            <button type="button" onClick={clearAll} className="shrink-0 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus-visible:underline">
              전체 삭제
            </button>
          )}
        </div>

        <div className="border-t border-black/[0.08]">
          {rows === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">받은 알림이 없습니다.</p>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {rows.map((n) => (
                <Link key={n._id} href={`/profile/notice/${n._id}${q}`} className="w-full text-left py-3.5 px-1 flex items-center gap-3.5 hover:bg-black/[0.02] transition-colors group outline-none">
                  <span className={`shrink-0 text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[n.type] || NOTI_TYPE_STYLES["일반"]}`}>{n.type}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#e91e3f] shrink-0"></span>}
                      <h4 className="text-sm font-bold truncate text-[#131313]">{n.title}</h4>
                    </div>
                    <p className="text-xs text-[#8a8a8a] truncate mt-0.5">{stripMd(n.content)}</p>
                  </div>
                  {/* 언제 왔는지 — 모바일에도 보인다 */}
                  <span className="text-[11px] text-[#8a8a8a] shrink-0 tabular-nums">{agoLabel(n.createdAt)}</span>
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
