// 📌 아이템 효과 — 아이템을 인벤토리에 가진 사람에게 붙는 XP 효과의 정의 · 문구 · 값 검증 (사이트 공용).
//
//    저장 위치: 아이템 문서 자체(models/Item — chatBuffXp · voiceBuffXp · attendBuffXp · effects). 디스코드 역할 연결과 무관하다 —
//    역할 없는 아이템(예: XP Boost+)도 인벤토리에 있으면 효과가 붙는다. 기프트카드(physical)는 효과 없음.
//    "보유" 판정은 lib/ownedItems.js (인벤토리 my-items 의 (A)(B) 와 같은 규칙) — 같은 아이템은 몇 번 사도 효과 한 번.
//      · 기본 효과: chatBuffXp = 채팅 1회당 +N XP, voiceBuffXp = 음성 1회당 +N XP, attendBuffXp = 출석 시 +N XP
//      · 추가 효과: effects[] — 아래 TRIGGERS 중 하나(발동 · 상시 · 소모 · 꾸미기) + 크기 + (발동형만, 선택) 요일 · 시간대 · 채널 조건
//    (역할 버프 RoleConfig.buffXp · attendBuffXp 는 별개 — 관리자 › 레벨 설정 역할 탭, 그 디스코드 역할을 가진 동안만)
//    ⚠️ 봇(bot/src/itemEffects.js · features/*)은 별도 배포라 이 파일 · lib/ownedItems.js 를 import 하지 못한다 — 같은 규칙을 봇에 손으로 옮겨 둔다.
//       여기 상황(on) 값이나 의미 · 보유 판정을 바꾸면 봇도 반드시 함께 고칠 것.
//
//    효과 하나의 모양:
//      { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, chance?, minMembers?, seconds?, skin?, frame?, scene?,
//        days?: number[0-6], hourFrom?, hourTo?, channelIds?: string[] }
//      · days     : KST 요일(0=일 … 6=토). 비면 매일 — 발동형(kind "trigger")만
//      · hourFrom/hourTo : KST 시각(0~23). from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2). 둘 다 비면 하루 종일 — 발동형만
//      · channelIds : 채널이 있는 상황(channels)에서만 — 그 채널(또는 그 카테고리 안)에서만. 비면 모든 채널
//                     channels: "voice" 면 음성 채널, true 면 텍스트 채널에서 고른다(화면)
//      · percent  : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%
//      · chance   : 확률 %(1~100) — chatJackpot · attendLucky · wispHunt
//      · minMinutes : 분(1~1440) — voiceDaily(하루 누적 N분) · voiceCandy(N분마다) · voiceStay(이어서 머문 N분마다)
//      · maxPct   : 최대 %(1~100) — voiceStay(머물수록 오르는 % 의 끝)
//      · minMembers : 음성 채널 인원(봇 제외) 하한(2~99) — voiceParty
//      · seconds  : 초(1~3600) — cooldownCut. 📌 amount 에도 같은 값을 넣어 둔다(어느 쪽을 읽어도 같게)
//      · skin     : 카드 스킨 키(SKINS) — cardSkin
//      · frame    : 아바타 테두리 키(FRAMES = 등급 키) — avatarFrame
//      · scene    : 카드 배경 키(SCENES — sc_<영문>) — cardScene. 카드 테두리(skin)와 따로 고르고 함께 입는다(배경 위에 테두리)
//      · againAmount : 다시 오른 레벨 몫(0~) — levelUp 만(2026-10-18). 상점 · 강화에 XP 를 써서 내려갔다가 다시 오른 레벨에 이 값.
//                      없으면 크기(amount)의 절반(againXpOf · 봇 levelUpEffectXp). 처음 오른 레벨(시즌 최고 레벨을 넘은 만큼)은 amount 그대로
//
//    📌 종류(kind) — 효과가 언제 붙는지
//      trigger    : 발동형 — 봇이 그 상황에서 지급할 때 더한다. 요일 · 시간대 조건을 붙일 수 있다
//      perk       : 상시형 — 가지고 있는 동안 늘. 같은 효과는 아이템끼리 합한 뒤 상한(cap)으로 자른다(perksOfItems). 조건 없음
//      consumable : 소모형 — 한 번 쓰면 그 구매 건이 소모된다(Purchase.consumedAt). amount 는 1 고정(의미 없음)
//      cosmetic   : 꾸미기형 — 카드 스킨(카드 배경 · 카드 테두리) · 프로필 배지 · 아바타 테두리. amount 는 1 고정(의미 없음)
//    unit: 크기 단위(문구용) — 없으면 mode 로 정한다(add "XP" · percent "%")
//    exact: 분(minMinutes) · 확률(chance)이 범위 밖이면 자르지 않고 버린다 — 0분 · 101% 가 1분 · 100% 로 바뀌어 저장되지 않게(voiceCandy · wispHunt)
//
//    📌 화면 표기(2026-10-18) — 보일 효과 줄 · 타일은 effectLinesOf · effectTilesOf(관리자가 직접 쓴 문구 Item.effectText > 자동 · 꾸미기 문장 뺌),
//       꾸미기는 효과 대신 적용 범위(scopeOf · scopeLabelOf — Item.scope > 자동 AUTO_SCOPE). 한 벌로는 effectDisplayOf — 아래 「효과 문구 직접 쓰기 · 꾸미기 적용 범위」

import { POINT_RATE } from "./pointRate.js";

export const EFFECT_KINDS = [
  { v: "trigger", l: "발동" },
  { v: "perk", l: "상시" },
  { v: "consumable", l: "소모" },
  { v: "cosmetic", l: "꾸미기" },
];

export const TRIGGERS = [
  // ── 발동형 ──
  { v: "chat", l: "채팅 1회당", kind: "trigger", modes: ["add", "percent"], channels: true },
  { v: "voice", l: "음성 1회당", kind: "trigger", modes: ["add", "percent"], channels: "voice" },
  { v: "voiceDaily", l: "하루 음성 N분 채우면", kind: "trigger", modes: ["add"], needs: "minMinutes", once: true },
  { v: "firstChat", l: "하루 첫 채팅", kind: "trigger", modes: ["add"], once: true },
  { v: "attend", l: "출석 시", kind: "trigger", modes: ["add"] },
  { v: "attendEvery", l: "출석 N번째마다", kind: "trigger", modes: ["add"], needs: "everyN" },
  // again: 다시 오른 레벨 몫 칸(againAmount — 2026-10-18 운영자 "내려가고 다시 올라갔을 때 … 설정하는 칸은 왜 없어?"). 비우면 크기의 절반(againXpOf)
  { v: "levelUp", l: "레벨이 오를 때마다", kind: "trigger", modes: ["add"], again: true },
  { v: "chatJackpot", l: "채팅 1회당 확률 보너스", kind: "trigger", modes: ["add"], needs: "chance", channels: true },
  { v: "voiceParty", l: "음성 N명 이상일 때 1회당", kind: "trigger", modes: ["add", "percent"], needs: "minMembers", channels: "voice" },
  // 📌 2026-10-18 「마녀의 모래시계」 — 같은 음성 채널에 이어서 머문 시간(음성 XP 를 받은 시간) N분(minMinutes)마다 음성 XP +amount%, 최대 maxPct%.
  //    다른 채널로 옮기거나 나가면 0 부터(잠수 채널로 옮겨져도). 음성 XP 를 안 받는 동안(음소거 막기 · 제외 채널)은 멈춘다. 봇 재시작에는 이어 간다(UserXp.voiceStay).
  //    % 기준은 다른 음성 % 효과와 같다(기본 + 강화) · 핫타임 배수 없음. 봇 bot/src/itemEffects.js voiceStayXp · features/voiceTime.js
  { v: "voiceStay", l: "음성 머물수록 증가", kind: "trigger", modes: ["percent"], needs: "minMinutes", channels: "voice", maxPct: true },
  // 📌 2026-10-14 할로윈 「유령 펭귄의 초대」 부스터 — 보상 값은 아래 할로윈 효과 공용 블록(CANDY_TIERS · WISP_CATCH_XP). 핫타임 배수는 붙지 않는다
  //    voiceCandy(아이템 「사탕 바구니」): 음성 XP 를 받은 시간이 N분(minMinutes) 찰 때마다 무작위 XP 하나(구간 표 candyTiers · 기본 100~3,000). 크기 없음(amount 1)
  //    wispHunt(호박불 랜턴): 채팅 XP 를 받은 메시지에서 chance% 로 그 채널에 도깨비불 — 먼저 잡은 사람 +500~1,500 XP · 랜턴 주인 +amount XP
  //    📌 2026-10-18 이름은 하는 일 그대로(운영자 "음성 N분마다 사탕 < ㅇㅈㄹ 하지좀 말고") · 보상 구간 표는 효과마다(tiers — candyTiers, 위 할로윈 공용 블록)
  { v: "voiceCandy", l: "음성 N분마다 무작위 XP", kind: "trigger", modes: ["add"], needs: "minMinutes", channels: "voice", noAmount: true, exact: true, tiers: true },
  { v: "wispHunt", l: "채팅하면 도깨비불(확률)", kind: "trigger", modes: ["add"], needs: "chance", channels: true, exact: true },
  { v: "welcomeReply", l: "새 멤버에게 첫 답장", kind: "trigger", modes: ["add"], channels: true },
  { v: "attendLucky", l: "출석 시 확률 보너스", kind: "trigger", modes: ["percent"], needs: "chance" },
  { v: "attendPoint", l: "출석 시 빙옥", kind: "trigger", modes: ["add"], unit: "빙옥" },
  // ── 상시형 — cap: 같은 효과를 합한 뒤의 상한(한 칸의 최대도 같다) ──
  { v: "enhanceDiscount", l: "강화 비용 할인", kind: "perk", modes: ["percent"], unit: "%", cap: 50 },
  // 캐시백의 실제 상한은 관리자 설정(BotSetting.shopCashbackCap — 상점 관리 › 설정, 기본 30%) — 결제 API 가 자른다(cashbackRuleOf).
  //    여기 cap 은 칸 하나 · 합의 최대(낸 값 전부 = 100%)
  { v: "shopCashback", l: "ARCTIC 결제 캐시백", kind: "perk", modes: ["percent"], unit: "%", cap: 100 },
  { v: "questBonus", l: "퀘스트 보상 XP 보너스", kind: "perk", modes: ["percent"], unit: "%", cap: 100 },
  { v: "passBoost", l: "시즌 패스 진행 가속", kind: "perk", modes: ["percent"], unit: "%", cap: 50 },
  // 쿨타임 단축의 실제 상한은 "쿨타임의 절반" — 쿨타임을 아는 봇이 자른다. 여기 cap 은 칸 하나 · 합의 최대(초)
  { v: "cooldownCut", l: "채팅 쿨타임 단축", kind: "perk", modes: ["add"], unit: "초", needs: "seconds", cap: 3600 },
  { v: "muteRelief", l: "음소거 감소 완화", kind: "perk", modes: ["percent"], unit: "%p", cap: 100 },
  // ── 소모형 — use: 누가 쓰는지("bot" = 봇이 그 상황에서 저절로 1개 소모 — bot/src/itemEffects.js consumeOne).
  //    효과 없는 1회 소모권(닉네임 변경권 등)은 운영진이 관리자 유저 조회에서 1개 사용으로 쓴다(lib/itemConsume.js) ──
  { v: "streakShield", l: "연속 출석 보호막(1회)", kind: "consumable", modes: ["add"], noAmount: true, use: "bot" },
  // ── 꾸미기형 ──
  // 📌 2026-10-15 「카드 스킨」은 묶음 이름 — 카드 배경(cardScene · 카드 전체 그림) · 카드 테두리(cardSkin · 기존 스킨 전부). 두 칸은 따로 고르고 함께 입는다
  { v: "cardScene", l: "카드 배경", kind: "cosmetic", modes: ["add"], needs: "scene", noAmount: true },
  { v: "cardSkin", l: "카드 테두리", kind: "cosmetic", modes: ["add"], needs: "skin", noAmount: true },
  { v: "profileBadge", l: "프로필 배지", kind: "cosmetic", modes: ["add"], noAmount: true },
  //    「아바타 테두리」는 2026-10-15 부터 「프로필 테두리」로 부른다(키 avatarFrame 그대로)
  { v: "avatarFrame", l: "프로필 테두리", kind: "cosmetic", modes: ["add"], needs: "frame", noAmount: true },
];
export const TRIGGER_OF = Object.fromEntries(TRIGGERS.map((t) => [t.v, t]));

// ── 할로윈 효과 공용 블록 시작 (lib/itemEffects.js · bot/src/itemEffects.js 와 글자 그대로 같게) ──
// 📌 2026-10-14 할로윈 「유령 펭귄의 초대」 부스터 효과의 보상 값 — 사이트(문구)와 봇(지급)이 같은 값을 쓴다. 핫타임 배수는 붙지 않는다
//    음성 N분마다 무작위 XP(voiceCandy — 아이템 「사탕 바구니」): N분마다 하나 — 무게(w = 확률 %)로 구간을 고르고 그 안에서 정수 하나(양끝 포함).
//    📌 2026-10-18 운영자 "100~5000 인데 그걸 왜 내가 수정을 못해" · "5%면 개많네" · "3000 정도" — 구간 표는 효과마다(candyTiers — 상점 관리 효과 칸),
//       정하지 않은 효과는 아래 기본 표: 80% 100~800 · 19% 800~1,500 · 1% 1,500~3,000 XP("낮은 값이 자주")
export const CANDY_TIERS = [
  { w: 80, min: 100, max: 800 },
  { w: 19, min: 800, max: 1500 },
  { w: 1, min: 1500, max: 3000 },
];
export const CANDY_TIER_MAX = 5; // 구간 줄 수 최대
export const CANDY_XP_MAX = 1000000; // 구간 값 최대
// 구간 표 정리 — 줄마다 { w: 확률 %(0 초과 100 이하 · 소수 첫째 자리까지), min, max(정수 0~CANDY_XP_MAX · min ≤ max) }, 1~CANDY_TIER_MAX 줄, 확률 합 100.
//    하나라도 어긋나면 null(그 효과는 기본 표) — 관리 화면은 저장 전에 막는다(candyTiersError)
export function normalizeCandyTiers(v) {
  if (!Array.isArray(v) || !v.length || v.length > CANDY_TIER_MAX) return null;
  const out = [];
  for (const t of v) {
    const w = Math.round(Number(t?.w) * 10) / 10;
    const min = Math.floor(Number(t?.min));
    const max = Math.floor(Number(t?.max));
    if (!(w > 0 && w <= 100) || !Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > CANDY_XP_MAX || min > max) return null;
    out.push({ w, min, max });
  }
  return Math.round(out.reduce((s, t) => s + t.w, 0) * 10) / 10 === 100 ? out : null;
}
// 효과 하나의 구간 표 — 정한 표(candyTiers) · 없거나 어긋나면 기본 표
export const candyTiersOf = (e) => normalizeCandyTiers(e?.candyTiers) || CANDY_TIERS;
// 구간 표의 범위 [가장 작은 값, 가장 큰 값] — 문구의 「100~3,000 XP」
export const candyRangeOf = (tiers) => [Math.min(...tiers.map((t) => t.min)), Math.max(...tiers.map((t) => t.max))];
export const CANDY_XP_RANGE = candyRangeOf(CANDY_TIERS);
//    호박불 랜턴(wispHunt): 도깨비불을 먼저 잡은 사람이 받는 XP(정수, 양끝 포함). 랜턴 주인은 효과 크기(amount)만큼
export const WISP_CATCH_XP = [500, 1500];
// 정수 하나 [min, max] — rand 는 0 이상 1 미만(시험에서 바꿔 끼운다). 범위 밖 값이 와도 양끝 안으로
export const randXp = (min, max, rand = Math.random) => Math.min(max, min + Math.floor(Math.max(0, Number(rand()) || 0) * (max - min + 1)));
// 하나의 XP — 첫 rand 로 구간, 둘째 rand 로 그 안의 값. tiers: 그 효과의 구간 표(candyTiersOf — 어긋나면 기본 표)
export function pickCandyXp(rand = Math.random, tiers = CANDY_TIERS) {
  const list = normalizeCandyTiers(tiers) || CANDY_TIERS;
  const total = list.reduce((s, t) => s + t.w, 0);
  let r = Math.max(0, Number(rand()) || 0) * total;
  for (const t of list) {
    if (r < t.w) return randXp(t.min, t.max, rand);
    r -= t.w;
  }
  const last = list[list.length - 1];
  return randXp(last.min, last.max, rand);
}
// 도깨비불을 잡은 사람의 XP
export const pickWispXp = (rand = Math.random) => randXp(WISP_CATCH_XP[0], WISP_CATCH_XP[1], rand);
// ── 할로윈 효과 공용 블록 끝 ──

// 📌 소모형 효과가 있는 아이템인가 — 저장 모양(effects[])과 관리자 API 모양(effects: { list }) 둘 다 받는다.
//    소모품에는 역할을 연결하지 않는다(app/api/admin/items) · 인벤토리 ×N 묶음(lib/unitSale.js unitThingSet)이 쓴다
export const hasConsumable = (item) => {
  const ef = item?.effects;
  const list = Array.isArray(ef) ? ef : Array.isArray(ef?.list) ? ef.list : [];
  return list.some((e) => TRIGGER_OF[e?.on]?.kind === "consumable");
};

// 📌 카드 테두리(예전 「카드 스킨」 전부 — 효과 cardSkin · 키 skin 그대로) — 이미지 카드(레벨업 · 프로필 · 출석)를 그리는 봇(bot/src/botCards.js)과 같은 키를 쓴다
export const SKINS = [
  { v: "gold", l: "골드" },
  { v: "aurora", l: "오로라" },
  { v: "ice", l: "아이스" },
  { v: "crimson", l: "크림슨" },
  // 시즌 2 「A New World」 — 새로운 세계(패스 보상) · 항해도 · 비공정(시즌 상점). 그림은 lib/cardSkins
  { v: "newworld", l: "새로운 세계" },
  { v: "chart", l: "항해도" },
  { v: "airship", l: "비공정" },
  // 📌 등급 카드 스킨 「랭크 깃발」(2026-10-10) — 시즌 티어 보상. 키 rank_<등급 키>(그림 lib/cardSkins/rank.js), 이름은 "<등급> 등급"(골드 스킨과 헷갈리지 않게).
  //    시즌 결산 때 적힌 등급(UserXp.seasonFrame)으로 아이템 없이 가진다(seasonSkinOf) · 관리자는 아이템으로도 줄 수 있다(rank_all = 9종 전부, 시험용)
  ...[["bronze", "브론즈"], ["silver", "실버"], ["gold", "골드"], ["platinum", "플래티넘"], ["diamond", "다이아몬드"], ["master", "마스터"], ["grandmaster", "그랜드마스터"], ["challenger", "챌린저"], ["igloo", "이글루"]]
    .map(([k, l]) => ({ v: `rank_${k}`, l: `${l} 등급` })),
  { v: "rank_all", l: "등급 전체" },
  // 📌 할로윈 시즌 카드 스킨(2026-10 — 10/10 운영자 합격본). 키 hw_<짧은 영문>, 그림 lib/cardSkins/hw_*.js
  { v: "hw_pumpkin", l: "호박 밭" },
  { v: "hw_ghost", l: "유령 파티" },
  { v: "hw_witch", l: "마녀의 밤" },
  { v: "hw_candy", l: "사탕 가게" },
  { v: "hw_grave", l: "달빛 묘지" },
  { v: "hw_blackcat", l: "검은 고양이" },
  // 📌 할로윈 「유령 펭귄의 초대」 이벤트 카드 테두리(2026-10) — 키 ev_<영문>, 그림 lib/cardSkins/ev_ghost.js. 카드 배경 「유령 펭귄의 밤」(sc_ghost)과 한 벌
  { v: "ev_ghost", l: "유령 펭귄의 초대" },
  // 📌 친구 초대 전용 카드 테두리(2026-10-25 운영자 콘셉트 — "좋은 인연(행운)을 물고 온 친구") — 그림 lib/cardSkins/ev_clover.js. 프로필 테두리 evf_clover 와 한 벌
  { v: "ev_clover", l: "네잎클로버 덩굴" },
  // 📌 서버 부스터 전용 카드 테두리(2026-10-25 운영자 콘셉트 「흩날리는 깃털과 엔젤 링」) — 그림 lib/cardSkins/bs_feather.js. 프로필 테두리 bsf_aura 와 한 벌
  { v: "bs_feather", l: "흩날리는 깃털과 엔젤 링" },
];
export const SKIN_OF = Object.fromEntries(SKINS.map((s) => [s.v, s]));
// 📌 "rank_all" — 등급 카드 스킨 9종 전부(관리자 테스트용 아이템 하나로 다 입혀 보기 — 아바타 테두리 FRAME_ALL 과 같은 뜻). 효과 칸의 skin 에만 쓰고 착용 값(cardSkinPick)은 늘 rank_<등급>
export const SKIN_RANK_ALL = "rank_all";
export const RANK_SKIN_KEYS = SKINS.filter((s) => s.v.startsWith("rank_") && s.v !== SKIN_RANK_ALL).map((s) => s.v);
// 효과의 skin 값 → 가진 것으로 치는 스킨 키들(모르는 값은 [])
export const skinsOf = (skin) => (skin === SKIN_RANK_ALL ? RANK_SKIN_KEYS : SKIN_OF[skin] ? [skin] : []);
// 📌 유저가 고른 스킨(UserXp.cardSkinPick) — "" 는 안 고름, SKIN_NONE 은 스킨 끔, 그 밖은 스킨 키. 봇 bot/src/itemEffects.js pickCardSkin 과 같은 규칙
//    📌 2026-10-04 "굳이임 이것도" — 자동 착용 없음: 직접 고른 스킨만 입힌다. 안 골랐거나 끔이면 기본 카드("").
//       고른 스킨을 더 이상 갖고 있지 않으면(만료 · 환불) 기본 카드
export const SKIN_NONE = "none";
export function pickCardSkin(skins, pick) {
  const list = Array.isArray(skins) ? skins : [];
  if (!pick || pick === SKIN_NONE) return "";
  return list.includes(pick) ? pick : "";
}

// 📌 카드 배경(2026-10-15) — 카드 배경 그림 전체를 바꾼다(레벨 막대 모양도 배경 몫). 카드 테두리(SKINS)와 따로 고르고 함께 입는다 — 배경 위에 테두리.
//    키는 sc_<영문>(테두리 키와 겹치지 않게). 그림은 lib/cardScenes(봇 bot/src/cardScenes — 같은 키). 이 파일은 화면에서도 import 하므로 그림 코드는 끌어오지 않는다
//    봇 bot/src/itemEffects.js SCENE_KEYS 와 같은 키여야 한다
export const SCENES = [
  // 📌 할로윈 「유령 펭귄의 초대」 이벤트(2026-10)
  { v: "sc_ghost", l: "유령 펭귄의 밤" },
  // 📌 친구 초대 「네잎클로버 덩굴」 한 벌 · 움직이는 배경(2026-10-25)
  { v: "sc_clover", l: "바람의 클로버 언덕" },
];
export const SCENE_OF = Object.fromEntries(SCENES.map((s) => [s.v, s]));
// 효과의 scene 값 → 가진 것으로 치는 배경 키들(모르는 값은 [])
export const scenesOf = (scene) => (SCENE_OF[scene] ? [scene] : []);
// 📌 유저가 고른 배경(UserXp.cardScenePick) — 카드 테두리와 같은 규칙("" 안 고름 · SKIN_NONE 끔 · 배경 키, 자동 착용 없음 · 더 이상 없으면 "")
export const pickCardScene = (scenes, pick) => pickCardSkin(scenes, pick);

// 📌 프로필 테두리(예전 「아바타 테두리」 — 효과 avatarFrame · 키 frame 그대로) — 시즌 종료 티어 보상(브론즈 ~ 이글루). 키는 등급 키(lib/voiceTiers.js), 그림은 public/avatar-borders/<키>.svg
//    (scripts/gen-avatar-frames.mjs 가 그린다). 고르는 규칙은 카드 스킨과 같다 — UserXp.avatarFramePick, "" 안 고름 · SKIN_NONE 끔
//    이 파일은 화면에서도 import 하므로 voiceTiers 를 끌어오지 않고 이름만 옮겨 둔다
export const FRAMES = [
  { v: "bronze", l: "브론즈" },
  { v: "silver", l: "실버" },
  { v: "gold", l: "골드" },
  { v: "platinum", l: "플래티넘" },
  { v: "diamond", l: "다이아몬드" },
  { v: "master", l: "마스터" },
  { v: "grandmaster", l: "그랜드마스터" },
  { v: "challenger", l: "챌린저" },
  { v: "igloo", l: "이글루" },
  // 📌 할로윈 프로필 꾸미기(2026-10, 운영자 10/9 ~ 10/10 합격) — 키 hwf_<영문>, 그림 public/avatar-borders/<키>.svg(scripts/gen-deco-frames.mjs). 등급과 무관 — 아이템으로만 가진다
  { v: "hwf_pumpkin", l: "호박 입" },
  { v: "hwf_crystal", l: "수정 구슬" },
  { v: "hwf_ghost", l: "유령 이불" },
  { v: "hwf_candy", l: "포장 사탕" },
  { v: "hwf_mummy", l: "미라" },
  { v: "hwf_window", l: "유령의 집 창문" },
  { v: "hwf_blackcat", l: "검은 고양이" },
  // 📌 할로윈 카드 짝 5종(10/9 최종안 — 할로윈 카드 스킨과 한 세트, 운영자 10/11 "다 처넣으시라구요"). 마녀의 밤은 고친 판(초승달 · 배불뚝이 솥)
  { v: "hwf_patch", l: "호박 밭" },
  { v: "hwf_party", l: "유령 파티" },
  { v: "hwf_witch", l: "마녀의 밤" },
  { v: "hwf_shop", l: "사탕 가게" },
  { v: "hwf_grave", l: "달빛 묘지" },
  // 📌 시즌 2 「A New World」 카드 짝 테두리 — 카드 스킨 새로운 세계 · 항해도 · 비공정과 한 세트(키 nwf_<영문>)
  { v: "nwf_world", l: "새로운 세계" },
  { v: "nwf_chart", l: "항해도" },
  { v: "nwf_airship", l: "비공정" },
  // 📌 할로윈 「유령 펭귄의 초대」 이벤트 프로필 테두리(2026-10) — 키 evf_<영문>, 그림 public/avatar-borders/evf_ghost.svg(scripts/gen-deco-frames.mjs)
  { v: "evf_ghost", l: "유령 펭귄의 꼬리" },
  // 📌 친구 초대 전용 프로필 테두리(2026-10-25) — 카드 테두리 ev_clover 와 한 벌. 운영자 "왼쪽에서 오른쪽으로 타고 가는 게 나을 거 같은데 윗 공간이 비게" · "애니메이션도 있게"
  //    그림 public/avatar-borders/evf_clover.svg(scripts/gen-deco-frames.mjs — 사이트 그림만 움직임, 봇은 정지 그림)
  { v: "evf_clover", l: "네잎클로버 덩굴" },
  // 📌 서버 부스터 전용 프로필 테두리(2026-10-25 운영자 콘셉트 「부스트 오라 & 깃털 궤도」) — 카드 테두리 bs_feather 와 한 벌.
  //    그림 public/avatar-borders/bsf_aura.svg(scripts/gen-deco-frames.mjs — 깃 둘 · 반짝이 셋이 사진 둘레를 도는 움직임은 사이트만, 봇은 정지 그림)
  { v: "bsf_aura", l: "부스트 오라 & 깃털 궤도" },
];
export const FRAME_OF = Object.fromEntries(FRAMES.map((f) => [f.v, f]));
// 📌 등급 테두리 9종(시즌 티어 보상 — 키 = 등급 키). "전체"(FRAME_ALL) · 시즌 테두리(seasonFrameOf) · 등급 카드 스킨(rank_<등급>)은 이것만 가리킨다(꾸미기 hwf_* · nwf_* 는 빠짐)
export const TIER_FRAME_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "grandmaster", "challenger", "igloo"];
export const TIER_FRAMES = FRAMES.filter((f) => TIER_FRAME_KEYS.includes(f.v));
// 📌 "all" — 등급 테두리 9종 전부(관리자 테스트용 아이템 하나로 다 껴 보기, 2026-10-10 — 꾸미기 테두리는 들지 않는다). 효과 칸의 frame 에만 쓰고 착용 값(avatarFramePick)은 늘 테두리 키
export const FRAME_ALL = "all";
// 효과의 frame 값 → 가진 것으로 치는 테두리 키들(모르는 값은 [])
export const framesOf = (frame) => (frame === FRAME_ALL ? [...TIER_FRAME_KEYS] : FRAME_OF[frame] ? [frame] : []);
// 📌 시즌 티어 테두리 — 시즌이 끝나면 봇(bot/src/features/seasonSettle.js settleFrames)이 모든 UserXp 에 「시즌 끝 순간 등급」을 seasonFrame { season, frame } 으로 적는다.
//    아이템 없이 그 테두리를 가진 것으로 친다(다음 시즌 동안). 다음 결산이 새 값으로 덮어써서 저절로 바뀌거나 빠진다(아이언은 "")
export const seasonFrameOf = (doc) => { const f = doc?.seasonFrame?.frame; return f && TIER_FRAME_KEYS.includes(f) ? f : ""; }; // 등급 키만 — 꾸미기 키가 적혀 있어도 시즌 테두리 · rank_<등급> 스킨으로 치지 않는다
// 아이템으로 가진 테두리 + 시즌 테두리(중복 없이, 시즌 테두리는 맨 뒤)
export const withSeasonFrame = (frames, doc) => { const list = Array.isArray(frames) ? frames : []; const f = seasonFrameOf(doc); return f && !list.includes(f) ? [...list, f] : list; };
export const pickAvatarFrame = (frames, pick) => pickCardSkin(frames, pick);
// 📌 시즌 등급 카드 스킨 — 시즌 티어 테두리와 같은 보상(같은 seasonFrame 등급). 아이템 없이 rank_<등급> 스킨을 가진 것으로 친다(다음 결산이 덮어써 바뀌거나 빠짐)
export const seasonSkinOf = (doc) => { const f = seasonFrameOf(doc); return f ? `rank_${f}` : ""; };
export const withSeasonSkin = (skins, doc) => { const list = Array.isArray(skins) ? skins : []; const s = seasonSkinOf(doc); return s && !list.includes(s) ? [...list, s] : list; };

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const MAX_EFFECTS = 20;
export const MAX_BADGES = 3; // 프로필 배지 — 이름 옆에 최대 몇 개
// 📌 유저가 단 배지(UserXp.badgePick — 아이템 id 배열, 앞에서부터 1 · 2 · 3번 자리). 그중 지금 가진 것만(유저가 정한 순서 · 중복 없이 · 최대 MAX_BADGES).
//    배열이 아니면(안 고름) · [] 는 배지 없음. 이름 옆에도 이 순서대로 붙는다(인벤토리 배지 창에서 정한다 — app/api/xp/badge { order })
//    📌 2026-10-04 "3개까지만 달 수 있고, 직접 안 고른 유저는 자동으로도 달리지 않게" — 산 배지도 직접 달기 전에는 보이지 않는다
//       (10/1 의 '산 배지만 자동'을 없앴다). 단 배지를 더 이상 갖고 있지 않으면(만료 · 환불) 그냥 빠진다. allBadges: perksOfItems 의 allBadges
export function pickBadges(allBadges, pick) {
  if (!Array.isArray(pick)) return [];
  const byId = new Map();
  for (const b of Array.isArray(allBadges) ? allBadges : []) if (b && !byId.has(b.itemId)) byId.set(b.itemId, b);
  const out = [];
  for (const id of pick) {
    const b = byId.get(String(id));
    if (b && !out.includes(b)) out.push(b);
    if (out.length >= MAX_BADGES) break;
  }
  return out;
}

// 📌 배지 창 칸 계산(app/components/Inventory BadgeWindow) — 칸은 MAX_BADGES 개 배열(앞에서부터 1 · 2 · 3번), 빈 칸은 null.
//    칸 사이는 비우지 않는다 — 늘 앞에서부터 채워 '칸 번호 = 저장 순서(badgeOrderOf) = 이름 옆 순서'. 빈 칸은 뒤에만 남는다
export const badgeSlotsOf = (ids) => Array.from({ length: MAX_BADGES }, (_, i) => (Array.isArray(ids) && ids[i] ? String(ids[i]) : null));
export const badgeOrderOf = (slots) => (Array.isArray(slots) ? slots.filter(Boolean) : []);
const packSlots = (slots) => badgeSlotsOf(badgeOrderOf(slots)); // 빈 칸을 뒤로(앞으로 당김)
// 처음 고르는 칸 — 첫 빈 칸, 다 찼으면 1번
export const firstEmptySlot = (slots) => Math.max(0, slots.indexOf(null));
// 고를 수 있는 칸 — 빈 칸을 누르면 첫 빈 칸(뒤 빈 칸에 넣어도 앞으로 당겨지므로)
export const pickSlot = (slots, at) => (slots[at] == null ? firstEmptySlot(slots) : at);
// 다음 빈 칸 — at 다음부터 한 바퀴. 없으면 그대로 at
export function nextEmptySlot(slots, at) {
  for (let k = 1; k <= slots.length; k++) {
    const i = (at + k) % slots.length;
    if (slots[i] == null) return i;
  }
  return at;
}
// 고른 칸(at)에 배지를 넣는다 — 그 칸에 있던 건 빠지고, 그 배지가 다른 칸에 있었으면 두 칸을 맞바꾼다. 결과는 앞으로 당긴다
//   → { slots, kind: "put" 새로 닮 | "swap" 자리 바꿈 | "same" 이미 그 칸, at: 배지가 들어간 칸 }
export function putBadgeAt(slots, at, id) {
  const next = [...slots];
  const from = next.indexOf(id);
  if (from === at) return { slots: next, kind: "same", at };
  if (from >= 0) next[from] = next[at];
  next[at] = id;
  const out = packSlots(next);
  return { slots: out, kind: from >= 0 ? "swap" : "put", at: out.indexOf(id) };
}
// 칸(at)의 배지를 뺀다 — 뒤 칸이 한 칸씩 당겨진다
export const takeBadgeAt = (slots, at) => packSlots(slots.map((v, i) => (i === at ? null : v)));
const LIMIT = { add: 1_000_000, percent: 500, minutes: 1440, everyN: 365 };
// 새 칸의 범위 — 화면 입력칸(min · max)도 이 값을 쓴다
export const FIELD_RANGE = { chance: [1, 100], minMembers: [2, 99], seconds: [1, 3600], maxPct: [1, 100] };

const int = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};
// 비었거나(undefined · null · "") 0 이하면 없음 — "" · 0 을 최솟값(확률 1% 등)으로 채우지 않게. 나머지는 범위로 자른다
const need = (v, lo, hi) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : null;
};
// 📌 exact 효과(voiceCandy · wispHunt)의 분 · 확률 — 비었거나 범위 밖이면 없음(자르지 않는다). 소수는 버린다
const within = (v, lo, hi) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

// 효과 한 칸의 크기 최대 — 상시형은 상한, 나머지는 방식별
export const amountMaxOf = (t, mode) => (t?.cap ? t.cap : mode === "percent" ? LIMIT.percent : LIMIT.add);
// 📌 다시 오른 레벨 몫(levelUp) — 정한 값(againAmount) · 없으면 크기의 절반(버림). 봇 levelUpEffectXp 와 같은 규칙(여럿이면 정하지 않은 칸끼리 합한 뒤 절반)
export const againXpOf = (e) => (e?.againAmount != null && Number.isFinite(Number(e.againAmount)) ? Math.max(0, Math.floor(Number(e.againAmount))) : Math.floor((Number(e?.amount) || 0) / 2));

// 저장 전 정리 — 모르는 상황 · 빈 값은 버린다. 서버(API)와 화면이 같은 규칙을 쓴다
export function normalizeEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, MAX_EFFECTS)) {
    const t = TRIGGER_OF[raw?.on];
    if (!t) continue;
    const mode = t.modes.includes(raw?.mode) ? raw.mode : t.modes[0];
    let amount;
    let seconds = null;
    if (t.noAmount) amount = 1;
    else if (t.needs === "seconds") {
      // 쿨타임 단축은 초 칸 하나 — amount 에도 같은 값을 둔다
      seconds = need(raw?.seconds ?? raw?.amount, ...FIELD_RANGE.seconds);
      amount = seconds;
    } else amount = int(raw?.amount, 0, amountMaxOf(t, mode));
    if (!amount) continue;
    const e = { id: String(raw?.id || "").slice(0, 24) || Math.random().toString(36).slice(2, 10), on: t.v, mode, amount };
    if (t.needs === "minMinutes") {
      const m = t.exact ? within(raw?.minMinutes, 1, LIMIT.minutes) : int(raw?.minMinutes, 1, LIMIT.minutes);
      if (!m) continue;
      e.minMinutes = m;
    }
    if (t.needs === "everyN") {
      const n = int(raw?.everyN, 2, LIMIT.everyN);
      if (!n) continue;
      e.everyN = n;
    }
    if (t.needs === "chance") {
      const c = t.exact ? within(raw?.chance, ...FIELD_RANGE.chance) : need(raw?.chance, ...FIELD_RANGE.chance);
      if (!c) continue;
      e.chance = c;
    }
    if (t.needs === "minMembers") {
      const m = need(raw?.minMembers, ...FIELD_RANGE.minMembers);
      if (!m) continue;
      e.minMembers = m;
    }
    if (t.needs === "seconds") e.seconds = seconds;
    // 📌 최대 %(voiceStay — maxPct) — 비었거나 0 이하면 효과를 버린다(끝이 없는 효과가 저장되지 않게)
    if (t.maxPct) {
      const mx = need(raw?.maxPct, ...FIELD_RANGE.maxPct);
      if (!mx) continue;
      e.maxPct = mx;
    }
    // 📌 다시 오른 레벨 몫(levelUp — again) — 비우면 없음(= 크기의 절반), 0 이면 다시 오른 레벨엔 주지 않는다. 크기와 같은 범위
    if (t.again && raw?.againAmount !== "" && raw?.againAmount != null) {
      const a = int(raw.againAmount, 0, amountMaxOf(t, mode));
      if (a != null) e.againAmount = a;
    }
    // 📌 보상 구간 표(voiceCandy — tiers · 2026-10-18) — 맞는 표만(normalizeCandyTiers), 어긋나거나 없으면 칸 없음(= 기본 표 CANDY_TIERS)
    if (t.tiers && raw?.candyTiers != null) {
      const ct = normalizeCandyTiers(raw.candyTiers);
      if (ct) e.candyTiers = ct;
    }
    if (t.needs === "skin") {
      const s = String(raw?.skin || "");
      if (!SKIN_OF[s]) continue;
      if (out.some((x) => x.skin)) continue; // 카드 스킨은 아이템 하나에 하나 — 인벤토리 착용 버튼이 아이템마다 하나라서(봇 cleanEffects 와 같다)
      e.skin = s;
    }
    if (t.needs === "frame") {
      const fr = String(raw?.frame || "");
      if (!FRAME_OF[fr] && fr !== FRAME_ALL) continue;
      if (out.some((x) => x.frame)) continue; // 테두리 효과는 아이템 하나에 하나 — 여러 개를 주려면 "all"(전체)
      e.frame = fr;
    }
    if (t.needs === "scene") {
      const sc = String(raw?.scene || "");
      if (!SCENE_OF[sc]) continue;
      if (out.some((x) => x.scene)) continue; // 카드 배경은 아이템 하나에 하나(카드 테두리와는 한 아이템에 함께 있어도 된다 — 봇 cleanEffects 와 같다)
      e.scene = sc;
    }
    // 요일 · 시간대는 발동형에만 — 상시 · 소모 · 꾸미기는 가지고 있는 동안 늘 붙는다
    if (t.kind === "trigger") {
      const days = Array.isArray(raw?.days) ? [...new Set(raw.days.map((d) => int(d, 0, 6)).filter((d) => d != null))].sort() : [];
      if (days.length && days.length < 7) e.days = days;
      const hf = raw?.hourFrom === "" || raw?.hourFrom == null ? null : int(raw.hourFrom, 0, 23);
      const ht = raw?.hourTo === "" || raw?.hourTo == null ? null : int(raw.hourTo, 0, 24);
      if (hf != null && ht != null && hf !== ht) { e.hourFrom = hf; e.hourTo = ht; }
    }
    if (t.channels && Array.isArray(raw?.channelIds)) {
      const ch = [...new Set(raw.channelIds.map((c) => String(c || "").trim()).filter(Boolean))].slice(0, 20);
      if (ch.length) e.channelIds = ch;
    }
    out.push(e);
  }
  return out;
}

// 조건 조각 — 요일 · 시간대 · 채널 (문구 뒤에 " · " 로 붙는다)
function condOf(e, channelName) {
  const cond = [];
  if (Array.isArray(e.days) && e.days.length) {
    const d = [...e.days].sort().join(",");
    cond.push(d === "0,6" ? "주말" : d === "1,2,3,4,5" ? "평일" : e.days.map((x) => DAY_LABELS[x]).join("·"));
  }
  if (e.hourFrom != null && e.hourTo != null) cond.push(`${e.hourFrom}~${e.hourTo}시`);
  if (Array.isArray(e.channelIds) && e.channelIds.length) {
    cond.push(e.channelIds.length === 1 && channelName ? `#${channelName}` : `채널 ${e.channelIds.length}곳`);
  }
  return cond;
}

const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");
const MINUS = "−";

// 📌 효과 한 칸의 짧은 문구 조각 — 게임 아이템 효과처럼. 한 줄 문장(describeEffect)과 상세 타일(effectParts)이 같은 원천을 쓴다.
//    { label, amount, unit, sep } — 문장은 label + sep + amount + unit (unit 이 "XP" 면 한 칸 띄운다)
//    tile: 크기가 없는 효과(소모 · 꾸미기)를 타일에 그릴 때의 { label, amount } — 문장과 따로 둔다
//    📌 2026-10-18 운영자 "기본적으로 네가 적고 내가 수정을 할 수 있게" — 자동 문구를 덜 딱딱하게(「채팅 1회당 +50%」 → 「채팅 XP +50%」).
//       XP 를 더하는 효과는 「채팅 XP +50」처럼 이름에 XP 를 넣고 단위를 다시 붙이지 않는다. 조건(요일 · 시간대 · 채널)은 그대로 뒤에 「 · 주말 22~2시」.
//       사탕 바구니 · 호박불 랜턴 문구는 그대로(scripts/test-halloween-effects.mjs 가 글자로 본다). 관리자가 아이템마다 고쳐 쓸 수 있다(Item.effectText — 아래 effectLinesOf)
function pieceOf(e) {
  const t = TRIGGER_OF[e.on];
  const unit = t.unit || (e.mode === "percent" ? "%" : "XP");
  const plus = { amount: `+${fmt(e.amount)}`, unit };
  // XP 크기 — % 면 「채팅 XP +50%」, 더하기면 「채팅 XP +50」(이름에 XP 가 있어 단위를 다시 붙이지 않는다)
  const xp = (label) => ({ label, amount: `+${fmt(e.amount)}`, unit: e.mode === "percent" ? "%" : "" });
  // 요일을 정했으면 "매일"을 빼고 뒤의 요일 조건이 대신한다 — "매일 첫 채팅 · 월" 처럼 서로 어긋나지 않게
  const daily = Array.isArray(e.days) && e.days.length ? "" : "매일 ";
  switch (e.on) {
    case "chat": return xp("채팅 XP");
    case "voice": return xp("음성 XP");
    case "attend": return xp("출석 XP");
    case "voiceDaily": return { label: `${daily}음성 ${fmt(e.minMinutes)}분`, ...plus };
    case "firstChat": return { label: `${daily}첫 채팅`, ...plus };
    case "attendEvery": return { label: `출석 ${fmt(e.everyN)}번마다`, ...plus };
    case "levelUp": return { label: "레벨업마다", ...plus };
    case "chatJackpot": return { label: `채팅 ${fmt(e.chance)}% 확률`, ...plus };
    case "voiceParty": return xp(`${fmt(e.minMembers)}명 이상 음성 XP`);
    // 📌 2026-10-18 마녀의 모래시계 — 「음성 25분마다 XP +1% · 최대 20%」. 끝(최대)은 크기 뒤 꼬리(tail) · 타일은 조건 맨 앞(tailCond)
    case "voiceStay": return { label: `음성 ${fmt(e.minMinutes)}분마다 XP`, amount: `+${fmt(e.amount)}`, unit: "%", tail: ` · 최대 ${fmt(e.maxPct)}%`, tailCond: `최대 ${fmt(e.maxPct)}%` };
    // 📌 2026-10-14 할로윈 — 사탕은 크기 칸 대신 보상 구간(CANDY_XP_RANGE), 도깨비불은 잡는 사람 구간 + 주인 몫(amount)
    //    2026-10-18 「음성 15분마다 100~3,000 XP」 — 범위는 그 효과의 구간 표(candyTiersOf)
    case "voiceCandy": {
      const r = candyRangeOf(candyTiersOf(e));
      return { label: `음성 ${fmt(e.minMinutes)}분마다`, amount: `${fmt(r[0])}~${fmt(r[1])}`, unit: "XP" };
    }
    case "wispHunt": return { label: `채팅 ${fmt(e.chance)}% 도깨비불 · 잡으면 +${fmt(WISP_CATCH_XP[0])}~${fmt(WISP_CATCH_XP[1])} XP · 주인`, ...plus };
    case "welcomeReply": return { label: "새 멤버에게 첫 답장", ...plus };
    case "attendLucky": return { label: `출석 ${fmt(e.chance)}% 확률 XP`, amount: `+${fmt(e.amount)}`, unit: "%" };
    case "attendPoint": return { label: "출석 빙옥", amount: `+${fmt(e.amount)}`, unit: "" };
    case "enhanceDiscount": return { label: "강화 비용", amount: `${MINUS}${fmt(e.amount)}`, unit: "%" };
    case "shopCashback": return { label: "ARCTIC 캐시백", amount: fmt(e.amount), unit: "%" };
    case "questBonus": return { label: "퀘스트 XP", ...plus };
    case "passBoost": return { label: "시즌 패스 진행", ...plus };
    case "cooldownCut": return { label: "채팅 쿨타임", amount: `${MINUS}${fmt(e.seconds || e.amount)}`, unit: "초" };
    case "muteRelief": return { label: "음소거 패널티", amount: `${MINUS}${fmt(e.amount)}`, unit: "%p" };
    case "streakShield": return { label: "연속 출석 보호막", amount: "1", unit: "회" };
    case "cardSkin": {
      const s = SKIN_OF[e.skin]?.l || "기본";
      return { label: "카드 테두리", sep: " · ", amount: s, unit: "", tile: { label: "카드 테두리", amount: s } };
    }
    case "cardScene": {
      const sc = SCENE_OF[e.scene]?.l || "기본";
      return { label: "카드 배경", sep: " · ", amount: sc, unit: "", tile: { label: "카드 배경", amount: sc } };
    }
    case "profileBadge": return { label: "프로필 배지", amount: "", unit: "", tile: { label: "프로필", amount: "배지" } };
    case "avatarFrame": {
      const fr = e.frame === FRAME_ALL ? "전체" : FRAME_OF[e.frame]?.l || "기본";
      return { label: "프로필 테두리", sep: " · ", amount: fr, unit: "", tile: { label: "프로필 테두리", amount: fr } };
    }
    default: return { label: t.l, ...plus };
  }
}

// 📌 효과 한 칸의 조각 — { label: "채팅 1회당", amount: "+50", unit: "%" | "XP", cond: ["주말", "22~2시"], once }
//    상품 상세는 이 조각으로 타일을 그리고, 인벤토리 · 관리자는 describeEffect 한 줄 문장을 쓴다(같은 원천)
export function effectParts(e, channelName) {
  const t = TRIGGER_OF[e?.on];
  if (!t) return null;
  // 📌 문구는 게임 아이템 효과처럼 짧게 — "하루 1번"은 따로 붙이지 않고 앞의 "매일"이 대신한다
  const p = pieceOf(e);
  // 꾸미기(카드 스킨 · 아바타 테두리 · 프로필 배지) 조각엔 cosmetic: true — 이름 · 분류와 같은 말이라 세트 구성 칸은 이 조각을 빼고 진짜 효과만 보인다(2026-10-11)
  const cos = t.kind === "cosmetic" ? { cosmetic: true } : {};
  if (p.tile) return { label: p.tile.label, amount: p.tile.amount, unit: "", cond: [], once: false, ...cos };
  // 꼬리(최대 % 등)는 조건 맨 앞 — 타일은 큰 크기 아래 작은 글자로
  return { label: p.label, amount: p.amount, unit: p.unit, cond: [...(p.tailCond ? [p.tailCond] : []), ...condOf(e, channelName)], once: false, ...cos };
}

// 아이템 하나의 효과 조각들 — 기본 효과 세 칸 + 조건 효과. 기프트카드는 []
//    (자동 조각 그대로 — 꾸미기 조각(cosmetic: true)도 든다. 화면에 그릴 타일은 아래 effectTilesOf: 직접 쓴 문구 > 자동 · 꾸미기 조각 뺌)
export function itemEffectPartsOf(item, channelNameOf) {
  if (!item || item.type === "physical") return [];
  const api = item.effects && typeof item.effects === "object" && !Array.isArray(item.effects) ? item.effects : null;
  const src = api || item;
  const list = api ? api.list : item.effects;
  // 기본 효과 세 칸 — 같은 이름의 추가 효과(채팅 · 음성 · 출석, 더하기)와 같은 조각
  const basic = (label, v) => (Number(v) > 0 ? [{ label, amount: `+${fmtXp(v)}`, unit: "", cond: [], once: false }] : []);
  const nameOf = (id) => (typeof channelNameOf === "function" ? channelNameOf(String(id)) : undefined);
  return [
    ...basic("채팅 XP", src.chatBuffXp),
    ...basic("음성 XP", src.voiceBuffXp),
    ...basic("출석 XP", src.attendBuffXp),
    ...(Array.isArray(list) ? list : []).map((e) => effectParts(e, e?.channelIds?.length === 1 ? nameOf(e.channelIds[0]) : undefined)).filter(Boolean),
  ];
}

// 역할 버프 조각 — 채팅 · 음성이 한 값
export function roleBuffParts({ buffXp, attendBuffXp } = {}) {
  const out = [];
  if (Number(buffXp) > 0) out.push({ label: "채팅 · 음성 XP", amount: `+${fmtXp(buffXp)}`, unit: "", cond: [], once: false });
  if (Number(attendBuffXp) > 0) out.push({ label: "출석 XP", amount: `+${fmtXp(attendBuffXp)}`, unit: "", cond: [], once: false });
  return out;
}

// 한 줄 설명 — 인벤토리 · 관리자 목록 · 미리보기에 같은 문장으로. 게임 아이템 효과처럼 짧게
//   예: "채팅 XP +50% · 주말 22~2시", "채팅 XP +50", "매일 음성 60분 +5,000 XP", "출석 7번마다 +20,000 XP", "레벨업마다 +1,000 XP"
//   새 효과: "채팅 10% 확률 +1,000 XP", "출석 10% 확률 XP +100%", "3명 이상 음성 XP +30%", "출석 빙옥 +5", "강화 비용 −10%",
//            "ARCTIC 캐시백 3%", "채팅 쿨타임 −15초", "음소거 패널티 −40%p", "연속 출석 보호막 1회", "카드 테두리 · 골드", "카드 배경 · 유령 펭귄의 밤", "프로필 배지", "프로필 테두리 · 마스터",
//            "음성 15분마다 100~3,000 XP"(구간 표 범위), "채팅 3% 도깨비불 · 잡으면 +500~1,500 XP · 주인 +300 XP"
//   📌 꾸미기(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지) 문장은 이름 · 분류와 같은 말 — 화면은 이 줄 대신 「적용 범위」(scopeLabelOf)를 보인다(effectLinesOf 가 뺀다)
//   📌 2026-10-18 종류별 효과 문구(아래 「종류별 효과 문구」) — 관리자가 그 종류의 틀을 바꿨으면 틀로 적는다(조건은 그대로 뒤에)
export function describeEffect(e, channelName) {
  const t = TRIGGER_OF[e?.on];
  if (!t) return "";
  const cond = condOf(e, channelName);
  const tail = cond.length ? ` · ${cond.join(" ")}` : "";
  const tpl = t.kind !== "cosmetic" ? FX_TPL.now[e.on] : "";
  if (tpl) return `${templateLine(tpl, e)}${tail}`;
  const p = pieceOf(e);
  const size = p.amount ? `${p.sep || " "}${p.amount}${p.unit === "XP" ? " XP" : p.unit}` : "";
  return `${p.label}${size}${p.tail || ""}${tail}`;
}

// ───────────────────────── 종류별 효과 문구 ─────────────────────────
// 📌 2026-10-18 운영자 "매크로마다 자동으로 나오게 되는데 그걸 설정할 수 있게" — 효과 종류(꾸미기 빼고)마다 자동 문구의 틀.
//    관리 › 상점 관리 › 설정 › 효과 문구(Setting "effectTemplates" = { [효과 on]: 틀 } — 초안 모드는 초안 → 「반영」). 바꾸는 것은 표시뿐(지급 규칙 · 봇 그대로)
//    차례: 아이템에서 직접 쓴 문구(Item.effectText) > 이 종류별 틀 > 기본(pieceOf — 틀이 없거나 기본 틀과 같으면 예전 문구 그대로)
//    칸: {크기} 효과 크기(+50 · +50% · −10% · −15초 · 1회 · 100~5,000 XP) · {분} · {번} · {확률} · {인원} · {잡기}(호박불 — 잡는 사람 몫). 종류마다 쓸 수 있는 칸만
//    조건(요일 · 시간대 · 채널)은 틀 뒤에 저절로 「 · 주말 22~2시」. 요일을 정한 효과는 틀 앞 「매일 」을 뺀다(예전 문구와 같은 규칙)
//    지금 틀은 모듈 값(FX_TPL — globalThis 에 한 벌, 화면 · 서버 공용). 서버는 lib/effectTemplatesServer(connectToDatabase 때 15초마다 새로 읽음),
//    관리 화면은 읽은 값을 setEffectTemplates 로 넣는다
export const EFFECT_TEMPLATES_KEY = "effectTemplates";
export const EFFECT_TEMPLATE_MAX = 60; // 틀 하나 글자 수(UTF-16)
const FX_TPL = globalThis.__igEffectTemplates || (globalThis.__igEffectTemplates = { now: Object.create(null) });
// 기본 틀 — 기본 문구(pieceOf)와 글자 그대로 같게 적는다(scripts/test-effect-templates.mjs 가 맞춰 본다)
export const DEFAULT_EFFECT_TEMPLATES = {
  chat: "채팅 XP {크기}",
  voice: "음성 XP {크기}",
  voiceDaily: "매일 음성 {분}분 {크기}",
  firstChat: "매일 첫 채팅 {크기}",
  attend: "출석 XP {크기}",
  attendEvery: "출석 {번}번마다 {크기}",
  levelUp: "레벨업마다 {크기}",
  chatJackpot: "채팅 {확률}% 확률 {크기}",
  voiceParty: "{인원}명 이상 음성 XP {크기}",
  voiceStay: "음성 {분}분마다 XP {크기} · 최대 {최대}%",
  voiceCandy: "음성 {분}분마다 {크기}",
  wispHunt: "채팅 {확률}% 도깨비불 · 잡으면 {잡기} · 주인 {크기}",
  welcomeReply: "새 멤버에게 첫 답장 {크기}",
  attendLucky: "출석 {확률}% 확률 XP {크기}",
  attendPoint: "출석 빙옥 {크기}",
  enhanceDiscount: "강화 비용 {크기}",
  shopCashback: "ARCTIC 캐시백 {크기}",
  questBonus: "퀘스트 XP {크기}",
  passBoost: "시즌 패스 진행 {크기}",
  cooldownCut: "채팅 쿨타임 {크기}",
  muteRelief: "음소거 패널티 {크기}",
  streakShield: "연속 출석 보호막 {크기}",
};
// 틀을 바꿀 수 있는 종류(TRIGGERS 차례 — 꾸미기는 적용 범위로 따로 보여 빠진다)
export const TEMPLATE_KINDS = TRIGGERS.filter((t) => t.kind !== "cosmetic" && DEFAULT_EFFECT_TEMPLATES[t.v]).map((t) => t.v);
// 칸 이름 → 뜻(관리 화면 안내)
export const TEMPLATE_VARS = { 크기: "효과 크기", 분: "분", 번: "횟수", 확률: "확률 %", 인원: "인원", 잡기: "잡는 사람 XP", 최대: "최대 %" };
const VARS_OF = { voiceDaily: ["분"], voiceCandy: ["분"], voiceStay: ["분", "최대"], attendEvery: ["번"], chatJackpot: ["확률"], attendLucky: ["확률"], voiceParty: ["인원"], wispHunt: ["확률", "잡기"] };
export const templateVarsOf = (on) => [...(VARS_OF[on] || []), "크기"];
// 관리 화면 미리 보기 값(종류마다 흔한 크기)
export const EFFECT_TEMPLATE_SAMPLES = {
  chat: { mode: "add", amount: 50 },
  voice: { mode: "percent", amount: 30 },
  voiceDaily: { mode: "add", amount: 5000, minMinutes: 60 },
  firstChat: { mode: "add", amount: 1000 },
  attend: { mode: "add", amount: 3000 },
  attendEvery: { mode: "add", amount: 20000, everyN: 7 },
  levelUp: { mode: "add", amount: 1000 },
  chatJackpot: { mode: "add", amount: 1000, chance: 10 },
  voiceParty: { mode: "percent", amount: 30, minMembers: 3 },
  voiceStay: { mode: "percent", amount: 1, minMinutes: 25, maxPct: 20 },
  voiceCandy: { mode: "add", amount: 1, minMinutes: 15 },
  wispHunt: { mode: "add", amount: 300, chance: 3 },
  welcomeReply: { mode: "add", amount: 500 },
  attendLucky: { mode: "percent", amount: 100, chance: 10 },
  attendPoint: { mode: "add", amount: 5 },
  enhanceDiscount: { mode: "percent", amount: 10 },
  shopCashback: { mode: "percent", amount: 3 },
  questBonus: { mode: "percent", amount: 10 },
  passBoost: { mode: "percent", amount: 10 },
  cooldownCut: { mode: "add", amount: 15, seconds: 15 },
  muteRelief: { mode: "percent", amount: 40 },
  streakShield: { mode: "add", amount: 1 },
};
const TPL_VAR_RE = /\{([^{}]*)\}/g;
// 틀 → 한 줄(조건 앞까지). 모르는 칸은 글자 그대로 둔다(저장 때 걸러져 오지 않는다)
function templateLine(tpl, e) {
  const p = pieceOf(e);
  const vals = {
    크기: p.amount ? `${p.amount}${p.unit === "XP" ? " XP" : p.unit}` : "",
    분: fmt(e.minMinutes), 번: fmt(e.everyN), 확률: fmt(e.chance), 인원: fmt(e.minMembers), 최대: fmt(e.maxPct),
    잡기: `+${fmt(WISP_CATCH_XP[0])}~${fmt(WISP_CATCH_XP[1])} XP`,
  };
  let s = String(tpl).replace(TPL_VAR_RE, (m, k) => (Object.hasOwn(vals, k) ? vals[k] : m));
  if (Array.isArray(e.days) && e.days.length) s = s.replace(/^매일\s+/, "");
  return s.replace(/\s+/g, " ").trim();
}
// 📌 틀 하나 정리 — { value, error }. value "" = 기본 틀(비었거나 기본과 같음). 제어 문자 · 겹친 공백을 걷고 앞뒤 trim.
//    60자를 넘거나 · 그 종류에서 못 쓰는 칸({분} 없는 종류의 {분} 등) · 닫히지 않은 괄호는 error(관리 화면 · 서버 같은 규칙).
//    길이는 자르지 않고 막는다 — 잘라 저장하면 뒤의 {크기}가 말없이 빠졌다
export function normalizeEffectTemplate(on, v) {
  if (!TEMPLATE_KINDS.includes(on)) return { value: "", error: "틀을 바꿀 수 없는 효과입니다." };
  const s = String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s === DEFAULT_EFFECT_TEMPLATES[on]) return { value: "", error: "" };
  if (s.length > EFFECT_TEMPLATE_MAX) return { value: s, error: `${EFFECT_TEMPLATE_MAX}자까지 쓸 수 있습니다.` };
  const ok = new Set(templateVarsOf(on));
  for (const [, k] of s.matchAll(TPL_VAR_RE)) {
    if (!ok.has(k)) return { value: s, error: `「{${k}}」은(는) 이 효과에서 쓸 수 없습니다.` };
  }
  if (/[{}]/.test(s.replace(TPL_VAR_RE, ""))) return { value: s, error: "중괄호 { } 는 칸 이름을 감쌀 때만 씁니다." };
  return { value: s, error: "" };
}
// 틀 묶음 정리 — { value: { [on]: 틀 }(기본과 다른 것만), errors: [{ on, message }] }. 모르는 종류는 버린다
export function normalizeEffectTemplates(map) {
  const value = {};
  const errors = [];
  if (!map || typeof map !== "object" || Array.isArray(map)) return { value, errors };
  for (const on of TEMPLATE_KINDS) {
    if (!Object.hasOwn(map, on)) continue;
    const r = normalizeEffectTemplate(on, map[on]);
    if (r.error) errors.push({ on, message: r.error });
    else if (r.value) value[on] = r.value;
  }
  return { value, errors };
}
// 지금 틀 바꾸기(잘못된 줄은 버리고 나머지만) · 읽기(복사본)
export function setEffectTemplates(map) {
  const { value } = normalizeEffectTemplates(map);
  const now = Object.create(null);
  for (const [k, v] of Object.entries(value)) now[k] = v;
  FX_TPL.now = now;
}
export const effectTemplatesNow = () => ({ ...FX_TPL.now });
// 그 종류가 지금 바뀐 틀을 쓰는가(꾸미기 · 모르는 종류는 false)
export const hasEffectTemplate = (on) => !!FX_TPL.now[on] && TRIGGER_OF[on]?.kind !== "cosmetic";
// 관리 화면 미리 보기 — 그 틀(비면 기본)로 미리 보기 값을 적은 한 줄. 지금 틀(FX_TPL)과 무관하게 넘긴 틀로
export function previewEffectTemplate(on, tpl) {
  if (!TEMPLATE_KINDS.includes(on)) return "";
  const e = { on, ...(EFFECT_TEMPLATE_SAMPLES[on] || { mode: "add", amount: 1 }) };
  return templateLine(String(tpl ?? "").trim() || DEFAULT_EFFECT_TEMPLATES[on], e);
}

// ── 상시형 합산 (사이트 lib/itemPerks.js · 봇 perksOf 와 같은 규칙) ──
//    items: 보유 아이템(lib/ownedItems.js 결과 — 같은 아이템은 한 번). 순서는 관리자 순서(sortOrder · createdAt)로 다시 맞춘다
//    반환: { enhanceDiscount, shopCashback, questBonus, passBoost, cooldownCut, muteRelief,  — 합(상한 적용 — 캐시백은 관리자 설정 상한을 결제 API 가 한 번 더 건다)
//            badges: [] (자동으로 다는 배지 없음 — 유저가 단 배지는 pickBadges 로 따로 적용),
//            allBadges: 가진 배지 전부(관리자 순서 · 아이템마다 한 번 — [{ itemId, name, icon, imageUrl, color, type, bought }]),
//            cardSkin: "" (자동으로 입히는 스킨 없음 — 유저가 고른 스킨은 pickCardSkin 으로 따로 적용),
//            cardSkins: [스킨 키] (가진 스킨 전부, 관리자 순서 · 중복 없음),
//            cardScenes: [카드 배경 키] (가진 배경 전부, 관리자 순서 · 중복 없음 — 고른 것은 pickCardScene),
//            avatarFrames: [테두리 키] (가진 테두리 전부, 관리자 순서 · 중복 없음 — 고른 것은 pickAvatarFrame) }
export const PERK_KEYS = TRIGGERS.filter((t) => t.kind === "perk").map((t) => t.v);
const tsOf = (d) => (d ? new Date(d).getTime() || 0 : 0);
export function perksOfItems(items) {
  const sum = Object.fromEntries(PERK_KEYS.map((k) => [k, 0]));
  const allBadges = [];
  const cardSkins = [];
  const cardScenes = [];
  const avatarFrames = [];
  const sorted = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.type !== "physical")
    .map((it, n) => ({ it, n }))
    .sort((a, b) => (Number(a.it.sortOrder) || 0) - (Number(b.it.sortOrder) || 0) || tsOf(a.it.createdAt) - tsOf(b.it.createdAt) || a.n - b.n)
    .map((x) => x.it);
  for (const it of sorted) {
    let badged = false;
    for (const e of normalizeEffects(it.effects)) {
      const t = TRIGGER_OF[e.on];
      if (t.kind === "perk") sum[e.on] += e.on === "cooldownCut" ? e.seconds || e.amount : e.amount;
      else if (e.on === "cardSkin") for (const sk of skinsOf(e.skin)) { if (!cardSkins.includes(sk)) cardSkins.push(sk); }
      else if (e.on === "cardScene") for (const sc of scenesOf(e.scene)) { if (!cardScenes.includes(sc)) cardScenes.push(sc); }
      else if (e.on === "avatarFrame") for (const fk of framesOf(e.frame)) { if (!avatarFrames.includes(fk)) avatarFrames.push(fk); }
      else if (e.on === "profileBadge" && !badged) {
        badged = true; // 한 아이템에 배지 효과가 둘이어도 한 번
        allBadges.push({
          itemId: String(it._id || ""), name: it.name || "", icon: it.icon || "",
          imageUrl: it.imageUrl || "", color: it.color || "", type: it.type || "item",
          // 상점에서 산 것(lib/ownedItems _bought) — 표시용 표식(자동으로 달지는 않는다 — pickBadges)
          bought: !!it._bought,
        });
      }
    }
  }
  const out = {};
  for (const k of PERK_KEYS) out[k] = Math.min(TRIGGER_OF[k].cap || Infinity, Math.max(0, sum[k]));
  return { ...out, badges: pickBadges(allBadges), allBadges, cardSkin: pickCardSkin(cardSkins, ""), cardSkins, cardScenes, avatarFrames };
}

// 📌 할인 · 캐시백 계산 — 서버(강화 · 결제)와 화면(비용 표시)이 같은 식을 쓴다
//    강화 비용 할인: 비용 × (1 − pct/100), 올림. 0% 면 그대로
export const discountedCost = (cost, pct) => {
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  const p = Math.min(100, Math.max(0, Math.floor(Number(pct) || 0)));
  return p > 0 ? Math.ceil((c * (100 - p)) / 100) : c;
};
//    캐시백: 캐시백 바탕(cashbackBaseOf — 실제로 낸 값) × pct/100, 버림 (구매 건마다 따로 — 환불 때 그 건 몫만 회수한다)
export const cashbackOf = (paidXp, pct) => {
  const x = Math.max(0, Math.floor(Number(paidXp) || 0));
  const p = Math.min(100, Math.max(0, Math.floor(Number(pct) || 0)));
  return Math.floor((x * p) / 100);
};
//    📌 캐시백 규칙 — 관리자 설정(BotSetting · 상점 관리 › 설정). 2026-10-04 "관리자가 정하게 해"
//      cap     : 캐시백 효과 합의 상한 %(0~100). 값이 없으면 30 — 예전에 효과 칸에 박혀 있던 값 그대로
//      onPoint : 빙옥으로 낸 몫에도 캐시백(빙옥을 XP 로 쳐서 — 1 빙옥 = 10,000 XP). 값이 없으면 꺼짐 — XP 로 낸 몫만(예전 그대로)
//    결제 API(app/api/shop/purchase · checkout)가 읽은 설정 문서(lean — 기본값이 안 붙는다)를 그대로 넘긴다
export const CASHBACK_CAP_DEFAULT = 30;
export const cashbackRuleOf = (s) => {
  const n = Math.floor(Number(s?.shopCashbackCap));
  const cap = s?.shopCashbackCap == null || s.shopCashbackCap === "" || !Number.isFinite(n) ? CASHBACK_CAP_DEFAULT : Math.min(100, Math.max(0, n));
  return { cap, onPoint: s?.cashbackOnPoint === true };
};
//    캐시백 바탕(XP) — 이 건에서 실제로 낸 XP, onPoint 면 낸 빙옥을 XP 로 쳐서 더한다
export const cashbackBaseOf = (paidXp, paidPoint, onPoint) =>
  Math.max(0, Math.floor(Number(paidXp) || 0)) + (onPoint ? Math.max(0, Math.floor(Number(paidPoint) || 0)) * POINT_RATE : 0);
//    보너스(퀘스트 보상 XP — 빙옥에는 안 붙는다): 기본 + 기본 × pct/100 (버림)
export const withBonus = (base, pct) => {
  const b = Math.max(0, Math.floor(Number(base) || 0));
  const p = Math.max(0, Math.floor(Number(pct) || 0));
  return b + Math.floor((b * p) / 100);
};

// 아이템 기본 효과 세 칸의 문장 — 채팅 · 음성 · 출석을 따로 정한다(같은 이름의 추가 효과 「채팅 XP +N」 문장과 같다)
const fmtXp = (n) => Number(n || 0).toLocaleString("ko-KR");
//    📌 2026-10-18 기본 효과도 그 종류(chat · voice · attend — 더하기)의 효과 문구 틀을 따른다(describeEffect — 기본 틀이면 예전 글자 그대로)
const basicEffectsOf = ({ chatBuffXp, voiceBuffXp, attendBuffXp } = {}) =>
  [["chat", chatBuffXp], ["voice", voiceBuffXp], ["attend", attendBuffXp]]
    .filter(([, v]) => Number(v) > 0)
    .map(([on, v]) => ({ on, mode: "add", amount: Number(v) }));
export function describeItemBasic(basic = {}) {
  return basicEffectsOf(basic).map((e) => describeEffect(e));
}

// 역할 버프(RoleConfig — 관리자 › 레벨 설정 역할 탭)의 문장 — 채팅 · 음성이 한 값이다
export function describeRoleBuff({ buffXp, attendBuffXp } = {}) {
  const out = [];
  if (Number(buffXp) > 0) out.push(`채팅 · 음성 XP +${fmtXp(buffXp)}`);
  if (Number(attendBuffXp) > 0) out.push(`출석 XP +${fmtXp(attendBuffXp)}`);
  return out;
}

// 저장 모양(맨 위 chatBuffXp … · effects[]) · 관리자 API 모양(effects: { chatBuffXp, …, list }) → { basic, list }
const effectSrcOf = (item) => {
  const api = item?.effects && typeof item.effects === "object" && !Array.isArray(item.effects) ? item.effects : null;
  const src = api || item || {};
  const list = api ? api.list : item?.effects;
  return { basic: { chatBuffXp: src.chatBuffXp, voiceBuffXp: src.voiceBuffXp, attendBuffXp: src.attendBuffXp }, list: Array.isArray(list) ? list : [] };
};
// 자동 문장 — withCosmetic: 꾸미기 문장(「카드 테두리 · 골드」 …)도 넣을지
function autoLinesOf(item, channelNameOf, withCosmetic) {
  if (!item || item.type === "physical") return [];
  const { basic, list } = effectSrcOf(item);
  const nameOf = (id) => (typeof channelNameOf === "function" ? channelNameOf(String(id)) : undefined);
  return [
    ...describeItemBasic(basic),
    ...list
      .filter((e) => withCosmetic || TRIGGER_OF[e?.on]?.kind !== "cosmetic")
      .map((e) => describeEffect(e, e?.channelIds?.length === 1 ? nameOf(e.channelIds[0]) : undefined))
      .filter(Boolean),
  ];
}

// 📌 아이템 하나의 효과 문장들(자동 — 꾸미기 문장까지) — 기본 효과(describeItemBasic) + 조건 효과(describeEffect). 기프트카드(physical)는 [].
//    item 은 저장 모양(맨 위 chatBuffXp · voiceBuffXp · attendBuffXp · effects[])과
//    관리자 API 모양(effects: { chatBuffXp, voiceBuffXp, attendBuffXp, list }) 둘 다 받는다.
//    channelNameOf(id) → 채널 이름 (선택) — 채널 하나만 지정한 효과를 "#이름" 으로 적을 때만 부른다
//    📌 화면에 보일 줄은 effectLinesOf(직접 쓴 문구 > 자동 · 꾸미기 문장 뺌 — 2026-10-18). 이 함수는 예전 그대로 자동 문장 전부(추천 아이템 목록 등)
export function itemEffectLines(item, channelNameOf) {
  return autoLinesOf(item, channelNameOf, true);
}

// ───────────────────────── 효과 문구 직접 쓰기 · 꾸미기 적용 범위 ─────────────────────────
// 📌 2026-10-18 운영자 결정(A · B)
//    A. 효과 문구 — 화면 문구는 자동(위 describeEffect)으로 적고, 관리자가 아이템마다 고쳐 쓸 수 있다(Item.effectText — 보일 줄 배열, [] = 자동).
//       바꾸는 것은 표시뿐 — 지급 규칙(effects · 봇)은 그대로다. 역할 버프 줄(RoleConfig)은 역할 설정 몫이라 이 문구와 따로 뒤에 붙는다
//    B. 적용 범위 — 꾸미기(카드 테두리 · 카드 배경 · 프로필 테두리 · 프로필 배지)는 「효과」가 아니라 「적용 범위」(운영자 "효과라는 건 약간 이상하잖아").
//       자동 값은 꾸미기 종류마다(AUTO_SCOPE), 관리자가 아이템마다 고를 수 있다(Item.scope — 키 배열, [] = 자동)
//    화면 · 서버 공용(React · DB 없음). 인벤토리(lib/inventory) · 상품 상세 · 세트 구성(lib/bundleServer) · 시즌 패스 보상 칸(lib/seasonPass) · 관리자 API 가 같은 함수로 정한다
export const EFFECT_TEXT_MAX = 8; // 줄 수
export const EFFECT_TEXT_LINE_MAX = 60; // 줄 하나 글자 수(UTF-16 — 이모지를 반으로 자르지 않는다)
// 저장 전 정리 — 배열 또는 여러 줄 글자 → 줄 배열. 제어 문자 · 겹친 공백을 걷고 앞뒤 trim, 빈 줄은 버린다. 화면(관리자 폼)과 서버(lib/items.js normalizeItemPayload)가 같은 규칙
export function normalizeEffectText(v) {
  const raw = (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).flatMap((x) => String(x ?? "").split(/\r\n?|\n/));
  const out = [];
  for (const x of raw) {
    let s = x.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (s.length > EFFECT_TEXT_LINE_MAX) {
      s = s.slice(0, EFFECT_TEXT_LINE_MAX);
      if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
      s = s.trimEnd();
    }
    out.push(s);
    if (out.length >= EFFECT_TEXT_MAX) break;
  }
  return out;
}
// 직접 쓴 문구가 있는가(기프트카드는 늘 없음)
export const hasEffectText = (item) => !!item && item.type !== "physical" && normalizeEffectText(item.effectText).length > 0;

// 📌 자동 효과 줄 — 꾸미기 문장을 뺀 자동 문장(관리자 「직접 쓰기」가 이 줄로 채워 연다)
export const autoEffectLinesOf = (item, channelNameOf) => autoLinesOf(item, channelNameOf, false);
// 📌 보일 효과 줄 — 직접 쓴 문구(effectText) > 자동(autoEffectLinesOf). 기프트카드는 []. 꾸미기만 있는 아이템은 [](「적용 범위」가 대신 — scopeLabelOf)
export function effectLinesOf(item, channelNameOf) {
  if (!item || item.type === "physical") return [];
  return hasEffectText(item) ? normalizeEffectText(item.effectText) : autoEffectLinesOf(item, channelNameOf);
}

// 📌 직접 쓴 줄 → 상세 타일 조각 { label, amount, unit, cond, once, line, custom } — 「 · 」 앞 토막 끝의 크기(+500 XP · 10% · −15초 · 2배 …)를 큰 글자로,
//    뒤 토막은 cond(작은 글자). 크기를 못 찾으면 줄 전체가 label · amount "" (화면은 그때 label 을 크게 그린다)
const LINE_SIZE_RE = /^(.*\S)\s+([+\-−]?\d[\d,.]*(?:~\d[\d,.]*)?)\s*(XP|%p|%|초|분|회|번|배|빙옥)?$/u;
export function effectTileOfLine(line) {
  const s = String(line ?? "").trim();
  const [head, ...rest] = s.split(" · ");
  const m = LINE_SIZE_RE.exec(head);
  return m
    ? { label: m[1], amount: m[2], unit: m[3] || "", cond: rest, once: false, line: s, custom: true }
    : { label: s, amount: "", unit: "", cond: [], once: false, line: s, custom: true };
}
// 📌 보일 효과 타일(상품 상세 · 세트 구성) — 직접 쓴 문구면 줄마다 effectTileOfLine, 아니면 자동 조각(itemEffectPartsOf)에서 꾸미기 조각을 뺀 것.
//    자동 조각에도 line(같은 한 줄 문장)을 붙인다 — 화면이 타일 · 줄 어느 쪽으로 그려도 같은 말
//    📌 2026-10-18 종류별 효과 문구 틀을 바꾼 종류(hasEffectTemplate)는 조각에서 바로 만든다(다 적은 줄을 「 · 」로 다시 쪼개지 않는다 — 틀 안의 「 · 」가 조건으로 잘렸다):
//       label = 틀에서 {크기}를 뺀 글자 · amount · unit = 그 크기(틀에 {크기}가 없으면 크기 없이 글자만) · cond = 조건 그대로
export function effectTilesOf(item, channelNameOf) {
  if (!item || item.type === "physical") return [];
  if (hasEffectText(item)) return normalizeEffectText(item.effectText).map(effectTileOfLine);
  const { basic, list } = effectSrcOf(item);
  const nameOf = (id) => (typeof channelNameOf === "function" ? channelNameOf(String(id)) : undefined);
  const effs = [...basicEffectsOf(basic), ...list.filter((e) => TRIGGER_OF[e?.on] && TRIGGER_OF[e.on].kind !== "cosmetic")];
  return effs.map((e) => {
    const ch = e?.channelIds?.length === 1 ? nameOf(e.channelIds[0]) : undefined;
    const line = describeEffect(e, ch);
    if (!hasEffectTemplate(e.on)) return { ...effectParts(e, ch), line };
    const tpl = FX_TPL.now[e.on];
    const sized = tpl.includes("{크기}");
    const p = pieceOf(e);
    return {
      // {크기}를 빼고 끝에 남은 구분 기호(「 · 」 · 「:」 …)는 걷는다 — 크기는 큰 글자로 따로 그린다
      label: templateLine(sized ? tpl.replaceAll("{크기}", "") : tpl, e).replace(/\s*[·:\-–—]+$/u, ""),
      amount: sized ? p.amount : "", unit: sized ? p.unit : "",
      cond: condOf(e, ch), once: false, line, custom: false,
    };
  });
}
// 역할 버프 타일 — roleBuffParts + line(describeRoleBuff 와 같은 말)
export const roleBuffTiles = (cfg) => {
  const lines = describeRoleBuff(cfg || {});
  return roleBuffParts(cfg || {}).map((p, i) => ({ ...p, line: lines[i] || "" }));
};

// ── 적용 범위 ──
//    키 · 이름(화면 차례). 관리자 체크 칸 · 유저 화면 「대시보드, 명령어 카드, 알림 카드」가 이 차례로 적는다
export const COSMETIC_SCOPES = [
  { v: "dashboard", l: "대시보드" },
  { v: "ranking", l: "랭킹" },
  { v: "command", l: "명령어 카드" },
  { v: "notice", l: "알림 카드" },
];
export const SCOPE_OF = Object.fromEntries(COSMETIC_SCOPES.map((s) => [s.v, s]));
export const COSMETIC_SCOPE_KEYS = COSMETIC_SCOPES.map((s) => s.v);
//    꾸미기 종류(효과 on)마다 자동 적용 범위 — keys(COSMETIC_SCOPES 키) · note(관리자 참고 — 어느 명령어 · 알림인지)
//      카드 테두리 · 카드 배경: 대시보드 · 명령어 카드(/레벨 · /출석) · 알림 카드(레벨업 · 역할 지급)
//      프로필 테두리: 대시보드 · 랭킹 · 명령어 카드(/레벨 · /랭킹) · 알림 카드(레벨업)
//      프로필 배지: 대시보드
const CARD_SCOPE = { keys: ["dashboard", "command", "notice"], note: { command: "/레벨 · /출석", notice: "레벨업 · 역할 지급" } };
export const AUTO_SCOPE = {
  cardSkin: CARD_SCOPE,
  cardScene: CARD_SCOPE,
  avatarFrame: { keys: ["dashboard", "ranking", "command", "notice"], note: { command: "/레벨 · /랭킹", notice: "레벨업" } },
  profileBadge: { keys: ["dashboard"], note: {} },
};
// 저장 전 정리 — 아는 키만 · 중복 없이 · COSMETIC_SCOPES 차례
export const normalizeScope = (v) => {
  const set = new Set((Array.isArray(v) ? v : []).map((x) => String(x ?? "")));
  return COSMETIC_SCOPE_KEYS.filter((k) => set.has(k));
};
// 아이템에 든 꾸미기 종류(효과 on — TRIGGERS 차례 · 중복 없이). 값이 빈 칸(고르지 않은 스킨 등)은 정리(normalizeEffects)에서 빠진다. 기프트카드는 []
export function cosmeticKindsOf(item) {
  if (!item || item.type === "physical") return [];
  const on = new Set(normalizeEffects(effectSrcOf(item).list).filter((e) => TRIGGER_OF[e.on].kind === "cosmetic").map((e) => e.on));
  return TRIGGERS.filter((t) => t.kind === "cosmetic" && on.has(t.v)).map((t) => t.v);
}
// 📌 꾸미기 아이템인가 — 꾸미기 효과(카드 배경 · 카드 테두리 · 프로필 테두리 · 프로필 배지)가 하나라도 있으면(유형 이름과 무관)
export const isCosmeticItem = (item) => cosmeticKindsOf(item).length > 0;
// 종류들 → 자동 적용 범위 키(합 · 화면 차례)
const scopeKeysOfKinds = (kinds) => normalizeScope(kinds.flatMap((k) => AUTO_SCOPE[k]?.keys || []));
// 📌 자동 적용 범위(키 배열) — 꾸미기가 아니면 []
export const autoScopeOf = (item) => scopeKeysOfKinds(cosmeticKindsOf(item));
// 📌 보일 적용 범위(키 배열) — 관리자가 고른 것(Item.scope) > 자동. 꾸미기가 아니면 []
export function scopeOf(item) {
  if (!isCosmeticItem(item)) return [];
  const own = normalizeScope(item?.scope);
  return own.length ? own : autoScopeOf(item);
}
// 키 배열 → 「대시보드 / 명령어 카드 / 알림 카드」(2026-10-18 운영자 — 쉼표 말고 「 / 」)
export const scopeLabelOfKeys = (keys) => normalizeScope(keys).map((k) => SCOPE_OF[k].l).join(" / ");
// 📌 보일 적용 범위 글자 — 꾸미기가 아니면 ""
export const scopeLabelOf = (item) => scopeLabelOfKeys(scopeOf(item));
// 꾸미기 종류 하나의 자동 적용 범위 글자(아이템 문서 없이 — 시즌 보상 · 체험 칸). 모르는 종류는 ""
export const scopeLabelOfKind = (kind) => scopeLabelOfKeys(AUTO_SCOPE[kind]?.keys || []);
// 관리자 참고 — 이 아이템의 꾸미기 종류에서 키마다 어느 명령어 · 알림인지(겹치면 합친다). { command: "/레벨 · /출석 · /랭킹", … }
/** @returns {Record<string, string>} */
export function scopeNotesOf(item) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of cosmeticKindsOf(item)) {
    for (const [key, note] of Object.entries(AUTO_SCOPE[k]?.note || {})) {
      const parts = new Set([...(out[key] ? out[key].split(" · ") : []), ...note.split(" · ")]);
      out[key] = [...parts].join(" · ");
    }
  }
  return out;
}

// 📌 보일 표기 한 벌 — 행(인벤토리 칸 · 상품 상세 · 세트 구성 · 패스 보상 · 관리자 목록)에 그대로 덧붙인다
//    { effectLines: 보일 효과 줄(effectLinesOf), effectCustom: 직접 쓴 문구인가, isCosmetic, scope: 보일 적용 범위 키, scopeLabel: 그 글자("" = 꾸미기 아님) }
//    tiles: true 면 effectTiles(effectTilesOf — 상세 타일)도
export function effectDisplayOf(item, channelNameOf, { tiles = false } = {}) {
  const scope = scopeOf(item);
  return {
    effectLines: effectLinesOf(item, channelNameOf),
    effectCustom: hasEffectText(item),
    isCosmetic: isCosmeticItem(item),
    scope,
    scopeLabel: scopeLabelOfKeys(scope),
    ...(tiles ? { effectTiles: effectTilesOf(item, channelNameOf) } : {}),
  };
}

// ── 조건 판정(사이트 미리보기 · 봇과 같은 규칙) ──
//    kst: { day: 0~6, hour: 0~23 }
export function effectTimeOk(e, kst) {
  if (Array.isArray(e.days) && e.days.length && !e.days.includes(kst.day)) return false;
  if (e.hourFrom != null && e.hourTo != null) {
    const h = kst.hour;
    const inRange = e.hourFrom < e.hourTo ? h >= e.hourFrom && h < e.hourTo : h >= e.hourFrom || h < e.hourTo;
    if (!inRange) return false;
  }
  return true;
}
