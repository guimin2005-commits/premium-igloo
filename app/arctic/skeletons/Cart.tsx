"use client";

import { Sk, SkWrap } from "./Sk";

// 📌 장바구니 로딩 뼈대(2026-11-01) — ../cart/page.tsx 의 다 불러온 화면(로그인 기준)과 같은 틀 · 같은 크기:
//    section(max-w-5xl px-6 pt-10 pb-24) → 제목(h1 3xl/4xl · 줄 36/40px · mb-8) → 격자(1단 / lg 3단 · gap-6)
//    좌 2칸: 전체 선택 줄(px-5 py-3 · rounded-xl · 칸 18px) + 상품 줄(p-5 · gap-4 · 칸 18 · 썸네일 w-20 rounded-xl · 칩 · 이름 + 기간 딱지 · 설명 | 가격 · 삭제)
//    우 1칸: 주문 요약(p-6 · rounded-2xl · lg:sticky top-24 — 제목 · 13px 줄 4개 · 선 · 예상 결제 · 단추 h-14 rounded-xl · 쿠폰 한 줄)
//    폰은 같은 반응형 클래스 그대로 — 1단으로 쌓여 요약이 목록 아래
//    📌 rows — 저장된 장바구니 줄 수(읽기 전이면 3줄). 0 이면 빈 장바구니 판(아이콘 원 · 두 줄 · 단추)
const NAME_W = ["62%", "48%", "70%", "54%", "66%", "44%"];
const DESC_W = ["78%", "64%", "84%", "58%", "72%", "68%"];
// 요약 줄 — 선택한 상품 · 상품 금액 · 보유 XP · 보유 빙옥(이름 폭 · 값 폭)
const SUM_W: [number, number][] = [[60, 28], [52, 72], [44, 84], [52, 56]];

export function CartSkeleton({ rows }: { rows?: number }) {
  const n = rows == null ? 3 : Math.min(Math.max(0, rows), 12);
  return (
    <section className="max-w-5xl mx-auto px-6 pt-10 pb-24">
      <SkWrap>
        {/* 제목 — 「장바구니 n」(빈 장바구니면 수 없음) */}
        <div className="flex items-center h-9 md:h-10 mb-8">
          <Sk i={0} className={`h-[26px] md:h-[30px] rounded-md ${n > 0 ? "w-[132px] md:w-[160px]" : "w-[112px] md:w-[134px]"}`} />
        </div>

        {n === 0 ? (
          // 빈 장바구니 판 — py-24 · 아이콘 원 w-14 · 두 줄(14px · 12px) · 단추(py-3.5 rounded-full)
          <div className="py-24 bg-white rounded-2xl border border-[#ededed]">
            <Sk i={1} className="w-14 h-14 mx-auto mb-5 rounded-full" />
            <span className="flex items-center justify-center h-5 mb-1.5"><Sk i={2} className="h-[13px] w-[160px] max-w-full rounded" /></span>
            <span className="flex items-center justify-center h-4 mb-7"><Sk i={2} className="h-[11px] w-[168px] max-w-full rounded-sm !bg-black/[0.04]" /></span>
            <span className="flex justify-center"><Sk i={3} className="h-12 w-[156px] rounded-full" /></span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 좌 — 담은 상품 */}
            <div className="lg:col-span-2">
              {/* 전체 선택 줄 — 칸 + 「전체 선택 (n/n)」 | 「전체 비우기」 */}
              <div className="flex items-center justify-between px-5 py-3 mb-3 bg-white rounded-xl border border-[#ededed]">
                <span className="flex items-center gap-2.5 h-[18px]">
                  <Sk i={1} className="w-[18px] h-[18px] rounded-md" />
                  <Sk i={1} className="h-3 w-[84px] rounded-sm" />
                </span>
                <Sk i={1} className="h-3 w-[58px] rounded-sm !bg-black/[0.04]" />
              </div>

              <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden divide-y divide-[#ededed]">
                {Array.from({ length: n }, (_, k) => (
                  <div key={k} className="p-5 flex flex-wrap sm:flex-nowrap gap-4 items-center">
                    <Sk i={2 + k} className="shrink-0 w-[18px] h-[18px] rounded-md" />
                    <Sk i={2 + k} className="shrink-0 w-20 h-20 rounded-xl" />
                    <div className="flex-1 min-w-0">
                      {/* 분류 칩(9px 알약 · 줄 24px) → 이름 + 기간 딱지(14px 줄 20px) → 설명(11px) */}
                      <span className="block h-6"><Sk i={2 + k} className="h-[18px] w-14 max-w-full rounded-full" /></span>
                      <span className="flex items-center gap-1.5 h-5">
                        <Sk i={2 + k} className="min-w-0 h-[13px] rounded" style={{ width: NAME_W[k % NAME_W.length] }} />
                        {k % 2 === 0 && <Sk i={2 + k} className="shrink-0 h-[19px] w-9 rounded" />}
                      </span>
                      <span className="flex items-center h-[16.5px] mt-0.5"><Sk i={2 + k} className="h-[10px] max-w-full rounded-sm !bg-black/[0.04]" style={{ width: DESC_W[k % DESC_W.length] }} /></span>
                    </div>
                    {/* 가격(16px 굵게 · 줄 24px) · 삭제(11px · mt-2) — 오른쪽 맞춤 */}
                    <div className="shrink-0 flex flex-col items-end">
                      <span className="flex items-center h-6"><Sk i={2 + k} className="h-4 w-[76px] rounded" /></span>
                      <span className="flex items-center h-[16.5px] mt-2"><Sk i={2 + k} className="h-[10px] w-[22px] rounded-sm !bg-black/[0.04]" /></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 우 — 주문 요약 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl border border-[#ededed] p-6 lg:sticky lg:top-24">
                <span className="flex items-center h-5 mb-5"><Sk i={1} className="h-[13px] w-16 rounded" /></span>
                <div className="space-y-2.5 mb-4">
                  {SUM_W.map(([a, b], k) => (
                    <div key={k} className="flex items-center justify-between h-[19.5px]">
                      <Sk i={2 + k} className="h-[11px] rounded-sm !bg-black/[0.04]" style={{ width: a }} />
                      <Sk i={2 + k} className="h-[11px] rounded-sm" style={{ width: b }} />
                    </div>
                  ))}
                </div>
                <div className="h-px bg-[#ededed] mb-4"></div>
                {/* 예상 결제 — 이름(14px) | 값(20px 굵게 · 줄 28px) */}
                <div className="flex items-center justify-between gap-3 h-7 mb-6">
                  <Sk i={6} className="shrink-0 h-[13px] w-20 rounded" />
                  <Sk i={6} className="h-5 w-28 rounded" />
                </div>
                <Sk i={7} className="h-14 w-full rounded-xl" />
                <span className="flex items-center h-[16.25px] mt-4"><Sk i={8} className="h-2.5 w-[220px] max-w-full rounded-sm !bg-black/[0.04]" /></span>
              </div>
            </div>
          </div>
        )}
      </SkWrap>
    </section>
  );
}
