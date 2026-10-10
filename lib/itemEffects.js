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
//      { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, chance?, minMembers?, seconds?, skin?, frame?,
//        days?: number[0-6], hourFrom?, hourTo?, channelIds?: string[] }
//      · days     : KST 요일(0=일 … 6=토). 비면 매일 — 발동형(kind "trigger")만
//      · hourFrom/hourTo : KST 시각(0~23). from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2). 둘 다 비면 하루 종일 — 발동형만
//      · channelIds : 채널이 있는 상황(channels)에서만 — 그 채널(또는 그 카테고리 안)에서만. 비면 모든 채널
//                     channels: "voice" 면 음성 채널, true 면 텍스트 채널에서 고른다(화면)
//      · percent  : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%
//      · chance   : 확률 %(1~100) — chatJackpot · attendLucky
//      · minMembers : 음성 채널 인원(봇 제외) 하한(2~99) — voiceParty
//      · seconds  : 초(1~3600) — cooldownCut. 📌 amount 에도 같은 값을 넣어 둔다(어느 쪽을 읽어도 같게)
//      · skin     : 카드 스킨 키(SKINS) — cardSkin
//      · frame    : 아바타 테두리 키(FRAMES = 등급 키) — avatarFrame
//
//    📌 종류(kind) — 효과가 언제 붙는지
//      trigger    : 발동형 — 봇이 그 상황에서 지급할 때 더한다. 요일 · 시간대 조건을 붙일 수 있다
//      perk       : 상시형 — 가지고 있는 동안 늘. 같은 효과는 아이템끼리 합한 뒤 상한(cap)으로 자른다(perksOfItems). 조건 없음
//      consumable : 소모형 — 한 번 쓰면 그 구매 건이 소모된다(Purchase.consumedAt). amount 는 1 고정(의미 없음)
//      cosmetic   : 꾸미기형 — 카드 스킨 · 프로필 배지 · 아바타 테두리. amount 는 1 고정(의미 없음)
//    unit: 크기 단위(문구용) — 없으면 mode 로 정한다(add "XP" · percent "%")

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
  { v: "levelUp", l: "레벨이 오를 때마다", kind: "trigger", modes: ["add"] },
  { v: "chatJackpot", l: "채팅 1회당 확률 보너스", kind: "trigger", modes: ["add"], needs: "chance", channels: true },
  { v: "voiceParty", l: "음성 N명 이상일 때 1회당", kind: "trigger", modes: ["add", "percent"], needs: "minMembers", channels: "voice" },
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
  { v: "cardSkin", l: "카드 스킨", kind: "cosmetic", modes: ["add"], needs: "skin", noAmount: true },
  { v: "profileBadge", l: "프로필 배지", kind: "cosmetic", modes: ["add"], noAmount: true },
  { v: "avatarFrame", l: "아바타 테두리", kind: "cosmetic", modes: ["add"], needs: "frame", noAmount: true },
];
export const TRIGGER_OF = Object.fromEntries(TRIGGERS.map((t) => [t.v, t]));

// 📌 소모형 효과가 있는 아이템인가 — 저장 모양(effects[])과 관리자 API 모양(effects: { list }) 둘 다 받는다.
//    소모품에는 역할을 연결하지 않는다(app/api/admin/items) · 인벤토리 ×N 묶음(lib/unitSale.js unitThingSet)이 쓴다
export const hasConsumable = (item) => {
  const ef = item?.effects;
  const list = Array.isArray(ef) ? ef : Array.isArray(ef?.list) ? ef.list : [];
  return list.some((e) => TRIGGER_OF[e?.on]?.kind === "consumable");
};

// 📌 카드 스킨 — 이미지 카드(레벨업 · 프로필 · 출석)를 그리는 봇(bot/src/botCards.js)과 같은 키를 쓴다
export const SKINS = [
  { v: "gold", l: "골드" },
  { v: "aurora", l: "오로라" },
  { v: "ice", l: "아이스" },
  { v: "crimson", l: "크림슨" },
  // 시즌 2 「A New World」 — 새로운 세계(패스 보상) · 항해도 · 비공정(시즌 상점). 그림은 lib/cardSkins
  { v: "newworld", l: "새로운 세계" },
  { v: "chart", l: "항해도" },
  { v: "airship", l: "비공정" },
];
export const SKIN_OF = Object.fromEntries(SKINS.map((s) => [s.v, s]));
// 📌 유저가 고른 스킨(UserXp.cardSkinPick) — "" 는 안 고름, SKIN_NONE 은 스킨 끔, 그 밖은 스킨 키. 봇 bot/src/itemEffects.js pickCardSkin 과 같은 규칙
//    📌 2026-10-04 "굳이임 이것도" — 자동 착용 없음: 직접 고른 스킨만 입힌다. 안 골랐거나 끔이면 기본 카드("").
//       고른 스킨을 더 이상 갖고 있지 않으면(만료 · 환불) 기본 카드
export const SKIN_NONE = "none";
export function pickCardSkin(skins, pick) {
  const list = Array.isArray(skins) ? skins : [];
  if (!pick || pick === SKIN_NONE) return "";
  return list.includes(pick) ? pick : "";
}

// 📌 아바타 테두리 — 시즌 종료 티어 보상(브론즈 ~ 이글루). 키는 등급 키(lib/voiceTiers.js), 그림은 public/avatar-borders/<키>.svg
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
];
export const FRAME_OF = Object.fromEntries(FRAMES.map((f) => [f.v, f]));
export const pickAvatarFrame = (frames, pick) => pickCardSkin(frames, pick);

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
export const FIELD_RANGE = { chance: [1, 100], minMembers: [2, 99], seconds: [1, 3600] };

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

// 효과 한 칸의 크기 최대 — 상시형은 상한, 나머지는 방식별
export const amountMaxOf = (t, mode) => (t?.cap ? t.cap : mode === "percent" ? LIMIT.percent : LIMIT.add);

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
      const m = int(raw?.minMinutes, 1, LIMIT.minutes);
      if (!m) continue;
      e.minMinutes = m;
    }
    if (t.needs === "everyN") {
      const n = int(raw?.everyN, 2, LIMIT.everyN);
      if (!n) continue;
      e.everyN = n;
    }
    if (t.needs === "chance") {
      const c = need(raw?.chance, ...FIELD_RANGE.chance);
      if (!c) continue;
      e.chance = c;
    }
    if (t.needs === "minMembers") {
      const m = need(raw?.minMembers, ...FIELD_RANGE.minMembers);
      if (!m) continue;
      e.minMembers = m;
    }
    if (t.needs === "seconds") e.seconds = seconds;
    if (t.needs === "skin") {
      const s = String(raw?.skin || "");
      if (!SKIN_OF[s]) continue;
      if (out.some((x) => x.skin)) continue; // 카드 스킨은 아이템 하나에 하나 — 인벤토리 착용 버튼이 아이템마다 하나라서(봇 cleanEffects 와 같다)
      e.skin = s;
    }
    if (t.needs === "frame") {
      const fr = String(raw?.frame || "");
      if (!FRAME_OF[fr]) continue;
      if (out.some((x) => x.frame)) continue; // 테두리도 아이템 하나에 하나(착용 버튼이 아이템마다 하나)
      e.frame = fr;
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
function pieceOf(e) {
  const t = TRIGGER_OF[e.on];
  const unit = t.unit || (e.mode === "percent" ? "%" : "XP");
  const plus = { amount: `+${fmt(e.amount)}`, unit };
  // 요일을 정했으면 "매일"을 빼고 뒤의 요일 조건이 대신한다 — "매일 첫 채팅 · 월" 처럼 서로 어긋나지 않게
  const daily = Array.isArray(e.days) && e.days.length ? "" : "매일 ";
  switch (e.on) {
    case "voiceDaily": return { label: `${daily}음성 ${fmt(e.minMinutes)}분`, ...plus };
    case "firstChat": return { label: `${daily}첫 채팅`, ...plus };
    case "attendEvery": return { label: `출석 ${fmt(e.everyN)}회마다`, ...plus };
    case "levelUp": return { label: "레벨업", ...plus };
    case "chatJackpot": return { label: `채팅 잭팟 ${fmt(e.chance)}%`, ...plus };
    case "voiceParty": return { label: `음성 ${fmt(e.minMembers)}명↑`, ...plus };
    case "welcomeReply": return { label: "새 멤버 첫 답장", ...plus };
    case "attendLucky": return { label: `럭키 출석 ${fmt(e.chance)}%`, sep: " · ", ...plus };
    case "attendPoint": return { label: "출석 빙옥", amount: `+${fmt(e.amount)}`, unit: "" };
    case "enhanceDiscount": return { label: "강화 비용", amount: `${MINUS}${fmt(e.amount)}`, unit: "%" };
    case "shopCashback": return { label: "캐시백", amount: fmt(e.amount), unit: "%" };
    case "questBonus": return { label: "퀘스트 XP", ...plus };
    case "passBoost": return { label: "패스 진행", ...plus };
    case "cooldownCut": return { label: "채팅 쿨타임", amount: `${MINUS}${fmt(e.seconds || e.amount)}`, unit: "초" };
    case "muteRelief": return { label: "음소거 감소", amount: `${MINUS}${fmt(e.amount)}`, unit: "%p" };
    case "streakShield": return { label: "연속 출석 보호막", amount: "", unit: "", tile: { label: "연속 출석", amount: "보호막" } };
    case "cardSkin": {
      const s = SKIN_OF[e.skin]?.l || "기본";
      return { label: "카드 스킨", sep: " · ", amount: s, unit: "", tile: { label: "카드 스킨", amount: s } };
    }
    case "profileBadge": return { label: "프로필 배지", amount: "", unit: "", tile: { label: "프로필", amount: "배지" } };
    case "avatarFrame": {
      const fr = FRAME_OF[e.frame]?.l || "기본";
      return { label: "아바타 테두리", sep: " · ", amount: fr, unit: "", tile: { label: "아바타 테두리", amount: fr } };
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
  if (p.tile) return { label: p.tile.label, amount: p.tile.amount, unit: "", cond: [], once: false };
  return { label: p.label, amount: p.amount, unit: p.unit, cond: condOf(e, channelName), once: false };
}

// 아이템 하나의 효과 조각들 — 기본 효과 세 칸 + 조건 효과. 기프트카드는 []
export function itemEffectPartsOf(item, channelNameOf) {
  if (!item || item.type === "physical") return [];
  const api = item.effects && typeof item.effects === "object" && !Array.isArray(item.effects) ? item.effects : null;
  const src = api || item;
  const list = api ? api.list : item.effects;
  const basic = (label, v) => (Number(v) > 0 ? [{ label, amount: `+${fmtXp(v)}`, unit: "XP", cond: [], once: false }] : []);
  const nameOf = (id) => (typeof channelNameOf === "function" ? channelNameOf(String(id)) : undefined);
  return [
    ...basic("채팅 1회당", src.chatBuffXp),
    ...basic("음성 1회당", src.voiceBuffXp),
    ...basic("출석 시", src.attendBuffXp),
    ...(Array.isArray(list) ? list : []).map((e) => effectParts(e, e?.channelIds?.length === 1 ? nameOf(e.channelIds[0]) : undefined)).filter(Boolean),
  ];
}

// 역할 버프 조각 — 채팅 · 음성이 한 값
export function roleBuffParts({ buffXp, attendBuffXp } = {}) {
  const out = [];
  if (Number(buffXp) > 0) out.push({ label: "채팅 · 음성 1회당", amount: `+${fmtXp(buffXp)}`, unit: "XP", cond: [], once: false });
  if (Number(attendBuffXp) > 0) out.push({ label: "출석 시", amount: `+${fmtXp(attendBuffXp)}`, unit: "XP", cond: [], once: false });
  return out;
}

// 한 줄 설명 — 인벤토리 · 관리자 목록 · 미리보기에 같은 문장으로. 게임 아이템 효과처럼 짧게
//   예: "채팅 1회당 +50% · 주말 22~2시", "매일 음성 60분 +5,000 XP", "출석 7회마다 +20,000 XP"
//   새 효과: "채팅 잭팟 10% +1,000 XP", "럭키 출석 10% · +100%", "음성 3명↑ +30%", "출석 빙옥 +5", "강화 비용 −10%",
//            "캐시백 3%", "채팅 쿨타임 −15초", "음소거 감소 −40%p", "연속 출석 보호막", "카드 스킨 · 골드", "프로필 배지", "아바타 테두리 · 마스터"
export function describeEffect(e, channelName) {
  const t = TRIGGER_OF[e?.on];
  if (!t) return "";
  const p = pieceOf(e);
  const size = p.amount ? `${p.sep || " "}${p.amount}${p.unit === "XP" ? " XP" : p.unit}` : "";
  const cond = condOf(e, channelName);
  return `${p.label}${size}${cond.length ? ` · ${cond.join(" ")}` : ""}`;
}

// ── 상시형 합산 (사이트 lib/itemPerks.js · 봇 perksOf 와 같은 규칙) ──
//    items: 보유 아이템(lib/ownedItems.js 결과 — 같은 아이템은 한 번). 순서는 관리자 순서(sortOrder · createdAt)로 다시 맞춘다
//    반환: { enhanceDiscount, shopCashback, questBonus, passBoost, cooldownCut, muteRelief,  — 합(상한 적용 — 캐시백은 관리자 설정 상한을 결제 API 가 한 번 더 건다)
//            badges: [] (자동으로 다는 배지 없음 — 유저가 단 배지는 pickBadges 로 따로 적용),
//            allBadges: 가진 배지 전부(관리자 순서 · 아이템마다 한 번 — [{ itemId, name, icon, imageUrl, color, type, bought }]),
//            cardSkin: "" (자동으로 입히는 스킨 없음 — 유저가 고른 스킨은 pickCardSkin 으로 따로 적용),
//            cardSkins: [스킨 키] (가진 스킨 전부, 관리자 순서 · 중복 없음),
//            avatarFrames: [테두리 키] (가진 테두리 전부, 관리자 순서 · 중복 없음 — 고른 것은 pickAvatarFrame) }
export const PERK_KEYS = TRIGGERS.filter((t) => t.kind === "perk").map((t) => t.v);
const tsOf = (d) => (d ? new Date(d).getTime() || 0 : 0);
export function perksOfItems(items) {
  const sum = Object.fromEntries(PERK_KEYS.map((k) => [k, 0]));
  const allBadges = [];
  const cardSkins = [];
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
      else if (e.on === "cardSkin" && !cardSkins.includes(e.skin)) cardSkins.push(e.skin);
      else if (e.on === "avatarFrame" && !avatarFrames.includes(e.frame)) avatarFrames.push(e.frame);
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
  return { ...out, badges: pickBadges(allBadges), allBadges, cardSkin: pickCardSkin(cardSkins, ""), cardSkins, avatarFrames };
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

// 아이템 기본 효과 세 칸의 문장 — 채팅 · 음성 · 출석을 따로 정한다
const fmtXp = (n) => Number(n || 0).toLocaleString("ko-KR");
export function describeItemBasic({ chatBuffXp, voiceBuffXp, attendBuffXp } = {}) {
  const out = [];
  if (Number(chatBuffXp) > 0) out.push(`채팅 1회당 +${fmtXp(chatBuffXp)} XP`);
  if (Number(voiceBuffXp) > 0) out.push(`음성 1회당 +${fmtXp(voiceBuffXp)} XP`);
  if (Number(attendBuffXp) > 0) out.push(`출석 시 +${fmtXp(attendBuffXp)} XP`);
  return out;
}

// 역할 버프(RoleConfig — 관리자 › 레벨 설정 역할 탭)의 문장 — 채팅 · 음성이 한 값이다
export function describeRoleBuff({ buffXp, attendBuffXp } = {}) {
  const out = [];
  if (Number(buffXp) > 0) out.push(`채팅 · 음성 1회당 +${fmtXp(buffXp)} XP`);
  if (Number(attendBuffXp) > 0) out.push(`출석 시 +${fmtXp(attendBuffXp)} XP`);
  return out;
}

// 📌 아이템 하나의 효과 문장들 — 기본 효과(describeItemBasic) + 조건 효과(describeEffect). 기프트카드(physical)는 [].
//    item 은 저장 모양(맨 위 chatBuffXp · voiceBuffXp · attendBuffXp · effects[])과
//    관리자 API 모양(effects: { chatBuffXp, voiceBuffXp, attendBuffXp, list }) 둘 다 받는다.
//    channelNameOf(id) → 채널 이름 (선택) — 채널 하나만 지정한 효과를 "#이름" 으로 적을 때만 부른다
export function itemEffectLines(item, channelNameOf) {
  if (!item || item.type === "physical") return [];
  const api = item.effects && typeof item.effects === "object" && !Array.isArray(item.effects) ? item.effects : null;
  const src = api || item;
  const basic = { chatBuffXp: src.chatBuffXp, voiceBuffXp: src.voiceBuffXp, attendBuffXp: src.attendBuffXp };
  const list = api ? api.list : item.effects;
  const nameOf = (id) => (typeof channelNameOf === "function" ? channelNameOf(String(id)) : undefined);
  return [
    ...describeItemBasic(basic),
    ...(Array.isArray(list) ? list : [])
      .map((e) => describeEffect(e, e?.channelIds?.length === 1 ? nameOf(e.channelIds[0]) : undefined))
      .filter(Boolean),
  ];
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
