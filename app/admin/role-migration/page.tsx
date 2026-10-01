"use client";

// 📌 역할 이전 — 지난 시즌 디스코드 역할을 사이트 인벤토리 아이템으로 옮긴다(app/api/admin/role-migration).
//    목록 틀: 머리 + 탭(역할 · 진행) → 검색 · 보기 한 줄 → 역할 표 → 줄을 누르면 오른쪽 상세 칸(이전 방식 고르기).
//    [미리보기](쓰기 없음) → 역할별 숫자 → [이전 실행] 확인 창 → 결과 · 진행(봇이 역할을 뗀 수 / 남은 수).
//    역할을 실제로 떼는 것은 봇 큐(processDetachments)다 — 이 화면 · API 는 디스코드 역할을 직접 바꾸지 않는다.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AdminPage, AdminTabs, Toolbar, SearchInput, Segmented, Btn, SwapLabel, DataTable, DetailPane, DefRow,
  StatusChip, StatRow, Panel, ConfirmDialog, EmptyRow, Switch, inputClass, labelClass, useAdminGuard, useNotice, type Column,
} from "../ui";
import { ITEM_TYPE_LABEL } from "@/lib/items";

type NewType = "item" | "cosmetic" | "perk";
type ItemRef = { id: string; name: string; type: string; visible?: boolean; linked?: boolean };
type Role = {
  id: string; name: string; color: string; position: number; holders: number;
  excluded: string; buff: boolean; item: ItemRef | null; live: number; migrated: number;
};
type ItemOpt = { id: string; name: string; type: string; roleId: string; color: string; visible: boolean };
type Data = { at: number; members: number; bots: number; botTop: number; roles: Role[]; items: ItemOpt[] };
type Choice = { mode: "new" | "existing"; type: NewType; name: string; itemId: string };
type PlanRow = {
  roleId: string; roleName: string; color: string; excluded: string; error: string; mode: string;
  item: { id: string; name: string; type: string } | null; keepRole: boolean;
  holders: number; insert: number; convert: number; skipped: number;
  inserted?: number; converted?: number; created?: boolean;
};
type Totals = {
  roles: number; excluded: number; createItems: number; people: number; records: number; convert: number;
  skipped: number; detach: number; keep: number; inserted?: number; converted?: number; created?: number;
};
type Failed = { roleId: string; roleName: string; userId: string; userName: string; reason: string };
type Result = { at: number; roles: PlanRow[]; totals: Totals; failed?: Failed[] };
type StatusRow = {
  roleId: string; name: string; color: string; gone: boolean; item: ItemRef | null;
  records: number; kept: number; waiting: number; retrying: number; detached: number; failed: number; holders: number | null;
};
type TabId = "roles" | "progress";
type View = "target" | "excluded" | "all";

const API = "/api/admin/role-migration";
const TABS: { id: TabId; short: string }[] = [
  { id: "roles", short: "역할" },
  { id: "progress", short: "진행" },
];
const EXCLUDE_LABEL: Record<string, string> = {
  everyone: "@everyone",
  managed: "연동 역할",
  protected: "보호 역할",
  level: "레벨 보상",
  system: "시스템 역할",
  staff: "운영 권한",
  above: "봇보다 위",
  missing: "서버에 없음",
  empty: "보유자 없음",
};
// 📌 기능 역할 이름 — 새 아이템 기본 유형을 권한(역할 유지)으로. 전체 선택에 섞여도 알림 · 권한 역할이 떨어지지 않게(바꿀 수 있다)
const FUNCTION_ROLE_RE = /^\s*\[(권한|알림)\]/;
// 📌 알림 구독 역할 — 전체 선택에서 뺀다(하나씩은 고를 수 있다). 지난 시즌 물건이 아니고, 유저가 스스로 끄고 켜는 역할이라
//    기록을 만들어 두면 구독을 끈 사람의 인벤토리에 '확인 필요'가 뜬다(my-items 이상 상태 판정)
const NOTICE_ROLE_RE = /^\s*\[알림\]/;
const NEW_TYPE_OPTIONS: { v: NewType; l: string }[] = [
  { v: "item", l: "아이템" },
  { v: "cosmetic", l: "꾸미기" },
  { v: "perk", l: "권한" },
];
const MODE_OPTIONS = [
  { v: "new", l: "새 아이템" },
  { v: "existing", l: "기존 아이템" },
];

const num = (v: unknown) => (Number(v) || 0).toLocaleString();
const msgOf = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;
const typeLabel = (t: string) => (ITEM_TYPE_LABEL as Record<string, string>)[t] || t;
const clock = (ms: number | null | undefined) =>
  ms ? new Date(ms).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—";

// 역할 색 점 — 색 없는 역할은 옅은 회색 테두리
function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${color ? "" : "border border-[#a3a3a3]"}`}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
}

function RoleName({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
      <Dot color={color} />
      <span className="truncate font-bold">{name || "—"}</span>
    </span>
  );
}

// 빈 칸 — PC 표에서만 "—", 모바일 줄 카드에서는 자리를 비운다(이름 없는 "—" 가 줄줄이 찍히지 않게)
const Empty = () => <span className="hidden md:inline text-[#a3a3a3]">—</span>;

// 숫자 칸 — 0 은 옅게
const N = ({ v, tone }: { v: number; tone?: "bad" }) => (
  <span className={`tabular-nums ${v ? (tone === "bad" ? "text-[#d01634] font-bold" : "") : "text-[#a3a3a3]"}`}>{num(v)}</span>
);

// 역할 처리 칩 — 떼기(봇 큐) · 유지(권한)
const RoleFate = ({ keep }: { keep: boolean }) => (keep ? <StatusChip tone="info">역할 유지</StatusChip> : <StatusChip>역할 떼기</StatusChip>);

const defaultChoice = (r: Role): Choice => {
  const type: NewType = FUNCTION_ROLE_RE.test(r.name) ? "perk" : "item";
  return r.item
    ? { mode: "existing", type, name: r.name.slice(0, 40), itemId: r.item.id }
    : { mode: "new", type, name: r.name.slice(0, 40), itemId: "" };
};
// 고를 수 있는 역할 — 제외가 아니고 지금 가진 사람이 있는 것(없으면 옮길 것도 없다)
const pickableRole = (r: Role) => !r.excluded && r.holders > 0;

export default function AdminRoleMigrationPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();
  const searchParams = useSearchParams();
  const tab: TabId = searchParams.get("tab") === "progress" ? "progress" : "roles";

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("target");
  const [sel, setSel] = useState<Record<string, true>>({});
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [openId, setOpenId] = useState<string | null>(null);

  // 미리보기는 그때의 계획(key)과 함께 둔다 — 계획이 바뀌면 낡은 숫자라 보이지 않는다
  const [previewState, setPreviewState] = useState<{ key: string; res: Result } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const [status, setStatus] = useState<{ at: number | null; roles: StatusRow[] } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const loadRoles = useCallback(async (refresh = false) => {
    setLoading(true);
    setLoadErr("");
    try {
      const r = await fetch(`${API}${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "불러오지 못했습니다.");
      setData(d.data);
    } catch (e) {
      setLoadErr(msgOf(e, "불러오지 못했습니다."));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const r = await fetch(`${API}?status=1`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "불러오지 못했습니다.");
      setStatus(d.data);
    } catch (e) {
      notify(msgOf(e, "진행 상황을 불러오지 못했습니다."), true);
    } finally {
      setStatusLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (isAdmin) loadRoles(false);
  }, [isAdmin, loadRoles]);
  useEffect(() => {
    if (isAdmin && tab === "progress" && !status) loadStatus();
  }, [isAdmin, tab, status, loadStatus]);

  const roles = useMemo(() => data?.roles || [], [data]);
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const itemById = useMemo(() => new Map((data?.items || []).map((i) => [i.id, i])), [data]);
  const choiceOf = useCallback((r: Role) => choices[r.id] || defaultChoice(r), [choices]);
  const setChoice = (r: Role, patch: Partial<Choice>) => setChoices((prev) => ({ ...prev, [r.id]: { ...(prev[r.id] || defaultChoice(r)), ...patch } }));
  const toggle = (id: string, on?: boolean) =>
    setSel((prev) => {
      const next = { ...prev };
      if (on ?? !next[id]) next[id] = true;
      else delete next[id];
      return next;
    });

  // 보낼 계획 — 고른 역할 중 제외 아닌 것. 기존 아이템을 골랐는데 아이템이 비면 '선택 필요'로 남긴다
  const chosen = roles.filter((r) => sel[r.id] && pickableRole(r));
  const incomplete = chosen.filter((r) => { const c = choiceOf(r); return c.mode === "existing" && !c.itemId; });
  const plan = chosen
    .filter((r) => !incomplete.includes(r))
    .map((r) => {
      const c = choiceOf(r);
      return c.mode === "existing"
        ? { roleId: r.id, itemId: c.itemId }
        : { roleId: r.id, create: { name: c.name.trim() || r.name.slice(0, 40), type: c.type, color: r.color } };
    });
  const planKey = JSON.stringify(plan);
  const preview = previewState && previewState.key === planKey ? previewState.res : null;
  const setPreview = (res: Result | null) => setPreviewState(res ? { key: planKey, res } : null);

  const runPreview = async () => {
    if (!plan.length) return;
    setPreviewing(true);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: true, plan }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "미리보기에 실패했습니다.");
      setPreview(d.data);
    } catch (e) {
      notify(msgOf(e, "미리보기에 실패했습니다."), true);
    } finally {
      setPreviewing(false);
    }
  };

  const runMigration = async () => {
    if (!plan.length) return;
    setRunning(true);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun: false, plan }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.success) throw new Error(d?.message || "이전에 실패했습니다.");
      const res: Result = d.data;
      setConfirmOpen(false);
      setResult(res);
      setPreview(null);
      setSel({});
      // 📌 고른 방식도 비운다 — 방금 만든 아이템이 연결돼 다음 목록에선 '기존 아이템'이 기본이 된다(옛 '새 아이템' 선택이 남지 않게)
      setChoices({});
      setOpenId(null);
      const t = res.totals;
      const errs = res.roles.filter((x) => x.error).length;
      notify(
        `이전했습니다.\n새 아이템 ${num(t.created)}개 · 기록 ${num(t.inserted)}건 · 사이트 보유 전환 ${num(t.converted)}건` +
          (res.failed?.length ? `\n저장 실패 ${num(res.failed.length)}건` : "") +
          (errs ? `\n처리 못 한 역할 ${errs}개` : ""),
        !!res.failed?.length || errs > 0
      );
      loadRoles(false);
      loadStatus();
      window.history.replaceState(null, "", "/admin/role-migration?tab=progress");
    } catch (e) {
      setConfirmOpen(false);
      notify(msgOf(e, "이전에 실패했습니다."), true);
    } finally {
      setRunning(false);
    }
  };

  if (gate) return gate;

  // ── 역할 표 ──
  const counts = {
    target: roles.filter((r) => !r.excluded).length,
    excluded: roles.filter((r) => !!r.excluded).length,
    all: roles.length,
  };
  const term = q.trim().toLowerCase();
  const visible = roles.filter((r) =>
    (view === "all" || (view === "target" ? !r.excluded : !!r.excluded)) && (!term || r.name.toLowerCase().includes(term))
  );
  const pickable = visible.filter(pickableRole);
  // 전체 선택이 켜는 범위 — 알림 구독 역할은 빼고. 끌 때는 보이는 것 전부를 끈다
  const bulk = pickable.filter((r) => !NOTICE_ROLE_RE.test(r.name));
  const allOn = bulk.length > 0 && bulk.every((r) => sel[r.id]);
  const toggleAll = () =>
    setSel((prev) => {
      const next = { ...prev };
      for (const r of allOn ? pickable : bulk) {
        if (allOn) delete next[r.id];
        else next[r.id] = true;
      }
      return next;
    });

  const planText = (r: Role) => {
    if (!sel[r.id] || !pickableRole(r)) return <Empty />;
    const c = choiceOf(r);
    if (c.mode === "existing") {
      const it = c.itemId ? itemById.get(c.itemId) : null;
      if (!it) return <span className="text-[#d01634] font-bold">아이템 선택</span>;
      return (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="truncate">{it.name}</span>
          <span className="text-[#8a8a8a]">{typeLabel(it.type)}</span>
          {it.type === "perk" && <StatusChip tone="info">역할 유지</StatusChip>}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <span className="text-[#8a8a8a]">새</span>
        <span className="truncate">{c.name.trim() || r.name}</span>
        <span className="text-[#8a8a8a]">{typeLabel(c.type)}</span>
        {c.type === "perk" && <StatusChip tone="info">역할 유지</StatusChip>}
      </span>
    );
  };

  const roleColumns: Column<Role>[] = [
    {
      key: "sel",
      label: <span className="sr-only">선택</span>,
      mobile: "title",
      className: "w-10",
      render: (r) => (
        <input
          type="checkbox"
          aria-label={`${r.name} 선택`}
          checked={!!sel[r.id]}
          disabled={!pickableRole(r)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggle(r.id)}
          className="w-4 h-4 align-middle accent-[#131313] disabled:opacity-30"
        />
      ),
    },
    { key: "name", label: "역할", mobile: "title", render: (r) => <RoleName name={r.name} color={r.color} /> },
    { key: "holders", label: "보유", align: "right", render: (r) => <span className="tabular-nums">{num(r.holders)}<span className="md:hidden">명</span></span> },
    {
      key: "item",
      label: "연결 아이템",
      render: (r) =>
        r.item ? (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="truncate">{r.item.name}</span>
            <span className="text-[#8a8a8a]">{typeLabel(r.item.type)}</span>
          </span>
        ) : (
          <Empty />
        ),
    },
    { key: "plan", label: "이전", render: planText },
    {
      key: "state",
      label: "상태",
      render: (r) =>
        r.excluded ? (
          <StatusChip>{EXCLUDE_LABEL[r.excluded] || "제외"}</StatusChip>
        ) : r.migrated > 0 ? (
          <StatusChip tone="ok">이전됨 {num(r.migrated)}</StatusChip>
        ) : (
          <Empty />
        ),
    },
  ];

  // ── 미리보기 · 결과 표 ──
  const planColumns = (done: boolean): Column<PlanRow>[] => [
    { key: "role", label: "역할", mobile: "title", render: (p) => <RoleName name={p.roleName} color={p.color} /> },
    {
      key: "item",
      label: "아이템",
      render: (p) =>
        p.excluded || p.error ? (
          <StatusChip tone="bad">{p.error || EXCLUDE_LABEL[p.excluded] || "제외"}</StatusChip>
        ) : p.item ? (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span className="text-[#8a8a8a]">{p.mode === "new" ? "새" : "기존"}</span>
            <span className="truncate">{p.item.name}</span>
            <span className="text-[#8a8a8a]">{typeLabel(p.item.type)}</span>
          </span>
        ) : null,
    },
    { key: "holders", label: "보유", align: "right", render: (p) => <span className="tabular-nums">{num(p.holders)}<span className="md:hidden">명</span></span> },
    {
      key: "insert",
      label: done ? "기록" : "새 기록",
      align: "right",
      render: (p) => <span><span className="md:hidden text-[#8a8a8a]">기록 </span><N v={done ? p.inserted || 0 : p.insert} /></span>,
    },
    {
      key: "convert",
      label: "전환",
      align: "right",
      render: (p) => <span><span className="md:hidden text-[#8a8a8a]">전환 </span><N v={done ? p.converted || 0 : p.convert} /></span>,
    },
    {
      key: "skipped",
      label: "건너뜀",
      align: "right",
      render: (p) => <span><span className="md:hidden text-[#8a8a8a]">건너뜀 </span><N v={p.skipped} /></span>,
    },
    { key: "fate", label: "디스코드 역할", render: (p) => (p.excluded || p.error ? null : <RoleFate keep={p.keepRole} />) },
  ];

  const statusColumns: Column<StatusRow>[] = [
    {
      key: "role",
      label: "역할",
      mobile: "title",
      render: (s) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <RoleName name={s.name} color={s.color} />
          {s.gone && <StatusChip className="shrink-0">삭제됨</StatusChip>}
        </span>
      ),
    },
    {
      key: "item",
      label: "아이템",
      render: (s) => (s.item ? <span className="inline-flex items-center gap-1.5"><span className="truncate">{s.item.name}</span><span className="text-[#8a8a8a]">{typeLabel(s.item.type)}</span></span> : <Empty />),
    },
    { key: "records", label: "기록", align: "right", render: (s) => <span><span className="md:hidden text-[#8a8a8a]">기록 </span><N v={s.records} /></span> },
    { key: "detached", label: "뗌", align: "right", render: (s) => <span><span className="md:hidden text-[#8a8a8a]">뗌 </span><N v={s.detached} /></span> },
    {
      key: "waiting",
      label: "남음",
      align: "right",
      render: (s) => (
        <span>
          <span className="md:hidden text-[#8a8a8a]">남음 </span>
          <N v={s.waiting} />
          {s.retrying > 0 && <span className="ml-1 text-[12px] text-[#d01634]">재시도 {num(s.retrying)}</span>}
        </span>
      ),
    },
    { key: "failed", label: "실패", align: "right", render: (s) => <span><span className="md:hidden text-[#8a8a8a]">실패 </span><N v={s.failed} tone="bad" /></span> },
    { key: "kept", label: "유지", align: "right", render: (s) => <span><span className="md:hidden text-[#8a8a8a]">유지 </span><N v={s.kept} /></span> },
    {
      key: "holders",
      label: "디스코드 보유",
      align: "right",
      render: (s) => <span><span className="md:hidden text-[#8a8a8a]">디스코드 보유 </span>{s.holders == null ? <span className="text-[#a3a3a3]">—</span> : <N v={s.holders} />}</span>,
    },
  ];

  // ── 상세 칸 ──
  const open = openId ? roleById.get(openId) || null : null;
  const openChoice = open ? choiceOf(open) : null;
  const itemOptions = (data?.items || []).filter((i) => !i.roleId || (open && i.roleId === open.id));

  const t = preview?.totals;
  // 📌 인원(명)은 '대상 인원' 하나 — 나머지는 역할 × 사람 건수(한 사람이 역할 둘이면 2건)라 '건'으로 적는다
  const statItems = (x: Totals, done: boolean) => [
    { label: "새 아이템", value: num(done ? x.created : x.createItems) },
    { label: "대상 인원", value: num(x.people), sub: `건너뜀 ${num(x.skipped)}건` },
    { label: done ? "기록" : "새 기록", value: num(done ? x.inserted : x.records), sub: `사이트 보유 전환 ${num(done ? x.converted : x.convert)}건` },
    { label: "역할 떼기", value: num(x.detach), sub: `역할 유지 ${num(x.keep)}건` },
  ];

  return (
    <AdminPage
      section="ARCTIC"
      // 📌 제목 · 동작은 탭과 무관하게 고정 — 탭 줄이 움직이지 않게(메모: tabs-never-move)
      title="역할 이전"
      actions={
        <Btn variant="secondary" size="sm" className="w-[84px]" disabled={loading || statusLoading} onClick={() => (tab === "progress" ? loadStatus() : loadRoles(true))}>
          <SwapLabel swap={loading || statusLoading} to="읽는 중…">새로고침</SwapLabel>
        </Btn>
      }
      tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={(id) => (id === "roles" ? "/admin/role-migration" : `/admin/role-migration?tab=${id}`)} />}
    >
      {/* ═══ 역할 ═══ */}
      {tab === "roles" && (
        <>
          {loadErr && !data ? (
            <div className="py-12 text-center">
              <p className="text-[13px] text-[#d01634]">{loadErr}</p>
              <Btn variant="secondary" size="sm" className="mt-3" onClick={() => loadRoles(false)}>다시 시도</Btn>
            </div>
          ) : !data ? (
            <p className="py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
          ) : (
            <>
              <Toolbar
                right={
                  <>
                    <span className="text-[12px] text-[#5a5a5a] tabular-nums">선택 {num(chosen.length)}</span>
                    <Btn size="sm" className="w-[84px]" disabled={!plan.length || incomplete.length > 0 || previewing || running} onClick={runPreview}>
                      <SwapLabel swap={previewing} to="계산 중…">미리보기</SwapLabel>
                    </Btn>
                  </>
                }
              >
                {/* 📌 검색은 모바일에서 한 줄 통째로(기본 w-full) — 좁은 줄에 끼우면 입력칸이 글자 두 개 폭으로 눌렸다 */}
                <SearchInput value={q} onChange={setQ} placeholder="역할 이름" />
                <label className="inline-flex items-center gap-2 h-10 pr-1 text-[13px] font-bold text-[#131313] cursor-pointer select-none">
                  <input type="checkbox" checked={allOn} disabled={!bulk.length} onChange={toggleAll} className="w-4 h-4 accent-[#131313] disabled:opacity-30" />
                  전체 선택
                </label>
                <Segmented
                  options={[
                    { v: "target", l: "대상", n: counts.target },
                    { v: "excluded", l: "제외", n: counts.excluded },
                    { v: "all", l: "전체", n: counts.all },
                  ]}
                  value={view}
                  onChange={(v) => setView(v as View)}
                />
                <span className="text-[12px] text-[#8a8a8a] tabular-nums">기준 {clock(data.at)} · 멤버 {num(data.members)}</span>
              </Toolbar>

              {preview && t && (
                <Panel
                  className="mb-4"
                  title="미리보기"
                  desc={`기준 ${clock(preview.at)}`}
                  right={
                    <>
                      <Btn variant="ghost" size="sm" onClick={() => setPreview(null)}>닫기</Btn>
                      <Btn size="sm" disabled={running || t.roles === 0 || (t.records === 0 && t.convert === 0 && t.createItems === 0)} onClick={() => setConfirmOpen(true)}>이전 실행</Btn>
                    </>
                  }
                >
                  <StatRow items={statItems(t, false)} />
                  <DataTable className="mt-4" columns={planColumns(false)} rows={preview.roles} rowKey={(p) => p.roleId} />
                </Panel>
              )}

              <DataTable
                columns={roleColumns}
                rows={visible}
                rowKey={(r) => r.id}
                onRowClick={(r) => setOpenId(r.id)}
                selectedKey={openId}
                empty={term ? "검색 결과가 없습니다." : "역할이 없습니다."}
              />
            </>
          )}
        </>
      )}

      {/* ═══ 진행 ═══ */}
      {tab === "progress" && (
        <>
          {result && (
            <Panel className="mb-4" title="방금 실행" desc={`기준 ${clock(result.at)}`} right={<Btn variant="ghost" size="sm" onClick={() => setResult(null)}>닫기</Btn>}>
              <StatRow items={statItems(result.totals, true)} />
              <DataTable className="mt-4" columns={planColumns(true)} rows={result.roles} rowKey={(p) => p.roleId} />
              {!!result.failed?.length && (
                <div className="mt-4">
                  <p className="text-[13px] font-black text-[#d01634]">저장 실패 {num(result.failed.length)}건</p>
                  <ul className="mt-1 divide-y divide-[#ededed] max-h-64 overflow-y-auto">
                    {result.failed.map((f) => (
                      <li key={`${f.roleId}:${f.userId}`} className="py-2 flex items-center gap-3 text-[13px]">
                        <span className="min-w-0 flex-1 truncate font-bold">{f.userName || f.userId}</span>
                        <span className="shrink-0 text-[12px] text-[#8a8a8a] tabular-nums">{f.userId}</span>
                        <span className="shrink-0 truncate max-w-[40%] text-[12px] text-[#5a5a5a]">{f.roleName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}

          {!!status?.roles.length && (
            <Toolbar>
              <span className="text-[12px] text-[#8a8a8a] tabular-nums">기준 {clock(status.at)}</span>
            </Toolbar>
          )}
          {!status ? (
            <p className="py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
          ) : status.roles.length === 0 ? (
            <EmptyRow>이전한 역할이 없습니다.</EmptyRow>
          ) : (
            <DataTable columns={statusColumns} rows={status.roles} rowKey={(s) => s.roleId} />
          )}
        </>
      )}

      {/* ── 역할 상세 — 이전 방식 고르기 ── */}
      <DetailPane
        open={!!open}
        onClose={() => setOpenId(null)}
        width={440}
        badge={
          open ? (
            open.excluded ? <StatusChip>{EXCLUDE_LABEL[open.excluded] || "제외"}</StatusChip>
              : open.migrated > 0 ? <StatusChip tone="ok">이전됨 {num(open.migrated)}</StatusChip>
              : undefined
          ) : undefined
        }
        title={open ? <RoleName name={open.name} color={open.color} /> : ""}
        sub={open ? <span className="tabular-nums">보유 {num(open.holders)}명 · 기존 기록 {num(open.live)}건</span> : undefined}
      >
        {open && openChoice && (
          <>
            {!open.excluded && (
              <>
                <div className="flex items-center justify-between py-1 mb-4">
                  <span className="text-[14px] font-bold">이전 대상</span>
                  <Switch on={!!sel[open.id]} disabled={!pickableRole(open)} onChange={(v) => toggle(open.id, v)} label="이전 대상" />
                </div>

                <p className={labelClass}>아이템</p>
                <Segmented
                  className="mb-4"
                  options={MODE_OPTIONS}
                  value={openChoice.mode}
                  disabledValues={open.item ? ["new"] : []}
                  onChange={(v) => {
                    if (v === "new" && open.item) return; // 이미 연결된 아이템이 있으면 새로 만들지 않는다(서버도 같은 아이템을 쓴다)
                    setChoice(open, { mode: v as Choice["mode"] });
                  }}
                />

                {openChoice.mode === "new" ? (
                  <>
                    <label className={labelClass} htmlFor="rm-name">이름</label>
                    <input
                      id="rm-name"
                      className={`${inputClass} mb-4 text-base md:text-[14px]`}
                      maxLength={40}
                      value={openChoice.name}
                      placeholder={open.name}
                      onChange={(e) => setChoice(open, { name: e.target.value })}
                    />
                    <p className={labelClass}>유형</p>
                    <Segmented
                      className="mb-4"
                      options={NEW_TYPE_OPTIONS}
                      value={openChoice.type}
                      onChange={(v) => setChoice(open, { type: v as NewType })}
                    />
                  </>
                ) : (
                  <>
                    <label className={labelClass} htmlFor="rm-item">기존 아이템</label>
                    <select
                      id="rm-item"
                      className={`${inputClass} mb-4 text-base md:text-[14px]`}
                      value={openChoice.itemId}
                      onChange={(e) => setChoice(open, { itemId: e.target.value })}
                    >
                      <option value="">선택</option>
                      {itemOptions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {typeLabel(i.type)}{i.visible ? "" : " (숨김)"}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                <dl className="mt-2">
                  <DefRow k="디스코드 역할">
                    {(() => {
                      const ty = openChoice.mode === "existing" ? itemById.get(openChoice.itemId)?.type : openChoice.type;
                      return ty ? <RoleFate keep={ty === "perk"} /> : <span className="text-[#a3a3a3]">—</span>;
                    })()}
                  </DefRow>
                  {openChoice.mode === "new" && (
                    <DefRow k="색">
                      <span className="inline-flex items-center gap-2 tabular-nums"><Dot color={open.color} />{open.color || "유형 기본색"}</span>
                    </DefRow>
                  )}
                  <DefRow k="연결 아이템">{open.item ? `${open.item.name} · ${typeLabel(open.item.type)}` : "—"}</DefRow>
                  {open.buff && <DefRow k="역할 버프"><StatusChip tone="warn">있음</StatusChip></DefRow>}
                </dl>
              </>
            )}
            {open.excluded && (
              <dl>
                <DefRow k="제외">{EXCLUDE_LABEL[open.excluded] || open.excluded}</DefRow>
                <DefRow k="연결 아이템">{open.item ? `${open.item.name} · ${typeLabel(open.item.type)}` : "—"}</DefRow>
              </dl>
            )}
          </>
        )}
      </DetailPane>

      <ConfirmDialog
        open={confirmOpen && !!t}
        title="이전 실행"
        busy={running}
        confirmLabel="이전 실행"
        body={
          t ? (
            <div className="tabular-nums">
              <p>역할 {num(t.roles)}개 · 새 아이템 {num(t.createItems)}개 · 대상 {num(t.people)}명</p>
              <p>새 기록 {num(t.records)}건 · 사이트 보유 전환 {num(t.convert)}건</p>
              <p>역할 떼기 {num(t.detach)}건 · 역할 유지 {num(t.keep)}건</p>
            </div>
          ) : undefined
        }
        onConfirm={runMigration}
        onCancel={() => setConfirmOpen(false)}
      />
      {noticeEl}
    </AdminPage>
  );
}
