"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import ItemIcon from "../components/ItemIcon";
import AvatarFrame from "../components/AvatarFrame";
import { ICON_PATHS } from "../components/Icons";
import { openLogin } from "../components/LoginPrompt";
import { FitBox, ProfileCardPreview, BadgePreview, Avatar, whoOf, badgeOfItem, useTodayXp } from "../arctic/CosmeticPreview";
import { itemTypeColor, itemTypeLabel } from "@/lib/items";
import { FRAME_OF } from "@/lib/itemEffects";
import { shortNameOf } from "@/lib/itemCategory";
import { rarityOf } from "@/lib/rarity";
import { CURRENCY_PIXEL } from "@/lib/currencyIcons";
import { playTone } from "@/lib/sfx";

// 📌 「친구 초대」 창 — 이벤트 창(./EventTabs.js EventHub) 안 탭 하나(embedded). 서버는 app/api/invite(GET 상태 · POST redeem · POST claim — lib/invite.js).
//    초대 수 · 받을 단계 · 코드를 넣을 수 있는지(enter.show)는 서버가 센다 — 화면은 받은 대로만 그린다.
//    시안 .claude/mockups/invite/친구초대-창-시안5-보상.png(mock5.mjs — 치수 · 색 그대로). 운영자가 시안에서 바꾼 것 둘:
//      · 상시 이벤트(끝 날짜 없음) — 머리에 기간 알약 없음 · 탭 줄 맨 앞 고정(app/level/page.js openEvents)
//    📌 결 — 사이트 기본 밝은 톤(도트 아님 · 그라데이션 · 빛 없음 · 단색 판). 색은 디자인 기준 한 벌(surface #fff · sunken #f2f2f2 · ink #131313 · muted #5a5a5a ·
//       soft #8a8a8a 메타만 · line #ededed · 조작 테 #a3a3a3 · accent #e91e3f). 보너스 띠만 괴담회 보라(#241b38) — 할로윈 추첨권 덧붙임이라
//      PC  머리(「친구 초대」 · 「초대한 친구 N명」 · 닫기) → 왼쪽 400(내 초대 코드 · 「코드 복사」 · 보너스 띠 · 받은 초대 코드 입력)
//          | 오른쪽(초대 보상 — 단계 알약 줄 + 단계마다 카드 · 마지막 단계는 먹 카드 / 초대한 친구 목록 — 이 목록만 안에서 스크롤)
//      폰  한 줄 시트(세로로 넘김): 머리 → 코드(+보너스) → 초대 보상(카드 2열 · 알약은 카드 위) → 받은 초대 코드 → 초대한 친구
//    📌 PC 는 세로 스크롤 없음 — 칸(EventHub .evh-slot) 높이에 맞춰 줄인다(아래 @container iv — 낮으면 칸 · 코드 판 · 여백을 줄이고 친구 목록이 남은 높이를 받는다).
//       폭도 칸 폭(864 ~ 1100 · 탭 줄이 위면 592 ~)에 맞춰 왼쪽을 400 → 320 → 280 으로. 단계 카드가 너무 좁아지면 줄째 옆으로 넘긴다
//    📌 보상 카드 — 이벤트 패스 보상 칸과 같은 규칙(.claude 메모 「보상 표시 규칙」): 이름은 이름만 · 기간은 칸 위 꼬리표(시계 + 「7일」) · 분류는 칩(상점 칩과 같은 글자 · 유형 색,
//       XP · 빙옥은 칩 없음) · 등급 색은 칸 아래 띠(lib/rarity.js) · 효과 한 줄 또는 꾸미기 「미리보기」 · 여러 보상은 칸 따로 + 「보상 N개」 + 이름 줄마다.
//       아래 줄은 받음 「✓ 받음」 · 받을 것 빨간 「받기」(카드 빨간 테) · 잠김은 자물쇠만 — 남은 수(「N명 더」) 같은 글자는 찍지 않는다(운영자)
//       칸을 누르면 그 자리 말풍선(단계 보상 전부) — 받지 않는다. 꾸미기는 「미리보기」 → 창 위에 겹치는 밝은 판(IvPreview — 상점 적용 미리보기와 같은 부품)

const API = "/api/invite";
// 📌 폰 판 기준 — 이벤트 패스 · 괴담회 창과 같은 sm 경계
const NARROW_MQ = "(max-width: 639.98px)";
const subNarrow = (cb) => {
  const mq = window.matchMedia(NARROW_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);

// 초대한 친구 동그라미 색(이름 첫 글자) — 시안 그대로 넷을 돌린다
const AV = ["#ffd6e3", "#cdeedd", "#ffeeb5", "#d6e4ff"];
// 미리보기 테두리 칸 안 사진 지름 — 상점 적용 미리보기(AppliedPreview FRAME_TILE)와 같은 값
const FRAME_TILE = 30;

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
// KST 날짜 "10. 27." — 끝 시각은 들어가지 않으므로(11. 9. 00:00) endExclusive 면 1ms 빼서 마지막 날로
const kstDay = (iso, endExclusive = false) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - (endExclusive ? 1 : 0) + 9 * 3600000);
  return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
};
// 📌 코드 입력 정리 — 대문자 · 빈칸 · 붙임표 빼기(서버와 같은 정리), 6자까지. maxLength 를 input 에 걸면 「K7Q-2ZP」 붙여넣기가 정리 전에 잘려서 여기서 자른다
const normCode = (v) => String(v || "").toUpperCase().replace(/[\s-]+/g, "").slice(0, 6);

// ── 보상 표기 — 서버 RewardView(name 짧은 이름 · categoryLabel · rarity · days · effectLines · cosmetic) 그대로. 없던 칸이면 유형에서 ──
const daysOf = (r) => (r?.kind === "item" ? Math.max(0, Math.floor(Number(r.days) || 0)) : 0);
const nameOf = (r) => (r ? String(r.name || "").trim() || (r.kind === "role" ? itemTypeLabel("role") : r.kind === "item" ? itemTypeLabel(r.itemType || "item") : "") : "");
// 분류 칩 글자 · 색 — 상점 카드 칩과 같은 값. 재화(XP · 빙옥)는 칩 없음(이름이 곧 양)
const kindOf = (r) => (r?.kind === "item" ? r.categoryLabel || itemTypeLabel(r.itemType || "item") : r?.kind === "role" ? r.categoryLabel || itemTypeLabel("role") : "");
const kindColorOf = (r) => itemTypeColor(r?.kind === "role" ? "role" : r?.itemType || "item");
const linesOf = (r) => (Array.isArray(r?.effectLines) ? r.effectLines.filter(Boolean) : []);
// 꾸미기 미리보기 재료 — 이벤트 패스 cosOf 와 같은 기준(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)
const cosOf = (r) => {
  const c = r?.cosmetic;
  return c && typeof c === "object" && (c.skin || c.scene || c.frame || c.badge) ? c : null;
};
// 📌 받은 것 이름 — 서버 labels(rewardLabel 「아이템 · 이름 · 7일」 — 이번에 실제로 준 것만. 부분 수령이면 준 것만 온다)를 그 단계 보상(RewardView.label)과
//    짝지어 이름만(이벤트 패스 gotNames 와 같은 짝짓기). 짝이 없는 label(옛 응답 · 연 뒤 관리자가 보상을 바꿈)은 머리말 · 기간 꼬리 · 이름 안 분류 머리말만 떼서 붙인다
const plainLabel = (l) => shortNameOf(String(l || "").replace(/^(아이템|역할) · /, "").replace(/ · [\d,]+일$/, ""));
const gotNames = (labels, rewards) => {
  const pool = [...labels];
  const names = rewards
    .filter((r) => {
      const k = pool.indexOf(r?.label);
      if (k < 0) return false;
      pool.splice(k, 1);
      return true;
    })
    .map(nameOf);
  return [...names, ...pool.map(plainLabel)].filter((s) => s && s !== "-");
};
// 받은 것 알림 — 길면 앞 둘 + 외 N개(이벤트 패스와 같은 꼴)
const gotText = (names) => {
  if (!names.length) return "보상 수령";
  return names.length <= 3 ? `${names.join(" · ")} 수령` : `${names.slice(0, 2).join(" · ")} 외 ${names.length - 2}개 수령`;
};

// 📌 코드 복사 — 클립보드 API, 막혀 있으면(옛 브라우저 · http) 숨은 글 상자로 한 번 더(괴담회 창과 같다)
const copyText = async (t) => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
};

// ── 효과음 — 이벤트 패스 · 괴담회 창과 같은 playTone 어휘. 넣기 · 받기는 오름 넷, 거절은 낮게 하나, 복사 · 누르기는 짧은 틱 ──
const sfxGet = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.05), i * 110));
const sfxNo = () => playTone(330, 0.12, "sine", 0.03);
const sfxTick = () => playTone(660, 0.05, "sine", 0.025);

// ── 창 CSS — 밝은 단색 판(그라데이션 · 빛 금지). 알약 · 꼬리표는 줄 높이 = 안쪽 높이 · 아이콘 짝수 px(글자 쏠림 방지) ──
//    📌 PC 높이 맞춤은 @container iv(본문 .iv-body 의 실제 크기) — 화면 높이가 아니라 이벤트 창 칸 높이(탭 줄이 위에 붙으면 그만큼 낮다)를 본다
const IV_CSS = `
@keyframes ivIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.iv-win { position: relative; display: flex; flex-direction: column; width: 100%; height: 86vh; height: 86dvh; overflow: hidden; background: #fff; color: #131313; border-radius: 16px 16px 0 0; animation: ivIn .32s cubic-bezier(0.16,1,0.3,1); }
@media (min-width: 640px) { .iv-win { max-width: 1100px; height: min(800px, 92vh); border-radius: 16px; } }
/* 📌 이벤트 창 안(embedded) — 크기는 이벤트 창 칸이 정하고 창은 그 칸을 꽉 채운다. 열림 움직임도 이벤트 창이 한 번만.
       폰에서 탭 줄(먹 판 · 위 모서리만 둥금)이 위에 붙으면 이 판은 그 아래에 이어 붙는다(모서리 없음) */
.iv-win.emb { max-width: none; height: 100%; animation: none; }
@media (max-width: 639.98px) { .evh.tabs .iv-win.emb { border-radius: 0; } }
.iv-win *, .iv-win *::before, .iv-win *::after, .iv-pv *, .iv-pv *::before, .iv-pv *::after { box-sizing: border-box; }
/* 머리 — 제목 · (비공개) · 초대한 친구 N명 · 닫기 */
.iv-hd { flex: none; display: flex; align-items: center; gap: 12px; padding: 28px 32px 22px; border-bottom: 1px solid #ededed; }
.iv-hd h2 { margin: 0; font-size: 30px; font-weight: 900; line-height: 36px; letter-spacing: -.01em; white-space: nowrap; }
.iv-off { flex: none; height: 24px; padding: 0 10px; border-radius: 999px; background: #f2f2f2; color: #5a5a5a; font-size: 12px; font-weight: 700; line-height: 24px; white-space: nowrap; }
.iv-sp { flex: 1 1 auto; }
.iv-cnt { flex: none; height: 36px; font-size: 13px; font-weight: 700; line-height: 36px; color: #5a5a5a; white-space: nowrap; font-variant-numeric: tabular-nums; }
.iv-cnt i { font-style: normal; }
.iv-cnt b { font-size: 26px; font-weight: 900; color: #131313; margin: 0 2px 0 6px; }
.iv-x { flex: none; width: 36px; height: 36px; margin-left: 4px; padding: 0; border: 0; border-radius: 999px; background: #f2f2f2; color: #5a5a5a; display: flex; align-items: center; justify-content: center; cursor: pointer; outline: none; transition: background-color .15s, color .15s; }
.iv-x:hover { background: #e0e0e0; color: #131313; }
.iv-x:focus-visible { box-shadow: 0 0 0 2px rgba(233,30,63,0.4); }
/* 본문 — PC 두 칸(왼쪽 고정 폭 · 오른쪽 나머지). 칸 안은 흘러넘치지 않게 자르고 친구 목록만 스크롤 */
.iv-body { position: relative; flex: 1 1 0%; min-height: 0; display: flex; container: iv / size; }
.iv-col { display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 24px 32px; overflow: hidden; }
.iv-l { flex: 0 0 400px; }
.iv-r { flex: 1 1 0%; min-width: 0; border-left: 1px solid #ededed; --iv-cg: 12px; --iv-cmin: 116px; }
.iv-lbl { flex: none; font-size: 13px; font-weight: 900; line-height: 18px; color: #131313; }
.iv-code { flex: none; height: 96px; display: flex; align-items: center; justify-content: center; background: #f2f2f2; font-size: 44px; font-weight: 900; line-height: 1; letter-spacing: .22em; padding-left: .22em; white-space: nowrap; user-select: all; font-variant-numeric: tabular-nums; }
.iv-code.none { color: #a3a3a3; user-select: none; }
.iv-code.guest { letter-spacing: 0; padding-left: 0; user-select: none; }
/* 단추 — 각진 단색(빨강 · 먹). 글자 줄 높이 = 단추 높이 */
.iv-btn { position: relative; flex: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; margin: 0; padding: 0; border: 0; border-radius: 0; color: #fff; font-family: inherit; font-weight: 900; white-space: nowrap; cursor: pointer; outline: none; transition: background-color .15s; }
.iv-btn.red { background: #e91e3f; }
.iv-btn.red:hover:not(:disabled) { background: #d01634; }
.iv-btn.ink { background: #131313; }
.iv-btn.ink:hover:not(:disabled) { background: #3a3a3a; }
.iv-btn:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #e91e3f; }
.iv-btn:disabled { cursor: default; }
.iv-btn svg { flex: none; }
.iv-btn.lg { width: 100%; height: 52px; font-size: 15px; line-height: 52px; }
.iv-btn.md { height: 48px; padding: 0 22px; font-size: 14px; line-height: 48px; }
.iv-btn.sm { width: 100%; height: 34px; font-size: 13px; line-height: 34px; }
.iv-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
/* 📌 할로윈 보너스 띠 — 괴담회 보라 단색. 첫 줄(추첨권 · 「할로윈 보너스」 · ~ 끝 날) / 둘째 줄(장 수) */
.iv-bonus { flex: none; display: flex; flex-wrap: wrap; align-items: center; column-gap: 10px; row-gap: 0; min-height: 46px; padding: 8px 14px 8px 10px; background: #241b38; color: #efeaff; }
.iv-bonus .bi { flex: none; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; }
.iv-bonus b { font-size: 12.5px; font-weight: 900; line-height: 18px; color: #ffb347; white-space: nowrap; }
.iv-bonus em { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 700; line-height: 18px; color: #b3a8d9; white-space: nowrap; font-variant-numeric: tabular-nums; }
.iv-bonus .bt { flex: 1 0 100%; padding-left: 42px; margin-top: -4px; font-size: 12.5px; font-weight: 700; line-height: 18px; word-break: keep-all; }
.iv-sep { flex: none; height: 1px; margin: 6px 0; background: #ededed; }
.iv-irow { flex: none; display: flex; gap: 8px; margin: 0; }
.iv-in { flex: 1 1 auto; min-width: 0; height: 48px; margin: 0; padding: 0 16px; border: 1px solid #a3a3a3; border-radius: 0; background: #fff; color: #131313; font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: .08em; outline: none; }
.iv-in::placeholder { color: #a3a3a3; letter-spacing: .08em; opacity: 1; }
.iv-in:focus { border-color: #131313; }
.iv-in:disabled { background: #f2f2f2; }
/* 초대 보상 — 알약 줄 + 카드 줄을 한 판(.iv-tin)에. 카드가 최소 폭보다 좁아지면 판째 옆으로 넘긴다(알약 · 카드 열이 같이 움직인다) */
.iv-rw { flex: none; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.iv-track { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: #d6d6d6 transparent; }
.iv-tin { position: relative; width: 100%; }
.iv-rail { position: relative; display: grid; justify-items: center; column-gap: var(--iv-cg); margin: 2px 0 12px; }
.iv-ln0 { position: absolute; top: 13px; height: 4px; border-radius: 999px; background: #ededed; }
.iv-ln0 > i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; background: #e91e3f; }
.iv-stp { position: relative; height: 30px; padding: 0 12px; border-radius: 999px; background: #fff; box-shadow: inset 0 0 0 2px #d6d6d6; color: #8a8a8a; font-size: 12.5px; font-weight: 900; line-height: 30px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.iv-stp.on { background: #e91e3f; box-shadow: none; color: #fff; }
.iv-cards { display: grid; column-gap: var(--iv-cg); align-items: stretch; }
.iv-card { position: relative; min-width: 0; display: flex; flex-direction: column; background: #f7f7f7; box-shadow: inset 0 0 0 1px #ededed; }
.iv-card.ready { background: #fff; box-shadow: inset 0 0 0 2px #e91e3f; }
.iv-slots { display: flex; gap: 6px; padding: 10px 10px 0; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
.iv-slots.q { display: grid; grid-template-columns: 1fr 1fr; }
.iv-slot { position: relative; flex: 1 1 0%; min-width: 0; height: 108px; display: flex; align-items: center; justify-content: center; background: #fff; box-shadow: inset 0 -4px 0 var(--rc), inset 0 0 0 1px #ededed; }
.iv-slots.q .iv-slot { height: 51px; }
.iv-slots:focus-visible .iv-slot, .iv-slots[aria-expanded="true"] .iv-slot { box-shadow: inset 0 -4px 0 var(--rc), inset 0 0 0 2px #131313; }
.iv-card.ready .iv-slot { background: #fff7f8; }
.iv-ico { display: flex; line-height: 0; color: #131313; }
.iv-card.done .iv-ico, .iv-slot.got .iv-ico { opacity: .45; }
/* 받은 보상 체크 — 칸 · 말풍선 그림 오른쪽 아래(등급 띠 위). 기간 꼬리표(왼쪽 위)와 겹치지 않는 구석 */
.iv-ck { position: absolute; z-index: 1; right: 6px; bottom: 10px; display: flex; line-height: 0; pointer-events: none; }
.iv-slots.q .iv-ck { right: 4px; bottom: 8px; }
.iv-tic .iv-ck { right: 3px; bottom: 6px; }
/* 기간 꼬리표 — 칸 왼쪽 위 먹 알약(시계 12 + 「7일」). 무기한은 없음. 2 × 2 칸은 한 단계 작게 */
.iv-dur { position: absolute; z-index: 1; left: 6px; top: 6px; display: inline-flex; align-items: center; gap: 3px; height: 20px; padding: 0 6px; border-radius: 999px; background: #131313; color: #fff; font-size: 10.5px; font-weight: 900; line-height: 20px; white-space: nowrap; pointer-events: none; font-variant-numeric: tabular-nums; }
.iv-dur svg { flex: none; }
.iv-slots.q .iv-dur { left: 4px; top: 4px; height: 16px; padding: 0 4px; gap: 2px; font-size: 9.5px; line-height: 16px; }
.iv-dur.in { position: static; }
.iv-info { flex: 1 1 auto; min-width: 0; min-height: 84px; padding: 10px 12px 0; display: flex; flex-direction: column; gap: 4px; }
.iv-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.iv-chip { height: 20px; padding: 0 7px; border-radius: 999px; color: #fff; font-size: 10.5px; font-weight: 900; line-height: 20px; white-space: nowrap; }
.iv-nm { font-size: 14px; font-weight: 900; line-height: 18px; overflow-wrap: anywhere; }
.iv-ef { font-size: 12px; font-weight: 700; line-height: 16px; color: #5a5a5a; }
.iv-pvl { align-self: flex-start; margin: 0; padding: 0; border: 0; background: none; color: #131313; font-family: inherit; font-size: 12px; font-weight: 900; line-height: 16px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; outline: none; }
.iv-pvl:focus-visible { box-shadow: 0 0 0 2px #e91e3f; }
.iv-ln { font-size: 12px; font-weight: 700; line-height: 16px; color: #5a5a5a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-foot { padding: 10px 12px 12px; }
.iv-ft { display: flex; align-items: center; justify-content: center; gap: 5px; height: 34px; background: #ededed; color: #131313; font-size: 12.5px; font-weight: 900; line-height: 34px; }
.iv-ft.lock { color: #8a8a8a; }
/* 📌 마지막 단계 — 먹 카드(시안 「최종 보상 강조」) */
.iv-card.fin { background: #131313; box-shadow: none; color: #fff; }
.iv-card.fin.ready { box-shadow: inset 0 0 0 2px #e91e3f; }
.iv-card.fin .iv-slot { background: #232327; box-shadow: inset 0 -4px 0 var(--rc), inset 0 0 0 1px #2c2c31; }
.iv-card.fin .iv-slots:focus-visible .iv-slot, .iv-card.fin .iv-slots[aria-expanded="true"] .iv-slot { box-shadow: inset 0 -4px 0 var(--rc), inset 0 0 0 2px #fff; }
.iv-card.fin .iv-ico { color: #fff; }
.iv-card.fin .iv-dur { background: #fff; color: #131313; }
.iv-card.fin .iv-ef, .iv-card.fin .iv-ln { color: #a3a3ad; }
.iv-card.fin .iv-pvl { color: #fff; }
.iv-card.fin .iv-ft { background: #232327; color: #fff; }
.iv-card.fin .iv-ft.lock { color: #a3a3ad; }
/* 초대한 친구 — 이름 첫 글자 동그라미 · 이름 · 날짜. PC 는 남은 높이 안에서만 스크롤 */
.iv-fl { flex: 1 1 0%; min-height: 0; display: flex; flex-direction: column; }
.iv-fl > .iv-lbl { margin-bottom: 2px; }
.iv-ul { flex: 1 1 auto; min-height: 0; margin: 0; padding: 0; list-style: none; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #d6d6d6 transparent; }
.iv-ul li { display: flex; align-items: center; gap: 10px; height: 44px; border-top: 1px solid #ededed; }
.iv-ul li:first-child { border-top: 0; }
.iv-av { flex: none; width: 30px; height: 30px; border-radius: 999px; color: #131313; font-size: 12px; font-weight: 900; line-height: 30px; text-align: center; }
.iv-ul b { min-width: 0; font-size: 14px; font-weight: 700; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-ul em { flex: none; margin-left: auto; font-style: normal; font-size: 12px; font-weight: 700; line-height: 16px; color: #8a8a8a; font-variant-numeric: tabular-nums; }
.iv-none { padding: 12px 0; font-size: 13px; font-weight: 700; line-height: 18px; color: #8a8a8a; }
.iv-msg { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; font-size: 13px; font-weight: 700; color: #5a5a5a; }
/* 📌 칸 폭 맞춤 — 1100(시안) · ~960 · ~760 */
@container iv (max-width: 959.98px) {
  .iv-l { flex-basis: 320px; }
  .iv-col { padding: 22px 24px; }
  .iv-r { --iv-cg: 8px; }
  .iv-code { font-size: 36px; }
}
@container iv (max-width: 759.98px) {
  .iv-l { flex-basis: 280px; }
  .iv-col { padding: 20px; }
  .iv-code { font-size: 32px; }
}
/* 📌 칸 높이 맞춤 — 본문이 600 보다 낮으면(칸 ~690 미만 · 노트북 · 탭 줄이 위에 붙은 창) 칸 · 코드 판 · 여백을 줄인다. 450 미만은 코드 판 · 단추를 더 줄이고,
       그래도 모자랄 때만 그 칸째 안에서 스크롤(마지막 수단) */
@container iv (max-height: 599.98px) {
  .iv-col { gap: 10px; padding-top: 18px; padding-bottom: 18px; }
  .iv-rw { gap: 10px; }
  .iv-code { height: 72px; }
  .iv-btn.lg { height: 46px; line-height: 46px; }
  .iv-rail { margin-bottom: 8px; }
  .iv-slot { height: 84px; }
  .iv-slots.q .iv-slot { height: 39px; }
  .iv-info { min-height: 64px; padding-top: 8px; }
  .iv-foot { padding: 8px 12px 10px; }
  .iv-sep { margin: 4px 0; }
}
@container iv (max-height: 449.98px) {
  .iv-code { height: 60px; font-size: 32px; }
  .iv-btn.lg { height: 42px; line-height: 42px; }
  /* 📌 친구 목록은 여기서도 남은 높이를 받아 목록만 안에서 스크롤(칸째 스크롤 아님) — 보상 줄이 들어가는 한 오른쪽 칸은 세로로 넘기지 않는다.
         칸째 스크롤은 보상 줄과 목록 칸 최소(44 — 머리 + 첫 줄 한 토막)마저 안 들어갈 때만. 목록 칸은 잘라 둔다(「없음」 여백이 칸 스크롤을 만들지 않게) */
  .iv-col { overflow-y: auto; scrollbar-width: none; }
  .iv-fl { min-height: 44px; overflow: hidden; }
  .iv-fl .iv-none { padding: 6px 0 0; }
}
/* 폰 — 한 줄 시트(본문 통째로 세로 스크롤 · 머리는 그대로) */
@media (max-width: 639.98px) {
  .iv-hd { gap: 10px; padding: 22px 18px 16px; }
  .iv-hd h2 { font-size: 24px; line-height: 30px; }
  .iv-cnt { height: 30px; line-height: 30px; }
  .iv-cnt i { display: none; }
  .iv-cnt b { font-size: 22px; }
  .iv-x { width: 32px; height: 32px; }
  .iv-in { font-size: 16px; }
}
.iv-body.m { display: block; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; container-type: normal; scrollbar-width: none; }
.iv-body.m::-webkit-scrollbar, .iv-tip::-webkit-scrollbar { display: none; }
.iv-sec { display: flex; flex-direction: column; gap: 14px; padding: 18px; }
.iv-sec + .iv-sec { border-top: 1px solid #ededed; }
.iv-sec .iv-ul { overflow: visible; }
.iv-sec .iv-none { padding: 0 0 4px; }
.iv-body.m .iv-code { height: 80px; font-size: 36px; }
.iv-mcards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 10px; }
.iv-cw { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; min-width: 0; }
.iv-cw .iv-card { align-self: stretch; flex: 1 1 auto; }
.iv-cw .iv-stp { height: 26px; padding: 0 10px; font-size: 12px; line-height: 26px; }
.iv-body.m .iv-slot { height: 96px; }
.iv-body.m .iv-slots.q .iv-slot { height: 45px; }
/* 📌 보상 말풍선 — 창(.iv-win) 안 그 자리. PC 는 칸 옆(오른쪽 · 모자라면 왼쪽), 폰은 칸 아래(모자라면 위) — Tip 이 재서 앉힌다 */
.iv-tip { position: absolute; z-index: 50; left: 0; top: 0; width: 288px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow-y: auto; scrollbar-width: none; padding: 2px 16px; background: #fff; border-radius: 16px; box-shadow: 0 0 0 1px #d6d6d6, 0 28px 56px -28px rgba(0,0,0,0.25); color: #131313; }
.iv-tr { display: flex; align-items: flex-start; gap: 12px; padding: 14px 0; }
.iv-tr + .iv-tr { border-top: 1px solid #ededed; }
.iv-tic { position: relative; flex: none; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: #fff; box-shadow: inset 0 -3px 0 var(--rc), inset 0 0 0 1px #ededed; color: #131313; }
.iv-tic.got .iv-ico { opacity: .45; }
.iv-tx { flex: 1 1 0%; min-width: 0; }
.iv-tk { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 4px; }
.iv-tn { font-size: 14px; font-weight: 900; line-height: 18px; overflow-wrap: anywhere; }
.iv-tx .iv-tl { margin-top: 4px; font-size: 12px; font-weight: 700; line-height: 16px; color: #5a5a5a; }
.iv-tx .iv-td { margin-top: 4px; font-size: 12px; font-weight: 700; line-height: 16px; color: #5a5a5a; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.iv-sb { margin-top: 8px; height: 28px; padding: 0 12px; border: 1px solid #a3a3a3; border-radius: 0; background: #fff; color: #131313; font-family: inherit; font-size: 12px; font-weight: 900; line-height: 26px; white-space: nowrap; cursor: pointer; outline: none; transition: border-color .15s; }
.iv-sb:hover { border-color: #131313; }
.iv-sb:focus-visible { box-shadow: 0 0 0 2px #e91e3f; }
/* 📌 꾸미기 미리보기 판 — 창 위에 겹친다(z 130). PC 그 자리 판(한 칸 420 · 두 칸 740) · 폰 아래 시트. 상점 적용 미리보기(AppliedPreview)와 같은 칸 · 색 */
.iv-pv { position: relative; display: flex; flex-direction: column; width: 100%; max-height: 90vh; max-height: 90dvh; overflow: hidden; background: #fff; color: #131313; border-radius: 16px 16px 0 0; box-shadow: 0 28px 56px -28px rgba(0,0,0,0.25); animation: ivIn .28s cubic-bezier(0.16,1,0.3,1); }
.iv-pvh { flex: none; display: flex; align-items: center; gap: 12px; padding: 18px 18px 14px; }
.iv-pvh .iv-x { margin-left: auto; }
.iv-pvh .iv-tn { font-size: 17px; line-height: 22px; }
.iv-pvb { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; padding: 0 18px 20px; }
.iv-pvlb { margin: 0 0 8px; font-size: 12px; font-weight: 700; line-height: 16px; color: #5a5a5a; }
.iv-pvs + .iv-pvs { margin-top: 16px; }
.iv-fs { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: 8px; margin: 0 0 16px; }
.iv-fr { position: relative; min-width: 0; height: 92px; padding: 0 0 8px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; border: 0; border-radius: 12px; background: #f2f2f2; color: #5a5a5a; font-family: inherit; overflow: hidden; cursor: pointer; outline: none; transition: background-color .15s, color .15s; }
.iv-fr:hover { color: #131313; }
.iv-fr.on { background: #131313; color: #fff; }
.iv-fr:focus-visible { box-shadow: 0 0 0 2px #e91e3f; }
.iv-fa { position: relative; flex: none; display: flex; width: ${FRAME_TILE}px; height: ${FRAME_TILE}px; margin: auto 0; }
.iv-fr b { max-width: 100%; padding: 0 4px; font-size: 11px; font-weight: 700; line-height: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.iv-pvc { position: relative; width: 100%; aspect-ratio: 4 / 5; overflow: hidden; border-radius: 16px; background: #f2f2f2; }
.iv-pvd { padding: 12px; border-radius: 16px; background: #313338; }
.iv-pvd img { display: block; width: 100%; aspect-ratio: 1200 / 630; border-radius: 8px; background: #1b1b1b; user-select: none; }
.iv-pvbg { position: relative; width: 100%; height: 240px; overflow: hidden; border-radius: 16px; background: #f2f2f2; }
.iv-pvg > .s { margin-top: 16px; }
@media (min-width: 640px) {
  .iv-pv { max-width: 420px; max-height: 92vh; border-radius: 16px; }
  .iv-pv.two { max-width: 740px; }
  .iv-pvh { padding: 22px 24px 16px; }
  .iv-pvb { padding: 0 24px 24px; }
  .iv-pv.two .iv-pvg { display: flex; align-items: flex-start; }
  .iv-pv.two .iv-pvg > .c { flex: none; width: 300px; }
  .iv-pv.two .iv-pvg > .s { flex: 1 1 0%; min-width: 0; margin: 0 0 0 16px; }
  .iv-pv.two .iv-pvc { aspect-ratio: auto; height: 440px; }
}
@media (prefers-reduced-motion: reduce) { .iv-win, .iv-pv { animation: none !important; } }
`;

// ── 작은 그림 — 아이콘은 짝수 px(알약 · 단추 안 글자와 반 픽셀 어긋나지 않게) ──
const CopyIcon = () => (
  <svg aria-hidden viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="6.5" y="6.5" width="10" height="10" rx="2" />
    <path d="M13.5 4.5v-.5a1.5 1.5 0 00-1.5-1.5H5A1.5 1.5 0 003.5 4v7A1.5 1.5 0 005 12.5h.5" />
  </svg>
);
// 받음 — 먹 동그라미 + 흰 체크(먹 카드는 반대로). size 는 짝수만(18 · 칸 · 말풍선 구석은 14)
const CheckMark = ({ inv = false, size = 18 }) => (
  <svg aria-hidden viewBox="0 0 20 20" width={size} height={size}>
    <circle cx="10" cy="10" r="10" fill={inv ? "#fff" : "#131313"} />
    <path d="M5.5 10.3l3 3 6-6.3" fill="none" stroke={inv ? "#131313" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const LockMark = () => (
  <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none">
    <rect x="3" y="7" width="10" height="8" rx="1.5" fill="currentColor" />
    <path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);
const ClockMark = ({ size = 12 }) => (
  <svg aria-hidden viewBox="0 0 12 12" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6">
    <circle cx="6" cy="6" r="5" />
    <path d="M6 3.3V6l1.8 1.2" strokeLinecap="round" />
  </svg>
);
const CloseMark = () => (
  <svg aria-hidden viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d={ICON_PATHS.close} strokeLinecap="round" />
  </svg>
);

// 빙옥 구슬 도트(rows · pal) — 같은 색 가로 줄을 rect 하나로(crispEdges). 이벤트 패스 칸과 같은 그리기 · 크기는 16의 정수 배만 부른다
const Sprite = ({ rows, pal, size }) => {
  const W = rows[0].length, H = rows.length;
  const rects = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < W;) {
      const ch = row[x];
      if (!pal[ch]) { x++; continue; }
      let e = x;
      while (e + 1 < W && row[e + 1] === ch) e++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={e - x + 1} height="1" fill={pal[ch]} />);
      x = e + 1;
    }
  });
  return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={size} height={size} shapeRendering="crispEdges" className="shrink-0">{rects}</svg>;
};

// 보상 그림 — 이벤트 패스 칸과 같은 그림: XP 번개 도트 · 빙옥 구슬 도트 · 아이템은 등록 아이콘 · 역할은 방패
const RewardIcon = ({ r, size }) => {
  if (!r) return null;
  if (r.kind === "xp") return <ItemIcon icon="art:xp-bolt" size={size} />;
  if (r.kind === "point") return <Sprite rows={CURRENCY_PIXEL.point.rows} pal={CURRENCY_PIXEL.point.pal} size={size} />;
  if (r.kind === "item") return <ItemIcon icon={r.icon} imageUrl={r.imageUrl} type={r.itemType} size={size} color={r.color || (r.itemType ? itemTypeColor(r.itemType) : undefined)} />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={Math.round(size * 0.75)} height={Math.round(size * 0.75)} className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={ICON_PATHS.shieldCheck} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};
// 기간 꼬리표 — 시계 + "7일"(이름 꼬리 아님). cls "in" 은 말풍선 · 미리보기 머리 글줄 안(칩 옆)
const DurTag = ({ days, cls = "" }) => (
  <span className={`iv-dur ${cls}`}>
    <ClockMark />
    {fmt(days)}일
  </span>
);
// 분류 칩 — 상점 칩과 같은 글자(categoryLabel) · 유형 색 단색 알약
const Chip = ({ r }) => <span className="iv-chip" style={{ background: kindColorOf(r) }}>{kindOf(r)}</span>;

// 📌 보상 카드 한 장 — 칸(보상마다 · 등급 띠 · 기간 꼬리표) → 칩 · 이름 · 효과 한 줄(또는 「미리보기」) → 받음 · 받기 · 자물쇠.
//    둘까지는 칸을 나란히, 셋 · 넷은 2 × 2. 칸 묶음을 누르면 말풍선(handlers)
const RewardCard = ({ t, fin, busy, onClaim, onPreview, tipOpen, handlers }) => {
  const rs = Array.isArray(t.rewards) ? t.rewards : [];
  const n = rs.length;
  const one = n <= 1;
  const r = rs[0] || null;
  const st = t.state === "done" ? "done" : t.state === "ready" ? "ready" : "lock";
  const icon = n <= 1 ? 64 : n === 2 ? 48 : 32;
  const lines = linesOf(r);
  const names = rs.map(nameOf).filter(Boolean).join(", ");
  const k = `tier:${t.tid}`;
  let foot;
  if (st === "done") foot = <span className="iv-ft done"><CheckMark inv={fin} />받음</span>;
  else if (st === "ready") {
    foot = (
      <button type="button" className="iv-btn red sm" onClick={() => onClaim(t)} disabled={!!busy} aria-label={`${fmt(t.need)}명 보상 받기`}>
        <span style={busy === k ? { visibility: "hidden" } : undefined}>받기</span>
        {busy === k && <span className="iv-busy">…</span>}
      </button>
    );
  } else foot = <span className="iv-ft lock" role="img" aria-label="잠김"><LockMark /></span>;
  return (
    <div className={`iv-card ${st}${fin ? " fin" : ""}`}>
      <div
        className={`iv-slots${n > 2 ? " q" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${fmt(t.need)}명 보상 · ${names || "보상 없음"}${st === "done" ? " · 받음" : rs.some((x) => x?.claimed) ? " · 일부 받음" : ""}`}
        aria-expanded={tipOpen}
        {...handlers}
      >
        {(n ? rs : [null]).map((x, j) => {
          const d = daysOf(x);
          // 📌 부분 수령 — 단계는 아직 받을 것인데 이 보상은 이미 받았다(서버 claimed). 그 칸만 흐리게 + 체크(이벤트 패스 got 과 같은 규칙)
          const got = !!x && st !== "done" && !!x.claimed;
          return (
            <span key={j} className={`iv-slot${got ? " got" : ""}`} style={{ "--rc": x ? rarityOf(x.rarity).c : "#ededed" }}>
              {d > 0 && <DurTag days={d} />}
              {x && <span className="iv-ico"><RewardIcon r={x} size={icon} /></span>}
              {got && <span className="iv-ck"><CheckMark inv={fin} size={n > 2 ? 14 : 18} /></span>}
            </span>
          );
        })}
      </div>
      <div className="iv-info">
        {one ? (
          <>
            {kindOf(r) && <div className="iv-chips"><Chip r={r} /></div>}
            <p className="iv-nm">{nameOf(r) || "—"}</p>
            {lines[0] ? <p className="iv-ef">{lines[0]}</p> : cosOf(r) ? <button type="button" className="iv-pvl" onClick={() => onPreview(r)}>미리보기</button> : null}
          </>
        ) : (
          <>
            <p className="iv-nm">보상 {n}개</p>
            {rs.map((x, j) => <p key={j} className="iv-ln">{nameOf(x)}</p>)}
          </>
        )}
      </div>
      <div className="iv-foot">{foot}</div>
    </div>
  );
};

// 📌 단계 알약 줄(PC) — 닿은 단계는 빨간 알약, 줄은 지금 초대 수까지 채운다(단계 사이는 비율 — 시안 rail 셈)
const Rail = ({ tiers, count }) => {
  const N = tiers.length;
  const at = tiers.filter((t) => count >= Number(t.need)).length - 1;
  let w = 0;
  if (N > 1 && at >= 0) {
    if (at >= N - 1) w = 100;
    else {
      const lo = Number(tiers[at].need) || 0, hi = Number(tiers[at + 1].need) || 0;
      const frac = hi > lo ? Math.max(0, Math.min(1, (count - lo) / (hi - lo))) : 0;
      w = ((at + frac) / (N - 1)) * 100;
    }
  }
  const edge = `calc((100% - ${N - 1} * var(--iv-cg)) / ${N} / 2)`;
  return (
    <div className="iv-rail" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }} aria-hidden>
      {N > 1 && <span className="iv-ln0" style={{ left: edge, right: edge }}><i style={{ width: `${w}%` }}></i></span>}
      {tiers.map((t) => <span key={t.tid} className={`iv-stp${count >= Number(t.need) ? " on" : ""}`}>{fmt(t.need)}명</span>)}
    </div>
  );
};

// 📌 보상 말풍선 — 단계의 보상 전부(칸 · 분류 칩 · 기간 꼬리표 · 이름 · 효과 문장 · 꾸미기는 「미리보기」).
//    자리: rect(창 .iv-win 기준 칸 묶음 자리)에서 PC 는 오른쪽(모자라면 왼쪽, 둘 다 모자라면 아래 · 위) · 폰은 아래(모자라면 위), 창 안 12px 안쪽으로 당긴다.
//    그리기 전에 재서 자리를 잡는다(useLayoutEffect — 엉뚱한 자리에 한 번도 보이지 않게)
const Tip = ({ tip, tier, narrow, onPreview }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const win = el?.offsetParent;
    if (!el || !win) return;
    const W = win.clientWidth, H = win.clientHeight, w = el.offsetWidth, h = el.offsetHeight, a = tip.rect, M = 12, G = 8;
    let x, y;
    if (!narrow) {
      x = a.r + G;
      y = a.t;
      if (x + w > W - M) x = a.l - G - w;
      if (x < M) {
        x = (a.l + a.r - w) / 2;
        y = a.b + G;
        if (y + h > H - M) y = a.t - G - h;
      }
    } else {
      x = a.l;
      y = a.b + G;
      if (y + h > H - M) y = a.t - G - h;
    }
    x = Math.max(M, Math.min(W - w - M, x));
    y = Math.max(M, Math.min(H - h - M, y));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.visibility = "visible";
  }, [tip, tier, narrow]);
  const done = tier.state === "done";
  return (
    <div ref={ref} className="iv-tip" role="dialog" aria-label={`${fmt(tier.need)}명 보상`} style={{ visibility: "hidden" }}>
      {tier.rewards.map((r, j) => {
        const d = daysOf(r);
        const k = kindOf(r);
        const lines = linesOf(r);
        // 받은 보상 — 단계를 받았거나(done) 부분 수령으로 이 보상만 받았다(claimed). 흐리게 + 체크
        const got = done || !!r.claimed;
        return (
          <div key={j} className="iv-tr">
            <span className={`iv-tic${got ? " got" : ""}`} style={{ "--rc": rarityOf(r.rarity).c }}>
              <span className="iv-ico"><RewardIcon r={r} size={32} /></span>
              {got && <span className="iv-ck"><CheckMark size={14} /></span>}
            </span>
            <div className="iv-tx">
              {(k || d > 0) && (
                <div className="iv-tk">
                  {k && <Chip r={r} />}
                  {d > 0 && <DurTag days={d} cls="in" />}
                </div>
              )}
              <p className="iv-tn">{nameOf(r)}</p>
              {lines.map((l, i) => <p key={i} className="iv-tl">{l}</p>)}
              {!lines.length && r.desc && <p className="iv-td">{r.desc}</p>}
              {cosOf(r) && <button type="button" className="iv-sb" onClick={() => onPreview(r)}>미리보기</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// 📌 꾸미기 미리보기 — 상점 상품 상세 '적용 미리보기'(app/arctic/AppliedPreview) · 이벤트 패스 미리보기(EventPassModal EpPreview)와 같은 부품(app/arctic/CosmeticPreview)을
//    밝은 판에 담아 창 위에 겹친다(화면 이동 없음). 칸: 프로필 카드(카드 배경 · 카드 테두리 · 프로필 테두리) | 디스코드 /레벨(봇이 그릴 수 있을 때만 · 그림 실패면 뺀다) · 프로필 배지.
//    사람: 로그인했으면 내 이름 · 사진 · 레벨(/api/xp/me), 아니면 예시. 닫기 단추 · 바깥 누르기 · Esc(Esc 는 창이 받아 이 판만 닫는다).
//    📌 이벤트 창 바깥 어둠을 누르면 이벤트 창이 닫히므로 이 판은 제 fixed inset-0 z-[130] 판 + stopPropagation
function IvPreview({ r, onClose }) {
  const { data: session } = useSession();
  const user = session?.user || null;
  const authed = !!user;
  const [me, setMe] = useState(null);
  const [discordFail, setDiscordFail] = useState(false);
  const [fi, setFi] = useState(-1); // 고른 테두리 칸(-1 = 처음 칸 — cos.frame 자리)
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!authed) return;
    let live = true;
    fetch("/api/xp/me", { cache: "no-store" })
      .then((x) => x.json())
      .then((j) => { if (live && j?.success) setMe(j.data); })
      .catch(() => {});
    return () => { live = false; };
  }, [authed]);
  const today = useTodayXp(authed && !!me);
  const cos = cosOf(r);
  if (!cos) return null;

  // 테두리 여럿(「전체」 9종 등)이면 칸 격자로 다 보이고 고른 것을 카드 · 디스코드 카드에 낀다(상점 FrameStrip 과 같은 규칙)
  const frames = Array.isArray(cos.frames) && cos.frames.length > 1 ? cos.frames.filter((x) => typeof x === "string" && x) : [];
  const fStart = Math.max(0, frames.indexOf(typeof cos.frame === "string" ? cos.frame : ""));
  const fAt = frames.length ? Math.min(fi < 0 ? fStart : fi, frames.length - 1) : -1;
  const skin = typeof cos.skin === "string" ? cos.skin : "";
  const scene = typeof cos.scene === "string" ? cos.scene : "";
  const frame = fAt >= 0 ? frames[fAt] : typeof cos.frame === "string" ? cos.frame : "";
  const card = !!skin || !!scene || !!frame;
  const wantDiscord = (!!skin || !!scene) && !!cos.botCard;
  const showDiscord = wantDiscord && !discordFail;
  // 폭은 '받을 칸이 있는지'로 — 디스코드 그림이 실패해도 판 폭은 처음 그대로
  const side = wantDiscord || !!cos.badge;
  const two = card && side;
  // 칸 이름은 그려지는 칸이 둘 이상일 때만(한 칸이면 머리 분류 칩이 곧 그 이름)
  const label = (t) => (card && (showDiscord || !!cos.badge) ? <p className="iv-pvlb">{t}</p> : null);
  const who = whoOf(authed ? user : null, authed ? me : null, today);
  const discordSrc = `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${scene ? `&scene=${encodeURIComponent(scene)}` : ""}${frame ? `&frame=${encodeURIComponent(frame)}` : ""}${authed ? "&me=1" : ""}`;
  const badge = badgeOfItem({ itemId: r.itemId, name: r.name, icon: r.icon, itemImageUrl: r.imageUrl, color: r.color, type: r.itemType || "cosmetic" });
  const d = daysOf(r);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.45)" }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={`${nameOf(r)} 미리보기`} onClick={(e) => e.stopPropagation()} className={`iv-pv${two ? " two" : ""}`}>
        {/* 머리 — 보상 칸 · (분류 칩 · 기간 꼬리표 / 이름) | 닫기. 말풍선 한 줄과 같은 표기 */}
        <div className="iv-pvh">
          <span className="iv-tic" style={{ "--rc": rarityOf(r.rarity).c }}><span className="iv-ico"><RewardIcon r={r} size={32} /></span></span>
          <div className="iv-tx">
            <div className="iv-tk"><Chip r={r} />{d > 0 && <DurTag days={d} cls="in" />}</div>
            <p className="iv-tn">{nameOf(r)}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="iv-x"><CloseMark /></button>
        </div>
        <div className="iv-pvb">
          {frames.length > 0 && (
            <div className="iv-fs" role="group" aria-label={`프로필 테두리 ${frames.length}종`}>
              {frames.map((k, i) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={i === fAt}
                  aria-label={FRAME_OF[k]?.l || k}
                  className={`iv-fr${i === fAt ? " on" : ""}`}
                  onClick={() => { if (i !== fAt) { setFi(i); setDiscordFail(false); sfxTick(); } }}
                >
                  <span className="iv-fa">
                    <Avatar who={who} px={FRAME_TILE} text="text-[12px]" />
                    <AvatarFrame frame={k} px={FRAME_TILE} />
                  </span>
                  <b>{FRAME_OF[k]?.l || k}</b>
                </button>
              ))}
            </div>
          )}
          <div className="iv-pvg">
            {card && (
              <div className="c">
                {label("프로필 카드")}
                <div className="iv-pvc">
                  <FitBox pad={0.92} max={1}>
                    <ProfileCardPreview who={who} skin={skin} scene={scene} frame={frame} />
                  </FitBox>
                </div>
              </div>
            )}
            {side && (showDiscord || cos.badge) && (
              <div className={card ? "s" : ""}>
                {showDiscord && (
                  <div className="iv-pvs">
                    {label("디스코드 /레벨")}
                    <div className="iv-pvd">
                      {/* 칸은 카드 비율(1200 × 630)로 먼저 잡아 둔다 — 그림이 늦게 와도 자리가 그대로 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img key={discordSrc} src={discordSrc} alt="" draggable={false} decoding="async" onError={() => setDiscordFail(true)} />
                    </div>
                  </div>
                )}
                {cos.badge && (
                  <div className="iv-pvs">
                    {label("프로필 배지")}
                    <div className="iv-pvbg">
                      <FitBox pad={0.9} max={1.2}>
                        <BadgePreview who={who} badges={[badge]} />
                      </FitBox>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 상태 읽기 — 실패면 null
const fetchState = async () => {
  try {
    const res = await fetch(API, { cache: "no-store" });
    const j = await res.json();
    return j?.ok ? j : null;
  } catch {
    return null;
  }
};
// POST — 응답 JSON(+ HTTP 상태). 네트워크 실패는 null
const post = async (path, body) => {
  try {
    const r = await fetch(`${API}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ ok: false }));
    return { ...j, status: r.status };
  } catch {
    return null;
  }
};

// pushToast(msg, accent) — 레벨 페이지 토스트(accent = 빨간 판 — 받기 · 복사처럼 된 일, 거절은 흰 판 — 이벤트 패스 · 괴담회 창과 같다)
// onClaimed — 받은 뒤 · 코드를 넣은 뒤 페이지 잔액 · XP 를 다시 읽는다(loadMe). onCount — 이벤트 탭 빨간 숫자(받을 단계 수).
// onTickets — 코드를 넣어 추첨권(괴담회 보너스)이 생겼을 수 있을 때 괴담회 숫자를 다시 읽는다(loadGoedamMeta)
// 📌 embedded — 이벤트 창(./EventTabs.js EventHub) 안에 넣을 때. 바깥 어둠 · 틀 크기 · 열림 움직임 · 이벤트 탭은 이벤트 창 몫이고, 이 창은 그 칸을 꽉 채운다
/** @param {{ open: boolean; onClose: () => void; pushToast?: (msg: string, accent?: boolean) => void; onClaimed?: () => void; onCount?: (n: number) => void; onTickets?: () => void; embedded?: boolean }} props */
export default function InviteModal({ open, onClose, pushToast, onClaimed, onCount, onTickets, embedded = false }) {
  const narrow = useNarrow();
  const [data, setData] = useState(null); // 마지막으로 받은 상태 — 다시 열면 바로 그리고 뒤에서 새로 읽는다
  const [status, setStatus] = useState("idle"); // idle · loading · ok · error
  const [busy, setBusy] = useState(""); // "" · "redeem" · "tier:<tid>"
  const [input, setInput] = useState("");
  const [tip, setTip] = useState(null); // 보상 말풍선 { tid, rect } — rect 는 창(.iv-win) 기준 칸 묶음 자리
  const [preview, setPreview] = useState(null); // 꾸미기 미리보기 보상
  const busyRef = useRef("");
  const closeRef = useRef(null);
  const winRef = useRef(null);
  const trackRef = useRef(null);

  // 읽은 상태 반영 — 실패면 이미 그린 상태는 그대로 둔다(뒤에서 새로 읽기만 실패)
  const apply = useCallback((j) => {
    if (j) {
      setData(j);
      setStatus("ok");
    } else setStatus((s) => (s === "ok" ? "ok" : "error"));
  }, []);
  const load = useCallback(() => fetchState().then(apply), [apply]);
  // 📌 받을 단계 수를 이벤트 탭 숫자(app/level/page.js)에 알린다 — 받기 · 다시 읽기로 상태가 바뀔 때마다(받고 닫으면 바로 줄어든다)
  useEffect(() => {
    if (data && onCount) onCount(data.guest ? 0 : Math.max(0, Math.floor(Number(data.claimable) || 0)));
  }, [data, onCount]);

  // 열 때마다 새로 읽는다
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchState().then((j) => { if (alive) apply(j); });
    return () => { alive = false; };
  }, [open, apply]);

  const closeTip = useCallback(() => setTip(null), []);
  const closeAll = useCallback(() => {
    setTip(null);
    setPreview(null);
    onClose();
  }, [onClose]);
  // 📌 이벤트 창 안에서 다른 탭으로 옮기거나 이벤트 창이 바깥에서 닫히면 closeAll 을 거치지 않고 open 만 꺼진다 — 그때도 말풍선 · 미리보기를 접는다
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (!open) { setTip(null); setPreview(null); }
  }

  // 열리면 닫기 단추에 포커스 · Esc 로 닫기 — 미리보기 → 말풍선 → 창 차례로 하나씩
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (preview) setPreview(null);
      else if (tip) closeTip();
      else closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, preview, tip, closeTip, closeAll]);
  // 말풍선 — 바깥 누르기 · 창 폭 바뀜이면 닫는다(미리보기가 떠 있는 동안은 보지 않는다)
  useEffect(() => {
    if (!tip || preview) return;
    const onDown = (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(".iv-tip")) return;
      if (el?.closest("[data-iv-tip]")?.getAttribute("data-iv-tip") === tip.tid) return; // 같은 칸 — 누르기(click)가 닫는다
      closeTip();
    };
    const w0 = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w0) closeTip(); };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [tip, preview, closeTip]);
  // 📌 PC 마우스 휠 — 단계 카드 줄이 옆으로 넘칠 때만 그 위에서 굴리면 가로로(이벤트 패스 랜턴 길과 같은 규칙)
  useEffect(() => {
    const box = trackRef.current;
    if (!open || narrow || !box) return;
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || box.scrollWidth <= box.clientWidth + 1) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? box.clientWidth : 1);
      const to = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, box.scrollLeft + dy));
      if (Math.abs(to - box.scrollLeft) < 1) return;
      e.preventDefault();
      box.scrollLeft = to;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [open, narrow, data]);
  // 열고 처음 그릴 때 한 번 — 카드 줄이 옆으로 넘치고 받을 카드가 가려 있으면 그 카드가 보이게 줄만 넘긴다(창 · 화면은 그대로)
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (!open) {
      scrolledRef.current = false;
      return;
    }
    const box = trackRef.current;
    if (narrow || !box || !data || scrolledRef.current) return;
    scrolledRef.current = true;
    const el = box.querySelector(".iv-card.ready");
    if (!el || box.scrollWidth <= box.clientWidth + 1) return;
    const b = box.getBoundingClientRect(), c = el.getBoundingClientRect();
    if (c.left < b.left || c.right > b.right) box.scrollLeft = Math.max(0, box.scrollLeft + c.left - b.left - 8);
  }, [open, narrow, data]);

  const copy = useCallback(async (code) => {
    const ok = code ? await copyText(String(code)) : false;
    if (ok) {
      sfxTick();
      pushToast?.("코드를 복사했습니다", true);
    } else {
      sfxNo();
      pushToast?.("복사하지 못했습니다.");
    }
  }, [pushToast]);

  // 📌 받은 초대 코드 넣기 — 서버가 조건(계정 나이 · 새로 들어온 사람 · 기한 · 예전에 있던 사람 · 내 코드)을 다 본다. 거절이면 서버 글 그대로 + 상태 다시 읽기
  const redeem = useCallback(async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    const code = normCode(input);
    if (code.length !== 6) {
      sfxNo();
      pushToast?.("코드 6자리를 넣어 주세요.");
      return;
    }
    busyRef.current = "redeem";
    setBusy("redeem");
    const res = await post("redeem", { code });
    if (res?.ok) {
      if (res.state) setData(res.state);
      setInput("");
      sfxGet();
      const me = Math.max(0, Math.floor(Number(res.tickets?.me) || 0));
      // 📌 받은 것 — 들어온 친구 보상(서버가 준 것만 짧은 이름 「50,000 XP」) + 추첨권
      const got = [...(Array.isArray(res.welcome) ? res.welcome.map(String).filter(Boolean) : []), ...(me > 0 ? [`추첨권 ${me}장`] : [])];
      pushToast?.(`${res.inviterName ? `${res.inviterName} 님 ` : ""}초대 코드 등록${got.length ? ` · ${got.join(" · ")}` : ""}`, true);
      onTickets?.();
      onClaimed?.();
    } else {
      sfxNo();
      pushToast?.(res ? res.error || res.message || "넣지 못했습니다." : "네트워크 오류로 넣지 못했습니다.");
      await load();
    }
    busyRef.current = "";
    setBusy("");
  }, [input, pushToast, onTickets, onClaimed, load]);

  // 단계 보상 받기 — hold(실사이트에 아직 없는 아이템 보상)면 409 { hold } — 잠시 뒤 다시
  const claim = useCallback(async (t) => {
    if (busyRef.current) return;
    const key = `tier:${t.tid}`;
    busyRef.current = key;
    setBusy(key);
    const res = await post("claim", { tid: t.tid });
    if (res?.ok) {
      if (res.state) setData(res.state);
      sfxGet();
      // 📌 알림은 이번에 준 것만(서버 labels — 단계 보상 전부가 아니다) · 이름만(기간 꼬리 · 분류 머리말 없이).
      //    일부를 못 줬으면(partial — 그 보상만 실패 · 단계는 받을 것으로 남는다) 한 줄 더
      pushToast?.(gotText(gotNames(Array.isArray(res.labels) ? res.labels : [], Array.isArray(t.rewards) ? t.rewards : [])), true);
      if (res.partial) pushToast?.("일부 보상은 잠시 뒤 다시 받아 주세요.");
      onClaimed?.();
    } else {
      sfxNo();
      pushToast?.(res?.hold ? "보상은 잠시 뒤 다시 받아 주세요." : res ? res.error || res.message || "수령하지 못했습니다." : "네트워크 오류로 수령하지 못했습니다.");
      await load();
    }
    busyRef.current = "";
    setBusy("");
  }, [pushToast, onClaimed, load]);

  if (!open) return null;

  const guest = !!data?.guest;
  const tiers = data && Array.isArray(data.tiers) ? data.tiers : [];
  const friends = data && !guest && Array.isArray(data.friends) ? data.friends : [];
  const count = Math.max(0, Math.floor(Number(data?.count) || 0));
  const code = typeof data?.code === "string" ? data.code : "";
  const bonus = data?.bonus && data.bonus.on ? data.bonus : null;
  const enterShow = !!data && !guest && !!data.enter?.show;
  const tipTier = tip ? tiers.find((x) => x.tid === tip.tid) || null : null;

  // 칸 묶음 손잡이 — 누르기(탭 · 클릭 · Enter · Space)로 말풍선 열기 / 다시 누르면 닫기. 받기는 하지 않는다
  const toggleTip = (tid, el) => {
    if (tip && tip.tid === tid) {
      closeTip();
      return;
    }
    const win = winRef.current;
    if (!win || !el) return;
    const w = win.getBoundingClientRect(), a = el.getBoundingClientRect();
    setTip({ tid, rect: { l: a.left - w.left, t: a.top - w.top, r: a.right - w.left, b: a.bottom - w.top } });
    sfxTick();
  };
  const tipHandlers = (t) => ({
    "data-iv-tip": t.tid,
    onClick: (e) => toggleTip(t.tid, e.currentTarget),
    onKeyDown: (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleTip(t.tid, e.currentTarget);
    },
  });
  const openPreview = (r) => {
    sfxTick();
    setPreview(r);
  };
  const onScrollAny = tip ? closeTip : undefined;

  // ── 조각 — PC 두 칸 · 폰 한 줄이 같은 조각을 다른 차례로 놓는다 ──
  const codeBlock = (
    <>
      <p className="iv-lbl">내 초대 코드</p>
      {guest ? (
        // 📌 로그인 전 — 코드 자리에 「로그인」(코드는 계정마다 만들어진다)
        <div className="iv-code guest">
          <button type="button" className="iv-btn ink md" onClick={() => { closeAll(); openLogin(); }}>로그인</button>
        </div>
      ) : (
        <>
          <div className={`iv-code${code ? "" : " none"}`} aria-label={code ? `내 초대 코드 ${code.split("").join(" ")}` : "내 초대 코드 없음"}>{code || "——"}</div>
          <button type="button" className="iv-btn red lg" onClick={() => copy(code)} disabled={!code}>
            <CopyIcon />코드 복사
          </button>
        </>
      )}
      {bonus && (
        // 📌 할로윈 보너스(괴담회 추첨권 — 기간 한정 덧붙임). 끝 날은 서버 endsAt(보너스 끝 · 추첨 닫힘 중 이른 쪽)의 마지막 날
        <div className="iv-bonus">
          <span className="bi"><ItemIcon icon="art:goedam-ticket" size={32} /></span>
          <b>할로윈 보너스</b>
          {bonus.endsAt && <em>~ {kstDay(bonus.endsAt, true)}</em>}
          <span className="bt">초대 1명마다 추첨권 · 나 {fmt(bonus.inviter)}장 · 친구 {fmt(bonus.invitee)}장</span>
        </div>
      )}
    </>
  );
  // 📌 받은 초대 코드 — 서버가 「넣을 수 있다」(enter.show — 조건을 다 통과했고 아직 안 넣음)고 할 때만
  const enterBlock = enterShow && (
    <>
      <p className="iv-lbl">받은 초대 코드</p>
      <form className="iv-irow" onSubmit={redeem}>
        <input
          className="iv-in"
          value={input}
          onChange={(e) => setInput(normCode(e.target.value))}
          placeholder="코드 6자리"
          aria-label="받은 초대 코드"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          disabled={busy === "redeem"}
        />
        <button type="submit" className="iv-btn ink md" disabled={!!busy}>
          <span style={busy === "redeem" ? { visibility: "hidden" } : undefined}>넣기</span>
          {busy === "redeem" && <span className="iv-busy">…</span>}
        </button>
      </form>
    </>
  );
  const card = (t, i) => (
    <RewardCard
      key={t.tid}
      t={t}
      fin={i === tiers.length - 1}
      busy={busy}
      onClaim={claim}
      onPreview={openPreview}
      tipOpen={tip?.tid === t.tid}
      handlers={tipHandlers(t)}
    />
  );
  // 📌 초대 보상 — 라벨만(초대 수 · 진행 글자 없음 — 머리에 이미 「초대한 친구 N명」). 단계가 없으면 칸째 없음
  const N = tiers.length;
  const rewardsBlock = N > 0 && (narrow ? (
    <>
      <p className="iv-lbl">초대 보상</p>
      <div className="iv-mcards">
        {tiers.map((t, i) => (
          <div key={t.tid} className="iv-cw">
            <span className={`iv-stp${count >= Number(t.need) ? " on" : ""}`}>{fmt(t.need)}명</span>
            {card(t, i)}
          </div>
        ))}
      </div>
    </>
  ) : (
    <div className="iv-rw">
      <p className="iv-lbl">초대 보상</p>
      <div ref={trackRef} className="iv-track" onScroll={onScrollAny}>
        {/* 📌 단계가 넷보다 적으면 판을 넷 칸 폭만큼만(카드가 시안 크기 그대로 · 왼쪽부터) — 하나 · 둘이 판 전체로 늘어나지 않게 */}
        <div className="iv-tin" style={{ width: N < 4 ? `calc(${N} / 4 * (100% - 3 * var(--iv-cg)) + ${N - 1} * var(--iv-cg))` : undefined, minWidth: `calc(${N} * var(--iv-cmin) + ${N - 1} * var(--iv-cg))` }}>
          <Rail tiers={tiers} count={count} />
          <div className="iv-cards" style={{ gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))` }}>{tiers.map(card)}</div>
        </div>
      </div>
    </div>
  ));
  const friendsList = friends.length ? (
    <ul className="iv-ul">
      {friends.map((f, i) => {
        const nm = String(f?.name || "").trim() || "—";
        return (
          <li key={`${nm}-${f?.at || i}`}>
            <span aria-hidden className="iv-av" style={{ background: AV[i % AV.length] }}>{Array.from(nm)[0]}</span>
            <b>{nm}</b>
            <em>{kstDay(f?.at)}</em>
          </li>
        );
      })}
    </ul>
  ) : <p className="iv-none">없음</p>;

  // 비었을 때 — 읽는 중 · 실패
  const msg = !data ? (
    status === "error" ? (
      <div className="iv-msg">
        불러오지 못했습니다
        <button type="button" className="iv-btn ink md" onClick={() => { setStatus("loading"); load(); }}>다시 시도</button>
      </div>
    ) : <div className="iv-msg">불러오는 중…</div>
  ) : null;

  const body = msg ? (
    <div className="iv-body">{msg}</div>
  ) : narrow ? (
    <div className="iv-body m" onScroll={onScrollAny}>
      <section className="iv-sec">{codeBlock}</section>
      {rewardsBlock && <section className="iv-sec">{rewardsBlock}</section>}
      {enterBlock && <section className="iv-sec">{enterBlock}</section>}
      {!guest && (
        <section className="iv-sec">
          <p className="iv-lbl" style={{ marginBottom: 2 }}>초대한 친구</p>
          {friendsList}
        </section>
      )}
    </div>
  ) : (
    <div className="iv-body">
      <div className="iv-col iv-l">
        {codeBlock}
        {enterBlock && <div className="iv-sep"></div>}
        {enterBlock}
      </div>
      <div className="iv-col iv-r">
        {rewardsBlock}
        {!guest && (
          <>
            {N > 0 && <div className="iv-sep"></div>}
            <div className="iv-fl">
              <p className="iv-lbl">초대한 친구</p>
              {friendsList}
            </div>
          </>
        )}
      </div>
    </div>
  );

  const win = (
    <div ref={winRef} role={embedded ? "group" : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="친구 초대" onClick={(e) => e.stopPropagation()} className={`iv-win${embedded ? " emb" : ""}`}>
      {/* 머리 — 「친구 초대」 · (운영진 미리보기면 「비공개」) · 초대한 친구 N명 · 닫기. 상시 이벤트라 기간 알약 없음 */}
      <div className="iv-hd">
        <h2>친구 초대</h2>
        {data?.adminPreview && <span className="iv-off">비공개</span>}
        <span className="iv-sp"></span>
        {data && !guest && <span className="iv-cnt"><i>초대한 친구</i><b>{fmt(count)}</b>명</span>}
        <button ref={closeRef} type="button" onClick={closeAll} aria-label="닫기" className="iv-x"><CloseMark /></button>
      </div>
      {body}
      {tip && tipTier && tipTier.rewards?.length > 0 && <Tip tip={tip} tier={tipTier} narrow={narrow} onPreview={openPreview} />}
    </div>
  );
  const pv = preview && <IvPreview key={`${preview.itemId || ""}`} r={preview} onClose={() => setPreview(null)} />;
  // 이벤트 창 안 — 틀(어둠 · 크기 · 탭)은 이벤트 창이 그린다
  if (embedded) return <><style>{IV_CSS}</style>{win}{pv}</>;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={closeAll}
    >
      <style>{IV_CSS}</style>
      {win}
      {pv}
    </div>
  );
}
