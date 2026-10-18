"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import ItemIcon from "../components/ItemIcon";
import AvatarFrame from "../components/AvatarFrame";
import { ICON_PATHS } from "../components/Icons";
import { openLogin } from "../components/LoginPrompt";
import { FitBox, ProfileCardPreview, BadgePreview, Avatar, whoOf, badgeOfItem, useTodayXp } from "../arctic/CosmeticPreview";
import { itemTypeColor, itemTypeLabel } from "@/lib/items";
import { FRAME_OF } from "@/lib/itemEffects";
import { shortNameOf } from "@/lib/itemCategory";
import { CURRENCY_PIXEL } from "@/lib/currencyIcons";
import { playTone } from "@/lib/sfx";

// 📌 이벤트 패스 「유령 펭귄의 초대」 창 — 레벨 대시보드 카드 아래 바로가기 띠로 연다(app/level/page.js openEventPass).
//    서버는 app/api/event-pass(GET 상태 · POST claim — lib/eventPass.js). 진행도 · 받을 수 있는지는 서버가 다시 센다 — 화면은 받은 상태만 그린다.
//    시안 .claude/mockups/event-pass/이벤트패스-창-도트물결-시안.png(gen-mock3.mjs) — PC 그 자리 창 · 폰 아래 시트.
//      PC: 머리(밤 도트 장면 · EVENT PASS · 기간 · D-day · 제목 | 오른쪽 큰 유령 펭귄) → 물결 랜턴 길(칸 → 이름 → 랜턴 → Lv → 단계 XP · 받기)
//          → 아래 한 줄 판(Lv N · 단계 게이지 · 큰 「모두 받기」)
//      폰: 머리(EVENT PASS · D-day / 제목 / 기간 · 오른쪽 유령 펭귄) → 세로 랜턴 목록 → 아래 붙은 판(Lv · 게이지 · 「모두 받기」)
//    📌 2026-10-17 운영자 "아래로 키우기만 하지 말고 배열을 바꿔 · 위 LV 를 내릴 수도 있잖아" — Lv 판은 머리에서 빼 아래 판으로(PC · 폰 같이).
//       머리 오른쪽 빈자리는 큰 유령 펭귄(PC 3배 · 폰 2배)
//    📌 2026-10-17 운영자 "이벤트 전용 미션은 걍 없애자 · 기존처럼 XP만 채워도 얻을 수 있게" — 미션 없음.
//       진행도 = 이벤트 기간 안에 번 XP 하나(서버 passXp), 단계 한 줄(무료). 「모두 받기」 수 = 받을 단계 수. state.missions · bonusXp 는 읽지 않는다
//    📌 2026-10-17 도트 게임 UI — "AI 같은 그라데이션 빼라" + 그라데이션만 뺀 옛 모양도 반려 → 시안 그대로 설계부터 도트:
//       판 · 칸 · 꼬리표 · 단추 = 짙은 테 3px(#07051a) + 안쪽 단(위·왼쪽 밝게 / 아래·오른쪽 어둡게) + 계단 모서리(clip-path NOTCH · NOTCH6). 단색만.
//       CSS 그라데이션 · 흐린 빛(빛 그림자 · drop-shadow) 금지 — 점선 · 일부 채움도 요소 · SVG 사각형으로. 예외는 제목 글자 그림(title.png)에 구운 빛 하나
//       머리 장면이 창 바탕으로 녹는 것도 CSS 겹이 아니라 그림 안 바둑판 디더(scripts/gen-event-pass-art.mjs)
//    📌 켜진 길 · Lv 게이지 색 = 유령 펭귄 꼬리 색(운영자 "꼬리 색상을 따라가야지") — 길 세 줄 #eafcff / #72c3e6 / #2a5f9e, 게이지 #b4ecf9 · 위 #eafcff · 아래 #3f86c4
//    📌 받음 표시는 둥근 도트 배지(CHECK — 가는 선 체크는 "밤티"로 반려). 칸 장식(반짝이 · 배지 · 자물쇠 · 기간 꼬리표)은 계단 모서리에 안 잘리게 칸 바깥 감싸개(.ep-ms)에 단다
//    📌 운영자 — 창 안 유령 펭귄은 위아래로 천천히 떠 있고(3초 · 정수 px 단계), 랜턴 불은 칸이 바뀌며 살짝 깜빡인다. 움직임 줄이기 설정이면 둘 다 멈춘다
//    📌 2026-10-18 운영자 "패스업까지 XP 필요한 정도만 표기해야지 누적으로 표기해버리는 부담감이 오잖아" · "다음 레벨업까지 필요한 정도만" —
//       누적 XP(번 XP 합 · 마지막 단계 누적)는 창에 찍지 않는다. 아래 판 = 지금 단계 안 진행("3,400 / 8,000 XP") + 남은 양("Lv 8까지 4,600 XP"),
//       게이지 = 지금 단계 안 비율(10칸 도트 막대). 랜턴 아래 · 폰 줄의 필요 XP 도 단계 몫(그 단계 need − 앞 단계 need). 다 채우면 「모두 달성」 · 꽉 찬 게이지.
//       Lv 뒤 「/ 20」도 뺐다 — 남은 단계 수를 늘 보이는 것도 같은 부담이라(단계 수는 랜턴 길이 보여 준다)
//    📌 2026-10-18 보상 칸 — 운영자 "호박불 랜턴 · 30일 이렇게 표시하지 말라는 거임 · 방식을 바꾸라는 거다" · "아이템 효과가 뭔지를 알아야" ·
//       "보상이 여러 개면.. ㅎㅎ;" · "미리보기 가능하게" · "'배지' 이따위로 표기하지 말고 카테고리는 카테고리답게":
//       · 이름은 이름만(기간 꼬리 · 분류 머리말 없음). 기간제는 칸 왼쪽 아래 도트 꼬리표(시계 + "30일" — DurTag), 무기한은 꼬리표 없음
//       · 보상마다 제 칸(Cluster) — PC 하나 96 · 둘 60 나란히 · 셋 · 넷 48 의 2 × 2, 폰 하나 50 · 여럿 42 한 줄. 단계 상태 장식은 묶음에 한 벌,
//         일부만 받은 단계는 받은 칸에만 배지. 칸 밑 이름은 하나면 그 이름, 여럿이면 「보상 N개」
//       · 칸에 마우스를 올리면(PC) · 누르면(폰 · PC 고정) 그 자리 말풍선(Tip) — 단계의 보상 전부: 그림 · 분류 칩(상점 칩과 같은 글자 · 유형 색) · 기간 꼬리표 · 이름 ·
//         효과 문장(서버 effectLines — 인벤토리와 같은 itemEffectLines). 칸을 눌러도 받지 않는다 — 받기는 「받기」 · 「모두 받기」 단추만
//       · 꾸미기 보상은 말풍선 「미리보기」 → 창 위에 겹치는 도트 판(EpPreview — 상점 상세 · 시즌 패스와 같은 부품 app/arctic/CosmeticPreview)
//    틀은 PopShell 과 같은 문법(fixed inset-0 z-[120] 오버레이 — 전역 ScrollLock · 닫기 단추 포커스 · Esc · 폰 아래 시트)이지만,
//    머리가 도트 장면이라 시즌 패스 창(PassModal)처럼 여기서 직접 짠다(PopShell 은 글자 머리 · 단색 테마 판이 고정)

const API = "/api/event-pass";
const ART = "/event-pass"; // public/event-pass — scripts/gen-event-pass-art.mjs 가 찍는다
const DAY = 86400000;
// 📌 폰 판 기준 — 시즌 패스 창(PASS_NARROW_MQ)과 같은 sm 경계
const NARROW_MQ = "(max-width: 639.98px)";
const subNarrow = (cb) => {
  const mq = window.matchMedia(NARROW_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);

// 그림 치수(칸 1px 그림을 정수 배율로 키운다) — 유령 펭귄 41 × 53 · 랜턴 7 × 11
const SPEC = { w: 41, h: 53 };
const LT = { w: 7, h: 11 };
// 📌 제목 그림 — 88px 송명으로 찍은 글자(테 포함) 영역 601 × 86 · 둘레 여백 32(빛 · 그림자 자리). 그림을 다시 찍으면 스크립트가 찍어 준 값으로.
//    크기는 CSS 변수 --k(= 글자 크기 / 88)로 — PC 0.7068(그림 폭 470 · 좁은 창 0.55) · 폰 0.4 / 0.36 / 0.3(좁을수록 작게, 유령 펭귄 자리를 비운다)
const TITLE_ART = { src: `${ART}/title.png`, w: 601, h: 86, pad: 32, size: 88, text: "유령 펭귄의 초대" };

// 랜턴 길(PC) — 시안 gen-mock3.mjs 값 그대로. 칸 가운데 사이 150 · 첫 칸 가운데 102 · 앞뒤 길 72 · 물결 ±24(3px 격자)
const COLW = 150;
const X0 = 102;
const LEAD = 72;
const TAIL = 106; // 끝 길 — 다 채우면 유령 펭귄이 이 길 끝(마지막 랜턴 · 글자 오른쪽)에 선다
const PAD_R = 136; // 마지막 칸 가운데에서 길 판 오른쪽 끝까지(끝 길 + 여유)
const AMP = 24;
const SLOT = 96;
const LT_S = 5; // 길 위 랜턴 배율(35 × 55)
const NM_B = SLOT + 12 + 17; // 기둥 위에서 이름 줄 아래 끝까지 — 칸 · 이름(위 12 · 높이 17)
const LT_C = NM_B + 12 + 30; // 기둥 위에서 길 높이까지 — 이름 아래 · 랜턴(위 12) 안 30(시안 LANT)
const LANE_H = 336; // 기둥이 가장 내려간 끝(위 63 + 칸 ~ 받기 249) + 여유
const snap3 = (v) => Math.round(v / 3) * 3;
const wy = (i) => snap3(Math.sin(i * 1.05) * AMP);
const colTop = (i) => 18 + AMP + wy(i);
// 📌 길 위 유령 펭귄 — 2026-10-18 운영자 "이건 해결이 필요하지 않을까.." : 2배(82 × 106)가 칸 사이에서 다음 칸 이름(「유령 펭귄…」) · 칸 · 꼬리표 · Lv 글자를 덮었다.
//    1배(41 × 53 — 정수 배율이라야 도트 한 칸이 고르다. 2배는 칸 사이 150 에 랜턴 35 와 같이 못 들어간다. 큰 유령 펭귄은 머리 3배)로 줄이고 자리 규칙을 바꿨다:
//    · 가로 — 랜턴 두 개 사이 빈 틈 안에서만: 단계 안 비율을 [앞 랜턴 오른쪽 + 여백 + 반폭, 다음 랜턴 왼쪽 − 여백 − 반폭]에 옮긴다.
//      첫 단계 전은 앞 길(첫 랜턴 왼쪽까지) · 다 채우면 끝 길 끝. 켜진 길은 유령 펭귄 가운데까지(불을 들고 지나간 자리)
//    · 세로 — 길(pathY)에 랜턴처럼 꿴다(길 가운데가 그림 위에서 ME_K — 유령 펭귄이 든 등불 언저리). 다만 가로로 겹치는 기둥의
//      위 띠(칸 묶음 · 반짝이 · 배지 · 기간 꼬리표 · 이름 줄 — 반폭 ME_BAND)보다 아래로 내린다. 떠 있는 높이(ME_FL)까지 넣어서 여백 ME_M.
//      내려가도 아래 끝은 이웃 기둥의 단계 XP · 받기 줄(기둥 위 219~)보다 위 — 높이 차가 가장 큰 이웃(21)에서도 13px 남는다
const ME = { w: SPEC.w, h: SPEC.h };
const ME_FL = 4; // 떠 있는 높이 — epFloat 가 위로 4px(정수 px 단계)
const ME_M = 3; // 랜턴 · 글자 · 칸과 띄우는 여백
const ME_K = 35; // 그림 위에서 길 가운데까지(같은 높이 기둥 사이면 이름 줄 아래 여백 + 떠 있기와 딱 맞는 값)
const ME_BAND = 76; // 기둥 위 띠 반폭 — 둘 묶음(126)의 반 63 + 칸 밖으로 나온 배지 10 + 여유 3(이름 줄 132 의 반 66 보다 넓다)
// 📌 게이지 — 지금 단계 안 비율을 10칸 도트 막대로(칸 수 고정 — 단계 수와 상관없이 같은 모양). 걸친 칸은 자식 요소 폭만큼만
const BLOCKS = 10;
// 미리보기 테두리 칸 안 사진 지름 — 상점 적용 미리보기(AppliedPreview FRAME_TILE)와 같은 값(테두리 그림이 칸에 들어가는 크기)
const FRAME_TILE = 30;

// 📌 보상 칸 묶음 치수 — 그림은 16칸 도트의 정수 배(64 · 32)라야 도트 칸 폭이 고르다.
//    PC: 하나 96(그림 64) · 둘 60 두 칸 나란히(126 × 96 가운데) · 셋 · 넷 48 의 2 × 2(사이 3 — 99, 위로 3 올려 96 자리에 맞춘다 · 셋째는 아래 가운데)
//    폰: 하나 50(그림 32) · 여럿 42 한 줄(사이 3 — 넷이면 177, 320 폭 폰에서도 「받기」와 한 줄)
//    묶음 높이는 PC 96 그대로 — 그 아래 이름 · 랜턴 · Lv 가 길(LT_C)에 맞물려 있다
const clusterOf = (n, narrow) => {
  if (narrow) {
    if (n <= 1) return { w: 50, h: 50, s: 50, icon: 32, pos: [[0, 0]] };
    const s = 42;
    return { w: n * s + (n - 1) * 3, h: s, s, icon: 32, pos: Array.from({ length: n }, (_, i) => [i * (s + 3), 0]) };
  }
  if (n <= 1) return { w: SLOT, h: SLOT, s: SLOT, icon: 64, pos: [[0, 0]] };
  if (n === 2) return { w: 126, h: SLOT, s: 60, icon: 32, pos: [[0, 18], [66, 18]] };
  const s = 48, o = s + 3;
  return { w: s + o, h: s + o, s, icon: 32, top: -3, pos: n === 3 ? [[0, 0], [o, 0], [Math.floor((s + o - s) / 2), o]] : [[0, 0], [o, 0], [0, o], [o, o]] };
};

// 📌 색 — 단색만. 창 바탕(panel)은 scripts/gen-event-pass-art.mjs PANEL 과 같은 값(머리 그림 아래 끝이 이 색으로 녹는다)
const EP = { panel: "#0f0b24", ink: "#07051a", text: "#f1ecff", sub: "#8f88c8", mute: "#6f68a0", cyan: "#9ff8ff" };
// 계단 모서리 — 3px 한 단 · 6px 두 단 · 위만(폰 시트)
const NOTCH = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,3px calc(100% - 3px),0 calc(100% - 3px),0 3px,3px 3px)";
const NOTCH6 = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px,6px 3px)";
const NOTCH_TOP = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% 100%,0 100%,0 3px,3px 3px)";
const NOTCH6_TOP = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% 100%,0 100%,0 6px,3px 6px,3px 3px,6px 3px)";
// 폰 세로 점선 — 3 × 9 칸에 3 × 3 점 하나(그라데이션 대신 SVG 타일)
const VDOT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='3' height='9'%3E%3Crect width='3' height='3' fill='%233a3170'/%3E%3C/svg%3E")`;

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
// KST 날짜 "10. 18." — 끝은 들어가지 않으므로(11. 1. 00:00) 1ms 빼서 마지막 날로
const kstDay = (iso, endExclusive = false) => {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - (endExclusive ? 1 : 0) + 9 * 3600000);
  return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.`;
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ── 보상 표기 — 이름은 이름만 · 기간은 꼬리표 · 분류는 칩(위 📌 2026-10-18). 서버가 shortName · categoryLabel 을 싣는다(lib/eventPass.js), 없던 응답이면 이름에서 떼어 ──
const daysOf = (r) => (r?.kind === "item" ? Math.max(0, Math.floor(Number(r.days) || 0)) : 0);
const nameOf = (r) => {
  if (!r) return "";
  if (r.kind === "xp" || r.kind === "point") return r.label || r.short || "";
  if (r.kind === "role") return r.shortName || r.roleName || itemTypeLabel("role");
  return r.shortName || shortNameOf(r.itemName || "") || itemTypeLabel(r.itemType || "item");
};
// 분류 칩 글자 · 색 — 상점 카드 칩(app/arctic/ProductCard TypeBadge — 분류 글자 · 유형 색)과 같은 값. 재화(XP · 빙옥)는 칩 없음(이름이 곧 양)
const kindOf = (r) => (r?.kind === "item" ? r.categoryLabel || itemTypeLabel(r.itemType || "item") : r?.kind === "role" ? r.categoryLabel || itemTypeLabel("role") : "");
const kindColorOf = (r) => itemTypeColor(r?.kind === "role" ? "role" : r?.itemType || "item");
// 칸 밑 이름 — 하나면 그 이름, 여럿이면 「보상 N개」
const capOf = (rewards) => (!rewards.length ? "—" : rewards.length === 1 ? nameOf(rewards[0]) : `보상 ${rewards.length}개`);
// 읽어 주는 이름(aria) — 기간제는 이름 뒤 "30일"
const namesOf = (t) => t.rewards.map((r) => `${nameOf(r)}${daysOf(r) ? ` ${fmt(daysOf(r))}일` : ""}`).filter(Boolean).join(", ");
// 꾸미기 미리보기 재료 — 시즌 패스 passCosmeticOf(app/level/PassPreview)와 같은 기준(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)
const cosOf = (r) => {
  const c = r?.cosmetic;
  return c && typeof c === "object" && (c.skin || c.scene || c.frame || c.badge) ? c : null;
};
// 받은 것 알림 — 서버 labels(rewardLabel — "아이템 · 이름 · 7일")를 그 단계 보상과 짝지어 이름만. 짝이 없으면(옛 응답 · 연 뒤 관리자가 보상을 바꿈)
//    머리말 · 기간 꼬리를 떼고 이름 안 분류 머리말(「배지 · 」 등)도 shortNameOf 로 뗀다 — 알림에 분류 맨 글자가 남지 않게
const plainLabel = (l) => shortNameOf(String(l || "").replace(/^(아이템|역할) · /, "").replace(/ · [\d,]+일$/, ""));
const gotNames = (claimed, tiers) =>
  claimed.flatMap((c) => {
    const labels = Array.isArray(c?.labels) ? c.labels : [];
    const t = tiers.find((x) => x.tid === c?.ref);
    const pool = [...labels];
    const names = t
      ? t.rewards
          .filter((r) => {
            const k = pool.indexOf(r.label);
            if (k < 0) return false;
            pool.splice(k, 1);
            return true;
          })
          .map(nameOf)
      : [];
    return names.length ? names : labels.map(plainLabel);
  });
// 받은 것 알림 — 길면 앞 둘 + 외 N개
const gotText = (labels) => {
  if (!labels.length) return "보상 수령";
  return labels.length <= 3 ? `${labels.join(" · ")} 수령` : `${labels.slice(0, 2).join(" · ")} 외 ${labels.length - 2}개 수령`;
};
// 칩 단 색 — 유형 색을 흰색 · 검정 쪽으로(위 밝은 단 · 아래 어두운 단)
const mixHex = (hex, to, t) => {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || "")) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex), b = p(to);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};

// ── 단계 셈 — 숫자는 지금 단계 안에서만(위 📌 2026-10-18) ──
// 단계 i 의 필요량 = need − 앞 단계 need(관리 화면 표와 같은 값). 같은 need 가 겹친 단계는 0
const stepOf = (tiers, i) => Math.max(0, (Number(tiers[i]?.need) || 0) - (i > 0 ? Number(tiers[i - 1]?.need) || 0 : 0));
// 지금 단계 — prev = 마지막으로 닿은 단계 need(없으면 0), next = 서버 next(level · need · left). 다 닿았으면(next 없음) done
//    필요량이 0 인 단계(나눗셈)는 꽉 찬 것으로
const stepProg = (tiers, passXp, next) => {
  if (!next) return { done: true, ratio: 1 };
  const prev = tiers.reduce((m, t) => (passXp >= t.need ? Math.max(m, Number(t.need) || 0) : m), 0);
  const step = Math.max(0, (Number(next.need) || 0) - prev);
  const inStep = Math.max(0, Math.min(step, passXp - prev));
  const left = Number.isFinite(Number(next.left)) ? Math.max(0, Number(next.left)) : step - inStep;
  return { done: false, level: next.level, step, inStep, left, ratio: step > 0 ? inStep / step : 1 };
};

// ── 효과음 — 같은 playTone 어휘. 받기는 시즌 패스 수령과 같은 오름 넷, 거절은 낮게 하나, 말풍선 고정 · 미리보기는 짧은 틱 ──
const sfxGet = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => playTone(f, 0.16, "triangle", 0.05), i * 110));
const sfxNo = () => playTone(330, 0.12, "sine", 0.03);
const sfxTick = () => playTone(660, 0.05, "sine", 0.025);

// ── 랜턴 길 — 3px 격자에 찍는 도트 길. 랜턴 사이는 부드러운 계단(smoothstep)으로 오르내린다(시안 pathY 그대로) ──
//    켜진 곳(지금 진행까지)은 꼬리 색 세 줄, 나머지는 9px 마다 점 하나. 같은 높이로 이어지는 켜진 칸은 사각형 하나로 합친다
//    (누적 need · passXp 는 진행 자리 계산에만 쓴다 — 화면 글자로는 찍지 않는다)
const laneGeom = (tiers, passXp, level) => {
  const n = tiers.length;
  if (!n) return null;
  const xs = tiers.map((_, i) => X0 + i * COLW);
  const ys = tiers.map((_, i) => colTop(i) + LT_C);
  const lastX = xs[n - 1];
  const pathY = (x) => {
    if (n === 1) return ys[0];
    const i = Math.max(0, Math.min(n - 2, Math.floor((x - X0) / COLW)));
    const t = clamp01((x - xs[i]) / COLW);
    return ys[i] + (ys[i + 1] - ys[i]) * t * t * (3 - 2 * t);
  };
  // 📌 진행 자리(위 ME 📌) — 첫 단계 전이면 앞 길(첫 랜턴 앞까지) · 단계 사이면 두 랜턴 사이 틈 · 다 채웠으면 끝까지 켜고 끝 길 끝
  const meHalf = ME.w / 2;
  const reach = (LT.w * LT_S) / 2 + ME_M + meHalf; // 랜턴 가운데에서 유령 펭귄 가운데까지 가장 가까운 거리
  let prog, meX;
  if (level <= 0) {
    const a = X0 - LEAD, b = X0 - reach;
    prog = meX = a + (b - a) * clamp01(passXp / Math.max(1, tiers[0].need));
  } else if (level >= n) {
    prog = Infinity;
    meX = lastX + TAIL - meHalf - ME_M;
  } else {
    const lo = tiers[level - 1].need, hi = tiers[level].need;
    const a = xs[level - 1] + reach, b = xs[level] - reach;
    prog = meX = a + (b - a) * clamp01((passXp - lo) / Math.max(1, hi - lo));
  }
  // 높이 — 길에 꿰되, 가로로 겹치는 기둥 위 띠(칸 · 장식 · 이름) 아래 끝 + 여백 + 떠 있기보다 위로는 안 간다
  const meL = Math.round(meX - meHalf);
  let meT = Math.round(pathY(meL + meHalf)) - ME_K;
  xs.forEach((cx, i) => {
    if (meL - ME_M < cx + ME_BAND && meL + ME.w + ME_M > cx - ME_BAND) meT = Math.max(meT, colTop(i) + NM_B + ME_M + ME_FL);
  });
  const lit = [], dots = [];
  let run = null;
  for (let x = X0 - LEAD; x < lastX + TAIL; x += 3) {
    const y = snap3(pathY(x));
    if (x < prog) {
      if (run && run.y === y && run.x + run.w === x) run.w += 3;
      else lit.push((run = { x, y, w: 3 }));
    } else if (((((x - X0) / 3) % 3) + 3) % 3 === 0) dots.push({ x, y });
  }
  return { lit, dots, me: { x: meX, l: meL, t: meT }, width: lastX + PAD_R };
};

// ── 창 CSS — 단색 · 도트 테만(그라데이션 · 흐린 빛 금지). 움직임은 유령 펭귄 떠 있기 · 랜턴 깜빡임 · 창 열림 셋 ──
const EP_CSS = `
@keyframes epIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes epFloat { 0%, 100% { transform: translateY(0); } 12.5%, 87.5% { transform: translateY(-1px); } 25%, 75% { transform: translateY(-2px); } 37.5%, 62.5% { transform: translateY(-3px); } 50% { transform: translateY(-4px); } }
@keyframes epFloat3 { 0%, 100% { transform: translateY(0); } 25%, 75% { transform: translateY(-3px); } 50% { transform: translateY(-6px); } }
@keyframes epFlick { 0%, 100% { opacity: 0; } 9% { opacity: 1; } 15% { opacity: 0; } 41% { opacity: 1; } 44% { opacity: 0; } 68% { opacity: 1; } 77% { opacity: 0; } }
.ep-win { position: relative; width: 100%; height: 88vh; height: 88dvh; padding: 3px 3px 0; background: ${EP.ink}; clip-path: ${NOTCH6_TOP}; animation: epIn .32s cubic-bezier(0.16,1,0.3,1); color: ${EP.text}; }
.ep-wi { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: ${EP.panel}; clip-path: ${NOTCH_TOP}; }
.ep-wi::after, .ep-pvi::after { content: ""; position: absolute; inset: 0; z-index: 40; pointer-events: none; box-shadow: inset 3px 3px 0 #2c2468, inset -3px 0 0 #0b0822; }
@media (min-width: 640px) {
  .ep-win { max-width: 1100px; height: auto; padding: 3px; clip-path: ${NOTCH6}; }
  .ep-wi { height: auto; max-height: calc(min(760px, 94vh) - 6px); clip-path: ${NOTCH}; }
  .ep-wi::after, .ep-pvi::after { box-shadow: inset 3px 3px 0 #2c2468, inset -3px -3px 0 #0b0822; }
}
.ep-wi *, .ep-wi *::before, .ep-wi *::after, .ep-pv *, .ep-pv *::before, .ep-pv *::after { box-sizing: border-box; }
.ep-px { image-rendering: pixelated; }
/* 📌 떠 있기는 정수 px 단계로만(반 픽셀이면 도트 테가 흐려진다) — 3배 큰 유령 펭귄은 도트 한 칸(3px)씩 */
.ep-float { animation: epFloat 3s steps(1, end) infinite; }
.ep-float.x3 { animation-name: epFloat3; }
.ep-flick { animation: epFlick 2.8s steps(1, end) infinite; opacity: 0; }
.ep-pp { border: 3px solid ${EP.ink}; background: var(--bg, #17123a); box-shadow: inset 3px 3px 0 var(--hi, #2c2468), inset -3px -3px 0 var(--sh, #0d0a26); clip-path: ${NOTCH}; }
.ep-scroll { position: relative; flex: 1 1 0%; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; }
.ep-scroll::-webkit-scrollbar, .ep-track::-webkit-scrollbar, .ep-mbody::-webkit-scrollbar, .ep-tip::-webkit-scrollbar, .ep-pvb::-webkit-scrollbar { display: none; }
.ep-art { position: absolute; left: 0; right: 0; top: 0; height: 256px; background-repeat: no-repeat; background-position: center top; image-rendering: pixelated; pointer-events: none; }
.ep-grab { position: absolute; z-index: 20; left: 50%; top: 9px; width: 36px; height: 6px; margin-left: -18px; background: #3a3186; }
.ep-x { position: absolute; z-index: 30; right: 12px; top: 14px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; --bg: #221a52; --hi: #3a3186; --sh: #120e30; outline: none; cursor: pointer; }
.ep-x:hover { --bg: #2c2468; }
.ep-x:focus-visible { border-color: ${EP.cyan}; }
@media (min-width: 640px) { .ep-x { right: 18px; top: 18px; width: 36px; height: 36px; } }
.ep-row { display: flex; align-items: center; flex-wrap: wrap; }
.ep-row > * { margin-right: 9px; }
.ep-row > *:last-child { margin-right: 0; }
.ep-lab { font-size: 12px; font-weight: 900; letter-spacing: .32em; color: #fff; white-space: nowrap; }
.ep-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; font-size: 12px; font-weight: 700; color: ${EP.text}; white-space: nowrap; font-variant-numeric: tabular-nums; --bg: #0f0b28; --hi: #241d58; --sh: ${EP.ink}; }
.ep-dd { padding: 0 8px; font-weight: 900; color: #2a1006; --bg: #ff8a3d; --hi: #ffc08a; --sh: #b4521b; }
.ep-dd.end, .ep-off { color: rgba(241,236,255,.6); --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
.ep-off { padding: 0 8px; font-size: 11px; font-weight: 900; }
.ep-h2 { margin: calc(2px - 32px * var(--k)) calc(-32px * var(--k)) calc(-32px * var(--k)); }
.ep-h2 img { display: block; width: calc(665px * var(--k)); height: calc(150px * var(--k)); }
.ep-h2.txt { margin: 4px 0 0; font-size: calc(88px * var(--k)); font-weight: 900; line-height: 1.1; color: #f3efff; text-shadow: 0 3px 0 #0b0618; overflow-wrap: anywhere; }
/* PC 머리 — 왼쪽 글 덩어리 · 오른쪽 큰 유령 펭귄(Lv 판 없음). 제목 그림은 시안처럼 둘레 여백 위쪽을 살려 줄과 띄운다 */
.ep-hd { position: relative; padding: 34px 40px 0; --k: .7068; }
.ep-hd .ep-ttl { position: relative; z-index: 1; max-width: calc(100% - 250px); }
.ep-hd .ep-h2:not(.txt) { margin-top: 4px; margin-bottom: 0; }
.ep-hero { position: absolute; right: 120px; top: 18px; }
@media (max-width: 959.98px) {
  .ep-hd { --k: .55; }
  .ep-hd .ep-ttl { max-width: calc(100% - 150px); }
  .ep-hero { right: 66px; top: 30px; width: ${SPEC.w * 2}px !important; height: ${SPEC.h * 2}px !important; animation-name: epFloat !important; }
}
/* 물결 랜턴 길 */
.ep-track { position: relative; margin-top: -6px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.ep-lane { position: relative; height: ${LANE_H}px; margin: 0 auto; }
.ep-rope { position: absolute; left: 0; top: 0; pointer-events: none; }
.ep-col { position: absolute; width: 132px; text-align: center; }
.ep-col p { margin: 0; }
/* 📌 보상 칸 묶음(.ep-sw) — 크기는 묶음 치수(clusterOf)가 인라인으로. 칸 하나(.ep-ms)마다 제 테 · 장식. 누르면 말풍선(받지 않는다) */
.ep-sw { position: relative; width: ${SLOT}px; height: ${SLOT}px; margin: 0 auto; cursor: pointer; outline: none; -webkit-tap-highlight-color: transparent; }
.ep-sw:focus-visible .ep-slot { border-color: ${EP.cyan}; }
.ep-col .ep-sw { z-index: 4; } /* 📌 칸 묶음도 길 위 유령 펭귄(z 3)보다 위 — 둘 · 넷 묶음은 폭이 넓어 지나가는 유령 펭귄이 칸 · 기간 꼬리표를 가렸다 */
.ep-ms { position: absolute; }
.ep-slot { position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; --bg: #201a4c; --hi: #3a3186; --sh: #120e30; }
.ep-sw.ready .ep-slot { --bg: #4a3010; --hi: #ffd27a; --sh: #a8701e; }
.ep-sw.done .ep-slot, .ep-ms.got .ep-slot, .ep-tic.got .ep-slot { --bg: #16112f; --hi: #241d4f; --sh: #0d0a26; }
.ep-sw.lock .ep-slot { --bg: #130f2c; --hi: #1e1844; --sh: #0b0822; }
.ep-ico { display: flex; line-height: 0; }
.ep-sw.done .ep-ico, .ep-ms.got .ep-ico, .ep-tic.got .ep-ico { opacity: .35; }
.ep-sw.lock .ep-ico { opacity: .5; filter: grayscale(.6); }
.ep-sw.miss .ep-ico { opacity: .5; }
.ep-sp, .ep-ck, .ep-lk { position: absolute; line-height: 0; pointer-events: none; }
.ep-sp { z-index: 3; }
.ep-sp.a { left: -9px; top: -9px; }
.ep-sp.b { right: -9px; bottom: -9px; }
.ep-ck { z-index: 3; right: -10px; top: -10px; }
.ep-lk { right: 6px; bottom: 6px; }
.ep-ms.sm .ep-sp.a { left: -6px; top: -6px; }
.ep-ms.sm .ep-sp.b { right: -6px; bottom: -6px; }
.ep-ms.sm .ep-ck { right: -7px; top: -7px; }
.ep-ms.sm .ep-lk { right: 4px; bottom: 4px; }
/* 📌 기간 꼬리표 — 칸 왼쪽 아래 모서리에 걸친 짙은 도트 꼬리표(시계 도트 + "30일"). 무기한은 없음. 큰 칸(96)은 한 단계 크게 */
.ep-dur { position: absolute; z-index: 2; left: -3px; bottom: -3px; display: inline-flex; align-items: center; height: 14px; padding: 0 4px 0 3px; background: ${EP.ink}; color: #ffd27a; clip-path: ${NOTCH}; pointer-events: none; white-space: nowrap; }
.ep-dur svg { margin-right: 2px; }
.ep-dur b { font-size: 9.5px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.ep-ms.lg .ep-dur { left: -6px; bottom: -6px; height: 18px; padding: 0 5px 0 4px; }
.ep-ms.lg .ep-dur svg { margin-right: 3px; }
.ep-ms.lg .ep-dur b { font-size: 11px; }
.ep-dur.in { position: relative; left: auto; bottom: auto; height: 24px; padding: 0 8px 0 6px; }
.ep-dur.in svg { margin-right: 4px; }
.ep-dur.in b { font-size: 11.5px; }
.ep-col .ep-nm { margin-top: 12px; height: 17px; line-height: 17px; font-size: 13.5px; font-weight: 700; color: #d8d2f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-col.dim .ep-nm { color: ${EP.mute}; }
.ep-col .ep-nm, .ep-col .ep-lvl, .ep-col .ep-nd { position: relative; z-index: 4; } /* 📌 글자는 길 위 유령 펭귄(z 3)보다 위 — 첫 단계 전 · 다 채움 · 칸 사이에서 이름을 가리지 않게 */
.ep-col .ep-lt { margin: 12px auto 0; }
.ep-col .ep-lvl { margin-top: 8px; line-height: 16px; font-size: 13px; font-weight: 900; color: #fff; }
.ep-col.lock .ep-lvl { color: ${EP.mute}; }
.ep-col .ep-nd { margin-top: 4px; line-height: 15px; font-size: 12px; font-weight: 700; color: #5d5790; font-variant-numeric: tabular-nums; }
.ep-me { position: absolute; z-index: 3; pointer-events: none; }
/* 금색 도트 단추 */
.ep-gb { position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: #e2b04a; color: #2a1606; font-weight: 900; white-space: nowrap; border: 3px solid ${EP.ink}; box-shadow: inset 0 3px 0 #ffe08a, inset 0 -4px 0 #9c6a22; clip-path: ${NOTCH}; outline: none; cursor: pointer; }
.ep-gb:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 2px 0 #ffe08a, inset 0 -2px 0 #9c6a22; }
.ep-gb:focus-visible { border-color: #fff; }
.ep-gb:disabled { cursor: default; }
.ep-gb.sm { height: 27px; padding: 0 10px 2px; font-size: 11.5px; }
.ep-col .ep-gb.sm { margin-top: 6px; }
.ep-gb.md { height: 34px; padding: 0 16px 2px; font-size: 12.5px; }
.ep-all { height: 56px; padding: 0 26px 3px; font-size: 17px; }
.ep-all.off { background: #2a2458; color: rgba(241,236,255,.4); box-shadow: inset 0 3px 0 #3a3186, inset 0 -4px 0 #17133a; }
.ep-n { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; padding: 0 6px; margin-left: 8px; background: #2a1606; color: #ffe08a; font-size: 12px; font-variant-numeric: tabular-nums; clip-path: ${NOTCH}; }
.ep-all.off .ep-n { background: #17133a; color: rgba(241,236,255,.4); }
.ep-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
/* 보라 도트 단추(미리보기) — 받기(금색)와 갈라 둔다 */
.ep-sb { display: inline-flex; align-items: center; height: 27px; padding: 0 10px 2px; font-size: 11.5px; font-weight: 900; color: ${EP.text}; white-space: nowrap; outline: none; cursor: pointer; --bg: #2c2468; --hi: #4a3fa0; --sh: #17133a; }
.ep-sb:hover { --bg: #3a3186; }
.ep-sb:active { transform: translateY(2px); }
.ep-sb:focus-visible { border-color: ${EP.cyan}; }
/* 📌 Lv 게이지 — 지금 단계 안 비율 10칸(꼬리 색). 걸친 칸은 자식 요소 폭만큼만(그라데이션 없이) */
.ep-gauge { display: flex; height: 15px; padding: 3px; background: ${EP.ink}; }
.ep-gauge > i { position: relative; display: block; flex: 1 1 0%; min-width: 0; background: #241d4f; }
.ep-gauge > i + i { margin-left: 3px; }
.ep-gauge > i.on, .ep-gauge > i > b { background: #b4ecf9; box-shadow: inset 0 3px 0 #eafcff, inset 0 -3px 0 #3f86c4; }
.ep-gauge > i > b { position: absolute; left: 0; top: 0; bottom: 0; transition: width .9s cubic-bezier(0.16,1,0.3,1); }
/* PC 아래 판 — [Lv N] [게이지 + 단계 줄] [모두 받기] 한 줄 */
.ep-ft { flex: none; padding: 12px 24px 24px; background: ${EP.panel}; }
.ep-bar { display: flex; align-items: center; padding: 14px 16px 14px 22px; --bg: #120e2e; --hi: #2c2468; --sh: #0b0822; }
.ep-bl { flex: none; display: flex; align-items: baseline; margin-right: 22px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ep-bl b { font-size: 34px; font-weight: 900; line-height: 1; letter-spacing: -.02em; }
.ep-bg { flex: 1 1 0%; min-width: 0; margin-right: 22px; }
.ep-bg .ep-gauge { height: 18px; }
.ep-bt { display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; font-weight: 700; color: ${EP.sub}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ep-bt > span + span { min-width: 0; margin-left: 12px; overflow: hidden; text-overflow: ellipsis; }
.ep-bt em, .ep-pl em { font-style: normal; color: #fff; }
.ep-bt em.c, .ep-pl em.c { color: #b4ecf9; }
.ep-bar .ep-all { flex: none; }
.ep-empty { position: relative; padding: 56px 20px 40px; text-align: center; font-size: 13px; font-weight: 700; color: rgba(241,236,255,.55); }
.ep-empty .ep-gb { margin-top: 14px; }
/* 폰 머리 — EVENT PASS · D-day / 제목 / 기간, 유령 펭귄(2배)은 닫기 단추 왼쪽 */
.ep-mhd { position: relative; padding: 27px 18px 0; --k: .4; }
.ep-mhd .ep-spec { position: absolute; right: 50px; top: 16px; }
.ep-mhd .ep-row, .ep-mhd .ep-h2 { position: relative; }
@media (max-width: 379.98px) { .ep-mhd { --k: .36; } .ep-mhd .ep-spec { right: 46px; } }
@media (max-width: 359.98px) { .ep-mhd { --k: .3; } .ep-mhd .ep-spec { right: 42px; } }
.ep-scroll-m { display: flex; flex-direction: column; overflow-y: hidden; }
.ep-scroll-m > .ep-mhd, .ep-scroll-m > .ep-empty { flex: none; }
.ep-mbody { position: relative; flex: 1 1 0%; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; }
@media (max-height: 600px) { .ep-scroll-m { display: block; overflow-y: auto; } .ep-mbody { overflow: visible; } }
.ep-vlist { position: relative; padding: 12px 18px 16px; }
.ep-vline { position: absolute; left: 34px; width: 3px; top: 45px; bottom: 49px; background: ${VDOT} repeat-y; }
.ep-vr { position: relative; display: flex; align-items: center; height: 66px; }
.ep-vl { position: relative; z-index: 1; flex: none; display: flex; justify-content: center; align-items: flex-start; width: 35px; height: 34px; }
.ep-vr .ep-sw { flex: none; width: 50px; height: 50px; margin: 0 0 0 13px; }
.ep-vr .ep-ck { right: -9px; top: -9px; }
.ep-vr .ep-lk { right: 4px; bottom: 4px; }
.ep-vr .ep-sp.a { left: -8px; top: -8px; }
.ep-vx { flex: 1 1 0%; min-width: 0; margin-left: 12px; }
.ep-vx p { margin: 0; font-size: 13.5px; font-weight: 700; color: ${EP.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-vx span { display: block; margin-top: 2px; font-size: 11px; font-weight: 700; color: ${EP.sub}; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-vr.dim .ep-vx p { color: ${EP.mute}; }
.ep-vr .ep-gb { flex: none; margin-left: 10px; }
/* 📌 폰 여러 보상 줄 — 위 칸 한 줄(42 × N) · 아래 「보상 N개 · Lv · 단계 XP」 한 줄. 받기는 오른쪽 가운데 그대로 */
.ep-vr.multi { height: auto; min-height: 66px; padding: 9px 0; }
.ep-vm { flex: 1 1 0%; min-width: 0; margin-left: 13px; }
.ep-vm .ep-sw { margin: 0; }
.ep-vm .ep-vx { display: flex; align-items: baseline; margin: 6px 0 0; }
.ep-vm .ep-vx p { flex: none; }
.ep-vm .ep-vx span { flex: 1 1 0%; min-width: 0; margin: 0 0 0 8px; }
/* 폰 아래 판 — Lv 줄 · 게이지 · 「모두 받기」(목록 밖 형제라 목록이 그 아래로 들어가지 않는다) */
.ep-pft { flex: none; position: relative; z-index: 5; padding: 12px 15px calc(22px + env(safe-area-inset-bottom)); background: #120e2e; box-shadow: inset 0 3px 0 ${EP.ink}; }
.ep-pl { display: flex; align-items: baseline; margin: 2px 3px 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ep-pl b { flex: none; font-size: 22px; font-weight: 900; line-height: 1; letter-spacing: -.02em; }
.ep-pl span { flex: 1 1 0%; min-width: 0; margin-left: 10px; text-align: right; font-size: 11px; font-weight: 700; color: ${EP.sub}; overflow: hidden; text-overflow: ellipsis; }
.ep-pft .ep-gauge { margin-bottom: 12px; }
.ep-pft .ep-all { width: 100%; }
/* 📌 보상 말풍선 — 창(.ep-wi) 안 그 자리. 자리는 칸 옆(PC — 오른쪽, 모자라면 왼쪽) · 칸 아래(폰 — 모자라면 위), 창 안으로 당긴다(Tip) */
.ep-tip { position: absolute; z-index: 50; left: 0; top: 0; width: 280px; max-width: calc(100% - 18px); max-height: calc(100% - 18px); overflow-y: auto; scrollbar-width: none; padding: 3px 12px; color: ${EP.text}; --bg: #17123a; --hi: #2c2468; --sh: #0d0a26; }
.ep-tr { display: flex; align-items: flex-start; padding: 12px 0; }
.ep-tr + .ep-tr { border-top: 3px solid #241d4f; }
.ep-tic { position: relative; flex: none; width: 48px; height: 48px; }
.ep-tic .ep-ck { right: -7px; top: -7px; }
.ep-tx { flex: 1 1 0%; min-width: 0; margin-left: 12px; }
.ep-tk { display: flex; align-items: center; flex-wrap: wrap; margin: 0 0 3px; }
.ep-tk > * { margin: 0 6px 3px 0; }
.ep-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; font-size: 11.5px; font-weight: 900; color: #fff; white-space: nowrap; }
.ep-tn { margin: 0; font-size: 14px; font-weight: 900; line-height: 1.3; color: #fff; overflow-wrap: anywhere; }
.ep-tl { margin: 5px 0 0; font-size: 12px; font-weight: 700; line-height: 1.35; color: #d8d2f5; }
.ep-tl::before { content: ""; display: inline-block; width: 3px; height: 3px; margin: 0 6px 0 0; background: #72c3e6; vertical-align: 3px; }
.ep-td { margin: 5px 0 0; font-size: 11.5px; font-weight: 700; line-height: 1.4; color: ${EP.sub}; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.ep-tx .ep-sb { margin-top: 9px; }
/* 📌 꾸미기 미리보기 판 — 창 위에 겹친다(z 130). PC 그 자리 판(한 칸 420 · 두 칸 740) · 폰 아래 시트. 시즌 패스 미리보기(PassPreview)와 같은 칸 */
.ep-pv { position: relative; display: flex; width: 100%; max-height: 90vh; max-height: 90dvh; padding: 3px 3px 0; background: ${EP.ink}; clip-path: ${NOTCH6_TOP}; animation: epIn .28s cubic-bezier(0.16,1,0.3,1); color: ${EP.text}; }
.ep-pvi { position: relative; flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; overflow: hidden; background: ${EP.panel}; clip-path: ${NOTCH_TOP}; }
.ep-pvh { flex: none; display: flex; align-items: center; padding: 18px 18px 14px; }
.ep-pvh .ep-x { position: relative; right: auto; top: auto; flex: none; margin-left: 12px; }
.ep-pvh .ep-tn { font-size: 17px; }
.ep-pvb { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; padding: 0 18px 21px; }
.ep-pvl { margin: 0 0 6px; font-size: 11px; font-weight: 900; letter-spacing: .08em; color: ${EP.sub}; }
.ep-pvs + .ep-pvs { margin-top: 15px; }
/* 📌 테두리 여럿 줄(「전체」 9종) — 칸마다 내 사진 + 그 테두리 · 이름, 고른 칸은 꼬리 색 판. 판 폭에 맞춰 칸 수가 바뀌는 격자(가로 밀기 없이 다 보인다 — 상점 "있는 줄도 모르겠어"). 칸 크기는 켜져도 같다 */
.ep-fs { display: grid; grid-template-columns: repeat(auto-fill, minmax(66px, 1fr)); grid-gap: 3px; margin: 0 0 15px; }
.ep-fr { position: relative; min-width: 0; height: 84px; padding: 0 0 9px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; overflow: hidden; color: ${EP.sub}; outline: none; cursor: pointer; --bg: #17123a; --hi: #2c2468; --sh: #0d0a26; }
.ep-fr:hover { color: ${EP.text}; --bg: #201a4c; }
.ep-fr.on { color: #fff; --bg: #2a5f9e; --hi: #72c3e6; --sh: #173a6a; }
.ep-fr:focus-visible { border-color: ${EP.cyan}; }
.ep-fa { position: relative; flex: none; display: flex; width: ${FRAME_TILE}px; height: ${FRAME_TILE}px; margin: auto 0; }
.ep-fr b { max-width: 100%; padding: 0 1px; font-size: 10px; font-weight: 900; line-height: 1; letter-spacing: -.05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ep-pvc { position: relative; width: 100%; aspect-ratio: 4 / 5; overflow: hidden; --bg: #17123a; --hi: #241d58; --sh: #0d0a26; }
.ep-pvd { padding: 12px; --bg: #313338; --hi: #3d3f45; --sh: #232428; }
.ep-pvd img { display: block; width: 100%; aspect-ratio: 1200 / 630; background: #1b1b1b; user-select: none; }
.ep-pvbg { position: relative; width: 100%; height: 240px; overflow: hidden; --bg: #17123a; --hi: #241d58; --sh: #0d0a26; }
.ep-pvg > .s { margin-top: 15px; }
@media (min-width: 640px) {
  .ep-pv { max-width: 420px; max-height: 92vh; padding: 3px; clip-path: ${NOTCH6}; }
  .ep-pv.two { max-width: 740px; }
  .ep-pvi { clip-path: ${NOTCH}; }
  .ep-pvh { padding: 21px 24px 15px; }
  .ep-pvb { padding: 0 24px 24px; }
  .ep-pv.two .ep-pvg { display: flex; align-items: flex-start; }
  .ep-pv.two .ep-pvg > .c { flex: none; width: 300px; }
  .ep-pv.two .ep-pvg > .s { flex: 1 1 0%; min-width: 0; margin: 0 0 0 15px; }
  .ep-pv.two .ep-pvc { aspect-ratio: auto; height: 440px; }
}
@media (prefers-reduced-motion: reduce) { .ep-win, .ep-pv, .ep-float, .ep-flick { animation: none !important; } .ep-flick { opacity: 0; } .ep-gauge > i > b { transition: none; } }
`;

// 도트 그림(rows · pal) — 같은 색 가로 줄을 rect 하나로(crispEdges · 정수 배율 u). 시즌 패스 칸의 빙옥 구슬과 같은 그리기
const Sprite = ({ rows, pal, u = 3, size }) => {
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
  return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={size || W * u} height={size || H * u} shapeRendering="crispEdges" className="shrink-0">{rects}</svg>;
};
// 칸 장식 도트(칸 1 = 3px) — 시안 gen-mock3.mjs SPARK · LOCK · CHECK 그대로
const SPARK = { rows: ["..w..", "..w..", "wwWww", "..w..", "..w.."], pal: { w: "#ffe08a", W: "#ffffff" } };
const LOCK = { rows: [".ooo.", "o...o", "ooooo", "oyyyo", "oyoyo", "ooooo"], pal: { o: "#07051a", y: "#8f88c8" } };
// 받음 배지 — 둥근 도트 배지(꼬리 하늘색 · 위왼쪽 밝게 · 아래오른쪽 어둡게) + 굵은 흰 체크
const CHECK = {
  rows: ["..ooooo..", ".oHHHCCo.", "oHHCCCWCo", "oHCCCWWSo", "oCWCWWCSo", "oCWWWCCSo", "oCCWCCSSo", ".oCSSSSo.", "..ooooo.."],
  pal: { o: "#07051a", H: "#b4ecf9", C: "#72c3e6", S: "#3f86c4", W: "#ffffff" },
};
// 기간 꼬리표 시계 — 금빛 테 · 흰 바늘(칸 1 = 2px)
const CLOCK = { rows: [".ggg.", "g.w.g", "g.wwg", "g...g", ".ggg."], pal: { g: "#ffd27a", w: "#ffffff" } };
// 닫기 X — 두 칸 굵기 도트(칸 1 = 2px)
const XMARK = { rows: ["xx....xx", "xxx..xxx", ".xxxxxx.", "..xxxx..", "..xxxx..", ".xxxxxx.", "xxx..xxx", "xx....xx"], pal: { x: EP.text } };

// 보상 그림 — 시즌 패스 칸과 같은 그림: XP 번개 도트 · 빙옥 구슬 도트 · 아이템은 등록 아이콘 · 역할은 방패
const RewardIcon = ({ r, size }) => {
  if (!r) return null;
  if (r.kind === "xp") return <ItemIcon icon="art:xp-bolt" size={size} />;
  if (r.kind === "point") return <Sprite rows={CURRENCY_PIXEL.point.rows} pal={CURRENCY_PIXEL.point.pal} size={size} />;
  if (r.kind === "item") return <ItemIcon icon={r.icon} imageUrl={r.imageUrl} type={r.itemType} size={size} color={r.color || (r.itemType ? itemTypeColor(r.itemType) : undefined)} />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={Math.round(size * 0.85)} height={Math.round(size * 0.85)} className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={ICON_PATHS.shieldCheck} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// 기간 꼬리표 — 시계 도트 + "30일". cls "in" 은 말풍선 · 미리보기 머리 글줄 안(칩 옆)
const DurTag = ({ days, cls = "" }) => (
  <span className={`ep-dur ${cls}`}>
    <Sprite {...CLOCK} u={2} />
    <b>{fmt(days)}일</b>
  </span>
);
// 📌 분류 칩 — 상점 칩과 같은 글자(categoryLabel — 「프로필 배지」 · 「카드 테두리」 · 「아이템」 · 「역할」 …) · 유형 색 단색 판 + 짙은 테 3px · 계단 모서리
const Chip = ({ r }) => {
  const c = kindColorOf(r);
  return (
    <span className="ep-chip ep-pp" style={{ "--bg": c, "--hi": mixHex(c, "#ffffff", 0.32), "--sh": mixHex(c, "#000000", 0.4) }}>
      {kindOf(r)}
    </span>
  );
};

// 📌 보상 칸 묶음 — 보상마다 제 칸(clusterOf 치수). 단계 상태 장식은 묶음에 한 벌:
//    받을 것 — 첫 칸 왼쪽 위 · (PC) 마지막 칸 오른쪽 아래 반짝이 / 받음 — 위 줄 오른쪽 칸에 배지 / 잠김 — 마지막 칸에 자물쇠.
//    일부만 받은 단계(서버 rewards[].claimed)는 받은 칸에만 작은 배지 + 흐리게. 기간제는 칸마다 꼬리표.
//    장식은 계단 모서리에 안 잘리게 칸 감싸개(.ep-ms)에 단다. 묶음을 누르면(마우스는 올리면) 말풍선 — handlers
const Cluster = ({ t, st, narrow, label, open, handlers }) => {
  const n = t.rewards.length;
  const g = clusterOf(n, narrow);
  const big = g.s >= 50;
  const last = Math.max(0, n - 1);
  const tr = narrow ? last : n >= 2 ? 1 : 0; // 위 줄 오른쪽 칸(폰은 한 줄이라 마지막 칸)
  return (
    <div className={`ep-sw ${st}`} style={{ width: g.w, height: g.h, marginTop: g.top || undefined }} role="button" tabIndex={0} aria-label={label} aria-expanded={open} {...handlers}>
      {(n ? t.rewards : [null]).map((r, j) => {
        const [x, y] = g.pos[j];
        const got = !!r && st !== "done" && !!r.claimed;
        const d = daysOf(r);
        return (
          <div key={j} className={`ep-ms${g.s >= 90 ? " lg" : big ? "" : " sm"}${got ? " got" : ""}`} style={{ left: x, top: y, width: g.s, height: g.s }}>
            <div className="ep-slot ep-pp">{r && <span className="ep-ico"><RewardIcon r={r} size={g.icon} /></span>}</div>
            {d > 0 && <DurTag days={d} />}
            {got && <i className="ep-ck"><Sprite {...CHECK} u={2} /></i>}
            {st === "ready" && j === 0 && <i className="ep-sp a"><Sprite {...SPARK} u={g.s >= 48 ? 3 : 2} /></i>}
            {st === "ready" && !narrow && j === last && <i className="ep-sp b"><Sprite {...SPARK} /></i>}
            {st === "done" && n > 0 && j === tr && <i className="ep-ck"><Sprite {...CHECK} u={big ? 3 : 2} /></i>}
            {st === "lock" && j === last && <i className="ep-lk"><Sprite {...LOCK} u={big ? 3 : 2} /></i>}
          </div>
        );
      })}
    </div>
  );
};

// 📌 보상 말풍선 — 단계의 보상 전부(그림 · 분류 칩 · 기간 꼬리표 · 이름 · 효과 문장 · 꾸미기는 「미리보기」).
//    자리: rect(창 .ep-wi 기준 칸 묶음 자리)에서 PC 는 오른쪽(모자라면 왼쪽, 둘 다 모자라면 아래 · 위) · 폰은 아래(모자라면 위), 창 안 9px 안쪽으로 당긴다.
//    그리기 전에 재서 자리를 잡는다(useLayoutEffect — 한 번도 엉뚱한 자리에 보이지 않게)
const Tip = ({ tip, tier, narrow, onEnter, onLeave, onPreview }) => {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const win = el?.offsetParent;
    if (!el || !win) return;
    const W = win.clientWidth, H = win.clientHeight, w = el.offsetWidth, h = el.offsetHeight, a = tip.rect, M = 9, G = 9;
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
  return (
    <div ref={ref} className="ep-tip ep-pp" role="dialog" aria-label={`Lv ${tier.level} 보상`} style={{ visibility: "hidden" }} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      {tier.rewards.map((r, j) => {
        const d = daysOf(r);
        const k = kindOf(r);
        const lines = Array.isArray(r.effectLines) ? r.effectLines.filter(Boolean) : [];
        const got = tier.state !== "done" && !!r.claimed;
        return (
          <div key={j} className="ep-tr">
            <span className={`ep-tic${got || tier.state === "done" ? " got" : ""}`}>
              <span className="ep-slot ep-pp"><span className="ep-ico"><RewardIcon r={r} size={32} /></span></span>
              {(got || tier.state === "done") && <i className="ep-ck"><Sprite {...CHECK} u={2} /></i>}
            </span>
            <div className="ep-tx">
              {(k || d > 0) && (
                <div className="ep-tk">
                  {k && <Chip r={r} />}
                  {d > 0 && <DurTag days={d} cls="in" />}
                </div>
              )}
              <p className="ep-tn">{nameOf(r)}</p>
              {lines.map((l, i) => <p key={i} className="ep-tl">{l}</p>)}
              {!lines.length && r.desc && <p className="ep-td">{r.desc}</p>}
              {cosOf(r) && <button type="button" className="ep-sb ep-pp" onClick={() => onPreview(r)}>미리보기</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// 📌 꾸미기 미리보기 — 상점 상품 상세 '적용 미리보기'(app/arctic/AppliedPreview) · 시즌 패스 미리보기(app/level/PassPreview)와 같은 부품(app/arctic/CosmeticPreview)을
//    이벤트 패스 창 위에 겹치는 도트 판에 담는다(화면 이동 없음). 칸: 프로필 카드(카드 배경 · 카드 테두리 · 프로필 테두리) | 디스코드 /레벨(봇이 그릴 수 있을 때만 · 그림 실패면 뺀다) · 프로필 배지.
//    사람: 로그인했으면 내 이름 · 사진 · 레벨(/api/xp/me), 아니면 예시. 닫기 단추 · 바깥 누르기 · Esc(Esc 는 창이 받아 이 판만 닫는다)
//    칸 이름 글줄은 칸이 둘 이상일 때만(한 칸이면 머리 분류 칩이 곧 이름). 테두리 여럿(cos.frames — 「전체」 9종)이면 위에 테두리 칸 격자 — 고른 테두리를 두 카드에 낀다
function EpPreview({ r, onClose }) {
  const { data: session } = useSession();
  const user = session?.user || null;
  const authed = !!user;
  const [me, setMe] = useState(null);
  const [discordFail, setDiscordFail] = useState(false);
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
  const [fi, setFi] = useState(-1); // 고른 테두리 칸(-1 = 처음 칸 — cos.frame 자리)
  const today = useTodayXp(authed && !!me);
  const cos = cosOf(r);
  if (!cos) return null;

  // 📌 테두리 여럿(cosmeticOf frames — 「전체」 9종)이면 상점 적용 미리보기(AppliedPreview FrameStrip)처럼 칸 한 줄로 다 보이고 고른 것을 카드 · 디스코드 카드에 낀다
  const frames = Array.isArray(cos.frames) && cos.frames.length > 1 ? cos.frames.filter((k) => typeof k === "string" && k) : [];
  const fStart = Math.max(0, frames.indexOf(typeof cos.frame === "string" ? cos.frame : ""));
  const fAt = frames.length ? Math.min(fi < 0 ? fStart : fi, frames.length - 1) : -1;
  const skin = typeof cos.skin === "string" ? cos.skin : "";
  const scene = typeof cos.scene === "string" ? cos.scene : "";
  const frame = fAt >= 0 ? frames[fAt] : typeof cos.frame === "string" ? cos.frame : "";
  const card = !!skin || !!scene || !!frame;
  const wantDiscord = (!!skin || !!scene) && !!cos.botCard;
  const showDiscord = wantDiscord && !discordFail;
  // 폭은 '받을 칸이 있는지'로 — 디스코드 그림이 실패해도 판 폭은 처음 그대로(상점 · 시즌 패스와 같다)
  const side = wantDiscord || !!cos.badge;
  const two = card && side;
  // 📌 칸 이름(프로필 카드 · 디스코드 /레벨 · 프로필 배지)은 그려지는 칸이 둘 이상일 때만 — 한 칸이면 머리 분류 칩이 이미 그 이름이다(같은 분류 맨 글자를 칩 밑에 또 찍지 않는다).
  //    디스코드 그림이 실패해 카드 한 칸만 남아도 뺀다
  const label = (t) => (card && (showDiscord || !!cos.badge) ? <p className="ep-pvl">{t}</p> : null);
  const who = whoOf(authed ? user : null, authed ? me : null, today);
  const discordSrc = `/api/shop/skin-card?skin=${encodeURIComponent(skin)}${scene ? `&scene=${encodeURIComponent(scene)}` : ""}${frame ? `&frame=${encodeURIComponent(frame)}` : ""}${authed ? "&me=1" : ""}`;
  const badge = badgeOfItem({ itemId: r.itemId, name: r.itemName, icon: r.icon, itemImageUrl: r.imageUrl, color: r.color, type: r.itemType || "cosmetic" });
  const d = daysOf(r);

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(7,5,26,0.6)" }}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-label={`${nameOf(r)} 미리보기`} onClick={(e) => e.stopPropagation()} className={`ep-pv${two ? " two" : ""}`}>
        <div className="ep-pvi">
          {/* 머리 — 보상 그림 · (분류 칩 · 기간 꼬리표 / 이름) | 닫기. 말풍선 한 줄과 같은 표기 */}
          <div className="ep-pvh">
            <span className="ep-tic"><span className="ep-slot ep-pp"><span className="ep-ico"><RewardIcon r={r} size={32} /></span></span></span>
            <div className="ep-tx">
              <div className="ep-tk"><Chip r={r} />{d > 0 && <DurTag days={d} cls="in" />}</div>
              <p className="ep-tn">{nameOf(r)}</p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="ep-x ep-pp">
              <Sprite {...XMARK} u={2} />
            </button>
          </div>
          <div className="ep-pvb">
            {frames.length > 0 && (
              <div className="ep-fs" role="group" aria-label={`프로필 테두리 ${frames.length}종`}>
                {frames.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={i === fAt}
                    aria-label={FRAME_OF[k]?.l || k}
                    className={`ep-fr ep-pp${i === fAt ? " on" : ""}`}
                    onClick={() => { if (i !== fAt) { setFi(i); setDiscordFail(false); sfxTick(); } }}
                  >
                    <span className="ep-fa">
                      <Avatar who={who} px={FRAME_TILE} text="text-[12px]" />
                      <AvatarFrame frame={k} px={FRAME_TILE} />
                    </span>
                    <b>{FRAME_OF[k]?.l || k}</b>
                  </button>
                ))}
              </div>
            )}
            <div className="ep-pvg">
              {card && (
                <div className="c">
                  {label("프로필 카드")}
                  <div className="ep-pvc ep-pp">
                    <FitBox pad={0.92} max={1}>
                      <ProfileCardPreview who={who} skin={skin} scene={scene} frame={frame} />
                    </FitBox>
                  </div>
                </div>
              )}
              {side && (showDiscord || cos.badge) && (
                <div className={card ? "s" : ""}>
                  {showDiscord && (
                    <div className="ep-pvs">
                      {label("디스코드 /레벨")}
                      <div className="ep-pvd ep-pp">
                        {/* 칸은 카드 비율(1200 × 630)로 먼저 잡아 둔다 — 그림이 늦게 와도 자리가 그대로 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img key={discordSrc} src={discordSrc} alt="" draggable={false} decoding="async" onError={() => setDiscordFail(true)} />
                      </div>
                    </div>
                  )}
                  {cos.badge && (
                    <div className="ep-pvs">
                      {label("프로필 배지")}
                      <div className="ep-pvbg ep-pp">
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
    </div>
  );
}

// 랜턴 — 켜짐은 불 칸 깜빡임 겹을 위에(띄엄띄엄 · 랜턴마다 시작을 어긋나게)
const Lantern = ({ on, scale, className = "", i = 0 }) => {
  const w = LT.w * scale, h = LT.h * scale;
  return (
    <span aria-hidden className={className} style={{ display: "block", position: "relative", width: w, height: h }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ART}/lantern-${on ? "on" : "off"}.png`} alt="" width={w} height={h} draggable={false} className="ep-px" style={{ display: "block", width: w, height: h }} />
      {on && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`${ART}/lantern-flame.png`} alt="" width={w} height={h} draggable={false} className="ep-px ep-flick" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, animationDelay: `${-((i * 0.37) % 2.8).toFixed(2)}s` }} />
      )}
    </span>
  );
};
// 유령 펭귄(투명 도트) — 위아래로 천천히 뜬다
const Spectre = ({ scale, className = "", style, delay = 0 }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img
    src={`${ART}/spectre.png`}
    alt=""
    aria-hidden
    width={Math.round(SPEC.w * scale)}
    height={Math.round(SPEC.h * scale)}
    draggable={false}
    className={`ep-px ep-float ${className}`}
    style={{ display: "block", width: Math.round(SPEC.w * scale), height: Math.round(SPEC.h * scale), animationDelay: delay ? `${delay}s` : undefined, ...style }}
  />
);
// 제목 — 배너와 같은 송명 그림(title.png · 크기는 --k). 관리자가 제목을 바꿨으면 그 글자를 그대로(그림이 없으니 굵은 글자 + 딱딱한 그림자)
const Title = ({ title }) => {
  if (title && title !== TITLE_ART.text) return <h2 className="ep-h2 txt">{title}</h2>;
  return (
    <h2 className="ep-h2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={TITLE_ART.src} alt={TITLE_ART.text} width={TITLE_ART.w + TITLE_ART.pad * 2} height={TITLE_ART.h + TITLE_ART.pad * 2} draggable={false} />
    </h2>
  );
};
// 📌 게이지 — 지금 단계 안 비율(ratio 0~1)을 10칸에. 꽉 찬 칸 · 걸친 칸(자식 요소 폭) · 빈 칸
const Gauge = ({ ratio }) => {
  const v = clamp01(ratio) * BLOCKS;
  const full = Math.floor(v + 1e-6);
  return (
    <div className="ep-gauge" aria-hidden>
      {Array.from({ length: BLOCKS }, (_, i) =>
        i < full ? <i key={i} className="on"></i> : i === full && v - full > 0.001 ? <i key={i}><b style={{ width: `${Math.round((v - full) * 100)}%` }}></b></i> : <i key={i}></i>
      )}
    </div>
  );
};

// 📌 PC 마우스 휠 — 랜턴 길 위에서 굴리면 가로로 넘긴다. 창 본문이 그 방향으로 아직 세로로 갈 수 있으면 세로가 먼저(시즌 패스 트랙과 같은 규칙)
const useWheelX = (boxRef, bodyRef, on) => {
  useEffect(() => {
    const box = boxRef.current;
    if (!on || !box) return;
    const onWheel = (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      const body = bodyRef.current;
      if (body && (e.deltaY > 0 ? body.scrollTop + body.clientHeight < body.scrollHeight - 1 : body.scrollTop > 0)) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? box.clientWidth : 1);
      const to = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, box.scrollLeft + dy));
      if (Math.abs(to - box.scrollLeft) < 1) return;
      e.preventDefault();
      box.scrollLeft = to;
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, [boxRef, bodyRef, on]);
};

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

// pushToast(msg, accent) — 레벨 페이지 토스트. onClaimed — 받은 뒤 페이지 잔액 · XP 를 다시 읽는다(loadMe)
export default function EventPassModal({ open, onClose, pushToast, onClaimed }) {
  const narrow = useNarrow();
  const [data, setData] = useState(null); // 마지막으로 받은 상태 — 다시 열면 바로 그리고 뒤에서 새로 읽는다
  const [status, setStatus] = useState("idle"); // idle · loading · ok · error
  const [busy, setBusy] = useState(""); // "" · "all" · "tier:<tid>"
  const [tip, setTip] = useState(null); // 보상 말풍선 { tid, mode: "hover" | "pin", rect } — rect 는 창(.ep-wi) 기준 칸 묶음 자리
  const [preview, setPreview] = useState(null); // 꾸미기 미리보기 보상
  const busyRef = useRef("");
  const closeRef = useRef(null);
  const winRef = useRef(null);
  const bodyRef = useRef(null);
  const trackRef = useRef(null);
  const centeredRef = useRef(false);
  const listRef = useRef(null); // 폰 목록 — 키가 넉넉하면 여기만 스크롤한다
  const tipTimer = useRef(0);

  // 읽은 상태 반영 — 실패면 이미 그린 상태는 그대로 둔다(뒤에서 새로 읽기만 실패)
  const apply = useCallback((j) => {
    if (j) {
      setData(j);
      setStatus("ok");
    } else setStatus((s) => (s === "ok" ? "ok" : "error"));
  }, []);
  const load = useCallback(() => fetchState().then(apply), [apply]);

  // 열 때마다 새로 읽는다 · 닫으면 다음 열 때 길을 다시 맞춘다
  useEffect(() => {
    if (!open) {
      centeredRef.current = false;
      return;
    }
    let alive = true;
    fetchState().then((j) => { if (alive) apply(j); });
    return () => { alive = false; };
  }, [open, apply]);

  // ── 보상 말풍선 — 마우스는 올리면 열고(hover) 칸 · 말풍선 밖으로 나가면 닫는다. 누르면(폰 탭 · PC 클릭) 고정(pin) · 다시 누르면 닫기 ──
  //    바깥 누르기 · Esc · 창 크기 바뀜 · 스크롤(길 · 목록 · 시트)이면 닫는다. 미리보기 판이 떠 있는 동안은 바깥 누르기를 보지 않는다
  const closeTip = useCallback(() => {
    clearTimeout(tipTimer.current);
    setTip(null);
  }, []);
  const openTip = useCallback((tid, el, mode) => {
    const win = winRef.current;
    if (!win || !el) return;
    clearTimeout(tipTimer.current);
    const w = win.getBoundingClientRect(), a = el.getBoundingClientRect();
    setTip({ tid, mode, rect: { l: a.left - w.left, t: a.top - w.top, r: a.right - w.left, b: a.bottom - w.top } });
  }, []);
  const leaveTip = useCallback(() => {
    clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip((p) => (p && p.mode === "hover" ? null : p)), 140);
  }, []);
  const keepTip = useCallback(() => clearTimeout(tipTimer.current), []);
  useEffect(() => () => clearTimeout(tipTimer.current), []);
  // 닫기 — 말풍선 · 미리보기도 같이 접는다(다음에 열 때 옛 자리 말풍선이 남지 않게)
  const closeAll = useCallback(() => {
    clearTimeout(tipTimer.current);
    setTip(null);
    setPreview(null);
    onClose();
  }, [onClose]);

  // 열리면 닫기 단추에 포커스 · Esc 로 닫기 — PopShell 과 같다. 미리보기 → 말풍선 → 창 차례로 하나씩
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
  useEffect(() => {
    if (!tip || preview) return;
    const onDown = (e) => {
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest(".ep-tip")) return;
      if (el?.closest("[data-ep-tip]")?.getAttribute("data-ep-tip") === tip.tid) return; // 같은 칸 — 누르기(click)가 닫는다
      closeTip();
    };
    // 창 폭이 바뀔 때만 — 폰은 스크롤로 주소창이 접히며 높이만 바뀌는 resize 가 잦다
    const w0 = window.innerWidth;
    const onResize = () => { if (window.innerWidth !== w0) closeTip(); };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [tip, preview, closeTip]);

  const tiers = useMemo(() => (data && !data.guest && Array.isArray(data.tiers) ? data.tiers : []), [data]);
  // 📌 진행도 = 기간 안에 번 XP 하나(미션 보너스 없음) — passXp 가 없던 응답이면 earnedXp. 화면 글자로는 찍지 않는다(단계 셈 · 길 자리만)
  const passXp = Number(data?.passXp ?? data?.earnedXp) || 0;
  const level = Number(data?.level) || 0;
  const isOpen = !!data?.open;
  const geom = useMemo(() => laneGeom(tiers, passXp, level), [tiers, passXp, level]);

  // 📌 열고 처음 그릴 때 한 번(받기로 다시 그려도 그대로 둔다) —
  //    PC: 유령 펭귄(지금 자리)이 길 가운데 오게 가로로 맞추되, 받을 칸이 그보다 왼쪽에 가려 있으면 첫 받을 칸이 보이게 왼쪽으로.
  //    폰: 받을 단계(없으면 다음 단계) 줄이 목록 아래로 가려 있으면 그 줄 + 한 줄이 보일 만큼만 목록을 내린다(머리는 그대로)
  useEffect(() => {
    if (!open || !geom || centeredRef.current) return;
    if (narrow) {
      centeredRef.current = true;
      const list = listRef.current;
      // 키가 넉넉하면 목록만, 낮은 화면(시트 전체 스크롤)이면 시트를 내린다
      const box = list && getComputedStyle(list).overflowY === "auto" ? list : bodyRef.current;
      const row = list?.querySelector("[data-ep-focus]");
      if (!box || !row) return;
      const over = row.getBoundingClientRect().bottom + 74 - box.getBoundingClientRect().bottom;
      if (over > 0) box.scrollTop += over;
      return;
    }
    const box = trackRef.current;
    if (!box) return;
    centeredRef.current = true;
    let left = geom.me.x - box.clientWidth / 2;
    const first = isOpen ? tiers.findIndex((t) => t.state === "ready") : -1;
    if (first >= 0) left = Math.min(left, X0 + first * COLW - 90); // 칸 반(48) + 반짝이 · 여유
    // 왼쪽 끝은 기둥 사이에서 끊는다(왼쪽 칸이 반쯤 잘려 보이지 않게 — 내림이라 받을 칸은 그대로 보인다)
    left = Math.floor((left - (X0 - COLW / 2)) / COLW) * COLW + (X0 - COLW / 2);
    box.scrollLeft = Math.max(0, left);
  }, [open, narrow, geom, tiers, isOpen]);
  useWheelX(trackRef, bodyRef, open && !narrow && tiers.length > 0);

  const claim = useCallback(async (kind, ref = "") => {
    if (busyRef.current) return;
    const key = kind === "all" ? "all" : `${kind}:${ref}`;
    busyRef.current = key;
    setBusy(key);
    const before = tiers; // 받은 이름 짝짓기용(받기 전 단계 보상)
    let res = null;
    try {
      const r = await fetch(`${API}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "all" ? { kind } : { kind, ref }),
      });
      res = await r.json().catch(() => ({ ok: false }));
    } catch {
      res = null;
    }
    if (res?.ok) {
      if (res.state) setData(res.state);
      sfxGet();
      // 📌 알림도 이름만(기간 꼬리 · 「아이템 · 」 머리말 없이 — 위 📌 2026-10-18)
      pushToast?.(gotText(gotNames(Array.isArray(res.claimed) ? res.claimed : [], before)), true);
      // 📌 못 받은 단계 — 서버 상태의 hold(실사이트에 아직 없는 아이템 보상 · lib/eventPass.js). 모두 받기는 그 단계만 빼고 받는다 — 어느 단계인지 한 줄 더
      const held = (Array.isArray(res.state?.tiers) ? res.state.tiers : []).filter((t) => t.state === "ready" && t.hold && (kind === "all" || t.tid === ref));
      if (held.length) {
        const lv = held.slice(0, 3).map((t) => `Lv ${t.level}`).join(" · ");
        pushToast?.(`${lv}${held.length > 3 ? ` 외 ${held.length - 3}개` : ""} 보상은 잠시 뒤 다시 받아 주세요.`);
      }
      onClaimed?.();
    } else {
      sfxNo();
      pushToast?.(res ? res.error || "수령하지 못했습니다." : "네트워크 오류로 수령하지 못했습니다.");
      // 거절이면 서버 상태로 다시 맞춘다(다른 탭에서 이미 받음 · 기간 끝 등) — 다 읽은 뒤에 단추를 푼다
      await load();
    }
    busyRef.current = "";
    setBusy("");
  }, [pushToast, onClaimed, load, tiers]);

  if (!open) return null;

  const guest = !!data?.guest;
  // D-day — 서버 시각(now) 기준(시즌 패스 getSeasonDday 와 같은 올림 셈). 비로그인 응답엔 now 가 없어 칩을 뺀다
  const endMs = Date.parse(data?.endsAt || ""), nowMs = Date.parse(data?.now || "");
  const ended = Number.isFinite(endMs) && Number.isFinite(nowMs) && nowMs >= endMs;
  const dday = Number.isFinite(endMs) && Number.isFinite(nowMs) ? (ended ? "종료" : `D-${Math.max(0, Math.ceil((endMs - nowMs) / DAY))}`) : "";
  const span = data?.startsAt && data?.endsAt ? `${kstDay(data.startsAt)} ~ ${kstDay(data.endsAt, true)}` : "";
  const title = data?.title || TITLE_ART.text;
  // 📌 지금 단계 셈 — 아래 판 숫자 · 게이지(위 stepProg)
  const prog = stepProg(tiers, passXp, data?.next || null);
  // 📌 받을 수 = 받을 단계 수 — 열려 있을 때만(서버 claimable 과 같은 셈 · 미션 없음)
  const claimable = isOpen ? tiers.filter((t) => t.state === "ready").length : 0;
  // 단계 표시 — 닿았지만 지금 못 받는 것(기간 끝)은 "miss": 랜턴은 켜 두고 받기 표시만 뺀다
  const showOf = (t) => (t.state === "ready" ? (isOpen ? "ready" : "miss") : t.state === "done" ? "done" : "lock");
  const slotLabel = (t, st) => `Lv ${t.level} 보상 · ${namesOf(t) || "보상 없음"}${st === "done" ? " · 받음" : ""}`;
  const tipTier = tip ? tiers.find((t) => t.tid === tip.tid) || null : null;
  // 칸 묶음 손잡이 — 마우스: 올리면 열기 · 나가면 닫기, 누르기(탭 · 클릭 · Enter · Space): 고정 / 다시 누르면 닫기. 받기는 하지 않는다
  const toggleTip = (tid, el) => {
    if (tip && tip.tid === tid && tip.mode === "pin") closeTip();
    else {
      openTip(tid, el, "pin");
      sfxTick();
    }
  };
  const tipHandlers = (t) => ({
    "data-ep-tip": t.tid,
    onPointerEnter: (e) => { if (e.pointerType === "mouse") openTip(t.tid, e.currentTarget, "hover"); },
    onPointerLeave: (e) => { if (e.pointerType === "mouse") leaveTip(); },
    onClick: (e) => toggleTip(t.tid, e.currentTarget),
    onKeyDown: (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleTip(t.tid, e.currentTarget);
    },
  });
  const onScrollAny = tip ? closeTip : undefined;
  // 📌 미리보기를 열 때 말풍선을 고정(pin)한다 — 마우스로 연 말풍선(hover)은 미리보기 판이 덮자마자 pointerleave 로 접혀, 판을 닫으면 돌아올 자리가 없었다
  const openPreview = (r) => {
    sfxTick();
    clearTimeout(tipTimer.current);
    setTip((p) => (p ? { ...p, mode: "pin" } : p));
    setPreview(r);
  };

  const closeBtn = (
    <button ref={closeRef} type="button" onClick={closeAll} aria-label="닫기" className="ep-x ep-pp">
      <Sprite {...XMARK} u={2} />
    </button>
  );
  const chips = (
    <>
      {span && !narrow && <span className="ep-tag ep-pp">{span}</span>}
      {dday && <span className={`ep-tag ep-dd ep-pp${ended ? " end" : ""}`}>{dday}</span>}
      {/* 관리자만 보는 미리보기(꺼져 있으면 다른 사람은 단계가 비어 온다) */}
      {data && data.enabled === false && !guest && tiers.length > 0 && <span className="ep-tag ep-off ep-pp">비공개</span>}
    </>
  );
  const hasTiers = !!data && !guest && tiers.length > 0;
  const busyDots = <span className="ep-busy">…</span>;
  const getBtn = (t, size) => {
    const k = `tier:${t.tid}`;
    return (
      <button type="button" className={`ep-gb ${size}`} onClick={() => claim("tier", t.tid)} disabled={!!busy} aria-label={`Lv ${t.level} · ${namesOf(t)} 받기`}>
        <span style={busy === k ? { visibility: "hidden" } : undefined}>받기</span>
        {busy === k && busyDots}
      </button>
    );
  };
  const allBtn = hasTiers && (
    <button type="button" className={`ep-gb ep-all${claimable > 0 ? "" : " off"}`} onClick={() => claim("all")} disabled={!!busy || claimable <= 0}>
      <span style={busy === "all" ? { visibility: "hidden" } : undefined} className="inline-flex items-center">
        모두 받기<span className="ep-n">{claimable}</span>
      </span>
      {busy === "all" && busyDots}
    </button>
  );
  // 📌 아래 판 — 지금 단계만(위 📌 2026-10-18):
  //    PC: [Lv N] [게이지 · 아래 줄 "3,400 / 8,000 XP" | "Lv N+1까지 4,600 XP"] [큰 「모두 받기」] 한 줄 · 폰: [Lv N | Lv N+1까지 4,600 XP] → 게이지 → 꽉 찬 「모두 받기」
  //    다 채웠으면 「모두 달성」 · 꽉 찬 게이지(숫자 없음)
  const leftText = prog.done ? <em>모두 달성</em> : <>Lv {prog.level}까지 <em className="c">{fmt(prog.left)} XP</em></>;
  const footer = hasTiers && (narrow ? (
    <div className="ep-pft">
      <div className="ep-pl">
        <b>Lv {fmt(level)}</b>
        <span>{leftText}</span>
      </div>
      <Gauge ratio={prog.ratio} />
      {allBtn}
    </div>
  ) : (
    <div className="ep-ft">
      <div className="ep-bar ep-pp">
        <div className="ep-bl"><b>Lv {fmt(level)}</b></div>
        <div className="ep-bg">
          <Gauge ratio={prog.ratio} />
          <div className="ep-bt">
            {prog.done ? <span><em>모두 달성</em></span> : <><span><em>{fmt(prog.inStep)}</em> / {fmt(prog.step)} XP</span><span>{leftText}</span></>}
          </div>
        </div>
        {allBtn}
      </div>
    </div>
  ));

  // 비었을 때 — 읽는 중 · 실패 · 로그인 전 · 단계 없음(꺼져 있거나 아직 안 채움)
  const empty = !data ? (
    status === "error" ? (
      <div className="ep-empty">
        불러오지 못했습니다
        <div><button type="button" className="ep-gb md" onClick={() => { setStatus("loading"); load(); }}>다시 시도</button></div>
      </div>
    ) : <div className="ep-empty">불러오는 중…</div>
  ) : guest ? (
    <div className="ep-empty">
      로그인이 필요합니다
      <div><button type="button" className="ep-gb md" onClick={() => { closeAll(); openLogin(); }}>로그인</button></div>
    </div>
  ) : !tiers.length ? <div className="ep-empty">준비 중입니다</div> : null;

  // ── PC — 물결 랜턴 길: 칸 묶음 → 이름(하나면 이름 · 여럿이면 「보상 N개」) → 랜턴(길 위) → Lv → 단계 XP · 받기 ──
  const lane = geom && (
    <div ref={trackRef} className="ep-track" onScroll={onScrollAny}>
      <div className="ep-lane" style={{ width: geom.width }}>
        <svg className="ep-rope" width={geom.width} height={LANE_H} shapeRendering="crispEdges" aria-hidden>
          {geom.dots.map((d) => <rect key={`d${d.x}`} x={d.x} y={d.y} width="3" height="3" fill="#3a3170" />)}
          {geom.lit.map((r) => (
            <g key={`l${r.x}`}>
              <rect x={r.x} y={r.y - 3} width={r.w} height="3" fill="#eafcff" />
              <rect x={r.x} y={r.y} width={r.w} height="3" fill="#72c3e6" />
              <rect x={r.x} y={r.y + 3} width={r.w} height="3" fill="#2a5f9e" />
            </g>
          ))}
        </svg>
        {tiers.map((t, i) => {
          const st = showOf(t);
          return (
            <div key={t.tid} className={`ep-col ${st}${st === "done" || st === "lock" ? " dim" : ""}`} style={{ left: X0 + i * COLW - 66, top: colTop(i) }}>
              <Cluster t={t} st={st} narrow={false} label={slotLabel(t, st)} open={tip?.tid === t.tid} handlers={tipHandlers(t)} />
              <p className="ep-nm">{capOf(t.rewards)}</p>
              <Lantern on={st !== "lock"} scale={LT_S} i={i} className="ep-lt" />
              <p className="ep-lvl">Lv {t.level}</p>
              {st === "ready" ? getBtn(t, "sm") : <p className="ep-nd">{fmt(stepOf(tiers, i))} XP</p>}
            </div>
          );
        })}
        <Spectre scale={ME.w / SPEC.w} delay={-1.4} className="ep-me" style={{ position: "absolute", left: Math.max(0, geom.me.l), top: geom.me.t }} />
      </div>
    </div>
  );

  // ── 폰 — 세로 랜턴 목록(점선 위 랜턴 · 칸 묶음 · 이름 / Lv · 단계 XP · 받기). 여러 보상이면 칸 한 줄 아래에 「보상 N개 · Lv · 단계 XP」 ──
  // 처음 보여 줄 줄 — 받을 단계, 없으면 아직 못 닿은 첫 단계
  const readyIdx = tiers.findIndex((t) => showOf(t) === "ready");
  const focusIdx = readyIdx >= 0 ? readyIdx : tiers.findIndex((t) => t.state === "lock");
  const vlist = (
    <div className="ep-vlist">
      {tiers.length > 1 && <span aria-hidden className="ep-vline"></span>}
      {tiers.map((t, i) => {
        const st = showOf(t);
        const multi = t.rewards.length > 1;
        const cluster = <Cluster t={t} st={st} narrow label={slotLabel(t, st)} open={tip?.tid === t.tid} handlers={tipHandlers(t)} />;
        const text = (
          <span className="ep-vx">
            <p>{capOf(t.rewards)}</p>
            <span>Lv {t.level} · {fmt(stepOf(tiers, i))} XP</span>
          </span>
        );
        return (
          <div key={t.tid} className={`ep-vr ${st}${st === "done" || st === "lock" ? " dim" : ""}${multi ? " multi" : ""}`} data-ep-focus={i === focusIdx ? "1" : undefined}>
            <span className="ep-vl"><Lantern on={st !== "lock"} scale={3} i={i} /></span>
            {multi ? <span className="ep-vm">{cluster}{text}</span> : <>{cluster}{text}</>}
            {st === "ready" && getBtn(t, "sm")}
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={closeAll}
    >
      <style>{EP_CSS}</style>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="ep-win">
        <div ref={winRef} className="ep-wi">
          {narrow && <span aria-hidden className="ep-grab"></span>}
          {closeBtn}

          <div ref={bodyRef} className={`ep-scroll${narrow ? " ep-scroll-m" : ""}`} onScroll={onScrollAny}>
            <div aria-hidden className="ep-art" style={{ backgroundImage: `url(${ART}/header-${narrow ? "m" : "pc"}.png)` }}></div>

            {narrow ? (
              <>
                {/* 폰 머리 — EVENT PASS · D-day → 제목 → 기간. 유령 펭귄(2배)은 오른쪽 위(닫기 단추 옆) · Lv 는 아래 판으로 */}
                <div className="ep-mhd">
                  <Spectre scale={2} className="ep-spec" style={{ position: "absolute" }} />
                  <div className="ep-row"><span className="ep-lab">EVENT PASS</span>{chips}</div>
                  <Title title={title} />
                  {span && <div className="ep-row" style={{ marginTop: 2 }}><span className="ep-tag ep-pp">{span}</span></div>}
                </div>
                {empty}
                {!empty && <div ref={listRef} className="ep-mbody" onScroll={onScrollAny}>{vlist}</div>}
              </>
            ) : (
              <>
                {/* PC 머리 — EVENT PASS · 기간 · D-day / 제목 | 오른쪽 큰 유령 펭귄(3배 · Lv 판 없음) */}
                <div className="ep-hd">
                  <div className="ep-ttl">
                    <div className="ep-row"><span className="ep-lab">EVENT PASS</span>{chips}</div>
                    <Title title={title} />
                  </div>
                  <Spectre scale={3} className="ep-hero x3" style={{ position: "absolute" }} />
                </div>
                {empty || lane}
              </>
            )}
          </div>

          {footer}
          {tip && tipTier && tipTier.rewards.length > 0 && <Tip tip={tip} tier={tipTier} narrow={narrow} onEnter={keepTip} onLeave={leaveTip} onPreview={openPreview} />}
        </div>
      </div>
      {preview && <EpPreview key={`${preview.itemId || ""}`} r={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
