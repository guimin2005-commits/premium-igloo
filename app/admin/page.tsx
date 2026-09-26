"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
// 📌 관리자 공용 UI — 권한 가드 · 페이지 틀 · 숫자 줄 · 패널은 모두 여기서 가져온다.
import { useAdminGuard, AdminPage, StatRow, Panel, PanelGrid, Switch, DefRow, StatusChip } from "./ui";

// 📌 대시보드 (2026-09 개편)
//    예전엔 가운데 좁은 폭(max-w-5xl)에 번호 섹션(01 · 02)을 세로로 쌓고, 지표 · 차트가 전부 빨강이었다.
//    지금은 전체 폭에 네 줄 — 숫자 줄 → [확인할 일 · 서버 현황] → [골든타임 · 멤버 증감] → [문의 · 콘텐츠].
//    넓은 화면에서는 패널 두 개가 나란히, 좁으면 하나씩. 빨강은 "처리할 게 남았다"는 표시에만 쓴다.

// 📌 히트맵 칸 강도 — 빨강 농도 대신 잉크(#131313) 알파 다섯 단계. 0 은 가장 옅게, 데이터 없는 칸은 더 옅게
const HEAT_ALPHA = [0.05, 0.14, 0.3, 0.48, 0.68, 0.9];
const heatColor = (v: number, max: number) => {
  if (v < 0) return "rgba(19,19,19,0.03)";
  const step = v <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
  return `rgba(19,19,19,${HEAT_ALPHA[step]})`;
};

// 📌 패널 안 작은 숫자 · 날짜 글자 (메타 전용 #8a8a8a)
const META = "text-[12px] text-[#8a8a8a] tabular-nums";

export default function AdminHubPage() {
  const { isAdmin, gate } = useAdminGuard();

  const [stats, setStats] = useState({
    inquiries: 0, pending: 0, applies: 0, appliesPending: 0, codes: 0, payoutPending: 0,
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
      // 📌 날짜 키 · 라벨 모두 KST 로 — createdAt 은 UTC ISO 라 앞 10자로 자르면 KST 새벽 문의가 전날 막대에 잡혔다
      const KST = 9 * 60 * 60 * 1000;
      const kstKey = (t: number) => new Date(t + KST).toISOString().slice(0, 10);
      const inquiryDaily: { label: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const t = Date.now() - i * 24 * 60 * 60 * 1000;
        const dayStr = kstKey(t);
        const k = new Date(t + KST);
        inquiryDaily.push({
          label: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`,
          count: inquiries.filter((q: any) => {
            const at = q.createdAt ? new Date(q.createdAt).getTime() : NaN;
            return Number.isFinite(at) && kstKey(at) === dayStr;
          }).length,
        });
      }

      setStats({
        inquiries: inquiries.length,
        pending: inquiries.filter((i: any) => i.status === "접수 중").length,
        applies: applies.length,
        // 📌 "확인할 일" 줄의 심사 중 지원 — 좌측 메뉴 숫자와 같은 규칙(상태가 비면 심사 중)
        appliesPending: applies.filter((a: any) => (a.status || "심사 중") === "심사 중").length,
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

  // 로딩 중 / 권한 없음 화면은 공용 가드가 낸다 — 훅을 모두 부른 뒤에 빠져나가야 한다.
  if (gate) return gate;

  // 📌 숫자 줄에서 누르면 처리 화면으로 가는 값 — 칸 전체가 아니라 숫자에만 링크를 건다
  const statLink = (href: string, n: number) => (
    <Link href={href} className="hover:underline underline-offset-4 decoration-2 outline-none focus-visible:underline">{n.toLocaleString()}</Link>
  );

  // 📌 확인할 일 — 처리할 게 남은 곳으로 가는 줄. 0 이면 "없음"
  const todos = [
    { l: "미답변 문의", n: stats.pending, href: "/support?admin=1" },
    { l: "심사 중 지원", n: stats.appliesPending, href: "/recruit?admin=1" },
    { l: "지급 대기", n: stats.payoutPending, href: "/payouts" },
  ];

  // 📌 서버 현황 — 불러오기 전(또는 실패)에도 판 자리는 둔다. 값만 "—"
  const ds = discordStats;
  const discordCells = [
    { l: "부스트", n: ds?.boostCount, sub: ds ? `Tier ${ds.boostTier}` : undefined },
    { l: "역할", n: ds?.roleCount },
    { l: "텍스트 채널", n: ds?.textChannels },
    { l: "음성 채널", n: ds?.voiceChannels },
    { l: "카테고리", n: ds?.categories },
    { l: "이모지·스티커", n: ds ? ds.emojiCount + ds.stickerCount : undefined },
  ];

  const inquiryMax = Math.max(...stats.inquiryDaily.map((x) => x.count), 1);

  // 📌 멤버 증감 선 — 칸 폭을 끝까지 쓰도록 늘여 그리고(preserveAspectRatio none), 선 굵기는 고정
  const memberChart = (() => {
    if (memberDaily.length < 2) return null;
    const w = 600, h = 100;
    const vals = memberDaily.map((d) => d.members);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 6 - ((v - min) / range) * (h - 12)}`).join(" ");
    const delta = vals[vals.length - 1] - vals[0];
    return { w, h, vals, pts, delta };
  })();

  return (
    <AdminPage
      title="대시보드"
      actions={
        // 📌 점검 모드 — 글자를 눌러도 켜고 끈다(label 이 스위치 단추를 가리킨다)
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <span className={`text-[13px] font-bold ${maintenance ? "text-[#d01634]" : "text-[#5a5a5a]"}`}>{maintenance ? "점검 중" : "점검 모드"}</span>
          <Switch on={maintenance} onChange={() => toggleMaintenance()} disabled={maintenanceLoading} label="점검 모드" />
        </label>
      }
      bodyClass="space-y-5"
    >
      {/* 1 — 숫자 줄 */}
      <StatRow
        items={[
          { label: "전체 멤버", value: stats.memberCount.toLocaleString() },
          {
            label: "현재 온라인",
            value: (
              <span className="inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                {stats.onlineCount.toLocaleString()}
              </span>
            ),
          },
          { label: "미답변 문의", value: statLink("/support?admin=1", stats.pending), tone: stats.pending > 0 ? "bad" : undefined },
          { label: "지급 대기", value: statLink("/payouts", stats.payoutPending), tone: stats.payoutPending > 0 ? "bad" : undefined },
        ]}
      />

      {/* 2 — 확인할 일 · 서버 현황 (두 판 높이를 맞춘다: 그리드 칸 안에서 h-full) */}
      <PanelGrid>
        <Panel title="확인할 일" flush className="h-full">
          <div className="divide-y divide-[#ededed]">
            {todos.map((t) => (
              <Link
                key={t.l}
                href={t.href}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#f7f7f7] transition-colors outline-none focus-visible:bg-[#f7f7f7]"
              >
                <span className="min-w-0 flex-1 text-[14px] font-bold">{t.l}</span>
                {t.n > 0 ? (
                  <span className="text-[14px] font-black text-[#d01634] tabular-nums">{t.n.toLocaleString()}건</span>
                ) : (
                  <span className="text-[13px] text-[#a3a3a3]">없음</span>
                )}
                <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#a3a3a3]" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel
          title="Discord 서버 현황"
          right={ds ? <span className={META}>개설 D+{ds.ageDays.toLocaleString()}일</span> : undefined}
          flush
          className="h-full"
        >
          {/* 칸 사이 선은 1px 틈으로 — StatRow 와 같은 방식 */}
          <div className="grid grid-cols-3 gap-px bg-[#ededed] rounded-b-2xl overflow-hidden">
            {discordCells.map((s) => (
              <div key={s.l} className="px-4 md:px-5 py-4 bg-white min-w-0">
                <p className="text-[12px] font-bold text-[#5a5a5a] truncate">{s.l}</p>
                <p className="mt-1.5 text-[20px] font-black tracking-[-0.02em] tabular-nums leading-none">{s.n != null ? s.n.toLocaleString() : "—"}</p>
                {s.sub && <p className={`mt-1.5 ${META}`}>{s.sub}</p>}
              </div>
            ))}
          </div>
        </Panel>
      </PanelGrid>

      {/* 3 — 활동 골든타임 · 멤버 증감 */}
      <PanelGrid>
        <Panel
          title="활동 골든타임"
          desc="최근 7일 · 평균 온라인"
          right={heatmap.hasData ? <span className={META}>피크 {Math.round(heatmap.max)}명</span> : undefined}
          className="h-full"
        >
          {/* 좁은 화면에서는 페이지가 아니라 이 판만 가로로 스크롤된다 */}
          <div className="overflow-x-auto no-bar">
            <div className="min-w-[420px]">
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: "24px repeat(24, minmax(0, 1fr))" }}>
                <div></div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="text-center text-[11px] text-[#8a8a8a] tabular-nums leading-4">{h % 3 === 0 ? h : ""}</div>
                ))}
                {["일", "월", "화", "수", "목", "금", "토"].map((dayName, d) => (
                  <React.Fragment key={d}>
                    <div className="text-[12px] font-bold text-[#5a5a5a] flex items-center">{dayName}</div>
                    {heatmap.avg[d].map((v, h) => (
                      <div
                        key={h}
                        title={v >= 0 ? `${dayName} ${h}시 · 평균 ${Math.round(v)}명` : "데이터 없음"}
                        className="aspect-square"
                        style={{ backgroundColor: heatColor(v, heatmap.max) }}
                      ></div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
              {/* 표본이 적을 때 값이 튄다는 건 화면만 봐서는 모른다 — 그것만 남긴다 */}
              <p className="mt-3 text-[12px] text-[#5a5a5a]">데이터가 쌓일수록 정확해집니다</p>
            </div>
          </div>
        </Panel>

        <Panel
          title="멤버 증감"
          desc={memberDaily.length >= 2 ? `최근 ${memberDaily.length}일` : undefined}
          right={
            memberChart ? (
              <StatusChip tone={memberChart.delta >= 0 ? "ok" : "bad"}>
                {memberChart.delta >= 0 ? "▲" : "▼"} {Math.abs(memberChart.delta).toLocaleString()}명
              </StatusChip>
            ) : undefined
          }
          className="h-full"
        >
          {memberChart ? (
            <>
              <svg viewBox={`0 0 ${memberChart.w} ${memberChart.h}`} preserveAspectRatio="none" className="block w-full h-32 overflow-visible">
                <polygon points={`0,${memberChart.h} ${memberChart.pts} ${memberChart.w},${memberChart.h}`} fill="#131313" fillOpacity="0.05" />
                <polyline points={memberChart.pts} fill="none" stroke="#131313" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className={`flex justify-between gap-3 mt-2 ${META}`}>
                <span>{memberDaily[0].date.slice(5).replace("-", "/")} · {memberChart.vals[0].toLocaleString()}명</span>
                <span>{memberDaily[memberDaily.length - 1].date.slice(5).replace("-", "/")} · {memberChart.vals[memberChart.vals.length - 1].toLocaleString()}명</span>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-[13px] text-[#5a5a5a]">데이터 없음</p>
          )}
        </Panel>
      </PanelGrid>

      {/* 4 — 최근 7일 문의 · 콘텐츠 현황 */}
      <PanelGrid>
        <Panel title="최근 7일 문의" right={<span className={META}>총 {stats.weeklyInquiries}건</span>} className="h-full">
          <div className="flex items-end justify-between gap-2 h-32">
            {stats.inquiryDaily.map((d, i) => (
              // flex-col 에는 gap-* 가 먹지 않는다 (Tailwind v4) — 막대 위아래 간격은 마진으로 준다
              <div key={i} className="flex-1 min-w-0 flex flex-col items-center h-full justify-end">
                {d.count > 0 && <span className="text-[12px] font-bold text-[#131313] tabular-nums mb-1">{d.count}</span>}
                <div
                  className={`w-full ${d.count > 0 ? "bg-[#131313]" : "bg-[#ededed]"}`}
                  style={{ height: d.count > 0 ? `${Math.max((d.count / inquiryMax) * 100, 12)}%` : "4px" }}
                ></div>
                <span className={`mt-1.5 ${META}`}>{d.label}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="콘텐츠 & 활동 현황" className="h-full">
          <dl className="-my-2.5">
            <DefRow k="게시글">공지 {stats.postCounts.공지사항} · 이벤트 {stats.postCounts.이벤트} · 대회 {stats.postCounts.대회} · 구인 {stats.postCounts.구인}</DefRow>
            <DefRow k="문의">전체 {stats.inquiries}건 · 이번 주 {stats.weeklyInquiries}건</DefRow>
            <DefRow k="구인 지원">전체 {stats.applies}건 · 이번 주 {stats.weeklyApplies}건</DefRow>
            <DefRow k="쿠폰">발급 {stats.codes}개 · 누적 사용 {stats.codeUses}회</DefRow>
            <DefRow k="명예의 전당">수동 기록 {stats.honors}건</DefRow>
          </dl>
        </Panel>
      </PanelGrid>
    </AdminPage>
  );
}
