"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Reveal } from "../components/Lux";
import { EmptySlot } from "../components/Hud";
import { RenderFormattedText } from "../components/FormattedText";
import { isAdminName } from "@/lib/admins";
import { VOICE_TIME_START } from "@/lib/season";

// 📌 서포터즈 전용 — 활동 · 평가·지급 · 공지·가이드 · 신고·피드백 네 탭.
//    입장은 세션 플래그(isSupporter)로 먼저 가르고, 서버(/api/supporters/*)가 다시 막는다.
//    관리자는 운영 확인용으로 통과한다 (서버도 같은 기준).
//    탭은 URL(?tab=)이 기준 — 디스코드 안내에서 /supporters?tab=reports 로 바로 들어올 수 있어야 한다.

type Activity = { chatCount: number; voiceMin: number };
type EvalRow = {
  month: string;
  grade?: string;
  xp?: number;
  point?: number;
  note?: string;
  status: "draft" | "paid";
  paidAt?: string | null;
};
type MeData = {
  month: string;
  activity: Activity;
  prev: Activity & { month: string };
  voiceSeasonSec: number;
  daily?: { day: number; chat: number; voiceMin: number }[];
  goals: { chat: number; voiceMin: number };
  baseXp: number;
  evals: EvalRow[];
};
type Post = { _id: string; title: string; content?: string; bannerUrl?: string; createdAt: string; publishAt?: string | null; hidden?: boolean };
type Comment = {
  _id: string;
  userId: string;
  userName: string;
  userImage?: string;
  content: string;
  createdAt: string;
  mine?: boolean;
  pending?: boolean; // 서버 응답 전 낙관적 항목 — 삭제 x 를 감춘다
};
type ReportType = "report" | "feedback";
type Report = {
  _id: string;
  type: ReportType;
  target: string;
  content: string;
  status: "open" | "done";
  adminReply?: string;
  repliedAt?: string | null;
  createdAt: string;
  editable?: boolean; // 서버가 계산 — open 이고 답변 전
};
type AckUser = { userId: string; userName: string; at?: string };
type AckStats = { total: number; byPost: Record<string, { count: number; users: AckUser[] }> };
type Toast = { id: number; msg: string; accent?: boolean };

const BLUE = "#3f83b8"; // 서포터즈 식별색 — 태그·답변 인용에만 쓴다
const CONTENT_MAX = 2000;
const TARGET_MAX = 80;
const COMMENT_MAX = 1000;

// 첫 탭은 URL 에 남기지 않는다 (/level 과 같은 규칙)
const TABS = [
  { id: "activity", name: "활동" },
  { id: "evals", name: "평가·지급" },
  { id: "notice", name: "공지·가이드" },
  { id: "reports", name: "신고·피드백" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const pad = (n: number) => String(n).padStart(2, "0");
const fmtMonth = (key: string) => {
  const [y, m] = String(key || "").split("-");
  return y && m ? `${y}년 ${+m}월` : key;
};
const fmtDate = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
};
// 분 → 큰 숫자 조각. 한 시간 미만이면 분만 보여 준다
const hmParts = (min: number) => {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h > 0 ? [{ n: h, u: "시간" }, { n: r, u: "분" }] : [{ n: r, u: "분" }];
};
const fmtHm = (min: number) => hmParts(min).map((p) => `${p.n.toLocaleString()}${p.u}`).join(" ");
// 댓글 시각 — 일주일 안은 상대 시간, 그 뒤는 날짜
const fmtAgo = (v: string) => {
  const t = new Date(v).getTime();
  if (isNaN(t)) return "";
  const d = Date.now() - t;
  if (d < 60e3) return "방금";
  if (d < 3600e3) return `${Math.floor(d / 60e3)}분 전`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)}시간 전`;
  if (d < 7 * 86400e3) return `${Math.floor(d / 86400e3)}일 전`;
  return fmtDate(v);
};
const pctOf = (cur: number, goal: number) => (goal > 0 ? Math.min(100, Math.floor((cur / goal) * 100)) : 0);
const plus = (n?: number) => (n && n > 0 ? `+${n.toLocaleString()}` : "—");

// 클릭 피드백 — 레벨 페이지와 같은 짧은 톤
const tone = (freq = 620, dur = 0.04) => {
  try {
    const w = window as any;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!tone.ctx) tone.ctx = new Ctx();
    const ctx = tone.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.025, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch {}
};
tone.ctx = null as any;

// 구획 머리말 — /level 랭킹 탭과 같은 크기·색
const SectionHeader = ({ title, right }: { title: string; right?: React.ReactNode }) => (
  <div className="mb-6 md:mb-8">
    <div className="flex items-end justify-between gap-4">
      <h2 className="min-w-0 text-xl md:text-2xl font-black text-[#131313] tracking-tight break-keep">{title}</h2>
      {right}
    </div>
  </div>
);

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold text-[#8a8a8a]">{children}</p>
);

// 큰 수치 — 숫자는 크게, 단위는 작게 같은 기준선에. 잉크 패널 위에서는 dark 로 뒤집는다
const Big = ({
  parts,
  size = "lg",
  dark = false,
  tint,
}: {
  parts: { n: number | string; u: string }[];
  size?: "lg" | "panel" | "md";
  dark?: boolean;
  tint?: string;
}) => (
  <p
    className={`mt-1.5 flex flex-wrap items-baseline gap-x-2 font-black tabular-nums tracking-tight leading-none ${
      dark ? "text-white" : "text-[#131313]"
    } ${size === "lg" ? "text-4xl md:text-5xl" : size === "panel" ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"}`}
    style={tint ? { color: tint } : undefined}
  >
    {parts.map((p, i) => (
      <span key={i} className="inline-flex items-baseline gap-x-1">
        {typeof p.n === "number" ? p.n.toLocaleString() : p.n}
        <span className={`font-bold ${dark ? "text-white/40" : "text-[#8a8a8a]"} ${size === "md" ? "text-xs md:text-sm" : "text-sm md:text-base"}`}>{p.u}</span>
      </span>
    ))}
  </p>
);

// 월간 목표 게이지 (잉크 패널용) — 목표가 0 이면 그리지 않는다 (호출부에서 수치만 남긴다)
const InkGoal = ({ cur, goal, curLabel, goalLabel }: { cur: number; goal: number; curLabel: string; goalLabel: string }) => {
  if (!(goal > 0)) return null;
  const pct = pctOf(cur, goal);
  const done = cur >= goal;
  return (
    <div className="mt-4">
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${done ? "bg-[#e91e3f]" : "bg-white"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2 text-[11px] font-bold tabular-nums">
        <span className="text-white/50">
          {curLabel} <span className="text-white/25">/ {goalLabel}</span>
        </span>
        {done ? (
          <span className="inline-flex items-center h-5 px-2 rounded-full bg-[#e91e3f] text-white text-[10px] font-black">달성</span>
        ) : (
          <span className="text-white/45">{pct}%</span>
        )}
      </div>
    </div>
  );
};

// 평가 상태 한 조각 — 지급 완료(날짜) / 평가 중
const EvalStatus = ({ e, size = "sm" }: { e: EvalRow; size?: "sm" | "md" }) => {
  const cls = size === "md" ? "text-[13px]" : "text-[12px]";
  return e.status === "paid" ? (
    <span className={`font-bold text-[#131313] tabular-nums whitespace-nowrap ${cls}`}>
      지급 완료{e.paidAt ? <span className="text-[#a3a3a3]"> · {fmtDate(e.paidAt)}</span> : null}
    </span>
  ) : (
    <span className={`font-bold text-[#8a8a8a] whitespace-nowrap ${cls}`}>평가 중</span>
  );
};

const CheckMark = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="3.2">
    <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CloseIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M6 18 18 6M6 6l12 12" strokeLinecap="round" />
  </svg>
);

const LinkIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CommentIcon = ({ className = "w-3.5 h-3.5" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M21 12a8 8 0 0 1-8 8H9l-5 3 1.2-4.2A8 8 0 1 1 21 12Z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowRight = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    className={`shrink-0 w-4 h-4 transition-transform ${open ? "rotate-180 text-[#e91e3f]" : "text-[#a3a3a3] group-hover:text-[#131313]"}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 신고/피드백 유형 배지 — 신고는 강조색, 피드백은 서포터즈 파랑
const TypeBadge = ({ type }: { type: ReportType }) => {
  const report = type === "report";
  return (
    <span
      className="inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-black whitespace-nowrap"
      style={report ? { color: "#e91e3f", borderColor: "rgba(233,30,63,0.45)" } : { color: BLUE, borderColor: "rgba(63,131,184,0.5)" }}
    >
      {report ? "유저 신고" : "피드백"}
    </span>
  );
};

// 알약 세그먼트 — 탭 줄·랭킹 기준과 같은 문법
const pillClass = (on: boolean, size: "md" | "sm" = "md") =>
  `shrink-0 rounded-full font-bold transition-colors outline-none focus:outline-none ${
    size === "md" ? "px-4 py-2 text-[13px]" : "px-3.5 py-1.5 text-[12px]"
  } ${on ? "bg-[#131313] text-white" : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08] hover:text-[#131313]"}`;

const fieldClass =
  "w-full rounded-xl bg-white border border-black/[0.08] focus:border-[#131313] text-[14px] text-[#131313] outline-none transition-colors placeholder:text-[#a3a3a3]";

export default function SupportersPage() {
  const { data: session, status: authStatus } = useSession();
  const user = session?.user as any;

  // 하이드레이션 불일치 방지 — 첫 페인트는 항상 스켈레톤, 마운트 후에만 세션으로 가른다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authReady = mounted && authStatus !== "loading";

  const isAdmin = isAdminName(user?.name);
  const allowed = !!user && (!!user.isSupporter || isAdmin);

  // 탭 — URL 이 기준. 첫 탭은 파라미터를 지운다
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tabParam = searchParams.get("tab") || "";
  const tab: TabId = (TABS.find((t) => t.id === tabParam)?.id ?? "activity") as TabId;
  // 열린 공지도 URL(?tab=notice&id=)이 기준 — 새로고침·뒤로 가기·링크 공유가 그대로 통한다
  const idParam = searchParams.get("id") || "";
  const selectedId = tab === "notice" && idParam ? idParam : null;

  const setQuery = useCallback(
    (mutate: (q: URLSearchParams) => void, mode: "push" | "replace" = "replace") => {
      const q = new URLSearchParams(Array.from(searchParams.entries()));
      mutate(q);
      if (q.get("tab") === "activity") q.delete("tab");
      const qs = q.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [searchParams, router, pathname]
  );
  // 탭을 옮기면 열린 공지는 닫는다
  const setTab = useCallback(
    (id: TabId) =>
      setQuery((q) => {
        q.delete("id");
        if (id === "activity") q.delete("tab");
        else q.set("tab", id);
      }),
    [setQuery]
  );
  // 창을 열 때만 push — 뒤로 가기가 곧 닫기. 창 안에서 이전·다음으로 옮기거나 닫을 때는 replace
  const openPost = useCallback(
    (id: string) => {
      tone();
      setQuery((q) => {
        q.set("tab", "notice");
        q.set("id", id);
      }, "push");
    },
    [setQuery]
  );
  const goPost = useCallback(
    (id: string) => {
      tone();
      setQuery((q) => {
        q.set("tab", "notice");
        q.set("id", id);
      });
    },
    [setQuery]
  );
  const closePost = useCallback(() => setQuery((q) => q.delete("id")), [setQuery]);

  const [me, setMe] = useState<MeData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false); // 세션은 통과했지만 서버가 403 — 역할이 빠진 직후
  const [failed, setFailed] = useState(false);
  const [openEval, setOpenEval] = useState<string | null>(null);

  // 토스트 — 복사·제출 결과 피드백 (모바일 하단바 위로 띄움)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);
  const pushToast = useCallback((msg: string, accent = false) => {
    const id = ++toastIdRef.current;
    setToasts((p) => [...p.slice(-3), { id, msg, accent }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3200);
  }, []);

  // 신고·피드백 — 탭을 열 때만 부른다
  const [reports, setReports] = useState<Report[] | null>(null);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const [rType, setRType] = useState<ReportType>("report");
  const [rTarget, setRTarget] = useState("");
  const [rContent, setRContent] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      // 관리자는 예약·가림 글까지 받아 상태를 표시한다 (서버가 관리자 아니면 all 을 무시한다)
      const postUrl = `/api/posts?category=${encodeURIComponent("서포터즈")}${isAdmin ? "&all=1" : ""}`;
      const [meRes, postRes] = await Promise.all([
        fetch("/api/supporters/me", { cache: "no-store" })
          .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
          .catch(() => null),
        fetch(postUrl, { cache: "no-store" })
          .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
          .catch(() => null),
      ]);
      if (meRes?.body?.success) {
        setMe(meRes.body as MeData);
        setDenied(false);
      } else if (meRes && (meRes.status === 401 || meRes.status === 403)) {
        setDenied(true);
      } else {
        setFailed(true);
      }
      if (postRes?.body?.success && Array.isArray(postRes.body.data)) setPosts(postRes.body.data);
    } catch {
      setFailed(true);
    }
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (authReady && allowed) load();
  }, [authReady, allowed, load]);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setReportsError("");
    try {
      const r = await fetch("/api/supporters/reports", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success && Array.isArray(body.reports)) setReports(body.reports);
      else setReportsError(body?.error || "불러오지 못했습니다");
    } catch {
      setReportsError("불러오지 못했습니다");
    }
    setReportsLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "reports" && authReady && allowed && !denied) loadReports();
  }, [tab, authReady, allowed, denied, loadReports]);

  // 공지 확인 체크 — 내가 확인한 공지 id. 관리자는 자기 체크 대신 전체 확인 현황(ackStats)을 본다
  const [acks, setAcks] = useState<Set<string>>(() => new Set<string>());
  // 확인한 시각 — 서버가 acks: [{postId, at}] 를 주면 그걸, 아니면 이 기기에서 누른 시각만 안다
  const [ackAt, setAckAt] = useState<Record<string, string>>({});
  const acksLoadedRef = useRef(false);
  const ackBusyRef = useRef<Set<string>>(new Set<string>());
  const [ackStats, setAckStats] = useState<AckStats | null>(null);

  const loadAcks = useCallback(async () => {
    try {
      const r = await fetch("/api/supporters/acks", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        if (Array.isArray(body.postIds)) setAcks(new Set<string>(body.postIds.map(String)));
        if (Array.isArray(body.acks)) {
          const at: Record<string, string> = {};
          for (const a of body.acks) if (a && a.postId && a.at) at[String(a.postId)] = String(a.at);
          setAckAt((prev) => ({ ...prev, ...at }));
        }
      }
    } catch {}
    acksLoadedRef.current = true;
  }, []);

  const loadAckStats = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/supporters/acks", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        setAckStats({ total: Number(body.total) || 0, byPost: body.byPost && typeof body.byPost === "object" ? body.byPost : {} });
      }
    } catch {}
  }, []);

  // 마운트 때 한 번, 공지 탭에 들어올 때마다 다시 — 다른 기기에서 누른 확인이 반영되도록
  useEffect(() => {
    if (!(authReady && allowed && !denied)) return;
    if (tab !== "notice" && acksLoadedRef.current) return;
    if (!isAdmin) loadAcks();
    if (tab === "notice" && isAdmin) loadAckStats();
  }, [tab, authReady, allowed, denied, isAdmin, loadAcks, loadAckStats]);

  // 낙관적 갱신 — 먼저 뒤집고, 서버가 거절하면 되돌린다. 같은 글은 응답 전까지 다시 누르지 못한다
  const toggleAck = async (postId: string) => {
    if (ackBusyRef.current.has(postId)) return;
    const on = !acks.has(postId);
    const apply = (v: boolean) =>
      setAcks((prev) => {
        const n = new Set(prev);
        if (v) n.add(postId);
        else n.delete(postId);
        return n;
      });
    const applyAt = (v: boolean) =>
      setAckAt((prev) => {
        const n = { ...prev };
        if (v) n[postId] = new Date().toISOString();
        else delete n[postId];
        return n;
      });
    ackBusyRef.current.add(postId);
    apply(on);
    applyAt(on);
    tone(on ? 820 : 520, 0.05);
    try {
      const r = await fetch("/api/supporters/acks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, on }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        pushToast(on ? "확인했습니다" : "확인을 취소했습니다", on);
      } else {
        apply(!on);
        applyAt(!on);
        pushToast(body?.error || "저장하지 못했습니다");
      }
    } catch {
      apply(!on);
      applyAt(!on);
      pushToast("저장하지 못했습니다");
    }
    ackBusyRef.current.delete(postId);
  };

  // ── 댓글 — 창을 열 때 글 단위로 받고, 목록 배지용 수는 공지 탭에 들어올 때 한 번 받는다 ──
  // ── 이모지 반응 — 디스코드 메시지 반응처럼 가볍게. 글 단위로 { emoji: { count, mine } } ──
  type ReactionMap = Record<string, { count: number; mine: boolean }>;
  const [reactionsByPost, setReactionsByPost] = useState<Record<string, { emojis: string[]; reactions: ReactionMap }>>({});
  const reactionBusyRef = useRef<Set<string>>(new Set());
  const loadReactions = useCallback(async (postId: string) => {
    try {
      const r = await fetch(`/api/supporters/reactions?postId=${encodeURIComponent(postId)}`, { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success) setReactionsByPost((prev) => ({ ...prev, [postId]: { emojis: body.emojis || [], reactions: body.reactions || {} } }));
    } catch {}
  }, []);
  const toggleReaction = async (postId: string, emoji: string) => {
    const key = `${postId}:${emoji}`;
    if (reactionBusyRef.current.has(key)) return;
    reactionBusyRef.current.add(key);
    const cur = reactionsByPost[postId];
    const was = cur?.reactions?.[emoji] || { count: 0, mine: false };
    // 낙관적 갱신 — 누른 즉시 바뀌고, 서버가 준 집계로 다시 맞춘다
    setReactionsByPost((prev) => {
      const p = prev[postId] || { emojis: [], reactions: {} };
      return { ...prev, [postId]: { ...p, reactions: { ...p.reactions, [emoji]: { count: Math.max(0, was.count + (was.mine ? -1 : 1)), mine: !was.mine } } } };
    });
    tone(was.mine ? 520 : 880, 0.05);
    try {
      const r = await fetch("/api/supporters/reactions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, emoji }) });
      const body = await r.json().catch(() => null);
      if (body?.success) setReactionsByPost((prev) => ({ ...prev, [postId]: { emojis: prev[postId]?.emojis || [], reactions: body.reactions || {} } }));
      else { setReactionsByPost((prev) => ({ ...prev, [postId]: { ...(prev[postId] || { emojis: [] }), reactions: { ...(prev[postId]?.reactions || {}), [emoji]: was } } })); pushToast(body?.error || "반응을 남기지 못했습니다"); }
    } catch {
      setReactionsByPost((prev) => ({ ...prev, [postId]: { ...(prev[postId] || { emojis: [] }), reactions: { ...(prev[postId]?.reactions || {}), [emoji]: was } } }));
      pushToast("반응을 남기지 못했습니다");
    }
    reactionBusyRef.current.delete(key);
  };

  const [commentsByPost, setCommentsByPost] = useState<Record<string, Comment[]>>({});
  const [commentsLoadingId, setCommentsLoadingId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [cText, setCText] = useState("");
  const [cSending, setCSending] = useState(false);
  const [cDelId, setCDelId] = useState<string | null>(null);

  const bumpCount = useCallback((postId: string, d: number) => {
    setCommentCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) + d) }));
  }, []);

  const loadComments = useCallback(
    async (postId: string) => {
      setCommentsLoadingId(postId);
      try {
        const r = await fetch(`/api/supporters/comments?postId=${encodeURIComponent(postId)}`, { cache: "no-store" });
        const body = await r.json().catch(() => null);
        if (body?.success && Array.isArray(body.comments)) {
          const list: Comment[] = body.comments;
          setCommentsByPost((prev) => ({ ...prev, [postId]: list }));
          // 최대 200건까지만 오므로 그 아래일 때만 배지 수를 목록 길이로 맞춘다
          if (list.length < 200) setCommentCounts((prev) => ({ ...prev, [postId]: list.length }));
        } else {
          pushToast(body?.error || "댓글을 불러오지 못했습니다");
        }
      } catch {
        pushToast("댓글을 불러오지 못했습니다");
      }
      setCommentsLoadingId((cur) => (cur === postId ? null : cur));
    },
    [pushToast]
  );

  const loadCommentCounts = useCallback(async () => {
    try {
      const r = await fetch("/api/supporters/comments?counts=1", { cache: "no-store" });
      const body = await r.json().catch(() => null);
      if (body?.success && body.counts && typeof body.counts === "object") {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(body.counts)) next[k] = Number(v) || 0;
        setCommentCounts(next);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === "notice" && authReady && allowed && !denied) loadCommentCounts();
  }, [tab, authReady, allowed, denied, loadCommentCounts]);

  // 창이 열리거나 다른 글로 옮기면 그 글의 댓글을 새로 받고 입력은 비운다
  useEffect(() => {
    if (!selectedId || !(authReady && allowed && !denied)) return;
    if (!posts.some((p) => p._id === selectedId)) return; // 없는 글은 목록 검사가 닫는다 — 여기서 404 토스트를 겹치지 않게
    setCText("");
    setCDelId(null);
    loadComments(selectedId);
    loadReactions(selectedId);
  }, [selectedId, authReady, allowed, denied, posts, loadComments, loadReactions]);

  // 낙관적 등록 — 먼저 붙이고, 서버가 준 문서로 바꿔 끼운다. 실패하면 떼어 내고 입력을 돌려준다
  const cTrim = cText.trim();
  const canSendComment = !!selectedId && !cSending && cTrim.length > 0 && cTrim.length <= COMMENT_MAX;
  const submitComment = async () => {
    if (!canSendComment || !selectedId) return;
    const postId = selectedId;
    const content = cTrim;
    const tmpId = `tmp-${Date.now()}`;
    const optimistic: Comment = {
      _id: tmpId,
      userId: String(user?.id || ""),
      userName: String(user?.name || ""),
      userImage: user?.image || undefined,
      content,
      createdAt: new Date().toISOString(),
      mine: true,
      pending: true,
    };
    setCSending(true);
    setCommentsByPost((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), optimistic] }));
    bumpCount(postId, 1);
    setCText("");
    tone(820, 0.06);
    try {
      const r = await fetch("/api/supporters/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId, content }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success && body.comment && typeof body.comment === "object") {
        const saved: Comment = { ...body.comment, _id: String(body.comment._id || tmpId), mine: true };
        setCommentsByPost((prev) => ({ ...prev, [postId]: (prev[postId] || []).map((c) => (c._id === tmpId ? saved : c)) }));
        pushToast("댓글을 남겼습니다", true);
      } else {
        throw new Error(body?.error || "");
      }
    } catch (e: any) {
      setCommentsByPost((prev) => ({ ...prev, [postId]: (prev[postId] || []).filter((c) => c._id !== tmpId) }));
      bumpCount(postId, -1);
      setCText((cur) => cur || content);
      pushToast(e?.message || "댓글을 보내지 못했습니다");
    }
    setCSending(false);
  };

  // 낙관적 삭제 — 먼저 지우고, 서버가 거절하면 시간순 제자리에 되돌린다. 404 는 이미 없는 것이니 그대로 둔다
  const deleteComment = async (postId: string, id: string) => {
    const target = (commentsByPost[postId] || []).find((c) => c._id === id);
    setCommentsByPost((prev) => ({ ...prev, [postId]: (prev[postId] || []).filter((c) => c._id !== id) }));
    bumpCount(postId, -1);
    setCDelId(null);
    tone(520, 0.06);
    try {
      const r = await fetch(`/api/supporters/comments?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        pushToast("댓글을 삭제했습니다", true);
      } else if (r.status === 404) {
        pushToast("이미 삭제된 댓글입니다");
      } else {
        throw new Error(body?.error || "");
      }
    } catch (e: any) {
      if (target) {
        setCommentsByPost((prev) => ({
          ...prev,
          [postId]: [...(prev[postId] || []), target].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
        }));
        bumpCount(postId, 1);
      }
      pushToast(e?.message || "댓글을 삭제하지 못했습니다");
    }
  };

  // 창 — ESC 로 닫기. 창이 없을 때는 듣지 않는다
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePost();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, closePost]);

  // URL 의 id 가 목록에 없으면(가린 글·지운 글·오타) 조용히 닫는다 — 목록을 받은 뒤에만 판단
  useEffect(() => {
    if (!selectedId || loading || failed || !(authReady && allowed && !denied)) return;
    if (!posts.some((p) => p._id === selectedId)) {
      pushToast("공지를 찾을 수 없습니다");
      closePost();
    }
  }, [selectedId, loading, failed, posts, authReady, allowed, denied, pushToast, closePost]);

  const copyPostLink = async (id: string) => {
    tone();
    const url = `${window.location.origin}${pathname}?tab=notice&id=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast("링크를 복사했습니다", true);
    } catch {
      pushToast("복사하지 못했습니다");
    }
  };

  // 내 제출 수정·삭제 — 답변 전(editable)에만. 한 번에 한 건만 편집한다
  const [editId, setEditId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 구버전 응답(editable 없음)이어도 같은 기준으로 판단한다
  const canEdit = (r: Report) => (typeof r.editable === "boolean" ? r.editable : r.status === "open" && !r.adminReply);

  const startEdit = (r: Report) => {
    setDelId(null);
    setEditId(r._id);
    setEditTarget(r.target || "");
    setEditContent(r.content || "");
    tone();
  };
  const cancelEdit = () => {
    setEditId(null);
    tone();
  };

  const editing = editId ? reports?.find((x) => x._id === editId) || null : null;
  const editContentTrim = editContent.trim();
  const editTargetTrim = editTarget.trim();
  const canSaveEdit =
    !!editing &&
    !editSaving &&
    editContentTrim.length > 0 &&
    editContentTrim.length <= CONTENT_MAX &&
    (editing.type === "feedback" || (editTargetTrim.length > 0 && editTargetTrim.length <= TARGET_MAX)) &&
    (editContentTrim !== (editing.content || "") || (editing.type === "report" && editTargetTrim !== (editing.target || "")));

  const saveEdit = async () => {
    if (!editing || !canSaveEdit) return;
    setEditSaving(true);
    try {
      const payload: Record<string, string> = { id: editing._id, content: editContentTrim };
      if (editing.type === "report") payload.target = editTargetTrim;
      const r = await fetch("/api/supporters/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        tone(820, 0.06);
        pushToast("수정했습니다", true);
        setEditId(null);
        const next: Partial<Report> = body.report && typeof body.report === "object" ? body.report : { content: editContentTrim, target: payload.target };
        setReports((prev) => (prev ? prev.map((x) => (x._id === editing._id ? { ...x, ...next, _id: x._id } : x)) : prev));
      } else {
        // 409(답변 뒤)·404 는 목록이 이미 낡은 것 — 서버 기준으로 다시 맞춘다
        pushToast(body?.error || "수정하지 못했습니다");
        if (r.status === 409 || r.status === 404) {
          setEditId(null);
          loadReports();
        }
      }
    } catch {
      pushToast("수정하지 못했습니다");
    }
    setEditSaving(false);
  };

  const deleteReport = async (id: string) => {
    if (deleting) return;
    setDeleting(true);
    try {
      const r = await fetch(`/api/supporters/reports?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        tone(520, 0.06);
        pushToast("삭제했습니다", true);
        setDelId(null);
        if (editId === id) setEditId(null);
        setReports((prev) => (prev ? prev.filter((x) => x._id !== id) : prev));
      } else {
        pushToast(body?.error || "삭제하지 못했습니다");
        setDelId(null);
        if (r.status === 409 || r.status === 404) loadReports();
      }
    } catch {
      pushToast("삭제하지 못했습니다");
    }
    setDeleting(false);
  };

  const toggleEval = (month: string) => {
    setOpenEval((cur) => (cur === month ? null : month));
    tone();
  };
  const onCopy = () => pushToast("복사됨");

  // 제출 — 길이·대상 검증은 서버가 다시 한다. 여기서는 버튼을 잠그는 용도로만 본다
  const contentTrim = rContent.trim();
  const targetTrim = rTarget.trim();
  const canSend =
    !sending &&
    contentTrim.length > 0 &&
    contentTrim.length <= CONTENT_MAX &&
    (rType === "feedback" || (targetTrim.length > 0 && targetTrim.length <= TARGET_MAX));

  const submitReport = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const r = await fetch("/api/supporters/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: rType, target: rType === "report" ? targetTrim : "", content: contentTrim }),
      });
      const body = await r.json().catch(() => null);
      if (body?.success) {
        tone(820, 0.06);
        pushToast(rType === "report" ? "신고를 보냈습니다" : "피드백을 보냈습니다", true);
        setRContent("");
        setRTarget("");
        loadReports();
      } else {
        // 하루 10건 제한 등 서버 400 메시지를 그대로 띄운다
        pushToast(body?.error || "보내지 못했습니다");
      }
    } catch {
      pushToast("보내지 못했습니다");
    }
    setSending(false);
  };

  const skeleton = (
    <div className="space-y-6">
      <div className="h-10 w-40 rounded-lg bg-black/[0.05] animate-pulse"></div>
      <div className="h-44 rounded-2xl bg-black/[0.03] animate-pulse"></div>
      <div className="h-32 rounded-2xl bg-black/[0.025] animate-pulse"></div>
      <div className="h-56 rounded-2xl bg-black/[0.02] animate-pulse"></div>
    </div>
  );

  let body: React.ReactNode;
  if (!authReady) {
    body = skeleton;
  } else if (!user) {
    body = (
      <div className="py-24 md:py-32 max-w-sm mx-auto text-center">
        <p className="text-sm font-bold text-[#131313] mb-6">로그인이 필요합니다</p>
        <button
          onClick={() => signIn("discord", { callbackUrl: "/supporters" })}
          className="w-full py-3.5 bg-[#e91e3f] hover:bg-[#d01634] text-white text-sm font-bold rounded-xl transition-colors shadow-[0_10px_30px_rgba(233,30,63,0.35)] outline-none focus:outline-none"
        >
          Discord로 로그인
        </button>
      </div>
    );
  } else if (!allowed || denied) {
    body = (
      <div className="py-24 md:py-32 text-center">
        <p className="text-sm font-bold text-[#131313]">서포터즈 전용 페이지입니다</p>
        <Link href="/" className="inline-flex mt-6 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] underline underline-offset-4 transition-colors">
          홈으로
        </Link>
      </div>
    );
  } else if (loading) {
    body = skeleton;
  } else if (failed || !me) {
    body = (
      <div className="py-24 md:py-32 text-center">
        <p className="text-sm font-bold text-[#131313]">불러오지 못했습니다</p>
        <button
          onClick={() => { tone(); load(); }}
          className="mt-6 inline-flex items-center h-9 px-4 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
        >
          다시 시도
        </button>
      </div>
    );
  } else {
    const act = me.activity || { chatCount: 0, voiceMin: 0 };
    const prev = me.prev || { month: "", chatCount: 0, voiceMin: 0 };
    const goals = me.goals || { chat: 0, voiceMin: 0 };
    const evals = Array.isArray(me.evals) ? me.evals : [];
    const chatDone = goals.chat > 0 && (act.chatCount || 0) >= goals.chat;
    const voiceDone = goals.voiceMin > 0 && (act.voiceMin || 0) >= goals.voiceMin;
    const thisEval = evals.find((e) => e.month === me.month) || null;
    const latest = evals[0] || null;
    const older = evals.slice(1);
    const startMonth = +VOICE_TIME_START.slice(5, 7);
    const startDay = +VOICE_TIME_START.slice(8, 10);

    // 패널 아래 스탯 스트립 — 지난 달 둘 · 시즌 누적 · 이번 달 평가
    const strip = [
      { l: "지난 달 채팅", v: `${(prev.chatCount || 0).toLocaleString()}회`, s: prev.month ? fmtMonth(prev.month) : "—" },
      { l: "지난 달 음성", v: fmtHm(prev.voiceMin || 0), s: prev.month ? fmtMonth(prev.month) : "—" },
      { l: "시즌 누적 음성", v: fmtHm(Math.floor((me.voiceSeasonSec || 0) / 60)), s: `${startMonth}월 ${startDay}일부터` },
      thisEval
        ? thisEval.status === "paid"
          ? { l: "이번 달 평가", v: "지급 완료", s: thisEval.paidAt ? fmtDate(thisEval.paidAt) : fmtMonth(me.month) }
          : { l: "이번 달 평가", v: "평가 중", s: fmtMonth(me.month), dim: true }
        : { l: "이번 달 평가", v: "평가 전", s: fmtMonth(me.month), dim: true },
    ];

    body = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-[#131313] tracking-tight leading-none">서포터즈</h1>
          <p className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{fmtMonth(me.month)}</p>
        </div>

        {/* 탭 줄 — 내용만큼 커지되 화면을 넘기면 이 줄만 가로 스크롤한다 */}
        <div className="max-w-full flex gap-2 overflow-x-auto no-bar mb-8 md:mb-10">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={pillClass(tab === t.id)}>
              {t.name}
            </button>
          ))}
        </div>

        {/* ══ 활동 — 잉크 패널 하나 + 헤어라인 스탯 스트립 ══ */}
        {tab === "activity" && (
          <Reveal>
            <div className="relative rounded-3xl overflow-hidden bg-[#131313] shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)]">
              <div aria-hidden className="absolute inset-0 sp-grid-dark opacity-70 pointer-events-none"></div>
              <div
                aria-hidden
                className="absolute -top-28 -right-20 rounded-full pointer-events-none"
                style={{ width: 420, height: 420, background: "rgba(63,131,184,0.22)", filter: "blur(120px)" }}
              ></div>

              <div className="relative z-10 p-6 md:p-10 md:flex md:items-stretch">
                {/* 왼쪽 — 아바타 · 이름 · 태그 · 이번 달 */}
                <div className="md:flex-1 md:pr-10 min-w-0 flex items-center gap-5">
                  <span
                    className="shrink-0 rounded-full overflow-hidden bg-white/10 flex items-center justify-center"
                    style={{ width: 72, height: 72, boxShadow: `0 0 0 3px #131313, 0 0 0 5px ${BLUE}` }}
                  >
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-black text-white/60">{String(user.name || "?").slice(0, 1)}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center h-5 px-2 rounded-full text-[9px] font-black tracking-[0.2em] uppercase text-white"
                        style={{ background: BLUE }}
                      >
                        Supporters
                      </span>
                      <span className="text-[11px] font-bold text-white/40 tabular-nums">{fmtMonth(me.month)}</span>
                    </div>
                    <p className="mt-2.5 text-2xl md:text-3xl font-black text-white truncate tracking-tight leading-none">{user.name}</p>
                    {(goals.chat > 0 || goals.voiceMin > 0) && (
                      <p className={`mt-2.5 text-[11px] font-bold ${chatDone && voiceDone ? "text-[#ff5c77]" : "text-white/35"}`}>
                        {chatDone && voiceDone ? "이번 달 목표 달성" : "이번 달 목표 진행 중"}
                      </p>
                    )}
                  </div>
                </div>

                {/* 오른쪽 — 이번 달 채팅 / 음성 큰 숫자 + 목표 게이지 */}
                <div className="mt-8 pt-7 border-t border-white/10 md:mt-0 md:pt-0 md:border-t-0 md:w-1/2 md:pl-10 md:border-l md:border-white/10 grid grid-cols-2 gap-x-6 md:gap-x-10">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white/40">채팅</p>
                    <Big dark size="panel" parts={[{ n: act.chatCount || 0, u: "회" }]} />
                    <InkGoal
                      cur={act.chatCount || 0}
                      goal={goals.chat || 0}
                      curLabel={`${(act.chatCount || 0).toLocaleString()}회`}
                      goalLabel={`${(goals.chat || 0).toLocaleString()}회`}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-white/40">음성</p>
                    <Big dark size="panel" parts={hmParts(act.voiceMin || 0)} />
                    <InkGoal
                      cur={act.voiceMin || 0}
                      goal={goals.voiceMin || 0}
                      curLabel={fmtHm(act.voiceMin || 0)}
                      goalLabel={fmtHm(goals.voiceMin || 0)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 스탯 스트립 — 모바일 2×2, 데스크톱 한 줄 4칸 */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 border-y border-black/[0.08] md:divide-x md:divide-black/[0.08]">
              {strip.map((st, i) => (
                <div
                  key={st.l}
                  className={[
                    "py-5 md:px-6",
                    i % 2 === 1 ? "pl-5 border-l border-black/[0.08] md:border-l-0" : "pr-5",
                    i >= 2 ? "border-t border-black/[0.08] md:border-t-0" : "",
                    i === 0 ? "md:pl-0" : "",
                    i === strip.length - 1 ? "md:pr-0" : "",
                  ].join(" ")}
                >
                  <p className="text-[11px] font-bold text-[#8a8a8a]">{st.l}</p>
                  <p className={`mt-1.5 text-xl md:text-2xl font-black tabular-nums tracking-tight leading-none ${st.dim ? "text-[#8a8a8a]" : "text-[#131313]"}`}>{st.v}</p>
                  <p className="mt-1.5 text-[10px] font-bold text-[#a3a3a3] tabular-nums">{st.s}</p>
                </div>
              ))}
            </div>

            {/* 일별 활동 — 이번 달 하루하루의 채팅·음성. 목표가 있으면 남은 날 기준 하루 페이스도 같이 */}
            {(() => {
              const daily: { day: number; chat: number; voiceMin: number }[] = Array.isArray(me.daily) ? me.daily : [];
              if (daily.length === 0) return null;
              const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
              const today = kst.toISOString().slice(0, 7) === me.month ? kst.getUTCDate() : daily.length;
              const maxChat = Math.max(1, ...daily.map((d) => d.chat));
              const maxVoice = Math.max(1, ...daily.map((d) => d.voiceMin));
              const remain = Math.max(0, daily.length - today);
              const paceChat = goals.chat > 0 && act.chatCount < goals.chat && remain > 0 ? Math.ceil((goals.chat - act.chatCount) / remain) : 0;
              const paceVoice = goals.voiceMin > 0 && act.voiceMin < goals.voiceMin && remain > 0 ? Math.ceil((goals.voiceMin - act.voiceMin) / remain) : 0;
              const Bars = ({ k, max, color, label, unit }: { k: "chat" | "voiceMin"; max: number; color: string; label: string; unit: (v: number) => string }) => (
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[11px] font-bold text-[#8a8a8a]">{label}</p>
                    <p className="text-[10px] font-bold text-[#a3a3a3] tabular-nums">최고 {unit(max)}</p>
                  </div>
                  <div className="flex items-end gap-[2px]" style={{ height: 72 }}>
                    {daily.map((d) => {
                      const v = d[k];
                      const h = v > 0 ? Math.max(3, Math.round((v / max) * 72)) : 2;
                      const future = d.day > today;
                      return (
                        <span
                          key={d.day}
                          title={`${d.day}일 · ${unit(v)}`}
                          className="flex-1 min-w-0 rounded-sm"
                          style={{ height: h, background: future ? "rgba(0,0,0,0.05)" : v > 0 ? color : "rgba(0,0,0,0.10)", opacity: d.day === today ? 1 : 0.85 }}
                        ></span>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] font-bold text-[#c4c4c4] tabular-nums">
                    <span>1일</span><span>{today}일</span><span>{daily.length}일</span>
                  </div>
                </div>
              );
              return (
                <section className="mt-10 pt-10 border-t border-black/[0.08]">
                  <SectionHeader
                    title="일별 활동"
                    right={
                      (paceChat > 0 || paceVoice > 0) ? (
                        <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                          남은 {remain}일 · 하루 {[paceChat > 0 && `채팅 ${paceChat}회`, paceVoice > 0 && `음성 ${fmtHm(paceVoice)}`].filter(Boolean).join(" · ")} 페이스
                        </span>
                      ) : undefined
                    }
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                    <Bars k="chat" max={maxChat} color="#131313" label="채팅" unit={(v) => `${v.toLocaleString()}회`} />
                    <Bars k="voiceMin" max={maxVoice} color={BLUE} label="음성" unit={(v) => fmtHm(v)} />
                  </div>
                </section>
              );
            })()}

            {/* 바로 보기 — 최근 공지 · 최근 평가. 본진은 각 탭이고 여기서는 한 줄씩만 흘려 준다 */}
            <section className="mt-10 pt-10 border-t border-black/[0.08] grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-10">
              <div className="min-w-0">
                <SectionHeader
                  title="최근 공지"
                  right={<button onClick={() => setTab("notice")} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none">전체 보기 →</button>}
                />
                {posts.length === 0 ? (
                  <p className="text-[12px] text-[#a3a3a3]">아직 공지가 없습니다</p>
                ) : (
                  <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                    {posts.slice(0, 3).map((p) => (
                      <li key={p._id}>
                        <button onClick={() => openPost(p._id)} className="w-full py-3 flex items-center gap-3 text-left outline-none focus:outline-none group">
                          <span className="min-w-0 flex-1 text-[13px] font-bold text-[#131313] truncate group-hover:text-[#e91e3f] transition-colors">{p.title}</span>
                          {acks.has(p._id) && (
                            <span aria-label="확인함" className="shrink-0 inline-flex items-center justify-center rounded-full text-white" style={{ width: 14, height: 14, background: BLUE }}>
                              <CheckMark className="w-2.5 h-2.5" />
                            </span>
                          )}
                          <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums">{fmtDate(p.publishAt || p.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="min-w-0">
                <SectionHeader
                  title="최근 평가"
                  right={<button onClick={() => setTab("evals")} className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none">전체 보기 →</button>}
                />
                {evals.length === 0 ? (
                  <p className="text-[12px] text-[#a3a3a3]">아직 평가가 없습니다</p>
                ) : (
                  <ul className="divide-y divide-black/[0.06] border-y border-black/[0.06]">
                    {evals.slice(0, 3).map((e) => (
                      <li key={e.month} className="py-3 flex items-center gap-3">
                        <span className="w-16 shrink-0 text-[12px] font-black text-[#131313] tabular-nums">{fmtMonth(e.month)}</span>
                        <span className="w-10 shrink-0 text-[12px] font-black text-[#131313]">{e.grade || "—"}</span>
                        <span className="min-w-0 flex-1 text-[12px] font-bold text-[#5a5a5a] tabular-nums truncate">
                          {(e.xp || 0) > 0 ? `+${(e.xp || 0).toLocaleString()} XP` : ""}{(e.xp || 0) > 0 && (e.point || 0) > 0 ? " · " : ""}{(e.point || 0) > 0 ? `+${(e.point || 0).toLocaleString()} P` : ""}
                        </span>
                        <span className={`shrink-0 text-[10px] font-black ${e.status === "paid" ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>{e.status === "paid" ? "지급 완료" : "평가 중"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </Reveal>
        )}

        {/* ══ 평가·지급 — 최근 달은 크게, 이전 달은 목록 ══ */}
        {tab === "evals" && (
          <Reveal>
            <SectionHeader
              title="평가 · 지급"
              right={<span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{evals.length}건</span>}
            />
            {!latest ? (
              <EmptySlot>아직 평가가 없습니다</EmptySlot>
            ) : (
              <>
                <div className="border-y border-black/[0.08] py-6 md:py-7">
                  <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0">
                      <Label>최근 평가</Label>
                      <p className="mt-1.5 text-2xl md:text-3xl font-black text-[#131313] tabular-nums tracking-tight leading-none">{fmtMonth(latest.month)}</p>
                    </div>
                    <EvalStatus e={latest} size="md" />
                  </div>
                  {/* 모바일은 세로로 쌓는다 — 세 자리 숫자 셋을 한 줄에 두면 서로 겹친다 */}
                  <div className={`grid grid-cols-1 sm:grid-cols-3 gap-y-5 gap-x-8 mt-7 ${latest.status === "paid" ? "" : "opacity-60"}`}>
                    <div className="min-w-0">
                      <Label>등급</Label>
                      <Big size="panel" parts={[{ n: latest.grade || "—", u: "" }]} />
                    </div>
                    <div className="min-w-0">
                      <Label>XP</Label>
                      <Big size="panel" parts={[{ n: plus(latest.xp), u: latest.xp && latest.xp > 0 ? "XP" : "" }]} />
                    </div>
                    <div className="min-w-0">
                      <Label>POINT</Label>
                      <Big size="panel" tint="#3f9e93" parts={[{ n: plus(latest.point), u: latest.point && latest.point > 0 ? "P" : "" }]} />
                    </div>
                  </div>
                  <div className="mt-7 pt-6 border-t border-black/[0.06]">
                    <Label>코멘트</Label>
                    <p className="mt-2 text-[14px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">
                      {latest.note || <span className="text-[#a3a3a3]">아직 코멘트가 없습니다</span>}
                    </p>
                  </div>
                </div>

                {older.length > 0 && (
                  <div className="mt-10">
                    <SectionHeader
                      title="이전 평가"
                      right={<span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{older.length}건</span>}
                    />
                    {/* 열 이름 — 데스크톱에서만. 모바일은 한 행이 두 줄로 접힌다 */}
                    <div className="hidden sm:flex items-center gap-3 pb-2.5 border-b border-black/[0.08] text-[11px] font-bold text-[#8a8a8a]">
                      <span className="shrink-0" style={{ width: 96 }}>월</span>
                      <span className="flex items-center gap-6">
                        <span style={{ width: 56 }}>등급</span>
                        <span className="text-right" style={{ width: 88 }}>XP</span>
                        <span className="text-right" style={{ width: 88 }}>POINT</span>
                      </span>
                      <span className="ml-auto">상태</span>
                      <span aria-hidden className="w-4 shrink-0"></span>
                    </div>
                    <div className="border-b border-black/[0.08] divide-y divide-black/[0.06]">
                      {older.map((e) => {
                        const open = openEval === e.month;
                        const paid = e.status === "paid";
                        const ink = paid ? "text-[#131313]" : "text-[#5a5a5a]";
                        return (
                          <div key={e.month}>
                            <button
                              type="button"
                              onClick={() => toggleEval(e.month)}
                              aria-expanded={open}
                              className="group w-full py-4 text-left outline-none focus:outline-none"
                            >
                              <div className="flex items-center gap-3">
                                <span className={`shrink-0 text-[14px] font-black tabular-nums ${open ? "text-[#e91e3f]" : ink}`} style={{ width: 96 }}>
                                  {fmtMonth(e.month)}
                                </span>
                                <span className="hidden sm:flex items-center gap-6 text-[13px] font-black tabular-nums">
                                  <span className={ink} style={{ width: 56 }}>{e.grade || "—"}</span>
                                  <span className={`text-right ${ink}`} style={{ width: 88 }}>{plus(e.xp)}</span>
                                  <span className="text-right text-[#3f9e93]" style={{ width: 88 }}>{plus(e.point)}</span>
                                </span>
                                <span className="ml-auto shrink-0"><EvalStatus e={e} /></span>
                                <Chevron open={open} />
                              </div>
                              <div className="sm:hidden flex flex-wrap gap-x-4 mt-1.5 text-[12px] font-black tabular-nums">
                                <span className={ink}>{e.grade || "—"}</span>
                                <span className={ink}>{plus(e.xp)} XP</span>
                                <span className="text-[#3f9e93]">{plus(e.point)} POINT</span>
                              </div>
                            </button>
                            {open && (
                              <div className="pb-5 text-[13px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">
                                {e.note || <span className="text-[#a3a3a3]">코멘트가 없습니다</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-[#a3a3a3] mt-5 break-keep">XP는 1분 안에, POINT는 즉시 들어옵니다.</p>
              </>
            )}
          </Reveal>
        )}

        {/* ══ 공지·가이드 ══ */}
        {tab === "notice" && (
          <Reveal>
            <SectionHeader
              title="공지 · 가이드"
              right={
                isAdmin ? (
                  <Link
                    href={`/write?category=${encodeURIComponent("서포터즈")}`}
                    className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-[#131313] hover:bg-[#2a2a2a] text-white text-[11px] font-bold transition-colors"
                  >
                    글쓰기
                  </Link>
                ) : undefined
              }
            />
            {posts.length === 0 ? (
              <EmptySlot>아직 올라온 글이 없습니다</EmptySlot>
            ) : (
              <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                {posts.map((p) => {
                  // 관리자만 받는 상태 — 예약(발행 전)·가림
                  const scheduled = !!p.publishAt && new Date(p.publishAt).getTime() > Date.now();
                  const acked = acks.has(p._id);
                  const stat = ackStats?.byPost?.[p._id];
                  const n = commentCounts[p._id] || 0;
                  const active = selectedId === p._id;
                  // 확인한 글은 한 톤 죽인다 — 남은 일이 무엇인지 한눈에 보이도록
                  const dim = !isAdmin && acked && !active;
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => openPost(p._id)}
                      className={`group w-full flex items-center gap-4 py-4 text-left outline-none focus:outline-none transition-opacity ${dim ? "opacity-50 hover:opacity-100" : ""}`}
                    >
                      {!isAdmin && (
                        <span
                          aria-label={acked ? "확인함" : "미확인"}
                          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full border text-white transition-colors"
                          style={acked ? { background: BLUE, borderColor: BLUE } : { borderColor: "rgba(0,0,0,0.18)" }}
                        >
                          {acked && <CheckMark className="w-3 h-3" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className={`text-[14px] font-black break-keep transition-colors ${active ? "text-[#e91e3f]" : "text-[#131313] group-hover:text-[#e91e3f]"}`}>
                          {p.title}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#a3a3a3] tabular-nums mt-1">
                          <span>{fmtDate(p.publishAt || p.createdAt)}</span>
                          {scheduled && (
                            <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-black text-white" style={{ background: BLUE }}>예약</span>
                          )}
                          {p.hidden && (
                            <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/[0.08] text-[9px] font-black text-[#5a5a5a]">가림</span>
                          )}
                          {isAdmin && ackStats && (
                            <span className="font-black" style={{ color: BLUE }}>
                              확인 {stat?.count ?? 0} / {ackStats.total}
                            </span>
                          )}
                        </p>
                      </div>
                      {n > 0 && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-[#8a8a8a] tabular-nums">
                          <CommentIcon />
                          {n}
                        </span>
                      )}
                      <ArrowRight className="shrink-0 w-4 h-4 text-[#c4c4c4] group-hover:text-[#131313] transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}
          </Reveal>
        )}

        {/* ══ 신고·피드백 — 폼 + 내 제출 내역 ══ */}
        {tab === "reports" && (
          <Reveal>
            <SectionHeader title="신고 · 피드백" />
            <div className="border-y border-black/[0.08] py-6 md:py-7">
              <div className="flex items-center gap-1.5 overflow-x-auto no-bar mb-5">
                {(
                  [
                    { id: "report", name: "유저 신고" },
                    { id: "feedback", name: "피드백" },
                  ] as { id: ReportType; name: string }[]
                ).map((s) => (
                  <button key={s.id} type="button" onClick={() => { if (rType !== s.id) { setRType(s.id); tone(); } }} className={pillClass(rType === s.id, "sm")}>
                    {s.name}
                  </button>
                ))}
              </div>

              {rType === "report" && (
                <input
                  value={rTarget}
                  onChange={(e) => setRTarget(e.target.value)}
                  maxLength={TARGET_MAX}
                  placeholder="대상 (닉네임 또는 ID)"
                  className={`${fieldClass} h-11 px-4 font-bold mb-3`}
                />
              )}
              <textarea
                value={rContent}
                onChange={(e) => setRContent(e.target.value.slice(0, CONTENT_MAX))}
                rows={6}
                maxLength={CONTENT_MAX}
                placeholder={rType === "report" ? "무슨 일이 있었는지 적어 주세요" : "서버에 바라는 점을 적어 주세요"}
                className={`${fieldClass} px-4 py-3 leading-relaxed resize-y`}
              />
              <div className="flex items-center justify-between gap-4 mt-3">
                <span className={`text-[11px] font-bold tabular-nums ${rContent.length >= CONTENT_MAX ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>
                  {rContent.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={submitReport}
                  disabled={!canSend}
                  className="h-10 px-5 rounded-full bg-[#131313] enabled:hover:bg-[#2a2a2a] text-white text-[13px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                >
                  {sending ? "보내는 중…" : "보내기"}
                </button>
              </div>
              <p className="text-[11px] text-[#a3a3a3] mt-4 break-keep">관리자에게만 전달되며, 하루 10건까지 보낼 수 있습니다.</p>
            </div>

            <div className="mt-10">
              <SectionHeader
                title="내 제출 내역"
                right={
                  reports ? <span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{reports.length}건</span> : undefined
                }
              />
              {reportsLoading && !reports ? (
                <div className="space-y-3">
                  <div className="h-20 rounded-lg bg-black/[0.04] animate-pulse"></div>
                  <div className="h-20 rounded-lg bg-black/[0.03] animate-pulse"></div>
                </div>
              ) : reportsError && !reports ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-bold text-[#131313]">{reportsError}</p>
                  <button
                    onClick={() => { tone(); loadReports(); }}
                    className="mt-5 inline-flex items-center h-9 px-4 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                  >
                    다시 시도
                  </button>
                </div>
              ) : !reports || reports.length === 0 ? (
                <EmptySlot>아직 보낸 내역이 없습니다</EmptySlot>
              ) : (
                <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
                  {reports.map((r) => {
                    const done = r.status === "done";
                    const editable = canEdit(r);
                    const isEditing = editId === r._id;
                    const confirming = delId === r._id;
                    return (
                      <div key={r._id} className="py-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <TypeBadge type={r.type} />
                          <span className="text-[11px] font-bold text-[#a3a3a3] tabular-nums">{fmtDate(r.createdAt)}</span>
                          {r.type === "report" && r.target && !isEditing && (
                            <span className="text-[11px] font-bold text-[#8a8a8a] break-all">
                              대상 <span className="text-[#131313] font-black">{r.target}</span>
                            </span>
                          )}
                          <span className={`ml-auto text-[11px] font-black whitespace-nowrap ${done ? "text-[#131313]" : "text-[#8a8a8a]"}`}>
                            {done ? "처리됨" : "미처리"}
                          </span>
                        </div>
                        {isEditing ? (
                          <div className="mt-3">
                            {r.type === "report" && (
                              <input
                                value={editTarget}
                                onChange={(e) => setEditTarget(e.target.value)}
                                maxLength={TARGET_MAX}
                                placeholder="대상 (닉네임 또는 ID)"
                                className={`${fieldClass} h-10 px-4 font-bold mb-2.5`}
                              />
                            )}
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value.slice(0, CONTENT_MAX))}
                              rows={5}
                              maxLength={CONTENT_MAX}
                              className={`${fieldClass} px-4 py-3 leading-relaxed resize-y`}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mt-2.5">
                              <span className={`text-[11px] font-bold tabular-nums ${editContent.length >= CONTENT_MAX ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>
                                {editContent.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
                              </span>
                              <span className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={editSaving}
                                  className="h-9 px-4 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none disabled:opacity-50"
                                >
                                  취소
                                </button>
                                <button
                                  type="button"
                                  onClick={saveEdit}
                                  disabled={!canSaveEdit}
                                  className="h-9 px-4 rounded-full bg-[#131313] enabled:hover:bg-[#2a2a2a] text-white text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                                >
                                  {editSaving ? "저장 중…" : "저장"}
                                </button>
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="mt-3 text-[14px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">{r.content}</p>
                        )}
                        {r.adminReply && (
                          <div className="mt-4 pl-4 border-l-2" style={{ borderColor: BLUE }}>
                            <p className="text-[11px] font-black tabular-nums" style={{ color: BLUE }}>
                              관리자 답변{r.repliedAt ? <span className="text-[#a3a3a3] font-bold"> · {fmtDate(r.repliedAt)}</span> : null}
                            </p>
                            <p className="mt-1.5 text-[13px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">{r.adminReply}</p>
                          </div>
                        )}
                        {/* 행 꼬리 — 답변 전엔 수정·삭제, 답변 뒤엔 잠금 표기 */}
                        {!isEditing && (
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
                            {editable ? (
                              confirming ? (
                                <>
                                  <span className="text-[#131313]">정말 삭제할까요?</span>
                                  <button
                                    type="button"
                                    onClick={() => deleteReport(r._id)}
                                    disabled={deleting}
                                    className="text-[#e91e3f] hover:underline underline-offset-4 transition-colors outline-none focus:outline-none disabled:opacity-50"
                                  >
                                    {deleting ? "삭제 중…" : "삭제"}
                                  </button>
                                  <span className="text-[#d4d4d4]">/</span>
                                  <button
                                    type="button"
                                    onClick={() => { setDelId(null); tone(); }}
                                    disabled={deleting}
                                    className="text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none disabled:opacity-50"
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEdit(r)}
                                    className="text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                                  >
                                    수정
                                  </button>
                                  <span className="text-[#d4d4d4]">·</span>
                                  <button
                                    type="button"
                                    onClick={() => { setEditId(null); setDelId(r._id); tone(); }}
                                    className="text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                                  >
                                    삭제
                                  </button>
                                </>
                              )
                            ) : (
                              <span className="text-[#c4c4c4]">{r.adminReply ? "답변 완료" : "처리됨"} · 수정 불가</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Reveal>
        )}
      </>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col relative bg-[#f4f3f2] text-[#131313]">
      {/* 본문 렌더러는 다크 페이지 기준 색을 내보낸다 — 라이트 면에서 표·이미지 선이 보이도록 덮는다.
          잉크 패널의 격자·토스트 키프레임은 /level 과 같은 값을 이 페이지 안에서만 정의한다. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sp-body table, .sp-body th, .sp-body td { border-color: rgba(0,0,0,0.12); }
        .sp-body th { background: rgba(0,0,0,0.03); }
        .sp-body img { border-color: rgba(0,0,0,0.08); }
        .sp-grid-dark {
          background-image: linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 46px 46px;
          -webkit-mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%);
          mask-image: radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%);
        }
        @keyframes spToastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spWinIn {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `,
        }}
      />
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-20 flex-1">{body}</div>

      {/* ══ 공지 창 — 공지사항(/notice)과 같은 전체 오버레이. Reveal 은 transform 을 걸어 fixed 의 기준이 되므로 탭 밖(main)에 둔다 ══ */}
      {authReady && allowed && !denied && !loading && selectedId && (() => {
        const p = posts.find((x) => x._id === selectedId);
        if (!p) return null;
        const idx = posts.findIndex((x) => x._id === p._id);
        // 목록은 최신순 — 아래쪽이 이전(더 오래된) 글
        const olderPost = idx >= 0 && idx < posts.length - 1 ? posts[idx + 1] : null;
        const newerPost = idx > 0 ? posts[idx - 1] : null;
        const scheduled = !!p.publishAt && new Date(p.publishAt).getTime() > Date.now();
        const acked = acks.has(p._id);
        const at = ackAt[p._id];
        const stat = ackStats?.byPost?.[p._id];
        const ackUsers: AckUser[] = Array.isArray(stat?.users) ? stat!.users : [];
        const list = commentsByPost[p._id];
        const cLoading = commentsLoadingId === p._id && !list;
        const iconBtn =
          "shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-[#8a8a8a] hover:text-[#131313] hover:bg-black/[0.05] transition-colors outline-none focus:outline-none";
        const navBtn =
          "inline-flex items-center gap-1.5 h-9 px-2 -mx-2 rounded-full text-[12px] font-bold text-[#5a5a5a] enabled:hover:text-[#131313] transition-colors outline-none focus:outline-none disabled:opacity-30 disabled:cursor-default";
        return (
          <div
            className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 overlay-in"
            style={{ background: "rgba(19,19,19,0.5)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onClick={closePost}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="sp-notice-title"
              onClick={(e) => e.stopPropagation()}
              className="relative w-full sm:max-w-2xl max-h-[92dvh] sm:max-h-[86vh] rounded-t-3xl sm:rounded-3xl bg-white border border-[#dedddb] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.45)] flex flex-col overflow-hidden"
              style={{ animation: "spWinIn .32s cubic-bezier(0.16,1,0.3,1)" }}
            >
              {/* 머리 — 날짜·상태 왼쪽, 도구(수정·링크·닫기) 오른쪽, 그 아래 제목 */}
              <div className="shrink-0 px-5 sm:px-8 pt-5 sm:pt-6 pb-4 border-b border-black/[0.08]">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">{fmtDate(p.publishAt || p.createdAt)}</span>
                  {scheduled && (
                    <span className="inline-flex items-center h-4 px-1.5 rounded-full text-[9px] font-black text-white" style={{ background: BLUE }}>예약</span>
                  )}
                  {p.hidden && (
                    <span className="inline-flex items-center h-4 px-1.5 rounded-full bg-black/[0.08] text-[9px] font-black text-[#5a5a5a]">가림</span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    {isAdmin && (
                      <Link
                        href={`/write?id=${p._id}`}
                        className="shrink-0 inline-flex items-center h-8 px-3 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors"
                      >
                        수정
                      </Link>
                    )}
                    <button type="button" onClick={() => copyPostLink(p._id)} aria-label="링크 복사" title="링크 복사" className={iconBtn}>
                      <LinkIcon />
                    </button>
                    <button type="button" onClick={() => { tone(); closePost(); }} aria-label="닫기" className={`${iconBtn} -mr-2`}>
                      <CloseIcon />
                    </button>
                  </span>
                </div>
                <h2 id="sp-notice-title" className="mt-3 text-xl sm:text-2xl font-black text-[#131313] tracking-tight leading-snug break-keep">
                  {p.title}
                </h2>
              </div>

              {/* 몸통 — 본문 · 확인 · 댓글이 한 스크롤 안에 */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-bar px-5 sm:px-8">
                <div className="py-6 sp-body text-[15px] text-[#3a3a3a] leading-[1.9] whitespace-pre-wrap break-keep select-text">
                  <RenderFormattedText text={p.content || ""} onCopy={onCopy} />
                </div>
                {p.bannerUrl && (
                  <div className="mb-6 rounded-2xl overflow-hidden border border-black/[0.08]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.bannerUrl} alt="" className="block w-full h-auto" />
                  </div>
                )}

                {/* 확인 — 서포터즈는 꽉 찬 큰 버튼, 관리자는 확인 현황 */}
                <div className="pb-6">
                  {isAdmin ? (
                    <div className="border-y border-black/[0.08] py-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-[11px] font-bold text-[#8a8a8a]">확인 현황</p>
                        <p className="text-[15px] font-black tabular-nums leading-none" style={{ color: BLUE }}>
                          {ackStats ? stat?.count ?? 0 : "—"} <span className="text-[12px] font-bold text-[#a3a3a3]">/ {ackStats ? ackStats.total : "—"}</span>
                        </p>
                      </div>
                      {!ackStats ? (
                        <div className="mt-3 h-4 w-40 rounded bg-black/[0.05] animate-pulse"></div>
                      ) : ackUsers.length === 0 ? (
                        <p className="mt-2.5 text-[12px] text-[#a3a3a3]">아직 확인한 사람이 없습니다</p>
                      ) : (
                        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1.5">
                          {ackUsers.map((u) => (
                            <li key={u.userId} className="text-[12px] font-bold text-[#131313] whitespace-nowrap">
                              {u.userName}
                              {u.at && <span className="text-[#a3a3a3] tabular-nums"> {fmtDate(u.at)}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleAck(p._id)}
                      aria-pressed={acked}
                      className={`w-full h-14 rounded-2xl inline-flex items-center justify-center gap-2.5 text-[15px] font-black transition-all outline-none focus:outline-none active:scale-[0.99] ${
                        acked ? "bg-white text-[#131313] hover:bg-black/[0.03]" : "text-white hover:brightness-110 shadow-[0_16px_36px_-12px_rgba(63,131,184,0.7)]"
                      }`}
                      style={acked ? { border: `2px solid ${BLUE}` } : { background: BLUE }}
                    >
                      {acked ? (
                        <>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white" style={{ background: BLUE }}>
                            <CheckMark className="w-3.5 h-3.5" />
                          </span>
                          확인함
                          {at && <span className="text-[13px] font-bold text-[#8a8a8a] tabular-nums">· {fmtDate(at)}</span>}
                        </>
                      ) : (
                        "확인했습니다"
                      )}
                    </button>
                  )}
                </div>

                {/* 반응 — 확인 버튼 아래 이모지 줄. 글 대신 가볍게 남기는 자리라 카드 없이 알약만 */}
                {(() => {
                  const rx = reactionsByPost[p._id];
                  const emojis = rx?.emojis?.length ? rx.emojis : ["👍", "✅", "🔥", "👀", "🙏", "❤️"];
                  return (
                    <div className="flex flex-wrap items-center gap-2 pb-6">
                      {emojis.map((em) => {
                        const v = rx?.reactions?.[em] || { count: 0, mine: false };
                        return (
                          <button
                            key={em}
                            type="button"
                            onClick={() => toggleReaction(p._id, em)}
                            aria-pressed={v.mine}
                            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-black transition-all outline-none focus:outline-none active:scale-95 ${
                              v.mine ? "text-[#131313]" : "bg-black/[0.04] text-[#5a5a5a] hover:bg-black/[0.08]"
                            }`}
                            style={v.mine ? { background: "rgba(63,131,184,0.12)", boxShadow: `inset 0 0 0 1.5px ${BLUE}` } : undefined}
                          >
                            <span aria-hidden className="text-[15px] leading-none">{em}</span>
                            {v.count > 0 && <span className="tabular-nums">{v.count}</span>}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* 댓글 — 오래된 순. 본인·관리자만 x */}
                <div className="border-t border-black/[0.08] pt-6 pb-6">
                  <div className="flex items-baseline justify-between gap-4 mb-2">
                    <h3 className="text-[14px] font-black text-[#131313]">댓글</h3>
                    <span className="text-[11px] font-bold text-[#a3a3a3] tabular-nums">{(commentCounts[p._id] || 0).toLocaleString()}개</span>
                  </div>
                  {cLoading ? (
                    <div className="space-y-3 py-3">
                      <div className="h-10 rounded-lg bg-black/[0.04] animate-pulse"></div>
                      <div className="h-10 rounded-lg bg-black/[0.03] animate-pulse"></div>
                    </div>
                  ) : !list || list.length === 0 ? (
                    <p className="py-4 text-[12px] text-[#a3a3a3]">아직 댓글이 없습니다</p>
                  ) : (
                    <ul className="divide-y divide-black/[0.06]">
                      {list.map((c) => {
                        const canDel = (c.mine || isAdmin) && !c.pending;
                        const confirming = cDelId === c._id;
                        return (
                          <li key={c._id} className={`py-3.5 flex items-start gap-3 ${c.pending ? "opacity-60" : ""}`}>
                            <span className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-black/[0.06] flex items-center justify-center">
                              {c.userImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={c.userImage} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[12px] font-black text-[#8a8a8a]">{String(c.userName || "?").slice(0, 1)}</span>
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 text-[12px] font-black text-[#131313] truncate">{c.userName}</span>
                                <span className="shrink-0 text-[10px] font-bold text-[#a3a3a3] tabular-nums whitespace-nowrap">
                                  {c.pending ? "보내는 중…" : fmtAgo(c.createdAt)}
                                </span>
                                {canDel && (
                                  <span className="ml-auto shrink-0 flex items-center gap-2 text-[11px] font-bold">
                                    {confirming ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => deleteComment(p._id, c._id)}
                                          className="text-[#e91e3f] hover:underline underline-offset-4 outline-none focus:outline-none"
                                        >
                                          삭제
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => { setCDelId(null); tone(); }}
                                          className="text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                                        >
                                          취소
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => { setCDelId(c._id); tone(); }}
                                        aria-label="댓글 삭제"
                                        className="inline-flex items-center justify-center w-6 h-6 -mr-1.5 rounded-full text-[#c4c4c4] hover:text-[#e91e3f] hover:bg-black/[0.04] transition-colors outline-none focus:outline-none"
                                      >
                                        <CloseIcon className="w-3 h-3" />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-[13px] text-[#3a3a3a] leading-[1.75] whitespace-pre-wrap break-words">{c.content}</p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="mt-4">
                    <textarea
                      value={cText}
                      onChange={(e) => setCText(e.target.value.slice(0, COMMENT_MAX))}
                      onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                          e.preventDefault();
                          submitComment();
                        }
                      }}
                      rows={3}
                      maxLength={COMMENT_MAX}
                      placeholder="댓글을 남겨 주세요"
                      className={`${fieldClass} px-4 py-3 leading-relaxed resize-none`}
                    />
                    <div className="flex items-center justify-between gap-4 mt-2.5">
                      <span className={`text-[11px] font-bold tabular-nums ${cText.length >= COMMENT_MAX ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>
                        {cText.length.toLocaleString()} / {COMMENT_MAX.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={submitComment}
                        disabled={!canSendComment}
                        className="h-9 px-4 rounded-full bg-[#131313] enabled:hover:bg-[#2a2a2a] text-white text-[12px] font-bold transition-colors outline-none focus:outline-none disabled:opacity-35 disabled:cursor-default"
                      >
                        {cSending ? "보내는 중…" : "보내기"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 꼬리 — 이전·다음. 모바일 홈바 위로 띄운다 */}
              <div
                className="shrink-0 px-5 sm:px-8 pt-3 border-t border-black/[0.08] bg-[#faf9f7] flex items-center justify-between gap-4"
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                <button type="button" onClick={() => olderPost && goPost(olderPost._id)} disabled={!olderPost} className={navBtn}>
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  이전 공지
                </button>
                <button type="button" onClick={() => newerPost && goPost(newerPost._id)} disabled={!newerPost} className={navBtn}>
                  다음 공지
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 토스트 — 모바일 하단바 위로 띄운다 */}
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-6 z-[200] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{ animation: "spToastIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}
            className={`mt-2 px-5 py-3 rounded-2xl border text-xs font-bold text-right ${
              t.accent
                ? "bg-[#e91e3f] border-[#e91e3f] text-white shadow-[0_10px_30px_rgba(233,30,63,0.45)]"
                : "bg-white/95 border-black/10 text-[#131313] shadow-xl"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}
