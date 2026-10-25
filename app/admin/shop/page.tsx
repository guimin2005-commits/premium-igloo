"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { discountPctOf, discountUntilLabel, priceText, applyDiscount, COUPON_SCOPES, couponScopeTail } from "@/lib/shopPricing";
import { saleEnded, saleUntilLabel } from "@/lib/saleWindow";
import { POINT_RATE, pointToXp, xpToPoint } from "@/lib/pointRate";
import Dropdown, { type DropdownOption } from "../../components/Dropdown";
import ItemIcon, { ArtIcon } from "../../components/ItemIcon";
import IconPicker from "../../components/IconPicker";
import { artOfSkin, artOfScene, artOfFrame, frameImageOf, cosmeticAutoOf, legacyFrameArtOf, cosmeticIconOf, cosmeticKeysOf } from "@/lib/cosmeticArt";
import BackdropPicker from "../../components/BackdropPicker";
import ProductCard from "../../arctic/ProductCard";
import StoreCardArt, { BundleArt, bundlePartsOf } from "../../arctic/CardArt";
import { itemIndexOf, productGroupOf, anchorItemOf, productRowsOf, normalizeProductOrder } from "@/lib/productOrder";
import { InventoryItemPreview } from "../../components/Inventory";
import EffectTemplatesSheet, { useEffectTemplates } from "./EffectTemplatesSheet";
import { useSession } from "next-auth/react";
import { FitBox, ProfileCardPreview, whoOf, useTodayXp } from "../../arctic/CosmeticPreview";
import { BACKDROP_OF } from "@/lib/itemBackdrops";
import { ITEM_TYPE_OPTIONS, STORE_TYPE_OPTIONS, itemTypeLabel, itemTypeColor, normalizeItemGroup, ITEM_GROUP_MAX, ITEM_NAME_MAX, DESCRIPTION_MAX, copyNameOf } from "@/lib/items";
import { CATEGORY_OPTIONS, CATEGORY_MAX, normalizeCategory, resolveCategory, shortNameOf } from "@/lib/itemCategory";
import { RARITIES, normalizeRarity, rarityOf, rarityRank } from "@/lib/rarity";
import {
  TRIGGERS, TRIGGER_OF, EFFECT_KINDS, SKINS, SCENES, FRAMES, FIELD_RANGE, DAY_LABELS, MAX_EFFECTS, amountMaxOf,
  normalizeEffects, describeEffect, againXpOf, describeItemBasic, CANDY_TIERS, CANDY_TIER_MAX, CANDY_XP_MAX, normalizeCandyTiers, describeRoleBuff, cashbackRuleOf, hasConsumable, skinsOf, scenesOf, framesOf,
  FRAME_ALL, SKIN_RANK_ALL,
  effectLinesOf, autoEffectLinesOf, normalizeEffectText, EFFECT_TEXT_MAX, EFFECT_TEXT_LINE_MAX,
  COSMETIC_SCOPES, normalizeScope, autoScopeOf, scopeLabelOf, scopeNotesOf, isCosmeticItem,
} from "@/lib/itemEffects";
import {
  EMPTY_PRODUCT_FORM, SOURCE_OPTIONS, sourceOf, isLinked, formFromShopItem,
  pickType as pickProductType, applyItem, unlinkItem, customSnapOf, type CustomSnap, toPayload, toKstInput,
  setPointOnly, formUnit, formSalePrice, priceCalc, durationsCalc,
  SALE_MODES, saleModeOf, setSaleMode, saleModeError, unitSaleOk, pickRole,
  PRODUCT_TYPE_OPTIONS, isBundleForm, newBundleRow, bundleError, bundleValueSum, bundleBlankValues, canStackInBundle, BUNDLE_VALUE_ERROR,
} from "../../arctic/productForm";
import { isUnitSale, maxPerOrderOf, MAX_PER_ORDER, unitSaleAllowed } from "@/lib/unitSale";
import { groupOrders, orderSummary } from "@/lib/orderGroups";
import { BUNDLE_TYPE, BUNDLE_MAX, BUNDLE_QTY_MAX, BUNDLE_DAYS_MAX, isBundle } from "@/lib/bundle";
import { groupList, moveUnit, moveInGroup, moveToGroup, groupUnitKey, itemUnitKey, nestParents, orderParentBlocks, parentList, orderGroupsNested } from "@/lib/itemOrder";
import type { ProductForm, BundleRow, SaleMode } from "../../arctic/productForm";
import {
  AdminPage,
  AdminTabs,
  Segmented,
  Toolbar,
  SearchInput,
  DataTable,
  DetailPane,
  PaneSection,
  DefRow,
  StatusChip,
  FieldRow,
  BatchBar,
  PendingBar,
  BarStack,
  BarBtn,
  MenuBtn,
  MoreMenu,
  FormSheet,
  FilterButton,
  FilterSection,
  ChoiceChip,
  PickBox,
  ActiveFilters,
  CardGrid,
  ViewToggle,
  useSelection,
  useStoredState,
  useMedia,
  sortRows,
  sfxTick,
  Inline,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  EmptyRow,
  Btn,
  Toggle,
  Switch,
  useNotice,
  useToast,
  useRowDrag,
  DragHandle,
  ConfirmDialog,
  useAdminGuard,
  useLeaveGuard,
  tableGroupOfKey,
  backdropClose,
} from "../ui";
import type { Column, TableRowDrop, SortState, ViewMode, ActiveFilter, MenuItem } from "../ui";
import { ADMIN_COUNTS_EVENT } from "../adminIndex";
import { THEME_NAME_MAX, THEME_ON_MAX, THEME_ON_LIMIT_MESSAGE, DEFAULT_THEMES, BUILTIN_BANNER_THEME, themeNameOf, themePickOptions, normalizeThemeName, themeNameError } from "@/lib/shopThemes";

// 📌 탭 구성 — '아이템'은 인벤토리 · 상품 · 시즌 패스 표기의 원천이라 맨 앞(상품을 만들기 전에 먼저 등록한다).
//    📌 2026-09 개편 — 목록 화면 틀 하나: 머리(ARCTIC · 상점 관리 · 탭 한 줄) → 도구 줄 → 전체 폭 표 → 줄을 누르면 상세 칸(새로 만들기 · 수정 같은 폼).
//    📌 2026-10-17 — 탭 아래 설명 줄(TAB_META.desc)은 걷었다(설명문 금지). 모든 탭이 도구 줄부터 같은 자리에서 시작한다.
//       아이템 탭: 고르기 칸 + 아래 띠(일괄 편집) · 거르기 · 「표 | 카드」 · 열 고르기 · 넓은 화면(1280 이상) 붙는 편집기
//    📌 2026-10-17 관리 화면 정리 — 탭 다섯(아이템 · 상품 · 배너 · 쿠폰 · 구매 내역).
//       옛 「시즌 전환」 탭(디스코드 역할 떼기)은 SYSTEM : LEVEL › 시즌 전환(/admin/role-migration?tab=detach)으로 옮겼다 — 옛 주소 ?tab=season 은 그리로 넘긴다.
//       옛 「설정」 탭(결제 캐시백)은 머리 「설정」 단추 → 창(ShopSettingsSheet — ARCTIC 상점 공개 · 캐시백 합 상한 · 빙옥 결제분).
//       그 창을 여는 주소: ?open=settings(기능 검색 · 레벨 설정 옛 sec=mute) · ?settings=1 · 옛 ?tab=settings — 연 뒤 주소에서 걷는다(지금 탭은 그대로)
const TAB_ORDER = [
  { id: "items", short: "아이템" },
  { id: "products", short: "상품" },
  { id: "banners", short: "배너" },
  { id: "coupons", short: "쿠폰" },
  { id: "orders", short: "구매 내역" },
];
const TAB_IDS = new Set(TAB_ORDER.map((t) => t.id));
// 옮긴 탭의 옛 주소 → 새 자리(다른 화면)
const MOVED_TAB: Record<string, string> = { season: "/admin/role-migration?tab=detach" };
// 상점 설정 창을 여는 주소인가(?open=settings · ?settings=1 · 옛 ?tab=settings)
const isSettingsLink = (sp: { get: (k: string) => string | null }) =>
  sp.get("open") === "settings" || sp.get("settings") === "1" || sp.get("tab") === "settings";
// 주소 → 탭 — ?edit=<id>(탭 없이)는 상품, 설정 창 · 효과 문구 창 주소(?open=fxtext)는 지금 탭(cur) 그대로, 모르는 탭은 아이템
const tabOfParams = (sp: { get: (k: string) => string | null }, cur: string) => {
  const raw = sp.get("tab") || "";
  const keepTab = isSettingsLink(sp) || sp.get("open") === "fxtext";
  const t = raw && raw !== "settings" ? raw : sp.get("edit") ? "products" : keepTab ? cur : "items";
  return TAB_IDS.has(t) ? t : "items";
};
// 📌 따라간 뒤 주소에서 걷는 표시(기능 검색 · 다른 화면 링크 — ?new=1 · item= · edit= · open=preset|groups|themes)
const DEEP_KEYS = ["new", "item", "edit"];
const DEEP_OPENS = new Set(["preset", "groups", "themes", "fxtext"]);
const hasDeepMark = (sp: { get: (k: string) => string | null }) => DEEP_KEYS.some((k) => sp.get(k) != null) || DEEP_OPENS.has(sp.get("open") || "");

// expired — 기간제가 끝나 봇이 회수한 건 (bot/src/features/grantQueue.js)
const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소", refunded: "환불", expired: "만료" };
const STATUS_TONE: Record<string, "warn" | "ok" | "bad" | "neutral"> = { pending: "warn", completed: "ok", cancelled: "bad", refunded: "bad", expired: "neutral" };

// 상품 유형 — 라벨·색은 lib/items.js 가 단일 원천 (상점 카드와 같은 값). 세트(lib/bundle.js)는 상품에만 있는 유형이라 여기서 붙인다
const typeLabel = (t: string) => (t === BUNDLE_TYPE ? "세트" : itemTypeLabel(t));
// 📌 유형 배지 — 글자는 분류(label — API categoryLabel, 2026-10-17 lib/itemCategory.js), 색은 유형. label 이 없으면 유형 이름(상점 TypeBadge 와 같은 모양)
function TypeBadge({ type, label, className = "" }: { type: string; label?: string; className?: string }) {
  return (
    <span className={`rounded-full font-black text-white whitespace-nowrap max-w-[9rem] overflow-hidden text-ellipsis ${className}`} style={{ backgroundColor: itemTypeColor(type) }}>
      {label || typeLabel(type)}
    </span>
  );
}
// 📌 분류 · 짧은 이름(2026-10-17 운영자 「자동 + 바꾸기」) — 목록 줄 · 카드 · 요약이 찍는 값. API 의 shortName · categoryLabel 을 쓰고,
//    옛 응답 · 화면에서 막 고친 줄은 같은 규칙(lib/itemCategory.js — 직접 정한 분류 > 옛 이름 머리말 > 자동)으로 셈한다. 이름 칸(편집)은 name 그대로
type Named = { name?: unknown; shortName?: unknown };
const shortOfRow = (it: Named | null | undefined): string =>
  typeof it?.shortName === "string" && it.shortName ? it.shortName : shortNameOf(it?.name);
type Classed = { categoryLabel?: unknown; category?: unknown; name?: unknown; type?: unknown; effects?: unknown };
const categoryOfRow = (it: Classed | null | undefined): string =>
  typeof it?.categoryLabel === "string" && it.categoryLabel ? it.categoryLabel : resolveCategory(it);
// 📌 보일 효과 줄 · 적용 범위(2026-10-18 lib/itemEffects) — 관리자 아이템 API 가 붙인 effectLines(직접 쓴 문구 > 자동 · 채널 이름까지) · scopeLabel 을 쓰고,
//    옛 응답(칸 없음)은 같은 규칙으로 셈한다(채널 이름 없이). 꾸미기 문장은 줄에 없다 — 꾸미기는 적용 범위 글자
type FxRow = { effectLines?: unknown; scopeLabel?: unknown; [k: string]: unknown } | null | undefined;
const rowEffectLines = (it: FxRow): string[] => (Array.isArray(it?.effectLines) ? it.effectLines.map(String) : effectLinesOf(it));
const rowScopeLabel = (it: FxRow): string => (typeof it?.scopeLabel === "string" ? it.scopeLabel : scopeLabelOf(it));
// 화면 목록 줄을 먼저 고칠 때(일괄 편집 · 저장 응답 전) — 분류 칸 셋을 새 값으로 다시 셈한다(아이템 줄: 유형 · 효과 · 분류 · 이름이 한 줄에 다 있다)
const withCategoryFields = <T extends Classed & Named>(it: T): T => ({
  ...it,
  shortName: shortNameOf(it.name),
  categoryLabel: resolveCategory(it),
  categoryAuto: resolveCategory({ ...it, category: "" }),
});

// 📌 희귀도(2026-10-17 운영자 — 일곱 등급, 이름 · 색 · 순서는 lib/rarity.js 한 곳). 관리 화면은 색 점 + 등급 이름으로만 보인다
//    (유물처럼 옅은 색은 흰 바탕 글자색으로 못 써서 점으로)
function RarityDot({ r, className = "w-2.5 h-2.5" }: { r: { c: string }; className?: string }) {
  return <span aria-hidden className={`shrink-0 rounded-full border border-black/10 ${className}`} style={{ backgroundColor: r.c }} />;
}
// 아이템 등록 「희귀도」 — 일곱 알약을 네 칸 두 줄로(옆으로 넘치지 않게 · 폰 390 도 그대로). "" = 안 고름 → 일반이 켜져 보인다.
//    켜진 것을 다시 눌러도 그대로, 안 고른 아이템에서 「일반」을 누르면 일반으로 고른 것("common")이 된다(목록 이름 옆에 보인다)
function RarityPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const cur = normalizeRarity(value) || RARITIES[0].v;
  return (
    <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="희귀도">
      {RARITIES.map((r) => {
        const on = cur === r.v;
        return (
          <button key={r.v} type="button" aria-pressed={on} onClick={() => { if (value !== r.v) onChange(r.v); }}
            className={`min-w-0 inline-flex items-center justify-center gap-1.5 h-8 px-2 rounded-full border text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${
              on ? "border-[#131313] ring-1 ring-[#131313] text-[#131313]" : "border-[#a3a3a3] text-[#5a5a5a] hover:border-[#131313] hover:text-[#131313]"
            }`}>
            <RarityDot r={r} />
            {r.l}
          </button>
        );
      })}
    </div>
  );
}
// 아이템 목록 줄 이름 옆 — 고른 희귀도만(안 고른 "" 은 표시 없음)
function RarityMark({ v }: { v: unknown }) {
  const k = normalizeRarity(v);
  if (!k) return null;
  const r = rarityOf(k);
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-black text-[#5a5a5a] whitespace-nowrap">
      <RarityDot r={r} className="w-2 h-2" />
      {r.l}
    </span>
  );
}

// 카드 그림 자리 — 상품 이미지 > 아이템 이미지 > 아이콘(ItemIcon)을 등록 색 위에 크게 (상점 CardArt 와 같은 규칙)
function CardArt({ it, iconSize = 48 }: { it: any; iconSize?: number }) {
  const color = it?.color || itemTypeColor(it?.type);
  // 옛 테두리 그림은 그림으로 깔지 않고 아이콘 자리로(상점 CardArt 와 같은 규칙 — lib/cosmeticArt legacyFrameArtOf)
  const raw = it?.imageUrl || it?.itemImageUrl;
  const legacy = legacyFrameArtOf(raw) ? raw : "";
  const img = legacy ? "" : raw;
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={img} alt="" className="absolute inset-0 w-full h-full object-cover" />;
  }
  // 세트 — 상품 이미지가 없으면 구성 아이콘을 합친다(상점 카드와 같은 그림 — app/arctic/CardArt BundleArt)
  const parts = bundlePartsOf(it);
  if (parts.length >= 2) {
    return (
      <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
        <BundleArt parts={parts} color={color} small mode={it?.setArt} hero={it?.icon ? String(it.icon) : undefined} />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: `linear-gradient(160deg, ${color}33, ${color}0a)` }}>
      <ItemIcon icon={it?.icon} imageUrl={legacy} type={it?.type} size={iconSize} color={color} />
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
// 📌 꾸미기 아이템 · 상품의 줄 그림(2026-10-11) — 아이콘이 공용(비었음 · 반짝 카드 · 테두리 공용 …)이거나 옛 테두리 그림이면 그 스킨 · 테두리 전용 도트 아이콘으로
//    (인벤토리와 같은 lib/cosmeticArt cosmeticIconOf — DB 는 그대로). 운영자가 고른 아이콘 · 올린 이미지는 그대로.
//    src: 효과를 읽을 아이템 — 아이템 줄은 그 아이템, 상품 줄은 연결 아이템(없으면 그대로)
type ThumbArt = { icon?: unknown; imageUrl?: unknown; itemImageUrl?: unknown };
const withCosmeticIcon = <T extends ThumbArt>(it: T, src: { effects?: { list?: unknown } } | null | undefined): T => {
  const raw0 = src?.effects?.list;
  const list = (Array.isArray(raw0) ? normalizeEffects(raw0) : []) as { on?: string; skin?: string; scene?: string; frame?: string }[];
  const skin = list.find((e) => e?.on === "cardSkin" && e.skin);
  const scene = list.find((e) => e?.on === "cardScene" && e.scene);
  const frame = list.find((e) => e?.on === "avatarFrame" && e.frame);
  const skins: string[] = skin ? skinsOf(skin.skin) : [];
  const scenes: string[] = scene ? scenesOf(scene.scene) : [];
  const frames: string[] = frame ? framesOf(frame.frame) : [];
  if (!it || (!skins.length && !scenes.length && !frames.length)) return it;
  const raw = String(it.imageUrl || it.itemImageUrl || "");
  const out = cosmeticIconOf({
    icon: it.icon, imageUrl: raw,
    ...(scenes.length ? { sceneKey: scenes[0] } : {}),
    ...(skins.length > 1 ? { skinKeys: skins } : skins.length ? { skinKey: skins[0] } : {}),
    ...(frames.length > 1 ? { frameKeys: frames } : frames.length ? { frameKey: frames[0] } : {}),
  });
  return out.icon === String(it.icon || "") && out.imageUrl === raw ? it : { ...it, icon: out.icon, imageUrl: out.imageUrl, itemImageUrl: out.imageUrl };
};
// 📌 세트 미리보기 구성의 꾸미기 효과 키 — 목록 API bundleItems 의 cosmeticKeys 와 같은 값(lib/cosmeticArt cosmeticKeysOf). 관리 API 아이템은 effects 가 { list } 객체라 list 로 넘긴다.
//    아이콘만 바꿔 넣으면(withCosmeticIcon) 운영자가 고른 아이콘의 테두리 · 스킨이 「입는 꾸미기」로 안 잡혀 대표가 상점 카드와 달라졌다(CardArt setHeroOf · isWearPart)
const cosmeticKeysProp = (ri: { type?: string; effects?: { list?: unknown } } | null | undefined) => {
  const k = ri ? cosmeticKeysOf({ type: ri.type, effects: ri.effects?.list }) : null;
  return k ? { cosmeticKeys: k } : {};
};

// 📌 아이템 효과 한 줄(화면용) — 숫자 칸은 비울 수 있어야 해서 문자열로 든다. 정의 · 문구 · 정리는 lib/itemEffects 가 단일 원천.
//    open(조건 펼침)은 화면 상태라 저장하지 않는다. chText 는 채널 목록을 못 불러왔을 때 쓰는 ID 입력칸의 날 글자
type EffectDraft = {
  id: string; on: string; mode: string; amount: string; minMinutes: string; everyN: string;
  chance: string; minMembers: string; seconds: string; skin: string; frame: string; scene: string;
  again: string; // 다시 오른 레벨 몫(levelUp — "" = 크기의 절반 · lib/itemEffects againXpOf)
  candy: CandyRow[]; // 보상 구간 표(voiceCandy — 처음엔 기본 표 · 기본 표와 같으면 저장하지 않는다 · lib/itemEffects normalizeCandyTiers)
  maxPct: string; // 최대 %(voiceStay — 머물수록 증가의 끝)
  days: number[]; hourFrom: string; hourTo: string; channelIds: string[]; chText: string; open: boolean;
};
// 📌 보상 구간 한 줄(화면용 — 칸은 문자열) { w: 확률 %, min, max }. 기본 표(CANDY_TIERS)로 채워 연다
type CandyRow = { w: string; min: string; max: string };
const candyRowsOf = (tiers: { w: number; min: number; max: number }[]): CandyRow[] => tiers.map((t) => ({ w: String(t.w), min: String(t.min), max: String(t.max) }));
const candyNums = (rows: CandyRow[]) => rows.map((r) => ({ w: Number(r.w), min: Number(r.min), max: Number(r.max) }));
const sameCandy = (rows: CandyRow[]) => JSON.stringify(normalizeCandyTiers(candyNums(rows))) === JSON.stringify(CANDY_TIERS);
// 저장 전 검사 — 틀린 곳 한 줄(맞으면 "")
const candyTiersError = (rows: CandyRow[]): string => {
  if (!rows.length) return "구간을 한 줄 이상 넣어 주세요.";
  if (rows.length > CANDY_TIER_MAX) return `구간은 ${CANDY_TIER_MAX}줄까지입니다.`;
  for (const [i, r] of rows.entries()) {
    if ([r.w, r.min, r.max].some((v) => String(v).trim() === "")) return `${i + 1}번째 구간의 칸을 채워 주세요.`;
    const w = Number(r.w), min = Number(r.min), max = Number(r.max);
    if (!(w > 0 && w <= 100)) return `${i + 1}번째 구간의 확률은 0 초과 100 이하로 넣어 주세요.`;
    if (!(min >= 0 && max <= CANDY_XP_MAX && min <= max)) return `${i + 1}번째 구간은 최소 ≤ 최대(0~${CANDY_XP_MAX.toLocaleString()})로 넣어 주세요.`;
  }
  const sum = Math.round(rows.reduce((s, r) => s + Math.round(Number(r.w) * 10) / 10, 0) * 10) / 10;
  return sum === 100 ? "" : `확률을 합쳐 100%가 되어야 합니다(지금 ${sum}%).`;
};
const newEffectId = () => Math.random().toString(36).slice(2, 10);
const newEffect = (): EffectDraft => ({
  id: newEffectId(), on: "chat", mode: "add", amount: "", minMinutes: "", everyN: "", chance: "", minMembers: "", seconds: "", skin: "", frame: "", scene: "", again: "", maxPct: "",
  candy: candyRowsOf(CANDY_TIERS),
  days: [], hourFrom: "", hourTo: "", channelIds: [], chText: "", open: false,
});
// 빈 칸은 undefined 로 넘긴다 — normalizeEffects 는 "" 를 0 으로 읽어 분 · 번째를 최솟값(1분 · 2번째)으로 채워 버린다
const numOrNone = (s: string) => (String(s ?? "").trim() === "" ? undefined : Number(s));
// 📌 초 칸 효과(쿨타임 단축)는 크기 칸이 화면에 없다 — 다른 효과에서 바꿔 온 크기가 초로 읽히지 않게 amount 를 넘기지 않는다
const effectOf = (d: EffectDraft) => ({
  id: d.id, on: d.on, mode: d.mode, amount: TRIGGER_OF[d.on]?.needs === "seconds" ? undefined : numOrNone(d.amount),
  minMinutes: numOrNone(d.minMinutes), everyN: numOrNone(d.everyN),
  chance: numOrNone(d.chance), minMembers: numOrNone(d.minMembers), seconds: numOrNone(d.seconds), skin: d.skin || undefined, frame: d.frame || undefined,
  scene: d.scene || undefined,
  againAmount: TRIGGER_OF[d.on]?.again ? numOrNone(d.again) : undefined,
  maxPct: TRIGGER_OF[d.on]?.maxPct ? numOrNone(d.maxPct) : undefined,
  // 보상 구간 표 — 기본 표와 같으면 보내지 않는다(기본 표를 따라가게)
  candyTiers: TRIGGER_OF[d.on]?.tiers && !sameCandy(d.candy) ? candyNums(d.candy) : undefined,
  days: d.days, hourFrom: d.hourFrom, hourTo: d.hourTo, channelIds: d.channelIds,
});
// 📌 열린 폼이 저장된 값과 다른가(고친 채 다른 줄로 넘어갈 때 한 번 묻는다) — 줄마다 새로 만드는 내부 키(효과 줄 id · 세트 줄 key) · 화면 상태(효과 줄 「조건」 펼침 open) ·
//    폼으로 저장하지 않는 순서(sortOrder — 순서는 끌기만 바꾼다)는 빼고 견준다
const sameForm = (a: any, b: any) => {
  const strip = (x: any) => {
    const { sortOrder: _s, ...rest } = x || {};
    return {
      ...rest,
      ...(Array.isArray(x?.effects) ? { effects: x.effects.map(({ id: _id, open: _open, ...r }: any) => r) } : {}),
      ...(Array.isArray(x?.bundle) ? { bundle: x.bundle.map(({ key: _key, ...r }: any) => r) } : {}),
    };
  };
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
};
// 목록이 바뀐 만큼 열린 폼을 옮긴다 — 고친 칸(폼 ≠ 옛 저장 값)은 그대로, 안 고친 칸 중 목록에서 바뀐 것만 새 저장 값으로
//    (줄 표시 스위치 · 일괄 편집 · 끌어서 그룹 옮기기가 연 폼을 옛 값으로 되돌려 저장하지 않게)
const rebaseForm = (fm: any, was: any, now: any) => {
  const out: any = { ...fm };
  for (const k of new Set([...Object.keys(fm || {}), ...Object.keys(now || {})])) {
    const one = (v: any) => ({ [k]: v });
    if (sameForm(one(fm?.[k]), one(was?.[k])) && !sameForm(one(was?.[k]), one(now?.[k]))) out[k] = now?.[k];
  }
  return out;
};
const draftOf = (e: any): EffectDraft => {
  const channelIds = Array.isArray(e?.channelIds) ? e.channelIds.map(String) : [];
  return {
    id: String(e?.id || newEffectId()), on: TRIGGER_OF[e?.on] ? e.on : "chat", mode: e?.mode === "percent" ? "percent" : "add",
    amount: e?.amount ? String(e.amount) : "", minMinutes: e?.minMinutes ? String(e.minMinutes) : "", everyN: e?.everyN ? String(e.everyN) : "",
    chance: e?.chance ? String(e.chance) : "", minMembers: e?.minMembers ? String(e.minMembers) : "",
    seconds: e?.seconds ? String(e.seconds) : "", skin: typeof e?.skin === "string" ? e.skin : "",
    frame: typeof e?.frame === "string" ? e.frame : "", scene: typeof e?.scene === "string" ? e.scene : "",
    again: e?.againAmount != null ? String(e.againAmount) : "",
    maxPct: e?.maxPct ? String(e.maxPct) : "",
    candy: candyRowsOf(normalizeCandyTiers(e?.candyTiers) || CANDY_TIERS),
    days: Array.isArray(e?.days) ? e.days.map(Number) : [], hourFrom: e?.hourFrom != null ? String(e.hourFrom) : "", hourTo: e?.hourTo != null ? String(e.hourTo) : "",
    channelIds, chText: channelIds.join(", "), open: false,
  };
};
const xpNum = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

// 아이템 등록 폼 — 숫자 칸은 비울 수 있어야 해서 문자열로 든다
//    효과(chatBuffXp · voiceBuffXp · attendBuffXp · effects)는 아이템 자체에 저장 — 이 아이템을 인벤토리에 가진 사람에게 적용(디스코드 역할과 무관)
//    group: 목록 묶음 이름("" = 묶지 않음 — models/Item.js group)
//    rarity: 희귀도 키("" = 안 고름 → 일반 — models/Item.js rarity · lib/rarity.js). 키 차례는 regFormOf 와 같게(sameForm 이 JSON 으로 견준다)
//    chatBuffXp · voiceBuffXp · attendBuffXp: 옛 「기본 효과」 세 칸 — 입력칸은 없다(값이 있으면 읽기 전용 + 「추가 효과로 옮기기」 — EffectsEditor)
//    category: 분류 저장 칸 그대로("" = 자동 — models/Item.js category · lib/itemCategory.js). 보이는 분류(categoryLabel)는 넣지 않는다 — 저장하면 자동이 고정돼 버린다
//    📌 2026-10-18 효과 문구 · 적용 범위(models/Item.js effectText · scope — lib/itemEffects):
//       effectCustom: 「직접 쓰기」 중인가(false = 자동) · effectText: 직접 쓰는 글자(한 줄에 하나 — 자동이면 "") · scope: 고른 적용 범위 키([] = 자동)
type ItemForm = {
  id: string; name: string; description: string; type: string; roleId: string; icon: string; imageUrl: string;
  color: string; detachOnSeason: boolean; visible: boolean; group: string; rarity: string; category: string;
  // 서버 부스터 혜택(2026-10-24 — models/Item.js boosterPerk · lib/booster.js): 켜면 부스팅 중인 동안 이 아이템을 가진 것으로 친다
  boosterPerk: boolean;
  chatBuffXp: string; voiceBuffXp: string; attendBuffXp: string; effects: EffectDraft[];
  effectCustom: boolean; effectText: string; scope: string[];
};
const EMPTY_ITEM_FORM: ItemForm = {
  id: "", name: "", description: "", type: "item", roleId: "", icon: "", imageUrl: "", color: "", detachOnSeason: false, visible: true, group: "", rarity: "", category: "",
  boosterPerk: false,
  chatBuffXp: "", voiceBuffXp: "", attendBuffXp: "", effects: [],
  effectCustom: false, effectText: "", scope: [],
};

// 📌 상품 폼 + 분류(2026-10-17) — 상품 폼 모양(app/arctic/productForm)에 분류 저장 칸을 붙여 든다(직접 설정 · 세트만 뜻이 있다 — 연결 상품은 아이템 분류를 따라 늘 "").
//    저장된 상품 → 폼은 prodFormOf(formFromShopItem + category), 빈 폼은 EMPTY_PROD_FORM — 「고친 채인가」 견줄 때 두 쪽 모두 이 칸이 있어야 같게 본다
type ProdForm = ProductForm & { category?: string };
const EMPTY_PROD_FORM: ProdForm = { ...EMPTY_PRODUCT_FORM, category: "" };
const prodFormOf = (it: AnyRow): ProdForm => ({ ...formFromShopItem(it), category: it?.itemId ? "" : String(it?.category || "") });

// 📌 아이템 그룹(2026-10-10 운영자: "시즌 끝나면 등급별 지급되는 아이템들이 너무 많아져서 다 관리하기 힘드니까 그룹 시스템을 만들어 줘")
//    목록은 그룹마다 머리줄 하나로 접어 둔다(기본 접힘 — DataTable groupOf · 펼친 그룹은 이 브라우저에 기억 · 「모두 펼치기 / 접기」).
//    한 개는 아이템 수정의 "그룹" 칸, 여러 개는 고르기 칸으로 고른 뒤 아래 띠 「그룹」(2026-10-17 — 예전 「그룹 지정」 모드를 대신. PATCH { batch }).
//    📌 2026-10-11 순서는 하나 — 목록 순서 = 실제 순서(Item.sortOrder · 인벤토리 · 상점). 같은 그룹은 늘 붙은 덩어리, 머리줄은 그 덩어리 첫 아이템 자리
//       (예전엔 머리줄을 저장된 그룹 차례로 위에 모아 그려 실제 순서와 달랐다 — 운영자 "이러면 안 되는 거잖아"). 규칙 · 계산은 lib/itemOrder.js(서버와 같은 함수).
//       끌기: 머리줄 → 덩어리째 단위 사이로. 아이템 줄 하나 → 놓은 자리가 곧 그룹(2026-10-11 운영자 "바깥에 있는 걸 바로 그룹에 못 넣는다"):
//         펼친 덩어리 안(두 줄 사이 · 첫 줄 앞) = 그 그룹에 그 자리로 · 접힌 머리줄 위 = 그 덩어리 끝 · 단위 사이 = 그룹에서 빼 그 자리로
//         (자리 셈 lib/groupedDrop.js · 순서 셈 lib/itemOrder.js moveToGroup — 서버와 같은 함수). 그룹이 바뀌면 토스트로 알린다.
//       머리줄 고르기 칸 = 그 그룹 아이템 통째로. 아래 띠 「그룹」 · 그룹 칸 저장 → 그 그룹 덩어리 끝에(빼면 옛 덩어리 바로 뒤).
//       그룹 관리 창 차례 = 덩어리 차례(빈 그룹은 그 뒤 — Setting "itemGroups")
//    그룹 거르기 값: "all" 전체 · "none" 그룹 없음 · "g:<이름>" 그 그룹 · "p:<이름>" 그 상위 그룹(든 그룹 모두 — 그룹 머리줄로 묶어 보인다)
//    📌 상위 그룹(그룹의 그룹 — 2026-10-11 운영자 "그룹의 그룹도 만들어서 자동 정렬"): 그룹 관리 창에서 그룹마다 상위를 고른다. 목록은 같은 상위의 그룹들 위에
//       상위 머리줄 하나(누르면 접고 편다 · 기본 펼침 · 끌기 없음). 같은 상위의 그룹은 늘 이어져 있다 — 다른 자리에 끌어 놓아도 제 상위로 돌아간다(상위를 바꾸는 곳은 그룹 관리 창).
//       「자동 정렬」(그룹 관리 창) — 유형 → 상위 → 그룹 → 그룹 없는 아이템, 그룹 안은 등급 차례(서버 lib/itemOrder.js autoSortOrder)
const GROUP_ALL = "all";
const GROUP_NONE = "none";
const groupOfItem = (it: { group?: unknown } | null | undefined) => String(it?.group || "");
// 순서 계산용 줄(lib/itemOrder.js) — 화면 목록(regItems)은 늘 실제 순서 그대로 든다
const orderRowsOf = (list: any[]) => list.map((it) => ({ id: String(it._id), group: groupOfItem(it) }));
// 새 순서(id 차례)로 화면 목록을 다시 세운다 — sortOrder 도 그 자리(서버가 쓴 값과 같다). 목록에 없는 id 는 건너뛰고, ids 에 빠진 아이템은 뒤에 그대로
const reorderById = (list: any[], ids: string[]) => {
  const byId = new Map(list.map((it) => [String(it._id), it]));
  const out: any[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const it = byId.get(id);
    if (it && !used.has(id)) { out.push(it); used.add(id); }
  }
  for (const it of list) if (!used.has(String(it._id))) out.push(it);
  return out.map((it, i) => (it.sortOrder === i ? it : { ...it, sortOrder: i }));
};

// ── 체크한 줄 덩어리 놓기(2026-10-18 운영자 "체크 표시 했으면 한 번에 옮겨져야지 왜 따로 움직여..?") ──
//    📌 표가 주는 놓은 자리(TableRowDrop — 끈 줄 하나의 이웃)를 지금 전체 차례(ids)의 틈 번호로 읽고(dropGapOf), 옮길 줄(moving — 차례 그대로)을
//       뺀 나머지 차례의 그 자리에 한 덩어리로 끼운다(placeBlock). 틈 앞의 옮기지 않는 줄 수 = 끼울 번호라 이웃이 고른 줄이어도 · 거른 목록이어도 같은 셈.
//       틈을 못 찾으면(다른 창에서 바뀐 목록) null
const placeBlock = (ids: string[], moving: string[], gap: number | null) => {
  if (gap == null || gap < 0) return null;
  const set = new Set(moving);
  let at = 0;
  for (let i = 0; i < Math.min(gap, ids.length); i++) if (!set.has(ids[i])) at++;
  const rest = ids.filter((k) => !set.has(k));
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
};
//    틈 — after(그 바로 뒤)가 먼저, 없으면 before(그 바로 앞), 둘 다 없고 그룹 안이면 그 덩어리 끝(접힌 머리줄 위). 이웃이 표 단위 키(그룹 머리줄)면 그 덩어리 뒤 · 앞
const dropGapOf = (ids: string[], groupOfId: (id: string) => string, drop: TableRowDrop): number | null => {
  const first = (g: string) => ids.findIndex((k) => groupOfId(k) === g);
  const last = (g: string) => { for (let i = ids.length - 1; i >= 0; i--) if (groupOfId(ids[i]) === g) return i; return -1; };
  const at = (key: string, end: boolean) => {
    const g = tableGroupOfKey(key);
    const p = g != null ? (end ? last(g) : first(g)) : ids.indexOf(key);
    return p < 0 ? null : end ? p + 1 : p;
  };
  if (drop.after) return at(drop.after, true);
  if (drop.before) return at(drop.before, false);
  if (drop.group) { const p = last(drop.group); return p < 0 ? null : p + 1; }
  return null;
};
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

// 그룹 고르기(아이템 폼 「그룹」 칸) — 목록 하나(그룹 없음 · 그룹들(저장된 차례 · 개수) · + 새 그룹). 새 그룹을 고르면 이름 칸이 열린다.
//    목록에 없는 이름이 들어 있으면(새 그룹 · 꾸미기 효과 자동 채우기) 이름 칸이 열린 채 그 이름을 보인다
const NEW_GROUP_V = "+new";
function GroupPicker({ value, groups, counts, onChange }: {
  value: string; groups: string[]; counts: ReadonlyMap<string, number>; onChange: (v: string) => void;
}) {
  const v = normalizeItemGroup(value);
  const known = !!v && groups.includes(v);
  const [newOpen, setNewOpen] = useState(false);
  const typing = newOpen || (!!v && !known);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (newOpen) inputRef.current?.focus(); }, [newOpen]);
  const options: DropdownOption[] = [
    { value: "n:", label: "그룹 없음" },
    ...groups.map((g) => ({ value: `g:${g}`, label: g, hint: String(counts.get(g) || 0) })),
    { value: NEW_GROUP_V, label: "+ 새 그룹" },
  ];
  return (
    <>
      <Dropdown
        theme="light"
        buttonClassName={DD_BTN}
        value={typing ? NEW_GROUP_V : known ? `g:${v}` : "n:"}
        options={options}
        maxHeight={300}
        onChange={(x) => {
          if (x === NEW_GROUP_V) { setNewOpen(true); if (known) onChange(""); return; }
          setNewOpen(false);
          onChange(x === "n:" ? "" : x.slice(2));
        }}
      />
      {typing && (
        <input ref={inputRef} type="text" value={value} maxLength={ITEM_GROUP_MAX} onChange={(e) => onChange(e.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름"
          className={`${inputClass} mt-2`} />
      )}
    </>
  );
}

// 📌 분류 고르기(아이템 폼 · 직접 설정 상품 폼 「분류」 · 일괄 「분류 바꾸기」 — 2026-10-17 「자동 + 바꾸기」) — 목록 하나:
//    「자동 · <지금 자동 값>」(저장 "") · 분류 목록(lib/itemCategory.js CATEGORY_OPTIONS) · 「직접 입력」(이름 칸이 열린다 · 20자).
//    목록에 없는 글자가 들어 있으면 이름 칸이 열린 채 그 글자를 보인다(그룹 고르기와 같은 모양). auto — 「자동」 옆 글자(비우면 「자동」만).
//    unset — 아직 안 고름(일괄 창 — 고르기 칸을 비워 둔다)
const CATEGORY_CUSTOM_V = "+custom";
function CategoryPicker({ value, auto, unset = false, onChange }: { value: string; auto?: string; unset?: boolean; onChange: (v: string) => void }) {
  const v = normalizeCategory(value);
  const listed = !v || (CATEGORY_OPTIONS as string[]).includes(v);
  const [typeOpen, setTypeOpen] = useState(false);
  const typing = typeOpen || !listed;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (typeOpen) inputRef.current?.focus(); }, [typeOpen]);
  const options: DropdownOption[] = [
    { value: "a:", label: auto ? `자동 · ${auto}` : "자동" },
    ...(CATEGORY_OPTIONS as string[]).map((c) => ({ value: `c:${c}`, label: c })),
    { value: CATEGORY_CUSTOM_V, label: "직접 입력" },
  ];
  return (
    <>
      <Dropdown
        theme="light"
        buttonClassName={DD_BTN}
        value={typing ? CATEGORY_CUSTOM_V : unset ? "" : v ? `c:${v}` : "a:"}
        options={options}
        placeholder="분류 선택"
        maxHeight={300}
        onChange={(x) => {
          // 직접 입력 — 지금 글자를 그대로 두고 칸만 연다(고른 분류를 고쳐 쓸 수 있게)
          if (x === CATEGORY_CUSTOM_V) { setTypeOpen(true); return; }
          setTypeOpen(false);
          onChange(x === "a:" ? "" : x.slice(2));
        }}
      />
      {typing && (
        <input ref={inputRef} type="text" value={value} maxLength={CATEGORY_MAX} onChange={(e) => onChange(e.target.value)} placeholder={auto || "분류"} aria-label="분류 직접 입력"
          className={`${inputClass} mt-2`} />
      )}
    </>
  );
}

// 📌 아래 띠 · 도구 줄의 펼침 메뉴 단추(희귀도 ▾ · 그룹 ▾ · 「⋯」) — 공용 부품 MenuBtn · MoreMenu(app/admin/ui.tsx)로 올렸다(같은 항목 모양)

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

// 📌 주문 묶기 — 세트 구성 건(bundleName — lib/bundle.js)은 구성 아이템마다 한 줄("세트 이름 · 아이템 이름").
//    한 결제의 구성 건은 orderId · 상품(세트) id 가 모두 같아 groupOrders 가 세트 전체를 한 줄로 묶어 버린다 —
//    묶는 열쇠에만 구성 아이템(itemRef)을 붙이고 묶은 뒤 orderId 를 되돌린다. 같은 구성 여러 개(qty)는 한 줄 "×N". 세트가 아닌 건은 그대로
//    📌 이름은 짧은 이름(2026-10-17 — API shortName: 산 때 이름에서 옛 분류 머리말만 뗀 것)
type OrderRow = { orderId?: string; itemRef?: string; bundleName?: string; itemName?: string; shortName?: string };
const groupOrderRows = (rows: OrderRow[]) =>
  groupOrders(rows.map((r) => (r?.bundleName && r.orderId ? { ...r, orderId: `${r.orderId}#${r.itemRef || ""}`, bundleOrderId: r.orderId } : r)))
    .map((g) => (g.bundleOrderId ? { ...g, orderId: g.bundleOrderId } : g));
const orderItemName = (o: OrderRow | null | undefined) => (o?.shortName || shortNameOf(o?.itemName || ""));
const orderName = (o: OrderRow | null | undefined) => (o?.bundleName ? `${o.bundleName} · ${orderItemName(o)}` : orderItemName(o));
// 주문 금액 — 정가 × 개수(빙옥 전용은 빙옥으로 올림). 빙옥 전용 세트의 구성 건은 나눠 적은 값이 1 빙옥의 배수가 아니라
//    올림하면 합이 낸 값보다 커지므로 낸 빙옥(paidPoint 합 — lib/orderGroups)을 그대로 쓴다
type OrderMoney = { bundleName?: string; pointOnly?: boolean; billed?: boolean; paidPoint?: number; price?: number; paidQty?: number; qty?: number };
const orderAmount = (o: OrderMoney) =>
  o.bundleName && o.pointOnly && o.billed ? `${(Number(o.paidPoint) || 0).toLocaleString()} 빙옥` : priceText(o, (o.price || 0) * (o.paidQty || o.qty || 1));
// 세트 구성 한 칸 표기(상품 목록) — "이름 ×N 30일"
const bundleCompLabel = (c: { name?: string; shortName?: string; qty?: number; days?: number }) =>
  `${c?.shortName || shortNameOf(c?.name || "") || "알 수 없음"}${(Number(c?.qty) || 1) > 1 ? ` ×${c.qty}` : ""}${Number(c?.days) > 0 ? ` ${c.days}일` : ""}`;

// 같은 건(_id)은 한 번만 — 앞의 것을 남긴다(구매 내역 더 보기의 겹친 건)
const uniqById = <T extends { _id?: unknown }>(rows: T[]) => {
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = String(r?._id);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// 📌 상품 그룹 바꾸기(2026-10-17 — 상품 줄 끌어 다른 그룹에 놓기 · 상세 칸 「그룹」) — 상품 그룹 = 연결 아이템 그룹(lib/productOrder.js productGroupOf)이라 그 아이템의 그룹을 바꾼다(아이템 탭에서도 옮겨진다).
//    못 바꾸는 상품이면 짧은 이유, 되면 "". 세트 — 첫 구성 아이템 그룹을 따른다(그 아이템 · 그 아이템 상품까지 딸려 옮겨지므로 막는다) · 직접 설정(연결 아이템 없음) — 그룹 없음 그대로
const productRegroupBlock = (p: { type?: unknown } | null | undefined, itemIds: ReadonlySet<string>) =>
  p?.type === BUNDLE_TYPE ? "세트는 첫 구성 아이템의 그룹을 따릅니다." : !itemIds.has(anchorItemOf(p)) ? "연결 아이템이 없는 상품은 그룹에 넣을 수 없습니다." : "";

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
//    흰 판(PaneSection) 본문의 마지막이면 끝 줄 Field 의 mb-4 만큼 당긴다(판 아래 여백이 두 겹이 되지 않게)
const PANE_TWO_CSS = ".admin-sec-body>.pane-two:last-child{margin-bottom:-16px}";
function Two({ children }: { children: React.ReactNode }) {
  return (
    <div className="pane-two grid grid-cols-1 md:grid-cols-2 gap-x-4">
      <style href="shop-pane-two" precedence="medium">{PANE_TWO_CSS}</style>
      {children}
    </div>
  );
}
// 📌 상세 칸 흰 판(ui PaneSection)의 접기 — 수정 중이면 접힘을 기억하고(storeKey) 처음엔 open 값(덜 쓰는 판은 접힘).
//    새로 만들기 폼은 다 펼친 채 시작한다(비운 필수 칸이 접힌 판 속에 숨지 않게 · 기억하지 않는다)
const foldOf = (editing: boolean, key: string, open = false) =>
  editing ? { collapsible: true, storeKey: key, defaultOpen: open } : { collapsible: true, defaultOpen: true };
// 📌 접힌 판 속 칸이 저장 검사(min · max)에 걸리면 그 판을 펼치고 말풍선을 띄운다 — 숨은 칸은 브라우저가 알려 주지 못해 저장이 말없이 막히던 것.
//    폼 ref 로 단다(PC 칸 · 모바일 판 폼 둘 다). 같은 판에 걸린 칸이 여럿이어도 한 번만 편다
const revealInvalid = (f: HTMLFormElement | null) => {
  if (!f) return;
  const on = (e: Event) => {
    const el = e.target as HTMLInputElement | null;
    const body = el?.closest<HTMLElement>(".admin-sec-body[hidden]");
    if (!el || !body || body.dataset.revealing) return;
    body.dataset.revealing = "1";
    body.parentElement?.querySelector<HTMLButtonElement>(":scope > div > button[aria-expanded='false']")?.click();
    window.setTimeout(() => { delete body.dataset.revealing; el.reportValidity?.(); }, 0);
  };
  f.addEventListener("invalid", on, true);
  return () => f.removeEventListener("invalid", on, true);
};

// 📌 꾸미기 아이템의 입는 모양(카드 테두리 · 카드 배경 · 프로필 테두리) — 폼의 효과 줄에서 첫 키. 등급 전체 · 테두리 전체는 맨 윗 등급 그림으로
//    (상점 상세 적용 미리보기 lib/itemCosmetic cosmeticOf 와 같은 규칙). 하나도 없으면 null(착용 미리보기 판 없음)
const wearOf = (fx: { on: string; skin: string; scene: string; frame: string }[]) => {
  const sk = fx.find((d) => d.on === "cardSkin" && d.skin)?.skin || "";
  const scene = fx.find((d) => d.on === "cardScene" && d.scene)?.scene || "";
  const fr = fx.find((d) => d.on === "avatarFrame" && d.frame)?.frame || "";
  const skin = sk === SKIN_RANK_ALL ? "rank_igloo" : skinsOf(sk).length ? sk : "";
  const frame = fr === FRAME_ALL ? "igloo" : framesOf(fr).length ? fr : "";
  const sc = scenesOf(scene).length ? scene : "";
  return skin || sc || frame ? { skin, scene: sc, frame } : null;
};
// 📌 착용 미리보기(2026-10-17 승인 시안 shop-tidy ⑤) — 내 프로필 카드 · 디스코드 /레벨 카드에 그 꾸미기를 입혀 본다(입은 모습을 보고 희귀도를 정하게).
//    상점 상세 적용 미리보기(app/arctic/AppliedPreview)와 같은 부품(ProfileCardPreview · FitBox · whoOf)과 같은 디스코드 그림(/api/shop/skin-card?me=1 — 서버가 세션 본인 값으로).
//    사람 값은 /api/xp/me 한 번. 디스코드 카드는 카드 테두리 · 배경이 있을 때만이고, 봇이 못 그리는 키(400)면 그 칸을 뺀다. 칸 크기는 먼저 잡아 그림이 늦게 와도 밀리지 않는다
//    내 값은 한 번만 읽어 둔다(좁은 화면은 상세 칸이 PC 칸 · 모바일 판 둘로 그려진다 · 줄을 넘겨도 다시 읽지 않게). 못 읽으면 다음에 다시
let wearMeLoad: Promise<unknown> | null = null;
const loadWearMe = () => {
  if (!wearMeLoad) {
    wearMeLoad = fetch("/api/xp/me", { cache: "no-store" }).then((r) => r.json()).then((d) => (d?.success ? d.data : null))
      .catch(() => null)
      .then((v) => { if (!v) wearMeLoad = null; return v; });
  }
  return wearMeLoad;
};
function WearPreview({ skin, scene, frame }: { skin: string; scene: string; frame: string }) {
  const { data: session } = useSession();
  const user = session?.user || null;
  const [me, setMe] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    void loadWearMe().then((v) => { if (live && v) setMe(v); });
    return () => { live = false; };
  }, []);
  const today = useTodayXp(!!user && !!me);
  const who = whoOf(user, me, today);
  const src = skin || scene
    ? `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${scene ? `&scene=${encodeURIComponent(scene)}` : ""}${frame ? `&frame=${encodeURIComponent(frame)}` : ""}${user ? "&me=1" : ""}`
    : "";
  const [failed, setFailed] = useState("");
  const discord = !!src && failed !== src;
  const cap = "mt-1.5 text-[11px] font-bold text-[#8a8a8a] text-center";
  return (
    <div className="bg-[#f2f2f2] p-3 flex flex-wrap items-start justify-center gap-3">
      <div className="shrink-0">
        <div className="relative w-[136px] h-[200px] overflow-hidden">
          <FitBox pad={1} max={1}>
            <ProfileCardPreview who={who} skin={skin} scene={scene} frame={frame} />
          </FitBox>
        </div>
        <p className={cap}>프로필 카드</p>
      </div>
      {discord && (
        <div className="min-w-0 flex-1 basis-[200px] max-w-[300px]">
          {/* 칸은 카드 비율(1200 × 630)로 먼저 — 효과를 바꿔 주소가 바뀌어도 앞 그림을 둔 채 새 그림으로 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false} decoding="async" loading="lazy" onError={() => setFailed(src)}
            className="block w-full bg-[#e0e0e0] select-none" style={{ aspectRatio: "1200 / 630" }} />
          <p className={cap}>디스코드 /레벨</p>
        </div>
      )}
    </div>
  );
}

// 📌 표시 토글 — 표 줄(PC <tr> · 모바일 <button>) 안에 놓이므로 <button> 이 아니라 span 으로 만든다(버튼 속 버튼 금지).
//    누르면 줄의 상세 칸이 열리지 않게 전파를 끊는다. 모양은 ui.tsx Switch 와 같은 값.
//    disabled: 실사이트 읽기 전용(liveLocked) — 자리 · 모양은 그대로 두고 흐리게 잠근다
//    📌 2026-10-17 줄 스위치 한 벌 — 아이템 인벤토리 표시 · 상품 판매 · 배너 노출 · 쿠폰 사용 상태가 같은 모양(label · onText · offText 만 다르다).
//       글자 칸은 두 글자 중 긴 쪽 폭을 잡는다(켜고 끌 때 줄이 흔들리지 않게)
function VisSwitch({ on, busy, disabled = false, onToggle, label = "인벤토리 표시", onText = "표시", offText = "숨김" }: {
  on: boolean; busy: boolean; disabled?: boolean; onToggle: () => void; label?: string; onText?: string; offText?: string;
}) {
  const off = busy || disabled;
  const fire = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!off) onToggle();
  };
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-disabled={off}
      aria-label={label}
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fire(e); }}
      className={`inline-flex items-center gap-2 rounded-full ${disabled ? "cursor-default" : "cursor-pointer"} select-none outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${off ? "opacity-40" : ""}`}
    >
      <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${on ? "bg-[#131313]" : "bg-[#d4d4d4]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={`inline-grid text-[12px] font-bold whitespace-nowrap ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>
        <span className={`col-start-1 row-start-1 ${on ? "" : "invisible"}`} aria-hidden={!on || undefined}>{onText}</span>
        <span className={`col-start-1 row-start-1 ${on ? "invisible" : ""}`} aria-hidden={on || undefined}>{offText}</span>
      </span>
    </span>
  );
}

// 📌 상품 초안(lib/catalogDraft.js · /api/admin/catalog-draft — 설계 .claude/mockups/src/catalog-draft/design.md 8절)
//    localhost(CATALOG_DRAFT=1)는 아이템 · 상품 · 배너 쓰기가 초안으로 가고, 머리의 "실사이트 반영"으로 한 번에 옮긴다.
//    실사이트(Vercel)는 그 쓰기를 서버가 막는다(LIVE_LOCKED — 같은 문구) → 화면도 그 조작만 자리를 지킨 채 잠근다
const LIVE_LOCKED_MSG = "상품 · 아이템 수정은 테스트 사이트(localhost)에서 합니다.";
type DraftRow = { kind: string; id: string; op: string; name: string };
type DraftWarn = { kind: string; id: string; name: string; why: string };
type DraftState = {
  loaded: boolean; draftMode: boolean; liveLocked: boolean; total: number;
  counts: Record<string, Record<string, number> | undefined>; rows: DraftRow[]; warnings: DraftWarn[];
};
const EMPTY_DRAFT: DraftState = { loaded: false, draftMode: false, liveLocked: false, total: 0, counts: {}, rows: [], warnings: [] };
// 마지막으로 받은 모드(초안 · 실사이트 읽기 전용) — 다음에 열 때 머리 단추가 처음부터 자리를 잡게(받은 뒤에 붙어 탭 줄이 밀리지 않게)
const DRAFT_MODE_KEY = "admin-shop:catalog-draft-mode";
// setting — 설정 초안(아이템 그룹 차례 · 이벤트 테마 목록 — 줄 이름이 「그룹 순서」 · 「테마 목록」)
const DRAFT_KIND_LABEL: Record<string, string> = { item: "아이템", shopItem: "상품", banner: "배너", setting: "설정" };
const DRAFT_OPS = ["add", "edit", "order", "del"] as const;
const DRAFT_OP_LABEL: Record<string, string> = { add: "추가", edit: "수정", order: "순서", del: "삭제" };
const DRAFT_OP_TONE: Record<string, "ok" | "bad" | "neutral" | "info"> = { add: "ok", edit: "info", order: "neutral", del: "bad" };

// 초안 되돌리기 단추 — 표 줄(PC <tr> · 모바일 <button>) 안이라 span 으로(버튼 속 버튼 금지). 누르면 줄의 상세 칸이 열리지 않게 전파를 끊는다.
//    18px — 이름 줄(13px 글자) 높이 안이라 줄 높이가 그대로다
function RevertMark({ onRevert, disabled = false }: { onRevert: () => void; disabled?: boolean }) {
  const fire = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!disabled) onRevert();
  };
  return (
    <span
      role="button"
      aria-label="초안 되돌리기"
      title="초안 되돌리기"
      aria-disabled={disabled || undefined}
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fire(e); }}
      className={`inline-flex items-center justify-center w-[18px] h-[18px] shrink-0 rounded-full text-[#8a8a8a] select-none outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${disabled ? "opacity-40 cursor-default" : "cursor-pointer hover:text-[#131313] hover:bg-[#ededed]"}`}
    >
      <svg aria-hidden viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={1.9}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 6.5h6.25a2.75 2.75 0 010 5.5H7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 4L3.5 6.5 6 9" />
      </svg>
    </span>
  );
}
// 이름 옆 "초안" 칩 + 되돌리기 — 칩은 유형 배지(TypeBadge)와 같은 높이로 줄여 줄 높이가 바뀌지 않게
function DraftMark({ onRevert, disabled = false }: { onRevert: () => void; disabled?: boolean }) {
  return (
    <span className="shrink-0 inline-flex items-center gap-1">
      <StatusChip tone="info" className="!h-auto py-0.5 !text-[10px]">초안</StatusChip>
      <RevertMark onRevert={onRevert} disabled={disabled} />
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
// Ctrl/⌘+S — 보이는 폼(selector)을 제출(저장 단추와 같은 길 — 숫자 칸 검사 · onSubmit). 덮는 칸은 PC · 모바일 폼이 둘 그려진다
const submitVisible = (selector: string) => {
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>(selector));
  const f = forms.find((x) => x.getClientRects().length > 0) || forms[0];
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
// 그룹 표시(거르기 단추 · 목록)
function FolderMark() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="w-3.5 h-3.5 text-[#8a8a8a]" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinejoin="round" d="M2.5 5.5h5l1.5 2h8.5v8h-15z" />
    </svg>
  );
}
// 상위 그룹 표시 — 겹친 폴더(목록 상위 머리줄과 같은 그림)
function FolderStackMark() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="w-3.5 h-3.5 text-[#5a5a5a]" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path strokeLinejoin="round" d="M2.5 6.5V15a1 1 0 001 1h11M5 4.5h3l1.5 1.5H16a1 1 0 011 1V12a1 1 0 01-1 1H6a1 1 0 01-1-1V4.5z" />
    </svg>
  );
}

// 📌 배너 '클릭 시 이동' 바로 고르기 — 고르면 아래 링크 칸이 그 주소로 채워진다(2026-10-01 "배너 클릭하면 어느 카테고리로 갈 수 있게 선택").
//    스토어 유형 탭은 lib/items.js STORE_TYPE_OPTIONS 한 곳(/arctic?type=<v> — 상점이 이 값으로 그 탭을 연다).
//    이벤트 테마 탭은 테마 목록(lib/shopThemes.js)에서 — /arctic?type=<테마 키>(꺼진 테마는 「꺼짐」 — 켜야 그 탭이 선다)
const BANNER_LINK_CUSTOM = "__custom";
const bannerLinkOptions = (items: any[], themes: { key: string; name: string; on: boolean }[]): DropdownOption[] => [
  { value: "", label: "이동 없음" },
  { value: "g:store", label: "스토어", group: true },
  { value: "/arctic", label: "스토어 홈", indent: true },
  ...STORE_TYPE_OPTIONS.map((t) => ({ value: `/arctic?type=${t.v}`, label: t.l, indent: true })),
  ...themes.map((t) => ({ value: `/arctic?type=${t.key}`, label: t.name, indent: true, ...(t.on ? {} : { hint: "꺼짐" }) })),
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

// 📌 아이템 효과 편집 — 추가 효과 목록(발동 · 상시 · 소모 · 꾸미기). 상세 칸(520px) · 모바일 판 모두에서 줄이 무너지지 않게 줄바꿈을 허용한다.
//    📌 2026-10-17 「기본 효과」 세 칸(채팅 · 음성 1회당 · 출석 시 +N XP)은 추가 효과의 같은 이름 발동 효과와 같은 일이라 합쳤다 —
//       입력칸은 없애고, 값이 남은 아이템만 읽기 전용 줄 + 「추가 효과로 옮기기」(같은 값의 추가 효과 줄을 맨 앞에 넣고 세 칸은 0 — 저장할 때 반영).
//       봇(bot/src/itemEffects.js itemEffectList)은 세 칸을 같은 모양의 효과로 바꿔 앞에 붙여 쓰므로 옮겨도 지급은 같다
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
const HOUR_FROM = Array.from({ length: 24 }, (_, h) => h);
const HOUR_TO = Array.from({ length: 24 }, (_, h) => h + 1);
const selectSm = `${inputClass} !w-[84px] tabular-nums`;
// 📌 스킨 · 테두리 고르기 묶음 — 시즌마다 늘어 한 줄 목록은 찾기 어렵다
// 📌 친구 초대 전용 꾸미기(2026-10-25 「네잎클로버 덩굴」) — 키는 ev_ · evf_ 이지만 할로윈 이벤트가 아니라 따로 묶는다
const INVITE_SKINS = ["ev_clover"];
const INVITE_FRAMES = ["evf_clover"];
// 📌 서버 부스터 전용 꾸미기(2026-10-25 — 카드 테두리 bs_feather · 프로필 테두리 bsf_aura) — 키 bs_ · bsf_
const SKIN_GROUPS: { l: string; has: (s: { v: string }) => boolean }[] = [
  { l: "기본", has: (s) => ["gold", "aurora", "ice", "crimson"].includes(s.v) },
  { l: "시즌 2", has: (s) => ["newworld", "chart", "airship"].includes(s.v) },
  { l: "등급", has: (s) => s.v.startsWith("rank_") },
  { l: "할로윈", has: (s) => s.v.startsWith("hw_") || (s.v.startsWith("ev_") && !INVITE_SKINS.includes(s.v)) }, // ev_* — 할로윈 이벤트(유령 펭귄의 초대)
  { l: "친구 초대", has: (s) => INVITE_SKINS.includes(s.v) },
  { l: "서버 부스터", has: (s) => s.v.startsWith("bs_") },
];
const FRAME_GROUPS: { l: string; all?: boolean; has: (f: { v: string }) => boolean }[] = [
  { l: "등급", all: true, has: (f) => !f.v.includes("_") },
  { l: "할로윈", has: (f) => f.v.startsWith("hwf_") || (f.v.startsWith("evf_") && !INVITE_FRAMES.includes(f.v)) },
  { l: "시즌 2", has: (f) => f.v.startsWith("nwf_") },
  { l: "친구 초대", has: (f) => INVITE_FRAMES.includes(f.v) },
  { l: "서버 부스터", has: (f) => f.v.startsWith("bsf_") },
];
// 📌 카드 배경(2026-10-15) — 이벤트마다 늘어난다. 묶음에 없는 새 배경은 「기타」에(목록에서 빠지지 않게)
const SCENE_HALLOWEEN = ["sc_ghost"];
const SCENE_INVITE = ["sc_clover"]; // 친구 초대 「네잎클로버 덩굴」 한 벌(2026-10-25)
const SCENE_GROUPS: { l: string; has: (s: { v: string }) => boolean }[] = [
  { l: "할로윈", has: (s) => SCENE_HALLOWEEN.includes(s.v) },
  { l: "친구 초대", has: (s) => SCENE_INVITE.includes(s.v) },
  { l: "기타", has: (s) => !SCENE_HALLOWEEN.includes(s.v) && !SCENE_INVITE.includes(s.v) },
];
const subLabel = "mb-1.5 text-[12px] font-bold text-[#5a5a5a]";

// 📌 카드 배경 · 카드 테두리 · 프로필 테두리 고르기 — 긴 목록 칸 대신 그림 칸(2026-10-11 운영자). 묶음(기본 · 시즌 2 · 등급 · 할로윈 · 친구 초대 / 등급 · 할로윈 · 시즌 2 · 친구 초대 / 할로윈 · 친구 초대 · 기타)마다
//    배경 · 카드 테두리는 그 아이콘(lib/cosmeticArt artOfScene · artOfSkin), 프로필 테두리는 테두리 그림(public/avatar-borders — 등급 전체는 아이콘) + 이름.
//    판은 높이 고정(안에서 스크롤) — 효과 줄 높이가 고른 것에 따라 바뀌지 않게. 열 때 고른 칸이 보이게 판 안에서만 굴린다
const COSMETIC_BOX_H = 264;
const PICKER_LABEL = { skin: "카드 테두리", scene: "카드 배경", frame: "프로필 테두리" } as const;
function CosmeticPicker({ kind, value, onChange }: { kind: "skin" | "scene" | "frame"; value: string; onChange: (v: string) => void }) {
  const groups = kind === "skin"
    ? SKIN_GROUPS.map((g) => ({ l: g.l, opts: SKINS.filter(g.has) }))
    : kind === "scene"
      ? SCENE_GROUPS.map((g) => ({ l: g.l, opts: SCENES.filter(g.has) }))
      : FRAME_GROUPS.map((g) => ({ l: g.l, opts: [...FRAMES.filter(g.has), ...(g.all ? [{ v: "all", l: "등급 전체" }] : [])] }));
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 28);
    // 처음 열 때만 — 고를 때마다 판이 튀지 않게
  }, []);
  return (
    <div ref={boxRef} role="group" aria-label={PICKER_LABEL[kind]}
      className="relative mt-2 overflow-y-auto overscroll-contain rounded-lg border border-[#ededed] p-2" style={{ height: COSMETIC_BOX_H }}>
      {groups.map((g) => g.opts.length > 0 && (
        <div key={g.l} className="mb-2.5 last:mb-0">
          <p className="text-[10px] font-bold text-[#a3a3a3] mb-1.5">{g.l}</p>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
            {g.opts.map((o) => {
              const on = value === o.v;
              const img = kind === "frame" ? frameImageOf(o.v) : "";
              return (
                <button key={o.v} type="button" title={o.l} aria-label={o.l} aria-pressed={on} onClick={() => onChange(o.v)}
                  className={`min-w-0 block rounded-lg border px-1 pt-2 pb-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${on ? "border-[#131313] ring-2 ring-[#131313] bg-black/[0.04]" : "border-[#ededed] bg-white hover:border-[#a3a3a3]"}`}>
                  <span className="relative mx-auto mb-1.5 flex items-center justify-center w-11 h-11">
                    {img ? (
                      <>
                        {/* 사진 자리(테두리 그림 가운데 구멍 — 128칸 중 48칸) */}
                        <span aria-hidden className="absolute rounded-full bg-[#d4d4d4]" style={{ width: 15, height: 15 }} />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="absolute inset-0 w-full h-full" />
                      </>
                    ) : (
                      <ArtIcon k={kind === "skin" ? artOfSkin(o.v) : kind === "scene" ? artOfScene(o.v) : artOfFrame(o.v)} size={32} />
                    )}
                  </span>
                  <span className={`block w-full truncate text-center text-[11px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{o.l}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
// 크기 칸 앞 기호 · 뒤 단위 — 문구(describeEffect)와 같은 모양: 할인 · 단축 · 완화는 "−", 캐시백은 기호 없음, 나머지 "+"
const PERK_SIGN: Record<string, string> = { enhanceDiscount: "−", muteRelief: "−", shopCashback: "" };
const unitOf = (t: any, mode: string) => t?.unit || (mode === "percent" ? "%" : "XP");
// 상시 효과 상한 계산 재료(레벨 설정 · 상점 설정 값) — 페이지가 한 번 읽어 넘긴다(상세 칸을 열 때마다 다시 읽지 않게)
type BotCaps = { cooldown: number; mute: number; cashback: number };
const botCapsOf = (s: any): BotCaps => ({ cooldown: Number(s?.chatCooldownSec) || 0, mute: Math.min(100, Math.max(0, Number(s?.muteReducePct) || 0)), cashback: cashbackRuleOf(s).cap });
// 상점 설정 창(머리 「설정」) 칸 — ARCTIC 상점 공개 · 캐시백 합 상한(입력 중엔 글자) · 빙옥 결제분 캐시백
type ShopSet = { pub: boolean; cap: string; onPoint: boolean };
const shopSetOf = (s: any): ShopSet => {
  const r = cashbackRuleOf(s);
  return { pub: !!s?.shopPublic, cap: String(r.cap), onPoint: r.onPoint };
};
const BASIC_BUFFS = [
  { k: "chatBuffXp", on: "chat" },
  { k: "voiceBuffXp", on: "voice" },
  { k: "attendBuffXp", on: "attend" },
] as const;
function EffectsEditor({
  chatBuffXp, voiceBuffXp, attendBuffXp, list, channels, botCaps, onChange,
}: {
  chatBuffXp: string; voiceBuffXp: string; attendBuffXp: string; list: EffectDraft[]; channels: any[]; botCaps: BotCaps | null;
  onChange: (patch: Partial<Pick<ItemForm, "chatBuffXp" | "voiceBuffXp" | "attendBuffXp" | "effects">>) => void;
}) {
  const setRow = (i: number, patch: Partial<EffectDraft>) => onChange({ effects: list.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const chName = (id: string) => channels.find((c) => c.id === id)?.name as string | undefined;
  // 옛 기본 효과 — 값이 있는 칸만(같은 문장 — lib/itemEffects describeItemBasic)
  const basicVals = { chatBuffXp: xpNum(chatBuffXp), voiceBuffXp: xpNum(voiceBuffXp), attendBuffXp: xpNum(attendBuffXp) };
  const basicLines = describeItemBasic(basicVals);
  const basicRows = BASIC_BUFFS.filter((b) => basicVals[b.k] > 0);
  const moveBasics = () => {
    if (list.length + basicRows.length > MAX_EFFECTS) return;
    sfxTick();
    onChange({
      chatBuffXp: "", voiceBuffXp: "", attendBuffXp: "",
      effects: [...basicRows.map((b) => ({ ...newEffect(), on: b.on, mode: "add", amount: String(basicVals[b.k]) })), ...list],
    });
  };
  // 📌 2026-10-04 "상시 효과 숨은 상한은 관리자만 표기" — 상한은 관리자 편집 칸에만 적는다(유저 화면에는 없다).
  //    쿨타임 단축 · 음소거 완화는 상한이 설정값에 따라 바뀐다(채팅 쿨타임의 절반 · 지금 음소거 감소율) — 지금 설정으로 계산해 적는다
  //    캐시백 상한은 관리자 설정(상점 관리 › 설정 — BotSetting.shopCashbackCap, 기본 30%)
  const capText = (t: { v: string; cap?: number; unit?: string }) => {
    if (t.v === "cooldownCut") return botCaps ? `합 최대 ${Math.min(3600, Math.floor(botCaps.cooldown / 2)).toLocaleString()}초 (채팅 쿨타임의 절반)` : "합 최대 채팅 쿨타임의 절반";
    if (t.v === "muteRelief") return botCaps ? `합 최대 ${botCaps.mute}%p (지금 음소거 감소율)` : "합 최대 지금 음소거 감소율";
    if (t.v === "shopCashback") return botCaps ? `합 최대 ${botCaps.cashback}% (상점 관리 › 설정)` : "합 최대 상점 관리 › 설정 값";
    return `합 최대 ${t.cap}${t.unit}`;
  };
  // 상황을 바꾸면 — 없는 방식(%)은 첫 방식으로, 채팅 ↔ 음성이면 맞지 않는 종류의 채널은 뺀다(카테고리 · 모르는 ID 는 둔다).
  //    채널 종류는 TRIGGERS 의 channels("voice" 면 음성, true 면 텍스트)
  //    발동형이 아니면(상시 · 소모 · 꾸미기) 요일 · 시간대 · 채널 조건이 없다 — 비우고 접는다. 카드 배경 · 카드 테두리 · 프로필 테두리는 첫 것을 골라 둔다
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
      ...(t.needs === "frame" && !d.frame ? { frame: FRAMES[0].v } : {}),
      ...(t.needs === "scene" && !d.scene && SCENES[0] ? { scene: SCENES[0].v } : {}),
      // 머물수록 증가 — 최대 % 는 비우면 저장되지 않으므로 20 으로 채워 둔다
      ...(t.maxPct && !d.maxPct ? { maxPct: "20" } : {}),
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
      {/* 옛 기본 효과 — 값이 남은 아이템만(읽기 전용). 옮기면 같은 값의 추가 효과 줄이 맨 앞에 생긴다(저장할 때 반영) */}
      {basicLines.length > 0 && (
        <div className="mb-5">
          <div className={labelClass}>기본 효과</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#f7f7f7] px-3.5 py-3">
            <span className="min-w-0 flex-1 text-[13px] font-bold text-[#131313] tabular-nums break-keep">
              {basicLines.map((l) => <span key={l} className="block">{l}</span>)}
            </span>
            <Btn variant="secondary" size="sm" className="shrink-0" onClick={moveBasics} disabled={list.length + basicRows.length > MAX_EFFECTS}>추가 효과로 옮기기</Btn>
          </div>
        </div>
      )}

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

            {/* 값 줄 — 효과마다 필요한 칸만. 크기가 없는 효과(보호막 · 배지)는 줄이 없다. 카드 배경 · 카드 테두리 · 프로필 테두리는 아래 그림 칸 */}
            {(!t.noAmount || (t.needs && t.needs !== "skin" && t.needs !== "frame" && t.needs !== "scene")) && (
              <Inline className="mt-2">
                {t.needs === "minMinutes" && (
                  <>
                    <input type="number" min={1} max={1440} inputMode="numeric" value={d.minMinutes} onChange={(e) => setRow(i, { minMinutes: e.target.value })} placeholder={t.maxPct ? "25" : "60"} aria-label="분" className={`${inputClass} !w-20 tabular-nums`} />
                    {/* 머물수록 증가는 「이어서 머문 N분마다」 */}
                    <span>{t.maxPct ? "분마다" : "분"}</span>
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
                {!t.noAmount && t.needs !== "seconds" && (
                  <>
                    {/* 📌 레벨업마다 — 처음 오른 레벨 · 다시 오른 레벨 두 줄(아래 줄 again). 이름 칸 폭을 같게 해 두 입력칸이 줄을 맞춘다 */}
                    {t.again && <span className="w-[92px] shrink-0 font-bold text-[#131313]">처음 오른 레벨</span>}
                    {(PERK_SIGN[t.v] ?? "+") && <span>{PERK_SIGN[t.v] ?? "+"}</span>}
                    <input type="number" min={0} max={amountMaxOf(t, d.mode)} inputMode="numeric" value={d.amount} onChange={(e) => setRow(i, { amount: e.target.value })}
                      placeholder={unitOf(t, d.mode) === "XP" ? "100" : "10"} aria-label="크기" className={numClass} />
                    {t.modes.length > 1
                      ? <Segmented options={[{ v: "add", l: "XP" }, { v: "percent", l: "%" }]} value={d.mode} onChange={(v) => setRow(i, { mode: v })} />
                      : <span>{unitOf(t, d.mode)}</span>}
                  </>
                )}
                {/* 📌 최대 %(머물수록 증가 — 2026-10-18 마녀의 모래시계) — 이어서 머물수록 오르는 % 의 끝 */}
                {t.maxPct && (
                  <>
                    <span>최대</span>
                    <input type="number" min={FIELD_RANGE.maxPct[0]} max={FIELD_RANGE.maxPct[1]} inputMode="numeric" value={d.maxPct} onChange={(e) => setRow(i, { maxPct: e.target.value })} placeholder="20" aria-label="최대 %" className={`${inputClass} !w-20 tabular-nums`} />
                    <span>%</span>
                  </>
                )}
                {/* 상시형은 아이템끼리 합한 뒤 상한으로 자른다 */}
                {t.kind === "perk" && t.cap && <span className="text-[#8a8a8a] tabular-nums">{capText(t)}</span>}
              </Inline>
            )}
            {/* 📌 다시 오른 레벨 몫(2026-10-18 운영자 "내려가고 다시 올라갔을 때 … 설정하는 칸") — 상점 · 강화에 XP 를 써서 내려갔다가 다시 오른 레벨.
                   비우면 위 크기의 절반(자리 글자에 그 값) · 0 이면 다시 오른 레벨엔 주지 않는다. 봇 지급(itemEffects levelUpEffectXp)이 이 값을 쓴다 */}
            {t.again && (
              <Inline className="mt-2">
                <span className="w-[92px] shrink-0 font-bold text-[#131313]">다시 오른 레벨</span>
                <span>+</span>
                <input type="number" min={0} max={amountMaxOf(t, d.mode)} inputMode="numeric" value={d.again} onChange={(e) => setRow(i, { again: e.target.value })}
                  placeholder={String(againXpOf({ amount: xpNum(d.amount) }))} aria-label="다시 오른 레벨" className={numClass} />
                <span>XP</span>
                <span className="text-[#8a8a8a]">비우면 절반</span>
              </Inline>
            )}
            {/* 📌 보상 구간 표(음성 N분마다 무작위 XP — 2026-10-18 운영자 "100~5000 인데 그걸 왜 내가 수정을 못해") — 확률 % · 최소 ~ 최대 XP, 최대 CANDY_TIER_MAX 줄.
                   확률은 소수 첫째 자리까지 · 합 100%(틀리면 아래 빨간 줄 · 저장 막음). 「기본으로」는 기본 표(80% 100~800 · 19% 800~1,500 · 1% 1,500~3,000) */}
            {t.tiers && (() => {
              const err = candyTiersError(d.candy);
              const setCandy = (rows: CandyRow[]) => setRow(i, { candy: rows });
              const sum = Math.round(d.candy.reduce((s, r) => s + (Math.round(Number(r.w) * 10) / 10 || 0), 0) * 10) / 10;
              return (
                <div className="mt-2.5 rounded-lg bg-[#f7f7f7] px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12px] font-bold text-[#131313]">보상 구간</span>
                    <Btn variant="secondary" size="sm" disabled={sameCandy(d.candy)} onClick={() => { sfxTick(); setCandy(candyRowsOf(CANDY_TIERS)); }}>기본으로</Btn>
                  </div>
                  {/* 한 줄 칸 — 확률 · 최소 ~ 최대 XP · 빼기가 좁은 편집 칸(약 330px)에서도 접히지 않게 격자(최소 · 최대 칸이 남는 폭을 나눠 가진다) */}
                  {d.candy.map((r, k) => (
                    <div key={k} className="mt-1.5 grid items-center gap-1.5 text-[13px] text-[#5a5a5a]" style={{ gridTemplateColumns: "56px auto minmax(0,1fr) auto minmax(0,1fr) auto 28px" }}>
                      <input type="number" min={0.1} max={100} step={0.1} inputMode="decimal" value={r.w} aria-label={`${k + 1}번째 구간 확률`}
                        onChange={(e) => setCandy(d.candy.map((x, j) => (j === k ? { ...x, w: e.target.value } : x)))} className={`${inputClass} !px-2 tabular-nums`} />
                      <span>%</span>
                      <input type="number" min={0} max={CANDY_XP_MAX} inputMode="numeric" value={r.min} aria-label={`${k + 1}번째 구간 최소`}
                        onChange={(e) => setCandy(d.candy.map((x, j) => (j === k ? { ...x, min: e.target.value } : x)))} className={`${inputClass} !px-2 tabular-nums`} />
                      <span>~</span>
                      <input type="number" min={0} max={CANDY_XP_MAX} inputMode="numeric" value={r.max} aria-label={`${k + 1}번째 구간 최대`}
                        onChange={(e) => setCandy(d.candy.map((x, j) => (j === k ? { ...x, max: e.target.value } : x)))} className={`${inputClass} !px-2 tabular-nums`} />
                      <span>XP</span>
                      <button type="button" aria-label={`${k + 1}번째 구간 빼기`} disabled={d.candy.length <= 1}
                        onClick={() => { sfxTick(); setCandy(d.candy.filter((_, j) => j !== k)); }}
                        className="shrink-0 w-7 h-7 rounded-full text-[#8a8a8a] hover:text-[#d01634] hover:bg-white flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-30 disabled:pointer-events-none">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.4}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Btn variant="secondary" size="sm" disabled={d.candy.length >= CANDY_TIER_MAX}
                      onClick={() => { sfxTick(); const last = d.candy[d.candy.length - 1]; setCandy([...d.candy, { w: "", min: last?.max || "", max: "" }]); }}>+ 구간 추가</Btn>
                    <span className={`text-[12px] tabular-nums ${sum === 100 ? "text-[#8a8a8a]" : "font-bold text-[#d01634]"}`}>합 {sum}%</span>
                  </div>
                  {err && <p className="mt-1.5 text-[12px] font-bold text-[#d01634] break-keep">{err}</p>}
                </div>
              );
            })()}
            {/* 📌 스킨 · 테두리 — 그림 칸(목록 칸은 길어 찾기 어려웠다). key: 효과 종류가 바뀌면 판을 새로 열어 고른 칸으로 굴린다 */}
            {t.needs === "scene" && <CosmeticPicker key={`${d.id}:scene`} kind="scene" value={d.scene} onChange={(v) => setRow(i, { scene: v })} />}
            {t.needs === "skin" && <CosmeticPicker key={`${d.id}:skin`} kind="skin" value={d.skin} onChange={(v) => setRow(i, { skin: v })} />}
            {t.needs === "frame" && <CosmeticPicker key={`${d.id}:frame`} kind="frame" value={d.frame} onChange={(v) => setRow(i, { frame: v })} />}

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
              {norm && TRIGGER_OF[norm.on]?.again && ` · 다시 오른 레벨 +${againXpOf(norm).toLocaleString()} XP`}
            </p>
          </div>
        );
      })}
      <Btn variant="secondary" size="sm" disabled={list.length >= MAX_EFFECTS} onClick={() => onChange({ effects: [...list, newEffect()] })}>+ 효과 추가</Btn>
    </fieldset>
  );
}

// 📌 효과 문구(2026-10-18 운영자 "기본적으로 네가 적고 내가 수정을 할 수 있게") — 인벤토리 · 상품 상세 · 세트 구성 · 패스 보상에 보일 효과 줄(models/Item.js effectText).
//    자동: 지금 효과로 만든 줄(lib/itemEffects autoEffectLinesOf — 꾸미기 문장 없음)을 읽기 전용으로 + 「직접 쓰기」(그 줄로 채워 연다).
//    직접 쓰기: 한 줄에 하나(최대 EFFECT_TEXT_MAX 줄 · 줄마다 EFFECT_TEXT_LINE_MAX 자 — 넘으면 저장 전에 막는다) + 「자동으로 되돌리기」. 바꾸는 것은 표시뿐(지급 규칙은 위 효과 그대로)
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
const fxRawLines = (text: string) => text.split(/\r\n?|\n/).map((l) => l.trim()).filter(Boolean);
//    onTemplates — 「종류별 문구」(자동 문구의 틀 — 효과 종류마다 · EffectTemplatesSheet)를 연다
function EffectTextField({ custom, text, auto, className = "", onChange, onTemplates }: {
  custom: boolean; text: string; auto: string[]; className?: string;
  onChange: (patch: Partial<Pick<ItemForm, "effectCustom" | "effectText">>) => void;
  onTemplates?: () => void;
}) {
  const raw = fxRawLines(text);
  const over = raw.length > EFFECT_TEXT_MAX || raw.some((l) => l.length > EFFECT_TEXT_LINE_MAX);
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-[#131313]">효과 문구</span>
        <span className="flex items-center gap-2">
          {onTemplates && (
            <button type="button" onClick={onTemplates} className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-2 transition-colors">종류별 문구</button>
          )}
          {/* 폭 고정(긴 「직접 작성」 자리) — 바뀌어도 옆 「종류별 문구」가 밀리지 않게 */}
          <StatusChip tone={custom ? "ink" : "neutral"} className="w-[64px] justify-center">{custom ? "직접 작성" : "자동"}</StatusChip>
        </span>
      </div>
      {custom ? (
        <>
          {/* 📌 칸은 넉넉히(2026-10-18 운영자 "칸 좀 더 늘려 답답해") — 최소 4줄 · 쓴 줄 + 1줄(최대 줄 수까지) · 아래로 끌어 늘리기 */}
          <textarea rows={Math.min(EFFECT_TEXT_MAX, Math.max(4, text.split(/\n/).length + 1))} value={text} aria-label="효과 문구" placeholder="한 줄에 효과 하나"
            onChange={(e) => onChange({ effectText: e.target.value })} className={`${inputClass} !px-3.5 !py-3 !text-[16px] md:!text-[15px] !leading-[1.7] resize-y`} />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className={`text-[12px] tabular-nums ${over ? "text-[#d01634] font-bold" : "text-[#8a8a8a]"}`}>{raw.length}/{EFFECT_TEXT_MAX}줄</span>
            <Btn variant="secondary" size="sm" onClick={() => { sfxTick(); onChange({ effectCustom: false, effectText: "" }); }}>자동으로 되돌리기</Btn>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-[#f7f7f7] px-3.5 py-3">
          <span className="min-w-0 flex-1 text-[13px] font-bold text-[#131313] break-keep">
            {auto.length ? auto.map((l, i) => <span key={i} className="block">{l}</span>) : <span className="text-[#a3a3a3]">없음</span>}
          </span>
          <Btn variant="secondary" size="sm" className="shrink-0" onClick={() => { sfxTick(); onChange({ effectCustom: true, effectText: auto.join("\n") }); }}>직접 쓰기</Btn>
        </div>
      )}
    </div>
  );
}

// 📌 적용 범위(2026-10-18 운영자 — 꾸미기는 「효과」가 아니라 「적용 범위」) — 대시보드 · 랭킹 · 명령어 카드 · 알림 카드(lib/itemEffects COSMETIC_SCOPES) 체크 칸.
//    value: 고른 키([] = 자동 — 꾸미기 종류마다 AUTO_SCOPE) · auto: 자동 키 · notes: 키마다 어느 명령어 · 알림인지(scopeNotesOf).
//    자동이면 자동 키가 켜진 채로 보이고, 하나라도 바꾸면 직접 선택(자동과 같아지면 다시 자동). 하나는 늘 남긴다. 「자동」 단추는 늘 같은 자리(자동이면 잠금)
function ScopeEditor({ value, auto, notes, onChange }: { value: string[]; auto: string[]; notes: Record<string, string>; onChange: (v: string[]) => void }) {
  const own = normalizeScope(value);
  const custom = own.length > 0 && own.join(",") !== auto.join(",");
  const on = custom ? own : auto;
  const toggle = (k: string) => {
    const next = normalizeScope(on.includes(k) ? on.filter((x) => x !== k) : [...on, k]);
    if (!next.length) return;
    sfxTick();
    onChange(next.join(",") === auto.join(",") ? [] : next);
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <StatusChip tone={custom ? "ink" : "neutral"}>{custom ? "직접 선택" : "자동"}</StatusChip>
        <Btn variant="secondary" size="sm" disabled={!custom} onClick={() => { sfxTick(); onChange([]); }}>자동</Btn>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {COSMETIC_SCOPES.map((s) => (
          <PickBox key={s.v} on={on.includes(s.v)} inset={false} onToggle={() => toggle(s.v)} className="min-w-0 justify-start">
            <span className="shrink-0">{s.l}</span>
            {notes[s.v] && <span className="min-w-0 truncate font-medium text-[#a3a3a3]">{notes[s.v]}</span>}
          </PickBox>
        ))}
      </div>
    </div>
  );
}

// 📌 세트 구성 편집(lib/bundle.js) — 등록 아이템을 골라 줄을 더하고, 줄마다 기간(영구 / N일) · 개수 · 몸값 · 빼기. 2 ~ 12줄(저장 전 bundleError).
//    줄 차례 = 상점 · 상세에 보이는 구성 차례 — 손잡이로 끌어(↑ ↓ 키도) 바꾼다(2026-10-11 운영자 "세트 구성에서 위 아래 바꿀 수 있는 기능"). 폼 값만 바꾸고 저장은 폼 저장으로
//    개수는 역할 없는 영구 · 쌓이는 아이템만 2 이상(productForm canStackInBundle — 서버 componentProblem 과 같은 조건), 아니면 1로 잠근다.
//    몸값은 XP(빙옥 전용 세트여도 — 서버 저장값 그대로). 모두 적거나 모두 비운다(bundleError).
//    몸값 칸 옆 "상품가" — 그 아이템을 따로 파는 상품이 있으면 같은 기간의 정가로 채운다(없으면 단추 없음).
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
//    stackable: 관리자 아이템 목록 API(lib/unitSale unitThingSet)가 주는 쌓임 여부
// shortName · categoryLabel — 목록 API 가 붙여 주는 짧은 이름 · 분류(lib/itemCategory.js categoryFieldsOf)
type RegLite = { _id: string; name?: string; shortName?: string; categoryLabel?: string; category?: string; icon?: string; imageUrl?: string; color?: string; type?: string; roleId?: string; stackable?: boolean; effects?: unknown };
type ShopLite = { _id: string; name?: string; shortName?: string; itemId?: string; type?: string; active?: boolean; unitSale?: boolean; price?: number; durations?: { days?: number; price?: number }[] };
// 구성 아이템을 따로 파는 상품의 정가 — N일 구성은 그 기간 값, 영구 구성은 무제한 값(기간제만 파는 상품은 없음) × 개수. 판매 중인 상품을 먼저
const soloPriceOf = (shops: ShopLite[], itemId: string, days: number, qty: number): number | null => {
  const list = shops
    .filter((s) => s.type !== BUNDLE_TYPE && String(s.itemId || "") === itemId)
    .sort((a, b) => Number(!!b.active) - Number(!!a.active));
  for (const s of list) {
    const durs = Array.isArray(s.durations) ? s.durations : [];
    let p = 0;
    if (days > 0) p = Number(durs.find((d) => Number(d?.days) === days)?.price) || 0;
    else {
      const inf = durs.find((d) => Number(d?.days) === 0 && Number(d?.price) > 0);
      p = inf ? Number(inf.price) || 0 : durs.some((d) => Number(d?.days) > 0) ? 0 : Number(s.price) || 0;
      p *= Math.max(1, qty);
    }
    if (p > 0) return p;
  }
  return null;
};
// 구성 줄의 개수를 1로 잠그나 — 역할 아이템 · 쌓이지 않는 아이템. 목록에 없는 아이템은 잠그지 않는다(저장 API 가 따로 막는다)
const qtyLockedOf = (regItems: RegLite[], shops: ShopLite[], itemId: string) => {
  const it = regItems.find((x) => String(x._id) === itemId);
  return !!it && !canStackInBundle(it, shops);
};
// 📌 구성에 아이템 여러 개 한 번에 넣기(2026-10-11 운영자 "구성에서 아이템 추가할 때 체크 하는 방식으로 해서 한 번에") — 검색 · 유형 칸 · 체크 → 「N개 추가」.
//    줄마다 상품가(그 아이템을 따로 파는 상품의 무제한 값)와 다른 세트에서 매긴 몸값을 같이 보인다(운영자 "다른 것들 몸값 못 보는 문제") — 몸값 정할 때 참고.
//    이미 든 아이템은 체크된 채 잠그고, 남은 자리(BUNDLE_MAX)만큼만 고를 수 있다. 기프트카드는 세트에 못 넣어 목록에서 뺀다. 넣는 차례 = 목록 차례
const PICK_TYPES = [{ v: "", l: "전체" }, ...ITEM_TYPE_OPTIONS.filter((o) => o.v !== "physical")];
// 다른 세트에서 그 아이템에 매긴 몸값 — 가장 최근 상품(목록 뒤쪽) 것 하나(XP). 없으면 null
const setValueOf = (shops: ShopLite[], itemId: string): number | null => {
  for (let k = shops.length - 1; k >= 0; k--) {
    const s = shops[k] as ShopLite & { bundle?: { itemId?: string; value?: number }[] };
    if (s.type !== BUNDLE_TYPE || !Array.isArray(s.bundle)) continue;
    const c = s.bundle.find((x) => String(x?.itemId || "") === itemId && Number(x?.value) > 0);
    if (c) return Math.floor(Number(c.value) || 0);
  }
  return null;
};
function BundlePicker({ regItems, shops, picked, room, onAdd, onClose }: {
  regItems: RegLite[]; shops: ShopLite[]; picked: ReadonlySet<string>; room: number; onAdd: (ids: string[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  // Esc 는 이 창만 닫는다 — 상세 칸(DetailPane) 안에 떠 있어 그쪽 Esc 가 칸째 닫던 것. 먼저 받도록 잡기 단계에서 듣고 preventDefault(상세 칸은 그것을 보고 비킨다)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const list = regItems.filter((x) => x.type !== "physical");
  const qq = q.trim().toLowerCase();
  // 검색 — 이름 · 분류
  const shown = list.filter((x) => (!type || x.type === type) && (!qq || [x.name, categoryOfRow(x)].some((s) => String(s || "").toLowerCase().includes(qq))));
  const full = sel.length >= room;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((v) => v !== id) : s.length >= room ? s : [...s, id]));
  // 넣는 차례 — 목록(아이템 순서) 차례 그대로(누른 차례가 아니라)
  const add = () => {
    if (!sel.length) return;
    const set = new Set(sel);
    onAdd(list.filter((x) => set.has(String(x._id))).map((x) => String(x._id)));
  };
  return (
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdropClose(onClose)}>
      <div role="dialog" aria-modal="true" aria-label="구성에 아이템 추가" onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="shrink-0 px-5 pt-5 pb-3 border-b border-[#ededed]">
          <div className="flex items-center gap-3">
            <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">구성에 아이템 추가</h2>
            {/* 고른 수 · 남은 자리 — 자리 고정 폭이라 수가 바뀌어도 머리가 흔들리지 않는다 */}
            <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">
              <span className="inline-block min-w-[2ch] text-right text-[#131313]">{sel.length}</span> / {room}
            </span>
            <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="아이템 이름" aria-label="아이템 검색" className={`${inputClass} mt-3`} />
          <div className="mt-2.5">
            <Segmented options={PICK_TYPES.map((o) => ({ ...o, n: list.filter((x) => !o.v || x.type === o.v).length }))} value={type} onChange={setType} />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-[#8a8a8a]">맞는 아이템이 없습니다.</p>
          ) : (
            shown.map((x) => {
              const id = String(x._id);
              const inSet = picked.has(id);
              const on = inSet || sel.includes(id);
              const locked = inSet || (!on && full);
              const solo = soloPriceOf(shops, id, 0, 1);
              const setV = setValueOf(shops, id);
              return (
                <label key={id} className={`flex items-center gap-3 min-h-14 px-5 py-2.5 border-b border-[#ededed] ${locked ? "opacity-50 cursor-default" : "cursor-pointer hover:bg-[#f7f7f7]"}`}>
                  <input type="checkbox" className={CHECK} checked={on} disabled={locked} onChange={() => toggle(id)} aria-label={`${shortOfRow(x) || "아이템"} 고르기`} />
                  <span className="shrink-0"><ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={28} color={x.color || itemTypeColor(x.type)} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold" title={x.name}>{shortOfRow(x) || "이름 없음"}</span>
                    <span className="block truncate text-[12px] text-[#5a5a5a]">{categoryOfRow(x)}{inSet ? " · 이미 있음" : ""}</span>
                  </span>
                  {/* 몸값 참고 — 상품가(따로 파는 무제한 값) · 다른 세트 몸값. 둘 다 없으면 「—」 */}
                  <span className="shrink-0 text-right text-[11px] font-bold tabular-nums leading-tight">
                    {solo != null && <span className="block text-[#131313]">상품가 {solo.toLocaleString()}</span>}
                    {setV != null && <span className="block text-[#8a8a8a]">세트 몸값 {setV.toLocaleString()}</span>}
                    {solo == null && setV == null && <span className="block text-[#a3a3a3]">—</span>}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center justify-end gap-2">
          <Btn variant="secondary" className="w-[88px]" onClick={onClose}>취소</Btn>
          <Btn className="w-[112px] tabular-nums" onClick={add} disabled={sel.length === 0}>{sel.length > 0 ? `${sel.length}개 추가` : "추가"}</Btn>
        </div>
      </div>
    </div>
  );
}
const BUNDLE_SEG = "bundle";
function BundleEditor({ rows, regItems, shops, onChange }: { rows: BundleRow[]; regItems: RegLite[]; shops: ShopLite[]; onChange: (rows: BundleRow[]) => void }) {
  const setRow = (i: number, patch: Partial<BundleRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // 줄 끌기 — 상세 칸 안에서 굴러가므로 창을 따라 굴리지 않는다(그룹 관리 창과 같다)
  const dnd = useRowDrag(
    new Map([[BUNDLE_SEG, rows.map((r) => r.key)]]),
    (keys) => {
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const next = keys.map((k) => byKey.get(k)).filter((r): r is BundleRow => !!r);
      if (next.length === rows.length) onChange(next);
    },
    rows.length < 2,
    { autoScroll: false },
  );
  const picked = new Set(rows.map((r) => r.itemId));
  // 아이템 추가 — 체크해서 여러 개 한 번에(BundlePicker). 기프트카드는 세트에 넣을 수 없어 목록에서 뺀다(lib/bundle componentProblem)
  const [pickOpen, setPickOpen] = useState(false);
  return (
    <div className={`min-w-0 ${dnd.dragging ? "select-none" : ""}`} data-drag-list>
      {rows.map((r, i) => {
        const it = regItems.find((x) => String(x._id) === r.itemId);
        const hasRole = !!String(it?.roleId || "").trim();
        const qtyOk = !r.timed && !qtyLockedOf(regItems, shops, r.itemId);
        const qty = qtyOk ? Math.max(1, Math.floor(Number(r.qty) || 1)) : 1;
        const solo = soloPriceOf(shops, r.itemId, r.timed ? Math.floor(Number(r.days) || 0) : 0, qty);
        return (
          <div key={r.key} data-drag-row data-drag-seg={BUNDLE_SEG} style={dnd.rowStyle(BUNDLE_SEG, i)}
            className={`mb-2 rounded-xl border border-[#ededed] p-3 ${dnd.isLifted(BUNDLE_SEG, i) ? "bg-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]" : "bg-white"}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              {/* 손잡이 — 구성 차례 바꾸기(줄이 하나뿐이면 흐리게) */}
              <span className="shrink-0 -ml-1.5"><DragHandle {...dnd.handleProps(BUNDLE_SEG, i)} /></span>
              <span className="shrink-0"><ItemIcon icon={it?.icon} imageUrl={it?.imageUrl} type={it?.type || "item"} size={28} color={it?.color || itemTypeColor(it?.type)} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold text-[#131313]" title={it?.name}>{it ? shortOfRow(it) || "이름 없음" : "찾을 수 없는 아이템"}</span>
                {it && <span className="block truncate text-[12px] text-[#5a5a5a]">{categoryOfRow(it)}{hasRole ? " · 역할" : ""}</span>}
              </span>
              <button type="button" aria-label="구성 빼기" onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="shrink-0 w-8 h-8 rounded-full text-[#8a8a8a] hover:text-[#d01634] hover:bg-[#f2f2f2] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 기간 · 개수 — 기간제 구성은 1개(쌓기는 영구만) */}
            <Inline className="mt-2.5">
              <Segmented options={[{ v: "forever", l: "영구" }, { v: "timed", l: "기간" }]} value={r.timed ? "timed" : "forever"}
                onChange={(v) => setRow(i, v === "timed" ? { timed: true, days: r.days || "30", qty: "1" } : { timed: false })} />
              {r.timed && (
                <span className="inline-flex items-center gap-2">
                  <input type="number" min={1} max={BUNDLE_DAYS_MAX} inputMode="numeric" value={r.days} onChange={(e) => setRow(i, { days: e.target.value })}
                    placeholder="30" aria-label="기간(일)" className={`${inputClass} !w-20 tabular-nums`} />
                  <span>일</span>
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <span>×</span>
                <input type="number" min={1} max={qtyOk ? BUNDLE_QTY_MAX : 1} inputMode="numeric" disabled={!qtyOk} value={qtyOk ? r.qty : "1"}
                  onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="1" aria-label="개수" className={`${inputClass} !w-16 tabular-nums`} />
              </span>
            </Inline>

            {/* 몸값 — 이미 가진 구성만큼 세트 값을 깎는 비율(lib/bundle bundleQuote) */}
            <Inline className="mt-2">
              <span className="font-bold text-[#131313]">몸값</span>
              <input type="number" min={0} inputMode="numeric" value={r.value} onChange={(e) => setRow(i, { value: e.target.value })}
                placeholder="0" aria-label="몸값" className={numClass} />
              <span>XP</span>
              {solo != null && (
                <Btn variant="secondary" size="sm" className="tabular-nums" disabled={Math.floor(Number(r.value) || 0) === solo}
                  onClick={() => setRow(i, { value: String(solo) })}>
                  상품가 {solo.toLocaleString()}
                </Btn>
              )}
            </Inline>
          </div>
        );
      })}
      {rows.length >= BUNDLE_MAX ? (
        <p className={fieldNote}>최대 {BUNDLE_MAX}개</p>
      ) : regItems.length > 0 ? (
        <Btn variant="secondary" className="w-full" onClick={() => setPickOpen(true)}>아이템 추가</Btn>
      ) : (
        <p className={fieldNote}>등록된 아이템이 없습니다.</p>
      )}
      {pickOpen && (
        <BundlePicker regItems={regItems} shops={shops} picked={picked} room={BUNDLE_MAX - rows.length}
          onClose={() => setPickOpen(false)}
          onAdd={(ids) => {
            const add = ids.filter((id) => !picked.has(id)).slice(0, Math.max(0, BUNDLE_MAX - rows.length));
            if (add.length) onChange([...rows, ...add.map((id) => newBundleRow(id))]);
            setPickOpen(false);
          }} />
      )}
    </div>
  );
}

// 📌 몸값 참고(2026-10-11 운영자 "아이템 등록하는데 다른 것들 몸값 못 보는 문제" — 등록 화면) — 아이템 등록 · 수정 칸 맨 아래(폰에서 위 칸을 밀지 않게), 머리를 눌러 접고 편다.
//    이 아이템: 파는 상품(상품가 — soloPriceOf, 기간제만 팔면 30일 · 7일 값) · 든 세트(그 세트에서 매긴 몸값 — setValueOf).
//    같은 그룹(그룹이 없으면 같은 유형)의 다른 아이템 WORTH_MAX 개까지 — 상품가 · 세트 몸값(구성 추가 창과 같은 값, 없으면 「—」). 값이 있는 것부터 · 목록 차례. 숫자는 XP
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트된다)
const WORTH_MAX = 8;
// 이름 · 상품가 · 세트 몸값 — 임의 grid-template 클래스가 안 먹는 빌드라 인라인으로
const WORTH_GRID: React.CSSProperties = { gridTemplateColumns: "minmax(0,1fr) 76px 76px" };
type WorthRow = { key: string; name: string; off?: boolean; solo: number | null; soloTag?: string; setV: number | null };
// 상품 하나의 상품가 — 무제한 값, 기간제만 팔면 30일(없으면 7일) 값과 그 기간
const shopWorthOf = (s: ShopLite, itemId: string): { v: number | null; tag?: string } => {
  const inf = soloPriceOf([s], itemId, 0, 1);
  if (inf != null) return { v: inf };
  for (const d of [30, 7]) {
    const p = soloPriceOf([s], itemId, d, 1);
    if (p != null) return { v: p, tag: `${d}일` };
  }
  return { v: null };
};
const inBundleOf = (s: ShopLite, itemId: string) =>
  s.type === BUNDLE_TYPE && ((s as ShopLite & { bundle?: { itemId?: string }[] }).bundle || []).some((c) => String(c?.itemId || "") === itemId);
//    📌 2026-10-17 상세 칸 흰 판(PaneSection) 하나 — 처음엔 접힘 · 접힘은 이 브라우저에 기억. 머리 줄에 센 수(이 아이템 상품 · 견줄 아이템)
function WorthRef({ itemId, group, type, regItems, shops }: {
  itemId: string; group: string; type: string; regItems: RegLite[]; shops: ShopLite[];
}) {
  const id = String(itemId || "");
  const own: WorthRow[] = id
    ? [
        ...shops.filter((s) => s.type !== BUNDLE_TYPE && String(s.itemId || "") === id).map((s) => {
          const w = shopWorthOf(s, id);
          return { key: `p:${s._id}`, name: shortOfRow(s) || "이름 없음", off: s.active === false, solo: w.v, soloTag: w.tag, setV: null };
        }),
        ...shops.filter((s) => inBundleOf(s, id)).map((s) => ({ key: `s:${s._id}`, name: shortOfRow(s) || "이름 없음", off: s.active === false, solo: null, setV: setValueOf([s], id) })),
      ]
    : [];
  const g = normalizeItemGroup(group);
  const peers: WorthRow[] = regItems
    .filter((x) => String(x._id) !== id && (g ? groupOfItem(x as { group?: unknown }) === g : x.type === type))
    .map((x) => { const xid = String(x._id); return { key: `i:${xid}`, name: shortOfRow(x) || "이름 없음", solo: soloPriceOf(shops, xid, 0, 1), setV: setValueOf(shops, xid) }; });
  const ranked = [...peers.filter((r) => r.solo != null || r.setV != null), ...peers.filter((r) => r.solo == null && r.setV == null)];
  const shown = ranked.slice(0, WORTH_MAX);
  const num = (v: number | null) => (v != null ? v.toLocaleString() : "—");
  const line = (r: WorthRow) => (
    <div key={r.key} className="grid gap-x-2 items-center min-h-8 py-1 border-t border-[#f2f2f2] text-[12px] font-bold tabular-nums" style={WORTH_GRID}>
      <span className="min-w-0 flex items-center gap-1.5">
        <span className={`min-w-0 truncate ${r.off ? "text-[#a3a3a3]" : "text-[#131313]"}`}>{r.name}</span>
        {r.off && <span className="shrink-0 text-[10px] text-[#a3a3a3]">숨김</span>}
      </span>
      <span className={`text-right leading-tight ${r.solo != null ? "text-[#131313]" : "text-[#a3a3a3]"}`}>
        <span className="block">{num(r.solo)}</span>
        {r.soloTag && <span className="block text-[10px] text-[#8a8a8a]">{r.soloTag}</span>}
      </span>
      <span className={`text-right ${r.setV != null ? "text-[#5a5a5a]" : "text-[#a3a3a3]"}`}>{num(r.setV)}</span>
    </div>
  );
  return (
    <PaneSection title="몸값 참고" collapsible defaultOpen={false} storeKey="shop:item:worth"
      summary={`${own.length ? `상품 ${own.length.toLocaleString()} · ` : ""}${g || itemTypeLabel(type)} ${ranked.length.toLocaleString()}`}>
        <div>
          <div className="grid gap-x-2 pb-1 text-[11px] font-bold text-[#8a8a8a]" style={WORTH_GRID}>
            <span />
            <span className="text-right">상품가</span>
            <span className="text-right">세트 몸값</span>
          </div>
          {own.length > 0 && (
            <div className="mb-3">
              <p className="pt-1.5 pb-1 text-[11px] font-black text-[#5a5a5a]">이 아이템</p>
              {own.map(line)}
            </div>
          )}
          <p className="pt-1.5 pb-1 text-[11px] font-black text-[#5a5a5a] truncate">{g ? `그룹 · ${g}` : `유형 · ${itemTypeLabel(type)}`}</p>
          {shown.length > 0 ? shown.map(line) : <p className="py-1.5 border-t border-[#f2f2f2] text-[12px] text-[#a3a3a3]">없음</p>}
          {ranked.length > shown.length && <p className="pt-1.5 text-[11px] font-bold text-[#8a8a8a] tabular-nums">외 {(ranked.length - shown.length).toLocaleString()}개</p>}
        </div>
    </PaneSection>
  );
}

// 📌 추천 아이템 창 — 목록(lib/itemPresets.js · /api/admin/items/presets)에서 골라 한 번에 등록한다. 같은 이름이 이미 있으면 잠근다(등록됨).
//    모바일은 아래에서 올라오는 판, PC 는 가운데 창. 머리 · 전체 선택 줄 · 아래 동작 줄은 고정이고 목록만 스크롤한다
//    열 때만 그린다(페이지가 presetOpen 일 때 마운트) — 열 때마다 상태가 새로 시작하고 목록을 다시 읽는다
// shortName · categoryLabel — 추천 이름(「카드 테두리 · 골드」)을 나눈 값(API 가 붙인다 — 등록하면 이름은 짧은 이름 · 분류는 따로)
type PresetRow = { key: string; name: string; shortName?: string; categoryLabel?: string; icon: string; group: string; lines: string[]; exists: boolean };
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
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdropClose(busy ? undefined : onClose)}>
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
                    {/* 이름 · 분류(작게) — 등록되는 모양 그대로 */}
                    <span className="flex items-baseline gap-1.5 min-w-0">
                      <span className={`min-w-0 truncate text-[14px] font-bold ${r.exists ? "text-[#a3a3a3]" : ""}`} title={r.name}>{shortOfRow(r)}</span>
                      <span className="shrink-0 text-[11px] font-bold text-[#8a8a8a]">{categoryOfRow(r)}</span>
                    </span>
                    {r.lines.map((l, j) => <span key={j} className="block truncate text-[12px] text-[#5a5a5a] tabular-nums">{l}</span>)}
                  </span>
                  {r.exists && <StatusChip className="shrink-0">등록됨</StatusChip>}
                </label>
              </React.Fragment>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center gap-3">
          {/* 옛 아이콘을 도트로 한 번 바꾸는 이관 줄 — 바꿀 것이 남아 있을 때만 */}
          {pendingIcons > 0 && (
            <label className="min-w-0 flex-1 flex items-center gap-2 text-[13px] font-bold break-keep cursor-pointer">
              <input type="checkbox" className={CHECK} checked={doSwap} disabled={busy} onChange={(e) => setSwap(e.target.checked)} />
              <span className="min-w-0">기존 아이템 아이콘도 도트로 바꾸기</span>
            </label>
          )}
          <Btn className="ml-auto w-[88px] shrink-0" onClick={submit} disabled={busy || rows == null || (!picked.length && !doSwap)}>{busy ? "등록 중…" : "등록"}</Btn>
        </div>
      </div>
    </div>
  );
}

// 📌 그룹 관리 창 — 그룹 목록(목록의 덩어리 차례 · 아이템 수) · 이름 바꾸기 · 새 그룹 · 삭제(아이템은 제자리에서 그룹 없음으로 — 한 번 묻는다) · 끌어서 차례.
//    창의 차례 = 목록의 그룹 덩어리 차례(같은 것). 끌어 놓으면 덩어리들이 목록에서 차지한 자리 안에서 바꿔 끼운다(그룹 없는 아이템은 제자리 — lib/itemOrder.js).
//    빈 그룹은 아이템 든 그룹 뒤에 — 끌기는 아이템 든 그룹끼리 · 빈 그룹끼리만(칸 둘).
//    한 건마다 바로 저장한다(PATCH /api/admin/items { groupOp }) — 결과는 한 줄 알림(toast), 실패는 모달(notify).
//    모바일은 아래에서 올라오는 판, PC 는 가운데 창(추천 아이템 창과 같은 틀). 줄 높이 고정 — 이름 바꾸는 중에도 줄이 밀리지 않는다
type GroupChange = {
  op: "create" | "rename" | "delete" | "order" | "parentCreate" | "parentRename" | "parentDelete" | "parentOrder" | "setParent" | "autoSort";
  name?: string; from?: string; to?: string; names?: string[]; group?: string; parent?: string;
};
const FULL_SEG = "full";
const EMPTY_SEG = "empty";
const PARENT_SEG = "parent";
const NO_PARENT = "";
function IconBtn({ label, onClick, disabled = false, danger = false, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8a8a8a] hover:bg-[#f2f2f2] ${danger ? "hover:text-[#d01634]" : "hover:text-[#131313]"} outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40 disabled:cursor-default`}>
      {children}
    </button>
  );
}
const ICON_SVG = "w-4 h-4";
// 칸 제목 줄(상위 그룹 · 그룹) — 회색 띠 · 작은 글자
function MgrHead({ children }: { children: React.ReactNode }) {
  return <div className="sticky top-0 z-[1] flex items-center gap-2 h-9 px-5 bg-[#f7f7f7] border-b border-[#ededed] text-[12px] font-black text-[#5a5a5a]">{children}</div>;
}
// 📌 상위 그룹(그룹의 그룹 — 2026-10-11): 위 칸 「상위 그룹」(끌어서 차례 · 이름 바꾸기 · 삭제 — 든 그룹은 상위 없음으로) · 그룹 줄마다 상위 고르기.
//    상위에 넣으면 그 상위의 다른 그룹 덩어리 바로 뒤로 옮겨 붙는다(같은 상위는 늘 이어짐). 「자동 정렬」은 머리 오른쪽 — 한 번 묻고 목록 전체를 규칙대로
function GroupManager({
  groups, counts, parents, parentOf, onClose, onLocalOrder, onLocalParentOrder, onSaved, toast, notify,
}: {
  groups: string[];
  counts: ReadonlyMap<string, number>;
  parents: string[];
  parentOf: (group: string) => string; // 그룹의 상위("" = 없음)
  onClose: () => void;
  onLocalOrder: (names: string[]) => () => void; // 끌어 놓자마자 화면 차례 · 목록 순서부터(저장 전에 옛 차례가 비치지 않게) — 돌려주는 것 = 되돌리기
  onLocalParentOrder: (names: string[]) => () => void; // 상위 차례도 같은 이유로
  onSaved: (groups: string[] | null, change: GroupChange, order: string[] | null, d?: any) => void; // order: 서버가 쓴 아이템 순서(id 차례)
  toast: (message: string, isError?: boolean) => void;
  notify: (message: string, isError?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ from: string; to: string; parent?: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [delAsk, setDelAsk] = useState<string | null>(null);
  const [pDelAsk, setPDelAsk] = useState<string | null>(null);
  const [sortAsk, setSortAsk] = useState(false);

  const call = async (change: GroupChange, okMsg: string | ((d: any) => string)) => {
    setBusy(true);
    const { op, ...rest } = change;
    const res = await fetch("/api/admin/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupOp: op, ...rest }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && d?.success) {
      onSaved(Array.isArray(d.groups) ? d.groups.map(String) : null, change, Array.isArray(d.order) ? d.order.map(String) : null, d);
      toast(typeof okMsg === "function" ? okMsg(d) : okMsg);
      return true;
    }
    notify(d?.message || "그룹을 저장하지 못했습니다.", true);
    return false;
  };
  // 아이템 든 그룹(덩어리) · 빈 그룹 — 칸이 달라 서로 사이로는 끌지 않는다(빈 그룹은 늘 뒤)
  const full = groups.filter((g) => (counts.get(g) || 0) > 0);
  const emptyGroups = groups.filter((g) => !((counts.get(g) || 0) > 0));
  const childCount = (p: string) => groups.filter((g) => parentOf(g) === p).length;
  const reorder = async (names: string[]) => {
    const undo = onLocalOrder(names);
    if (!(await call({ op: "order", names }, "순서를 저장했습니다."))) undo();
  };
  const reorderParents = async (names: string[]) => {
    const undo = onLocalParentOrder(names);
    if (!(await call({ op: "parentOrder", names }, "상위 그룹 순서를 저장했습니다."))) undo();
  };
  // 고정 창 안 목록 — 페이지를 따라 굴리지 않는다(창은 그대로라 줄 자리가 어긋난다)
  const dnd = useRowDrag(
    new Map([[PARENT_SEG, parents], [FULL_SEG, full], [EMPTY_SEG, emptyGroups]]),
    (keys, seg) => {
      if (seg === PARENT_SEG) { void reorderParents(keys); return; }
      void reorder(seg === FULL_SEG ? [...keys, ...emptyGroups] : [...full, ...keys]);
    },
    busy,
    { autoScroll: false },
  );

  const taken = (name: string) => groups.includes(name) || parents.includes(name);
  const create = async (asParent: boolean) => {
    const name = normalizeItemGroup(newName);
    if (!name || busy) return;
    if (taken(name)) return notify(parents.includes(name) ? "같은 이름의 상위 그룹이 있습니다." : "같은 이름의 그룹이 있습니다.", true);
    const ok = asParent
      ? await call({ op: "parentCreate", name }, `'${name}' 상위 그룹을 만들었습니다.`)
      : await call({ op: "create", name }, `'${name}' 그룹을 만들었습니다.`);
    if (ok) setNewName("");
  };
  const rename = async () => {
    if (!edit || busy) return;
    const to = normalizeItemGroup(edit.to);
    if (!to) return notify("이름을 입력해 주세요.", true);
    if (to === edit.from) { setEdit(null); return; }
    if (taken(to)) return notify(parents.includes(to) ? "같은 이름의 상위 그룹이 있습니다." : "같은 이름의 그룹이 있습니다.", true);
    const ok = edit.parent
      ? await call({ op: "parentRename", from: edit.from, to }, `상위 그룹 이름을 '${to}'(으)로 바꿨습니다.`)
      : await call({ op: "rename", from: edit.from, to }, `그룹 이름을 '${to}'(으)로 바꿨습니다.`);
    if (ok) setEdit(null);
  };
  const remove = async () => {
    const name = delAsk;
    if (!name || busy) return;
    if (await call({ op: "delete", name }, `'${name}' 그룹을 삭제했습니다.`)) {
      setDelAsk(null);
      if (edit?.from === name) setEdit(null);
    }
  };
  const removeParent = async () => {
    const name = pDelAsk;
    if (!name || busy) return;
    if (await call({ op: "parentDelete", name }, `'${name}' 상위 그룹을 삭제했습니다.`)) {
      setPDelAsk(null);
      if (edit?.from === name) setEdit(null);
    }
  };
  const setParent = async (group: string, parent: string) => {
    if (busy || parentOf(group) === parent) return;
    await call({ op: "setParent", group, parent }, parent ? `'${group}' 그룹을 '${parent}' 안으로 옮겼습니다.` : `'${group}' 그룹을 상위 그룹에서 뺐습니다.`);
  };
  const autoSort = async () => {
    if (busy) return;
    if (await call({ op: "autoSort" }, (d) => (Number(d?.moved) > 0 ? `자동 정렬 — ${Number(d.moved).toLocaleString()}개 자리를 바꿨습니다.` : "이미 정렬되어 있습니다."))) setSortAsk(false);
  };
  const enterKey = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); }
  };
  // 상위 고르기 — 상위 없음 + 상위들(든 그룹 수)
  const parentOptions: DropdownOption[] = [
    { value: NO_PARENT, label: "상위 없음" },
    ...parents.map((p) => ({ value: p, label: p, hint: String(childCount(p)), icon: <FolderStackMark /> })),
  ];
  const editInput = (name: string, parent: boolean) => (
    <input type="text" autoFocus value={edit?.to ?? ""} maxLength={ITEM_GROUP_MAX} aria-label={parent ? "상위 그룹 이름" : "그룹 이름"}
      onChange={(e) => setEdit({ from: name, to: e.target.value, parent })}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); setEdit(null); return; }
        enterKey(rename)(e);
      }}
      className={`${inputClass} !min-h-9 !h-9 !py-1 min-w-0 flex-1`} />
  );
  const editBtns = (name: string, parent: boolean, onDelete: () => void) =>
    edit?.from === name && !!edit.parent === parent ? (
      <>
        <IconBtn label="저장" onClick={rename} disabled={busy}>
          <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </IconBtn>
        <IconBtn label="취소" onClick={() => setEdit(null)} disabled={busy}>
          <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </IconBtn>
      </>
    ) : (
      <>
        <IconBtn label="이름 바꾸기" onClick={() => setEdit({ from: name, to: name, parent })} disabled={busy}>
          <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z" /></svg>
        </IconBtn>
        <IconBtn label={parent ? "상위 그룹 삭제" : "그룹 삭제"} danger onClick={onDelete} disabled={busy}>
          <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
        </IconBtn>
      </>
    );
  const rowCls = (lifted: boolean) => `flex items-center gap-2 h-12 pl-2 pr-3 border-b border-[#ededed] ${lifted ? "bg-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]" : "bg-white"}`;

  return (
    <>
      <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdropClose(busy ? undefined : onClose)}>
        <div role="dialog" aria-modal="true" aria-label="그룹 관리" onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
            <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">그룹 관리</h2>
            {/* 📌 자동 정렬 — 목록 전체를 규칙대로(한 번 묻는다). 그룹 · 상위가 없어도 유형 차례로 놓는다 */}
            <Btn variant="secondary" className="shrink-0 w-[88px]" onClick={() => setSortAsk(true)} disabled={busy}>자동 정렬</Btn>
            <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
              <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div data-drag-list className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${dnd.dragging ? "select-none" : ""}`}>
            {/* 상위 그룹 — 있을 때만 칸이 생긴다 */}
            {parents.length > 0 && (
              <>
                <MgrHead><FolderStackMark />상위 그룹<span className="ml-auto tabular-nums text-[#8a8a8a]">{parents.length}</span></MgrHead>
                {parents.map((p, i) => (
                  <div key={`p:${p}`} data-drag-row data-drag-seg={PARENT_SEG} style={dnd.rowStyle(PARENT_SEG, i)} className={rowCls(dnd.isLifted(PARENT_SEG, i))}>
                    <DragHandle {...dnd.handleProps(PARENT_SEG, i)} />
                    {edit?.from === p && edit.parent ? editInput(p, true) : <span className="min-w-0 flex-1 truncate text-[14px] font-black">{p}</span>}
                    <StatusChip className="shrink-0 tabular-nums">그룹 {childCount(p)}</StatusChip>
                    {editBtns(p, true, () => setPDelAsk(p))}
                  </div>
                ))}
              </>
            )}
            <MgrHead><FolderMark />그룹<span className="ml-auto tabular-nums text-[#8a8a8a]">{groups.length}</span></MgrHead>
            {groups.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#8a8a8a]">그룹이 없습니다.</p>
            ) : (
              groups.map((g) => {
                // 칸 — 아이템 든 그룹 · 빈 그룹(groups 가 이미 그 차례라 각 칸 안 자리만 센다)
                const seg = (counts.get(g) || 0) > 0 ? FULL_SEG : EMPTY_SEG;
                const i = (seg === FULL_SEG ? full : emptyGroups).indexOf(g);
                const p = parentOf(g);
                return (
                  <div key={g} data-drag-row data-drag-seg={seg} style={dnd.rowStyle(seg, i)} className={rowCls(dnd.isLifted(seg, i))}>
                    <DragHandle {...dnd.handleProps(seg, i)} />
                    {edit?.from === g && !edit.parent ? editInput(g, false) : <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{g}</span>}
                    {/* 상위 고르기 — 상위가 하나라도 있을 때만(자리 고정 폭) */}
                    {parents.length > 0 && (
                      <Dropdown theme="light" className="shrink-0 w-[112px] sm:w-[132px]" buttonClassName="!h-8 !py-0 !px-2.5 !rounded-lg !text-[12px] !gap-1.5"
                        value={p} options={parentOptions} onChange={(v) => { void setParent(g, v); }} maxHeight={240} />
                    )}
                    <StatusChip className="shrink-0 tabular-nums">{counts.get(g) || 0}</StatusChip>
                    {editBtns(g, false, () => setDelAsk(g))}
                  </div>
                );
              })
            )}
          </div>

          <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center gap-2">
            <input type="text" value={newName} maxLength={ITEM_GROUP_MAX} onChange={(e) => setNewName(e.target.value)} onKeyDown={enterKey(() => create(false))}
              placeholder="새 이름" aria-label="새 그룹 · 상위 그룹 이름" className={`${inputClass} min-w-0 flex-1`} />
            <Btn variant="secondary" className="w-[80px] shrink-0" onClick={() => create(true)} disabled={busy || !normalizeItemGroup(newName)}>상위 추가</Btn>
            <Btn className="w-[80px] shrink-0" onClick={() => create(false)} disabled={busy || !normalizeItemGroup(newName)}>그룹 추가</Btn>
          </div>
        </div>
      </div>

      {/* 삭제 확인 — 아이템은 지우지 않고 그룹 없음으로 */}
      <ConfirmDialog
        open={!!delAsk}
        danger
        busy={busy}
        title="그룹 삭제"
        confirmLabel="삭제"
        body={delAsk ? <><span className="block font-bold text-[#131313] break-all">{delAsk}</span>아이템 {(counts.get(delAsk) || 0).toLocaleString()}개 → 그룹 없음</> : null}
        onConfirm={remove}
        onCancel={() => setDelAsk(null)}
      />
      {/* 상위 그룹 삭제 — 든 그룹은 그대로(상위 없음으로) */}
      <ConfirmDialog
        open={!!pDelAsk}
        danger
        busy={busy}
        title="상위 그룹 삭제"
        confirmLabel="삭제"
        body={pDelAsk ? <><span className="block font-bold text-[#131313] break-all">{pDelAsk}</span>그룹 {childCount(pDelAsk).toLocaleString()}개 → 상위 없음</> : null}
        onConfirm={removeParent}
        onCancel={() => setPDelAsk(null)}
      />
      {/* 자동 정렬 — 규칙 한 줄 */}
      <ConfirmDialog
        open={sortAsk}
        busy={busy}
        title="자동 정렬"
        confirmLabel="정렬"
        body={<>역할 → 권한 → 아이템 → 꾸미기 → 기프트카드<span className="block mt-1 text-[#8a8a8a]">상위 그룹 → 그룹 → 그룹 없음 · 그룹 안은 등급 차례</span></>}
        onConfirm={autoSort}
        onCancel={() => setSortAsk(false)}
      />
    </>
  );
}

// 📌 이벤트 테마 관리(2026-10-11 운영자 "ㅇㅇ" — lib/shopThemes.js · app/api/shop/themes) — 그룹 관리와 같은 창.
//    줄: 손잡이(끌어서 ARCTIC 탭 차례) · 이름(바꾸기) · 상품 수 · 켜기(ARCTIC 탭 — 한 번에 THEME_ON_MAX 개) · 삭제(한 번 묻는다 — 상품은 테마 없음, 배너는 안 뜬다).
//    아래 칸 「테마 추가」 — 새 테마는 꺼진 채 맨 뒤
type ShopTheme = { key: string; name: string; on: boolean };
const THEME_SEG = "theme";
function ThemeManager({
  themes, counts, bannerCounts, onClose, onLocalOrder, onSaved, toast, notify,
}: {
  themes: ShopTheme[];
  counts: ReadonlyMap<string, number>; // 테마 키 → 상품 수
  bannerCounts: ReadonlyMap<string, number>; // 테마 키 → 배너 수(삭제 확인에)
  onClose: () => void;
  onLocalOrder: (keys: string[]) => () => void; // 끌어 놓자마자 화면 차례부터 — 돌려주는 것 = 되돌리기
  onSaved: (list: ShopTheme[]) => void;
  toast: (message: string, isError?: boolean) => void;
  notify: (message: string, isError?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ key: string; to: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [delAsk, setDelAsk] = useState<ShopTheme | null>(null);

  const call = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    const res = await fetch("/api/shop/themes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBusy(false);
    if (res?.ok && d?.success && Array.isArray(d.data)) {
      onSaved(d.data);
      toast(okMsg);
      return true;
    }
    notify(d?.message || "테마를 저장하지 못했습니다.", true);
    return false;
  };
  const keys = themes.map((t) => t.key);
  const onCount = themes.filter((t) => t.on).length;
  const reorder = async (next: string[]) => {
    const undo = onLocalOrder(next);
    if (!(await call({ op: "order", keys: next }, "순서를 저장했습니다."))) undo();
  };
  // 고정 창 안 목록 — 페이지를 따라 굴리지 않는다(그룹 관리와 같다)
  const dnd = useRowDrag(new Map([[THEME_SEG, keys]]), (next) => { void reorder(next); }, busy, { autoScroll: false });

  const taken = (name: string, except = "") => themes.some((t) => t.key !== except && t.name.toLowerCase() === name.toLowerCase());
  const create = async () => {
    const name = normalizeThemeName(newName);
    if (!name || busy) return;
    const bad = themeNameError(name);
    if (bad) return notify(bad, true);
    if (taken(name)) return notify("같은 이름의 테마가 있습니다.", true);
    if (await call({ op: "create", name }, `'${name}' 테마를 만들었습니다.`)) setNewName("");
  };
  const rename = async () => {
    if (!edit || busy) return;
    const cur = themes.find((t) => t.key === edit.key);
    const to = normalizeThemeName(edit.to);
    const bad = themeNameError(to);
    if (bad) return notify(bad, true);
    if (to === cur?.name) { setEdit(null); return; }
    if (taken(to, edit.key)) return notify("같은 이름의 테마가 있습니다.", true);
    if (await call({ op: "rename", key: edit.key, name: to }, `테마 이름을 '${to}'(으)로 바꿨습니다.`)) setEdit(null);
  };
  const toggle = async (t: ShopTheme) => {
    if (busy) return;
    // 상한은 서버도 막는다 — 여기서 먼저 알려 왕복 없이
    if (!t.on && onCount >= THEME_ON_MAX) return notify(THEME_ON_LIMIT_MESSAGE, true);
    await call({ op: "toggle", key: t.key, on: !t.on }, t.on ? `'${t.name}' 탭을 껐습니다.` : `'${t.name}' 탭을 켰습니다.`);
  };
  const remove = async () => {
    const t = delAsk;
    if (!t || busy) return;
    if (await call({ op: "delete", key: t.key }, `'${t.name}' 테마를 삭제했습니다.`)) {
      setDelAsk(null);
      if (edit?.key === t.key) setEdit(null);
    }
  };
  const enterKey = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); }
  };
  const rowCls = (lifted: boolean) => `flex items-center gap-2 h-12 pl-2 pr-3 border-b border-[#ededed] ${lifted ? "bg-white shadow-[0_14px_30px_-14px_rgba(0,0,0,0.35)]" : "bg-white"}`;

  return (
    <>
      <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" {...backdropClose(busy ? undefined : onClose)}>
        <div role="dialog" aria-modal="true" aria-label="테마 관리" onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-lg max-h-[88dvh] sm:max-h-[84dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white border border-[#ededed] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313] pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div className="shrink-0 flex items-center gap-3 px-5 pt-5 pb-4 border-b border-[#ededed]">
            <h2 className="min-w-0 flex-1 text-[17px] font-black tracking-tight">테마 관리</h2>
            <button type="button" onClick={onClose} disabled={busy} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 disabled:opacity-40">
              <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div data-drag-list className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${dnd.dragging ? "select-none" : ""}`}>
            {/* 머리 — 켠 수 / 상한(ARCTIC 탭 수) */}
            <MgrHead>테마<span className="ml-auto tabular-nums text-[#8a8a8a]">켬 {onCount}/{THEME_ON_MAX}</span></MgrHead>
            {themes.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#8a8a8a]">테마가 없습니다.</p>
            ) : (
              themes.map((t, i) => (
                <div key={t.key} data-drag-row data-drag-seg={THEME_SEG} style={dnd.rowStyle(THEME_SEG, i)} className={rowCls(dnd.isLifted(THEME_SEG, i))}>
                  <DragHandle {...dnd.handleProps(THEME_SEG, i)} />
                  {edit?.key === t.key ? (
                    <input type="text" autoFocus value={edit.to} maxLength={THEME_NAME_MAX} aria-label="테마 이름"
                      onChange={(e) => setEdit({ key: t.key, to: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { e.preventDefault(); setEdit(null); return; }
                        enterKey(rename)(e);
                      }}
                      className={`${inputClass} !min-h-9 !h-9 !py-1 min-w-0 flex-1`} />
                  ) : (
                    <span className={`min-w-0 flex-1 truncate text-[14px] font-bold ${t.on ? "text-[#131313]" : "text-[#8a8a8a]"}`}>{t.name}</span>
                  )}
                  <StatusChip className="shrink-0 tabular-nums">{counts.get(t.key) || 0}</StatusChip>
                  <Switch on={t.on} onChange={() => { void toggle(t); }} disabled={busy} label={`${t.name} 탭 ${t.on ? "끄기" : "켜기"}`} />
                  {edit?.key === t.key ? (
                    <>
                      <IconBtn label="저장" onClick={rename} disabled={busy}>
                        <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      </IconBtn>
                      <IconBtn label="취소" onClick={() => setEdit(null)} disabled={busy}>
                        <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </IconBtn>
                    </>
                  ) : (
                    <>
                      <IconBtn label="이름 바꾸기" onClick={() => setEdit({ key: t.key, to: t.name })} disabled={busy}>
                        <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 4.5l3 3L8 19l-4 1 1-4L16.5 4.5z" /></svg>
                      </IconBtn>
                      <IconBtn label="테마 삭제" danger onClick={() => setDelAsk(t)} disabled={busy}>
                        <svg className={ICON_SVG} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
                      </IconBtn>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-[#ededed] px-5 py-3.5 flex items-center gap-2">
            <input type="text" value={newName} maxLength={THEME_NAME_MAX} onChange={(e) => setNewName(e.target.value)} onKeyDown={enterKey(create)}
              placeholder="새 이름" aria-label="새 테마 이름" className={`${inputClass} min-w-0 flex-1`} />
            <Btn className="w-[80px] shrink-0" onClick={create} disabled={busy || !normalizeThemeName(newName)}>테마 추가</Btn>
          </div>
        </div>
      </div>

      {/* 삭제 확인 — 상품은 지우지 않고 테마 없음으로(한꺼번에 고쳐 쓰지 않는다 — 모르는 키는 테마 없음) */}
      <ConfirmDialog
        open={!!delAsk}
        danger
        busy={busy}
        title="테마 삭제"
        confirmLabel="삭제"
        body={delAsk ? (
          <>
            <span className="block font-bold text-[#131313] break-all">{delAsk.name}</span>
            상품 {(counts.get(delAsk.key) || 0).toLocaleString()}개 → 테마 없음
            {(bannerCounts.get(delAsk.key) || 0) > 0 && <span className="block">배너 {(bannerCounts.get(delAsk.key) || 0).toLocaleString()}개 → 숨김</span>}
          </>
        ) : null}
        onConfirm={remove}
        onCancel={() => setDelAsk(null)}
      />
    </>
  );
}

type PaneKind = "" | "reg" | "product" | "banner" | "coupon" | "order";

// 📌 배너 노출 위치 — 홈(ARCTIC 홈 맨 위) · 시즌 탭 · 테마마다 「<이름> 탭」(스토어 그 탭 맨 위 — 꺼진 테마 포함, lib/shopThemes.js). API(app/api/shop/banners)와 같은 값.
//    값이 없는 옛 배너는 홈. 지운 테마의 배너는 「지운 테마」 칸(있을 때만 — 순서는 못 바꾸고 위치를 골라 옮기거나 지운다). 탭 · 폼이 같은 목록을 쓴다
const BASE_BANNER_PLACES = [{ v: "home", l: "홈" }, { v: "season", l: "시즌 탭" }];
// 지운 테마 칸 값 — 하이픈이라 테마 키(lib/shopThemes isThemeKey)와 겹치지 않는다
const GONE_PLACE = "-gone";
const bannerPlaceOf = (b: { placement?: unknown } | null | undefined) => (typeof b?.placement === "string" && b.placement ? b.placement : "home");

// ══ 상점 관리 › 아이템 — 여러 개 고르기 · 거르기 · 카드 보기 · 붙는 편집기(2026-10-17) ══

// 📌 거르기 — 묶음 안은 「또는」, 묶음끼리는 「그리고」. 희귀도 미지정("" — 일반으로 보인다)은 「미지정」 칩
type ItemFilters = { rarity: string[]; kind: string[]; use: string[]; vis: string[]; draft: string[] };
const NO_FILTERS: ItemFilters = { rarity: [], kind: [], use: [], vis: [], draft: [] };
const RARITY_NONE = "none";
const KIND_FILTERS = [...EFFECT_KINDS, { v: "none", l: "없음" }];
const USE_FILTERS = [{ v: "shop", l: "상품 있음" }, { v: "noshop", l: "상품 없음" }, { v: "pass", l: "패스 있음" }];
const VIS_FILTERS = [{ v: "on", l: "표시" }, { v: "off", l: "숨김" }];
const DRAFT_FILTERS = [{ v: "new", l: "추가" }, { v: "edit", l: "수정" }];
// 효과 종류(발동 · 상시 · 소모 · 꾸미기 — lib/itemEffects EFFECT_KINDS). 옛 기본 효과 세 칸은 발동. 하나도 없으면 「없음」(기프트카드 포함)
const effectKindsOf = (it: any): Set<string> => {
  const out = new Set<string>();
  const ef = it?.effects || {};
  if (it?.type !== "physical") {
    if (Number(ef.chatBuffXp) > 0 || Number(ef.voiceBuffXp) > 0 || Number(ef.attendBuffXp) > 0) out.add("trigger");
    for (const e of Array.isArray(ef.list) ? ef.list : []) {
      const k = TRIGGER_OF[e?.on]?.kind;
      if (k) out.add(k);
    }
  }
  if (!out.size) out.add("none");
  return out;
};
const passItemFilters = (it: any, f: ItemFilters) => {
  if (f.rarity.length && !f.rarity.includes(normalizeRarity(it.rarity) || RARITY_NONE)) return false;
  if (f.kind.length) {
    const ks = effectKindsOf(it);
    if (!f.kind.some((k) => ks.has(k))) return false;
  }
  if (f.use.length) {
    const u = Number(it.usage) || 0;
    const p = Number(it.passUsage) || 0;
    if (!f.use.some((v) => (v === "shop" ? u > 0 : v === "noshop" ? u === 0 : p > 0))) return false;
  }
  if (f.vis.length && !f.vis.includes(it.visible === false ? "off" : "on")) return false;
  if (f.draft.length && !f.draft.includes(String(it._draft || ""))) return false;
  return true;
};

// 📌 열 고르기 — 색상 · 시즌 · 연결 역할은 기본 숨김(정보는 적고 표 폭을 차지한다). 이 브라우저에 기억
const REG_OPTIONAL_COLS = [
  { key: "rarity", label: "희귀도" },
  { key: "role", label: "연결 역할" },
  { key: "color", label: "색상" },
  { key: "usage", label: "사용" },
  { key: "season", label: "시즌" },
];
const REG_HIDDEN_DEFAULT = ["role", "color", "season"];
const REG_SORT_LABEL: Record<string, string> = { name: "이름", rarity: "희귀도", role: "연결 역할", usage: "사용", vis: "인벤토리" };

// 화면에 그려지는 줄 차례 — 묶음 표 · 카드 격자와 같은 셈(묶음은 그 묶음 첫 줄 자리에 모은다). 편집기 ‹ › 가 이 차례로 넘긴다
const displayOrderOf = <T,>(rows: T[], groupOf?: (r: T) => string): T[] => {
  if (!groupOf) return rows;
  const members = new Map<string, T[]>();
  for (const r of rows) {
    const g = groupOf(r) || "";
    if (!g) continue;
    const a = members.get(g);
    if (a) a.push(r);
    else members.set(g, [r]);
  }
  const out: T[] = [];
  const done = new Set<string>();
  for (const r of rows) {
    const g = groupOf(r) || "";
    if (!g) { out.push(r); continue; }
    if (done.has(g)) continue;
    done.add(g);
    out.push(...(members.get(g) || []));
  }
  return out;
};

// 📌 편집기 두 열 — 칸 안쪽 폭이 넉넉하면(넓은 화면에서 붙는 칸을 넓혔을 때) 왼쪽 미리보기 · 기본 칸 | 오른쪽 효과 · 몸값 참고.
//    좁으면 예전처럼 한 열(왼쪽 → 오른쪽 차례). 폭은 틀을 재서 정한다(임의 grid-template 클래스가 안 먹는 빌드라 인라인)
const PANE_TWO_COL = 760;
function PaneColumns({ children }: { children: (wide: boolean) => [React.ReactNode, React.ReactNode] }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= PANE_TWO_COL));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const [left, right] = children(wide);
  return (
    // 📌 2026-10-17 흰 판(PaneSection) 묶음 — 열 사이 · 한 열로 쌓일 때 두 열 사이도 판 사이와 같은 12px
    <div ref={setEl} style={wide ? { display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: 12, alignItems: "start" } : undefined}>
      <div className="min-w-0">{left}</div>
      <div className={wide ? "min-w-0" : "min-w-0 mt-3 empty:mt-0"}>{right}</div>
    </div>
  );
}

// 📌 카드 보기의 아이템 카드 — 평평한 잉크 바닥(#0c0c0c) 위 큰 그림 + 아래 3px 띠(희귀도 색, 안 고른 아이템은 아이템 색) + 이름 · 유형 · 희귀도 · 표시 스위치.
//    희귀도 빛(아래에서 번지는 그라데이션)은 걷었다(2026-10-17 — 승인 시안 ③ · 그라데이션 금지). 틀 · 테두리 · 고르기 칸은 CardGrid 가 그린다
function ItemCard({ it, visBusy, locked, onToggleVis, draftMark }: { it: any; visBusy: boolean; locked: boolean; onToggleVis: () => void; draftMark: React.ReactNode }) {
  const art = withCosmeticIcon(it, it);
  const color = art.color || itemTypeColor(art.type);
  const rk = normalizeRarity(it.rarity);
  const r = rk ? rarityOf(rk) : null;
  const hidden = it.visible === false;
  return (
    <>
      <div className="relative aspect-[4/3] flex items-center justify-center overflow-hidden" style={{ background: "#0c0c0c" }}>
        <span className={hidden ? "opacity-40" : ""}>
          <ItemIcon icon={art.icon} imageUrl={art.imageUrl} type={art.type} size={56} color={color} />
        </span>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: r ? r.c : color }} />
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <p className={`truncate text-[13px] font-black ${hidden ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`} title={it.name}>{shortOfRow(it)}</p>
        <div className="mt-1.5 flex items-center gap-1.5 min-w-0 h-5">
          <TypeBadge type={it.type} label={categoryOfRow(it)} className="shrink-0 px-2 py-0.5 text-[10px]" />
          <RarityMark v={it.rarity} />
          {draftMark}
        </div>
        <div className="mt-2.5">
          <VisSwitch on={!hidden} busy={visBusy} disabled={locked} onToggle={onToggleVis} />
        </div>
      </div>
    </>
  );
}

// 📌 이름 바꾸기 · 복제 창(아래 띠) — 방식: 찾아 바꾸기 · 앞에 붙이기 · 뒤에 붙이기 · 앞머리 빼기(복제는 맨 앞에 「(복사) 붙이기」 — lib/items.js copyNameOf).
//    「설명에도」 — 같은 규칙을 설명에도. 미리보기 「지금 → 바뀐 이름」: 40자 넘김 · 겹침 · 빈 이름은 빨강(보내지 않는다), 그대로는 회색.
//    겹침 — 바꾼 뒤 이름이 다른 아이템(고르지 않은 것 · 바꾼 것 · 복제 원본) 이름과 같은 것
type RenameRule = "copy" | "replace" | "prefix" | "suffix" | "strip";
const RENAME_RULES: { v: RenameRule; l: string }[] = [
  { v: "replace", l: "찾아 바꾸기" },
  { v: "prefix", l: "앞에 붙이기" },
  { v: "suffix", l: "뒤에 붙이기" },
  { v: "strip", l: "앞머리 빼기" },
];
const DUP_RULES: { v: RenameRule; l: string }[] = [{ v: "copy", l: "(복사) 붙이기" }, ...RENAME_RULES];
const applyRule = (s: string, rule: RenameRule, a: string, b: string) => {
  if (rule === "copy") return copyNameOf(s);
  if (rule === "replace") return a ? s.split(a).join(b) : s;
  if (rule === "prefix") return a + s;
  if (rule === "suffix") return s + a;
  return a && s.startsWith(a) ? s.slice(a.length).trimStart() : s;
};
// 고른 이름들의 같은 앞머리(「카드 테두리 · 」처럼 「· 」로 끝나는 데까지) — 「앞머리 빼기」 칸 처음 값
const commonHeadOf = (names: string[]) => {
  if (names.length < 2) return "";
  let p = names[0];
  for (const n of names) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  const at = p.lastIndexOf("· ");
  return at >= 0 ? p.slice(0, at + 2) : "";
};
type RenameRow = { id: string; from: string; to: string; descTo: string; descChanged: boolean; flag: "" | "same" | "empty" | "over" | "descOver" | "dup" };
const RENAME_FLAG: Record<Exclude<RenameRow["flag"], "">, { l: string; bad: boolean }> = {
  same: { l: "그대로", bad: false },
  empty: { l: "빈 이름", bad: true },
  over: { l: `${ITEM_NAME_MAX}자 넘김`, bad: true },
  descOver: { l: `설명 ${DESCRIPTION_MAX}자 넘김`, bad: true },
  dup: { l: "겹침", bad: true },
};
function RenameSheet({ mode, items, allItems, busy, onClose, onSubmit }: {
  mode: "rename" | "duplicate";
  items: any[]; // 고른 아이템(목록 차례)
  allItems: any[]; // 모든 아이템(겹침 검사)
  busy: boolean;
  onClose: () => void;
  onSubmit: (rows: RenameRow[], withDesc: boolean) => void;
}) {
  const dup = mode === "duplicate";
  const [rule, setRule] = useState<RenameRule>(dup ? "copy" : "replace");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [withDesc, setWithDesc] = useState(false);
  const descOn = withDesc && rule !== "copy";
  const pickRule = (v: string) => {
    const next = v as RenameRule;
    setRule(next);
    // 앞머리 빼기 — 고른 이름들의 같은 앞머리를 먼저 넣어 둔다(칸이 비어 있을 때만)
    if (next === "strip" && !a) setA(commonHeadOf(items.map((it) => String(it.name || ""))));
  };
  const picked = new Set(items.map((it) => String(it._id)));
  const rows: RenameRow[] = items.map((it) => {
    const from = String(it.name || "");
    const desc = String(it.description || "");
    const to = applyRule(from, rule, a, b).trim();
    const descTo = descOn ? applyRule(desc, rule, a, b) : desc;
    return { id: String(it._id), from, to, descTo, descChanged: descTo !== desc, flag: "" };
  });
  // 바꾼 뒤 모든 이름(겹침 셈) — 고르지 않은 아이템 + 고른 아이템의 새 이름(복제는 원본 이름도 그대로 남는다)
  const count = new Map<string, number>();
  const add = (n: string) => count.set(n, (count.get(n) || 0) + 1);
  for (const it of allItems) if (dup || !picked.has(String(it._id))) add(String(it.name || "").trim());
  for (const r of rows) add(r.to);
  for (const r of rows) {
    if (!dup && r.to === r.from.trim() && !r.descChanged) r.flag = "same";
    else if (!r.to) r.flag = "empty";
    else if (r.to.length > ITEM_NAME_MAX) r.flag = "over";
    else if (r.descTo.length > DESCRIPTION_MAX) r.flag = "descOver";
    else if ((count.get(r.to) || 0) > 1) r.flag = "dup";
  }
  const ok = rows.filter((r) => !r.flag);
  const needA = rule !== "copy";
  return (
    <FormSheet open onClose={onClose} busy={busy} width={640} title={dup ? "복제" : "이름 바꾸기"} sub={`${items.length.toLocaleString()}개`}
      onSubmit={() => { if (ok.length) onSubmit(ok, descOn); }}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn type="submit" className="min-w-[112px] tabular-nums" disabled={!ok.length}>{ok.length ? `${ok.length.toLocaleString()}개 ${dup ? "복제" : "바꾸기"}` : dup ? "복제" : "바꾸기"}</Btn>
        </>
      }>
      <div className="mb-4">
        <Segmented options={dup ? DUP_RULES : RENAME_RULES} value={rule} onChange={pickRule} />
      </div>
      {needA && (
        <div className={`grid gap-x-3 ${rule === "replace" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
          <Field label={rule === "replace" ? "찾을 글" : rule === "strip" ? "뺄 앞머리" : "붙일 글"}>
            <input type="text" value={a} onChange={(e) => setA(e.target.value)} className={inputClass} autoFocus
              placeholder={rule === "strip" ? "예: 카드 테두리 · " : rule === "prefix" ? "예: [한정] " : rule === "suffix" ? "예:  · 시즌 2" : ""} />
          </Field>
          {rule === "replace" && (
            <Field label="바꿀 글">
              <input type="text" value={b} onChange={(e) => setB(e.target.value)} className={inputClass} />
            </Field>
          )}
        </div>
      )}
      {needA && (
        <label className="mb-4 inline-flex items-center gap-2 text-[13px] font-bold cursor-pointer select-none">
          <input type="checkbox" className={CHECK} checked={withDesc} onChange={(e) => setWithDesc(e.target.checked)} />
          설명에도
        </label>
      )}
      <div className="rounded-xl border border-[#ededed] overflow-hidden">
        <div className="hidden sm:grid gap-x-3 px-3.5 py-2 bg-[#f7f7f7] border-b border-[#ededed] text-[11px] font-bold text-[#8a8a8a]" style={RENAME_GRID}>
          <span>지금</span>
          <span />
          <span>{dup ? "복제본 이름" : "바뀐 이름"}</span>
          <span />
        </div>
        {rows.map((r) => {
          const f = r.flag ? RENAME_FLAG[r.flag] : null;
          return (
            <div key={r.id} className="px-3.5 py-2 border-b border-[#f2f2f2] last:border-b-0 sm:grid sm:items-center gap-x-3" style={RENAME_GRID}>
              <span className="block min-w-0 truncate text-[12px] text-[#8a8a8a]" title={r.from}>{r.from}</span>
              <span aria-hidden className="hidden sm:block text-[#a3a3a3] text-[12px]">→</span>
              <span className="flex items-center gap-2 min-w-0">
                <span className={`min-w-0 truncate text-[13px] font-bold ${f?.bad ? "text-[#d01634]" : f ? "text-[#a3a3a3]" : "text-[#131313]"}`} title={r.to}>{r.to || "—"}</span>
                {r.descChanged && !f && <span className="shrink-0 text-[10px] font-bold text-[#8a8a8a]">설명</span>}
                {f && <StatusChip tone={f.bad ? "bad" : "neutral"} className="sm:hidden shrink-0 ml-auto">{f.l}</StatusChip>}
              </span>
              <span className="hidden sm:flex justify-end">{f && <StatusChip tone={f.bad ? "bad" : "neutral"}>{f.l}</StatusChip>}</span>
            </div>
          );
        })}
      </div>
    </FormSheet>
  );
}
// 미리보기 표 열 — 지금 · → · 바뀐 이름 · 표시(임의 grid-template 클래스가 안 먹는 빌드라 인라인. 폰은 위아래로)
const RENAME_GRID: React.CSSProperties = { gridTemplateColumns: "minmax(0,1fr) 14px minmax(0,1fr) 88px" };

// ══ 상점 관리 › 상품 · 배너 · 쿠폰 · 구매 내역 — 여러 개 고르기 · 거르기 · 카드 보기 · 붙는 편집기 · 줄 스위치(2026-10-17) ══

// 목록 줄(API 그대로 받은 문서) — 이 화면의 다른 목록과 같은 느슨한 모양
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

// 📌 상품 판매 상태 — 숨김(판매 꺼짐) · 판매 종료(판매 중인데 종료 시각이 지남 — lib/saleWindow) · 판매 중. 알약 개수와 줄 표시가 같은 셈이다
//    (예전 「판매 중」 개수는 종료 시각이 지난 상품까지 셌다)
const prodStatusOf = (it: AnyRow) => (!it?.active ? "off" : saleEnded(it) ? "ended" : "on");
const PROD_STATUS_OPTIONS = [{ v: "on", l: "판매 중" }, { v: "ended", l: "판매 종료" }, { v: "off", l: "숨김" }];
// 배너 거르기 › 노출 — 하나만(다시 누르면 전체)
const BANNER_VIS = [{ v: "on", l: "노출 중" }, { v: "off", l: "숨김" }];
const COUPON_STATES = ["사용 가능", "중지", "만료", "소진"];
// 📌 상품 거르기 — 묶음 안은 「또는」, 묶음끼리는 「그리고」(아이템 거르기와 같다). 지운 테마를 가리키는 상품은 「테마 없음」
type ProdFilters = { theme: string[]; disc: string[]; pay: string[]; src: string[] };
const NO_PROD_FILTERS: ProdFilters = { theme: [], disc: [], pay: [], src: [] };
const THEME_NONE = "-none";
const DISC_FILTERS = [{ v: "on", l: "할인 중" }, { v: "off", l: "할인 없음" }];
const PAY_FILTERS = [{ v: "point", l: "빙옥 전용" }, { v: "both", l: "XP · 빙옥" }];
const SRC_FILTERS = [{ v: "linked", l: "등록된 아이템" }, { v: "custom", l: "직접 설정" }, { v: "bundle", l: "세트" }];
const prodSrcOf = (it: AnyRow) => (isBundle(it) ? "bundle" : it?.itemId ? "linked" : "custom");
const prodThemeOf = (it: AnyRow, keys: ReadonlySet<string>) => (it?.theme && keys.has(String(it.theme)) ? String(it.theme) : THEME_NONE);
const passProdFilters = (it: AnyRow, f: ProdFilters, themeKeys: ReadonlySet<string>) => {
  if (f.theme.length && !f.theme.includes(prodThemeOf(it, themeKeys))) return false;
  if (f.disc.length && !f.disc.includes(discountPctOf(it) > 0 ? "on" : "off")) return false;
  if (f.pay.length && !f.pay.includes(it?.pointOnly ? "point" : "both")) return false;
  if (f.src.length && !f.src.includes(prodSrcOf(it))) return false;
  return true;
};
const PROD_SORT_LABEL: Record<string, string> = { name: "이름", status: "판매", price: "가격", stock: "재고", sold: "판매 수" };
// 상품 표에서 끄고 켤 수 있는 열(기본은 모두 보임)
const PROD_OPTIONAL_COLS = [{ key: "type", label: "유형 · 역할" }, { key: "price", label: "가격" }, { key: "stock", label: "재고" }, { key: "sold", label: "판매 수" }];
const COUPON_SORT_LABEL: Record<string, string> = { state: "상태", code: "코드", used: "사용", exp: "만료" };

// 📌 가격 칸(상품 폼 값 — 입력칸 단위: 빙옥 전용이면 빙옥). 기간제는 7일 · 30일(· 무제한), 그 밖(무제한 · 1개 단위 · 기프트카드 · 세트)은 정가 한 칸
type PriceKey = "price" | "price7" | "price30" | "priceInf";
const PRICE_LABEL: Record<PriceKey, string> = { price: "정가", price7: "7일", price30: "30일", priceInf: "무제한" };
const PRICE_KEYS_ALL: PriceKey[] = ["price", "price7", "price30", "priceInf"];
const priceKeysOf = (f: ProductForm): PriceKey[] => (!f.timed ? ["price"] : ["price7", "price30", ...(f.withInf ? (["priceInf"] as PriceKey[]) : [])]);
const priceLineOf = (f: ProductForm) => {
  const parts = priceKeysOf(f).map((k) => ({ k, n: Math.floor(Number(f[k]) || 0) })).filter((x) => x.n > 0);
  if (!parts.length) return "—";
  const unit = formUnit(f);
  return f.timed ? `${parts.map((x) => `${PRICE_LABEL[x.k]} ${x.n.toLocaleString()}`).join(" · ")} ${unit}` : `${parts[0].n.toLocaleString()} ${unit}`;
};
// datetime-local 값(KST "YYYY-MM-DDTHH:mm") → 「2026.10.31 23:59」
const kstLabel = (v: string) => (v ? v.replace("T", " ").replace(/-/g, ".") : "");
// 보내는 값 — 그 1분이 끝날 때까지(상품 폼 toPayload 와 같다). 비우면 "" (서버가 지운다)
const kstSend = (v: string) => (v ? `${v}:59+09:00` : "");

// 📌 일괄 미리보기 — 줄마다 이름 · 「지금 → 바뀐 값」. 빨강(보내지 않음) · 회색 「그대로」. 폰에서도 두 줄로 같은 모양
//    tag — 이름 옆 옅은 글(설명 · 분류 바꾸기: 연결 상품이 바꾸는 곳 「아이템」)
type PreviewRow = { id: string; name: string; tag?: string; from: string; to: string; flag?: { l: string; bad: boolean } | null };
function BatchPreview({ rows }: { rows: PreviewRow[] }) {
  return (
    <div className="rounded-xl border border-[#ededed] overflow-hidden">
      {rows.map((r) => (
        <div key={r.id} className="px-3.5 py-2 border-b border-[#f2f2f2] last:border-b-0">
          <div className="flex items-center gap-2 min-w-0 h-5">
            <span className="min-w-0 truncate text-[13px] font-bold text-[#131313]" title={r.name}>{r.name || "이름 없음"}</span>
            {r.tag && <span className="shrink-0 text-[10px] font-bold text-[#8a8a8a]">{r.tag}</span>}
            <span className="flex-1" />
            {r.flag && <StatusChip tone={r.flag.bad ? "bad" : "neutral"} className="shrink-0 !h-5">{r.flag.l}</StatusChip>}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0 text-[12px] tabular-nums">
            <span className="min-w-0 truncate text-[#8a8a8a]" title={r.from}>{r.from}</span>
            <span aria-hidden className="shrink-0 text-[#a3a3a3]">→</span>
            <span className={`min-w-0 truncate font-bold ${r.flag?.bad ? "text-[#d01634]" : r.flag ? "text-[#a3a3a3]" : "text-[#131313]"}`} title={r.to}>{r.to}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// 📌 상품 일괄 편집 창(아래 띠 「할인 · 판매 종료 · 가격 · 재고」) — 고른 상품마다 바꿀 값을 셈하고 미리보기(지금 → 바뀐 값)를 보인 뒤 「N개 적용」.
//    서버(PATCH /api/shop/items { batch })가 상품 저장과 같은 규칙으로 다시 검사한다. 가격은 상품 폼 규칙(app/arctic/productForm — 판매 방식 · 기준가 · 빙옥 환산) 그대로
//      할인 — 할인율(0 = 할인 없음) · 할인 종료(비우면 계속)
//      판매 종료 — 시각(비우면 끝 없음)
//      가격 — 바꿀 칸(정가 · 7일 · 30일 · 무제한 — 값이 있는 칸만) · 비율(±%, 반올림 단위) 또는 같은 값(XP · 빙옥 — 다른 단위 상품은 환산)
//      재고 — 같은 값(무제한 포함) 또는 더하기(±, 0 아래로 안 내림 · 무제한 재고는 그대로)
type ProdSheetMode = "discount" | "saleEnd" | "price" | "stock";
type ProdEntry = { id: string; set: Record<string, unknown> };
const PROD_SHEET_TITLE: Record<ProdSheetMode, string> = { discount: "할인", saleEnd: "판매 종료", price: "가격", stock: "재고" };
const ROUND_OPTIONS = [{ v: "1", l: "1" }, { v: "100", l: "100" }, { v: "1000", l: "1,000" }, { v: "10000", l: "10,000" }];
function ProdBatchSheet({ mode, items, busy, at, onClose, onSubmit }: {
  mode: ProdSheetMode;
  items: AnyRow[]; // 고른 상품(목록 차례)
  busy: boolean;
  at: number; // 창을 연 시각(ms) — 지난 시각 표시
  onClose: () => void;
  onSubmit: (entries: ProdEntry[]) => void;
}) {
  const [pct, setPct] = useState("");
  const [until, setUntil] = useState("");
  const [keys, setKeys] = useState<PriceKey[]>(PRICE_KEYS_ALL);
  const [op, setOp] = useState("pct");
  const [val, setVal] = useState("");
  const [unit, setUnit] = useState(() => (items.length > 0 && items.every((it) => it?.pointOnly) ? "point" : "xp"));
  const [round, setRound] = useState("100");
  const [stockOp, setStockOp] = useState("set");
  const [unlimited, setUnlimited] = useState(false);

  const rows: { preview: PreviewRow; entry: ProdEntry | null }[] = [];
  let inputOk = true;
  let untilPast = false;
  if (mode === "discount") {
    const n = pct.trim() === "" ? NaN : Number(pct);
    inputOk = Number.isInteger(n) && n >= 0 && n <= 100;
    untilPast = !!until && n > 0 && new Date(`${until}:00+09:00`).getTime() <= at;
    for (const it of items) {
      const curPct = Math.max(0, Math.floor(Number(it.discountPct) || 0));
      const curUntil = curPct > 0 ? toKstInput(it.discountUntil) : "";
      const nextUntil = n > 0 ? until : "";
      const from = curPct > 0 ? `${curPct}%${curUntil ? ` ~${kstLabel(curUntil)}` : ""}` : "없음";
      const to = !inputOk ? "—" : n > 0 ? `${n}%${nextUntil ? ` ~${kstLabel(nextUntil)}` : ""}` : "없음";
      const same = inputOk && curPct === n && curUntil === nextUntil;
      rows.push({
        preview: { id: String(it._id), name: shortOfRow(it), from, to, flag: same ? { l: "그대로", bad: false } : null },
        entry: inputOk && !same ? { id: String(it._id), set: { discountPct: n, discountUntil: n > 0 ? kstSend(until) : "" } } : null,
      });
    }
  } else if (mode === "saleEnd") {
    untilPast = !!until && new Date(`${until}:00+09:00`).getTime() <= at;
    for (const it of items) {
      const cur = toKstInput(it.saleUntil);
      const same = cur === until;
      rows.push({
        preview: { id: String(it._id), name: shortOfRow(it), from: cur ? kstLabel(cur) : "없음", to: until ? kstLabel(until) : "없음", flag: same ? { l: "그대로", bad: false } : null },
        entry: same ? null : { id: String(it._id), set: { saleUntil: kstSend(until) } },
      });
    }
  } else if (mode === "price") {
    const v = Number(val);
    inputOk = val.trim() !== "" && Number.isFinite(v) && (op === "pct" ? v > -100 && v !== 0 : v > 0) && keys.length > 0;
    const r = Number(round) || 1;
    for (const it of items) {
      const f = formFromShopItem(it);
      const touch = priceKeysOf(f).filter((k) => keys.includes(k) && Number(f[k]) > 0);
      const next: ProductForm = { ...f };
      if (inputOk) {
        for (const k of touch) {
          const cur = Math.floor(Number(f[k]) || 0);
          let n: number;
          if (op === "pct") {
            n = cur * (1 + v / 100);
            n = f.pointOnly ? Math.max(1, Math.round(n)) : Math.max(r, Math.round(n / r) * r);
          } else {
            // 같은 값 — 고른 단위로 친 값을 그 상품 단위로(XP → 빙옥은 올림 · 빙옥 → XP 는 ×10,000)
            n = f.pointOnly ? (unit === "xp" ? xpToPoint(v) : Math.floor(v)) : unit === "point" ? pointToXp(Math.floor(v)) : Math.floor(v);
          }
          next[k] = String(Math.max(1, n));
        }
      }
      const same = !inputOk || touch.every((k) => next[k] === f[k]);
      const bad = !same ? saleModeError(next) : "";
      const body = toPayload(next, "");
      rows.push({
        preview: {
          id: String(it._id), name: shortOfRow(it), from: priceLineOf(f), to: inputOk ? priceLineOf(next) : "—",
          flag: bad ? { l: "가격 확인", bad: true } : same && inputOk ? { l: "그대로", bad: false } : null,
        },
        entry: inputOk && !same && !bad ? { id: String(it._id), set: { price: Number(body.price) || 0, durations: body.durations } } : null,
      });
    }
  } else {
    const v = Number(val);
    const setMode = stockOp === "set";
    inputOk = setMode ? unlimited || (val.trim() !== "" && Number.isInteger(v) && v >= 0) : val.trim() !== "" && Number.isInteger(v) && v !== 0;
    for (const it of items) {
      const cur = Number(it.stock) < 0 || it.stock == null ? -1 : Math.floor(Number(it.stock));
      const curTxt = cur < 0 ? "무제한" : cur.toLocaleString();
      if (!setMode && cur < 0) {
        rows.push({ preview: { id: String(it._id), name: shortOfRow(it), from: curTxt, to: curTxt, flag: { l: "무제한", bad: false } }, entry: null });
        continue;
      }
      const next = !inputOk ? cur : setMode ? (unlimited ? -1 : v) : Math.max(0, cur + v);
      const same = !inputOk || next === cur;
      rows.push({
        preview: { id: String(it._id), name: shortOfRow(it), from: curTxt, to: !inputOk ? "—" : next < 0 ? "무제한" : next.toLocaleString(), flag: same && inputOk ? { l: "그대로", bad: false } : null },
        entry: same ? null : { id: String(it._id), set: setMode ? { stock: next } : { stockDelta: v } },
      });
    }
  }
  const entries = rows.map((x) => x.entry).filter((e): e is ProdEntry => !!e);
  const anyXp = items.some((it) => !it?.pointOnly);
  const pastNote = untilPast ? <span className="font-bold text-[#d01634]">이미 지난 시각입니다</span> : undefined;
  const dateRow = (label: string) => (
    <Field label={label} hint={pastNote}>
      <div className="flex items-center gap-2">
        <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
        {until && <Btn variant="ghost" size="sm" onClick={() => setUntil("")}>지우기</Btn>}
      </div>
    </Field>
  );
  return (
    <FormSheet open onClose={onClose} busy={busy} width={640} title={PROD_SHEET_TITLE[mode]} sub={`${items.length.toLocaleString()}개`}
      onSubmit={() => { if (entries.length) onSubmit(entries); }}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn type="submit" className="min-w-[112px] tabular-nums" disabled={!entries.length}>{entries.length ? `${entries.length.toLocaleString()}개 적용` : "적용"}</Btn>
        </>
      }>
      {mode === "discount" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Field label="할인율 (%)">
            <input type="number" min={0} max={100} step={1} inputMode="numeric" autoFocus value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0 = 할인 없음" className={inputClass} />
          </Field>
          {dateRow("할인 종료")}
        </div>
      )}
      {mode === "saleEnd" && dateRow("판매 종료")}
      {mode === "price" && (
        <>
          <Field label="바꿀 칸">
            <div className="flex flex-wrap gap-1.5">
              {PRICE_KEYS_ALL.map((k) => (
                <ChoiceChip key={k} on={keys.includes(k)} onClick={() => setKeys((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]))}>{PRICE_LABEL[k]}</ChoiceChip>
              ))}
            </div>
          </Field>
          <div className="mb-4">
            <Segmented options={[{ v: "pct", l: "비율 (%)" }, { v: "set", l: "같은 값" }]} value={op} onChange={(x) => { setOp(x); setVal(""); }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            <Field label={op === "pct" ? "변경률 (%)" : "가격"}>
              <input type="number" step={op === "pct" ? "any" : 1} inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                placeholder={op === "pct" ? "예: -20" : unit === "point" ? "예: 30" : "예: 300000"} className={inputClass} />
            </Field>
            {op === "set" ? (
              <Field label="단위">
                <Segmented options={[{ v: "xp", l: "XP" }, { v: "point", l: "빙옥" }]} value={unit} onChange={setUnit} />
              </Field>
            ) : anyXp ? (
              <Field label="반올림 (XP)">
                <Segmented options={ROUND_OPTIONS} value={round} onChange={setRound} />
              </Field>
            ) : null}
          </div>
        </>
      )}
      {mode === "stock" && (
        <>
          <div className="mb-4">
            <Segmented options={[{ v: "set", l: "같은 값" }, { v: "add", l: "더하기" }]} value={stockOp} onChange={(x) => { setStockOp(x); setVal(""); setUnlimited(false); }} />
          </div>
          <Field label={stockOp === "set" ? "재고" : "더할 수 (빼려면 −)"}>
            <div className="flex flex-wrap items-center gap-3">
              <input type="number" step={1} inputMode="numeric" autoFocus value={val} disabled={stockOp === "set" && unlimited} onChange={(e) => setVal(e.target.value)}
                placeholder={stockOp === "set" ? "예: 100" : "예: 50"} className={`${numClass} !w-36`} />
              {stockOp === "set" && (
                <label className="inline-flex items-center gap-2 text-[13px] font-bold cursor-pointer select-none">
                  <input type="checkbox" className={CHECK} checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} />
                  무제한
                </label>
              )}
            </div>
          </Field>
        </>
      )}
      <BatchPreview rows={rows.map((x) => x.preview)} />
    </FormSheet>
  );
}

// 📌 설명 바꾸기 · 분류 바꾸기 창(아래 띠 「⋯」 — 2026-10-17 운영자 "설명 한 번에 바꾸는 기능") — 아이템 탭 · 상품 탭이 같이 쓴다.
//    줄(TextTarget)마다 바꿀 문서 하나: 아이템(아이템 탭 줄 · 연결 상품의 연결 아이템 — 설명 · 분류의 원천이라 그 아이템을 바꾼다) · 상품(직접 설정 · 세트).
//    같은 아이템에 연결된 상품 여럿은 한 줄(그 아이템을 바꾸면 연결 상품이 모두 따라간다 — 이름 옆 「아이템」).
//    미리보기 「지금 → 바뀐 값」은 앞 TEXT_PREVIEW_MAX 줄 + 남은 수. 빨강(보내지 않음) · 회색 「그대로」. 보내기는 부르는 쪽(PATCH { batch } — 아이템 · 상품)
type TextTarget = { key: string; kind: "item" | "product"; id: string; name: string; via: boolean; desc: string; category: string; categoryAuto: string };
type TextEntry = { kind: "item" | "product"; id: string; set: Record<string, unknown> };
type TextRow = { preview: PreviewRow; entry: TextEntry | null };
type TextSheetMode = "desc" | "category";
const TEXT_PREVIEW_MAX = 8;
const VIA_TAG = "아이템";
// 바꿀 줄 목록 → 미리보기 줄(앞 몇 줄) + 남은 수 줄
function TextPreview({ rows }: { rows: PreviewRow[] }) {
  const more = rows.length - TEXT_PREVIEW_MAX;
  const badMore = rows.slice(TEXT_PREVIEW_MAX).filter((r) => r.flag?.bad).length;
  return (
    <>
      <BatchPreview rows={rows.slice(0, TEXT_PREVIEW_MAX)} />
      {more > 0 && (
        <p className="mt-2 text-[12px] font-bold text-[#8a8a8a] tabular-nums">
          외 {more.toLocaleString()}개{badMore > 0 && <span className="text-[#d01634]"> · 보내지 않음 {badMore.toLocaleString()}개</span>}
        </p>
      )}
    </>
  );
}
// 설명 정리 — lib/items.js normalizeDescription 과 같은 차례(CRLF → LF · 줄 끝 공백 · 빈 줄 셋까지 · 앞뒤 trim)에서 자르기만 뺀 것(300자 넘김을 알린다)
const descFlat = (v: string) => String(v ?? "").replace(/\r\n?/g, "\n").replace(/[ \t\xa0]+$/gm, "").replace(/\n{4,}/g, "\n\n\n").trim();
// 미리보기 한 줄 — 줄바꿈은 「↵」로
const descLine = (v: string) => (v ? v.replace(/\n/g, " ↵ ") : "없음");
type DescRule = "set" | "replace" | "prefix" | "suffix";
const DESC_RULES: { v: DescRule; l: string }[] = [
  { v: "set", l: "통째로 바꾸기" },
  { v: "replace", l: "찾아 바꾸기" },
  { v: "prefix", l: "앞에 붙이기" },
  { v: "suffix", l: "뒤에 붙이기" },
];
function DescSheet({ targets, busy, onClose, onSubmit }: {
  targets: TextTarget[]; // 고른 줄(목록 차례 · 같은 문서는 한 번)
  busy: boolean;
  onClose: () => void;
  onSubmit: (entries: TextEntry[]) => void;
}) {
  const [rule, setRule] = useState<DescRule>("set");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  // 통째로 바꾸기 — 한 번이라도 적은 뒤부터(열자마자 빈 설명으로 다 지워지게 준비되지 않게 · 적었다 지우면 설명을 지운다).
  //    찾아 바꾸기 · 붙이기는 찾을 · 붙일 글이 있어야 한다
  const [touched, setTouched] = useState(false);
  const inputOk = rule === "set" ? touched : a !== "";
  const rows = targets.map((t): TextRow => {
    const cur = descFlat(t.desc);
    const raw = rule === "set" ? a : rule === "replace" ? (a ? t.desc.split(a).join(b) : t.desc) : rule === "prefix" ? a + t.desc : t.desc + a;
    const to = descFlat(raw);
    const over = to.length > DESCRIPTION_MAX;
    const same = !inputOk || to === cur;
    const flag = over ? { l: `${DESCRIPTION_MAX}자 넘김`, bad: true } : same && inputOk ? { l: "그대로", bad: false } : null;
    return {
      preview: { id: t.key, name: t.name, tag: t.via ? VIA_TAG : undefined, from: descLine(cur), to: inputOk ? descLine(to) : "—", flag },
      entry: inputOk && !same && !over ? { kind: t.kind, id: t.id, set: { description: to } } : null,
    };
  });
  const entries = rows.map((x) => x.entry).filter((e): e is TextEntry => !!e);
  const setLen = rule === "set" ? descFlat(a).length : 0;
  return (
    <FormSheet open onClose={onClose} busy={busy} width={640} title="설명 바꾸기" sub={`${targets.length.toLocaleString()}개`}
      onSubmit={() => { if (entries.length) onSubmit(entries); }}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn type="submit" className="min-w-[112px] tabular-nums" disabled={!entries.length}>{entries.length ? `${entries.length.toLocaleString()}개 바꾸기` : "바꾸기"}</Btn>
        </>
      }>
      <div className="mb-4">
        <Segmented options={DESC_RULES} value={rule} onChange={(v) => { setRule(v as DescRule); setA(""); setB(""); setTouched(false); }} />
      </div>
      {rule === "replace" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
          <Field label="찾을 글">
            <input type="text" value={a} onChange={(e) => setA(e.target.value)} className={inputClass} autoFocus />
          </Field>
          <Field label="바꿀 글">
            <input type="text" value={b} onChange={(e) => setB(e.target.value)} className={inputClass} />
          </Field>
        </div>
      ) : (
        // 줄바꿈 그대로(인벤토리 · 상품 상세는 whitespace-pre-line) — 붙이기도 줄을 바꿔 붙일 수 있게 여러 줄 칸
        <Field label={rule === "set" ? "설명" : "붙일 글"}>
          <textarea key={rule} rows={rule === "set" ? 3 : 2} value={a} autoFocus onChange={(e) => { setA(e.target.value); setTouched(true); }}
            maxLength={rule === "set" ? DESCRIPTION_MAX : undefined} className={`${inputClass} resize-none`} />
          {rule === "set" && <p className="mt-1 text-right text-[12px] text-[#8a8a8a] tabular-nums">{setLen}/{DESCRIPTION_MAX}</p>}
        </Field>
      )}
      <TextPreview rows={rows.map((x) => x.preview)} />
    </FormSheet>
  );
}
// 📌 분류 바꾸기 — 「자동」(저장 "" — 줄마다 그 아이템 · 상품의 자동 분류) · 분류 목록 · 직접 입력(CategoryPicker). 「그대로」 = 저장 칸이 이미 그 값
function CategorySheet({ targets, busy, onClose, onSubmit }: {
  targets: TextTarget[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (entries: TextEntry[]) => void;
}) {
  // picked — 고른 뒤부터(열자마자 「자동」으로 되돌리기가 준비되지 않게 — 처음엔 고르기 칸이 비어 있다)
  const [val, setVal] = useState("");
  const [picked, setPicked] = useState(false);
  const v = normalizeCategory(val);
  const shown = (stored: string, auto: string) => (stored ? stored : `자동 · ${auto || "—"}`);
  const rows = targets.map((t): TextRow => {
    const cur = normalizeCategory(t.category);
    const same = picked && cur === v;
    return {
      preview: { id: t.key, name: t.name, tag: t.via ? VIA_TAG : undefined, from: shown(cur, t.categoryAuto), to: picked ? shown(v, t.categoryAuto) : "—", flag: same ? { l: "그대로", bad: false } : null },
      entry: !picked || same ? null : { kind: t.kind, id: t.id, set: { category: v } },
    };
  });
  const entries = rows.map((x) => x.entry).filter((e): e is TextEntry => !!e);
  return (
    <FormSheet open onClose={onClose} busy={busy} width={640} title="분류 바꾸기" sub={`${targets.length.toLocaleString()}개`}
      onSubmit={() => { if (entries.length) onSubmit(entries); }}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn type="submit" className="min-w-[112px] tabular-nums" disabled={!entries.length}>{entries.length ? `${entries.length.toLocaleString()}개 바꾸기` : "바꾸기"}</Btn>
        </>
      }>
      <Field label="분류">
        <CategoryPicker value={val} unset={!picked} onChange={(x) => { setVal(x); setPicked(true); }} />
      </Field>
      <TextPreview rows={rows.map((x) => x.preview)} />
    </FormSheet>
  );
}

// 📌 카드 보기 — 상품: 상점 카드(ProductCard) 그대로 작게(누를 수 없게 — 카드를 누르면 편집기) + 판매 스위치. 틀 · 고르기 칸은 CardGrid 가 그린다
function ProductTile({ it, busy, locked, onToggle, draftMark }: { it: AnyRow; busy: boolean; locked: boolean; onToggle: () => void; draftMark: React.ReactNode }) {
  const st = prodStatusOf(it);
  return (
    <div className="p-2.5 pb-3">
      <div inert className="pointer-events-none select-none">
        <ProductCard it={it} href="#" wished={false} onWish={() => {}}
          // 숨김 · 판매 종료는 그림 왼쪽 아래(왼쪽 위는 고르기 칸 자리) — 비어 있어도 자리 표시를 넘겨 NEW 딱지가 고르기 칸 밑에 깔리지 않게
          overlay={st !== "on" ? <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">{st === "off" ? "숨김" : "판매 종료"}</span> : <span hidden />} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-h-5">
        <VisSwitch on={!!it.active} busy={busy} disabled={locked} onToggle={onToggle} label="판매" onText="판매 중" offText="숨김" />
        {draftMark}
      </div>
    </div>
  );
}
// 배너 — 그림(4:1) · 제목 · 부제 · 노출 스위치
function BannerTile({ b, busy, locked, onToggle, draftMark }: { b: AnyRow; busy: boolean; locked: boolean; onToggle: () => void; draftMark: React.ReactNode }) {
  return (
    <>
      <div className="relative aspect-[4/1] bg-[#f2f2f2] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.imageUrl} alt="" className={`absolute inset-0 w-full h-full object-cover ${b.active ? "" : "opacity-50"}`} />
      </div>
      <div className="px-3 pt-2.5 pb-3">
        <p className="truncate text-[13px] font-black text-[#131313]">{b.title || "(제목 없음)"}</p>
        <p className="mt-0.5 truncate text-[12px] text-[#5a5a5a] h-[18px]">{b.subtitle || (b.link ? `→ ${b.link}` : "")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-h-5">
          <VisSwitch on={!!b.active} busy={busy} disabled={locked} onToggle={onToggle} label="노출" onText="노출 중" offText="숨김" />
          {draftMark}
        </div>
      </div>
    </>
  );
}

// 📌 CSV 내려받기 — 엑셀이 한글을 읽게 BOM, 수식으로 읽히지 않게 = + - @ 로 시작하는 글은 앞에 '
const csvCell = (v: unknown) => {
  if (typeof v === "number") return String(v);
  let t = String(v ?? "");
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const downloadCsv = (name: string, rows: unknown[][]) => {
  const text = `﻿${rows.map((r) => r.map(csvCell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

// 📌 쿠폰 여러 장 — 만든 코드 창(복사 · CSV). 코드는 서버가 만든다(app/api/shop/coupons bulk)
function CouponCodesSheet({ name, codes, onClose, onCopy, onCsv }: { name: string; codes: string[]; onClose: () => void; onCopy: () => void; onCsv: () => void }) {
  return (
    <FormSheet open onClose={onClose} width={560} title="발급한 코드" sub={`${name ? `${name} · ` : ""}${codes.length.toLocaleString()}장`}
      footer={
        <>
          <Btn variant="secondary" onClick={onCopy}>복사</Btn>
          <Btn variant="secondary" onClick={onCsv}>CSV</Btn>
          <Btn onClick={onClose}>닫기</Btn>
        </>
      }>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 rounded-xl bg-[#f7f7f7] px-3.5 py-3">
        {codes.map((c) => <span key={c} className="truncate font-mono text-[13px] font-bold text-[#131313]">{c}</span>)}
      </div>
    </FormSheet>
  );
}
// 쿠폰 여러 장 입력 — 앞머리 · 장수 · 무작위 글자 수(서버와 같은 범위)
const BULK_COUNT_MAX = 500;
type CouponBulk = { on: boolean; prefix: string; count: string; length: string };
const EMPTY_BULK: CouponBulk = { on: false, prefix: "", count: "10", length: "8" };
// 목록 줄 → 쿠폰 폼 (예전 '수정' 단추 안의 값 그대로 — 만료 일시는 KST 로 바꿔 넣는다. 서버도 KST 로 읽는다)
const couponFormOf = (c: AnyRow) => ({ id: c._id, code: c.code, name: c.name || "", kind: c.kind || "discount", reward: c.reward || "", rewardRoleId: c.rewardRoleId || "", rewardRoleName: c.rewardRoleName || "", rewardXp: c.rewardXp ? String(c.rewardXp) : "", requiredRoleId: c.requiredRoleId || "", requiredRoleName: c.requiredRoleName || "", type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", payScope: c.payScope || "both", minTotal: c.minTotal ? String(c.minTotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit ?? 1), active: c.active, expiresAt: toKstInput(c.expiresAt) });
// 새 쿠폰 폼(빈 값) — 「고친 채 넘어가나」 견줄 바탕이기도 하다
const EMPTY_COUPON = { id: "", code: "", name: "", kind: "discount", reward: "", rewardRoleId: "", rewardRoleName: "", rewardXp: "", requiredRoleId: "", requiredRoleName: "", type: "percent", value: "", maxDiscount: "", payScope: "both", minTotal: "", maxUses: "", perUserLimit: "1", active: true, expiresAt: "" };

// 📌 구매 내역 기간 — 오늘 · 7일 · 30일 · 전체 · 직접(날짜 두 칸). 시작 시각은 고를 때 정한다(화면을 그릴 때마다 지금 시각을 읽지 않게)
const ORDER_PERIODS = [{ v: "today", l: "오늘" }, { v: "7d", l: "7일" }, { v: "30d", l: "30일" }, { v: "all", l: "전체" }, { v: "custom", l: "직접" }];
type OrderPeriod = { v: string; from: number };
const ORDER_TYPE_FILTERS = [...ITEM_TYPE_OPTIONS.map((o) => ({ v: o.v, l: o.l })), { v: BUNDLE_TYPE, l: "세트" }];
const orderTypeOf = (o: AnyRow) => (o?.bundleName ? BUNDLE_TYPE : String(o?.itemType || ""));
const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).getTime() : NaN);

// 📌 뒤로 가기 표지(2026-10-11 「한 번에 수정」에서 되살림 — 10/17 전체 수정) — 고친 게 생기면 지금 기록 자리를 「아래」로 적고 같은 주소로 「위」 자리를 하나 더 쌓는다.
//    뒤로 가기 한 번은 「위」 → 「아래」(같은 주소 — 화면 그대로)라 그때 묻는다. 주소를 안 넘기고 쌓아 Next 라우터는 아무것도 다시 그리지 않는다
const LEAVE_MARK = "__shopLeave";
type LeaveMark = { at: "below" | "top"; n: number };
const leaveMarkOf = (st: unknown): LeaveMark | null => {
  const m = (st as Record<string, unknown> | null)?.[LEAVE_MARK] as LeaveMark | undefined;
  return m && (m.at === "below" || m.at === "top") && typeof m.n === "number" ? m : null;
};
const armLeaveGuard = (): LeaveMark => {
  const cur = leaveMarkOf(window.history.state);
  if (cur?.at === "top") return cur;
  const n = cur ? cur.n : Date.now();
  if (!cur) window.history.replaceState({ ...(window.history.state || {}), [LEAVE_MARK]: { at: "below", n } }, "");
  const top: LeaveMark = { at: "top", n };
  window.history.pushState({ ...(window.history.state || {}), [LEAVE_MARK]: top }, "");
  return top;
};
const backLeaveAsk = (name: string) => `저장하지 않은 수정(${name})이 있습니다. 나가면 사라집니다. 나갈까요?`;

export default function AdminShopPage() {
  const { isAdmin, gate } = useAdminGuard();
  // 📌 효과음 — 토스트 · 알림 창이 뜰 때 같이 울린다(ui.tsx useToast · useNotice — 성공 sfxOk · 실패 sfxErr). 여기서 따로 울리지 않는다(두 번 울리던 것)
  const { notify, noticeEl } = useNotice();
  // 결과 한 줄(토스트). 놓치면 안 되는 실패 · 건너뜀 목록은 알림 창(notify · 실패는 fail)
  const { toast, toastEl } = useToast();
  const fail = useCallback((message: string) => notify(message, true), [notify]);
  const router = useRouter();

  const searchParams = useSearchParams();
  // 상점 카드의 '수정' 링크(?edit=<id>)는 탭 없이 들어오므로 상품 탭으로 보낸다.
  // 📌 상점 설정 창 주소(isSettingsLink — 기능 검색 「상점 설정」 · ARCTIC 「비공개 · 공개로 바꾸기」)는 탭을 바꾸지 않는다 —
  //    탭 없이 오면 지금 보던 탭(lastTab) 그대로(처음 들어오면 아이템). 옛 ?tab=settings 도 같다
  const settingsLink = isSettingsLink(searchParams);
  const rawTab = searchParams.get("tab") || "";
  const [lastTab, setLastTab] = useState("items");
  const tab = tabOfParams(searchParams, lastTab);
  if (tab !== lastTab) setLastTab(tab);
  // 옮긴 탭의 옛 주소(?tab=season — 역할 떼기) → 그 화면으로 넘긴다
  const movedTo = MOVED_TAB[rawTab] || "";
  useEffect(() => { if (movedTo) router.replace(movedTo); }, [movedTo, router]);
  // 📌 붙는 편집기(DetailPane docked — 1280 이상). 넓은 화면은 처음 폭을 넓혀 편집기 안이 두 열(PaneColumns)로 — 끌어 바꾼 폭은 ui 가 기억한다
  const wideDock = useMedia("(min-width: 1280px)");
  const paneXl = useMedia("(min-width: 1920px)");
  const paneXxl = useMedia("(min-width: 2400px)");
  // 도구 줄 「⋯」 › 보이는 열 고르기 — 표 열은 PC(768 이상)에서만 고른다(예전 「열」 단추와 같은 폭)
  const colsPickable = useMedia("(min-width: 768px)");
  const [colsMenuOpen, setColsMenuOpen] = useState(false);
  const regPaneW = paneXxl ? 1040 : paneXl ? 880 : 452; // 1440 아래는 시안 폭(452) — 목록 칸 도구 줄이 한 줄에 들어가게

  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  // 📌 구매 내역 더 보기 — 한 번에 500건(app/api/shop/orders 쪽 넘김). ordersNext: 다음 쪽 커서("" 이면 끝).
  //    ordersDepth: 펼친 건 수 — 처리 뒤 다시 읽을 때 그만큼 읽어, 더 보기로 찾은 옛 주문이 목록에서 사라지지 않게
  const [ordersNext, setOrdersNext] = useState("");
  const [ordersBusy, setOrdersBusy] = useState(false);
  const ordersDepth = useRef(0);
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
  // 상품 판매 상태 알약 — "" 전체 · on 판매 중 · ended 판매 종료 · off 숨김(prodStatusOf)
  const [productView, setProductView] = useState("");
  // 📌 상품 유형 탭(2026-10-11 운영자 "상품에 제발 탭 좀 나눠줘") — 아이템 탭의 유형 칸과 같은 모양 + 세트. "" = 전체
  const [productType, setProductType] = useState("");
  // 📌 상품 묶음(B안) — 연결 아이템의 그룹 · 상위로 머리줄(세트는 첫 구성 아이템 그룹 — lib/productOrder.js). 펼친 그룹(기본 접힘) · 접은 상위(기본 펼침).
  //    아이템 목록처럼 이 브라우저에 기억한다(「모두 펼치기 / 접기」)
  const [openProductGroupList, setOpenProductGroupList] = useStoredState<string[]>("open:shop-products", []);
  const openProductGroups = useMemo(() => new Set(Array.isArray(openProductGroupList) ? openProductGroupList : []), [openProductGroupList]);
  const [closedProductSectionList, setClosedProductSectionList] = useStoredState<string[]>("closed:shop-products", []);
  const closedProductSections = useMemo(() => new Set(Array.isArray(closedProductSectionList) ? closedProductSectionList : []), [closedProductSectionList]);
  const [syncAsk, setSyncAsk] = useState(false);
  // 📌 상품 목록 보기(2026-10-17) — 「표 | 카드」 · 열 머리 정렬 · 거르기 · 고르기(아래 띠) · 줄 판매 스위치
  const [prodViewMode, setProdViewMode] = useStoredState<ViewMode>("view:shop-products", "table");
  const [prodSort, setProdSort] = useState<SortState>(null);
  const [prodHiddenCols, setProdHiddenCols] = useStoredState<string[]>("cols:shop-products", []);
  const [prodFilters, setProdFilters] = useState<ProdFilters>(NO_PROD_FILTERS);
  // prodBusy: 일괄 편집 보내는 중 · prodSheet: 열린 창 · prodSheetAt: 창을 연 시각(지난 시각 표시) · prodDelAsk: 일괄 삭제 확인 · prodSwitchBusy: 줄 스위치 저장 중(상품 id)
  const [prodBusy, setProdBusy] = useState(false);
  const [prodSheet, setProdSheet] = useState<"" | ProdSheetMode>("");
  const [prodSheetAt, setProdSheetAt] = useState(0);
  const [prodDelAsk, setProdDelAsk] = useState(false);
  const [prodSwitchBusy, setProdSwitchBusy] = useState("");
  const [bannerView, setBannerView] = useState("");
  // 📌 배너 보기 — 「표 | 카드(그림 격자)」 · 줄 노출 스위치(배너 id)
  const [bannerViewMode, setBannerViewMode] = useStoredState<ViewMode>("view:shop-banners", "table");
  const [bannerSwitchBusy, setBannerSwitchBusy] = useState("");
  // 📌 배너 노출 위치 탭 — 위치마다 따로 보여 주고 그 안에서 끌어 순서를 바꾼다(2026-10-11 운영자 "배너도 노출 순서 편하게")
  const [bannerPlace, setBannerPlace] = useState("home");
  // 📌 이벤트 테마(lib/shopThemes.js · app/api/shop/themes) — 상품 폼 고르기 칸 · 배너 위치 · 배너 링크 · 테마 관리 창이 같이 쓴다(fetchAll 이 받는다).
  //    받기 전엔 기본 목록(설정이 없을 때와 같은 할로윈 하나) — 받은 뒤 배너 위치 칸이 한 칸 늘었다 줄지 않게. 못 받으면 지금 값 그대로
  const [themes, setThemes] = useState<ShopTheme[]>(() => DEFAULT_THEMES.map((t) => ({ ...t })));
  const [themeManageOpen, setThemeManageOpen] = useState(false);
  const [couponView, setCouponView] = useState("");
  const [coupons, setCoupons] = useState<AnyRow[]>([]);
  const [couponForm, setCouponForm] = useState<AnyRow>(EMPTY_COUPON);
  // 📌 쿠폰 — 열 머리 정렬 · 줄 사용 상태 스위치(쿠폰 id) · 여러 장 발급(새 쿠폰 폼) · 만든 코드 창
  const [couponSort, setCouponSort] = useState<SortState>(null);
  const [couponSwitchBusy, setCouponSwitchBusy] = useState("");
  const [couponBulk, setCouponBulk] = useState<CouponBulk>(EMPTY_BULK);
  const [couponCodes, setCouponCodes] = useState<{ name: string; codes: string[] } | null>(null);
  const [couponSaving, setCouponSaving] = useState(false);
  // 📌 구매 내역 — 기간(시작 시각은 고를 때 정한다) · 직접 기간(날짜 두 칸) · 상품 유형 거르기
  const [orderPeriod, setOrderPeriod] = useState<OrderPeriod>({ v: "all", from: 0 });
  const [orderFrom, setOrderFrom] = useState("");
  const [orderTo, setOrderTo] = useState("");
  const [orderTypes, setOrderTypes] = useState<string[]>([]);
  // 📌 순서 — 아이템 · 상품 목록은 늘 줄 앞 손잡이로 끌어 옮기고, 놓으면 바로 저장한다(2026-10-11 운영자 — '순서 바꾸기' 모드 · 단추를 걷었다).
  //    savingOrder: 저장 중인 목록(그동안 끌기만 잠근다)
  const [savingOrder, setSavingOrder] = useState<"" | "reg" | "product" | "banner">("");
  // 📌 아이템 그룹 — regGroup: 그룹 거르기(GROUP_ALL · GROUP_NONE · "g:<이름>" · "p:<상위>"), regGroupSaved: 서버에 둔 그룹 차례(빈 그룹 포함)
  //    펼친 그룹(기본 접힘) · 접은 상위(기본 펼침)는 이 브라우저에 기억한다(useStoredState — 「모두 펼치기 / 접기」)
  const [regGroup, setRegGroup] = useState(GROUP_ALL);
  const [openGroupList, setOpenGroupList] = useStoredState<string[]>("open:shop-items", []);
  const openGroups = useMemo(() => new Set(Array.isArray(openGroupList) ? openGroupList : []), [openGroupList]);
  const [regGroupSaved, setRegGroupSaved] = useState<string[]>([]);
  // 상위 그룹 — regParents: 상위 차례, regParentOf: 그룹 → 상위, closedSections: 목록에서 접은 상위(기본 펼침)
  const [regParents, setRegParents] = useState<string[]>([]);
  const [regParentOf, setRegParentOf] = useState<Record<string, string>>({});
  const [closedSectionList, setClosedSectionList] = useStoredState<string[]>("closed:shop-items", []);
  const closedSections = useMemo(() => new Set(Array.isArray(closedSectionList) ? closedSectionList : []), [closedSectionList]);
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  // 📌 아이템 목록 보기(2026-10-17) — 「표 | 카드」 · 숨긴 열 · 열 머리 정렬 · 거르기
  const [regView, setRegView] = useStoredState<ViewMode>("view:shop-items", "table");
  const [regHiddenCols, setRegHiddenCols] = useStoredState<string[]>("cols:shop-items", REG_HIDDEN_DEFAULT);
  const [regSort, setRegSort] = useState<SortState>(null);
  const [regFilters, setRegFilters] = useState<ItemFilters>(NO_FILTERS);
  // 📌 일괄 편집 — batchBusy: 보내는 중 · sheet: 열린 창(이름 바꾸기 · 복제 · 새 그룹) · batchDelAsk: 삭제 확인
  //    textSheet: 설명 바꾸기 · 분류 바꾸기 창(아이템 탭 · 상품 탭 — of 가 고른 목록)
  const [batchBusy, setBatchBusy] = useState(false);
  const [sheet, setSheet] = useState<"" | "rename" | "duplicate" | "group">("");
  const [textSheet, setTextSheet] = useState<{ of: "reg" | "product"; mode: TextSheetMode } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [batchDelAsk, setBatchDelAsk] = useState(false);
  // 📌 고친 채 다른 줄 · 새로 만들기 · 닫기 · 다른 화면으로 — 한 번 묻는다(name: 고치던 것, go: 버리고 할 일)
  const [leaveAsk, setLeaveAsk] = useState<{ name: string; go: () => void } | null>(null);
  // 📌 전체 수정(2026-10-17 되살림 — 운영자 승인) — 고친 수정 폼(id 있음)은 다른 줄 · ‹ › · 새로 만들기 · 칸 닫기 · 탭 옮기기에도 버리지 않고
  //    여기 쌓는다(종류마다 id → 폼). 아래 띠 「저장 안 한 수정 N개 · 되돌리기 · 모두 저장」이 쌓인 것 + 지금 열린 고친 폼을 차례로 저장하고 실패한 것만 남긴다.
  //    새로 쓰던 폼(id 없음)은 쌓지 않는다(지금처럼 칸을 닫아도 남아 이어 쓰고, 고친 채 다른 줄을 열면 한 번 묻는다)
  type Stacked = { reg: Record<string, ItemForm>; product: Record<string, ProdForm>; banner: Record<string, AnyRow>; coupon: Record<string, AnyRow> };
  const [stacked, setStacked] = useState<Stacked>({ reg: {}, product: {}, banner: {}, coupon: {} });
  const [savingAll, setSavingAll] = useState(false);
  // 마지막으로 따라간 주소(기능 검색 · 다른 화면 링크 — ?item= · new · open)
  const [deepSeen, setDeepSeen] = useState<string | null>(null);

  // 상품 폼 — 상태 모양·기간·유형·아이템 적용 규칙은 app/arctic/productForm(2026-10-17 상점 안 인라인 폼을 걷어 상품을 고치는 곳은 여기 하나)
  //    + 분류 저장 칸(ProdForm — 직접 설정 · 세트만)
  const emptyForm = EMPTY_PROD_FORM;
  const [form, setForm] = useState<ProdForm>(emptyForm);
  // 📌 「등록된 아이템」 고르는 중(아직 안 고름 — 저절로 첫 아이템을 고르지 않는다) · 아이템을 고르기 직전의 직접 설정 값.
  //    폼마다(form.id || "new") — 다른 상품을 열면 자연히 풀린다(productForm customSnapOf · unlinkItem)
  const [linkPick, setLinkPick] = useState<string | null>(null);
  const [customSnap, setCustomSnap] = useState<{ key: string; snap: CustomSnap } | null>(null);
  const linked = isLinked(form);
  const formKey = form.id || "new";
  // 세트 상품(lib/bundle.js) — 아이템 연결 · 역할 · 판매 방식 · 시즌 동작 대신 구성 편집
  const bundleOn = isBundleForm(form);

  const closePane = useCallback(() => { setPane(""); }, []);

  // ── 상품 초안(머리 "초안 N" · "초안 버리기" · "실사이트 반영", 줄 "초안" 칩 · 되돌리기) ──
  //    fetchDraft — 목록을 다시 읽을 때마다(fetchRegItems · fetchAll) 함께, 목록을 다시 읽지 않는 쓰기(끌어서 순서 · 그룹 차례) 뒤엔 따로.
  //    겹친 요청은 마지막 것만 받는다. 실패하면 지금 값 그대로(머리 단추가 사라졌다 붙지 않게)
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const draftSeq = useRef(0);
  const fetchDraft = useCallback(() => {
    const seq = ++draftSeq.current;
    fetch("/api/admin/catalog-draft", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((d) => {
      if (seq !== draftSeq.current || !d?.success) return;
      const next: DraftState = {
        loaded: true,
        draftMode: !!d.draftMode,
        liveLocked: !!d.liveLocked,
        total: Math.max(0, Number(d.total) || 0),
        counts: d.counts && typeof d.counts === "object" ? d.counts : {},
        rows: Array.isArray(d.rows) ? d.rows : [],
        warnings: Array.isArray(d.warnings) ? d.warnings : [],
      };
      setDraft(next);
      try { localStorage.setItem(DRAFT_MODE_KEY, JSON.stringify({ draftMode: next.draftMode, liveLocked: next.liveLocked })); } catch {}
    });
  }, []);
  useEffect(() => {
    try {
      const m = JSON.parse(localStorage.getItem(DRAFT_MODE_KEY) || "null");
      if (m && typeof m === "object") setDraft((s) => (s.loaded ? s : { ...s, draftMode: !!m.draftMode, liveLocked: !!m.liveLocked }));
    } catch {}
  }, []);
  // 실사이트 읽기 전용 — 아이템 · 상품 · 배너의 저장 · 새로 만들기 · 삭제 · 끌기 · 표시 토글을 자리를 지킨 채 잠근다(쿠폰 · 구매 내역 · 상점 설정 창은 그대로)
  const liveLocked = draft.liveLocked;
  // "" | "publish" | "discard" — 머리 단추의 확인 창 · revertAsk: 되돌릴 초안 한 건 · draftBusy: 처리 중인 요청
  const [draftAsk, setDraftAsk] = useState<"" | "publish" | "discard">("");
  const [revertAsk, setRevertAsk] = useState<DraftRow | null>(null);
  const [draftBusy, setDraftBusy] = useState<"" | "publish" | "discard" | "revert">("");

  // ── 아이템 등록 ──────────────────────────────
  const [regItems, setRegItems] = useState<any[]>([]);
  const [regLoaded, setRegLoaded] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM_FORM);
  const [isSavingReg, setIsSavingReg] = useState(false);
  // 지금 열린 아이템 폼의 id — 저장 응답이 오는 사이 다른 줄로 넘어갔는지 본다(그 폼을 덮지 않게)
  const regFormIdRef = useRef("");
  useEffect(() => { regFormIdRef.current = String(itemForm.id || ""); }, [itemForm.id]);
  // 추천 아이템 창 (PresetDialog)
  const [presetOpen, setPresetOpen] = useState(false);
  // 여러 개 고르기 — 모든 아이템 키(거른 결과가 아니라 — 지워진 아이템만 빠진다)
  const regKeys = useMemo(() => regItems.map((it) => String(it._id)), [regItems]);
  const sel = useSelection(regKeys);
  // 상품 여러 개 고르기 — 모든 상품 키(거른 결과가 아니라 — 지워진 상품만 빠진다)
  const prodKeys = useMemo(() => items.map((it) => String(it._id)), [items]);
  const prodSel = useSelection(prodKeys);

  // 서버가 준 상위 그룹(parents · parentOf)을 받아 둔다 — 응답에 없으면(옛 응답) 지금 값 그대로
  const takeParents = useCallback((d: any) => {
    if (Array.isArray(d?.parents)) setRegParents(d.parents.map(String));
    if (d?.parentOf && typeof d.parentOf === "object" && !Array.isArray(d.parentOf)) {
      setRegParentOf(Object.fromEntries(Object.entries(d.parentOf).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, String(v)])));
    }
  }, []);
  const fetchRegItems = useCallback(() => {
    fetch("/api/admin/items?withUsage=1&groups=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })).then((reg) => {
      setRegItems(Array.isArray(reg?.data) ? reg.data : []);
      setRegLoaded(true);
      // 그룹 차례 — 못 읽으면 지금 값 그대로(아이템에 든 그룹은 목록 순서로 뒤에 붙는다)
      if (Array.isArray(reg?.groups)) setRegGroupSaved(reg.groups.map(String));
      takeParents(reg);
    }).finally(() => {
      // 초안 요약은 목록을 받은 뒤에 — 목록 조회(?groups=1)가 떨어진 그룹 덩어리를 맞춰 쓰면(초안 모드는 순서 초안) 그것까지 센다
      fetchDraft();
    });
  }, [fetchDraft, takeParents]);

  // 📌 꾸미기 효과(카드 스킨 · 아바타 테두리)로 새 아이템 채우기 — 이름 · 아이콘 · 그룹이 비었거나 앞서 자동으로 채운 값 그대로일 때만
  //    (친 값은 건드리지 않는다). 효과를 바꾸면 따라 바뀌고, 꾸미기 효과를 빼면 자동으로 채운 값만 비운다. 수정(id 있음)에는 하지 않는다.
  //    값 꼴은 추천 아이템과 같다(lib/cosmeticArt cosmeticAutoOf — "카드 테두리 · <이름>" · 그룹 시즌 2 / 등급 카드 테두리 / 등급 프로필 테두리 / 할로윈)
  //    📌 2026-10-17 이름은 짧은 이름만(「<이름>」) — 분류(카드 테두리 …)는 「분류」 칸의 자동(꾸미기 효과)이 정한다
  const withCosmeticAuto = (prev: ItemForm, next: ItemForm): ItemForm => {
    if (next.id) return next;
    const autoOf = (f: ItemForm) => { for (const d of f.effects) { const a = cosmeticAutoOf(d); if (a) return { ...a, name: shortNameOf(a.name) }; } return null; };
    const was = autoOf(prev);
    const now = autoOf(next);
    if (was?.name === now?.name && was?.icon === now?.icon && was?.group === now?.group) return next;
    const pick = (cur: string, k: "name" | "icon" | "group") => (cur.trim() === "" || (was != null && cur === was[k]) ? (now ? now[k] : "") : cur);
    return { ...next, name: pick(next.name, "name"), icon: pick(next.icon, "icon"), group: pick(next.group, "group") };
  };

  // 저장된 아이템 → 폼 값(목록 줄을 눌러 열 때 · 「고친 채 넘어가나」 견줄 바탕)
  const regFormOf = (it: any): ItemForm => {
    // 효과는 GET 이 아이템 문서에서 읽어 붙여 준 값 (없으면 0 / [])
    const ef = it.effects || {};
    const list = Array.isArray(ef.list) ? ef.list : [];
    return {
      id: it._id, name: it.name || "", description: it.description || "", type: it.type || "item", roleId: it.roleId || "",
      icon: it.icon || "", imageUrl: it.imageUrl || "", color: it.color || "", detachOnSeason: !!it.detachOnSeason,
      visible: it.visible !== false, group: groupOfItem(it), rarity: normalizeRarity(it.rarity), boosterPerk: it.boosterPerk === true,
      // 분류 — 저장 칸 그대로("" = 자동). 옛 이름 머리말은 이름 칸에 남은 채 분류를 정한다(말없이 고쳐 쓰지 않는다)
      category: typeof it.category === "string" ? it.category : "",
      chatBuffXp: ef.chatBuffXp ? String(ef.chatBuffXp) : "", voiceBuffXp: ef.voiceBuffXp ? String(ef.voiceBuffXp) : "",
      attendBuffXp: ef.attendBuffXp ? String(ef.attendBuffXp) : "",
      effects: list.map(draftOf),
      // 효과 문구 — 저장된 줄이 있으면 「직접 쓰기」(한 줄에 하나), 없으면 자동 · 적용 범위 — 저장 칸 그대로([] = 자동)
      ...(() => { const lines = normalizeEffectText(it.effectText); return { effectCustom: lines.length > 0, effectText: lines.join("\n") }; })(),
      scope: normalizeScope(it.scope),
    };
  };
  const fillRegForm = (it: any) => setItemForm(regFormOf(it));

  // 아이템 폼 → 저장 본문(검사 실패면 error)
  const regBody = (fm: ItemForm): { body: any; group: string } | { error: string } => {
    if (!fm.name.trim()) return { error: "이름을 입력해 주세요." };
    if ((fm.type === "role" || fm.type === "perk") && !fm.roleId) return { error: "연결할 역할을 선택해 주세요." };
    // 📌 효과 — 기프트카드를 뺀 모든 아이템(역할 연결 여부와 무관). 값이 빈 줄은 서버가 말없이 버리므로 저장 전에 막는다.
    //    아이템 문서에 같이 저장되므로 늘 보낸다(전부 비운 것도 그대로 저장돼야 지워진다). 기프트카드는 보내지 않는다(서버가 비움)
    const { chatBuffXp, voiceBuffXp, attendBuffXp, effects: effDrafts, effectCustom, effectText: fxText, scope: scopeKeys, ...base } = fm;
    let effects: { chatBuffXp: number; voiceBuffXp: number; attendBuffXp: number; list: ReturnType<typeof effectOf>[] } | undefined;
    if (base.type !== "physical") {
      // 📌 보상 구간 표(음성 N분마다 무작위 XP) — 서버는 틀린 표를 말없이 기본 표로 돌리므로 저장 전에 막는다
      const badCandy = effDrafts.findIndex((d) => TRIGGER_OF[d.on]?.tiers && candyTiersError(d.candy));
      if (badCandy >= 0) return { error: `추가 효과 ${badCandy + 1}번째 줄 — ${candyTiersError(effDrafts[badCandy].candy)}` };
      const bad = effDrafts.findIndex((d) => normalizeEffects([effectOf(d)]).length === 0);
      if (bad >= 0) return { error: `추가 효과 ${bad + 1}번째 줄의 값을 입력해 주세요.` };
      effects = { chatBuffXp: xpNum(chatBuffXp), voiceBuffXp: xpNum(voiceBuffXp), attendBuffXp: xpNum(attendBuffXp), list: effDrafts.map(effectOf) };
    }
    // 📌 효과 문구 — 「직접 쓰기」면 그 줄(서버도 같은 normalizeEffectText), 자동이면 []. 직접 쓴 줄이 지금 자동 문구와 같으면 [](효과를 고치면 문구도 따라가게)
    //    적용 범위 — 고른 키(서버도 같은 normalizeScope). 꾸미기가 아니거나 자동과 같으면 [](늘 보낸다 — 비운 것도 그대로 저장돼야 자동으로 돌아간다)
    if (effectCustom && base.type !== "physical") {
      const raw = fxRawLines(fxText);
      if (raw.length > EFFECT_TEXT_MAX) return { error: `효과 문구는 최대 ${EFFECT_TEXT_MAX}줄까지 입력할 수 있습니다.` };
      const long = raw.findIndex((l) => l.length > EFFECT_TEXT_LINE_MAX);
      if (long >= 0) return { error: `효과 문구 ${long + 1}번째 줄은 ${EFFECT_TEXT_LINE_MAX}자까지 입력할 수 있습니다.` };
    }
    const fxShape = { type: base.type, ...(effects || {}), effects: effects ? normalizeEffects(effects.list) : [] };
    const fxLines = effectCustom && base.type !== "physical" ? normalizeEffectText(fxText) : [];
    const autoLines = autoEffectLinesOf(fxShape, (id: string) => guildChannels.find((c) => c.id === id)?.name);
    const effectText = fxLines.length && fxLines.join("\n") !== autoLines.join("\n") ? fxLines : [];
    const ownScope = isCosmeticItem(fxShape) ? normalizeScope(scopeKeys) : [];
    const scope = ownScope.join(",") === autoScopeOf(fxShape).join(",") ? [] : ownScope;
    const group = normalizeItemGroup(base.group);
    // 희귀도 — 늘 보낸다("" = 안 고름 그대로). 서버도 같은 normalizeRarity 로 다시 정리한다(lib/items.js normalizeItemPayload)
    // 분류 — 늘 보낸다("" = 자동으로). 서버도 같은 정리(lib/items.js normalizeItemCategory)
    return { group, body: { ...base, group, rarity: normalizeRarity(base.rarity), category: normalizeCategory(base.category), roleName: guildRoles.find((r) => r.id === base.roleId)?.name || "", ...(effects ? { effects } : {}), effectText, scope } };
  };
  // 펼친 그룹에 더하기 — 저장 · 일괄 그룹 · 이전 · 다음으로 연 아이템이 접힌 머리줄 속으로 사라져 보이지 않게
  const openGroupNamed = (g: string) => {
    if (g) setOpenGroupList((l) => (Array.isArray(l) && l.includes(g) ? l : [...(Array.isArray(l) ? l : []), g]));
  };
  // 이전 · 다음 · 주소로 연 상품이 접힌 묶음 속이면 그 묶음을 펼친다
  const openProductGroupNamed = (g: string) => {
    if (g) setOpenProductGroupList((l) => (Array.isArray(l) && l.includes(g) ? l : [...(Array.isArray(l) ? l : []), g]));
  };
  const saveRegItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReg) return;
    // 단추는 잠겨 있다 — 입력칸 Enter · Ctrl+S 로 들어온 제출만 여기서 막는다
    if (liveLocked) return fail(LIVE_LOCKED_MSG);
    const built = regBody(itemForm);
    if ("error" in built) return fail(built.error);
    const wasNew = !itemForm.id;
    const sentId = String(itemForm.id || "");
    const sentForm = itemForm;
    setIsSavingReg(true);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSavingReg(false);
    if (res?.ok && d?.success) {
      openGroupNamed(built.group);
      const saved = d.data;
      // 보내는 사이 다른 줄로 넘어가 쌓인 것(보낸 폼 그대로)은 뺀다 — 전체 수정
      dropStacked("reg", [sentId], sentForm);
      if (!wasNew && saved?._id) setRegItems((list) => list.map((x) => (String(x._id) === String(saved._id) ? { ...x, ...saved } : x)));
      // 📌 붙는 편집기(넓은 화면)는 저장한 아이템을 연 채 다음 줄로 넘어가며 고친다 — 목록 줄부터 새 값으로(다시 읽기 전 「고친 채」로 보이지 않게).
      //    좁은 화면(덮는 칸 · 아래 판)은 예전처럼 닫는다. 보내는 동안 다른 줄로 넘어갔으면 그 폼은 그대로 둔다
      if (regFormIdRef.current === sentId) {
        if (wideDock && saved?._id) setItemForm(regFormOf(saved));
        else { setItemForm(EMPTY_ITEM_FORM); closePane(); }
      }
      fetchRegItems(); fetchAll();
      toast(wasNew ? "등록했습니다." : "저장했습니다.");
    }
    else fail(d?.message || "저장에 실패했습니다.");
  };
  // Ctrl/⌘+S — 보이는 아이템 폼을 제출(숫자 칸 검사 · onSubmit 은 저장 단추와 같은 길). 덮는 칸은 PC · 모바일 폼이 둘 그려진다
  const submitRegForm = () => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form[data-reg-form]"));
    const f = forms.find((x) => x.getClientRects().length > 0) || forms[0];
    if (!f) return;
    if (typeof f.requestSubmit === "function") f.requestSubmit();
    else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };

  // ── 아이템 일괄 편집(PATCH /api/admin/items { batch } · { duplicate } — 서버가 POST 와 같은 정리 · 초안 규칙으로 쓴다) ──
  type ItemsPatch = { ok: boolean; d: any };
  const patchItems = async (body: Record<string, unknown>): Promise<ItemsPatch> => {
    const res = await fetch("/api/admin/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    return { ok: !!(res?.ok && d?.success), d };
  };
  // 결과 알림 — 다 됐으면 토스트, 건너뛴 게 있으면 이유 목록(알림 창)
  type Skip = { id?: string; name?: string; why?: string };
  //    list — 이름을 찾을 목록(기본 아이템 · 상품 일괄 편집은 상품 목록)
  const reportBatch = (done: number, skipped: Skip[], verb: string, list: AnyRow[] = regItems) => {
    if (!skipped.length) return toast(`${done.toLocaleString()}개 ${verb}`);
    const nameOf = (s: Skip) => s.name || list.find((x) => String(x._id) === String(s.id))?.name || "이름 없음";
    notify([
      `${done.toLocaleString()}개 ${verb} · ${skipped.length.toLocaleString()}개 건너뜀`,
      ...skipped.slice(0, 12).map((s) => `${nameOf(s)} — ${s.why || "건너뜀"}`),
      ...(skipped.length > 12 ? [`외 ${(skipped.length - 12).toLocaleString()}개`] : []),
    ].join("\n"), done === 0);
  };
  // 줄마다 바꿀 값(set) — 화면 목록부터 맞추고(되돌릴 값 보관) 보낸다. 실패하면 되돌린다
  const runBatch = async (entries: { id: string; set: Record<string, unknown> }[], verb: string) => {
    if (!entries.length || batchBusy || liveLocked) return false;
    const before = regItems;
    const local = new Map(entries.map((e) => [e.id, e.set]));
    const localOf = (set: Record<string, unknown>) => {
      const out: Record<string, unknown> = { ...set };
      if ("rarity" in out) out.rarity = normalizeRarity(out.rarity);
      if ("group" in out) out.group = normalizeItemGroup(out.group);
      if ("category" in out) out.category = normalizeCategory(out.category);
      return out;
    };
    // 분류 · 짧은 이름도 바뀐 값으로 다시 셈한다(이름 · 분류 · 유형을 바꾼 줄이 다시 읽기 전까지 옛 글자로 보이지 않게)
    setRegItems((list) => list.map((x) => (local.has(String(x._id)) ? withCategoryFields({ ...x, ...localOf(local.get(String(x._id)) as Record<string, unknown>) }) : x)));
    setBatchBusy(true);
    const { ok, d } = await patchItems({ batch: entries });
    setBatchBusy(false);
    if (!ok) {
      setRegItems(before);
      fail(d?.message || "저장하지 못했습니다.");
      return false;
    }
    if (Array.isArray(d.order)) setRegItems((list) => reorderById(list, d.order.map(String)));
    if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
    takeParents(d);
    fetchRegItems();
    // 연결 상품 스냅샷(이름 · 설명 · 아이콘 · 색 · 유형)이 같이 바뀌는 편집만 상품 목록도 다시(분류 — 연결 상품 줄의 분류는 아이템을 따른다)
    if (entries.some((e) => ["name", "description", "icon", "color", "type", "category"].some((k) => k in e.set))) fetchAll();
    reportBatch(Number(d.updated) || 0, Array.isArray(d.skipped) ? d.skipped : [], verb);
    return true;
  };
  const batchSet = (set: Record<string, unknown>, verb = "바꿈") => runBatch(sel.keys().map((id) => ({ id, set })), verb);
  const batchGroup = async (raw: string) => {
    const g = normalizeItemGroup(raw);
    if (g && regParents.includes(g)) { fail("같은 이름의 상위 그룹이 있습니다."); return false; }
    const ok = await batchSet({ group: g }, g ? "옮김" : "뺌");
    if (ok) openGroupNamed(g);
    return ok;
  };
  // 이름 바꾸기 · 복제(RenameSheet 가 고른 줄)
  const submitRename = async (rows: RenameRow[], withDesc: boolean) => {
    const ok = await runBatch(rows.map((r) => ({ id: r.id, set: { name: r.to, ...(withDesc && r.descChanged ? { description: r.descTo } : {}) } })), "바꿈");
    if (ok) setSheet("");
  };
  const submitDuplicate = async (rows: RenameRow[], withDesc: boolean) => {
    if (batchBusy || liveLocked || !rows.length) return;
    setBatchBusy(true);
    const { ok, d } = await patchItems({ duplicate: rows.map((r) => ({ id: r.id, name: r.to, ...(withDesc && r.descChanged ? { description: r.descTo } : {}) })) });
    setBatchBusy(false);
    if (!ok) return fail(d?.message || "복제하지 못했습니다.");
    setSheet("");
    const made: string[] = Array.isArray(d.created) ? d.created.map((c: { id?: string }) => String(c?.id || "")).filter(Boolean) : [];
    // 복제본을 골라 둔다 — 바로 이어서 이름 · 희귀도 등을 고친다
    if (made.length) sel.replace(made);
    if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
    takeParents(d);
    fetchRegItems();
    reportBatch(made.length, Array.isArray(d.skipped) ? d.skipped : [], "복제");
  };
  // 일괄 삭제 — 상품 · 시즌 패스가 쓰는 아이템은 남긴다(서버도 같은 검사). 확인 한 번
  const batchDelete = async () => {
    const ids = sel.keys().filter((id) => {
      const it = regItems.find((x) => String(x._id) === id);
      return it && !(Number(it.usage) > 0) && !(Number(it.passUsage) > 0);
    });
    if (!ids.length || batchBusy || liveLocked) return;
    setBatchBusy(true);
    const res = await fetch(`/api/admin/items?ids=${ids.map(encodeURIComponent).join(",")}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBatchBusy(false);
    setBatchDelAsk(false);
    if (!(res?.ok && d?.success)) return fail(d?.message || "삭제하지 못했습니다.");
    const gone: string[] = Array.isArray(d.deleted) ? d.deleted.map(String) : [];
    // 지운 아이템이 편집기에 열려 있으면 닫는다
    if (itemForm.id && gone.includes(String(itemForm.id))) { setItemForm(EMPTY_ITEM_FORM); if (pane === "reg") closePane(); }
    dropStacked("reg", gone);
    fetchRegItems();
    const blocked: { id: string; usage?: number; passUsage?: number }[] = Array.isArray(d.blocked) ? d.blocked : [];
    reportBatch(gone.length, blocked.map((b) => ({ id: b.id, why: `상품 ${Number(b.usage) || 0} · 패스 ${Number(b.passUsage) || 0}` })), "삭제");
  };

  // 표시 토글 — 목록에서 바로 켜고 끈다(폼을 열지 않아도 되게). 일괄 편집과 같은 길(그 칸만 — 효과 · 순서는 건드리지 않는다)
  //    📌 건너뛴 게 없으면 성공(상품 판매 스위치와 같은 판정 — 이미 그 값이라 바뀐 수가 0 이어도). 응답이 오면 목록을 다시 읽어 줄을 서버 값에 맞춘다
  const [visBusy, setVisBusy] = useState("");
  const toggleRegVisible = async (it: any) => {
    if (visBusy || liveLocked) return;
    const id = String(it._id);
    const next = it.visible === false;
    const before = regItems;
    setVisBusy(id);
    setRegItems((list) => list.map((x) => (String(x._id) === id ? { ...x, visible: next } : x)));
    const { ok, d } = await patchItems({ batch: [{ id, set: { visible: next } }] });
    setVisBusy("");
    if (ok && !(Array.isArray(d?.skipped) && d.skipped.length)) { fetchRegItems(); toast(next ? "인벤토리에 표시합니다." : "인벤토리에서 숨깁니다."); }
    else {
      setRegItems(before);
      if (ok) fetchRegItems();
      fail(d?.skipped?.[0]?.why || d?.message || "저장에 실패했습니다.");
    }
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
    // 더 보기로 펼친 만큼(최대 5,000건 — 서버 한도) 다시 읽는다. 처음엔 한 쪽(500건)
    const depth = ordersDepth.current;
    Promise.all([
      // groups=1 — 같은 그룹 상품이 떨어져 있으면 서버가 맞춰 쓰고 그 순서로 준다(상품 정리 B안)
      fetch("/api/shop/items?all=1&groups=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch(`/api/shop/orders${depth > 500 ? `?limit=${Math.min(5000, depth)}` : ""}`, { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      // 배너는 노출 위치(홈 · 시즌 탭 · 테마 탭) 구분 없이 전부 — 위치를 안 붙이면 홈 배너만 온다
      fetch("/api/shop/banners?all=1&placement=any", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/coupons", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      // 이벤트 테마 — 꺼진 것까지 전부(상품 폼 고르기 · 배너 위치 · 테마 관리). 못 받으면 null(지금 목록 그대로)
      fetch("/api/shop/themes?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
    ]).then(([it, roles, ord, ban, cou, thm]) => {
      setItems(Array.isArray(it?.data) ? it.data : []);
      setGuildRoles(Array.isArray(roles?.data) ? roles.data : []);
      const ordRows = Array.isArray(ord?.data) ? uniqById(ord.data) : [];
      setOrders(ordRows);
      ordersDepth.current = ordRows.length;
      setOrdersNext(ord?.hasMore && ord?.next ? String(ord.next) : "");
      setBanners(Array.isArray(ban?.data) ? ban.data : []);
      setCoupons(Array.isArray(cou?.data) ? cou.data : []);
      if (thm?.success && Array.isArray(thm.data)) setThemes(thm.data);
    }).finally(() => {
      setIsLoading(false);
      // 초안 요약은 목록을 받은 뒤에 — 상품 목록 조회(?groups=1)가 떨어진 그룹 덩어리를 맞춰 쓰면(초안 모드는 순서 초안) 그것까지 센다
      fetchDraft();
    });
  }, [fetchDraft]);

  // 구매 내역 다음 쪽 — 쪽 끝에 걸친 주문은 서버가 나머지 건까지 붙여 주므로 다음 쪽과 겹칠 수 있다(_id 로 뺀다)
  const loadMoreOrders = async () => {
    if (ordersBusy || !ordersNext) return;
    setOrdersBusy(true);
    const d = await fetch(`/api/shop/orders?before=${encodeURIComponent(ordersNext)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setOrdersBusy(false);
    if (!d?.success || !Array.isArray(d.data)) return fail("구매 내역을 더 불러오지 못했습니다.");
    setOrders((prev) => {
      const next = uniqById([...prev, ...d.data]);
      ordersDepth.current = next.length;
      return next;
    });
    setOrdersNext(d.hasMore && d.next ? String(d.next) : "");
  };

  // ── 이미지 배너 ──────────────────────────────
  // 📌 placement — 노출 위치. home: ARCTIC 홈 맨 위 · season: 스토어 시즌 탭 맨 위 · 테마 키: 스토어 그 테마 탭 맨 위 (값이 없는 옛 배너는 홈 — bannerPlaceOf)
  const EMPTY_BANNER = { id: "", imageUrl: "", mobileImageUrl: "", title: "", subtitle: "", link: "", placement: "home", sortOrder: "", active: true };
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState<any>(EMPTY_BANNER);
  const bannerSize = useImageSize(bannerForm.imageUrl);
  const mBannerSize = useImageSize(bannerForm.mobileImageUrl);
  const mBannerRatio = mBannerSize ? Math.min(M_BANNER_MAX, Math.max(M_BANNER_MIN, mBannerSize.w / mBannerSize.h)) : 2;

  // ── 이벤트 테마 — 목록(themes)은 위 상태 칸에. 테마별 상품 수 · 배너 수(테마 관리 창 · 삭제 확인)
  const themeProductCount = new Map<string, number>();
  for (const it of items) if (it.theme) themeProductCount.set(it.theme, (themeProductCount.get(it.theme) || 0) + 1);
  const themeBannerCount = new Map<string, number>();
  for (const b of banners) { const k = bannerPlaceOf(b); themeBannerCount.set(k, (themeBannerCount.get(k) || 0) + 1); }
  // 끌어 놓자마자 화면 차례부터(저장 전에 옛 차례가 비치지 않게) — 돌려주는 것 = 되돌리기
  const localThemeOrder = (keys: string[]) => {
    const before = themes;
    const at = new Map(keys.map((k, i) => [k, i]));
    setThemes([...themes].sort((a, b) => (at.get(a.key) ?? 1e9) - (at.get(b.key) ?? 1e9)));
    return () => setThemes(before);
  };
  // 저장 뒤 — 받은 목록으로 · 초안 수(초안 모드는 테마 목록이 설정 초안)
  const onThemesSaved = (list: ShopTheme[]) => { setThemes(list); fetchDraft(); };
  // 📌 배너 위치 — 홈 · 시즌 탭 · 테마마다 「<이름> 탭」(꺼진 테마 포함). 지운 테마의 배너가 있으면 끝에 「지운 테마」 칸
  const bannerPlaces = [...BASE_BANNER_PLACES, ...themes.map((t) => ({ v: t.key, l: `${t.name} 탭` }))];
  const knownPlaces = new Set(bannerPlaces.map((p) => p.v));
  const goneBanners = banners.filter((b) => !knownPlaces.has(bannerPlaceOf(b)));
  const placeTabs = goneBanners.length ? [...bannerPlaces, { v: GONE_PLACE, l: "지운 테마" }] : bannerPlaces;
  // 지금 위치 — 고른 위치가 사라졌으면(테마 삭제 · 지운 테마 배너 정리) 홈
  const placeNow = placeTabs.some((p) => p.v === bannerPlace) ? bannerPlace : "home";
  const bannersAt = (place: string) => (place === GONE_PLACE ? goneBanners : banners.filter((b) => bannerPlaceOf(b) === place));

  // 목록 줄 → 배너 폼 (예전 '수정' 단추 안의 값 그대로)
  const bannerFormOf = (b: any) => ({ id: b._id, imageUrl: b.imageUrl, mobileImageUrl: b.mobileImageUrl || "", title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", placement: bannerPlaceOf(b), sortOrder: String(b.sortOrder || 0), active: b.active });
  const fillBannerForm = (b: any) => setBannerForm(bannerFormOf(b));
  // 📌 지금 열린 폼의 id(상품 · 배너 · 쿠폰) — 저장 응답이 오는 사이 다른 줄로 넘어갔는지 본다(그 폼을 덮거나 칸을 닫지 않게 — 아이템 regFormIdRef 와 같다)
  const openFormIds = useRef({ product: "", banner: "", coupon: "" });
  const [savingBanner, setSavingBanner] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingBanner) return;
    if (liveLocked) return fail(LIVE_LOCKED_MSG);
    const wasNew = !bannerForm.id;
    const sentId = String(bannerForm.id || "");
    const sentForm = bannerForm;
    setSavingBanner(true);
    // 순서는 보내지 않는다 — 새 배너 · 위치를 바꾼 배너는 서버가 그 위치 맨 뒤에, 그 밖은 저장된 순서 그대로(폼을 연 뒤 끌어서 바꾼 순서를 덮지 않게)
    const res = await fetch("/api/shop/banners", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bannerForm, sortOrder: undefined }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingBanner(false);
    if (res?.ok && d?.success) {
      dropStacked("banner", [sentId], sentForm);
      // 📌 붙는 편집기(넓은 화면)는 저장한 배너를 연 채 둔다(다음 줄로 넘어가며 고친다) — 좁은 화면은 예전처럼 닫는다
      if (openFormIds.current.banner === sentId) {
        if (wideDock && d.data?._id) setBannerForm(bannerFormOf(d.data));
        else { setBannerForm(EMPTY_BANNER); closePane(); }
      }
      fetchAll();
      toast(wasNew ? "등록했습니다." : "저장했습니다.");
    }
    else fail(d?.message || "저장에 실패했습니다.");
  };

  // 📌 줄 노출 스위치 — 바로 저장(그 칸만 — 위치 · 순서는 보내지 않아 그대로). 화면부터 바꾸고 실패하면 되돌린다
  const toggleBannerActive = async (b: AnyRow) => {
    if (bannerSwitchBusy || liveLocked) return;
    const id = String(b._id);
    const next = !b.active;
    const before = banners;
    setBannerSwitchBusy(id);
    setBanners((list) => list.map((x) => (String(x._id) === id ? { ...x, active: next } : x)));
    const res = await fetch("/api/shop/banners", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, imageUrl: b.imageUrl, mobileImageUrl: b.mobileImageUrl || "", title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", active: next }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setBannerSwitchBusy("");
    if (res?.ok && d?.success) { fetchAll(); toast(next ? "노출합니다." : "숨겼습니다."); }
    else { setBanners(before); fail(d?.message || "저장에 실패했습니다."); }
  };

  // ── 목록이 바뀌면(표시 토글 · 일괄 편집 · 끌어서 그룹 옮기기 · 그룹 이름 바꾸기 · 초안 되돌리기 · 저장 뒤 다시 읽기)
  //    열린 폼을 새 저장 값 위로 옮긴다 — 고친 칸만 그대로(저장이 목록에서 바꾼 값을 옛 값으로 되돌리지 않게).
  //    렌더 중 조정(이펙트로 한 박자 늦지 않게). 줄이 목록에서 사라졌으면 그대로 둔다(못 읽은 빈 목록에 고친 것이 지워지지 않게)
  //    📌 전체 수정 — 쌓인 폼(stacked)도 같이 옮기고, 옮기고 나니 저장 값과 같아졌으면(목록에서 같은 값으로 바꿨다) 쌓인 데서 뺀다
  const [seenRows, setSeenRows] = useState({ reg: regItems, product: items, banner: banners, coupon: coupons });
  if (seenRows.reg !== regItems || seenRows.product !== items || seenRows.banner !== banners || seenRows.coupon !== coupons) {
    const prev = seenRows;
    setSeenRows({ reg: regItems, product: items, banner: banners, coupon: coupons });
    const onto = (fm: any, was: any[], now: any[], formOf: (r: any) => any) => {
      const id = String(fm?.id || "");
      const a = id ? was.find((x) => String(x._id) === id) : null;
      const b = id ? now.find((x) => String(x._id) === id) : null;
      if (!a || !b) return fm;
      const fa = formOf(a), fb = formOf(b);
      return sameForm(fa, fb) ? fm : rebaseForm(fm, fa, fb);
    };
    if (prev.reg !== regItems) { const f = onto(itemForm, prev.reg, regItems, regFormOf); if (f !== itemForm) setItemForm(f); }
    if (prev.product !== items) { const f = onto(form, prev.product, items, prodFormOf); if (f !== form) setForm(f); }
    if (prev.banner !== banners) { const f = onto(bannerForm, prev.banner, banners, bannerFormOf); if (f !== bannerForm) setBannerForm(f); }
    if (prev.coupon !== coupons) { const f = onto(couponForm, prev.coupon, coupons, couponFormOf); if (f !== couponForm) setCouponForm(f); }
    const moved = ([
      { k: "reg", was: prev.reg, now: regItems, formOf: regFormOf },
      { k: "product", was: prev.product, now: items, formOf: prodFormOf },
      { k: "banner", was: prev.banner, now: banners, formOf: bannerFormOf },
      { k: "coupon", was: prev.coupon, now: coupons, formOf: couponFormOf },
    ] as { k: keyof Stacked; was: AnyRow[]; now: AnyRow[]; formOf: (r: AnyRow) => AnyRow }[]).filter((x) => x.was !== x.now);
    if (moved.length) {
      setStacked((p) => {
        let changed = false;
        const out = { ...p } as Record<keyof Stacked, Record<string, AnyRow>>;
        for (const { k, was, now, formOf } of moved) {
          const next: Record<string, AnyRow> = {};
          for (const [id, fm] of Object.entries(p[k] as Record<string, AnyRow>)) {
            const nf = onto(fm, was, now, formOf);
            if (nf === fm) { next[id] = fm; continue; }
            changed = true;
            const row = now.find((x) => String(x._id) === id);
            if (!(row && sameForm(nf, formOf(row)))) next[id] = nf;
          }
          out[k] = next;
        }
        return changed ? (out as Stacked) : p;
      });
    }
  }

  // ── 열린 폼을 고쳤나 — 수정 폼은 저장된 값과, 새로 쓰는 폼은 빈 폼과 견준다(효과 줄 id · 펼침 같은 화면 상태는 빼고 — sameForm)
  //    📌 2026-10-17 「전체 수정」 되살림 — 고친 수정 폼은 다른 줄 · ‹ › · 새로 만들기 · 칸 닫기 · 탭 옮기기에 묻지 않고 쌓는다(stacked → 아래 띠 「모두 저장」).
  //       새로 쓰던 폼을 고친 채 다른 줄을 열거나, 고친 게 남은 채 다른 화면으로 가면 한 번 묻는다(「버리기」 — leaveAsk). 편집기 「저장」은 그 하나만 바로
  const regSavedRow = itemForm.id ? regItems.find((x) => String(x._id) === String(itemForm.id)) : null;
  const prodSavedRow = form.id ? items.find((x) => String(x._id) === String(form.id)) : null;
  const banSavedRow = bannerForm.id ? banners.find((x) => String(x._id) === String(bannerForm.id)) : null;
  const regDirty = itemForm.id ? !!regSavedRow && !sameForm(itemForm, regFormOf(regSavedRow)) : !sameForm(itemForm, EMPTY_ITEM_FORM);
  const prodDirty = form.id ? !!prodSavedRow && !sameForm(form, prodFormOf(prodSavedRow)) : !sameForm(form, emptyForm);
  const banDirty = bannerForm.id
    ? !!banSavedRow && !sameForm(bannerForm, bannerFormOf(banSavedRow))
    : !sameForm({ ...bannerForm, placement: "" }, { ...EMPTY_BANNER, placement: "" });
  // 쿠폰도 같은 규칙(2026-10-17 — 붙는 편집기 ‹ › 로 넘길 때 고친 것이 말없이 사라지지 않게)
  const coupSavedRow = couponForm.id ? coupons.find((x) => String(x._id) === String(couponForm.id)) : null;
  const coupDirty = couponForm.id ? !!coupSavedRow && !sameForm(couponForm, couponFormOf(coupSavedRow)) : !sameForm(couponForm, EMPTY_COUPON);
  type EditKind = "reg" | "product" | "banner" | "coupon";
  const isEditKind = (k: string): k is EditKind => k === "reg" || k === "product" || k === "banner" || k === "coupon";
  const dirtyNameOf = (kind: EditKind): string | null =>
    kind === "reg" ? (regDirty ? itemForm.name.trim() || "새 아이템" : null)
    : kind === "product" ? (prodDirty ? form.name.trim() || "새 상품" : null)
    : kind === "coupon" ? (coupDirty ? String(couponForm.code || "").trim() || "새 쿠폰" : null)
    : banDirty ? String(bannerForm.title || "").trim() || "배너" : null;
  // 📌 전체 수정 — 수정 폼(id 있음)을 고쳤나(이것만 쌓는다 — 새로 쓰던 폼은 아니다)
  const EDIT_KINDS: EditKind[] = ["reg", "product", "banner", "coupon"];
  const editDirtyOf = (kind: EditKind) =>
    kind === "reg" ? !!itemForm.id && regDirty
    : kind === "product" ? !!form.id && prodDirty
    : kind === "banner" ? !!bannerForm.id && banDirty
    : !!couponForm.id && coupDirty;
  // 쌓인 데서 빼기 — only: 그 폼 그대로일 때만(저장하는 사이 다시 쌓인 새 고친 것은 남긴다)
  const dropStacked = (kind: EditKind, ids: string[], only?: unknown) => {
    const drop = ids.filter(Boolean);
    if (!drop.length) return;
    setStacked((p) => {
      const cur = p[kind] as Record<string, AnyRow>;
      const hit = drop.filter((id) => id in cur && (only === undefined || cur[id] === only));
      if (!hit.length) return p;
      const next = { ...cur };
      for (const id of hit) delete next[id];
      return { ...p, [kind]: next };
    });
  };
  // 고친 수정 폼을 쌓고 그 폼은 비운다(다른 줄 · 새로 만들기 · 칸 닫기 · 탭 옮기기 전). kinds — 안 주면 넷 다
  const stashEdits = (kinds: EditKind[] = EDIT_KINDS) => {
    const take = kinds.filter(editDirtyOf);
    if (!take.length) return;
    setStacked((p) => ({
      reg: take.includes("reg") ? { ...p.reg, [String(itemForm.id)]: itemForm } : p.reg,
      product: take.includes("product") ? { ...p.product, [String(form.id)]: form } : p.product,
      banner: take.includes("banner") ? { ...p.banner, [String(bannerForm.id)]: bannerForm } : p.banner,
      coupon: take.includes("coupon") ? { ...p.coupon, [String(couponForm.id)]: couponForm } : p.coupon,
    }));
    if (take.includes("reg")) setItemForm(EMPTY_ITEM_FORM);
    if (take.includes("product")) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
    if (take.includes("banner")) setBannerForm(EMPTY_BANNER);
    if (take.includes("coupon")) setCouponForm(EMPTY_COUPON);
  };
  // 다른 폼으로 바꾸기 전 — 고친 수정 폼은 쌓고 바로, 새로 쓰던 폼을 고쳤으면 한 번 묻고(「버리기」) 할 일을, 없으면 바로
  const guard = (kind: EditKind, go: () => void) => {
    if (editDirtyOf(kind)) { stashEdits([kind]); go(); return; }
    const name = dirtyNameOf(kind);
    if (name == null) go();
    else setLeaveAsk({ name, go });
  };
  // 폼 비우기(수정하던 폼만 — 새로 쓰던 폼은 남겨 「새로 만들기」로 이어 쓴다)
  const resetEditForm = (kind: EditKind) => {
    if (kind === "reg") setItemForm((f) => (f.id ? EMPTY_ITEM_FORM : f));
    if (kind === "product" && form.id) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
    if (kind === "banner") setBannerForm((f: any) => (f.id ? EMPTY_BANNER : f));
    if (kind === "coupon") setCouponForm((f: AnyRow) => (f.id ? EMPTY_COUPON : f));
  };
  // 줄 열기 — 같은 줄이면 그대로, 아니면(고친 수정 폼은 쌓고 · 고친 새 폼은 한 번 묻고) 쌓아 둔 고친 값이 있으면 그것으로(쌓인 데서는 뺀다 —
  //    지금 열린 폼이 된다), 없으면 저장된 값으로. 「모두 저장」 중에 열어도 된다(저장은 그때 폼 그대로 — 끝나면 같은 폼일 때만 저장 값으로 바꾼다)
  const openRegRow = (it: any) => {
    const id = String(it._id);
    if (pane === "reg" && String(itemForm.id) === id) return;
    guard("reg", () => {
      const kept = stacked.reg[id];
      if (kept) { dropStacked("reg", [id]); setItemForm(kept); } else fillRegForm(it);
      setPane("reg");
      // 이전 · 다음으로 접힌 그룹의 아이템을 열면 그 그룹을 펼친다
      openGroupNamed(groupOfItem(it));
    });
  };
  const openProductRow = (it: any) => {
    const id = String(it._id);
    if (pane === "product" && String(form.id) === id) return;
    guard("product", () => {
      const kept = stacked.product[id];
      if (kept) { dropStacked("product", [id]); setForm(kept); setLinkPick(null); setCustomSnap(null); } else fillItemForm(it);
      setPane("product");
      // 이전 · 다음 · 주소로 접힌 묶음의 상품을 열면 그 묶음을 펼친다(묶음 = 연결 아이템 그룹 — lib/productOrder.js)
      openProductGroupNamed(productGroupOf(it, itemIndexOf(regItems.map((x) => ({ id: String(x._id), group: groupOfItem(x) })))));
    });
  };
  const openBannerRow = (b: any) => {
    const id = String(b._id);
    if (pane === "banner" && String(bannerForm.id) === id) return;
    guard("banner", () => {
      const kept = stacked.banner[id];
      if (kept) { dropStacked("banner", [id]); setBannerForm(kept); } else fillBannerForm(b);
      setPane("banner");
    });
  };
  const openCouponRow = (c: AnyRow) => {
    const id = String(c._id);
    if (pane === "coupon" && String(couponForm.id) === id) return;
    guard("coupon", () => {
      const kept = stacked.coupon[id];
      if (kept) { dropStacked("coupon", [id]); setCouponForm(kept); } else fillCouponForm(c);
      setCouponBulk(EMPTY_BULK);
      setPane("coupon");
    });
  };
  // 칸 닫기 — 새로 쓰던 폼은 그대로 두고 닫는다(다시 열면 이어 쓴다). 고친 수정 폼은 쌓아 두고 닫는다(버리지 않는다 — 아래 띠 「모두 저장」)
  const closeEditPane = () => {
    const kind: EditKind | null = isEditKind(pane) ? pane : null;
    if (!kind) return closePane();
    const isNew = kind === "reg" ? !itemForm.id : kind === "product" ? !form.id : kind === "coupon" ? !couponForm.id : !bannerForm.id;
    if (isNew) return closePane();
    stashEdits([kind]);
    resetEditForm(kind);
    closePane();
  };
  // ── 전체 수정 — 고친 것 목록(쌓인 것 + 지금 열린 고친 수정 폼). 아래 띠 · 줄 점 · 모두 저장 · 떠날 때 묻기가 같이 쓴다 ──
  type EditJob = { kind: EditKind; id: string; name: string; form: AnyRow };
  const openForms: Record<EditKind, AnyRow> = { reg: itemForm, product: form, banner: bannerForm, coupon: couponForm };
  const jobNameOf = (kind: EditKind, fm: AnyRow) =>
    kind === "banner" ? String(fm?.title || "").trim() || "배너"
    : kind === "coupon" ? String(fm?.code || "").trim() || "쿠폰"
    : String(fm?.name || "").trim() || "이름 없음";
  const editJobs: EditJob[] = EDIT_KINDS.flatMap((k) => {
    const kept = stacked[k] as Record<string, AnyRow>;
    const open = openForms[k];
    return [
      ...Object.entries(kept).map(([id, fm]) => ({ kind: k, id, name: jobNameOf(k, fm), form: fm })),
      ...(editDirtyOf(k) && !kept[String(open.id)] ? [{ kind: k, id: String(open.id), name: jobNameOf(k, open), form: open }] : []),
    ];
  });
  const editedKeys = new Set(editJobs.map((j) => `${j.kind}:${j.id}`));
  // 목록 줄 · 카드의 빨간 점(쌓인 것 · 열린 고친 것)
  const isEdited = (kind: EditKind, id: unknown) => editedKeys.has(`${kind}:${String(id ?? "")}`);
  const editedDot = (kind: EditKind, id: unknown) =>
    isEdited(kind, id) ? <span role="img" aria-label="저장 안 한 수정" title="저장 안 한 수정" className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" /> : null;
  // 띠 · 확인 창 이름 — 종류가 섞이면 앞에 종류
  const EDIT_KIND_LABEL: Record<EditKind, string> = { reg: "아이템", product: "상품", banner: "배너", coupon: "쿠폰" };
  const mixedKinds = new Set(editJobs.map((j) => j.kind)).size > 1;
  const editNames = editJobs.map((j) => (mixedKinds ? `${EDIT_KIND_LABEL[j.kind]} ${j.name}` : j.name));
  const namesLine = (names: string[]) => `${names.slice(0, 3).join(" · ")}${names.length > 3 ? ` 외 ${(names.length - 3).toLocaleString()}개` : ""}`;
  // 되돌리기 — 쌓인 것 · 지금 열린 고친 수정 폼을 모두 저장된 값으로(한 번 묻는다 — 「버리기」). 열린 줄은 저장된 값으로 연 채
  const revertEdits = () => {
    setStacked({ reg: {}, product: {}, banner: {}, coupon: {} });
    if (regSavedRow && editDirtyOf("reg")) setItemForm(regFormOf(regSavedRow));
    if (prodSavedRow && editDirtyOf("product")) fillItemForm(prodSavedRow);
    if (banSavedRow && editDirtyOf("banner")) setBannerForm(bannerFormOf(banSavedRow));
    if (coupSavedRow && editDirtyOf("coupon")) setCouponForm(couponFormOf(coupSavedRow));
    toast("되돌렸습니다.");
  };
  const askRevertEdits = () => { if (!savingAll && editJobs.length) setLeaveAsk({ name: namesLine(editNames), go: revertEdits }); };
  // 저장 응답이 온 뒤 견줄 지금 폼 · 칸(저장하는 사이 칸을 닫거나 다시 고쳤는지)
  const liveEdit = useRef({ forms: openForms, pane });
  useEffect(() => { liveEdit.current = { forms: openForms, pane }; });
  // 모두 저장 — 쌓인 것 + 지금 열린 고친 폼을 차례로(검사 · 본문은 편집기 「저장」과 같은 길). 실패한 것만 남기고 무엇이 왜 실패했는지 알린다.
  //    실사이트 읽기 전용이면 쿠폰만 저장한다(아이템 · 상품 · 배너는 그대로 남는다)
  const saveAllEdits = async () => {
    if (savingAll || !editJobs.length) return;
    const locked = liveLocked ? editJobs.filter((j) => j.kind !== "coupon") : [];
    const jobs = editJobs.filter((j) => !locked.includes(j));
    if (!jobs.length) return fail(LIVE_LOCKED_MSG);
    // 열린 상품 폼이 「등록된 아이템」을 고르는 중인데 아직 안 골랐다 — 편집기 「저장」과 같이 막는다(직접 설정 상품으로 저장되지 않게)
    const held = !isBundleForm(form) && !linked && linkPick === formKey ? form : null;
    setSavingAll(true);
    const done: { job: EditJob; saved: AnyRow }[] = [];
    const failed: { job: EditJob; why: string }[] = [];
    for (const j of jobs) {
      if (j.kind === "product" && j.form === held) { failed.push({ job: j, why: "아이템을 선택해 주세요." }); continue; }
      const built = j.kind === "reg" ? regBody(j.form) : j.kind === "product" ? productBody(j.form)
        : { body: j.kind === "banner" ? { ...j.form, sortOrder: undefined } : j.form };
      if ("error" in built) { failed.push({ job: j, why: built.error }); continue; }
      const url = { reg: "/api/admin/items", product: "/api/shop/items", banner: "/api/shop/banners", coupon: "/api/shop/coupons" }[j.kind];
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(built.body) }).catch(() => null);
      const d = await res?.json().catch(() => null);
      if (res?.ok && d?.success) done.push({ job: j, saved: d.data });
      else failed.push({ job: j, why: d?.message || "저장에 실패했습니다." });
    }
    setSavingAll(false);
    // 저장한 것 — 쌓인 데서 빼고(그사이 다시 고쳐 쌓인 것은 남긴다), 목록 줄부터 새 값으로(다시 읽기 전 고친 채로 보이지 않게)
    for (const k of EDIT_KINDS) {
      const mine = done.filter((x) => x.job.kind === k);
      if (!mine.length) continue;
      for (const { job } of mine) dropStacked(k, [job.id], job.form);
      const rows = new Map<string, AnyRow>(mine.filter((x) => x.saved?._id).map((x) => [String(x.saved._id), x.saved]));
      if (!rows.size) continue;
      const merge = (list: AnyRow[]) => list.map((x) => (rows.has(String(x._id)) ? { ...x, ...rows.get(String(x._id)) } : x));
      if (k === "reg") setRegItems(merge);
      if (k === "product") setItems(merge);
      if (k === "banner") setBanners(merge);
      if (k === "coupon") setCoupons(merge);
    }
    // 열린 폼을 저장했으면(그사이 안 고쳤으면) — 넓은 화면은 저장한 값으로 연 채, 좁은 화면은 폼을 비우고 칸을 닫는다(편집기 「저장」과 같다)
    const live = liveEdit.current;
    for (const { job, saved } of done) {
      if (live.forms[job.kind] !== job.form) continue;
      const keep = wideDock && !!saved?._id;
      if (job.kind === "reg") setItemForm(keep ? regFormOf(saved) : EMPTY_ITEM_FORM);
      if (job.kind === "product") { if (keep) fillItemForm(saved); else { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); } }
      if (job.kind === "banner") setBannerForm(keep ? bannerFormOf(saved) : EMPTY_BANNER);
      if (job.kind === "coupon") setCouponForm(keep ? couponFormOf(saved) : EMPTY_COUPON);
      if (!keep && live.pane === job.kind) closePane();
    }
    fetchRegItems();
    fetchAll();
    if (!failed.length && !locked.length) return toast(`${done.length.toLocaleString()}개 저장했습니다.`);
    notify([
      `${done.length.toLocaleString()}개 저장 · ${(failed.length + locked.length).toLocaleString()}개 남음`,
      ...failed.slice(0, 12).map((x) => `${EDIT_KIND_LABEL[x.job.kind]} ${x.job.name} — ${x.why}`),
      ...(failed.length > 12 ? [`외 ${(failed.length - 12).toLocaleString()}개`] : []),
      ...(locked.length ? [`${locked.length.toLocaleString()}개 — ${LIVE_LOCKED_MSG}`] : []),
    ].join("\n"), true);
  };
  // 📌 다른 화면으로 가는 링크(왼쪽 메뉴 · 칸 안 링크) · 기능 검색 · 새로 고침 — 고친 게 남았으면(쌓인 것 · 열린 고친 폼 · 고친 새 폼) 한 번 묻는다(뒤로 가기는 막지 않는다).
  //    이 화면 안 주소(탭 줄 · ?item= · new · open= · 설정 창)는 묻지 않는다 — 탭을 옮기면 고친 수정 폼은 쌓이고 새로 쓰던 폼은 남는다
  const openNewDirty = isEditKind(pane) && !openForms[pane].id ? dirtyNameOf(pane) : null;
  const leaveNames = [...editNames, ...(openNewDirty ? [openNewDirty] : [])];
  const openDirty = leaveNames.length ? namesLine(leaveNames) : null;
  // 버리고 갈 때 — 쌓인 것을 비우고 열린 폼을 통째로 비우고 칸을 닫는다(새로 쓰던 폼도 — 「버리기」를 골랐다)
  const discardOpen = () => {
    setStacked({ reg: {}, product: {}, banner: {}, coupon: {} });
    if (pane === "reg") setItemForm(EMPTY_ITEM_FORM);
    if (pane === "product") { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
    if (pane === "banner") setBannerForm(EMPTY_BANNER);
    if (pane === "coupon") { setCouponForm(EMPTY_COUPON); setCouponBulk(EMPTY_BULK); }
    closePane();
  };
  // 저장 응답이 올 때 견줄 「지금 열린 폼」 id(saveBanner · saveItem · saveCoupon)
  useEffect(() => { openFormIds.current = { product: String(form.id || ""), banner: String(bannerForm.id || ""), coupon: String(couponForm.id || "") }; });
  // 이 화면(상점 관리) 안 주소 — 옮긴 탭(MOVED_TAB — 다른 화면으로 넘긴다)은 빼고
  const stayInShop = (href: string) => {
    try {
      const u = new URL(href, window.location.origin);
      if (u.origin !== window.location.origin || u.pathname.replace(/\/+$/, "") !== "/admin/shop") return false;
      return !MOVED_TAB[u.searchParams.get("tab") || ""];
    } catch {
      return false;
    }
  };
  const leaveRef = useRef<{ name: string | null; discard: () => void; stay: (href: string) => boolean }>({ name: null, discard: () => {}, stay: () => false });
  const leavingRef = useRef(false);
  const unloadingRef = useRef(false);
  const lastLeaveMark = useRef<LeaveMark | null>(null);
  // 📌 뒤로 가기(popstate) — 「위」 → 「아래」(같은 n)로 내려오면 묻는다. 남으면 「위」로 앞으로 한 칸, 나가면 한 번 더 뒤로(진짜 이전 화면).
  //    탭 · 주소 바꾸기(Next 가 쌓는 자리)는 「위」 위에 쌓여 묻지 않고 오간다. 고친 게 없으면 묻지 않고 한 번 더 뒤로(뒤로 가기가 헛돌지 않게)
  useEffect(() => {
    lastLeaveMark.current = leaveMarkOf(window.history.state);
    const onPop = () => {
      const m = leaveMarkOf(window.history.state);
      const was = lastLeaveMark.current;
      lastLeaveMark.current = m;
      if (leavingRef.current) {
        leavingRef.current = false;
        if (leaveRef.current.name && window.location.pathname.startsWith("/admin/shop")) lastLeaveMark.current = armLeaveGuard();
        return;
      }
      if (m?.at !== "below" || was?.at !== "top" || was.n !== m.n) return;
      const name = leaveRef.current.name;
      if (name && !window.confirm(backLeaveAsk(name))) { window.history.forward(); return; }
      leavingRef.current = true;
      unloadingRef.current = false;
      window.history.back();
      // 더 뒤로 갈 데가 없으면 기록 이벤트가 오지 않는다 — 잠시 뒤에도 그대로면 남은 것으로 보고 표지를 다시 세운다
      window.setTimeout(() => {
        if (!leavingRef.current || unloadingRef.current) return;
        leavingRef.current = false;
        if (leaveRef.current.name) lastLeaveMark.current = armLeaveGuard();
      }, 1500);
    };
    // 나가기로 한 뒤 앞으로 가기로 되살아나면(bfcache) 나가는 중 표시를 풀고 표지를 다시 세운다
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      leavingRef.current = false;
      unloadingRef.current = false;
      lastLeaveMark.current = leaveRef.current.name ? armLeaveGuard() : leaveMarkOf(window.history.state);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onShow);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("pageshow", onShow); };
  }, []);
  useEffect(() => { leaveRef.current = { name: openDirty, discard: discardOpen, stay: stayInShop }; });
  const hasLeaveDirty = !!openDirty;
  useEffect(() => { if (hasLeaveDirty) lastLeaveMark.current = armLeaveGuard(); }, [hasLeaveDirty]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const { name, discard, stay } = leaveRef.current;
      if (!name || e.defaultPrevented) return;
      // 새 탭 · 새 창으로 여는 누르기(가운데 단추 · Ctrl · ⌘ · Shift)는 이 화면이 남는다
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || stay(href)) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveAsk({ name, go: () => { discard(); router.push(href, { scroll: false }); } });
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      // 뒤로 가기로 나가기로 이미 답했으면 브라우저가 한 번 더 묻지 않게
      if (leavingRef.current) { unloadingRef.current = true; return; }
      if (!leaveRef.current.name) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => { document.removeEventListener("click", onClick, true); window.removeEventListener("beforeunload", onUnload); };
  }, [router]);
  // 📌 기능 검색(ui.tsx adminNavigate — Enter · 누르기)으로 옮길 때도 같은 확인 한 번(검색 창은 먼저 닫힌다 — 확인이 그 아래에 깔리지 않게).
  //    이 화면 안 주소(다른 탭 · ?item= · new · open= · 설정 창)는 묻지 않고 보낸다 — 탭을 옮기면 고친 수정 폼은 쌓이고, 따라가는 길(deepSeen)이
  //    폼을 바꿀 때는 거기서(openRegRow · openNewReg … 고친 새 폼만 한 번 묻는다), 창만 여는 주소(설정 · 추천 아이템 · 그룹 · 테마)는 고친 폼을 그대로 둔다
  useLeaveGuard(!!openDirty, (href) => {
    const { name, discard } = leaveRef.current;
    if (!name || stayInShop(href)) return true;
    setLeaveAsk({ name, go: () => { discard(); router.push(href, { scroll: false }); } });
    return false;
  });

  // ── 쿠폰 ────────────────────────────────────

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
    else fail(d?.message || "지급에 실패했습니다.");
    setIsIssuing(false);
  };

  // 📌 2026-10-17 「예전 코드 가져오기」(옛 코드 → 보상형 쿠폰 이관 단추)와 쿠폰 탭을 열 때마다 돌던 예전 기록 조회를 걷었다(이관은 끝난 일 — 운영자 결정)

  const fillCouponForm = (c: AnyRow) => setCouponForm(couponFormOf(c));

  // 📌 쿠폰 저장 — 한 장(코드 직접) · 여러 장(앞머리 + 장수 + 무작위 글자 수 — 서버가 코드를 만든다 → 만든 코드 창 「복사 · CSV」).
  //    붙는 편집기(넓은 화면)는 저장한 쿠폰을 연 채 둔다(여러 장은 닫고 코드 창)
  const saveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (couponSaving) return;
    const bulkOn = !couponForm.id && couponBulk.on;
    let bulk: { prefix: string; count: number; length: number } | null = null;
    if (bulkOn) {
      const count = Number(couponBulk.count);
      const length = Number(couponBulk.length);
      if (!Number.isInteger(count) || count < 2 || count > BULK_COUNT_MAX) return fail(`장수는 2~${BULK_COUNT_MAX}장으로 입력해 주세요.`);
      if (!Number.isInteger(length) || length < 4 || length > 16) return fail("무작위 글자 수는 4~16자로 입력해 주세요.");
      bulk = { prefix: couponBulk.prefix.trim().toUpperCase(), count, length };
    }
    const wasNew = !couponForm.id;
    const sentId = String(couponForm.id || "");
    const sentForm = couponForm;
    const name = String(couponForm.name || "").trim();
    setCouponSaving(true);
    const res = await fetch("/api/shop/coupons", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bulk ? { ...couponForm, code: "", bulk } : couponForm),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setCouponSaving(false);
    if (!(res?.ok && d?.success)) return fail(d?.message || "저장에 실패했습니다.");
    dropStacked("coupon", [sentId], sentForm);
    fetchAll();
    if (bulk) {
      const codes: string[] = Array.isArray(d.codes) ? d.codes.map(String) : [];
      setCouponForm(EMPTY_COUPON);
      setCouponBulk(EMPTY_BULK);
      closePane();
      setCouponCodes({ name, codes });
      toast(`${codes.length.toLocaleString()}장 발급했습니다.`);
      return;
    }
    if (openFormIds.current.coupon === sentId) {
      if (wideDock && d.data?._id) setCouponForm(couponFormOf(d.data));
      else { setCouponForm(EMPTY_COUPON); closePane(); }
    }
    toast(wasNew ? "발급했습니다." : "저장했습니다.");
  };
  // 📌 줄 사용 상태 스위치 — 그 칸만 바로 저장(PATCH { id, active }). 화면부터 바꾸고 실패하면 되돌린다
  const toggleCouponActive = async (c: AnyRow) => {
    if (couponSwitchBusy) return;
    const id = String(c._id);
    const next = !c.active;
    const before = coupons;
    setCouponSwitchBusy(id);
    setCoupons((list) => list.map((x) => (String(x._id) === id ? { ...x, active: next } : x)));
    const res = await fetch("/api/shop/coupons", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: next }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setCouponSwitchBusy("");
    if (res?.ok && d?.success) {
      // 열린 폼이 이 쿠폰이면 폼의 사용 상태도 새 값으로(저장이 옛 값으로 되돌리지 않게)
      setCouponForm((f: AnyRow) => (String(f.id || "") === id ? { ...f, active: next } : f));
      fetchAll();
      toast(next ? "사용 가능으로 바꿨습니다." : "사용을 중지했습니다.");
    } else { setCoupons(before); fail(d?.message || "저장에 실패했습니다."); }
  };
  // 만든 코드 — 복사 · CSV
  const copyCodes = async (codes: string[]) => {
    try { await navigator.clipboard.writeText(codes.join("\n")); toast(`${codes.length.toLocaleString()}개 복사했습니다.`); }
    catch { fail("복사하지 못했습니다."); }
  };
  const codesCsv = (name: string, codes: string[]) => {
    downloadCsv(`coupons-${ymd(new Date())}.csv`, [["코드", "쿠폰 이름"], ...codes.map((c) => [c, name])]);
    toast("CSV 를 내려받았습니다.");
  };

  useEffect(() => { if (isAdmin) { fetchAll(); fetchRegItems(); } }, [isAdmin, fetchAll, fetchRegItems]);

  // ── 상점 설정 창(머리 「설정」) ────────────────
  //    📌 2026-10-04 "관리자가 정하게 해" — 캐시백 합 상한(%) · 빙옥 결제분 캐시백 + 2026-10-17 ARCTIC 상점 공개(레벨 설정 › 공개 · 초기화에서 옮김).
  //       저장은 바뀐 칸만 app/api/bot-settings PATCH(다른 봇 설정은 건드리지 않는다 — POST 는 shopPublic 을 쓰지 않는다).
  //       열 때마다 다시 읽어 그동안 칸을 잠근다(다른 창 · 다른 관리자가 바꾼 값). 닫으면 저장 안 한 수정은 버린다
  const [shopSet, setShopSet] = useState<ShopSet | null>(null);
  const [shopSetSnap, setShopSetSnap] = useState<ShopSet | null>(null);
  const [savingShopSet, setSavingShopSet] = useState(false);
  const [shopSetOpen, setShopSetOpen] = useState(false);
  const [shopSetLoading, setShopSetLoading] = useState(false);
  // 아이템 효과 편집기의 상시 효과 상한 재료 — 같은 설정을 읽어 넘긴다(편집기가 열릴 때마다 다시 읽지 않게)
  const [botCaps, setBotCaps] = useState<BotCaps | null>(null);
  // 겹친 읽기는 마지막 것만 받는다. 처음 한 번(효과 편집기 상한 재료) + 창을 열 때마다 · 「다시 읽기」(shopSetReload). 창을 닫을 때는 다시 읽지 않는다
  const shopSetSeq = useRef(0);
  const shopSetReady = useRef(false);
  const [shopSetReload, setShopSetReload] = useState(0);
  useEffect(() => {
    if (!isAdmin || (!shopSetOpen && shopSetReady.current)) return;
    const seq = ++shopSetSeq.current;
    const reportFail = shopSetOpen;
    fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((d) => {
      if (seq !== shopSetSeq.current) return;
      setShopSetLoading(false);
      if (!d?.success) {
        if (reportFail) toast("설정을 읽지 못했습니다.", true);
        return;
      }
      shopSetReady.current = true;
      const v = shopSetOf(d.data);
      setShopSet(v);
      setShopSetSnap(v);
      setBotCaps(botCapsOf(d.data));
    });
  }, [isAdmin, shopSetOpen, shopSetReload, toast]);
  const openShopSettings = () => { if (shopSetOpen) return; setShopSetLoading(true); setShopSetOpen(true); };
  const closeShopSettings = () => {
    if (savingShopSet) return;
    setShopSetOpen(false);
    setShopSetLoading(false);
    if (shopSetSnap) setShopSet(shopSetSnap);
  };
  // 주소로 열기(isSettingsLink — 없던 것이 생길 때 한 번) · 연 뒤 그 표시는 주소에서 걷는다(지금 탭으로 — 같은 주소로 다시 와도 또 열리게 · 새로고침에 다시 뜨지 않게)
  const [settingsLinkOn, setSettingsLinkOn] = useState(false);
  if (settingsLink !== settingsLinkOn) {
    setSettingsLinkOn(settingsLink);
    if (settingsLink && !shopSetOpen) { setShopSetLoading(true); setShopSetOpen(true); }
  }
  //    📌 따라가기 표시(?new=1 · item= · edit= · open=preset|groups|themes — 아래 deepSeen)도 따라간 뒤 같이 걷는다(2026-10-17 — 같은 기능 검색 줄을 다시 고르면 또 열리게 ·
  //       새로 고침에 닫은 폼이 다시 열리지 않게). 목록을 기다리는 동안(deepWait — 아직 안 따라감)은 남겨 둔다. 한 번에 걷어 주소 바꾸기가 겹치지 않게
  const deepKey = searchParams.toString();
  const deepMarked = hasDeepMark(searchParams);
  useEffect(() => {
    if (movedTo) return;
    const deepDone = deepMarked && deepSeen === deepKey;
    if (!settingsLink && !deepDone) return;
    const p = new URLSearchParams(deepKey);
    if (settingsLink) {
      if (p.get("open") === "settings") p.delete("open");
      p.delete("settings");
    }
    if (deepDone) {
      DEEP_KEYS.forEach((k) => p.delete(k));
      if (DEEP_OPENS.has(p.get("open") || "")) p.delete("open");
    }
    p.set("tab", tab);
    router.replace(`/admin/shop?${p.toString()}`, { scroll: false });
  }, [settingsLink, deepMarked, deepSeen, deepKey, movedTo, tab, router]);
  const shopSetDirty = !!shopSet && !!shopSetSnap && (shopSet.pub !== shopSetSnap.pub || shopSet.cap.trim() !== shopSetSnap.cap || shopSet.onPoint !== shopSetSnap.onPoint);
  const saveShopSet = async () => {
    if (!shopSet || !shopSetSnap || savingShopSet || shopSetLoading) return;
    // 바뀐 게 없으면(단추는 잠겨 있다 — Enter · Ctrl+S) 한 줄만
    if (!shopSetDirty) { toast("바뀐 것이 없습니다."); return; }
    const body: Record<string, number | boolean> = {};
    if (shopSet.pub !== shopSetSnap.pub) body.shopPublic = shopSet.pub;
    if (shopSet.cap.trim() !== shopSetSnap.cap) {
      const cap = Number(shopSet.cap);
      if (shopSet.cap.trim() === "" || !Number.isInteger(cap) || cap < 0 || cap > 100) return fail("캐시백 상한은 0~100 사이의 정수로 입력해 주세요.");
      body.shopCashbackCap = cap;
    }
    if (shopSet.onPoint !== shopSetSnap.onPoint) body.cashbackOnPoint = shopSet.onPoint;
    setSavingShopSet(true);
    const res = await fetch("/api/bot-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingShopSet(false);
    if (res?.ok && d?.success) {
      const v = shopSetOf(d.data);
      setShopSet(v);
      setShopSetSnap(v);
      setBotCaps(botCapsOf(d.data));
      setShopSetOpen(false);
      toast("shopPublic" in body ? (v.pub ? "ARCTIC 상점을 공개했습니다." : "ARCTIC 상점을 비공개로 바꿨습니다.") : "저장했습니다.");
    } else fail(d?.message || "저장에 실패했습니다.");
  };

  // ── 종류별 효과 문구(2026-10-18 — ./EffectTemplatesSheet · lib/itemEffects 「종류별 효과 문구」) ────────────────
  //    처음 한 번 읽어 이 화면의 지금 틀에 넣는다(아이템 편집기 자동 문구 미리 보기가 같은 틀 — fxTpl.ver 가 늘면 다시 그린다).
  //    창: 상점 설정 창 「효과 문구」 · 아이템 편집기 효과 문구 칸 「종류별 문구」 · 기능 검색(?open=fxtext). 저장 뒤 아이템 목록을 다시 받는다(목록의 효과 줄은 서버가 만든 것)
  const fxTpl = useEffectTemplates(isAdmin);
  const [fxTextOpen, setFxTextOpen] = useState(false);
  //    열 때 고를 종류 — 아이템 편집기 「종류별 문구」면 그 아이템 효과 종류(창이 앞에서부터 틀이 있는 첫 종류를 고른다), 그 밖은 없음
  const [fxTextFocus, setFxTextFocus] = useState<string[]>([]);
  //    상점 설정 창에서 열면 그 창 위에 겹쳐 띄운다(설정 창을 닫으면 저장 안 한 설정이 말없이 사라졌다) — 닫으면 설정 창으로 돌아온다
  const openFxText = (focus: string[] = []) => { sfxTick(); setFxTextFocus(focus); setFxTextOpen(true); };
  const fxTextCount = fxTpl.saved ? Object.keys(fxTpl.saved).length : 0;
  //    아이템 편집기 「종류별 문구」 — 그 아이템 효과 종류부터(효과 줄 차례 → 기본 버프 채팅 · 음성 · 출석)
  const openFxTextForItem = () => openFxText([...itemForm.effects.map((d) => d.on), ...(Number(itemForm.chatBuffXp) > 0 ? ["chat"] : []), ...(Number(itemForm.voiceBuffXp) > 0 ? ["voice"] : []), ...(Number(itemForm.attendBuffXp) > 0 ? ["attend"] : [])]);

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
  // 저장된 상품을 불러올 때 — 아이템 고르는 중 · 잡아 둔 직접 설정 값도 푼다(같은 상품을 닫았다 다시 열어도 옛 상태가 남지 않게)
  const fillItemForm = useCallback((it: any) => { setForm(prodFormOf(it)); setLinkPick(null); setCustomSnap(null); }, []);

  // 📌 상점 카드의 「관리에서 수정」 링크(?edit=<id>)는 아래 주소 따라가기(deepSeen)가 연다 — 주소가 바뀔 때 한 번(저장 뒤 목록을 다시 불러와도 저절로 다시 열지 않는다)

  // 📌 탭을 옮기면 열린 상세 칸 · 검색어를 비운다 (렌더 중 조정 — 이펙트로 한 박자 늦게 닫히지 않게)
  const [paneTab, setPaneTab] = useState(tab);
  if (paneTab !== tab) {
    setPaneTab(tab);
    // 수정하던 폼은 비운다(칸이 닫힌다 — 고친 것은 쌓아 둔다(전체 수정) · 새로 쓰던 폼은 남겨 「새로 만들기」로 이어 쓴다)
    stashEdits();
    setItemForm((f) => (f.id ? EMPTY_ITEM_FORM : f));
    if (form.id) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
    setBannerForm((f: any) => (f.id ? EMPTY_BANNER : f));
    setCouponForm((f: AnyRow) => (f.id ? EMPTY_COUPON : f));
    setPane("");
    setOrderSelId(null);
    setQ("");
  }

  // 상품 폼 → 저장 본문(검사 실패면 error)
  const productBody = (fm: ProdForm): { body: any } | { error: string } => {
    // 📌 판매 방식마다 꼭 필요한 가격(productForm saleModeError — 일괄 가격 창도 같은 검사)
    const bad = saleModeError(fm) || bundleError(fm);
    if (bad) return { error: bad };
    // 세트 — 역할 · 쌓이지 않는 아이템 줄은 1개로 보낸다(개수 칸이 잠겨 1로 보이는 값 그대로)
    const sendForm = isBundleForm(fm) ? { ...fm, bundle: fm.bundle.map((r) => (qtyLockedOf(regItems, items, r.itemId) ? { ...r, qty: "1" } : r)) } : fm;
    // 분류 — 직접 설정 · 세트만 자기 칸("" = 자동). 연결 상품은 아이템 분류를 따른다(늘 "" — 서버도 같다)
    const category = isLinked(fm) ? "" : normalizeCategory(fm.category || "");
    return { body: { ...toPayload(sendForm, guildRoles.find((r) => r.id === fm.roleId)?.name || ""), category, sortOrder: undefined } };
  };
  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveLocked) return fail(LIVE_LOCKED_MSG);
    // 「등록된 아이템」을 골랐는데 아이템을 아직 안 골랐다 — 직접 설정 상품으로 저장되지 않게 막는다
    if (!isBundleForm(form) && !linked && linkPick === formKey) return fail("아이템을 선택해 주세요.");
    const built = productBody(form);
    if ("error" in built) return fail(built.error);
    if (savingProduct) return;
    const wasNew = !form.id;
    const sentId = String(form.id || "");
    const sentForm = form;
    setSavingProduct(true);
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingProduct(false);
    if (res?.ok && d?.success) {
      dropStacked("product", [sentId], sentForm);
      // 📌 붙는 편집기(넓은 화면)는 저장한 상품을 연 채 다음 줄로 넘어가며 고친다(목록 줄부터 새 값 — 다시 읽기 전 「고친 채」로 보이지 않게).
      //    좁은 화면은 예전처럼 닫는다. 보내는 사이 다른 줄로 넘어갔으면 그 폼은 그대로
      if (openFormIds.current.product === sentId) {
        if (wideDock && d.data?._id) {
          const saved = d.data;
          if (!wasNew) setItems((list) => list.map((x) => (String(x._id) === String(saved._id) ? { ...x, ...saved } : x)));
          fillItemForm(saved);
        } else { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); closePane(); }
      }
      fetchAll(); fetchRegItems();
      toast(wasNew ? "등록했습니다." : "저장했습니다.");
    }
    else fail(d?.message || "저장에 실패했습니다.");
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    if (liveLocked && deleteTarget.kind !== "coupon") { setDeleteTarget(null); return fail(LIVE_LOCKED_MSG); }
    const api = { item: "/api/shop/items", banner: "/api/shop/banners", coupon: "/api/shop/coupons", reg: "/api/admin/items" }[deleteTarget.kind];
    const res = await fetch(`${api}?id=${deleteTarget.id}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    // 지운 줄의 상세 칸은 닫고 그 폼은 비운다(같은 폼으로 다시 저장되지 않게)
    if (res?.ok) {
      if (deleteTarget.kind === "reg") setItemForm(EMPTY_ITEM_FORM);
      if (deleteTarget.kind === "item") { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
      if (deleteTarget.kind === "banner") setBannerForm(EMPTY_BANNER);
      if (deleteTarget.kind === "coupon") setCouponForm(EMPTY_COUPON);
      dropStacked(deleteTarget.kind === "item" ? "product" : deleteTarget.kind, [String(deleteTarget.id || "")]);
      fetchAll(); fetchRegItems(); closePane(); toast("삭제했습니다.");
    }
    // 아이템은 참조 상품이 있으면 서버가 409 로 막는다 — 이유를 그대로 보여 준다
    else fail(d?.message || "삭제에 실패했습니다.");
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
      // 왼쪽 메뉴 「상점 관리」 처리 대기 숫자도 다시 센다(app/admin/adminIndex.ts)
      try { window.dispatchEvent(new Event(ADMIN_COUNTS_EVENT)); } catch {}
      const n = Number(d.done) || 1;
      const many = n > 1 ? `${n}개를 ` : "";
      const msg = newStatus === "completed" ? "발송 처리했습니다." : newStatus === "refunded" ? `${many}환불했습니다.` : `${many}취소하고 환불했습니다.`;
      // 건너뛴 건이 있으면 놓치지 않게 알림 창, 아니면 토스트(둘 다 효과음)
      if (Number(d.skipped) > 0) notify(`${msg}\n이미 처리했거나 사용한 ${d.skipped}개는 건너뛰었습니다.`);
      else toast(msg);
    }
    else fail(d?.message || "처리에 실패했습니다.");
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
    if (!pool.length) return fail("돌려줄 수 있는 건이 없습니다. 이미 사용했거나 처리한 건입니다.");
    setCancelCount(String(pool.length));
    setCancelTarget({ ...g, pool });
  };

  // ── 상품 일괄 편집(PATCH /api/shop/items { batch } · { duplicate } · DELETE ?ids= — 서버가 상품 저장과 같은 규칙 · 초안 규칙으로 쓴다) ──
  const patchProducts = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    return { ok: !!(res?.ok && d?.success), d };
  };
  // 화면 목록에 먼저 — 바꿀 값을 저장 모양으로(응답 뒤 다시 읽어 서버 값으로 맞춘다)
  const localProdSet = (it: AnyRow, set: Record<string, unknown>) => {
    const out = { ...it };
    if ("active" in set) out.active = !!set.active;
    if ("theme" in set) out.theme = String(set.theme || "");
    if ("discountPct" in set) { out.discountPct = Number(set.discountPct) || 0; if (!out.discountPct) out.discountUntil = null; }
    if ("discountUntil" in set) out.discountUntil = set.discountUntil || null;
    if ("saleUntil" in set) out.saleUntil = set.saleUntil || null;
    if ("price" in set) out.price = Number(set.price) || 0;
    if ("durations" in set) out.durations = set.durations;
    if ("stock" in set) out.stock = Number(set.stock);
    if ("stockDelta" in set && Number(it.stock) >= 0) out.stock = Math.max(0, Number(it.stock) + Number(set.stockDelta));
    // 설명 · 분류(설명 바꾸기 · 분류 바꾸기) — 연결 상품 줄은 연결 아이템에 보낸 값을 따라 보인다(상품 자기 분류 칸은 늘 "")
    if ("description" in set) out.description = String(set.description ?? "");
    if ("category" in set) {
      const c = normalizeCategory(set.category);
      if (!it.itemId) out.category = c;
      out.categoryLabel = c || it.categoryAuto || it.categoryLabel;
    }
    return out;
  };
  // 결과 — 다 됐으면 토스트(바뀐 게 없으면 그렇다고), 건너뛴 게 있으면 이유 목록(알림 창)
  const reportProd = (d: AnyRow, verb: string) => {
    const done = Number(d?.updated) || 0;
    const skipped: Skip[] = Array.isArray(d?.skipped) ? d.skipped : [];
    if (!done && !skipped.length) return toast("바뀐 것이 없습니다.");
    reportBatch(done, skipped, verb, items);
  };
  const runProdBatch = async (entries: ProdEntry[], verb = "바꿈") => {
    if (!entries.length || prodBusy || liveLocked) return false;
    const before = items;
    const local = new Map(entries.map((e) => [e.id, e.set]));
    setItems((list) => list.map((x) => { const set = local.get(String(x._id)); return set ? localProdSet(x, set) : x; }));
    setProdBusy(true);
    const { ok, d } = await patchProducts({ batch: entries });
    setProdBusy(false);
    if (!ok) { setItems(before); fail(d?.message || "저장하지 못했습니다."); return false; }
    fetchAll();
    reportProd(d, verb);
    return true;
  };
  const prodBatchSet = (set: Record<string, unknown>, verb = "바꿈") => runProdBatch(prodSel.keys().map((id) => ({ id, set })), verb);
  // 창(할인 · 판매 종료 · 가격 · 재고) — 연 시각을 같이 둔다(지난 시각 표시)
  const openProdSheet = (m: ProdSheetMode) => { setProdSheetAt(Date.now()); setProdSheet(m); };
  const submitProdSheet = async (entries: ProdEntry[]) => {
    const ok = await runProdBatch(entries, "바꿈");
    if (ok) setProdSheet("");
  };
  // 📌 상품 설명 · 분류 일괄(설명 바꾸기 · 분류 바꾸기) — 직접 설정 · 세트는 상품(PATCH /api/shop/items { batch }), 연결 상품은 그 아이템
  //    (PATCH /api/admin/items { batch } — 설명 · 분류의 원천. 그 아이템에 연결된 상품이 모두 따라간다). 화면 목록부터 맞추고 둘 다 보낸 뒤 결과를 한 번에 알린다
  //    (토스트 하나 · 건너뜀은 알림 창). 둘 다 실패하면 되돌린다 — 한쪽만 실패하면 다시 읽어 서버 값으로 맞추고 실패한 줄은 건너뜀으로
  const runProdTextBatch = async (own: ProdEntry[], viaItems: ProdEntry[], verb = "바꿈") => {
    if ((!own.length && !viaItems.length) || prodBusy || batchBusy || liveLocked) return false;
    const beforeProd = items;
    const beforeReg = regItems;
    const ownSet = new Map(own.map((e) => [e.id, e.set]));
    const itemSet = new Map(viaItems.map((e) => [e.id, e.set]));
    setItems((list) => list.map((x) => {
      const set = ownSet.get(String(x._id)) || (x.itemId ? itemSet.get(String(x.itemId)) : undefined);
      return set ? localProdSet(x, set) : x;
    }));
    if (itemSet.size) {
      setRegItems((list) => list.map((x) => {
        const set = itemSet.get(String(x._id));
        if (!set) return x;
        return withCategoryFields({ ...x, ...set, ...("category" in set ? { category: normalizeCategory(set.category) } : {}) });
      }));
    }
    setProdBusy(true);
    const a = own.length ? await patchProducts({ batch: own }) : null;
    const b = viaItems.length ? await patchItems({ batch: viaItems }) : null;
    setProdBusy(false);
    if (!a?.ok && !b?.ok) {
      setItems(beforeProd);
      setRegItems(beforeReg);
      fail(a?.d?.message || b?.d?.message || "저장하지 못했습니다.");
      return false;
    }
    fetchAll();
    if (b) fetchRegItems();
    const failedOf = (r: { ok: boolean; d: AnyRow } | null, list: ProdEntry[]): Skip[] =>
      !r ? [] : r.ok ? (Array.isArray(r.d?.skipped) ? r.d.skipped : []) : list.map((e) => ({ id: e.id, why: r.d?.message || "저장하지 못했습니다." }));
    const done = (a?.ok ? Number(a.d?.updated) || 0 : 0) + (b?.ok ? Number(b.d?.updated) || 0 : 0);
    const skipped = [...failedOf(a, own), ...failedOf(b, viaItems)];
    if (!done && !skipped.length) toast("바뀐 것이 없습니다.");
    else reportBatch(done, skipped, verb, [...items, ...regItems]);
    return true;
  };
  // 창이 고른 줄 → 보낼 곳별로(아이템 탭은 아이템만 · 상품 탭은 상품 + 연결 아이템)
  const submitTextSheet = async (of: "reg" | "product", entries: TextEntry[]) => {
    const toItems = entries.filter((e) => e.kind === "item").map(({ id, set }) => ({ id, set }));
    const toProducts = entries.filter((e) => e.kind === "product").map(({ id, set }) => ({ id, set }));
    const ok = of === "reg" ? await runBatch(toItems, "바꿈") : await runProdTextBatch(toProducts, toItems, "바꿈");
    if (ok) setTextSheet(null);
  };
  // 📌 줄 판매 스위치 — 바로 저장(그 칸만). 화면부터 바꾸고 실패하면 되돌린다
  const toggleProductActive = async (it: AnyRow) => {
    if (prodSwitchBusy || liveLocked) return;
    const id = String(it._id);
    const next = !it.active;
    const before = items;
    setProdSwitchBusy(id);
    setItems((list) => list.map((x) => (String(x._id) === id ? { ...x, active: next } : x)));
    const { ok, d } = await patchProducts({ batch: [{ id, set: { active: next } }] });
    setProdSwitchBusy("");
    if (ok && !(Array.isArray(d?.skipped) && d.skipped.length)) { fetchAll(); toast(next ? "판매합니다." : "숨겼습니다."); }
    else { setItems(before); fail(d?.skipped?.[0]?.why || d?.message || "저장에 실패했습니다."); }
  };
  // 📌 일괄 복제 — 같은 값의 새 상품(숨김으로 · 원본 바로 뒤). 복제본을 골라 둔다(바로 이어서 가격 · 테마 등을 고친다)
  const duplicateProducts = async () => {
    const ids = prodSel.keys();
    if (!ids.length || prodBusy || liveLocked) return;
    setProdBusy(true);
    const { ok, d } = await patchProducts({ duplicate: ids });
    setProdBusy(false);
    if (!ok) return fail(d?.message || "복제하지 못했습니다.");
    const made: string[] = Array.isArray(d.created) ? d.created.map((c: { id?: string }) => String(c?.id || "")).filter(Boolean) : [];
    if (made.length) prodSel.replace(made);
    fetchAll();
    const skipped: Skip[] = Array.isArray(d.skipped) ? d.skipped : [];
    if (!skipped.length) toast(`${made.length.toLocaleString()}개 복제 · 숨김`);
    else reportBatch(made.length, skipped, "복제", items);
  };
  // 📌 일괄 삭제 — 확인 한 번(지울 이름 목록). 주소 길이 때문에 100개씩 나눠 보낸다
  const deleteProducts = async () => {
    const ids = prodSel.keys();
    if (!ids.length || prodBusy || liveLocked) return;
    setProdBusy(true);
    const gone: string[] = [];
    let failMsg = "";
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      const res = await fetch(`/api/shop/items?ids=${part.map(encodeURIComponent).join(",")}`, { method: "DELETE" }).catch(() => null);
      const d = await res?.json().catch(() => null);
      if (!(res?.ok && d?.success)) { failMsg = d?.message || "삭제하지 못했습니다."; break; }
      if (Array.isArray(d.deleted)) gone.push(...d.deleted.map(String));
    }
    setProdBusy(false);
    setProdDelAsk(false);
    if (form.id && gone.includes(String(form.id))) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); if (pane === "product") closePane(); }
    dropStacked("product", gone);
    if (gone.length) { prodSel.clear(); fetchAll(); fetchRegItems(); }
    if (failMsg) return fail(gone.length ? `${gone.length.toLocaleString()}개 삭제 · ${failMsg}` : failMsg);
    toast(`${gone.length.toLocaleString()}개 삭제`);
  };

  // ── 아이템 순서 · 그룹(끌어서 바로 저장) ──
  //    무엇을 어디에 놓았는지(옮긴 것 + 새 앞 · 뒤 이웃 · 바뀐 그룹)만 보낸다 — 서버가 지금 순서에서 같은 계산(lib/itemOrder.js)으로 저장하고 새 순서를 준다.
  //      머리줄(group:<이름>) → 덩어리째 단위 사이로(saveRegMove)
  //      아이템 줄 하나(묶음 표) → 놓은 자리의 그룹 · 이웃으로(saveRegDrop): 같은 그룹 안 · 그룹 없음끼리는 순서만, 그 밖은 그룹을 바꾸며 그 자리에(moveToGroup)
  //      한 그룹만 · 그룹 없음만 거른 표(머리줄 없음)는 saveRegMove — 그 안에서만(그룹은 그대로)
  //    거른 목록(검색 · 유형 · 그룹 거르기)에서 옮겨도 보이는 이웃 바로 뒤(맨 앞이면 바로 앞)에 놓인다.
  //    화면 목록부터 같은 계산으로 맞추고(옛 순서가 한 번 비치지 않게), 서버가 준 순서로 마무리한다. 실패하면 되돌린다(409 = 목록이 바뀜 → 다시 불러온다)
  type RegMove = { unit?: string; item?: string; group?: string; after?: string; before?: string };
  const unitOfTableKey = (k: string) => { const g = tableGroupOfKey(k); return g != null ? groupUnitKey(g) : itemUnitKey(k); };
  const sendRegMove = async (move: RegMove, okMsg: string, regrouped: boolean) => {
    const before = regItems;
    const rows = orderRowsOf(before);
    const to = { after: move.after, before: move.before };
    const local = move.item && move.group !== undefined ? moveToGroup(rows, move.item, move.group, to)
      : move.item ? moveInGroup(rows, move.item, to)
      : moveUnit(rows, move.unit as string, to);
    if (!local) {
      fetchRegItems();
      return fail("목록이 바뀌었습니다. 다시 불러온 뒤 옮겨 주세요.");
    }
    // 그룹이 바뀐 아이템은 화면 목록에도 새 그룹으로
    const groupAt = new Map(local.map((r) => [r.id, r.group]));
    const regroup = (list: any[]) => list.map((it) => {
      const g = groupAt.get(String(it._id));
      return g !== undefined && g !== groupOfItem(it) ? { ...it, group: g } : it;
    });
    // 상위 규칙도 화면에서 먼저(서버와 같은 함수) — 다른 상위 사이에 놓은 그룹이 한 번 비치지 않게
    //    머리줄을 끌었으면 그 그룹의 상위 덩어리는 형제 쪽에(서버와 같은 pin)
    const pin = move.unit && move.unit.startsWith("g:") ? move.unit.slice(2) : "";
    setRegItems(reorderById(regroup(before), nestParents(local, regParentOf, pin).map((r) => r.id)));
    setSavingOrder("reg");
    const res = await fetch("/api/admin/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder("");
    if (res?.ok && d?.success) {
      if (Array.isArray(d.order)) setRegItems((list) => reorderById(list, d.order.map(String)));
      if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
      takeParents(d);
      toast(okMsg);
      // 그룹이 바뀌면 다시 불러온다(초안 표시 등 — 그룹 지정과 같다). 순서만이면 초안 수만
      if (regrouped) fetchRegItems();
      else fetchDraft();
    } else {
      setRegItems(before);
      fail(d?.message || (regrouped ? "그룹을 저장하지 못했습니다." : "순서를 저장하지 못했습니다."));
      if (res?.status === 409) fetchRegItems();
    }
  };
  // 📌 체크한 줄 덩어리(2026-10-18) — 고른 아이템 줄을 끌면 고른 줄 모두(목록 차례 그대로)를 놓은 자리에 한 덩어리로(placeBlock).
  //    gapOf: 지금 전체 차례의 놓은 틈 · group: 옮긴 뒤 그룹(undefined = 그대로 — 한 그룹만 · 그룹 없음만 거른 표).
  //    그룹이 바뀌는 줄은 일괄 「그룹」과 같은 길(batch)로 먼저 — 그 결과가 놓은 자리와 같으면(접힌 머리줄 위 = 새 덩어리 끝 등) 그것으로 끝,
  //    아니면 전체 순서({ order })를 한 번 더. 그룹이 그대로면 순서 한 번만. 화면부터 서버와 같은 셈(덩어리 · 상위 규칙)으로 맞추고, 실패하면 되돌린다.
  //    그룹을 못 바꾼 줄(서버 검사에 걸린 것)은 제자리에 두고 한 줄로 알린다
  type RegGap = (ids: string[], groupOfId: (id: string) => string) => number | null;
  const sendRegBlock = async (block: string[], gapOf: RegGap, group?: string) => {
    const before = regItems;
    const rows = orderRowsOf(before);
    const ids = rows.map((r) => r.id);
    const gOf = new Map(rows.map((r) => [r.id, r.group]));
    const groupOfId = (id: string) => gOf.get(id) || "";
    const gap = gapOf(ids, groupOfId);
    // 옮길 줄 → 그룹이 바뀌는 줄 · 옮긴 뒤 전체 차례(서버 { order } 와 같은 셈)
    const plan = (moving: string[]) => {
      const order = placeBlock(ids, moving, gap);
      if (!order) return null;
      const re = new Set(group === undefined ? [] : moving.filter((id) => groupOfId(id) !== group));
      return { moving, re, order: nestParents(order.map((id) => ({ id, group: re.has(id) ? (group as string) : groupOfId(id) })), regParentOf).map((r) => r.id) };
    };
    const pick = new Set(block);
    const all = ids.filter((id) => pick.has(id));
    let want = all.length ? plan(all) : null;
    if (!want) {
      fetchRegItems();
      return fail("목록이 바뀌었습니다. 다시 불러온 뒤 옮겨 주세요.");
    }
    if (!want.re.size && sameIds(want.order, ids)) return toast("바뀐 순서가 없습니다.");
    const show = (w: NonNullable<typeof want>) =>
      setRegItems(reorderById(before.map((it) => (w.re.has(String(it._id)) ? { ...it, group } : it)), w.order));
    show(want);
    setSavingOrder("reg");
    const regrouped = want.re.size > 0;
    let skipN = 0;
    let d: ItemsPatch["d"] = null;
    let placed = false;
    if (regrouped) {
      const r1 = await patchItems({ batch: [...want.re].map((id) => ({ id, set: { group } })) });
      const skipped: Skip[] = Array.isArray(r1.d?.skipped) ? r1.d.skipped : [];
      if (!r1.ok || !(Number(r1.d?.updated) > 0)) {
        setSavingOrder("");
        setRegItems(before);
        fail(skipped[0]?.why || r1.d?.message || "그룹을 저장하지 못했습니다.");
        return;
      }
      d = r1.d;
      if (skipped.length) {
        const off = new Set(skipped.map((s) => String(s.id)));
        const rest = want.moving.filter((id) => !off.has(id));
        skipN = want.moving.length - rest.length;
        want = plan(rest) || want;
        show(want);
      }
      // 그룹 지정의 자리(새 덩어리 끝 · 빼면 옛 덩어리 바로 뒤)가 곧 놓은 자리면 순서는 이미 맞다
      placed = Array.isArray(d?.order) && sameIds(d.order.map(String), want.order);
    }
    if (!placed) {
      const res = await fetch("/api/admin/items", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: want.order }),
      }).catch(() => null);
      const d2 = await res?.json().catch(() => null);
      if (res?.ok && d2?.success) d = d2;
      else {
        setSavingOrder("");
        // 그룹은 이미 바뀌었다 — 실제 목록을 다시 받는다
        if (regrouped) fetchRegItems();
        else setRegItems(before);
        fail(d2?.message || "순서를 저장하지 못했습니다.");
        return;
      }
    }
    setSavingOrder("");
    if (Array.isArray(d?.order)) setRegItems((list) => reorderById(list, d.order.map(String)));
    if (Array.isArray(d?.groups)) setRegGroupSaved(d.groups.map(String));
    takeParents(d);
    const n = want.moving.length.toLocaleString();
    const msg = !regrouped ? `${n}개를 옮겼습니다.` : group ? `${n}개를 '${group}' 그룹으로 옮겼습니다.` : `${n}개를 그룹에서 뺐습니다.`;
    toast(skipN ? `${msg} ${skipN.toLocaleString()}개는 그룹을 바꿀 수 없어 그대로 두었습니다.` : msg);
    // 그룹이 바뀌면 다시 불러온다(초안 표시 등 — 그룹 지정과 같다). 순서만이면 초안 수만
    if (regrouped) fetchRegItems();
    else fetchDraft();
  };
  const saveRegMove = async (keys: string[], moved: string, block?: string[]) => {
    if (savingOrder || liveLocked) return;
    // 거른 표(한 그룹만 · 그룹 없음만)에서 고른 줄 덩어리째 — keys 는 덩어리를 모아 끼운 차례. 덩어리 바로 앞(없으면 바로 뒤) 보이는 줄 곁으로, 그룹은 그대로
    if (block && block.length > 1) {
      const pick = new Set(block);
      const s = keys.findIndex((k) => pick.has(k));
      let e = s;
      while (e + 1 < keys.length && pick.has(keys[e + 1])) e++;
      const prev = s > 0 ? keys[s - 1] : null;
      const next = s >= 0 && e + 1 < keys.length ? keys[e + 1] : null;
      return sendRegBlock(block, (ids) => {
        const p = prev ? ids.indexOf(prev) : next ? ids.indexOf(next) : -1;
        return p < 0 ? null : prev ? p + 1 : p;
      });
    }
    const at = keys.indexOf(moved);
    if (at < 0) return;
    const prevKey = at > 0 ? keys[at - 1] : null;
    const nextKey = at < keys.length - 1 ? keys[at + 1] : null;
    if (!prevKey && !nextKey) return;
    const groupOfId = new Map(orderRowsOf(regItems).map((r) => [r.id, r.group]));
    const move: RegMove =
      tableGroupOfKey(moved) == null && groupOfId.get(moved)
        ? { item: moved, ...(prevKey ? { after: prevKey } : { before: nextKey as string }) }
        : { unit: unitOfTableKey(moved), ...(prevKey ? { after: unitOfTableKey(prevKey) } : { before: unitOfTableKey(nextKey as string) }) };
    await sendRegMove(move, "순서를 저장했습니다.", false);
  };
  // 묶음 표에서 아이템 줄 하나를 놓았다(DataTable onRowDrop) — group 있음: 그 그룹 안(이웃 = 아이템 id, 둘 다 없으면 덩어리 끝) · "": 단위 사이(이웃 = 표 단위 키)
  //    고른 줄을 끌었으면(block) 고른 줄 모두를 그 자리 · 그 그룹으로(sendRegBlock)
  const saveRegDrop = async (drop: TableRowDrop) => {
    if (savingOrder || liveLocked) return;
    if (drop.block && drop.block.length > 1) return sendRegBlock(drop.block, (ids, groupOfId) => dropGapOf(ids, groupOfId, drop), drop.group);
    const id = drop.moved;
    const cur = regItems.find((it) => String(it._id) === id);
    if (!cur) return;
    const from = groupOfItem(cur);
    const g = drop.group;
    let move: RegMove;
    if (g) {
      const ref = drop.after ? { after: drop.after } : drop.before ? { before: drop.before } : {};
      if (g === from && !drop.after && !drop.before) return;
      move = g === from ? { item: id, ...ref } : { item: id, group: g, ...ref };
    } else {
      if (!drop.after && !drop.before) return;
      const ref = drop.after ? { after: unitOfTableKey(drop.after) } : { before: unitOfTableKey(drop.before as string) };
      move = from ? { item: id, group: "", ...ref } : { unit: itemUnitKey(id), ...ref };
    }
    const msg = g === from ? "순서를 저장했습니다." : !g ? "그룹에서 뺐습니다." : from ? `'${g}' 그룹으로 옮겼습니다.` : `'${g}' 그룹에 넣었습니다.`;
    await sendRegMove(move, msg, g !== from);
  };

  // ── 상품 순서(끌어서 바로 저장) ──
  //    끌어 놓은 줄들(거른 목록)의 새 순서를, 그 줄들이 전체 목록에서 차지하던 자리들에 차례로 다시 채운다 — 다른 줄은 제자리.
  //    화면 목록부터 맞추고(옛 순서가 한 번 비치지 않게) 전체 순서를 저장한다. 실패하면 되돌린다. (아이템 목록은 위 saveRegMove)
  const placeInOrder = (all: string[], moved: string[]) => {
    const pos = moved.map((k) => all.indexOf(k)).filter((p) => p >= 0).sort((x, y) => x - y);
    if (pos.length !== moved.length) return null;
    const next = all.slice();
    pos.forEach((p, i) => { next[p] = moved[i]; });
    return next;
  };
  const saveDragOrder = async (kind: "reg" | "product", moved: string[]) => {
    if (savingOrder || liveLocked) return;
    const before = kind === "reg" ? regItems : items;
    const next = placeInOrder(before.map((it) => String(it._id)), moved);
    if (!next) return;
    const at = new Map(next.map((k, i) => [k, i]));
    const sorted = [...before].sort((x, y) => (at.get(String(x._id)) ?? 1e9) - (at.get(String(y._id)) ?? 1e9)).map((it) => ({ ...it, sortOrder: at.get(String(it._id)) ?? it.sortOrder }));
    const setList = kind === "reg" ? setRegItems : setItems;
    setList(sorted);
    setSavingOrder(kind);
    const res = await fetch(kind === "reg" ? "/api/admin/items" : "/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder("");
    if (res?.ok && d?.success) { toast("순서를 저장했습니다."); fetchDraft(); }
    else {
      setList(before);
      fail(d?.message || "순서를 저장하지 못했습니다.");
    }
  };

  // ── 배너 순서(끌어서 바로 저장 — 위치 탭 안에서) ──
  //    끌어 놓은 줄들(거른 목록)의 새 차례를 그 줄들이 그 위치 전체 차례에서 차지하던 자리에 다시 채운다(다른 줄은 제자리 — 상품 순서와 같은 셈).
  //    화면부터 맞추고 그 위치의 전체 차례를 저장한다(PATCH /api/shop/banners { order, placement }). 실패하면 되돌린다
  const saveBannerOrder = async (moved: string[]) => {
    if (savingOrder || liveLocked) return;
    // 지운 테마 칸은 순서가 없다(어디에도 안 뜬다 — 끌기를 잠가 둔다)
    const place = placeNow;
    if (place === GONE_PLACE) return;
    const all = bannersAt(place).map((b) => String(b._id));
    const next = placeInOrder(all, moved);
    if (!next) return;
    const before = banners;
    const at = new Map(next.map((k, i) => [k, i]));
    // 그 위치 배너만 새 차례로(다른 위치 배너는 제자리) — 화면 목록은 위치마다 거르므로 그 위치 안 차례만 맞으면 된다
    const slots = banners.map((b, i) => (at.has(String(b._id)) ? i : -1)).filter((i) => i >= 0);
    const placed = [...banners];
    const sortedPlace = slots.map((i) => banners[i]).sort((x, y) => (at.get(String(x._id)) ?? 0) - (at.get(String(y._id)) ?? 0));
    slots.forEach((i, k) => { placed[i] = { ...sortedPlace[k], sortOrder: at.get(String(sortedPlace[k]._id)) ?? sortedPlace[k].sortOrder }; });
    setBanners(placed);
    setSavingOrder("banner");
    const res = await fetch("/api/shop/banners", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next, placement: place }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder("");
    if (res?.ok && d?.success) { toast("순서를 저장했습니다."); fetchDraft(); }
    else {
      setBanners(before);
      fail(d?.message || "순서를 저장하지 못했습니다.");
    }
  };

  // ── 상품 순서(B안 — 아이템 그룹 머리줄로 묶은 표) ──
  //    머리줄 끌기(단위 칸 "") = 그 그룹 상품 덩어리째 · 상품 줄 끌기(그룹 칸 "g:<이름>") = 그 그룹 안에서만(그룹은 아이템에서 정한다).
  //    끈 줄들을 상품 id 차례로 펴서 지금 전체 차례의 그 자리들에 다시 채우고(placeInOrder — 거른 목록이어도 제자리), 서버가 묶음 규칙으로 맞춘 순서(order)로 마무리한다
  const productsInGroup = (rows: any[], g: string) => rows.filter((p) => productGroupOf(p, prodIdx) === g).map((p) => String(p._id));
  //    머리줄은 거른 목록이어도 그 그룹 상품 전부를 옮긴다(숨은 상품이 옛 자리에 남으면 서버가 그룹을 그쪽으로 되끌어 와 아무 일도 안 일어난다).
  //    pin = 끈 그룹(상위 안 그룹 하나를 밖으로 끌면 상위 전체가 딸려가지 않고 형제 곁으로 — 아이템 표와 같다)
  const saveProductMove = async (keys: string[], seg: string, movedKey: string) => {
    if (savingOrder || liveLocked) return;
    const moved = seg.startsWith("g:") ? keys : keys.flatMap((k) => { const g = tableGroupOfKey(k); return g != null ? productsInGroup(items, g) : [k]; });
    const pin = seg.startsWith("g:") ? "" : (tableGroupOfKey(movedKey) ?? "");
    const before = items;
    const beforeIds = before.map((it) => String(it._id));
    const next = placeInOrder(beforeIds, moved);
    if (!next) return;
    setItems(reorderById(before, next));
    setSavingOrder("product");
    const res = await fetch("/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next, pin }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder("");
    if (res?.ok && d?.success) {
      const fin: string[] = Array.isArray(d.order) ? d.order.map(String) : next;
      setItems((list) => reorderById(list, fin));
      // 규칙(같은 그룹은 붙어 있다)으로 맞추니 제자리면 — 저장했다고 하지 않는다
      toast(fin.length === beforeIds.length && fin.every((id, i) => id === beforeIds[i]) ? "바뀐 순서가 없습니다." : "순서를 저장했습니다.");
      fetchDraft();
    } else {
      setItems(before);
      fail(d?.message || "순서를 저장하지 못했습니다.");
    }
  };
  // 📌 상품 줄 하나를 놓았다(DataTable onRowDrop — 2026-10-17 시안 B ①) — group 있음: 그 그룹 안(이웃 = 상품 id, 둘 다 없으면 덩어리 끝) · "": 그룹 밖 단위 사이(이웃 = 표 단위 키).
  //    다른 그룹(· 밖)에 놓으면 연결 아이템의 그룹을 바꾼다 — 아이템 일괄 「그룹」과 같은 길(PATCH /api/admin/items batch · 아이템 탭에서도 옮겨지고 그 아이템의 다른 상품도 같이).
  //    그 뒤 놓은 자리로 상품 순서를 저장한다(서버가 묶음 규칙으로 맞춘다) · 두 목록을 다시 받는다. 같은 그룹 안 · 밖 단위 사이는 순서만.
  //    세트 · 직접 설정 상품은 그룹을 바꾸지 않는다(productRegroupBlock — 짧은 알림). 화면부터 맞추고 실패하면 되돌린다
  //    고른 상품 줄을 끌었으면(block) 고른 상품 모두를 그 자리 · 그 그룹으로(saveProductBlock)
  const saveProductDrop = async (drop: TableRowDrop) => {
    if (savingOrder || liveLocked) return;
    if (drop.block && drop.block.length > 1) return saveProductBlock(drop, drop.block);
    const id = drop.moved;
    const cur = items.find((it) => String(it._id) === id);
    if (!cur) return;
    const from = productGroupOf(cur, prodIdx);
    const g = drop.group;
    const regroup = g !== from;
    const anchor = anchorItemOf(cur);
    if (regroup) {
      const why = productRegroupBlock(cur, new Set(regItems.map((it) => String(it._id))));
      if (why) { toast(why, true); return; }
    }
    // 놓은 자리 — 전체 상품 차례 안. 이웃이 그룹 머리줄(표 단위 키)이면 그 그룹 상품 덩어리 앞 · 뒤
    const rest = items.filter((it) => String(it._id) !== id);
    const restIds = rest.map((it) => String(it._id));
    const groupAt = (gg: string, last: boolean) => {
      const hits = rest.map((it, i) => (productGroupOf(it, prodIdx) === gg ? i : -1)).filter((i) => i >= 0);
      return hits.length ? hits[last ? hits.length - 1 : 0] : -1;
    };
    const posOf = (key: string, last: boolean) => {
      const gg = tableGroupOfKey(key);
      return gg != null ? groupAt(gg, last) : restIds.indexOf(key);
    };
    let at: number;
    if (drop.after) { const p = posOf(drop.after, true); if (p < 0) return; at = p + 1; }
    else if (drop.before) { const p = posOf(drop.before, false); if (p < 0) return; at = p; }
    else if (g) { const p = groupAt(g, true); at = p < 0 ? restIds.length : p + 1; }
    else return;
    const next = [...restIds];
    next.splice(Math.min(at, next.length), 0, id);
    const beforeItems = items;
    const beforeReg = regItems;
    setItems(reorderById(beforeItems, next));
    if (regroup) setRegItems((list) => list.map((x) => (String(x._id) === anchor ? { ...x, group: g } : x)));
    setSavingOrder("product");
    if (regroup) {
      const { ok, d } = await patchItems({ batch: [{ id: anchor, set: { group: g } }] });
      const skipped: { why?: string }[] = Array.isArray(d?.skipped) ? d.skipped : [];
      if (!ok || !(Number(d?.updated) > 0)) {
        setSavingOrder("");
        setItems(beforeItems);
        setRegItems(beforeReg);
        fail(skipped[0]?.why || d?.message || "그룹을 저장하지 못했습니다.");
        return;
      }
      if (Array.isArray(d.order)) setRegItems((list) => reorderById(list, d.order.map(String)));
      if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
      takeParents(d);
      if (g) openProductGroupNamed(g);
    }
    const res = await fetch("/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next }),
    }).catch(() => null);
    const d2 = await res?.json().catch(() => null);
    setSavingOrder("");
    if (res?.ok && d2?.success) {
      if (Array.isArray(d2.order)) setItems((list) => reorderById(list, d2.order.map(String)));
      toast(!regroup ? "순서를 저장했습니다." : g ? `'${g}' 그룹으로 옮겼습니다.` : "그룹에서 뺐습니다.");
    } else if (!regroup) {
      setItems(beforeItems);
      fail(d2?.message || "순서를 저장하지 못했습니다.");
    } else {
      // 그룹은 바뀌었다 — 순서만 못 맞췄으면 다시 받은 목록(서버가 묶음 규칙으로 맞춘 차례)으로
      toast(g ? `'${g}' 그룹으로 옮겼습니다.` : "그룹에서 뺐습니다.");
    }
    if (regroup) { fetchRegItems(); fetchAll(); }
    else fetchDraft();
  };
  // 📌 체크한 상품 덩어리(2026-10-18) — 고른 상품 모두(목록 차례 그대로)를 놓은 자리에 한 덩어리로(placeBlock).
  //    다른 그룹(· 밖)에 놓으면 연결 아이템들의 그룹을 한 번에 바꾼다(아이템 일괄 「그룹」 batch 한 번 — 단일 놓기와 같은 길 · 그 아이템의 다른 상품도 같이).
  //    그룹을 못 바꾸는 상품(직접 설정 · 세트 — productRegroupBlock. 세트는 첫 구성 아이템이 같이 옮겨지면 따라간다)은 제자리에 두고 한 줄로 알린다.
  //    그 뒤 놓은 자리로 상품 순서를 한 번에 저장(서버가 묶음 규칙으로 맞춘다). 화면부터 서버와 같은 셈으로 맞추고, 실패하면 되돌린다
  const saveProductBlock = async (drop: TableRowDrop, block: string[]) => {
    const g = drop.group;
    const beforeItems = items;
    const beforeReg = regItems;
    const ids = beforeItems.map((it) => String(it._id));
    const byId = new Map(beforeItems.map((it) => [String(it._id), it]));
    const groupOfId = (id: string) => productGroupOf(byId.get(id), prodIdx);
    const itemIds = new Set(beforeReg.map((it) => String(it._id)));
    const pick = new Set(block);
    const all = ids.filter((id) => pick.has(id));
    // 그룹을 바꿀 연결 아이템 — 그룹이 달라지는 상품 중 바꿀 수 있는 것의 연결 아이템
    let anchors = new Set(all.filter((id) => groupOfId(id) !== g && !productRegroupBlock(byId.get(id), itemIds)).map((id) => anchorItemOf(byId.get(id))));
    // 옮길 상품 — 이미 그 그룹인 것 + 연결 아이템이 옮겨지는 것(세트도 첫 구성 아이템이 들면 따라간다)
    const movingOf = (an: ReadonlySet<string>) => all.filter((id) => groupOfId(id) === g || an.has(anchorItemOf(byId.get(id))));
    const gap = dropGapOf(ids, groupOfId, drop);
    // 옮긴 뒤 전체 차례 — 연결 아이템을 옮긴 상품은 새 그룹으로 서버와 같은 셈(묶음 · 상위 규칙)
    const orderOf = (mv: string[], an: ReadonlySet<string>) => {
      const order = placeBlock(ids, mv, gap);
      if (!order) return null;
      const idx = itemIndexOf(beforeReg.map((x) => ({ id: String(x._id), group: an.has(String(x._id)) ? g : groupOfItem(x) })));
      return normalizeProductOrder(productRowsOf(order.map((id) => byId.get(id)), idx), regParentOf).map((r) => r.id);
    };
    let moving = movingOf(anchors);
    const stuckMsg = (n: number) => `${n.toLocaleString()}개는 그룹을 바꿀 수 없어 그대로 두었습니다.`;
    if (!moving.length) return toast(stuckMsg(all.length), true);
    let next = orderOf(moving, anchors);
    if (!next) {
      fetchAll();
      return fail("목록이 바뀌었습니다. 다시 불러온 뒤 옮겨 주세요.");
    }
    if (!anchors.size && sameIds(next, ids)) return moving.length < all.length ? toast(stuckMsg(all.length - moving.length), true) : toast("바뀐 순서가 없습니다.");
    const show = (nx: string[], an: ReadonlySet<string>) => {
      setItems(reorderById(beforeItems, nx));
      setRegItems(an.size ? beforeReg.map((x) => (an.has(String(x._id)) ? { ...x, group: g } : x)) : beforeReg);
    };
    show(next, anchors);
    setSavingOrder("product");
    const regrouped = anchors.size > 0;
    if (regrouped) {
      const { ok, d } = await patchItems({ batch: [...anchors].map((id) => ({ id, set: { group: g } })) });
      const skipped: Skip[] = Array.isArray(d?.skipped) ? d.skipped : [];
      if (!ok || !(Number(d?.updated) > 0)) {
        setSavingOrder("");
        setItems(beforeItems);
        setRegItems(beforeReg);
        fail(skipped[0]?.why || d?.message || "그룹을 저장하지 못했습니다.");
        return;
      }
      // 그룹을 못 바꾼 연결 아이템(서버 검사)의 상품은 제자리 — 나머지만 다시 센다
      if (skipped.length) {
        const off = new Set(skipped.map((s) => String(s.id)));
        anchors = new Set([...anchors].filter((a) => !off.has(a)));
        moving = movingOf(anchors);
        next = orderOf(moving, anchors) || next;
        show(next, anchors);
      }
      if (Array.isArray(d.order)) setRegItems((list) => reorderById(list, d.order.map(String)));
      if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
      takeParents(d);
      if (g) openProductGroupNamed(g);
    }
    const res = await fetch("/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next }),
    }).catch(() => null);
    const d2 = await res?.json().catch(() => null);
    setSavingOrder("");
    const n = moving.length.toLocaleString();
    const msg = !regrouped ? `${n}개를 옮겼습니다.` : g ? `${n}개를 '${g}' 그룹으로 옮겼습니다.` : `${n}개를 그룹에서 뺐습니다.`;
    const done = moving.length < all.length ? `${msg} ${stuckMsg(all.length - moving.length)}` : msg;
    if (res?.ok && d2?.success) {
      if (Array.isArray(d2.order)) setItems((list) => reorderById(list, d2.order.map(String)));
      toast(done);
    } else if (!regrouped) {
      setItems(beforeItems);
      fail(d2?.message || "순서를 저장하지 못했습니다.");
    } else {
      // 그룹은 바뀌었다 — 순서만 못 맞췄으면 다시 받은 목록(서버가 묶음 규칙으로 맞춘 차례)으로(단일 놓기와 같다)
      toast(done);
    }
    if (regrouped) { fetchRegItems(); fetchAll(); }
    else fetchDraft();
  };
  // 「아이템 순서대로」 — 연결 상품은 아이템 순서, 세트는 첫 구성 아이템 상품 바로 뒤, 아이템 없는 상품은 맨 뒤(한 번 묻는다)
  const syncProductsToItems = async () => {
    if (savingOrder || liveLocked) return;
    setSavingOrder("product");
    const res = await fetch("/api/shop/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncItems: true }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingOrder("");
    setSyncAsk(false);
    if (res?.ok && d?.success) {
      if (Array.isArray(d.order)) setItems((list) => reorderById(list, d.order.map(String)));
      toast(Number(d.moved) > 0 ? `아이템 순서대로 — ${Number(d.moved).toLocaleString()}개 자리를 바꿨습니다.` : "이미 아이템 순서대로입니다.");
      fetchDraft();
    } else fail(d?.message || "순서를 저장하지 못했습니다.");
  };
  // 상품 묶음 펼침 · 접음 — 이 브라우저에 기억(아이템 목록과 같다)
  const toggleProductGroup = (g: string) => { sfxTick(); setOpenProductGroupList((l) => { const a = Array.isArray(l) ? l : []; return a.includes(g) ? a.filter((x) => x !== g) : [...a, g]; }); };
  const toggleProductSection = (p: string) => { sfxTick(); setClosedProductSectionList((l) => { const a = Array.isArray(l) ? l : []; return a.includes(p) ? a.filter((x) => x !== p) : [...a, p]; }); };

  // ── 아이템 그룹 — 펼침 · 접음은 이 브라우저에 기억(useStoredState) ──
  const toggleGroup = (g: string) => { sfxTick(); setOpenGroupList((l) => { const a = Array.isArray(l) ? l : []; return a.includes(g) ? a.filter((x) => x !== g) : [...a, g]; }); };
  const toggleSection = (p: string) => { sfxTick(); setClosedSectionList((l) => { const a = Array.isArray(l) ? l : []; return a.includes(p) ? a.filter((x) => x !== p) : [...a, p]; }); };
  // 저장된 펼침 목록 안 이름 바꾸기 · 빼기(그룹 · 상위 이름 바꾸기 · 삭제 뒤)
  const renameIn = (l: string[], from: string, to: string) => {
    const a = Array.isArray(l) ? l : [];
    if (!a.includes(from)) return a;
    const rest = a.filter((x) => x !== from);
    return to && !rest.includes(to) ? [...rest, to] : rest;
  };
  // 그룹 관리 창이 끌어 놓자마자 — 그룹 차례와 목록 순서(덩어리를 그 자리들 안에서 바꿔 끼움)를 함께. 실패하면 옛 차례로 다시 부른다(같은 계산이라 제자리로 돌아온다)
  //    상위가 있으면 맨 윗단위(상위 덩어리 · 상위 없는 그룹)끼리만 바꿔 끼운다(서버와 같은 orderGroupsNested — 그룹 없는 아이템은 제자리).
  //    돌려주는 것 = 되돌리기(저장이 실패하면 끌기 전 목록 · 차례 그대로 — 같은 계산을 옛 차례로 다시 하면 제자리로 안 돌아오는 때가 있었다)
  const localGroupOrder = (names: string[]) => {
    const prevItems = regItems;
    const prevSaved = regGroupSaved;
    setRegGroupSaved(names);
    setRegItems((list) => reorderById(list, orderGroupsNested(orderRowsOf(list), names, regParentOf).map((r) => r.id)));
    return () => { setRegItems(prevItems); setRegGroupSaved(prevSaved); };
  };
  // 상위 차례도 끌어 놓자마자 — 상위 차례와 목록 순서(상위 덩어리를 그 자리들 안에서 바꿔 끼움)를 함께
  const localParentOrder = (names: string[]) => {
    const prevItems = regItems;
    const prevParents = regParents;
    setRegParents(names);
    setRegItems((list) => reorderById(list, orderParentBlocks(orderRowsOf(list), names, regParentOf).map((r) => r.id)));
    return () => { setRegItems(prevItems); setRegParents(prevParents); };
  };
  // 그룹 관리 창이 저장한 뒤 — 새 차례(· 차례 바꾸기는 서버가 쓴 순서)를 받고, 이름 바꾸기 · 삭제는 화면 목록부터 맞춘 뒤 다시 불러온다(펼침 · 거르기도 새 이름으로)
  //    상위 그룹 · 자동 정렬도 같은 길 — 순서를 바꾸는 것(차례 · 상위 차례 · 상위 고르기 · 자동 정렬)은 서버가 쓴 순서로 맞추고 다시 읽지 않는다
  // 쌓인 아이템 폼의 그룹도 새 이름으로(이름 바꾸기 · 삭제 — 전체 수정)
  const regroupStacked = (from: string, to: string) => setStacked((p) => {
    const hit = Object.entries(p.reg).filter(([, f]) => normalizeItemGroup(f.group) === from);
    return hit.length ? { ...p, reg: { ...p.reg, ...Object.fromEntries(hit.map(([id, f]) => [id, { ...f, group: to }])) } } : p;
  });
  const onGroupSaved = (groups: string[] | null, c: GroupChange, order: string[] | null, d?: any) => {
    if (groups) setRegGroupSaved(groups);
    takeParents(d);
    const reordering = c.op === "order" || c.op === "parentOrder" || c.op === "setParent" || c.op === "autoSort";
    if (reordering && order) setRegItems((list) => reorderById(list, order));
    if (c.op === "parentRename" && c.from && c.to) {
      const { from, to } = c;
      setClosedSectionList((l) => renameIn(l, from, to));
      setRegGroup((v) => (v === `p:${from}` ? `p:${to}` : v));
    }
    if (c.op === "parentDelete" && c.name) {
      const name = c.name;
      setClosedSectionList((l) => renameIn(l, name, ""));
      setRegGroup((v) => (v === `p:${name}` ? GROUP_ALL : v));
    }
    if (c.op === "rename" && c.from && c.to) {
      const { from, to } = c;
      setRegItems((list) => list.map((it) => (groupOfItem(it) === from ? { ...it, group: to } : it)));
      setOpenGroupList((l) => renameIn(l, from, to));
      setRegGroup((v) => (v === `g:${from}` ? `g:${to}` : v));
      setItemForm((f) => (normalizeItemGroup(f.group) === from ? { ...f, group: to } : f));
      regroupStacked(from, to);
    }
    if (c.op === "delete" && c.name) {
      const name = c.name;
      setRegItems((list) => list.map((it) => (groupOfItem(it) === name ? { ...it, group: "" } : it)));
      setRegGroup((v) => (v === `g:${name}` ? GROUP_ALL : v));
      setItemForm((f) => (normalizeItemGroup(f.group) === name ? { ...f, group: "" } : f));
      regroupStacked(name, "");
    }
    // 순서 · 상위만 바꾼 것은 목록을 다시 읽지 않는다(화면이 이미 그 순서) — 초안 수만 다시. 그룹 이름 · 삭제는 아이템이 바뀌어 다시 읽는다
    if (c.op === "create" || c.op === "rename" || c.op === "delete") fetchRegItems();
    else fetchDraft();
  };

  // ── 상품 초안 처리 — 반영 · 버리기 · 한 건 되돌리기(POST /api/admin/catalog-draft). 끝나면 목록 · 초안 요약을 다시 읽는다 ──
  const postDraft = async (body: Record<string, string>) => {
    const res = await fetch("/api/admin/catalog-draft", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    return { ok: !!(res?.ok && d?.success), d };
  };
  // fetchRegItems · fetchAll 이 초안 요약도 함께 다시 읽는다
  //    종류별 효과 문구도 다시 읽는다(반영 · 버리기 · 되돌리기 뒤 — 초안 틀이 사라졌을 수 있다)
  const reloadCatalog = () => { fetchRegItems(); fetchAll(); fxTpl.reload(); };
  // 아이템 · 상품 · 배너 상세 칸에 열린 줄(kind · id)
  const paneRowOf = (): { kind: string; id: string } | null =>
    pane === "reg" ? { kind: "item", id: String(itemForm.id || "") }
    : pane === "product" ? { kind: "shopItem", id: String(form.id || "") }
    : pane === "banner" ? { kind: "banner", id: String(bannerForm.id || "") }
    : null;
  const openPublish = () => { if (!draft.total || draftBusy) return; fetchDraft(); setDraftAsk("publish"); };
  const publishDraft = async () => {
    if (draftBusy) return;
    setDraftBusy("publish");
    const { ok, d } = await postDraft({ action: "publish" });
    setDraftBusy("");
    setDraftAsk("");
    reloadCatalog();
    if (!ok) return fail(d?.message || "반영하지 못했습니다.");
    const skipped: DraftWarn[] = Array.isArray(d.skipped) ? d.skipped : [];
    const hidden: { name?: string }[] = Array.isArray(d.hidden) ? d.hidden : [];
    // 건너뛴 것은 초안으로 남는다(머리 개수 · 반영 창 목록에 그대로). 구매 이력이 있는 상품 삭제는 숨김으로 반영된다(운영자 결정 4)
    //    알림 창이 같이 뜨면 효과음은 그 창 것 하나(토스트는 소리 없이)
    const listed = skipped.length > 0 || hidden.length > 0;
    if (Number(d.applied) > 0 || !skipped.length) toast("실사이트에 반영했습니다.", false, listed ? { sound: false } : undefined);
    if (listed) {
      notify([
        ...(skipped.length ? [`건너뜀 ${skipped.length}건`, ...skipped.map((s) => `${s.name} — ${s.why}`)] : []),
        ...(skipped.length && hidden.length ? [""] : []),
        ...(hidden.length ? [`숨김 ${hidden.length}건`, ...hidden.map((h) => `${h.name || "이름 없음"} — 구매 이력`)] : []),
      ].join("\n"), skipped.length > 0);
    }
  };
  const discardDraft = async () => {
    if (draftBusy) return;
    setDraftBusy("discard");
    const { ok, d } = await postDraft({ action: "discard" });
    setDraftBusy("");
    setDraftAsk("");
    reloadCatalog();
    if (!ok) return fail(d?.message || "초안을 버리지 못했습니다.");
    // 새로 만든 초안(목록에서 사라진다)에 쌓인 고친 것은 뺀다 — 고친 줄의 나머지 칸은 목록을 다시 읽으면 실사이트 값으로 옮겨진다(전체 수정)
    const goneIds = (rows: AnyRow[]) => rows.filter((x) => x._draft === "new").map((x) => String(x._id));
    dropStacked("reg", goneIds(regItems));
    dropStacked("product", goneIds(items));
    dropStacked("banner", goneIds(banners));
    // 아이템 · 상품 · 배너 상세 칸의 값은 버린 초안일 수 있다 — 폼을 비우고 닫는다
    if (paneRowOf()) {
      if (pane === "reg") setItemForm(EMPTY_ITEM_FORM);
      if (pane === "product") { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
      if (pane === "banner") setBannerForm(EMPTY_BANNER);
      closePane();
    }
    toast("초안을 버렸습니다.");
  };
  const revertDraft = async () => {
    const t = revertAsk;
    if (!t || draftBusy) return;
    setDraftBusy("revert");
    const { ok, d } = await postDraft({ action: "revert", kind: t.kind, id: t.id });
    setDraftBusy("");
    setRevertAsk(null);
    reloadCatalog();
    if (!ok) return fail(d?.message || "초안을 되돌리지 못했습니다.");
    // 그 줄에 쌓인 고친 것도 뺀다(되돌리기 전 초안 위에서 고친 값 — 열린 칸과 같다 · 전체 수정)
    const stackKind = ({ item: "reg", shopItem: "product", banner: "banner" } as Record<string, EditKind>)[t.kind];
    if (stackKind) dropStacked(stackKind, [t.id]);
    // 그 줄의 상세 칸이 열려 있으면 폼을 비우고 닫는다 — 폼에 든 값은 되돌리기 전 초안이다
    const open = paneRowOf();
    if (open && open.kind === t.kind && open.id === t.id) {
      if (pane === "reg") setItemForm(EMPTY_ITEM_FORM);
      if (pane === "product") { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
      if (pane === "banner") setBannerForm(EMPTY_BANNER);
      closePane();
    }
    toast("초안을 되돌렸습니다.");
  };
  // 목록 줄 → 되돌릴 초안(_draft: "new" 추가 · "edit" 수정)
  const askRevertRow = (kind: "item" | "shopItem" | "banner", row: any, name: string) =>
    setRevertAsk({ kind, id: String(row._id), op: row._draft === "new" ? "add" : "edit", name });

  // ⚠️ 훅을 모두 부른 뒤에 가린다. 이건 화면을 가리는 장치일 뿐이고 실제 방어는 서버(API)에서 한다.
  if (gate) return gate;

  // 📌 주문은 묶음(orderId + 상품 — lib/orderGroups.js)으로 센다 · 보인다. 1개 단위 상품 3개를 한 번에 샀으면 한 줄 "×3"
  //    탭 줄 빨간 숫자(처리 대기)는 기간 · 유형과 상관없이 전부. 상태 알약 숫자 · 목록은 고른 기간 · 상품 유형 안에서(불러온 주문 안 — 더 오래된 주문은 「더 보기」)
  const pendingCount = groupOrderRows(orders.filter((o) => o.status === "pending")).length;
  const periodFrom = orderPeriod.v === "custom" ? dayStart(orderFrom) : orderPeriod.v === "all" ? NaN : orderPeriod.from;
  const periodTo = orderPeriod.v === "custom" && orderTo ? dayStart(orderTo) + 86400e3 : NaN;
  const orderInView = (o: AnyRow) => {
    const t = new Date(o?.createdAt || 0).getTime();
    return (!Number.isFinite(periodFrom) || t >= periodFrom) && (!Number.isFinite(periodTo) || t < periodTo) && (!orderTypes.length || orderTypes.includes(orderTypeOf(o)));
  };
  const viewOrders = orders.filter(orderInView);
  const groupCount = (s: string) => groupOrderRows(viewOrders.filter((o) => o.status === s)).length;
  const shownOrdersByStatus = groupOrderRows(orderFilter ? viewOrders.filter((o) => o.status === orderFilter) : viewOrders);

  const discountPct = Math.min(100, Math.max(0, Number(form.discountPct) || 0));
  // 입력칸 단위 그대로(빙옥 전용이면 빙옥 — XP 로 할인한 뒤 올림, 상점 · 결제와 같은 계산)
  const salePreview = formSalePrice(form, form.price, discountPct);
  const unit = formUnit(form);
  // 세트 — 구성 몸값 합(XP) · 판매가를 XP 로 바꿔 몇 % 싼지(내림 — 실제보다 크게 적지 않게)
  const bundleSum = bundleValueSum(form);
  const bundleSaleXp = form.pointOnly ? pointToXp(salePreview) : salePreview;
  const bundlePct = bundleOn && bundleSum > 0 && bundleSaleXp > 0 && bundleSaleXp < bundleSum ? Math.floor((1 - bundleSaleXp / bundleSum) * 100) : 0;
  // 카드 미리보기의 구성(GET /api/shop/items 의 bundleItems 와 같은 모양) — 상점 카드가 구성을 그릴 때 폼 값 그대로 따라가게
  const previewBundleItems = bundleOn
    ? form.bundle.map((r) => {
        const x = regItems.find((it) => String(it._id) === r.itemId);
        return {
          itemId: r.itemId, days: r.timed ? Math.floor(Number(r.days) || 0) : 0, qty: r.timed || qtyLockedOf(regItems, items, r.itemId) ? 1 : Math.max(1, Math.floor(Number(r.qty) || 1)), value: Math.floor(Number(r.value) || 0),
          name: x?.name || "", icon: x?.icon || "", imageUrl: x?.imageUrl || "", color: x?.color || "", type: x?.type || "", hasRole: !!String(x?.roleId || "").trim(), consumable: x ? hasConsumable(x) || !!x.stackable : false,
          // 📌 구성 아이콘 고르기도 상점 카드와 같게(아래 「구성」 미리보기와 같은 값)
          ...cosmeticKeysProp(x),
        };
      })
    : undefined;

  // ── 목록 거르기 ──
  const qq = q.trim().toLowerCase();
  const hit = (...vals: any[]) => !qq || vals.some((v) => String(v ?? "").toLowerCase().includes(qq));
  const roleNameOf = (id: string, fallback?: string) => guildRoles.find((r) => r.id === id)?.name || fallback || id;

  // 📌 그룹 — 목록의 덩어리 차례(= 그룹 관리 창 차례) + 빈 그룹(저장된 차례로 뒤에). 서버 GET groups 와 같은 계산(lib/itemOrder.js groupList).
  //    거르던 그룹이 없어지면(삭제) 전체로 돌아간다
  const regGroups = groupList(orderRowsOf(regItems), regGroupSaved);
  const regGroupCount = new Map<string, number>();
  for (const it of regItems) { const g = groupOfItem(it); if (g) regGroupCount.set(g, (regGroupCount.get(g) || 0) + 1); }
  // 상위 그룹 — 차례는 목록 덩어리 차례(서버와 같은 lib/itemOrder.js parentList — 저장된 차례만 믿으면 끌기 뒤 목록과 어긋났다) · 그 그룹의 상위("" = 없음) · 상위마다 든 그룹 수
  const shownParents = parentList(orderRowsOf(regItems), regParentOf, regParents);
  const parentOfGroup = (g: string) => (g && Object.prototype.hasOwnProperty.call(regParentOf, g) && shownParents.includes(regParentOf[g]) ? regParentOf[g] : "");
  const regParentCount = new Map<string, number>();
  for (const g of regGroups) { const p = parentOfGroup(g); if (p) regParentCount.set(p, (regParentCount.get(p) || 0) + 1); }
  const regGroupV = regGroup === GROUP_ALL || regGroup === GROUP_NONE
    || (regGroup.startsWith("g:") && regGroups.includes(regGroup.slice(2)))
    || (regGroup.startsWith("p:") && shownParents.includes(regGroup.slice(2))) ? regGroup : GROUP_ALL;
  const groupHit = (it: { group?: unknown }) => regGroupV === GROUP_ALL
    || (regGroupV === GROUP_NONE ? !groupOfItem(it)
      : regGroupV.startsWith("p:") ? parentOfGroup(groupOfItem(it)) === regGroupV.slice(2)
      : groupOfItem(it) === regGroupV.slice(2));
  const shownReg = regItems.filter((it) => (!regType || it.type === regType) && groupHit(it) && passItemFilters(it, regFilters)
    && hit(it.name, categoryOfRow(it), it.description, it.roleId ? roleNameOf(it.roleId, it.roleName) : "", groupOfItem(it), parentOfGroup(groupOfItem(it))));
  // 그룹 머리줄로 묶어 보이는 때 — 전체 보기 · 상위 하나 거르기(그 상위의 그룹들을 머리줄로). 머리줄 고르기 칸 = 그 그룹 통째로. 한 그룹만 거르면 머리줄 없이 그 줄들
  const regGrouped = regGroupV === GROUP_ALL || regGroupV.startsWith("p:");
  // 그룹 거르기 — 단추 하나(폭 고정). 그룹이 늘어도 줄이 자라지 않는다
  const regGroupOptions: DropdownOption[] = [
    { value: GROUP_ALL, label: "모든 그룹", hint: String(regItems.length) },
    { value: GROUP_NONE, label: "그룹 없음", hint: String(regItems.filter((i) => !groupOfItem(i)).length) },
    // 상위 그룹 — 고르면 그 상위의 그룹들(개수 = 든 그룹 수)
    ...shownParents.map((p) => ({ value: `p:${p}`, label: p, hint: `그룹 ${regParentCount.get(p) || 0}`, icon: <FolderStackMark /> })),
    ...regGroups.map((g) => ({ value: `g:${g}`, label: g, hint: String(regGroupCount.get(g) || 0), icon: <FolderMark /> })),
  ];
  // 꾸미기 효과에 맞는 아이콘 — 아이콘 고르기 판이 먼저 보여 준다
  const regArtSuggest = [...new Set(itemForm.effects.flatMap((d) => (d.on === "cardScene" && d.scene ? [artOfScene(d.scene)] : d.on === "cardSkin" && d.skin ? [artOfSkin(d.skin)] : d.on === "avatarFrame" && d.frame ? [artOfFrame(d.frame)] : [])))];
  // 상품 묶음 — 아이템 순서 · 그룹 표(상품 그룹 = 연결 아이템 그룹, 세트는 첫 구성 아이템 그룹)
  const prodIdx = itemIndexOf(regItems.map((it) => ({ id: String(it._id), group: groupOfItem(it) })));
  // 유형 ▾ — 역할 · 권한 · 아이템 · 꾸미기 · 기프트카드 · 세트(개수). 판매 상태는 거르기 판 칸(칩 수는 전체 상품 기준)
  const typeProducts = productType ? items.filter((it) => it.type === productType) : items;
  // 📌 상품 목록 — 유형 · 판매 상태(판매 중 · 판매 종료 · 숨김 — 줄 표시와 같은 셈) · 거르기 · 검색(아이템 그룹 이름까지)
  const themeKeys = new Set(themes.map((t) => t.key));
  const shownProducts = typeProducts.filter((it) => (!productView || prodStatusOf(it) === productView) && passProdFilters(it, prodFilters, themeKeys)
    && hit(it.name, categoryOfRow(it), it.description, it.roleName, typeLabel(it.type), themeNameOf(themes, it.theme), productGroupOf(it, prodIdx)));
  const productTypeOptions = [
    { v: "", l: "전체", n: items.length },
    ...ITEM_TYPE_OPTIONS.map((o) => ({ v: o.v, l: o.l, n: items.filter((it) => it.type === o.v).length })),
    { v: BUNDLE_TYPE, l: "세트", n: items.filter((it) => it.type === BUNDLE_TYPE).length },
  ];
  // 배너 — 고른 위치(값이 없는 옛 배너는 홈 — bannerPlaceOf)만, 실제 노출 차례(서버 sortOrder → 최근 등록) 그대로
  const placeBanners = bannersAt(placeNow);
  const shownBanners = placeBanners.filter((b) => (!bannerView || (bannerView === "on" ? !!b.active : !b.active)) && hit(b.title, b.subtitle, b.link));
  const couponState = (c: any) => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const exhausted = c.maxUses > 0 && c.usedCount >= c.maxUses;
    return !c.active ? "중지" : expired ? "만료" : exhausted ? "소진" : "사용 가능";
  };
  const shownCoupons = coupons.filter((c) => (!couponView || couponState(c) === couponView) && hit(c.code, c.name));
  const shownOrders = shownOrdersByStatus.filter((o) => hit(o.itemName, o.bundleName, o.categoryLabel, o.bundleCategoryLabel, o.userName, o.contact, o.adminNote));
  const orderTypeLabel = (o: AnyRow) => (o?.bundleName ? o.bundleCategoryLabel || "세트" : o?.categoryLabel || typeLabel(o?.itemType));

  const noResult = "검색 결과가 없습니다.";
  const orderSel = orderSelId ? shownOrdersByStatus.find((o) => o._id === orderSelId) || null : null;
  const couponSel = couponForm.id ? coupons.find((c) => c._id === couponForm.id) : null;

  // 📌 아이템 등록 — 인벤토리 미리보기는 폼 값을 그대로 따라간다. 효과 줄은 서버(/api/shop/my-items)와 같은 규칙
  //    (describeItemBasic + describeEffect, 기프트카드를 뺀 모든 아이템 — 역할 연결 여부와 무관). 채널 하나짜리 효과는 효과 편집과 같은 채널 이름으로
  const regEffOn = itemForm.type !== "physical";
  const regRoleBuff: string[] = regEffOn && itemForm.roleId ? describeRoleBuff(roleCfgs.find((c) => c.roleId === itemForm.roleId) || {}) : [];
  const regChName = (id: string) => guildChannels.find((c) => c.id === id)?.name as string | undefined;
  // 📌 2026-10-18 효과 문구 · 적용 범위(lib/itemEffects) — 편집 중인 효과로 다시 셈한다(저장 모양 { type, chatBuffXp …, effects[] }).
  //    regFxAuto: 자동 효과 줄(꾸미기 문장 없음 — 「직접 쓰기」가 이 줄로 채워 연다) · regFxLines: 보일 줄(직접 쓰기 > 자동)
  //    regCosmetic: 꾸미기 아이템인가 · regScopeAuto: 자동 적용 범위 키 · regScopeLabel: 보일 적용 범위 글자
  const regFxShape = {
    type: itemForm.type, chatBuffXp: xpNum(itemForm.chatBuffXp), voiceBuffXp: xpNum(itemForm.voiceBuffXp), attendBuffXp: xpNum(itemForm.attendBuffXp),
    effects: normalizeEffects(itemForm.effects.map(effectOf)),
    effectText: itemForm.effectCustom ? normalizeEffectText(itemForm.effectText) : [],
    scope: itemForm.scope,
  };
  const regFxAuto: string[] = autoEffectLinesOf(regFxShape, regChName);
  const regFxLines: string[] = effectLinesOf(regFxShape, regChName);
  const regCosmetic = isCosmeticItem(regFxShape);
  const regScopeAuto: string[] = autoScopeOf(regFxShape);
  const regScopeLabel = scopeLabelOf(regFxShape);
  const regEffectLines: string[] = regEffOn
    ? [
        ...regFxLines,
        // 인벤토리처럼 역할 버프 줄도 뒤에 — 역할을 가진 사람에게 실제로 붙는 값
        ...regRoleBuff,
      ]
    : [];
  // 📌 분류(2026-10-17 「자동 + 바꾸기」) — 편집 중인 유형 · 효과 · 이름으로 다시 셈한다(lib/itemCategory.js). regCategoryAuto = 「자동」이면 보일 값
  const regCategory = resolveCategory(itemForm);
  const regCategoryAuto = resolveCategory({ ...itemForm, category: "" });
  // 📌 개수로 쌓이는 아이템 · 괴담회 추첨권(2026-10-25 운영자 "이거는 개수 표기인 거 알지?" · 추첨권 설명은 11월 5일 뒤 소멸인데 「기간 영구」로 보였다) —
  //    쌓이는 아이템(역할 없는 item · cosmetic 이고 소모형 효과, 또는 1개 단위 상품이 가리킴 — 저장된 줄의 stackable, 또는 추첨권)은 「수량 ×1」,
  //    추첨권은 만료(추첨 마감 — /api/admin/items ticketUntil)도 같이 보인다. 그 밖은 지금처럼 「기간 영구」
  const regTicketUntil = typeof regSavedRow?.ticketUntil === "string" ? regSavedRow.ticketUntil : "";
  const regStackable = unitSaleAllowed(itemForm.type, itemForm.roleId) && (hasConsumable(regFxShape) || !!regSavedRow?.stackable || !!regTicketUntil);
  const regPreviewItem = {
    name: itemForm.name.trim() || "아이템 이름",
    // 인벤토리 칸 · 상세의 분류 글자 · 이름(API categoryLabel · shortName 과 같은 값)
    categoryLabel: regCategory,
    shortName: shortNameOf(itemForm.name.trim() || "아이템 이름"),
    description: itemForm.description.trim(),
    type: itemForm.type,
    icon: itemForm.icon,
    imageUrl: itemForm.imageUrl.trim(),
    // 쓰는 중인 색(#e9 …)은 유형 기본색으로 — 반쯤 친 값이 엉뚱한 색으로 그려지지 않게
    color: /^#[0-9a-f]{6}$/i.test(itemForm.color) ? itemForm.color : "",
    // 희귀도 — 인벤토리 칸 · 상세와 같은 키("" = 일반)
    rarity: normalizeRarity(itemForm.rarity),
    // 효과 문구 · 적용 범위 — 인벤토리 칸(lib/inventory)과 같은 칸 이름(isCosmetic · scopeLabel · effectCustom)
    isCosmetic: regCosmetic,
    scopeLabel: regScopeLabel,
    effectCustom: regFxShape.effectText.length > 0,
    ...(regStackable ? { count: 1 } : {}),
    ...(regTicketUntil ? { expiresAt: regTicketUntil } : {}),
  };
  // 📌 상세 칸 흰 판(2026-10-17 shop-tidy) — 꾸미기 아이템은 착용 미리보기부터 · 머리 줄 값(접힌 판도 지금 값이 보이게)
  const regWear = itemForm.type !== "physical" ? wearOf(itemForm.effects) : null;
  const regRarityLabel = rarityOf(normalizeRarity(itemForm.rarity) || RARITIES[0].v).l;
  const regFxSummary = regEffectLines.length ? `${regEffectLines[0]}${regEffectLines.length > 1 ? ` 외 ${regEffectLines.length - 1}` : ""}` : "없음";
  // 📌 상품 칸 「그룹」(shop-tidy ⑥) — 상품 그룹 = 연결 아이템 그룹(lib/productOrder productGroupOf)이라 그 아이템의 그룹을 바로 바꾼다(아이템 탭에서도 옮겨진다).
  //    일괄 그룹과 같은 길(runBatch — PATCH /api/admin/items { batch } · 알림 · 소리). 세트(첫 구성 아이템을 따른다) · 직접 설정은 고르는 칸이 없다
  const paneSetProdGroup = async (itemId: string, raw: string) => {
    const g = normalizeItemGroup(raw);
    const it = itemId ? regItems.find((x) => String(x._id) === itemId) : null;
    if (!it || groupOfItem(it) === g) return;
    if (liveLocked) { fail(LIVE_LOCKED_MSG); return; }
    if (batchBusy) { fail("잠시 후 다시 시도해 주십시오."); return; }
    if (g && regParents.includes(g)) { fail("같은 이름의 상위 그룹이 있습니다."); return; }
    const ok = await runBatch([{ id: itemId, set: { group: g } }], g ? "옮김" : "뺌");
    if (ok) { openGroupNamed(g); openProductGroupNamed(g); fetchAll(); }
  };

  // 새로 만들기 — 쓰다 만 새 폼이면 그대로 이어 쓰고, 수정하던 폼이면(고쳤으면 한 번 묻고) 비운다
  const openNewReg = () => {
    if (!itemForm.id) { setPane("reg"); return; }
    guard("reg", () => { setItemForm(EMPTY_ITEM_FORM); setPane("reg"); });
  };
  // 📌 복제(편집기 아래) — 지금 폼 값 그대로 새로 만들기 폼으로(id 비움 · 이름 뒤 「 (복사)」 · 효과 줄 id 새로). 「등록」해야 저장된다
  const openRegCopy = () => {
    const src = itemForm;
    if (!src.id) return;
    const copy: ItemForm = { ...src, id: "", name: copyNameOf(src.name), effects: src.effects.map((d) => ({ ...d, id: newEffectId(), open: false })) };
    guard("reg", () => { setItemForm(copy); setPane("reg"); toast("복제본을 열었습니다."); });
  };
  // 수정하던 폼을 새 폼으로 바꿀 때는 아이템 고르는 중 · 잡아 둔 직접 설정 값도 함께 푼다(새로 쓰던 폼이면 그대로 이어 쓴다)
  const openNewProduct = () => {
    if (!form.id) { setPane("product"); return; }
    guard("product", () => { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); setPane("product"); });
  };
  // 📌 복제(편집기 아래 — 상품 · 배너 · 쿠폰) — 지금 폼 값 그대로 새로 만들기 폼으로. 「등록」해야 저장된다.
  //    상품은 이름 뒤 「 (복사)」(연결 상품은 아이템 이름 그대로) · 숨김으로 시작(같은 상품이 상점에 둘 뜨지 않게) · 재고 폭 기준 비움. 쿠폰은 코드를 비운다
  const openProductCopy = () => {
    if (!form.id) return;
    const copy: ProdForm = { ...form, id: "", name: linked ? form.name : copyNameOf(form.name), stockBase: "", sortOrder: "", active: false, bundle: form.bundle.map((r) => ({ ...r })) };
    guard("product", () => { setForm(copy); setLinkPick(null); setCustomSnap(null); setPane("product"); toast("복제본을 열었습니다."); });
  };
  // 새 배너 — 지금 보던 위치로 시작(시즌 탭을 보다 누르면 시즌 탭 배너)
  const newPlace = placeNow === GONE_PLACE ? "home" : placeNow;
  const openNewBanner = () => {
    if (!bannerForm.id) { setBannerForm({ ...bannerForm, placement: bannerForm.imageUrl ? bannerForm.placement : newPlace }); setPane("banner"); return; }
    guard("banner", () => { setBannerForm({ ...EMPTY_BANNER, placement: newPlace }); setPane("banner"); });
  };
  const openBannerCopy = () => {
    if (!bannerForm.id) return;
    const copy = { ...bannerForm, id: "", sortOrder: "", placement: knownPlaces.has(bannerForm.placement) ? bannerForm.placement : newPlace };
    guard("banner", () => { setBannerForm(copy); setPane("banner"); toast("복제본을 열었습니다."); });
  };
  const openNewCoupon = () => {
    if (!couponForm.id) { setPane("coupon"); return; }
    guard("coupon", () => { setCouponForm(EMPTY_COUPON); setCouponBulk(EMPTY_BULK); setPane("coupon"); });
  };
  const openCouponCopy = () => {
    if (!couponForm.id) return;
    const copy = { ...couponForm, id: "", code: "" };
    guard("coupon", () => { setCouponForm(copy); setCouponBulk(EMPTY_BULK); setPane("coupon"); toast("복제본을 열었습니다."); });
  };

  // ── 표 열 ─────────────────────────────────────
  // 상품 줄 그림 — 연결 아이템의 꾸미기 효과로 도트 아이콘(withCosmeticIcon)
  const regById = new Map(regItems.map((x) => [String(x._id), x]));
  // 숨긴 열(열 고르기) — 기본은 색상 · 시즌 · 연결 역할을 뺀다
  const regHidden: string[] = Array.isArray(regHiddenCols) ? regHiddenCols : REG_HIDDEN_DEFAULT;
  const regColsAll: Column<any>[] = [
    {
      // 이름 칸이 남는 폭을 다 쓴다(w-full · max-w-0 — 긴 이름 · 설명은 칸 안에서 말줄임, 표가 옆으로 늘지 않는다)
      // 📌 짧은 이름 + 분류 배지(2026-10-17 — 옛 이름 머리말은 떼어 보이고 분류로 읽는다 · 마우스를 올리면 원래 이름)
      key: "name", label: "아이템", mobile: "title", className: "w-full max-w-0",
      sortValue: (it) => shortOfRow(it),
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={withCosmeticIcon(it, it)} />
          <span className="block min-w-0 flex-1">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`truncate font-bold ${it.visible === false ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`} title={it.name}>{shortOfRow(it)}</span>
              {editedDot("reg", it._id)}
              <TypeBadge type={it.type} label={categoryOfRow(it)} className="shrink-0 px-2 py-0.5 text-[10px]" />
              {/* 시즌 뗌 — 역할 아이템만(시즌 열을 숨겨도 보이게 유형 옆 작은 표시) */}
              {/* 서버 부스터 혜택(boosterPerk) — 부스팅 중 자동 보유 아이템 */}
              {it.boosterPerk === true && it.type !== "physical" && <span className="shrink-0 text-[10px] font-bold text-[#8a8a8a]">부스터</span>}
              {it.type === "role" && it.detachOnSeason && regHidden.includes("season") && <span className="shrink-0 text-[10px] font-bold text-[#8a8a8a]">시즌 뗌</span>}
              {/* 초안(추가 · 수정 — 순서만 바뀐 것은 표시 없음) — 되돌리기는 한 번 묻는다 */}
              {it._draft && <DraftMark onRevert={() => askRevertRow("item", it, it.name || "이름 없음")} disabled={!!draftBusy} />}
            </span>
            {it.description && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{it.description}</span>}
          </span>
        </span>
      ),
    },
    {
      // 희귀도 — 고른 것만(안 고른 아이템은 PC 표에 「—」, 모바일 줄 카드는 비움)
      key: "rarity", label: "희귀도",
      sortValue: (it) => (normalizeRarity(it.rarity) ? rarityRank(it.rarity) : null),
      render: (it) => (normalizeRarity(it.rarity) ? <RarityMark v={it.rarity} /> : <span className="hidden md:inline text-[#a3a3a3]">—</span>),
    },
    {
      key: "role", label: "연결 역할",
      sortValue: (it) => (it.roleId ? roleNameOf(it.roleId, it.roleName) : null),
      render: (it) => <span className="text-[#5a5a5a]">{it.roleId ? roleNameOf(it.roleId, it.roleName) : "역할 없음"}</span>,
    },
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
    {
      key: "usage", label: "사용",
      sortValue: (it) => (Number(it.usage) || 0) + (Number(it.passUsage) || 0),
      render: (it) => <span className="text-[#5a5a5a] tabular-nums">상품 {it.usage || 0}{it.passUsage > 0 ? ` · 패스 ${it.passUsage}` : ""}</span>,
    },
    { key: "season", label: "시즌", render: (it) => (it.type === "role" && it.detachOnSeason ? <StatusChip>시즌 뗌</StatusChip> : null) },
    {
      key: "vis", label: "인벤토리",
      sortValue: (it) => it.visible !== false,
      render: (it) => <VisSwitch on={it.visible !== false} busy={visBusy === String(it._id)} disabled={liveLocked} onToggle={() => toggleRegVisible(it)} />,
    },
  ];
  const regCols = regColsAll.filter((c) => !regHidden.includes(c.key));
  const toggleRegCol = (key: string) => {
    sfxTick();
    const hide = !regHidden.includes(key);
    setRegHiddenCols(hide ? [...regHidden, key] : regHidden.filter((k) => k !== key));
    // 숨긴 열로 정렬하던 중이면 기본 순서로
    if (hide && regSort?.key === key) setRegSort(null);
  };
  // 화면 차례(정렬 · 묶음) — 카드 보기 · 편집기 ‹ › 가 같은 차례
  const regSorted = sortRows(shownReg, regColsAll, regSort);
  const regGroupOf = (it: any) => groupOfItem(it);
  const regNavList = displayOrderOf<any>(regSorted, regGrouped ? regGroupOf : undefined);
  const regNavIdx = itemForm.id ? regNavList.findIndex((x) => String(x._id) === String(itemForm.id)) : -1;
  const regNav = {
    index: regNavIdx,
    total: regNavList.length,
    onPrev: () => { if (regNavIdx > 0) openRegRow(regNavList[regNavIdx - 1]); },
    onNext: () => { if (regNavIdx >= 0 && regNavIdx < regNavList.length - 1) openRegRow(regNavList[regNavIdx + 1]); },
  };
  // 목록에서 ↑ ↓ — 포커스를 옆 줄(카드)로. 편집기가 열려 있으면 그 줄을 연다(고쳤으면 한 번 묻는다). 아이템 · 상품 · 배너 · 쿠폰 · 구매 내역 목록이 같이 쓴다
  const listKeyNav = (openNow: boolean) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const rowSel = 'tr[tabindex="0"], div[role="button"][tabindex="0"]';
    const t = e.target as HTMLElement;
    if (!t.matches?.(rowSel)) return;
    const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(rowSel)).filter((el) => el.getClientRects().length > 0);
    const i = rows.indexOf(t);
    const next = i < 0 ? null : rows[e.key === "ArrowDown" ? i + 1 : i - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
    if (openNow) next.click();
  };
  const onRegListKey = listKeyNav(pane === "reg" && !!itemForm.id);
  // 모두 펼치기 · 접기 — 지금 보이는 그룹들
  const regShownGroups = [...new Set(shownReg.map(groupOfItem).filter(Boolean))];
  const regAllOpen = regShownGroups.length > 0 && regShownGroups.every((g) => openGroups.has(g));
  const toggleAllGroups = () => {
    sfxTick();
    if (regAllOpen) setOpenGroupList((l) => (Array.isArray(l) ? l : []).filter((g) => !regShownGroups.includes(g)));
    else { setOpenGroupList((l) => [...new Set([...(Array.isArray(l) ? l : []), ...regShownGroups])]); setClosedSectionList([]); }
  };
  // 거르기 — 켜고 끄기 · 켠 칩 줄(정렬도 칩으로 — 누르면 기본 순서)
  const toggleRegFilter = (k: keyof ItemFilters, v: string) => {
    sfxTick();
    setRegFilters((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  };
  // 📌 그룹 거르기(2026-10-17 도구 줄 한 줄) — 도구 줄의 그룹 단추를 걷고 거르기 판 「그룹」 칸으로(하나만 고른다 · 다시 누르면 모든 그룹). 켠 칩 「그룹 · <이름>」
  const pickRegGroup = (v: string) => { sfxTick(); setRegGroup((cur) => (cur === v ? GROUP_ALL : v)); };
  const regGroupOn = regGroupV !== GROUP_ALL;
  const regFilterN = Object.values(regFilters).reduce((s, a) => s + a.length, 0) + (regGroupOn ? 1 : 0);
  const labelOf = (list: { v: string; l: string }[], v: string) => list.find((x) => x.v === v)?.l || v;
  const regActive: ActiveFilter[] = [
    ...(regGroupOn ? [{ key: "g", label: regGroupV === GROUP_NONE ? "그룹 없음" : `그룹 · ${regGroupV.slice(2)}`, onRemove: () => { sfxTick(); setRegGroup(GROUP_ALL); } }] : []),
    ...regFilters.rarity.map((v) => ({ key: `r:${v}`, label: `희귀도 · ${v === RARITY_NONE ? "미지정" : rarityOf(v).l}`, onRemove: () => toggleRegFilter("rarity", v) })),
    ...regFilters.kind.map((v) => ({ key: `k:${v}`, label: `효과 · ${labelOf(KIND_FILTERS, v)}`, onRemove: () => toggleRegFilter("kind", v) })),
    ...regFilters.use.map((v) => ({ key: `u:${v}`, label: labelOf(USE_FILTERS, v), onRemove: () => toggleRegFilter("use", v) })),
    ...regFilters.vis.map((v) => ({ key: `v:${v}`, label: `인벤토리 · ${labelOf(VIS_FILTERS, v)}`, onRemove: () => toggleRegFilter("vis", v) })),
    ...regFilters.draft.map((v) => ({ key: `d:${v}`, label: `초안 · ${labelOf(DRAFT_FILTERS, v)}`, onRemove: () => toggleRegFilter("draft", v) })),
    ...(regSort ? [{ key: "sort", label: `정렬 · ${REG_SORT_LABEL[regSort.key] || regSort.key} ${regSort.dir === "asc" ? "↑" : "↓"}`, onRemove: () => { sfxTick(); setRegSort(null); } }] : []),
  ];
  const clearRegFilters = () => { sfxTick(); setRegFilters(NO_FILTERS); setRegGroup(GROUP_ALL); setRegSort(null); };
  // 거르기 칩 수 — 전체 아이템 기준(켠 거르기와 무관하게 늘 같은 수)
  const regCountBy = (test: (it: any) => boolean) => regItems.reduce((n, it) => n + (test(it) ? 1 : 0), 0);
  // 고른 아이템(목록 차례) · 일괄 삭제 확인 — 상품 · 패스가 쓰는 것은 막힌다
  const regPicked = regItems.filter((it) => sel.has(String(it._id)));
  const regDelOk = regPicked.filter((it) => !(Number(it.usage) > 0) && !(Number(it.passUsage) > 0));
  const regDelBlocked = regPicked.filter((it) => Number(it.usage) > 0 || Number(it.passUsage) > 0);
  const selProps = {
    selectable: true as const,
    selectedKeys: sel.selectedKeys,
    onToggleKey: (k: string, o: { shift: boolean; range?: string[] }) => { sfxTick(); sel.onToggleKey(k, o); },
    onToggleAll: (keys: string[]) => { sfxTick(); sel.onToggleAll(keys); },
  };

  // 📌 기능 검색 · 다른 화면에서 오는 주소(?tab=items&item=<id> · new=1 · open=preset|groups / ?tab=products&new=1 · open=themes) —
  //    주소가 바뀔 때마다 한 번(렌더 중 조정 — 이미 이 화면이어도 따라간다). 아이템 열기는 목록을 받은 뒤에. 따라간 뒤 그 표시는 주소에서 걷는다(위 설정 창 주소와 같은 자리 — deepKey)
  //    상품 열기(?edit= — ARCTIC 상점 카드의 「관리에서 수정」 · 기능 검색)도 같은 길 — 상품 목록을 받은 뒤에
  const deepWait = (tab === "items" && !!searchParams.get("item") && !regLoaded) || (tab === "products" && !!searchParams.get("edit") && isLoading);
  if (deepSeen !== deepKey && !deepWait) {
    setDeepSeen(deepKey);
    const open = searchParams.get("open") || "";
    // 효과 문구 창(기능 검색 「효과 문구」) — 탭과 무관
    if (open === "fxtext") { setFxTextFocus([]); setFxTextOpen(true); }
    if (tab === "items") {
      const itemId = searchParams.get("item");
      const it = itemId ? regItems.find((x) => String(x._id) === itemId) : null;
      if (it) openRegRow(it);
      else if (searchParams.get("new") === "1") openNewReg();
      if (open === "preset") setPresetOpen(true);
      if (open === "groups") setGroupManageOpen(true);
    }
    if (tab === "products") {
      const editId = searchParams.get("edit");
      const it = editId ? items.find((x) => String(x._id) === editId) : null;
      if (it) openProductRow(it);
      else if (searchParams.get("new") === "1" && !editId) openNewProduct();
      if (open === "themes") setThemeManageOpen(true);
    }
  }

  // ── 상품 표 · 카드 ─────────────────────────────
  //    이름 칸이 남는 폭을 다 쓴다(아이템 표와 같다). 판매 칸 = 줄에서 바로 켜고 끄는 스위치(그 칸만 저장 · 실패하면 되돌림)
  const PROD_STATUS_RANK: Record<string, number> = { on: 0, ended: 1, off: 2 };
  const productCols: Column<AnyRow>[] = [
    {
      // 최소 폭 — 붙는 편집기로 표가 좁아져도 이름이 사라지지 않게(넘치면 표 안에서 옆으로 민다)
      // 📌 짧은 이름 + 분류 배지(아이템 목록과 같은 모양 — 연결 상품은 연결 아이템의 분류)
      key: "name", label: "상품", mobile: "title", className: "w-full max-w-0 min-w-[200px]",
      sortValue: (it) => shortOfRow(it),
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={withCosmeticIcon(it, regById.get(String(it.itemId || "")))} />
          <span className="block min-w-0 flex-1">
            {/* 이름 줄 — 아이템 목록처럼 한 줄 flex(초안 칩이 붙어도 줄 높이 그대로) */}
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate font-bold" title={it.name}>{shortOfRow(it)}</span>
              {editedDot("product", it._id)}
              <TypeBadge type={it.type} label={categoryOfRow(it)} className="shrink-0 px-2 py-0.5 text-[10px]" />
              {it._draft && <DraftMark onRevert={() => askRevertRow("shopItem", it, it.name || "이름 없음")} disabled={!!draftBusy} />}
            </span>
            {/* 등록 아이템 · 1개 단위(1회 최대) — 목록에서 판매 방식이 보이게 */}
            {(it.itemId || isUnitSale(it)) && (
              <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] tabular-nums truncate">
                {[it.itemId && "등록 아이템", isUnitSale(it) && `1개 단위 · 1회 최대 ${maxPerOrderOf(it)}개`].filter(Boolean).join(" · ")}
              </span>
            )}
            {/* 세트 — 구성 아이템(GET /api/shop/items 의 bundleItems) */}
            {isBundle(it) && (
              <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] tabular-nums truncate">
                {(Array.isArray(it.bundleItems) ? it.bundleItems : []).map(bundleCompLabel).join(" · ")}
              </span>
            )}
          </span>
        </span>
      ),
    },
    // 판매 종료(lib/saleWindow) — 판매 중이어도 시각이 지나면 「판매 종료」(상점에서 빠짐). 끝나는 시각이 있으면 옆에 작게.
    //    모바일 줄 카드는 아래 줄(이름이 스위치에 밀려 잘리지 않게)
    {
      key: "status", label: "판매", mobile: "meta",
      sortValue: (it) => PROD_STATUS_RANK[prodStatusOf(it)],
      render: (it) => (
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
          <VisSwitch on={!!it.active} busy={prodSwitchBusy === String(it._id)} disabled={liveLocked} onToggle={() => { void toggleProductActive(it); }} label="판매" onText="판매 중" offText="숨김" />
          {prodStatusOf(it) === "ended"
            ? <StatusChip tone="warn">판매 종료</StatusChip>
            : it.active && saleUntilLabel(it) ? <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">~{saleUntilLabel(it)}</span> : null}
        </span>
      ),
    },
    {
      key: "type", label: "유형 · 역할",
      render: (it) => (
        <span className="text-[#5a5a5a]">
          {isBundle(it)
            ? `${typeLabel(it.type)} · ${(Array.isArray(it.bundle) ? it.bundle.length : 0)}개`
            : it.type === "physical" || it.type === "cosmetic" ? typeLabel(it.type) : `${typeLabel(it.type)} · ${it.roleName || it.roleId || "역할 없음"}`}
          {it.theme && themeKeys.has(String(it.theme)) && <span className="text-[#8a8a8a]"> · {themeNameOf(themes, it.theme)}</span>}
        </span>
      ),
    },
    {
      key: "price", label: "가격", align: "right",
      // 할인가(XP — 빙옥 전용도 XP 로 저장돼 있어 같은 잣대)
      sortValue: (it) => applyDiscount(it, it.price),
      render: (it) => (
        <span className="font-bold tabular-nums whitespace-nowrap">
          {/* 할인가 — 상점 · 결제와 같은 계산(빙옥 전용은 빙옥 단위로 내림 — lib/shopPricing applyDiscount) */}
          {priceText(it, applyDiscount(it, it.price))}
          {discountPctOf(it) > 0 && <span className="ml-1 text-[#e91e3f]">-{it.discountPct}%</span>}
          {/* 할인 종료 — 남아 있으면 언제까지, 지났으면 끝났다고 */}
          {it.discountPct > 0 && it.discountUntil && (
            <span className="ml-1 text-[11px] font-bold text-[#8a8a8a]">{discountPctOf(it) > 0 ? `~${discountUntilLabel(it).replace("까지", "")}` : "할인 종료"}</span>
          )}
        </span>
      ),
    },
    { key: "stock", label: "재고", align: "right", sortValue: (it) => (Number(it.stock) < 0 ? Infinity : Number(it.stock) || 0), render: (it) => <span className="tabular-nums"><ML>재고</ML>{it.stock < 0 ? "무제한" : it.stock}</span> },
    { key: "sold", label: "판매", sortLabel: "판매 수", align: "right", sortValue: (it) => Number(it.soldCount) || 0, render: (it) => <span className="text-[#5a5a5a] tabular-nums">{it.soldCount || 0}개<span className="md:hidden"> 판매</span></span> },
  ];
  // 열 고르기(아이템 표와 같은 「열」 메뉴 · 이 브라우저에 기억) — 붙는 편집기를 연 채 좁은 표에서 줄일 열
  const prodHidden: string[] = Array.isArray(prodHiddenCols) ? prodHiddenCols : [];
  const prodCols = productCols.filter((c) => !prodHidden.includes(c.key));
  const toggleProdCol = (key: string) => {
    sfxTick();
    const hide = !prodHidden.includes(key);
    setProdHiddenCols(hide ? [...prodHidden, key] : prodHidden.filter((k) => k !== key));
    if (hide && prodSort?.key === key) setProdSort(null);
  };
  // 화면 차례(정렬 · 묶음) — 카드 보기 · 편집기 ‹ › 가 같은 차례
  const prodGroupOf = (it: AnyRow) => productGroupOf(it, prodIdx);
  const prodSorted = sortRows(shownProducts, productCols, prodSort);
  const prodNavList = displayOrderOf<AnyRow>(prodSorted, prodGroupOf);
  const prodNavIdx = form.id ? prodNavList.findIndex((x) => String(x._id) === String(form.id)) : -1;
  const prodNav = {
    index: prodNavIdx,
    total: prodNavList.length,
    onPrev: () => { if (prodNavIdx > 0) openProductRow(prodNavList[prodNavIdx - 1]); },
    onNext: () => { if (prodNavIdx >= 0 && prodNavIdx < prodNavList.length - 1) openProductRow(prodNavList[prodNavIdx + 1]); },
  };
  const onProdListKey = listKeyNav(pane === "product" && !!form.id);
  // 모두 펼치기 · 접기 — 지금 보이는 묶음들
  const prodShownGroups = [...new Set(shownProducts.map(prodGroupOf).filter(Boolean))];
  const prodAllOpen = prodShownGroups.length > 0 && prodShownGroups.every((g) => openProductGroups.has(g));
  const toggleAllProductGroups = () => {
    sfxTick();
    if (prodAllOpen) setOpenProductGroupList((l) => (Array.isArray(l) ? l : []).filter((g) => !prodShownGroups.includes(g)));
    else { setOpenProductGroupList((l) => [...new Set([...(Array.isArray(l) ? l : []), ...prodShownGroups])]); setClosedProductSectionList([]); }
  };
  // 거르기 — 켜고 끄기 · 켠 칩 줄(정렬도 칩으로)
  const toggleProdFilter = (k: keyof ProdFilters, v: string) => {
    sfxTick();
    setProdFilters((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));
  };
  // 📌 판매 상태(2026-10-17 도구 줄 한 줄) — 도구 줄의 판매 상태 칸을 걷고 거르기 판 「판매 상태」 칸으로(하나만 고른다 · 다시 누르면 전체)
  const pickProdStatus = (v: string) => { sfxTick(); setProductView((cur) => (cur === v ? "" : v)); };
  const prodFilterN = Object.values(prodFilters).reduce((n, a) => n + a.length, 0) + (productView ? 1 : 0);
  const prodCountBy = (test: (it: AnyRow) => boolean) => items.reduce((n, it) => n + (test(it) ? 1 : 0), 0);
  const themeLabelOf = (k: string) => (k === THEME_NONE ? "테마 없음" : themeNameOf(themes, k) || k);
  const prodActive: ActiveFilter[] = [
    ...(productView ? [{ key: "st", label: `판매 상태 · ${labelOf(PROD_STATUS_OPTIONS, productView)}`, onRemove: () => { sfxTick(); setProductView(""); } }] : []),
    ...prodFilters.theme.map((v) => ({ key: `t:${v}`, label: `테마 · ${themeLabelOf(v)}`, onRemove: () => toggleProdFilter("theme", v) })),
    ...prodFilters.disc.map((v) => ({ key: `d:${v}`, label: labelOf(DISC_FILTERS, v), onRemove: () => toggleProdFilter("disc", v) })),
    ...prodFilters.pay.map((v) => ({ key: `p:${v}`, label: labelOf(PAY_FILTERS, v), onRemove: () => toggleProdFilter("pay", v) })),
    ...prodFilters.src.map((v) => ({ key: `s:${v}`, label: labelOf(SRC_FILTERS, v), onRemove: () => toggleProdFilter("src", v) })),
    ...(prodSort ? [{ key: "sort", label: `정렬 · ${PROD_SORT_LABEL[prodSort.key] || prodSort.key} ${prodSort.dir === "asc" ? "↑" : "↓"}`, onRemove: () => { sfxTick(); setProdSort(null); } }] : []),
  ];
  const clearProdFilters = () => { sfxTick(); setProdFilters(NO_PROD_FILTERS); setProductView(""); setProdSort(null); };
  // 고른 상품(목록 차례) — 띠 · 창 · 일괄 삭제 확인
  const prodPicked = items.filter((it) => prodSel.has(String(it._id)));
  const prodSelProps = {
    selectable: true as const,
    selectedKeys: prodSel.selectedKeys,
    onToggleKey: (k: string, o: { shift: boolean; range?: string[] }) => { sfxTick(); prodSel.onToggleKey(k, o); },
    onToggleAll: (keys: string[]) => { sfxTick(); prodSel.onToggleAll(keys); },
  };
  // 편집기 — 연결 상품의 아이템(요약 칸)
  const linkedItem = linked ? regItems.find((x) => String(x._id) === String(form.itemId)) || null : null;

  // ── 배너 표 · 카드 ─────────────────────────────
  const bannerCols: Column<AnyRow>[] = [
    {
      key: "banner", label: "배너", mobile: "title", className: "w-full max-w-0 min-w-[240px]",
      render: (b) => (
        <span className="flex items-center gap-3 min-w-0">
          <span className="block w-24 h-12 rounded-lg bg-[#f2f2f2] overflow-hidden shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.imageUrl} alt="" className="w-full h-full object-cover" />
          </span>
          <span className="block min-w-0 flex-1">
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate font-bold">{b.title || "(제목 없음)"}</span>
              {editedDot("banner", b._id)}
              {b._draft && <DraftMark onRevert={() => askRevertRow("banner", b, String(b.title || "").trim() || "제목 없는 배너")} disabled={!!draftBusy} />}
            </span>
            {b.subtitle && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{b.subtitle}</span>}
          </span>
        </span>
      ),
    },
    {
      key: "status", label: "노출", mobile: "meta",
      render: (b) => <VisSwitch on={!!b.active} busy={bannerSwitchBusy === String(b._id)} disabled={liveLocked} onToggle={() => { void toggleBannerActive(b); }} label="노출" onText="노출 중" offText="숨김" />,
    },
    { key: "link", label: "이동", render: (b) => (b.link ? <span className="block max-w-[240px] truncate font-bold text-[#5a5a5a]" title={b.link}>→ {b.link}</span> : null) },
  ];
  const bannerNavIdx = bannerForm.id ? shownBanners.findIndex((x) => String(x._id) === String(bannerForm.id)) : -1;
  const bannerNav = {
    index: bannerNavIdx,
    total: shownBanners.length,
    onPrev: () => { if (bannerNavIdx > 0) openBannerRow(shownBanners[bannerNavIdx - 1]); },
    onNext: () => { if (bannerNavIdx >= 0 && bannerNavIdx < shownBanners.length - 1) openBannerRow(shownBanners[bannerNavIdx + 1]); },
  };
  const onBannerListKey = listKeyNav(pane === "banner" && !!bannerForm.id);

  // ── 쿠폰 표 ─────────────────────────────────────
  //    사용 칸 = 줄에서 바로 켜고 끄는 스위치(만료 · 소진이면 옆에 칩)
  const couponCols: Column<AnyRow>[] = [
    {
      key: "state", label: "사용", mobile: "meta",
      sortValue: (c) => couponState(c),
      render: (c) => {
        const s = couponState(c);
        return (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <VisSwitch on={!!c.active} busy={couponSwitchBusy === String(c._id)} onToggle={() => { void toggleCouponActive(c); }} label="사용 상태" onText="사용" offText="중지" />
            {(s === "만료" || s === "소진") && <StatusChip>{s}</StatusChip>}
          </span>
        );
      },
    },
    {
      key: "code", label: "코드", mobile: "title", className: "w-full max-w-0 min-w-[160px]",
      sortValue: (c) => String(c.code || ""),
      render: (c) => (
        <span className="block min-w-0">
          <span className="flex items-center gap-2 min-w-0"><span className="truncate font-black">{c.code}</span>{editedDot("coupon", c._id)}</span>
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
    { key: "used", label: "사용 수", align: "right", sortValue: (c) => Number(c.usedCount) || 0, render: (c) => <span className="text-[#5a5a5a] tabular-nums"><ML>사용</ML>{c.usedCount || 0}{c.maxUses > 0 ? ` / ${c.maxUses}` : ""}</span> },
    { key: "per", label: "1인", align: "right", render: (c) => <span className="text-[#5a5a5a]"><ML>1인</ML>{c.perUserLimit === 0 ? "무제한" : `${c.perUserLimit}회`}</span> },
    { key: "exp", label: "만료", sortValue: (c) => (c.expiresAt ? new Date(c.expiresAt) : null), render: (c) => (c.expiresAt ? <span className="text-[#8a8a8a] tabular-nums whitespace-nowrap">~ {fmtDateTime(c.expiresAt)}</span> : null) },
  ];
  const couponSorted = sortRows(shownCoupons, couponCols, couponSort);
  const couponNavIdx = couponForm.id ? couponSorted.findIndex((x) => String(x._id) === String(couponForm.id)) : -1;
  const couponNav = {
    index: couponNavIdx,
    total: couponSorted.length,
    onPrev: () => { if (couponNavIdx > 0) openCouponRow(couponSorted[couponNavIdx - 1]); },
    onNext: () => { if (couponNavIdx >= 0 && couponNavIdx < couponSorted.length - 1) openCouponRow(couponSorted[couponNavIdx + 1]); },
  };
  const onCouponListKey = listKeyNav(pane === "coupon" && !!couponForm.id);
  const couponActive: ActiveFilter[] = couponSort
    ? [{ key: "sort", label: `정렬 · ${COUPON_SORT_LABEL[couponSort.key] || couponSort.key} ${couponSort.dir === "asc" ? "↑" : "↓"}`, onRemove: () => { sfxTick(); setCouponSort(null); } }]
    : [];

  // ── 구매 내역 표 ─────────────────────────────────
  const orderCols: Column<AnyRow>[] = [
    { key: "status", label: "상태", mobile: "title", render: (o) => <StatusChip tone={STATUS_TONE[o.status] || "neutral"}>{STATUS_LABEL[o.status]}</StatusChip> },
    {
      key: "item", label: "상품", mobile: "title", className: "w-full max-w-0 min-w-[180px]",
      render: (o) => (
        <span className="block min-w-0">
          <span className="block truncate font-bold">{orderName(o)}{o.qty > 1 && <span className="tabular-nums"> ×{o.qty}</span>}</span>
          {orderSummary(o) && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate tabular-nums">{orderSummary(o)}</span>}
        </span>
      ),
    },
    { key: "type", label: "분류", render: (o) => <span className="text-[#5a5a5a]">{orderTypeLabel(o)}</span> },
    { key: "user", label: "구매자", render: (o) => <span className="font-bold text-[#5a5a5a]">{o.userName}</span> },
    // 빙옥 전용 상품을 산 건은 빙옥으로 (o.pointOnly — 구매 시점 스냅샷). 여러 개는 돌려주지 않은 개수만큼(paidQty — lib/orderGroups.js)
    { key: "price", label: "금액", align: "right", render: (o) => <span className="font-bold tabular-nums whitespace-nowrap">{orderAmount(o)}</span> },
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
  const orderNavIdx = orderSelId ? shownOrders.findIndex((o) => o._id === orderSelId) : -1;
  const orderNav = {
    index: orderNavIdx,
    total: shownOrders.length,
    onPrev: () => { if (orderNavIdx > 0) setOrderSelId(shownOrders[orderNavIdx - 1]._id); },
    onNext: () => { if (orderNavIdx >= 0 && orderNavIdx < shownOrders.length - 1) setOrderSelId(shownOrders[orderNavIdx + 1]._id); },
  };
  const onOrderListKey = listKeyNav(pane === "order" && !!orderSelId);
  // 기간 고르기 — 시작 시각은 고를 때 정한다(오늘 0시부터 · 7일 · 30일은 오늘 포함). 직접은 날짜 두 칸(처음엔 최근 7일)
  const pickOrderPeriod = (v: string) => {
    sfxTick();
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const today = d.getTime();
    const back = v === "7d" ? 6 : v === "30d" ? 29 : 0;
    if (v === "custom" && !orderFrom && !orderTo) {
      const from = new Date(today - 6 * 86400e3);
      const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      setOrderFrom(iso(from));
      setOrderTo(iso(d));
    }
    setOrderPeriod({ v, from: today - back * 86400e3 });
  };
  const toggleOrderType = (v: string) => { sfxTick(); setOrderTypes((l) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v])); };
  // 「CSV」 — 지금 거른 주문(상태 · 기간 · 유형 · 검색)을 표 차례 그대로
  const exportOrders = () => {
    if (!shownOrders.length) return fail("내보낼 주문이 없습니다.");
    downloadCsv(`orders-${ymd(new Date())}.csv`, [
      ["상태", "상품", "분류", "구매자", "수량", "금액", "일시", "메모", "지급 실패"],
      ...shownOrders.map((o) => [STATUS_LABEL[o.status] || o.status, orderName(o), orderTypeLabel(o), o.userName || "", Number(o.qty) || 1, orderAmount(o), fmtDateTime(o.createdAt), o.adminNote || "", o.error || ""]),
    ]);
    toast(`${shownOrders.length.toLocaleString()}건 내보냈습니다.`);
  };

  // ── 쿠폰 종류 카드 — 설명을 함께 읽어야 고를 수 있어 알약 대신 카드로 둔다 ──
  const COUPON_KINDS = [
    { v: "discount", l: "할인형", d: "ARCTIC 결제 시 금액 할인" },
    { v: "reward", l: "보상형", d: "입력 즉시 역할·XP 지급" },
  ];

  // disabled — 실사이트 읽기 전용(아이템 · 상품 · 배너)
  // 📌 할로윈 탭 기본 배너(2026-10-11 운영자 "할로윈 배너 탭에 배너가 안 보이다") — 스토어 할로윈 탭(테마 키 BUILTIN_BANNER_THEME — 기본 배너는 이 테마만)은 등록된 배너가 없으면 그림 파일(public/banners/halloween-*.png)을 띄우지만
  //    배너 목록(DB)엔 없어 이 탭이 비어 보였다. 그 그림을 보이고 「등록」으로 새 배너 폼에 채워 둔다(저장은 운영자가 — 초안 모드면 초안). 등록하면 이 줄은 사라지고 그 배너가 목록에 선다
  //    📌 제목은 비운다 — 스토어 기본 배너(ArcticShopBody HW_BANNER)도 제목이 없다. 제목이 있으면 BannerSlider 가 어두운 띠 + 흰 글자를 얹어 그림 속 HALLOWEEN 글자와 겹친다
  //    📌 네 장(HALLOWEEN · 검은 고양이 · 꾸미기 세트 · 유령 펭귄의 초대 — 스토어 ArcticShopBody HW_BANNERS 와 같다). 줄마다 「등록」
  //    📌 등록 안 된 것(같은 그림 배너가 목록에 없는 것)은 목록이 있어도 목록 아래에 보인다 — 스토어도 등록된 켜진 배너 뒤에 같이 돈다
  //       (2026-10-11 운영자 "관리에 안 뜬다고" — HALLOWEEN 만 등록돼 있어 목록이 비지 않았고, 검은 고양이 기본 배너 줄이 숨었다)
  const HW_DEFAULT_BANNERS = [
    { imageUrl: "/banners/halloween-pc.png", mobileImageUrl: "/banners/halloween-mobile.png", title: "", link: "" }, // 할로윈 탭 맨 위라 링크 없음
    { imageUrl: "/banners/halloween-cat-pc.png", mobileImageUrl: "/banners/halloween-cat-mobile.png", title: "", link: "" },
    { imageUrl: "/banners/halloween-set-pc.png", mobileImageUrl: "/banners/halloween-set-mobile.png", title: "", link: "" }, // 할로윈 꾸미기 세트 65%(스토어 HW_BANNERS 세 번째)
    { imageUrl: "/banners/ghost-invite-pc.png", mobileImageUrl: "/banners/ghost-invite-mobile.png", title: "", link: "" }, // 핫타임 「유령 펭귄의 초대」(스토어 HW_BANNERS 네 번째)
  ];
  const hwPending = HW_DEFAULT_BANNERS.filter((d) => !placeBanners.some((b) => String(b.imageUrl || "") === d.imageUrl));
  const hwDefaultRow = (
    <div className="px-4 text-left">
      {hwPending.map((b, i) => (
        // 📌 flex-col 의 gap 은 이 빌드(Tailwind v4)에서 안 먹는다 — 폰(세로)은 그림 아래 여백(mb), 넓은 화면(가로)만 gap
        <div key={b.imageUrl} className={`flex flex-col sm:flex-row items-center sm:gap-4 ${i ? "mt-5" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.imageUrl} alt="" className="w-full sm:w-[320px] aspect-[4/1] rounded-lg object-cover bg-[#f2f2f2] mb-4 sm:mb-0" />
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-bold text-[#131313]">기본 배너 {HW_DEFAULT_BANNERS.indexOf(b) + 1}</span>
            <Btn size="sm" disabled={liveLocked} onClick={() => guard("banner", () => { setBannerForm({ ...EMPTY_BANNER, ...b, placement: BUILTIN_BANNER_THEME }); setPane("banner"); })}>등록</Btn>
          </div>
        </div>
      ))}
    </div>
  );
  const newBtn = (onClick: () => void, className = "", disabled = false) => <Btn className={className} onClick={onClick} disabled={disabled}>새로 만들기</Btn>;

  // 📌 머리 오른쪽 — 「설정」(상점 설정 창 · 탭과 무관하게 늘 같은 자리 · 실사이트 읽기 전용에서도 열린다 — 초안이 아니라 바로 저장되는 설정) +
  //    초안 모드: "초안 N" · 초안 버리기 · 실사이트 반영(0건이어도 숨기지 않고 잠근다 — 머리 · 탭 줄이 움직이지 않게) — 셋은 한 덩어리로 줄을 바꾼다(폰 375 는 「설정」 아래 한 줄),
  //    실사이트: "실사이트 · 읽기 전용". 둘 다 아니면(플래그 없는 localhost) 「설정」만
  const headerActions = (
    <>
      <Btn variant="secondary" onClick={openShopSettings}>설정</Btn>
      {draft.draftMode ? (
        <div className="flex items-center gap-2">
          <StatusChip tone={draft.total > 0 ? "info" : "neutral"} className="min-w-[64px] justify-center tabular-nums">초안 {draft.loaded ? draft.total : "–"}</StatusChip>
          <Btn variant="ghost" onClick={() => setDraftAsk("discard")} disabled={!draft.total || !!draftBusy}>초안 버리기</Btn>
          <Btn onClick={openPublish} disabled={!draft.total || !!draftBusy}>실사이트 반영</Btn>
        </div>
      ) : liveLocked ? (
        <StatusChip tone="warn">실사이트 · 읽기 전용</StatusChip>
      ) : null}
    </>
  );
  const settingEdits = Number(draft.counts.setting?.edit) || 0;
  const NEW_BTN = "w-[116px]";

  // 📌 아이템 고른 것 아래 띠(BatchBar · 2026-10-17 시안 A ②) — 앞: 「N개 선택」 · 「전체 선택 · <지금 거른 수>」 · 「선택 해제」,
  //    자주 쓰는 일: 희귀도 ▾ · 그룹 ▾ · 표시 ▾(표시 · 숨김), 「⋯」: 이름 바꾸기 · 설명 바꾸기 · 분류 바꾸기 · 복제 · 삭제(한 번 확인)
  const batchOff = batchBusy || liveLocked;
  // 📌 설명 · 분류 바꾸기 창의 줄 — 아이템 탭: 고른 아이템. 상품 탭: 직접 설정 · 세트는 그 상품, 연결 상품은 연결 아이템(같은 아이템은 한 줄)
  const itemTextTarget = (it: AnyRow, via = false, name?: string): TextTarget => ({
    key: `item:${it._id}`, kind: "item", id: String(it._id), name: name ?? shortOfRow(it), via,
    desc: String(it.description || ""), category: String(it.category || ""), categoryAuto: String(it.categoryAuto || it.categoryLabel || ""),
  });
  const textTargetsOf = (of: "reg" | "product"): TextTarget[] => {
    if (of === "reg") return regPicked.map((it) => itemTextTarget(it));
    const out: TextTarget[] = [];
    const seen = new Set<string>();
    for (const p of prodPicked) {
      const itemId = String(p.itemId || "");
      const key = itemId ? `item:${itemId}` : `product:${p._id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ri = itemId ? regById.get(itemId) : null;
      if (ri) out.push(itemTextTarget(ri, true, shortOfRow(p)));
      else out.push({
        key, kind: itemId ? "item" : "product", id: itemId || String(p._id), name: shortOfRow(p), via: !!itemId,
        desc: String(p.description || ""), category: itemId ? "" : String(p.category || ""), categoryAuto: String(p.categoryAuto || p.categoryLabel || ""),
      });
    }
    return out;
  };
  const regShownKeys = shownReg.map((it) => String(it._id));
  const regAllPicked = regShownKeys.length === 0 || (sel.size === regShownKeys.length && regShownKeys.every((k) => sel.has(k)));
  const regBatchBar = (
    <BatchBar
      count={sel.size}
      total={regShownKeys.length}
      allSelected={regAllPicked}
      onSelectAll={() => { sfxTick(); sel.replace(regShownKeys); }}
      onClear={() => { sfxTick(); sel.clear(); }}
      moreDisabled={batchOff}
      more={[
        { key: "rename", label: "이름 바꾸기", onSelect: () => { sfxTick(); setSheet("rename"); } },
        { key: "desc", label: "설명 바꾸기", onSelect: () => { sfxTick(); setTextSheet({ of: "reg", mode: "desc" }); } },
        { key: "category", label: "분류 바꾸기", onSelect: () => { sfxTick(); setTextSheet({ of: "reg", mode: "category" }); } },
        { key: "duplicate", label: "복제", onSelect: () => { sfxTick(); setSheet("duplicate"); } },
        { key: "delete", label: "삭제", danger: true, divider: true, onSelect: () => { sfxTick(); setBatchDelAsk(true); } },
      ]}
    >
      <MenuBtn tone="bar" up label="희귀도" disabled={batchOff} width={168}
        items={RARITIES.map((r) => ({ key: r.v, label: r.l, icon: <RarityDot r={r} />, onSelect: () => { void batchSet({ rarity: r.v }); } }))} />
      <MenuBtn tone="bar" up label="그룹" disabled={batchOff} width={240}
        items={[
          { key: "n:", label: "그룹 없음", onSelect: () => { void batchGroup(""); } },
          ...regGroups.map((g) => ({ key: `g:${g}`, label: g, hint: String(regGroupCount.get(g) || 0), icon: <FolderMark />, onSelect: () => { void batchGroup(g); } })),
          { key: "+new", label: "+ 새 그룹", divider: true, onSelect: () => { sfxTick(); setNewGroupName(""); setSheet("group"); } },
        ]} />
      <MenuBtn tone="bar" up label="표시" disabled={batchOff} width={168}
        items={[
          { key: "on", label: "표시", onSelect: () => { void batchSet({ visible: true }); } },
          { key: "off", label: "숨김", onSelect: () => { void batchSet({ visible: false }); } },
        ]} />
    </BatchBar>
  );
  // 📌 상품 고른 것 아래 띠 — 앞 칸 셋(아이템 띠와 같다), 자주 쓰는 일: 판매 ▾(판매 중 · 숨김 — 바로 · 판매 종료 — 창) · 할인 · 가격(창) · 테마 ▾(바로),
  //    「⋯」: 설명 바꾸기 · 분류 바꾸기(창 — 연결 상품은 연결 아이템을 바꾼다) · 재고(창) · 복제(바로 — 숨김으로) · 삭제(한 번 확인)
  const prodBatchOff = prodBusy || liveLocked;
  const prodShownKeys = shownProducts.map((it) => String(it._id));
  const prodAllPicked = prodShownKeys.length === 0 || (prodSel.size === prodShownKeys.length && prodShownKeys.every((k) => prodSel.has(k)));
  const prodBatchBar = (
    <BatchBar
      count={prodSel.size}
      total={prodShownKeys.length}
      allSelected={prodAllPicked}
      onSelectAll={() => { sfxTick(); prodSel.replace(prodShownKeys); }}
      onClear={() => { sfxTick(); prodSel.clear(); }}
      moreDisabled={prodBatchOff}
      more={[
        { key: "desc", label: "설명 바꾸기", onSelect: () => { sfxTick(); setTextSheet({ of: "product", mode: "desc" }); } },
        { key: "category", label: "분류 바꾸기", onSelect: () => { sfxTick(); setTextSheet({ of: "product", mode: "category" }); } },
        { key: "stock", label: "재고", onSelect: () => { sfxTick(); openProdSheet("stock"); } },
        { key: "duplicate", label: "복제", onSelect: () => { void duplicateProducts(); } },
        { key: "delete", label: "삭제", danger: true, divider: true, onSelect: () => { sfxTick(); setProdDelAsk(true); } },
      ]}
    >
      <MenuBtn tone="bar" up label="판매" disabled={prodBatchOff} width={180}
        items={[
          { key: "on", label: "판매 중", onSelect: () => { void prodBatchSet({ active: true }); } },
          { key: "off", label: "숨김", onSelect: () => { void prodBatchSet({ active: false }); } },
          { key: "saleEnd", label: "판매 종료", divider: true, onSelect: () => { sfxTick(); openProdSheet("saleEnd"); } },
        ]} />
      <BarBtn onClick={() => { sfxTick(); openProdSheet("discount"); }} disabled={prodBatchOff}>할인</BarBtn>
      <BarBtn onClick={() => { sfxTick(); openProdSheet("price"); }} disabled={prodBatchOff}>가격</BarBtn>
      <MenuBtn tone="bar" up label="테마" disabled={prodBatchOff} width={220}
        items={[
          { key: THEME_NONE, label: "테마 없음", onSelect: () => { void prodBatchSet({ theme: "" }); } },
          ...themes.map((t) => ({ key: t.key, label: t.name, hint: t.on ? undefined : "꺼짐", onSelect: () => { void prodBatchSet({ theme: t.key }); } })),
        ]} />
    </BatchBar>
  );

  // 📌 도구 줄(2026-10-17 시안 A ① · B — 탭마다 한 줄): 검색 · 유형 ▾(배너 위치 · 쿠폰 · 주문 상태) · 거르기 | 표 · 카드 · 「⋯」 · 새로 만들기. 켠 거르기는 그 아래 칩 줄(누르면 그것만 끔).
  //    「⋯」 — 덜 쓰는 일(추천 아이템 · 그룹 관리 · 테마 관리 · 아이템 순서대로 맞추기 · 모두 펼치기 · 보이는 열 고르기). 「보이는 열 고르기」를 누르면 그 아래 열 목록(켜고 끄기 · 판은 열린 채)
  //    고르기 단추 폭은 후보 글자 중 가장 긴 것(reserve — 수는 두 자리 이상)을 늘 잡는다 — 고른 값 · 수가 바뀌어도 옆 단추가 밀리지 않는다
  // 검색칸은 남는 폭을 채운다(120 ~ 320) — 붙는 편집기가 열린 좁은 목록(1920 화면 기본 폭)에서도 한 줄에 들게
  const SEARCH_GROW = "sm:!w-auto sm:flex-1 sm:min-w-[120px] sm:max-w-[320px]";
  type PickOpt = { v: string; l: string; n?: number };
  const pickLabel = (k: string, l: string, n?: number) => (
    <>{k ? `${k} · ` : ""}{l}{n != null && <span className="ml-1 text-[#8a8a8a]">{n.toLocaleString()}</span>}</>
  );
  const pickMenu = (k: string, opts: PickOpt[], value: string, onPick: (v: string) => void, active = !!value) => {
    const cur = opts.find((o) => o.v === value) || opts[0];
    return {
      // 고른 값은 이름만(「꾸미기 11」) — 머리말은 전체일 때만. 폭은 그중 가장 긴 것(바꿔도 도구 줄이 밀리지 않게)
      label: cur?.v ? pickLabel("", cur.l, cur.n) : pickLabel(k, cur?.l || "", cur?.n),
      reserve: opts.map((o) => (o.v ? pickLabel("", o.l, o.n == null ? undefined : Math.max(o.n, 99)) : pickLabel(k, o.l, o.n == null ? undefined : Math.max(o.n, 99)))),
      items: opts.map((o): MenuItem => ({ key: o.v || "all", label: o.l, hint: o.n == null ? undefined : o.n.toLocaleString(), on: value === o.v, onSelect: () => { sfxTick(); onPick(o.v); } })),
      active,
    };
  };
  const colsMenu = (cols: { key: string; label: string }[], hidden: string[], toggle: (k: string) => void, show: boolean): MenuItem[] =>
    !show || !colsPickable ? [] : [
      {
        key: "cols", label: "보이는 열 고르기", divider: true, stay: true,
        hint: (
          <svg aria-hidden viewBox="0 0 24 24" className={`w-3 h-3 transition-transform ${colsMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        ),
        onSelect: () => { sfxTick(); setColsMenuOpen((v) => !v); },
      },
      ...(colsMenuOpen ? cols.map((c): MenuItem => ({ key: `col:${c.key}`, label: <span className="pl-3">{c.label}</span>, on: !hidden.includes(c.key), stay: true, onSelect: () => toggle(c.key) })) : []),
    ];
  const regTypeOpts: PickOpt[] = [{ v: "", l: "전체", n: regItems.length }, ...ITEM_TYPE_OPTIONS.map((o) => ({ v: o.v, l: o.l, n: regItems.filter((i) => i.type === o.v).length }))];
  const regMore: MenuItem[] = [
    { key: "preset", label: "추천 아이템", disabled: liveLocked, onSelect: () => { sfxTick(); setPresetOpen(true); } },
    { key: "groups", label: "그룹 관리", disabled: liveLocked, onSelect: () => { sfxTick(); setGroupManageOpen(true); } },
    { key: "fold", label: regAllOpen ? "모두 접기" : "모두 펼치기", divider: true, disabled: !regGrouped || !!qq || regShownGroups.length === 0, onSelect: toggleAllGroups },
    ...colsMenu(REG_OPTIONAL_COLS, regHidden, toggleRegCol, regView === "table"),
  ];
  const prodMore: MenuItem[] = [
    { key: "sync", label: "아이템 순서대로 맞추기", disabled: items.length === 0 || liveLocked || !!savingOrder, onSelect: () => { sfxTick(); setSyncAsk(true); } },
    { key: "themes", label: "테마 관리", disabled: liveLocked, onSelect: () => { sfxTick(); setThemeManageOpen(true); } },
    { key: "fold", label: prodAllOpen ? "모두 접기" : "모두 펼치기", divider: true, disabled: !!qq || prodShownGroups.length === 0, onSelect: toggleAllProductGroups },
    ...colsMenu(PROD_OPTIONAL_COLS, prodHidden, toggleProdCol, prodViewMode !== "card"),
  ];

  return (
    <>
      <AdminPage
        section="ARCTIC"
        // 📌 머리(제목 · 설명)는 탭과 무관하게 고정 — 탭마다 바꾸면 머리 높이가 달라져 탭 줄이 밀린다(메모: tabs-never-move)
        title="상점 관리"
        actions={headerActions}
        tabs={
          <AdminTabs
            tabs={TAB_ORDER.map((t) => (t.id === "orders" ? { ...t, n: pendingCount } : t))}
            current={tab}
            hrefOf={(id) => `/admin/shop?tab=${id}`}
          />
        }
        // 아이템 · 상품 탭 — 고른 게 있을 때 아래 띠(일괄 편집). 고친 게 쌓였으면 그 위에 「저장 안 한 수정」 띠(전체 수정 — 탭을 옮겨도 그대로)
        footer={
          <BarStack>
            <PendingBar count={editJobs.length} names={editNames} onRevert={askRevertEdits} onSaveAll={() => { void saveAllEdits(); }} saving={savingAll} />
            {tab === "items" ? regBatchBar : tab === "products" ? prodBatchBar : null}
          </BarStack>
        }
      >
        {/* ═══ 아이템 등록 ═══ */}
        {tab === "items" && (
          <>
            {/* 📌 도구 줄 한 줄(시안 A ①) — 검색 · 유형 ▾ · 거르기(그룹 · 희귀도 · 효과 종류 · 쓰임 · 인벤토리 · 초안) | 표 · 카드 · 「⋯」(추천 아이템 · 그룹 관리 · 모두 펼치기 · 보이는 열 고르기) · 새로 만들기.
                여러 개를 한 그룹으로는 고르기 칸 + 아래 띠 「그룹」 */}
            <Toolbar
              right={
                <>
                  <ViewToggle value={regView === "card" ? "card" : "table"} onChange={(v) => { sfxTick(); setRegView(v); }} />
                  <MoreMenu align="end" width={240} items={regMore} onOpenChange={(o) => { if (!o) setColsMenuOpen(false); }} />
                  {newBtn(openNewReg, NEW_BTN, liveLocked)}
                </>
              }
            >
              <SearchInput value={q} onChange={setQ} placeholder="이름 · 설명 · 역할 · 그룹" className={SEARCH_GROW} />
              <MenuBtn size="md" width={220} {...pickMenu("유형", regTypeOpts, regType, setRegType)} />
              {/* 거르기 — 켠 수(그룹 포함)는 단추에 · 켠 것은 아래 칩 줄 */}
              <FilterButton count={regFilterN} onClear={() => { sfxTick(); setRegFilters(NO_FILTERS); setRegGroup(GROUP_ALL); }}>
                {/* 그룹 — 하나만(다시 누르면 모든 그룹). 상위 그룹을 고르면 그 상위의 그룹들(머리줄로 묶어 보인다) */}
                <FilterSection label="그룹">
                  {regGroupOptions.filter((o) => o.value !== GROUP_ALL).map((o) => (
                    <ChoiceChip key={o.value} on={regGroupV === o.value} onClick={() => pickRegGroup(o.value)}
                      n={o.value.startsWith("p:") ? regCountBy((it) => parentOfGroup(groupOfItem(it)) === o.value.slice(2)) : Number(o.hint) || 0}>
                      {o.icon}{o.label}
                    </ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="희귀도">
                  {RARITIES.map((r) => (
                    <ChoiceChip key={r.v} on={regFilters.rarity.includes(r.v)} onClick={() => toggleRegFilter("rarity", r.v)} n={regCountBy((it) => normalizeRarity(it.rarity) === r.v)}>
                      <RarityDot r={r} className="w-2 h-2" />{r.l}
                    </ChoiceChip>
                  ))}
                  <ChoiceChip on={regFilters.rarity.includes(RARITY_NONE)} onClick={() => toggleRegFilter("rarity", RARITY_NONE)} n={regCountBy((it) => !normalizeRarity(it.rarity))}>미지정</ChoiceChip>
                </FilterSection>
                <FilterSection label="효과 종류">
                  {KIND_FILTERS.map((k) => (
                    <ChoiceChip key={k.v} on={regFilters.kind.includes(k.v)} onClick={() => toggleRegFilter("kind", k.v)} n={regCountBy((it) => effectKindsOf(it).has(k.v))}>{k.l}</ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="쓰임">
                  {USE_FILTERS.map((u) => (
                    <ChoiceChip key={u.v} on={regFilters.use.includes(u.v)} onClick={() => toggleRegFilter("use", u.v)}
                      n={regCountBy((it) => (u.v === "shop" ? Number(it.usage) > 0 : u.v === "noshop" ? !(Number(it.usage) > 0) : Number(it.passUsage) > 0))}>{u.l}</ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="인벤토리">
                  {VIS_FILTERS.map((v) => (
                    <ChoiceChip key={v.v} on={regFilters.vis.includes(v.v)} onClick={() => toggleRegFilter("vis", v.v)} n={regCountBy((it) => (it.visible === false ? "off" : "on") === v.v)}>{v.l}</ChoiceChip>
                  ))}
                </FilterSection>
                {draft.draftMode && (
                  <FilterSection label="초안">
                    {DRAFT_FILTERS.map((v) => (
                      <ChoiceChip key={v.v} on={regFilters.draft.includes(v.v)} onClick={() => toggleRegFilter("draft", v.v)} n={regCountBy((it) => it._draft === v.v)}>{v.l}</ChoiceChip>
                    ))}
                  </FilterSection>
                )}
              </FilterButton>
            </Toolbar>
            {/* 켠 거르기 · 정렬 칩(누르면 그것만 끔 · 둘 이상이면 「지우기」) */}
            <ActiveFilters items={regActive} onClear={clearRegFilters} />
            {/* 목록 — ↑ ↓ 로 옆 줄(편집기가 열려 있으면 그 줄을 연다) */}
            <div onKeyDown={onRegListKey}>
              {!regLoaded ? (
                <EmptyRow>불러오는 중...</EmptyRow>
              ) : regView === "card" ? (
                <CardGrid
                  items={regSorted}
                  itemKey={(it) => String(it._id)}
                  renderCard={(it) => (
                    <ItemCard it={it} visBusy={visBusy === String(it._id)} locked={liveLocked} onToggleVis={() => toggleRegVisible(it)}
                      draftMark={<>{editedDot("reg", it._id)}{it._draft ? <DraftMark onRevert={() => askRevertRow("item", it, it.name || "이름 없음")} disabled={!!draftBusy} /> : null}</>} />
                  )}
                  onItemClick={openRegRow}
                  selectedKey={pane === "reg" ? itemForm.id : null}
                  {...selProps}
                  groupOf={regGrouped ? regGroupOf : undefined}
                  openGroups={openGroups}
                  onToggleGroup={qq ? undefined : toggleGroup}
                  empty={regItems.length === 0 ? "등록된 아이템이 없습니다." : noResult}
                />
              ) : (
                <DataTable
                  columns={regCols}
                  rows={shownReg}
                  rowKey={(it) => String(it._id)}
                  onRowClick={openRegRow}
                  selectedKey={pane === "reg" ? itemForm.id : null}
                  // 고르기 칸 — 늘 있다(Shift 범위 · 머리 칸 = 지금 거른 줄 전부 · 그룹 머리줄 칸 = 그 그룹 통째로). 고르면 아래 띠
                  {...selProps}
                  // 열 머리 정렬(이름 · 희귀도 · 연결 역할 · 사용 · 인벤토리) — 정렬 중엔 끌어 옮기기가 잠긴다
                  sortState={regSort}
                  onSortChange={(s) => { sfxTick(); setRegSort(s); }}
                  // 순서 — 늘 손잡이로 끌어 놓으면 바로 저장. 머리줄은 덩어리째(saveRegMove), 아이템 줄은 놓은 자리가 곧 그룹(saveRegDrop —
                  //    덩어리 안 = 그 그룹 · 접힌 머리줄 위 = 그 덩어리 끝 · 단위 사이 = 그룹 없음). 한 그룹만 · 그룹 없음만 거른 표는 그 안에서만(saveRegMove)
                  //    고른 줄을 끌면 고른 줄 모두가 한 덩어리로(block — sendRegBlock)
                  onReorder={(keys, _seg, moved, block) => { void saveRegMove(keys, moved, block); }}
                  onRowDrop={(d) => { void saveRegDrop(d); }}
                  reorderLocked={savingOrder === "reg" || liveLocked}
                  // 그룹 머리줄 — 그 그룹 첫 아이템 자리(목록 순서 = 실제 순서). 검색 중엔 맞는 줄이 접힌 머리줄 속에 숨지 않게 모두 펼친 채(누르기 없음)
                  groupOf={regGrouped ? (it) => groupOfItem(it) : undefined}
                  openGroups={openGroups}
                  onToggleGroup={qq ? undefined : toggleGroup}
                  // 상위 머리줄 — 같은 상위의 그룹들 위에 하나(누르면 접고 편다 · 검색 중엔 펼친 채). 상위 하나만 거른 표는 머리줄 없이 그 그룹들
                  sectionOf={regGroupV === GROUP_ALL ? parentOfGroup : undefined}
                  closedSections={closedSections}
                  onToggleSection={qq ? undefined : toggleSection}
                  empty={regItems.length === 0 ? "등록된 아이템이 없습니다." : noResult}
                />
              )}
            </div>

            {/* 📌 편집기 — 1280 이상은 목록 옆에 붙는 칸(폭을 끌어 바꾸고 기억 · 넓히면 두 열), 그 아래는 오른쪽 칸 · 모바일 아래 판.
                ‹ › · Alt+↑ ↓ 이전 · 다음(화면 차례) · Ctrl/⌘+S 저장 · Esc 닫기. 고친 채 넘어가면 한 번 묻는다 */}
            <DetailPane
              shaded
              open={pane === "reg"}
              onClose={closeEditPane}
              width={regPaneW}
              docked
              dockKey="shop-items"
              title={itemForm.id ? "아이템 수정" : "아이템 등록"}
              nav={itemForm.id ? regNav : undefined}
              dirty={regDirty}
              onSave={liveLocked ? undefined : submitRegForm}
              footer={
                <>
                  <Btn className="min-w-[96px]" onClick={submitNearest} disabled={isSavingReg || liveLocked}>{isSavingReg ? "저장 중" : itemForm.id ? "저장" : "등록"}</Btn>
                  {itemForm.id && <Btn variant="secondary" onClick={openRegCopy} disabled={liveLocked}>복제</Btn>}
                  {itemForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "reg", id: itemForm.id })} disabled={liveLocked}>삭제</Btn>}
                </>
              }
            >
              {/* 📌 2026-10-17 shop-tidy — 회색 바탕 위 흰 판 묶음(머리 줄 = 제목 · 지금 값 · 접기). 덜 쓰는 판은 처음 접힘(수정 중 · 이 브라우저에 기억), 새로 만들기는 다 펼침.
                  꾸미기 아이템은 착용 미리보기부터(내 프로필 카드 · 디스코드 /레벨 카드) — 입은 모습을 보고 희귀도를 정한다. 꾸미기 효과는 「기본」 안(그 아이템이 무엇인지) */}
              <form ref={revealInvalid} data-reg-form onSubmit={saveRegItem}>
                <PaneColumns>
                  {() => [
                    <>
                      {regWear && (
                        <PaneSection title="착용 미리보기" summary="내 프로필로" flush>
                          <WearPreview skin={regWear.skin} scene={regWear.scene} frame={regWear.frame} />
                        </PaneSection>
                      )}
                      <PaneSection title="인벤토리 미리보기" summary={itemForm.visible ? "표시" : "숨김"}
                        {...foldOf(!!itemForm.id, regWear ? "shop:item:inv-wear" : "shop:item:inv", !regWear)}>
                        <InventoryItemPreview item={regPreviewItem} effectLines={regEffectLines} />
                      </PaneSection>
                      <PaneSection title="기본" summary={`${shortNameOf(itemForm.name.trim()) || "이름 없음"} · ${regCategory}`} {...foldOf(!!itemForm.id, regWear ? "shop:item:basic-wear" : "shop:item:basic", !regWear)}>
                        <Field label={<>이름<Req /></>}>
                          <input type="text" value={itemForm.name} maxLength={ITEM_NAME_MAX} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="예: 펭귄 칭호" className={inputClass} />
                        </Field>
                        {/* 📌 분류 — 자동(꾸미기 효과 · 유형) · 목록 · 직접 입력. key — 다른 아이템을 열면 직접 입력 칸 상태를 새로 */}
                        <Field label="분류">
                          <CategoryPicker key={itemForm.id || "new"} value={itemForm.category} auto={regCategoryAuto} onChange={(v) => setItemForm((f) => ({ ...f, category: v }))} />
                        </Field>
                        <Field label="설명">
                          {/* 줄바꿈 그대로 저장 · 표시 (인벤토리 · 상품 상세는 whitespace-pre-line) */}
                          <textarea rows={3} value={itemForm.description} maxLength={DESCRIPTION_MAX} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                            placeholder="인벤토리에 보이는 설명" className={`${inputClass} resize-none`} />
                          <p className="mt-1 text-right text-[12px] text-[#8a8a8a] tabular-nums">{itemForm.description.length}/{DESCRIPTION_MAX}</p>
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
                        {/* 꾸미기 — 꾸미기 효과(카드 테두리 · 카드 배경 · 프로필 테두리 …)가 곧 그 아이템이라 기본 판 안에 */}
                        {itemForm.type === "cosmetic" && (
                            <EffectsEditor
                              chatBuffXp={itemForm.chatBuffXp}
                              voiceBuffXp={itemForm.voiceBuffXp}
                              attendBuffXp={itemForm.attendBuffXp}
                              list={itemForm.effects}
                              channels={guildChannels}
                              botCaps={botCaps}
                              // 새 아이템이면 꾸미기 효과에 맞춰 비어 있는 이름 · 아이콘 · 그룹을 채운다(withCosmeticAuto)
                              onChange={(patch) => setItemForm((f) => withCosmeticAuto(f, { ...f, ...patch }))}
                            />
                        )}
                      </PaneSection>
                      {/* 📌 희귀도(2026-10-17) — 인벤토리 칸 · 상세 알약 · 「희귀도순」에 쓰인다(상점 카드에는 안 씀 · 상품 상세 · 봇 /인벤토리 카드는 씀). 늘 펼친 판 */}
                      <PaneSection title="희귀도" summary={regRarityLabel}>
                        <RarityPicker value={itemForm.rarity} onChange={(v) => setItemForm((f) => ({ ...f, rarity: v }))} />
                      </PaneSection>
                    </>,
                    <>
                      {/* ── 효과 — 아이템 자체에 저장, 이 아이템을 인벤토리에 가진 사람에게 적용(디스코드 역할 없어도). 기프트카드는 효과가 없어 숨긴다 · 꾸미기는 기본 판 안 ── */}
                      {itemForm.type !== "physical" && itemForm.type !== "cosmetic" && (
                        <PaneSection title="효과" summary={regFxSummary} {...foldOf(!!itemForm.id, "shop:item:fx", true)}>
                          <EffectsEditor
                            chatBuffXp={itemForm.chatBuffXp}
                            voiceBuffXp={itemForm.voiceBuffXp}
                            attendBuffXp={itemForm.attendBuffXp}
                            list={itemForm.effects}
                            channels={guildChannels}
                            botCaps={botCaps}
                            // 새 아이템이면 꾸미기 효과에 맞춰 비어 있는 이름 · 아이콘 · 그룹을 채운다(withCosmeticAuto)
                            onChange={(patch) => setItemForm((f) => withCosmeticAuto(f, { ...f, ...patch }))}
                          />
                          {/* 📌 2026-10-18 효과 문구 — 자동 줄 · 「직접 쓰기」 · 「자동으로 되돌리기」(역할 버프 줄은 역할 설정 몫이라 따로 아래) */}
                          <EffectTextField className="mt-5" custom={itemForm.effectCustom} text={itemForm.effectText} auto={regFxAuto} onTemplates={openFxTextForItem}
                            onChange={(p) => setItemForm((f) => ({ ...f, ...p }))} />
                          {regRoleBuff.length > 0 && (
                            <div className="mt-5">
                              <div className={labelClass}>역할 버프</div>
                              <div className="flex items-start justify-between gap-3 bg-[#f2f2f2] px-3.5 py-3 text-[13px]">
                                <span className="min-w-0 font-bold text-[#131313] break-keep">{regRoleBuff.map((l) => <span key={l} className="block">{l}</span>)}</span>
                                <Link href="/admin/bot?tab=roles" className="shrink-0 text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313]">레벨 설정 →</Link>
                              </div>
                            </div>
                          )}
                        </PaneSection>
                      )}
                      {/* 📌 꾸미기 유형 — 효과 편집은 기본 판 안이라, 꾸미기 말고 다른 효과(XP 등)가 있거나 직접 쓴 문구가 있을 때만 효과 문구 판 */}
                      {itemForm.type === "cosmetic" && (regFxAuto.length > 0 || itemForm.effectCustom) && (
                        <PaneSection title="효과 문구" summary={regFxLines.length ? `${regFxLines[0]}${regFxLines.length > 1 ? ` 외 ${regFxLines.length - 1}` : ""}` : "없음"} {...foldOf(!!itemForm.id, "shop:item:fxtext", true)}>
                          <EffectTextField custom={itemForm.effectCustom} text={itemForm.effectText} auto={regFxAuto} onTemplates={openFxTextForItem}
                            onChange={(p) => setItemForm((f) => ({ ...f, ...p }))} />
                        </PaneSection>
                      )}
                      {/* 📌 2026-10-18 적용 범위 — 꾸미기 효과(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)가 있는 아이템만(유형과 무관). 자동 = 꾸미기 종류마다 */}
                      {regEffOn && regCosmetic && (
                        <PaneSection title="적용 범위" summary={regScopeLabel} {...foldOf(!!itemForm.id, "shop:item:scope", true)}>
                          <ScopeEditor value={itemForm.scope} auto={regScopeAuto} notes={scopeNotesOf(regFxShape)} onChange={(v) => setItemForm((f) => ({ ...f, scope: v }))} />
                        </PaneSection>
                      )}
                      <PaneSection title="분류 · 표시" {...foldOf(!!itemForm.id, "shop:item:class")}
                        summary={`${normalizeItemGroup(itemForm.group) ? `그룹 ${normalizeItemGroup(itemForm.group)}` : "그룹 없음"} · ${itemForm.visible ? "표시" : "숨김"}${itemForm.boosterPerk && itemForm.type !== "physical" ? " · 부스터 혜택" : ""}${itemForm.type === "role" ? ` · ${itemForm.detachOnSeason ? "시즌에 역할 뗌" : "역할 유지"}` : ""}`}>
                        {/* 그룹 — 상점 관리 목록에서 묶어 보일 이름(관리 화면 정리용 · 인벤토리엔 안 보인다) */}
                        <Field label="그룹">
                          <GroupPicker key={itemForm.id || "new"} value={itemForm.group} groups={regGroups} counts={regGroupCount} onChange={(v) => setItemForm((f) => ({ ...f, group: v }))} />
                        </Field>
                        <Field label="인벤토리 표시">
                          <Toggle on={itemForm.visible} onClick={() => setItemForm({ ...itemForm, visible: !itemForm.visible })} onLabel="표시" offLabel="숨김" />
                        </Field>
                        {/* 📌 2026-10-24 서버 부스터 혜택 — 켜면 부스팅 중인 동안 이 아이템을 가진 것으로 친다(효과 · 꾸미기 그대로, 부스트를 멈추면 빠짐). 숨기면 빠진다. 기프트카드는 없음 */}
                        {itemForm.type !== "physical" && (
                          <Field label="서버 부스터 혜택">
                            <Toggle on={itemForm.boosterPerk} onClick={() => setItemForm({ ...itemForm, boosterPerk: !itemForm.boosterPerk })} onLabel="부스팅 중 자동 보유" offLabel="끔" />
                          </Field>
                        )}
                        {itemForm.type === "role" && (
                          <Field label="시즌 전환">
                            <Toggle on={itemForm.detachOnSeason} onClick={() => setItemForm({ ...itemForm, detachOnSeason: !itemForm.detachOnSeason })}
                              onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                          </Field>
                        )}
                      </PaneSection>
                      <PaneSection title="모양" {...foldOf(!!itemForm.id, "shop:item:look")}
                        summary={`${itemForm.imageUrl.trim() ? "이미지" : itemForm.icon ? "아이콘" : "기본 아이콘"} · ${/^#[0-9a-f]{6}$/i.test(itemForm.color) ? itemForm.color : "유형 기본색"}`}>
                        <Field label="아이콘" hint="이미지가 없을 때 쓰입니다">
                          {/* 📌 key — 칸을 연 채 다른 아이템 줄을 누르면 다시 마운트해 탭이 그 아이템 아이콘의 묶음으로 열리게 */}
                          {/* suggest — 꾸미기 효과(카드 스킨 · 아바타 테두리)에 맞는 아이콘을 먼저 보인다 */}
                          <IconPicker key={itemForm.id || "new"} value={itemForm.icon} onChange={(v) => setItemForm({ ...itemForm, icon: v })} color={itemForm.color || itemTypeColor(itemForm.type)} inputClassName={inputClass}
                            suggest={regArtSuggest} />
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
                      </PaneSection>
                      {/* ── 몸값 참고 — 맨 아래 · 처음 접힘(머리 줄에 센 수) ── */}
                      <WorthRef itemId={String(itemForm.id || "")} group={itemForm.group} type={itemForm.type} regItems={regItems} shops={items} />
                    </>,
                  ]}
                </PaneColumns>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 상품 관리 ═══ */}
        {tab === "products" && (
          <>
            {/* 📌 도구 줄 한 줄(시안 B) — 검색 · 유형 ▾ · 거르기(판매 상태 · 이벤트 테마 · 할인 · 결제 · 연결 — 칩 수는 전체 상품 기준) | 표 · 카드 ·
                「⋯」(아이템 순서대로 맞추기 — 한 번 묻는다 · 테마 관리 · 모두 펼치기 · 보이는 열 고르기) · 새로 만들기 */}
            <Toolbar right={
              <>
                <ViewToggle value={prodViewMode === "card" ? "card" : "table"} onChange={(v) => { sfxTick(); setProdViewMode(v); }} />
                <MoreMenu align="end" width={240} items={prodMore} onOpenChange={(o) => { if (!o) setColsMenuOpen(false); }} />
                {newBtn(openNewProduct, NEW_BTN, liveLocked)}
              </>
            }>
              <SearchInput value={q} onChange={setQ} placeholder="상품명 · 역할 · 테마 · 그룹" className={SEARCH_GROW} />
              <MenuBtn size="md" width={220} {...pickMenu("유형", productTypeOptions, productType, setProductType)} />
              <FilterButton count={prodFilterN} onClear={() => { sfxTick(); setProdFilters(NO_PROD_FILTERS); setProductView(""); }}>
                {/* 판매 상태 — 하나만(다시 누르면 전체) */}
                <FilterSection label="판매 상태">
                  {PROD_STATUS_OPTIONS.map((o) => (
                    <ChoiceChip key={o.v} on={productView === o.v} onClick={() => pickProdStatus(o.v)} n={prodCountBy((it) => prodStatusOf(it) === o.v)}>{o.l}</ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="이벤트 테마">
                  {themes.map((t) => (
                    <ChoiceChip key={t.key} on={prodFilters.theme.includes(t.key)} onClick={() => toggleProdFilter("theme", t.key)} n={prodCountBy((it) => prodThemeOf(it, themeKeys) === t.key)}>{t.name}</ChoiceChip>
                  ))}
                  <ChoiceChip on={prodFilters.theme.includes(THEME_NONE)} onClick={() => toggleProdFilter("theme", THEME_NONE)} n={prodCountBy((it) => prodThemeOf(it, themeKeys) === THEME_NONE)}>테마 없음</ChoiceChip>
                </FilterSection>
                <FilterSection label="할인">
                  {DISC_FILTERS.map((f) => (
                    <ChoiceChip key={f.v} on={prodFilters.disc.includes(f.v)} onClick={() => toggleProdFilter("disc", f.v)} n={prodCountBy((it) => (discountPctOf(it) > 0 ? "on" : "off") === f.v)}>{f.l}</ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="결제">
                  {PAY_FILTERS.map((f) => (
                    <ChoiceChip key={f.v} on={prodFilters.pay.includes(f.v)} onClick={() => toggleProdFilter("pay", f.v)} n={prodCountBy((it) => (it.pointOnly ? "point" : "both") === f.v)}>{f.l}</ChoiceChip>
                  ))}
                </FilterSection>
                <FilterSection label="연결">
                  {SRC_FILTERS.map((f) => (
                    <ChoiceChip key={f.v} on={prodFilters.src.includes(f.v)} onClick={() => toggleProdFilter("src", f.v)} n={prodCountBy((it) => prodSrcOf(it) === f.v)}>{f.l}</ChoiceChip>
                  ))}
                </FilterSection>
              </FilterButton>
            </Toolbar>
            {/* 켠 거르기 · 정렬 칩(누르면 그것만 끔 · 둘 이상이면 「지우기」) */}
            <ActiveFilters items={prodActive} onClear={clearProdFilters} />
            {/* 목록 — ↑ ↓ 로 옆 줄(편집기가 열려 있으면 그 줄을 연다) */}
            <div onKeyDown={onProdListKey}>
              {isLoading ? (
                <EmptyRow>불러오는 중...</EmptyRow>
              ) : prodViewMode === "card" ? (
                <CardGrid
                  items={prodSorted}
                  itemKey={(it) => String(it._id)}
                  renderCard={(it) => (
                    <ProductTile it={it} busy={prodSwitchBusy === String(it._id)} locked={liveLocked} onToggle={() => { void toggleProductActive(it); }}
                      draftMark={<>{editedDot("product", it._id)}{it._draft ? <DraftMark onRevert={() => askRevertRow("shopItem", it, it.name || "이름 없음")} disabled={!!draftBusy} /> : null}</>} />
                  )}
                  onItemClick={openProductRow}
                  selectedKey={pane === "product" ? form.id : null}
                  {...prodSelProps}
                  groupOf={prodGroupOf}
                  openGroups={openProductGroups}
                  onToggleGroup={qq ? undefined : toggleProductGroup}
                  empty={items.length === 0 ? "등록된 상품이 없습니다." : noResult}
                />
              ) : (
                <DataTable
                  columns={prodCols}
                  rows={shownProducts}
                  rowKey={(it) => String(it._id)}
                  onRowClick={openProductRow}
                  selectedKey={pane === "product" ? form.id : null}
                  // 고르기 칸 — 늘 있다(Shift 범위 · 머리 칸 = 지금 거른 줄 전부 · 묶음 머리줄 칸 = 그 묶음 통째로). 고르면 아래 띠
                  {...prodSelProps}
                  // 열 머리 정렬(상품 · 판매 · 가격 · 재고 · 판매 수) — 정렬 중엔 끌어 옮기기가 잠긴다
                  sortState={prodSort}
                  onSortChange={(s) => { sfxTick(); setProdSort(s); }}
                  // 순서 — 늘 손잡이로 끌어 놓으면 바로 저장(거른 목록에서 옮겨도 전체 안의 제자리에). 머리줄은 그룹 덩어리째(saveProductMove),
                  //    상품 줄은 놓은 자리가 곧 그룹(saveProductDrop — 다른 그룹 · 그룹 밖에 놓으면 연결 아이템 그룹이 바뀐다 · 세트 · 직접 설정은 그 그룹 안 · 밖 순서만).
                  //    고른 줄을 끌면 고른 상품 모두가 한 덩어리로(saveProductBlock)
                  onReorder={(keys, seg, moved) => { void saveProductMove(keys, seg, moved); }}
                  onRowDrop={(d) => { void saveProductDrop(d); }}
                  reorderLocked={savingOrder === "product" || liveLocked}
                  // 📌 묶음(B안) — 연결 아이템의 그룹 머리줄 · 상위 머리줄(아이템 목록과 같은 모양). 검색 중엔 모두 펼친 채
                  groupOf={prodGroupOf}
                  openGroups={openProductGroups}
                  onToggleGroup={qq ? undefined : toggleProductGroup}
                  sectionOf={parentOfGroup}
                  closedSections={closedProductSections}
                  onToggleSection={qq ? undefined : toggleProductSection}
                  empty={items.length === 0 ? "등록된 상품이 없습니다." : noResult}
                />
              )}
            </div>

            {/* 📌 편집기 — 1280 이상은 목록 옆에 붙는 칸(폭을 끌어 바꾸고 기억 · 넓히면 두 열: 미리보기 · 기본 정보 | 가격 · 재고 · 판매), 그 아래는 오른쪽 칸 · 모바일 아래 판.
                ‹ › · Alt+↑ ↓ 이전 · 다음(화면 차례) · Ctrl/⌘+S 저장 · Esc 닫기. 고친 채 넘어가면 한 번 묻는다 */}
            <DetailPane
              shaded
              open={pane === "product"}
              onClose={closeEditPane}
              width={regPaneW}
              docked
              dockKey="shop-products"
              title={form.id ? "상품 수정" : "상품 등록"}
              nav={form.id ? prodNav : undefined}
              dirty={prodDirty}
              onSave={liveLocked ? undefined : () => submitVisible("form[data-prod-form]")}
              footer={
                <>
                  <Btn className="min-w-[96px]" onClick={submitNearest} disabled={savingProduct || liveLocked}>{savingProduct ? "저장 중" : form.id ? "저장" : "등록"}</Btn>
                  {form.id && <Btn variant="secondary" onClick={openProductCopy} disabled={liveLocked}>복제</Btn>}
                  {form.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "item", id: form.id })} disabled={liveLocked}>삭제</Btn>}
                </>
              }
            >
              {/* 📌 2026-10-17 shop-tidy — 회색 바탕 위 흰 판 묶음(머리 줄 = 제목 · 지금 값 · 접기). 덜 쓰는 판은 처음 접힘(수정 중 · 이 브라우저에 기억), 새로 만들기는 다 펼침.
                  한 열로 쌓이면 카드 미리보기 · 판매 대상 · (구성) · 가격 · 모양 · 재고 · (시즌 동작) · 판매 상태 차례 */}
              <form ref={revealInvalid} data-prod-form onSubmit={saveItem}>
                <PaneColumns>
                  {() => {
                    const editing = !!form.id;
                    // 머리 줄 값 — 접힌 판도 지금 값이 보이게
                    const priceSum = (() => {
                      const pv = (v: unknown) => Number(v) || 0;
                      const main = form.timed
                        ? [["7일", form.price7], ["30일", form.price30], ...(form.withInf ? [["무제한", form.priceInf]] : [])]
                            .filter(([, v]) => pv(v) > 0).map(([l, v]) => `${l} ${pv(v).toLocaleString()}`).join(" · ")
                        : pv(form.price) > 0 ? pv(form.price).toLocaleString() : "";
                      const mode = !form.timed && form.type !== "physical" && !bundleOn ? SALE_MODES.find((m) => m.v === saleModeOf(form))?.l || "" : "";
                      return [main ? `${main} ${unit}` : "가격 없음", discountPct > 0 ? `${discountPct}% 할인` : "", mode].filter(Boolean).join(" · ");
                    })();
                    const backdropName = (BACKDROP_OF as Record<string, { label?: string } | undefined>)[form.backdrop]?.label || "";
                    const stockN = form.stock === "" ? -1 : Number(form.stock);
                    const untilOf = (s: string) => {
                      const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(s || "");
                      return m ? `~ ${Number(m[1])}. ${Number(m[2])}. ${m[3]}` : "";
                    };
                    const themeName = form.theme ? themeNameOf(themes, form.theme) : "";
                    const linkedGroup = linkedItem ? normalizeItemGroup(groupOfItem(linkedItem)) : "";
                    // 📌 분류(2026-10-17) — 연결 상품은 연결 아이템의 분류(아이템을 따른다 — 고치는 곳은 아이템), 직접 설정 · 세트는 이 폼의 분류 칸
                    const prodCategory = linked
                      ? linkedItem ? categoryOfRow(linkedItem) : resolveCategory({ type: form.type, name: form.name })
                      : resolveCategory({ type: form.type, name: form.name, category: form.category || "" });
                    const prodCategoryAuto = resolveCategory({ type: form.type, name: form.name, category: "" });
                    return [
                    <>
                      {/* 📌 카드 미리보기 — 상점 카드(ProductCard)를 폼 값 그대로(누를 수 없게) */}
                      <PaneSection title="카드 미리보기" summary={prodCategory} flush>
                        <div aria-hidden inert className="bg-[#f2f2f2] p-3 flex justify-center pointer-events-none select-none">
                          <div className="w-[176px]">
                            <ProductCard
                              it={{
                                ...toPayload(form, ""), _id: form.id || "preview", stock: form.stock === "" ? -1 : Number(form.stock) || 0, ...(previewBundleItems ? { bundleItems: previewBundleItems } : {}),
                                // 상점 카드의 분류 글자 · 이름(목록 API categoryLabel · shortName 과 같은 값)
                                categoryLabel: prodCategory, shortName: linked && linkedItem ? shortOfRow(linkedItem) : shortNameOf(form.name),
                              }}
                              href="#" wished={false} onWish={() => {}}
                              overlay={!form.active ? <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">숨김</span> : null}
                            />
                          </div>
                        </div>
                      </PaneSection>
                      {/* ── 판매 대상 ── 직접 설정 | 등록된 아이템 · 연결 아이템 요약 · 그룹(연결 아이템의 그룹) · 직접 설정이면 표기 칸 */}
                      <PaneSection title="판매 대상" summary={bundleOn ? "세트" : linked || linkPick === formKey ? "등록된 아이템" : "직접 설정"}>
                        {/* 📌 직접 설정 | 등록된 아이템 — 아이템을 고르면 표기(이름 · 설명 · 아이콘 · 색상 · 역할 · 시즌 동작)는 아이템이 원천이라
                               잠긴 칸 대신 아이템 요약 한 덩어리로 보인다(고치는 곳은 아이템 등록). 세트는 아이템 하나에 연결하지 않는다(구성 편집) */}
                        {!bundleOn && <div className="mb-4">
                          <Segmented options={SOURCE_OPTIONS} value={linked || linkPick === formKey ? "item" : sourceOf(form)}
                            onChange={(v) => {
                              if (v === "custom") {
                                setLinkPick(null);
                                const sn = customSnap;
                                if (linked) setForm(unlinkItem(form, sn && sn.key === formKey ? sn.snap : null));
                                setCustomSnap(null);
                                return;
                              }
                              if (linked || linkPick === formKey) return; // 이미 그 상태
                              // 아이템은 저절로 고르지 않는다 — 고르기 칸만 연다(이름 · 설명이 미리 채워지지 않게)
                              if (regItems.length) setLinkPick(formKey);
                              else fail("등록된 아이템이 없습니다. 아이템 탭에서 먼저 등록해 주세요.");
                            }} />
                          {(linked || linkPick === formKey) && (
                            <div className="mt-3">
                              <Dropdown
                                theme="light"
                                buttonClassName={DD_BTN}
                                value={form.itemId}
                                onChange={(v) => {
                                  const it = regItems.find((x) => x._id === v);
                                  if (!it) return;
                                  // 직접 설정에서 처음 고를 때 그 값을 잡아 둔다(직접 설정으로 돌아가면 되돌림)
                                  if (!linked && customSnap?.key !== formKey) setCustomSnap({ key: formKey, snap: customSnapOf(form) });
                                  setForm(applyItem(form, it));
                                }}
                                placeholder="아이템을 선택하세요"
                                options={regItems.map((x) => ({
                                  // 짧은 이름 · 분류(같은 이름이 분류만 달라도 가려 보이게)
                                  value: x._id, label: shortOfRow(x), hint: (() => { const k = categoryOfRow(x); const ls = rowEffectLines(x); return ls.length ? `${k} · ${ls[0]}${ls.length > 1 ? ` 외 ${ls.length - 1}` : ""}` : k; })(),
                                  icon: <ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={18} color={x.color || itemTypeColor(x.type)} />,
                                }))}
                              />
                              {/* 📌 연결 아이템 요약 — 그림 · 이름 · 유형 · 희귀도 · 역할 · 효과(인벤토리 · 상세와 같은 문장) · 「아이템 수정 ›」(아이템 탭에서 그 아이템을 연다) */}
                              {linked && (linkedItem ? (
                                <>
                                  <div className="mt-3 flex items-start gap-3 bg-[#f2f2f2] px-3 py-3">
                                    <span className="relative block w-12 h-12 rounded-lg bg-white overflow-hidden shrink-0">
                                      <CardArt it={withCosmeticIcon(linkedItem, linkedItem)} iconSize={26} />
                                    </span>
                                    <span className="block min-w-0 flex-1">
                                      <span className="flex items-center gap-2 min-w-0">
                                        <span className="truncate text-[14px] font-black text-[#131313]" title={linkedItem.name}>{shortOfRow(linkedItem)}</span>
                                        {/* 분류 — 아이템을 따른다(읽기 전용 · 고치는 곳은 「아이템 수정 ›」) */}
                                        <TypeBadge type={linkedItem.type} label={categoryOfRow(linkedItem)} className="shrink-0 px-2 py-0.5 text-[10px]" />
                                        <RarityMark v={linkedItem.rarity} />
                                      </span>
                                      {linkedItem.roleId && <span className="block mt-0.5 text-[12px] text-[#5a5a5a] truncate">역할 · {roleNameOf(linkedItem.roleId, linkedItem.roleName)}</span>}
                                      {(() => {
                                        // 📌 2026-10-18 보일 효과 줄(직접 쓴 문구 > 자동) · 꾸미기는 적용 범위 — 목록 API 가 정한 값(effectLines · scopeLabel), 옛 응답은 여기서 셈
                                        const lines = rowEffectLines(linkedItem);
                                        const scope = rowScopeLabel(linkedItem);
                                        return lines.length || scope ? (
                                          <span className="block mt-1.5">
                                            {scope && <span className="block text-[12px] font-bold text-[#5a5a5a] leading-relaxed break-keep">적용 범위 · {scope}</span>}
                                            {lines.map((l, i) => <span key={i} className="block text-[12px] font-bold text-[#131313] leading-relaxed break-keep">{l}</span>)}
                                          </span>
                                        ) : <span className="block mt-1.5 text-[12px] text-[#a3a3a3]">효과 없음</span>;
                                      })()}
                                    </span>
                                    <Link href={`/admin/shop?tab=items&item=${linkedItem._id}`} className="shrink-0 mt-0.5 text-[12px] font-bold text-[#e91e3f] hover:underline whitespace-nowrap">
                                      <span className="hidden sm:inline">아이템 </span>수정 ›
                                    </Link>
                                  </div>
                                  {/* 📌 그룹(shop-tidy ⑥) — 상품 그룹 = 연결 아이템의 그룹. 고르면 그 아이템의 그룹을 바로 바꾼다(아이템 탭에서도 옮겨진다 · 상품 저장과 따로).
                                         저장된 연결일 때만 — 새 상품 · 저장 전에 다른 아이템을 고른 폼은 숨긴다(고르다 만 아이템의 그룹이 바뀌지 않게) */}
                                  {prodSavedRow && String(prodSavedRow.itemId || "") === String(form.itemId || "") && (
                                  <div className="mt-3 flex items-center gap-3">
                                    <span className="shrink-0 w-10 text-[13px] font-bold text-[#131313]">그룹</span>
                                    <div className="min-w-0 flex-1">
                                      <Dropdown
                                        theme="light"
                                        buttonClassName={DD_BTN}
                                        value={linkedGroup ? `g:${linkedGroup}` : "n:"}
                                        maxHeight={300}
                                        onChange={(v) => { void paneSetProdGroup(String(linkedItem._id), v === "n:" ? "" : v.slice(2)); }}
                                        options={[
                                          { value: "n:", label: "그룹 없음" },
                                          ...(linkedGroup && !regGroups.includes(linkedGroup) ? [linkedGroup] : []).concat(regGroups)
                                            .map((g) => ({ value: `g:${g}`, label: g, hint: String(regGroupCount.get(g) || 0), icon: <FolderMark /> })),
                                        ]}
                                      />
                                    </div>
                                  </div>
                                  )}
                                </>
                              ) : (
                                <p className="mt-2 text-[12px] font-bold text-[#d01634]">등록된 아이템을 찾을 수 없습니다.</p>
                              ))}
                            </div>
                          )}
                        </div>}

                        {/* 직접 설정 상품만 — 표기 칸(연결 상품은 위 요약) */}
                        {!linked && (
                          <>
                            <Field label={<>상품명<Req /></>}>
                              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: [XP] Boost+" className={inputClass} />
                            </Field>
                            {/* 📌 분류 — 아이템 폼과 같은 고르기(자동 = 유형 · 세트). key — 다른 상품을 열면 직접 입력 칸 상태를 새로 */}
                            <Field label="분류">
                              <CategoryPicker key={form.id || "new"} value={form.category || ""} auto={prodCategoryAuto} onChange={(v) => setForm((f) => ({ ...f, category: v }))} />
                            </Field>
                            <Field label={<>상품 유형<Req /></>}>
                              <Segmented options={PRODUCT_TYPE_OPTIONS} value={form.type} onChange={(v) => setForm(pickProductType(form, v))} />
                            </Field>
                            <Field label="상품 설명">
                              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="상점 카드에 표시될 설명" className={`${inputClass} resize-none`} />
                            </Field>
                          </>
                        )}

                        {/* 지급할 역할 — 직접 설정의 역할 · 권한 · 아이템 상품만(다른 폼과 같은 고르기 칸) */}
                        {!linked && (form.type === "role" || form.type === "perk" || form.type === "item") && (
                          <Field label={<>지급할 역할{form.type === "item" ? <Opt /> : <Req />}</>}>
                            <Dropdown
                              theme="light"
                              buttonClassName={DD_BTN}
                              value={form.roleId}
                              onChange={(v) => setForm(pickRole(form, v))}
                              placeholder="역할을 선택하세요"
                              maxHeight={280}
                              options={[...(form.type === "item" ? [{ value: "", label: "역할 없음" }] : []), ...guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))]}
                            />
                          </Field>
                        )}
                      </PaneSection>

                      {/* ── 구성 ── 세트만(lib/bundle.js). 줄마다 기간 · 개수 · 몸값 */}
                      {bundleOn && (
                        <PaneSection title="구성" summary={`${form.bundle.length.toLocaleString()}개`} {...foldOf(editing, "shop:prod:bundle", true)}>
                          {/* 📌 세트 그림 미리보기(2026-10-11 운영자 "구성 칸을 옮길 때 미리 보기가 보여야") — 상점 카드 그림은 구성 차례로 그려진다. 줄을 끌거나 더하면 바로 바뀐다 */}
                          <div className="mb-4 flex justify-center">
                            <span className="relative block w-[160px] aspect-square rounded-2xl overflow-hidden border border-[#ededed] bg-white">
                              <StoreCardArt stage it={{
                                type: "bundle", color: form.color, imageUrl: form.imageUrl, backdrop: form.backdrop, icon: form.icon, setArt: form.setArt,
                                bundleItems: form.bundle.map((r) => {
                                  const ri = regItems.find((x) => String(x._id) === String(r.itemId));
                                  return ri ? { itemId: String(ri._id), name: ri.name, icon: ri.icon, imageUrl: ri.imageUrl, color: ri.color, type: ri.type, ...cosmeticKeysProp(ri) } : null;
                                }).filter(Boolean),
                              }} />
                            </span>
                          </div>
                          {/* 📌 그림 모양 — 겹친 카드(기본) · 구성 합치기(예전 방식 — 운영자 "지금 있는 방식도 같이 남기라") */}
                          <div className="mb-4 flex justify-center">
                            <Segmented options={[{ v: "", l: "겹친 카드" }, { v: "combo", l: "구성 합치기" }]} value={form.setArt === "combo" ? "combo" : ""}
                              onChange={(v) => setForm((f) => ({ ...f, setArt: v }))} />
                          </div>
                          <div className="mb-4">
                            <BundleEditor rows={form.bundle} regItems={regItems} shops={items} onChange={(rows) => setForm((f) => ({ ...f, bundle: rows }))} />
                            {/* 몸값을 일부만 적으면 저장이 막힌다(productForm bundleError — 저장 API 와 같은 문구) */}
                            {bundleBlankValues(form) > 0 && <p className="mt-2 text-[12px] font-bold text-[#d01634] break-keep">{BUNDLE_VALUE_ERROR}</p>}
                          </div>
                        </PaneSection>
                      )}
                    </>,
                    <>
                      {/* ── 가격 ── 결제 · 판매 방식 · 정가(기간별) · 할인 */}
                      <PaneSection title="가격" summary={priceSum} {...foldOf(editing, "shop:prod:price", true)}>
                        {/* 📌 빙옥 전용 — 켜면 가격 칸은 빙옥으로 받고 ×10,000 해 XP 로 저장한다. 새 기프트카드는 켜진 채로 시작한다 */}
                        <div className="mb-4">
                          <Toggle on={!!form.pointOnly} onClick={() => setForm(setPointOnly(form, !form.pointOnly))}
                            onLabel="빙옥 전용" offLabel="XP · 빙옥 결제" />
                        </div>
                        {/* 📌 판매 방식 — 무제한 · 기간제 · 기간제 + 무제한 · 1개 단위(수량 판매, lib/unitSale.js). 역할·권한·아이템·꾸미기만 (기프트카드는 기간 · 수량 개념이 없다).
                               고른 방식의 가격 칸만 아래에 나온다. 1개 단위는 역할 없는 아이템 · 꾸미기만 — 못 고르는 상품이면 칸은 그대로 두고 누르면 알린다(칸 수가 바뀌어 줄이 흔들리지 않게) */}
                        {form.type !== "physical" && !bundleOn && (
                          <div className="mb-4">
                            <Segmented options={SALE_MODES} value={saleModeOf(form)} disabledValues={unitSaleOk(form) ? undefined : ["unit"]}
                              onChange={(v) => {
                                if (v === "unit" && !unitSaleOk(form)) return fail("1개 단위 판매는 역할이 없는 아이템 · 꾸미기만 할 수 있습니다.");
                                setForm(setSaleMode(form, v as SaleMode));
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
                        {/* 📌 세트 — 구성 몸값 합(정가 합)과 세트 판매가를 나란히. 몇 % 싼지는 XP 로 견준다(빙옥 전용은 1 빙옥 = 10,000 XP) */}
                        {bundleOn && bundleSum > 0 && (
                          <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 bg-[#f2f2f2] px-3 py-2.5 text-[13px] text-[#5a5a5a] tabular-nums">
                            <span>정가 합 <span className="font-bold text-[#131313]">{bundleSum.toLocaleString()} XP</span></span>
                            {salePreview > 0 && (
                              <>
                                <span className="text-[#a3a3a3]">·</span>
                                <span>세트 <span className="font-bold text-[#131313]">{salePreview.toLocaleString()} {unit}</span></span>
                                {bundlePct > 0 && <span className="font-black text-[#e91e3f]">{bundlePct}% 싸게</span>}
                              </>
                            )}
                          </div>
                        )}
                      </PaneSection>

                      {/* ── 모양 ── 상품 이미지 · 배경은 상품 고유 값(아이템을 연동해도 따로) · 아이콘 · 색상은 직접 설정만 */}
                      <PaneSection title="모양" {...foldOf(editing, "shop:prod:look")}
                        summary={`${backdropName ? `배경 · ${backdropName}` : "배경 없음"}${form.imageUrl.trim() ? " · 이미지" : ""}`}>
                        <Field label="상품 이미지 URL" hint="비우면 아이템 이미지·아이콘">
                          <input type="text" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                            placeholder="https://..." className={inputClass} />
                        </Field>

                        {!linked && (
                          <>
                            <Field label="아이콘" hint="이미지가 없을 때 카드에 크게">
                              <IconPicker key={`${form.id || "new"}:${form.itemId}`} value={form.icon} onChange={(v) => setForm({ ...form, icon: v })}
                                color={form.color || itemTypeColor(form.type)} inputClassName={inputClass} />
                            </Field>
                            <Field label="색상" hint="비우면 유형 기본색">
                              <div className="flex items-center gap-2">
                                <input type="color" value={form.color || itemTypeColor(form.type)} onChange={(e) => setForm({ ...form, color: e.target.value })}
                                  className="w-10 h-10 shrink-0 rounded-lg border border-[#a3a3a3] bg-white p-1" />
                                <input type="text" value={form.color} maxLength={7} onChange={(e) => setForm({ ...form, color: e.target.value })}
                                  placeholder={itemTypeColor(form.type)} className={inputClass} />
                              </div>
                            </Field>
                          </>
                        )}

                        {/* 📌 카드 배경 장면(lib/itemBackdrops.js) — 상품 고유 값이라 아이템을 연동해도 고른다. 이미지가 있으면 장면 위에 이미지를 세운다 */}
                        <Field label="배경">
                          <BackdropPicker value={form.backdrop} onChange={(v) => setForm({ ...form, backdrop: v })}
                            color={form.color || itemTypeColor(form.type)} buttonClassName={inputClass} />
                        </Field>
                      </PaneSection>

                      {/* ── 재고 ── 순서는 목록에서 손잡이로 끌어서 정한다 */}
                      <PaneSection title="재고" {...foldOf(editing, "shop:prod:stock")}
                        summary={`${stockN < 0 || !Number.isFinite(stockN) ? "무제한" : `${stockN.toLocaleString()}개`}${form.unitSale && Number(form.maxPerOrder) > 0 ? ` · 1회 최대 ${Number(form.maxPerOrder).toLocaleString()}` : ""}`}>
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

                      {/* ── 시즌 동작 ── 직접 설정의 역할 · 권한 · 아이템 상품만(연결 상품은 아이템 설정을 따른다 · 기프트카드 · 꾸미기 · 세트는 뗄 역할이 없다) */}
                      {!linked && form.type !== "physical" && form.type !== "cosmetic" && !bundleOn && (
                        <PaneSection title="시즌 동작" {...foldOf(editing, "shop:prod:season")}
                          summary={form.type !== "perk" && form.detachOnSeason ? "시즌에 역할 뗌" : "역할 유지"}>
                          {/* 시즌 전환 때 디스코드 역할만 떼고 사이트 인벤토리에는 남긴다 */}
                          <div className="mb-4">
                            <Toggle disabled={form.type === "perk"} on={form.type !== "perk" && form.detachOnSeason} onClick={() => setForm({ ...form, detachOnSeason: !form.detachOnSeason })}
                              onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                          </div>
                        </PaneSection>
                      )}

                      {/* 📌 판매 상태 — 마지막 판(판매 중 · 판매 종료 · 이벤트 테마) */}
                      <PaneSection title="판매 상태" {...foldOf(editing, "shop:prod:sale")}
                        summary={[form.active ? "판매 중" : "숨김", untilOf(form.saleUntil) || "종료 없음", themeName].filter(Boolean).join(" · ")}>
                        <div className="mb-4">
                          <Toggle on={form.active} onClick={() => setForm({ ...form, active: !form.active })} onLabel="판매 중" offLabel="숨김" />
                        </div>
                        {/* 📌 판매 종료 — 그 시각(KST)이 지나면 상점에서 빠지고 구매가 막힌다(할인 종료와 같은 칸). 비우면 계속 */}
                        <Field label="판매 종료" hint={form.saleUntil && new Date(`${form.saleUntil}:00+09:00`).getTime() <= Date.now() ? <span className="font-bold text-[#d01634]">이미 지난 시각입니다</span> : "비우면 계속"}>
                          <div className="flex items-center gap-2">
                            <input type="datetime-local" value={form.saleUntil} onChange={(e) => setForm({ ...form, saleUntil: e.target.value })} className={inputClass} />
                            {form.saleUntil && <Btn variant="ghost" size="sm" onClick={() => setForm({ ...form, saleUntil: "" })}>지우기</Btn>}
                          </div>
                        </Field>
                        {/* 📌 이벤트 테마 — 고른 테마의 ARCTIC 탭에 모인다(ShopItem.theme · 보기는 lib/shopThemes themePickOptions).
                            꺼진 테마도 고를 수 있다(「꺼짐」 — 켜면 그때 탭에 선다). 테마는 「테마 관리」에서 */}
                        <Field label="이벤트 테마">
                          <Dropdown theme="light" buttonClassName={DD_BTN}
                            value={form.theme} options={themePickOptions(themes, form.theme)} onChange={(v) => setForm({ ...form, theme: v })} maxHeight={240} />
                        </Field>
                      </PaneSection>
                    </>,
                    ];
                  }}
                </PaneColumns>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 이미지 배너 ═══ */}
        {tab === "banners" && (
          <>
            {/* 📌 도구 줄 한 줄 — 검색 · 위치 ▾ · 거르기(노출) | 표 · 카드(그림 격자 — 끌어서 차례 바꾸기는 표에서) · 새로 만들기
                위치 — 홈(ARCTIC 홈 맨 위) · 시즌 탭 · 테마마다 「<이름> 탭」(스토어 그 탭 맨 위). 목록 차례 = 그 위치의 노출 차례 */}
            <Toolbar right={
              <>
                <ViewToggle value={bannerViewMode === "card" ? "card" : "table"} onChange={(v) => { sfxTick(); setBannerViewMode(v); }} />
                {newBtn(openNewBanner, NEW_BTN, liveLocked)}
              </>
            }>
              <SearchInput value={q} onChange={setQ} placeholder="제목 · 부제 · 링크" className={SEARCH_GROW} />
              <MenuBtn size="md" width={240} {...pickMenu("위치", placeTabs.map((p) => ({ v: p.v, l: p.l, n: bannersAt(p.v).length })), placeNow, setBannerPlace, false)} />
              <FilterButton count={bannerView ? 1 : 0} onClear={() => { sfxTick(); setBannerView(""); }}>
                <FilterSection label="노출">
                  {BANNER_VIS.map((o) => (
                    <ChoiceChip key={o.v} on={bannerView === o.v} onClick={() => { sfxTick(); setBannerView(bannerView === o.v ? "" : o.v); }}
                      n={placeBanners.filter((b) => (o.v === "on" ? !!b.active : !b.active)).length}>{o.l}</ChoiceChip>
                  ))}
                </FilterSection>
              </FilterButton>
            </Toolbar>
            <ActiveFilters items={bannerView ? [{ key: "v", label: `노출 · ${labelOf(BANNER_VIS, bannerView)}`, onRemove: () => { sfxTick(); setBannerView(""); } }] : []} />
            <div onKeyDown={onBannerListKey}>
              {isLoading ? (
                <EmptyRow>불러오는 중...</EmptyRow>
              ) : bannerViewMode === "card" ? (
                <CardGrid
                  items={shownBanners}
                  itemKey={(b) => String(b._id)}
                  renderCard={(b) => (
                    <BannerTile b={b} busy={bannerSwitchBusy === String(b._id)} locked={liveLocked} onToggle={() => { void toggleBannerActive(b); }}
                      draftMark={<>{editedDot("banner", b._id)}{b._draft ? <DraftMark onRevert={() => askRevertRow("banner", b, String(b.title || "").trim() || "제목 없는 배너")} disabled={!!draftBusy} /> : null}</>} />
                  )}
                  onItemClick={openBannerRow}
                  selectedKey={pane === "banner" ? bannerForm.id : null}
                  empty={placeBanners.length === 0 ? (placeNow === BUILTIN_BANNER_THEME ? hwDefaultRow : "등록된 배너가 없습니다.") : noResult}
                  min={240}
                  max={360}
                />
              ) : (
                <DataTable
                  columns={bannerCols}
                  rows={shownBanners}
                  rowKey={(b) => String(b._id)}
                  onRowClick={openBannerRow}
                  // 순서 — 손잡이로 끌어 놓으면 바로 저장(그 위치 안에서). 숨긴 배너도 자리는 지킨다(켜면 그 자리에서 나온다)
                  onReorder={(keys) => { void saveBannerOrder(keys); }}
                  reorderLocked={savingOrder === "banner" || liveLocked || placeNow === GONE_PLACE}
                  selectedKey={pane === "banner" ? bannerForm.id : null}
                  empty={placeBanners.length === 0 ? (placeNow === BUILTIN_BANNER_THEME ? hwDefaultRow : "등록된 배너가 없습니다.") : noResult}
                />
              )}
            </div>
            {/* 등록 안 된 기본 배너 — 목록이 있을 때는 목록 아래(스토어에서 등록된 배너 뒤에 도는 차례 그대로). 숨김 보기 · 검색 중엔 안 보인다 */}
            {!isLoading && placeNow === BUILTIN_BANNER_THEME && placeBanners.length > 0 && hwPending.length > 0 && bannerView !== "off" && !q.trim() && (
              <div className="mt-4 py-5 border-t border-[#ededed]">{hwDefaultRow}</div>
            )}

            <DetailPane
              shaded
              open={pane === "banner"}
              onClose={closeEditPane}
              width={paneXl ? 640 : 520}
              docked
              dockKey="shop-banners"
              title={bannerForm.id ? "배너 수정" : "배너 등록"}
              nav={bannerForm.id ? bannerNav : undefined}
              dirty={banDirty}
              onSave={liveLocked ? undefined : () => submitVisible("form[data-banner-form]")}
              footer={
                <>
                  <Btn className="min-w-[96px]" onClick={submitNearest} disabled={savingBanner || liveLocked}>{savingBanner ? "저장 중" : bannerForm.id ? "저장" : "등록"}</Btn>
                  {bannerForm.id && <Btn variant="secondary" onClick={openBannerCopy} disabled={liveLocked}>복제</Btn>}
                  {bannerForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "banner", id: bannerForm.id })} disabled={liveLocked}>삭제</Btn>}
                </>
              }
            >
              {/* 📌 2026-10-17 shop-tidy — 회색 바탕 위 흰 판 묶음(미리보기 · 노출 · 이미지 · 문구 · 이동). 머리 줄에 지금 값 · 덜 쓰는 판은 수정 중 처음 접힘 */}
              <form ref={revealInvalid} data-banner-form onSubmit={saveBanner}>
                {/* 미리보기 — 이미지를 넣으면 맨 위에(PC · 모바일) */}
                {(bannerForm.imageUrl || bannerForm.mobileImageUrl) && (
                  <PaneSection title="미리보기" summary={[bannerForm.imageUrl ? "PC" : "", bannerForm.mobileImageUrl ? "모바일" : ""].filter(Boolean).join(" · ")}>
                    {bannerForm.imageUrl && (
                      <Field label="PC">
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
                      <Field label="모바일">
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
                  </PaneSection>
                )}

                {/* ── 노출 ── 위치 · 상태(노출 순서는 목록에서 끌어서 — 위치 탭마다) */}
                <PaneSection title="노출" summary={`${bannerPlaces.find((p) => p.v === bannerForm.placement)?.l || "위치 없음"} · ${bannerForm.active ? "노출 중" : "숨김"}`}>
                  {/* 📌 노출 위치 — 홈: ARCTIC 홈 맨 위 · 시즌 탭 · 테마 탭: 스토어 그 탭 맨 위. 같은 위치의 배너끼리 한 슬라이드로 돈다(권장 크기는 모두 같다).
                      지운 테마의 배너는 아무 칸도 안 골라진 채 열린다 — 위치를 골라야 저장된다(서버가 지운 테마를 막는다) */}
                  <Field label="노출 위치">
                    <Segmented options={bannerPlaces.map((p) => ({ v: p.v, l: p.l }))} value={bannerForm.placement}
                      onChange={(v) => setBannerForm({ ...bannerForm, placement: v })} />
                  </Field>
                  <Field label="노출 상태">
                    <Toggle on={bannerForm.active} onClick={() => setBannerForm({ ...bannerForm, active: !bannerForm.active })}
                      onLabel="노출 중" offLabel="숨김" />
                  </Field>
                </PaneSection>

                {/* ── 이미지 ── PC(필수) · 모바일 */}
                <PaneSection title="이미지" {...foldOf(!!bannerForm.id, "shop:banner:img", true)}
                  summary={[bannerForm.imageUrl ? "PC" : "", bannerForm.mobileImageUrl ? "모바일" : ""].filter(Boolean).join(" · ") || "없음"}>
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
                </PaneSection>

                {/* ── 문구 ── 제목 · 부제(어떻게 얹히는지는 위 미리보기가 그대로 보여 준다) */}
                <PaneSection title="문구" summary={bannerForm.title.trim() || "없음"} {...foldOf(!!bannerForm.id, "shop:banner:text", true)}>
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
                </PaneSection>

                {/* ── 이동 ── 누르면 갈 곳 */}
                <PaneSection title="이동" summary={bannerForm.link.trim() || "없음"} {...foldOf(!!bannerForm.id, "shop:banner:link")}>
                  <Field label={<>클릭 시 이동<Opt /></>}>
                    {/* 바로 고르기 — 고르면 아래 칸이 그 주소로 채워진다. 목록에 없는 주소면 "직접 입력" */}
                    <Dropdown
                      theme="light"
                      buttonClassName={DD_BTN}
                      value={!bannerForm.link ? "" : bannerLinkOptions(items, themes).some((o) => !o.group && o.value === bannerForm.link) ? bannerForm.link : BANNER_LINK_CUSTOM}
                      onChange={(v) => { if (v !== BANNER_LINK_CUSTOM) setBannerForm({ ...bannerForm, link: v }); }}
                      options={bannerLinkOptions(items, themes)}
                      maxHeight={320}
                    />
                    <input type="text" value={bannerForm.link} onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                      placeholder="/arctic?type=cosmetic 또는 https://…" className={`${inputClass} mt-2`} />
                  </Field>
                </PaneSection>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 쿠폰 관리 ═══ */}
        {tab === "coupons" && (
          <>
            {/* 📌 도구 줄 한 줄 — 검색 · 상태 ▾ | 새로 만들기 */}
            <Toolbar right={newBtn(openNewCoupon, NEW_BTN)}>
              <SearchInput value={q} onChange={setQ} placeholder="코드 · 이름" className={SEARCH_GROW} />
              <MenuBtn size="md" width={200}
                {...pickMenu("상태", [{ v: "", l: "전체", n: coupons.length }, ...COUPON_STATES.map((s) => ({ v: s, l: s, n: coupons.filter((c) => couponState(c) === s).length }))], couponView, setCouponView)} />
            </Toolbar>
            <ActiveFilters items={couponActive} />
            <div onKeyDown={onCouponListKey}>
              {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
                <DataTable
                  columns={couponCols}
                  rows={shownCoupons}
                  rowKey={(c) => String(c._id)}
                  onRowClick={openCouponRow}
                  selectedKey={pane === "coupon" ? couponForm.id : null}
                  // 열 머리 정렬(사용 · 코드 · 사용 수 · 만료)
                  sortState={couponSort}
                  onSortChange={(s) => { sfxTick(); setCouponSort(s); }}
                  empty={coupons.length === 0 ? "발급된 쿠폰이 없습니다." : noResult}
                />
              )}
            </div>

            <DetailPane
              shaded
              open={pane === "coupon"}
              onClose={closeEditPane}
              width={paneXl ? 640 : 520}
              docked
              dockKey="shop-coupons"
              title={couponForm.id ? "쿠폰 수정" : "쿠폰 발급"}
              nav={couponForm.id ? couponNav : undefined}
              dirty={coupDirty}
              onSave={() => submitVisible("form[data-coupon-form]")}
              footer={
                <>
                  <Btn className="min-w-[96px] tabular-nums" onClick={submitNearest} disabled={couponSaving}>
                    {couponSaving ? "저장 중" : couponForm.id ? "저장" : couponBulk.on ? `${Math.max(0, Math.floor(Number(couponBulk.count) || 0)).toLocaleString()}장 발급` : "발급"}
                  </Btn>
                  {couponForm.id && <Btn variant="secondary" onClick={openCouponCopy}>복제</Btn>}
                  {couponSel && couponSel.kind !== "reward" && (
                    <Btn variant="secondary" onClick={() => { setIssueTarget(couponSel); setIssueInput(""); }}>지급</Btn>
                  )}
                  {couponForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "coupon", id: couponForm.id })}>삭제</Btn>}
                </>
              }
            >
              {/* 📌 2026-10-17 shop-tidy — 회색 바탕 위 흰 판 묶음(쿠폰 · 보상 | 할인 · 한도 · 상태). 머리 줄에 지금 값 · 한도 · 상태는 수정 중 처음 접힘 */}
              <form ref={revealInvalid} data-coupon-form onSubmit={saveCoupon}>
                <PaneSection title="쿠폰"
                  summary={!couponForm.id && couponBulk.on
                    ? `${Math.max(0, Math.floor(Number(couponBulk.count) || 0)).toLocaleString()}장${couponBulk.prefix.trim() ? ` · ${couponBulk.prefix.trim().toUpperCase()}` : ""}`
                    : `${couponForm.code.trim() || "코드 없음"} · ${COUPON_KINDS.find((o) => o.v === (couponForm.kind || "discount"))?.l || ""}`}>
                  {/* 📌 새 쿠폰 — 한 장(코드 직접) · 여러 장(앞머리 + 장수 + 무작위 글자 수 — 같은 혜택 · 한도 · 만료로 N장, 만든 코드는 복사 · CSV) */}
                  {!couponForm.id && (
                    <div className="mb-4">
                      <Segmented options={[{ v: "one", l: "한 장" }, { v: "bulk", l: "여러 장" }]} value={couponBulk.on ? "bulk" : "one"}
                        onChange={(v) => { sfxTick(); setCouponBulk((b) => ({ ...b, on: v === "bulk" })); }} />
                    </div>
                  )}
                  {!couponForm.id && couponBulk.on ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-3">
                        <Field label="코드 앞머리" hint={`${couponBulk.prefix.trim().toUpperCase().replace(/\s+/g, "")}${"X".repeat(Math.min(16, Math.max(0, Math.floor(Number(couponBulk.length) || 0))))}`}>
                          <input type="text" value={couponBulk.prefix} maxLength={20} onChange={(e) => setCouponBulk((b) => ({ ...b, prefix: e.target.value.toUpperCase() }))}
                            placeholder="예: HW-" className={`${inputClass} uppercase`} />
                        </Field>
                        <Field label="장수">
                          <input type="number" min={2} max={BULK_COUNT_MAX} step={1} value={couponBulk.count} onChange={(e) => setCouponBulk((b) => ({ ...b, count: e.target.value }))} className={inputClass} />
                        </Field>
                        <Field label="무작위 글자 수">
                          <input type="number" min={4} max={16} step={1} value={couponBulk.length} onChange={(e) => setCouponBulk((b) => ({ ...b, length: e.target.value }))} className={inputClass} />
                        </Field>
                      </div>
                      <Field label="쿠폰 이름" hint="주문서에 표시될 이름">
                        <input type="text" value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })}
                          placeholder="예: 신규 가입 축하 쿠폰" className={inputClass} />
                      </Field>
                    </>
                  ) : (
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
                  )}

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
                  <PaneSection title="보상" {...foldOf(!!couponForm.id, "shop:coupon:reward", true)}
                    summary={[couponForm.rewardRoleId ? couponForm.rewardRoleName || guildRoles.find((r) => r.id === couponForm.rewardRoleId)?.name || "역할" : "", Number(couponForm.rewardXp) > 0 ? `${Number(couponForm.rewardXp).toLocaleString()} XP` : ""].filter(Boolean).join(" · ") || "없음"}>
                    <Field label="안내 문구" hint="유저가 쿠폰을 쓴 직후 보게 될 문구">
                      <input type="text" value={couponForm.reward || ""} onChange={(e) => setCouponForm({ ...couponForm, reward: e.target.value })}
                        placeholder="예: 시즌 참가 보상이 지급되었습니다" className={inputClass} />
                    </Field>
                    <Two>
                      {/* 역할 고르기 — 다른 폼과 같은 고르기 칸(Dropdown) */}
                      <Field label="지급할 역할">
                        <Dropdown theme="light" buttonClassName={DD_BTN} value={couponForm.rewardRoleId || ""} maxHeight={280}
                          onChange={(v) => setCouponForm({ ...couponForm, rewardRoleId: v, rewardRoleName: guildRoles.find((r) => r.id === v)?.name || "" })}
                          options={[{ value: "", label: "지급 안 함" }, ...guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))]} />
                      </Field>
                      <Field label="지급할 XP" hint="역할·XP 중 하나는 지정해야 합니다">
                        <input type="number" min={0} value={couponForm.rewardXp || ""} onChange={(e) => setCouponForm({ ...couponForm, rewardXp: e.target.value })}
                          placeholder="0" className={inputClass} />
                      </Field>
                    </Two>
                    <Field label="사용 조건 역할" hint="지정하면 해당 역할 보유자만 사용할 수 있습니다">
                      <Dropdown theme="light" buttonClassName={DD_BTN} value={couponForm.requiredRoleId || ""} maxHeight={280}
                        onChange={(v) => setCouponForm({ ...couponForm, requiredRoleId: v, requiredRoleName: guildRoles.find((r) => r.id === v)?.name || "" })}
                        options={[{ value: "", label: "제한 없음" }, ...guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))]} />
                    </Field>
                  </PaneSection>
                ) : (
                  /* ── 할인형 설정 ── */
                  <PaneSection title="할인" {...foldOf(!!couponForm.id, "shop:coupon:disc", true)}
                    summary={[
                      couponForm.type === "percent"
                        ? `${Number(couponForm.value) || 0}%${Number(couponForm.maxDiscount) > 0 ? ` · 최대 ${Number(couponForm.maxDiscount).toLocaleString()} XP` : ""}`
                        : `${(Number(couponForm.value) || 0).toLocaleString()} XP`,
                      COUPON_SCOPES.find((s) => s.v === (couponForm.payScope || "both"))?.l || "",
                    ].filter(Boolean).join(" · ")}>
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

                <PaneSection title="한도 · 상태" {...foldOf(!!couponForm.id, "shop:coupon:limit")}
                  summary={[
                    couponForm.active ? "사용 가능" : "사용 중지",
                    Number(couponForm.maxUses) > 0 ? `${Number(couponForm.maxUses).toLocaleString()}회` : "",
                    (() => { const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(couponForm.expiresAt || ""); return m ? `~ ${Number(m[1])}. ${Number(m[2])}. ${m[3]}` : "무기한"; })(),
                  ].filter(Boolean).join(" · ")}>
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
            {/* 📌 도구 줄 한 줄 — 검색 · 상태 ▾ · 기간 ▾(오늘 · 7일 · 30일 · 전체 · 직접) · 거르기(상품 유형) | CSV(지금 거른 주문).
                「직접」 날짜 두 칸은 도구 줄 아래 줄에(도구 줄 단추가 밀리지 않게) */}
            <Toolbar right={<Btn variant="secondary" onClick={exportOrders} disabled={isLoading || !shownOrders.length}>CSV</Btn>}>
              <SearchInput value={q} onChange={setQ} placeholder="상품 · 구매자 · 메모" className={SEARCH_GROW} />
              <MenuBtn size="md" width={200}
                {...pickMenu("상태", [
                  { v: "", l: "전체", n: groupOrderRows(viewOrders).length },
                  { v: "pending", l: "대기", n: groupCount("pending") },
                  { v: "completed", l: "완료", n: groupCount("completed") },
                  { v: "cancelled", l: "취소", n: groupCount("cancelled") },
                  { v: "refunded", l: "환불", n: groupCount("refunded") },
                  { v: "expired", l: "만료", n: groupCount("expired") },
                ], orderFilter, setOrderFilter)} />
              <MenuBtn size="md" width={180} active={orderPeriod.v !== "all"}
                label={pickLabel("기간", labelOf(ORDER_PERIODS, orderPeriod.v))}
                reserve={ORDER_PERIODS.map((o) => pickLabel("기간", o.l))}
                items={ORDER_PERIODS.map((o) => ({ key: o.v, label: o.l, on: orderPeriod.v === o.v, onSelect: () => pickOrderPeriod(o.v) }))} />
              <FilterButton count={orderTypes.length} onClear={() => { sfxTick(); setOrderTypes([]); }}>
                <FilterSection label="상품 유형">
                  {ORDER_TYPE_FILTERS.map((t) => (
                    <ChoiceChip key={t.v} on={orderTypes.includes(t.v)} onClick={() => toggleOrderType(t.v)} n={groupOrderRows(orders.filter((o) => orderTypeOf(o) === t.v)).length}>{t.l}</ChoiceChip>
                  ))}
                </FilterSection>
              </FilterButton>
            </Toolbar>
            {orderPeriod.v === "custom" && (
              <div className="flex items-center gap-2 mb-4 max-w-full sm:max-w-[420px]">
                <input type="date" aria-label="시작일" value={orderFrom} max={orderTo || undefined} onChange={(e) => setOrderFrom(e.target.value)} className={`${inputClass} !w-auto min-w-0 flex-1`} />
                <span aria-hidden className="text-[#8a8a8a]">~</span>
                <input type="date" aria-label="종료일" value={orderTo} min={orderFrom || undefined} onChange={(e) => setOrderTo(e.target.value)} className={`${inputClass} !w-auto min-w-0 flex-1`} />
              </div>
            )}
            <ActiveFilters
              items={orderTypes.map((v) => ({ key: v, label: `유형 · ${labelOf(ORDER_TYPE_FILTERS, v)}`, onRemove: () => toggleOrderType(v) }))}
              onClear={() => { sfxTick(); setOrderTypes([]); }}
            />
            <div onKeyDown={onOrderListKey}>
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
            </div>
            {/* 📌 더 보기 — 2026-10-04 추천대로: 오래된 주문도 이 목록에서 찾아 환불할 수 있게(한 번에 500건) */}
            {!isLoading && ordersNext && (
              <div className="mt-4 flex justify-center">
                <Btn variant="secondary" className="w-[116px]" onClick={loadMoreOrders} disabled={ordersBusy}>더 보기</Btn>
              </div>
            )}

            {/* 📌 줄을 누르면 수령 정보 · 메모 · 처리 단추가 상세 칸에 모인다 (예전엔 줄마다 펼쳐 놓아 목록이 길어졌다). 넓은 화면은 목록 옆에 붙는다 */}
            <DetailPane
              open={pane === "order" && !!orderSel}
              onClose={closePane}
              width={480}
              docked
              dockKey="shop-orders"
              nav={orderSel ? orderNav : undefined}
              title={orderSel ? `${orderName(orderSel)}${orderSel.qty > 1 ? ` ×${orderSel.qty}` : ""}` : ""}
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
                  <DefRow k="분류">{orderTypeLabel(orderSel)}</DefRow>
                  <DefRow k="구매자">{orderSel.userName}</DefRow>
                  {/* 1개 단위 주문 — 수량과 쓴 · 돌려준 개수 */}
                  {orderSel.qty > 1 && <DefRow k="수량"><span className="tabular-nums">{orderSel.qty}개{orderSummary(orderSel) ? ` · ${orderSummary(orderSel)}` : ""}</span></DefRow>}
                  {orderSel.qty === 1 && orderSel.consumedAt && <DefRow k="사용"><span className="tabular-nums">{fmtDateTime(orderSel.consumedAt)}</span></DefRow>}
                  <DefRow k="금액"><span className="tabular-nums">{orderAmount(orderSel)}</span></DefRow>
                  <DefRow k="일시"><span className="tabular-nums">{fmtDateTime(orderSel.createdAt)}</span></DefRow>
                  {orderSel.error && <DefRow k="지급 실패"><span className="text-[#d01634]">{orderSel.error}</span></DefRow>}
                  {orderSel.contact && <DefRow k="수령 정보"><span className="font-normal whitespace-pre-wrap break-words">{orderSel.contact}</span></DefRow>}
                  {orderSel.adminNote && <DefRow k="메모"><span className="font-normal">{orderSel.adminNote}</span></DefRow>}
                </dl>
              )}
            </DetailPane>
          </>
        )}
      </AdminPage>

      {/* ── 그룹 관리 ── (z-125: 확인 · 알림 모달(z-130) 아래) */}
      {groupManageOpen && (
        <GroupManager
          groups={regGroups}
          counts={regGroupCount}
          parents={shownParents}
          parentOf={parentOfGroup}
          onClose={() => setGroupManageOpen(false)}
          onLocalOrder={localGroupOrder}
          onLocalParentOrder={localParentOrder}
          onSaved={onGroupSaved}
          toast={toast}
          notify={notify}
        />
      )}

      {/* ── 테마 관리 ── (z-125: 확인 · 알림 모달(z-130) 아래) */}
      {themeManageOpen && (
        <ThemeManager
          themes={themes}
          counts={themeProductCount}
          bannerCounts={themeBannerCount}
          onClose={() => setThemeManageOpen(false)}
          onLocalOrder={localThemeOrder}
          onSaved={onThemesSaved}
          toast={toast}
          notify={notify}
        />
      )}

      {/* ── 상품 — 아이템 순서대로(규칙 한 줄) ── */}
      <ConfirmDialog
        open={syncAsk}
        busy={savingOrder === "product"}
        title="아이템 순서대로"
        confirmLabel="정렬"
        body={<>연결 상품은 아이템 순서대로<span className="block mt-1 text-[#8a8a8a]">세트는 첫 구성 아이템 상품 바로 뒤 · 아이템 없는 상품은 맨 뒤</span></>}
        onConfirm={() => { void syncProductsToItems(); }}
        onCancel={() => setSyncAsk(false)}
      />

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

      {/* ── 고친 채 넘어가기 — 한 번 묻는다(버리면 할 일을 이어서) ── */}
      <ConfirmDialog
        open={!!leaveAsk}
        danger
        title="저장하지 않은 수정"
        confirmLabel="버리기"
        cancelLabel="계속 수정"
        body={leaveAsk ? <><span className="block font-bold text-[#131313] break-all">{leaveAsk.name}</span>고친 내용이 사라집니다.</> : null}
        onConfirm={() => { const go = leaveAsk?.go; setLeaveAsk(null); go?.(); }}
        onCancel={() => setLeaveAsk(null)}
      />

      {/* ── 아이템 일괄 삭제 — 확인 한 번(지울 이름 · 막힌 것은 상품 N · 패스 N) ── */}
      <ConfirmDialog
        open={batchDelAsk}
        danger
        busy={batchBusy}
        title={`아이템 삭제 · ${regDelOk.length.toLocaleString()}개`}
        confirmLabel="삭제"
        confirmDisabled={!regDelOk.length}
        body={
          <>
            {regDelOk.length > 0 && (
              <span className="block max-h-40 overflow-y-auto overscroll-contain border-y border-[#ededed] py-1.5">
                {regDelOk.map((it) => <span key={String(it._id)} className="block py-0.5 truncate font-bold text-[#131313]">{it.name || "이름 없음"}</span>)}
              </span>
            )}
            {regDelBlocked.length > 0 && (
              <span className="block mt-3">
                <span className="block text-[12px] font-black text-[#d01634] tabular-nums">남김 {regDelBlocked.length.toLocaleString()}</span>
                <span className="block mt-1 max-h-28 overflow-y-auto overscroll-contain">
                  {regDelBlocked.map((it) => (
                    <span key={String(it._id)} className="flex items-center gap-2 py-0.5 text-[12px]">
                      <span className="min-w-0 flex-1 truncate">{it.name || "이름 없음"}</span>
                      <span className="shrink-0 tabular-nums text-[#8a8a8a]">상품 {Number(it.usage) || 0} · 패스 {Number(it.passUsage) || 0}</span>
                    </span>
                  ))}
                </span>
              </span>
            )}
          </>
        }
        onConfirm={() => { void batchDelete(); }}
        onCancel={() => setBatchDelAsk(false)}
      />

      {/* ── 상품 일괄 삭제 — 확인 한 번(지울 이름) ── */}
      <ConfirmDialog
        open={prodDelAsk}
        danger
        busy={prodBusy}
        title={`상품 삭제 · ${prodPicked.length.toLocaleString()}개`}
        confirmLabel="삭제"
        confirmDisabled={!prodPicked.length}
        body={
          <span className="block max-h-40 overflow-y-auto overscroll-contain border-y border-[#ededed] py-1.5">
            {prodPicked.map((it) => <span key={String(it._id)} className="block py-0.5 truncate font-bold text-[#131313]">{it.name || "이름 없음"}</span>)}
          </span>
        }
        onConfirm={() => { void deleteProducts(); }}
        onCancel={() => setProdDelAsk(false)}
      />
      {/* ── 상품 일괄 편집 창(할인 · 판매 종료 · 가격 · 재고) ── */}
      {prodSheet && (
        <ProdBatchSheet key={prodSheet} mode={prodSheet} items={prodPicked} busy={prodBusy} at={prodSheetAt}
          onClose={() => { if (!prodBusy) setProdSheet(""); }}
          onSubmit={(entries) => { void submitProdSheet(entries); }} />
      )}
      {/* ── 쿠폰 여러 장 — 만든 코드(복사 · CSV) ── */}
      {couponCodes && (
        <CouponCodesSheet name={couponCodes.name} codes={couponCodes.codes} onClose={() => setCouponCodes(null)}
          onCopy={() => { void copyCodes(couponCodes.codes); }} onCsv={() => codesCsv(couponCodes.name, couponCodes.codes)} />
      )}

      {/* ── 아이템 이름 바꾸기 · 복제(아래 띠) ── */}
      {(sheet === "rename" || sheet === "duplicate") && (
        <RenameSheet mode={sheet} items={regPicked} allItems={regItems} busy={batchBusy}
          onClose={() => { if (!batchBusy) setSheet(""); }}
          onSubmit={(rows, withDesc) => { void (sheet === "rename" ? submitRename(rows, withDesc) : submitDuplicate(rows, withDesc)); }} />
      )}
      {/* ── 설명 바꾸기 · 분류 바꾸기(아이템 · 상품 아래 띠 「⋯」) ── */}
      {textSheet?.mode === "desc" && (
        <DescSheet key={`desc:${textSheet.of}`} targets={textTargetsOf(textSheet.of)} busy={batchBusy || prodBusy}
          onClose={() => { if (!(batchBusy || prodBusy)) setTextSheet(null); }}
          onSubmit={(entries) => { void submitTextSheet(textSheet.of, entries); }} />
      )}
      {textSheet?.mode === "category" && (
        <CategorySheet key={`category:${textSheet.of}`} targets={textTargetsOf(textSheet.of)} busy={batchBusy || prodBusy}
          onClose={() => { if (!(batchBusy || prodBusy)) setTextSheet(null); }}
          onSubmit={(entries) => { void submitTextSheet(textSheet.of, entries); }} />
      )}
      {/* ── 고른 아이템을 새 그룹으로(아래 띠 「그룹 ▾ · + 새 그룹」) ── */}
      <FormSheet
        open={sheet === "group"}
        onClose={() => { if (!batchBusy) setSheet(""); }}
        busy={batchBusy}
        title="새 그룹"
        sub={`${sel.size.toLocaleString()}개`}
        width={560}
        onSubmit={() => {
          const g = normalizeItemGroup(newGroupName);
          if (!g) return;
          void batchGroup(g).then((ok) => { if (ok) setSheet(""); });
        }}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setSheet("")}>취소</Btn>
            <Btn type="submit" className="min-w-[96px]" disabled={!normalizeItemGroup(newGroupName)}>옮기기</Btn>
          </>
        }
      >
        <Field label="그룹 이름">
          <input type="text" autoFocus value={newGroupName} maxLength={ITEM_GROUP_MAX} onChange={(e) => setNewGroupName(e.target.value)} className={inputClass} />
        </Field>
      </FormSheet>

      {/* ── 실사이트 반영 확인 — 종류별 수 · 초안 목록(줄마다 되돌리기 — 삭제 예정 · 순서는 여기서만 보인다) · 경고(처음 쓰는 키 · https 아님) ── */}
      <ConfirmDialog
        open={draftAsk === "publish"}
        busy={draftBusy === "publish"}
        title={`실사이트 반영 · ${draft.total.toLocaleString()}건`}
        confirmLabel="반영"
        confirmDisabled={!draft.total || draftBusy === "revert"}
        body={
          <div className="mt-3">
            <div className="grid items-center gap-y-1 text-[12px] tabular-nums" style={{ gridTemplateColumns: "minmax(0, 1fr) repeat(4, 40px)" }}>
              <span />
              {DRAFT_OPS.map((op) => <span key={op} className="text-right font-bold text-[#8a8a8a]">{DRAFT_OP_LABEL[op]}</span>)}
              {(["item", "shopItem", "banner"] as const).map((k) => (
                <React.Fragment key={k}>
                  <span className="font-bold text-[#131313]">{DRAFT_KIND_LABEL[k]}</span>
                  {DRAFT_OPS.map((op) => {
                    const n = Number(draft.counts[k]?.[op]) || 0;
                    return <span key={op} className={`text-right font-bold ${n ? "text-[#131313]" : "text-[#d4d4d4]"}`}>{n.toLocaleString()}</span>;
                  })}
                </React.Fragment>
              ))}
              {settingEdits > 0 && (
                <>
                  <span className="font-bold text-[#131313]">설정</span>
                  <span />
                  <span className="text-right font-bold text-[#131313]">{settingEdits.toLocaleString()}</span>
                  <span />
                  <span />
                </>
              )}
            </div>

            {draft.rows.length > 0 && (
              <div className="mt-3 border-y border-[#ededed] max-h-40 overflow-y-auto overscroll-contain">
                {draft.rows.map((r) => (
                  <div key={`${r.kind}:${r.id}`} className="flex items-center gap-2 h-9 border-b border-[#ededed] last:border-b-0">
                    <span className="shrink-0 w-10 text-[11px] font-bold text-[#8a8a8a]">{DRAFT_KIND_LABEL[r.kind] || r.kind}</span>
                    <StatusChip tone={DRAFT_OP_TONE[r.op] || "neutral"} className="shrink-0">{DRAFT_OP_LABEL[r.op] || r.op}</StatusChip>
                    <span className="min-w-0 flex-1 truncate font-bold text-[#131313]">{r.name}</span>
                    <RevertMark onRevert={() => setRevertAsk(r)} disabled={!!draftBusy} />
                  </div>
                ))}
              </div>
            )}

            {draft.warnings.length > 0 && (
              <div className="mt-3">
                <p className="text-[12px] font-black text-amber-700 tabular-nums">경고 {draft.warnings.length.toLocaleString()}</p>
                <div className="mt-1.5 max-h-28 overflow-y-auto overscroll-contain rounded-lg bg-amber-50 px-3 py-2">
                  {draft.warnings.map((w, i) => (
                    <p key={`${w.kind}:${w.id}:${i}`} className="py-0.5 text-[12px] text-amber-800 break-keep">
                      <span className="font-bold">{w.name}</span> — {w.why}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
        onConfirm={publishDraft}
        onCancel={() => setDraftAsk("")}
      />

      {/* ── 초안 버리기 확인 — draft_* 를 비운다(실사이트는 그대로) ── */}
      <ConfirmDialog
        open={draftAsk === "discard"}
        danger
        busy={draftBusy === "discard"}
        title="초안 버리기"
        confirmLabel="버리기"
        confirmDisabled={!draft.total}
        body={<>초안 <span className="font-bold text-[#131313] tabular-nums">{draft.total.toLocaleString()}건</span>을 지웁니다.</>}
        onConfirm={discardDraft}
        onCancel={() => setDraftAsk("")}
      />

      {/* ── 초안 한 건 되돌리기 — 반영 창 위에도 뜬다(뒤에 그려 위에 쌓인다) ── */}
      <ConfirmDialog
        open={!!revertAsk}
        danger
        busy={draftBusy === "revert"}
        title="초안 되돌리기"
        confirmLabel="되돌리기"
        body={revertAsk ? (
          <>
            <span className="block font-bold text-[#131313] break-all">{revertAsk.name}</span>
            {DRAFT_KIND_LABEL[revertAsk.kind] || revertAsk.kind} · {DRAFT_OP_LABEL[revertAsk.op] || revertAsk.op}
          </>
        ) : null}
        onConfirm={revertDraft}
        onCancel={() => setRevertAsk(null)}
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
              <span className="block font-bold text-[#131313]">{orderName(cancelTarget)}{cancelTarget.qty > 1 ? ` ×${cancelTarget.qty}` : ""}</span>
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
              <p className={fieldNote}>이미 보유 중이면 건너뜁니다.</p>
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
            서버 멤버 전원과 XP 기록이 있는 유저의 지갑에 들어가며, 지급 후에는 되돌릴 수 없습니다.
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
            <p className="mt-1 text-[13px] text-[#5a5a5a] break-keep">{noteTarget.userName} · {orderName(noteTarget)}</p>
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

      {/* ── 상점 설정(머리 「설정」) — ARCTIC 상점 공개 · 결제 캐시백. 바뀐 칸만 저장(Enter · Ctrl+S) ── (z-125: 확인 · 알림 모달(z-130) 아래) */}
      <FormSheet
        open={shopSetOpen}
        onClose={closeShopSettings}
        busy={savingShopSet}
        title="상점 설정"
        width={560}
        onSubmit={() => { void saveShopSet(); }}
        footer={
          <>
            <Btn variant="ghost" onClick={closeShopSettings}>취소</Btn>
            <Btn type="submit" className="min-w-[96px]" disabled={!shopSetDirty || shopSetLoading}>{savingShopSet ? "저장 중…" : "저장"}</Btn>
          </>
        }
      >
        {!shopSet || !shopSetSnap ? (
          <div className="py-8 text-center text-[13px] text-[#5a5a5a]">
            {shopSetLoading ? "불러오는 중…" : (
              <>
                불러오지 못했습니다.
                <span className="block mt-3">
                  <Btn variant="secondary" size="sm" onClick={() => { setShopSetLoading(true); setShopSetReload((n) => n + 1); }}>다시 읽기</Btn>
                </span>
              </>
            )}
          </div>
        ) : (
          // FieldRow(설정 줄)를 창 끝까지 — 창 본문 여백(px-5 py-4)을 걷고 줄마다 제 여백 · 구분선
          <div className="-mx-5 -my-4">
            <FieldRow label="ARCTIC 상점 공개" changed={shopSet.pub !== shopSetSnap.pub}>
              <Toggle on={shopSet.pub} disabled={shopSetLoading} onClick={() => setShopSet((v) => (v ? { ...v, pub: !v.pub } : v))} onLabel="공개 중" offLabel="비공개 (관리자만)" />
            </FieldRow>
            <FieldRow label="캐시백 합 상한" changed={shopSet.cap.trim() !== shopSetSnap.cap} hint="캐시백 아이템 효과를 합한 최대치 · 기본 30%">
              <Inline>
                {/* min · max 는 두지 않는다 — 창이 <form> 이라 브라우저 검사가 먼저 막아 아래 알림(효과음)이 안 뜬다. 범위는 saveShopSet 이 본다 */}
                <input type="number" inputMode="numeric" aria-label="캐시백 합 상한" value={shopSet.cap} disabled={shopSetLoading}
                  onChange={(e) => { const cap = e.target.value; setShopSet((v) => (v ? { ...v, cap } : v)); }} className={numClass} />
                <span>%</span>
              </Inline>
            </FieldRow>
            <FieldRow label="빙옥 결제분" changed={shopSet.onPoint !== shopSetSnap.onPoint} hint={`포함하면 빙옥으로 낸 금액도 1 빙옥 = ${POINT_RATE.toLocaleString()} XP로 환산해 캐시백 · 기본 제외`}>
              <Toggle on={shopSet.onPoint} disabled={shopSetLoading} onClick={() => setShopSet((v) => (v ? { ...v, onPoint: !v.onPoint } : v))} onLabel="캐시백 포함" offLabel="캐시백 제외" />
            </FieldRow>
            {/* 📌 종류별 효과 문구 — 따로 창(저장도 따로 · 이 창의 저장과 무관) */}
            <FieldRow label="효과 문구" hint="효과 종류마다 자동 문구의 틀">
              <Inline>
                <span className="font-bold text-[#131313]">{fxTextCount ? `바꾼 틀 ${fxTextCount}개` : "기본 문구"}</span>
                <Btn variant="secondary" size="sm" onClick={() => openFxText()}>편집</Btn>
              </Inline>
            </FieldRow>
          </div>
        )}
      </FormSheet>

      {/* ── 종류별 효과 문구(상점 설정 창 「효과 문구」 · 기능 검색) ── */}
      <EffectTemplatesSheet
        open={fxTextOpen}
        focus={fxTextFocus}
        onClose={() => setFxTextOpen(false)}
        saved={fxTpl.saved}
        onSaved={(t) => { const was = JSON.stringify(fxTpl.saved || {}); fxTpl.remember(t); if (JSON.stringify(t) !== was) fetchRegItems(); }}
        toast={toast}
        fail={fail}
      />

      {/* ── 추천 아이템 불러오기 ── (z-125: 알림 모달(z-130) 아래) */}
      {presetOpen && <PresetDialog onClose={() => setPresetOpen(false)} onDone={onPresetDone} notify={notify} />}

      {noticeEl}
      {toastEl}
    </>
  );
}
