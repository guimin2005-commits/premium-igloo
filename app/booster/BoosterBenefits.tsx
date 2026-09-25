"use client";

import { Reveal } from "../components/Lux";
import { InfoSec, InfoRow, InfoList } from "../components/InfoPage";

// 📌 서버 부스터 혜택 본문 — 공개 안내(/booster)와 내 정보(/profile/booster)가 이 하나를 같이 쓴다.
//    두 화면에 표를 따로 두면 문구 · 수치가 어긋난다 (옛 두 벌은 "경험치샵 환급" / "ARCTIC 환급" 으로 갈라져 있었다).

export const BOOSTER_DISCORD = "https://discord.gg/V2uW2nUczU";

const ACCESS = [
  { k: "전용 역할 · 배지", d: "@SERVER BOOSTER 고유 역할 부여 및 프로필 전용 특수 배지 자동 장착", v: "자동 지급" },
  { k: "사용자 관리 권한", d: "서버 내 일부 사용자 관리 부가 기능 상시 이용 가능", v: "상시 이용" },
  { k: "권한 제한 채널", d: "별도의 권한 구매 없이 제한된 채널 이용 가능", note: "권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다.", v: "구매 없이" },
  { k: "슬로우 모드 해제", d: "채팅 대기 시간 제한 없이 연속 채팅 가능", note: "권한이 없을 경우, ARCTIC에서 관련 권한 상품을 구매해야 합니다.", v: "제한 없음" },
];

const XP = [
  { k: "부스팅 시작", d: "부스팅 시작 보너스 보상 즉시 지급", note: "추가 부스팅 시 개당 50,000 XP 추가 지급", v: "100,000", unit: "XP" },
  { k: "상시 추가", d: "경험치 획득 조건 충족 시 상시 지급", v: "+2,000", unit: "XP" },
  { k: "ARCTIC 환급", d: "ARCTIC에서 사용한 XP 기준 환급", v: "35", unit: "%" },
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

export default function BoosterBenefits() {
  return (
    <>
      {/* 01 전용 기능 권한 */}
      <InfoSec no="01" title="전용 기능 권한" right="자동 감지 · 즉시 지급">
        <InfoList>
          {ACCESS.map((r, i) => (
            <Reveal key={r.k} delay={Math.min(i, 4) * 60}>
              <InfoRow k={r.k} d={r.d} note={r.note} v={r.v} word />
            </Reveal>
          ))}
        </InfoList>
      </InfoSec>

      {/* 02 경험치 혜택 */}
      <InfoSec no="02" title="경험치 혜택">
        <InfoList>
          {XP.map((r, i) => (
            <Reveal key={r.k} delay={Math.min(i, 4) * 60}>
              <InfoRow k={r.k} d={r.d} note={r.note} v={r.v} unit={r.unit} />
            </Reveal>
          ))}
        </InfoList>
      </InfoSec>

      {/* 03 누적 유지 개월 혜택 */}
      <InfoSec no="03" title="누적 유지 개월 혜택" right="RANK 01 – 10">
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
      </InfoSec>

      {/* 04 특별 보상 */}
      <InfoSec no="04" title="특별 보상">
        <div className="relative mt-6 md:mt-7 grid md:grid-cols-2 md:gap-x-14">
          {SPECIAL.map((b, bi) => (
            <div key={b.rank} className={bi > 0 ? "mt-10 md:mt-0" : ""}>
              <div className="flex items-baseline gap-3 pb-3 border-b border-[#131313]">
                <b className="text-[11px] font-black tracking-[0.2em] text-[#e91e3f]">{b.rank}</b>
                <span className="text-[18px] md:text-[20px] font-black tracking-tight">{b.cond}</span>
              </div>
              {b.rows.map((r) => (
                <InfoRow key={r.k} k={r.k} d={r.d} v={r.v} unit={r.unit} word={r.word} compact />
              ))}
            </div>
          ))}
        </div>
      </InfoSec>
    </>
  );
}
