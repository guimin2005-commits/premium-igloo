"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Reveal, LuxStyles } from "../../components/Lux";

// 구획 머리말 — 모든 구획이 같은 형태를 쓴다
const SectionHead = ({ no, title }: { no: string; title: string }) => (
  <div className="mb-4">
    <div className="flex items-baseline gap-4 mb-2">
      <span className="text-xs font-black tracking-[0.3em] text-[#e91e3f]">{no}</span>
      <div className="h-px flex-1 bg-gradient-to-r from-[#dedbd6] to-transparent"></div>
    </div>
    <h2 className="text-lg md:text-xl font-black text-[#131313] tracking-tight">{title}</h2>
  </div>
);

// 혜택 한 줄 — 이름 · 설명 · 수치를 같은 배치로 맞춘다
const BenefitRow = ({ t, d, note, v }: { t: string; d: string; note?: string; v?: string }) => (
  <div className="py-4 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6">
    <p className="text-sm font-bold text-[#131313] sm:w-32 shrink-0">{t}</p>
    <div className="min-w-0 flex-1">
      <p className="text-[13px] text-[#5a5a5a] leading-relaxed break-keep">{d}</p>
      {note && <p className="text-[11px] text-[#a3a3a3] mt-1 break-keep">{note}</p>}
    </div>
    {v && <p className="shrink-0 text-[13px] font-black text-[#e91e3f] tabular-nums sm:text-right sm:w-32">{v}</p>}
  </div>
);

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
            <span className="inline-flex items-center gap-1 text-[10px] font-black bg-[#e91e3f] text-white px-2 py-0.5 rounded shrink-0"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5"><path d="M4.5 15.75l7.5-7.5 7.5 7.5" /><path d="M4.5 19.5l7.5-7.5 7.5 7.5" /></svg>BOOSTER</span>
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

            {/* 01. 전용 기능 권한 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <SectionHead no="01" title="전용 기능 권한" />
              <div className="divide-y divide-[#ececea]">
                {[
                  { t: "전용 역할·뱃지", d: "@SERVER BOOSTER 역할과 프로필 전용 배지를 자동 지급합니다." },
                  { t: "사용자 관리 권한", d: "서버 내 일부 사용자 관리 기능을 상시 이용할 수 있습니다." },
                  { t: "권한 제한 채널", d: "별도 구매 없이 제한된 채널을 이용할 수 있습니다.", note: "권한이 없을 경우 ARCTIC에서 관련 권한 상품을 구매해야 합니다." },
                  { t: "슬로우 모드 해제", d: "채팅 대기 시간 없이 연속으로 대화할 수 있습니다.", note: "권한이 없을 경우 ARCTIC에서 관련 권한 상품을 구매해야 합니다." },
                ].map((row, idx) => (
                  <BenefitRow key={idx} {...row} />
                ))}
              </div>
            </div>
            </Reveal>

            {/* 02. XP 혜택 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <SectionHead no="02" title="경험치 혜택" />
              <div className="divide-y divide-[#ececea]">
                {[
                  { t: "부스팅 시작", d: "부스트를 시작하면 즉시 지급됩니다.", note: "추가 부스팅 시 개당 50,000 XP를 더 지급합니다.", v: "100,000 XP" },
                  { t: "상시 추가", d: "경험치 획득 조건을 채울 때마다 더해집니다.", v: "+2,000 XP" },
                  { t: "ARCTIC 환급", d: "ARCTIC에서 사용한 XP를 기준으로 환급합니다.", v: "35%" },
                  { t: "일일 출석", d: "출석체크마다 추가로 지급됩니다.", v: "10,000 XP" },
                ].map((row, idx) => (
                  <BenefitRow key={idx} {...row} />
                ))}
              </div>
            </div>
            </Reveal>

            {/* 03. 누적 유지 개월 혜택 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <SectionHead no="03" title="누적 유지 개월 혜택" />
              <div className="divide-y divide-[#ececea]">
                {[
                  { t: "RANK 01", d: "1개월 유지", v: "100,000 XP" },
                  { t: "RANK 02", d: "3개월 유지", v: "300,000 XP" },
                  { t: "RANK 03", d: "6개월 유지", v: "600,000 XP" },
                  { t: "RANK 04", d: "9개월 유지", v: "900,000 XP" },
                  { t: "RANK 06", d: "15개월 유지", v: "1,500,000 XP" },
                  { t: "RANK 07", d: "18개월 유지", v: "1,800,000 XP" },
                  { t: "RANK 08", d: "21개월 유지", v: "2,100,000 XP" },
                  { t: "RANK 09", d: "24개월 유지", v: "2,400,000 XP" },
                ].map((row, idx) => (
                  <BenefitRow key={idx} {...row} />
                ))}
              </div>
            </div>
            </Reveal>

            {/* 04. 특별 보상 — 같은 행 구성으로 이어간다 */}
            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] p-6 md:p-7">
              <SectionHead no="04" title="특별 보상" />
              {[
                {
                  rank: "RANK 05", cond: "12개월 연속 달성",
                  rows: [
                    { t: "누적 보너스", d: "즉시 수령", v: "1,200,000 XP" },
                    { t: "추가 역할", d: "@BOOSTER RANK 05 지급" },
                    { t: "상시 버프", d: "영구 결합", v: "+2,000 XP" },
                    { t: "출석 보너스", d: "일일 출석 시 영구 가산", v: "2,000 XP" },
                  ],
                },
                {
                  rank: "RANK 10", cond: "24개월 연속 달성",
                  rows: [
                    { t: "누적 보너스", d: "즉시 수령", v: "2,400,000 XP" },
                    { t: "추가 역할", d: "@BOOSTER RANK 10 지급" },
                    { t: "상시 버프", d: "영구 결합", v: "+4,000 XP" },
                    { t: "출석 보너스", d: "일일 출석 시 영구 가산", v: "5,000 XP" },
                  ],
                },
              ].map((block, idx) => (
                <div key={idx} className={idx > 0 ? "mt-8" : ""}>
                  <div className="flex items-baseline gap-2.5 mb-1">
                    <span className="text-[10px] font-black tracking-[0.25em] text-[#e91e3f] uppercase">{block.rank}</span>
                    <span className="text-[12px] font-bold text-[#5a5a5a]">{block.cond}</span>
                  </div>
                  <div className="divide-y divide-[#ececea] border-t border-[#ececea]">
                    {block.rows.map((row, i) => (
                      <BenefitRow key={i} {...row} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </Reveal>

            <Reveal>
            <div className="bg-white rounded-2xl border border-[#e2e0dc] px-6 py-5">
              <p className="text-[13px] text-[#5a5a5a] break-keep leading-relaxed">
                디스코드에서 서버 부스트를 시작하면 시스템이 자동으로 감지해 위 혜택을 지급합니다.
              </p>
            </div>
            </Reveal>
        </div>
      </section>
    </main>
  );
}
