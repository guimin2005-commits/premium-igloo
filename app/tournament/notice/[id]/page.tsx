"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EsportsStyles } from "../../../components/Esports";

/* 📌 대회 공지 한 건 = 한 페이지.
   팝업으로 띄우지 않는다 — 링크로 공유하고 새로고침해도 그대로 남아야 한다. */

const G = "#00e07b";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (d: Date) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function TournamentNoticeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/scrim", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.success) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-gray-500 text-sm">로딩 중...</div>;

  const notices: any[] = data?.notices || [];
  const n = notices.find((x: any) => x._id === id);
  const season = data?.season;

  if (!n) {
    return (
      <main className="w-full max-w-lg mx-auto px-6 py-40 text-center">
        <EsportsStyles />
        <h2 className="text-xl font-black text-white mb-2">공지를 찾을 수 없습니다</h2>
        <p className="text-gray-500 text-sm mb-6">삭제되었거나 아직 공개되지 않은 공지입니다.</p>
        <button onClick={() => router.push("/tournament/notice")} className="esp-cut-sm bg-white/[0.06] text-gray-300 text-xs font-black px-5 py-3">공지 목록으로</button>
      </main>
    );
  }

  const idx = notices.findIndex((x: any) => x._id === id);
  const prev = notices[idx - 1];
  const next = notices[idx + 1];
  const pub = new Date(n.publishAt);
  const scheduled = pub.getTime() > Date.now();

  return (
    <main className="flex-1 w-full flex flex-col">
      <EsportsStyles />

      <article className="w-full px-5 md:px-8 pt-10 pb-12">
        <div className="max-w-[820px] mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/tournament/notice" className="text-[10px] font-black esp-mono text-gray-500 hover:text-white transition-colors">← 대회 공지</Link>
            <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/25 to-transparent" />
            <span className="text-[10px] font-black esp-mono" style={{ color: G }}>{season?.title || "대회 룸"}</span>
          </div>

          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {n.pinned && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black" style={{ background: G, color: "#04120b" }}>고정</span>}
            {n.important && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-rose-500/20 text-rose-300">중요</span>}
            {scheduled && <span className="esp-cut-sm px-2 py-0.5 text-[9px] font-black bg-amber-400/15 text-amber-300">예약 · 아직 공개 전</span>}
          </div>

          <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep">{n.title}</h1>

          <div className="flex items-center gap-3 mt-5 pb-5 border-b border-white/[0.08]">
            <span className="text-[11px] font-black esp-mono text-gray-500 tabular-nums">{fmt(pub)}</span>
            {n.authorName && <span className="text-[11px] font-bold text-gray-600">{n.authorName}</span>}
            <button
              onClick={() => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
              className="ml-auto esp-cut-sm px-3 py-1.5 text-[10px] font-black bg-white/[0.05] text-gray-400 hover:text-white transition-colors">
              {copied ? "복사됨" : "링크 복사"}
            </button>
          </div>

          {n.body
            ? <p className="mt-7 text-[14px] md:text-[15px] font-medium text-gray-300 leading-[1.9] whitespace-pre-line break-keep">{n.body}</p>
            : <p className="mt-7 text-[13px] font-bold text-gray-600">내용이 없습니다.</p>}

          {/* 앞뒤 공지 — 목록으로 돌아가지 않고 이어 읽는다 */}
          {(prev || next) && (
            <div className="mt-12 pt-6 border-t border-white/[0.08] grid gap-2.5 sm:grid-cols-2">
              {prev ? (
                <Link href={`/tournament/notice/${prev._id}`} className="esp-cut border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-4 py-3.5">
                  <span className="block text-[9px] font-black esp-mono text-gray-600 mb-1.5">이전 공지</span>
                  <span className="block text-[12px] font-black text-gray-300 truncate">{prev.title}</span>
                </Link>
              ) : <span />}
              {next && (
                <Link href={`/tournament/notice/${next._id}`} className="esp-cut border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] transition-colors px-4 py-3.5 sm:text-right">
                  <span className="block text-[9px] font-black esp-mono text-gray-600 mb-1.5">다음 공지</span>
                  <span className="block text-[12px] font-black text-gray-300 truncate">{next.title}</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </article>
    </main>
  );
}
