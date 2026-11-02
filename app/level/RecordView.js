"use client";

import { useEffect, useMemo, useState } from "react";
import WalletHistory from "../components/WalletHistory";
import TierEmblem from "../components/TierEmblem";
import AvatarFrame from "../components/AvatarFrame";
import { EquipCard } from "../components/Inventory";
import { whoOf } from "../arctic/CosmeticPreview";
import { VOICE_TIERS, getTierIndex, tierText } from "@/lib/voiceTiers";
import { SEASONS, currentSeason } from "@/lib/season";

// 📌 대시보드 개념(2026-11-02 운영자 "카드의 기능과 오른쪽 판을 어떻게 사용할지 개념을 재정립" → 「나 / 시간」 승인 "해봐")
//    · 카드 = 나(캐릭터 창) — 천천히 변하는 내 상태 · 능력치(현재 XP · 최고 레벨 · 연속 출석 · 누적 음성) · 내 것 관리 아이콘
//    · 오른쪽 = 시간 — 지금(기본: 오늘 줄 · 퀘스트 · 획득 피드) / 지난(기록) / 남(랭킹) / 앞으로(XP 테이블 · 획득 효과)
//    · 읽는 것은 그 자리에서, 하는 것(받기 · 강화 · 뽑기 · 끼우기)만 창으로. 같은 값은 한 곳에만
//    이 파일: TodayStrip(지금 맨 위 「오늘」 줄 — 11/2 되돌려 지금은 안 씀) · RecordView(「기록」 — 출석 · 시즌 · 지난 시즌 · 내역) · GoalReach(「목표」 Lv N 까지). 둘 다 /api/xp/records(rec)를 부모가 읽어 넘긴다
//    상자 없이 제목 · 줄로만 나눈다. 안내 문장은 넣지 않는다.
//    📌 선은 구역 사이(sep) 한 줄만 — 구역 안 줄마다 긋던 선은 뺐다(2026-11-02 운영자 "선이 너무 많다..")
const DAY = 24 * 60 * 60 * 1000;
const KST = 9 * 60 * 60 * 1000;
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const msOf = (key) => Date.parse(`${key}T00:00:00Z`);
const kstTodayKey = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const seasonPeriod = (x) => {
  if (!x?.start || !x?.end) return "";
  const a = x.start.replaceAll("-", "."), b = x.end.replaceAll("-", ".");
  return `${a} – ${a.slice(0, 4) === b.slice(0, 4) ? b.slice(5) : b}`;
};
// 범례 숫자 — 1만부터 「만」(소수 한 자리 · 내림). 획득 피드 「오늘」 판과 같은 줄임
const short = (n) => {
  const v = Math.max(0, Math.floor(Number(n) || 0));
  if (v >= 1e8) return `${(Math.floor(v / 1e7) / 10).toLocaleString()}억`;
  if (v >= 1e4) return `${(Math.floor(v / 1e3) / 10).toLocaleString()}만`;
  return v.toLocaleString();
};

// 체크 — 둥근 굵은 선(2026-11-02 운영자 A안, 예전 도트 체크 반려). 지금은 「오늘 출석」 알약에만(달력은 B안 동그라미 안 날짜)
const Check = ({ w = 13 }) => (
  <svg aria-hidden viewBox="0 0 24 24" width={w + 3} height={w + 3} fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

// 숫자 크게 · 단위 작게
const Num = ({ v, u, size = "text-[18px]", tone = "text-[#131313]" }) => (
  <span className={`${size} font-black tracking-[-0.02em] leading-none tabular-nums whitespace-nowrap ${tone}`}>
    {v}
    {u ? <span className="ml-0.5 text-[11px] font-extrabold tracking-normal text-[#a3a3a3]">{u}</span> : null}
  </span>
);
// 분 → 「N시간 N분」 조각(숫자 · 단위)
const hm = (min) => {
  const m = Math.max(0, Math.floor(Number(min) || 0));
  if (m < 60) return [[m.toLocaleString(), "분"]];
  const h = Math.floor(m / 60), r = m % 60;
  return r ? [[h.toLocaleString(), "시간"], [String(r), "분"]] : [[h.toLocaleString(), "시간"]];
};
const Parts = ({ parts, size }) => (
  <span className="inline-flex items-baseline gap-1">
    {parts.map(([v, u]) => <Num key={u} v={v} u={u} size={size} />)}
  </span>
);

const Head = ({ children, right }) => (
  <div className="flex items-center justify-between gap-3 mb-3.5">
    <h4 className="text-[15px] font-black text-[#131313] leading-5">{children}</h4>
    {right}
  </div>
);
const Row = ({ l, children, dim }) => (
  <div className="flex items-baseline justify-between gap-3 py-[9px]">
    <span className={`text-[13px] font-bold leading-[18px] ${dim ? "text-[#a3a3a3]" : "text-[#5a5a5a]"}`}>{l}</span>
    {children}
  </div>
);

// 출처 막대 + 줄(종류 색 = 획득 피드 FEED_KINDS)
const sourcesOf = (sum, kinds) => {
  const val = (k) => Math.max(0, Number(sum?.[k]) || 0);
  return (kinds || []).map((x) => ({ ...x, v: val(x.k) }));
};
const SourceBar = ({ parts, total, h = "h-2" }) => (
  <div aria-hidden className={`flex ${h} gap-0.5 rounded-[3px] overflow-hidden ${total ? "" : "bg-black/[0.06]"}`}>
    {parts.filter((x) => x.v > 0).map((x) => <span key={x.k} className="block h-full" style={{ flex: x.v, background: x.c }}></span>)}
  </div>
);

// ═══ 지금 맨 위 「오늘」 줄 — 획득(출처) | 출석(최근 7일 도장) | 활동(채팅 수 · 음성 시간). PC 세 칸 · 폰 위아래
export function TodayStrip({ me, today, rec, kinds, attendVoiceMin = 60 }) {
  const total = Math.max(0, Number(today?.total) || 0);
  const parts = sourcesOf(today, kinds);
  const todayKey = kstTodayKey();
  const done = me?.lastAttendDate === todayKey;
  const streak = Math.max(0, Number(me?.attendStreak) || 0);
  const set = new Set(rec?.days || []);
  const todayMs = msOf(todayKey);
  const week = Array.from({ length: 7 }, (_, i) => {
    const ms = todayMs - (6 - i) * DAY;
    const key = keyOf(ms);
    return { key, w: i === 6 ? "오늘" : WEEK[new Date(ms).getUTCDay()], att: key === todayKey ? done : set.has(key), today: i === 6 };
  });
  const col = "min-w-0 pt-3.5 pb-3.5";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-[#131313]">
      {/* 획득 */}
      <div className={`${col} sm:pr-6`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold text-[#5a5a5a]">획득</span>
          <Num v={`+${total.toLocaleString()}`} u="XP" size="text-[20px]" tone={total ? "text-[#e91e3f]" : "text-[#131313]"} />
        </div>
        <div className="mt-2.5"><SourceBar parts={parts} total={total} /></div>
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2">
          {parts.filter((x) => x.v > 0).map((x) => (
            <span key={x.k} className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-[#5a5a5a] whitespace-nowrap">
              <span aria-hidden className="w-[7px] h-[7px] rounded-[2px]" style={{ background: x.c }}></span>
              {x.l} <b className="font-black text-[#131313] tabular-nums">{short(x.v)}</b>
            </span>
          ))}
        </div>
      </div>
      {/* 출석 — 최근 7일(오른쪽 끝 = 오늘) */}
      <div className={`${col} border-t border-[#ededed] sm:border-t-0 sm:border-l sm:px-6`}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold text-[#5a5a5a]">출석</span>
          <Num v={streak.toLocaleString()} u="일 연속" size="text-[20px]" />
        </div>
        <div className="grid grid-cols-7 gap-1 mt-2.5">
          {week.map((d) => (
            <div key={d.key} className="flex flex-col items-center gap-1 min-w-0">
              <span className={`text-[9.5px] font-extrabold leading-3 ${d.today ? "text-[#131313]" : "text-[#a3a3a3]"}`}>{d.w}</span>
              {d.att ? (
                <span className="w-6 h-6 rounded-[6px] bg-[#e91e3f] flex items-center justify-center"><Check w={11} /></span>
              ) : d.today ? (
                <span title={`음성 ${attendVoiceMin}분 또는 /출석체크`} className="w-6 h-6 rounded-[6px] border-[1.5px] border-dashed border-[#131313]"></span>
              ) : (
                <span className="w-6 h-6 rounded-[6px] bg-black/[0.06]"></span>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* 활동 — 오늘 보낸 메시지 · 오늘 음성 */}
      <div className={`${col} border-t border-[#ededed] sm:border-t-0 sm:border-l sm:pl-6`}>
        <span className="text-[11px] font-bold text-[#5a5a5a]">활동</span>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-bold text-[#8a8a8a]">채팅</span>
          <Num v={rec ? (rec.chatToday || 0).toLocaleString() : "—"} u={rec ? "회" : ""} size="text-[18px]" />
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-bold text-[#8a8a8a]">음성</span>
          <Parts parts={hm(me?.voiceTodayMin)} size="text-[18px]" />
        </div>
      </div>
    </div>
  );
}

// ═══ 「기록」(지난) — 출석(달력 · 기록 · 출석 1회) → 시즌(누적 · 이번 달 출처) → 내역
export default function RecordView({ me, user, todayTotal = null, rec, recErr = false, month, gain, kinds, attendVoiceMin = 60, seasonName = "", seasonTotal = null, dLabel = "", onTone }) {
  const todayKey = kstTodayKey();
  const done = me?.lastAttendDate === todayKey;
  const streak = Math.max(0, Number(me?.attendStreak) || 0);

  // 5주 달력 — rec.start(일요일)부터 35칸. 지금 이어지는 연속 줄 = 마지막 출석일부터 거꾸로 연속 일수만큼(보호막으로 메운 날도 잇는다)
  const cal = useMemo(() => {
    if (!rec) return null;
    const set = new Set(rec.days || []);
    const start = msOf(rec.start);
    const todayMs = msOf(todayKey);
    const cells = Array.from({ length: 35 }, (_, i) => {
      const ms = start + i * DAY;
      const key = keyOf(ms);
      return { key, d: new Date(ms).getUTCDate(), today: ms === todayMs, future: ms > todayMs, att: set.has(key) };
    });
    const run = new Set();
    const last = me?.lastAttendDate || "";
    if (streak > 0 && /^\d{4}-\d{2}-\d{2}$/.test(last)) {
      for (let i = 0, ms = msOf(last); i < Math.min(streak, 400); i++, ms -= DAY) run.add(keyOf(ms));
    }
    return { cells, run };
  }, [rec, streak, todayKey, me?.lastAttendDate]);

  // 시즌 — 누적 막대 끝의 이번 달 몫(누적보다 클 수 없게) · 이번 달 출처
  const monthTotal = Math.max(0, Number(month?.total) || 0);
  const monthParts = sourcesOf(month, kinds);
  const seasonXp = seasonTotal == null ? null : Math.max(0, Number(seasonTotal) || 0);

  const sep = <div aria-hidden className="h-px bg-[#ededed] my-7 lg:my-8"></div>;

  // ── ① 출석
  const attend = (
    <div>
      <Head>출석</Head>
      <div className="flex items-end gap-4">
        <p><Num v={streak.toLocaleString()} u="일 연속" size="text-[52px] lg:text-[60px]" /></p>
        <div className="ml-auto pb-1 text-right">
          {done ? (
            <span className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full bg-[#e91e3f] text-white text-[12px] font-black leading-[30px]"><Check w={11} />오늘 출석</span>
          ) : (
            <span className="inline-flex items-center h-[30px] px-3 rounded-full border-[1.5px] border-dashed border-[#131313] text-[12px] font-black leading-[27px] text-[#131313]">오늘 아직</span>
          )}
          {/* 오늘 아직일 때만 출석 방법 한 줄(출석했으면 위 알약으로 충분하다) */}
          {!done && <p className="mt-1.5 text-[12px] font-extrabold leading-4 text-[#8a8a8a]">음성 {attendVoiceMin}분 또는 /출석체크</p>}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-7 lg:gap-10">
        {/* 5주 달력 — 📌 2026-11-02 위 「10월 4일부터」 줄은 뺐다(운영자 "빼라"). 요일 줄(18) = 옆 「기록」 줄(18) 같은 높이로 같은 줄에,
               첫 주 동그라미 가운데 = 옆 첫 기록 줄 가운데(「기록」 아래 간격으로 맞춤 — 운영자 "달력이랑 기록 위치 맞추고") */}
        <div>
          {!cal ? (
            <div aria-hidden className={`h-[298px] rounded-xl ${recErr ? "bg-[#f7f7f7]" : "bg-black/[0.06] animate-pulse"}`}></div>
          ) : (
            <div className="grid grid-cols-7 gap-y-2">
              {WEEK.map((w, i) => (
                <p key={w} className={`text-center text-[11px] font-extrabold leading-[18px] ${i === 0 ? "text-[#e91e3f]" : "text-[#a3a3a3]"}`}>{w}</p>
              ))}
              {cal.cells.map((c, i) => {
                const r = cal.run.has(c.key);
                const col = i % 7;
                const prev = r && col > 0 && cal.run.has(cal.cells[i - 1].key);
                const next = r && col < 6 && i < 34 && cal.run.has(cal.cells[i + 1].key);
                return (
                  <div key={c.key} className="relative flex flex-col items-center tabular-nums">
                    {/* 지금 이어지는 연속 — 칸 뒤 옅은 빨간 줄(끝은 둥글게) */}
                    {r && (
                      <span
                        aria-hidden
                        className="absolute top-0 h-8 bg-[#ffe3e8]"
                        style={{
                          left: prev ? 0 : "calc(50% - 16px)",
                          right: next ? 0 : "calc(50% - 16px)",
                          borderRadius: `${prev ? 0 : 16}px ${next ? 0 : 16}px ${next ? 0 : 16}px ${prev ? 0 : 16}px`,
                        }}
                      ></span>
                    )}
                    {/* 출석한 날 — 빨간 동그라미 안에 날짜(2026-11-02 운영자 B안 "동그라미 안 날짜", 체크 표시는 오늘 출석 알약에만) */}
                    {c.att ? (
                      <span className="relative w-8 h-8 rounded-full bg-[#e91e3f] text-center text-[13px] font-black leading-8 text-white">{c.d}</span>
                    ) : c.today ? (
                      <span className="relative w-8 h-8 rounded-full border-[1.5px] border-dashed border-[#131313] text-center text-[13px] font-black leading-[29px] text-[#131313]">{c.d}</span>
                    ) : (
                      <span className={`relative w-8 h-8 text-center text-[13px] font-black leading-8 ${c.future ? "text-[#131313]" : "text-[#c4c4c4]"}`}>{c.d}</span>
                    )}
                    <span className={`relative mt-0.5 text-[10px] leading-[14px] font-extrabold ${c.today ? (done ? "text-[#e91e3f]" : "text-[#131313]") : "text-[#8a8a8a]"}`}>
                      {c.today ? "오늘" : "\u00a0"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 기록 · 출석 1회 */}
        <div>
          <p className="mb-1.5 text-[12px] font-black leading-[18px] text-[#131313]">기록</p>
          <Row l="최고 연속"><Num v={(me?.attendBestStreak || 0).toLocaleString()} u="일" /></Row>
          <Row l="누적 출석"><Num v={(me?.attendCount || 0).toLocaleString()} u="일" /></Row>
          <Row l="이번 달"><Num v={rec ? rec.monthDays.toLocaleString() : "—"} u={rec ? "일" : ""} /></Row>
          {me?.streakShields > 0 && <Row l="연속 보호막"><Num v={me.streakShields.toLocaleString()} u="개" /></Row>}
          <div className="flex items-baseline justify-between gap-3 mt-6 mb-1">
            <p className="text-[12px] font-black leading-[18px] text-[#131313]">출석 1회</p>
            <Num v={`+${(gain?.attend || 0).toLocaleString()}`} u="XP" />
          </div>
          {(gain?.attendParts || []).map((p) => (
            <Row key={p.l} l={p.l}><b className="text-[13px] font-black leading-[18px] text-[#131313] tabular-nums">{p.v}</b></Row>
          ))}
          {(gain?.streakParts || []).map((p) => (
            <Row key={p.l} l={p.l} dim><b className="text-[13px] font-black leading-[18px] text-[#a3a3a3] tabular-nums">{p.v}</b></Row>
          ))}
        </div>
      </div>
    </div>
  );

  // ── ② 시즌 — 시즌 누적 · 이번 달 큰 숫자 나란히 → 이번 달 출처(막대 · 줄). 2026-11-02 끝이 빨간 누적 막대는 "뜻이 안 읽힌다"로 뺐다
  const seasonBlock = (
    <div>
      <Head right={dLabel ? <span className="text-[12px] font-extrabold text-[#8a8a8a] tabular-nums">{dLabel}</span> : null}>{seasonName || "시즌"}</Head>
      <div className="grid grid-cols-2 gap-5 lg:gap-10">
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-[#8a8a8a]">시즌 누적</p>
          <p className="mt-2"><Num v={seasonXp == null ? "—" : seasonXp.toLocaleString()} u={seasonXp == null ? "" : "XP"} size="text-[24px] lg:text-[30px]" /></p>
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-extrabold text-[#8a8a8a]">이번 달</p>
          <p className="mt-2"><Num v={`+${monthTotal.toLocaleString()}`} u="XP" size="text-[24px] lg:text-[30px]" tone="text-[#e91e3f]" /></p>
        </div>
      </div>
      <div className="mt-5"><SourceBar parts={monthParts} total={monthTotal} h="h-2.5" /></div>
      <div className="mt-1 grid grid-cols-2 lg:grid-cols-4 gap-x-5">
        {monthParts.filter((x) => x.v > 0).map((x) => (
          <div key={x.k} className="flex items-baseline gap-2 py-[7px]">
            <span aria-hidden className="self-center w-2 h-2 rounded-[2px] shrink-0" style={{ background: x.c }}></span>
            <span className="shrink-0 whitespace-nowrap text-[12.5px] font-bold text-[#5a5a5a]">{x.l}</span>
            <span className="ml-auto shrink-0"><Num v={short(x.v)} size="text-[13px]" /></span>
          </div>
        ))}
      </div>
    </div>
  );

  // ── 지난 시즌 — 최근 시즌부터 한 줄씩: 엠블럼 · 등급 · 레벨 | 시즌 번호 · 이름 · 기간 | 순위 / 전체.
  //    맨 위는 지금 시즌 「결산 예정」 줄 — 같은 모양을 흐리게, 지금 등급 · 레벨 | 시즌 | 「12.31 결산」(2026-11-02 운영자 「결산 예정 줄」 고름.
  //    첫 결산은 시즌 2 끝이라 그 전엔 이 줄 하나만 보인다 — 「아직 기록 없음」 빈칸 대신). 그 시즌 기록이 들어오면 이 줄은 빠진다
  const past = Array.isArray(me?.seasonHistory) ? me.seasonHistory : [];
  // 지난 시즌 창 — 연 시즌 번호(0 닫힘). Esc · 바깥 누르기로 닫는다
  const [pastOpen, setPastOpen] = useState(0);
  useEffect(() => {
    if (!pastOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setPastOpen(0); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pastOpen]);
  const who = useMemo(() => whoOf(user, me, todayTotal), [user, me, todayTotal]);
  const pastPop = (() => {
    const h = pastOpen ? past.find((x) => x.season === pastOpen) : null;
    if (!h) return null;
    const t = VOICE_TIERS.find((x) => x.key === h.tier) || VOICE_TIERS[getTierIndex(h.level || 0)];
    const sn = SEASONS.find((x) => x.number === h.season);
    const period = seasonPeriod(sn);
    const rk = h.seasonRank > 0 ? h.seasonRank : h.rank;
    const lvTop = Math.max(Number(h.maxLevel) || 0, Number(h.level) || 0);
    const cells = [
      { l: "시즌 누적 XP", v: h.seasonXp > 0 ? Number(h.seasonXp).toLocaleString() : "—" },
      { l: "최고 레벨", v: `Lv ${lvTop.toLocaleString()}` },
      { l: "순위", v: rk > 0 ? `#${rk.toLocaleString()}` : "—", u: rk > 0 && h.total > 0 ? `/ ${h.total.toLocaleString()}` : "" },
      { l: "시즌 패스", v: h.passMax > 0 ? Number(h.passTier || 0).toLocaleString() : "—", u: h.passMax > 0 ? `/ ${Number(h.passMax).toLocaleString()}` : "" },
    ];
    const frame = t.key !== "iron" ? t.key : "";
    const close = () => { setPastOpen(0); onTone?.(); };
    return (
      // 스크롤 잠금은 루트의 fixed inset-0 + z-[120] 을 보고 전역 ScrollLock 이 건다
      <div role="dialog" aria-modal="true" aria-label={`S${h.season} 시즌 기록`} className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60" onClick={close}>
        <div className="desk-in w-full sm:w-[520px] max-h-[92dvh] overflow-y-auto bg-white text-[#131313] text-left rounded-t-3xl sm:rounded-3xl p-5 pb-7 sm:p-7" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[19px] sm:text-[20px] font-black tracking-tight truncate"><span className="text-[#e91e3f] mr-1">S{h.season}</span>{sn?.name || h.name || ""}</p>
              {period && <p className="mt-1 text-[12px] font-extrabold text-[#8a8a8a] tabular-nums">{period}</p>}
            </div>
            <button type="button" onClick={close} aria-label="닫기" className="shrink-0 w-9 h-9 -mr-1.5 -mt-1 rounded-full flex items-center justify-center text-[#8a8a8a] hover:text-[#131313] hover:bg-[#f2f2f2] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
              <svg aria-hidden viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <div className="mt-5 mb-5 flex items-center gap-2.5">
            <TierEmblem tier={t} size={44} />
            <b className="text-[20px] font-black tracking-tight" style={tierText(t)}>{t.name}</b>
            <span className="text-[12px] font-extrabold text-[#a3a3a3]">종료 등급</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            {cells.map((c) => (
              <div key={c.l} className="min-w-0">
                <p className="text-[12px] font-extrabold text-[#8a8a8a]">{c.l}</p>
                <p className="mt-1 text-[24px] font-black tracking-tight tabular-nums whitespace-nowrap leading-tight">
                  {c.v}
                  {c.u && <span className="ml-1 text-[13px] font-extrabold text-[#a3a3a3] tracking-normal">{c.u}</span>}
                </p>
              </div>
            ))}
          </div>
          {frame && (
            <>
              <p className="mt-6 mb-2 text-[13px] font-black text-[#5a5a5a]">시즌 보상</p>
              <div className="grid grid-cols-2 gap-2.5">
                <figure className="m-0 min-w-0">
                  <span className="relative flex items-center justify-center h-[130px] rounded-2xl bg-[#151515] overflow-hidden">
                    {who?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={who.image} alt="" draggable={false} className="relative rounded-full object-cover" style={{ width: 60, height: 60 }} />
                    ) : (
                      <span className="relative rounded-full bg-white/10 flex items-center justify-center font-black text-white/60" style={{ width: 60, height: 60, fontSize: 22 }}>{String(who?.name || "?").slice(0, 1)}</span>
                    )}
                    <AvatarFrame frame={frame} px={60} />
                  </span>
                  <figcaption className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5"><b className="text-[13px] font-black">프로필 테두리</b><span className="text-[11px] font-extrabold text-[#8a8a8a]">{t.name} 등급</span></figcaption>
                </figure>
                <figure className="m-0 min-w-0">
                  <span className="flex justify-center h-[130px] rounded-2xl bg-[#f4f4f5] overflow-hidden">
                    <span className="pt-3"><EquipCard w={150} skin={`rank_${frame}`} frame="" image={who?.image} name={who?.name} bare /></span>
                  </span>
                  <figcaption className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5"><b className="text-[13px] font-black">카드 테두리</b><span className="text-[11px] font-extrabold text-[#8a8a8a]">랭크 깃발</span></figcaption>
                </figure>
              </div>
            </>
          )}
        </div>
      </div>
    );
  })();
  const curSn = currentSeason();
  const pending = !past.some((h) => h.season === curSn.number);
  const lvNow = Math.max(0, Number(me?.level) || 0);
  const tNow = VOICE_TIERS[getTierIndex(lvNow)];
  const pastBlock = (
    <div id="past-seasons" className="scroll-mt-28">
      <Head>지난 시즌</Head>
      <div>
        {pending && (
          <div className="flex items-center gap-4 py-2.5">
            <div className="min-w-0 flex-1 flex items-center gap-4 opacity-45">
              <span aria-hidden className="shrink-0 w-9 flex justify-center"><TierEmblem tier={tNow} size={28} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 min-w-0">
                  <span className="min-w-0 truncate text-[15px] font-black tracking-tight" style={tierText(tNow)}>{tNow.name}</span>
                  <span className="shrink-0 text-[12px] font-black text-[#5a5a5a] tabular-nums">Lv {lvNow.toLocaleString()}</span>
                </p>
                <p className="mt-1 flex items-baseline gap-2 min-w-0 text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                  <span className="shrink-0 font-black text-[#5a5a5a]">S{curSn.number}</span>
                  <span className="min-w-0 truncate">{curSn.name}</span>
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[18px] font-black tabular-nums leading-none text-[#a3a3a3]">{Number(curSn.end.slice(5, 7))}.{curSn.end.slice(8, 10)}</p>
              <p className="mt-1 text-[11px] font-bold text-[#a3a3a3]">종료</p>
            </div>
          </div>
        )}
        {past.map((h) => {
          const t = VOICE_TIERS.find((x) => x.key === h.tier) || VOICE_TIERS[getTierIndex(h.level || 0)];
          const sn = SEASONS.find((x) => x.number === h.season);
          const period = seasonPeriod(sn);
          const rk = h.seasonRank > 0 ? h.seasonRank : h.rank;
          return (
            <button key={h.season} type="button" onClick={() => { setPastOpen(h.season); onTone?.(); }} aria-haspopup="dialog" className="group w-full flex items-center gap-4 py-2.5 px-3 -mx-3 rounded-xl text-left transition-colors hover:bg-[#f6f6f7] outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40" style={{ width: "calc(100% + 24px)" }}>
              <span aria-hidden className="shrink-0 w-9 flex justify-center"><TierEmblem tier={t} size={28} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 min-w-0">
                  <span className="min-w-0 truncate text-[15px] font-black tracking-tight" style={tierText(t)}>{t.name}</span>
                  <span className="shrink-0 text-[12px] font-black text-[#5a5a5a] tabular-nums">Lv {Number(h.level || 0).toLocaleString()}</span>
                </p>
                <p className="mt-1 flex items-baseline gap-2 min-w-0 text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                  <span className="shrink-0 font-black text-[#5a5a5a]">S{h.season}</span>
                  <span className="min-w-0 truncate">{sn?.name || h.name || "—"}</span>
                  {period && <span className="shrink-0 hidden sm:inline">{period}</span>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[18px] font-black tabular-nums leading-none text-[#131313]">{rk > 0 ? `#${rk.toLocaleString()}` : "—"}</p>
                <p className="mt-1 text-[11px] font-bold text-[#a3a3a3] tabular-nums">/ {h.total > 0 ? h.total.toLocaleString() : "—"}</p>
              </div>
              <svg aria-hidden viewBox="0 0 24 24" className="shrink-0 w-4 h-4 text-[#b5b5b5] group-hover:text-[#5a5a5a] transition-colors" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── ③ 내역 — 머리(「내역」 + 재화 탭 = 이름 + 보유량)부터 WalletHistory 그 자리 모드가 그린다(7일씩 · 날마다 활동 한 줄 — 2026-11-02 시안 "ㅇㅇ")
  const ledger = (
    <WalletHistory
      open
      inline
      onClose={() => {}}
      onTone={onTone}
      balances={{ xp: me?.xp || 0, point: me?.point || 0 }}
      refreshKey={`${me?.chatEnhance || 0}|${me?.voiceEnhance || 0}|${me?.point || 0}`}
    />
  );

  return (
    <div>
      {attend}
      {sep}
      {seasonBlock}
      {sep}
      {pastBlock}
      {pastPop}
      {sep}
      {ledger}
    </div>
  );
}

// ═══ 「목표」(앞으로) — 계산기 아래 「Lv N 까지」(2026-11-02 운영자 "XP 테이블은 좀 바껴야" → 제안 ㄱ, 이름 「이렇게 하면 도달」은 어색 → 「Lv N 까지」).
//    남은 XP ÷ 1회 획득량 — 채팅은 범위의 가운데 값, 음성은 voiceMin 분마다, 출석은 하루 한 번. 세부 구성(기본 · 강화 · 역할 · 아이템 …)은 gain 의 같은 줄(효과 계산 한 곳)
export function GoalReach({ lv, left, gain, voiceMin = 5 }) {
  const [open, setOpen] = useState("");
  const chatAvg = ((Number(gain?.chatLo) || 0) + (Number(gain?.chatHi) || 0)) / 2;
  const voice = Math.max(0, Number(gain?.voice) || 0);
  const attend = Math.max(0, Number(gain?.attend) || 0);
  const chatTimes = chatAvg > 0 ? Math.ceil(left / chatAvg) : 0;
  const voiceMins = voice > 0 ? Math.ceil(left / voice) * voiceMin : 0;
  const attendDays = attend > 0 ? Math.ceil(left / attend) : 0;
  const fmtRange = (lo, hi) => (lo === hi ? `+${(lo || 0).toLocaleString()}` : `+${(lo || 0).toLocaleString()}~${(hi || 0).toLocaleString()}`);
  const cols = [
    { k: "chat", l: "채팅", big: chatTimes ? <Num v={`약 ${chatTimes.toLocaleString()}`} u="회" size="text-[26px] lg:text-[30px]" /> : <Num v="—" />, sub: `1회 ${fmtRange(gain?.chatLo, gain?.chatHi)}`, parts: gain?.chatParts || [] },
    { k: "voice", l: "음성", big: voiceMins ? <span className="inline-flex items-baseline gap-1">{hm(voiceMins).map(([v, u]) => <Num key={u} v={u === hm(voiceMins)[0][1] ? `약 ${v}` : v} u={u} size="text-[26px] lg:text-[30px]" />)}</span> : <Num v="—" />, sub: `${voiceMin}분마다 +${voice.toLocaleString()}`, parts: gain?.voiceParts || [] },
    { k: "attend", l: "출석", big: attendDays ? <Num v={`약 ${attendDays.toLocaleString()}`} u="일" size="text-[26px] lg:text-[30px]" /> : <Num v="—" />, sub: `하루 한 번 +${attend.toLocaleString()}`, parts: gain?.attendParts || [] },
  ];
  return (
    <section className="mt-9">
      <div className="flex items-baseline justify-between gap-3 mb-3.5">
        <h4 className="text-[16px] font-black text-[#131313] leading-5">Lv {lv.toLocaleString()} 까지</h4>
        <span className="text-[12px] font-extrabold text-[#e91e3f] tabular-nums">{left.toLocaleString()} XP</span>
      </div>
      <div className="border-t border-[#131313] grid grid-cols-1 sm:grid-cols-3 sm:gap-8">
        {cols.map((c, i) => {
          const on = open === c.k;
          return (
            <div key={c.k} className={`min-w-0 pt-4 pb-3 ${i ? "border-t border-[#ededed] sm:border-t-0" : ""}`}>
              <button type="button" onClick={() => setOpen(on ? "" : c.k)} aria-expanded={on} className="inline-flex items-center gap-1 text-[12.5px] font-black text-[#5a5a5a] hover:text-[#131313] transition-colors outline-none focus-visible:underline">
                {c.l}
                <svg aria-hidden viewBox="0 0 24 24" className={`w-3 h-3 transition-transform duration-300 ${on ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.6"><path d="M8.25 4.5l7.5 7.5-7.5 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <p className="mt-2.5">{c.big}</p>
              <p className="mt-2 text-[12px] font-extrabold text-[#8a8a8a] tabular-nums">{c.sub}</p>
              {/* 구성 펼침 — 📌 2026-11-02 운영자 "애니메이션 별로임 · 뚝딱 하고 걍 벌어지고": 늘 그려 두고 높이(0fr → 1fr)를 부드럽게 늘리며
                     줄은 살짝 내려오며 나타난다(닫을 때 거꾸로). 닫힌 동안은 inert — 초점 · 읽기에서 빠진다 */}
              {c.parts.length > 0 && (
                <div
                  inert={!on}
                  className="grid"
                  style={{ gridTemplateRows: on ? "1fr" : "0fr", transition: "grid-template-rows 360ms cubic-bezier(.4,0,.2,1)" }}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div
                      className="mt-3 pt-2 border-t border-dashed border-[#e3e3e6]"
                      style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(-6px)", transition: `opacity ${on ? 260 : 160}ms ease ${on ? 100 : 0}ms, transform 360ms cubic-bezier(.4,0,.2,1)` }}
                    >
                      {c.parts.map((p) => (
                        <div key={p.l} className="flex justify-between py-1 text-[12px] font-bold text-[#8a8a8a] tabular-nums">
                          <span>{p.l}</span>
                          <b className="font-black text-[#131313]">{p.v}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
