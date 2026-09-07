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
  goals: { chat: number; voiceMin: number };
  baseXp: number;
  evals: EvalRow[];
};
type Post = { _id: string; title: string; content?: string; createdAt: string; publishAt?: string | null; hidden?: boolean };
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
};
type Toast = { id: number; msg: string; accent?: boolean };

const BLUE = "#3f83b8"; // 서포터즈 식별색 — 태그·답변 인용에만 쓴다
const CONTENT_MAX = 2000;
const TARGET_MAX = 80;

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
  const setTab = useCallback(
    (id: TabId) => {
      const q = new URLSearchParams(Array.from(searchParams.entries()));
      if (id === "activity") q.delete("tab");
      else q.set("tab", id);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  const [me, setMe] = useState<MeData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false); // 세션은 통과했지만 서버가 403 — 역할이 빠진 직후
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
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

  const togglePost = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    tone();
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
                  const open = openId === p._id;
                  // 관리자만 받는 상태 — 예약(발행 전)·가림
                  const scheduled = !!p.publishAt && new Date(p.publishAt).getTime() > Date.now();
                  return (
                    <div key={p._id}>
                      <button
                        type="button"
                        onClick={() => togglePost(p._id)}
                        aria-expanded={open}
                        className="group w-full flex items-center gap-4 py-4 text-left outline-none focus:outline-none"
                      >
                        <div className="min-w-0 flex-1">
                          <p className={`text-[14px] font-black break-keep transition-colors ${open ? "text-[#e91e3f]" : "text-[#131313] group-hover:text-[#e91e3f]"}`}>
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
                          </p>
                        </div>
                        <Chevron open={open} />
                      </button>
                      {open && (
                        <div className="pb-7">
                          <div className="sp-body text-[14px] text-[#3a3a3a] leading-[1.9] whitespace-pre-wrap break-keep select-text">
                            <RenderFormattedText text={p.content || ""} onCopy={onCopy} />
                          </div>
                          {isAdmin && (
                            <div className="mt-5 flex justify-end">
                              <Link
                                href={`/write?id=${p._id}`}
                                className="inline-flex items-center h-8 px-3.5 rounded-full bg-black/[0.04] hover:bg-black/[0.08] text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors"
                              >
                                수정
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
                    return (
                      <div key={r._id} className="py-5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <TypeBadge type={r.type} />
                          <span className="text-[11px] font-bold text-[#a3a3a3] tabular-nums">{fmtDate(r.createdAt)}</span>
                          {r.type === "report" && r.target && (
                            <span className="text-[11px] font-bold text-[#8a8a8a] break-all">
                              대상 <span className="text-[#131313] font-black">{r.target}</span>
                            </span>
                          )}
                          <span className={`ml-auto text-[11px] font-black whitespace-nowrap ${done ? "text-[#131313]" : "text-[#8a8a8a]"}`}>
                            {done ? "처리됨" : "미처리"}
                          </span>
                        </div>
                        <p className="mt-3 text-[14px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">{r.content}</p>
                        {r.adminReply && (
                          <div className="mt-4 pl-4 border-l-2" style={{ borderColor: BLUE }}>
                            <p className="text-[11px] font-black tabular-nums" style={{ color: BLUE }}>
                              관리자 답변{r.repliedAt ? <span className="text-[#a3a3a3] font-bold"> · {fmtDate(r.repliedAt)}</span> : null}
                            </p>
                            <p className="mt-1.5 text-[13px] text-[#3a3a3a] leading-[1.8] whitespace-pre-wrap break-keep">{r.adminReply}</p>
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
      `,
        }}
      />
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-20 flex-1">{body}</div>

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
