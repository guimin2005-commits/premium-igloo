"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Reveal } from "../components/Lux";
import { EmptySlot } from "../components/Hud";
import { RenderFormattedText } from "../components/FormattedText";
import { isAdminName } from "@/lib/admins";
import { VOICE_TIME_START } from "@/lib/season";

// 📌 서포터즈 전용 — 이번 달 활동 · 지난 달/누적 · 평가·지급 내역(본인) · 전용 공지.
//    입장은 세션 플래그(isSupporter)로 먼저 가르고, 서버(/api/supporters/me)가 다시 막는다.
//    관리자는 운영 확인용으로 통과한다 (서버도 같은 기준).

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
type Post = { _id: string; title: string; content?: string; createdAt: string; publishAt?: string | null };

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
  <div className="mb-8">
    <div className="flex items-end justify-between gap-4">
      <h2 className="min-w-0 text-xl md:text-2xl font-black text-[#131313] tracking-tight break-keep">{title}</h2>
      {right}
    </div>
  </div>
);

// 큰 수치 — 숫자는 크게, 단위는 작게 같은 기준선에
const Big = ({ parts, size = "lg" }: { parts: { n: number; u: string }[]; size?: "lg" | "md" }) => (
  <p
    className={`mt-1.5 flex flex-wrap items-baseline gap-x-2 font-black tabular-nums text-[#131313] tracking-tight leading-none ${
      size === "lg" ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"
    }`}
  >
    {parts.map((p, i) => (
      <span key={i} className="inline-flex items-baseline gap-x-1">
        {p.n.toLocaleString()}
        <span className={`font-bold text-[#8a8a8a] ${size === "lg" ? "text-sm md:text-base" : "text-xs md:text-sm"}`}>{p.u}</span>
      </span>
    ))}
  </p>
);

// 월간 목표 게이지 — 목표가 0 이면 그리지 않는다 (호출부에서 수치만 남긴다)
const Goal = ({ cur, goal, curLabel, goalLabel }: { cur: number; goal: number; curLabel: string; goalLabel: string }) => {
  if (!(goal > 0)) return null;
  const pct = pctOf(cur, goal);
  const done = cur >= goal;
  return (
    <div className="mt-4">
      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${done ? "bg-[#e91e3f]" : "bg-[#131313]"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 mt-2 text-[11px] font-bold tabular-nums">
        <span className="text-[#5a5a5a]">
          {curLabel} <span className="text-[#a3a3a3]">/ {goalLabel}</span>
        </span>
        <span className={done ? "text-[#e91e3f] font-black" : "text-[#8a8a8a]"}>{done ? "달성" : `${pct}%`}</span>
      </div>
    </div>
  );
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold text-[#8a8a8a]">{children}</p>
);

export default function SupportersPage() {
  const { data: session, status: authStatus } = useSession();
  const user = session?.user as any;

  // 하이드레이션 불일치 방지 — 첫 페인트는 항상 스켈레톤, 마운트 후에만 세션으로 가른다
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const authReady = mounted && authStatus !== "loading";

  const isAdmin = isAdminName(user?.name);
  const allowed = !!user && (!!user.isSupporter || isAdmin);

  const [me, setMe] = useState<MeData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false); // 세션은 통과했지만 서버가 403 — 역할이 빠진 직후
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [meRes, postRes] = await Promise.all([
        fetch("/api/supporters/me", { cache: "no-store" })
          .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
          .catch(() => null),
        fetch(`/api/posts?category=${encodeURIComponent("서포터즈")}`, { cache: "no-store" })
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
  }, []);

  useEffect(() => {
    if (authReady && allowed) load();
  }, [authReady, allowed, load]);

  const togglePost = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    tone();
  };
  const onCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
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

    body = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-10 md:mb-12">
          <h1 className="text-3xl md:text-4xl font-black text-[#131313] tracking-tight leading-none">서포터즈</h1>
          <p className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">
            {user.name} <span className="text-[#c4c4c4] mx-1">·</span> {fmtMonth(me.month)}
          </p>
        </div>

        {/* ① 이번 달 활동 */}
        <Reveal>
          <section>
            <SectionHeader title="이번 달 활동" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
              <div>
                <Label>채팅</Label>
                <Big parts={[{ n: act.chatCount || 0, u: "회" }]} />
                <Goal
                  cur={act.chatCount || 0}
                  goal={goals.chat || 0}
                  curLabel={`${(act.chatCount || 0).toLocaleString()}회`}
                  goalLabel={`${(goals.chat || 0).toLocaleString()}회`}
                />
              </div>
              <div>
                <Label>음성</Label>
                <Big parts={hmParts(act.voiceMin || 0)} />
                <Goal
                  cur={act.voiceMin || 0}
                  goal={goals.voiceMin || 0}
                  curLabel={fmtHm(act.voiceMin || 0)}
                  goalLabel={fmtHm(goals.voiceMin || 0)}
                />
              </div>
            </div>
          </section>
        </Reveal>

        {/* ② 지난 달 · 시즌 누적 */}
        <Reveal>
          <section className="mt-10 pt-10 border-t border-black/[0.08]">
            <SectionHeader
              title="지난 달 · 누적"
              right={prev.month ? <span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{fmtMonth(prev.month)}</span> : undefined}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6">
              <div>
                <Label>지난 달 채팅</Label>
                <Big size="md" parts={[{ n: prev.chatCount || 0, u: "회" }]} />
              </div>
              <div>
                <Label>지난 달 음성</Label>
                <Big size="md" parts={hmParts(prev.voiceMin || 0)} />
              </div>
              <div>
                <Label>누적 음성</Label>
                <Big size="md" parts={hmParts(Math.floor((me.voiceSeasonSec || 0) / 60))} />
              </div>
            </div>
            <p className="text-[11px] text-[#a3a3a3] mt-6 break-keep">
              누적 음성 시간은 {+VOICE_TIME_START.slice(5, 7)}월 {+VOICE_TIME_START.slice(8, 10)}일부터 집계되며, 시즌이 바뀌어도 이어집니다.
            </p>
          </section>
        </Reveal>

        {/* ③ 평가 · 지급 내역 — 본인 것만 내려온다 */}
        <Reveal>
          <section className="mt-10 pt-10 border-t border-black/[0.08]">
            <SectionHeader
              title="평가 · 지급 내역"
              right={<span className="shrink-0 text-[11px] font-bold text-[#a3a3a3] tabular-nums">{evals.length}건</span>}
            />
            {evals.length === 0 ? (
              <EmptySlot>아직 평가가 없습니다</EmptySlot>
            ) : (
              <>
                <div className="overflow-x-auto no-bar -mx-5 px-5 md:mx-0 md:px-0">
                  <table className="w-full min-w-[640px] text-[13px] border-collapse">
                    <thead>
                      <tr className="text-[11px] text-[#8a8a8a] border-b border-black/[0.08]">
                        <th className="text-left font-bold py-2.5 pr-4 whitespace-nowrap">월</th>
                        <th className="text-left font-bold py-2.5 pr-4 whitespace-nowrap">등급</th>
                        <th className="text-right font-bold py-2.5 pr-4 whitespace-nowrap">XP</th>
                        <th className="text-right font-bold py-2.5 pr-4 whitespace-nowrap">POINT</th>
                        <th className="text-left font-bold py-2.5 pr-4 whitespace-nowrap">코멘트</th>
                        <th className="text-right font-bold py-2.5 whitespace-nowrap">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {evals.map((e) => {
                        const paid = e.status === "paid";
                        return (
                          <tr key={e.month} className={paid ? "" : "text-[#5a5a5a]"}>
                            <td className="py-3.5 pr-4 font-black text-[#131313] tabular-nums whitespace-nowrap">{fmtMonth(e.month)}</td>
                            <td className="py-3.5 pr-4 font-black text-[#131313] whitespace-nowrap">{e.grade || "—"}</td>
                            <td className="py-3.5 pr-4 text-right font-black text-[#131313] tabular-nums whitespace-nowrap">
                              {e.xp && e.xp > 0 ? `+${e.xp.toLocaleString()}` : "—"}
                            </td>
                            <td className="py-3.5 pr-4 text-right font-black text-[#3f9e93] tabular-nums whitespace-nowrap">
                              {e.point && e.point > 0 ? `+${e.point.toLocaleString()}` : "—"}
                            </td>
                            <td className="py-3.5 pr-4 text-[#5a5a5a] break-keep min-w-[180px] leading-relaxed">{e.note || "—"}</td>
                            <td className="py-3.5 text-right whitespace-nowrap tabular-nums">
                              {paid ? (
                                <span className="font-bold text-[#131313]">
                                  지급 완료{e.paidAt ? <span className="text-[#a3a3a3] font-bold"> · {fmtDate(e.paidAt)}</span> : null}
                                </span>
                              ) : (
                                <span className="font-bold text-[#8a8a8a]">평가 중</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-[#a3a3a3] mt-5 break-keep">XP는 1분 안에, POINT는 즉시 들어옵니다.</p>
              </>
            )}
          </section>
        </Reveal>

        {/* ④ 서포터즈 공지 · 가이드 */}
        <Reveal>
          <section className="mt-10 pt-10 border-t border-black/[0.08]">
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
                          <p className="text-[11px] text-[#a3a3a3] tabular-nums mt-1">{fmtDate(p.publishAt || p.createdAt)}</p>
                        </div>
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          className={`shrink-0 w-4 h-4 text-[#a3a3a3] transition-transform ${open ? "rotate-180 text-[#e91e3f]" : ""}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
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
          </section>
        </Reveal>
      </>
    );
  }

  return (
    <main className="w-full flex-1 flex flex-col relative bg-[#f4f3f2] text-[#131313]">
      {/* 본문 렌더러는 다크 페이지 기준 색을 내보낸다 — 라이트 면에서 표·이미지 선이 보이도록 덮는다 */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .sp-body table, .sp-body th, .sp-body td { border-color: rgba(0,0,0,0.12); }
        .sp-body th { background: rgba(0,0,0,0.03); }
        .sp-body img { border-color: rgba(0,0,0,0.08); }
      `,
        }}
      />
      <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-12 md:pt-16 pb-20 flex-1">{body}</div>

      {copied && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#131313] text-white text-[12px] font-bold shadow-[0_12px_30px_-10px_rgba(0,0,0,0.5)]">
          복사됨
        </div>
      )}
    </main>
  );
}
