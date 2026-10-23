"use client";

// 📌 유저 조회 — 이름 · 디스코드 ID 로 찾아 한 유저의 지갑 · 내역 · 인벤토리 · 역할 · 쿠폰 · 알림 · 문의 · 지원서를 한 자리에서 본다.
//    목록 화면 틀: 머리 → 검색 한 줄 → 결과 표 → 줄을 누르면 오른쪽 상세 칸(모바일은 아래에서 올라오는 판).
//    📌 2026-10-17 정리 — 상세 칸 탭 다섯(내역 · 인벤토리 · 역할 · 쿠폰 · 알림·문의·지원, 주소 ?tab=), 아래 단추 셋(지급 · 알림 · 제재).
//      내역 = XP · 빙옥 원장(/api/xp/ledger — 완료된 지급 · 구매 차감이 다 들어 있다) · 구매(상태 칩) · 대기·실패(아직 안 들어간 지급).
//      지급 = 창 하나(XP · 빙옥 · 쿠폰 · 아이템), 제재 = 창 하나(음성 XP 정지 · XP 획득 중단). 잠금 조건은 예전 단추 그대로(XP 기록 없음이면 지급 · 제재 잠금, 알림은 됨).
//    쓰기 — 인벤토리 탭 1회 소모권 "1개 사용"(app/api/admin/users/consume) · 아이템 회수(app/api/admin/users/inventory — 지급 · 패스는 그냥 회수, 구매는 낸 값 환불) ·
//    역할 탭 역할 회수(app/api/admin/users/roles) · 지급 창 — XP · 빙옥 지급/제거(app/api/xp/grant) · 쿠폰 지급(app/api/shop/coupons/issue) · 아이템 지급(app/api/admin/items/grant) ·
//    알림 창(app/api/notifications) · 제재 창 — 음성 XP 정지/해제(app/api/admin/users/voice-stop) · XP 획득 중단 설정/해제(app/api/admin/users/xp-stop).
//    전부 기존 API 를 target / recipient = 이 유저 ID 로 부른다(다른 화면에서 ID 를 다시 넣지 않게).
//    주소에 ?q= · ?userId= · ?tab= 을 실어 새로고침해도 같은 화면이 다시 열린다. 이미 열린 화면에서 주소가 바뀌어도(기능 검색) 따라 연다.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AdminPage, SearchInput, Segmented, Btn, SwapLabel, DataTable, DetailPane, DefRow, StatusChip, EmptyRow, ConfirmDialog, FormSheet, Inline,
  inputClass, numClass, labelClass, useAdminGuard, useToast, type Column,
} from "../ui";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import TierEmblem from "../../components/TierEmblem";
import { invIconType, invTierOf } from "../../components/Inventory";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { getTier, tierPaint, tierText } from "@/lib/voiceTiers";

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
  voiceXpOff?: boolean; voiceXpOffAt?: string | null; voiceXpOffBy?: string; // 음성 XP 정지(app/api/admin/users/voice-stop)
  xpStop?: XpStop | null; // XP 획득 중단(app/api/admin/users/xp-stop) — 기록이 있으면(끝났지만 해제 안 한 것 포함)
  pass: Pass;
};
// 📌 XP 획득 중단 — status: active 막는 중 · reserved 예약 · ended 기간이 끝났지만 해제하지 않은 것(봇은 계속 제재 중으로 본다 — lib/xpStop.js xpStopRecord)
type StopStatus = "active" | "reserved" | "ended";
type XpStop = { from: string | null; until: string | null; by: string; reason: string; active: boolean; status: StopStatus };
const STOP_META: Record<StopStatus, { chip: string; state: string; tone: Tone }> = {
  active: { chip: "XP 획득 중단", state: "중단 중", tone: "bad" },
  reserved: { chip: "XP 중단 예약", state: "예약", tone: "warn" },
  ended: { chip: "중단 기간 끝남 · 해제 안 함", state: "기간 끝남 · 해제 안 함", tone: "neutral" },
};
// 서버가 status 를 빠뜨려도(재시작 전 서버 · xp-stop 응답) active 로 고른다
const normStop = (s: Partial<XpStop> | null | undefined): XpStop | null =>
  s && typeof s === "object"
    ? {
        from: s.from ? String(s.from) : null,
        until: s.until ? String(s.until) : null,
        by: String(s.by || ""),
        reason: String(s.reason || ""),
        active: !!s.active,
        status: s.status === "ended" || s.status === "reserved" || s.status === "active" ? s.status : s.active ? "active" : "reserved",
      }
    : null;
// ×N 묶음(1회 소모권 · 소모품) — thing: 묶음 키(인벤토리 칸 favKey 와 같은 키), pending: 그중 지급 대기
type Stack = { thing: string; name: string; count: number; pending: number };
type Detail = {
  stacks?: Stack[];
  user: UserSum | null;
  purchases: any[]; payouts: any[]; coupons: any[];
  notifications: any[]; inquiries: any[]; applies: any[];
  seasons: { season: number; name: string; rank: number; xp: number; level: number }[];
};
type TabId = "history" | "inv" | "role" | "coupon" | "inbox";
type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "ink";

const LIST_LIMIT = 50; // API 가 목록마다 최근 50건까지 준다
// 📌 count — 탭 개수 자리(넓은 화면에서만)
//    fixed: 2자리 폭을 늘 잡는다 — 늦게 읽는 탭(인벤토리 · 역할)은 개수가 떠도, 50건 상한 탭은 자릿수가 바뀌어도 이름이 밀리지 않는다
//    fit: 숫자만큼 — 알림·문의·지원(최대 150). 상세와 함께 처음부터 있다
//    none: 개수 없음(내역 — 원장은 쪽 단위)
const TABS: { id: TabId; l: string; count: "fixed" | "fit" | "none" }[] = [
  { id: "history", l: "내역", count: "none" },
  { id: "inv", l: "인벤토리", count: "fixed" },
  { id: "role", l: "역할", count: "fixed" },
  { id: "coupon", l: "쿠폰", count: "fixed" },
  { id: "inbox", l: "알림·문의·지원", count: "fit" },
];
const isTabId = (v: string | null): v is TabId => !!v && TABS.some((t) => t.id === v);
// 📌 역할 탭 — 디스코드에서 지금 가진 역할(app/api/admin/users/roles). 레벨 보상 · 디스코드 관리 역할은 뗄 수 없다
type HeldRole = { id: string; name: string; color: string; managed: boolean; rewardLevel: number | null; item: string };
type RoleState = { key: string; loading: boolean; present: boolean; roles: HeldRole[]; error: string };

// 📌 인벤토리 탭 — 유저 화면 인벤토리와 같은 판정(app/api/admin/users/inventory)에 회수 방법(revoke)이 붙는다.
//    rows: 그 물건의 기록을 서버가 다시 모아 회수(key 를 그대로 돌려준다) · role: 구매 기록 없이 역할로 가진 것 → 역할 회수 API · locked: 손대지 않는다(lock 라벨)
//    units: 회수 순서대로 한 건씩 — 지급 · 패스(낸 값 없음) 먼저, 그다음 구매(xp · point = 돌려줄 값, clawXp = 돌려줄 XP 로 다 못 뺀 캐시백 — 지갑에서 빠짐)
type RevokeUnit = { src: "grant" | "pass" | "shop"; xp: number; point: number; clawXp: number };
type Revoke = { mode: "rows" | "role" | "locked"; key: string; roleId: string; lock: string; stack: boolean; max: number; tool: number; units: RevokeUnit[] };
type InvSource = "shop" | "grant" | "pass" | "event" | "goedam" | "item" | "level" | "season";
type InvCard = {
  uid: string; kind: string; type: string; name: string; description?: string;
  icon?: string; imageUrl?: string; color?: string;
  status: "pending" | "completed" | "missing";
  days?: number; expiresAt?: string | null; acquiredAt?: string | null; siteOnly?: boolean;
  source: InvSource; rewardLevel?: number | null; exclusive?: boolean;
  count?: number; pendingCount?: number; effectLines?: string[]; skinKey?: string; frameKey?: string; badgeId?: string;
  favKey?: string; // 같은 물건 키 — ×N 묶음(Stack.thing)과 같은 키라 그 줄에 [1개 사용]을 붙인다
  revoke: Revoke;
};
type InvState = { key: string; synced: boolean; canGrant: boolean; items: InvCard[]; error: string };
const INV_SOURCE: Record<InvSource, string> = { shop: "구매", grant: "지급", pass: "패스", event: "이벤트", goedam: "괴담회", item: "역할", level: "레벨 보상", season: "시즌 보상" };
const UNIT_SRC: { src: RevokeUnit["src"]; l: string }[] = [{ src: "grant", l: "지급" }, { src: "pass", l: "패스" }, { src: "shop", l: "구매" }];

const toInt = (v: unknown) => Math.max(0, Math.trunc(Number(v) || 0));
// 서버가 빠뜨린 칸이 있어도 화면이 깨지지 않게 — 모르는 회수 방법은 잠금으로
const normRevoke = (v: unknown): Revoke => {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Revoke>;
  return {
    mode: o.mode === "rows" || o.mode === "role" ? o.mode : "locked",
    key: String(o.key || ""),
    roleId: String(o.roleId || ""),
    lock: String(o.lock || ""),
    stack: !!o.stack,
    max: toInt(o.max),
    tool: toInt(o.tool),
    units: (Array.isArray(o.units) ? o.units : []).map((u: Partial<RevokeUnit>) => ({
      src: u?.src === "shop" || u?.src === "pass" ? u.src : "grant",
      xp: toInt(u?.xp),
      point: toInt(u?.point),
      clawXp: toInt(u?.clawXp),
    })),
  };
};
// 인벤토리 한 번 읽기 — 상태는 건드리지 않고 결과만 돌려준다(부르는 쪽이 key 로 늦은 응답을 버린다)
async function fetchInventory(userId: string): Promise<InvState> {
  const fail = (error: string): InvState => ({ key: userId, synced: true, canGrant: false, items: [], error });
  try {
    const r = await fetch(`/api/admin/users/inventory?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.success) return fail(d?.message || d?.error || "인벤토리를 읽지 못했습니다.");
    const items: InvCard[] = (Array.isArray(d.data?.items) ? d.data.items : []).map((x: InvCard) => ({ ...x, name: String(x?.name || "—"), revoke: normRevoke(x?.revoke) }));
    return { key: userId, synced: d.data?.synced !== false, canGrant: !!d.data?.canGrant, items, error: "" };
  } catch {
    return fail("인벤토리를 읽지 못했습니다.");
  }
}

// 썸네일 — 등급 보상은 엠블럼, 그림이 있으면 칸을 꽉 채우고, 나머지는 공용 아이콘
function InvThumb({ it }: { it: InvCard }) {
  const tier = invTierOf(it);
  return (
    <span className="w-10 h-10 shrink-0 rounded-lg bg-[#f2f2f2] overflow-hidden inline-flex items-center justify-center">
      {tier ? <TierEmblem tier={tier} size={25} onDark={false} />
        : it.imageUrl ? <ItemIcon imageUrl={it.imageUrl} size={40} style={{ borderRadius: 0 }} />
        : <ItemIcon icon={it.icon} type={invIconType(it)} size={22} color={it.color || undefined} />}
    </span>
  );
}

// 📌 지급 창 — 한 창에서 XP · 빙옥 · 쿠폰 · 아이템. 알약을 바꿔도 창 높이가 그대로(본문 최소 높이 — 가운데 창의 위 칸이 들썩이지 않게)
type GiveKind = "xp" | "point" | "coupon" | "item";
const GIVE_KINDS = [{ v: "xp", l: "XP" }, { v: "point", l: "빙옥" }, { v: "coupon", l: "쿠폰" }, { v: "item", l: "아이템" }];
const GIVE_MIN_H = 432; // 가장 긴 아이템(알약 · 아이템 · 기간 · 수량 · 사유) — 실측 430
// 📌 아이템 지급 — 아이템 목록은 처음 아이템을 고를 때 한 번(GET /api/admin/items, 기프트카드 제외)
type GrantItem = { _id: string; name: string; type: string; icon?: string; imageUrl?: string; color?: string; stackable?: boolean; shortName?: string; categoryLabel?: string };
type GrantForm = { itemId: string; daysMode: string; days: string; qty: string; reason: string };
const EMPTY_GRANT: GrantForm = { itemId: "", daysMode: "0", days: "", qty: "1", reason: "" };
const GRANT_DAYS = [{ v: "0", l: "무기한" }, { v: "7", l: "7일" }, { v: "30", l: "30일" }, { v: "custom", l: "직접" }];
const TOOL_NOTE_RE = /^역할 (이전|환불|정리)/; // 역할 이전 도구 기록으로 읽히는 사유(lib/roleMigrationTerms.js — 정리 기록 포함)
// 공용 Dropdown(라이트)을 입력칸(inputClass)과 같은 높이 · 테두리로 (app/admin/bot 과 같은 값)
const DD = "!px-3 !py-2 min-h-10 !text-[14px] !border-[#a3a3a3]";
// 창 아래 주 단추 — 글자가 바뀌어도(지급 ↔ 제거 ↔ 처리 중…) 폭이 그대로
const MAIN_BTN = "w-[88px] shrink-0";

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
      <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: tierPaint(t) }} />
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

// compact: 한 탭 안에 묶음이 여럿일 때(알림·문의·지원) — 빈 묶음을 큰 점선 칸 대신 한 줄로
function List({ items, empty = "없음", capped = true, compact = false, children }: { items: any[]; empty?: string; capped?: boolean; compact?: boolean; children: React.ReactNode }) {
  if (items.length === 0) return compact ? <p className="py-2.5 text-[13px] text-[#a3a3a3]">{empty}</p> : <EmptyRow>{empty}</EmptyRow>;
  return (
    <>
      <ul className="divide-y divide-[#ededed]">{children}</ul>
      {capped && items.length >= LIST_LIMIT && <p className="pt-2 text-[12px] text-[#8a8a8a]">최근 {LIST_LIMIT}건</p>}
    </>
  );
}

// 한 탭 안의 작은 묶음 머리
const SubHead = ({ label, n }: { label: string; n: number }) => (
  <h3 className="flex items-center gap-1.5 pt-5 first:pt-0 pb-1 text-[12px] font-black text-[#5a5a5a]">
    {label}
    <span className="font-bold text-[#a3a3a3] tabular-nums">{n}</span>
  </h3>
);

// 📌 내역 탭 — XP · 빙옥은 원장 /api/xp/ledger?userId=&currency=xp|point&before= → data: { items: [{ at, currency, amount, label, kind, count? }], hasMore, nextBefore }
//    (완료된 지급 · 구매 차감이 다 들어 있다). 구매는 구매 기록(상태 칩 · 연장 · 사용 · 오류), 대기·실패는 아직 안 들어간 지급(Payout 대기 · 처리 중 · 실패)
type LedgerCur = "xp" | "point";
type Ledger = { key: string; items: any[]; loading: boolean; more: string | null };
type HistKind = "xp" | "point" | "purchase" | "payout";

// 📌 XP · 빙옥 지급/제거 — POST /api/xp/grant { target: 유저 ID, amount(제거는 음수), reason, currency: "xp" | "point" }.
//    XP 는 봇 큐가 30초 안에 반영 · 빙옥은 바로. 제거는 서버가 보유량까지만 자른다. XP 기록(UserXp)이 없는 유저는 서버가 404
type MoneyDir = "give" | "take";
type MoneyForm = { dir: MoneyDir; amount: string; reason: string };
const EMPTY_MONEY: MoneyForm = { dir: "give", amount: "", reason: "" };
const MONEY_DIR = [{ v: "give", l: "지급" }, { v: "take", l: "제거" }];

// 📌 쿠폰 지급 — 목록은 처음 쿠폰을 고를 때 한 번(GET /api/shop/coupons), 지급은 POST /api/shop/coupons/issue { couponId, target: 유저 ID }.
//    서버는 같은 쿠폰을 미사용으로 가진 유저를 건너뛴다(성공 + "0명에게 …") — 화면도 보유 중이면 잠근다. XP 기록이 없는 유저는 서버가 404
//    off: 목록을 받은 때 기준 중지 · 만료 · 소진(관리 › 상점 쿠폰 상태와 같은 규칙). 쓸 수 있으면 ""
//    📌 할인형만 — 보상형(코드 입력으로 받는 쿠폰)은 목록에서 뺀다
type CouponOpt = {
  _id: string; code: string; name?: string; kind?: string; type?: string; value?: number; maxDiscount?: number;
  active?: boolean; expiresAt?: string | null; maxUses?: number; usedCount?: number; off: string;
};
const couponOff = (c: Omit<CouponOpt, "off">, now: number) =>
  !c.active ? "중지"
    : c.expiresAt && new Date(c.expiresAt).getTime() < now ? "만료"
    : (c.maxUses || 0) > 0 && (c.usedCount || 0) >= (c.maxUses || 0) ? "소진"
    : "";
const couponShort = (c: CouponOpt) => (c.type === "flat" ? `${num(c.value)} XP` : `${num(c.value)}%`);
const couponBenefit = (c: CouponOpt) =>
  c.type === "flat" ? `${num(c.value)} XP 할인`
    : `${num(c.value)}% 할인${(c.maxDiscount || 0) > 0 ? ` · 최대 ${num(c.maxDiscount)}` : ""}`;

// 📌 알림 발송 — POST /api/notifications { recipient: 유저 ID, type, title, content } (관리 › 알림 발송과 같은 칸).
//    DM 핑은 서버가 늘 보낸다(응답 dmSent). 서버 오류 글은 message 가 아니라 error 에 온다
type MsgForm = { type: string; title: string; content: string };
const EMPTY_MSG: MsgForm = { type: "안내", title: "", content: "" };
const NOTI_TYPES = Object.keys(NOTI_TONE).map((t) => ({ v: t, l: t }));
// 📌 제재 창 — 음성 XP 정지 · XP 획득 중단을 알약으로 고른다. 창의 단추가 곧 실행(예전 음성 정지 확인 창 대신 — 창을 열고 누르는 것이 확인)
type SanKind = "voice" | "xpstop";
const SAN_KINDS = [{ v: "voice", l: "음성 XP 정지" }, { v: "xpstop", l: "XP 획득 중단" }];
const SAN_MIN_H = 380; // 가장 긴 중단 설정(알약 · 시작 · 기간 · 사유 · 종료)
// 📌 XP 획득 중단 — POST /api/admin/users/xp-stop { userId, on: true, from: "now" | ISO, days, reason } · { userId, on: false }(해제).
//    2026-10-04 운영자 "회수 + 타임아웃 3일 + 그 뒤 5일 전체 XP 획득 중단" — 시작은 지금 · 지정 시각(KST), 기간은 일 단위. 끝나면 막기는 저절로 풀리고,
//    기록은 [해제]로 지운다(지우기 전까지 봇은 제재 중으로 본다)
type StopForm = { start: "now" | "at"; at: string; days: string; reason: string };
const STOP_START = [{ v: "now", l: "지금" }, { v: "at", l: "지정 시각" }];
const STOP_MAX_DAYS = 3650; // 서버(xp-stop)와 같은 끝 — 아이템 지급 기간 칸과 같다
// datetime-local 칸 값 "YYYY-MM-DDTHH:mm" ↔ 시각 — 관리자 브라우저 시간대와 상관없이 KST 로 읽고 쓴다(표의 fmt 와 같은 기준)
const kstInput = (ms: number) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16);
const fromKstInput = (v: string) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(`${v}:00+09:00`) : NaN);
type ActKind = "give" | "notice" | "sanction";
// 상세 칸 아래 줄 단추 셋 — 모바일은 폭을 나눠 갖고, PC 는 글자 폭
const FOOT_BTN = "flex-1 sm:flex-none";
const FOOT_ROW = "w-full sm:w-auto flex items-center gap-2";

// 주소 맞추기 — 쿼리만 바꾸고 이동은 하지 않는다(새로고침해도 같은 검색 · 같은 유저 · 같은 탭). null 이면 뺀다.
//    📌 history.replaceState 는 Next 라우터가 받아 useSearchParams 를 바로 바꾼다 — 아래 주소 따라가기 효과는 화면 값과 같으면 아무것도 안 한다
const putUrl = (patch: Record<string, string | null>) => {
  const sp = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v) sp.set(k, v);
    else sp.delete(k);
  }
  const qs = sp.toString();
  window.history.replaceState(null, "", qs ? `/admin/users?${qs}` : "/admin/users");
};

export default function AdminUsersPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { toast, toastEl } = useToast();
  const sp = useSearchParams();
  const spQ = (sp.get("q") || "").trim();
  const spUid = (sp.get("userId") || "").trim();
  const tq = sp.get("tab");
  const tab: TabId = isTabId(tq) ? tq : "history";
  const setTab = (t: TabId) => putUrl({ tab: t === "history" ? null : t });

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Row[] | null>(null); // null = 아직 찾지 않음
  const searchedRef = useRef(""); // 마지막으로 찾은 검색어 — 주소 따라가기가 같은 검색을 다시 하지 않게

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailErr, setDetailErr] = useState("");
  const [histKind, setHistKind] = useState<HistKind>("xp");
  const [ledger, setLedger] = useState<Ledger | null>(null); // key = "<userId>:<currency>"
  const reqRef = useRef(0); // 빠르게 다른 줄을 누르면 늦게 온 이전 응답을 버린다
  const [spendBusy, setSpendBusy] = useState(""); // 1개 사용 중인 묶음 키
  const selectedRef = useRef<string | null>(null); // 검색을 다시 해도 열어 둔 유저를 주소에 남기려고
  // 인벤토리 — 역할 탭과 같은 틀(key 가 이 유저 것이 아니면 불러오는 중). 상태는 다른 탭의 쓰기(역할 회수 · 1개 사용)도 비운다
  const [inv, setInv] = useState<InvState | null>(null);
  const invLoadingRef = useRef(""); // 지금 읽는 중인 유저 — 탭을 오가도 같은 요청을 겹쳐 보내지 않게
  // 역할 — 탭을 열 때 · 유저를 바꿀 때 디스코드에 새로 묻는다. 다른 유저로 바뀐 뒤 늦게 온 응답은 key 로 버린다
  const [roleState, setRoleState] = useState<RoleState | null>(null);
  // 창(지급 · 알림 · 제재)은 한 번에 하나, 처리 중 잠금(actBusy)은 셋이 같이 쓴다
  const [act, setAct] = useState<ActKind | null>(null);
  const [actBusy, setActBusy] = useState(false);

  const openUser = useCallback(async (id: string) => {
    const my = ++reqRef.current;
    selectedRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailErr("");
    setAct(null);
    // 같은 유저를 다시 열어도 새로 — 늦게 읽는 탭(인벤토리 · 역할 · 내역)도 열 때 다시 읽게 비운다
    setInv(null);
    invLoadingRef.current = "";
    setRoleState(null);
    setLedger(null);
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
    searchedRef.current = t;
    setSearching(true);
    try {
      const r = await fetch(`/api/admin/users?q=${encodeURIComponent(t)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || "검색에 실패했습니다.");
      const rows: Row[] = Array.isArray(d.data) ? d.data : [];
      setResults(rows);
      // 한 명만 나오면 바로 연다 (주소로 연 유저는 그대로 두고, 이미 열려 있는 그 유저면 다시 읽지 않는다)
      const single = !keepUser && rows.length === 1 && rows[0].userId !== selectedRef.current ? rows[0].userId : null;
      if (single) openUser(single);
      putUrl({ q: t, userId: keepUser || single || selectedRef.current });
    } catch (e: any) {
      toast(e?.message || "검색에 실패했습니다.", true);
    } finally {
      setSearching(false);
    }
  }, [toast, openUser]);

  // 📌 주소의 ?q= · ?userId= 를 따라간다 — 처음 열 때, 그리고 이미 열린 화면에서 기능 검색이 주소를 바꿀 때(router.push).
  //    화면이 스스로 맞춘 주소(putUrl)는 지금 값과 같아 아무것도 하지 않는다
  useEffect(() => {
    if (!isAdmin) return;
    if (spUid && spUid !== selectedRef.current) openUser(spUid);
    if (spQ && spQ !== searchedRef.current) {
      setQuery(spQ);
      runSearch(spQ, spUid || null);
    }
  }, [isAdmin, spQ, spUid, openUser, runSearch]);

  // 역할 회수
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
        toast(d.message || "회수했습니다.");
        // 그 자리에서 뺀다(디스코드 반영을 기다리지 않게)
        setRoleState((prev) => (prev?.key === selectedId ? { ...prev, roles: prev.roles.filter((x) => x.id !== roleRevoke.id) } : prev));
        // 역할로 가진 인벤토리 칸이 바뀌었을 수 있다 — 인벤토리 탭을 열 때 다시 읽게
        setInv((prev) => (prev?.key === selectedId ? null : prev));
        setRoleRevoke(null);
      } else toast(d?.message || "처리에 실패했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setRoleBusy(false);
    }
  }, [roleRevoke, selectedId, roleBusy, toast]);

  // 내역(XP · 빙옥 원장) — 첫 쪽(before 없음) 또는 더 보기(before). 다른 유저 · 재화로 바뀐 뒤 늦게 온 응답은 key 로 버린다
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

  // 내역 탭의 XP · 빙옥을 열 때 · 유저나 재화를 바꿀 때 첫 쪽을 읽는다
  const ledgerCur: LedgerCur | null = histKind === "xp" || histKind === "point" ? histKind : null;
  useEffect(() => {
    if (tab !== "history" || !ledgerCur || !selectedId || ledger?.key === `${selectedId}:${ledgerCur}`) return;
    loadLedger(selectedId, ledgerCur, null);
  }, [tab, selectedId, ledgerCur, ledger?.key, loadLedger]);

  // ── 인벤토리 ──
  //    탭을 열 때 · 유저를 바꿀 때 읽는다. 결과는 콜백에서 넣고, 그사이 다른 유저로 바뀌었으면 버린다
  useEffect(() => {
    if (tab !== "inv" || !selectedId || inv?.key === selectedId || invLoadingRef.current === selectedId) return;
    const id = selectedId;
    invLoadingRef.current = id;
    fetchInventory(id).then((next) => {
      if (invLoadingRef.current === id) invLoadingRef.current = "";
      setInv((prev) => (selectedRef.current === id ? next : prev));
    });
  }, [tab, selectedId, inv?.key]);
  //    조용히 다시 읽기 — 목록을 비우지 않는다(깜빡임 · 줄 튐 없이). 실패하면 보던 목록을 그대로 둔다
  const reloadInv = useCallback((id: string) => {
    invLoadingRef.current = id;
    fetchInventory(id).then((next) => {
      if (invLoadingRef.current === id) invLoadingRef.current = "";
      setInv((prev) => (selectedRef.current !== id ? prev : next.error && prev?.key === id && !prev.error ? prev : next));
    });
  }, []);
  //    상세(내역 · 쿠폰 · 알림 탭 · 요약)도 조용히 — setDetail(null) 없이. 그사이 다른 유저를 열었으면(reqRef) 버린다
  const refreshDetail = useCallback(async (id: string) => {
    const my = reqRef.current;
    try {
      const r = await fetch(`/api/admin/users?userId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const d = await r.json();
      if (my !== reqRef.current || selectedRef.current !== id) return;
      if (r.ok && d?.success) {
        setDetail(d.data);
        // 검색 결과 표의 같은 줄도 — 환불로 바뀐 XP · 빙옥 · 레벨이 옆 요약과 같게
        const su: UserSum | null = d.data?.user || null;
        if (su) setResults((rs) => (rs ? rs.map((x) => (x.userId === id ? { ...x, xp: su.xp, point: su.point, level: su.level } : x)) : rs));
      }
    } catch {
      // 보던 상세를 그대로 둔다
    }
  }, []);
  //    회수 · 지급 뒤 — 인벤토리 · 상세는 조용히 다시 읽고, 역할 · 내역(원장)은 열 때 다시 읽게 비운다(환불 · 캐시백 회수 줄)
  const afterWrite = useCallback((id: string) => {
    reloadInv(id);
    setRoleState(null);
    setLedger((prev) => (prev && prev.key.startsWith(`${id}:`) ? null : prev));
    refreshDetail(id);
  }, [reloadInv, refreshDetail]);

  // 📌 1회 소모권 1개 사용(인벤토리 탭) — 먼저 끝나는 것 · 먼저 받은 것부터 1개(lib/itemConsume.js).
  //    묶음 수는 그 자리에서 고치고(줄이 튀지 않게), 인벤토리 ×N 은 조용히 다시 읽는다
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
      // 📌 다 쓴 묶음도 ×0 으로 자리를 지킨다(버튼만 잠김) — 유저를 다시 열면 서버 목록 그대로(0 인 것은 없다)
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
      if (r.ok && d?.success) {
        toast(`${s.name} 1개를 사용했습니다 · 남은 수량 ${Number(d.data.left) || 0}개`);
        reloadInv(userId);
      } else toast(d?.message || "처리에 실패했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setSpendBusy("");
    }
  }, [spendBusy, toast, reloadInv]);

  // 📌 아이템 회수 — rows: 서버가 그 물건의 기록을 다시 모아 고른다(expect = 화면이 본 max, 다르면 409) · role: 역할 회수 API
  const [invRevoke, setInvRevoke] = useState<InvCard | null>(null);
  const [invQty, setInvQty] = useState("1");
  const [invBusy, setInvBusy] = useState(false);
  const revokeQty = (rv: Revoke) => (rv.stack ? Math.min(Math.max(1, rv.max), Math.max(1, Math.trunc(Number(invQty)) || 1)) : rv.max);
  const revokeInv = async () => {
    const c = invRevoke;
    const id = selectedId;
    if (!c || !id || invBusy) return;
    const rv = c.revoke;
    if (rv.mode === "locked" || (rv.mode === "rows" && (!rv.key || rv.max < 1)) || (rv.mode === "role" && !rv.roleId)) return;
    setInvBusy(true);
    try {
      const r = rv.mode === "role"
        ? await fetch("/api/admin/users/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id, roleId: rv.roleId }) })
        : await fetch("/api/admin/users/inventory", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: id, key: rv.key, qty: rv.stack ? revokeQty(rv) : undefined, expect: rv.max }),
          });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        toast(d.message || "회수했습니다.");
        setInvRevoke(null);
        // 역할로 가진 칸은 그 자리에서 뺀다(디스코드 반영을 기다리지 않게) — 다시 읽기가 맞춘다
        if (rv.mode === "role") setInv((prev) => (prev?.key === id ? { ...prev, items: prev.items.filter((x) => x.uid !== c.uid) } : prev));
        afterWrite(id);
      } else {
        toast(d?.message || "처리에 실패했습니다.", true);
        // 목록이 바뀌었다 — 창을 닫고 다시 읽는다
        if (r.status === 409) {
          setInvRevoke(null);
          reloadInv(id);
        }
      }
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setInvBusy(false);
    }
  };

  const closeAct = useCallback(() => {
    if (!actBusy) setAct(null);
  }, [actBusy]);
  const hasXp = !!detail?.user;

  // ── 지급 창 — XP · 빙옥 · 쿠폰 · 아이템. 창은 페이지 끝에서 그린다 ──
  const [giveKind, setGiveKind] = useState<GiveKind>("xp");
  // XP · 빙옥
  const [money, setMoney] = useState<MoneyForm>(EMPTY_MONEY);
  const [moneyConfirm, setMoneyConfirm] = useState(false); // 제거 확인 창
  const moneyCur: LedgerCur = giveKind === "point" ? "point" : "xp";
  const moneyAmount = Number(money.amount) || 0; // 숫자만 받는 칸(앞자리 0 없음)
  const moneyTake = money.dir === "take";
  const moneyUnit = cur(moneyCur);
  const moneyHeld = (moneyCur === "point" ? detail?.user?.point : detail?.user?.xp) || 0;
  // 보유 0 인 제거는 서버가 400(회수할 것 없음) — 화면도 같이 잠근다
  const moneyReady = !!selectedId && hasXp && moneyAmount > 0 && (!moneyTake || moneyHeld > 0) && !actBusy;
  const runMoney = async () => {
    const id = selectedId;
    if (!id || !moneyReady) return;
    setActBusy(true);
    try {
      const r = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: id, amount: moneyTake ? -moneyAmount : moneyAmount, reason: money.reason.trim(), currency: moneyCur }),
      });
      const d = await r.json().catch(() => null);
      setMoneyConfirm(false);
      if (r.ok && d?.success) {
        toast(d.message || "처리했습니다.");
        setAct(null);
        // 내역(대기 줄 · 원장) · 요약 · 인벤토리(레벨 보상)
        afterWrite(id);
      } else toast(d?.message || "처리에 실패했습니다.", true); // 400 금액 · 보유 0 · 404 기록 없음 · 409 동명이인(ID 라 나오지 않는다)
    } catch {
      setMoneyConfirm(false);
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  // 쿠폰
  const [couponList, setCouponList] = useState<CouponOpt[] | null>(null); // null = 아직 못 읽음
  const [couponListErr, setCouponListErr] = useState(false);
  const couponReq = useRef(false);
  const [couponId, setCouponId] = useState("");
  const couponPick = couponList?.find((c) => c._id === couponId) || null;
  // 이 유저가 미사용으로 가진 쿠폰 — 서버가 건너뛰는 조건(status unused)과 같게
  const couponHeld = new Set((detail?.coupons || []).filter((c) => c?.status === "unused").map((c) => String(c?.couponId || "")));
  const couponPickHeld = !!couponPick && couponHeld.has(couponPick._id);
  const couponReady = !!selectedId && hasXp && !!couponPick && !couponPickHeld && !actBusy;
  const loadCoupons = () => {
    if (couponList || couponReq.current) return;
    couponReq.current = true;
    setCouponListErr(false);
    fetch("/api/shop/coupons", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success || !Array.isArray(d.data)) throw new Error("coupons");
        const now = Date.now();
        // 📌 보상형은 빼고 — 지갑(api/shop/my-coupons)이 보상형을 보이지 않아 지급해도 못 쓴다(관리 › 상점도 보상형은 지급 단추 없음)
        const list: CouponOpt[] = d.data
          .filter((c: Omit<CouponOpt, "off">) => c.kind !== "reward")
          .map((c: Omit<CouponOpt, "off">) => ({ ...c, _id: String(c._id), code: String(c.code || ""), off: couponOff(c, now) }));
        // 쓸 수 있는 것 먼저(중지 · 만료 · 소진은 뒤로) — 그 안은 서버 순서(최근 등록 먼저) 그대로
        setCouponList([...list.filter((c) => !c.off), ...list.filter((c) => c.off)]);
      })
      .catch(() => {
        couponReq.current = false; // 다음에 고를 때 다시 읽는다
        setCouponListErr(true);
      });
  };
  const runCoupon = async () => {
    const id = selectedId;
    if (!id || !couponReady || !couponPick) return;
    setActBusy(true);
    try {
      const r = await fetch("/api/shop/coupons/issue", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ couponId: couponPick._id, target: id }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        // 화면이 모르는 보유분(최근 50건 밖)이면 서버가 건너뛰고 "0명" — 오류로 알리고 창은 둔다(다시 읽은 상세가 보유 칩을 맞춘다)
        const skipped = /^0명/.test(String(d.message || ""));
        toast(d.message || "지급했습니다.", skipped);
        if (!skipped) setAct(null);
        refreshDetail(id); // 쿠폰 탭
      } else toast(d?.message || "지급에 실패했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  // 아이템
  const [grantForm, setGrantForm] = useState<GrantForm>(EMPTY_GRANT);
  const [grantItems, setGrantItems] = useState<GrantItem[] | null>(null); // null = 아직 못 읽음
  const [grantItemsErr, setGrantItemsErr] = useState(false);
  const grantItemsReq = useRef(false);
  const loadItems = () => {
    if (grantItems || grantItemsReq.current) return;
    grantItemsReq.current = true;
    setGrantItemsErr(false);
    fetch("/api/admin/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.success || !Array.isArray(d.data)) throw new Error("items");
        setGrantItems(d.data.filter((it: GrantItem) => it.type !== "physical"));
      })
      .catch(() => {
        grantItemsReq.current = false; // 다음에 고를 때 다시 읽는다
        setGrantItemsErr(true);
      });
  };
  const grantPick = grantItems?.find((it) => it._id === grantForm.itemId) || null;
  const grantStackable = !!grantPick?.stackable;
  const grantQty = grantStackable ? Math.min(99, Math.max(1, Math.trunc(Number(grantForm.qty)) || 1)) : 1;
  const grantCustom = grantForm.daysMode === "custom";
  const grantDays = grantCustom ? Math.trunc(Number(grantForm.days)) : Number(grantForm.daysMode);
  // 아이템 지급 대상 — 인벤토리를 읽었으면 그 판정(canGrant), 아니면 XP 기록 유무
  const invMine = inv && inv.key === selectedId && !inv.error ? inv : null;
  const canGrantItem = invMine ? invMine.canGrant : hasXp;
  const grantReady = !!selectedId && canGrantItem && !!grantPick && !actBusy && (!grantCustom || (grantForm.days.trim() !== "" && grantDays >= 1 && grantDays <= 3650));
  const submitGrant = async () => {
    const id = selectedId;
    if (!id || !grantReady || !grantPick) return;
    const reason = grantForm.reason.trim();
    if (TOOL_NOTE_RE.test(reason)) return toast("'역할 이전' · '역할 환불' · '역할 정리'로 시작하는 사유는 쓸 수 없습니다.", true);
    setActBusy(true);
    try {
      const r = await fetch("/api/admin/items/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: grantPick._id, target: id, days: grantDays, reason, qty: grantQty }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        toast(d.message || "지급했습니다.");
        setAct(null);
        afterWrite(id);
      } else toast(d?.message || "지급에 실패했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  const pickGive = (k: GiveKind) => {
    setGiveKind(k);
    if (k === "coupon") loadCoupons();
    if (k === "item") loadItems();
  };
  const openGive = () => {
    setMoney(EMPTY_MONEY);
    setMoneyConfirm(false);
    setCouponId("");
    setGrantForm(EMPTY_GRANT);
    pickGive("xp");
    setAct("give");
  };
  const giveReady = giveKind === "coupon" ? couponReady : giveKind === "item" ? grantReady : moneyReady;
  // Enter · Ctrl+S · [지급] — 제거는 확인 창을 한 번 거친다
  const submitGive = () => {
    if (!giveReady) return;
    if (giveKind === "coupon") void runCoupon();
    else if (giveKind === "item") void submitGrant();
    else if (moneyTake) setMoneyConfirm(true);
    else void runMoney();
  };

  // ── 알림 창 ──
  const [msg, setMsg] = useState<MsgForm>(EMPTY_MSG);
  const msgReady = !!selectedId && !!msg.title.trim() && !!msg.content.trim() && !actBusy;
  const openMsg = () => {
    setMsg(EMPTY_MSG);
    setAct("notice");
  };
  const runMsg = async () => {
    const id = selectedId;
    if (!id || !msgReady) return;
    setActBusy(true);
    try {
      const r = await fetch("/api/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: id, type: msg.type, title: msg.title.trim(), content: msg.content.trim() }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        // 알림함 저장은 됐는데 DM 만 실패할 수 있다 — 어디까지 갔는지 알린다
        if (d.dmSent) toast("알림을 발송했습니다.");
        else toast("알림을 저장했습니다 · DM 발송 실패", true);
        setAct(null);
        refreshDetail(id); // 알림·문의·지원 탭
      } else toast(d?.error || d?.message || "발송에 실패했습니다.", true);
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  // ── 제재 창 — 음성 XP 정지 · XP 획득 중단 ──
  //    sanBusy: 도는 단추 — 그 단추 글자만 "처리 중…"으로(폭 고정)
  const voiceOff = !!detail?.user?.voiceXpOff;
  const xpStopNow = normStop(detail?.user?.xpStop);
  const [sanKind, setSanKind] = useState<SanKind>("voice");
  const [sanBusy, setSanBusy] = useState(false);
  // 📌 음성 XP 정지 · 해제 — POST /api/admin/users/voice-stop { userId, off }
  const runVoice = async (off: boolean) => {
    const id = selectedId;
    if (!id || !hasXp || actBusy) return;
    setActBusy(true);
    setSanBusy(true);
    try {
      const r = await fetch("/api/admin/users/voice-stop", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, off }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        toast(d.message || "처리했습니다.");
        setAct(null);
        // 칩 · 단추는 그 자리에서 바꾸고, 상세는 조용히 다시 읽는다
        const now = !!d.data?.off;
        setDetail((prev) => (prev?.user && selectedRef.current === id ? { ...prev, user: { ...prev.user, voiceXpOff: now } } : prev));
        refreshDetail(id);
      } else toast(d?.message || "처리에 실패했습니다.", true); // 404 XP 기록 없음
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
      setSanBusy(false);
    }
  };
  // 📌 XP 획득 중단 — 걸린 기록(지금 · 예약 · 기간 끝남)이 있으면 그 내용과 [해제], 없으면 새로 설정(바꾸려면 해제한 뒤 다시 설정)
  //    stopClock: 창을 연 시각 — "지금" 시작의 종료 미리보기 · 지난 기간 판정에 쓴다(실제 시작은 서버가 받은 때)
  const [stop, setStop] = useState<StopForm>({ start: "now", at: "", days: "", reason: "" });
  const [stopClock, setStopClock] = useState(0);
  const stopDays = Math.trunc(Number(stop.days));
  const stopFrom = stop.start === "now" ? stopClock : fromKstInput(stop.at);
  const stopEnd = stop.days.trim() !== "" && stopDays >= 1 && stopDays <= STOP_MAX_DAYS && Number.isFinite(stopFrom) ? stopFrom + stopDays * 86400000 : NaN;
  const stopReady = !!selectedId && hasXp && !xpStopNow && Number.isFinite(stopEnd) && stopEnd > stopClock && !actBusy;
  const runStop = async (on: boolean) => {
    const id = selectedId;
    if (!id || actBusy || (on && !stopReady)) return;
    setActBusy(true);
    setSanBusy(true);
    try {
      const body = on
        ? { userId: id, on: true, from: stop.start === "now" ? "now" : new Date(fromKstInput(stop.at)).toISOString(), days: stopDays, reason: stop.reason.trim() }
        : { userId: id, on: false };
      const r = await fetch("/api/admin/users/xp-stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        toast(d.message || "처리했습니다.");
        setAct(null);
        // 칩은 그 자리에서 바꾸고, 상세는 조용히 다시 읽는다
        const next = on ? normStop(d.data && typeof d.data === "object" ? d.data : null) : null;
        setDetail((prev) => (prev?.user && selectedRef.current === id ? { ...prev, user: { ...prev.user, xpStop: next } } : prev));
        refreshDetail(id);
      } else toast(d?.message || "처리에 실패했습니다.", true); // 400 시각 · 기간 · 404 XP 기록 없음
    } catch {
      toast("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
      setSanBusy(false);
    }
  };
  const openSanction = () => {
    const now = Date.now();
    setStopClock(now);
    setStop({ start: "now", at: kstInput(now), days: "", reason: "" });
    // 중단 기록만 있으면 그쪽부터(기간이 끝난 것도 — [해제]가 바로 보이게)
    setSanKind(xpStopNow && !voiceOff ? "xpstop" : "voice");
    setAct("sanction");
  };
  // Enter · Ctrl+S — 중단 설정 칸에서만(정지 · 해제는 단추로만)
  const submitSanction = () => {
    if (sanKind === "xpstop" && !xpStopNow) void runStop(true);
  };

  const closeUser = useCallback(() => {
    reqRef.current++;
    selectedRef.current = null;
    setSelectedId(null);
    setDetail(null);
    setDetailErr("");
    putUrl({ userId: null, tab: null });
  }, []);

  if (gate) return gate;

  const pickRow = (r: Row) => {
    openUser(r.userId);
    putUrl({ userId: r.userId });
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
    history: null, // 원장은 쪽 단위라 개수를 달지 않는다
    inv: invMine ? invMine.items.length : null,
    role: roleState && roleState.key === selectedId && !roleState.loading ? roleState.roles.length : null,
    coupon: detail ? detail.coupons.length : null,
    inbox: detail ? detail.notifications.length + detail.inquiries.length + detail.applies.length : null,
  };

  const summary: { l: string; v: string; s?: React.ReactNode }[] = u
    ? [
        { l: "XP", v: num(u.xp) },
        { l: "빙옥", v: num(u.point) },
        { l: "레벨", v: `Lv.${u.level}`, s: <span style={tierText(tier)}>{tier.name}</span> },
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
    if (tab === "history") {
      // 대기·실패 — 아직 지갑에 안 들어간 지급(완료된 지급은 원장에 있다)
      const waiting = detail.payouts.filter((p) => p?.status !== "paid");
      const opts = [
        { v: "xp", l: "XP" },
        { v: "point", l: "빙옥" },
        { v: "purchase", l: "구매" },
        { v: "payout", l: "대기·실패", ...(waiting.length ? { n: waiting.length } : {}) },
      ];
      let body: React.ReactNode;
      if (histKind === "purchase") {
        body = (
          <List items={detail.purchases} empty="구매 없음">
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
                    // 📌 역할 기간제 새 구매는 봇이 역할을 준 시각부터 센다(2026-10-04 #127) — 지급 대기 동안의 만료는 임시라 적지 않는다
                    p.expiresAt && !(p.status === "pending" && p.roleId && !p.renewOf) && `~ ${fmt(p.expiresAt)}`,
                    p.siteOnly && "사이트 보유",
                  ])}
                  right={paid}
                  error={p.error}
                />
              );
            })}
          </List>
        );
      } else if (histKind === "payout") {
        body = (
          <List items={waiting} empty="대기 · 실패 없음">
            {waiting.map((p: any) => {
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
      } else {
        // XP · 빙옥 원장 — 50줄씩, 더 보기로 이어 받는다
        const lg = ledgerCur && ledger && ledger.key === `${selectedId}:${ledgerCur}` ? ledger : null;
        body = !lg || (lg.loading && lg.items.length === 0) ? (
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
                    right={<>{signed(amt)}<Unit>{cur(e?.currency || ledgerCur || "xp")}</Unit></>}
                    rightCls={amt < 0 ? "text-[#d01634]" : ""}
                  />
                );
              })}
            </List>
            {lg.more && (
              <div className="pt-3 flex justify-center">
                <Btn variant="secondary" size="sm" disabled={lg.loading} onClick={() => selectedId && ledgerCur && loadLedger(selectedId, ledgerCur, lg.more)}>더 보기</Btn>
              </div>
            )}
          </>
        );
      }
      return (
        <>
          <Segmented options={opts} value={histKind} onChange={(v) => setHistKind(v as HistKind)} className="mb-3" />
          {body}
        </>
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
    if (tab === "inv") {
      const iv = inv && inv.key === selectedId ? inv : null;
      if (!iv) return <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>;
      // 📌 1회 소모권 — 같은 물건 키(favKey = Stack.thing)의 첫 칸에 [1개 사용]. 칸을 못 찾은 묶음(인벤토리를 못 읽음 등)만 위에 따로
      const stacks = detail.stacks || [];
      const stackAt = new Map<string, Stack>(); // 칸 uid → 묶음
      if (!iv.error) {
        const taken = new Set<string>();
        for (const it of iv.items) {
          const s = it.favKey ? stacks.find((x) => x.thing === it.favKey) : undefined;
          if (s && !taken.has(s.thing)) {
            taken.add(s.thing);
            stackAt.set(it.uid, s);
          }
        }
      }
      const placed = new Set([...stackAt.values()].map((s) => s.thing));
      const loose = stacks.filter((s) => !placed.has(s.thing) && s.count > 0);
      const spendBtn = (s: Stack) => (
        <Btn variant="secondary" size="sm" className="shrink-0 w-[76px]" disabled={!!spendBusy || !selectedId || s.count <= 0}
          onClick={() => selectedId && spendOne(selectedId, s)}>
          <SwapLabel swap={spendBusy === s.thing} to="처리 중…">1개 사용</SwapLabel>
        </Btn>
      );
      return (
        <>
          {!iv.error && !iv.synced && <div className="mb-1"><StatusChip tone="warn">역할 확인 불가</StatusChip></div>}
          {loose.length > 0 && (
            <>
              <SubHead label="소모권" n={loose.length} />
              <ul className="divide-y divide-[#ededed] mb-2">
                {loose.map((s) => (
                  <li key={s.thing} className="py-2.5 flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{s.name}</span>
                    <span className="shrink-0 w-14 text-right text-[14px] font-black tabular-nums">×{num(s.count)}</span>
                    {spendBtn(s)}
                  </li>
                ))}
              </ul>
              {!iv.error && <SubHead label="아이템" n={iv.items.length} />}
            </>
          )}
          {iv.error ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-[#d01634]">{iv.error}</p>
              <Btn variant="secondary" size="sm" className="mt-3" onClick={() => selectedId && reloadInv(selectedId)}>다시 시도</Btn>
            </div>
          ) : (
            <List items={iv.items} empty="아이템 없음" capped={false}>
              {iv.items.map((it) => {
                const rv = it.revoke;
                const locked = rv.mode === "locked" || (rv.mode === "rows" && (!rv.key || rv.max < 1)) || (rv.mode === "role" && !rv.roleId);
                const src = INV_SOURCE[it.source] || "";
                const lockChip = locked && rv.lock && rv.lock !== src ? rv.lock : "";
                const st = stackAt.get(it.uid);
                return (
                  <li key={it.uid} className="py-2.5 flex items-center gap-3 min-w-0">
                    <InvThumb it={it} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="min-w-0 truncate text-[14px] font-bold">{it.name}</span>
                        {src && <StatusChip className="shrink-0">{src}</StatusChip>}
                        {it.status === "pending" && <StatusChip tone="warn" className="shrink-0">대기</StatusChip>}
                        {it.status === "missing" && <StatusChip tone="bad" className="shrink-0">확인 필요</StatusChip>}
                        {lockChip && <StatusChip className="shrink-0">{lockChip}</StatusChip>}
                      </div>
                      <p className="mt-1 text-[12px] text-[#8a8a8a] tabular-nums truncate">
                        {joinMeta([
                          itemTypeLabel(it.type || it.kind),
                          (it.count || 0) > 1 && `×${num(it.count)}`,
                          // 📌 지급 대기인 기간제는 만료가 아직 임시(역할을 준 시각부터 센다 — 2026-10-04 #127) — 날짜 대신 기간만
                          it.expiresAt ? (it.status === "pending" ? ((it.days || 0) > 0 ? `${num(it.days)}일` : "지급 대기") : `~ ${fmt(it.expiresAt)}`) : it.source === "season" ? "다음 시즌까지" : "무기한",
                          it.siteOnly && "사이트 보유",
                        ])}
                      </p>
                    </div>
                    {st && spendBtn(st)}
                    <Btn variant="secondary" size="sm" className="shrink-0 w-[64px]" disabled={locked || invBusy}
                      onClick={() => { setInvQty("1"); setInvRevoke(it); }}>
                      회수
                    </Btn>
                  </li>
                );
              })}
            </List>
          )}
        </>
      );
    }
    // 역할
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
  })();

  const noXpTitle = detail && !hasXp ? "XP 기록 없음" : undefined;

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

      {/* 📌 상세 칸 아래 동작 줄(footer) — 칸이 열릴 때부터 늘 있다(상세를 읽는 동안은 잠금만). 다 읽은 뒤 줄이 생기며 본문 높이가 바뀌지 않게.
             단추 셋(지급 · 알림 · 제재) — 모바일은 폭을 나눠 갖고, PC 는 글자 폭. 잠금은 예전 단추 그대로(XP 기록 없음이면 지급 · 제재) */}
      <DetailPane
        open={!!selectedId}
        onClose={closeUser}
        width={560}
        badge={
          detail && (!u || u.needsRoleSync || u.voiceXpOff || xpStopNow) ? (
            <span className="inline-flex flex-wrap gap-1.5">
              {!u && <StatusChip>XP 기록 없음</StatusChip>}
              {u?.needsRoleSync && <StatusChip tone="warn">역할 맞춤 대기</StatusChip>}
              {u?.voiceXpOff && <StatusChip tone="bad">음성 XP 정지</StatusChip>}
              {xpStopNow && <StatusChip tone={STOP_META[xpStopNow.status].tone}>{STOP_META[xpStopNow.status].chip}</StatusChip>}
            </span>
          ) : undefined
        }
        title={paneTitle}
        sub={<span className="tabular-nums">{paneUsername && `@${paneUsername} · `}{selectedId}</span>}
        footer={selectedId ? (
          <div className={FOOT_ROW}>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!hasXp} title={noXpTitle} onClick={openGive}>지급</Btn>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!detail} onClick={openMsg}>알림</Btn>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!hasXp} title={noXpTitle} onClick={openSanction}>제재</Btn>
          </div>
        ) : undefined}
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

            {/* 하위 탭 다섯 — 이름 · 굵기가 탭을 골라도 같아 칸이 그대로(고른 탭은 흰 알약만).
                📌 폭 실측(굵게 12px): 이름 합 ≈ 내역 24 · 인벤토리 48 · 역할 24 · 쿠폰 24 · 알림·문의·지원 80 = 200, 칸 여백 8 × 5.
                   모바일(sm 미만)은 글자 폭 + 남는 폭 균등(flex-auto) — 320: 272 ≥ 240. sm 이상은 5등분(PC 상세 560: (560 − 1 − 40 − 10 − 8) / 5 ≈ 100 ≥ 80 + 개수 15) */}
            <div className="sticky top-0 z-[1] -mx-5 px-5 pt-5 pb-2 bg-white">
              <div role="tablist" className="flex sm:grid sm:grid-cols-5 p-1 rounded-full bg-[#f2f2f2]">
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
                      className={`min-w-0 flex-auto h-8 px-1 inline-flex items-center justify-center gap-0.5 rounded-full text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`}
                    >
                      {t.l}
                      {t.count === "fixed" && <span className={`hidden sm:inline-block shrink-0 w-[13px] text-left text-[10px] tabular-nums ${on ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}`}>{n ?? ""}</span>}
                      {t.count === "fit" && n != null && <span className={`hidden sm:inline text-[10px] tabular-nums ${on ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}`}>{n}</span>}
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
      <ConfirmDialog
        open={!!invRevoke}
        danger
        title="아이템 회수"
        confirmLabel="회수"
        busy={invBusy}
        onCancel={() => setInvRevoke(null)}
        onConfirm={revokeInv}
        body={invRevoke ? (() => {
          const rv = invRevoke.revoke;
          if (rv.mode === "role") {
            return (
              <>
                <p className="font-bold text-[#131313] break-keep">{invRevoke.name}</p>
                <p className="mt-1">디스코드 역할</p>
              </>
            );
          }
          // 고른 수량만큼 회수 순서(units) 앞에서부터 센다 — 서버도 같은 순서로 고른다
          const picked = rv.units.slice(0, revokeQty(rv));
          const parts = UNIT_SRC.map((g) => ({ l: g.l, n: picked.filter((x) => x.src === g.src).length })).filter((g) => g.n > 0);
          const xp = picked.reduce((s, x) => s + x.xp, 0);
          const point = picked.reduce((s, x) => s + x.point, 0);
          const claw = picked.reduce((s, x) => s + x.clawXp, 0);
          return (
            <>
              <p className="font-bold text-[#131313] break-keep">{invRevoke.name}</p>
              {rv.stack && (
                <Inline className="mt-3">
                  <input type="number" min={1} max={rv.max} value={invQty} disabled={invBusy} aria-label="수량"
                    onChange={(e) => setInvQty(e.target.value === "" ? "" : String(Math.min(Math.max(1, rv.max), Math.max(1, Math.trunc(Number(e.target.value)) || 1))))}
                    onBlur={() => setInvQty(String(revokeQty(rv)))} className={numClass} />
                  <span className="tabular-nums">/ {num(rv.max)}</span>
                </Inline>
              )}
              {parts.length > 0 && <p className="mt-2 tabular-nums">{parts.map((g) => `${g.l} ${num(g.n)}`).join(" · ")}</p>}
              {(xp > 0 || point > 0) && (
                <p className="mt-1 font-bold text-[#131313] tabular-nums">환불 {joinMeta([xp > 0 && `${num(xp)} XP`, point > 0 && `${num(point)} 빙옥`])}</p>
              )}
              {claw > 0 && <p className="mt-1 font-bold text-[#131313] tabular-nums">캐시백 회수 {num(claw)} XP</p>}
              {rv.tool > 0 && <p className="mt-1 text-[#8a8a8a] tabular-nums">역할 이전 {num(rv.tool)}건 제외</p>}
            </>
          );
        })() : null}
      />

      {/* 📌 지급 창 — 알약(XP · 빙옥 · 쿠폰 · 아이템)이 맨 위. 본문 최소 높이를 잡아 알약을 바꿔도 창 높이 · 알약 자리가 그대로.
             드롭다운 목록은 창 안에서 펼쳐진다(포털 없음). 기간 · 수량 칸은 늘 두고 잠그기만 해서 칸이 밀리지 않는다 */}
      <FormSheet
        open={act === "give"}
        onClose={closeAct}
        title="지급"
        sub={paneTitle}
        busy={actBusy}
        onSubmit={submitGive}
        footer={
          <>
            <Btn variant="secondary" onClick={closeAct}>취소</Btn>
            <Btn type="submit" className={MAIN_BTN} disabled={!giveReady}>
              <SwapLabel swap={actBusy} to="처리 중…">{(giveKind === "xp" || giveKind === "point") && moneyTake ? "제거" : "지급"}</SwapLabel>
            </Btn>
          </>
        }
      >
        <div style={{ minHeight: GIVE_MIN_H }}>
          <Segmented options={GIVE_KINDS} value={giveKind} onChange={(v) => pickGive(v as GiveKind)} className="mb-4" />
          {giveKind === "xp" || giveKind === "point" ? (
            <>
              <div className="mb-4 min-w-0">
                <Segmented options={MONEY_DIR} value={money.dir} onChange={(v) => setMoney((f) => ({ ...f, dir: v as MoneyDir }))} />
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>금액</p>
                <Inline>
                  <input type="text" inputMode="numeric" maxLength={9} aria-label="금액" placeholder="0" value={money.amount}
                    onChange={(e) => setMoney((f) => ({ ...f, amount: e.target.value.replace(/\D/g, "").replace(/^0+/, "") }))}
                    className={numClass} />
                  {moneyUnit}
                  <span className="ml-auto tabular-nums text-[#8a8a8a]">보유 {num(moneyHeld)}</span>
                </Inline>
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>사유</p>
                <input type="text" maxLength={100} value={money.reason} placeholder={moneyTake ? "관리자 회수" : "관리자 지급"} aria-label="사유"
                  onChange={(e) => setMoney((f) => ({ ...f, reason: e.target.value }))}
                  className={inputClass} />
              </div>
            </>
          ) : giveKind === "coupon" ? (
            <>
              <div className="mb-4 min-w-0">
                {/* 이름 줄 오른쪽 칩(보유 중 · 중지 · 만료 · 소진)은 칩 높이를 늘 잡아 골라도 아래 칸이 밀리지 않는다 */}
                <div className="flex items-center gap-1.5 min-h-6 mb-1.5">
                  <span className="text-[13px] font-bold">쿠폰</span>
                  {couponPick && (couponPickHeld || couponPick.off) && (
                    <StatusChip tone={couponPickHeld ? "warn" : "neutral"} className="ml-auto shrink-0">{couponPickHeld ? "보유 중" : couponPick.off}</StatusChip>
                  )}
                </div>
                <Dropdown
                  theme="light"
                  buttonClassName={DD}
                  maxHeight={180}
                  value={couponId}
                  onChange={setCouponId}
                  placeholder={couponList ? (couponList.length ? "쿠폰 선택" : "등록된 쿠폰 없음") : couponListErr ? "불러오지 못했습니다" : "불러오는 중…"}
                  options={(couponList || []).map((c) => ({
                    value: c._id,
                    label: c.name ? `${c.code} · ${c.name}` : c.code,
                    hint: couponHeld.has(c._id) ? "보유 중" : c.off || couponShort(c),
                  }))}
                />
              </div>
              <dl className="mb-3">
                <DefRow k="혜택">{couponPick ? couponBenefit(couponPick) : "—"}</DefRow>
                <DefRow k="만료"><span className="tabular-nums">{couponPick ? (couponPick.expiresAt ? `~ ${fmt(couponPick.expiresAt)}` : "무기한") : "—"}</span></DefRow>
              </dl>
            </>
          ) : (
            <>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>아이템</p>
                <Dropdown
                  theme="light"
                  buttonClassName={DD}
                  maxHeight={220}
                  value={grantForm.itemId}
                  onChange={(v) => setGrantForm((f) => ({ ...f, itemId: v, qty: "1" }))}
                  placeholder={grantItems ? (grantItems.length ? "아이템 선택" : "등록된 아이템 없음") : grantItemsErr ? "불러오지 못했습니다" : "불러오는 중…"}
                  options={(grantItems || []).map((it) => ({
                    value: it._id, label: it.shortName || it.name, hint: it.categoryLabel || itemTypeLabel(it.type),
                    icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
                  }))}
                />
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>기간</p>
                <Segmented options={GRANT_DAYS} value={grantForm.daysMode} onChange={(v) => setGrantForm((f) => ({ ...f, daysMode: v }))} />
                <Inline className="mt-2">
                  <input type="number" min={1} max={3650} aria-label="일수" placeholder="일수" disabled={!grantCustom}
                    value={grantCustom ? grantForm.days : grantForm.daysMode === "0" ? "" : grantForm.daysMode}
                    onChange={(e) => setGrantForm((f) => ({ ...f, days: e.target.value === "" ? "" : String(Math.min(3650, Math.max(1, Math.trunc(Number(e.target.value)) || 1))) }))}
                    className={numClass} />
                  일
                </Inline>
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>수량</p>
                <Inline>
                  <input type="number" min={1} max={99} aria-label="수량" disabled={!grantStackable}
                    value={grantStackable ? grantForm.qty : "1"}
                    onChange={(e) => setGrantForm((f) => ({ ...f, qty: e.target.value === "" ? "" : String(Math.min(99, Math.max(1, Math.trunc(Number(e.target.value)) || 1))) }))}
                    onBlur={() => setGrantForm((f) => ({ ...f, qty: String(grantQty) }))}
                    className={numClass} />
                  개
                </Inline>
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>사유</p>
                <input type="text" maxLength={100} value={grantForm.reason} placeholder="관리자 지급" aria-label="사유"
                  onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))}
                  className={inputClass} />
              </div>
            </>
          )}
        </div>
      </FormSheet>
      <ConfirmDialog
        open={moneyConfirm}
        danger
        title={`${moneyUnit} 제거`}
        confirmLabel="제거"
        busy={actBusy}
        onCancel={() => setMoneyConfirm(false)}
        onConfirm={runMoney}
        body={moneyConfirm ? (
          <>
            <p className="font-bold text-[#131313] break-keep">{paneTitle}</p>
            <p className="mt-1 tabular-nums">−{num(moneyAmount)} {moneyUnit} · 보유 {num(moneyHeld)}</p>
          </>
        ) : null}
      />

      {/* 📌 제재 창 — 알약(음성 XP 정지 · XP 획득 중단). 창 아래 단추가 곧 실행(정지 · 해제 · 설정).
             XP 획득 중단은 걸린 기록(지금 · 예약 · 기간 끝남 · 해제 안 함)이 있으면 그 내용과 [해제], 없으면 새로 설정(시작 · 기간 · 사유 · 종료 미리보기).
             지정 시각 칸은 늘 두고 잠그기만 해서 칸이 밀리지 않는다. 시각은 KST */}
      <FormSheet
        open={act === "sanction"}
        onClose={closeAct}
        title="제재"
        sub={paneTitle}
        busy={actBusy}
        onSubmit={submitSanction}
        footer={
          <>
            <Btn variant="secondary" onClick={closeAct}>{sanKind === "xpstop" && !xpStopNow ? "취소" : "닫기"}</Btn>
            {sanKind === "voice" ? (
              <Btn variant={voiceOff ? "primary" : "danger"} className={MAIN_BTN} disabled={!hasXp} onClick={() => runVoice(!voiceOff)}>
                <SwapLabel swap={sanBusy} to="처리 중…">{voiceOff ? "해제" : "정지"}</SwapLabel>
              </Btn>
            ) : xpStopNow ? (
              <Btn className={MAIN_BTN} disabled={!hasXp} onClick={() => runStop(false)}>
                <SwapLabel swap={sanBusy} to="처리 중…">해제</SwapLabel>
              </Btn>
            ) : (
              <Btn type="submit" variant="danger" className={MAIN_BTN} disabled={!stopReady}>
                <SwapLabel swap={sanBusy} to="처리 중…">설정</SwapLabel>
              </Btn>
            )}
          </>
        }
      >
        <div style={{ minHeight: SAN_MIN_H }}>
          <Segmented options={SAN_KINDS} value={sanKind} onChange={(v) => setSanKind(v === "xpstop" ? "xpstop" : "voice")} className="mb-4" />
          {sanKind === "voice" ? (
            <dl className="mb-3">
              <DefRow k="상태"><StatusChip tone={voiceOff ? "bad" : "neutral"}>{voiceOff ? "정지 중" : "정상"}</StatusChip></DefRow>
              {voiceOff && u?.voiceXpOffAt && <DefRow k="정지"><span className="tabular-nums">{fmt(u.voiceXpOffAt)}</span></DefRow>}
              {voiceOff && u?.voiceXpOffBy && <DefRow k="설정">{u.voiceXpOffBy}</DefRow>}
            </dl>
          ) : xpStopNow ? (
            <dl className="mb-3">
              <DefRow k="상태"><StatusChip tone={STOP_META[xpStopNow.status].tone}>{STOP_META[xpStopNow.status].state}</StatusChip></DefRow>
              <DefRow k="시작"><span className="tabular-nums">{xpStopNow.from ? fmt(xpStopNow.from) : "—"}</span></DefRow>
              <DefRow k="종료"><span className="tabular-nums">{xpStopNow.until ? fmt(xpStopNow.until) : "—"}</span></DefRow>
              {xpStopNow.by && <DefRow k="설정">{xpStopNow.by}</DefRow>}
              {xpStopNow.reason && <DefRow k="사유">{xpStopNow.reason}</DefRow>}
            </dl>
          ) : (
            <>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>시작</p>
                <Segmented options={STOP_START} value={stop.start} onChange={(v) => setStop((f) => ({ ...f, start: v === "at" ? "at" : "now" }))} />
                <input type="datetime-local" aria-label="시작 시각" disabled={stop.start !== "at"}
                  value={stop.at}
                  onChange={(e) => setStop((f) => ({ ...f, at: e.target.value }))}
                  className={`${inputClass} mt-2 tabular-nums sm:!w-60`} />
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>기간</p>
                <Inline>
                  <input type="number" min={1} max={STOP_MAX_DAYS} aria-label="일수" placeholder="일수" value={stop.days}
                    onChange={(e) => setStop((f) => ({ ...f, days: e.target.value === "" ? "" : String(Math.min(STOP_MAX_DAYS, Math.max(1, Math.trunc(Number(e.target.value)) || 1))) }))}
                    className={numClass} />
                  일
                </Inline>
              </div>
              <div className="mb-4 min-w-0">
                <p className={labelClass}>사유</p>
                <input type="text" maxLength={100} value={stop.reason} aria-label="사유"
                  onChange={(e) => setStop((f) => ({ ...f, reason: e.target.value }))}
                  className={inputClass} />
              </div>
              <dl className="mb-3">
                <DefRow k="종료"><span className="tabular-nums">{Number.isFinite(stopEnd) ? fmt(stopEnd) : "—"}</span></DefRow>
              </dl>
            </>
          )}
        </div>
      </FormSheet>

      {/* 📌 알림 창 — 관리 › 알림 발송과 같은 칸(종류 · 제목 · 내용). 수신자는 이 유저 ID, DM 핑은 서버가 늘 보낸다 */}
      <FormSheet
        open={act === "notice"}
        onClose={closeAct}
        title="알림 발송"
        sub={paneTitle}
        busy={actBusy}
        footer={
          <>
            <Btn variant="secondary" onClick={closeAct}>취소</Btn>
            <Btn className={MAIN_BTN} onClick={runMsg} disabled={!msgReady}>
              <SwapLabel swap={actBusy} to="발송 중…">발송</SwapLabel>
            </Btn>
          </>
        }
      >
        <div className="mb-4 min-w-0">
          <p className={labelClass}>종류</p>
          <Segmented options={NOTI_TYPES} value={msg.type} onChange={(v) => setMsg((f) => ({ ...f, type: v }))} />
        </div>
        <div className="mb-4 min-w-0">
          <p className={labelClass}>제목</p>
          <input type="text" maxLength={100} value={msg.title} aria-label="제목"
            onChange={(e) => setMsg((f) => ({ ...f, title: e.target.value }))}
            className={inputClass} />
        </div>
        <div className="mb-4 min-w-0">
          <p className={labelClass}>내용</p>
          <textarea rows={6} value={msg.content} aria-label="내용"
            onChange={(e) => setMsg((f) => ({ ...f, content: e.target.value }))}
            className={`${inputClass} block resize-none leading-relaxed`} />
        </div>
      </FormSheet>
      {toastEl}
    </AdminPage>
  );
}
