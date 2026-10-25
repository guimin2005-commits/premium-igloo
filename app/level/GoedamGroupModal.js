"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ItemIcon from "../components/ItemIcon";
import { openLogin } from "../components/LoginPrompt";
import { playTone } from "@/lib/sfx";
import { GROUP_GAMES, GAME_OTHER } from "@/lib/goedamGames";

// 📌 「게임 그룹 지원」(방구석 심야 괴담회) 창 — 이벤트 창(./EventTabs.js EventHub) 안 탭 하나(embedded). 약속 .claude/mockups/goedam-group/SPEC.md 5절.
//    서버는 app/api/goedam/group(GET 상태 · ?code= 초대 미리보기 · POST action — lib/goedamGroup.js). 인원 · 상태 · 참여 가능 여부 · 상품권 번호는 서버가 센다 — 화면은 받은 대로만 그린다.
//    시안 .claude/mockups/goedam-group/그룹지원-시안2-*.png(mock2.html — 치수 · 색 그대로). 운영자가 시안에서 뺀 것: 「빈 자리」 칸(2026-10-25 "빈 자리 ㅇㅈㄹ 빼라")
//      머리  괴담회 띠 배너(public/goedam/header.png — GoedamModal 과 같은 자리 · 크기)
//      PC   왼쪽(그룹 카드 — 이름 · 게임 · 언제 · 상태 칩 / 멤버 칸 4칸 줄 — 이름 첫 글자 원 · 그룹장 표 · 그룹장이 보는 남의 칸에만 ✕)
//           | 오른쪽 330(문화상품권 칸 · 참여 링크(코드 + 「링크 복사」) · 단계(모집 중 → 심사 중 → 승인 · 반려) · 아래 「지원하기」 + 글자 단추)
//           그룹 없음 = 왼쪽 「지원서」 + 「그룹 만들기」 | 오른쪽 문화상품권 칸 + 「참여 코드」 / 초대(?gg · 코드 입력) = 왼쪽 그 그룹 | 오른쪽 「이 그룹에 참여」
//      폰   위아래로 쌓기(카드 → 멤버 2칸 줄 → 링크 → 단추) — 본문만 세로 스크롤
//    📌 도트 결 — GoedamModal 과 같은 짙은 밤 보라 단색 · 짙은 테 3px + 안쪽 단 · 계단 모서리(clip-path). 그라데이션 · 흐린 빛 금지. 안내 문장 없이 라벨 · 기호만
//    📌 모든 동작에 효과음 + 토스트(pushToast) — 성공 · 실패 문구는 서버 error 그대로
//    📌 2026-10-25 추가(약속 문서 6b) — 문화상품권 칸: 도트 상품권 그림(24×16 · u=2) · 「지원 보너스 · 추첨권 ×N」(N = 서버 applyTickets, 0 이면 줄 없음) · 재고 주의 한 줄.
//       지원 성공 토스트는 이번에 실제로 넣은 장 수(POST 응답 bonus.tickets — 이미 받았거나 못 넣었으면 0 → 「지원했습니다」만)

const API = "/api/goedam/group";
const ART = "/goedam"; // public/goedam/header.png(992 × 240) — 괴담회 창 머리 배너

// 📌 색 · 모서리 — GoedamModal GD · NOTCH 와 같은 값(그 파일은 고치지 않고 결만 따른다)
const GD = { panel: "#120c26", ink: "#07051a", text: "#f1ecff", sub: "#8f88c8", mute: "#6f68a0", cyan: "#9ff8ff", gold: "#ffe08a" };
const NOTCH = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,3px calc(100% - 3px),0 calc(100% - 3px),0 3px,3px 3px)";
const NOTCH6 = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px,6px 3px)";
const NOTCH_TOP = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% 100%,0 100%,0 3px,3px 3px)";
const NOTCH6_TOP = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% 100%,0 100%,0 6px,3px 6px,3px 3px,6px 3px)";

// 멤버 원 색 — 시안 넷 + 더(멤버 차례대로 돌린다 · 그룹장이 첫 색)
const AV = ["#7b5cff", "#e0409a", "#2f9e8f", "#d97a1c", "#3f86c4", "#c2413b", "#7f9a2b", "#a8569e"];
// 상태 칩 — 모집 중(주황) · 심사 중(보라) · 승인(금) · 반려(빨강)
const ST = { open: { l: "모집 중", c: "" }, review: { l: "심사 중", c: " wait" }, approved: { l: "승인", c: " ok" }, rejected: { l: "반려", c: " no" } };
// 초대 미리보기 — 참여할 수 없는 까닭 한 줄(손님은 「로그인」 단추가 대신한다 · guest = 로그인했지만 디스코드 계정이 아님)
const WHY = { guest: "참여할 수 없는 계정입니다", full: "그룹이 꽉 찼습니다", closed: "모집이 끝난 그룹입니다", "has-group": "이미 다른 그룹에 있습니다", "not-open": "지원 기간이 아닙니다" };

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
// 📌 코드 입력 정리 — 대문자 · 빈칸 · 붙임표 빼기(서버 lib/invite normalizeCode 와 같은 정리), 6자까지
const normCode = (v) => String(v || "").toUpperCase().replace(/[\s\-‐-―−－]+/g, "").slice(0, 6);
const initialOf = (name) => Array.from(String(name || "").trim())[0] || "?";

// ── 시각 — 서버가 ISO 글자로 준다. 표기 · 입력은 KST ──
const KST = 9 * 3600000;
const p2 = (n) => String(n).padStart(2, "0");
const msOf = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v || "");
  return Number.isFinite(t) ? t : NaN;
};
const kstOf = (v) => {
  const t = msOf(v);
  return Number.isFinite(t) ? new Date(t + KST) : null;
};
const dayOf = (v) => {
  const d = kstOf(v);
  return d ? `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.` : "";
};
const hmOf = (v) => {
  const d = kstOf(v);
  return d ? `${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : "";
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
// 그룹 카드 둘째 줄 — 「10. 31. (토) 22:00」
const whenText = (v) => {
  const d = kstOf(v);
  return d ? `${d.getUTCMonth() + 1}. ${d.getUTCDate()}. (${WD[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : "";
};
// 지원서 칸 ↔ ISO — 날짜(YYYY-MM-DD) · 시간(HH:MM) 두 칸은 KST 로 읽는다. 둘 다 비면 null(언제는 선택)
const dateIn = (v) => {
  const d = kstOf(v);
  return d ? `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}` : "";
};
const whenOut = (date, time) => {
  if (!date && !time) return { when: null };
  if (!date) return { error: "날짜를 골라 주세요." };
  if (!time) return { error: "시간을 골라 주세요." };
  const t = Date.parse(`${date}T${time}:00+09:00`);
  return Number.isFinite(t) ? { when: new Date(t).toISOString() } : { error: "날짜를 다시 골라 주세요." };
};

// 📌 복사 — 클립보드 API, 막혀 있으면(옛 브라우저 · http) 숨은 글 상자로 한 번 더(괴담회 · 친구 초대 창과 같다)
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

// ── 효과음 — 괴담회 · 친구 초대 창과 같은 playTone 어휘. 만들기 · 참여 · 지원은 오름 넷, 나가기 · 내보내기 · 해체는 내림 둘, 거절은 낮게 하나, 복사 · 누르기는 짧은 틱 ──
const sfxGet = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.05), i * 110));
const sfxOut = () => {
  playTone(523.25, 0.08, "sine", 0.03);
  setTimeout(() => playTone(392, 0.12, "sine", 0.03), 90);
};
const sfxNo = () => playTone(330, 0.12, "sine", 0.03);
const sfxTick = () => playTone(660, 0.05, "sine", 0.025);

// ── 창 CSS — 단색 · 도트 테만(그라데이션 · 흐린 빛 금지). 틀 문법은 GoedamModal(.gd-win · .gd-wi · .gd-pp)과 같다 ──
//    ⚠ 2026-10-25 클래스 머리를 gg- 로 두지 말 것 — 「gg」는 중국어 광고(广告) 줄임말이라 광고 차단 목록(EasyList China `##.gg-box`)이
//       웨일 · 확장 광고 차단에서 오른쪽 칸(문화상품권 · 참여 코드)을 통째로 숨겼다(테스트 사이트 localhost 는 차단이 안 돌아 보였다) → grp-
//    📌 PC 높이 맞춤은 @container gg(본문 .grp-main 의 실제 크기) — 화면 높이가 아니라 이벤트 창 칸 높이(탭 줄이 위에 붙으면 그만큼 낮다)를 본다
const GG_CSS = `
@keyframes ggIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.grp-win { position: relative; width: 100%; height: 88vh; height: 88dvh; padding: 3px 3px 0; background: ${GD.ink}; clip-path: ${NOTCH6_TOP}; animation: ggIn .32s cubic-bezier(0.16,1,0.3,1); color: ${GD.text}; }
.grp-wi { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: ${GD.panel}; clip-path: ${NOTCH_TOP}; }
.grp-wi::after { content: ""; position: absolute; inset: 0; z-index: 40; pointer-events: none; box-shadow: inset 3px 3px 0 #2c2468, inset -3px 0 0 #0b0822; }
@media (min-width: 640px) {
  .grp-win { max-width: 1100px; height: min(800px, 92vh); padding: 3px; clip-path: ${NOTCH6}; }
  .grp-wi { clip-path: ${NOTCH}; }
  .grp-wi::after { box-shadow: inset 3px 3px 0 #2c2468, inset -3px -3px 0 #0b0822; }
}
/* 📌 이벤트 창 안(embedded) — 크기는 이벤트 창(./EventTabs.js EventHub)이 정하고 창은 그 칸을 꽉 채운다. 열림 움직임도 이벤트 창이 한 번만 */
.grp-win.emb { max-width: none; height: 100%; animation: none; }
.grp-wi *, .grp-wi *::before, .grp-wi *::after { box-sizing: border-box; }
.grp-px { image-rendering: pixelated; }
.grp-pp { border: 3px solid ${GD.ink}; background: var(--bg, #17123a); box-shadow: inset 3px 3px 0 var(--hi, #2c2468), inset -3px -3px 0 var(--sh, #0d0a26); clip-path: ${NOTCH}; }
.grp-grab { position: absolute; z-index: 20; left: 50%; top: 9px; width: 36px; height: 6px; margin-left: -18px; background: #3a3186; }
.grp-x { position: absolute; z-index: 30; right: 12px; top: 14px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; --bg: #221a52; --hi: #3a3186; --sh: #120e30; outline: none; cursor: pointer; }
.grp-x:hover { --bg: #2c2468; }
.grp-x:focus-visible { border-color: ${GD.cyan}; }
@media (min-width: 640px) { .grp-x { right: 18px; top: 18px; width: 36px; height: 36px; } }
/* 머리 — 괴담회 띠 배너. 칩(비공개)은 왼쪽 위에 얹는다 */
.grp-hd { flex: none; position: relative; }
.grp-hdi { display: block; width: 100%; height: auto; }
.grp-tags { position: absolute; left: 12px; top: 12px; z-index: 2; display: flex; align-items: center; }
@media (max-width: 639.98px) { .grp-tags { top: 21px; } }
.grp-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; font-size: 11px; font-weight: 900; line-height: 18px; color: rgba(241,236,255,.6); white-space: nowrap; --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
/* 📌 본문 — 폰은 한 줄(이 칸만 세로 스크롤), PC 는 왼쪽 · 오른쪽 330 두 칸(칸 높이 안에서 — 멤버 칸만 안에서 스크롤) */
.grp-main { position: relative; flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 16px 16px calc(20px + env(safe-area-inset-bottom)); }
.grp-main::-webkit-scrollbar, .grp-l::-webkit-scrollbar, .grp-r::-webkit-scrollbar, .grp-seatbox::-webkit-scrollbar { display: none; }
.grp-l, .grp-r { display: flex; flex-direction: column; min-width: 0; }
.grp-r { margin-top: 14px; }
@media (min-width: 640px) {
  .grp-main { display: flex; padding: 22px 24px 24px; overflow: hidden; container: gg / size; }
  .grp-l { flex: 1 1 0%; min-height: 0; overflow: hidden; }
  .grp-l.scroll { overflow-y: auto; scrollbar-width: none; }
  .grp-r { flex: none; width: 330px; min-height: 0; margin: 0 0 0 20px; overflow-y: auto; scrollbar-width: none; }
}
/* 그룹 카드 — 이름 크게 · 상태 칩 / 게임 · 언제 */
.grp-big { flex: none; padding: 12px 14px; --bg: #17123a; }
.grp-top { display: flex; align-items: center; }
.grp-t { flex: 1 1 auto; min-width: 0; margin: 0; font-size: 19px; font-weight: 900; line-height: 26px; color: #fff; overflow-wrap: anywhere; }
.grp-chip { flex: none; display: inline-flex; align-items: center; height: 24px; margin-left: 8px; padding: 0 8px; font-size: 12px; font-weight: 900; line-height: 18px; color: #2a1006; white-space: nowrap; --bg: #ff8a3d; --hi: #ffc08a; --sh: #b4521b; }
.grp-chip.wait { color: ${GD.text}; --bg: #3a3186; --hi: #5a4fc0; --sh: #1d1745; }
.grp-chip.ok { color: #2a1606; --bg: #e2b04a; --hi: ${GD.gold}; --sh: #9c6a22; }
.grp-chip.no { color: #fff; --bg: #d9435e; --hi: #ff8a9c; --sh: #8c1d33; }
.grp-sub { display: flex; flex-wrap: wrap; gap: 0 12px; margin: 5px 0 0; font-size: 12px; font-weight: 700; line-height: 17px; color: ${GD.text}; overflow-wrap: anywhere; }
.grp-sub span { min-width: 0; }
@media (min-width: 640px) {
  .grp-big { padding: 16px 18px; }
  .grp-t { font-size: 24px; line-height: 32px; }
  .grp-chip { height: 28px; padding: 0 10px; font-size: 13px; line-height: 22px; }
  .grp-sub { margin-top: 7px; font-size: 13px; line-height: 18px; }
}
/* 칸 머리 글 — 「멤버」 + 인원 */
.grp-sh { flex: none; display: flex; justify-content: space-between; margin: 0; padding: 14px 0 6px; font-size: 11px; font-weight: 900; line-height: 15px; color: ${GD.sub}; }
.grp-sh b { color: #d8d2f5; font-weight: 900; font-variant-numeric: tabular-nums; }
@media (min-width: 640px) { .grp-sh { padding-top: 18px; } }
/* 📌 멤버 칸 — 사진 자리 = 이름 첫 글자 원. 빈 자리 칸은 없다(운영자). 폰 2칸 · PC 4칸(칸 폭이 좁으면 3 · 2)
     칸이 낮아지면(여러 줄 · 낮은 창) 원이 「그룹장」 표와 겹치지 않게 위를 --pt 만큼 비운다(표 아래부터 가운데 맞춤 — 줄의 원 높이는 같다) */
.grp-seatbox { flex: none; }
.grp-seats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; --seat: 92px; --av: 40px; --pt: 0px; }
.grp-seat { position: relative; height: var(--seat); min-width: 0; padding: var(--pt) 8px 0; display: flex; flex-direction: column; align-items: center; justify-content: center; --bg: #17123a; }
.grp-seat.me { --bg: #1d1748; }
.grp-av { flex: none; width: var(--av); height: var(--av); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: calc(var(--av) * .36); font-weight: 900; line-height: 1; color: #fff; background: var(--c); box-shadow: 0 0 0 3px ${GD.ink}; }
.grp-n { display: block; max-width: 100%; margin-top: 6px; font-size: 13.5px; font-weight: 800; line-height: 18px; color: ${GD.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.grp-lead { position: absolute; left: 7px; top: 7px; display: inline-flex; align-items: center; height: 22px; padding: 0 7px; font-size: 11px; font-weight: 900; line-height: 16px; color: ${GD.gold}; white-space: nowrap; --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
.grp-kick { position: absolute; right: 7px; top: 7px; width: 26px; height: 26px; padding: 0; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; line-height: 1; color: ${GD.sub}; outline: none; cursor: pointer; --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
.grp-kick:hover:not(:disabled) { --bg: #2c2468; }
.grp-kick:focus-visible { border-color: ${GD.cyan}; }
.grp-kick:disabled { cursor: default; }
@media (max-width: 369.98px) { .grp-seats { --seat: 104px; --pt: 32px; } }
@media (min-width: 640px) {
  .grp-seatbox { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .grp-seats { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; --seat: 196px; --av: 68px; --pt: 0px; }
  .grp-seats.multi { --seat: 136px; --av: 52px; --pt: 28px; }
  .grp-n { margin-top: 12px; font-size: 16px; line-height: 20px; }
  .grp-lead { left: 10px; top: 10px; height: 24px; padding: 0 8px; font-size: 12px; line-height: 18px; }
  .grp-kick { right: 10px; top: 10px; }
}
/* 오른쪽 칸 — 문화상품권 · 참여 링크(또는 내 문화상품권 · 참여 코드) */
.grp-box { flex: none; padding: 12px 14px; --bg: #17123a; }
.grp-box + .grp-box { margin-top: 12px; }
@media (min-width: 640px) { .grp-box { padding: 14px 16px; } }
/* 폰 — 시안대로 링크 칸은 판 없이 · 문화상품권 칸은 내 그룹 화면에서 뺀다(.pc) */
@media (max-width: 639.98px) {
  .grp-box.flat { padding: 0; border: 0; background: none; box-shadow: none; clip-path: none; }
  .grp-box.flat, .grp-box + .grp-box.flat { margin-top: 8px; }
  .grp-box.pc { display: none; }
}
.grp-prize { display: flex; align-items: center; }
.grp-gc { flex: none; display: flex; line-height: 0; } /* 도트 상품권(24×16 · u=2 → 48×32) */
.grp-pt { min-width: 0; margin-left: 12px; }
.grp-pt b { display: block; font-size: 16px; font-weight: 900; line-height: 20px; color: #fff; }
.grp-pt small { display: block; margin-top: 3px; font-size: 12px; font-weight: 700; line-height: 16px; color: ${GD.sub}; }
/* 지원 보너스 줄(괴담회 추첨권) · 재고 주의(작은 mute 글자) — 문화상품권 칸 안, 상품권 줄 아래 */
.grp-bonus { display: flex; align-items: center; min-width: 0; margin: 10px 0 0; padding-top: 10px; box-shadow: inset 0 3px 0 #221a52; font-size: 13px; font-weight: 800; line-height: 18px; color: ${GD.sub}; white-space: nowrap; }
.grp-bonus b { font-weight: 900; color: ${GD.text}; font-variant-numeric: tabular-nums; }
.grp-mi { flex: none; display: flex; margin: 0 4px 0 auto; padding-left: 10px; line-height: 0; } /* 라벨은 왼쪽 · 추첨권 값은 오른쪽 끝(멤버 줄 「멤버 … 3 / 4」와 같은 짝) */ /* ItemIcon 이 제 여백(가운데 맞춤)을 인라인으로 쓰므로 한 겹 감싼다 */
.grp-mnote { margin-top: 12px; }
.grp-mnote .grp-bonus { margin-top: 0; }
@media (min-width: 640px) { .grp-mnote { display: none; } }
.grp-cau { margin: 8px 0 0; font-size: 11px; font-weight: 700; line-height: 15px; color: ${GD.mute}; word-break: keep-all; overflow-wrap: anywhere; }
.grp-bl { margin: 0 0 6px; font-size: 11px; font-weight: 900; line-height: 15px; color: ${GD.sub}; }
.grp-code { display: flex; align-items: center; min-width: 0; margin: 0; }
.grp-code code, .grp-cin { flex: 1 1 auto; min-width: 0; height: 40px; margin: 0; padding: 0 12px; border: 0; border-radius: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 16px; font-weight: 700; line-height: 40px; color: #fff; background: ${GD.ink}; clip-path: ${NOTCH}; }
.grp-code code { user-select: all; -webkit-user-select: all; }
.grp-cin { letter-spacing: .08em; outline: none; -webkit-appearance: none; appearance: none; }
.grp-cin::placeholder { color: #5a5390; letter-spacing: 0; font-family: inherit; opacity: 1; }
.grp-cin:focus { box-shadow: inset 0 0 0 2px #4a3fa0; }
.grp-code .grp-sb { flex: none; margin-left: 8px; }
/* 보라 도트 단추(링크 복사 · 복사 · 참여) */
.grp-sb { position: relative; display: inline-flex; align-items: center; justify-content: center; min-width: 88px; height: 40px; padding: 0 12px 2px; font-family: inherit; font-size: 13px; font-weight: 900; color: ${GD.text}; white-space: nowrap; outline: none; cursor: pointer; --bg: #2c2468; --hi: #4a3fa0; --sh: #17133a; }
.grp-sb:hover:not(:disabled) { --bg: #3a3186; }
.grp-sb:active:not(:disabled) { transform: translateY(2px); }
.grp-sb:focus-visible { border-color: ${GD.cyan}; }
.grp-sb:disabled { cursor: default; color: rgba(241,236,255,.45); }
/* 단계 — 모집 중 → 심사 중 → 승인(반려면 셋째 칸 「반려」 + 사유 줄) */
.grp-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
.grp-st { height: 30px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 900; line-height: 16px; color: #5a5390; background: #0f0b24; white-space: nowrap; clip-path: ${NOTCH}; }
.grp-st.on { color: #2a1006; background: #ff8a3d; }
.grp-st.ok { color: #2a1606; background: #e2b04a; }
.grp-st.done { color: ${GD.sub}; background: #221a52; }
.grp-st.no { color: #fff; background: #d9435e; }
.grp-why { margin: 8px 0 0; font-size: 12px; font-weight: 700; line-height: 17px; color: #ff9aac; overflow-wrap: anywhere; }
/* 아래 단추 — PC 는 오른쪽 칸 맨 아래
   📌 PC 는 늘 칸 바닥에 붙는다(sticky) — 오른쪽 칸이 넘치면(문화상품권 칸의 보너스 · 주의 줄 · 반려 사유 · 낮은 창) 단추 줄은 늘 보이고 위 칸들이 그 밑으로 스크롤된다.
      넘치지 않으면 margin-top auto 로 이미 바닥이라 아무것도 안 움직인다(오른쪽 칸 스크롤 막대는 숨김이라 잘린 단추로는 스크롤을 알 수 없다) */
.grp-foot { flex: none; margin-top: 14px; }
@media (min-width: 640px) { .grp-foot { position: sticky; bottom: 0; z-index: 1; margin-top: auto; padding-top: 14px; background: ${GD.panel}; } }
/* 금색 도트 단추 — 괴담회 추첨 단추와 같은 결 */
.grp-gb { position: relative; display: inline-flex; align-items: center; justify-content: center; margin: 0; padding: 0; font-family: inherit; background: #e2b04a; color: #2a1606; font-weight: 900; white-space: nowrap; border: 3px solid ${GD.ink}; box-shadow: inset 0 3px 0 ${GD.gold}, inset 0 -4px 0 #9c6a22; clip-path: ${NOTCH}; outline: none; cursor: pointer; }
.grp-gb:active:not(:disabled):not(.off) { transform: translateY(2px); box-shadow: inset 0 2px 0 ${GD.gold}, inset 0 -2px 0 #9c6a22; }
.grp-gb:focus-visible { border-color: #fff; }
.grp-gb:disabled { cursor: default; }
.grp-gb.off { background: #2a2458; color: rgba(241,236,255,.45); box-shadow: inset 0 3px 0 #3a3186, inset 0 -4px 0 #17133a; }
.grp-gb.lg { width: 100%; height: 50px; padding: 0 16px 3px; font-size: 16px; }
.grp-gb.md { height: 36px; padding: 0 18px 2px; font-size: 13px; }
@media (min-width: 640px) { .grp-gb.lg { height: 54px; font-size: 17px; } }
.grp-lk { display: block; margin-right: 8px; line-height: 0; }
.grp-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.grp-ghosts { display: flex; justify-content: center; margin-top: 6px; }
.grp-ghost { position: relative; height: 28px; margin: 0; padding: 0 10px; border: 0; background: none; font-family: inherit; font-size: 12px; font-weight: 800; line-height: 28px; color: ${GD.mute}; white-space: nowrap; outline: none; cursor: pointer; }
.grp-ghost:hover:not(:disabled) { color: ${GD.sub}; }
.grp-ghost:focus-visible { color: ${GD.cyan}; }
.grp-ghost:disabled { cursor: default; }
.grp-note { margin: 8px 0 0; text-align: center; font-size: 12px; font-weight: 700; line-height: 17px; color: ${GD.sub}; }
/* 지원서 — 그룹 이름 · 함께 할 게임 · 언제(선택 — 날짜 · 시간) */
.grp-form { flex: none; display: block; margin: 0; padding: 14px; --bg: #17123a; }
@media (min-width: 640px) { .grp-form { flex: 1 1 auto; padding: 16px 18px; } }
.grp-fl { display: block; margin: 14px 0 7px; font-size: 13px; font-weight: 800; line-height: 18px; color: #d8d2f5; }
.grp-fl i { margin-left: 5px; font-style: normal; font-weight: 700; color: ${GD.mute}; }
.grp-in { display: block; width: 100%; min-width: 0; height: 46px; margin: 0; padding: 0 14px; border-radius: 0; font-family: inherit; font-size: 16px; font-weight: 700; line-height: normal; color: #fff; outline: none; color-scheme: dark; -webkit-appearance: none; appearance: none; --bg: #0b0822; --hi: #07051a; --sh: #241d58; }
.grp-in::placeholder { color: #5a5390; opacity: 1; }
/* 📌 2026-10-25 게임 고르기 칩 — 입력 칸과 같은 짙은 바탕 · 고른 것은 주황(모집 중 칩 색). 줄바꿈하며 쌓이고 칩 폭은 글자대로 */
.grp-games { display: flex; flex-wrap: wrap; gap: 8px; }
.grp-gm { height: 40px; padding: 0 14px 1px; font-family: inherit; font-size: 14px; font-weight: 800; color: #d8d2f5; white-space: nowrap; outline: none; cursor: pointer; --bg: #0b0822; --hi: #07051a; --sh: #241d58; }
.grp-gm:hover:not(:disabled):not(.on) { color: #fff; --bg: #120e30; }
.grp-gm:focus-visible { border-color: ${GD.cyan}; }
.grp-gm.on { color: #2a1006; --bg: #ff8a3d; --hi: #ffc08a; --sh: #b4521b; }
.grp-gm:disabled { cursor: default; opacity: .6; }
.grp-oth { margin-top: 8px; } /* 기타 — 칩 바로 아래 게임 이름 칸 */
.grp-in.empty { color: #5a5390; } /* 비어 있는 날짜 · 시간 칸 — 자리 글자(연도-월-일 · --:--)를 자리표시 색으로 */
.grp-in:focus { border-color: #4a3fa0; }
.grp-in:disabled { color: rgba(241,236,255,.45); }
.grp-in::-webkit-date-and-time-value { text-align: left; }
.grp-in::-webkit-calendar-picker-indicator { opacity: .6; cursor: pointer; }
.grp-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; }
.grp-fa { display: flex; align-items: center; margin-top: 20px; }
.grp-fa .grp-gb { width: 100%; }
.grp-fa .grp-ghost { flex: none; margin-left: 8px; }
/* 폰 — 날짜 · 시간 값(「2026-10-31」 · 「오후 10:00」 + 달력 · 시계 단추)이 안 잘리게 안쪽 여백을 줄인다. 아주 좁으면 위아래로 */
@media (max-width: 639.98px) { .grp-in { padding: 0 10px; } .grp-two { gap: 8px; } }
@media (max-width: 359.98px) { .grp-two { grid-template-columns: minmax(0, 1fr); } }
@media (min-width: 640px) { .grp-in { font-size: 15px; } .grp-fa { margin-top: 22px; } .grp-fa .grp-gb { width: 300px; } }
/* 읽는 중 · 실패 · 로그인 필요 */
.grp-msg { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 160px; font-size: 13px; font-weight: 700; color: rgba(241,236,255,.55); }
.grp-msg .grp-gb { margin-top: 12px; }
.grp-form > .grp-msg { height: 100%; }
/* 📌 칸 폭 맞춤(PC) — 이벤트 창 칸이 좁으면(탭 줄이 위 · 작은 창) 오른쪽 칸을 줄이고 멤버 칸 줄을 4 → 3 → 2 */
@container gg (max-width: 860px) { .grp-r { width: 280px; margin-left: 16px; } }
@container gg (max-width: 760px) { .grp-seats { grid-template-columns: repeat(3, minmax(0, 1fr)); --seat: 150px; --av: 56px; --pt: 18px; } .grp-seats.multi { --seat: 120px; --av: 44px; --pt: 36px; } }
@container gg (max-width: 620px) { .grp-r { width: 250px; } .grp-seats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* 재고 주의는 한 줄(약속 문서 6b) — 250 칸 안쪽 212px 에 Noto Sans KR 은 206px 로 빠듯하고, 글꼴이 늦게 오는 동안(맑은 고딕 220px)은 두 줄이 된다 → 줄바꿈 없이 · 자간만 살짝 */
@container gg (max-width: 620px) { .grp-cau { white-space: nowrap; letter-spacing: -.02em; } }
/* 📌 칸 높이 맞춤(PC) — 본문이 낮으면(노트북 · 탭 줄이 위에 붙은 창) 멤버 칸 · 입력 칸 · 단추를 줄인다. 그래도 넘치면 멤버 칸 · 지원서 · 오른쪽 칸이 안에서 스크롤 */
@container gg (max-height: 400px) {
  .grp-seats { --seat: 150px; --av: 56px; --pt: 18px; }
  .grp-seats.multi { --seat: 120px; --av: 44px; --pt: 36px; }
  .grp-sh { padding-top: 12px; }
  .grp-fl { margin-top: 10px; }
  .grp-in { height: 40px; }
  .grp-gm { height: 36px; }
  .grp-fa { margin-top: 14px; }
  .grp-gb.lg { height: 46px; font-size: 15px; }
  .grp-big { padding: 12px 16px; }
  .grp-box { padding: 10px 14px; }
  .grp-box + .grp-box { margin-top: 10px; }
  .grp-bonus { margin-top: 6px; padding-top: 7px; }
  .grp-cau { margin-top: 4px; }
  .grp-steps { margin-top: 8px; }
  .grp-foot { padding-top: 10px; }
  .grp-ghosts { margin-top: 2px; }
}
@container gg (max-height: 320px) {
  .grp-seats, .grp-seats.multi { --seat: 112px; --av: 40px; --pt: 36px; }
  .grp-n { margin-top: 8px; font-size: 14px; }
  .grp-form { padding: 12px 16px; }
  .grp-form .grp-t { font-size: 20px; line-height: 26px; }
  .grp-fl { margin: 8px 0 5px; }
  .grp-in { height: 36px; }
  .grp-gm { height: 32px; padding: 0 11px 1px; font-size: 13px; }
  .grp-games { gap: 6px; }
  .grp-fa { margin-top: 12px; }
}
@media (prefers-reduced-motion: reduce) { .grp-win { animation: none !important; } }
`;

// 도트 그림(rows · pal) — 같은 색 가로 줄을 rect 하나로(crispEdges · 정수 배율 u). 괴담회 창 Sprite 와 같은 그리기
const Sprite = ({ rows, pal, u = 2 }) => {
  const W = rows[0].length, H = rows.length;
  const rects = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < W; ) {
      const ch = row[x];
      if (!pal[ch]) { x++; continue; }
      let e = x;
      while (e + 1 < W && row[e + 1] === ch) e++;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={e - x + 1} height="1" fill={pal[ch]} />);
      x = e + 1;
    }
  });
  return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={W * u} height={H * u} shapeRendering="crispEdges" className="shrink-0">{rects}</svg>;
};
// 자물쇠 · 닫기 ✕ — 괴담회 창과 같은 그림 / 내보내기 ✕ — 칸 구석 작은 도트(가는 선)
const LOCK = { rows: [".ooo.", "o...o", "ooooo", "oyyyo", "oyoyo", "ooooo"], pal: { o: GD.ink, y: GD.sub } };
const XMARK = { rows: ["xx....xx", "xxx..xxx", ".xxxxxx.", "..xxxx..", "..xxxx..", ".xxxxxx.", "xxx..xxx", "xx....xx"], pal: { x: GD.text } };
const KICK = { rows: ["x...x", ".x.x.", "..x..", ".x.x.", "x...x"], pal: { x: GD.sub } };
// 📌 문화상품권 — 24×16 칸(약속 문서 6b · scratchpad/giftcard/gen.mjs 결과 그대로). 민트 상품권 + 금 리본 · 흰 줄 · 작은 금 단추, 짙은 테
const GIFT = {
  rows: [
    ".oooooooooooooooooooooo.",
    "oHHHHHZZyHHHHHHHHHHHHHHo",
    "oGGGooYYyooGGGGGGGGGGGSo",
    "oGGoYYoYoYYoGGGGGGGGGGSo",
    "oGGoYyyyyyYoWWWWWWWWGGSo",
    "oGGGooYYyooGGGGGGGGGGGSo",
    ".oGGGGYYyGGGHHHHHGGGGGo.",
    "..oGGGYYyGGGGGGGGGGGGo..",
    "..oGGGYYyGGGGGGGGGGGGo..",
    ".oGGGGYYyGGGGGGGoooGGGo.",
    "oGGGGGYYyGGGGGGoZYYoGGSo",
    "oGGGGGYYyGGGSSGSYyYoGGSo",
    "oGGGGGYYyGGGSSGSYYyoGGSo",
    "oGGGGGYYyGGGGGGGoooGGGSo",
    "oSSSSSYYySSSSSSSSSSSSSSo",
    ".oooooooooooooooooooooo.",
  ],
  pal: { o: "#07051a", H: "#a9f4d6", G: "#3ccf9e", S: "#23956c", Y: "#ffd34d", Z: "#fff1b3", y: "#c8962a", W: "#ffffff" },
};

// 단계 줄 — 지금 단계는 주황(승인은 금 · 반려는 빨강), 지난 단계는 옅은 보라
const Steps = ({ status }) => {
  const k = status === "approved" || status === "rejected" ? 2 : status === "review" ? 1 : 0;
  const last = status === "rejected" ? "반려" : "승인";
  return (
    <div className="grp-steps" aria-hidden>
      {["모집 중", "심사 중", last].map((l, i) => (
        <span key={l} className={`grp-st${i < k ? " done" : i === k ? (k < 2 ? " on" : status === "rejected" ? " no" : " ok") : ""}`}>{l}</span>
      ))}
    </div>
  );
};

// 상태 읽기 — code 를 주면 그 그룹 초대 미리보기도 같이. 실패면 null
const fetchState = async (code = "") => {
  try {
    const res = await fetch(code ? `${API}?code=${encodeURIComponent(code)}` : API, { cache: "no-store" });
    const j = await res.json();
    return j?.ok ? j : null;
  } catch {
    return null;
  }
};
// POST { action, ... } — 성공이면 { ok: true, ...상태 }, 실패면 { ok: false, error }. 네트워크 실패는 null
const post = async (body) => {
  try {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return await r.json().catch(() => ({ ok: false }));
  } catch {
    return null;
  }
};
// 받은 상태에서 ok · bonus(지원 응답에만 붙는 이번 지급 장 수)를 뺀다(GET · POST 같은 모양)
const stateOf = (j) => {
  const st = { ...(j || {}) };
  delete st.ok;
  delete st.bonus;
  return st;
};
// 장 수 — 0 이상 정수(못 읽으면 0)
const countOf = (v) => Math.max(0, Math.floor(Number(v) || 0));

// other — 「기타」를 골랐나(그때 game 은 직접 적은 이름)
const EMPTY_FORM = { name: "", game: "", other: false, date: "", time: "" };
// 게임 칸 비었을 때 — 기타면 이름을 적으라고
const noGameMsg = (v) => (v.other ? "게임 이름을 넣어 주세요." : "게임을 골라 주세요.");

// 지원서 — 새 그룹 · 고치기가 같은 칸을 쓴다(그룹 이름 · 함께 할 게임 · 언제(선택 — 날짜 · 시간) · 금색 단추 · 고치기면 「취소」)
//    k = 이 지원서의 동작 이름(create · edit) — 그 동작 중이면 칸을 잠그고 단추에 「…」. locked = 기간 밖 잠금 글자(단추 글자를 대신한다)
const ApplyForm = ({ v, set, onSubmit, label, k, busy, locked = "", onCancel = null }) => {
  const mine = busy === k;
  return (
    <form className="grp-form grp-pp" onSubmit={onSubmit}>
      <h3 className="grp-t">지원서</h3>
      <label className="grp-fl" htmlFor="grp-name">그룹 이름</label>
      <input id="grp-name" className="grp-in grp-pp" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} maxLength={20} placeholder="예) 야간 괴담 파티" autoComplete="off" disabled={mine} />
      {/* 📌 2026-10-25 운영자 "게임 이름 적는 게 아니라 선택하는 방식" — 정해진 게임(lib/goedamGames.js) 칩에서 하나 고른다(서버도 같은 표로 확인) */}
      <span className="grp-fl" id="grp-game">함께 할 게임</span>
      <div className="grp-games" role="radiogroup" aria-labelledby="grp-game">
        {GROUP_GAMES.map((g) => {
          const on = !v.other && v.game === g;
          return (
            <button
              key={g}
              type="button"
              role="radio"
              aria-checked={on}
              className={`grp-gm grp-pp${on ? " on" : ""}`}
              onClick={() => { if (!on) { sfxTick(); set({ ...v, game: g, other: false }); } }}
              disabled={mine}
            >
              {g}
            </button>
          );
        })}
        {/* 📌 2026-10-26 운영자 "함께할 게임에 기타 칸" — 고르면 바로 아래 칸에 게임 이름을 적는다(서버 checkGame 이 표에 없는 이름을 받는다) */}
        <button
          type="button"
          role="radio"
          aria-checked={v.other}
          className={`grp-gm grp-pp${v.other ? " on" : ""}`}
          onClick={() => { if (!v.other) { sfxTick(); set({ ...v, game: "", other: true }); } }}
          disabled={mine}
        >
          {GAME_OTHER}
        </button>
      </div>
      {v.other && (
        <input className="grp-in grp-pp grp-oth" value={v.game} onChange={(e) => set({ ...v, game: e.target.value })} maxLength={30} placeholder="게임 이름" aria-label="게임 이름" autoComplete="off" autoFocus disabled={mine} />
      )}
      <label className="grp-fl" htmlFor="grp-date">언제<i>선택</i></label>
      <div className="grp-two">
        <input id="grp-date" type="date" className={`grp-in grp-pp${v.date ? "" : " empty"}`} value={v.date} onChange={(e) => set({ ...v, date: e.target.value })} aria-label="날짜" disabled={mine} />
        <input type="time" className={`grp-in grp-pp${v.time ? "" : " empty"}`} value={v.time} onChange={(e) => set({ ...v, time: e.target.value })} aria-label="시간" disabled={mine} />
      </div>
      <div className="grp-fa">
        <button type="submit" className={`grp-gb lg${locked ? " off" : ""}`} disabled={!!locked || !!busy}>
          <span style={mine ? { visibility: "hidden" } : undefined}>{locked || label}</span>
          {mine && <span className="grp-busy">…</span>}
        </button>
        {onCancel && <button type="button" className="grp-ghost" onClick={onCancel} disabled={mine}>취소</button>}
      </div>
    </form>
  );
};

// pushToast(msg, accent) — 레벨 페이지 토스트(accent = 된 일, 거절은 흰 판 — 친구 초대 · 괴담회 창과 같다). onCount — 이벤트 탭 빨간 숫자(지원할 수 있으면 1)
// joinCode — 참여 링크(/level?gg=CODE)로 들어온 코드(app/level/page.js 가 주소에서 걷어 넘긴다). 새 코드가 오면 그 그룹을 미리 본다
// 📌 embedded — 이벤트 창(./EventTabs.js EventHub) 안에 넣을 때. 바깥 어둠 · 틀 크기 · 열림 움직임 · 이벤트 탭은 이벤트 창 몫이고, 이 창은 그 칸을 꽉 채운다
/** @param {{ open: boolean; onClose: () => void; pushToast?: (msg: string, accent?: boolean) => void; onCount?: (n: number) => void; joinCode?: string; embedded?: boolean }} props */
export default function GoedamGroupModal({ open, onClose, pushToast, onCount, joinCode = "", embedded = false }) {
  const [data, setData] = useState(null); // 마지막으로 받은 상태 — 다시 열면 바로 그리고 뒤에서 새로 읽는다
  const [status, setStatus] = useState("idle"); // idle · loading · ok · error
  const [nowMs, setNowMs] = useState(0); // 기간 전 · 끝 판단 — 읽을 때마다
  const [busy, setBusy] = useState(""); // "" · create · join · leave · kick:<mid> · edit · disband · submit
  const [draft, setDraft] = useState(EMPTY_FORM); // 지원서(새 그룹)
  const [edit, setEdit] = useState(null); // 고치기 중인 지원서(그룹장) — null 이면 그룹 카드
  const [codeIn, setCodeIn] = useState(""); // 「참여 코드」 칸
  // 📌 미리 보는 초대 코드 — n 은 새로 고를 때마다 +1(그때 한 번만 「찾을 수 없음」 · 「이미 다른 그룹」 알림)
  const [peek, setPeek] = useState({ code: "", n: 0 });
  const [peeking, setPeeking] = useState(false);
  const busyRef = useRef("");
  const peekRef = useRef(peek);
  const annRef = useRef(0);
  const closeRef = useRef(null);
  useEffect(() => { peekRef.current = peek; }, [peek]);

  // 📌 참여 링크 코드 — 바뀔 때만 미리보기로 넘긴다(같은 코드로 창을 닫았다 열어도 다시 알리지 않는다)
  const jc = normCode(joinCode);
  const [seenJoin, setSeenJoin] = useState("");
  if (jc !== seenJoin) {
    setSeenJoin(jc);
    if (jc) {
      setPeek((p) => ({ code: jc, n: p.n + 1 }));
      setPeeking(true);
    }
  }

  // 읽은 상태 반영 — 실패면 이미 그린 상태는 그대로 둔다(뒤에서 새로 읽기만 실패)
  const apply = useCallback((j) => {
    setNowMs(Date.now());
    if (j) {
      setData(stateOf(j));
      setStatus("ok");
    } else setStatus((s) => (s === "ok" ? "ok" : "error"));
  }, []);
  const load = useCallback(() => fetchState(peekRef.current.code).then(apply), [apply]);

  // 📌 지원할 수 있으면(지원 기간 · 그룹장 · 모집 중 또는 반려 · 최소 인원 이상) 이벤트 탭 숫자 1 — 서버 meta n(metaCount)과 같은 셈
  useEffect(() => {
    if (!data || !onCount) return;
    const g = data.my?.group;
    const ready = !!data.open && !data.guest && data.my?.role === "leader" && (g?.status === "open" || g?.status === "rejected") && Number(g?.count) >= Number(data.minMembers || 4);
    onCount(ready ? 1 : 0);
  }, [data, onCount]);

  // 열 때마다 · 미리 볼 코드가 바뀔 때마다 새로 읽는다. 새로 고른 코드는 그 결과를 한 번 알린다
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const pk = peek;
    fetchState(pk.code).then((j) => {
      if (!alive) return;
      apply(j);
      setPeeking(false);
      if (!pk.code || !pk.n || annRef.current === pk.n) return;
      annRef.current = pk.n;
      if (!j) {
        sfxNo();
        pushToast?.("네트워크 오류로 불러오지 못했습니다.");
      } else if (j.my) {
        if (j.my.group?.code !== pk.code) {
          sfxNo();
          pushToast?.("이미 다른 그룹에 있습니다");
        }
      } else if (!j.invite) {
        sfxNo();
        pushToast?.("그룹을 찾을 수 없습니다");
      } else sfxTick();
    });
    return () => { alive = false; };
  }, [open, peek, apply, pushToast]);

  // 📌 내 그룹이 모집 중 · 심사 중이면 20초마다 다시 읽는다(멤버가 들어오고 심사가 끝나는 것을 창을 열어 둔 채로 본다)
  const gst = data?.my?.group?.status || "";
  const live = gst === "open" || gst === "review";
  useEffect(() => {
    if (!open || !live) return;
    const t = setInterval(() => { if (!busyRef.current && !document.hidden) load(); }, 20000);
    return () => clearInterval(t);
  }, [open, live, load]);

  const closeAll = useCallback(() => {
    setEdit(null);
    onClose();
  }, [onClose]);
  // 📌 이벤트 창 안에서 다른 탭으로 옮기거나 이벤트 창이 바깥에서 닫히면 closeAll 을 거치지 않고 open 만 꺼진다 — 그때도 고치기를 접는다
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (!open) setEdit(null);
  }

  // 열리면 닫기 단추에 포커스 · Esc 로 닫기(고치기 중이면 고치기만 접는다)
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (edit) setEdit(null);
      else closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, edit, closeAll]);

  // 📌 동작 하나 — 한 번에 하나만. 성공이면 받은 상태로 바로 그리고 소리 · 알림, 실패면 서버 글 그대로 + 상태 다시 읽기
  //    okMsg — 글자, 또는 응답을 받아 글자를 만드는 함수(지원하기 — 이번에 넣은 추첨권 장 수)
  const act = useCallback(async (key, body, okMsg, sfx = sfxGet) => {
    if (busyRef.current) return null;
    busyRef.current = key;
    setBusy(key);
    const res = await post(body);
    if (res?.ok) {
      setData(stateOf(res));
      setStatus("ok");
      setNowMs(Date.now());
      sfx();
      pushToast?.(typeof okMsg === "function" ? okMsg(res) : okMsg, true);
    } else {
      sfxNo();
      pushToast?.(res ? res.error || res.message || "처리하지 못했습니다." : "네트워크 오류로 처리하지 못했습니다.");
      load();
    }
    busyRef.current = "";
    setBusy("");
    return res?.ok ? res : null;
  }, [pushToast, load]);

  const copy = useCallback(async (text, okMsg) => {
    const ok = text ? await copyText(String(text)) : false;
    if (ok) {
      sfxTick();
      pushToast?.(okMsg, true);
    } else {
      sfxNo();
      pushToast?.("복사하지 못했습니다.");
    }
  }, [pushToast]);

  if (!open) return null;

  const guest = !!data?.guest;
  const my = data && !guest && data.my ? data.my : null;
  const invite = !my && peek.code && data?.invite ? data.invite : null;
  const minN = Math.max(1, Math.floor(Number(data?.minMembers) || 4));
  // 📌 기간 밖 잠금 — 운영진 미리보기(꺼짐)는 잠그지 않는다(서버가 가린다). 기간 전 「10. 25. 00:00 에 열립니다」 · 끝 「종료」
  const startMs = msOf(data?.startsAt), endMs = msOf(data?.endsAt);
  const lockText = !data || data.open || data.adminPreview
    ? ""
    : nowMs > 0 && nowMs < startMs
      ? `${dayOf(data.startsAt)} ${hmOf(data.startsAt)} 에 열립니다`
      : nowMs > 0 && nowMs >= endMs
        ? "종료"
        : "준비 중";
  const busyDots = <span className="grp-busy">…</span>;
  const hide = (k) => (busy === k ? { visibility: "hidden" } : undefined);

  // ── 동작 ──
  const login = () => {
    closeAll();
    openLogin(peek.code ? { returnTo: `/level?gg=${peek.code}` } : {});
  };
  const create = async (e) => {
    e.preventDefault();
    if (busyRef.current) return;
    const name = draft.name.trim(), game = draft.game.trim();
    const w = whenOut(draft.date, draft.time);
    const err = !name ? "그룹 이름을 넣어 주세요." : !game ? noGameMsg(draft) : w.error || "";
    if (err) {
      sfxNo();
      pushToast?.(err);
      return;
    }
    if (await act("create", { action: "create", name, game, when: w.when }, "그룹을 만들었습니다")) setDraft(EMPTY_FORM);
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    if (busyRef.current || !edit) return;
    const name = edit.name.trim(), game = edit.game.trim();
    const w = whenOut(edit.date, edit.time);
    const err = !name ? "그룹 이름을 넣어 주세요." : !game ? noGameMsg(edit) : w.error || "";
    if (err) {
      sfxNo();
      pushToast?.(err);
      return;
    }
    if (await act("edit", { action: "edit", name, game, when: w.when }, "저장했습니다", sfxTick)) setEdit(null);
  };
  const startEdit = (g) => {
    sfxTick();
    const gm = String(g.game || "");
    // 표에 없는 이름 = 「기타」로 적은 게임
    setEdit({ name: String(g.name || ""), game: gm, other: !!gm && !GROUP_GAMES.includes(gm), date: dateIn(g.when), time: hmOf(g.when) });
  };
  const cancelEdit = () => {
    sfxTick();
    setEdit(null);
  };
  // 참여 코드 → 그 그룹 미리보기(참여는 미리보기의 「이 그룹에 참여」로)
  const peekSubmit = (e) => {
    e.preventDefault();
    if (peeking || busyRef.current) return;
    const code = normCode(codeIn);
    if (code.length !== 6) {
      sfxNo();
      pushToast?.("코드 6자리를 넣어 주세요.");
      return;
    }
    setPeeking(true);
    setPeek((p) => ({ code, n: p.n + 1 }));
  };
  const cancelPeek = () => {
    sfxTick();
    setPeek((p) => ({ code: "", n: p.n }));
  };
  const join = async () => {
    if (await act("join", { action: "join", code: peek.code }, "그룹에 참여했습니다")) {
      setCodeIn("");
      setPeek((p) => ({ code: "", n: p.n }));
    }
  };
  // 지원 — 이번에 실제로 넣은 장 수만 알린다(이미 받았거나 못 넣었으면 0 → 「지원했습니다」만)
  const submit = () =>
    act("submit", { action: "submit" }, (res) => {
      const t = countOf(res?.bonus?.tickets);
      return t > 0 ? `지원했습니다. 추첨권 ${fmt(t)}장 지급` : "지원했습니다";
    });
  const leave = () => act("leave", { action: "leave" }, "그룹에서 나왔습니다", sfxOut);
  const disband = () => act("disband", { action: "disband" }, "그룹을 해체했습니다", sfxOut);
  const kick = (m) => act(`kick:${m.mid}`, { action: "kick", mid: m.mid }, `${String(m.name || "").trim() || "멤버"} 님을 내보냈습니다`, sfxOut);

  // ── 조각 ──
  // 📌 문화상품권 칸 — 도트 상품권 · 「문화상품권(3천원권)」 / 「N인 팀 구성 시 신청 가능」 / 지원 보너스 줄(서버 applyTickets, 0 이면 없음) / 재고 주의 한 줄
  //    2026-10-25 「N명 이상이면 1인당 1장」은 지원 조건으로 안 읽혀(운영자 "4명만 모여야 신청이 가능하다고") 보상과 조건을 두 줄로 나눴다 · 조건 줄 글은 운영자 지정
  //    pcOnly — 폰 내 그룹 화면은 시안대로 이 칸을 통째로 뺀다(보너스 · 주의 줄도 같이)
  const bonusN = countOf(data?.applyTickets);
  const prizeBox = (pcOnly) => (
    <div className={`grp-box grp-pp${pcOnly ? " pc" : ""}`}>
      <div className="grp-prize">
        <span aria-hidden className="grp-gc"><Sprite {...GIFT} u={2} /></span>
        <span className="grp-pt">
          <b>문화상품권(3천원권)</b>
          <small>{fmt(minN)}인 팀 구성 시 신청 가능</small>
        </span>
      </div>
      {bonusN > 0 && (
        <p className="grp-bonus">
          지원 보너스
          <span aria-hidden className="grp-mi"><ItemIcon icon="art:goedam-ticket" size={16} /></span>
          <b>추첨권 ×{fmt(bonusN)}</b>
        </p>
      )}
      <p className="grp-cau">※ 상품권이 모두 소진되면 지급되지 않습니다</p>
    </div>
  );
  // 그룹 카드 — 이름 · 상태 칩 / 게임 · 언제
  const groupCard = (g) => {
    const st = ST[g.status] || ST.open;
    // 📌 게임 · 언제는 가운데 점으로 잇지 않고 두 조각을 띄워 놓는다(운영자 "중간 점 빼라고 제발")
    const sub = [String(g.game || "").trim(), whenText(g.when)].filter(Boolean);
    return (
      <div className="grp-big grp-pp">
        <div className="grp-top">
          <h3 className="grp-t">{g.name}</h3>
          <span className={`grp-chip grp-pp${st.c}`}>{st.l}</span>
        </div>
        {sub.length > 0 && <p className="grp-sub">{sub.map((s, i) => <span key={i}>{s}</span>)}</p>}
      </div>
    );
  };
  // 멤버 칸 — 그룹장 표 · 그룹장이 보는 남의 칸에만 ✕(모집 중 · 반려일 때). 인원은 최소 전엔 「3 / 4」, 그 뒤엔 「4명」
  const memberBlock = (g, canKick) => {
    const ms = Array.isArray(g.members) ? g.members : [];
    const n = Math.max(ms.length, Math.floor(Number(g.count) || 0));
    return (
      <>
        <p className="grp-sh"><span>멤버</span><b>{n < minN ? `${fmt(n)} / ${fmt(minN)}` : `${fmt(n)}명`}</b></p>
        <div className="grp-seatbox">
          <div className={`grp-seats${ms.length > 4 ? " multi" : ""}`}>
            {ms.map((m, i) => {
              const nm = String(m?.name || "").trim() || "—";
              const k = `kick:${m.mid}`;
              return (
                <div key={m.mid || i} className={`grp-seat grp-pp${m.me ? " me" : ""}`}>
                  {m.leader && <span className="grp-lead grp-pp">그룹장</span>}
                  {canKick && !m.leader && !m.me && m.mid && (
                    <button type="button" className="grp-kick grp-pp" onClick={() => kick(m)} disabled={!!busy} aria-label={`${nm} 내보내기`}>
                      {busy === k ? "…" : <Sprite {...KICK} u={2} />}
                    </button>
                  )}
                  <span aria-hidden className="grp-av" style={{ "--c": AV[i % AV.length] }}>{initialOf(nm)}</span>
                  <span className="grp-n">{nm}</span>
                </div>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // ── 화면 셋 — 내 그룹 / 초대 미리보기 / 그룹 없음(손님 포함) ──
  let left = null, right = null, leftScroll = false;
  if (my) {
    const g = my.group || {};
    const leader = my.role === "leader";
    const editable = g.status === "open" || g.status === "rejected";
    const n = Math.max(Array.isArray(g.members) ? g.members.length : 0, Math.floor(Number(g.count) || 0));
    if (edit && leader && editable) {
      leftScroll = true;
      left = <ApplyForm v={edit} set={setEdit} onSubmit={saveEdit} label="저장" k="edit" busy={busy} onCancel={cancelEdit} />;
    } else {
      left = (
        <>
          {groupCard(g)}
          {memberBlock(g, leader && editable)}
        </>
      );
    }
    const approved = g.status === "approved";
    const gift = typeof my.giftCode === "string" ? my.giftCode : "";
    // 📌 지원하기 — 최소 인원 전이면 잠긴 모양(누르면 까닭 알림) · 기간 밖이면 잠금 글자 · 심사 중이면 「심사 중」 · 승인이면 단추 없음
    let foot = null;
    if (leader && editable) {
      const few = n < minN;
      const off = few || !!lockText;
      foot = (
        <>
          <button
            type="button"
            className={`grp-gb lg${off ? " off" : ""}`}
            aria-disabled={off || undefined}
            disabled={!!lockText || !!busy}
            onClick={() => {
              if (few) {
                sfxNo();
                pushToast?.(`최소 ${fmt(minN)}명부터 지원할 수 있습니다`);
                return;
              }
              submit();
            }}
          >
            <span className="inline-flex items-center" style={hide("submit")}>
              {off && <i className="grp-lk"><Sprite {...LOCK} u={2} /></i>}
              {lockText || "지원하기"}
            </span>
            {busy === "submit" && busyDots}
          </button>
          <div className="grp-ghosts">
            <button type="button" className="grp-ghost" onClick={() => startEdit(g)} disabled={!!busy || !!edit}>고치기</button>
            <button type="button" className="grp-ghost" onClick={disband} disabled={!!busy}>
              <span style={hide("disband")}>그룹 해체</span>
              {busy === "disband" && busyDots}
            </button>
          </div>
        </>
      );
    } else if (leader && g.status === "review") {
      foot = <button type="button" className="grp-gb lg off" disabled>심사 중</button>;
    } else if (!leader && editable) {
      foot = (
        <div className="grp-ghosts">
          <button type="button" className="grp-ghost" onClick={leave} disabled={!!busy}>
            <span style={hide("leave")}>나가기</span>
            {busy === "leave" && busyDots}
          </button>
        </div>
      );
    }
    right = (
      <>
        {prizeBox(true)}
        <div className="grp-box grp-pp flat">
          {approved ? (
            <>
              <p className="grp-bl">내 문화상품권</p>
              <div className="grp-code">
                <code>{gift || "—"}</code>
                <button type="button" className="grp-sb grp-pp" onClick={() => copy(gift, "번호를 복사했습니다")} disabled={!gift}>복사</button>
              </div>
            </>
          ) : (
            <>
              <p className="grp-bl">참여 링크</p>
              <div className="grp-code">
                <code>{g.code || "—"}</code>
                <button type="button" className="grp-sb grp-pp" onClick={() => copy(g.code ? `${window.location.origin}/level?gg=${g.code}` : "", "링크를 복사했습니다")} disabled={!g.code}>링크 복사</button>
              </div>
            </>
          )}
          <Steps status={g.status} />
          {g.status === "rejected" && String(g.reason || "").trim() && <p className="grp-why">사유: {g.reason}</p>}
        </div>
        {/* 📌 폰 내 그룹 화면 — 문화상품권 칸은 빠지지만 보너스 · 재고 주의 두 줄은 단추 위에(운영자 "주의 문구 필요" · 승인 뒤엔 없음). PC 는 위 칸에 이미 있다 */}
        {!approved && (
          <div className="grp-mnote">
            {bonusN > 0 && (
              <p className="grp-bonus">
                지원 보너스
                <span aria-hidden className="grp-mi"><ItemIcon icon="art:goedam-ticket" size={16} /></span>
                <b>추첨권 ×{fmt(bonusN)}</b>
              </p>
            )}
            <p className="grp-cau">※ 상품권이 모두 소진되면 지급되지 않습니다</p>
          </div>
        )}
        {foot && <div className="grp-foot">{foot}</div>}
      </>
    );
  } else if (invite) {
    const g = invite.group || {};
    const can = !!invite.canJoin && !guest;
    const why = guest ? "" : WHY[invite.why] || "";
    left = (
      <>
        {groupCard(g)}
        {memberBlock(g, false)}
      </>
    );
    right = (
      <>
        {prizeBox(false)}
        <div className="grp-foot">
          {guest ? (
            <button type="button" className="grp-gb lg" onClick={login}>로그인</button>
          ) : (
            <button type="button" className={`grp-gb lg${can ? "" : " off"}`} onClick={join} disabled={!can || !!busy}>
              <span className="inline-flex items-center" style={hide("join")}>
                {!can && <i className="grp-lk"><Sprite {...LOCK} u={2} /></i>}
                이 그룹에 참여
              </span>
              {busy === "join" && busyDots}
            </button>
          )}
          {!can && why && <p className="grp-note">{why}</p>}
          <div className="grp-ghosts">
            <button type="button" className="grp-ghost" onClick={cancelPeek} disabled={!!busy}>취소</button>
          </div>
        </div>
      </>
    );
  } else if (data) {
    leftScroll = true;
    left = guest ? (
      <div className="grp-form grp-pp">
        <div className="grp-msg">
          로그인 필요
          <button type="button" className="grp-gb md" onClick={login}>로그인</button>
        </div>
      </div>
    ) : <ApplyForm v={draft} set={setDraft} onSubmit={create} label="그룹 만들기" k="create" busy={busy} locked={lockText} />;
    right = (
      <>
        {prizeBox(false)}
        <form className="grp-box grp-pp" onSubmit={peekSubmit}>
          <p className="grp-bl">참여 코드</p>
          <div className="grp-code">
            <input
              className="grp-cin"
              value={codeIn}
              onChange={(e) => setCodeIn(normCode(e.target.value))}
              placeholder="코드 6자리"
              aria-label="참여 코드"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              enterKeyHint="go"
            />
            <button type="submit" className="grp-sb grp-pp" disabled={peeking || !!busy}>
              <span style={peeking ? { visibility: "hidden" } : undefined}>참여</span>
              {peeking && <span className="grp-busy">…</span>}
            </button>
          </div>
        </form>
      </>
    );
  }

  // 비었을 때 — 읽는 중 · 실패
  const body = !data ? (
    <div className="grp-main">
      {status === "error" ? (
        <div className="grp-msg">
          불러오지 못했습니다
          <button type="button" className="grp-gb md" onClick={() => { sfxTick(); setStatus("loading"); load(); }}>다시 시도</button>
        </div>
      ) : <div className="grp-msg">…</div>}
    </div>
  ) : (
    <div className="grp-main">
      <div className={`grp-l${leftScroll ? " scroll" : ""}`}>{left}</div>
      <div className="grp-r">{right}</div>
    </div>
  );

  const win = (
    <div role={embedded ? "group" : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="게임 그룹 지원" onClick={(e) => e.stopPropagation()} className={`grp-win${embedded ? " emb" : ""}`}>
      <div className="grp-wi">
        <button ref={closeRef} type="button" onClick={closeAll} aria-label="닫기" className="grp-x grp-pp">
          <Sprite {...XMARK} u={2} />
        </button>
        {/* 머리 = 괴담회 띠 배너(제목 · 기간이 그림 안에). 제목 글은 화면 읽기용으로만 */}
        <div className="grp-hd">
          <h2 className="sr-only">게임 그룹 지원</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/header.png`} alt="" width={992} height={240} draggable={false} className="grp-hdi grp-px" />
          {data?.adminPreview && (
            <div className="grp-tags">
              <span className="grp-tag grp-pp">비공개</span>
            </div>
          )}
        </div>
        {body}
      </div>
    </div>
  );
  // 이벤트 창 안 — 틀(어둠 · 크기 · 탭)은 이벤트 창이 그린다
  if (embedded) return <><style>{GG_CSS}</style>{win}</>;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={closeAll}
    >
      <style>{GG_CSS}</style>
      {win}
    </div>
  );
}
