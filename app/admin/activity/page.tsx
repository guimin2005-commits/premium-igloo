"use client";

// 📌 이상 활동 — 잠수로 음성 XP 를 쌓는 유저를 가려 보는 읽기 전용 목록 (app/api/admin/activity · 셈의 정의는 lib/adminActivity.js)
//    목록 틀: 머리 → 기간 한 줄(모바일은 정렬 한 줄 더) → 전체 폭 표(PC 는 머리를 눌러 정렬) → 줄을 누르면 유저 조회(/admin/users?userId=)
//    봇이 음성 상황(ctx)을 실은 줄은 정확한 값, 그 전 줄은 혼자 · 음소거를 미루어 센다 — 그런 줄이 섞인 기간만 칩 하나로 근사치임을 알린다.
//    헤드셋 · 무활동 · 화면·캠은 ctx 줄에서만 센다(ctx 줄이 없는 유저는 "—"). 음성 XP 정지 중인 유저는 이름 옆 "정지" 칩.
//    주소에 ?period= · ?sort= 를 실어 새로고침해도 같은 보기가 열린다.

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminPage, Toolbar, Segmented, DataTable, StatusChip, EmptyRow, useAdminGuard, useNotice, type Column } from "../ui";

type Period = "today" | "7d" | "30d";
type SortKey = "score" | "voice" | "dayMax" | "streak" | "alone" | "muted" | "deaf" | "idle" | "live" | "chat" | "xp";
type Row = {
  userId: string; displayName: string; username: string;
  voiceN: number; voiceSec: number; dayMaxSec: number; streakSec: number;
  aloneN: number; aloneSec: number; aloneRate: number; mutedSec: number; mutedRate: number;
  exactN: number; approx: boolean; deafSec: number; deafRate: number; liveRate: number; idleSec: number;
  chatN: number; voiceXp: number; score: number; voiceOff?: boolean;
};
type Data = { period: Period; sort: SortKey; since: string; approx?: boolean; total: number; rows: Row[] };

const PERIODS: { v: Period; l: string }[] = [
  { v: "today", l: "오늘" },
  { v: "7d", l: "7일" },
  { v: "30d", l: "30일" },
];
// 모바일 정렬(표 머리가 없는 줄 카드) — 자주 보는 것만
const MOBILE_SORTS: { v: SortKey; l: string }[] = [
  { v: "score", l: "의심" },
  { v: "voice", l: "음성" },
  { v: "streak", l: "연속" },
  { v: "alone", l: "혼자" },
  { v: "muted", l: "음소거" },
];
const isPeriod = (v: string | null): v is Period => !!v && PERIODS.some((p) => p.v === v);
const SORT_KEYS: SortKey[] = ["score", "voice", "dayMax", "streak", "alone", "muted", "deaf", "idle", "live", "chat", "xp"];
const isSort = (v: string | null): v is SortKey => !!v && (SORT_KEYS as string[]).includes(v);

// "18시간 40분" · "35분" — 분은 반올림
const dur = (sec: number) => {
  const m = Math.round((sec || 0) / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`;
};
const pct = (v: number) => `${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const META = "text-[12px] text-[#8a8a8a] tabular-nums";
// 모바일 줄 카드에는 표 머리가 없다 — 값 앞에 이름을 붙인다(PC 에서는 숨김)
const ml = (l: string) => <span className="md:hidden">{l} </span>;

// 주소 맞추기 — 기본값(7일 · 의심 순)은 싣지 않는다. 📌 history.replaceState 는 Next 라우터가 받아 useSearchParams 를 바로 바꾼다(서버 왕복 없음)
const syncUrl = (period: Period, sort: SortKey) => {
  const sp = new URLSearchParams();
  if (period !== "7d") sp.set("period", period);
  if (sort !== "score") sp.set("sort", sort);
  const qs = sp.toString();
  window.history.replaceState(null, "", qs ? `/admin/activity?${qs}` : "/admin/activity");
};

export default function AdminActivityPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();
  const router = useRouter();

  // 📌 보기(기간 · 정렬)는 주소가 원본 — 새로고침 · 뒤로가기가 같은 보기를 연다
  const sp = useSearchParams();
  const pq = sp.get("period");
  const sq = sp.get("sort");
  const period: Period = isPeriod(pq) ? pq : "7d";
  const sort: SortKey = isSort(sq) ? sq : "score";
  const setPeriod = (p: Period) => syncUrl(p, sort);
  const setSort = (s: SortKey) => syncUrl(period, s);

  // 받은 결과는 어떤 보기의 것인지(key)와 함께 둔다 — 다른 보기를 읽는 동안에는 앞 결과를 흐리게 보여 준다
  const key = `${period}:${sort}`;
  const [shown, setShown] = useState<{ key: string; data: Data } | null>(null);
  const [failed, setFailed] = useState(""); // 읽지 못한 보기 — 그 보기에서는 "불러오는 중"을 끈다

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true; // 빠르게 바꾸면 늦게 온 이전 응답을 버린다
    const k = `${period}:${sort}`;
    fetch(`/api/admin/activity?period=${period}&sort=${sort}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
        if (!alive) return;
        setShown({ key: k, data: d.data });
        setFailed("");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setFailed(k);
        notify(e instanceof Error ? e.message : "불러오지 못했습니다.", true);
      });
    return () => { alive = false; };
  }, [isAdmin, period, sort, notify]);

  const data = shown?.data ?? null;
  const loading = shown?.key !== key && failed !== key;

  if (gate) return gate;

  // 표 머리 — 누르면 그 값이 큰 순. 화살표 자리는 늘 잡아 두어 고른 칸이 바뀌어도 머리 글자가 밀리지 않는다
  const head = (k: SortKey, l: string) => (
    <button
      type="button"
      onClick={() => setSort(k)}
      aria-pressed={sort === k}
      className={`inline-flex items-center gap-0.5 font-bold whitespace-nowrap outline-none focus-visible:underline ${sort === k ? "text-[#131313]" : "text-[#5a5a5a] hover:text-[#131313]"}`}
    >
      {l}
      <span aria-hidden className={sort === k ? "" : "invisible"}>↓</span>
    </button>
  );

  const columns: Column<Row>[] = [
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="inline-flex max-w-full items-baseline gap-1.5 min-w-0">
          <span className="font-bold truncate">{r.displayName}</span>
          {r.username && r.username !== r.displayName && <span className={`${META} truncate`}>@{r.username}</span>}
          {r.voiceOff && <StatusChip tone="bad" className="shrink-0 self-center">정지</StatusChip>}
        </span>
      ),
    },
    { key: "score", label: head("score", "의심"), align: "right", render: (r) => <span className="font-black tabular-nums">{ml("의심")}{r.score.toFixed(1)}</span> },
    {
      key: "voice",
      label: head("voice", "음성"),
      align: "right",
      render: (r) => (
        <span className="tabular-nums">
          {ml("음성")}{dur(r.voiceSec)}
          <span className={`ml-1.5 ${META}`}>{r.voiceN.toLocaleString()}회</span>
        </span>
      ),
    },
    { key: "dayMax", label: head("dayMax", "하루 최대"), align: "right", render: (r) => <span className="tabular-nums">{ml("하루 최대")}{dur(r.dayMaxSec)}</span> },
    { key: "streak", label: head("streak", "최장 연속"), align: "right", render: (r) => <span className="tabular-nums">{ml("연속")}{dur(r.streakSec)}</span> },
    {
      key: "alone",
      label: head("alone", "혼자"),
      align: "right",
      render: (r) => (
        <span className="tabular-nums">
          {ml("혼자")}{pct(r.aloneRate)}
          <span className={`ml-1.5 ${META}`}>{dur(r.aloneSec)}</span>
        </span>
      ),
    },
    {
      key: "muted",
      label: head("muted", "음소거"),
      align: "right",
      render: (r) => (
        <span className="tabular-nums">
          {ml("음소거")}{pct(r.mutedRate)}
          <span className={`ml-1.5 ${META}`}>{dur(r.mutedSec)}</span>
        </span>
      ),
    },
    {
      key: "deaf",
      label: head("deaf", "헤드셋"),
      align: "right",
      render: (r) => (
        <span className="tabular-nums">
          {ml("헤드셋")}
          {r.exactN ? <>{pct(r.deafRate)}<span className={`ml-1.5 ${META}`}>{dur(r.deafSec)}</span></> : "—"}
        </span>
      ),
    },
    { key: "idle", label: head("idle", "무활동"), align: "right", render: (r) => <span className="tabular-nums">{ml("무활동")}{r.exactN ? dur(r.idleSec) : "—"}</span> },
    { key: "live", label: head("live", "화면·캠"), align: "right", render: (r) => <span className="tabular-nums">{ml("화면·캠")}{r.exactN ? pct(r.liveRate) : "—"}</span> },
    { key: "chat", label: head("chat", "채팅"), align: "right", render: (r) => <span className="tabular-nums">{ml("채팅")}{r.chatN.toLocaleString()}</span> },
    { key: "xp", label: head("xp", "음성 XP"), align: "right", render: (r) => <span className="tabular-nums">{ml("음성 XP")}{r.voiceXp.toLocaleString()}</span> },
  ];

  return (
    <AdminPage section="SYSTEM : LEVEL" title="이상 활동">
      <Toolbar>
        <Segmented options={PERIODS} value={period} onChange={(v) => setPeriod(v as Period)} />
        {data?.approx && <StatusChip className="ml-auto">혼자 · 음소거 근사치</StatusChip>}
        {/* 모바일 — 줄 카드라 표 머리가 없다. 정렬은 이 줄에서 */}
        <div className="md:hidden w-full min-w-0">
          <Segmented options={MOBILE_SORTS} value={sort} onChange={(v) => setSort(v as SortKey)} />
        </div>
      </Toolbar>

      {data ? (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading || undefined}>
          <DataTable
            columns={columns}
            rows={data.rows}
            rowKey={(r) => r.userId}
            onRowClick={(r) => router.push(`/admin/users?userId=${encodeURIComponent(r.userId)}`)}
            empty="기록이 없습니다."
          />
        </div>
      ) : (
        <EmptyRow>{loading ? "불러오는 중…" : "기록이 없습니다."}</EmptyRow>
      )}
      {noticeEl}
    </AdminPage>
  );
}
