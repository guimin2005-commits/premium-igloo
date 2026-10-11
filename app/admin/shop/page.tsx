"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { discountPctOf, discountUntilLabel, priceText, applyDiscount, COUPON_SCOPES, couponScopeTail } from "@/lib/shopPricing";
import { saleEnded, saleUntilLabel } from "@/lib/saleWindow";
import { POINT_RATE, pointToXp } from "@/lib/pointRate";
import Dropdown, { type DropdownOption } from "../../components/Dropdown";
import ItemIcon, { ArtIcon } from "../../components/ItemIcon";
import IconPicker from "../../components/IconPicker";
import { artOfSkin, artOfFrame, frameImageOf, cosmeticAutoOf, legacyFrameArtOf, cosmeticIconOf, cosmeticKeysOf } from "@/lib/cosmeticArt";
import BackdropPicker from "../../components/BackdropPicker";
import ProductCard from "../../arctic/ProductCard";
import StoreCardArt, { BundleArt, bundlePartsOf } from "../../arctic/CardArt";
import { itemIndexOf, productGroupOf } from "@/lib/productOrder";
import { InventoryItemPreview } from "../../components/Inventory";
import { ITEM_TYPE_OPTIONS, itemTypeLabel, itemTypeColor, normalizeItemGroup, ITEM_GROUP_MAX } from "@/lib/items";
import {
  TRIGGERS, TRIGGER_OF, EFFECT_KINDS, SKINS, FRAMES, FIELD_RANGE, DAY_LABELS, MAX_EFFECTS, amountMaxOf,
  normalizeEffects, describeEffect, describeItemBasic, describeRoleBuff, itemEffectLines, cashbackRuleOf, hasConsumable, skinsOf, framesOf,
} from "@/lib/itemEffects";
import {
  EMPTY_PRODUCT_FORM, SOURCE_OPTIONS, sourceOf, isLinked, formFromShopItem,
  pickType as pickProductType, applyItem, unlinkItem, customSnapOf, type CustomSnap, toPayload, toKstInput,
  setPointOnly, formUnit, formSalePrice, priceCalc, durationsCalc,
  SALE_MODES, saleModeOf, setSaleMode, saleModeError, unitSaleOk, pickRole,
  PRODUCT_TYPE_OPTIONS, isBundleForm, newBundleRow, bundleError, bundleValueSum, bundleBlankValues, canStackInBundle, BUNDLE_VALUE_ERROR,
} from "../../arctic/productForm";
import { isUnitSale, maxPerOrderOf, MAX_PER_ORDER } from "@/lib/unitSale";
import { groupOrders, orderSummary } from "@/lib/orderGroups";
import { BUNDLE_TYPE, BUNDLE_MAX, BUNDLE_QTY_MAX, BUNDLE_DAYS_MAX, isBundle } from "@/lib/bundle";
import { groupList, moveUnit, moveInGroup, moveToGroup, groupUnitKey, itemUnitKey, nestParents, orderParentBlocks, parentList, orderGroupsNested } from "@/lib/itemOrder";
import type { ProductForm, BundleRow } from "../../arctic/productForm";
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
  PanelGrid,
  FieldRow,
  SaveBar,
  ActionBar,
  Inline,
  inputClass,
  numClass,
  labelClass,
  fieldNote,
  EmptyRow,
  Btn,
  SwapLabel,
  Toggle,
  Switch,
  useNotice,
  useToast,
  useRowDrag,
  DragHandle,
  ConfirmDialog,
  useAdminGuard,
  tableGroupOfKey,
} from "../ui";
import type { Column, TableRowDrop } from "../ui";
import { THEME_NAME_MAX, THEME_ON_MAX, THEME_ON_LIMIT_MESSAGE, DEFAULT_THEMES, BUILTIN_BANNER_THEME, themeNameOf, themePickOptions, normalizeThemeName, themeNameError } from "@/lib/shopThemes";

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
  // 넘김 주기는 app/arctic/BannerSlider.tsx (2026-10-01 5초 → 8초, 10-03 → 7초). 노출 위치(홈 · 시즌 탭 · 할로윈 탭)마다 따로 돈다
  banners: { desc: "같은 노출 위치의 배너가 여럿이면 7초마다 자동 전환됩니다." },
  coupons: { desc: "" },
  // 예전 목록 아래 한 줄 안내를 머리로 올렸다
  orders: { desc: "역할 상품은 봇이 30초 주기로 자동 지급합니다. 취소하면 XP가 환불되고 재고가 복구됩니다." },
  season: { desc: "되돌리려면 역할을 손으로 다시 붙여야 합니다." },
  // 📌 2026-10-04 "관리자가 정하게 해" — 결제 캐시백 상한 · 빙옥 결제분 캐시백(BotSetting — app/api/bot-settings PATCH)
  settings: { desc: "" },
};

const TAB_ORDER = [
  { id: "items", short: "아이템" },
  { id: "products", short: "상품" },
  { id: "banners", short: "배너" },
  { id: "coupons", short: "쿠폰" },
  { id: "orders", short: "구매 내역" },
  { id: "season", short: "시즌 전환" },
  { id: "settings", short: "설정" },
];

// expired — 기간제가 끝나 봇이 회수한 건 (bot/src/features/grantQueue.js)
const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소", refunded: "환불", expired: "만료" };
const STATUS_TONE: Record<string, "warn" | "ok" | "bad" | "neutral"> = { pending: "warn", completed: "ok", cancelled: "bad", refunded: "bad", expired: "neutral" };

// 상품 유형 — 라벨·색은 lib/items.js 가 단일 원천 (상점 카드와 같은 값). 세트(lib/bundle.js)는 상품에만 있는 유형이라 여기서 붙인다
const typeLabel = (t: string) => (t === BUNDLE_TYPE ? "세트" : itemTypeLabel(t));
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
  const list = (Array.isArray(raw0) ? normalizeEffects(raw0) : []) as { on?: string; skin?: string; frame?: string }[];
  const skin = list.find((e) => e?.on === "cardSkin" && e.skin);
  const frame = list.find((e) => e?.on === "avatarFrame" && e.frame);
  const skins: string[] = skin ? skinsOf(skin.skin) : [];
  const frames: string[] = frame ? framesOf(frame.frame) : [];
  if (!it || (!skins.length && !frames.length)) return it;
  const raw = String(it.imageUrl || it.itemImageUrl || "");
  const out = cosmeticIconOf({
    icon: it.icon, imageUrl: raw,
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
  chance: string; minMembers: string; seconds: string; skin: string; frame: string;
  days: number[]; hourFrom: string; hourTo: string; channelIds: string[]; chText: string; open: boolean;
};
const newEffectId = () => Math.random().toString(36).slice(2, 10);
const newEffect = (): EffectDraft => ({
  id: newEffectId(), on: "chat", mode: "add", amount: "", minMinutes: "", everyN: "", chance: "", minMembers: "", seconds: "", skin: "", frame: "",
  days: [], hourFrom: "", hourTo: "", channelIds: [], chText: "", open: false,
});
// 빈 칸은 undefined 로 넘긴다 — normalizeEffects 는 "" 를 0 으로 읽어 분 · 번째를 최솟값(1분 · 2번째)으로 채워 버린다
const numOrNone = (s: string) => (String(s ?? "").trim() === "" ? undefined : Number(s));
// 📌 초 칸 효과(쿨타임 단축)는 크기 칸이 화면에 없다 — 다른 효과에서 바꿔 온 크기가 초로 읽히지 않게 amount 를 넘기지 않는다
const effectOf = (d: EffectDraft) => ({
  id: d.id, on: d.on, mode: d.mode, amount: TRIGGER_OF[d.on]?.needs === "seconds" ? undefined : numOrNone(d.amount),
  minMinutes: numOrNone(d.minMinutes), everyN: numOrNone(d.everyN),
  chance: numOrNone(d.chance), minMembers: numOrNone(d.minMembers), seconds: numOrNone(d.seconds), skin: d.skin || undefined, frame: d.frame || undefined,
  days: d.days, hourFrom: d.hourFrom, hourTo: d.hourTo, channelIds: d.channelIds,
});
// 📌 한 번에 수정(2026-10-11) — 폼이 저장된 값과 다른지 볼 때 줄마다 새로 만드는 내부 키(효과 줄 id · 세트 줄 key) · 화면 상태(효과 줄 「조건」 펼침 open) ·
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
// 목록이 바뀐 만큼 폼을 옮긴다 — 고친 칸(폼 ≠ 옛 저장 값)은 그대로, 안 고친 칸 중 목록에서 바뀐 것만 새 저장 값으로
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
    frame: typeof e?.frame === "string" ? e.frame : "",
    days: Array.isArray(e?.days) ? e.days.map(Number) : [], hourFrom: e?.hourFrom != null ? String(e.hourFrom) : "", hourTo: e?.hourTo != null ? String(e.hourTo) : "",
    channelIds, chText: channelIds.join(", "), open: false,
  };
};
const xpNum = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

// 아이템 등록 폼 — 숫자 칸은 비울 수 있어야 해서 문자열로 든다
//    효과(chatBuffXp · voiceBuffXp · attendBuffXp · effects)는 아이템 자체에 저장 — 이 아이템을 인벤토리에 가진 사람에게 적용(디스코드 역할과 무관)
//    group: 목록 묶음 이름("" = 묶지 않음 — models/Item.js group)
type ItemForm = {
  id: string; name: string; description: string; type: string; roleId: string; icon: string; imageUrl: string;
  color: string; detachOnSeason: boolean; visible: boolean; group: string;
  chatBuffXp: string; voiceBuffXp: string; attendBuffXp: string; effects: EffectDraft[];
};
const EMPTY_ITEM_FORM: ItemForm = {
  id: "", name: "", description: "", type: "item", roleId: "", icon: "", imageUrl: "", color: "", detachOnSeason: false, visible: true, group: "",
  chatBuffXp: "", voiceBuffXp: "", attendBuffXp: "", effects: [],
};

// 📌 아이템 그룹(2026-10-10 운영자: "시즌 끝나면 등급별 지급되는 아이템들이 너무 많아져서 다 관리하기 힘드니까 그룹 시스템을 만들어 줘")
//    목록은 그룹마다 머리줄 하나로 접어 둔다(기본 접힘 — DataTable groupOf).
//    한 개는 아이템 수정의 "그룹" 칸, 여러 개는 목록의 "그룹 지정"(골라서 한 번에 — PATCH /api/admin/items { ids, group }).
//    📌 2026-10-11 순서는 하나 — 목록 순서 = 실제 순서(Item.sortOrder · 인벤토리 · 상점). 같은 그룹은 늘 붙은 덩어리, 머리줄은 그 덩어리 첫 아이템 자리
//       (예전엔 머리줄을 저장된 그룹 차례로 위에 모아 그려 실제 순서와 달랐다 — 운영자 "이러면 안 되는 거잖아"). 규칙 · 계산은 lib/itemOrder.js(서버와 같은 함수).
//       끌기: 머리줄 → 덩어리째 단위 사이로. 아이템 줄 하나 → 놓은 자리가 곧 그룹(2026-10-11 운영자 "바깥에 있는 걸 바로 그룹에 못 넣는다"):
//         펼친 덩어리 안(두 줄 사이 · 첫 줄 앞) = 그 그룹에 그 자리로 · 접힌 머리줄 위 = 그 덩어리 끝 · 단위 사이 = 그룹에서 빼 그 자리로
//         (자리 셈 lib/groupedDrop.js · 순서 셈 lib/itemOrder.js moveToGroup — 서버와 같은 함수). 그룹이 바뀌면 토스트로 알린다.
//       그룹 지정 모드도 머리줄로 접은 채 — 머리줄 고르기 칸 = 그 그룹 (보이는) 아이템 통째로, 고른 수 · 그룹 고르기 · 옮기기는 화면 아래 띠(ActionBar).
//       그룹 지정 · 그룹 칸 저장 → 그 그룹 덩어리 끝에(빼면 옛 덩어리 바로 뒤). 그룹 관리 창 차례 = 덩어리 차례(빈 그룹은 그 뒤 — Setting "itemGroups")
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

// 그룹 고르기 — 목록 하나(그룹 없음 · 그룹들(저장된 차례 · 개수) · + 새 그룹). 새 그룹을 고르면 이름 칸이 열린다.
//    목록에 없는 이름이 들어 있으면(새 그룹 · 꾸미기 효과 자동 채우기) 이름 칸이 열린 채 그 이름을 보인다.
//    mixed: 고른 아이템들의 그룹이 서로 달라 아직 아무것도 고르지 않은 상태 — 단추에 "여러 그룹"(값은 보지 않는다)
//    onEnter: 폼 밖(그룹 지정 띠)에서 Enter 로 바로 적용 · onPending: 새 그룹 칸이 열렸는데 이름이 비었는지(그룹 지정 띠가 옮기기를 잠근다)
//    placeholder: mixed 일 때 단추 글자 · bar: 화면 아래 띠 안 — 목록은 위로 열고, 새 그룹 이름 칸은 PC 에서 옆에(모바일은 아래)
const NEW_GROUP_V = "+new";
function GroupPicker({ value, groups, counts, onChange, mixed = false, placeholder = "여러 그룹", bar = false, onEnter, onPending }: {
  value: string; groups: string[]; counts: ReadonlyMap<string, number>; onChange: (v: string) => void; mixed?: boolean; placeholder?: string; bar?: boolean; onEnter?: () => void; onPending?: (pending: boolean) => void;
}) {
  const v = normalizeItemGroup(value);
  const known = !!v && groups.includes(v);
  const [newOpen, setNewOpen] = useState(false);
  const typing = !mixed && (newOpen || (!!v && !known));
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (newOpen) inputRef.current?.focus(); }, [newOpen]);
  const pending = typing && !v;
  useEffect(() => { onPending?.(pending); }, [pending, onPending]);
  const options: DropdownOption[] = [
    { value: "n:", label: "그룹 없음" },
    ...groups.map((g) => ({ value: `g:${g}`, label: g, hint: String(counts.get(g) || 0) })),
    { value: NEW_GROUP_V, label: "+ 새 그룹" },
  ];
  const dropdown = (
    <Dropdown
      theme="light"
      className={bar ? "w-full md:w-[240px] shrink-0" : ""}
      buttonClassName={DD_BTN}
      value={mixed ? "" : typing ? NEW_GROUP_V : known ? `g:${v}` : "n:"}
      placeholder={placeholder}
      options={options}
      maxHeight={bar ? 260 : 300}
      up={bar}
      onChange={(x) => {
        if (x === NEW_GROUP_V) { setNewOpen(true); if (known || mixed) onChange(""); return; }
        setNewOpen(false);
        onChange(x === "n:" ? "" : x.slice(2));
      }}
    />
  );
  const nameInput = typing && (
    <input ref={inputRef} type="text" value={value} maxLength={ITEM_GROUP_MAX} onChange={(e) => onChange(e.target.value)} placeholder="새 그룹 이름" aria-label="새 그룹 이름"
      className={bar ? `${inputClass} md:!w-[200px]` : `${inputClass} mt-2`}
      onKeyDown={onEnter ? (e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); onEnter(); } } : undefined} />
  );
  if (bar) {
    return (
      <div className="min-w-0 w-full md:w-auto flex flex-wrap md:flex-nowrap items-center gap-2">
        {dropdown}
        {nameInput}
      </div>
    );
  }
  return (
    <>
      {dropdown}
      {nameInput}
    </>
  );
}

// 그룹 지정 고르기 표시 — 표 줄(PC <tr> · 모바일 <button>) 안이라 input 이 아니라 span 으로(버튼 속 입력 금지). 누르기는 줄이 받는다
//    mixed: 일부만 고름(그룹 머리줄 — 반쯤 찬 표시) · bare: 그림만(감싼 단추가 checkbox 역할)
function PickMark({ on, mixed = false, bare = false }: { on: boolean; mixed?: boolean; bare?: boolean }) {
  const fill = on || mixed;
  return (
    <span {...(bare ? { "aria-hidden": true } : { role: "checkbox", "aria-checked": on ? true : mixed ? "mixed" as const : false, "aria-label": "선택" })}
      className={`inline-flex items-center justify-center w-4 h-4 shrink-0 rounded border transition-colors ${fill ? "bg-[#131313] border-[#131313] text-white" : "bg-white border-[#a3a3a3] group-hover/pick:border-[#131313]"}`}>
      {on ? (
        <svg aria-hidden viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 8.5l3 3 6-7" />
        </svg>
      ) : mixed ? (
        <svg aria-hidden viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path strokeLinecap="round" d="M4 8h8" />
        </svg>
      ) : null}
    </span>
  );
}
// 그룹 머리줄 고르기 칸(그룹 지정) — 그 그룹의 보이는 아이템 통째로 고르기 · 풀기. 누르는 자리는 손잡이와 같은 32px(줄 높이는 그대로 — -my-1)
function GroupPickBox({ on, mixed, label, onToggle }: { on: boolean; mixed: boolean; label: string; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={on ? true : mixed ? "mixed" : false} aria-label={label} title={label} onClick={onToggle}
      className="group/pick -ml-2 -my-1 w-8 h-8 shrink-0 inline-flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
      <PickMark on={on} mixed={mixed} bare />
    </button>
  );
}

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
type OrderRow = { orderId?: string; itemRef?: string; bundleName?: string; itemName?: string };
const groupOrderRows = (rows: OrderRow[]) =>
  groupOrders(rows.map((r) => (r?.bundleName && r.orderId ? { ...r, orderId: `${r.orderId}#${r.itemRef || ""}`, bundleOrderId: r.orderId } : r)))
    .map((g) => (g.bundleOrderId ? { ...g, orderId: g.bundleOrderId } : g));
const orderName = (o: OrderRow | null | undefined) => (o?.bundleName ? `${o.bundleName} · ${o.itemName || ""}` : o?.itemName || "");
// 주문 금액 — 정가 × 개수(빙옥 전용은 빙옥으로 올림). 빙옥 전용 세트의 구성 건은 나눠 적은 값이 1 빙옥의 배수가 아니라
//    올림하면 합이 낸 값보다 커지므로 낸 빙옥(paidPoint 합 — lib/orderGroups)을 그대로 쓴다
type OrderMoney = { bundleName?: string; pointOnly?: boolean; billed?: boolean; paidPoint?: number; price?: number; paidQty?: number; qty?: number };
const orderAmount = (o: OrderMoney) =>
  o.bundleName && o.pointOnly && o.billed ? `${(Number(o.paidPoint) || 0).toLocaleString()} 빙옥` : priceText(o, (o.price || 0) * (o.paidQty || o.qty || 1));
// 세트 구성 한 칸 표기(상품 목록) — "이름 ×N 30일"
const bundleCompLabel = (c: { name?: string; qty?: number; days?: number }) =>
  `${c?.name || "알 수 없음"}${(Number(c?.qty) || 1) > 1 ? ` ×${c.qty}` : ""}${Number(c?.days) > 0 ? ` ${c.days}일` : ""}`;

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
//    disabled: 실사이트 읽기 전용(liveLocked) — 자리 · 모양은 그대로 두고 흐리게 잠근다
function VisSwitch({ on, busy, disabled = false, onToggle }: { on: boolean; busy: boolean; disabled?: boolean; onToggle: () => void }) {
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
      aria-label="인벤토리 표시"
      tabIndex={0}
      onClick={fire}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fire(e); }}
      className={`inline-flex items-center gap-2 rounded-full ${disabled ? "cursor-default" : "cursor-pointer"} select-none outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30 ${off ? "opacity-40" : ""}`}
    >
      <span className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${on ? "bg-[#131313]" : "bg-[#d4d4d4]"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
      <span className={`text-[12px] font-bold ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>{on ? "표시" : "숨김"}</span>
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
// 목록 위 한 줄의 거르기 단추 — 검색칸과 같은 높이 · 알약 모양
const GROUP_FILTER_BTN = "!h-10 !py-0 !px-4 !rounded-full !border-[#a3a3a3] !text-[13px]";
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
//    스토어 유형은 app/arctic/ArcticShopBody.tsx TYPES 와 같은 값(/arctic?type=<v> — 상점이 이 값으로 그 탭을 연다). 바꾸면 거기도.
//    이벤트 테마 탭은 테마 목록(lib/shopThemes.js)에서 — /arctic?type=<테마 키>(꺼진 테마는 「꺼짐」 — 켜야 그 탭이 선다)
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
const bannerLinkOptions = (items: any[], themes: { key: string; name: string; on: boolean }[]): DropdownOption[] => [
  { value: "", label: "이동 없음" },
  { value: "g:store", label: "스토어", group: true },
  { value: "/arctic", label: "스토어 홈", indent: true },
  ...BANNER_STORE_TYPES.map((t) => ({ value: `/arctic?type=${t.v}`, label: t.l, indent: true })),
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

// 📌 아이템 효과 편집 — 기본 세 칸 + 추가 효과 목록(발동 · 상시 · 소모 · 꾸미기). 상세 칸(520px) · 모바일 판 모두에서 줄이 무너지지 않게 줄바꿈을 허용한다.
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
const HOUR_FROM = Array.from({ length: 24 }, (_, h) => h);
const HOUR_TO = Array.from({ length: 24 }, (_, h) => h + 1);
const selectSm = `${inputClass} !w-[84px] tabular-nums`;
// 📌 스킨 · 테두리 고르기 묶음 — 시즌마다 늘어 한 줄 목록은 찾기 어렵다
const SKIN_GROUPS: { l: string; has: (s: { v: string }) => boolean }[] = [
  { l: "기본", has: (s) => ["gold", "aurora", "ice", "crimson"].includes(s.v) },
  { l: "시즌 2", has: (s) => ["newworld", "chart", "airship"].includes(s.v) },
  { l: "등급", has: (s) => s.v.startsWith("rank_") },
  { l: "할로윈", has: (s) => s.v.startsWith("hw_") },
];
const FRAME_GROUPS: { l: string; all?: boolean; has: (f: { v: string }) => boolean }[] = [
  { l: "등급", all: true, has: (f) => !f.v.includes("_") },
  { l: "할로윈", has: (f) => f.v.startsWith("hwf_") },
  { l: "시즌 2", has: (f) => f.v.startsWith("nwf_") },
];
const subLabel = "mb-1.5 text-[12px] font-bold text-[#5a5a5a]";

// 📌 카드 스킨 · 아바타 테두리 고르기 — 긴 목록 칸 대신 그림 칸(2026-10-11 운영자). 묶음(기본 · 시즌 2 · 등급 · 할로윈 / 등급 · 할로윈 · 시즌 2)마다
//    스킨은 그 스킨 아이콘(lib/cosmeticArt artOfSkin), 테두리는 테두리 그림(public/avatar-borders — 등급 전체는 아이콘) + 이름.
//    판은 높이 고정(안에서 스크롤) — 효과 줄 높이가 고른 것에 따라 바뀌지 않게. 열 때 고른 칸이 보이게 판 안에서만 굴린다
const COSMETIC_BOX_H = 264;
function CosmeticPicker({ kind, value, onChange }: { kind: "skin" | "frame"; value: string; onChange: (v: string) => void }) {
  const groups = kind === "skin"
    ? SKIN_GROUPS.map((g) => ({ l: g.l, opts: SKINS.filter(g.has) }))
    : FRAME_GROUPS.map((g) => ({ l: g.l, opts: [...FRAMES.filter(g.has), ...(g.all ? [{ v: "all", l: "등급 전체" }] : [])] }));
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = boxRef.current;
    const el = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - 28);
    // 처음 열 때만 — 고를 때마다 판이 튀지 않게
  }, []);
  return (
    <div ref={boxRef} role="group" aria-label={kind === "skin" ? "카드 스킨" : "아바타 테두리"}
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
                      <ArtIcon k={kind === "skin" ? artOfSkin(o.v) : artOfFrame(o.v)} size={32} />
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
  //    캐시백 상한은 관리자 설정(상점 관리 › 설정 — BotSetting.shopCashbackCap, 기본 30%)
  const [botCaps, setBotCaps] = useState<{ cooldown: number; mute: number; cashback: number } | null>(null);
  useEffect(() => {
    fetch("/api/bot-settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.data) setBotCaps({ cooldown: Number(d.data.chatCooldownSec) || 0, mute: Math.min(100, Math.max(0, Number(d.data.muteReducePct) || 0)), cashback: cashbackRuleOf(d.data).cap });
      })
      .catch(() => {});
  }, []);
  const capText = (t: { v: string; cap?: number; unit?: string }) => {
    if (t.v === "cooldownCut") return botCaps ? `합 최대 ${Math.min(3600, Math.floor(botCaps.cooldown / 2)).toLocaleString()}초 (채팅 쿨타임의 절반)` : "합 최대 채팅 쿨타임의 절반";
    if (t.v === "muteRelief") return botCaps ? `합 최대 ${botCaps.mute}%p (지금 음소거 감소율)` : "합 최대 지금 음소거 감소율";
    if (t.v === "shopCashback") return botCaps ? `합 최대 ${botCaps.cashback}% (상점 관리 › 설정)` : "합 최대 상점 관리 › 설정 값";
    return `합 최대 ${t.cap}${t.unit}`;
  };
  // 상황을 바꾸면 — 없는 방식(%)은 첫 방식으로, 채팅 ↔ 음성이면 맞지 않는 종류의 채널은 뺀다(카테고리 · 모르는 ID 는 둔다).
  //    채널 종류는 TRIGGERS 의 channels("voice" 면 음성, true 면 텍스트)
  //    발동형이 아니면(상시 · 소모 · 꾸미기) 요일 · 시간대 · 채널 조건이 없다 — 비우고 접는다. 카드 스킨 · 아바타 테두리는 첫 것을 골라 둔다
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

            {/* 값 줄 — 효과마다 필요한 칸만. 크기가 없는 효과(보호막 · 배지)는 줄이 없다. 스킨 · 테두리는 아래 그림 칸 */}
            {(!t.noAmount || (t.needs && t.needs !== "skin" && t.needs !== "frame")) && (
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
            {/* 📌 스킨 · 테두리 — 그림 칸(목록 칸은 길어 찾기 어려웠다). key: 효과 종류가 바뀌면 판을 새로 열어 고른 칸으로 굴린다 */}
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
            </p>
          </div>
        );
      })}
      <Btn variant="secondary" size="sm" disabled={list.length >= MAX_EFFECTS} onClick={() => onChange({ effects: [...list, newEffect()] })}>+ 효과 추가</Btn>
    </fieldset>
  );
}

// 📌 세트 구성 편집(lib/bundle.js) — 등록 아이템을 골라 줄을 더하고, 줄마다 기간(영구 / N일) · 개수 · 몸값 · 빼기. 2 ~ 12줄(저장 전 bundleError).
//    줄 차례 = 상점 · 상세에 보이는 구성 차례 — 손잡이로 끌어(↑ ↓ 키도) 바꾼다(2026-10-11 운영자 "세트 구성에서 위 아래 바꿀 수 있는 기능"). 폼 값만 바꾸고 저장은 폼 저장으로
//    개수는 역할 없는 영구 · 쌓이는 아이템만 2 이상(productForm canStackInBundle — 서버 componentProblem 과 같은 조건), 아니면 1로 잠근다.
//    몸값은 XP(빙옥 전용 세트여도 — 서버 저장값 그대로). 모두 적거나 모두 비운다(bundleError).
//    몸값 칸 옆 "상품가" — 그 아이템을 따로 파는 상품이 있으면 같은 기간의 정가로 채운다(없으면 단추 없음).
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
//    stackable: 관리자 아이템 목록 API(lib/unitSale unitThingSet)가 주는 쌓임 여부
type RegLite = { _id: string; name?: string; icon?: string; imageUrl?: string; color?: string; type?: string; roleId?: string; stackable?: boolean; effects?: unknown };
type ShopLite = { _id: string; name?: string; itemId?: string; type?: string; active?: boolean; unitSale?: boolean; price?: number; durations?: { days?: number; price?: number }[] };
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
  const shown = list.filter((x) => (!type || x.type === type) && (!qq || String(x.name || "").toLowerCase().includes(qq)));
  const full = sel.length >= room;
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((v) => v !== id) : s.length >= room ? s : [...s, id]));
  // 넣는 차례 — 목록(아이템 순서) 차례 그대로(누른 차례가 아니라)
  const add = () => {
    if (!sel.length) return;
    const set = new Set(sel);
    onAdd(list.filter((x) => set.has(String(x._id))).map((x) => String(x._id)));
  };
  return (
    <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={onClose}>
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
          <div className="mt-2.5 overflow-x-auto no-bar">
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
                  <input type="checkbox" className={CHECK} checked={on} disabled={locked} onChange={() => toggle(id)} aria-label={`${x.name || "아이템"} 고르기`} />
                  <span className="shrink-0"><ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={28} color={x.color || itemTypeColor(x.type)} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{x.name || "이름 없음"}</span>
                    <span className="block truncate text-[12px] text-[#5a5a5a]">{itemTypeLabel(x.type)}{inSet ? " · 이미 있음" : ""}</span>
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
                <span className="block truncate text-[14px] font-bold text-[#131313]">{it?.name || "찾을 수 없는 아이템"}</span>
                {it && <span className="block truncate text-[12px] text-[#5a5a5a]">{itemTypeLabel(it.type)}{hasRole ? " · 역할" : ""}</span>}
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
function WorthRef({ itemId, group, type, regItems, shops, open, onToggle }: {
  itemId: string; group: string; type: string; regItems: RegLite[]; shops: ShopLite[]; open: boolean; onToggle: () => void;
}) {
  const id = String(itemId || "");
  const own: WorthRow[] = id
    ? [
        ...shops.filter((s) => s.type !== BUNDLE_TYPE && String(s.itemId || "") === id).map((s) => {
          const w = shopWorthOf(s, id);
          return { key: `p:${s._id}`, name: s.name || "이름 없음", off: s.active === false, solo: w.v, soloTag: w.tag, setV: null };
        }),
        ...shops.filter((s) => inBundleOf(s, id)).map((s) => ({ key: `s:${s._id}`, name: s.name || "이름 없음", off: s.active === false, solo: null, setV: setValueOf([s], id) })),
      ]
    : [];
  const g = normalizeItemGroup(group);
  const peers: WorthRow[] = regItems
    .filter((x) => String(x._id) !== id && (g ? groupOfItem(x as { group?: unknown }) === g : x.type === type))
    .map((x) => { const xid = String(x._id); return { key: `i:${xid}`, name: x.name || "이름 없음", solo: soloPriceOf(shops, xid, 0, 1), setV: setValueOf(shops, xid) }; });
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
    <section className="mt-2 pt-4 border-t border-[#ededed]">
      <h3 className={open ? "mb-3" : ""}>
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="w-full flex items-center gap-2 text-left text-[14px] font-black tracking-tight rounded outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
          몸값 참고
          <svg aria-hidden viewBox="0 0 20 20" className={`ml-auto w-4 h-4 shrink-0 text-[#8a8a8a] transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5l5 5-5 5" />
          </svg>
        </button>
      </h3>
      {open && (
        <div className="mb-1">
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
      )}
    </section>
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
      <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={busy ? undefined : onClose}>
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
      <div className="fixed inset-0 z-[125] flex items-end sm:items-center justify-center bg-black/40 sm:p-4 overlay-in" onClick={busy ? undefined : onClose}>
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

// 📌 한 번에 수정 — 저장 안 한 게 남은 채 떠날 때 묻는 글(링크 · 뒤로 가기 같은 글)
const leaveAsk = (n: number) => `저장하지 않은 수정이 ${n}개 있습니다. 나가면 사라집니다. 나갈까요?`;
// 📌 뒤로 가기 표지(2026-10-11) — 고친 게 생기면 지금 기록 자리를 「아래」로 적고 같은 주소로 「위」 자리를 하나 더 쌓는다(history.state[LEAVE_MARK] — 같은 n 이 한 쌍).
//    뒤로 가기 한 번은 「위」 → 「아래」(같은 주소 — 화면 그대로)라 그때 묻는다. 주소를 안 넘기고 쌓아 Next 라우터는 아무것도 다시 그리지 않는다(Next 의 기록 값은 그대로 따라 담는다)
const LEAVE_MARK = "__shopLeave";
type LeaveMark = { at: "below" | "top"; n: number };
const leaveMarkOf = (s: unknown): LeaveMark | null => {
  const m = (s as Record<string, unknown> | null)?.[LEAVE_MARK] as LeaveMark | undefined;
  return m && (m.at === "below" || m.at === "top") && typeof m.n === "number" ? m : null;
};
const pushLeaveTop = (n: number): LeaveMark => {
  const m: LeaveMark = { at: "top", n };
  window.history.pushState({ ...(window.history.state || {}), [LEAVE_MARK]: m }, "");
  return m;
};
// 지금 자리가 이미 「위」면 그대로, 「아래」면 「위」만, 표지 없는 자리면 「아래」로 적고 「위」를 쌓는다
const armLeaveGuard = (): LeaveMark => {
  const cur = leaveMarkOf(window.history.state);
  if (cur?.at === "top") return cur;
  const n = cur ? cur.n : Date.now();
  if (!cur) window.history.replaceState({ ...(window.history.state || {}), [LEAVE_MARK]: { at: "below", n } }, "");
  return pushLeaveTop(n);
};

export default function AdminShopPage() {
  const { isAdmin, gate } = useAdminGuard();
  const { notify, noticeEl } = useNotice();
  // 가벼운 조작(끌어서 순서 저장 · 그룹 관리)의 결과 한 줄
  const { toast, toastEl } = useToast();

  const searchParams = useSearchParams();
  // 상점 카드의 '수정' 링크(?edit=<id>)는 탭 없이 들어오므로 상품 탭으로 보낸다
  const tabParam = searchParams.get("tab") || (searchParams.get("edit") ? "products" : "items");
  const tab = TAB_META[tabParam] ? tabParam : "items";

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
  const [productView, setProductView] = useState("");
  // 📌 상품 유형 탭(2026-10-11 운영자 "상품에 제발 탭 좀 나눠줘") — 아이템 탭의 유형 칸과 같은 모양 + 세트. "" = 전체
  const [productType, setProductType] = useState("");
  // 📌 상품 묶음(B안) — 연결 아이템의 그룹 · 상위로 머리줄(세트는 첫 구성 아이템 그룹 — lib/productOrder.js). 펼친 그룹(기본 접힘) · 접은 상위(기본 펼침)
  const [openProductGroups, setOpenProductGroups] = useState<Set<string>>(() => new Set());
  const [closedProductSections, setClosedProductSections] = useState<Set<string>>(() => new Set());
  const [syncAsk, setSyncAsk] = useState(false);
  const [bannerView, setBannerView] = useState("");
  // 📌 배너 노출 위치 탭 — 위치마다 따로 보여 주고 그 안에서 끌어 순서를 바꾼다(2026-10-11 운영자 "배너도 노출 순서 편하게")
  const [bannerPlace, setBannerPlace] = useState("home");
  // 📌 이벤트 테마(lib/shopThemes.js · app/api/shop/themes) — 상품 폼 고르기 칸 · 배너 위치 · 배너 링크 · 테마 관리 창이 같이 쓴다(fetchAll 이 받는다).
  //    받기 전엔 기본 목록(설정이 없을 때와 같은 할로윈 하나) — 받은 뒤 배너 위치 칸이 한 칸 늘었다 줄지 않게. 못 받으면 지금 값 그대로
  const [themes, setThemes] = useState<ShopTheme[]>(() => DEFAULT_THEMES.map((t) => ({ ...t })));
  const [themeManageOpen, setThemeManageOpen] = useState(false);
  const [couponView, setCouponView] = useState("");
  // 📌 순서 — 아이템 · 상품 목록은 늘 줄 앞 손잡이로 끌어 옮기고, 놓으면 바로 저장한다(2026-10-11 운영자 — '순서 바꾸기' 모드 · 단추를 걷었다).
  //    savingOrder: 저장 중인 목록(그동안 끌기만 잠근다)
  const [savingOrder, setSavingOrder] = useState<"" | "reg" | "product" | "banner">("");
  // 📌 아이템 그룹 — regGroup: 그룹 거르기(GROUP_ALL · GROUP_NONE · "g:<이름>"), openGroups: 펼친 그룹(기본 접힘), regGroupSaved: 서버에 둔 그룹 차례(빈 그룹 포함)
  //    groupMode: 그룹 지정 모드(줄 · 머리줄 고르기 칸을 눌러 고른다 · 펼침은 openGroups 그대로), groupPick: 고른 아이템 id,
  //    groupName: 아래 띠의 옮길 그룹(null = 아직 안 고름 — 옮기기를 잠근다. 모르고 눌러 그룹이 풀리지 않게), groupPending: 새 그룹 칸이 비어 있음
  const [regGroup, setRegGroup] = useState(GROUP_ALL);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [regGroupSaved, setRegGroupSaved] = useState<string[]>([]);
  // 상위 그룹 — regParents: 상위 차례, regParentOf: 그룹 → 상위, closedSections: 목록에서 접은 상위(기본 펼침)
  const [regParents, setRegParents] = useState<string[]>([]);
  const [regParentOf, setRegParentOf] = useState<Record<string, string>>({});
  const [closedSections, setClosedSections] = useState<Set<string>>(() => new Set());
  const [groupManageOpen, setGroupManageOpen] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupPick, setGroupPick] = useState<Set<string>>(() => new Set());
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupPending, setGroupPending] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  useEffect(() => { setGroupMode(false); setGroupPick(new Set()); setGroupName(null); }, [tab]);

  // 상품 폼 — 상태 모양·기간·유형·아이템 적용 규칙은 app/arctic/productForm 공용 (상점 인라인 폼과 같다)
  const emptyForm = EMPTY_PRODUCT_FORM;
  const [form, setForm] = useState<ProductForm>(emptyForm);
  // 📌 한 번에 수정(2026-10-11 운영자 "하나 바꾸고 하나 바꾸고 … 전체 수정으로 한 번에") — 상세 칸에서 고친 폼은 다른 줄을 열거나 칸을 닫아도
  //    버리지 않고 여기에 쌓는다(종류마다 id → 폼). 아래 띠 「전체 수정」이 쌓인 것 + 지금 열린 것을 차례로 저장하고, 실패한 것만 남긴다.
  //    상세 칸 「수정 저장」은 그 하나만 바로(그 줄은 여기서 빠진다). 새로 등록하기는 지금처럼 바로 저장 — 쌓지 않는다
  const [pending, setPending] = useState<{ reg: Record<string, ItemForm>; product: Record<string, ProductForm>; banner: Record<string, any> }>({ reg: {}, product: {}, banner: {} });
  const [savingAll, setSavingAll] = useState(false);
  // 📌 「등록된 아이템」 고르는 중(아직 안 고름 — 저절로 첫 아이템을 고르지 않는다) · 아이템을 고르기 직전의 직접 설정 값.
  //    폼마다(form.id || "new") — 다른 상품을 열면 자연히 풀린다(productForm customSnapOf · unlinkItem)
  const [linkPick, setLinkPick] = useState<string | null>(null);
  const [customSnap, setCustomSnap] = useState<{ key: string; snap: CustomSnap } | null>(null);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const selectedRole = guildRoles.find((r) => r.id === form.roleId);
  const linked = isLinked(form);
  const formKey = form.id || "new";
  // 세트 상품(lib/bundle.js) — 아이템 연결 · 역할 · 판매 방식 · 시즌 동작 대신 구성 편집
  const bundleOn = isBundleForm(form);

  const closePane = useCallback(() => { setPane(""); setIsRoleOpen(false); }, []);

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
  // 실사이트 읽기 전용 — 아이템 · 상품 · 배너의 저장 · 새로 만들기 · 삭제 · 끌기 · 표시 토글을 자리를 지킨 채 잠근다(쿠폰 · 구매 내역 · 시즌 전환 · 설정은 그대로)
  const liveLocked = draft.liveLocked;
  // "" | "publish" | "discard" — 머리 단추의 확인 창 · revertAsk: 되돌릴 초안 한 건 · draftBusy: 처리 중인 요청
  const [draftAsk, setDraftAsk] = useState<"" | "publish" | "discard">("");
  const [revertAsk, setRevertAsk] = useState<DraftRow | null>(null);
  const [draftBusy, setDraftBusy] = useState<"" | "publish" | "discard" | "revert">("");

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
  // 상세 칸 「몸값 참고」 펼침 — 다른 줄을 열어도 그대로(기본 펼침)
  const [worthOpen, setWorthOpen] = useState(true);

  const pendingInv = invRoles.filter((r) => r.visible !== false && !regItems.some((i) => i.roleId === r.roleId));

  // 서버가 준 상위 그룹(parents · parentOf)을 받아 둔다 — 응답에 없으면(옛 응답) 지금 값 그대로
  const takeParents = useCallback((d: any) => {
    if (Array.isArray(d?.parents)) setRegParents(d.parents.map(String));
    if (d?.parentOf && typeof d.parentOf === "object" && !Array.isArray(d.parentOf)) {
      setRegParentOf(Object.fromEntries(Object.entries(d.parentOf).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => [k, String(v)])));
    }
  }, []);
  const fetchRegItems = useCallback(() => {
    Promise.all([
      fetch("/api/admin/items?withUsage=1&groups=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/inventory-role", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([reg, inv]) => {
      setRegItems(Array.isArray(reg?.data) ? reg.data : []);
      // 그룹 차례 — 못 읽으면 지금 값 그대로(아이템에 든 그룹은 목록 순서로 뒤에 붙는다)
      if (Array.isArray(reg?.groups)) setRegGroupSaved(reg.groups.map(String));
      takeParents(reg);
      setInvRoles(Array.isArray(inv?.data) ? inv.data : []);
    }).finally(() => {
      // 초안 요약은 목록을 받은 뒤에 — 목록 조회(?groups=1)가 떨어진 그룹 덩어리를 맞춰 쓰면(초안 모드는 순서 초안) 그것까지 센다
      fetchDraft();
    });
  }, [fetchDraft, takeParents]);

  // 📌 꾸미기 효과(카드 스킨 · 아바타 테두리)로 새 아이템 채우기 — 이름 · 아이콘 · 그룹이 비었거나 앞서 자동으로 채운 값 그대로일 때만
  //    (친 값은 건드리지 않는다). 효과를 바꾸면 따라 바뀌고, 꾸미기 효과를 빼면 자동으로 채운 값만 비운다. 수정(id 있음)에는 하지 않는다.
  //    값 꼴은 추천 아이템과 같다(lib/cosmeticArt cosmeticAutoOf — "카드 스킨 · <이름>" · 그룹 시즌 2 / 등급 카드 스킨 / 등급 아바타 테두리 / 할로윈)
  const withCosmeticAuto = (prev: ItemForm, next: ItemForm): ItemForm => {
    if (next.id) return next;
    const autoOf = (f: ItemForm) => { for (const d of f.effects) { const a = cosmeticAutoOf(d); if (a) return a; } return null; };
    const was = autoOf(prev);
    const now = autoOf(next);
    if (was?.name === now?.name && was?.icon === now?.icon && was?.group === now?.group) return next;
    const pick = (cur: string, k: "name" | "icon" | "group") => (cur.trim() === "" || (was != null && cur === was[k]) ? (now ? now[k] : "") : cur);
    return { ...next, name: pick(next.name, "name"), icon: pick(next.icon, "icon"), group: pick(next.group, "group") };
  };

  // 저장된 아이템 → 폼 값(목록 줄을 눌러 열 때 · 한 번에 수정의 "바뀌었나" 견줄 바탕)
  const regFormOf = (it: any): ItemForm => {
    // 효과는 GET 이 아이템 문서에서 읽어 붙여 준 값 (없으면 0 / [])
    const ef = it.effects || {};
    const list = Array.isArray(ef.list) ? ef.list : [];
    return {
      id: it._id, name: it.name || "", description: it.description || "", type: it.type || "item", roleId: it.roleId || "",
      icon: it.icon || "", imageUrl: it.imageUrl || "", color: it.color || "", detachOnSeason: !!it.detachOnSeason,
      visible: it.visible !== false, group: groupOfItem(it),
      chatBuffXp: ef.chatBuffXp ? String(ef.chatBuffXp) : "", voiceBuffXp: ef.voiceBuffXp ? String(ef.voiceBuffXp) : "",
      attendBuffXp: ef.attendBuffXp ? String(ef.attendBuffXp) : "",
      effects: list.map(draftOf),
    };
  };
  const fillRegForm = (it: any) => setItemForm(regFormOf(it));

  // 아이템 폼 → 저장 본문(검사 실패면 error) — 상세 칸 「수정 저장」과 「전체 수정」이 같은 길
  const regBody = (fm: ItemForm): { body: any; group: string } | { error: string } => {
    if (!fm.name.trim()) return { error: "이름을 입력해 주세요." };
    if ((fm.type === "role" || fm.type === "perk") && !fm.roleId) return { error: "연결할 역할을 선택해 주세요." };
    // 📌 효과 — 기프트카드를 뺀 모든 아이템(역할 연결 여부와 무관). 값이 빈 줄은 서버가 말없이 버리므로 저장 전에 막는다.
    //    아이템 문서에 같이 저장되므로 늘 보낸다(전부 비운 것도 그대로 저장돼야 지워진다). 기프트카드는 보내지 않는다(서버가 비움)
    const { chatBuffXp, voiceBuffXp, attendBuffXp, effects: effDrafts, ...base } = fm;
    let effects: { chatBuffXp: number; voiceBuffXp: number; attendBuffXp: number; list: ReturnType<typeof effectOf>[] } | undefined;
    if (base.type !== "physical") {
      const bad = effDrafts.findIndex((d) => normalizeEffects([effectOf(d)]).length === 0);
      if (bad >= 0) return { error: `추가 효과 ${bad + 1}번째 줄의 값을 입력해 주세요.` };
      effects = { chatBuffXp: xpNum(chatBuffXp), voiceBuffXp: xpNum(voiceBuffXp), attendBuffXp: xpNum(attendBuffXp), list: effDrafts.map(effectOf) };
    }
    const group = normalizeItemGroup(base.group);
    return { group, body: { ...base, group, roleName: guildRoles.find((r) => r.id === base.roleId)?.name || "", ...(effects ? { effects } : {}) } };
  };
  const saveRegItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReg) return;
    // 단추는 잠겨 있다 — 입력칸 Enter 로 들어온 제출만 여기서 막는다
    if (liveLocked) return notify(LIVE_LOCKED_MSG, true);
    const built = regBody(itemForm);
    if ("error" in built) return notify(built.error, true);
    setIsSavingReg(true);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSavingReg(false);
    if (res?.ok && d?.success) {
      // 넣은 그룹은 펼쳐 둔다 — 저장한 아이템이 접힌 머리줄 속으로 사라져 보이지 않게
      if (built.group) setOpenGroups((s) => new Set(s).add(built.group));
      dropPending("reg", itemForm.id);
      setItemForm(EMPTY_ITEM_FORM); fetchRegItems(); fetchAll(); closePane(); notify("저장되었습니다.");
    }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // 표시 토글 — 목록에서 바로 켜고 끈다 (폼을 열지 않아도 되게)
  const [visBusy, setVisBusy] = useState("");
  const toggleRegVisible = async (it: any) => {
    if (visBusy || liveLocked) return;
    setVisBusy(it._id);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // 효과는 빼고 보낸다 — 표시 토글이 아이템 효과를 다시 쓰지 않게(효과가 없으면 서버가 효과 칸을 건드리지 않는다. undefined 는 JSON 에서 빠진다).
      //    순서(sortOrder)도 빼고 — 화면에 든 값으로 덮어 순서가 흔들리지 않게(순서는 끌기 · 그룹 지정만 바꾼다)
      body: JSON.stringify({ ...it, effects: undefined, sortOrder: undefined, id: it._id, visible: it.visible === false }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { fetchRegItems(); notify(it.visible === false ? "인벤토리에 표시합니다." : "인벤토리에서 숨깁니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
    setVisBusy("");
  };

  const importInvRoles = async () => {
    if (isImporting || liveLocked) return;
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
    if (!d?.success || !Array.isArray(d.data)) return notify("구매 내역을 더 불러오지 못했습니다.", true);
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

  const saveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveLocked) return notify(LIVE_LOCKED_MSG, true);
    // 순서는 보내지 않는다 — 새 배너 · 위치를 바꾼 배너는 서버가 그 위치 맨 뒤에, 그 밖은 저장된 순서 그대로(폼을 연 뒤 끌어서 바꾼 순서를 덮지 않게)
    const res = await fetch("/api/shop/banners", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...bannerForm, sortOrder: undefined }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { dropPending("banner", bannerForm.id); setBannerForm(EMPTY_BANNER); fetchAll(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  // 목록 줄 → 배너 폼 (예전 '수정' 단추 안의 값 그대로)
  const bannerFormOf = (b: any) => ({ id: b._id, imageUrl: b.imageUrl, mobileImageUrl: b.mobileImageUrl || "", title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", placement: bannerPlaceOf(b), sortOrder: String(b.sortOrder || 0), active: b.active });
  const fillBannerForm = (b: any) => setBannerForm(bannerFormOf(b));

  // ── 한 번에 수정 — 목록이 바뀌면(표시 토글 · 끌어서 그룹 옮기기 · 그룹 지정 · 그룹 이름 바꾸기 · 초안 되돌리기 · 저장 뒤 다시 읽기)
  //    열린 폼 · 쌓인 폼을 새 저장 값 위로 옮긴다 — 고친 칸만 그대로(「전체 수정」 · 「수정 저장」이 목록에서 바꾼 값을 옛 값으로 되돌리지 않게).
  //    렌더 중 조정(이펙트로 한 박자 늦지 않게). 줄이 목록에서 사라졌으면 그대로 둔다(못 읽은 빈 목록에 고친 것이 지워지지 않게)
  const [seenRows, setSeenRows] = useState({ reg: regItems, product: items, banner: banners });
  if (seenRows.reg !== regItems || seenRows.product !== items || seenRows.banner !== banners) {
    const prev = seenRows;
    setSeenRows({ reg: regItems, product: items, banner: banners });
    const onto = (fm: any, was: any[], now: any[], formOf: (r: any) => any) => {
      const id = String(fm?.id || "");
      const a = id ? was.find((x) => String(x._id) === id) : null;
      const b = id ? now.find((x) => String(x._id) === id) : null;
      if (!a || !b) return fm;
      const fa = formOf(a), fb = formOf(b);
      return sameForm(fa, fb) ? fm : rebaseForm(fm, fa, fb);
    };
    const kinds = [
      { k: "reg" as const, was: prev.reg, now: regItems, formOf: regFormOf as (r: any) => any },
      { k: "product" as const, was: prev.product, now: items, formOf: formFromShopItem as (r: any) => any },
      { k: "banner" as const, was: prev.banner, now: banners, formOf: bannerFormOf as (r: any) => any },
    ].filter((x) => x.was !== x.now);
    for (const { k, was, now, formOf } of kinds) {
      if (k === "reg") { const f = onto(itemForm, was, now, formOf); if (f !== itemForm) setItemForm(f); }
      if (k === "product") { const f = onto(form, was, now, formOf); if (f !== form) setForm(f); }
      if (k === "banner") { const f = onto(bannerForm, was, now, formOf); if (f !== bannerForm) setBannerForm(f); }
    }
    if (kinds.length) {
      setPending((p) => {
        let changed = false;
        const out = { ...p } as Record<"reg" | "product" | "banner", Record<string, any>>;
        for (const { k, was, now, formOf } of kinds) {
          const next: Record<string, any> = {};
          for (const [id, fm] of Object.entries(p[k] as Record<string, any>)) {
            const nf = onto(fm, was, now, formOf);
            if (nf === fm) { next[id] = fm; continue; }
            changed = true;
            // 옮기고 나니 저장 값과 같아졌으면(목록에서 같은 값으로 바꿨다) 고친 것에서 뺀다
            const row = now.find((x) => String(x._id) === id);
            if (!(row && sameForm(nf, formOf(row)))) next[id] = nf;
          }
          out[k] = next;
        }
        return changed ? (out as typeof p) : p;
      });
    }
  }

  // ── 한 번에 수정 — 지금 열린 폼이 저장된 값과 다른가(새로 쓰는 폼 · 목록에 없는 것은 아니다) ──
  const regSavedRow = itemForm.id ? regItems.find((x) => String(x._id) === String(itemForm.id)) : null;
  const prodSavedRow = form.id ? items.find((x) => String(x._id) === String(form.id)) : null;
  const banSavedRow = bannerForm.id ? banners.find((x) => String(x._id) === String(bannerForm.id)) : null;
  const regEditDirty = !!regSavedRow && !sameForm(itemForm, regFormOf(regSavedRow));
  const prodEditDirty = !!prodSavedRow && !sameForm(form, formFromShopItem(prodSavedRow));
  const banEditDirty = !!banSavedRow && !sameForm(bannerForm, bannerFormOf(banSavedRow));
  const dropPending = (kind: "reg" | "product" | "banner", id: string) => {
    if (!id) return;
    setPending((p) => {
      if (!(id in p[kind])) return p;
      const next = { ...p[kind] } as Record<string, any>;
      delete next[id];
      return { ...p, [kind]: next };
    });
  };
  // 지금 열린 폼 중 고친 것을 쌓고 폼은 비운다(다른 줄을 열기 전 · 칸을 닫을 때 · 탭을 옮길 때)
  const stashEdits = () => {
    if (!regEditDirty && !prodEditDirty && !banEditDirty) return;
    setPending((p) => ({
      reg: regEditDirty ? { ...p.reg, [String(itemForm.id)]: itemForm } : p.reg,
      product: prodEditDirty ? { ...p.product, [String(form.id)]: form } : p.product,
      banner: banEditDirty ? { ...p.banner, [String(bannerForm.id)]: bannerForm } : p.banner,
    }));
    if (regEditDirty) setItemForm(EMPTY_ITEM_FORM);
    if (prodEditDirty) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); }
    if (banEditDirty) setBannerForm(EMPTY_BANNER);
  };
  // 줄 열기 — 쌓아 둔 고친 값이 있으면 그것으로(쌓인 데서는 뺀다 — 지금 열린 폼이 된다), 없으면 저장된 값으로
  const openRegRow = (it: any) => {
    const id = String(it._id);
    if (savingAll || (pane === "reg" && String(itemForm.id) === id)) return;
    stashEdits();
    const kept = pending.reg[id];
    if (kept) { dropPending("reg", id); setItemForm(kept); } else fillRegForm(it);
    setPane("reg");
  };
  const openProductRow = (it: any) => {
    const id = String(it._id);
    if (savingAll || (pane === "product" && String(form.id) === id)) return;
    stashEdits();
    const kept = pending.product[id];
    if (kept) { dropPending("product", id); setForm(kept); setLinkPick(null); setCustomSnap(null); } else fillItemForm(it);
    setIsRoleOpen(false);
    setPane("product");
  };
  const openBannerRow = (b: any) => {
    const id = String(b._id);
    if (savingAll || (pane === "banner" && String(bannerForm.id) === id)) return;
    stashEdits();
    const kept = pending.banner[id];
    if (kept) { dropPending("banner", id); setBannerForm(kept); } else fillBannerForm(b);
    setPane("banner");
  };
  // 칸 닫기 — 고친 것은 쌓아 둔다(버리지 않는다)
  const closeEditPane = () => { stashEdits(); closePane(); };
  // 고친 것 목록(쌓인 것 + 지금 열린 고친 폼) — 띠 · 줄 표시 · 전체 수정이 같이 쓴다
  type EditJob = { kind: "reg" | "product" | "banner"; id: string; name: string; form: any };
  const editJobs: EditJob[] = [
    ...Object.entries(pending.reg).map(([id, fm]) => ({ kind: "reg" as const, id, name: fm.name || "이름 없음", form: fm })),
    ...(regEditDirty && !pending.reg[String(itemForm.id)] ? [{ kind: "reg" as const, id: String(itemForm.id), name: itemForm.name || "이름 없음", form: itemForm }] : []),
    ...Object.entries(pending.product).map(([id, fm]) => ({ kind: "product" as const, id, name: fm.name || "이름 없음", form: fm })),
    ...(prodEditDirty && !pending.product[String(form.id)] ? [{ kind: "product" as const, id: String(form.id), name: form.name || "이름 없음", form }] : []),
    ...Object.entries(pending.banner).map(([id, fm]) => ({ kind: "banner" as const, id, name: fm.title || "제목 없는 배너", form: fm })),
    ...(banEditDirty && !pending.banner[String(bannerForm.id)] ? [{ kind: "banner" as const, id: String(bannerForm.id), name: bannerForm.title || "제목 없는 배너", form: bannerForm }] : []),
  ];
  const editedIds = new Set(editJobs.map((j) => j.id));
  const EDIT_KIND: Record<EditJob["kind"], string> = { reg: "아이템", product: "상품", banner: "배너" };
  // 되돌리기 — 쌓인 것 · 지금 열린 폼을 모두 저장된 값으로(지금 열린 줄은 저장된 값으로 다시 연다)
  const discardEdits = () => {
    setPending({ reg: {}, product: {}, banner: {} });
    if (regSavedRow) setItemForm(regFormOf(regSavedRow));
    if (prodSavedRow) { setForm(formFromShopItem(prodSavedRow)); setLinkPick(null); setCustomSnap(null); }
    if (banSavedRow) setBannerForm(bannerFormOf(banSavedRow));
    toast("고친 것을 되돌렸습니다.");
  };
  // 전체 수정 — 쌓인 것 + 지금 열린 고친 폼을 차례로 저장(검사 · 본문은 상세 칸 저장과 같은 길). 실패한 것만 남기고 무엇이 왜 실패했는지 알린다
  const saveAllEdits = async () => {
    if (savingAll || liveLocked || editJobs.length === 0) return;
    const jobs = editJobs;
    // 📌 열린 상품 폼이 「등록된 아이템」을 고르는 중인데 아이템을 아직 안 골랐다 — 상세 칸 「수정 저장」과 같이 막는다(직접 설정 상품으로 저장되지 않게).
    //    그 폼은 칸을 연 채 고친 그대로 남긴다(쌓아 두면 고르는 중이 풀려 다시 열 때 직접 설정으로 보인다)
    const holdOpen = pane === "product" && !!form.id && !isBundleForm(form) && !linked && linkPick === formKey;
    const isHeld = (j: EditJob) => holdOpen && j.kind === "product" && j.form === form;
    // 고친 폼 칸은 먼저 닫는다(저장하는 동안 더 고치지 않게 — 그 폼은 jobs 에 들어 있다). 새로 쓰던 폼 칸 · 위 고르는 중인 칸은 그대로
    if ((pane === "reg" && itemForm.id) || (pane === "product" && form.id && !holdOpen) || (pane === "banner" && bannerForm.id)) closePane();
    setSavingAll(true);
    const failed: (EditJob & { why: string })[] = [];
    for (const j of jobs) {
      if (isHeld(j)) { failed.push({ ...j, why: "아이템을 선택해 주세요." }); continue; }
      const built = j.kind === "reg" ? regBody(j.form) : j.kind === "product" ? productBody(j.form) : { body: { ...j.form, sortOrder: undefined } };
      if ("error" in built) { failed.push({ ...j, why: built.error }); continue; }
      const url = j.kind === "reg" ? "/api/admin/items" : j.kind === "product" ? "/api/shop/items" : "/api/shop/banners";
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(built.body) }).catch(() => null);
      const d = await res?.json().catch(() => null);
      if (!(res?.ok && d?.success)) failed.push({ ...j, why: d?.message || "저장에 실패했습니다." });
    }
    setSavingAll(false);
    // 실패한 것만 남긴다 — 수정 폼(id 있음)은 비운다(실패했으면 쌓인 쪽에 들어 있다). 새로 쓰던 폼(id 없음)은 그대로 이어 쓴다
    const left = { reg: {} as Record<string, ItemForm>, product: {} as Record<string, ProductForm>, banner: {} as Record<string, any> };
    // 고르는 중이라 막은 열린 폼은 쌓지 않는다 — 열린 폼 그대로가 고친 것이다(아래 띠 수에 그대로 든다)
    for (const j of failed) if (!isHeld(j)) (left[j.kind] as Record<string, any>)[j.id] = j.form;
    setPending(left);
    setItemForm((f) => (f.id ? EMPTY_ITEM_FORM : f));
    if (form.id && !holdOpen) { setLinkPick(null); setCustomSnap(null); }
    if (!holdOpen) setForm((f) => (f.id ? emptyForm : f));
    setBannerForm((f: any) => (f.id ? EMPTY_BANNER : f));
    fetchRegItems();
    fetchAll();
    if (failed.length) notify(`${(jobs.length - failed.length).toLocaleString()}개 저장 · ${failed.length.toLocaleString()}개 실패\n${failed.map((x) => `${EDIT_KIND[x.kind]} ${x.name}: ${x.why}`).join("\n")}`, true);
    else toast(`${jobs.length.toLocaleString()}개를 저장했습니다.`);
  };
  // 저장 안 한 게 남은 채 페이지를 떠나면 묻는다 — 새로 고침 · 닫기(beforeunload) · 다른 관리 화면으로 가는 링크 · 뒤로 가기(아래 표지)
  const unsavedN = editJobs.length;
  // 뒤로 가기 표지 — unsavedRef: 고친 수(기록 이벤트 안에서 읽는다) · lastLeaveMark: 마지막으로 본 자리의 표지 · leavingRef: 나가기로 해 한 번 더 뒤로 가는 중
  const unsavedRef = useRef(0);
  const lastLeaveMark = useRef<LeaveMark | null>(null);
  const leavingRef = useRef(false);
  // 나가기로 한 뒤 다른 문서로 넘어가는 중(beforeunload 를 지났다)
  const unloadingRef = useRef(false);
  useEffect(() => { unsavedRef.current = unsavedN; }, [unsavedN]);
  useEffect(() => {
    if (!unsavedN) return;
    // 뒤로 가기로 나가기로 이미 답했으면 브라우저가 한 번 더 묻지 않게
    const onUnload = (e: BeforeUnloadEvent) => { if (leavingRef.current) { unloadingRef.current = true; return; } e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      // 새 탭 · 새 창으로 여는 누르기(가운데 단추 · Ctrl · ⌘ · Shift)는 이 화면이 남는다
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("/admin/shop") || href.startsWith("#")) return; // 같은 화면 탭은 남는다(고친 것은 탭을 옮겨도 그대로)
      if (!window.confirm(leaveAsk(unsavedN))) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onUnload); document.removeEventListener("click", onClick, true); };
  }, [unsavedN]);
  // 📌 뒤로 가기(popstate — 2026-10-11) — 「위」 → 「아래」(같은 n)로 내려오면 묻는다. 남으면 「위」로 앞으로 한 칸, 나가면 한 번 더 뒤로(진짜 이전 화면).
  //    탭 · 주소 바꾸기(?tab= — Next 가 쌓는 자리)는 「위」 위에 쌓여 묻지 않고 오간다. 앞으로 가기로 「아래」에 온 것은 묻지 않는다(지난 자리가 「위」가 아니다).
  //    다 저장해 고친 게 없으면 묻지 않고 한 번 더 뒤로(같은 주소 한 칸 — 뒤로 가기가 헛돌지 않게). 나가기로 했는데 이전 자리도 이 화면이면(이전 탭) 표지를 다시 세운다
  useEffect(() => {
    lastLeaveMark.current = leaveMarkOf(window.history.state);
    const onPop = () => {
      const m = leaveMarkOf(window.history.state);
      const was = lastLeaveMark.current;
      lastLeaveMark.current = m;
      if (leavingRef.current) {
        leavingRef.current = false;
        if (unsavedRef.current > 0 && window.location.pathname.startsWith("/admin/shop")) lastLeaveMark.current = armLeaveGuard();
        return;
      }
      if (m?.at !== "below" || was?.at !== "top" || was.n !== m.n) return;
      const n = unsavedRef.current;
      // 📌 남으면 방금 떠난 「위」 자리로 앞으로 한 칸(새 자리를 쌓지 않는다 — 손댄 적 없는 자리에서 쌓은 기록은 크롬 뒤로 가기가 건너뛰어, 곧바로 또 뒤로 가면 묻지 않고 나갔다)
      if (n > 0 && !window.confirm(leaveAsk(n))) { window.history.forward(); return; }
      leavingRef.current = true;
      unloadingRef.current = false;
      window.history.back();
      // 더 뒤로 갈 데가 없으면(이 탭의 첫 자리) 기록 이벤트가 오지 않는다 — 잠시 뒤에도 그대로면 남은 것으로 보고 표지를 다시 세운다(새로 고침 묻기도 되살아난다).
      //    다른 문서로 나가는 중(beforeunload 를 지남 — 이전 화면이 느리게 뜬다)이면 그대로 둔다
      window.setTimeout(() => {
        if (!leavingRef.current || unloadingRef.current) return;
        leavingRef.current = false;
        if (unsavedRef.current > 0) lastLeaveMark.current = armLeaveGuard();
      }, 1500);
    };
    // 📌 나가기로 한 뒤 앞으로 가기로 이 화면이 되살아나면(bfcache — 고친 것도 그대로 남는다) 나가는 중 표시를 풀고 표지를 다시 세운다.
    //    안 풀면 그다음 나가기는 묻지 않고(beforeunload · 뒤로 가기 모두) 고친 것이 사라졌다
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      leavingRef.current = false;
      unloadingRef.current = false;
      lastLeaveMark.current = unsavedRef.current > 0 ? armLeaveGuard() : leaveMarkOf(window.history.state);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("pageshow", onShow);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("pageshow", onShow); };
  }, []);
  // 고친 게 생기면(0 → 1) 표지를 세운다 — 그 뒤 수가 늘어도 다시 세우지 않는다(다른 탭 자리에서 또 세우면 탭 사이 뒤로 가기에서 묻게 된다)
  const hasUnsaved = unsavedN > 0;
  useEffect(() => {
    if (hasUnsaved) lastLeaveMark.current = armLeaveGuard();
  }, [hasUnsaved]);

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

  // 예전 '코드'를 보상형 쿠폰으로 옮긴다 (여러 번 눌러도 중복되지 않는다) — 예전에 쓴 사람의 사용 기록도 넘긴다(app/api/shop/coupons/migrate)
  //    📌 2026-10-04 "이미 다 옮겼다면 버튼을 없앤다" — 남은 일(옮길 코드 · 넘길 사용 기록)이 있을 때만 버튼을 보인다
  const [isMigrating, setIsMigrating] = useState(false);
  const [legacyLeft, setLegacyLeft] = useState(0);
  const fetchLegacy = useCallback(() => {
    fetch("/api/shop/coupons/migrate", { cache: "no-store" }).then((r) => r.json())
      .then((d) => setLegacyLeft(d?.success ? (Number(d.data?.pending) || 0) + (Number(d.data?.linked) || 0) : 0))
      .catch(() => setLegacyLeft(0));
  }, []);
  const migrateCodes = async () => {
    if (isMigrating) return;
    setIsMigrating(true);
    const res = await fetch("/api/shop/coupons/migrate", { method: "POST" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { notify(d.message || "이전했습니다."); fetchAll(); fetchLegacy(); }
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
  // 예전 코드 남은 일 — 쿠폰 탭을 열 때만 센다(예전 기록을 훑는다)
  useEffect(() => { if (isAdmin && tab === "coupons") fetchLegacy(); }, [isAdmin, tab, fetchLegacy]);

  // ── 설정 (결제 캐시백) ────────────────────────
  //    📌 2026-10-04 "관리자가 정하게 해" — 캐시백 합 상한(%) · 빙옥 결제분 캐시백. 저장은 그 두 칸만(app/api/bot-settings PATCH — 레벨 설정의 다른 값은 건드리지 않는다)
  type ShopSet = { cap: string; onPoint: boolean };
  const [shopSet, setShopSet] = useState<ShopSet | null>(null);
  const [shopSetSnap, setShopSetSnap] = useState<ShopSet | null>(null);
  const [savingShopSet, setSavingShopSet] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetch("/api/bot-settings", { cache: "no-store" }).then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.success) return;
        const r = cashbackRuleOf(d.data);
        const v = { cap: String(r.cap), onPoint: r.onPoint };
        setShopSet(v);
        setShopSetSnap(v);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin]);
  const shopSetChanges: string[] = shopSet && shopSetSnap
    ? [
        shopSet.cap !== shopSetSnap.cap ? `캐시백 상한 ${shopSetSnap.cap}% → ${shopSet.cap || "-"}%` : "",
        shopSet.onPoint !== shopSetSnap.onPoint ? `빙옥 결제분 ${shopSetSnap.onPoint ? "포함" : "제외"} → ${shopSet.onPoint ? "포함" : "제외"}` : "",
      ].filter(Boolean)
    : [];
  const saveShopSet = async () => {
    if (!shopSet || savingShopSet) return;
    const cap = Number(shopSet.cap);
    if (shopSet.cap.trim() === "" || !Number.isInteger(cap) || cap < 0 || cap > 100) return notify("캐시백 상한은 0~100 사이의 정수로 입력해 주세요.", true);
    setSavingShopSet(true);
    const res = await fetch("/api/bot-settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopCashbackCap: cap, cashbackOnPoint: shopSet.onPoint }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setSavingShopSet(false);
    if (res?.ok && d?.success) {
      const r = cashbackRuleOf(d.data);
      const v = { cap: String(r.cap), onPoint: r.onPoint };
      setShopSet(v);
      setShopSetSnap(v);
      notify("저장되었습니다.");
    } else notify(d?.message || "저장에 실패했습니다.", true);
  };

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
  const fillItemForm = useCallback((it: any) => { setForm(formFromShopItem(it)); setLinkPick(null); setCustomSnap(null); }, []);

  // 📌 상점 카드의 '수정' 링크(?edit=<id>)로 들어오면 해당 상품을 폼에 채워 둔다
  //    처음 한 번만 채우고 연다 — 저장 뒤 목록을 다시 불러와도 칸이 저절로 다시 열리거나 다른 상품을 고치던 폼을 덮지 않게
  const editId = searchParams.get("edit");
  const editOpened = useRef<string | null>(null);
  useEffect(() => {
    if (!editId || items.length === 0 || editOpened.current === editId) return;
    const it = items.find((x) => x._id === editId);
    if (!it) return;
    editOpened.current = editId;
    fillItemForm(it);
    setPane("product");
  }, [editId, items, fillItemForm]);

  // 📌 탭을 옮기면 열린 상세 칸 · 검색어를 비운다 (렌더 중 조정 — 이펙트로 한 박자 늦게 닫히지 않게)
  const [paneTab, setPaneTab] = useState(tab);
  if (paneTab !== tab) {
    setPaneTab(tab);
    stashEdits();
    setPane("");
    setOrderSelId(null);
    setQ("");
    setIsRoleOpen(false);
  }

  // 상품 폼 → 저장 본문(검사 실패면 error) — 상세 칸 「수정 저장」과 「전체 수정」이 같은 길
  const productBody = (fm: ProductForm): { body: any } | { error: string } => {
    // 📌 판매 방식마다 꼭 필요한 가격 — 상점 인라인 폼과 같은 문구(productForm saleModeError)
    const bad = saleModeError(fm) || bundleError(fm);
    if (bad) return { error: bad };
    // 세트 — 역할 · 쌓이지 않는 아이템 줄은 1개로 보낸다(개수 칸이 잠겨 1로 보이는 값 그대로)
    const sendForm = isBundleForm(fm) ? { ...fm, bundle: fm.bundle.map((r) => (qtyLockedOf(regItems, items, r.itemId) ? { ...r, qty: "1" } : r)) } : fm;
    return { body: { ...toPayload(sendForm, guildRoles.find((r) => r.id === fm.roleId)?.name || ""), sortOrder: undefined } };
  };
  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (liveLocked) return notify(LIVE_LOCKED_MSG, true);
    // 「등록된 아이템」을 골랐는데 아이템을 아직 안 골랐다 — 직접 설정 상품으로 저장되지 않게 막는다
    if (!isBundleForm(form) && !linked && linkPick === formKey) return notify("아이템을 선택해 주세요.", true);
    const built = productBody(form);
    if ("error" in built) return notify(built.error, true);
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(built.body),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { dropPending("product", form.id); setForm(emptyForm); setLinkPick(null); setCustomSnap(null); fetchAll(); fetchRegItems(); closePane(); notify("저장되었습니다."); }
    else notify(d?.message || "저장에 실패했습니다.", true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    if (liveLocked && deleteTarget.kind !== "coupon") { setDeleteTarget(null); return notify(LIVE_LOCKED_MSG, true); }
    const api = { item: "/api/shop/items", banner: "/api/shop/banners", coupon: "/api/shop/coupons", reg: "/api/admin/items" }[deleteTarget.kind];
    const res = await fetch(`${api}?id=${deleteTarget.id}`, { method: "DELETE" }).catch(() => null);
    const d = await res?.json().catch(() => null);
    // 지운 줄의 상세 칸은 닫는다
    if (res?.ok) { fetchAll(); fetchRegItems(); closePane(); toast("삭제했습니다."); }
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
      return notify("목록이 바뀌었습니다. 다시 불러온 뒤 옮겨 주세요.", true);
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
      notify(d?.message || (regrouped ? "그룹을 저장하지 못했습니다." : "순서를 저장하지 못했습니다."), true);
      if (res?.status === 409) fetchRegItems();
    }
  };
  const saveRegMove = async (keys: string[], moved: string) => {
    if (savingOrder || liveLocked) return;
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
  const saveRegDrop = async (drop: TableRowDrop) => {
    if (savingOrder || liveLocked) return;
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
      notify(d?.message || "순서를 저장하지 못했습니다.", true);
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
      notify(d?.message || "순서를 저장하지 못했습니다.", true);
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
      notify(d?.message || "순서를 저장하지 못했습니다.", true);
    }
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
    } else notify(d?.message || "순서를 저장하지 못했습니다.", true);
  };
  const toggleProductGroup = (g: string) => setOpenProductGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const toggleProductSection = (p: string) => setClosedProductSections((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });

  // ── 아이템 그룹 ──
  const toggleGroup = (g: string) => setOpenGroups((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
  const toggleSection = (p: string) => setClosedSections((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  // 그룹 지정 모드 — 켜고 끄기는 도구 줄 "그룹 지정"(누름 표시) · 아래 띠 "취소". 옮길 그룹은 띠에서 고른다(처음엔 안 고른 채 — 옮기기 잠금)
  const startGroupMode = () => { closePane(); setGroupPick(new Set()); setGroupName(null); setGroupPending(false); setGroupMode(true); };
  const cancelGroupMode = () => { setGroupMode(false); setGroupPick(new Set()); setGroupName(null); setGroupPending(false); };
  const togglePick = (id: string) => setGroupPick((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // 여러 개 한 번에 — 모두 골라져 있으면 모두 풀고, 아니면 모두 고른다(머리줄 고르기 칸 · 전체 선택)
  const togglePickMany = (ids: string[]) => setGroupPick((s) => {
    const all = ids.length > 0 && ids.every((id) => s.has(id));
    const n = new Set(s);
    for (const id of ids) { if (all) n.delete(id); else n.add(id); }
    return n;
  });
  const applyGroup = async () => {
    if (groupBusy || groupPick.size === 0 || groupName === null || groupPending) return;
    const ids = [...groupPick];
    const group = normalizeItemGroup(groupName);
    setGroupBusy(true);
    const res = await fetch("/api/admin/items", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, group }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setGroupBusy(false);
    if (res?.ok && d?.success) {
      // 다시 불러오기 전에 화면 목록부터 맞춘다(그룹 · 서버가 쓴 순서 — 그 그룹 덩어리 끝, 뺀 것은 옛 덩어리 바로 뒤) · 넣은 그룹은 펼쳐 둔다
      const set = new Set(ids);
      const order: string[] | null = Array.isArray(d.order) ? d.order.map(String) : null;
      setRegItems((list) => {
        const regrouped = list.map((it) => (set.has(String(it._id)) ? { ...it, group } : it));
        return order ? reorderById(regrouped, order) : regrouped;
      });
      if (Array.isArray(d.groups)) setRegGroupSaved(d.groups.map(String));
      takeParents(d);
      if (group) setOpenGroups((s) => new Set(s).add(group));
      cancelGroupMode();
      fetchRegItems();
      notify(group ? `${ids.length}개를 '${group}' 그룹으로 옮겼습니다.` : `${ids.length}개를 그룹에서 뺐습니다.`);
    } else notify(d?.message || "그룹을 저장하지 못했습니다.", true);
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
  const renamePendingGroup = (from: string, to: string) => setPending((p) => {
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
      setClosedSections((s) => { if (!s.has(from)) return s; const n = new Set(s); n.delete(from); n.add(to); return n; });
      setRegGroup((v) => (v === `p:${from}` ? `p:${to}` : v));
    }
    if (c.op === "parentDelete" && c.name) {
      const name = c.name;
      setClosedSections((s) => { if (!s.has(name)) return s; const n = new Set(s); n.delete(name); return n; });
      setRegGroup((v) => (v === `p:${name}` ? GROUP_ALL : v));
    }
    if (c.op === "rename" && c.from && c.to) {
      const { from, to } = c;
      setRegItems((list) => list.map((it) => (groupOfItem(it) === from ? { ...it, group: to } : it)));
      setOpenGroups((s) => { if (!s.has(from)) return s; const n = new Set(s); n.delete(from); n.add(to); return n; });
      setRegGroup((v) => (v === `g:${from}` ? `g:${to}` : v));
      setItemForm((f) => (normalizeItemGroup(f.group) === from ? { ...f, group: to } : f));
      renamePendingGroup(from, to);
    }
    if (c.op === "delete" && c.name) {
      const name = c.name;
      setRegItems((list) => list.map((it) => (groupOfItem(it) === name ? { ...it, group: "" } : it)));
      setRegGroup((v) => (v === `g:${name}` ? GROUP_ALL : v));
      setItemForm((f) => (normalizeItemGroup(f.group) === name ? { ...f, group: "" } : f));
      renamePendingGroup(name, "");
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
  const reloadCatalog = () => { fetchRegItems(); fetchAll(); };
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
    if (!ok) return notify(d?.message || "반영하지 못했습니다.", true);
    const skipped: DraftWarn[] = Array.isArray(d.skipped) ? d.skipped : [];
    const hidden: { name?: string }[] = Array.isArray(d.hidden) ? d.hidden : [];
    // 건너뛴 것은 초안으로 남는다(머리 개수 · 반영 창 목록에 그대로). 구매 이력이 있는 상품 삭제는 숨김으로 반영된다(운영자 결정 4)
    if (Number(d.applied) > 0 || !skipped.length) toast("실사이트에 반영했습니다.");
    if (skipped.length || hidden.length) {
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
    if (!ok) return notify(d?.message || "초안을 버리지 못했습니다.", true);
    // 새로 만든 초안(목록에서 사라진다)에 쌓인 고친 것은 뺀다 — 고친 줄의 나머지 칸은 목록을 다시 읽으면 실사이트 값으로 옮겨진다
    const gone = (rows: any[]) => new Set(rows.filter((x) => x._draft === "new").map((x) => String(x._id)));
    const gReg = gone(regItems), gProd = gone(items), gBan = gone(banners);
    setPending((p) => ({
      reg: Object.fromEntries(Object.entries(p.reg).filter(([id]) => !gReg.has(id))),
      product: Object.fromEntries(Object.entries(p.product).filter(([id]) => !gProd.has(id))),
      banner: Object.fromEntries(Object.entries(p.banner).filter(([id]) => !gBan.has(id))),
    }));
    // 아이템 · 상품 · 배너 상세 칸의 값은 버린 초안일 수 있다 — 닫는다
    if (paneRowOf()) closePane();
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
    if (!ok) return notify(d?.message || "초안을 되돌리지 못했습니다.", true);
    // 새로 만든 초안을 되돌리면 줄이 사라진다 — 쌓인 고친 것도 뺀다
    if (t.op === "add") dropPending(t.kind === "item" ? "reg" : t.kind === "shopItem" ? "product" : "banner", t.id);
    // 그 줄의 상세 칸이 열려 있으면 닫는다 — 폼에 든 값은 되돌리기 전 초안이다
    const open = paneRowOf();
    if (open && open.kind === t.kind && open.id === t.id) closePane();
    toast("초안을 되돌렸습니다.");
  };
  // 목록 줄 → 되돌릴 초안(_draft: "new" 추가 · "edit" 수정)
  const askRevertRow = (kind: "item" | "shopItem" | "banner", row: any, name: string) =>
    setRevertAsk({ kind, id: String(row._id), op: row._draft === "new" ? "add" : "edit", name });

  // ⚠️ 훅을 모두 부른 뒤에 가린다. 이건 화면을 가리는 장치일 뿐이고 실제 방어는 서버(API)에서 한다.
  if (gate) return gate;

  const meta = TAB_META[tab];
  // 📌 주문은 묶음(orderId + 상품 — lib/orderGroups.js)으로 센다 · 보인다. 1개 단위 상품 3개를 한 번에 샀으면 한 줄 "×3"
  const groupCount = (s: string) => groupOrderRows(orders.filter((o) => o.status === s)).length;
  const pendingCount = groupCount("pending");
  const shownOrdersByStatus = groupOrderRows(orderFilter ? orders.filter((o) => o.status === orderFilter) : orders);

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
  const shownReg = regItems.filter((it) => (!regType || it.type === regType) && groupHit(it) && hit(it.name, it.description, it.roleId ? roleNameOf(it.roleId, it.roleName) : "", groupOfItem(it), parentOfGroup(groupOfItem(it))));
  // 그룹 머리줄로 묶어 보이는 때 — 전체 보기 · 상위 하나 거르기(그 상위의 그룹들을 머리줄로). 그룹 지정 중에도 접은 채 — 머리줄 고르기 칸. 한 그룹만 거르면 머리줄 없이 그 줄들
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
  const regArtSuggest = [...new Set(itemForm.effects.flatMap((d) => (d.on === "cardSkin" && d.skin ? [artOfSkin(d.skin)] : d.on === "avatarFrame" && d.frame ? [artOfFrame(d.frame)] : [])))];
  const pickAllOn = groupMode && shownReg.length > 0 && shownReg.every((it) => groupPick.has(String(it._id)));
  const pickSomeOn = groupMode && !pickAllOn && shownReg.some((it) => groupPick.has(String(it._id)));
  const togglePickAll = () => togglePickMany(shownReg.map((it) => String(it._id)));
  // 그룹 지정 — 머리줄 고르기 칸(그 그룹의 보이는 아이템 통째로 · 일부만 고르면 반쯤 찬 표시)
  const regGroupLead = groupMode
    ? (g: string, rows: any[]) => {
        const ids = rows.map((it) => String(it._id));
        const n = ids.filter((id) => groupPick.has(id)).length;
        return <GroupPickBox on={n > 0 && n === ids.length} mixed={n > 0 && n < ids.length} label={`${g} 선택`} onToggle={() => togglePickMany(ids)} />;
      }
    : undefined;
  const shownProducts = items.filter((it) => (!productType || it.type === productType) && (!productView || (productView === "on" ? !!it.active : !it.active)) && hit(it.name, it.description, it.roleName, typeLabel(it.type), themeNameOf(themes, it.theme)));
  // 상품 묶음 — 아이템 순서 · 그룹 표(상품 그룹 = 연결 아이템 그룹, 세트는 첫 구성 아이템 그룹)
  const prodIdx = itemIndexOf(regItems.map((it) => ({ id: String(it._id), group: groupOfItem(it) })));
  // 유형 탭 — 역할 · 권한 · 아이템 · 꾸미기 · 기프트카드 · 세트(개수). 판매 중 · 숨김 칸은 이 탭 안에서 센다
  const typeProducts = productType ? items.filter((it) => it.type === productType) : items;
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
  const shownOrders = shownOrdersByStatus.filter((o) => hit(o.itemName, o.bundleName, o.userName, o.contact, o.adminNote));

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
  const openNewReg = () => { stashEdits(); if (itemForm.id) setItemForm(EMPTY_ITEM_FORM); setPane("reg"); };
  // 수정하던 폼을 새 폼으로 바꿀 때는 아이템 고르는 중 · 잡아 둔 직접 설정 값도 함께 푼다(새로 쓰던 폼이면 그대로 이어 쓴다)
  const openNewProduct = () => { stashEdits(); if (form.id) { setForm(emptyForm); setLinkPick(null); setCustomSnap(null); } setIsRoleOpen(false); setPane("product"); };
  // 새 배너 — 지금 보던 위치로 시작(시즌 탭을 보다 누르면 시즌 탭 배너)
  const newPlace = placeNow === GONE_PLACE ? "home" : placeNow;
  const openNewBanner = () => { stashEdits(); setBannerForm(bannerForm.id ? { ...EMPTY_BANNER, placement: newPlace } : { ...bannerForm, placement: bannerForm.imageUrl ? bannerForm.placement : newPlace }); setPane("banner"); };
  const openNewCoupon = () => { if (couponForm.id) setCouponForm(EMPTY_COUPON); setPane("coupon"); };

  // ── 표 열 ─────────────────────────────────────
  // 상품 줄 그림 — 연결 아이템의 꾸미기 효과로 도트 아이콘(withCosmeticIcon)
  const regById = new Map(regItems.map((x) => [String(x._id), x]));
  const regCols: Column<any>[] = [
    {
      key: "name", label: "아이템", mobile: "title",
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={withCosmeticIcon(it, it)} />
          <span className="block min-w-0 max-w-[340px]">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`truncate font-bold ${it.visible === false ? "text-[#a3a3a3] line-through" : "text-[#131313]"}`}>{it.name}</span>
              {editedIds.has(String(it._id)) && <span role="img" aria-label="수정됨" title="수정됨 — 아래 「전체 수정」으로 저장" className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
              <TypeBadge type={it.type} className="shrink-0 px-2 py-0.5 text-[10px]" />
              {/* 초안(추가 · 수정 — 순서만 바뀐 것은 표시 없음) — 되돌리기는 한 번 묻는다 */}
              {it._draft && <DraftMark onRevert={() => askRevertRow("item", it, it.name || "이름 없음")} disabled={!!draftBusy} />}
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
    { key: "vis", label: "인벤토리", render: (it) => <VisSwitch on={it.visible !== false} busy={visBusy === it._id} disabled={liveLocked} onToggle={() => toggleRegVisible(it)} /> },
  ];
  // 그룹 지정 모드 — 앞에 고르기 칸(머리줄은 같은 열 자리에 묶음째 고르기 칸 — regGroupLead)
  const regModeCols: Column<any>[] = groupMode
    ? [
        { key: "pick", label: <span className="sr-only">선택</span>, mobile: "title", className: "w-px", render: (it) => <PickMark on={groupPick.has(String(it._id))} /> },
        ...regCols,
      ]
    : regCols;

  const productCols: Column<any>[] = [
    {
      key: "name", label: "상품", mobile: "title",
      render: (it) => (
        <span className="flex items-center gap-3 min-w-0">
          <Thumb it={withCosmeticIcon(it, regById.get(String(it.itemId || "")))} />
          <span className="block min-w-0 max-w-[320px]">
            {/* 이름 줄 — 아이템 목록처럼 한 줄 flex(초안 칩이 붙어도 줄 높이 그대로) */}
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate font-bold">{it.name}</span>
              {editedIds.has(String(it._id)) && <span role="img" aria-label="수정됨" title="수정됨 — 아래 「전체 수정」으로 저장" className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
              {it._draft && <DraftMark onRevert={() => askRevertRow("shopItem", it, it.name || "이름 없음")} disabled={!!draftBusy} />}
            </span>
            {/* 등록 아이템 · 1개 단위(1회 최대) — 목록에서 판매 방식이 보이게 */}
            {(it.itemId || isUnitSale(it)) && (
              <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] tabular-nums">
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
    // 판매 종료(lib/saleWindow) — 판매 중 토글은 그대로여도 시각이 지나면 「판매 종료」(상점에서 빠짐)
    { key: "status", label: "상태", mobile: "title", render: (it) => (it.active && saleEnded(it)
      ? <StatusChip tone="warn">판매 종료</StatusChip>
      : <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <StatusChip tone={it.active ? "ok" : "neutral"}>{it.active ? "판매 중" : "숨김"}</StatusChip>
          {/* 끝나는 시각이 있으면 옆에 작게 */}
          {it.active && saleUntilLabel(it) && <span className="text-[11px] font-bold text-[#8a8a8a] tabular-nums">~{saleUntilLabel(it)}</span>}
        </span>) },
    {
      key: "type", label: "유형 · 역할",
      render: (it) => (
        <span className="text-[#5a5a5a]">
          {isBundle(it)
            ? `${typeLabel(it.type)} · ${(Array.isArray(it.bundle) ? it.bundle.length : 0)}개`
            : it.type === "physical" || it.type === "cosmetic" ? typeLabel(it.type) : `${typeLabel(it.type)} · ${it.roleName || it.roleId || "역할 없음"}`}
        </span>
      ),
    },
    {
      key: "price", label: "가격", align: "right",
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
            <span className="flex items-center gap-2 min-w-0">
              <span className="truncate font-bold">{b.title || "(제목 없음)"}</span>
              {editedIds.has(String(b._id)) && <span role="img" aria-label="수정됨" title="수정됨 — 아래 「전체 수정」으로 저장" className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#e91e3f]" />}
              {b._draft && <DraftMark onRevert={() => askRevertRow("banner", b, String(b.title || "").trim() || "제목 없는 배너")} disabled={!!draftBusy} />}
            </span>
            {b.subtitle && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate">{b.subtitle}</span>}
          </span>
        </span>
      ),
    },
    { key: "status", label: "상태", mobile: "title", render: (b) => <StatusChip tone={b.active ? "ok" : "neutral"}>{b.active ? "노출 중" : "숨김"}</StatusChip> },
    { key: "link", label: "이동", render: (b) => (b.link ? <span className="font-bold text-[#5a5a5a]">→ {b.link}</span> : null) },
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
          <span className="block truncate font-bold">{orderName(o)}{o.qty > 1 && <span className="tabular-nums"> ×{o.qty}</span>}</span>
          {orderSummary(o) && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a] truncate tabular-nums">{orderSummary(o)}</span>}
        </span>
      ),
    },
    { key: "type", label: "유형", render: (o) => <span className="text-[#5a5a5a]">{typeLabel(o.itemType)}</span> },
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

  // ── 쿠폰 종류 카드 — 설명을 함께 읽어야 고를 수 있어 알약 대신 카드로 둔다 ──
  const COUPON_KINDS = [
    { v: "discount", l: "할인형", d: "ARCTIC 결제 시 금액 할인" },
    { v: "reward", l: "보상형", d: "입력 즉시 역할·XP 지급" },
  ];

  // disabled — 실사이트 읽기 전용(아이템 · 상품 · 배너)
  // 📌 할로윈 탭 기본 배너(2026-10-11 운영자 "할로윈 배너 탭에 배너가 안 보이다") — 스토어 할로윈 탭(테마 키 BUILTIN_BANNER_THEME — 기본 배너는 이 테마만)은 등록된 배너가 없으면 그림 파일(public/banners/halloween-*.png)을 띄우지만
  //    배너 목록(DB)엔 없어 이 탭이 비어 보였다. 그 그림을 보이고 「등록」으로 새 배너 폼에 채워 둔다(저장은 운영자가 — 초안 모드면 초안). 등록하면 이 줄은 사라지고 그 배너가 목록에 선다
  //    📌 제목은 비운다 — 스토어 기본 배너(ArcticShopBody HW_BANNER)도 제목이 없다. 제목이 있으면 BannerSlider 가 어두운 띠 + 흰 글자를 얹어 그림 속 HALLOWEEN 글자와 겹친다
  //    📌 두 장(HALLOWEEN · 검은 고양이 세트 — 스토어 ArcticShopBody HW_BANNERS 와 같다). 줄마다 「등록」
  //    📌 등록 안 된 것(같은 그림 배너가 목록에 없는 것)은 목록이 있어도 목록 아래에 보인다 — 스토어도 등록된 켜진 배너 뒤에 같이 돈다
  //       (2026-10-11 운영자 "관리에 안 뜬다고" — HALLOWEEN 만 등록돼 있어 목록이 비지 않았고, 검은 고양이 기본 배너 줄이 숨었다)
  const HW_DEFAULT_BANNERS = [
    { imageUrl: "/banners/halloween-pc.png", mobileImageUrl: "/banners/halloween-mobile.png", title: "", link: "" }, // 할로윈 탭 맨 위라 링크 없음
    { imageUrl: "/banners/halloween-cat-pc.png", mobileImageUrl: "/banners/halloween-cat-mobile.png", title: "", link: "" },
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
            <Btn size="sm" disabled={liveLocked} onClick={() => { stashEdits(); setBannerForm({ ...EMPTY_BANNER, ...b, placement: BUILTIN_BANNER_THEME }); setPane("banner"); }}>등록</Btn>
          </div>
        </div>
      ))}
    </div>
  );
  const newBtn = (onClick: () => void, className = "", disabled = false) => <Btn className={className} onClick={onClick} disabled={disabled}>새로 만들기</Btn>;

  // 📌 머리 오른쪽 — 초안 모드: "초안 N" · 초안 버리기 · 실사이트 반영(0건이어도 숨기지 않고 잠근다 — 머리 · 탭 줄이 움직이지 않게),
  //    실사이트: "실사이트 · 읽기 전용". 둘 다 아니면(플래그 없는 localhost) 없음
  const headerActions = draft.draftMode ? (
    <>
      <StatusChip tone={draft.total > 0 ? "info" : "neutral"} className="min-w-[64px] justify-center tabular-nums">초안 {draft.loaded ? draft.total : "–"}</StatusChip>
      <Btn variant="ghost" onClick={() => setDraftAsk("discard")} disabled={!draft.total || !!draftBusy}>초안 버리기</Btn>
      <Btn onClick={openPublish} disabled={!draft.total || !!draftBusy}>실사이트 반영</Btn>
    </>
  ) : liveLocked ? (
    <StatusChip tone="warn">실사이트 · 읽기 전용</StatusChip>
  ) : undefined;
  const settingEdits = Number(draft.counts.setting?.edit) || 0;
  const ORDER_BTN = "w-[116px]";
  // 📌 모바일 두 글자 단추 폭 — 아이템 탭은 추천 · 그룹(지정) · 관리(그룹 관리)를 두 글자로 줄여야 한 줄에 든다(375 폭 기준).
  //    2026-10-11 순서 바꾸기 단추를 걷은 자리에 그룹 관리 — 단추 수가 그대로라 그룹 지정 모드로 바뀌어도 줄이 밀리지 않는다
  const SHORT_BTN = "w-[64px] md:w-[116px]";

  // 📌 그룹 지정 아래 띠 — 전체 선택(지금 거른 목록) · 고른 수 · 옮길 그룹 · 취소 · 옮기기. 모바일은 두 줄(그룹 고르기가 아래 줄 전체 폭)
  //    고른 수는 자리를 고정(tabular-nums · 3자리 폭) — 수가 바뀌어도 띠가 흔들리지 않게
  const groupBar = (
    <div className="flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-2.5">
      <span className={`shrink-0 inline-flex items-center gap-2 h-10 text-[13px] font-bold select-none ${shownReg.length ? "" : "text-[#a3a3a3]"}`}>
        <input type="checkbox" className={CHECK} aria-label="전체 선택" checked={pickAllOn} disabled={shownReg.length === 0} onChange={togglePickAll}
          ref={(el) => { if (el) el.indeterminate = pickSomeOn; }} />
        <span className="whitespace-nowrap" aria-live="polite">고른 <span className="inline-block min-w-[3ch] text-right tabular-nums">{groupPick.size.toLocaleString()}</span>개</span>
      </span>
      <div className="order-last md:order-none min-w-0 w-full md:w-auto">
        <GroupPicker bar value={groupName ?? ""} mixed={groupName === null} placeholder="옮길 그룹" groups={regGroups} counts={regGroupCount}
          onChange={setGroupName} onEnter={applyGroup} onPending={setGroupPending} />
      </div>
      <div className="ml-auto shrink-0 flex items-center gap-2">
        <Btn variant="secondary" className={SHORT_BTN} onClick={cancelGroupMode} disabled={groupBusy}>취소</Btn>
        <Btn className={SHORT_BTN} onClick={applyGroup} disabled={groupBusy || groupPick.size === 0 || groupName === null || groupPending}>옮기기</Btn>
      </div>
    </div>
  );

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
        // 설정 탭 — 바뀐 게 있을 때만 뜨는 저장 줄 · 아이템 탭 — 그룹 지정 중 아래 띠
        footer={tab === "settings" ? (
          <SaveBar
            dirty={shopSetChanges.length > 0}
            changes={shopSetChanges}
            onSave={saveShopSet}
            onReset={() => { if (shopSetSnap) setShopSet(shopSetSnap); }}
            saving={savingShopSet}
          />
        ) : tab === "items" && groupMode ? (
          <ActionBar>{groupBar}</ActionBar>
        ) : (tab === "items" || tab === "products" || tab === "banners") && unsavedN > 0 ? (
          // 📌 한 번에 수정 — 고친 아이템 · 상품 · 배너(탭을 옮겨도 그대로 쌓여 있다). 되돌리기 = 모두 저장된 값으로
          <SaveBar
            dirty
            changes={editJobs.map((j) => `${EDIT_KIND[j.kind]} ${j.name}`)}
            onSave={() => { void saveAllEdits(); }}
            onReset={discardEdits}
            saving={savingAll}
            saveLabel="전체 수정"
          />
        ) : undefined}
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
                    <Btn variant="secondary" onClick={importInvRoles} disabled={isImporting || groupMode || liveLocked}>
                      <SwapLabel swap={isImporting} to="가져오는 중...">{`표기 역할 가져오기 (${pendingInv.length})`}</SwapLabel>
                    </Btn>
                  )}
                  {/* 📌 추천 아이템 — 상세 칸이 열려 좁을 땐 숨긴다(버튼이 많으면 도구 줄이 한 줄 더 꺾여 목록이 밀린다). 그룹 지정 중엔 자리를 지킨 채 잠근다.
                      모바일은 "추천" 두 글자로 — 버튼이 한 줄에 들게(폭 고정이라 글자가 바뀌어도 줄이 밀리지 않는다) */}
                  {!pane && (
                    <Btn variant="secondary" className={SHORT_BTN} onClick={() => setPresetOpen(true)} disabled={groupMode || liveLocked}>
                      <span className="md:hidden">추천</span>
                      <span className="hidden md:inline">추천 아이템</span>
                    </Btn>
                  )}
                  {/* 📌 그룹 지정 — 켜고 끄는 단추 하나(켜면 누름 표시). 켜면 줄 · 머리줄 고르기 칸을 눌러 고르고, 고른 수 · 옮길 그룹 · 옮기기 · 취소는
                      화면 아래 띠(ActionBar). 단추 줄은 켜고 꺼도 같은 단추 · 같은 폭(그동안 다른 단추는 잠근다 — 줄이 밀리지 않게).
                      이름 바꾸기 · 새 그룹 · 삭제 · 차례는 그룹 관리 창 */}
                  {!pane && (
                    <Btn variant={groupMode ? "primary" : "secondary"} className={SHORT_BTN} aria-pressed={groupMode}
                      onClick={groupMode ? cancelGroupMode : startGroupMode} disabled={!groupMode && (regItems.length === 0 || liveLocked)}>
                      <span className="md:hidden">그룹</span>
                      <span className="hidden md:inline">그룹 지정</span>
                    </Btn>
                  )}
                  {/* 📌 그룹 관리 — 이름 바꾸기 · 새 그룹 · 삭제 · 차례(창) */}
                  {!pane && (
                    <Btn variant="secondary" className={SHORT_BTN} onClick={() => setGroupManageOpen(true)} disabled={groupMode || liveLocked}>
                      <span className="md:hidden">관리</span>
                      <span className="hidden md:inline">그룹 관리</span>
                    </Btn>
                  )}
                  {newBtn(openNewReg, ORDER_BTN, groupMode || liveLocked)}
                </>
              }
            >
              <SearchInput value={q} onChange={setQ} placeholder="이름 · 설명 · 역할 · 그룹" />
              <Segmented
                options={[{ v: "", l: "전체", n: regItems.length }, ...ITEM_TYPE_OPTIONS.map((o) => ({ v: o.v, l: o.l, n: regItems.filter((i) => i.type === o.v).length }))]}
                value={regType}
                onChange={setRegType}
              />
              {/* 📌 그룹 거르기 — 알약 줄은 그룹이 늘면 옆으로 넘쳐 단추 하나(폭 고정 · 그룹 관리 차례 · 개수)로. 늘 자리를 지킨다.
                     한 그룹만 고르면 머리줄 없이 그 줄들 */}
              <Dropdown
                theme="light"
                className="w-full sm:w-[220px] shrink-0"
                buttonClassName={GROUP_FILTER_BTN}
                value={regGroupV}
                onChange={setRegGroup}
                options={regGroupOptions}
                maxHeight={360}
              />
            </Toolbar>
            <DataTable
              columns={regModeCols}
              rows={shownReg}
              rowKey={(it) => it._id}
              onRowClick={groupMode ? (it) => togglePick(String(it._id)) : openRegRow}
              selectedKey={groupMode ? null : pane === "reg" ? itemForm.id : null}
              // 그룹 지정 중 — 고른 줄을 바탕으로도 보인다
              selectedKeys={groupMode ? groupPick : undefined}
              // 순서 — 늘 손잡이로 끌어 놓으면 바로 저장. 머리줄은 덩어리째(saveRegMove), 아이템 줄은 놓은 자리가 곧 그룹(saveRegDrop —
              //    덩어리 안 = 그 그룹 · 접힌 머리줄 위 = 그 덩어리 끝 · 단위 사이 = 그룹 없음). 한 그룹만 · 그룹 없음만 거른 표는 그 안에서만(saveRegMove).
              //    그룹 지정 중엔 잠근다(줄 누르기 = 고르기 — 손잡이는 자리를 지킨 채 흐리게)
              onReorder={(keys, _seg, moved) => { void saveRegMove(keys, moved); }}
              onRowDrop={(d) => { void saveRegDrop(d); }}
              reorderLocked={savingOrder === "reg" || groupMode || liveLocked}
              // 그룹 머리줄 — 그 그룹 첫 아이템 자리(목록 순서 = 실제 순서). 검색 중엔 맞는 줄이 접힌 머리줄 속에 숨지 않게 모두 펼친 채(누르기 없음)
              groupOf={regGrouped ? (it) => groupOfItem(it) : undefined}
              openGroups={openGroups}
              onToggleGroup={qq ? undefined : toggleGroup}
              // 상위 머리줄 — 같은 상위의 그룹들 위에 하나(누르면 접고 편다 · 검색 중엔 펼친 채). 상위 하나만 거른 표는 머리줄 없이 그 그룹들
              sectionOf={regGroupV === GROUP_ALL ? parentOfGroup : undefined}
              closedSections={closedSections}
              onToggleSection={qq ? undefined : toggleSection}
              groupLead={regGroupLead}
              empty={regItems.length === 0 ? "등록된 아이템이 없습니다." : noResult}
            />

            <DetailPane
              open={pane === "reg"}
              onClose={closeEditPane}
              width={520}
              title={itemForm.id ? "아이템 수정" : "아이템 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest} disabled={isSavingReg || liveLocked}>{isSavingReg ? "저장 중..." : itemForm.id ? "수정 저장" : "등록"}</Btn>
                  {itemForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "reg", id: itemForm.id })} disabled={liveLocked}>삭제</Btn>}
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

                {itemForm.type === "role" && (
                  <Field label="시즌 전환">
                    <Toggle on={itemForm.detachOnSeason} onClick={() => setItemForm({ ...itemForm, detachOnSeason: !itemForm.detachOnSeason })}
                      onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                  </Field>
                )}
                <Field label="인벤토리 표시">
                  <Toggle on={itemForm.visible} onClick={() => setItemForm({ ...itemForm, visible: !itemForm.visible })} onLabel="표시" offLabel="숨김" />
                </Field>
                {/* 그룹 — 상점 관리 목록에서 묶어 보일 이름(관리 화면 정리용 · 인벤토리엔 안 보인다) */}
                <Field label="그룹">
                  <GroupPicker key={itemForm.id || "new"} value={itemForm.group} groups={regGroups} counts={regGroupCount} onChange={(v) => setItemForm((f) => ({ ...f, group: v }))} />
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
                      // 새 아이템이면 꾸미기 효과에 맞춰 비어 있는 이름 · 아이콘 · 그룹을 채운다(withCosmeticAuto)
                      onChange={(patch) => setItemForm((f) => withCosmeticAuto(f, { ...f, ...patch }))}
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
                {/* ── 몸값 참고 — 맨 아래(폰에서 위 칸을 밀지 않게) · 머리를 눌러 접고 편다 ── */}
                <WorthRef itemId={String(itemForm.id || "")} group={itemForm.group} type={itemForm.type} regItems={regItems} shops={items}
                  open={worthOpen} onToggle={() => setWorthOpen((v) => !v)} />
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 상품 관리 ═══ */}
        {tab === "products" && (
          <>
            <Toolbar right={
              <>
                {/* 📌 아이템 순서대로 — 상품 순서를 아이템 순서에 맞춘다(한 번 묻는다). 모바일은 두 글자 */}
                {!pane && (
                  <Btn variant="secondary" className={SHORT_BTN} onClick={() => setSyncAsk(true)} disabled={items.length === 0 || liveLocked || !!savingOrder}>
                    <span className="md:hidden">정렬</span>
                    <span className="hidden md:inline">아이템 순서대로</span>
                  </Btn>
                )}
                {/* 📌 테마 관리 — 이벤트 테마(ARCTIC 테마 탭) 만들기 · 이름 · 켜기 · 차례 · 삭제(창 — 그룹 관리와 같은 모양). 모바일은 두 글자 */}
                {!pane && (
                  <Btn variant="secondary" className={SHORT_BTN} onClick={() => setThemeManageOpen(true)} disabled={liveLocked}>
                    <span className="md:hidden">테마</span>
                    <span className="hidden md:inline">테마 관리</span>
                  </Btn>
                )}
                {newBtn(openNewProduct, ORDER_BTN, liveLocked)}
              </>
            }>
              <SearchInput value={q} onChange={setQ} placeholder="상품명 · 역할 · 테마" />
              <Segmented options={productTypeOptions} value={productType} onChange={setProductType} />
              <Segmented
                options={[
                  { v: "", l: "전체", n: typeProducts.length },
                  { v: "on", l: "판매 중", n: typeProducts.filter((it) => !!it.active).length },
                  { v: "off", l: "숨김", n: typeProducts.filter((it) => !it.active).length },
                ]}
                value={productView}
                onChange={setProductView}
              />
            </Toolbar>
            {isLoading ? <EmptyRow>불러오는 중...</EmptyRow> : (
              <DataTable
                columns={productCols}
                rows={shownProducts}
                rowKey={(it) => it._id}
                onRowClick={openProductRow}
                selectedKey={pane === "product" ? form.id : null}
                // 순서 — 늘 손잡이로 끌어 놓으면 바로 저장(거른 목록에서 옮겨도 전체 안의 제자리에). 머리줄은 그룹 덩어리째, 상품 줄은 그 그룹 안에서만(saveProductMove)
                onReorder={(keys, seg, moved) => { void saveProductMove(keys, seg, moved); }}
                reorderLocked={savingOrder === "product" || liveLocked}
                // 📌 묶음(B안) — 연결 아이템의 그룹 머리줄 · 상위 머리줄(아이템 목록과 같은 모양). 검색 중엔 모두 펼친 채
                groupOf={(it) => productGroupOf(it, prodIdx)}
                openGroups={openProductGroups}
                onToggleGroup={qq ? undefined : toggleProductGroup}
                sectionOf={parentOfGroup}
                closedSections={closedProductSections}
                onToggleSection={qq ? undefined : toggleProductSection}
                empty={items.length === 0 ? "등록된 상품이 없습니다." : noResult}
              />
            )}

            <DetailPane
              open={pane === "product"}
              onClose={closeEditPane}
              width={520}
              title={form.id ? "상품 수정" : "상품 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest} disabled={liveLocked}>{form.id ? "수정 저장" : "상품 등록"}</Btn>
                  {form.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "item", id: form.id })} disabled={liveLocked}>삭제</Btn>}
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
                      it={{ ...toPayload(form, ""), _id: form.id || "preview", stock: form.stock === "" ? -1 : Number(form.stock) || 0, ...(previewBundleItems ? { bundleItems: previewBundleItems } : {}) }}
                      href="#" wished={false} onWish={() => {}}
                      overlay={!form.active ? <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-white/95 text-[#131313]">숨김</span> : null}
                    />
                  </div>
                </div>
              </div>
              <form onSubmit={saveItem}>
                {/* ── 기본 정보 ── */}
                <PaneSection title="기본 정보">
                  {/* 📌 직접 설정 | 등록된 아이템 — 아이템을 고르면 표기 필드는 채워지고 잠긴다. 세트는 아이템 하나에 연결하지 않는다(구성 편집) */}
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
                        else notify("등록된 아이템이 없습니다. 아이템 탭에서 먼저 등록해 주세요.", true);
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
                  </div>}

                  <Field label={<>상품명<Req /></>}>
                    <input type="text" value={form.name} disabled={linked} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: [XP] Boost+" className={inputClass} />
                  </Field>

                  <Field label={<>상품 유형<Req /></>}>
                    {linked
                      ? <TypeBadge type={form.type} className="inline-block px-3 py-1.5 text-[11px]" />
                      : <Segmented options={PRODUCT_TYPE_OPTIONS} value={form.type} onChange={(v) => setForm(pickProductType(form, v))} />}
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

                {/* ── 구성 ── 세트만(lib/bundle.js). 줄마다 기간 · 개수 · 몸값 */}
                {bundleOn && (
                  <PaneSection title="구성">
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

                {/* ── 가격 · 기간 ── */}
                <PaneSection title="가격 · 기간">
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
                  {/* 📌 세트 — 구성 몸값 합(정가 합)과 세트 판매가를 나란히. 몇 % 싼지는 XP 로 견준다(빙옥 전용은 1 빙옥 = 10,000 XP) */}
                  {bundleOn && bundleSum > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[#f7f7f7] px-3 py-2.5 text-[13px] text-[#5a5a5a] tabular-nums">
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

                {/* ── 시즌 동작 ── 기프트카드 · 꾸미기는 뗄 역할이 없으므로 아예 감춘다(세트도 쓰지 않는다 — 서버가 끈다) */}
                {form.type !== "physical" && form.type !== "cosmetic" && !bundleOn && (
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
                  {/* 📌 판매 종료 — 그 시각(KST)이 지나면 상점에서 빠지고 구매가 막힌다(할인 종료와 같은 칸). 비우면 계속 */}
                  <Field label="판매 종료" hint={form.saleUntil && new Date(`${form.saleUntil}:00+09:00`).getTime() <= Date.now() ? <span className="font-bold text-[#d01634]">이미 지난 시각입니다</span> : "비우면 계속"}>
                    <div className="flex items-center gap-2">
                      <input type="datetime-local" value={form.saleUntil} onChange={(e) => setForm({ ...form, saleUntil: e.target.value })} className={inputClass} />
                      {form.saleUntil && <Btn variant="ghost" size="sm" onClick={() => setForm({ ...form, saleUntil: "" })}>지우기</Btn>}
                    </div>
                  </Field>
                  {/* 📌 이벤트 테마 — 고른 테마의 ARCTIC 탭에 모인다(상점 화면 편집 폼과 같은 값 ShopItem.theme · 보기는 lib/shopThemes themePickOptions).
                      꺼진 테마도 고를 수 있다(「꺼짐」 — 켜면 그때 탭에 선다). 테마는 「테마 관리」에서 */}
                  <Field label="이벤트 테마">
                    <Dropdown theme="light" buttonClassName={DD_BTN}
                      value={form.theme} options={themePickOptions(themes, form.theme)} onChange={(v) => setForm({ ...form, theme: v })} maxHeight={240} />
                  </Field>
                </PaneSection>
                <HiddenSubmit />
              </form>
            </DetailPane>
          </>
        )}

        {/* ═══ 이미지 배너 ═══ */}
        {tab === "banners" && (
          <>
            <Toolbar right={newBtn(openNewBanner, "", liveLocked)}>
              <SearchInput value={q} onChange={setQ} placeholder="제목 · 부제 · 링크" />
              {/* 📌 노출 위치 — 홈(ARCTIC 홈 맨 위) · 시즌 탭 · 테마마다 「<이름> 탭」(스토어 그 탭 맨 위). 목록 차례 = 그 위치의 노출 차례 */}
              <Segmented
                options={placeTabs.map((p) => ({ v: p.v, l: p.l, n: bannersAt(p.v).length }))}
                value={placeNow}
                onChange={setBannerPlace}
              />
              <Segmented
                options={[
                  { v: "", l: "전체", n: placeBanners.length },
                  { v: "on", l: "노출 중", n: placeBanners.filter((b) => !!b.active).length },
                  { v: "off", l: "숨김", n: placeBanners.filter((b) => !b.active).length },
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
                onRowClick={openBannerRow}
                // 순서 — 손잡이로 끌어 놓으면 바로 저장(그 위치 안에서). 숨긴 배너도 자리는 지킨다(켜면 그 자리에서 나온다)
                onReorder={(keys) => { void saveBannerOrder(keys); }}
                reorderLocked={savingOrder === "banner" || liveLocked || placeNow === GONE_PLACE}
                selectedKey={pane === "banner" ? bannerForm.id : null}
                empty={placeBanners.length === 0 ? (placeNow === BUILTIN_BANNER_THEME ? hwDefaultRow : "등록된 배너가 없습니다.") : noResult}
              />
            )}
            {/* 등록 안 된 기본 배너 — 목록이 있을 때는 목록 아래(스토어에서 등록된 배너 뒤에 도는 차례 그대로). 숨김 보기 · 검색 중엔 안 보인다 */}
            {!isLoading && placeNow === BUILTIN_BANNER_THEME && placeBanners.length > 0 && hwPending.length > 0 && bannerView !== "off" && !q.trim() && (
              <div className="mt-4 py-5 border-t border-[#ededed]">{hwDefaultRow}</div>
            )}

            <DetailPane
              open={pane === "banner"}
              onClose={closeEditPane}
              width={520}
              title={bannerForm.id ? "배너 수정" : "배너 등록"}
              footer={
                <>
                  <Btn onClick={submitNearest} disabled={liveLocked}>{bannerForm.id ? "수정 저장" : "배너 등록"}</Btn>
                  {bannerForm.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "banner", id: bannerForm.id })} disabled={liveLocked}>삭제</Btn>}
                </>
              }
            >
              <form onSubmit={saveBanner}>
                {/* 📌 노출 위치 — 홈: ARCTIC 홈 맨 위 · 시즌 탭 · 테마 탭: 스토어 그 탭 맨 위. 같은 위치의 배너끼리 한 슬라이드로 돈다(권장 크기는 모두 같다).
                    지운 테마의 배너는 아무 칸도 안 골라진 채 열린다 — 위치를 골라야 저장된다(서버가 지운 테마를 막는다) */}
                <Field label="노출 위치">
                  <Segmented options={bannerPlaces.map((p) => ({ v: p.v, l: p.l }))} value={bannerForm.placement}
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
                  {/* 노출 순서는 목록에서 끌어서(위치 탭마다) — 숫자 칸은 걷었다(2026-10-11) */}

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
                  {legacyLeft > 0 && (
                    <Btn variant="secondary" onClick={migrateCodes} disabled={isMigrating}>
                      <SwapLabel swap={isMigrating} to="이전 중...">예전 코드 가져오기</SwapLabel>
                    </Btn>
                  )}
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
                  { v: "", l: "전체", n: groupOrderRows(orders).length },
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
            {/* 📌 더 보기 — 2026-10-04 추천대로: 오래된 주문도 이 목록에서 찾아 환불할 수 있게(한 번에 500건) */}
            {!isLoading && ordersNext && (
              <div className="mt-4 flex justify-center">
                <Btn variant="secondary" className="w-[116px]" onClick={loadMoreOrders} disabled={ordersBusy}>더 보기</Btn>
              </div>
            )}

            {/* 📌 줄을 누르면 수령 정보 · 메모 · 처리 단추가 상세 칸에 모인다 (예전엔 줄마다 펼쳐 놓아 목록이 길어졌다) */}
            <DetailPane
              open={pane === "order" && !!orderSel}
              onClose={closePane}
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
                  <DefRow k="유형">{typeLabel(orderSel.itemType)}</DefRow>
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

        {/* ═══ 설정 — 결제 캐시백 ═══ */}
        {tab === "settings" && (
          <PanelGrid>
            <Panel title="결제 캐시백" flush>
              {!shopSet || !shopSetSnap ? (
                <EmptyRow>불러오는 중...</EmptyRow>
              ) : (
                <>
                  <FieldRow label="캐시백 합 상한" changed={shopSet.cap !== shopSetSnap.cap} hint="캐시백 아이템 효과를 합한 최대치 · 기본 30%">
                    <Inline>
                      <input type="number" min={0} max={100} step={1} inputMode="numeric" aria-label="캐시백 합 상한" value={shopSet.cap}
                        onChange={(e) => setShopSet({ ...shopSet, cap: e.target.value })} className={numClass} />
                      <span>%</span>
                    </Inline>
                  </FieldRow>
                  <FieldRow label="빙옥 결제분" changed={shopSet.onPoint !== shopSetSnap.onPoint} hint={`포함하면 빙옥으로 낸 금액도 1 빙옥 = ${POINT_RATE.toLocaleString()} XP로 환산해 캐시백 · 기본 제외`}>
                    <Toggle on={shopSet.onPoint} onClick={() => setShopSet({ ...shopSet, onPoint: !shopSet.onPoint })} onLabel="캐시백 포함" offLabel="캐시백 제외" />
                  </FieldRow>
                </>
              )}
            </Panel>
          </PanelGrid>
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
      {toastEl}
    </>
  );
}
