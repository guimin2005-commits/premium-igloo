"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Reveal, LuxStyles } from "../../components/Lux";
import Dropdown from "../../components/Dropdown";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import {
  inputClass,
  fieldNote,
  SectionHead,
  FilterChips,
  EmptyRow,
  ListFrame,
  Btn,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
  AdminHero,
  AdminTabs,
  SubTabs,
} from "../ui";

const CHANNEL_TYPE_LABEL: Record<string, string> = { text: "텍스트", voice: "음성", category: "카테고리" };
const CHANNEL_TYPE_ICON: Record<string, string> = { text: "#", voice: "🔊", category: "📁" };
const REASON_LABEL: Record<string, string> = { chat: "채팅", voice: "음성", attend: "출석" };
const PERIOD_LABEL: Record<string, string> = { daily: "일일", weekly: "주간", monthly: "월간" };

// 📌 주기별 무작위 노출 개수 — 등록된 퀘스트 중 매 주기마다 이 개수만큼 뽑아 보여준다 (0이면 전부)
const QUEST_PICK_FIELDS = [
  { period: "daily", key: "questPickDaily", every: "매일 자정" },
  { period: "weekly", key: "questPickWeekly", every: "매주 월요일" },
  { period: "monthly", key: "questPickMonthly", every: "매월 1일" },
];

const INV_CATEGORY: Record<string, string> = { perk: "특전", title: "칭호", notify: "알림", etc: "기타" };
// 📌 인벤토리에 자동으로 잡히는 역할의 출처 — 상품·레벨 보상·역할 설정
const ORIGIN_LABEL: Record<string, string> = { shop: "상점", level: "레벨", buff: "역할" };
const ORIGIN_STYLE: Record<string, string> = {
  shop: "border-[#131313]/20 text-[#131313] bg-black/[0.04]",
  level: "border-[#e91e3f]/30 text-[#e91e3f] bg-[#e91e3f]/[0.06]",
  buff: "border-[#3f83b8]/30 text-[#3f83b8] bg-[#3f83b8]/[0.06]",
};

// ── 탭 ──────────────────────────────────────────────────────
//    운영 흐름대로 네 갈래다: 규칙을 정하고(정책) → 역할에 잇고(역할) →
//    돌릴 것을 만들고(콘텐츠) → 주고 확인한다(지급·내역).
//    예전에는 9개였는데, 같은 성격의 화면이 흩어져 있어 어디로 가야 할지가 매번 헷갈렸다.
const TAB_ORDER: { id: string; short: string }[] = [
  { id: "policy", short: "정책" },
  { id: "roles", short: "역할" },
  { id: "content", short: "콘텐츠" },
  { id: "ledger", short: "지급·내역" },
];

const TAB_META: Record<string, { title: string; desc: string }> = {
  policy: { title: "레벨 정책", desc: "지급량·쿨타임·음소거·퇴장 처리와 알림 문구 등 봇의 기본 XP 규칙을 설정합니다." },
  roles: { title: "역할 매핑", desc: "레벨 보상 역할, 음성 티어 일괄 연결, 인벤토리 표기, 시즌 전환 보호 역할을 한자리에서 관리합니다." },
  content: { title: "콘텐츠 설정", desc: "채널별 XP 정책과 퀘스트, 기간제 부스트를 관리합니다." },
  ledger: { title: "XP 지급·내역", desc: "XP를 직접 주거나 회수·초기화하고, 봇 자동 지급과 수동 지급 내역을 함께 조회합니다." },
};

// 📌 탭 안의 세부 탭 — 설정이 세로로 길게 늘어지지 않도록 한 번에 한 묶음만 보여준다.
//    첫 항목이 기본값이고, 주소의 ?sec= 로 바로 들어올 수 있다.
const SUB_TABS: Record<string, { id: string; label: string }[]> = {
  policy: [
    { id: "xp", label: "지급량 · 주기" },
    { id: "mute", label: "음소거 · 퇴장" },
    { id: "levelup", label: "레벨업 알림" },
    { id: "rolegrant", label: "역할 지급 알림" },
  ],
  roles: [
    { id: "reward", label: "레벨 보상" },
    { id: "tier", label: "티어 일괄 연결" },
    { id: "inventory", label: "인벤토리 표기" },
    { id: "protected", label: "보호 역할" },
  ],
  content: [
    { id: "channels", label: "채널" },
    { id: "quests", label: "퀘스트" },
    { id: "boosts", label: "부스트" },
  ],
  ledger: [
    { id: "grant", label: "XP 지급 · 회수" },
    { id: "logs", label: "지급 내역" },
    { id: "reset", label: "XP 초기화" },
  ],
};

// 📌 옛 주소 → 새 탭·세부 탭 이사표.
//    9개 탭을 4개로 접었기 때문에 예전 링크(좌측 내비, 상점의 '비공개' 배너, 북마크,
//    안내글에 적어 둔 주소)가 그대로 남아 있다. 모르는 tab 값이 들어오면 조용히
//    첫 탭으로 떨어뜨리지 않고 이 표로 옮겨 준다 — 링크가 죽으면 무엇이 어디로
//    갔는지 아무도 모른 채 화면만 엉뚱하게 열린다.
const LEGACY_TAB: Record<string, { tab: string; sec?: string }> = {
  settings: { tab: "policy" }, // 세부 탭 id(xp/mute/levelup/rolegrant)는 그대로 살아 있다
  channels: { tab: "content", sec: "channels" },
  quests: { tab: "content", sec: "quests" },
  boosts: { tab: "content", sec: "boosts" },
  inventory: { tab: "roles", sec: "inventory" },
  grant: { tab: "ledger" }, // 세부 탭 id(grant/reset/logs)도 그대로다
  logs: { tab: "ledger", sec: "logs" }, // 옛 XP 로그 탭 = 새 '지급 내역'
  leaderboard: { tab: "ledger" }, // 랭킹은 /level?tab=rank 로 넘겼다 (ledger 맨 위 바로가기)
};
// roles 탭은 이름이 그대로라 세부 탭만 옮긴다 — 폼과 목록을 한 화면으로 합쳤다
const LEGACY_ROLE_SEC: Record<string, string> = { form: "reward", list: "reward" };

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// datetime-local 입력값 ↔ Date 변환 (로컬 시간 기준)
const toLocalInput = (v: string | Date) => {
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ts = (v: string | Date) => new Date(v).getTime();

// 📌 지급 내역 한 줄 — 봇 자동 지급(XpLog)과 관리자 수동 지급(Payout)을 한 모양으로 맞춘 것.
//    src 로 어느 쪽인지 구분하고, 한쪽에만 있는 값(채널명·처리 상태)은 선택 항목으로 둔다.
type LedgerRow = {
  k: string;
  src: "bot" | "manual";
  at: string | Date;
  name: string;
  amount: number;
  note: string;
  channelName?: string;
  status?: string | null;
  error?: string | null;
};

const EMPTY_ROLE = { roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "", exclusive: false };
const EMPTY_CHANNEL = { channelId: "", boostXp: "", excluded: false };
const EMPTY_BOOST = { id: "", name: "", targetRoleId: "", targetChannelId: "", boostXp: "", startAt: "", endAt: "" };
const EMPTY_INV = { id: "", roleId: "", label: "", category: "perk", description: "", sortOrder: 0, visible: true };
const EMPTY_QUEST = { id: "", name: "", desc: "", period: "daily", reason: "chat", metric: "count", target: 1, rewardXp: 0, rewardPoint: 0, enabled: true, order: 0 };

const labelClass = "block text-xs font-bold text-[#8a8a8a] mb-2";

// 📌 안내 문단 — 예전에는 큼직한 테두리 박스 여섯 개가 화면을 아래로 밀어내고 있었다.
//    내용은 그대로 두고 세로 자리만 줄인다.
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[#5a5a5a] leading-relaxed break-keep border-l-2 border-[#e91e3f]/30 pl-3.5 mb-6">
      {children}
    </p>
  );
}

// 📌 접어 두는 편집 폼 — 목록을 먼저 보여 주고, ＋ 추가나 행의 수정을 눌렀을 때만 펼친다.
//    폼과 목록을 세부 탭 두 개로 갈라 두면 등록하고 확인하러 탭을 옮겨야 했고,
//    한 화면에 나란히 두면 세로로 너무 길어졌다.
function FormPanel({
  open,
  title,
  onSubmit,
  onCancel,
  saveLabel,
  panelRef,
  children,
}: {
  open: boolean;
  title: string;
  onSubmit: () => void;
  onCancel: () => void;
  saveLabel: string;
  panelRef?: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      ref={panelRef}
      className="mb-10 border border-black/10 rounded-xl p-5 md:p-6 bg-black/[0.015] scroll-mt-24"
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <h3 className="text-sm font-black text-[#131313] tracking-tight">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
        >
          접기
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <div className="flex flex-wrap gap-3 mt-7">
          <Btn type="submit" variant="primary">{saveLabel}</Btn>
          <Btn type="button" variant="ghost" onClick={onCancel}>취소</Btn>
        </div>
      </form>
    </div>
  );
}

// 목록 안의 작은 묶음 머리 — 퀘스트 주기별 / 자동으로 잡히는 역할 등
function GroupHead({ title, count, right }: { title: string; count?: number; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3 pb-2.5 border-b border-black/10">
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-sm font-black text-[#131313]">{title}</span>
        {count != null && <span className="text-[11px] font-black text-[#a3a3a3] tabular-nums">{count}</span>}
      </div>
      {right && <span className="min-w-0 text-[11px] font-bold text-[#8a8a8a] text-right break-keep">{right}</span>}
    </div>
  );
}

export default function AdminBotPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  // ── 탭 해석 ─────────────────────────────────
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "";
  const rawSec = searchParams.get("sec") || "";

  let tab = rawTab;
  let sec = rawSec;
  if (!TAB_META[tab]) {
    const moved = LEGACY_TAB[tab];
    if (moved) {
      tab = moved.tab;
      sec = moved.sec ?? rawSec;
    } else {
      tab = "policy";
      sec = "";
    }
  }
  if (tab === "roles" && LEGACY_ROLE_SEC[sec]) sec = LEGACY_ROLE_SEC[sec];

  const subList = SUB_TABS[tab] || [];
  const sub = subList.some((x) => x.id === sec) ? sec : subList[0]?.id || "";

  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "role" | "channel" | "boost" | "quest" | "inventory"; id: string } | null>(null);

  // 공통 데이터
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [guildChannels, setGuildChannels] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<any[]>([]);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [quests, setQuests] = useState<any[]>([]);
  const [invRoles, setInvRoles] = useState<any[]>([]);
  const [shopItems, setShopItems] = useState<any[]>([]);

  // 지급 내역 (봇 자동 지급 XpLog)
  const [logs, setLogs] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logQuery, setLogQuery] = useState("");
  // "" 전체 · chat/voice/attend 봇 사유 · manual 관리자 수동 지급(Payout)
  const [ledgerFilter, setLedgerFilter] = useState("");

  const saved = () => notify("저장되었습니다. 봇에는 1분 이내 자동 반영됩니다.");

  // 편집 폼 — 세부 탭마다 하나씩만 펼친다.
  // 어느 탭·세부 탭에서 열었는지를 함께 들고 있어서, 다른 화면으로 옮기면 저절로 닫힌 것으로 친다
  // (효과로 상태를 되돌리면 렌더가 한 번 더 도는데, 여기선 그럴 이유가 없다).
  // 매번 새 객체를 넣으므로 이미 열려 있는 폼을 다시 눌러도 아래 스크롤 효과가 다시 돈다.
  const [openForm, setOpenForm] = useState<{ tab: string; sec: string; kind: string } | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const openFormAt = (kind: string) => setOpenForm({ tab, sec: sub, kind });
  const closeForm = () => setOpenForm(null);
  const isFormOpen = (kind: string) =>
    !!openForm && openForm.kind === kind && openForm.tab === tab && openForm.sec === sub;

  const [roleForm, setRoleForm] = useState<any>(EMPTY_ROLE);
  const [chForm, setChForm] = useState<any>(EMPTY_CHANNEL);
  const [boostForm, setBoostForm] = useState<any>(EMPTY_BOOST);
  const [invForm, setInvForm] = useState<any>(EMPTY_INV);
  const [questForm, setQuestForm] = useState<any>(EMPTY_QUEST);
  // 📌 노출 방식 패널은 자기 폼 상태 없이 공용 settings 를 바로 고친다.
  //    그래서 '취소'로 되돌리려면 연 시점의 값을 붙잡아 둬야 한다 —
  //    안 그러면 취소한 값이 다른 탭의 '저장'에 묻어 조용히 저장된다.
  const [pickSnapshot, setPickSnapshot] = useState<Record<string, any> | null>(null);
  const [isProtectedRoleOpen, setIsProtectedRoleOpen] = useState(false);

  // ── 데이터 로드 ─────────────────────────────
  const fetchCore = useCallback(() => {
    Promise.all([
      fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/channel-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-channels", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: null })),
      fetch("/api/xp-boost", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/daily-quest", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/inventory-role", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/items?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([cfg, roles, chCfg, channels, st, bst, qst, inv, shop]) => {
      setConfigs(Array.isArray(cfg?.data) ? cfg.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setChannelConfigs(Array.isArray(chCfg?.data) ? chCfg.data : []);
      setGuildChannels(Array.isArray(channels?.data) ? channels.data : []);
      if (st?.data) setSettings(st.data);
      setBoosts(Array.isArray(bst?.data) ? bst.data : []);
      setQuests(Array.isArray(qst?.data) ? qst.data : []);
      setInvRoles(Array.isArray(inv?.data) ? inv.data : []);
      setShopItems(Array.isArray(shop?.data) ? shop.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) fetchCore(); }, [isAdmin, fetchCore]);

  // 펼친 폼으로 데려간다 — 화면 밖에서 열리면 눌린 줄 모른다
  useEffect(() => {
    if (!openForm) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openForm]);

  // 봇 자동 지급 로그
  useEffect(() => {
    if (!isAdmin || tab !== "ledger" || sub !== "logs") return;
    // '수동'은 Payout(grantLogs)만 보여 준다 — 화면에 쓰지도 않을 봇 로그를 부를 이유가 없다
    if (ledgerFilter === "manual") return;
    const qs = new URLSearchParams({ limit: "50", skip: String(logPage * 50) });
    if (ledgerFilter) qs.set("reason", ledgerFilter);
    if (logQuery.trim()) qs.set("q", logQuery.trim());
    fetch(`/api/xp-logs?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setLogs(Array.isArray(d?.data) ? d.data : []); setLogTotal(d?.total || 0); })
      .catch(() => {});
  }, [isAdmin, tab, sub, logPage, ledgerFilter, logQuery]);

  // ── 설정 저장 ───────────────────────────────
  const postSettings = async () => {
    const res = await fetch("/api/bot-settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    }).catch(() => null);
    if (res?.ok) { const d = await res.json(); setSettings(d.data); saved(); return true; }
    notify("저장에 실패했습니다.", true);
    return false;
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await postSettings();
  };

  // 퀘스트 노출 방식도 같은 문서를 저장한다 (설정은 단일 문서라 전체를 함께 보낸다)
  const savePicks = async () => {
    if (!settings) { notify("설정을 아직 불러오지 못했습니다.", true); return; }
    if (await postSettings()) { setPickSnapshot(null); closeForm(); }
  };

  // 노출 방식 패널 열기/취소 — 취소는 연 시점의 값으로 되돌린다
  const openPicks = () => {
    // 아직 설정을 못 불러왔으면 붙잡을 값이 없다 — 0 으로 채워 두면 취소가 오히려 값을 0 으로 만든다
    setPickSnapshot(settings ? Object.fromEntries(QUEST_PICK_FIELDS.map((f) => [f.key, settings[f.key] ?? 0])) : null);
    openFormAt("questPick");
  };
  const cancelPicks = () => {
    if (pickSnapshot && settings) setSettings({ ...settings, ...pickSnapshot });
    setPickSnapshot(null);
    closeForm();
  };

  // ── XP 수동 지급 ─────────────────────────────
  const [grantForm, setGrantForm] = useState({ target: "", amount: "", reason: "" });
  const [grantLogs, setGrantLogs] = useState<any[]>([]);
  const [isGranting, setIsGranting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const loadGrantLogs = useCallback(() => {
    fetch("/api/xp/grant", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGrantLogs(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => { if (isAdmin && tab === "ledger") loadGrantLogs(); }, [isAdmin, tab, loadGrantLogs]);

  // amount를 넘기면 그 값으로, 넘기지 않으면 입력값 그대로 보낸다 (제거는 음수로 뒤집는다)
  const runGrant = async (target: string, override?: { amount?: number; mode?: "reset" }) => {
    if (isGranting) return;
    setIsGranting(true);
    try {
      const res = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...grantForm, target, ...override }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        notify(d.message || "처리했습니다.");
        setGrantForm({ target: "", amount: "", reason: "" });
        loadGrantLogs();
      } else {
        notify(d.message || "처리에 실패했습니다.", true);
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsGranting(false);
      setConfirmAll(false);
      setConfirmReset(null);
    }
  };

  const submitGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantForm.target.trim()) return notify("지급 대상을 입력해주세요.", true);
    runGrant(grantForm.target.trim());
  };

  // 제거 — 입력한 XP만큼 회수한다 (보유량을 넘으면 보유량까지만)
  const submitRemove = () => {
    const amount = Math.abs(Math.trunc(Number(grantForm.amount) || 0));
    if (!grantForm.target.trim()) return notify("제거할 대상을 입력해주세요.", true);
    if (!amount) return notify("제거할 XP를 입력해주세요.", true);
    runGrant(grantForm.target.trim(), { amount: -amount });
  };

  // ── 음성 티어 역할 일괄 등록 ──────────────────
  const [tierMap, setTierMap] = useState<Record<string, string>>({});
  const [tierSaving, setTierSaving] = useState(false);

  const saveTierRoles = async () => {
    const picked = (VOICE_TIERS as any[]).filter((t) => tierMap[t.key]);
    if (!picked.length) return notify("연결할 역할을 하나 이상 선택해 주세요.", true);
    // 같은 역할을 두 티어에 붙이면 지급·회수가 서로 싸운다
    const ids = picked.map((t) => tierMap[t.key]);
    if (new Set(ids).size !== ids.length) return notify("같은 역할을 여러 티어에 연결할 수 없습니다.", true);

    setTierSaving(true);
    let ok = 0;
    for (const t of picked as any[]) {
      const roleId = tierMap[t.key];
      const res = await fetch("/api/role-config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId,
          roleName: guildRoles.find((r) => r.id === roleId)?.name || t.name,
          rewardLevel: t.min,
          buffXp: 0,
          attendBuffXp: 0,
          exclusive: true, // 티어 사다리 — 최상위 하나만 유지된다
        }),
      }).catch(() => null);
      if (res?.ok) ok++;
    }
    setTierSaving(false);
    fetchCore();
    if (ok === picked.length) notify(`티어 역할 ${ok}개를 연결했습니다. 봇에는 1분 이내 반영됩니다.`);
    else notify(`${ok}/${picked.length}개만 저장되었습니다.`, true);
  };

  // ── 저장 핸들러 ─────────────────────────────
  const saveRole = async () => {
    if (!roleForm.roleId) return notify("역할을 선택해주세요.", true);
    const picked = guildRoles.find((r) => r.id === roleForm.roleId);
    const res = await fetch("/api/role-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roleId: roleForm.roleId, roleName: picked?.name || "",
        rewardLevel: roleForm.rewardLevel === "" ? null : Number(roleForm.rewardLevel),
        buffXp: Number(roleForm.buffXp) || 0, attendBuffXp: Number(roleForm.attendBuffXp) || 0,
        exclusive: !!roleForm.exclusive,
      }),
    }).catch(() => null);
    if (res?.ok) { setRoleForm(EMPTY_ROLE); closeForm(); fetchCore(); saved(); }
    else notify("저장에 실패했습니다.", true);
  };

  const saveChannel = async () => {
    if (!chForm.channelId) return notify("채널을 선택해주세요.", true);
    if (!chForm.excluded && !(Number(chForm.boostXp) > 0)) return notify("Boost XP를 입력하거나 지급 제외를 선택해주세요.", true);
    const picked = guildChannels.find((c) => c.id === chForm.channelId);
    const res = await fetch("/api/channel-config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: chForm.channelId, channelName: picked?.name || "",
        channelType: picked?.type || "text",
        boostXp: chForm.excluded ? 0 : Number(chForm.boostXp) || 0, excluded: chForm.excluded,
      }),
    }).catch(() => null);
    if (res?.ok) { setChForm(EMPTY_CHANNEL); closeForm(); fetchCore(); saved(); }
    else notify("저장에 실패했습니다.", true);
  };

  const saveBoost = async () => {
    if (!boostForm.startAt || !boostForm.endAt) return notify("기간을 입력해주세요.", true);
    const bRole = guildRoles.find((r) => r.id === boostForm.targetRoleId);
    const bChannel = guildChannels.find((c) => c.id === boostForm.targetChannelId);
    const res = await fetch("/api/xp-boost", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...boostForm,
        targetRoleName: bRole?.name || "",
        targetChannelName: bChannel?.name || "",
        targetChannelType: bChannel?.type || "",
        boostXp: Number(boostForm.boostXp) || 0,
        startAt: new Date(boostForm.startAt), endAt: new Date(boostForm.endAt),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setBoostForm(EMPTY_BOOST); closeForm(); fetchCore(); saved(); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  const saveInvRole = async () => {
    if (!invForm.roleId) return notify("역할을 선택해 주세요.", true);
    const res = await fetch("/api/inventory-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...invForm, roleName: guildRoles.find((r) => r.id === invForm.roleId)?.name || "" }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (d?.success) { setInvForm(EMPTY_INV); closeForm(); fetchCore(); notify("저장되었습니다. 유저 인벤토리에 바로 반영됩니다."); }
    else notify(d?.error || "저장에 실패했습니다.", true);
  };

  const saveQuest = async () => {
    if (!questForm.name.trim()) return notify("퀘스트 이름을 입력해 주세요.", true);
    const res = await fetch("/api/daily-quest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(questForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (d?.success) { setQuestForm(EMPTY_QUEST); closeForm(); fetchCore(); notify("저장되었습니다. 유저 화면에 바로 반영됩니다."); }
    else notify(d?.error || "저장에 실패했습니다.", true);
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const api = { role: "/api/role-config", channel: "/api/channel-config", boost: "/api/xp-boost", quest: "/api/daily-quest", inventory: "/api/inventory-role" }[deleteConfirm.kind];
    const res = await fetch(`${api}?id=${deleteConfirm.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) fetchCore();
    setDeleteConfirm(null);
  };

  // 화면 가리개일 뿐이다 — 실제 방어는 각 API 의 getServerSession + isAdminName 이 한다
  if (gate) return gate;

  // ── 파생값 ──────────────────────────────────
  // 봇이 실제로 지급할 수 있는 역할만 — 디스코드가 관리하는 역할(서버 부스트 등)은 줄 수 없다.
  // 부스트 대상 지정과 인벤토리 표시에는 관리 역할도 쓸 수 있으므로 그쪽은 guildRoles 를 그대로 쓴다.
  const grantableRoles = guildRoles.filter((r) => !r.managed);
  const roleNameOf = (id: string) => guildRoles.find((g) => g.id === id)?.name || "";

  const roleOptions = (list: any[]) => list.map((r) => ({ value: r.id, label: r.name, color: r.color }));
  const channelOptions = guildChannels.map((c) => ({
    value: c.id,
    label: `${CHANNEL_TYPE_ICON[c.type] || "#"} ${c.name}`,
    hint: CHANNEL_TYPE_LABEL[c.type],
    indent: !!c.parentId,
  }));

  // 📌 등록하지 않아도 인벤토리에 잡히는 역할 — /api/shop/my-items 가 상품·역할 설정 역할을 그대로 인정하기 때문
  const invRoleIds = new Set(invRoles.map((r) => r.roleId));
  const autoRoles = [
    ...shopItems
      .filter((i) => i.roleId)
      .map((i) => ({
        key: "shop-" + i._id,
        roleId: i.roleId,
        origin: "shop",
        name: i.name,
        roleName: roleNameOf(i.roleId) || i.roleName || "",
        note: i.type === "perk" ? "권한 상품" : "역할 상품",
        muted: i.active === false,
      })),
    ...configs.map((c) => ({
      key: "cfg-" + c._id,
      roleId: c.roleId,
      origin: c.rewardLevel != null ? "level" : "buff",
      name: roleNameOf(c.roleId) || c.roleName || "역할",
      roleName: roleNameOf(c.roleId) || c.roleName || "",
      note:
        c.rewardLevel != null
          ? "Lv." + c.rewardLevel + " 도달 시 자동 지급" + (c.exclusive ? " · 등급 역할" : "")
          : c.buffXp > 0 || c.attendBuffXp > 0
          ? "역할 버프 설정"
          : "역할 설정에 등록됨",
      muted: false,
    })),
  ].map((r) => ({ ...r, overridden: invRoleIds.has(r.roleId), exists: !!roleNameOf(r.roleId) }));

  // 📌 시즌 전환 보호 역할 — 설정 문서(BotSetting)의 배열 하나라 저장은 기존 postSettings 를 그대로 쓴다
  const protectedRoleIds: string[] = Array.isArray(settings?.protectedRoleIds) ? settings.protectedRoleIds : [];
  const toggleProtectedRole = (id: string) =>
    setSettings({
      ...settings,
      protectedRoleIds: protectedRoleIds.includes(id)
        ? protectedRoleIds.filter((x) => x !== id)
        : [...protectedRoleIds, id],
    });

  // ── 지급 내역 — 두 출처를 하나로 ──────────────
  //    XpLog 는 봇이 자동으로 준 것(채팅·음성·출석), Payout 은 관리자가 수동으로 준 것.
  //    예전에는 탭이 따로 있어 "그 지급이 어디에 찍혔더라"를 매번 두 곳에서 찾아야 했다.
  const logQ = logQuery.trim().toLowerCase();
  const manualRows: LedgerRow[] = grantLogs
    .filter((g) => !logQ || String(g.userName || g.userId || "").toLowerCase().includes(logQ))
    .map((g) => ({
      k: "m" + g._id,
      src: "manual",
      at: g.createdAt,
      name: g.userName || g.userId,
      amount: g.amount || 0,
      note: g.reason || "관리자 지급",
      status: g.status,
      error: g.error,
    }));
  const botRows: LedgerRow[] = logs.map((l) => ({
    k: "b" + l._id,
    src: "bot",
    at: l.createdAt,
    name: l.displayName || l.userId,
    amount: l.amount || 0,
    note: REASON_LABEL[l.reason] || "-",
    channelName: l.channelName,
  }));

  let ledgerRows: LedgerRow[];
  if (ledgerFilter === "manual") {
    ledgerRows = manualRows;
  } else if (ledgerFilter === "") {
    // 쪽 넘김은 양이 압도적으로 많은 봇 로그를 기준으로 한다. 수동 지급은 이 쪽이 덮는
    // 시간 구간 안의 것만 끼워 넣어야 시간순이 어긋나지 않는다 (첫 쪽은 위쪽이 열려 있다).
    const newest = logPage === 0 ? Infinity : botRows.length ? ts(botRows[0].at) : Infinity;
    const oldest = botRows.length ? ts(botRows[botRows.length - 1].at) : -Infinity;
    ledgerRows = [...botRows, ...manualRows.filter((m) => ts(m.at) <= newest && ts(m.at) >= oldest)]
      .sort((a, b) => ts(b.at) - ts(a.at));
  } else {
    ledgerRows = botRows;
  }

  const meta = TAB_META[tab];
  const hrefTab = (id: string) => `/admin/bot?tab=${id}`;
  const hrefSec = (id: string) => `/admin/bot?tab=${tab}&sec=${id}`;

  const loadingRow = <div className="py-10 text-center text-[#8a8a8a] text-sm">불러오는 중...</div>;

  return (
    <main className="w-full flex-1 flex flex-col relative">
      <LuxStyles />

      <AdminHero title={meta.title} desc={meta.desc} />
      <AdminTabs tabs={TAB_ORDER} current={tab} hrefOf={hrefTab} />

      <div className="w-full max-w-6xl mx-auto px-6 pb-16 flex-1 flex flex-col">
        {/* 랭킹은 유저 화면이 상위호환이라 관리자 쪽에 따로 두지 않는다 — 한 줄 바로가기로만 남긴다 */}
        {tab === "ledger" && (
          <Link
            href="/level?tab=rank"
            className="flex items-center justify-between gap-4 py-3 mb-6 border-y border-black/[0.06] text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
          >
            <span className="break-keep">랭킹은 유저 화면에서 봅니다 — 누적 · 이번 달 · 음성 시간</span>
            <span className="shrink-0 text-[#e91e3f]">/level?tab=rank →</span>
          </Link>
        )}

        <SubTabs tabs={subList} current={sub} hrefOf={hrefSec} />

        <div className="flex-1">

        {/* ═══════════ 정책 ═══════════ */}
        {tab === "policy" && (settings ? (
          <Reveal>
          <form onSubmit={saveSettings}>
            {sub === "xp" && (
            <section>
              <SectionHead no="01" title="지급량 · 주기" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>채팅 XP</label>
                  <input type="number" min={0} value={settings.chatXp} onChange={(e) => setSettings({ ...settings, chatXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>메시지 1회당 기본 지급량</p>
                </div>
                <div>
                  <label className={labelClass}>채팅 쿨타임 (초)</label>
                  <input type="number" min={0} value={settings.chatCooldownSec} onChange={(e) => setSettings({ ...settings, chatCooldownSec: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>이 시간 안의 추가 메시지는 지급 없음</p>
                </div>
                <div>
                  <label className={labelClass}>음성 XP</label>
                  <input type="number" min={0} value={settings.voiceXp} onChange={(e) => setSettings({ ...settings, voiceXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 지급 1회당 기본 지급량</p>
                </div>
                <div>
                  <label className={labelClass}>음성 지급 주기 (초)</label>
                  <input type="number" min={30} value={settings.voiceIntervalSec} onChange={(e) => setSettings({ ...settings, voiceIntervalSec: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 채널 접속자에게 이 주기마다 지급 (기본 300초 = 5분)</p>
                </div>
                <div>
                  <label className={labelClass}>출석체크 XP</label>
                  <input type="number" min={0} value={settings.attendXp} onChange={(e) => setSettings({ ...settings, attendXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>일일 출석 보상 지급량 (1일 1회)</p>
                </div>
                <div>
                  <label className={labelClass}>출석 인정 접속 시간 (분)</label>
                  <input type="number" min={1} max={1440} value={settings.attendVoiceMin ?? 60} onChange={(e) => setSettings({ ...settings, attendVoiceMin: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>음성 채널에 하루 이만큼 머무르면 출석 보상을 받을 수 있습니다 (기본 60분)</p>
                </div>
              </div>
            </section>
            )}

            {sub === "mute" && (
            <section>
              <SectionHead no="02" title="음소거 · 퇴장 처리" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelClass}>음소거 시 처리</label>
                  <FilterChips
                    options={[{ v: "off", l: "제한 없음" }, { v: "reduce", l: "감소" }, { v: "block", l: "차단" }]}
                    value={settings.muteMode || "off"}
                    onChange={(v) => setSettings({ ...settings, muteMode: v })}
                  />
                  <p className={fieldNote}>차단은 지급 자체를 건너뜁니다</p>
                </div>
                <div>
                  <label className={labelClass}>감소 비율 (%)</label>
                  <input type="number" min={0} max={100} value={settings.muteReducePct} disabled={settings.muteMode !== "reduce"}
                    onChange={(e) => setSettings({ ...settings, muteReducePct: e.target.value })} className={`${inputClass} disabled:opacity-40`} />
                  <p className={fieldNote}>90 = 원래 지급량의 10%만 지급</p>
                </div>
                <div>
                  <label className={labelClass}>적용 기준</label>
                  <FilterChips
                    options={[{ v: "both", l: "마이크+헤드셋 모두" }, { v: "any", l: "하나라도 음소거" }]}
                    value={settings.muteTarget || "both"}
                    onChange={(v) => setSettings({ ...settings, muteTarget: v })}
                  />
                  <p className={fieldNote}>어떤 상태를 &lsquo;음소거&rsquo;로 볼지</p>
                </div>
                <div>
                  <label className={labelClass}>서버 퇴장 시 XP 초기화</label>
                  <Toggle
                    on={!!settings.resetOnLeave}
                    onClick={() => setSettings({ ...settings, resetOnLeave: !settings.resetOnLeave })}
                    onLabel="초기화함"
                    offLabel="유지함 (기본)"
                  />
                  <p className={fieldNote}>⚠️ 켜면 나간 유저의 XP 기록이 삭제되어 복구할 수 없습니다</p>
                </div>
                <div>
                  <label className={labelClass}>ARCTIC 상점 공개</label>
                  <Toggle
                    on={!!settings.shopPublic}
                    onClick={() => setSettings({ ...settings, shopPublic: !settings.shopPublic })}
                    onLabel="공개 중"
                    offLabel="비공개 (관리자만)"
                  />
                  <p className={fieldNote}>비공개면 일반 유저에게 &lsquo;준비 중&rsquo; 화면이 보이고 관리자만 상점을 이용할 수 있습니다</p>
                </div>
              </div>
            </section>
            )}

            {sub === "levelup" && (
            <section>
              <SectionHead no="03" title="레벨업 알림" />
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>알림 채널</label>
                  <Dropdown
                    theme="light"
                    value={settings.levelupChannelId || ""}
                    onChange={(v) => setSettings({ ...settings, levelupChannelId: v })}
                    options={[
                      { value: "", label: "알림 끄기" },
                      ...guildChannels.filter((c) => c.type === "text").map((c) => ({ value: c.id, label: `# ${c.name}` })),
                    ]}
                  />
                  <p className={fieldNote}>레벨업 시 메시지를 보낼 채널</p>
                </div>
                <div>
                  <label className={labelClass}>알림 문구</label>
                  <textarea rows={2} value={settings.levelupMessage} onChange={(e) => setSettings({ ...settings, levelupMessage: e.target.value })}
                    className={`${inputClass} resize-none`} />
                  <p className={fieldNote}>
                    <span className="text-[#3a3a3a]">{"{user}"}</span> 멘션 · <span className="text-[#3a3a3a]">{"{level}"}</span> 도달 레벨 · <span className="text-[#3a3a3a]">{"{xp}"}</span> 누적 XP · 디스코드 마크다운(**굵게**) 사용 가능
                  </p>
                </div>
              </div>
            </section>
            )}

            {sub === "rolegrant" && (
            <section>
              <SectionHead no="04" title="역할 지급 알림" />
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>알림 사용</label>
                  <Toggle
                    on={settings.roleGrantEnabled !== false}
                    onClick={() => setSettings({ ...settings, roleGrantEnabled: settings.roleGrantEnabled === false })}
                    onLabel="사용 중"
                    offLabel="사용 안 함"
                  />
                </div>
                <div className={`space-y-4 ${settings.roleGrantEnabled === false ? "opacity-40 pointer-events-none" : ""}`}>
                  <div>
                    <label className={labelClass}>알림 채널</label>
                    <Dropdown
                      theme="light"
                      value={settings.roleGrantChannelId || ""}
                      onChange={(v) => setSettings({ ...settings, roleGrantChannelId: v })}
                      options={[
                        { value: "", label: "레벨업 알림 채널과 동일" },
                        ...guildChannels.filter((c) => c.type === "text").map((c) => ({ value: c.id, label: `# ${c.name}` })),
                      ]}
                    />
                    <p className={fieldNote}>레벨 보상 역할이 지급됐을 때 메시지를 보낼 채널</p>
                  </div>
                  <div>
                    <label className={labelClass}>알림 문구</label>
                    <textarea rows={2} value={settings.roleGrantMessage || ""} onChange={(e) => setSettings({ ...settings, roleGrantMessage: e.target.value })}
                      className={`${inputClass} resize-none`} />
                    <p className={fieldNote}>
                      <span className="text-[#3a3a3a]">{"{user}"}</span> 멘션 · <span className="text-[#3a3a3a]">{"{role}"}</span> 지급된 역할명 · <span className="text-[#3a3a3a]">{"{level}"}</span> 도달 레벨
                    </p>
                  </div>
                </div>
              </div>
            </section>
            )}

            {/* 설정 항목이 많아 스크롤 끝까지 내려가지 않아도 저장할 수 있게 아래에 붙여 둔다 */}
            <div className="sticky bottom-0 -mx-6 mt-12 px-6 py-4 bg-[#f4f3f2]/95 backdrop-blur border-t border-black/10 flex items-center justify-between gap-4">
              <span className="text-[11px] font-bold text-[#8a8a8a]">봇에는 1분 이내 자동 반영됩니다.</span>
              <Btn type="submit" variant="primary" className="shrink-0">저장</Btn>
            </div>
          </form>
          </Reveal>
        ) : loadingRow)}

        {/* ═══════════ 역할 ═══════════ */}
        {tab === "roles" && sub === "reward" && (
          <Reveal>
          <section>
            <SectionHead no="01" title={`레벨 보상 역할 (${configs.length})`} right={
              <Btn variant="ghost" onClick={() => { setRoleForm(EMPTY_ROLE); openFormAt("role"); }}>＋ 추가</Btn>
            } />

            <FormPanel
              open={isFormOpen("role")}
              panelRef={formRef}
              title={roleForm.roleId ? "역할 수정" : "역할 추가"}
              saveLabel="저장"
              onSubmit={saveRole}
              onCancel={() => { setRoleForm(EMPTY_ROLE); closeForm(); }}
            >
              <div className="mb-4">
                <label className={labelClass}>디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
                <Dropdown
                  theme="light"
                  value={roleForm.roleId}
                  onChange={(v) => setRoleForm({ ...roleForm, roleId: v })}
                  placeholder="역할을 선택하세요"
                  options={roleOptions(grantableRoles)}
                />
                <p className={fieldNote}>디스코드가 관리하는 역할(서버 부스트 등)은 봇이 지급할 수 없어 목록에 없습니다</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>지급 레벨 (선택)</label>
                  <input type="number" min={1} max={1000} placeholder="예: 100" value={roleForm.rewardLevel} onChange={(e) => setRoleForm({ ...roleForm, rewardLevel: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>비우면 Boost 효과만 적용</p>
                </div>
                <div>
                  <label className={labelClass}>채팅/음성 Boost XP</label>
                  <input type="number" min={0} placeholder="예: 300" value={roleForm.buffXp} onChange={(e) => setRoleForm({ ...roleForm, buffXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>보유자의 XP 지급마다 추가</p>
                </div>
                <div>
                  <label className={labelClass}>출석 Boost XP</label>
                  <input type="number" min={0} placeholder="예: 7000" value={roleForm.attendBuffXp} onChange={(e) => setRoleForm({ ...roleForm, attendBuffXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>출석체크 시 추가 지급</p>
                </div>
              </div>
              {roleForm.exclusive && (
                <p className={fieldNote}>이 역할은 티어 사다리(등급 역할)로 저장돼 있습니다 — 승급하면 아래 티어 역할이 자동 회수됩니다.</p>
              )}
            </FormPanel>

            {isLoading ? loadingRow
              : configs.length === 0 ? <EmptyRow>설정된 역할이 없습니다.</EmptyRow>
              : (
              <ListFrame>
                {configs.map((c) => {
                  const role = guildRoles.find((r) => r.id === c.roleId);
                  return (
                    <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center md:gap-4">
                      <div className="flex items-center gap-2.5 md:w-48 shrink-0 min-w-0 mb-2 md:mb-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }}></span>
                        <span className="text-sm font-bold text-[#131313] truncate">{c.roleName || role?.name || c.roleId}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        {c.rewardLevel != null && <span className="text-[11px] font-bold text-[#e91e3f]">Lv.{c.rewardLevel} 도달 시 지급</span>}
                        {c.exclusive && <span className="text-[10px] font-black text-[#5a5a5a] border border-black/10 rounded-full px-2 py-0.5">등급 역할</span>}
                        {c.buffXp > 0 && <span className="text-[11px] font-bold text-[#5a5a5a]">채팅/음성 +{c.buffXp.toLocaleString()}</span>}
                        {c.attendBuffXp > 0 && <span className="text-[11px] font-bold text-[#5a5a5a]">출석 +{c.attendBuffXp.toLocaleString()}</span>}
                        {c.rewardLevel == null && !c.buffXp && !c.attendBuffXp && <span className="text-[11px] text-[#5a5a5a]">효과 없음</span>}
                      </div>
                      <div className="flex gap-4 shrink-0 mt-2 md:mt-0">
                        <button onClick={() => {
                          // exclusive 는 폼에 칸이 없다 — 옮겨 담지 않으면 티어 역할을 수정할 때 조용히 풀린다
                          setRoleForm({
                            roleId: c.roleId,
                            rewardLevel: c.rewardLevel == null ? "" : String(c.rewardLevel),
                            buffXp: c.buffXp ? String(c.buffXp) : "",
                            attendBuffXp: c.attendBuffXp ? String(c.attendBuffXp) : "",
                            exclusive: !!c.exclusive,
                          });
                          openFormAt("role");
                        }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none">수정</button>
                        <button onClick={() => setDeleteConfirm({ kind: "role", id: c._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none">삭제</button>
                      </div>
                    </div>
                  );
                })}
              </ListFrame>
            )}
          </section>
          </Reveal>
        )}

        {tab === "roles" && sub === "tier" && (
          <Reveal>
          <section>
            <SectionHead no="02" title="음성 티어 역할 일괄 연결" />
            <Note>
              연결하면 지급 레벨이 자동으로 채워지고, <b className="text-[#131313]">배타 모드</b>로 저장돼 승급 시 아래 티어 역할이 자동 회수됩니다.
              역할에 <b className="text-[#131313]">&ldquo;따로 표시(hoist)&rdquo;</b>를 켜 두면 멤버 목록이 티어별로 묶입니다.
            </Note>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(VOICE_TIERS as any[]).map((t) => (
                <div key={t.key} className="flex items-center gap-3 py-2">
                  <span aria-hidden className="shrink-0 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: t.c }}></span>
                  <span className="shrink-0 w-24 text-sm font-bold truncate" style={{ color: t.c }}>{t.name}</span>
                  <span className="shrink-0 w-16 text-[11px] font-black text-[#8a8a8a] tabular-nums">Lv.{t.min}+</span>
                  <select
                    value={tierMap[t.key] || ""}
                    onChange={(e) => setTierMap({ ...tierMap, [t.key]: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent border border-black/10 rounded-lg px-3 py-2.5 text-xs text-[#131313] outline-none focus:border-[#e91e3f] transition-colors"
                  >
                    <option value="" className="bg-[#ffffff]">— 역할 선택 —</option>
                    {grantableRoles.map((r) => (
                      <option key={r.id} value={r.id} className="bg-[#ffffff]">{r.name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 mt-7">
              <Btn variant="primary" onClick={saveTierRoles} disabled={tierSaving}>
                {tierSaving ? "연결 중…" : "티어 역할 연결"}
              </Btn>
              <Btn variant="ghost" onClick={() => setTierMap({})}>선택 초기화</Btn>
            </div>
          </section>
          </Reveal>
        )}

        {tab === "roles" && sub === "inventory" && (
          <Reveal>
          <section>
            <SectionHead no="03" title={`인벤토리 표기 (${invRoles.length})`} right={
              <Btn variant="ghost" onClick={() => { setInvForm(EMPTY_INV); openFormAt("inv"); }}>＋ 추가</Btn>
            } />
            <Note>
              상점 상품·레벨 보상 역할은 아래 &lsquo;자동으로 잡히는 역할&rsquo;로 이미 잡히므로, 여기에는
              <b className="text-[#131313]"> 디스코드에서만 주던 역할</b>(칭호·알림 구독·특전 권한 등)만 등록합니다.
            </Note>

            <FormPanel
              open={isFormOpen("inv")}
              panelRef={formRef}
              title={invForm.id ? "인벤토리 역할 수정" : "인벤토리 역할 등록"}
              saveLabel={invForm.id ? "수정 저장" : "등록"}
              onSubmit={saveInvRole}
              onCancel={() => { setInvForm(EMPTY_INV); closeForm(); }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div className="md:col-span-2">
                  <label className={labelClass}>디스코드 역할 <span className="text-[#e91e3f]">*</span></label>
                  <Dropdown
                    theme="light"
                    value={invForm.roleId}
                    onChange={(v) => setInvForm({ ...invForm, roleId: v })}
                    placeholder="역할을 선택하세요"
                    options={roleOptions(guildRoles)}
                  />
                </div>

                <div>
                  <label className={labelClass}>인벤토리 표시 이름</label>
                  <input value={invForm.label} onChange={(e) => setInvForm({ ...invForm, label: e.target.value })}
                    placeholder="비우면 디스코드 역할 이름 그대로" maxLength={40} className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>분류</label>
                  <FilterChips
                    options={[{ v: "perk", l: "특전" }, { v: "title", l: "칭호" }, { v: "notify", l: "알림" }, { v: "etc", l: "기타" }]}
                    value={invForm.category}
                    onChange={(v) => setInvForm({ ...invForm, category: v })}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>설명 (선택)</label>
                  <input value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })}
                    placeholder="예: 상품 소식 알림을 받습니다" maxLength={120} className={inputClass} />
                </div>

                <div>
                  <label className={labelClass}>표시 순서</label>
                  <input type="number" min={0} value={invForm.sortOrder} onChange={(e) => setInvForm({ ...invForm, sortOrder: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>작을수록 위에 표시됩니다.</p>
                </div>

                <div>
                  <label className={labelClass}>유저 화면 표시</label>
                  <Toggle
                    on={!!invForm.visible}
                    onClick={() => setInvForm({ ...invForm, visible: !invForm.visible })}
                    onLabel="표시함"
                    offLabel="숨김"
                  />
                </div>
              </div>
            </FormPanel>

            {invRoles.length === 0 ? (
              <EmptyRow>아직 등록된 역할이 없습니다.</EmptyRow>
            ) : (
              <ListFrame>
                {invRoles.map((r) => (
                  <div key={r._id} className="py-4 flex items-center gap-4">
                    <span className="shrink-0 w-8 text-center text-xs font-black text-[#a3a3a3] tabular-nums">{r.sortOrder}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-bold ${r.visible ? "text-[#131313]" : "text-[#a3a3a3] line-through"}`}>{r.label || r.roleName}</p>
                        <span className="text-[10px] font-black text-[#e91e3f] border border-[#e91e3f]/30 rounded-full px-2 py-0.5">
                          {INV_CATEGORY[r.category] || "기타"}
                        </span>
                        {!r.visible && <span className="text-[10px] font-black text-[#a3a3a3] border border-black/10 rounded-full px-2 py-0.5">숨김</span>}
                      </div>
                      <p className="text-[11px] text-[#8a8a8a] mt-1">
                        {r.roleName}
                        {r.description ? ` · ${r.description}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-3">
                      <button
                        onClick={() => {
                          setInvForm({ id: r._id, roleId: r.roleId, label: r.label || "", category: r.category || "perk", description: r.description || "", sortOrder: r.sortOrder ?? 0, visible: r.visible !== false });
                          openFormAt("inv");
                        }}
                        className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => setDeleteConfirm({ kind: "inventory", id: r._id })}
                        className="text-[11px] font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ))}
              </ListFrame>
            )}

            <div className="mt-12">
              <GroupHead
                title="자동으로 잡히는 역할"
                count={autoRoles.length}
                right="등록하지 않아도 인벤토리에 표시됩니다"
              />
              <Note>
                표시 이름·분류·설명을 따로 주고 싶을 때만 &lsquo;표시 설정&rsquo;으로 같은 역할을 등록하면, 그 설정이 우선 적용됩니다.
              </Note>

              {autoRoles.length === 0 ? (
                <EmptyRow>자동으로 잡히는 역할이 없습니다.</EmptyRow>
              ) : (
                <ListFrame>
                  {autoRoles.map((r) => (
                    <div key={r.key} className="py-4 flex items-center gap-4">
                      <span className={`shrink-0 w-[52px] text-center text-[10px] font-black rounded-full px-2 py-1 border ${ORIGIN_STYLE[r.origin]}`}>
                        {ORIGIN_LABEL[r.origin]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-bold ${r.muted || r.overridden ? "text-[#a3a3a3]" : "text-[#131313]"}`}>{r.name}</p>
                          {r.muted && <span className="text-[10px] font-black text-[#a3a3a3] border border-black/10 rounded-full px-2 py-0.5">판매 중지</span>}
                          {r.overridden && <span className="text-[10px] font-black text-[#8a8a8a] border border-black/10 rounded-full px-2 py-0.5">위에 등록됨 · 그 설정 적용</span>}
                          {!r.exists && <span className="text-[10px] font-black text-[#e91e3f] border border-[#e91e3f]/30 rounded-full px-2 py-0.5">역할 없음</span>}
                        </div>
                        <p className="text-[11px] text-[#8a8a8a] mt-1">
                          {r.roleName || "디스코드에서 삭제된 역할일 수 있습니다"}
                          {r.note ? ` · ${r.note}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {r.overridden ? (
                          <span className="text-[11px] font-bold text-[#c4c4c4]">—</span>
                        ) : (
                          <button
                            onClick={() => { setInvForm({ ...EMPTY_INV, roleId: r.roleId, label: r.name }); openFormAt("inv"); }}
                            className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                          >
                            표시 설정
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </ListFrame>
              )}
            </div>
          </section>
          </Reveal>
        )}

        {tab === "roles" && sub === "protected" && (
          <Reveal>
          <section>
            <SectionHead no="04" title="시즌 전환 보호 역할" />
            <Note>
              시즌 전환으로 디스코드 역할을 뗄 때도 <b className="text-[#131313]">절대 제외</b>할 역할 —
              어린이·청소년·어른 같은 등급 역할을 넣습니다.
            </Note>
            {!settings ? loadingRow : (
            <form onSubmit={saveSettings}>
              {/* 여러 개를 고르는 자리라 항목을 눌러도 목록이 닫히지 않는다 — 공용 Dropdown 은 단일 선택용이다 */}
              <div className={`mb-4 relative ${isProtectedRoleOpen ? "z-50" : ""}`}>
                <label className={labelClass}>보호할 역할 (복수 선택)</label>
                <button type="button" onClick={() => setIsProtectedRoleOpen(!isProtectedRoleOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                  {protectedRoleIds.length > 0
                    ? <span className="font-bold">{protectedRoleIds.length}개 역할 선택됨</span>
                    : <span className="text-[#5a5a5a]">역할을 선택하세요</span>}
                  <span className="text-[10px] text-[#8a8a8a]">▼</span>
                </button>
                {isProtectedRoleOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsProtectedRoleOpen(false)}></div>
                    <div className="absolute top-full left-0 w-full mt-1.5 bg-[#ffffff] border border-black/10 rounded-xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(0,0,0,0.28)] z-50 max-h-64 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#e6e3de]">
                      {guildRoles.map((r) => {
                        const picked = protectedRoleIds.includes(r.id);
                        return (
                          <button key={r.id} type="button" onClick={() => toggleProtectedRole(r.id)}
                            className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2.5 transition-colors outline-none focus:outline-none ${picked ? "bg-[#e91e3f]/15 text-[#e91e3f] font-bold" : "text-[#4b4b4b] hover:bg-black/5"}`}>
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                            <span className="truncate">{r.name}</span>
                            {picked && <span className="ml-auto text-[10px] shrink-0">선택됨</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <p className={fieldNote}>선택한 역할은 상품으로 팔렸더라도 시즌 전환 대상에서 제외됩니다</p>
              </div>

              {protectedRoleIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {protectedRoleIds.map((id) => {
                    const r = guildRoles.find((g) => g.id === id);
                    return (
                      <span key={id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-black/10 bg-black/[0.03] text-xs font-bold text-[#131313]">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r?.color || "#99aab5" }}></span>
                        {/* 디스코드에서 지워진 역할도 ID 로 남겨 둔다 — 조용히 사라지면 무엇이 빠졌는지 알 수 없다 */}
                        <span className="truncate max-w-[14rem]">{r?.name || `삭제된 역할 (${id})`}</span>
                        <button type="button" onClick={() => toggleProtectedRole(id)} className="text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none">✕</button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Btn type="submit" variant="primary">저장</Btn>
                <span className="text-[11px] font-bold text-[#8a8a8a]">봇에는 1분 이내 자동 반영됩니다.</span>
              </div>
            </form>
            )}
          </section>
          </Reveal>
        )}

        {/* ═══════════ 콘텐츠 ═══════════ */}
        {tab === "content" && sub === "channels" && (
          <Reveal>
          <section>
            <SectionHead no="01" title={`채널 정책 (${channelConfigs.length})`} right={
              <Btn variant="ghost" onClick={() => { setChForm(EMPTY_CHANNEL); openFormAt("channel"); }}>＋ 추가</Btn>
            } />

            <FormPanel
              open={isFormOpen("channel")}
              panelRef={formRef}
              title={chForm.channelId ? "채널 정책 수정" : "채널 정책 추가"}
              saveLabel="저장"
              onSubmit={saveChannel}
              onCancel={() => { setChForm(EMPTY_CHANNEL); closeForm(); }}
            >
              <div className="mb-4">
                <label className={labelClass}>디스코드 채널 · 카테고리 <span className="text-[#e91e3f]">*</span></label>
                <Dropdown
                  theme="light"
                  value={chForm.channelId}
                  onChange={(v) => setChForm({ ...chForm, channelId: v })}
                  placeholder="채널 또는 카테고리를 선택하세요"
                  options={channelOptions}
                />
                <p className={fieldNote}>카테고리를 선택하면 하위 채널 전체에 적용됩니다</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Boost XP</label>
                  <input type="number" min={0} placeholder="예: 500" value={chForm.boostXp} onChange={(e) => setChForm({ ...chForm, boostXp: e.target.value })} disabled={chForm.excluded} className={`${inputClass} disabled:opacity-40`} />
                  <p className={fieldNote}>이 채널에서의 XP 지급마다 추가</p>
                </div>
                <div>
                  <label className={labelClass}>XP 지급 제외</label>
                  <Toggle
                    on={!!chForm.excluded}
                    onClick={() => setChForm({ ...chForm, excluded: !chForm.excluded })}
                    onLabel="지급 안 함"
                    offLabel="지급함 (기본)"
                  />
                  <p className={fieldNote}>봇 명령어 채널 등에 사용</p>
                </div>
              </div>
            </FormPanel>

            {isLoading ? loadingRow
              : channelConfigs.length === 0 ? <EmptyRow>설정된 채널이 없습니다.</EmptyRow>
              : (
              <ListFrame>
                {channelConfigs.map((c) => {
                  const live = guildChannels.find((g) => g.id === c.channelId);
                  return (
                    <div key={c._id} className="py-4 flex flex-col md:flex-row md:items-center md:gap-4">
                      <div className="flex items-center gap-2.5 md:w-56 shrink-0 min-w-0 mb-2 md:mb-0">
                        <span className="text-[#8a8a8a] text-xs shrink-0">{CHANNEL_TYPE_ICON[c.channelType] || "#"}</span>
                        <span className="text-sm font-bold text-[#131313] truncate">{live?.name || c.channelName || c.channelId}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1">
                        {c.excluded ? <span className="text-[11px] font-bold text-red-600">XP 지급 제외</span>
                          : c.boostXp > 0 ? <span className="text-[11px] font-bold text-[#e91e3f]">+{c.boostXp.toLocaleString()} XP</span>
                          : <span className="text-[11px] text-[#5a5a5a]">효과 없음</span>}
                        {c.channelType === "category" && <span className="text-[11px] font-bold text-[#8a8a8a]">하위 채널 전체</span>}
                      </div>
                      <div className="flex gap-4 shrink-0 mt-2 md:mt-0">
                        <button onClick={() => { setChForm({ channelId: c.channelId, boostXp: c.boostXp ? String(c.boostXp) : "", excluded: !!c.excluded }); openFormAt("channel"); }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none">수정</button>
                        <button onClick={() => setDeleteConfirm({ kind: "channel", id: c._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none">삭제</button>
                      </div>
                    </div>
                  );
                })}
              </ListFrame>
            )}
          </section>
          </Reveal>
        )}

        {tab === "content" && sub === "quests" && (
          <Reveal>
          <section>
            <SectionHead no="02" title={`퀘스트 (${quests.length})`} right={
              <div className="flex gap-2">
                <Btn variant="ghost" onClick={openPicks}>노출 방식</Btn>
                <Btn variant="ghost" onClick={() => { setQuestForm(EMPTY_QUEST); openFormAt("quest"); }}>＋ 추가</Btn>
              </div>
            } />

            <FormPanel
              open={isFormOpen("questPick")}
              panelRef={formRef}
              title="주기별 노출 방식"
              saveLabel="노출 방식 저장"
              onSubmit={savePicks}
              onCancel={cancelPicks}
            >
              <Note>
                뽑기는 날짜로 고정돼 같은 주기 안에서는 모든 유저가 같은 퀘스트를 보며, 뽑히지 않은 퀘스트는 보상도 받을 수 없습니다.
              </Note>
              {/* 설정 문서를 통째로 덮어쓰기 때문에, 아직 못 불러왔으면 손대지 못하게 막는다 */}
              {!settings ? loadingRow : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6">
                {QUEST_PICK_FIELDS.map((f) => {
                  const total = quests.filter((q) => (q.period || "daily") === f.period && q.enabled).length;
                  const pick = Number(settings?.[f.key] ?? 0);
                  return (
                    <div key={f.key}>
                      <label className={labelClass}>{PERIOD_LABEL[f.period]} 노출 개수</label>
                      <input type="number" min={0} max={20} value={settings?.[f.key] ?? 0}
                        onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} className={inputClass} />
                      <p className={fieldNote}>
                        {pick > 0
                          ? `활성 ${total}개 중 ${Math.min(pick, total)}개를 ${f.every}마다 새로 뽑습니다`
                          : `활성 ${total}개를 전부 보여줍니다`}
                      </p>
                    </div>
                  );
                })}
              </div>
              )}
            </FormPanel>

            <FormPanel
              open={isFormOpen("quest")}
              panelRef={formRef}
              title={questForm.id ? "퀘스트 수정" : "퀘스트 추가"}
              saveLabel={questForm.id ? "수정 저장" : "퀘스트 등록"}
              onSubmit={saveQuest}
              onCancel={() => { setQuestForm(EMPTY_QUEST); closeForm(); }}
            >
              <Note>
                진행도는 봇이 남긴 XP 지급 로그로 판정하므로, 봇이 지급하는 활동(채팅·음성·출석)만 조건으로 쓸 수 있습니다.
                출석 퀘스트는 기본 제공되며 기준 시간과 보상은 <b className="text-[#131313]">정책 › 지급량 · 주기</b>에서 조정합니다.
              </Note>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
                <div className="md:col-span-2">
                  <label className={labelClass}>퀘스트 이름</label>
                  <input value={questForm.name} onChange={(e) => setQuestForm({ ...questForm, name: e.target.value })}
                    placeholder="예: 오늘의 수다" maxLength={40} className={inputClass} />
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>설명 (선택)</label>
                  <input value={questForm.desc} onChange={(e) => setQuestForm({ ...questForm, desc: e.target.value })}
                    placeholder="예: 채팅으로 XP를 5번 받으세요" maxLength={120} className={inputClass} />
                  <p className={fieldNote}>유저 화면에서 퀘스트 이름 아래 회색으로 표시됩니다.</p>
                </div>

                <div className="md:col-span-2">
                  <label className={labelClass}>초기화 주기</label>
                  <FilterChips
                    options={[{ v: "daily", l: "일일" }, { v: "weekly", l: "주간" }, { v: "monthly", l: "월간" }]}
                    value={questForm.period}
                    onChange={(v) => setQuestForm({ ...questForm, period: v })}
                  />
                  <p className={fieldNote}>진행도와 보상 수령이 이 주기마다 초기화됩니다 (KST 기준) — 일일 매일 자정 · 주간 매주 월요일 · 월간 매월 1일.</p>
                </div>

                <div>
                  <label className={labelClass}>측정 대상</label>
                  <FilterChips
                    options={[{ v: "chat", l: "채팅" }, { v: "voice", l: "음성" }, { v: "attend", l: "출석" }, { v: "any", l: "전체" }]}
                    value={questForm.reason}
                    onChange={(v) => setQuestForm({ ...questForm, reason: v })}
                  />
                  <p className={fieldNote}>어떤 활동의 지급 로그를 셀지 고릅니다.</p>
                </div>

                <div>
                  <label className={labelClass}>측정 방식</label>
                  <FilterChips
                    options={[{ v: "count", l: "지급 횟수" }, { v: "xp", l: "XP 합계" }, { v: "minute", l: "접속 시간" }]}
                    value={questForm.metric}
                    onChange={(v) => setQuestForm({ ...questForm, metric: v })}
                  />
                  <p className={fieldNote}>
                    {questForm.metric === "xp"
                      ? "받은 XP의 합계로 판정합니다."
                      : questForm.metric === "minute"
                      ? `음성 채널에 머문 시간(분)으로 판정합니다. 지급 주기 ${Math.max(1, Math.round((settings?.voiceIntervalSec ?? 300) / 60))}분마다 1분 단위로 쌓입니다.`
                      : "XP를 받은 횟수로 판정합니다. (음성은 1회 = 지급 주기)"}
                  </p>
                </div>

                <div>
                  <label className={labelClass}>목표치</label>
                  <input type="number" min={1} value={questForm.target} onChange={(e) => setQuestForm({ ...questForm, target: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>
                    {questForm.metric === "xp"
                      ? "달성에 필요한 XP 합계"
                      : questForm.metric === "minute"
                      ? "달성에 필요한 접속 시간 (분) — 예: 2시간이면 120"
                      : "달성에 필요한 지급 횟수"}
                  </p>
                </div>

                {/* 보상 두 칸은 한 줄로 묶는다 — 바깥 격자에 그냥 얹으면 XP 와 POINT 가 서로 다른 줄로 갈라진다 */}
                <div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>보상 XP</label>
                      <input type="number" min={0} value={questForm.rewardXp} onChange={(e) => setQuestForm({ ...questForm, rewardXp: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>보상 POINT</label>
                      <input type="number" min={0} value={questForm.rewardPoint} onChange={(e) => setQuestForm({ ...questForm, rewardPoint: e.target.value })} className={inputClass} />
                    </div>
                  </div>
                  <p className={fieldNote}>POINT 는 등급이 높을수록 배율이 붙어 더 지급됩니다. 둘 다 0이면 보상 없는 &lsquo;목표&rsquo;가 됩니다.</p>
                </div>

                <div>
                  <label className={labelClass}>표시 순서</label>
                  <input type="number" min={0} value={questForm.order} onChange={(e) => setQuestForm({ ...questForm, order: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>작을수록 위에 표시됩니다.</p>
                </div>

                <div>
                  <label className={labelClass}>유저 화면 표시</label>
                  <Toggle
                    on={!!questForm.enabled}
                    onClick={() => setQuestForm({ ...questForm, enabled: !questForm.enabled })}
                    onLabel="활성화됨 — 유저에게 표시"
                    offLabel="비활성 — 숨김"
                  />
                </div>
              </div>
            </FormPanel>

            {quests.length === 0 ? (
              <EmptyRow>아직 등록된 퀘스트가 없습니다. ＋ 추가로 만들어 주세요.</EmptyRow>
            ) : (
              <div className="space-y-12">
                {QUEST_PICK_FIELDS.map((f) => {
                  const rows = quests.filter((q) => (q.period || "daily") === f.period);
                  const on = rows.filter((q) => q.enabled).length;
                  const pick = Number(settings?.[f.key] ?? 0);
                  return (
                    <div key={f.period}>
                      <GroupHead
                        title={`${PERIOD_LABEL[f.period]} 퀘스트`}
                        count={rows.length}
                        right={rows.length === 0
                          ? f.every + " 초기화"
                          : pick > 0
                          ? `${f.every}마다 활성 ${on}개 중 ${Math.min(pick, on)}개 무작위`
                          : `활성 ${on}개 전부 노출 · ${f.every} 초기화`}
                      />
                      {rows.length === 0 ? (
                        <p className="py-8 text-center text-[12px] text-[#c4c4c4]">
                          등록된 {PERIOD_LABEL[f.period]} 퀘스트가 없습니다.
                        </p>
                      ) : (
                        <div className="divide-y divide-black/[0.06]">
                          {rows.map((q) => (
                            <div key={q._id} className="py-4 flex items-center gap-4">
                              <span className="shrink-0 w-8 text-center text-xs font-black text-[#a3a3a3] tabular-nums">{q.order}</span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className={`text-sm font-bold ${q.enabled ? "text-[#131313]" : "text-[#8a8a8a] line-through"}`}>{q.name}</p>
                                  {!q.enabled && <span className="text-[10px] font-black text-[#8a8a8a] border border-black/10 rounded-full px-2 py-0.5">비활성</span>}
                                </div>
                                <p className="text-[11px] text-[#8a8a8a] mt-1 tabular-nums">
                                  {(REASON_LABEL[q.reason] || "전체")}{" "}
                                  {q.metric === "xp" ? "XP" : q.metric === "minute" ? "접속" : "횟수"}{" "}
                                  {q.target.toLocaleString()}{q.metric === "minute" ? "분" : ""} 달성
                                  {q.desc ? ` · ${q.desc}` : ""}
                                </p>
                              </div>
                              <span className="shrink-0 flex items-center gap-2 text-sm font-black tabular-nums">
                                {q.rewardXp > 0 && <span className="text-[#e91e3f]">+{q.rewardXp.toLocaleString()} XP</span>}
                                {q.rewardXp > 0 && (q.rewardPoint || 0) > 0 && <span className="text-[#c4c4c4]">·</span>}
                                {(q.rewardPoint || 0) > 0 && <span className="text-[#3f9e93]">+{Number(q.rewardPoint).toLocaleString()} P</span>}
                                {q.rewardXp <= 0 && (q.rewardPoint || 0) <= 0 && <span className="text-[#a3a3a3]">보상 없음</span>}
                              </span>
                              <div className="shrink-0 flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    setQuestForm({ id: q._id, name: q.name, desc: q.desc || "", period: q.period || "daily", reason: q.reason, metric: q.metric, target: q.target, rewardXp: q.rewardXp, rewardPoint: q.rewardPoint || 0, enabled: q.enabled, order: q.order });
                                    openFormAt("quest");
                                  }}
                                  className="text-[11px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus:outline-none"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm({ kind: "quest", id: q._id })}
                                  className="text-[11px] font-bold text-[#a3a3a3] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          </Reveal>
        )}

        {tab === "content" && sub === "boosts" && (
          <Reveal>
          <section>
            <SectionHead no="03" title={`기간제 부스트 (${boosts.length})`} right={
              <Btn variant="ghost" onClick={() => { setBoostForm(EMPTY_BOOST); openFormAt("boost"); }}>＋ 추가</Btn>
            } />

            <FormPanel
              open={isFormOpen("boost")}
              panelRef={formRef}
              title={boostForm.id ? "부스트 수정" : "부스트 추가"}
              saveLabel={boostForm.id ? "수정 저장" : "부스트 등록"}
              onSubmit={saveBoost}
              onCancel={() => { setBoostForm(EMPTY_BOOST); closeForm(); }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>부스트 이름</label>
                  <input type="text" placeholder="예: 주말 2배 이벤트" value={boostForm.name} onChange={(e) => setBoostForm({ ...boostForm, name: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>대상 역할</label>
                  <Dropdown
                    theme="light"
                    value={boostForm.targetRoleId}
                    onChange={(v) => setBoostForm({ ...boostForm, targetRoleId: v })}
                    options={[{ value: "", label: "서버 전체" }, ...roleOptions(guildRoles)]}
                  />
                  <p className={fieldNote}>역할을 고르면 해당 역할 보유자에게만 적용</p>
                </div>
                <div>
                  <label className={labelClass}>대상 채널 · 카테고리</label>
                  <Dropdown
                    theme="light"
                    value={boostForm.targetChannelId}
                    onChange={(v) => setBoostForm({ ...boostForm, targetChannelId: v })}
                    options={[{ value: "", label: "모든 채널" }, ...channelOptions]}
                  />
                  <p className={fieldNote}>카테고리 선택 시 하위 채널 전체에 적용 · 역할과 함께 지정하면 둘 다 만족해야 발동</p>
                </div>
                <div>
                  <label className={labelClass}>추가 XP <span className="text-[#e91e3f]">*</span></label>
                  <input type="number" min={1} placeholder="예: 1000" value={boostForm.boostXp} onChange={(e) => setBoostForm({ ...boostForm, boostXp: e.target.value })} className={inputClass} />
                  <p className={fieldNote}>채팅·음성 지급 1회당 추가</p>
                </div>
                <div>
                  <label className={labelClass}>시작 <span className="text-[#e91e3f]">*</span></label>
                  <input type="datetime-local" value={boostForm.startAt} onChange={(e) => setBoostForm({ ...boostForm, startAt: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>종료 <span className="text-[#e91e3f]">*</span></label>
                  <input type="datetime-local" value={boostForm.endAt} onChange={(e) => setBoostForm({ ...boostForm, endAt: e.target.value })} className={inputClass} />
                </div>
              </div>
            </FormPanel>

            {isLoading ? loadingRow
              : boosts.length === 0 ? <EmptyRow>등록된 부스트가 없습니다.</EmptyRow>
              : (
              <ListFrame>
                {boosts.map((b) => {
                  const now = Date.now();
                  const start = new Date(b.startAt).getTime();
                  const end = new Date(b.endAt).getTime();
                  const state = now < start ? "예정" : now > end ? "종료" : "진행 중";
                  return (
                    <div key={b._id} className="py-4 flex flex-col md:flex-row md:items-center md:gap-4">
                      <div className="flex items-center gap-2.5 md:w-52 shrink-0 min-w-0 mb-2 md:mb-0">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded shrink-0 ${state === "진행 중" ? "bg-[#e91e3f] text-white" : state === "예정" ? "bg-black/10 text-[#4b4b4b]" : "bg-transparent text-[#5a5a5a] border border-black/10"}`}>{state}</span>
                        <span className="text-sm font-bold text-[#131313] truncate">{b.name}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-[#e91e3f]">+{(b.boostXp || 0).toLocaleString()} XP</span>
                        <span className="text-[11px] font-bold text-[#5a5a5a]">{b.targetRoleName || "전체 유저"}</span>
                        <span className="text-[11px] font-bold text-[#5a5a5a]">{b.targetChannelName ? `${CHANNEL_TYPE_ICON[b.targetChannelType] || "#"} ${b.targetChannelName}` : "모든 채널"}</span>
                        <span className="text-[11px] text-[#8a8a8a]">{fmtDateTime(b.startAt)} ~ {fmtDateTime(b.endAt)}</span>
                      </div>
                      <div className="flex gap-4 shrink-0 mt-2 md:mt-0">
                        <button onClick={() => { setBoostForm({ id: b._id, name: b.name, targetRoleId: b.targetRoleId || "", targetChannelId: b.targetChannelId || "", boostXp: String(b.boostXp), startAt: toLocalInput(b.startAt), endAt: toLocalInput(b.endAt) }); openFormAt("boost"); }} className="text-xs font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors outline-none focus:outline-none">수정</button>
                        <button onClick={() => setDeleteConfirm({ kind: "boost", id: b._id })} className="text-xs font-bold text-[#8a8a8a] hover:text-[#e91e3f] transition-colors outline-none focus:outline-none">삭제</button>
                      </div>
                    </div>
                  );
                })}
              </ListFrame>
            )}
          </section>
          </Reveal>
        )}

        {/* ═══════════ 지급 · 내역 ═══════════ */}
        {tab === "ledger" && sub === "grant" && (
          <Reveal>
          <section>
            <SectionHead no="01" title="XP 지급 · 회수" />
            <form onSubmit={submitGrant}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className={labelClass}>대상 <span className="text-[#e91e3f]">*</span></label>
                  <input type="text" value={grantForm.target} onChange={(e) => setGrantForm({ ...grantForm, target: e.target.value })}
                    placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
                  <p className={fieldNote}>XP 기록이 있는 유저만 검색됩니다</p>
                </div>
                <div>
                  <label className={labelClass}>지급 XP <span className="text-[#e91e3f]">*</span></label>
                  <input type="number" value={grantForm.amount} onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                    placeholder="예: 50000 (회수는 -50000)" className={inputClass} />
                  <p className={fieldNote}>음수를 넣으면 회수됩니다 (보유량을 넘지 않게 잘립니다)</p>
                </div>
              </div>

              <div className="mb-6">
                <label className={labelClass}>사유</label>
                <input type="text" value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                  placeholder="예: 이벤트 우승 보상" className={inputClass} />
                <p className={fieldNote}>비우면 &lsquo;관리자 지급&rsquo;으로 기록됩니다</p>
              </div>

              {Number(grantForm.amount) !== 0 && grantForm.amount !== "" && (
                <div className={`mb-6 px-4 py-3 rounded-lg border text-[12px] font-bold ${
                  Number(grantForm.amount) > 0 ? "border-[#e91e3f]/30 bg-[#e91e3f]/[0.06] text-[#e91e3f]" : "border-amber-500/30 bg-amber-500/[0.06] text-amber-700"
                }`}>
                  {Number(grantForm.amount) > 0
                    ? `${Number(grantForm.amount).toLocaleString()} XP 지급 — 레벨이 올라갈 수 있습니다`
                    : `${Math.abs(Number(grantForm.amount)).toLocaleString()} XP 회수 — 레벨이 내려갈 수 있습니다`}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Btn type="submit" variant="primary" disabled={isGranting}>{isGranting ? "처리 중..." : "지급"}</Btn>
                <Btn type="button" variant="danger" onClick={submitRemove} disabled={isGranting || !grantForm.amount}>XP 제거</Btn>
                <Btn type="button" variant="ghost" onClick={() => setConfirmAll(true)} disabled={isGranting || !grantForm.amount}>전체 유저에게 지급</Btn>
              </div>
            </form>
            <p className={fieldNote}>봇 큐에 쌓여 30초 이내에 반영되고(레벨도 함께 재계산), 봇이 꺼져 있으면 켜질 때 처리됩니다.</p>
          </section>
          </Reveal>
        )}

        {tab === "ledger" && sub === "logs" && (
          <Reveal>
          <section>
            {/* 두 출처의 건수는 세는 기준이 달라(봇=전체 검색 결과, 수동=최근 50건) 따로 적는다.
                지금 필터가 덮지 않는 쪽은 감춘다 — '채팅'을 보는 중에 '수동 37'이 남아 있으면 그 37건이 목록에 있는 줄 안다. */}
            <SectionHead no="02" title="지급 내역" right={
              <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums shrink-0">
                {ledgerFilter === "manual"
                  ? `수동 ${manualRows.length.toLocaleString()}`
                  : ledgerFilter === ""
                  ? `봇 ${logTotal.toLocaleString()} · 수동 ${manualRows.length.toLocaleString()}`
                  : `봇 ${logTotal.toLocaleString()}`}
              </span>
            } />
            <div className="mb-4">
              <input type="text" placeholder="유저 이름 검색" value={logQuery}
                onChange={(e) => { setLogQuery(e.target.value); setLogPage(0); }} className={`${inputClass} md:max-w-xs`} />
            </div>
            <FilterChips
              className="mb-3"
              options={[
                { v: "", l: "전체" },
                { v: "chat", l: "채팅" },
                { v: "voice", l: "음성" },
                { v: "attend", l: "출석" },
                { v: "manual", l: "수동" },
              ]}
              value={ledgerFilter}
              onChange={(v) => { setLedgerFilter(v); setLogPage(0); }}
            />
            <p className={`${fieldNote} mb-6`}>
              봇 기록은 <b className="text-[#131313]">60일까지만 보관</b>되고, 수동 기록은 최근 50건만 보여 줍니다.
            </p>

            {ledgerRows.length === 0 ? (
              <EmptyRow>표시할 지급 내역이 없습니다.</EmptyRow>
            ) : (
              <>
                <ListFrame>
                  {ledgerRows.map((r) => (
                    <div key={r.k} className="py-3 flex items-center gap-3">
                      <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded ${
                        r.src === "manual" ? "bg-[#e91e3f]/15 text-[#e91e3f]" : "bg-black/[0.06] text-[#5a5a5a]"
                      }`}>
                        {r.src === "manual" ? "수동" : "봇"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-[#131313] truncate max-w-[13rem]">{r.name}</span>
                          {/* 처리 상태는 수동 지급에만 있다 — 값이 비어 있어도 '대기'로 보여 줘야 큐에 남은 걸 알 수 있다 */}
                          {r.src === "manual" && (
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                              r.status === "paid" ? "bg-emerald-500/15 text-emerald-700"
                              : r.status === "failed" ? "bg-red-500/15 text-red-600"
                              : "bg-black/[0.06] text-[#5a5a5a]"}`}>
                              {r.status === "paid" ? "완료" : r.status === "failed" ? "실패" : "대기"}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#8a8a8a] mt-0.5 tabular-nums truncate">
                          {fmtDateTime(r.at)} · {r.note}
                          {r.channelName ? ` · #${r.channelName}` : ""}
                          {r.error ? ` · ${r.error}` : ""}
                        </p>
                      </div>
                      <span className={`shrink-0 text-sm font-black tabular-nums ${r.amount >= 0 ? "text-[#e91e3f]" : "text-amber-700"}`}>
                        {r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </ListFrame>

                {/* 쪽 넘김은 봇 로그 기준 — 수동 지급은 최근 50건이 전부라 나눌 쪽이 없다 */}
                {ledgerFilter !== "manual" && (
                  <div className="flex items-center justify-between mt-6">
                    <Btn variant="ghost" disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p - 1))}>이전</Btn>
                    <span className="text-[11px] font-bold text-[#5a5a5a]">{logPage + 1} / {Math.max(1, Math.ceil(logTotal / 50))}</span>
                    <Btn variant="ghost" disabled={(logPage + 1) * 50 >= logTotal} onClick={() => setLogPage((p) => p + 1)}>다음</Btn>
                  </div>
                )}
              </>
            )}
          </section>
          </Reveal>
        )}

        {tab === "ledger" && sub === "reset" && (
          <Reveal>
          <section>
            <SectionHead no="03" title="XP 초기화" />
            <Note>
              되돌릴 수 없습니다 — 레벨 보상 역할도 봇이 30초 이내에 함께 회수하며, ARCTIC에서 구매한 역할만 남습니다.
            </Note>
            <div className="mb-6 md:max-w-xs">
              <label className={labelClass}>대상</label>
              <input type="text" value={grantForm.target} onChange={(e) => setGrantForm({ ...grantForm, target: e.target.value })}
                placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
              <p className={fieldNote}>&lsquo;XP 지급 · 회수&rsquo;의 대상 칸과 같은 값을 씁니다</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Btn variant="danger" disabled={isGranting || !grantForm.target.trim()} onClick={() => setConfirmReset(grantForm.target.trim())}>
                위 대상 초기화
              </Btn>
              <Btn variant="danger" disabled={isGranting} onClick={() => setConfirmReset("all")}>
                전체 유저 초기화
              </Btn>
            </div>
          </section>
          </Reveal>
        )}

        </div>

        {/* 안내 각주 */}
        <Reveal>
        <div className="mt-14 border-t border-black/[0.06] pt-5 text-xs text-[#8a8a8a] leading-relaxed">
          💡 <strong className="text-[#4b4b4b]">작동 방식:</strong> 봇이 1분마다 설정을 다시 읽습니다. 최종 지급량 = 기본 XP + 역할 Boost + 채널 Boost + 기간제 부스트 (음소거 시 설정된 배율 적용).<br/>
          ⚠️ 역할 자동 지급이 작동하려면 봇에게 <strong className="text-[#4b4b4b]">역할 관리 권한</strong>이 있고, 봇의 역할이 지급 대상 역할보다 <strong className="text-[#4b4b4b]">위에</strong> 있어야 합니다.
        </div>
        </Reveal>
      </div>

      <ConfirmDialog
        open={!!deleteConfirm}
        danger
        title="삭제 확인"
        confirmLabel="삭제"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={executeDelete}
        body={
          deleteConfirm?.kind === "role" ? <>해당 역할 설정을 삭제하시겠습니까?<br/>이미 지급된 역할은 회수되지 않습니다.</>
          : deleteConfirm?.kind === "channel" ? <>해당 채널 설정을 삭제하시겠습니까?<br/>삭제 후 기본 XP 정책으로 돌아갑니다.</>
          : deleteConfirm?.kind === "boost" ? <>해당 부스트를 삭제하시겠습니까?<br/>진행 중이라면 즉시 중단됩니다.</>
          : deleteConfirm?.kind === "quest" ? <>해당 퀘스트를 삭제하시겠습니까?<br/>유저 화면에서 바로 사라집니다.</>
          : <>해당 인벤토리 역할 등록을 삭제하시겠습니까?<br/>디스코드 역할 자체는 그대로 남습니다.</>
        }
      />

      {/* 전체 유저 지급 — 되돌리기 어려우므로 한 번 더 확인 */}
      <ConfirmDialog
        open={confirmAll}
        title="전체 유저에게 지급"
        confirmLabel="전체 지급"
        busy={isGranting}
        onCancel={() => setConfirmAll(false)}
        onConfirm={() => runGrant("all")}
        body={
          <>
            <p className="mb-2 break-keep">
              XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>에게{" "}
              <strong className={Number(grantForm.amount) >= 0 ? "text-[#e91e3f]" : "text-amber-700"}>
                {Number(grantForm.amount) >= 0 ? "+" : ""}{Number(grantForm.amount).toLocaleString()} XP
              </strong>
              를 반영합니다.
            </p>
            <p className="text-xs break-keep">되돌리려면 반대 부호로 다시 지급해야 합니다.</p>
          </>
        }
      />

      {/* 📌 초기화는 되돌릴 수 없어 한 번 더 확인한다 */}
      <ConfirmDialog
        open={confirmReset !== null}
        danger
        title={confirmReset === "all" ? "전체 유저 XP 초기화" : "XP 초기화"}
        confirmLabel="초기화"
        busy={isGranting}
        onCancel={() => setConfirmReset(null)}
        onConfirm={() => runGrant(confirmReset as string, { mode: "reset" })}
        body={
          <>
            <p className="mb-2 break-keep">
              {confirmReset === "all"
                ? <>XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>의 보유 XP와 레벨이 <strong className="text-red-600">0</strong>이 됩니다.</>
                : <><strong className="text-[#131313]">{confirmReset}</strong> 님의 보유 XP와 레벨이 <strong className="text-red-600">0</strong>이 됩니다.</>}
            </p>
            <p className="text-xs break-keep">되돌릴 수 없으며, 레벨 보상 역할도 함께 회수됩니다.</p>
          </>
        }
      />

      {noticeEl}
    </main>
  );
}
