"use client";

import Link from "next/link";
import { VOICE_TIERS, tierRangeLabel } from "@/lib/voiceTiers";
import { SEASON } from "@/lib/season";
import { POINT_RATE } from "@/lib/pointRate";
import TierEmblem from "../components/TierEmblem";
import { ICON_PATHS } from "../components/Icons";

// 📌 시스템 안내 — 줄글 문서 대신 한눈에 읽히는 안내판.
//    잉크 패널 한 장(전체 흐름) → 큰 숫자 타일(XP 모으기) → 더 붙는 것 | 안 붙는 것 → 등급 계단 → 강화 · 시즌 패스 → ARCTIC → 명령어.
//    숫자는 모두 지금 설정값(P · policy · pass)에서 읽는다 — 운영진이 바꾸면 여기도 따라 바뀐다.
//    규칙의 근거: 봇 bot/src/features/chatXp.js · voiceXp.js · commands.js(/출석체크) · lib/enhance.js · lib/seasonPass.js
const fmt = (v) => Number(v || 0).toLocaleString();

const Ico = ({ d, className = "w-5 h-5" }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d={d} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// 섹션 머리 — 굵은 제목 한 줄 + 오른쪽 메타
const Head = ({ title, right }) => (
  <div className="flex items-end justify-between gap-4 mb-5 md:mb-6">
    <h3 className="text-[22px] md:text-[26px] font-black tracking-tight leading-none">{title}</h3>
    {right && <span className="shrink-0 text-[12px] font-bold text-[#8a8a8a] tabular-nums">{right}</span>}
  </div>
);

// 큰 숫자 타일 — 아이콘 · 이름 · 주기 / 큰 값 / 한 줄
const Tile = ({ icon, name, every, value, unit = "XP", line, children, className = "" }) => (
  <div className={`rounded-2xl border border-[#ededed] bg-white p-5 md:p-6 flex flex-col ${className}`}>
    <div className="flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-full bg-[#f2f2f2] text-[#131313] flex items-center justify-center shrink-0"><Ico d={icon} className="w-[18px] h-[18px]" /></span>
      <span className="text-[15px] font-black">{name}</span>
      <span className="ml-auto text-[12px] font-bold text-[#8a8a8a] tabular-nums">{every}</span>
    </div>
    <p className="mt-5 flex items-baseline gap-1.5 flex-wrap">
      <span className="text-[34px] md:text-[40px] font-black tracking-[-0.03em] leading-none tabular-nums">{value}</span>
      {unit && <span className="text-[13px] font-black text-[#8a8a8a]">{unit}</span>}
    </p>
    {line && <p className="mt-2.5 text-[13px] text-[#5a5a5a] leading-relaxed break-keep">{line}</p>}
    {children}
  </div>
);

// 더 붙는 것(+) / 안 붙는 것(−) / 그냥 사실(점) 한 줄
const Rule = ({ plus, dot, k, v }) => (
  <div className="flex items-start gap-3 py-3 border-b border-[#ededed] last:border-b-0">
    {dot ? (
      <span aria-hidden className="mt-2 mx-[7px] w-1.5 h-1.5 rounded-full bg-[#131313] shrink-0"></span>
    ) : (
      <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[12px] font-black leading-none ${plus ? "bg-[#131313] text-white" : "bg-[#e91e3f]/[0.08] text-[#d01634]"}`}>{plus ? "+" : "−"}</span>
    )}
    <p className="min-w-0 text-[13px] leading-relaxed break-keep">
      <span className="font-extrabold text-[#131313]">{k}</span>
      <span className="text-[#5a5a5a]"> · {v}</span>
    </p>
  </div>
);

export default function SystemGuide({ P, chatBase, chatCooldownLabel, voiceMin, policy, pass, passEnabled, enhOpen, canSeeShop, seasonDday, me, tierIdx }) {
  const topBonus = VOICE_TIERS[VOICE_TIERS.length - 1].bonus;
  const myTier = me ? VOICE_TIERS[tierIdx] : null;
  const boosts = policy?.activeBoosts || [];
  const muteWho = P.muteTarget === "any" ? "마이크나 헤드셋 중 하나라도 끄면" : "마이크와 헤드셋을 모두 끄면";
  const muteV = P.muteMode === "off" ? null : P.muteMode === "block" ? `${muteWho} 음성 XP 없음` : `${muteWho} 음성 XP −${P.muteReducePct}%`;

  // 전체 흐름 — 실제 순서라 번호를 단다. 상점이 닫혀 있으면 마지막 칸은 강화(열려 있을 때)로
  const steps = [
    { k: "모으기", big: "채팅 · 음성 · 출석", meta: "매일 · 자동" },
    { k: "오르기", big: "Lv.1 → 1,000", meta: "XP가 쌓이면 자동" },
    { k: "등급", big: `${VOICE_TIERS.length}단계`, meta: "오를 때마다 빙옥 · 음성 보너스" },
    canSeeShop ? { k: "쓰기", big: "ARCTIC", meta: "XP · 빙옥으로 구매" } : enhOpen ? { k: "키우기", big: "강화", meta: "XP · 빙옥으로 영구 강화" } : null,
  ].filter(Boolean);

  const maxBonus = Math.max(...VOICE_TIERS.map((t) => t.bonus), 1);

  return (
    <div className="text-[#131313]">
      {/* ── 전체 흐름 — 이 화면에서 들어 올리는 건 이것 하나 ── */}
      <section className="relative overflow-hidden rounded-2xl bg-[#131313] text-white px-6 py-7 md:px-10 md:py-9">
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-60"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "28px 28px" }}></div>
        <div className={`relative grid grid-cols-2 gap-x-6 gap-y-8 ${steps.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          {steps.map((s, i) => (
            <div key={s.k} className="min-w-0">
              {/* 이어지는 길 — 점 하나와 선. 마지막 칸은 선 없이 점만 */}
              <div aria-hidden className="flex items-center gap-2 mb-4">
                <span className={`w-2 h-2 rounded-full shrink-0 ${i === steps.length - 1 ? "bg-[#e91e3f]" : "bg-white"}`}></span>
                {i < steps.length - 1 && <span className={`flex-1 h-px bg-white/20 ${i % 2 === 1 ? "hidden md:block" : ""}`}></span>}
              </div>
              <p className="text-[11px] font-black tracking-[0.18em] text-[#ff5c77] tabular-nums">{String(i + 1).padStart(2, "0")} · {s.k}</p>
              <p className="mt-2.5 text-[21px] md:text-[26px] font-black tracking-tight leading-tight break-keep">{s.big}</p>
              <p className="mt-2 text-[12px] md:text-[13px] font-bold text-white/60 break-keep">{s.meta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── XP 모으기 — 음성이 가장 크다: 왼쪽 큰 칸, 오른쪽 채팅 · 출석 ── */}
      <section className="mt-14 md:mt-16">
        <Head title="XP 모으기" right="매일 · 자동" />
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
          <Tile
            className="md:col-span-7 md:row-span-2"
            icon={ICON_PATHS.mic}
            name="음성"
            every={`${voiceMin}분마다`}
            value={`${fmt(P.voiceXp)}~${fmt(P.voiceXp + topBonus)}`}
            line={`기본 ${fmt(P.voiceXp)} XP에 등급 보너스가 더해집니다.`}
          >
            {/* 등급별 1회 — 가로 막대로 오르는 폭만 보여 준다 (자세한 표는 아래 등급) */}
            <div className="mt-auto pt-6">
              <div role="img" aria-label={`등급별 음성 추가 XP, ${VOICE_TIERS[0].name} 0 ~ ${VOICE_TIERS[VOICE_TIERS.length - 1].name} ${fmt(topBonus)}`} className="flex items-end gap-1 h-16">
                {VOICE_TIERS.map((t, i) => {
                  const on = myTier && i === tierIdx;
                  return (
                    <span key={t.key} title={`${t.name} +${fmt(t.bonus)}`}
                      className={`flex-1 rounded-t-[3px] ${on ? "ring-2 ring-[#131313] ring-offset-1" : ""}`}
                      style={{ height: t.bonus > 0 ? `${(t.bonus / maxBonus) * 100}%` : "2px", backgroundColor: t.c }} />
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-[#8a8a8a] tabular-nums">
                <span>{VOICE_TIERS[0].name} +0</span>
                <span>{VOICE_TIERS[VOICE_TIERS.length - 1].name} +{fmt(topBonus)}</span>
              </div>
              {myTier && <p className="mt-3 text-[13px] font-extrabold tabular-nums">내 등급 {myTier.name} · 1회 {fmt(P.voiceXp + myTier.bonus)} XP</p>}
            </div>
          </Tile>
          <Tile
            className="md:col-span-5"
            icon={ICON_PATHS.chat}
            name="채팅"
            every={`${chatCooldownLabel}에 한 번`}
            value={`${fmt(chatBase[0])}~${fmt(chatBase[1])}`}
            line="쿨타임 안에 보낸 메시지는 세지 않습니다."
          />
          <Tile
            className="md:col-span-5"
            icon={ICON_PATHS.check}
            name="출석"
            every="하루 한 번"
            value={`+${fmt(P.attendXp)}`}
            line={`음성 ${fmt(P.attendVoiceMin)}분을 채우거나 /출석체크. 자정(KST)에 다시 받습니다.`}
          />
        </div>

        {/* 더 붙는 것 | 안 붙는 것 */}
        <div className="mt-3 md:mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          <div className="rounded-2xl bg-[#f2f2f2] px-5 py-2">
            <Rule plus k="퀘스트" v="일일 · 주간 · 월간, 대시보드에서 직접 받기" />
            <Rule plus k="역할 · 부스트" v="채팅 · 음성 1회마다 더해짐" />
            {enhOpen && <Rule plus k="강화" v="채팅 · 음성 1회 지급량이 영구로 오름" />}
            {boosts.map((b, i) => {
              const left = b.endAt ? Math.max(0, Math.ceil((new Date(b.endAt).getTime() - Date.now()) / 86400000)) : null;
              const who = b.targetRoleName || b.targetChannelName;
              return <Rule key={i} plus k={`${b.name} +${fmt(b.boostXp)}`} v={[who ? `${who} 대상` : "모두", left !== null ? `D-${left}` : "진행 중"].join(" · ")} />;
            })}
          </div>
          <div className="rounded-2xl bg-[#f2f2f2] px-5 py-2">
            <Rule k="잠수 채널" v="음성 XP 없음" />
            <Rule k="제외된 채널" v="채팅 · 음성 XP 없음" />
            {muteV && <Rule k="음소거" v={muteV} />}
          </div>
        </div>
      </section>

      {/* ── 등급 — 음성 1회 추가 XP 계단. 내 등급은 먹 테두리 + "나" ── */}
      <section className="mt-14 md:mt-16">
        <Head title="등급" right={`레벨 따라 자동 · ${VOICE_TIERS.length}단계`} />

        {/* PC — 세로 막대 계단 (lg 이상 — 그보다 좁으면 이름이 잘린다) */}
        <div className="hidden lg:block">
          <p className="text-[12px] font-bold text-[#5a5a5a] mb-3">음성 1회 추가 XP</p>
          <div className="grid grid-cols-10 gap-3 items-end h-[200px]">
            {VOICE_TIERS.map((t, i) => {
              const on = myTier && i === tierIdx;
              return (
                <div key={t.key} className="flex flex-col items-center justify-end h-full min-w-0">
                  {on && <span className="mb-1.5 inline-flex items-center h-5 px-2 rounded-full bg-[#131313] text-white text-[10px] font-black">나</span>}
                  <span className="text-[13px] font-black tabular-nums mb-1.5">+{fmt(t.bonus)}</span>
                  <span className={`w-full rounded-t-md ${on ? "ring-2 ring-[#131313] ring-offset-2" : ""}`}
                    style={{ height: t.bonus > 0 ? `${(t.bonus / maxBonus) * 136}px` : "2px", backgroundColor: t.c }} />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-10 gap-3 border-t border-[#131313] pt-3">
            {VOICE_TIERS.map((t, i) => {
              const on = myTier && i === tierIdx;
              return (
                <div key={t.key} className="min-w-0 flex flex-col items-center text-center">
                  <TierEmblem tier={t} size={22} />
                  <span className={`mt-1.5 text-[12px] font-extrabold truncate max-w-full ${on ? "text-[#d01634]" : ""}`}>{t.name}</span>
                  <span className="mt-0.5 text-[10px] font-bold text-[#8a8a8a] tabular-nums whitespace-nowrap">{tierRangeLabel(i).replace("Lv.", "")}</span>
                  <span className="mt-1.5 text-[10px] font-bold text-[#5a5a5a] tabular-nums whitespace-nowrap">{t.point ? `빙옥 +${fmt(t.point)}` : "시작"}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 모바일 · 태블릿 — 가로 막대 줄 */}
        <div className="lg:hidden border-t border-[#131313]">
          {VOICE_TIERS.map((t, i) => {
            const on = myTier && i === tierIdx;
            return (
              <div key={t.key} className="flex items-center gap-3 py-3 border-b border-[#ededed]">
                <TierEmblem tier={t} size={22} />
                <div className="w-[96px] shrink-0 min-w-0">
                  <p className="flex items-center gap-1 min-w-0">
                    <span className={`min-w-0 truncate text-[13px] font-extrabold ${on ? "text-[#d01634]" : ""}`}>{t.name}</span>
                    {on && <span className="shrink-0 inline-flex items-center h-4 px-1.5 rounded-full bg-[#131313] text-white text-[9px] font-black">나</span>}
                  </p>
                  <p className="text-[10px] font-bold text-[#8a8a8a] tabular-nums truncate">{tierRangeLabel(i)}</p>
                </div>
                <div className="flex-1 min-w-0 h-2 rounded-full bg-[#f2f2f2] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: t.bonus > 0 ? `${(t.bonus / maxBonus) * 100}%` : "2px", backgroundColor: t.c }} />
                </div>
                <span className="w-[58px] shrink-0 text-right text-[13px] font-black tabular-nums">+{fmt(t.bonus)}</span>
              </div>
            );
          })}
          <p className="mt-3 text-[11px] font-bold text-[#8a8a8a]">막대 · 숫자 = 음성 1회 추가 XP</p>
        </div>
      </section>

      {/* ── 강화 · 시즌 패스 ── */}
      {(enhOpen || passEnabled) && (
        <section className="mt-14 md:mt-16">
          <Head title="키우기" />
          <div className={`grid grid-cols-1 gap-3 md:gap-4 ${enhOpen && passEnabled ? "md:grid-cols-2" : ""}`}>
            {enhOpen && (
              <div className="rounded-2xl border border-[#ededed] p-5 md:p-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-[#f2f2f2] flex items-center justify-center shrink-0"><Ico d={ICON_PATHS.flame} className="w-[18px] h-[18px]" /></span>
                  <span className="text-[15px] font-black">강화</span>
                  <span className="ml-auto inline-flex items-center h-6 px-2.5 rounded-full bg-[#f2f2f2] text-[11px] font-black text-[#5a5a5a]">영구 · 실패 없음</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  {[
                    { l: "채팅", step: P.chatEnhanceStep, max: P.chatEnhanceMax },
                    { l: "음성", step: P.voiceEnhanceStep, max: P.voiceEnhanceMax },
                  ].map((r) => (
                    <div key={r.l}>
                      <p className="text-[12px] font-bold text-[#5a5a5a]">{r.l} 1회</p>
                      <p className="mt-1.5 text-[28px] md:text-[32px] font-black tracking-[-0.03em] leading-none tabular-nums">+{fmt(r.step)}</p>
                      <p className="mt-1.5 text-[11px] font-bold text-[#8a8a8a] tabular-nums">단계마다 · 최대 {r.max}단계</p>
                    </div>
                  ))}
                </div>
                <p className="mt-5 pt-4 border-t border-[#ededed] text-[12px] text-[#5a5a5a] break-keep">
                  XP 또는 빙옥으로 냅니다. 단계마다 비용이 {P.chatEnhanceCostGrowthPct}% 오르고, XP로 내면 레벨이 내려갈 수 있습니다.
                </p>
              </div>
            )}
            {passEnabled && (
              <div className="rounded-2xl border border-[#ededed] p-5 md:p-6">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-full bg-[#f2f2f2] flex items-center justify-center shrink-0"><Ico d={ICON_PATHS.star} className="w-[18px] h-[18px]" /></span>
                  <span className="text-[15px] font-black">시즌 패스</span>
                  <span className="ml-auto inline-flex items-center h-6 px-2.5 rounded-full bg-[#131313] text-white text-[11px] font-black tabular-nums">
                    SEASON {SEASON.number} · {seasonDday.ended ? "종료" : `D-${seasonDday.days}`}
                  </span>
                </div>
                <div className="mt-5">
                  <p className="text-[12px] font-bold text-[#5a5a5a]">프리미엄 해금</p>
                  <p className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-[28px] md:text-[32px] font-black tracking-[-0.03em] leading-none tabular-nums">{fmt(pass?.unlockPrice)}</span>
                    <span className="text-[13px] font-black text-[#8a8a8a]">XP</span>
                  </p>
                </div>
                <div className="mt-5 pt-1 border-t border-[#ededed]">
                  <Rule dot k="진행" v="이번 시즌에 번 XP만큼 티어가 오름 (써도 줄지 않음)" />
                  <Rule dot k="무료 트랙" v="누구나, 대시보드에서 직접 받기" />
                  <Rule dot k="시즌 종료" v="진행 · 해금 · 받은 기록 초기화" />
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── ARCTIC · 빙옥 ── */}
      {canSeeShop && (
        <section className="mt-14 md:mt-16">
          <Head title="쓰기" />
          <div className="rounded-2xl border border-[#ededed] p-5 md:p-6 flex flex-col md:flex-row md:items-center gap-5 md:gap-10">
            <div className="shrink-0">
              <p className="text-[12px] font-bold text-[#5a5a5a]">빙옥 · XP</p>
              {/* 📌 환율은 lib/pointRate 한 곳에서 읽는다 — 빙옥으로 내면 XP 가격 ÷ 환율(올림) */}
              <p className="mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-[34px] md:text-[40px] font-black tracking-[-0.03em] leading-none tabular-nums">1</span>
                <span className="text-[13px] font-black text-[#8a8a8a]">빙옥</span>
                <span className="px-0.5 text-[24px] md:text-[28px] font-black text-[#a3a3a3] leading-none">=</span>
                <span className="text-[34px] md:text-[40px] font-black tracking-[-0.03em] leading-none tabular-nums">{fmt(POINT_RATE)}</span>
                <span className="text-[13px] font-black text-[#8a8a8a]">XP</span>
              </p>
            </div>
            <div className="flex-1 min-w-0">
              <Rule dot k="XP로 사기" v="가격만큼 XP가 빠지고, 레벨이 내려갈 수 있음" />
              <Rule dot k="빙옥" v="등급이 오를 때 받는 재화, 레벨과 상관없음" />
              <Rule dot k="인벤토리" v="산 것 · 받은 것, 기간제는 남은 날짜 표시" />
            </div>
            <Link href="/arctic?from=level" className="shrink-0 self-start md:self-center inline-flex items-center gap-1.5 h-11 px-6 rounded-full bg-[#131313] hover:bg-[#3a3a3a] text-white text-[13px] font-extrabold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e91e3f]/40">
              ARCTIC <Ico d={ICON_PATHS.arrowRight} className="w-4 h-4" />
            </Link>
          </div>
        </section>
      )}

      {/* ── 명령어 — 키캡 ── */}
      <section className="mt-14 md:mt-16">
        <Head title="명령어" right="디스코드" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {[
            { c: "/레벨", d: "다음 레벨까지 필요한 XP" },
            { c: "/랭크", d: "XP · 레벨 · 서버 순위" },
            { c: "/출석체크", d: "오늘 출석 XP 받기" },
          ].map((r) => (
            <div key={r.c} className="flex items-center gap-3 rounded-2xl border border-[#ededed] px-4 py-3.5">
              <code className="shrink-0 inline-flex items-center h-8 px-3.5 rounded-full bg-[#131313] text-white text-[13px] font-bold">{r.c}</code>
              <span className="min-w-0 text-[13px] text-[#5a5a5a] break-keep">{r.d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── 알아두실 것 — 한두 줄 ── */}
      <div className="mt-12 md:mt-14 pt-5 border-t border-[#ededed] space-y-1.5">
        {policy?.resetOnLeave && <p className="text-[12px] font-bold text-[#d01634] break-keep">서버를 나가면 XP · 레벨 · 빙옥 · 강화가 삭제되고 복구되지 않습니다.</p>}
        <p className="text-[12px] text-[#5a5a5a] break-keep">숫자는 지금 설정값이며, 운영 상황에 따라 바뀔 수 있습니다.</p>
      </div>
    </div>
  );
}
