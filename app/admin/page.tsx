"use client";

import React, { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { Reveal, LuxStyles } from "../components/Lux";

const ADMIN_USERS = ["elahw.06"];

export default function AdminHubPage() {
  const { data: session, status } = useSession();
  const isAdmin = status === "authenticated" && session?.user?.name && ADMIN_USERS.includes(session.user.name);

  const [stats, setStats] = useState({
    inquiries: 0, pending: 0, applies: 0, codes: 0, payoutPending: 0,
    weeklyInquiries: 0, weeklyApplies: 0,
    codeUses: 0, honors: 0,
    postCounts: { 공지사항: 0, 이벤트: 0, 대회: 0, 구인: 0 },
    memberCount: 0, onlineCount: 0,
    inquiryDaily: [] as { label: string; count: number }[],
  });
  const [discordStats, setDiscordStats] = useState<any>(null);
  const [activitySamples, setActivitySamples] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  const toggleMaintenance = async () => {
    if (maintenanceLoading) return;
    setMaintenanceLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maintenance: !maintenance }),
      });
      const d = await res.json();
      if (d.success) setMaintenance(d.maintenance);
    } catch {}
    setMaintenanceLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      fetch("/api/inquiry", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/user/applies?admin=true", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/coupons", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/payout", { cache: "no-store" }).then(r => r.json()).catch(() => ({ pendingCount: 0 })),
      fetch("/api/posts?all=1", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/honors", { cache: "no-store" }).then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/stats", { cache: "no-store" }).then(r => r.json()).catch(() => ({})),
    ]).then(([inq, app, coupon, payout, posts, honors, discord]) => {
      const inquiries = Array.isArray(inq?.data) ? inq.data : [];
      const applies = Array.isArray(app?.data) ? app.data : [];
      const codes = Array.isArray(coupon?.data) ? coupon.data : [];
      const allPosts = Array.isArray(posts?.data) ? posts.data : [];
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // 카테고리별 게시글 수
      const postCounts = { 공지사항: 0, 이벤트: 0, 대회: 0, 구인: 0 } as any;
      allPosts.forEach((p: any) => { if (postCounts[p.category] !== undefined) postCounts[p.category]++; });

      // 최근 7일 일별 문의 추이
      const inquiryDaily: { label: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        const dayStr = day.toISOString().slice(0, 10);
        inquiryDaily.push({
          label: `${day.getMonth() + 1}/${day.getDate()}`,
          count: inquiries.filter((q: any) => (q.createdAt || "").slice(0, 10) === dayStr).length,
        });
      }

      setStats({
        inquiries: inquiries.length,
        pending: inquiries.filter((i: any) => i.status === "접수 중").length,
        applies: applies.length,
        codes: codes.length,
        codeUses: codes.reduce((sum: number, c: any) => sum + (c.usedCount ?? c.usedBy?.length ?? 0), 0),
        honors: Array.isArray(honors?.data) ? honors.data.length : 0,
        payoutPending: payout?.pendingCount || 0,
        weeklyInquiries: inquiries.filter((i: any) => new Date(i.createdAt).getTime() > weekAgo).length,
        weeklyApplies: applies.filter((a: any) => new Date(a.createdAt).getTime() > weekAgo).length,
        postCounts,
        memberCount: discord?.memberCount || 0,
        onlineCount: discord?.onlineCount || 0,
        inquiryDaily,
      });
    });

    // 📌 디스코드 서버 상세 통계
    fetch("/api/discord-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setDiscordStats(d); })
      .catch(() => {});

    // 📌 30일 활동 샘플 (히트맵 + 멤버 증감)
    fetch("/api/stats?days=30", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.success) setActivitySamples(d.history || []); })
      .catch(() => {});

    // 📌 점검 모드 상태
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMaintenance(!!d.maintenance))
      .catch(() => {});
  }, [isAdmin]);

  // 📌 요일×시간대 온라인 히트맵 (KST, 최근 7일 평균)
  const heatmap = (() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const cells: { sum: number; n: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })));
    activitySamples.forEach((s: any) => {
      const t = new Date(s.ts).getTime();
      if (t < weekAgo) return;
      const kst = new Date(t + 9 * 60 * 60 * 1000);
      cells[kst.getUTCDay()][kst.getUTCHours()].sum += s.online || 0;
      cells[kst.getUTCDay()][kst.getUTCHours()].n += 1;
    });
    const avg = cells.map((row) => row.map((c) => (c.n ? c.sum / c.n : -1)));
    const max = Math.max(...avg.flat().filter((v) => v >= 0), 1);
    return { avg, max, hasData: avg.flat().some((v) => v >= 0) };
  })();

  // 📌 일별 멤버 수 (최근 30일, 각 날짜의 마지막 샘플)
  const memberDaily = (() => {
    const byDay = new Map<string, number>();
    activitySamples.forEach((s: any) => {
      if (!s.members) return;
      const kst = new Date(new Date(s.ts).getTime() + 9 * 60 * 60 * 1000);
      byDay.set(kst.toISOString().slice(0, 10), s.members);
    });
    return Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, members]) => ({ date, members }));
  })();

  if (status === "loading") return <div className="min-h-[60vh] flex items-center justify-center text-gray-500">로딩 중...</div>;
  if (!isAdmin) {
    return (
      <main className="w-full max-w-sm mx-auto px-6 py-40 text-center flex-1 flex flex-col justify-center">
        <h2 className="text-xl font-black text-white mb-2">권한 없음</h2>
        <p className="text-gray-400 text-sm mb-4">관리자 권한이 필요합니다.</p>
        <button onClick={() => signIn("discord")} className="w-full py-3.5 bg-[#5865F2] text-white font-bold rounded-xl mt-4">디스코드 로그인</button>
      </main>
    );
  }

  // 플랫 섹션 헤더 (공문서 스타일)
  const SectionHead = ({ no, title, right }: { no: string; title: string; right?: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-baseline gap-4 mb-2">
        <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
        <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent"></div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-lg md:text-xl font-black text-white tracking-tight">{title}</h2>
        {right}
      </div>
    </div>
  );

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      {/* ── HERO ── */}
      <section className="relative w-full pt-16 pb-10 md:pt-20 md:pb-12 px-6">
        <div className="absolute inset-0 lux-grid-bg pointer-events-none"></div>
        <div className="max-w-5xl mx-auto relative z-10">
          <Reveal>
            <div className="flex items-center gap-3 mb-5">
              <span className="w-8 h-px bg-[#e91e3f]"></span>
              <span className="text-[10px] font-black tracking-[0.4em] text-gray-500 uppercase">Admin Console</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter leading-none mb-4">
              <span className="text-white">관리자 </span><span className="text-[#e91e3f]">대시보드</span>
            </h1>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">서버·사이트 현황 요약 — 작업은 왼쪽 패널에서 이동합니다</p>
          </Reveal>
        </div>
      </section>

      <div className="w-full max-w-5xl mx-auto px-6 pb-16 flex-1 flex flex-col">

      {/* 01 — 핵심 지표 */}
      <Reveal>
      <section className="mb-14">
        <SectionHead
          no="01"
          title="핵심 지표"
          right={
            <div className="flex items-center gap-2.5">
              <span className={`text-[10px] font-black tracking-wider ${maintenance ? "text-[#e91e3f]" : "text-gray-400"}`}>{maintenance ? "🔧 점검 중" : "점검 모드"}</span>
              <button onClick={toggleMaintenance} disabled={maintenanceLoading} className={`w-11 h-6 rounded-full relative outline-none focus:outline-none transition-colors ${maintenance ? "bg-[#e91e3f]" : "bg-white/10"}`}>
                <div className={`absolute left-1 top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${maintenance ? "translate-x-5" : ""}`}></div>
              </button>
            </div>
          }
        />

        <div className="grid grid-cols-2 md:grid-cols-4 border-y border-white/10 divide-x divide-white/[0.06]">
          {[
            { n: stats.memberCount, l: "전체 멤버", accent: false },
            { n: stats.onlineCount, l: "현재 온라인", accent: false, dot: true },
            { n: stats.pending, l: "미답변 문의", accent: stats.pending > 0 },
            { n: stats.payoutPending, l: "지급 대기", accent: stats.payoutPending > 0 },
          ].map((s, i) => (
            <div key={i} className="px-4 py-7 text-center">
              <div className={`text-2xl md:text-3xl font-black tracking-tight flex items-center justify-center gap-2 ${s.accent ? "text-[#e91e3f]" : "text-white"}`}>
                {s.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
                {s.n.toLocaleString()}
              </div>
              <div className="text-[9px] md:text-[10px] font-bold tracking-[0.2em] text-gray-400 mt-1.5 uppercase">{s.l}</div>
            </div>
          ))}
        </div>

        {/* 디스코드 서버 현황 — 플랫 행 */}
        {discordStats && (
          <div className="border-b border-white/[0.06] py-6">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">Discord 서버 현황</span>
              <span className="text-[10px] font-bold text-gray-400">개설 D+{discordStats.ageDays.toLocaleString()}일</span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {[
                { n: discordStats.boostCount, l: "부스트", sub: `Tier ${discordStats.boostTier}`, accent: true },
                { n: discordStats.roleCount, l: "역할" },
                { n: discordStats.textChannels, l: "텍스트 채널" },
                { n: discordStats.voiceChannels, l: "음성 채널" },
                { n: discordStats.categories, l: "카테고리" },
                { n: discordStats.emojiCount + discordStats.stickerCount, l: "이모지·스티커" },
              ].map((s: any, i: number) => (
                <div key={i} className="text-center">
                  <div className={`text-xl md:text-2xl font-black tracking-tight ${s.accent ? "text-[#e91e3f]" : "text-white"}`}>{s.n.toLocaleString()}</div>
                  <div className="text-[9px] font-bold tracking-[0.15em] text-gray-400 mt-1 uppercase">{s.l}</div>
                  {s.sub && <div className="text-[9px] font-bold text-[#e91e3f]/70 mt-0.5">{s.sub}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      </Reveal>

      {/* 02 — 활동 분석 */}
      <Reveal>
      <section className="mb-14">
        <SectionHead no="02" title="활동 분석" />

        {/* 요일×시간대 온라인 히트맵 */}
        {heatmap.hasData && (
          <div className="border-b border-white/[0.06] pb-6 mb-6 overflow-x-auto no-bar">
            <div className="flex items-center justify-between mb-5 min-w-[560px]">
              <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">활동 골든타임 (최근 7일 · 평균 온라인)</span>
              <span className="text-[10px] font-bold text-gray-400">피크 {Math.round(heatmap.max)}명</span>
            </div>
            <div className="min-w-[560px]">
              <div className="grid gap-[3px]" style={{ gridTemplateColumns: "28px repeat(24, 1fr)" }}>
                <div></div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center text-[8px] font-bold text-gray-400">{h % 3 === 0 ? h : ""}</div>
                ))}
                {["일", "월", "화", "수", "목", "금", "토"].map((dayName, d) => (
                  <React.Fragment key={d}>
                    <div className="text-[9px] font-bold text-gray-500 flex items-center">{dayName}</div>
                    {heatmap.avg[d].map((v, h) => (
                      <div
                        key={h}
                        title={v >= 0 ? `${dayName} ${h}시 · 평균 ${Math.round(v)}명` : "데이터 없음"}
                        className="aspect-square rounded-[3px]"
                        style={{ backgroundColor: v < 0 ? "rgba(255,255,255,0.03)" : `rgba(233,30,63,${0.08 + (v / heatmap.max) * 0.85})` }}
                      ></div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
              <p className="text-[9px] text-gray-400 mt-3">색이 진할수록 온라인 인원이 많은 시간대 · 데이터가 쌓일수록 정확해집니다</p>
            </div>
          </div>
        )}

        {/* 멤버 증감 (최근 30일) */}
        {memberDaily.length >= 2 && (() => {
          const w = 600, h = 80;
          const vals = memberDaily.map((d) => d.members);
          const min = Math.min(...vals), max = Math.max(...vals);
          const range = max - min || 1;
          const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 6 - ((v - min) / range) * (h - 12)}`).join(" ");
          const delta = vals[vals.length - 1] - vals[0];
          return (
            <div className="border-b border-white/[0.06] pb-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">멤버 증감 (최근 {memberDaily.length}일)</span>
                <span className={`text-[11px] font-black ${delta >= 0 ? "text-emerald-400" : "text-[#e91e3f]"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toLocaleString()}명</span>
              </div>
              <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20 overflow-visible">
                <defs>
                  <linearGradient id="memberFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#e91e3f" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#e91e3f" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#memberFill)" />
                <polyline points={pts} fill="none" stroke="#e91e3f" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <div className="flex justify-between text-[9px] font-bold text-gray-400 mt-2">
                <span>{memberDaily[0].date.slice(5).replace("-", "/")} · {vals[0].toLocaleString()}명</span>
                <span>{memberDaily[memberDaily.length - 1].date.slice(5).replace("-", "/")} · {vals[vals.length - 1].toLocaleString()}명</span>
              </div>
            </div>
          );
        })()}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
          {/* 최근 7일 문의 추이 바 차트 */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase">최근 7일 문의</span>
              <span className="text-[10px] font-bold text-gray-400">총 {stats.weeklyInquiries}건</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-24">
              {stats.inquiryDaily.map((d, i) => {
                const max = Math.max(...stats.inquiryDaily.map((x) => x.count), 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    {d.count > 0 && <span className="text-[9px] font-black text-[#e91e3f]">{d.count}</span>}
                    <div
                      className={`w-full rounded-t-md transition-all ${d.count > 0 ? "bg-gradient-to-t from-[#e91e3f]/60 to-[#e91e3f]" : "bg-white/5"}`}
                      style={{ height: d.count > 0 ? `${Math.max((d.count / max) * 100, 12)}%` : "4px" }}
                    ></div>
                    <span className="text-[8px] font-bold text-gray-400">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 콘텐츠/활동 현황 — 표 형식 */}
          <div>
            <span className="text-[10px] font-black tracking-[0.25em] text-gray-500 uppercase block mb-5">콘텐츠 & 활동 현황</span>
            <div>
              {[
                { l: "게시글", v: `공지 ${stats.postCounts.공지사항} · 이벤트 ${stats.postCounts.이벤트} · 대회 ${stats.postCounts.대회} · 구인 ${stats.postCounts.구인}` },
                { l: "문의", v: `전체 ${stats.inquiries}건 · 이번 주 ${stats.weeklyInquiries}건` },
                { l: "구인 지원", v: `전체 ${stats.applies}건 · 이번 주 ${stats.weeklyApplies}건` },
                { l: "쿠폰", v: `발급 ${stats.codes}개 · 누적 사용 ${stats.codeUses}회` },
                { l: "명예의 전당", v: `수동 기록 ${stats.honors}건` },
              ].map((row, i) => (
                <div key={i} className="flex items-baseline justify-between gap-4 py-2 border-b border-white/[0.05] last:border-0">
                  <span className="text-[11px] font-bold text-gray-500 shrink-0">{row.l}</span>
                  <span className="text-[11px] font-bold text-gray-300 text-right">{row.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      </Reveal>
      </div>
    </main>
  );
}
