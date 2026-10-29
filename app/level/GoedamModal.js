"use client";

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ItemIcon from "../components/ItemIcon";
import { ICON_PATHS } from "../components/Icons";
import { openLogin } from "../components/LoginPrompt";
import { itemTypeColor } from "@/lib/items";
import { RARITIES, rarityOf, rarityRank } from "@/lib/rarity";
import { CURRENCY_PIXEL } from "@/lib/currencyIcons";
import { playTone } from "@/lib/sfx";
import { preloadSfx, playSfx } from "@/lib/sfxFiles";

// 📌 「방구석 심야 괴담회」 추첨 창 — 레벨 대시보드 이벤트 패스 띠 바로 아래 괴담회 띠로 연다(app/level/page.js openGoedam). 화면 이동 없음.
//    약속 .claude/mockups/goedam/SPEC.md 「화면 · 창」. 서버는 app/api/goedam(GET 상태 · POST draw — lib/goedam.js). 남은 추첨권 · 상품 · 당첨은 서버가 센다 — 화면은 받은 대로만 그린다.
//    틀은 이벤트 패스 창(EventPassModal — 고치지 않고 결만 따름)과 같은 문법: fixed inset-0 z-[120] 오버레이(전역 ScrollLock) · 닫기 단추 포커스 · Esc · PC 가운데 창 · 폰 아래 시트(dvh).
//      위   제목 「방구석 심야 괴담회」 + 기간 알약(운영진 미리보기면 「비공개」)
//      가운데 스크린(어두운 영사막) — 평소 내 추첨권 큰 판(public/goedam/ticket.png) + ×N / 뽑으면 애니메이션 → 결과 카드
//      단추 금색 둘 「추첨권 1장」 · 「추첨권 10장」(2026-10-24 — 10장은 10장 이상일 때만, 모자라면 잠김 · 기간 전 「10. 30. 20:00 에 열립니다」 · 끝나면 「종료」 · 로그인 전 「로그인」)
//      옆판(PC 오른쪽 · 폰 아래) 탭 셋 — 상품(희귀도 칩 · 이름 · 남은 수/전체) · 받는 법(상영 · 음성 · 상점) · 내 당첨(code 는 코드 + 복사)
//        칸 폭 고정 — 탭을 바꿔도 줄이 밀리지 않는다. 창 크기는 고정이고 목록만 그 안에서 스크롤
//    📌 2026-10-24 운영자 "디코 일정 시간한 것도 지급할 거고 상점에도 판매할 거라서 회차라는 개념이 좀 애매한데" → 탭 「회차」 를 「받는 법」 으로(약속 SPEC.md 추가 절 6).
//      안은 덩어리 셋(작은 머리 글 「상영」 · 「음성」 · 「상점」, 서버가 준 것만) — 상영 = 회차 줄 그대로(날짜 · 시간 · 제목 · 완청 ✓ / 진행 중 / –)
//      · 음성 = GET voice 한 줄(「음성 채널 참여」 · 기간 · ×장 · 오늘 진행 10칸 게이지 + 「분/N분」 · 오늘 받았으면 ✓ · 기간 밖 · 꺼짐이면 흐리게)
//      · 상점 = GET shop 한 줄(상품 이름 + 「바로가기」 — 창을 닫고 그 상품 상세로). 셋 다 없으면 「준비 중」
//    📌 애니메이션(약 2.4초 · 스크린을 누르면 건너뜀 · 움직임 줄이기면 바로 결과) — 2026-10-24 운영자 "누르면 티켓 잘리고 양커튼 쳐지면서 뽑기":
//      ⓪ 원래 표가 0.5초 보인다(결과 화면에서 다시 눌러도 표부터 — 운영자 "0.5초 정도 원본 티켓 나오고 찢어지는")
//      ① 그 표가 당겨지고(.18s) 꼬리표(ticket-stub.png)가 톱니 모양으로 찢겨 떨어진다(종이 조각) ② 양쪽 커튼이 가운데로 닫힌다(위가 먼저 · 아래 자락이 늦게 · 가운데서 출렁)
//      ③ 닫힌 채 결과를 기다린다(전설 이상이면 다 닫힌 뒤 이음매에 등급 색 빛줄) ④ 커튼이 열리며 결과 — 1장은 큰 카드(희귀도 색 테 · 이름 · 양 · code 는 코드 + 「복사」 · none 은 유령 펭귄 + 「다음 기회에」),
//         10장은 5 × 2 작은 칸. 희귀도 연출은 가장 높은 등급 하나를 따른다(RevealFx — 기본 효과 + 등급이 오를수록 더한다)
//      오류면 애니메이션을 접고 토스트
//    📌 2026-10-25 운영자 "뽑기 효과음 짜쳐 · 오히려 고티어 효과음이 별로" + "나오는 애니메이션도 좀" — 약속 .claude/mockups/goedam/REVEAL-SPEC.md
//      ④ 를 「등급 상승 + 카드 뒤집기」로: 커튼이 열리면 뒷면 카드(「?」) → 테가 일반 색부터 그 등급 색까지 한 단씩 오르고 → 멈춤(전설 이상은 떨림 · 깜빡) → 뒤집혀 앞면.
//      10장은 뒷면 열 장을 놓고 차례로 뒤집는다(전설 이상 칸 앞에서 멈춤). 알림(토스트 · 잔액 · 목록)은 다 보인 뒤에(미리 알려 버리지 않게)
//      효과음은 전부 public/sfx/goedam-*.wav(scripts/gen-goedam-sfx.mjs — 크기를 파일에 구워 VOL 하나로 튼다). 고티어 = 묵직한 타격 + 종소리
//    📌 도트 결 — 판 · 칸 · 단추 = 짙은 테 3px + 안쪽 단(위·왼쪽 밝게 / 아래·오른쪽 어둡게) + 계단 모서리(clip-path). 단색만, 그라데이션 · 흐린 빛 금지. 안내 문장 없이 라벨 · 기호만

const API = "/api/goedam";
const ART = "/goedam"; // public/goedam — ticket.png(464 × 224) · ticket-main.png(왼쪽 0~331px) · ticket-stub.png(332px~)
// 📌 추첨권 큰 판 칸 수 — 그림 1칸 = 4px(116 × 56칸). 절취선은 83칸(332px) 경계. 화면에선 --u(칸 하나 px — PC 4 · 폰 3 · 좁은 폰 2)로 정수 배율만
const TK = { w: 116, h: 56, cut: 83 };
// 📌 애니메이션 시간표(ms) — ⓪ 0 원래 표(.5s) · ① 500 당김(.18s) · 680 찢김(톱니 절단면 · 종이 조각 · 꼬리표 .62s) · ② 1060 커튼 닫힘(.6s) · ③ 2200 까지 닫힌 채(결과 기다림) · ④ 열림(.62s) + 결과
const T_SHOW = 500;
const T_TEAR = T_SHOW + 180;
const T_CLOSE = T_SHOW + 560;
const T_OPEN = T_SHOW + 1700;
const T_ROLL = T_CLOSE + 560; // 커튼이 다 닫힌 뒤 — 기다림 롤(결과가 와 있고 전설 이상이면 roll-hi)
// 소리 크기 — 승급 화면(PromoOverlay VOL)과 같은 값(운영자 "너무 크다" 뒤 맞춘 크기). 📌 goedam-* 는 소리마다 크기를 파일에 구워 뒀다(최고점 -1 ~ -12 dBFS) —
//    여기선 모두 이 값 하나로 튼다(곱하는 배수는 상승 사다리 0.75 → 1 · 10장 뒤집기 0.6 만)
const VOL = 0.16;
const SFX = ["tug", "tear", "shut", "roll", "roll-hi", "open", "step", "charge", "flip", "none", "low", "mid", "high", "myth", "hit"].map((n) => `goedam-${n}`);
// 파일 소리 하나 — 돌려주는 끄기 함수를 sndRef 에 넣어 stopSnd 로 함께 끈다. at 은 지금부터 ms
//    📌 2026-10-25 검토: playSfx 의 끄기는 오디오에 이미 걸린(시작 전) 소리를 0.12s 로 잦아들게만 해서, 끈 뒤 0.6초 안에 시작하기로 한 소리가
//    줄어든 크기로 그대로 울렸다(건너뛴 뒤 뒤집기 '착' · 창을 닫은 뒤 등급 소리). 그래서 먼 소리는 페이지 타이머로 들고 있다가 SFX_LEAD 앞에서만 넘긴다 —
//    넘긴 뒤 박자는 오디오 시계라 타이머가 조금 밀려도 안 어긋나고, 그 전에 끄면 아예 안 울린다. 타이머가 SFX_LATE 넘게 밀렸으면(숨은 탭 — 1초 단위로 몰림) 버린다
const SFX_LEAD = 100;
const SFX_LATE = 250;
const sfx = ({ name, at = 0, rate = 1, vol = 1 }) => {
  const opt = { rate, vol: vol * VOL };
  if (at <= SFX_LEAD) return playSfx(name, { ...opt, delay: at / 1000 });
  const due = performance.now() + at;
  let stop = null;
  const t = setTimeout(() => {
    const left = due - performance.now();
    if (left > -SFX_LATE) stop = playSfx(name, { ...opt, delay: Math.max(0, left) / 1000 });
  }, at - SFX_LEAD);
  return () => {
    clearTimeout(t);
    if (stop) stop();
  };
};
// 📌 2026-10-23 운영자 「희귀도 연출」 — 단계: 꽝 none · 일반/고급 low · 희귀/영웅 mid · 전설 이상 high(가챠 SSR 결 — 번쩍 · 고리 · 금가루 비 · 흔들림).
//    high 는 닫힌 커튼 이음매에 등급 색 빛줄이 깜빡여 미리 설렌다(hintOf). 모두 단색 도트 · steps 움직임(흐린 빛 없음)
const tierOf = (r) => (!r || r.kind === "none" ? "none" : rarityRank(r.rarity) >= 4 ? "high" : rarityRank(r.rarity) >= 2 ? "mid" : "low");
const hintOf = (r) => (tierOf(r) === "high" ? rarityOf(r.rarity).c : null);
// 등급 번호(꽝 -1 · 일반 0 … 유물 6) · 가장 높은 결과(10장이면 연출 · 소리 · 이음매 색을 이것 하나로) · 카드 단계
const rankOf = (r) => (!r || r.kind === "none" ? -1 : rarityRank(r.rarity));
const topOf = (list) => list.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a), list[0]);
const cardTier = (rank) => (rank < 0 ? "none" : rank >= 4 ? "high" : rank >= 2 ? "mid" : "low");

// 📌 2026-10-25 결과 보이기 계획 — 약속 REVEAL-SPEC.md §1. 시각은 모두 R0(커튼이 열리기 시작 = finish) 기준 ms.
//    결과 목록 하나로 한 번 계산하는 순수 함수 — 소리는 이것으로 한 번에 걸고(sfx — 울리기 SFX_LEAD 앞부터는 오디오 시계), 화면은 같은 시각을 CSS animation-delay(인라인 변수)로 그린다.
//    📌 2026-10-25 소리를 거는 때는 계획이 화면에 들어간 직후(useLayoutEffect) — finish 때 걸면 창 전체를 다시 그리는 시간(폰 수십 ms)만큼 소리가 그림보다 앞섰다.
//    React 타이머는 끝(end — 다 보임 · 알림) 하나뿐
const R_C0 = 560; // 테가 일반 색으로 켜지는 때(= 0단) — 커튼이 거의 다 열린 뒤
const R_GAP = [0, 150, 165, 185, 210, 245, 290]; // j 단에 닿는 간격 — 위로 갈수록 느려진다(설렘)
const R_SEMI = [0, 2, 4, 7, 9, 12, 14]; // 단마다 goedam-step 음높이(반음, 오음 사다리 — 바닥음은 파일)
const R_FOLD = 120; // 뒷면 접힘(steps 3) — 끝나면 앞면이 펴지고 등급 효과 · 소리가 시작
const R_SHOWN = 260; // 뒤집기부터 앞면이 다 펴질 때까지(접힘 120 + 펴짐 140) — 다 보임 · 알림
// 10장 — 첫 뒤집기 · 다음 칸 간격 · 전설 이상 칸 앞 멈춤(마지막 한 장은 last) · 뒷면 놓기 시작 · 놓는 간격 · 떨림 한 번(ms)
//    📌 뒷면 놓기는 커튼이 칸을 드러낸 뒤(2026-10-25 검토: 0~270ms 에 놓으면 열 칸 중 7~8칸의 팝이 아직 열리는 커튼 밑에서 끝났다)
const R_10 = { first: 700, next: 110, hold: 320, last: 560, drop0: 360, drop: 24, jit: 105 };
// 📌 goedam-charge 길이(ms) — 끝 30ms 비움이 등급 소리 첫 타격 바로 앞에 오게 (펴짐 − 이 값)에 튼다. 한 장은 멈춤 시작(t_k) 그대로, 10장은 멈춤 시작 + 40ms
//    (2026-10-25 검토: 0.42s 파일을 멈춤 시작에 틀면 '흡 … (틈) … 쾅' — 파일을 0.5s 로 늘리고 시각을 이렇게 맞춤)
const R_CHARGE = 500;
// 등급 소리 — 꽝 none · 일반/고급 low · 희귀/영웅 mid · 전설 high · 신화/유물 high + myth(같이). tier = 등급 번호(건너뛸 때 이미 울렸는지 본다)
const tierSfx = (rank, at = 0) =>
  (rank < 0 ? ["goedam-none"] : rank >= 4 ? ["goedam-high", ...(rank >= 5 ? ["goedam-myth"] : [])] : [rank >= 2 ? "goedam-mid" : "goedam-low"]).map((name) => ({ name, at, tier: rank }));
// 📌 2026-10-25 검토: 10장 뒤집기(기본 0.6 배)는 앞 칸의 high(+ myth) 꼬리(1.8kHz 위 종 · 반짝이)가 남은 동안 '착'이 10~13dB 묻혀 박자가 끊긴다 →
//    그 등급 소리가 울린 뒤 지난 시간만큼 키운다. 측정: high 위 대역은 0.5초까지 거의 그대로 · 1.1초쯤 '착' 아래로, myth 는 1.5초까지 · 2.3초쯤(ms)
const flipVol = (hits, at) => {
  let db = 0;
  for (const h of hits) {
    const dt = at - h.at, [hold, gone, top] = h.myth ? [1500, 2300, 12] : h.hit ? [300, 700, 6] : [500, 1100, 10];
    if (dt >= 0) db = Math.max(db, top * (dt <= hold ? 1 : dt >= gone ? 0 : (gone - dt) / (gone - hold)));
  }
  return 0.6 * 10 ** (db / 20);
};
// → { cards: [{ rank, rungs(1장 — [{ at, c }] 테가 오르는 단), hold(멈춤 시작 · 전설 이상만, 아니면 null), flip(뒤집기 시각), drop · c(10장) }], fx(큰 효과 시각), sounds: [{ name, at, rate, vol, tier? }], end }
const revealPlan = (list) => {
  const sounds = [{ name: "goedam-open", at: 0 }];
  if (list.length === 1) {
    const k = rankOf(list[0]);
    const rungs = [];
    let t = R_C0;
    for (let j = 0; j <= k; j++) {
      if (j) t += R_GAP[j];
      rungs.push({ at: t, c: RARITIES[j].c });
      sounds.push({ name: "goedam-step", at: t, rate: 2 ** (R_SEMI[j] / 12), vol: 0.75 + (0.25 * j) / 6 });
    }
    const hold = k >= 4 ? t : null; // 전설 이상 — 떨림 · 깜빡 · 차오름(380ms). 그 아래는 220ms 그냥 멈춤
    const flip = k < 0 ? 760 : t + (hold != null ? 380 : 220);
    if (hold != null) sounds.push({ name: "goedam-charge", at: flip + R_FOLD - R_CHARGE }); // = hold
    sounds.push({ name: "goedam-flip", at: flip }, ...tierSfx(k, flip + R_FOLD));
    return { cards: [{ rank: k, rungs, hold, flip }], fx: flip + R_FOLD, sounds, end: flip + R_SHOWN };
  }
  // 📌 2026-10-25 운영자 「높은 등급을 맨 뒤에」 — 칸 자리는 그대로, 뒤집는 차례만 바꾼다:
  //    ① 전설 아래 칸을 칸 차례대로 빠르게(희귀 '팅' · 영웅 '팅팅' + 칸 작은 흔들림) → ② 전설 이상 칸을 등급 오름차순(같은 등급은 칸 차례)으로 한 장씩,
  //    칸마다 멈춤(떨림 · 그 등급 색 테 깜빡) 뒤 「짧은 타격(goedam-hit) + 칸 고리」 → ③ 맨 마지막 한 장(가장 높은 것 — 같은 등급이면 마지막 칸)만
  //    긴 멈춤 + charge → high(+ 신화 이상 myth) 전체 + 큰 효과(번쩍 · 금가루 · 큰 흔들림 — fx)
  const ks = list.map(rankOf);
  const idx = ks.map((_, i) => i);
  const highs = idx.filter((i) => ks[i] >= 4).sort((a, b) => ks[a] - ks[b] || a - b);
  const order = [...idx.filter((i) => ks[i] < 4), ...highs];
  const finale = highs.length ? highs[highs.length - 1] : -1;
  const cards = list.map((r, i) => ({ rank: ks[i], rungs: [], hold: null, flip: 0, drop: R_10.drop0 + i * R_10.drop, c: ks[i] < 0 ? "#3a3186" : rarityOf(r.rarity).c }));
  const hits = []; // 앞 칸들의 타격 · 등급 소리(flipVol)
  let t = R_10.first - R_10.next, nHit = 0;
  order.forEach((i, pos) => {
    const k = ks[i], c = cards[i];
    t += R_10.next;
    if (k >= 4) {
      // 그 칸 차례 앞에서 멈춤 — 그 칸 뒷면만 떨고 깜빡(떨림 횟수 jn = 멈춤 ÷ 한 번)
      const holdMs = i === finale ? R_10.last : R_10.hold;
      c.hold = t;
      c.jn = Math.max(2, Math.round(holdMs / R_10.jit));
      t += holdMs;
    }
    // 뒷면이 다 놓이기 전엔 안 뒤집는다(칸 차례가 뒤로 밀린 앞 칸이 아니라면 생길 일 없음 — 안전판)
    t = Math.max(t, c.drop + 170);
    c.flip = t;
    const rate = 1 + 0.025 * pos;
    // 📌 뒤집기 '착'은 파일 120ms — rate 를 올리면 당겨지므로 시작을 늦춰 펴짐(F+120)에 맞춘다(2026-10-25 검토: 끝 칸은 36ms 앞서 플램)
    sounds.push({ name: "goedam-flip", at: t + R_FOLD - R_FOLD / rate, rate, vol: flipVol(hits, t + R_FOLD) });
    if (k === 2) sounds.push({ name: "goedam-step", at: t + R_FOLD, rate: 2 });
    if (k === 3) {
      c.jolt = true;
      sounds.push({ name: "goedam-step", at: t + R_FOLD, rate: 2 }, { name: "goedam-step", at: t + R_FOLD + 70, rate: 2 * 2 ** (4 / 12) });
    }
    if (k >= 4 && i !== finale) {
      // 짧은 타격 — 한 장씩 조금씩 높게(온음씩) · 칸 고리
      c.ring = true;
      sounds.push({ name: "goedam-hit", at: t + R_FOLD, rate: 2 ** ((2 * nHit) / 12) });
      hits.push({ at: t + R_FOLD, hit: true });
      nHit++;
    }
    if (i === finale) {
      sounds.push({ name: "goedam-charge", at: t + R_FOLD - R_CHARGE }, ...tierSfx(k, t + R_FOLD));
      hits.push({ at: t + R_FOLD, myth: k >= 5 });
    }
  });
  const top = Math.max(...ks);
  const lastFlip = cards[order[order.length - 1]].flip;
  // 전설 이상 칸이 없으면 마지막 칸이 펴질 때 가장 높은 등급 소리 하나
  if (top < 4) sounds.push(...tierSfx(top, lastFlip + R_FOLD));
  // 큰 효과 — 마지막 한 장(전설 이상) · 없으면 가장 높은 칸이 처음 펴질 때
  const fxCard = finale >= 0 ? cards[finale] : cards[order.find((i) => ks[i] === top)];
  return { cards, fx: fxCard.flip + R_FOLD, sounds, end: lastFlip + R_SHOWN };
};
// 📌 폰 판 기준 — 이벤트 패스 창(NARROW_MQ)과 같은 sm 경계
const NARROW_MQ = "(max-width: 639.98px)";
const subNarrow = (cb) => {
  const mq = window.matchMedia(NARROW_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subNarrow, () => window.matchMedia(NARROW_MQ).matches, () => false);
// 📌 2026-10-25 한 장 카드 PC 큰 치수 경계(CSS .gd-card 1000px) — 그 아래는 그림도 폰 크기(48)로
const WIDE_MQ = "(min-width: 1000px)";
const subWide = (cb) => {
  const mq = window.matchMedia(WIDE_MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const useWide = () => useSyncExternalStore(subWide, () => window.matchMedia(WIDE_MQ).matches, () => false);

// 📌 색 — 짙은 밤 보라 단색. 스크린은 그보다 더 짙은 영사막
const GD = { panel: "#120c26", ink: "#07051a", text: "#f1ecff", sub: "#8f88c8", mute: "#6f68a0", screen: "#07050f", cyan: "#9ff8ff", gold: "#ffe08a" };
// 계단 모서리 — 3px 한 단 · 6px 두 단 · 위만(폰 시트). 이벤트 패스 창과 같은 값
const NOTCH = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% calc(100% - 3px),calc(100% - 3px) calc(100% - 3px),calc(100% - 3px) 100%,3px 100%,3px calc(100% - 3px),0 calc(100% - 3px),0 3px,3px 3px)";
const NOTCH6 = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% calc(100% - 6px),calc(100% - 3px) calc(100% - 6px),calc(100% - 3px) calc(100% - 3px),calc(100% - 6px) calc(100% - 3px),calc(100% - 6px) 100%,6px 100%,6px calc(100% - 3px),3px calc(100% - 3px),3px calc(100% - 6px),0 calc(100% - 6px),0 6px,3px 6px,3px 3px,6px 3px)";
const NOTCH_TOP = "polygon(3px 0,calc(100% - 3px) 0,calc(100% - 3px) 3px,100% 3px,100% 100%,0 100%,0 3px,3px 3px)";
const NOTCH6_TOP = "polygon(6px 0,calc(100% - 6px) 0,calc(100% - 6px) 3px,calc(100% - 3px) 3px,calc(100% - 3px) 6px,100% 6px,100% 100%,0 100%,0 6px,3px 6px,3px 3px,6px 3px)";

const fmt = (n) => Math.max(0, Math.floor(Number(n) || 0)).toLocaleString("ko-KR");
// ── 시각 — 서버가 ISO 글자 · ms 숫자 어느 쪽으로 줘도 같게. 표기는 KST ──
const KST = 9 * 3600000;
const msOf = (v) => {
  const t = typeof v === "number" ? v : Date.parse(v || "");
  return Number.isFinite(t) ? t : NaN;
};
// 끝은 들어가지 않으므로(11. 9. 00:00) 1ms 빼서 마지막 날로
const kstOf = (v, endExclusive = false) => {
  const t = msOf(v);
  return Number.isFinite(t) ? new Date(t - (endExclusive ? 1 : 0) + KST) : null;
};
const dayOf = (v, endExclusive = false) => {
  const d = kstOf(v, endExclusive);
  return d ? `${d.getUTCMonth() + 1}. ${d.getUTCDate()}.` : "";
};
const hmOf = (v) => {
  const d = kstOf(v);
  return d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : "";
};
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const wdOf = (v) => {
  const d = kstOf(v);
  return d ? WD[d.getUTCDay()] : "";
};
// 칩 단 색 — 희귀도 색을 흰색 · 검정 쪽으로(위 밝은 단 · 아래 어두운 단). 이벤트 패스 칩과 같은 셈
const mixHex = (hex, to, t) => {
  const p = (h) => (/^#[0-9a-f]{6}$/i.test(String(h || "")) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null);
  const a = p(hex), b = p(to);
  if (!a || !b) return hex;
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};
// 당첨 알림 · 결과 글자 — 꽝은 「다음 기회에」, 나머지는 상품 이름
const nameOf = (r) => (r?.kind === "none" ? "다음 기회에" : String(r?.name || "").trim() || "상품");
const winText = (r) => (r?.kind === "none" ? "다음 기회에" : `${nameOf(r)} 당첨`);
// 여러 장 알림 — 가장 높은 것 + 「외 N개」(꽝은 세지 않는다)
const batchText = (list) => {
  if (list.length === 1) return winText(list[0]);
  const won = list.filter((r) => r.kind !== "none");
  if (!won.length) return "다음 기회에";
  return won.length > 1 ? `${nameOf(topOf(won))} 외 ${won.length - 1}개 당첨` : winText(won[0]);
};
// 결과 카드 둘째 줄 — XP · 빙옥은 양, 아이템은 개수(2개 이상). 이름에 이미 그 숫자가 있으면 빼서 같은 글자를 두 번 찍지 않는다
const amountOf = (r) => {
  if (!r) return "";
  const n = Math.floor(Number(r.amount) || 0);
  const name = String(r.name || "");
  if ((r.kind === "xp" || r.kind === "point") && n > 0) {
    if (name.includes(fmt(n)) || name.includes(String(n))) return "";
    return `+${fmt(n)} ${r.kind === "xp" ? "XP" : "빙옥"}`;
  }
  const count = Math.floor(Number(r.count) || 0);
  if (r.kind === "item" && count > 1) return name.includes(`×${fmt(count)}`) ? "" : `×${fmt(count)}`;
  return "";
};
// 📌 상품 줄 확률(2026-10-25 운영자 「확률과 남은 수를 한 줄에」) — 서버 chance(%, 뽑기와 같은 후보의 비중 몫). 소수 둘째 자리까지(끝 0 은 뗀다) · 0.01% 미만은 「<0.01%」 · 100% 가 아닌데 반올림이 100 이 되면 「>99.99%」 · 후보가 아니면(다 나감 · 이미 가진 1개짜리) 0%
const pctOf = (v) => {
  const n = Number(v) || 0;
  if (n <= 0) return "0%";
  if (n < 0.01) return "<0.01%";
  if (n > 99.99 && n < 100) return ">99.99%";
  return `${(Math.round(n * 100) / 100).toLocaleString("ko-KR")}%`;
};

// 📌 코드 복사 — 클립보드 API, 막혀 있으면(옛 브라우저 · http) 숨은 글 상자로 한 번 더
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

// ── 효과음 — 창 단추 · 탭 · 복사는 이벤트 패스 창과 같은 playTone 어휘(거절 · 틱). 뽑기 소리는 전부 public/sfx/goedam-* 파일(sfx — 위)
//    📌 2026-10-25 당김 · 찢김의 톱니 버즈(playTone sawtooth)는 "짜쳐"로 goedam-tug · goedam-tear 파일로 바꿈 ──
const sfxNo = () => playTone(330, 0.12, "sine", 0.03);
const sfxTick = () => playTone(660, 0.05, "sine", 0.025);

// ── 찢기 — 톱니 절단면(몸통 오른쪽 · 꼬리표 왼쪽이 맞물린다, 이 14개 · 깊이 2칸) · 종이 조각(칸 단위, 절취선에서 튄다) ──
const ZIG_N = 14;
const ZIG_R = `polygon(0 0,${Array.from({ length: ZIG_N + 1 }, (_, i) => `${i % 2 ? "calc(100% - var(--u) * 2)" : "100%"} ${((i * 100) / ZIG_N).toFixed(3)}%`).join(",")},0 100%)`;
const ZIG_L = `polygon(${Array.from({ length: ZIG_N + 1 }, (_, i) => `${i % 2 ? "0" : "calc(var(--u) * 2)"} ${((i * 100) / ZIG_N).toFixed(3)}%`).join(",")},100% 100%,100% 0)`;
// 닫히는 커튼 안쪽 끝 물결 — 12칸마다 2칸 들어갔다 나옴(오른쪽 커튼은 좌우 뒤집혀 맞물린다)
const DRAPE_EDGE = `polygon(0 0,100% 0,${Array.from({ length: 11 }, (_, i) => `${i % 2 ? "100%" : "calc(100% - var(--u) * 2)"} ${(((i + 1) * 100) / 12).toFixed(3)}%`).join(",")},100% 100%,0 100%)`;
const SCRAPS = [
  { y: 9, dx: 7, dy: -9, r: 135, s: 2, c: "#ffae4a" },
  { y: 15, dx: 11, dy: -4, r: -90, s: 1, c: "#43186a" },
  { y: 21, dx: 5, dy: -12, r: 180, s: 2, c: "#ff8f2e" },
  { y: 27, dx: 13, dy: 2, r: 90, s: 1, c: "#ffd08a" },
  { y: 33, dx: 8, dy: 9, r: -135, s: 2, c: "#5a2380" },
  { y: 39, dx: 12, dy: 13, r: 45, s: 1, c: "#ffae4a" },
  { y: 45, dx: 6, dy: 16, r: -180, s: 2, c: "#e5691c" },
  { y: 30, dx: -5, dy: -7, r: 90, s: 1, c: "#ffd08a" },
];

// ── 창 CSS — 단색 · 도트 테만(그라데이션 · 흐린 빛 금지). 움직임은 창 열림 · 추첨권 떠 있기 · 뽑기 애니메이션 · 결과 카드 등장 ──
//    📌 스크린 치수는 CSS 변수로 — --u 추첨권 칸 하나 px(정수만) · --sh 스크린 높이(짝수 — 가운데 자리가 반 픽셀에 걸리지 않게)
const GD_CSS = `
@keyframes gdIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes gdFloat { 0%, 100% { transform: translateY(0); } 25%, 75% { transform: translateY(calc(var(--u) * -1)); } 50% { transform: translateY(calc(var(--u) * -2)); } }
@keyframes gdTear { 0% { transform: none; } 22% { transform: translateX(calc(var(--u) * 2)) rotate(5deg); } 100% { transform: translate(calc(var(--u) * 10), var(--sh)) rotate(28deg); } }
@keyframes gdJolt { 0%, 100% { transform: none; } 50% { transform: translateX(calc(var(--u) * -1)); } }
@keyframes gdSink { to { transform: translateY(var(--sh)); } }
@keyframes gdPop { 0% { opacity: 0; transform: scale(.72); } 70% { opacity: 1; transform: scale(1.04); } 100% { opacity: 1; transform: none; } }
.gd-win { position: relative; width: 100%; height: 88vh; height: 88dvh; padding: 3px 3px 0; background: ${GD.ink}; clip-path: ${NOTCH6_TOP}; animation: gdIn .32s cubic-bezier(0.16,1,0.3,1); color: ${GD.text}; }
.gd-wi { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: ${GD.panel}; clip-path: ${NOTCH_TOP}; }
.gd-wi::after { content: ""; position: absolute; inset: 0; z-index: 40; pointer-events: none; box-shadow: inset 3px 3px 0 #2c2468, inset -3px 0 0 #0b0822; }
@media (min-width: 640px) {
  .gd-win { max-width: 960px; height: auto; padding: 3px; clip-path: ${NOTCH6}; }
  .gd-wi { height: auto; max-height: calc(min(780px, 94vh) - 6px); clip-path: ${NOTCH}; }
  .gd-wi::after { box-shadow: inset 3px 3px 0 #2c2468, inset -3px -3px 0 #0b0822; }
}
/* 📌 이벤트 창 안(embedded) — 크기는 이벤트 창(./EventTabs.js EventHub)이 정하고 창은 그 칸을 꽉 채운다. 열림 움직임도 이벤트 창이 한 번만 */
.gd-win.emb { max-width: none; height: 100%; animation: none; }
.gd-win.emb .gd-wi { height: 100%; max-height: none; }
.gd-wi *, .gd-wi *::before, .gd-wi *::after { box-sizing: border-box; }
.gd-px { image-rendering: pixelated; }
.gd-pp { border: 3px solid ${GD.ink}; background: var(--bg, #17123a); box-shadow: inset 3px 3px 0 var(--hi, #2c2468), inset -3px -3px 0 var(--sh, #0d0a26); clip-path: ${NOTCH}; }
.gd-grab { position: absolute; z-index: 20; left: 50%; top: 9px; width: 36px; height: 6px; margin-left: -18px; background: #3a3186; }
.gd-x { position: absolute; z-index: 30; right: 12px; top: 14px; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; --bg: #221a52; --hi: #3a3186; --sh: #120e30; outline: none; cursor: pointer; }
.gd-x:hover { --bg: #2c2468; }
.gd-x:focus-visible { border-color: ${GD.cyan}; }
@media (min-width: 640px) { .gd-x { right: 18px; top: 18px; width: 36px; height: 36px; } }
/* 머리 — 제목 · 기간 알약(줄 높이 고정 — 알약이 늦게 와도 아래가 밀리지 않게) */
.gd-hd { flex: none; position: relative; display: flex; align-items: center; flex-wrap: wrap; min-height: 75px; padding: 27px 56px 12px 18px; }
.gd-hd h2 { margin: 0 10px 0 0; font-size: 19px; font-weight: 900; line-height: 30px; letter-spacing: -.01em; color: #f3efff; text-shadow: 0 3px 0 #0b0618; white-space: nowrap; }
.gd-tags { display: flex; align-items: center; }
.gd-tags > * + * { margin-left: 6px; }
@media (min-width: 640px) { .gd-hd { min-height: 78px; padding: 21px 72px 15px 24px; } .gd-hd h2 { margin-right: 14px; font-size: 26px; line-height: 36px; } }
.gd-tag { display: inline-flex; align-items: center; height: 24px; padding: 0 9px; font-size: 12px; font-weight: 700; color: ${GD.text}; white-space: nowrap; font-variant-numeric: tabular-nums; --bg: #0f0b28; --hi: #241d58; --sh: ${GD.ink}; }
.gd-off { padding: 0 8px; font-size: 11px; font-weight: 900; color: rgba(241,236,255,.6); --bg: #221a52; --hi: #3a3186; --sh: #120e30; }
/* 📌 머리 배너 — public/goedam/header.png(992 × 240 · 운영자가 글을 얹은 띠에서 › 단추만 뺀 판 — .claude/mockups/goedam/strip.mjs NOBTN). 칩(비공개 · 연출 미리보기)은 왼쪽 위에 얹는다 */
.gd-hd.ban { display: block; min-height: 0; padding: 0; }
.gd-hdi { display: block; width: 100%; height: auto; }
.gd-hd.ban .gd-tags { position: absolute; left: 12px; top: 12px; z-index: 2; }
@media (max-width: 639.98px) { .gd-hd.ban .gd-tags { top: 21px; } }
@media (min-width: 640px) { .gd-hd.ban { min-height: 0; padding: 0; } .gd-wi .gd-main { padding-top: 18px; } }
/* 📌 스크린 — 폰은 시트 폭 그대로(양옆 틀은 시트 테가 맡는다 — 360 폭에서도 추첨권 3배 348px 가 들어간다), PC 는 양옆 여백 + 제 테 */
.gd-scr { flex: none; position: relative; height: var(--sh); overflow: hidden; background: ${GD.screen}; border-top: 3px solid ${GD.ink}; border-bottom: 3px solid ${GD.ink}; box-shadow: inset 0 3px 0 #1b1440, inset 0 -3px 0 #1b1440; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; --u: 3px; --sh: 246px; --cw: 8; }
.gd-scr.tap { cursor: pointer; }
/* 무대 높이 = 위 막 12칸 + 추첨권 56칸 + 객석 10칸 + 여백 — 커튼 폭(--cw)은 폰 8칸 · PC 20칸 */
@media (max-width: 359.98px), (max-width: 639.98px) and (max-height: 600px) { .gd-scr { --u: 2px; --sh: 170px; } }
@media (min-width: 640px) {
  .gd-scr { margin: 0 24px; border: 3px solid ${GD.ink}; box-shadow: inset 0 0 0 3px #1b1440; clip-path: ${NOTCH}; --u: 3px; --sh: 300px; --cw: 20; }
}
@media (min-width: 640px) and (max-height: 700px) { .gd-scr { --sh: 250px; --cw: 16; } }
.gd-tk, .gd-tka { position: absolute; left: 50%; top: 50%; width: calc(var(--u) * ${TK.w}); height: calc(var(--u) * ${TK.h}); margin: calc(var(--u) * ${-TK.h / 2}) 0 0 calc(var(--u) * ${-TK.w / 2}); }
.gd-tk img, .gd-tka img { display: block; height: 100%; }
.gd-tk img { width: 100%; }
.gd-tk.live img { animation: gdFloat 3s steps(1, end) infinite; }
.gd-tk.none img { opacity: .35; }
.gd-xn { position: absolute; right: calc(var(--u) * 3); bottom: calc(var(--u) * -3); display: inline-flex; align-items: center; height: 28px; padding: 0 10px 1px; font-size: 16px; font-weight: 900; line-height: 1; color: ${GD.gold}; background: ${GD.ink}; clip-path: ${NOTCH}; font-variant-numeric: tabular-nums; }
.gd-tk.none .gd-xn { color: ${GD.mute}; }
@media (min-width: 640px) { .gd-xn { height: 34px; padding: 0 12px 1px; font-size: 20px; } }
.gd-tm, .gd-ts { position: absolute; top: 0; height: 100%; }
.gd-tm { left: 0; width: calc(var(--u) * ${TK.cut}); }
.gd-ts { left: calc(var(--u) * ${TK.cut}); width: calc(var(--u) * ${TK.w - TK.cut}); }
.gd-tm img, .gd-ts img { width: 100%; }
.gd-tka.tear .gd-ts { transform-origin: 0 100%; animation: gdTear .62s cubic-bezier(.45,0,.85,.55) forwards; }
.gd-tka.tear .gd-tm { animation: gdJolt .16s steps(2, end), gdSink .24s cubic-bezier(.5,0,.9,.5) .42s forwards; }
.gd-msg { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: rgba(241,236,255,.55); }
.gd-msg .gd-gb { margin-top: 12px; }
/* 📌 결과 카드 — 짙은 테 3px 안에 희귀도 색 테 3px(--rc) · 안쪽 단. 그림 | 칩 · 이름 · 양(또는 코드 + 복사)
     2026-10-25 앞면은 뒷면(.gd-bk)과 같은 칸에 겹쳐 두고 --f1(뒷면이 다 접힌 때)에 가로로 펴진다(steps 3 — 펴지기 전엔 scaleX 0 으로 안 보임) */
/* 📌 2026-10-25 검토: 양옆 여백 12px 이면 한 장 카드 양끝이 쉬는 커튼(z 8 · 안쪽 --cw 칸 + 물결) 밑에 들어가 오르는 등급 테가 위아래만 보였다(폰 12px · 좁은 PC 48px 가려짐)
     → 여백을 커튼 폭 + 2칸으로(10장 칸이 (--cw + 3)칸 들여 피하는 것과 같은 셈). 남는 칸이 좁은 PC(1000px 아래)는 카드를 폰 치수로(아래) */
.gd-rs { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 0 calc(var(--u) * (var(--cw) + 2)); }
.gd-card { position: relative; display: flex; align-items: center; width: 100%; max-width: 440px; min-height: 0; padding: 15px 18px; border: 3px solid ${GD.ink}; background: #17123a; box-shadow: inset 0 0 0 3px var(--rc), inset 6px 6px 0 #2c2468, inset -6px -6px 0 #0d0a26; clip-path: ${NOTCH}; animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both; cursor: default; }
.gd-ci { flex: none; display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; line-height: 0; color: #fff; }
.gd-ct { flex: 1 1 0%; min-width: 0; margin-left: 15px; }
.gd-cn { margin: 0; font-size: 17px; font-weight: 900; line-height: 1.3; color: #fff; overflow-wrap: anywhere; }
.gd-ca { margin: 3px 0 0; font-size: 13px; font-weight: 800; color: ${GD.gold}; font-variant-numeric: tabular-nums; }
.gd-ct .gd-chip { margin-bottom: 6px; }
.gd-card.none .gd-cn { color: #d8d2f5; }
/* PC 큰 카드 치수는 1000px 부터 — 640~999px(태블릿 · 좁은 창)은 스크린이 좁아 커튼 안쪽에 폰 치수(그림 48 · 여백 15/18)로 둔다 */
@media (min-width: 1000px) { .gd-card { padding: 21px 24px; } .gd-ci { width: 96px; height: 96px; } .gd-ct { margin-left: 21px; } .gd-cn { font-size: 21px; } .gd-ca { font-size: 14px; } }
@media (max-width: 359.98px), (max-width: 639.98px) and (max-height: 600px) { .gd-card { padding: 9px 12px; } .gd-ci { width: 48px; height: 48px; } .gd-cn { font-size: 15px; } .gd-ct .gd-chip { display: none; } }
/* 코드 줄 — 고정폭 글자 칸 + 「복사」 */
.gd-code { display: flex; align-items: center; margin-top: 6px; min-width: 0; }
.gd-code code { flex: 1 1 auto; min-width: 0; height: 30px; padding: 0 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; font-weight: 700; line-height: 30px; color: #fff; background: ${GD.ink}; clip-path: ${NOTCH}; user-select: all; -webkit-user-select: all; }
.gd-code .gd-sb { flex: none; margin-left: 6px; }
/* 금색 도트 단추 — 이벤트 패스 받기 단추와 같은 결 */
.gd-gb { position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 0; background: #e2b04a; color: #2a1606; font-weight: 900; white-space: nowrap; border: 3px solid ${GD.ink}; box-shadow: inset 0 3px 0 #ffe08a, inset 0 -4px 0 #9c6a22; clip-path: ${NOTCH}; outline: none; cursor: pointer; }
.gd-gb:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 2px 0 #ffe08a, inset 0 -2px 0 #9c6a22; }
.gd-gb:focus-visible { border-color: #fff; }
.gd-gb:disabled { cursor: default; }
.gd-gb.md { height: 34px; padding: 0 16px 2px; font-size: 12.5px; }
.gd-act { flex: none; display: flex; flex-direction: column; align-items: center; padding: 12px 15px; }
.gd-sb.gd-buy { width: 100%; height: 40px; margin-top: 9px; font-size: 13px; line-height: 32px; text-decoration: none; }
.gd-go { width: 100%; height: 56px; padding: 0 20px 3px; font-size: 17px; }
.gd-go.off { background: #2a2458; color: rgba(241,236,255,.45); box-shadow: inset 0 3px 0 #3a3186, inset 0 -4px 0 #17133a; }
.gd-go .gd-lk { display: block; margin-right: 9px; line-height: 0; }
.gd-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
@media (min-width: 640px) { .gd-act { padding: 15px 24px 12px; } .gd-go { width: 400px; } }
/* 보라 도트 단추(복사) */
.gd-sb { display: inline-flex; align-items: center; justify-content: center; min-width: 52px; height: 30px; padding: 0 10px 2px; font-size: 12px; font-weight: 900; color: ${GD.text}; white-space: nowrap; outline: none; cursor: pointer; --bg: #2c2468; --hi: #4a3fa0; --sh: #17133a; }
.gd-sb:hover { --bg: #3a3186; }
.gd-sb:active { transform: translateY(2px); }
.gd-sb:focus-visible { border-color: ${GD.cyan}; }
/* 희귀도 칩 — 등급 색 단색 판 + 짙은 글자(두 글자라 폭이 같다) */
.gd-chip { display: inline-flex; align-items: center; justify-content: center; flex: none; min-width: 42px; height: 22px; padding: 0 6px; font-size: 11px; font-weight: 900; line-height: 16px; color: ${GD.ink}; white-space: nowrap; }
/* 📌 폰 밑줄 탭 — 세 칸 같은 폭 · 같은 굵기(켜짐은 색 · 밑줄만) — 탭을 바꿔도 글자 · 줄이 움직이지 않는다 */
.gd-tabs { flex: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0 15px; box-shadow: inset 0 -3px 0 #1d1745; }
.gd-tab { position: relative; height: 42px; padding: 0; background: none; border: 0; font-size: 13px; font-weight: 800; line-height: 18px; color: ${GD.sub}; outline: none; cursor: pointer; -webkit-tap-highlight-color: transparent; }
.gd-tab.on { color: #fff; }
.gd-tab.on::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 3px; background: ${GD.gold}; }
.gd-tab:focus-visible { color: ${GD.cyan}; }
/* 목록 — 이 칸만 스크롤(폰은 시트 아래 · PC 는 옆판 안). 📌 PC 옆판은 contain: size — 목록이 길어도 창 높이는 왼쪽(무대 + 단추)이 정한다 */
.gd-body { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; padding: 3px 15px calc(18px + env(safe-area-inset-bottom)); }
.gd-body::-webkit-scrollbar { display: none; }
@media (max-width: 639.98px) { .gd-r.gd-pp { border: 0; background: none; box-shadow: none; clip-path: none; } }
@media (min-width: 640px) { .gd-r { contain: size; } }
.gd-row { display: flex; align-items: center; min-height: 48px; padding: 6px 0; }
.gd-row + .gd-row { box-shadow: inset 0 3px 0 #1d1745; }
.gd-row.out, .gd-row.dim { opacity: .45; }
.gd-nm { display: block; min-width: 0; font-size: 13.5px; font-weight: 700; color: ${GD.text}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gd-sm { display: flex; align-items: center; margin-top: 2px; font-size: 11px; font-weight: 700; color: ${GD.sub}; white-space: nowrap; font-variant-numeric: tabular-nums; }
.gd-sm > * + * { margin-left: 4px; }
.gd-mi { display: flex; line-height: 0; } /* 작은 추첨권 도트 — ItemIcon 이 제 여백(가운데 맞춤)을 인라인으로 쓰므로 한 겹 감싼다 */
.gd-tx { flex: 1 1 0%; min-width: 0; }
.gd-pz .gd-nm { flex: 1 1 0%; margin-left: 9px; }
/* 상품 줄 오른쪽 — [남은 수(수량 있는 상품만)] [확률]. 확률 칸은 폭 고정이라 남은 수가 줄마다 같은 자리에 선다(∞ 표시 없음 — 운영자 "무한은 좀 없애고") */
.gd-cnt { flex: none; margin-left: 9px; font-size: 12px; font-weight: 700; color: ${GD.sub}; font-variant-numeric: tabular-nums; }
.gd-pct { flex: none; min-width: 52px; margin-left: 9px; text-align: right; font-size: 12.5px; font-weight: 800; color: #d8d2f5; font-variant-numeric: tabular-nums; }
.gd-dt { flex: none; width: 52px; margin-right: 9px; font-variant-numeric: tabular-nums; }
.gd-dt b { display: block; font-size: 13px; font-weight: 900; line-height: 17px; color: #fff; }
.gd-dt i { display: block; font-style: normal; font-size: 11px; font-weight: 700; line-height: 15px; color: ${GD.sub}; }
.gd-stt { flex: none; display: flex; align-items: center; justify-content: center; width: 60px; margin-left: 6px; font-size: 13px; font-weight: 900; color: ${GD.mute}; line-height: 0; }
.gd-live { height: 22px; padding: 0 6px; font-size: 11px; font-weight: 900; line-height: 16px; color: #2a1006; --bg: #ff8a3d; --hi: #ffc08a; --sh: #b4521b; }
.gd-hs { flex-wrap: wrap; }
.gd-hs .gd-tx { display: flex; align-items: center; flex: 1 0 100%; } /* 코드 줄은 그 아래 한 줄 통째로 */
.gd-hs .gd-chip { margin-right: 9px; }
.gd-hs .gd-nm { flex: 1 1 0%; }
.gd-hs .gd-at { flex: none; margin-left: 9px; font-size: 11px; font-weight: 700; color: ${GD.sub}; font-variant-numeric: tabular-nums; }
.gd-hs .gd-code { flex: 1 0 100%; margin: 6px 0 3px; }
.gd-none { margin: 0; padding: 15px 0 12px; font-size: 12.5px; font-weight: 700; color: ${GD.mute}; text-align: center; }
.gd-warn { margin: 0; padding: 10px 0 9px; font-size: 11px; font-weight: 700; line-height: 16px; color: ${GD.mute}; }
.gd-warn + .gd-row { box-shadow: inset 0 3px 0 #1d1745; }
/* 📌 2026-10-24 「받는 법」 — 덩어리 머리 글(상영 · 음성 · 상점) · 음성 게이지 · 상점 줄 */
.gd-sh { margin: 0; padding: 15px 0 3px; font-size: 11px; font-weight: 900; line-height: 15px; color: ${GD.sub}; }
.gd-sh:first-child { padding-top: 9px; }
/* 음성 오늘 진행 — 10칸 도트 막대(이벤트 패스 Lv 게이지와 같은 결 · 금색 단색). 걸친 칸은 자식 요소 폭만큼만(그라데이션 없이) */
.gd-vb { display: flex; align-items: center; margin-top: 6px; }
.gd-gauge { display: flex; flex: 1 1 0%; min-width: 0; height: 15px; padding: 3px; background: ${GD.ink}; }
.gd-gauge > i { position: relative; display: block; flex: 1 1 0%; min-width: 0; background: #241d4f; }
.gd-gauge > i + i { margin-left: 3px; }
.gd-gauge > i.on, .gd-gauge > i > b { background: #e2b04a; box-shadow: inset 0 3px 0 #ffe08a, inset 0 -3px 0 #9c6a22; }
.gd-gauge > i > b { position: absolute; left: 0; top: 0; bottom: 0; }
/* 「분/N분」 — 자리 폭은 N 의 자릿수로 미리 잡는다(분이 늘어도 게이지 폭이 흔들리지 않게) */
.gd-vn { flex: none; margin-left: 9px; font-size: 12px; font-weight: 800; line-height: 15px; color: #d8d2f5; text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
/* 상점 줄 — 추첨권 도트(32 — 16칸 2배) · 이름 · 「바로가기」 */
.gd-sp .gd-nm { flex: 1 1 0%; margin-left: 9px; }
.gd-sp .gd-sb { flex: none; margin-left: 9px; text-decoration: none; }
/* 📌 2026-10-24 운영자 "상품 회차 내 당첨이 아래 있는 구조가 마음에 안 들어 · 늘어나면 UI가 늘어날 거 아니야" + 「극장 무대」
     → 창 크기 고정: PC = 왼쪽(무대 + 단추) | 오른쪽 옆판(탭 셋 · 그 안만 스크롤, 폭 300), 폰 = 시트 높이 고정 · 아래 탭 칸만 스크롤.
     무대 = 스크린 둘레에 도트 타일(public/goedam/stage-*.png — .claude/mockups/goedam/stage.mjs): 위 막(물결 · 금술) · 양옆 커튼(안쪽 금테) · 아래 객석 */
.gd-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.gd-l { flex: none; }
.gd-r { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.gd-stg { position: absolute; pointer-events: none; image-rendering: pixelated; }
.gd-val { left: 0; right: 0; top: 0; z-index: 9; height: calc(var(--u) * 12); background: url(${ART}/stage-valance.png) repeat-x 0 0 / calc(var(--u) * 16) calc(var(--u) * 12); }
/* 📌 커튼 — 양옆에 모여 있는 커튼(반쪽 폭 판에서 안쪽 --cw 칸만 무대에 나와 쉰다)이 그대로 가운데로 펼쳐졌다가(닫힘) 제자리로 모인다(열림).
     2026-10-24 운영자 "커튼이 지나가고 그 뒤에 커튼이 보이는 게 이상" — 예전엔 양옆 커튼(따로 선 판) 위로 다른 커튼이 화면 밖에서 들어와 두 겹으로 보였다.
     움직임은 "너무 정직하게 닫힌다" → 위(가로대)가 먼저 가고 아래 자락이 늦게 따라오다(비틀림) 가운데서 한 번 출렁이고 선다. 열릴 때는 아래 자락이 늦게 모이고,
     끝은 곧게 펴진 채 제자리(비틀린 채 멈추면 아래 끝이 사선으로 남는다 — "버그 있음"). 안쪽 끝은 물결(DRAPE_EDGE) + 금테, 가운데서 2칸씩 겹친다. 위 막 · 객석은 그 위 */
.gd-drape { top: 0; bottom: 0; z-index: 8; width: calc(50% + var(--u) * 2); background: url(${ART}/stage-drape.png) repeat 0 0 / calc(var(--u) * 20) calc(var(--u) * 8); transform-origin: 50% 0; clip-path: ${DRAPE_EDGE}; --restL: calc(-100% + var(--u) * var(--cw)); --restR: calc(100% - var(--u) * var(--cw)); }
.gd-drape::after { content: ""; position: absolute; top: 0; bottom: 0; right: 0; width: calc(var(--u) * 2); background: #e2b04a; box-shadow: inset calc(var(--u) * -1) 0 0 #9c6a22; }
.gd-drape.l { left: 0; transform: translateX(var(--restL)); }
.gd-drape.r { right: 0; transform: translateX(var(--restR)) scaleX(-1); }
/* 📌 2026-10-25 steps(n, end) + 채움(forwards · both) 움직임은 끝 값을 99% 에도 박아 둔다(아래 모든 계단 움직임 같음).
     브라우저가 늦춤 + 길이를 더하다 소수 오차로 끝 진행도를 1 이 아닌 0.9999999999999992 로 잡으면 steps(end) 가 마지막 단을 못 밟고
     한 단 앞 값에 그대로 멈춘다 — 운영자 "희귀에서 왜 찌부되냐"(앞면이 scaleX .667 에서 멈춤 · 실측). 99~100% 는 끝 값 그대로라 오차가 나도 끝 값 */
@keyframes gdShutL { 0% { transform: translateX(var(--restL)); } 45% { transform: translateX(-34%) skewX(-7deg); } 72% { transform: translateX(1.5%) skewX(3deg); } 86% { transform: translateX(-.8%) skewX(-1.5deg); } 99%, 100% { transform: none; } }
@keyframes gdShutR { 0% { transform: translateX(var(--restR)) scaleX(-1); } 45% { transform: translateX(34%) scaleX(-1) skewX(-7deg); } 72% { transform: translateX(-1.5%) scaleX(-1) skewX(3deg); } 86% { transform: translateX(.8%) scaleX(-1) skewX(-1.5deg); } 99%, 100% { transform: scaleX(-1); } }
@keyframes gdOpenL { 0% { transform: none; } 22% { transform: translateX(-6%) skewX(4deg); } 75% { transform: translateX(calc(var(--restL) + 8%)) skewX(4deg); } 99%, 100% { transform: translateX(var(--restL)); } }
@keyframes gdOpenR { 0% { transform: scaleX(-1); } 22% { transform: translateX(6%) scaleX(-1) skewX(4deg); } 75% { transform: translateX(calc(var(--restR) - 8%)) scaleX(-1) skewX(4deg); } 99%, 100% { transform: translateX(var(--restR)) scaleX(-1); } }
.gd-drape.l.shut { animation: gdShutL .6s steps(12, end) both; }
.gd-drape.r.shut { animation: gdShutR .6s steps(12, end) both; }
.gd-drape.l.open { animation: gdOpenL .62s steps(12, end) forwards; }
.gd-drape.r.open { animation: gdOpenR .62s steps(12, end) forwards; }
/* 이음매 빛줄(전설 이상) — 커튼이 다 닫힌 뒤(.6s)에만 켜진다(기다리는 동안은 안 보이게 — 채움 없음) */
@keyframes gdBlink { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
.gd-seam { left: 50%; top: calc(var(--u) * 12); bottom: calc(var(--u) * 10); z-index: 9; width: var(--u); margin-left: calc(var(--u) * -0.5); background: var(--rc); opacity: 0; animation: gdBlink .3s steps(1, end) .6s infinite; }
.gd-seat { left: 0; right: 0; bottom: 0; z-index: 10; height: calc(var(--u) * 10); background: url(${ART}/stage-seats.png) repeat-x 0 0 / calc(var(--u) * 14) calc(var(--u) * 10); }
@media (min-width: 640px) {
  .gd-main { flex-direction: row; padding: 0 24px 24px; }
  .gd-l { flex: 1 1 0%; min-width: 0; }
  .gd-l .gd-scr { margin: 0; }
  .gd-l .gd-act { padding: 15px 0 0; }
  .gd-l .gd-go { width: 100%; }
  .gd-r { flex: none; width: 300px; margin-left: 18px; padding: 3px 12px 6px; --bg: #120e2e; --hi: #241d58; --sh: #0b0822; }
  .gd-r .gd-tabs { margin: 0; }
  .gd-r .gd-body { padding: 3px 3px 6px; }
}
/* 📌 2026-10-23 찢기 강화 — ①' 당김(몸통은 왼쪽 · 꼬리표는 오른쪽으로 팽팽) · ② 톱니 절단면 · 종이 조각 */
@keyframes gdTugM { 0%, 100% { transform: none; } 25%, 75% { transform: translateX(calc(var(--u) * -1)); } 50% { transform: translateX(calc(var(--u) * -2)); } }
@keyframes gdTugS { 0%, 100% { transform: none; } 25%, 75% { transform: translateX(var(--u)) rotate(1deg); } 50% { transform: translateX(calc(var(--u) * 2)) rotate(2deg); } }
.gd-tka.tug .gd-tm { animation: gdTugM .18s steps(4, end); }
.gd-tka.tug .gd-ts { transform-origin: 0 100%; animation: gdTugS .18s steps(4, end); }
.gd-tka.tear .gd-tm img { clip-path: ${ZIG_R}; }
.gd-tka.tear .gd-ts img { clip-path: ${ZIG_L}; }
@keyframes gdScrap { 0% { opacity: 1; transform: none; } 99%, 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)); } }
.gd-scrap { position: absolute; left: calc(var(--u) * ${TK.cut - 1}); width: var(--s); height: var(--s); background: var(--c); animation: gdScrap .56s steps(7, end) forwards; pointer-events: none; }
/* 📌 2026-10-23 희귀도 연출 — 결과 카드 둘레. 번쩍(high) · 고리(mid · high) · 반짝이(low · mid · high) · 색종이(high) · 흔들림(high) · 테 깜빡임(mid · high) */
@keyframes gdFlash { 0% { opacity: 1; } 30% { opacity: .6; } 65% { opacity: .25; } 99%, 100% { opacity: 0; } }
.gd-flash { position: absolute; inset: 0; z-index: 6; background: #fff; opacity: 0; animation: gdFlash .26s steps(1, end) forwards; pointer-events: none; }
@keyframes gdRing { 0% { opacity: 1; transform: scale(.3); } 99%, 100% { opacity: 0; transform: scale(1.9); } }
.gd-ring { position: absolute; left: 50%; top: 50%; z-index: 1; width: calc(var(--u) * 44); height: calc(var(--u) * 44); margin: calc(var(--u) * -22) 0 0 calc(var(--u) * -22); border: calc(var(--u) * 2) solid var(--rc); clip-path: ${NOTCH6}; opacity: 0; animation: gdRing .5s steps(5, end) forwards; pointer-events: none; }
/* 별 반짝임 — 카드 둘레 고정 자리에서 십자 별이 커졌다 작아지며 반짝(튀지 않는다 — 2026-10-24 "기본 효과를 넣되") */
@keyframes gdTwk { 0% { opacity: 0; transform: scale(0); } 25% { opacity: 1; transform: scale(1.25); } 50% { opacity: 1; transform: scale(.7); } 75% { opacity: 1; transform: scale(1); } 99%, 100% { opacity: 0; transform: scale(0); } }
.gd-twk { position: absolute; left: calc(50% + var(--x)); top: calc(50% + var(--y)); z-index: 6; width: var(--s); height: var(--s); margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2); background: var(--c); clip-path: polygon(33.34% 0,66.67% 0,66.67% 33.34%,100% 33.34%,100% 66.67%,66.67% 66.67%,66.67% 100%,33.34% 100%,33.34% 66.67%,0 66.67%,0 33.34%,33.34% 33.34%); opacity: 0; animation: gdTwk .8s steps(8, end) var(--n) both; pointer-events: none; }
/* 금가루 비(high) — 위에서 천천히 내리며 반짝(밝음 → 흐림 → 밝음), 큰 것은 십자 별. 떨어지는 시간은 알갱이마다(--t) */
@keyframes gdDust { 0% { opacity: 0; transform: none; } 8% { opacity: 1; } 40% { opacity: .45; } 52% { opacity: 1; } 78% { opacity: .5; } 88% { opacity: 1; } 99%, 100% { opacity: 0; transform: translate(var(--dx), calc(var(--sh) + var(--u) * 4)); } }
.gd-dust { position: absolute; top: calc(var(--u) * -3); z-index: 2; width: var(--s); height: var(--s); background: var(--c); opacity: 0; animation: gdDust var(--t) steps(24, end) forwards; pointer-events: none; }
.gd-dust.st { clip-path: polygon(33.34% 0,66.67% 0,66.67% 33.34%,100% 33.34%,100% 66.67%,66.67% 66.67%,66.67% 100%,33.34% 100%,33.34% 66.67%,0 66.67%,0 33.34%,33.34% 33.34%); }
@keyframes gdShake { 0%, 100% { transform: none; } 20% { transform: translate(calc(var(--u) * -2), 0); } 40% { transform: translate(calc(var(--u) * 2), var(--u)); } 60% { transform: translate(calc(var(--u) * -1), calc(var(--u) * -1)); } 80% { transform: translate(var(--u), 0); } }
.gd-rs.shake { animation: gdShake .34s steps(1, end); }
@keyframes gdShakeS { 0%, 100% { transform: none; } 33% { transform: translateX(calc(var(--u) * -1)); } 66% { transform: translateX(var(--u)); } }
.gd-rs.shake-s { animation: gdShakeS .24s steps(1, end); }
.gd-rs .gd-card { z-index: 5; }
/* 📌 2026-10-25 뒤집기 — 뒷면 가로 접힘(scaleX 1 → 0) · 앞면 펴짐(0 → 1) 모두 steps(3). 전설 이상은 펴진 뒤 한 번 크게 튐(1.1 → .98 → 1 — 두 구간 steps(2) = 네 단).
     테 깜빡임(gdEdge)은 앞면이 다 펴진(튐까지 끝난) 뒤 */
@keyframes gdFold { 0% { transform: none; } 99%, 100% { transform: scaleX(0); } }
@keyframes gdUnfold { 0% { transform: scaleX(0); } 99%, 100% { transform: none; } }
@keyframes gdBump { 0% { transform: scale(1.1); } 50% { transform: scale(.98); } 100% { transform: none; } }
@keyframes gdEdge { 0%, 100% { box-shadow: inset 0 0 0 3px var(--rc), inset 6px 6px 0 #2c2468, inset -6px -6px 0 #0d0a26; } 50% { box-shadow: inset 0 0 0 3px #fff, inset 6px 6px 0 #2c2468, inset -6px -6px 0 #0d0a26; } }
.gd-card.t-low { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdEdge .24s steps(1, end) calc(var(--f1, 0s) + .14s) 1; }
.gd-card.t-mid { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdEdge .24s steps(1, end) calc(var(--f1, 0s) + .14s) 2; }
.gd-card.t-high { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdBump .22s steps(2, end) calc(var(--f1, 0s) + .14s), gdEdge .24s steps(1, end) calc(var(--f1, 0s) + .36s) 4; }
/* 📌 2026-10-25 뒷면 카드 — 앞면과 같은 그리드 칸(.gd-flip)에 겹친다. 칸 크기는 앞면이 정하고(뒷면 그림은 칸 밖으로 안 나가는 겹) 뒤집혀도 바뀌지 않는다.
     바탕 #0f0b28 · 안쪽 단 #241d58 / #0b0822 · 테 #3a3186 → 등급 상승(.gd-rung — 단마다 그 등급 색 테 한 겹이 위에 켜진다) · 가운데 「?」 도트 · 네 구석 마름모. 글자 없음
     움직임: 단마다 살짝 툭(gdTap — 인라인 animation 목록) · 전설 이상 멈춤(.hold — 잘게 떨림 + 흰 테 깜빡) · --f0 에 접힘 */
.gd-flip { position: relative; z-index: 5; display: grid; grid-template-columns: minmax(0, 1fr); width: 100%; max-width: 440px; }
.gd-flip > * { grid-area: 1 / 1; }
@keyframes gdTap { from { transform: scale(1.03); } to { transform: none; } }
@keyframes gdJit { 0% { transform: translateX(var(--u)); } 50% { transform: translateX(calc(var(--u) * -1)); } 100% { transform: translateX(var(--u)); } }
@keyframes gdLit { to { opacity: 1; } }
@keyframes gdBl { 0% { opacity: 1; } 50% { opacity: 0; } }
.gd-bk { position: relative; min-width: 0; animation: gdFold .12s steps(3, end) var(--f0) forwards; }
.gd-bk.hold { animation: gdJit .095s steps(1, end) var(--h) 4, gdFold .12s steps(3, end) var(--f0) forwards; }
.gd-bkc { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border: 3px solid ${GD.ink}; background: #0f0b28; box-shadow: inset 0 0 0 3px #3a3186, inset 6px 6px 0 #241d58, inset -6px -6px 0 #0b0822; clip-path: ${NOTCH}; }
.gd-rung { position: absolute; inset: 0; box-shadow: inset 0 0 0 3px var(--c); opacity: 0; animation: gdLit .01s steps(1, start) var(--at) forwards; pointer-events: none; }
.gd-rung.bl { --c: #fff; animation: gdBl .095s steps(1, end) var(--h) 4; }
.gd-q { position: relative; display: block; line-height: 0; }
.gd-q svg { width: calc(var(--u) * 16); height: calc(var(--u) * 20); }
.gd-dia { position: absolute; width: calc(var(--u) * 3); height: calc(var(--u) * 3); background: #3a3186; clip-path: polygon(33.34% 0,66.67% 0,66.67% 33.34%,100% 33.34%,100% 66.67%,66.67% 66.67%,66.67% 100%,33.34% 100%,33.34% 66.67%,0 66.67%,0 33.34%,33.34% 33.34%); }
.gd-dia.a { left: calc(var(--u) * 2 + 6px); top: calc(var(--u) * 2 + 6px); }
.gd-dia.b { right: calc(var(--u) * 2 + 6px); top: calc(var(--u) * 2 + 6px); }
.gd-dia.c { left: calc(var(--u) * 2 + 6px); bottom: calc(var(--u) * 2 + 6px); }
.gd-dia.d { right: calc(var(--u) * 2 + 6px); bottom: calc(var(--u) * 2 + 6px); }
/* 건너뛰기 · 움직임 줄이기 — 앞면만 움직임 없이 바로 */
.gd-rs.now .gd-card, .gd-rs.now .gd-mc { animation: none; }
/* 10장 결과 — 무대 안쪽(위 막 · 커튼 · 객석 안) 5 × 2 칸. 칸마다 희귀도 색 테 · 그림 · 이름 · 양
   📌 2026-10-25 칸(.gd-mf)마다 뒷면(.gd-mb — 작은 「?」)과 앞면(.gd-mc)을 겹친다(앞면 칸 크기 그대로). 뒷면은 --d 에 놓이고 --f0 에 접히며 앞면은 --f1 에 펴진다 */
.gd-grid { position: absolute; z-index: 5; left: calc(var(--u) * (var(--cw) + 3)); right: calc(var(--u) * (var(--cw) + 3)); top: calc(var(--u) * 14); bottom: calc(var(--u) * 12); display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); grid-gap: calc(var(--u) * 2); }
@keyframes gdEdgeS { 0%, 100% { box-shadow: inset 0 0 0 2px var(--rc), inset 4px 4px 0 #2c2468, inset -4px -4px 0 #0d0a26; } 50% { box-shadow: inset 0 0 0 2px #fff, inset 4px 4px 0 #2c2468, inset -4px -4px 0 #0d0a26; } }
.gd-mf { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); min-width: 0; min-height: 0; }
.gd-mf > * { grid-area: 1 / 1; }
.gd-mc { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 0; min-height: 0; padding: 3px 4px; border: 3px solid ${GD.ink}; background: #17123a; box-shadow: inset 0 0 0 2px var(--rc), inset 4px 4px 0 #2c2468, inset -4px -4px 0 #0d0a26; clip-path: ${NOTCH}; animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both; }
.gd-mc.t-mid { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdEdgeS .24s steps(1, end) calc(var(--f1, 0s) + .14s) 2; }
.gd-mc.t-high { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdBump .22s steps(2, end) calc(var(--f1, 0s) + .14s), gdEdgeS .24s steps(1, end) calc(var(--f1, 0s) + .36s) 4; }
/* 📌 2026-10-25 10장 「높은 등급을 맨 뒤에」 — 영웅 칸은 펴진 뒤 칸만 작게 흔들림(gdJit 두 번), 마지막이 아닌 전설 이상 칸은 칸 둘레 고리(.gd-mring) 하나 */
.gd-mc.t-mid.jolt { animation: gdUnfold .14s steps(3, end) var(--f1, 0s) both, gdJit .08s steps(1, end) calc(var(--f1, 0s) + .14s) 2, gdEdgeS .24s steps(1, end) calc(var(--f1, 0s) + .3s) 2; }
@keyframes gdRingS { 0% { opacity: 1; transform: scale(.85); } 99%, 100% { opacity: 0; transform: scale(1.4); } }
.gd-mring { position: absolute; inset: calc(var(--u) * -1); z-index: 1; border: var(--u) solid var(--rc); clip-path: ${NOTCH}; opacity: 0; animation: gdRingS .4s steps(4, end) var(--f1) forwards; pointer-events: none; }
/* 작은 뒷면 — 놓일 때 짧은 팝(두 구간 steps 2) · 전설 이상 칸은 차례 앞 멈춤(테가 그 등급 색 + 흰 깜빡 · 떨림) */
@keyframes gdDrop { 0% { opacity: 0; transform: scale(.6); } 50% { opacity: 1; transform: scale(1.08); } 99%, 100% { opacity: 1; transform: none; } }
.gd-mb { position: relative; display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; border: 3px solid ${GD.ink}; background: #0f0b28; box-shadow: inset 0 0 0 2px #3a3186, inset 4px 4px 0 #241d58, inset -4px -4px 0 #0b0822; clip-path: ${NOTCH}; animation: gdDrop .16s steps(2, end) var(--d) both, gdFold .12s steps(3, end) var(--f0) forwards; }
.gd-mb.hold { animation: gdDrop .16s steps(2, end) var(--d) both, gdJit .105s steps(1, end) var(--h) var(--hn, 4), gdFold .12s steps(3, end) var(--f0) forwards; }
.gd-mb .gd-rung { box-shadow: inset 0 0 0 2px var(--c); }
.gd-mb .gd-rung.bl { animation: gdBl .105s steps(1, end) var(--h) var(--hn, 4); }
.gd-mq { position: relative; display: block; line-height: 0; }
.gd-mq svg { width: calc(var(--u) * 8); height: calc(var(--u) * 10); }
.gd-mc.none { --rc: #3a3186; background: #120e2e; }
.gd-mic { display: block; line-height: 0; }
.gd-mn { display: block; max-width: 100%; margin-top: 3px; font-size: 10.5px; font-weight: 800; line-height: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gd-mc.none .gd-mn { color: #8f88c8; }
.gd-ma { display: block; max-width: 100%; font-size: 9.5px; font-weight: 800; line-height: 12px; color: ${GD.gold}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
@media (max-width: 639.98px) { .gd-mn { font-size: 9.5px; line-height: 12px; } .gd-ma { display: none; } }
/* 단추 둘 — 1장 · 10장(같은 폭) */
.gd-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-gap: 9px; width: 100%; }
.gd-two .gd-go { width: 100%; }
/* ⓪ 원래 표 — 누르면 0.5초(결과 화면에서 다시 누르면 튀어나오듯) */
.gd-tk.show img { animation: gdPop .2s cubic-bezier(.2,.9,.3,1) both; }
@media (prefers-reduced-motion: reduce) { .gd-win, .gd-tk img, .gd-tka, .gd-tka *, .gd-card, .gd-rs, .gd-seam { animation: none !important; } .gd-flash, .gd-ring, .gd-twk, .gd-dust, .gd-scrap, .gd-mring { display: none; } .gd-drape { animation: none !important; } .gd-mc { animation: none !important; } .gd-bk, .gd-mb { display: none; } }
`;

// 도트 그림(rows · pal) — 같은 색 가로 줄을 rect 하나로(crispEdges · 정수 배율 u). 이벤트 패스 창 Sprite 와 같은 그리기
const Sprite = ({ rows, pal, u = 3, size }) => {
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
  return <svg aria-hidden viewBox={`0 0 ${W} ${H}`} width={size || W * u} height={size || H * u} shapeRendering="crispEdges" className="shrink-0">{rects}</svg>;
};
// 칸 장식 도트 — 이벤트 패스 창 LOCK · CHECK(둥근 도트 배지 — 가는 선 체크는 "밤티"로 반려) · XMARK 와 같은 그림
const LOCK = { rows: [".ooo.", "o...o", "ooooo", "oyyyo", "oyoyo", "ooooo"], pal: { o: GD.ink, y: GD.sub } };
const CHECK = {
  rows: ["..ooooo..", ".oHHHCCo.", "oHHCCCWCo", "oHCCCWWSo", "oCWCWWCSo", "oCWWWCCSo", "oCCWCCSSo", ".oCSSSSo.", "..ooooo.."],
  pal: { o: GD.ink, H: "#b4ecf9", C: "#72c3e6", S: "#3f86c4", W: "#ffffff" },
};
const XMARK = { rows: ["xx....xx", "xxx..xxx", ".xxxxxx.", "..xxxx..", "..xxxx..", ".xxxxxx.", "xxx..xxx", "xx....xx"], pal: { x: GD.text } };
// 📌 2026-10-25 뒷면 「?」 — 7 × 9 칸 글자(두 칸 굵기 · 고리는 오른쪽에서 가운데로) + 오른쪽 아래 한 칸 두께(8 × 10). 단색 둘 · 흐림 없음.
//    화면 크기는 CSS(.gd-q · .gd-mq svg)가 var(--u) 칸으로 정한다(큰 카드 1칸 = 2u · 10장 칸 1칸 = u)
const Q_GLYPH = [".sssss.", "ss...ss", ".....ss", "....ss.", "...ss..", "...ss..", ".......", "...ss..", "...ss.."];
const QMARK = {
  rows: Array.from({ length: Q_GLYPH.length + 1 }, (_, y) =>
    Array.from({ length: 8 }, (_, x) => (Q_GLYPH[y]?.[x] === "s" ? "s" : Q_GLYPH[y - 1]?.[x - 1] === "s" ? "d" : ".")).join("")
  ),
  pal: { s: GD.sub, d: "#2c2468" },
};
// 뒷면 카드(한 장) — 계획(revealPlan cards[0])대로. 시각은 인라인 변수(--at 단마다 · --h 멈춤 · --f0 접힘은 .gd-flip 에서 물려받음)
//    단마다 툭(scale 1.03 → 1)은 같은 이름 애니메이션을 단 수만큼 늘어놓는다(겹치지 않게 120ms < 단 간격)
const BackCard = ({ card }) => (
  <div className={`gd-bk${card.hold != null ? " hold" : ""}`} aria-hidden>
    <div className="gd-bkc" style={card.rungs.length ? { animation: card.rungs.map((g) => `gdTap .12s steps(2, end) ${g.at}ms`).join(", ") } : undefined}>
      {card.rungs.map((g, j) => <i key={j} className="gd-rung" style={{ "--c": g.c, "--at": `${g.at}ms` }} />)}
      {card.hold != null && <i className="gd-rung bl" />}
      <i className="gd-dia a" />
      <i className="gd-dia b" />
      <i className="gd-dia c" />
      <i className="gd-dia d" />
      <span className="gd-q"><Sprite {...QMARK} u={1} /></span>
    </div>
  </div>
);
// 작은 뒷면(10장 칸) — 전설 이상 칸만 멈춤 때 테가 그 등급 색으로 켜지고 흰색과 깜빡
const MiniBack = ({ card }) => (
  <span className={`gd-mb${card.hold != null ? " hold" : ""}`} aria-hidden>
    {card.hold != null && (
      <>
        <i className="gd-rung" style={{ "--c": card.c, "--at": `${card.hold}ms` }} />
        <i className="gd-rung bl" />
      </>
    )}
    <span className="gd-mq"><Sprite {...QMARK} u={1} /></span>
  </span>
);

// 희귀도 칩 — lib/rarity 글자 · 색(안 고른 것은 일반)
const RarityChip = ({ v }) => {
  const r = rarityOf(v);
  return (
    <span className="gd-chip gd-pp" style={{ "--bg": r.c, "--hi": mixHex(r.c, "#ffffff", 0.32), "--sh": mixHex(r.c, "#000000", 0.4) }}>
      {r.l}
    </span>
  );
};
// 📌 음성 게이지 — 오늘 진행(ratio 0~1)을 10칸에. 꽉 찬 칸 · 걸친 칸(자식 요소 폭) · 빈 칸 — 이벤트 패스 창 Gauge 와 같은 셈
const GAUGE_N = 10;
const Gauge = ({ ratio }) => {
  const v = Math.min(1, Math.max(0, Number(ratio) || 0)) * GAUGE_N;
  const full = Math.floor(v + 1e-6);
  return (
    <span className="gd-gauge" aria-hidden>
      {Array.from({ length: GAUGE_N }, (_, i) =>
        i < full ? <i key={i} className="on"></i> : i === full && v - full > 0.001 ? <i key={i}><b style={{ width: `${Math.round((v - full) * 100)}%` }}></b></i> : <i key={i}></i>
      )}
    </span>
  );
};
// 상점 바로가기 주소 — 사이트 안 주소(「/」 하나로 시작)만 받는다(「//」 · 「/\」 는 다른 사이트로 갈 수 있어 버린다)
const innerHref = (v) => (typeof v === "string" && /^\/(?![/\\])/.test(v) ? v : "");

// 상품 그림 — XP 번개 도트 · 빙옥 구슬 도트 · 아이템 유형 기본 모양 · 역할 방패 · 코드는 선물 상자 도트(lib/itemArt "starter-pack") · 꽝은 유령 펭귄("ghost-penguin")
//    📌 아이템은 그 아이템 그림(art — 상품 줄 icon · imageUrl · color, 결과는 pid 로 찾음). 그림이 없을 때만 기본 모양(2026-10-26 「한 번 더!」가 상자로 보이던 것)
const PrizeIcon = ({ kind, size, art = null }) => {
  if (kind === "xp") return <ItemIcon icon="art:xp-bolt" size={size} />;
  if (kind === "point") return <Sprite rows={CURRENCY_PIXEL.point.rows} pal={CURRENCY_PIXEL.point.pal} size={size} />;
  if (kind === "item" && (art?.icon || art?.imageUrl)) return <ItemIcon icon={art.icon} imageUrl={art.imageUrl} type="item" size={size} color={art.color || itemTypeColor("item")} />;
  if (kind === "item") return <ItemIcon type="item" size={size} color={itemTypeColor("item")} />;
  if (kind === "none") return <ItemIcon icon="art:ghost-penguin" size={size} />;
  if (kind === "code") return <ItemIcon icon="art:starter-pack" size={size} />;
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={Math.round(size * 0.85)} height={Math.round(size * 0.85)} className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d={ICON_PATHS.shieldCheck} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// ④ 희귀도 연출 — 결과 카드 둘레(.gd-rs 안). 칸 단위(var(--u)) · 고정 배치(그릴 때마다 같다)
//    📌 2026-10-24 운영자 "일반 고급 이런 것도 너무 효과가 없달까 · 기본 효과를 넣되 높은 등급들의 이펙트를 좀 더" → 등급 번호(rank)로 쌓는다:
//      일반 이상 = 색 고리 + 카드 둘레 별 반짝임 4 + 테 깜빡임 1 / 고급 = 별 6 / 희귀 = 흰 고리 하나 더 · 별 8 · 테 2 / 영웅 = 작은 흔들림 · 별 10 두 번
//      전설 = 흰 번쩍 · 금가루 비 18 · 큰 흔들림 · 테 4 / 신화 · 유물 = 색 고리 세 겹 · 금가루 26. 꽝은 없음. 튀는 점 · 색종이는 쓰지 않는다("짜친다")
//    금가루 비(전설 이상) — 등급 색 · 금 · 흰 도트(1~2칸 · 큰 것은 십자 별)가 위에서 천천히 반짝이며 내린다. 자리 · 크기 · 속도 · 늦춤은 고정 표(DUST)
const DUST = [
  [4, 1, 0, 2.1, 0.0, 1], [9, 2, 1, 2.6, 0.32, -1], [14, 1, 2, 1.9, 0.12, 2], [18, 3, 1, 2.4, 0.5, 0], [23, 1, 0, 2.2, 0.22, -2],
  [27, 2, 2, 2.8, 0.06, 1], [31, 1, 1, 2.0, 0.6, 0], [36, 3, 0, 2.5, 0.28, -1], [40, 1, 2, 2.3, 0.4, 2], [44, 2, 1, 1.9, 0.14, -2],
  [48, 1, 0, 2.7, 0.7, 1], [52, 3, 2, 2.2, 0.02, 0], [56, 1, 1, 2.4, 0.36, -1], [60, 2, 0, 2.0, 0.54, 2], [64, 1, 2, 2.6, 0.18, -2],
  [68, 3, 1, 2.3, 0.44, 1], [72, 1, 0, 2.1, 0.08, 0], [76, 2, 2, 2.8, 0.62, -1], [80, 1, 1, 1.9, 0.26, 2], [84, 3, 0, 2.5, 0.48, -2],
  [88, 1, 2, 2.2, 0.1, 1], [92, 2, 1, 2.6, 0.34, 0], [96, 1, 0, 2.0, 0.58, -1], [12, 1, 1, 2.9, 0.8, 0], [46, 1, 2, 2.9, 0.86, 1], [78, 1, 0, 2.9, 0.9, -1],
]; // [왼쪽 %, 크기(1 · 2 칸, 3 = 십자 별), 색(0 등급 · 1 금 · 2 흰), 떨어지는 초, 늦춤 초, 옆으로 흐르는 칸]
// 별 자리 — [가로(가운데에서 %), 세로(가운데에서 칸), 크기(칸), 늦춤(초)]
const TWINKLE = [[-40, -15, 5, 0], [41, -17, 5, 0.08], [-37, 16, 3, 0.16], [38, 15, 3, 0.04], [-27, -21, 3, 0.22], [28, 20, 5, 0.12], [-45, 1, 3, 0.3], [45, -2, 3, 0.26], [0, -24, 3, 0.18], [1, 23, 3, 0.34]];
// 📌 2026-10-25 at(초) — 앞면이 펴지기 시작하는 때(계획 fx)로 미룬다. 늦춤 전엔 모두 안 보인다(고리 · 금가루 · 번쩍은 채움 없음, 별은 0% 가 투명)
const RevealFx = ({ rank, rc, at = 0 }) => {
  if (rank < 0) return null;
  const late = at + (rank >= 4 ? 0.1 : 0);
  const stars = rank >= 3 ? 10 : rank >= 2 ? 8 : rank >= 1 ? 6 : 4;
  const dust = rank >= 5 ? DUST.length : rank >= 4 ? 18 : 0;
  return (
    <>
      {rank >= 4 && <span className="gd-flash" aria-hidden style={{ animationDelay: `${at}s` }} />}
      <span className="gd-ring" aria-hidden style={{ "--rc": rc, animationDelay: `${late}s` }} />
      {rank >= 2 && <span className="gd-ring" aria-hidden style={{ "--rc": "#ffffff", animationDelay: `${late + 0.16}s` }} />}
      {rank >= 5 && <span className="gd-ring" aria-hidden style={{ "--rc": rc, animationDelay: `${late + 0.32}s` }} />}
      {TWINKLE.slice(0, stars).map(([x, y, sz, d], i) => (
        <span
          key={`t${i}`}
          className="gd-twk"
          aria-hidden
          style={{ "--x": `${x}%`, "--y": `calc(var(--u) * ${y})`, "--s": `calc(var(--u) * ${sz})`, "--c": i % 2 ? "#ffffff" : rank >= 2 ? rc : GD.gold, "--n": rank >= 3 ? 2 : 1, animationDelay: `${late + 0.1 + d}s` }}
        />
      ))}
      {DUST.slice(0, dust).map(([x, sz, c, t, d, dx], i) => (
        <span
          key={`d${i}`}
          className={`gd-dust${sz === 3 ? " st" : ""}`}
          aria-hidden
          style={{ left: `${x}%`, "--s": `calc(var(--u) * ${sz === 3 ? 3 : sz})`, "--c": [rc, GD.gold, "#ffffff"][c], "--dx": `calc(var(--u) * ${dx})`, "--t": `${t}s`, animationDelay: `${late + 0.08 + d}s` }}
        />
      ))}
    </>
  );
};

// 미리보기 10장 — 고른 결과를 넷째 칸에, 나머지는 그보다 낮은 상품 · 꽝으로 채운다(연출은 고른 등급을 따른다)
const demoBatch = (d, n, run) => {
  const top = rankOf(d.result);
  const pool = (Array.isArray(d.data?.prizes) ? d.data.prizes : []).filter((p) => p.kind !== "none" && rankOf(p) < top);
  return Array.from({ length: n }, (_, i) => {
    const id = `demo-${run}-${i}`;
    if (i === 3) return { ...d.result, id };
    const p = pool.length && i % 3 !== 2 ? pool[i % pool.length] : null;
    return p
      ? { id, pid: p.pid, name: p.name, kind: p.kind, amount: p.amount, itemName: p.itemName, count: p.count, rarity: p.rarity, code: p.kind === "code" ? "DEMO-0000-0000" : "" }
      : { id, pid: "none", name: "다음 기회에", kind: "none", amount: 0, rarity: "", code: "" };
  });
};

// 상태 읽기 — 실패면 null
const fetchState = async () => {
  try {
    const res = await fetch(API, { cache: "no-store" });
    const j = await res.json();
    return j?.success && j.data ? j.data : null;
  } catch {
    return null;
  }
};

// pushToast(msg, accent) — 레벨 페이지 토스트. onDrawn — 뽑은 뒤 페이지 잔액 · XP 를 다시 읽는다(loadMe). onCount — 띠 배지(내 추첨권 수)
// 📌 embedded — 이벤트 창(./EventTabs.js EventHub) 안에 넣을 때. 바깥 어둠 · 틀 크기 · 열림 움직임 · 이벤트 탭은 이벤트 창 몫이고, 이 창은 그 칸을 꽉 채운다
//    (이벤트마다 창 크기가 같아 탭을 옮겨도 화면이 움직이지 않게). onBusy(bool) — 뽑기 연출 중이면 true(이벤트 창이 다른 탭을 잠근다)
// 📌 demo — 관리 › 괴담회 「연출 미리보기」(2026-10-23 운영자 "애니메이션 보는 것 좀"). { data(GET 모양 상태), result(보일 결과) } 를 주면
//    서버를 부르지 않는다(읽기 · 추첨 POST 없음 — 추첨권 · 기록 · 지급 그대로). 단추를 누르면 실제와 같은 시간표 · 소리 · 연출로 그 결과를 보여 준다
/** @param {{ open: boolean; onClose: () => void; pushToast?: (msg: string, accent?: boolean) => void; onDrawn?: () => void; onCount?: (n: number) => void; demo?: any; embedded?: boolean; onBusy?: (busy: boolean) => void }} props */
export default function GoedamModal({ open, onClose, pushToast, onDrawn, onCount, demo = null, embedded = false, onBusy }) {
  const narrow = useNarrow();
  const wide = useWide();
  const { data: session, status: authStatus } = useSession();
  const signedIn = !!session?.user;
  const [data, setData] = useState(null); // 마지막으로 받은 상태 — 다시 열면 바로 그리고 뒤에서 새로 읽는다
  const [status, setStatus] = useState("idle"); // idle · loading · ok · error
  const [nowMs, setNowMs] = useState(0); // 회차 「진행 중」 판단 — 읽을 때 · 30초마다
  const [tab, setTab] = useState("prizes"); // 옆판 탭 — prizes · ways(받는 법) · history
  // 📌 애니메이션 — null(평소) | { run, step: "show" | "tug" | "tear" | "close" | "wait" | "result", count, hint, ... }. wait = 움직임 줄이기(결과만 기다림)
  //    result 일 때 { results, plan(revealPlan — 건너뛰기 · 움직임 줄이기면 null), instant(앞면 바로 · 움직임 없음), done(다 보임 — 알림 끝 · 잠금 풀림 · 화면 읽기 열림), curtain(닫힌 커튼을 연다) }
  const [anim, setAnim] = useState(null);
  const runRef = useRef(0); // 뽑기마다 +1 — 닫기 · 다음 뽑기가 앞 뽑기의 늦은 응답 · 타이머를 무시하게
  const drawingRef = useRef(false); // 뽑기 하나가 진행 중(요청 · 연출 — 다 보일 때까지)
  const resultRef = useRef(null); // 도착했지만 아직 안 보인 결과
  const leftRef = useRef(null); // 그 결과의 남은 추첨권 수
  const pendRef = useRef(null); // 보이기 시작했지만 아직 안 알린 결과(다 보임 · 건너뛰기 · 닫기 중 먼저 오는 때 한 번)
  const endRef = useRef(false); // 시간표(카운트다운 「1」)가 끝났는지
  const skipRef = useRef(false); // 다 보이기 전에 스크린을 눌렀다 — 결과가 오면 앞면을 바로
  const shutRef = useRef(false); // 이번 뽑기에서 커튼이 닫혔는지(안 닫혔으면 결과 때 여는 움직임도 없다)
  const timersRef = useRef([]);
  const sndRef = useRef([]); // 재생 중 · 예약된 소리 끄기 함수
  const revealRef = useRef(null); // 걸어 둔 결과 계획 — { run, t0(그림이 들어간 performance.now), snd: [{ at, tier, stop }] }. 건너뛸 때 아직 안 울린 것만 끈다
  const schedRef = useRef(0); // 계획 소리 · 끝 타이머를 건 run(한 계획을 두 번 걸지 않게)
  const closeRef = useRef(null);
  // 📌 2026-10-25 검토: open 이 꺼진 렌더가 들어간 뒤 닫기 정리(settle 효과)가 돌기 전에 T_OPEN 타이머 · 응답이 끼면 finish 가 결과 연출을 새로 세워
  //    창이 닫힌 채 잠금(onBusy)이 남았다 → 그린 직후(layout) 지금 열림을 담아 두고 finish 가 본다
  const openRef = useRef(open);
  useLayoutEffect(() => { openRef.current = open; });

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
  }, []);
  const stopSnd = useCallback(() => {
    sndRef.current.forEach((c) => { try { c(); } catch {} });
    sndRef.current = [];
  }, []);
  // 📌 뽑는 중에 페이지를 떠나면(뒤로 가기 등) run 도 넘긴다 — 늦게 온 응답이 「닫는 중 결과」 길(토스트만)로 가서 다음 페이지에서 연출 소리 · 타이머가 돌지 않게
  useEffect(() => () => {
    runRef.current += 1;
    drawingRef.current = false;
    clearTimers();
    stopSnd();
  }, [clearTimers, stopSnd]);

  // 읽은 상태 반영 — 실패면 이미 그린 상태는 그대로 둔다(뒤에서 새로 읽기만 실패)
  const apply = useCallback((d) => {
    setNowMs(Date.now());
    if (d) {
      setData(d);
      setStatus("ok");
    } else setStatus((s) => (s === "ok" ? "ok" : "error"));
  }, []);
  // 미리보기는 서버를 읽지 않는다 — 받은 상태 그대로
  const demoRef = useRef(demo);
  useEffect(() => { demoRef.current = demo; }, [demo]);
  const load = useCallback(() => (demoRef.current ? Promise.resolve() : fetchState().then(apply)), [apply]);
  // 📌 내 추첨권 수를 띠 배지(app/level/page.js)에 알린다 — 열 때 · 뽑은 뒤 · 다시 읽을 때마다(쓰고 닫으면 바로 줄어든다)
  useEffect(() => {
    if (data && onCount) onCount(Math.max(0, Math.floor(Number(data.tickets) || 0)));
  }, [data, onCount]);

  // 열 때마다 새로 읽는다 · 소리 파일은 미리 불러 둔다(첫 뽑기에 늦지 않게)
  useEffect(() => {
    if (!open) return;
    let alive = true;
    if (demoRef.current) apply(demoRef.current.data);
    else fetchState().then((d) => { if (alive) apply(d); });
    preloadSfx(SFX);
    const t = setInterval(() => setNowMs(Date.now()), 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, apply]);

  // 알림 — 보인 결과를 한 번만(토스트 · 페이지 잔액 · XP 다시 읽기 · 목록 새로 읽기). 📌 2026-10-25 커튼이 열리는 순간에 하던 것을 다 보인 뒤로 옮겼다(결과를 미리 알려 버리던 스포)
  //    reload false = 닫으며 하는 알림(다시 열 때 어차피 새로 읽는다)
  const notify = useCallback((reload) => {
    const list = pendRef.current;
    if (!list) return;
    pendRef.current = null;
    pushToast?.(batchText(list), rankOf(topOf(list)) >= 0);
    onDrawn?.();
    if (reload) load();
  }, [pushToast, onDrawn, load]);
  // 다 보임 — 계획의 끝(end) 타이머 · 건너뛰기에서. 잠금(onBusy · 단추)을 풀고 알림
  const revealDone = useCallback((run, patch) => {
    if (run !== runRef.current) return;
    clearTimers();
    drawingRef.current = false;
    setAnim((a) => (a && a.run === run ? { ...a, ...patch, done: true } : a));
    notify(true);
  }, [clearTimers, notify]);

  // ④ 결과 보이기 — 시간표가 끝났고(또는 건너뜀) 결과가 와 있을 때만(닫히는 중이면 그대로 두어 settle 이 알린다). 계획(revealPlan)을 한 번 세워 화면은 CSS 늦춤으로 그리고,
  //    소리 · 끝 타이머는 그 계획이 화면에 들어간 직후 아래 useLayoutEffect 가 건다. 건너뛰었거나 움직임 줄이기면 앞면을 바로(움직임 없이) + 가장 높은 등급 소리 하나 + 알림
  const finish = useCallback((run) => {
    if (run !== runRef.current || !endRef.current || !resultRef.current || !openRef.current) return;
    const list = resultRef.current; // 결과 목록(1장이면 하나)
    const left = leftRef.current;
    resultRef.current = null;
    pendRef.current = list;
    clearTimers();
    stopSnd();
    if (left != null) setData((d) => (d ? { ...d, tickets: left } : d));
    const base = { run, step: "result", results: list, curtain: shutRef.current };
    if (skipRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setAnim({ ...base, plan: null, instant: true, done: false });
      sndRef.current.push(...tierSfx(rankOf(topOf(list))).map(sfx));
      revealDone(run);
      return;
    }
    setAnim({ ...base, plan: revealPlan(list), instant: false, done: false });
  }, [clearTimers, stopSnd, revealDone]);
  // 계획 소리 · 끝 타이머 — 계획이 DOM 에 들어간 직후(그리기 전)에 0 을 잡는다. CSS 늦춤도 이 커밋 뒤 스타일 계산에서 시작하므로 둘의 기준이 같다
  useLayoutEffect(() => {
    if (anim?.step !== "result" || !anim.plan || anim.instant || anim.run !== runRef.current || schedRef.current === anim.run) return;
    const { run, plan } = anim;
    schedRef.current = run;
    const snd = plan.sounds.map((s) => ({ at: s.at, tier: s.tier, stop: sfx(s) }));
    sndRef.current.push(...snd.map((s) => s.stop));
    revealRef.current = { run, t0: performance.now(), snd };
    timersRef.current.push(setTimeout(() => revealDone(run), plan.end));
  }, [anim, revealDone]);

  // 📌 추첨권 쓰기(count 1 · 10) — 누르는 즉시 서버에 묻고(POST) 그동안 ⓪~③ 을 돌린다. 시간표는 처음에 한 번에 건다(run 이 바뀌면 다 무시)
  const draw = useCallback(async (count = 1) => {
    if (drawingRef.current) return;
    drawingRef.current = true;
    clearTimers();
    stopSnd();
    resultRef.current = null;
    leftRef.current = null;
    pendRef.current = null;
    endRef.current = false;
    skipRef.current = false;
    shutRef.current = false;
    const run = ++runRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const later = (ms, fn) => timersRef.current.push(setTimeout(() => { if (run === runRef.current) fn(); }, ms));
    const to = (patch) => setAnim((a) => (a && a.run === run ? { ...a, ...patch } : a));
    const play = (name) => sndRef.current.push(sfx({ name }));
    if (reduce) {
      endRef.current = true;
      setAnim({ run, step: "wait", count });
    } else {
      setAnim({ run, step: "show", count });
      later(T_SHOW, () => { to({ step: "tug" }); play("goedam-tug"); });
      later(T_TEAR, () => { to({ step: "tear" }); play("goedam-tear"); });
      // 커튼 닫힘 — 파일 속 ~0.55s 에 커튼이 만나는 「툭」(닫힘 .6s 와 맞춤)
      later(T_CLOSE, () => { shutRef.current = true; to({ step: "close" }); play("goedam-shut"); });
      // 닫힌 채 기다림 롤 — 그때 결과가 와 있고 가장 높은 것이 전설 이상이면 거꾸로 심벌이 섞인 roll-hi(「뭔가 크다」)
      later(T_ROLL, () => { const r = resultRef.current; play(r && rankOf(topOf(r)) >= 4 ? "goedam-roll-hi" : "goedam-roll"); });
      later(T_OPEN, () => { endRef.current = true; finish(run); });
    }
    let res = null;
    if (demoRef.current) {
      // 미리보기 — 서버 대신 0.7초 뒤 고른 결과(실제 응답이 오는 시간 결). 추첨권 수 칸은 싣지 않는다(그대로 — null 은 Number 로 0 이 된다)
      await new Promise((ok) => setTimeout(ok, 700));
      const list = count > 1 ? demoBatch(demoRef.current, count, run) : [{ ...demoRef.current.result, id: `demo-${run}` }];
      res = { success: true, data: { result: list[0], results: list } };
    } else {
      try {
        const r = await fetch(`${API}/draw`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
        res = await r.json().catch(() => null);
      } catch {
        res = null;
      }
    }
    const list = !res?.success ? [] : Array.isArray(res.data?.results) && res.data.results.length ? res.data.results : res.data?.result ? [res.data.result] : [];
    const left = res?.success && res.data && Number.isFinite(Number(res.data.tickets)) ? Math.max(0, Math.floor(Number(res.data.tickets))) : null;
    // 📌 뽑는 중에 창을 닫았으면(run 이 바뀜) 결과는 알림으로만 — 다음에 열면 내 당첨에 있다
    if (run !== runRef.current) {
      if (list.length) {
        pushToast?.(batchText(list), list.some((r) => r.kind !== "none"));
        if (left != null) onCount?.(left);
        onDrawn?.();
      }
      return;
    }
    if (list.length) {
      resultRef.current = list;
      leftRef.current = left;
      // 전설 이상이면 닫힌 커튼 이음매에 그 등급 색 빛줄(가장 높은 것 — 아직 닫히기 전이면 닫힐 때 쓰인다 — to 는 칸을 합친다)
      const hint = hintOf(topOf(list));
      if (hint) to({ hint });
      finish(run);
      return;
    }
    // 실패 — 애니메이션을 접고 서버 글(추첨권이 없습니다 · 추첨권이 부족합니다 · 추첨 기간이 아닙니다 · 남은 상품이 없습니다)을 알림으로, 상태를 다시 맞춘다
    clearTimers();
    stopSnd();
    drawingRef.current = false;
    setAnim(null);
    sfxNo();
    // (점검 · LEVEL 비공개 · XP 중단 입구 거절은 message 에 글이 올 수 있다 — 이벤트 패스 받기와 같은 입구)
    pushToast?.(res ? res.error || res.message || "추첨하지 못했습니다." : "네트워크 오류로 추첨하지 못했습니다.");
    load();
  }, [clearTimers, stopSnd, finish, pushToast, onCount, onDrawn, load]);

  // 건너뛰기(스크린 누르기) — 📌 2026-10-25 다 보이기 전이면 어디서든 「앞면 바로」:
  //    결과 연출 중 = 아직 안 울린 소리 · 끝 타이머를 끄고 앞면 전부 바로(움직임 없이) + 가장 높은 등급 소리 하나 + 알림
  //      📌 2026-10-25 검토: 이미 울리는 소리(열림 · 앞 칸 등급 소리)는 끊지 않고, 가장 높은 등급 소리가 이미 울렸으면 다시 틀지 않는다('땡—땡' 두 번 방지).
  //      큰 효과(번쩍 · 고리 · 금가루 · 흔들림)도 이미 시작했으면 끝까지(skipAt)
  //    그 전(표 · 찢김 · 커튼) = 결과가 와 있으면 바로 ④(앞면 바로), 아니면 커튼을 닫은 채 기다렸다가 오면 앞면 바로.
  //    다 보인 뒤에 누르면 평소 화면(추첨권 ×N)으로
  const onScreen = useCallback(() => {
    if (!anim) return;
    if (anim.step === "result") {
      if (anim.done) {
        sfxTick();
        setAnim(null);
        return;
      }
      if (anim.run !== runRef.current) { // 닫기 정리와 엇갈려 남은 지난 연출 — 평소 화면으로
        setAnim(null);
        return;
      }
      const rv = revealRef.current;
      // 이미 앞면 바로(움직임 줄이기 · 건너뜀)거나 계획이 아직 안 걸렸으면 마무리만
      if (!anim.plan || anim.instant || !rv || rv.run !== anim.run) return revealDone(anim.run);
      const el = performance.now() - rv.t0;
      if (el >= anim.plan.end) return revealDone(anim.run); // 끝 타이머가 막 돌았다 — 그대로 마무리
      const top = rankOf(topOf(anim.results));
      rv.snd.forEach((s) => { if (s.at > el) s.stop(); });
      if (!rv.snd.some((s) => s.tier === top && s.at <= el)) sndRef.current.push(...tierSfx(top).map(sfx));
      revealDone(anim.run, { instant: true, skipAt: el });
      return;
    }
    if (anim.step === "wait") return;
    skipRef.current = true;
    if (endRef.current) return; // 시간표는 끝났고 결과를 기다리는 중 — 오면 finish 가 앞면을 바로
    endRef.current = true;
    if (resultRef.current) return finish(anim.run); // finish 가 시간표 · 소리를 접는다
    // 📌 2026-10-25 검토: 결과 전 — 커튼이 이미 닫히는 중(close)이면 시간표 그대로(닫힘 '툭' · 기다림 롤을 끊지 않는다. T_OPEN 은 결과만 기다린다).
    //    그 전(표 · 당김 · 찢김)이면 남은 시간표를 접고 지금 닫는다 — 화면이 찢긴 표 · 닫히는 커튼으로 바로 가므로 찢김(아직이면) · 닫힘 소리를 같이, 롤은 닫힘 뒤에
    if (anim.step === "close") return;
    const run = anim.run;
    clearTimers();
    shutRef.current = true;
    setAnim((a) => (a && a.run === run ? { ...a, step: "close" } : a));
    if (anim.step !== "tear") sndRef.current.push(sfx({ name: "goedam-tear" }));
    sndRef.current.push(sfx({ name: "goedam-shut" }), sfx({ name: "goedam-roll", at: T_ROLL - T_CLOSE }));
  }, [anim, clearTimers, finish, revealDone]);

  // 닫기 — 시간표 · 소리를 접는다. 도착했지만 아직 안 보인 결과 · 보이는 중이라 아직 안 알린 결과는 알림으로(닫아도 결과를 놓치지 않게)
  const settle = useCallback(() => {
    const r = resultRef.current;
    if (r) {
      pushToast?.(batchText(r), r.some((x) => x.kind !== "none"));
      if (leftRef.current != null) onCount?.(leftRef.current);
      onDrawn?.();
    }
    notify(false);
    runRef.current++;
    resultRef.current = null;
    leftRef.current = null;
    pendRef.current = null;
    drawingRef.current = false;
    clearTimers();
    stopSnd();
  }, [pushToast, onCount, onDrawn, notify, clearTimers, stopSnd]);
  const closeAll = useCallback(() => {
    settle();
    setAnim(null);
    onClose();
  }, [settle, onClose]);
  // 📌 이벤트 창 안에서 다른 이벤트 탭으로 옮기거나 이벤트 창이 바깥(어둠 · 다른 창의 닫기)에서 닫히면 closeAll 을 거치지 않고 open 만 꺼진다 —
  //    그때도 닫기와 같은 정리를 한다(안 하면 옮긴 뒤에도 결과 카드 · 축하 소리가 남아 다시 열 때 새로 뽑은 것처럼 보인다)
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (!open) setAnim(null);
  }
  useEffect(() => { if (!open) settle(); }, [open, settle]);
  // 뽑기 연출 중 — 이벤트 창이 다른 탭을 잠근다. 📌 2026-10-25 결과가 다 보일 때까지(커튼이 열리는 순간 풀면 뒤집는 중에 탭을 옮길 수 있다)
  const busyNow = !!anim && (anim.step !== "result" || !anim.done);
  useEffect(() => { onBusy?.(busyNow); }, [busyNow, onBusy]);

  // 열리면 닫기 단추에 포커스 · Esc 로 닫기 — 이벤트 패스 창과 같다
  useEffect(() => { if (open) closeRef.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAll]);

  const copy = useCallback(async (code) => {
    const ok = await copyText(String(code || ""));
    if (ok) {
      sfxTick();
      pushToast?.("코드를 복사했습니다.", true);
    } else {
      sfxNo();
      pushToast?.("복사하지 못했습니다.");
    }
  }, [pushToast]);

  if (!open) return null;

  const title = String(data?.title || "").trim() || "방구석 심야 괴담회";
  const phase = data?.phase || "";
  const tickets = Math.max(0, Math.floor(Number(data?.tickets) || 0));
  const prizes = Array.isArray(data?.prizes) ? data.prizes : [];
  const screenings = Array.isArray(data?.screenings) ? data.screenings : [];
  const history = Array.isArray(data?.history) ? data.history : [];
  const rarityByPid = Object.fromEntries(prizes.map((p) => [p.pid, p.rarity]));
  // 결과 카드 그림 — 상품 줄의 아이템 그림(icon · imageUrl · color)을 pid 로(지운 상품이면 없음 → 기본 모양)
  const prizeArt = new Map(prizes.map((p) => [p.pid, p]));
  const running = busyNow; // 단추도 다 보일 때까지 잠근다
  // 커튼 — 결과 때 여는 움직임은 이번에 닫혔을 때만(건너뛰어 닫히기 전에 결과가 오면 제자리 그대로 — 닫힌 척 튀었다 열리지 않게)
  const drape = anim?.step === "close" ? " shut" : anim?.step === "result" && anim.curtain ? " open" : "";

  // 📌 나올 수 있는 상품 — 서버 고르기(lib/goedam.js pickPrize — 줄 수 있고(ready) 남은 것)와 같은 판정. 하나도 없으면 누르기 전에 잠근다
  //    (눌러 봐야 서버가 추첨권을 되돌리고 「남은 상품이 없습니다」 — 애니메이션을 돌렸다 접지 않게). 운영진 미리보기의 반영 전 상품(ready false)은 빼고 센다
  const drawableCount = prizes.filter((p) => p.ready !== false && (p.left == null || Number(p.left) > 0)).length;
  // 📌 단추 — 로그인 전 「로그인」 · 기간 전 「10. 30. 20:00 에 열립니다」 · 끝 「종료」 · 상품 소진 「남은 상품 없음」 · 추첨권 없음 잠김 · 뽑는 중 그대로(글자 자리 유지)
  const lockText = !data
    ? ""
    : phase === "before"
      ? `${dayOf(data.drawOpensAt)} ${hmOf(data.drawOpensAt)} 에 열립니다`
      : phase === "closed"
        ? "종료"
        : phase !== "open"
          ? "준비 중"
          : !drawableCount
            ? "남은 상품 없음"
            : "";
  const busyDots = <span className="gd-busy">…</span>;
  let action;
  if (data && !signedIn && authStatus !== "loading") {
    action = <button type="button" className="gd-gb gd-go" onClick={() => { closeAll(); openLogin(); }}>로그인</button>;
  } else if (!data || lockText) {
    action = (
      <button type="button" className="gd-gb gd-go off" disabled aria-label={lockText || "추첨권 1장"}>
        <span className="inline-flex items-center" style={!data ? { visibility: "hidden" } : undefined}>{lockText || "추첨권 1장"}</span>
      </button>
    );
  } else {
    // 📌 단추 둘 — 1장 · 10장(10장은 10장 이상일 때만 — 운영자 선택 「잠김」). 뽑는 중엔 둘 다 잠그고, 누른 쪽에만 「…」(움직임 줄이기)
    const busy = running || authStatus === "loading";
    const one = (n) => {
      const off = tickets < n;
      return (
        <button type="button" className={`gd-gb gd-go${off ? " off" : ""}`} onClick={() => draw(n)} disabled={off || busy}>
          <span className="inline-flex items-center" style={anim?.step === "wait" && anim.count === n ? { visibility: "hidden" } : undefined}>
            {off && <i className="gd-lk"><Sprite {...LOCK} u={2} /></i>}
            추첨권 {n}장
          </span>
          {anim?.step === "wait" && anim.count === n && busyDots}
        </button>
      );
    };
    action = <div className="gd-two">{one(1)}{one(10)}</div>;
  }

  // ── 스크린 — 읽는 중 · 실패 / 평소(추첨권 큰 판 ×N) / ①② 추첨권 / ③ 카운트다운 / ④ 결과 카드 ──
  let screen;
  if (!data) {
    screen = status === "error" ? (
      <div className="gd-msg">
        불러오지 못했습니다
        <button type="button" className="gd-gb md" onClick={() => { setStatus("loading"); load(); }}>다시 시도</button>
      </div>
    ) : <div className="gd-msg">…</div>;
  } else if (anim?.step === "show") {
    // ⓪ 원래 표 0.5초 — 쓰는 장 수(×1 · ×10)
    screen = (
      <div className="gd-tk show" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/ticket.png`} alt="" draggable={false} className="gd-px" />
        <span className="gd-xn">×{fmt(anim.count || 1)}</span>
      </div>
    );
  } else if (anim && (anim.step === "tug" || anim.step === "tear" || anim.step === "close")) {
    // 커튼이 닫히는 동안에도 찢긴 표를 그대로 둔다(같은 칸 · 같은 class 라 애니메이션이 이어진다 — 커튼이 덮을 때까지)
    screen = (
      <div className={`gd-tka ${anim.step === "close" ? "tear" : anim.step}`} aria-hidden>
        <span className="gd-tm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/ticket-main.png`} alt="" draggable={false} className="gd-px" />
        </span>
        <span className="gd-ts">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART}/ticket-stub.png`} alt="" draggable={false} className="gd-px" />
        </span>
        {/* 종이 조각 — 절취선에서 튄다(찢길 때만) */}
        {anim.step !== "tug" &&
          SCRAPS.map((s, i) => (
            <span
              key={i}
              className="gd-scrap"
              style={{ top: `calc(var(--u) * ${s.y})`, "--s": `calc(var(--u) * ${s.s})`, "--c": s.c, "--dx": `calc(var(--u) * ${s.dx})`, "--dy": `calc(var(--u) * ${s.dy})`, "--r": `${s.r}deg`, animationDelay: `${(i % 3) * 0.03}s` }}
            />
          ))}
      </div>
    );
  } else if (anim?.step === "result" && anim.results?.length) {
    const list = anim.results;
    const top = topOf(list);
    const rank = rankOf(top);
    const rc = rank < 0 ? "#3a3186" : rarityOf(top.rarity).c;
    // 📌 2026-10-25 계획(plan)이 있으면 뒷면 → 상승 → 뒤집기, 없으면(건너뜀 · 움직임 줄이기) 앞면만 움직임 없이(.now)
    //    큰 효과 · 흔들림(fxPlan)은 건너뛰기 전에 이미 시작했으면(skipAt ≥ fx) 끝까지 둔다 — 중간에 툭 사라지지 않게
    const plan = anim.instant ? null : anim.plan;
    const fxPlan = anim.plan && (!anim.instant || anim.skipAt >= anim.plan.fx) ? anim.plan : null;
    const shake = !fxPlan ? "" : rank >= 4 ? " shake" : rank >= 3 ? " shake-s" : "";
    const ms = (v) => `${v}ms`;
    // 화면 읽기는 다 보인 뒤에만(뒤집히기 전에 읽어 주면 스포) — 결과 알림 글은 아래 늘 있는 상태 칸(sr-only role=status)이 읽는다
    const live = anim.done ? {} : { "aria-hidden": true };
    let body;
    if (list.length === 1) {
      const r = list[0];
      const none = rank < 0;
      const amt = amountOf(r);
      const c = plan?.cards[0];
      body = (
        <div className="gd-flip" style={c ? { "--f0": ms(c.flip), "--f1": ms(c.flip + R_FOLD), ...(c.hold != null ? { "--h": ms(c.hold) } : null) } : undefined}>
          {c && <BackCard card={c} />}
          <div className={`gd-card t-${cardTier(rank)}${none ? " none" : ""}`} style={{ "--rc": rc }} {...live} onClick={(e) => { if (r.code && anim.done) e.stopPropagation(); }}>
            <span className="gd-ci"><PrizeIcon kind={r.kind} size={wide ? 96 : 48} art={prizeArt.get(r.pid)} /></span>
            <div className="gd-ct">
              {!none && <RarityChip v={r.rarity} />}
              <p className="gd-cn">{nameOf(r)}</p>
              {amt && <p className="gd-ca">{amt}</p>}
              {r.code && (
                <div className="gd-code">
                  <code>{r.code}</code>
                  {/* 다 보이기 전(앞면이 접혀 안 보임 · aria-hidden)엔 Tab 으로 닿지 않게 */}
                  <button type="button" className="gd-sb gd-pp" tabIndex={anim.done ? undefined : -1} onClick={(e) => { e.stopPropagation(); copy(r.code); }}>복사</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    } else {
      // 10장 — 작은 칸 5 × 2(코드는 내 당첨에서 복사). 칸마다 뒷면 · 앞면 겹침 — 시각은 계획 cards[i]
      body = (
        <div className="gd-grid" {...live}>
          {list.map((r, i) => {
            const rk = rankOf(r);
            const amt = amountOf(r);
            const c = plan?.cards[i];
            return (
              <div key={r.id || i} className="gd-mf" style={c ? { "--d": ms(c.drop), "--f0": ms(c.flip), "--f1": ms(c.flip + R_FOLD), ...(c.hold != null ? { "--h": ms(c.hold), "--hn": c.jn } : null) } : undefined}>
                {c && <MiniBack card={c} />}
                {/* 마지막이 아닌 전설 이상 칸 — 펴질 때 그 칸 둘레 고리 하나(큰 효과는 마지막 한 장만) */}
                {c?.ring && <i aria-hidden className="gd-mring" style={{ "--rc": c.c }} />}
                <div className={`gd-mc t-${cardTier(rk)}${rk < 0 ? " none" : ""}${c?.jolt ? " jolt" : ""}`} style={{ "--rc": rk < 0 ? "#3a3186" : rarityOf(r.rarity).c }}>
                  <span className="gd-mic"><PrizeIcon kind={r.kind} size={narrow ? 22 : 30} art={prizeArt.get(r.pid)} /></span>
                  <span className="gd-mn">{nameOf(r)}</span>
                  {amt && <span className="gd-ma">{amt}</span>}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    screen = (
      <div className={`gd-rs${shake}${plan ? "" : " now"}`} style={fxPlan ? { animationDelay: ms(fxPlan.fx) } : undefined}>
        {/* 등급 효과 — 가장 높은 칸이 처음 펴지는 때(fx)로 미뤄 시작. 그 전에 건너뛰면 없음 */}
        {fxPlan && <RevealFx rank={rank} rc={rc} at={fxPlan.fx / 1000} />}
        {body}
      </div>
    );
  } else {
    const has = signedIn && tickets > 0;
    screen = (
      <div className={`gd-tk ${has ? "live" : "none"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ART}/ticket.png`} alt="할로윈 추첨권" draggable={false} className="gd-px" />
        <span className="gd-xn" aria-label={`추첨권 ${tickets}장`}>×{fmt(tickets)}</span>
      </div>
    );
  }

  // ── 아래 목록 셋 ──
  const prizeRows = prizes.filter((p) => p.kind !== "none");
  // 📌 2026-10-25 운영자 "재고소진 관련 뽑기에도 추가해" — 목록 아래 주의 한 줄(뽑기는 남은 0 인 상품을 빼고 뽑는다 · lib/goedam.js drawable). 그룹 지원 창의 상품권 주의와 같은 결
  //    목록 맨 위 — 상품이 많으면 아래 줄은 굴려야 보여서(옆판은 스크롤 막대가 없다)
  const prizesList = prizeRows.length ? (
    <>
      <p className="gd-warn">※ 재고가 소진된 상품은 당첨되지 않습니다</p>
      {prizeRows.map((p) => {
        const unlimited = p.total == null;
        const out = !unlimited && Number(p.left) <= 0;
        return (
          <div key={p.pid} className={`gd-row gd-pz${out ? " out" : ""}`}>
            <RarityChip v={p.rarity} />
            <span className="gd-nm">{p.name}</span>
            {!unlimited && <span className="gd-cnt">{`${fmt(p.left)}/${fmt(p.total)}`}</span>}
            <span className="gd-pct">{pctOf(p.chance)}</span>
          </div>
        );
      })}
    </>
  ) : <p className="gd-none">준비 중</p>;
  // 받는 법 · 상영 — 회차 줄(2026-10-24 전 「회차」 탭 그대로)
  const screeningRows = screenings.map((s) => {
    const a = msOf(s.startsAt), b = msOf(s.endsAt);
    const live = !s.earned && nowMs > 0 && nowMs >= a && nowMs < b;
    const past = nowMs > 0 && nowMs >= b;
    return (
      <div key={s.sid} className={`gd-row gd-sc${past && !s.earned ? " dim" : ""}`}>
        <span className="gd-dt"><b>{dayOf(s.startsAt)}</b><i>{wdOf(s.startsAt)}</i></span>
        <span className="gd-tx">
          <span className="gd-nm">{s.title}</span>
          <span className="gd-sm">
            <span>{hmOf(s.startsAt)}–{hmOf(s.endsAt)}</span>
            <span className="gd-mi"><ItemIcon icon="art:goedam-ticket" size={16} /></span>
            <span>×{fmt(s.tickets || 1)}</span>
          </span>
        </span>
        <span className="gd-stt">
          {s.earned ? <span role="img" aria-label="완청"><Sprite {...CHECK} u={2} /></span> : live ? <span className="gd-live gd-pp">진행 중</span> : "–"}
        </span>
      </div>
    );
  });
  // 📌 받는 법 · 음성 — 서버 voice(null 이면 줄 없음 · 관리 미리보기 demo 에도 없을 수 있다). 분은 내림, N분을 넘으면 N분에서 멈춘다 · 오늘 받았으면 꽉 찬 막대 + ✓.
  //    on false(기간 밖 · 운영진에게만 보이는 꺼짐)면 줄을 흐리게. 채널 조건은 아직 없다(서버 · 봇 몫 — 화면은 받은 초만 그린다)
  const voice = data?.voice && typeof data.voice === "object" ? data.voice : null;
  const vMin = Math.floor(Number(voice?.minutes) || 0);
  let voiceRow = null;
  if (voice && vMin > 0) {
    const done = !!voice.todayGranted;
    const vNow = done ? vMin : Math.min(vMin, Math.floor(Math.max(0, Number(voice.todaySec) || 0) / 60));
    // 숫자 칸 폭 — 쉼표까지 센 글자 수(1,000분 이상이면 「1,440」 다섯 글자)로 잡아 분이 늘어도 막대가 안 밀리게
    const digits = fmt(vMin).length;
    const vFrom = dayOf(voice.startsAt), vTo = dayOf(voice.endsAt, true);
    voiceRow = (
      <div className={`gd-row gd-vc${voice.on ? "" : " dim"}`}>
        <span className="gd-tx">
          {/* 📌 2026-10-26 운영자 「하루 음성 60분 > 음성 채널 참여」 — 분 조건은 아래 막대 「N/60분」이 말한다 */}
          <span className="gd-nm">음성 채널 참여</span>
          <span className="gd-sm">
            {vFrom && vTo && <span>{vFrom}–{vTo}</span>}
            <span className="gd-mi"><ItemIcon icon="art:goedam-ticket" size={16} /></span>
            <span>×{fmt(voice.tickets || 1)}</span>
          </span>
          <span className="gd-vb">
            <Gauge ratio={vNow / vMin} />
            <span className="gd-vn" style={{ minWidth: `calc(${digits * 2 + 1}ch + 1em)` }}>{fmt(vNow)}/{fmt(vMin)}분</span>
          </span>
        </span>
        <span className="gd-stt">{done && <span role="img" aria-label="오늘 받음"><Sprite {...CHECK} u={2} /></span>}</span>
      </div>
    );
  }
  // 📌 받는 법 · 상점 — 서버 shop(추첨권을 파는 상품 하나 — 상품 상세 주소). 누르면 창을 닫고 이동(인벤토리 「기간 연장」 Link 와 같은 결 — 새 탭 열기(Ctrl · ⌘)면 창은 그대로)
  const shopHref = innerHref(data?.shop?.href);
  const shopRow = shopHref ? (
    <div className="gd-row gd-sp">
      <span className="gd-mi"><ItemIcon icon="art:goedam-ticket" size={32} /></span>
      <span className="gd-nm">{String(data.shop.name || "").trim() || "할로윈 추첨권"}</span>
      <Link href={shopHref} className="gd-sb gd-pp" onClick={sfxTick} onNavigate={closeAll}>바로가기</Link>
    </div>
  ) : null;
  const waysList = screeningRows.length || voiceRow || shopRow ? (
    <>
      {screeningRows.length > 0 && <p className="gd-sh">상영</p>}
      {screeningRows}
      {voiceRow && <p className="gd-sh">음성</p>}
      {voiceRow}
      {shopRow && <p className="gd-sh">상점</p>}
      {shopRow}
    </>
  ) : <p className="gd-none">준비 중</p>;
  const historyList = !signedIn ? <p className="gd-none">로그인 필요</p> : history.length ? history.map((h) => {
    const none = h.kind === "none";
    return (
      <div key={h.id} className={`gd-row gd-hs${none ? " dim" : ""}`}>
        <span className="gd-tx">
          {/* 희귀도 — 서버가 기록 줄에 실어 준 값(지금 상품 목록에서 빠진 상품도 등급 그대로), 없으면 상품 목록에서 */}
          {!none && <RarityChip v={h.rarity || rarityByPid[h.pid]} />}
          <span className="gd-nm">{nameOf(h)}</span>
          <span className="gd-at">{dayOf(h.at)} {hmOf(h.at)}</span>
        </span>
        {h.code && (
          <span className="gd-code">
            <code>{h.code}</code>
            <button type="button" className="gd-sb gd-pp" onClick={() => copy(h.code)}>복사</button>
          </span>
        )}
      </div>
    );
  }) : <p className="gd-none">없음</p>;
  const SECS = [
    { k: "prizes", l: "상품", body: prizesList },
    { k: "ways", l: "받는 법", body: waysList },
    { k: "history", l: "내 당첨", body: historyList },
  ];
  const secOn = SECS.find((s) => s.k === tab) || SECS[0];

  const win = (
      <div role={embedded ? "group" : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label={title} onClick={(e) => e.stopPropagation()} className={`gd-win${embedded ? " emb" : ""}`}>
        <div className="gd-wi">
          {narrow && !embedded && <span aria-hidden className="gd-grab"></span>}
          <button ref={closeRef} type="button" onClick={closeAll} aria-label="닫기" className="gd-x gd-pp">
            <Sprite {...XMARK} u={2} />
          </button>

          {/* 📌 2026-10-24 운영자 "위에 배너 달아주면" — 머리 = 띠 배너(제목 · 기간이 그림 안에). 제목 글은 화면 읽기용으로만 */}
          <div className="gd-hd ban">
            <h2 className="sr-only">{title}</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ART}/header.png`} alt="" width={992} height={240} draggable={false} className="gd-hdi gd-px" />
            {(data?.adminPreview || demo) && (
              <div className="gd-tags">
                {/* 운영진 미리보기(꺼져 있을 때 — 서버 adminPreview) · 관리 화면 연출 미리보기 */}
                {data?.adminPreview && !demo && <span className="gd-tag gd-off gd-pp">비공개</span>}
                {demo && <span className="gd-tag gd-off gd-pp">연출 미리보기</span>}
              </div>
            )}
          </div>

          {/* 📌 2026-10-24 창 크기 고정 — 왼쪽(무대 + 단추) · 오른쪽 옆판(탭 셋, 그 안만 스크롤). 폰은 위아래로 같은 순서 */}
          <div className="gd-main">
            <div className="gd-l">
              {/* 스크린(극장 무대) — 뽑는 중 누르면 건너뛰기 · 결과 카드를 누르면 평소 화면(추첨권 ×N) */}
              <div className={`gd-scr${running || anim?.step === "result" ? " tap" : ""}`} onClick={onScreen}>
                {screen}
                {/* 커튼 — 평소엔 양옆에 모여 있고 닫힘(close) · 열림(result) 때 움직인다. 전설 이상이면 닫힌 이음매에 등급 색 빛줄 */}
                <i aria-hidden className={`gd-stg gd-drape l${drape}`} />
                <i aria-hidden className={`gd-stg gd-drape r${drape}`} />
                {anim?.step === "close" && anim.hint && <i aria-hidden className="gd-stg gd-seam" style={{ "--rc": anim.hint }} />}
                <i aria-hidden className="gd-stg gd-val" />
                <i aria-hidden className="gd-stg gd-seat" />
              </div>
              {/* 📌 2026-10-25 결과 읽어 주기 — 늘 있는 빈 상태 칸에 다 보인 뒤 글을 넣는다(글이 이미 든 칸에 role 을 늦게 붙이면 화면 읽기가 안 읽는다). 화면엔 안 보임 */}
              <p className="sr-only" role="status">{anim?.step === "result" && anim.done && anim.results?.length ? batchText(anim.results) : ""}</p>
              <div className="gd-act">
                {action}
                {/* 📌 2026-10-29 운영자 "추첨권 구매하러가기 바로가기" — 뽑기 단추 바로 아래 한 줄(받는 법 › 상점 줄과 같은 주소 · 같은 결) */}
                {shopHref && (
                  <Link href={shopHref} className="gd-sb gd-pp gd-buy" onClick={sfxTick} onNavigate={closeAll}>추첨권 구매하러 가기</Link>
                )}
              </div>
            </div>
            <div className="gd-r gd-pp">
              <div className="gd-tabs" role="tablist">
                {SECS.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    role="tab"
                    aria-selected={s.k === secOn.k}
                    className={`gd-tab${s.k === secOn.k ? " on" : ""}`}
                    onClick={() => { if (s.k !== tab) { setTab(s.k); sfxTick(); } }}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
              <div className="gd-body" role="tabpanel">{data ? secOn.body : null}</div>
            </div>
          </div>
        </div>
      </div>
  );
  // 이벤트 창 안 — 틀(어둠 · 크기 · 탭)은 이벤트 창이 그린다
  if (embedded) return <><style>{GD_CSS}</style>{win}</>;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(10,10,10,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      onClick={closeAll}
    >
      <style>{GD_CSS}</style>
      {win}
    </div>
  );
}
