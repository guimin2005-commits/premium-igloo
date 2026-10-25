"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import BackLink from "../components/BackLink";
import ItemIcon from "../components/ItemIcon";
import Icon, { type IconName } from "../components/Icons";
import { INFO_WRAP } from "../components/InfoPage";
import { addMonthsKst } from "@/lib/booster";
import AppliedPreview from "../arctic/AppliedPreview";

// 📌 서버 부스터 혜택 화면 — 공개 안내(/booster)와 내 정보(/profile/booster)가 이 하나를 같이 쓴다.
//    2026-10-24 운영자 「비교형」 3차(.claude/mockups/booster/pages3.mjs — "아이콘은 좀 구리다" · "상세 설명도 없고 · 전용들도 방치"):
//    머리(배지 · SERVER BOOSTER · 서버 부스터 | 부스트하기 · 적용 중) → 「부스팅 혜택」 표(줄마다 선 아이콘 연분홍 칸 · 이름 아래 설명 한 줄 · 부스터 열만 분홍) →
//    해제 안내 한 줄 → 「전용 혜택」 헤어라인 줄 목록(10/25 카드에서 바꿈) + 참고 문구. 폰은 표 대신 목록(오른쪽에 [일반 + 부스터] 한 줄), 부스트하기는 맨 아래 꽉 찬 단추.
//    2026-10-25 「더해지는 것처럼」(시안 .claude/mockups/booster/부스터-표-플러스-시안.png — "부스팅하면 오히려 더 적어보이는 거 같잖아" · "반갈죽하고 가운데에 플러스 하나"):
//    일반 · 부스터 칸 반반 + 경계에 「+」 동그라미, 부스터 값 앞 「+」는 뗐다. 시즌 패스(해금 구매 → 자동 해금)만 「→」("자동해금은 너 알아서 해").
//    이름은 "채팅 XP · 음성 XP · 출석 XP"(운영자 "채팅 1회 음성 5분 이렇게 가지 말고 … 단순화") — 주기는 설명 줄에.
//    2026-10-25 「최초 부스팅」 줄(운영자 "최초 부스팅 시 XP 지급은 또 어디갔어" → 150,000 XP + 빙옥 30, 사람당 한 번 — 봇 features/boosterBonus.js)을 맨 위에.
//    숫자는 박아 두지 않는다 — 「일반」은 봇 설정, 「부스터」는 「서버 부스터 혜택」을 켠 아이템의 효과 합, 최초 부스팅 · 연속 부스팅은 관리 › 레벨 설정 「서버 부스터 보상」(GET /api/booster).
//    2026-10-25 「연속 부스팅 보상」 칸(시안 .claude/mockups/booster/부스터-연속-보상-시안-3.png — "혜택은 나중에 내가 수정할테니까 추가해"): 표 아래 · 전용 혜택 위.
//    PC 는 단계 막대(점 · 칸), 폰은 목록. 부스터면 받은 단계 「받음」 · 다음 단계 「D-n」 · 닿았는데 봇이 아직 안 준 단계 「지급 대기」.
//    섹션 제목 옆 부제는 뺐다(운영자 "ㅇㅈㄹ 좀 하는 거 빼면 안 되냐 · 중간 점 작작넣어") — 글에 중간 점(·)을 늘어놓지 않는다

export const BOOSTER_DISCORD = "https://discord.gg/V2uW2nUczU";

type Data = {
  base: { chatMin: number; chatMax: number; voiceXp: number; voiceMin: number; attendXp: number };
  perks: { chat: number; voice: number; attend: number; cashback: number };
  extras: string[];
  badge: { id: string; name: string; icon: string; imageUrl: string; color: string } | null;
  skin?: { key: string; label: string; botCard?: boolean } | null;
  frame?: { key: string; label: string } | null;
  bonus?: { xp: number; point: number };
  ladder?: { months: number; xp: number; point: number }[];
  me: { booster: boolean | null; since: string; months?: number; got?: number[]; next?: { months: number; at: string } | null } | null;
};
type Row = {
  key: string;
  icon: IconName;
  label: string;
  short?: string;
  desc: string;
  descShort?: string;
  base: [string, string];
  val: [string, string];
  sub?: string; // 부스터 값 아래 둘째 줄(최초 부스팅의 빙옥)
  word?: boolean;
  to?: boolean; // 일반 → 부스터가 「더하기」가 아니라 「바뀜」인 줄(시즌 패스 해금 구매 → 자동 해금) — 「+」 대신 「→」
};

// 전용 혜택 — 디스코드 부스터 역할에 붙은 권한(사이트가 주는 게 아니라 고정 안내)
// 📌 2026-10-25 운영자 "하 디자인 너무 AI다 · 선 그으랬지 내가" → 아이콘 칸 · 알약 · 카드를 빼고 안내 화면 골격(InfoPage)의 헤어라인 줄 목록. 문구는 운영자가 붙여 준 공식 문구
// 📌 유의사항 — 운영자 원고 그대로(2026-10-25). [제목, 설명]
const NOTICES: [string, string][] = [
  ["혜택 유지 조건", "부스트 상태가 유지되는 동안 상시 혜택(추가 XP, 캐시백, 전용 테두리 등)이 적용되며, 부스팅이 종료되거나 취소될 경우 최초 1회 보상을 제외한 모든 전용 혜택은 즉시 비활성화 및 회수됩니다."],
  ["최초 부스팅 보상 기준", "최초 부스팅 보상(빙옥 30개 + 150,000 XP)은 계정당 최초 1회에 한하여 지급되며, 부스팅 재시작 시 중복 지급되지 않습니다."],
  ["다중 부스팅 중복 여부", "동일 계정으로 서버를 2회 이상 중복 부스팅하더라도 추가 배율이나 보너스 효과는 중첩 적용되지 않습니다."],
  ["전용 테두리 및 배지", "부스터 전용 카드 테두리와 프로필 테두리는 부스터 역할이 유지되는 동안에만 착용 및 노출됩니다."],
  ["시스템 반영 시간", "디스코드 서버 부스팅 완료 후 대시보드 권한 및 역할 반영까지 1~3분 정도 동기화 지연이 발생할 수 있습니다. (반영되지 않을 경우 페이지 새로고침 또는 재접속 권장)"],
];
const PERKS: { label: string; desc: string; v: string }[] = [
  { label: "전용 역할", desc: "부스팅 즉시 @SERVER BOOSTER 전용 식별 역할이 자동으로 부여됩니다.", v: "자동 지급" },
  { label: "사용자 관리 권한", desc: "서버 내 지정된 커뮤니티 관리 편의 기능을 상시 이용할 수 있습니다.", v: "상시 이용" },
  { label: "권한 제한 채널", desc: "별도의 권한 해금 절차 없이 보안 및 전용 채널에 자유롭게 접근할 수 있습니다.", v: "상시 이용" },
  { label: "슬로우 모드 해제", desc: "채널별 채팅 쿨다운(슬로우 모드) 제한 없이 연속적인 대화가 가능합니다.", v: "상시 이용" },
];

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");
// 단계가 많아(10~12) 칸이 좁을 때만 — 만 단위로 줄여 쓴다(+100만). 정확한 값은 칸 title
const fmtShort = (n: number) => (n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString("ko-KR")}만` : fmt(n));
// 부스트 시작일 → "2026. 9. 1." · 오늘까지 며칠째(시작일 = 1일째)
const sinceOf = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const k = new Date(t + 9 * 3600 * 1000);
  const day = Math.floor((Date.now() - t) / 86400000) + 1;
  return { date: `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`, day: Math.max(1, day) };
};

function rowsOf(d: Data): Row[] {
  const out: Row[] = [];
  const { base, perks } = d;
  const bx = Math.max(0, Number(d.bonus?.xp) || 0), bp = Math.max(0, Number(d.bonus?.point) || 0);
  if (bx > 0 || bp > 0) {
    out.push({
      key: "bonus", icon: "gift", label: "최초 부스팅", desc: "서버 최초 부스팅 시 계정당 1회 즉시 지급", base: ["—", ""],
      val: bx > 0 ? [fmt(bx), "XP"] : [fmt(bp), "빙옥"],
      sub: bx > 0 && bp > 0 ? `빙옥 ${fmt(bp)}` : undefined,
    });
  }
  // 📌 부스터 값은 앞 「+」 없이 숫자만 — 일반 | 부스터 경계의 「+」 동그라미가 더하기를 보여 준다(2026-10-25 운영자 "부스팅하면 오히려 더 적어보이는 거 같잖아" ·
  //    "일반 / 부스터 반갈죽하고 가운데에 플러스 하나 박으면 되잖아")
  if (perks.chat > 0) out.push({ key: "chat", icon: "chat", label: "채팅 XP", desc: "채팅 XP 획득 시 추가 보너스 적립", base: [`${fmt(base.chatMin)}~${fmt(base.chatMax)}`, "XP"], val: [fmt(perks.chat), "XP"] });
  if (perks.voice > 0) out.push({ key: "voice", icon: "mic", label: "음성 XP", desc: `음성 채널 접속 ${base.voiceMin}분 단위 추가 보너스 적립`, base: [fmt(base.voiceXp), "XP"], val: [fmt(perks.voice), "XP"] });
  if (perks.attend > 0) out.push({ key: "attend", icon: "calendar", label: "출석 XP", desc: "일일 출석 체크 완료 시 추가 보너스 적립", base: [fmt(base.attendXp), "XP"], val: [fmt(perks.attend), "XP"] });
  if (perks.cashback > 0) out.push({ key: "cash", icon: "receipt", label: "ARCTIC 캐시백", short: "캐시백", desc: "ARCTIC 내 XP 결제 금액 기준 일정 비율 페이백", descShort: "XP 결제 금액 기준 일정 비율 페이백", base: ["—", ""], val: [String(perks.cashback), "%"] });
  for (const [i, line] of d.extras.entries()) out.push({ key: `x${i}`, icon: "sparkles", label: line, desc: "부스팅 중인 동안 적용", base: ["—", ""], val: ["적용", ""], word: true });
  out.push({ key: "pass", icon: "star", label: "시즌 패스 프리미엄", short: "시즌 패스", desc: "별도 해금 절차 없이 프리미엄 보상 자동 수령", base: ["해금 구매", ""], val: ["자동 해금", ""], word: true, to: true });
  if (d.badge) out.push({ key: "badge", icon: "sparkles", label: "전용 배지", desc: "프로필과 대시보드 카드에 다는 부스터 배지", base: ["—", ""], val: ["부스터 배지", ""], word: true });
  // 📌 전용 꾸미기(2026-10-25 운영자 "혜택에도 추가해") — 부스터 혜택 아이템에 카드 테두리 · 프로필 테두리 효과가 있으면 줄 하나씩. 이름은 설명 줄에
  //    (부스터 칸에 이름을 넣으면 폰에서 왼쪽 이름 칸이 「전용 카드 테두 / 리」로 끊긴다 — 칸은 배지 줄처럼 짧게)
  if (d.skin) out.push({ key: "skin", icon: "image", label: "전용 카드 테두리", desc: d.skin.label, base: ["—", ""], val: ["부스터 테두리", ""], word: true });
  if (d.frame) out.push({ key: "frame", icon: "user", label: "전용 프로필 테두리", desc: d.frame.label, base: ["—", ""], val: ["부스터 테두리", ""], word: true });
  return out;
}

// 연속 부스팅 단계마다 상태 — 받음(봇 기록) · 다음(D-n) · 지급 대기(닿았는데 아직 기록 없음) · 그 밖(부스터만 「—」)
type StepState = "got" | "next" | "wait" | "none";
const CHECK = (s: number) => (
  <svg aria-hidden viewBox="0 0 12 12" width={s} height={s} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.3 2.3 4.7-5" /></svg>
);
function ladderView(d: Data) {
  const ladder = Array.isArray(d.ladder) ? d.ladder : [];
  const me = d.me?.booster === true ? d.me : null;
  const since = me?.since ? Date.parse(me.since) : NaN;
  const months = me ? Math.max(0, Number(me.months) || 0) : 0;
  const got = new Set(me?.got || []);
  const nextAt = me?.next?.at ? Date.parse(me.next.at) : NaN;
  const dDay = Number.isFinite(nextAt) ? Math.max(1, Math.ceil((nextAt - Date.now()) / 86400000)) : 0;
  const state = (m: number): StepState =>
    !me ? "none" : got.has(m) ? "got" : me.next?.months === m ? "next" : m <= months ? "wait" : "none";
  // 막대 — 마지막으로 닿은 단계까지 + 다음 단계까지 간 만큼(시각 비율)
  let fill = 0;
  if (me && Number.isFinite(since) && ladder.length > 1) {
    let r = -1;
    ladder.forEach((s, i) => { if (s.months <= months) r = i; });
    if (r >= 0) {
      let frac = 0;
      if (r < ladder.length - 1) {
        const a = addMonthsKst(since, ladder[r].months), b = addMonthsKst(since, ladder[r + 1].months);
        frac = b > a ? Math.min(1, Math.max(0, (Date.now() - a) / (b - a))) : 0;
      }
      fill = Math.min(1, (r + frac) / (ladder.length - 1));
    }
  }
  return { ladder, me, state, dDay, fill };
}
const stepWord = (st: StepState, dDay: number, booster: boolean) =>
  st === "got" ? "받음" : st === "next" ? `D-${dDay}` : st === "wait" ? "지급 대기" : booster ? "—" : "";

// 값 + 작은 단위(XP · %)
const Val = ({ v }: { v: [string, string] }) => (
  <span className="tabular-nums whitespace-nowrap">
    {v[0]}
    {v[1] && <small>{v[1]}</small>}
  </span>
);
// 일반 → 부스터 사이 기호 — 더하기(+) · 바뀜(→). 읽는 프로그램에는 글자로
const Op = ({ to, s, className }: { to?: boolean; s: number; className: string }) => (
  <span className={`${className}${to ? " to" : ""}`}>
    <svg aria-hidden viewBox="0 0 12 12" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={to ? "M2 6h8M6.8 2.8 10 6 6.8 9.2" : "M6 2.2v7.6M2.2 6h7.6"} />
    </svg>
    <span className="sr-only">{to ? "→" : "+"}</span>
  </span>
);
const Tile = ({ icon }: { icon: IconName }) => (
  <span className="bst-ti" aria-hidden>
    <Icon name={icon} size={20} strokeWidth={1.8} />
  </span>
);

// 시안 값 그대로 — Tailwind 임의 grid-template 이 이 프로젝트에서 안 먹어(메모 tailwind-v4-quirks) 이 화면 몫은 아래 한 벌로
const CSS = `
.bst-ti { flex: none; width: 36px; height: 36px; border-radius: 11px; background: #fff0f7; color: #c2307d; display: inline-flex; align-items: center; justify-content: center; }
.bst-sec { margin-top: 32px; display: flex; align-items: baseline; gap: 10px; }
.bst-sec h2 { font-size: 18px; font-weight: 900; letter-spacing: -0.02em; }
.bst-sec span { font-size: 12px; font-weight: 800; color: #9a9a9a; }
.bst-foot { margin-top: 12px; font-size: 12px; font-weight: 700; color: #9a9a9a; }
.bst-table { display: none; }
.bst-list { margin-top: 12px; border-radius: 20px; background: #fff; box-shadow: inset 0 0 0 1px #e6e6e9; }
/* 폰 목록 — 맨 위 머리 줄 [혜택 | 일반 + 부스터], 줄마다 오른쪽에 [일반 + 부스터] 한 줄(2026-10-25 「더해지는 것처럼」) */
.bst-lh { display: flex; align-items: center; justify-content: space-between; height: 38px; padding: 0 14px; border-bottom: 1px solid #f0f0f2; font-size: 11px; font-weight: 900; letter-spacing: 0.04em; color: #8a8a8a; }
.bst-lh > span:last-child { display: inline-flex; align-items: center; gap: 5px; }
.bst-lh b { color: #c2307d; font-weight: 900; }
.bst-li { display: flex; align-items: center; gap: 12px; padding: 14px 14px 14px 12px; border-top: 1px solid #f0f0f2; }
.bst-lh + .bst-li { border-top: 0; }
.bst-lt { flex: 1; min-width: 0; }
.bst-lt b { display: block; font-size: 14px; font-weight: 900; }
.bst-lt i { display: block; margin-top: 3px; font-style: normal; font-size: 12px; font-weight: 700; color: #8a8a8a; word-break: keep-all; line-height: 1.4; }
.bst-lv { flex: none; display: flex; flex-direction: column; align-items: flex-end; }
.bst-eq { display: flex; align-items: center; gap: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bst-eq .n { font-size: 13px; font-weight: 800; color: #9a9a9a; }
.bst-eq .b { font-size: 17px; font-weight: 900; color: #c2307d; }
.bst-eq .b small { margin-left: 3px; font-size: 10.5px; font-weight: 800; color: #e2489a; }
.bst-eq.w .n { font-size: 12px; }
.bst-eq.w .b { font-size: 14px; }
.bst-lv .s { display: inline-flex; align-items: center; gap: 3px; margin-top: 3px; font-size: 11.5px; font-weight: 900; color: #c2307d; white-space: nowrap; }
/* 더하기 · 바뀜 동그라미 — 폰 작은 것(.bst-o) · PC 표 경계에 걸친 큰 것(.bst-op). 평평한 분홍 단색, 「→」는 흰 바탕 + 분홍 테 */
.bst-o { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 999px; background: #e2489a; color: #fff; }
.bst-lh .bst-o { width: 15px; height: 15px; }
.bst-o.to, .bst-op.to { background: #fff; color: #c2307d; box-shadow: inset 0 0 0 1.5px #e2489a; }
.bst-op { display: none; }
/* 전용 혜택 — 헤어라인 줄 목록(안내 화면 골격 InfoRow 와 같은 결: 위 먹선 · 줄마다 옅은 선). 폰은 [이름 · 값] 한 줄 + 설명 아래 */
.bst-pk { margin-top: 12px; border-top: 1px solid #131313; }
.bst-pr { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 12px; padding: 16px 0; border-bottom: 1px solid #ededed; }
.bst-pr b { order: 1; flex: 1 1 auto; min-width: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
.bst-pr span { order: 2; flex: none; font-size: 13px; font-weight: 800; color: #5a5a5a; white-space: nowrap; }
.bst-pr p { order: 3; flex: 1 1 100%; margin-top: 6px; font-size: 13px; line-height: 1.5; font-weight: 600; color: #5a5a5a; word-break: keep-all; }
.bst-note { margin-top: 12px; font-size: 12px; font-weight: 700; color: #9a9a9a; word-break: keep-all; line-height: 1.5; }
/* 유의사항 — 제목 한 줄 + 설명(전용 혜택 줄 목록과 같은 헤어라인 결, 글은 한 단계 작게) */
.bst-ntc { margin-top: 12px; border-top: 1px solid #131313; }
.bst-ntc li { padding: 14px 0; border-bottom: 1px solid #ededed; }
.bst-ntc b { display: block; font-size: 14px; font-weight: 800; letter-spacing: -0.01em; }
.bst-ntc p { margin-top: 6px; font-size: 13px; line-height: 1.55; font-weight: 600; color: #5a5a5a; word-break: keep-all; }
/* 연속 부스팅 — 폰 · 태블릿 목록(.bst-ll) · PC(1024~) 단계 막대(.bst-lad). 640~1023 은 칸이 좁아 금액이 옆 칸과 겹쳐서(검토 실측) 목록으로 둔다 */
.bst-lad { display: none; }
.bst-ll { margin-top: 12px; border-radius: 20px; background: #fff; box-shadow: inset 0 0 0 1px #e6e6e9; }
.bst-lr { display: flex; align-items: center; gap: 12px; padding: 12px 14px 12px 12px; border-top: 1px solid #f0f0f2; }
.bst-lr:first-child { border-top: 0; }
.bst-mk { flex: none; width: 36px; height: 36px; border-radius: 11px; background: #fff0f7; color: #c2307d; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; font-variant-numeric: tabular-nums; }
.bst-mk.got { background: #e2489a; color: #fff; }
.bst-mk.next { background: #fff; box-shadow: inset 0 0 0 2px #e2489a; }
.bst-lt2 { flex: 1; min-width: 0; }
.bst-lt2 b { display: block; font-size: 14px; font-weight: 900; }
.bst-lt2 i { display: flex; gap: 8px; margin-top: 2px; font-style: normal; font-size: 12px; font-weight: 800; color: #c2307d; font-variant-numeric: tabular-nums; white-space: nowrap; }
.bst-st { flex: none; font-size: 11.5px; font-weight: 900; color: #b5b5b5; white-space: nowrap; }
.bst-st.got { color: #e2489a; }
.bst-st.next { height: 22px; line-height: 22px; padding: 0 9px; border-radius: 999px; background: #e2489a; color: #fff; }
@media (min-width: 1024px) {
  .bst-ll { display: none; }
  .bst-lad { display: block; margin-top: 14px; border-radius: 22px; background: #fff; box-shadow: inset 0 0 0 1px #e6e6e9; padding: 22px 16px 16px; }
  .bst-trk { position: relative; z-index: 0; height: 6px; border-radius: 3px; background: #f0e6ec; }
  .bst-trk i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: #e2489a; }
  .bst-dots { position: relative; z-index: 1; display: grid; margin-top: -12px; }
  .bst-dot { justify-self: center; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 6px; background: #fff; box-shadow: inset 0 0 0 2px #e3d5de; }
  .bst-dot.got { background: #e2489a; box-shadow: none; }
  .bst-dot.next { box-shadow: inset 0 0 0 2px #e2489a; }
  .bst-cells { display: grid; gap: 4px; margin-top: 12px; }
  .bst-cell { border-radius: 14px; padding: 12px 2px; text-align: center; min-width: 0; }
  .bst-cell .m { font-size: 12px; font-weight: 900; color: #8a8a8a; }
  .bst-cell .x { margin-top: 6px; font-size: 14px; font-weight: 900; color: #c2307d; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; white-space: nowrap; }
  .bst-lad.dense .bst-cell .x { font-size: 12px; }
  .bst-cell .x small { margin-left: 2px; font-size: 10px; font-weight: 800; color: #e2489a; }
  .bst-cell .pt { margin-top: 3px; font-size: 11.5px; font-weight: 800; color: #c2307d; }
  .bst-cell .bst-st { display: inline-block; margin-top: 8px; height: 20px; line-height: 20px; }
  .bst-cell .bst-st.next { padding: 0 8px; }
}
@media (min-width: 640px) {
  .bst-sec { margin-top: 40px; }
  .bst-sec h2 { font-size: 20px; }
  .bst-list { display: none; }
  .bst-table { display: block; margin-top: 14px; border-radius: 22px; background: #fff; box-shadow: inset 0 0 0 1px #e6e6e9; overflow: hidden; }
  /* 일반 · 부스터 칸은 같은 폭(반반) — 두 칸 경계 가운데에 「+」(.bst-op) */
  .bst-tr { display: grid; grid-template-columns: 1.35fr 0.9fr 0.9fr; border-top: 1px solid #f0f0f2; }
  .bst-tr:first-child { border-top: 0; }
  .bst-tr > div { display: flex; align-items: center; gap: 14px; padding: 0 24px; min-height: 76px; min-width: 0; }
  .bst-lab b { display: block; font-size: 15px; font-weight: 900; }
  .bst-lab i { display: block; margin-top: 3px; font-style: normal; font-size: 12.5px; font-weight: 700; color: #8a8a8a; }
  .bst-nor { font-size: 17px; font-weight: 800; color: #9a9a9a; }
  .bst-nor small, .bst-val small { margin-left: 4px; font-size: 11px; font-weight: 800; }
  .bst-nor small { color: #b5b5b5; }
  .bst-tr > .bst-val { position: relative; padding-left: 38px; background: #fff3f9; font-size: 20px; font-weight: 900; color: #c2307d; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; }
  .bst-val small { color: #e2489a; }
  .bst-val .s { display: inline-flex; align-items: center; gap: 3px; font-size: 13px; font-weight: 900; color: #c2307d; }
  .bst-op { position: absolute; left: -15px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: #e2489a; color: #fff; box-shadow: 0 0 0 3px #fff; }
  .bst-op.to { box-shadow: inset 0 0 0 1.5px #e2489a, 0 0 0 3px #fff; }
  .bst-nor.w { font-size: 14px; }
  .bst-tr > .bst-val.w { font-size: 15px; }
  .bst-tr.h > div { min-height: 50px; font-size: 12px; font-weight: 900; letter-spacing: 0.06em; color: #8a8a8a; }
  .bst-tr.h > .bst-val { background: #e2489a; color: #fff; font-size: 13px; }
  .bst-pk { margin-top: 14px; }
  .bst-pr { flex-wrap: nowrap; column-gap: 24px; padding: 18px 0; }
  .bst-pr b { order: 1; flex: none; width: 176px; font-size: 16px; }
  .bst-pr p { order: 2; flex: 1 1 auto; margin-top: 0; font-size: 14px; }
  .bst-pr span { order: 3; }
}
`;

export default function BoosterBenefits({ back }: { back: { href: string; label: string } }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/booster", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!off && j?.success) setD(j.data); })
      .catch(() => {});
    return () => { off = true; };
  }, []);

  // 📌 전용 꾸미기 미리보기(2026-10-25 운영자 "전용 테두리 어떻게 생겼는지 보여줘야지 혜택에") — 상점 상세 「적용 미리보기」(AppliedPreview)를 세트처럼 —
  //    전용 카드 테두리 · 전용 프로필 테두리 · 전용 배지를 한 벌로 입혀 프로필 카드 · 디스코드 /레벨 카드에. 로그인했으면 내 카드(/api/xp/me), 아니면 예시 사람
  const { data: session, status } = useSession();
  const loggedIn = status === "authenticated" && !!session?.user;
  const [meData, setMeData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    let off = false;
    fetch("/api/xp/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!off && j?.success) setMeData(j.data); })
      .catch(() => {});
    return () => { off = true; };
  }, [loggedIn]);
  const preview = useMemo(() => {
    if (!d || !(d.skin || d.frame)) return null;
    const parts = [
      ...(d.skin ? [{ itemId: "booster-skin", name: d.skin.label, shortName: d.skin.label, type: "cosmetic", cosmetic: { skin: d.skin.key, botCard: d.skin.botCard !== false } }] : []),
      ...(d.frame ? [{ itemId: "booster-frame", name: d.frame.label, shortName: d.frame.label, type: "cosmetic", cosmetic: { frame: d.frame.key } }] : []),
      ...(d.badge ? [{ itemId: d.badge.id, name: d.badge.name, shortName: d.badge.name, icon: d.badge.icon, imageUrl: d.badge.imageUrl, color: d.badge.color, type: "cosmetic", cosmetic: { badge: true } }] : []),
    ];
    return { _id: "booster-cosmetics", name: "서버 부스터 전용 꾸미기", bundleItems: parts };
  }, [d]);
  const booster = d?.me?.booster === true;
  const since = booster && d?.me?.since ? sinceOf(d.me.since) : null;
  const rows = d ? rowsOf(d) : [];
  const lv = d ? ladderView(d) : null;
  const nStep = lv?.ladder.length || 0;
  const cols = { gridTemplateColumns: `repeat(${Math.max(1, nStep)}, minmax(0, 1fr))` };
  const badgeIcon = (size: number) =>
    d?.badge ? <ItemIcon icon={d.badge.icon} imageUrl={d.badge.imageUrl} type="cosmetic" size={size} color={d.badge.color || undefined} /> : null;
  const cta = (
    <a href={BOOSTER_DISCORD} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center justify-center h-12 px-[26px] rounded-full bg-[#e2489a] hover:bg-[#cf3a88] text-white text-[14px] font-black whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#e2489a]/40">
      서버에서 부스트하기
    </a>
  );

  return (
    <section className={INFO_WRAP}>
      <style>{CSS}</style>
      <BackLink href={back.href} label={back.label} inline className="mb-[18px]" />
      {/* 머리 — 배지(있을 때만) · SERVER BOOSTER · 서버 부스터 | PC 오른쪽: 부스터면 적용 중 · 시작일, 아니면 부스트하기 */}
      <div className="flex items-center gap-[18px]">
        {d?.badge && <span className="shrink-0 hidden sm:block">{badgeIcon(76)}</span>}
        {d?.badge && <span className="shrink-0 sm:hidden">{badgeIcon(56)}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-black tracking-[0.32em] text-[#e2489a]">SERVER BOOSTER</p>
          <h1 className="mt-2 text-[28px] sm:text-[34px] font-black tracking-[-0.02em] leading-none">서버 부스터</h1>
        </div>
        {d && (booster ? (
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <b className="inline-block h-[30px] leading-[30px] px-3.5 rounded-full bg-[#e2489a] text-white text-[13px] font-black">적용 중</b>
            {since && <span className="text-[12px] font-extrabold text-[#8a8a8a] tabular-nums"><i className="not-italic text-[#131313]">{since.date}</i>부터 <i className="not-italic text-[#131313]">{since.day}일째</i></span>}
          </div>
        ) : (
          <div className="shrink-0 hidden sm:block">{cta}</div>
        ))}
      </div>

      {/* 부스팅 혜택 — PC 표(혜택 | 일반 | 부스터) · 폰 목록 */}
      <div className="bst-sec"><h2>부스팅 혜택</h2></div>
      <div className="bst-table">
        <div className="bst-tr h"><div>혜택</div><div>일반</div><div className="bst-val">부스터</div></div>
        {rows.map((r) => (
          <div key={r.key} className="bst-tr">
            <div className="bst-lab">
              <Tile icon={r.icon} />
              <span className="min-w-0 break-keep"><b>{r.label}</b><i>{r.desc}</i></span>
            </div>
            <div className={`bst-nor${r.word ? " w" : ""}`}><Val v={r.base} /></div>
            <div className={`bst-val${r.word ? " w" : ""}`}>
              <Op to={r.to} s={13} className="bst-op" />
              <Val v={r.val} />
              {r.sub && <span className="s whitespace-nowrap"><Op s={9} className="inline-flex" />{r.sub}</span>}
            </div>
          </div>
        ))}
        {!d && <div className="h-[380px]" aria-hidden />}
      </div>
      <div className="bst-list">
        <div className="bst-lh" aria-hidden><span>혜택</span><span>일반<Op s={9} className="bst-o" /><b>부스터</b></span></div>
        {rows.map((r) => (
          <div key={r.key} className="bst-li">
            <Tile icon={r.icon} />
            <div className="bst-lt"><b>{r.short || r.label}</b><i>{r.descShort || r.desc}</i></div>
            <div className="bst-lv">
              <p className={`bst-eq${r.word ? " w" : ""}`}>
                <span className="n">{r.base[0]}</span>
                <Op to={r.to} s={9} className="bst-o" />
                <span className="b">{r.val[0]}{r.val[1] && <small>{r.val[1]}</small>}</span>
              </p>
              {r.sub && <span className="s"><Op s={8} className="inline-flex" />{r.sub}</span>}
            </div>
          </div>
        ))}
        {!d && <div className="h-[420px]" aria-hidden />}
      </div>
      <p className="bst-foot">부스팅 종료 시, 최초 1회 지급 보상을 제외한 상시 혜택 적용이 종료됩니다.</p>

      {/* 전용 꾸미기 — 전용 카드 테두리 · 프로필 테두리 · 배지를 입힌 모습(상점 「적용 미리보기」와 같은 부품) */}
      {preview && (
        <>
          <div className="bst-sec"><h2>전용 꾸미기</h2></div>
          <div className="mt-4">
            <AppliedPreview bare item={preview} user={loggedIn ? session?.user : null} me={loggedIn ? meData : null} />
          </div>
        </>
      )}

      {/* 연속 부스팅 보상 — 단계가 하나라도 있을 때만. PC 단계 막대 · 폰 목록 */}
      {lv && nStep > 0 && (
        <>
          <div className="bst-sec"><h2>연속 부스팅 보상</h2></div>
          <div className={`bst-lad${nStep > 9 ? " dense" : ""}`}>
            <div className="bst-trk" style={{ margin: `0 calc(100% / ${nStep * 2})` }}><i style={{ width: `${(lv.fill * 100).toFixed(2)}%` }} /></div>
            <div className="bst-dots" style={cols}>
              {lv.ladder.map((s) => {
                const st = lv.state(s.months);
                return <span key={s.months} className={`bst-dot${st === "got" ? " got" : st === "next" ? " next" : ""}`}>{st === "got" && CHECK(12)}</span>;
              })}
            </div>
            <div className="bst-cells" style={cols}>
              {lv.ladder.map((s) => {
                const st = lv.state(s.months);
                const word = stepWord(st, lv.dDay, !!lv.me);
                return (
                  <div key={s.months} className="bst-cell">
                    <p className="m">{s.months}개월</p>
                    {s.xp > 0 && <p className="x" title={nStep > 9 ? `+${fmt(s.xp)} XP` : undefined}>+{nStep > 9 ? fmtShort(s.xp) : fmt(s.xp)}<small>XP</small></p>}
                    {s.point > 0 && <p className="pt">빙옥 {fmt(s.point)}</p>}
                    {word && <p className={`bst-st${st === "got" ? " got" : st === "next" ? " next" : ""}`}>{word}</p>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bst-ll">
            {lv.ladder.map((s) => {
              const st = lv.state(s.months);
              const word = stepWord(st, lv.dDay, false);
              return (
                <div key={s.months} className="bst-lr">
                  <span className={`bst-mk${st === "got" ? " got" : st === "next" ? " next" : ""}`}>{st === "got" ? CHECK(16) : s.months}</span>
                  <div className="bst-lt2">
                    <b>{s.months}개월</b>
                    <i>{s.xp > 0 && <span>+{fmt(s.xp)} XP</span>}{s.point > 0 && <span>빙옥 {fmt(s.point)}</span>}</i>
                  </div>
                  {word && <span className={`bst-st${st === "got" ? " got" : st === "next" ? " next" : ""}`}>{word}</span>}
                </div>
              );
            })}
          </div>
          <p className="bst-foot">부스트를 멈추면 개월 수는 처음부터 다시 셉니다. 받은 단계는 다시 받지 않습니다.</p>
        </>
      )}

      {/* 전용 혜택 — 디스코드 부스터 역할 권한 */}
      <div className="bst-sec"><h2>전용 혜택</h2></div>
      <div className="bst-pk">
        {PERKS.map((p) => (
          <div key={p.label} className="bst-pr">
            <b>{p.label}</b>
            <p>{p.desc}</p>
            <span>{p.v}</span>
          </div>
        ))}
      </div>
      <p className="bst-note">&apos;권한 제한 채널 이용&apos; 및 &apos;슬로우 모드 해제&apos; 기능은 부스터 미적용 상태에서도 ARCTIC 상점에서 개별 권한 상품을 구매하여 활성화할 수 있습니다.</p>

      {/* 📌 유의사항(2026-10-25 운영자가 붙여 준 「서버 부스터 혜택 안내 유의사항」 글 그대로 — FAQ 「계정 및 멤버십」에도 같은 글) */}
      <div className="bst-sec"><h2>유의사항</h2></div>
      <ul className="bst-ntc">
        {NOTICES.map(([t, d]) => (
          <li key={t}>
            <b>{t}</b>
            <p>{d}</p>
          </li>
        ))}
      </ul>

      {/* 폰 — 부스터가 아니면 맨 아래 꽉 찬 부스트하기 */}
      <div className="pt-6 pb-24 md:pb-16">
        {d && !booster && <div className="sm:hidden [&>a]:w-full">{cta}</div>}
      </div>
    </section>
  );
}
