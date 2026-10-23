"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { RARITIES, rarityOf } from "@/lib/rarity";
import {
  SCREENING_TICKETS,
  SCREENING_RATIO,
  PRIZE_WEIGHT,
  MAX_TITLE,
  MAX_DAYS,
  NUM_MAX,
  MAX_CODE_LEN,
  MAX_CODES_PER_SAVE,
  MAX_SCREENINGS,
  MAX_PRIZES,
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
  EmptyRow,
  Toolbar,
  SearchInput,
  inputClass,
  labelClass,
  fieldNote,
  ConfirmDialog,
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
  days: number;
  roleId: string;
  roleName: string;
  qty: number | null; // null = 무제한
  weight: number;
  rarity: string;
};
// 저장할 한 벌 — 시각은 datetime-local 칸 글자(KST) 그대로 들고 있다가 보낼 때 ISO 로 바꾼다
type Cfg = {
  enabled: boolean;
  title: string;
  channelId: string;
  ticketItemId: string;
  drawOpensAt: string;
  drawClosesAt: string;
  screenings: Screening[];
  prizes: Prize[];
};
// 편집 칸 초안 — 숫자 칸을 비울 수 있어야 해서 글자로 들고 있다가 저장할 때 숫자로 바꾼다
type ScreeningDraft = { key: string; title: string; startsAt: string; endsAt: string; tickets: string; ratioPct: string };
type PrizeDraft = {
  key: string;
  name: string;
  kind: PrizeKind;
  amount: string;
  itemId: string;
  itemName: string;
  days: string;
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
type RegItem = { _id: string; name: string; type?: string; icon?: string; imageUrl?: string; color?: string; _draft?: string };
type RosterRow = { userId: string; userName: string; seconds: number; pct: number; earned: boolean; grantedAt: string | null; granted: number; manual: boolean };
type DrawRow = { id: string; at: string | null; userId: string; userName: string; pid: string; prizeName: string; kind: string; amount: number; code: string; granted: boolean; error: string };
type Tab = "config" | "watch" | "draws";

const TABS: { id: Tab; short: string }[] = [
  { id: "config", short: "구성" },
  { id: "watch", short: "명단" },
  { id: "draws", short: "추첨 기록" },
];
const tabOf = (v: string | null): Tab => (v === "watch" || v === "draws" ? v : "config");
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
const EMPTY_CFG: Cfg = { enabled: false, title: "", channelId: "", ticketItemId: "", drawOpensAt: "", drawClosesAt: "", screenings: [], prizes: [] };

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
    days: Math.min(MAX_DAYS, toInt(r.days)),
    roleId: String(r.roleId || ""),
    roleName: String(r.roleName || ""),
    qty: r.qty == null ? null : Math.max(0, Math.floor(Number(r.qty)) || 0),
    weight: toInt(r.weight) || PRIZE_WEIGHT.def,
    rarity: String(r.rarity || ""),
  };
};
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
const prizeTitle = (p: Pick<Prize, "name" | "kind" | "amount" | "itemName" | "roleName">) => {
  if (p.name.trim()) return p.name.trim();
  if (p.kind === "xp") return `XP ${fmt(p.amount)}`;
  if (p.kind === "point") return `빙옥 ${fmt(p.amount)}`;
  if (p.kind === "item") return p.itemName || "아이템";
  if (p.kind === "role") return p.roleName || "역할";
  if (p.kind === "code") return "코드";
  return "꽝";
};
// 상품 내용 한 줄 — 종류마다 양 · 아이템(기간) · 역할
const prizeDetail = (p: Prize, roleNameOf: (id: string) => string, itemOf: (id: string) => RegItem | null) => {
  if (p.kind === "xp") return `${fmt(p.amount)} XP`;
  if (p.kind === "point") return `${fmt(p.amount)} 빙옥`;
  if (p.kind === "item") return `${itemOf(p.itemId)?.name || p.itemName || "미지정"}${p.days > 0 ? ` · ${fmt(p.days)}일` : ""}`;
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
    prizes: c.prizes.map((p) => [p.pid, p.name.trim(), p.kind, p.amount, p.itemId, p.days, p.roleId, p.qty, p.weight, p.rarity || "common"]),
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
  if (p.kind === "item" && p.days > MAX_DAYS) return `기간은 ${fmt(MAX_DAYS)}일 이하로 입력해 주십시오.`;
  if (p.kind === "role" && !p.roleId) return "역할을 선택해 주십시오.";
  if (p.qty != null && !(Number.isInteger(p.qty) && p.qty >= 0 && p.qty <= NUM_MAX)) return "수량은 0 이상의 정수로 입력해 주십시오.";
  if (!(Number.isInteger(p.weight) && p.weight >= PRIZE_WEIGHT.min && p.weight <= PRIZE_WEIGHT.max)) return `비중은 ${PRIZE_WEIGHT.min}~${fmt(PRIZE_WEIGHT.max)} 사이의 정수로 입력해 주십시오.`;
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

export default function AdminGoedamPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/goedam 이 서버에서 한다(requireAdmin)
  const { isAdmin, gate } = useAdminGuard();
  const { toast, toastEl } = useToast();
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
  const [eventKey, setEventKey] = useState("");
  // 📌 기본 꺼짐 — 불러오기에 실패했을 때 실수로 켜진 채 저장되는 일을 막는다(모델 기본값과 같음)
  const [cfg, setCfg] = useState<Cfg>(EMPTY_CFG);
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
      prizes: rawList(p.prizes).map(normPrize),
    };
    setEventKey(String(p.key || ""));
    setCfg(next);
    setBase(next);
    setItemStates(statesFrom(d.itemStates));
    setStock(stockFrom(d.stock));
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
  // 📌 지금 나올 수 있는 상품 — 서버 고르기(lib/goedam.js readyOf + 남은 수)와 같은 판정. 확률 = 비중 / 나올 수 있는 상품 비중 합
  const drawable = (p: Prize) => {
    const ready =
      p.kind === "item" ? !!p.itemId && itemStateOf(p.itemId) === "live" : p.kind === "role" ? !!p.roleId : p.kind === "xp" || p.kind === "point" ? p.amount > 0 : true;
    const s = stockOfPrize(p);
    return ready && (s.left == null || s.left > 0);
  };
  const weightSum = cfg.prizes.reduce((sum, p) => sum + (drawable(p) ? p.weight : 0), 0);
  // weight — 편집 칸에서 고치는 중인 비중(미리 보기). 합은 그 상품 몫만 바꿔 다시 센다
  const chanceOf = (p: Prize, weight = p.weight) => {
    if (!drawable(p)) return "-";
    const sum = weightSum - p.weight + weight;
    return sum > 0 ? `${(Math.round((weight / sum) * 10000) / 100).toLocaleString("ko-KR")}%` : "-";
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
        prizes: c.prizes.map((p) => ({
          pid: p.pid,
          name: p.name.trim(),
          kind: p.kind,
          amount: p.amount,
          itemId: p.itemId,
          itemName: p.kind === "item" ? itemOf(p.itemId)?.name || p.itemName : "",
          days: p.days,
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
          days: p.days > 0 ? String(p.days) : "",
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
      d: { key: `new:${++newKeyRef.current}`, name: "", kind: "xp", amount: "", itemId: "", itemName: "", days: "", roleId: "", roleName: "", qty: "", weight: String(PRIZE_WEIGHT.def), rarity: "common", codesText: "" },
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
    // 빈칸 = 무기한(0). 실물은 기간이 없다(칸도 잠겨 있다)
    days: d.kind === "item" && itemOf(d.itemId)?.type !== "physical" && d.days.trim() ? intText(d.days) : 0,
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
  // 기본 회차 — 진행 중인 회차, 없으면 가장 최근에 끝난 회차, 그것도 없으면 첫 회차(저장된 회차만 — 명단은 sid 로 읽는다)
  const savedScreenings = useMemo(() => base?.screenings ?? [], [base]);
  const defaultSid = useMemo(() => {
    if (!savedScreenings.length) return "";
    const now = loadedAt;
    const live = savedScreenings.find((s) => kstMs(s.startsAt) <= now && now < kstMs(s.endsAt));
    if (live) return live.sid;
    const past = savedScreenings.filter((s) => kstMs(s.endsAt) <= now);
    return (past[past.length - 1] || savedScreenings[0]).sid;
  }, [savedScreenings, loadedAt]);
  const watchSid = savedScreenings.some((s) => s.sid === watchPick) ? watchPick : defaultSid;
  const watchScreening = savedScreenings.find((s) => s.sid === watchSid) || null;
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
    if (!watchScreening) return;
    if (!SNOWFLAKE.test(userId)) return toast("디스코드 ID가 올바르지 않습니다.", true);
    const row = rosterRows.find((r) => r.userId === userId);
    if (row?.grantedAt) return toast("이미 지급되었습니다.", true);
    setGrantAsk({ userId, userName: userName || row?.userName || "" });
  };
  const doGrant = async () => {
    if (!grantAsk || !watchScreening || granting) return;
    setGranting(true);
    const res = await fetch("/api/admin/goedam/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sid: watchScreening.sid, userId: grantAsk.userId }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setGranting(false);
    setGrantAsk(null);
    if (res?.ok && d?.success === true) {
      const row = rosterFrom([d.data?.row])[0];
      setRoster((cur) =>
        cur && cur.sid === watchScreening.sid
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

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다
  if (gate) return gate;

  // ── 변경 목록(저장 줄) ───────────────────────
  // 📌 불러온 한 벌과 지금 값을 맞대어 한 줄씩. 회차 · 상품은 sid · pid 로 짝을 지어 추가 · 삭제 · 수정을 가린다(보여 주기 전용)
  const changes: string[] = [];
  const changed = {
    enabled: !!base && base.enabled !== cfg.enabled,
    title: !!base && base.title.trim() !== cfg.title.trim(),
    channelId: !!base && base.channelId.trim() !== cfg.channelId.trim(),
    ticket: !!base && base.ticketItemId !== cfg.ticketItemId,
    period: !!base && (base.drawOpensAt !== cfg.drawOpensAt || base.drawClosesAt !== cfg.drawClosesAt),
  };
  if (base && isDirty) {
    if (changed.enabled) changes.push(`상태 ${onOffLabel(base.enabled)} → ${onOffLabel(cfg.enabled)}`);
    if (changed.title) changes.push(`제목 ${base.title.trim() || "없음"} → ${cfg.title.trim() || "없음"}`);
    if (changed.channelId) changes.push(`채널 ${base.channelId.trim() || "없음"} → ${cfg.channelId.trim() || "없음"}`);
    if (changed.ticket) changes.push(`추첨권 ${itemOf(base.ticketItemId)?.name || "없음"} → ${itemOf(cfg.ticketItemId)?.name || "없음"}`);
    if (base.drawOpensAt !== cfg.drawOpensAt) changes.push(`추첨 시작 ${kstLabel(base.drawOpensAt)} → ${kstLabel(cfg.drawOpensAt)}`);
    if (base.drawClosesAt !== cfg.drawClosesAt) changes.push(`추첨 종료 ${kstLabel(base.drawClosesAt)} → ${kstLabel(cfg.drawClosesAt)}`);
  }

  // 단계 — 불러온 시각 기준(렌더 중 시계를 읽지 않는다)
  const openMs = kstMs(cfg.drawOpensAt);
  const closeMs = kstMs(cfg.drawClosesAt);
  const periodOk = Number.isFinite(openMs) && Number.isFinite(closeMs) && closeMs > openMs;
  const phase = !cfg.enabled ? "중단" : !periodOk || !loadedAt ? "-" : loadedAt < openMs ? "추첨 전" : loadedAt < closeMs ? "추첨 중" : "종료";
  const periodHint = !periodOk ? (
    <span className="font-bold text-[#d01634]">{Number.isFinite(openMs) && Number.isFinite(closeMs) ? "종료 시각은 시작 시각 이후로 지정해 주십시오." : "기간을 입력해 주십시오."}</span>
  ) : (
    `KST · 종료 시각 미포함 · ${Math.round((closeMs - openMs) / DAY_MS * 10) / 10}일`
  );
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
      render: (p) => (
        <span className="font-bold break-keep">
          {prizeTitle(p)}
          {p.kind === "item" && !!p.itemId && <ItemStateChip state={itemStateOf(p.itemId)} />}
        </span>
      ),
    },
    { key: "kind", label: "종류", className: "w-20", render: (p) => KIND_LABEL[p.kind] },
    { key: "detail", label: "내용", render: (p) => <span className="break-keep">{prizeDetail(p, roleNameOf, itemOf)}</span> },
    {
      key: "left",
      label: "남은 수",
      align: "right",
      className: "w-32",
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
    { key: "weight", label: "비중", align: "right", className: "w-24", render: (p) => <span className="tabular-nums">{fmt(p.weight)}</span> },
    { key: "chance", label: "확률", align: "right", className: "w-24", render: (p) => <span className="tabular-nums font-bold">{chanceOf(p)}</span> },
    { key: "rarity", label: "희귀도", className: "w-24", render: (p) => <RarityMark v={p.rarity} /> },
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
    { key: "time", label: "머문 시간", align: "right", className: "w-32", sortValue: (r) => r.seconds, render: (r) => <span className="tabular-nums">{durLabel(r.seconds)}</span> },
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
          <StatusChip tone="info">완청 · 대기</StatusChip>
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
  const pdNoDays = pdPicked?.type === "physical";
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

            {/* 회차 — 패널 머리에 추가, 본문은 전체 폭 표 */}
            <Panel
              flush
              className="mb-5"
              title={
                <>
                  회차 <span className="ml-1 text-[#8a8a8a] tabular-nums">{cfg.screenings.length}</span>
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
              {!isLoading && cfg.prizes.length > 0 && weightSum === 0 && (
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
                />
              )}
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
                    disabled={!watchScreening}
                    className={`${inputClass} !w-52 tabular-nums`}
                  />
                  <Btn variant="secondary" onClick={() => askGrant(grantId.trim())} disabled={!watchScreening || !grantId.trim()}>
                    지급
                  </Btn>
                  <Btn variant="ghost" onClick={() => setRosterNonce((n) => n + 1)} disabled={!watchScreening}>
                    새로고침
                  </Btn>
                </>
              }
            >
              {savedScreenings.length > 0 && (
                <Segmented
                  options={savedScreenings.map((s) => ({ v: s.sid, l: `${kstLabel(s.startsAt).slice(0, 7)} ${s.title}` }))}
                  value={watchSid}
                  onChange={(v) => setWatchPick(v)}
                />
              )}
              <SearchInput value={rosterQ} onChange={setRosterQ} placeholder="이름 · 아이디" />
            </Toolbar>
            {isLoading ? (
              <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
            ) : !watchScreening ? (
              <EmptyRow>저장된 회차가 없습니다.</EmptyRow>
            ) : (
              <>
                <StatRow
                  className="mb-5"
                  items={[
                    { label: "명단", value: fmt(rosterRows.length) },
                    { label: "완청", value: fmt(rosterRows.filter((r) => r.earned).length) },
                    { label: "지급", value: fmt(rosterRows.filter((r) => !!r.grantedAt).length) },
                    { label: "완청 기준", value: durLabel(needSec(watchScreening)), sub: `${rangeLabel(watchScreening.startsAt, watchScreening.endsAt)} · ${Math.round(watchScreening.ratio * 100)}%` },
                  ]}
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
                placeholder={prizeTitle({ name: "", kind: pd.kind, amount: parseAmount(pd.amount) || 0, itemName: pdPicked?.name || pd.itemName, roleName: roleNameOf(pd.roleId) || pd.roleName })}
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
                {/* 기간 칸은 폭 고정(줄이 움직이지 않는다). 비우면 무기한, 실물은 기간이 없어 잠근다 */}
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Dropdown
                      theme="light"
                      value={pd.itemId}
                      placeholder={regItems.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
                      buttonClassName={DROPDOWN_BTN}
                      onChange={(v) => {
                        const it = itemOf(v);
                        editDraft({ ...pd, itemId: v, itemName: it?.name || "", days: it?.type === "physical" ? "" : pd.days });
                      }}
                      options={itemOptions}
                    />
                  </div>
                  <span className="relative shrink-0 w-[104px]">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={pdNoDays ? "" : pd.days}
                      disabled={pdNoDays}
                      onChange={(e) => editDraft({ ...pd, days: e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4) })}
                      onKeyDown={(e) => enterKey(e, savePane)}
                      placeholder="무기한"
                      aria-label="기간(일)"
                      className={`${inputClass} !pr-8 text-right tabular-nums`}
                    />
                    <span aria-hidden className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#8a8a8a] ${pd.days && !pdNoDays ? "" : "invisible"}`}>
                      일
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
          grantAsk && watchScreening ? (
            <>
              <strong className="text-[#131313]">{grantAsk.userName || grantAsk.userId}</strong> · 「{watchScreening.title}」 회차 · 추첨권 {watchScreening.tickets}장
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
    </>
  );
}
