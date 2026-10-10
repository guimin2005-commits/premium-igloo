"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { playTone } from "@/lib/sfx";
import ItemIcon from "./ItemIcon";
import TierEmblem from "./TierEmblem";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { ICON_PATHS } from "./Icons";
import { PopShell, PopTab, AdminReset } from "./PopShell";
import {
  SKIN_OF, SKIN_NONE, FRAME_OF,
  MAX_BADGES, badgeSlotsOf, badgeOrderOf, firstEmptySlot, pickSlot, nextEmptySlot, putBadgeAt, takeBadgeAt,
} from "@/lib/itemEffects";

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

// 📌 정렬 — 기본(상점 관리에서 정한 순서, 서버가 준 순서) · 최신순(받은 날) · 만료 임박(기간제 먼저).
//    등급 · 레벨 보상은 어느 정렬에서든 맨 앞(받은 날이 없는 항목이라 뒤로 밀리지 않게). 날짜가 없는 것은 기본 순서로 뒤에.
export const INV_SORTS = [
  { v: "default", l: "기본" },
  { v: "recent", l: "최신순" },
  { v: "expiry", l: "만료 임박" },
];
const INV_SORT_KEY = "iglooInvSort";
export const sortInvRows = (rows, sort) => {
  if (sort !== "recent" && sort !== "expiry") return rows;
  const t = (v) => (v ? new Date(v).getTime() : NaN);
  return rows
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const la = a.it.source === "level" ? 0 : 1;
      const lb = b.it.source === "level" ? 0 : 1;
      if (la !== lb) return la - lb;
      if (la === 0) return a.i - b.i;
      if (sort === "recent") {
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

// 📌 가방 칸 하나 — 가방 격자와 아이템 등록 미리보기가 같은 칸을 쓴다(onClick 이 없으면 누를 수 없는 칸)
const InvSlot = ({ it, on, onClick }) => {
  const dead = it.status === "pending" || it.status === "missing";
  const accent = invAccentOf(it);
  const dday = ddayOf(it);
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button", onClick } : {})}
      title={it.name}
      className={`relative aspect-square rounded-xl flex flex-col items-center justify-center px-1.5 transition-all outline-none focus:outline-none ${
        on ? "-translate-y-0.5" : onClick ? "hover:-translate-y-0.5" : ""
      }`}
      style={{
        background: dead ? "rgba(255,255,255,0.03)" : `linear-gradient(160deg, ${accent}2e, ${accent}0d)`,
        // 고른 칸은 흰 테두리 — ring 클래스는 이 인라인 그림자에 덮여 안 보였다
        boxShadow: `${on ? "0 0 0 2px rgba(255,255,255,0.75), " : ""}${dead ? "inset 0 0 0 1px rgba(255,255,255,0.07)" : `inset 0 0 0 1px ${accent}44`}`,
      }}
    >
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
          <span className={`w-full text-[10px] font-black leading-tight text-center ${hasSlotStatus(it) ? "line-clamp-1" : "line-clamp-2"} ${dead ? "text-white/35" : "text-white/85"}`}>
            {it.name}
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
//    카드 스킨 아이템(it.skinKey)이면 착용 · 해제 버튼 — skinOn: 지금 이 스킨을 쓰는 중, onSkin(키 | "none")
//    등급 전체(9종) 카드 스킨 아이템(it.skinKeys)이면 등급 칸 9개 — skinCur: 지금 쓰는 스킨 키(테두리 전체 아이템과 같은 흐름)
//    프로필 배지 아이템(it.badgeId)이면 [배지 설정] 버튼 — 배지 창(BadgeWindow)을 그 자리에 연다. badgeSlot: 단 자리(0 · 1 · 2, 안 달았으면 -1), onBadgeOpen()
//    아바타 테두리 아이템(it.frameKey)이면 착용 · 해제 버튼 — frameOn: 지금 이 테두리를 쓰는 중, onFrame(키 | "none")
//    전체(9종) 테두리 아이템(it.frameKeys)이면 등급 칸 9개 — frameCur: 지금 쓰는 테두리 키, 누르면 그 테두리 · 낀 칸을 다시 누르면 해제
const InvDetail = ({ it, compact = false, onGo, skinOn = false, skinCur = "", onSkin, skinBusy = false, badgeSlot = -1, onBadgeOpen, frameOn = false, frameCur = "", onFrame, frameBusy = false }) => {
  const accent = invAccentOf(it);
  const dday = ddayOf(it);
  const lines = Array.isArray(it.effectLines) ? it.effectLines.filter(Boolean) : [];
  // 📌 스킨 · 배지 · 테두리 중 둘 이상인 아이템은 버튼이 여럿 — 어느 쪽인지 앞에 붙여 가른다(하나뿐이면 그냥 착용 · 착용 해제)
  const both = [it.skinKey || it.skinKeys?.length, it.badgeId, it.frameKey || it.frameKeys?.length].filter(Boolean).length > 1;
  const wearBtn = (on) =>
    `mt-1 w-full h-9 rounded-full text-[11px] font-black flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${
      on ? "border border-white/20 hover:border-white/45 text-white/80 hover:text-white" : "bg-white text-[#131313] hover:bg-white/90"
    }`;
  return (
    <div className="min-w-0">
      <div
        className={`${compact ? "w-16 h-16 rounded-xl mb-3.5" : "w-24 h-24 rounded-2xl mb-5"} flex items-center justify-center`}
        style={{ background: `linear-gradient(160deg, ${accent}33, ${accent}0f)`, boxShadow: `inset 0 0 0 1px ${accent}55` }}
      >
        <InvIcon it={it} size={compact ? 30 : 46} color={accent} dim={it.status !== "completed"} />
      </div>
      <p className={`${compact ? "text-[16px]" : "text-[20px]"} font-black text-white leading-snug break-keep break-words`}>{it.name}</p>
      <p className="text-[12px] font-bold text-white/50 mt-2 leading-relaxed break-keep break-words whitespace-pre-line">{invSubLabel(it)}</p>

      <div className={`${compact ? "mt-4" : "mt-5"} space-y-3`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-white/45">상태</span>
          <span className={`text-[12px] font-black ${it.status === "missing" ? "text-[#ff5c77]" : it.status === "pending" ? "text-white/60" : "text-emerald-400"}`}>
            {it.status === "pending" ? "지급 대기" : it.status === "missing" ? "확인 필요" : "보유 중"}
          </span>
        </div>
        {/* 📌 여러 개 묶음(count — 1개 단위 · 소모품)은 기간 줄 자리에 수량 — 줄 수가 그대로라 상세가 늘지 않는다 */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-white/45">{it.count != null ? "수량" : "기간"}</span>
          <span className="text-[12px] font-black text-white/80 tabular-nums">
            {it.count != null
              ? `×${it.count}${it.pendingCount > 0 ? ` · 지급 대기 ${it.pendingCount}` : ""}`
              : it.expiresAt ? `${it.days > 0 ? `${it.days}일 · ` : ""}기간제` : it.source === "season" ? "다음 시즌까지" : "영구"}
          </span>
        </div>
        {it.expiresAt && !it.provisional && (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-white/45">만료</span>
              <span className="text-[12px] font-black text-white/70 tabular-nums">{untilOf(it)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-bold text-white/45">남은 기간</span>
              <span className={`text-[12px] font-black tabular-nums ${dday <= 3 ? "text-[#ff5c77]" : "text-white/70"}`}>
                D-{dday}
              </span>
            </div>
          </>
        )}
        {/* 📌 연장 — 상품 상세에서 기간을 이어 산다(지금 만료 뒤에 붙는다). 연장할 판매 상품이 있을 때만 서버(my-items)가 renewId 를 준다 */}
        {it.expiresAt && it.renewId && !compact && (
          <Link href={`/arctic/item/${it.renewId}`} onClick={onGo}
            className="mt-1 w-full h-9 rounded-full border border-white/20 hover:border-white/45 text-[11px] font-black text-white/80 hover:text-white flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            기간 연장
          </Link>
        )}
        {/* 📌 카드 스킨 — 가진 스킨 중 하나를 골라 봇 이미지 카드(레벨업 · /레벨 · /랭크 · /출석체크)와 내 프로필 카드에 씌운다.
               해제하면 기본 카드. 착용 여부는 버튼 글자로만(스킨 이름은 아래 효과 줄 — 같은 말을 두 번 쓰지 않는다).
               버튼은 전체 폭이라 글자가 바뀌어도 자리가 그대로 */}
        {it.skinKey && !compact && (
          <button type="button" disabled={skinBusy} onClick={() => onSkin?.(skinOn ? SKIN_NONE : it.skinKey)} className={wearBtn(skinOn)}>
            {both ? (skinOn ? "스킨 해제" : "스킨 착용") : skinOn ? "착용 해제" : "착용"}
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
        {it.badgeId && !compact && (
          <button type="button" onClick={() => onBadgeOpen?.()} className={`${wearBtn(badgeSlot >= 0)} gap-1.5`}>
            배지 설정
            {badgeSlot >= 0 && (
              <span aria-label={`${badgeSlot + 1}번 자리`} className="w-4 h-4 rounded-full bg-white/15 text-[9px] font-black tabular-nums flex items-center justify-center">{badgeSlot + 1}</span>
            )}
          </button>
        )}
        {/* 📌 아바타 테두리 — 가진 테두리 중 하나를 골라 프로필 사진에 씌운다. 해제하면 테두리 없음(스킨과 같은 흐름) */}
        {it.frameKey && !compact && (
          <button type="button" disabled={frameBusy} onClick={() => onFrame?.(frameOn ? SKIN_NONE : it.frameKey)} className={wearBtn(frameOn)}>
            {both ? (frameOn ? "테두리 해제" : "테두리 착용") : frameOn ? "착용 해제" : "착용"}
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
        {it.rewardLevel != null && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold text-white/45">레벨</span>
            <span className="text-[12px] font-black tabular-nums text-white/70">Lv.{it.rewardLevel}</span>
          </div>
        )}
      </div>

      {/* 📌 효과 — 서버(/api/shop/my-items)가 붙인 문장(effectLines: 아이템 자체 효과 + 지금 가진 역할의 역할 버프)을 한 줄씩 */}
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
export function InventoryItemPreview({ item, effectLines }) {
  const it = { status: "completed", ...item, effectLines: Array.isArray(effectLines) ? effectLines : [] };
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#131313] flex">
      <div aria-hidden className="absolute -top-20 -right-12 w-52 h-52 blur-[80px] rounded-full pointer-events-none" style={{ background: "rgba(233,30,63,0.2)" }}></div>
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
  const short = (n) => String(n || "").replace(/^배지\s*·\s*/, ""); // 창 안 이름은 "배지 · " 머리말 없이

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

  const cells = Math.max(8, Math.ceil(items.length / 4) * 4); // 4열 — 빈 자리는 점선 칸으로 채운다
  const ring = "0 0 0 2px rgba(255,255,255,0.85), 0 0 22px -4px rgba(255,255,255,0.45)";
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
        className="relative w-full sm:max-w-[440px] max-h-[86dvh] sm:max-h-[88vh] overflow-hidden rounded-t-3xl sm:rounded-3xl shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] flex flex-col"
        style={{ background: "#131313", animation: "tierIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <div aria-hidden className="absolute inset-0 lux-grid-bg-dark opacity-60 pointer-events-none"></div>
        <div aria-hidden className="absolute -top-28 -right-16 w-72 h-72 blur-[100px] rounded-full pointer-events-none" style={{ background: "rgba(233,30,63,0.2)" }}></div>

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
          {/* 단 배지 칸 — 1 · 2 · 3번(이름 옆 순서). 고른 칸은 흰 테 · 빛, 빈 칸은 점선 */}
          <div aria-label="배지 칸" className="flex justify-center gap-3 sm:gap-4">
            {slots.map((id, i) => {
              const b = id ? info.get(id) : null;
              const accent = b ? invAccentOf(b) : "";
              const on = sel === i;
              const shadow = [on ? ring : "", over === i ? "0 0 0 2px rgba(255,255,255,0.45)" : "", b ? `inset 0 0 0 1px ${accent}55` : ""].filter(Boolean).join(", ");
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
                  className="relative shrink-0 w-[84px] h-[84px] sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center transition-[box-shadow,transform] duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                  style={{
                    background: b ? `linear-gradient(160deg, ${accent}33, ${accent}0f)` : "rgba(255,255,255,0.02)",
                    boxShadow: shadow || undefined,
                  }}
                >
                  {!b && <span aria-hidden className="absolute inset-0 rounded-2xl border border-dashed border-white/20 pointer-events-none"></span>}
                  <span aria-hidden className={`absolute top-1.5 left-2 text-[10px] font-black tabular-nums leading-none pointer-events-none ${on ? "text-white" : "text-white/40"}`}>{i + 1}</span>
                  {b && <span aria-hidden className="pointer-events-none flex items-center justify-center"><InvIcon it={b} size={46} color={accent} /></span>}
                </button>
              );
            })}
          </div>

          {/* 상자 — 가진 배지 전부. 단 배지는 칸 번호 표식 + 살짝 어둡게 */}
          <div
            className="mt-6 rounded-2xl p-3 bg-black/25"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07)" }}
            onDragOver={(e) => { if (dragRef.current?.from === "slot") e.preventDefault(); }}
            onDrop={dropOnBox}
          >
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: cells }, (_, n) => {
                const it = items[n];
                if (!it) return <div key={`empty-${n}`} aria-hidden className="aspect-square rounded-xl border border-dashed border-white/[0.08] bg-white/[0.02]"></div>;
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
                    className="relative aspect-square min-w-0 rounded-xl flex flex-col items-center justify-center px-1 transition-transform hover:-translate-y-0.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    style={{ background: `linear-gradient(160deg, ${accent}2e, ${accent}0d)`, boxShadow: `inset 0 0 0 1px ${accent}44` }}
                  >
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

// 📌 가방 — 인벤토리를 대시보드에 펼치지 않고 오버레이로 연다.
//    껍데기는 TierModal 과 같은 문법(모바일 바텀시트 / 데스크톱 모달, 잉크 패널).
//    스크롤 잠금은 손대지 않는다 — 루트 className 에 "fixed inset-0" 이 붙어 있고
//    z-index 가 50 이상이면 ScrollLock 이 알아서 건다(iOS 대응 포함).
// 📌 cardSkin: 서버(my-items)가 준 지금 쓰는 스킨 키("" 이면 기본 카드). 착용 · 해제는 가방이 직접 저장하고(POST /api/xp/card-skin)
//    결과를 바로 보여 준다 — 다음 폴링으로 같은 값이 오면 그대로. onSkinChange(키) 가 있으면 부모에도 알린다(프로필 카드 장식)
// 📌 badges: 서버(my-items)가 준 지금 단 배지 목록(순서 = 이름 옆 자리). 배지 창(BadgeWindow)에서 바꿀 때마다 POST /api/xp/badge { order } 로 저장하고
//    onBadgesChange(목록) 로 부모에 알린다(스킨과 같은 흐름)
// 📌 avatarFrame: 서버(my-items)가 준 지금 쓰는 테두리 키("" 이면 없음). POST /api/xp/avatar-frame 로 저장하고 onFrameChange(키) 로 부모에 알린다(스킨과 같은 흐름)
export const BagOverlay = ({ open, onClose, groups, tab, onTab, synced, onTone, onReset, resetBusy, loading = false, error = "", cardSkin = "", onSkinChange, badges, onBadgesChange, avatarFrame = "", onFrameChange }) => {
  const [sel, setSel] = useState(null); // 선택한 아이템 uid
  const [skinNow, setSkinNow] = useState(null); // 방금 저장한 값(서버 값이 오기 전까지)
  const [skinBusy, setSkinBusy] = useState(false);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeOpen, setBadgeOpen] = useState(false); // 배지 창
  // 가방이 닫히면 배지 창도 닫는다(다시 열 때 겹쳐 뜨지 않게)
  if (!open && badgeOpen) setBadgeOpen(false);
  const [frameNow, setFrameNow] = useState(null); // 방금 저장한 테두리(서버 값이 오기 전까지)
  const [frameBusy, setFrameBusy] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => { setSkinNow(null); }, [cardSkin]);
  const curSkin = skinNow ?? cardSkin;
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
  const saveSkin = async (skin) => {
    if (skinBusy) return;
    setSkinBusy(true);
    try {
      const res = await fetch("/api/xp/card-skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skin }),
      }).then((r) => r.json()).catch(() => null);
      if (res?.success) {
        const next = res.data?.cardSkin || "";
        setSkinNow(next);
        onSkinChange?.(next);
        playTone(skin === SKIN_NONE ? 523 : 784, 0.07, "sine", 0.03);
        say(skin === SKIN_NONE ? "카드 스킨을 해제했습니다" : `${SKIN_OF[skin]?.l || ""} 스킨을 착용했습니다`);
      } else {
        playTone(220, 0.09, "square", 0.02);
        say(res?.error || "저장하지 못했습니다");
      }
    } finally {
      setSkinBusy(false);
    }
  };
  const saveFrame = async (frame) => {
    if (frameBusy) return;
    setFrameBusy(true);
    try {
      const res = await fetch("/api/xp/avatar-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frame }),
      }).then((r) => r.json()).catch(() => null);
      if (res?.success) {
        const next = res.data?.avatarFrame || "";
        setFrameNow(next);
        onFrameChange?.(next);
        playTone(frame === SKIN_NONE ? 523 : 784, 0.07, "sine", 0.03);
        say(frame === SKIN_NONE ? "아바타 테두리를 해제했습니다" : `${FRAME_OF[frame]?.l || ""} 테두리를 착용했습니다`);
      } else {
        playTone(220, 0.09, "square", 0.02);
        say(res?.error || "저장하지 못했습니다");
      }
    } finally {
      setFrameBusy(false);
    }
  };
  // 📌 배지 창 저장 — 단 배지 전체를 이 순서로(order). kind: "put" 달기 · "swap" 자리 바꿈 · "take" 떼기. 성공하면 true(실패면 창이 되돌린다)
  //    base: 창이 보고 있던 순서 — 서버 목록이 그새 바뀌었으면(다른 탭 · 역할 확인 실패로 빠져 보이던 배지) 409 + 지금 목록이 오고, 그 목록으로 다시 맞춘다
  const saveBadgeOrder = async (order, kind, base) => {
    if (badgeBusy) return false;
    setBadgeBusy(true);
    try {
      const res = await fetch("/api/xp/badge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, base }),
      }).then((r) => r.json()).catch(() => null);
      if (res?.success) {
        onBadgesChange?.(Array.isArray(res.data?.badges) ? res.data.badges : []);
        playTone(kind === "take" ? 523 : kind === "swap" ? 659 : 784, 0.07, "sine", 0.03);
        say(kind === "take" ? "배지를 뗐습니다" : kind === "swap" ? "자리를 바꿨습니다" : "배지를 달았습니다");
        return true;
      }
      if (Array.isArray(res?.data?.badges)) onBadgesChange?.(res.data.badges);
      // 3개를 넘기면 서버가 409 와 안내 문구를 준다
      playTone(220, 0.09, "square", 0.02);
      say(res?.error || "저장하지 못했습니다");
      return false;
    } finally {
      setBadgeBusy(false);
    }
  };
  const openBadges = () => { setBadgeOpen(true); playTone(660, 0.06, "sine", 0.03); };
  const closeBadges = useCallback(() => { setBadgeOpen(false); playTone(523, 0.06, "sine", 0.025); }, []);
  // 정렬 — 보는 사람 브라우저에 기억(편의용). 못 읽으면 기본
  const [sort, setSort] = useState("default");
  useEffect(() => {
    try { const v = localStorage.getItem(INV_SORT_KEY); if (INV_SORTS.some((o) => o.v === v)) setSort(v); } catch {}
  }, []);
  const pickSort = (v) => {
    setSort(v);
    onTone();
    try { localStorage.setItem(INV_SORT_KEY, v); } catch {}
  };

  const active = groups.find((g) => g.id === tab) || groups[0];
  const rows = useMemo(() => sortInvRows(active?.items || [], sort), [active, sort]);
  // 열 때 · 탭을 바꿀 때 첫 아이템을 골라 둔다 — 왼쪽 칸이 비지 않게
  useEffect(() => {
    if (!open) { setSel(null); return; }
    setSel((cur) => (cur && rows.some((r) => r.uid === cur) ? cur : rows[0]?.uid ?? null));
  }, [open, tab, rows[0]?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  // uid 로 되짚는다 — 30초 폴링이 배열을 갈아끼워도 엉뚱한 것을 가리키지 않는다
  const selItem = sel ? rows.find((r) => r.uid === sel) || null : null;
  const slots = Math.max(20, Math.ceil(rows.length / 5) * 5); // 5열 × 4줄 — 커진 창을 채운다

  return (
    <>
    <PopShell
      open={open}
      onClose={onClose}
      title="인벤토리"
      count={groups[0]?.items.length ?? 0}
      icon="bag"
      // 📌 불러오는 동안은 탭 줄 높이만 잡아 둔다 — 목록이 오면서 탭 줄이 생겨 본문이 한 번 밀려 내려가지 않게
      tabs={groups.length > 1 ? groups.map((g) => (
        <PopTab key={g.id} on={active?.id === g.id} onClick={() => { onTab(g.id); setSel(null); onTone(); }} label={g.label} n={g.items.length} />
      )) : loading ? <span aria-hidden className="h-8"></span> : null}
      left={
        <>
        {selItem ? (
          <InvDetail it={selItem} onGo={onClose} skinOn={!!selItem.skinKey && selItem.skinKey === curSkin} skinCur={curSkin} onSkin={saveSkin} skinBusy={skinBusy}
            badgeSlot={selItem.badgeId ? wornIds.indexOf(selItem.badgeId) : -1} onBadgeOpen={openBadges}
            frameOn={!!selItem.frameKey && selItem.frameKey === curFrame} frameCur={curFrame} onFrame={saveFrame} frameBusy={frameBusy} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-6 sm:py-0">
            <span aria-hidden className="w-14 h-14 rounded-2xl border border-dashed border-white/15 flex items-center justify-center mb-3">
              <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.6">
                <path d={ICON_PATHS.bag} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[11px] font-bold text-white/30 break-keep">칸을 누르면 여기에 보입니다</p>
          </div>
        )}
        {onReset && <div className="mt-auto pt-5"><AdminReset onReset={onReset} busy={resetBusy} label="관리자 · 상점 구매 초기화" /></div>}
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
      {(groups[0]?.items.length ?? 0) > 1 && (
        <div role="radiogroup" aria-label="정렬" aria-hidden={rows.length > 1 ? undefined : true} className={`flex justify-end items-center gap-0.5 mb-2.5 -mt-1 ${rows.length > 1 ? "" : "invisible"}`}>
          {INV_SORTS.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={sort === o.v} onClick={() => pickSort(o.v)}
              className={`h-7 px-2 rounded-md text-[11px] font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${sort === o.v ? "text-white" : "text-white/35 hover:text-white/70"}`}>
              {o.l}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
        {Array.from({ length: slots }, (_, i) => {
          const it = rows[i];
          if (!it) {
            // 📌 빈 칸은 줄 높이에 맞춰 늘린다 — 좁은 폰에서 이름 두 줄 + 상태 줄 자리로 채운 칸이 정사각형보다 조금 길어져도 같은 줄 바닥이 맞게
            return <div key={`empty-${i}`} className="aspect-square w-full self-stretch rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02]"></div>;
          }
          const on = sel === it.uid;
          return <InvSlot key={it.uid || `i-${i}`} it={it} on={on} onClick={() => { setSel(on ? null : it.uid); onTone(); }} />;
        })}
      </div>

      {/* invGroups 는 보유 0개면 [] 를 돌려준다 — groups[0] 로 판정하면 신규 유저에게 문구가 안 뜬다 */}
      {rows.length === 0 && (
        <p className="text-[12px] font-bold text-white/35 text-center mt-6">{loading ? "불러오는 중…" : error || "아직 보유한 아이템이 없습니다"}</p>
      )}
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

// 📌 그 자리에서 여는 인벤토리 — 내 정보 · ARCTIC 이 쓴다. 열 때마다 /api/shop/my-items 를 새로 읽는다.
//    처음 읽기 전에는 빈 가방 문구 대신 불러오는 중. 여닫는 소리는 레벨 가방과 같다(낮은음 → 높은음 / 반대).
export function InventoryPopup({ open, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const skinSaved = useRef({ at: 0, v: "" }); // 마지막 스킨 저장(keepSavedSkin)
  const badgeSaved = useRef({ at: 0, v: [] }); // 마지막 배지 저장(keepSavedBadges)
  const frameSaved = useRef({ at: 0, v: "" }); // 마지막 테두리 저장(keepSavedFrame)
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
        if (d?.success) setData((cur) => mergeMyItems(cur, keepSavedFrame(keepSavedBadges(keepSavedSkin(d.data, t0, skinSaved.current), t0, badgeSaved.current), t0, frameSaved.current)));
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
