"use client";

// 📌 제재 · 잠수 기록 — 2026-10-13 운영자 "제재 먹은 유저나 내보내진 유저 볼 수 있게 기록창" (app/api/admin/sanctions)
//    탭 셋: 제재 중(음성 XP 정지 · XP 획득 중단 — 봇 잠수 확인이 30분부터 당기는 사람) · 잠수 이동(잠수 채널로 옮겨진 적 있는 유저) · 이동 기록(한 번씩).
//    줄을 누르면 오른쪽(폰은 아래) 상세 칸 — 유저 조회로 가기 · 이동 횟수 지우기(한 번에, 기록은 남는다).
//    제재 중 첫 확인 = 기본(레벨 설정 afkCheckSanctionMin) − 제재 중 이동 횟수 × 5분, 10분이 바닥(lib/afkCheck.js · 봇 afkCheck.js 같은 식)
//    주소 ?tab= 로 탭을 연다(새로고침해도 같은 탭)

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AdminPage, Toolbar, Segmented, SearchInput, DataTable, StatusChip, EmptyRow, DetailPane, DefRow, Btn,
  useAdminGuard, useNotice, useToast, type Column,
} from "../ui";

type XpStop = { from: string | null; until: string | null; by: string; reason: string; status: "active" | "reserved" | "ended" };
type UserRow = { userId: string; displayName: string; username: string; afkMoves: number; afkSanctionMoves: number; afkMovedAt: string | null; sanctioned: boolean };
type SanctionRow = UserRow & { voiceOff: { at: string | null; by: string } | null; xpStop: XpStop | null; nextWaitMin: number };
type LogRow = { id: string; userId: string; displayName: string; channelName: string; sanctioned: boolean; waitMin: number; moves: number; sanctionMoves: number; nextWaitMin: number; at: string | null };
type Data = {
  rule: { on: boolean; baseMin: number; firstMin: number; replyMin: number; stepMin: number; floorMin: number };
  sanctioned: SanctionRow[];
  moved: UserRow[];
  logs: LogRow[];
};
type Tab = "sanctioned" | "moved" | "logs";
const isTab = (v: string | null): v is Tab => v === "sanctioned" || v === "moved" || v === "logs";

const META = "text-[12px] text-[#8a8a8a]";
// "10.13 22:40" (KST)
const kst = (iso: string | null) => {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const k = new Date(t + 9 * 3600e3).toISOString();
  return `${k.slice(5, 7)}.${k.slice(8, 10)} ${k.slice(11, 16)}`;
};
const STOP_LABEL: Record<XpStop["status"], { l: string; tone: "bad" | "warn" | "neutral" }> = {
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

export default function AdminSanctionsPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();
  const { toast, toastEl } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const tq = sp.get("tab");
  const tab: Tab = isTab(tq) ? tq : "sanctioned";
  const setTab = (t: Tab) => window.history.replaceState(null, "", t === "sanctioned" ? "/admin/sanctions" : `/admin/sanctions?tab=${t}`);

  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<string | null>(null); // 상세 칸에 연 유저
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
        notify(e instanceof Error ? e.message : "불러오지 못했습니다.", true);
      });
  }, [notify]);
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const hit = useCallback((r: { displayName: string; username?: string; userId: string }) => {
    const s = q.trim().toLowerCase();
    return !s || r.displayName.toLowerCase().includes(s) || (r.username || "").toLowerCase().includes(s) || r.userId.includes(s);
  }, [q]);
  const sanctioned = useMemo(() => (data?.sanctioned || []).filter(hit), [data, hit]);
  const moved = useMemo(() => (data?.moved || []).filter(hit), [data, hit]);
  const logs = useMemo(() => (data?.logs || []).filter(hit), [data, hit]);

  // 상세 칸 — 고른 유저를 세 목록에서 모은다
  const detail = useMemo(() => {
    if (!pick || !data) return null;
    const s = data.sanctioned.find((r) => r.userId === pick) || null;
    const m = data.moved.find((r) => r.userId === pick) || null;
    const l = data.logs.filter((r) => r.userId === pick);
    const base: UserRow | null = s || m || (l[0] ? { userId: pick, displayName: l[0].displayName, username: "", afkMoves: l[0].moves, afkSanctionMoves: l[0].sanctionMoves, afkMovedAt: l[0].at, sanctioned: l[0].sanctioned } : null);
    return base ? { base, s, logs: l } : null;
  }, [pick, data]);

  const resetMoves = async (userId: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sanctions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "resetAfk" }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "처리하지 못했습니다.");
      toast(d.message || "이동 횟수를 지웠습니다.");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "처리하지 못했습니다.", true);
    } finally {
      setBusy(false);
    }
  };

  if (gate) return gate;

  const sanctionChips = (r: SanctionRow) => (
    <span className="inline-flex flex-wrap gap-1">
      {r.voiceOff && <StatusChip tone="bad">음성 XP 정지</StatusChip>}
      {r.xpStop && <StatusChip tone={STOP_LABEL[r.xpStop.status].tone}>{STOP_LABEL[r.xpStop.status].l}</StatusChip>}
    </span>
  );
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
    { key: "moves", label: "전체", align: "right", render: (r) => <span className="font-black tabular-nums">{ml("전체")}{r.afkMoves}회</span> },
    { key: "smoves", label: "제재 중", align: "right", render: (r) => <span className="tabular-nums">{ml("제재 중")}{r.afkSanctionMoves}회</span> },
    { key: "last", label: "마지막 이동", align: "right", render: (r) => <span className="tabular-nums">{ml("마지막 이동")}{kst(r.afkMovedAt)}</span> },
  ];
  const logCols: Column<LogRow>[] = [
    { key: "at", label: "시각", render: (r) => <span className="tabular-nums">{kst(r.at)}</span> },
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="inline-flex max-w-full items-center gap-1.5 min-w-0">
          <span className="font-bold truncate">{r.displayName}</span>
          {r.sanctioned && <StatusChip tone="bad" className="shrink-0">제재 중</StatusChip>}
        </span>
      ),
    },
    { key: "ch", label: "채널", render: (r) => <span className="truncate">{ml("채널")}{r.channelName || "—"}</span> },
    { key: "wait", label: "확인까지", align: "right", render: (r) => <span className="tabular-nums">{ml("확인까지")}{r.waitMin ? `${r.waitMin}분` : "—"}</span> },
    { key: "moves", label: "누적", align: "right", render: (r) => <span className="tabular-nums">{ml("누적")}{r.moves}회{r.sanctioned && <span className={`ml-1.5 ${META}`}>제재 중 {r.sanctionMoves}회</span>}</span> },
  ];

  const open = (userId: string) => setPick(userId);
  const tabs = [
    { v: "sanctioned", l: "제재 중", n: data?.sanctioned.length ?? 0 },
    { v: "moved", l: "잠수 이동", n: data?.moved.length ?? 0 },
    { v: "logs", l: "이동 기록", n: data?.logs.length ?? 0 },
  ];
  const rule = data?.rule;

  return (
    <AdminPage section="SYSTEM : LEVEL" title="제재 · 잠수 기록">
      <Toolbar right={rule ? <StatusChip tone={rule.on ? "neutral" : "warn"}>{rule.on ? `제재 중 첫 확인 ${rule.baseMin}분 · 이동마다 −${rule.stepMin}분 · 최소 ${rule.floorMin}분` : "잠수 확인 꺼짐"}</StatusChip> : null}>
        <Segmented options={tabs} value={tab} onChange={(v) => setTab(v as Tab)} />
        <SearchInput value={q} onChange={setQ} placeholder="이름 · 아이디" />
      </Toolbar>

      {!data ? (
        <EmptyRow>{failed ? "불러오지 못했습니다." : "불러오는 중…"}</EmptyRow>
      ) : tab === "sanctioned" ? (
        <DataTable columns={sanctionCols} rows={sanctioned} rowKey={(r) => r.userId} onRowClick={(r) => open(r.userId)} selectedKey={pick} empty="제재 중인 유저가 없습니다." />
      ) : tab === "moved" ? (
        <DataTable columns={movedCols} rows={moved} rowKey={(r) => r.userId} onRowClick={(r) => open(r.userId)} selectedKey={pick} empty="잠수 채널로 옮겨진 유저가 없습니다." />
      ) : (
        <DataTable columns={logCols} rows={logs} rowKey={(r) => r.id} onRowClick={(r) => open(r.userId)} empty="이동 기록이 없습니다." />
      )}

      <DetailPane
        open={!!detail}
        onClose={() => setPick(null)}
        title={detail?.base.displayName || ""}
        sub={detail ? (detail.base.username ? `@${detail.base.username} · ${detail.base.userId}` : detail.base.userId) : undefined}
        badge={detail?.s ? sanctionChips(detail.s) : undefined}
        footer={detail ? (
          <>
            <Btn variant="secondary" size="sm" onClick={() => router.push(`/admin/users?userId=${encodeURIComponent(detail.base.userId)}`)}>유저 조회</Btn>
            <Btn variant="danger" size="sm" className="ml-auto" disabled={busy || (!detail.base.afkMoves && !detail.base.afkSanctionMoves)} onClick={() => resetMoves(detail.base.userId)}>이동 횟수 지우기</Btn>
          </>
        ) : undefined}
      >
        {detail && (
          <>
            <dl>
              {detail.s?.voiceOff && <DefRow k="음성 XP 정지">{kst(detail.s.voiceOff.at)} ~{detail.s.voiceOff.by ? ` · ${detail.s.voiceOff.by}` : ""}</DefRow>}
              {detail.s?.xpStop && (
                <DefRow k="XP 획득 중단">
                  {kst(detail.s.xpStop.from)} ~ {kst(detail.s.xpStop.until)}
                  {detail.s.xpStop.by ? ` · ${detail.s.xpStop.by}` : ""}
                  {detail.s.xpStop.reason && <span className={`block mt-1 font-normal ${META}`}>{detail.s.xpStop.reason}</span>}
                </DefRow>
              )}
              <DefRow k="잠수 이동">전체 {detail.base.afkMoves}회 · 제재 중 {detail.base.afkSanctionMoves}회</DefRow>
              <DefRow k="마지막 이동">{kst(detail.base.afkMovedAt)}</DefRow>
              {detail.s && <DefRow k="다음 첫 확인">{detail.s.nextWaitMin}분</DefRow>}
            </dl>
            <p className="mt-5 mb-2 text-[12px] font-bold text-[#5a5a5a]">이동 기록</p>
            {detail.logs.length ? (
              <ul>
                {detail.logs.slice(0, 50).map((l) => (
                  <li key={l.id} className="flex items-center gap-3 py-2 border-b border-[#ededed] last:border-b-0 text-[13px]">
                    <span className="w-[84px] shrink-0 tabular-nums text-[#5a5a5a]">{kst(l.at)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.channelName || "—"}</span>
                    {l.sanctioned && <StatusChip tone="bad" className="shrink-0">제재 중</StatusChip>}
                    <span className="shrink-0 tabular-nums font-bold">{l.waitMin ? `${l.waitMin}분` : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={META}>기록이 없습니다.</p>
            )}
          </>
        )}
      </DetailPane>
      {noticeEl}
      {toastEl}
    </AdminPage>
  );
}
