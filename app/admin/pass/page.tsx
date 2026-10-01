"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import { SEASON } from "@/lib/season";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { POINT_RATE, xpToPoint } from "@/lib/pointRate";
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
  numClass,
  labelClass,
  fieldNote,
  ConfirmDialog,
  useAdminGuard,
  type Column,
} from "../ui";

// 📌 시즌 패스 구성 화면 — 무료/프리미엄 2트랙의 티어 사다리를 관리한다.
//    2026-09 관리자 개편: 설정 틀과 목록 틀을 한 화면에 쌓는다 (세부 탭 없이).
//      · 위 — 기본 설정 패널(사용 · 해금가)과 요약 숫자 칸을 넓은 화면에서 두 열로
//      · 아래 — 티어 구성 패널 안에 전체 폭 표. 티어가 20개를 넘으면 세로 폼은 훑을 수 없어
//        표는 한 줄 요약만 두고, 줄(또는 편집)을 누르면 상세 칸에서 고친다
//      · 저장 — 불러온 스냅샷과 다를 때만 뜨는 저장 줄(SaveBar). 무엇이 바뀌었는지 한 줄씩 보여 준다
//    입력칸 · 확인 모달 · 권한 화면은 전부 ../ui 의 공용 컴포넌트를 쓴다.
//    📌 2026-09 — 티어의 무료 · 프리미엄 칸은 보상 목록(칸마다 최대 4개)이다. 해금가는 빙옥으로 받아 ×10,000(XP)으로 저장한다.
//    📌 2026-10 — "수정하고 Enter 치면 바로 저장", "필요 XP 설정이 불편하다" 요청으로 단계를 줄였다.
//      · 입력칸에서 Enter = 그 자리 저장(편집 칸이면 적용 + 저장 한 번에). 한글 조합 중 Enter 는 넘긴다
//      · 필요 XP 는 표에서 바로 고친다(PC). "5만" · "1.5만" · "50k" · "50,000" 을 숫자로 읽는다
//      · 필요 XP 일괄 — 첫 티어 + 간격(고정 · %)으로 모든 티어의 필요 XP 를 한 번에 채운다(보상은 그대로)
//      · 편집 칸의 [확인] → [저장], 삭제 확인 → 바로 저장 — 목록 반영과 저장 줄을 두 번 누르던 것
//      · 같은 필요 XP 는 순서가 그대로라 막지 않는다(+0 주황). 줄어드는 티어만 저장 때 정렬을 묻는다
//      · 결과는 알림 모달 대신 토스트 + 효과음 — Enter 로 연달아 고칠 때 모달을 닫느라 손이 멈추지 않게

type RewardKind = "xp" | "point" | "role" | "item";
type Reward = { kind: RewardKind; amount: number; roleId: string; roleName: string; itemId: string; itemName: string };
// 📌 tid — 서버가 발급하는 티어 고유 식별자("t7"). 유저 수령 기록이 이 값으로 남으므로
//    편집 · 정렬 · 삭제 어느 경로에서도 잃어버리면 안 된다 (잃으면 서버가 새 tid 를 발급해
//    이미 받은 티어가 미수령으로 되살아난다). 새로 만든 티어만 빈 문자열로 보내 서버가 발급하게 한다.
//    key 는 React 목록 전용 로컬 키 — 아직 tid 가 없는 새 티어도 행을 구분해야 해서 따로 둔다. 서버로 보내지 않는다.
type Tier = { key: string; tid: string; level: number; need: number; free: Reward[]; paid: Reward[] };
// 상세 칸에서는 숫자 칸을 비울 수 있어야 해서 문자열로 들고 있다가 저장할 때 숫자로 바꾼다
//    key 는 보상 줄의 로컬 키(순서 바꾸기 · 삭제 뒤에도 입력칸이 제 줄을 따라가게) — 서버로 보내지 않는다
type DraftReward = { key: string; kind: RewardKind; amount: string; roleId: string; roleName: string; itemId: string; itemName: string };
// 📌 초안은 티어를 번호가 아니라 key 로 가리킨다 — 편집 칸이 열린 채 정렬 · 삭제 · 표 안 편집이 일어나도 같은 티어를 따라간다
type Draft = { key: string; need: string; free: DraftReward[]; paid: DraftReward[] };
// 필요 XP 일괄 설정 칸 — add: 고정 증가(XP) / pct: 비율 증가(%). 두 값을 따로 들고 있어 방식을 바꿔도 입력이 남는다
type Bulk = { start: string; mode: "add" | "pct"; add: string; pct: string; count: string };
// 저장할 한 벌 — 화면 상태를 그대로 쓰지 않고 이걸 넘긴다(편집 칸 · 표 칸의 새 값을 setState 를 기다리지 않고 바로 보내려고)
type Cfg = { enabled: boolean; point: number; tiers: Tier[] };
// 저장을 누른 자리 — pane: 편집 칸(성공하면 닫고, 실패는 칸 안에 띄운다) / list: 표 · 설정 칸 · 저장 줄(토스트)
type SaveFrom = "pane" | "list";
// 표 한 줄 — 티어 번호(i)는 목록 순서에서 나온다
type Row = { t: Tier; i: number };

// 칸마다 보상 수 상한 — lib/seasonPass.js 의 MAX_REWARDS 와 같아야 한다(서버가 넘치는 것은 잘라 버린다)
const MAX_REWARDS = 4;
// 서버가 100개에서 잘라 버리므로 화면에서 먼저 막는다 (lib/seasonPass.js MAX_TIERS)
const MAX_TIERS = 100;
// 서버가 숫자를 10억에서 자른다 (lib/seasonPass.js num 의 max) — 넘는 값은 조용히 깎이지 않게 화면에서 막는다
const MAX_NUM = 1_000_000_000;

const KIND_OPTIONS: { v: RewardKind; l: string }[] = [
  { v: "xp", l: "XP" },
  { v: "point", l: "빙옥" },
  { v: "role", l: "역할" },
  { v: "item", l: "아이템" },
];
const BULK_MODES: { v: Bulk["mode"]; l: string }[] = [
  { v: "add", l: "XP씩 늘리기" },
  { v: "pct", l: "%씩 늘리기" },
];

// 불러오기에 실패한 채로 저장하면 빈 구성이 운영 중인 설정을 통째로 덮어쓴다
const LOAD_FAILED_MSG = "현재 설정을 불러오지 못해 저장할 수 없습니다. [다시 불러오기] 후에 저장해 주세요.";
// 해금가 되돌림 알림 — 저장 줄이 아니라 해금가 칸 아래에 띄운다 (무엇이 되돌아갔는지 그 자리에서 보이게)
const PRICE_REVERT_MSG = "해금가는 비워 둘 수 없어 직전 값으로 되돌렸습니다.";
// 정렬 확인 창 제목 — 공용 ConfirmDialog 가 aria-label 로 달아 줘서 확인 단추를 찾는 데도 쓴다
const SORT_TITLE = "정렬 후 저장";

const toInt = (v: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// ── 숫자 읽기 ─────────────────────────────────
// 📌 필요 XP · 보상 수량 칸은 "5만" · "1.5만" · "5만 5천" · "5천만" · "50k" · "1.2m" · "50,000" · "5만xp" 를 다 받는다.
//    한 마디 = 숫자 + 작은 단위(k · m · 백 · 천) + 큰 단위(만 · 억) — "5천만" 은 5 × 천 × 만.
//    못 읽으면 NaN — 호출부가 그 자리에서 알린다 (0 으로 조용히 바꾸면 빈 티어가 저장된다)
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
  // 1.15만 = 11499.999… 처럼 소수 오차가 나서 내림이 아니라 반올림
  return Math.round(total);
};
// 📌 입력칸에 다시 넣을 숫자 — parseAmount 로 되읽으므로 자리 표시를 "50,000" 으로 고정한다.
//    지역 설정을 따르면(de-DE "50.000") 소수점으로 읽혀 50,000 이 50 으로 저장된다
const fmtNum = (n: number) => n.toLocaleString("ko-KR");
// 필요 XP 값의 문제 — 괜찮으면 빈 문자열
const needError = (n: number) =>
  !Number.isFinite(n)
    ? "필요 XP를 읽을 수 없습니다 (예: 5만 · 50k)"
    : n < 1
      ? "필요 XP는 1 이상이어야 합니다"
      : n > MAX_NUM
        ? "필요 XP는 10억 이하여야 합니다"
        : "";

// ── 순서 꼬임(옛 값) ────────────────────────
// 앞 티어보다 필요 XP 가 작은 티어 번호(0부터) — 저장하면 서버가 정렬해 자리가 바뀐다.
//    같은 값은 서버 정렬(안정 정렬)에서도 순서가 그대로라 넣지 않는다
const dropsOf = (list: Tier[]) => list.flatMap((t, i) => (i > 0 && t.need < list[i - 1].need ? [i] : []));
// 정렬하면 자리를 옮기는 티어 — 가장 긴 오름차순 줄기(LIS)에 들지 못한 티어. 하나만 고쳤으면 고친 그 티어만 나온다
//    (dropsOf 는 "앞보다 작은 줄"이라 티어 2 를 크게 고치면 손대지 않은 티어 3 을 가리켜 헷갈린다)
//    base(tid → 불러온 필요 XP)를 주면 손대지 않은 티어를 조금 무겁게 쳐서, 길이가 같은 줄기 중
//    고친 티어를 내보내는 쪽을 고른다 — [10, 35, 30, 40] 에서 35 로 고쳤으면 30 이 아니라 35 가 옮겨질 티어
const movedOf = (list: Tier[], base?: Map<string, number>) => {
  const n = list.length;
  const w = list.map((t): number => (t.tid && base?.get(t.tid) === t.need ? 1.001 : 1));
  const score = [...w];
  const prev = list.map(() => -1);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++)
      if (list[j].need <= list[i].need && score[j] + w[i] > score[i]) {
        score[i] = score[j] + w[i];
        prev[i] = j;
      }
  let end = 0;
  for (let i = 1; i < n; i++) if (score[i] > score[end]) end = i;
  const keep = new Set<number>();
  for (let i = n ? end : -1; i >= 0; i = prev[i]) keep.add(i);
  // 서버와 같은 안정 정렬 — 옮겨 갈 자리(0부터)
  const order = list.map((t, i) => ({ need: t.need, i })).sort((a, b) => a.need - b.need).map((x) => x.i);
  return list.flatMap((t, i) => (keep.has(i) ? [] : [{ from: i, to: order.indexOf(i), need: t.need }]));
};
// 가장 흔한 간격 — 일괄 설정 기본값 · 티어 추가 간격. 오르는 간격이 하나도 없으면 0
const commonStep = (list: Tier[]) => {
  const count = new Map<number, number>();
  for (let i = 1; i < list.length; i++) {
    const d = list[i].need - list[i - 1].need;
    if (d > 0) count.set(d, (count.get(d) || 0) + 1);
  }
  let best = 0;
  let bestN = 0;
  for (const [d, n] of count) if (n > bestN || (n === bestN && d < best)) [best, bestN] = [d, n];
  return best;
};

// ── 티어마다 필요한 양 ─────────────────────────
// 📌 저장은 그대로 시즌 누적값(need — 서버 · 진행 판정 · 수령 기록이 이 값을 본다). 화면에서 넣고 보이는 값만 "이 티어에 필요한 양"
//    (2026-10-01 사용자: "티어에 필요한 양으로 가야지"). 앞 티어와의 차이가 곧 이 티어의 필요량이다.
const stepAt = (list: Tier[], i: number) => list[i].need - (i > 0 ? list[i - 1].need : 0);
// key 티어의 필요량을 step 으로 — 뒤 티어들은 각자의 필요량을 그대로 두고 누적만 같이 밀린다
const withStep = (list: Tier[], key: string, step: number) => {
  const i = list.findIndex((t) => t.key === key);
  if (i < 0) return list;
  const d = step - stepAt(list, i);
  return d === 0 ? list : list.map((t, j) => (j >= i ? { ...t, need: t.need + d } : t));
};
const overMax = (list: Tier[]) => list.some((t) => t.need > MAX_NUM);
const OVER_MAX_MSG = "누적 필요 XP가 10억을 넘습니다. 필요량을 줄여 주세요.";

// ── 필요 XP 일괄 계산 ──────────────────────────
// 📌 첫 티어 필요량 + 티어마다 늘릴 양(고정 · %)으로 티어 수만큼 "티어별 필요량"을 만들고 누적해 저장값으로.
//    % 증가는 값이 지저분해지므로 첫 증가분의 위 두 자리 단위로 반올림한다(5,000 × 10% = 500 → 10 단위) — 반올림으로 줄지 않게 앞 티어 이상.
//    티어 수는 줄일 수 없다 — 줄이면 어느 티어(수령 기록)를 지울지 이 도구가 정하게 되므로 삭제는 표에서 한다
const bulkPlan = (b: Bulk, current: number): { needs: number[]; error?: undefined } | { needs?: undefined; error: string } => {
  const start = parseAmount(b.start);
  const se = needError(start);
  if (se) return { error: `첫 티어 — ${se}` };
  const count = Number(String(b.count).replace(/[\s,개]/g, ""));
  if (!Number.isInteger(count) || count < 1) return { error: "티어 수를 1 이상의 정수로 입력해 주세요." };
  if (count > MAX_TIERS) return { error: `티어는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.` };
  if (count < current) return { error: `티어 수는 지금(${current}개)보다 줄일 수 없습니다. 줄이려면 표에서 삭제해 주세요.` };
  // 📌 티어마다 필요한 양(steps)을 먼저 만들고, 저장할 누적값(needs)은 그 합으로 — 첫 티어 필요량 + 티어마다 늘릴 양(0 이면 모든 티어 같은 양)
  const steps: number[] = [];
  if (b.mode === "add") {
    const inc = parseAmount(b.add || "0");
    if (!Number.isFinite(inc) || inc < 0) return { error: "늘릴 양을 0 이상으로 입력해 주세요 (예: 0 · 1000 · 1천)." };
    for (let i = 0; i < count; i++) steps.push(start + inc * i);
  } else {
    const pct = Number(String(b.pct).replace(/[\s%]/g, ""));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 1000) return { error: "증가율을 0보다 크고 1,000 이하로 입력해 주세요." };
    const unit = Math.max(1, 10 ** (Math.floor(Math.log10((start * pct) / 100)) - 1));
    for (let i = 0; i < count; i++) steps.push(i === 0 ? start : Math.max(steps[i - 1], Math.round((start * (1 + pct / 100) ** i) / unit) * unit));
  }
  const needs: number[] = [];
  for (const s of steps) needs.push((needs.length ? needs[needs.length - 1] : 0) + s);
  if (needs[needs.length - 1] > MAX_NUM) return { error: "마지막 티어 누적이 10억 XP를 넘습니다. 필요량을 줄여 주세요." };
  return { needs };
};

// ── 효과음 ─────────────────────────────────────
// 📌 관리자 봇 메시지 화면과 같은 소리 한 벌 — 저장 성공 · 실패 · 목록만 바뀐 조작(추가 · 정렬)
const sfxOk = () => [660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.1, "sine", 0.035), i * 80));
const sfxErr = () => {
  playTone(300, 0.14, "square", 0.035);
  setTimeout(() => playTone(220, 0.2, "square", 0.035), 130);
};
const sfxTick = () => playTone(740, 0.06, "sine", 0.03);

// ── Enter 로 저장 ──────────────────────────────
// 📌 한글 조합 중 Enter(isComposing · keyCode 229)는 조합을 끝내는 키다 — 저장으로 받으면 "5만"의 "만"이
//    반쯤 든 채 나간다. 눌러 둔 채 반복되는 Enter 도 넘긴다(저장 중 연타는 저장 함수가 한 번 더 막는다).
const imeBusy = (e: ReactKeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229;
// 이벤트 안에서 부른다 — onKeyDown={(e) => enterKey(e, save)}. 렌더 중에 저장 함수를 넘겨 감싸 두면 react-hooks/refs 가 막는다
const enterKey = (e: ReactKeyboardEvent<HTMLInputElement>, fn: () => void) => {
  if (e.key !== "Enter" || imeBusy(e)) return;
  e.preventDefault();
  if (!e.repeat) fn();
};

const normReward = (r: any): Reward | null =>
  (["xp", "point", "role", "item"] as string[]).includes(r?.kind)
    ? {
        kind: r.kind,
        amount: toInt(r?.amount),
        roleId: r?.roleId || "",
        roleName: r?.roleName || "",
        itemId: r?.itemId || "",
        itemName: r?.itemName || "",
      }
    : null;

// 한 칸의 보상 목록 — 옛 모양(객체 하나)도 목록으로 읽는다. 빈 보상(none)은 뺀다
const normRewards = (v: any): Reward[] => {
  const list = Array.isArray(v) ? v : v && typeof v === "object" ? [v] : [];
  return list.map(normReward).filter((r): r is Reward => !!r).slice(0, MAX_REWARDS);
};

// 목록에 뿌릴 한 줄 요약 — 서버가 만드는 label 과 같은 모양으로 맞춘다
const rewardLabel = (r: Reward, roleNameOf: (id: string) => string, itemOf: (id: string) => any) => {
  if (r.kind === "xp") return `XP ${r.amount.toLocaleString()}`;
  if (r.kind === "point") return `빙옥 ${r.amount.toLocaleString()}`;
  if (r.kind === "role") return `역할 · ${roleNameOf(r.roleId) || r.roleName || "미지정"}`;
  if (r.kind === "item") {
    const it = itemOf(r.itemId);
    return `아이템 · ${it?.name || r.itemName || "미지정"}`;
  }
  return "-";
};
// 칸 하나(보상 목록)를 한 줄로 — 저장 줄의 변경 목록용
const listLabel = (list: Reward[], roleNameOf: (id: string) => string, itemOf: (id: string) => any) =>
  list.length ? list.map((r) => rewardLabel(r, roleNameOf, itemOf)).join(" · ") : "없음";

// 저장 여부를 비교할 지문 — 서버로 나가는 값만 담는다 (로컬 전용 key 는 빼야 헛된 "변경됨"이 안 뜬다)
const sig = (enabled: boolean, price: number, list: Tier[]) =>
  JSON.stringify({
    enabled,
    unlockPrice: price,
    tiers: list.map((t) => ({ tid: t.tid, level: t.level, need: t.need, free: t.free, paid: t.paid })),
  });

// 저장 전 검사 — 서버가 조용히 고쳐 버릴 값(0 · 빈 역할 · 빈 아이템)을 먼저 막는다. 괜찮으면 빈 문자열
const checkCfg = (c: Cfg) => {
  // 📌 해금가가 0 이면 프리미엄 트랙이 전원 무료로 열린다 — 빈칸이 조용히 0 으로 저장되던 사고를 막는다
  if (c.point <= 0) return "프리미엄 해금가를 1 빙옥 이상으로 입력해 주세요.";
  const all = c.tiers.flatMap((t) => [...t.free, ...t.paid]);
  if (all.some((r) => r.kind === "role" && !r.roleId)) return "역할 보상 중 역할이 지정되지 않은 티어가 있습니다.";
  if (all.some((r) => r.kind === "item" && !r.itemId)) return "아이템 보상 중 아이템이 지정되지 않은 티어가 있습니다.";
  const zero = c.tiers.findIndex((t) => t.need <= 0);
  if (zero >= 0) return `티어 ${zero + 1}의 필요 XP가 0입니다. 1 이상으로 고쳐 주세요.`;
  return "";
};

const onOffLabel = (v: boolean) => (v ? "운영 중" : "중단");

// ── 알림 줄 ───────────────────────────────────
// 📌 공용 상태 칩(StatusChip)과 같은 색 한 벌(bad · warn · neutral)로만 칠한다.
//    페이지 위에서는 둥근 판 하나, 패널 안에서는(inset) 선으로 나눈 한 줄.
function NoteLine({
  tone,
  action,
  inset = false,
  children,
}: {
  tone: "bad" | "warn" | "neutral";
  action?: ReactNode;
  inset?: boolean;
  children: ReactNode;
}) {
  const toneCls =
    tone === "bad" ? "bg-[#e91e3f]/[0.08] text-[#d01634]" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-[#f2f2f2] text-[#5a5a5a]";
  return (
    <div
      role={tone === "neutral" ? undefined : "alert"}
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-[13px] font-bold break-keep ${toneCls} ${
        inset ? "px-5 border-b border-[#ededed]" : "px-4 rounded-2xl"
      }`}
    >
      {/* basis 를 둬서 좁은 폭에서는 단추가 다음 줄로 내려간다 (글이 한 글자 폭으로 짜부라지지 않게) */}
      <p className="min-w-0 grow basis-60">{children}</p>
      {action}
    </div>
  );
}

// ── 표 안의 필요 XP 칸 ─────────────────────────
// 📌 PC 표에서 티어마다 바로 고친다. 칸을 벗어나면 목록에만 반영(저장 줄), Enter 면 그 자리에서 저장.
//    포커스 동안만 입력 글자를 따로 들고 있다가("5만" 그대로 보이게) 벗어날 때 숫자로 바꾼다.
//    ↑ ↓ 는 위 · 아래 티어 칸으로(떠나는 칸은 목록에 반영), Esc 는 고치기 전 값으로.
//    모듈 스코프에 둔다 — 페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 도중 포커스가 날아간다.
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
  warn: boolean; // 정렬하면 자리를 옮길 티어 · 0 이하 — 빨간 테두리
  busy: boolean; // 저장 중 — 응답이 화면 값을 갈아 끼우므로 그동안 친 글자가 사라지지 않게 잠근다
  onCommit: (n: number) => void;
  onSubmit: (n: number) => void;
  onInvalid: (msg: string) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  // 마우스로 눌러 들어온 포커스인지 — 그 클릭의 mouseup 이 전체 선택을 커서 하나로 풀어 버리지 않게 막는다
  const clickFocus = useRef(false);
  // 바깥(되돌리기 · 저장 응답 · 정렬)에서 값이 바뀌면 들고 있던 입력 글자를 버린다.
  //    같은 값이면 그대로 둔다 — Enter 로 저장한 직후 칸에 "50,000" 이 남아 있어야 이어서 고친다
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (text != null && parseAmount(text) !== value) setText(null);
  }
  const shown = text ?? fmtNum(value);
  const go = (el: HTMLInputElement, d: 1 | -1) => {
    // 모바일 줄 카드에도 같은 칸이 숨어 있어 보이는 것만 센다
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-need-key]")).filter((x) => x.offsetParent !== null);
    all[all.indexOf(el) + d]?.focus();
  };
  return (
    <input
      type="text"
      data-need-key={tierKey}
      value={shown}
      readOnly={busy}
      aria-label={`티어 ${tierNo} 필요 XP`}
      aria-invalid={bad || warn || undefined}
      // 줄을 누르면 편집 칸이 열린다 — 칸을 누른 것은 줄까지 올리지 않는다
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        clickFocus.current = document.activeElement !== e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (clickFocus.current) e.preventDefault();
        clickFocus.current = false;
      }}
      // 들어오면 전체 선택 — 지우지 않고 바로 새 값을 친다 (글자는 그대로라 React 가 값을 다시 쓰지 않아 선택이 남는다)
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
        if (err) onInvalid(`티어 ${tierNo}: ${err} — 되돌렸습니다`);
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
            onInvalid(`티어 ${tierNo}: ${err}`);
            return;
          }
          setText(fmtNum(n));
          onSubmit(n);
        } else if (e.key === "Escape") {
          // 열린 편집 칸까지 닫히지 않게 막는다 (DetailPane 은 막힌 Esc 를 넘긴다)
          e.preventDefault();
          setText(fmtNum(value));
          setBad(false);
          // 값이 바뀌어 다시 그려진 뒤에 고른다 (그리기 전에 고르면 값을 쓰면서 커서가 끝으로 간다)
          setTimeout(() => el.select(), 0);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          go(el, e.key === "ArrowDown" ? 1 : -1);
        }
      }}
      className={`${NEED_INPUT} ${
        bad || warn ? "border-[#e91e3f] focus:border-[#e91e3f]" : "border-[#a3a3a3] hover:border-[#131313] focus:border-[#131313]"
      }`}
    />
  );
}

// ── 보상 편집 블록 ────────────────────────────
// 📌 상세 칸 안에서 입력값을 다루므로 반드시 모듈 스코프에 둔다.
//    페이지 함수 안에서 정의하면 렌더마다 새 컴포넌트가 되어 타이핑 도중 포커스가 날아간다.
// 📌 공용 Dropdown 의 밝은 테마는 테두리가 옅고(#ededed) 키가 커서(py-3) — 관리자 입력칸(inputClass)과
//    같은 높이 · 테두리로 맞춘다. Dropdown 파일은 다른 화면도 쓰므로 여기서 덮어쓰기만 한다.
const DROPDOWN_BTN = "!px-3 !py-2 min-h-10 !border-[#a3a3a3] hover:!border-[#131313] focus-visible:!border-[#131313]";

// 보상 한 줄의 값 칸 — 종류에 따라 수량 · 역할 · 아이템 (옛 한 칸 편집 부품을 줄마다 쓴다)
//    지급 경로 안내는 표 아래 한 줄이 맡는다 — 줄마다 같은 문장을 반복하지 않는다
//    수량 칸은 Enter 로 저장, 역할 · 아이템 고르기는 Enter 가 목록을 여닫는 키라 건드리지 않는다
function RewardFields({
  title,
  value,
  roles,
  items,
  onChange,
  onEnter,
}: {
  title: string;
  value: DraftReward;
  roles: any[];
  items: any[];
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
        onChange={(v) => onChange({ ...value, roleId: v, roleName: roles.find((r: any) => r.id === v)?.name || "" })}
        options={roles.map((r: any) => ({ value: r.id, label: r.name, color: r.color }))}
      />
    );
  }
  return (
    <Dropdown
      theme="light"
      value={value.itemId}
      placeholder={items.length ? "지급할 아이템을 선택하세요" : "등록된 아이템이 없습니다"}
      buttonClassName={DROPDOWN_BTN}
      onChange={(v) => onChange({ ...value, itemId: v, itemName: items.find((it: any) => it._id === v)?.name || "" })}
      options={items.map((it: any) => ({
        value: it._id,
        label: it.name,
        hint: itemTypeLabel(it.type),
        icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
      }))}
    />
  );
}

// 줄 조작 단추 — 폭을 고정해 첫 줄 · 끝 줄에서 단추가 꺼져도 자리가 움직이지 않는다
const ROW_BTN = "!px-0 w-8 shrink-0";
const RowIcon = ({ d }: { d: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ── 트랙 편집 — 무료 / 프리미엄 칸의 보상 목록(최대 4줄) ─────────
//    줄마다 종류 + 값, 오른쪽 위에 위로 · 아래로 · 삭제. 받기는 칸 단위라 유저는 이 목록을 한 번에 받는다.
function TrackEditor({
  title,
  tone,
  rows,
  roles,
  items,
  nextKey,
  onChange,
  onEnter,
}: {
  title: string;
  tone: string;
  rows: DraftReward[];
  roles: any[];
  items: any[];
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
    onChange([...rows, { key: nextKey(), kind: "xp", amount: "", roleId: "", roleName: "", itemId: "", itemName: "" }]);
  };
  return (
    <div className="mt-5 pt-5 border-t border-[#ededed]">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tone }} />
        <span className="text-[14px] font-black">{title}</span>
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
            {/* 보상 종류 — 관리자 화면 공통 알약 토글 */}
            <Segmented options={KIND_OPTIONS} value={r.kind} onChange={(v) => set(j, { ...r, kind: v as RewardKind })} className="mb-2.5" />
            <RewardFields title={`${title} 보상 ${j + 1}`} value={r} roles={roles} items={items} onChange={(v) => set(j, v)} onEnter={onEnter} />
          </div>
        ))
      )}
    </div>
  );
}

// 편집 칸 아래 오류 한 줄 — 저장 단추 위에 붙는다(칸 아래쪽이 자라므로 단추 줄은 제자리)
const PaneError = ({ msg }: { msg: string }) =>
  msg ? (
    <p role="alert" className="w-full text-[12px] font-bold text-[#d01634] break-keep">
      ⚠ {msg}
    </p>
  ) : null;

export default function AdminPassPage() {
  // 화면 가리기 전용 — 실제 방어는 /api/admin/pass 가 서버에서 한 번 더 한다
  const { isAdmin, gate } = useAdminGuard();

  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 📌 연타 막이 — isSaving 은 다음 렌더에야 보여서 같은 틈에 두 번 들어오는 Enter · 클릭을 못 막는다
  const savingRef = useRef(false);

  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  // 아이템 보상용 — 아이템 등록(/api/admin/items) 목록
  const [regItems, setRegItems] = useState<any[]>([]);
  // 역할 목록은 설정과 다른 API 라 따로 실패한다 — 조용히 넘기면 드롭다운이 빈 상자로 열려
  // 관리자가 "서버에 역할이 없다"고 오해한다
  const [rolesFailed, setRolesFailed] = useState(false);
  // 아직 tid 가 없는 새 티어에 붙일 로컬 키 발급기 (저장 body 에는 나가지 않는다)
  const newKeyRef = useRef(0);
  // 보상 줄 로컬 키 — 상세 칸의 줄마다 붙인다(서버로 보내지 않는다)
  const nextRowKey = useCallback(() => `r:${++newKeyRef.current}`, []);
  // 해금가 칸을 비웠을 때 되돌릴 직전 값 — 빈칸이 0 으로 저장되는 사고를 막는다
  const lastPriceRef = useRef("50");
  // 📌 기본 꺼짐 — 티어를 다 채우기 전에 보상이 새 나가지 않게 (모델 기본값과 같음).
  //    불러오기에 실패했을 때 실수로 켜진 채 저장되는 일도 막는다.
  const [enabled, setEnabled] = useState(false);
  // 📌 해금가는 빙옥으로 받는다(결제가 빙옥 전용). 저장은 XP 단위 — ×POINT_RATE 해서 보낸다
  const [unlockPoint, setUnlockPoint] = useState("50");
  const [tiers, setTiers] = useState<Tier[]>([]);
  // 저장 시점의 스냅샷 — 안 바꾼 채 나가는 걸 막기 위한 비교용
  const [snapshot, setSnapshot] = useState("");

  const [draft, setDraft] = useState<Draft | null>(null);
  const [bulk, setBulk] = useState<Bulk | null>(null);
  // 편집 칸 안의 오류 — 칸을 덮는 토스트 대신 저장 단추 위에 띄운다
  const [paneErr, setPaneErr] = useState("");
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  // 순서가 꼬인 채 저장하려 할 때 — 정렬해서 저장할지 묻는 동안 보낼 값을 들고 있는다
  const [pendingSort, setPendingSort] = useState<{ cfg: Cfg; from: SaveFrom } | null>(null);
  // 티어 추가 뒤 그 줄의 필요 XP 칸으로 커서를 옮긴다(PC) — 다음 렌더(줄이 생긴 뒤)에 읽는다
  const focusKeyRef = useRef<string | null>(null);

  const paneOpen = !!draft || !!bulk;
  // 저장 응답이 오기 전에 칸이 닫혔는지 — 실패를 칸 안에 띄울지 토스트로 띄울지 가른다
  const paneOpenRef = useRef(false);
  useEffect(() => {
    paneOpenRef.current = paneOpen;
  }, [paneOpen]);

  // 해금가 칸 아래 한 줄(되돌림 · 오류) — 잠깐 띄우고 환산 줄로 돌아간다
  const [priceNote, setPriceNote] = useState("");
  useEffect(() => {
    if (!priceNote) return;
    const t = setTimeout(() => setPriceNote(""), 2600);
    return () => clearTimeout(t);
  }, [priceNote]);

  // 📌 결과 토스트 — 저장 성공 · 실패 · 목록 조작. 모달처럼 [확인]을 누르지 않아도 사라진다
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
  const grantableRoles = useMemo(() => guildRoles.filter((r: any) => !r.managed), [guildRoles]);
  const roleNameOf = useCallback(
    (id: string) => guildRoles.find((r: any) => r.id === id)?.name || "",
    [guildRoles]
  );
  const itemOf = useCallback((id: string) => regItems.find((it: any) => it._id === id) || null, [regItems]);

  // 📌 스냅샷(sig 문자열)을 되읽은 것 — 저장 줄의 변경 목록 · 설정 줄의 빨간 점 · 되돌리기에만 쓴다.
  //    저장해도 되는지는 여전히 isDirty(문자열 비교)가 정한다.
  const snap = useMemo(() => {
    if (!snapshot) return null;
    try {
      return JSON.parse(snapshot);
    } catch {
      return null;
    }
  }, [snapshot]);

  // keep — 방금 저장하며 보낸 목록. 돌려받은 목록과 순서가 같으면 줄 key 를 그대로 잇는다:
  //    새 티어가 tid 를 받으며 key 가 바뀌면 그 줄이 새로 그려져, Enter 로 저장한 칸의 포커스가 날아간다.
  //    (보내기 전에 줄어드는 티어를 정렬해 두므로 서버 정렬 뒤에도 순서가 같다 — 같은 값은 안정 정렬)
  const applyConfig = useCallback((cfg: any, keep?: Tier[]) => {
    const raw: any[] = Array.isArray(cfg?.tiers) ? cfg.tiers : [];
    const reuse = !!keep && keep.length === raw.length && keep.every((k, i) => !k.tid || k.tid === String(raw[i]?.tid || ""));
    const list: Tier[] = raw.map((t: any, i: number) => {
      // 서버가 준 tid 를 그대로 들고 있는다 — 저장할 때 이 값을 되돌려 보내야 수령 기록이 티어를 계속 따라간다
      const tid = String(t?.tid || "");
      return {
        // tid 가 곧 안정 키 — 정렬 · 삭제로 순서가 바뀌어도 React 가 같은 행으로 알아본다
        key: reuse && keep ? keep[i].key : tid ? `s:${tid}` : `new:${++newKeyRef.current}`,
        tid,
        level: toInt(t?.level) || i + 1,
        need: toInt(t?.need),
        free: normRewards(t?.free),
        paid: normRewards(t?.paid),
      };
    });
    const on = cfg?.enabled === true;
    // 저장값(XP)을 빙옥으로 — 10,000 으로 나누어떨어지지 않던 옛 값은 올림(결제와 같은 값)
    const point = xpToPoint(toInt(cfg?.unlockPrice));
    setEnabled(on);
    setUnlockPoint(String(point));
    lastPriceRef.current = String(point);
    setTiers(list);
    // 스냅샷도 화면이 보낼 값(빙옥 × 환율)으로 — 옛 값이 나누어떨어지지 않아도 헛된 "변경됨"이 뜨지 않게
    setSnapshot(sig(on, point * POINT_RATE, list));
    return new Set(list.map((t) => t.key));
  }, []);

  // 📌 역할 목록만 다시 받는다. 전체 재조회로 하면 서버 저장본이 applyConfig 로 덮어써져
  //    저장하지 않은 티어 편집이 통보도 없이 사라진다 — 역할 배너는 설정이 정상 로드된
  //    상태에서만 뜨므로 그 상황이 실제로 자주 온다.
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
    setDraft(null);
    setBulk(null);
    setPaneErr("");
  }, []);

  const fetchAll = useCallback(() => {
    // 목록이 서버 값으로 바뀌면 열린 편집 칸이 엉뚱한 값을 들고 있게 되므로 먼저 닫는다
    closePanes();
    setIsLoading(true);
    Promise.all([
      fetch("/api/admin/pass", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      fetch("/api/admin/items", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ])
      .then(([cfg, roles, reg]) => {
        const roleList = roles?.success === true && Array.isArray(roles?.data) ? roles.data : [];
        setGuildRoles(roleList);
        setRegItems(reg?.success === true && Array.isArray(reg?.data) ? reg.data : []);
        // 목록이 비면 역할 보상을 아예 고를 수 없으므로, 실패든 빈 응답이든 똑같이 알린다
        setRolesFailed(roleList.length === 0);
        if (cfg?.success && cfg.config) {
          applyConfig(cfg.config);
          setLoadFailed(false);
        } else {
          // 📌 아직 API 가 없거나 응답이 깨졌을 때 — 화면은 열어 두되(빈 구성),
          //    이 빈 구성이 운영 설정을 덮어쓰지 않게 저장 버튼을 잠근다
          setLoadFailed(true);
        }
      })
      .finally(() => setIsLoading(false));
  }, [applyConfig, closePanes]);

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin, fetchAll]);

  // 티어 추가 뒤 — 새 줄의 필요 XP 칸에 커서를 둔다(바로 고치고 Enter). 모바일 줄 카드에는 칸이 없어 건너뛴다
  useEffect(() => {
    const k = focusKeyRef.current;
    if (!k) return;
    focusKeyRef.current = null;
    const el = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-need-key="${CSS.escape(k)}"]`)).find(
      (x) => x.offsetParent !== null
    );
    if (!el) return;
    // 가운데로 — 아래 끝이면 막 뜬 저장 줄에 가린다
    el.scrollIntoView({ block: "center" });
    el.focus();
  }, [tiers]);

  // PC 편집 칸이 열리면 필요 XP 칸에 커서를 둔다 — 줄을 누르고 바로 숫자를 치고 Enter.
  //    모바일은 판이 올라오자마자 자판이 화면을 덮어 버리므로 두지 않는다
  const draftKey = draft?.key ?? null;
  useEffect(() => {
    if (!draftKey || !window.matchMedia("(min-width: 768px)").matches) return;
    const el = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-pane-need]")).find((x) => x.offsetParent !== null);
    el?.focus();
    el?.select();
  }, [draftKey]);

  // 📌 정렬 확인 창 — [정렬 후 저장]에 커서를 둬, Enter 로 저장하다 창이 뜨면 Enter 한 번 더로 끝나게 한다.
  //    입력칸의 Enter 로 띄웠으면 그 키를 뗀 뒤에 옮긴다(누른 채 반복되는 Enter 가 확인까지 눌러 버리지 않게).
  //    창이 닫히면 띄우기 전 자리로 커서를 돌려놓는다 — 표 안 필요 XP 칸에서 이어서 고친다
  const sortOpen = !!pendingSort;
  useEffect(() => {
    if (!sortOpen) return;
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const toOk = () =>
      document.querySelector<HTMLButtonElement>(`[role="alertdialog"][aria-label="${SORT_TITLE}"] button:last-of-type`)?.focus();
    const onUp = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      window.removeEventListener("keyup", onUp);
      toOk();
    };
    // Esc = [돌아가기] (공용 확인 창은 Esc 를 받지 않는다). 막아 둬서 뒤의 편집 칸까지 닫히지 않는다
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || savingRef.current) return;
      e.preventDefault();
      setPendingSort(null);
    };
    window.addEventListener("keydown", onEsc);
    if (back?.tagName === "INPUT") window.addEventListener("keyup", onUp);
    else toOk();
    return () => {
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("keyup", onUp);
      // 편집 칸에서 저장해 칸이 닫혔으면 돌아갈 자리가 없다
      if (back?.isConnected && back.offsetParent !== null) back.focus();
    };
  }, [sortOpen]);

  const priceXp = toInt(unlockPoint) * POINT_RATE;
  const current = sig(enabled, priceXp, tiers);
  const isDirty = !isLoading && current !== snapshot;

  // need 가 줄어들면 유저 진행도가 티어를 건너뛰거나 영영 못 넘는다 — 저장 때 정렬을 묻는다.
  //    빨간 테두리는 줄어든 줄이 아니라 정렬하면 자리를 옮길 티어(대개 방금 고친 티어)에 둔다
  const badOrder = dropsOf(tiers).length > 0;
  const baseNeed = new Map<string, number>(
    (Array.isArray(snap?.tiers) ? snap.tiers : []).filter((b: any) => b?.tid).map((b: any) => [String(b.tid), toInt(b.need)])
  );
  const movers = new Set(badOrder ? movedOf(tiers, baseNeed).map((m) => m.from) : []);
  // 📌 사다리를 먼저 깔고 보상을 나중에 채우는 흐름이 정상이라 저장을 막지는 않는다 — 세어서 보여만 준다
  const emptyTierCount = tiers.filter((t) => !t.free.length && !t.paid.length).length;

  // ── 저장 줄에 띄울 변경 목록 ─────────────────
  // 📌 스냅샷과 지금 값을 맞대어 "이름 이전 → 이후" 한 줄씩. 티어는 tid 로 짝을 지어
  //    추가 · 삭제 · 수정 · 순서를 가린다 (보여 주기 전용 — 못 가린 변경은 "변경사항 있음"으로 뜬다)
  const enabledChanged = !!snap && snap.enabled !== enabled;
  const priceChanged = !!snap && snap.unlockPrice !== priceXp;
  const changes: string[] = [];
  if (snap && isDirty) {
    if (enabledChanged) changes.push(`상태 ${onOffLabel(!!snap.enabled)} → ${onOffLabel(enabled)}`);
    if (priceChanged)
      changes.push(`해금가 ${xpToPoint(snap.unlockPrice).toLocaleString()} → ${toInt(unlockPoint).toLocaleString()} 빙옥`);
    const before: any[] = Array.isArray(snap.tiers) ? snap.tiers : [];
    const byTid = new Map<string, any>(before.filter((b) => b?.tid).map((b) => [b.tid, b]));
    const nowTids = new Set(tiers.map((t) => t.tid).filter(Boolean));
    const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
    tiers.forEach((t, i) => {
      const b = t.tid ? byTid.get(t.tid) : null;
      if (!b) {
        changes.push(`티어 ${i + 1} 추가`);
        return;
      }
      if (b.need !== t.need) changes.push(`티어 ${i + 1} 필요 XP ${toInt(b.need).toLocaleString()} → ${t.need.toLocaleString()}`);
      if (!same(b.free, t.free))
        changes.push(`티어 ${i + 1} 무료 ${listLabel(normRewards(b.free), roleNameOf, itemOf)} → ${listLabel(t.free, roleNameOf, itemOf)}`);
      if (!same(b.paid, t.paid))
        changes.push(`티어 ${i + 1} 프리미엄 ${listLabel(normRewards(b.paid), roleNameOf, itemOf)} → ${listLabel(t.paid, roleNameOf, itemOf)}`);
    });
    before.forEach((b, i) => {
      if (b?.tid && !nowTids.has(b.tid)) changes.push(`티어 ${toInt(b.level) || i + 1} 삭제`);
    });
    const seqBefore = before.filter((b) => b?.tid && nowTids.has(b.tid)).map((b) => b.tid).join();
    const seqNow = tiers.filter((t) => t.tid && byTid.has(t.tid)).map((t) => t.tid).join();
    if (seqBefore !== seqNow) changes.push("티어 순서 변경");
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
    // 어느 경로(정렬 확인 모달 포함)로 들어와도 불러오기 실패 상태에서는 저장하지 않는다
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    savingRef.current = true;
    setIsSaving(true);
    // 표시용 이름 스냅샷 — 지금 목록의 이름으로 채워 보낸다(역할 · 아이템 이름이 바뀌어도 라벨이 남게)
    const named = (r: Reward): Reward => ({
      ...r,
      roleName: r.kind === "role" ? roleNameOf(r.roleId) || r.roleName : "",
      itemName: r.kind === "item" ? itemOf(r.itemId)?.name || r.itemName : "",
    });
    const res = await fetch("/api/admin/pass", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: cfg.enabled,
        // 빙옥 입력 × 환율 — 서버는 XP 단위로 저장한다
        unlockPrice: cfg.point * POINT_RATE,
        tiers: cfg.tiers.map((t, i) => ({
          // 📌 기존 티어의 tid 를 그대로 되돌려 보낸다 — 이 값이 빠지면 서버가 새 tid 를 발급해
          //    이미 받은 티어가 미수령으로 되살아난다. 새 티어만 빈 문자열(서버가 발급).
          tid: t.tid || "",
          level: i + 1,
          need: t.need,
          free: t.free.map(named),
          paid: t.paid.map(named),
        })),
      }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    savingRef.current = false;
    setIsSaving(false);
    setPendingSort(null);

    if (res?.ok && d?.success) {
      // 📌 응답 본문에는 서버가 새로 발급한 tid 가 들어 있다. 이걸 못 받으면 새 티어가 tid 없는 채로
      //    남아, 다음 저장 때 또 새 tid 를 받아 별개 티어처럼 갈라진다 — 없으면 다시 불러와서라도 맞춘다.
      //    (applyConfig 가 스냅샷도 새 값으로 갈아 끼워 저장 줄이 닫힌다)
      if (d.config) {
        const keys = applyConfig(d.config, cfg.tiers);
        // 편집 칸에서 저장했으면 닫는다. 표 · 설정 칸에서 Enter 로 저장했으면 열려 있던 다른 티어 칸은 그대로(그 티어가 남아 있으면)
        if (from === "pane") closePanes();
        else setDraft((dr) => (dr && keys.has(dr.key) ? dr : null));
      } else {
        fetchAll();
      }
      setLoadFailed(false);
      showToast(okMsg);
    } else {
      fail(d?.message || "저장에 실패했습니다.", from);
    }
  };

  // 📌 모든 저장의 입구 — 저장 줄 · Enter · 편집 칸 [저장] · 삭제 확인 · 일괄 설정이 전부 여기로 온다.
  //    over 로 넘긴 값(편집 칸에서 막 고친 티어 등)을 화면 상태에 얹어 한 벌로 검사 · 저장한다.
  const requestSave = (over: Partial<Cfg>, from: SaveFrom, okMsg?: string) => {
    if (savingRef.current) return;
    // 저장 버튼도 막아 두지만, 키보드 · 재시도 등 다른 경로를 대비해 여기서 한 번 더 세운다
    if (loadFailed) return fail(LOAD_FAILED_MSG, from);
    const cfg: Cfg = { enabled, point: toInt(unlockPoint), tiers, ...over };
    if (sig(cfg.enabled, cfg.point * POINT_RATE, cfg.tiers) === snapshot) {
      if (from === "pane") closePanes();
      return showToast("변경 사항이 없습니다.", "info");
    }
    const err = checkCfg(cfg);
    if (err) return fail(err, from);
    // 서버도 정렬하지만, 관리자가 의도한 순서인지 먼저 확인받는다 (오타 하나로 보상이 엉뚱한 자리로 가지 않게)
    if (dropsOf(cfg.tiers).length) return setPendingSort({ cfg, from });
    doSave(cfg, from, okMsg);
  };

  // 해금가 칸 Enter — 비었거나 0 이면 저장하지 않고 칸 아래에 알린다(칸을 벗어날 때처럼 되돌리지 않고 고칠 기회를 준다)
  const savePrice = () => {
    if (toInt(unlockPoint) <= 0) {
      setPriceNote("해금가는 1 빙옥 이상이어야 합니다.");
      sfxErr();
      return;
    }
    lastPriceRef.current = String(toInt(unlockPoint));
    requestSave({}, "list");
  };

  // ── 티어 조작 ────────────────────────────────
  // 📌 저장 응답(applyConfig)이 목록을 서버 값으로 갈아 끼우므로, 저장 중에 바꾼 목록은 응답에 덮여 사라진다.
  //    추가 · 삭제 · 정렬 · 일괄은 저장 중이면 받지 않는다 — 단추를 흐리게 막지 않는 건 Enter 저장마다
  //    표 전체의 삭제 단추가 깜빡이지 않게 하려는 것(저장은 길어야 한순간이다)
  const addTier = () => {
    if (savingRef.current) return;
    if (tiers.length >= MAX_TIERS) return showToast(`티어는 최대 ${MAX_TIERS}개까지 만들 수 있습니다.`, "err");
    const key = `new:${++newKeyRef.current}`;
    const last = tiers[tiers.length - 1];
    const prev2 = tiers[tiers.length - 2];
    // 새 티어의 필요량 = 마지막 티어의 필요량 — 그게 0 이하이면 가장 흔한 필요량, 그것도 없으면 5,000
    const lastGap = last ? (prev2 ? last.need - prev2.need : last.need) : 0;
    const step = lastGap > 0 ? lastGap : commonStep(tiers) || 5000;
    const need = Math.min(MAX_NUM, last ? last.need + step : 5000);
    // tid 는 빈 문자열 — 저장할 때 서버가 새로 발급한다 (화면이 임의로 짓지 않는다)
    setTiers([...tiers, { key, tid: "", level: tiers.length + 1, need, free: [], paid: [] }]);
    focusKeyRef.current = key;
    showToast(`티어 ${tiers.length + 1}을(를) 추가했습니다.`, "info");
  };

  // 목록에서만 뺀다 — 열려 있던 그 티어의 편집 칸도 닫는다
  const removeLocal = (key: string) => {
    const no = tiers.findIndex((t) => t.key === key) + 1;
    const next = tiers.filter((t) => t.key !== key).map((t, i) => ({ ...t, level: i + 1 }));
    setTiers(next);
    setDraft((d) => (d?.key === key ? null : d));
    return { next, no };
  };
  const askRemove = (key: string) => {
    if (savingRef.current) return;
    const t = tiers.find((x) => x.key === key);
    if (!t) return;
    // 아직 저장 안 한 새 티어는 받은 사람이 없어 잃을 게 없다 — 확인 없이 바로 뺀다
    if (!t.tid) {
      const { no } = removeLocal(key);
      return showToast(`티어 ${no}을(를) 삭제했습니다.`, "info");
    }
    setDeleteKey(key);
  };
  const confirmRemove = () => {
    if (!deleteKey || savingRef.current) return;
    const { next, no } = removeLocal(deleteKey);
    setDeleteKey(null);
    // 📌 확인을 받았으니 바로 저장한다 — 확인 뒤에 저장 줄을 또 누르게 하던 두 단계를 하나로
    requestSave({ tiers: next }, "list", `티어 ${no}을(를) 삭제했습니다.`);
  };

  const sortTiers = () => {
    if (savingRef.current) return;
    // 초안은 key 로 티어를 가리켜 정렬해도 같은 티어를 따라간다
    setTiers([...tiers].sort((a, b) => a.need - b.need).map((t, i) => ({ ...t, level: i + 1 })));
    showToast("필요 XP 순으로 정렬했습니다.", "info");
  };

  // 표 안 필요 XP(이 티어에 필요한 양) — 칸을 벗어나면 목록에만, Enter 면 저장까지. 뒤 티어들은 필요량을 그대로 두고 누적만 밀린다
  const commitNeed = (key: string, step: number) => {
    const next = withStep(tiers, key, step);
    if (overMax(next)) {
      showToast(OVER_MAX_MSG, "err");
      return null;
    }
    setTiers(next);
    // 같은 티어의 편집 칸이 열려 있으면 그 칸 값도 맞춘다 — 칸에서 저장할 때 옛 값으로 덮지 않게
    setDraft((d) => (d && d.key === key ? { ...d, need: fmtNum(step) } : d));
    return next;
  };
  const submitNeed = (key: string, step: number) => {
    const next = commitNeed(key, step);
    if (next) requestSave({ tiers: next }, "list");
  };

  const openEditor = (key: string) => {
    const t = tiers.find((x) => x.key === key);
    if (!t) return;
    const toDraft = (r: Reward): DraftReward => ({
      key: nextRowKey(),
      kind: r.kind,
      amount: r.amount ? String(r.amount) : "",
      roleId: r.roleId,
      roleName: r.roleName,
      itemId: r.itemId,
      itemName: r.itemName,
    });
    setBulk(null);
    setPaneErr("");
    setDraft({ key, need: fmtNum(stepAt(tiers, tiers.indexOf(t))), free: t.free.map(toDraft), paid: t.paid.map(toDraft) });
  };
  // 이미 열린 줄을 다시 누르면 고치던 초안을 그대로 둔다
  const pickTier = (key: string) => {
    if (draft?.key !== key) openEditor(key);
  };
  // 편집 칸을 고치면 직전 오류 줄은 지운다
  const editDraft = (d: Draft) => {
    setDraft(d);
    setPaneErr("");
  };

  // 편집 칸 [저장] · Enter — 칸의 값을 검사해 목록에 얹고 그대로 저장한다
  const saveDraft = () => {
    if (!draft) return;
    const need = parseAmount(draft.need);
    const ne = needError(need);
    if (ne) return fail(ne, "pane");

    for (const [list, who] of [
      [draft.free, "무료"],
      [draft.paid, "프리미엄"],
    ] as [DraftReward[], string][]) {
      for (const [j, d] of list.entries()) {
        const at = list.length > 1 ? `${who} 보상 ${j + 1}` : `${who} 보상`;
        if (d.kind === "role" && !d.roleId) return fail(`${at}의 역할을 선택해 주세요.`, "pane");
        if (d.kind === "item" && !d.itemId) return fail(`${at}의 아이템을 선택해 주세요.`, "pane");
        if (d.kind === "xp" || d.kind === "point") {
          const a = parseAmount(d.amount);
          if (!Number.isFinite(a) || a < 1) return fail(`${at}의 수량을 1 이상으로 입력해 주세요.`, "pane");
          if (a > MAX_NUM) return fail(`${at}의 수량은 10억 이하로 입력해 주세요.`, "pane");
        }
      }
    }

    const fromDraft = (d: DraftReward): Reward => ({
      kind: d.kind,
      amount: d.kind === "xp" || d.kind === "point" ? parseAmount(d.amount) : 0,
      roleId: d.kind === "role" ? d.roleId : "",
      roleName: d.kind === "role" ? roleNameOf(d.roleId) || d.roleName : "",
      itemId: d.kind === "item" ? d.itemId : "",
      itemName: d.kind === "item" ? itemOf(d.itemId)?.name || d.itemName : "",
    });
    // need 칸 = 이 티어의 필요량 — 누적은 withStep 이 다시 맞춘다(뒤 티어 필요량은 그대로)
    const stepped = withStep(tiers, draft.key, need);
    if (overMax(stepped)) return fail(OVER_MAX_MSG, "pane");
    const next = stepped.map((t) =>
      t.key === draft.key
        ? { ...t, free: draft.free.slice(0, MAX_REWARDS).map(fromDraft), paid: draft.paid.slice(0, MAX_REWARDS).map(fromDraft) }
        : t
    );
    requestSave({ tiers: next }, "pane");
  };

  // ── 필요 XP 일괄 ─────────────────────────────
  const openBulk = () => {
    if (savingRef.current) return;
    setDraft(null);
    setPaneErr("");
    // 기본값 — 지금 가장 흔한 티어 필요량을 모든 티어에 같게(늘릴 양 0)
    setBulk({
      start: fmtNum(commonStep(tiers) || tiers[0]?.need || 5000),
      mode: "add",
      add: "0",
      pct: "10",
      count: String(tiers.length || 10),
    });
  };
  const editBulk = (b: Bulk) => {
    setBulk(b);
    setPaneErr("");
  };
  const plan = bulk ? bulkPlan(bulk, tiers.length) : null;
  const saveBulk = () => {
    if (!bulk) return;
    // 계산 오류는 미리보기 자리에 이미 떠 있다 — 소리로만 알린다(같은 문장을 두 번 띄우지 않게)
    if (!plan?.needs) return sfxErr();
    // 자리(순서)는 그대로 두고 필요 XP 만 갈아 끼운다 — 보상 · tid 는 그 자리의 티어에 그대로 남는다
    const next = plan.needs.map((need, i) =>
      tiers[i]
        ? { ...tiers[i], need, level: i + 1 }
        : { key: `new:${++newKeyRef.current}`, tid: "", level: i + 1, need, free: [], paid: [] }
    );
    requestSave({ tiers: next }, "pane", "필요 XP를 일괄 저장했습니다.");
  };

  // 📌 되돌리기 — 스냅샷은 applyConfig 가 받는 모양(enabled · unlockPrice · tiers[tid · level · need · free · paid])
  //    그대로라 다시 흘려 넣으면 불러온 직후 상태가 된다 (tid 기반 key 도 같게 복원된다)
  const resetToSnapshot = () => {
    if (!snap) return;
    closePanes();
    applyConfig(snap);
  };

  // 로딩 · 권한 없음 화면은 공용 가드가 만든다 (7개 파일에 복사돼 있던 것)
  if (gate) return gate;

  const maxNeed = tiers.length ? Math.max(...tiers.map((t) => t.need)) : 0;
  const draftIdx = draft ? tiers.findIndex((t) => t.key === draft.key) : -1;
  const deleteNo = deleteKey ? tiers.findIndex((t) => t.key === deleteKey) + 1 : 0;

  // 📌 저장 줄 — 불러오기 실패면 바뀐 것과 상관없이 잠근 채 이유를 띄운다(옛 저장 단추 disabled 와 같다).
  //    편집 칸이 열려 있는 동안은 숨긴다: 칸의 [저장]이 칸 값 + 나머지 변경을 한 번에 저장하므로
  //    저장 단추가 두 개 보이면 무엇이 다른지 헷갈린다.
  const barNote =
    !paneOpen && loadFailed ? <span className="font-bold text-[#d01634]">설정을 불러오지 못해 저장이 막혀 있습니다</span> : undefined;
  const barShown = (isDirty && !loadFailed && !paneOpen) || !!barNote;

  // 칸 하나 = 보상 목록. PC 는 한 줄에 하나씩 쌓고, 모바일 줄 카드는 " · " 로 이어 한 덩어리로 흐르게 한다
  const rewardCell = (list: Reward[], dot: string, track: string) => (
    <span className="inline-flex items-start gap-2 max-w-full">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-[7px] ${dot}`} />
      {/* 모바일 줄 카드에는 머리줄이 없어 트랙 이름을 앞에 붙인다 */}
      <span className="md:hidden shrink-0">{track}</span>
      {list.length === 0 ? (
        <span className="font-bold text-[#a3a3a3]">-</span>
      ) : (
        <span className="min-w-0 font-bold text-[#131313] break-keep">
          {list.map((r, j) => (
            <span key={j} className="md:block">
              {j > 0 && <span className="md:hidden text-[#a3a3a3]"> · </span>}
              {rewardLabel(r, roleNameOf, itemOf)}
            </span>
          ))}
        </span>
      )}
    </span>
  );

  const rows: Row[] = tiers.map((t, i) => ({ t, i }));
  const columns: Column<Row>[] = [
    {
      key: "no",
      label: "티어",
      className: "w-16",
      mobile: "title",
      render: ({ i }) => (
        <span className="font-black tabular-nums">
          <span className="md:hidden">티어 </span>
          {i + 1}
        </span>
      ),
    },
    {
      key: "need",
      label: "필요 XP",
      className: "w-56",
      // 📌 칸 값 = 이 티어에 필요한 양(앞 티어와의 차이), 옆 작은 글자 = 시즌 누적(저장값). 필요량이 0 이하인 옛 값은 빨강
      render: ({ t, i }) => {
        const step = stepAt(tiers, i);
        const off = movers.has(i) || t.need <= 0 || step <= 0;
        return (
          <>
            {/* 모바일 줄 카드는 통째로 단추라 입력칸을 넣을 수 없다 — 값만 보이고, 눌러서 편집 칸에서 고친다 */}
            <span className="md:hidden tabular-nums whitespace-nowrap">
              필요 XP <span className={`font-black ${off ? "text-[#d01634]" : "text-[#131313]"}`}>{step.toLocaleString()}</span>
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
              {/* 시즌 누적 — 폭 고정이라 자릿수가 바뀌어도 옆 칸이 밀리지 않는다 */}
              <span className="w-24 shrink-0 text-[11px] font-bold tabular-nums text-[#8a8a8a] whitespace-nowrap">누적 {t.need.toLocaleString()}</span>
            </span>
          </>
        );
      },
    },
    { key: "free", label: "무료 보상", className: "!pl-8", render: ({ t }) => rewardCell(t.free, "bg-[#3f83b8]", "무료") },
    { key: "paid", label: "프리미엄 보상", render: ({ t }) => rewardCell(t.paid, "bg-[#e91e3f]", "프리미엄") },
    {
      key: "act",
      label: "관리",
      align: "right",
      className: "w-32",
      // 모바일 줄 카드는 통째로 단추라 안에 단추를 둘 수 없다 — 줄을 눌러 상세 칸에서 편집 · 삭제한다
      mobile: "hide",
      render: ({ t }) => (
        <span className="inline-flex items-center justify-end gap-1">
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); pickTier(t.key); }}>
            편집
          </Btn>
          <Btn variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); askRemove(t.key); }}>
            삭제
          </Btn>
        </span>
      ),
    },
  ];

  // 편집 칸 필요 XP 아래 한 줄 — 읽은 값과 앞 티어와의 차이. 빈칸이어도 줄 높이는 남긴다(아래 보상 칸이 들썩이지 않게)
  const draftNeed = draft ? parseAmount(draft.need) : NaN;
  const draftNeedErr = draft && draft.need.trim() ? needError(draftNeed) : "";
  // 칸 값은 이 티어의 필요량 — 아래 줄에 읽은 값과 저장될 시즌 누적을 함께
  const prevNeed = draftIdx > 0 ? tiers[draftIdx - 1].need : 0;
  const needHint = !draft?.need.trim() ? (
    " "
  ) : draftNeedErr ? (
    <span className="font-bold text-[#d01634]">{draftNeedErr}</span>
  ) : (
    <span className="tabular-nums">
      {draftNeed.toLocaleString()} XP · 누적 {(prevNeed + draftNeed).toLocaleString()}
    </span>
  );

  // 정렬 확인 — 자리를 옮기는 티어를 세 개까지 한 줄씩 "티어 2 (99,999 XP) → 티어 13" 으로
  const sortMoves = pendingSort ? movedOf(pendingSort.cfg.tiers, baseNeed) : [];

  return (
    <>
      <AdminPage
        section="SYSTEM : LEVEL"
        title="시즌 패스"
        // desc 에는 어느 시즌을 만지는지와, 화면에 안 보이는 초기화 시점만 남긴다
        desc={`시즌 ${SEASON.number} ‘${SEASON.name}’ · 새 시즌이 시작되면 수령 기록과 해금 상태가 초기화됩니다. 서버 부스터는 프리미엄이 자동으로 열립니다.`}
        footer={
          <SaveBar
            dirty={isDirty && !loadFailed && !paneOpen}
            changes={changes}
            onSave={() => requestSave({}, "list")}
            onReset={resetToSnapshot}
            saving={isSaving}
            note={barNote}
          />
        }
      >
        {(loadFailed || (rolesFailed && !isLoading)) && (
          <div className="mb-5 space-y-3">
            {loadFailed && (
              <NoteLine tone="bad" action={<Btn size="sm" variant="secondary" onClick={fetchAll}>다시 불러오기</Btn>}>
                현재 설정을 불러오지 못했습니다 (/api/admin/pass). 빈 구성이 운영 설정을 덮어쓰지 않도록 저장을 막아 두었습니다.
              </NoteLine>
            )}
            {rolesFailed && !isLoading && (
              <NoteLine
                tone="warn"
                // ⚠️ fetchRoles 다 — fetchAll 로 바꾸면 서버 저장본이 덮어써져 저장 안 한 티어 편집이 사라진다
                action={<Btn size="sm" variant="secondary" onClick={fetchRoles}>다시 불러오기</Btn>}
              >
                역할 목록을 불러오지 못했습니다 (/api/discord-roles). 이미 지정된 역할 보상은 그대로 유지됩니다.
              </NoteLine>
            )}
          </div>
        )}

        {/* 기본 설정 + 요약 — 넓은 화면에서 두 열 */}
        <PanelGrid className="mb-5">
          <Panel title="기본 설정" flush>
            <FieldRow label="시즌 패스 사용" hint="끄면 보상표는 그대로 보이지만 수령 · 해금이 막힙니다" changed={enabledChanged}>
              <Inline>
                <Switch on={enabled} onChange={() => setEnabled(!enabled)} label="시즌 패스 사용" />
                <span className={`font-bold ${enabled ? "text-[#131313]" : "text-[#5a5a5a]"}`}>
                  {enabled ? "운영 중" : "중단 (수령 불가)"}
                </span>
              </Inline>
            </FieldRow>
            <FieldRow
              label="프리미엄 트랙 해금가"
              hint={
                priceNote ? (
                  <span className="font-bold text-[#d01634]">{priceNote}</span>
                ) : (
                  // 📌 빙옥 계산이 헷갈린다는 요청으로 둔 환산 한 줄(TMI 예외)
                  <span className="tabular-nums">
                    {toInt(unlockPoint).toLocaleString()} 빙옥 = {priceXp.toLocaleString()} XP 상당
                  </span>
                )
              }
              changed={priceChanged}
            >
              <Inline>
                <input
                  type="number"
                  min={1}
                  value={unlockPoint}
                  onChange={(e) => setUnlockPoint(e.target.value)}
                  // 📌 비운 채 저장하면 0 이 되어 프리미엄이 전원 무료로 열린다 — 칸을 벗어날 때 직전 값으로 되돌린다
                  onBlur={() => {
                    if (toInt(unlockPoint) <= 0) {
                      setUnlockPoint(lastPriceRef.current);
                      setPriceNote(PRICE_REVERT_MSG);
                    } else {
                      lastPriceRef.current = String(toInt(unlockPoint));
                    }
                  }}
                  // Enter = 바로 저장 (savePrice)
                  onKeyDown={(e) => enterKey(e, savePrice)}
                  placeholder="예: 300"
                  aria-label="프리미엄 트랙 해금가 (빙옥)"
                  className={numClass}
                />
                <span className="font-bold">빙옥</span>
              </Inline>
            </FieldRow>
          </Panel>

          {/* 구성 요약 — 표를 보기 전에 규모를 먼저 읽는다. 옆 칸(xl 반 폭)에서는 네 칸이 좁아 2×2 로 */}
          <StatRow
            className="xl:grid-cols-2"
            items={[
              { label: "티어 수", value: tiers.length.toLocaleString() },
              { label: "만렙 필요 XP", value: maxNeed.toLocaleString() },
              { label: "해금가 빙옥", value: toInt(unlockPoint).toLocaleString() },
              { label: "상태", value: onOffLabel(enabled) },
            ]}
          />
        </PanelGrid>

        {/* 티어 구성 — 패널 머리에 정렬 · 일괄 · 추가, 본문은 전체 폭 표 */}
        <Panel
          flush
          title={
            <>
              티어 구성 <span className="ml-1 text-[#8a8a8a] tabular-nums">{tiers.length}</span>
            </>
          }
          right={
            <>
              {/* 줄어드는 티어가 있을 때만 — 그 줄은 표에서 빨갛게 보인다 */}
              <Btn variant="ghost" size="sm" onClick={sortTiers} disabled={!badOrder}>
                정렬
              </Btn>
              <Btn variant="secondary" size="sm" onClick={openBulk} disabled={isLoading}>
                필요 XP 일괄
              </Btn>
              <Btn variant="secondary" size="sm" onClick={addTier} disabled={isLoading}>
                티어 추가
              </Btn>
            </>
          }
        >
          {/* 보상이 빈 티어는 막지 않는다 — 저장 전에 개수만 알린다 */}
          {!isLoading && emptyTierCount > 0 && (
            <NoteLine tone="neutral" inset>
              무료 · 프리미엄 보상이 모두 비어 있는 티어 {emptyTierCount}개 — 이대로도 저장됩니다.
            </NoteLine>
          )}

          {isLoading ? (
            <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>
          ) : tiers.length === 0 ? (
            <div className="p-5">
              <EmptyRow>등록된 티어가 없습니다.</EmptyRow>
            </div>
          ) : (
            // 패널이 테두리를 이미 두르고 있어 표 자체의 테두리 · 모서리는 뺀다 (선이 두 겹이 되지 않게)
            <DataTable
              className="!rounded-none !border-0"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.t.key}
              onRowClick={(r) => pickTier(r.t.key)}
              selectedKey={draft?.key ?? null}
            />
          )}

          <p className="px-5 py-3.5 border-t border-[#ededed] text-[12px] text-[#5a5a5a] leading-relaxed break-keep">
            XP · 역할 · 역할 있는 아이템은 봇 큐를 거쳐 30초 이내에, 빙옥 · 역할 없는 아이템은 즉시 지급됩니다.
            이미 수령한 티어는 보상을 바꿔도 다시 받을 수 없습니다.
          </p>
        </Panel>
      </AdminPage>

      {/* ── 티어 편집 — PC 오른쪽 칸 / 모바일 아래 판. [저장] · Enter 가 목록 반영 + 서버 저장을 한 번에 ── */}
      <DetailPane
        open={!!draft}
        onClose={closePanes}
        title={draft ? `티어 ${draftIdx + 1} 편집` : ""}
        footer={
          draft && (
            <>
              <PaneError msg={paneErr} />
              {/* 모바일은 표에 삭제 단추가 없어(줄 카드) 여기서 지운다 */}
              <Btn variant="ghost" className="mr-auto" onClick={() => askRemove(draft.key)} disabled={isSaving}>
                삭제
              </Btn>
              <Btn variant="ghost" onClick={closePanes}>
                취소
              </Btn>
              <Btn onClick={saveDraft} disabled={isSaving}>
                저장
              </Btn>
            </>
          )
        }
      >
        {draft && (
          <>
            {/* 상세 칸은 PC · 모바일 두 벌로 그려져 id 가 겹친다 — label 로 감싸 짝을 짓는다 */}
            <label className="block">
              <span className={labelClass}>
                필요 XP <span className="text-[#e91e3f]">*</span>
              </span>
              <input
                type="text"
                data-pane-need
                value={draft.need}
                onChange={(e) => editDraft({ ...draft, need: e.target.value })}
                onKeyDown={(e) => enterKey(e, saveDraft)}
                placeholder="예: 50000 · 5만 · 50k"
                className={`${inputClass} tabular-nums`}
              />
            </label>
            <p className={fieldNote}>{needHint}</p>

            <TrackEditor
              title="무료 트랙"
              tone="#3f83b8"
              rows={draft.free}
              roles={grantableRoles}
              items={regItems}
              nextKey={nextRowKey}
              onChange={(v) => editDraft({ ...draft, free: v })}
              onEnter={saveDraft}
            />
            <TrackEditor
              title="프리미엄 트랙"
              tone="#e91e3f"
              rows={draft.paid}
              roles={grantableRoles}
              items={regItems}
              nextKey={nextRowKey}
              onChange={(v) => editDraft({ ...draft, paid: v })}
              onEnter={saveDraft}
            />
          </>
        )}
      </DetailPane>

      {/* ── 필요 XP 일괄 — 첫 티어 + 간격으로 전 티어. 보상 · 순서는 그대로, [저장] · Enter 로 바로 저장 ── */}
      <DetailPane
        open={!!bulk}
        onClose={closePanes}
        title="필요 XP 일괄 설정"
        footer={
          bulk && (
            <>
              <PaneError msg={paneErr} />
              <Btn variant="ghost" className="ml-auto" onClick={closePanes}>
                취소
              </Btn>
              <Btn onClick={saveBulk} disabled={isSaving}>
                저장
              </Btn>
            </>
          )
        }
      >
        {bulk && (
          <>
            {/* flex-col gap 이 안 먹는 빌드라(메모: tailwind-v4-quirks) 칸 사이는 mb 로 */}
            <div className="mb-4">
              <p className={labelClass}>첫 티어 필요량</p>
              <Inline>
                <input
                  type="text"
                  value={bulk.start}
                  onChange={(e) => editBulk({ ...bulk, start: e.target.value })}
                  onKeyDown={(e) => enterKey(e, saveBulk)}
                  placeholder="예: 5000 · 5천"
                  aria-label="첫 티어 필요 XP"
                  className={`${inputClass} !w-36 tabular-nums`}
                />
                <span className="font-bold">XP</span>
              </Inline>
            </div>
            <div className="mb-4">
              <p className={labelClass}>티어마다 늘릴 양</p>
              <Segmented
                options={BULK_MODES}
                value={bulk.mode}
                onChange={(v) => editBulk({ ...bulk, mode: v as Bulk["mode"] })}
                className="mb-2.5"
              />
              <Inline>
                {bulk.mode === "add" ? (
                  <input
                    key="add"
                    type="text"
                    value={bulk.add}
                    onChange={(e) => editBulk({ ...bulk, add: e.target.value })}
                    onKeyDown={(e) => enterKey(e, saveBulk)}
                    placeholder="예: 0 · 1000 · 1천"
                    aria-label="티어마다 늘릴 XP"
                    className={`${inputClass} !w-36 tabular-nums`}
                  />
                ) : (
                  <input
                    key="pct"
                    type="text"
                    inputMode="decimal"
                    value={bulk.pct}
                    onChange={(e) => editBulk({ ...bulk, pct: e.target.value })}
                    onKeyDown={(e) => enterKey(e, saveBulk)}
                    placeholder="예: 10"
                    aria-label="티어마다 늘릴 비율 (%)"
                    className={`${inputClass} !w-36 tabular-nums`}
                  />
                )}
                {/* 단위 칸 폭 고정 — 방식을 바꿔도 칸이 흔들리지 않게 */}
                <span className="w-6 font-bold">{bulk.mode === "add" ? "XP" : "%"}</span>
              </Inline>
            </div>
            <div>
              <p className={labelClass}>티어 수</p>
              <Inline>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bulk.count}
                  onChange={(e) => editBulk({ ...bulk, count: e.target.value })}
                  onKeyDown={(e) => enterKey(e, saveBulk)}
                  aria-label="티어 수"
                  className={numClass}
                />
                <span className="font-bold">개</span>
              </Inline>
            </div>

            {/* 미리보기 — 지금 값 → 새 값. 바뀌는 칸만 먹색, 늘어나는 티어는 "새 티어" */}
            <div className="mt-5 pt-5 border-t border-[#ededed]">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[14px] font-black">미리보기</span>
                {plan?.needs && (
                  <span className="ml-auto text-[12px] font-bold text-[#5a5a5a] tabular-nums">
                    누적 {plan.needs[plan.needs.length - 1].toLocaleString()}
                  </span>
                )}
              </div>
              {plan?.error ? (
                <p role="alert" className="py-3 text-[12px] font-bold text-[#d01634] break-keep">
                  {plan.error}
                </p>
              ) : (
                <ol className="divide-y divide-[#ededed] border-y border-[#ededed] text-[12px] tabular-nums">
                  {(plan?.needs || []).map((n, i) => {
                    // 줄마다 이 티어의 필요량(지금 → 새 값)과 시즌 누적 — 바뀌는 칸만 먹색
                    const step = n - (i > 0 ? plan!.needs![i - 1] : 0);
                    const old = tiers[i] ? stepAt(tiers, i) : null;
                    const changed = old !== step || tiers[i]?.need !== n;
                    return (
                      <li key={i} className="flex items-center gap-2 py-1.5">
                        <span className="w-14 shrink-0 font-bold text-[#5a5a5a]">티어 {i + 1}</span>
                        <span className="min-w-0 flex-1 text-right text-[#8a8a8a]">{old == null ? "새 티어" : old.toLocaleString()}</span>
                        <span className="w-4 shrink-0 text-center text-[#a3a3a3]">→</span>
                        <span className={`w-24 shrink-0 text-right font-black ${changed ? "text-[#131313]" : "text-[#a3a3a3]"}`}>
                          {step.toLocaleString()}
                        </span>
                        <span className="w-24 shrink-0 text-right text-[11px] text-[#8a8a8a] whitespace-nowrap">누적 {n.toLocaleString()}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </>
        )}
      </DetailPane>

      {/* ── 티어 삭제 확인 — 저장된 티어만(새 티어는 확인 없이 뺀다). 확인하면 바로 저장 ── */}
      <ConfirmDialog
        open={deleteKey !== null}
        danger
        title="티어 삭제"
        confirmLabel="삭제"
        onCancel={() => setDeleteKey(null)}
        onConfirm={confirmRemove}
        body={
          <>
            티어 {deleteNo}을(를) 삭제하고 바로 저장합니다. 남은 티어의 수령 기록은 유지되지만,
            <strong className="text-[#131313]"> 이미 이 티어를 받은 유저가 있어도 티어 자체는 사라집니다.</strong>
          </>
        }
      />

      {/* ── 필요 XP 가 줄어드는 티어가 있을 때 — 정렬해서 저장할지 한 번 묻는다 ── */}
      {/* 📌 loadFailed 면 이 모달까지 오지 못한다 (requestSave 가 먼저 막는다). 혹시 뚫려도
          doSave 가 다시 막고 이유를 알리므로 버튼을 죽여 두는 대신 그쪽에 맡긴다. */}
      <ConfirmDialog
        open={!!pendingSort}
        title={SORT_TITLE}
        confirmLabel="정렬 후 저장"
        cancelLabel="돌아가기"
        busy={isSaving}
        onCancel={() => setPendingSort(null)}
        onConfirm={() => {
          if (!pendingSort) return;
          const sorted = [...pendingSort.cfg.tiers].sort((a, b) => a.need - b.need).map((t, i) => ({ ...t, level: i + 1 }));
          doSave({ ...pendingSort.cfg, tiers: sorted }, pendingSort.from, "필요 XP 순으로 정렬해 저장했습니다.");
        }}
        body={
          <>
            필요 XP 순으로 정렬한 뒤 저장합니다.
            <ul className="mt-2 font-bold text-[#131313] tabular-nums">
              {sortMoves.slice(0, 3).map((m) => (
                <li key={m.from}>
                  티어 {m.from + 1} ({m.need.toLocaleString()} XP) → 티어 {m.to + 1}
                </li>
              ))}
              {sortMoves.length > 3 && <li className="font-normal text-[#5a5a5a]">외 {sortMoves.length - 3}개</li>}
            </ul>
          </>
        }
      />

      {/* 결과 토스트 — 저장 줄이 떠 있으면 그 위로 (관리자 봇 메시지 화면과 같은 모양) */}
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
