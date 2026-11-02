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
import { replaceItemTags } from "@/lib/itemTag";
import { INBOX_CATS, inboxRowOf, answerRowOf } from "@/lib/inboxKinds";

// 미리보기용 마크다운 기호 제거
const stripMd = (t: string) =>
  replaceItemTags(t || "").replace(/\*\*(.*?)\*\*/g, "$1").replace(/__(.*?)__/g, "$1").replace(/~~(.*?)~~/g, "$1").replace(/==(.*?)==/g, "$1").replace(/\{([^}]+)\}/g, "$1");

// 이 기기에 적어 둔 문의 답변 id(본 것 · 지운 것) — 상단 종(app/ClientLayout.tsx)과 같은 열쇠
const readIds = (k: string): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "[]");
    return new Set(Array.isArray(v) ? v.map(String) : []);
  } catch {
    return new Set();
  }
};
const writeIds = (k: string, set: Set<string>, max: number) => {
  try { localStorage.setItem(k, JSON.stringify(Array.from(set).slice(-max))); } catch {}
};

type Row = ReturnType<typeof inboxRowOf>;

// 줄 아이콘 — 종류마다 사이트 선 아이콘 하나(경고 · 제재만 빨강)
function KindIcon({ name, warn, size }: { name: string; warn: boolean; size: number }) {
  const d = (ICON_PATHS as Record<string, string>)[name] || ICON_PATHS.bell;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={warn ? "#d01634" : "#131313"} strokeWidth={1.6}>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

// 📌 알림함 — 내 정보에서 분리한 페이지. 헤더 종 아이콘의 '전체 보기'가 여기로 온다.
//    📌 2026-10-31 개편(운영자 "알림함 개선 · 디스코드 봇 메시지랑 연계") — 봇 DM 도 여기 쌓인다(bot/src/inbox.js). 문의 답변도 같은 목록.
//       위 칩(전체 / 운영팀 / 지급 / 기간 / 이벤트 — 폭 고정 · 안 읽은 칸에 점) · 줄 = 종류 아이콘 · 작은 글자(종류 · 시각) · 제목 · 한 줄 · DM 과 같은 단추.
//       줄을 누르면 상세(/profile/notice/[id]), 단추를 누르면 그 화면. 폰은 단추가 글 아래로. 칩 · 아이콘 정의는 lib/inboxKinds.js
export default function NoticeInboxPage() {
  const { data: session, status } = useSession();
  const fromArctic = useSearchParams().get("from") === "arctic";
  const q = fromArctic ? "?from=arctic" : "";
  const [notifs, setNotifs] = useState<any[] | null>(null);
  const [answers, setAnswers] = useState<any[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set()); // 들어올 때 이미 본 문의 답변(안 읽은 점은 이번 방문 동안 남는다)
  const [cat, setCat] = useState("전체");

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.name) return;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setNotifs(d?.success && Array.isArray(d.data) ? d.data : []))
      .catch(() => setNotifs([]));
    fetch("/api/inquiry?mine=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const cleared = readIds("clearedAnswerIds");
        const list = (Array.isArray(d?.data) ? d.data : []).filter((i: any) => i.status === "답변 완료" && !cleared.has(String(i._id)));
        const before = readIds("seenAnswerIds");
        setSeen(new Set(before));
        setAnswers(list);
        // 이 화면에서 봤다 — 상단 종 점에서 뺀다
        if (list.length) {
          list.forEach((i: any) => before.add(String(i._id)));
          writeIds("seenAnswerIds", before, 200);
          window.dispatchEvent(new Event("igloo:inbox")); // 상단 종(app/ClientLayout.tsx)이 다시 읽는다
        }
      })
      .catch(() => {});
  }, [status, session]);

  // 들어오면 안 읽은 알림을 서버에서 읽음 처리 — 이 화면의 점은 이번 방문 동안 그대로 둔다(칩 점으로 어디에 새 알림이 왔는지 보이게)
  const unreadServer = !!notifs?.some((n) => !n.read);
  useEffect(() => {
    if (status !== "authenticated" || !unreadServer) return;
    fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ markAll: true }) })
      .then(() => window.dispatchEvent(new Event("igloo:inbox")))
      .catch(() => {});
  }, [unreadServer, status]);

  // 📌 전체 삭제 — 누르면 바로 (본인 알림만 · 서버가 세션으로 확인). 문의 답변은 문의 내역에 남으니 이 목록에서만 치운다(상단 종과 같다)
  const clearAll = async () => {
    try {
      const r = await fetch("/api/notifications?mine=all", { method: "DELETE" }).then((x) => x.json());
      if (!r?.success) return;
      const cleared = readIds("clearedAnswerIds");
      answers.forEach((a) => cleared.add(String(a._id)));
      writeIds("clearedAnswerIds", cleared, 300);
      setNotifs([]);
      setAnswers([]);
      window.dispatchEvent(new Event("igloo:inbox"));
    } catch {}
  };

  const rows: Row[] | null = notifs === null ? null : [
    ...notifs.map((n) => inboxRowOf(n, q)),
    ...answers.map((a) => ({ ...answerRowOf(a, seen), href: `/profile/inquiry${q}` })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const shown = rows ? (cat === "전체" ? rows : rows.filter((r) => r.cat === cat)) : null;
  const unreadCats = new Set((rows || []).filter((r) => r.unread).map((r) => r.cat));

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-20">
        <BackLink href={`/profile${q}`} label="내 정보" />
        <div className="flex items-end justify-between gap-4 mb-5">
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">알림함 {(rows?.length || 0) > 0 && <span className="text-[#e91e3f]">{rows!.length}</span>}</h1>
          {(rows?.length || 0) > 0 && (
            <button type="button" onClick={clearAll} className="shrink-0 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus-visible:underline">
              전체 삭제
            </button>
          )}
        </div>

        {/* 종류 칩 — 폭 고정(눌러도 줄이 밀리지 않는다). 안 읽은 알림이 있는 칸에만 점 */}
        <div role="tablist" aria-label="알림 종류" className="flex gap-1.5 mb-3.5">
          {INBOX_CATS.map((c) => {
            const on = cat === c;
            return (
              <button key={c} type="button" role="tab" aria-selected={on} onClick={() => setCat(c)}
                className={`relative shrink-0 w-[58px] md:w-[68px] h-[30px] md:h-[32px] rounded-full border text-center text-[12px] md:text-[13px] font-bold leading-[28px] md:leading-[30px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${on ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] text-[#5a5a5a] hover:text-[#131313]"}`}>
                {c}
                {c !== "전체" && unreadCats.has(c) && <span aria-hidden className="absolute top-1 right-2 w-[5px] h-[5px] rounded-full bg-[#e91e3f]"></span>}
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#131313]">
          {shown === null ? (
            <p className="text-[#a3a3a3] text-sm py-12 text-center">데이터 로딩 중...</p>
          ) : shown.length === 0 ? (
            <p className="py-14 text-center text-sm text-[#8a8a8a] break-keep">받은 알림이 없습니다.</p>
          ) : (
            <div>
              {shown.map((r) => (
                <div key={r.key} className="relative flex items-start md:items-center gap-3 md:gap-4 py-3.5 md:py-4 px-1 border-b border-[#ededed] hover:bg-black/[0.02] transition-colors group">
                  {/* 줄 전체가 상세로 — 단추만 그 위에 따로 */}
                  <Link href={r.href} aria-label={r.title} className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#e91e3f]/40"></Link>
                  <span className="relative shrink-0 w-11 h-11 md:w-[52px] md:h-[52px] bg-[#f2f2f2] flex items-center justify-center pointer-events-none">
                    <KindIcon name={r.icon} warn={r.warn} size={22} />
                  </span>
                  <div className="relative min-w-0 flex-1 pointer-events-none">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[11px] font-black ${r.warn ? "text-[#d01634]" : "text-[#5a5a5a]"}`}>{r.label}</span>
                      <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{agoLabel(r.at)}</span>
                    </div>
                    {/* 📌 안 읽음 점은 제목 앞 틈에 걸어 둔다 — 자리를 차지하지 않는다 */}
                    <div className="relative flex items-center">
                      {r.unread && <span aria-hidden className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#e91e3f]"></span>}
                      <h4 className="text-[14px] md:text-[15px] font-black truncate text-[#131313]">{r.title}</h4>
                    </div>
                    {r.summary && <p className="text-[12.5px] text-[#5a5a5a] truncate mt-0.5">{stripMd(r.summary)}</p>}
                    {r.link && (
                      <Link href={r.link.url} className="md:hidden pointer-events-auto relative z-10 inline-block mt-2 h-[30px] px-3.5 border border-[#131313] bg-white text-[12px] font-black leading-[28px] text-[#131313] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                        {r.link.label}
                      </Link>
                    )}
                  </div>
                  {r.link ? (
                    <Link href={r.link.url} className="hidden md:block relative z-10 shrink-0 w-[112px] h-[34px] border border-[#131313] bg-white text-center text-[12px] font-black leading-[32px] text-[#131313] hover:bg-[#131313] hover:text-white transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                      {r.link.label}
                    </Link>
                  ) : (
                    <span aria-hidden className="hidden md:block shrink-0 w-[112px]"></span>
                  )}
                  <svg aria-hidden className="hidden md:block relative w-4 h-4 text-[#b9b7b3] group-hover:text-[#5a5a5a] shrink-0 transition-colors pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS.chevronRight} /></svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {fromArctic && <ArcticDock activeKey="me" />}
    </main>
  );
}
