"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";

// 📌 서버 부스터 혜택 — 내 정보에서 분리한 전용 페이지
export default function BoosterBenefitPage() {
  const { data: session } = useSession();
  const isBooster = (session?.user as any)?.isBooster || false;

  return (
    <main className="w-full flex-1 flex flex-col text-[#131313] animate-in fade-in duration-500">
      <LuxStyles />
      <section className="w-full max-w-4xl mx-auto px-6 pt-10 pb-20">
        <Link href="/profile" className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#8a8a8a] hover:text-[#131313] mb-6 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.4} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          내 정보로 돌아가기
        </Link>

        {isBooster && (
          <div className="mb-6 rounded-2xl border border-[#e2e0dc] bg-white px-5 py-4 flex items-center gap-3 break-keep">
            <span className="text-[10px] font-black bg-[#e91e3f] text-white px-2 py-0.5 rounded shrink-0">BOOSTER</span>
            <p className="text-[13px] font-bold text-[#4b4b4b]">부스터 혜택이 적용 중입니다. 아래 혜택이 자동으로 지급됩니다.</p>
          </div>
        )}

        <div className="space-y-6">
            {/* 머리말 — 내 정보와 같은 톤 */}
            <div className="mb-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="w-8 h-px bg-[#e91e3f]"></span>
                <span className="text-[10px] font-black tracking-[0.4em] text-[#8a8a8a] uppercase">Server Booster</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-[#131313] tracking-tight mb-2">서버 부스터 혜택</h1>
              <p className="text-sm text-[#5a5a5a] break-keep leading-relaxed">서버 환경 개선을 위한 후원 제도입니다. 부스트를 시작하면 아래 혜택이 자동으로 지급됩니다.</p>
            </div>

            {/* 01. 전용 기능 권한 — 헤어라인 리스트 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">01</span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#dedbd6] to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight mb-2">SERVER 전용 기능 권한</h4>
              <div className="divide-y divide-[#ececea]">
                {[
                  { t: "전용 역할 및 뱃지 지급", d: "@SERVER BOOSTER 고유 역할 부여 및 차별화된 프로필 전용 특수 배지 자동 장착", note: "" },
                  { t: "사용자 관리 권한 제공", d: "서버 내 일부 사용자 관리 부가 기능 상시 이용 가능", note: "" },
                  { t: "권한 제한 채널 이용", d: "별도의 권한 구매 없이 제한된 채널 이용 가능!", note: "* 권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다." },
                  { t: "슬로우 모드 제한 해제", d: "채팅 대기 시간 제한 없이 연속 채팅 가능!", note: "* 권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다." },
                ].map((item, idx) => (
                  <div key={idx} className="py-5 flex flex-col md:flex-row md:items-baseline gap-1.5 md:gap-8 group">
                    <p className="font-bold text-[#131313] text-sm md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{item.t}</p>
                    <div className="min-w-0">
                      <p className="text-xs md:text-[13px] text-[#8a8a8a] leading-relaxed">{item.d}</p>
                      {item.note && <p className="text-[10px] text-[#a3a3a3] mt-1">{item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            {/* 02. XP 혜택 — 헤어라인 리스트 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">02</span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#dedbd6] to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight mb-2">XP BOOSTER 경험치 혜택</h4>
              <div className="divide-y divide-[#ececea]">
                {[
                  { k: "WELCOME", t: "부스팅 시작 보너스 보상 지급!", big: "100,000", unit: "XP 즉시 지급", sub: "추가 부스팅: 개당 50,000 XP 추가 지급!" },
                  { k: "PASSIVE", t: "경험치 획득 조건 충족 시 상시 추가!", big: "+2,000", unit: "XP 상시 지급", sub: "" },
                  { k: "SHOP", t: "경험치샵 이용 전용 정산 혜택!", big: "35%", unit: "XP 환급", sub: "경험치샵 사용 금액 기준" },
                  { k: "DAILY", t: "일일 출석체크 추가 보상!", big: "10,000", unit: "XP 보너스", sub: "일일 출석체크 시 추가 지급" },
                ].map((row, idx) => (
                  <div key={idx} className="py-6 flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 group">
                    <div className="min-w-0 md:flex md:items-baseline md:gap-8">
                      <p className="font-black text-[#131313] text-sm tracking-[0.2em] md:w-52 shrink-0 group-hover:text-[#ff5c77] transition-colors">{row.k}</p>
                      <p className="text-xs text-[#8a8a8a] mt-0.5 md:mt-0">{row.t}</p>
                    </div>
                    <div className="md:text-right shrink-0">
                      <p className="leading-none">
                        <span className="text-2xl md:text-3xl font-black text-[#e91e3f] tracking-tighter">{row.big}</span>
                        <span className="text-[11px] font-bold text-[#5a5a5a] ml-2">{row.unit}</span>
                      </p>
                      {row.sub && <p className="text-[11px] text-[#a3a3a3] mt-1.5">{row.sub}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            {/* 03. RANK — 플랫 테이블 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <div className="flex items-baseline gap-4 mb-2">
                <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">03</span>
                <div className="h-px flex-1 bg-gradient-to-r from-[#dedbd6] to-transparent"></div>
              </div>
              <h4 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight mb-2">누적 유지 개월별 추가 혜택 (RANK)</h4>
              <div className="divide-y divide-[#ececea]">
                {[{ r: "RANK 01", m: "1개월", x: "100,000" }, { r: "RANK 02", m: "3개월", x: "300,000" }, { r: "RANK 03", m: "6개월", x: "600,000" }, { r: "RANK 04", m: "9개월", x: "900,000" }, { r: "RANK 06", m: "15개월", x: "1,500,000" }, { r: "RANK 07", m: "18개월", x: "1,800,000" }, { r: "RANK 08", m: "21개월", x: "2,100,000" }, { r: "RANK 09", m: "24개월", x: "2,400,000" }].map((item, idx) => (
                  <div key={idx} className="py-4 grid grid-cols-3 items-center text-sm group hover:bg-[#efedea] transition-colors">
                    <p className="text-[10px] font-black tracking-[0.2em] text-[#a3a3a3] uppercase group-hover:text-[#e91e3f] transition-colors">{item.r}</p>
                    <p className="font-bold text-[#131313] text-center">{item.m}</p>
                    <p className="text-right"><span className="text-base md:text-lg font-black text-[#e91e3f] tracking-tight">{item.x}</span><span className="text-[10px] font-bold text-[#8a8a8a] ml-1.5">XP</span></p>
                  </div>
                ))}
              </div>

              {/* 스페셜 블록 — 좌측 크림슨 라인만 남긴 플랫 구성 */}
              <div className="mt-10 space-y-10">
                {[
                  { rank: "RANK 05 SPECIAL BLOCK", title: "🏆 12개월 연속 달성", items: [<>누적 보너스 <span className="text-[#131313] font-bold">1,200,000 XP</span> 즉시 수령</>, <><strong>@BOOSTER RANK 05</strong> 역할 추가 지급</>, <>상시 고정 버프 <strong>+2,000 XP</strong> 추가 영구 결합</>, <>일일 출석 시 <span className="text-[#131313] font-bold">2,000 XP</span> 영구 가산 누적 지급</>] },
                  { rank: "RANK 10 SPECIAL BLOCK", title: "👑 24개월 연속 달성", items: [<>누적 보너스 <span className="text-[#131313] font-bold">2,400,000 XP</span> 즉시 수령</>, <><strong>@BOOSTER RANK 10</strong> 특수 역할 추가 지급</>, <>상시 고정 버프 <strong>+4,000 XP</strong> 추가 영구 결합</>, <>일일 출석 시 <span className="text-[#131313] font-bold">5,000 XP</span> 영구 가산 누적 지급</>] },
                ].map((block, idx) => (
                  <div key={idx} className="border-l-2 border-[#e91e3f] pl-5 md:pl-7">
                    <p className="text-[9px] font-black tracking-[0.25em] text-[#e91e3f] mb-1.5 uppercase">{block.rank}</p>
                    <p className="text-lg font-black text-[#131313] mb-3">{block.title}</p>
                    <div className="text-xs md:text-[13px] text-[#5a5a5a] space-y-1.5">
                      {block.items.map((it, i) => (
                        <p key={i} className="flex gap-2.5"><span className="text-[#e91e3f] shrink-0">—</span><span>{it}</span></p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </Reveal>

            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] px-6 py-5 text-center">
              <p className="text-sm text-[#4b4b4b] font-bold">📢 디스코드 서버 부스트 진행 시 시스템이 자동으로 감지하여 모든 혜택을 즉시 지급합니다!</p>
            </div>
            </Reveal>
        </div>
      </section>
    </main>
  );
}
