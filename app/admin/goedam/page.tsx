"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { RARITIES, rarityOf } from "@/lib/rarity";
import GoedamModal from "../../level/GoedamModal";
import {
  SCREENING_TICKETS,
  SCREENING_RATIO,
  PRIZE_WEIGHT,
  MAX_TITLE,
  PRIZE_COUNT,
  NUM_MAX,
  MAX_CODE_LEN,
  MAX_CODES_PER_SAVE,
  MAX_SCREENINGS,
  MAX_PRIZES,
  VOICE_MINUTES,
  VOICE_TICKETS,
  voiceSid,
  voiceDayOf,
  voiceDayLabel,
} from "@/lib/goedamRules";
import {
  AdminPage,
  AdminTabs,
  Panel,
  PanelGrid,
  FieldRow,
  Inline,
  Switch,
  Segmented,
  Btn,
  SaveBar,
  StatRow,
  DataTable,
  DetailPane,
  DefRow,
  EmptyRow,
  Toolbar,
  SearchInput,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  ConfirmDialog,
  FormSheet,
  StatusChip,
  useAdminGuard,
  useToast,
  sfxErr,
  sfxTick,
  type Column,
} from "../ui";

// 📌 괴담회 관리 화면 — 「방구석 심야 괴담회」(2026-10-23 · 약속 문서 .claude/mockups/goedam/SPEC.md). 저장은 app/api/admin/goedam, 계산 · 지급은 lib/goedam.js.
//    틀은 이벤트 패스 화면(app/admin/event-pass)과 같다 — 탭 셋:
//      · 구성   — 기본 설정 + 요약, 회차 표, 상품 표, 바뀐 것이 있을 때만 뜨는 저장 줄(SaveBar). 줄을 누르면 오른쪽 편집 칸(폰은 아래 판)
//      · 명단   — 회차를 고르면 머문 시간 · 비율 · 지급 여부, 줄마다 「지급」(완청 못 한 사람에게 손으로 — app/api/admin/goedam/grant) · 디스코드 ID 로 직접 지급
//      · 추첨 기록 — 최근 300건. 지급이 실패한 결과는 「다시 지급」
//      · 그룹 지원 — 게임 그룹 지원(2026-10-25 · 약속 문서 .claude/mockups/goedam-group/SPEC.md §6) — 설정 · 문화상품권 번호 · 그룹 심사(아래 GroupsTab)
//    · 📌 2026-10-24 운영자 "디코 일정 시간한 것도 지급할 거고 상점에도 판매할 거라서 회차라는 개념이 좀 애매한데" — 추첨권을 받는 길은 셋:
//      「상영」(회차 표 — 이름만 바꿈) · 「음성 활동」(하루 음성 N분 → N장, 기본 꺼짐 · 저장은 같은 PUT 의 voice) · 「상점」(추첨권 아이템을 파는 상품 — 상점 관리 몫, 여기서는 보기 · 바로가기만).
//      명단 고르기에 음성 기록이 있는 날(「음성 M. D.」 — GoedamWatch sid "voice:<YYYY-MM-DD>")도 들어간다
//    · 저장 — 편집 칸 [저장] · Enter · 삭제 확인 · 저장 줄이 전부 한 PUT(설정 전체)으로 간다. sid · pid 는 서버가 발급하고 화면은 되돌려 보내기만 한다
//    · 시각은 KST 로 받고 보낸다(브라우저 시간대와 상관없이) — 추첨 종료 시각은 들어가지 않는다([열림, 닫힘))
//    · code 상품의 코드는 편집 칸의 붙여넣기 칸(줄마다 하나)으로만 넣는다 — 그 저장에만 실어 보내고(prizes[].codes), 서버가 없는 것만 넣는다(지우기 없음)
//    · 아이템(추첨권 · 아이템 상품)은 반영 전(초안에만 있는) 아이템도 고르고 저장한다(「반영 전」 칩). 추첨권 아이템이 실사이트에 없으면 「사용」을 켤 수 없고,
//      반영 전 아이템 상품은 추첨이 고르지 않는다(lib/goedam.js readyOf — 확률 칸이 「-」)
//    입력칸 · 표 · 상세 칸 · 확인 창 · 토스트 · 권한 화면은 전부 ../ui 의 공용 부품이다.

type PrizeKind = "xp" | "point" | "item" | "role" | "code" | "none";
// 📌 key — React 목록 · 편집 칸 전용 로컬 키(서버로 보내지 않는다). 저장된 줄은 "s:<sid>" · "p:<pid>", 새 줄은 "new:N"
type Screening = { key: string; sid: string; title: string; startsAt: string; endsAt: string; tickets: number; ratio: number };
type Prize = {
  key: string;
  pid: string;
  name: string;
  kind: PrizeKind;
  amount: number;
  itemId: string;
  itemName: string;
  count: number; // item 개수(1~99 — 그 밖 0)
  roleId: string;
  roleName: string;
  qty: number | null; // null = 무제한
  weight: number;
  rarity: string;
};
// 음성 활동 — 숫자 칸은 비울 수 있게 글자로 들고 있다가 보낼 때 숫자로(시각은 KST 칸 글자)
type VoiceCfg = { enabled: boolean; minutes: string; tickets: string; startsAt: string; endsAt: string };
// 저장할 한 벌 — 시각은 datetime-local 칸 글자(KST) 그대로 들고 있다가 보낼 때 ISO 로 바꾼다
type Cfg = {
  enabled: boolean;
  title: string;
  channelId: string;
  ticketItemId: string;
  drawOpensAt: string;
  drawClosesAt: string;
  screenings: Screening[];
  voice: VoiceCfg;
  prizes: Prize[];
};
// 추첨권을 파는 상품(서버 getGoedamAdmin shop) — 판매 중인 것 하나
type ShopLink = { id: string; name: string };
// 편집 칸 초안 — 숫자 칸을 비울 수 있어야 해서 글자로 들고 있다가 저장할 때 숫자로 바꾼다
type ScreeningDraft = { key: string; title: string; startsAt: string; endsAt: string; tickets: string; ratioPct: string };
type PrizeDraft = {
  key: string;
  name: string;
  kind: PrizeKind;
  amount: string;
  itemId: string;
  itemName: string;
  count: string; // 빈칸 = 1개
  roleId: string;
  roleName: string;
  qty: string;
  weight: string;
  rarity: string;
  codesText: string;
};
type Pane = { type: "screening"; isNew: boolean; d: ScreeningDraft } | { type: "prize"; isNew: boolean; d: PrizeDraft };
type SaveFrom = "pane" | "list";
type Stock = { given: number; total: number | null; left: number | null };
type ItemState = "live" | "draft" | "missing";
type GuildRole = { id: string; name: string; color?: string; managed?: boolean };
type RegItem = { _id: string; name: string; type?: string; icon?: string; imageUrl?: string; color?: string; _draft?: string; stackable?: boolean };
type RosterRow = { userId: string; userName: string; seconds: number; pct: number; earned: boolean; grantedAt: string | null; granted: number; manual: boolean };
type DrawRow = { id: string; at: string | null; userId: string; userName: string; pid: string; prizeName: string; kind: string; amount: number; code: string; granted: boolean; error: string };
type Tab = "config" | "watch" | "draws" | "groups";

const TABS: { id: Tab; short: string }[] = [
  { id: "config", short: "구성" },
  { id: "watch", short: "명단" },
  { id: "draws", short: "추첨 기록" },
  { id: "groups", short: "그룹 지원" },
];
const tabOf = (v: string | null): Tab => (v === "watch" || v === "draws" || v === "groups" ? v : "config");
// 📌 연출 미리보기(2026-10-23 운영자 "애니메이션 보는 것 좀") — 고른 결과 등급 · 종류로 레벨 화면 추첨 창(GoedamModal demo)을 서버 없이 띄운다.
//    추첨권 · 추첨 기록 · 지급은 그대로(읽기 · 쓰기 요청 없음). 이름 · 양은 그 종류의 첫 상품(없으면 예시 값)
const DEMO_RARITY = [{ v: "none", l: "꽝" }, ...RARITIES.map((r) => ({ v: r.v, l: r.l }))];
const DEMO_KIND = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "item", l: "아이템" },
  { v: "code", l: "코드" },
];
const DEMO_BASE: Record<string, { name: string; amount?: number; itemName?: string; count?: number; code?: string }> = {
  xp: { name: "XP", amount: 5000 },
  point: { name: "빙옥", amount: 300 },
  item: { name: "아이템", itemName: "아이템", count: 1 },
  code: { name: "스팀 월렛 코드", code: "DEMO-2026-1031" },
  none: { name: "다음 기회에" },
};
const tabHref = (id: string) => (id === "config" ? "/admin/goedam" : `/admin/goedam?tab=${id}`);

const KIND_OPTIONS: { v: PrizeKind; l: string }[] = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "item", l: "아이템" },
  { v: "role", l: "역할" },
  { v: "code", l: "코드" },
  { v: "none", l: "꽝" },
];
const KINDS = KIND_OPTIONS.map((o) => o.v);
const KIND_LABEL: Record<string, string> = Object.fromEntries(KIND_OPTIONS.map((o) => [o.v, o.l]));
const RARITY_OPTIONS = RARITIES.map((r) => ({ v: r.v, l: r.l }));
const ITEM_STATES: ItemState[] = ["live", "draft", "missing"];

const KST_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SNOWFLAKE = /^\d{17,20}$/;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주십시오.";
const EMPTY_VOICE: VoiceCfg = { enabled: false, minutes: "", tickets: "", startsAt: "", endsAt: "" };
const EMPTY_CFG: Cfg = { enabled: false, title: "", channelId: "", ticketItemId: "", drawOpensAt: "", drawClosesAt: "", screenings: [], voice: EMPTY_VOICE, prizes: [] };

// 서버가 준 값(정리 전) — 칸 이름만 믿고 값은 정리 함수가 다시 맞춘다
type Raw = Record<string, unknown>;
const rawOf = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const rawList = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(rawOf) : []);
const toInt = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// 정수 칸 글자 — "1,000" 도 받는다. 못 읽으면 NaN
const intText = (s: string) => {
  const t = String(s ?? "").replace(/[\s,]/g, "");
  return /^\d+$/.test(t) ? Number(t) : NaN;
};
// 📌 수량 칸 — 이벤트 패스 · 시즌 패스 화면과 같은 규칙("5만" · "1.5만" · "50k" · "50,000" · "5만xp")
const UNITS: Record<string, number> = { "": 1, k: 1e3, m: 1e6, 백: 1e2, 천: 1e3, 만: 1e4, 억: 1e8 };
const parseAmount = (raw: string) => {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/[\s,_]/g, "")
    .replace(/(xp|빙옥)$/, "");
  if (!s) return NaN;
  let total = 0;
  let rest = s;
  while (rest) {
    const m = /^(\d+(?:\.\d+)?|\.\d+)(k|m|백|천)?(만|억)?/.exec(rest);
    if (!m) return NaN;
    total += Number(m[1]) * UNITS[m[2] || ""] * UNITS[m[3] || ""];
    rest = rest.slice(m[0].length);
  }
  return Math.round(total);
};
const fmt = (n: number) => n.toLocaleString("ko-KR");

// ── 시각(KST) ─────────────────────────────────
// ISO → datetime-local 칸 글자(KST · 분까지) — 브라우저 시간대가 달라도 KST 로 보인다
const toKstInput = (v: unknown) => {
  const t = v ? new Date(String(v)).getTime() : NaN;
  return Number.isFinite(t) ? new Date(t + KST_MS).toISOString().slice(0, 16) : "";
};
// 칸 글자(KST) → ISO. 못 읽으면 ""
const fromKstInput = (v: string) => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/.exec(String(v || "").trim());
  if (!m) return "";
  const t = Date.parse(`${m[1]}:00+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const kstMs = (v: string) => Date.parse(fromKstInput(v));
const kstLabel = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${v.slice(5, 7)}. ${v.slice(8, 10)}. ${v.slice(11, 16)}` : "없음");
const kstDay = (v: string) => {
  const ms = kstMs(v);
  return Number.isFinite(ms) ? WEEK[new Date(ms + KST_MS).getUTCDay()] : "";
};
// 회차 일시 — "10. 30.(금) 20:00 ~ 22:15"(날이 넘어가면 끝에도 날짜)
const rangeLabel = (s: string, e: string) => {
  if (!s || !e) return "-";
  return `${kstLabel(s)}(${kstDay(s)}) ~ ${s.slice(0, 10) === e.slice(0, 10) ? e.slice(11, 16) : kstLabel(e)}`;
};
const shiftKst = (v: string, ms: number) => {
  const t = kstMs(v);
  return Number.isFinite(t) ? toKstInput(new Date(t + ms).toISOString()) : "";
};
const isoLabel = (v: string | null) => (v ? kstLabel(toKstInput(v)) : "-");
const durLabel = (sec: number) => {
  const m = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(m / 60);
  return h ? `${h}시간 ${m % 60}분` : `${m}분`;
};
// 회차 길이(초) · 완청에 필요한 초 — lib/goedamRules.js needSeconds 와 같은 식
const lenSec = (s: { startsAt: string; endsAt: string }) => Math.max(0, Math.floor((kstMs(s.endsAt) - kstMs(s.startsAt)) / 1000)) || 0;
const needSec = (s: Screening) => Math.ceil(s.ratio * lenSec(s) - 1e-6); // 소수 오차(0.14 × 300 = 42.00000000000001)를 걷고 올림 — 봇 판정과 같은 초

// ── Enter 로 저장 ──────────────────────────────
// 📌 한글 조합 중 Enter(isComposing · keyCode 229)는 조합을 끝내는 키다 — 저장으로 받지 않는다(이벤트 패스 화면과 같다)
const imeBusy = (e: ReactKeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
const enterKey = (e: ReactKeyboardEvent<HTMLInputElement>, fn: () => void) => {
  if (e.key !== "Enter" || imeBusy(e)) return;
  e.preventDefault();
  if (!e.repeat) fn();
};

// ── 서버 값 정리 ───────────────────────────────
const ratioOf = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(SCREENING_RATIO.max, Math.max(SCREENING_RATIO.min, n)) * 100) / 100 : SCREENING_RATIO.def;
};
const normScreening = (r: Raw): Screening => {
  const sid = String(r.sid || "");
  return {
    key: `s:${sid}`,
    sid,
    title: String(r.title || ""),
    startsAt: toKstInput(r.startsAt),
    endsAt: toKstInput(r.endsAt),
    tickets: Math.min(SCREENING_TICKETS.max, Math.max(SCREENING_TICKETS.min, toInt(r.tickets) || SCREENING_TICKETS.def)),
    ratio: ratioOf(r.ratio),
  };
};
const normPrize = (r: Raw): Prize => {
  const pid = String(r.pid || "");
  const kind = KINDS.find((k) => k === r.kind) || "none";
  return {
    key: `p:${pid}`,
    pid,
    name: String(r.name || ""),
    kind,
    amount: toInt(r.amount),
    itemId: String(r.itemId || ""),
    itemName: String(r.itemName || ""),
    count: Math.min(PRIZE_COUNT.max, toInt(r.count)),
    roleId: String(r.roleId || ""),
    roleName: String(r.roleName || ""),
    qty: r.qty == null ? null : Math.max(0, Math.floor(Number(r.qty)) || 0),
    weight: toInt(r.weight) || PRIZE_WEIGHT.def,
    rarity: String(r.rarity || ""),
  };
};
// 음성 활동 — 서버가 정리해 보낸 값(lib/goedamRules.js normalizeVoice). 숫자는 칸 글자로
const normVoice = (r: Raw): VoiceCfg => ({
  enabled: r.enabled === true,
  minutes: String(Math.min(VOICE_MINUTES.max, Math.max(VOICE_MINUTES.min, toInt(r.minutes) || VOICE_MINUTES.def))),
  tickets: String(Math.min(VOICE_TICKETS.max, Math.max(VOICE_TICKETS.min, toInt(r.tickets) || VOICE_TICKETS.def))),
  startsAt: toKstInput(r.startsAt),
  endsAt: toKstInput(r.endsAt),
});
const shopFrom = (v: unknown): ShopLink | null => {
  const o = rawOf(v);
  return o.id ? { id: String(o.id), name: String(o.name || "") } : null;
};
const voiceDaysFrom = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter((d) => !!voiceDayOf(voiceSid(d))) : []);
const statesFrom = (v: unknown): Record<string, ItemState> => {
  const out: Record<string, ItemState> = {};
  for (const [id, s] of Object.entries(rawOf(v))) {
    const st = ITEM_STATES.find((x) => x === s);
    if (st) out[id] = st;
  }
  return out;
};
const numOrNull = (v: unknown) => (v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const stockFrom = (v: unknown): Record<string, Stock> =>
  Object.fromEntries(Object.entries(rawOf(v)).map(([pid, s]) => {
    const o = rawOf(s);
    return [pid, { given: Math.max(0, Number(o.given) || 0), total: numOrNull(o.total), left: numOrNull(o.left) }];
  }));
const rosterFrom = (v: unknown): RosterRow[] =>
  rawList(v).map((r) => ({
    userId: String(r.userId || ""),
    userName: String(r.userName || ""),
    seconds: Math.max(0, Number(r.seconds) || 0),
    pct: Math.max(0, Number(r.pct) || 0),
    earned: r.earned === true,
    grantedAt: r.grantedAt ? String(r.grantedAt) : null,
    granted: Math.max(0, Number(r.granted) || 0),
    manual: r.manual === true,
  }));
const drawsFrom = (v: unknown): DrawRow[] =>
  rawList(v).map((r) => ({
    id: String(r.id || ""),
    at: r.at ? String(r.at) : null,
    userId: String(r.userId || ""),
    userName: String(r.userName || ""),
    pid: String(r.pid || ""),
    prizeName: String(r.prizeName || ""),
    kind: String(r.kind || "none"),
    amount: Math.max(0, Number(r.amount) || 0),
    code: String(r.code || ""),
    granted: r.granted === true,
    error: String(r.error || ""),
  }));

// ── 표시 ───────────────────────────────────────
// 상품 보이는 이름 — lib/goedamRules.js prizeTitle 과 같은 모양
const prizeTitle = (p: Pick<Prize, "name" | "kind" | "amount" | "itemName" | "roleName"> & { count?: number }) => {
  if (p.name.trim()) return p.name.trim();
  if (p.kind === "xp") return `XP ${fmt(p.amount)}`;
  if (p.kind === "point") return `빙옥 ${fmt(p.amount)}`;
  if (p.kind === "item") return `${p.itemName || "아이템"}${(p.count || 0) > 1 ? ` ×${fmt(p.count || 0)}` : ""}`;
  if (p.kind === "role") return p.roleName || "역할";
  if (p.kind === "code") return "코드";
  return "꽝";
};
// 상품 내용 한 줄 — 종류마다 양 · 아이템(2개 이상이면 ×N) · 역할
const prizeDetail = (p: Prize, roleNameOf: (id: string) => string, itemOf: (id: string) => RegItem | null) => {
  if (p.kind === "xp") return `${fmt(p.amount)} XP`;
  if (p.kind === "point") return `${fmt(p.amount)} 빙옥`;
  if (p.kind === "item") return `${itemOf(p.itemId)?.name || p.itemName || "미지정"}${p.count > 1 ? ` ×${fmt(p.count)}` : ""}`;
  if (p.kind === "role") return roleNameOf(p.roleId) || p.roleName || "미지정";
  if (p.kind === "code") return "코드 1장";
  return "-";
};
const RarityMark = ({ v }: { v: string }) => {
  const r = rarityOf(v || "common");
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className="w-2.5 h-2.5 border border-black/20" style={{ background: r.c }} />
      {r.l}
    </span>
  );
};
const ItemStateChip = ({ state }: { state: ItemState }) =>
  state === "live" ? null : (
    <StatusChip tone={state === "draft" ? "warn" : "bad"} className="!h-5 !px-1.5 !text-[10px] ml-1.5 align-middle">
      {state === "draft" ? "반영 전" : "찾을 수 없음"}
    </StatusChip>
  );
const Req = () => <span className="text-[#e91e3f]">*</span>;
// 편집 칸 아래 오류 한 줄 — 저장 단추 위에 붙는다
const PaneError = ({ msg }: { msg: string }) =>
  msg ? (
    <p role="alert" className="w-full text-[12px] font-bold text-[#d01634] break-keep">
      ⚠ {msg}
    </p>
  ) : null;
// 알림 줄 — 이벤트 패스 화면과 같은 모양
function NoteLine({ tone, action, inset = false, children }: { tone: "bad" | "warn" | "neutral"; action?: ReactNode; inset?: boolean; children: ReactNode }) {
  const toneCls = tone === "bad" ? "bg-[#e91e3f]/[0.08] text-[#d01634]" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#f2f2f2] text-[#5a5a5a]";
  return (
    <div
      role={tone === "neutral" ? undefined : "alert"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-[13px] font-bold break-keep ${toneCls} ${inset ? "px-5 border-b border-[#ededed]" : "px-4 rounded-2xl"}`}
    >
      <p className="min-w-0 grow basis-60">{children}</p>
      {action}
    </div>
  );
}
// 공용 Dropdown 밝은 테마를 관리자 입력칸(inputClass)과 같은 높이 · 테두리로(이벤트 패스 화면과 같다)
const DROPDOWN_BTN = "!px-3 !py-2 min-h-10 !border-[#a3a3a3] hover:!border-[#131313] focus-visible:!border-[#131313]";

// ── 지문 · 검사 ─────────────────────────────────
// 📌 저장 여부를 가를 지문 — 서버로 나가는 값만(로컬 key · 이름 스냅샷 빼고 — 서버가 실사이트 이름으로 다시 채운다)
const sig = (c: Cfg) =>
  JSON.stringify({
    enabled: c.enabled,
    title: c.title.trim(),
    channelId: c.channelId.trim(),
    ticketItemId: c.ticketItemId,
    drawOpensAt: c.drawOpensAt,
    drawClosesAt: c.drawClosesAt,
    screenings: c.screenings.map((s) => [s.sid, s.title.trim(), s.startsAt, s.endsAt, s.tickets, s.ratio]),
    voice: [c.voice.enabled, intText(c.voice.minutes), intText(c.voice.tickets), c.voice.startsAt, c.voice.endsAt],
    prizes: c.prizes.map((p) => [p.pid, p.name.trim(), p.kind, p.amount, p.itemId, p.count, p.roleId, p.qty, p.weight, p.rarity || "common"]),
  });

const screeningError = (s: { title: string; startsAt: string; endsAt: string; tickets: number; ratio: number }) => {
  const t = s.title.trim();
  if (!t) return "제목을 입력해 주십시오.";
  if (t.length > MAX_TITLE) return `제목은 ${MAX_TITLE}자 이하로 입력해 주십시오.`;
  const a = kstMs(s.startsAt);
  const b = kstMs(s.endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "시작 · 종료 시각을 입력해 주십시오.";
  if (b <= a) return "종료 시각은 시작 시각 이후로 지정해 주십시오.";
  if (!Number.isInteger(s.tickets) || s.tickets < SCREENING_TICKETS.min || s.tickets > SCREENING_TICKETS.max) {
    return `장 수는 ${SCREENING_TICKETS.min}~${SCREENING_TICKETS.max} 사이로 입력해 주십시오.`;
  }
  if (!(s.ratio >= SCREENING_RATIO.min && s.ratio <= SCREENING_RATIO.max)) return `완청 비율은 ${SCREENING_RATIO.min * 100}~${SCREENING_RATIO.max * 100}% 사이로 입력해 주십시오.`;
  return "";
};
const prizeError = (p: Prize) => {
  if (p.name.trim().length > MAX_TITLE) return `이름은 ${MAX_TITLE}자 이하로 입력해 주십시오.`;
  if ((p.kind === "xp" || p.kind === "point") && !(p.amount >= 1 && p.amount <= NUM_MAX)) return "수량을 1 이상 10억 이하로 입력해 주십시오.";
  if (p.kind === "item" && !p.itemId) return "아이템을 선택해 주십시오.";
  if (p.kind === "item" && !(Number.isInteger(p.count) && p.count >= PRIZE_COUNT.min && p.count <= PRIZE_COUNT.max)) return `개수는 ${PRIZE_COUNT.min}~${PRIZE_COUNT.max} 사이로 입력해 주십시오.`;
  if (p.kind === "role" && !p.roleId) return "역할을 선택해 주십시오.";
  if (p.qty != null && !(Number.isInteger(p.qty) && p.qty >= 0 && p.qty <= NUM_MAX)) return "수량은 0 이상의 정수로 입력해 주십시오.";
  if (!(Number.isInteger(p.weight) && p.weight >= PRIZE_WEIGHT.min && p.weight <= PRIZE_WEIGHT.max)) return `비중은 ${PRIZE_WEIGHT.min}~${fmt(PRIZE_WEIGHT.max)} 사이의 정수로 입력해 주십시오.`;
  return "";
};
// 음성 활동 검사 — 서버(app/api/admin/goedam checkVoice)와 같은 범위
const voiceError = (v: VoiceCfg) => {
  const m = intText(v.minutes);
  if (!(Number.isInteger(m) && m >= VOICE_MINUTES.min && m <= VOICE_MINUTES.max)) return `하루 음성 시간은 ${VOICE_MINUTES.min}~${fmt(VOICE_MINUTES.max)}분 사이로 입력해 주십시오.`;
  const t = intText(v.tickets);
  if (!(Number.isInteger(t) && t >= VOICE_TICKETS.min && t <= VOICE_TICKETS.max)) return `장 수는 ${VOICE_TICKETS.min}~${VOICE_TICKETS.max} 사이로 입력해 주십시오.`;
  const a = kstMs(v.startsAt);
  const b = kstMs(v.endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "기간을 입력해 주십시오.";
  if (b <= a) return "종료 시각은 시작 시각 이후로 지정해 주십시오.";
  return "";
};
// 저장 전 검사 — 서버가 돌려보낼 값을 먼저 막는다. 괜찮으면 ""
const checkCfg = (c: Cfg) => {
  const title = c.title.trim();
  if (!title) return "제목을 입력해 주십시오.";
  if (title.length > MAX_TITLE) return `제목은 ${MAX_TITLE}자 이하로 입력해 주십시오.`;
  if (c.channelId.trim() && !SNOWFLAKE.test(c.channelId.trim())) return "스테이지 채널 ID가 올바르지 않습니다.";
  const o = kstMs(c.drawOpensAt);
  const e = kstMs(c.drawClosesAt);
  if (!Number.isFinite(o) || !Number.isFinite(e)) return "추첨 기간을 입력해 주십시오.";
  if (e <= o) return "추첨 종료 시각은 시작 시각 이후로 지정해 주십시오.";
  if (c.screenings.length > MAX_SCREENINGS) return `회차는 최대 ${MAX_SCREENINGS}개까지 등록할 수 있습니다.`;
  for (const s of c.screenings) {
    const err = screeningError(s);
    if (err) return `「${s.title.trim() || "회차"}」: ${err}`;
  }
  const vErr = voiceError(c.voice);
  if (vErr) return `음성 활동: ${vErr}`;
  if (c.prizes.length > MAX_PRIZES) return `상품은 최대 ${MAX_PRIZES}개까지 등록할 수 있습니다.`;
  for (const p of c.prizes) {
    const err = prizeError(p);
    if (err) return `「${prizeTitle(p)}」: ${err}`;
  }
  return "";
};
// 회차는 시작 순 — 서버(lib/goedamRules.js normalizeScreenings)와 같은 차례로 들고 있어 저장 뒤 표가 뒤섞이지 않는다
const sortScreenings = (list: Screening[]) => [...list].sort((a, b) => (kstMs(a.startsAt) || 0) - (kstMs(b.startsAt) || 0));
const onOffLabel = (v: boolean) => (v ? "운영 중" : "중단");
const voiceOnLabel = (v: boolean) => (v ? "사용" : "중단");

// ══ 그룹 지원 탭 ═══════════════════════════════════════════
// 📌 게임 그룹 지원(2026-10-25 운영자 결정 · 약속 문서 .claude/mockups/goedam-group/SPEC.md §4 · §6) — 「그룹 지원」 탭(?tab=groups).
//    저장 · 심사는 app/api/admin/goedam/groups, 계산 · 번호 배정 · 알림은 lib/goedamGroup.js 한 곳(화면 검사는 먼저 막는 것뿐 — 서버가 다시 검사한다)
//    · 위: 설정 판(사용 · 기간 · 최소/최대 인원 — 바뀐 것이 있을 때만 뜨는 저장 줄 · Enter → PUT { config }) · 문화상품권 번호 판(남은 / 배정 / 전체 · 붙여 넣기 → codes-add)
//    · 아래: 그룹 표(상태 거르기 · 검색 · 심사 중 먼저). 줄을 누르면 상세 칸(GET ?id= — 멤버마다 계정 만든 날 · 서버 들어온 날 · 레벨/XP · 첫 XP · 최근 30일 XP,
//      새 계정 · 기록 없음은 빨간 글자 — 부계정 가려내기용). 심사 중이면 승인(확인 창 — 남은 번호가 모자라면 잠금) · 반려(사유 입력 창). 승인된 그룹은 멤버별 배정 번호
//    · 📌 지원 보너스(2026-10-25 · 약속 문서 6b) — 설정 판 「지원 보너스 추첨권」(0~20장 · 같은 PUT config 의 applyTickets). 상세 멤버마다 「추첨권 N장」 · 빨간 「추첨권 미지급」(member.bonus),
//      지원한 뒤(심사 중 · 승인 · 반려) 미지급 멤버가 있으면 「추첨권 다시 지급」(확인 창 → POST { action: "regrant", id } → 받은 사람 수 토스트 · 상세 다시 받기)
//    · 다시 받기(새로고침 · 심사 · 번호 추가 뒤)는 표 · 번호 수만 바꾼다 — 저장하지 않은 설정 편집을 서버 값으로 덮지 않는다
//    · 제 틀(AdminPage)을 따로 그린다 — 설정 저장 줄 · 상세 칸이 구성 탭과 섞이지 않게(머리 · 탭 줄은 같은 것을 받는다)
//    · 응답은 약속 모양(맨 위 칸 { success, config, codes, groups })이 기본, data 로 감싼 모양도 읽는다
type GroupStatus = "open" | "review" | "approved" | "rejected";
type GroupFilter = "all" | GroupStatus;
// 설정 한 벌 — 시각은 datetime-local 칸 글자(KST), 인원 · 지원 보너스 추첨권(applyTickets — 약속 문서 6b)은 칸 글자 그대로 들고 있다가 보낼 때 숫자로
type GroupCfg = { enabled: boolean; startsAt: string; endsAt: string; minMembers: string; maxMembers: string; applyTickets: string };
type CodeStats = { total: number; assigned: number; left: number };
type GroupRow = {
  id: string;
  code: string;
  name: string;
  game: string;
  when: string | null;
  status: GroupStatus;
  reason: string;
  leaderId: string;
  leaderName: string;
  count: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string;
  createdAt: string | null;
};
// 멤버 확인 — accountAt: 디스코드 계정 만든 때(snowflake) · guildJoinedAt: 서버 들어온 때(못 읽으면 null) · firstXpAt: 가장 이른 XP 기록 · xp30: 최근 30일 XP 합
type MemberCheck = { accountAt: string | null; guildJoinedAt: string | null; level: number; xp: number; firstXpAt: string | null; xp30: number };
// 지원 보너스 — 받은 장 수 · 시각(models/GoedamGroupBonus 한 줄 · 1인 평생 1번). null = 아직 안 받음
type MemberBonus = { tickets: number; at: string | null } | null;
type GroupMember = { id: string; name: string; joinedAt: string | null; check: MemberCheck; bonus: MemberBonus };
type GroupDetail = GroupRow & { members: GroupMember[]; giftCodes: { name: string; code: string }[] };
type ToastFn = ReturnType<typeof useToast>["toast"];

const GROUPS_API = "/api/admin/goedam/groups";
// 📌 인원 범위 — app/api/admin/goedam/groups PUT 검사와 같다(최소 2~20 · 최대 최소~50 · 기본 4 · 10). 바꾸면 같이
const GROUP_MIN = { min: 2, max: 20, def: 4 };
const GROUP_MAX = { max: 50, def: 10 };
// 📌 지원 보너스 추첨권 — 지원하기 성공 때 멤버마다(1인 평생 1번). 0~20장 · 기본 5 · 0 = 지급 안 함(서버 PUT 검사와 같다 — 바꾸면 같이)
const GROUP_TICKETS = { min: 0, max: 20, def: 5 };
// 지원한 뒤의 상태 — 이 상태의 그룹에서 보너스가 없는 멤버만 「미지급」 · 다시 지급 대상(모집 중은 아직 받을 때가 아니다)
const BONUS_DUE: GroupStatus[] = ["review", "approved", "rejected"];
const MAX_REASON = 100;
// 번호 붙여 넣기 한 번 — 서버 codes-add 와 같은 500줄
const MAX_CODE_LINES = 500;
// 새 계정 — 계정 만든 지 이 날 수 안이면 빨간 글자(부계정 의심)
const NEW_ACCOUNT_DAYS = 30;
const GROUP_STATUS: { v: GroupStatus; l: string; tone: "warn" | "info" | "ok" | "bad" }[] = [
  { v: "review", l: "심사 중", tone: "warn" },
  { v: "open", l: "모집 중", tone: "info" },
  { v: "approved", l: "승인", tone: "ok" },
  { v: "rejected", l: "반려", tone: "bad" },
];
const EMPTY_GROUP_CFG: GroupCfg = { enabled: false, startsAt: "", endsAt: "", minMembers: "", maxMembers: "", applyTickets: "" };
const EMPTY_CODES: CodeStats = { total: 0, assigned: 0, left: 0 };
const MINI_CHIP = "!h-5 !px-1.5 !text-[10px]";

const groupStatusOf = (v: unknown): GroupStatus => GROUP_STATUS.find((s) => s.v === v)?.v || "open";
const GroupChip = ({ s }: { s: GroupStatus }) => {
  const m = GROUP_STATUS.find((x) => x.v === s) || GROUP_STATUS[1];
  return <StatusChip tone={m.tone}>{m.l}</StatusChip>;
};
// 응답 본문 — 맨 위 칸이 기본, data 로 감싸 왔으면 그 안
const bodyOf = (d: unknown): Raw => {
  const o = rawOf(d);
  return o.data && typeof o.data === "object" && !Array.isArray(o.data) ? rawOf(o.data) : o;
};
const okOf = (d: unknown) => rawOf(d).success === true || rawOf(d).ok === true;
const errOf = (d: unknown, def: string) => {
  const o = rawOf(d);
  return String(o.error || o.message || def);
};
const isoOrNull = (v: unknown) => (v ? String(v) : null);
const countOf = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);
const groupCfgFrom = (v: unknown): GroupCfg => {
  const o = rawOf(v);
  return {
    enabled: o.enabled === true,
    startsAt: toKstInput(o.startsAt),
    endsAt: toKstInput(o.endsAt),
    minMembers: String(toInt(o.minMembers) || GROUP_MIN.def),
    maxMembers: String(toInt(o.maxMembers) || GROUP_MAX.def),
    // 0 도 값이다(지급 안 함) — 칸이 없을 때만 기본값
    applyTickets: String(o.applyTickets == null ? GROUP_TICKETS.def : Math.min(GROUP_TICKETS.max, countOf(o.applyTickets))),
  };
};
const codesFrom = (v: unknown): CodeStats => {
  const o = rawOf(v);
  return { total: countOf(o.total), assigned: countOf(o.assigned), left: countOf(o.left) };
};
const groupRowFrom = (r: Raw): GroupRow => {
  const leader = rawOf(r.leader);
  return {
    id: String(r.id || ""),
    code: String(r.code || ""),
    name: String(r.name || ""),
    game: String(r.game || ""),
    when: isoOrNull(r.when),
    status: groupStatusOf(r.status),
    reason: String(r.reason || ""),
    leaderId: String(leader.id || ""),
    leaderName: String(leader.name || ""),
    count: r.count != null ? countOf(r.count) : rawList(r.members).length,
    submittedAt: isoOrNull(r.submittedAt),
    reviewedAt: isoOrNull(r.reviewedAt),
    reviewedBy: String(r.reviewedBy || ""),
    createdAt: isoOrNull(r.createdAt),
  };
};
// 멤버 보너스 — 서버 { tickets, grantedAt } | null(미지급 — 1인 평생 1번이라 다른 그룹에서 받은 것도 받음)
const bonusFrom = (v: unknown): MemberBonus => {
  if (!v || typeof v !== "object") return null;
  const o = rawOf(v);
  return { tickets: countOf(o.tickets), at: isoOrNull(o.grantedAt) };
};
// 다시 지급 결과 — 서버 { granted(받은 사람 수), tickets(넣은 장 수 합), failed(실패한 사람 수) }
const regrantOf = (b: Raw) => ({ people: countOf(b.granted), tickets: countOf(b.tickets), failed: countOf(b.failed) });
const groupDetailFrom = (v: unknown): GroupDetail | null => {
  const r = rawOf(v);
  if (!r.id) return null;
  const members = rawList(r.members).map((m) => {
    const c = rawOf(m.check);
    return {
      id: String(m.id || ""),
      name: String(m.name || ""),
      joinedAt: isoOrNull(m.joinedAt),
      check: { accountAt: isoOrNull(c.accountAt), guildJoinedAt: isoOrNull(c.guildJoinedAt), level: countOf(c.level), xp: countOf(c.xp), firstXpAt: isoOrNull(c.firstXpAt), xp30: countOf(c.xp30) },
      bonus: bonusFrom(m.bonus),
    };
  });
  return {
    ...groupRowFrom(r),
    members,
    giftCodes: rawList(r.giftCodes)
      .map((g) => ({ name: String(g.name || ""), code: String(g.code || "") }))
      .filter((g) => g.code),
  };
};

// 저장 여부를 가를 지문 — 서버로 나가는 값만
const groupSig = (c: GroupCfg) => JSON.stringify([c.enabled, c.startsAt, c.endsAt, intText(c.minMembers), intText(c.maxMembers), intText(c.applyTickets)]);
// 저장 전 검사 — 서버(PUT)가 돌려보낼 값을 먼저 막는다. 괜찮으면 ""
const groupCfgError = (c: GroupCfg) => {
  const a = kstMs(c.startsAt);
  const b = kstMs(c.endsAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "기간을 입력해 주십시오.";
  if (b <= a) return "종료 시각은 시작 시각 이후로 지정해 주십시오.";
  const min = intText(c.minMembers);
  if (!(Number.isInteger(min) && min >= GROUP_MIN.min && min <= GROUP_MIN.max)) return `최소 인원은 ${GROUP_MIN.min}~${GROUP_MIN.max}명 사이로 입력해 주십시오.`;
  const max = intText(c.maxMembers);
  if (!(Number.isInteger(max) && max >= min && max <= GROUP_MAX.max)) return `최대 인원은 ${min}~${GROUP_MAX.max}명 사이로 입력해 주십시오.`;
  const t = intText(c.applyTickets);
  if (!(Number.isInteger(t) && t >= GROUP_TICKETS.min && t <= GROUP_TICKETS.max)) return `지원 보너스 추첨권은 ${GROUP_TICKETS.min}~${GROUP_TICKETS.max}장 사이로 입력해 주십시오.`;
  return "";
};
const memberCountLabel = (s: string) => (Number.isFinite(intText(s)) ? `${fmt(intText(s))}명` : "없음");
const ticketCountLabel = (s: string) => (Number.isFinite(intText(s)) ? `${fmt(intText(s))}장` : "없음");

// ── 표시 ──
// 날짜만(해가 다를 수 있는 계정 · 서버 입장 · 첫 기록) — "2025. 03. 14."
const dayLabel = (v: string | null) => {
  const k = v ? toKstInput(v) : "";
  return k ? `${k.slice(0, 4)}. ${k.slice(5, 7)}. ${k.slice(8, 10)}.` : "-";
};
// 그룹 일정(언제) — "10. 31. 22:00(토)"
const whenLabel = (v: string | null) => {
  const k = v ? toKstInput(v) : "";
  return k ? `${kstLabel(k)}(${kstDay(k)})` : "-";
};
// 지난 날 수 — now(받은 시각) 기준. 못 읽으면 null
const daysAgo = (v: string | null, now: number) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) && now > 0 ? Math.max(0, Math.floor((now - t) / DAY_MS)) : null;
};
const agoLabel = (n: number | null) => (n == null || n >= 365 ? "" : n === 0 ? " · 오늘" : ` · ${fmt(n)}일 전`);
const memberFlags = (m: GroupMember, now: number) => {
  const age = daysAgo(m.check.accountAt, now);
  return { newAccount: age != null && age < NEW_ACCOUNT_DAYS, noXp: !m.check.firstXpAt };
};

// 멤버 확인 한 칸 — 이름 · 값(bad 면 빨간 글자)
const CheckItem = ({ k, bad = false, children }: { k: string; bad?: boolean; children: ReactNode }) => (
  <div className="min-w-0 flex items-baseline gap-2">
    <dt className="shrink-0 w-16 text-[#8a8a8a]">{k}</dt>
    <dd className={`min-w-0 font-bold tabular-nums break-keep ${bad ? "text-[#d01634]" : "text-[#131313]"}`}>{children}</dd>
  </div>
);
// 멤버 한 줄 — 이름 · 그룹장 · 의심 칩 · 지원 보너스 칩 · 디스코드 ID, 그 아래 확인 여섯 칸(폰은 한 줄에 하나)
//    보너스 — 받았으면 「추첨권 N장」, 받을 때가 지났는데(bonusDue — 지원한 뒤 · 보너스 장 수 > 0) 없으면 빨간 「추첨권 미지급」
function MemberCheckRow({ m, leader, now, bonusDue }: { m: GroupMember; leader: boolean; now: number; bonusDue: boolean }) {
  const c = m.check;
  const flags = memberFlags(m, now);
  return (
    <li className="py-3.5 border-b border-[#ededed] last:border-b-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 text-[14px] font-black break-all">{m.name || "-"}</span>
        {leader && (
          <StatusChip tone="ink" className={MINI_CHIP}>
            그룹장
          </StatusChip>
        )}
        {flags.newAccount && (
          <StatusChip tone="bad" className={MINI_CHIP}>
            새 계정
          </StatusChip>
        )}
        {flags.noXp && (
          <StatusChip tone="bad" className={MINI_CHIP}>
            기록 없음
          </StatusChip>
        )}
        {m.bonus ? (
          <StatusChip className={`${MINI_CHIP} tabular-nums`}>추첨권 {fmt(m.bonus.tickets)}장</StatusChip>
        ) : (
          bonusDue && (
            <StatusChip tone="bad" className={MINI_CHIP}>
              추첨권 미지급
            </StatusChip>
          )
        )}
        <span className="ml-auto text-[11px] text-[#8a8a8a] tabular-nums">{m.id}</span>
      </div>
      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[12px]">
        <CheckItem k="계정 생성" bad={flags.newAccount}>
          {dayLabel(c.accountAt)}
          {agoLabel(daysAgo(c.accountAt, now))}
        </CheckItem>
        <CheckItem k="서버 입장">
          {dayLabel(c.guildJoinedAt)}
          {agoLabel(daysAgo(c.guildJoinedAt, now))}
        </CheckItem>
        <CheckItem k="레벨 · XP">
          Lv. {fmt(c.level)} · {fmt(c.xp)}
        </CheckItem>
        <CheckItem k="첫 XP" bad={flags.noXp}>
          {c.firstXpAt ? dayLabel(c.firstXpAt) : "기록 없음"}
        </CheckItem>
        <CheckItem k="최근 30일" bad={c.xp30 === 0}>
          {fmt(c.xp30)} XP
        </CheckItem>
        <CheckItem k="참여">{isoLabel(m.joinedAt)}</CheckItem>
      </dl>
    </li>
  );
}

function GroupsTab({ tabs, desc, toast }: { tabs: ReactNode; desc: string; toast: ToastFn }) {
  const [loading, setLoading] = useState(true);
  // 설정을 못 받음 — 빈 설정이 운영 중인 설정을 덮어쓰지 않게 저장을 잠근다 / 표 · 번호 수를 못 받음
  const [loadFailed, setLoadFailed] = useState(false);
  const [listFailed, setListFailed] = useState(false);
  const [cfg, setCfg] = useState<GroupCfg>(EMPTY_GROUP_CFG);
  const [base, setBase] = useState<GroupCfg | null>(null);
  const [codes, setCodes] = useState<CodeStats>(EMPTY_CODES);
  const [rows, setRows] = useState<GroupRow[]>([]);
  // 받은 시각 — 단계(시작 전 · 진행 중 · 종료) 판정용. 렌더 중에 Date.now() 를 부르지 않는다
  const [loadedAt, setLoadedAt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState(false);
  // 📌 연타 막이 — 저장 · 번호 추가 · 승인 · 반려가 같은 틈에 두 번 들어오지 않게(상태는 다음 렌더에야 보인다)
  const busyRef = useRef(false);
  const [codeText, setCodeText] = useState("");
  const [filter, setFilter] = useState<GroupFilter>("all");
  const [q, setQ] = useState("");
  const [pickId, setPickId] = useState<string | null>(null);
  const [detailNonce, setDetailNonce] = useState(0);
  const [detail, setDetail] = useState<{ key: string; group: GroupDetail | null; at: number } | null>(null);
  const [approveAsk, setApproveAsk] = useState(false);
  const [rejectAsk, setRejectAsk] = useState(false);
  const [regrantAsk, setRegrantAsk] = useState(false);
  const [reason, setReason] = useState("");

  // 📌 읽기만 — withCfg 면 설정까지(첫 화면 · 다시 불러오기), 아니면 표 · 번호 수만
  //    상태는 응답을 받은 뒤에만 바꾼다(첫 화면은 effect 에서 부른다)
  const fetchAll = useCallback(
    (withCfg: boolean) =>
      fetch(GROUPS_API, { cache: "no-store" })
        .then((r) => r.json())
        .catch(() => null)
        .then((d) => {
          const b = bodyOf(d);
          if (okOf(d) && Array.isArray(b.groups)) {
            setCodes(codesFrom(b.codes));
            setRows(rawList(b.groups).map(groupRowFrom).filter((r) => r.id));
            setListFailed(false);
            setLoadedAt(Date.now());
            if (withCfg) {
              const ok = !!b.config && typeof b.config === "object";
              if (ok) {
                const next = groupCfgFrom(b.config);
                setCfg(next);
                setBase(next);
              }
              setLoadFailed(!ok);
            }
          } else {
            setListFailed(true);
            if (withCfg) setLoadFailed(true);
          }
        }),
    []
  );

  useEffect(() => {
    fetchAll(true).finally(() => setLoading(false));
  }, [fetchAll]);

  const reloadAll = () => {
    setLoading(true);
    fetchAll(true).finally(() => setLoading(false));
  };
  const refresh = () => {
    sfxTick();
    fetchAll(false);
    if (pickId) setDetailNonce((n) => n + 1);
  };

  // ── 상세(멤버 확인) ──
  const detailKey = pickId ? `${pickId}|${detailNonce}` : "";
  useEffect(() => {
    if (!pickId) return;
    let live = true;
    const key = `${pickId}|${detailNonce}`;
    fetch(`${GROUPS_API}?id=${encodeURIComponent(pickId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (!live) return;
        const group = okOf(d) ? groupDetailFrom(bodyOf(d).group) : null;
        setDetail({ key, group, at: Date.now() });
      });
    return () => {
      live = false;
    };
  }, [pickId, detailNonce]);
  const detailLoading = !!pickId && detail?.key !== detailKey;
  // 다시 받는 동안에도 같은 그룹이면 앞 값을 그대로 보인다(칸이 깜빡이지 않게)
  const dg = detail?.group && detail.group.id === pickId ? detail.group : null;
  const pickRow = pickId ? rows.find((r) => r.id === pickId) || null : null;
  const g: GroupRow | null = dg || pickRow;
  const closePick = () => {
    setPickId(null);
    setApproveAsk(false);
    setRejectAsk(false);
    setRegrantAsk(false);
  };

  // ── 설정 저장 ──
  const snapshot = useMemo(() => (base ? groupSig(base) : ""), [base]);
  const dirty = !loading && !!base && groupSig(cfg) !== snapshot;
  const set = <K extends keyof GroupCfg>(k: K, v: GroupCfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const save = async () => {
    if (busyRef.current) return;
    if (loadFailed) return toast(LOAD_FAILED_MSG, true);
    if (groupSig(cfg) === snapshot) {
      sfxTick();
      return toast("변경 사항이 없습니다.", false, { sound: false });
    }
    const err = groupCfgError(cfg);
    if (err) return toast(err, true);
    busyRef.current = true;
    setSaving(true);
    const res = await fetch(GROUPS_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          enabled: cfg.enabled,
          startsAt: fromKstInput(cfg.startsAt),
          endsAt: fromKstInput(cfg.endsAt),
          minMembers: intText(cfg.minMembers),
          maxMembers: intText(cfg.maxMembers),
          applyTickets: intText(cfg.applyTickets),
        },
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    busyRef.current = false;
    setSaving(false);
    if (res?.ok && okOf(d)) {
      const b = bodyOf(d);
      const next = b.config && typeof b.config === "object" ? groupCfgFrom(b.config) : cfg;
      setCfg(next);
      setBase(next);
      setLoadedAt(Date.now());
      toast("저장되었습니다.");
    } else {
      toast(errOf(d, "저장에 실패했습니다."), true);
    }
  };
  const resetToBase = () => {
    if (base) setCfg(base);
  };

  // ── 문화상품권 번호 추가 ──
  // 줄 수(앞뒤 공백 · 빈 줄 · 같은 줄 뺀 것) — 칸 옆 「+N」. 보내는 것은 붙여 넣은 글 그대로(정리 · 중복 판정은 서버)
  const codeLines = useMemo(() => [...new Set(codeText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))], [codeText]);
  const addCodes = async () => {
    if (busyRef.current) return;
    if (!codeLines.length) return toast("번호를 입력해 주십시오.", true);
    if (codeLines.length > MAX_CODE_LINES) return toast(`번호는 한 번에 ${fmt(MAX_CODE_LINES)}개까지 추가할 수 있습니다.`, true);
    busyRef.current = true;
    setAdding(true);
    const res = await fetch(GROUPS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "codes-add", text: codeText }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    busyRef.current = false;
    setAdding(false);
    if (res?.ok && okOf(d)) {
      const b = bodyOf(d);
      const added = countOf(b.added);
      const dup = countOf(b.dup);
      setCodeText("");
      fetchAll(false);
      if (added > 0) toast(`번호 ${fmt(added)}개 추가${dup ? ` · 중복 ${fmt(dup)}개` : ""}`);
      else toast(`추가된 번호 없음 · 중복 ${fmt(dup)}개`, true);
    } else {
      toast(errOf(d, "추가에 실패했습니다."), true);
    }
  };

  // ── 승인 · 반려 · 추첨권 다시 지급 ──
  // 성공하면 표 · 번호 수 · 상세를 다시 받는다(상세 칸은 열린 채 — 승인이면 배정 번호가, 다시 지급이면 멤버별 장 수가 뜬다)
  //    okMsg — 글자, 또는 응답 본문으로 글자를 만드는 함수(다시 지급 — 받은 사람 수)
  const act = async (body: Raw, okMsg: string | ((b: Raw) => string)) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setActing(true);
    const res = await fetch(GROUPS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    busyRef.current = false;
    setActing(false);
    if (res?.ok && okOf(d)) {
      toast(typeof okMsg === "function" ? okMsg(bodyOf(d)) : okMsg);
      fetchAll(false);
      setDetailNonce((n) => n + 1);
      return true;
    }
    toast(errOf(d, "처리에 실패했습니다."), true);
    return false;
  };
  // 승인에 필요한 번호 수 = 멤버 수(상세를 받았으면 그 수)
  const need = dg ? dg.members.length : g?.count ?? 0;
  const codesOk = !listFailed && loadedAt > 0;
  const short = !!g && g.status === "review" && codesOk && codes.left < need;
  const doApprove = async () => {
    if (!g) return;
    await act({ action: "approve", id: g.id }, `승인했습니다 · 번호 ${fmt(need)}장 배정`);
    setApproveAsk(false);
  };
  const openReject = () => {
    setReason("");
    setRejectAsk(true);
  };
  const doReject = async () => {
    if (!g) return;
    const r = reason.trim();
    if (!r) return toast("사유를 입력해 주십시오.", true);
    if (r.length > MAX_REASON) return toast(`사유는 ${MAX_REASON}자 이하로 입력해 주십시오.`, true);
    if (await act({ action: "reject", id: g.id, reason: r }, "반려했습니다.")) {
      setRejectAsk(false);
      setReason("");
    }
  };
  // 📌 지원 보너스 — 장 수는 저장된 설정 값(편집 중인 칸이 아니라 서버가 쓰는 값). 0 장이면 미지급 · 다시 지급을 띄우지 않는다(줄 것이 없다)
  //    설정을 못 받았으면(base 없음) 막지 않는다 — 서버가 판정한다
  const bonusPer = base ? intText(base.applyTickets) : NaN;
  const bonusDue = !!g && BONUS_DUE.includes(g.status) && bonusPer !== 0;
  const bonusMissing = dg ? dg.members.filter((m) => !m.bonus).length : 0;
  const canRegrant = bonusDue && !!dg && bonusMissing > 0;
  // 다시 지급 — 그 그룹(심사 중 · 승인 · 반려) 멤버 중 보너스가 없는 사람만(서버가 고르고 주문 묶음으로 모자란 장만 넣는다)
  const doRegrant = async () => {
    if (!g) return;
    await act({ action: "regrant", id: g.id }, (b) => {
      const r = regrantOf(b);
      const fail = r.failed ? ` · 실패 ${fmt(r.failed)}명` : "";
      return r.people > 0 ? `추첨권을 지급했습니다 · ${fmt(r.people)}명${r.tickets ? ` · ${fmt(r.tickets)}장` : ""}${fail}` : `지급 대상이 없습니다.${fail}`;
    });
    setRegrantAsk(false);
  };

  // ── 표 ──
  const counts = useMemo(() => {
    const c: Record<GroupFilter, number> = { all: rows.length, review: 0, open: 0, approved: 0, rejected: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);
  // 📌 심사 중 먼저 — 나머지는 서버 차례(최근) 그대로(안정 정렬)
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "all" || r.status === filter) && (!s || [r.name, r.game, r.leaderName, r.leaderId, r.code].some((x) => x.toLowerCase().includes(s))))
      .sort((a, b) => (a.status === "review" ? 0 : 1) - (b.status === "review" ? 0 : 1));
  }, [rows, filter, q]);
  const reviewNeed = useMemo(() => rows.reduce((sum, r) => sum + (r.status === "review" ? r.count : 0), 0), [rows]);
  const pickIdx = pickId ? shown.findIndex((r) => r.id === pickId) : -1;

  // ── 변경 목록 · 단계 ──
  const changed = {
    enabled: !!base && base.enabled !== cfg.enabled,
    period: !!base && (base.startsAt !== cfg.startsAt || base.endsAt !== cfg.endsAt),
    min: !!base && !Object.is(intText(base.minMembers), intText(cfg.minMembers)),
    max: !!base && !Object.is(intText(base.maxMembers), intText(cfg.maxMembers)),
    tickets: !!base && !Object.is(intText(base.applyTickets), intText(cfg.applyTickets)),
  };
  const changes: string[] = [];
  if (base && dirty) {
    if (changed.enabled) changes.push(`상태 ${onOffLabel(base.enabled)} → ${onOffLabel(cfg.enabled)}`);
    if (base.startsAt !== cfg.startsAt) changes.push(`시작 ${kstLabel(base.startsAt)} → ${kstLabel(cfg.startsAt)}`);
    if (base.endsAt !== cfg.endsAt) changes.push(`종료 ${kstLabel(base.endsAt)} → ${kstLabel(cfg.endsAt)}`);
    if (changed.min) changes.push(`최소 인원 ${memberCountLabel(base.minMembers)} → ${memberCountLabel(cfg.minMembers)}`);
    if (changed.max) changes.push(`최대 인원 ${memberCountLabel(base.maxMembers)} → ${memberCountLabel(cfg.maxMembers)}`);
    if (changed.tickets) changes.push(`지원 보너스 추첨권 ${ticketCountLabel(base.applyTickets)} → ${ticketCountLabel(cfg.applyTickets)}`);
  }
  const startMs = kstMs(cfg.startsAt);
  const endMs = kstMs(cfg.endsAt);
  const periodOk = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const phase = !cfg.enabled ? "중단" : !periodOk || !loadedAt ? "-" : loadedAt < startMs ? "시작 전" : loadedAt < endMs ? "진행 중" : "종료";
  const onLabel = !cfg.enabled ? "중단 (운영진 미리보기)" : phase === "시작 전" || phase === "종료" ? `운영 중 · ${phase}` : "운영 중";
  const periodHint = !periodOk ? (
    <span className="font-bold text-[#d01634]">{Number.isFinite(startMs) && Number.isFinite(endMs) ? "종료 시각은 시작 시각 이후로 지정해 주십시오." : "기간을 입력해 주십시오."}</span>
  ) : (
    `KST · 종료 시각 미포함 · ${Math.round(((endMs - startMs) / DAY_MS) * 10) / 10}일`
  );
  const barNote = loadFailed && !loading ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span> : undefined;
  const shortAll = codesOk && reviewNeed > codes.left;
  const leaderOf = (gr: GroupDetail, m: GroupMember, i: number) => (gr.leaderId ? m.id === gr.leaderId : i === 0);
  const flagged = dg ? dg.members.filter((m) => {
    const f = memberFlags(m, detail?.at || 0);
    return f.newAccount || f.noXp;
  }).length : 0;

  const cols: Column<GroupRow>[] = [
    { key: "status", label: "상태", className: "w-24", mobile: "title", render: (r) => <GroupChip s={r.status} /> },
    {
      key: "name",
      label: "그룹 이름",
      mobile: "title",
      render: (r) => (
        <span className="min-w-0">
          <span className="font-bold">{r.name || "-"}</span>
          {r.code && <span className="ml-1.5 font-mono text-[11px] font-normal text-[#8a8a8a]">{r.code}</span>}
        </span>
      ),
    },
    { key: "game", label: "게임", render: (r) => <span className="break-keep">{r.game || "-"}</span> },
    { key: "leader", label: "그룹장", render: (r) => <span className="font-bold text-[#131313]">{r.leaderName || r.leaderId || "-"}</span> },
    { key: "count", label: "인원", align: "right", className: "w-20", sortValue: (r) => r.count, render: (r) => <span className="tabular-nums">{fmt(r.count)}명</span> },
    {
      key: "submittedAt",
      label: "지원 시각",
      className: "w-32",
      sortValue: (r) => (r.submittedAt ? Date.parse(r.submittedAt) : 0),
      render: (r) => <span className="tabular-nums text-[#5a5a5a]">{isoLabel(r.submittedAt)}</span>,
    },
  ];

  return (
    <AdminPage
      section="SYSTEM : LEVEL"
      title="괴담회"
      desc={desc}
      tabs={tabs}
      footer={<SaveBar dirty={dirty && !loadFailed} changes={changes} onSave={save} onReset={resetToBase} saving={saving} note={barNote} />}
    >
      {loadFailed && !loading && (
        <div className="mb-5">
          <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={reloadAll}>다시 불러오기</Btn>}>
            현재 설정을 불러오지 못했습니다 ({GROUPS_API}). 저장을 막아 두었습니다.
          </NoteLine>
        </div>
      )}

      {/* 설정 · 문화상품권 번호 — 넓은 화면에서 두 열, 좁으면 위아래.
             📌 상세 칸이 열리면(PC 오른쪽 칸이 본문을 밀어 좁힌다) 위아래로 — 두 열이면 이름 칸 180 옆 입력 칸이 몇십 px 로 줄어 글자가 세로로 꺾였다 */}
      <div className={`grid grid-cols-1 ${g ? "" : "xl:grid-cols-2"} gap-5 items-start mb-5`}>
        <Panel title="설정" flush>
          <FieldRow label="사용" changed={changed.enabled}>
            <Inline>
              <Switch on={cfg.enabled} onChange={(v) => set("enabled", v)} disabled={loading} label="게임 그룹 지원 사용" />
              <span className={`font-bold ${cfg.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{onLabel}</span>
            </Inline>
          </FieldRow>
          {/* 📌 시작 · 종료는 위아래 — 두 열 판(설정 | 번호) 안에서 나란히 두면 datetime-local 칸이 좁아 시각이 잘렸다 */}
          <FieldRow label="기간" hint={loading ? undefined : periodHint} changed={changed.period}>
            <div className="grid grid-cols-1 gap-3 max-w-[260px]">
              <label className="block min-w-0">
                <span className="block mb-1 text-[12px] text-[#5a5a5a]">시작</span>
                <input
                  type="datetime-local"
                  value={cfg.startsAt}
                  onChange={(e) => set("startsAt", e.target.value)}
                  onKeyDown={(e) => enterKey(e, save)}
                  aria-label="그룹 지원 시작 (KST)"
                  className={`${inputClass} tabular-nums`}
                />
              </label>
              <label className="block min-w-0">
                <span className="block mb-1 text-[12px] text-[#5a5a5a]">종료</span>
                <input
                  type="datetime-local"
                  value={cfg.endsAt}
                  onChange={(e) => set("endsAt", e.target.value)}
                  onKeyDown={(e) => enterKey(e, save)}
                  aria-label="그룹 지원 종료 (KST)"
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            </div>
          </FieldRow>
          <FieldRow label="최소 인원" changed={changed.min}>
            <Inline>
              <input
                type="text"
                inputMode="numeric"
                value={cfg.minMembers}
                onChange={(e) => set("minMembers", e.target.value.replace(/\D/g, "").slice(0, 2))}
                onKeyDown={(e) => enterKey(e, save)}
                placeholder={`${GROUP_MIN.min}~${GROUP_MIN.max}`}
                aria-label="최소 인원"
                className={numClass}
              />
              명
            </Inline>
          </FieldRow>
          <FieldRow label="최대 인원" changed={changed.max}>
            <Inline>
              <input
                type="text"
                inputMode="numeric"
                value={cfg.maxMembers}
                onChange={(e) => set("maxMembers", e.target.value.replace(/\D/g, "").slice(0, 2))}
                onKeyDown={(e) => enterKey(e, save)}
                placeholder={`~${GROUP_MAX.max}`}
                aria-label="최대 인원"
                className={numClass}
              />
              명
            </Inline>
          </FieldRow>
          {/* 지원 보너스 — 지원하기 성공 때 멤버마다 괴담회 추첨권(1인 평생 1번 · 서버가 지급). 같은 PUT config 로 저장 */}
          <FieldRow label="지원 보너스 추첨권" hint="0 = 지급 안 함" changed={changed.tickets}>
            <Inline>
              <input
                type="text"
                inputMode="numeric"
                value={cfg.applyTickets}
                onChange={(e) => set("applyTickets", e.target.value.replace(/\D/g, "").slice(0, 2))}
                onKeyDown={(e) => enterKey(e, save)}
                placeholder={`${GROUP_TICKETS.min}~${GROUP_TICKETS.max}`}
                aria-label="지원 보너스 추첨권 장 수"
                className={numClass}
              />
              장
            </Inline>
          </FieldRow>
        </Panel>

        <Panel title="문화상품권 번호" flush>
          {/* 심사 중 그룹을 다 승인하기에 번호가 모자라면 한 줄 */}
          {shortAll && (
            <NoteLine tone="bad" inset>
              번호 부족 · 심사 중 {fmt(reviewNeed)}명 · 남은 {fmt(codes.left)}개
            </NoteLine>
          )}
          <FieldRow label="남은 번호">
            <Inline>
              <span className={`text-[20px] font-black tabular-nums leading-none ${shortAll ? "text-[#d01634]" : "text-[#131313]"}`}>{loading ? "-" : fmt(codes.left)}</span>
              <span className="tabular-nums">
                배정 {loading ? "-" : fmt(codes.assigned)} · 전체 {loading ? "-" : fmt(codes.total)}
              </span>
            </Inline>
          </FieldRow>
          <FieldRow
            top
            label={
              <>
                번호 추가
                <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{codeLines.length ? `+${fmt(codeLines.length)}` : ""}</span>
              </>
            }
          >
            <textarea
              value={codeText}
              onChange={(e) => setCodeText(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="줄마다 하나"
              aria-label="문화상품권 번호 추가"
              disabled={loading || adding}
              className={`${inputClass} font-mono text-[13px] resize-y`}
            />
            <div className="mt-2 flex justify-end">
              <Btn variant="secondary" size="sm" onClick={addCodes} disabled={loading || adding || !codeLines.length}>
                {adding ? "추가 중…" : "추가"}
              </Btn>
            </div>
          </FieldRow>
        </Panel>
      </div>

      {/* 그룹 — 상태 거르기 · 검색 · 새로고침, 아래 전체 폭 표(심사 중 먼저) */}
      <Toolbar
        right={
          <Btn variant="ghost" onClick={refresh} disabled={loading}>
            새로고침
          </Btn>
        }
      >
        <Segmented
          options={[
            { v: "all", l: "전체", n: counts.all },
            ...GROUP_STATUS.map((s) => ({ v: s.v, l: s.l, n: counts[s.v] })),
          ]}
          value={filter}
          onChange={(v) => setFilter(v === "all" ? "all" : groupStatusOf(v))}
        />
        <SearchInput value={q} onChange={setQ} placeholder="그룹 · 게임 · 그룹장 · 코드" />
      </Toolbar>
      {listFailed && !loadFailed && !loading && (
        <div className="mb-4">
          <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={() => fetchAll(false)}>다시 불러오기</Btn>}>
            그룹 목록을 불러오지 못했습니다.
          </NoteLine>
        </div>
      )}
      {loading ? (
        <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
      ) : (
        <DataTable
          columns={cols}
          rows={shown}
          rowKey={(r) => r.id}
          onRowClick={(r) => setPickId(r.id)}
          selectedKey={pickId}
          empty={q.trim() || filter !== "all" ? "검색 결과가 없습니다." : "그룹이 없습니다."}
        />
      )}

      {/* ── 그룹 상세 — PC 오른쪽 칸 / 모바일 아래 판. 심사 중이면 승인 · 반려 ── */}
      <DetailPane
        open={!!g}
        onClose={closePick}
        title={g ? g.name || "-" : ""}
        sub={g ? [g.game, g.code].filter(Boolean).join(" · ") : undefined}
        badge={g ? <GroupChip s={g.status} /> : undefined}
        width={520}
        nav={{
          index: pickIdx,
          total: shown.length,
          onPrev: () => pickIdx > 0 && setPickId(shown[pickIdx - 1].id),
          onNext: () => pickIdx >= 0 && pickIdx < shown.length - 1 && setPickId(shown[pickIdx + 1].id),
        }}
        footer={
          g &&
          (g.status === "review" ? (
            <>
              {short && <PaneError msg={`번호 부족 · 필요 ${fmt(need)} · 남은 ${fmt(codes.left)}`} />}
              <Btn variant="ghost" className="mr-auto" onClick={closePick}>
                닫기
              </Btn>
              <Btn variant="secondary" onClick={openReject} disabled={acting}>
                반려
              </Btn>
              <Btn onClick={() => setApproveAsk(true)} disabled={acting || short || !dg}>
                승인
              </Btn>
            </>
          ) : (
            <Btn variant="ghost" className="ml-auto" onClick={closePick}>
              닫기
            </Btn>
          ))
        }
      >
        {g && (
          <>
            <dl>
              <DefRow k="그룹장">
                <span className="font-bold">{g.leaderName || "-"}</span>
                <span className="ml-1.5 text-[11px] font-normal text-[#8a8a8a] tabular-nums">{g.leaderId}</span>
              </DefRow>
              <DefRow k="인원">
                <span className="tabular-nums">{fmt(dg ? dg.members.length : g.count)}명</span>
              </DefRow>
              <DefRow k="일정">
                <span className="tabular-nums">{whenLabel(g.when)}</span>
              </DefRow>
              <DefRow k="만든 시각">
                <span className="tabular-nums">{isoLabel(g.createdAt)}</span>
              </DefRow>
              <DefRow k="지원 시각">
                <span className="tabular-nums">{isoLabel(g.submittedAt)}</span>
              </DefRow>
              {g.reviewedAt && (
                <DefRow k="처리">
                  <span className="tabular-nums">
                    {isoLabel(g.reviewedAt)}
                    {g.reviewedBy ? ` · ${g.reviewedBy}` : ""}
                  </span>
                </DefRow>
              )}
              {g.status === "rejected" && g.reason && (
                <DefRow k="반려 사유">
                  <span className="text-[#d01634] break-keep">{g.reason}</span>
                </DefRow>
              )}
            </dl>

            {/* 멤버 확인 — 새 계정 · 기록 없음은 빨간 글자(부계정 가려내기용) · 지원 보너스 미지급이 있으면 오른쪽 「추첨권 다시 지급」
                단추는 위아래를 당겨(-my) 머리 줄 높이를 그대로 둔다(단추가 뜨고 져도 아래 줄이 밀리지 않게) */}
            <div className="mt-6 mb-1 flex items-center gap-2">
              <h3 className="min-w-0 flex items-center gap-2 text-[14px] font-black">
                멤버
                <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{fmt(dg ? dg.members.length : g.count)}</span>
                {flagged > 0 && (
                  <StatusChip tone="bad" className={MINI_CHIP}>
                    확인 {fmt(flagged)}
                  </StatusChip>
                )}
              </h3>
              {canRegrant && (
                <Btn size="sm" variant="secondary" className="ml-auto -my-1.5" onClick={() => setRegrantAsk(true)} disabled={acting}>
                  추첨권 다시 지급
                </Btn>
              )}
            </div>
            {dg ? (
              dg.members.length ? (
                <ul>
                  {dg.members.map((m, i) => (
                    <MemberCheckRow key={m.id || i} m={m} leader={leaderOf(dg, m, i)} now={detail?.at || 0} bonusDue={bonusDue} />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-[#8a8a8a]">멤버가 없습니다.</p>
              )
            ) : detailLoading ? (
              <p className="py-6 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
            ) : (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={() => setDetailNonce((n) => n + 1)}>다시 불러오기</Btn>}>
                멤버 정보를 불러오지 못했습니다.
              </NoteLine>
            )}

            {/* 승인된 그룹 — 멤버별 배정 번호 */}
            {g.status === "approved" && dg && (
              <>
                <h3 className="mt-6 mb-1 flex items-center gap-2 text-[14px] font-black">
                  배정 번호
                  <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{fmt(dg.giftCodes.length)}</span>
                </h3>
                {dg.giftCodes.length ? (
                  <dl>
                    {dg.giftCodes.map((c, i) => (
                      <DefRow key={`${c.code}:${i}`} k={c.name || "-"}>
                        <span className="font-mono select-all break-all">{c.code}</span>
                      </DefRow>
                    ))}
                  </dl>
                ) : (
                  <p className="py-6 text-center text-[13px] text-[#8a8a8a]">배정된 번호가 없습니다.</p>
                )}
              </>
            )}
          </>
        )}
      </DetailPane>

      {/* ── 승인 확인 — 멤버마다 번호 하나씩 배정 · 멤버 전원에게 알림(서버) ── */}
      <ConfirmDialog
        open={approveAsk && !!g}
        title="그룹 승인"
        confirmLabel="승인"
        busy={acting}
        confirmDisabled={short}
        onCancel={() => setApproveAsk(false)}
        onConfirm={doApprove}
        body={
          g ? (
            <>
              <strong className="text-[#131313]">「{g.name}」</strong> · {fmt(need)}명 · 문화상품권 {fmt(need)}장
              <span className="block mt-1 tabular-nums">
                남은 번호 {fmt(codes.left)} → {fmt(Math.max(0, codes.left - need))}
              </span>
              <strong className="block mt-1 text-[#131313]">승인은 되돌릴 수 없습니다.</strong>
            </>
          ) : null
        }
      />

      {/* ── 추첨권 다시 지급 확인 — 보너스가 없는 멤버만(서버가 고른다 · 이미 들어간 장은 다시 넣지 않는다) ── */}
      <ConfirmDialog
        open={regrantAsk && !!g}
        title="추첨권 다시 지급"
        confirmLabel="지급"
        busy={acting}
        confirmDisabled={!canRegrant}
        onCancel={() => setRegrantAsk(false)}
        onConfirm={doRegrant}
        body={
          g ? (
            <>
              <strong className="text-[#131313]">「{g.name}」</strong> · 미지급 {fmt(bonusMissing)}명
              {Number.isFinite(bonusPer) && <span className="tabular-nums"> · 1인당 {fmt(bonusPer)}장</span>}
            </>
          ) : null
        }
      />

      {/* ── 반려 — 사유(1~100자) 입력 · 그룹장에게 알림(서버) ── */}
      <FormSheet
        open={rejectAsk && !!g}
        onClose={() => setRejectAsk(false)}
        title="그룹 반려"
        sub={g ? `「${g.name}」` : undefined}
        busy={acting}
        width={560}
        onSubmit={doReject}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setRejectAsk(false)}>
              취소
            </Btn>
            <Btn type="submit" variant="danger" disabled={!reason.trim()}>
              반려
            </Btn>
          </>
        }
      >
        <label className="block">
          <span className={labelClass}>
            사유 <Req />
          </span>
          <input
            autoFocus
            type="text"
            maxLength={MAX_REASON}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            // 한글 조합 중 Enter 는 조합을 끝내는 키 — 창 제출로 받지 않는다
            onKeyDown={(e) => {
              if (e.key === "Enter" && imeBusy(e)) e.preventDefault();
            }}
            placeholder="사유"
            className={inputClass}
          />
        </label>
        <p className={`${fieldNote} text-right tabular-nums`}>
          {reason.trim().length}/{MAX_REASON}
        </p>
      </FormSheet>
    </AdminPage>
  );
}

export default function AdminGoedamPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/goedam 이 서버에서 한다(requireAdmin)
  const { isAdmin, gate } = useAdminGuard();
  const { toast, toastEl } = useToast();
  const router = useRouter();
  const tab = tabOf(useSearchParams().get("tab"));

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 📌 연타 막이 — isSaving 은 다음 렌더에야 보여서 같은 틈에 두 번 들어오는 Enter · 클릭을 못 막는다
  const savingRef = useRef(false);

  const [guildRoles, setGuildRoles] = useState<GuildRole[]>([]);
  const [rolesFailed, setRolesFailed] = useState(false);
  const [regItems, setRegItems] = useState<RegItem[]>([]);
  const [itemsOk, setItemsOk] = useState(false);
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [stock, setStock] = useState<Record<string, Stock>>({});
  // 「상점」 줄 — 저장된 추첨권 아이템을 파는 상품(없으면 null) · 명단 고르기의 음성 날(GoedamWatch 에 기록이 있는 날)
  const [shopRow, setShopRow] = useState<ShopLink | null>(null);
  const [voiceDays, setVoiceDays] = useState<string[]>([]);
  const [eventKey, setEventKey] = useState("");
  // 📌 기본 꺼짐 — 불러오기에 실패했을 때 실수로 켜진 채 저장되는 일을 막는다(모델 기본값과 같음)
  const [cfg, setCfg] = useState<Cfg>(EMPTY_CFG);
  // 연출 미리보기 — 결과 등급(none = 꽝) · 종류 · 창 열림
  const [demoRarity, setDemoRarity] = useState("legendary");
  const [demoKind, setDemoKind] = useState("code");
  const [demoOpen, setDemoOpen] = useState(false);
  // 불러온(저장한) 한 벌 — 변경 목록 · 빨간 점 · 되돌리기의 기준
  const [base, setBase] = useState<Cfg | null>(null);
  // 불러온 시각 — 단계(추첨 전 · 중 · 종료) · 명단 기본 회차 판정용. 렌더 중에 Date.now() 를 부르지 않는다
  const [loadedAt, setLoadedAt] = useState(0);
  const newKeyRef = useRef(0);

  const [pane, setPane] = useState<Pane | null>(null);
  const [paneErr, setPaneErr] = useState("");
  const [del, setDel] = useState<{ type: "screening" | "prize"; key: string } | null>(null);

  const roleNameOf = useCallback((id: string) => guildRoles.find((r) => r.id === id)?.name || "", [guildRoles]);
  const itemOf = useCallback((id: string) => regItems.find((it) => it._id === id) || null, [regItems]);
  // 📌 아이템 상품 개수 2개 이상이 되는 아이템 — 추첨권 아이템 · 쌓이는 아이템(/api/admin/items stackable — 1개 단위 상품이 가리키거나 소모형). 서버 저장도 같은 판정.
  //    아이템 목록을 못 받았으면 모른다고 보고 칸을 열어 둔다(저장된 개수를 몰래 1 로 바꾸지 않게 — 서버가 막는다)
  const stackableOf = (id: string) => !!id && (id === cfg.ticketItemId || (itemsOk ? !!itemOf(id)?.stackable : true));
  const grantableRoles = useMemo(() => guildRoles.filter((r) => !r.managed), [guildRoles]);
  // 📌 아이템 상태 한 곳 — 서버 값(저장된 추첨권 · 아이템 상품)이 먼저, 없으면 목록(_draft "new" = 반영 전). 목록에도 없으면 missing(목록을 받았을 때만)
  const itemStateOf = useCallback(
    (id: string): ItemState => {
      const s = itemStates[id];
      if (s) return s;
      const it = regItems.find((x) => x._id === id);
      if (it) return it._draft === "new" ? "draft" : "live";
      return itemsOk ? "missing" : "live";
    },
    [itemStates, regItems, itemsOk]
  );

  // 서버 모양(data) → 화면 상태
  const applyData = useCallback((data: unknown) => {
    const d = rawOf(data);
    const p = rawOf(d.config);
    const next: Cfg = {
      enabled: p.enabled === true,
      title: String(p.title || ""),
      channelId: String(p.channelId || ""),
      ticketItemId: String(p.ticketItemId || ""),
      drawOpensAt: toKstInput(p.drawOpensAt),
      drawClosesAt: toKstInput(p.drawClosesAt),
      screenings: rawList(p.screenings).map(normScreening),
      voice: normVoice(rawOf(p.voice)),
      prizes: rawList(p.prizes).map(normPrize),
    };
    setEventKey(String(p.key || ""));
    setCfg(next);
    setBase(next);
    setItemStates(statesFrom(d.itemStates));
    setStock(stockFrom(d.stock));
    setShopRow(shopFrom(d.shop));
    setVoiceDays(voiceDaysFrom(d.voiceDays));
    setLoadedAt(Date.now());
    return next;
  }, []);

  // 📌 역할 목록만 다시 받는다 — 전체 재조회로 하면 저장하지 않은 편집이 서버 값으로 덮인다
  const fetchRoles = useCallback(() => {
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((roles) => {
        const list = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(list);
        setRolesFailed(list.length === 0);
      });
  }, []);

  // 📌 읽기만 — 상태는 응답을 받은 뒤에만 바꾼다(첫 화면은 effect 에서 부른다)
  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/goedam", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([d, roles, reg]) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRolesFailed(roleList.length === 0);
        const regOk = reg?.success === true && Array.isArray(reg?.data);
        setRegItems(regOk ? reg.data : []);
        setItemsOk(regOk);
        if (d?.success === true && d.data?.config) {
          applyData(d.data);
          setLoadFailed(false);
        } else {
          // 응답이 깨졌을 때 — 화면은 열어 두되 빈 구성이 운영 설정을 덮어쓰지 않게 저장을 잠근다
          setLoadFailed(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [applyData]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const closePane = useCallback(() => {
    setPane(null);
    setPaneErr("");
  }, []);
  // [다시 불러오기] — 목록이 서버 값으로 바뀌면 열린 편집 칸이 엉뚱한 값을 들고 있게 되므로 먼저 닫는다
  const reloadAll = () => {
    closePane();
    setIsLoading(true);
    load();
  };

  const snapshot = useMemo(() => (base ? sig(base) : ""), [base]);
  const isDirty = !isLoading && !!base && sig(cfg) !== snapshot;
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const setVoice = <K extends keyof VoiceCfg>(k: K, v: VoiceCfg[K]) => setCfg((c) => ({ ...c, voice: { ...c.voice, [k]: v } }));

  // ── 켜기 잠금 ─────────────────────────────────
  // 📌 추첨권 아이템이 실사이트에 없으면(안 고름 · 반영 전 · 찾을 수 없음) 「사용」을 켤 수 없다 — 봇이 그 id 로 추첨권을 준다(서버 PUT 도 같은 문구로 돌려보낸다)
  const enableLockOf = (c: Cfg) => {
    if (!c.ticketItemId) return "추첨권 아이템을 지정한 뒤 켤 수 있습니다.";
    const st = itemStateOf(c.ticketItemId);
    if (st === "draft") return "추첨권 아이템이 반영 전입니다 — 상점 관리에서 실사이트 반영 후 켤 수 있습니다.";
    if (st === "missing") return "추첨권 아이템을 찾을 수 없습니다 — 다시 지정해 주십시오.";
    return "";
  };
  const lockMsg = enableLockOf(cfg);

  // ── 상품 나간 수 · 확률 ─────────────────────────
  // 상품 → { given, total, left } — 서버 값(저장된 상품)에 지금 고친 수량을 얹는다. code 는 코드 풀 그대로
  const stockOfPrize = (p: Prize): Stock => {
    const s = p.pid ? stock[p.pid] : undefined;
    const given = s?.given ?? 0;
    if (p.kind === "code") return { given, total: s?.total ?? 0, left: s?.left ?? 0 };
    if (p.qty == null) return { given, total: null, left: null };
    return { given, total: p.qty, left: Math.max(0, p.qty - given) };
  };
  // 📌 나올 수 있는 상품 — 서버 고르기(lib/goedam.js readyOf + 남은 수)와 같은 판정. 확률 = 비중 / 나올 수 있는 상품 비중 합.
  //    확률 셈(planned)에는 반영 전(초안) 아이템도 넣는다 — 반영하면 바로 후보가 되니 설정할 때 그 확률을 미리 본다
  //    (2026-10-25 운영자 "확률을 모르면 설정을 어캐해"). 아직 안 나온다는 표시는 이름 칸의 「반영 전」 표 · 「지금 나올 수 있는 상품이 없습니다」 줄(지금 기준)
  const drawable = (p: Prize, planned = true) => {
    const st = p.kind === "item" && p.itemId ? itemStateOf(p.itemId) : "";
    const ready =
      p.kind === "item" ? st === "live" || (planned && st === "draft") : p.kind === "role" ? !!p.roleId : p.kind === "xp" || p.kind === "point" ? p.amount > 0 : true;
    const s = stockOfPrize(p);
    return ready && (s.left == null || s.left > 0);
  };
  const weightSum = cfg.prizes.reduce((sum, p) => sum + (drawable(p) ? p.weight : 0), 0);
  const liveWeightSum = cfg.prizes.reduce((sum, p) => sum + (drawable(p, false) ? p.weight : 0), 0);
  // weight — 편집 칸에서 고치는 중인 비중(미리 보기). 합은 그 상품 몫만 바꿔 다시 센다
  const chanceOf = (p: Prize, weight = p.weight) => {
    if (!drawable(p)) return "-";
    const sum = weightSum - p.weight + weight;
    if (!(sum > 0)) return "-";
    // 유저 창(app/level/GoedamModal.js pctOf)과 같은 글자 — 0.01% 미만 · 99.99% 넘으면(꽝 등이 남아 100 으로 반올림되는 때) 끝을 붙인다
    const r = (weight / sum) * 100;
    if (r > 0 && r < 0.01) return "<0.01%";
    if (r > 99.99 && r < 100) return ">99.99%";
    return `${(Math.round(r * 100) / 100).toLocaleString("ko-KR")}%`;
  };

  // ── 저장 ────────────────────────────────────
  // 실패 알림 — 편집 칸에서 누른 저장이면 칸 안(저장 단추 위)에, 그 밖은 토스트로
  const fail = (msg: string, from: SaveFrom) => {
    if (from === "pane" && pane) {
      setPaneErr(msg);
      sfxErr();
    } else {
      toast(msg, true);
    }
  };

  const doSave = async (c: Cfg, from: SaveFrom, okMsg: string, codes?: { key: string; list: string[] }) => {
    savingRef.current = true;
    setIsSaving(true);
    const res = await fetch("/api/admin/goedam", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: c.enabled,
        title: c.title.trim(),
        channelId: c.channelId.trim(),
        ticketItemId: c.ticketItemId,
        drawOpensAt: fromKstInput(c.drawOpensAt),
        drawClosesAt: fromKstInput(c.drawClosesAt),
        // 📌 기존 회차 · 상품의 sid · pid 를 그대로 되돌려 보낸다 — 빠지면 서버가 새 번호를 발급해 명단 · 나간 수 · 코드와 끊긴다
        screenings: c.screenings.map((s) => ({ sid: s.sid, title: s.title.trim(), startsAt: fromKstInput(s.startsAt), endsAt: fromKstInput(s.endsAt), tickets: s.tickets, ratio: s.ratio })),
        voice: {
          enabled: c.voice.enabled,
          minutes: intText(c.voice.minutes),
          tickets: intText(c.voice.tickets),
          startsAt: fromKstInput(c.voice.startsAt),
          endsAt: fromKstInput(c.voice.endsAt),
        },
        prizes: c.prizes.map((p) => ({
          pid: p.pid,
          name: p.name.trim(),
          kind: p.kind,
          amount: p.amount,
          itemId: p.itemId,
          itemName: p.kind === "item" ? itemOf(p.itemId)?.name || p.itemName : "",
          count: p.count,
          roleId: p.roleId,
          roleName: p.kind === "role" ? roleNameOf(p.roleId) || p.roleName : "",
          qty: p.qty,
          weight: p.weight,
          rarity: p.rarity,
          ...(codes && codes.key === p.key ? { codes: codes.list } : {}),
        })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    savingRef.current = false;
    setIsSaving(false);
    if (res?.ok && d?.success === true && d.data?.config) {
      const next = applyData(d.data);
      const keys = new Set([...next.screenings.map((s) => s.key), ...next.prizes.map((p) => p.key)]);
      if (from === "pane") closePane();
      else setPane((cur) => (cur && keys.has(cur.d.key) ? cur : null));
      setLoadFailed(false);
      const added = Object.values(rawOf(d.data.added)).reduce<number>((s, n) => s + (Number(n) || 0), 0);
      toast(codes ? `${okMsg} · 코드 ${fmt(added)}개 추가` : okMsg);
    } else {
      fail(d?.error || "저장에 실패했습니다.", from);
    }
  };

  // 📌 모든 저장의 입구 — 저장 줄 · Enter · 편집 칸 [저장] · 삭제 확인이 전부 여기로 온다.
  //    over 로 넘긴 값(편집 칸에서 막 고친 목록)을 화면 상태에 얹어 한 벌로 검사 · 저장한다. codes — 그 저장에만 실어 보낼 붙여 넣은 코드
  const requestSave = (over: Partial<Cfg>, from: SaveFrom, okMsg = "저장되었습니다.", codes?: { key: string; list: string[] }) => {
    if (savingRef.current) return;
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    const next: Cfg = { ...cfg, ...over };
    if (sig(next) === snapshot && !codes) {
      if (from === "pane") closePane();
      sfxTick();
      return toast("변경 사항이 없습니다.", false, { sound: false });
    }
    const err = checkCfg(next);
    if (err) return fail(err, from);
    // 켜진 채 저장(켜기 · 켜져 있는 동안의 저장) — 추첨권 아이템이 실사이트에 있어야 한다. 끄는 저장은 늘 된다
    const locked = next.enabled ? enableLockOf(next) : "";
    if (locked) return fail(locked, from);
    doSave(next, from, okMsg, codes);
  };
  const saveList = () => requestSave({}, "list");
  // 📌 상품 순서(2026-10-25 운영자 "위치 바꾸는 기능 좀 줘봐 · 아니면 정렬 기능") — 줄 앞 손잡이로 끌어 놓으면 그 차례로 바로 저장한다
  //    (유저 창 상품 줄 · 뽑기 기록이 이 차례를 쓴다). 열 머리(이름 · 종류 · 남은 수 · 비중 · 확률 · 희귀도) 정렬은 보기만 — 정렬 중엔 끌기가 잠긴다(DataTable)
  const reorderPrizes = (keys: string[]) => {
    if (savingRef.current) return;
    const byKey = new Map(cfg.prizes.map((p) => [p.key, p]));
    const next = keys.map((k) => byKey.get(k)).filter((p): p is Prize => !!p);
    if (next.length !== cfg.prizes.length) return;
    setCfg((c) => ({ ...c, prizes: next }));
    requestSave({ prizes: next }, "list", "순서를 바꿨습니다.");
  };

  // ── 편집 칸 ────────────────────────────────
  const openScreening = (s: Screening | null) => {
    if (savingRef.current) return;
    setPaneErr("");
    if (s) {
      setPane({ type: "screening", isNew: false, d: { key: s.key, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, tickets: String(s.tickets), ratioPct: String(Math.round(s.ratio * 100)) } });
      return;
    }
    if (cfg.screenings.length >= MAX_SCREENINGS) return toast(`회차는 최대 ${MAX_SCREENINGS}개까지 등록할 수 있습니다.`, true);
    // 새 회차 — 마지막 회차 다음 날 같은 시각(없으면 추첨 시작 시각) · 2시간 · 1장 · 80%
    const last = cfg.screenings[cfg.screenings.length - 1];
    const start = last ? shiftKst(last.startsAt, DAY_MS) : cfg.drawOpensAt;
    setPane({
      type: "screening",
      isNew: true,
      d: { key: `new:${++newKeyRef.current}`, title: "", startsAt: start, endsAt: shiftKst(start, 2 * HOUR_MS), tickets: String(SCREENING_TICKETS.def), ratioPct: String(SCREENING_RATIO.def * 100) },
    });
  };
  const openPrize = (p: Prize | null) => {
    if (savingRef.current) return;
    setPaneErr("");
    if (p) {
      setPane({
        type: "prize",
        isNew: false,
        d: {
          key: p.key,
          name: p.name,
          kind: p.kind,
          amount: p.amount ? String(p.amount) : "",
          itemId: p.itemId,
          itemName: p.itemName,
          count: p.count > 1 ? String(p.count) : "",
          roleId: p.roleId,
          roleName: p.roleName,
          qty: p.qty == null ? "" : String(p.qty),
          weight: String(p.weight),
          rarity: p.rarity || "common",
          codesText: "",
        },
      });
      return;
    }
    if (cfg.prizes.length >= MAX_PRIZES) return toast(`상품은 최대 ${MAX_PRIZES}개까지 등록할 수 있습니다.`, true);
    setPane({
      type: "prize",
      isNew: true,
      d: { key: `new:${++newKeyRef.current}`, name: "", kind: "xp", amount: "", itemId: "", itemName: "", count: "", roleId: "", roleName: "", qty: "", weight: String(PRIZE_WEIGHT.def), rarity: "common", codesText: "" },
    });
  };
  const editDraft = (d: ScreeningDraft | PrizeDraft) => {
    setPane((cur) => (cur ? ({ ...cur, d } as Pane) : cur));
    setPaneErr("");
  };

  // 편집 칸 [저장] · Enter — 칸의 값을 검사해 목록에 얹고 그대로 저장한다
  const screeningFromDraft = (d: ScreeningDraft, sid: string): Screening => ({
    key: d.key,
    sid,
    title: d.title.trim(),
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    tickets: intText(d.tickets),
    ratio: Math.round(intText(d.ratioPct)) / 100,
  });
  const prizeFromDraft = (d: PrizeDraft, pid: string): Prize => ({
    key: d.key,
    pid,
    name: d.name.trim(),
    kind: d.kind,
    amount: d.kind === "xp" || d.kind === "point" ? parseAmount(d.amount) : 0,
    itemId: d.kind === "item" ? d.itemId : "",
    itemName: d.kind === "item" ? itemOf(d.itemId)?.name || d.itemName : "",
    // 빈칸 = 1개. 쌓이지 않는 아이템은 늘 1개(칸도 잠겨 있다 — 서버도 같은 규칙으로 막는다)
    count: d.kind !== "item" ? 0 : stackableOf(d.itemId) && d.count.trim() ? intText(d.count) : 1,
    roleId: d.kind === "role" ? d.roleId : "",
    roleName: d.kind === "role" ? roleNameOf(d.roleId) || d.roleName : "",
    // 빈칸 = 무제한. code 는 코드 수가 곧 수량
    qty: d.kind === "code" || !d.qty.trim() ? null : intText(d.qty),
    weight: intText(d.weight),
    rarity: d.rarity === "common" ? "" : d.rarity,
  });
  const codeLines = (text: string) => [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];

  const savePane = () => {
    if (!pane) return;
    if (pane.type === "screening") {
      const cur = cfg.screenings.find((s) => s.key === pane.d.key);
      const s = screeningFromDraft(pane.d, cur?.sid || "");
      const err = screeningError(s);
      if (err) return fail(err, "pane");
      const list = cur ? cfg.screenings.map((x) => (x.key === s.key ? s : x)) : [...cfg.screenings, s];
      return requestSave({ screenings: sortScreenings(list) }, "pane");
    }
    const cur = cfg.prizes.find((p) => p.key === pane.d.key);
    const p = prizeFromDraft(pane.d, cur?.pid || "");
    const err = prizeError(p);
    if (err) return fail(err, "pane");
    const codes = p.kind === "code" ? codeLines(pane.d.codesText) : [];
    if (codes.some((c) => c.length > MAX_CODE_LEN)) return fail(`코드는 한 줄에 ${MAX_CODE_LEN}자 이하로 입력해 주십시오.`, "pane");
    if (codes.length > MAX_CODES_PER_SAVE) return fail(`코드는 한 번에 ${fmt(MAX_CODES_PER_SAVE)}개까지 추가할 수 있습니다.`, "pane");
    const list = cur ? cfg.prizes.map((x) => (x.key === p.key ? p : x)) : [...cfg.prizes, p];
    requestSave({ prizes: list }, "pane", "저장되었습니다.", codes.length ? { key: p.key, list: codes } : undefined);
  };

  // ── 삭제 ────────────────────────────────────
  // 아직 저장 안 한 새 줄은 잃을 게 없다 — 편집 칸만 닫는다. 저장된 줄은 확인 뒤 바로 저장
  const askDelete = (type: "screening" | "prize", key: string) => {
    if (savingRef.current) return;
    if (key.startsWith("new:")) return closePane();
    setDel({ type, key });
  };
  const confirmDelete = () => {
    if (!del || savingRef.current) return;
    const { type, key } = del;
    setDel(null);
    setPane((cur) => (cur?.d.key === key ? null : cur));
    if (type === "screening") requestSave({ screenings: cfg.screenings.filter((s) => s.key !== key) }, "list", "회차를 삭제했습니다.");
    else requestSave({ prizes: cfg.prizes.filter((p) => p.key !== key) }, "list", "상품을 삭제했습니다.");
  };

  // 📌 되돌리기 — 불러온(저장한) 한 벌로. 줄 key 도 그대로라 표가 흔들리지 않는다
  const resetToBase = () => {
    if (!base) return;
    closePane();
    setCfg(base);
  };

  // ── 명단 ────────────────────────────────────
  const [watchPick, setWatchPick] = useState("");
  const [roster, setRoster] = useState<{ sid: string; rows: RosterRow[]; failed: boolean; nonce: number } | null>(null);
  const [rosterNonce, setRosterNonce] = useState(0);
  const [rosterQ, setRosterQ] = useState("");
  const [grantId, setGrantId] = useState("");
  const [grantAsk, setGrantAsk] = useState<{ userId: string; userName: string } | null>(null);
  const [granting, setGranting] = useState(false);
  // 기본 회차 — 진행 중인 회차, 없으면 가장 최근에 끝난 회차, 그것도 없으면 첫 회차(저장된 회차만 — 명단은 sid 로 읽는다).
  //    회차가 하나도 없으면 가장 최근 음성 날
  const savedScreenings = useMemo(() => base?.screenings ?? [], [base]);
  const voiceSids = useMemo(() => voiceDays.map((d) => voiceSid(d)), [voiceDays]);
  const defaultSid = useMemo(() => {
    if (!savedScreenings.length) return voiceSids[voiceSids.length - 1] || "";
    const now = loadedAt;
    const live = savedScreenings.find((s) => kstMs(s.startsAt) <= now && now < kstMs(s.endsAt));
    if (live) return live.sid;
    const past = savedScreenings.filter((s) => kstMs(s.endsAt) <= now);
    return (past[past.length - 1] || savedScreenings[0]).sid;
  }, [savedScreenings, voiceSids, loadedAt]);
  const watchSid = savedScreenings.some((s) => s.sid === watchPick) || voiceSids.includes(watchPick) ? watchPick : defaultSid;
  const watchScreening = savedScreenings.find((s) => s.sid === watchSid) || null;
  // 📌 음성 날을 고르면 그날(「음성 M. D.」) — 기준(하루 분 · 장 수)은 저장된 음성 설정
  const watchDay = watchScreening ? "" : voiceDayOf(watchSid);
  const savedVoice = base?.voice ?? EMPTY_VOICE;
  const watchTickets = watchScreening ? watchScreening.tickets : intText(savedVoice.tickets) || VOICE_TICKETS.def;
  const watchName = watchScreening ? `「${watchScreening.title}」 회차` : watchDay ? `「음성 ${voiceDayLabel(watchDay)}」` : "";
  const watchOk = !!watchScreening || !!watchDay;
  const rosterLoading = !!watchSid && (roster?.sid !== watchSid || roster?.nonce !== rosterNonce);

  useEffect(() => {
    if (!isAdmin || tab !== "watch" || !watchSid) return;
    let live = true;
    fetch(`/api/admin/goedam?watch=${encodeURIComponent(watchSid)}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (!live) return;
        setRoster({ sid: watchSid, rows: d?.success === true ? rosterFrom(d.data) : [], failed: d?.success !== true, nonce: rosterNonce });
      });
    return () => {
      live = false;
    };
  }, [isAdmin, tab, watchSid, rosterNonce]);

  const rosterRows = useMemo(() => (roster && roster.sid === watchSid ? roster.rows : []), [roster, watchSid]);
  const rosterShown = useMemo(() => {
    const q = rosterQ.trim().toLowerCase();
    return q ? rosterRows.filter((r) => r.userName.toLowerCase().includes(q) || r.userId.includes(q)) : rosterRows;
  }, [rosterRows, rosterQ]);
  const askGrant = (userId: string, userName = "") => {
    if (!watchOk) return;
    if (!SNOWFLAKE.test(userId)) return toast("디스코드 ID가 올바르지 않습니다.", true);
    const row = rosterRows.find((r) => r.userId === userId);
    if (row?.grantedAt) return toast("이미 지급되었습니다.", true);
    setGrantAsk({ userId, userName: userName || row?.userName || "" });
  };
  const doGrant = async () => {
    if (!grantAsk || !watchOk || granting) return;
    const sid = watchSid;
    setGranting(true);
    const res = await fetch("/api/admin/goedam/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid, userId: grantAsk.userId }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setGranting(false);
    setGrantAsk(null);
    if (res?.ok && d?.success === true) {
      const row = rosterFrom([d.data?.row])[0];
      setRoster((cur) =>
        cur && cur.sid === sid
          ? { ...cur, rows: cur.rows.some((r) => r.userId === row.userId) ? cur.rows.map((r) => (r.userId === row.userId ? row : r)) : [row, ...cur.rows] }
          : cur
      );
      setGrantId("");
      // 이미 들어가 있던 장 수는 다시 넣지 않는다(서버가 주문 묶음으로 센다) — 0장이면 표시만 세운 것
      const n = Number(d.data?.tickets) || 0;
      toast(n > 0 ? `추첨권 ${fmt(n)}장을 지급했습니다.` : "지급 처리했습니다.");
    } else {
      toast(d?.error || "지급에 실패했습니다.", true);
    }
  };

  // ── 추첨 기록 ───────────────────────────────
  const [draws, setDraws] = useState<{ rows: DrawRow[]; failed: boolean; nonce: number } | null>(null);
  const [drawsNonce, setDrawsNonce] = useState(0);
  const [drawQ, setDrawQ] = useState("");
  const [drawFilter, setDrawFilter] = useState<"all" | "fail">("all");
  const [regrantAsk, setRegrantAsk] = useState<DrawRow | null>(null);
  const [regranting, setRegranting] = useState(false);
  const drawsLoading = draws?.nonce !== drawsNonce;

  useEffect(() => {
    if (!isAdmin || tab !== "draws") return;
    let live = true;
    fetch("/api/admin/goedam?draws=1", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (live) setDraws({ rows: d?.success === true ? drawsFrom(d.data) : [], failed: d?.success !== true, nonce: drawsNonce });
      });
    return () => {
      live = false;
    };
  }, [isAdmin, tab, drawsNonce]);

  const drawRows = useMemo(() => draws?.rows ?? [], [draws]);
  const failCount = drawRows.filter((r) => !r.granted).length;
  const drawShown = useMemo(() => {
    const q = drawQ.trim().toLowerCase();
    return drawRows.filter(
      (r) =>
        (drawFilter === "all" || !r.granted) &&
        (!q || r.userName.toLowerCase().includes(q) || r.userId.includes(q) || r.prizeName.toLowerCase().includes(q) || r.code.toLowerCase().includes(q))
    );
  }, [drawRows, drawQ, drawFilter]);
  const doRegrant = async () => {
    if (!regrantAsk || regranting) return;
    setRegranting(true);
    const res = await fetch("/api/admin/goedam/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drawId: regrantAsk.id }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    const id = regrantAsk.id;
    setRegranting(false);
    setRegrantAsk(null);
    if (res?.ok && d?.success === true) {
      setDraws((cur) => (cur ? { ...cur, rows: cur.rows.map((r) => (r.id === id ? { ...r, granted: true, error: "" } : r)) } : cur));
      toast("지급했습니다.");
    } else {
      toast(d?.error || "지급에 실패했습니다.", true);
    }
  };

  // ── 연출 미리보기 — 고른 결과 + 지금 설정(제목 · 기간 · 회차 · 상품)으로 추첨 창 상태를 만든다(GET /api/goedam 모양). 추첨권은 99장으로 보인다 ──
  const demoNone = demoRarity === "none";
  const demoKindOn = demoNone ? "none" : demoKind;
  const demoPrize = cfg.prizes.find((p) => p.kind === demoKindOn);
  const demoBase = DEMO_BASE[demoKindOn] || DEMO_BASE.none;
  const demoResult = {
    pid: demoPrize?.pid || "demo",
    kind: demoKindOn,
    rarity: demoNone ? "" : demoRarity,
    name: demoPrize ? prizeTitle(demoPrize) : demoBase.name,
    amount: demoPrize?.amount || demoBase.amount || 0,
    itemName: demoPrize?.itemName || demoBase.itemName || "",
    count: demoPrize?.count || demoBase.count || 0,
    code: demoKindOn === "code" ? demoBase.code || "" : "",
  };
  // 상품 줄 — 서버 유저 화면(lib/goedam.js getGoedamState)과 같은 모양: 보이는 이름 · 나간 수를 뺀 남은 수 · 확률
  const demoPrizes = cfg.prizes
    .filter((p) => p.kind !== "none")
    .map((p) => {
      const st = stockOfPrize(p);
      return { pid: p.pid || p.key, name: prizeTitle(p), kind: p.kind, amount: p.amount, itemName: p.itemName, count: p.count, rarity: p.rarity, total: st.total, left: st.left, chance: drawable(p) && weightSum > 0 ? (p.weight / weightSum) * 100 : 0, ready: true };
    });
  const demo = {
    result: demoResult,
    data: {
      phase: "open",
      adminPreview: false,
      title: cfg.title || "방구석 심야 괴담회",
      drawOpensAt: cfg.drawOpensAt,
      drawClosesAt: cfg.drawClosesAt,
      tickets: 99,
      screenings: cfg.screenings.map((s) => ({ sid: s.sid || s.key, title: s.title, startsAt: s.startsAt, endsAt: s.endsAt, tickets: s.tickets, ratio: s.ratio, mySeconds: 0, earned: false, granted: 0 })),
      // 상품이 하나도 없으면 고른 결과를 한 줄로(창 단추가 「남은 상품 없음」으로 잠기지 않게)
      prizes: demoPrizes.length ? demoPrizes : [{ pid: "demo", name: demoResult.name, kind: demoKindOn, amount: demoResult.amount, itemName: demoResult.itemName, count: demoResult.count, rarity: demoResult.rarity, total: null, left: null, chance: 100, ready: true }],
      history: [],
      // 받는 법(2026-10-24) — 연출 미리보기에는 음성 · 상점 줄 없음(창은 null 이면 그 줄을 그리지 않는다)
      voice: null,
      shop: null,
    },
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다
  if (gate) return gate;

  // 📌 그룹 지원 탭 — 제 틀(설정 저장 줄 · 상세 칸 · 확인 창)을 따로 그린다. 머리 · 탭 줄 · 토스트는 이 화면 것 그대로
  if (tab === "groups") {
    return (
      <>
        <GroupsTab tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={tabHref} />} desc={`이벤트 키 ${eventKey || "-"}`} toast={toast} />
        {toastEl}
      </>
    );
  }

  // ── 변경 목록(저장 줄) ───────────────────────
  // 📌 불러온 한 벌과 지금 값을 맞대어 한 줄씩. 회차 · 상품은 sid · pid 로 짝을 지어 추가 · 삭제 · 수정을 가린다(보여 주기 전용)
  const changes: string[] = [];
  const changed = {
    enabled: !!base && base.enabled !== cfg.enabled,
    title: !!base && base.title.trim() !== cfg.title.trim(),
    channelId: !!base && base.channelId.trim() !== cfg.channelId.trim(),
    ticket: !!base && base.ticketItemId !== cfg.ticketItemId,
    period: !!base && (base.drawOpensAt !== cfg.drawOpensAt || base.drawClosesAt !== cfg.drawClosesAt),
    voiceEnabled: !!base && base.voice.enabled !== cfg.voice.enabled,
    voiceMinutes: !!base && !Object.is(intText(base.voice.minutes), intText(cfg.voice.minutes)),
    voiceTickets: !!base && !Object.is(intText(base.voice.tickets), intText(cfg.voice.tickets)),
    voicePeriod: !!base && (base.voice.startsAt !== cfg.voice.startsAt || base.voice.endsAt !== cfg.voice.endsAt),
  };
  // 숫자 칸 글자(비었거나 못 읽으면 「없음」)
  const numLabel = (s: string, unit: string) => (Number.isFinite(intText(s)) ? `${fmt(intText(s))}${unit}` : "없음");
  if (base && isDirty) {
    if (changed.enabled) changes.push(`상태 ${onOffLabel(base.enabled)} → ${onOffLabel(cfg.enabled)}`);
    if (changed.title) changes.push(`제목 ${base.title.trim() || "없음"} → ${cfg.title.trim() || "없음"}`);
    if (changed.channelId) changes.push(`채널 ${base.channelId.trim() || "없음"} → ${cfg.channelId.trim() || "없음"}`);
    if (changed.ticket) changes.push(`추첨권 ${itemOf(base.ticketItemId)?.name || "없음"} → ${itemOf(cfg.ticketItemId)?.name || "없음"}`);
    if (base.drawOpensAt !== cfg.drawOpensAt) changes.push(`추첨 시작 ${kstLabel(base.drawOpensAt)} → ${kstLabel(cfg.drawOpensAt)}`);
    if (base.drawClosesAt !== cfg.drawClosesAt) changes.push(`추첨 종료 ${kstLabel(base.drawClosesAt)} → ${kstLabel(cfg.drawClosesAt)}`);
    if (changed.voiceEnabled) changes.push(`음성 활동 ${voiceOnLabel(base.voice.enabled)} → ${voiceOnLabel(cfg.voice.enabled)}`);
    if (changed.voiceMinutes) changes.push(`하루 음성 ${numLabel(base.voice.minutes, "분")} → ${numLabel(cfg.voice.minutes, "분")}`);
    if (changed.voiceTickets) changes.push(`음성 장 수 ${numLabel(base.voice.tickets, "장")} → ${numLabel(cfg.voice.tickets, "장")}`);
    if (base.voice.startsAt !== cfg.voice.startsAt) changes.push(`음성 시작 ${kstLabel(base.voice.startsAt)} → ${kstLabel(cfg.voice.startsAt)}`);
    if (base.voice.endsAt !== cfg.voice.endsAt) changes.push(`음성 종료 ${kstLabel(base.voice.endsAt)} → ${kstLabel(cfg.voice.endsAt)}`);
  }

  // 단계 — 불러온 시각 기준(렌더 중 시계를 읽지 않는다)
  const openMs = kstMs(cfg.drawOpensAt);
  const closeMs = kstMs(cfg.drawClosesAt);
  const periodOk = Number.isFinite(openMs) && Number.isFinite(closeMs) && closeMs > openMs;
  const phase = !cfg.enabled ? "중단" : !periodOk || !loadedAt ? "-" : loadedAt < openMs ? "추첨 전" : loadedAt < closeMs ? "추첨 중" : "종료";
  // 기간 칸 아래 한 줄 — 추첨 기간 · 음성 활동 기간이 같은 모양
  const periodHintOf = (a: number, b: number) =>
    !(Number.isFinite(a) && Number.isFinite(b) && b > a) ? (
      <span className="font-bold text-[#d01634]">{Number.isFinite(a) && Number.isFinite(b) ? "종료 시각은 시작 시각 이후로 지정해 주십시오." : "기간을 입력해 주십시오."}</span>
    ) : (
      `KST · 종료 시각 미포함 · ${Math.round((b - a) / DAY_MS * 10) / 10}일`
    );
  const periodHint = periodHintOf(openMs, closeMs);
  const voicePeriodHint = periodHintOf(kstMs(cfg.voice.startsAt), kstMs(cfg.voice.endsAt));
  const leftSum = cfg.prizes.reduce<number | null>((sum, p) => {
    const s = stockOfPrize(p);
    return sum == null || s.left == null ? null : sum + s.left;
  }, 0);

  // 📌 저장 줄 — 구성 탭에서만. 불러오기 실패면 바뀐 것과 상관없이 잠근 채 이유를 띄운다. 편집 칸이 열려 있는 동안은 숨긴다(칸의 [저장]이 나머지 변경까지 한 번에 저장한다)
  const onConfig = tab === "config";
  const barNote = onConfig && !pane && loadFailed ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span> : undefined;

  const ticketItem = itemOf(cfg.ticketItemId);
  const itemOptions = regItems.map((it) => ({
    value: it._id,
    label: it.name,
    hint: itemStateOf(it._id) === "draft" ? `반영 전 · ${itemTypeLabel(it.type)}` : itemTypeLabel(it.type),
    icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
  }));

  // ── 표 열 ──────────────────────────────────
  type SRow = { s: Screening; i: number };
  const screeningCols: Column<SRow>[] = [
    { key: "no", label: "회차", className: "w-16", mobile: "hide", render: ({ i }) => <span className="font-black tabular-nums">{i + 1}</span> },
    { key: "title", label: "제목", mobile: "title", render: ({ s }) => <span className="font-bold">{s.title || "-"}</span> },
    { key: "when", label: "일시", render: ({ s }) => <span className="tabular-nums">{rangeLabel(s.startsAt, s.endsAt)}</span> },
    { key: "tickets", label: "장 수", align: "right", className: "w-20", render: ({ s }) => <span className="tabular-nums">{s.tickets}장</span> },
    {
      key: "ratio",
      label: "완청",
      align: "right",
      className: "w-32",
      render: ({ s }) => (
        <span className="tabular-nums whitespace-nowrap">
          {Math.round(s.ratio * 100)}%<span className="ml-1.5 text-[11px] font-bold text-[#8a8a8a]">{durLabel(needSec(s))}</span>
        </span>
      ),
    },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-32",
      mobile: "hide",
      render: ({ s }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openScreening(s); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); askDelete("screening", s.key); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  const prizeCols: Column<Prize>[] = [
    {
      key: "name",
      label: "이름",
      mobile: "title",
      sortValue: (p) => prizeTitle(p),
      render: (p) => (
        <span className="font-bold break-keep">
          {prizeTitle(p)}
          {p.kind === "item" && !!p.itemId && <ItemStateChip state={itemStateOf(p.itemId)} />}
        </span>
      ),
    },
    { key: "kind", label: "종류", className: "w-20", sortValue: (p) => KIND_LABEL[p.kind], render: (p) => KIND_LABEL[p.kind] },
    { key: "detail", label: "내용", render: (p) => <span className="break-keep">{prizeDetail(p, roleNameOf, itemOf)}</span> },
    {
      key: "left",
      label: "남은 수",
      align: "right",
      className: "w-32",
      sortValue: (p) => stockOfPrize(p).left, // 무제한(null)은 늘 맨 끝
      render: (p) => {
        const s = stockOfPrize(p);
        return s.total == null ? (
          <span className="text-[#5a5a5a]">무제한</span>
        ) : (
          <span className={`tabular-nums ${s.left === 0 ? "text-[#d01634] font-black" : ""}`}>
            {fmt(s.left ?? 0)} / {fmt(s.total)}
          </span>
        );
      },
    },
    { key: "weight", label: "비중", align: "right", className: "w-24", sortValue: (p) => p.weight, render: (p) => <span className="tabular-nums">{fmt(p.weight)}</span> },
    { key: "chance", label: "확률", align: "right", className: "w-24", sortValue: (p) => (drawable(p) && weightSum > 0 ? p.weight / weightSum : null), render: (p) => <span className="tabular-nums font-bold">{chanceOf(p)}</span> },
    { key: "rarity", label: "희귀도", className: "w-24", sortValue: (p) => rarityOf(p.rarity).rank, render: (p) => <RarityMark v={p.rarity} /> },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-32",
      mobile: "hide",
      render: (p) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openPrize(p); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); askDelete("prize", p.key); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  const rosterCols: Column<RosterRow>[] = [
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="min-w-0">
          <span className="font-bold">{r.userName || "-"}</span>
          <span className="ml-1.5 text-[11px] text-[#8a8a8a] tabular-nums">{r.userId}</span>
        </span>
      ),
    },
    { key: "time", label: watchDay ? "음성 시간" : "머문 시간", align: "right", className: "w-32", sortValue: (r) => r.seconds, render: (r) => <span className="tabular-nums">{durLabel(r.seconds)}</span> },
    {
      key: "pct",
      label: "비율",
      align: "right",
      className: "w-24",
      sortValue: (r) => r.pct,
      render: (r) => <span className={`tabular-nums font-bold ${r.earned ? "text-emerald-700" : ""}`}>{r.pct.toLocaleString("ko-KR")}%</span>,
    },
    {
      key: "state",
      label: "지급",
      className: "w-36",
      render: (r) =>
        r.grantedAt ? (
          <StatusChip tone="ok">
            {r.granted}장{r.manual ? " · 수동" : ""}
          </StatusChip>
        ) : r.earned ? (
          <StatusChip tone="info">{watchDay ? "달성" : "완청"} · 대기</StatusChip>
        ) : (
          <StatusChip>미달</StatusChip>
        ),
    },
    {
      key: "at",
      label: "지급 시각",
      className: "w-32",
      render: (r) => <span className="tabular-nums text-[#5a5a5a]">{isoLabel(r.grantedAt)}</span>,
    },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-24",
      render: (r) =>
        r.grantedAt ? (
          <span className="text-[#a3a3a3]">-</span>
        ) : (
          <Btn variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); askGrant(r.userId, r.userName); }}>
            지급
          </Btn>
        ),
    },
  ];

  const drawCols: Column<DrawRow>[] = [
    { key: "at", label: "시각", className: "w-32", mobile: "meta", render: (r) => <span className="tabular-nums">{isoLabel(r.at)}</span> },
    {
      key: "user",
      label: "유저",
      mobile: "title",
      render: (r) => (
        <span className="min-w-0">
          <span className="font-bold">{r.userName || "-"}</span>
          <span className="ml-1.5 text-[11px] text-[#8a8a8a] tabular-nums">{r.userId}</span>
        </span>
      ),
    },
    {
      key: "prize",
      label: "상품",
      render: (r) => (
        <span className="break-keep">
          {r.prizeName || "-"}
          {(r.kind === "xp" || r.kind === "point") && r.amount > 0 && <span className="ml-1.5 text-[11px] text-[#8a8a8a] tabular-nums">{fmt(r.amount)}</span>}
        </span>
      ),
    },
    { key: "kind", label: "종류", className: "w-20", render: (r) => KIND_LABEL[r.kind] || r.kind },
    { key: "code", label: "코드", className: "w-44", render: (r) => (r.code ? <span className="font-mono text-[12px] break-all">{r.code}</span> : <span className="text-[#a3a3a3]">-</span>) },
    {
      key: "state",
      label: "지급",
      className: "w-48",
      render: (r) =>
        r.granted ? (
          <StatusChip tone="ok">완료</StatusChip>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <StatusChip tone="bad">미지급</StatusChip>
            {r.error && <span className="text-[11px] text-[#d01634] break-all">{r.error}</span>}
          </span>
        ),
    },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-28",
      render: (r) =>
        r.granted ? (
          <span className="text-[#a3a3a3]">-</span>
        ) : (
          <Btn variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setRegrantAsk(r); }}>
            다시 지급
          </Btn>
        ),
    },
  ];

  // ── 편집 칸 본문 ─────────────────────────────
  const paneTitle = !pane ? "" : pane.type === "screening" ? (pane.isNew ? "회차 추가" : "회차 편집") : pane.isNew ? "상품 추가" : "상품 편집";
  const sd = pane?.type === "screening" ? pane.d : null;
  const pd = pane?.type === "prize" ? pane.d : null;
  const pdPrize = pd ? cfg.prizes.find((p) => p.key === pd.key) || null : null;
  const pdStock = pdPrize ? stockOfPrize(pdPrize) : null;
  const pdPicked = pd ? itemOf(pd.itemId) : null;
  const pdOne = !!pd?.itemId && !stackableOf(pd.itemId); // 쌓이지 않는 아이템 — 개수 칸을 1 로 잠근다
  const pdCodes = pd ? codeLines(pd.codesText) : [];
  // 편집 중인 비중의 확률(미리 보기) — 지금 나올 수 있는 상품 기준
  const pdWeight = pd ? intText(pd.weight) : NaN;
  const pdChance = pd && pdPrize && Number.isFinite(pdWeight) && pdWeight > 0 ? chanceOf(pdPrize, pdWeight) : "";
  const sdLen = sd ? lenSec({ startsAt: sd.startsAt, endsAt: sd.endsAt }) : 0;
  const sdRatio = sd ? intText(sd.ratioPct) : NaN;

  const delName = !del
    ? ""
    : del.type === "screening"
      ? cfg.screenings.find((s) => s.key === del.key)?.title || "회차"
      : prizeTitle(cfg.prizes.find((p) => p.key === del.key) || { name: "", kind: "none", amount: 0, itemName: "", roleName: "" });

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="괴담회"
        desc={`이벤트 키 ${eventKey || "-"}`}
        tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={tabHref} />}
        footer={
          onConfig ? (
            <SaveBar dirty={isDirty && !loadFailed && !pane} changes={changes} onSave={saveList} onReset={resetToBase} saving={isSaving} note={barNote} />
          ) : undefined
        }
      >
        {(loadFailed || (rolesFailed && !isLoading && onConfig)) && (
          <div className="mb-5 space-y-3">
            {loadFailed && (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={reloadAll}>다시 불러오기</Btn>}>
                현재 설정을 불러오지 못했습니다 (/api/admin/goedam). 저장을 막아 두었습니다.
              </NoteLine>
            )}
            {rolesFailed && !isLoading && onConfig && (
              <NoteLine tone="warn" action={<Btn size="sm" variant="secondary" onClick={fetchRoles}>다시 불러오기</Btn>}>
                역할 목록을 불러오지 못했습니다 (/api/discord-roles).
              </NoteLine>
            )}
          </div>
        )}

        {onConfig && (
          <>
            {/* 기본 설정 + 요약 — 넓은 화면에서 두 열, 좁으면 위아래 */}
            <PanelGrid className="mb-5">
              <Panel title="기본 설정" flush>
                <FieldRow label="사용" changed={changed.enabled}>
                  {/* 📌 켜기 잠금 — 꺼져 있을 때만 스위치를 잠근다(켜져 있으면 끄기는 늘 된다) */}
                  <Inline>
                    <Switch on={cfg.enabled} onChange={(v) => set("enabled", v)} disabled={!cfg.enabled && !!lockMsg} label="괴담회 사용" />
                    <span className={`font-bold ${cfg.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{cfg.enabled ? "운영 중" : "중단 (운영진 미리보기)"}</span>
                    {!cfg.enabled && lockMsg && !isLoading && <span className="min-w-0 font-bold break-keep text-amber-700">{lockMsg}</span>}
                  </Inline>
                </FieldRow>
                <FieldRow label="제목" changed={changed.title}>
                  <input
                    type="text"
                    value={cfg.title}
                    maxLength={MAX_TITLE}
                    onChange={(e) => set("title", e.target.value)}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    placeholder="방구석 심야 괴담회"
                    aria-label="제목"
                    className={inputClass}
                  />
                </FieldRow>
                <FieldRow label="스테이지 채널 ID" hint={cfg.channelId.trim() ? undefined : "비어 있으면 기록하지 않음"} changed={changed.channelId}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cfg.channelId}
                    onChange={(e) => set("channelId", e.target.value.replace(/\D/g, "").slice(0, 20))}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    placeholder="예: 1234567890123456789"
                    aria-label="스테이지 채널 ID"
                    className={`${inputClass} tabular-nums`}
                  />
                </FieldRow>
                <FieldRow label="추첨권 아이템" changed={changed.ticket}>
                  <Dropdown
                    theme="light"
                    value={cfg.ticketItemId}
                    placeholder={regItems.length ? "추첨권 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
                    buttonClassName={DROPDOWN_BTN}
                    onChange={(v) => set("ticketItemId", v)}
                    options={itemOptions}
                  />
                  {!!cfg.ticketItemId && itemStateOf(cfg.ticketItemId) !== "live" && (
                    <p className="mt-1.5">
                      <ItemStateChip state={itemStateOf(cfg.ticketItemId)} />
                      {!ticketItem && <span className="ml-1.5 text-[12px] font-bold text-[#d01634]">{cfg.ticketItemId}</span>}
                    </p>
                  )}
                </FieldRow>
                <FieldRow label="추첨 기간" hint={periodHint} changed={changed.period}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className="block mb-1 text-[12px] text-[#5a5a5a]">시작</span>
                      <input
                        type="datetime-local"
                        value={cfg.drawOpensAt}
                        onChange={(e) => set("drawOpensAt", e.target.value)}
                        onKeyDown={(e) => enterKey(e, saveList)}
                        aria-label="추첨 시작 (KST)"
                        className={`${inputClass} tabular-nums`}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="block mb-1 text-[12px] text-[#5a5a5a]">종료</span>
                      <input
                        type="datetime-local"
                        value={cfg.drawClosesAt}
                        onChange={(e) => set("drawClosesAt", e.target.value)}
                        onKeyDown={(e) => enterKey(e, saveList)}
                        aria-label="추첨 종료 (KST)"
                        className={`${inputClass} tabular-nums`}
                      />
                    </label>
                  </div>
                </FieldRow>
              </Panel>

              {/* 구성 요약 — 옆 칸(xl 반 폭)에서는 네 칸이 좁아 2×2 로 */}
              <StatRow
                className="xl:grid-cols-2"
                items={[
                  { label: "회차", value: fmt(cfg.screenings.length) },
                  { label: "상품", value: fmt(cfg.prizes.length) },
                  { label: "남은 상품", value: leftSum == null ? "무제한" : fmt(leftSum), tone: leftSum === 0 && cfg.prizes.length > 0 ? "bad" : undefined },
                  { label: "상태", value: phase },
                ]}
              />
            </PanelGrid>

            {/* 상영(2026-10-24 「회차」 → 「상영」 — 받는 길 중 하나) — 패널 머리에 추가, 본문은 전체 폭 표 */}
            <Panel
              flush
              className="mb-5"
              title={
                <>
                  상영 <span className="ml-1 text-[#8a8a8a] tabular-nums">{cfg.screenings.length}</span>
                </>
              }
              right={
                <Btn variant="secondary" size="sm" onClick={() => openScreening(null)} disabled={isLoading}>
                  회차 추가
                </Btn>
              }
            >
              {isLoading ? (
                <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
              ) : cfg.screenings.length === 0 ? (
                <div className="p-5">
                  <EmptyRow>등록된 회차가 없습니다.</EmptyRow>
                </div>
              ) : (
                <DataTable
                  className="!rounded-none !border-0"
                  columns={screeningCols}
                  rows={cfg.screenings.map((s, i) => ({ s, i }))}
                  rowKey={(r) => r.s.key}
                  onRowClick={(r) => openScreening(r.s)}
                  selectedKey={sd?.key ?? null}
                />
              )}
            </Panel>

            {/* 음성 활동 · 상점 — 받는 길 나머지 둘(2026-10-24). 넓은 화면 두 열, 좁으면 위아래 */}
            <PanelGrid className="mb-5">
              <Panel title="음성 활동" flush>
                <FieldRow label="사용" changed={changed.voiceEnabled}>
                  <Inline>
                    <Switch on={cfg.voice.enabled} onChange={(v) => setVoice("enabled", v)} disabled={isLoading} label="음성 활동 사용" />
                    <span className={`font-bold ${cfg.voice.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{voiceOnLabel(cfg.voice.enabled)}</span>
                  </Inline>
                </FieldRow>
                <FieldRow label="하루 음성" changed={changed.voiceMinutes}>
                  <Inline>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.voice.minutes}
                      onChange={(e) => setVoice("minutes", e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${VOICE_MINUTES.min}~${VOICE_MINUTES.max}`}
                      aria-label="하루 음성 (분)"
                      className={numClass}
                    />
                    분
                  </Inline>
                </FieldRow>
                <FieldRow label="장 수" changed={changed.voiceTickets}>
                  <Inline>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.voice.tickets}
                      onChange={(e) => setVoice("tickets", e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${VOICE_TICKETS.min}~${VOICE_TICKETS.max}`}
                      aria-label="음성 활동 장 수"
                      className={numClass}
                    />
                    장
                  </Inline>
                </FieldRow>
                <FieldRow label="기간" hint={voicePeriodHint} changed={changed.voicePeriod}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block min-w-0">
                      <span className="block mb-1 text-[12px] text-[#5a5a5a]">시작</span>
                      <input
                        type="datetime-local"
                        value={cfg.voice.startsAt}
                        onChange={(e) => setVoice("startsAt", e.target.value)}
                        onKeyDown={(e) => enterKey(e, saveList)}
                        aria-label="음성 활동 시작 (KST)"
                        className={`${inputClass} tabular-nums`}
                      />
                    </label>
                    <label className="block min-w-0">
                      <span className="block mb-1 text-[12px] text-[#5a5a5a]">종료</span>
                      <input
                        type="datetime-local"
                        value={cfg.voice.endsAt}
                        onChange={(e) => setVoice("endsAt", e.target.value)}
                        onKeyDown={(e) => enterKey(e, saveList)}
                        aria-label="음성 활동 종료 (KST)"
                        className={`${inputClass} tabular-nums`}
                      />
                    </label>
                  </div>
                </FieldRow>
              </Panel>

              {/* 상점 — 판매는 상점 관리 몫(저장된 추첨권 아이템을 파는 판매 중 상품 하나). 여기서는 보기 · 바로가기만 */}
              <Panel title="상점" flush>
                <FieldRow label="판매 상품">
                  <Inline>
                    {isLoading ? (
                      <span className="text-[#8a8a8a]">불러오는 중…</span>
                    ) : shopRow ? (
                      <>
                        <span className="min-w-0 font-bold text-[#131313] break-keep">{shopRow.name || "-"}</span>
                        <Btn
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            sfxTick();
                            router.push(`/admin/shop?tab=products&edit=${encodeURIComponent(shopRow.id)}`);
                          }}
                        >
                          상점 관리에서 열기
                        </Btn>
                      </>
                    ) : (
                      <>
                        <span className="font-bold text-[#5a5a5a]">판매 상품 없음</span>
                        <Btn
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            sfxTick();
                            router.push("/admin/shop?tab=products");
                          }}
                        >
                          상점 관리
                        </Btn>
                      </>
                    )}
                  </Inline>
                </FieldRow>
              </Panel>
            </PanelGrid>

            {/* 상품 */}
            <Panel
              flush
              title={
                <>
                  상품 <span className="ml-1 text-[#8a8a8a] tabular-nums">{cfg.prizes.length}</span>
                </>
              }
              right={
                <Btn variant="secondary" size="sm" onClick={() => openPrize(null)} disabled={isLoading}>
                  상품 추가
                </Btn>
              }
            >
              {!isLoading && cfg.prizes.length > 0 && liveWeightSum === 0 && (
                <NoteLine tone="warn" inset>
                  지금 나올 수 있는 상품이 없습니다.
                </NoteLine>
              )}
              {isLoading ? (
                <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
              ) : cfg.prizes.length === 0 ? (
                <div className="p-5">
                  <EmptyRow>등록된 상품이 없습니다.</EmptyRow>
                </div>
              ) : (
                <DataTable
                  className="!rounded-none !border-0"
                  columns={prizeCols}
                  rows={cfg.prizes}
                  rowKey={(p) => p.key}
                  onRowClick={(p) => openPrize(p)}
                  selectedKey={pd?.key ?? null}
                  onReorder={reorderPrizes}
                  reorderLocked={isSaving}
                />
              )}
            </Panel>

            {/* 연출 미리보기 — 추첨 창을 서버 없이(추첨권 · 기록 그대로) 고른 결과로 */}
            <Panel title="연출 미리보기" flush className="mt-5">
              <FieldRow label="결과">
                <Segmented options={DEMO_RARITY} value={demoRarity} onChange={setDemoRarity} />
              </FieldRow>
              <FieldRow label="종류">
                <Segmented options={DEMO_KIND} value={demoKind} onChange={setDemoKind} disabled={demoRarity === "none"} />
              </FieldRow>
              <FieldRow label="재생">
                <Btn variant="secondary" size="sm" onClick={() => { sfxTick(); setDemoOpen(true); }}>
                  창 열기
                </Btn>
              </FieldRow>
            </Panel>
          </>
        )}

        {tab === "watch" && (
          <>
            <Toolbar
              right={
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={grantId}
                    onChange={(e) => setGrantId(e.target.value.replace(/\D/g, "").slice(0, 20))}
                    onKeyDown={(e) => enterKey(e, () => askGrant(grantId.trim()))}
                    placeholder="디스코드 ID"
                    aria-label="지급할 디스코드 ID"
                    disabled={!watchOk}
                    className={`${inputClass} !w-52 tabular-nums`}
                  />
                  <Btn variant="secondary" onClick={() => askGrant(grantId.trim())} disabled={!watchOk || !grantId.trim()}>
                    지급
                  </Btn>
                  <Btn variant="ghost" onClick={() => setRosterNonce((n) => n + 1)} disabled={!watchOk}>
                    새로고침
                  </Btn>
                </>
              }
            >
              {/* 상영 회차 → 음성 날(「음성 M. D.」 — 기록이 있는 날만) */}
              {savedScreenings.length + voiceDays.length > 0 && (
                <Segmented
                  options={[
                    ...savedScreenings.map((s) => ({ v: s.sid, l: `${kstLabel(s.startsAt).slice(0, 7)} ${s.title}` })),
                    ...voiceDays.map((d) => ({ v: voiceSid(d), l: `음성 ${voiceDayLabel(d)}` })),
                  ]}
                  value={watchSid}
                  onChange={(v) => setWatchPick(v)}
                />
              )}
              <SearchInput value={rosterQ} onChange={setRosterQ} placeholder="이름 · 아이디" />
            </Toolbar>
            {isLoading ? (
              <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
            ) : !watchOk ? (
              <EmptyRow>저장된 회차가 없습니다.</EmptyRow>
            ) : (
              <>
                <StatRow
                  className="mb-5"
                  items={
                    watchScreening
                      ? [
                          { label: "명단", value: fmt(rosterRows.length) },
                          { label: "완청", value: fmt(rosterRows.filter((r) => r.earned).length) },
                          { label: "지급", value: fmt(rosterRows.filter((r) => !!r.grantedAt).length) },
                          { label: "완청 기준", value: durLabel(needSec(watchScreening)), sub: `${rangeLabel(watchScreening.startsAt, watchScreening.endsAt)} · ${Math.round(watchScreening.ratio * 100)}%` },
                        ]
                      : [
                          { label: "명단", value: fmt(rosterRows.length) },
                          { label: "달성", value: fmt(rosterRows.filter((r) => r.earned).length) },
                          { label: "지급", value: fmt(rosterRows.filter((r) => !!r.grantedAt).length) },
                          { label: "달성 기준", value: durLabel((intText(savedVoice.minutes) || VOICE_MINUTES.def) * 60), sub: `음성 ${voiceDayLabel(watchDay)} · ${fmt(watchTickets)}장` },
                        ]
                  }
                />
                {roster?.failed && roster.sid === watchSid && !rosterLoading && (
                  <div className="mb-4">
                    <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={() => setRosterNonce((n) => n + 1)}>다시 불러오기</Btn>}>
                      명단을 불러오지 못했습니다.
                    </NoteLine>
                  </div>
                )}
                {rosterLoading && !rosterRows.length ? (
                  <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
                ) : (
                  <DataTable columns={rosterCols} rows={rosterShown} rowKey={(r) => r.userId} empty={rosterQ.trim() ? "검색 결과가 없습니다." : "기록이 없습니다."} />
                )}
              </>
            )}
          </>
        )}

        {tab === "draws" && (
          <>
            <Toolbar
              right={
                <Btn variant="ghost" onClick={() => setDrawsNonce((n) => n + 1)}>
                  새로고침
                </Btn>
              }
            >
              <Segmented
                options={[
                  { v: "all", l: "전체", n: drawRows.length },
                  { v: "fail", l: "미지급", n: failCount },
                ]}
                value={drawFilter}
                onChange={(v) => setDrawFilter(v === "fail" ? "fail" : "all")}
              />
              <SearchInput value={drawQ} onChange={setDrawQ} placeholder="이름 · 아이디 · 상품 · 코드" />
            </Toolbar>
            {draws?.failed && !drawsLoading && (
              <div className="mb-4">
                <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={() => setDrawsNonce((n) => n + 1)}>다시 불러오기</Btn>}>
                  추첨 기록을 불러오지 못했습니다.
                </NoteLine>
              </div>
            )}
            {drawsLoading && !drawRows.length ? (
              <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
            ) : (
              <DataTable columns={drawCols} rows={drawShown} rowKey={(r) => r.id} empty={drawQ.trim() || drawFilter !== "all" ? "검색 결과가 없습니다." : "기록이 없습니다."} />
            )}
          </>
        )}
      </AdminPage>

      {/* ── 회차 · 상품 편집 — PC 오른쪽 칸 / 모바일 아래 판. [저장] · Enter 가 목록 반영 + 서버 저장을 한 번에 ── */}
      <DetailPane
        open={onConfig && !!pane}
        onClose={closePane}
        title={paneTitle}
        footer={
          pane && (
            <>
              <PaneError msg={paneErr} />
              {!pane.isNew && (
                <Btn variant="ghost" className="mr-auto" onClick={() => askDelete(pane.type, pane.d.key)} disabled={isSaving}>
                  삭제
                </Btn>
              )}
              <Btn variant="ghost" className={pane.isNew ? "ml-auto" : ""} onClick={closePane}>
                취소
              </Btn>
              <Btn onClick={savePane} disabled={isSaving}>
                저장
              </Btn>
            </>
          )
        }
      >
        {sd && (
          <div className="space-y-4">
            {/* 상세 칸은 PC · 모바일 두 벌로 그려져 id 가 겹친다 — label 로 감싸 짝을 짓는다 */}
            <label className="block">
              <span className={labelClass}>
                제목 <Req />
              </span>
              <input
                type="text"
                value={sd.title}
                maxLength={MAX_TITLE}
                onChange={(e) => editDraft({ ...sd, title: e.target.value })}
                onKeyDown={(e) => enterKey(e, savePane)}
                placeholder="예: 파묘"
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className={labelClass}>
                  시작 <Req />
                </span>
                <input
                  type="datetime-local"
                  value={sd.startsAt}
                  onChange={(e) => {
                    // 시작을 옮기면 끝도 같은 길이만큼 따라 옮긴다(길이가 없으면 2시간)
                    const len = kstMs(sd.endsAt) - kstMs(sd.startsAt);
                    editDraft({ ...sd, startsAt: e.target.value, endsAt: shiftKst(e.target.value, len > 0 ? len : 2 * HOUR_MS) || sd.endsAt });
                  }}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  aria-label="시작 (KST)"
                  className={`${inputClass} tabular-nums`}
                />
              </label>
              <label className="block min-w-0">
                <span className={labelClass}>
                  종료 <Req />
                </span>
                <input
                  type="datetime-local"
                  value={sd.endsAt}
                  onChange={(e) => editDraft({ ...sd, endsAt: e.target.value })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  aria-label="종료 (KST)"
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            </div>
            <p className={`${fieldNote} !mt-1.5 tabular-nums`}>{sdLen > 0 ? `KST · ${durLabel(sdLen)}` : " "}</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className={labelClass}>
                  장 수 <Req />
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sd.tickets}
                  onChange={(e) => editDraft({ ...sd, tickets: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  placeholder={`${SCREENING_TICKETS.min}~${SCREENING_TICKETS.max}`}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
              <label className="block min-w-0">
                <span className={labelClass}>
                  완청 % <Req />
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sd.ratioPct}
                  onChange={(e) => editDraft({ ...sd, ratioPct: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  placeholder={`${SCREENING_RATIO.min * 100}~${SCREENING_RATIO.max * 100}`}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            </div>
            <p className={`${fieldNote} !mt-1.5 tabular-nums`}>{sdLen > 0 && Number.isFinite(sdRatio) && sdRatio > 0 ? `완청 ${durLabel(Math.ceil((sdRatio / 100) * sdLen))} 이상` : " "}</p>
          </div>
        )}

        {pd && (
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>이름</span>
              <input
                type="text"
                value={pd.name}
                maxLength={MAX_TITLE}
                onChange={(e) => editDraft({ ...pd, name: e.target.value })}
                onKeyDown={(e) => enterKey(e, savePane)}
                placeholder={prizeTitle({ name: "", kind: pd.kind, amount: parseAmount(pd.amount) || 0, itemName: pdPicked?.name || pd.itemName, count: pdOne ? 1 : Number(pd.count) || 1, roleName: roleNameOf(pd.roleId) || pd.roleName })}
                className={inputClass}
              />
            </label>
            <div>
              <span className={labelClass}>
                종류 <Req />
              </span>
              <Segmented options={KIND_OPTIONS} value={pd.kind} onChange={(v) => editDraft({ ...pd, kind: KINDS.find((k) => k === v) || "none" })} />
            </div>

            {(pd.kind === "xp" || pd.kind === "point") && (
              <label className="block">
                <span className={labelClass}>
                  {pd.kind === "xp" ? "XP" : "빙옥"} <Req />
                </span>
                <input
                  type="text"
                  value={pd.amount}
                  onChange={(e) => editDraft({ ...pd, amount: e.target.value })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  placeholder={pd.kind === "xp" ? "예: 1000 · 1만" : "예: 50"}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            )}

            {pd.kind === "item" && (
              <div>
                <span className={labelClass}>
                  아이템 <Req />
                </span>
                {/* 개수 칸은 폭 고정(줄이 움직이지 않는다). 비우면 1개, 쌓이지 않는 아이템은 1 로 잠근다(2026-10-25 기간 칸을 바꿈 — 운영자 "일자 말고") */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Dropdown
                      theme="light"
                      value={pd.itemId}
                      placeholder={regItems.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
                      buttonClassName={DROPDOWN_BTN}
                      onChange={(v) => {
                        const it = itemOf(v);
                        editDraft({ ...pd, itemId: v, itemName: it?.name || "", count: stackableOf(v) ? pd.count : "" });
                      }}
                      options={itemOptions}
                    />
                  </div>
                  <span className="relative shrink-0 w-[104px]">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pdOne ? "" : pd.count}
                      disabled={pdOne}
                      onChange={(e) => editDraft({ ...pd, count: e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 2) })}
                      onKeyDown={(e) => enterKey(e, savePane)}
                      placeholder="1"
                      aria-label="개수"
                      className={`${inputClass} !pr-8 text-right tabular-nums`}
                    />
                    <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#8a8a8a]">
                      개
                    </span>
                  </span>
                </div>
                {!!pd.itemId && itemStateOf(pd.itemId) !== "live" && (
                  <p className="mt-1.5">
                    <ItemStateChip state={itemStateOf(pd.itemId)} />
                  </p>
                )}
              </div>
            )}

            {pd.kind === "role" && (
              <div>
                <span className={labelClass}>
                  역할 <Req />
                </span>
                <Dropdown
                  theme="light"
                  value={pd.roleId}
                  placeholder="지급할 역할을 선택하세요"
                  buttonClassName={DROPDOWN_BTN}
                  onChange={(v) => editDraft({ ...pd, roleId: v, roleName: grantableRoles.find((r) => r.id === v)?.name || "" })}
                  options={grantableRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
                />
              </div>
            )}

            {pd.kind === "code" && (
              <label className="block">
                <span className={labelClass}>
                  코드 추가 <span className="ml-1 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{pdCodes.length ? `+${fmt(pdCodes.length)}` : ""}</span>
                </span>
                <textarea
                  value={pd.codesText}
                  onChange={(e) => editDraft({ ...pd, codesText: e.target.value })}
                  rows={6}
                  spellCheck={false}
                  placeholder="줄마다 하나"
                  className={`${inputClass} font-mono text-[13px] resize-y`}
                />
                <p className={`${fieldNote} tabular-nums`}>
                  남은 {fmt(pdStock?.left ?? 0)} / 전체 {fmt(pdStock?.total ?? 0)}
                </p>
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block min-w-0">
                <span className={labelClass}>수량</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pd.kind === "code" ? "" : pd.qty}
                  disabled={pd.kind === "code"}
                  onChange={(e) => editDraft({ ...pd, qty: e.target.value.replace(/[^\d,]/g, "").slice(0, 13) })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  placeholder={pd.kind === "code" ? "코드 수" : "무제한"}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
              <label className="block min-w-0">
                <span className={labelClass}>
                  비중 <Req />
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pd.weight}
                  onChange={(e) => editDraft({ ...pd, weight: e.target.value.replace(/[^\d,]/g, "").slice(0, 9) })}
                  onKeyDown={(e) => enterKey(e, savePane)}
                  placeholder={`${PRIZE_WEIGHT.min}~${fmt(PRIZE_WEIGHT.max)}`}
                  className={`${inputClass} tabular-nums`}
                />
              </label>
            </div>
            <p className={`${fieldNote} !mt-1.5 tabular-nums`}>
              {[
                pdStock && pd.kind !== "code" ? `나간 수 ${fmt(pdStock.given)}` : "",
                pdChance && pdChance !== "-" ? `확률 ${pdChance}` : "",
              ]
                .filter(Boolean)
                .join(" · ") || " "}
            </p>
            <div>
              <span className={labelClass}>희귀도</span>
              <Segmented options={RARITY_OPTIONS} value={pd.rarity || "common"} onChange={(v) => editDraft({ ...pd, rarity: v })} />
            </div>
          </div>
        )}
      </DetailPane>

      {/* ── 회차 · 상품 삭제 확인 — 저장된 줄만(새 줄은 확인 없이 닫는다). 확인하면 바로 저장 ── */}
      <ConfirmDialog
        open={del !== null}
        danger
        title={del?.type === "prize" ? "상품 삭제" : "회차 삭제"}
        confirmLabel="삭제"
        busy={isSaving}
        onCancel={() => setDel(null)}
        onConfirm={confirmDelete}
        body={
          <>
            「{delName}」{del?.type === "prize" ? " 상품을" : " 회차를"} 삭제하고 바로 저장합니다.
            <strong className="text-[#131313]"> 이미 지급된 {del?.type === "prize" ? "상품" : "추첨권"}은 회수되지 않습니다.</strong>
          </>
        }
      />

      {/* ── 수동 지급 확인 ── */}
      <ConfirmDialog
        open={grantAsk !== null}
        title="추첨권 지급"
        confirmLabel="지급"
        busy={granting}
        onCancel={() => setGrantAsk(null)}
        onConfirm={doGrant}
        body={
          grantAsk && watchOk ? (
            <>
              <strong className="text-[#131313]">{grantAsk.userName || grantAsk.userId}</strong> · {watchName} · 추첨권 {watchTickets}장
            </>
          ) : null
        }
      />

      {/* ── 미지급 결과 다시 지급 확인 ── */}
      <ConfirmDialog
        open={regrantAsk !== null}
        title="다시 지급"
        confirmLabel="지급"
        busy={regranting}
        onCancel={() => setRegrantAsk(null)}
        onConfirm={doRegrant}
        body={
          regrantAsk ? (
            <>
              <strong className="text-[#131313]">{regrantAsk.userName || regrantAsk.userId}</strong> · {regrantAsk.prizeName || "-"}
            </>
          ) : null
        }
      />

      {toastEl}
      <GoedamModal open={demoOpen} onClose={() => setDemoOpen(false)} pushToast={(m: string) => toast(m)} demo={demo} />
    </>
  );
}
