"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { itemTypeLabel, itemTypeColor } from "@/lib/items";
import { playTone } from "@/lib/sfx";
import ItemIcon from "./ItemIcon";
import TierEmblem from "./TierEmblem";
import { VOICE_TIERS } from "@/lib/voiceTiers";
import { ICON_PATHS } from "./Icons";
import { PopShell, PopTab, AdminReset } from "./PopShell";
import { SKIN_OF, SKIN_NONE } from "@/lib/itemEffects";

// 📌 인벤토리 — 레벨 대시보드의 가방 팝업을 내 정보 · ARCTIC 에서도 그 자리에 띄운다 (다른 화면으로 넘기지 않는다)

// 📌 인벤토리 분류 — 아이템 등록의 유형(type)이 기준이다. 레벨 보상 역할만 따로 묶는다.
//    탭 순서는 이 표를 따른다 (실제로 가진 분류만 만든다 — 빈 탭을 띄우지 않는다)
export const INV_GROUPS = [
  { id: "role", label: "역할" },
  { id: "perk", label: "권한" },
  { id: "item", label: "아이템" },
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
  if (it.days > 0) return `${base} · ${it.days}일 이용권`;
  return base;
};

export const invGroupOf = (it) => {
  if (it.source === "level") return INV_GROUPS[4];
  return INV_GROUPS.find((g) => g.id === (it.type || it.kind)) || INV_GROUPS[2];
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
// 기간제 — 만료는 결제 순간부터 정해져 있다(봇 지급이 늦어도 산 만큼 보장). 그래서 지급 대기여도 남은 기간을 센다
const ddayOf = (it) =>
  it.expiresAt ? Math.max(0, Math.ceil((new Date(it.expiresAt).getTime() - Date.now()) / 86400000)) : null;
const untilOf = (it) =>
  it.expiresAt
    ? new Date(it.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

// 칸 이름 아래 상태 · 기간 줄이 있는 항목 (지급 대기 · 확인 필요 · 기간제)
const hasSlotStatus = (it) => it.status === "pending" || it.status === "missing" || !!it.expiresAt;

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
              {[it.status === "pending" ? "지급 대기" : it.status === "missing" ? "확인 필요" : "", dday !== null ? `D-${dday}` : ""].filter(Boolean).join(" · ")}
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
const InvDetail = ({ it, compact = false, onGo, skinOn = false, onSkin, skinBusy = false }) => {
  const accent = invAccentOf(it);
  const dday = ddayOf(it);
  const lines = Array.isArray(it.effectLines) ? it.effectLines.filter(Boolean) : [];
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
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-bold text-white/45">기간</span>
          <span className="text-[12px] font-black text-white/80 tabular-nums">
            {it.expiresAt ? `${it.days > 0 ? `${it.days}일 · ` : ""}기간제` : "영구"}
          </span>
        </div>
        {it.expiresAt && (
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
          <button type="button" disabled={skinBusy} onClick={() => onSkin?.(skinOn ? SKIN_NONE : it.skinKey)}
            className={`mt-1 w-full h-9 rounded-full text-[11px] font-black flex items-center justify-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60 ${
              skinOn ? "border border-white/20 hover:border-white/45 text-white/80 hover:text-white" : "bg-white text-[#131313] hover:bg-white/90"
            }`}>
            {skinOn ? "착용 해제" : "착용"}
          </button>
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

// 📌 가방 — 인벤토리를 대시보드에 펼치지 않고 오버레이로 연다.
//    껍데기는 TierModal 과 같은 문법(모바일 바텀시트 / 데스크톱 모달, 잉크 패널).
//    스크롤 잠금은 손대지 않는다 — 루트 className 에 "fixed inset-0" 이 붙어 있고
//    z-index 가 50 이상이면 ScrollLock 이 알아서 건다(iOS 대응 포함).
// 📌 cardSkin: 서버(my-items)가 준 지금 쓰는 스킨 키("" 이면 기본 카드). 착용 · 해제는 가방이 직접 저장하고(POST /api/xp/card-skin)
//    결과를 바로 보여 준다 — 다음 폴링으로 같은 값이 오면 그대로. onSkinChange(키) 가 있으면 부모에도 알린다(프로필 카드 장식)
export const BagOverlay = ({ open, onClose, groups, tab, onTab, synced, onTone, onReset, resetBusy, loading = false, error = "", cardSkin = "", onSkinChange }) => {
  const [sel, setSel] = useState(null); // 선택한 아이템 uid
  const [skinNow, setSkinNow] = useState(null); // 방금 저장한 값(서버 값이 오기 전까지)
  const [skinBusy, setSkinBusy] = useState(false);
  const [toast, setToast] = useState("");
  useEffect(() => { setSkinNow(null); }, [cardSkin]);
  const curSkin = skinNow ?? cardSkin;
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
          <InvDetail it={selItem} onGo={onClose} skinOn={!!selItem.skinKey && selItem.skinKey === curSkin} onSkin={saveSkin} skinBusy={skinBusy} />
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

// 📌 그 자리에서 여는 인벤토리 — 내 정보 · ARCTIC 이 쓴다. 열 때마다 /api/shop/my-items 를 새로 읽는다.
//    처음 읽기 전에는 빈 가방 문구 대신 불러오는 중. 여닫는 소리는 레벨 가방과 같다(낮은음 → 높은음 / 반대).
export function InventoryPopup({ open, onClose }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("all");
  const skinSaved = useRef({ at: 0, v: "" }); // 마지막 스킨 저장(keepSavedSkin)
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
        if (d?.success) setData((cur) => mergeMyItems(cur, keepSavedSkin(d.data, t0, skinSaved.current)));
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
    />
  );
}
