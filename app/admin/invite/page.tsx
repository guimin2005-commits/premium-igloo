"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
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
  StatusChip,
  useAdminGuard,
  useToast,
  sfxErr,
  sfxTick,
  type Column,
} from "../ui";

// 📌 친구 초대 관리 화면 — 상시 이벤트(2026-10-25 · 승인 시안 .claude/mockups/invite). 저장은 app/api/admin/invite, 계산 · 지급은 lib/invite.js.
//    틀은 이벤트 패스 · 괴담회 화면(app/admin/event-pass · app/admin/goedam)과 같다 — 탭 둘:
//      · 구성     — 요약, 기본 설정 · 추첨권 보너스 두 열, 누적 보상 단계 표, 바뀐 것이 있을 때만 뜨는 저장 줄(SaveBar). 줄을 누르면 오른쪽 편집 칸(폰은 아래 판)
//      · 초대 기록 — 50건씩 쪽 넘김 · 검색(이름 · ID · 코드). 줄을 누르면 상세 칸, 추첨권 미지급은 「다시 지급」(app/api/admin/invite/regrant — 보너스 기간이 지나도 운영자가 준다)
//        넣을 때 보너스가 돌지 않아 건너뛴 줄(ticketsSkipped)은 「해당 없음」 — 미지급이 아니라 「다시 지급」을 띄우지 않는다(마감된 추첨에 추첨권이 새로 들어가지 않게)
//    · 📌 2026-10-25 운영자 결정 — 끝이 없는 상시 이벤트라 기간 대신 「시작 시각」 하나. 누적 보상은 계속, 괴담회 추첨권 보너스만 기간 한정
//      (보너스 종료 시각 · 괴담회 추첨 종료 중 이른 때까지 — 판정은 서버)
//    · 누적 보상 — 필요 인원은 누적 그대로 편집한다(1명 · 3명 · 5명 · 10명 — 이벤트 패스의 「이 단계에 필요한 양」과 다르다). 같은 인원 두 단계는 막는다(서버도 같은 검사)
//      단계 차례 = 필요 인원 오름차순(서버 normalizeTiers 와 같다 — 저장 뒤 표가 뒤섞이지 않게 화면도 늘 그 차례로 들고 있다)
//    · 저장 — 편집 칸 [저장] · Enter · 삭제 확인 · 저장 줄이 전부 한 PUT(설정 전체)으로 간다. tid 는 서버가 발급하고 화면은 되돌려 보내기만 한다
//    · 시각은 KST 로 받고 보낸다(브라우저 시간대와 상관없이) — 보너스 종료 시각은 들어가지 않는다
//    · 아이템 보상 — 반영 전(초안에만 있는) 아이템도 고르고 저장한다(「반영 전」 칩). 보상 아이템이 하나라도 실사이트에 없으면 「사용」을 켤 수 없다(이벤트 패스와 같은 규칙 · 같은 문구)
//    입력칸 · 표 · 상세 칸 · 확인 창 · 토스트 · 권한 화면은 전부 ../ui 의 공용 부품이다.
//    보상 편집 부품(RewardEditor · RewardFields · ItemStateChip · parseAmount)은 이벤트 패스 화면에서 옮겨 왔다(그 파일은 내보내지 않는다 — 고치면 같이)

type Tab = "config" | "log";
const TABS: { id: Tab; short: string }[] = [
  { id: "config", short: "구성" },
  { id: "log", short: "초대 기록" },
];
const tabOf = (v: string | null): Tab => (v === "log" ? "log" : "config");
const tabHref = (id: string) => (id === "config" ? "/admin/invite" : `/admin/invite?tab=${id}`);

type RewardKind = "xp" | "point" | "role" | "item";
// 📌 days — 아이템 보상의 기간(일). 0 = 무기한, 아이템이 아닌 보상은 늘 0 (lib/seasonPass.js normalizeReward 와 같은 모양)
type Reward = { kind: RewardKind; amount: number; roleId: string; roleName: string; itemId: string; itemName: string; days: number };
// 📌 tid — 서버가 발급하는 단계 고유 식별자("t3"). 수령 기록(InviteClaim.ref)이 이 값으로 남으므로 편집 · 삭제 어느 경로에서도 잃으면 안 된다.
//    새 단계만 빈 문자열로 보내 서버가 발급하게 한다. key 는 React 목록 · 편집 칸 전용 로컬 키(저장된 단계 "t:<tid>" · 새 단계 "new:N" — 서버로 보내지 않는다)
type Tier = { key: string; tid: string; need: number; free: Reward[] };
// 편집 칸에서는 숫자 칸을 비울 수 있어야 해서 글자로 들고 있다가 저장할 때 숫자로 바꾼다
type DraftReward = { key: string; kind: RewardKind; amount: string; roleId: string; roleName: string; itemId: string; itemName: string; days: string };
type TierDraft = { key: string; isNew: boolean; need: string; free: DraftReward[] };
// 추첨권 보너스 — 장 수 칸은 비울 수 있게 글자로(시각은 KST 칸 글자)
type BonusCfg = { enabled: boolean; endsAt: string; inviter: string; invitee: string };
// 저장할 한 벌 — 시각은 datetime-local 칸 글자(KST), 일수 · 장 수는 칸 글자 그대로 들고 있다가 보낼 때 바꾼다
type Cfg = { enabled: boolean; startsAt: string; joinDays: string; accountDays: string; bonus: BonusCfg; tiers: Tier[] };
type Stats = { uses: number; codes: number; ticketsPending: number };
// 저장을 누른 자리 — pane: 편집 칸(성공하면 닫고, 실패는 칸 안에 띄운다) / list: 표 · 설정 칸 · 저장 줄(토스트)
type SaveFrom = "pane" | "list";
type TierRow = { t: Tier; i: number };
// 받아 오는 목록 — 디스코드 역할(/api/discord-roles) · 등록 아이템(/api/admin/items)
//    📌 _draft — 초안 모드(localhost)의 목록 표시: "new" = 초안에만 있는 새 아이템(반영 전) · "edit" = 실사이트에 있고 고친 초안이 있음(지급은 실사이트 값)
type GuildRole = { id: string; name: string; color?: string; managed?: boolean };
type RegItem = { _id: string; name: string; type?: string; icon?: string; imageUrl?: string; color?: string; _draft?: string };
// 📌 아이템 보상 상태 — lib/eventPass.js eventItemStates 와 같은 낱말. live: 실사이트에 있음 · draft: 반영 전(초안에만) · missing: 어디에도 없음
type ItemState = "live" | "draft" | "missing";
const ITEM_STATES: ItemState[] = ["live", "draft", "missing"];
// 초대 기록 한 줄(GET /api/admin/invite/uses rows) — 들어온 친구 한 명당 한 줄(InviteUse.inviteeId 고유)
type UseRow = {
  inviteeId: string;
  inviteeName: string;
  inviterId: string;
  inviterName: string;
  code: string;
  at: string | null;
  joinedAt: string | null;
  ticketsGrantedAt: string | null;
  // 📌 넣을 때 보너스가 돌지 않아 건너뛴 줄 — "off"(보너스 기간 밖) · "zero"(장 수 0). 빈 글자 = 건너뛰지 않음. 건너뛴 줄은 미지급이 아니다(「다시 지급」 없음)
  ticketsSkipped: string;
  inviterTickets: number;
  inviteeTickets: number;
};

// 서버가 준 값(정리 전) — 칸 이름만 믿고 값은 정리 함수가 다시 맞춘다
type Raw = Record<string, unknown>;
const rawOf = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const rawList = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(rawOf) : []);

// 단계마다 보상 수 상한 — lib/seasonPass.js MAX_REWARDS 와 같아야 한다(서버가 넘치는 것을 잘라 버린다)
const MAX_REWARDS = 4;
// 단계 수 상한 — lib/seasonPass.js MAX_TIERS
const MAX_TIERS = 100;
// 보상 수량 상한 — lib/seasonPass.js num 의 max(넘는 값은 조용히 깎이지 않게 화면에서 막는다)
const MAX_NUM = 1_000_000_000;
// 📌 필요 인원(누적 초대 수) 상한 — lib/invite.js INVITE_NEED_MAX 와 같다(바꾸면 같이 — 넘으면 저장 API 가 돌려보낸다). 입력 칸도 이 자릿수까지만
const NEED_MAX = 100_000;
// 아이템 보상 기간 상한(일) — lib/seasonPass.js MAX_REWARD_DAYS
const MAX_DAYS = 3650;
// 📌 숫자 칸 범위 · 기본값 — app/api/admin/invite PUT 검사 · lib/invite.js 기본값과 같다(바꾸면 같이)
//    입력 기한 · 계정 최소 나이 0~60일(기본 7 · 7) · 추첨권 장 수 0~10장(기본 초대한 사람 2 · 들어온 친구 1)
const DAYS = { min: 0, max: 60, def: 7 };
const TICKETS = { min: 0, max: 10 };
const BONUS_DEF = { inviter: 2, invitee: 1 };
// 초대 기록 한 쪽 — 서버(GET /api/admin/invite/uses)와 같은 50건
const PAGE_SIZE = 50;
const KST_MS = 9 * 60 * 60 * 1000;

const KIND_OPTIONS: { v: RewardKind; l: string }[] = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "role", l: "역할" },
  { v: "item", l: "아이템" },
];

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주십시오.";
// 📌 lib/eventPass.js draftItemsMessage · missingItemsMessage 와 같은 글자 — 바꾸면 같이(서버가 같은 문구로 돌려보낸다)
const draftItemsMessage = (names: string[]) =>
  `반영 전 아이템 ${names.length}개(${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` 외 ${names.length - 3}개` : ""}) — 상점 관리에서 실사이트 반영 후 켤 수 있습니다.`;
const missingItemsMessage = (n: number) => `찾을 수 없는 보상 아이템 ${n}개 — 다시 고르거나 지워 주십시오.`;

const toInt = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
// 정수 칸 글자 — "1,000" 도 받는다. 못 읽으면 NaN
const intText = (s: string) => {
  const t = String(s ?? "").replace(/[\s,]/g, "");
  return /^\d+$/.test(t) ? Number(t) : NaN;
};
const inRange = (s: string, r: { min: number; max: number }) => {
  const n = intText(s);
  return Number.isInteger(n) && n >= r.min && n <= r.max;
};
// 서버 숫자 → 칸 글자(범위 안으로). 값이 없으면 기본값 — 0 은 그대로 0(일수 · 장 수는 0 이 올바른 값이다)
const intField = (v: unknown, r: { min: number; max: number }, def: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return String(Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, Math.floor(n))) : def);
};
const fmt = (n: number) => n.toLocaleString("ko-KR");

// ── 숫자 읽기 ─────────────────────────────────
// 📌 이벤트 패스 · 시즌 패스 화면과 같은 규칙 — "5만" · "1.5만" · "5천만" · "50k" · "50,000" · "5만xp" 를 다 받는다. 못 읽으면 NaN(호출부가 그 자리에서 알린다)
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
const needError = (n: number) =>
  !Number.isInteger(n) ? "필요 인원을 숫자로 입력해 주십시오." : n < 1 ? "필요 인원은 1명 이상이어야 합니다." : n > NEED_MAX ? `필요 인원은 ${fmt(NEED_MAX)}명 이하여야 합니다.` : "";

// ── 시각(KST) ─────────────────────────────────
// ISO → datetime-local 칸 글자(KST · 분까지) — 브라우저 시간대가 달라도 KST 로 보인다
const toKstInput = (v: unknown) => {
  const t = v ? new Date(String(v)).getTime() : NaN;
  return Number.isFinite(t) ? new Date(t + KST_MS).toISOString().slice(0, 16) : "";
};
// 칸 글자(KST) → ISO. 못 읽으면 "" (초까지 든 글자도 받는다)
const fromKstInput = (v: string) => {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::\d{2})?$/.exec(String(v || "").trim());
  if (!m) return "";
  const t = Date.parse(`${m[1]}:00+09:00`);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
};
const kstMs = (v: string) => Date.parse(fromKstInput(v));
// 변경 목록 · 표 표시 — "10. 26. 00:00"
const kstLabel = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${v.slice(5, 7)}. ${v.slice(8, 10)}. ${v.slice(11, 16)}` : "없음");
const isoLabel = (v: string | null) => (v ? kstLabel(toKstInput(v)) : "-");

// ── Enter 로 저장 ──────────────────────────────
// 📌 한글 조합 중 Enter(isComposing · keyCode 229)는 조합을 끝내는 키다 — 저장으로 받지 않는다. 눌러 둔 채 반복되는 Enter 도 넘긴다
const imeBusy = (e: ReactKeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
const enterKey = (e: ReactKeyboardEvent<HTMLInputElement>, fn: () => void) => {
  if (e.key !== "Enter" || imeBusy(e)) return;
  e.preventDefault();
  if (!e.repeat) fn();
};

// ── 서버 값 정리 ───────────────────────────────
const REWARD_KINDS: RewardKind[] = ["xp", "point", "role", "item"];
const normReward = (r: Raw): Reward | null => {
  const kind = REWARD_KINDS.find((k) => k === r.kind);
  if (!kind) return null;
  return {
    kind,
    amount: toInt(r.amount),
    roleId: String(r.roleId || ""),
    roleName: String(r.roleName || ""),
    itemId: String(r.itemId || ""),
    itemName: String(r.itemName || ""),
    days: kind === "item" ? Math.min(MAX_DAYS, toInt(r.days)) : 0,
  };
};
const normRewards = (v: unknown): Reward[] => rawList(v).map(normReward).filter((r): r is Reward => !!r).slice(0, MAX_REWARDS);
// 단계는 필요 인원 오름차순(같으면 원래 차례) — 서버 normalizeTiers 와 같은 차례
const sortTiers = (list: Tier[]) => [...list].sort((a, b) => a.need - b.need);
// 서버 itemStates({ id: 상태 }) 정리 — 모르는 값은 버린다
const statesFrom = (v: unknown): Record<string, ItemState> => {
  const out: Record<string, ItemState> = {};
  for (const [id, s] of Object.entries(rawOf(v))) {
    const st = ITEM_STATES.find((x) => x === s);
    if (st) out[id] = st;
  }
  return out;
};
const countOf = (v: unknown) => Math.max(0, Math.floor(Number(v)) || 0);
const statsFrom = (v: unknown): Stats => {
  const o = rawOf(v);
  return { uses: countOf(o.uses), codes: countOf(o.codes), ticketsPending: countOf(o.ticketsPending) };
};
const usesFrom = (v: unknown): UseRow[] =>
  rawList(v).map((r) => ({
    inviteeId: String(r.inviteeId || ""),
    inviteeName: String(r.inviteeName || ""),
    inviterId: String(r.inviterId || ""),
    inviterName: String(r.inviterName || ""),
    code: String(r.code || ""),
    at: r.at ? String(r.at) : null,
    joinedAt: r.joinedAt ? String(r.joinedAt) : null,
    ticketsGrantedAt: r.ticketsGrantedAt ? String(r.ticketsGrantedAt) : null,
    ticketsSkipped: r.ticketsSkipped ? String(r.ticketsSkipped) : "",
    inviterTickets: countOf(r.inviterTickets),
    inviteeTickets: countOf(r.inviteeTickets),
  }));
// 추첨권 칸 — 지급 · 해당 없음(건너뜀) · 미지급(지급 실패 — 「다시 지급」 대상은 이것만)
const ticketStateOf = (r: UseRow) => (r.ticketsGrantedAt ? "paid" : r.ticketsSkipped ? "skip" : "pending");
const skipLabel = (s: string) => (s === "zero" ? "장 수 0" : "보너스 기간 밖");

// ── 보상 표시 ─────────────────────────────────
// 한 줄 요약 — 서버 lib/seasonPass.js rewardLabel 과 같은 모양
const rewardLabel = (r: Reward, roleNameOf: (id: string) => string, itemOf: (id: string) => RegItem | null) => {
  if (r.kind === "xp") return `XP ${r.amount.toLocaleString()}`;
  if (r.kind === "point") return `빙옥 ${r.amount.toLocaleString()}`;
  if (r.kind === "role") return `역할 · ${roleNameOf(r.roleId) || r.roleName || "미지정"}`;
  if (r.kind === "item") {
    const it = itemOf(r.itemId);
    return `아이템 · ${it?.name || r.itemName || "미지정"}${r.days > 0 ? ` · ${r.days.toLocaleString()}일` : ""}`;
  }
  return "-";
};

// ── 지문 · 검사 ─────────────────────────────────
// 📌 저장 여부를 가를 지문 — 서버로 나가는 값만 담는다(로컬 key · 이름 스냅샷 빼고 — 서버가 실사이트 이름(없으면 초안 이름)으로 다시 채운다)
const rewardSig = (r: Reward) => ({ kind: r.kind, amount: r.amount, roleId: r.roleId, itemId: r.itemId, days: r.days });
const sig = (c: Cfg) =>
  JSON.stringify({
    enabled: c.enabled,
    startsAt: c.startsAt,
    joinDays: intText(c.joinDays),
    accountDays: intText(c.accountDays),
    bonus: [c.bonus.enabled, c.bonus.endsAt, intText(c.bonus.inviter), intText(c.bonus.invitee)],
    tiers: c.tiers.map((t) => ({ tid: t.tid, need: t.need, free: t.free.map(rewardSig) })),
  });

// 저장 전 검사 — 서버(app/api/admin/invite PUT)가 돌려보낼 값을 먼저 막는다. 괜찮으면 빈 문자열
const checkCfg = (c: Cfg) => {
  if (!fromKstInput(c.startsAt)) return "시작 시각을 입력해 주십시오.";
  if (!inRange(c.joinDays, DAYS)) return `입력 기한은 ${DAYS.min}~${DAYS.max}일 사이로 입력해 주십시오.`;
  if (!inRange(c.accountDays, DAYS)) return `계정 최소 나이는 ${DAYS.min}~${DAYS.max}일 사이로 입력해 주십시오.`;
  if (!fromKstInput(c.bonus.endsAt)) return "보너스 종료 시각을 입력해 주십시오.";
  if (!inRange(c.bonus.inviter, TICKETS)) return `초대한 사람 장 수는 ${TICKETS.min}~${TICKETS.max} 사이로 입력해 주십시오.`;
  if (!inRange(c.bonus.invitee, TICKETS)) return `들어온 친구 장 수는 ${TICKETS.min}~${TICKETS.max} 사이로 입력해 주십시오.`;
  if (c.tiers.length > MAX_TIERS) return `단계는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`;
  const all = c.tiers.flatMap((t) => t.free);
  if (all.some((r) => r.kind === "role" && !r.roleId)) return "역할이 지정되지 않은 보상이 있습니다.";
  if (all.some((r) => r.kind === "item" && !r.itemId)) return "아이템이 지정되지 않은 보상이 있습니다.";
  const seen = new Set<number>();
  for (const t of c.tiers) {
    const err = needError(t.need);
    if (err) return err;
    if (seen.has(t.need)) return `${fmt(t.need)}명 단계가 둘 이상입니다. 필요 인원을 고쳐 주십시오.`;
    seen.add(t.need);
  }
  return "";
};

// 새 단계 기본 인원 — 마지막 단계에 앞 간격만큼(간격이 없으면 +1). 단계가 없으면 1명
const nextNeed = (list: Tier[]) => {
  const last = list[list.length - 1];
  if (!last) return 1;
  const prev = list[list.length - 2];
  const gap = prev ? last.need - prev.need : 0;
  return last.need + (gap > 0 ? gap : 1);
};

const onOffLabel = (v: boolean) => (v ? "운영 중" : "중단");
const bonusOnLabel = (v: boolean) => (v ? "사용" : "중단");
const numLabel = (s: string, unit: string) => (Number.isFinite(intText(s)) ? `${fmt(intText(s))}${unit}` : "없음");
// 📌 입력 기한 · 계정 최소 나이 — 0 은 조건을 끈다(lib/invite.js eligibility — 0 = 기한 없음 · 조건 없음). 「0일」로 보이면 「바로 닫힘」으로 읽혀서 글자로 바꾼다
const DAYS_OFF = "0 = 제한 없음";
const daysLabel = (s: string) => (intText(s) === 0 ? "제한 없음" : numLabel(s, "일"));

// ── 알림 줄 ───────────────────────────────────
// 📌 이벤트 패스 화면과 같은 모양 — 페이지 위에서는 둥근 판, 패널 안에서는(inset) 선으로 나눈 한 줄
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

const Req = () => <span className="text-[#e91e3f]">*</span>;

// 편집 칸 아래 오류 한 줄 — 저장 단추 위에 붙는다
const PaneError = ({ msg }: { msg: string }) =>
  msg ? (
    <p role="alert" className="w-full text-[12px] font-bold text-[#d01634] break-keep">
      ⚠ {msg}
    </p>
  ) : null;

// 유저 칸 — 이름 + 옅은 디스코드 ID
const UserCell = ({ name, id }: { name: string; id: string }) => (
  <span className="min-w-0">
    <span className="font-bold">{name || "-"}</span>
    <span className="ml-1.5 text-[11px] text-[#8a8a8a] tabular-nums">{id}</span>
  </span>
);

// ── 보상 편집 ─────────────────────────────────
// 📌 이벤트 패스 화면의 RewardFields · RewardEditor 를 옮긴 것(고치면 같이). 상세 칸 안에서 입력값을 다루므로 반드시 모듈 스코프에 둔다.
//    공용 Dropdown 밝은 테마를 관리자 입력칸(inputClass)과 같은 높이 · 테두리로 덮어쓴다
const DROPDOWN_BTN = "!px-3 !py-2 min-h-10 !border-[#a3a3a3] hover:!border-[#131313] focus-visible:!border-[#131313]";

// 📌 보상 아이템 상태 표 — 반영 전(초안에만) · 찾을 수 없음(어디에도 없음). 실사이트 아이템은 표 없이(고친 초안이 있어도 지급은 실사이트 값이라 그대로)
const ItemStateChip = ({ state }: { state: ItemState }) =>
  state === "live" ? null : (
    <StatusChip tone={state === "draft" ? "warn" : "bad"} className="!h-5 !px-1.5 !text-[10px] ml-1.5 align-middle">
      {state === "draft" ? "반영 전" : "찾을 수 없음"}
    </StatusChip>
  );

function RewardFields({
  title,
  value,
  roles,
  items,
  stateOf,
  onChange,
  onEnter,
}: {
  title: string;
  value: DraftReward;
  roles: GuildRole[];
  items: RegItem[];
  stateOf: (id: string) => ItemState;
  onChange: (next: DraftReward) => void;
  onEnter: () => void;
}) {
  if (value.kind === "xp" || value.kind === "point") {
    return (
      <input
        type="text"
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
        onKeyDown={(e) => enterKey(e, onEnter)}
        placeholder={value.kind === "xp" ? "예: 1000 · 1만" : "예: 50"}
        aria-label={`${title} 수량`}
        className={`${inputClass} tabular-nums`}
      />
    );
  }
  if (value.kind === "role") {
    return (
      <Dropdown
        theme="light"
        value={value.roleId}
        placeholder="지급할 역할을 선택하세요"
        buttonClassName={DROPDOWN_BTN}
        onChange={(v) => onChange({ ...value, roleId: v, roleName: roles.find((r) => r.id === v)?.name || "" })}
        options={roles.map((r) => ({ value: r.id, label: r.name, color: r.color }))}
      />
    );
  }
  // 아이템 + 기간 — 기간 칸은 폭 고정(줄이 움직이지 않는다). 비우면 무기한, 실물은 기간이 없어 잠근다
  //    📌 반영 전(초안에만 있는) 아이템도 고를 수 있다 — 목록 오른쪽 작은 글자에 「반영 전」. 저장은 되지만 반영 전에는 「사용」을 켤 수 없다
  const picked = items.find((it) => it._id === value.itemId);
  const noDays = picked?.type === "physical";
  const lost = !!value.itemId && stateOf(value.itemId) === "missing";
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Dropdown
            theme="light"
            value={value.itemId}
            placeholder={items.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
            buttonClassName={DROPDOWN_BTN}
            onChange={(v) => {
              const it = items.find((x) => x._id === v);
              onChange({ ...value, itemId: v, itemName: it?.name || "", days: it?.type === "physical" ? "" : value.days });
            }}
            options={items.map((it) => ({
              value: it._id,
              label: it.name,
              hint: stateOf(it._id) === "draft" ? `반영 전 · ${itemTypeLabel(it.type)}` : itemTypeLabel(it.type),
              icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
            }))}
          />
        </div>
        <span className="relative shrink-0 w-[104px]">
          <input
            type="text"
            inputMode="numeric"
            value={noDays ? "" : value.days}
            disabled={noDays}
            onChange={(e) => onChange({ ...value, days: e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 4) })}
            onKeyDown={(e) => enterKey(e, onEnter)}
            placeholder="무기한"
            aria-label={`${title} 기간(일)`}
            className={`${inputClass} !pr-8 text-right tabular-nums`}
          />
          <span
            aria-hidden
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#8a8a8a] ${value.days && !noDays ? "" : "invisible"}`}
          >
            일
          </span>
        </span>
      </div>
      {/* 저장된 아이템이 어디에도 없다(초안을 버렸거나 지움) — 목록에 없어 고르기 칸이 비어 보인다 */}
      {lost && (
        <p role="alert" className="mt-1.5 text-[12px] font-bold text-[#d01634] break-keep">
          ⚠ 찾을 수 없는 아이템입니다{value.itemName ? ` (${value.itemName})` : ""} — 다시 고르거나 지워 주십시오.
        </p>
      )}
    </>
  );
}

// 줄 조작 단추 — 폭을 고정해 첫 줄 · 끝 줄에서 단추가 꺼져도 자리가 움직이지 않는다
const ROW_BTN = "!px-0 w-8 shrink-0";
const RowIcon = ({ d }: { d: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// 보상 목록(최대 4줄) — 줄마다 종류 + 값, 오른쪽 위에 위로 · 아래로 · 삭제. 유저는 단계 단위로 한 번에 받는다(「받기」)
function RewardEditor({
  rows,
  roles,
  items,
  stateOf,
  nextKey,
  onChange,
  onEnter,
}: {
  rows: DraftReward[];
  roles: GuildRole[];
  items: RegItem[];
  stateOf: (id: string) => ItemState;
  nextKey: () => string;
  onChange: (next: DraftReward[]) => void;
  onEnter: () => void;
}) {
  const set = (j: number, v: DraftReward) => onChange(rows.map((r, i) => (i === j ? v : r)));
  const move = (j: number, d: -1 | 1) => {
    const next = [...rows];
    [next[j], next[j + d]] = [next[j + d], next[j]];
    onChange(next);
  };
  const add = () => {
    if (rows.length >= MAX_REWARDS) return;
    onChange([...rows, { key: nextKey(), kind: "xp", amount: "", roleId: "", roleName: "", itemId: "", itemName: "", days: "" }]);
  };
  return (
    <div className="mt-5 pt-5 border-t border-[#ededed]">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[14px] font-black">보상</span>
        <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">
          {rows.length}/{MAX_REWARDS}
        </span>
        <Btn variant="secondary" size="sm" className="ml-auto" onClick={add} disabled={rows.length >= MAX_REWARDS}>
          보상 추가
        </Btn>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-center text-[12px] font-bold text-[#a3a3a3] bg-[#f2f2f2]">없음</p>
      ) : (
        rows.map((r, j) => (
          <div key={r.key} className={j > 0 ? "mt-4 pt-4 border-t border-dashed border-[#ededed]" : ""}>
            <div className="flex items-center gap-1 mb-2">
              <span className="text-[12px] font-black text-[#5a5a5a] tabular-nums">보상 {j + 1}</span>
              <span className="ml-auto inline-flex items-center gap-0.5">
                <Btn variant="ghost" size="sm" className={ROW_BTN} aria-label={`보상 ${j + 1} 위로`} disabled={j === 0} onClick={() => move(j, -1)}>
                  <RowIcon d="M6 15l6-6 6 6" />
                </Btn>
                <Btn variant="ghost" size="sm" className={ROW_BTN} aria-label={`보상 ${j + 1} 아래로`} disabled={j === rows.length - 1} onClick={() => move(j, 1)}>
                  <RowIcon d="M6 9l6 6 6-6" />
                </Btn>
                <Btn variant="ghost" size="sm" className={ROW_BTN} aria-label={`보상 ${j + 1} 삭제`} onClick={() => onChange(rows.filter((_, i) => i !== j))}>
                  <RowIcon d="M6 6l12 12M18 6L6 18" />
                </Btn>
              </span>
            </div>
            <Segmented options={KIND_OPTIONS} value={r.kind} onChange={(v) => set(j, { ...r, kind: v as RewardKind })} className="mb-2.5" />
            <RewardFields title={`보상 ${j + 1}`} value={r} roles={roles} items={items} stateOf={stateOf} onChange={(v) => set(j, v)} onEnter={onEnter} />
          </div>
        ))
      )}
    </div>
  );
}

const EMPTY_BONUS: BonusCfg = { enabled: false, endsAt: "", inviter: "", invitee: "" };
const EMPTY_CFG: Cfg = { enabled: false, startsAt: "", joinDays: "", accountDays: "", bonus: EMPTY_BONUS, tiers: [] };
const EMPTY_STATS: Stats = { uses: 0, codes: 0, ticketsPending: 0 };

export default function AdminInvitePage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/invite 가 서버에서 한다(requireAdmin)
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
  // 아이템 목록을 제대로 받았는가 — 못 받았으면 목록에 없다고 「찾을 수 없음」으로 치지 않는다
  const [itemsOk, setItemsOk] = useState(false);
  // 저장된 단계의 아이템 보상 상태(서버 itemStates — 불러오기 · 저장 응답). 아직 저장 안 한 고른 아이템은 목록의 _draft 로 가른다(itemStateOf)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [eventKey, setEventKey] = useState("");
  // 📌 기본 꺼짐 — 불러오기에 실패했을 때 실수로 켜진 채 저장되는 일을 막는다(모델 기본값과 같음)
  const [cfg, setCfg] = useState<Cfg>(EMPTY_CFG);
  // 불러온(저장한) 한 벌 — 변경 목록 · 빨간 점 · 되돌리기의 기준
  const [base, setBase] = useState<Cfg | null>(null);
  // 불러온 시각 — 상태(시작 전 · 진행 중) 판정용. 렌더 중에 Date.now() 를 부르지 않는다
  const [loadedAt, setLoadedAt] = useState(0);
  // 아직 tid 가 없는 새 단계와 보상 줄에 붙일 로컬 키 발급기(저장 body 에는 나가지 않는다)
  const newKeyRef = useRef(0);
  const nextRowKey = useCallback(() => `r:${++newKeyRef.current}`, []);

  const [tierDraft, setTierDraft] = useState<TierDraft | null>(null);
  const [paneErr, setPaneErr] = useState("");
  const [deleteKey, setDeleteKey] = useState<string | null>(null);

  // 봇이 실제로 붙일 수 있는 역할만 — 디스코드가 관리하는 역할(부스트 등)은 지급이 불가능하다
  const grantableRoles = useMemo(() => guildRoles.filter((r) => !r.managed), [guildRoles]);
  const roleNameOf = useCallback((id: string) => guildRoles.find((r) => r.id === id)?.name || "", [guildRoles]);
  const itemOf = useCallback((id: string) => regItems.find((it) => it._id === id) || null, [regItems]);
  // 📌 아이템 보상 상태 한 곳 — 고르기 목록 · 표 칩 · 「사용」 잠금 · 경고 줄이 전부 이것을 본다(서로 다르게 말하지 않게).
  //    서버 값(저장된 단계 — 실사이트 · 초안을 직접 물은 값)이 먼저, 없으면 목록(_draft "new" = 반영 전). 목록에도 없으면 missing(목록을 받았을 때만)
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

  // 서버 모양({ cfg, itemStates, stats }) → 화면 상태
  const applyData = useCallback((data: unknown) => {
    const d = rawOf(data);
    const p = rawOf(d.cfg);
    const b = rawOf(p.bonus);
    const next: Cfg = {
      enabled: p.enabled === true,
      startsAt: toKstInput(p.startsAt),
      joinDays: intField(p.joinDays, DAYS, DAYS.def),
      accountDays: intField(p.accountDays, DAYS, DAYS.def),
      bonus: {
        enabled: b.enabled === true,
        endsAt: toKstInput(b.endsAt),
        inviter: intField(b.inviter, TICKETS, BONUS_DEF.inviter),
        invitee: intField(b.invitee, TICKETS, BONUS_DEF.invitee),
      },
      tiers: sortTiers(
        rawList(p.tiers).map((t) => {
          const tid = String(t.tid || "");
          return { key: tid ? `t:${tid}` : `new:${++newKeyRef.current}`, tid, need: toInt(t.need), free: normRewards(t.free) };
        })
      ),
    };
    setEventKey(String(p.key || ""));
    setCfg(next);
    setBase(next);
    setItemStates(statesFrom(d.itemStates));
    setStats(statsFrom(d.stats));
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

  // 📌 요약 숫자만 다시 받는다(다시 지급 뒤) — 설정은 덮지 않는다(저장하지 않은 편집이 서버 값으로 덮이지 않게)
  const refreshStats = useCallback(() => {
    fetch("/api/admin/invite", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (d?.ok === true) setStats(statsFrom(d.stats));
      });
  }, []);

  // 📌 읽기만 — 상태는 응답을 받은 뒤에만 바꾼다(첫 화면은 effect 에서 부른다)
  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/invite", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
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
        if (d?.ok === true && d.cfg) {
          applyData(d);
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
    setTierDraft(null);
    setPaneErr("");
  }, []);
  // [다시 불러오기] — 목록이 서버 값으로 바뀌면 열린 편집 칸이 엉뚱한 값을 들고 있게 되므로 먼저 닫는다
  const reloadAll = () => {
    closePane();
    setIsLoading(true);
    load();
  };

  // PC 편집 칸이 열리면 필요 인원 칸에 커서. 모바일은 자판이 판을 덮어 두지 않는다
  const tierKey = tierDraft?.key ?? null;
  useEffect(() => {
    if (!tierKey || !window.matchMedia("(min-width: 768px)").matches) return;
    const el = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-pane-need]")).find((x) => x.offsetParent !== null);
    el?.focus();
    el?.select();
  }, [tierKey]);

  const snapshot = useMemo(() => (base ? sig(base) : ""), [base]);
  const isDirty = !isLoading && !!base && sig(cfg) !== snapshot;
  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const setBonus = <K extends keyof BonusCfg>(k: K, v: BonusCfg[K]) => setCfg((c) => ({ ...c, bonus: { ...c.bonus, [k]: v } }));

  // ── 켜기 잠금 · 경고 ─────────────────────────
  // 📌 보상 아이템이 하나라도 실사이트에 없으면(반영 전 · 찾을 수 없음) 「사용」을 켤 수 없다 — 지급은 실사이트 Item 만 한다.
  //    서버 PUT 도 같은 검사 · 같은 문구로 돌려보낸다(app/api/admin/invite). 반영 전이 있으면 그 문구, 없고 찾을 수 없는 것만 있으면 그 문구
  const enableLockOf = (list: Tier[]) => {
    const rewards = list.flatMap((t) => t.free).filter((r) => r.kind === "item" && !!r.itemId);
    const ids = [...new Set(rewards.map((r) => r.itemId))];
    const draftIds = ids.filter((id) => itemStateOf(id) === "draft");
    const missing = ids.filter((id) => itemStateOf(id) === "missing").length;
    const nameOf = (id: string) => itemOf(id)?.name || rewards.find((r) => r.itemId === id)?.itemName || "이름 없음";
    return {
      missing,
      draft: draftIds.length > 0,
      msg: draftIds.length ? draftItemsMessage(draftIds.map(nameOf)) : missing ? missingItemsMessage(missing) : "",
    };
  };
  const lock = enableLockOf(cfg.tiers);
  // 잠금이 걸린 동안 창으로 돌아오면(상점 관리에서 반영하고 온 뒤) 아이템 목록 · 상태만 다시 받는다 —
  //    설정은 다시 받지 않는다(저장하지 않은 편집을 서버 값으로 덮지 않게)
  const lockOn = !!lock.msg;
  useEffect(() => {
    if (!isAdmin || !lockOn) return;
    const refresh = () => {
      Promise.all([
        fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/invite", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]).then(([reg, d]) => {
        if (reg?.success === true && Array.isArray(reg?.data)) {
          setRegItems(reg.data);
          setItemsOk(true);
        }
        if (d?.ok === true) setItemStates(statesFrom(d.itemStates));
      });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isAdmin, lockOn]);

  // ── 저장 ────────────────────────────────────
  // 실패 알림 — 편집 칸에서 누른 저장이면 칸 안(저장 단추 위)에, 그 밖은 토스트로
  const fail = (msg: string, from: SaveFrom) => {
    if (from === "pane" && tierDraft) {
      setPaneErr(msg);
      sfxErr();
    } else {
      toast(msg, true);
    }
  };

  const doSave = async (c: Cfg, from: SaveFrom, okMsg: string) => {
    savingRef.current = true;
    setIsSaving(true);
    // 표시용 이름 스냅샷 — 지금 목록의 이름으로 채워 보낸다(아이템 이름은 서버가 실사이트 이름 — 없으면 초안 이름으로 다시 채운다)
    const named = (r: Reward): Reward => ({
      ...r,
      roleName: r.kind === "role" ? roleNameOf(r.roleId) || r.roleName : "",
      itemName: r.kind === "item" ? itemOf(r.itemId)?.name || r.itemName : "",
    });
    const res = await fetch("/api/admin/invite", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: c.enabled,
        startsAt: fromKstInput(c.startsAt),
        joinDays: intText(c.joinDays),
        accountDays: intText(c.accountDays),
        bonus: {
          enabled: c.bonus.enabled,
          endsAt: fromKstInput(c.bonus.endsAt),
          inviter: intText(c.bonus.inviter),
          invitee: intText(c.bonus.invitee),
        },
        // 📌 기존 단계의 tid 를 그대로 되돌려 보낸다 — 빠지면 서버가 새 번호를 발급해 이미 받은 단계가 미수령으로 되살아난다
        tiers: c.tiers.map((t, i) => ({ tid: t.tid || "", level: i + 1, need: t.need, free: t.free.map(named) })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    savingRef.current = false;
    setIsSaving(false);
    if (res?.ok && d?.ok === true && d.cfg) {
      // 응답에는 서버가 새로 발급한 tid 가 들어 있다 — 그대로 받아 기준(base)도 갈아 끼운다(저장 줄이 닫힌다)
      const next = applyData(d);
      const keys = new Set(next.tiers.map((t) => t.key));
      if (from === "pane") closePane();
      else setTierDraft((cur) => (cur && keys.has(cur.key) ? cur : null));
      setLoadFailed(false);
      toast(okMsg);
    } else {
      fail(d?.error || "저장에 실패했습니다.", from);
    }
  };

  // 📌 모든 저장의 입구 — 저장 줄 · Enter · 편집 칸 [저장] · 삭제 확인이 전부 여기로 온다.
  //    over 로 넘긴 값(편집 칸에서 막 고친 단계 목록)을 화면 상태에 얹어 한 벌로 검사 · 저장한다
  const requestSave = (over: Partial<Cfg>, from: SaveFrom, okMsg = "저장되었습니다.") => {
    if (savingRef.current) return;
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    const next: Cfg = { ...cfg, ...over };
    if (sig(next) === snapshot) {
      if (from === "pane") closePane();
      sfxTick();
      return toast("변경 사항이 없습니다.", false, { sound: false });
    }
    const err = checkCfg(next);
    if (err) return fail(err, from);
    // 📌 켜진 채 저장(켜기 · 켜져 있는 동안의 저장) — 보상 아이템이 전부 실사이트에 있어야 한다(위 켜기 잠금 · 서버와 같은 검사). 끄는 저장은 늘 된다
    const locked = next.enabled ? enableLockOf(next.tiers).msg : "";
    if (locked) return fail(locked, from);
    doSave(next, from, okMsg);
  };
  const saveList = () => requestSave({}, "list");

  // ── 단계 편집 칸 ────────────────────────────
  const toDraftReward = (r: Reward): DraftReward => ({
    key: nextRowKey(),
    kind: r.kind,
    amount: r.amount ? String(r.amount) : "",
    roleId: r.roleId,
    roleName: r.roleName,
    itemId: r.itemId,
    itemName: r.itemName,
    days: r.days > 0 ? String(r.days) : "",
  });
  // t 가 null 이면 새 단계 — 기본 인원은 nextNeed. 저장 전까지 목록에 넣지 않는다(취소하면 그대로 사라진다)
  const openTier = (t: Tier | null) => {
    if (savingRef.current) return;
    setPaneErr("");
    if (t) {
      if (tierDraft?.key === t.key) return;
      setTierDraft({ key: t.key, isNew: false, need: String(t.need), free: t.free.map(toDraftReward) });
      return;
    }
    if (cfg.tiers.length >= MAX_TIERS) return toast(`단계는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`, true);
    setTierDraft({ key: `new:${++newKeyRef.current}`, isNew: true, need: String(nextNeed(cfg.tiers)), free: [] });
  };
  const editTierDraft = (d: TierDraft) => {
    setTierDraft(d);
    setPaneErr("");
  };

  // 편집 칸 [저장] · Enter — 칸의 값을 검사해 목록에 얹고(인원 차례로) 그대로 저장한다
  const saveTierDraft = () => {
    if (!tierDraft) return;
    const need = intText(tierDraft.need);
    const ne = needError(need);
    if (ne) return fail(ne, "pane");
    if (cfg.tiers.some((t) => t.key !== tierDraft.key && t.need === need)) return fail(`${fmt(need)}명 단계가 이미 있습니다.`, "pane");
    for (const [j, d] of tierDraft.free.entries()) {
      const at = tierDraft.free.length > 1 ? `보상 ${j + 1}` : "보상";
      if (d.kind === "role" && !d.roleId) return fail(`${at}의 역할을 선택해 주십시오.`, "pane");
      if (d.kind === "item" && !d.itemId) return fail(`${at}의 아이템을 선택해 주십시오.`, "pane");
      if (d.kind === "item" && toInt(d.days) > MAX_DAYS) return fail(`${at}의 기간은 ${MAX_DAYS.toLocaleString()}일 이하로 입력해 주십시오.`, "pane");
      if (d.kind === "xp" || d.kind === "point") {
        const a = parseAmount(d.amount);
        if (!Number.isFinite(a) || a < 1) return fail(`${at}의 수량을 1 이상으로 입력해 주십시오.`, "pane");
        if (a > MAX_NUM) return fail(`${at}의 수량은 10억 이하로 입력해 주십시오.`, "pane");
      }
    }
    const fromDraft = (d: DraftReward): Reward => ({
      kind: d.kind,
      amount: d.kind === "xp" || d.kind === "point" ? parseAmount(d.amount) : 0,
      roleId: d.kind === "role" ? d.roleId : "",
      roleName: d.kind === "role" ? roleNameOf(d.roleId) || d.roleName : "",
      itemId: d.kind === "item" ? d.itemId : "",
      itemName: d.kind === "item" ? itemOf(d.itemId)?.name || d.itemName : "",
      // 빈칸 = 무기한(0). 실물은 기간이 없다(칸도 잠겨 있다)
      days: d.kind === "item" && itemOf(d.itemId)?.type !== "physical" ? toInt(d.days) : 0,
    });
    const free = tierDraft.free.slice(0, MAX_REWARDS).map(fromDraft);
    const exists = cfg.tiers.some((t) => t.key === tierDraft.key);
    if (!exists && cfg.tiers.length >= MAX_TIERS) return fail(`단계는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`, "pane");
    const list = exists
      ? cfg.tiers.map((t) => (t.key === tierDraft.key ? { ...t, need, free } : t))
      : [...cfg.tiers, { key: tierDraft.key, tid: "", need, free }];
    requestSave({ tiers: sortTiers(list) }, "pane", exists ? "저장되었습니다." : `${fmt(need)}명 단계를 추가했습니다.`);
  };

  // ── 단계 삭제 ────────────────────────────────
  // 아직 저장 안 한 새 단계는 목록에 없다 — 편집 칸만 닫는다. 저장된 단계는 확인 뒤 바로 저장
  const askRemoveTier = (key: string) => {
    if (savingRef.current) return;
    if (!cfg.tiers.some((t) => t.key === key)) return closePane();
    setDeleteKey(key);
  };
  const confirmRemoveTier = () => {
    if (!deleteKey || savingRef.current) return;
    const key = deleteKey;
    const t = cfg.tiers.find((x) => x.key === key);
    setDeleteKey(null);
    setTierDraft((cur) => (cur?.key === key ? null : cur));
    setPaneErr("");
    if (!t) return;
    requestSave({ tiers: cfg.tiers.filter((x) => x.key !== key) }, "list", `${fmt(t.need)}명 단계를 삭제했습니다.`);
  };

  // 📌 되돌리기 — 불러온(저장한) 한 벌로. 줄 key 도 그대로라 표가 흔들리지 않는다
  const resetToBase = () => {
    if (!base) return;
    closePane();
    setCfg(base);
  };

  // ── 초대 기록 ───────────────────────────────
  // 📌 쪽 번호는 1부터(?page=1 이 첫 쪽). 검색어는 입력이 멈추고 0.3초 뒤에 묻는다(글자마다 서버를 부르지 않게) — 검색이 바뀌면 첫 쪽으로
  const [logQ, setLogQ] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [logPage, setLogPage] = useState(1);
  const [logNonce, setLogNonce] = useState(0);
  const [logs, setLogs] = useState<{ key: string; rows: UseRow[]; total: number; failed: boolean } | null>(null);
  const [pick, setPick] = useState<UseRow | null>(null);
  const [regrantAsk, setRegrantAsk] = useState<UseRow | null>(null);
  const [regranting, setRegranting] = useState(false);
  const logKey = `${logPage}|${logQuery}|${logNonce}`;
  const logsLoading = logs?.key !== logKey;

  useEffect(() => {
    const q = logQ.trim();
    if (q === logQuery) return;
    const t = setTimeout(() => {
      setLogQuery(q);
      setLogPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [logQ, logQuery]);

  useEffect(() => {
    if (!isAdmin || tab !== "log") return;
    let live = true;
    const key = `${logPage}|${logQuery}|${logNonce}`;
    const qs = new URLSearchParams({ page: String(logPage) });
    if (logQuery) qs.set("q", logQuery);
    fetch(`/api/admin/invite/uses?${qs.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((d) => {
        if (!live) return;
        const ok = d?.ok === true;
        setLogs({ key, rows: ok ? usesFrom(d.rows) : [], total: ok ? countOf(d.total) : 0, failed: !ok });
      });
    return () => {
      live = false;
    };
  }, [isAdmin, tab, logPage, logQuery, logNonce]);

  const logRows = useMemo(() => logs?.rows ?? [], [logs]);
  const logTotal = logs?.total ?? 0;
  const logPages = Math.max(1, Math.ceil(logTotal / PAGE_SIZE));
  // 상세 칸 — 고른 줄의 최신 값(다시 지급 · 새로고침 뒤 다시 읽은 줄). 지금 쪽에 없으면 고를 때의 값
  const picked = pick ? logRows.find((r) => r.inviteeId === pick.inviteeId) || pick : null;
  const goPage = (p: number) => {
    const n = Math.min(logPages, Math.max(1, p));
    if (n === logPage) return;
    sfxTick();
    setLogPage(n);
  };

  const doRegrant = async () => {
    if (!regrantAsk || regranting) return;
    const id = regrantAsk.inviteeId;
    setRegranting(true);
    const res = await fetch("/api/admin/invite/regrant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeId: id }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setRegranting(false);
    setRegrantAsk(null);
    if (res?.ok && d?.ok === true) {
      // 장 수 · 지급 시각은 서버가 다시 읽은 값으로(이미 일부 들어가 있던 장 수는 다시 넣지 않는다 — 서버가 주문 묶음으로 센다)
      setLogNonce((n) => n + 1);
      refreshStats();
      const g = rawOf(d.granted);
      const a = countOf(g.inviter);
      const b = countOf(g.invitee);
      toast(a + b > 0 ? `추첨권을 지급했습니다 · 초대한 사람 ${fmt(a)}장 · 들어온 친구 ${fmt(b)}장` : "지급 처리했습니다.");
    } else {
      toast(d?.error || "지급에 실패했습니다.", true);
    }
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다
  if (gate) return gate;

  // ── 변경 목록(저장 줄) ───────────────────────
  // 📌 불러온 한 벌과 지금 값을 맞대어 한 줄씩(보여 주기 전용). 단계는 편집 칸 · 삭제 확인이 그 자리에서 저장해 여기에 남지 않는다
  const changes: string[] = [];
  const changed = {
    enabled: !!base && base.enabled !== cfg.enabled,
    startsAt: !!base && base.startsAt !== cfg.startsAt,
    joinDays: !!base && !Object.is(intText(base.joinDays), intText(cfg.joinDays)),
    accountDays: !!base && !Object.is(intText(base.accountDays), intText(cfg.accountDays)),
    bonusEnabled: !!base && base.bonus.enabled !== cfg.bonus.enabled,
    bonusEndsAt: !!base && base.bonus.endsAt !== cfg.bonus.endsAt,
    inviter: !!base && !Object.is(intText(base.bonus.inviter), intText(cfg.bonus.inviter)),
    invitee: !!base && !Object.is(intText(base.bonus.invitee), intText(cfg.bonus.invitee)),
  };
  if (base && isDirty) {
    if (changed.enabled) changes.push(`상태 ${onOffLabel(base.enabled)} → ${onOffLabel(cfg.enabled)}`);
    if (changed.startsAt) changes.push(`시작 ${kstLabel(base.startsAt)} → ${kstLabel(cfg.startsAt)}`);
    if (changed.joinDays) changes.push(`입력 기한 ${daysLabel(base.joinDays)} → ${daysLabel(cfg.joinDays)}`);
    if (changed.accountDays) changes.push(`계정 최소 나이 ${daysLabel(base.accountDays)} → ${daysLabel(cfg.accountDays)}`);
    if (changed.bonusEnabled) changes.push(`보너스 ${bonusOnLabel(base.bonus.enabled)} → ${bonusOnLabel(cfg.bonus.enabled)}`);
    if (changed.bonusEndsAt) changes.push(`보너스 종료 ${kstLabel(base.bonus.endsAt)} → ${kstLabel(cfg.bonus.endsAt)}`);
    if (changed.inviter) changes.push(`초대한 사람 ${numLabel(base.bonus.inviter, "장")} → ${numLabel(cfg.bonus.inviter, "장")}`);
    if (changed.invitee) changes.push(`들어온 친구 ${numLabel(base.bonus.invitee, "장")} → ${numLabel(cfg.bonus.invitee, "장")}`);
  }

  // 상태 — 불러온 시각 기준(렌더 중 시계를 읽지 않는다). 끝이 없는 이벤트라 시작 전 · 진행 중 둘
  const startMs = kstMs(cfg.startsAt);
  const bonusEndMs = kstMs(cfg.bonus.endsAt);
  const phase = !cfg.enabled ? "중단" : !Number.isFinite(startMs) || !loadedAt ? "-" : loadedAt < startMs ? "시작 전" : "진행 중";
  const bonusEnded = cfg.bonus.enabled && !!loadedAt && Number.isFinite(bonusEndMs) && bonusEndMs <= loadedAt;
  const startHint = Number.isFinite(startMs) ? "KST" : <span className="font-bold text-[#d01634]">시작 시각을 입력해 주십시오.</span>;
  const bonusHint = Number.isFinite(bonusEndMs) ? "KST · 종료 시각 미포함" : <span className="font-bold text-[#d01634]">종료 시각을 입력해 주십시오.</span>;

  // 📌 저장 줄 — 구성 탭에서만. 불러오기 실패면 바뀐 것과 상관없이 잠근 채 이유를 띄운다. 편집 칸이 열려 있는 동안은 숨긴다(칸의 [저장]이 나머지 변경까지 한 번에 저장한다)
  const onConfig = tab === "config";
  const barNote = onConfig && !tierDraft && loadFailed ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span> : undefined;

  const emptyTierCount = cfg.tiers.filter((t) => !t.free.length).length;
  const tierIdx = tierDraft ? cfg.tiers.findIndex((t) => t.key === tierDraft.key) : -1;
  const deleteTier = deleteKey ? cfg.tiers.find((t) => t.key === deleteKey) || null : null;
  // 편집 칸 필요 인원 아래 한 줄 — 못 읽거나 겹치면 그 이유. 빈 줄이어도 줄 높이는 남긴다(아래 보상 칸이 들썩이지 않게)
  const draftNeed = tierDraft ? intText(tierDraft.need) : NaN;
  const draftNeedErr = !tierDraft?.need.trim()
    ? ""
    : needError(draftNeed) || (cfg.tiers.some((t) => t.key !== tierDraft.key && t.need === draftNeed) ? `${fmt(draftNeed)}명 단계가 이미 있습니다.` : "");

  // 보상 칸 — PC 는 한 줄에 하나씩 쌓고, 모바일 줄 카드는 " · " 로 이어 한 덩어리로
  const rewardCell = (list: Reward[]) =>
    list.length === 0 ? (
      <span className="font-bold text-[#a3a3a3]">
        <span className="md:hidden">보상 </span>-
      </span>
    ) : (
      <span className="min-w-0 font-bold text-[#131313] break-keep">
        {list.map((r, j) => (
          <span key={j} className="md:block">
            {j > 0 && <span className="md:hidden text-[#a3a3a3]"> · </span>}
            {rewardLabel(r, roleNameOf, itemOf)}
            {r.kind === "item" && !!r.itemId && <ItemStateChip state={itemStateOf(r.itemId)} />}
          </span>
        ))}
      </span>
    );

  // ── 표 열 ──────────────────────────────────
  const tierCols: Column<TierRow>[] = [
    {
      key: "no",
      label: "단계",
      className: "w-16",
      mobile: "title",
      render: ({ i }) => (
        <span className="font-black tabular-nums">
          {i + 1}
          <span className="md:hidden">단계</span>
        </span>
      ),
    },
    {
      key: "need",
      label: "필요 인원",
      className: "w-32",
      render: ({ t }) => (
        <span className="tabular-nums whitespace-nowrap">
          <span className="font-black text-[#131313]">{fmt(t.need)}</span>명
        </span>
      ),
    },
    { key: "free", label: "보상", render: ({ t }) => rewardCell(t.free) },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-32",
      // 모바일 줄 카드는 통째로 단추라 안에 단추를 둘 수 없다 — 줄을 눌러 편집 칸에서 삭제한다
      mobile: "hide",
      render: ({ t }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openTier(t); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); askRemoveTier(t.key); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  const ticketCell = (r: UseRow) => {
    const st = ticketStateOf(r);
    if (st === "skip") return <StatusChip>해당 없음</StatusChip>;
    return st === "paid" ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <StatusChip tone="ok">지급</StatusChip>
        <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">
          {fmt(r.inviterTickets)} · {fmt(r.inviteeTickets)}장
        </span>
      </span>
    ) : (
      <StatusChip>미지급</StatusChip>
    );
  };
  const logCols: Column<UseRow>[] = [
    { key: "at", label: "시각", className: "w-32", mobile: "meta", render: (r) => <span className="tabular-nums">{isoLabel(r.at)}</span> },
    { key: "inviter", label: "초대한 사람", render: (r) => <UserCell name={r.inviterName} id={r.inviterId} /> },
    { key: "invitee", label: "들어온 친구", mobile: "title", render: (r) => <UserCell name={r.inviteeName} id={r.inviteeId} /> },
    { key: "code", label: "코드", className: "w-28", render: (r) => (r.code ? <span className="font-mono text-[12px]">{r.code}</span> : <span className="text-[#a3a3a3]">-</span>) },
    { key: "tickets", label: "추첨권", className: "w-40", render: ticketCell },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-28",
      // 모바일 줄 카드는 통째로 단추라 안에 단추를 둘 수 없다 — 줄을 눌러 상세 칸에서 다시 지급한다
      mobile: "hide",
      render: (r) =>
        ticketStateOf(r) !== "pending" ? (
          <span className="text-[#a3a3a3]">-</span>
        ) : (
          <Btn variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); setRegrantAsk(r); }}>
            다시 지급
          </Btn>
        ),
    },
  ];

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="친구 초대"
        desc={`상시 이벤트 · 이벤트 키 ${eventKey || "-"}`}
        tabs={<AdminTabs tabs={TABS} current={tab} hrefOf={tabHref} />}
        footer={
          onConfig ? (
            <SaveBar dirty={isDirty && !loadFailed && !tierDraft} changes={changes} onSave={saveList} onReset={resetToBase} saving={isSaving} note={barNote} />
          ) : undefined
        }
      >
        {(loadFailed || (rolesFailed && !isLoading && onConfig)) && (
          <div className="mb-5 space-y-3">
            {loadFailed && (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={reloadAll}>다시 불러오기</Btn>}>
                현재 설정을 불러오지 못했습니다 (/api/admin/invite). 저장을 막아 두었습니다.
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
            {/* 요약 — 넓은 화면 네 칸 한 줄, 좁으면 2×2 */}
            <StatRow
              className="mb-5"
              items={[
                { label: "초대", value: isLoading ? "-" : fmt(stats.uses) },
                { label: "발급 코드", value: isLoading ? "-" : fmt(stats.codes) },
                { label: "추첨권 미지급", value: isLoading ? "-" : fmt(stats.ticketsPending) },
                { label: "상태", value: phase },
              ]}
            />

            {/* 기본 설정 · 추첨권 보너스 — 넓은 화면에서 두 열, 좁으면 위아래 */}
            <PanelGrid className="mb-5">
              <Panel title="기본 설정" flush>
                <FieldRow label="사용" changed={changed.enabled}>
                  {/* 📌 켜기 잠금 — 꺼져 있을 때만 스위치를 잠근다(켜져 있으면 끄기는 늘 된다). 이유는 스위치 옆에 같은 문구로 */}
                  <Inline>
                    <Switch on={cfg.enabled} onChange={(v) => set("enabled", v)} disabled={isLoading || (!cfg.enabled && lockOn)} label="친구 초대 사용" />
                    <span className={`font-bold ${cfg.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{cfg.enabled ? "운영 중" : "중단 (운영진 미리보기)"}</span>
                    {lockOn && !isLoading && <span className={`min-w-0 font-bold break-keep ${lock.draft ? "text-amber-700" : "text-[#d01634]"}`}>{lock.msg}</span>}
                  </Inline>
                </FieldRow>
                <FieldRow label="시작 시각" hint={isLoading ? undefined : startHint} changed={changed.startsAt}>
                  <input
                    type="datetime-local"
                    value={cfg.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    aria-label="시작 시각 (KST)"
                    className={`${inputClass} sm:!w-64 tabular-nums`}
                  />
                </FieldRow>
                <FieldRow label="입력 기한" hint={DAYS_OFF} changed={changed.joinDays}>
                  <Inline>
                    가입 후
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.joinDays}
                      onChange={(e) => set("joinDays", e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${DAYS.min}~${DAYS.max}`}
                      aria-label="입력 기한 (가입 후 일수)"
                      className={numClass}
                    />
                    일
                  </Inline>
                </FieldRow>
                <FieldRow label="계정 최소 나이" hint={DAYS_OFF} changed={changed.accountDays}>
                  <Inline>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.accountDays}
                      onChange={(e) => set("accountDays", e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${DAYS.min}~${DAYS.max}`}
                      aria-label="계정 최소 나이 (일)"
                      className={numClass}
                    />
                    일
                  </Inline>
                </FieldRow>
              </Panel>

              {/* 추첨권 보너스 — 괴담회 추첨권(초대 1명마다 양쪽에). 괴담회가 꺼져 있거나 추첨이 끝났으면 서버가 주지 않는다 */}
              <Panel title="추첨권 보너스" flush>
                <FieldRow label="사용" changed={changed.bonusEnabled}>
                  <Inline>
                    <Switch on={cfg.bonus.enabled} onChange={(v) => setBonus("enabled", v)} disabled={isLoading} label="추첨권 보너스 사용" />
                    <span className={`font-bold ${cfg.bonus.enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{cfg.bonus.enabled ? (bonusEnded ? "사용 (종료됨)" : "사용") : "중단"}</span>
                  </Inline>
                </FieldRow>
                <FieldRow label="종료 시각" hint={isLoading ? undefined : bonusHint} changed={changed.bonusEndsAt}>
                  <input
                    type="datetime-local"
                    value={cfg.bonus.endsAt}
                    onChange={(e) => setBonus("endsAt", e.target.value)}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    aria-label="보너스 종료 시각 (KST)"
                    className={`${inputClass} sm:!w-64 tabular-nums`}
                  />
                </FieldRow>
                <FieldRow label="초대한 사람" changed={changed.inviter}>
                  <Inline>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.bonus.inviter}
                      onChange={(e) => setBonus("inviter", e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${TICKETS.min}~${TICKETS.max}`}
                      aria-label="초대한 사람 추첨권 장 수"
                      className={numClass}
                    />
                    장
                  </Inline>
                </FieldRow>
                <FieldRow label="들어온 친구" changed={changed.invitee}>
                  <Inline>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cfg.bonus.invitee}
                      onChange={(e) => setBonus("invitee", e.target.value.replace(/\D/g, "").slice(0, 2))}
                      onKeyDown={(e) => enterKey(e, saveList)}
                      placeholder={`${TICKETS.min}~${TICKETS.max}`}
                      aria-label="들어온 친구 추첨권 장 수"
                      className={numClass}
                    />
                    장
                  </Inline>
                </FieldRow>
              </Panel>
            </PanelGrid>

            {/* 누적 보상 — 패널 머리에 추가, 본문은 전체 폭 표(필요 인원 오름차순) */}
            <Panel
              flush
              title={
                <>
                  누적 보상 <span className="ml-1 text-[#8a8a8a] tabular-nums">{cfg.tiers.length}</span>
                </>
              }
              right={
                <Btn variant="secondary" size="sm" onClick={() => openTier(null)} disabled={isLoading || loadFailed}>
                  단계 추가
                </Btn>
              }
            >
              {/* 📌 어디에도 없는 보상 아이템(초안을 버렸거나 지움) — 그 칸에 「찾을 수 없음」 칩, 여기 한 줄. 켜기도 잠긴다 */}
              {!isLoading && lock.missing > 0 && (
                <NoteLine tone="bad" inset>
                  {missingItemsMessage(lock.missing)}
                </NoteLine>
              )}
              {/* 보상이 빈 단계는 막지 않는다(이벤트 패스와 같다) — 개수만 */}
              {!isLoading && emptyTierCount > 0 && (
                <NoteLine tone="neutral" inset>
                  보상이 비어 있는 단계 {emptyTierCount}개
                </NoteLine>
              )}
              {isLoading ? (
                <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
              ) : cfg.tiers.length === 0 ? (
                <div className="p-5">
                  <EmptyRow>등록된 단계가 없습니다.</EmptyRow>
                </div>
              ) : (
                // 패널이 테두리를 이미 두르고 있어 표 자체의 테두리 · 모서리는 뺀다
                <DataTable
                  className="!rounded-none !border-0"
                  columns={tierCols}
                  rows={cfg.tiers.map((t, i) => ({ t, i }))}
                  rowKey={(r) => r.t.key}
                  onRowClick={(r) => openTier(r.t)}
                  selectedKey={tierDraft?.key ?? null}
                />
              )}
            </Panel>
          </>
        )}

        {tab === "log" && (
          <>
            <Toolbar
              right={
                <Btn variant="ghost" onClick={() => { sfxTick(); setLogNonce((n) => n + 1); }}>
                  새로고침
                </Btn>
              }
            >
              <SearchInput value={logQ} onChange={setLogQ} placeholder="이름 · 아이디 · 코드" />
            </Toolbar>
            {logs?.failed && !logsLoading && (
              <div className="mb-4">
                <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={() => setLogNonce((n) => n + 1)}>다시 불러오기</Btn>}>
                  초대 기록을 불러오지 못했습니다.
                </NoteLine>
              </div>
            )}
            {logsLoading && !logRows.length ? (
              <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
            ) : (
              <DataTable
                columns={logCols}
                rows={logRows}
                rowKey={(r) => r.inviteeId}
                onRowClick={(r) => setPick(r)}
                selectedKey={picked?.inviteeId ?? null}
                empty={logQuery ? "검색 결과가 없습니다." : "기록이 없습니다."}
              />
            )}
            {/* 쪽 넘김 — 50건씩. 「3 / 12 · 580건」 칸은 폭을 늘 잡아 단추가 흔들리지 않는다 */}
            {logTotal > 0 && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <Btn variant="ghost" size="sm" disabled={logPage <= 1 || logsLoading} onClick={() => goPage(logPage - 1)}>
                  이전
                </Btn>
                <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">
                  {fmt(logPage)} / {fmt(logPages)} · {fmt(logTotal)}건
                </span>
                <Btn variant="ghost" size="sm" disabled={logPage >= logPages || logsLoading} onClick={() => goPage(logPage + 1)}>
                  다음
                </Btn>
              </div>
            )}
          </>
        )}
      </AdminPage>

      {/* ── 단계 편집 — PC 오른쪽 칸 / 모바일 아래 판. [저장] · Enter 가 목록 반영 + 서버 저장을 한 번에 ── */}
      <DetailPane
        open={onConfig && !!tierDraft}
        onClose={closePane}
        title={!tierDraft ? "" : tierDraft.isNew ? "단계 추가" : `${tierIdx + 1}단계 편집`}
        footer={
          tierDraft && (
            <>
              <PaneError msg={paneErr} />
              {!tierDraft.isNew && (
                <Btn variant="ghost" className="mr-auto" onClick={() => askRemoveTier(tierDraft.key)} disabled={isSaving}>
                  삭제
                </Btn>
              )}
              <Btn variant="ghost" className={tierDraft.isNew ? "ml-auto" : ""} onClick={closePane}>
                취소
              </Btn>
              <Btn onClick={saveTierDraft} disabled={isSaving}>
                저장
              </Btn>
            </>
          )
        }
      >
        {tierDraft && (
          <>
            {/* 상세 칸은 PC · 모바일 두 벌로 그려져 id 가 겹친다 — label 로 감싸 짝을 짓는다 */}
            <label className="block">
              <span className={labelClass}>
                필요 인원 <Req />
              </span>
              <span className="flex items-center gap-2 text-[13px] text-[#5a5a5a]">
                <input
                  type="text"
                  inputMode="numeric"
                  data-pane-need
                  value={tierDraft.need}
                  onChange={(e) => editTierDraft({ ...tierDraft, need: e.target.value.replace(/\D/g, "").slice(0, String(NEED_MAX).length) })}
                  onKeyDown={(e) => enterKey(e, saveTierDraft)}
                  placeholder="예: 3"
                  className={numClass}
                />
                명
              </span>
            </label>
            <p className={fieldNote}>{draftNeedErr ? <span className="font-bold text-[#d01634]">{draftNeedErr}</span> : " "}</p>
            <RewardEditor
              rows={tierDraft.free}
              roles={grantableRoles}
              items={regItems}
              stateOf={itemStateOf}
              nextKey={nextRowKey}
              onChange={(v) => editTierDraft({ ...tierDraft, free: v })}
              onEnter={saveTierDraft}
            />
          </>
        )}
      </DetailPane>

      {/* ── 초대 기록 상세 — 줄을 누르면. 추첨권 미지급이면 아래 줄에 「다시 지급」 ── */}
      <DetailPane
        open={tab === "log" && !!picked}
        onClose={() => setPick(null)}
        title={picked ? picked.inviteeName || picked.inviteeId : ""}
        sub="초대 기록"
        footer={
          picked && (
            <>
              <Btn variant="ghost" className="ml-auto" onClick={() => setPick(null)}>
                닫기
              </Btn>
              {ticketStateOf(picked) === "pending" && (
                <Btn onClick={() => setRegrantAsk(picked)} disabled={regranting}>
                  다시 지급
                </Btn>
              )}
            </>
          )
        }
      >
        {picked && (
          <dl>
            <DefRow k="시각">
              <span className="tabular-nums">{isoLabel(picked.at)}</span>
            </DefRow>
            <DefRow k="초대한 사람">
              <UserCell name={picked.inviterName} id={picked.inviterId} />
            </DefRow>
            <DefRow k="들어온 친구">
              <UserCell name={picked.inviteeName} id={picked.inviteeId} />
            </DefRow>
            <DefRow k="코드">
              <span className="font-mono">{picked.code || "-"}</span>
            </DefRow>
            <DefRow k="서버 가입">
              <span className="tabular-nums">{isoLabel(picked.joinedAt)}</span>
            </DefRow>
            <DefRow k="추첨권">
              {picked.ticketsGrantedAt ? (
                <span className="tabular-nums">
                  지급 · {isoLabel(picked.ticketsGrantedAt)}
                  <span className="block mt-1 font-normal text-[#5a5a5a]">
                    초대한 사람 {fmt(picked.inviterTickets)}장 · 들어온 친구 {fmt(picked.inviteeTickets)}장
                  </span>
                </span>
              ) : picked.ticketsSkipped ? (
                <span>
                  해당 없음
                  <span className="block mt-1 font-normal text-[#5a5a5a]">{skipLabel(picked.ticketsSkipped)}</span>
                </span>
              ) : (
                "미지급"
              )}
            </DefRow>
          </dl>
        )}
      </DetailPane>

      {/* ── 단계 삭제 확인 — 저장된 단계만(새 단계는 확인 없이 닫는다). 확인하면 바로 저장 ── */}
      <ConfirmDialog
        open={deleteKey !== null}
        danger
        title="단계 삭제"
        confirmLabel="삭제"
        busy={isSaving}
        onCancel={() => setDeleteKey(null)}
        onConfirm={confirmRemoveTier}
        body={
          <>
            {deleteTier ? `${fmt(deleteTier.need)}명` : ""} 단계를 삭제하고 바로 저장합니다.
            <strong className="text-[#131313]"> 이미 지급된 보상은 회수되지 않습니다.</strong>
          </>
        }
      />

      {/* ── 추첨권 다시 지급 확인 ── */}
      <ConfirmDialog
        open={regrantAsk !== null}
        title="추첨권 다시 지급"
        confirmLabel="지급"
        busy={regranting}
        onCancel={() => setRegrantAsk(null)}
        onConfirm={doRegrant}
        body={
          regrantAsk ? (
            <>
              초대한 사람 <strong className="text-[#131313]">{regrantAsk.inviterName || regrantAsk.inviterId}</strong> · 들어온 친구{" "}
              <strong className="text-[#131313]">{regrantAsk.inviteeName || regrantAsk.inviteeId}</strong>
            </>
          ) : null
        }
      />

      {toastEl}
    </>
  );
}
