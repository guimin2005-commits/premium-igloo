"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { ICON_PATHS } from "../components/Icons";

// 📌 핫타임 — 카드 바로 아래 띠 + 누르면 진행도 창. 2026-10-25 운영자 "핫타임 표시 상단이 아니라 카드 아래로 · 핫타임 진행 중인 느낌으로 · 클릭하면 핫타임 이벤트 진행도가 보이게"
//    (예전엔 머리 줄 SEASON 옆 「HOT TIME ×배수」 알약). 띠 시안 .claude/mockups/hottime/hot1.png — 운영자 "ㅇㅋ ㄱ" + "불 아이콘 아쉽다 · 굳이 배경이 다를 필요가 있을까"
//    → 불꽃은 검은 칸 없이 띠 위에 바로(흰 불 + 노란 속불, 살짝 일렁임).
//    진행 중 느낌: 빗금이 천천히 흐르고 · 남은 시간이 초마다 줄고 · 띠 맨 아래 흰 줄이 기간 진행. 움직임 줄이기 설정이면 멈춘다
//    띠는 /api/xp/me hotTime(on · mult · from · until), 창은 /api/xp/hot-time(날마다 배수 · 내가 더 받은 XP)
const HOT_CSS = `
@keyframes hotStripes { from { background-position: 32px 0; } to { background-position: 0 0; } }
@keyframes hotFlame { 0%, 100% { transform: scale(1, 1); } 35% { transform: scale(0.93, 1.07); } 70% { transform: scale(1.04, 0.96); } }
@keyframes hotEmber { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 1; } 100% { transform: translateY(-40px); opacity: 0; } }
@keyframes hotIn { from { opacity: 0; transform: translateY(16px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.hot-stripes { background-image: linear-gradient(45deg, rgba(255,255,255,0.08) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.08) 75%, transparent 75%, transparent); background-size: 32px 32px; animation: hotStripes 1.4s linear infinite; }
.hot-flame { transform-origin: 50% 92%; animation: hotFlame 1.1s ease-in-out infinite; }
.hot-ember { animation: hotEmber 2.4s steps(10, end) infinite; opacity: 0; }
@media (prefers-reduced-motion: reduce) { .hot-stripes, .hot-flame { animation: none; } .hot-ember { animation: none; opacity: 1; } }
`;

const pad = (n) => String(n).padStart(2, "0");
// 남은 시간 — 하루 넘으면 「6일 08:47:12」, 하루 안이면 「08:47:12」
export const hotLeft = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hms = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}일 ${hms}` : hms;
};
const multText = (m) => Number(m || 1).toLocaleString("en-US", { maximumFractionDigits: 1 });
const kstYmd = (t) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);
const WD_LABEL = ["일", "월", "화", "수", "목", "금", "토"];
// 「10.19 월」 — 기간 첫날 · 마지막 날(KST)
const dayLabel = (t) => {
  const k = new Date(t + 9 * 3600e3);
  return `${k.getUTCMonth() + 1}.${pad(k.getUTCDate())} ${WD_LABEL[k.getUTCDay()]}`;
};

// 1초마다 지금 시각 — 띠 · 창 안에서만 다시 그린다(레벨 화면 전체를 초마다 다시 그리지 않게)
function useNow(on = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

// 불꽃 — 흰 겉불 + 노란 속불(heroicons fire 모양). 빨강 위에 칸 없이 바로 얹는다
const FLAME_OUT = "M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z";
const FLAME_IN = "M15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z";
const Flame = ({ className = "", core = "#ffd43b" }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className}>
    <path fill="#ffffff" fillRule="evenodd" clipRule="evenodd" d={FLAME_OUT} />
    <path fill={core} d={FLAME_IN} />
  </svg>
);

// ── 카드 아래 핫타임 띠 — 기간 안일 때만(부르는 쪽이 hot.on 으로 거른다). 끝 시각이 지나면 다음 내 정보가 오기 전에도 스스로 빠진다
export function HotTimeStrip({ hot, onOpen, className = "" }) {
  const now = useNow(!!hot?.on);
  if (!hot?.on) return null;
  const from = Number(hot.from) || 0;
  const until = Number(hot.until) || 0;
  if (until && now >= until) return null;
  const pct = from && until > from ? Math.min(100, Math.max(0, ((now - from) / (until - from)) * 100)) : 0;
  return (
    <>
    <style>{HOT_CSS}</style>
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`핫타임 ×${multText(hot.mult)} 진행도 보기`}
      title={hot.name || "핫타임"}
      className={`group relative z-10 ${className} w-full items-center h-14 pl-4 pr-4 rounded-2xl bg-[#e91e3f] hover:bg-[#d81a3a] text-white overflow-hidden transition-[transform,background-color] hover:-translate-y-px outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40`}
    >
      <span aria-hidden className="hot-stripes absolute inset-0 pointer-events-none"></span>
      <Flame className="hot-flame relative shrink-0 w-[24px] h-[24px]" />
      <span className="relative ml-2.5 text-[15px] font-black tracking-[0.02em] whitespace-nowrap">HOT TIME</span>
      <span className="relative ml-2.5 shrink-0 inline-flex items-center h-[26px] px-2 rounded-lg bg-white text-[#e91e3f] text-[15px] font-black leading-[26px] tabular-nums">×{multText(hot.mult)}</span>
      <span className="relative ml-auto pl-3 flex items-baseline text-[13px] font-extrabold tabular-nums whitespace-nowrap">
        {/* 「남은 시간」 글자 — 폭이 넉넉한 칸에서만(폰 · PC 1024~1279 좁은 카드 칸은 숫자만) */}
        <span className="hidden sm:inline lg:hidden xl:inline mr-1.5 text-[11px] font-bold text-white/70">남은 시간</span>
        {hotLeft(until - now)}
      </span>
      <svg aria-hidden viewBox="0 0 24 24" className="relative ml-2 shrink-0 w-4 h-4 text-white/80 group-hover:text-white transition-colors" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d={ICON_PATHS.chevronRight} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {/* 기간 진행 — 띠 맨 아래 흰 줄 */}
      <span aria-hidden className="absolute left-0 right-0 bottom-0 h-1 bg-black/20 pointer-events-none">
        <span className="block h-full bg-white" style={{ width: `${pct}%` }}></span>
      </span>
    </button>
    </>
  );
}

// 띠 판의 불씨(4px 네모) — 큰 ×2 알약과 남은 시간 사이 빈 곳에서 차례로 떠오른다. [left, top, 색, 늦춤(초)]
const EMBERS_PC = [[236, 96, "#ffd43b", 0], [270, 130, "#ffffff", 0.6], [304, 104, "#ffd43b", 1.2], [252, 168, "#ffffff", 1.8], [326, 156, "#ffd43b", 0.9]];
const EMBERS_PH = [[164, 92, "#ffd43b", 0], [186, 126, "#ffffff", 0.7], [204, 98, "#ffd43b", 1.4], [172, 160, "#ffffff", 1.9]];
// 요일 머리(월요일부터) — getUTCDay 값
const WEEK = [1, 2, 3, 4, 5, 6, 0];

// ── 핫타임 진행도 창 — 2026-10-25 시안 .claude/mockups/hottime/hot6.png(A 달력).
//    운영자 반려를 거쳐: 잉크 창 → 흰 창("굳이 검은 톤으로 가야돼?"), 덩어리마다 상자 → 줄로만("카드 쓰지 말랬지"),
//    위는 바깥 띠의 결을 크게 · 창 위 전체를 띠가 먹는다("띠를 그냥 위에 부분을 다 먹어봐") — 제목 · 닫기도 띠 위.
//    띠 판(이름 · 배수 · 남은 시간 · 기간)은 내 정보 hotTime 으로 바로 그리고, 날짜 칸 · 더 받은 XP 는 /api/xp/hot-time 이 오면 채운다.
//    공용 창 틀(PopShell)은 머리가 따로라 쓰지 않는다 — 바닥 · 흐림 · 바텀시트 · 여닫기는 업적 창(AchievementsModal)과 같은 방식.
//    스크롤 잠금은 바닥의 "fixed inset-0" + z-[120] 을 보고 전역 ScrollLock 이 건다
export function HotTimeModal({ open, onClose, hot }) {
  const [data, setData] = useState(null); // null = 불러오는 중
  const [err, setErr] = useState(false);
  const closeRef = useRef(null);
  const boxRef = useRef(null);
  const load = useCallback(() => {
    setErr(false);
    fetch("/api/xp/hot-time", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.success) throw new Error(j?.error || "fail");
        setData(j);
      })
      .catch(() => setErr(true));
  }, []);
  useEffect(() => {
    if (!open) return;
    setData(null);
    load();
  }, [open, load]);
  // 열리면 닫기 단추에 포커스 · Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  // 📌 창 윗변을 정수 px 에 — 가운데 맞춤에서 (화면 − 창) 높이가 홀수면 0.5px 에 앉아 알약 글자가 1px 쏠린다(알약 글자 쏠림 규칙).
  //    그때만 위 여백으로 반 칸 내린다. 폰 아래 시트(아래 맞춤)는 높이가 정수라 그대로
  useLayoutEffect(() => {
    if (!open) return;
    const el = boxRef.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    const snap = () => {
      el.style.marginTop = "";
      const ws = getComputedStyle(wrap);
      if (ws.alignItems !== "center") return;
      const h = parseFloat(getComputedStyle(el).height) || el.offsetHeight; // 여는 움직임(transform)과 상관없는 높이
      const top = (wrap.clientHeight - h) / 2;
      const f = top - Math.floor(top);
      if (f > 0.01 && f < 0.99) el.style.marginTop = `${2 * (1 - f)}px`;
    };
    snap();
    const ro = new ResizeObserver(snap);
    ro.observe(el);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [open]);
  const now = useNow(open);
  if (!open || !hot?.on) return null;

  const from = Number(data?.from ?? hot.from) || 0;
  const until = Number(data?.until ?? hot.until) || 0;
  const name = data?.name || hot.name || "핫타임";
  const mult = data?.mult ?? hot.mult;
  const pct = from && until > from ? Math.min(100, Math.max(0, ((now - from) / (until - from)) * 100)) : 0;
  const ended = until > 0 && now >= until;

  const on = !!data?.on;
  const days = on && Array.isArray(data.days) ? data.days : [];
  const today = kstYmd(now);
  const todayIdx = days.findIndex((d) => d.ymd === today);
  const dayNo = todayIdx >= 0 ? todayIdx + 1 : days.length && today > days[days.length - 1].ymd ? days.length : 0;
  const lead = days.length ? WEEK.indexOf(days[0].wd) : 0;
  const mults = data?.mults || { weekday: 1, weekend: 1 };
  const split = mults.weekend !== mults.weekday;
  const weOf = (wd) => split && [5, 6, 0].includes(wd);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={name}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[600px] max-h-[88dvh] sm:max-h-[min(800px,92vh)] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white text-[#131313] shadow-[0_28px_56px_-28px_rgba(0,0,0,0.25)] flex flex-col"
        style={{ animation: "hotIn .32s cubic-bezier(0.16,1,0.3,1)" }}
      >
        <style>{HOT_CSS}</style>

        {/* ── 위 전체 = 핫타임 띠 판(바깥 띠의 결 — 빨강 · 흐르는 빗금 · 흰 알약). 큰 불꽃 · 큰 배수가 주인공 */}
        <div className="relative shrink-0 h-[222px] sm:h-[236px] px-[18px] sm:px-[22px] sm:pt-[18px] bg-[#e91e3f] text-white overflow-hidden">
          <span aria-hidden className="hot-stripes absolute inset-0 pointer-events-none"></span>
          {/* 뒤 큰 불꽃 그림자 — 오른쪽 아래로 잘려 나간다 */}
          <span aria-hidden className="absolute -right-11 -bottom-11 sm:-right-[30px] sm:-bottom-[50px] opacity-10 pointer-events-none">
            <svg viewBox="0 0 24 24" className="w-[160px] h-[160px] sm:w-[210px] sm:h-[210px]"><path fill="#ffffff" d={FLAME_OUT} /></svg>
          </span>
          {/* 불씨 — 폰 · PC 자리가 달라 두 벌 */}
          {[EMBERS_PH, EMBERS_PC].map((set, i) =>
            set.map(([x, y, c, delay]) => (
              <span
                key={`${i}-${x}-${y}`}
                aria-hidden
                className={`hot-ember absolute w-1 h-1 pointer-events-none ${i ? "hidden sm:block" : "sm:hidden"}`}
                style={{ left: x, top: y, background: c, animationDelay: `${delay}s` }}
              ></span>
            )),
          )}

          {/* 폰 바텀시트 손잡이 */}
          <div aria-hidden className="sm:hidden relative flex justify-center pt-2.5"><span className="w-10 h-1 rounded-full bg-white/45"></span></div>
          {/* 제목 · 닫기 — 띠 위 */}
          <div className="relative flex items-center gap-2.5 pt-2 sm:pt-0">
            <h3 className="min-w-0 text-[16px] font-black leading-4 truncate">{name}</h3>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="ml-auto shrink-0 w-[34px] h-[34px] rounded-full border border-white/50 text-white hover:bg-white/10 transition-colors flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2"><path d={ICON_PATHS.close} strokeLinecap="round" /></svg>
            </button>
          </div>
          {/* 큰 불꽃 · HOT TIME · ×배수 | 남은 시간 */}
          <div className="relative mt-[18px] sm:mt-[22px] flex items-center">
            <Flame className="hot-flame shrink-0 w-[52px] h-[52px] sm:w-[68px] sm:h-[68px]" />
            <div className="ml-2.5 sm:ml-3.5">
              <p className="text-[11px] sm:text-[13px] font-black tracking-[0.22em] sm:tracking-[0.26em] leading-4 text-white/85">HOT TIME</p>
              <span className="mt-[5px] sm:mt-1.5 inline-block h-[46px] sm:h-[58px] px-[11px] sm:px-3.5 rounded-xl sm:rounded-[14px] bg-white text-[#e91e3f] text-[36px] sm:text-[46px] font-black leading-[46px] sm:leading-[58px] tracking-[-0.03em] tabular-nums">
                ×{multText(mult)}
              </span>
            </div>
            <div className="ml-auto self-end pb-1 text-right">
              <p className="text-[11px] font-bold leading-4 text-white/80">남은 시간</p>
              <p className="mt-1 text-[18px] sm:text-[26px] font-black leading-[18px] sm:leading-[26px] tabular-nums whitespace-nowrap">{ended ? "종료" : hotLeft(until - now)}</p>
            </div>
          </div>
          {/* 기간 — 첫날 · 오늘이 며칠째 · 마지막 날, 아래 진행 막대(흰 바탕과 붙지 않게 띠 안쪽에) */}
          <div className="absolute left-[18px] right-[18px] sm:left-[22px] sm:right-[22px] bottom-7 flex justify-between text-[11px] font-extrabold leading-4 text-white/80 tabular-nums">
            <span>{from ? dayLabel(from) : ""}</span>
            {days.length > 0 && <b className="font-black text-white">{dayNo} / {days.length}일</b>}
            <span>{until ? dayLabel(until - 1) : ""}</span>
          </div>
          <span aria-hidden className="absolute left-[18px] right-[18px] sm:left-[22px] sm:right-[22px] bottom-3.5 h-1.5 rounded-full bg-black/20 overflow-hidden">
            <span className="block h-full rounded-full bg-white" style={{ width: `${pct}%` }}></span>
          </span>
        </div>

        {/* ── 아래 = 흰 바탕. 상자 없이 줄로만 나눈다 */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-[18px] sm:px-[22px] pb-5 sm:pb-[22px]">
          {err ? (
            <div className="py-10 text-center">
              <p className="text-[13px] leading-5 font-bold text-[#5a5a5a]">핫타임 정보를 불러오지 못했습니다.</p>
              <button type="button" onClick={load} className="mt-4 inline-flex items-center h-9 px-4 rounded-full border border-[#a3a3a3] text-[12px] font-bold text-[#131313] leading-[34px] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">다시 시도</button>
            </div>
          ) : !data ? (
            // 불러오는 중 — 같은 자리 · 같은 높이의 빈 칸(다 오면 칸이 밀리지 않게)
            <div aria-hidden className="pt-5">
              <div className="h-[150px] rounded-xl bg-[#f2f2f2] animate-pulse"></div>
              <div className="mt-5 h-[120px] rounded-xl bg-[#f2f2f2] animate-pulse"></div>
            </div>
          ) : !on ? (
            <p className="py-10 text-center text-[13px] leading-5 font-bold text-[#5a5a5a]">지금은 핫타임 기간이 아닙니다.</p>
          ) : (
            <>
              {/* 날짜별 배수 — 칸 없는 달력(월요일부터). 오늘만 빨간 동그라미 · 지난 날 흐리게 · 날마다 그날 배수 */}
              <div className="flex items-baseline justify-between pt-5 mb-3">
                <p className="text-[12px] font-black leading-[18px]">날짜별 배수</p>
                <p className="text-[11px] font-extrabold leading-4 text-[#8a8a8a] tabular-nums">
                  {split ? (
                    <>
                      <span className="text-[#e91e3f]">금 토 일 ×{multText(mults.weekend)}</span>
                      <span className="ml-2.5">평일 ×{multText(mults.weekday)}</span>
                    </>
                  ) : (
                    <>매일 ×{multText(mults.weekday)}</>
                  )}
                </p>
              </div>
              <div className="grid grid-cols-7 gap-y-2.5">
                {WEEK.map((wd) => (
                  <p key={`h${wd}`} className={`pb-0.5 text-center text-[11px] font-extrabold leading-4 ${weOf(wd) ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>{WD_LABEL[wd]}</p>
                ))}
                {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} aria-hidden></span>)}
                {days.map((d) => {
                  const past = d.ymd < today;
                  const isToday = d.ymd === today;
                  const we = weOf(d.wd);
                  return (
                    <div key={d.ymd} title={`${d.m}월 ${d.d}일 ×${multText(d.mult)}`} className="flex flex-col items-center tabular-nums">
                      <span className={`w-[30px] h-[30px] sm:w-[34px] sm:h-[34px] rounded-full text-center text-[14px] sm:text-[15px] font-black leading-[30px] sm:leading-[34px] ${isToday ? "bg-[#e91e3f] text-white" : past ? "text-[#c4c4c4]" : "text-[#131313]"}`}>{d.d}</span>
                      <span className={`mt-[3px] text-[11px] leading-4 ${isToday ? "font-black text-[#e91e3f]" : past ? "font-extrabold text-[#d0d0d0]" : we ? "font-extrabold text-[#e91e3f]" : "font-extrabold text-[#8a8a8a]"}`}>
                        {isToday ? "오늘" : `×${multText(d.mult)}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 내가 더 받은 XP — 큰 숫자 · 오늘 몫, 아래 채팅 | 음성 줄 */}
              <div className="mt-5 border-t border-[#ededed]"></div>
              <p className="pt-5 mb-3 text-[12px] font-black leading-[18px]">내가 더 받은 XP</p>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[26px] sm:text-[30px] font-black leading-[26px] sm:leading-[30px] tracking-[-0.02em] tabular-nums whitespace-nowrap">
                  +{(data.xp?.total || 0).toLocaleString()}
                  <span className="ml-[5px] text-[12px] text-[#a3a3a3]">XP</span>
                </p>
                <p className="text-[12px] font-black leading-[18px] text-[#e91e3f] tabular-nums whitespace-nowrap">오늘 +{(data.xp?.today || 0).toLocaleString()}</p>
              </div>
              <div className="mt-3.5">
                {[
                  { l: "채팅", v: data.xp?.chat || 0 },
                  { l: "음성", v: data.xp?.voice || 0 },
                ].map((r, i, arr) => (
                  <div key={r.l} className={`flex justify-between pt-2.5 border-t border-[#ededed] text-[13px] font-bold leading-[18px] text-[#5a5a5a] tabular-nums ${i < arr.length - 1 ? "pb-2.5" : ""}`}>
                    <span>{r.l}</span>
                    <b className="font-black text-[#131313]">+{r.v.toLocaleString()} XP</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
