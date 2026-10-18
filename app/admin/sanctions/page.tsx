"use client";

// 📌 제재 · 잠수 — 2026-10-13 운영자 "제재 먹은 유저나 내보내진 유저 볼 수 있게 기록창" (app/api/admin/sanctions)
//    2026-10-17 이상 활동(옛 /admin/activity — 지금은 이 화면으로 넘겨준다)을 합쳤다. 탭 셋(머리 탭 한 줄, 주소 ?tab=):
//      제재 중(음성 XP 정지 · XP 획득 중단 — 봇 잠수 확인이 30분부터 당기는 사람) · 잠수 이동(잠수 채널로 옮겨진 적 있는 유저) ·
//      이상 활동(잠수로 음성 XP 를 쌓는 유저를 가려 보는 목록 — app/api/admin/activity, 셈의 정의는 lib/adminActivity.js. 주소 ?period= · ?sort=)
//    줄을 누르면 그 자리 상세 칸(폰은 아래 판) — 제재 해제(음성 XP 정지 · XP 획득 중단, 유저 조회와 같은 API) · 이동 횟수 지우기 · 이동 기록 · 유저 조회로 가기.
//    「중단 기간 끝남 · 해제 안 함」(봇은 계속 제재 중으로 본다)도 여기서 [해제]로 지운다. 확인은 한 번.
//    제재 중 첫 확인 = 기본(레벨 설정 afkCheckSanctionMin) − 제재 중 이동 횟수 × 5분, 10분이 바닥(lib/afkCheck.js · 봇 afkCheck.js 같은 식)
//    옛 주소 ?tab=logs(이동 기록 탭)는 잠수 이동 탭으로 연다 — 이동 기록은 상세 칸 안에 있다

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminPage, AdminTabs, Toolbar, Segmented, SearchInput, DataTable, StatusChip, EmptyRow, DetailPane, DefRow, Btn, ConfirmDialog,
  useAdminGuard, useToast, type Column, type SortState,
} from "../ui";

type StopStatus = "active" | "reserved" | "ended";
type XpStop = { from: string | null; until: string | null; by: string; reason: string; status: StopStatus };
type UserRow = { userId: string; displayName: string; username: string; afkMoves: number; afkSanctionMoves: number; afkMovedAt: string | null; sanctioned: boolean };
type SanctionRow = UserRow & { voiceOff: { at: string | null; by: string } | null; xpStop: XpStop | null; nextWaitMin: number };
type Rule = { on: boolean; baseMin: number; stepMin: number; floorMin: number };
type ListData = { rule: Rule; sanctioned: SanctionRow[]; moved: UserRow[] };
type LogRow = { id: string; channelName: string; sanctioned: boolean; waitMin: number; moves: number; sanctionMoves: number; at: string | null };
// 상세 칸 — 고른 유저를 따로 읽는다(GET ?userId=). key 가 고른 유저가 아니면 읽는 중
type PaneData = { key: string; user: SanctionRow | null; logs: LogRow[]; failed: boolean };

// ── 이상 활동 ──
type Period = "today" | "7d" | "30d";
type ActSort = "score" | "voice" | "dayMax" | "streak" | "alone" | "muted" | "deaf" | "idle" | "live" | "chat" | "xp";
type ActRow = {
  userId: string; displayName: string; username: string;
  voiceN: number; voiceSec: number; dayMaxSec: number; streakSec: number;
  aloneN: number; aloneSec: number; aloneRate: number; mutedSec: number; mutedRate: number;
  exactN: number; approx: boolean; deafSec: number; deafRate: number; liveRate: number; idleSec: number | null;
  chatN: number; voiceXp: number; score: number; voiceOff?: boolean;
};
type ActData = { period: Period; sort: ActSort; since: string; approx?: boolean; total: number; rows: ActRow[] };
const PERIODS: { v: Period; l: string }[] = [
  { v: "today", l: "오늘" },
  { v: "7d", l: "7일" },
  { v: "30d", l: "30일" },
];
const isPeriod = (v: string | null): v is Period => !!v && PERIODS.some((p) => p.v === v);
const ACT_SORTS: ActSort[] = ["score", "voice", "dayMax", "streak", "alone", "muted", "deaf", "idle", "live", "chat", "xp"];
const isActSort = (v: string | null): v is ActSort => !!v && (ACT_SORTS as string[]).includes(v);

type Tab = "sanctioned" | "moved" | "activity";
const TABS: { id: Tab; short: string }[] = [
  { id: "sanctioned", short: "제재 중" },
  { id: "moved", short: "잠수 이동" },
  { id: "activity", short: "이상 활동" },
];
const tabOf = (v: string | null): Tab => (v === "moved" || v === "logs" ? "moved" : v === "activity" ? "activity" : "sanctioned");
// 주소 — 기본값(제재 중 · 7일 · 의심 순)은 싣지 않는다
const hrefOf = (t: Tab, period: Period = "7d", sort: ActSort = "score") => {
  const sp = new URLSearchParams();
  if (t !== "sanctioned") sp.set("tab", t);
  if (t === "activity") {
    if (period !== "7d") sp.set("period", period);
    if (sort !== "score") sp.set("sort", sort);
  }
  const qs = sp.toString();
  return qs ? `/admin/sanctions?${qs}` : "/admin/sanctions";
};

const META = "text-[12px] text-[#8a8a8a]";
// "10.13 22:40" (KST)
const kst = (iso: string | null) => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const k = new Date(t + 9 * 3600e3).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
};
const msOf = (iso: string | null) => (iso ? new Date(iso).getTime() || 0 : 0);
// "18시간 40분" · "35분" — 분은 반올림
const dur = (sec: number) => {
  const m = Math.round((sec || 0) / 60);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h}시간 ${r}분` : `${h}시간`) : `${r}분`;
};
const pct = (v: number) => `${(v || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
const STOP_LABEL: Record<StopStatus, { l: string; tone: "bad" | "warn" | "neutral" }> = {
  active: { l: "XP 획득 중단", tone: "bad" },
  reserved: { l: "XP 획득 중단 예약", tone: "warn" },
  ended: { l: "중단 기간 끝남 · 해제 안 함", tone: "neutral" },
};
const nameCell = (r: { displayName: string; username: string }) => (
  <span className="inline-flex max-w-full items-baseline gap-1.5 min-w-0">
    <span className="font-bold truncate">{r.displayName}</span>
    {r.username && r.username !== r.displayName && <span className={`${META} truncate`}>@{r.username}</span>}
  </span>
);
// 모바일 줄 카드에서 값 앞에 붙는 이름(표 머리가 없다)
const ml = (l: string) => <span className={`md:hidden mr-1 ${META}`}>{l}</span>;
const sanctionChips = (r: Pick<SanctionRow, "voiceOff" | "xpStop">) => (
  <span className="inline-flex flex-wrap gap-1">
    {r.voiceOff && <StatusChip tone="bad">음성 XP 정지</StatusChip>}
    {r.xpStop && <StatusChip tone={STOP_LABEL[r.xpStop.status].tone}>{STOP_LABEL[r.xpStop.status].l}</StatusChip>}
  </span>
);

// 확인 창 — 해제(음성 XP 정지 · XP 획득 중단) · 이동 횟수 지우기. 열릴 때 정한 대상 그대로 보낸다
type Act = { kind: "voice" | "xpstop" | "reset"; userId: string; name: string; line: string };
const ACT_TITLE: Record<Act["kind"], { title: string; label: string }> = {
  voice: { title: "음성 XP 정지 해제", label: "해제" },
  xpstop: { title: "XP 획득 중단 해제", label: "해제" },
  reset: { title: "이동 횟수 지우기", label: "지우기" },
};

export default function AdminSanctionsPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { toast, toastEl } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const tab = tabOf(sp.get("tab"));
  const pq = sp.get("period");
  const sq = sp.get("sort");
  const period: Period = isPeriod(pq) ? pq : "7d";
  const sort: ActSort = isActSort(sq) ? sq : "score";
  // 이상 활동 기간 · 정렬 — 주소가 원본. 📌 history.replaceState 는 Next 라우터가 받아 useSearchParams 를 바로 바꾼다(서버 왕복 없음)
  const putActivity = (p: Period, s: ActSort) => window.history.replaceState(null, "", hrefOf("activity", p, s));

  const [data, setData] = useState<ListData | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null); // 상세 칸에 연 유저
  const [pane, setPane] = useState<PaneData | null>(null);
  const pickRef = useRef<string | null>(null);
  const [act, setAct] = useState<Act | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    return fetch("/api/admin/sanctions", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
        setData(d.data);
        setFailed(false);
      })
      .catch((e: unknown) => {
        setFailed(true);
        toast(e instanceof Error ? e.message : "불러오지 못했습니다.", true);
      });
  }, [toast]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  // 상세 칸 한 유저 — 늦게 온 다른 유저 응답은 버린다. 실패하면 목록 줄로 보이고 다시 시도 단추
  const loadPane = useCallback(async (userId: string) => {
    try {
      const r = await fetch(`/api/admin/sanctions?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (pickRef.current !== userId) return;
      if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
      setPane({ key: userId, user: d.data?.user || null, logs: Array.isArray(d.data?.logs) ? d.data.logs : [], failed: false });
    } catch {
      if (pickRef.current === userId) setPane({ key: userId, user: null, logs: [], failed: true });
    }
  }, []);
  const open = (userId: string) => {
    pickRef.current = userId;
    setPick(userId);
    void loadPane(userId);
  };
  const close = useCallback(() => {
    pickRef.current = null;
    setPick(null);
  }, []);

  // ── 이상 활동 — 탭을 열 때만 읽는다. 받은 결과는 어떤 보기의 것인지(key)와 함께 — 다른 보기를 읽는 동안 앞 결과를 흐리게 ──
  const actKey = `${period}:${sort}`;
  const [shown, setShown] = useState<{ key: string; data: ActData } | null>(null);
  const [actFailed, setActFailed] = useState("");
  const onActivity = tab === "activity";
  useEffect(() => {
    if (!isAdmin || !onActivity) return;
    let alive = true; // 빠르게 바꾸면 늦게 온 이전 응답을 버린다
    const k = `${period}:${sort}`;
    fetch(`/api/admin/activity?period=${period}&sort=${sort}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
        if (!alive) return;
        setShown({ key: k, data: d.data });
        setActFailed("");
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setActFailed(k);
        toast(e instanceof Error ? e.message : "불러오지 못했습니다.", true);
      });
    return () => { alive = false; };
  }, [isAdmin, onActivity, period, sort, toast]);
  const actData = shown?.data ?? null;
  const actLoading = shown?.key !== actKey && actFailed !== actKey;

  const hit = useCallback((r: { displayName: string; username?: string; userId: string }) => {
    const s = q.trim().toLowerCase();
    return !s || r.displayName.toLowerCase().includes(s) || (r.username || "").toLowerCase().includes(s) || r.userId.includes(s);
  }, [q]);
  const sanctioned = useMemo(() => (data?.sanctioned || []).filter(hit), [data, hit]);
  const moved = useMemo(() => (data?.moved || []).filter(hit), [data, hit]);
  const actRows = useMemo(() => (actData?.rows || []).filter(hit), [actData, hit]);

  // ── 확인 창 실행 — 해제는 유저 조회와 같은 API ──
  const runAct = async () => {
    const a = act;
    if (!a || busy) return;
    setBusy(true);
    try {
      const req =
        a.kind === "voice" ? { url: "/api/admin/users/voice-stop", body: { userId: a.userId, off: false } }
          : a.kind === "xpstop" ? { url: "/api/admin/users/xp-stop", body: { userId: a.userId, on: false } }
          : { url: "/api/admin/sanctions", body: { userId: a.userId, action: "resetAfk" } };
      const r = await fetch(req.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "처리하지 못했습니다.");
      setAct(null);
      toast(d.message || "처리했습니다.");
      // 이상 활동 표의 「정지」 칩은 그 자리에서(다음 읽기가 맞춘다)
      if (a.kind === "voice") {
        setShown((prev) => (prev ? { ...prev, data: { ...prev.data, rows: prev.data.rows.map((x) => (x.userId === a.userId ? { ...x, voiceOff: false } : x)) } } : prev));
      }
      await Promise.all([load(), pickRef.current === a.userId ? loadPane(a.userId) : null]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "처리하지 못했습니다.", true);
    } finally {
      setBusy(false);
    }
  };

  if (gate) return gate;

  const sanctionCols: Column<SanctionRow>[] = [
    { key: "user", label: "유저", mobile: "title", render: nameCell },
    { key: "kind", label: "제재", render: sanctionChips },
    {
      key: "period",
      label: "기간",
      render: (r) => (
        <span className="tabular-nums">
          {ml("기간")}
          {r.xpStop ? `${kst(r.xpStop.from)} ~ ${kst(r.xpStop.until)}` : r.voiceOff ? `${kst(r.voiceOff.at)} ~` : "—"}
        </span>
      ),
    },
    { key: "moves", label: "잠수 이동", align: "right", render: (r) => <span className="tabular-nums">{ml("잠수 이동")}{r.afkSanctionMoves}회<span className={`ml-1.5 ${META}`}>전체 {r.afkMoves}회</span></span> },
    { key: "wait", label: "다음 첫 확인", align: "right", render: (r) => <span className="font-black tabular-nums">{ml("다음 첫 확인")}{r.nextWaitMin}분</span> },
    { key: "last", label: "마지막 이동", align: "right", render: (r) => <span className="tabular-nums">{ml("마지막 이동")}{kst(r.afkMovedAt)}</span> },
  ];
  // 잠수 이동 — 열 머리로 정렬(마지막 이동 순으로 훑어보던 옛 「이동 기록」 탭 대신)
  const movedCols: Column<UserRow>[] = [
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="inline-flex max-w-full items-center gap-1.5 min-w-0">
          {nameCell(r)}
          {r.sanctioned && <StatusChip tone="bad" className="shrink-0">제재 중</StatusChip>}
        </span>
      ),
    },
    { key: "moves", label: "전체", align: "right", sortValue: (r) => r.afkMoves, render: (r) => <span className="font-black tabular-nums">{ml("전체")}{r.afkMoves}회</span> },
    { key: "smoves", label: "제재 중", align: "right", sortValue: (r) => r.afkSanctionMoves, render: (r) => <span className="tabular-nums">{ml("제재 중")}{r.afkSanctionMoves}회</span> },
    { key: "last", label: "마지막 이동", align: "right", sortValue: (r) => msOf(r.afkMovedAt) || null, render: (r) => <span className="tabular-nums">{ml("마지막 이동")}{kst(r.afkMovedAt)}</span> },
  ];
  // 이상 활동 — 서버가 고른 값이 큰 순으로 상위 100명을 준다. 열 머리 · (모바일) 정렬 단추는 그 값을 바꾼다(늘 큰 순, 같은 열을 다시 누르면 의심 순)
  const actSort: SortState = { key: sort, dir: "desc" };
  const onActSort = (s: SortState) => putActivity(period, s && isActSort(s.key) ? s.key : "score");
  const actCols: Column<ActRow>[] = [
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="inline-flex max-w-full items-baseline gap-1.5 min-w-0">
          <span className="font-bold truncate">{r.displayName}</span>
          {r.username && r.username !== r.displayName && <span className={`${META} tabular-nums truncate`}>@{r.username}</span>}
          {r.voiceOff && <StatusChip tone="bad" className="shrink-0 self-center">정지</StatusChip>}
        </span>
      ),
    },
    { key: "score", label: "의심", align: "right", sortValue: (r) => r.score, render: (r) => <span className="font-black tabular-nums">{ml("의심")}{r.score.toFixed(1)}</span> },
    {
      key: "voice",
      label: "음성",
      align: "right",
      sortValue: (r) => r.voiceSec,
      render: (r) => (
        <span className="tabular-nums">
          {ml("음성")}{dur(r.voiceSec)}
          <span className={`ml-1.5 ${META} tabular-nums`}>{r.voiceN.toLocaleString()}건</span>
        </span>
      ),
    },
    { key: "dayMax", label: "하루 최대", align: "right", sortValue: (r) => r.dayMaxSec, render: (r) => <span className="tabular-nums">{ml("하루 최대")}{dur(r.dayMaxSec)}</span> },
    { key: "streak", label: "최장 연속", sortLabel: "연속", align: "right", sortValue: (r) => r.streakSec, render: (r) => <span className="tabular-nums">{ml("연속")}{dur(r.streakSec)}</span> },
    {
      key: "alone",
      label: "혼자",
      align: "right",
      sortValue: (r) => r.aloneRate,
      render: (r) => (
        <span className="tabular-nums">
          {ml("혼자")}{pct(r.aloneRate)}
          <span className={`ml-1.5 ${META} tabular-nums`}>{dur(r.aloneSec)}</span>
        </span>
      ),
    },
    {
      key: "muted",
      label: "음소거",
      align: "right",
      sortValue: (r) => r.mutedRate,
      render: (r) => (
        <span className="tabular-nums">
          {ml("음소거")}{pct(r.mutedRate)}
          <span className={`ml-1.5 ${META} tabular-nums`}>{dur(r.mutedSec)}</span>
        </span>
      ),
    },
    {
      key: "deaf",
      label: "헤드셋",
      align: "right",
      sortValue: (r) => (r.exactN ? r.deafRate : null),
      render: (r) => (
        <span className="tabular-nums">
          {ml("헤드셋")}
          {r.exactN ? <>{pct(r.deafRate)}<span className={`ml-1.5 ${META} tabular-nums`}>{dur(r.deafSec)}</span></> : "—"}
        </span>
      ),
    },
    { key: "idle", label: "무활동", align: "right", sortValue: (r) => (r.exactN ? r.idleSec : null), render: (r) => <span className="tabular-nums">{ml("무활동")}{r.exactN ? (r.idleSec == null ? "모름" : dur(r.idleSec)) : "—"}</span> },
    { key: "live", label: "화면·캠", align: "right", sortValue: (r) => (r.exactN ? r.liveRate : null), render: (r) => <span className="tabular-nums">{ml("화면·캠")}{r.exactN ? pct(r.liveRate) : "—"}</span> },
    { key: "chat", label: "채팅", align: "right", sortValue: (r) => r.chatN, render: (r) => <span className="tabular-nums">{ml("채팅")}{r.chatN.toLocaleString()}</span> },
    { key: "xp", label: "음성 XP", align: "right", sortValue: (r) => r.voiceXp, render: (r) => <span className="tabular-nums">{ml("음성 XP")}{r.voiceXp.toLocaleString()}</span> },
  ];

  // ── 상세 칸 ──
  const pd = pane && pane.key === pick ? pane : null;
  // 읽기 전 · 실패 — 목록 줄로 먼저 그린다(깜빡이지 않게)
  const listSanction: SanctionRow | null = pick ? data?.sanctioned.find((r) => r.userId === pick) || null : null;
  const listRow: UserRow | null = listSanction || (pick ? data?.moved.find((r) => r.userId === pick) || null : null);
  const actRow = pick ? actData?.rows.find((r) => r.userId === pick) || null : null;
  // 다 읽었으면 그 값(제재가 없으면 칩 없음), 읽기 전이면 목록의 제재 줄
  const su: SanctionRow | null = pd && !pd.failed ? pd.user : listSanction;
  const base: UserRow | null = pd?.user || listRow || null;
  const paneName = base?.displayName || actRow?.displayName || pick || "";
  const paneUser = base?.username || actRow?.username || "";
  const rule = data?.rule;
  const actStats: { l: string; v: string; s?: string }[] = actRow
    ? [
        { l: "의심", v: actRow.score.toFixed(1) },
        { l: "음성", v: dur(actRow.voiceSec), s: `${actRow.voiceN.toLocaleString()}건` },
        { l: "하루 최대", v: dur(actRow.dayMaxSec) },
        { l: "최장 연속", v: dur(actRow.streakSec) },
        { l: "혼자", v: pct(actRow.aloneRate) },
        { l: "음소거", v: pct(actRow.mutedRate) },
        { l: "헤드셋", v: actRow.exactN ? pct(actRow.deafRate) : "—" },
        { l: "무활동", v: actRow.exactN ? (actRow.idleSec == null ? "모름" : dur(actRow.idleSec)) : "—" },
        { l: "화면·캠", v: actRow.exactN ? pct(actRow.liveRate) : "—" },
        { l: "채팅", v: actRow.chatN.toLocaleString() },
        { l: "음성 XP", v: actRow.voiceXp.toLocaleString() },
        { l: "기간", v: PERIODS.find((p) => p.v === (actData?.period || period))?.l || "" },
      ]
    : [];
  const ask = (kind: Act["kind"], line: string) => pick && setAct({ kind, userId: pick, name: paneName, line });
  // 상세 칸 줄 오른쪽 작은 단추
  const rowBtn = (label: string, onClick: () => void) => (
    <Btn variant="secondary" size="sm" className="shrink-0 -my-1" disabled={busy} onClick={onClick}>{label}</Btn>
  );

  return (
    <AdminPage
      section="운영"
      title="제재 · 잠수"
      tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={(id) => hrefOf(id as Tab, period, sort)} />}
    >
      {onActivity ? (
        <Toolbar right={actData?.approx ? <StatusChip>혼자 · 음소거 근사치</StatusChip> : null}>
          <Segmented options={PERIODS} value={period} onChange={(v) => putActivity(v as Period, sort)} />
          <SearchInput value={q} onChange={setQ} placeholder="이름 · 아이디" />
        </Toolbar>
      ) : (
        <Toolbar right={rule ? <StatusChip tone={rule.on ? "neutral" : "warn"}>{rule.on ? `제재 중 첫 확인 ${rule.baseMin}분 · 이동마다 −${rule.stepMin}분 · 최소 ${rule.floorMin}분` : "잠수 확인 꺼짐"}</StatusChip> : null}>
          <SearchInput value={q} onChange={setQ} placeholder="이름 · 아이디" />
        </Toolbar>
      )}

      {onActivity ? (
        actData ? (
          <div className={`transition-opacity ${actLoading ? "opacity-60" : ""}`} aria-busy={actLoading || undefined}>
            <DataTable columns={actCols} rows={actRows} rowKey={(r) => r.userId} onRowClick={(r) => open(r.userId)} selectedKey={pick}
              sortState={actSort} onSortChange={onActSort} empty="기록이 없습니다." />
          </div>
        ) : (
          <EmptyRow>{actLoading ? "불러오는 중…" : "불러오지 못했습니다."}</EmptyRow>
        )
      ) : !data ? (
        <EmptyRow>{failed ? "불러오지 못했습니다." : "불러오는 중…"}</EmptyRow>
      ) : tab === "sanctioned" ? (
        <DataTable columns={sanctionCols} rows={sanctioned} rowKey={(r) => r.userId} onRowClick={(r) => open(r.userId)} selectedKey={pick} empty="제재 중인 유저가 없습니다." />
      ) : (
        <DataTable columns={movedCols} rows={moved} rowKey={(r) => r.userId} onRowClick={(r) => open(r.userId)} selectedKey={pick} empty="잠수 채널로 옮겨진 유저가 없습니다." />
      )}

      <DetailPane
        open={!!pick}
        onClose={close}
        width={480}
        title={paneName}
        sub={<span className="tabular-nums">{paneUser ? `@${paneUser} · ${pick}` : pick}</span>}
        badge={su && (su.voiceOff || su.xpStop) ? sanctionChips(su) : undefined}
        footer={pick ? (
          <>
            <Btn variant="secondary" size="sm" onClick={() => router.push(`/admin/users?userId=${encodeURIComponent(pick)}`)}>유저 조회</Btn>
            <Btn variant="danger" size="sm" className="ml-auto" disabled={busy || !base || (!base.afkMoves && !base.afkSanctionMoves)}
              onClick={() => base && ask("reset", `전체 ${base.afkMoves}회 · 제재 중 ${base.afkSanctionMoves}회`)}>
              이동 횟수 지우기
            </Btn>
          </>
        ) : undefined}
      >
        {pick && (
          <>
            {pd?.failed && !base && (
              <div className="py-6 text-center">
                <p className="text-[13px] text-[#d01634]">불러오지 못했습니다.</p>
                <Btn variant="secondary" size="sm" className="mt-3" onClick={() => loadPane(pick)}>다시 시도</Btn>
              </div>
            )}
            {!pd && !base && !actRow && <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>}
            {(base || actRow) && (
              <dl>
                {/* 제재 — 줄마다 [해제](확인 한 번). 「중단 기간 끝남 · 해제 안 함」도 여기서 지운다 */}
                {su?.voiceOff && (
                  <DefRow k="음성 XP 정지">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 tabular-nums">{kst(su.voiceOff.at)} ~{su.voiceOff.by ? ` · ${su.voiceOff.by}` : ""}</span>
                      {rowBtn("해제", () => ask("voice", `정지 ${kst(su.voiceOff?.at || null)} ~`))}
                    </span>
                  </DefRow>
                )}
                {su?.xpStop && (
                  <DefRow k="XP 획득 중단">
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <StatusChip tone={STOP_LABEL[su.xpStop.status].tone} className="mb-1">{STOP_LABEL[su.xpStop.status].l}</StatusChip>
                        <span className="block tabular-nums">{kst(su.xpStop.from)} ~ {kst(su.xpStop.until)}{su.xpStop.by ? ` · ${su.xpStop.by}` : ""}</span>
                        {su.xpStop.reason && <span className={`block mt-1 font-normal ${META}`}>{su.xpStop.reason}</span>}
                      </span>
                      {rowBtn("해제", () => ask("xpstop", `${kst(su.xpStop?.from || null)} ~ ${kst(su.xpStop?.until || null)}`))}
                    </span>
                  </DefRow>
                )}
                {base && <DefRow k="잠수 이동"><span className="tabular-nums">전체 {base.afkMoves}회 · 제재 중 {base.afkSanctionMoves}회</span></DefRow>}
                {base && <DefRow k="마지막 이동"><span className="tabular-nums">{kst(base.afkMovedAt)}</span></DefRow>}
                {su && (su.voiceOff || su.xpStop) && <DefRow k="다음 첫 확인"><span className="tabular-nums">{su.nextWaitMin}분</span></DefRow>}
              </dl>
            )}
            {/* 이상 활동 — 그 탭에서 연 유저(지금 보기의 값) */}
            {actRow && (
              <>
                <p className="mt-5 mb-2 text-[12px] font-bold text-[#5a5a5a]">이상 활동</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#ededed] rounded-2xl border border-[#ededed] overflow-hidden">
                  {actStats.map((c) => (
                    <div key={c.l} className="px-3.5 py-2.5 bg-white min-w-0">
                      <p className="flex items-baseline gap-1.5 text-[12px] font-bold text-[#5a5a5a]">
                        {c.l}
                        {c.s && <span className="font-normal text-[#8a8a8a] tabular-nums">{c.s}</span>}
                      </p>
                      <p className="mt-0.5 text-[14px] font-black tabular-nums truncate">{c.v}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* 이동 기록 — 이 유저의 최근 50줄(옛 「이동 기록」 탭) */}
            <p className="mt-5 mb-2 text-[12px] font-bold text-[#5a5a5a]">이동 기록</p>
            {!pd ? (
              <p className={META}>불러오는 중…</p>
            ) : pd.logs.length ? (
              <ul>
                {pd.logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2 border-b border-[#ededed] last:border-b-0 text-[13px]">
                    <span className="w-[84px] shrink-0 tabular-nums text-[#5a5a5a]">{kst(l.at)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.channelName || "—"}</span>
                    {l.sanctioned && <StatusChip tone="bad" className="shrink-0">제재 중</StatusChip>}
                    <span className="shrink-0 w-12 text-right tabular-nums font-bold">{l.waitMin ? `${l.waitMin}분` : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={META}>{pd.failed ? "불러오지 못했습니다." : "기록이 없습니다."}</p>
            )}
          </>
        )}
      </DetailPane>

      <ConfirmDialog
        open={!!act}
        danger={act?.kind === "reset"}
        title={act ? ACT_TITLE[act.kind].title : ""}
        confirmLabel={act ? ACT_TITLE[act.kind].label : "확인"}
        busy={busy}
        onCancel={() => setAct(null)}
        onConfirm={runAct}
        body={act ? (
          <>
            <p className="font-bold text-[#131313] break-keep">{act.name}</p>
            <p className="mt-1 tabular-nums">{act.line}</p>
          </>
        ) : null}
      />
      {toastEl}
    </AdminPage>
  );
}
