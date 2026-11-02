"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { LuxStyles } from "../../../components/Lux";
import { RenderFormattedText } from "../../../components/FormattedText";
import BackLink from "../../../components/BackLink";
import ArcticDock from "../../../arctic/ArcticDock";
import { inboxRowOf } from "@/lib/inboxKinds";
import { nickOf } from "@/lib/nick";

const NOTI_TYPE_STYLES: Record<string, string> = {
  경고: "bg-[#e91e3f]/10 text-[#e91e3f] border-[#e91e3f]/25",
  제재: "bg-[#fdf1e3] text-[#a8763a] border-[#f0dcc0]",
  안내: "bg-[#e6f0fa] text-[#2f6fb0] border-[#c9dff2]",
  축하: "bg-[#e8f3e6] text-[#3f7a35] border-[#cfe5cb]",
  일반: "bg-[#f2f2f2] text-[#5a5a5a] border-[#ededed]",
};

// 📌 알림 상세 — 읽는 것은 페이지 (URL 이 있고 뒤로가기가 된다). 헤더 종·알림함 목록이 여기로 온다.
//    📌 2026-10-31 봇 DM 기록(source bot — bot/src/inbox.js)도 같은 화면: 종류 글자(lib/inboxKinds.js) · DM 본문 · DM 칸(수량 · 사유 …) 표 · DM 과 같은 단추
export default function NoticeDetailPage() {
  const { data: session, status } = useSession();
  const { id } = useParams<{ id: string }>();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [item, setItem] = useState<any | null | undefined>(undefined);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch(`/api/notifications?one=${encodeURIComponent(String(id || ""))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const hit = d?.success && d.data ? d.data : null;
        setItem(hit);
        // 읽음 처리 — 연 알림 한 건만 (다른 안 읽은 알림은 그대로 둔다)
        if (hit && !hit.read) {
          fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: hit._id }) }).catch(() => {});
        }
      })
      .catch(() => setItem(null));
  }, [status, session, id]);

  const row = item ? inboxRowOf(item) : null;
  const bot = item?.source === "bot";
  const detail: { name: string; value: string }[] = Array.isArray(item?.detail) ? item.detail.filter((x: any) => x?.name && x?.value) : [];
  const sender = bot || item?.source === "site" ? "고급 이글루" : `고급 이글루 운영팀${item?.sentBy ? ` (${item.sentBy})` : ""}`;

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <article className="w-full max-w-3xl mx-auto px-6 pt-8 pb-20">
        <BackLink href={`/profile/notice${q}`} label="알림함" />
        {item === undefined ? (
          <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
        ) : item === null || !row ? (
          <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">알림을 찾을 수 없습니다.</p>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              {item.kind ? (
                <span className="text-[10px] font-black tracking-wider border px-2 py-1 rounded bg-[#f2f2f2] text-[#5a5a5a] border-[#ededed]">{row.label}</span>
              ) : (
                <span className={`text-[10px] font-black tracking-wider border px-2 py-1 rounded ${NOTI_TYPE_STYLES[item.type] || NOTI_TYPE_STYLES["일반"]}`}>{item.type}</span>
              )}
              <span className="ml-auto text-[11px] text-[#a3a3a3] tabular-nums">{item.createdAt ? new Date(item.createdAt).toLocaleString("ko-KR") : ""}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-[#131313] break-keep leading-snug tracking-tight mb-6">{item.title}</h1>
            <div className="rounded-lg border border-[#ededed] bg-white divide-y divide-[#ededed] mb-8">
              <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">수신</span><span className="text-[#5a5a5a] font-bold">{nickOf(session?.user)}</span></div>{/* 📌 2026-11-01 서버 별명 */}
              <div className="flex items-center justify-between px-4 py-2.5 text-xs"><span className="text-[#8a8a8a] font-bold">발신</span><span className="text-[#5a5a5a] font-bold">{sender}</span></div>
            </div>
            <div className="text-[15px] text-[#5a5a5a] leading-relaxed break-keep"><RenderFormattedText text={item.content} /></div>
            {/* DM 칸(수량 · 사유 …) — 이름표는 여기 표에만(목록 줄엔 값만) */}
            {detail.length > 0 && (
              <div className="mt-6 rounded-lg border border-[#ededed] bg-white divide-y divide-[#ededed]">
                {detail.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                    <span className="shrink-0 text-[#8a8a8a] font-bold">{d.name}</span>
                    <span className="min-w-0 text-right text-[#131313] font-bold break-keep">{d.value}</span>
                  </div>
                ))}
              </div>
            )}
            {row.link && (
              <Link href={row.link.url} className="mt-8 inline-block h-11 px-6 bg-[#131313] text-white text-[13px] font-black leading-[44px] hover:bg-[#3a3a3a] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                {row.link.label}
              </Link>
            )}
          </>
        )}
      </article>
      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
