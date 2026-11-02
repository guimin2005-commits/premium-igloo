"use client";

import { Sk, SkWrap } from "./Sk";

// 📌 결제 로딩 뼈대(../checkout/page.tsx) — 로그인한 화면 · 장바구니 결제(쿠폰 칸 있음 · 일반 상품 → 빙옥 사용 칸 있음) 기준, 다 불러온 화면과 같은 틀 · 같은 크기:
//    돌아가기 줄(inline-flex · 12px) · 제목(text-3xl/4xl → 줄 36/40px) · 격자 1 → lg 2 : 1(gap-6)
//    왼쪽 — 주문 상품 판(머리 py-4 · 줄 px-6 py-4 · 썸네일 w-14 rounded-xl · 이름 14px · 분류 10px · 가격) · 약관 판(p-6 · 체크 w-5 · 13px leading-relaxed, 폰은 두 줄)
//    오른쪽 — 결제 정보 판(p-6 · lg sticky): 쿠폰(보유 쿠폰 단추 · 또는 줄 · 코드 입력 + 적용) · 빙옥 사용(입력 min-h-9 · 전액 사용 알약 · 보유) · 상품 금액 줄 ·
//    결제 XP(text-xl) · 잔액 상자(#f2f2f2 · 세 줄) · 결제 단추(py-4) · 약관 안내 한 줄 · 아래 안내(10px leading-relaxed — 폰 · PC 두 줄, 그 사이 한 줄)
//    📌 줄 높이는 글자 크기 × 줄 높이 비율을 em 으로 그대로(h-[1.5em] 등) — 칸만 작게 그려도 줄 자리는 같다
//    rows — 장바구니 줄 수(불러오기 전에 이미 안다). 세트 구성 줄 · 수령 정보 판 · 할인 줄은 상품을 받아야 알아 뺀다

const NAME_W = ["62%", "48%", "70%", "54%", "66%", "44%", "58%", "50%"];

export default function CheckoutSkeleton({ rows = 1 }: { rows?: number }) {
  const n = Math.max(1, Math.min(12, Math.floor(rows) || 1));
  const last = 2 + n; // 왼쪽 약관 판 차례
  return (
    <SkWrap className="max-w-5xl mx-auto px-6 pt-10 pb-20">
      {/* 돌아가기 줄 — BackLink(inline · mb-5)와 같은 inline-flex 줄(아이콘 14px + 이름 줄 18px) */}
      <span className="inline-flex items-center gap-1.5 text-[12px] mb-5">
        <Sk i={0} className="w-3.5 h-3.5 rounded-sm" />
        <span className="flex items-center h-[1.5em]"><Sk i={0} className="h-[11px] w-11 rounded-sm" /></span>
      </span>
      {/* 제목 */}
      <div className="h-9 md:h-10 mb-10 flex items-center"><Sk i={0} className="h-7 md:h-8 w-[60px] md:w-[72px] rounded-md" /></div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽 — 주문 상품 · 약관 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-[#ededed] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ededed]">
              <span className="flex items-center h-5"><Sk i={1} className="h-3.5 w-[68px] rounded" /></span>
            </div>
            <div className="divide-y divide-[#ededed]">
              {Array.from({ length: n }, (_, k) => (
                <div key={k} className="px-6 py-4 flex gap-4 items-center">
                  <Sk i={2 + k} className="w-14 h-14 rounded-xl shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="flex items-center h-5"><Sk i={2 + k} className="h-[13px] max-w-full rounded" style={{ width: NAME_W[k % NAME_W.length] }} /></span>
                    <span className="flex items-center h-[15px] mt-0.5"><Sk i={2 + k} className="h-[9px] w-24 rounded-sm !bg-black/[0.04]" /></span>
                  </div>
                  <span className="shrink-0 flex items-center h-5"><Sk i={2 + k} className="h-[13px] w-[72px] rounded" /></span>
                </div>
              ))}
            </div>
          </div>

          {/* 약관 동의 — 제목 · 체크 두 줄(글 13px leading-relaxed — 폰은 줄마다 두 줄로 접힌다) */}
          <div className="bg-white rounded-2xl border border-[#ededed] p-6">
            <span className="flex items-center h-5 mb-4"><Sk i={last} className="h-3.5 w-14 rounded" /></span>
            {[0, 1].map((k) => (
              <div key={k} className={`flex items-start gap-3 ${k === 0 ? "mb-3" : ""}`}>
                <Sk i={last + k} className="w-5 h-5 rounded-md shrink-0" />
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed">
                  <span className="flex items-center h-[1.625em]"><Sk i={last + k} className="h-[11px] max-w-full rounded-sm" style={{ width: k === 0 ? 300 : 340 }} /></span>
                  <span className="flex sm:hidden items-center h-[1.625em]"><Sk i={last + k} className="h-[11px] max-w-full rounded-sm" style={{ width: k === 0 ? 120 : 150 }} /></span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽 — 결제 정보 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-[#ededed] p-6 lg:sticky lg:top-24">
            <span className="flex items-center h-5 mb-5"><Sk i={1} className="h-3.5 w-14 rounded" /></span>

            {/* 쿠폰 — 이름 줄(11px) · 보유 쿠폰 단추(12px + 10px 두 줄) · 또는 줄 · 코드 입력 + 적용 */}
            <div className="mb-5">
              <span className="flex items-center h-[16.5px] mb-2"><Sk i={2} className="h-[10px] w-12 rounded-sm" /></span>
              <div className="px-4 py-3 mb-2 rounded-xl border border-[#ededed]">
                <span className="flex items-center h-[18px]"><Sk i={2} className="h-[11px] w-28 rounded-sm" /></span>
                <span className="flex items-center h-[15px] mt-0.5"><Sk i={2} className="h-[9px] w-36 max-w-full rounded-sm !bg-black/[0.04]" /></span>
              </div>
              <div className="flex items-center gap-2 my-2">
                <span className="flex-1 h-px bg-[#ededed]"></span>
                <span className="flex items-center h-[15px]"><Sk i={3} className="h-[9px] w-[58px] rounded-sm !bg-black/[0.04]" /></span>
                <span className="flex-1 h-px bg-[#ededed]"></span>
              </div>
              <div className="flex gap-2">
                <span className="flex-1 min-w-0 rounded-lg border border-[#ededed] px-3 py-2.5 text-[13px]">
                  <span className="flex items-center h-[1.5em]"><Sk i={3} className="h-[11px] w-20 rounded-sm !bg-black/[0.04]" /></span>
                </span>
                <Sk i={3} className="shrink-0 w-14 rounded-lg !bg-black/[0.12]" />
              </div>
            </div>

            {/* 빙옥 사용 — 이름 · 입력(min-h-9 · 88px) · 전액 사용 알약 · 보유, 아래 환산 한 줄(10px) */}
            <div className="mb-5">
              <div className="flex items-center gap-2 h-9">
                <Sk i={4} className="shrink-0 h-[10px] w-11 rounded-sm" />
                <Sk i={4} className="min-w-0 flex-1 max-w-[88px] h-9 rounded-lg" />
                <Sk i={4} className="shrink-0 h-[26px] w-[66px] rounded-full" />
                <Sk i={4} className="ml-auto shrink-0 h-[10px] w-14 rounded-sm !bg-black/[0.04]" />
              </div>
              <span className="flex items-center h-[15px] mt-1.5"><Sk i={4} className="h-[9px] w-24 rounded-sm !bg-black/[0.04]" /></span>
            </div>

            {/* 상품 금액 줄(13px) */}
            <div className="text-[13px]">
              <div className="flex items-center justify-between h-[1.5em]"><Sk i={5} className="h-3 w-[86px] rounded-sm" /><Sk i={5} className="h-3 w-20 rounded-sm" /></div>
            </div>
            {/* 결제 XP — 큰 숫자(text-xl → 줄 28px) */}
            <div className="mt-4 pt-4 border-t border-[#ededed]">
              <div className="flex items-center justify-between h-7"><Sk i={6} className="h-3.5 w-14 rounded" /><Sk i={6} className="h-5 w-28 rounded" /></div>
            </div>

            {/* 잔액 — 보유 XP · 결제 후 XP · 결제 후 빙옥 */}
            <div className="mt-4 mb-6 bg-[#f2f2f2] px-4 py-3.5 space-y-2 text-[13px]">
              {[0, 1, 2].map((k) => (
                <div key={k} className="flex items-center justify-between h-[1.5em]">
                  <Sk i={7 + k} className="h-3 w-16 rounded-sm !bg-black/[0.07]" />
                  <Sk i={7 + k} className="h-3 w-24 rounded-sm !bg-black/[0.07]" />
                </div>
              ))}
            </div>

            {/* 결제 단추(py-4 + 16px 줄) · 약관 안내 한 줄(11px) */}
            <Sk i={10} className="w-full h-14 rounded-xl" />
            <div className="mt-3 flex justify-center items-center h-[16.5px]"><Sk i={10} className="h-[10px] w-28 rounded-sm !bg-black/[0.04]" /></div>

            {/* 아래 안내(10px leading-relaxed) — 폰 · PC 두 줄, sm ~ lg 한 줄 */}
            <div className="mt-4 text-[10px] leading-relaxed">
              <span className="flex items-center h-[1.625em]"><Sk i={11} className="h-2 w-full rounded-sm !bg-black/[0.04]" /></span>
              <span className="flex sm:hidden lg:flex items-center h-[1.625em]"><Sk i={11} className="h-2 w-2/3 rounded-sm !bg-black/[0.04]" /></span>
            </div>
          </div>
        </div>
      </div>
    </SkWrap>
  );
}
