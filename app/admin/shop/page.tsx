"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { discountPctOf, discountUntilLabel, priceText, COUPON_SCOPES, couponScopeTail } from "@/lib/shopPricing";
import Dropdown, { type DropdownOption } from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import IconPicker from "../../components/IconPicker";
import BackdropPicker from "../../components/BackdropPicker";
import ProductCard from "../../arctic/ProductCard";
import { InventoryItemPreview } from "../../components/Inventory";
import { ITEM_TYPE_OPTIONS, itemTypeLabel, itemTypeColor } from "@/lib/items";
import {
  TRIGGERS, TRIGGER_OF, EFFECT_KINDS, SKINS, FIELD_RANGE, DAY_LABELS, MAX_EFFECTS, amountMaxOf,
  normalizeEffects, describeEffect, describeItemBasic, describeRoleBuff, itemEffectLines,
} from "@/lib/itemEffects";
import {
  EMPTY_PRODUCT_FORM, SOURCE_OPTIONS, sourceOf, isLinked, formFromShopItem,
  pickType as pickProductType, applyItem, unlinkItem, toPayload, toKstInput,
  setPointOnly, formUnit, formSalePrice, priceCalc, durationsCalc,
  SALE_MODES, saleModeOf, setSaleMode, saleModeError, unitSaleOk, pickRole,
} from "../../arctic/productForm";
import { isUnitSale, maxPerOrderOf, MAX_PER_ORDER } from "@/lib/unitSale";
import { groupOrders, orderSummary } from "@/lib/orderGroups";
import type { ProductForm } from "../../arctic/productForm";
import {
  AdminPage,
  AdminTabs,
  Segmented,
  Toolbar,
  SearchInput,
  DataTable,
  DetailPane,
  DefRow,
  StatusChip,
  Panel,
  Inline,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  EmptyRow,
  Btn,
  SwapLabel,
  Toggle,
  useNotice,
  ConfirmDialog,
  useAdminGuard,
} from "../ui";
import type { Column } from "../ui";

// 📌 탭 구성
//    상품·배너·쿠폰·구매내역은 ARCTIC 상점을 채우고 굴리는 일상 작업이다.
//    반면 '시즌 전환'은 길드 전체의 역할 표기를 한 번에 내리는 일회성 조작이라
//    성격이 완전히 다르다. 상품 탭 03 섹션으로 얹혀 있으면 상품을 손보러 들어왔다가
//    스크롤 끝에서 마주치게 된다 — 그래서 별도 탭으로 뺐다.
// desc 에는 화면만 봐서는 모르는 것만 적는다 (지급 시점 · 자동 전환 주기 · 되돌릴 수 없음)
//    '아이템'은 인벤토리·상품·시즌 패스 표기의 원천이라 맨 앞에 둔다 — 상품을 만들기 전에 먼저 등록한다.
// 📌 2026-09 개편 — 목록 화면 틀 하나로 맞췄다.
//    머리(ARCTIC · 상점 관리 · 탭 한 줄) → 검색 · 상태 토글 · 새로 만들기 한 줄 → 전체 폭 표 → 줄을 누르면 오른쪽 상세 칸.
//    예전에는 탭마다 위에 긴 등록 폼 + 아래 목록이라, 목록을 보려면 폼을 지나 내려가야 했고 '수정'은 맨 위로 튀어 올랐다.
//    이제 새로 만들기 · 수정은 같은 상세 칸 안의 같은 폼이다.
const TAB_META: Record<string, { desc: string }> = {
  items: { desc: "여기서 등록한 표기가 인벤토리 · 상점 상품 · 시즌 패스 보상에 그대로 쓰입니다." },
  products: { desc: "역할 상품은 구매 시 봇이 자동 지급합니다." },
  // 넘김 주기는 app/arctic/BannerSlider.tsx (2026-10-01 5초 → 8초, 10-03 → 7초). 노출 위치(홈 · 시즌 탭)마다 따로 돈다
  banners: { desc: "같은 노출 위치의 배너가 여럿이면 7초마다 자동 전환됩니다." },
  coupons: { desc: "" },
  // 예전 목록 아래 한 줄 안내를 머리로 올렸다
  orders: { desc: "역할 상품은 봇이 30초 주기로 자동 지급합니다. 취소하면 XP가 환불되고 재고가 복구됩니다." },
  season: { desc: "되돌리려면 역할을 손으로 다시 붙여야 합니다." },
};

const TAB_ORDER = [
  { id: "items", short: "아이템" },
  { id: "products", short: "상품" },
  { id: "banners", short: "배너" },
  { id: "coupons", short: "쿠폰" },
  { id: "orders", short: "구매 내역" },
  { id: "season", short: "시즌 전환" },
];

// expired — 기간제가 끝나 봇이 회수한 건 (bot/src/features/grantQueue.js)
const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소", refunded: "환불", expired: "만료" };
const STATUS_TONE: Record<string, "warn" | "ok" | "bad" | "neutral"> = { pending: "warn", completed: "ok", cancelled: "bad", refunded: "bad", expired: "neutral" };

// 상품 유형 — 라벨·색은 lib/items.js 가 단일 원천 (상점 카드와 같은 값)
const typeLabel = (t: string) => itemTypeLabel(t);
function TypeBadge({ type, className = "" }: { type: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white whitespace-nowrap ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
      {itemTypeLabel(type)}
    </span>
  );
}

// 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon)을 등록 색 위에 크게 (상점 CardArt 와 같은 규칙)
function CardArt({ it, iconSize = 48 }: { it: any; iconSize?: number }) {
  const color = it?.color || itemTypeColor(it?.type);
  const img = it?.imageUrl || it?.itemImageUrl;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />;
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
      <ItemIcon icon={it?.icon} type={it?.type} size={iconSize} color={color} />
    </div>
  );
}

// 표 줄 앞 작은 그림
function Thumb({ it }: { it: any }) {
  return (
    <span className="relative block w-10 h-10 rounded-lg bg-[#f2f2f2] overflow-hidden shrink-0">
      <CardArt it={it} iconSize={22} />
    </span>
  );
}

// 📌 아이템 효과 한 줄(화면용) — 숫자 칸은 비울 수 있어야 해서 문자열로 든다. 정의 · 문구 · 정리는 lib/itemEffects 가 단일 원천.
//    open(조건 펼침)은 화면 상태라 저장하지 않는다. chText 는 채널 목록을 못 불러왔을 때 쓰는 ID 입력칸의 날 글자
type EffectDraft = {
  id: string; on: string; mode: string; amount: string; minMinutes: string; everyN: string;
  chance: string; minMembers: string; seconds: string; skin: string;
  days: number[]; hourFrom: string; hourTo: string; channelIds: string[]; chText: string; open: boolean;
};
const newEffectId = () => Math.random().toString(36).slice(2, 10);
const newEffect = (): EffectDraft => ({
  id: newEffectId(), on: "chat", mode: "add", amount: "", minMinutes: "", everyN: "", chance: "", minMembers: "", seconds: "", skin: "",
  days: [], hourFrom: "", hourTo: "", channelIds: [], chText: "", open: false,
});
// 빈 칸은 undefined 로 넘긴다 — normalizeEffects 는 "" 를 0 으로 읽어 분 · 번째를 최솟값(1분 · 2번째)으로 채워 버린다
const numOrNone = (s: string) => (String(s ?? "").trim() === "" ? undefined : Number(s));
// 📌 초 칸 효과(쿨타임 단축)는 크기 칸이 화면에 없다 — 다른 효과에서 바꿔 온 크기가 초로 읽히지 않게 amount 를 넘기지 않는다
const effectOf = (d: EffectDraft) => ({
  id: d.id, on: d.on, mode: d.mode, amount: TRIGGER_OF[d.on]?.needs === "seconds" ? undefined : numOrNone(d.amount),
  minMinutes: numOrNone(d.minMinutes), everyN: numOrNone(d.everyN),
  chance: numOrNone(d.chance), minMembers: numOrNone(d.minMembers), seconds: numOrNone(d.seconds), skin: d.skin || undefined,
  days: d.days, hourFrom: d.hourFrom, hourTo: d.hourTo, channelIds: d.channelIds,
});
const draftOf = (e: any): EffectDraft => {
  const channelIds = Array.isArray(e?.channelIds) ? e.channelIds.map(String) : [];
  return {
    id: String(e?.id || newEffectId()), on: TRIGGER_OF[e?.on] ? e.on : "chat", mode: e?.mode === "percent" ? "percent" : "add",
    amount: e?.amount ? String(e.amount) : "", minMinutes: e?.minMinutes ? String(e.minMinutes) : "", everyN: e?.everyN ? String(e.everyN) : "",
    chance: e?.chance ? String(e.chance) : "", minMembers: e?.minMembers ? String(e.minMembers) : "",
    seconds: e?.seconds ? String(e.seconds) : "", skin: typeof e?.skin === "string" ? e.skin : "",
    days: Array.isArray(e?.days) ? e.days.map(Number) : [], hourFrom: e?.hourFrom != null ? String(e.hourFrom) : "", hourTo: e?.hourTo != null ? String(e.hourTo) : "",
    channelIds, chText: channelIds.join(", "), open: false,
  };
};
const xpNum = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

// 아이템 등록 폼 — 숫자 칸은 비울 수 있어야 해서 문자열로 든다
//    효과(chatBuffXp · voiceBuffXp · attendBuffXp · effects)는 아이템 자체에 저장 — 이 아이템을 인벤토리에 가진 사람에게 적용(디스코드 역할과 무관)
type ItemForm = {
  id: string; name: string; description: string; type: string; roleId: string; icon: string; imageUrl: string;
  color: string; detachOnSeason: boolean; visible: boolean;
  chatBuffXp: string; voiceBuffXp: string; attendBuffXp: string; effects: EffectDraft[];
};
const EMPTY_ITEM_FORM: ItemForm = {
  id: "", name: "", description: "", type: "item", roleId: "", icon: "", imageUrl: "", color: "", detachOnSeason: false, visible: true,
  chatBuffXp: "", voiceBuffXp: "", attendBuffXp: "", effects: [],
};

// 채널 표기 — 봇 관리 화면과 같은 기호
const CH_ICON: Record<string, string> = { text: "#", voice: "🔊", category: "📁" };
const CH_LABEL: Record<string, string> = { text: "텍스트", voice: "음성", category: "카테고리" };
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const sameDays = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

const fmtDateTime = (v: string | Date) => {
  const d = new Date(v);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// 필수 · 선택 표시 (라벨 옆 기호)
const Req = () => <span className="text-[#e91e3f]"> *</span>;
const Opt = () => <span className="text-[#5a5a5a] font-medium"> (선택)</span>;

// 📌 모바일 줄 카드에는 표 머리가 없다 — 값 앞에 이름을 붙이고 PC 표에서는 숨긴다
const ML = ({ children }: { children: React.ReactNode }) => <span className="md:hidden text-[#8a8a8a]">{children} </span>;

// 📌 상세 칸 안 입력 한 칸 — 칸 폭(520)이 좁아 FieldRow(이름 180px 옆)가 아니라 이름을 위에 둔다.
//    ⚠️ 페이지 컴포넌트 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다 — 모듈 바깥에 둔다.
function Field({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 min-w-0">
      <div className={labelClass}>{label}</div>
      {children}
      {hint && <p className={fieldNote}>{hint}</p>}
    </div>
  );
}
// 두 칸 한 줄 (모바일은 한 칸) — 세로 간격은 Field 의 mb 로 (flex-col gap 이 안 먹는 빌드)
function Two({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">{children}</div>;
}
// 📌 긴 폼의 소제목 — 예전 접이식 묶음(FormGroup)을 걷고 소제목 + 선으로만 나눈다(상세 칸이 따로 스크롤된다)
function PaneSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pb-1 mb-4 border-b border-[#ededed] last:border-b-0 last:mb-0 last:pb-0">
      <h3 className="text-[14px] font-black tracking-tight mb-3">{title}</h3>
      {children}
    </section>
  );
}

// 📌 표시 토글 — 표 줄(PC <tr> · 모바일 <button>) 안에 놓이므로 <button> 이 아니라 span 으로 만든다(버튼 속 버튼 금지).
//    누르면 줄의 상세 칸이 열리지 않게 전파를 끊는다. 모양은 ui.tsx Switch 와 같은 값.
function VisSwitch({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  const fire = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!busy) onToggle();
  };
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-disabled={busy}
      aria-label="인벤토리 표시"
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fire(e); }}
      className={`inline-flex items-center gap-2 rounded-full cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${busy ? "opacity-40" : ""}`}
    >
      <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${on ? "bg-[#131313]" : "bg-[#d4d4d4]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={`text-[12px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{on ? "표시" : "숨김"}</span>
    </span>
  );
}

// 📌 상세 칸 아래 줄의 저장 단추는 <form> 밖에 있다. DetailPane 이 PC 칸 · 모바일 판을 둘 다 그려 form id 를 겹쳐 쓸 수 없으니,
//    누른 단추가 속한 칸 안의 form 을 찾아 제출한다(requestSubmit — 숫자 칸 min/max 검사 · onSubmit 은 예전 그대로).
const submitNearest = (e: React.MouseEvent<HTMLButtonElement>) => {
  const f = e.currentTarget.closest('[role="dialog"]')?.querySelector("form");
  if (!f) return;
  if (typeof f.requestSubmit === "function") f.requestSubmit();
  else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
};
// 폼 안 숨은 제출 단추 — 입력칸에서 Enter 로 저장되던 것을 그대로 둔다
const HiddenSubmit = () => <button type="submit" hidden aria-hidden tabIndex={-1} />;

// 📌 넣은 이미지의 실제 크기를 읽어 권장 크기와 견줘 준다 (등록하고 나서야 잘린 걸 아는 일을 막는다) — 배너 PC · 모바일 이미지가 같이 쓴다
function useImageSize(src: string) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const url = (src || "").trim();
    if (!url) { setSize(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { if (alive) setSize(null); };
    img.src = url;
    return () => { alive = false; };
  }, [src]);
  return size;
}
// 모바일 배너 틀 비율 범위 — ArcticHome 의 모바일 틀과 같은 값
const M_BANNER_MIN = 0.8;
const M_BANNER_MAX = 3;

// Dropdown(라이트) 단추를 inputClass 높이 · 테두리에 맞춘다
const DD_BTN = "min-h-10 !py-2 !px-3 !border-[#a3a3a3] !text-[14px]";

// 📌 배너 '클릭 시 이동' 바로 고르기 — 고르면 아래 링크 칸이 그 주소로 채워진다(2026-10-01 "배너 클릭하면 어느 카테고리로 갈 수 있게 선택").
//    스토어 유형은 app/arctic/ArcticShopBody.tsx TYPES 와 같은 값(/arctic?type=<v> — 상점이 이 값으로 그 탭을 연다). 바꾸면 거기도.
const BANNER_STORE_TYPES = [
  { v: "all", l: "전체" },
  { v: "role", l: "역할" },
  { v: "perk", l: "권한" },
  { v: "item", l: "아이템" },
  { v: "cosmetic", l: "꾸미기" },
  { v: "physical", l: "기프트카드" },
  { v: "timed", l: "기간제" },
  { v: "season", l: "시즌" },
];
const BANNER_LINK_CUSTOM = "__custom";
const bannerLinkOptions = (items: any[]): DropdownOption[] => [
  { value: "", label: "이동 없음" },
  { value: "g:store", label: "스토어", group: true },
  { value: "/arctic", label: "스토어 홈", indent: true },
  ...BANNER_STORE_TYPES.map((t) => ({ value: `/arctic?type=${t.v}`, label: t.l, indent: true })),
  { value: "g:site", label: "사이트", group: true },
  { value: "/level?tab=pass", label: "시즌 패스", indent: true },
  { value: "/level", label: "SYSTEM : LEVEL", indent: true },
  { value: "/event", label: "이벤트", indent: true },
  ...(items.length ? [{ value: "g:item", label: "상품", group: true }] : []),
  ...items.map((it) => ({ value: `/arctic/item/${it._id}`, label: it.name || "이름 없음", hint: it.active === false ? "숨김" : undefined, indent: true })),
  { value: BANNER_LINK_CUSTOM, label: "직접 입력" },
];
// 상세 칸 아래 줄의 삭제 — 저장 옆에 빨간 덩어리를 두지 않고 글자만
const DEL_BTN = "ml-auto !text-[#d01634]";

// 📌 아이템 효과 편집 — 기본 세 칸 + 추가 효과 목록(발동 · 상시 · 소모 · 꾸미기). 상세 칸(520px) · 모바일 판 모두에서 줄이 무너지지 않게 줄바꿈을 허용한다.
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
const HOUR_FROM = Array.from({ length: 24 }, (_, h) => h);
const HOUR_TO = Array.from({ length: 24 }, (_, h) => h + 1);
const selectSm = `${inputClass} !w-[84px] tabular-nums`;
const subLabel = "mb-1.5 text-[12px] font-bold text-[#5a5a5a]";
// 크기 칸 앞 기호 · 뒤 단위 — 문구(describeEffect)와 같은 모양: 할인 · 단축 · 완화는 "−", 캐시백은 기호 없음, 나머지 "+"
const PERK_SIGN: Record<string, string> = { enhanceDiscount: "−", muteRelief: "−", shopCashback: "" };
const unitOf = (t: any, mode: string) => t?.unit || (mode === "percent" ? "%" : "XP");
function EffectsEditor({
  chatBuffXp, voiceBuffXp, attendBuffXp, list, channels, onChange,
}: {
  chatBuffXp: string; voiceBuffXp: string; attendBuffXp: string; list: EffectDraft[]; channels: any[];
  onChange: (patch: Partial<Pick<ItemForm, "chatBuffXp" | "voiceBuffXp" | "attendBuffXp" | "effects">>) => void;
}) {
  const setRow = (i: number, patch: Partial<EffectDraft>) => onChange({ effects: list.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const chName = (id: string) => channels.find((c) => c.id === id)?.name as string | undefined;
  // 📌 2026-10-04 "상시 효과 숨은 상한은 관리자만 표기" — 상한은 관리자 편집 칸에만 적는다(유저 화면에는 없다).
  //    쿨타임 단축 · 음소거 완화는 상한이 설정값에 따라 바뀐다(채팅 쿨타임의 절반 · 지금 음소거 감소율) — 지금 설정으로 계산해 적는다
  const [botCaps, setBotCaps] = useState<{ cooldown: number; mute: number } | null>(null);
  useEffect(() => {
    fetch("/api/bot-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.data) setBotCaps({ cooldown: Number(d.data.chatCooldownSec) || 0, mute: Math.min(100, Math.max(0, Number(d.data.muteReducePct) || 0)) }); })
      .catch(() => {});
  }, []);
  const capText = (t: { v: string; cap?: number; unit?: string }) => {
    if (t.v === "cooldownCut") return botCaps ? `합 최대 ${Math.min(3600, Math.floor(botCaps.cooldown / 2)).toLocaleString()}초 (채팅 쿨타임의 절반)` : "합 최대 채팅 쿨타임의 절반";
    if (t.v === "muteRelief") return botCaps ? `합 최대 ${botCaps.mute}%p (지금 음소거 감소율)` : "합 최대 지금 음소거 감소율";
    return `합 최대 ${t.cap}${t.unit}`;
  };
  // 상황을 바꾸면 — 없는 방식(%)은 첫 방식으로, 채팅 ↔ 음성이면 맞지 않는 종류의 채널은 뺀다(카테고리 · 모르는 ID 는 둔다).
  //    채널 종류는 TRIGGERS 의 channels("voice" 면 음성, true 면 텍스트)
  //    발동형이 아니면(상시 · 소모 · 꾸미기) 요일 · 시간대 · 채널 조건이 없다 — 비우고 접는다. 카드 스킨은 첫 스킨을 골라 둔다
  const pickOn = (i: number, v: string) => {
    const t = TRIGGER_OF[v];
    if (!t) return;
    const d = list[i];
    const fits = (id: string) => {
      const c = channels.find((x) => x.id === id);
      return !c || c.type === "category" || c.type === (t.channels === "voice" ? "voice" : "text");
    };
    const ids = t.channels ? d.channelIds.filter(fits) : d.channelIds;
    const trig = t.kind === "trigger";
    setRow(i, {
      on: v, mode: t.modes.includes(d.mode) ? d.mode : t.modes[0], channelIds: ids, chText: ids.join(", "),
      ...(trig ? {} : { days: [], hourFrom: "", hourTo: "", channelIds: [], chText: "", open: false }),
      ...(t.needs === "skin" && !d.skin ? { skin: SKINS[0].v } : {}),
    });
  };
  const toggleDay = (i: number, day: number) => {
    const cur = list[i].days;
    setRow(i, { days: cur.includes(day) ? cur.filter((x) => x !== day) : [...cur, day].sort((a, b) => a - b) });
  };
  // 시간대 — 한쪽만 고르면 나머지를 한 시간 뒤/앞으로 채운다(한쪽만 있으면 적용되지 않으므로). 비우면 둘 다 비운다
  const setHour = (i: number, which: "from" | "to", v: string) => {
    const d = list[i];
    if (v === "") return setRow(i, { hourFrom: "", hourTo: "" });
    if (which === "from") setRow(i, { hourFrom: v, hourTo: d.hourTo === "" ? String(Math.min(24, Number(v) + 1)) : d.hourTo });
    else setRow(i, { hourTo: v, hourFrom: d.hourFrom === "" ? String(Math.max(0, Number(v) - 1)) : d.hourFrom });
  };
  const setChannels = (i: number, ids: string[]) => setRow(i, { channelIds: ids, chText: ids.join(", ") });

  return (
    <fieldset className="min-w-0">
      <div className={labelClass}>기본 효과</div>
      <div className="mb-5 space-y-2">
        <Inline>
          <span className="w-[88px] shrink-0 font-bold text-[#131313]">채팅 1회당</span>
          <span>+</span>
          <input type="number" min={0} inputMode="numeric" value={chatBuffXp} onChange={(e) => onChange({ chatBuffXp: e.target.value })} placeholder="0" className={numClass} />
          <span>XP</span>
        </Inline>
        <Inline>
          <span className="w-[88px] shrink-0 font-bold text-[#131313]">음성 1회당</span>
          <span>+</span>
          <input type="number" min={0} inputMode="numeric" value={voiceBuffXp} onChange={(e) => onChange({ voiceBuffXp: e.target.value })} placeholder="0" className={numClass} />
          <span>XP</span>
        </Inline>
        <Inline>
          <span className="w-[88px] shrink-0 font-bold text-[#131313]">출석 시</span>
          <span>+</span>
          <input type="number" min={0} inputMode="numeric" value={attendBuffXp} onChange={(e) => onChange({ attendBuffXp: e.target.value })} placeholder="0" className={numClass} />
          <span>XP</span>
        </Inline>
      </div>

      <div className={labelClass}>추가 효과</div>
      {list.map((d, i) => {
        const t = TRIGGER_OF[d.on] || TRIGGERS[0];
        const trig = t.kind === "trigger";
        const norm: any = normalizeEffects([effectOf(d)])[0];
        const hasTime = d.hourFrom !== "" && d.hourTo !== "" && d.hourFrom !== d.hourTo;
        const condN = trig ? (d.days.length > 0 && d.days.length < 7 ? 1 : 0) + (hasTime ? 1 : 0) + (t.channels && d.channelIds.length ? 1 : 0) : 0;
        const dayPreset = d.days.length === 0 || d.days.length === 7 ? "all" : sameDays(d.days, WEEKDAYS) ? "wd" : sameDays(d.days, WEEKEND) ? "we" : "";
        const chOptions = channels
          .filter((c) => c.type === "category" || c.type === (t.channels === "voice" ? "voice" : "text"))
          .filter((c) => !d.channelIds.includes(c.id))
          .map((c) => ({ value: c.id, label: `${CH_ICON[c.type] || "#"} ${c.name}`, hint: CH_LABEL[c.type], indent: !!c.parentId }));
        return (
          <div key={d.id} className="mb-2 rounded-xl border border-[#ededed] p-3">
            <div className="flex items-center gap-2">
              {/* 종류가 많아 묶음(발동 · 상시 · 소모 · 꾸미기)으로 나눠 고른다 */}
              <select value={d.on} onChange={(e) => pickOn(i, e.target.value)} aria-label="효과" className={`${inputClass} min-w-0 flex-1`}>
                {EFFECT_KINDS.map((k) => (
                  <optgroup key={k.v} label={k.l}>
                    {TRIGGERS.filter((x) => x.kind === k.v).map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                  </optgroup>
                ))}
              </select>
              {/* 폭 고정 — 조건 수가 붙어도 옆 칸이 밀리지 않게. 조건은 발동형만(나머지는 자리를 지킨 채 잠근다) */}
              <Btn variant={d.open && trig ? "primary" : "secondary"} size="sm" className="shrink-0 w-[72px]" aria-expanded={d.open && trig} disabled={!trig} onClick={() => setRow(i, { open: !d.open })}>
                조건{condN > 0 && <span className="tabular-nums">{condN}</span>}
              </Btn>
              <button type="button" aria-label="효과 삭제" onClick={() => onChange({ effects: list.filter((_, j) => j !== i) })}
                className="shrink-0 w-8 h-8 rounded-full text-[#8a8a8a] hover:text-[#d01634] hover:bg-[#f2f2f2] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 값 줄 — 효과마다 필요한 칸만. 크기가 없는 효과(보호막 · 배지)는 줄이 없다 */}
            {(!t.noAmount || t.needs) && (
              <Inline className="mt-2">
                {t.needs === "minMinutes" && (
                  <>
                    <input type="number" min={1} max={1440} inputMode="numeric" value={d.minMinutes} onChange={(e) => setRow(i, { minMinutes: e.target.value })} placeholder="60" aria-label="분" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>분</span>
                  </>
                )}
                {t.needs === "everyN" && (
                  <>
                    <input type="number" min={2} max={365} inputMode="numeric" value={d.everyN} onChange={(e) => setRow(i, { everyN: e.target.value })} placeholder="7" aria-label="번째" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>번째</span>
                  </>
                )}
                {t.needs === "chance" && (
                  <>
                    <input type="number" min={FIELD_RANGE.chance[0]} max={FIELD_RANGE.chance[1]} inputMode="numeric" value={d.chance} onChange={(e) => setRow(i, { chance: e.target.value })} placeholder="10" aria-label="확률" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>% 확률</span>
                  </>
                )}
                {t.needs === "minMembers" && (
                  <>
                    <input type="number" min={FIELD_RANGE.minMembers[0]} max={FIELD_RANGE.minMembers[1]} inputMode="numeric" value={d.minMembers} onChange={(e) => setRow(i, { minMembers: e.target.value })} placeholder="3" aria-label="인원" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>명 이상</span>
                  </>
                )}
                {t.needs === "seconds" && (
                  <>
                    <span>−</span>
                    <input type="number" min={FIELD_RANGE.seconds[0]} max={FIELD_RANGE.seconds[1]} inputMode="numeric" value={d.seconds} onChange={(e) => setRow(i, { seconds: e.target.value })} placeholder="15" aria-label="초" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>초</span>
                  </>
                )}
                {t.needs === "skin" && (
                  <Segmented options={SKINS.map((s) => ({ v: s.v, l: s.l }))} value={d.skin} onChange={(v) => setRow(i, { skin: v })} />
                )}
                {!t.noAmount && t.needs !== "seconds" && (
                  <>
                    {(PERK_SIGN[t.v] ?? "+") && <span>{PERK_SIGN[t.v] ?? "+"}</span>}
                    <input type="number" min={0} max={amountMaxOf(t, d.mode)} inputMode="numeric" value={d.amount} onChange={(e) => setRow(i, { amount: e.target.value })}
                      placeholder={unitOf(t, d.mode) === "XP" ? "100" : "10"} aria-label="크기" className={numClass} />
                    {t.modes.length > 1
                      ? <Segmented options={[{ v: "add", l: "XP" }, { v: "percent", l: "%" }]} value={d.mode} onChange={(v) => setRow(i, { mode: v })} />
                      : <span>{unitOf(t, d.mode)}</span>}
                  </>
                )}
                {/* 상시형은 아이템끼리 합한 뒤 상한으로 자른다 */}
                {t.kind === "perk" && t.cap && <span className="text-[#8a8a8a] tabular-nums">{capText(t)}</span>}
              </Inline>
            )}

            {d.open && trig && (
              <div className="mt-3 pt-3 border-t border-[#ededed]">
                <div className={subLabel}>요일</div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Segmented
                    options={[{ v: "all", l: "매일" }, { v: "wd", l: "평일" }, { v: "we", l: "주말" }]}
                    value={dayPreset}
                    onChange={(v) => setRow(i, { days: v === "wd" ? WEEKDAYS : v === "we" ? WEEKEND : [] })}
                  />
                  <div className="inline-flex p-1 rounded-full bg-[#f2f2f2]" role="group" aria-label="요일">
                    {DAY_LABELS.map((l, day) => {
                      const on = d.days.includes(day);
                      return (
                        <button key={day} type="button" aria-pressed={on} onClick={() => toggleDay(i, day)}
                          className={`shrink-0 w-8 h-8 rounded-full text-[13px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${on ? "bg-white text-[#131313] ring-1 ring-black/[0.06]" : "text-[#5a5a5a] hover:text-[#131313]"}`}>
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className={subLabel}>시간대</div>
                <Inline className={t.channels ? "mb-3" : ""}>
                  <select value={d.hourFrom} onChange={(e) => setHour(i, "from", e.target.value)} aria-label="시작 시각" className={selectSm}>
                    <option value="">—</option>
                    {HOUR_FROM.map((h) => <option key={h} value={String(h)}>{h}시</option>)}
                  </select>
                  <span>~</span>
                  <select value={d.hourTo} onChange={(e) => setHour(i, "to", e.target.value)} aria-label="끝 시각" className={selectSm}>
                    <option value="">—</option>
                    {HOUR_TO.map((h) => <option key={h} value={String(h)}>{h}시</option>)}
                  </select>
                </Inline>

                {t.channels && (
                  <>
                    <div className={subLabel}>채널</div>
                    {channels.length > 0 ? (
                      <>
                        {d.channelIds.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {d.channelIds.map((id) => {
                              const c = channels.find((x) => x.id === id);
                              return (
                              <span key={id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#131313] max-w-full">
                                <span className="min-w-0 truncate">{c ? `${CH_ICON[c.type] || "#"} ${c.name}` : id}</span>
                                <button type="button" aria-label="채널 빼기" onClick={() => setChannels(i, d.channelIds.filter((x) => x !== id))}
                                  className="shrink-0 w-5 h-5 rounded-full text-[#8a8a8a] hover:text-[#131313] flex items-center justify-center">
                                  <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.6}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </span>
                              );
                            })}
                          </div>
                        )}
                        <Dropdown
                          theme="light"
                          buttonClassName={DD_BTN}
                          value=""
                          onChange={(v) => { if (v && d.channelIds.length < 20) setChannels(i, [...d.channelIds, v]); }}
                          placeholder={d.channelIds.length ? "채널 추가" : "모든 채널"}
                          options={chOptions}
                        />
                      </>
                    ) : (
                      <input type="text" value={d.chText} placeholder="채널 ID, 쉼표로 구분"
                        onChange={(e) => setRow(i, { chText: e.target.value, channelIds: e.target.value.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 20) })}
                        className={inputClass} />
                    )}
                  </>
                )}
              </div>
            )}

            {/* 저장되면 이렇게 적용된다 — describeEffect 문장(관리자 확인용이라 채널 하나면 이름까지) */}
            <p className="mt-2 text-[12px] text-[#8a8a8a] leading-relaxed break-keep">
              {norm ? describeEffect(norm, norm.channelIds?.length === 1 ? chName(norm.channelIds[0]) : undefined) : "값을 입력해 주세요"}
            </p>
          </div>
        );
      })}
      <Btn variant="secondary" size="sm" disabled={list.length >= MAX_EFFECTS} onClick={() => onChange({ effects: [...list, newEffect()] })}>+ 효과 추가</Btn>
    </fieldset>
  );
}

// 📌 추천 아이템 창 — 목록(lib/itemPresets.js · /api/admin/items/presets)에서 골라 한 번에 등록한다. 같은 이름이 이미 있으면 잠근다(등록됨).
//    모바일은 아래에서 올라오는 판, PC 는 가운데 창. 머리 · 전체 선택 줄 · 아래 동작 줄은 고정이고 목록만 스크롤한다
//    열 때만 그린다(페이지가 presetOpen 일 때 마운트) — 열 때마다 상태가 새로 시작하고 목록을 다시 읽는다
type PresetRow = { key: string; name: string; icon: string; group: string; lines: string[]; exists: boolean };
type PresetIconSwap = { name: string; icon: string; found: number; pending: number };
const CHECK = "w-4 h-4 shrink-0 accent-[#131313] cursor-pointer disabled:cursor-default";
function PresetDialog({
  onClose, onDone, notify,
}: {
  onClose: () => void;
  onDone: (d: { created?: string[]; skipped?: string[]; iconsUpdated?: number }) => void;
  notify: (message: string, isError?: boolean) => void;
}) {
  const [rows, setRows] = useState<PresetRow[] | null>(null);
  const [icons, setIcons] = useState<PresetIconSwap[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [swap, setSwap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // 처음엔 아직 없는 것을 전부 골라 둔다
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/items/presets", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((d) => {
      if (!alive) return;
      const list: PresetRow[] = d?.success && Array.isArray(d.data) ? d.data : [];
      setFailed(!d?.success);
      setRows(list);
      setIcons(d?.success && Array.isArray(d.icons) ? d.icons : []);
      setSel(new Set(list.filter((r) => !r.exists).map((r) => r.key)));
    });
    return () => { alive = false; };
  }, []);

  const avail = (rows || []).filter((r) => !r.exists);
  const picked = avail.filter((r) => sel.has(r.key));
  const allOn = avail.length > 0 && picked.length === avail.length;
  const pendingIcons = icons.reduce((s, i) => s + (i.pending || 0), 0);
  const doSwap = swap && pendingIcons > 0;
  const toggle = (k: string) => setSel((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const submit = async () => {
    if (busy || (!picked.length && !doSwap)) return;
    setBusy(true);
    const res = await fetch("/api/admin/items/presets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: picked.map((r) => r.key), replaceIcons: doSwap }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && d?.success) onDone(d);
    else notify(d?.message || "등록에 실패했습니다.", true);
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={busy ? undefined : onClose}>
      <div role="dialog" aria-modal="true" aria-label="추천 아이템" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
          <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">추천 아이템</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-3 px-5 h-11 border-b border-[#ededed]">
          <label className="flex items-center gap-2 text-[13px] font-bold cursor-pointer">
            <input type="checkbox" className={CHECK} checked={allOn} disabled={!avail.length || busy}
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
                {r.group && r.group !== rows[i - 1]?.group && <p className="px-5 pt-4 pb-1 text-[11px] font-black text-[#8a8a8a]">{r.group}</p>}
                <label className={`flex items-center gap-3 px-5 py-2 ${r.exists ? "cursor-default" : "cursor-pointer hover:bg-[#f2f2f2]"}`}>
                  <input type="checkbox" className={CHECK} checked={r.exists || sel.has(r.key)} disabled={r.exists || busy} onChange={() => toggle(r.key)} />
                  <ItemIcon icon={r.icon} type="item" size={32} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[14px] font-bold ${r.exists ? "text-[#a3a3a3]" : ""}`}>{r.name}</span>
                    {r.lines.map((l, j) => <span key={j} className="block truncate text-[12px] text-[#5a5a5a] tabular-nums">{l}</span>)}
                  </span>
                  {r.exists && <StatusChip className="shrink-0">등록됨</StatusChip>}
                </label>
              </React.Fragment>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center gap-3">
          <label className={`min-w-0 flex-1 flex items-center gap-2 text-[13px] font-bold break-keep ${pendingIcons ? "cursor-pointer" : "text-[#a3a3a3]"}`}>
            <input type="checkbox" className={CHECK} checked={doSwap} disabled={!pendingIcons || busy} onChange={(e) => setSwap(e.target.checked)} />
            <span className="min-w-0">기존 아이템 아이콘도 도트로 바꾸기</span>
          </label>
          <Btn className="w-[88px] shrink-0" onClick={submit} disabled={busy || rows == null || (!picked.length && !doSwap)}>{busy ? "등록 중…" : "등록"}</Btn>
        </div>
      </div>
    </div>
  );
}

type PaneKind = "" | "reg" | "product" | "banner" | "coupon" | "order";

export default function AdminShopPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();

  const searchParams = useSearchParams();
  // 상점 카드의 '수정' 링크(?edit=<id>)는 탭 없이 들어오므로 상품 탭으로 보낸다
  const tabParam = searchParams.get("tab") || (searchParams.get("edit") ? "products" : "items");
  const tab = TAB_META[tabParam] ? tabParam : "items";

  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [guildRoles, setGuildRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "item" | "banner" | "coupon" | "reg"; id: string } | null>(null);
  const [orderFilter, setOrderFilter] = useState("");
  const [noteTarget, setNoteTarget] = useState<any>(null);
  const [noteText, setNoteText] = useState("");
  // 취소 · 환불 확인 — 주문 묶음 하나(1개 단위면 여러 건). pool: 돌려줄 수 있는 건(안 쓴 것, 최근 것부터) · cancelCount: 그중 몇 개
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelCount, setCancelCount] = useState("");

  // 📌 상세 칸 — 한 번에 하나만 연다. 폼 탭은 그 탭의 폼 상태(id 유무)가 새로 만들기 / 수정을 가른다
  const [pane, setPane] = useState<PaneKind>("");
  const [orderSelId, setOrderSelId] = useState<string | null>(null);
  // 목록 한 줄 도구 — 검색어는 탭마다 새로, 상태 토글은 탭별로 따로 둔다
  const [q, setQ] = useState("");
  const [regType, setRegType] = useState("");
  const [productView, setProductView] = useState("");
  const [bannerView, setBannerView] = useState("");
  const [couponView, setCouponView] = useState("");
  // 📌 순서 바꾸기 — 아이템 · 상품 목록을 끌어서 정한다. orderDraft 는 전체 목록의 id 순서다
  //    (검색 · 유형으로 거른 목록에서 옮겨도 전체 안의 제자리에 끼워 넣는다). 탭을 옮기면 저장하지 않은 순서는 버린다.
  const [reorder, setReorder] = useState<"" | "reg" | "product">("");
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);
  useEffect(() => { setReorder(""); setOrderDraft([]); }, [tab]);

  // 상품 폼 — 상태 모양·기간·유형·아이템 적용 규칙은 app/arctic/productForm 공용 (상점 인라인 폼과 같다)
  const emptyForm = EMPTY_PRODUCT_FORM;
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === form.roleId);
  const linked = isLinked(form);

  const closePane = useCallback(() => { setPane(""); setIsRoleOpen(false); }, []);

  // ── 아이템 등록 ──────────────────────────────
  const [regItems, setRegItems] = useState<any[]>([]);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM);
  const [isSavingReg, setIsSavingReg] = useState(false);
  // 예전 '인벤토리 표기 역할' — 남아 있으면 가져오기 버튼을 보여 준다
  const [invRoles, setInvRoles] = useState<any[]>([]);
  // 아직 아이템으로 옮기지 않은 옛 표기 역할 — 가져오기 버튼의 숫자·표시 조건
  const [isImporting, setIsImporting] = useState(false);
  // 추천 아이템 창 (PresetDialog)
  const [presetOpen, setPresetOpen] = useState(false);

  const pendingInv = invRoles.filter((r) => r.visible !== false && !regItems.some((i) => i.roleId === r.roleId));

  const fetchRegItems = useCallback(() => {
    Promise.all([
      fetch("/api/admin/items?withUsage=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/inventory-role", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([reg, inv]) => {
      setRegItems(Array.isArray(reg?.data) ? reg.data : []);
      setInvRoles(Array.isArray(inv?.data) ? inv.data : []);
    });
  }, []);

  const fillRegForm = (it: any) => {
    // 효과는 GET 이 아이템 문서에서 읽어 붙여 준 값 (없으면 0 / [])
    const ef = it.effects || {};
    const list = Array.isArray(ef.list) ? ef.list : [];
    setItemForm({
      id: it._id, name: it.name || "", description: it.description || "", type: it.type || "item", roleId: it.roleId || "",
      icon: it.icon || "", imageUrl: it.imageUrl || "", color: it.color || "", detachOnSeason: !!it.detachOnSeason,
      visible: it.visible !== false,
      chatBuffXp: ef.chatBuffXp ? String(ef.chatBuffXp) : "", voiceBuffXp: ef.voiceBuffXp ? String(ef.voiceBuffXp) : "",
      attendBuffXp: ef.attendBuffXp ? String(ef.attendBuffXp) : "",
      effects: list.map(draftOf),
    });
  };

  const saveRegItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReg) return;
    if (!itemForm.name.trim()) return notify("이름을 입력해 주세요.", true);
    if ((itemForm.type === "role" || itemForm.type === "perk") && !itemForm.roleId) return notify("연결할 역할을 선택해 주세요.", true);
    // 📌 효과 — 기프트카드를 뺀 모든 아이템(역할 연결 여부와 무관). 값이 빈 줄은 서버가 말없이 버리므로 저장 전에 막는다.
    //    아이템 문서에 같이 저장되므로 늘 보낸다(전부 비운 것도 그대로 저장돼야 지워진다). 기프트카드는 보내지 않는다(서버가 비움)
    const { chatBuffXp, voiceBuffXp, attendBuffXp, effects: effDrafts, ...base } = itemForm;
    let effects: { chatBuffXp: number; voiceBuffXp: number; attendBuffXp: number; list: ReturnType<typeof effectOf>[] } | undefined;
    if (base.type !== "physical") {
      const bad = effDrafts.findIndex((d) => normalizeEffects([effectOf(d)]).length === 0);
      if (bad >= 0) return notify(`추가 효과 ${bad + 1}번째 줄의 값을 입력해 주세요.`, true);
      effects = { chatBuffXp: xpNum(chatBuffXp), voiceBuffXp: xpNum(voiceBuffXp), attendBuffXp: xpNum(attendBuffXp), list: effDrafts.map(effectOf) };
    }
    setIsSavingReg(true);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, roleName: guildRoles.find((r) => r.id === base.roleId)?.name || "", ...(effects ? { effects } : {}) }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSavingReg(false);
    if (res?.ok && d?.success) { setItemForm(EMPTY_ITEM_FORM); fetchRegItems(); fetchAll(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // 표시 토글 — 목록에서 바로 켜고 끈다 (폼을 열지 않아도 되게)
  const [visBusy, setVisBusy] = useState("");
  const toggleRegVisible = async (it: any) => {
    if (visBusy) return;
    setVisBusy(it._id);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // 효과는 빼고 보낸다 — 표시 토글이 아이템 효과를 다시 쓰지 않게(효과가 없으면 서버가 효과 칸을 건드리지 않는다. undefined 는 JSON 에서 빠진다)
      body: JSON.stringify({ ...it, effects: undefined, id: it._id, visible: it.visible === false }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { fetchRegItems(); notify(it.visible === false ? "인벤토리에 표시합니다." : "인벤토리에서 숨깁니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
    setVisBusy("");
  };

  const importInvRoles = async () => {
    if (isImporting) return;
    setIsImporting(true);
    const res = await fetch("/api/admin/items/import", { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsImporting(false);
    if (res?.ok && d?.success) { fetchRegItems(); notify(`${d.imported || 0}개를 가져왔습니다.${d.skipped ? ` (이미 있는 ${d.skipped}개는 건너뜀)` : ""}`); }
    else notify(d?.message || "가져오기에 실패했습니다.", true);
  };

  // 추천 아이템 등록 결과 — 창을 닫고 목록을 다시 불러온다
  const onPresetDone = (d: { created?: string[]; skipped?: string[]; iconsUpdated?: number }) => {
    setPresetOpen(false);
    fetchRegItems();
    const made = d.created?.length || 0;
    const skip = d.skipped?.length || 0;
    const icon = d.iconsUpdated || 0;
    notify([
      made ? `아이템 ${made}개를 등록했습니다.` : icon ? "" : "새로 등록한 아이템이 없습니다.",
      skip ? `이미 있는 ${skip}개는 건너뛰었습니다.` : "",
      icon ? `기존 아이템 아이콘 ${icon}개를 바꿨습니다.` : "",
    ].filter(Boolean).join("\n"));
  };

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/shop/items?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      // 배너는 노출 위치(홈 · 시즌 탭) 구분 없이 전부 — 위치를 안 붙이면 홈 배너만 온다
      fetch("/api/shop/banners?all=1&placement=any", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([it, roles, ord, ban, cou]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      setOrders(Array.isArray(ord?.data) ? ord.data : []);
      setBanners(Array.isArray(ban?.data) ? ban.data : []);
      setCoupons(Array.isArray(cou?.data) ? cou.data : []);
    }).finally(() => setIsLoading(false));
  }, []);

  // ── 이미지 배너 ──────────────────────────────
  // 📌 placement — 노출 위치. home: ARCTIC 홈 맨 위 · season: 스토어 시즌 탭 맨 위 (값이 없는 옛 배너는 홈)
  const EMPTY_BANNER = { id: "", imageUrl: "", mobileImageUrl: "", title: "", subtitle: "", link: "", placement: "home", sortOrder: "", active: true };
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState<any>(EMPTY_BANNER);
  const bannerSize = useImageSize(bannerForm.imageUrl);
  const mBannerSize = useImageSize(bannerForm.mobileImageUrl);
  const mBannerRatio = mBannerSize ? Math.min(M_BANNER_MAX, Math.max(M_BANNER_MIN, mBannerSize.w / mBannerSize.h)) : 2;

  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/banners", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bannerForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setBannerForm(EMPTY_BANNER); fetchAll(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // 목록 줄 → 배너 폼 (예전 '수정' 단추 안의 값 그대로)
  const fillBannerForm = (b: any) =>
    setBannerForm({ id: b._id, imageUrl: b.imageUrl, mobileImageUrl: b.mobileImageUrl || "", title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", placement: b.placement === "season" ? "season" : "home", sortOrder: String(b.sortOrder || 0), active: b.active });

  // ── 쿠폰 ────────────────────────────────────
  const EMPTY_COUPON = { id: "", code: "", name: "", kind: "discount", reward: "", rewardRoleId: "", rewardRoleName: "", rewardXp: "", requiredRoleId: "", requiredRoleName: "", type: "percent", value: "", maxDiscount: "", payScope: "both", minTotal: "", maxUses: "", perUserLimit: "1", active: true, expiresAt: "" };
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponForm, setCouponForm] = useState<any>(EMPTY_COUPON);

  // 쿠폰을 유저 지갑에 지급
  const [issueTarget, setIssueTarget] = useState<any>(null);
  const [issueInput, setIssueInput] = useState("");
  const [isIssuing, setIsIssuing] = useState(false);
  // 전체 지급은 한 번 누르면 서버 전원의 지갑에 들어간다 — 확인을 한 단계 세운다
  const [issueAllConfirm, setIssueAllConfirm] = useState(false);

  const issueCoupon = async (target: string) => {
    if (!issueTarget || isIssuing) return;
    setIsIssuing(true);
    const res = await fetch("/api/shop/coupons/issue", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ couponId: issueTarget._id, target }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "지급했습니다."); setIssueAllConfirm(false); setIssueTarget(null); setIssueInput(""); }
    else notify(d?.message || "지급에 실패했습니다.", true);
    setIsIssuing(false);
  };

  // 예전 '코드'를 보상형 쿠폰으로 옮긴다 (여러 번 눌러도 중복되지 않는다)
  const [isMigrating, setIsMigrating] = useState(false);
  const migrateCodes = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    const res = await fetch("/api/shop/coupons/migrate", { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "이전했습니다."); fetchAll(); }
    else notify(d?.message || "이전에 실패했습니다.", true);
    setIsMigrating(false);
  };

  const saveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/coupons", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(couponForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setCouponForm(EMPTY_COUPON); fetchAll(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // 목록 줄 → 쿠폰 폼 (예전 '수정' 단추 안의 값 그대로 — 만료 일시는 KST 로 바꿔 넣는다. 서버도 KST 로 읽는다)
  const fillCouponForm = (c: any) =>
    setCouponForm({ id: c._id, code: c.code, name: c.name || "", kind: c.kind || "discount", reward: c.reward || "", rewardRoleId: c.rewardRoleId || "", rewardRoleName: c.rewardRoleName || "", rewardXp: c.rewardXp ? String(c.rewardXp) : "", requiredRoleId: c.requiredRoleId || "", requiredRoleName: c.requiredRoleName || "", type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", payScope: c.payScope || "both", minTotal: c.minTotal ? String(c.minTotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit ?? 1), active: c.active, expiresAt: toKstInput(c.expiresAt) });

  // ── 시즌 전환 (디스코드 표기 떼기) ────────────
  //    되돌리려면 역할을 손으로 다시 붙여야 하므로, 미리보기를 통과해야 실행 버튼이 열린다
  const [detachPreview, setDetachPreview] = useState<any>(null);
  // "" | "preview" | "run" — 어느 쪽을 누른 건지 알아야 버튼마다 다른 문구를 띄운다
  const [detachBusy, setDetachBusy] = useState("");
  const [detachConfirm, setDetachConfirm] = useState(false);

  const callDetach = async (dryRun: boolean) => {
    if (detachBusy) return null;
    setDetachBusy(dryRun ? "preview" : "run");
    const res = await fetch("/api/season/detach", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dryRun }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setDetachBusy("");
    if (res?.ok && d?.success) return d;
    notify(d?.message || "처리에 실패했습니다.", true);
    return null;
  };

  const runDetach = async () => {
    if (!detachPreview || detachPreview.matched === 0) return;
    const d = await callDetach(false);
    setDetachConfirm(false);
    if (!d) return;
    // 실행한 목록으로 다시 실행하지 못하게 미리보기를 비운다
    setDetachPreview(null);
    notify(`${(d.updated || 0).toLocaleString()}건의 디스코드 표기를 내렸습니다. 봇이 30초 안에 실제 역할을 정리합니다.`);
  };

  useEffect(() => { if (isAdmin) { fetchAll(); fetchRegItems(); } }, [isAdmin, fetchAll, fetchRegItems]);

  // 📌 역할 버프(관리자 › 레벨 설정 역할 탭) — 연결 역할에 걸려 있으면 효과 칸 · 미리보기에 읽기 전용으로 보여 준다.
  //    아이템 효과와 별개로 그 역할을 가진 사람에게 더해지므로, 모르고 아이템에 같은 값을 또 넣어 두 번 붙지 않게
  const [roleCfgs, setRoleCfgs] = useState<any[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (alive) setRoleCfgs(Array.isArray(d?.data) ? d.data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  // 아이템 효과의 채널 조건용 — 한 번만 읽는다(서버 10분 캐시). 못 읽으면 효과 편집이 채널 ID 입력칸으로 바뀐다
  const [guildChannels, setGuildChannels] = useState<any[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch("/api/discord-channels", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (alive) setGuildChannels(Array.isArray(d?.data) ? d.data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);

  // 목록·링크에서 상품을 폼으로 끌어오는 자리가 두 군데였다 — 한 함수로 모은다
  const fillItemForm = useCallback((it: any) => setForm(formFromShopItem(it)), []);

  // 📌 상점 카드의 '수정' 링크(?edit=<id>)로 들어오면 해당 상품을 폼에 채워 둔다
  //    상세 칸은 처음 한 번만 연다 — 저장 뒤 목록을 다시 불러와도 칸이 저절로 다시 열리지 않게
  const editId = searchParams.get("edit");
  const editOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || items.length === 0) return;
    const it = items.find((x) => x._id === editId);
    if (!it) return;
    fillItemForm(it);
    if (editOpened.current !== editId) { editOpened.current = editId; setPane("product"); }
  }, [editId, items, fillItemForm]);

  // 📌 탭을 옮기면 열린 상세 칸 · 검색어를 비운다 (렌더 중 조정 — 이펙트로 한 박자 늦게 닫히지 않게)
  const [paneTab, setPaneTab] = useState(tab);
  if (paneTab !== tab) {
    setPaneTab(tab);
    setPane("");
    setOrderSelId(null);
    setQ("");
    setIsRoleOpen(false);
  }

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    // 📌 판매 방식마다 꼭 필요한 가격 — 상점 인라인 폼과 같은 문구(productForm saleModeError)
    const bad = saleModeError(form);
    if (bad) return notify(bad, true);
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...toPayload(form, selectedRole?.name || ""), sortOrder: undefined }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { setForm(emptyForm); fetchAll(); fetchRegItems(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const api = { item: "/api/shop/items", banner: "/api/shop/banners", coupon: "/api/shop/coupons", reg: "/api/admin/items" }[deleteTarget.kind];
    const res = await fetch(`${api}?id=${deleteTarget.id}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    // 지운 줄의 상세 칸은 닫는다
    if (res?.ok) { fetchAll(); fetchRegItems(); closePane(); }
    // 아이템은 참조 상품이 있으면 서버가 409 로 막는다 — 이유를 그대로 보여 준다
    else notify(d?.message || "삭제에 실패했습니다.", true);
    setDeleteTarget(null);
  };

  // 📌 주문 처리 — 건 id 여러 개를 한 번에(1개 단위 주문 한 줄의 N건). 서버가 건마다 조건부로 처리하고 처리 · 건너뜀 수를 준다
  const processOrder = async (ids: string[], newStatus: "completed" | "cancelled" | "refunded", note = "") => {
    const res = await fetch("/api/shop/orders", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status: newStatus, adminNote: note }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) {
      fetchAll();
      const n = Number(d.done) || 1;
      const many = n > 1 ? `${n}개를 ` : "";
      const skip = Number(d.skipped) > 0 ? `\n이미 처리했거나 사용한 ${d.skipped}개는 건너뛰었습니다.` : "";
      notify((newStatus === "completed" ? "발송 처리했습니다." : newStatus === "refunded" ? `${many}환불했습니다. 디스코드 역할은 봇이 1분 안에 회수합니다.` : `${many}취소하고 환불했습니다.`) + skip);
    }
    else notify(d?.message || "처리에 실패했습니다.", true);
    setNoteTarget(null); setNoteText(""); setCancelTarget(null);
  };
  // 돌려줄 수 있는 건 — 대기는 취소, 완료는 환불(기프트카드 제외). 이미 쓴 건은 빼고, 최근 것부터
  const cancelPoolOf = (g: any) => {
    const want = g.status === "pending" ? "pending" : "completed";
    return (g.rows || [])
      .filter((r: any) => r.status === want && !r.consumedAt && (want === "pending" || r.itemType !== "physical"))
      .sort((a: any, b: any) => String(b._id).localeCompare(String(a._id)));
  };
  const openCancel = (g: any) => {
    const pool = cancelPoolOf(g);
    if (!pool.length) return notify("돌려줄 수 있는 건이 없습니다. 이미 사용했거나 처리한 건입니다.", true);
    setCancelCount(String(pool.length));
    setCancelTarget({ ...g, pool });
  };

  // ── 순서 바꾸기 ──
  const startReorder = (kind: "reg" | "product") => {
    closePane();
    setOrderDraft((kind === "reg" ? regItems : items).map((it) => String(it._id)));
    setReorder(kind);
  };
  const cancelReorder = () => { setReorder(""); setOrderDraft([]); };
  // 보이는 줄들의 새 순서를, 그 줄들이 원래 차지하던 자리들에 차례로 다시 채운다 — 안 보이는 줄은 제자리
  const applyVisibleOrder = (visible: string[]) => {
    setOrderDraft((prev) => {
      const pos = visible.map((k) => prev.indexOf(k)).filter((p) => p >= 0).sort((a, b) => a - b);
      if (pos.length !== visible.length) return prev;
      const next = prev.slice();
      pos.forEach((p, i) => { next[p] = visible[i]; });
      return next;
    });
  };
  // 초안 순서대로 — 그 사이 새로 생긴 줄(초안에 없음)은 맨 뒤
  const byDraft = (list: any[]) => {
    const at = new Map(orderDraft.map((k, i) => [k, i]));
    return [...list].sort((a, b) => (at.get(String(a._id)) ?? 1e9) - (at.get(String(b._id)) ?? 1e9));
  };
  const saveOrder = async () => {
    if (savingOrder || !reorder) return;
    const kind = reorder;
    setSavingOrder(true);
    const res = await fetch(kind === "reg" ? "/api/admin/items" : "/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: orderDraft }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder(false);
    if (res?.ok && d?.success) {
      // 다시 불러오기 전에 옛 순서가 한 번 비치지 않게 화면 목록부터 맞춘다
      const at = new Map(orderDraft.map((k, i) => [k, i]));
      const put = (list: any[]) => byDraft(list).map((it) => (at.has(String(it._id)) ? { ...it, sortOrder: at.get(String(it._id)) } : it));
      if (kind === "reg") { setRegItems(put); fetchRegItems(); } else { setItems(put); fetchAll(); }
      cancelReorder();
      notify("순서를 저장했습니다.");
    } else notify(d?.message || "순서를 저장하지 못했습니다.", true);
  };

  // ⚠️ 훅을 모두 부른 뒤에 가린다. 이건 화면을 가리는 장치일 뿐이고 실제 방어는 서버(API)에서 한다.
  if (gate) return gate;

  const meta = TAB_META[tab];
  // 📌 주문은 묶음(orderId + 상품 — lib/orderGroups.js)으로 센다 · 보인다. 1개 단위 상품 3개를 한 번에 샀으면 한 줄 "×3"
  const groupCount = (s: string) => groupOrders(orders.filter((o) => o.status === s)).length;
  const pendingCount = groupCount("pending");
  const shownOrdersByStatus = groupOrders(orderFilter ? orders.filter((o) => o.status === orderFilter) : orders);

  const discountPct = Math.min(100, Math.max(0, Number(form.discountPct) || 0));
  // 입력칸 단위 그대로(빙옥 전용이면 빙옥 — XP 로 할인한 뒤 올림, 상점 · 결제와 같은 계산)
  const salePreview = formSalePrice(form, form.price, discountPct);
  const unit = formUnit(form);

  // ── 목록 거르기 ──
  const qq = q.trim().toLowerCase();
  const hit = (...vals: any[]) => !qq || vals.some((v) => String(v ?? "").toLowerCase().includes(qq));
  const roleNameOf = (id: string, fallback?: string) => guildRoles.find((r) => r.id === id)?.name || fallback || id;

  const shownReg = regItems.filter((it) => (!regType || it.type === regType) && hit(it.name, it.description, it.roleId ? roleNameOf(it.roleId, it.roleName) : ""));
  const shownProducts = items.filter((it) => (!productView || (productView === "on" ? !!it.active : !it.active)) && hit(it.name, it.description, it.roleName, typeLabel(it.type)));
  const shownBanners = banners.filter((b) => (!bannerView || (bannerView === "on" ? !!b.active : !b.active)) && hit(b.title, b.subtitle, b.link));
  const couponState = (c: any) => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
    return !c.active ? "중지" : expired ? "만료" : exhausted ? "소진" : "사용 가능";
  };
  const shownCoupons = coupons.filter((c) => (!couponView || couponState(c) === couponView) && hit(c.code, c.name));
  const shownOrders = shownOrdersByStatus.filter((o) => hit(o.itemName, o.userName, o.contact, o.adminNote));

  const noResult = "검색 결과가 없습니다.";
  const orderSel = orderSelId ? shownOrdersByStatus.find((o) => o._id === orderSelId) || null : null;
  const couponSel = couponForm.id ? coupons.find((c) => c._id === couponForm.id) : null;

  // 📌 아이템 등록 — 인벤토리 미리보기는 폼 값을 그대로 따라간다. 효과 줄은 서버(/api/shop/my-items)와 같은 규칙
  //    (describeItemBasic + describeEffect, 기프트카드를 뺀 모든 아이템 — 역할 연결 여부와 무관). 채널 하나짜리 효과는 효과 편집과 같은 채널 이름으로
  const regEffOn = itemForm.type !== "physical";
  const regRoleBuff: string[] = regEffOn && itemForm.roleId ? describeRoleBuff(roleCfgs.find((c) => c.roleId === itemForm.roleId) || {}) : [];
  const regChName = (id: string) => guildChannels.find((c) => c.id === id)?.name as string | undefined;
  const regEffectLines: string[] = regEffOn
    ? [
        ...describeItemBasic({ chatBuffXp: xpNum(itemForm.chatBuffXp), voiceBuffXp: xpNum(itemForm.voiceBuffXp), attendBuffXp: xpNum(itemForm.attendBuffXp) }),
        ...normalizeEffects(itemForm.effects.map(effectOf)).map((e: any) => describeEffect(e, e.channelIds?.length === 1 ? regChName(e.channelIds[0]) : undefined)),
        // 인벤토리처럼 역할 버프 줄도 뒤에 — 역할을 가진 사람에게 실제로 붙는 값
        ...regRoleBuff,
      ]
    : [];
  const regPreviewItem = {
    name: itemForm.name.trim() || "아이템 이름",
    description: itemForm.description.trim(),
    type: itemForm.type,
    icon: itemForm.icon,
    imageUrl: itemForm.imageUrl.trim(),
    // 쓰는 중인 색(#e9 …)은 유형 기본색으로 — 반쯤 친 값이 엉뚱한 색으로 그려지지 않게
    color: /^#[0-9a-f]{6}$/i.test(itemForm.color) ? itemForm.color : "",
  };

  // 새로 만들기 — 수정 중이던 폼이면 비우고, 쓰다 만 새 폼이면 그대로 이어 쓴다
  const openNewReg = () => { if (itemForm.id) setItemForm(EMPTY_ITEM_FORM); setPane("reg"); };
  const openNewProduct = () => { if (form.id) setForm(emptyForm); setIsRoleOpen(false); setPane("product"); };
  const openNewBanner = () => { if (bannerForm.id) setBannerForm(EMPTY_BANNER); setPane("banner"); };
  const openNewCoupon = () => { if (couponForm.id) setCouponForm(EMPTY_COUPON); setPane("coupon"); };

  // ── 표 열 ─────────────────────────────────────
  const regCols: Column<any>[] = [
    {
      key: "name", label: "아이템", mobile: "title",
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={it} />
          <span className="block min-w-0 max-w-[340px]">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`truncate font-bold ${it.visible === false ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>{it.name}</span>
              <TypeBadge type={it.type} className="shrink-0 px-2 py-0.5 text-[10px]" />
            </span>
            {it.description && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{it.description}</span>}
          </span>
        </span>
      ),
    },
    { key: "role", label: "연결 역할", render: (it) => <span className="text-[#5a5a5a]">{it.roleId ? roleNameOf(it.roleId, it.roleName) : "역할 없음"}</span> },
    {
      key: "color", label: "색상",
      render: (it) => {
        const color = it.color || itemTypeColor(it.type);
        return (
          <span className="inline-flex items-center gap-1.5 text-[#5a5a5a] tabular-nums">
            <span className="w-3 h-3 rounded-full border border-black/10 shrink-0" style={{ backgroundColor: color }} />
            {color}
          </span>
        );
      },
    },
    { key: "usage", label: "사용", render: (it) => <span className="text-[#5a5a5a] tabular-nums">상품 {it.usage || 0}{it.passUsage > 0 ? ` · 패스 ${it.passUsage}` : ""}</span> },
    { key: "season", label: "시즌", render: (it) => (it.type === "role" && it.detachOnSeason ? <StatusChip>시즌 뗌</StatusChip> : null) },
    { key: "vis", label: "인벤토리", render: (it) => <VisSwitch on={it.visible !== false} busy={visBusy === it._id} onToggle={() => toggleRegVisible(it)} /> },
  ];

  const productCols: Column<any>[] = [
    {
      key: "name", label: "상품", mobile: "title",
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={it} />
          <span className="block min-w-0 max-w-[320px]">
            <span className="block truncate font-bold">{it.name}</span>
            {/* 등록 아이템 · 1개 단위(1회 최대) — 목록에서 판매 방식이 보이게 */}
            {(it.itemId || isUnitSale(it)) && (
              <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] tabular-nums">
                {[it.itemId && "등록 아이템", isUnitSale(it) && `1개 단위 · 1회 최대 ${maxPerOrderOf(it)}개`].filter(Boolean).join(" · ")}
              </span>
            )}
          </span>
        </span>
      ),
    },
    { key: "status", label: "상태", mobile: "title", render: (it) => <StatusChip tone={it.active ? "ok" : "neutral"}>{it.active ? "판매 중" : "숨김"}</StatusChip> },
    { key: "type", label: "유형 · 역할", render: (it) => <span className="text-[#5a5a5a]">{it.type === "physical" || it.type === "cosmetic" ? typeLabel(it.type) : `${typeLabel(it.type)} · ${it.roleName || it.roleId || "역할 없음"}`}</span> },
    {
      key: "price", label: "가격", align: "right",
      render: (it) => (
        <span className="font-bold tabular-nums whitespace-nowrap">
          {priceText(it, Math.max(0, Math.floor((it.price * (100 - discountPctOf(it))) / 100)))}
          {discountPctOf(it) > 0 && <span className="ml-1 text-[#e91e3f]">-{it.discountPct}%</span>}
          {/* 할인 종료 — 남아 있으면 언제까지, 지났으면 끝났다고 */}
          {it.discountPct > 0 && it.discountUntil && (
            <span className="ml-1 text-[11px] font-bold text-[#8a8a8a]">{discountPctOf(it) > 0 ? `~${discountUntilLabel(it).replace("까지", "")}` : "할인 종료"}</span>
          )}
        </span>
      ),
    },
    { key: "stock", label: "재고", align: "right", render: (it) => <span className="tabular-nums"><ML>재고</ML>{it.stock < 0 ? "무제한" : it.stock}</span> },
    { key: "sold", label: "판매", align: "right", render: (it) => <span className="text-[#5a5a5a] tabular-nums">{it.soldCount || 0}개<span className="md:hidden"> 판매</span></span> },
  ];

  const bannerCols: Column<any>[] = [
    {
      key: "banner", label: "배너", mobile: "title",
      render: (b) => (
        <span className="flex items-center gap-3 min-w-0">
          <span className="block w-24 h-12 rounded-lg bg-[#f2f2f2] overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
          </span>
          <span className="block min-w-0 max-w-[360px]">
            <span className="block truncate font-bold">{b.title || "(제목 없음)"}</span>
            {b.subtitle && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{b.subtitle}</span>}
          </span>
        </span>
      ),
    },
    // 노출 위치 — 값이 없는 옛 배너는 홈
    { key: "placement", label: "위치", render: (b) => <span className="font-bold text-[#5a5a5a]"><ML>위치</ML>{b.placement === "season" ? "시즌 탭" : "홈"}</span> },
    { key: "status", label: "상태", mobile: "title", render: (b) => <StatusChip tone={b.active ? "ok" : "neutral"}>{b.active ? "노출 중" : "숨김"}</StatusChip> },
    { key: "link", label: "이동", render: (b) => (b.link ? <span className="font-bold text-[#5a5a5a]">→ {b.link}</span> : null) },
    { key: "sort", label: "순서", align: "right", render: (b) => <span className="text-[#5a5a5a] tabular-nums"><ML>순서</ML>{b.sortOrder || 0}</span> },
  ];

  const couponCols: Column<any>[] = [
    { key: "state", label: "상태", mobile: "title", render: (c) => { const s = couponState(c); return <StatusChip tone={s === "사용 가능" ? "ok" : "neutral"}>{s}</StatusChip>; } },
    {
      key: "code", label: "코드", mobile: "title",
      render: (c) => (
        <span className="block min-w-0 max-w-[260px]">
          <span className="block truncate font-black">{c.code}</span>
          {c.name && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{c.name}</span>}
        </span>
      ),
    },
    { key: "kind", label: "종류", render: (c) => <StatusChip tone={c.kind === "reward" ? "info" : "neutral"}>{c.kind === "reward" ? "보상형" : "할인형"}</StatusChip> },
    {
      key: "benefit", label: "혜택",
      render: (c) => (
        <span className="font-bold">
          {c.kind === "reward"
            ? [c.rewardRoleName && `역할 ${c.rewardRoleName}`, c.rewardXp > 0 && `${c.rewardXp.toLocaleString()} XP`].filter(Boolean).join(" · ") || "지급 없음"
            : <>
                {c.type === "percent" ? `${c.value}% 할인` : `${c.value.toLocaleString()} XP 할인`}
                {c.type === "percent" && c.maxDiscount > 0 && ` (최대 ${c.maxDiscount.toLocaleString()})`}
                {couponScopeTail(c)}
              </>}
        </span>
      ),
    },
    {
      key: "cond", label: "조건",
      render: (c) =>
        c.kind === "reward" && c.requiredRoleName ? <span className="text-[#5a5a5a]">{c.requiredRoleName} 전용</span>
        : c.kind !== "reward" && c.minTotal > 0 ? <span className="text-[#5a5a5a]">{c.minTotal.toLocaleString()} XP 이상</span>
        : null,
    },
    { key: "used", label: "사용", align: "right", render: (c) => <span className="text-[#5a5a5a] tabular-nums"><ML>사용</ML>{c.usedCount || 0}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""}</span> },
    { key: "per", label: "1인", align: "right", render: (c) => <span className="text-[#5a5a5a]"><ML>1인</ML>{c.perUserLimit === 0 ? "무제한" : `${c.perUserLimit}회`}</span> },
    { key: "exp", label: "만료", render: (c) => (c.expiresAt ? <span className="text-[#8a8a8a] tabular-nums whitespace-nowrap">~ {fmtDateTime(c.expiresAt)}</span> : null) },
  ];

  const orderCols: Column<any>[] = [
    { key: "status", label: "상태", mobile: "title", render: (o) => <StatusChip tone={STATUS_TONE[o.status] || "neutral"}>{STATUS_LABEL[o.status]}</StatusChip> },
    {
      key: "item", label: "상품", mobile: "title",
      render: (o) => (
        <span className="block min-w-0 max-w-[280px]">
          <span className="block truncate font-bold">{o.itemName}{o.qty > 1 && <span className="tabular-nums"> ×{o.qty}</span>}</span>
          {orderSummary(o) && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate tabular-nums">{orderSummary(o)}</span>}
        </span>
      ),
    },
    { key: "type", label: "유형", render: (o) => <span className="text-[#5a5a5a]">{typeLabel(o.itemType)}</span> },
    { key: "user", label: "구매자", render: (o) => <span className="font-bold text-[#5a5a5a]">{o.userName}</span> },
    // 빙옥 전용 상품을 산 건은 빙옥으로 (o.pointOnly — 구매 시점 스냅샷). 여러 개는 돌려주지 않은 개수만큼(paidQty — lib/orderGroups.js)
    { key: "price", label: "금액", align: "right", render: (o) => <span className="font-bold tabular-nums whitespace-nowrap">{priceText(o, (o.price || 0) * (o.paidQty || o.qty || 1))}</span> },
    { key: "at", label: "일시", render: (o) => <span className="text-[#8a8a8a] tabular-nums whitespace-nowrap">{fmtDateTime(o.createdAt)}</span> },
    {
      key: "memo", label: "메모",
      render: (o) =>
        o.error || o.adminNote ? (
          <span className="block min-w-0 max-w-[260px]">
            {o.error && <span className="block truncate font-bold text-[#d01634]">지급 실패: {o.error}</span>}
            {o.adminNote && <span className="block truncate text-[#5a5a5a]">{o.adminNote}</span>}
          </span>
        ) : null,
    },
  ];

  // ── 쿠폰 종류 카드 — 설명을 함께 읽어야 고를 수 있어 알약 대신 카드로 둔다 ──
  const COUPON_KINDS = [
    { v: "discount", l: "할인형", d: "ARCTIC 결제 시 금액 할인" },
    { v: "reward", l: "보상형", d: "입력 즉시 역할·XP 지급" },
  ];

  const newBtn = (onClick: () => void, className = "") => <Btn className={className} onClick={onClick}>새로 만들기</Btn>;
  const ORDER_BTN = "w-[116px]";
  const orderBtns = (kind: "reg" | "product", count: number, onNew: () => void) =>
    reorder === kind ? (
      <>
        <Btn variant="secondary" className={ORDER_BTN} onClick={cancelReorder} disabled={savingOrder}>취소</Btn>
        <Btn className={ORDER_BTN} onClick={saveOrder} disabled={savingOrder}>{savingOrder ? "저장 중..." : "순서 저장"}</Btn>
      </>
    ) : (
      <>
        {/* 상세 칸이 열려 좁아졌을 때는 숨긴다 — 버튼 하나가 더 있으면 도구 줄이 한 줄 더 꺾여 목록이 밀린다 */}
        {!pane && <Btn variant="secondary" className={ORDER_BTN} onClick={() => startReorder(kind)} disabled={count < 2}>순서 바꾸기</Btn>}
        {newBtn(onNew, ORDER_BTN)}
      </>
    );

  return (
    <>
      <AdminPage
        section="ARCTIC"
        // 📌 머리(제목 · 설명)는 탭과 무관하게 고정 — 탭마다 바꾸면 머리 높이가 달라져 탭 줄이 밀린다(메모: tabs-never-move)
        title="상점 관리"
        tabs={
          <AdminTabs
            tabs={TAB_ORDER.map((t) => (t.id === "orders" ? { ...t, n: pendingCount } : t))}
            current={tab}
            hrefOf={(id) => `/admin/shop?tab=${id}`}
          />
        }
      >
        {/* 탭별 설명은 탭 줄 아래 본문 첫 줄에
            📌 설명이 없는 탭(쿠폰)도 한 줄 자리를 지킨다 — 그 탭으로 옮길 때만 아래 검색 · 토글 줄이 한 줄 위로 뛰던 것 */}
        <p aria-hidden={!meta.desc || undefined} className={`mb-4 text-[13px] text-[#5a5a5a] break-keep ${meta.desc ? "" : "invisible"}`}>{meta.desc || "\u00a0"}</p>
        {/* ═══ 아이템 등록 ═══ */}
        {tab === "items" && (
          <>
            <Toolbar
              right={
                <>
                  {pendingInv.length > 0 && (
                    <Btn variant="secondary" onClick={importInvRoles} disabled={isImporting || reorder === "reg"}>
                      <SwapLabel swap={isImporting} to="가져오는 중...">{`표기 역할 가져오기 (${pendingInv.length})`}</SwapLabel>
                    </Btn>
                  )}
                  {/* 📌 추천 아이템 — 상세 칸이 열려 좁을 땐 숨긴다(순서 바꾸기와 같은 이유). 순서 바꾸는 중엔 자리를 지킨 채 잠근다.
                      모바일은 "추천" 두 글자로 — 세 버튼이 한 줄에 들게(폭 고정이라 글자가 바뀌어도 줄이 밀리지 않는다) */}
                  {!pane && (
                    <Btn variant="secondary" className="w-[64px] md:w-[116px]" onClick={() => setPresetOpen(true)} disabled={reorder === "reg"}>
                      <span className="md:hidden">추천</span>
                      <span className="hidden md:inline">추천 아이템</span>
                    </Btn>
                  )}
                  {orderBtns("reg", regItems.length, openNewReg)}
                </>
              }
            >
              <SearchInput value={q} onChange={setQ} placeholder="이름 · 설명 · 역할" />
              <Segmented
                options={[{ v: "", l: "전체", n: regItems.length }, ...ITEM_TYPE_OPTIONS.map((o) => ({ v: o.v, l: o.l, n: regItems.filter((i) => i.type === o.v).length }))]}
                value={regType}
                onChange={setRegType}
              />
            </Toolbar>
            <DataTable
              columns={regCols}
              rows={reorder === "reg" ? byDraft(shownReg) : shownReg}
              rowKey={(it) => it._id}
              onRowClick={reorder === "reg" ? undefined : (it) => { fillRegForm(it); setPane("reg"); }}
              selectedKey={reorder === "reg" ? null : pane === "reg" ? itemForm.id : null}
              onReorder={reorder === "reg" ? applyVisibleOrder : undefined}
              reorderLocked={savingOrder}
              empty={regItems.length === 0 ? "등록된 아이템이 없습니다." : noResult}
            />

            <DetailPane
              open={pane === "reg"}
              onClose={closePane}
              width={520}
              title={itemForm.id ? "아이템 수정" : "아이템 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest} disabled={isSavingReg}>{isSavingReg ? "저장 중..." : itemForm.id ? "수정 저장" : "등록"}</Btn>
                  {itemForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "reg", id: itemForm.id })}>삭제</Btn>}
                </>
              }
            >
              <div className="mb-5">
                <div className={labelClass}>인벤토리 미리보기</div>
                <InventoryItemPreview item={regPreviewItem} effectLines={regEffectLines} />
              </div>
              <form onSubmit={saveRegItem}>
                <Field label={<>이름<Req /></>}>
                  <input type="text" value={itemForm.name} maxLength={40} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="예: 펭귄 칭호" className={inputClass} />
                </Field>
                <Field label="설명">
                  {/* 줄바꿈 그대로 저장 · 표시 (인벤토리 · 상품 상세는 whitespace-pre-line) */}
                  <textarea rows={3} value={itemForm.description} maxLength={300} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                    placeholder="인벤토리에 보이는 설명" className={`${inputClass} resize-none`} />
                  <p className="mt-1 text-right text-[12px] text-[#8a8a8a] tabular-nums">{itemForm.description.length}/300</p>
                </Field>
                <Field label={<>유형<Req /></>}>
                  <Segmented options={ITEM_TYPE_OPTIONS} value={itemForm.type}
                    onChange={(v) => setItemForm({ ...itemForm, type: v, roleId: v === "physical" || v === "cosmetic" ? "" : itemForm.roleId, detachOnSeason: v === "role" ? itemForm.detachOnSeason : false })} />
                </Field>

                {itemForm.type !== "physical" && itemForm.type !== "cosmetic" && (
                  <Field
                    label={<>연결 역할{itemForm.type === "item" ? <Opt /> : <Req />}</>}
                    hint={itemForm.type === "item" ? "역할이 있으면 보유자 인벤토리에 자동 표시되고 지급 시 역할도 붙습니다." : undefined}
                  >
                    <Dropdown
                      theme="light"
                      buttonClassName={DD_BTN}
                      value={itemForm.roleId}
                      onChange={(v) => setItemForm({ ...itemForm, roleId: v })}
                      placeholder="역할을 선택하세요"
                      options={[...(itemForm.type === "item" ? [{ value: "", label: "역할 없음 (사이트 보유)" }] : []), ...guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))]}
                    />
                  </Field>
                )}

                <Field label="아이콘" hint="이미지가 없을 때 쓰입니다">
                  {/* 📌 key — 칸을 연 채 다른 아이템 줄을 누르면 다시 마운트해 탭이 그 아이템 아이콘의 묶음으로 열리게 */}
                  <IconPicker key={itemForm.id || "new"} value={itemForm.icon} onChange={(v) => setItemForm({ ...itemForm, icon: v })} color={itemForm.color || itemTypeColor(itemForm.type)} inputClassName={inputClass} />
                </Field>
                <Field label="이미지 URL">
                  <input type="text" value={itemForm.imageUrl} onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })} placeholder="https://..." className={inputClass} />
                </Field>

                <Field label="표기 색상" hint="비우면 유형 기본색">
                  <div className="flex items-center gap-2">
                    <input type="color" value={itemForm.color || itemTypeColor(itemForm.type)} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })}
                      className="w-10 h-10 shrink-0 rounded-lg border border-[#a3a3a3] bg-white p-1" />
                    <input type="text" value={itemForm.color} maxLength={7} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} placeholder={itemTypeColor(itemForm.type)} className={inputClass} />
                  </div>
                </Field>

                {itemForm.type === "role" && (
                  <Field label="시즌 전환">
                    <Toggle on={itemForm.detachOnSeason} onClick={() => setItemForm({ ...itemForm, detachOnSeason: !itemForm.detachOnSeason })}
                      onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                  </Field>
                )}
                <Field label="인벤토리 표시">
                  <Toggle on={itemForm.visible} onClick={() => setItemForm({ ...itemForm, visible: !itemForm.visible })} onLabel="표시" offLabel="숨김" />
                </Field>

                {/* ── 효과 — 아이템 자체에 저장, 이 아이템을 인벤토리에 가진 사람에게 적용(디스코드 역할 없어도). 기프트카드는 효과가 없어 숨긴다 ── */}
                {itemForm.type !== "physical" && (
                  <section className="mt-2 pt-4 border-t border-[#ededed]">
                    <h3 className="text-[14px] font-black tracking-tight mb-3">효과</h3>
                    <EffectsEditor
                      chatBuffXp={itemForm.chatBuffXp}
                      voiceBuffXp={itemForm.voiceBuffXp}
                      attendBuffXp={itemForm.attendBuffXp}
                      list={itemForm.effects}
                      channels={guildChannels}
                      onChange={(patch) => setItemForm((f) => ({ ...f, ...patch }))}
                    />
                    {regRoleBuff.length > 0 && (
                      <div className="mt-5">
                        <div className={labelClass}>역할 버프</div>
                        <div className="flex items-start justify-between gap-3 rounded-lg bg-[#f7f7f7] px-3.5 py-3 text-[13px]">
                          <span className="min-w-0 font-bold text-[#131313] break-keep">{regRoleBuff.map((l) => <span key={l} className="block">{l}</span>)}</span>
                          <Link href="/admin/bot?tab=roles" className="shrink-0 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313]">레벨 설정 →</Link>
                        </div>
                      </div>
                    )}
                  </section>
                )}
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 상품 관리 ═══ */}
        {tab === "products" && (
          <>
            <Toolbar right={orderBtns("product", items.length, openNewProduct)}>
              <SearchInput value={q} onChange={setQ} placeholder="상품명 · 역할" />
              <Segmented
                options={[
                  { v: "", l: "전체", n: items.length },
                  { v: "on", l: "판매 중", n: items.filter((it) => !!it.active).length },
                  { v: "off", l: "숨김", n: items.filter((it) => !it.active).length },
                ]}
                value={productView}
                onChange={setProductView}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
              <DataTable
                columns={productCols}
                rows={reorder === "product" ? byDraft(shownProducts) : shownProducts}
                rowKey={(it) => it._id}
                onRowClick={reorder === "product" ? undefined : (it) => { fillItemForm(it); setIsRoleOpen(false); setPane("product"); }}
                selectedKey={reorder === "product" ? null : pane === "product" ? form.id : null}
                onReorder={reorder === "product" ? applyVisibleOrder : undefined}
                reorderLocked={savingOrder}
                empty={items.length === 0 ? "등록된 상품이 없습니다." : noResult}
              />
            )}

            <DetailPane
              open={pane === "product"}
              onClose={closePane}
              width={520}
              title={form.id ? "상품 수정" : "상품 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest}>{form.id ? "수정 저장" : "상품 등록"}</Btn>
                  {form.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "item", id: form.id })}>삭제</Btn>}
                </>
              }
            >
              {/* 📌 카드 미리보기 — 상점 카드(ProductCard)를 폼 값 그대로 늘 보여 준다(아이템 등록의 인벤토리 미리보기와 같은 자리).
                     예전엔 아래 버튼을 눌러 창으로 열었고, 그 창은 옛 상자형 카드라 실제 상점과 달랐다. 누를 수 없게 막아 둔다 */}
              <div className="mb-5">
                <div className={labelClass}>카드 미리보기</div>
                <div aria-hidden className="rounded-xl border border-[#ededed] bg-white px-4 py-5 flex justify-center pointer-events-none select-none">
                  <div className="w-[200px]">
                    <ProductCard
                      it={{ ...toPayload(form, ""), _id: form.id || "preview", stock: form.stock === "" ? -1 : Number(form.stock) || 0 }}
                      href="#" wished={false} onWish={() => {}}
                      overlay={!form.active ? <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">숨김</span> : null}
                    />
                  </div>
                </div>
              </div>
              <form onSubmit={saveItem}>
                {/* ── 기본 정보 ── */}
                <PaneSection title="기본 정보">
                  {/* 📌 직접 설정 | 등록된 아이템 — 아이템을 고르면 표기 필드는 채워지고 잠긴다 */}
                  <div className="mb-4">
                    <Segmented options={SOURCE_OPTIONS} value={sourceOf(form)}
                      onChange={(v) => {
                        if (v === sourceOf(form)) return; // 이미 그 상태 — 연결 아이템이 첫 항목으로 바뀌지 않게
                        if (v === "custom") setForm(unlinkItem(form));
                        else if (regItems[0]) setForm(applyItem(form, regItems[0]));
                        else notify("등록된 아이템이 없습니다. 아이템 탭에서 먼저 등록해 주세요.", true);
                      }} />
                    {linked && (
                      <div className="mt-3">
                        <Dropdown
                          theme="light"
                          buttonClassName={DD_BTN}
                          value={form.itemId}
                          onChange={(v) => { const it = regItems.find((x) => x._id === v); if (it) setForm(applyItem(form, it)); }}
                          placeholder="아이템을 선택하세요"
                          options={regItems.map((x) => ({
                            value: x._id, label: x.name, hint: (() => { const ls = itemEffectLines(x); return ls.length ? `${itemTypeLabel(x.type)} · ${ls[0]}${ls.length > 1 ? ` 외 ${ls.length - 1}` : ""}` : itemTypeLabel(x.type); })(),
                            icon: <ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={18} color={x.color || itemTypeColor(x.type)} />,
                          }))}
                        />
                        {/* 📌 고른 아이템의 효과 — 상품을 만들 때 무엇을 파는지 바로 보이게(인벤토리 · 상세와 같은 문장) */}
                        {(() => {
                          const itA = regItems.find((x) => x._id === form.itemId);
                          if (!itA) return null;
                          const lines = itemEffectLines(itA);
                          return (
                            <div className="mt-2 rounded-lg bg-[#f7f7f7] px-3 py-2.5">
                              <p className="text-[11px] font-bold text-[#8a8a8a] mb-1">효과</p>
                              {lines.length ? (
                                <ul className="space-y-0.5">
                                  {lines.map((l, i) => <li key={i} className="text-[12px] font-bold text-[#131313] leading-relaxed break-keep">{l}</li>)}
                                </ul>
                              ) : (
                                <p className="text-[12px] text-[#a3a3a3]">효과 없음</p>
                              )}
                            </div>
                          );
                        })()}
                        <p className={fieldNote}>
                          <Link href="/admin/shop?tab=items" className="font-bold text-[#e91e3f] hover:underline">아이템 등록에서 수정</Link>
                        </p>
                      </div>
                    )}
                  </div>

                  <Field label={<>상품명<Req /></>}>
                    <input type="text" value={form.name} disabled={linked} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: [XP] Boost+" className={inputClass} />
                  </Field>

                  <Field label={<>상품 유형<Req /></>}>
                    {linked
                      ? <TypeBadge type={form.type} className="inline-block px-3 py-1.5 text-[11px]" />
                      : <Segmented options={ITEM_TYPE_OPTIONS} value={form.type} onChange={(v) => setForm(pickProductType(form, v))} />}
                  </Field>

                  <Field label="상품 설명">
                    <textarea rows={2} value={form.description} disabled={linked} onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="상점 카드에 표시될 설명" className={`${inputClass} resize-none`} />
                  </Field>

                  {/* 상품 이미지는 상품 고유 값 — 아이템을 연동해도 따로 넣을 수 있다 */}
                  <Field label="상품 이미지 URL" hint="비우면 아이템 이미지·아이콘">
                    <input type="text" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                      placeholder="https://..." className={inputClass} />
                  </Field>

                  <Field label="아이콘" hint="이미지가 없을 때 카드에 크게">
                    <IconPicker key={`${form.id || "new"}:${form.itemId}`} value={form.icon} disabled={linked} onChange={(v) => setForm({ ...form, icon: v })}
                      color={form.color || itemTypeColor(form.type)} inputClassName={inputClass} />
                  </Field>

                  <Field label="색상" hint="비우면 유형 기본색">
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.color || itemTypeColor(form.type)} disabled={linked} onChange={(e) => setForm({ ...form, color: e.target.value })}
                        className="w-10 h-10 shrink-0 rounded-lg border border-[#a3a3a3] bg-white p-1 disabled:opacity-40" />
                      <input type="text" value={form.color} disabled={linked} maxLength={7} onChange={(e) => setForm({ ...form, color: e.target.value })}
                        placeholder={itemTypeColor(form.type)} className={inputClass} />
                    </div>
                  </Field>

                  {/* 📌 카드 배경 장면(lib/itemBackdrops.js) — 상품 고유 값이라 아이템을 연동해도 고른다. 이미지가 있으면 장면 위에 이미지를 세운다 */}
                  <Field label="배경">
                    <BackdropPicker value={form.backdrop} onChange={(v) => setForm({ ...form, backdrop: v })}
                      color={form.color || itemTypeColor(form.type)} buttonClassName={inputClass} />
                  </Field>

                  {/* 역할 상품일 때만 역할 선택 — 드롭다운이 아래 요소를 덮도록 열릴 때 z를 올린다 */}
                  {(form.type === "role" || form.type === "perk" || form.type === "item") && (
                    <Field label={<>지급할 역할{form.type === "item" ? <Opt /> : <Req />}</>}>
                      <div className={`relative ${isRoleOpen ? "z-50" : ""}`}>
                        <button type="button" disabled={linked} onClick={() => setIsRoleOpen(!isRoleOpen)} className={`${inputClass} flex items-center justify-between gap-3 text-left`}>
                          {selectedRole ? (
                            <span className="flex items-center gap-2.5 min-w-0">
                              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: selectedRole.color }}></span>
                              <span className="font-bold truncate">{selectedRole.name}</span>
                            </span>
                          ) : <span className={linked ? "text-[#8a8a8a]" : "text-[#a3a3a3]"}>{linked ? form.roleName || "역할 없음" : "역할을 선택하세요"}</span>}
                          {!linked && (
                            <svg className={`w-3.5 h-3.5 shrink-0 text-[#a3a3a3] transition-transform ${isRoleOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                            </svg>
                          )}
                        </button>
                        {isRoleOpen && !linked && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setIsRoleOpen(false)}></div>
                            <div className="absolute top-full left-0 w-full mt-1.5 bg-white border border-[#ededed] rounded-lg overflow-hidden shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] z-50 max-h-64 overflow-y-auto">
                              {guildRoles.map((r) => (
                                <button key={r.id} type="button" onClick={() => { setForm(pickRole(form, r.id)); setIsRoleOpen(false); }}
                                  className={`w-full text-left px-3 py-2.5 text-[14px] flex items-center gap-2.5 transition-colors ${form.roleId === r.id ? "bg-[#f2f2f2] text-[#131313] font-bold" : "text-[#5a5a5a] hover:bg-[#f7f7f7] hover:text-[#131313]"}`}>
                                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: r.color }}></span>
                                  {r.name}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </Field>
                  )}
                </PaneSection>

                {/* ── 가격 · 기간 ── */}
                <PaneSection title="가격 · 기간">
                  {/* 📌 빙옥 전용 — 켜면 가격 칸은 빙옥으로 받고 ×10,000 해 XP 로 저장한다. 새 기프트카드는 켜진 채로 시작한다 */}
                  <div className="mb-4">
                    <Toggle on={!!form.pointOnly} onClick={() => setForm(setPointOnly(form, !form.pointOnly))}
                      onLabel="빙옥 전용" offLabel="XP · 빙옥 결제" />
                  </div>
                  {/* 📌 판매 방식 — 무제한 · 기간제 · 기간제 + 무제한 · 1개 단위(수량 판매, lib/unitSale.js). 역할·권한·아이템·꾸미기만 (기프트카드는 기간 · 수량 개념이 없다).
                         고른 방식의 가격 칸만 아래에 나온다. 1개 단위는 역할 없는 아이템 · 꾸미기만 — 못 고르는 상품이면 칸은 그대로 두고 누르면 알린다(칸 수가 바뀌어 줄이 흔들리지 않게) */}
                  {form.type !== "physical" && (
                    <div className="mb-4">
                      <Segmented options={SALE_MODES} value={saleModeOf(form)} disabledValues={unitSaleOk(form) ? undefined : ["unit"]}
                        onChange={(v) => {
                          if (v === "unit" && !unitSaleOk(form)) return notify("1개 단위 판매는 역할이 없는 아이템 · 꾸미기만 할 수 있습니다.", true);
                          setForm(setSaleMode(form, v as any));
                        }} />
                    </div>
                  )}
                  <Two>
                    {/* 무제한 · 1개 단위 · 기프트카드 — 정가 한 칸. 칸 바로 아래 계산 한 줄은 사용자가 요청한 빙옥 계산 안내 */}
                    {!form.timed && (
                      <Field label={<>정가 ({unit})<Req /></>} hint={priceCalc(form, form.price) || undefined}>
                        <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder={form.pointOnly ? "예: 500" : "예: 500000"} className={inputClass} />
                      </Field>
                    )}
                    {/* 기간제 — 7일 · 30일(+ 무제한). 비운 기간은 팔지 않는다 */}
                    {form.timed && ([
                      { k: "price7", l: "7일", ex: form.pointOnly ? "예: 30" : "예: 30000" },
                      { k: "price30", l: "30일", ex: form.pointOnly ? "예: 100" : "예: 100000" },
                      ...(form.withInf ? [{ k: "priceInf", l: "무제한", ex: form.pointOnly ? "예: 500" : "예: 500000" }] : []),
                    ] as { k: "price7" | "price30" | "priceInf"; l: string; ex: string }[]).map(({ k, l, ex }) => {
                      const raw = Number(form[k]) || 0;
                      return (
                        <Field key={k} label={<>{l} 가격 ({unit}){k === "priceInf" && <Req />}</>}
                          hint={raw > 0
                            ? discountPct > 0
                              ? `판매가 ${formSalePrice(form, raw, discountPct).toLocaleString()} ${unit} (${discountPct}% 할인)`
                              : `판매가 ${raw.toLocaleString()} ${unit}`
                            : k === "priceInf" ? undefined : "비우면 이 기간은 팔지 않습니다"}>
                          <input type="number" min={0} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ex} className={inputClass} />
                        </Field>
                      );
                    })}
                    <Field label="할인율 (%)" hint={!form.timed && discountPct > 0 && Number(form.price) > 0 ? <span className="font-bold text-[#e91e3f]">판매가 {salePreview.toLocaleString()} {unit}</span> : undefined}>
                      <input type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} placeholder="0" className={inputClass} />
                    </Field>
                  </Two>
                  {form.timed && (
                    <>
                      {/* 기간 칸은 반 폭이라 계산은 한 줄 요약으로 · 회수는 화면 밖에서 일어나는 일이라 이것만 남긴다 */}
                      {durationsCalc(form) && <p className={`${fieldNote} -mt-2`}>{durationsCalc(form)}</p>}
                      <p className={`${fieldNote} mb-3`}>기간이 지나면 봇이 역할을 자동 회수합니다{form.withInf ? " (무제한은 회수하지 않습니다)" : ""}.</p>
                      {saleModeError(form) && <p className="-mt-1 mb-3 text-[12px] font-bold text-amber-700">{saleModeError(form)}</p>}
                    </>
                  )}
                  {/* 📌 할인 종료 — 그 시각(KST)이 지나면 할인이 저절로 끝난다. 비우면 계속 */}
                  {discountPct > 0 && (
                    <Field label="할인 종료" hint={form.discountUntil && new Date(`${form.discountUntil}:00+09:00`).getTime() <= Date.now() ? <span className="font-bold text-[#d01634]">이미 지난 시각입니다</span> : "비우면 계속"}>
                      <div className="flex items-center gap-2">
                        <input type="datetime-local" value={form.discountUntil} onChange={(e) => setForm({ ...form, discountUntil: e.target.value })} className={inputClass} />
                        {form.discountUntil && <Btn variant="ghost" size="sm" onClick={() => setForm({ ...form, discountUntil: "" })}>지우기</Btn>}
                      </div>
                    </Field>
                  )}

                </PaneSection>

                {/* ── 재고 ── 순서는 목록의 '순서 바꾸기'로 끌어서 정한다 */}
                <PaneSection title="재고">
                  <Two>
                    <Field label="재고">
                      <input type="number" min={-1} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="비우면 무제한" className={inputClass} />
                    </Field>
                    {/* 1개 단위 — 한 결제에서 살 수 있는 최대 개수(재고 옆 칸이라 켜고 꺼도 줄 높이가 같다) */}
                    {form.unitSale && (
                      <Field label="1회 최대">
                        <input type="number" min={1} max={MAX_PER_ORDER} value={form.maxPerOrder} onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })} placeholder="10" className={inputClass} />
                      </Field>
                    )}
                  </Two>
                </PaneSection>

                {/* ── 시즌 동작 ── 기프트카드 · 꾸미기는 뗄 역할이 없으므로 아예 감춘다 */}
                {form.type !== "physical" && form.type !== "cosmetic" && (
                  <PaneSection title="시즌 동작">
                    {/* 시즌 전환 때 디스코드 역할만 떼고 사이트 인벤토리에는 남긴다 (등록된 아이템이면 아이템 설정을 따른다) */}
                    <div className="mb-4">
                      <Toggle disabled={form.type === "perk" || linked} on={form.type !== "perk" && form.detachOnSeason} onClick={() => setForm({ ...form, detachOnSeason: !form.detachOnSeason })}
                        onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                      <p className={fieldNote}>
                        {linked
                          ? "등록된 아이템의 설정을 따릅니다."
                          : form.detachOnSeason
                          ? "소유와 인벤토리는 그대로 두고 디스코드 표기만 뗍니다."
                          : "역할 자체가 기능인 권한 상품은 이대로 두세요."}
                      </p>
                    </div>
                  </PaneSection>
                )}

                {/* 📌 판매 상태는 늘 보이는 마지막 소제목으로 */}
                <PaneSection title="판매 상태">
                  <div className="mb-4">
                    <Toggle on={form.active} onClick={() => setForm({ ...form, active: !form.active })} onLabel="판매 중" offLabel="숨김" />
                  </div>
                </PaneSection>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 이미지 배너 ═══ */}
        {tab === "banners" && (
          <>
            <Toolbar right={newBtn(openNewBanner)}>
              <SearchInput value={q} onChange={setQ} placeholder="제목 · 부제 · 링크" />
              <Segmented
                options={[
                  { v: "", l: "전체", n: banners.length },
                  { v: "on", l: "노출 중", n: banners.filter((b) => !!b.active).length },
                  { v: "off", l: "숨김", n: banners.filter((b) => !b.active).length },
                ]}
                value={bannerView}
                onChange={setBannerView}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
              <DataTable
                columns={bannerCols}
                rows={shownBanners}
                rowKey={(b) => b._id}
                onRowClick={(b) => { fillBannerForm(b); setPane("banner"); }}
                selectedKey={pane === "banner" ? bannerForm.id : null}
                empty={banners.length === 0 ? "등록된 배너가 없습니다." : noResult}
              />
            )}

            <DetailPane
              open={pane === "banner"}
              onClose={closePane}
              width={520}
              title={bannerForm.id ? "배너 수정" : "배너 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest}>{bannerForm.id ? "수정 저장" : "배너 등록"}</Btn>
                  {bannerForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "banner", id: bannerForm.id })}>삭제</Btn>}
                </>
              }
            >
              <form onSubmit={saveBanner}>
                {/* 📌 노출 위치 — 홈: ARCTIC 홈 맨 위 · 시즌 탭: 스토어 시즌 탭 맨 위. 같은 위치의 배너끼리 한 슬라이드로 돈다 */}
                <Field label="노출 위치">
                  <Segmented options={[{ v: "home", l: "홈" }, { v: "season", l: "시즌 탭" }]} value={bannerForm.placement}
                    onChange={(v) => setBannerForm({ ...bannerForm, placement: v })} />
                </Field>

                <Field label={<>배너 이미지 URL<Req /></>}>
                  <input type="text" value={bannerForm.imageUrl} onChange={(e) => setBannerForm({ ...bannerForm, imageUrl: e.target.value })}
                    placeholder="https://..." className={inputClass} />
                  <p className={fieldNote}>
                    권장 크기 <span className="font-bold tabular-nums">2400 × 600 px</span> (4:1) · 최소 1200 × 300 px · JPG/PNG/WebP
                  </p>
                  <p className={fieldNote}>
                    모바일에서는 3:1로 잘립니다 — 글자 · 로고는 가운데 <span className="font-bold">가로 75%</span> 안에.
                  </p>
                  {bannerSize && (() => {
                    const ratio = bannerSize.w / bannerSize.h;
                    const tooSmall = bannerSize.w < 1200;
                    const offRatio = ratio < 3.4 || ratio > 4.6;
                    const ok = !tooSmall && !offRatio;
                    return (
                      <p className={`mt-1.5 text-[12px] font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>
                        현재 이미지 <span className="tabular-nums">{bannerSize.w} × {bannerSize.h} px</span> ({ratio.toFixed(2)}:1)
                        {ok ? " · 적당합니다" : tooSmall ? " · 가로가 1200px보다 작아 흐리게 보일 수 있습니다" : " · 4:1에서 벗어나 위아래가 잘립니다"}
                      </p>
                    );
                  })()}
                </Field>

                {/* 📌 모바일 이미지 — 틀은 이미지 비율 그대로(0.8:1 ~ 3:1). 범위를 벗어나면 그 끝 비율로 잘린다 */}
                <Field label={<>모바일 이미지 URL<Opt /></>}>
                  <input type="text" value={bannerForm.mobileImageUrl} onChange={(e) => setBannerForm({ ...bannerForm, mobileImageUrl: e.target.value })}
                    placeholder="https://..." className={inputClass} />
                  {/* 📌 폰에서는 모바일 이미지가 있는 배너만 돈다(하나도 없으면 PC 이미지) — app/arctic/BannerSlider.tsx */}
                  <p className={fieldNote}>권장 <span className="font-bold tabular-nums">1080 × 720 px</span> (3:2) · 비우면 폰에서는 이 배너가 빠집니다</p>
                  {mBannerSize && (() => {
                    const ratio = mBannerSize.w / mBannerSize.h;
                    const tooSmall = mBannerSize.w < 750;
                    const ok = !tooSmall && ratio >= M_BANNER_MIN && ratio <= M_BANNER_MAX;
                    return (
                      <p className={`mt-1.5 text-[12px] font-bold ${ok ? "text-emerald-700" : "text-amber-700"}`}>
                        현재 이미지 <span className="tabular-nums">{mBannerSize.w} × {mBannerSize.h} px</span> ({ratio.toFixed(2)}:1)
                        {ok ? " · 적당합니다" : tooSmall ? " · 가로가 750px보다 작아 흐리게 보일 수 있습니다" : ratio > M_BANNER_MAX ? " · 3:1보다 넓어 좌우가 잘립니다" : " · 0.8:1보다 좁아 위아래가 잘립니다"}
                      </p>
                    );
                  })()}
                </Field>

                <Two>
                  <Field label={<>제목<Opt /></>}>
                    <input type="text" value={bannerForm.title} onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                      placeholder="예: 시즌 한정 기프트카드" className={inputClass} />
                  </Field>
                  <Field label={<>부제<Opt /></>}>
                    <input type="text" value={bannerForm.subtitle} onChange={(e) => setBannerForm({ ...bannerForm, subtitle: e.target.value })}
                      placeholder="예: 한정 수량 소진 시 조기 마감" className={inputClass} />
                  </Field>
                </Two>
                {/* 제목 · 부제가 어떻게 얹히는지는 아래 미리보기가 그대로 보여 준다 */}

                <Two>
                  <Field label={<>클릭 시 이동<Opt /></>}>
                    {/* 바로 고르기 — 고르면 아래 칸이 그 주소로 채워진다. 목록에 없는 주소면 "직접 입력" */}
                    <Dropdown
                      theme="light"
                      buttonClassName={DD_BTN}
                      value={!bannerForm.link ? "" : bannerLinkOptions(items).some((o) => !o.group && o.value === bannerForm.link) ? bannerForm.link : BANNER_LINK_CUSTOM}
                      onChange={(v) => { if (v !== BANNER_LINK_CUSTOM) setBannerForm({ ...bannerForm, link: v }); }}
                      options={bannerLinkOptions(items)}
                      maxHeight={320}
                    />
                    <input type="text" value={bannerForm.link} onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                      placeholder="/arctic?type=cosmetic 또는 https://…" className={`${inputClass} mt-2`} />
                  </Field>
                  <Field label="노출 순서" hint="작을수록 먼저 노출">
                    <input type="number" value={bannerForm.sortOrder} onChange={(e) => setBannerForm({ ...bannerForm, sortOrder: e.target.value })}
                      placeholder="0" className={inputClass} />
                  </Field>
                </Two>

                <Field label="노출 상태">
                  <Toggle on={bannerForm.active} onClick={() => setBannerForm({ ...bannerForm, active: !bannerForm.active })}
                    onLabel="노출 중" offLabel="숨김" />
                </Field>

                {/* 미리보기 */}
                {bannerForm.imageUrl && (
                  <Field label="미리보기">
                    <div className="relative rounded-lg overflow-hidden border border-[#ededed] aspect-[4/1] bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bannerForm.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {(bannerForm.title || bannerForm.subtitle) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-5">
                          {bannerForm.title && <h3 className="text-[16px] font-black tracking-tight text-[#131313] mb-1">{bannerForm.title}</h3>}
                          {bannerForm.subtitle && <p className="text-[12px] text-[#131313]/85">{bannerForm.subtitle}</p>}
                        </div>
                      )}
                    </div>
                  </Field>
                )}
                {bannerForm.mobileImageUrl && (
                  <Field label="모바일 미리보기">
                    <div className="relative w-[280px] max-w-full rounded-lg overflow-hidden border border-[#ededed] bg-white" style={{ aspectRatio: String(mBannerRatio) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={bannerForm.mobileImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      {(bannerForm.title || bannerForm.subtitle) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-5">
                          {bannerForm.title && <h3 className="text-[16px] font-black tracking-tight text-[#131313] mb-1">{bannerForm.title}</h3>}
                          {bannerForm.subtitle && <p className="text-[11px] text-[#131313]/85">{bannerForm.subtitle}</p>}
                        </div>
                      )}
                    </div>
                  </Field>
                )}
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 쿠폰 관리 ═══ */}
        {tab === "coupons" && (
          <>
            <Toolbar
              right={
                <>
                  <Btn variant="secondary" onClick={migrateCodes} disabled={isMigrating}>
                    <SwapLabel swap={isMigrating} to="이전 중...">예전 코드 가져오기</SwapLabel>
                  </Btn>
                  {newBtn(openNewCoupon)}
                </>
              }
            >
              <SearchInput value={q} onChange={setQ} placeholder="코드 · 이름" />
              <Segmented
                options={[
                  { v: "", l: "전체", n: coupons.length },
                  ...["사용 가능", "중지", "만료", "소진"].map((s) => ({ v: s, l: s, n: coupons.filter((c) => couponState(c) === s).length })),
                ]}
                value={couponView}
                onChange={setCouponView}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
              <DataTable
                columns={couponCols}
                rows={shownCoupons}
                rowKey={(c) => c._id}
                onRowClick={(c) => { fillCouponForm(c); setPane("coupon"); }}
                selectedKey={pane === "coupon" ? couponForm.id : null}
                empty={coupons.length === 0 ? "발급된 쿠폰이 없습니다." : noResult}
              />
            )}

            <DetailPane
              open={pane === "coupon"}
              onClose={closePane}
              width={520}
              title={couponForm.id ? "쿠폰 수정" : "쿠폰 발급"}
              footer={
                <>
                  <Btn onClick={submitNearest}>{couponForm.id ? "수정 저장" : "쿠폰 발급"}</Btn>
                  {couponSel && couponSel.kind !== "reward" && (
                    <Btn variant="secondary" onClick={() => { setIssueTarget(couponSel); setIssueInput(""); }}>지급</Btn>
                  )}
                  {couponForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "coupon", id: couponForm.id })}>삭제</Btn>}
                </>
              }
            >
              <form onSubmit={saveCoupon}>
                <PaneSection title="쿠폰">
                  <Two>
                    <Field label={<>쿠폰 코드<Req /></>} hint="대문자로 저장됩니다">
                      <input type="text" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                        placeholder="예: WELCOME10" className={`${inputClass} uppercase`} />
                    </Field>
                    <Field label="쿠폰 이름" hint="주문서에 표시될 이름">
                      <input type="text" value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                        placeholder="예: 신규 가입 축하 쿠폰" className={inputClass} />
                    </Field>
                  </Two>

                  {/* 쿠폰 종류 — 보상형(역할·XP 지급) / 할인형(결제 할인) */}
                  <Field label={<>쿠폰 종류<Req /></>}>
                    <div className="grid grid-cols-2 gap-2">
                      {COUPON_KINDS.map((o) => {
                        const on = (couponForm.kind || "discount") === o.v;
                        return (
                          <button key={o.v} type="button" aria-pressed={on} onClick={() => setCouponForm({ ...couponForm, kind: o.v })}
                            className={`min-w-0 px-3.5 py-2.5 rounded-lg text-left border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
                              on ? "border-[#131313] ring-1 ring-[#131313]" : "border-[#a3a3a3] hover:border-[#131313]"
                            }`}>
                            <span className={`block text-[13px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{o.l}</span>
                            <span className="block mt-0.5 text-[12px] text-[#5a5a5a] break-keep">{o.d}</span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </PaneSection>

                {couponForm.kind === "reward" ? (
                  /* ── 보상형 설정 ── */
                  <PaneSection title="보상">
                    <Field label="안내 문구" hint="유저가 쿠폰을 쓴 직후 보게 될 문구">
                      <input type="text" value={couponForm.reward || ""} onChange={(e) => setCouponForm({ ...couponForm, reward: e.target.value })}
                        placeholder="예: 시즌 참가 보상이 지급되었습니다" className={inputClass} />
                    </Field>
                    <Two>
                      <Field label="지급할 역할">
                        <select value={couponForm.rewardRoleId || ""}
                          onChange={(e) => setCouponForm({ ...couponForm, rewardRoleId: e.target.value, rewardRoleName: guildRoles.find((r) => r.id === e.target.value)?.name || "" })}
                          className={inputClass}>
                          <option value="">지급 안 함</option>
                          {guildRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </Field>
                      <Field label="지급할 XP" hint="역할·XP 중 하나는 지정해야 합니다">
                        <input type="number" min={0} value={couponForm.rewardXp || ""} onChange={(e) => setCouponForm({ ...couponForm, rewardXp: e.target.value })}
                          placeholder="0" className={inputClass} />
                      </Field>
                    </Two>
                    <Field label="사용 조건 역할" hint="지정하면 해당 역할 보유자만 사용할 수 있습니다">
                      <select value={couponForm.requiredRoleId || ""}
                        onChange={(e) => setCouponForm({ ...couponForm, requiredRoleId: e.target.value, requiredRoleName: guildRoles.find((r) => r.id === e.target.value)?.name || "" })}
                        className={inputClass}>
                        <option value="">제한 없음</option>
                        {guildRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </Field>
                  </PaneSection>
                ) : (
                  /* ── 할인형 설정 ── */
                  <PaneSection title="할인">
                    <Field label={<>할인 방식<Req /></>}>
                      <Segmented
                        options={[{ v: "percent", l: "정률 (%)" }, { v: "flat", l: "정액 (XP)" }]}
                        value={couponForm.type}
                        onChange={(v) => setCouponForm({ ...couponForm, type: v })}
                      />
                    </Field>
                    {/* 📌 할인 범위 — 결제 수단 기준(lib/shopPricing COUPON_SCOPES · lib/shopPay planPayment) */}
                    <Field label="적용 결제">
                      <Segmented options={COUPON_SCOPES} value={couponForm.payScope || "both"} onChange={(v) => setCouponForm({ ...couponForm, payScope: v })} />
                    </Field>
                    <Two>
                      <Field label={<>할인 값<Req /></>} hint={couponForm.type === "percent" ? "주문 금액의 %" : "차감할 XP"}>
                        <input type="number" min={1} max={couponForm.type === "percent" ? 100 : undefined}
                          value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })}
                          placeholder={couponForm.type === "percent" ? "10" : "50000"} className={inputClass} />
                      </Field>
                      <Field label="최대 할인액" hint="정률일 때만 상한 적용">
                        <input type="number" min={0} value={couponForm.maxDiscount} disabled={couponForm.type !== "percent"}
                          onChange={(e) => setCouponForm({ ...couponForm, maxDiscount: e.target.value })}
                          placeholder="0 = 제한 없음" className={inputClass} />
                      </Field>
                    </Two>
                  </PaneSection>
                )}

                <PaneSection title="한도 · 상태">
                  <Two>
                    {couponForm.kind !== "reward" && (
                      <Field label="최소 주문 금액">
                        <input type="number" min={0} value={couponForm.minTotal} onChange={(e) => setCouponForm({ ...couponForm, minTotal: e.target.value })}
                          placeholder="0" className={inputClass} />
                      </Field>
                    )}
                    <Field label="전체 사용 한도">
                      <input type="number" min={0} value={couponForm.maxUses} onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })}
                        placeholder="0 = 무제한" className={inputClass} />
                    </Field>
                    <Field label="1인당 사용 횟수" hint="0 = 무제한">
                      <input type="number" min={0} value={couponForm.perUserLimit} onChange={(e) => setCouponForm({ ...couponForm, perUserLimit: e.target.value })}
                        placeholder="1" className={inputClass} />
                    </Field>
                    <Field label="만료 일시" hint="비우면 무기한">
                      <input type="datetime-local" value={couponForm.expiresAt} onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                        className={inputClass} />
                    </Field>
                  </Two>
                  <Field label="사용 상태">
                    <Toggle on={couponForm.active} onClick={() => setCouponForm({ ...couponForm, active: !couponForm.active })}
                      onLabel="사용 가능" offLabel="사용 중지" />
                  </Field>
                </PaneSection>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 구매 내역 ═══ */}
        {tab === "orders" && (
          <>
            <Toolbar>
              <SearchInput value={q} onChange={setQ} placeholder="상품 · 구매자 · 메모" />
              <Segmented
                options={[
                  { v: "", l: "전체", n: groupOrders(orders).length },
                  { v: "pending", l: "대기", n: pendingCount },
                  { v: "completed", l: "완료", n: groupCount("completed") },
                  { v: "cancelled", l: "취소", n: groupCount("cancelled") },
                  { v: "refunded", l: "환불", n: groupCount("refunded") },
                  { v: "expired", l: "만료", n: groupCount("expired") },
                ]}
                value={orderFilter}
                onChange={setOrderFilter}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
              <DataTable
                columns={orderCols}
                rows={shownOrders}
                rowKey={(o) => o._id}
                onRowClick={(o) => { setOrderSelId(o._id); setPane("order"); }}
                selectedKey={pane === "order" ? orderSelId : null}
                empty={orders.length === 0 || !qq ? "구매 내역이 없습니다." : noResult}
              />
            )}

            {/* 📌 줄을 누르면 수령 정보 · 메모 · 처리 단추가 상세 칸에 모인다 (예전엔 줄마다 펼쳐 놓아 목록이 길어졌다) */}
            <DetailPane
              open={pane === "order" && !!orderSel}
              onClose={closePane}
              title={orderSel ? `${orderSel.itemName}${orderSel.qty > 1 ? ` ×${orderSel.qty}` : ""}` : ""}
              sub={orderSel ? `${orderSel.userName} · ${fmtDateTime(orderSel.createdAt)}` : undefined}
              badge={orderSel ? <StatusChip tone={STATUS_TONE[orderSel.status] || "neutral"}>{STATUS_LABEL[orderSel.status]}</StatusChip> : undefined}
              footer={
                orderSel && (orderSel.status === "pending" || (orderSel.status === "completed" && orderSel.itemType !== "physical")) ? (
                  <>
                    {orderSel.status === "pending" && orderSel.itemType === "physical" && (
                      <Btn onClick={() => { setNoteTarget(orderSel); setNoteText(""); }}>발송 처리</Btn>
                    )}
                    {orderSel.status === "pending" && (
                      <Btn variant="secondary" onClick={() => openCancel(orderSel)}>취소·환불</Btn>
                    )}
                    {orderSel.status === "completed" && orderSel.itemType !== "physical" && (
                      <Btn variant="secondary" onClick={() => openCancel(orderSel)}>환불</Btn>
                    )}
                  </>
                ) : undefined
              }
            >
              {orderSel && (
                <dl>
                  <DefRow k="유형">{typeLabel(orderSel.itemType)}</DefRow>
                  <DefRow k="구매자">{orderSel.userName}</DefRow>
                  {/* 1개 단위 주문 — 수량과 쓴 · 돌려준 개수 */}
                  {orderSel.qty > 1 && <DefRow k="수량"><span className="tabular-nums">{orderSel.qty}개{orderSummary(orderSel) ? ` · ${orderSummary(orderSel)}` : ""}</span></DefRow>}
                  {orderSel.qty === 1 && orderSel.consumedAt && <DefRow k="사용"><span className="tabular-nums">{fmtDateTime(orderSel.consumedAt)}</span></DefRow>}
                  <DefRow k="금액"><span className="tabular-nums">{priceText(orderSel, (orderSel.price || 0) * (orderSel.paidQty || orderSel.qty || 1))}</span></DefRow>
                  <DefRow k="일시"><span className="tabular-nums">{fmtDateTime(orderSel.createdAt)}</span></DefRow>
                  {orderSel.error && <DefRow k="지급 실패"><span className="text-[#d01634]">{orderSel.error}</span></DefRow>}
                  {orderSel.contact && <DefRow k="수령 정보"><span className="font-normal whitespace-pre-wrap break-words">{orderSel.contact}</span></DefRow>}
                  {orderSel.adminNote && <DefRow k="메모"><span className="font-normal">{orderSel.adminNote}</span></DefRow>}
                </dl>
              )}
            </DetailPane>
          </>
        )}

        {/* ═══ 시즌 전환 ═══ */}
        {tab === "season" && (
          <Panel
            title="디스코드 역할 떼기"
            desc="소유와 사이트 인벤토리는 그대로 두고 디스코드 표기만 내립니다. 권한 상품과 보호 역할은 빠지며, 실제 제거는 봇이 30초 주기로 처리합니다."
            right={
              <>
                <Btn variant="secondary" disabled={!!detachBusy}
                  onClick={async () => { const d = await callDetach(true); if (d) setDetachPreview(d); }}>
                  <SwapLabel swap={detachBusy === "preview"} to="확인 중...">대상 미리보기</SwapLabel>
                </Btn>
                <Btn variant="danger" onClick={() => setDetachConfirm(true)}
                  disabled={!detachPreview || detachPreview.matched === 0 || !!detachBusy}>
                  <SwapLabel swap={detachBusy === "run"} to="처리 중...">디스코드 역할 떼기 실행</SwapLabel>
                </Btn>
              </>
            }
            flush
          >
            {!detachPreview ? (
              <p className="px-5 py-4 text-[13px] text-[#5a5a5a]">먼저 대상을 미리보기 해야 실행할 수 있습니다.</p>
            ) : detachPreview.matched === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-[#5a5a5a]">표기를 뗄 대상이 없습니다.</p>
            ) : (
              <div className="divide-y divide-[#ededed]">
                {detachPreview.items.map((row: any) => (
                  <div key={`${row.roleId}-${row.itemName}`} className="flex items-center gap-4 px-5 py-3 text-[13px]">
                    <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
                      <p className="font-bold truncate md:w-72 md:shrink-0">{row.itemName}</p>
                      <p className="mt-0.5 md:mt-0 text-[12px] md:text-[13px] text-[#5a5a5a] truncate md:flex-1 md:min-w-0">
                        {guildRoles.find((r) => r.id === row.roleId)?.name || row.roleId}
                      </p>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums">{row.count.toLocaleString()}건</span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-5 py-3.5 text-[13px] font-black">
                  <span>합계</span>
                  <span className="tabular-nums text-[#e91e3f]">{detachPreview.matched.toLocaleString()}건</span>
                </div>
              </div>
            )}
          </Panel>
        )}
      </AdminPage>

      {/* ── 삭제 확인 ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="삭제 확인"
        confirmLabel="삭제"
        body={
          deleteTarget?.kind === "item" ? <>이 상품을 삭제하시겠습니까?<br />기존 구매 내역은 그대로 유지됩니다.</>
          : deleteTarget?.kind === "reg" ? <>이 아이템을 삭제하시겠습니까?<br />이 아이템을 쓰는 상품이 있으면 삭제되지 않습니다.</>
          : deleteTarget?.kind === "banner" ? <>이 배너를 삭제하시겠습니까?</>
          : <>이 쿠폰을 삭제하시겠습니까?<br />이미 사용된 내역에는 영향이 없습니다.</>
        }
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* ── 구매 취소·환불 확인 — XP를 되돌려 주는 조작이라 한 번 묻는다 ── */}
      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title={cancelTarget?.status === "completed" ? "환불" : "구매 취소 · 환불"}
        confirmLabel={cancelTarget?.status === "completed" ? "환불" : "취소하고 환불"}
        body={cancelTarget ? (() => {
          // 📌 1개 단위 주문은 개수를 고른다(기본 전부) — 안 쓴 건 중 최근 것부터 그만큼. 금액 · 캐시백은 고른 건들의 합
          const pool: any[] = cancelTarget.pool || [];
          const n = Math.min(pool.length, Math.max(1, Math.floor(Number(cancelCount) || 0)));
          const picked = pool.slice(0, n);
          // 서버(orders)는 billed 면 몫이 0 이어도 그 몫을 돌려준다 — 확인창도 같은 값을 보여야 한다
          const split = (r: any) => !!r.billed || (r.paidXp || 0) > 0 || (r.paidPoint || 0) > 0;
          const xp = picked.reduce((s, r) => s + (split(r) ? r.paidXp || 0 : r.price || 0), 0);
          const pt = picked.reduce((s, r) => s + (split(r) ? r.paidPoint || 0 : 0), 0);
          const cb = picked.reduce((s, r) => s + (r.cashbackXp || 0), 0);
          return (
            <>
              <span className="block font-bold text-[#131313]">{cancelTarget.itemName}{cancelTarget.qty > 1 ? ` ×${cancelTarget.qty}` : ""}</span>
              <span className="block mb-3">
                {cancelTarget.userName} · {[xp > 0 && `${xp.toLocaleString()} XP`, pt > 0 && `${pt.toLocaleString()} 빙옥`].filter(Boolean).join(" + ") || (cancelTarget.pointOnly ? "0 빙옥" : "0 XP")} 환불
                {/* 결제 때 돌려준 캐시백은 환불에서 뺀다(app/api/shop/orders) */}
                {cb > 0 && ` · 캐시백 ${cb.toLocaleString()} XP 회수`}
              </span>
              {pool.length > 1 && (
                <span className="flex items-center gap-2 mb-3">
                  {/* 칸의 값 = 실제로 돌려줄 개수 — 1 ~ 돌려줄 수 있는 개수로 자른다(지우는 중인 빈칸은 두고, 칸을 떠나면 채운다) */}
                  <input type="number" min={1} max={pool.length} value={cancelCount}
                    onChange={(e) => setCancelCount(e.target.value === "" ? "" : String(Math.min(pool.length, Math.max(1, Math.floor(Number(e.target.value) || 0)))))}
                    onBlur={() => setCancelCount(String(n))} className={numClass} aria-label="개수" />
                  <span className="tabular-nums">/ {pool.length}개</span>
                </span>
              )}
              {cancelTarget.status === "completed"
                ? "결제한 XP·빙옥을 돌려주고 디스코드 역할은 봇이 회수합니다."
                : "결제한 XP·빙옥을 돌려주고 재고를 되돌립니다."}
            </>
          );
        })() : null}
        onConfirm={() => {
          if (!cancelTarget) return;
          const pool: any[] = cancelTarget.pool || [];
          const n = Math.min(pool.length, Math.max(1, Math.floor(Number(cancelCount) || 0)));
          processOrder(pool.slice(0, n).map((r) => String(r._id)), cancelTarget.status === "completed" ? "refunded" : "cancelled");
        }}
        onCancel={() => setCancelTarget(null)}
      />

      {/* ── 시즌 전환 실행 확인 — 무엇이 얼마나 바뀌는지 보여 준 뒤 묻는다 ── */}
      <ConfirmDialog
        open={detachConfirm}
        danger
        busy={detachBusy === "run"}
        title="디스코드 역할 떼기"
        confirmLabel="실행"
        body={detachPreview ? (
          <>
            <span className="block mb-3">
              구매 <span className="font-bold text-[#131313] tabular-nums">{detachPreview.matched.toLocaleString()}건</span>의 디스코드 역할 표기를 내립니다.
            </span>
            <span className="block border-y border-[#ededed] py-2 mb-3 max-h-40 overflow-y-auto no-bar">
              {detachPreview.items.slice(0, 6).map((row: any) => (
                <span key={`${row.roleId}-${row.itemName}`} className="flex items-center justify-between gap-3 py-1 text-[12px]">
                  <span className="truncate font-bold text-[#131313]">{row.itemName}</span>
                  <span className="shrink-0 font-bold text-[#e91e3f] tabular-nums">{row.count.toLocaleString()}건</span>
                </span>
              ))}
              {detachPreview.items.length > 6 && (
                <span className="block pt-1 text-[12px] text-[#8a8a8a]">외 {detachPreview.items.length - 6}종</span>
              )}
            </span>
            소유와 사이트 인벤토리는 그대로 유지되지만, 되돌리려면 역할을 손으로 다시 붙여야 합니다.
          </>
        ) : null}
        onConfirm={runDetach}
        onCancel={() => setDetachConfirm(false)}
      />

      {/* ── 쿠폰 지급 ── 모바일 상세 판(z-120) 위에 뜨도록 z-125, 확인 모달(z-130)보다는 아래 */}
      {issueTarget && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 p-4 overlay-in">
          <div role="dialog" aria-modal="true" aria-label="쿠폰 지급" className="bg-white border border-[#ededed] rounded-2xl w-full max-w-sm p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
            <h2 className="text-[17px] font-black tracking-tight">쿠폰 지급</h2>
            <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">
              <span className="font-black text-[#131313]">{issueTarget.code}</span>
              {issueTarget.name ? ` · ${issueTarget.name}` : ""}
            </p>

            <div className="mt-5">
              <div className={labelClass}>지급 대상</div>
              <input type="text" value={issueInput} onChange={(e) => setIssueInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && issueInput.trim()) issueCoupon(issueInput.trim()); }}
                placeholder="디스코드 닉네임 또는 유저 ID" className={inputClass} />
              <p className={fieldNote}>XP 기록이 있는 유저만 검색되고, 이미 보유 중이면 건너뜁니다.</p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setIssueTarget(null)}>닫기</Btn>
              <Btn onClick={() => issueCoupon(issueInput.trim())} disabled={!issueInput.trim() || isIssuing}>
                {isIssuing ? "지급 중..." : "지급"}
              </Btn>
            </div>
            {/* 바로 실행하지 않는다 — 확인 모달을 거친다 */}
            <div className="mt-4 pt-4 border-t border-[#ededed]">
              <Btn variant="secondary" onClick={() => setIssueAllConfirm(true)} disabled={isIssuing} className="w-full">
                전체 유저에게 지급
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 전체 지급 확인 — 한 번에 전 유저 지갑에 들어가고 회수할 방법이 없다 ── */}
      <ConfirmDialog
        open={issueAllConfirm}
        danger
        busy={isIssuing}
        title="전체 유저에게 지급"
        confirmLabel="지급"
        body={issueTarget ? (
          <>
            <span className="block font-black text-[#131313]">{issueTarget.code}</span>
            {issueTarget.name && <span className="block mb-3">{issueTarget.name}</span>}
            XP 기록이 있는 전 유저의 지갑에 들어가며, 지급 후에는 되돌릴 수 없습니다.
          </>
        ) : null}
        onConfirm={() => issueCoupon("all")}
        onCancel={() => setIssueAllConfirm(false)}
      />

      {/* ── 기프트카드 발송 처리 ── (z-125: 모바일 상세 판 위) */}
      {noteTarget && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 p-4 overlay-in">
          <div role="dialog" aria-modal="true" aria-label="발송 처리" className="bg-white border border-[#ededed] rounded-2xl w-full max-w-sm p-6 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]">
            <h2 className="text-[17px] font-black tracking-tight">발송 처리</h2>
            <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">{noteTarget.userName} · {noteTarget.itemName}</p>
            {noteTarget.contact && (
              <div className="mt-4 text-[13px] text-[#5a5a5a] bg-[#f2f2f2] rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{noteTarget.contact}</div>
            )}
            <input type="text" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="운송장 번호 등 메모 (선택)"
              className={`${inputClass} mt-4`} />
            <div className="mt-6 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => setNoteTarget(null)}>닫기</Btn>
              <Btn onClick={() => processOrder(noteTarget.ids || [noteTarget._id], "completed", noteText)}>완료 처리</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── 추천 아이템 불러오기 ── (z-125: 알림 모달(z-130) 아래) */}
      {presetOpen && <PresetDialog onClose={() => setPresetOpen(false)} onDone={onPresetDone} notify={notify} />}

      {noticeEl}
    </>
  );
}
