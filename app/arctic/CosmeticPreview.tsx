"use client";

import React, { useEffect, useRef, useState } from "react";
import SkinFrame from "../components/SkinFrame";
import TierEmblem from "../components/TierEmblem";
import ItemIcon from "../components/ItemIcon";
import { RingGauge } from "../components/Hud";
import { VOICE_TIERS, getTierIndex } from "@/lib/voiceTiers";
import { getCumulativeXpByLevel } from "@/lib/leveling";
import { currentSeason } from "@/lib/season";
import { itemTypeColor } from "@/lib/items";
import { MAX_BADGES } from "@/lib/itemEffects";
import { COSMETIC_SAMPLE } from "@/lib/cosmeticSample";

// 📌 꾸미기 상품의 '적용 모습' 부품 — 상품 상세 갤러리(ItemGallery)가 큰 칸 · 썸네일에 같은 부품을 줄여 넣는다.
//    레벨 페이지 프로필 카드 · 프로필 헤더 · 랭킹 줄과 같은 모양을 가볍게 다시 그린 것(그 화면들을 통째로 옮기지 않는다 — 고칠 때 모양만 맞춘다).
//    크기는 고정 폭(PC 모양) 한 벌 — 칸에 맞추는 건 FitBox 가 transform 으로 줄인다(글자 줄바꿈이 칸마다 달라지지 않게).

export type Badge = { itemId: string; name: string; icon: string; imageUrl: string; color: string; type: string };
// 미리보기의 사람 — 로그인했으면 나(/api/xp/me), 아니면 예시(lib/cosmeticSample.js — 디스코드 카드와 같은 값)
export type Who = {
  name: string; image: string; level: number; rank: number; total: number; xp: number;
  cur: number; req: number; need: number; attendCount: number; voiceSeconds: number; badges: Badge[];
};

// /api/xp/me 의 data 중 미리보기가 쓰는 칸
type MeData = {
  level?: number; rank?: number; total?: number; xp?: number; attendCount?: number; voiceSeconds?: number;
  levelProgress?: { current?: number; required?: number; needToNext?: number }; badges?: Badge[];
};
export type ShopItemLike = { _id?: unknown; itemId?: string; name?: string; icon?: string; itemImageUrl?: string; color?: string; type?: string };

export function whoOf(user: { name?: string | null; image?: string | null } | null | undefined, meRaw: unknown): Who {
  const me = meRaw && typeof meRaw === "object" ? (meRaw as MeData) : null;
  if (user && me) {
    const lp = me.levelProgress || {};
    return {
      name: String(user.name || ""), image: String(user.image || ""),
      // 레벨은 0 부터(새 유저) — 레벨 페이지 카드처럼 받은 값 그대로
      level: Math.max(0, Math.floor(Number(me.level) || 0)), rank: Number(me.rank) || 0, total: Number(me.total) || 0, xp: Number(me.xp) || 0,
      cur: Number(lp.current) || 0, req: Math.max(1, Number(lp.required) || 1), need: Number(lp.needToNext) || 0,
      attendCount: Number(me.attendCount) || 0, voiceSeconds: Number(me.voiceSeconds) || 0,
      badges: Array.isArray(me.badges) ? me.badges : [],
    };
  }
  const s = COSMETIC_SAMPLE;
  const base = getCumulativeXpByLevel(s.level);
  const req = getCumulativeXpByLevel(s.level + 1) - base;
  const cur = Math.floor(req * s.progress);
  return {
    name: s.name, image: "/logo.png", level: s.level, rank: s.rank, total: s.total, xp: base + cur,
    cur, req, need: req - cur, attendCount: s.attendCount, voiceSeconds: s.voiceSeconds, badges: [],
  };
}

// 상품의 배지 그림 — 상품에 복사된 등록 아이템 스냅샷(icon · itemImageUrl · color · type). 상품 고유 이미지(imageUrl)는 배지가 아니다
export const badgeOfItem = (it: ShopItemLike): Badge => ({
  itemId: String(it?.itemId || it?._id || ""), name: String(it?.name || ""), icon: String(it?.icon || ""),
  imageUrl: String(it?.itemImageUrl || ""), color: String(it?.color || ""), type: String(it?.type || "cosmetic"),
});

// 📌 칸에 맞춰 줄이기 — 안의 부품은 제 크기(고정 폭)로 그리고, 칸 폭 · 높이의 pad 배 안에 들어가게 transform 으로만 줄인다(가운데).
//    재기 전 한 번은 숨긴다. 칸 크기는 바깥이 정하므로 아무것도 밀지 않는다. 부모는 relative overflow-hidden
export function FitBox({ children, pad = 0.86, max = 1.25 }: { children: React.ReactNode; pad?: number; max?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      const W = o.clientWidth, H = o.clientHeight, w = i.offsetWidth, h = i.offsetHeight;
      if (W && H && w && h) setScale(Math.min(max, (W * pad) / w, (H * pad) / h));
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [pad, max]);
  return (
    <div ref={outer} aria-hidden className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none">
      <div ref={inner} className="shrink-0" style={{ transform: `scale(${scale || 1})`, visibility: scale ? "visible" : "hidden" }}>
        {children}
      </div>
    </div>
  );
}

// 등급 색 → 반투명(카드의 등급 빛) / 흰색 쪽으로 밝히기(등급 이름 그라데이션) — 레벨 페이지와 같은 계산
const hexA = (hex: string, a: number) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})` : `rgba(255,255,255,${a})`;
};
const hexLift = (hex: string, t: number) => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  const f = (h: string) => Math.round(parseInt(h, 16) + (255 - parseInt(h, 16)) * t).toString(16).padStart(2, "0");
  return `#${f(m[1])}${f(m[2])}${f(m[3])}`;
};
const fmtVoiceTime = (sec: number) => {
  const min = Math.floor((sec || 0) / 60);
  return min < 60 ? `${min}분` : `${Math.floor(min / 60).toLocaleString()}시간`;
};
// 레벨 페이지 카드의 옅은 격자(lux-grid-bg-dark) — 그 화면의 style 태그에 있어 여기선 인라인으로
const GRID_DARK: React.CSSProperties = {
  backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
  backgroundSize: "46px 46px",
  WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%)",
  maskImage: "radial-gradient(ellipse 90% 70% at 30% 0%, black 30%, transparent 100%)",
};

function Avatar({ who, px, text }: { who: Who; px: number; text: string }) {
  return who.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={who.image} alt="" draggable={false} className="rounded-full object-cover bg-white/10" style={{ width: px, height: px }} />
  ) : (
    <span className={`rounded-full bg-white/10 flex items-center justify-center font-black text-white/60 ${text}`} style={{ width: px, height: px }}>
      {(who.name || "?").slice(0, 1)}
    </span>
  );
}

// ── 카드 스킨 — 레벨 페이지 프로필 카드(PC 모양)와 같은 잉크 판에 SkinFrame 으로 스킨을 입힌다 ──
export function ProfileCardPreview({ who, skin }: { who: Who; skin: string }) {
  const tIdx = getTierIndex(who.level);
  const tier = VOICE_TIERS[tIdx];
  const next = VOICE_TIERS[tIdx + 1] || null;
  const pct = Math.min(100, Math.floor((who.cur / Math.max(1, who.req)) * 100));
  const topPct = who.total ? Math.max(1, Math.ceil((who.rank / who.total) * 100)) : null;
  const max = who.level >= 1000;
  const stats = [
    { l: "누적 XP", v: who.xp.toLocaleString() },
    { l: "누적 출석", v: `${who.attendCount.toLocaleString()}일` },
    { l: "누적 음성 시간", v: fmtVoiceTime(who.voiceSeconds) },
    { l: "시즌", v: `S${currentSeason().number}` },
  ];
  return (
    <div
      className="relative rounded-3xl overflow-hidden shadow-[0_30px_70px_-30px_rgba(0,0,0,0.5)] text-left"
      style={{
        width: 360,
        background: `radial-gradient(420px 320px at 86% 30%, ${hexA(tier.c, 0.26)} 0%, ${hexA(tier.c, 0)} 72%), linear-gradient(180deg, #1b1b1b 0%, #131313 55%)`,
      }}
    >
      <div className="absolute inset-0 opacity-70 pointer-events-none" style={GRID_DARK}></div>
      {skin && <SkinFrame skin={skin} />}
      <span className="absolute -right-3 -bottom-10 text-[150px] font-black text-white/[0.035] leading-none tracking-tighter tabular-nums select-none pointer-events-none">{who.level}</span>

      <div className="relative z-10 p-7">
        {/* 정체성 — 아바타(진행 링) 옆에 이름 · 랭크 칩 */}
        <div className="flex items-center gap-5">
          <RingGauge pct={pct} size={96} stroke={6} trackClass="rgba(255,255,255,0.12)">
            <Avatar who={who} px={68} text="text-2xl" />
          </RingGauge>
          <div className="min-w-0 flex-1">
            <p className="max-w-full text-[26px] font-black text-white truncate tracking-tight leading-none">{who.name}</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center h-6 px-2.5 rounded-full border border-white/20 text-[11px] font-bold text-white/75 tabular-nums">
                랭크 #{who.rank.toLocaleString()}<span className="text-white/40 ml-1">/ {who.total.toLocaleString()}</span>
              </span>
              {topPct != null && (
                <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-[#e91e3f] text-[11px] font-bold text-white tabular-nums">상위 {topPct}%</span>
              )}
            </div>
          </div>
        </div>

        {/* 레벨 · 등급 */}
        <div className="mt-7 pt-6 border-t border-white/10">
          <p className="text-[10px] font-black tracking-[0.35em] text-white/40 uppercase mb-2.5">LEVEL</p>
          <p className="text-6xl font-black text-white tabular-nums tracking-[-0.04em] leading-[0.85]">{who.level}</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="shrink-0"><TierEmblem tier={tier} size={32} /></span>
            <div className="min-w-0 flex-1">
              <p
                className="text-[18px] font-black tracking-tight leading-none truncate"
                style={{ backgroundImage: `linear-gradient(180deg, ${hexLift(tier.c, 0.45)} 0%, ${tier.c} 100%)`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: tier.c }}
              >
                {tier.name}
              </p>
              {next && (
                <p className="text-[11px] font-bold text-white/50 mt-1.5 truncate tabular-nums">
                  <span style={{ color: hexLift(next.c, 0.15) }}>{next.name}</span>까지 {Math.max(0, next.min - who.level)}레벨
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 경험치 */}
        <div className="mt-6">
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[#e91e3f]" style={{ width: `${max ? 100 : pct}%` }}></div>
          </div>
          <div className="flex justify-between items-baseline mt-2.5">
            <span className="text-[11px] font-bold text-white/45 tabular-nums">{who.cur.toLocaleString()} / {who.req.toLocaleString()} XP</span>
            <span className="text-[11px] font-bold text-white/60">
              {max ? "MAX" : <>Lv {who.level + 1} 까지 <b className="text-white tabular-nums">{who.need.toLocaleString()} XP</b></>}
            </span>
          </div>
        </div>

        {/* 스탯 — 두 줄 두 칸 */}
        <div className="grid grid-cols-2 mt-4 pt-2 border-t border-white/10">
          {stats.map((st, i) => (
            <div key={st.l} className={`min-w-0 py-3 ${i % 2 === 0 ? "pr-4 border-r border-white/10" : "pl-4"}`}>
              <p className="text-[11px] font-bold text-white/45 mb-2 truncate">{st.l}</p>
              <p className="text-lg font-black text-white tabular-nums tracking-tight leading-none truncate">{st.v}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const BadgeIcons = ({ list, size, gap }: { list: Badge[]; size: number; gap: string }) => (
  <span className={`shrink-0 inline-flex items-center ${gap}`}>
    {list.map((b, i) => (
      <span key={b.itemId || i} className="inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <ItemIcon icon={b.icon} imageUrl={b.imageUrl} type={b.type} size={size} color={b.color || itemTypeColor(b.type)} />
      </span>
    ))}
  </span>
);

// ── 프로필 배지 — 프로필 헤더(이름 옆 28px)와 랭킹 한 줄(이름 옆 16px). 이 상품의 배지가 맨 앞, 내가 단 배지는 그 뒤(최대 MAX_BADGES) ──
export function BadgePreview({ who, badge }: { who: Who; badge: Badge }) {
  const tier = VOICE_TIERS[getTierIndex(who.level)];
  const list = [badge, ...who.badges.filter((b) => b && b.itemId !== badge.itemId)].slice(0, MAX_BADGES);
  const pct = Math.min(1, Math.max(0, who.cur / Math.max(1, who.req)));
  const C = 2 * Math.PI * 46; // 링 둘레 (viewBox 100, r 46) — 프로필 헤더와 같다
  const medal = who.rank > 0 && who.rank <= 3;
  return (
    <div className="text-left" style={{ width: 360 }}>
      {/* 프로필 헤더 — 잉크 띠 · 사진(레벨 링 · Lv 배지) · 이름 옆 배지 · 등급 줄 */}
      <div className="relative overflow-hidden rounded-3xl bg-[#131313] text-white px-6 py-6">
        <div
          className="absolute inset-0 pointer-events-none opacity-60"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        ></div>
        <div className="relative z-10 flex items-center">
          <div className="relative shrink-0 w-20 h-20">
            <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
              <circle cx="50" cy="50" r="46" fill="none" stroke="#e91e3f" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
            </svg>
            <span className="absolute" style={{ inset: 10 }}><Avatar who={who} px={60} text="text-xl" /></span>
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 inline-flex items-center h-6 px-2.5 rounded-full bg-[#e91e3f] text-white text-[12px] font-black tabular-nums whitespace-nowrap ring-[3px] ring-[#131313]">
              Lv.{who.level.toLocaleString()}
            </span>
          </div>
          <div className="min-w-0 flex-1 ml-5">
            <div className="flex items-center gap-2 min-w-0">
              <p className="min-w-0 text-[22px] font-black text-white tracking-tight leading-tight truncate">{who.name}</p>
              <BadgeIcons list={list} size={28} gap="gap-1" />
            </div>
            <p className="mt-1.5 flex items-center gap-x-1.5 text-[12px] font-bold text-white/65 tabular-nums">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tier.c }}></span>
              <span className="text-white">{tier.name}</span>
              <span>·</span>
              <span>서버 #{who.rank ? who.rank.toLocaleString() : "—"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* 랭킹 한 줄 — 순위 · 이름 옆 배지 · 레벨 · XP */}
      <div className="mt-3 flex items-center gap-3.5 py-3.5 pr-4 rounded-2xl bg-white border border-[#ededed]">
        <span className={`shrink-0 w-9 text-center tabular-nums ${medal ? "text-[15px] font-black text-[#e91e3f]" : "text-[13px] font-black text-[#a3a3a3]"}`}>
          {who.rank || "—"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 min-w-0 text-[13px] font-black text-[#131313]">
            <span className="min-w-0 truncate">{who.name}</span>
            <BadgeIcons list={list} size={16} gap="gap-0.5" />
          </p>
          <p className="text-[11px] text-[#a3a3a3] tabular-nums mt-0.5">Lv.{who.level}</p>
        </div>
        <span className="shrink-0 text-[13px] font-black text-[#131313] tabular-nums">{who.xp.toLocaleString()} XP</span>
      </div>
    </div>
  );
}
