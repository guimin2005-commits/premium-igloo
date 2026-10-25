"use client";

import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import PromoOverlay from "@/app/level/PromoOverlay";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { VOICE_TIERS, tierPaint, tierText } from "@/lib/voiceTiers";
import { POINT_RATE } from "@/lib/pointRate";
import { parseTargetKeys, MAX_TARGETS } from "@/lib/adminTargetKeys";
import { groupOrders } from "@/lib/orderGroups";
import { hotTimeState } from "@/lib/hotTime";
import { BOOSTER_LADDER_MAX } from "@/lib/booster";
import { QUEST_REASONS, QUEST_METRICS, QUEST_DAY_LABELS, questReasonOf, questCondLabel, questTimed } from "@/lib/questKinds";
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
  Switch,
  Btn,
  SaveBar,
  SearchInput,
  StatusChip,
  DataTable,
  DetailPane,
  useNotice,
  useToast,
  ChoiceChip,
  FormSheet,
  ConfirmDialog,
  useAdminGuard,
  backdropClose,
} from "../ui";
import type { Column } from "../ui";

const CHANNEL_TYPE_LABEL: Record<string, string> = { text: "텍스트", voice: "음성", category: "카테고리" };
const CHANNEL_TYPE_ICON: Record<string, string> = { text: "#", voice: "🔊", category: "📁" };
const REASON_LABEL: Record<string, string> = { chat: "채팅", voice: "음성", attend: "출석", effect: "효과", "effect-levelup": "레벨업 효과" };
const PERIOD_LABEL: Record<string, string> = { daily: "일일", weekly: "주간", monthly: "월간" };

// 📌 주기별 무작위 노출 개수 — 등록된 퀘스트 중 매 주기마다 이 개수만큼 뽑아 보여준다 (0이면 전부)
//    rr: 주기별 퀘스트 바꾸기(리롤) 무료 횟수 — 유저마다 그 주기에 아직 달성하지 않은 퀘스트를 이만큼 무료로 다른 퀘스트로(0 = 무료 없음 · 최대 5, lib/questKinds.js "바꾸기")
//    price: 무료를 다 쓴 뒤 1회마다 내는 빙옥(0 = 유료 끔 · 0~100 · 횟수 제한 없음) · priceDef: 칸이 없을 때 값(2026-10-11)
const QUEST_PICK_FIELDS = [
  { period: "daily", key: "questPickDaily", rr: "questRerollDaily", price: "questRerollPriceDaily", priceDef: 1, every: "매일 자정" },
  { period: "weekly", key: "questPickWeekly", rr: "questRerollWeekly", price: "questRerollPriceWeekly", priceDef: 2, every: "매주 월요일" },
  { period: "monthly", key: "questPickMonthly", rr: "questRerollMonthly", price: "questRerollPriceMonthly", priceDef: 3, every: "매월 1일" },
];
const PICK_KEYS = QUEST_PICK_FIELDS.flatMap((f) => [f.key, f.rr, f.price]);
// 📌 무료 바꾸기 칸이 없을 때 값 — 3회(아래 SETTING_DEFAULT questReroll* 와 같은 값. 예전 1 이 칸 · 요약 · 되돌리기 바탕에 남아 있었다)
const REROLL_FREE_DEF = 3;
const pickDefault = (k: string) => QUEST_PICK_FIELDS.find((f) => f.price === k)?.priceDef ?? (k.startsWith("questReroll") ? REROLL_FREE_DEF : 0);
// 주기 요약의 바꾸기 꼬리 — "· 바꾸기 무료 1 · 그다음 빙옥 1" · 무료만 "· 바꾸기 무료 1" · 유료만 "· 바꾸기 빙옥 1" · 둘 다 0 이면 없음
const rerollSummary = (free: number, price: number) =>
  free > 0 && price > 0 ? ` · 바꾸기 무료 ${free} · 그다음 빙옥 ${price}`
  : free > 0 ? ` · 바꾸기 무료 ${free}`
  : price > 0 ? ` · 바꾸기 빙옥 ${price}`
  : "";

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
// 📌 2026-10-25 헤드셋 끔은 늘 차단(아래 「헤드셋 끔」 줄) — 그래서 any 는 사실상 마이크만 끈 사람, both 는 헤드셋까지 끈 사람(이미 차단)에게만 걸린다
const MUTE_TARGETS = [{ v: "both", l: "헤드셋까지 끔" }, { v: "any", l: "마이크만 꺼도" }];

// ── 탭 ──────────────────────────────────────────────────────
//    운영 흐름대로 네 갈래다: 규칙을 정하고(정책 — XP 가 얼마나 · 언제 더 붙는지) → 역할에 잇고(역할) →
//    돌릴 것을 만들고(퀘스트) → 주고 확인한다(지급·내역).
//    📌 2026-10-17 관리 화면 정리 — 「콘텐츠」 탭을 「퀘스트」로 바꿨다. 채널 정책 · 기간제 부스트는 XP 정책이라 정책 탭(XP 이벤트 · 채널 정책)으로 옮겼다.
//       알림 채널 패널 5개는 봇 메시지 「보내는 곳」, 서포터즈는 서포터즈 › 설정, RANKER 는 시즌 전환, ARCTIC 상점 공개는 상점 관리 › 설정으로 옮겼다.
const TAB_ORDER: { id: string; short: string }[] = [
  { id: "policy", short: "정책" },
  { id: "roles", short: "역할" },
  { id: "quests", short: "퀘스트" },
  { id: "ledger", short: "지급·내역" },
];

// 📌 ?sec= — 그 패널(id="sec-…")로 한 번 스크롤한다(기능 검색 · 다른 화면의 바로가기). 모르는 값이면 스크롤하지 않는다.
//    tier · inventory 는 옛 패널(음성 티어 역할 일괄 연결 · 인벤토리 표기) — 합친 표 / 역할 탭 첫 패널로
const SEC_ANCHOR: Record<string, Record<string, string>> = {
  policy: { xp: "xp", streak: "streak", booster: "booster", muting: "muting", afk: "afk", enhance: "enhance", events: "events", hottime: "hottime", boosts: "boosts", channels: "channels", public: "public" },
  roles: { reward: "reward", tier: "reward", inventory: "reward", protected: "protected", promo: "promo" },
  quests: { quests: "quests" },
  ledger: { grant: "grant", logs: "logs", reset: "reset" },
};
// 📌 다른 화면으로 옮긴 패널의 옛 주소 → 그 화면으로 넘겨준다(글쓰기 「채널 없음」 · ARCTIC 「비공개」 · 서포터즈 「역할 지정」 · 북마크).
//    mute 는 예전 '음소거 · 퇴장' 묶음의 공개 토글을 찾는 주소 — 그 주소를 쓰는 곳(ARCTIC 상점 비공개 안내)은 상점 공개를 찾는다 → 상점 관리 › 설정
const MOVED_SEC: Record<string, Record<string, string>> = {
  policy: {
    levelup: "/admin/messages?key=levelUp",
    rolegrant: "/admin/messages?key=roleGrant",
    attendnotice: "/admin/messages?key=autoAttend",
    notice: "/admin/messages?key=noticePost",
    expiry: "/admin/messages?key=expiryReminder",
    mute: "/admin/shop?open=settings",
  },
  roles: {
    supporter: "/admin/supporters?tab=settings",
    ranker: "/admin/role-migration?tab=ranker",
  },
};
// 옛 「콘텐츠」 탭 주소(기능 검색 · 북마크 — tab=content&sec=quests|boosts|channels) — 채널 정책 · 기간제 부스트는 정책 탭, 나머지는 퀘스트 탭
const fromContentTab = (sec: string) => (sec === "boosts" || sec === "channels" ? { tab: "policy", sec } : { tab: "quests", sec: "quests" });

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 같은 건(_id)은 한 번만 — 앞의 것을 남긴다(아이템 지급 내역 더 보기의 겹친 건 · app/admin/shop 과 같은 함수)
const uniqById = <T extends { _id?: unknown }>(rows: T[]) => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = String(r?._id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
// 📌 아이템 지급 내역 쪽 크기 · 다시 읽기 한도 — app/api/admin/items/grant 의 PAGE · PAGE_MAX 와 같은 값
const ITEM_GRANT_PAGE = 300;
const ITEM_GRANT_MAX = 3000;

// datetime-local 입력값 ↔ Date 변환 (로컬 시간 기준)
const toLocalInput = (v: string | Date) => {
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ts = (v: string | Date) => new Date(v).getTime();

// 📌 지급 내역 한 줄 — 봇 자동 지급(XpLog) · 관리자 수동 지급(Payout) · 아이템 지급(Purchase 운영진 지급) · 지급 대기열(Payout 대기 · 실패)을
//    한 모양으로 맞춘 것. src 로 어느 쪽인지 구분하고, 한쪽에만 있는 값(채널명 · 처리 상태 · 수량)은 선택 항목으로 둔다.
//    payout · grant — 줄 끝 동작(지급 취소 · 지급 완료 · 사유 · 회수)이 쓰는 원본
type PayoutDoc = {
  _id: string; userName?: string; userId?: string; amount?: number; currency?: string; reason?: string;
  status?: string; error?: string; source?: string; kind?: string; createdAt: string;
};
type GrantGroup = {
  _id: string; ids?: string[]; userName?: string; userId?: string; itemName?: string; qty?: number;
  days?: number; adminNote?: string; status: string; createdAt: string;
};
type LedgerRow = {
  k: string;
  src: "bot" | "manual" | "item" | "pending";
  kind: string; // 구분 칩 글자 — 채팅 · 음성 · 출석 · 효과 · 수동 · 아이템 · 퀘스트 …
  at: string | Date;
  name: string;
  amount?: number;
  unit?: string; // "XP" | "빙옥" — 수동 지급 재화
  qty?: number; // 아이템 수량
  note: string;
  channelName?: string;
  status?: string | null;
  error?: string | null;
  payout?: PayoutDoc;
  grant?: GrantGroup;
};
// 지급 내역 거르기 — 봇 사유(chat · voice · attend · effect)는 /api/xp-logs 로, 나머지는 각자의 목록으로
const LEDGER_FILTERS = [
  { v: "", l: "전체" },
  { v: "chat", l: "채팅" },
  { v: "voice", l: "음성" },
  { v: "attend", l: "출석" },
  { v: "effect", l: "효과" },
  { v: "manual", l: "수동" },
  { v: "item", l: "아이템" },
  { v: "pending", l: "대기" },
];
const BOT_FILTERS = new Set(["", "chat", "voice", "attend", "effect"]);
// 지급 대기열 출처(Payout.source) — 대기 줄의 구분 칩
const PAYOUT_SOURCE: Record<string, string> = { manual: "수동", admin: "수동", quest: "퀘스트", code: "코드", referral: "초대", etc: "기타" };
// 지급 대기열 상태 — 수동 · 대기 줄의 칩
const payoutChip = (s?: string | null): { l: string; tone: "ok" | "warn" | "bad" | "info" } =>
  s === "paid" ? { l: "완료", tone: "ok" } : s === "failed" ? { l: "실패", tone: "bad" } : s === "processing" ? { l: "처리 중", tone: "info" } : { l: "대기", tone: "warn" };
// 지급 취소 — 아직 지급되지 않은 XP 건(대기 · 실패)만(app/api/payout DELETE 와 같은 조건) · 지급 완료 — 대기로 남은 빙옥 기록만(PUT)
const payoutCancelable = (p?: PayoutDoc) => !!p && p.currency !== "point" && (p.status === "pending" || p.status === "failed");
const payoutCompletable = (p?: PayoutDoc) => !!p && p.currency === "point" && p.status === "pending";

// 📌 수동 지급 — 한 폼에서 XP · 빙옥 · 아이템을 고른다. 아이템 기간은 영구/7일/30일/직접 입력.
type GrantKind = "xp" | "point" | "item";
const GRANT_KINDS = [{ v: "xp", l: "XP" }, { v: "point", l: "빙옥" }, { v: "item", l: "아이템" }];
const ITEM_GRANT_DAYS = [{ v: "0", l: "영구" }, { v: "7", l: "7일" }, { v: "30", l: "30일" }, { v: "custom", l: "직접 입력" }];
const EMPTY_ITEM_GRANT = { itemId: "", daysMode: "0", days: "", target: "", reason: "", qty: "1" };
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
const EMPTY_QUEST = {
  id: "", name: "", desc: "", period: "daily", reason: "chat", metric: "count", hourFrom: "", hourTo: "",
  // 📌 2026-10-03 조건 칸 — 요일 · 채널 · 음성 상황 · 하루 기준(lib/questKinds.js normalizeQuestCond 가 대상에 맞게 정리)
  days: [] as number[], channelIds: [] as string[], minPeople: "", live: false, micOn: false, dayMin: "",
  target: 1, rewardXp: 0, rewardPoint: 0, enabled: true, order: 0,
};
// 저장된 퀘스트 → 편집 칸(빈 칸은 "" 로)
const questToForm = (q: any) => ({
  id: q._id, name: q.name, desc: q.desc || "", period: q.period || "daily", reason: q.reason, metric: q.metric,
  hourFrom: q.hourFrom ?? "", hourTo: q.hourTo ?? "",
  days: Array.isArray(q.days) ? q.days : [], channelIds: Array.isArray(q.channelIds) ? q.channelIds : [],
  minPeople: q.minPeople ? String(q.minPeople) : "", live: !!q.live, micOn: !!q.micOn, dayMin: q.dayMin ? String(q.dayMin) : "",
  target: q.target, rewardXp: q.rewardXp, rewardPoint: q.rewardPoint || 0, enabled: q.enabled, order: q.order,
});
const QUEST_WEEKDAYS = [1, 2, 3, 4, 5];
const QUEST_WEEKEND = [0, 6];

// 📌 퀘스트 측정 대상 고르기 — XP 지급 기록(채팅 · 음성 · 출석 · 효과 · 전체) · 활동(봇이 세는 메시지 · 답장 · 반응 …) ·
//    기록(연속 출석 · 구매 · 강화 · 패스 · 퀘스트 완료)을 묶어 보여 준다(lib/questKinds.js)
const QUEST_REASON_OPTIONS = [
  { value: "_log", label: "XP 지급 기록", group: true },
  ...QUEST_REASONS.filter((r) => r.src === "log").map((r) => ({ value: r.v, label: r.l, hint: r.hint, indent: true })),
  { value: "_act", label: "활동", group: true },
  ...QUEST_REASONS.filter((r) => r.src === "act").map((r) => ({ value: r.v, label: r.l, hint: r.hint, indent: true })),
  { value: "_rec", label: "기록", group: true },
  ...QUEST_REASONS.filter((r) => r.src !== "log" && r.src !== "act").map((r) => ({ value: r.v, label: r.l, hint: r.hint, indent: true })),
];
// 📌 대상 · 방식마다 바뀌는 안내(측정 방식 · 목표치)는 늘 두 줄 높이를 잡아 둔다 — 고를 때마다 아래 칸이 오르내리지 않게
//    (fieldNote 12px × leading-relaxed 1.625 × 2줄 ≈ 39px)
const HINT_2LINE = "block min-h-[39px]";
// 목표치 칸 아래 한 줄 — 대상 · 세는 방식마다
const questTargetHint =(reason: string, metric: string) => {
  if (reason === "streak") return "연속 출석 일수 — 주간 · 월간은 이 주기 안에서 이어진 날만 셉니다";
  if (reason === "shop" && metric === "xp") return "ARCTIC 구매에 쓴 XP 합계";
  if (reason === "shop" && metric === "point") return "ARCTIC 구매에 쓴 빙옥 합계";
  if (reason === "shop") return "ARCTIC 구매 건수 — 운영진 지급 · 시즌 패스 보상 · 환불 · 취소 제외";
  if (reason === "enhance") return "강화 횟수 — 1단계 = 1회";
  if (reason === "pass") return "시즌 패스 보상을 받은 칸 수";
  if (reason === "quest") return "이 주기에 보상을 받은 다른 퀘스트 수 (이 퀘스트는 제외)";
  if (metric === "xp") return "달성에 필요한 XP 합계";
  if (metric === "minute") return "달성에 필요한 접속 시간 (분) — 예: 2시간이면 120";
  if (metric === "day") return "기간 안에서 기록이 있는 날 수 (KST) — 하루 기준을 넣으면 그 이상인 날만";
  if (metric === "run") return "기록이 끊기지 않고 이어진 날 수 (KST, 가장 긴 구간)";
  if (metric === "channel") return "기록이 있는 서로 다른 채널 수";
  if (questReasonOf(reason)?.src === "act") return "달성에 필요한 횟수";
  return "달성에 필요한 지급 횟수";
};
// 측정 방식 칸 아래 한 줄 — 대상 · 방식마다
const questMetricHint = (reason: string, metric: string) => {
  const r = questReasonOf(reason);
  const src = r?.src || "log";
  if (src !== "log" && src !== "act" && !(r?.metrics.length && r.metrics.length > 1)) return "이 대상은 정해진 방식으로만 판정합니다.";
  if (metric === "xp") return reason === "shop" ? "쓴 XP의 합계로 판정합니다." : "받은 XP의 합계로 판정합니다.";
  if (metric === "point") return "쓴 빙옥의 합계로 판정합니다.";
  if (metric === "minute") return "음성 채널에 머문 시간(분)으로 판정합니다.";
  const voiceUnit = reason === "voice" ? " 음성은 지급 주기만큼 머문 것만 셉니다." : "";
  if (metric === "day") return `기록이 있는 서로 다른 날 수로 판정합니다. (KST)${voiceUnit}`;
  if (metric === "run") return `가장 길게 이어진 날 수로 판정합니다. (KST)${voiceUnit}`;
  if (metric === "channel") return `기록이 있는 서로 다른 채널 수로 판정합니다.${voiceUnit}`;
  if (src === "act") return reason === "msg" ? "보낸 메시지 수로 판정합니다. 같은 사람은 3초에 한 번만 셉니다." : reason === "vjoin" ? "음성 채널에 들어간 횟수로 판정합니다. 1분에 한 번만 셉니다." : reason === "react" || reason === "reacted" ? "같은 메시지 · 같은 이모지는 하루 한 번만 셉니다." : "횟수로 판정합니다.";
  if (reason === "shop") return "주문 한 줄 = 1건으로 판정합니다.";
  return "XP를 받은 횟수로 판정합니다. (음성은 머문 시간 ÷ 지급 주기)";
};

// 📌 연속 출석 보너스 규칙 — BotSetting.attendStreakRules 한 줄. 입력 중엔 글자로 들고, 정리는 app/api/bot-settings 가 한다
const EMPTY_STREAK_RULE = { days: "", xp: "", point: "", repeat: false };
const MAX_STREAK_RULES = 10; // app/api/bot-settings 와 같은 상한
const STREAK_COLS = ["연속 일수", "XP", "빙옥", "배수마다 반복"];
// 서버는 잘못된 줄(일수 범위 밖 · 보상 없음 · 같은 일수)을 말없이 버린다 — 저장 전에 알려 준다
const streakRuleError = (rows: any): string => {
  if (!Array.isArray(rows)) return "";
  const seen = new Set<number>();
  for (const r of rows) {
    const days = Number(r?.days);
    if (!Number.isInteger(days) || days < 1 || days > 365) return "연속 일수는 1~365 사이로 입력해 주세요.";
    // 서버는 소수점을 버린다(0.5 → 0) — 같은 기준으로 본다
    if (!(Math.floor(Number(r?.xp)) > 0) && !(Math.floor(Number(r?.point)) > 0)) return `${days}일 규칙에 보상이 없습니다.`;
    if (seen.has(days)) return `${days}일 규칙이 두 개입니다.`;
    seen.add(days);
  }
  return "";
};

// 📌 서버 부스터 보상(2026-10-25) — 연속 부스팅 단계 BotSetting.boosterLadder 한 줄. 입력 중엔 글자로 들고, 정리는 app/api/bot-settings(lib/booster.js boosterRewardsOf)가 한다
const EMPTY_LADDER_ROW = { months: "", xp: "", point: "" };
const LADDER_COLS = ["연속 개월", "XP", "빙옥"];
// 서버는 잘못된 줄(개월 범위 밖 · 보상 없음 · 같은 개월)을 말없이 버린다 — 저장 전에 알려 준다
const ladderError = (rows: any): string => {
  if (!Array.isArray(rows)) return "";
  const seen = new Set<number>();
  for (const r of rows) {
    const m = Number(r?.months);
    if (!Number.isInteger(m) || m < 1 || m > 120) return "연속 개월은 1~120 사이로 입력해 주세요.";
    if (!(Math.floor(Number(r?.xp)) > 0) && !(Math.floor(Number(r?.point)) > 0)) return `${m}개월 단계에 보상이 없습니다.`;
    if (seen.has(m)) return `${m}개월 단계가 두 개입니다.`;
    seen.add(m);
  }
  return "";
};

// ── 저장 줄(SaveBar) 용 ─────────────────────────────────────
//    설정은 BotSetting 단일 문서 하나라 정책 · 보호 역할 · 퀘스트 노출이 모두 같은 저장을 탄다.
//    그래서 저장 줄도 하나 — 불러온 값(스냅샷)과 지금 값을 비교해 바뀐 게 있으면 어느 탭에서든 뜬다
//    (예전에는 다른 탭에서 고친 값이 이 탭의 '저장'에 조용히 묻어 나갔다).
//    📌 다른 화면으로 옮긴 칸(알림 채널 · 서포터즈 · RANKER · 상점 공개)은 여기 없다 — POST 도 그 칸을 쓰지 않는다(app/api/bot-settings)
const SETTING_LABEL: Record<string, string> = {
  chatXpMin: "채팅 XP 최소",
  chatXpMax: "채팅 XP 최대",
  chatCooldownSec: "채팅 쿨타임",
  voiceXp: "음성 XP",
  voiceIntervalSec: "음성 지급 주기",
  attendXp: "출석체크 XP",
  attendVoiceMin: "출석 인정 시간",
  attendStreakEnabled: "연속 출석 보너스",
  attendStreakRules: "연속 출석 규칙",
  boosterStartXp: "최초 부스팅 XP",
  boosterStartPoint: "최초 부스팅 빙옥",
  boosterLadder: "연속 부스팅 단계",
  boosterLadderOn: "연속 부스팅 보상",
  ...Object.fromEntries(ENHANCE_FIELDS.flatMap((g) => g.fields.map((f) => [f.key, `${g.label} 강화 ${f.label}`]))),
  muteMode: "음소거 처리",
  muteReducePct: "감소 비율",
  muteTarget: "적용 기준",
  afkCheckOn: "AFK 방지 시스템",
  afkCheckFirstMin: "AFK 방지 첫 확인",
  afkCheckSanctionMin: "AFK 방지 첫 확인(제재 이력)",
  afkCheckMinMin: "AFK 방지 다음 확인 최소",
  afkCheckMaxMin: "AFK 방지 다음 확인 최대",
  afkCheckReplyMin: "AFK 방지 응답 시간",
  hotTimeOn: "핫타임",
  hotTimeName: "핫타임 이름",
  hotTimeFrom: "핫타임 시작",
  hotTimeUntil: "핫타임 끝",
  hotTimeWeekdayMult: "핫타임 평일 배수",
  hotTimeWeekendMult: "핫타임 금토일 배수",
  levelPublic: "SYSTEM : LEVEL 공개",
  resetOnLeave: "퇴장 시 XP 초기화",
  protectedRoleIds: "보호 역할",
  questPickDaily: "일일 노출 개수",
  questPickWeekly: "주간 노출 개수",
  questPickMonthly: "월간 노출 개수",
  questRerollDaily: "일일 무료 바꾸기",
  questRerollWeekly: "주간 무료 바꾸기",
  questRerollMonthly: "월간 무료 바꾸기",
  questRerollPriceDaily: "일일 유료 바꾸기 값",
  questRerollPriceWeekly: "주간 유료 바꾸기 값",
  questRerollPriceMonthly: "월간 유료 바꾸기 값",
};
// 화면이 비어 있을 때 대신 보여 주던 값 — 비교 · 변경 목록에서도 같은 값으로 친다
const SETTING_DEFAULT: Record<string, number> = {
  boosterStartXp: 150000,
  boosterStartPoint: 30,
  chatXpMin: 50,
  chatXpMax: 500,
  attendVoiceMin: 60,
  questPickDaily: 0,
  questPickWeekly: 0,
  questPickMonthly: 0,
  questRerollDaily: 3,
  questRerollWeekly: 3,
  questRerollMonthly: 3,
  questRerollPriceDaily: 1,
  questRerollPriceWeekly: 2,
  questRerollPriceMonthly: 3,
  ...Object.fromEntries(ENHANCE_FIELDS.flatMap((g) => g.fields.map((f) => [f.key, f.def]))),
};
const SETTING_TEXT = new Set(["attendStreakRules", "boosterLadder"]);
// 입력칸은 문자열, 서버 값은 숫자 · 빈 값은 기본값처럼 — 겉보기가 같으면 같은 값으로 본다
// 핫타임 기간 입력 — 저장값(ISO)은 [시작일 0시, 끝나는 날 다음 날 0시) KST. 입력칸은 날짜만
const kstDay = (v: unknown, end = false) => {
  const t = v ? new Date(String(v)).getTime() : NaN;
  if (!Number.isFinite(t)) return "";
  return new Date(t - (end ? 1 : 0) + 9 * 3600e3).toISOString().slice(0, 10);
};
const dayStartIso = (d: string) => (d ? new Date(`${d}T00:00:00+09:00`).toISOString() : null);
const dayEndIso = (d: string) => (d ? new Date(new Date(`${d}T00:00:00+09:00`).getTime() + 86400e3).toISOString() : null);

const normSetting = (k: string, v: any) => {
  if (k === "resetOnLeave" || k === "levelPublic" || k === "attendStreakEnabled" || k === "hotTimeOn" || k === "boosterLadderOn") return String(!!v);
  // 핫타임 기간 — 서버는 ISO 글자, 입력칸은 그날 0시(KST) ISO 로 넣으므로 시각으로 맞춰 비교한다
  if (k === "hotTimeFrom" || k === "hotTimeUntil") { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? String(t) : ""; }
  if (k === "hotTimeWeekdayMult" || k === "hotTimeWeekendMult") return v == null || v === "" ? "" : String(Number(v));
  if (k === "muteMode") return v || "off";
  if (k === "muteTarget") return v || "both";
  // 규칙 표 — 입력 중엔 글자("7"), 서버 값은 숫자(7)라 칸 모양으로 맞춰 비교한다
  if (k === "boosterLadder") {
    return Array.isArray(v) && v.length ? JSON.stringify(v.map((r: any) => [String(r?.months ?? ""), String(r?.xp ?? ""), String(r?.point ?? "")])) : "";
  }
  if (k === "attendStreakRules") {
    return Array.isArray(v) && v.length
      ? JSON.stringify(v.map((r: any) => [String(r?.days ?? ""), String(r?.xp ?? ""), String(r?.point ?? ""), !!r?.repeat]))
      : "";
  }
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

// 📌 수동 지급 대상 — 한 칸에 여러 명(줄바꿈 · 쉼표). 입력이 멈추면 400ms 뒤 /api/admin/targets 로 미리 확인해 칸 아래 칩으로 보인다.
//    키 나누기는 서버와 같은 lib/adminTargetKeys.js — 화면이 확인한 키 그대로 targets 로 보낸다(1명이면 서버가 한 명 경로로 받는다).
type TargetCheck = {
  found: { userId: string; name: string; username: string }[];
  missing: string[];
  ambiguous: { key: string; candidates: { userId: string; name: string }[] }[];
};
function useTargetCheck(text: string) {
  const keys: string[] = parseTargetKeys(text);
  const sig = keys.join("\n");
  const [res, setRes] = useState<{ sig: string; data: TargetCheck | null } | null>(null);
  // 다시 확인 — 지급이 404 · 409(못 찾음 · 이름 겹침)로 막히면 같은 입력이라도 다시 본다(그 사이 이름이 바뀐 경우)
  const [nonce, setNonce] = useState(0);
  const recheck = () => { setRes(null); setNonce((n) => n + 1); };
  // 요청 번호 — 늦게 온 옛 입력의 응답은 버린다
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    if (!sig) return;
    const list = sig.split("\n");
    if (list.length > MAX_TARGETS) return;
    const t = setTimeout(() => {
      fetch("/api/admin/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys: list }) })
        .then((r) => r.json().then((d) => (r.ok && d?.success ? (d.data as TargetCheck) : null)).catch(() => null))
        .catch(() => null)
        .then((data) => { if (my === seq.current) setRes({ sig, data }); });
    }, 400);
    return () => clearTimeout(t);
  }, [sig, nonce]);
  const fresh = res && res.sig === sig ? res : null;
  const data = fresh?.data || null;
  const tooMany = keys.length > MAX_TARGETS;
  const problems = !!data && (data.missing.length > 0 || data.ambiguous.length > 0);
  // 잠금 — 200명 초과 · 못 찾음 · 이름 겹침 · 여러 명인데 아직 확인 전(확인 창에 보일 이름이 없다). 1명은 확인 전이어도 서버가 다시 본다
  const locked = tooMany || problems || (keys.length > 1 && !data);
  return {
    keys,
    data,
    shown: sig ? res?.data || null : null, // 확인 중에는 직전 결과를 흐리게
    pending: !!sig && !tooMany && !fresh,
    failed: !!fresh && !fresh.data,
    tooMany,
    locked,
    recheck,
  };
}
type TargetCheckState = ReturnType<typeof useTargetCheck>;
// 지급 응답이 대상 때문에 막혔나 — 못 찾음(404) · 여러 명 409(missing · ambiguous) · 한 명 이름 겹침 409(candidates)
//    "이미 모두 보유" 같은 다른 409 는 대상 문제가 아니다
const targetRejected = (r: Response, d: { missing?: unknown; ambiguous?: unknown; candidates?: unknown } | null) =>
  r.status === 404 || (r.status === 409 && !!d && (Array.isArray(d.missing) || Array.isArray(d.ambiguous) || Array.isArray(d.candidates)));
// 겹치는 이름 칩에서 후보를 고르면 그 키를 유저 ID 로 바꾼다
const pickTargetKey = (keys: string[], key: string, userId: string) => keys.map((k) => (k === key ? userId : k)).join("\n");

// 대상 칸 — 한 줄로 시작해 내용만큼 자라고, 5줄쯤부터는 칸 안에서 스크롤
const TARGET_MAX_H = 124;
const fitTarget = (el: HTMLTextAreaElement) => {
  if (!el.offsetWidth) return; // 숨은 칸(폭 0)은 재지 않는다 — 보일 때 아래 감시가 다시 잰다
  el.style.height = "auto";
  const full = el.scrollHeight + (el.offsetHeight - el.clientHeight);
  el.style.height = `${Math.min(full, TARGET_MAX_H)}px`;
  el.style.overflowY = full > TARGET_MAX_H ? "auto" : "hidden";
};
function TargetInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fitTarget(ref.current);
  }, [value]);
  // 칸 폭이 바뀌면(창 크기 · 화면 회전) 줄바꿈이 달라진다 — 폭이 바뀔 때만 다시 잰다(높이 변화로는 다시 돌지 않게)
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (el.offsetWidth === w) return;
      w = el.offsetWidth;
      fitTarget(el);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <textarea ref={ref} rows={1} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
      placeholder="ID · 이름" className={`${inputClass} block resize-none`} />
  );
}

// 대상 칸 아래 한 줄 — 찾은 사람(앞 8명) · 못 찾은 키(✕) · 겹치는 이름(?, 누르면 후보)
const TARGET_CHIPS = 8;
const chipBtn = "inline-flex max-w-full min-w-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/20";
function TargetChips({ check, onPick }: { check: TargetCheckState; onPick: (key: string, userId: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const { keys, shown, pending, failed, tooMany } = check;
  if (!keys.length) return null;
  if (tooMany) {
    return (
      <div className="mt-1.5 flex flex-wrap gap-1 min-w-0">
        <StatusChip tone="bad">{keys.length.toLocaleString()}명 · 최대 {MAX_TARGETS}명</StatusChip>
      </div>
    );
  }
  const found = shown?.found || [];
  const missing = shown?.missing || [];
  const amb = shown?.ambiguous || [];
  const openAmb = amb.find((a) => a.key === open);
  return (
    <div className={`mt-1.5 min-w-0 transition-opacity ${pending && shown ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-1 min-w-0">
        {!shown && (failed ? <StatusChip tone="bad">확인 실패</StatusChip> : <StatusChip>…</StatusChip>)}
        {found.slice(0, TARGET_CHIPS).map((f) => (
          <StatusChip key={`f${f.userId}`} tone="ok" className="max-w-full min-w-0"><span className="truncate" title={f.userId}>{f.name}</span></StatusChip>
        ))}
        {found.length > TARGET_CHIPS && <StatusChip>외 {(found.length - TARGET_CHIPS).toLocaleString()}명</StatusChip>}
        {missing.slice(0, TARGET_CHIPS).map((k) => (
          <StatusChip key={`m${k}`} tone="bad" className="max-w-full min-w-0"><span className="truncate">✕ {k}</span></StatusChip>
        ))}
        {missing.length > TARGET_CHIPS && <StatusChip tone="bad">✕ 외 {(missing.length - TARGET_CHIPS).toLocaleString()}개</StatusChip>}
        {amb.map((a) => (
          <button key={`a${a.key}`} type="button" className={chipBtn} aria-expanded={open === a.key}
            title={a.candidates.map((c) => `${c.name || "이름 없음"} ${c.userId}`).join("\n")}
            onClick={() => setOpen(open === a.key ? null : a.key)}>
            <StatusChip tone="warn" className="max-w-full min-w-0 cursor-pointer"><span className="truncate">{a.key} ?</span></StatusChip>
          </button>
        ))}
      </div>
      {openAmb && (
        <div className="mt-1 flex flex-wrap gap-1 min-w-0">
          {openAmb.candidates.map((c) => (
            <button key={c.userId} type="button" className={chipBtn} onClick={() => { onPick(openAmb.key, c.userId); setOpen(null); }}>
              <StatusChip className="max-w-full min-w-0 cursor-pointer hover:bg-[#e6e6e6]"><span className="truncate">{c.name || "이름 없음"} · {c.userId}</span></StatusChip>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
// 패널 안 작은 묶음 머리(XP 이벤트의 핫타임 · 기간제 부스트) — 이름 · 오른쪽 동작 한 줄
function SubHead({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 min-h-[52px] px-5 py-2.5 border-b border-[#ededed] bg-[#f7f7f7]">
      <h3 className="min-w-0 text-[13px] font-black">{children}</h3>
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}

// 등급 사다리(lib/voiceTiers) 한 칸 — 등급 · 보상 역할 표의 위쪽 고정 줄
type Tier = { key: string; name: string; min: number };
const TIERS = VOICE_TIERS as Tier[];
// 역할 설정(RoleConfig) 한 줄
type RoleCfg = { _id: string; roleId: string; roleName?: string; rewardLevel?: number | null; buffXp?: number; attendBuffXp?: number; exclusive?: boolean };
// 등급 · 보상 역할 표 한 줄 — 등급 줄(tier, 연결된 역할 cfg 는 없을 수 있다) · 그 밖의 보상 역할 줄
type RoleRow = { k: string; tier: Tier | null; cfg: RoleCfg | null };
const EMPTY_TIER_FORM = { roleId: "", buffXp: "", attendBuffXp: "" };
// 표의 빈 칸 — 모바일 줄 카드에서는 대시가 줄줄이 붙지 않게 숨긴다
const Dash = () => <span className="hidden md:inline text-[#a3a3a3]">—</span>;

// 링크를 버튼(secondary · sm) 모양으로
const LINK_PILL =
  "inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full text-[12px] font-bold whitespace-nowrap bg-white text-[#131313] border border-[#a3a3a3] hover:border-[#131313] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40";
// 공용 Dropdown(라이트)을 입력칸(inputClass)과 같은 높이 · 테두리로
const DD = "!px-3 !py-2 min-h-10 !text-[14px] !border-[#a3a3a3]";

// 📌 추천 퀘스트 창 — 목록(lib/questPresets.js · /api/admin/quests/presets)에서 골라 한 번에 등록한다. 같은 이름이 이미 있으면 잠근다(등록됨).
//    상점 관리의 추천 아이템 창(app/admin/shop PresetDialog)과 같은 모양 — 모바일은 아래에서 올라오는 판, PC 는 가운데 창.
//    머리 · 전체 선택 줄 · 아래 동작 줄은 고정이고 목록만 스크롤한다. 열 때만 그린다(열 때마다 목록을 다시 읽는다)
type QuestPresetRow = { key: string; period: string; name: string; desc: string; line: string; exists: boolean };
const PRESET_CHECK = "w-4 h-4 shrink-0 accent-[#131313] cursor-pointer disabled:cursor-default";
function QuestPresetDialog({
  onClose, onDone, notify,
}: {
  onClose: () => void;
  onDone: (d: { created?: string[]; skipped?: string[] }) => void;
  notify: (message: string, isError?: boolean) => void;
}) {
  const [rows, setRows] = useState<QuestPresetRow[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // 처음엔 아직 없는 것을 전부 골라 둔다
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/quests/presets", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((d) => {
      if (!alive) return;
      const list: QuestPresetRow[] = d?.success && Array.isArray(d.data) ? d.data : [];
      setFailed(!d?.success);
      setRows(list);
      setSel(new Set(list.filter((r) => !r.exists).map((r) => r.key)));
    });
    return () => { alive = false; };
  }, []);

  const avail = (rows || []).filter((r) => !r.exists);
  const picked = avail.filter((r) => sel.has(r.key));
  const allOn = avail.length > 0 && picked.length === avail.length;
  const toggle = (k: string) => setSel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const submit = async () => {
    if (busy || !picked.length) return;
    setBusy(true);
    const res = await fetch("/api/admin/quests/presets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: picked.map((r) => r.key) }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && d?.success) onDone(d);
    else notify(d?.message || "등록에 실패했습니다.", true);
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdropClose(busy ? undefined : onClose)}>
      <div role="dialog" aria-modal="true" aria-label="추천 퀘스트" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
          <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">추천 퀘스트</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 h-11 border-b border-[#ededed]">
          <label className="flex items-center gap-2 text-[13px] font-bold cursor-pointer">
            <input type="checkbox" className={PRESET_CHECK} checked={allOn} disabled={!avail.length || busy}
              onChange={() => setSel(allOn ? new Set() : new Set(avail.map((r) => r.key)))} />
            전체 선택
          </label>
          <span className="ml-auto text-[12px] font-bold text-[#8a8a8a] tabular-nums">{picked.length} / {avail.length}</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-2">
          {rows == null ? (
            <p className="py-12 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
          ) : failed ? (
            <p className="py-12 text-center text-[13px] text-[#d01634]">목록을 불러오지 못했습니다.</p>
          ) : (
            rows.map((r, i) => (
              <React.Fragment key={r.key}>
                {r.period !== rows[i - 1]?.period && <p className="px-5 pt-4 pb-1 text-[11px] font-black text-[#8a8a8a]">{PERIOD_LABEL[r.period] || r.period}</p>}
                <label className={`flex items-center gap-3 px-5 py-2 ${r.exists ? "cursor-default" : "cursor-pointer hover:bg-[#f2f2f2]"}`}>
                  <input type="checkbox" className={PRESET_CHECK} checked={r.exists || sel.has(r.key)} disabled={r.exists || busy} onChange={() => toggle(r.key)} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-bold ${r.exists ? "text-[#a3a3a3]" : ""}`}>{r.name}</span>
                    <span className="block truncate text-[12px] text-[#5a5a5a] tabular-nums">{r.line}</span>
                  </span>
                  {r.exists && <StatusChip className="shrink-0">등록됨</StatusChip>}
                </label>
              </React.Fragment>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center justify-end gap-3">
          <Btn className="w-[88px] shrink-0" onClick={submit} disabled={busy || rows == null || !picked.length}>{busy ? "등록 중…" : "등록"}</Btn>
        </div>
      </div>
    </div>
  );
}

export default function AdminBotPage() {
  const { isAdmin, gate } = useAdminGuard();
  // 결과 모달 — 효과음(성공 · 실패)은 useNotice 가 같이 울린다
  const { notify, noticeEl } = useNotice();
  // 📌 가벼운 저장 결과(설정 · 역할 · 채널 · 부스트 · 퀘스트 · 지급 대기 처리)는 효과음 붙은 한 줄 알림 — [확인]을 누르지 않아도 사라진다.
  //    놓치면 안 되는 결과(여러 명 지급 · 초기화 등)는 그대로 notify(모달)
  const { toast, toastEl } = useToast();
  const router = useRouter();

  // ── 탭 해석 ─────────────────────────────────
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab") || "";
  const rawSec = searchParams.get("sec") || "";

  let tab = rawTab;
  let sec = rawSec;
  if (tab === "content") ({ tab, sec } = fromContentTab(rawSec));
  else if (!TAB_ORDER.some((t) => t.id === tab)) {
    // 모르는 탭 — 첫 탭(옛 9개 탭 주소는 저장소 안에서 쓰지 않는다)
    tab = "policy";
    sec = "";
  }
  // 다른 화면으로 옮긴 패널의 옛 주소 — 그 화면으로 넘겨준다(아래 효과)
  const movedTo = MOVED_SEC[tab]?.[sec] || "";
  // 스크롤할 패널 (모르는 값이면 스크롤하지 않는다)
  const anchor = SEC_ANCHOR[tab]?.[sec] || "";
  useEffect(() => {
    if (movedTo) router.replace(movedTo);
  }, [movedTo, router]);

  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "role" | "channel" | "boost" | "quest"; id: string } | null>(null);

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
  // 📌 퀘스트 표 보기 — 전체 · 일일 · 주간 · 월간(2026-10-03). 알약 글자 · 굵기가 같아 골라도 줄이 밀리지 않는다
  const [questView, setQuestView] = useState<"all" | "daily" | "weekly" | "monthly">("all");
  // 추천 퀘스트 창 (QuestPresetDialog)
  const [questPresetOpen, setQuestPresetOpen] = useState(false);

  // 지급 내역 (봇 자동 지급 XpLog)
  const [logs, setLogs] = useState<any[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [logQuery, setLogQuery] = useState("");
  // LEDGER_FILTERS — "" 전체 · chat/voice/attend/effect 봇 사유 · manual 관리자 수동 지급(Payout) · item 아이템 지급 · pending 지급 대기열
  //    ?filter= 로 바로 열 수 있다(예: /admin/bot?tab=ledger&sec=logs&filter=pending — 옛 /payouts 대신 지급 대기열). 주소가 바뀌면 따라간다
  const filterParam = searchParams.get("filter");
  const filterFromUrl = LEDGER_FILTERS.some((f) => f.v === filterParam) ? (filterParam as string) : "";
  const [ledgerFilter, setLedgerFilter] = useState(filterFromUrl);
  const [seenFilter, setSeenFilter] = useState(filterParam);
  if (filterParam !== seenFilter) {
    setSeenFilter(filterParam);
    if (filterParam !== null) { setLedgerFilter(filterFromUrl); setLogPage(0); }
  }
  // 지급 대기열(옛 /payouts 화면) — 대기 · 처리 중 · 실패 건. 줄 끝 「지급 취소」 · 「지급 완료」
  const [queue, setQueue] = useState<PayoutDoc[]>([]);
  const [payCancel, setPayCancel] = useState<PayoutDoc | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  // 봇은 1분마다 설정을 다시 읽는다
  const saved = () => toast("저장했습니다.");

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
      // 관리 역할(서버 부스터 등)도 받는다 — 부스트 대상 · 표시용. 지급 목록은 grantableRoles 가 거른다
      fetch("/api/discord-roles?includeManaged=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/channel-config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-channels", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: null })),
      fetch("/api/xp-boost", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/daily-quest", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([cfg, roles, chCfg, channels, st, bst, qst]) => {
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
    }).finally(() => setIsLoading(false));
  }, []);

  useEffect(() => { if (isAdmin) fetchCore(); }, [isAdmin, fetchCore]);

  // 봇 자동 지급 로그 — 지급·내역 탭에서는 내역 표가 늘 보이므로 탭만 본다
  useEffect(() => {
    if (!isAdmin || tab !== "ledger") return;
    // 수동 · 아이템 · 대기는 각자의 목록만 보여 준다 — 화면에 쓰지도 않을 봇 로그를 부를 이유가 없다
    if (!BOT_FILTERS.has(ledgerFilter)) return;
    const qs = new URLSearchParams({ limit: "50", skip: String(logPage * 50) });
    if (ledgerFilter) qs.set("reason", ledgerFilter);
    if (logQuery.trim()) qs.set("q", logQuery.trim());
    fetch(`/api/xp-logs?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setLogs(Array.isArray(d?.data) ? d.data : []); setLogTotal(d?.total || 0); })
      .catch(() => {});
  }, [isAdmin, tab, logPage, ledgerFilter, logQuery]);

  // 지급 대기열 — 대기 · 처리 중 · 실패(app/api/payout ?status=). 완료 기록은 내역(수동)에 남는다
  const loadQueue = useCallback(() => {
    Promise.all(
      ["pending", "processing", "failed"].map((s) =>
        fetch(`/api/payout?status=${s}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => (d?.success && Array.isArray(d.data) ? (d.data as PayoutDoc[]) : []))
          .catch(() => [] as PayoutDoc[])
      )
    ).then((lists) => setQueue(lists.flat().sort((a, b) => ts(b.createdAt) - ts(a.createdAt))));
  }, []);

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
    const ruleErr = streakRuleError(settings?.attendStreakRules) || ladderError(settings?.boosterLadder);
    if (ruleErr) { notify(ruleErr, true); return; }
    setSavingSettings(true);
    try { await postSettings(); } finally { setSavingSettings(false); }
  };

  // 퀘스트 노출 방식도 같은 문서를 저장한다
  // 📌 이 칸이 열린 동안은 저장 줄이 숨는다 — 전체를 보내면 다른 탭의 저장 안 한 수정분(레벨 공개 등)이
  //    보이지 않은 채 함께 저장됐다 → 불러온 값(스냅샷) 위에 노출 개수만 얹어 보낸다
  const savePicks = async () => {
    if (!settings || !settingsSnap) { notify("설정을 아직 불러오지 못했습니다.", true); return; }
    const pickKeys = new Set(PICK_KEYS);
    const picks = Object.fromEntries(PICK_KEYS.map((k) => [k, settings[k]]));
    const res = await fetch("/api/bot-settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settingsSnap, ...picks }),
    }).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    if (!d?.data) { notify("저장에 실패했습니다.", true); return; }
    // 다른 칸의 저장 안 한 수정분은 저장 줄에 그대로 남긴다 (fetchCore 와 같은 방식)
    const changed = Object.keys({ ...settingsSnap, ...settings })
      .filter((k) => !pickKeys.has(k) && normSetting(k, settings[k]) !== normSetting(k, settingsSnap[k]));
    setSettings({ ...d.data, ...Object.fromEntries(changed.map((k) => [k, settings[k]])) });
    setSettingsSnap(d.data);
    saved();
    setPickSnapshot(null);
    closeForm();
  };

  // 노출 방식 칸 열기/취소 — 취소는 연 시점의 값으로 되돌린다
  const openPicks = () => {
    // 아직 설정을 못 불러왔으면 붙잡을 값이 없다 — 0 으로 채워 두면 취소가 오히려 값을 0 으로 만든다
    setPickSnapshot(settings ? Object.fromEntries(PICK_KEYS.map((k) => [k, settings[k] ?? pickDefault(k)])) : null);
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
  // 📌 최근 아이템 지급 — 줄마다 사유 수정 · 회수. 역할 이전 · 역할 환불 · 역할 정리 기록은 그 도구가 다루므로 단추를 두지 않는다(API 도 막는다)
  const [noteEdit, setNoteEdit] = useState<{ key: string; ids: string[]; text: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ _id: string; ids?: string[]; userName?: string; userId?: string; itemName?: string; qty?: number } | null>(null);
  const [grantRowBusy, setGrantRowBusy] = useState(false);
  const [grantLogs, setGrantLogs] = useState<any[]>([]);
  const [isGranting, setIsGranting] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  // "all" = 전체 초기화 단추, [키] = 칸에 적은 한 명 — 이름이 "all" 인 유저를 적어도 전체로 읽지 않게 모양을 나눈다
  const [confirmReset, setConfirmReset] = useState<"all" | [string] | null>(null);
  // 📌 XP 초기화 대상 — 수동 지급 대상 칸과 따로(예전엔 같은 값을 써서 한쪽에 적으면 다른 쪽도 바뀌었다)
  const [resetTarget, setResetTarget] = useState("");
  // 📌 여러 명 지급 · 제거 — 대상 칸의 미리 확인(useTargetCheck) 결과로 이름을 보여 주고 한 번 확인한 뒤 targets 로 보낸다
  const grantCheck = useTargetCheck(grantForm.target);
  const itemCheck = useTargetCheck(itemGrant.target);
  const resetCheck = useTargetCheck(resetTarget);
  const [multiConfirm, setMultiConfirm] = useState<{ kind: "grant" | "remove" | "item"; keys: string[]; names: string[]; amount: number } | null>(null);
  const openMulti = (kind: "grant" | "remove" | "item", check: TargetCheckState, amount = 0) =>
    setMultiConfirm({ kind, keys: check.keys, names: (check.data?.found || []).map((f) => f.name), amount });

  const loadGrantLogs = useCallback(() => {
    fetch("/api/xp/grant", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGrantLogs(Array.isArray(d?.data) ? d.data : []))
      .catch(() => {});
  }, []);

  // 📌 2026-10-04 추천대로: 아이템 지급 내역 '더 보기' — 오래된 지급도 이 목록에서 찾아 회수할 수 있게(한 번에 300건, 관리 › 상점 구매 내역과 같은 방식).
  //    itemGrantsNext: 다음 쪽 커서("" 이면 끝). itemGrantsDepth: 펼친 건 수 — 지급 · 회수 · 사유 수정 뒤 다시 읽을 때 그만큼(최대 3,000) 읽어 찾은 옛 건이 사라지지 않게
  const [itemGrantsNext, setItemGrantsNext] = useState("");
  const [itemGrantsBusy, setItemGrantsBusy] = useState(false);
  const itemGrantsDepth = useRef(0);
  const loadItemGrants = useCallback(() => {
    const depth = itemGrantsDepth.current;
    fetch(`/api/admin/items/grant${depth > ITEM_GRANT_PAGE ? `?limit=${Math.min(ITEM_GRANT_MAX, depth)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const rows = Array.isArray(d?.data) ? uniqById(d.data) : [];
        setItemGrants(rows);
        itemGrantsDepth.current = rows.length;
        setItemGrantsNext(d?.hasMore && d?.next ? String(d.next) : "");
      })
      .catch(() => {});
  }, []);
  // 다음 쪽 — 쪽 끝에 걸친 한 사람분 지급(같은 orderId)은 서버가 나머지 건까지 붙여 주므로 다음 쪽과 겹칠 수 있다(_id 로 뺀다)
  const loadMoreItemGrants = async () => {
    if (itemGrantsBusy || !itemGrantsNext) return;
    setItemGrantsBusy(true);
    const d = await fetch(`/api/admin/items/grant?before=${encodeURIComponent(itemGrantsNext)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setItemGrantsBusy(false);
    if (!d?.success || !Array.isArray(d.data)) return notify("지급 내역을 더 불러오지 못했습니다.", true);
    setItemGrants((prev) => {
      const next = uniqById([...prev, ...d.data]);
      itemGrantsDepth.current = next.length;
      return next;
    });
    setItemGrantsNext(d.hasMore && d.next ? String(d.next) : "");
  };

  useEffect(() => {
    if (!isAdmin || tab !== "ledger") return;
    loadGrantLogs();
    loadItemGrants();
    loadQueue();
    // 기프트카드는 수동 지급 대상이 아니다
    fetch("/api/admin/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setGrantItems((Array.isArray(d?.data) ? d.data : []).filter((it: any) => it.type !== "physical")))
      .catch(() => {});
  }, [isAdmin, tab, loadGrantLogs, loadItemGrants, loadQueue]);

  const patchItemGrant = async (body: Record<string, unknown>, okMsg: string) => {
    if (grantRowBusy) return false;
    setGrantRowBusy(true);
    try {
      const res = await fetch("/api/admin/items/grant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) { toast(d.message || okMsg); loadItemGrants(); return true; }
      toast(d?.message || "처리에 실패했습니다.", true);
      return false;
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
      return false;
    } finally {
      setGrantRowBusy(false);
    }
  };

  // ── 지급 대기열 처리 — 옛 /payouts 화면의 「지급 취소」(대기 · 실패한 XP 건) · 「지급 완료」(대기로 남은 빙옥 기록) ──
  const afterPayout = () => { loadQueue(); loadGrantLogs(); };
  const cancelPayout = async () => {
    const p = payCancel;
    if (!p || payBusy) return;
    setPayBusy(true);
    try {
      const res = await fetch(`/api/payout?id=${encodeURIComponent(p._id)}`, { method: "DELETE" });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) toast("지급을 취소했습니다.");
      else toast(d?.error || "취소하지 못했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setPayBusy(false);
      setPayCancel(null);
      afterPayout();
    }
  };
  const completePayout = async (p: PayoutDoc) => {
    if (payBusy) return;
    setPayBusy(true);
    try {
      const res = await fetch("/api/payout", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p._id, status: "paid" }) });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.success) toast("지급 완료로 바꿨습니다.");
      else toast(d?.error || "바꾸지 못했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setPayBusy(false);
      afterPayout();
    }
  };
  const saveGrantNote = async () => {
    if (!noteEdit) return;
    if (!noteEdit.text.trim()) return toast("사유를 입력해주세요.", true);
    if (await patchItemGrant({ ids: noteEdit.ids, adminNote: noteEdit.text }, "사유를 고쳤습니다.")) setNoteEdit(null);
  };

  // 대상 — "all"(전체 단추) 또는 칸에서 나눈 키 목록(targets, 1명이면 서버가 한 명 경로로 받는다)
  const runItemGrant = async (target: "all" | string[]) => {
    if (isGranting) return;
    const days = itemGrantDays;
    setIsGranting(true);
    try {
      const res = await fetch("/api/admin/items/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // 수량 — ×N 으로 쌓이는 아이템(stackable)만. 나머지는 늘 1개(서버도 다시 판정한다)
        body: JSON.stringify({ itemId: itemGrant.itemId, ...(target === "all" ? { target } : { targets: target }), days, reason: itemGrant.reason, qty: grantQty }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        notify(d.message || "지급했습니다.");
        setItemGrant({ ...itemGrant, target: "", reason: "" });
        loadItemGrants();
      } else {
        notify(d.message || "지급에 실패했습니다.", true);
        // 못 찾음 · 이름 겹침 — 칩을 서버가 본 대로 다시 맞춘다
        if (target !== "all" && targetRejected(res, d)) itemCheck.recheck();
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsGranting(false);
      setConfirmAllItem(false);
      setMultiConfirm(null);
    }
  };

  // 📌 고른 아이템이 ×N 으로 쌓이는지(1개 단위 상품이 가리키거나 역할 없는 소모형 — /api/admin/items 의 stackable)
  const grantStackable = !!grantItems.find((it: any) => it._id === itemGrant.itemId)?.stackable;
  // 보낼 수량 — 1 ~ 99 로 자른 값. 확인 창 · 요청 · 서버가 같은 수를 쓴다
  const grantQty = grantStackable ? Math.min(99, Math.max(1, Math.trunc(Number(itemGrant.qty) || 1))) : 1;
  // 보낼 기간(일, 0 = 영구) — 확인 창 · 요청이 같은 수를 쓴다
  const itemGrantDays = itemGrant.daysMode === "custom" ? Math.max(1, Math.trunc(Number(itemGrant.days) || 0)) : Number(itemGrant.daysMode);

  const submitItemGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemGrant.itemId) return notify("지급할 아이템을 선택해 주세요.", true);
    if (!itemCheck.keys.length) return notify("지급 대상을 입력해주세요.", true);
    if (itemCheck.locked) return notify("대상을 확인해 주세요.", true);
    if (itemCheck.keys.length > 1) return openMulti("item", itemCheck);
    runItemGrant(itemCheck.keys);
  };

  // amount를 넘기면 그 값으로, 넘기지 않으면 입력값 그대로 보낸다 (제거는 음수로 뒤집는다)
  //    대상 — "all"(전체 단추) 또는 칸에서 나눈 키 목록(targets, 1명이면 서버가 한 명 경로로 받는다)
  const runGrant = async (target: "all" | string[], override?: { amount?: number; mode?: "reset" }) => {
    if (isGranting) return;
    // 초기화는 자기 대상 칸(resetTarget)을 쓴다 — 지급 칸의 금액 · 사유는 보내지 않는다(사유가 비면 서버가 「관리자 초기화」로 적는다)
    const reset = override?.mode === "reset";
    setIsGranting(true);
    try {
      const res = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(reset ? {} : { amount: grantForm.amount, reason: grantForm.reason }),
          ...(target === "all" ? { target } : { targets: target }),
          currency: grantKind === "point" && !reset ? "point" : "xp", ...override,
        }),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        notify(d.message || "처리했습니다.");
        if (reset) setResetTarget("");
        else setGrantForm({ target: "", amount: "", reason: "" });
        loadGrantLogs();
        loadQueue();
      } else {
        notify(d.message || "처리에 실패했습니다.", true);
        // 도중에 끊긴 빙옥 지급 — 반영된 사람의 기록이 남았다
        if (d?.partial) loadGrantLogs();
        // 못 찾음 · 이름 겹침 — 칩을 서버가 본 대로 다시 맞춘다
        if (target !== "all" && targetRejected(res, d)) (reset ? resetCheck : grantCheck).recheck();
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setIsGranting(false);
      setConfirmAll(false);
      setConfirmReset(null);
      setMultiConfirm(null);
    }
  };

  const submitGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantCheck.keys.length) return notify("지급 대상을 입력해주세요.", true);
    if (grantCheck.locked) return notify("대상을 확인해 주세요.", true);
    if (grantCheck.keys.length > 1) {
      const amount = Math.trunc(Number(grantForm.amount) || 0);
      if (!amount) return notify(`지급할 ${grantUnit}을 입력해주세요. (회수는 음수)`, true);
      // 음수는 회수 — [제거] 단추와 같은 확인 창(제목 · danger)으로
      return openMulti(amount < 0 ? "remove" : "grant", grantCheck, amount);
    }
    runGrant(grantCheck.keys);
  };

  // 제거 — 입력한 XP만큼 회수한다 (보유량을 넘으면 보유량까지만)
  const submitRemove = () => {
    const amount = Math.abs(Math.trunc(Number(grantForm.amount) || 0));
    if (!grantCheck.keys.length) return notify("제거할 대상을 입력해주세요.", true);
    if (!amount) return notify(`제거할 ${grantUnit}을 입력해주세요.`, true);
    if (grantCheck.locked) return notify("대상을 확인해 주세요.", true);
    if (grantCheck.keys.length > 1) return openMulti("remove", grantCheck, -amount);
    runGrant(grantCheck.keys, { amount: -amount });
  };

  // ── 등급 · 보상 역할 ──────────────────────────
  //    📌 2026-10-17 「레벨 보상 역할」 표와 「음성 티어 역할 일괄 연결」을 한 표로 합쳤다 — 같은 RoleConfig 를 두 곳에서 고쳐,
  //       표에서 등급 역할의 지급 레벨을 바꾸면 등급 칸에서 말없이 빠졌다. 이제 등급 줄(위에 고정)은 등급 칸에서만 고친다:
  //       역할 · Boost 만 고치고 지급 레벨은 그 등급 시작 레벨 · 배타(최상위 하나만 유지)로 늘 저장한다.
  //    저장된 연결 — 배타 역할 중 지급 레벨이 그 등급 시작 레벨인 것(예전 일괄 연결 칸과 같은 판정)
  const cfgs: RoleCfg[] = configs;
  const savedTier: Record<string, string> = {};
  for (const t of TIERS) {
    const cfg = cfgs.find((c) => c.exclusive && Number(c.rewardLevel) === t.min);
    if (cfg) savedTier[t.key] = cfg.roleId;
  }
  const tierRoleIds = new Set(Object.values(savedTier));
  const [tierForm, setTierForm] = useState(EMPTY_TIER_FORM);
  const [tierSaving, setTierSaving] = useState(false);
  // 승급 화면 미리보기 — 고른 등급의 승급 화면을 소리째 띄운다. 서버에 아무것도 적지 않는다(2026-10-08 운영자 요청)
  const [promoPick, setPromoPick] = useState(3);
  const [promoPlay, setPromoPlay] = useState<number | null>(null);
  const [promoRun, setPromoRun] = useState(0);

  // 등급 칸 열기 — 연결된 역할 · 그 역할의 Boost 로 채운다
  const openTier = (t: Tier) => {
    const cfg = cfgs.find((c) => c.roleId === savedTier[t.key]);
    setTierForm({
      roleId: savedTier[t.key] || "",
      buffXp: cfg?.buffXp ? String(cfg.buffXp) : "",
      attendBuffXp: cfg?.attendBuffXp ? String(cfg.attendBuffXp) : "",
    });
    openFormAt("tier", t.key);
  };
  // 역할을 바꾸면 Boost 칸은 그 역할에 이미 걸린 값으로(예전 일괄 연결과 같다 — 새로 붙는 역할의 Boost 를 0 으로 덮지 않는다)
  const pickTierRole = (roleId: string) => {
    const cfg = cfgs.find((c) => c.roleId === roleId);
    setTierForm({ roleId, buffXp: cfg?.buffXp ? String(cfg.buffXp) : "", attendBuffXp: cfg?.attendBuffXp ? String(cfg.attendBuffXp) : "" });
  };

  const saveTier = async () => {
    const t = TIERS.find((x) => x.key === editId);
    if (!t || tierSaving) return;
    const oldId = savedTier[t.key] || "";
    const newId = tierForm.roleId;
    // 같은 역할을 두 등급에 붙이면 지급 · 회수가 서로 싸운다
    if (newId && Object.entries(savedTier).some(([k, id]) => k !== t.key && id === newId)) return toast("같은 역할을 여러 등급에 연결할 수 없습니다.", true);
    if (!oldId && !newId) { closeForm(); return; }

    setTierSaving(true);
    let fail = 0;
    const post = (body: Record<string, unknown>) =>
      fetch("/api/role-config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => r.ok).catch(() => false);
    // ① 등급에서 빠지는 역할 — Boost 가 있으면 Boost 만 남기고 등급만 풀고, 없으면 설정을 지운다
    if (oldId && oldId !== newId) {
      const cfg = cfgs.find((c) => c.roleId === oldId);
      if (cfg) {
        const ok = (cfg.buffXp || 0) > 0 || (cfg.attendBuffXp || 0) > 0
          ? await post({ roleId: oldId, roleName: cfg.roleName, rewardLevel: null, buffXp: cfg.buffXp || 0, attendBuffXp: cfg.attendBuffXp || 0, exclusive: false })
          : await fetch(`/api/role-config?id=${cfg._id}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false);
        if (!ok) fail++;
      }
    }
    // ② 붙는(또는 그대로인) 역할 — 지급 레벨 = 등급 시작 레벨 · 배타(최상위 하나만 유지) · Boost 는 칸 값
    if (newId) {
      const ok = await post({
        roleId: newId,
        roleName: guildRoles.find((r) => r.id === newId)?.name || t.name,
        rewardLevel: t.min,
        buffXp: Number(tierForm.buffXp) || 0,
        attendBuffXp: Number(tierForm.attendBuffXp) || 0,
        exclusive: true,
      });
      if (!ok) fail++;
    }
    setTierSaving(false);
    fetchCore();
    if (!fail) { closeForm(); setTierForm(EMPTY_TIER_FORM); saved(); }
    else toast(`일부를 저장하지 못했습니다(${fail}건). 다시 시도해 주세요.`, true);
  };

  // ── 저장 핸들러 ─────────────────────────────
  const saveRole = async () => {
    if (!roleForm.roleId) return notify("역할을 선택해주세요.", true);
    // 등급 줄에 연결된 역할은 등급 칸에서만 고친다(이 칸으로 저장하면 지급 레벨 · 배타가 풀려 등급에서 빠진다)
    const own = editId ? cfgs.find((c) => c._id === editId) : null;
    if (tierRoleIds.has(roleForm.roleId) && own?.roleId !== roleForm.roleId) return toast("등급에 연결된 역할입니다. 등급 줄에서 고쳐 주세요.", true);
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
    if (res?.ok) {
      // 📌 저장은 역할 ID 로 upsert 한다 — 수정 칸에서 역할을 바꾸면 새 역할 설정만 생기고 옛 설정이 남아
      //    그 레벨에서 두 역할을 다 받았다 → 대상이 바뀌었으면 옛 설정을 지운다
      const orig = editId ? configs.find((c) => c._id === editId) : null;
      const moved = orig && orig.roleId !== roleForm.roleId
        ? await fetch(`/api/role-config?id=${editId}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false)
        : true;
      setRoleForm(EMPTY_ROLE); closeForm(); fetchCore();
      if (moved) saved(); else notify("기존 역할 설정을 지우지 못했습니다. 목록에서 삭제해 주세요.", true);
    }
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
    if (res?.ok) {
      // 채널도 채널 ID 로 upsert 한다 — 수정 칸에서 채널을 바꿨으면 옛 채널 설정을 지운다
      const orig = editId ? channelConfigs.find((c) => c._id === editId) : null;
      const moved = orig && orig.channelId !== chForm.channelId
        ? await fetch(`/api/channel-config?id=${editId}`, { method: "DELETE" }).then((r) => r.ok).catch(() => false)
        : true;
      setChForm(EMPTY_CHANNEL); closeForm(); fetchCore();
      if (moved) saved(); else notify("기존 채널 설정을 지우지 못했습니다. 목록에서 삭제해 주세요.", true);
    }
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
    if (d?.success) { setQuestForm(EMPTY_QUEST); closeForm(); fetchCore(); toast("저장했습니다."); }
    else notify(d?.error || "저장에 실패했습니다.", true);
  };

  // 추천 퀘스트 등록 결과 — 창을 닫고 목록을 다시 불러온다
  const onQuestPresetDone = (d: { created?: string[]; skipped?: string[] }) => {
    setQuestPresetOpen(false);
    fetchCore();
    const made = d.created?.length || 0;
    const skip = d.skipped?.length || 0;
    notify([
      made ? `퀘스트 ${made}개를 등록했습니다.` : "새로 등록한 퀘스트가 없습니다.",
      skip ? `이미 있는 ${skip}개는 건너뛰었습니다.` : "",
    ].filter(Boolean).join("\n"));
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    const api = { role: "/api/role-config", channel: "/api/channel-config", boost: "/api/xp-boost", quest: "/api/daily-quest" }[deleteConfirm.kind];
    const res = await fetch(`${api}?id=${deleteConfirm.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) { fetchCore(); toast("삭제했습니다."); }
    else toast("삭제하지 못했습니다.", true);
    setDeleteConfirm(null);
  };

  // 📌 ?sec= 로 들어오면(기능 검색 · 다른 화면의 바로가기) 그 패널로 한 번 데려간다.
  //    패널은 데이터가 와야 그려지거나 키가 바뀌므로, 불러오기가 끝난 뒤 한 번만 움직인다. 같은 화면에서 다른 sec 로 오면 다시 움직인다
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

  const roleOptions = (list: any[]) => list.map((r) => ({ value: r.id, label: r.name, color: r.color }));
  const channelOptions = guildChannels.map((c) => ({
    value: c.id,
    label: `${CHANNEL_TYPE_ICON[c.type] || "#"} ${c.name}`,
    hint: CHANNEL_TYPE_LABEL[c.type],
    indent: !!c.parentId,
  }));
  // 퀘스트 조건 줄의 채널 이름 — 지운 채널이면 null(조건 줄이 "채널 N곳"으로 적는다)
  const chNameOf = (id: string) => {
    const c = guildChannels.find((x) => x.id === id);
    return c ? `${CHANNEL_TYPE_ICON[c.type] || "#"}${c.name}` : "";
  };

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
  // 핫타임 지금 상태 — 저장된 값 기준(입력 중인 값이 아니라)
  const hot = hotTimeState(settingsSnap || {});
  const fmtSetting = (k: string, v: any): string => {
    if (k === "levelPublic") return v ? "공개" : "비공개";
    if (k === "resetOnLeave") return v ? "초기화함" : "유지함";
    if (k === "muteMode") return MUTE_MODES.find((o) => o.v === (v || "off"))?.l || String(v);
    if (k === "muteTarget") return MUTE_TARGETS.find((o) => o.v === (v || "both"))?.l || String(v);
    if (k === "attendStreakEnabled" || k === "boosterLadderOn") return v ? "사용" : "사용 안 함";
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

  // ── 연속 출석 규칙 표 — 설정 문서의 배열이라 저장은 저장 줄(postSettings)을 탄다 ──
  const streakRules: any[] = Array.isArray(settings?.attendStreakRules) ? settings.attendStreakRules : [];
  const setStreakRule = (i: number, patch: Record<string, any>) =>
    setSettings({ ...settings, attendStreakRules: streakRules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addStreakRule = () => setSettings({ ...settings, attendStreakRules: [...streakRules, { ...EMPTY_STREAK_RULE }] });
  const removeStreakRule = (i: number) => setSettings({ ...settings, attendStreakRules: streakRules.filter((_, j) => j !== i) });
  // ── 연속 부스팅 단계 표 — 같은 문서의 배열(저장 줄) ──
  const ladderRows: any[] = Array.isArray(settings?.boosterLadder) ? settings.boosterLadder : [];
  const setLadderRow = (i: number, patch: Record<string, any>) =>
    setSettings({ ...settings, boosterLadder: ladderRows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addLadderRow = () => setSettings({ ...settings, boosterLadder: [...ladderRows, { ...EMPTY_LADDER_ROW }] });
  const removeLadderRow = (i: number) => setSettings({ ...settings, boosterLadder: ladderRows.filter((_, j) => j !== i) });

  // 노출 방식 칸은 자기 저장 · 취소가 있다 — 그 칸이 열린 동안 저장 줄까지 띄우면 저장 단추가 둘이 된다
  const showSaveBar = settingsDirty && !isFormOpen("questPick");

  // ── 지급 내역 — 네 출처를 한 표로 ──────────────
  //    XpLog 는 봇이 자동으로 준 것(채팅 · 음성 · 출석 · 효과), Payout 은 관리자가 수동으로 준 것(최근 50건) · 지급 대기열(대기 · 처리 중 · 실패),
  //    아이템은 운영진 아이템 지급(/api/admin/items/grant — 한 번에 300건 · 더 보기). 예전엔 아이템 지급이 수동 지급을 「아이템」으로 바꿔야만 보였고,
  //    대기열은 관리 틀 밖 옛 화면(/payouts)에만 있었다.
  const logQ = logQuery.trim().toLowerCase();
  const nameHit = (s: unknown) => !logQ || String(s || "").toLowerCase().includes(logQ);
  const payoutRow = (g: PayoutDoc, src: "manual" | "pending"): LedgerRow => ({
    k: (src === "pending" ? "p" : "m") + g._id,
    src,
    kind: src === "pending" ? PAYOUT_SOURCE[g.source || ""] || "기타" : "수동",
    at: g.createdAt,
    name: g.userName || g.userId || "",
    amount: g.amount || 0,
    unit: g.currency === "point" ? "빙옥" : "XP",
    note: g.reason || (src === "manual" ? "관리자 지급" : "-"),
    status: g.status,
    error: g.error,
    payout: g,
  });
  const manualRows: LedgerRow[] = (grantLogs as PayoutDoc[]).filter((g) => nameHit(g.userName || g.userId)).map((g) => payoutRow(g, "manual"));
  const queueRows: LedgerRow[] = queue.filter((g) => nameHit(g.userName || g.userId)).map((g) => payoutRow(g, "pending"));
  // 한 사람에게 여러 개 준 건(같은 orderId)은 한 줄 ×N — lib/orderGroups.js
  const itemGroups = groupOrders(itemGrants) as GrantGroup[];
  const itemRows: LedgerRow[] = itemGroups
    .filter((g) => nameHit(g.userName || g.userId))
    .map((g) => ({
      k: "i" + g._id,
      src: "item",
      kind: "아이템",
      at: g.createdAt,
      name: g.userName || g.userId || "",
      qty: g.qty || 1,
      note: `${g.itemName || "아이템"} · ${(g.days || 0) > 0 ? `${g.days}일` : "영구"}${g.adminNote ? ` · ${g.adminNote}` : ""}`,
      status: g.status,
      grant: g,
    }));
  const botRows: LedgerRow[] = logs.map((l) => ({
    k: "b" + l._id,
    src: "bot",
    kind: REASON_LABEL[l.reason] || "봇",
    at: l.createdAt,
    name: l.displayName || l.userId,
    amount: l.amount || 0,
    note: l.reason === "effect" || l.reason === "effect-levelup" ? "아이템 효과" : "자동 지급",
    channelName: l.channelName,
  }));

  let ledgerRows: LedgerRow[];
  if (ledgerFilter === "manual") ledgerRows = manualRows;
  else if (ledgerFilter === "item") ledgerRows = itemRows;
  else if (ledgerFilter === "pending") ledgerRows = queueRows;
  else if (ledgerFilter === "") {
    // 쪽 넘김은 양이 압도적으로 많은 봇 로그를 기준으로 한다. 수동 · 아이템 지급은 이 쪽이 덮는
    // 시간 구간 안의 것만 끼워 넣어야 시간순이 어긋나지 않는다 (첫 쪽은 위쪽이 열려 있다).
    const newest = logPage === 0 ? Infinity : botRows.length ? ts(botRows[0].at) : Infinity;
    const oldest = botRows.length ? ts(botRows[botRows.length - 1].at) : -Infinity;
    const inPage = (m: LedgerRow) => ts(m.at) <= newest && ts(m.at) >= oldest;
    ledgerRows = [...botRows, ...manualRows.filter(inPage), ...itemRows.filter(inPage)].sort((a, b) => ts(b.at) - ts(a.at));
  } else {
    ledgerRows = botRows;
  }
  // 머리 오른쪽 건수 — 거르기마다 그 출처의 수(봇은 전체 검색 결과, 수동은 최근 50건, 아이템은 읽은 만큼)
  const ledgerCount =
    ledgerFilter === "manual" ? `수동 ${manualRows.length.toLocaleString()}`
    : ledgerFilter === "item" ? `아이템 ${itemRows.length.toLocaleString()}${itemGrantsNext ? "+" : ""}`
    : ledgerFilter === "pending" ? `대기 ${queueRows.length.toLocaleString()}`
    : ledgerFilter === "" ? `봇 ${logTotal.toLocaleString()} · 수동 ${manualRows.length.toLocaleString()} · 아이템 ${itemRows.length.toLocaleString()}`
    : `봇 ${logTotal.toLocaleString()}`;

  const hrefTab = (id: string) => `/admin/bot?tab=${id}`;

  const loadingRow = <div className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</div>;

  // ── 표 열 ───────────────────────────────────
  // 등급 · 보상 역할 — 위에 등급 줄(사다리 차례), 그 아래 그 밖의 보상 역할(지급 레벨 순 · 레벨 없는 Boost 역할은 끝)
  const roleRows: RoleRow[] = [
    ...TIERS.map((t) => ({ k: `t:${t.key}`, tier: t, cfg: cfgs.find((c) => c.roleId === savedTier[t.key]) || null })),
    ...cfgs
      .filter((c) => !tierRoleIds.has(c.roleId))
      .sort((a, b) => (a.rewardLevel ?? Infinity) - (b.rewardLevel ?? Infinity) || String(a.roleName || "").localeCompare(String(b.roleName || ""), "ko"))
      .map((c) => ({ k: c._id, tier: null, cfg: c })),
  ];
  const boostCell = (n: number | undefined, mob: string) =>
    (n || 0) > 0 ? <span className="tabular-nums"><span className="md:hidden">{mob} </span>+{(n || 0).toLocaleString()}</span> : <Dash />;
  // 📌 첫 열 = 지급(등급 줄은 등급 · 시작 레벨) — 모바일 줄 카드 머리에 「◆ 브론즈 Lv.90+ · 역할」로 함께
  const roleCols: Column<RoleRow>[] = [
    {
      key: "lv", label: "지급", mobile: "title",
      render: ({ tier, cfg }) =>
        tier ? (
          <span className="inline-flex items-center gap-2 min-w-0">
            <span aria-hidden className="shrink-0 w-2.5 h-2.5 rotate-45" style={{ background: tierPaint(tier) }} />
            <span className="font-bold truncate" style={tierText(tier)}>{tier.name}</span>
            <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">Lv.{tier.min}+</span>
          </span>
        ) : cfg?.rewardLevel != null ? (
          <span className="font-bold text-[#e91e3f] tabular-nums">Lv.{cfg.rewardLevel}</span>
        ) : (cfg?.buffXp || 0) > 0 || (cfg?.attendBuffXp || 0) > 0 ? <Dash /> : (
          <span className="text-[#5a5a5a]">효과 없음</span>
        ),
    },
    {
      key: "role", label: "역할", mobile: "title",
      render: ({ tier, cfg }) => {
        if (!cfg) return <span className="text-[#a3a3a3]">미연결</span>;
        const role = guildRoles.find((r) => r.id === cfg.roleId);
        return (
          <span className="inline-flex items-center gap-2.5 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role?.color || "#99aab5" }} />
            <span className="font-bold truncate">{cfg.roleName || role?.name || cfg.roleId}</span>
            {!tier && cfg.exclusive && <StatusChip>배타</StatusChip>}
          </span>
        );
      },
    },
    { key: "buff", label: "채팅·음성 Boost", align: "right", render: ({ cfg }) => boostCell(cfg?.buffXp, "채팅/음성") },
    { key: "attend", label: "출석 Boost", align: "right", render: ({ cfg }) => boostCell(cfg?.attendBuffXp, "출석") },
  ];
  // 열린 칸의 줄 — 등급 칸은 "t:<등급 키>", 역할 칸은 설정 _id
  const roleSelKey = isFormOpen("tier") ? `t:${editId}` : isFormOpen("role") ? editId : null;
  const openTierRow = TIERS.find((t) => t.key === editId) || null;
  // 등급 칸 역할 목록 — 다른 등급에 연결된 역할은 뺀다(같은 역할을 두 등급에 붙이지 않게)
  const tierRoleOptions = grantableRoles.filter((r) => !tierRoleIds.has(r.id) || r.id === savedTier[openTierRow?.key || ""]);
  // 보상 역할 칸 역할 목록 — 등급에 연결된 역할은 뺀다(그 칸에서 저장하면 등급에서 빠진다). 고치는 중인 역할은 남긴다
  const rewardRoleOptions = grantableRoles.filter((r) => !tierRoleIds.has(r.id) || r.id === roleForm.roleId);

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

  // 퀘스트는 주기 순(일일 → 주간 → 월간)으로 한 표에 — 주기별 요약은 표 위 한 줄에, 보기 알약으로 한 주기만 골라 본다
  const questRows = QUEST_PICK_FIELDS.flatMap((f) => (questView === "all" || questView === f.period ? quests.filter((q) => (q.period || "daily") === f.period) : []));
  const questViewOptions = [
    { v: "all", l: "전체", n: quests.length },
    ...QUEST_PICK_FIELDS.map((f) => ({ v: f.period, l: PERIOD_LABEL[f.period], n: quests.filter((q) => (q.period || "daily") === f.period).length })),
  ];
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
      // 📌 조건 한 줄은 lib/questKinds.js questCondLabel — 추천 퀘스트 창과 같은 글
      render: (q) => <span className="text-[#5a5a5a] tabular-nums">{questCondLabel(q, chNameOf)}</span>,
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

  // 줄 끝 동작 — 지급 대기열(지급 취소 · 지급 완료) · 아이템 지급(사유 · 회수). 역할 이전 · 역할 환불 · 역할 정리 기록은 그 도구가 다루므로 두지 않는다(API 도 막는다)
  const rowActions = (r: LedgerRow) => {
    if (r.payout) {
      const p = r.payout;
      if (payoutCompletable(p)) return <Btn size="sm" variant="secondary" disabled={payBusy} onClick={() => completePayout(p)}>지급 완료</Btn>;
      if (payoutCancelable(p)) return <Btn size="sm" variant="ghost" className="!text-[#d01634]" disabled={payBusy} onClick={() => setPayCancel(p)}>지급 취소</Btn>;
      return null;
    }
    const g = r.grant;
    if (!g || /^역할 (이전|환불|정리)/.test(String(g.adminNote || ""))) return null;
    const live = g.status === "pending" || g.status === "completed";
    return (
      <span className="inline-flex items-center gap-1">
        <Btn size="sm" variant="ghost" disabled={grantRowBusy} onClick={() => setNoteEdit({ key: g._id, ids: g.ids || [String(g._id)], text: g.adminNote || "" })}>사유</Btn>
        {live && <Btn size="sm" variant="ghost" className="!text-[#d01634]" disabled={grantRowBusy} onClick={() => setRevokeTarget(g)}>회수</Btn>}
      </span>
    );
  };
  const ledgerCols: Column<LedgerRow>[] = [
    {
      key: "src", label: "구분", mobile: "title", className: "w-16",
      render: (r) => <StatusChip tone={r.src === "manual" ? "ink" : r.src === "item" ? "info" : r.src === "pending" ? "warn" : "neutral"}>{r.kind}</StatusChip>,
    },
    {
      key: "name", label: "유저", mobile: "title",
      render: (r) => {
        // 처리 상태 — 지급 대기열(수동 · 대기)과 아이템 지급에만 있다. 값이 비어 있어도 '대기'로 보여 줘야 큐에 남은 걸 알 수 있다
        const st = r.payout ? payoutChip(r.status) : r.grant ? GRANT_STATUS[r.grant.status] || { l: r.grant.status, tone: "neutral" as const } : null;
        return (
          <span className="inline-flex items-center gap-2 min-w-0">
            <span className="font-bold truncate max-w-[13rem]">{r.name}</span>
            {st && <StatusChip tone={st.tone}>{st.l}</StatusChip>}
          </span>
        );
      },
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
      render: (r) =>
        r.qty != null ? (
          <span className="font-black tabular-nums whitespace-nowrap">×{r.qty.toLocaleString()}</span>
        ) : (
          <span className={`font-black tabular-nums whitespace-nowrap ${(r.amount || 0) >= 0 ? "text-[#e91e3f]" : "text-amber-700"}`}>
            {(r.amount || 0) >= 0 ? "+" : ""}{(r.amount || 0).toLocaleString()}
            {r.unit === "빙옥" && <span className="ml-1 text-[11px] text-[#3f9e93]">빙옥</span>}
          </span>
        ),
    },
    // 📌 동작 칸 — 늘 둔다(거르기를 바꿔도 열이 생겼다 없어지며 표가 흔들리지 않게). 동작이 없는 줄은 비운다
    { key: "act", label: <span className="sr-only">동작</span>, align: "right", className: "w-px", render: rowActions },
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
          📌 XP 가 얼마나 · 언제 더 붙는지를 한 탭에 — 왼쪽 지급량 · 출석 · 음소거 · AFK, 오른쪽 강화 · XP 이벤트(핫타임 + 기간제 부스트) · 채널 정책.
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
                <FieldRow label="음성 지급 주기" changed={chg("voiceIntervalSec")} hint="사람마다 이 시간을 채울 때마다 1회분 · 못 채우고 나가면 머문 만큼 (기본 300초 = 5분)">
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

              {/* 📌 연속 출석 보너스 — 켜기 + 규칙 표(설정 문서의 배열). 강화 표와 같은 모양: PC 는 네 칸 한 줄, 모바일은 두 칸씩 */}
              <Panel
                id="sec-streak"
                className="scroll-mt-24"
                title={<>연속 출석 보너스<Count n={streakRules.length} /></>}
                right={<Btn variant="secondary" size="sm" onClick={addStreakRule} disabled={streakRules.length >= MAX_STREAK_RULES}>＋ 규칙</Btn>}
                flush
              >
                <FieldRow label="보너스 사용" changed={chg("attendStreakEnabled")}>
                  <Toggle
                    on={!!settings.attendStreakEnabled}
                    onClick={() => setSettings({ ...settings, attendStreakEnabled: !settings.attendStreakEnabled })}
                    onLabel="사용 중"
                    offLabel="사용 안 함"
                  />
                </FieldRow>
                {streakRules.length === 0 ? (
                  <PanelEmpty>규칙이 없습니다.</PanelEmpty>
                ) : (
                  <div className="px-5 py-4">
                    <div className="hidden md:flex items-center gap-3 pb-2 text-[12px] font-bold text-[#5a5a5a]">
                      <div className="flex-1 min-w-0 grid grid-cols-4 gap-3">
                        {STREAK_COLS.map((c) => <span key={c} className="min-w-0 truncate">{c}</span>)}
                      </div>
                      <span className="w-8 shrink-0" />
                    </div>
                    {streakRules.map((r, i) => (
                      <div key={i} className={`flex items-start md:items-center gap-3 py-3 border-[#ededed] ${i > 0 ? "border-t" : "md:border-t"}`}>
                        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-3">
                          {(["days", "xp", "point"] as const).map((f, j) => (
                            <label key={f} className="block min-w-0">
                              <span className="md:hidden block mb-1 text-[12px] text-[#5a5a5a]">{STREAK_COLS[j]}</span>
                              <input
                                type="number"
                                min={f === "days" ? 1 : 0}
                                max={f === "days" ? 365 : 10_000_000}
                                aria-label={`${i + 1}번째 규칙 ${STREAK_COLS[j]}`}
                                value={r?.[f] ?? ""}
                                onChange={(e) => setStreakRule(i, { [f]: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </label>
                          ))}
                          <div className="min-w-0">
                            <span className="md:hidden block mb-1 text-[12px] text-[#5a5a5a]">{STREAK_COLS[3]}</span>
                            <div className="h-10 flex items-center">
                              <Switch on={!!r?.repeat} onChange={(v) => setStreakRule(i, { repeat: v })} label={`${i + 1}번째 규칙 ${STREAK_COLS[3]}`} />
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`${i + 1}번째 규칙 삭제`}
                          onClick={() => removeStreakRule(i)}
                          className="w-8 h-10 shrink-0 mt-5 md:mt-0 inline-flex items-center justify-center text-[#5a5a5a] hover:text-[#d01634] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* 📌 서버 부스터 보상(2026-10-25 운영자 "혜택은 나중에 내가 수정할테니까 추가해") — 봇 features/boosterBonus.js 가 지급, 부스터 화면(/booster)이 같은 값을 보인다.
                     최초 부스팅: 처음 부스트한 사람에게 한 번(기능을 켜기 전부터 부스팅 중이던 사람은 없음). 연속 부스팅: 디스코드 부스트 시작일부터 이어진 개월, 단계마다 사람당 한 번.
                     표 모양은 연속 출석 보너스와 같다(PC 세 칸 한 줄 · 모바일 두 칸씩). 단계를 다 지우고 저장하면 연속 부스팅 보상은 꺼진다 */}
              <Panel
                id="sec-booster"
                className="scroll-mt-24"
                title={<>서버 부스터 보상<Count n={ladderRows.length} /></>}
                right={<Btn variant="secondary" size="sm" onClick={addLadderRow} disabled={ladderRows.length >= BOOSTER_LADDER_MAX}>＋ 단계</Btn>}
                flush
              >
                <FieldRow label="최초 부스팅" changed={chg("boosterStartXp") || chg("boosterStartPoint")} hint="처음 부스트한 사람에게 한 번">
                  <Inline>
                    <input type="number" min={0} aria-label="최초 부스팅 XP" value={settings.boosterStartXp ?? 150000} onChange={(e) => setSettings({ ...settings, boosterStartXp: e.target.value })} className={`${inputClass} !w-32 tabular-nums`} />
                    XP
                    <input type="number" min={0} aria-label="최초 부스팅 빙옥" value={settings.boosterStartPoint ?? 30} onChange={(e) => setSettings({ ...settings, boosterStartPoint: e.target.value })} className={`${inputClass} !w-24 tabular-nums`} />
                    빙옥
                  </Inline>
                </FieldRow>
                {/* 📌 연속 부스팅 「사용」 — 기본 꺼짐(2026-10-25 검토: 임시 수치로 봇 반영 즉시 오래된 부스터에게 한꺼번에 나가면 되돌릴 수 없다). 수치를 고친 뒤 켠다.
                       단계는 개월로 구분한다 — 개월을 바꾸면 새 단계라 이미 받은 사람도 그 단계를 다시 받는다 */}
                <FieldRow label="연속 부스팅 보상" changed={chg("boosterLadderOn")} hint="켜면 봇이 지급하고 부스터 화면에 보입니다. 단계는 개월로 구분해 개월을 바꾸면 새 단계로 다시 지급됩니다">
                  <Toggle
                    on={!!settings.boosterLadderOn}
                    onClick={() => setSettings({ ...settings, boosterLadderOn: !settings.boosterLadderOn })}
                    onLabel="사용 중"
                    offLabel="사용 안 함"
                  />
                </FieldRow>
                {ladderRows.length === 0 ? (
                  <PanelEmpty>연속 부스팅 단계가 없습니다.</PanelEmpty>
                ) : (
                  <div className="px-5 py-4">
                    <div className="hidden md:flex items-center gap-3 pb-2 text-[12px] font-bold text-[#5a5a5a]">
                      <div className="flex-1 min-w-0 grid grid-cols-3 gap-3">
                        {LADDER_COLS.map((c) => <span key={c} className="min-w-0 truncate">{c}</span>)}
                      </div>
                      <span className="w-8 shrink-0" />
                    </div>
                    {ladderRows.map((r, i) => (
                      <div key={i} className={`flex items-start md:items-center gap-3 py-3 border-[#ededed] ${i > 0 ? "border-t" : "md:border-t"}`}>
                        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-3 gap-3">
                          {(["months", "xp", "point"] as const).map((f, j) => (
                            <label key={f} className="block min-w-0">
                              <span className="md:hidden block mb-1 text-[12px] text-[#5a5a5a]">{LADDER_COLS[j]}</span>
                              <input
                                type="number"
                                min={f === "months" ? 1 : 0}
                                max={f === "months" ? 120 : 10_000_000}
                                aria-label={`${i + 1}번째 단계 ${LADDER_COLS[j]}`}
                                value={r?.[f] ?? ""}
                                onChange={(e) => setLadderRow(i, { [f]: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          aria-label={`${i + 1}번째 단계 삭제`}
                          onClick={() => removeLadderRow(i)}
                          className="w-8 h-10 shrink-0 mt-5 md:mt-0 inline-flex items-center justify-center text-[#5a5a5a] hover:text-[#d01634] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel id="sec-muting" className="scroll-mt-24" title="음소거 처리" flush>
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
                {/* 📌 2026-10-25 운영자 "헤드셋까지 끄면 XP 지급 차단 · 음성 시간 누적도 안 됨" — 설정과 상관없이 늘(봇 voiceTime.js multOf). 바꾸는 칸이 아니라 규칙만 보인다 */}
                <FieldRow label="헤드셋 끔">
                  <span className="font-bold text-[#131313]">늘 차단 (음성 시간도 안 쌓임)</span>
                </FieldRow>
              </Panel>

              {/* 📌 2026-10-04 AFK 방지 시스템(운영자 명칭) — 음성 채널에 혼자인 사람에게 그 채널 채팅으로 [확인] 버튼(본인만 누름). 관리자 · 서포터즈는 빠진다(bot/src/features/afkCheck.js) */}
              <Panel id="sec-afk" className="scroll-mt-24" title="AFK 방지 시스템" flush>
                <FieldRow label="사용" changed={chg("afkCheckOn")} hint="음성 채널에 혼자인 사람만 · 관리자 · 서포터즈 제외">
                  <Toggle
                    on={settings.afkCheckOn !== false}
                    onClick={() => setSettings({ ...settings, afkCheckOn: settings.afkCheckOn === false })}
                    onLabel="사용 중"
                    offLabel="사용 안 함"
                  />
                </FieldRow>
                <FieldRow label="첫 확인" changed={chg("afkCheckFirstMin") || chg("afkCheckSanctionMin")} hint="혼자가 된 뒤 · 제재 이력(음성 XP 정지 · XP 획득 중단)은 오른쪽 값">
                  <Inline>
                    <input type="number" min={1} aria-label="첫 확인" value={settings.afkCheckFirstMin ?? 60} disabled={settings.afkCheckOn === false}
                      onChange={(e) => setSettings({ ...settings, afkCheckFirstMin: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                    분 · 제재 이력
                    <input type="number" min={1} aria-label="첫 확인(제재 이력)" value={settings.afkCheckSanctionMin ?? 30} disabled={settings.afkCheckOn === false}
                      onChange={(e) => setSettings({ ...settings, afkCheckSanctionMin: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                    분
                  </Inline>
                </FieldRow>
                <FieldRow label="다음 확인" changed={chg("afkCheckMinMin") || chg("afkCheckMaxMin")} hint="확인 뒤에도 혼자면 이 사이 무작위">
                  <Inline>
                    <input type="number" min={1} aria-label="다음 확인 최소" value={settings.afkCheckMinMin ?? 20} disabled={settings.afkCheckOn === false}
                      onChange={(e) => setSettings({ ...settings, afkCheckMinMin: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                    ~
                    <input type="number" min={1} aria-label="다음 확인 최대" value={settings.afkCheckMaxMin ?? 60} disabled={settings.afkCheckOn === false}
                      onChange={(e) => setSettings({ ...settings, afkCheckMaxMin: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                    분
                  </Inline>
                </FieldRow>
                <FieldRow label="응답 시간" changed={chg("afkCheckReplyMin")} hint="안 누르면 서버 잠수 채널로 이동">
                  <Inline>
                    <input type="number" min={1} max={60} value={settings.afkCheckReplyMin ?? 5} disabled={settings.afkCheckOn === false}
                      onChange={(e) => setSettings({ ...settings, afkCheckReplyMin: e.target.value })} className={numClass} />
                    분
                  </Inline>
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

              {/* 📌 XP 이벤트 — 기간 한정으로 XP 를 더 주는 두 가지를 한 패널에(2026-10-17 — 예전엔 핫타임은 정책, 기간제 부스트는 콘텐츠 탭).
                     핫타임(lib/hotTime.js · 봇 hotTime.js): 기간 안 채팅 · 음성 「기본 XP + 강화 + 음성 등급 가산」 × 배수. 금 · 토 · 일(KST)은 오른쪽 배수.
                       역할 버프 · 채널 · 기간제 부스트 · 아이템 효과에는 안 붙는다. 기간은 시작일 0시 ~ 끝나는 날 24시(KST). 저장은 저장 줄.
                     기간제 부스트: 대상(역할 · 채널) · 기간 안 지급 1회당 +XP. 줄마다 편집 칸에서 바로 저장 */}
              <Panel id="sec-events" className="scroll-mt-24" title="XP 이벤트" right={hot.on ? <StatusChip tone="ok">핫타임 ×{hot.mult}</StatusChip> : null} flush>
                <div id="sec-hottime" className="scroll-mt-24">
                  <SubHead>핫타임</SubHead>
                  <FieldRow label="사용" changed={chg("hotTimeOn")} hint="기본 XP · 강화 · 음성 등급 가산에만 · 아이템 효과 제외">
                    <Toggle
                      on={settings.hotTimeOn === true}
                      onClick={() => setSettings({ ...settings, hotTimeOn: settings.hotTimeOn !== true })}
                      onLabel="사용 중"
                      offLabel="사용 안 함"
                    />
                  </FieldRow>
                  <FieldRow label="이름" changed={chg("hotTimeName")}>
                    <input type="text" maxLength={40} value={settings.hotTimeName || ""} placeholder="유령 펭귄의 초대"
                      onChange={(e) => setSettings({ ...settings, hotTimeName: e.target.value })} className={inputClass} />
                  </FieldRow>
                  <FieldRow label="기간" changed={chg("hotTimeFrom") || chg("hotTimeUntil")} hint="시작일 0시 ~ 끝나는 날 24시">
                    <Inline>
                      <input type="date" aria-label="핫타임 시작일" value={kstDay(settings.hotTimeFrom)}
                        onChange={(e) => setSettings({ ...settings, hotTimeFrom: dayStartIso(e.target.value) })} className={`${inputClass} !w-auto`} />
                      ~
                      <input type="date" aria-label="핫타임 끝나는 날" value={kstDay(settings.hotTimeUntil, true)}
                        onChange={(e) => setSettings({ ...settings, hotTimeUntil: dayEndIso(e.target.value) })} className={`${inputClass} !w-auto`} />
                    </Inline>
                  </FieldRow>
                  <FieldRow label="배수" changed={chg("hotTimeWeekdayMult") || chg("hotTimeWeekendMult")} hint="평일 · 금토일">
                    <Inline>
                      평일
                      <input type="number" step={0.1} min={1} max={5} aria-label="평일 배수" value={settings.hotTimeWeekdayMult ?? 1.5}
                        onChange={(e) => setSettings({ ...settings, hotTimeWeekdayMult: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                      배 · 금토일
                      <input type="number" step={0.1} min={1} max={5} aria-label="금토일 배수" value={settings.hotTimeWeekendMult ?? 2}
                        onChange={(e) => setSettings({ ...settings, hotTimeWeekendMult: e.target.value })} className={`${inputClass} !w-20 tabular-nums`} />
                      배
                    </Inline>
                  </FieldRow>
                </div>
                <div id="sec-boosts" className="scroll-mt-24 border-t border-[#ededed]">
                  <SubHead right={<Btn variant="secondary" size="sm" onClick={() => { setBoostForm(EMPTY_BOOST); openFormAt("boost"); }}>＋ 추가</Btn>}>
                    기간제 부스트<Count n={boosts.length} />
                  </SubHead>
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
                </div>
              </Panel>

              {/* 채널 정책 — 채널 · 카테고리별 Boost XP · 지급 제외(2026-10-17 콘텐츠 탭에서 옮김) */}
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
            </div>
          </PanelGrid>

          {/* 📌 공개 · 초기화 — 켜고 끄는 순간 유저 화면이 바뀌거나 기록이 지워지는 설정만 한곳에. 저장 줄로 저장된다
                 (ARCTIC 상점 공개는 2026-10-17 상점 관리 › 설정으로 옮겼다) */}
          <Panel id="sec-public" className="mt-5 scroll-mt-24 !border-[#e91e3f]/40" title={<span className="text-[#d01634]">공개 · 초기화</span>} flush>
            <FieldRow label="SYSTEM : LEVEL 공개" changed={chg("levelPublic")} hint="비공개면 /level 전체(ARCTIC·시즌 패스·랭킹 포함)가 예고 화면으로 바뀌고 메뉴에서 빠집니다">
              <Toggle
                on={!!settings.levelPublic}
                onClick={() => setSettings({ ...settings, levelPublic: !settings.levelPublic })}
                onLabel="공개 중"
                offLabel="비공개 (관리자만)"
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
          📌 왼쪽은 등급 · 보상 역할 한 표(등급 줄 위 고정), 오른쪽은 시즌 전환 보호 역할(저장 줄) · 승급 화면 미리보기 */}
      {tab === "roles" && (
        <PanelGrid>
          <div className="min-w-0 space-y-5">
            <Panel
              id="sec-reward"
              className="scroll-mt-24"
              title={<>등급 · 보상 역할<Count n={configs.length} /></>}
              right={<Btn variant="secondary" size="sm" onClick={() => { setRoleForm(EMPTY_ROLE); openFormAt("role"); }}>＋ 추가</Btn>}
              flush
            >
              {isLoading ? loadingRow : (
                <DataTable
                  className={tableFlat}
                  columns={roleCols}
                  rows={roleRows}
                  rowKey={(r) => r.k}
                  selectedKey={roleSelKey}
                  onRowClick={(r) => {
                    if (r.tier) return openTier(r.tier);
                    const c = r.cfg;
                    if (!c) return;
                    // exclusive 는 폼에 칸이 없다 — 옮겨 담지 않으면 배타 역할을 수정할 때 조용히 풀린다
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
          </div>

          <div className="min-w-0 space-y-5">
            <Panel id="sec-protected" className="scroll-mt-24" title="시즌 전환 보호 역할" flush>
              {!settings ? loadingRow : (
                <FieldRow label="보호할 역할" top changed={chg("protectedRoleIds")} hint="시즌 전환 때 디스코드에서 떼지 않습니다">
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

            {/* 📌 승급 화면 미리보기 — 2026-10-08 운영자 요청(관리 화면에 [등급 선택] [재생]). 서버에 아무것도 적지 않는다 */}
            <Panel
              id="sec-promo"
              className="scroll-mt-24"
              title="승급 화면 미리보기"
              right={<Btn size="sm" onClick={() => { setPromoRun((n) => n + 1); setPromoPlay(promoPick); }}>재생</Btn>}
              flush
            >
              <FieldRow label="등급">
                <select value={promoPick} onChange={(e) => setPromoPick(Number(e.target.value))} className={inputClass}>
                  {TIERS.map((t, i) => i > 0 && (
                    <option key={t.key} value={i}>{TIERS[i - 1].name} → {t.name}</option>
                  ))}
                </select>
              </FieldRow>
            </Panel>
            {promoPlay != null && <PromoOverlay key={promoRun} from={promoPlay - 1} to={promoPlay} onClose={() => setPromoPlay(null)} />}
          </div>
        </PanelGrid>
      )}

      {/* ═══════════ 퀘스트 ═══════════
          📌 2026-10-17 「콘텐츠」 탭 이름을 바꿨다 — 채널 정책 · 기간제 부스트는 정책 탭으로. 줄을 누르면 편집 칸이 뜬다 */}
      {tab === "quests" && (
        <Panel
          id="sec-quests"
          className="scroll-mt-24"
          title={<>퀘스트<Count n={quests.length} /></>}
          right={
            <>
              <Btn variant="ghost" size="sm" onClick={openPicks}>노출 방식</Btn>
              {/* 📌 추천 퀘스트 — 모바일은 "추천" 두 글자(제목 줄의 세 단추가 한 줄에 들게) */}
              <Btn variant="ghost" size="sm" onClick={() => setQuestPresetOpen(true)}>
                <span className="md:hidden">추천</span>
                <span className="hidden md:inline">추천 퀘스트</span>
              </Btn>
              <Btn variant="secondary" size="sm" onClick={() => { setQuestForm({ ...EMPTY_QUEST, period: questView === "all" ? "daily" : questView }); openFormAt("quest"); }}>＋ 추가</Btn>
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
                      ? `${f.every}마다 유저마다 활성 ${on}개 중 ${Math.min(pick, on)}개 무작위${on > pick ? rerollSummary(Number(settings?.[f.rr] ?? REROLL_FREE_DEF), Number(settings?.[f.price] ?? f.priceDef)) : ""}`
                      : `활성 ${on}개 전부 노출 · ${f.every} 초기화`}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 border-b border-[#ededed]">
            <Segmented options={questViewOptions} value={questView} onChange={(v) => setQuestView(v as typeof questView)} />
          </div>
          {isLoading ? loadingRow
            : questRows.length === 0 ? <PanelEmpty>{questView === "all" ? "등록된 퀘스트가 없습니다." : `등록된 ${PERIOD_LABEL[questView]} 퀘스트가 없습니다.`}</PanelEmpty>
            : (
              <DataTable
                className={tableFlat}
                columns={questCols}
                rows={questRows}
                rowKey={(q) => q._id}
                selectedKey={isFormOpen("quest") ? editId : null}
                onRowClick={(q) => {
                  setQuestForm(questToForm(q));
                  openFormAt("quest", q._id);
                }}
              />
            )}
        </Panel>
      )}

      {/* ═══════════ 지급 · 내역 ═══════════
          📌 왼쪽 좁은 열에 수동 지급 · 초기화 폼, 오른쪽 넓은 열에 내역 표(봇 · 수동 · 아이템 · 대기열 한 표). 좁은 화면에선 위아래로 */}
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
                      <TargetInput value={grantForm.target} onChange={(v) => setGrantForm((f) => ({ ...f, target: v }))} />
                      <TargetChips check={grantCheck} onPick={(k, id) => setGrantForm((f) => ({ ...f, target: pickTargetKey(grantCheck.keys, k, id) }))} />
                    </Field>
                    {/* 📌 빙옥은 1 = 10,000 XP 단위(lib/pointRate) — XP 숫자를 그대로 넣지 않게 입력 옆에 환율을 둔다 */}
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
                      <Btn type="submit" variant="primary" disabled={isGranting || grantCheck.locked}>{isGranting ? "처리 중…" : "지급"}</Btn>
                      <Btn type="button" variant="danger" onClick={submitRemove} disabled={isGranting || !grantForm.amount || grantCheck.locked}>{grantUnit} 제거</Btn>
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
                          value: it._id, label: it.shortName || it.name, hint: it.categoryLabel || itemTypeLabel(it.type),
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
                    {/* 📌 수량 — ×N 으로 쌓이는 아이템만 고칠 수 있다. 칸은 늘 두어(흐리게) 아이템을 바꿔도 아래 칸이 밀리지 않게 */}
                    <Field label="수량">
                      <Inline>
                        <input type="number" min={1} max={99} value={grantStackable ? itemGrant.qty : "1"} disabled={!grantStackable}
                          onChange={(e) => setItemGrant({ ...itemGrant, qty: e.target.value === "" ? "" : String(Math.min(99, Math.max(1, Math.trunc(Number(e.target.value) || 0)))) })}
                          onBlur={() => setItemGrant((g) => ({ ...g, qty: String(grantQty) }))} className={numClass} />
                        개
                      </Inline>
                    </Field>
                    <Field label={<>대상 <Req /></>} hint="XP 기록이 있는 유저만 검색됩니다">
                      <TargetInput value={itemGrant.target} onChange={(v) => setItemGrant((g) => ({ ...g, target: v }))} />
                      <TargetChips check={itemCheck} onPick={(k, id) => setItemGrant((g) => ({ ...g, target: pickTargetKey(itemCheck.keys, k, id) }))} />
                    </Field>
                    <Field label="사유">
                      <input type="text" value={itemGrant.reason} onChange={(e) => setItemGrant({ ...itemGrant, reason: e.target.value })}
                        placeholder="예: 이벤트 우승 보상" className={inputClass} />
                    </Field>

                    <div className="flex flex-wrap gap-2">
                      <Btn type="submit" variant="primary" disabled={isGranting || !itemGrant.itemId || itemCheck.locked}>{isGranting ? "처리 중…" : "지급"}</Btn>
                      <Btn type="button" variant="secondary" onClick={() => setConfirmAllItem(true)} disabled={isGranting || !itemGrant.itemId}>전체 유저에게 지급</Btn>
                    </div>
                  </form>
                  <p className={fieldNote}>역할이 연결된 아이템은 봇이 30초 이내에 역할을 붙입니다. 이미 보유한 유저는 건너뜁니다.</p>
                </>
              )}
            </Panel>

            {/* 📌 초기화는 되돌릴 수 없다 — 빨간 테두리로 따로 떼고, 누르면 확인 모달을 한 번 더 거친다. 대상 칸은 수동 지급과 따로 */}
            <Panel
              id="sec-reset"
              className="scroll-mt-24 !border-[#e91e3f]/40"
              title={<span className="text-[#d01634]">XP 초기화</span>}
              desc="되돌릴 수 없습니다 — 레벨 보상 역할도 봇이 30초 이내에 함께 회수하며, ARCTIC에서 구매한 역할만 남습니다."
            >
              <Field label="대상">
                <TargetInput value={resetTarget} onChange={setResetTarget} />
                <TargetChips check={resetCheck} onPick={(k, id) => setResetTarget(pickTargetKey(resetCheck.keys, k, id))} />
              </Field>
              <div className="flex flex-wrap gap-2">
                {/* 초기화는 한 명씩 — 2명 이상 적혀 있으면 잠근다(서버도 400) */}
                <Btn variant="danger" disabled={isGranting || resetCheck.keys.length !== 1 || resetCheck.locked} onClick={() => setConfirmReset([resetCheck.keys[0]])}>
                  위 대상 초기화
                </Btn>
                <Btn variant="danger" disabled={isGranting} onClick={() => setConfirmReset("all")}>
                  전체 유저 초기화
                </Btn>
              </div>
            </Panel>
          </div>

          <div className="flex-1 min-w-0">
            {/* 출처마다 건수의 기준이 달라(봇=전체 검색 결과, 수동=최근 50건, 아이템=읽은 만큼) 지금 거르기가 덮는 출처만 적는다 */}
            <Panel
              id="sec-logs"
              className="scroll-mt-24"
              title="지급 내역"
              right={<span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{ledgerCount}</span>}
              flush
            >
              <div className="px-5 py-3 border-b border-[#ededed] space-y-2.5">
                <SearchInput value={logQuery} onChange={(v) => { setLogQuery(v); setLogPage(0); }} placeholder="유저 이름 검색" />
                {/* 거르기 칩 — 8개라 좁은 화면에서는 줄을 바꿔 감싼다(옆 스크롤 없음) */}
                <div role="group" aria-label="구분" className="flex flex-wrap gap-1.5">
                  {LEDGER_FILTERS.map((f) => (
                    <ChoiceChip key={f.v} on={ledgerFilter === f.v} n={f.v === "pending" ? queue.length : undefined}
                      onClick={() => { setLedgerFilter(f.v); setLogPage(0); }}>
                      {f.l}
                    </ChoiceChip>
                  ))}
                </div>
              </div>

              {ledgerRows.length === 0 ? (
                <PanelEmpty>{ledgerFilter === "pending" ? "대기 중인 지급이 없습니다." : "표시할 지급 내역이 없습니다."}</PanelEmpty>
              ) : (
                <>
                  <DataTable className={tableFlat} columns={ledgerCols} rows={ledgerRows} rowKey={(r) => r.k} />
                  {/* 쪽 넘김은 봇 로그 기준 — 수동 · 대기는 읽은 것이 전부라 나눌 쪽이 없다. 아이템은 더 보기(한 번에 300건) */}
                  {BOT_FILTERS.has(ledgerFilter) && (
                    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-[#ededed]">
                      <Btn variant="ghost" size="sm" disabled={logPage === 0} onClick={() => setLogPage((p) => Math.max(0, p - 1))}>이전</Btn>
                      <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums">{logPage + 1} / {Math.max(1, Math.ceil(logTotal / 50))}</span>
                      <Btn variant="ghost" size="sm" disabled={(logPage + 1) * 50 >= logTotal} onClick={() => setLogPage((p) => p + 1)}>다음</Btn>
                    </div>
                  )}
                  {ledgerFilter === "item" && itemGrantsNext && (
                    <div className="px-5 py-3 border-t border-[#ededed] flex justify-center">
                      <Btn variant="secondary" className="w-[116px]" onClick={loadMoreItemGrants} disabled={itemGrantsBusy}>더 보기</Btn>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ═══════════ 편집 칸 ═══════════ */}
      <EditPane
        open={isFormOpen("role")}
        title={editId ? "보상 역할 수정" : "보상 역할 추가"}
        badge={roleForm.exclusive ? <StatusChip>배타</StatusChip> : undefined}
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
            options={roleOptions(rewardRoleOptions)}
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
          <p className={fieldNote}>배타 역할 — 더 높은 배타 역할을 받으면 회수됩니다.</p>
        )}
      </EditPane>

      {/* 등급 칸 — 그 등급에 붙일 디스코드 역할 · Boost. 지급 레벨은 등급 시작 레벨 · 배타로 늘 저장한다(saveTier). 연결을 풀려면 「연결 안 함」 */}
      <EditPane
        open={isFormOpen("tier") && !!openTierRow}
        title={openTierRow ? `${openTierRow.name} 등급` : ""}
        sub={openTierRow ? <span className="tabular-nums">Lv.{openTierRow.min}+</span> : undefined}
        saveLabel="저장"
        onSubmit={saveTier}
        onCancel={() => { setTierForm(EMPTY_TIER_FORM); closeForm(); }}
      >
        <Field label="디스코드 역할" hint="승급하면 아래 등급 역할은 회수됩니다">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={tierForm.roleId}
            onChange={pickTierRole}
            options={[{ value: "", label: "연결 안 함" }, ...roleOptions(tierRoleOptions)]}
          />
        </Field>
        <Field label="채팅/음성 Boost XP" hint="보유자의 XP 지급마다 추가">
          <input type="number" min={0} placeholder="0" value={tierForm.buffXp} disabled={!tierForm.roleId} onChange={(e) => setTierForm({ ...tierForm, buffXp: e.target.value })} className={inputClass} />
        </Field>
        <Field label="출석 Boost XP" hint="출석체크 시 추가 지급">
          <input type="number" min={0} placeholder="0" value={tierForm.attendBuffXp} disabled={!tierForm.roleId} onChange={(e) => setTierForm({ ...tierForm, attendBuffXp: e.target.value })} className={inputClass} />
        </Field>
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
            onChange={(v) => setQuestForm({ ...questForm, period: v, ...(v === "daily" && questForm.metric === "run" ? { metric: questReasonOf(questForm.reason)?.metrics[0] || "count" } : {}) })}
          />
        </Field>
        {/* 📌 대상 · 방식 · 시간대 — 칸은 늘 같은 자리에 두고, 대상에 맞지 않는 방식 · 시간대는 흐리게만 한다(편집 칸 높이가 흔들리지 않게).
            고를 수 있는 조합은 lib/questKinds.js QUEST_REASONS — 저장 때 서버(normalizeQuestCond)가 한 번 더 맞춘다 */}
        <Field label="측정 대상" hint="XP 지급 기록은 봇이 XP를 준 기록, 활동은 봇이 세는 메시지 · 답장 · 반응 등, 기록은 출석 · 구매 · 강화 · 패스 · 퀘스트 수령 기록입니다.">
          <Dropdown
            theme="light"
            buttonClassName={DD}
            value={questForm.reason}
            onChange={(v) => {
              const r = questReasonOf(v);
              if (!r) return;
              const metric = r.metrics.includes(questForm.metric) ? questForm.metric : r.metrics[0];
              const timed = r.src === "log" || r.src === "act";
              setQuestForm({
                ...questForm,
                reason: v,
                metric,
                ...(timed ? {} : { hourFrom: "", hourTo: "", days: [] }),
                ...(r.ch ? {} : { channelIds: [] }),
                ...(r.voice ? {} : { minPeople: "", live: false, micOn: false }),
                ...(timed && metric === "day" ? {} : { dayMin: "" }),
              });
            }}
            options={QUEST_REASON_OPTIONS}
          />
        </Field>
        <Field
          label="측정 방식"
          hint={
            <span className={HINT_2LINE}>
              {questMetricHint(questForm.reason, questForm.metric)}
            </span>
          }
        >
          <Segmented
            options={QUEST_METRICS}
            value={questForm.metric}
            disabledValues={QUEST_METRICS.map((m) => m.v).filter((v) => !(questReasonOf(questForm.reason)?.metrics || []).includes(v) || (v === "run" && questForm.period === "daily"))}
            onChange={(v) => {
              if (!(questReasonOf(questForm.reason)?.metrics || []).includes(v)) return notify("이 측정 대상에서는 고를 수 없는 방식입니다.", true);
              if (v === "run" && questForm.period === "daily") return notify("일일 퀘스트에서는 연속 일수를 고를 수 없습니다.", true);
              setQuestForm({ ...questForm, metric: v, ...(v === "day" ? {} : { dayMin: "" }) });
            }}
          />
        </Field>
        <Field label="시간대 (선택)" hint="KST 기준 · 시작 ≤ 시각 < 끝 · 22 ~ 2 처럼 자정을 넘길 수 있습니다 · 비우면 하루 종일 (XP 지급 기록 · 활동만)">
          <div className="grid grid-cols-2 gap-3">
            <label className="block min-w-0">
              <span className="block mb-1 text-[12px] text-[#5a5a5a]">시작 (시)</span>
              <input type="number" min={0} max={23} value={questForm.hourFrom} placeholder="—"
                disabled={!questTimed(questForm.reason)}
                onChange={(e) => setQuestForm({ ...questForm, hourFrom: e.target.value })} className={`${inputClass} disabled:opacity-40`} />
            </label>
            <label className="block min-w-0">
              <span className="block mb-1 text-[12px] text-[#5a5a5a]">끝 (시)</span>
              <input type="number" min={0} max={24} value={questForm.hourTo} placeholder="—"
                disabled={!questTimed(questForm.reason)}
                onChange={(e) => setQuestForm({ ...questForm, hourTo: e.target.value })} className={`${inputClass} disabled:opacity-40`} />
            </label>
          </div>
        </Field>
        {/* 📌 2026-10-03 조건 칸 — 시간대와 같은 규칙: 칸은 늘 같은 자리, 대상에 맞지 않으면 흐리게만(편집 칸 높이가 흔들리지 않게) */}
        {(() => {
          const r = questReasonOf(questForm.reason);
          const timed = questTimed(questForm.reason);
          const days: number[] = Array.isArray(questForm.days) ? questForm.days : [];
          const dayKey = [...days].sort((a, b) => a - b).join(",");
          const dayPreset = days.length === 0 || days.length === 7 ? "all" : dayKey === "1,2,3,4,5" ? "wd" : dayKey === "0,6" ? "we" : "";
          const chIds: string[] = Array.isArray(questForm.channelIds) ? questForm.channelIds : [];
          const chPick = channelOptions.filter((o) => !chIds.includes(o.value));
          const off = "opacity-40 pointer-events-none";
          return (
            <>
              <Field label="요일 (선택)" hint="KST 기준 · 비우면 매일 (XP 지급 기록 · 활동만)">
                <div className={`flex flex-wrap items-center gap-2 ${timed ? "" : off}`}>
                  <Segmented
                    options={[{ v: "all", l: "매일" }, { v: "wd", l: "평일" }, { v: "we", l: "주말" }]}
                    value={dayPreset}
                    onChange={(v) => setQuestForm({ ...questForm, days: v === "wd" ? QUEST_WEEKDAYS : v === "we" ? QUEST_WEEKEND : [] })}
                  />
                  <div className="inline-flex p-1 rounded-full bg-[#f2f2f2]" role="group" aria-label="요일">
                    {QUEST_DAY_LABELS.map((l, day) => {
                      const on = days.includes(day);
                      return (
                        <button key={day} type="button" aria-pressed={on}
                          onClick={() => setQuestForm({ ...questForm, days: on ? days.filter((x) => x !== day) : [...days, day].sort((a, b) => a - b) })}
                          className={`shrink-0 w-8 h-8 rounded-full text-[13px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Field>
              <Field label="채널 (선택)" hint="고른 채널 · 카테고리 안에서만 셉니다 · 비우면 모든 채널 · 최대 20개 (채팅 · 음성 · 활동만)">
                <div className={r?.ch ? "" : off}>
                  {chIds.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {chIds.map((id) => (
                        <span key={id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#131313] max-w-full">
                          <span className="min-w-0 truncate">{chNameOf(id) || `삭제된 채널 (${id})`}</span>
                          <button type="button" aria-label="채널 빼기" onClick={() => setQuestForm({ ...questForm, channelIds: chIds.filter((x) => x !== id) })}
                            className="shrink-0 w-5 h-5 rounded-full text-[#8a8a8a] hover:text-[#131313] flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.6}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <Dropdown
                    theme="light"
                    buttonClassName={DD}
                    value=""
                    onChange={(v) => {
                      if (!v || chIds.includes(v)) return;
                      if (chIds.length >= 20) return notify("채널은 최대 20개까지 고를 수 있습니다.", true);
                      setQuestForm({ ...questForm, channelIds: [...chIds, v] });
                    }}
                    placeholder={chIds.length ? "채널 추가" : "모든 채널"}
                    options={chPick}
                  />
                </div>
              </Field>
              <Field label="음성 조건 (선택)" hint="그 채널 인원(본인 포함) · 화면 공유나 캠 · 마이크와 헤드셋을 켠 때만 셉니다 (음성만)">
                <div className={`flex flex-wrap items-center gap-3 ${r?.voice ? "" : off}`}>
                  <label className="inline-flex items-center gap-2 text-[13px] text-[#5a5a5a]">
                    <input type="number" min={2} max={50} value={questForm.minPeople} placeholder="—"
                      onChange={(e) => setQuestForm({ ...questForm, minPeople: e.target.value })} className={numClass} />
                    명 이상
                  </label>
                  <Toggle on={!!questForm.live} onClick={() => setQuestForm({ ...questForm, live: !questForm.live })} onLabel="화면 공유 · 캠 켠 때만" offLabel="화면 공유 · 캠 무관" />
                  <Toggle on={!!questForm.micOn} onClick={() => setQuestForm({ ...questForm, micOn: !questForm.micOn })} onLabel="마이크 켠 때만" offLabel="마이크 무관" />
                </div>
              </Field>
              <Field label="하루 기준 (선택)" hint={`일수 방식에서 하루에 이만큼 이상인 날만 셉니다 · ${questForm.reason === "voice" ? "음성은 분" : "횟수"} 기준 · 비우면 기록만 있으면`}>
                <input type="number" min={1} value={questForm.dayMin} placeholder="—"
                  disabled={!(timed && questForm.metric === "day")}
                  onChange={(e) => setQuestForm({ ...questForm, dayMin: e.target.value })} className={`${numClass} disabled:opacity-40`} />
              </Field>
            </>
          );
        })()}
        <Field label="목표치" hint={<span className={HINT_2LINE}>{questTargetHint(questForm.reason, questForm.metric)}</span>}>
          <input type="number" min={1} value={questForm.target} onChange={(e) => setQuestForm({ ...questForm, target: e.target.value })} className={inputClass} />
        </Field>
        {/* 보상 두 칸은 한 줄로 묶는다 — XP 와 빙옥이 서로 다른 줄로 갈라지지 않게 */}
        <Field label="보상" hint="둘 다 0이면 보상 없는 ‘목표’가 됩니다.">
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
        saveLabel="노출 방식 저장"
        onSubmit={savePicks}
        onCancel={cancelPicks}
      >
        {!settings ? loadingRow : QUEST_PICK_FIELDS.map((f) => {
          const total = quests.filter((q) => (q.period || "daily") === f.period && q.enabled).length;
          const pick = Number(settings?.[f.key] ?? 0);
          const rr = Number(settings?.[f.rr] ?? REROLL_FREE_DEF);
          const price = Number(settings?.[f.price] ?? f.priceDef);
          const canSwap = pick > 0 && total > pick;
          return (
            <React.Fragment key={f.key}>
              <Field
                label={`${PERIOD_LABEL[f.period]} 노출 개수`}
                hint={pick > 0 ? `활성 ${total}개 중 ${Math.min(pick, total)}개를 ${f.every}마다 유저마다 새로 뽑습니다` : `활성 ${total}개를 전부 보여줍니다`}
              >
                <Inline>
                  <input type="number" min={0} max={20} value={settings?.[f.key] ?? 0}
                    onChange={(e) => setSettings({ ...settings, [f.key]: e.target.value })} className={numClass} />
                  개
                </Inline>
              </Field>
              {/* 📌 무료 바꾸기(리롤) 횟수 — 유저마다 그 주기에 아직 달성하지 않은 퀘스트를 다른 퀘스트로(0 = 무료 없음 · 최대 5). 바꿀 후보가 없으면(전부 노출) 단추가 뜨지 않는다 */}
              <Field
                label={`${PERIOD_LABEL[f.period]} 무료 바꾸기`}
                hint={!canSwap ? "노출 개수가 활성 퀘스트 수보다 적을 때만 바꿀 수 있습니다" : rr > 0 ? `유저마다 ${f.every} 전까지 ${rr}회 무료로 바꿀 수 있습니다` : "무료 바꾸기가 없습니다"}
              >
                <Inline>
                  <input type="number" min={0} max={5} value={settings?.[f.rr] ?? REROLL_FREE_DEF}
                    onChange={(e) => setSettings({ ...settings, [f.rr]: e.target.value })} className={numClass} />
                  회
                </Inline>
              </Field>
              {/* 📌 유료 바꾸기 값 — 무료를 다 쓴 뒤 1회마다 빙옥(회차마다 같은 값 · 횟수 제한 없음 · 0 = 유료 끔 · 0~100) */}
              <Field
                label={`${PERIOD_LABEL[f.period]} 유료 바꾸기 값`}
                hint={price > 0 ? `무료 바꾸기를 다 쓴 뒤 1회마다 빙옥 ${price}개 · 횟수 제한 없음` : "유료 바꾸기를 쓰지 않습니다"}
              >
                <Inline>
                  <input type="number" min={0} max={100} value={settings?.[f.price] ?? f.priceDef}
                    onChange={(e) => setSettings({ ...settings, [f.price]: e.target.value })} className={numClass} />
                  빙옥
                </Inline>
              </Field>
            </React.Fragment>
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
          : <>해당 퀘스트를 삭제하시겠습니까?<br/>유저 화면에서 바로 사라집니다.</>
        }
      />

      {questPresetOpen && <QuestPresetDialog onClose={() => setQuestPresetOpen(false)} onDone={onQuestPresetDone} notify={notify} />}

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
        open={!!revokeTarget}
        danger
        title="아이템 회수"
        confirmLabel="회수"
        busy={grantRowBusy}
        onCancel={() => setRevokeTarget(null)}
        onConfirm={async () => {
          const g = revokeTarget;
          if (!g) return;
          if (await patchItemGrant({ ids: g.ids || [String(g._id)], revoke: true }, "회수했습니다.")) setRevokeTarget(null);
        }}
        body={revokeTarget ? <p className="break-keep">{revokeTarget.userName || revokeTarget.userId} · {revokeTarget.itemName}{(revokeTarget.qty || 1) > 1 ? ` ×${revokeTarget.qty}` : ""}</p> : null}
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
            을 {grantQty > 1 ? `${grantQty}개씩 ` : ""}지급합니다.{grantStackable ? "" : " 이미 보유한 유저는 건너뜁니다."}
          </p>
        }
      />

      {/* 📌 여러 명 지급 · 제거 — 미리 확인한 이름(앞 10명)과 금액 · 아이템을 보여 주고 한 번 확인한다 */}
      <ConfirmDialog
        open={!!multiConfirm}
        danger={multiConfirm?.kind === "remove"}
        title={multiConfirm ? `${multiConfirm.names.length.toLocaleString()}명${multiConfirm.kind === "remove" ? "에게서 제거" : "에게 지급"}` : ""}
        confirmLabel={multiConfirm?.kind === "remove" ? "제거" : "지급"}
        busy={isGranting}
        onCancel={() => setMultiConfirm(null)}
        onConfirm={() => {
          const m = multiConfirm;
          if (!m) return;
          if (m.kind === "item") runItemGrant(m.keys);
          else runGrant(m.keys, { amount: m.amount });
        }}
        body={multiConfirm ? (
          <>
            <p className="mb-2 break-keep">
              {multiConfirm.kind === "item" ? (
                <strong className="text-[#e91e3f]">
                  {grantItems.find((it) => it._id === itemGrant.itemId)?.name || "아이템"}{grantQty > 1 ? ` ×${grantQty}` : ""} · {itemGrantDays > 0 ? `${itemGrantDays}일` : "영구"}
                </strong>
              ) : (
                <strong className={multiConfirm.amount >= 0 ? "text-[#e91e3f]" : "text-amber-700"}>
                  {multiConfirm.amount >= 0 ? "+" : ""}{multiConfirm.amount.toLocaleString()} {grantUnit}
                </strong>
              )}
            </p>
            <p className="text-[12px] break-keep break-words">
              {multiConfirm.names.slice(0, 10).join(" · ")}
              {multiConfirm.names.length > 10 ? ` 외 ${(multiConfirm.names.length - 10).toLocaleString()}명` : ""}
            </p>
          </>
        ) : null}
      />

      {/* 📌 지급 취소 — 아직 지급되지 않은 XP 건(대기 · 실패)만 지운다. 지급된 기록은 남는다(app/api/payout DELETE) */}
      <ConfirmDialog
        open={!!payCancel}
        danger
        title="지급 취소"
        confirmLabel="지급 취소"
        cancelLabel="닫기"
        busy={payBusy}
        onCancel={() => setPayCancel(null)}
        onConfirm={cancelPayout}
        body={payCancel ? (
          <p className="break-keep tabular-nums">
            {payCancel.userName || payCancel.userId} · {(payCancel.amount || 0) >= 0 ? "+" : ""}{(payCancel.amount || 0).toLocaleString()} XP{payCancel.reason ? ` · ${payCancel.reason}` : ""}
          </p>
        ) : null}
      />

      {/* 아이템 지급 사유 고치기 */}
      <FormSheet
        open={!!noteEdit}
        onClose={() => setNoteEdit(null)}
        title="지급 사유"
        busy={grantRowBusy}
        width={560}
        onSubmit={saveGrantNote}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setNoteEdit(null)}>취소</Btn>
            <Btn type="submit">저장</Btn>
          </>
        }
      >
        <input autoFocus type="text" maxLength={100} aria-label="사유" value={noteEdit?.text || ""}
          onChange={(e) => setNoteEdit((n) => (n ? { ...n, text: e.target.value } : n))}
          placeholder="사유" className={inputClass} />
      </FormSheet>

      {/* 📌 초기화는 되돌릴 수 없어 한 번 더 확인한다 */}
      <ConfirmDialog
        open={confirmReset !== null}
        danger
        title={confirmReset === "all" ? "전체 유저 XP 초기화" : "XP 초기화"}
        confirmLabel="초기화"
        busy={isGranting}
        onCancel={() => setConfirmReset(null)}
        onConfirm={() => { if (confirmReset) runGrant(confirmReset, { mode: "reset" }); }}
        body={
          <>
            <p className="mb-2 break-keep">
              {confirmReset === "all"
                ? <>XP 기록이 있는 <strong className="text-[#131313]">모든 유저</strong>의 보유 XP와 레벨이 <strong className="text-[#d01634]">0</strong>이 됩니다.</>
                : <><strong className="text-[#131313]">{confirmReset?.[0]}</strong> 님의 보유 XP와 레벨이 <strong className="text-[#d01634]">0</strong>이 됩니다.</>}
            </p>
            <p className="text-[12px] break-keep">되돌릴 수 없으며, 레벨 보상 역할도 함께 회수됩니다.</p>
          </>
        }
      />

      {noticeEl}
      {toastEl}
    </AdminPage>
  );
}
