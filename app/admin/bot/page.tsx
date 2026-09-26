"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { POINT_RATE } from "@/lib/pointRate";
import {
  AdminPage,
  AdminTabs,
  Segmented,
  Panel,
  PanelGrid,
  FieldRow,
  Inline,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  Toggle,
  Btn,
  SaveBar,
  Toolbar,
  SearchInput,
  StatusChip,
  DataTable,
  DetailPane,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
} from "../ui";
import type { Column } from "../ui";

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

// 📌 강화 정책 — 채팅(구간 상승)·음성(가산) 각각 단계당 효과·최대 단계·비용 곡선 (lib/enhance.js 와 같은 키)
const ENHANCE_FIELDS: {
  kind: string;
  label: string;
  fields: { key: string; label: string; def: number; min: number; max: number; note?: string }[];
}[] = [
  { kind: "chat", label: "채팅", fields: [
    { key: "chatEnhanceStep", label: "단계당 +XP", def: 50, min: 0, max: 1_000_000, note: "최소·최대 양끝에 더해집니다" },
    { key: "chatEnhanceMax", label: "최대 단계", def: 10, min: 0, max: 100, note: "0 이면 강화 없음" },
    { key: "chatEnhanceBaseCost", label: "1단계 비용", def: 20000, min: 0, max: 1_000_000_000 },
    { key: "chatEnhanceCostGrowthPct", label: "단계당 비용 상승 %", def: 50, min: 0, max: 1000, note: "매 단계 복리로 오릅니다" },
  ] },
  { kind: "voice", label: "음성", fields: [
    { key: "voiceEnhanceStep", label: "단계당 +XP", def: 300, min: 0, max: 1_000_000, note: "음성 1회 지급에 더해집니다" },
    { key: "voiceEnhanceMax", label: "최대 단계", def: 10, min: 0, max: 100, note: "0 이면 강화 없음" },
    { key: "voiceEnhanceBaseCost", label: "1단계 비용", def: 50000, min: 0, max: 1_000_000_000 },
    { key: "voiceEnhanceCostGrowthPct", label: "단계당 비용 상승 %", def: 50, min: 0, max: 1000, note: "매 단계 복리로 오릅니다" },
  ] },
];
// 강화 표의 열 머리 — 채팅/음성이 같은 네 칸이라 행=종류, 열=항목인 작은 표로 그린다
const ENHANCE_COLS = ["단계당 +XP", "최대 단계", "1단계 비용", "비용 상승 %"];

const MUTE_MODES = [{ v: "off", l: "제한 없음" }, { v: "reduce", l: "감소" }, { v: "block", l: "차단" }];
const MUTE_TARGETS = [{ v: "both", l: "마이크+헤드셋 모두" }, { v: "any", l: "하나라도 음소거" }];

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

// 📌 세부 탭(?sec=)은 없앴다 — 탭 안의 묶음을 한 화면의 패널로 펼쳤다(메뉴가 세 겹이던 것이 불만이었다).
//    다만 옛 주소가 곳곳에 남아 있어(ARCTIC 의 '비공개 · 공개로 바꾸기', 서포터즈 화면의 '역할 지정' 등)
//    sec 가 오면 그 묶음이 옮겨 간 패널(id="sec-…")로 스크롤해 준다.
//    mute 는 예전 '음소거 · 퇴장' 묶음에 공개 토글이 함께 있었고, 그 주소로 오는 쪽은 전부 공개 토글을 찾는다.
const SEC_ANCHOR: Record<string, Record<string, string>> = {
  policy: { xp: "xp", enhance: "enhance", mute: "public", public: "public", levelup: "levelup", rolegrant: "rolegrant" },
  roles: { reward: "reward", tier: "tier", inventory: "inventory", supporter: "supporter", protected: "protected" },
  content: { channels: "channels", quests: "quests", boosts: "boosts" },
  ledger: { grant: "grant", logs: "logs", reset: "reset" },
};

// 📌 옛 주소 → 새 탭·패널 이사표.
//    9개 탭을 4개로 접었기 때문에 예전 링크(좌측 내비, 상점의 '비공개' 배너, 북마크,
//    안내글에 적어 둔 주소)가 그대로 남아 있다. 모르는 tab 값이 들어오면 조용히
//    첫 탭으로 떨어뜨리지 않고 이 표로 옮겨 준다 — 링크가 죽으면 무엇이 어디로
//    갔는지 아무도 모른 채 화면만 엉뚱하게 열린다.
const LEGACY_TAB: Record<string, { tab: string; sec?: string }> = {
  settings: { tab: "policy" }, // 옛 세부 탭 id(xp/mute/levelup/rolegrant)는 SEC_ANCHOR 가 받는다
  channels: { tab: "content", sec: "channels" },
  quests: { tab: "content", sec: "quests" },
  boosts: { tab: "content", sec: "boosts" },
  inventory: { tab: "roles", sec: "inventory" },
  grant: { tab: "ledger" }, // 옛 세부 탭 id(grant/reset/logs)도 그대로 받는다
  logs: { tab: "ledger", sec: "logs" }, // 옛 XP 로그 탭 = 새 '지급 내역'
  leaderboard: { tab: "ledger" }, // 랭킹은 /level?tab=rank 로 넘겼다 (ledger 머리의 바로가기)
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
  unit?: string; // "XP" | "빙옥" — 수동 지급 재화
  note: string;
  channelName?: string;
  status?: string | null;
  error?: string | null;
};

// 📌 수동 지급 — 한 폼에서 XP · 빙옥 · 아이템을 고른다. 아이템 기간은 영구/7일/30일/직접 입력.
type GrantKind = "xp" | "point" | "item";
const GRANT_KINDS = [{ v: "xp", l: "XP" }, { v: "point", l: "빙옥" }, { v: "item", l: "아이템" }];
const ITEM_GRANT_DAYS = [{ v: "0", l: "영구" }, { v: "7", l: "7일" }, { v: "30", l: "30일" }, { v: "custom", l: "직접 입력" }];
const EMPTY_ITEM_GRANT = { itemId: "", daysMode: "0", days: "", target: "", reason: "" };
const GRANT_STATUS: Record<string, { l: string; tone: "ok" | "warn" | "neutral" }> = {
  pending: { l: "지급 대기", tone: "warn" },
  completed: { l: "보유", tone: "ok" },
  expired: { l: "만료", tone: "neutral" },
  refunded: { l: "회수", tone: "neutral" },
  cancelled: { l: "취소", tone: "neutral" },
};

const EMPTY_ROLE = { roleId: "", rewardLevel: "", buffXp: "", attendBuffXp: "", exclusive: false };
const EMPTY_CHANNEL = { channelId: "", boostXp: "", excluded: false };
const EMPTY_BOOST = { id: "", name: "", targetRoleId: "", targetChannelId: "", boostXp: "", startAt: "", endAt: "" };
const EMPTY_QUEST = { id: "", name: "", desc: "", period: "daily", reason: "chat", metric: "count", target: 1, rewardXp: 0, rewardPoint: 0, enabled: true, order: 0 };

// ── 저장 줄(SaveBar) 용 ─────────────────────────────────────
//    설정은 BotSetting 단일 문서 하나라 정책 · 서포터즈 · 보호 역할 · 퀘스트 노출이 모두 같은 저장을 탄다.
//    그래서 저장 줄도 하나 — 불러온 값(스냅샷)과 지금 값을 비교해 바뀐 게 있으면 어느 탭에서든 뜬다
//    (예전에는 다른 탭에서 고친 값이 이 탭의 '저장'에 조용히 묻어 나갔다).
const SETTING_LABEL: Record<string, string> = {
  chatXpMin: "채팅 XP 최소",
  chatXpMax: "채팅 XP 최대",
  chatCooldownSec: "채팅 쿨타임",
  voiceXp: "음성 XP",
  voiceIntervalSec: "음성 지급 주기",
  attendXp: "출석체크 XP",
  attendVoiceMin: "출석 인정 시간",
  ...Object.fromEntries(ENHANCE_FIELDS.flatMap((g) => g.fields.map((f) => [f.key, `${g.label} 강화 ${f.label}`]))),
  muteMode: "음소거 처리",
  muteReducePct: "감소 비율",
  muteTarget: "적용 기준",
  levelupChannelId: "레벨업 알림 채널",
  levelupMessage: "레벨업 알림 문구",
  roleGrantEnabled: "역할 지급 알림",
  roleGrantChannelId: "역할 지급 알림 채널",
  roleGrantMessage: "역할 지급 알림 문구",
  shopPublic: "ARCTIC 상점 공개",
  levelPublic: "SYSTEM : LEVEL 공개",
  resetOnLeave: "퇴장 시 XP 초기화",
  supporterRoleId: "서포터즈 역할",
  supporterBaseXp: "서포터즈 월 기본 XP",
  supporterGoalChat: "서포터즈 월 목표 채팅",
  supporterGoalVoiceMin: "서포터즈 월 목표 음성",
  protectedRoleIds: "보호 역할",
  questPickDaily: "일일 노출 개수",
  questPickWeekly: "주간 노출 개수",
  questPickMonthly: "월간 노출 개수",
};
// 화면이 비어 있을 때 대신 보여 주던 값 — 비교 · 변경 목록에서도 같은 값으로 친다
const SETTING_DEFAULT: Record<string, number> = {
  chatXpMin: 50,
  chatXpMax: 500,
  attendVoiceMin: 60,
  supporterBaseXp: 150000,
  supporterGoalChat: 0,
  supporterGoalVoiceMin: 0,
  questPickDaily: 0,
  questPickWeekly: 0,
  questPickMonthly: 0,
  ...Object.fromEntries(ENHANCE_FIELDS.flatMap((g) => g.fields.map((f) => [f.key, f.def]))),
};
const SETTING_TEXT = new Set(["levelupMessage", "roleGrantMessage"]);
// 입력칸은 문자열, 서버 값은 숫자 · 빈 값은 기본값처럼 — 겉보기가 같으면 같은 값으로 본다
const normSetting = (k: string, v: any) => {
  if (k === "roleGrantEnabled") return String(v !== false);
  if (k === "resetOnLeave" || k === "shopPublic" || k === "levelPublic") return String(!!v);
  if (k === "muteMode") return v || "off";
  if (k === "muteTarget") return v || "both";
  if (Array.isArray(v)) return v.length ? JSON.stringify(v) : "";
  if (v == null && k in SETTING_DEFAULT) return String(SETTING_DEFAULT[k]);
  return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
};

// 📌 좁은 판(상세 칸 · 지급 폼) 안의 입력 한 칸 — 이름 위 · 입력 · 아래 한 줄.
//    FieldRow 의 180px 이름 칸은 440px 판에선 입력칸을 너무 좁게 만든다.
function Field({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className={labelClass}>{label}</div>
      {children}
      {hint && <p className={fieldNote}>{hint}</p>}
    </div>
  );
}

const Req = () => <span className="text-[#e91e3f]">*</span>;

// 📌 목록 편집 칸 — ＋ 추가나 줄을 누르면 PC 는 오른쪽 칸, 모바일은 아래 판으로 같은 폼이 뜬다.
//    예전의 접이식 폼은 목록을 아래로 밀어내고, 편집하려면 화면을 오르내려야 했다.
//    ⚠️ DetailPane 은 PC · 모바일 판을 둘 다 그려 두고 CSS 로 하나만 보인다 — form id 로 묶지 말고 버튼은 onClick 으로.
function EditPane({
  open,
  title,
  sub,
  badge,
  saveLabel,
  onSubmit,
  onCancel,
  onDelete,
  width,
  children,
}: {
  open: boolean;
  title: string;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
  saveLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <DetailPane
      open={open}
      onClose={onCancel}
      title={title}
      sub={sub}
      badge={badge}
      width={width}
      footer={
        <>
          <Btn onClick={onSubmit}>{saveLabel}</Btn>
          <Btn variant="ghost" onClick={onCancel}>취소</Btn>
          {onDelete && <Btn variant="ghost" onClick={onDelete} className="ml-auto !text-[#d01634]">삭제</Btn>}
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        {children}
        {/* 입력칸에서 Enter 로 저장 — 여러 칸짜리 폼은 폼 안에 제출 단추가 있어야 Enter 가 먹는다 */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </DetailPane>
  );
}

// 패널 안 빈 목록 — DataTable 의 점선 상자는 패널 안에서 상자가 두 겹이 된다
function PanelEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-10 text-center text-[13px] text-[#5a5a5a]">{children}</p>;
}

// 패널 제목 옆 개수
const Count = ({ n }: { n: number }) => <span className="ml-1.5 text-[13px] font-bold text-[#8a8a8a] tabular-nums">{n}</span>;
// 표의 빈 칸 — 모바일 줄 카드에서는 대시가 줄줄이 붙지 않게 숨긴다
const Dash = () => <span className="hidden md:inline text-[#a3a3a3]">—</span>;

// 링크를 버튼(secondary · sm) 모양으로
const LINK_PILL =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold whitespace-nowrap bg-white text-[#131313] border border-[#a3a3a3] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40";
// 공용 Dropdown(라이트)을 입력칸(inputClass)과 같은 높이 · 테두리로
const DD = "!px-3 !py-2 min-h-10 !text-[14px] !border-[#a3a3a3]";

export default function AdminBotPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  // ── 탭 해석 ─────────────────────────────────
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "";
  const rawSec = searchParams.get("sec") || "";

  let tab = rawTab;
  let sec = rawSec;
  if (!TAB_ORDER.some((t) => t.id === tab)) {
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
  // 옛 세부 탭 → 스크롤할 패널 (모르는 값이면 스크롤하지 않는다)
  const anchor = SEC_ANCHOR[tab]?.[sec] || "";

  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "role" | "channel" | "boost" | "quest" | "inventory"; id: string } | null>(null);

  // 공통 데이터
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [guildChannels, setGuildChannels] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<any[]>([]);
  const [boosts, setBoosts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  // 📌 불러온(또는 마지막으로 저장한) 설정 — 저장 줄의 '바뀐 것'과 '되돌리기'가 이 값을 기준으로 한다
  const [settingsSnap, setSettingsSnap] = useState<any>(null);
  // fetchCore 가 목록 저장 뒤에도 불린다 — 그때 저장 안 한 설정 수정분을 지키려고 최신 스냅샷을 들고 있는다
  const settingsSnapRef = useRef<any>(null);
  useEffect(() => { settingsSnapRef.current = settingsSnap; }, [settingsSnap]);
  const [savingSettings, setSavingSettings] = useState(false);
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

  // 편집 칸 — 한 번에 하나만 연다.
  // 어느 탭에서 열었는지를 함께 들고 있어서, 다른 탭으로 옮기면 저절로 닫힌 것으로 친다
  // (효과로 상태를 되돌리면 렌더가 한 번 더 도는데, 여기선 그럴 이유가 없다).
  // editId: 고친 줄의 _id — 표에서 그 줄을 표시하고 칸 안의 '삭제'가 쓴다 (새로 만들 땐 null)
  const [openForm, setOpenForm] = useState<{ tab: string; sec: string; kind: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const openFormAt = (kind: string, id: string | null = null) => {
    setEditId(id);
    setOpenForm({ tab, sec: anchor, kind });
  };
  const closeForm = () => setOpenForm(null);
  const isFormOpen = (kind: string) =>
    !!openForm && openForm.kind === kind && openForm.tab === tab && openForm.sec === anchor;

  const [roleForm, setRoleForm] = useState<any>(EMPTY_ROLE);
  const [chForm, setChForm] = useState<any>(EMPTY_CHANNEL);
  const [boostForm, setBoostForm] = useState<any>(EMPTY_BOOST);
  const [questForm, setQuestForm] = useState<any>(EMPTY_QUEST);
  // 📌 노출 방식 칸은 자기 폼 상태 없이 공용 settings 를 바로 고친다.
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
      if (st?.data) {
        // 📌 역할 · 퀘스트 · 채널 · 부스트를 저장/삭제한 뒤에도 여기로 온다. 그때 아직 저장 안 한 설정 수정분(저장 줄에 떠 있는 것)을
        //    서버 값으로 덮으면 말없이 사라진다 → 기준(스냅샷)은 서버 값으로 새로 하고, 바꾼 칸만 로컬 값을 얹는다
        const next = st.data;
        setSettings((prev: any) => {
          const snap = settingsSnapRef.current;
          if (!prev || !snap) return next;
          const changed = Object.keys({ ...snap, ...prev }).filter((k) => normSetting(k, prev[k]) !== normSetting(k, snap[k]));
          return changed.length ? { ...next, ...Object.fromEntries(changed.map((k) => [k, prev[k]])) } : next;
        });
        setSettingsSnap(next);
      }
      setBoosts(Array.isArray(bst?.data) ? bst.data : []);
      setQuests(Array.isArray(qst?.data) ? qst.data : []);
      setInvRoles(Array.isArray(inv?.data) ? inv.data : []);
      setShopItems(Array.isArray(shop?.data) ? shop.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) fetchCore(); }, [isAdmin, fetchCore]);

  // 봇 자동 지급 로그 — 지급·내역 탭에서는 내역 표가 늘 보이므로 탭만 본다
  useEffect(() => {
    if (!isAdmin || tab !== "ledger") return;
    // '수동'은 Payout(grantLogs)만 보여 준다 — 화면에 쓰지도 않을 봇 로그를 부를 이유가 없다
    if (ledgerFilter === "manual") return;
    const qs = new URLSearchParams({ limit: "50", skip: String(logPage * 50) });
    if (ledgerFilter) qs.set("reason", ledgerFilter);
    if (logQuery.trim()) qs.set("q", logQuery.trim());
    fetch(`/api/xp-logs?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setLogs(Array.isArray(d?.data) ? d.data : []); setLogTotal(d?.total || 0); })
      .catch(() => {});
  }, [isAdmin, tab, logPage, ledgerFilter, logQuery]);

  // ── 설정 저장 ───────────────────────────────
  const postSettings = async () => {
    const res = await fetch("/api/bot-settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
    }).catch(() => null);
    if (res?.ok) { const d = await res.json(); setSettings(d.data); setSettingsSnap(d.data); saved(); return true; }
    notify("저장에 실패했습니다.", true);
    return false;
  };

  // 저장 줄의 '저장' — 설정 문서 전체를 기존 postSettings 로 보낸다
  const saveSettings = async () => {
    if (savingSettings) return;
    setSavingSettings(true);
    try { await postSettings(); } finally { setSavingSettings(false); }
  };

  // 퀘스트 노출 방식도 같은 문서를 저장한다 (설정은 단일 문서라 전체를 함께 보낸다)
  const savePicks = async () => {
    if (!settings) { notify("설정을 아직 불러오지 못했습니다.", true); return; }
    if (await postSettings()) { setPickSnapshot(null); closeForm(); }
  };

  // 노출 방식 칸 열기/취소 — 취소는 연 시점의 값으로 되돌린다
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
  const [grantKind, setGrantKind] = useState<GrantKind>("xp");
  const grantUnit = grantKind === "point" ? "빙옥" : "XP";
  // 아이템 지급
  const [itemGrant, setItemGrant] = useState(EMPTY_ITEM_GRANT);
  const [grantItems, setGrantItems] = useState<any[]>([]);
  const [itemGrants, setItemGrants] = useState<any[]>([]);
  const [confirmAllItem, setConfirmAllItem] = useState(false);
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

  const loadItemGrants = useCallback(() => {
    fetch("/api/admin/items/grant", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setItemGrants(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAdmin || tab !== "ledger") return;
    loadGrantLogs();
    loadItemGrants();
    // 기프트카드는 수동 지급 대상이 아니다
    fetch("/api/admin/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGrantItems((Array.isArray(d?.data) ? d.data : []).filter((it: any) => it.type !== "physical")))
      .catch(() => {});
  }, [isAdmin, tab, loadGrantLogs, loadItemGrants]);

  const runItemGrant = async (target: string) => {
    if (isGranting) return;
    const days = itemGrant.daysMode === "custom" ? Math.max(1, Math.trunc(Number(itemGrant.days) || 0)) : Number(itemGrant.daysMode);
    setIsGranting(true);
    try {
      const res = await fetch("/api/admin/items/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: itemGrant.itemId, target, days, reason: itemGrant.reason }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        notify(d.message || "지급했습니다.");
        setItemGrant({ ...itemGrant, target: "", reason: "" });
        loadItemGrants();
      } else {
        notify(d.message || "지급에 실패했습니다.", true);
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsGranting(false);
      setConfirmAllItem(false);
    }
  };

  const submitItemGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemGrant.itemId) return notify("지급할 아이템을 선택해 주세요.", true);
    if (!itemGrant.target.trim()) return notify("지급 대상을 입력해주세요.", true);
    runItemGrant(itemGrant.target.trim());
  };

  // amount를 넘기면 그 값으로, 넘기지 않으면 입력값 그대로 보낸다 (제거는 음수로 뒤집는다)
  const runGrant = async (target: string, override?: { amount?: number; mode?: "reset" }) => {
    if (isGranting) return;
    setIsGranting(true);
    try {
      const res = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...grantForm, target, currency: grantKind === "point" ? "point" : "xp", ...override }),
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
    if (!amount) return notify(`제거할 ${grantUnit}을 입력해주세요.`, true);
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

  // 📌 옛 ?sec= 주소로 들어오면 그 묶음이 옮겨 간 패널로 한 번 데려간다.
  //    패널은 데이터가 와야 그려지거나 키가 바뀌므로, 불러오기가 끝난 뒤 한 번만 움직인다.
  const scrolledTo = useRef("");
  const settingsReady = !!settings;
  useEffect(() => {
    if (!anchor || isLoading) return;
    const key = `${tab}:${anchor}`;
    if (scrolledTo.current === key) return;
    const el = document.getElementById(`sec-${anchor}`);
    if (!el) return;
    scrolledTo.current = key;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [tab, anchor, isLoading, settingsReady]);

  // 화면 가리개일 뿐이다 — 실제 방어는 각 API 의 getServerSession + isAdminName 이 한다
  if (gate) return gate;

  // ── 파생값 ──────────────────────────────────
  // 봇이 실제로 지급할 수 있는 역할만 — 디스코드가 관리하는 역할(서버 부스트 등)은 줄 수 없다.
  // 부스트 대상 지정과 인벤토리 표시에는 관리 역할도 쓸 수 있으므로 그쪽은 guildRoles 를 그대로 쓴다.
  const grantableRoles = guildRoles.filter((r) => !r.managed);
  const roleNameOf = (id: string) => guildRoles.find((g) => g.id === id)?.name || "";
  const channelNameOf = (id: string) => guildChannels.find((c) => c.id === id)?.name || id;

  const roleOptions = (list: any[]) => list.map((r) => ({ value: r.id, label: r.name, color: r.color }));
  const channelOptions = guildChannels.map((c) => ({
    value: c.id,
    label: `${CHANNEL_TYPE_ICON[c.type] || "#"} ${c.name}`,
    hint: CHANNEL_TYPE_LABEL[c.type],
    indent: !!c.parentId,
  }));
  const textChannelOptions = guildChannels.filter((c) => c.type === "text").map((c) => ({ value: c.id, label: `# ${c.name}` }));

  // 📌 등록하지 않아도 인벤토리에 잡히는 역할 — /api/shop/my-items 가 상품·역할 설정 역할을 그대로 인정하기 때문
  // 📌 시즌 전환 보호 역할 — 설정 문서(BotSetting)의 배열 하나라 저장은 기존 postSettings 를 그대로 쓴다
  const protectedRoleIds: string[] = Array.isArray(settings?.protectedRoleIds) ? settings.protectedRoleIds : [];
  const toggleProtectedRole = (id: string) =>
    setSettings({
      ...settings,
      protectedRoleIds: protectedRoleIds.includes(id)
        ? protectedRoleIds.filter((x) => x !== id)
        : [...protectedRoleIds, id],
    });

  // ── 설정 변경 추적(저장 줄) ─────────────────
  const settingsDirty =
    !!settings && !!settingsSnap &&
    Object.keys({ ...settingsSnap, ...settings }).some((k) => normSetting(k, settings[k]) !== normSetting(k, settingsSnap[k]));
  const chg = (k: string) => !!settings && !!settingsSnap && normSetting(k, settings[k]) !== normSetting(k, settingsSnap[k]);
  const fmtSetting = (k: string, v: any): string => {
    if (k === "roleGrantEnabled") return v !== false ? "사용" : "사용 안 함";
    if (k === "shopPublic" || k === "levelPublic") return v ? "공개" : "비공개";
    if (k === "resetOnLeave") return v ? "초기화함" : "유지함";
    if (k === "muteMode") return MUTE_MODES.find((o) => o.v === (v || "off"))?.l || String(v);
    if (k === "muteTarget") return MUTE_TARGETS.find((o) => o.v === (v || "both"))?.l || String(v);
    if (k === "levelupChannelId") return v ? `#${channelNameOf(v)}` : "알림 끄기";
    if (k === "roleGrantChannelId") return v ? `#${channelNameOf(v)}` : "레벨업 채널과 동일";
    if (k === "supporterRoleId") return v ? roleNameOf(v) || v : "지정 안 함";
    if (k === "protectedRoleIds") return `${Array.isArray(v) ? v.length : 0}개`;
    const raw = v == null && k in SETTING_DEFAULT ? SETTING_DEFAULT[k] : v;
    if (raw == null || raw === "") return "비움";
    const n = Number(raw);
    return Number.isFinite(n) ? n.toLocaleString() : String(raw);
  };
  const settingChanges: string[] = settingsDirty
    ? Object.keys(SETTING_LABEL)
        .filter((k) => chg(k))
        .map((k) => (SETTING_TEXT.has(k) ? `${SETTING_LABEL[k]} 수정` : `${SETTING_LABEL[k]} ${fmtSetting(k, settingsSnap[k])} → ${fmtSetting(k, settings[k])}`))
    : [];
  // 노출 방식 칸은 자기 저장 · 취소가 있다 — 그 칸이 열린 동안 저장 줄까지 띄우면 저장 단추가 둘이 된다
  const showSaveBar = settingsDirty && !isFormOpen("questPick");

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
      unit: g.currency === "point" ? "빙옥" : "XP",
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

  const hrefTab = (id: string) => `/admin/bot?tab=${id}`;

  const loadingRow = <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>;

  // ── 표 열 ───────────────────────────────────
  const roleCols: Column<any>[] = [
    {
      key: "role", label: "역할", mobile: "title",
      render: (c) => {
        const role = guildRoles.find((r) => r.id === c.roleId);
        return (
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }} />
            <span className="font-bold truncate">{c.roleName || role?.name || c.roleId}</span>
            {c.exclusive && <StatusChip>등급 역할</StatusChip>}
          </span>
        );
      },
    },
    {
      key: "lv", label: "지급 레벨",
      render: (c) =>
        c.rewardLevel != null ? (
          <span className="font-bold text-[#e91e3f] tabular-nums">Lv.{c.rewardLevel}<span className="md:hidden"> 도달 시 지급</span></span>
        ) : c.buffXp > 0 || c.attendBuffXp > 0 ? <Dash /> : (
          <span className="text-[#5a5a5a]">효과 없음</span>
        ),
    },
    {
      key: "buff", label: "채팅·음성 Boost", align: "right",
      render: (c) => (c.buffXp > 0 ? <span className="tabular-nums"><span className="md:hidden">채팅/음성 </span>+{c.buffXp.toLocaleString()}</span> : <Dash />),
    },
    {
      key: "attend", label: "출석 Boost", align: "right",
      render: (c) => (c.attendBuffXp > 0 ? <span className="tabular-nums"><span className="md:hidden">출석 </span>+{c.attendBuffXp.toLocaleString()}</span> : <Dash />),
    },
  ];

  const channelCols: Column<any>[] = [
    {
      key: "ch", label: "채널", mobile: "title",
      render: (c) => {
        const live = guildChannels.find((g) => g.id === c.channelId);
        return (
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="text-[12px] text-[#8a8a8a] shrink-0">{CHANNEL_TYPE_ICON[c.channelType] || "#"}</span>
            <span className="font-bold truncate">{live?.name || c.channelName || c.channelId}</span>
          </span>
        );
      },
    },
    {
      key: "eff", label: "효과",
      render: (c) =>
        c.excluded ? <StatusChip tone="bad">XP 지급 제외</StatusChip>
        : c.boostXp > 0 ? <span className="font-bold text-[#e91e3f] tabular-nums">+{c.boostXp.toLocaleString()} XP</span>
        : <span className="text-[#5a5a5a]">효과 없음</span>,
    },
    {
      key: "scope", label: "범위",
      render: (c) => (c.channelType === "category" ? <span className="text-[#5a5a5a]">하위 채널 전체</span> : <Dash />),
    },
  ];

  const boostState = (b: any) => {
    const now = Date.now();
    const start = new Date(b.startAt).getTime();
    const end = new Date(b.endAt).getTime();
    return now < start ? "예정" : now > end ? "종료" : "진행 중";
  };
  const boostCols: Column<any>[] = [
    {
      key: "state", label: "상태", mobile: "title", className: "w-20",
      render: (b) => {
        const s = boostState(b);
        return <StatusChip tone={s === "진행 중" ? "ink" : s === "예정" ? "info" : "neutral"}>{s}</StatusChip>;
      },
    },
    { key: "name", label: "이름", mobile: "title", render: (b) => <span className="font-bold">{b.name}</span> },
    {
      key: "xp", label: "추가 XP", align: "right",
      render: (b) => <span className="font-bold text-[#e91e3f] tabular-nums whitespace-nowrap">+{(b.boostXp || 0).toLocaleString()} XP</span>,
    },
    {
      key: "target", label: "대상",
      render: (b) => (
        <span className="text-[#5a5a5a]">
          {b.targetRoleName || "전체 유저"} · {b.targetChannelName ? `${CHANNEL_TYPE_ICON[b.targetChannelType] || "#"} ${b.targetChannelName}` : "모든 채널"}
        </span>
      ),
    },
    {
      key: "period", label: "기간",
      render: (b) => (
        <span className="text-[12px] text-[#8a8a8a] tabular-nums whitespace-nowrap">
          <span className="md:block">{fmtDateTime(b.startAt)} ~</span> <span className="md:block">{fmtDateTime(b.endAt)}</span>
        </span>
      ),
    },
  ];

  // 퀘스트는 주기 순(일일 → 주간 → 월간)으로 한 표에 — 주기별 요약은 표 위 한 줄에
  const questRows = QUEST_PICK_FIELDS.flatMap((f) => quests.filter((q) => (q.period || "daily") === f.period));
  const questCols: Column<any>[] = [
    { key: "period", label: "주기", className: "w-16", render: (q) => <span className="text-[#5a5a5a]">{PERIOD_LABEL[q.period || "daily"]}</span> },
    {
      key: "order", label: "순서", align: "center", className: "w-16",
      render: (q) => <span className="text-[#8a8a8a] tabular-nums"><span className="md:hidden">순서 </span>{q.order}</span>,
    },
    {
      key: "name", label: "퀘스트", mobile: "title",
      render: (q) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className={`font-bold ${q.enabled ? "" : "line-through text-[#5a5a5a]"}`}>{q.name}</span>
            {!q.enabled && <StatusChip>비활성</StatusChip>}
          </span>
          {q.desc && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] break-keep">{q.desc}</span>}
        </span>
      ),
    },
    {
      key: "cond", label: "조건",
      render: (q) => (
        <span className="text-[#5a5a5a] tabular-nums">
          {(REASON_LABEL[q.reason] || "전체")}{" "}
          {q.metric === "xp" ? "XP" : q.metric === "minute" ? "접속" : "횟수"}{" "}
          {q.target.toLocaleString()}{q.metric === "minute" ? "분" : ""} 달성
        </span>
      ),
    },
    {
      key: "reward", label: "보상", align: "right",
      render: (q) => (
        <span className="inline-flex items-center gap-2 font-black tabular-nums whitespace-nowrap">
          {q.rewardXp > 0 && <span className="text-[#e91e3f]">+{q.rewardXp.toLocaleString()} XP</span>}
          {q.rewardXp > 0 && (q.rewardPoint || 0) > 0 && <span className="text-[#a3a3a3]">·</span>}
          {(q.rewardPoint || 0) > 0 && <span className="text-[#3f9e93]">+{Number(q.rewardPoint).toLocaleString()} 빙옥</span>}
          {q.rewardXp <= 0 && (q.rewardPoint || 0) <= 0 && <span className="text-[#a3a3a3]">보상 없음</span>}
        </span>
      ),
    },
  ];

  const ledgerCols: Column<LedgerRow>[] = [
    {
      key: "src", label: "구분", mobile: "title", className: "w-16",
      render: (r) => <StatusChip tone={r.src === "manual" ? "ink" : "neutral"}>{r.src === "manual" ? "수동" : "봇"}</StatusChip>,
    },
    {
      key: "name", label: "유저", mobile: "title",
      render: (r) => (
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="font-bold truncate max-w-[13rem]">{r.name}</span>
          {/* 처리 상태는 수동 지급에만 있다 — 값이 비어 있어도 '대기'로 보여 줘야 큐에 남은 걸 알 수 있다 */}
          {r.src === "manual" && (
            <StatusChip tone={r.status === "paid" ? "ok" : r.status === "failed" ? "bad" : "neutral"}>
              {r.status === "paid" ? "완료" : r.status === "failed" ? "실패" : "대기"}
            </StatusChip>
          )}
        </span>
      ),
    },
    {
      key: "note", label: "내용",
      render: (r) => (
        <span className="text-[#5a5a5a] break-keep">
          {r.note}
          {r.channelName ? ` · #${r.channelName}` : ""}
          {r.error ? ` · ${r.error}` : ""}
        </span>
      ),
    },
    { key: "at", label: "일시", className: "whitespace-nowrap", render: (r) => <span className="text-[12px] text-[#8a8a8a] tabular-nums">{fmtDateTime(r.at)}</span> },
    {
      key: "amount", label: "수량", align: "right",
      render: (r) => (
        <span className={`font-black tabular-nums whitespace-nowrap ${r.amount >= 0 ? "text-[#e91e3f]" : "text-amber-700"}`}>
          {r.amount >= 0 ? "+" : ""}{r.amount.toLocaleString()}
          {r.unit === "빙옥" && <span className="ml-1 text-[11px] text-[#3f9e93]">빙옥</span>}
        </span>
      ),
    },
  ];

  const tableFlat = "!border-0 !rounded-none";

  return (
    <AdminPage
      section="SYSTEM : LEVEL"
      title="레벨 설정"
      tabs={<AdminTabs tabs={TAB_ORDER} current={tab} hrefOf={hrefTab} />}
      // 랭킹은 유저 화면이 상위호환이라 관리자 쪽에 따로 두지 않는다 — 머리의 바로가기 하나로만 남긴다
      // 탭마다 머리 단추가 생겼다 없어지면 모바일에서 줄바꿈이 달라져 탭 줄이 밀린다 — 늘 같은 단추(메모: tabs-never-move)
      actions={<Link href="/level?tab=rank" className={LINK_PILL}>랭킹 보기</Link>}
      footer={
        <SaveBar
          dirty={showSaveBar}
          changes={settingChanges}
          onSave={saveSettings}
          onReset={() => { if (settingsSnap) setSettings(settingsSnap); }}
          saving={savingSettings}
        />
      }
    >
      {/* ═══════════ 정책 ═══════════
          📌 예전 세부 탭 넷(지급량 · 음소거 · 레벨업 알림 · 역할 지급 알림)을 패널로 한 화면에 펼쳤다.
             공개 토글 · 퇴장 초기화처럼 되돌리기 어려운 설정은 맨 아래 빨간 테두리 패널 하나에 모았다. */}
      {tab === "policy" && (settings ? (
        <>
          <PanelGrid>
            <div className="min-w-0 space-y-5">
              <Panel id="sec-xp" className="scroll-mt-24" title="지급량 · 주기" flush>
                {/* 최소 · 최대를 한 줄에 — 두 열(xl)의 좁은 칸에서도 안 접히게 칸을 조금 줄이고 단위는 이름에 맡긴다 */}
                <FieldRow label="채팅 XP" changed={chg("chatXpMin") || chg("chatXpMax")} hint="메시지 1회당 최소~최대 사이 랜덤 · 최대가 최소보다 작으면 최소로 맞춰집니다">
                  <Inline>
                    <input type="number" min={0} aria-label="채팅 XP 최소" value={settings.chatXpMin ?? 50} onChange={(e) => setSettings({ ...settings, chatXpMin: e.target.value })} className={`${inputClass} !w-24 tabular-nums`} />
                    ~
                    <input type="number" min={0} aria-label="채팅 XP 최대" value={settings.chatXpMax ?? 500} onChange={(e) => setSettings({ ...settings, chatXpMax: e.target.value })} className={`${inputClass} !w-24 tabular-nums`} />
                  </Inline>
                </FieldRow>
                <FieldRow label="채팅 쿨타임" changed={chg("chatCooldownSec")} hint="이 시간 안의 추가 메시지는 지급 없음">
                  <Inline>
                    <input type="number" min={0} value={settings.chatCooldownSec} onChange={(e) => setSettings({ ...settings, chatCooldownSec: e.target.value })} className={numClass} />
                    초
                  </Inline>
                </FieldRow>
                <FieldRow label="음성 XP" changed={chg("voiceXp")} hint="음성 지급 1회당 기본 지급량">
                  <Inline>
                    <input type="number" min={0} value={settings.voiceXp} onChange={(e) => setSettings({ ...settings, voiceXp: e.target.value })} className={numClass} />
                    XP
                  </Inline>
                </FieldRow>
                <FieldRow label="음성 지급 주기" changed={chg("voiceIntervalSec")} hint="음성 채널 접속자에게 이 주기마다 지급 (기본 300초 = 5분)">
                  <Inline>
                    <input type="number" min={30} value={settings.voiceIntervalSec} onChange={(e) => setSettings({ ...settings, voiceIntervalSec: e.target.value })} className={numClass} />
                    초
                  </Inline>
                </FieldRow>
                <FieldRow label="출석체크 XP" changed={chg("attendXp")} hint="일일 출석 보상 지급량 (1일 1회)">
                  <Inline>
                    <input type="number" min={0} value={settings.attendXp} onChange={(e) => setSettings({ ...settings, attendXp: e.target.value })} className={numClass} />
                    XP
                  </Inline>
                </FieldRow>
                <FieldRow label="출석 인정 접속 시간" changed={chg("attendVoiceMin")} hint="음성 채널에 하루 이만큼 머무르면 출석 보상 (기본 60분)">
                  <Inline>
                    <input type="number" min={1} max={1440} value={settings.attendVoiceMin ?? 60} onChange={(e) => setSettings({ ...settings, attendVoiceMin: e.target.value })} className={numClass} />
                    분
                  </Inline>
                </FieldRow>
              </Panel>

              <Panel title="음소거 처리" flush>
                <FieldRow label="음소거 시 처리" changed={chg("muteMode")} hint="차단은 지급 자체를 건너뜁니다">
                  <Segmented options={MUTE_MODES} value={settings.muteMode || "off"} onChange={(v) => setSettings({ ...settings, muteMode: v })} />
                </FieldRow>
                <FieldRow label="감소 비율" changed={chg("muteReducePct")} hint="90 = 원래 지급량의 10%만 지급">
                  <Inline>
                    <input type="number" min={0} max={100} value={settings.muteReducePct} disabled={settings.muteMode !== "reduce"}
                      onChange={(e) => setSettings({ ...settings, muteReducePct: e.target.value })} className={numClass} />
                    %
                  </Inline>
                </FieldRow>
                <FieldRow label="적용 기준" changed={chg("muteTarget")} hint="어떤 상태를 ‘음소거’로 볼지">
                  <Segmented options={MUTE_TARGETS} value={settings.muteTarget || "both"} onChange={(v) => setSettings({ ...settings, muteTarget: v })} />
                </FieldRow>
              </Panel>
            </div>

            <div className="min-w-0 space-y-5">
              {/* 강화 — 유저가 XP·POINT 로 단계를 올려 채팅 구간·음성 지급을 영구히 키운다 (lib/enhance.js).
                  채팅/음성이 같은 네 칸이라 행=종류 · 열=항목인 작은 표로. 모바일은 종류마다 두 칸씩 */}
              <Panel id="sec-enhance" className="scroll-mt-24" title="강화" flush>
                <div className="px-5 py-4">
                  <div className="hidden md:flex items-center gap-3 pb-2 text-[12px] font-bold text-[#5a5a5a]">
                    <span className="w-12 shrink-0" />
                    <div className="flex-1 min-w-0 grid grid-cols-4 gap-3">
                      {ENHANCE_COLS.map((c) => <span key={c} className="min-w-0">{c}</span>)}
                    </div>
                  </div>
                  {ENHANCE_FIELDS.map((g, i) => (
                    <div key={g.kind} className={`flex items-start md:items-center gap-3 py-3 border-[#ededed] ${i > 0 ? "border-t" : "md:border-t"}`}>
                      <span className="w-12 shrink-0 flex items-center gap-1.5 text-[13px] font-bold md:pt-0 pt-1">
                        {g.label}
                        {g.fields.some((f) => chg(f.key)) && <span aria-label="바뀜" className="w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
                      </span>
                      <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {g.fields.map((f, j) => (
                          <label key={f.key} className="block min-w-0">
                            <span className="md:hidden block mb-1 text-[12px] text-[#5a5a5a]">{ENHANCE_COLS[j]}</span>
                            <input type="number" min={f.min} max={f.max} aria-label={`${g.label} ${f.label}`} value={settings[f.key] ?? f.def}
                              onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} className={`${inputClass} tabular-nums`} />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className={fieldNote}>단계당 +XP — 채팅은 최소·최대 양끝, 음성은 1회 지급에 더해집니다 · 최대 단계 0 이면 강화 없음 · 비용은 매 단계 복리로 오릅니다</p>
                </div>
              </Panel>

              <Panel id="sec-levelup" className="scroll-mt-24" title="레벨업 알림" flush>
                <FieldRow label="알림 채널" changed={chg("levelupChannelId")} hint="레벨업 시 메시지를 보낼 채널">
                  <Dropdown
                    theme="light"
                    buttonClassName={DD}
                    value={settings.levelupChannelId || ""}
                    onChange={(v) => setSettings({ ...settings, levelupChannelId: v })}
                    options={[{ value: "", label: "알림 끄기" }, ...textChannelOptions]}
                  />
                </FieldRow>
                <FieldRow
                  label="알림 문구"
                  top
                  changed={chg("levelupMessage")}
                  hint={<><b className="text-[#131313]">{"{user}"}</b> 멘션 · <b className="text-[#131313]">{"{level}"}</b> 도달 레벨 · <b className="text-[#131313]">{"{xp}"}</b> 누적 XP · 디스코드 마크다운(**굵게**) 사용 가능</>}
                >
                  <textarea rows={2} value={settings.levelupMessage} onChange={(e) => setSettings({ ...settings, levelupMessage: e.target.value })} className={`${inputClass} resize-none`} />
                </FieldRow>
              </Panel>

              <Panel id="sec-rolegrant" className="scroll-mt-24" title="역할 지급 알림" flush>
                <FieldRow label="알림 사용" changed={chg("roleGrantEnabled")}>
                  <Toggle
                    on={settings.roleGrantEnabled !== false}
                    onClick={() => setSettings({ ...settings, roleGrantEnabled: settings.roleGrantEnabled === false })}
                    onLabel="사용 중"
                    offLabel="사용 안 함"
                  />
                </FieldRow>
                <div className={settings.roleGrantEnabled === false ? "opacity-40 pointer-events-none" : ""}>
                  <FieldRow label="알림 채널" changed={chg("roleGrantChannelId")} hint="레벨 보상 역할이 지급됐을 때 메시지를 보낼 채널">
                    <Dropdown
                      theme="light"
                      buttonClassName={DD}
                      value={settings.roleGrantChannelId || ""}
                      onChange={(v) => setSettings({ ...settings, roleGrantChannelId: v })}
                      options={[{ value: "", label: "레벨업 알림 채널과 동일" }, ...textChannelOptions]}
                    />
                  </FieldRow>
                  <FieldRow
                    label="알림 문구"
                    top
                    changed={chg("roleGrantMessage")}
                    hint={<><b className="text-[#131313]">{"{user}"}</b> 멘션 · <b className="text-[#131313]">{"{role}"}</b> 지급된 역할명 · <b className="text-[#131313]">{"{level}"}</b> 도달 레벨</>}
                  >
                    <textarea rows={2} value={settings.roleGrantMessage || ""} onChange={(e) => setSettings({ ...settings, roleGrantMessage: e.target.value })} className={`${inputClass} resize-none`} />
                  </FieldRow>
                </div>
              </Panel>
            </div>
          </PanelGrid>

          {/* 📌 공개 · 초기화 — 켜고 끄는 순간 유저 화면이 바뀌거나 기록이 지워지는 설정만 한곳에. 저장 줄로 저장된다 */}
          <Panel id="sec-public" className="mt-5 scroll-mt-24 !border-[#e91e3f]/40" title={<span className="text-[#d01634]">공개 · 초기화</span>} flush>
            <FieldRow label="ARCTIC 상점 공개" changed={chg("shopPublic")} hint="비공개면 일반 유저에게 ‘준비 중’ 화면이 보이고 관리자만 상점을 이용할 수 있습니다">
              <Toggle
                on={!!settings.shopPublic}
                onClick={() => setSettings({ ...settings, shopPublic: !settings.shopPublic })}
                onLabel="공개 중"
                offLabel="비공개 (관리자만)"
              />
            </FieldRow>
            <FieldRow label="SYSTEM : LEVEL 공개" changed={chg("levelPublic")} hint="비공개면 /level 전체(ARCTIC·시즌 패스·랭킹 포함)가 예고 화면으로 바뀌고 메뉴에서 빠집니다">
              <Toggle
                on={!!settings.levelPublic}
                onClick={() => setSettings({ ...settings, levelPublic: !settings.levelPublic })}
                onLabel="공개 중"
                offLabel="비공개 (관리자만) · 10월 공개 예정"
              />
            </FieldRow>
            <FieldRow label="서버 퇴장 시 XP 초기화" changed={chg("resetOnLeave")} hint="켜면 나간 유저의 XP 기록이 삭제되어 복구할 수 없습니다">
              <Toggle
                on={!!settings.resetOnLeave}
                onClick={() => setSettings({ ...settings, resetOnLeave: !settings.resetOnLeave })}
                onLabel="초기화함"
                offLabel="유지함 (기본)"
              />
            </FieldRow>
          </Panel>
        </>
      ) : loadingRow)}

      {/* ═══════════ 역할 ═══════════
          📌 세부 탭 다섯을 두 열로 — 왼쪽은 역할 목록 · 티어 연결, 오른쪽은 서포터즈 · 보호 역할(저장 줄) · 인벤토리 안내 */}
      {tab === "roles" && (
        <PanelGrid>
          <div className="min-w-0 space-y-5">
            <Panel
              id="sec-reward"
              className="scroll-mt-24"
              title={<>레벨 보상 역할<Count n={configs.length} /></>}
              right={<Btn variant="secondary" size="sm" onClick={() => { setRoleForm(EMPTY_ROLE); openFormAt("role"); }}>＋ 추가</Btn>}
              flush
            >
              {isLoading ? loadingRow
                : configs.length === 0 ? <PanelEmpty>설정된 역할이 없습니다.</PanelEmpty>
                : (
                  <DataTable
                    className={tableFlat}
                    columns={roleCols}
                    rows={configs}
                    rowKey={(c) => c._id}
                    selectedKey={isFormOpen("role") ? editId : null}
                    onRowClick={(c) => {
                      // exclusive 는 폼에 칸이 없다 — 옮겨 담지 않으면 티어 역할을 수정할 때 조용히 풀린다
                      setRoleForm({
                        roleId: c.roleId,
                        rewardLevel: c.rewardLevel == null ? "" : String(c.rewardLevel),
                        buffXp: c.buffXp ? String(c.buffXp) : "",
                        attendBuffXp: c.attendBuffXp ? String(c.attendBuffXp) : "",
                        exclusive: !!c.exclusive,
                      });
                      openFormAt("role", c._id);
                    }}
                  />
                )}
            </Panel>

            <Panel
              id="sec-tier"
              className="scroll-mt-24"
              title="음성 티어 역할 일괄 연결"
              desc="지급 레벨이 자동으로 채워지고 배타 모드로 저장돼 승급 시 아래 티어 역할이 회수됩니다 · 역할의 ‘따로 표시(hoist)’를 켜면 멤버 목록이 티어별로 묶입니다"
              right={
                <>
                  <Btn variant="ghost" size="sm" onClick={() => setTierMap({})}>선택 초기화</Btn>
                  <Btn size="sm" onClick={saveTierRoles} disabled={tierSaving}>{tierSaving ? "연결 중…" : "티어 역할 연결"}</Btn>
                </>
              }
              flush
            >
              {(VOICE_TIERS as any[]).map((t) => (
                <FieldRow
                  key={t.key}
                  label={
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span aria-hidden className="shrink-0 w-2.5 h-2.5 rotate-45" style={{ backgroundColor: t.c }} />
                      <span className="truncate" style={{ color: t.c }}>{t.name}</span>
                      <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">Lv.{t.min}+</span>
                    </span>
                  }
                >
                  <select value={tierMap[t.key] || ""} onChange={(e) => setTierMap({ ...tierMap, [t.key]: e.target.value })} className={inputClass}>
                    <option value="">— 역할 선택 —</option>
                    {grantableRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </FieldRow>
              ))}
            </Panel>
          </div>

          <div className="min-w-0 space-y-5">
            {/* 📌 서포터즈 설정도 BotSetting 단일 문서의 필드라 저장은 저장 줄(기존 postSettings)을 그대로 탄다 */}
            <Panel id="sec-supporter" className="scroll-mt-24" title="서포터즈" desc="입장 반영은 세션 갱신(최대 10분) 뒤입니다." flush>
              {!settings ? loadingRow : (
                <>
                  <FieldRow label="서포터즈 역할" changed={chg("supporterRoleId")} hint="환경변수 DISCORD_SUPPORTER_ROLE_ID 가 있으면 그 값이 우선합니다">
                    <Dropdown
                      theme="light"
                      buttonClassName={DD}
                      value={settings.supporterRoleId || ""}
                      onChange={(v) => setSettings({ ...settings, supporterRoleId: v })}
                      placeholder="역할을 선택하세요"
                      options={[{ value: "", label: "지정 안 함" }, ...roleOptions(guildRoles)]}
                    />
                  </FieldRow>
                  <FieldRow label="월 기본 XP" changed={chg("supporterBaseXp")}>
                    <Inline>
                      <input type="number" min={0} value={settings.supporterBaseXp ?? 150000} onChange={(e) => setSettings({ ...settings, supporterBaseXp: e.target.value })} className={numClass} />
                      XP
                    </Inline>
                  </FieldRow>
                  <FieldRow label="월 목표 채팅" changed={chg("supporterGoalChat")} hint="0 이면 목표 없음">
                    <Inline>
                      <input type="number" min={0} value={settings.supporterGoalChat ?? 0} onChange={(e) => setSettings({ ...settings, supporterGoalChat: e.target.value })} className={numClass} />
                      회
                    </Inline>
                  </FieldRow>
                  <FieldRow label="월 목표 음성" changed={chg("supporterGoalVoiceMin")} hint="0 이면 목표 없음">
                    <Inline>
                      <input type="number" min={0} value={settings.supporterGoalVoiceMin ?? 0} onChange={(e) => setSettings({ ...settings, supporterGoalVoiceMin: e.target.value })} className={numClass} />
                      분
                    </Inline>
                  </FieldRow>
                </>
              )}
            </Panel>

            <Panel
              id="sec-protected"
              className="scroll-mt-24"
              title="시즌 전환 보호 역할"
              desc="시즌 전환으로 디스코드 역할을 뗄 때도 절대 제외할 역할 — 어린이·청소년·어른 같은 등급 역할"
              flush
            >
              {!settings ? loadingRow : (
                <FieldRow label="보호할 역할" top changed={chg("protectedRoleIds")} hint="선택한 역할은 상품으로 팔렸더라도 시즌 전환 대상에서 제외됩니다">
                  {/* 여러 개를 고르는 자리라 항목을 눌러도 목록이 닫히지 않는다 — 공용 Dropdown 은 단일 선택용이다 */}
                  <div className={`relative ${isProtectedRoleOpen ? "z-50" : ""}`}>
                    <button type="button" onClick={() => setIsProtectedRoleOpen(!isProtectedRoleOpen)} className={`${inputClass} flex items-center justify-between text-left`}>
                      {protectedRoleIds.length > 0
                        ? <span className="font-bold">{protectedRoleIds.length}개 역할 선택됨</span>
                        : <span className="text-[#a3a3a3]">역할을 선택하세요</span>}
                      <span className="text-[10px] text-[#a3a3a3]">▼</span>
                    </button>
                    {isProtectedRoleOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsProtectedRoleOpen(false)}></div>
                        <div className="absolute top-full left-0 w-full mt-1.5 bg-white border border-[#ededed] rounded-lg overflow-hidden shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] z-50 max-h-64 overflow-y-auto">
                          {guildRoles.map((r) => {
                            const picked = protectedRoleIds.includes(r.id);
                            return (
                              <button key={r.id} type="button" onClick={() => toggleProtectedRole(r.id)}
                                className={`w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-2.5 transition-colors outline-none ${picked ? "bg-[#e91e3f]/[0.08] text-[#d01634] font-bold" : "text-[#5a5a5a] hover:bg-[#f2f2f2]"}`}>
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                                <span className="truncate">{r.name}</span>
                                {picked && <span className="ml-auto text-[11px] shrink-0">선택됨</span>}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  {protectedRoleIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {protectedRoleIds.map((id) => {
                        const r = guildRoles.find((g) => g.id === id);
                        return (
                          <span key={id} className="inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#131313]">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r?.color || "#99aab5" }}></span>
                            {/* 디스코드에서 지워진 역할도 ID 로 남겨 둔다 — 조용히 사라지면 무엇이 빠졌는지 알 수 없다 */}
                            <span className="truncate max-w-[14rem]">{r?.name || `삭제된 역할 (${id})`}</span>
                            <button type="button" aria-label="빼기" onClick={() => toggleProtectedRole(id)} className="w-5 h-5 rounded-full text-[#5a5a5a] hover:text-[#d01634] transition-colors outline-none">✕</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </FieldRow>
              )}
            </Panel>

            {/* 📌 표기는 이제 아이템 등록 한 곳에서 관리한다 — 여기 남은 옛 데이터는 그쪽의 가져오기 버튼이 옮긴다 */}
            <Panel
              id="sec-inventory"
              className="scroll-mt-24"
              title="인벤토리 표기"
              right={<Link href="/admin/shop?tab=items" className={LINK_PILL}>아이템 등록으로</Link>}
            >
              <p className="text-[13px] text-[#5a5a5a] break-keep">
                인벤토리 표기는 <b className="text-[#131313]">아이템 등록</b>에서 관리합니다.
                {invRoles.length > 0 && <span className="block mt-1 text-[12px] text-[#5a5a5a]">옛 표기 역할 {invRoles.length}개가 남아 있습니다.</span>}
              </p>
            </Panel>
          </div>
        </PanelGrid>
      )}

      {/* ═══════════ 콘텐츠 ═══════════
          📌 퀘스트(표가 넓다)는 전체 폭, 채널 정책 · 부스트는 그 아래 두 열. 줄을 누르면 편집 칸이 뜬다 */}
      {tab === "content" && (
        <>
          <Panel
            id="sec-quests"
            className="scroll-mt-24"
            title={<>퀘스트<Count n={quests.length} /></>}
            right={
              <>
                <Btn variant="ghost" size="sm" onClick={openPicks}>노출 방식</Btn>
                <Btn variant="secondary" size="sm" onClick={() => { setQuestForm(EMPTY_QUEST); openFormAt("quest"); }}>＋ 추가</Btn>
              </>
            }
            flush
          >
            {/* 주기별 요약 — 예전 주기별 묶음 머리에 있던 개수 · 노출 방식 한 줄 */}
            <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[#ededed]">
              {QUEST_PICK_FIELDS.map((f, i) => {
                const rows = quests.filter((q) => (q.period || "daily") === f.period);
                const on = rows.filter((q) => q.enabled).length;
                const pick = Number(settings?.[f.key] ?? 0);
                return (
                  <div key={f.period} className={`min-w-0 px-5 py-3 border-[#ededed] ${i > 0 ? "border-t md:border-t-0 md:border-l" : ""}`}>
                    <p className="text-[13px] font-bold">{PERIOD_LABEL[f.period]} 퀘스트<Count n={rows.length} /></p>
                    <p className="mt-0.5 text-[12px] text-[#5a5a5a] break-keep">
                      {rows.length === 0
                        ? f.every + " 초기화"
                        : pick > 0
                        ? `${f.every}마다 활성 ${on}개 중 ${Math.min(pick, on)}개 무작위`
                        : `활성 ${on}개 전부 노출 · ${f.every} 초기화`}
                    </p>
                  </div>
                );
              })}
            </div>
            {isLoading ? loadingRow
              : questRows.length === 0 ? <PanelEmpty>등록된 퀘스트가 없습니다.</PanelEmpty>
              : (
                <DataTable
                  className={tableFlat}
                  columns={questCols}
                  rows={questRows}
                  rowKey={(q) => q._id}
                  selectedKey={isFormOpen("quest") ? editId : null}
                  onRowClick={(q) => {
                    setQuestForm({ id: q._id, name: q.name, desc: q.desc || "", period: q.period || "daily", reason: q.reason, metric: q.metric, target: q.target, rewardXp: q.rewardXp, rewardPoint: q.rewardPoint || 0, enabled: q.enabled, order: q.order });
                    openFormAt("quest", q._id);
                  }}
                />
              )}
          </Panel>

          <PanelGrid className="mt-5">
            <Panel
              id="sec-channels"
              className="scroll-mt-24"
              title={<>채널 정책<Count n={channelConfigs.length} /></>}
              right={<Btn variant="secondary" size="sm" onClick={() => { setChForm(EMPTY_CHANNEL); openFormAt("channel"); }}>＋ 추가</Btn>}
              flush
            >
              {isLoading ? loadingRow
                : channelConfigs.length === 0 ? <PanelEmpty>설정된 채널이 없습니다.</PanelEmpty>
                : (
                  <DataTable
                    className={tableFlat}
                    columns={channelCols}
                    rows={channelConfigs}
                    rowKey={(c) => c._id}
                    selectedKey={isFormOpen("channel") ? editId : null}
                    onRowClick={(c) => { setChForm({ channelId: c.channelId, boostXp: c.boostXp ? String(c.boostXp) : "", excluded: !!c.excluded }); openFormAt("channel", c._id); }}
                  />
                )}
            </Panel>

            <Panel
              id="sec-boosts"
              className="scroll-mt-24"
              title={<>기간제 부스트<Count n={boosts.length} /></>}
              right={<Btn variant="secondary" size="sm" onClick={() => { setBoostForm(EMPTY_BOOST); openFormAt("boost"); }}>＋ 추가</Btn>}
              flush
            >
              {isLoading ? loadingRow
                : boosts.length === 0 ? <PanelEmpty>등록된 부스트가 없습니다.</PanelEmpty>
                : (
                  <DataTable
                    className={tableFlat}
                    columns={boostCols}
                    rows={boosts}
                    rowKey={(b) => b._id}
                    selectedKey={isFormOpen("boost") ? editId : null}
                    onRowClick={(b) => {
                      setBoostForm({ id: b._id, name: b.name, targetRoleId: b.targetRoleId || "", targetChannelId: b.targetChannelId || "", boostXp: String(b.boostXp), startAt: toLocalInput(b.startAt), endAt: toLocalInput(b.endAt) });
                      openFormAt("boost", b._id);
                    }}
                  />
                )}
            </Panel>
          </PanelGrid>
        </>
      )}

      {/* ═══════════ 지급 · 내역 ═══════════
          📌 왼쪽 좁은 열에 수동 지급 · 초기화 폼, 오른쪽 넓은 열에 내역 표. 좁은 화면에선 위아래로 */}
      {tab === "ledger" && (
        <div className="xl:flex xl:items-start xl:gap-5">
          <div className="xl:w-[440px] xl:shrink-0 min-w-0 space-y-5 mb-5 xl:mb-0">
            <Panel
              id="sec-grant"
              className="scroll-mt-24"
              title="수동 지급"
              right={<Segmented options={GRANT_KINDS} value={grantKind} onChange={(v) => setGrantKind(v as GrantKind)} />}
            >
              {grantKind !== "item" ? (
                <>
                  <form onSubmit={submitGrant}>
                    <Field label={<>대상 <Req /></>} hint="XP 기록이 있는 유저만 검색됩니다">
                      <input type="text" value={grantForm.target} onChange={(e) => setGrantForm({ ...grantForm, target: e.target.value })}
                        placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
                    </Field>
                    {/* 📌 빙옥은 1 = 1,000 XP 단위(lib/pointRate) — XP 숫자를 그대로 넣지 않게 입력 옆에 환율을 둔다 */}
                    <Field
                      label={<>지급 {grantUnit} <Req /></>}
                      hint={`${grantKind === "point" ? `1 빙옥 = ${POINT_RATE.toLocaleString()} XP · ` : ""}음수를 넣으면 회수됩니다 (보유량을 넘지 않게 잘립니다)`}
                    >
                      <input type="number" value={grantForm.amount} onChange={(e) => setGrantForm({ ...grantForm, amount: e.target.value })}
                        placeholder={grantKind === "point" ? "예: 50 (회수는 -50)" : "예: 50000 (회수는 -50000)"} className={inputClass} />
                    </Field>
                    <Field label="사유" hint="비우면 ‘관리자 지급’으로 기록됩니다">
                      <input type="text" value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })}
                        placeholder="예: 이벤트 우승 보상" className={inputClass} />
                    </Field>

                    {Number(grantForm.amount) !== 0 && grantForm.amount !== "" && (
                      <p className={`mb-4 px-3 py-2.5 rounded-lg text-[13px] font-bold break-keep ${
                        Number(grantForm.amount) > 0 ? "bg-[#e91e3f]/[0.08] text-[#d01634]" : "bg-amber-50 text-amber-700"
                      }`}>
                        {Number(grantForm.amount) > 0
                          ? `${Number(grantForm.amount).toLocaleString()} ${grantUnit} 지급${grantKind === "xp" ? " — 레벨이 올라갈 수 있습니다" : ""}`
                          : `${Math.abs(Number(grantForm.amount)).toLocaleString()} ${grantUnit} 회수${grantKind === "xp" ? " — 레벨이 내려갈 수 있습니다" : ""}`}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Btn type="submit" variant="primary" disabled={isGranting}>{isGranting ? "처리 중…" : "지급"}</Btn>
                      <Btn type="button" variant="danger" onClick={submitRemove} disabled={isGranting || !grantForm.amount}>{grantUnit} 제거</Btn>
                      <Btn type="button" variant="secondary" onClick={() => setConfirmAll(true)} disabled={isGranting || !grantForm.amount}>전체 유저에게 지급</Btn>
                    </div>
                  </form>
                  <p className={fieldNote}>
                    {grantKind === "xp"
                      ? "봇 큐에 쌓여 30초 이내에 반영되고(레벨도 함께 재계산), 봇이 꺼져 있으면 켜질 때 처리됩니다."
                      : "즉시 반영됩니다."}
                  </p>
                </>
              ) : (
                <>
                  <form onSubmit={submitItemGrant}>
                    <Field label={<>아이템 <Req /></>} hint={<Link href="/admin/shop?tab=items" className="font-bold text-[#e91e3f] hover:text-[#d01634] hover:underline">아이템 등록</Link>}>
                      <Dropdown
                        theme="light"
                        buttonClassName={DD}
                        value={itemGrant.itemId}
                        onChange={(v) => setItemGrant({ ...itemGrant, itemId: v })}
                        placeholder={grantItems.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
                        options={grantItems.map((it: any) => ({
                          value: it._id, label: it.name, hint: itemTypeLabel(it.type),
                          icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
                        }))}
                      />
                    </Field>
                    <Field label="기간">
                      <Segmented options={ITEM_GRANT_DAYS} value={itemGrant.daysMode} onChange={(v) => setItemGrant({ ...itemGrant, daysMode: v })} />
                      {itemGrant.daysMode === "custom" && (
                        <Inline className="mt-2">
                          <input type="number" min={1} max={3650} value={itemGrant.days} onChange={(e) => setItemGrant({ ...itemGrant, days: e.target.value })}
                            placeholder="일수" className={numClass} />
                          일
                        </Inline>
                      )}
                    </Field>
                    <Field label={<>대상 <Req /></>} hint="XP 기록이 있는 유저만 검색됩니다">
                      <input type="text" value={itemGrant.target} onChange={(e) => setItemGrant({ ...itemGrant, target: e.target.value })}
                        placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
                    </Field>
                    <Field label="사유">
                      <input type="text" value={itemGrant.reason} onChange={(e) => setItemGrant({ ...itemGrant, reason: e.target.value })}
                        placeholder="예: 이벤트 우승 보상" className={inputClass} />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Btn type="submit" variant="primary" disabled={isGranting || !itemGrant.itemId}>{isGranting ? "처리 중…" : "지급"}</Btn>
                      <Btn type="button" variant="secondary" onClick={() => setConfirmAllItem(true)} disabled={isGranting || !itemGrant.itemId}>전체 유저에게 지급</Btn>
                    </div>
                  </form>
                  <p className={fieldNote}>역할이 연결된 아이템은 봇이 30초 이내에 역할을 붙입니다. 이미 보유한 유저는 건너뜁니다.</p>
                </>
              )}
            </Panel>

            {grantKind === "item" && itemGrants.length > 0 && (
              <Panel title={<>최근 아이템 지급<Count n={itemGrants.length} /></>} flush>
                <div className="divide-y divide-[#ededed]">
                  {itemGrants.map((g: any) => {
                    const st = GRANT_STATUS[g.status] || { l: g.status, tone: "neutral" as const };
                    return (
                      <div key={g._id} className="px-5 py-3 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{g.userName || g.userId}</span>
                          <StatusChip tone={st.tone}>{st.l}</StatusChip>
                        </div>
                        <p className="mt-1 text-[12px] text-[#5a5a5a] truncate">
                          {g.itemName}{g.adminNote ? ` · ${g.adminNote}` : ""} · {g.days > 0 ? `${g.days}일` : "영구"}
                          <span className="ml-2 text-[#8a8a8a] tabular-nums">{fmtDateTime(g.createdAt)}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* 📌 초기화는 되돌릴 수 없다 — 빨간 테두리로 따로 떼고, 누르면 확인 모달을 한 번 더 거친다 */}
            <Panel
              id="sec-reset"
              className="scroll-mt-24 !border-[#e91e3f]/40"
              title={<span className="text-[#d01634]">XP 초기화</span>}
              desc="되돌릴 수 없습니다 — 레벨 보상 역할도 봇이 30초 이내에 함께 회수하며, ARCTIC에서 구매한 역할만 남습니다."
            >
              <Field label="대상" hint="‘수동 지급’의 XP · 빙옥 대상 칸과 같은 값을 씁니다">
                <input type="text" value={grantForm.target} onChange={(e) => setGrantForm({ ...grantForm, target: e.target.value })}
                  placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Btn variant="danger" disabled={isGranting || !grantForm.target.trim()} onClick={() => setConfirmReset(grantForm.target.trim())}>
                  위 대상 초기화
                </Btn>
                <Btn variant="danger" disabled={isGranting} onClick={() => setConfirmReset("all")}>
                  전체 유저 초기화
                </Btn>
              </div>
            </Panel>
          </div>

          <div className="flex-1 min-w-0">
            {/* 두 출처의 건수는 세는 기준이 달라(봇=전체 검색 결과, 수동=최근 50건) 따로 적는다.
                지금 필터가 덮지 않는 쪽은 감춘다 — '채팅'을 보는 중에 '수동 37'이 남아 있으면 그 37건이 목록에 있는 줄 안다. */}
            <Panel
              id="sec-logs"
              className="scroll-mt-24"
              title="지급 내역"
              desc="봇 기록은 60일까지만 보관 · 수동 기록은 최근 50건"
              right={
                <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">
                  {ledgerFilter === "manual"
                    ? `수동 ${manualRows.length.toLocaleString()}`
                    : ledgerFilter === ""
                    ? `봇 ${logTotal.toLocaleString()} · 수동 ${manualRows.length.toLocaleString()}`
                    : `봇 ${logTotal.toLocaleString()}`}
                </span>
              }
              flush
            >
              <div className="px-5 py-3 border-b border-[#ededed]">
                <Toolbar className="!mb-0">
                  <SearchInput value={logQuery} onChange={(v) => { setLogQuery(v); setLogPage(0); }} placeholder="유저 이름 검색" />
                  <Segmented
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
                </Toolbar>
              </div>

              {ledgerRows.length === 0 ? (
                <PanelEmpty>표시할 지급 내역이 없습니다.</PanelEmpty>
              ) : (
                <>
                  <DataTable className={tableFlat} columns={ledgerCols} rows={ledgerRows} rowKey={(r) => r.k} />
                  {/* 쪽 넘김은 봇 로그 기준 — 수동 지급은 최근 50건이 전부라 나눌 쪽이 없다 */}
                  {ledgerFilter !== "manual" && (
                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#ededed]">
                      <Btn variant="ghost" size="sm" disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p - 1))}>이전</Btn>
                      <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{logPage + 1} / {Math.max(1, Math.ceil(logTotal / 50))}</span>
                      <Btn variant="ghost" size="sm" disabled={(logPage + 1) * 50 >= logTotal} onClick={() => setLogPage((p) => p + 1)}>다음</Btn>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* 작동 방식 각주 */}
      <div className="mt-8 pt-5 border-t border-[#ededed] max-w-4xl text-[12px] text-[#5a5a5a] leading-relaxed break-keep">
        <p><b className="text-[#131313]">작동 방식</b> — 봇이 1분마다 설정을 다시 읽습니다. 최종 지급량 = 기본 XP + 역할 Boost + 채널 Boost + 기간제 부스트 (음소거 시 설정된 배율 적용).</p>
        <p className="mt-1">역할 자동 지급이 작동하려면 봇에게 <b className="text-[#131313]">역할 관리 권한</b>이 있고, 봇의 역할이 지급 대상 역할보다 <b className="text-[#131313]">위에</b> 있어야 합니다.</p>
      </div>

      {/* ═══════════ 편집 칸 ═══════════ */}
      <EditPane
        open={isFormOpen("role")}
        title={editId ? "역할 수정" : "역할 추가"}
        badge={roleForm.exclusive ? <StatusChip>등급 역할</StatusChip> : undefined}
        saveLabel="저장"
        onSubmit={saveRole}
        onCancel={() => { setRoleForm(EMPTY_ROLE); closeForm(); }}
        onDelete={editId ? () => setDeleteConfirm({ kind: "role", id: editId }) : undefined}
      >
        <Field label={<>디스코드 역할 <Req /></>} hint="디스코드가 관리하는 역할(서버 부스트 등)은 봇이 지급할 수 없어 목록에 없습니다">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={roleForm.roleId}
            onChange={(v) => setRoleForm({ ...roleForm, roleId: v })}
            placeholder="역할을 선택하세요"
            options={roleOptions(grantableRoles)}
          />
        </Field>
        <Field label="지급 레벨 (선택)" hint="비우면 Boost 효과만 적용">
          <input type="number" min={1} max={1000} placeholder="예: 100" value={roleForm.rewardLevel} onChange={(e) => setRoleForm({ ...roleForm, rewardLevel: e.target.value })} className={inputClass} />
        </Field>
        <Field label="채팅/음성 Boost XP" hint="보유자의 XP 지급마다 추가">
          <input type="number" min={0} placeholder="예: 300" value={roleForm.buffXp} onChange={(e) => setRoleForm({ ...roleForm, buffXp: e.target.value })} className={inputClass} />
        </Field>
        <Field label="출석 Boost XP" hint="출석체크 시 추가 지급">
          <input type="number" min={0} placeholder="예: 7000" value={roleForm.attendBuffXp} onChange={(e) => setRoleForm({ ...roleForm, attendBuffXp: e.target.value })} className={inputClass} />
        </Field>
        {roleForm.exclusive && (
          <p className={fieldNote}>티어 사다리(등급 역할)로 저장돼 있습니다 — 승급하면 아래 티어 역할이 자동 회수됩니다.</p>
        )}
      </EditPane>

      <EditPane
        open={isFormOpen("channel")}
        title={editId ? "채널 정책 수정" : "채널 정책 추가"}
        saveLabel="저장"
        onSubmit={saveChannel}
        onCancel={() => { setChForm(EMPTY_CHANNEL); closeForm(); }}
        onDelete={editId ? () => setDeleteConfirm({ kind: "channel", id: editId }) : undefined}
      >
        <Field label={<>디스코드 채널 · 카테고리 <Req /></>} hint="카테고리를 선택하면 하위 채널 전체에 적용됩니다">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={chForm.channelId}
            onChange={(v) => setChForm({ ...chForm, channelId: v })}
            placeholder="채널 또는 카테고리를 선택하세요"
            options={channelOptions}
          />
        </Field>
        <Field label="Boost XP" hint="이 채널에서의 XP 지급마다 추가">
          <input type="number" min={0} placeholder="예: 500" value={chForm.boostXp} onChange={(e) => setChForm({ ...chForm, boostXp: e.target.value })} disabled={chForm.excluded} className={inputClass} />
        </Field>
        <Field label="XP 지급 제외" hint="봇 명령어 채널 등에 사용">
          <Toggle
            on={!!chForm.excluded}
            onClick={() => setChForm({ ...chForm, excluded: !chForm.excluded })}
            onLabel="지급 안 함"
            offLabel="지급함 (기본)"
          />
        </Field>
      </EditPane>

      <EditPane
        open={isFormOpen("boost")}
        title={editId ? "부스트 수정" : "부스트 추가"}
        saveLabel={boostForm.id ? "수정 저장" : "부스트 등록"}
        onSubmit={saveBoost}
        onCancel={() => { setBoostForm(EMPTY_BOOST); closeForm(); }}
        onDelete={editId ? () => setDeleteConfirm({ kind: "boost", id: editId }) : undefined}
      >
        <Field label="부스트 이름">
          <input type="text" placeholder="예: 주말 2배 이벤트" value={boostForm.name} onChange={(e) => setBoostForm({ ...boostForm, name: e.target.value })} className={inputClass} />
        </Field>
        <Field label="대상 역할" hint="역할을 고르면 해당 역할 보유자에게만 적용">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={boostForm.targetRoleId}
            onChange={(v) => setBoostForm({ ...boostForm, targetRoleId: v })}
            options={[{ value: "", label: "서버 전체" }, ...roleOptions(guildRoles)]}
          />
        </Field>
        <Field label="대상 채널 · 카테고리" hint="카테고리 선택 시 하위 채널 전체에 적용 · 역할과 함께 지정하면 둘 다 만족해야 발동">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={boostForm.targetChannelId}
            onChange={(v) => setBoostForm({ ...boostForm, targetChannelId: v })}
            options={[{ value: "", label: "모든 채널" }, ...channelOptions]}
          />
        </Field>
        <Field label={<>추가 XP <Req /></>} hint="채팅·음성 지급 1회당 추가">
          <input type="number" min={1} placeholder="예: 1000" value={boostForm.boostXp} onChange={(e) => setBoostForm({ ...boostForm, boostXp: e.target.value })} className={inputClass} />
        </Field>
        <Field label={<>시작 <Req /></>}>
          <input type="datetime-local" value={boostForm.startAt} onChange={(e) => setBoostForm({ ...boostForm, startAt: e.target.value })} className={inputClass} />
        </Field>
        <Field label={<>종료 <Req /></>}>
          <input type="datetime-local" value={boostForm.endAt} onChange={(e) => setBoostForm({ ...boostForm, endAt: e.target.value })} className={inputClass} />
        </Field>
      </EditPane>

      <EditPane
        open={isFormOpen("quest")}
        width={480}
        title={editId ? "퀘스트 수정" : "퀘스트 추가"}
        sub="진행도는 봇의 XP 지급 로그(채팅·음성·출석)로 판정합니다 · 출석 기준 시간과 보상은 정책 탭 지급량 · 주기에서"
        saveLabel={questForm.id ? "수정 저장" : "퀘스트 등록"}
        onSubmit={saveQuest}
        onCancel={() => { setQuestForm(EMPTY_QUEST); closeForm(); }}
        onDelete={editId ? () => setDeleteConfirm({ kind: "quest", id: editId }) : undefined}
      >
        <Field label="퀘스트 이름">
          <input value={questForm.name} onChange={(e) => setQuestForm({ ...questForm, name: e.target.value })}
            placeholder="예: 오늘의 수다" maxLength={40} className={inputClass} />
        </Field>
        <Field label="설명 (선택)" hint="유저 화면에서 퀘스트 이름 아래 회색으로 표시됩니다.">
          <input value={questForm.desc} onChange={(e) => setQuestForm({ ...questForm, desc: e.target.value })}
            placeholder="예: 채팅으로 XP를 5번 받으세요" maxLength={120} className={inputClass} />
        </Field>
        <Field label="초기화 주기" hint="진행도와 보상 수령이 이 주기마다 초기화됩니다 (KST) — 일일 매일 자정 · 주간 매주 월요일 · 월간 매월 1일">
          <Segmented
            options={[{ v: "daily", l: "일일" }, { v: "weekly", l: "주간" }, { v: "monthly", l: "월간" }]}
            value={questForm.period}
            onChange={(v) => setQuestForm({ ...questForm, period: v })}
          />
        </Field>
        <Field label="측정 대상" hint="어떤 활동의 지급 로그를 셀지 고릅니다.">
          <Segmented
            options={[{ v: "chat", l: "채팅" }, { v: "voice", l: "음성" }, { v: "attend", l: "출석" }, { v: "any", l: "전체" }]}
            value={questForm.reason}
            onChange={(v) => setQuestForm({ ...questForm, reason: v })}
          />
        </Field>
        <Field
          label="측정 방식"
          hint={
            questForm.metric === "xp"
              ? "받은 XP의 합계로 판정합니다."
              : questForm.metric === "minute"
              ? `음성 채널에 머문 시간(분)으로 판정합니다. 지급 주기 ${Math.max(1, Math.round((settings?.voiceIntervalSec ?? 300) / 60))}분마다 1분 단위로 쌓입니다.`
              : "XP를 받은 횟수로 판정합니다. (음성은 1회 = 지급 주기)"
          }
        >
          <Segmented
            options={[{ v: "count", l: "지급 횟수" }, { v: "xp", l: "XP 합계" }, { v: "minute", l: "접속 시간" }]}
            value={questForm.metric}
            onChange={(v) => setQuestForm({ ...questForm, metric: v })}
          />
        </Field>
        <Field
          label="목표치"
          hint={
            questForm.metric === "xp"
              ? "달성에 필요한 XP 합계"
              : questForm.metric === "minute"
              ? "달성에 필요한 접속 시간 (분) — 예: 2시간이면 120"
              : "달성에 필요한 지급 횟수"
          }
        >
          <input type="number" min={1} value={questForm.target} onChange={(e) => setQuestForm({ ...questForm, target: e.target.value })} className={inputClass} />
        </Field>
        {/* 보상 두 칸은 한 줄로 묶는다 — XP 와 빙옥이 서로 다른 줄로 갈라지지 않게 */}
        <Field label="보상" hint="빙옥은 등급이 높을수록 배율이 붙어 더 지급됩니다. 둘 다 0이면 보상 없는 ‘목표’가 됩니다.">
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="block mb-1 text-[12px] text-[#5a5a5a]">보상 XP</span>
              <input type="number" min={0} value={questForm.rewardXp} onChange={(e) => setQuestForm({ ...questForm, rewardXp: e.target.value })} className={inputClass} />
            </label>
            <label className="block min-w-0">
              <span className="block mb-1 text-[12px] text-[#5a5a5a]">보상 빙옥</span>
              <input type="number" min={0} value={questForm.rewardPoint} onChange={(e) => setQuestForm({ ...questForm, rewardPoint: e.target.value })} className={inputClass} />
            </label>
          </div>
        </Field>
        <Field label="표시 순서" hint="작을수록 위에 표시됩니다.">
          <input type="number" min={0} value={questForm.order} onChange={(e) => setQuestForm({ ...questForm, order: e.target.value })} className={numClass} />
        </Field>
        <Field label="유저 화면 표시">
          <Toggle
            on={!!questForm.enabled}
            onClick={() => setQuestForm({ ...questForm, enabled: !questForm.enabled })}
            onLabel="활성화됨 — 유저에게 표시"
            offLabel="비활성 — 숨김"
          />
        </Field>
      </EditPane>

      {/* 노출 방식 — 설정 문서를 통째로 덮어쓰기 때문에, 아직 못 불러왔으면 손대지 못하게 막는다 */}
      <EditPane
        open={isFormOpen("questPick")}
        title="주기별 노출 방식"
        sub="뽑기는 날짜로 고정돼 같은 주기 안에서는 모든 유저가 같은 퀘스트를 보며, 뽑히지 않은 퀘스트는 보상도 받을 수 없습니다."
        saveLabel="노출 방식 저장"
        onSubmit={savePicks}
        onCancel={cancelPicks}
      >
        {!settings ? loadingRow : QUEST_PICK_FIELDS.map((f) => {
          const total = quests.filter((q) => (q.period || "daily") === f.period && q.enabled).length;
          const pick = Number(settings?.[f.key] ?? 0);
          return (
            <Field
              key={f.key}
              label={`${PERIOD_LABEL[f.period]} 노출 개수`}
              hint={pick > 0 ? `활성 ${total}개 중 ${Math.min(pick, total)}개를 ${f.every}마다 새로 뽑습니다` : `활성 ${total}개를 전부 보여줍니다`}
            >
              <Inline>
                <input type="number" min={0} max={20} value={settings?.[f.key] ?? 0}
                  onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} className={numClass} />
                개
              </Inline>
            </Field>
          );
        })}
      </EditPane>

      <ConfirmDialog
        open={!!deleteConfirm}
        danger
        title="삭제 확인"
        confirmLabel="삭제"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          // 편집 칸에서 지운 줄이면 칸도 닫는다 — 열어 두면 '저장'이 지운 것을 다시 만든다
          const id = deleteConfirm?.id;
          await executeDelete();
          if (id && id === editId) closeForm();
        }}
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
                {Number(grantForm.amount) >= 0 ? "+" : ""}{Number(grantForm.amount).toLocaleString()} {grantUnit}
              </strong>
              를 반영합니다.
            </p>
            <p className="text-[12px] break-keep">되돌리려면 반대 부호로 다시 지급해야 합니다.</p>
          </>
        }
      />

      <ConfirmDialog
        open={confirmAllItem}
        title="전체 유저에게 아이템 지급"
        confirmLabel="전체 지급"
        busy={isGranting}
        onCancel={() => setConfirmAllItem(false)}
        onConfirm={() => runItemGrant("all")}
        body={
          <p className="break-keep">
            XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>에게{" "}
            <strong className="text-[#e91e3f]">{grantItems.find((it) => it._id === itemGrant.itemId)?.name || "아이템"}</strong>
            을 지급합니다. 이미 보유한 유저는 건너뜁니다.
          </p>
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
                ? <>XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>의 보유 XP와 레벨이 <strong className="text-[#d01634]">0</strong>이 됩니다.</>
                : <><strong className="text-[#131313]">{confirmReset}</strong> 님의 보유 XP와 레벨이 <strong className="text-[#d01634]">0</strong>이 됩니다.</>}
            </p>
            <p className="text-[12px] break-keep">되돌릴 수 없으며, 레벨 보상 역할도 함께 회수됩니다.</p>
          </>
        }
      />

      {noticeEl}
    </AdminPage>
  );
}
