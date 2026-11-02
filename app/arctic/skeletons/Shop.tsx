"use client";

import type { ReactNode } from "react";
import { Sk, SkWrap, CardSk } from "./Sk";
import { HomePageSk, HomeBannerSk } from "./Home";

// 📌 상점(ArcticShopBody) 로딩 뼈대 — 로그인한 화면 값 그대로:
//    스토어 줄(PC 두 줄 h-[60px] 검색 · 재화 188 · 도구 세 칸 + h-[46px] 유형 탭 / 폰 한 줄 h-[56px] 탭 · 카테고리 84 · 인벤토리),
//    필터 줄(ShopFilterBar — h-8 칩 · 개수 · 정렬 84 · pb-4 md:pb-5 밑줄), 상품 격자(폰 2 · sm 3 · lg 4 · xl 5 · 같은 간격).
//    📌 홈 · 시즌 · 테마 탭은 맨 위가 배너라 스토어 줄만 그린다(그 아래는 다 불러오면 채워진다 — 필터 줄 · 격자를 그려 두면 배너에 밀려 튄다)

// PC 유형 탭 — 홈 · 전체 · 역할 · 권한 · 아이템 · 꾸미기 · 기프트카드 · 기간제 | 시즌 (15px 굵게 글자 폭)
const PC_TABS = [16, 30, 30, 30, 45, 45, 75, 45];
// 폰 유형 줄 — 홈 · 전체 · 시즌 (14px)
const M_TABS = [14, 28, 28];

// 아이콘 단추 한 칸(w-9 h-9 · 아이콘 18px) — 인벤토리 · 찜 · 장바구니
const IconSk = ({ i = 0 }: { i?: number }) => (
  <span className="shrink-0 w-9 h-9 flex items-center justify-center"><Sk i={i} className="w-[18px] h-[18px] rounded-md" /></span>
);

// ── 상품 격자 — ArcticShopBody 목록과 같은 칸 수 · 간격. n 장(xl 두 줄 = 10)
const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-7 sm:gap-x-4 lg:gap-x-5 lg:gap-y-9";
const cards = (n: number, from: number) => Array.from({ length: n }, (_, k) => <CardSk key={k} i={from + k} />);
// 목록만 받는 동안(필터 줄 아래 자리)
export function ShopGridSk({ n = 10, from = 0 }: { n?: number; from?: number }) {
  return <SkWrap className={GRID}>{cards(n, from)}</SkWrap>;
}

// ── 스토어 줄 — 전역 상단 바 바로 아래(ArcticShopBody 스토어 줄과 같은 틀). back: 폰 줄 맨 앞 「‹ 들어온 곳」
function StoreBarSk({ back }: { back: boolean }) {
  // 좌우 칸 최소 폭 = 오른쪽 도구 폭(로그인 기준) — 검색창이 정가운데
  const side = "min-w-[124px] xl:min-w-[337px]";
  return (
    <div className="relative w-full bg-white border-b border-[#ededed]">
      {/* ① PC — 검색 · 재화 · 도구 */}
      <div className="hidden md:flex max-w-7xl mx-auto px-6 h-[60px] items-center">
        <div aria-hidden className={`flex-1 basis-0 ${side}`} />
        <div className="relative basis-[560px] min-w-0"><Sk i={0} className="h-10 rounded-full" /></div>
        <div className={`flex-1 basis-0 ${side} flex items-center justify-end`}>
          <span className="hidden xl:flex w-[188px] shrink-0 justify-end items-center gap-3"><Sk i={0} className="h-3 w-16 rounded-sm" /><Sk i={0} className="h-3 w-12 rounded-sm" /></span>
          <span aria-hidden className="hidden xl:block shrink-0 w-px h-4 mx-3 bg-[#e0e0e0]" />
          <div className="flex items-center gap-2 shrink-0"><IconSk /><IconSk /><IconSk /></div>
        </div>
      </div>
      {/* ② PC — 유형 탭(가운데) */}
      <div className="hidden md:block max-w-7xl mx-auto px-6">
        <div className="overflow-hidden">
          <div className="w-max mx-auto flex items-center gap-7 h-[46px]">
            {PC_TABS.map((w, k) => <Sk key={k} i={1} className="shrink-0 h-[14px] rounded" style={{ width: w }} />)}
            <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0]" />
            <Sk i={1} className="shrink-0 h-[14px] w-[30px] rounded" />
          </div>
        </div>
      </div>
      {/* 폰 — 한 줄(들어온 곳 · 홈 · 전체 · 시즌 | 카테고리 · 인벤토리) */}
      <div className="md:hidden px-5 h-[56px] flex items-center gap-3">
        <div className="flex items-center gap-3 h-full min-w-0 overflow-hidden">
          {back && (
            <>
              <Sk i={0} className="shrink-0 h-[13px] w-9 rounded" />
              <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0] -ml-1" />
            </>
          )}
          {M_TABS.map((w, k) => <Sk key={k} i={0} className="shrink-0 h-[13px] rounded" style={{ width: w }} />)}
        </div>
        <span aria-hidden className="shrink-0 w-px h-4 bg-[#e0e0e0]" />
        <span className="shrink-0 w-[84px] h-full flex items-center"><Sk i={0} className="h-[13px] w-[70px] rounded" /></span>
        <div className="ml-auto shrink-0"><IconSk /></div>
      </div>
    </div>
  );
}

// ── 필터 줄 — ShopFilterBar 와 같은 틀(폰 「필터」 칩 / PC 재고 있음 · 구매 가능 · 가격 칩, 오른쪽 개수 · 정렬 84)
function FilterBarSk({ i = 0 }: { i?: number }) {
  return (
    <div className="flex items-center gap-2 pb-4 md:pb-5 border-b border-[#ededed]">
      <Sk i={i} className="md:hidden h-8 w-[74px] rounded-full" />
      <div className="hidden md:flex items-center gap-2 min-w-0">
        <Sk i={i} className="h-8 w-[98px] rounded-full" />
        <Sk i={i} className="h-8 w-[98px] rounded-full" />
        <Sk i={i} className="h-8 w-[70px] rounded-full" />
      </div>
      <div className="ml-auto shrink-0 flex items-center gap-2">
        <Sk i={i} className="h-3 w-7 rounded-sm" />
        <span className="h-8 w-[84px] flex items-center justify-end"><Sk i={i} className="h-[13px] w-[52px] rounded" /></span>
      </div>
    </div>
  );
}

// ── 시즌 탭 두 갈래(../ArcticSeason SeasonPicks) — 기본 상태(필터 · 정렬 안 건)에서 격자 위에 선다. 머리 = secHead(mb-5) · secTitle(text-xl md:text-2xl → 줄 28 · 32px)
const PICK_HEAD = "flex items-center mb-5 h-7 md:h-8";
export function SeasonPicksSk() {
  return (
    <SkWrap>
      <div className="grid md:grid-cols-2 gap-10 md:gap-0">
        <div className="md:pr-10 xl:pr-28">
          <div className={PICK_HEAD}><Sk i={0} className="h-5 md:h-6 w-[60px] md:w-[72px] rounded" /></div>
          <div className="grid grid-cols-2 gap-3 md:gap-5"><CardSk i={1} /><CardSk i={2} /></div>
        </div>
        <div className="md:border-l md:border-[#ededed] md:pl-10 xl:pl-28">
          <div className={PICK_HEAD}><Sk i={1} className="h-5 md:h-6 w-[104px] md:w-[124px] rounded" /></div>
          <div className="grid grid-cols-2 gap-3 md:gap-5"><CardSk i={2} /><CardSk i={3} /></div>
        </div>
      </div>
      <div className="pt-12 md:pt-14"><div className={PICK_HEAD}><Sk i={5} className="h-5 md:h-6 w-10 md:w-12 rounded" /></div></div>
    </SkWrap>
  );
}

// ── 상점 첫 화면(세션 · 공개 여부를 받는 동안) — 스토어 줄 + (상품 목록이면) 필터 줄 · 격자.
//    list: 배너 없는 상품 목록으로 열리는가(전체 · 유형 탭 · 검색), search: 검색 결과로 열리는가(「검색 결과」 줄), slot: 스토어 줄 아래 끼우는 것(topSlot)
//    📌 2026-11-01 body — 「list」 상품 목록 · 「season」 시즌 탭(배너 · 시즌 머리 · 필터 · 두 갈래 · 격자) · 「home」 메인(배너 · 두 갈래 · 신상품 · 이번 주) · 「none」 상점 줄만(첫 그림 Suspense)
//       운영자 "상점 메인도 햇어?" — 예전엔 메인 · 시즌 탭이 상점 줄만 그리고 아래가 하얗게 비었다
export function ShopPageSk({ className = "", list, body, search = false, back = false, slot = null }: {
  className?: string; list?: boolean; body?: "list" | "theme" | "season" | "home" | "none"; search?: boolean; back?: boolean; slot?: ReactNode;
}) {
  const view = body ?? (list ? "list" : "none");
  return (
    <SkWrap className={className}>
      <StoreBarSk back={back} />
      {slot}
      {view === "home" && <HomePageSk />}
      {view === "season" && (
        <>
          <HomeBannerSk />
          <section className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
            <div className="flex items-center mb-5 h-7 md:h-8 gap-3"><Sk i={1} className="h-5 md:h-6 w-44 md:w-56 rounded" /><Sk i={1} className="ml-auto h-3 w-16 rounded-sm" /></div>
            <FilterBarSk i={2} />
          </section>
          <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 pb-32 md:pb-24">
            <SeasonPicksSk />
            <div className={GRID}>{cards(10, 6)}</div>
          </section>
        </>
      )}
      {view === "theme" && <HomeBannerSk />}
      {(view === "list" || view === "theme") && (
        <>
          <section className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
            {search && <div className="flex items-center h-[18px] mb-4"><Sk i={1} className="h-3 w-36 rounded-sm" /></div>}
            <FilterBarSk i={1} />
          </section>
          <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 pb-32 md:pb-24">
            <div className={GRID}>{cards(10, 2)}</div>
          </section>
        </>
      )}
    </SkWrap>
  );
}
