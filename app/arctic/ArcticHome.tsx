"use client";

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import ItemIcon from "../components/ItemIcon";
import { isTimed, durationLabel, cardPick, discountActive, affordFor, shownPrice, priceText } from "@/lib/shopPricing";
import { pointToXp } from "@/lib/pointRate";
import { isUnitSale, maxPerOrderOf } from "@/lib/unitSale";
import { SEASON, getSeasonDday } from "@/lib/season";
import { getTier } from "@/lib/voiceTiers";
import { siteHref } from "@/lib/siteLink";

// 📌 ARCTIC 홈 — 배너 → 유형 타일 4장 → 두 갈래 큐레이션 → 이번 주.
//    헤더·유형 줄·독·푸터는 ArcticShopBody 가 그린다. 여기는 홈 본문만.
//    상품 카드는 부모의 renderCard 를 그대로 받아 쓴다 (찜·장바구니·구매가 한 벌).
//    📌 무엇을 걸지는 서버 추천(/api/shop/recommend — lib/shopRecommend.js)이 정한다.
//       결과가 오기 전 · 실패하면 아래 기본 규칙(판매 수 · 관리자 순서)으로 그린다.

type Props = {
  items: any[];
  isLoading: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  myXp: number | null;
  myPoint?: number | null; // 빙옥도 결제에 섞어 쓸 수 있다 — 살 수 있는지는 XP + 빙옥으로 본다
  myLevel: number;
  ownedItemIds: Set<string>;
  banners: any[];
  bannersLoaded: boolean;
  bannerIdx: number;
  setBannerIdx: (i: number) => void;
  bannerRatio: number;
  fitRatio: (img: HTMLImageElement) => void;
  renderCard: (it: any) => React.ReactNode;
  goProducts: (type?: string) => void;
  openEdit: () => void;
  adminTools?: React.ReactNode;
};

// 이번 주 월요일 ~ 일요일 (M.D – M.D)
function weekRange() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;
  return `${f(mon)} – ${f(sun)}`;
}

const created = (it: any) => new Date(it?.createdAt || 0).getTime();

// 📌 768px 미만(모바일)인가 — 배너는 클라이언트에서 받아 오므로 첫 화면(SSR)과 어긋나 번쩍일 일이 없다.
//    컨테이너 단위 · round() 는 일부 브라우저에서 안 먹었다 — 폭 판정은 matchMedia 로만 한다.
//    (옛 Safari 는 MediaQueryList.addEventListener 가 없어 addListener 로 받는다)
const NARROW_MQ = "(max-width: 767.98px)";
const subNarrow = (cb: () => void) => {
  const mq = window.matchMedia(NARROW_MQ);
  if (mq.addEventListener) { mq.addEventListener("change", cb); return () => mq.removeEventListener("change", cb); }
  mq.addListener(cb);
  return () => mq.removeListener(cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);
// 모바일 배너 틀 비율 범위 (관리자 배너 편집의 모바일 미리보기와 같은 값)
const M_RATIO_MIN = 0.8;
const M_RATIO_MAX = 3;
const hasMobileArt = (b: any) => typeof b?.mobileImageUrl === "string" && b.mobileImageUrl.trim() !== "";

// 📌 추천 결과 — 서버가 고른 상품 id 와 제목만 온다
type Rec = {
  hot: string[];
  forMe: { title: string; ids: string[]; basis?: string };
  deal: { id: string; kind: "sale" | "new" } | null;
  renewSoon?: { id: string; expiresAt: string }[];
};
// 📌 한 번 받은 추천은 모듈에 둔다 — 홈 ↔ 상품 화면을 오갈 때마다 카드가 다시 바뀌지 않게.
//    5분(서버 집계 캐시와 같은 주기)이 지나면 둔 것을 먼저 그리고 뒤에서 새로 받는다
const REC_TTL = 5 * 60 * 1000;
// 상품 목록이 먼저 와도 추천을 이만큼은 기다렸다 그린다 — 기본 규칙으로 그렸다가 곧바로 바뀌는 깜빡임을 없앤다
const REC_WAIT = 800;
let recMemo: { at: number; data: Rec } | null = null;
const freshRec = () => (recMemo && Date.now() - recMemo.at < REC_TTL ? recMemo.data : null);

export default function ArcticHome({
  items, isLoading, isAdmin, isLoggedIn, myXp, myPoint, myLevel, ownedItemIds,
  banners, bannersLoaded, bannerIdx, setBannerIdx, bannerRatio, fitRatio, renderCard, goProducts, openEdit, adminTools,
}: Props) {
  const dday = getSeasonDday();

  // 📌 모바일 배너 — 보이는 배너가 전부 모바일 이미지를 가졌을 때만 바꿔 건다(한 장이라도 없으면 오늘처럼 PC 이미지).
  //    틀 비율은 PC(fitRatio)와 같은 규칙 — 불러온 모바일 이미지 중 가장 넓은 비율에 맞춰 어느 것도 좌우가 잘리지 않게.
  const narrow = useNarrow();
  const mobileArt = narrow && banners.length > 0 && banners.every(hasMobileArt);
  const [mRatios, setMRatios] = useState<Record<string, number>>({}); // 이미지 주소 → 실제 비율
  const fitMobile = (url: string, img: HTMLImageElement) => {
    const r = img.naturalWidth / img.naturalHeight;
    if (!Number.isFinite(r) || r <= 0) return;
    setMRatios((prev) => (prev[url] === r ? prev : { ...prev, [url]: r }));
  };
  const mRatio = useMemo(() => {
    const rs = banners.map((b) => mRatios[String(b.mobileImageUrl || "").trim()]).filter((r): r is number => !!r);
    // 아직 한 장도 안 불러왔으면 2:1 자리만 잡아 둔다
    return rs.length ? Math.min(M_RATIO_MAX, Math.max(M_RATIO_MIN, Math.max(...rs))) : 2;
  }, [banners, mRatios]);

  const active = useMemo(() => items.filter((it) => it.active !== false), [items]);
  const byId = useMemo(() => new Map(active.map((it) => [String(it._id), it])), [active]);

  // ── 서버 추천 — 상품 목록과 나란히 받는다(대개 목록보다 먼저 와서 첫 카드부터 추천으로 그려진다) ──
  const [rec, setRec] = useState<Rec | null>(() => recMemo?.data ?? null);
  // 추천을 기다리는 중인가 — 둔 추천이 있으면 기다리지 않는다. 목록이 온 뒤 REC_WAIT 가 지나면 기본 규칙으로 그린다
  const [recWait, setRecWait] = useState(() => !recMemo);
  const ready = !isLoading && !recWait;
  const curRef = useRef<HTMLElement>(null);
  const shownRef = useRef(false); // 카드가 이미 그려졌는가 — 그 뒤에 결과가 오면 높이를 잡아 두고 바꾼다
  const [lockH, setLockH] = useState(0);
  const recRef = useRef(rec); // 지금 그려진 추천 — 새로 받은 것과 같으면 다시 그리지 않는다
  useEffect(() => { recRef.current = rec; }, [rec]);
  useEffect(() => { shownRef.current = ready && active.length > 0; }, [ready, active.length]);
  useEffect(() => {
    if (freshRec()) return;
    let alive = true;
    fetch("/api/shop/recommend", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.success || !j.data) return;
        recMemo = { at: Date.now(), data: j.data }; // 그새 화면을 떠났어도 둔다 — 돌아오면 바로 쓴다
        if (!alive || JSON.stringify(recRef.current) === JSON.stringify(j.data)) return;
        // 📌 이미 그려 둔 뒤라면 지금 높이를 최소 높이로 잡는다 — 바뀐 카드가 짧아도 아래 칸이 끌려 올라오지 않게
        if (shownRef.current && curRef.current) setLockH(curRef.current.offsetHeight);
        setRec(j.data);
      })
      .catch(() => {}) // 실패하면 기본 규칙 그대로
      .finally(() => { if (alive) setRecWait(false); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (isLoading || !recWait) return;
    const t = setTimeout(() => setRecWait(false), REC_WAIT);
    return () => clearTimeout(t);
  }, [isLoading, recWait]);
  // 화면 폭이 바뀌면(가로 · 세로 전환 등) 잡아 둔 높이는 풀어 준다 — 모바일 주소창이 접히는 세로 변화는 무시
  useEffect(() => {
    if (!lockH) return;
    const w0 = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w0) setLockH(0); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [lockH]);

  // 지금 잘 나가는 — 추천(최근 14일 구매자 · 시간 감쇠)이 오면 그 순서, 기본은 판매 수 · 추천 순서 · 최신
  const hot = useMemo(() => {
    const base = [...active].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0) || (a.sortOrder || 0) - (b.sortOrder || 0) || created(b) - created(a)).slice(0, 2);
    if (!rec) return base;
    const out = rec.hot.map((id) => byId.get(id)).filter(Boolean);
    // 목록에 없는 id(그새 내려간 상품 등)로 모자라면 기본 규칙으로 채운다 — 칸 수가 줄지 않게
    for (const it of base) if (out.length < 2 && !out.some((o) => o._id === it._id)) out.push(it);
    return out.slice(0, 2);
  }, [active, byId, rec]);

  // ○○에게 맞는 — 기본 규칙: 내 등급·소지 XP 기준. 안 산 것, 살 수 있는 것, 권한·아이템·꾸미기 우선.
  //    추천: 같은 등급의 최근 구매 · 함께 산 상품 · 예산 적합도 (제목도 근거에 따라 "○○에게 인기" · "함께 많이 산")
  const tier = isLoggedIn ? getTier(myLevel || 0) : null;
  const forMe = useMemo(() => {
    const hotIds = new Set(hot.map((h) => h._id));
    const cands = active.filter((it) => !hotIds.has(it._id) && !ownedItemIds.has(it._id));
    const budget = typeof myXp === "number" ? myXp + pointToXp(myPoint ?? 0) : null;
    // 어느 기간이든 살 수 있으면 — 카드에는 그 살 수 있는 기간(무제한 > 가장 긴 기간)이 걸린다(목록 필터와 같은 규칙)
    //    📌 빙옥 전용 상품은 빙옥만으로 산다 (affordFor — 상점 목록 필터와 같은 기준)
    const okFor = (it: any) => affordFor(it, myXp ?? 0, myPoint ?? 0);
    const afford = isLoggedIn && budget != null
      ? cands.flatMap((it) => { const pick = cardPick(it, okFor(it)); return pick ? [{ ...it, _pick: pick }] : []; })
      : cands;
    const pool = [...(afford.length >= 2 ? afford : cands)];
    const score = (it: any) => (it.type === "perk" || it.type === "item" || it.type === "cosmetic" ? 1 : 0);
    pool.sort((a, b) => score(b) - score(a) || (a.sortOrder || 0) - (b.sortOrder || 0));
    let picks = pool.slice(0, 2);
    let title = tier ? `${tier.name}에게 맞는` : "처음이라면";
    if (picks.length < 2) {
      const pickIds = new Set(picks.map((p) => p._id));
      const timed = active.filter((it) => isTimed(it) && !pickIds.has(it._id) && !hotIds.has(it._id));
      if (timed.length) { picks = [...picks, ...timed].slice(0, 2); title = "기간제만 모아보기"; }
    }
    if (!rec) return { picks, title, basis: "" };

    // 📌 추천이 오면 그 순서 — 카드에 걸 값(_pick)은 기본 규칙과 같이 예산 안의 기간으로.
    //    그새 산 상품 · 위 칸과 겹치는 상품은 빼고, 모자라면 기본 규칙으로 채운다
    const withPick = (it: (typeof active)[number]) => {
      if (!isLoggedIn || budget == null) return it;
      const pick = cardPick(it, okFor(it));
      return pick ? { ...it, _pick: pick } : it;
    };
    const timedFill = rec.forMe.basis === "timed"; // 기간제 채움은 가진 기간제(연장 대상)도 들어온다
    const out = rec.forMe.ids
      .map((id) => byId.get(id))
      .filter((it) => it && !hotIds.has(it._id) && (timedFill || !ownedItemIds.has(it._id)))
      .map(withPick);
    for (const it of picks) if (out.length < 2 && !out.some((o) => o._id === it._id)) out.push(it);
    return { picks: out.slice(0, 2), title: rec.forMe.title || title, basis: rec.forMe.basis || "" };
  }, [active, byId, rec, hot, ownedItemIds, isLoggedIn, myXp, myPoint, tier]);

  // 이번 주 — 할인 상품(없으면 최신) 한 장 + 시즌 한 장. 추천은 종료 임박 · 할인율 · 요즘 인기를 섞어 고른다
  const deal = useMemo(() => {
    if (!ready) return null; // 추천을 기다리는 동안은 두 갈래와 같이 비워 둔다 — 기본 규칙 카드가 잠깐 떴다 바뀌지 않게
    if (rec?.deal) {
      const it = byId.get(rec.deal.id);
      // 그새 할인이 끝났으면 기본 규칙으로
      if (it && (rec.deal.kind === "new" || discountActive(it))) return { it, kind: rec.deal.kind };
    }
    // 할인이 살아 있는 것만(종료 시각이 지난 할인은 빼고)
    const sale = active.filter((it) => discountActive(it))
      .sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0) || (b.soldCount || 0) - (a.soldCount || 0))[0];
    if (sale) return { it: sale, kind: "sale" as const };
    const fresh = [...active].sort((a, b) => created(b) - created(a))[0];
    return fresh ? { it: fresh, kind: "new" as const } : null;
  }, [active, byId, rec, ready]);

  const secHead = "flex items-baseline justify-between gap-4 mb-5";
  const secTitle = "text-xl md:text-2xl font-black text-[#131313] tracking-tight";
  const secLink = "text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors shrink-0";

  return (
    <>
      {/* ── 배너 (관리자 등록) — 등록된 배너가 없으면 이 자리는 아예 없다.
             예전엔 시즌 히어로(민트 화면)를 대신 깔았는데 들어올 때마다 튀어나와 없앴다.
             모서리는 각지게, 폭은 본문 폭 안에 (화면 끝까지 채우면 너무 꽉 찬다) ── */}
      {banners.length > 0 && (
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-5 md:pt-6">
        <div className="relative overflow-hidden bg-[#f2f2f2]">
          {banners.length > 0 ? (
            <>
              <div className="relative" style={{ aspectRatio: String(mobileArt ? mRatio : bannerRatio) }}>
                {banners.map((b, i) => {
                  const mUrl = String(b.mobileImageUrl || "").trim();
                  const inner = (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mobileArt ? mUrl : b.imageUrl} alt={b.title || ""}
                        onLoad={(e) => (mobileArt ? fitMobile(mUrl, e.currentTarget) : fitRatio(e.currentTarget))}
                        className="absolute inset-0 w-full h-full object-cover" />
                      {(b.title || b.subtitle) && (
                        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent flex flex-col justify-center px-5 sm:px-10 md:px-12">
                          {b.title && <h2 className="text-base sm:text-2xl md:text-3xl font-black tracking-tight text-white mb-0.5 sm:mb-1 break-keep line-clamp-2">{b.title}</h2>}
                          {b.subtitle && <p className="text-[11px] sm:text-sm text-white/85 break-keep line-clamp-1 sm:line-clamp-2">{b.subtitle}</p>}
                        </div>
                      )}
                    </>
                  );
                  return (
                    <div key={b._id}
                      className={`absolute inset-0 transition-opacity duration-700 ${i === bannerIdx ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
                      {/* 우리 사이트 전체 주소로 넣은 링크도 지금 화면 안에서 연다(siteHref) */}
                      {b.link ? <Link href={siteHref(b.link)} className="block w-full h-full relative">{inner}</Link> : inner}
                    </div>
                  );
                })}
              </div>
              {banners.length > 1 && (
                <div className="absolute bottom-4 right-5 flex gap-1.5 z-10">
                  {banners.map((b, i) => (
                    <button key={b._id} onClick={() => setBannerIdx(i)} aria-label={`배너 ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all duration-300 ${i === bannerIdx ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`}></button>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {isAdmin && (
            <Link href="/admin/shop?tab=banners"
              className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#131313] border border-[#ededed] hover:bg-white shadow-sm transition-colors">
              배너 관리
            </Link>
          )}
        </div>
      </section>
      )}

      {/* ── 두 갈래 큐레이션 ── */}
      <section ref={curRef} className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14" style={lockH ? { minHeight: lockH } : undefined}>
        {!ready ? (
          <div className="py-16 text-center text-sm text-[#8a8a8a]">불러오는 중...</div>
        ) : active.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8a8a8a]">등록된 상품이 없습니다.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-10 md:gap-0">
            <div className="md:pr-10">
              <div className={secHead}>
                <h2 className={secTitle}>지금 잘 나가는</h2>
                <button onClick={() => goProducts("all")} className={secLink}>전체 ›</button>
              </div>
              <div className="grid grid-cols-2 gap-3 md:gap-5">{hot.map((it) => renderCard(it))}</div>
              <div className="mt-5 text-right">
                <button onClick={() => goProducts("all")} className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">다른 상품 보기 →</button>
              </div>
            </div>
            <div className="md:border-l md:border-[#ededed] md:pl-10">
              <div className={secHead}>
                <h2 className={secTitle}>{forMe.title}</h2>
                <span className="text-[12px] font-bold text-[#8a8a8a] shrink-0">{forMe.basis === "co" ? "내 아이템 기준" : tier ? "내 등급 기준" : "가장 많이 고른"}</span>
              </div>
              {forMe.picks.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#a3a3a3]">준비 중</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:gap-5">{forMe.picks.map((it) => renderCard(it))}</div>
              )}
              <div className="mt-5 text-right">
                {/* 추천 칸은 권한 · 아이템 · 꾸미기가 섞여 있어 유형 하나로 보내지 않는다 — 전체(추천순)로 */}
                <button onClick={() => goProducts("all")} className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">추천 더 보기 →</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── 이번 주 — 기간이 있는 것만 두 장 ── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14 pb-14">
        <div className={secHead}>
          <h2 className={secTitle}>이번 주</h2>
          <span className="text-[12px] font-bold text-[#8a8a8a] tabular-nums shrink-0">{weekRange()}</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          {/* 📌 추천을 기다리는 동안은 할인 칸 자리만 비워 둔다 — 시즌 칸이 두 칸 폭으로 그려졌다가 반으로 줄어들지 않게 */}
          {!deal && !ready && <div aria-hidden className="h-[180px] md:h-[200px]"></div>}
          {deal && (
            <Link href={`/arctic/item/${deal.it._id}`}
              className="relative overflow-hidden rounded-md h-[180px] md:h-[200px] p-6 md:p-7 text-white block bg-gradient-to-br from-[#131313] to-[#3a3a3a] hover:to-[#4a4a4a] transition-colors">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black opacity-85"><span className="w-1.5 h-1.5 rounded-full bg-current"></span>{deal.kind === "sale" ? "할인" : "새로 들어온"}</span>
              <h3 className="mt-3 pr-16 text-[22px] md:text-[26px] font-black tracking-tight leading-tight break-keep line-clamp-2">
                {deal.kind === "sale" ? `${deal.it.name} ${deal.it.discountPct}% 할인` : deal.it.name}
              </h3>
              <p className="mt-1.5 text-[13px] opacity-85 tabular-nums">
                {deal.kind === "sale"
                  // 카드와 같은 값(cardPick — 기본 무제한) — 한 상품이 곳마다 다른 값으로 보이지 않게
                  //    빙옥 전용 상품은 단위만 빙옥 (priceText — 올림)
                  ? `${shownPrice(deal.it, cardPick(deal.it)?.list ?? 0).toLocaleString()} → ${priceText(deal.it, cardPick(deal.it)?.price ?? 0)}${isTimed(deal.it) ? ` / ${durationLabel(cardPick(deal.it)?.days ?? 0)}` : ""}${isUnitSale(deal.it) ? ` · 1회 최대 ${maxPerOrderOf(deal.it)}개` : " · 1인 1개"}`
                  : priceText(deal.it, cardPick(deal.it)?.price ?? 0)}
              </p>
              <span className="absolute left-6 md:left-7 bottom-6 text-[11px] font-bold opacity-80 tabular-nums">
                {deal.it.stock === -1 || deal.it.stock == null ? "수량 무제한" : `남은 수량 ${deal.it.stock}`}
              </span>
              <span className="absolute right-6 md:right-7 bottom-6 w-9 h-9 rounded-full border border-white/50 grid place-items-center font-black">›</span>
              <span className="absolute right-6 md:right-7 top-6 w-12 h-12 rounded-2xl bg-white/15 grid place-items-center">
                <ItemIcon type={deal.it.type} icon={deal.it.icon} size={24} color="#ffffff" />
              </span>
            </Link>
          )}
          <Link href="/level?tab=pass"
            className={`relative overflow-hidden rounded-md h-[180px] md:h-[200px] p-6 md:p-7 text-white block bg-gradient-to-br from-[#e91e3f] to-[#ff5c77] hover:to-[#ff6f86] transition-colors ${deal || !ready ? "" : "md:col-span-2"}`}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-black opacity-85"><span className="w-1.5 h-1.5 rounded-full bg-current"></span>시즌 {SEASON.number}</span>
            <h3 className="mt-3 pr-16 text-[22px] md:text-[26px] font-black tracking-tight leading-tight break-keep">{SEASON.name}</h3>
            <p className="mt-1.5 text-[13px] opacity-85">시즌 패스 · 티어 보상</p>
            <span className="absolute left-6 md:left-7 bottom-6 text-[11px] font-bold opacity-80 tabular-nums">
              {dday.ended ? "시즌 종료" : `종료까지 D-${Math.max(0, dday.days)}`}
            </span>
            <span className="absolute right-6 md:right-7 bottom-6 w-9 h-9 rounded-full border border-white/50 grid place-items-center font-black">›</span>
            <span className="absolute right-6 md:right-7 top-6 w-12 h-12 rounded-2xl bg-white/15 grid place-items-center">
              <ItemIcon type="role" size={24} color="#ffffff" />
            </span>
          </Link>
        </div>
      </section>

      {/* 관리자 진입 */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-5 md:px-8 pb-10 flex flex-wrap items-center gap-3">
          <button onClick={openEdit}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#131313] hover:bg-black text-white text-[12px] font-bold rounded-full transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            상품 추가
          </button>
          <Link href="/admin/shop?tab=products" className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-4">전체 상품 관리</Link>
          <Link href="/admin/shop?tab=items" className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-4">아이템 등록</Link>
          <Link href="/admin/shop?tab=orders" className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-4">구매 관리</Link>
          <Link href="/admin/shop?tab=banners" className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] underline underline-offset-4">배너 관리</Link>
          {adminTools}
        </div>
      )}
    </>
  );
}
