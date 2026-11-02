"use client";

// 📌 LEVEL 탭 로딩 뼈대(2026-10-31 운영자 "랭킹창 등 들어갈 때 로딩되는 탭 좀 개선 · 모든 탭") — 다 불러온 화면과 같은 틀 · 같은 크기로 미리 그린다.
//    다 불러오면 그 자리에 그대로 채워져 화면이 튀지 않는다(예전: 둥근 회색 칸 몇 개 → 다 불러오면 모양이 확 바뀜).
//    📌 기준은 로그인한 화면(운영자 "왜 자꾸 로그아웃 기준 뼈대야 · 당연히 로그인 기준이지")
//    · 평평한 단색 칸만(그라데이션 · 번지는 빛 없음). 위에서 아래로 차례로 옅어졌다 진해진다(animate-pulse + 칸마다 늦춤)
//    · 크기는 실제 화면 값 그대로 — 랭킹 줄(page.js rankLine · py-3.5 + 이름 13px · Lv 11px), 시상대(사진 w-20/28 · w-14/20, 단상 h-16/24 · h-10/16 · h-7/11),
//      TOP 10 줄(Hud.js RankRows · h-[46px]), 대시보드(그리드 4 : 8 · 카드 rounded-3xl · 이벤트 띠 h-14 + XP 테이블 168px)

const wave = (i) => ({ animationDelay: `${Math.round(i * 90)}ms` });
// 칸 하나 — light: 흰 바탕용, dark: 프로필 카드(먹 바탕)용
function Sk({ className = "", i = 0, dark = false, style }) {
  return <span aria-hidden className={`block animate-pulse ${dark ? "bg-white/[0.07]" : "bg-black/[0.06]"} ${className}`} style={{ ...wave(i), ...style }} />;
}
const NAME_W = [64, 48, 72, 44, 58, 52, 66, 40, 56, 50];

// ── 랭킹 탭 — 시상대(첫 쪽만) + 순위 줄
export function RankListSkeleton({ podium = true, rows = 7 }) {
  return (
    <div role="status" aria-label="불러오는 중">
      {podium && (
        <div className="relative mb-10 pt-6">
          <div className="relative grid grid-cols-3 gap-2 sm:gap-5 items-end">
            {[2, 1, 3].map((r, k) => {
              const first = r === 1;
              return (
                <div key={r} className="flex flex-col items-center min-w-0">
                  {first && <Sk i={k} className="w-6 h-6 sm:w-7 sm:h-7 mb-1.5 rounded-md" />}
                  <Sk i={k} className={`rounded-full ${first ? "w-20 h-20 sm:w-28 sm:h-28" : "w-14 h-14 sm:w-20 sm:h-20"}`} />
                  <Sk i={k + 1} className="mt-5 h-[14px] w-14 sm:w-20 rounded" />
                  <Sk i={k + 1} className="mt-2 h-6 sm:h-[26px] w-16 sm:w-20 rounded-full" />
                  <Sk i={k + 2} className="mt-2 h-[14px] w-20 sm:w-24 rounded" />
                  <Sk i={k + 2} className={`mt-4 w-full rounded-t-2xl !bg-black/[0.035] ${first ? "h-16 sm:h-24" : r === 2 ? "h-10 sm:h-16" : "h-7 sm:h-11"}`} />
                </div>
              );
            })}
          </div>
          <div aria-hidden className="relative h-px bg-black/[0.10]"></div>
        </div>
      )}
      <div className="border-y border-black/[0.08] divide-y divide-black/[0.06]">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3.5 py-3.5">
            <span className="shrink-0 w-9 flex justify-center"><Sk i={i + 3} className="h-3 w-4 rounded-sm" /></span>
            <div className="min-w-0 flex-1">
              <span className="flex items-center h-[19px]"><Sk i={i + 3} className="h-[13px] rounded" style={{ width: NAME_W[i % NAME_W.length] }} /></span>
              <span className="flex items-center h-[16px] mt-0.5"><Sk i={i + 3} className="h-[10px] w-11 rounded-sm !bg-black/[0.04]" /></span>
            </div>
            <Sk i={i + 3} className="h-[13px] w-24 sm:w-28 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 대시보드 서버 랭킹 TOP 10 — 줄 h-[46px](Hud.js RankRows 와 같은 칸)
export function TopListSkeleton({ rows = 10, strongTop = false }) {
  return (
    <div role="status" aria-label="불러오는 중" className={`border-t ${strongTop ? "border-[#131313]" : "border-[#ededed]"}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-[11px] h-[46px] border-b border-[#ededed]">
          <span className="shrink-0 w-7 h-7 flex items-center justify-center">
            <Sk i={i} className={i < 3 ? "w-7 h-7 rounded-md" : "w-3 h-3 rounded-sm"} />
          </span>
          <span className="min-w-0 flex-1"><Sk i={i} className="h-[13px] rounded" style={{ width: NAME_W[i % NAME_W.length] }} /></span>
          <span className="shrink-0 w-12 flex justify-end"><Sk i={i} className="h-[10px] w-9 rounded-sm !bg-black/[0.04]" /></span>
          <span className="shrink-0 w-[92px] flex justify-end"><Sk i={i} className="h-[13px] w-[68px] rounded" /></span>
        </div>
      ))}
    </div>
  );
}

// ── 「내 순위」 · 「오늘」 판 — border-t 먹 · h-[92px] · 큰 숫자 + 막대 h-2 + 작은 줄(page.js 대시보드 서버 랭킹 · 획득 피드 위 판)
export function PanelSkeleton({ i = 0 }) {
  return (
    <div aria-hidden className="border-t border-[#131313] pt-3.5 pb-3 h-[92px]">
      <div className="flex items-center justify-between gap-3"><Sk i={i} className="h-[11px] w-12 rounded-sm" /><Sk i={i} className="h-5 w-24 rounded" /></div>
      <Sk i={i} className="h-2 mt-2.5 rounded-full" />
      <div className="flex gap-2.5 mt-[9px]"><Sk i={i} className="h-[10px] w-12 rounded-sm !bg-black/[0.04]" /><Sk i={i} className="h-[10px] w-16 rounded-sm !bg-black/[0.04]" /><Sk i={i} className="h-[10px] w-12 rounded-sm !bg-black/[0.04]" /></div>
    </div>
  );
}

// ── 대시보드 전체 — 로그인한 화면 값 그대로(page.js 대시보드):
//    카드(p-5 md:p-7 · 사진 62/68 · 레벨 52/60px · 등급 줄 · 경험치 막대 h-2.5 · 인벤토리 · 시즌 패스 · 강화 세 칸 · 스탯 2 × 2 칸 사이 선),
//    오른쪽(PC: 이벤트 띠 + XP 테이블 168px · 퀘스트 줄 3개 · 서버 랭킹 「내 순위」 판 + TOP 10 · 획득 피드 「오늘」 판 + 줄 / 폰: 섹션 아이콘 줄 + 퀘스트)
//    📌 2026-11-02 기둥 맨 위 시즌 줄(카드 위 · PC 는 제목 줄과 같은 높이) · 제목 줄 「오늘 기록 목표 | 랭킹 안내」 · 폰 섹션 줄 다섯 칸.
//    view = rank · intro(주소로 바로 연 경우) — 카드 · 대시보드 판 없이 시즌 줄 · 제목 줄 · 섹션 줄만, 켜진 탭 자리만 진하게
export function DashSkeleton({ view = "my" }) {
  const wide = view !== "my";
  return (
    <div role="status" aria-label="불러오는 중" className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-5 lg:gap-y-14 items-start">
      {/* 프로필 카드 — 정체성 → 레벨 · 등급 → 경험치 → 인벤토리 · 시즌 패스 · 강화 → 스탯 */}
      <div className="lg:col-span-4 min-w-0">
        <div className={`relative rounded-3xl overflow-hidden bg-[#151515] p-5 md:p-7 ${wide ? "lg:hidden" : ""}`}>
          <div className="flex items-center gap-4 lg:gap-5">
            <span aria-hidden className="shrink-0 w-[72px] h-[72px] lg:w-[78px] lg:h-[78px] rounded-full border-[5px] border-white/[0.07]" />
            <div className="min-w-0 flex-1">
              <Sk dark i={0} className="h-[18px] w-28 rounded" />
              <div className="flex gap-1.5 mt-2.5"><Sk dark i={0} className="h-5 w-14 rounded-full" /><Sk dark i={0} className="h-5 w-16 rounded-full" /></div>
            </div>
          </div>
          {/* 레벨 · 등급 */}
          <div className="mt-6 lg:mt-7 pt-5 lg:pt-6 border-t border-white/10">
            <Sk dark i={1} className="h-2 w-12 rounded-sm mb-2.5" />
            <Sk dark i={1} className="h-11 lg:h-[51px] w-32 lg:w-36 rounded-md" />
            <div className="mt-4 flex items-center gap-3">
              <Sk dark i={2} className="shrink-0 w-8 h-8 rounded-full" />
              <div><Sk dark i={2} className="h-[18px] w-24 rounded" /><Sk dark i={2} className="mt-1.5 h-[11px] w-32 rounded-sm" /></div>
            </div>
          </div>
          {/* 경험치 */}
          <div className="mt-6">
            <Sk dark i={3} className="h-2.5 w-full rounded-full" />
            <div className="flex justify-between mt-2.5"><Sk dark i={3} className="h-[11px] w-24 rounded-sm" /><Sk dark i={3} className="h-[11px] w-28 rounded-sm" /></div>
          </div>
          {/* 인벤토리 · 시즌 패스 · 강화 — 세 칸(page.js 카드 단추 줄 grid-flow-col · py-3 · 아이콘 24px · 이름 12px)
              📌 운영자 "왜 자꾸 시즌 패스는 빼는 거임" — 로그인 전 카드(두 칸)를 따라 그렸던 것을 세 칸으로 */}
          <div className="grid grid-cols-3 mt-6">
            {[0, 1, 2].map((k) => (
              <div key={k} className="flex flex-col items-center gap-2 py-3">
                <Sk dark i={4} className="w-6 h-6 rounded-md" />
                <Sk dark i={4} className="h-3 w-12 rounded-sm" />
              </div>
            ))}
          </div>
          {/* 스탯 — 현재 XP 크게 한 줄 + 최고 레벨 · 연속 출석 · 누적 음성 세 칸(2026-11-02 시안 5번) */}
          <div className="mt-4 border-t border-white/10">
            <div className="pt-3.5 pb-3">
              <div className="flex items-center mb-2 h-[13px]"><Sk dark i={5} className="h-[11px] w-12 rounded-sm" /></div>
              <Sk dark i={5} className="h-[30px] w-40 rounded" />
            </div>
            <div className="grid grid-cols-3 gap-x-4">
              {[0, 1, 2].map((k) => (
                <div key={k} className="min-w-0 pt-1 pb-3">
                  <div className="flex items-center mb-[7px] h-[13px]"><Sk dark i={6} className="h-[11px] w-12 rounded-sm" /></div>
                  <Sk dark i={6} className="h-4 w-14 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 min-w-0 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-14 lg:items-start">
        {/* PC 맨 위 한 줄 — 큰 제목 탭(오늘 기록 목표 | 랭킹 안내) + 오른쪽 끝 이벤트 알약. 넓은 판이면 밑선이 왼쪽 끝까지 */}
        <div className="relative hidden lg:flex lg:col-span-2 lg:-mb-6 items-center gap-[18px] xl:gap-[22px] h-16 pb-4">
          {[0, 1, 2].map((k) => <Sk key={k} i={0} className={`h-6 w-12 rounded ${(wide ? true : k) ? "!bg-black/[0.035]" : ""}`} />)}
          <i aria-hidden className="shrink-0 w-[1.5px] h-5 bg-[#ededed]"></i>
          {["season", "rank", "intro"].map((k) => <Sk key={k} i={0} className={`h-6 w-12 rounded ${view === k ? "" : "!bg-black/[0.035]"}`} />)}
          <Sk i={0} className="ml-auto h-12 w-[128px] rounded-full" />
          <span aria-hidden className={`absolute bottom-0 right-0 h-px bg-[#131313] ${wide ? "-left-[calc(50%+20px)]" : "left-0"}`}></span>
        </div>
        {/* 폰 — 섹션 아이콘 줄(오늘 · 기록 · 목표 · 랭킹 · 안내) */}
        <div className="lg:hidden grid grid-cols-6 h-14 border-b border-[#ededed] -mx-5 px-5 md:-mx-8 md:px-8">
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <span key={k} className="flex flex-col items-center justify-center gap-1.5">
              <Sk i={k} className="w-[22px] h-[22px] rounded-md" />
              <Sk i={k} className="h-2 w-9 rounded-sm" />
            </span>
          ))}
        </div>
        {/* 퀘스트 — 머리 두 겹(제목 / 글자 탭 + 진행 수 ……… 바꾸기 · 남은 시간) · 상자 없는 줄 3개(퀘스트는 주기마다 3개 — 2026-11-02 운영자 "제발 3개만").
               줄 = 진행 고리 | 이름 · 설명 · 정확한 수 | 보상 · 단추(PC 나란히 96 · 64, 폰 위아래) */}
        <section className={`mt-6 lg:mt-0 lg:col-span-2 ${wide ? "hidden" : ""}`}>
          <div className="flex items-center min-h-8 mb-3.5 sm:mb-4">
            <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">퀘스트</h3>
          </div>
          <div className="flex items-center gap-3.5 sm:gap-5 h-8 mb-1">
            {[0, 1, 2].map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <Sk i={1} className={`h-4 w-8 rounded ${k ? "" : "!bg-black/[0.12]"}`} />
                <Sk i={1} className="h-2.5 w-[26px] rounded-sm !bg-black/[0.04]" />
                <i className="w-1.5" />
              </span>
            ))}
            <Sk i={1} className="hidden sm:block ml-auto h-3 w-28 rounded-sm !bg-black/[0.04]" />
          </div>
          {[0, 1, 2].map((k) => (
            <div key={k} className="-mx-3 px-3 py-3 md:py-[13px] flex items-center gap-3.5 md:gap-4">
              <Sk i={3 + k} className="shrink-0 w-[42px] h-[42px] md:w-[46px] md:h-[46px] rounded-full" />
              <div className="min-w-0 flex-1">
                <Sk i={3 + k} className="h-[17px] max-w-full rounded" style={{ width: [132, 108, 150][k] }} />
                <Sk i={3 + k} className="mt-1.5 h-[11px] max-w-full rounded-sm !bg-black/[0.04]" style={{ width: [180, 220, 200][k] }} />
                <Sk i={3 + k} className="mt-1.5 h-[11px] w-16 rounded-sm" />
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-5">
                <span className="md:w-24 flex justify-end"><Sk i={3 + k} className="h-[15px] w-16 rounded" /></span>
                <span className="h-8 flex items-center justify-end md:justify-center md:w-16"><Sk i={3 + k} className="h-8 w-8 rounded-full" /></span>
              </div>
            </div>
          ))}
        </section>
        {/* 서버 랭킹 — 「내 순위」 판 + TOP 10 (PC 만 — 폰은 아이콘 줄로 하나씩 본다) */}
        <section className={`hidden ${wide ? "" : "lg:block"}`}>
          <div className="flex items-end justify-between mb-4">
            <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">서버 랭킹</h3>
            <Sk i={4} className="h-3 w-36 rounded-sm" />
          </div>
          <PanelSkeleton i={4} />
          <TopListSkeleton rows={10} />
        </section>
        {/* 획득 피드 — 「오늘」 판 + 줄(h-[46px] · 아이콘 칸 · 양 · 사유 · 시각) */}
        <section className={`hidden ${wide ? "" : "lg:block"}`}>
          <div className="flex items-end justify-between mb-4">
            <h3 className="text-xl md:text-2xl font-black text-[#131313] tracking-tight">획득 피드</h3>
            <Sk i={5} className="h-2.5 w-10 rounded-sm" />
          </div>
          <PanelSkeleton i={5} />
          <div className="border-t border-[#ededed]">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="flex items-center h-[46px] gap-3 border-b border-[#ededed]">
                <Sk i={6 + i} className="w-7 h-7 rounded-lg shrink-0" />
                <span className="shrink-0 min-w-[68px]"><Sk i={6 + i} className="h-[13px] w-14 rounded" /></span>
                <span className="min-w-0 flex-1"><Sk i={6 + i} className="h-3 max-w-full rounded-sm !bg-black/[0.04]" style={{ width: [96, 120, 84, 132, 104, 90, 116, 80, 124, 100][i] }} /></span>
                <Sk i={6 + i} className="shrink-0 h-[10px] w-9 rounded-sm !bg-black/[0.04]" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
