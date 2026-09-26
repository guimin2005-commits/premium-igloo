"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Dropdown from "../../components/Dropdown";
import ItemIcon from "../../components/ItemIcon";
import IconPicker from "../../components/IconPicker";
import { InventoryItemPreview } from "../../components/Inventory";
import { ITEM_TYPE_OPTIONS, itemTypeLabel, itemTypeColor } from "@/lib/items";
import { TRIGGERS, TRIGGER_OF, DAY_LABELS, MAX_EFFECTS, normalizeEffects, describeEffect, describeBasic } from "@/lib/itemEffects";
import {
  EMPTY_PRODUCT_FORM, SOURCE_OPTIONS, sourceOf, isLinked, formFromShopItem,
  buildDurations as buildFormDurations, pickType as pickProductType, applyItem, unlinkItem, toPayload,
} from "../../arctic/productForm";
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
  banners: { desc: "배너가 여럿이면 5초마다 자동 전환됩니다." },
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

const STATUS_LABEL: Record<string, string> = { pending: "처리 대기", completed: "완료", cancelled: "취소", refunded: "환불" };
const STATUS_TONE: Record<string, "warn" | "ok" | "bad"> = { pending: "warn", completed: "ok", cancelled: "bad", refunded: "bad" };

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
  days: number[]; hourFrom: string; hourTo: string; channelIds: string[]; chText: string; open: boolean;
};
const newEffectId = () => Math.random().toString(36).slice(2, 10);
const newEffect = (): EffectDraft => ({ id: newEffectId(), on: "chat", mode: "add", amount: "", minMinutes: "", everyN: "", days: [], hourFrom: "", hourTo: "", channelIds: [], chText: "", open: false });
// 빈 칸은 undefined 로 넘긴다 — normalizeEffects 는 "" 를 0 으로 읽어 분 · 번째를 최솟값(1분 · 2번째)으로 채워 버린다
const numOrNone = (s: string) => (String(s ?? "").trim() === "" ? undefined : Number(s));
const effectOf = (d: EffectDraft) => ({
  id: d.id, on: d.on, mode: d.mode, amount: numOrNone(d.amount), minMinutes: numOrNone(d.minMinutes), everyN: numOrNone(d.everyN),
  days: d.days, hourFrom: d.hourFrom, hourTo: d.hourTo, channelIds: d.channelIds,
});
const draftOf = (e: any): EffectDraft => {
  const channelIds = Array.isArray(e?.channelIds) ? e.channelIds.map(String) : [];
  return {
    id: String(e?.id || newEffectId()), on: TRIGGER_OF[e?.on] ? e.on : "chat", mode: e?.mode === "percent" ? "percent" : "add",
    amount: e?.amount ? String(e.amount) : "", minMinutes: e?.minMinutes ? String(e.minMinutes) : "", everyN: e?.everyN ? String(e.everyN) : "",
    days: Array.isArray(e?.days) ? e.days.map(Number) : [], hourFrom: e?.hourFrom != null ? String(e.hourFrom) : "", hourTo: e?.hourTo != null ? String(e.hourTo) : "",
    channelIds, chText: channelIds.join(", "), open: false,
  };
};
const xpNum = (s: string) => Math.max(0, Math.floor(Number(s) || 0));

// 아이템 등록 폼 — 숫자 칸은 비울 수 있어야 해서 문자열로 든다
//    효과(buffXp · attendBuffXp · effects)는 연결 역할의 RoleConfig 에 저장된다(서버가 roleId 로 upsert).
//    effLoaded: 불러온 아이템에 효과가 있었는지 — 전부 0 으로 비운 것도 저장해야 지워지므로
type ItemForm = {
  id: string; name: string; description: string; type: string; roleId: string; icon: string; imageUrl: string;
  color: string; detachOnSeason: boolean; visible: boolean; sortOrder: string;
  buffXp: string; attendBuffXp: string; effects: EffectDraft[]; effLoaded: boolean;
};
const EMPTY_ITEM_FORM: ItemForm = {
  id: "", name: "", description: "", type: "item", roleId: "", icon: "", imageUrl: "", color: "", detachOnSeason: false, visible: true, sortOrder: "",
  buffXp: "", attendBuffXp: "", effects: [], effLoaded: false,
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

// Dropdown(라이트) 단추를 inputClass 높이 · 테두리에 맞춘다
const DD_BTN = "min-h-10 !py-2 !px-3 !border-[#a3a3a3] !text-[14px]";
// 상세 칸 아래 줄의 삭제 — 저장 옆에 빨간 덩어리를 두지 않고 글자만
const DEL_BTN = "ml-auto !text-[#d01634]";

// 📌 아이템 효과 편집 — 기본 두 칸 + 조건 효과 목록. 상세 칸(520px) · 모바일 판 모두에서 줄이 무너지지 않게 줄바꿈을 허용한다.
//    ⚠️ 모듈 바깥에 둔다(페이지 안에서 정의하면 입력할 때마다 다시 마운트돼 포커스가 날아간다)
const HOUR_FROM = Array.from({ length: 24 }, (_, h) => h);
const HOUR_TO = Array.from({ length: 24 }, (_, h) => h + 1);
const selectSm = `${inputClass} !w-[84px] tabular-nums`;
const subLabel = "mb-1.5 text-[12px] font-bold text-[#5a5a5a]";
function EffectsEditor({
  buffXp, attendBuffXp, list, disabled, channels, onChange,
}: {
  buffXp: string; attendBuffXp: string; list: EffectDraft[]; disabled: boolean; channels: any[];
  onChange: (patch: Partial<Pick<ItemForm, "buffXp" | "attendBuffXp" | "effects">>) => void;
}) {
  const setRow = (i: number, patch: Partial<EffectDraft>) => onChange({ effects: list.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  const chName = (id: string) => channels.find((c) => c.id === id)?.name as string | undefined;
  // 상황을 바꾸면 — 없는 방식(%)은 첫 방식으로, 채팅 ↔ 음성이면 맞지 않는 종류의 채널은 뺀다(카테고리 · 모르는 ID 는 둔다)
  const pickOn = (i: number, v: string) => {
    const t = TRIGGER_OF[v];
    if (!t) return;
    const d = list[i];
    const fits = (id: string) => {
      const c = channels.find((x) => x.id === id);
      return !c || c.type === "category" || c.type === (v === "voice" ? "voice" : "text");
    };
    const ids = t.channels ? d.channelIds.filter(fits) : d.channelIds;
    setRow(i, { on: v, mode: t.modes.includes(d.mode) ? d.mode : t.modes[0], channelIds: ids, chText: ids.join(", ") });
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
    <fieldset disabled={disabled} className={`min-w-0 ${disabled ? "opacity-50" : ""}`}>
      <div className={labelClass}>기본 효과</div>
      <div className="mb-5 space-y-2">
        <Inline>
          <span className="w-[136px] shrink-0 font-bold text-[#131313]">채팅 · 음성 1회마다</span>
          <span>+</span>
          <input type="number" min={0} inputMode="numeric" value={buffXp} onChange={(e) => onChange({ buffXp: e.target.value })} placeholder="0" className={numClass} />
          <span>XP</span>
        </Inline>
        <Inline>
          <span className="w-[136px] shrink-0 font-bold text-[#131313]">출석할 때</span>
          <span>+</span>
          <input type="number" min={0} inputMode="numeric" value={attendBuffXp} onChange={(e) => onChange({ attendBuffXp: e.target.value })} placeholder="0" className={numClass} />
          <span>XP</span>
        </Inline>
      </div>

      <div className={labelClass}>조건 효과</div>
      {list.map((d, i) => {
        const t = TRIGGER_OF[d.on] || TRIGGERS[0];
        const norm: any = normalizeEffects([effectOf(d)])[0];
        const hasTime = d.hourFrom !== "" && d.hourTo !== "" && d.hourFrom !== d.hourTo;
        const condN = (d.days.length > 0 && d.days.length < 7 ? 1 : 0) + (hasTime ? 1 : 0) + (t.channels && d.channelIds.length ? 1 : 0);
        const dayPreset = d.days.length === 0 || d.days.length === 7 ? "all" : sameDays(d.days, WEEKDAYS) ? "wd" : sameDays(d.days, WEEKEND) ? "we" : "";
        const chOptions = channels
          .filter((c) => c.type === "category" || c.type === (d.on === "voice" ? "voice" : "text"))
          .filter((c) => !d.channelIds.includes(c.id))
          .map((c) => ({ value: c.id, label: `${CH_ICON[c.type] || "#"} ${c.name}`, hint: CH_LABEL[c.type], indent: !!c.parentId }));
        return (
          <div key={d.id} className="mb-2 rounded-xl border border-[#ededed] p-3">
            <div className="flex items-center gap-2">
              <select value={d.on} onChange={(e) => pickOn(i, e.target.value)} aria-label="상황" className={`${inputClass} min-w-0 flex-1`}>
                {TRIGGERS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select>
              {/* 폭 고정 — 조건 수가 붙어도 옆 칸이 밀리지 않게 */}
              <Btn variant={d.open ? "primary" : "secondary"} size="sm" className="shrink-0 w-[72px]" aria-expanded={d.open} onClick={() => setRow(i, { open: !d.open })}>
                조건{condN > 0 && <span className="tabular-nums">{condN}</span>}
              </Btn>
              <button type="button" aria-label="효과 삭제" onClick={() => onChange({ effects: list.filter((_, j) => j !== i) })}
                className="shrink-0 w-8 h-8 rounded-full text-[#8a8a8a] hover:text-[#d01634] hover:bg-[#f2f2f2] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

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
              <span>+</span>
              <input type="number" min={0} max={d.mode === "percent" ? 500 : 1000000} inputMode="numeric" value={d.amount} onChange={(e) => setRow(i, { amount: e.target.value })}
                placeholder={d.mode === "percent" ? "10" : "100"} aria-label="크기" className={numClass} />
              {t.modes.length > 1
                ? <Segmented options={[{ v: "add", l: "XP" }, { v: "percent", l: "%" }]} value={d.mode} onChange={(v) => setRow(i, { mode: v })} />
                : <span>XP</span>}
            </Inline>

            {d.open && (
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
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  // 📌 상세 칸 — 한 번에 하나만 연다. 폼 탭은 그 탭의 폼 상태(id 유무)가 새로 만들기 / 수정을 가른다
  const [pane, setPane] = useState<PaneKind>("");
  const [orderSelId, setOrderSelId] = useState<string | null>(null);
  // 목록 한 줄 도구 — 검색어는 탭마다 새로, 상태 토글은 탭별로 따로 둔다
  const [q, setQ] = useState("");
  const [regType, setRegType] = useState("");
  const [productView, setProductView] = useState("");
  const [bannerView, setBannerView] = useState("");
  const [couponView, setCouponView] = useState("");

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
    // 효과는 GET 이 붙여 준 연결 역할의 RoleConfig 값 (역할이 없으면 0 / [])
    const ef = it.effects || {};
    const list = Array.isArray(ef.list) ? ef.list : [];
    setItemForm({
      id: it._id, name: it.name || "", description: it.description || "", type: it.type || "item", roleId: it.roleId || "",
      icon: it.icon || "", imageUrl: it.imageUrl || "", color: it.color || "", detachOnSeason: !!it.detachOnSeason,
      visible: it.visible !== false, sortOrder: String(it.sortOrder || 0),
      buffXp: ef.buffXp ? String(ef.buffXp) : "", attendBuffXp: ef.attendBuffXp ? String(ef.attendBuffXp) : "",
      effects: list.map(draftOf), effLoaded: !!(ef.buffXp || ef.attendBuffXp || list.length),
    });
  };

  // 📌 연결 역할을 고르거나 바꾸면 그 역할의 현재 효과를 불러온다 — 효과는 역할 단위(RoleConfig)라
  //    빈 칸인 채 저장하면 그 역할의 기존 버프 · 다른 아이템이 쓰던 조건 효과를 0 으로 덮어쓴다.
  //    먼저 같은 역할을 쓰는 등록 아이템에서, 없으면 역할 설정(RoleConfig) 목록에서 찾는다.
  const changeItemRole = async (roleId: string) => {
    setItemForm((f) => ({ ...f, roleId, buffXp: "", attendBuffXp: "", effects: [], effLoaded: false }));
    if (!roleId) return;
    let ef: any = regItems.find((it) => it.roleId === roleId && it._id !== itemForm.id && it.effects)?.effects || null;
    if (!ef) {
      const d = await fetch("/api/role-config", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const cfg = Array.isArray(d?.data) ? d.data.find((c: any) => c.roleId === roleId) : null;
      if (cfg) ef = { buffXp: cfg.buffXp || 0, attendBuffXp: cfg.attendBuffXp || 0, list: Array.isArray(cfg.effects) ? cfg.effects : [] };
    }
    if (!ef) return;
    const list = Array.isArray(ef.list) ? ef.list : [];
    // 그 사이 다른 역할로 또 바꿨으면 늦게 온 값으로 덮지 않는다
    setItemForm((f) => (f.roleId !== roleId ? f : {
      ...f,
      buffXp: ef.buffXp ? String(ef.buffXp) : "",
      attendBuffXp: ef.attendBuffXp ? String(ef.attendBuffXp) : "",
      effects: list.map(draftOf),
      effLoaded: true,
    }));
  };

  const saveRegItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReg) return;
    if (!itemForm.name.trim()) return notify("이름을 입력해 주세요.", true);
    if ((itemForm.type === "role" || itemForm.type === "perk") && !itemForm.roleId) return notify("연결할 역할을 선택해 주세요.", true);
    // 📌 효과 — 역할이 연결된 아이템만. 값이 빈 줄은 서버가 말없이 버리므로 저장 전에 막는다.
    //    효과가 원래 없고 지금도 비어 있으면 보내지 않는다(효과 없는 역할마다 빈 RoleConfig 가 생기지 않게)
    const { buffXp, attendBuffXp, effects: effDrafts, effLoaded, ...base } = itemForm;
    let effects: { buffXp: number; attendBuffXp: number; list: ReturnType<typeof effectOf>[] } | undefined;
    if (base.type !== "physical" && base.roleId) {
      const bad = effDrafts.findIndex((d) => normalizeEffects([effectOf(d)]).length === 0);
      if (bad >= 0) return notify(`조건 효과 ${bad + 1}번째 줄의 값을 입력해 주세요.`, true);
      const b = xpNum(buffXp), a = xpNum(attendBuffXp);
      if (effLoaded || b || a || effDrafts.length) effects = { buffXp: b, attendBuffXp: a, list: effDrafts.map(effectOf) };
    }
    setIsSavingReg(true);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, roleName: guildRoles.find((r) => r.id === base.roleId)?.name || "", ...(effects ? { effects } : {}) }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    setIsSavingReg(false);
    if (res?.ok && d?.success) { setItemForm(EMPTY_ITEM_FORM); fetchRegItems(); fetchAll(); closePane(); notify("저장되었습니다."); }
    else {
      // 아이템은 저장되고 효과만 실패하면 서버가 문서를 돌려준다 — id 를 쥐어 다시 저장해도 두 개가 생기지 않게
      if (!itemForm.id && d?.data?._id) { setItemForm((f) => ({ ...f, id: d.data._id })); fetchRegItems(); }
      notify(d?.message || "저장에 실패했습니다.", true);
    }
  };

  // 표시 토글 — 목록에서 바로 켜고 끈다 (폼을 열지 않아도 되게)
  const [visBusy, setVisBusy] = useState("");
  const toggleRegVisible = async (it: any) => {
    if (visBusy) return;
    setVisBusy(it._id);
    const res = await fetch("/api/admin/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      // 효과는 빼고 보낸다 — 표시 토글이 역할 효과(RoleConfig)를 다시 쓰지 않게 (undefined 는 JSON 에서 빠진다)
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

  const fetchAll = useCallback(() => {
    Promise.all([
      fetch("/api/shop/items?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/discord-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/orders", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/shop/banners?all=1", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ data: [] })),
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
  const EMPTY_BANNER = { id: "", imageUrl: "", title: "", subtitle: "", link: "", sortOrder: "", active: true };
  const [banners, setBanners] = useState<any[]>([]);
  const [bannerForm, setBannerForm] = useState<any>(EMPTY_BANNER);
  // 📌 넣은 이미지의 실제 크기를 읽어 권장 크기와 견줘 준다 (등록하고 나서야 잘린 걸 아는 일을 막는다)
  const [bannerSize, setBannerSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const url = (bannerForm.imageUrl || "").trim();
    if (!url) { setBannerSize(null); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setBannerSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = () => { if (alive) setBannerSize(null); };
    img.src = url;
    return () => { alive = false; };
  }, [bannerForm.imageUrl]);

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
    setBannerForm({ id: b._id, imageUrl: b.imageUrl, title: b.title || "", subtitle: b.subtitle || "", link: b.link || "", sortOrder: String(b.sortOrder || 0), active: b.active });

  // ── 쿠폰 ────────────────────────────────────
  const EMPTY_COUPON = { id: "", code: "", name: "", kind: "discount", reward: "", rewardRoleId: "", rewardRoleName: "", rewardXp: "", requiredRoleId: "", requiredRoleName: "", type: "percent", value: "", maxDiscount: "", minTotal: "", maxUses: "", perUserLimit: "1", active: true, expiresAt: "" };
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

  // 목록 줄 → 쿠폰 폼 (예전 '수정' 단추 안의 값 그대로 — 만료 일시는 지역 시각으로 바꿔 넣는다)
  const fillCouponForm = (c: any) =>
    setCouponForm({ id: c._id, code: c.code, name: c.name || "", kind: c.kind || "discount", reward: c.reward || "", rewardRoleId: c.rewardRoleId || "", rewardRoleName: c.rewardRoleName || "", rewardXp: c.rewardXp ? String(c.rewardXp) : "", requiredRoleId: c.requiredRoleId || "", requiredRoleName: c.requiredRoleName || "", type: c.type, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : "", minTotal: c.minTotal ? String(c.minTotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", perUserLimit: String(c.perUserLimit ?? 1), active: c.active, expiresAt: c.expiresAt ? new Date(new Date(c.expiresAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "" });

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

  // 📌 기간제 역할 — 켠 기간(값이 들어 있는 칸)만 판매 목록에 올린다 (공용 규칙)
  const buildDurations = () => buildFormDurations(form);

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/shop/items", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(form, selectedRole?.name || "")),
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

  const processOrder = async (id: string, newStatus: "completed" | "cancelled" | "refunded", note = "") => {
    const res = await fetch("/api/shop/orders", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus, adminNote: note }),
    }).catch(() => null);
    const d = await res?.json().catch(() => null);
    if (res?.ok && d?.success) { fetchAll(); notify(newStatus === "completed" ? "발송 처리했습니다." : newStatus === "refunded" ? "환불했습니다. 디스코드 역할은 봇이 1분 안에 회수합니다." : "취소하고 환불했습니다."); }
    else notify(d?.message || "처리에 실패했습니다.", true);
    setNoteTarget(null); setNoteText(""); setCancelTarget(null);
  };

  // ⚠️ 훅을 모두 부른 뒤에 가린다. 이건 화면을 가리는 장치일 뿐이고 실제 방어는 서버(API)에서 한다.
  if (gate) return gate;

  const meta = TAB_META[tab];
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const shownOrdersByStatus = orderFilter ? orders.filter((o) => o.status === orderFilter) : orders;

  const discountPct = Math.min(100, Math.max(0, Number(form.discountPct) || 0));
  const salePreview = Math.max(0, Math.floor(((Number(form.price) || 0) * (100 - discountPct)) / 100));

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
  const orderSel = orderSelId ? orders.find((o) => o._id === orderSelId) : null;
  const couponSel = couponForm.id ? coupons.find((c) => c._id === couponForm.id) : null;

  // 📌 아이템 등록 — 인벤토리 미리보기는 폼 값을 그대로 따라간다. 효과 줄은 서버(/api/shop/my-items)와 같은 규칙
  //    (describeBasic + describeEffect, 역할이 연결된 아이템만)
  const regEffOn = itemForm.type !== "physical" && !!itemForm.roleId;
  const regEffectLines: string[] = regEffOn
    ? [
        ...describeBasic({ buffXp: xpNum(itemForm.buffXp), attendBuffXp: xpNum(itemForm.attendBuffXp) }),
        ...normalizeEffects(itemForm.effects.map(effectOf)).map((e: any) => describeEffect(e)),
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
            {it.itemId && <span className="block mt-0.5 text-[12px] font-normal text-[#5a5a5a]">등록 아이템</span>}
          </span>
        </span>
      ),
    },
    { key: "status", label: "상태", mobile: "title", render: (it) => <StatusChip tone={it.active ? "ok" : "neutral"}>{it.active ? "판매 중" : "숨김"}</StatusChip> },
    { key: "type", label: "유형 · 역할", render: (it) => <span className="text-[#5a5a5a]">{it.type === "physical" ? "기프트카드" : `${typeLabel(it.type)} · ${it.roleName || it.roleId || "역할 없음"}`}</span> },
    {
      key: "price", label: "가격", align: "right",
      render: (it) => (
        <span className="font-bold tabular-nums whitespace-nowrap">
          {Math.max(0, Math.floor((it.price * (100 - (it.discountPct || 0))) / 100)).toLocaleString()} XP
          {it.discountPct > 0 && <span className="ml-1 text-[#e91e3f]">-{it.discountPct}%</span>}
        </span>
      ),
    },
    { key: "stock", label: "재고", align: "right", render: (it) => <span className="tabular-nums"><ML>재고</ML>{it.stock < 0 ? "무제한" : it.stock}</span> },
    { key: "sold", label: "판매", align: "right", render: (it) => <span className="text-[#5a5a5a] tabular-nums">{it.soldCount || 0}개<span className="md:hidden"> 판매</span></span> },
    { key: "sort", label: "추천", align: "right", render: (it) => <span className="text-[#5a5a5a] tabular-nums"><ML>추천</ML>{it.sortOrder || 0}</span> },
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
    { key: "item", label: "상품", mobile: "title", render: (o) => <span className="block truncate max-w-[280px] font-bold">{o.itemName}</span> },
    { key: "type", label: "유형", render: (o) => <span className="text-[#5a5a5a]">{typeLabel(o.itemType)}</span> },
    { key: "user", label: "구매자", render: (o) => <span className="font-bold text-[#5a5a5a]">{o.userName}</span> },
    { key: "price", label: "금액", align: "right", render: (o) => <span className="font-bold tabular-nums whitespace-nowrap">{o.price.toLocaleString()} XP</span> },
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

  const newBtn = (onClick: () => void) => <Btn onClick={onClick}>새로 만들기</Btn>;

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
        {/* 탭별 설명은 탭 줄 아래 본문 첫 줄에 */}
        {meta.desc && <p className="mb-4 text-[13px] text-[#5a5a5a] break-keep">{meta.desc}</p>}
        {/* ═══ 아이템 등록 ═══ */}
        {tab === "items" && (
          <>
            <Toolbar
              right={
                <>
                  {pendingInv.length > 0 && (
                    <Btn variant="secondary" onClick={importInvRoles} disabled={isImporting}>
                      {isImporting ? "가져오는 중..." : `표기 역할 가져오기 (${pendingInv.length})`}
                    </Btn>
                  )}
                  {newBtn(openNewReg)}
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
              rows={shownReg}
              rowKey={(it) => it._id}
              onRowClick={(it) => { fillRegForm(it); setPane("reg"); }}
              selectedKey={pane === "reg" ? itemForm.id : null}
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
                    onChange={(v) => setItemForm({ ...itemForm, type: v, roleId: v === "physical" ? "" : itemForm.roleId, detachOnSeason: v === "role" ? itemForm.detachOnSeason : false })} />
                </Field>

                {itemForm.type !== "physical" && (
                  <Field
                    label={<>연결 역할{itemForm.type === "item" ? <Opt /> : <Req />}</>}
                    hint={itemForm.type === "item" ? "역할이 있으면 보유자 인벤토리에 자동 표시되고 지급 시 역할도 붙습니다." : undefined}
                  >
                    <Dropdown
                      theme="light"
                      buttonClassName={DD_BTN}
                      value={itemForm.roleId}
                      onChange={(v) => changeItemRole(v)}
                      placeholder="역할을 선택하세요"
                      options={[...(itemForm.type === "item" ? [{ value: "", label: "역할 없음 (사이트 보유)" }] : []), ...guildRoles.map((r) => ({ value: r.id, label: r.name, color: r.color }))]}
                    />
                  </Field>
                )}

                <Field label="아이콘" hint="이미지가 없을 때 쓰입니다">
                  <IconPicker value={itemForm.icon} onChange={(v) => setItemForm({ ...itemForm, icon: v })} color={itemForm.color || itemTypeColor(itemForm.type)} inputClassName={inputClass} />
                </Field>
                <Field label="이미지 URL">
                  <input type="text" value={itemForm.imageUrl} onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })} placeholder="https://..." className={inputClass} />
                </Field>

                <Two>
                  <Field label="표기 색상" hint="비우면 유형 기본색">
                    <div className="flex items-center gap-2">
                      <input type="color" value={itemForm.color || itemTypeColor(itemForm.type)} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })}
                        className="w-10 h-10 shrink-0 rounded-lg border border-[#a3a3a3] bg-white p-1" />
                      <input type="text" value={itemForm.color} maxLength={7} onChange={(e) => setItemForm({ ...itemForm, color: e.target.value })} placeholder={itemTypeColor(itemForm.type)} className={inputClass} />
                    </div>
                  </Field>
                  <Field label="정렬" hint="작을수록 앞">
                    <input type="number" value={itemForm.sortOrder} onChange={(e) => setItemForm({ ...itemForm, sortOrder: e.target.value })} placeholder="0" className={inputClass} />
                  </Field>
                </Two>

                {itemForm.type === "role" && (
                  <Field label="시즌 전환">
                    <Toggle on={itemForm.detachOnSeason} onClick={() => setItemForm({ ...itemForm, detachOnSeason: !itemForm.detachOnSeason })}
                      onLabel="시즌 바뀌면 디스코드 역할 뗌" offLabel="디스코드 역할 계속 유지" />
                  </Field>
                )}
                <Field label="인벤토리 표시">
                  <Toggle on={itemForm.visible} onClick={() => setItemForm({ ...itemForm, visible: !itemForm.visible })} onLabel="표시" offLabel="숨김" />
                </Field>

                {/* ── 효과 — 연결 역할을 가진 사람에게 붙는다(저장: 그 역할의 RoleConfig). 기프트카드는 역할이 없어 숨긴다 ── */}
                {itemForm.type !== "physical" && (
                  <section className="mt-2 pt-4 border-t border-[#ededed]">
                    <h3 className="text-[14px] font-black tracking-tight mb-3">효과</h3>
                    {!itemForm.roleId && <p className={`${fieldNote} !mt-0 mb-3`}>디스코드 역할을 연결하면 적용됩니다</p>}
                    <EffectsEditor
                      buffXp={itemForm.buffXp}
                      attendBuffXp={itemForm.attendBuffXp}
                      list={itemForm.effects}
                      disabled={!itemForm.roleId}
                      channels={guildChannels}
                      onChange={(patch) => setItemForm((f) => ({ ...f, ...patch }))}
                    />
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
            <Toolbar right={newBtn(openNewProduct)}>
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
                rows={shownProducts}
                rowKey={(it) => it._id}
                onRowClick={(it) => { fillItemForm(it); setIsRoleOpen(false); setPane("product"); }}
                selectedKey={pane === "product" ? form.id : null}
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
                  <Btn variant="secondary" onClick={() => setShowPreview(true)}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    카드 미리보기
                  </Btn>
                  {form.id && <Btn variant="ghost" className={DEL_BTN} onClick={() => setDeleteTarget({ kind: "item", id: form.id })}>삭제</Btn>}
                </>
              }
            >
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
                            value: x._id, label: x.name, hint: itemTypeLabel(x.type),
                            icon: <ItemIcon icon={x.icon} imageUrl={x.imageUrl} type={x.type} size={18} color={x.color || itemTypeColor(x.type)} />,
                          }))}
                        />
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
                    <IconPicker value={form.icon} disabled={linked} onChange={(v) => setForm({ ...form, icon: v })}
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
                                <button key={r.id} type="button" onClick={() => { setForm({ ...form, roleId: r.id }); setIsRoleOpen(false); }}
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
                  <Two>
                    <Field label={<>정가 (XP)<Req /></>}>
                      <input type="number" min={1} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="예: 500000" className={inputClass} />
                    </Field>
                    <Field label="할인율 (%)" hint={discountPct > 0 && Number(form.price) > 0 ? <span className="font-bold text-[#e91e3f]">판매가 {salePreview.toLocaleString()} XP</span> : undefined}>
                      <input type="number" min={0} max={100} value={form.discountPct} onChange={(e) => setForm({ ...form, discountPct: e.target.value })} placeholder="0" className={inputClass} />
                    </Field>
                  </Two>

                  {/* 📌 기간제 역할 — 역할·권한·아이템만 (기프트카드는 기간 개념이 없다) */}
                  {form.type !== "physical" && (
                    <div className="mb-4">
                      <Toggle on={form.timed} onClick={() => setForm({ ...form, timed: !form.timed })}
                        onLabel="기간제 역할" offLabel="영구 보유" />
                      {/* 회수는 화면 밖에서 일어나는 일이라 이것만 남긴다 */}
                      {form.timed && (
                        <>
                          <p className={fieldNote}>기간이 지나면 봇이 역할을 자동 회수합니다 (무제한은 회수하지 않습니다).</p>
                          <div className="mt-4">
                            <Two>
                              {([{ k: "price7", d: 7 }, { k: "price30", d: 30 }] as const).map(({ k, d }) => {
                                const raw = Number((form as any)[k]) || 0;
                                return (
                                  <Field key={k} label={`${d}일 가격 (XP)`}
                                    hint={raw > 0
                                      ? discountPct > 0
                                        ? `판매가 ${Math.max(0, Math.floor((raw * (100 - discountPct)) / 100)).toLocaleString()} XP (${discountPct}% 할인)`
                                        : `판매가 ${raw.toLocaleString()} XP`
                                      : "비우면 이 기간은 팔지 않습니다"}>
                                    <input type="number" min={0} value={(form as any)[k]}
                                      onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                                      placeholder={d === 7 ? "예: 30000" : "예: 100000"} className={inputClass} />
                                  </Field>
                                );
                              })}
                            </Two>
                          </div>
                          {/* 무제한(days 0)은 이 화면에 입력 칸이 없다 — 저장 때 값은 그대로 유지되므로 보이기라도 한다 */}
                          {Number(form.priceInf) > 0 && (
                            <p className={fieldNote}>
                              무제한 옵션 <span className="font-bold tabular-nums">{Number(form.priceInf).toLocaleString()} XP</span> — 기존 값이 그대로 유지됩니다
                            </p>
                          )}
                          {buildDurations().length === 0 && (
                            <p className="mt-1.5 text-[12px] font-bold text-amber-700">기간 가격을 하나 이상 넣어야 기간제로 저장됩니다.</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </PaneSection>

                {/* ── 재고 · 순서 ── */}
                <PaneSection title="재고 · 순서">
                  <Two>
                    <Field label="재고">
                      <input type="number" min={-1} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="비우면 무제한" className={inputClass} />
                    </Field>
                    <Field label="추천 순서" hint="작을수록 상점 앞쪽 (추천순 기준)">
                      <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} placeholder="0" className={inputClass} />
                    </Field>
                  </Two>
                </PaneSection>

                {/* ── 시즌 동작 ── 기프트카드는 시즌과 무관하므로 아예 감춘다 */}
                {form.type !== "physical" && (
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
                    <input type="text" value={bannerForm.link} onChange={(e) => setBannerForm({ ...bannerForm, link: e.target.value })}
                      placeholder="/arctic 또는 /event" className={inputClass} />
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
                    {isMigrating ? "이전 중..." : "예전 코드 가져오기"}
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
                  { v: "", l: "전체", n: orders.length },
                  { v: "pending", l: "대기", n: pendingCount },
                  { v: "completed", l: "완료", n: orders.filter((o) => o.status === "completed").length },
                  { v: "cancelled", l: "취소", n: orders.filter((o) => o.status === "cancelled").length },
                  { v: "refunded", l: "환불", n: orders.filter((o) => o.status === "refunded").length },
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
              title={orderSel?.itemName || ""}
              sub={orderSel ? `${orderSel.userName} · ${fmtDateTime(orderSel.createdAt)}` : undefined}
              badge={orderSel ? <StatusChip tone={STATUS_TONE[orderSel.status] || "neutral"}>{STATUS_LABEL[orderSel.status]}</StatusChip> : undefined}
              footer={
                orderSel && (orderSel.status === "pending" || (orderSel.status === "completed" && orderSel.itemType !== "physical")) ? (
                  <>
                    {orderSel.status === "pending" && orderSel.itemType === "physical" && (
                      <Btn onClick={() => { setNoteTarget(orderSel); setNoteText(""); }}>발송 처리</Btn>
                    )}
                    {orderSel.status === "pending" && (
                      <Btn variant="secondary" onClick={() => setCancelTarget(orderSel)}>취소·환불</Btn>
                    )}
                    {orderSel.status === "completed" && orderSel.itemType !== "physical" && (
                      <Btn variant="secondary" onClick={() => setCancelTarget(orderSel)}>환불</Btn>
                    )}
                  </>
                ) : undefined
              }
            >
              {orderSel && (
                <dl>
                  <DefRow k="유형">{typeLabel(orderSel.itemType)}</DefRow>
                  <DefRow k="구매자">{orderSel.userName}</DefRow>
                  <DefRow k="금액"><span className="tabular-nums">{orderSel.price.toLocaleString()} XP</span></DefRow>
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
                  {detachBusy === "preview" ? "확인 중..." : "대상 미리보기"}
                </Btn>
                <Btn variant="danger" onClick={() => setDetachConfirm(true)}
                  disabled={!detachPreview || detachPreview.matched === 0 || !!detachBusy}>
                  {detachBusy === "run" ? "처리 중..." : "디스코드 역할 떼기 실행"}
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
        body={cancelTarget ? (
          <>
            <span className="block font-bold text-[#131313]">{cancelTarget.itemName}</span>
            <span className="block mb-3">
              {cancelTarget.userName} · {
                // 서버(orders)는 billed 면 몫이 0 이어도 그 몫을 돌려준다 — 확인창도 같은 값을 보여야 한다
                cancelTarget.billed || (cancelTarget.paidXp || 0) > 0 || (cancelTarget.paidPoint || 0) > 0
                  ? [cancelTarget.paidXp > 0 && `${cancelTarget.paidXp.toLocaleString()} XP`, cancelTarget.paidPoint > 0 && `${cancelTarget.paidPoint.toLocaleString()} 빙옥`].filter(Boolean).join(" + ") || "0 XP"
                  : `${(cancelTarget.price || 0).toLocaleString()} XP`
              } 환불
            </span>
            {cancelTarget.status === "completed"
              ? "결제한 XP·빙옥을 돌려주고 디스코드 역할은 봇이 회수합니다."
              : "결제한 XP·빙옥을 돌려주고 재고를 되돌립니다."}
          </>
        ) : null}
        onConfirm={() => cancelTarget && processOrder(cancelTarget._id, cancelTarget.status === "completed" ? "refunded" : "cancelled")}
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
              <Btn onClick={() => processOrder(noteTarget._id, "completed", noteText)}>완료 처리</Btn>
            </div>
          </div>
        </div>
      )}

      {/* 📌 카드 미리보기 — 상점(라이트 톤)에서 실제로 어떻게 보이는지 그대로 렌더 (z-125: 모바일 상세 판 위) */}
      {showPreview && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/40 p-4 overlay-in" onClick={() => setShowPreview(false)}>
          <div role="dialog" aria-modal="true" aria-label="카드 미리보기" className="w-full max-w-sm bg-white border border-[#ededed] rounded-2xl p-5 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] text-[#131313]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[17px] font-black tracking-tight">카드 미리보기</h2>
              <button type="button" onClick={() => setShowPreview(false)} aria-label="닫기" className="shrink-0 w-9 h-9 rounded-full bg-[#f2f2f2] text-[#5a5a5a] hover:text-[#131313] flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#131313]/30">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor"><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* 상점 배경 위에 실제 카드 마크업 그대로 */}
            <div className="bg-[#f4f3f2] rounded-2xl p-5">
              <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col">
                <div className="relative aspect-[4/3] bg-[#e9e8e6] overflow-hidden">
                  <CardArt it={form} iconSize={60} />
                  <TypeBadge type={form.type} className="absolute top-3 left-3 px-2.5 py-1 text-[10px] tracking-wide" />
                  {form.stock === "0" && (
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                      <span className="text-sm font-black text-[#131313] tracking-wider">SOLD OUT</span>
                    </div>
                  )}
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <h3 className="text-base font-black text-[#131313] tracking-tight mb-1.5 break-keep">{form.name || "상품명을 입력하세요"}</h3>
                  {form.description && <p className="text-[12px] text-[#5a5a5a] leading-relaxed mb-3 line-clamp-2 break-keep whitespace-pre-line">{form.description}</p>}

                  <div className="flex items-center gap-2 mb-4 text-[11px] font-bold text-[#8a8a8a]">
                    <span>{form.stock === "" ? "재고 무제한" : `남은 수량 ${form.stock}개`}</span>
                  </div>

                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xl font-black text-[#131313] tracking-tight tabular-nums">{(Number(form.price) || 0).toLocaleString()}</div>
                      <div className="text-[10px] font-bold text-[#8a8a8a] tracking-wider">XP</div>
                    </div>
                    <span className="px-5 py-2.5 rounded-full text-[12px] font-bold bg-[#e91e3f] text-white shadow-[0_4px_12px_rgba(233,30,63,0.25)]">구매하기</span>
                  </div>
                </div>
              </div>
            </div>

            <p className="mt-3 text-center text-[12px] text-[#5a5a5a]">
              {form.active ? "판매 중 — 상점에 노출됩니다" : "숨김 — 상점에 노출되지 않습니다"}
              {form.type === "role" && !form.roleId && <span className="block mt-1 font-bold text-[#d01634]">지급할 역할을 선택해야 저장할 수 있습니다</span>}
            </p>
          </div>
        </div>
      )}

      {noticeEl}
    </>
  );
}
