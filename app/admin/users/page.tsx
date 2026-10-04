"use client";

// 📌 유저 조회 — 이름 · 디스코드 ID 로 찾아 한 유저의 지갑 · 구매 · 지급 · 쿠폰 · 알림 · 문의 · XP 내역 · 인벤토리 · 역할을 한 자리에서 본다.
//    목록 화면 틀: 머리 → 검색 한 줄 → 결과 표 → 줄을 누르면 오른쪽 상세 칸(모바일은 아래에서 올라오는 판).
//    쓰기 — 구매 탭 1회 소모권 "1개 사용"(app/api/admin/users/consume) · 역할 탭 역할 회수(app/api/admin/users/roles) ·
//    인벤토리 탭 아이템 회수(app/api/admin/users/inventory — 지급 · 패스는 그냥 회수, 구매는 낸 값 환불) · 아이템 지급(app/api/admin/items/grant) ·
//    상세 칸 아래 줄 — XP · 빙옥 지급/제거(app/api/xp/grant) · 쿠폰 지급(app/api/shop/coupons/issue) · 알림 발송(app/api/notifications) ·
//    음성 XP 정지/해제(app/api/admin/users/voice-stop).
//    전부 기존 API 를 target / recipient = 이 유저 ID 로 부른다(다른 화면에서 ID 를 다시 넣지 않게).
//    주소에 ?q= · ?userId= 를 실어 새로고침해도 같은 화면이 다시 열린다.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AdminPage, SearchInput, Segmented, Btn, SwapLabel, DataTable, DetailPane, DefRow, StatusChip, EmptyRow, ConfirmDialog, Inline, inputClass, numClass, labelClass, useAdminGuard, useNotice, type Column } from "../ui";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import TierEmblem from "../../components/TierEmblem";
import { invIconType, invTierOf } from "../../components/Inventory";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
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
  voiceXpOff?: boolean; voiceXpOffAt?: string | null; // 음성 XP 정지(app/api/admin/users/voice-stop)
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
type TabId = "purchase" | "payout" | "coupon" | "inbox" | "xp" | "inv" | "role";
type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "ink";

const LIST_LIMIT = 50; // API 가 목록마다 최근 50건까지 준다
// 📌 count — 탭 개수 자리(넓은 화면에서만)
//    fixed: 2자리 폭을 늘 잡는다 — 늦게 읽는 탭(인벤토리 · 역할)은 개수가 떠도, 50건 상한 탭은 자릿수가 바뀌어도 이름이 밀리지 않는다
//    fit: 숫자만큼 — 알림·문의(최대 150, 3자리 자리를 잡으면 칸에 꽉 차 이름이 한쪽으로 쏠린다). 상세와 함께 처음부터 있다
//    none: 개수 없음(XP 내역 — 원장은 쪽 단위)
const TABS: { id: TabId; l: string; count: "fixed" | "fit" | "none" }[] = [
  { id: "purchase", l: "구매", count: "fixed" },
  { id: "payout", l: "지급", count: "fixed" },
  { id: "coupon", l: "쿠폰", count: "fixed" },
  { id: "inbox", l: "알림·문의", count: "fit" },
  { id: "xp", l: "XP 내역", count: "none" },
  { id: "inv", l: "인벤토리", count: "fixed" },
  { id: "role", l: "역할", count: "fixed" },
];
// 📌 역할 탭 — 디스코드에서 지금 가진 역할(app/api/admin/users/roles). 레벨 보상 · 디스코드 관리 역할은 뗄 수 없다
type HeldRole = { id: string; name: string; color: string; managed: boolean; rewardLevel: number | null; item: string };
type RoleState = { key: string; loading: boolean; present: boolean; roles: HeldRole[]; error: string };

// 📌 인벤토리 탭 — 유저 화면 인벤토리와 같은 판정(app/api/admin/users/inventory)에 회수 방법(revoke)이 붙는다.
//    rows: 그 물건의 기록을 서버가 다시 모아 회수(key 를 그대로 돌려준다) · role: 구매 기록 없이 역할로 가진 것 → 역할 회수 API · locked: 손대지 않는다(lock 라벨)
//    units: 회수 순서대로 한 건씩 — 지급 · 패스(낸 값 없음) 먼저, 그다음 구매(xp · point = 돌려줄 값, clawXp = 돌려줄 XP 로 다 못 뺀 캐시백 — 지갑에서 빠짐)
type RevokeUnit = { src: "grant" | "pass" | "shop"; xp: number; point: number; clawXp: number };
type Revoke = { mode: "rows" | "role" | "locked"; key: string; roleId: string; lock: string; stack: boolean; max: number; tool: number; units: RevokeUnit[] };
type InvSource = "shop" | "grant" | "pass" | "item" | "level";
type InvCard = {
  uid: string; kind: string; type: string; name: string; description?: string;
  icon?: string; imageUrl?: string; color?: string;
  status: "pending" | "completed" | "missing";
  days?: number; expiresAt?: string | null; acquiredAt?: string | null; siteOnly?: boolean;
  source: InvSource; rewardLevel?: number | null; exclusive?: boolean;
  count?: number; pendingCount?: number; effectLines?: string[]; skinKey?: string; badgeId?: string;
  revoke: Revoke;
};
type InvState = { key: string; synced: boolean; canGrant: boolean; items: InvCard[]; error: string };
const INV_SOURCE: Record<InvSource, string> = { shop: "구매", grant: "지급", pass: "패스", item: "역할", level: "레벨 보상" };
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
      {tier ? <TierEmblem tier={tier} size={25} />
        : it.imageUrl ? <ItemIcon imageUrl={it.imageUrl} size={40} style={{ borderRadius: 0 }} />
        : <ItemIcon icon={it.icon} type={invIconType(it)} size={22} color={it.color || undefined} />}
    </span>
  );
}

// 📌 아이템 지급 창 — 아이템 목록은 창을 처음 열 때 한 번(GET /api/admin/items, 기프트카드 제외)
type GrantItem = { _id: string; name: string; type: string; icon?: string; imageUrl?: string; color?: string; stackable?: boolean };
type GrantForm = { itemId: string; daysMode: string; days: string; qty: string; reason: string };
const EMPTY_GRANT: GrantForm = { itemId: "", daysMode: "0", days: "", qty: "1", reason: "" };
const GRANT_DAYS = [{ v: "0", l: "무기한" }, { v: "7", l: "7일" }, { v: "30", l: "30일" }, { v: "custom", l: "직접" }];
const TOOL_NOTE_RE = /^역할 (이전|환불|정리)/; // 역할 이전 도구 기록으로 읽히는 사유(lib/roleMigrationTerms.js — 정리 기록 포함)
// 공용 Dropdown(라이트)을 입력칸(inputClass)과 같은 높이 · 테두리로 (app/admin/bot 과 같은 값)
const DD = "!px-3 !py-2 min-h-10 !text-[14px] !border-[#a3a3a3]";

// 📌 로컬 창 한 벌 — 아이템 지급 · XP · 빙옥 · 쿠폰 · 알림. 상세 칸 바깥(확인 · 알림 창과 형제)에 그린다.
//    모바일은 아래에서 올라오는 판(88dvh), PC 는 가운데 창. 처리 중(busy)에는 바깥 클릭 · Esc · 닫기가 막힌다.
//    Esc 는 창만 닫는다 — 드롭다운이 먼저 받았거나(preventDefault) 위에 확인 · 알림 창이 떠 있으면 그 차례.
//    bodyStyle: 드롭다운 하나뿐인 창은 목록(아래로 펼쳐짐 · 포털 없음)이 창 안에 다 들어가게 높이를 잡는다
function Sheet({ label, sub, busy, onClose, actions, bodyStyle, children }: {
  label: string; sub?: React.ReactNode; busy: boolean; onClose: () => void;
  actions: React.ReactNode; bodyStyle?: React.CSSProperties; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || busy || document.querySelector('[role="alertdialog"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  // 📌 누르기 · 떼기가 둘 다 바깥일 때만 닫는다 — 창 안에서 글을 끌어 선택하다 바깥에서 떼면 click 이 바깥에 와 쓰던 글이 날아간다
  const downOut = useRef(false);
  return (
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in"
      onPointerDown={(e) => { downOut.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        const out = downOut.current && e.target === e.currentTarget;
        downOut.current = false;
        if (out && !busy) onClose();
      }}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
        className="w-full min-w-0 sm:max-w-lg max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-black tracking-tight">{label}</h2>
            {sub && <p className="mt-0.5 text-[12px] text-[#8a8a8a] truncate">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 pt-4 pb-1 min-w-0" style={bodyStyle}>{children}</div>
        <div className="border-t border-[#ededed] px-5 py-3.5 flex items-center justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

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

// 📌 XP · 빙옥 지급/제거 — POST /api/xp/grant { target: 유저 ID, amount(제거는 음수), reason, currency: "xp" | "point" }.
//    XP 는 봇 큐가 30초 안에 반영 · 빙옥은 바로. 제거는 서버가 보유량까지만 자른다. XP 기록(UserXp)이 없는 유저는 서버가 404
type MoneyDir = "give" | "take";
type MoneyForm = { cur: LedgerCur; dir: MoneyDir; amount: string; reason: string };
const EMPTY_MONEY: MoneyForm = { cur: "xp", dir: "give", amount: "", reason: "" };
const MONEY_DIR = [{ v: "give", l: "지급" }, { v: "take", l: "제거" }];

// 📌 쿠폰 지급 — 목록은 창을 처음 열 때 한 번(GET /api/shop/coupons), 지급은 POST /api/shop/coupons/issue { couponId, target: 유저 ID }.
//    서버는 같은 쿠폰을 미사용으로 가진 유저를 건너뛴다(성공 + "0명에게 …") — 화면도 보유 중이면 잠근다. XP 기록이 없는 유저는 서버가 404
//    off: 목록을 받은 때 기준 중지 · 만료 · 소진(관리 › 상점 쿠폰 상태와 같은 규칙). 쓸 수 있으면 ""
//    📌 할인형만 — 보상형(코드 입력으로 받는 쿠폰)은 목록에서 뺀다(openCoupon)
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

// 📌 알림 발송 — POST /api/notifications { recipient: 유저 ID, type, title, content } (관리 › 회원 통지 발송과 같은 칸).
//    DM 핑은 서버가 늘 보낸다(응답 dmSent). 서버 오류 글은 message 가 아니라 error 에 온다
type MsgForm = { type: string; title: string; content: string };
const EMPTY_MSG: MsgForm = { type: "안내", title: "", content: "" };
const NOTI_TYPES = Object.keys(NOTI_TONE).map((t) => ({ v: t, l: t }));
type ActKind = "money" | "coupon" | "notice";
// 상세 칸 아래 줄 단추 — 모바일은 폭을 나눠 갖고(여백 8px) · PC 는 글자 폭
const FOOT_BTN = "flex-1 sm:flex-none max-sm:!px-2";

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
  // 인벤토리 — 역할 탭과 같은 틀(key 가 이 유저 것이 아니면 불러오는 중). 상태는 다른 탭의 쓰기(역할 회수 · 1개 사용)도 비운다
  const [inv, setInv] = useState<InvState | null>(null);
  const invLoadingRef = useRef(""); // 지금 읽는 중인 유저 — 탭을 오가도 같은 요청을 겹쳐 보내지 않게
  // 역할 — 탭을 열 때 · 유저를 바꿀 때 디스코드에 새로 묻는다. 다른 유저로 바뀐 뒤 늦게 온 응답은 key 로 버린다
  const [roleState, setRoleState] = useState<RoleState | null>(null);

  const openUser = useCallback(async (id: string) => {
    const my = ++reqRef.current;
    selectedRef.current = id;
    setSelectedId(id);
    setDetail(null);
    setDetailErr("");
    // 같은 유저를 다시 열어도 새로 — 늦게 읽는 탭(인벤토리 · 역할 · XP 내역)도 열 때 다시 읽게 비운다
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
        notify(d.message || "회수했습니다.");
        // 그 자리에서 뺀다(디스코드 반영을 기다리지 않게)
        setRoleState((prev) => (prev?.key === selectedId ? { ...prev, roles: prev.roles.filter((x) => x.id !== roleRevoke.id) } : prev));
        // 역할로 가진 인벤토리 칸이 바뀌었을 수 있다 — 인벤토리 탭을 열 때 다시 읽게
        setInv((prev) => (prev?.key === selectedId ? null : prev));
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
      if (r.ok && d?.success) {
        notify(`${s.name} 1개를 사용했습니다.\n남은 수량 ${Number(d.data.left) || 0}개`);
        // 인벤토리 ×N 이 줄었다 — 인벤토리 탭을 열 때 다시 읽게
        setInv((prev) => (prev?.key === userId ? null : prev));
      } else notify(d?.message || "처리에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setSpendBusy("");
    }
  }, [spendBusy, notify]);

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
  //    상세(구매 · 지급 탭)도 조용히 — setDetail(null) 없이. 그사이 다른 유저를 열었으면(reqRef) 버린다
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
  //    회수 · 지급 뒤 — 인벤토리 · 상세는 조용히 다시 읽고, 역할 · XP 내역 탭은 열 때 다시 읽게 비운다(환불 · 캐시백 회수 줄)
  const afterWrite = useCallback((id: string) => {
    reloadInv(id);
    setRoleState(null);
    setLedger((prev) => (prev && prev.key.startsWith(`${id}:`) ? null : prev));
    refreshDetail(id);
  }, [reloadInv, refreshDetail]);

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
        notify(d.message || "회수했습니다.");
        setInvRevoke(null);
        // 역할로 가진 칸은 그 자리에서 뺀다(디스코드 반영을 기다리지 않게) — 다시 읽기가 맞춘다
        if (rv.mode === "role") setInv((prev) => (prev?.key === id ? { ...prev, items: prev.items.filter((x) => x.uid !== c.uid) } : prev));
        afterWrite(id);
      } else {
        notify(d?.message || "처리에 실패했습니다.", true);
        // 목록이 바뀌었다 — 창을 닫고 다시 읽는다
        if (r.status === 409) {
          setInvRevoke(null);
          reloadInv(id);
        }
      }
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setInvBusy(false);
    }
  };

  // 📌 아이템 지급 — 기존 지급 API 를 그대로(target = 이 유저 id). 창은 페이지 끝에서 그린다
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm, setGrantForm] = useState<GrantForm>(EMPTY_GRANT);
  const [grantItems, setGrantItems] = useState<GrantItem[] | null>(null); // null = 아직 못 읽음
  const [grantItemsErr, setGrantItemsErr] = useState(false);
  const grantItemsReq = useRef(false);
  const [granting, setGranting] = useState(false);
  const openGrant = () => {
    setGrantForm(EMPTY_GRANT);
    setGrantOpen(true);
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
        grantItemsReq.current = false; // 다음에 열 때 다시 읽는다
        setGrantItemsErr(true);
      });
  };
  // Esc · 바깥 클릭 · 처리 중 잠금은 창(Sheet)이 한다
  const closeGrant = useCallback(() => {
    if (!granting) setGrantOpen(false);
  }, [granting]);
  const grantPick = grantItems?.find((it) => it._id === grantForm.itemId) || null;
  const grantStackable = !!grantPick?.stackable;
  const grantQty = grantStackable ? Math.min(99, Math.max(1, Math.trunc(Number(grantForm.qty)) || 1)) : 1;
  const grantCustom = grantForm.daysMode === "custom";
  const grantDays = grantCustom ? Math.trunc(Number(grantForm.days)) : Number(grantForm.daysMode);
  const grantReady = !!selectedId && !!grantPick && !granting && (!grantCustom || (grantForm.days.trim() !== "" && grantDays >= 1 && grantDays <= 3650));
  const submitGrant = async () => {
    const id = selectedId;
    if (!id || !grantReady || !grantPick) return;
    const reason = grantForm.reason.trim();
    if (TOOL_NOTE_RE.test(reason)) return notify("'역할 이전' · '역할 환불' · '역할 정리'로 시작하는 사유는 쓸 수 없습니다.", true);
    setGranting(true);
    try {
      const r = await fetch("/api/admin/items/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: grantPick._id, target: id, days: grantDays, reason, qty: grantQty }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.success) {
        notify(d.message || "지급했습니다.");
        setGrantOpen(false);
        afterWrite(id);
      } else notify(d?.message || "지급에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setGranting(false);
    }
  };

  // ── 상세 칸 아래 줄 — XP · 빙옥 · 쿠폰 · 알림. 창은 한 번에 하나(act), 처리 중 잠금(actBusy)은 셋이 같이 쓴다 ──
  //    XP · 쿠폰은 XP 기록(detail.user)이 있어야 서버가 대상을 찾는다 — 없으면 단추를 잠근다. 알림은 디스코드 ID 로 찾아 기록이 없어도 된다
  const [act, setAct] = useState<ActKind | null>(null);
  const [actBusy, setActBusy] = useState(false);
  const closeAct = useCallback(() => {
    if (!actBusy) setAct(null);
  }, [actBusy]);
  const hasXp = !!detail?.user;

  // XP · 빙옥
  const [money, setMoney] = useState<MoneyForm>(EMPTY_MONEY);
  const [moneyConfirm, setMoneyConfirm] = useState(false); // 제거 확인 창
  const moneyAmount = Number(money.amount) || 0; // 숫자만 받는 칸(앞자리 0 없음)
  const moneyTake = money.dir === "take";
  const moneyUnit = cur(money.cur);
  const moneyHeld = (money.cur === "point" ? detail?.user?.point : detail?.user?.xp) || 0;
  // 보유 0 인 제거는 서버가 400(회수할 것 없음) — 화면도 같이 잠근다
  const moneyReady = !!selectedId && hasXp && moneyAmount > 0 && (!moneyTake || moneyHeld > 0) && !actBusy;
  const openMoney = () => {
    setMoney(EMPTY_MONEY);
    setMoneyConfirm(false);
    setAct("money");
  };
  const runMoney = async () => {
    const id = selectedId;
    if (!id || !moneyReady) return;
    setActBusy(true);
    try {
      const r = await fetch("/api/xp/grant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: id, amount: moneyTake ? -moneyAmount : moneyAmount, reason: money.reason.trim(), currency: money.cur }),
      });
      const d = await r.json().catch(() => null);
      setMoneyConfirm(false);
      if (r.ok && d?.success) {
        notify(d.message || "처리했습니다.");
        setAct(null);
        // 지급 탭(대기 줄) · 요약 · XP 내역 · 인벤토리(레벨 보상)
        afterWrite(id);
      } else notify(d?.message || "처리에 실패했습니다.", true); // 400 금액 · 보유 0 · 404 기록 없음 · 409 동명이인(ID 라 나오지 않는다)
    } catch {
      setMoneyConfirm(false);
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };
  // 제거는 확인 창을 한 번 거친다
  const submitMoney = () => {
    if (!moneyReady) return;
    if (moneyTake) setMoneyConfirm(true);
    else runMoney();
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
  const openCoupon = () => {
    setCouponId("");
    setAct("coupon");
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
        couponReq.current = false; // 다음에 열 때 다시 읽는다
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
        notify(d.message || "지급했습니다.", skipped);
        if (!skipped) setAct(null);
        refreshDetail(id); // 쿠폰 탭
      } else notify(d?.message || "지급에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  // 알림
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
        notify(d.dmSent ? "통지를 발송했습니다." : "통지를 저장했습니다.\nDM 발송 실패");
        setAct(null);
        refreshDetail(id); // 알림·문의 탭
      } else notify(d?.error || d?.message || "발송에 실패했습니다.", true);
    } catch {
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

  // 📌 음성 XP 정지 · 해제 — POST /api/admin/users/voice-stop { userId, off }. 확인 창을 한 번 거친다(정지는 danger).
  //    voiceTarget: 확인 창이 열릴 때 정한 바꿀 값(null = 닫힘) — 그사이 상세를 다시 읽어도 창 제목 · 보낼 값이 뒤집히지 않게
  const voiceOff = !!detail?.user?.voiceXpOff;
  const [voiceTarget, setVoiceTarget] = useState<boolean | null>(null);
  const runVoice = async () => {
    const id = selectedId;
    const off = voiceTarget;
    if (!id || off === null || !hasXp || actBusy) return;
    setActBusy(true);
    try {
      const r = await fetch("/api/admin/users/voice-stop", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, off }),
      });
      const d = await r.json().catch(() => null);
      setVoiceTarget(null);
      if (r.ok && d?.success) {
        notify(d.message || "처리했습니다.");
        // 칩 · 단추는 그 자리에서 바꾸고, 상세는 조용히 다시 읽는다
        const now = !!d.data?.off;
        setDetail((prev) => (prev?.user && selectedRef.current === id ? { ...prev, user: { ...prev.user, voiceXpOff: now } } : prev));
        refreshDetail(id);
      } else notify(d?.message || "처리에 실패했습니다.", true); // 404 XP 기록 없음
    } catch {
      setVoiceTarget(null);
      notify("서버와 통신 중 오류가 발생했습니다.", true);
    } finally {
      setActBusy(false);
    }
  };

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
    inv: inv && inv.key === selectedId && !inv.error ? inv.items.length : null,
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
    if (tab === "inv") {
      const iv = inv && inv.key === selectedId ? inv : null;
      // 다 읽기 전에는 XP 기록 유무(상세)로 — 지급 버튼이 늦게 켜지며 깜빡이지 않게
      const canGrant = iv && !iv.error ? iv.canGrant : !!u;
      return (
        <>
          <div className="flex items-center gap-2 min-h-8 mb-1">
            {iv && !iv.error && !iv.synced && <StatusChip tone="warn" className="shrink-0">역할 확인 불가</StatusChip>}
            <Btn size="sm" className="ml-auto shrink-0" disabled={!canGrant || !selectedId} title={canGrant ? undefined : "XP 기록 없음"} onClick={openGrant}>지급</Btn>
          </div>
          {!iv ? (
            <p className="py-10 text-center text-[13px] text-[#8a8a8a]">불러오는 중…</p>
          ) : iv.error ? (
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
                          it.expiresAt ? `~ ${fmt(it.expiresAt)}` : "무기한",
                          it.siteOnly && "사이트 보유",
                        ])}
                      </p>
                    </div>
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

      {/* 📌 상세 칸 아래 동작 줄(footer) — 칸이 열릴 때부터 늘 있다(상세를 읽는 동안은 잠금만). 다 읽은 뒤 줄이 생기며 본문 높이가 바뀌지 않게.
             모바일은 네 단추가 폭을 나눠 갖고, PC 는 글자 폭. 탭 줄과는 따로라 탭 칸 폭에 영향이 없다
             📌 모바일 단추 여백 8px — 글자 폭(13px 굵게) 53 · 26 · 26 · 55 + 여백 16 × 4 + 틈 8 × 3 = 248 ≤ 320 − 40 이라 한 줄(375 · 360 · 320).
                [음성 정지] ↔ [정지 해제]는 SwapLabel 로 두 글자 중 긴 쪽 폭을 늘 잡는다 */}
      <DetailPane
        open={!!selectedId}
        onClose={closeUser}
        width={560}
        badge={
          detail && (!u || u.needsRoleSync || u.voiceXpOff) ? (
            <span className="inline-flex gap-1.5">
              {!u && <StatusChip>XP 기록 없음</StatusChip>}
              {u?.needsRoleSync && <StatusChip tone="warn">역할 맞춤 대기</StatusChip>}
              {u?.voiceXpOff && <StatusChip tone="bad">음성 XP 정지</StatusChip>}
            </span>
          ) : undefined
        }
        title={paneTitle}
        sub={<span className="tabular-nums">{paneUsername && `@${paneUsername} · `}{selectedId}</span>}
        footer={selectedId ? (
          <>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!hasXp} title={detail && !hasXp ? "XP 기록 없음" : undefined} onClick={openMoney}>XP · 빙옥</Btn>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!hasXp} title={detail && !hasXp ? "XP 기록 없음" : undefined} onClick={openCoupon}>쿠폰</Btn>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!detail} onClick={openMsg}>알림</Btn>
            <Btn variant="secondary" className={FOOT_BTN} disabled={!hasXp} title={detail && !hasXp ? "XP 기록 없음" : undefined} onClick={() => setVoiceTarget(!voiceOff)}>
              <SwapLabel swap={voiceOff} to="정지 해제">음성 정지</SwapLabel>
            </Btn>
          </>
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

            {/* 하위 탭 — 칸 폭 고정(7등분). 개수는 넓은 화면에서만 옆에 옅게(자리 규칙은 TABS 의 count).
                📌 폭 실측(굵게, Inter + Noto Sans KR): 가장 긴 "알림·문의" 11px 44.2 · 12px 48.2, 개수 10px 2자리 12.9 · 3자리 19.4, 틈 2.
                   칸 = 모바일 (화면 − 48) / 7 → 375: 46.7 · 360: 44.6 ≥ 44.2 / PC (상세 560 − 테두리 1 − 여백 40 − 스크롤바 자리 10 − 8) / 7 = 71.6 ≥ 48.2 + 2 + 19.4
                   📌 360 미만(320 등)은 7등분이 44.2 보다 좁다 — 그 폭만 글자 폭 + 남는 폭 균등(flex-auto). 탭을 골라도 글자 · 굵기가 같아 칸이 그대로 */}
            <div className="sticky top-0 z-[1] -mx-5 px-5 pt-5 pb-2 bg-white">
              <div role="tablist" className="grid grid-cols-7 max-[360px]:flex p-1 rounded-full bg-[#f2f2f2]">
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
                      className={`min-w-0 flex-auto h-8 px-0.5 sm:px-1 inline-flex items-center justify-center gap-0.5 rounded-full text-[11px] sm:text-[12px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`}
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

      {/* 📌 아이템 지급 창 — 아이템 칸을 맨 위에(드롭다운 목록이 창 안에서 아래로 펼쳐진다 · 포털 없음).
             기간 · 수량 칸은 늘 두고 잠그기만 해서 칸이 밀리지 않는다 */}
      {grantOpen && (
        <Sheet label="아이템 지급" sub={paneTitle} busy={granting} onClose={closeGrant}
          actions={
            <>
              <Btn variant="secondary" onClick={closeGrant} disabled={granting}>취소</Btn>
              <Btn className="w-[88px] shrink-0" onClick={submitGrant} disabled={!grantReady}>
                <SwapLabel swap={granting} to="처리 중…">지급</SwapLabel>
              </Btn>
            </>
          }>
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
                value: it._id, label: it.name, hint: itemTypeLabel(it.type),
                icon: <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={it.type} size={18} color={it.color || itemTypeColor(it.type)} />,
              }))}
            />
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>기간</p>
            <Segmented options={GRANT_DAYS} value={grantForm.daysMode} onChange={(v) => setGrantForm((f) => ({ ...f, daysMode: v }))} disabled={granting} />
            <Inline className="mt-2">
              <input type="number" min={1} max={3650} aria-label="일수" placeholder="일수" disabled={!grantCustom || granting}
                value={grantCustom ? grantForm.days : grantForm.daysMode === "0" ? "" : grantForm.daysMode}
                onChange={(e) => setGrantForm((f) => ({ ...f, days: e.target.value === "" ? "" : String(Math.min(3650, Math.max(1, Math.trunc(Number(e.target.value)) || 1))) }))}
                className={numClass} />
              일
            </Inline>
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>수량</p>
            <Inline>
              <input type="number" min={1} max={99} aria-label="수량" disabled={!grantStackable || granting}
                value={grantStackable ? grantForm.qty : "1"}
                onChange={(e) => setGrantForm((f) => ({ ...f, qty: e.target.value === "" ? "" : String(Math.min(99, Math.max(1, Math.trunc(Number(e.target.value)) || 1))) }))}
                onBlur={() => setGrantForm((f) => ({ ...f, qty: String(grantQty) }))}
                className={numClass} />
              개
            </Inline>
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>사유</p>
            <input type="text" maxLength={100} value={grantForm.reason} disabled={granting} placeholder="관리자 지급"
              onChange={(e) => setGrantForm((f) => ({ ...f, reason: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitGrant(); } }}
              className={inputClass} />
          </div>
        </Sheet>
      )}

      {/* 📌 XP · 빙옥 창 — 재화 · 지급/제거 알약은 한 줄. 금액은 숫자만(빈 값 · 0 이면 잠금), 옆에 지금 보유량.
             단추 글자(지급 ↔ 제거)는 폭 고정이라 바꿔도 줄이 흔들리지 않는다. 제거는 확인 창을 한 번 거친다 */}
      {act === "money" && (
        <Sheet label="XP · 빙옥" sub={paneTitle} busy={actBusy} onClose={closeAct}
          actions={
            <>
              <Btn variant="secondary" onClick={closeAct} disabled={actBusy}>취소</Btn>
              <Btn className="w-[88px] shrink-0" onClick={submitMoney} disabled={!moneyReady}>
                <SwapLabel swap={actBusy} to="처리 중…">{moneyTake ? "제거" : "지급"}</SwapLabel>
              </Btn>
            </>
          }>
          <div className="mb-4 min-w-0 flex flex-wrap items-center gap-2">
            <Segmented options={LEDGER_CUR} value={money.cur} onChange={(v) => setMoney((f) => ({ ...f, cur: v as LedgerCur }))} disabled={actBusy} />
            <Segmented options={MONEY_DIR} value={money.dir} onChange={(v) => setMoney((f) => ({ ...f, dir: v as MoneyDir }))} disabled={actBusy} />
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>금액</p>
            <Inline>
              <input type="text" inputMode="numeric" maxLength={9} aria-label="금액" placeholder="0" value={money.amount} disabled={actBusy}
                onChange={(e) => setMoney((f) => ({ ...f, amount: e.target.value.replace(/\D/g, "").replace(/^0+/, "") }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitMoney(); } }}
                className={numClass} />
              {moneyUnit}
              <span className="ml-auto tabular-nums text-[#8a8a8a]">보유 {num(moneyHeld)}</span>
            </Inline>
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>사유</p>
            <input type="text" maxLength={100} value={money.reason} disabled={actBusy} placeholder={moneyTake ? "관리자 회수" : "관리자 지급"}
              onChange={(e) => setMoney((f) => ({ ...f, reason: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitMoney(); } }}
              className={inputClass} />
          </div>
        </Sheet>
      )}
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
      <ConfirmDialog
        open={voiceTarget !== null}
        danger={voiceTarget === true}
        title={voiceTarget ? "음성 XP 정지" : "음성 XP 정지 해제"}
        confirmLabel={voiceTarget ? "정지" : "해제"}
        busy={actBusy}
        onCancel={() => setVoiceTarget(null)}
        onConfirm={runVoice}
        body={voiceTarget !== null ? (
          <>
            <p className="font-bold text-[#131313] break-keep">{paneTitle}</p>
            {voiceTarget === false && u?.voiceXpOffAt && <p className="mt-1 tabular-nums">정지 {fmt(u.voiceXpOffAt)}</p>}
          </>
        ) : null}
      />

      {/* 📌 쿠폰 창 — 드롭다운 하나라 목록(최대 180)이 창 안에 다 들어가게 본문 높이를 잡는다.
             이름 줄 오른쪽 칩(보유 중 · 중지 · 만료 · 소진)은 칩 높이를 늘 잡아 골라도 아래 칸이 밀리지 않는다 */}
      {act === "coupon" && (
        <Sheet label="쿠폰 지급" sub={paneTitle} busy={actBusy} onClose={closeAct} bodyStyle={{ minHeight: 280 }}
          actions={
            <>
              <Btn variant="secondary" onClick={closeAct} disabled={actBusy}>취소</Btn>
              <Btn className="w-[88px] shrink-0" onClick={runCoupon} disabled={!couponReady}>
                <SwapLabel swap={actBusy} to="처리 중…">지급</SwapLabel>
              </Btn>
            </>
          }>
          <div className="mb-4 min-w-0">
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
        </Sheet>
      )}

      {/* 📌 알림 창 — 관리 › 회원 통지 발송과 같은 칸(종류 · 제목 · 내용). 수신자는 이 유저 ID, DM 핑은 서버가 늘 보낸다 */}
      {act === "notice" && (
        <Sheet label="알림 발송" sub={paneTitle} busy={actBusy} onClose={closeAct}
          actions={
            <>
              <Btn variant="secondary" onClick={closeAct} disabled={actBusy}>취소</Btn>
              <Btn className="w-[88px] shrink-0" onClick={runMsg} disabled={!msgReady}>
                <SwapLabel swap={actBusy} to="발송 중…">발송</SwapLabel>
              </Btn>
            </>
          }>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>종류</p>
            <Segmented options={NOTI_TYPES} value={msg.type} onChange={(v) => setMsg((f) => ({ ...f, type: v }))} disabled={actBusy} />
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>제목</p>
            <input type="text" maxLength={100} value={msg.title} disabled={actBusy} aria-label="제목"
              onChange={(e) => setMsg((f) => ({ ...f, title: e.target.value }))}
              className={inputClass} />
          </div>
          <div className="mb-4 min-w-0">
            <p className={labelClass}>내용</p>
            <textarea rows={6} value={msg.content} disabled={actBusy} aria-label="내용"
              onChange={(e) => setMsg((f) => ({ ...f, content: e.target.value }))}
              className={`${inputClass} block resize-none leading-relaxed`} />
          </div>
        </Sheet>
      )}
      {noticeEl}
    </AdminPage>
  );
}
