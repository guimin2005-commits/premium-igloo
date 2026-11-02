"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { currentSeason, seasonStartMs, seasonEndMs, getSeasonDday } from "@/lib/season";
import { isPointOnly, shownPrice, cardPrice } from "@/lib/shopPricing";
import { productIconOf } from "@/lib/cosmeticArt";
import { itemTypeColor } from "@/lib/items";
import ItemIcon from "../components/ItemIcon";
import AvatarFrame from "../components/AvatarFrame";
import { whoOf } from "../arctic/CosmeticPreview";
import { EquipCard } from "../components/Inventory";
import { passShortName } from "./PassPreview";
import { MAP_ART, MapPix, isleArt } from "./seasonMapArt";

// 📌 「시즌」 넓은 판(2026-11-02 운영자 "시즌에 대한 정보 같은 걸 넣고 싶긴해" → 간판 · 진행표 · 성적표 · 소개 넷 다, 시안 2 "해바").
//    ① 간판 — 시즌 패스 배너(시즌마다 그림이 있으면) + 기간 · 남은 날
//    ② 진행 — 시작 ━ 지금 ━ 결산 한 줄 위에 이벤트 기간 띠(이벤트 글 /api/posts?category=이벤트 의 eventPeriod — 끝난 것도 남는다). 폰은 세로 일정표
//    ③ 내 시즌 기록 — 시즌 누적 XP · 최고 레벨 · 누적 순위 · 시즌 패스 단계(PC 네 칸 한 줄 · 폰 2 × 2). 「지난 시즌 ›」은 「기록」 지난 시즌으로(onPast)
//    ④ 시즌 보상 — 지금 등급으로 받을 프로필 테두리 · 랭크 깃발 카드 테두리, 둘만 크게(운영자 "받는 걸 보여주던가" · "테두리들만 잘 보이게"). 봇 처리는 시즌 종료 순간 레벨 기준(아이언은 없음)
//    ⑤ 시즌 패스 — 단계 길(1 ~ 끝 단계 점 · 내 단계 빨강) 위에 보상 아이템을 그 단계 자리에(받은 것 ✓). 폰은 옆으로 넘기는 길(열면 내 단계 쪽으로)
//    ⑥ 시즌 상점 — 빙옥 전용(pointOnly) 상품, PC 여섯 칸 · 폰 옆으로 넘기는 줄(운영자 "모바일만의 UI"), 누르면 상품 화면
//    📌 2026-11-02 아래(기록 + 시즌 한정 두 단)는 운영자 "별로다" → 시안 A 「패스 길」 합격("A가 괜찮누")
//    설명 문장은 두지 않는다(라벨 · 숫자만). 화면 글에 「 · 」로 말을 잇지 않는다

// 시즌마다 간판 그림(없으면 글자 간판)
const SEASON_BANNER = { 2: { pc: "/banners/season2-pass-pc.png", m: "/banners/season2-pass-mobile.png" } };
const DAY = 86400000;
const KST = 9 * 60 * 60 * 1000;
const md = (iso) => String(iso || "").slice(5, 10).replace("-", ".");
const mdOf = (ms) => md(new Date(ms + KST).toISOString());
// "2026.10.26" → 그날 00:00 KST
const dotMs = (d) => {
  const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(String(d || "").trim());
  return m ? Date.parse(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T00:00:00+09:00`) : NaN;
};
// 띠 이름 — 「…<유령 펭귄의 초대>…」면 꺾쇠 안, 아니면 [머리말] · 그림 글자를 뗀 제목
const bandLabel = (t) => {
  const s = String(t || "");
  const inner = /<([^>]+)>/.exec(s);
  return (inner ? inner[1] : s.replace(/\[[^\]]*\]/g, "")).replace(/\p{Extended_Pictographic}/gu, "").replace(/\s+/g, " ").trim();
};

// 시즌 패스 단계 길 치수(px) — pad: 양 끝 여백, ty: 길 높이, tile/ic: 보상 칸 · 그림, top: 칸 위치, gap: 폰 단계 간격
const T_PC = { pad: 38, ty: 140, tile: 72, ic: 48, top: 10 };
const T_PH = { pad: 28, ty: 124, tile: 52, ic: 32, top: 8, gap: 62 };

// 시즌 상점 목록 — 한 번 읽어 두고(판을 다시 열 때 또 읽지 않게) 빙옥 전용만
let shopCache = null;

export default function SeasonView({ me, guest, user, todayTotal, seasonTotal, seasonRank, seasonMembers, passEnabled, passTiers, passTierNo, passMaxTier, eventPosts, tierCur, canSeeShop, onPast, onPass }) {
  const s = currentSeason();
  const S = seasonStartMs(s), E = seasonEndMs(s);
  const dday = getSeasonDday();
  const banner = SEASON_BANNER[s.number];
  const [nowMs] = useState(() => Date.now());
  const todayMd = mdOf(nowMs);

  const who = useMemo(() => whoOf(user, me, todayTotal ?? null), [user, me, todayTotal]);

  // ② 진행 — 이벤트 글 기간(시즌 안으로 자름)
  const bands = useMemo(() => (Array.isArray(eventPosts) ? eventPosts : []).flatMap((p) => {
    const [a = "", b = ""] = String(p?.eventPeriod || "").split("~").map((x) => x.trim());
    const start = dotMs(a);
    if (!Number.isFinite(start)) return [];
    const always = !b || b === "상시";
    const endDay = always ? NaN : dotMs(b);
    const end = always ? E : Number.isFinite(endDay) ? endDay + DAY - 1 : NaN;
    if (!Number.isFinite(end) || end < S || start > E) return [];
    const label = bandLabel(p?.title);
    return label ? [{ id: p._id || label, label, start: Math.max(start, S), end: Math.min(end, E), rawStart: start, endDay: always ? NaN : endDay, always }] : [];
  }).sort((x, y) => x.start - y.start || x.end - y.end), [eventPosts, S, E]);
  // 남은 날 — 「오늘」 탭 이벤트 판(eventDdayOf)과 같은 셈: 종료일 − 오늘(KST 날짜), 0 이면 D-DAY
  const todayStart = Date.parse(`${new Date(nowMs + KST).toISOString().slice(0, 10)}T00:00:00+09:00`);
  const dLeft = (endDay) => Math.max(0, Math.round((endDay - todayStart) / DAY));
  const dTag = (n) => (n <= 0 ? "D-DAY" : `D-${n}`);
  // 진행 중 — 시작했고 아직 안 끝난 이벤트(남은 날 막대)
  const live = bands.filter((b) => b.start <= nowMs && nowMs <= b.end);

  // 📌 항로 지도 — 물결 한 줄(y 를 x 의 식으로). 점(깃발 · 섬 · 종료 점 · 차원문)은 모두 그 선 위, 지나온 흰 점선은 같은 선을 따라 내 자리에서 멈춘다.
  //    x 는 0~1000(화면 폭에 맞춰 늘어남 — 선 굵기 · 점 간격은 vector-effect 로 그대로), y 는 px(높이 고정 260)
  const X0 = 50, X1 = 950, MAP_H = 260;
  const xOf = (ms) => X0 + Math.max(0, Math.min(1, (ms - S) / (E - S))) * (X1 - X0);
  const yOf = (x) => 136 + 30 * Math.sin(((x - X0) / (X1 - X0)) * Math.PI * 2.2 + 0.4);
  const route = (xa, xb) => { const p = []; for (let x = xa; x < xb; x += 6) p.push(`${x.toFixed(1)},${yOf(x).toFixed(1)}`); p.push(`${xb.toFixed(1)},${yOf(xb).toFixed(1)}`); return p.join(" "); };
  const mapNodes = useMemo(() => {
    const n = [];
    // 이벤트 시작 — 같은 날은 한 섬(시즌 첫날 시작은 깃발이 대신)
    const byDay = new Map();
    for (const b of bands) { if (b.rawStart <= S) continue; const k = mdOf(b.start); byDay.set(k, { ms: b.start, l: [...(byDay.get(k)?.l || []), b.label] }); }
    for (const [d, v] of byDay) n.push({ k: "isle", ms: v.ms, d, l: v.l });
    // 앞으로 올 종료 — 같은 날은 한 점, 가까운 것부터 셋
    const ends = new Map();
    for (const b of bands) { if (b.always || !(b.end > nowMs) || b.end >= E || dLeft(b.endDay) < 7) continue; // 일주일 안에 끝나는 건 지도 대신 아래 진행 중 줄에(비공정과 겹치지 않게)
      const k = mdOf(b.endDay); ends.set(k, { ms: b.endDay, l: [...(ends.get(k)?.l || []), `${b.label} 종료`], dd: dLeft(b.endDay) }); }
    [...ends].sort((p, q) => p[1].ms - q[1].ms).slice(0, 3).forEach(([d, v]) => n.push({ k: "fut", ms: v.ms, d, l: v.l, dd: v.dd }));
    return n.sort((p, q) => p.ms - q.ms).map((v, i) => ({ ...v, up: i % 2 === 0 }));
  }, [bands, S, E, nowMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowX = xOf(nowMs);
  // 이벤트 섬 차례 — 날짜 → 몇 번째 이벤트 섬(섬 그림 세 벌이 돌아가며)
  const isleN = useMemo(() => new Map(mapNodes.filter((v) => v.k === "isle").map((v, i) => [v.d, i])), [mapNodes]);
  // 폰 세로 항로 — 시작 · 이벤트 시작 · 내 자리 · 앞으로 올 종료 · 시즌 종료를 날짜 순서로
  const vrows = useMemo(() => {
    const r = [{ k: "start", ms: S, d: md(s.start), l: "시즌 시작" }];
    for (const v of mapNodes) r.push({ k: v.k, ms: v.ms, d: v.d, l: v.l.join(" · "), tail: v.k === "fut" ? dTag(v.dd) : "" });
    r.push({ k: "me", ms: nowMs, d: todayMd, l: "" });
    r.push({ k: "end", ms: E, d: md(s.end), l: "시즌 종료", tail: dday.ended ? "" : `D-${dday.days}` });
    return r.sort((x, y) => x.ms - y.ms);
  }, [mapNodes, S, E, s.start, s.end, nowMs, todayMd, dday.ended, dday.days]);

  // ⑤ 시즌 패스 보상 아이템 — 같은 아이템은 처음(가장 낮은 단계) 한 번 · 그 단계 번호 · 받았나(그 단계의 어느 트랙에서든 받음)
  const passItems = useMemo(() => {
    const seen = new Map();
    (passTiers || []).forEach((t, i) => {
      const tier = Number(t.level) || i + 1;
      for (const track of [t.free, t.paid]) {
        for (const r of track?.rewards || []) {
          if (r.kind !== "item" || !r.itemId) continue;
          const cur = seen.get(r.itemId);
          if (!cur) seen.set(r.itemId, { ...r, tier, got: !!r.claimed });
          else if (r.claimed && cur.tier === tier) cur.got = true;
        }
      }
    });
    return [...seen.values()];
  }, [passTiers]);
  const passMax = Math.max(0, Number(passMaxTier) || 0);
  const passCur = Math.min(passMax, Math.max(0, Number(passTierNo) || 0));
  // 폰 단계 길 — 열면 내 단계가 화면 오른쪽 쯤에 오게 넘겨 둔다
  const trackRef = useRef(null);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || passCur < 1) return;
    el.scrollLeft = Math.max(0, T_PH.pad + (passCur - 1) * T_PH.gap - el.clientWidth * 0.62);
  }, [passCur, passMax]);

  // ⑤ 시즌 상점 — 빙옥 전용(ARCTIC 「시즌」 탭과 같은 거름)
  const [shop, setShop] = useState(shopCache);
  useEffect(() => {
    if (!canSeeShop || shopCache) return;
    let live = true;
    fetch("/api/shop/items", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const list = (Array.isArray(j?.data) ? j.data : Array.isArray(j?.items) ? j.items : []).filter(isPointOnly);
        shopCache = list;
        if (live) setShop(list);
      })
      .catch(() => { if (live) setShop([]); });
    return () => { live = false; };
  }, [canSeeShop]);

  // ④ 시즌 보상 — 지금 등급 키(아이언은 없음 — 브론즈를 흐리게 보여 주고 「Lv 90 이상」)
  const settleKey = tierCur?.key && tierCur.key !== "iron" ? tierCur.key : "bronze";
  const settleLocked = !tierCur?.key || tierCur.key === "iron";
  // 시즌 보상 크게 보기 창 — Esc · 바깥 누르기로 닫는다
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => { if (e.key === "Escape") setZoom(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const lv = Math.max(Number(me?.level) || 0, Number(me?.maxLevel) || 0);
  const stats = [
    { l: "시즌 누적 XP", v: seasonTotal == null ? "—" : Number(seasonTotal).toLocaleString() },
    { l: "최고 레벨", v: `Lv ${lv.toLocaleString()}` },
    { l: "순위", v: seasonRank > 0 ? `#${Number(seasonRank).toLocaleString()}` : "—", u: seasonRank > 0 && seasonMembers > 0 ? `/ ${Number(seasonMembers).toLocaleString()}` : "" },
    ...(passEnabled ? [{ l: "시즌 패스", v: `${Number(passTierNo || 0).toLocaleString()}`, u: `/ ${Number(passMaxTier || 0).toLocaleString()}` }] : []),
  ];

  const lk = "inline-flex items-center gap-0.5 text-[13px] font-black text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus-visible:underline";
  const head = (t, right) => (
    <div className="flex items-baseline justify-between gap-3 mb-3 lg:mb-4">
      <h3 className="text-[19px] lg:text-[20px] font-black tracking-tight">{t}</h3>
      {right}
    </div>
  );
  // ⑤ 단계 길 — PC 는 폭에 맞춰(calc), 폰은 단계 간격 고정 폭
  const track = (ph) => {
    const g = ph ? T_PH : T_PC;
    const frac = (i) => (passMax > 1 ? (i - 1) / (passMax - 1) : 0);
    const left = (i) => (ph ? g.pad + (i - 1) * g.gap : `calc(${g.pad}px + (100% - ${g.pad * 2}px) * ${frac(i)})`);
    const W = ph ? g.pad * 2 + g.gap * Math.max(0, passMax - 1) : "100%";
    const stem = g.ty - g.top - g.tile - 34;
    return (
      <div className="relative" style={{ width: W, height: g.ty + 34 }}>
        <span aria-hidden className="absolute h-1.5 rounded-full bg-[#ededed]" style={{ left: g.pad, right: g.pad, top: g.ty - 3 }}></span>
        {passCur > 1 && <span aria-hidden className="absolute h-1.5 rounded-full bg-[#131313]" style={{ left: g.pad, width: ph ? (passCur - 1) * g.gap : `calc((100% - ${g.pad * 2}px) * ${frac(passCur)})`, top: g.ty - 3 }}></span>}
        {passItems.map((r) => (
          <div key={r.itemId} className="absolute flex flex-col items-center -translate-x-1/2" style={{ left: left(r.tier), top: g.top }}>
            <span className="relative flex items-center justify-center rounded-[14px] bg-[#f4f4f5]" style={{ width: g.tile, height: g.tile }}>
              <ItemIcon icon={r.icon} imageUrl={r.imageUrl} type={r.itemType} size={g.ic} color={r.color || (r.itemType ? itemTypeColor(r.itemType) : undefined)} />
              {r.got && (
                <i role="img" aria-label="받음" className="absolute -right-1.5 -top-1.5 w-[22px] h-[22px] rounded-full bg-[#131313] ring-2 ring-white flex items-center justify-center">
                  <svg aria-hidden viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </i>
              )}
            </span>
            <b className="mt-1.5 text-[12px] font-black leading-4 whitespace-nowrap">{passShortName(r)}</b>
            <i aria-hidden className="block w-0.5 mt-1 bg-[#e1e1e4]" style={{ height: stem }}></i>
          </div>
        ))}
        {Array.from({ length: passMax }, (_, k) => {
          const i = k + 1, cur = i === passCur, done = i < passCur;
          return (
            <Fragment key={i}>
              <i aria-hidden className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 ${cur ? "w-[18px] h-[18px] bg-[#e91e3f] ring-[3px] ring-white z-[1]" : `w-2.5 h-2.5 ${done ? "bg-[#131313]" : "bg-[#d4d4d8]"}`}`} style={{ left: left(i), top: g.ty }}></i>
              <span aria-hidden className={`absolute -translate-x-1/2 leading-4 tabular-nums ${cur ? "text-[13px] font-black text-[#e91e3f]" : `text-[12px] font-extrabold ${done ? "text-[#131313]" : "text-[#b5b5b5]"}`}`} style={{ left: left(i), top: g.ty + 13 }}>{i}</span>
            </Fragment>
          );
        })}
      </div>
    );
  };
  // ⑥ 상점 칸 — 누르면 상품 화면. 값은 ARCTIC 카드와 같은 값(무제한 · 할인 반영)을 빙옥으로
  const shopCard = (it, ph) => {
    const fixed = productIconOf(it);
    const id = it._id || it.id;
    const pt = shownPrice(it, cardPrice(it));
    const price = <b className="shrink-0 text-[13px] font-black tabular-nums">{pt.toLocaleString()}<small className="ml-[3px] text-[10px] font-extrabold text-[#a3a3a3]">빙옥</small></b>;
    const kind = it.categoryLabel || "";
    return (
      <Link key={id || it.name} href={`/arctic/item/${id}`} className={`group block min-w-0 outline-none ${ph ? "shrink-0 w-[104px]" : ""}`}>
        <span className={`flex items-center justify-center rounded-[14px] bg-[#f4f4f5] transition-colors group-hover:bg-[#ececee] group-focus-visible:ring-2 group-focus-visible:ring-[#e91e3f]/40 ${ph ? "h-20" : "h-[88px]"}`}>
          <ItemIcon icon={fixed ? fixed.icon : it.icon} imageUrl={fixed ? fixed.imageUrl : it.imageUrl || it.itemImageUrl} type={it.type} size={48} color={it.color || (it.type ? itemTypeColor(it.type) : undefined)} />
        </span>
        <b className="block mt-2 text-[13px] font-black truncate">{it.shortName || it.name}</b>
        {ph ? (
          <>
            <p className="mt-0.5 text-[11.5px] font-extrabold text-[#a3a3a3] truncate">{kind}</p>
            <p className="mt-0.5">{price}</p>
          </>
        ) : (
          <p className="mt-0.5 flex items-baseline justify-between gap-2"><span className="min-w-0 truncate text-[11.5px] font-extrabold text-[#a3a3a3]">{kind}</span>{price}</p>
        )}
      </Link>
    );
  };

  return (
    <div className="text-[#131313]">
      {/* ① 간판 — 폰은 화면 끝까지 */}
      <div className="-mx-5 md:-mx-8 lg:mx-0 lg:rounded-2xl overflow-hidden bg-[#2b2a6e]">
        {banner ? (
          <picture>
            <source media="(min-width: 1024px)" srcSet={banner.pc} />
            <img src={banner.m} alt={`SEASON ${s.number} ${s.name}`} className="block w-full h-auto [image-rendering:pixelated]" />
          </picture>
        ) : (
          <div className="px-6 py-10 lg:py-14 text-white">
            <p className="text-[12px] font-black tracking-[0.2em] text-[#ff5c77]">SEASON {s.number}</p>
            <p className="mt-2 text-[34px] lg:text-[48px] font-black tracking-tight leading-none">{s.name}</p>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between lg:justify-start gap-3">
        <span className="text-[13px] font-extrabold text-[#8a8a8a] tabular-nums">{md(s.start)} ~ {md(s.end)}</span>
        <b className="text-[22px] lg:text-[18px] font-black text-[#e91e3f] tabular-nums">{dday.ended ? "종료" : `D-${dday.days}`}</b>
      </div>

      {/* ② 진행 — 하늘 군도 항로 지도(단색 밤하늘 · 그라데이션 없음): 깃발 섬(시작) → 작은 섬(이벤트 시작, 세 벌이 차례로) → 돛 단 하늘 배(내 자리 — 사진은 뺐다, 운영자 "이따위로 만들었으니 빼라고") → 점(다가올 종료) → 먼 보랏빛 섬(시즌 종료).
             📌 그림은 지도 전용 도트(./seasonMapArt — 시즌 2 배너 그림결. 아이템 아이콘 재활용 · 1차 장난감 같은 그림은 반려).
             「지금」 같은 글자는 두지 않는다(운영자 "11.02 지금 개짜친다"). 아래는 진행 중 이벤트 줄(기간 · 진행 막대 · 남은 날, 3일 이하 빨강).
             📌 「결산」 · 「끝」 대신 「종료」(운영자). 폰은 같은 그림을 위 → 아래 세로 항로로 */}
      <section className="mt-9 lg:mt-12">
        <h3 className="text-[19px] lg:text-[20px] font-black tracking-tight mb-3 lg:mb-4">진행</h3>
        {/* PC — 가로 항로 */}
        <div className="hidden lg:block relative rounded-2xl bg-[#24235c] overflow-hidden" style={{ height: MAP_H }}>
          {[[4, 18], [11, 70], [19, 30], [27, 84], [36, 14], [44, 60], [53, 22], [61, 88], [68, 40], [76, 12], [83, 74], [90, 28], [96, 62]].map(([x, y], i) => <i key={i} aria-hidden className={`absolute ${i % 3 ? "w-[3px] h-[3px] bg-white/55" : "w-[5px] h-[5px] bg-white"}`} style={{ left: `${x}%`, top: `${y}%` }}></i>)}
          <svg aria-hidden className="absolute inset-0 w-full h-full" viewBox={`0 0 1000 ${MAP_H}`} preserveAspectRatio="none">
            <polyline points={route(X0, X1)} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <polyline points={route(X0, nowX)} fill="none" stroke="#fff" strokeWidth="4" strokeDasharray="2 12" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {(() => {
            const at = (x) => ({ left: `${x / 10}%`, top: yOf(x) });
            const label = (cls, children, tx = "-50%") => <p style={{ transform: `translateX(${tx})` }} className={`absolute left-0 whitespace-nowrap rounded-md bg-[#24235c] px-1.5 py-px ${cls.includes("text-right") ? "" : "text-center"} text-[12px] font-extrabold leading-[1.4] text-white/75 z-[3] ${cls}`}>{children}</p>;
            return (
              <>
                <div className="absolute w-0 h-0" style={at(X0)}>
                  <MapPix art={MAP_ART.start} anchored />
                  {label("top-12", <><b className="block text-[13px] font-black text-white tabular-nums">{md(s.start)}</b>시즌 시작</>, "-30%")}
                </div>
                {mapNodes.map((v) => (
                  <div key={`${v.k}-${v.d}`} className="absolute w-0 h-0" style={at(xOf(v.ms))}>
                    {v.k === "isle" ? (
                      <MapPix art={isleArt(isleN.get(v.d) || 0)} anchored />
                    ) : (
                      <i aria-hidden className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-[#24235c] border-[3px] border-white/55 z-[2]"></i>
                    )}
                    {label(v.up ? (v.k === "isle" ? "bottom-8" : "bottom-4") : v.k === "isle" ? "top-11" : "top-6", <>
                      <b className="block text-[13px] font-black text-white tabular-nums">{v.d}</b>
                      {v.l.map((t) => <span key={t} className="block">{t}</span>)}
                      {v.k === "fut" && <em className="block not-italic text-[12px] font-black text-[#ff9db0] tabular-nums">{dTag(v.dd)}</em>}
                    </>)}
                  </div>
                ))}
                <div className="absolute w-0 h-0 z-[4]" style={at(nowX)}>
                  <MapPix art={MAP_ART.ship} anchored />
                </div>
                <div className="absolute w-0 h-0" style={at(X1)}>
                  <MapPix art={MAP_ART.castle} anchored />
                  {label("-top-3 text-right", <><b className="block text-[13px] font-black text-white tabular-nums">{md(s.end)}</b>시즌 종료{!dday.ended && <em className="block not-italic text-[12px] font-black text-[#ff5c77] tabular-nums">D-{dday.days}</em>}</>, "calc(-100% - 50px)")}
                </div>
              </>
            );
          })()}
        </div>
        {/* 폰 — 세로 항로 */}
        <ol className="lg:hidden relative rounded-2xl bg-[#24235c] px-4 py-3 overflow-hidden">
          {(() => {
            const meAt = vrows.findIndex((r) => r.k === "me");
            return (
              <>
                <span aria-hidden className="absolute left-[39px] top-11 bottom-11 border-l-[3px] border-dotted border-white/25"></span>
                <span aria-hidden className="absolute left-[39px] top-11 border-l-[3px] border-dotted border-white" style={{ height: `calc(${meAt} * 64px)` }}></span>
                {vrows.map((r, i) => (
                  <li key={`${r.k}-${i}`} className="relative flex items-center gap-3 h-16">
                    <span className="relative z-[1] w-12 shrink-0 flex justify-center">
                      {r.k === "me" ? <MapPix art={MAP_ART.ship} scale={1} />
                        : r.k === "start" ? <MapPix art={MAP_ART.start} scale={1} />
                        : r.k === "isle" ? <MapPix art={isleArt(isleN.get(r.d) || 0)} scale={1} />
                        : r.k === "end" ? <MapPix art={MAP_ART.castle} scale={1} />
                        : <i aria-hidden className="block w-3 h-3 rounded-full bg-[#24235c] border-[3px] border-white/45"></i>}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[13px] font-extrabold text-white/75">
                      <b className={`inline-block w-11 font-black tabular-nums ${r.k === "me" ? "text-[#ff5c77]" : "text-white"}`}>{r.d}</b>{r.l}
                    </p>
                    {r.tail && <em className={`shrink-0 not-italic text-[12px] font-black tabular-nums ${r.k === "end" ? "text-[#ff5c77]" : "text-white/60"}`}>{r.tail}</em>}
                  </li>
                ))}
              </>
            );
          })()}
        </ol>
        {/* 진행 중 이벤트 */}
        {live.length > 0 && (
          <div className="mt-5">
            <p className="mb-1 text-[12px] font-black text-[#8a8a8a]">진행 중 <span className="text-[#131313] tabular-nums">{live.length}</span></p>
            {live.map((b) => {
              const dd = b.always ? null : dLeft(b.endDay);
              const soon = dd != null && dd <= 3;
              const done = b.always ? 0 : Math.max(0, Math.min(100, ((nowMs - b.start) / Math.max(1, b.end - b.start)) * 100));
              return (
                <div key={b.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }} className="grid lg:flex lg:items-center gap-x-3 lg:gap-x-5 gap-y-1.5 py-3 border-b border-[#ededed]">
                  <b className="min-w-0 truncate text-[14px] lg:text-[14.5px] font-black lg:w-[240px] lg:shrink-0">{b.label}</b>
                  <span className={`row-span-2 self-center lg:order-4 lg:w-[70px] text-right text-[14px] lg:text-[14.5px] font-black tabular-nums ${soon ? "text-[#e91e3f]" : ""}`}>{b.always ? "상시" : dTag(dd)}</span>
                  <span className="text-[12px] font-extrabold text-[#8a8a8a] tabular-nums lg:w-[150px] lg:shrink-0">{mdOf(b.rawStart)} ~ {b.always ? "상시" : mdOf(b.endDay)}</span>
                  <div className="col-span-2 lg:flex-1 h-1.5 rounded-full bg-[#ededed] overflow-hidden">
                    {!b.always && <div className="h-full rounded-full" style={{ width: `${done}%`, background: soon ? "#e91e3f" : "#131313" }}></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ④ 시즌 보상 — 진행 바로 아래 한 줄(운영자 "보상이 잘 안보여.." → 크게 키웠다가 "넘 큰데" → PC 320 고정 폭 두 칸 · 폰 나란히 두 칸).
             올리면 그림이 살짝 커지고, 누르면 그 자리 창에서 크게(운영자 "마우스 가져다 대면 크게 · 클릭해서 크게").
             프로필 테두리를 낀 내 사진 | 랭크 깃발 카드 테두리만 씌운 빈 카드를 키워 위쪽(깃발 · 모서리 장식)을 꽉 차게.
             📌 라벨은 격식 있는 명사형(운영자 "결산 때 받는 것 이지랄 하지 말랬지 · 격식있게 · 주절주절 대지 말고") */}
      {!guest && me && (
        <section className="mt-9 lg:mt-12">
          <div className="flex items-baseline justify-between mb-3 lg:mb-4">
            <h3 className="text-[19px] lg:text-[20px] font-black tracking-tight">시즌 보상</h3>
            <span className="text-[13px] font-black text-[#e91e3f] tabular-nums">{settleLocked ? "Lv 90 이상" : md(s.end)}</span>
          </div>
          <div className={`grid grid-cols-2 lg:flex gap-2.5 lg:gap-4 ${settleLocked ? "opacity-40 grayscale" : ""}`}>
            <figure className="m-0 min-w-0 lg:w-[320px]">
              <button type="button" onClick={() => setZoom(true)} aria-label="시즌 보상 크게 보기" className="group relative block w-full h-[180px] lg:h-[230px] rounded-2xl bg-[#151515] overflow-hidden cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/50">
                <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-out group-hover:scale-[1.08]">
                <span className="relative flex items-center justify-center lg:hidden" style={{ width: 140, height: 140 }}>
                  {who?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={who.image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 88, height: 88 }} />
                  ) : (
                    <span className="relative rounded-full bg-white/10 flex items-center justify-center font-black text-white/60" style={{ width: 88, height: 88, fontSize: 32 }}>{String(who?.name || "?").slice(0, 1)}</span>
                  )}
                  <AvatarFrame frame={settleKey} px={88} />
                </span>
                <span className="relative hidden lg:flex items-center justify-center" style={{ width: 176, height: 176 }}>
                  {who?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={who.image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 112, height: 112 }} />
                  ) : (
                    <span className="relative rounded-full bg-white/10 flex items-center justify-center font-black text-white/60" style={{ width: 112, height: 112, fontSize: 40 }}>{String(who?.name || "?").slice(0, 1)}</span>
                  )}
                  <AvatarFrame frame={settleKey} px={112} />
                </span>
                </span>
              </button>
              <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-2"><b className="text-[14px] lg:text-[15px] font-black">프로필 테두리</b><span className="text-[12px] font-extrabold text-[#8a8a8a]">{settleLocked ? "브론즈" : tierCur.name} 등급</span></figcaption>
            </figure>
            <figure className="m-0 min-w-0 lg:w-[320px]">
              <button type="button" onClick={() => setZoom(true)} aria-label="시즌 보상 크게 보기" className="group relative block w-full h-[180px] lg:h-[230px] rounded-2xl bg-[#f4f4f5] overflow-hidden cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/50">
                <span className="absolute inset-0 flex justify-center origin-top transition-transform duration-300 ease-out group-hover:scale-[1.08]">
                  <span className="pt-4 lg:hidden"><EquipCard w={150} skin={`rank_${settleKey}`} frame="" image={who?.image} name={who?.name} bare /></span>
                  <span className="pt-5 hidden lg:block"><EquipCard w={230} skin={`rank_${settleKey}`} frame="" image={who?.image} name={who?.name} bare /></span>
                </span>
              </button>
              <figcaption className="mt-2 flex flex-wrap items-baseline gap-x-2"><b className="text-[14px] lg:text-[15px] font-black">카드 테두리</b><span className="text-[12px] font-extrabold text-[#8a8a8a]">랭크 깃발</span></figcaption>
            </figure>
          </div>
          {zoom && (
            // 스크롤 잠금은 루트의 fixed inset-0 + z-[120] 을 보고 전역 ScrollLock 이 건다
            <div role="dialog" aria-modal="true" aria-label="시즌 보상" className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={() => setZoom(false)}>
              <div className="desk-in w-full sm:w-auto max-h-[92dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4 sm:mb-5">
                  <h3 className="text-[19px] sm:text-[20px] font-black tracking-tight">시즌 보상</h3>
                  <button type="button" onClick={() => setZoom(false)} aria-label="닫기" className="w-9 h-9 -mr-1.5 rounded-full flex items-center justify-center text-[#8a8a8a] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                    <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                <div className={`flex flex-col sm:flex-row gap-3 sm:gap-4 ${settleLocked ? "opacity-40 grayscale" : ""}`}>
                  <figure className="m-0 sm:w-[340px]">
                    <div className="relative h-[260px] sm:h-[340px] rounded-2xl bg-[#151515] flex items-center justify-center overflow-hidden">
                      <div className="relative flex items-center justify-center sm:hidden" style={{ width: 220, height: 220 }}>
                    {who?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={who.image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 132, height: 132 }} />
                    ) : (
                      <span className="relative rounded-full bg-white/10 flex items-center justify-center font-black text-white/60" style={{ width: 132, height: 132, fontSize: 48 }}>{String(who?.name || "?").slice(0, 1)}</span>
                    )}
                    <AvatarFrame frame={settleKey} px={132} />
                      </div>
                      <div className="relative hidden sm:flex items-center justify-center" style={{ width: 280, height: 280 }}>
                    {who?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={who.image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 172, height: 172 }} />
                    ) : (
                      <span className="relative rounded-full bg-white/10 flex items-center justify-center font-black text-white/60" style={{ width: 172, height: 172, fontSize: 62 }}>{String(who?.name || "?").slice(0, 1)}</span>
                    )}
                    <AvatarFrame frame={settleKey} px={172} />
                      </div>
                    </div>
                    <figcaption className="mt-2 flex items-baseline gap-2"><b className="text-[15px] font-black">프로필 테두리</b><span className="text-[12px] font-extrabold text-[#8a8a8a]">{settleLocked ? "브론즈" : tierCur.name} 등급</span></figcaption>
                  </figure>
                  <figure className="m-0 sm:w-[340px]">
                    <div className="relative h-[260px] sm:h-[340px] rounded-2xl bg-[#f4f4f5] overflow-hidden flex justify-center">
                      <span className="pt-5 sm:hidden"><EquipCard w={240} skin={`rank_${settleKey}`} frame="" image={who?.image} name={who?.name} bare /></span>
                      <span className="pt-6 hidden sm:block"><EquipCard w={300} skin={`rank_${settleKey}`} frame="" image={who?.image} name={who?.name} bare /></span>
                    </div>
                    <figcaption className="mt-2 flex items-baseline gap-2"><b className="text-[15px] font-black">카드 테두리</b><span className="text-[12px] font-extrabold text-[#8a8a8a]">랭크 깃발</span></figcaption>
                  </figure>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ③ 내 시즌 기록 — PC 네 칸 한 줄 · 폰 2 × 2. 「지난 시즌 ›」은 「기록」 지난 시즌으로 */}
      {!guest && me && (
        <section className="mt-9 lg:mt-12">
          {head("내 시즌 기록", onPast ? <button type="button" onClick={onPast} className={lk}>지난 시즌<span aria-hidden>›</span></button> : null)}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-4 lg:gap-6">
            {stats.map((x) => (
              <div key={x.l} className="min-w-0">
                <p className="text-[12px] lg:text-[13px] font-extrabold text-[#8a8a8a]">{x.l}</p>
                <p className="mt-1 lg:mt-1.5 text-[24px] lg:text-[32px] font-black tracking-tight tabular-nums whitespace-nowrap leading-tight">
                  {x.v}
                  {x.u && <span className="ml-1 lg:ml-1.5 text-[13px] lg:text-[15px] font-extrabold text-[#a3a3a3] tracking-normal">{x.u}</span>}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ⑤ 시즌 패스 — 단계 길 */}
      {passEnabled && passMax > 0 && (
        <section className="mt-9 lg:mt-12">
          {head("시즌 패스", onPass && !guest ? <button type="button" onClick={onPass} className={lk}>시즌 패스<span aria-hidden>›</span></button> : null)}
          <div role="img" aria-label={`시즌 패스 ${passCur} / ${passMax}단계`}>
            <div className="hidden lg:block">{track(false)}</div>
            <div ref={trackRef} className="lg:hidden overflow-x-auto no-bar -mx-5 px-5 md:-mx-8 md:px-8">{track(true)}</div>
          </div>
        </section>
      )}

      {/* ⑥ 시즌 상점 */}
      {canSeeShop && shop?.length > 0 && (
        <section className="mt-9 lg:mt-12">
          {head("시즌 상점", <Link href="/arctic?type=season&from=level" className={lk}>ARCTIC<span aria-hidden>›</span></Link>)}
          <div className="lg:hidden flex gap-2.5 overflow-x-auto no-bar -mx-5 px-5 md:-mx-8 md:px-8">{shop.map((it) => shopCard(it, true))}</div>
          <div className="hidden lg:grid gap-x-3 gap-y-[18px]" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>{shop.map((it) => shopCard(it, false))}</div>
        </section>
      )}
    </div>
  );
}
