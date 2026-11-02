"use client";

import { Sk, SkWrap, CardSk } from "./Sk";

// 📌 상품 상세 로딩 뼈대(../item/[id]/page.tsx) — 로그인한 화면 값 그대로 그린다(./Sk 부품만, 평평한 단색 칸):
//    경로 줄(ArcticStoreBar — h-12 md:h-[52px] · 경로 세 칸 · 인벤토리 | PC 찜 · 장바구니),
//    본문(max-w-5xl px-6 pt-8 · 폰 한 줄 → md 2열 gap-8) 좌: 정사각 그림(rounded-2xl) / 우: 유형 칩 h-6 + 희귀도 h-5 · 이름(2xl/3xl 한 줄)
//      · 가격(3xl leading-none 30px + 「/ 기간」) · 이용 기간 세 칸(py-3 rounded-xl · 65.5px) + 안내 11px · 설명 두 줄(23px)
//      · 상세 정보 네 줄(py-3 · 13px) · 보유 칸 · 찜 + 담기 + 구매(h-12),
//    아래: 효과 두 칸(bg-[#f2f2f2] py-5 · 24px 숫자) · 다른 상품 한 줄(PC 4칸 · 폰 156px 가로 줄 — CardSk)
//    📌 기간제 · 설명 · 효과 두 칸은 흔한 상품 기준 — 없는 상품이면 그만큼만 위로 당겨진다(틀 · 폭은 그대로)

// 상세 정보 값 폭 — 상품 유형 · 재고 · 구매 제한 · 지급 방식
const ROW_W = [44, 56, 48, 132];

export function ItemSkeleton() {
  return (
    <SkWrap>
      {/* 경로 줄 — ArcticStoreBar 와 같은 칸(로그인: 인벤토리 아이콘 + PC 찜 · 장바구니) */}
      <div className="w-full bg-white border-b border-[#ededed]">
        <div className="max-w-5xl mx-auto px-6 flex items-center gap-4 h-12 md:h-[52px]">
          <div className="min-w-0 flex-1 flex items-center gap-3">
            <Sk className="h-3 w-12 rounded-sm" />
            <Sk className="h-3 w-10 rounded-sm" />
            <Sk className="h-3 w-20 rounded-sm" />
          </div>
          <span className="shrink-0 w-9 h-9 flex items-center justify-center"><Sk className="w-[18px] h-[18px] rounded-md" /></span>
          <div className="hidden md:flex items-center gap-1 shrink-0 -ml-3">
            {[0, 1].map((k) => (
              <span key={k} className="w-9 h-9 flex items-center justify-center"><Sk className="w-[18px] h-[18px] rounded-md" /></span>
            ))}
          </div>
        </div>
      </div>

      <section className="max-w-5xl mx-auto px-6 pt-8 pb-32 md:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 좌 — 그림 칸(aspect-square rounded-2xl) */}
          <Sk i={1} className="aspect-square w-full rounded-2xl" />

          {/* 우 — 정보 */}
          <div className="flex flex-col">
            {/* 유형 칩 h-6 · 희귀도 알약 h-5 */}
            <div className="flex items-center gap-1.5 mb-3">
              <Sk i={1} className="h-6 w-16 rounded-full" />
              <Sk i={1} className="h-5 w-11 rounded-full" />
            </div>

            {/* 이름 — text-2xl md:text-3xl 한 줄(32 · 36px) */}
            <div className="flex items-center h-8 md:h-9 mb-3"><Sk i={2} className="h-6 md:h-7 w-44 md:w-56 rounded" /></div>

            {/* 가격 — 30px 숫자 + 「/ 기간」 */}
            <div className="flex items-center gap-2.5 h-[30px] mb-6">
              <Sk i={3} className="h-[26px] w-32 rounded" />
              <Sk i={3} className="h-[13px] w-10 rounded-sm" />
            </div>

            {/* 이용 기간 — 제목 12px · 세 칸(13px 기간 + 12px 값) · 안내 11px(폰 두 줄 · PC 한 줄) */}
            <div className="mb-6">
              <span className="flex items-center h-4 mb-2"><Sk i={4} className="h-[11px] w-12 rounded-sm" /></span>
              <div className="flex gap-2">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="flex-1 min-w-0 py-3 rounded-xl border border-[#ededed] flex flex-col items-center">
                    <span className="flex items-center h-[19.5px]"><Sk i={4} className="h-3 w-9 rounded-sm" /></span>
                    <span className="flex items-center h-[18px] mt-0.5"><Sk i={4} className="h-[11px] w-14 max-w-full rounded-sm !bg-black/[0.04]" /></span>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <span className="flex items-center h-[16.5px]"><Sk i={4} className="h-[10px] w-full md:w-4/5 rounded-sm !bg-black/[0.04]" /></span>
                <span className="flex items-center h-[16.5px] md:hidden"><Sk i={4} className="h-[10px] w-1/4 rounded-sm !bg-black/[0.04]" /></span>
              </div>
            </div>

            {/* 설명 — 14px · 줄 높이 23px 두 줄 */}
            <div className="mb-6">
              <span className="flex items-center h-[23px]"><Sk i={5} className="h-[13px] w-full rounded-sm" /></span>
              <span className="flex items-center h-[23px]"><Sk i={5} className="h-[13px] w-3/5 rounded-sm" /></span>
            </div>

            {/* 상세 정보 — 이름 12px | 값 13px, 줄 py-3 */}
            <div className="rounded-xl bg-white border border-[#ededed] divide-y divide-[#ededed] mb-6">
              {ROW_W.map((w, k) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-3">
                  <Sk i={6} className="shrink-0 h-[11px] w-14 rounded-sm !bg-black/[0.04]" />
                  <span className="flex items-center h-[19.5px]"><Sk i={6} className="h-3 rounded-sm" style={{ width: w }} /></span>
                </div>
              ))}
            </div>

            {/* 보유 XP · 빙옥 칸(로그인) */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-white border border-[#ededed] mb-4">
              <span className="flex items-center h-[19.5px]"><Sk i={7} className="h-3 w-7 rounded-sm" /></span>
              <Sk i={7} className="h-3 w-36 rounded-sm" />
            </div>

            {/* 액션 — 찜(원) · 담기 · 구매 */}
            <div className="mt-auto flex gap-2">
              <Sk i={8} className="w-12 h-12 shrink-0 rounded-full" />
              <Sk i={8} className="flex-1 h-12 rounded-full" />
              <Sk i={8} className="flex-1 h-12 rounded-full !bg-black/[0.12]" />
            </div>
          </div>
        </div>

        {/* 효과 — 제목 16px · 칸(bg-[#f2f2f2] px-5 py-5 · 이름 12px + 24px 숫자) */}
        <div className="mt-14 pt-10 border-t border-[#ededed]">
          <span className="flex items-center h-6 mb-5"><Sk i={9} className="h-4 w-10 rounded" /></span>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((k) => (
              <div key={k} className="flex flex-col bg-[#f2f2f2] px-5 py-5">
                <span className="flex items-center h-[18px]"><Sk i={10} className="h-[11px] w-20 max-w-full rounded-sm" /></span>
                <span className="flex items-center h-6 mt-2.5"><Sk i={10} className="h-[22px] w-24 max-w-full rounded" /></span>
              </div>
            ))}
          </div>
        </div>

        {/* 다른 상품 — 머리 줄 + 카드 한 줄(PC 4칸 · 폰 가로 줄 156px, 넘침은 이 줄 안에서만) */}
        <div className="mt-16 pt-10 border-t border-[#ededed]">
          <div className="flex items-center justify-between gap-4 h-6 mb-5">
            <Sk i={11} className="h-4 w-40 rounded" />
            <Sk i={11} className="shrink-0 h-3 w-12 rounded-sm" />
          </div>
          <div className="-mx-6 px-6 -my-2 py-2 flex gap-3 overflow-hidden md:mx-0 md:px-0 md:my-0 md:py-0 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="shrink-0 w-[156px] md:w-auto"><CardSk i={12 + k} /></div>
            ))}
          </div>
        </div>
      </section>
    </SkWrap>
  );
}
