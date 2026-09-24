"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import ItemIcon from "../components/ItemIcon";
import { salePrice, isTimed, durationOptions, durationLabel } from "@/lib/shopPricing";
import { SEASON, getSeasonDday } from "@/lib/season";
import { getTier } from "@/lib/voiceTiers";

// 📌 ARCTIC 홈 — 배너 → 유형 타일 4장 → 두 갈래 큐레이션 → 이번 주.
//    헤더·유형 줄·독·푸터는 ArcticShopBody 가 그린다. 여기는 홈 본문만.
//    상품 카드는 부모의 renderCard 를 그대로 받아 쓴다 (찜·장바구니·구매가 한 벌).

type Props = {
  items: any[];
  isLoading: boolean;
  isAdmin: boolean;
  isLoggedIn: boolean;
  myXp: number | null;
  myLevel: number;
  ownedItemIds: Set<string>;
  banners: any[];
  bannerIdx: number;
  setBannerIdx: (i: number) => void;
  bannerRatio: number;
  fitRatio: (img: HTMLImageElement) => void;
  renderCard: (it: any) => React.ReactNode;
  goProducts: (type?: string) => void;
  openEdit: () => void;
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

export default function ArcticHome({
  items, isLoading, isAdmin, isLoggedIn, myXp, myLevel, ownedItemIds,
  banners, bannerIdx, setBannerIdx, bannerRatio, fitRatio, renderCard, goProducts, openEdit,
}: Props) {
  const dday = getSeasonDday();
  const active = useMemo(() => items.filter((it) => it.active !== false), [items]);

  // 지금 잘 나가는 — 판매 수 · 추천 순서 · 최신
  const hot = useMemo(
    () => [...active].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0) || (b.sortOrder || 0) - (a.sortOrder || 0) || created(b) - created(a)).slice(0, 2),
    [active]
  );

  // ○○에게 맞는 — 내 등급·소지 XP 기준. 안 산 것, 살 수 있는 것, 권한·아이템 우선.
  const tier = isLoggedIn ? getTier(myLevel || 0) : null;
  const forMe = useMemo(() => {
    const hotIds = new Set(hot.map((h) => h._id));
    const cands = active.filter((it) => !hotIds.has(it._id) && !ownedItemIds.has(it._id));
    const afford = isLoggedIn && typeof myXp === "number" ? cands.filter((it) => salePrice(it) <= myXp) : cands;
    const pool = [...(afford.length >= 2 ? afford : cands)];
    const score = (it: any) => (it.type === "perk" || it.type === "item" ? 1 : 0);
    pool.sort((a, b) => score(b) - score(a) || (b.sortOrder || 0) - (a.sortOrder || 0));
    let picks = pool.slice(0, 2);
    let title = tier ? `${tier.name}에게 맞는` : "처음이라면";
    if (picks.length < 2) {
      const pickIds = new Set(picks.map((p) => p._id));
      const timed = active.filter((it) => isTimed(it) && !pickIds.has(it._id) && !hotIds.has(it._id));
      if (timed.length) { picks = [...picks, ...timed].slice(0, 2); title = "기간제만 모아보기"; }
    }
    return { picks, title };
  }, [active, hot, ownedItemIds, isLoggedIn, myXp, tier]);

  // 이번 주 — 할인 상품(없으면 최신) 한 장 + 시즌 한 장
  const deal = useMemo(() => {
    const sale = active.filter((it) => (it.discountPct || 0) > 0)
      .sort((a, b) => (b.discountPct || 0) - (a.discountPct || 0) || (b.soldCount || 0) - (a.soldCount || 0))[0];
    if (sale) return { it: sale, kind: "sale" as const };
    const fresh = [...active].sort((a, b) => created(b) - created(a))[0];
    return fresh ? { it: fresh, kind: "new" as const } : null;
  }, [active]);

  const secHead = "flex items-baseline justify-between gap-4 mb-5";
  const secTitle = "text-xl md:text-2xl font-black text-[#131313] tracking-tight";
  const secLink = "text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] transition-colors shrink-0";

  return (
    <>
      {/* ── 배너 (관리자 등록) — 없으면 시즌 히어로. 모서리는 각지게, 폭은 본문 폭 안에 (화면 끝까지 채우면 너무 꽉 찬다) ── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-5 md:pt-6">
        <div className="relative overflow-hidden bg-[#f2f2f2]">
          {banners.length > 0 ? (
            <>
              <div className="relative" style={{ aspectRatio: String(bannerRatio) }}>
                {banners.map((b, i) => {
                  const inner = (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.imageUrl} alt={b.title || ""} onLoad={(e) => fitRatio(e.currentTarget)}
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
                      {b.link ? <Link href={b.link} className="block w-full h-full relative">{inner}</Link> : inner}
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
          ) : (
            <div className="relative aspect-[16/7] md:aspect-[3/1]" style={{ background: "linear-gradient(115deg, #dff4f1 0%, #9fd9d1 45%, #4fb6ab 100%)" }}>
              <div className="absolute left-6 md:left-12 top-1/2 -translate-y-1/2 break-keep">
                <div className="text-[11px] font-black text-[#131313] tracking-wide">SEASON {SEASON.number} · {SEASON.name}</div>
                <div className="mt-2 text-4xl md:text-6xl font-black tracking-tighter leading-none text-[#131313]">ARCT<span className="text-[#e91e3f]">I</span>C</div>
                {!dday.ended && dday.days >= 0 && (
                  <div className="mt-3 text-[12px] font-bold text-[#2a4a47] tabular-nums">종료까지 D-{dday.days}</div>
                )}
              </div>
              {/* 장식 — 유형 아이콘 세 장 */}
              <div aria-hidden className="hidden md:block absolute right-16 top-1/2 -translate-y-1/2 w-[300px] h-[240px]">
                <span className="absolute left-0 top-12 w-[140px] h-[140px] rounded-3xl bg-white/55 shadow-[0_30px_60px_-30px_rgba(0,0,0,.35)] grid place-items-center -rotate-6"><ItemIcon type="item" size={64} color="#e91e3f" /></span>
                <span className="absolute right-0 top-0 w-[110px] h-[110px] rounded-3xl bg-[#131313]/85 grid place-items-center rotate-6"><ItemIcon type="perk" size={50} color="#ffffff" /></span>
                <span className="absolute right-8 bottom-0 w-[92px] h-[92px] rounded-3xl bg-white/55 grid place-items-center -rotate-3"><ItemIcon type="role" size={40} color="#e91e3f" /></span>
              </div>
            </div>
          )}

          {isAdmin && (
            <Link href="/admin/shop?tab=banners"
              className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/95 text-[#131313] border border-[#e0e0e0] hover:bg-white shadow-sm transition-colors">
              배너 관리
            </Link>
          )}
        </div>
      </section>

      {/* ── 두 갈래 큐레이션 ── */}
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14">
        {isLoading ? (
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
                <span className="text-[12px] font-bold text-[#8a8a8a] shrink-0">{tier ? "내 등급 기준" : "가장 많이 고른"}</span>
              </div>
              {forMe.picks.length === 0 ? (
                <p className="py-10 text-center text-sm text-[#a3a3a3]">준비 중</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:gap-5">{forMe.picks.map((it) => renderCard(it))}</div>
              )}
              <div className="mt-5 text-right">
                <button onClick={() => goProducts("perk")} className="text-[12px] font-bold text-[#5a5a5a] hover:text-[#131313] transition-colors">권한 전체 보기 →</button>
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
          {deal && (
            <Link href={`/arctic/item/${deal.it._id}`}
              className="relative overflow-hidden rounded-md h-[180px] md:h-[200px] p-6 md:p-7 text-white block bg-gradient-to-br from-[#131313] to-[#3a3a3a] hover:to-[#4a4a4a] transition-colors">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black opacity-85"><span className="w-1.5 h-1.5 rounded-full bg-current"></span>{deal.kind === "sale" ? "할인" : "새로 들어온"}</span>
              <h3 className="mt-3 pr-16 text-[22px] md:text-[26px] font-black tracking-tight leading-tight break-keep line-clamp-2">
                {deal.kind === "sale" ? `${deal.it.name} ${deal.it.discountPct}% 할인` : deal.it.name}
              </h3>
              <p className="mt-1.5 text-[13px] opacity-85 tabular-nums">
                {deal.kind === "sale"
                  // 기간제는 가장 짧은 기간의 정가 → 할인가 (salePrice 도 그 기간을 기준으로 잡는다)
                  ? `${Number(isTimed(deal.it) ? durationOptions(deal.it)[0]?.price ?? deal.it.price : deal.it.price).toLocaleString()} → ${salePrice(deal.it).toLocaleString()} XP${isTimed(deal.it) ? ` / ${durationLabel(durationOptions(deal.it)[0]?.days ?? 0)}` : ""} · 1인 1개`
                  : `${salePrice(deal.it).toLocaleString()} XP${isTimed(deal.it) ? " 부터" : ""}`}
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
            className={`relative overflow-hidden rounded-md h-[180px] md:h-[200px] p-6 md:p-7 text-white block bg-gradient-to-br from-[#e91e3f] to-[#ff5c77] hover:to-[#ff6f86] transition-colors ${deal ? "" : "md:col-span-2"}`}>
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
          <Link href="/admin/shop?tab=products" className="text-[12px] font-bold text-[#4b4b4b] hover:text-[#131313] underline underline-offset-4">전체 상품 관리</Link>
          <Link href="/admin/shop?tab=items" className="text-[12px] font-bold text-[#4b4b4b] hover:text-[#131313] underline underline-offset-4">아이템 등록</Link>
          <Link href="/admin/shop?tab=orders" className="text-[12px] font-bold text-[#4b4b4b] hover:text-[#131313] underline underline-offset-4">구매 관리</Link>
        </div>
      )}
    </>
  );
}
