"use client";

import { Sk, SkWrap } from "./Sk";

// 📌 구매 내역 로딩 뼈대(2026-11-01 운영자 "그 로딩 뼈대 ARCTIC도 해") — ../orders/page.tsx 로그인한 화면(내역 있음) 값 그대로:
//    제목(text-3xl/4xl · 줄 36/40px · mb-8) → 요약 세 칸(rounded-2xl 테 · 칸 사이 선 · px-4 py-5 · 숫자 xl/2xl + 10px 라벨)
//    → 상태 칩 여섯(h-8 알약 · gap-2 · 폰은 두 줄로 접힘) → 주문 줄(rounded-2xl 테 · 줄 사이 선 · p-5 · 상태 알약 + 분류 · 이름 · 시각 | 금액 · 단위, 안내 한 줄)
//    📌 경로 줄 · 푸터 · 하단바는 page.tsx 가 진짜를 그대로 그린다(여기는 <section> 안쪽만)

// 칩 폭 — 전체 · 처리 대기 · 완료 · 취소 · 환불 · 기간 만료(12px 굵게 + px-3.5 + 테)
const CHIP_W = [54, 81, 54, 54, 54, 81];
// 요약 숫자 폭(폰 20px 글자 기준, PC 는 em 으로 같이 커짐) — 전체 주문 · 처리 대기 · 사용한 XP
const SUM_W = [26, 14, 64];
// 주문 줄 — 상태 알약 · 분류 · 이름 · 시각 줄 · 금액 · 안내 폭(px)
const ROWS = [
  { pill: 59, kind: 43, name: 104, date: 94, price: 60, desc: 150 },
  { pill: 36, kind: 30, name: 72, date: 128, price: 52, desc: 113 },
  { pill: 36, kind: 43, name: 120, date: 94, price: 68, desc: 113 },
  { pill: 36, kind: 20, name: 56, date: 94, price: 44, desc: 113 },
  { pill: 36, kind: 30, name: 88, date: 94, price: 52, desc: 113 },
];

export function OrdersSkeleton() {
  return (
    <SkWrap className="max-w-4xl mx-auto px-6 pt-10 pb-24">
      {/* 제목 */}
      <div className="flex items-center h-9 md:h-10 mb-8">
        <Sk i={0} className="h-[26px] md:h-[30px] w-[121px] md:w-[145px] rounded-md" />
      </div>

      {/* 요약 — 전체 주문 · 처리 대기 · 사용한 XP */}
      <div className="grid grid-cols-3 bg-white rounded-2xl border border-[#ededed] divide-x divide-[#ededed] mb-6 overflow-hidden">
        {SUM_W.map((w, k) => (
          <div key={k} className="px-4 py-5 flex flex-col items-center">
            {/* 숫자 칸은 글자 크기(xl → 2xl)를 따라 em 으로 — 폰 · PC 폭이 같이 커진다 */}
            <span className="flex items-center h-7 md:h-8 text-xl md:text-2xl">
              <Sk i={1} className="rounded" style={{ height: "0.9em", width: `${w / 20}em` }} />
            </span>
            <span className="flex items-center h-[15px] mt-1">
              <Sk i={1} className="h-[9px] w-[50px] rounded-sm !bg-black/[0.04]" />
            </span>
          </div>
        ))}
      </div>

      {/* 상태 칩 — 첫 칸(전체)이 켜진 칩 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CHIP_W.map((w, k) => (
          <Sk key={k} i={2} className={`h-8 rounded-full ${k === 0 ? "!bg-black/[0.12]" : ""}`} style={{ width: w }} />
        ))}
      </div>

      {/* 주문 줄 */}
      <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden divide-y divide-[#ededed]">
        {ROWS.map((r, k) => (
          <div key={k} className="p-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1 h-[19px]">
                  <Sk i={3 + k} className="shrink-0 h-[19px] rounded-full" style={{ width: r.pill }} />
                  <Sk i={3 + k} className="h-[9px] rounded-sm !bg-black/[0.04]" style={{ width: r.kind }} />
                </div>
                <span className="flex items-center h-5">
                  <Sk i={3 + k} className="h-[13px] max-w-full rounded" style={{ width: r.name }} />
                </span>
                <span className="flex items-center h-[16.5px] mt-0.5">
                  <Sk i={3 + k} className="h-[10px] max-w-full rounded-sm !bg-black/[0.04]" style={{ width: r.date }} />
                </span>
              </div>
              <div className="shrink-0 flex flex-col items-end">
                <span className="flex items-center h-6">
                  <Sk i={3 + k} className="h-[15px] rounded" style={{ width: r.price }} />
                </span>
                <span className="flex items-center h-[15px]">
                  <Sk i={3 + k} className="h-[9px] w-3.5 rounded-sm !bg-black/[0.04]" />
                </span>
              </div>
            </div>
            <span className="flex items-center h-[16.5px]">
              <Sk i={3 + k} className="h-[10px] max-w-full rounded-sm !bg-black/[0.04]" style={{ width: r.desc }} />
            </span>
          </div>
        ))}
      </div>
    </SkWrap>
  );
}
