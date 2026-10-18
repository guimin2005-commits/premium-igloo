"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { playTone } from "@/lib/sfx";
import {
  AdminPage,
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
  inputClass,
  labelClass,
  fieldNote,
  ConfirmDialog,
  StatusChip,
  useAdminGuard,
  type Column,
} from "../ui";

// 📌 이벤트 패스 구성 화면 — 「유령 펭귄의 초대」(2026-10-17). 저장은 app/api/admin/event-pass, 계산 · 지급은 lib/eventPass.js.
//    틀은 시즌 패스 화면(app/admin/pass)과 같다 — 위 기본 설정 + 요약, 아래 단계 표, 바뀐 것이 있을 때만 뜨는 저장 줄(SaveBar).
//    📌 2026-10-17 운영자 "이벤트 전용 미션은 걍 없애자 · 기존처럼 XP만 채워도 얻을 수 있게" — 미션 표 · 편집 칸을 뺐다(진행도 = 기간 중 번 XP)
//      · 단계 — 무료 한 줄(프리미엄 없음) · 단계마다 보상 최대 4개. 보상 편집 부품은 시즌 패스 화면에서 옮겨 왔다(그 파일은 내보내지 않는다 — 고치면 같이)
//      · 필요 패스 XP — 표 · 편집 칸의 값은 "이 단계에 필요한 양", 저장은 누적(need). 시즌 패스와 같은 규칙(2026-10-01 운영자 "티어에 필요한 양으로")
//        필요량은 1 이상이라 누적이 늘 오름차순이다 — 시즌 패스의 정렬 확인 창이 필요 없다
//        삽입 · 삭제도 같은 규칙: 뒤 단계들은 각자의 필요량을 그대로 두고 누적만 같이 밀린다(삽입은 그만큼 올라가고, 삭제는 그만큼 내려온다)
//      · 저장 — 편집 칸 [저장] · Enter · 삭제 확인 · 저장 줄이 전부 한 PUT(설정 전체)으로 간다. tid 는 서버가 발급하고 화면은 되돌려 보내기만 한다
//      · 기간은 KST 로 받고 보낸다(브라우저 시간대와 상관없이) — 종료 시각은 들어가지 않는다([시작, 종료))
//      · 📌 아이템 보상 — 반영 전(초안에만 있는) 아이템도 고르고 저장한다(「반영 전」 칩). 보상 아이템이 하나라도 실사이트에 없으면 「사용」을 켤 수 없다
//        (지급은 실사이트 Item 만 — lib/eventPass.js). 어디에도 없는 아이템은 「찾을 수 없음」 칩 + 경고 한 줄. 상태 판정은 itemStateOf 한 곳
//    입력칸 · 표 · 상세 칸 · 확인 창 · 권한 화면은 전부 ../ui 의 공용 부품이다.

type RewardKind = "xp" | "point" | "role" | "item";
// 📌 days — 아이템 보상의 기간(일). 0 = 무기한, 아이템이 아닌 보상은 늘 0 (lib/seasonPass.js normalizeReward 와 같은 모양)
type Reward = { kind: RewardKind; amount: number; roleId: string; roleName: string; itemId: string; itemName: string; days: number };
// 📌 tid — 서버가 발급하는 단계 고유 식별자("t3"). 수령 기록(EventPassClaim.ref)이 이 값으로 남으므로 편집 · 삽입 · 삭제 어느 경로에서도 잃으면 안 된다.
//    새 단계만 빈 문자열로 보내 서버가 발급하게 한다. key 는 React 목록 전용 로컬 키(서버로 보내지 않는다)
type Tier = { key: string; tid: string; need: number; free: Reward[] };
// 편집 칸에서는 숫자 칸을 비울 수 있어야 해서 글자로 들고 있다가 저장할 때 숫자로 바꾼다
type DraftReward = { key: string; kind: RewardKind; amount: string; roleId: string; roleName: string; itemId: string; itemName: string; days: string };
// 초안은 단계를 번호가 아니라 key 로 가리킨다 — 편집 칸이 열린 채 삽입 · 삭제 · 표 안 편집이 일어나도 같은 단계를 따라간다
type TierDraft = { key: string; need: string; free: DraftReward[] };
// 저장할 한 벌 — 기간은 datetime-local 칸 글자(KST) 그대로 들고 있다가 보낼 때 ISO 로 바꾼다
type Cfg = { enabled: boolean; title: string; startsAt: string; endsAt: string; tiers: Tier[] };
// 저장을 누른 자리 — pane: 편집 칸(성공하면 닫고, 실패는 칸 안에 띄운다) / list: 표 · 설정 칸 · 저장 줄(토스트)
type SaveFrom = "pane" | "list";
type TierRow = { t: Tier; i: number };
// 받아 오는 목록 — 디스코드 역할(/api/discord-roles) · 등록 아이템(/api/admin/items)
//    📌 _draft — 초안 모드(localhost)의 목록 표시: "new" = 초안에만 있는 새 아이템(반영 전) · "edit" = 실사이트에 있고 고친 초안이 있음(지급은 실사이트 값)
type GuildRole = { id: string; name: string; color?: string; managed?: boolean };
type RegItem = { _id: string; name: string; type?: string; icon?: string; imageUrl?: string; color?: string; _draft?: string };
// 📌 아이템 보상 상태 — lib/eventPass.js eventItemStates 와 같은 낱말. live: 실사이트에 있음 · draft: 반영 전(초안에만) · missing: 어디에도 없음
//    지급은 실사이트 Item 만 — 보상 아이템이 하나라도 live 가 아니면 「사용」을 켤 수 없다(서버 PUT 도 같은 검사)
type ItemState = "live" | "draft" | "missing";
const ITEM_STATES: ItemState[] = ["live", "draft", "missing"];
// 서버 itemStates({ id: 상태 }) 정리 — 모르는 값은 버린다
const statesFrom = (v: unknown): Record<string, ItemState> => {
  const out: Record<string, ItemState> = {};
  for (const [id, s] of Object.entries(rawOf(v))) {
    const st = ITEM_STATES.find((x) => x === s);
    if (st) out[id] = st;
  }
  return out;
};
// 📌 lib/eventPass.js draftItemsMessage · missingItemsMessage 와 같은 글자 — 바꾸면 같이(서버가 같은 문구로 돌려보낸다)
const draftItemsMessage = (names: string[]) =>
  `반영 전 아이템 ${names.length}개(${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` 외 ${names.length - 3}개` : ""}) — 상점 관리에서 실사이트 반영 후 켤 수 있습니다.`;
const missingItemsMessage = (n: number) => `찾을 수 없는 보상 아이템 ${n}개 — 다시 고르거나 지워 주십시오.`;
// 서버가 준 값(정리 전) — 칸 이름만 믿고 값은 정리 함수가 다시 맞춘다
type Raw = Record<string, unknown>;
const rawOf = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});
const rawList = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(rawOf) : []);

// 단계마다 보상 수 상한 — lib/seasonPass.js MAX_REWARDS 와 같아야 한다(서버가 넘치는 것을 잘라 버린다)
const MAX_REWARDS = 4;
// 단계 수 상한 — lib/seasonPass.js MAX_TIERS(lib/eventPass.js normalizeEventTiers 가 그대로 쓴다)
const MAX_TIERS = 100;
// 단계 누적 · 보상 수량 상한 — lib/seasonPass.js num 의 max(넘는 값은 조용히 깎이지 않게 화면에서 막는다)
const MAX_NUM = 1_000_000_000;
// 아이템 보상 기간 상한(일) — lib/seasonPass.js MAX_REWARD_DAYS
const MAX_DAYS = 3650;
const KST_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const KIND_OPTIONS: { v: RewardKind; l: string }[] = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "role", l: "역할" },
  { v: "item", l: "아이템" },
];

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주십시오.";
const OVER_MAX_MSG = "누적 필요 패스 XP가 10억을 넘습니다. 필요량을 줄여 주십시오.";

const toInt = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ── 숫자 읽기 ─────────────────────────────────
// 📌 시즌 패스 화면과 같은 규칙 — "5만" · "1.5만" · "5천만" · "50k" · "50,000" · "5만xp" 를 다 받는다. 못 읽으면 NaN(호출부가 그 자리에서 알린다)
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
// 입력칸에 다시 넣을 숫자 — parseAmount 로 되읽으므로 자리 표시를 "50,000" 으로 고정한다(지역 설정을 따르면 소수점으로 읽힌다)
const fmtNum = (n: number) => n.toLocaleString("ko-KR");
const needError = (n: number) =>
  !Number.isFinite(n)
    ? "필요 패스 XP를 읽을 수 없습니다 (예: 5만 · 50k)"
    : n < 1
      ? "필요 패스 XP는 1 이상이어야 합니다"
      : n > MAX_NUM
        ? "필요 패스 XP는 10억 이하여야 합니다"
        : "";

// ── 단계마다 필요한 양 ─────────────────────────
// 앞 단계와의 차이 = 이 단계의 필요량(저장값은 누적 need)
const stepAt = (list: Tier[], i: number) => list[i].need - (i > 0 ? list[i - 1].need : 0);
// key 단계의 필요량을 step 으로 — 뒤 단계들은 각자의 필요량을 그대로 두고 누적만 같이 밀린다
const withStep = (list: Tier[], key: string, step: number) => {
  const i = list.findIndex((t) => t.key === key);
  if (i < 0) return list;
  const d = step - stepAt(list, i);
  return d === 0 ? list : list.map((t, j) => (j >= i ? { ...t, need: t.need + d } : t));
};
const overMax = (list: Tier[]) => list.some((t) => t.need > MAX_NUM);
// 가장 흔한 필요량 — 삽입 · 추가의 기본값. 오르는 간격이 하나도 없으면 0
const commonStep = (list: Tier[]) => {
  const count = new Map<number, number>();
  for (let i = 0; i < list.length; i++) {
    const d = stepAt(list, i);
    if (d > 0) count.set(d, (count.get(d) || 0) + 1);
  }
  let best = 0;
  let bestN = 0;
  for (const [d, n] of count) if (n > bestN || (n === bestN && d < best)) [best, bestN] = [d, n];
  return best;
};

// ── 기간(KST) ─────────────────────────────────
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
// 변경 목록 표시 — "10. 18. 00:00"
const kstLabel = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? `${v.slice(5, 7)}. ${v.slice(8, 10)}. ${v.slice(11, 16)}` : "없음");

// ── 효과음 ─────────────────────────────────────
// 📌 시즌 패스 · 봇 메시지 화면과 같은 소리 한 벌 — 저장 성공 · 실패 · 목록만 바뀐 조작(추가 · 삽입 · 순서)
const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};
const sfxTick = () => playTone(740, 0.06, "sine", 0.03);

// ── Enter 로 저장 ──────────────────────────────
// 📌 한글 조합 중 Enter(isComposing · keyCode 229)는 조합을 끝내는 키다 — 저장으로 받지 않는다. 눌러 둔 채 반복되는 Enter 도 넘긴다
const imeBusy = (e: ReactKeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
// 이벤트 안에서 부른다 — onKeyDown={(e) => enterKey(e, save)}
const enterKey = (e: ReactKeyboardEvent<HTMLInputElement>, fn: () => void) => {
  if (e.key !== "Enter" || imeBusy(e)) return;
  e.preventDefault();
  if (!e.repeat) fn();
};

// ── 보상 정리 · 표시 ─────────────────────────────
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
// 옛 모양(객체 하나)도 목록으로 읽는다
const normRewards = (v: unknown): Reward[] => {
  const list = Array.isArray(v) ? v.map(rawOf) : v && typeof v === "object" ? [rawOf(v)] : [];
  return list.map(normReward).filter((r): r is Reward => !!r).slice(0, MAX_REWARDS);
};
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
const listLabel = (list: Reward[], roleNameOf: (id: string) => string, itemOf: (id: string) => RegItem | null) =>
  list.length ? list.map((r) => rewardLabel(r, roleNameOf, itemOf)).join(" · ") : "없음";

// ── 지문 ───────────────────────────────────────
// 📌 저장 여부를 가를 지문 — 서버로 나가는 값만 담는다(로컬 key 는 뺀다).
//    이름 스냅샷(roleName · itemName)도 뺀다 — 서버가 실사이트 이름(없으면 초안 이름)으로 다시 채워, 로컬(초안) 이름과 다르면 저장 직후에도 "변경됨"이 남는다
const rewardSig = (r: Reward) => ({ kind: r.kind, amount: r.amount, roleId: r.roleId, itemId: r.itemId, days: r.days });
const sig = (c: Cfg) =>
  JSON.stringify({
    enabled: c.enabled,
    title: c.title.trim(),
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    tiers: c.tiers.map((t) => ({ tid: t.tid, need: t.need, free: t.free.map(rewardSig) })),
  });

// 저장 전 검사 — 서버가 돌려보내거나 조용히 고쳐 버릴 값을 먼저 막는다. 괜찮으면 빈 문자열
const checkCfg = (c: Cfg) => {
  const title = c.title.trim();
  if (!title) return "제목을 입력해 주십시오.";
  if (title.length > 40) return "제목은 40자 이하로 입력해 주십시오.";
  const s = fromKstInput(c.startsAt);
  const e = fromKstInput(c.endsAt);
  if (!s || !e) return "기간을 입력해 주십시오.";
  if (Date.parse(e) <= Date.parse(s)) return "종료 시각은 시작 시각 이후로 지정해 주십시오.";
  const all = c.tiers.flatMap((t) => t.free);
  if (all.some((r) => r.kind === "role" && !r.roleId)) return "역할이 지정되지 않은 보상이 있습니다.";
  if (all.some((r) => r.kind === "item" && !r.itemId)) return "아이템이 지정되지 않은 보상이 있습니다.";
  const zero = c.tiers.findIndex((_, i) => stepAt(c.tiers, i) <= 0);
  if (zero >= 0) return `${zero + 1}단계의 필요 패스 XP가 0입니다. 1 이상으로 고쳐 주십시오.`;
  if (overMax(c.tiers)) return OVER_MAX_MSG;
  return "";
};

const onOffLabel = (v: boolean) => (v ? "운영 중" : "중단");

// ── 알림 줄 ───────────────────────────────────
// 📌 시즌 패스 화면과 같은 모양 — 공용 상태 칩과 같은 색 한 벌. 페이지 위에서는 둥근 판, 패널 안에서는(inset) 선으로 나눈 한 줄
function NoteLine({ tone, action, inset = false, children }: { tone: "bad" | "warn" | "neutral"; action?: ReactNode; inset?: boolean; children: ReactNode }) {
  const toneCls =
    tone === "bad" ? "bg-[#e91e3f]/[0.08] text-[#d01634]" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#f2f2f2] text-[#5a5a5a]";
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

// ── 표 안의 필요 패스 XP 칸 ─────────────────────
// 📌 시즌 패스 화면의 NeedInput 과 같다 — PC 표에서 단계마다 바로 고친다. 칸을 벗어나면 목록에만 반영(저장 줄), Enter 면 그 자리에서 저장.
//    ↑ ↓ 는 위 · 아래 단계 칸으로, Esc 는 고치기 전 값으로. 모듈 스코프에 둔다(페이지 안에서 정의하면 렌더마다 새 컴포넌트가 되어 포커스가 날아간다)
const NEED_INPUT =
  "w-28 h-8 px-2.5 rounded-lg border bg-white text-[13px] font-black text-right tabular-nums text-[#131313] outline-none transition-colors focus:ring-2 focus:ring-[#131313]/10";

function NeedInput({
  tierKey,
  tierNo,
  value,
  warn,
  busy,
  onCommit,
  onSubmit,
  onInvalid,
}: {
  tierKey: string;
  tierNo: number;
  value: number;
  warn: boolean;
  busy: boolean;
  onCommit: (n: number) => void;
  onSubmit: (n: number) => void;
  onInvalid: (msg: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const clickFocus = useRef(false);
  // 바깥(되돌리기 · 저장 응답 · 삽입)에서 값이 바뀌면 들고 있던 입력 글자를 버린다
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (text != null && parseAmount(text) !== value) setText(null);
  }
  const shown = text ?? fmtNum(value);
  const go = (el: HTMLInputElement, d: 1 | -1) => {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-need-key]")).filter((x) => x.offsetParent !== null);
    all[all.indexOf(el) + d]?.focus();
  };
  return (
    <input
      type="text"
      data-need-key={tierKey}
      value={shown}
      readOnly={busy}
      aria-label={`${tierNo}단계 필요 패스 XP`}
      aria-invalid={bad || warn || undefined}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        clickFocus.current = document.activeElement !== e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (clickFocus.current) e.preventDefault();
        clickFocus.current = false;
      }}
      onFocus={(e) => {
        setText(fmtNum(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        setBad(false);
      }}
      onBlur={() => {
        if (text == null) return;
        const n = parseAmount(text);
        setText(null);
        setBad(false);
        if (n === value) return;
        const err = needError(n);
        if (err) onInvalid(`${tierNo}단계: ${err} — 되돌렸습니다`);
        else onCommit(n);
      }}
      onKeyDown={(e) => {
        if (imeBusy(e)) return;
        const el = e.currentTarget;
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.repeat || busy) return;
          const n = parseAmount(text ?? fmtNum(value));
          const err = needError(n);
          if (err) {
            setBad(true);
            onInvalid(`${tierNo}단계: ${err}`);
            return;
          }
          setText(fmtNum(n));
          onSubmit(n);
        } else if (e.key === "Escape") {
          e.preventDefault();
          setText(fmtNum(value));
          setBad(false);
          setTimeout(() => el.select(), 0);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          go(el, e.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className={`${NEED_INPUT} ${bad || warn ? "border-[#e91e3f] focus:border-[#e91e3f]" : "border-[#a3a3a3] hover:border-[#131313] focus:border-[#131313]"}`}
    />
  );
}

// ── 보상 편집 ─────────────────────────────────
// 📌 시즌 패스 화면의 RewardFields · TrackEditor 를 무료 한 줄로 옮긴 것. 상세 칸 안에서 입력값을 다루므로 반드시 모듈 스코프에 둔다.
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

// 보상 목록(최대 4줄) — 줄마다 종류 + 값, 오른쪽 위에 위로 · 아래로 · 삭제. 유저는 단계 단위로 한 번에 받는다
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

// 편집 칸 아래 오류 한 줄 — 저장 단추 위에 붙는다
const PaneError = ({ msg }: { msg: string }) =>
  msg ? (
    <p role="alert" className="w-full text-[12px] font-bold text-[#d01634] break-keep">
      ⚠ {msg}
    </p>
  ) : null;

export default function AdminEventPassPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/event-pass 가 서버에서 한다(getServerSession + isAdminName)
  const { isAdmin, gate } = useAdminGuard();

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 📌 연타 막이 — isSaving 은 다음 렌더에야 보여서 같은 틈에 두 번 들어오는 Enter · 클릭을 못 막는다
  const savingRef = useRef(false);

  const [guildRoles, setGuildRoles] = useState<GuildRole[]>([]);
  const [regItems, setRegItems] = useState<RegItem[]>([]);
  // 아이템 목록을 제대로 받았는가 — 못 받았으면 목록에 없다고 「찾을 수 없음」으로 치지 않는다
  const [itemsOk, setItemsOk] = useState(false);
  // 저장된 단계의 아이템 보상 상태(서버 itemStates — 불러오기 · 저장 응답). 아직 저장 안 한 고른 아이템은 목록의 _draft 로 가른다(itemStateOf)
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [rolesFailed, setRolesFailed] = useState(false);
  // 아직 tid 가 없는 새 단계와 보상 줄에 붙일 로컬 키 발급기(저장 body 에는 나가지 않는다)
  const newKeyRef = useRef(0);
  const nextRowKey = useCallback(() => `r:${++newKeyRef.current}`, []);

  // 📌 기본 꺼짐 — 불러오기에 실패했을 때 실수로 켜진 채 저장되는 일을 막는다(모델 기본값과 같음)
  const [eventKey, setEventKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [tiers, setTiers] = useState<Tier[]>([]);
  // 불러온(저장한) 한 벌 — 변경 목록 · 빨간 점 · 되돌리기의 기준
  const [base, setBase] = useState<Cfg | null>(null);
  // 불러온 시각 — 상태(시작 전 · 진행 중 · 종료) 판정용. 렌더 중에 Date.now() 를 부르지 않는다
  const [loadedAt, setLoadedAt] = useState(0);

  const [tierDraft, setTierDraft] = useState<TierDraft | null>(null);
  const [paneErr, setPaneErr] = useState("");
  const [deleteTierKey, setDeleteTierKey] = useState<string | null>(null);
  // 단계 추가 · 삽입 뒤 그 줄의 필요 패스 XP 칸으로 커서를 옮긴다(PC) — 다음 렌더(줄이 생긴 뒤)에 읽는다
  const focusKeyRef = useRef<string | null>(null);

  const paneOpen = !!tierDraft;
  const paneOpenRef = useRef(false);
  useEffect(() => {
    paneOpenRef.current = paneOpen;
  }, [paneOpen]);

  // 📌 결과 토스트 + 효과음 — 시즌 패스 화면과 같은 모양 · 같은 자리(저장 줄이 떠 있으면 그 위로)
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );
  const showToast = useCallback((msg: string, tone: "ok" | "err" | "info" = "ok") => {
    setToast({ msg, error: tone === "err" });
    if (tone === "err") sfxErr();
    else if (tone === "ok") sfxOk();
    else sfxTick();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), tone === "err" ? 4000 : 2600);
  }, []);

  // 봇이 실제로 붙일 수 있는 역할만 — 디스코드가 관리하는 역할(부스트 등)은 지급이 불가능하다
  const grantableRoles = useMemo(() => guildRoles.filter((r) => !r.managed), [guildRoles]);
  const roleNameOf = useCallback((id: string) => guildRoles.find((r) => r.id === id)?.name || "", [guildRoles]);
  const itemOf = useCallback((id: string) => regItems.find((it) => it._id === id) || null, [regItems]);
  // 📌 아이템 보상 상태 한 곳 — 고르기 목록 · 표 칩 · 「사용」 잠금 · 경고 줄이 전부 이것을 본다(서로 다르게 말하지 않게).
  //    서버 값(저장된 단계 — 실사이트 · 초안을 직접 물은 값)이 먼저, 없으면 목록(_draft "new" = 반영 전). 목록에도 없으면 missing(목록을 받았을 때만)
  //    실사이트에 있고 삭제 예정 초안만 있는 아이템은 목록에서 빠지지만 서버 값이 live 라 그대로 지급된다
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
  // 서버 모양(pass) → 화면 상태. keep — 방금 저장하며 보낸 한 벌. 돌려받은 순서가 같으면 줄 key 를 그대로 잇는다
  //    (새 단계가 tid 를 받으며 key 가 바뀌면 그 줄이 새로 그려져 Enter 로 저장한 칸의 포커스가 날아간다)
  const applyConfig = useCallback((pass: unknown, keep?: Cfg) => {
    const p = rawOf(pass);
    const rawT = rawList(p.tiers);
    const kt = keep?.tiers;
    const reuseT = !!kt && kt.length === rawT.length && kt.every((k, i) => !k.tid || k.tid === String(rawT[i]?.tid || ""));
    const nextTiers: Tier[] = rawT.map((t, i) => {
      const tid = String(t.tid || "");
      return { key: reuseT && kt ? kt[i].key : tid ? `t:${tid}` : `new:${++newKeyRef.current}`, tid, need: toInt(t.need), free: normRewards(t.free) };
    });
    const cfg: Cfg = {
      enabled: p.enabled === true,
      title: String(p.title || ""),
      startsAt: toKstInput(p.startsAt),
      endsAt: toKstInput(p.endsAt),
      tiers: nextTiers,
    };
    setEventKey(String(p.key || ""));
    setEnabled(cfg.enabled);
    setTitle(cfg.title);
    setStartsAt(cfg.startsAt);
    setEndsAt(cfg.endsAt);
    setTiers(cfg.tiers);
    setBase(cfg);
    setLoadedAt(Date.now());
    return { tierKeys: new Set(nextTiers.map((t) => t.key)) };
  }, []);

  // 📌 역할 목록만 다시 받는다 — 전체 재조회로 하면 저장하지 않은 편집이 서버 값으로 덮인다
  const fetchRoles = useCallback(() => {
    fetch("/api/discord-roles", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null)
      .then((roles) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRolesFailed(roleList.length === 0);
      });
  }, []);

  const closePanes = useCallback(() => {
    setTierDraft(null);
    setPaneErr("");
  }, []);

  // 📌 읽기만 — 상태는 응답을 받은 뒤에만 바꾼다(첫 화면은 effect 에서 부른다 — 불러오는 중 · 닫힌 칸이 이미 기본값이다)
  const load = useCallback(() => {
    Promise.all([
      fetch("/api/admin/event-pass", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([cfg, roles, reg]) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRolesFailed(roleList.length === 0);
        const regOk = reg?.success === true && Array.isArray(reg?.data);
        setRegItems(regOk ? reg.data : []);
        setItemsOk(regOk);
        if (cfg?.ok && cfg.pass) {
          applyConfig(cfg.pass);
          setItemStates(statesFrom(cfg.itemStates));
          setLoadFailed(false);
        } else {
          // 📌 응답이 깨졌을 때 — 화면은 열어 두되 빈 구성이 운영 설정을 덮어쓰지 않게 저장을 잠근다
          setLoadFailed(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [applyConfig]);
  // [다시 불러오기] — 목록이 서버 값으로 바뀌면 열린 편집 칸이 엉뚱한 값을 들고 있게 되므로 먼저 닫는다
  const fetchAll = () => {
    closePanes();
    setIsLoading(true);
    load();
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  // 단계 추가 · 삽입 뒤 — 새 줄의 필요 패스 XP 칸에 커서를 둔다(PC). 모바일 줄 카드에는 칸이 없어 건너뛴다
  useEffect(() => {
    const k = focusKeyRef.current;
    if (!k) return;
    focusKeyRef.current = null;
    const el = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-need-key="${CSS.escape(k)}"]`)).find((x) => x.offsetParent !== null);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus();
  }, [tiers]);

  // PC 편집 칸이 열리면 필요 패스 XP 칸에 커서. 모바일은 자판이 판을 덮어 두지 않는다
  const tierKey = tierDraft?.key ?? null;
  useEffect(() => {
    if (!tierKey || !window.matchMedia("(min-width: 768px)").matches) return;
    const el = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-pane-need]")).find((x) => x.offsetParent !== null);
    el?.focus();
    el?.select();
  }, [tierKey]);

  const cur: Cfg = { enabled, title, startsAt, endsAt, tiers };
  const snapshot = useMemo(() => (base ? sig(base) : ""), [base]);
  const isDirty = !isLoading && !!base && sig(cur) !== snapshot;

  // ── 켜기 잠금 · 경고 ─────────────────────────
  // 📌 보상 아이템이 하나라도 실사이트에 없으면(반영 전 · 찾을 수 없음) 「사용」을 켤 수 없다 — 지급은 실사이트 Item 만 한다.
  //    서버 PUT 도 같은 검사 · 같은 문구로 돌려보낸다(app/api/admin/event-pass). 반영 전이 있으면 그 문구, 없고 찾을 수 없는 것만 있으면 그 문구
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
  const lock = enableLockOf(tiers);
  // 잠금이 걸린 동안 창으로 돌아오면(상점 관리에서 반영하고 온 뒤) 아이템 목록 · 상태만 다시 받는다 —
  //    설정은 다시 받지 않는다(저장하지 않은 편집을 서버 값으로 덮지 않게)
  const lockOn = !!lock.msg;
  useEffect(() => {
    if (!isAdmin || !lockOn) return;
    const refresh = () => {
      Promise.all([
        fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/admin/event-pass", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]).then(([reg, cfg]) => {
        if (reg?.success === true && Array.isArray(reg?.data)) {
          setRegItems(reg.data);
          setItemsOk(true);
        }
        if (cfg?.ok) setItemStates(statesFrom(cfg.itemStates));
      });
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [isAdmin, lockOn]);

  // ── 저장 줄에 띄울 변경 목록 ─────────────────
  // 📌 불러온 한 벌과 지금 값을 맞대어 한 줄씩. 단계는 tid 로 짝을 지어 추가 · 삭제 · 수정을 가린다(보여 주기 전용)
  const changes: string[] = [];
  const enabledChanged = !!base && base.enabled !== enabled;
  const titleChanged = !!base && base.title.trim() !== title.trim();
  const periodChanged = !!base && (base.startsAt !== startsAt || base.endsAt !== endsAt);
  if (base && isDirty) {
    if (enabledChanged) changes.push(`상태 ${onOffLabel(base.enabled)} → ${onOffLabel(enabled)}`);
    if (titleChanged) changes.push(`제목 ${base.title.trim() || "없음"} → ${title.trim() || "없음"}`);
    if (base.startsAt !== startsAt) changes.push(`시작 ${kstLabel(base.startsAt)} → ${kstLabel(startsAt)}`);
    if (base.endsAt !== endsAt) changes.push(`종료 ${kstLabel(base.endsAt)} → ${kstLabel(endsAt)}`);
    const tierAt = new Map<string, number>();
    base.tiers.forEach((t, i) => {
      if (t.tid) tierAt.set(t.tid, i);
    });
    const nowTids = new Set(tiers.map((t) => t.tid).filter(Boolean));
    const freeSig = (list: Reward[]) => JSON.stringify(list.map(rewardSig));
    tiers.forEach((t, i) => {
      const bi = t.tid ? tierAt.get(t.tid) : undefined;
      if (bi == null) {
        changes.push(`${i + 1}단계 추가`);
        return;
      }
      const b = base.tiers[bi];
      const bs = stepAt(base.tiers, bi);
      const s = stepAt(tiers, i);
      if (bs !== s) changes.push(`${i + 1}단계 필요 패스 XP ${bs.toLocaleString()} → ${s.toLocaleString()}`);
      if (freeSig(b.free) !== freeSig(t.free)) changes.push(`${i + 1}단계 보상 ${listLabel(b.free, roleNameOf, itemOf)} → ${listLabel(t.free, roleNameOf, itemOf)}`);
    });
    base.tiers.forEach((b, i) => {
      if (b.tid && !nowTids.has(b.tid)) changes.push(`${i + 1}단계 삭제`);
    });
  }

  // ── 저장 ────────────────────────────────────
  // 실패 알림 — 편집 칸에서 누른 저장이면 칸 안(저장 단추 위)에, 그 밖은 토스트로
  const fail = (msg: string, from: SaveFrom) => {
    if (from === "pane" && paneOpenRef.current) {
      setPaneErr(msg);
      sfxErr();
    } else {
      showToast(msg, "err");
    }
  };

  const doSave = async (cfg: Cfg, from: SaveFrom, okMsg = "저장되었습니다.") => {
    if (savingRef.current) return;
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    savingRef.current = true;
    setIsSaving(true);
    // 표시용 이름 스냅샷 — 지금 목록의 이름으로 채워 보낸다(아이템 이름은 서버가 실사이트 이름 — 없으면 초안 이름으로 다시 채운다)
    const named = (r: Reward): Reward => ({
      ...r,
      roleName: r.kind === "role" ? roleNameOf(r.roleId) || r.roleName : "",
      itemName: r.kind === "item" ? itemOf(r.itemId)?.name || r.itemName : "",
    });
    const res = await fetch("/api/admin/event-pass", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: cfg.enabled,
        title: cfg.title.trim(),
        startsAt: fromKstInput(cfg.startsAt),
        endsAt: fromKstInput(cfg.endsAt),
        // 📌 기존 단계의 tid 를 그대로 되돌려 보낸다 — 빠지면 서버가 새 번호를 발급해 이미 받은 단계가 미수령으로 되살아난다
        tiers: cfg.tiers.map((t, i) => ({ tid: t.tid || "", level: i + 1, need: t.need, free: t.free.map(named) })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    savingRef.current = false;
    setIsSaving(false);

    if (res?.ok && d?.ok && d.pass) {
      // 응답에는 서버가 새로 발급한 tid 가 들어 있다 — 그대로 받아 기준(base)도 갈아 끼운다(저장 줄이 닫힌다)
      const keys = applyConfig(d.pass, cfg);
      setItemStates(statesFrom(d.itemStates));
      if (from === "pane") closePanes();
      else setTierDraft((dr) => (dr && keys.tierKeys.has(dr.key) ? dr : null));
      setLoadFailed(false);
      showToast(okMsg);
    } else {
      fail(d?.error || "저장에 실패했습니다.", from);
    }
  };

  // 📌 모든 저장의 입구 — 저장 줄 · Enter · 편집 칸 [저장] · 삭제 확인이 전부 여기로 온다.
  //    over 로 넘긴 값(편집 칸에서 막 고친 단계)을 화면 상태에 얹어 한 벌로 검사 · 저장한다
  const requestSave = (over: Partial<Cfg>, from: SaveFrom, okMsg?: string) => {
    if (savingRef.current) return;
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    const cfg: Cfg = { ...cur, ...over };
    if (sig(cfg) === snapshot) {
      if (from === "pane") closePanes();
      return showToast("변경 사항이 없습니다.", "info");
    }
    const err = checkCfg(cfg);
    if (err) return fail(err, from);
    // 📌 켜진 채 저장(켜기 · 켜져 있는 동안의 저장) — 보상 아이템이 전부 실사이트에 있어야 한다(위 켜기 잠금 · 서버와 같은 검사). 끄는 저장은 늘 된다
    const locked = cfg.enabled ? enableLockOf(cfg.tiers).msg : "";
    if (locked) return fail(locked, from);
    doSave(cfg, from, okMsg);
  };
  const saveList = () => requestSave({}, "list");

  // ── 단계 조작 ────────────────────────────────
  // 📌 저장 응답이 목록을 서버 값으로 갈아 끼우므로 저장 중에는 추가 · 삽입 · 삭제를 받지 않는다(시즌 패스 화면과 같다)
  //    afterKey 뒤에 새 단계 — null 이면 맨 끝. 새 단계의 필요량 = 기준 단계의 필요량(0 이하면 가장 흔한 필요량, 그것도 없으면 5,000).
  //    뒤 단계들은 그 필요량만큼 누적이 같이 오른다. 반환: 새 단계 key · 필요량(실패면 null)
  const insertTier = (afterKey: string | null) => {
    if (savingRef.current) return null;
    if (tiers.length >= MAX_TIERS) {
      showToast(`단계는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`, "err");
      return null;
    }
    const i = afterKey == null ? tiers.length - 1 : tiers.findIndex((t) => t.key === afterKey);
    const ref = i >= 0 ? stepAt(tiers, i) : 0;
    const step = ref > 0 ? ref : commonStep(tiers) || 5000;
    const at = i + 1;
    const key = `new:${++newKeyRef.current}`;
    const next: Tier[] = [
      ...tiers.slice(0, at),
      // tid 는 빈 문자열 — 저장할 때 서버가 새로 발급한다
      { key, tid: "", need: (i >= 0 ? tiers[i].need : 0) + step, free: [] },
      ...tiers.slice(at).map((t) => ({ ...t, need: t.need + step })),
    ];
    if (overMax(next)) {
      showToast(OVER_MAX_MSG, "err");
      return null;
    }
    setTiers(next);
    focusKeyRef.current = key;
    showToast(`${at + 1}단계를 추가했습니다.`, "info");
    return { key, step };
  };

  // 목록에서만 뺀다 — 뒤 단계들은 뺀 단계의 필요량만큼 누적이 내려온다(각자의 필요량은 그대로). 열려 있던 그 단계의 편집 칸도 닫는다
  const removeTierLocal = (key: string) => {
    const i = tiers.findIndex((t) => t.key === key);
    const d = i >= 0 ? Math.max(0, stepAt(tiers, i)) : 0;
    const next = tiers.filter((t) => t.key !== key).map((t, j) => (i >= 0 && j >= i ? { ...t, need: t.need - d } : t));
    setTiers(next);
    setTierDraft((dr) => (dr?.key === key ? null : dr));
    return { next, no: i + 1 };
  };
  const askRemoveTier = (key: string) => {
    if (savingRef.current) return;
    const t = tiers.find((x) => x.key === key);
    if (!t) return;
    // 아직 저장 안 한 새 단계는 받은 사람이 없어 잃을 게 없다 — 확인 없이 바로 뺀다
    if (!t.tid) {
      const { no } = removeTierLocal(key);
      return showToast(`${no}단계를 삭제했습니다.`, "info");
    }
    setDeleteTierKey(key);
  };
  const confirmRemoveTier = () => {
    if (!deleteTierKey || savingRef.current) return;
    const { next, no } = removeTierLocal(deleteTierKey);
    setDeleteTierKey(null);
    // 확인을 받았으니 바로 저장한다(확인 뒤에 저장 줄을 또 누르지 않게)
    requestSave({ tiers: next }, "list", `${no}단계를 삭제했습니다.`);
  };

  // 표 안 필요 패스 XP — 칸을 벗어나면 목록에만, Enter 면 저장까지
  const commitNeed = (key: string, step: number) => {
    const next = withStep(tiers, key, step);
    if (overMax(next)) {
      showToast(OVER_MAX_MSG, "err");
      return null;
    }
    setTiers(next);
    // 같은 단계의 편집 칸이 열려 있으면 그 칸 값도 맞춘다 — 칸에서 저장할 때 옛 값으로 덮지 않게
    setTierDraft((dr) => (dr && dr.key === key ? { ...dr, need: fmtNum(step) } : dr));
    return next;
  };
  const submitNeed = (key: string, step: number) => {
    const next = commitNeed(key, step);
    if (next) requestSave({ tiers: next }, "list");
  };

  const toTierDraft = (t: Tier, i: number): TierDraft => ({
    key: t.key,
    need: fmtNum(stepAt(tiers, i)),
    free: t.free.map((r) => ({
      key: nextRowKey(),
      kind: r.kind,
      amount: r.amount ? String(r.amount) : "",
      roleId: r.roleId,
      roleName: r.roleName,
      itemId: r.itemId,
      itemName: r.itemName,
      days: r.days > 0 ? String(r.days) : "",
    })),
  });
  // 줄 키를 뺀 초안 내용 — 편집 칸에서 고친 것이 있는지 가른다
  const draftPlain = (d: TierDraft) => JSON.stringify([d.need, d.free.map((r) => [r.kind, r.amount, r.roleId, r.itemId, r.days])]);
  const pickTier = (key: string) => {
    if (tierDraft?.key === key) return;
    const i = tiers.findIndex((x) => x.key === key);
    if (i < 0) return;
    setPaneErr("");
    setTierDraft(toTierDraft(tiers[i], i));
  };
  const editTierDraft = (d: TierDraft) => {
    setTierDraft(d);
    setPaneErr("");
  };
  // 편집 칸 [삽입] — 이 단계 뒤에 새 단계를 넣고 칸을 새 단계로 옮긴다. 고치던 내용이 있으면 먼저 저장하게 한다(말없이 버리지 않게)
  const insertFromPane = () => {
    if (!tierDraft) return;
    const i = tiers.findIndex((x) => x.key === tierDraft.key);
    if (i < 0) return;
    if (draftPlain(tierDraft) !== draftPlain(toTierDraft(tiers[i], i))) return fail("편집 중인 내용을 먼저 저장해 주십시오.", "pane");
    const made = insertTier(tierDraft.key);
    if (!made) return;
    setPaneErr("");
    setTierDraft({ key: made.key, need: fmtNum(made.step), free: [] });
  };

  // 편집 칸 [저장] · Enter — 칸의 값을 검사해 목록에 얹고 그대로 저장한다
  const saveTierDraft = () => {
    if (!tierDraft) return;
    const need = parseAmount(tierDraft.need);
    const ne = needError(need);
    if (ne) return fail(ne, "pane");
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
    const stepped = withStep(tiers, tierDraft.key, need);
    if (overMax(stepped)) return fail(OVER_MAX_MSG, "pane");
    const next = stepped.map((t) => (t.key === tierDraft.key ? { ...t, free: tierDraft.free.slice(0, MAX_REWARDS).map(fromDraft) } : t));
    requestSave({ tiers: next }, "pane");
  };

  // 📌 되돌리기 — 불러온(저장한) 한 벌로. 줄 key 도 그대로라 표가 흔들리지 않는다
  const resetToBase = () => {
    if (!base) return;
    closePanes();
    setEnabled(base.enabled);
    setTitle(base.title);
    setStartsAt(base.startsAt);
    setEndsAt(base.endsAt);
    setTiers(base.tiers);
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다
  if (gate) return gate;

  const maxNeed = tiers.length ? tiers[tiers.length - 1].need : 0;
  const rewardCount = tiers.reduce((s, t) => s + t.free.length, 0);
  const emptyTierCount = tiers.filter((t) => !t.free.length).length;
  const tierIdx = tierDraft ? tiers.findIndex((t) => t.key === tierDraft.key) : -1;
  const deleteTierNo = deleteTierKey ? tiers.findIndex((t) => t.key === deleteTierKey) + 1 : 0;

  // 기간 — 상태(시작 전 · 진행 중 · 종료)와 길이. 불러온 시각 기준(렌더 중 시계를 읽지 않는다)
  const startMs = Date.parse(fromKstInput(startsAt));
  const endMs = Date.parse(fromKstInput(endsAt));
  const periodOk = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const phase = !enabled ? "중단" : !periodOk || !loadedAt ? "-" : loadedAt < startMs ? "시작 전" : loadedAt < endMs ? "진행 중" : "종료";
  const periodHint = (() => {
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return <span className="font-bold text-[#d01634]">기간을 입력해 주십시오.</span>;
    if (endMs <= startMs) return <span className="font-bold text-[#d01634]">종료 시각은 시작 시각 이후로 지정해 주십시오.</span>;
    const h = Math.round((endMs - startMs) / HOUR_MS);
    const dd = Math.floor(h / 24);
    const hh = h % 24;
    return `KST · 종료 시각 미포함 · ${[dd ? `${dd}일` : "", hh ? `${hh}시간` : ""].filter(Boolean).join(" ")}`;
  })();

  // 📌 저장 줄 — 불러오기 실패면 바뀐 것과 상관없이 잠근 채 이유를 띄운다. 편집 칸이 열려 있는 동안은 숨긴다(칸의 [저장]이 나머지 변경까지 한 번에 저장한다)
  const barNote = !paneOpen && loadFailed ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span> : undefined;
  const barShown = (isDirty && !loadFailed && !paneOpen) || !!barNote;

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

  const tierRows: TierRow[] = tiers.map((t, i) => ({ t, i }));
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
      label: "필요 패스 XP",
      className: "w-56",
      // 📌 칸 값 = 이 단계에 필요한 양, 옆 작은 글자 = 누적(저장값). 필요량이 0 이하인 값은 빨강(저장이 막힌다)
      render: ({ t, i }) => {
        const step = stepAt(tiers, i);
        const off = step <= 0;
        return (
          <>
            {/* 모바일 줄 카드는 통째로 단추라 입력칸을 넣을 수 없다 — 값만 보이고, 눌러서 편집 칸에서 고친다 */}
            <span className="md:hidden tabular-nums whitespace-nowrap">
              필요 <span className={`font-black ${off ? "text-[#d01634]" : "text-[#131313]"}`}>{step.toLocaleString()}</span>
              <span className="ml-1.5 text-[11px] font-bold text-[#8a8a8a]">누적 {t.need.toLocaleString()}</span>
            </span>
            <span className="hidden md:inline-flex items-center gap-2.5">
              <NeedInput
                tierKey={t.key}
                tierNo={i + 1}
                value={step}
                warn={off}
                busy={isSaving}
                onCommit={(n) => commitNeed(t.key, n)}
                onSubmit={(n) => submitNeed(t.key, n)}
                onInvalid={(msg) => showToast(msg, "err")}
              />
              {/* 누적 — 폭 고정이라 자릿수가 바뀌어도 옆 칸이 밀리지 않는다 */}
              <span className="w-24 shrink-0 text-[11px] font-bold tabular-nums text-[#8a8a8a] whitespace-nowrap">누적 {t.need.toLocaleString()}</span>
            </span>
          </>
        );
      },
    },
    { key: "free", label: "보상", className: "!pl-8", render: ({ t }) => rewardCell(t.free) },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-44",
      // 모바일 줄 카드는 통째로 단추라 안에 단추를 둘 수 없다 — 줄을 눌러 편집 칸에서 삽입 · 삭제한다
      mobile: "hide",
      render: ({ t, i }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); pickTier(t.key); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" aria-label={`${i + 1}단계 아래에 삽입`} onClick={(e) => { e.stopPropagation(); insertTier(t.key); }}>
            삽입
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); askRemoveTier(t.key); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  // 편집 칸 필요 패스 XP 아래 한 줄 — 읽은 값과 누적. 빈칸이어도 줄 높이는 남긴다(아래 보상 칸이 들썩이지 않게)
  const draftNeed = tierDraft ? parseAmount(tierDraft.need) : NaN;
  const draftNeedErr = tierDraft && tierDraft.need.trim() ? needError(draftNeed) : "";
  const prevNeed = tierIdx > 0 ? tiers[tierIdx - 1].need : 0;
  const needHint = !tierDraft?.need.trim() ? (
    " "
  ) : draftNeedErr ? (
    <span className="font-bold text-[#d01634]">{draftNeedErr}</span>
  ) : (
    <span className="tabular-nums">
      {draftNeed.toLocaleString()} 패스 XP · 누적 {(prevNeed + draftNeed).toLocaleString()}
    </span>
  );

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="이벤트 패스"
        desc={`이벤트 키 ${eventKey || "-"} · 진행도는 기간 중 획득한 XP입니다.`}
        footer={
          <SaveBar
            dirty={isDirty && !loadFailed && !paneOpen}
            changes={changes}
            onSave={saveList}
            onReset={resetToBase}
            saving={isSaving}
            note={barNote}
          />
        }
      >
        {(loadFailed || (rolesFailed && !isLoading)) && (
          <div className="mb-5 space-y-3">
            {loadFailed && (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={fetchAll}>다시 불러오기</Btn>}>
                현재 설정을 불러오지 못했습니다 (/api/admin/event-pass). 빈 구성이 운영 설정을 덮어쓰지 않도록 저장을 막아 두었습니다.
              </NoteLine>
            )}
            {rolesFailed && !isLoading && (
              <NoteLine tone="warn" action={<Btn size="sm" variant="secondary" onClick={fetchRoles}>다시 불러오기</Btn>}>
                역할 목록을 불러오지 못했습니다 (/api/discord-roles). 이미 지정된 역할 보상은 그대로 유지됩니다.
              </NoteLine>
            )}
          </div>
        )}

        {/* 기본 설정 + 요약 — 넓은 화면에서 두 열, 좁으면 위아래 */}
        <PanelGrid className="mb-5">
          <Panel title="기본 설정" flush>
            <FieldRow label="이벤트 패스 사용" hint="끄면 유저 화면에 단계가 표시되지 않으며 수령할 수 없습니다" changed={enabledChanged}>
              {/* 📌 켜기 잠금 — 꺼져 있을 때만 스위치를 잠근다(켜져 있으면 끄기는 늘 된다). 이유는 스위치 옆에 같은 문구로 */}
              <Inline>
                <Switch on={enabled} onChange={(v) => setEnabled(v)} disabled={!enabled && lockOn} label="이벤트 패스 사용" />
                <span className={`font-bold ${enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{enabled ? "운영 중" : "중단 (비공개)"}</span>
                {lockOn && <span className={`min-w-0 font-bold break-keep ${lock.draft ? "text-amber-700" : "text-[#d01634]"}`}>{lock.msg}</span>}
              </Inline>
            </FieldRow>
            <FieldRow label="제목" changed={titleChanged}>
              <input
                type="text"
                value={title}
                maxLength={40}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => enterKey(e, saveList)}
                placeholder="예: 유령 펭귄의 초대"
                aria-label="제목"
                className={inputClass}
              />
            </FieldRow>
            <FieldRow label="기간" hint={periodHint} changed={periodChanged}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block min-w-0">
                  <span className="block mb-1 text-[12px] text-[#5a5a5a]">시작</span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    aria-label="시작 (KST)"
                    className={`${inputClass} tabular-nums`}
                  />
                </label>
                <label className="block min-w-0">
                  <span className="block mb-1 text-[12px] text-[#5a5a5a]">종료</span>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    onKeyDown={(e) => enterKey(e, saveList)}
                    aria-label="종료 (KST)"
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
              { label: "단계 수", value: tiers.length.toLocaleString() },
              { label: "최종 단계 패스 XP", value: maxNeed.toLocaleString() },
              { label: "보상 수", value: rewardCount.toLocaleString() },
              { label: "상태", value: phase },
            ]}
          />
        </PanelGrid>

        {/* 단계 구성 — 패널 머리에 추가, 본문은 전체 폭 표 */}
        <Panel
          flush
          title={
            <>
              단계 구성 <span className="ml-1 text-[#8a8a8a] tabular-nums">{tiers.length}</span>
            </>
          }
          right={
            <Btn variant="secondary" size="sm" onClick={() => insertTier(null)} disabled={isLoading}>
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
          {/* 보상이 빈 단계는 막지 않는다 — 개수만 알린다 */}
          {!isLoading && emptyTierCount > 0 && (
            <NoteLine tone="neutral" inset>
              보상이 비어 있는 단계 {emptyTierCount}개 — 이대로도 저장됩니다.
            </NoteLine>
          )}
          {isLoading ? (
            <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
          ) : tiers.length === 0 ? (
            <div className="p-5">
              <EmptyRow>등록된 단계가 없습니다.</EmptyRow>
            </div>
          ) : (
            // 패널이 테두리를 이미 두르고 있어 표 자체의 테두리 · 모서리는 뺀다
            <DataTable
              className="!rounded-none !border-0"
              columns={tierCols}
              rows={tierRows}
              rowKey={(r) => r.t.key}
              onRowClick={(r) => pickTier(r.t.key)}
              selectedKey={tierDraft?.key ?? null}
            />
          )}
          <p className="px-5 py-3.5 border-t border-[#ededed] text-[12px] text-[#5a5a5a] leading-relaxed break-keep">
            XP · 역할 · 역할 있는 아이템은 봇 큐를 거쳐 30초 이내에, 빙옥 · 역할 없는 아이템은 즉시 지급됩니다. 이미 수령한 단계는 보상을 바꿔도 다시 지급되지 않습니다.
          </p>
        </Panel>
      </AdminPage>

      {/* ── 단계 편집 — PC 오른쪽 칸 / 모바일 아래 판. [저장] · Enter 가 목록 반영 + 서버 저장을 한 번에 ── */}
      <DetailPane
        open={!!tierDraft}
        onClose={closePanes}
        title={tierDraft ? `${tierIdx + 1}단계 편집` : ""}
        footer={
          tierDraft && (
            <>
              <PaneError msg={paneErr} />
              {/* 모바일은 표에 관리 단추가 없어(줄 카드) 여기서 삭제 · 삽입한다 */}
              <Btn variant="ghost" onClick={() => askRemoveTier(tierDraft.key)} disabled={isSaving}>
                삭제
              </Btn>
              <Btn variant="ghost" className="mr-auto" aria-label={`${tierIdx + 1}단계 아래에 삽입`} onClick={insertFromPane} disabled={isSaving}>
                삽입
              </Btn>
              <Btn variant="ghost" onClick={closePanes}>
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
                필요 패스 XP <Req />
              </span>
              <input
                type="text"
                data-pane-need
                value={tierDraft.need}
                onChange={(e) => editTierDraft({ ...tierDraft, need: e.target.value })}
                onKeyDown={(e) => enterKey(e, saveTierDraft)}
                placeholder="예: 5000 · 5천 · 5k"
                className={`${inputClass} tabular-nums`}
              />
            </label>
            <p className={fieldNote}>{needHint}</p>
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

      {/* ── 단계 삭제 확인 — 저장된 단계만(새 단계는 확인 없이 뺀다). 확인하면 바로 저장 ── */}
      <ConfirmDialog
        open={deleteTierKey !== null}
        danger
        title="단계 삭제"
        confirmLabel="삭제"
        busy={isSaving}
        onCancel={() => setDeleteTierKey(null)}
        onConfirm={confirmRemoveTier}
        body={
          <>
            {deleteTierNo}단계를 삭제하고 바로 저장합니다. 뒤 단계의 누적 필요 패스 XP가 이 단계의 필요량만큼 내려가며,
            <strong className="text-[#131313]"> 이미 지급된 보상은 회수되지 않습니다.</strong>
          </>
        }
      />

      {/* 결과 토스트 — 저장 줄이 떠 있으면 그 위로 (시즌 패스 화면과 같은 모양) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed ${barShown ? "bottom-[180px] md:bottom-24" : "bottom-[96px] md:bottom-6"} left-1/2 -translate-x-1/2 z-[130] w-max max-w-[calc(100vw-2rem)] px-5 py-3 rounded-full border text-[13px] font-bold break-keep shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] ${
            toast.error ? "bg-white border-[#e91e3f] text-[#d01634]" : "bg-[#131313] border-[#131313] text-white"
          }`}
        >
          {toast.error ? "⚠ " : "✓ "}
          {toast.msg}
        </div>
      )}
    </>
  );
}
