"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "next-auth/react";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { splitItemName } from "@/lib/itemName";
import { resolveCategory, shortNameOf } from "@/lib/itemCategory";
import { playTone } from "@/lib/sfx";
import ItemIcon from "./ItemIcon";
import TierEmblem from "./TierEmblem";
import AvatarFrame from "./AvatarFrame";
import { SceneBack, sceneBarOf, GhostTrailBar } from "./SceneBack";
import { sceneMetaOf } from "@/lib/cardScenes";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { ICON_PATHS } from "./Icons";
import { PopShell } from "./PopShell";
import { artOfSkin, artOfScene, artOfFrame } from "@/lib/cosmeticArt";
import { useAdminView } from "./AdminView";
import { rarityOf, rarityRank, RARITIES } from "@/lib/rarity";
const RARITY_TOP = RARITIES.length; // 등급 보상 — 모든 희귀도보다 앞
import {
  SKIN_OF, SKIN_NONE, FRAME_OF, SCENE_OF, SKIN_RANK_ALL, FRAME_ALL,
  MAX_BADGES, badgeSlotsOf, badgeOrderOf, firstEmptySlot, pickSlot, nextEmptySlot, putBadgeAt, takeBadgeAt,
  AUTO_SCOPE, scopeLabelOfKeys, scopeLabelOfKind, describeEffect, SKINS, SCENES, FRAMES,
} from "@/lib/itemEffects";

// 📌 장착 판 미리보기의 카드 테두리 · 카드 배경 그림(SkinFrame → lib/cardSkins, 그림 코드가 크다) — 꾸미기 탭을 열 때만 받는다(ARCTIC 목록 화면 짐을 늘리지 않게)
const SkinFrame = dynamic(() => import("./SkinFrame"), { ssr: false });

// 📌 인벤토리 — 레벨 대시보드의 가방 팝업을 내 정보 · ARCTIC 에서도 그 자리에 띄운다 (다른 화면으로 넘기지 않는다)

// 📌 인벤토리 분류 — 아이템 등록의 유형(type)이 기준이다. 레벨 보상 역할만 따로 묶는다.
//    탭 순서는 이 표를 따른다 (실제로 가진 분류만 만든다 — 빈 탭을 띄우지 않는다)
export const INV_GROUPS = [
  { id: "role", label: "역할" },
  { id: "perk", label: "권한" },
  { id: "item", label: "아이템" },
  { id: "cosmetic", label: "꾸미기" },
  { id: "physical", label: "실물" },
  { id: "level", label: "레벨 보상" },
];
export const INV_GROUP_ORDER = Object.fromEntries(INV_GROUPS.map((g, i) => [g.id, i]));

// 인벤토리 행의 보조 한 줄 — 설명이 있으면 그것, 없으면 유형 + 조건
export const invSubLabel = (it) => {
  if (it.description) return it.description;
  const base = it.source === "level" ? "레벨 보상" : itemTypeLabel(it.type || it.kind);
  if (it.source === "level") return it.rewardLevel != null ? `${base} · Lv.${it.rewardLevel} 도달` : base;
  if (it.source === "pass") return `${base} · 시즌 패스`;
  if (it.source === "event") return `${base} · 이벤트 패스`;
  if (it.source === "goedam") return `${base} · 괴담회`;
  if (it.source === "grant") return `${base} · 운영진 지급`;
  if (it.source === "season") return `${base} · 시즌 ${it.seasonNo} 보상`;
  if (it.days > 0) return `${base} · ${it.days}일 이용권`;
  return base;
};

// 📌 자리 번호 말고 id 로 찾는다 — 분류가 늘면 번호가 밀린다
const invGroup = (id) => INV_GROUPS.find((g) => g.id === id);
export const invGroupOf = (it) => {
  if (it.source === "level") return invGroup("level");
  return invGroup(it.type || it.kind) || invGroup("item");
};
// 꾸미기 탭에 드는 칸(유형 꾸미기 — 시즌 등급 테두리 · 등급 카드 테두리 칸도 꾸미기). 다른 탭 상세의 「꾸미기에서 보기」가 이걸로 가른다
const isLookRow = (it) => invGroupOf(it).id === "cosmetic";

// 가진 항목으로 탭을 만든다 — 전체 · 유형별(INV_GROUPS 순) · 기간제. 하나도 없으면 [] (탭 없이 빈 가방)
export const buildInvGroups = (invAll) => {
  if (!invAll || invAll.length === 0) return [];
  const byId = new Map();
  for (const it of invAll) {
    const g = invGroupOf(it);
    if (!byId.has(g.id)) byId.set(g.id, { ...g, items: [] });
    byId.get(g.id).items.push(it);
  }
  // 탭 순서는 유형 표(INV_GROUPS) 순 — 어떤 것을 먼저 샀든 자리가 바뀌지 않는다
  const groups = [...byId.values()].sort((a, b) => (INV_GROUP_ORDER[a.id] ?? 99) - (INV_GROUP_ORDER[b.id] ?? 99));
  // 기간제는 유형과 겹쳐도 따로 모아 본다 — 언제 끝나는지 한눈에 보려는 사람이 많다
  const timed = invAll.filter((it) => it.expiresAt);
  return [{ id: "all", label: "전체", items: invAll }, ...groups, ...(timed.length ? [{ id: "timed", label: "기간제", items: timed }] : [])];
};

// 📌 정렬 — 기본(상점 관리에서 정한 순서, 서버가 준 순서 — 꾸미기 탭은 종류별로 묶음: sortCosmeticByKind) · 최신순(받은 날) · 만료 임박(기간제 먼저).
//    등급 · 레벨 보상은 어느 정렬에서든 맨 앞(받은 날이 없는 항목이라 뒤로 밀리지 않게). 날짜가 없는 것은 기본 순서로 뒤에.
//    📌 2026-10-17 「희귀도순」 — 높은 등급(lib/rarity — 유물 … 일반) 먼저, 같은 등급은 기본 순서. 안 고른 것("")은 일반
export const INV_SORTS = [
  { v: "default", l: "기본" },
  { v: "recent", l: "최신순" },
  { v: "expiry", l: "만료 임박" },
  { v: "rarity", l: "희귀도순" },
];
const INV_SORT_KEY = "iglooInvSort";
export const sortInvRows = (rows, sort) => {
  if (sort !== "recent" && sort !== "expiry" && sort !== "rarity") return rows;
  const t = (v) => (v ? new Date(v).getTime() : NaN);
  return rows
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const la = a.it.source === "level" ? 0 : 1;
      const lb = b.it.source === "level" ? 0 : 1;
      if (la !== lb) return la - lb;
      if (la === 0) return a.i - b.i;
      if (sort === "rarity") {
        // 등급 보상(희귀도 없음)은 유물보다 앞 — 레벨 보상은 위에서 이미 맨 앞
        const rk = (x) => (x.rarity == null && x.source === "season" ? RARITY_TOP : rarityRank(x.rarity));
        const d = rk(b.it) - rk(a.it);
        if (d) return d;
      } else if (sort === "recent") {
        const ta = t(a.it.acquiredAt), tb = t(b.it.acquiredAt);
        if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
        if (Number.isFinite(ta) && ta !== tb) return tb - ta;
      } else {
        const ta = t(a.it.expiresAt), tb = t(b.it.expiresAt);
        if (Number.isFinite(ta) !== Number.isFinite(tb)) return Number.isFinite(ta) ? -1 : 1;
        if (Number.isFinite(ta) && ta !== tb) return ta - tb;
      }
      return a.i - b.i;
    })
    .map((x) => x.it);
};

// 📌 아이템 아이콘은 공용 ItemIcon(app/components/ItemIcon) 이 그린다 — 이미지 > 프리셋 SVG > 이모지 > 유형 기본.
//    레벨 보상(source "level")은 유형 대신 "level" 을 넘겨 메달이 나오게 한다.
export const invIconType = (it) => (it.source === "level" ? "level" : it.type || it.kind || "item");

// 📌 등급 보상(아이언 · 브론즈 …) — 지급 레벨이 등급 시작 레벨과 같으면 그 등급의 엠블럼 · 색으로 그린다(메달 대신)
export const invTierOf = (it) => (it?.source === "level" && it.rewardLevel != null ? VOICE_TIERS.find((t) => t.min === it.rewardLevel) || null : null);
// 칸 · 상세의 아이콘 — 등급 보상은 엠블럼, 나머지는 공용 ItemIcon
const InvIcon = ({ it, size, color, dim }) => {
  const tier = invTierOf(it);
  if (tier) return <TierEmblem tier={tier} size={Math.round(size * 1.15)} muted={dim} />;
  return <ItemIcon icon={it.icon} imageUrl={it.imageUrl} type={invIconType(it)} size={size} color={color} dim={dim} />;
};

// 색 — 등록된 색 > 유형 기본색 (lib/items.js). 레벨 보상은 서버가 분홍을 실어 보낸다.
//    잉크 패널 위라 너무 어두운 색(기프트카드 기본 #131313 등)은 밝은 회색으로 바꿔 칸 테두리가 보이게 한다
export const invAccentOf = (it) => {
  const c = invTierOf(it)?.c || it.color || itemTypeColor(it.type || it.kind);
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  if (!m) return c;
  const lum = (parseInt(m[1], 16) * 0.299 + parseInt(m[2], 16) * 0.587 + parseInt(m[3], 16) * 0.114) / 255;
  return lum < 0.18 ? "#d4d4d4" : c;
};
// 기간제 — 역할 기간제는 봇이 역할을 준 때부터 센다(2026-10-04). 아직 지급 대기(provisional)면 만료가 정해지지 않아 남은 기간을 세지 않는다
const ddayOf = (it) =>
  it.expiresAt && !it.provisional ? Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000)) : null;
const untilOf = (it) =>
  it.expiresAt
    ? new Date(it.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

// 칸 이름 아래 상태 · 기간 줄이 있는 항목 (지급 대기 · 확인 필요 · 기간제 · 여러 개 묶음)
//    📌 ×N — 1개 단위 상품 · 소모품 묶음(서버 my-items 의 count). 모서리 배지 대신 이 줄 맨 앞에 글자로
const hasSlotStatus = (it) => it.status === "pending" || it.status === "missing" || !!it.expiresAt || it.count > 1;

// 📌 2026-10-11 「다듬은 잉크 판」(운영자 "다듬으니까 좋네") — 칸 · 상세 이름은 유형 머리말(카드 테두리 · 배지 …)을 뗀 이름.
//    유형은 탭 · 상세의 유형 글자(invKindOf)가 알려 준다. 떼고 남는 글자가 없으면 원래 이름 그대로. title(마우스 올림)은 원래 이름
//    📌 2026-10-17 분류는 따로(lib/itemCategory.js 「자동 + 바꾸기」) — 서버(lib/inventory.js)가 칸마다 shortName(이름) · categoryLabel(유형 글자)을 싣는다.
//       그 칸이 없는 칸(옛 응답 · 이름만 넘기는 배지 창)만 예전처럼 이름 머리말을 뗀다(lib/itemName.js splitItemName — 「카드 스킨 · 」도 「카드 테두리 · 」도 카드 테두리)
export const invShortName = (it) => (typeof it?.shortName === "string" && it.shortName) || splitItemName(it?.name).short;
// 📌 「꾸미기」 안 고르기(위 탭은 지금 개수로 고정 — 2026-10-11 "고정 시키고 그 내부에서 고르는 게 나아") — 가진 종류만 칩으로.
//    2026-10-15 「카드 스킨」은 묶음 이름 → 카드 배경(sceneKey) · 카드 테두리(skinKey — 예전 카드 스킨 전부) · 프로필 테두리(frameKey — 예전 아바타 테두리)
export const COSMETIC_KINDS = [
  { id: "scene", label: "카드 배경" },
  { id: "skin", label: "카드 테두리" },
  { id: "frame", label: "프로필 테두리" },
  { id: "badge", label: "배지" },
  { id: "etc", label: "기타" },
];
// 한 아이템이 여러 종류일 수 있다(카드 배경 + 카드 테두리 한 아이템) — 칩 · 장착 칸은 어느 쪽으로 걸러도 그 아이템이 보이게 종류 목록으로 본다
export const cosmeticKindsOf = (it) => {
  const out = [];
  if (it.sceneKey) out.push("scene");
  if (it.skinKey || it.skinKeys?.length) out.push("skin");
  if (it.frameKey || it.frameKeys?.length) out.push("frame");
  if (it.badgeId) out.push("badge");
  return out.length ? out : ["etc"];
};
export const cosmeticKindOf = (it) => cosmeticKindsOf(it)[0];
// 📌 2026-10-23 꾸미기 「기본」은 종류별로 묶는다(운영자 "너무 뒤죽박죽") — 칩 순서(카드 배경 → 카드 테두리 → 프로필 테두리 → 배지 → 기타),
//    같은 종류 안은 기본 순서(상점 관리 순서 — 같은 시즌 · 이벤트끼리 붙음). 두 종류를 가진 아이템은 앞 종류로. 등급 · 레벨 보상은 그대로 맨 앞
const COSMETIC_POS = Object.fromEntries(COSMETIC_KINDS.map((k, i) => [k.id, i]));
export const sortCosmeticByKind = (rows) =>
  rows
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const la = a.it.source === "level" ? 0 : 1;
      const lb = b.it.source === "level" ? 0 : 1;
      if (la !== lb) return la - lb;
      if (la === 0) return a.i - b.i;
      return COSMETIC_POS[cosmeticKindOf(a.it)] - COSMETIC_POS[cosmeticKindOf(b.it)] || a.i - b.i;
    })
    .map((x) => x.it);
// 📌 2026-10-18 꾸미기는 「효과」 대신 「적용 범위」(운영자 "효과라는 건 약간 이상하잖아") — 서버(lib/inventory)가 칸마다 isCosmetic · scopeLabel
//    (관리자가 고른 범위 > 종류마다 자동 — lib/itemEffects AUTO_SCOPE)을 싣는다. 그 칸이 없는 칸(옛 응답)만 꾸미기 키로 자동 값. 꾸미기가 아니면 ""
const SCOPE_KIND = { scene: "cardScene", skin: "cardSkin", frame: "avatarFrame", badge: "profileBadge" };
export const invScopeOf = (it) => {
  if (!it) return "";
  if (typeof it.isCosmetic === "boolean") return it.isCosmetic ? it.scopeLabel || "" : "";
  return scopeLabelOfKeys(cosmeticKindsOf(it).flatMap((k) => AUTO_SCOPE[SCOPE_KIND[k]]?.keys || []));
};
// 보일 효과 줄 — 서버 줄 그대로. 옛 응답(isCosmetic 없음)만 예전 꾸미기 문장(「카드 테두리 · 골드」 …)을 뺀다(적용 범위 줄이 대신 — 같은 말이 두 번 보이지 않게).
//    예전 문장은 lib/itemEffects describeEffect 와 같은 식(레벨 페이지 FX_COSMETIC_LINES 와 같은 표) — 처음 쓸 때 한 번 만든다
let OLD_COSMETIC_LINES = null;
const oldCosmeticLine = (l) => {
  OLD_COSMETIC_LINES ??= new Set([
    ...["profileBadge", "cardSkin", "cardScene", "avatarFrame"].map((on) => describeEffect({ on })),
    ...SKINS.map((s) => describeEffect({ on: "cardSkin", skin: s.v })),
    ...SCENES.map((s) => describeEffect({ on: "cardScene", scene: s.v })),
    ...FRAMES.map((f) => describeEffect({ on: "avatarFrame", frame: f.v })),
    describeEffect({ on: "avatarFrame", frame: FRAME_ALL }),
  ]);
  return OLD_COSMETIC_LINES.has(l);
};
export const invEffectLinesOf = (it) => {
  const lines = Array.isArray(it?.effectLines) ? it.effectLines.filter(Boolean) : [];
  return typeof it?.isCosmetic === "boolean" || it?.effectCustom ? lines : lines.filter((l) => !oldCosmeticLine(l));
};
// 상세 이름 위 유형 글자 — 서버가 정한 분류(categoryLabel — 직접 정한 분류 > 옛 이름 머리말 > 자동, 등급 · 레벨 보상은 「등급 보상」 · 「레벨 보상」)
//    📌 그 칸이 없는 칸(옛 응답)만 예전 차례 — 꾸미기 키 → 이름 머리말 → 유형 이름.
//       효과 키가 없는 꾸미기(효과 없이 이름 · 아이콘만 온다)는 뗀 머리말로 — 머리말을 떼고 「꾸미기」만 남아 무엇인지 모르게 되지 않게
export const invKindOf = (it) => {
  if (typeof it.categoryLabel === "string" && it.categoryLabel) return it.categoryLabel;
  if (it.source === "level") return invTierOf(it) ? "등급 보상" : "레벨 보상";
  if (it.sceneKey) return "카드 배경";
  if (it.skinKey || it.skinKeys?.length) return "카드 테두리";
  if (it.frameKey || it.frameKeys?.length) return "프로필 테두리";
  if (it.badgeId) return "프로필 배지";
  const head = (it.type || it.kind) === "cosmetic" ? splitItemName(it.name).kind : "";
  return head || itemTypeLabel(it.type || it.kind);
};

// 📌 인벤토리 탭 — 밑줄 탭(2026-10-11 운영자 "밑줄로 기~": 알약 대신 글자만, 고른 탭에 흰 밑줄 · 번호 없음). 다른 창(시즌 패스 …)은 PopTab 알약 그대로.
//    밑줄은 탭 줄 아래 선(PopShell 탭 줄 border-b)에 닿게 — 탭 줄 위아래 여백(py-4)만큼 늘려 둔다(-my-4 · h-16). 고른 탭도 굵기가 같아 글자 폭이 안 바뀐다
//    📌 탭 줄(PopShell)에 tablist 가 없어 role="tab" 대신 눌림 단추(aria-pressed — 정렬 · 칩과 같은 결). 키보드 포커스는 글자 둘레 테(밑줄 그림자를 안 덮게)
const InvTab = ({ on, onClick, label }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    // 📌 PC 는 큰 창(1100)에 맞춰 키운다 — 16px · 사이 24 · 줄 높이 72(2026-10-17 운영자 "탭줄도 키워봐"). 폰은 그대로
    //    폰은 줄이 접히므로(PopShell tabsWrap) 음수 여백 없이 높이 44 — 줄마다 밑줄이 제자리에
    className={`group shrink-0 sm:-my-4 mr-3.5 sm:mr-6 h-11 sm:h-[72px] inline-flex items-center text-[13px] sm:text-[16px] font-extrabold whitespace-nowrap transition-colors outline-none focus-visible:text-white ${on ? "text-white" : "text-white/40 hover:text-white/75"}`}
    style={{ boxShadow: on ? "inset 0 -2px 0 #ffffff" : "none" }}
  >
    <span className="rounded-sm group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-white/60">{label}</span>
  </button>
);

// 📌 칸 틀 「홈 칸」(2026-10-11 운영자가 시안 A 를 골랐다 — 둥근 회색 테 칸은 "싼티나"):
//    각진 칸이 판에 파인 모양 — 판(#131313)보다 어두운 바닥 + 위 · 왼쪽 안쪽 그늘 + 아래 · 오른쪽 안쪽 밝은 선 + 바깥 1px 선.
//    고른 칸은 바깥 선 대신 흰 2px. 빈 칸 · 상세 큰 칸도 같은 틀
const SLOT_BG = "#0c0c0c";
// 📌 창 번짐 — 고른 아이템 색(2026-10-11 "붉은 번짐 말고도 그냥 아이템 색상 따라서 나오게"). 고른 게 없으면 투명(번짐 자리는 남겨 색이 부드럽게 넘어가게)
export const invGlowOf = (it) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(it ? invAccentOf(it) : "");
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},0.24)` : "rgba(0,0,0,0)";
};
// ring: 바깥 테만 바꿀 때(배지 창 — 끌어다 놓는 중인 칸은 흐린 흰 2px). 문자열을 잘라 붙이지 않게 인자로 받는다
const slotShadow = (on, empty = false, ring = "") =>
  `${ring || (on ? "0 0 0 2px #ffffff" : `0 0 0 1px ${empty ? "#1f1f1f" : "#262626"}`)}, inset 2px 2px 0 rgba(0,0,0,0.55)${empty ? "" : ", inset -1px -1px 0 rgba(255,255,255,0.06)"}`;
// 📌 키보드 포커스 테 — 칸은 그림자(box-shadow)로 테를 그려 ring 이 안 보이므로 outline. outline-none 이 테 모양(--tw-outline-style)까지 지우므로 solid 를 다시 준다
const SLOT_FOCUS = "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70";

// ══ 희귀도(2026-10-17 운영자 — 일곱 등급, lib/rarity.js 표 한 곳 · 여기서는 그 값으로 그리기만 한다) ══
//    칸: 아래 띠(등급 색 — 단색) · 안쪽 아래 빛(glow) · 테(edge — 고른 칸은 흰 2px 그대로). 무지개 · 반짝이는 운영자 반려로 뺐다
//    상세: 이름 위 등급 알약 + 종류(회색). 폰 상세 줄(DetailMini)은 알약 없이
const rgbOf = (hex) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 255, 255];
};
const rgbaOf = (hex, a) => `rgba(${rgbOf(hex).join(",")},${a})`;
// 알약 글자 — 등급 색에 흰빛을 섞은 밝은 색(어두운 판 위에서 읽히게)
const tintOf = (hex, t = 0.55) => `rgb(${rgbOf(hex).map((v) => Math.round(v + (255 - v) * t)).join(",")})`;
// 칸 바탕 · 테 — 안쪽 아래 빛은 바탕 겹으로(아이콘 위를 덮지 않게), 테는 바깥 1px
const rarityTileStyle = (r, on) => ({
  background: r && r.glow > 0 ? `linear-gradient(0deg, ${rgbaOf(r.c, r.glow)} 0%, ${rgbaOf(r.c, 0)} 58%), ${SLOT_BG}` : SLOT_BG,
  boxShadow: slotShadow(on, false, r && r.edge && !on ? `0 0 0 1px ${r.c}` : ""),
});
// 📌 희귀도 — 아이템 문서가 있는 칸만(rarity "" 은 일반). 레벨 · 등급 · 시즌 보상처럼 고를 수 없는 칸은 null → 예전 모습(아이템 색 띠 · 색 종류 글자)
const rarOf = (it) => (it?.rarity == null ? null : rarityOf(it.rarity));
const stripeOf = (rar, accent) => (rar ? rar.c : accent);
// ══ 즐겨찾기 별(2026-10-18 운영자 "★ 이런 디자인 말고 모서리가 둥근 별로 자체적으로") — 글자 ★ · ☆ 대신 그린 별, 꼭짓점마다 곡선 ══
//    on: 채운 별(넣음) · 아니면 테만(안 넣음 · 거르기 꺼짐). 색은 글자 색(currentColor). rim: 칸 위 작은 표시 — 어두운 테를 바깥에 둘러 어느 바탕에서도 또렷하게
const STAR_D = "M11.1 4.52Q12 2.7 12.9 4.52L14.52 7.8Q15 8.77 16.07 8.93L19.69 9.46Q21.7 9.75 20.25 11.17L17.63 13.72Q16.85 14.48 17.03 15.54L17.65 19.15Q18 21.15 16.2 20.21L12.96 18.5Q12 18 11.04 18.5L7.8 20.21Q6 21.15 6.35 19.15L6.97 15.54Q7.15 14.48 6.37 13.72L3.75 11.17Q2.3 9.75 4.31 9.46L7.93 8.93Q9 8.77 9.48 7.8Z";
const FavStar = ({ on, size = 16, rim = false }) => (
  <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className="block shrink-0 pointer-events-none">
    <path d={STAR_D} fill={on ? "currentColor" : "none"} stroke={rim ? "rgba(0,0,0,0.6)" : on ? "none" : "currentColor"} strokeWidth={rim ? 3.2 : 2} strokeLinejoin="round" paintOrder="stroke" />
  </svg>
);
// 📌 테 있는 h-7 알약(즐겨찾기 · 꾸미기 종류 칩) — 폭을 정수 px 로 올려(calc-size — 못 읽는 브라우저는 그대로) 글자 · 별이 0.5px 자리에 놓이지 않게.
//    줄 높이는 테 안 높이(26px) · 별은 짝수 px(14) — 위아래도 정수(2026-10-18 운영자 "알약 버튼이랑 글의 가로 중앙 배열 좀 맞춰줄래")
const PILL_W = { width: "calc-size(fit-content, round(up, size, 1px))" };
// 칸 장식 — r: rarOf(…)(지급 대기 · 확인 필요는 장식 없이 — dead). 등급이 없는 칸(r null)은 아이템 색 띠만(stripe). 즐겨찾기 별은 오른쪽 위
const RarityDeco = ({ r, fav, stripe = "" }) => {
  return (
    <>
      {(r || stripe) && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] pointer-events-none" style={{ background: stripeOf(r, stripe) }}></span>}
      {fav && <span aria-hidden className="absolute top-1 right-1 text-[#ffd34d] pointer-events-none"><FavStar on rim size={13} /></span>}
    </>
  );
};
// 등급 알약 — 둥근 알약 · 등급 색 테(70%) · 옅은 바탕(16%) · 밝은 글자
//    📌 글자 줄 높이 = 테 안 높이(18px) · 폭은 정수 px 로 올림(calc-size — 못 읽는 브라우저는 그대로) — 알약이 0.5px 같은 소수 위치에 놓여도
//    글자가 위 · 옆으로 1px 쏠리지 않는다(2026-10-17 「일반」 알약 글자 어긋남). 상품 상세 알약(app/arctic/item/[id])과 같은 값
const RarityPill = ({ r }) => {
  const style = { border: `1px solid ${rgbaOf(r.c, 0.7)}`, color: tintOf(r.c), background: rgbaOf(r.c, 0.16), width: "calc-size(fit-content, round(up, size, 1px))" };
  return <span className="shrink-0 inline-flex items-center justify-center h-5 px-2 rounded-full text-[11px] font-black leading-[18px] whitespace-nowrap" style={style}>{r.l}</span>;
};
// 상세 머리 — 등급 알약 + 종류(회색)
//    등급이 없는 칸(rarOf null — 레벨 · 등급 · 시즌 보상)은 알약 없이 종류 글자를 아이템 색으로(예전 모습)
// 📌 등급 보상(레벨 보상 등급 사다리 · 시즌 등급 테두리 · 등급 카드 스킨)은 희귀도가 없다 — 알약 자리에 「등급」(그 등급 색).
//    2026-10-17 운영자 "보상이던 등급에 관련한 건 등급으로 표기 … 이건 희귀도가 있지 않아". 직접 설정 상품 · 옛 표기 역할은 그대로(알약 없음)
const isTierRow = (it) => it?.rarity == null && (it?.source === "level" || it?.source === "season");
const RarityKind = ({ it, kind, className = "" }) => {
  const r = rarOf(it);
  const tier = !r && isTierRow(it);
  const pill = r || (tier ? { c: invAccentOf(it), l: "등급" } : null);
  return (
    <div className={`flex items-center gap-2 min-w-0 ${className}`}>
      {pill && <RarityPill r={pill} />}
      <span className={`min-w-0 truncate text-[11px] leading-none ${pill ? "font-bold text-white/45" : "font-black"}`} style={pill ? undefined : { color: invAccentOf(it) }}>{kind}</span>
    </div>
  );
};

// ══ 즐겨찾기(2026-10-17) — 계정마다(GET · POST /api/shop/inv-favorites). 상세의 별 단추로 넣고 빼고, 넣은 칸은 오른쪽 위 노란 별(FavStar) ══
//    2026-10-18 따로 탭은 없다(운영자 "필터가 따로 있는 거면 즐겨찾기 카테고리가 왜 있을까") — 탭마다 「즐겨찾기」 거르기 칩으로만 본다
//    저장 키는 물건 키(lib/inventory favKey — 같은 아이템이면 같은 키: 기간제 → 무제한으로 다시 사도 그대로), 없으면 칸 uid
const favKeyOf = (it) => it?.favKey || it?.uid || "";
const noop = () => {}; // 재는 칸(보이지 않는 상세)에 단추 자리만 잡을 때
//    상세 쪽 props — fav: 넣었으면 true · 안 넣었으면 false · 넣을 수 없는 아이템(관리자 체험 · 로그인 안 함)은 null(단추 없음), onFav(): 넣고 빼기
const FavButton = ({ on, onToggle, size = "w-9 h-9", className = "" }) => (
  <button type="button" aria-pressed={on} aria-label="즐겨찾기" title="즐겨찾기" onClick={onToggle}
    className={`shrink-0 ${size} rounded-full border flex items-center justify-center text-[16px] leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
      on ? "border-[#ffd34d]/50 text-[#ffd34d] hover:border-[#ffd34d]/80" : "border-white/15 text-white/45 hover:text-white hover:border-white/35"
    } ${className}`}>
    <FavStar on={on} size={17} />
  </button>
);

// 📌 가방 칸 하나 — 가방 격자와 아이템 등록 미리보기가 같은 칸을 쓴다(onClick 이 없으면 누를 수 없는 칸)
// 📌 착용 표시(2026-10-15 운영자 "착용 했다는 표기 있는 것도 좋고 · 그냥 착용이라 뜨는 건 좀 그래 · 체크 표기 짜침") —
//    글자 · 체크 없이 게임 장비창처럼: 네 모서리 꺾쇠(아이템 색 2px) + 칸 바닥에서 올라오는 아이템 색 빛
const WornMark = ({ accent }) => {
  const L = 9, T = 2;
  const corner = (pos) => <span key={pos} aria-hidden className="absolute pointer-events-none" style={{ width: L, height: L, ...pos, borderColor: accent, borderStyle: "solid" }}></span>;
  return (
    <>
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(0deg, ${accent}33 0%, ${accent}00 62%)` }}></span>
      {corner({ left: 3, top: 3, borderWidth: `${T}px 0 0 ${T}px` })}
      {corner({ right: 3, top: 3, borderWidth: `${T}px ${T}px 0 0` })}
      {corner({ left: 3, bottom: 6, borderWidth: `0 0 ${T}px ${T}px` })}
      {corner({ right: 3, bottom: 6, borderWidth: `0 ${T}px ${T}px 0` })}
    </>
  );
};
// 📌 fav — 즐겨찾기에 넣은 칸(오른쪽 위 노란 별 — FavStar)
const InvSlot = ({ it, on, onClick, worn = false, fav = false, onWear }) => {
  const dead = it.status === "pending" || it.status === "missing";
  const accent = invAccentOf(it);
  const rar = dead ? null : rarOf(it);
  const dday = ddayOf(it);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick: onWear ? (e) => { if (e.detail > 1) return; onClick(e); } : onClick, ...(onWear ? { onDoubleClick: onWear } : {}) } : {})}
      title={it.name}
      className={`relative aspect-square flex flex-col items-center justify-center px-1.5 transition-[filter] ${SLOT_FOCUS} ${onClick && !on ? "hover:brightness-125" : ""}`}
      style={rarityTileStyle(rar, on)}
    >
      {/* 📌 칸 아래 띠는 희귀도 색(2026-10-17 — 예전엔 유형 색) · 빛 · 테 · 반짝이 — 지급 대기 · 확인 필요는 장식 없이. 아이콘 · 착용 꺾쇠는 아이템 색 그대로 */}
      <RarityDeco r={rar} on={on} fav={fav} stripe={dead ? "" : accent} />
      {worn && !dead && <WornMark accent={accent} />}
      {/* 아이콘 자리는 늘 28px — 등급 문장(32)은 이 자리 가운데서 위아래로 2px 씩 넘친다(문장 그림에 여백이 있어 괜찮다).
          아이템 아이콘(28)과 칸마다 높이가 달라 아이콘이 오르내리지 않게 */}
      <span aria-hidden className="mb-1.5 h-7 flex items-center justify-center">
        <InvIcon it={it} size={28} color={accent} dim={dead} />
      </span>
      {/* 📌 가운데 맞춤은 '아이콘 + 이름 첫 줄'로만 — 이름 둘째 줄 · 상태 줄은 그 아래로 늘어뜨린다.
             그래서 이름 줄 수 · 상태 줄이 칸마다 달라도 아이콘 · 이름 첫 줄이 모든 칸에서 같은 높이, 한 줄짜리 칸은 예전처럼 한가운데.
             늘어뜨리는 건 한 줄까지 — 상태 줄이 있으면 이름은 한 줄(말줄임), 좁은 폰 칸에서도 칸 밖으로 넘치지 않게 */}
      <span className="relative w-full h-[12.5px]">
        <span className="absolute inset-x-0 top-0 flex flex-col items-center">
          {/* 이름은 낱말 단위로 줄바꿈(break-keep — "테/두리"처럼 끊기지 않게), 한 낱말이 칸보다 길 때만 그 안에서 */}
          <span className={`w-full text-[10px] font-black leading-tight text-center break-keep [overflow-wrap:anywhere] ${hasSlotStatus(it) ? "line-clamp-1" : "line-clamp-2"} ${dead ? "text-white/35" : "text-white/85"}`}>
            {invShortName(it)}
          </span>
          {/* 상태 · 기간 — 모서리 배지 · 점 대신 이름 아래 한 줄 글자로 (3일 이하 · 확인 필요는 빨강) */}
          {hasSlotStatus(it) && (
            <span className={`mt-1 text-[9px] font-bold tabular-nums leading-none ${it.status === "missing" || (dday !== null && dday <= 3) ? "text-[#ff5c77]" : "text-white/45"}`}>
              {[it.count > 1 ? `×${it.count}` : "", it.status === "pending" ? "지급 대기" : it.status === "missing" ? "확인 필요" : "", dday !== null ? `D-${dday}` : ""].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      </span>
    </Tag>
  );
};

// 📌 가방 왼쪽 상세 — 큰 아이콘 · 이름 · 설명(줄바꿈 그대로) · 상태 · 기간 · (기간제면) 연장 · 효과.
//    compact 는 아이템 등록 미리보기용으로 크기만 줄인다(내용 · 순서는 같다). onGo 는 연장으로 떠날 때 가방을 닫는다
//    카드 배경 아이템(it.sceneKey)이면 착용 · 해제 버튼 — sceneOn: 지금 이 배경을 쓰는 중, onScene(키 | "none"). 카드 테두리와 따로 고르고 함께 입는다
//    카드 테두리 아이템(it.skinKey)이면 착용 · 해제 버튼 — skinOn: 지금 이 테두리를 쓰는 중, onSkin(키 | "none")
//    등급 전체(9종) 카드 테두리 아이템(it.skinKeys)이면 등급 칸 9개 — skinCur: 지금 쓰는 카드 테두리 키(프로필 테두리 전체 아이템과 같은 흐름)
//    프로필 배지 아이템(it.badgeId)이면 [배지 설정] 버튼 — 배지 창(BadgeWindow)을 그 자리에 연다. badgeSlot: 단 자리(0 · 1 · 2, 안 달았으면 -1), onBadgeOpen()
//    프로필 테두리 아이템(it.frameKey)이면 착용 · 해제 버튼 — frameOn: 지금 이 테두리를 쓰는 중, onFrame(키 | "none")
//    전체(9종) 테두리 아이템(it.frameKeys)이면 등급 칸 9개 — frameCur: 지금 쓰는 테두리 키, 누르면 그 테두리 · 낀 칸을 다시 누르면 해제
//    fav(true · false) · onFav 면 머리 오른쪽 위에 즐겨찾기 별(관리자 체험 · 미리보기는 null — 단추 없음)
//    onLook — 꾸미기 탭 밖(전체)에서 고른 꾸미기: 단추 맨 아래 「꾸미기에서 보기」(꾸미기 탭으로 넘어가 그 칸을 고른다 — 무대 카드에 입혀 보이는 전용 화면)
const InvDetail = ({ it, compact = false, onGo, sceneOn = false, onScene, sceneBusy = false, skinOn = false, skinCur = "", onSkin, skinBusy = false, badgeSlot = -1, onBadgeOpen, frameOn = false, frameCur = "", onFrame, frameBusy = false, fav = null, onFav, onLook }) => {
  const accent = invAccentOf(it);
  const rar = rarOf(it);
  const favOn = fav != null && !compact;
  const dday = ddayOf(it);
  const lines = invEffectLinesOf(it);
  // 📌 카드 배경 · 카드 테두리 · 배지 · 프로필 테두리 중 둘 이상인 아이템은 버튼이 여럿 — 어느 쪽인지 앞에 붙여 가른다(하나뿐이면 그냥 착용 · 착용 해제)
  // 📌 꾸미기 — 효과 줄 대신 「적용 범위」 줄(invScopeOf). 꾸미기 문장은 서버가 효과 줄에서 뺐다 — 남은 효과(채팅 XP 등)는 아래 효과 칸에 그대로
  const scope = invScopeOf(it);
  const both = [it.sceneKey, it.skinKey || it.skinKeys?.length, it.badgeId, it.frameKey || it.frameKeys?.length].filter(Boolean).length > 1;
  // 단추가 하나라도 있을 때만 단추 칸(빈 칸이 여백만 차지하지 않게) — 아래 단추들의 조건과 같다
  const hasActions = !compact && !!((it.expiresAt && it.renewId) || it.sceneKey || it.skinKey || it.skinKeys?.length > 1 || it.badgeId || it.frameKey || it.frameKeys?.length > 1 || onLook);
  const wearBtn = (on) =>
    `mt-1 w-full h-9 rounded-full text-[11px] font-black flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${
      on ? "border border-white/20 hover:border-white/45 text-white/80 hover:text-white" : "bg-white text-[#131313] hover:bg-white/90"
    }`;
  // 📌 꾸미기에서 보기(onLook · 2026-10-18) — 첫 착용 단추와 한 줄에 반반(아래에 따로 두면 폰 상세 칸 높이 제한에 잘려 안 보였다).
  //    착용 단추가 없으면(등급 칸 묶음뿐) 그 칸 위에 전체 폭
  const lookBtn = onLook && !compact ? (
    <button type="button" onClick={onLook} className={wearBtn(true)}>꾸미기에서 보기</button>
  ) : null;
  const pairFirst = lookBtn ? (it.sceneKey ? "scene" : it.skinKey ? "skin" : it.badgeId ? "badge" : it.frameKey ? "frame" : "") : "";
  const withLook = (key, el) => (pairFirst === key ? <div className="grid grid-cols-2 gap-2">{el}{lookBtn}</div> : el);
  return (
    <div className="min-w-0">
      {/* 📌 2026-10-11 「다듬은 잉크 판」 — 이름 위 유형 글자(그 색) · 이름은 머리말을 뗀 것 · 칸과 같은 옅은 단색 바탕.
             폰(가방)은 큰 아이콘 옆에 이름(위쪽이 덜 길게), PC · 미리보기(compact)는 위아래 */}
      {/* 📌 2026-10-17 유형 글자(아이템 색) 대신 등급 알약 + 종류(회색) · 큰 칸 아래 띠 · 빛도 희귀도 색. 즐겨찾기 별은 머리 오른쪽 위 */}
      <div className={compact ? "" : "relative flex items-center gap-3.5 sm:block"}>
        <div
          className={`relative ${compact ? "w-16 h-16 mb-3.5" : "w-[72px] h-[72px] sm:w-24 sm:h-24 shrink-0 sm:mb-5"} flex items-center justify-center`}
          style={{ background: it.status === "completed" ? rarityTileStyle(rar, false).background : SLOT_BG, boxShadow: slotShadow(false) }}
        >
          <InvIcon it={it} size={compact ? 30 : 46} color={accent} dim={it.status !== "completed"} />
          {it.status === "completed" && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] pointer-events-none" style={{ background: stripeOf(rar, accent) }}></span>}
        </div>
        {favOn && <FavButton on={!!fav} onToggle={onFav} className="absolute right-0 top-0" />}
        <div className={`min-w-0 ${favOn ? "pr-11 sm:pr-0" : ""}`}>
          <RarityKind it={it} kind={invKindOf(it)} className="mb-2" />
          <p className={`${compact ? "text-[16px]" : "text-[17px] sm:text-[20px]"} font-black text-white leading-snug break-keep [overflow-wrap:anywhere]`}>{invShortName(it)}</p>
          <p className="text-[12px] font-bold text-white/50 mt-1.5 leading-relaxed break-keep break-words whitespace-pre-line">{invSubLabel(it)}</p>
        </div>
      </div>

      {/* 상태 · 기간 · 만료 · 남은 기간 · 레벨 — 줄 사이 가는 선 */}
      <div className={`${compact ? "mt-4" : "mt-5"} border-t border-white/[0.08]`}>
        <div className="flex items-center justify-between gap-3 h-9 border-b border-white/[0.08]">
          <span className="text-[11px] font-bold text-white/45">상태</span>
          <span className={`text-[12px] font-black ${it.status === "missing" ? "text-[#ff5c77]" : it.status === "pending" ? "text-white/60" : "text-emerald-400"}`}>
            {it.status === "pending" ? "지급 대기" : it.status === "missing" ? "확인 필요" : "보유 중"}
          </span>
        </div>
        {/* 📌 여러 개 묶음(count — 1개 단위 · 소모품)은 기간 줄 자리에 수량 — 줄 수가 그대로라 상세가 늘지 않는다 */}
        <div className="flex items-center justify-between gap-3 h-9 border-b border-white/[0.08]">
          <span className="text-[11px] font-bold text-white/45">{it.count != null ? "수량" : "기간"}</span>
          <span className="text-[12px] font-black text-white/80 tabular-nums">
            {it.count != null
              ? `×${it.count}${it.pendingCount > 0 ? ` · 지급 대기 ${it.pendingCount}` : ""}`
              : it.expiresAt ? `${it.days > 0 ? `${it.days}일 · ` : ""}기간제` : it.source === "season" ? "다음 시즌까지" : "영구"}
          </span>
        </div>
        {it.expiresAt && !it.provisional && (
          <>
            <div className="flex items-center justify-between gap-3 h-9 border-b border-white/[0.08]">
              <span className="text-[11px] font-bold text-white/45">만료</span>
              <span className="text-[12px] font-black text-white/70 tabular-nums">{untilOf(it)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 h-9 border-b border-white/[0.08]">
              <span className="text-[11px] font-bold text-white/45">남은 기간</span>
              <span className={`text-[12px] font-black tabular-nums ${dday <= 3 ? "text-[#ff5c77]" : "text-white/70"}`}>
                D-{dday}
              </span>
            </div>
          </>
        )}
        {it.rewardLevel != null && (
          <div className="flex items-center justify-between gap-3 h-9 border-b border-white/[0.08]">
            <span className="text-[11px] font-bold text-white/45">레벨</span>
            <span className="text-[12px] font-black tabular-nums text-white/70">Lv.{it.rewardLevel}</span>
          </div>
        )}
        {/* 📌 적용 범위 — 이름 한 줄 위, 값 「대시보드 / 명령어 카드」 아래 줄(2026-10-18 운영자). 넷 다면 좁은 칸에서 낱말째 접힌다 */}
        {scope && (
          <div className="py-2.5 border-b border-white/[0.08]">
            <p className="text-[11px] font-bold leading-none text-white/45">적용 범위</p>
            <p className="mt-2 text-[12px] font-black leading-snug text-white/80 break-keep">{scope}</p>
          </div>
        )}
      </div>

      {/* 연장 · 착용 · 배지 설정 — 줄 목록 아래 */}
      <div className={hasActions ? "mt-3.5 space-y-3" : "hidden"}>
        {/* 📌 연장 — 상품 상세에서 기간을 이어 산다(지금 만료 뒤에 붙는다). 연장할 판매 상품이 있을 때만 서버(my-items)가 renewId 를 준다 */}
        {it.expiresAt && it.renewId && !compact && (
          <Link href={`/arctic/item/${it.renewId}`} onClick={onGo}
            className="mt-1 w-full h-9 rounded-full border border-white/20 hover:border-white/45 text-[11px] font-black text-white/80 hover:text-white flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            기간 연장
          </Link>
        )}
        {/* 📌 카드 배경 — 카드 바탕 그림 전체(레벨 막대 모양도 배경 몫). 카드 테두리와 따로 끼고 함께 입는다(배경 위에 테두리) */}
        {/* 착용 단추가 없는 꾸미기(등급 칸 묶음뿐)는 꾸미기에서 보기를 여기 전체 폭으로 */}
        {lookBtn && !pairFirst && lookBtn}
        {it.sceneKey && !compact && withLook("scene",
          <button type="button" disabled={sceneBusy} onClick={() => onScene?.(sceneOn ? SKIN_NONE : it.sceneKey)} className={wearBtn(sceneOn)}>
            {both ? (sceneOn ? "카드 배경 해제" : "카드 배경 착용") : sceneOn ? "착용 해제" : "착용"}
          </button>
        )}
        {/* 📌 카드 테두리 — 가진 테두리 중 하나를 골라 봇 이미지 카드(레벨업 · /레벨 · /랭크 · /출석체크)와 내 프로필 카드에 씌운다.
               해제하면 기본 카드. 착용 여부는 버튼 글자로만(테두리 이름은 아래 효과 줄 — 같은 말을 두 번 쓰지 않는다).
               버튼은 전체 폭이라 글자가 바뀌어도 자리가 그대로 */}
        {it.skinKey && !compact && withLook("skin",
          <button type="button" disabled={skinBusy} onClick={() => onSkin?.(skinOn ? SKIN_NONE : it.skinKey)} className={wearBtn(skinOn)}>
            {both ? (skinOn ? "카드 테두리 해제" : "카드 테두리 착용") : skinOn ? "착용 해제" : "착용"}
          </button>
        )}
        {it.skinKeys?.length > 1 && !compact && (
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {it.skinKeys.map((k) => {
              const on = k === skinCur;
              return (
                <button key={k} type="button" disabled={skinBusy} aria-pressed={on} onClick={() => onSkin?.(on ? SKIN_NONE : k)}
                  className={`h-8 rounded-full text-[10px] font-black truncate px-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${
                    on ? "bg-white text-[#131313]" : "border border-white/20 hover:border-white/45 text-white/75 hover:text-white"
                  }`}>
                  {(SKIN_OF[k]?.l || k).replace(/ 등급$/, "")}
                </button>
              );
            })}
          </div>
        )}
        {/* 📌 프로필 배지 — 이름 옆(내 정보 · 랭킹)에 최대 3개. 직접 단 것만 보인다(2026-10-04 자동으로 달지 않음).
               달기 · 떼기 · 자리는 배지 창에서 — 버튼은 하나, 단 배지면 자리 번호만 붙인다 */}
        {it.badgeId && !compact && withLook("badge",
          <button type="button" onClick={() => onBadgeOpen?.()} className={`${wearBtn(badgeSlot >= 0)} gap-1.5`}>
            배지 설정
            {badgeSlot >= 0 && (
              <span aria-label={`${badgeSlot + 1}번 자리`} className="w-4 h-4 rounded-full bg-white/15 text-[9px] font-black tabular-nums flex items-center justify-center">{badgeSlot + 1}</span>
            )}
          </button>
        )}
        {/* 📌 프로필 테두리 — 가진 테두리 중 하나를 골라 프로필 사진에 씌운다. 해제하면 테두리 없음(카드 테두리와 같은 흐름) */}
        {it.frameKey && !compact && withLook("frame",
          <button type="button" disabled={frameBusy} onClick={() => onFrame?.(frameOn ? SKIN_NONE : it.frameKey)} className={wearBtn(frameOn)}>
            {both ? (frameOn ? "프로필 테두리 해제" : "프로필 테두리 착용") : frameOn ? "착용 해제" : "착용"}
          </button>
        )}
        {it.frameKeys?.length > 1 && !compact && (
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {it.frameKeys.map((k) => {
              const on = k === frameCur;
              return (
                <button key={k} type="button" disabled={frameBusy} aria-pressed={on} onClick={() => onFrame?.(on ? SKIN_NONE : k)}
                  className={`h-8 rounded-full text-[10px] font-black truncate px-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${
                    on ? "bg-white text-[#131313]" : "border border-white/20 hover:border-white/45 text-white/75 hover:text-white"
                  }`}>
                  {FRAME_OF[k]?.l || k}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 📌 효과 — 서버(/api/shop/my-items)가 붙인 문장(effectLines: 아이템 자체 효과 + 지금 가진 역할의 역할 버프)을 한 줄씩.
             아이템 효과 줄은 관리자가 직접 쓴 문구(effectCustom)면 그 줄, 아니면 자동 문장(2026-10-18) — 화면은 받은 줄 그대로 그린다 */}
      {lines.length > 0 && (
        <div className={compact ? "mt-4" : "mt-5"}>
          <p className="text-[11px] font-bold text-white/45 mb-1.5">효과</p>
          <ul className="space-y-1">
            {lines.map((l, i) => (
              <li key={i} className="text-[12px] font-bold text-white/70 leading-relaxed break-keep break-words">{l}</li>
            ))}
          </ul>
        </div>
      )}

      {it.status === "missing" && (
        <p className="text-[10px] text-[#ff5c77]/80 mt-4 leading-relaxed break-keep">
          구매 기록은 있는데 디스코드 역할이 확인되지 않습니다. 운영진에 문의해 주세요.
        </p>
      )}
    </div>
  );
};

// 📌 인벤토리 미리보기 — 아이템 등록 칸에서 "가방에 이렇게 보인다" 를 입력과 함께 바로 보여 준다.
//    가방(BagOverlay)과 같은 잉크 판 · 같은 상세 · 같은 칸을 작게. 상태는 늘 "보유 중", 기간은 영구로 둔다.
//    📌 2026-10-17 분류 · 짧은 이름 — 넘겨준 값(categoryLabel · shortName)이 있으면 그대로, 없으면 입력값으로 정한다(lib/itemCategory.js —
//       직접 정한 분류(category) > 이름 머리말 > 자동(유형 · 효과 effects)). 가방 칸 · 상세와 같은 글자가 보이게
export function InventoryItemPreview({ item, effectLines }) {
  const it = {
    status: "completed", ...item,
    categoryLabel: item?.categoryLabel || resolveCategory(item || {}),
    shortName: item?.shortName || shortNameOf(item?.name),
    effectLines: Array.isArray(effectLines) ? effectLines : [],
  };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#131313] flex">
      {/* 번짐은 가방과 같이 이 아이템 색(2026-10-11 — 예전 붉은 번짐 대신) */}
      <div aria-hidden className="absolute -top-20 -right-12 w-52 h-52 blur-[80px] rounded-full pointer-events-none" style={{ background: invGlowOf(it), transition: "background-color .5s ease" }}></div>
      <div className="relative min-w-0 flex-1 px-4 py-4 border-r border-white/[0.08]">
        <InvDetail it={it} compact />
      </div>
      <div className="relative shrink-0 w-[104px] p-4">
        <InvSlot it={it} on />
      </div>
    </div>
  );
}

// 📌 배지 창 — 게임 장비창처럼 위에 단 배지 칸 3개(1 · 2 · 3번 자리 = 이름 옆 순서), 아래 상자에 가진 배지 전부.
//    가방(PopShell) 위에 겹쳐 뜬다(그 자리 팝업 — 화면 이동 없음). 모바일 바텀시트 · 데스크톱 가운데 모달, 닫기 · Esc · 바깥 누르면 닫힘.
//    조작: 늘 고른 칸이 하나 있다(처음 = 첫 빈 칸, 다 찼으면 1번). 칸을 누르면 그 칸을 고르고, 직접 고른 칸을 한 번 더 누르면 그 칸의 배지를 뺀다
//          (📌 저절로 골라진 칸 — 창을 열 때 · 넣은 뒤 — 은 처음 누르면 고르기만 한다(armed). 열자마자 1번 칸을 누르면 바로 빠지던 것 막음)
//          상자의 배지를 누르면 고른 칸에 넣는다(있던 건 빠짐 · 다른 칸에 있던 배지면 두 칸을 맞바꿈) → 고른 칸은 다음 빈 칸으로.
//          데스크톱은 끌어다 놓기도 — 상자 → 칸(넣기), 칸 → 칸(맞바꾸기), 칸 → 상자(빼기). 칸 계산은 lib/itemEffects(putBadgeAt …)
//          📌 칸은 늘 앞에서부터 찬다(칸 번호 = 이름 옆 순서) — 빼면 뒤 칸이 당겨지고, 빈 칸을 누르면 첫 빈 칸을 고른다(pickSlot)
//    저장: 바뀔 때마다 onSave(새 순서, 종류, 바꾸기 전 순서) — 저장하는 동안만 새 배치를 보이고(pending), 끝나면 badges 를 그대로 그린다
//          (실패면 저장 전 · 서버가 다시 준 목록으로). busy 동안은 바꾸지 않는다
//    items: 가진 배지 아이템(배지 id 마다 하나 — it.badgeId), badges: 지금 단 배지(순서 있음)
const BadgeWindow = ({ onClose, items, badges, busy = false, onSave, onTone }) => {
  const worn = Array.isArray(badges) ? badges : [];
  const wornIds = worn.map((b) => b.itemId);
  const [pending, setPending] = useState(null); // 저장 중인 배치
  const slots = pending ?? badgeSlotsOf(wornIds);
  const [selAt, setSel] = useState(() => firstEmptySlot(badgeSlotsOf(wornIds)));
  const sel = pickSlot(slots, selAt); // 밖에서 목록이 줄어 고른 칸이 비면 첫 빈 칸으로
  const [armed, setArmed] = useState(-1); // 유저가 직접 누른 칸 — 이 칸을 한 번 더 눌러야 뺀다
  const [over, setOver] = useState(-1); // 끌어다 놓는 중 위에 있는 칸
  // 칸 · 상자 그림 재료 — 가방 아이템 우선(가방과 같은 색 · 아이콘), 없으면 서버가 준 단 배지
  const info = new Map([...worn.map((b) => [b.itemId, b]), ...items.map((it) => [it.badgeId, it])]);
  const ownedIds = new Set(items.map((it) => it.badgeId));
  const short = (n) => invShortName({ name: n }); // 창 안 이름도 가방 칸과 같이 머리말("배지 · " …) 없이

  const closeRef = useRef(null);
  // 열리면 닫기 버튼에 포커스, 닫히면 연 버튼(배지 설정)으로 돌려준다
  useEffect(() => {
    const back = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (back && typeof back.focus === "function") back.focus({ preventScroll: true }); };
  }, []);
  // 📌 Esc 는 이 창만 닫는다 — 캡처 단계에서 먼저 받아 멈춰, 뒤 가방(PopShell)의 Esc 까지 가지 않게
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const commit = async (next, kind, nextSel) => {
    const prevSel = sel;
    setPending(next);
    setSel(nextSel);
    setArmed(-1);
    const ok = await onSave(badgeOrderOf(next), kind, badgeOrderOf(slots));
    setPending(null);
    if (!ok) setSel(prevSel);
  };
  const tapSlot = (i) => {
    const at = pickSlot(slots, i);
    if (at !== sel || armed !== at) { setSel(at); setArmed(at); onTone?.(); return; }
    if (!slots[at] || busy) return;
    const next = takeBadgeAt(slots, at);
    commit(next, "take", firstEmptySlot(next));
  };
  const tapBadge = (id) => {
    if (busy) return;
    const r = putBadgeAt(slots, sel, id);
    if (r.kind === "same") { onTone?.(); return; }
    commit(r.slots, r.kind, nextEmptySlot(r.slots, r.at));
  };
  // 끌어다 놓기 — 이 창 안에서 시작한 것만 받는다(dragRef: { id, from: "box" | "slot" }). 다른 곳에서 끌어온 글자는 무시
  const dragRef = useRef(null);
  const dragStart = (id, from) => (e) => {
    if (busy) { e.preventDefault(); return; }
    dragRef.current = { id, from };
    e.dataTransfer.setData("text/plain", ""); // 파이어폭스는 데이터가 있어야 끌기가 시작된다
    e.dataTransfer.effectAllowed = "move";
  };
  const dragEnd = () => { dragRef.current = null; setOver(-1); };
  const dropOnSlot = (i) => (e) => {
    e.preventDefault();
    const d = dragRef.current;
    dragEnd();
    if (!d || busy || !(ownedIds.has(d.id) || slots.includes(d.id))) return;
    const r = putBadgeAt(slots, i, d.id);
    if (r.kind === "same") { setSel(i); setArmed(i); return; }
    commit(r.slots, r.kind, r.at);
  };
  const dropOnBox = (e) => {
    e.preventDefault();
    const d = dragRef.current;
    dragEnd();
    const at = d?.from === "slot" ? slots.indexOf(d.id) : -1;
    if (at < 0 || busy) return;
    const next = takeBadgeAt(slots, at);
    commit(next, "take", firstEmptySlot(next));
  };

  const cells = Math.max(8, Math.ceil(items.length / 4) * 4); // 4열 — 빈 자리는 빈 홈 칸으로 채운다
  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="배지"
        aria-busy={busy || undefined}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[440px] max-h-[86dvh] sm:max-h-[88vh] overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] flex flex-col"
        style={{ background: "#131313", animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        {/* 📌 2026-10-11 가방과 같은 판 — 격자 + 번짐은 고른 칸의 배지 색(빈 칸이면 번짐 없음) · 칸은 「홈 칸」 */}
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div aria-hidden className="absolute -top-28 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none" style={{ background: invGlowOf(slots[sel] ? info.get(slots[sel]) : null), transition: "background-color .5s ease" }}></div>

        {/* 모바일 바텀시트 손잡이 */}
        <div aria-hidden className="sm:hidden relative z-10 flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-white/20"></span></div>

        {/* 머리 — 가방과 같은 문법(아이콘 · 제목 · 수 · 닫기) */}
        <div className="relative z-10 shrink-0 px-5 sm:px-7 pt-4 sm:pt-6 flex items-center justify-between gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <svg aria-hidden viewBox="0 0 24 24" className="w-[22px] h-[22px] shrink-0 text-white/55" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d={ICON_PATHS.shieldCheck} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-none truncate">배지</h3>
            <span className="shrink-0 text-sm font-black text-white/40 tabular-nums">{badgeOrderOf(slots).length}/{MAX_BADGES}</span>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 w-9 h-9 rounded-full border border-white/15 text-white/55 hover:text-white hover:border-white/35 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
          </button>
        </div>

        <div
          className="pop-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-7 pt-6"
          style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
        >
          {/* 단 배지 칸 — 1 · 2 · 3번(이름 옆 순서). 고른 칸은 흰 2px, 끌어다 놓는 중인 칸은 흐린 흰 테. 배지가 든 칸은 아래 유형색 띠 */}
          <div aria-label="배지 칸" className="flex justify-center gap-3 sm:gap-4">
            {slots.map((id, i) => {
              const b = id ? info.get(id) : null;
              const accent = b ? invAccentOf(b) : "";
              const on = sel === i;
              const shadow = slotShadow(on, !b, over === i && !on ? "0 0 0 2px rgba(255,255,255,0.45)" : "");
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${i + 1}번 칸${b ? ` · ${short(b.name)}` : ""}`}
                  title={b ? short(b.name) : undefined}
                  draggable={!!b && !busy}
                  onDragStart={b ? dragStart(id, "slot") : undefined}
                  onDragEnd={dragEnd}
                  onDragOver={(e) => { if (!dragRef.current) return; e.preventDefault(); if (over !== i) setOver(i); }}
                  onDragLeave={() => setOver((v) => (v === i ? -1 : v))}
                  onDrop={dropOnSlot(i)}
                  onClick={() => tapSlot(i)}
                  className={`relative shrink-0 w-[84px] h-[84px] sm:w-24 sm:h-24 flex items-center justify-center transition-[box-shadow] duration-150 ${SLOT_FOCUS}`}
                  style={{ background: SLOT_BG, boxShadow: shadow }}
                >
                  {b && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] pointer-events-none" style={{ background: accent }}></span>}
                  <span aria-hidden className={`absolute top-1.5 left-2 text-[10px] font-black tabular-nums leading-none pointer-events-none ${on ? "text-white" : "text-white/40"}`}>{i + 1}</span>
                  {b && <span aria-hidden className="pointer-events-none flex items-center justify-center"><InvIcon it={b} size={46} color={accent} /></span>}
                </button>
              );
            })}
          </div>

          {/* 상자 — 가진 배지 전부. 단 배지는 칸 번호 표식 + 살짝 어둡게 */}
          <div
            className="mt-6"
            onDragOver={(e) => { if (dragRef.current?.from === "slot") e.preventDefault(); }}
            onDrop={dropOnBox}
          >
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: cells }, (_, n) => {
                const it = items[n];
                if (!it) return <div key={`empty-${n}`} aria-hidden className="aspect-square" style={{ background: SLOT_BG, boxShadow: slotShadow(false, true) }}></div>;
                const accent = invAccentOf(it);
                const at = slots.indexOf(it.badgeId);
                return (
                  <button
                    key={it.badgeId}
                    type="button"
                    title={short(it.name)}
                    aria-label={at >= 0 ? `${short(it.name)} · ${at + 1}번 칸` : short(it.name)}
                    draggable={!busy}
                    onDragStart={dragStart(it.badgeId, "box")}
                    onDragEnd={dragEnd}
                    onClick={() => tapBadge(it.badgeId)}
                    className={`relative aspect-square min-w-0 flex flex-col items-center justify-center px-1 transition-[filter] hover:brightness-125 ${SLOT_FOCUS}`}
                    style={{ background: SLOT_BG, boxShadow: slotShadow(false) }}
                  >
                    <span aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] pointer-events-none ${at >= 0 ? "opacity-40" : ""}`} style={{ background: accent }}></span>
                    <span className={`w-full flex flex-col items-center pointer-events-none ${at >= 0 ? "opacity-40" : ""}`}>
                      <span aria-hidden className="mb-1.5 h-7 flex items-center justify-center">
                        <InvIcon it={it} size={28} color={accent} />
                      </span>
                      <span className="w-full text-[10px] font-black leading-tight text-center line-clamp-1 text-white/85">{short(it.name)}</span>
                    </span>
                    {at >= 0 && (
                      <span aria-hidden className="absolute top-1 right-1 w-[18px] h-[18px] rounded-full bg-white text-[#131313] text-[10px] font-black tabular-nums flex items-center justify-center pointer-events-none">
                        {at + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ══ 장착 판(2026-10-15 운영자 시안 equip2 — 「꾸미기」 탭 맨 위) ══
//    가운데 내 카드 작은 미리보기(카드 배경 · 카드 테두리 · 프로필 테두리를 한 벌로 — 글자 자리 없이), 왼쪽 칸 프로필 테두리 · 배지(n/3), 오른쪽 칸 카드 배경 · 카드 테두리.
//    칸에서 카드로 점선. 칸을 누르면 아래 목록이 그 종류로 걸러지고(고른 칸은 흰 테), 빈 칸은 점선 「+」. 착용 · 해제하면 칸 · 미리보기가 바로 바뀐다(가방이 든 값 그대로)
//    폰 — 판은 상세 위(가방 왼쪽 칸 자리), PC — 목록 칸 맨 위. 판 폭을 재서 자리를 정한다(처음 재기 전엔 높이만 잡아 둔다 — 아무것도 밀지 않게)
const CARD_W = 360, CARD_H = 556; // 미리보기 카드 판(봇 /레벨 카드 · 카드 배경 그림과 같은 크기) — 이 크기로 그려 줄인다

// 내 카드 작은 미리보기 — 360 × 556 판에 레벨 페이지 카드와 같은 부품(잉크 바탕 · 격자 · SkinFrame · 사진 + AvatarFrame)을 그리고 w 폭으로 줄인다.
//    SkinFrame 은 카드 테두리(skin)와 카드 배경(scene)을 받는다. 레벨 막대 자리(data-skin-bar)는 늘 두고, 기본 막대 모양은 배경이 없을 때만(막대 모양은 배경 몫)
//    카드 배경은 맨 아래 겹(SceneBack — lib/cardScenes), 막대 모양도 배경 몫(sceneBarOf — 유령 꼬리)
// 📌 info — 막대 진행(pct)만 쓴다. 카드에 글자는 넣지 않는다 — 프로필 · 레벨 바만(2026-10-17 운영자 "레벨도 빼 어수선하다 닉네임이랑"). bare — 막대 없이(목록 칸 그림)
function EquipCard({ w, skin, scene, frame, image, name, info = null, bare = false }) {
  const k = w / CARD_W;
  const sceneBar = sceneBarOf(scene);
  const pct = info ? Math.max(0, Math.min(100, Number(info.pct) || 0)) : 42;
  return (
    <div className="relative overflow-hidden" style={{ width: w, height: Math.round(CARD_H * k), borderRadius: 24 * k, boxShadow: "0 0 0 1px rgba(255,255,255,0.12), 0 18px 40px -18px rgba(0,0,0,0.85)" }}>
      <div className="absolute left-0 top-0 overflow-hidden" style={{ width: CARD_W, height: CARD_H, transform: `scale(${k})`, transformOrigin: "0 0", background: "linear-gradient(180deg, #1b1b1b 0%, #131313 55%)" }}>
        {sceneMetaOf(scene) ? <SceneBack scene={scene} /> : <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-70 pointer-events-none"></div>}
        {skin && <SkinFrame skin={skin} scene={scene} />}
        <div className="absolute flex items-center justify-center" style={{ left: 28, top: 28, width: 96, height: 96 }}>
          {!frame && <span aria-hidden className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 6px rgba(255,255,255,0.12)" }}></span>}
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 68, height: 68 }} />
          ) : (
            <span className="relative rounded-full bg-white/10 flex items-center justify-center text-2xl font-black text-white/60" style={{ width: 68, height: 68 }}>{(name || "?").slice(0, 1)}</span>
          )}
          <AvatarFrame frame={frame} px={68} />
        </div>
        {bare ? null : sceneBar === "ghostTrail" ? (
          <div data-skin-bar className="absolute" style={{ left: 40, right: 28, top: 333 }}><GhostTrailBar pct={pct} /></div>
        ) : (
          <div data-skin-bar className="absolute rounded-full overflow-hidden" style={{ left: 28, right: 28, top: 334, height: 10, background: "rgba(255,255,255,0.1)" }}>
            <div className="h-full rounded-full bg-[#e91e3f]" style={{ width: `${pct}%` }}></div>
          </div>
        )}
      </div>
    </div>
  );
}



// ───────────────────────── 꾸미기 A 「장비창」 ─────────────────────────
// 📌 2026-10-16 운영자 시안 A 선택("a가 낫다" — .claude/mockups/inventory/options/option-A.png, "인벤 크기 늘려도 돼"):
//    왼쪽 무대(내 카드 크게 · 양옆 장착 칸 넷 · 점선 · 받침 빛) + 아래 고른 아이템 상세, 오른쪽 종류 칩 + 실제 모습 칸.
//    폰은 무대 → 칩 → 칸, 고르면 상세가 아래에 붙는다. 무대 카드는 입은 것 그대로(고른 것을 입혀 보지 않는다 — 시안 A)

// 실제 모습 칸 그림 — 카드 배경 · 카드 테두리는 작은 카드, 프로필 테두리는 사진 둘레, 그 밖(배지 등)은 아이콘
function LookArt({ it, size, image, name }) {
  if (it.sceneKey) return <EquipCard w={Math.round(size * 0.6)} scene={it.sceneKey} image={image} name={name} bare />;
  const skin = it.skinKey || it.skinKeys?.[0];
  if (skin) return <EquipCard w={Math.round(size * 0.6)} skin={skin} image={image} name={name} bare />;
  const frame = it.frameKey || it.frameKeys?.[0];
  if (frame) {
    const px = Math.round(size * 0.44);
    return (
      <span className="relative flex items-center justify-center" style={{ width: px, height: px }}>
        <span className="absolute inset-0 rounded-full bg-white/10 flex items-center justify-center font-black text-white/50" style={{ fontSize: Math.round(px * 0.36) }}>{(name || "?").slice(0, 1)}</span>
        <AvatarFrame frame={frame} px={px} />
      </span>
    );
  }
  return <InvIcon it={it} size={Math.round(size * 0.5)} color={invAccentOf(it)} />;
}
// 목록 칸(A) — 홈 칸 · 실제 모습 · 이름 · 아래 띠, 착용은 꺾쇠 테, 고른 칸은 흰 테
// 📌 두 번 누르면 바로 착용 · 해제(2026-10-17 운영자 "꾸미기 더블 클릭하면 좀 착용하게 해주고") — 두 번째 누름(detail 2)은 고르기를 풀지 않게 건너뛴다
// 📌 2026-10-17 희귀도 장식 · 즐겨찾기 별은 가방 칸(InvSlot)과 같다(RarityDeco). 이름은 반짝이 위에 오게 relative
function LookTileA({ it, on, worn, onClick, onWear, image, name, fav = false }) {
  const accent = invAccentOf(it);
  const rar = rarOf(it);
  return (
    <button type="button" data-look-uid={it.uid} onClick={(e) => { if (e.detail > 1) return; onClick(); }} onDoubleClick={onWear} title={it.name} aria-pressed={on}
      className={`relative flex flex-col items-center pt-2 pb-2.5 px-1.5 aspect-[5/6] transition-[filter] ${SLOT_FOCUS} ${on ? "" : "hover:brightness-125"}`}
      style={rarityTileStyle(rar, on)}>
      <RarityDeco r={rar} on={on} fav={fav} stripe={accent} />
      {worn && <WornMark accent={accent} />}
      <span aria-hidden className="flex-1 min-h-0 w-full flex items-center justify-center pointer-events-none"><LookArt it={it} size={84} image={image} name={name} /></span>
      <span className="relative mt-0.5 w-full text-[10px] font-black leading-tight text-center text-white/85 line-clamp-1 break-keep">{invShortName(it)}</span>
    </button>
  );
}
// 장착 칸(A) — 칸 + 종류 · 이름
function SlotA({ slot, sel, onClick, S, labelW }) {
  const { kind, name, empty, accent, art } = slot;
  return (
    <div className="flex flex-col items-center" style={{ width: labelW }}>
      <button type="button" aria-pressed={sel} aria-label={`${kind} · ${empty ? "비어 있음" : name}`} title={empty ? kind : name} onClick={onClick}
        className={`relative shrink-0 flex items-center justify-center transition-[filter] ${SLOT_FOCUS} ${sel ? "" : "hover:brightness-125"}`}
        style={{ width: S, height: S, background: SLOT_BG, ...(empty && !sel ? { border: "1.5px dashed rgba(255,255,255,0.2)" } : { boxShadow: slotShadow(sel, empty) }) }}>
        {!empty && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] pointer-events-none" style={{ background: accent }}></span>}
        {!empty && <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(closest-side, ${accent}2e, transparent)` }}></span>}
        {empty ? <span aria-hidden className="text-[20px] font-black leading-none text-white/30">+</span> : <span aria-hidden className="relative pointer-events-none flex items-center justify-center">{art(S)}</span>}
      </button>
      <span className="block mt-1.5 max-w-full truncate text-[11px] font-bold leading-none text-white/45">{kind}</span>
      <span className={`block mt-1 max-w-full truncate text-[12px] font-black leading-tight ${empty ? "text-white/30" : "text-white/92"}`}>{empty ? "—" : name}</span>
    </div>
  );
}
// 고른 아이템 상세(A · 가로 한 줄) — 무대 아래에서 착용 단추까지 한눈에(2026-10-16 — 긴 상세는 단추가 창 아래로 밀렸다).
//    글씨 · 색 · 단추는 다른 탭 상세(InvDetail)와 같다: 아이콘 홈 칸 · 종류(아이템 색) · 이름 · 상태(보유 중 초록) · 기간 · 흰 알약 단추
//    📌 2026-10-17 종류 글자(회색) · 아이콘 칸 띠 · 빛은 희귀도 색 · 착용 단추 옆 즐겨찾기 별(fav — null 이면 없음). 2026-10-18 등급 알약은 뺐다(아래)
function DetailRow({ it, worn, busy, onWear, onBadge, fav = null, onFav }) {
  const accent = invAccentOf(it);
  const rar = rarOf(it);
  const dday = ddayOf(it);
  // 종류 글자 — 서버가 정한 분류(categoryLabel), 없는 칸(옛 응답)만 꾸미기 키 → 유형 이름
  const kind = it.categoryLabel || (it.sceneKey ? "카드 배경" : it.skinKey ? "카드 테두리" : it.frameKey ? "프로필 테두리" : it.badgeId ? "프로필 배지" : itemTypeLabel(it.type || it.kind));
  const from = { shop: "상점", pass: "시즌 패스", event: "이벤트 패스", grant: "지급", season: "시즌 보상", trial: "체험" }[it.source] || "";
  const sub = [from, it.expiresAt ? (dday !== null ? `D-${dday}` : "기간제") : "영구"].filter(Boolean).join(" · ");
  // 📌 아래 줄 — 꾸미기는 「적용 범위」 아래 줄에 「대시보드 / …」(2026-10-18 운영자 — 예전「효과  프로필 배지」), 그 밖은 첫 효과 줄
  const scope = invScopeOf(it);
  const fx = scope ? "" : invEffectLinesOf(it)[0] || "";
  const line = fx ? `효과  ${fx}` : "";
  const btn = (on) => `shrink-0 h-10 px-7 rounded-full text-[12px] font-black transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${on ? "border border-white/25 hover:border-white/45 text-white/85 hover:text-white" : "bg-white text-[#131313] hover:bg-white/90"}`;
  return (
    // 📌 2026-10-18 운영자 "카드 디자인 하지 말라고 · 기껏 없앴는데 왜 자꾸 만드냐고" — 상세 줄은 상자(테 · 바탕 · 둥근 모서리) 없이 창 바탕 위에 바로. 다시 감싸지 말 것
    // 📌 2026-10-18 운영자 "카드 상자를 뺐으면 그만큼 넓어졌지? 그에 맞는 UI로" — 상자 안쪽 여백(좌우 16)만큼 넓어진 줄을 가로 칸으로 나눠 쓴다:
    //    [아이콘 80] [종류 · 이름 · 출처] [적용 범위(꾸미기) · 효과(그 밖) — 이름 칸 옆 따로 한 칸] … [즐겨찾기 · 착용]. 세로로 쌓던 적용 범위가 옆으로 가 줄이 낮아지고
    //    가운데 빈자리가 없어진다. 좁은 PC 폭(640~760)에서는 넘치는 칸부터 다음 줄로 접힌다(단추는 늘 오른쪽)
    <div className="py-1">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="relative shrink-0 w-20 h-20 flex items-center justify-center" style={{ background: rarityTileStyle(rar, false).background, boxShadow: slotShadow(false) }}>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: stripeOf(rar, accent) }}></span>
          <InvIcon it={it} size={42} color={accent} />
        </span>
        {/* 📌 2026-10-18 운영자 "알약 디자인 집어 치우라고" — 꾸미기 상세 줄은 알약 없이 종류 글자(회색)만. 희귀도는 아이콘 칸 아래 띠 · 빛(폰 상세 줄 DetailMini 와 같다) */}
        <div className="min-w-[120px] flex-1">
          <p className="text-[11px] font-bold leading-none text-white/45 truncate">{kind}</p>
          <p className="mt-2 text-[18px] font-black text-white leading-tight truncate">{invShortName(it)}</p>
          <p className="mt-2 text-[11px] font-bold leading-none text-white/45">{sub}</p>
        </div>
        {(scope || fx) && (
          <div className="min-w-[150px] max-w-[260px] shrink">
            <p className="text-[11px] font-bold leading-none text-white/45">{scope ? "적용 범위" : "효과"}</p>
            <p className="mt-2 text-[13px] font-bold leading-snug text-white/80 break-keep">{scope || fx}</p>
          </div>
        )}
        <div className="ml-auto shrink-0 flex items-center gap-2">
          {fav != null && <FavButton on={fav} onToggle={onFav} size="w-10 h-10" />}
          {it.badgeId ? (
            <button type="button" onClick={onBadge} className={btn(false)}>배지 설정</button>
          ) : (
            <button type="button" disabled={busy} onClick={onWear} className={btn(worn)}>{worn ? "착용 해제" : "착용"}</button>
          )}
        </div>
      </div>
    </div>
  );
}
// 폰 무대(A) — 카드(글자 없이 꾸미기 모습만) + 아래 한 줄 칸 넷(종류 이름만). 2026-10-16 "폰쪽은 너무 답답해 · 너무 세부적인 걸 다 들어가게 하지마"
function StageMini({ slots, slotOn, onSlot, card, info, glow, image, name, onClearAll, clearOff, label = "장착 중" }) {
  const order = ["scene", "skin", "frame", "badge"];
  const short = { scene: "카드 배경", skin: "카드 테두리", frame: "프로필 테두리", badge: "배지" };
  return (
    <div className="relative shrink-0 rounded-[14px] border border-white/[0.06] bg-black/30 overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(60% 46% at 50% 36%, ${glow}, transparent 72%)` }}></div>
      <div className="relative flex items-center justify-between px-4 pt-3.5">
        <span className="text-[11px] font-black text-white/50">{label}</span>
        <button type="button" disabled={clearOff} onClick={onClearAll}
          className="shrink-0 h-7 px-3.5 rounded-full border border-white/15 text-[11px] font-black leading-[26px] text-white/70 hover:text-white hover:border-white/35 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35 disabled:pointer-events-none">
          모두 해제
        </button>
      </div>
      <div className="relative flex justify-center pt-3 pb-5">
        <span aria-hidden className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[62%] h-5 rounded-[50%] pointer-events-none" style={{ background: `radial-gradient(closest-side, ${glow}, transparent)` }}></span>
        <div style={{ filter: "drop-shadow(0 12px 18px rgba(0,0,0,0.55))" }}><EquipCard w={170} {...card} info={info} image={image} name={name} /></div>
      </div>
      <div className="relative grid grid-cols-4 gap-2 px-3 pb-4">
        {order.map((id) => {
          const sl = slots[id];
          const sel = slotOn === id;
          return (
            <button key={id} type="button" aria-pressed={sel} aria-label={`${sl.kind} · ${sl.empty ? "비어 있음" : sl.name}`} onClick={() => onSlot(id)} className={`min-w-0 flex flex-col items-center ${SLOT_FOCUS}`}>
              <span className="relative w-14 h-14 flex items-center justify-center" style={{ background: SLOT_BG, ...(sl.empty && !sel ? { border: "1.5px dashed rgba(255,255,255,0.2)" } : { boxShadow: slotShadow(sel, sl.empty) }) }}>
                {!sl.empty && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: sl.accent }}></span>}
                {sl.empty ? <span aria-hidden className="text-[18px] font-black leading-none text-white/30">+</span> : <span aria-hidden className="pointer-events-none flex items-center justify-center">{sl.art(56)}</span>}
              </span>
              <span className={`block mt-1.5 max-w-full truncate text-[10px] font-bold leading-none ${sel ? "text-white" : "text-white/45"}`}>{short[id]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
// 폰 상세(A) — 아래에 붙는 얇은 줄: 아이콘 · 이름 · 단추만
//    📌 2026-10-17 알약 없이(최소) — 아이콘 칸 띠만 희귀도 색, 단추 앞에 작은 즐겨찾기 별(fav — null 이면 없음)
function DetailMini({ it, worn, busy, onWear, onBadge, fav = null, onFav }) {
  const accent = invAccentOf(it);
  const rar = rarOf(it);
  const btn = (on) => `shrink-0 h-9 px-5 rounded-full text-[12px] font-black transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${on ? "border border-white/25 text-white/85" : "bg-white text-[#131313]"}`;
  return (
    <div className="flex items-center gap-3">
      <span className="relative shrink-0 w-11 h-11 flex items-center justify-center" style={{ background: SLOT_BG, boxShadow: slotShadow(false) }}>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: stripeOf(rar, accent) }}></span>
        <InvIcon it={it} size={24} color={accent} />
      </span>
      <p className="min-w-0 flex-1 text-[14px] font-black text-white truncate">{invShortName(it)}</p>
      {fav != null && <FavButton on={fav} onToggle={onFav} />}
      {it.badgeId ? <button type="button" onClick={onBadge} className={btn(false)}>배지 설정</button> : <button type="button" disabled={busy} onClick={onWear} className={btn(worn)}>{worn ? "착용 해제" : "착용"}</button>}
    </div>
  );
}
// 무대(A) — 내 카드 · 양옆 칸 넷 · 점선 · 받침 빛. 폭을 재서 카드 · 칸 자리를 정한다
function StageA({ slots, slotOn, onSlot, card, info, glow, image, name, onClearAll, clearOff, label = "장착 중" }) {
  const boxRef = useRef(null);
  const [W, setW] = useState(0);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const fit = () => setW(Math.round(el.clientWidth));
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  const big = W >= 520;
  const cw = big ? 220 : Math.min(150, Math.max(120, W - 2 * 92)), ch = Math.round((cw * CARD_H) / CARD_W);
  const S = big ? 80 : 60, labelW = big ? 132 : 86;
  const gap = Math.max(4, Math.min(big ? 64 : 22, Math.floor((W - cw - 2 * labelW) / 2) - 4));
  const cardX = Math.round((W - cw) / 2), cardY = 4;
  const colL = cardX - gap - labelW, colR = cardX + cw + gap;
  const rowY = [Math.round(cardY + ch * 0.1), Math.round(cardY + ch * 0.56)];
  const H = ch + 26;
  const layout = [
    { id: "frame", side: -1, row: 0, ty: 0.14 },
    { id: "badge", side: -1, row: 1, ty: 0.48 },
    { id: "scene", side: 1, row: 0, ty: 0.3 },
    { id: "skin", side: 1, row: 1, ty: 0.72 },
  ];
  return (
    <div className="relative shrink-0 rounded-[14px] border border-white/[0.06] bg-black/30 overflow-hidden">
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(60% 52% at 50% 40%, ${glow}, transparent 72%)`, transition: "background .5s ease" }}></div>
      <div className="relative flex items-center justify-between px-4 sm:px-5 pt-3.5 sm:pt-4">
        <span className="text-[11px] font-black text-white/50">{label}</span>
        <button type="button" disabled={clearOff} onClick={onClearAll}
          className="shrink-0 h-7 px-3.5 rounded-full border border-white/15 text-[11px] font-black leading-[26px] text-white/70 hover:text-white hover:border-white/35 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-35 disabled:pointer-events-none">
          모두 해제
        </button>
      </div>
      <div ref={boxRef} className="relative mx-3 sm:mx-5 mt-2 mb-4" style={{ height: W ? H : Math.round((220 * CARD_H) / CARD_W) + 26 }}>
        {W > 0 && (
          <>
            <span aria-hidden className="absolute rounded-[50%] pointer-events-none" style={{ left: cardX - cw * 0.3, top: cardY + ch - 6, width: cw * 1.6, height: 22, background: `radial-gradient(closest-side, ${glow}, transparent)` }}></span>
            <svg aria-hidden width={W} height={H} className="absolute inset-0 pointer-events-none">
              {layout.map((l) => {
                const s = slots[l.id];
                const sx = l.side < 0 ? colL + labelW / 2 + S / 2 : colR + labelW / 2 - S / 2;
                const sy = rowY[l.row] + S / 2;
                const ex = l.side < 0 ? cardX : cardX + cw;
                const ey = cardY + Math.round(l.ty * ch);
                const mx = Math.round((sx + ex) / 2);
                const c = s.empty ? "rgba(255,255,255,0.18)" : s.accent;
                return (
                  <g key={l.id}>
                    <path d={`M${sx} ${sy}H${mx}V${ey}H${ex}`} fill="none" stroke={c} strokeOpacity={s.empty ? 1 : 0.45} strokeWidth="1.2" strokeDasharray="3 3" />
                    <circle cx={ex} cy={ey} r="2.5" fill={c} fillOpacity={s.empty ? 1 : 0.85} />
                  </g>
                );
              })}
            </svg>
            <div className="absolute" style={{ left: cardX, top: cardY, filter: "drop-shadow(0 14px 22px rgba(0,0,0,0.6))" }}>
              <EquipCard w={cw} {...card} image={image} name={name} info={info} />
            </div>
            {layout.map((l) => (
              <div key={l.id} className="absolute" style={{ left: l.side < 0 ? colL : colR, top: rowY[l.row] }}>
                <SlotA slot={slots[l.id]} sel={slotOn === l.id} onClick={() => onSlot(l.id)} S={S} labelW={labelW} />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}



// 📌 가방 — 인벤토리를 대시보드에 펼치지 않고 오버레이로 연다.
//    껍데기는 TierModal 과 같은 문법(모바일 바텀시트 / 데스크톱 모달, 잉크 패널).
//    스크롤 잠금은 손대지 않는다 — 루트 className 에 "fixed inset-0" 이 붙어 있고
//    z-index 가 50 이상이면 ScrollLock 이 알아서 건다(iOS 대응 포함).
// 📌 cardSkin: 서버(my-items)가 준 지금 쓰는 스킨 키("" 이면 기본 카드). 착용 · 해제는 가방이 직접 저장하고(POST /api/xp/card-skin)
//    결과를 바로 보여 준다 — 다음 폴링으로 같은 값이 오면 그대로. onSkinChange(키) 가 있으면 부모에도 알린다(프로필 카드 장식)
// 📌 badges: 서버(my-items)가 준 지금 단 배지 목록(순서 = 이름 옆 자리). 배지 창(BadgeWindow)에서 바꿀 때마다 POST /api/xp/badge { order } 로 저장하고
//    onBadgesChange(목록) 로 부모에 알린다(스킨과 같은 흐름)
// 📌 avatarFrame: 서버(my-items)가 준 지금 쓰는 테두리 키("" 이면 없음). POST /api/xp/avatar-frame 로 저장하고 onFrameChange(키) 로 부모에 알린다(스킨과 같은 흐름)
// 📌 cardScene: 서버(my-items)가 준 지금 쓰는 카드 배경 키("" 이면 없음). POST /api/xp/card-scene 로 저장하고 onSceneChange(키) 로 부모에 알린다(카드 테두리와 같은 흐름 · 따로 고르고 함께 입는다)
// 📌 관리자 체험(2026-10-15 운영자 "관리자만 인벤토리에서 아무 아이템 꺼내서 써볼 수 있게 · 테스트 서버에서만") —
//    테스트 사이트(localhost)에서 관리자에게만 「체험」 탭: 모든 카드 배경 · 카드 테두리 · 프로필 테두리를 가진 것처럼 끼워 본다.
//    안 가진 것을 끼우면 서버에 저장하지 않고 이 브라우저(localStorage)에만 — 실서버 DB · 봇 카드엔 안 간다. 가진 것을 끼우거나 해제하면 체험 값을 지우고 원래대로 저장
//    📌 2026-10-17 체험 탭 · 체험 값 덧씌우기는 관리자로 보는 중(useAdminView().admin)일 때만 — 「유저 화면으로 보기」나 같은 브라우저의 다른 계정엔 서버 값 그대로
const TRIAL_KEY = "inv-trial-v1";
const isTestHost = () => typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
export const readTrial = () => {
  if (!isTestHost()) return {};
  try { const t = JSON.parse(localStorage.getItem(TRIAL_KEY) || "{}"); return t && typeof t === "object" ? t : {}; } catch { return {}; }
};
const writeTrial = (patch) => {
  try {
    const t = { ...readTrial(), ...patch };
    for (const k of Object.keys(t)) if (!t[k]) delete t[k];
    localStorage.setItem(TRIAL_KEY, JSON.stringify(t));
  } catch {}
};
// 조회 결과(me · my-items)에 체험 값을 얹는다 — 레벨 페이지 keepSaved 가 부른다(체험 값이 없거나 on 이 아니면 그대로 · on = 관리자로 보는 중)
export const applyTrial = (data, on) => {
  if (!data || !on) return data;
  const t = readTrial();
  if (!t.skin && !t.scene && !t.frame) return data;
  return { ...data, ...(t.skin ? { cardSkin: t.skin } : {}), ...(t.scene ? { cardScene: t.scene } : {}), ...(t.frame ? { avatarFrame: t.frame } : {}) };
};
// 체험 칸 — 가진 것은 빼고 모든 키를 아이템 모양으로(가방 칸 · 상세가 그대로 그린다)
function trialItemsOf(owned) {
  const has = { skin: new Set(), scene: new Set(), frame: new Set() };
  for (const it of owned) {
    if (it.skinKey) has.skin.add(it.skinKey);
    (it.skinKeys || []).forEach((k) => has.skin.add(k));
    if (it.sceneKey) has.scene.add(it.sceneKey);
    if (it.frameKey) has.frame.add(it.frameKey);
    (it.frameKeys || []).forEach((k) => has.frame.add(k));
  }
  const mk = (kind, key, head, label, art, color) => ({
    uid: `trial:${kind}:${key}`, kind: "cosmetic", type: "cosmetic", name: `${head} · ${label}`, categoryLabel: head, shortName: label, description: "", icon: `art:${art}`, imageUrl: "", color,
    status: "completed", days: 0, expiresAt: null, provisional: false, acquiredAt: null, renewId: "", siteOnly: false, source: "trial", rewardLevel: null,
    // 📌 꾸미기 — 효과 줄 없이 적용 범위(그 종류의 자동 값 — 가방 칸과 같은 칸 이름)
    trial: true, effectLines: [], effectCustom: false, isCosmetic: true,
    scopeLabel: scopeLabelOfKind(kind === "scene" ? "cardScene" : kind === "skin" ? "cardSkin" : "avatarFrame"), orderRef: "",
    ...(kind === "scene" ? { sceneKey: key } : kind === "skin" ? { skinKey: key } : { frameKey: key }),
  });
  return [
    ...Object.keys(SCENE_OF).filter((k) => !has.scene.has(k)).map((k) => mk("scene", k, "카드 배경", SCENE_OF[k].l, artOfScene(k), "#45b4ff")),
    ...Object.keys(SKIN_OF).filter((k) => k !== SKIN_RANK_ALL && !has.skin.has(k)).map((k) => mk("skin", k, "카드 테두리", SKIN_OF[k].l, artOfSkin(k), "#8a6bff")),
    ...Object.keys(FRAME_OF).filter((k) => k !== FRAME_ALL && !has.frame.has(k)).map((k) => mk("frame", k, "프로필 테두리", FRAME_OF[k].l, artOfFrame(k), "#ff8a24")),
  ];
}

// ══ 빈 칸 채우기(2026-10-18 운영자 — 마지막 줄을 다 채우고, 목록 칸이 바닥까지 빈 칸으로 차게. 모든 탭 · 거르기(즐겨찾기 · 종류)를 켠 때도 · PC · 폰) ══
//    격자 위쪽에서 스크롤 칸(PC 목록 칸 · 폰 본문) 바닥까지 — 아래 여백 · 격자 뒤에 붙는 것(폰 꾸미기 아래 상세 줄 등)을 빼고 — 온전히 들어가는 줄 수를 잰다.
//    바닥에 걸친 줄은 만들지 않는다(빈 칸 때문에 생기는 스크롤 없음 · 마지막 줄은 늘 온전)
const pxOf = (v) => parseFloat(v) || 0;
const scrollBoxOf = (el) => {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
};
// 격자 아래로 스크롤 칸 바닥까지 붙는 높이 — 위로 올라가며 뒤 형제(겹쳐 뜨는 것 · 숨은 것 빼고) · 아래 여백 · 테를 더한다. 가로 줄(flex 가로)의 형제는 옆이라 안 센다.
//    k — 화면에 그려진 크기 ÷ 배치 크기(창이 뜨는 동안 tierIn 이 0.985 배로 줄여 그린다 — getBoundingClientRect 는 줄인 값)
const belowOf = (el, box, k = 1) => {
  let h = 0;
  for (let cur = el; cur && cur !== box; cur = cur.parentElement) {
    const p = cur.parentElement;
    if (!p) break;
    const ps = getComputedStyle(p);
    if (!(ps.display.includes("flex") && !ps.flexDirection.startsWith("column"))) {
      h += pxOf(getComputedStyle(cur).marginBottom);
      for (let s = cur.nextElementSibling; s; s = s.nextElementSibling) {
        const ss = getComputedStyle(s);
        if (ss.display === "none" || ss.position === "absolute" || ss.position === "fixed") continue;
        h += s.getBoundingClientRect().height / k + pxOf(ss.marginTop) + pxOf(ss.marginBottom);
      }
    }
    h += pxOf(ps.paddingBottom) + pxOf(ps.borderBottomWidth);
  }
  return h;
};
// 잰 값 { key, cols: 지금 칸 수(화면 폭마다 다르다), rows: 바닥까지 온전히 들어가는 줄 수 }. key — 잰 격자 모양(칸 수가 다른 격자의 값을 쓰지 않게),
//    sig — 다시 잴 때(탭 · 거르기 · 고른 칸 · 폰 상세 높이 …). 크기가 바뀌면(창 · 돌리기 · 격자) 저절로 다시 잰다
function useFitRows(ref, key, sig) {
  const [fit, setFit] = useState(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    const box = scrollBoxOf(g);
    // 📌 줄 높이는 칸마다 다를 수 있다(그림 · 이름이 칸 비율보다 길면 그 줄이 늘어난다) — 아이템 칸 줄은 실제 바닥(가장 낮은 칸)까지 재고,
    //    그 아래 빈 칸 줄만 칸 폭 × 비율(data-ar — 가방 칸 1 · 그림 칸 6/5)로 센다. 빈 칸은 data-empty
    //    📌 창이 뜨는 동안(tierIn — 0.985 배)에 재므로 그려진 크기를 배치 크기로 되돌려(÷ k) 센다 — 아니면 칸이 작게 재져 한 줄 넘치게 채웠다
    const measure = () => {
      const cs = getComputedStyle(g);
      const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
      const gap = pxOf(cs.rowGap);
      const kids = [...g.children];
      let rows = 0;
      if (box && kids[0] && box.offsetHeight > 0) {
        const bb = box.getBoundingClientRect();
        const k = bb.height / box.offsetHeight || 1;
        const colW = kids[0].getBoundingClientRect().width / k;
        const gTop = g.getBoundingClientRect().top;
        const top = (gTop - bb.top) / k - box.clientTop + box.scrollTop;
        const full = kids.filter((c) => !c.hasAttribute("data-empty"));
        let used = 0;
        for (const c of full) used = Math.max(used, (c.getBoundingClientRect().bottom - gTop) / k);
        const emptyH = colW * (parseFloat(g.dataset.ar) || 1);
        const room = box.clientHeight - top - belowOf(g, box, k) - used + (full.length ? 0 : gap);
        // 바닥에 0.25px 은 남긴다 — 소수 높이가 반올림돼 1px 스크롤이 생기지 않게
        rows = Math.ceil(full.length / cols) + Math.max(0, Math.floor((room - 0.25) / (emptyH + gap)));
      }
      setFit((f) => (f && f.key === key && f.cols === cols && f.rows === rows ? f : { key, cols, rows }));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(g);
    if (box) ro?.observe(box);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [ref, key, sig]);
  return fit && fit.key === key ? fit : null;
}
// 칸 수 — 잰 값(fit)이 있으면 지금 칸 수로 마지막 줄 · 바닥까지, 재기 전 · 잴 격자가 아니면(fit null — 즐겨찾기 탭 위쪽 묶음) 마지막 줄만:
//    폰 m칸 · PC p칸 줄 중 큰 수만큼 그리고 그 폭의 줄 밖 빈 칸은 숨긴다(cls)
const fillOf = (n, m, p, fit) => {
  if (fit?.cols) return { total: Math.max(1, Math.ceil(n / fit.cols), fit.rows) * fit.cols, cls: () => "" };
  const rm = Math.max(1, Math.ceil(n / m)) * m, rp = Math.max(1, Math.ceil(n / p)) * p;
  return { total: Math.max(rm, rp), cls: (i) => `${i < rm ? "block" : "hidden"} ${i < rp ? "sm:block" : "sm:hidden"}` };
};
export const BagOverlay = ({ cardInfo = null, open, onClose, groups: groupsIn, tab, onTab, synced, onTone, loading = false, error = "", cardSkin = "", onSkinChange, cardScene = "", onSceneChange, badges, onBadgesChange, avatarFrame = "", onFrameChange }) => {
  const { data: trialSession } = useSession();
  const { admin } = useAdminView();
  const trialOn = isTestHost() && admin;
  const ownedKeys = useMemo(() => {
    const o = { skin: new Set(), scene: new Set(), frame: new Set() };
    for (const it of groupsIn[0]?.items || []) {
      if (it.skinKey) o.skin.add(it.skinKey);
      (it.skinKeys || []).forEach((k) => o.skin.add(k));
      if (it.sceneKey) o.scene.add(it.sceneKey);
      if (it.frameKey) o.frame.add(it.frameKey);
      (it.frameKeys || []).forEach((k) => o.frame.add(k));
    }
    return o;
  }, [groupsIn]);
  // 📌 즐겨찾기(2026-10-17) — 계정마다 서버에(GET · POST /api/shop/inv-favorites, 인벤토리 uid 목록). 열 때마다 한 번 읽고, 못 읽으면 즐겨찾기 없음으로.
  //    넣고 빼기는 바로 보이고(낙관) 저장이 실패하면 되돌린다. favSeq — 넣고 빼는 사이 늦게 온 조회가 방금 바꾼 것을 덮지 않게
  const signedIn = !!trialSession?.user;
  const [favs, setFavs] = useState(() => new Set());
  const [favReady, setFavReady] = useState(false); // 첫 조회가 끝났는지 — 그전엔 별 단추를 숨긴다
  // 「즐겨찾기」 거르기 중 방금 뺀 것 — 탭을 바꾸거나 거르기를 끄거나 닫을 때까지 목록에 남겨(빈 별) 선택이 다른 칸으로 넘어가지 않게(실수로 또 누르면 다른 것까지 빠졌다)
  const [favKeep, setFavKeep] = useState(() => new Set());
  // 📌 2026-10-18 「즐겨찾기」 거르기 칩 — 탭마다(전체 · 아이템 · 꾸미기 · 그 밖 탭) 즐겨찾기한 것만. 탭을 바꿔도 켠 그대로, 가방을 닫으면 끈다(다시 열면 전부 보이게)
  const [favOnly, setFavOnly] = useState(false);
  if (!open && favOnly) setFavOnly(false);
  const favSeq = useRef(0);
  const favBusy = useRef(new Set()); // 저장 중인 uid — 같은 칸을 겹쳐 누르면 무시
  useEffect(() => {
    if (!open || !signedIn) return;
    let alive = true;
    const seq = favSeq.current;
    fetch("/api/shop/inv-favorites", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive && seq === favSeq.current && d?.success && Array.isArray(d.data?.uids)) setFavs(new Set(d.data.uids));
      })
      .catch(() => {})
      .finally(() => { if (alive) { setFavKeep(new Set()); setFavReady(true); } });
    // 닫으면 다음에 열 때 다시 읽을 때까지 단추를 숨긴다
    return () => { alive = false; setFavReady(false); };
  }, [open, signedIn]);
  // 📌 탭 — 받은 그대로(+ 관리자 체험). 즐겨찾기 탭은 2026-10-18 걷었다 — 꾸미기가 아이템 칸 크기로 섞이고 전용 화면(꾸미기 탭)을 못 썼다. 거르기 칩이 대신
  const groups = useMemo(() => {
    const all = groupsIn[0];
    if (!trialOn) return groupsIn;
    const items = trialItemsOf(all?.items || []);
    return items.length ? [...groupsIn, { id: "trial", label: "체험", items }] : groupsIn;
  }, [groupsIn, trialOn]);
  const [sel, setSel] = useState(null); // 선택한 아이템 uid
  const [skinNow, setSkinNow] = useState(null); // 방금 저장한 값(서버 값이 오기 전까지)
  const [skinBusy, setSkinBusy] = useState(false);
  const [sceneNow, setSceneNow] = useState(null); // 방금 저장한 카드 배경(서버 값이 오기 전까지)
  const [sceneBusy, setSceneBusy] = useState(false);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false); // 배지 창
  // 가방이 닫히면 배지 창도 닫는다(다시 열 때 겹쳐 뜨지 않게)
  if (!open && badgeOpen) setBadgeOpen(false);
  const [frameNow, setFrameNow] = useState(null); // 방금 저장한 테두리(서버 값이 오기 전까지)
  const [frameBusy, setFrameBusy] = useState(false);
  const [clearBusy, setClearBusy] = useState(false); // 장착 판 「모두 해제」
  const [toast, setToast] = useState("");
  useEffect(() => { setSkinNow(null); }, [cardSkin]);
  const curSkin = skinNow ?? cardSkin;
  // 서버 값이 바뀌면 방금 저장한 값을 버린다 — 효과 대신 그리는 자리에서(한 번 더 그리지 않게)
  const [sceneBase, setSceneBase] = useState(cardScene);
  if (sceneBase !== cardScene) { setSceneBase(cardScene); setSceneNow(null); }
  const curScene = sceneNow ?? cardScene;
  useEffect(() => { setFrameNow(null); }, [avatarFrame]);
  const curFrame = frameNow ?? avatarFrame;
  // 📌 단 배지는 부모 값 그대로 — 저장 결과는 onBadgesChange 로 부모가 바로 반영한다(옛 조회가 덮지 않게 막는 건 keepSavedBadges)
  const wornIds = (Array.isArray(badges) ? badges : []).map((b) => b.itemId);
  // 배지 창 상자 — 가진 배지 아이템(같은 배지 id 는 한 번, 가방 순서)
  const badgeItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const g of groups) for (const it of g.items) if (it.badgeId && !seen.has(it.badgeId)) { seen.add(it.badgeId); out.push(it); }
    return out;
  }, [groups]);
  const say = (msg) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), 1800);
  };
  // 📌 저장만(알림 없이) — 착용 단추와 장착 판 「모두 해제」가 같이 쓴다. 성공하면 { ok: true }, 아니면 { ok: false, error }
  const postJson = (url, body) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
  const postSkin = async (skin) => {
    if (trialOn && skin !== SKIN_NONE && !ownedKeys.skin.has(skin)) { writeTrial({ skin }); setSkinNow(skin); onSkinChange?.(skin); return { ok: true }; }
    if (trialOn) writeTrial({ skin: "" });
    const res = await postJson("/api/xp/card-skin", { skin });
    if (!res?.success) return { ok: false, error: res?.error };
    const next = res.data?.cardSkin || "";
    setSkinNow(next);
    onSkinChange?.(next);
    return { ok: true };
  };
  const postScene = async (scene) => {
    if (trialOn && scene !== SKIN_NONE && !ownedKeys.scene.has(scene)) { writeTrial({ scene }); setSceneNow(scene); onSceneChange?.(scene); return { ok: true }; }
    if (trialOn) writeTrial({ scene: "" });
    const res = await postJson("/api/xp/card-scene", { scene });
    if (!res?.success) return { ok: false, error: res?.error };
    const next = res.data?.cardScene || "";
    setSceneNow(next);
    onSceneChange?.(next);
    return { ok: true };
  };
  const postFrame = async (frame) => {
    if (trialOn && frame !== SKIN_NONE && !ownedKeys.frame.has(frame)) { writeTrial({ frame }); setFrameNow(frame); onFrameChange?.(frame); return { ok: true }; }
    if (trialOn) writeTrial({ frame: "" });
    const res = await postJson("/api/xp/avatar-frame", { frame });
    if (!res?.success) return { ok: false, error: res?.error };
    const next = res.data?.avatarFrame || "";
    setFrameNow(next);
    onFrameChange?.(next);
    return { ok: true };
  };
  // base: 보고 있던 단 순서 — 서버 목록이 그새 바뀌었으면(다른 탭 · 역할 확인 실패로 빠져 보이던 배지) 409 + 지금 목록이 오고, 그 목록으로 다시 맞춘다
  const postBadges = async (order, base) => {
    const res = await postJson("/api/xp/badge", { order, base });
    if (res?.success) {
      onBadgesChange?.(Array.isArray(res.data?.badges) ? res.data.badges : []);
      return { ok: true };
    }
    if (Array.isArray(res?.data?.badges)) onBadgesChange?.(res.data.badges);
    // 3개를 넘기면 서버가 409 와 안내 문구를 준다
    return { ok: false, error: res?.error };
  };
  const failSay = (error) => {
    playTone(220, 0.09, "square", 0.02);
    say(error || "저장하지 못했습니다");
  };
  const saveSkin = async (skin) => {
    if (skinBusy || clearBusy) return;
    setSkinBusy(true);
    try {
      const r = await postSkin(skin);
      if (!r.ok) return failSay(r.error);
      playTone(skin === SKIN_NONE ? 523 : 784, 0.07, "sine", 0.03);
      say(skin === SKIN_NONE ? "카드 테두리를 해제했습니다" : `${SKIN_OF[skin]?.l || ""} 카드 테두리를 착용했습니다`);
    } finally {
      setSkinBusy(false);
    }
  };
  const saveScene = async (scene) => {
    if (sceneBusy || clearBusy) return;
    setSceneBusy(true);
    try {
      const r = await postScene(scene);
      if (!r.ok) return failSay(r.error);
      playTone(scene === SKIN_NONE ? 523 : 784, 0.07, "sine", 0.03);
      say(scene === SKIN_NONE ? "카드 배경을 해제했습니다" : `${SCENE_OF[scene]?.l || ""} 카드 배경을 착용했습니다`);
    } finally {
      setSceneBusy(false);
    }
  };
  const saveFrame = async (frame) => {
    if (frameBusy || clearBusy) return;
    setFrameBusy(true);
    try {
      const r = await postFrame(frame);
      if (!r.ok) return failSay(r.error);
      playTone(frame === SKIN_NONE ? 523 : 784, 0.07, "sine", 0.03);
      say(frame === SKIN_NONE ? "프로필 테두리를 해제했습니다" : `${FRAME_OF[frame]?.l || ""} 프로필 테두리를 착용했습니다`);
    } finally {
      setFrameBusy(false);
    }
  };
  // 📌 배지 창 저장 — 단 배지 전체를 이 순서로(order). kind: "put" 달기 · "swap" 자리 바꿈 · "take" 떼기. 성공하면 true(실패면 창이 되돌린다)
  //    base: 창이 보고 있던 순서(postBadges)
  const saveBadgeOrder = async (order, kind, base) => {
    if (badgeBusy || clearBusy) return false;
    setBadgeBusy(true);
    try {
      const r = await postBadges(order, base);
      if (!r.ok) { failSay(r.error); return false; }
      playTone(kind === "take" ? 523 : kind === "swap" ? 659 : 784, 0.07, "sine", 0.03);
      say(kind === "take" ? "배지를 뗐습니다" : kind === "swap" ? "자리를 바꿨습니다" : "배지를 달았습니다");
      return true;
    } finally {
      setBadgeBusy(false);
    }
  };
  // 📌 장착 판 「모두 해제」 — 낀 것(카드 배경 · 카드 테두리 · 프로필 테두리 · 단 배지)을 한 번에 뺀다. 확인 없이 한 번에(알림 · 소리는 한 번).
  //    배지는 배지 창과 같은 저장(POST /api/xp/badge { order: [] , base: 지금 단 순서}) — 하나라도 못 빼면 그 문구
  const clearAll = async () => {
    if (clearBusy || skinBusy || sceneBusy || frameBusy || badgeBusy) return;
    const jobs = [];
    if (curScene) jobs.push(postScene(SKIN_NONE));
    if (curSkin) jobs.push(postSkin(SKIN_NONE));
    if (curFrame) jobs.push(postFrame(SKIN_NONE));
    if (wornIds.length) jobs.push(postBadges([], wornIds));
    if (!jobs.length) return;
    setClearBusy(true);
    try {
      const rs = await Promise.all(jobs);
      const bad = rs.find((r) => !r.ok);
      if (bad) return failSay(bad.error);
      playTone(523, 0.07, "sine", 0.03);
      say("모두 해제했습니다");
    } finally {
      setClearBusy(false);
    }
  };
  // 📌 즐겨찾기 넣고 빼기 — 바로 바꿔 보이고 알림 · 소리, 서버가 준 목록으로 맞춘다. 실패면 되돌리고 그 문구
  const toggleFav = async (it) => {
    const uid = it ? favKeyOf(it) : "";
    if (!uid || favBusy.current.has(uid)) return;
    const on = !favs.has(uid);
    const flip = (add) => setFavs((cur) => { const n = new Set(cur); if (add) n.add(uid); else n.delete(uid); return n; });
    favBusy.current.add(uid);
    const seq = ++favSeq.current;
    // 「즐겨찾기」 거르기 중이면 방금 뺀 것을 남겨 고른 칸이 다른 칸으로 넘어가지 않게
    if (!on && favOnly) setFavKeep((cur) => new Set(cur).add(uid));
    flip(on);
    onTone();
    say(on ? "즐겨찾기에 넣었습니다" : "즐겨찾기에서 뺐습니다");
    try {
      const res = await postJson("/api/shop/inv-favorites", { uid, on });
      if (res?.success) {
        if (seq === favSeq.current && Array.isArray(res.data?.uids)) setFavs(new Set(res.data.uids));
        return;
      }
      flip(!on);
      failSay(res?.error);
    } finally {
      favBusy.current.delete(uid);
    }
  };
  // 넣을 수 있는 아이템만 단추 — 넣었으면 true · 안 넣었으면 false · 관리자 체험 아이템 · 로그인 안 함은 null(상세 fav prop)
  const favOf = (it) => (signedIn && favReady && it?.uid && !it.trial && !String(it.uid).startsWith("trial:") ? favs.has(favKeyOf(it)) : null);
  const openBadges = () => { setBadgeOpen(true); playTone(660, 0.06, "sine", 0.03); };
  const closeBadges = useCallback(() => { setBadgeOpen(false); playTone(523, 0.06, "sine", 0.025); }, []);
  // 정렬 — 보는 사람 브라우저에 기억(편의용). 못 읽으면 기본
  const [sort, setSort] = useState("default");
  useEffect(() => {
    try { const v = localStorage.getItem(INV_SORT_KEY); if (INV_SORTS.some((o) => o.v === v)) setSort(v); } catch {}
  }, []);
  const [sortOpen, setSortOpen] = useState(false); // 폰 정렬 단추의 목록
  const pickSort = (v) => {
    setSort(v);
    onTone();
    try { localStorage.setItem(INV_SORT_KEY, v); } catch {}
  };

  const active = groups.find((g) => g.id === tab) || groups[0];
  // 📌 「꾸미기」 안 종류(카드 배경 · 카드 테두리 · 프로필 테두리 · 배지 · 기타) — 가진 종류만, 탭을 바꾸면 전체로(subOn 은 그 종류가 없어지면 전체)
  const [sub, setSub] = useState("all");
  const subKinds = useMemo(
    () => (active?.id === "cosmetic" || active?.id === "trial" ? COSMETIC_KINDS.filter((k) => active.items.some((it) => cosmeticKindsOf(it).includes(k.id))) : []),
    [active]
  );
  const subOn = subKinds.length > 1 && subKinds.some((k) => k.id === sub) ? sub : "all";
  // 장착 판의 고른 칸(흰 테) — 목록 거르기(subOn)와 따로. 종류가 하나뿐이어도(칩 없음) 누른 칸이 보이고 다시 누르면 풀린다
  const slotOn = subKinds.some((k) => k.id === sub) ? sub : "all";
  // 📌 「즐겨찾기」 칩이 있는 탭 — 관리자 체험(넣을 수 없음) · 로그인 안 함은 칩도 거르기도 없다
  const favChipOk = signedIn && !!active && active.id !== "trial";
  const favOnlyOn = favOnly && favChipOk;
  const rows = useMemo(() => {
    let list = active?.items || [];
    if (subOn !== "all") list = list.filter((it) => cosmeticKindsOf(it).includes(subOn));
    if (favOnlyOn) list = list.filter((it) => favs.has(favKeyOf(it)) || favKeep.has(favKeyOf(it)));
    const sorted = sortInvRows(list, sort);
    return sort === "default" && (active?.id === "cosmetic" || active?.id === "trial") ? sortCosmeticByKind(sorted) : sorted;
  }, [active, sort, subOn, favOnlyOn, favs, favKeep]);
  // 📌 고른 칸이 목록에서 빠지면(꾸미기 칩으로 거름 · 폴링으로 사라짐) 그리는 자리에서 바로 첫 칸으로 — 상세 · 번짐이 빈 채로 남지 않게.
  //    첫 칸이 그대로면 아래 효과가 다시 돌지 않아 빈 상세가 남았다. 일부러 비운 것(고른 칸을 다시 누름 · null)은 그대로
  if (open && sel != null && !rows.some((r) => r.uid === sel)) setSel(rows[0]?.uid ?? null);
  // 열 때 · 탭을 바꿀 때 첫 아이템을 골라 둔다 — 왼쪽 칸이 비지 않게
  useEffect(() => {
    if (!open) { setSel(null); return; }
    setSel((cur) => (cur && rows.some((r) => r.uid === cur) ? cur : rows[0]?.uid ?? null));
  }, [open, tab, rows[0]?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 📌 폰 상세 칸 높이 고정(2026-10-11 운영자 "탭마다 상세 높이 그런 건 수정해야") — 폰은 상세가 칸 격자 위에 쌓여, 고른 아이템마다 상세 높이가 달라
  //    탭 · 칸을 바꿀 때 격자가 오르내렸다. 가방 아이템 전부의 상세를 보이지 않게 한 번 그려(아래 재는 칸) 가장 긴 높이를 재고, 폰에서는 상세 칸을 그 높이로 잡는다.
  //    PC 는 상세가 옆 칸이라 격자에 영향이 없어 잡지 않는다(0). 폭이 바뀌면(돌리기 · 창 크기) 다시 잰다.
  //    📌 높이는 DETAIL_CAP(280px)까지만 — 가장 긴 상세에 다 맞추면 짧은 아이템 아래로 빈 공간이 크게 남았다(운영자 "그게 정상적인 표기야?").
  //       그보다 긴 상세(9종 테두리 · 효과 줄이 많은 아이템)는 그 칸 안에서 스크롤
  const measureRef = useRef(null);
  const DETAIL_CAP = 280;
  const [detailMin, setDetailMin] = useState(0);
  const allItems = groups[0]?.items;
  useLayoutEffect(() => {
    if (!open) return;
    const box = measureRef.current;
    if (!box) return;
    const measure = () => {
      if (!window.matchMedia("(max-width: 639px)").matches) { setDetailMin(0); return; }
      let max = 0;
      for (const el of box.children) max = Math.max(max, el.offsetHeight);
      setDetailMin(Math.min(max, DETAIL_CAP));
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(box);
    window.addEventListener("resize", measure);
    return () => { ro?.disconnect(); window.removeEventListener("resize", measure); };
  }, [open, allItems, curSkin, curScene, curFrame, signedIn]);

  // 📌 빈 칸 채우기(useFitRows) — 목록 격자 하나를 잰다: 꾸미기 · 체험 탭은 그림 칸 격자(3칸), 그 밖은 가방 격자
  const fillRef = useRef(null);
  const fillKey = active?.id === "cosmetic" || active?.id === "trial" ? "look" : "inv";
  const fit = useFitRows(fillRef, fillKey, `${open}|${active?.id}|${rows.length}|${sel}|${detailMin}|${subOn}|${favOnlyOn}|${loading}|${error}|${synced}`);

  // 📌 꾸미기에서 보기(goLook)로 넘어오면 — PC 는 그림 칸 목록(data-look-list)만 그 칸이 보이게 굴린다(무대는 그대로).
  //    폰은 굴리지 않는다 — 새 탭 본문은 맨 위(무대 카드에 입혀 보임)부터, 고른 칸은 아래 붙는 상세 줄에
  const lookJump = useRef("");
  useEffect(() => {
    if (!lookJump.current || tab !== "cosmetic") return;
    const raf = requestAnimationFrame(() => {
      const uid = lookJump.current;
      lookJump.current = "";
      if (!uid || !window.matchMedia("(min-width: 640px)").matches) return;
      const el = document.querySelector(`[data-look-uid="${CSS.escape(uid)}"]`);
      const box = el?.closest("[data-look-list]");
      if (!el || !box) return;
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
    });
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  if (!open) return null;

  // ── 장착 판(「꾸미기」 탭) — 낀 것 네 칸. 칸 그림은 가방의 그 아이템(같은 아이콘 · 색), 가방에 없으면(시즌 보상 등) 그 키의 아이콘 ──
  const bagAll = allItems || [];
  const short = (n) => invShortName({ name: n });
  const findWorn = (pred) => bagAll.find(pred) || null;
  const wornScene = curScene ? findWorn((it) => it.sceneKey === curScene) : null;
  const wornSkin = curSkin ? findWorn((it) => it.skinKey === curSkin) || findWorn((it) => it.skinKeys?.includes(curSkin)) : null;
  const wornFrame = curFrame ? findWorn((it) => it.frameKey === curFrame) || findWorn((it) => it.frameKeys?.includes(curFrame)) : null;
  const wornBadges = Array.isArray(badges) ? badges : [];
  const wornBadgeItem = wornIds.length ? findWorn((it) => it.badgeId === wornIds[0]) : null;
  const keySlot = (kind, key, item, label, artKey) => {
    if (!key) return { kind, empty: true, name: "", accent: "", glow: "", art: () => null };
    const accent = item ? invAccentOf(item) : "#d4d4d4";
    return {
      kind, empty: false, name: label || (item ? invShortName(item) : key), accent, glow: invGlowOf(item || { color: accent }),
      art: (size) => {
        const look = kind === "카드 배경" ? { sceneKey: key } : kind === "카드 테두리" ? { skinKey: key } : kind === "프로필 테두리" ? { frameKey: key } : null;
        if (look) return <LookArt it={look} size={Math.round(size * 0.8)} image={trialSession?.user?.image || ""} name={trialSession?.user?.name || ""} />;
        return item ? <InvIcon it={item} size={size} color={accent} /> : <ItemIcon icon={`art:${artKey}`} type="cosmetic" size={size} color={accent} />;
      },
    };
  };
  const badgeAccent = wornBadges[0] ? invAccentOf(wornBadges[0]) : "";
  const equipSlots = {
    scene: keySlot("카드 배경", curScene, wornScene, SCENE_OF[curScene]?.l, artOfScene(curScene)),
    skin: keySlot("카드 테두리", curSkin, wornSkin, SKIN_OF[curSkin]?.l, artOfSkin(curSkin)),
    frame: keySlot("프로필 테두리", curFrame, wornFrame, FRAME_OF[curFrame]?.l, artOfFrame(curFrame)),
    badge: wornBadges.length
      ? {
          kind: `배지 ${wornBadges.length}/${MAX_BADGES}`, empty: false, accent: badgeAccent, glow: invGlowOf(wornBadges[0]),
          name: `${short(wornBadges[0].name)}${wornBadges.length > 1 ? ` 외 ${wornBadges.length - 1}` : ""}`,
          // 단 배지(최대 3) — 하나면 크게 하나. 📌 2026-10-19 운영자 "배지 나가잖아" → "겹치는 듯이 · 좌부터 맨 앞에 1 2 3 · 카드 겹치는 느낌":
          //    둘 이상이면 배지마다 작은 카드(짙은 판 · 가는 테 · 흐림 없는 오른쪽 그림자)를 오른쪽으로 조금씩 밀어 겹친다 — 1번(왼쪽)이 맨 앞.
          //    카드 폭 0.48 칸 · 한 장마다 0.22 칸씩(셋이어도 0.92 칸 — 칸 안)
          art: (size) => {
            const n = wornBadges.length;
            if (n < 2) return <ItemIcon icon={wornBadges[0].icon} imageUrl={wornBadges[0].imageUrl} type={wornBadges[0].type} size={Math.round(size * 0.85)} color={invAccentOf(wornBadges[0])} />;
            const c = Math.round(size * 0.48), step = Math.round(size * (n >= 3 ? 0.22 : 0.3));
            return (
              <span className="relative block" style={{ width: c + step * (n - 1), height: c }}>
                {wornBadges.map((b, i) => (
                  <span key={b.itemId || i} className="absolute top-0 flex items-center justify-center rounded-[6px]"
                    style={{ left: step * i, width: c, height: c, zIndex: n - i, background: "#17161f", border: "1px solid rgba(255,255,255,0.16)", boxShadow: "3px 0 0 rgba(0,0,0,0.55)" }}>
                    <ItemIcon icon={b.icon} imageUrl={b.imageUrl} type={b.type} size={Math.round(c * 0.76)} color={invAccentOf(b)} />
                  </span>
                ))}
              </span>
            );
          },
        }
      : { kind: `배지 0/${MAX_BADGES}`, empty: true, name: "", accent: "", glow: "", art: () => null },
  };
  const wornItemOf = { scene: wornScene, skin: wornSkin, frame: wornFrame, badge: wornBadgeItem };
  // 칸을 누르면 아래 목록이 그 종류로(같은 칸을 다시 누르면 전체로) — 낀 것이 있으면 그 아이템을 골라 상세(해제 단추)를 보인다
  const tapEquip = (id) => {
    onTone();
    if (slotOn === id) { setSub("all"); return; }
    if (subKinds.some((k) => k.id === id)) setSub(id);
    // 낀 것이 이 탭 목록에 있을 때만 고른다(다른 유형으로 등록된 배지 등 — 없는 uid 를 고르면 첫 칸 상세로 바뀌었다)
    const worn = wornItemOf[id];
    if (worn?.uid && active?.items.some((x) => x.uid === worn.uid) && (!favOnlyOn || favs.has(favKeyOf(worn)) || favKeep.has(favKeyOf(worn)))) setSel(worn.uid);
  };
  const anyWorn = !!(curScene || curSkin || curFrame || wornIds.length);

  // uid 로 되짚는다 — 30초 폴링이 배열을 갈아끼워도 엉뚱한 것을 가리키지 않는다
  const selItem = sel ? rows.find((r) => r.uid === sel) || null : null;
  // 📌 빈 칸 — 2026-10-11 운영자 "인벤토리 칸이 너무 남잖아"로 마지막 줄만 채웠다가(예전 20칸), 2026-10-18 운영자 결정으로 목록 칸 바닥까지 빈 칸(fillOf · useFitRows).
  //    줄 수는 잰 값 — 칸이 바닥을 넘는 탭은 예전처럼 마지막 줄만. 재기 전엔 마지막 줄만(폰 4칸 · PC 6칸 중 큰 수, 줄 밖 빈 칸은 그 폭에서 숨김)
  //    📌 PC 6칸 — 큰 창(1100)에서 5칸이면 칸이 너무 커지고(운영자 "창이 너무 커진 느낌"), 8칸은 "너무 가로로 길어"

  // 📌 장착 판 — 「꾸미기」(· 관리자 「체험」) 탭에서만, 상세 · 목록 위에 전체 폭(2026-10-15 운영자 "아까 이 예시랑 너무 다른데" — 시안처럼 판이 맨 위에 넓게).
  //    옷장(무대 · 큰 미리보기 칸)으로 바꿔 봤다가 운영자 "내가 원한 건 이게 아니야 · 걍 전으로 가자"로 되돌렸다
  // 📌 칩(꾸미기 종류) · 정렬 줄 — 꾸미기 A 오른쪽과 다른 탭 목록 머리가 같은 줄을 쓴다(2026-10-16 운영자 "카테고리 부분은 작게 · 지금 인벤토리 디자인이랑 안 맞는 것도 있어")
  // 📌 왼쪽 칩 — 「즐겨찾기」(별 + 글자 · 즐겨찾기한 것만 켜고 끄기 · 2026-10-18) 다음 꾸미기 종류 칩(가진 종류가 둘 이상일 때 · 숫자 없이). 두 칩 줄이 같이 쓴다.
  //    즐겨찾기 칩은 맨 앞 늘 같은 자리 · 같은 폭(켜면 채운 별 · 노란 테 — 글자 · 폭 그대로) — 켜고 꺼도 종류 칩이 밀리지 않는다
  //    종류 칩 묶음(radiogroup)은 상자 없이(contents) — 즐겨찾기 칩과 한 흐름으로 줄을 접는다(묶음째 다음 줄로 넘어가 즐겨찾기 칩만 남지 않게)
  const kindChips = subKinds.length > 1 ? [{ id: "all", label: "전체" }, ...subKinds].map((k) => {
    const on = subOn === k.id;
    return (
      <button key={k.id} type="button" role="radio" aria-checked={on} onClick={() => { setSub(k.id); onTone(); }}
        style={PILL_W} className={`shrink-0 h-7 px-2.5 rounded-full border inline-flex items-center justify-center text-[11px] font-bold leading-[26px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${on ? "border-white/70 text-white" : "border-white/15 text-white/45 hover:text-white/75"}`}>
        {k.label}
      </button>
    );
  }) : null;
  const chipsLeft = (
    <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
      {favChipOk && (
        <button type="button" aria-pressed={favOnly}
          onClick={() => { setFavOnly((v) => !v); setFavKeep(new Set()); onTone(); }}
          style={PILL_W} className={`shrink-0 h-7 px-2.5 rounded-full border inline-flex items-center justify-center gap-1 text-[11px] font-bold leading-[26px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${favOnly ? "border-[#ffd34d]/60 text-[#ffd34d]" : "border-white/15 text-white/45 hover:text-white/75"}`}>
          <FavStar on={favOnly} size={14} />
          즐겨찾기
        </button>
      )}
      {favChipOk && kindChips && <span aria-hidden className="shrink-0 w-px h-4 mx-0.5 bg-white/10"></span>}
      {kindChips && <div role="radiogroup" aria-label="꾸미기 종류" className="contents">{kindChips}</div>}
    </div>
  );
  const chipSortRow = (groups[0]?.items.length ?? 0) > 1 ? (
        <div className="flex items-center gap-3 mb-2.5 -mt-1">
          {/* 📌 2026-10-17 칩은 줄을 접는다(숨은 가로 스크롤 금지 — chipSortRowA 와 같게) */}
          {chipsLeft}
          {/* 📌 정렬 — 넓은 화면은 네 단추, 좁으면 단추 하나 「기본 ▾」(2026-10-11 운영자 "너무 좁아지면 그냥 단추 표기로 해" — 꾸미기 칩과 한 줄에 다 들어가게).
                 모든 탭에서 같은 모양(탭마다 다르지 않게).
                 2026-10-17 「희귀도순」이 늘어 네 단추(약 230px)가 640~660 폭의 목록 칸(약 204px)을 넘쳐, 단추 하나 구간을 768 미만까지 넓혔다 */}
          <div aria-hidden={rows.length > 1 ? undefined : true} className={`shrink-0 relative ${rows.length > 1 ? "" : "invisible"}`}>
            <div role="radiogroup" aria-label="정렬" className="hidden md:flex items-center gap-0.5">
              {INV_SORTS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={sort === o.v} onClick={() => pickSort(o.v)}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold leading-[28px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${sort === o.v ? "text-white" : "text-white/35 hover:text-white/70"}`}>
                  {o.l}
                </button>
              ))}
            </div>
            <button type="button" aria-haspopup="listbox" aria-expanded={sortOpen} aria-label={`정렬 · ${INV_SORTS.find((o) => o.v === sort)?.l || "기본"}`} onClick={() => { setSortOpen((v) => !v); onTone(); }}
              className="md:hidden h-7 pl-2.5 pr-2 rounded-full border border-white/15 text-[11px] font-bold leading-[26px] text-white/80 inline-flex items-center gap-1 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              {INV_SORTS.find((o) => o.v === sort)?.l || "기본"}
              <svg aria-hidden viewBox="0 0 20 20" className={`w-3 h-3 transition-transform ${sortOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {sortOpen && (
              <>
                {/* 바깥을 누르면 닫힘 */}
                <button type="button" aria-hidden tabIndex={-1} className="md:hidden fixed inset-0 z-20 cursor-default" onClick={() => setSortOpen(false)} />
                <div role="listbox" aria-label="정렬" className="md:hidden absolute right-0 top-full mt-1.5 z-30 min-w-[116px] rounded-2xl bg-[#1d1d1d] border border-white/10 p-1 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]">
                  {INV_SORTS.map((o) => (
                    <button key={o.v} type="button" role="option" aria-selected={sort === o.v} onClick={() => { pickSort(o.v); setSortOpen(false); }}
                      className={`w-full h-9 px-3 rounded-xl text-left text-[12px] font-bold whitespace-nowrap flex items-center justify-between gap-3 transition-colors outline-none focus-visible:bg-white/10 ${sort === o.v ? "text-white bg-white/[0.06]" : "text-white/60 hover:text-white hover:bg-white/[0.04]"}`}>
                      {o.l}
                      {sort === o.v && <svg aria-hidden viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null;
  // 꾸미기 A 오른쪽 칸(좁다) — 칩은 줄을 접어 다 보이게(숨은 가로 스크롤 금지 — 2026-10-16 "안 넘어가니까"), 정렬은 늘 「기본 ▾」 단추 하나
  const chipSortRowA = (groups[0]?.items.length ?? 0) > 1 ? (
        <div className="flex items-start gap-3 mb-3">
          {chipsLeft}
          {/* 📌 정렬 — 넓은 화면은 세 단추, 폰(640 미만)은 단추 하나 「기본 ▾」(2026-10-11 운영자 "너무 좁아지면 그냥 단추 표기로 해" — 꾸미기 칩과 한 줄에 다 들어가게).
                 모든 탭에서 같은 모양(탭마다 다르지 않게) */}
          <div aria-hidden={rows.length > 1 ? undefined : true} className={`shrink-0 relative ${rows.length > 1 ? "" : "invisible"}`}>
            <div role="radiogroup" aria-label="정렬" className="hidden">
              {INV_SORTS.map((o) => (
                <button key={o.v} type="button" role="radio" aria-checked={sort === o.v} onClick={() => pickSort(o.v)}
                  className={`h-7 px-2 rounded-md text-[11px] font-bold leading-[28px] whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${sort === o.v ? "text-white" : "text-white/35 hover:text-white/70"}`}>
                  {o.l}
                </button>
              ))}
            </div>
            <button type="button" aria-haspopup="listbox" aria-expanded={sortOpen} aria-label={`정렬 · ${INV_SORTS.find((o) => o.v === sort)?.l || "기본"}`} onClick={() => { setSortOpen((v) => !v); onTone(); }}
              className="h-7 pl-2.5 pr-2 rounded-full border border-white/15 text-[11px] font-bold leading-[26px] text-white/80 inline-flex items-center gap-1 whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-white/60">
              {INV_SORTS.find((o) => o.v === sort)?.l || "기본"}
              <svg aria-hidden viewBox="0 0 20 20" className={`w-3 h-3 transition-transform ${sortOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            {sortOpen && (
              <>
                {/* 바깥을 누르면 닫힘 */}
                <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={() => setSortOpen(false)} />
                <div role="listbox" aria-label="정렬" className="absolute right-0 top-full mt-1.5 z-30 min-w-[116px] rounded-2xl bg-[#1d1d1d] border border-white/10 p-1 shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)]">
                  {INV_SORTS.map((o) => (
                    <button key={o.v} type="button" role="option" aria-selected={sort === o.v} onClick={() => { pickSort(o.v); setSortOpen(false); }}
                      className={`w-full h-9 px-3 rounded-xl text-left text-[12px] font-bold whitespace-nowrap flex items-center justify-between gap-3 transition-colors outline-none focus-visible:bg-white/10 ${sort === o.v ? "text-white bg-white/[0.06]" : "text-white/60 hover:text-white hover:bg-white/[0.04]"}`}>
                      {o.l}
                      {sort === o.v && <svg aria-hidden viewBox="0 0 20 20" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null;
  // ── 꾸미기 A(「꾸미기」 · 관리자 「체험」 탭) — 왼쪽 무대 + 상세, 오른쪽 칩 + 실제 모습 칸 ──
  const wardA = active?.id === "cosmetic" || active?.id === "trial";
  const wornOf = (it) => (!!it.sceneKey && it.sceneKey === curScene) || (!!it.skinKey && it.skinKey === curSkin) || (!!it.skinKeys && it.skinKeys.includes(curSkin)) || (!!it.frameKey && it.frameKey === curFrame) || (!!it.frameKeys && it.frameKeys.includes(curFrame)) || (!!it.badgeId && wornIds.includes(it.badgeId));
  const glowA = invGlowOf(selItem || wornScene || wornSkin || wornFrame || null).replace("0.24)", "0.3)");
  const meImgA = trialSession?.user?.image || "", meNameA = trialSession?.user?.name || "";
  // 📌 미리 보기 — 고른 아이템을 무대 카드에 입혀 본다(착용 전). 착용해야 바깥(레벨 페이지 카드)이 바뀐다.
  //    2026-10-17 운영자 "아이템을 클릭하면 미리보기가 바뀌어야지 착용하면 바깥도 바뀌는 거고" · "그럴 거면 미리보기가 왜 있어?"
  //    장착 칸 넷은 낀 것 그대로(미리 보는 동안 머리 글자만 「미리 보기」). 여러 키 묶음(등급 테두리 등)은 낀 키가 그 안이면 그것, 아니면 첫 키
  const tryKey = (one, many, cur) => one || (many?.length ? (many.includes(cur) ? cur : many[0]) : "");
  const tryOn = selItem ? { scene: selItem.sceneKey || "", skin: tryKey(selItem.skinKey, selItem.skinKeys, curSkin), frame: tryKey(selItem.frameKey, selItem.frameKeys, curFrame) } : {};
  const cardA = { skin: tryOn.skin || curSkin, scene: tryOn.scene || curScene, frame: tryOn.frame || curFrame };
  const tryingA = cardA.skin !== curSkin || cardA.scene !== curScene || cardA.frame !== curFrame;
  const stageLabelA = tryingA ? "미리 보기" : "장착 중";
  // 📌 꾸미기에서 보기(2026-10-18 운영자 "전체에서 꾸미기 아이템 클릭하면 꾸미기 탭으로 가기") — 꾸미기 탭 밖에서 고른 꾸미기만.
  //    꾸미기 탭으로 넘어가 그 칸을 고른다(무대 카드에 입혀 보임 · 종류 칩은 전체로 — 그 칸이 걸러지지 않게). 「즐겨찾기」 거르기는 켠 그대로(그 칸은 이미 목록에 있다)
  const lookTabOn = groups.some((g) => g.id === "cosmetic") && active?.id !== "cosmetic" && active?.id !== "trial";
  const goLook = (it) => {
    lookJump.current = it.uid;
    onTab("cosmetic");
    setSel(it.uid);
    setSub("all");
    onTone();
  };
  // 칸을 두 번 누름 — 그 칸을 고르고 바로 착용 · 해제(배지는 배지 창). 꾸미기 · 체험 탭 그림 칸이 같이 쓴다
  const wearNow = (it) => { setSel(it.uid); if (it.badgeId) openBadges(); else if (simpleA(it) && !(sceneBusy || skinBusy || frameBusy || clearBusy)) wearA(it); };
  const simpleA = (it) => !!it && !(it.skinKeys?.length > 1 || it.frameKeys?.length > 1 || (it.expiresAt && it.renewId)) && [it.sceneKey, it.skinKey, it.frameKey, it.badgeId].filter(Boolean).length === 1;
  const wearA = (it) => {
    if (it.sceneKey) return saveScene(wornOf(it) ? SKIN_NONE : it.sceneKey);
    if (it.skinKey) return saveSkin(wornOf(it) ? SKIN_NONE : it.skinKey);
    if (it.frameKey) return saveFrame(wornOf(it) ? SKIN_NONE : it.frameKey);
  };

  // ── 목록 격자(가방 칸 · 그림 칸 · 빈 칸) — 전체 · 아이템 · 그 밖 탭 · 꾸미기 탭이 같이 쓴다 ──
  const invCell = (it, i) => {
    const on = sel === it.uid;
    return <InvSlot key={it.uid || `i-${i}`} it={it} on={on} worn={wornOf(it)} fav={favs.has(favKeyOf(it))} onClick={() => { setSel(on ? null : it.uid); onTone(); }} />;
  };
  // 그림 칸(꾸미기 탭과 같은 LookTileA — 카드 배경 · 카드 테두리는 작은 카드, 프로필 테두리는 사진 둘레, 착용은 꺾쇠). 두 번 누르면 착용
  const lookCell = (it) => {
    const on = sel === it.uid;
    return <LookTileA key={it.uid} it={it} on={on} worn={wornOf(it)} fav={favs.has(favKeyOf(it))} image={meImgA} name={meNameA} onClick={() => { setSel(on ? null : it.uid); onTone(); }} onWear={() => wearNow(it)} />;
  };
  // 빈 칸 — 가방 빈 칸과 같은 홈 칸. 그림 칸 격자는 그 칸 모양(5:6). 줄 높이에 맞춰 늘린다(좁은 폰에서 이름 두 줄 + 상태 줄 칸이 조금 길어져도 같은 줄 바닥이 맞게)
  const emptyCell = (i, look, cls) => (
    <div key={`empty-${i}`} aria-hidden data-empty className={`${look ? "aspect-[5/6]" : "aspect-square"} w-full self-stretch ${cls}`} style={{ background: SLOT_BG, boxShadow: slotShadow(false, true) }}></div>
  );
  // 격자 — list 칸 뒤를 빈 칸으로(fillOf). cols: 칸 수 class(글자 그대로 — Tailwind 가 읽게) · m/p: 폰 · PC 칸 수(재기 전 마지막 줄 채우기용).
  //    last: 바닥까지 채울 맨 아래 격자(잰 값 fit · fillRef). note: 빈 목록 글자 — 빈 칸 위 가운데(격자 뒤에 두면 빈 칸이 바닥까지 찬 아래로 밀린다)
  const gridOf = (list, look, cols, m, p, last, note = "") => {
    const f = fillOf(list.length, m, p, last ? fit : null);
    return (
      <div className="relative">
        <div ref={last ? fillRef : undefined} data-ar={look ? 1.2 : 1} className={`grid ${cols} gap-2.5`}>
          {Array.from({ length: f.total }, (_, i) => (i < list.length ? (look ? lookCell(list[i]) : invCell(list[i], i)) : emptyCell(i, look, f.cls(i))))}
        </div>
        {note && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="px-3 py-1.5 rounded-full bg-[#131313] text-[12px] font-bold text-white/35 text-center">{note}</p>
          </div>
        )}
      </div>
    );
  };
  const noteOf = () => (loading ? "불러오는 중…" : favOnlyOn ? "즐겨찾기한 아이템이 없습니다" : error || "아직 보유한 아이템이 없습니다");

  const detailA =selItem && simpleA(selItem) ? (
    <DetailRow it={selItem} worn={wornOf(selItem)} busy={sceneBusy || skinBusy || frameBusy || clearBusy} onWear={() => wearA(selItem)} onBadge={openBadges} fav={favOf(selItem)} onFav={() => toggleFav(selItem)} />
  ) : selItem ? (
    <InvDetail it={selItem} onGo={onClose} fav={favOf(selItem)} onFav={() => toggleFav(selItem)}
      sceneOn={!!selItem.sceneKey && selItem.sceneKey === curScene} onScene={saveScene} sceneBusy={sceneBusy || clearBusy}
      skinOn={!!selItem.skinKey && selItem.skinKey === curSkin} skinCur={curSkin} onSkin={saveSkin} skinBusy={skinBusy || clearBusy}
      badgeSlot={selItem.badgeId ? wornIds.indexOf(selItem.badgeId) : -1} onBadgeOpen={openBadges}
      frameOn={!!selItem.frameKey && selItem.frameKey === curFrame} frameCur={curFrame} onFrame={saveFrame} frameBusy={frameBusy || clearBusy} />
  ) : null;
  const bodyA = wardA ? (
    <div className="sm:h-full sm:flex">
      <div className="min-w-0 sm:flex-1 sm:overflow-y-auto no-bar px-4 sm:px-6 pt-4 sm:py-6 flex flex-col gap-4">
        <div className="sm:hidden">
          <StageMini slots={equipSlots} slotOn={slotOn} onSlot={tapEquip} card={cardA} label={stageLabelA} info={cardInfo} glow={glowA}
            image={meImgA} name={meNameA} onClearAll={clearAll} clearOff={!anyWorn || clearBusy || skinBusy || sceneBusy || frameBusy || badgeBusy} />
        </div>
        <div className="hidden sm:block">
          <StageA slots={equipSlots} slotOn={slotOn} onSlot={tapEquip} card={cardA} label={stageLabelA} info={cardInfo} glow={glowA}
            image={meImgA} name={meNameA} onClearAll={clearAll} clearOff={!anyWorn || clearBusy || skinBusy || sceneBusy || frameBusy || badgeBusy} />
        </div>
        {/* 상세 — PC 는 무대 아래. 폰은 목록 아래에 붙는 얇은 줄(DetailMini) */}
        {detailA && <div className="hidden sm:block pt-1">{detailA}</div>}
      </div>
      <div data-look-list className="min-w-0 sm:w-[372px] sm:shrink-0 sm:border-l border-white/[0.08] sm:overflow-y-auto pop-scroll px-4 sm:px-5 pt-4 pb-6 sm:py-6">
        {chipSortRowA}
        {/* 그림 칸 3칸 — 뒤는 빈 칸으로 바닥까지(폰은 아래 붙는 상세 줄 위까지) */}
        {gridOf(rows, true, "grid-cols-3", 3, 3, true, rows.length === 0 ? noteOf() : "")}
        {selItem && (
          simpleA(selItem) ? (
            <div className="sm:hidden sticky bottom-0 -mx-4 mt-4 px-4 py-3 bg-[#141414]/95 backdrop-blur border-t border-white/10">
              <DetailMini it={selItem} worn={wornOf(selItem)} busy={sceneBusy || skinBusy || frameBusy || clearBusy} onWear={() => wearA(selItem)} onBadge={openBadges} fav={favOf(selItem)} onFav={() => toggleFav(selItem)} />
            </div>
          ) : (
            <div className="sm:hidden mt-5">{detailA}</div>
          )
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
    <PopShell
      open={open}
      onClose={onClose}
      title="인벤토리"
      count={groups[0]?.items.length ?? 0}
      icon="bag"
      corner="2xl"
      // 📌 창은 모든 탭이 같은 큰 창 1100 × 800 — 탭마다 크기를 바꾸면 탭 줄이 움직인다(2026-10-17 운영자 "그냥 똑같은 크기로 맞추라니까" · "탭줄도 키워봐").
      //    탭 줄도 큰 창에 맞춰 PC 에서 키운다(InvTab). 전체 · 아이템은 원래 틀(왼쪽 상세 + 격자) 그대로, PC 격자 6칸
      size="xl"
      tabsWrap
      body={bodyA}
      // 📌 2026-10-11 격자는 두고(운영자 "격자는 필요할 듯") 붉은 번짐 대신 고른 아이템 색 번짐
      theme="inkGrid"
      glow={invGlowOf(selItem)}
      // 📌 불러오는 동안은 탭 줄 높이만 잡아 둔다 — 목록이 오면서 탭 줄이 생겨 본문이 한 번 밀려 내려가지 않게
      tabs={groups.length > 1 ? groups.map((g) => (
        // 📌 탭 옆 숫자는 뺀다(2026-10-11 "카테고리 옆에 숫자도 빼고") — 개수는 머리의 전체 수 하나
        //    지금 탭을 다시 누르면 칩만 「전체」로(고른 칸은 그대로 — 예전엔 고른 칸이 비고 다시 안 골라져 상세가 빈 채로 남았다)
        //    「즐겨찾기」 거르기(favOnly)는 탭을 바꿔도 그대로
        <InvTab key={g.id} on={active?.id === g.id} onClick={() => { if (active?.id !== g.id) { onTab(g.id); setSel(null); setFavKeep(new Set()); } setSub("all"); onTone(); }} label={g.label} />
      )) : loading ? <span aria-hidden className="h-8"></span> : null}
      left={
        <>
        {/* 상세 칸 — 폰에서는 가방에서 가장 긴 상세 높이로 잡아 둔다(detailMin — 격자가 안 오르내리게) */}
        <div className={`relative flex flex-col sm:flex-1 ${detailMin ? "overflow-y-auto overflow-x-hidden no-bar overscroll-contain" : ""}`} style={detailMin ? { height: detailMin } : undefined}>
        {selItem ? (
          <InvDetail it={selItem} onGo={onClose} fav={favOf(selItem)} onFav={() => toggleFav(selItem)} onLook={lookTabOn && isLookRow(selItem) ? () => goLook(selItem) : undefined}
            sceneOn={!!selItem.sceneKey && selItem.sceneKey === curScene} onScene={saveScene} sceneBusy={sceneBusy || clearBusy}
            skinOn={!!selItem.skinKey && selItem.skinKey === curSkin} skinCur={curSkin} onSkin={saveSkin} skinBusy={skinBusy || clearBusy}
            badgeSlot={selItem.badgeId ? wornIds.indexOf(selItem.badgeId) : -1} onBadgeOpen={openBadges}
            frameOn={!!selItem.frameKey && selItem.frameKey === curFrame} frameCur={curFrame} onFrame={saveFrame} frameBusy={frameBusy || clearBusy} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-0">
            {/* 고른 칸이 없을 때 — 빈 가방 표시만(안내 문장은 운영자 "개짜침"으로 뺐다) */}
            <span aria-hidden className="w-14 h-14 rounded-2xl border border-dashed border-white/15 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6">
                <path d={ICON_PATHS.bag} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        )}
        {/* 재는 칸 — 가방 아이템 전부의 상세를 보이지 않게(높이 0 · 잘림 — 스크롤 길이도 안 늘린다). 폰에서만 쓴다 */}
        <div ref={measureRef} aria-hidden className="sm:hidden absolute inset-x-0 top-0 h-0 overflow-hidden invisible pointer-events-none">
          {(allItems || []).map((it) => (
            <div key={it.uid}>
              {/* 즐겨찾기 · 꾸미기에서 보기 단추 자리도 같게 — 누르는 일은 없다 */}
              <InvDetail it={it} sceneOn={!!it.sceneKey && it.sceneKey === curScene} skinOn={!!it.skinKey && it.skinKey === curSkin} skinCur={curSkin} badgeSlot={it.badgeId ? wornIds.indexOf(it.badgeId) : -1}
                frameOn={!!it.frameKey && it.frameKey === curFrame} frameCur={curFrame} fav={favOf(it) == null ? null : false} onLook={lookTabOn && isLookRow(it) ? noop : undefined} />
            </div>
          ))}
        </div>
        </div>
        </>
      }
      footer={
        synced === false ? (
          <div className="relative z-10 shrink-0 border-t border-white/[0.08] bg-white/[0.02] px-5 sm:px-7 py-3">
            <p className="text-[11px] text-white/30 break-keep">디스코드 역할을 확인하지 못해 구매 기록 기준으로 표시하고 있습니다.</p>
          </div>
        ) : null
      }
    >
      {/* 정렬 — 탭 줄이 아니라 목록 머리에(탭이 밀리지 않게). 고른 것만 밝게, 굵기는 같게
          📌 한 개뿐인 탭에서도 자리는 남긴다(가린다) — 탭을 오갈 때 격자가 이 줄만큼 오르내리지 않게 */}
      {/* 📌 같은 줄 왼쪽에 「즐겨찾기」(거르기) · 꾸미기 종류 칩(chipsLeft). 폰에서 넘치면 칩만 줄을 접는다(정렬은 제자리) */}
      {chipSortRow}
      {/* invGroups 는 보유 0개면 [] 를 돌려준다 — groups[0] 로 판정하면 신규 유저에게 문구가 안 뜬다 */}
      {gridOf(rows, false, "grid-cols-4 sm:grid-cols-6", 4, 6, true, rows.length === 0 ? noteOf() : "")}
    </PopShell>
    {badgeOpen && (
      <BadgeWindow onClose={closeBadges} items={badgeItems} badges={badges} busy={badgeBusy} onSave={saveBadgeOrder} onTone={onTone} />
    )}
    {/* 착용 · 해제 알림 — 가방 창 밖(뷰포트 기준)에 띄운다 */}
    {toast && (
      <div className="fixed left-1/2 -translate-x-1/2 bottom-24 md:bottom-10 z-[400] px-5 py-3 rounded-full bg-white text-[#131313] text-[12px] font-bold shadow-[0_18px_44px_-14px_rgba(0,0,0,0.5)] pointer-events-none">
        {toast}
      </div>
    )}
    </>
  );
};

// 📌 새 보유 목록을 받을 때 — 디스코드 역할 확인에 실패한 응답(synced:false)은 역할로 가진 것((B) r: 항목)이 빠져 온다.
//    그 응답이 멀쩡하던 목록을 덮으면 레벨 보상 · 역할 아이템이 새로고침 전까지 사라지므로, 직전 목록의 역할 항목을 남긴다.
//    다음에 확인에 성공한 응답(synced:true)이 오면 그대로 갈아끼운다(정말 뺏긴 역할은 그때 빠진다).
export function mergeMyItems(prev, next) {
  if (!next || next.synced !== false || !Array.isArray(prev?.items)) return next;
  const have = new Set((next.items || []).map((it) => it.uid));
  const keep = prev.items.filter((it) => String(it.uid || "").startsWith("r:") && !have.has(it.uid));
  if (!keep.length) return next;
  // 등급 · 레벨 보상은 서버 순서처럼 맨 앞
  const top = keep.filter((it) => it.source === "level");
  const rest = keep.filter((it) => it.source !== "level");
  return { ...next, items: [...top, ...(next.items || []), ...rest] };
}

// 📌 카드 스킨 저장보다 먼저 떠난 조회(폴링 · 가방 열기)가 늦게 도착하면 cardSkin 만 저장한 값으로 둔다 — 옛 스킨으로 되돌리지 않게.
//    t0: 조회를 시작한 시각, saved: { at: 저장 시각, v: 저장 결과 스킨 키 }
export function keepSavedSkin(data, t0, saved) {
  return data && saved && t0 < saved.at ? { ...data, cardSkin: saved.v } : data;
}
// 📌 배지도 같은 규칙 — 저장보다 먼저 떠난 조회는 badges 만 저장한 목록으로 둔다. saved: { at: 저장 시각, v: 저장 결과 배지 목록 }
export function keepSavedBadges(data, t0, saved) {
  return data && saved && t0 < saved.at ? { ...data, badges: saved.v } : data;
}
// 📌 아바타 테두리도 같은 규칙 — 저장보다 먼저 떠난 조회는 avatarFrame 만 저장한 키로 둔다. saved: { at: 저장 시각, v: 저장 결과 테두리 키 }
export function keepSavedFrame(data, t0, saved) {
  return data && saved && t0 < saved.at ? { ...data, avatarFrame: saved.v } : data;
}
// 📌 카드 배경도 같은 규칙 — 저장보다 먼저 떠난 조회는 cardScene 만 저장한 키로 둔다. saved: { at: 저장 시각, v: 저장 결과 배경 키 }
export function keepSavedScene(data, t0, saved) {
  return data && saved && t0 < saved.at ? { ...data, cardScene: saved.v } : data;
}

// 📌 그 자리에서 여는 인벤토리 — 내 정보 · ARCTIC 이 쓴다. 열 때마다 /api/shop/my-items 를 새로 읽는다.
//    처음 읽기 전에는 빈 가방 문구 대신 불러오는 중. 여닫는 소리는 레벨 가방과 같다(낮은음 → 높은음 / 반대).
export function InventoryPopup({ open, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const skinSaved = useRef({ at: 0, v: "" }); // 마지막 스킨 저장(keepSavedSkin)
  const badgeSaved = useRef({ at: 0, v: [] }); // 마지막 배지 저장(keepSavedBadges)
  const frameSaved = useRef({ at: 0, v: "" }); // 마지막 테두리 저장(keepSavedFrame)
  const sceneSaved = useRef({ at: 0, v: "" }); // 마지막 카드 배경 저장(keepSavedScene)
  useEffect(() => {
    if (!open) return;
    playTone(392, 0.06, "sine", 0.03);
    const t = setTimeout(() => playTone(587, 0.08, "sine", 0.03), 90);
    let alive = true;
    const t0 = Date.now();
    fetch("/api/shop/my-items", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        // 실패는 빈 가방과 구분한다 — 받아 둔 목록(과 지금 스킨 · 연동 여부)이 있으면 그대로 두고 문구만 바꾼다
        if (d?.success) setData((cur) => mergeMyItems(cur, keepSavedScene(keepSavedFrame(keepSavedBadges(keepSavedSkin(d.data, t0, skinSaved.current), t0, badgeSaved.current), t0, frameSaved.current), t0, sceneSaved.current)));
        else setData((cur) => ({ ...(cur || {}), items: cur?.items || [], error: d?.error || "불러오지 못했습니다" }));
      })
      .catch(() => { if (alive) setData((cur) => ({ ...(cur || {}), items: cur?.items || [], error: "불러오지 못했습니다" })); });
    return () => { alive = false; clearTimeout(t); };
  }, [open]);
  const groups = useMemo(() => buildInvGroups(data?.items || []), [data]);
  const close = () => {
    playTone(523, 0.06, "sine", 0.025);
    setTimeout(() => playTone(349, 0.08, "sine", 0.025), 90);
    onClose();
  };
  return (
    <BagOverlay
      open={open}
      onClose={close}
      groups={groups}
      tab={tab}
      onTab={setTab}
      synced={data?.synced}
      loading={data === null}
      error={data?.error}
      onTone={() => playTone(620, 0.04, "sine", 0.025)}
      cardSkin={data?.cardSkin || ""}
      onSkinChange={(k) => {
        skinSaved.current = { at: Date.now(), v: k };
        setData((cur) => (cur ? { ...cur, cardSkin: k } : cur));
      }}
      cardScene={data?.cardScene || ""}
      onSceneChange={(k) => {
        sceneSaved.current = { at: Date.now(), v: k };
        setData((cur) => (cur ? { ...cur, cardScene: k } : cur));
      }}
      badges={data?.badges}
      onBadgesChange={(list) => {
        badgeSaved.current = { at: Date.now(), v: list };
        setData((cur) => (cur ? { ...cur, badges: list } : cur));
      }}
      avatarFrame={data?.avatarFrame || ""}
      onFrameChange={(k) => {
        frameSaved.current = { at: Date.now(), v: k };
        setData((cur) => (cur ? { ...cur, avatarFrame: k } : cur));
      }}
    />
  );
}
