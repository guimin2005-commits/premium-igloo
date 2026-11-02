"use client";

import { Sk, SkWrap, CardSk } from "./Sk";

// 📌 ARCTIC 홈 로딩 뼈대(2026-11-01 운영자 "그 로딩 뼈대 ARCTIC도 해") — ../ArcticHome.tsx 다 불러온 화면 값 그대로:
//    두 갈래 큐레이션(grid md:grid-cols-2 · 왼쪽 md:pr-10 xl:pr-28 | 오른쪽 md:border-l md:pl-10 xl:pl-28) · 갈래마다 섹션 머리(제목 20/24px 굵게 + 오른쪽 12px) ·
//    카드 두 장(grid-cols-2 gap-3 md:gap-5) · 아래 「더 보기」 줄(mt-5 · 12px), 신상품 줄(폰 두 장 반 · PC 다섯 장 가로)
//    📌 기준은 로그인한 화면 — 오른쪽 머리에 부제(잔액 기준 등)가 있다. 섹션 바깥 틀(max-w-7xl · px · pt)은 ArcticHome 이 그린다

// 섹션 머리 — 실제는 items-baseline 한 줄(제목 줄 높이 28 · md 32px). 제목 칸은 글자 크기만큼, 오른쪽 작은 칸은 기준선 쪽으로 조금 내린다
function HeadSk({ i, titleW, sideW }: { i: number; titleW: string; sideW: string }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-5 h-7 md:h-8">
      <Sk i={i} className={`h-5 md:h-6 rounded ${titleW}`} />
      <Sk i={i} className={`shrink-0 mt-1.5 h-3 rounded-sm !bg-black/[0.04] ${sideW}`} />
    </div>
  );
}

// 「다른 상품 보기 →」 · 「추천 더 보기 →」 줄 — mt-5 text-right, 12px 글자 · 줄 칸 24px(부모 16px 글자의 줄 높이가 잡는다)
function MoreSk({ i, w }: { i: number; w: string }) {
  return (
    <div className="mt-5 h-6 flex items-center justify-end">
      <Sk i={i} className={`h-3 rounded-sm !bg-black/[0.04] ${w}`} />
    </div>
  );
}

// ── 두 갈래 큐레이션 — 큐레이션 <section> 안쪽만(ArcticHome 「!ready」 자리)
export function HomeCurationSk() {
  return (
    <SkWrap className="grid md:grid-cols-2 gap-10 md:gap-0">
      {/* 왼쪽 — 추천 상품(지금 잘 나가는) · 전체 › */}
      <div className="md:pr-10 xl:pr-28">
        <HeadSk i={0} titleW="w-24 md:w-28" sideW="w-9" />
        <div className="grid grid-cols-2 gap-3 md:gap-5"><CardSk i={1} /><CardSk i={2} /></div>
        <MoreSk i={5} w="w-[84px]" />
      </div>
      {/* 오른쪽 — ○○에게 맞는 · 부제(로그인 기준 — 잔액 기준 등). 폰은 왼쪽 아래로 쌓여 한 차례 늦춘다 */}
      <div className="md:border-l md:border-[#ededed] md:pl-10 xl:pl-28">
        <HeadSk i={1} titleW="w-32 md:w-40" sideW="w-16" />
        <div className="grid grid-cols-2 gap-3 md:gap-5"><CardSk i={2} /><CardSk i={3} /></div>
        <MoreSk i={6} w="w-[72px]" />
      </div>
    </SkWrap>
  );
}

// ── 신상품 줄 — 다 불러오면 큐레이션 아래에 끼어 들어와 「이번 주」가 밀려 내려갔다. 같은 자리 · 같은 칸 폭으로 미리 둔다
//    (실제: -mx-5 px-5 md:mx-0 md:px-0 가로 줄 · 카드 w-[42%] sm:w-[30%] md:w-[calc((100%-80px)/5)] · 사이 ml-3 md:ml-5 · pb-1)
export function HomeFreshSk() {
  return (
    <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14">
      <SkWrap>
        <HeadSk i={6} titleW="w-16 md:w-[72px]" sideW="w-9" />
        <div className="-mx-5 px-5 md:mx-0 md:px-0 flex overflow-hidden pb-1">
          {[0, 1, 2, 3, 4].map((k) => (
            <div key={k} className={`shrink-0 w-[42%] sm:w-[30%] md:w-[calc((100%-80px)/5)] ${k ? "ml-3 md:ml-5" : ""}`}><CardSk i={7 + k} /></div>
          ))}
        </div>
      </SkWrap>
    </section>
  );
}

// ── 배너 자리(../BannerSlider 「목록을 받는 동안」과 같은 바탕 · 여백 · 비율 — 폰 3:2 · PC 4:1)
export function HomeBannerSk() {
  return (
    <section aria-hidden className="max-w-7xl mx-auto px-5 md:px-8 pt-5 md:pt-6">
      <Sk i={0} className="md:hidden w-full" style={{ aspectRatio: "1.5" }} />
      <Sk i={0} className="hidden md:block w-full" style={{ aspectRatio: "4" }} />
    </section>
  );
}

// ── 이번 주 — 머리(제목 + 날짜) · 두 칸(h-[180px] md:h-[200px] · rounded-md · grid md:grid-cols-2 gap-4 md:gap-5)
export function HomeWeekSk() {
  return (
    <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14 pb-14">
      <SkWrap>
        <HeadSk i={12} titleW="w-16 md:w-[72px]" sideW="w-20" />
        <div className="grid md:grid-cols-2 gap-4 md:gap-5">
          <Sk i={13} className="h-[180px] md:h-[200px] rounded-md" />
          <Sk i={14} className="h-[180px] md:h-[200px] rounded-md" />
        </div>
      </SkWrap>
    </section>
  );
}

// ── 메인 본문 통째 — 배너 → 두 갈래 큐레이션 → 신상품 줄 → 이번 주(ArcticHome 순서 · 같은 바깥 틀). 상점 첫 단계(세션 · 공개 여부를 받는 동안)에 쓴다
export function HomePageSk() {
  return (
    <>
      <HomeBannerSk />
      <section className="max-w-7xl mx-auto px-5 md:px-8 pt-12 md:pt-14">
        <HomeCurationSk />
      </section>
      <HomeFreshSk />
      <HomeWeekSk />
    </>
  );
}
