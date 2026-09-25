"use client";

import React from "react";
import { Reveal } from "../components/Lux";
import BackLink from "../components/BackLink";

// 📌 서버 부스터 혜택 — 비로그인 유저도 볼 수 있는 공개 페이지 (부스팅 유도)
//    화이트 & 블랙: 홈의 번호 섹션(워터마크 · 빨간 라벨 · 헤어라인) + 헤어라인 줄 목록.
//    상자 · 격자 · 그림자 · 다크 히어로는 쓰지 않는다.

const DISCORD = "https://discord.gg/V2uW2nUczU";

// 번호 섹션 — 홈(app/page.tsx)의 Sec 골격을 본문 폭 안으로
function Sec({ no, title, right, children }: { no: string; title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="relative border-b border-[#ededed] py-12 md:py-14 last:border-b-0">
      <div aria-hidden className="absolute -top-1 md:-top-2 left-0 text-[70px] md:text-[120px] font-black tracking-[-0.04em] leading-none text-[#131313]/[0.05] pointer-events-none select-none">{no}</div>
      <Reveal>
        <div className="relative flex items-center gap-3.5 mb-3.5">
          <b className="text-[11px] font-black tracking-[0.3em] text-[#e91e3f]">{no}</b>
          <i className="h-px flex-1 bg-gradient-to-r from-[#131313]/20 to-transparent" />
          {right && <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{right}</span>}
        </div>
        <h2 className="relative text-[24px] md:text-[30px] font-black tracking-tight leading-tight break-keep">{title}</h2>
      </Reveal>
      {children}
    </section>
  );
}

// 헤어라인 줄 — 모바일은 [이름 · 값] 한 줄 + 설명 아래, 데스크톱은 [이름 · 설명 · 값] 한 줄
function Row({ k, d, note, v, unit, word, compact = false }: { k: string; d?: string; note?: string; v?: string; unit?: string; word?: boolean; compact?: boolean }) {
  return (
    <div className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-5 md:gap-x-6 py-[18px] border-b border-[#ededed]">
      <p className={`order-1 flex-1 min-w-0 sm:flex-none ${compact ? "sm:w-[108px]" : "sm:w-[176px]"} text-[15px] md:text-[16px] font-extrabold tracking-tight break-keep`}>{k}</p>
      {v && (
        <p className={`order-2 sm:order-3 shrink-0 ml-auto sm:ml-0 text-right whitespace-nowrap ${word ? "text-[13px] font-extrabold text-[#5a5a5a]" : "text-[18px] md:text-[20px] font-black tracking-[-0.02em] tabular-nums"}`}>
          {v}
          {unit && <span className="ml-1.5 text-[11px] font-bold tracking-[0.04em] text-[#8a8a8a]">{unit}</span>}
        </p>
      )}
      <div className="order-3 sm:order-2 w-full sm:w-auto sm:flex-1 min-w-0 mt-1 sm:mt-0">
        {d && <p className="text-[13px] leading-relaxed text-[#5a5a5a] break-keep">{d}</p>}
        {note && <p className="mt-1 text-[11px] leading-relaxed text-[#a3a3a3] break-keep">{note}</p>}
      </div>
    </div>
  );
}

// 03 사다리 한 줄
function RankRow({ no, m, v, unit, special = false }: { no: string; m: string; v: string; unit?: string; special?: boolean }) {
  return (
    <div className="flex items-baseline gap-4 py-4 border-b border-[#ededed]">
      <span className={`w-[68px] md:w-[76px] shrink-0 text-[11px] font-bold tracking-[0.08em] ${special ? "text-[#e91e3f]" : "text-[#8a8a8a]"}`}>{no}</span>
      <span className={`flex-1 min-w-0 text-[15px] md:text-[16px] font-extrabold tracking-tight ${special ? "text-[#e91e3f]" : ""}`}>{m}</span>
      <span className={`shrink-0 text-right whitespace-nowrap ${special ? "text-[12px] font-extrabold text-[#e91e3f]" : "text-[17px] md:text-[18px] font-black tracking-[-0.02em] tabular-nums"}`}>
        {v}
        {unit && <span className="ml-1.5 text-[11px] font-bold tracking-[0.04em] text-[#8a8a8a]">{unit}</span>}
      </span>
    </div>
  );
}

const ACCESS = [
  { k: "전용 역할 · 배지", d: "@SERVER BOOSTER 고유 역할 부여 및 프로필 전용 특수 배지 자동 장착", v: "자동 지급" },
  { k: "사용자 관리 권한", d: "서버 내 일부 사용자 관리 부가 기능 상시 이용 가능", v: "상시 이용" },
  { k: "권한 제한 채널", d: "별도의 권한 구매 없이 제한된 채널 이용 가능", note: "권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다.", v: "구매 없이" },
  { k: "슬로우 모드 해제", d: "채팅 대기 시간 제한 없이 연속 채팅 가능", note: "권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다.", v: "제한 없음" },
];

const XP = [
  { k: "부스팅 시작", d: "부스팅 시작 보너스 보상 즉시 지급", note: "추가 부스팅 시 개당 50,000 XP 추가 지급", v: "100,000", unit: "XP" },
  { k: "상시 추가", d: "경험치 획득 조건 충족 시 상시 지급", v: "+2,000", unit: "XP" },
  { k: "경험치샵 환급", d: "경험치샵 이용 전용 정산 혜택 — 경험치샵 사용 금액 기준 환급", v: "35", unit: "%" },
  { k: "일일 출석", d: "일일 출석체크 시 추가 보너스 지급", v: "10,000", unit: "XP" },
];

const RANKS_L = [
  { no: "RANK 01", m: "1개월", v: "100,000", unit: "XP" },
  { no: "RANK 02", m: "3개월", v: "300,000", unit: "XP" },
  { no: "RANK 03", m: "6개월", v: "600,000", unit: "XP" },
  { no: "RANK 04", m: "9개월", v: "900,000", unit: "XP" },
  { no: "RANK 05", m: "12개월", v: "특별 보상 · 04", special: true },
];

const RANKS_R = [
  { no: "RANK 06", m: "15개월", v: "1,500,000", unit: "XP" },
  { no: "RANK 07", m: "18개월", v: "1,800,000", unit: "XP" },
  { no: "RANK 08", m: "21개월", v: "2,100,000", unit: "XP" },
  { no: "RANK 09", m: "24개월", v: "2,400,000", unit: "XP" },
  { no: "RANK 10", m: "24개월 연속", v: "특별 보상 · 04", special: true },
];

const SPECIAL = [
  {
    rank: "RANK 05",
    cond: "12개월 연속 달성",
    rows: [
      { k: "누적 보너스", d: "즉시 수령", v: "1,200,000", unit: "XP" },
      { k: "추가 역할", d: "역할 추가 지급", v: "@BOOSTER RANK 05", word: true },
      { k: "상시 버프", d: "상시 고정 버프 영구 결합", v: "+2,000", unit: "XP" },
      { k: "출석 보너스", d: "일일 출석 시 영구 가산 누적 지급", v: "2,000", unit: "XP" },
    ],
  },
  {
    rank: "RANK 10",
    cond: "24개월 연속 달성",
    rows: [
      { k: "누적 보너스", d: "즉시 수령", v: "2,400,000", unit: "XP" },
      { k: "추가 역할", d: "특수 역할 추가 지급", v: "@BOOSTER RANK 10", word: true },
      { k: "상시 버프", d: "상시 고정 버프 영구 결합", v: "+4,000", unit: "XP" },
      { k: "출석 보너스", d: "일일 출석 시 영구 가산 누적 지급", v: "5,000", unit: "XP" },
    ],
  },
];

export default function BoosterPage() {
  return (
    <main className="w-full flex-1 flex flex-col text-[#131313]">
      <section className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-10 md:pt-12 flex-1">
        <BackLink href="/" label="홈" inline className="mb-6" />

        {/* 제목 */}
        <div className="border-b border-[#131313] pb-5">
          <h1 className="text-[30px] md:text-[34px] font-black tracking-tight leading-none">서버 부스터</h1>
          <p className="mt-3 text-[14px] text-[#5a5a5a] break-keep">부스트를 시작하면 아래 혜택이 자동으로 지급됩니다.</p>
        </div>

        {/* 01 전용 기능 권한 */}
        <Sec no="01" title="전용 기능 권한" right="자동 감지 · 즉시 지급">
          <div className="relative mt-6 md:mt-7 border-t border-[#131313]">
            {ACCESS.map((r, i) => (
              <Reveal key={r.k} delay={Math.min(i, 4) * 60}>
                <Row k={r.k} d={r.d} note={r.note} v={r.v} word />
              </Reveal>
            ))}
          </div>
        </Sec>

        {/* 02 경험치 혜택 */}
        <Sec no="02" title="경험치 혜택">
          <div className="relative mt-6 md:mt-7 border-t border-[#131313]">
            {XP.map((r, i) => (
              <Reveal key={r.k} delay={Math.min(i, 4) * 60}>
                <Row k={r.k} d={r.d} note={r.note} v={r.v} unit={r.unit} />
              </Reveal>
            ))}
          </div>
        </Sec>

        {/* 03 누적 유지 개월 혜택 */}
        <Sec no="03" title="누적 유지 개월 혜택" right="RANK 01 – 10">
          <div className="relative mt-6 md:mt-7 grid md:grid-cols-2 md:gap-x-14">
            <div className="border-t border-[#131313]">
              {RANKS_L.map((r) => (
                <RankRow key={r.no} no={r.no} m={r.m} v={r.v} unit={r.unit} special={r.special} />
              ))}
            </div>
            <div className="md:border-t md:border-[#131313]">
              {RANKS_R.map((r) => (
                <RankRow key={r.no} no={r.no} m={r.m} v={r.v} unit={r.unit} special={r.special} />
              ))}
            </div>
          </div>
        </Sec>

        {/* 04 특별 보상 */}
        <Sec no="04" title="특별 보상">
          <div className="relative mt-6 md:mt-7 grid md:grid-cols-2 md:gap-x-14">
            {SPECIAL.map((b, bi) => (
              <div key={b.rank} className={bi > 0 ? "mt-10 md:mt-0" : ""}>
                <div className="flex items-baseline gap-3 pb-3 border-b border-[#131313]">
                  <b className="text-[11px] font-black tracking-[0.2em] text-[#e91e3f]">{b.rank}</b>
                  <span className="text-[18px] md:text-[20px] font-black tracking-tight">{b.cond}</span>
                </div>
                {b.rows.map((r) => (
                  <Row key={r.k} k={r.k} d={r.d} v={r.v} unit={r.unit} word={r.word} compact />
                ))}
              </div>
            ))}
          </div>
        </Sec>

        {/* 부스트 */}
        <div className="pt-10 pb-24 md:pb-16">
          <a href={DISCORD} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center h-12 px-8 rounded-full bg-[#131313] hover:bg-black text-white text-[14px] font-extrabold transition-colors">
            서버에서 부스트하기
          </a>
        </div>
      </section>
    </main>
  );
}
