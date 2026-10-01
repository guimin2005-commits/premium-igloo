"use client";

// 📌 유저 조회 — 이름 · 디스코드 ID 로 찾아 한 유저의 지갑 · 구매 · 지급 · 쿠폰 · 알림 · 문의 · XP 내역을 한 자리에서 본다.
//    목록 화면 틀: 머리 → 검색 한 줄 → 결과 표 → 줄을 누르면 오른쪽 상세 칸(모바일은 아래에서 올라오는 판).
//    조회 전용 — 쓰기는 구매 탭의 1회 소모권 "1개 사용"(app/api/admin/users/consume) 하나. 주소에 ?q= · ?userId= 를 실어 새로고침해도 같은 화면이 다시 열린다.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage, SearchInput, Segmented, Btn, SwapLabel, DataTable, DetailPane, StatusChip, EmptyRow, ConfirmDialog, useAdminGuard, useNotice, type Column } from "../ui";
import { getTier } from "@/lib/voiceTiers";

type Row = { userId: string; username: string; displayName: string; xp: number; level: number; point: number; noXp?: boolean };
type Pass = {
  season: number; current: boolean; unlocked: boolean; seasonXp: number | null; claimed: number;
  premiumBy?: "purchase" | "booster" | null; boosterUnknown?: boolean;
};
type UserSum = {
  userId: string; username: string; displayName: string;
  xp: number; level: number; point: number;
  chatEnhance: number; voiceEnhance: number;
  attendCount: number; attendStreak: number; attendBestStreak: number; lastAttendDate: string;
  voiceSeconds: number; needsRoleSync: boolean; updatedAt: string | null;
  pass: Pass;
};
// ×N 묶음(1회 소모권 · 소모품) — thing: 묶음 키, pending: 그중 지급 대기
type Stack = { thing: string; name: string; count: number; pending: number };
type Detail = {
  names: string[];
  stacks?: Stack[];
  user: UserSum | null;
  purchases: any[]; payouts: any[]; coupons: any[];
  notifications: any[]; inquiries: any[]; applies: any[];
  seasons: { season: number; name: string; rank: number; xp: number; level: number }[];
};
type TabId = "purchase" | "payout" | "coupon" | "inbox" | "xp" | "role";
type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "ink";

const LIST_LIMIT = 50; // API 가 목록마다 최근 50건까지 준다
const TABS: { id: TabId; l: string }[] = [
  { id: "purchase", l: "구매" },
  { id: "payout", l: "지급" },
  { id: "coupon", l: "쿠폰" },
  { id: "inbox", l: "알림·문의" },
  { id: "xp", l: "XP 내역" },
  { id: "role", l: "역할" },
];
// 📌 역할 탭 — 디스코드에서 지금 가진 역할(app/api/admin/users/roles). 레벨 보상 · 디스코드 관리 역할은 뗄 수 없다
type HeldRole = { id: string; name: string; color: string; managed: boolean; rewardLevel: number | null; item: string };
type RoleState = { key: string; loading: boolean; present: boolean; roles: HeldRole[]; error: string };

const PURCHASE_STATUS: Record<string, { l: string; t: Tone }> = {
  pending: { l: "대기", t: "warn" },
  completed: { l: "완료", t: "ok" },
  expired: { l: "만료", t: "neutral" },
  cancelled: { l: "취소", t: "neutral" },
  refunded: { l: "환불", t: "bad" },
};
const PAYOUT_STATUS: Record<string, { l: string; t: Tone }> = {
  pending: { l: "대기", t: "warn" },
  processing: { l: "처리 중", t: "info" },
  paid: { l: "완료", t: "ok" },
  failed: { l: "실패", t: "bad" },
};
const PAYOUT_SOURCE: Record<string, string> = {
  referral: "초대", code: "코드", manual: "수동 지급", pass: "시즌 패스", quest: "퀘스트", shop: "상점",
  supporter: "서포터즈", level: "레벨", item: "아이템", admin: "운영진", etc: "기타", "role-refund": "역할 환불",
};
const ITEM_TYPE: Record<string, string> = { role: "역할", perk: "혜택", item: "아이템", cosmetic: "꾸미기", physical: "실물" };
const NOTI_TONE: Record<string, Tone> = { 경고: "bad", 제재: "warn", 안내: "info", 축하: "ok", 일반: "neutral" };

const num = (v: any) => (Number(v) || 0).toLocaleString();
// 표 안 일시는 짧게(KST) — 26. 09. 27. 14:05
const fmt = (d: any) =>
  d ? new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
const cur = (c: string) => (c === "point" ? "빙옥" : "XP");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString()}`;
const joinMeta = (parts: any[]) => parts.filter(Boolean).join(" · ");

// 숫자 뒤 단위는 옅게 — 표 머리에 이미 이름이 있어 단위가 눈에 걸리지 않게
const Unit = ({ children }: { children: React.ReactNode }) => <span className="ml-0.5 text-[11px] font-normal text-[#a3a3a3]">{children}</span>;

function LevelText({ level }: { level: number }) {
  const t = getTier(level);
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.c }} />
      Lv.{level}
    </span>
  );
}

// 상세 칸 목록 한 줄 — 제목(+칩) · 메타 한 줄 · 오른쪽 값
function Line({ title, chips, meta, right, rightCls = "", error }: { title: React.ReactNode; chips?: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode; rightCls?: string; error?: string }) {
  return (
    <li className="py-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="min-w-0 truncate text-[14px] font-bold">{title}</span>
          {chips}
        </div>
        {meta && <p className="mt-1 text-[12px] text-[#8a8a8a] tabular-nums truncate">{meta}</p>}
        {error && <p className="mt-1 text-[12px] text-[#d01634] break-keep line-clamp-2">{error}</p>}
      </div>
      {right != null && <span className={`shrink-0 pt-px text-[14px] font-black tabular-nums whitespace-nowrap ${rightCls}`}>{right}</span>}
    </li>
  );
}

// compact: 한 탭 안에 묶음이 여럿일 때(알림·문의) — 빈 묶음을 큰 점선 칸 대신 한 줄로
function List({ items, empty = "없음", capped = true, compact = false, children }: { items: any[]; empty?: string; capped?: boolean; compact?: boolean; children: React.ReactNode }) {
  if (items.length === 0) return compact ? <p className="py-2.5 text-[13px] text-[#a3a3a3]">{empty}</p> : <EmptyRow>{empty}</EmptyRow>;
  return (
    <>
      <ul className="divide-y divide-[#ededed]">{children}</ul>
      {capped && items.length >= LIST_LIMIT && <p className="pt-2 text-[12px] text-[#8a8a8a]">최근 {LIST_LIMIT}건</p>}
    </>
  );
}

// 알림·문의 탭 안의 작은 묶음 머리
const SubHead = ({ label, n }: { label: string; n: number }) => (
  <h3 className="flex items-center gap-1.5 pt-5 first:pt-0 pb-1 text-[12px] font-black text-[#5a5a5a]">
    {label}
    <span className="font-bold text-[#a3a3a3] tabular-nums">{n}</span>
  </h3>
);

// 📌 XP 내역 — 원장 /api/xp/ledger?userId=&currency=xp|point&before= → data: { items: [{ at, currency, amount, label, kind, count? }], hasMore, nextBefore }
type LedgerCur = "xp" | "point";
type Ledger = { key: string; items: any[]; loading: boolean; more: string | null };
const LEDGER_CUR = [{ v: "xp", l: "XP" }, { v: "point", l: "빙옥" }];

// 주소 맞추기 — 새로고침해도 같은 검색 · 같은 유저가 열리게 (쿼리만 바꾸고 이동은 하지 않는다)
const syncUrl = (q: string, userId: string | null) => {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  if (userId) sp.set("userId", userId);
  const qs = sp.toString();
  window.history.replaceState(null, "", qs ? `/admin/users?${qs}` : "/admin/users");
};

export default function AdminUsersPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Row[] | null>(null); // null = 아직 찾지 않음
  const [searched, setSearched] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [tab, setTab] = useState<TabId>("purchase");
  const [ledgerCur, setLedgerCur] = useState<LedgerCur>("xp");
  const [ledger, setLedger] = useState<Ledger | null>(null); // key = "<userId>:<currency>"
  const reqRef = useRef(0); // 빠르게 다른 줄을 누르면 늦게 온 이전 응답을 버린다
  const [spendBusy, setSpendBusy] = useState(""); // 1개 사용 중인 묶음 키
  const selectedRef = useRef<string | null>(null); // 검색을 다시 해도 열어 둔 유저를 주소에 남기려고

  const openUser = useCallback(async (id: string) => {
    const my = ++reqRef.current;
    selectedRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailErr("");
    try {
      const r = await fetch(`/api/admin/users?userId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = await r.json();
      if (my !== reqRef.current) return;
      if (!r.ok || !d?.success) throw new Error(d?.error || "불러오지 못했습니다.");
      setDetail(d.data);
    } catch (e: any) {
      if (my === reqRef.current) setDetailErr(e?.message || "불러오지 못했습니다.");
    }
  }, []);

  const runSearch = useCallback(async (term: string, keepUser: string | null = null) => {
    const t = term.trim();
    if (!t) return;
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(t)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || "검색에 실패했습니다.");
      const rows: Row[] = Array.isArray(d.data) ? d.data : [];
      setResults(rows);
      setSearched(t);
      // 한 명만 나오면 바로 연다 (주소로 연 유저는 그대로 두고, 이미 열려 있는 그 유저면 다시 읽지 않는다)
      const single = !keepUser && rows.length === 1 && rows[0].userId !== selectedRef.current ? rows[0].userId : null;
      if (single) openUser(single);
      syncUrl(t, keepUser || single || selectedRef.current);
    } catch (e: any) {
      notify(e?.message || "검색에 실패했습니다.", true);
    } finally {
      setSearching(false);
    }
  }, [notify, openUser]);

  // 처음 열 때 주소의 ?q= · ?userId= 를 이어받는다
  useEffect(() => {
    if (!isAdmin) return;
    const sp = new URLSearchParams(window.location.search);
    const q = (sp.get("q") || "").trim();
    const uid = (sp.get("userId") || "").trim();
    if (uid) openUser(uid);
    if (q) {
      setQuery(q);
      runSearch(q, uid || null);
    }
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // 역할 — 탭을 열 때 · 유저를 바꿀 때 디스코드에 새로 묻는다. 다른 유저로 바뀐 뒤 늦게 온 응답은 key 로 버린다
  const [roleState, setRoleState] = useState<RoleState | null>(null);
  const [roleRevoke, setRoleRevoke] = useState<HeldRole | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  //    불러오는 중은 화면이 key 로 판단한다(roleState 가 이 유저 것이 아니면 불러오는 중) — 효과 안에서 바로 상태를 바꾸지 않게
  const loadRoles = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/admin/users/roles?userId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      setRoleState(() => (r.ok && d?.success ? { key: id, loading: false, present: !!d.data?.present, roles: Array.isArray(d.data?.roles) ? d.data.roles : [], error: "" }
        : { key: id, loading: false, present: true, roles: [], error: d?.message || "역할을 읽지 못했습니다." }));
    } catch {
      setRoleState({ key: id, loading: false, present: true, roles: [], error: "역할을 읽지 못했습니다." });
    }
  }, []);
  useEffect(() => {
    if (tab !== "role" || !selectedId || roleState?.key === selectedId) return;
    loadRoles(selectedId);
  }, [tab, selectedId, roleState?.key, loadRoles]);
  const revokeRole = useCallback(async () => {
    if (!roleRevoke || !selectedId || roleBusy) return;
    setRoleBusy(true);
    try {
      const r = await fetch("/api/admin/users/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: selectedId, roleId: roleRevoke.id }) });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        notify(d.message || "회수했습니다.");
        // 그 자리에서 뺀다(디스코드 반영을 기다리지 않게)
        setRoleState((prev) => (prev?.key === selectedId ? { ...prev, roles: prev.roles.filter((x) => x.id !== roleRevoke.id) } : prev));
        setRoleRevoke(null);
      } else notify(d?.message || "처리에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setRoleBusy(false);
    }
  }, [roleRevoke, selectedId, roleBusy, notify]);

  // XP 내역 — 첫 쪽(before 없음) 또는 더 보기(before). 다른 유저 · 재화로 바뀐 뒤 늦게 온 응답은 key 로 버린다
  const loadLedger = useCallback(async (id: string, c: LedgerCur, before: string | null) => {
    const key = `${id}:${c}`;
    setLedger((prev) => (before && prev?.key === key ? { ...prev, loading: true } : { key, items: [], loading: true, more: null }));
    try {
      const sp = new URLSearchParams({ userId: id, currency: c });
      if (before) sp.set("before", before);
      const r = await fetch(`/api/xp/ledger?${sp.toString()}`, { cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      const items = Array.isArray(d?.data?.items) ? d.data.items : [];
      const more = d?.data?.hasMore ? d.data.nextBefore || null : null;
      setLedger((prev) => (prev?.key === key ? { key, items: before ? [...prev.items, ...items] : items, loading: false, more } : prev));
    } catch {
      setLedger((prev) => (prev?.key === key ? { ...prev, loading: false, more: null } : prev));
    }
  }, []);

  // 탭을 열 때 · 유저나 재화를 바꿀 때 첫 쪽을 읽는다
  useEffect(() => {
    if (tab !== "xp" || !selectedId || ledger?.key === `${selectedId}:${ledgerCur}`) return;
    loadLedger(selectedId, ledgerCur, null);
  }, [tab, selectedId, ledgerCur, ledger?.key, loadLedger]);

  // 📌 1회 소모권 1개 사용 — 먼저 끝나는 것 · 먼저 받은 것부터 1개(lib/itemConsume.js). 결과는 알림 창으로,
  //    목록은 다시 읽지 않고 그 자리에서 고친다(상세 칸이 "불러오는 중"으로 깜빡이며 줄이 튀지 않게)
  const spendOne = useCallback(async (userId: string, s: Stack) => {
    if (spendBusy) return;
    setSpendBusy(s.thing);
    try {
      const r = await fetch("/api/admin/users/consume", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, thing: s.thing }),
      });
      const d = await r.json().catch(() => null);
      const stacks: Stack[] | null = Array.isArray(d?.data?.stacks) ? d.data.stacks : null;
      const usedId = d?.data?.id ? String(d.data.id) : "";
      // 📌 다 쓴 묶음도 ×0 으로 자리를 지킨다(버튼만 잠김) — 줄 · 소제목이 사라져 아래 구매 목록이 커서 밑에서 튀어 오르지 않게.
      //    유저를 다시 열면 서버 목록 그대로(0 인 것은 없다)
      const keep = (old: Stack[] | undefined): Stack[] | null => (stacks && old
        ? [
            ...old.map((o) => stacks.find((x) => x.thing === o.thing) || { ...o, count: 0, pending: 0 }),
            ...stacks.filter((x) => !old.some((o) => o.thing === x.thing)),
          ]
        : stacks);
      setDetail((prev) => (prev && selectedRef.current === userId ? {
        ...prev,
        ...(stacks ? { stacks: keep(prev.stacks) || stacks } : {}),
        purchases: usedId ? prev.purchases.map((p: any) => (String(p._id) === usedId ? { ...p, consumedAt: new Date().toISOString() } : p)) : prev.purchases,
      } : prev));
      if (r.ok && d?.success) notify(`${s.name} 1개를 사용했습니다.\n남은 수량 ${Number(d.data.left) || 0}개`);
      else notify(d?.message || "처리에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setSpendBusy("");
    }
  }, [spendBusy, notify]);

  const closeUser = useCallback(() => {
    reqRef.current++;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailErr("");
    syncUrl(searched, null);
  }, [searched]);

  if (gate) return gate;

  const pickRow = (r: Row) => {
    openUser(r.userId);
    syncUrl(searched, r.userId);
  };

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "이름",
      mobile: "title",
      render: (r) => (
        <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
          <span className="truncate font-bold">{r.displayName || r.username || "—"}</span>
          {r.username && r.username !== r.displayName && <span className="truncate text-[12px] font-normal text-[#8a8a8a]">@{r.username}</span>}
          {r.noXp && <StatusChip className="shrink-0">XP 기록 없음</StatusChip>}
        </span>
      ),
    },
    { key: "id", label: "디스코드 ID", render: (r) => <span className="tabular-nums text-[#5a5a5a]">{r.userId}</span> },
    { key: "level", label: "레벨", align: "right", render: (r) => (r.noXp ? "—" : <LevelText level={r.level} />) },
    { key: "xp", label: "XP", align: "right", render: (r) => (r.noXp ? "—" : <span className="tabular-nums">{num(r.xp)}<Unit>XP</Unit></span>) },
    { key: "point", label: "빙옥", align: "right", render: (r) => (r.noXp ? "—" : <span className="tabular-nums">{num(r.point)}<Unit>빙옥</Unit></span>) },
  ];

  // ── 상세 칸 ──
  const row = results?.find((r) => r.userId === selectedId) || null;
  const u = detail?.user || null;
  const paneTitle = u?.displayName || u?.username || row?.displayName || row?.username || selectedId || "";
  const paneUsername = u?.username || row?.username || "";
  const tier = getTier(u?.level || 0);
  const counts: Record<TabId, number | null> = {
    purchase: detail ? detail.purchases.length : null,
    payout: detail ? detail.payouts.length : null,
    coupon: detail ? detail.coupons.length : null,
    inbox: detail ? detail.notifications.length + detail.inquiries.length + detail.applies.length : null,
    xp: null, // 원장은 쪽 단위라 개수를 달지 않는다
    role: roleState && roleState.key === selectedId && !roleState.loading ? roleState.roles.length : null,
  };

  const summary: { l: string; v: string; s?: React.ReactNode }[] = u
    ? [
        { l: "XP", v: num(u.xp) },
        { l: "빙옥", v: num(u.point) },
        { l: "레벨", v: `Lv.${u.level}`, s: <span style={{ color: tier.c }}>{tier.name}</span> },
        { l: "강화", v: `${u.chatEnhance} · ${u.voiceEnhance}`, s: "채팅 · 음성" },
        {
          l: "패스",
          // 서버 부스터는 사지 않아도 프리미엄이 열린다 — 구매 해금과 나눠 보인다
          v: !u.pass.current ? "—"
            : u.pass.premiumBy === "booster" ? "부스터 해금"
            : u.pass.unlocked ? "해금"
            : u.pass.boosterUnknown ? "확인 불가"
            : "미해금",
          s: u.pass.current ? `시즌 XP ${num(u.pass.seasonXp)} · 수령 ${u.pass.claimed}` : u.pass.season ? `시즌 ${u.pass.season} 기록` : "기록 없음",
        },
        { l: "출석", v: `${num(u.attendCount)}일`, s: `연속 ${u.attendStreak} · 최고 ${u.attendBestStreak}` },
      ]
    : [];

  const tabBody = (() => {
    if (!detail) return null;
    if (tab === "purchase") {
      const stacks = detail.stacks || [];
      return (
        <>
        {/* 📌 1회 소모권 — 가진 수량(×N)과 1개 사용. 수량 칸 · 버튼 폭 고정이라 숫자 · 글자가 바뀌어도 줄이 흔들리지 않는다 */}
        {stacks.length > 0 && (
          <>
            <SubHead label="소모권" n={stacks.length} />
            <ul className="divide-y divide-[#ededed] mb-2">
              {stacks.map((s) => (
                <li key={s.thing} className="py-2.5 flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{s.name}</span>
                  <span className="shrink-0 w-14 text-right text-[14px] font-black tabular-nums">×{num(s.count)}</span>
                  <Btn variant="secondary" size="sm" className="shrink-0 w-[84px]" disabled={!!spendBusy || !selectedId || s.count <= 0}
                    onClick={() => selectedId && spendOne(selectedId, s)}>
                    <SwapLabel swap={spendBusy === s.thing} to="처리 중…">1개 사용</SwapLabel>
                  </Btn>
                </li>
              ))}
            </ul>
            <SubHead label="구매" n={detail.purchases.length} />
          </>
        )}
        <List items={detail.purchases}>
          {detail.purchases.map((p: any) => {
            const st = PURCHASE_STATUS[p.status] || { l: p.status || "—", t: "neutral" as Tone };
            // 실제로 낸 값(혼합 결제면 둘 다). 옛 기록처럼 낸 값이 비어 있으면 가격을 보인다
            const paid = [p.paidXp > 0 && `${num(p.paidXp)} XP`, p.paidPoint > 0 && `${num(p.paidPoint)} 빙옥`].filter(Boolean).join(" + ")
              || (p.price > 0 ? `${num(p.price)} XP` : "0");
            return (
              <Line
                key={p._id}
                title={p.itemName || p.itemId}
                chips={
                  <>
                    <StatusChip tone={st.t} className="shrink-0">{st.l}</StatusChip>
                    {p.renewOf && <StatusChip tone="info" className="shrink-0">연장</StatusChip>}
                    {p.consumedAt && <StatusChip className="shrink-0">사용</StatusChip>}
                  </>
                }
                meta={joinMeta([
                  fmt(p.createdAt),
                  ITEM_TYPE[p.itemType] || p.itemType,
                  p.days > 0 && `${p.days}일`,
                  p.expiresAt && `~ ${fmt(p.expiresAt)}`,
                  p.siteOnly && "사이트 보유",
                ])}
                right={paid}
                error={p.error}
              />
            );
          })}
        </List>
        </>
      );
    }
    if (tab === "payout") {
      return (
        <List items={detail.payouts}>
          {detail.payouts.map((p: any) => {
            const st = PAYOUT_STATUS[p.status] || { l: p.status || "—", t: "neutral" as Tone };
            const amt = Number(p.amount) || 0;
            return (
              <Line
                key={p._id}
                title={p.reason || PAYOUT_SOURCE[p.source] || "지급"}
                chips={<StatusChip tone={st.t} className="shrink-0">{st.l}</StatusChip>}
                meta={joinMeta([fmt(p.createdAt), PAYOUT_SOURCE[p.source] || p.source])}
                right={<>{signed(amt)}<Unit>{cur(p.currency)}</Unit></>}
                rightCls={amt < 0 ? "text-[#d01634]" : ""}
                error={p.error}
              />
            );
          })}
        </List>
      );
    }
    if (tab === "coupon") {
      return (
        <List items={detail.coupons}>
          {detail.coupons.map((c: any) => (
            <Line
              key={c._id}
              title={c.name || c.code}
              chips={
                <>
                  <StatusChip tone={c.status === "used" ? "neutral" : "info"} className="shrink-0">{c.status === "used" ? "사용" : "미사용"}</StatusChip>
                  {c.missing && <StatusChip className="shrink-0">삭제됨</StatusChip>}
                </>
              }
              meta={joinMeta([
                c.code,
                `발급 ${fmt(c.issuedAt)}`,
                c.usedAt && `사용 ${fmt(c.usedAt)}`,
                c.source === "code" ? "코드 등록" : "운영진 지급",
              ])}
              right={
                c.kind === "reward" ? "보상"
                  : c.kind === "discount" ? (c.type === "flat" ? <>{num(c.value)}<Unit>XP</Unit></> : `${num(c.value)}%`)
                  : null
              }
              rightCls="!text-[13px]"
            />
          ))}
        </List>
      );
    }
    if (tab === "inbox") {
      return (
        <div>
          <SubHead label="알림" n={detail.notifications.length} />
          <List items={detail.notifications} compact>
            {detail.notifications.map((n: any) => (
              <Line
                key={n._id}
                title={n.title}
                chips={<StatusChip tone={NOTI_TONE[n.type] || "neutral"} className="shrink-0 order-first">{n.type || "알림"}</StatusChip>}
                meta={joinMeta([fmt(n.createdAt), n.read ? "읽음" : "안 읽음", n.dmSent ? "DM 발송" : "DM 미발송", n.hiddenAt && "유저가 지움", n.sentBy])}
              />
            ))}
          </List>
          <SubHead label="문의" n={detail.inquiries.length} />
          <List items={detail.inquiries} compact>
            {detail.inquiries.map((q: any) => (
              <Line
                key={q._id}
                title={q.title || joinMeta([q.mainType, q.subType]) || "문의"}
                chips={<StatusChip tone={q.status === "답변 완료" ? "ok" : "warn"} className="shrink-0">{q.status || "접수 중"}</StatusChip>}
                meta={joinMeta([fmt(q.createdAt), q.mainType, q.answeredAt && `답변 ${fmt(q.answeredAt)}`])}
              />
            ))}
          </List>
          <SubHead label="지원서" n={detail.applies.length} />
          <List items={detail.applies} compact>
            {detail.applies.map((a: any) => {
              const s = a.status || "심사 중";
              return (
                <Line
                  key={a._id}
                  title={a.position || "지원서"}
                  chips={<StatusChip tone={s === "합격" ? "ok" : s === "심사 중" ? "warn" : "neutral"} className="shrink-0">{s}</StatusChip>}
                  meta={fmt(a.createdAt)}
                />
              );
            })}
          </List>
        </div>
      );
    }
    if (tab === "role") {
      const rs = roleState && roleState.key === selectedId ? roleState : null;
      if (!rs || rs.loading) return <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>;
      if (rs.error) return <p className="py-10 text-center text-[13px] text-[#d01634]">{rs.error}</p>;
      if (!rs.present) return <p className="py-10 text-center text-[13px] text-[#8a8a8a]">서버에 없는 유저</p>;
      return (
        <List items={rs.roles} empty="역할 없음" capped={false}>
          {rs.roles.map((r) => {
            const locked = r.managed || r.rewardLevel != null;
            return (
              <li key={r.id} className="py-2.5 flex items-center gap-3 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{r.name}</span>
                {r.rewardLevel != null && <StatusChip className="shrink-0">레벨 보상 Lv.{r.rewardLevel}</StatusChip>}
                {r.managed && <StatusChip className="shrink-0">디스코드 관리</StatusChip>}
                {r.item && <StatusChip tone="info" className="shrink-0 max-w-[40%] truncate">보유 · {r.item}</StatusChip>}
                <Btn variant="secondary" size="sm" className="shrink-0" disabled={locked || roleBusy} onClick={() => setRoleRevoke(r)}>회수</Btn>
              </li>
            );
          })}
        </List>
      );
    }
    // XP 내역 — XP · 빙옥은 원장이 따로 준다. 50줄씩, 더 보기로 이어 받는다
    const lg = ledger && ledger.key === `${selectedId}:${ledgerCur}` ? ledger : null;
    return (
      <>
        <Segmented options={LEDGER_CUR} value={ledgerCur} onChange={(v) => setLedgerCur(v as LedgerCur)} className="mb-3" />
        {!lg || (lg.loading && lg.items.length === 0) ? (
          <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
        ) : (
          <>
            <List items={lg.items} empty="내역 없음" capped={false}>
              {lg.items.map((e: any, i: number) => {
                const amt = Number(e?.amount) || 0;
                return (
                  <Line
                    key={`${e?.kind || ""}:${e?.at || ""}:${i}`}
                    title={e?.label || "—"}
                    meta={joinMeta([fmt(e?.at), e?.count > 1 && `${num(e.count)}회`])}
                    right={<>{signed(amt)}<Unit>{cur(e?.currency || ledgerCur)}</Unit></>}
                    rightCls={amt < 0 ? "text-[#d01634]" : ""}
                  />
                );
              })}
            </List>
            {lg.more && (
              <div className="pt-3 flex justify-center">
                <Btn variant="secondary" size="sm" disabled={lg.loading} onClick={() => selectedId && loadLedger(selectedId, ledgerCur, lg.more)}>더 보기</Btn>
              </div>
            )}
          </>
        )}
      </>
    );
  })();

  return (
    <AdminPage section="운영" title="유저 조회">
      {/* 검색 한 줄 — 모바일도 입력칸 옆에 단추 (줄바꿈 없이) */}
      <form onSubmit={(e) => { e.preventDefault(); runSearch(query); }} className="flex items-center gap-2 mb-4">
        <SearchInput value={query} onChange={setQuery} placeholder="이름 · 디스코드 ID" className="flex-1 min-w-0 sm:flex-none" />
        <Btn type="submit" disabled={searching || !query.trim()}>검색</Btn>
      </form>

      {results && (
        <DataTable
          columns={columns}
          rows={results}
          rowKey={(r) => r.userId}
          onRowClick={pickRow}
          selectedKey={selectedId}
          empty="검색 결과가 없습니다."
        />
      )}

      <DetailPane
        open={!!selectedId}
        onClose={closeUser}
        width={520}
        badge={
          detail && (!u || u.needsRoleSync) ? (
            <span className="inline-flex gap-1.5">
              {!u && <StatusChip>XP 기록 없음</StatusChip>}
              {u?.needsRoleSync && <StatusChip tone="warn">역할 맞춤 대기</StatusChip>}
            </span>
          ) : undefined
        }
        title={paneTitle}
        sub={<span className="tabular-nums">{paneUsername && `@${paneUsername} · `}{selectedId}</span>}
      >
        {detailErr ? (
          <div className="py-10 text-center">
            <p className="text-[13px] text-[#d01634]">{detailErr}</p>
            <Btn variant="secondary" size="sm" className="mt-3" onClick={() => selectedId && openUser(selectedId)}>다시 시도</Btn>
          </div>
        ) : !detail ? (
          <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
        ) : (
          <>
            {/* 요약 숫자 — 2열(모바일) · 3열, 칸 사이 선은 1px 틈 */}
            {u && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[#ededed] rounded-2xl border border-[#ededed] overflow-hidden">
                {summary.map((c) => (
                  <div key={c.l} className="px-4 py-3.5 bg-white min-w-0">
                    <p className="text-[12px] font-bold text-[#5a5a5a]">{c.l}</p>
                    <p className="mt-1 text-[18px] font-black tracking-[-0.02em] tabular-nums leading-tight truncate">{c.v}</p>
                    {c.s && <p className="mt-1 text-[12px] text-[#8a8a8a] tabular-nums truncate">{c.s}</p>}
                  </div>
                ))}
              </div>
            )}
            {(u || detail.seasons.length > 0) && (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-[#8a8a8a] tabular-nums">
                {detail.seasons.map((s) => (
                  <StatusChip key={s.season} tone="ink">시즌 {s.season} · {s.rank}위</StatusChip>
                ))}
                {u && <span>{joinMeta([u.lastAttendDate && `마지막 출석 ${u.lastAttendDate.replace(/-/g, ".")}`, u.voiceSeconds > 0 && `음성 ${num(Math.floor(u.voiceSeconds / 3600))}시간`])}</span>}
              </div>
            )}

            {/* 하위 탭 — 칸 폭 고정(6등분). 개수는 넓은 화면에서만 옆에 옅게 → 글자 · 숫자가 바뀌어도 탭 줄이 움직이지 않는다 */}
            <div className="sticky top-0 z-[1] -mx-5 px-5 pt-5 pb-2 bg-white">
              <div role="tablist" className="grid grid-cols-6 p-1 rounded-full bg-[#f2f2f2]">
                {TABS.map((t) => {
                  const on = tab === t.id;
                  const n = counts[t.id];
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setTab(t.id)}
                      className={`min-w-0 h-8 px-1 inline-flex items-center justify-center gap-1 rounded-full text-[12px] sm:text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`}
                    >
                      {t.l}
                      {n != null && <span className={`hidden sm:inline text-[11px] tabular-nums ${on ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}`}>{n}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pt-2">{tabBody}</div>
          </>
        )}
      </DetailPane>

      <ConfirmDialog
        open={!!roleRevoke}
        danger
        title="역할 회수"
        confirmLabel="회수"
        busy={roleBusy}
        onCancel={() => setRoleRevoke(null)}
        onConfirm={revokeRole}
        body={roleRevoke ? <p className="break-keep">{detail?.user?.displayName || detail?.user?.username || selectedId} · {roleRevoke.name}</p> : null}
      />
      {noticeEl}
    </AdminPage>
  );
}
