"use client";

import React, { useLayoutEffect, useRef } from "react";
import { RenderFormattedText } from "../components/FormattedText";
import { EsportsStyles, STATUS_META } from "../components/Esports";
import { PHASES, phaseOf, statusOf } from "@/lib/tournamentPhase";

/* 📌 글쓰기 미리보기 — 글 보기 화면과 똑같이 그린다.
   본문은 같은 RenderFormattedText, 감싸는 틀 · 머리는 각 글 보기 화면의 클래스를 그대로 옮겨 왔다(출처 줄 표기).
   ⚠ 저쪽(app/notice/[id] · app/event/[id] · app/tournament/[id] · app/supporters/NoticeDetail.tsx)을 바꾸면 여기도 같이 바꾼다.
   목록으로 가는 줄(BackLink) · 수정/삭제 단추 · 반응 줄처럼 글이 아닌 것은 뺐다. */

export type PreviewPost = {
  category: string;
  title: string;
  content: string;
  author: string;
  publishAt: string; // datetime-local 값 그대로("" 이면 createdAt)
  createdAt: string;
  now: string; // 미리보기를 연 시각 — 예약 여부 판정용
  hidden: boolean;
  noticeTag: string;
  isPinned: boolean;
  bannerUrl: string;
  eventTag: string;
  eventPeriod: string;
  tournamentGame: string;
  tournamentPhase: string;
  tournamentStatus: string;
  tournamentType: string;
  tournamentTeamDay: string;
  tournamentEventDay: string;
  tournamentDate: string;
  tournamentSchedule: { label: string; start: string; end: string }[];
};

// ── 본문 틀 ──────────────────────────────────────────────
//    면(바탕 · 글자색) + 본문 div 클래스. 본문 div 의 위 여백(mt-7 등)은 머리와의 간격이라 기사 쪽에서 붙인다
const NOTICE_BODY = "text-[14px] md:text-[15px] leading-[1.9] text-[#5a5a5a] break-keep"; // app/notice/[id]/page.tsx · app/event/[id]/page.tsx 본문 div
const TOUR_BODY = "text-gray-300 text-[15px] leading-[1.9] break-keep"; // app/tournament/[id]/page.tsx ABOUT
const SP_BODY = "sp-body text-[15px] text-[#5a5a5a] leading-[1.9] whitespace-pre-wrap break-keep select-text"; // app/supporters/NoticeDetail.tsx 본문
// 면 — 공지 · 이벤트는 흰 화면(ClientLayout WHITE_ROOTS) + main text-[#131313], 대회는 사이트 기본 #090909 + body text-white, 서포터즈는 main bg-[#f4f3f2]
const SURFACE: Record<string, string> = {
  공지사항: "bg-white text-[#131313]",
  이벤트: "bg-white text-[#131313]",
  대회: "bg-[#090909] text-white",
  서포터즈: "bg-[#f4f3f2] text-[#131313]",
};
const BODY: Record<string, string> = { 공지사항: NOTICE_BODY, 이벤트: NOTICE_BODY, 대회: TOUR_BODY, 서포터즈: SP_BODY };

// 서포터즈 화면이 본문 표 · 그림 선을 라이트 면에 맞춰 덮는 규칙(NoticeDetail.tsx 의 <style> 과 같다)
const SpBodyStyle = () => (
  <style>{`
    .sp-body table, .sp-body th, .sp-body td { border-color: rgba(0,0,0,0.12); }
    .sp-body th { background: rgba(0,0,0,0.03); }
    .sp-body img { border-color: rgba(0,0,0,0.08); }
  `}</style>
);

export const surfaceOf = (category: string) => SURFACE[category] || SURFACE["공지사항"];

// ── 실제 폭 ──────────────────────────────────────────────
//    📌 /write 는 왼쪽 관리자 메뉴(232) · 게시 설정 칸(384) · 여백 때문에 미리보기 상자가 글 보기 화면보다 좁다
//       (1440 에서 상자 약 750 · 글 칸 약 685 ↔ 실제 820). 그래서 기사를 "지금 화면 폭에서 글 보기 화면이 쓰는 폭" 그대로 짜고
//       (줄바꿈 · 표 열 너비 · 그림 높이가 같다) 상자보다 넓으면 zoom 으로 통째로 줄인다. md · xl 조건은 같은 화면이라 그대로 맞는다.
const padOf = (vw: number) => (vw >= 768 ? 32 : 20); // px-5 md:px-8
// 기사 한 장(양옆 여백 포함)
const articleWidth = (category: string, vw: number) => {
  const pad = padOf(vw);
  if (category === "대회") return (vw >= 1280 ? 828 : Math.min(vw - pad * 2, 1180)) + pad * 2; // xl = ABOUT 칸(1180 - 320 - 32). 머리도 이 폭
  if (category === "서포터즈") return Math.min(vw, 1024); // max-w-5xl(여백 포함)
  return Math.min(vw, 820 + pad * 2); // 공지 · 이벤트 max-w-[820px]
};
// 본문 칸만(여백 뺀 폭) — 표 창 미리보기
const bodyWidth = (category: string, vw: number) => articleWidth(category, vw) - padOf(vw) * 2;

// box(상자) 안의 inner 를 실제 폭으로 두고, 넘치면 줄인다. DOM 에 바로 적어 첫 그림부터 맞고(깜빡임 없음),
// 쓰는 쪽의 스크롤 복원(부모 useLayoutEffect)보다 먼저 돈다
function useRealWidth(box: React.RefObject<HTMLDivElement | null>, category: string, widthOf: (c: string, vw: number) => number) {
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const el = inner.current;
    if (!b || !el) return;
    const fit = () => {
      const cs = getComputedStyle(b);
      const avail = b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const w = widthOf(category, document.documentElement.clientWidth);
      el.style.width = `${w}px`;
      el.style.zoom = String(Math.min(1, Math.floor((avail / w) * 1000) / 1000)); // 내림 — 반올림 1px 가로 넘침 방지
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(b);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, [box, category, widthOf]);
  return inner;
}

// 표 창 미리보기처럼 본문만 보일 때 — 그 종류의 면 + 본문 틀(실제 본문 칸 폭)
export function PostBodyFrame({ category, className = "", children }: { category: string; className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRealWidth(box, category, bodyWidth);
  return (
    <div ref={box} className={`${surfaceOf(category)} ${className}`}>
      {category === "서포터즈" && <SpBodyStyle />}
      <div ref={inner} className="mx-auto">
        <div className={BODY[category] || NOTICE_BODY}>{children}</div>
      </div>
    </div>
  );
}

// ── 날짜 ────────────────────────────────────────────────
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (v: string) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
};
// 공지 · 이벤트 상세의 fmt — 2026.10.03(토)
const fmtWd = (v: string) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WD[d.getDay()]})` : "";
};
// 서포터즈 상세의 fmtDate — 2026.10.03
const fmtDot = (v: string) => {
  const d = toDate(v);
  return d ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : "";
};
const shownAt = (p: PreviewPost) => p.publishAt || p.createdAt || p.now;

// 제목이 비었을 때만 옅게 — 글 보기 화면에는 제목 없는 글이 없다
const Title = ({ p, dark = false }: { p: PreviewPost; dark?: boolean }) =>
  p.title.trim() ? <>{p.title}</> : <span className={dark ? "text-gray-600" : "text-[#a3a3a3]"}>제목 없음</span>;

// 링크 복사 단추 — 모양만(미리보기에서는 누르지 않는다)
const CopyChip = () => (
  <span aria-hidden className="ml-auto inline-grid place-items-center rounded-full px-3.5 py-1.5 text-[10px] font-bold bg-[#f2f2f2] text-[#5a5a5a]">링크 복사</span>
);

// ── 공지사항 — app/notice/[id]/page.tsx ──────────────────
function NoticeArticle({ p }: { p: PreviewPost }) {
  const important = p.noticeTag === "중요" || p.noticeTag === "필독";
  return (
    <div className="w-full px-5 md:px-8 pt-10 pb-20">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={`text-[11px] font-black ${important ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>
            {important ? "중요" : p.noticeTag === "업데이트" ? "업데이트" : "일반"}
          </span>
          {p.isPinned && <span className="text-[11px] font-black text-[#a3a3a3]">고정</span>}
        </div>

        <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep"><Title p={p} /></h1>

        <div className="flex items-center gap-3 mt-5 pb-5 border-b border-[#ededed]">
          <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{fmtWd(shownAt(p))}</span>
          <CopyChip />
        </div>

        {p.bannerUrl && (
          <div className="mt-7 w-full aspect-[16/7] bg-[#f2f2f2] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.bannerUrl} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        <div className={`mt-7 ${NOTICE_BODY}`}>
          <RenderFormattedText text={p.content} />
        </div>
      </div>
    </div>
  );
}

// ── 이벤트 — app/event/[id]/page.tsx ─────────────────────
function EventArticle({ p }: { p: PreviewPost }) {
  const tag = p.eventTag && p.eventTag !== "NONE" ? p.eventTag : "";
  return (
    <div className="w-full px-5 md:px-8 pt-10 pb-24 md:pb-20">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          {tag && <span className="text-[11px] font-black text-[#e91e3f]">{tag}</span>}
          <span className="text-[12px] font-bold text-[#5a5a5a] tabular-nums">{p.eventPeriod || "날짜 미정"}</span>
        </div>

        <h1 className="text-[24px] md:text-[32px] font-black tracking-tight leading-snug break-keep"><Title p={p} /></h1>

        <div className="flex items-center gap-3 mt-5 pb-5 border-b border-[#ededed]">
          <CopyChip />
        </div>

        <div className="mt-7 w-full aspect-[16/7] bg-[#f2f2f2] overflow-hidden flex items-center justify-center">
          {p.bannerUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.bannerUrl} alt="" className="w-full h-full object-cover" />
            : <span className="text-[12px] font-bold text-[#a3a3a3]">이벤트</span>}
        </div>

        <div className={`mt-7 ${NOTICE_BODY}`}>
          <RenderFormattedText text={p.content} />
        </div>
      </div>
    </div>
  );
}

// ── 대회 — app/tournament/[id]/page.tsx 머리 + ABOUT ─────
//    대진표 · 오른쪽 정보 칸은 뺐다(대진표는 대진표 판 아래 미리보기가 따로 있다). ABOUT 은 xl 에서 왼쪽 칸 폭(1180 - 320 - 32)
const G = "#00e07b";
function TournamentArticle({ p }: { p: PreviewPost }) {
  const cur = phaseOf(p);
  const idx = PHASES.findIndex((x) => x.id === cur);
  const meta = STATUS_META[statusOf(p)] || STATUS_META["예정됨"];
  return (
    <>
      <EsportsStyles />
      <section className="relative w-full overflow-hidden">
        {p.bannerUrl && (
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.bannerUrl} alt="" className="w-full h-full object-cover opacity-25" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090909] via-[#090909]/80 to-[#090909]/40" />
          </div>
        )}
        <div className="absolute inset-0 esp-mesh pointer-events-none" />
        <div className="absolute inset-0 esp-scan pointer-events-none opacity-30" />

        <div className="relative max-w-[1180px] mx-auto px-5 md:px-8 pt-9 pb-7">
          <div className="flex items-center gap-3 mb-5">
            <span className="w-2 h-2 esp-blink" style={{ background: G, clipPath: "polygon(50% 0,100% 50%,50% 100%,0 50%)" }} />
            <span className="text-[10px] font-black esp-mono uppercase truncate" style={{ color: G }}>{p.tournamentGame || "TOURNAMENT"}</span>
            <span className="h-px flex-1 min-w-0 max-w-[200px] bg-gradient-to-r from-[#00e07b]/40 to-transparent" />
          </div>

          {p.hidden && (
            <div className="mb-3 esp-cut-sm inline-block px-3 py-1.5 text-[11px] font-black bg-amber-400/12 text-amber-300 border border-amber-400/30">숨김 상태 — 관리자에게만 보입니다</div>
          )}
          <div className="flex flex-wrap items-center gap-2.5 mb-3">
            <span className={`px-2.5 py-1 text-[11px] font-black esp-cut-sm ${meta.badge}`}>{meta.label}</span>
            {p.tournamentDate && <span className="text-[11px] font-bold text-gray-400 tabular-nums">{p.tournamentDate.replace(/-/g, ".")}</span>}
          </div>
          <h1 className="text-[26px] md:text-[38px] font-black tracking-tighter leading-[1.05] break-keep"><Title p={p} dark /></h1>

          <div className="flex gap-1 mt-7">
            {PHASES.map((ph, i) => {
              const done = i < idx, on = i === idx;
              return (
                <div key={ph.id} className="flex-1 min-w-0">
                  <div className="h-1" style={{ background: on ? G : done ? "rgba(0,224,123,.35)" : "rgba(255,255,255,.08)" }} />
                  <p className={`mt-2 text-[9px] font-black esp-mono truncate ${on ? "text-[#00e07b]" : done ? "text-gray-500" : "text-gray-700"}`}>{ph.code}</p>
                  <p className={`text-[10px] font-bold truncate ${on ? "text-white" : "text-gray-600"}`}>{ph.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="w-full px-5 md:px-8 py-8">
        <div className="max-w-[1180px] mx-auto">
          <div className="min-w-0 xl:max-w-[828px]">
            {p.content ? (
              <section>
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-[10px] font-black esp-mono shrink-0" style={{ color: G }}>ABOUT</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-[#00e07b]/30 to-transparent" />
                </div>
                <div className={TOUR_BODY}>
                  <RenderFormattedText text={p.content} />
                </div>
              </section>
            ) : (
              <section className="esp-cut border border-dashed border-white/10 px-6 py-10 text-center">
                <p className="text-[12px] font-bold text-gray-500">대회 소개가 아직 등록되지 않았습니다</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── 서포터즈 — app/supporters/NoticeDetail.tsx 글 한 건 ─
function SupportersArticle({ p }: { p: PreviewPost }) {
  const pub = p.publishAt ? toDate(p.publishAt) : null;
  const now = toDate(p.now);
  const scheduled = !!pub && !!now && pub.getTime() > now.getTime();
  return (
    <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-20">
      <SpBodyStyle />
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{fmtDot(shownAt(p))}</span>
        {scheduled && (
          <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-black text-white" style={{ background: "#3f83b8" }}>예약</span>
        )}
        {p.hidden && (
          <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/[0.08] text-[9px] font-black text-[#5a5a5a]">가림</span>
        )}
      </div>
      <h1 className="mt-3 text-2xl md:text-3xl font-black text-[#131313] tracking-tight leading-snug break-keep"><Title p={p} /></h1>

      <div className={`mt-6 pt-6 border-t border-black/[0.08] ${SP_BODY}`}>
        <RenderFormattedText text={p.content} />
      </div>
      {p.bannerUrl && (
        <div className="mt-6 rounded-2xl overflow-hidden border border-black/[0.08]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.bannerUrl} alt="" className="block w-full h-auto" />
        </div>
      )}
    </div>
  );
}

// 📌 boxRef · className 은 쓰는 쪽(편집 칸 자리)이 준다 — 스크롤 칸이 면 색을 갖게 이 div 가 곧 스크롤 칸.
//    안쪽은 실제 기사 폭(useRealWidth) — 상자가 좁으면 줄여서 맞춘다
export default function PostPreview({ post, className = "", boxRef }: { post: PreviewPost; className?: string; boxRef?: React.RefObject<HTMLDivElement | null> }) {
  const k = post.category;
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef || own;
  const inner = useRealWidth(box, k, articleWidth);
  return (
    <div ref={box} className={`${surfaceOf(k)} ${className}`}>
      <div ref={inner} className="mx-auto">
        {k === "이벤트" ? <EventArticle p={post} />
          : k === "대회" ? <TournamentArticle p={post} />
          : k === "서포터즈" ? <SupportersArticle p={post} />
          : <NoticeArticle p={post} />}
      </div>
    </div>
  );
}
