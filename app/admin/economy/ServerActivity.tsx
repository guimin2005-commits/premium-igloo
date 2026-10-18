"use client";

// 📌 통계 › 서버 활동 탭 — 대시보드에 있던 분석 판을 옮겨 온 것(2026-10-17 정리: 대시보드는 할 일만).
//    Discord 서버 현황(전체 멤버 · 현재 온라인 포함) → [활동 골든타임 · 멤버 증감] → [최근 7일 문의 · 콘텐츠 & 활동 현황]
//    읽기는 이 탭을 처음 열 때 한 번(부르는 쪽이 탭을 떠나도 그려 둔 채 숨긴다 — 다시 와도 또 받지 않는다).
//    대시보드가 열 때마다 받던 목록(문의 · 지원서 · 쿠폰 · 글 · 명예의 전당)은 이제 이 탭에서만 받는다.
//    날짜 · 요일 · 시간은 모두 KST.

import React, { useEffect, useState } from "react";
import { Panel, PanelGrid, DefRow, StatusChip } from "../ui";

type DiscordStats = {
  memberCount: number;
  onlineCount: number;
  boostCount: number;
  boostTier: number;
  roleCount: number;
  textChannels: number;
  voiceChannels: number;
  categories: number;
  emojiCount: number;
  stickerCount: number;
  ageDays: number;
};
type Sample = { ts: string; online?: number; members?: number };
type Heat = { avg: number[][]; max: number; hasData: boolean };
type MemberDay = { date: string; members: number };
type PostKey = "공지사항" | "이벤트" | "대회" | "구인";
type Lists = {
  inquiryDaily: { label: string; count: number }[];
  inquiries: number;
  weeklyInquiries: number;
  applies: number;
  weeklyApplies: number;
  codes: number;
  codeUses: number;
  honors: number;
  postCounts: Record<PostKey, number>;
};

const KST = 9 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const WEEK_NAMES = ["일", "월", "화", "수", "목", "금", "토"];
// 📌 패널 안 작은 숫자 · 날짜 글자 (메타 전용 #8a8a8a)
const META = "text-[12px] text-[#8a8a8a] tabular-nums";

// 📌 히트맵 칸 강도 — 빨강 농도 대신 잉크(#131313) 알파 다섯 단계. 0 은 가장 옅게, 데이터 없는 칸은 더 옅게
const HEAT_ALPHA = [0.05, 0.14, 0.3, 0.48, 0.68, 0.9];
const heatColor = (v: number, max: number) => {
  if (v < 0) return "rgba(19,19,19,0.03)";
  const step = v <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil((v / max) * 5)));
  return `rgba(19,19,19,${HEAT_ALPHA[step]})`;
};

// 응답의 data 배열 — 실패 · 다른 모양이면 빈 배열
const listOf = (v: unknown): Record<string, unknown>[] => {
  const d = (v as { data?: unknown } | null)?.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
};
const getJson = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
const timeOf = (v: unknown) => (v ? new Date(String(v)).getTime() : NaN);
const kstKey = (t: number) => new Date(t + KST).toISOString().slice(0, 10);
const fmt = (n: number | null | undefined) => (n != null ? n.toLocaleString() : "—");

// 📌 요일×시간대 온라인 히트맵 (최근 7일 평균) · 일별 멤버 수 (최근 30일, 각 날짜의 마지막 샘플)
function fromSamples(samples: Sample[], now: number): { heat: Heat; members: MemberDay[] } {
  const weekAgo = now - 7 * DAY;
  const cells = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })));
  const byDay = new Map<string, number>();
  samples.forEach((s) => {
    const t = timeOf(s.ts);
    if (!Number.isFinite(t)) return;
    const k = new Date(t + KST);
    if (t >= weekAgo) {
      const c = cells[k.getUTCDay()][k.getUTCHours()];
      c.sum += s.online || 0;
      c.n += 1;
    }
    if (s.members) byDay.set(k.toISOString().slice(0, 10), s.members);
  });
  const avg = cells.map((row) => row.map((c) => (c.n ? c.sum / c.n : -1)));
  const flat = avg.flat().filter((v) => v >= 0);
  return {
    heat: { avg, max: Math.max(...flat, 1), hasData: flat.length > 0 },
    members: Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, members]) => ({ date, members })),
  };
}

function fromLists(inq: unknown, app: unknown, coupon: unknown, posts: unknown, honors: unknown, now: number): Lists {
  const inquiries = listOf(inq);
  const applies = listOf(app);
  const codes = listOf(coupon);
  const weekAgo = now - 7 * DAY;
  const postCounts: Record<PostKey, number> = { 공지사항: 0, 이벤트: 0, 대회: 0, 구인: 0 };
  listOf(posts).forEach((p) => {
    const c = String(p.category || "") as PostKey;
    if (c in postCounts) postCounts[c]++;
  });
  // 📌 날짜 키 · 라벨 모두 KST 로 — createdAt 은 UTC ISO 라 앞 10자로 자르면 KST 새벽 문의가 전날 막대에 잡혔다
  const inquiryDaily: Lists["inquiryDaily"] = [];
  for (let i = 6; i >= 0; i--) {
    const t = now - i * DAY;
    const key = kstKey(t);
    const k = new Date(t + KST);
    inquiryDaily.push({
      label: `${k.getUTCMonth() + 1}/${k.getUTCDate()}`,
      count: inquiries.filter((q) => {
        const at = timeOf(q.createdAt);
        return Number.isFinite(at) && kstKey(at) === key;
      }).length,
    });
  }
  const usedOf = (c: Record<string, unknown>) => Number(c.usedCount ?? (Array.isArray(c.usedBy) ? c.usedBy.length : 0)) || 0;
  return {
    inquiryDaily,
    inquiries: inquiries.length,
    weeklyInquiries: inquiries.filter((q) => timeOf(q.createdAt) > weekAgo).length,
    applies: applies.length,
    weeklyApplies: applies.filter((a) => timeOf(a.createdAt) > weekAgo).length,
    codes: codes.length,
    codeUses: codes.reduce((sum, c) => sum + usedOf(c), 0),
    honors: listOf(honors).length,
    postCounts,
  };
}

export default function ServerActivity() {
  const [ds, setDs] = useState<DiscordStats | null>(null);
  const [act, setAct] = useState<{ heat: Heat; members: MemberDay[] } | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);

  useEffect(() => {
    let alive = true;
    // 📌 디스코드 서버 상세 통계(멤버 · 온라인 포함) — 5분 캐시
    getJson("/api/discord-stats").then((d) => {
      if (alive && d?.success) setDs(d as DiscordStats);
    });
    // 📌 30일 활동 샘플 (히트맵 + 멤버 증감)
    getJson("/api/stats?days=30").then((d) => {
      if (!alive) return;
      const history: Sample[] = d?.success && Array.isArray(d.history) ? d.history : [];
      setAct(fromSamples(history, Date.now()));
    });
    // 📌 최근 7일 문의 · 콘텐츠 & 활동 현황 — 개수 전용 API 가 없어 목록을 받아 센다(이 탭에서만)
    Promise.all([
      getJson("/api/inquiry"),
      getJson("/api/user/applies?admin=true"),
      getJson("/api/shop/coupons"),
      getJson("/api/posts?all=1"),
      getJson("/api/honors"),
    ]).then(([inq, app, coupon, posts, honors]) => {
      if (alive) setLists(fromLists(inq, app, coupon, posts, honors, Date.now()));
    });
    return () => { alive = false; };
  }, []);

  const heat = act?.heat;
  const memberDaily = act?.members || [];
  // 📌 멤버 증감 선 — 칸 폭을 끝까지 쓰도록 늘여 그리고(preserveAspectRatio none), 선 굵기는 고정
  const memberChart = (() => {
    if (memberDaily.length < 2) return null;
    const w = 600, h = 100;
    const vals = memberDaily.map((d) => d.members);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 6 - ((v - min) / range) * (h - 12)}`).join(" ");
    return { w, h, vals, pts, delta: vals[vals.length - 1] - vals[0] };
  })();
  const inquiryDaily = lists?.inquiryDaily || [];
  const inquiryMax = Math.max(...inquiryDaily.map((x) => x.count), 1);

  // 📌 서버 현황 — 불러오기 전(또는 실패)에도 판 자리는 둔다. 값만 "—". 칸 8개라 2 · 4 · 8 열 어디서든 빈 칸이 없다
  const discordCells = [
    { l: "전체 멤버", n: ds?.memberCount },
    { l: "현재 온라인", n: ds?.onlineCount, dot: true },
    // 아래 줄은 읽기 전에도 자리만 잡아 둔다 — 읽은 뒤 줄 높이가 늘며 아래 판이 밀리지 않게
    { l: "부스트", n: ds?.boostCount, sub: ds ? `Tier ${ds.boostTier}` : " " },
    { l: "역할", n: ds?.roleCount },
    { l: "텍스트 채널", n: ds?.textChannels },
    { l: "음성 채널", n: ds?.voiceChannels },
    { l: "카테고리", n: ds?.categories },
    { l: "이모지·스티커", n: ds ? ds.emojiCount + ds.stickerCount : undefined },
  ];

  return (
    <div className="space-y-5">
      <Panel
        id="sec-discord"
        title="Discord 서버 현황"
        right={ds ? <span className={META}>개설 D+{ds.ageDays.toLocaleString()}일</span> : undefined}
        flush
        className="scroll-mt-24"
      >
        {/* 칸 사이 선은 1px 틈으로 — StatRow 와 같은 방식 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-px bg-[#ededed] rounded-b-2xl overflow-hidden">
          {discordCells.map((s) => (
            <div key={s.l} className="px-4 md:px-5 py-4 bg-white min-w-0">
              <p className="text-[12px] font-bold text-[#5a5a5a] truncate">{s.l}</p>
              <p className="mt-1.5 text-[20px] font-black tracking-[-0.02em] tabular-nums leading-none">
                {s.dot && s.n != null && <span aria-hidden className="inline-block align-middle w-2 h-2 mr-2 rounded-full bg-emerald-600" />}
                {fmt(s.n)}
              </p>
              {s.sub && <p className={`mt-1.5 ${META}`}>{s.sub}</p>}
            </div>
          ))}
        </div>
      </Panel>

      <PanelGrid>
        <Panel
          id="sec-golden"
          title="활동 골든타임"
          desc="최근 7일 · 평균 온라인"
          right={heat?.hasData ? <span className={META}>피크 {Math.round(heat.max)}명</span> : undefined}
          className="h-full scroll-mt-24"
        >
          {/* 📌 375 폭에서도 판 안에 다 들어간다(칸 최소 폭 없음) — 옆으로 밀어 보는 스크롤을 두지 않는다 */}
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: "18px repeat(24, minmax(0, 1fr))" }}>
            <div></div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-center text-[10px] sm:text-[11px] text-[#8a8a8a] tabular-nums leading-4 whitespace-nowrap">{h % 3 === 0 ? h : ""}</div>
            ))}
            {WEEK_NAMES.map((dayName, d) => (
              <React.Fragment key={d}>
                <div className="text-[12px] font-bold text-[#5a5a5a] flex items-center">{dayName}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = heat ? heat.avg[d][h] : -1;
                  return (
                    <div
                      key={h}
                      title={v >= 0 ? `${dayName} ${h}시 · 평균 ${Math.round(v)}명` : "데이터 없음"}
                      className="aspect-square"
                      style={{ backgroundColor: heatColor(v, heat?.max || 1) }}
                    ></div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {/* 표본이 적을 때 값이 튄다는 건 화면만 봐서는 모른다 — 그것만 남긴다 */}
          <p className="mt-3 text-[12px] text-[#5a5a5a]">데이터가 쌓일수록 정확해집니다</p>
        </Panel>

        <Panel
          id="sec-members"
          title="멤버 증감"
          desc={memberDaily.length >= 2 ? `최근 ${memberDaily.length}일` : undefined}
          right={
            memberChart ? (
              <StatusChip tone={memberChart.delta >= 0 ? "ok" : "bad"}>
                {memberChart.delta >= 0 ? "▲" : "▼"} {Math.abs(memberChart.delta).toLocaleString()}명
              </StatusChip>
            ) : undefined
          }
          className="h-full scroll-mt-24"
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
            <p className="py-10 text-center text-[13px] text-[#5a5a5a]">{act ? "데이터 없음" : "불러오는 중…"}</p>
          )}
        </Panel>
      </PanelGrid>

      <PanelGrid>
        <Panel
          id="sec-inquiry"
          title="최근 7일 문의"
          right={<span className={META}>총 {fmt(lists?.weeklyInquiries)}건</span>}
          className="h-full scroll-mt-24"
        >
          {lists ? (
            <div className="flex items-end justify-between gap-2 h-32">
              {inquiryDaily.map((d, i) => (
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
          ) : (
            <p className="h-32 flex items-center justify-center text-[13px] text-[#5a5a5a]">불러오는 중…</p>
          )}
        </Panel>

        <Panel id="sec-content" title="콘텐츠 & 활동 현황" className="h-full scroll-mt-24">
          <dl className="-my-2.5">
            <DefRow k="게시글">
              {/* 좁은 폭에서 「구인」이 「구 / 인」으로 끊기지 않게 낱말 단위로 줄을 바꾼다 */}
              <span className="break-keep">
                {lists
                  ? `공지 ${lists.postCounts.공지사항} · 이벤트 ${lists.postCounts.이벤트} · 대회 ${lists.postCounts.대회} · 구인 ${lists.postCounts.구인}`
                  : "—"}
              </span>
            </DefRow>
            <DefRow k="문의">{lists ? `전체 ${lists.inquiries}건 · 이번 주 ${lists.weeklyInquiries}건` : "—"}</DefRow>
            <DefRow k="구인 지원">{lists ? `전체 ${lists.applies}건 · 이번 주 ${lists.weeklyApplies}건` : "—"}</DefRow>
            <DefRow k="쿠폰">{lists ? `발급 ${lists.codes}개 · 누적 사용 ${lists.codeUses}회` : "—"}</DefRow>
            <DefRow k="명예의 전당">{lists ? `수동 기록 ${lists.honors}건` : "—"}</DefRow>
          </dl>
        </Panel>
      </PanelGrid>
    </div>
  );
}
