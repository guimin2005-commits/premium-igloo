"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { VOICE_TIERS, tierRangeLabel } from "@/lib/voiceTiers";
import { SEASON, seasonStartMs, seasonEndMs } from "@/lib/season";
import { POINT_RATE, xpToPoint } from "@/lib/pointRate";

// 📌 시스템 안내 — 안내 책자. 2026-11-02 운영자 "안내 책자처럼" → A안(목차 + 한 장씩) · "구조가 지금 거 가져다 붙인 거라 별로" → 장 안을 다시 짬 · "도트 아이콘 빼라, 담담하게".
//    PC(lg~) = 왼쪽 목차 + 오른쪽 한 장 + 아래 「← 이전 장 / 쪽수 / 다음 장 →」(첫 장 · 끝 장은 그쪽을 비운다). 폰 · 태블릿 = 위 장 칩 한 줄 + 한 장 + 「← 이전 / 다음 →」.
//    📌 쪽을 두르던 테두리 상자도 뺐다(운영자 "굳이 바깥에 카드가 있어야 할까") — 이 화면에 상자는 없다. 장 제목 아래 먹 선이 쪽의 머리.
//    장 안은 칸(회색 타일) · 아이콘 · 엠블럼 · 색 도장 없이 점선 리더 줄 · ※ 각주 · 줄과 글자 크기로만 나눈다.
//    📌 2026-11-02 "짜치는 단어, 표현 다 바꿔라" — 책 흉내 말(CHAPTER · 1-1 번호 · 알아두기 · 더 붙는 것 · 안 붙는 곳 · 얻는 곳 · 쓰는 곳 · 처음 · 끝)을
//       게임 안내 말(장 번호만 · XP 획득 · 보너스 · ※ 제외 · 획득 · 사용 · 단계당 · 퇴장 초기화)로 바꿨다. 새 글도 이 결로.
//    예전 「전체 흐름 4단계」 판은 뺐다 — 목차 순서(획득 → 등급 → 강화 → 패스 → 빙옥)가 그 흐름이다.
//    장 안의 넓고 좁음은 화면 폭이 아니라 쪽 폭(@container)으로 고른다 — PC 1024 는 목차가 옆에 서서 쪽이 폰보다 조금 넓은 정도라서.
//    숫자는 모두 지금 설정값(P · policy · pass)에서 읽는다 — 운영진이 바꾸면 여기도 따라 바뀐다. 시즌 이름 · 기간은 lib/season.js.
//    📌 설명 문장은 두지 않는다(2026-10-01 "TMI 문구 다 빼") — 숫자 · 짧은 라벨만. 화면 글에서 「 · 」로 말을 잇지 않는다(2026-10-25).
//    규칙의 근거: 봇 bot/src/features/chatXp.js · voiceXp.js · leaveReset.js · attend.js · commands.js
//               lib/enhance.js · lib/seasonPass.js · lib/itemEffects.js · lib/ownedItems.js · lib/unitSale.js · app/api/xp/quests
const fmt = (v) => Number(v || 0).toLocaleString();
// "2026-10-01" → "10.01"
const md = (d) => String(d || "").slice(5).replace("-", ".");
// 부스트 남은 날 — 끝나는 시각까지 올림 일수(지난 건 0). 렌더 밖 함수로 둔다(react-hooks/purity)
const daysLeft = (end) => Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));

// 넘길 때 새 장이 넘긴 쪽에서 살짝 들어온다(--turn = ±12px). 장 칩 줄은 스크롤 막대 없이 옆으로 민다
const GUIDE_CSS = `
@keyframes guideTurn { from { opacity: 0; transform: translateX(var(--turn, 12px)); } to { opacity: 1; transform: none; } }
.guide-turn { animation: guideTurn 0.26s cubic-bezier(0.2,0.8,0.2,1) both; }
.guide-chips { scrollbar-width: none; }
.guide-chips::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) { .guide-turn { animation: none; } }
`;

// 점선 리더 줄 — 이름 ……… 값. sub 는 이름 옆 회색, tail 은 값 옆 회색
const Line = ({ k, sub, tail, children }) => (
  <div className="flex items-baseline py-2">
    <span className="shrink-0 min-w-0 text-[13px] font-extrabold text-[#5a5a5a] break-keep">{k}{sub && <span className="ml-1.5 text-[11px] font-bold text-[#8a8a8a]">{sub}</span>}</span>
    <span aria-hidden className="flex-1 min-w-4 mx-2 border-b-2 border-dotted border-[#d6d6d6] -translate-y-1"></span>
    <span className="shrink-0 text-right text-[15px] font-black tabular-nums whitespace-nowrap">{children}{tail && <span className="ml-1.5 text-[12px] font-extrabold text-[#8a8a8a]">{tail}</span>}</span>
  </div>
);

// 회색 알약 — 줄 높이 = 안쪽 높이(반 픽셀 쏠림 방지, leading-none 금지). 📌 알약 모양은 그대로(운영자 "알약이 짜치는 게 아닌데")
const Pill = ({ children }) => <span className="inline-block h-[28px] leading-[28px] px-3 rounded-full bg-[#f2f2f2] text-[12px] font-extrabold text-[#5a5a5a] whitespace-nowrap">{children}</span>;

export default function SystemGuide({ P, chatBase, chatCooldownLabel, voiceMin, policy, pass, passEnabled, enhOpen, canSeeShop, seasonDday, me, tierIdx }) {
  const topBonus = VOICE_TIERS[VOICE_TIERS.length - 1].bonus;
  const myTier = me ? VOICE_TIERS[tierIdx] : null;
  const boosts = policy?.activeBoosts || [];
  // 📌 2026-10-25 헤드셋 음소거는 설정과 상관없이 XP · 음성 시간 모두 없음(봇 voiceTime.js multOf) — 「헤드셋 음소거」 줄은 늘.
  //    설정 줄은 마이크만 끈 경우라 적용 기준 any 일 때만(both 는 헤드셋까지 끈 때라 위 줄과 같다) · 감소율 0% 면 뺀다
  //    📌 이름은 디스코드 화면 말 그대로 「헤드셋 음소거」 「마이크 음소거」(운영자 "헤드셋 끔이 뭐냐")
  const muteV = P.muteTarget !== "any" || P.muteMode === "off" || (P.muteMode !== "block" && !(Number(P.muteReducePct) > 0))
    ? null : P.muteMode === "block" || Number(P.muteReducePct) >= 100 ? "음성 XP 미지급, 음성 시간 미집계" : `음성 XP −${P.muteReducePct}%`;

  // 📌 연속 출석 보너스 — 관리자가 꺼 두면 policy 가 [] 를 준다(api/xp/policy) → 줄이 아예 안 생긴다.
  //    봇 streakBonusOf(bot/src/attend.js)와 같은 읽기: days 일째 한 번, repeat 면 days 의 배수마다
  const streakRules = Array.isArray(P.attendStreakRules) ? P.attendStreakRules : [];
  const hasPlus = streakRules.length > 0 || boosts.length > 0;

  // 강화 — 최대 단계가 0 인 쪽(관리자가 막아 둔 쪽)은 칸을 만들지 않는다. 1회 추가 = 단계 × step(lib/enhance chatBonus · voiceBonus)
  const enhRows = [
    { l: "채팅", step: P.chatEnhanceStep, max: P.chatEnhanceMax },
    { l: "음성", step: P.voiceEnhanceStep, max: P.voiceEnhanceMax },
  ].filter((r) => Number(r.max) > 0);

  // 📌 빙옥 — 얻는 길 · 쓰는 곳. 코드에 있는 경로만(퀘스트 api/xp/quests · 패스 보상 lib/seasonPass · 출석 아이템 bot attend.js),
  //    지금 닫혀 있는 곳(상점 · 강화 · 패스)은 뺀다. 연속 출석은 빙옥을 주는 규칙이 있을 때만
  const pointFrom = ["퀘스트", passEnabled && "시즌 패스 보상", streakRules.some((r) => r.point > 0) && "연속 출석", "출석 아이템"].filter(Boolean);
  const pointUse = [canSeeShop && "ARCTIC", enhOpen && "강화", passEnabled && "시즌 패스 해금"].filter(Boolean);

  const maxBonus = Math.max(...VOICE_TIERS.map((t) => t.bonus), 1);

  // 시즌 기간 막대 — 지난 몫. 부모가 고른 D-day(seasonDday)에서만 계산한다(렌더 중 Date.now 없이 — 서버 · 브라우저 그림이 같게)
  const seasonTotal = Math.max(1, Math.round((seasonEndMs(SEASON) - seasonStartMs(SEASON)) / 86400000));
  const seasonPct = seasonDday.ended ? 100 : Math.min(100, Math.max(0, ((seasonTotal - seasonDday.days) / seasonTotal) * 100));

  // ── 장 목록 — 닫혀 있는 기능은 장째 뺀다. 번호는 남은 장 순서대로 ──
  const chapters = [
    { k: "xp", t: "XP 획득" },
    { k: "tier", t: "등급" },
    enhOpen && enhRows.length > 0 && { k: "enh", t: "강화" },
    passEnabled && { k: "pass", t: "시즌 패스" },
    (canSeeShop || enhOpen || passEnabled) && { k: "point", t: "빙옥" },
    { k: "cmd", t: "명령어" },
    policy?.resetOnLeave && { k: "note", t: "퇴장 초기화" },
  ].filter(Boolean).map((c, i) => ({ ...c, no: i + 1, n: String(i + 1).padStart(2, "0") }));

  const [curK, setCurK] = useState("xp");
  // 넘긴 방향(1 다음 · -1 이전) — 0 이면 처음 연 것이라 장 넘김 움직임 없이(판이 올라오는 움직임은 page.js 가 한다)
  const [dir, setDir] = useState(0);
  const rootRef = useRef(null);
  const chipsRef = useRef(null);
  const idx = Math.max(0, chapters.findIndex((c) => c.k === curK));
  const cur = chapters[idx];
  const prev = chapters[idx - 1];
  const next = chapters[idx + 1];

  const go = (k) => {
    const to = chapters.findIndex((c) => c.k === k);
    if (to < 0 || to === idx) return;
    setDir(to > idx ? 1 : -1);
    setCurK(k);
    // 칩 줄 — 고른 칩이 보이게 옆으로(세로 스크롤은 건드리지 않게 scrollIntoView 대신 scrollTo)
    const box = chipsRef.current;
    const chip = box?.querySelector(`[data-k="${k}"]`);
    if (box && chip) box.scrollTo({ left: Math.max(0, chip.offsetLeft - 16), behavior: "smooth" });
    // 아래 넘기기에서 넘기면 새 장 첫머리가 화면 위로 지나가 있다 — 그때만 안내 맨 위로 올린다(scroll-mt 가 위 고정 줄 높이)
    const root = rootRef.current;
    if (root && root.getBoundingClientRect().top < 80) root.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  // ── 장 안 ─────────────────────────────
  const body = () => {
    switch (cur.k) {
      // 01 XP 획득 — 음성 · 채팅 · 출석 세 단 → 보너스(점선 줄) → ※ 제외(각주)
      case "xp": {
        const ways = [
          { k: "음성", v: `${fmt(P.voiceXp)}~${fmt(P.voiceXp + topBonus)}`, e: `${voiceMin}분마다`, x: myTier ? <>{myTier.name} 기준 <b className="font-black text-[#131313]">{fmt(P.voiceXp + myTier.bonus)} XP</b></> : null },
          { k: "채팅", v: `${fmt(chatBase[0])}~${fmt(chatBase[1])}`, e: `${chatCooldownLabel}마다` },
          { k: "출석", v: `+${fmt(P.attendXp)}`, e: "하루 1회", x: <>음성 {fmt(P.attendVoiceMin)}분 또는 <b className="font-black text-[#131313]">/출석체크</b></> },
        ];
        const no = [["잠수 채널", "음성 XP 미지급"], ["제외 채널", "XP 미지급"], ["헤드셋 음소거", "음성 XP 미지급, 음성 시간 미집계"], muteV && ["마이크 음소거", muteV]].filter(Boolean);
        return (
          <>
            {/* 좁은 쪽은 위아래 줄, 넓은 쪽(680~)은 세 단 — 단 사이는 세로 선 하나 */}
            <div className="grid grid-cols-1 @min-[680px]:grid-cols-3">
              {ways.map((w, j) => (
                <div key={w.k} className={`min-w-0 border-[#ededed] ${j ? "mt-4 pt-4 border-t @min-[680px]:mt-0 @min-[680px]:pt-0 @min-[680px]:border-t-0 @min-[680px]:border-l @min-[680px]:pl-[22px]" : ""} ${j < ways.length - 1 ? "@min-[680px]:pr-[22px]" : ""}`}>
                  <p className="text-[15px] font-black">{w.k}</p>
                  <p className="mt-2.5 flex items-baseline flex-wrap">
                    <span className="text-[26px] @min-[760px]:text-[28px] font-black tracking-[-0.03em] leading-none tabular-nums">{w.v}</span>
                    <span className="ml-1 text-[12px] font-black text-[#8a8a8a]">XP</span>
                  </p>
                  <p className="mt-2 text-[12px] font-extrabold text-[#8a8a8a] tabular-nums">{w.e}</p>
                  {w.x && <p className="mt-2.5 text-[12px] font-bold text-[#5a5a5a] tabular-nums break-keep">{w.x}</p>}
                </div>
              ))}
            </div>

            {/* 보너스 — 연속 출석 규칙 · 진행 중 행사 부스트가 있을 때만 */}
            {hasPlus && (
              <div className="mt-7 pt-4 border-t border-[#ededed]">
                <p className="mb-0.5 text-[12px] font-black">보너스</p>
                {streakRules.map((r, i) => (
                  <Line key={`s${i}`} k={`연속 출석 ${fmt(r.days)}일${r.repeat ? "마다" : "째"}`} tail={r.xp > 0 && r.point > 0 ? `빙옥 +${fmt(r.point)}` : null}>
                    {r.xp > 0 ? `+${fmt(r.xp)} XP` : `빙옥 +${fmt(r.point)}`}
                  </Line>
                ))}
                {boosts.map((b, i) => {
                  const left = b.endAt ? daysLeft(b.endAt) : null;
                  const who = b.targetRoleName || b.targetChannelName;
                  return <Line key={`b${i}`} k={b.name} sub={who || "전체"} tail={left !== null ? `D-${left}` : "진행 중"}>+{fmt(b.boostXp)} XP</Line>;
                })}
              </div>
            )}

            {/* ※ XP 제외 — 책 각주처럼 점선 아래 작은 줄 */}
            <div className="mt-7 pt-3.5 border-t border-dashed border-[#d6d6d6]">
              <p className="mb-1 text-[12px] font-black">※ XP 제외</p>
              {no.map(([k, v]) => (
                <p key={k} className="flex py-[5px] text-[12px]">
                  <b className="w-[84px] shrink-0 font-extrabold text-[#5a5a5a]">{k}</b>
                  <span className="ml-3.5 min-w-0 font-bold text-[#8a8a8a] break-keep">{v}</span>
                </p>
              ))}
            </div>
          </>
        );
      }

      // 02 등급 — 넓은 쪽(720~)은 10단 계단(내 단 먹 · 단 윗변만 등급색), 좁은 쪽은 위 등급부터 줄 목록
      case "tier":
        return (
          <>
            <p className="mb-4 flex items-center text-[12px] font-black tabular-nums">
              <span>Lv.1~1,000</span>
              <span className="ml-4">{VOICE_TIERS.length}단계</span>
              <span className="ml-auto pl-3 font-extrabold text-[#8a8a8a] whitespace-nowrap">음성 1회 추가 XP</span>
            </p>
            <div className="hidden @min-[720px]:block">
              <div className="grid grid-cols-10 gap-1 items-end h-[210px]">
                {VOICE_TIERS.map((t, i) => {
                  const on = myTier && i === tierIdx;
                  return (
                    <div key={t.key} className="min-w-0 h-full flex flex-col items-center justify-end">
                      {on && <span className="mb-1.5 inline-block h-[18px] leading-[18px] px-[7px] rounded-full bg-[#131313] text-white text-[10px] font-black">나</span>}
                      <span className={`mb-1.5 text-[11px] font-black tabular-nums ${on ? "text-[#131313]" : "text-[#5a5a5a]"}`}>+{fmt(t.bonus)}</span>
                      <span className={`block w-full border-t-[3px] ${on ? "bg-[#131313]" : "bg-[#f2f2f2]"}`} style={{ height: 18 + i * 16, borderTopColor: t.c }} />
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-10 gap-1 pt-2 border-t border-[#131313]">
                {VOICE_TIERS.map((t, i) => {
                  const on = myTier && i === tierIdx;
                  return (
                    <div key={t.key} className="min-w-0 text-center">
                      <p className={`text-[11px] font-black tracking-[-0.04em] whitespace-nowrap ${on ? "text-[#d01634]" : ""}`}>{t.name}</p>
                      <p className="mt-0.5 text-[10px] font-bold text-[#8a8a8a] tabular-nums whitespace-nowrap">{tierRangeLabel(i).replace("Lv.", "").replace(" – ", "–")}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="@min-[720px]:hidden border-t border-[#131313]">
              {VOICE_TIERS.map((t, i) => ({ t, i })).reverse().map(({ t, i }) => {
                const on = myTier && i === tierIdx;
                return (
                  <div key={t.key} className="flex items-center py-2.5 border-b border-[#ededed]">
                    <div className="w-[96px] shrink-0 min-w-0">
                      <p className="flex items-center min-w-0">
                        <span className={`min-w-0 truncate text-[13px] font-extrabold ${on ? "text-[#d01634]" : ""}`}>{t.name}</span>
                        {on && <span className="ml-1 shrink-0 inline-block h-4 leading-4 px-1.5 rounded-full bg-[#131313] text-white text-[9px] font-black">나</span>}
                      </p>
                      <p className="text-[10px] font-bold text-[#8a8a8a] tabular-nums truncate">{tierRangeLabel(i).replace("Lv.", "").replace(" – ", "–")}</p>
                    </div>
                    <div className="flex-1 min-w-0 mx-3">
                      <div className={`h-2 ${on ? "bg-[#131313]" : "bg-[#e4e4e4]"}`} style={{ width: t.bonus > 0 ? `${(t.bonus / maxBonus) * 100}%` : "2px" }} />
                    </div>
                    <p className="w-[60px] shrink-0 text-right text-[13px] font-black tabular-nums">+{fmt(t.bonus)}</p>
                  </div>
                );
              })}
            </div>
          </>
        );

      // 03 강화 — 채팅 | 음성 두 단(점선 줄 두 개 + 단계 눈금), 아래 회색 알약 「영구 유지」 「실패 없음」(운영자 "짜친다는 말을 바꾸라는 거임" — 모양 말고 말만)
      case "enh":
        return (
          <>
            <div className={`grid grid-cols-1 ${enhRows.length > 1 ? "@min-[560px]:grid-cols-2" : ""}`}>
              {enhRows.map((r, j) => (
                <div key={r.l} className={`min-w-0 border-[#ededed] ${j ? "mt-5 pt-5 border-t @min-[560px]:mt-0 @min-[560px]:pt-0 @min-[560px]:border-t-0 @min-[560px]:border-l @min-[560px]:pl-[26px]" : enhRows.length > 1 ? "@min-[560px]:pr-[26px]" : ""}`}>
                  <p className="text-[15px] font-black">{r.l} 강화</p>
                  <div className="mt-2">
                    <Line k="단계당">+{fmt(r.step)} XP</Line>
                    <Line k={`최대 ${r.max}단계`}>+{fmt(r.step * r.max)} XP</Line>
                  </div>
                  {/* 단계 눈금 — 한 칸 = 한 단계, 끝 칸만 먹(단계가 너무 많으면 칸이 실처럼 가늘어져 뺀다) */}
                  {r.max <= 20 && (
                    <>
                      <div aria-hidden className="mt-3.5 h-[30px] flex items-end">
                        {Array.from({ length: r.max }, (_, s) => (
                          <i key={s} className={`flex-1 ${s ? "ml-[3px]" : ""} ${s === r.max - 1 ? "bg-[#131313]" : "bg-[#e4e4e4]"}`} style={{ height: r.max > 1 ? 6 + (s * 24) / (r.max - 1) : 30 }} />
                        ))}
                      </div>
                      <p className="mt-1 flex justify-between text-[10px] font-extrabold text-[#8a8a8a] tabular-nums"><span>1</span><span>{r.max}</span></p>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap">
              <Pill>영구 유지</Pill>
              <span className="ml-1.5"><Pill>실패 없음</Pill></span>
            </div>
          </>
        );

      // 04 시즌 패스 — 시즌 이름 → 기간 막대(지난 몫 먹 · 오늘 빨간 눈금 · D-day) → 해금 점선 줄
      case "pass":
        return (
          <>
            <p className="text-[11px] font-black tracking-[0.1em] text-[#8a8a8a] tabular-nums">SEASON {SEASON.number}</p>
            <p className="mt-1 text-[24px] @min-[560px]:text-[26px] font-black tracking-[-0.03em] leading-tight break-keep">{SEASON.name}</p>
            <div className="relative mt-7 pt-6">
              {/* D-day 글자는 막대 끝에서도 쪽 밖으로 안 나가게 22px 안쪽까지만 */}
              <span className="absolute top-0 -translate-x-1/2 text-[12px] font-black text-[#d01634] tabular-nums whitespace-nowrap" style={{ left: `clamp(22px, ${seasonPct}%, calc(100% - 22px))` }}>
                {seasonDday.ended ? "종료" : `D-${seasonDday.days}`}
              </span>
              <div className="relative h-2 bg-[#ededed]">
                <div className="h-full bg-[#131313]" style={{ width: `${seasonPct}%` }} />
                <span aria-hidden className="absolute -top-1 w-1 h-4 -ml-0.5 bg-[#e91e3f]" style={{ left: `${seasonPct}%` }} />
              </div>
              <p className="mt-2 flex justify-between text-[12px] font-extrabold text-[#8a8a8a] tabular-nums"><span>{md(SEASON.start)}</span><span>{md(SEASON.end)}</span></p>
            </div>
            <div className="mt-6">
              <Line k="프리미엄" tail="빙옥">{fmt(pass?.unlockPoint ?? xpToPoint(pass?.unlockPrice))}</Line>
              {/* 📌 서버 부스터는 부스트 중 프리미엄이 열린다(lib/seasonPass getPassState premiumBy "booster") */}
              <Line k="서버 부스터">자동 해금</Line>
            </div>
          </>
        );

      // 05 빙옥 — 등식 한 줄 → 획득 | 사용 → ARCTIC. 상점이 닫혀 있으면 ARCTIC 단추 · 사용 줄의 ARCTIC 만 빠진다
      case "point":
        return (
          <>
            {/* 📌 환율은 lib/pointRate 한 곳에서 읽는다 — 빙옥으로 내면 XP 가격 ÷ 환율(올림) */}
            <p className="flex items-baseline flex-wrap">
              <span className="text-[32px] @min-[560px]:text-[36px] font-black tracking-[-0.03em] leading-none tabular-nums">1</span>
              <span className="ml-1.5 text-[13px] font-black text-[#8a8a8a]">빙옥</span>
              <span className="mx-3 text-[24px] @min-[560px]:text-[28px] font-black text-[#a3a3a3] leading-none">=</span>
              <span className="text-[32px] @min-[560px]:text-[36px] font-black tracking-[-0.03em] leading-none tabular-nums">{fmt(POINT_RATE)}</span>
              <span className="ml-1.5 text-[13px] font-black text-[#8a8a8a]">XP</span>
            </p>
            <div className={`mt-7 grid grid-cols-1 border-t border-[#ededed] ${pointUse.length ? "@min-[480px]:grid-cols-2" : ""}`}>
              {[{ h: "획득", list: pointFrom }, pointUse.length > 0 && { h: "사용", list: pointUse }].filter(Boolean).map((c, j) => (
                <div key={c.h} className={`min-w-0 pt-4 border-[#ededed] ${j ? "mt-4 border-t @min-[480px]:mt-0 @min-[480px]:border-t-0 @min-[480px]:border-l @min-[480px]:pl-6" : "@min-[480px]:pr-6"}`}>
                  <p className="text-[12px] font-black text-[#8a8a8a]">{c.h}</p>
                  <ul className="mt-2">
                    {c.list.map((x) => <li key={x} className="py-[5px] text-[15px] font-black">{x}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            {canSeeShop && (
              <Link href="/arctic?from=level" className="mt-7 inline-block h-[42px] leading-[42px] px-[22px] rounded-full bg-[#131313] hover:bg-[#3a3a3a] text-white text-[13px] font-black transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
                ARCTIC →
              </Link>
            )}
          </>
        );

      // 06 명령어 — 먹 키캡 ……… 하는 일. 봇 bot/src/commands.js 의 정의 순서 그대로(/시즌패스는 패스가 켜져 있을 때만)
      case "cmd":
        return (
          <div>
            {[
              { c: "/레벨", d: "프로필 카드" },
              { c: "/랭크", d: "서버 순위" },
              { c: "/출석체크", d: "출석 체크" },
              { c: "/퀘스트", d: "퀘스트 현황" },
              { c: "/인벤토리", d: "보유 아이템" },
              passEnabled && { c: "/시즌패스", d: "시즌 패스 현황" },
            ].filter(Boolean).map((r) => (
              <div key={r.c} className="flex items-center py-[9px]">
                <code className="shrink-0 inline-block h-[30px] font-sans leading-[30px] px-[13px] rounded-full bg-[#131313] text-white text-[13px] font-bold">{r.c}</code>
                <span aria-hidden className="flex-1 min-w-4 mx-2.5 border-b-2 border-dotted border-[#d6d6d6]"></span>
                <span className="shrink-0 text-right text-[13px] font-extrabold text-[#5a5a5a] break-keep">{r.d}</span>
              </div>
            ))}
          </div>
        );

      // 07 퇴장 초기화. 봇 leaveReset 이 UserXp 문서를 통째로 지운다(인벤토리 구매 기록은 남는다)
      case "note":
        return (
          <>
            <p className="text-[15px] font-black">서버 퇴장 시</p>
            <div className="mt-3 flex flex-wrap -mb-1.5">
              {["XP", "레벨", "빙옥", "강화", "시즌 패스", "출석 기록"].map((x) => (
                <span key={x} className="mr-1.5 mb-1.5 inline-block h-[30px] leading-[30px] px-3 rounded-full bg-[#f2f2f2] text-[13px] font-extrabold">{x}</span>
              ))}
            </div>
            <p className="mt-[18px] text-[14px] font-black text-[#d01634] break-keep">전부 삭제, 복구 불가</p>
          </>
        );
      default:
        return null;
    }
  };

  // 넘기기 — 양옆은 같은 몫(flex-1)이라 가운데 쪽수가 장마다 안 움직인다. 좁은 쪽은 장 이름 대신 「이전 · 다음」, 첫 장 · 끝 장은 그쪽을 비운다
  const pager = (
    <div className="mt-8 pt-4 border-t border-[#ededed] flex items-center text-[13px] font-black">
      <div className="flex-1 min-w-0 text-left">
        {prev ? (
          <button type="button" onClick={() => go(prev.k)} className="max-w-full truncate hover:text-[#5a5a5a] transition-colors outline-none focus-visible:underline">
            ← <span className="hidden @min-[520px]:inline">{prev.n} {prev.t}</span><span className="@min-[520px]:hidden">이전</span>
          </button>
        ) : null}
      </div>
      <span className="shrink-0 px-3 text-[12px] text-[#8a8a8a] tabular-nums">{idx + 1} / {chapters.length}</span>
      <div className="flex-1 min-w-0 text-right">
        {next ? (
          <button type="button" onClick={() => go(next.k)} className="max-w-full truncate hover:text-[#5a5a5a] transition-colors outline-none focus-visible:underline">
            <span className="hidden @min-[520px]:inline">{next.n} {next.t}</span><span className="@min-[520px]:hidden">다음</span> →
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="text-[#131313] scroll-mt-[150px] lg:scroll-mt-[110px] lg:flex lg:items-start">
      <style>{GUIDE_CSS}</style>

      {/* 목차 — PC. 지금 장은 먹 글자 + 빨간 번호(굵기는 같아 고를 때 줄이 안 움직인다).
          📌 머리 줄(「안내서」 + 먹 SEASON 딱지)은 운영자 "이거 별로다"로 뺐다 — 목차는 장 줄만, 첫 줄 글자 윗선을 오른쪽 장 번호 줄에 맞춘다 */}
      <nav aria-label="안내 목차" className="hidden lg:block w-[220px] shrink-0 mr-10 -mt-[9px]">
        {chapters.map((c) => {
          const on = c.k === cur.k;
          return (
            <button key={c.k} type="button" aria-current={on ? "true" : undefined} onClick={() => go(c.k)}
              className={`w-full flex items-baseline py-[11px] text-left text-[15px] font-extrabold transition-colors outline-none focus-visible:underline ${on ? "text-[#131313]" : "text-[#a3a3a3] hover:text-[#5a5a5a]"}`}>
              <span className={`w-[22px] shrink-0 mr-3.5 text-[12px] font-black tabular-nums ${on ? "text-[#e91e3f]" : "text-[#c4c4c4]"}`}>{c.n}</span>
              {c.t}
            </button>
          );
        })}
      </nav>

      {/* 장 칩 — 폰 · 태블릿. 한 줄을 옆으로 민다 */}
      <div ref={chipsRef} className="guide-chips lg:hidden relative flex overflow-x-auto pb-3.5 mb-5 border-b border-[#ededed]">
        {chapters.map((c) => {
          const on = c.k === cur.k;
          return (
            <button key={c.k} data-k={c.k} type="button" aria-current={on ? "true" : undefined} onClick={() => go(c.k)}
              className={`shrink-0 mr-1.5 last:mr-0 h-[30px] leading-[30px] px-3 rounded-full text-[12px] font-extrabold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40 ${on ? "bg-[#131313] text-white" : "bg-[#f2f2f2] text-[#8a8a8a]"}`}>
              {c.n} {c.t}
            </button>
          );
        })}
      </div>

      {/* 한 장 — 테두리 없이. PC 는 높이를 잡아 장마다 넘기기 줄이 같은 자리에 */}
      <article className="@container flex-1 min-w-0 flex flex-col lg:min-h-[520px]">
        <div key={cur.k} className={`flex-1 min-w-0 ${dir ? "guide-turn" : ""}`} style={dir ? { "--turn": `${dir * 12}px` } : undefined}>
          <p className="text-[12px] font-black tracking-[0.04em] text-[#e91e3f] tabular-nums">{cur.n}</p>
          <h3 className="mt-2 pb-4 lg:pb-[18px] border-b-2 border-[#131313] text-[26px] lg:text-[30px] font-black tracking-[-0.03em] leading-tight">{cur.t}</h3>
          <div className="pt-[18px] lg:pt-6">{body()}</div>
        </div>
        {pager}
      </article>
    </div>
  );
}
