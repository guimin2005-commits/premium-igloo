// 📌 ARCTIC 홈 추천 — '이번 주' · '지금 잘 나가는'(왼쪽) · '○○에게 맞는'(오른쪽) 을 고르는 순수 계산.
//    DB · 서버 의존이 없다 — 입력(구매 목록 · 유저 레벨 표 · 상품 목록 · 아이템 효과 · 나)을 받아 결과 id 와 제목만 낸다.
//    API(app/api/shop/recommend)가 DB 를 읽어 넣고, 전체 집계(buildStats · 아이템 효과)는 5분 캐시, 개인 부분(recommend)은 요청마다.
//    ⚠️ 구매 기록은 개인 데이터다 — 결과에는 상품 id 와 짧은 제목만 담는다(누가 무엇을 샀는지는 밖으로 나가지 않는다).
//    Node 로 바로 돌려 볼 수 있게 상대 경로(.js)로 부른다.
//
//    📌 2026-10 다시 짬 — 근거가 없는데 '잘 나가는'이라 쓰던 것 · 가진 상품 · 칸끼리 중복 · 같은 계열 몰림 ·
//       잔액을 거의 다 쓰는(등급이 떨어지는) 값을 권하던 것을 고쳤다. 규칙 요약:
//       · 세 칸 공통: 판매 중 · 재고 있음 · 무기한 보유(같은 역할 · 같은 카드 스킨 포함) 제외, 앞 칸에서 뽑힌 상품은 뒤 칸에서 뺀다
//         (고르는 순서 이번 주(할인) → 왼쪽 → 오른쪽 → 이번 주(할인이 없으면 신상)), 화면 전체에서 같은 계열은 덜 뽑는다
//       · 왼쪽: (보는 사람 말고) 서로 다른 구매자 2명 이상인 상품이 2개 이상일 때만 '지금 잘 나가는'. 아니면 할인 중 · 새로 들어온 · 추천 상품
//       · 같은 날(KST)에는 결과가 안 바뀐다 — 경과일 · 남은 날 · 흔들림을 모두 KST 날짜로 센다
//       · 오른쪽: 함께 산 · 등급 인기 · 활동 맞춤 · 예산 맞춤(등급 유지 예산) · 단계 · 곧 끝나는 기간제 연장. 제목 · 부제는 실제로 이긴 근거
import { cardPick, discountActive, discountPctOf, durationOptions, salePrice, isTimed, isPointOnly } from "./shopPricing.js";
import { getTierIndex, VOICE_TIERS } from "./voiceTiers.js";
import { getLevelByXp, getCumulativeXpByLevel } from "./leveling.js";
import { pointToXp, xpToPoint } from "./pointRate.js";
import { isUnitSale } from "./unitSale.js";

const DAY = 86400000;

// 📌 요즘 인기 — 최근 30일 구매, 반감기 7일(최근 7일이 8~30일보다 확실히 무겁다). 30일 끝에서도 0.05 라 날짜 경계에서 순서가 튀지 않는다
export const HOT_DAYS = 30;
export const HALF_LIFE_DAYS = 7;
// 📌 같은 사람이 같은 상품을 또 사면(연장 · 재구매) 덜 센다 — 두 번째 0.25, 세 번째 0.0625 … (몇 명의 반복 구매가 인기를 부풀리지 않게)
export const REPEAT_DAMP = 0.25;
// 📌 '지금 잘 나가는' — 30일 안에 서로 다른 구매자가 2명 이상인 상품만 인기로 센다(한 명이면 누가 샀는지 드러나고 우연이 크다).
//    보는 사람 자신의 구매는 빼고 센다(나와 한 사람만 산 상품이 내게 '인기'로 뜨면 그 한 사람이 산 게 드러난다)
export const HOT_MIN_BUYERS = 2;
export const NEW_DAYS = 21;          // '새로 들어온' — 등록 21일 이내
export const TIER_DAYS = 30;         // 등급별 인기 — 최근 30일
export const WINDOW_DAYS = 180;      // 함께 산 상품 — 최근 180일 (API 가 이 기간만 읽는다)
export const RENEW_SOON_DAYS = 7;    // 곧 만료 — 7일 이내
// 📌 등급 인기 · 함께 산 근거는 다른 구매자가 2명 이상일 때만 센다(점수 · 제목 모두).
//    한 명뿐이면 그 사람이 무엇을 샀는지가 추천 순서로 드러난다(상위 등급은 몇 명뿐이다) — 우연한 한 건이 뜨지도 않게
const TIER_MIN = 2;
const CO_MIN = 2;

// 📌 구매로 세는 상태 — 대기 · 완료 · 만료(팔린 뒤 기간이 끝난 것). 환불 · 취소는 되돌린 거래라 뺀다
export const SOLD_STATUS = ["pending", "completed", "expired"];
// 📌 상점 상품 id(ObjectId 24자)만 구매다 — 수동 지급("grant") · 시즌 패스 보상("season-pass")은 itemId 가 고정 글자라 걸러진다
//    (app/api/xp/reset 의 상점 구매 판정과 같다). siteOnly 는 산 물건의 디스코드 표기만 뗀 상태라 구매로 센다
export const SHOP_ID_RE = /^[0-9a-f]{24}$/i;
export const isShopItemId = (id) => SHOP_ID_RE.test(String(id || ""));

const OWN_STATUS = new Set(["pending", "completed"]);
const SOLD = new Set(SOLD_STATUS);
const ms = (d) => (d == null ? NaN : new Date(d).getTime());
const inStock = (it) => it?.stock == null || Number(it.stock) !== 0; // -1 = 무제한, 0 = 품절
// 구매자 지갑 — levels 값은 레벨 숫자이거나 { level, xp }
const walletOf = (levels, u) => {
  const v = levels instanceof Map ? levels.get(u) : levels?.[u];
  return v && typeof v === "object" ? v : { level: v };
};
const addTo = (map, key, val) => { let s = map.get(key); if (!s) map.set(key, (s = new Set())); s.add(val); return s; };

// KST 날짜 "YYYY-MM-DD" — 하루 단위 시드
export const kstDateOf = (now = Date.now()) => new Date(Number(now) + 9 * 3600000).toISOString().slice(0, 10);
// 📌 KST 날짜 번호 — 경과일을 '며칠 전'(정수)으로 센다. 인기 무게 · 신상 정도가 하루 안에서는 안 변해 같은 날 순서가 흔들리지 않는다
const kstDay = (t) => Math.floor((Number(t) + 9 * 3600000) / DAY);

// 📌 고정 시드 난수 [0, 1) — 같은 유저 · 같은 날 · 같은 상품이면 늘 같은 값(새로고침마다 바뀌지 않게). FNV-1a 32비트
//    + murmur3 마무리 섞기 — FNV-1a 만으로는 끝 글자 차이가 윗자리로 거의 안 퍼져, 끝자리만 다른 상품 id(ObjectId)끼리
//    날마다 거의 같은 값이 나와 순서가 안 바뀐다
export const seededRand = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ── 전체 집계 (5분 캐시 대상) ──
//    purchases: [{ userId, itemId, createdAt, status, paidXp }] — 최근 WINDOW_DAYS 일 구매. 여기서도 한 번 더 거른다
//    levels   : Map | { userId: level | { level, xp } } — 구매자의 지금 레벨 · XP
export function buildStats({ purchases, levels, now = Date.now() } = {}) {
  const nowMs = Number(now);
  const hotBy = new Map();   // itemId → Map(userId → [구매마다의 무게])   (30일)
  const tier = new Map();    // tierIdx → Map(itemId → Set(userId))   (30일)
  const all30 = new Map();   // itemId → Set(userId)                  (30일, 비로그인용)
  const owners = new Map();  // itemId → Set(userId)                  (180일)
  const baskets = new Map(); // userId → Set(itemId)                  (180일)

  const list = [];
  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (!p || !p.userId || !isShopItemId(p.itemId) || !SOLD.has(p.status)) continue;
    const at = ms(p.createdAt);
    if (!Number.isFinite(at) || at > nowMs + DAY) continue;
    const age = Math.max(0, (nowMs - at) / DAY);
    if (age > WINDOW_DAYS) continue;
    list.push({ p, at, age, dayAge: Math.max(0, kstDay(nowMs) - kstDay(at)) });
  }

  // 📌 구매 시점 등급 — 구매 시점 레벨은 남아 있지 않다. XP 로 사면 레벨이 내려가므로(실버 Lv170 이 30만 XP 를 쓰면 브론즈)
  //    지금 레벨을 그대로 쓰면 비싼 걸 산 사람이 아래 등급 인기로 잡힌다. 그 구매와 그 뒤 구매로 낸 XP(paidXp)를
  //    지금 XP 에 되돌려 산 순간의 레벨로 본다(환불 · 취소는 XP 가 돌아가 이미 빠져 있다). 지금 XP 를 모르면 지금 레벨
  const tierAt = new Map(); // 구매 → 등급 인덱스
  const spent = new Map();  // userId → 최근 구매부터 거꾸로 더한 paidXp
  for (const { p } of [...list].sort((x, y) => y.at - x.at)) {
    const u = String(p.userId);
    const w = walletOf(levels, u);
    const s = (spent.get(u) || 0) + Math.max(0, Number(p.paidXp) || 0);
    spent.set(u, s);
    const lv = Number(w.level) || 0;
    const xp = Number(w.xp);
    tierAt.set(p, getTierIndex(Number.isFinite(xp) && s > 0 ? Math.max(lv, getLevelByXp(xp + s)) : lv));
  }

  // 📌 30일 칸(등급 인기 · 요즘 인기)은 KST 날짜 차로 자른다 — 경계에 걸린 한 건이 하루 중간에 빠져 제목 · 순서가 바뀌지 않게
  for (const { p, dayAge } of list) {
    const id = String(p.itemId);
    const u = String(p.userId);
    addTo(owners, id, u);
    addTo(baskets, u, id);
    if (dayAge <= TIER_DAYS) {
      addTo(all30, id, u);
      const t = tierAt.get(p);
      if (!tier.has(t)) tier.set(t, new Map());
      addTo(tier.get(t), id, u);
    }
    if (dayAge <= HOT_DAYS) {
      const w = Math.pow(0.5, dayAge / HALF_LIFE_DAYS); // 오늘 산 것 1 · 7일 전 0.5 · 30일 전 0.05
      let m = hotBy.get(id);
      if (!m) hotBy.set(id, (m = new Map()));
      const ws = m.get(u);
      if (ws) ws.push(w); else m.set(u, [w]);
    }
  }

  // 📌 상품 점수 = 구매자마다 (가장 무거운 구매 + 반복 구매는 REPEAT_DAMP 거듭제곱으로 줄여서) 의 합
  //    hotBuyers = 30일 안의 서로 다른 구매자 수 · hotUsers = 그 구매자 모음 — HOT_MIN_BUYERS 판정용(보는 사람은 빼고 센다)
  const hot = new Map();
  const hotBuyers = new Map();
  const hotUsers = new Map();
  let hotSum = 0;
  for (const [id, m] of hotBy) {
    let s = 0;
    for (const ws of m.values()) {
      ws.sort((a, b) => b - a);
      ws.forEach((w, k) => { s += w * Math.pow(REPEAT_DAMP, k); });
    }
    hot.set(id, s);
    hotBuyers.set(id, m.size);
    hotUsers.set(id, new Set(m.keys()));
    hotSum += s;
  }
  return { at: nowMs, hot, hotBuyers, hotUsers, hotSum, tier, all30, owners, baskets };
}

// ── 상품 성격 — 연결된 아이템(Item)의 효과로 정한다 ──
//    ch  : 효과가 붙는 활동 — chat · voice · attend(봇 지급) · grow(레벨업 · 퀘스트 · 패스 · 승급) · shop(강화 · 결제)
//    fam : 계열 — boost(활동 XP) · growth(성장) · skin · badge · perk(권한) · role(역할) · gift(기프트) · consumable(소모품) · etc
//          다양성(같은 계열 몰림 방지) · 등급 단계 가중치에 쓴다. 유형(type) 하나로는 item 안의 부스트 · 성장, cosmetic 안의 스킨 · 배지가 안 갈린다
//    skin: 카드 스킨 키 — 같은 스킨을 가진 사람에게 다시 권하지 않게
const CH_OF = {
  chat: "chat", firstChat: "chat", chatJackpot: "chat", welcomeReply: "chat", cooldownCut: "chat",
  voice: "voice", voiceDaily: "voice", voiceParty: "voice", muteRelief: "voice",
  attend: "attend", attendEvery: "attend", attendLucky: "attend", attendPoint: "attend", streakShield: "attend",
  levelUp: "grow", questBonus: "grow", passBoost: "grow",
  enhanceDiscount: "shop", shopCashback: "shop",
};
export const ACT_CHANNELS = ["chat", "voice", "attend", "grow"];
export function profileOf(it, doc) {
  const ch = new Set();
  let skin = "";
  let hasSkin = false;
  let badge = false;
  let consumable = false;
  if (doc && it?.type !== "physical") {
    if (Number(doc.chatBuffXp) > 0) ch.add("chat");
    if (Number(doc.voiceBuffXp) > 0) ch.add("voice");
    if (Number(doc.attendBuffXp) > 0) ch.add("attend");
    for (const e of Array.isArray(doc.effects) ? doc.effects : []) {
      const on = e && typeof e.on === "string" ? e.on : "";
      if (!on) continue;
      if (on === "cardSkin") { hasSkin = true; skin = skin || String(e.skin || ""); }
      else if (on === "profileBadge") badge = true;
      if (on === "streakShield") consumable = true;
      if (CH_OF[on]) ch.add(CH_OF[on]);
    }
  }
  let fam;
  if (it?.type === "physical") fam = "gift";
  else if (it?.type === "role") fam = "role";
  else if (it?.type === "perk") fam = "perk";
  else if (hasSkin) fam = "skin";
  else if (badge) fam = "badge";
  else if (consumable || isUnitSale(it)) fam = "consumable";
  else if (ch.has("chat") || ch.has("voice") || ch.has("attend")) fam = "boost";
  else if (ch.has("grow") || ch.has("shop")) fam = "growth";
  else fam = String(it?.type || "etc");
  return { fam, ch, skin };
}

// 📌 활동 성향 — 채팅 · 음성 · 출석 · 성장(퀘스트 · 패스) 각 0~1. 순수 계산(API 가 DB 에서 모아 넣는다)
//    a.log      : 최근 14일 XpLog 의 이유별 XP 합 { chat, voice, attend } · a.logCount: 그 건수
//    a.quests   : 최근 14일 퀘스트 수령 수 · a.passUnlocked: 이번 시즌 패스 해금
//    a.voiceSeconds · a.lastChatXpAt · a.attendStreak · a.chatEnhance · a.voiceEnhance : UserXp 칸
//    XpLog 가 넉넉하면 그 비율(건수가 적으면 그만큼 약하게), 없으면(비공개 중 XP 정지 등) 시즌 음성 시간 · 최근 채팅 · 연속 출석으로 약하게 잰다
export const ACT_MIN_LOGS = 10;
export function activityOf(a = {}, now = Date.now()) {
  const out = { chat: 0, voice: 0, attend: 0, grow: 0 };
  if (!a) return out;
  const log = a.log || {};
  const part = (k) => Math.max(0, Number(log[k]) || 0);
  const tot = part("chat") + part("voice") + part("attend");
  const n = Number(a.logCount) || 0;
  if (tot > 0 && n >= ACT_MIN_LOGS) {
    const conf = Math.min(1, n / 60); // 60건 이상이면 비율을 그대로 믿는다
    for (const k of ["chat", "voice", "attend"]) out[k] = conf * (part(k) / tot);
  } else {
    const vh = Math.max(0, Number(a.voiceSeconds) || 0) / 3600;
    out.voice = Math.min(0.6, vh / 10); // 시즌 음성 10시간이면 0.6(상한)
    const chatAt = ms(a.lastChatXpAt);
    out.chat = Number.isFinite(chatAt) && Number(now) - chatAt <= 7 * DAY ? 0.3 : 0;
    out.attend = Math.min(0.4, Math.max(0, Number(a.attendStreak) || 0) / 14);
  }
  // 강화 — 채팅 · 음성 중 강화한 쪽으로 기운다(단계당 0.05, 0.3 까지)
  out.chat = Math.min(1, out.chat + Math.min(0.3, 0.05 * Math.max(0, Number(a.chatEnhance) || 0)));
  out.voice = Math.min(1, out.voice + Math.min(0.3, 0.05 * Math.max(0, Number(a.voiceEnhance) || 0)));
  out.grow = Math.min(1, 0.6 * Math.min(1, Math.max(0, Number(a.quests) || 0) / 10) + (a.passUnlocked ? 0.3 : 0));
  return out;
}

// 상품 하나에 해당하는 내 살아 있는 보유 건 — app/arctic/owned.ts liveOf 와 같은 기준(같은 상품이거나 연결된 아이템을 itemRef 로 받은 것)
const liveOf = (mine, it, nowMs) =>
  mine.filter((p) => OWN_STATUS.has(p.status) && !p.consumedAt && (!p.expiresAt || ms(p.expiresAt) > nowMs)
    && (String(p.itemId) === String(it._id) || (!!it.itemId && p.itemRef === it.itemId)));

// 가격 선택지 — 기간제면 기간마다 { days, price }, 아니면 하나(days 없음). 값은 판매가(할인 반영)
const optsOf = (it) => {
  const opts = durationOptions(it);
  return opts.length ? opts.map((o) => ({ days: Number(o.days), price: salePrice(it, o.days) })) : [{ days: undefined, price: salePrice(it) }];
};
const cheapestOpt = (it) => optsOf(it).reduce((a, b) => (b.price < a.price ? b : a));
const cheapest = (it) => cheapestOpt(it).price;
const dayLen = (d) => (d === 0 ? Infinity : d == null ? 0 : d); // 기간 길이 — 무제한(0)이 가장 길다

// 📌 오른쪽 점수 가중치 — 함께 산 > 연장 > 등급 인기 > 활동 맞춤 > 예산 맞춤 > 단계 > 관리자 순서 > 하루 흔들림.
//    흔들림(0.03)은 관리자 순서(0.05)보다 작다 — 근거가 없을 때 두 번째 칸이 매일 무작위로 바뀌지 않고, 비슷한 점수끼리만 자리를 바꾼다
const W = { co: 1.0, renew: 0.8, tier: 0.7, act: 0.5, fit: 0.35, stage: 0.15, prior: 0.05, jitter: 0.03 };
// 📌 같은 계열 몰림 방지(MMR) — 같은 칸에 이미 있는 계열이면 0.3, 다른 칸(위 · 이번 주)에 있는 계열이면 0.12 를 빼고 고른다.
//    다른 칸 감점을 작게 둔다 — 왼쪽에 권한 하나가 떴다고 오른쪽의 가장 잘 맞는 권한이 통째로 밀리지 않게
const FAM_PENALTY = 0.3;
const FAM_PENALTY_OTHER = 0.12;
// 📌 예산 맞춤 — 로그 가격 기준 종 모양. 예산의 35% 에서 1, 10% · 100% 에서 약 0.4 · 0.5 (잔액을 거의 다 쓰는 값을 앞세우지 않는다)
const FIT_PEAK = 0.35;
const FIT_SIGMA = 0.9;
// 📌 등급 단계별로 먼저 권할 계열 — 구매 기록이 없어도 작동한다.
//    아이언 · 브론즈: 키우는 것(부스트 · 성장) / 실버~플래티넘: 권한 · 꾸미기 / 다이아몬드 이상: 역할 · 꾸미기 · 기프트
const STAGE = [
  { upTo: 1, w: { boost: 1, growth: 0.9, consumable: 0.5, perk: 0.4, badge: 0.3, skin: 0.3 } },
  { upTo: 4, w: { perk: 1, skin: 0.8, badge: 0.6, boost: 0.6, growth: 0.5, role: 0.5, consumable: 0.4 } },
  { upTo: Infinity, w: { role: 1, skin: 0.9, gift: 0.8, perk: 0.6, badge: 0.6, growth: 0.3, boost: 0.3, consumable: 0.3 } },
];
const stageW = (tierIdx, fam) => (STAGE.find((s) => tierIdx <= s.upTo) || STAGE[STAGE.length - 1]).w[fam] || 0;
const STARTER = new Set(["boost", "growth", "consumable"]); // 잔액 0 · 비로그인에게 먼저 권할 '키우는' 계열

// ── 개인 추천 (요청마다) ──
//    items: 상품 목록(판매 중인 것만 쓴다)
//    docs : Item id → 아이템 효과({ type, chatBuffXp, voiceBuffXp, attendBuffXp, effects }) — Map 또는 객체. 계열 · 활동 채널 판정(profileOf)
//    me   : null(비로그인) | { userId, level, xp, point, act, purchases: [{ itemId, itemRef, roleId, status, expiresAt, days, createdAt }] }
//           act — activityOf 결과(채팅 · 음성 · 출석 · 성장 0~1). 없으면 활동 근거를 쓰지 않는다
//    반환 : { hot: [id], hotTitle, forMe: { title, sub, basis, ids, days: { id: 카드에 걸 기간 } }, deal: { id, kind } | null, renewSoon: [{ id, expiresAt }] }
//           hotTitle — "지금 잘 나가는"(2명 이상 산 상품 2개 이상) · "할인 중" · "새로 들어온" · "추천 상품"
//           basis    — "co"(함께 산) · "tier"(등급 인기) · "act"(활동) · "budget"(잔액) · "level"(등급 단계) · "renew"(곧 끝나는 내 기간제)
//                      · "near"(조금만 더 모으면) · "start"(잔액 0 · 가볍게) · "popular"(비로그인 인기) · "timed"(기간제 채움) · "fill"
//           sub      — 부제(실제로 이긴 근거). 화면은 이 값을 그대로 쓴다
export function recommend({ stats, items, docs = null, me = null, now = Date.now() } = {}) {
  const nowMs = Number(now);
  const st = stats || buildStats({ purchases: [], levels: {}, now: nowMs });
  const active = (Array.isArray(items) ? items : []).filter((it) => it && it._id && it.active !== false);
  const sid = (it) => String(it._id);
  const docOf = (ref) => (!ref || !docs ? null : (docs instanceof Map ? docs.get(String(ref)) : docs[String(ref)]) || null);
  const prof = new Map(active.map((it) => [sid(it), profileOf(it, docOf(it.itemId))]));
  const famOf = (it) => prof.get(sid(it))?.fam || "etc";
  const hotOf = (it) => st.hot.get(sid(it)) || 0;
  // 📌 '2명 이상'은 보는 사람을 빼고 센다(등급 인기 · 함께 산과 같은 규칙) — 나와 한 사람만 산 상품이 '잘 나가는'으로 떠서
  //    그 한 사람이 샀다는 게 드러나지 않게
  const viewer = me?.userId ? String(me.userId) : "";
  const buyersOf = (it) => {
    const s = st.hotUsers?.get(sid(it));
    if (!s) return st.hotBuyers?.get(sid(it)) || 0;
    return viewer && s.has(viewer) ? s.size - 1 : s.size;
  };
  const sorted = [...active].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const rankOf = new Map(sorted.map((it, i) => [sid(it), sorted.length > 1 ? i / (sorted.length - 1) : 0]));
  const prior = (it) => 1 - (rankOf.get(sid(it)) ?? 1); // 관리자 순서 — 앞일수록 1
  const day = kstDateOf(nowMs);
  const byScore = (a, b) => b.score - a.score || prior(b.it) - prior(a.it);

  // ── 내 보유 ──
  const mine = me && Array.isArray(me.purchases) ? me.purchases : [];
  const myId = me?.userId ? String(me.userId) : "";
  // 📌 1개 단위 상품(lib/unitSale.js)은 가져도 "none" — 더 살 수 있어 추천 후보에 남는다(app/arctic/owned.ts ownStateOf 와 같다)
  const stateOf = (it) => {
    if (isUnitSale(it)) return "none";
    const live = liveOf(mine, it, nowMs);
    if (!live.length) return "none";
    return live.some((p) => !p.expiresAt) ? "forever" : "timed";
  };
  const states = new Map(active.map((it) => [sid(it), me ? stateOf(it) : "none"]));
  // 📌 같은 효과 — 무기한으로 가진 것과 같은 디스코드 역할 · 같은 카드 스킨이면 그 상품도 가진 것으로 본다(중복 권유 방지)
  if (me) {
    const roles = new Set();
    const skins = new Set();
    for (const p of mine) if (OWN_STATUS.has(p.status) && !p.consumedAt && !p.expiresAt && p.roleId) roles.add(String(p.roleId));
    for (const it of active) {
      if (states.get(sid(it)) !== "forever") continue;
      if (it.roleId) roles.add(String(it.roleId));
      if (prof.get(sid(it)).skin) skins.add(prof.get(sid(it)).skin);
    }
    for (const it of active) {
      if (states.get(sid(it)) !== "none" || isUnitSale(it)) continue;
      const skin = prof.get(sid(it)).skin;
      if ((it.roleId && roles.has(String(it.roleId))) || (skin && skins.has(skin))) states.set(sid(it), "forever");
    }
  }
  const usable = (it) => inStock(it) && states.get(sid(it)) !== "forever"; // 판매 중(active) · 재고 · 무기한 미보유

  // 📌 세 칸이 같이 쓰는 '뽑힌 것' — 같은 상품은 한 번만, 같은 계열은 덜 (MMR). prev = 같은 칸에 이미 뽑힌 것
  const taken = new Set();
  const famsTaken = new Set();
  const take = (it) => { taken.add(sid(it)); famsTaken.add(famOf(it)); };
  const pickDiverse = (rows, n, prev = []) => {
    const out = [];
    const local = new Set(prev.map((r) => famOf(r.it)));
    const left = rows.filter((r) => !taken.has(sid(r.it)));
    while (out.length < n && left.length) {
      let bi = 0;
      let bv = -Infinity;
      left.forEach((r, i) => {
        const fm = famOf(r.it);
        const v = r.score - (local.has(fm) ? FAM_PENALTY : famsTaken.has(fm) ? FAM_PENALTY_OTHER : 0);
        if (v > bv) { bv = v; bi = i; }
      });
      const r = left.splice(bi, 1)[0];
      take(r.it);
      local.add(famOf(r.it));
      out.push(r);
    }
    return out;
  };

  // 📌 인기로 치는 상품 — 나 말고 서로 다른 구매자 2명 이상(세 칸 모두 이 기준). 한 명뿐인 구매는 '이번 주' 순서에도 안 섞는다
  const isHot = (it) => hotOf(it) > 0 && buyersOf(it) >= HOT_MIN_BUYERS;

  // ── 1) 이번 주 (할인) — 살아 있는 할인 중 종료 임박 · 할인율 · 요즘 인기를 섞어 하나. 가진 상품은 빼고 가장 먼저 뽑는다 ──
  const maxHot = Math.max(0, ...active.filter(isHot).map(hotOf));
  // 📌 남은 날 — KST 날짜 차(오늘 끝나면 0). 시각 차로 재면 하루 중간에 점수가 움직여 '이번 주' · 왼쪽 · 연장 순서가 바뀐다
  const daysLeft = (t) => kstDay(t) - kstDay(nowMs);
  const urgencyOf = (it) => {
    const until = it.discountUntil ? ms(it.discountUntil) : NaN;
    return Number.isFinite(until) ? Math.max(0, Math.min(1, 1 - daysLeft(until) / 7)) : 0; // 일주일 안에 끝나면 가까울수록 1
  };
  const dealScore = (it) => 0.4 * urgencyOf(it) + 0.4 * (discountPctOf(it, nowMs) / 100) + 0.2 * (maxHot > 0 && isHot(it) ? hotOf(it) / maxHot : 0);
  const sale = active.filter((it) => usable(it) && discountActive(it, nowMs))
    .sort((a, b) => dealScore(b) - dealScore(a) || (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))[0];
  let deal = null;
  if (sale) { take(sale); deal = { id: sid(sale), kind: "sale" }; }

  // ── 2) 왼쪽 — '지금 잘 나가는' 은 근거가 있을 때만 ──
  //    인기 = 30일 · 반감기 7일 · 반복 구매 감쇠(buildStats). 서로 다른 구매자 2명 이상인 상품이 2개 이상이면 그 둘(계열 다르게).
  //    모자라면 할인 중(2개 이상) → 새로 들어온(21일, 2개 이상) → 추천 상품(인기 1개가 있으면 맨 앞 · 할인 · 신상 · 관리자 순서 섞음)
  //    📌 soldCount 는 쓰지 않는다 — 환불 뒤에도 남고 연장마다 늘어 근거가 못 된다
  const leftPool = active.filter((it) => usable(it) && !taken.has(sid(it)));
  const maxH = Math.max(0, ...leftPool.filter(isHot).map(hotOf));
  const ownW = (it) => (states.get(sid(it)) === "timed" ? 0.5 : 1); // 기간제만 가진 상품(연장 · 업그레이드는 됨)은 절반
  // 등록 뒤 며칠(KST 날짜 차) — 같은 날 올라온 상품끼리는 같은 값이라 날짜 흔들림(leftJit)이 하루 단위로 돌려 보여 준다
  const ageDays = (it) => Math.max(0, kstDay(nowMs) - kstDay(ms(it.createdAt) || 0));
  const isNew = (it) => ageDays(it) <= NEW_DAYS;
  const newness = (it) => (isNew(it) ? 1 - ageDays(it) / NEW_DAYS : 0);
  const saleness = (it) => (discountActive(it, nowMs) ? 0.6 * (discountPctOf(it, nowMs) / 100) + 0.4 * urgencyOf(it) : 0);
  const leftJit = (it) => 0.02 * seededRand(`left:${day}:${sid(it)}`); // 왼쪽은 모두에게 같은 칸 — 유저가 아니라 날짜로만 흔든다
  const hotRows = leftPool.filter(isHot).map((it) => ({ it, score: (ownW(it) * hotOf(it)) / (maxH || 1) }));
  let hotTitle;
  let hot;
  if (hotRows.length >= 2) {
    hot = pickDiverse(hotRows.sort(byScore), 2);
    hotTitle = "지금 잘 나가는";
  } else if (!hotRows.length && leftPool.filter((it) => discountActive(it, nowMs)).length >= 2) {
    hot = pickDiverse(leftPool.filter((it) => discountActive(it, nowMs)).map((it) => ({ it, score: saleness(it) + 0.05 * prior(it) })).sort(byScore), 2);
    hotTitle = "할인 중";
  } else if (!hotRows.length && leftPool.filter(isNew).length >= 2) {
    hot = pickDiverse(leftPool.filter(isNew).map((it) => ({ it, score: newness(it) + 0.05 * prior(it) + leftJit(it) })).sort(byScore), 2);
    hotTitle = "새로 들어온";
  } else {
    const mix = leftPool.map((it) => ({ it, score: (isHot(it) ? 2 : 0) + (discountActive(it, nowMs) ? 0.5 + saleness(it) : 0) + 0.4 * newness(it) + 0.3 * prior(it) + leftJit(it) }));
    hot = pickDiverse(mix.sort(byScore), 2);
    hotTitle = "추천 상품";
  }
  // 상품이 아주 적으면 가진 것 · 품절까지 넓혀 칸을 채운다(빈칸 없이) — 그래도 살 수 있는 것 > 재고 있는 것 순
  if (hot.length < 2) hot = [...hot, ...pickDiverse(active.map((it) => ({ it, score: (usable(it) ? 2 : inStock(it) ? 1 : 0) + prior(it) })).sort(byScore), 2 - hot.length, hot)];

  // ── 3) 곧 만료되는 내 기간제 — 오른쪽의 연장 후보 ──
  const renewSoon = [];
  if (me) {
    for (const it of active) {
      if (states.get(sid(it)) !== "timed") continue;
      if (!durationOptions(it).some((o) => Number(o.days) > 0)) continue; // 기간제로 다시 살 수 없으면 연장도 없다
      const until = Math.max(...liveOf(mine, it, nowMs).map((p) => ms(p.expiresAt)));
      if (daysLeft(until) <= RENEW_SOON_DAYS) renewSoon.push({ id: sid(it), expiresAt: new Date(until).toISOString() });
    }
    renewSoon.sort((x, y) => ms(x.expiresAt) - ms(y.expiresAt));
  }
  const renewAt = new Map(renewSoon.map((r) => [r.id, ms(r.expiresAt)]));

  // ── 4) 오른쪽 — ○○에게 맞는 ──
  const tierIdx = me ? getTierIndex(Number(me.level) || 0) : 0;
  const tierName = me ? VOICE_TIERS[tierIdx]?.name || "" : "";

  // 내 바구니 — 산 적 있는 상품(환불 · 취소 제외) + 지금 가진 상품(수동 지급 · 패스로 받은 연결 아이템 포함)
  const basket = new Set();
  for (const p of mine) if (isShopItemId(p.itemId) && SOLD.has(p.status)) basket.add(String(p.itemId));
  for (const it of active) if (states.get(sid(it)) !== "none") basket.add(sid(it));
  // 함께 산 — 내 바구니의 상품 a 를 산 다른 사람들이 c 도 샀는가. 나는 빼고 센다
  const co = new Map(); // c → { n: 함께 산 사람 수(가장 큰 a 기준), s: 점수 }
  if (me) {
    for (const a of basket) {
      const buyers = st.owners.get(a);
      if (!buyers) continue;
      const others = [...buyers].filter((u) => u !== myId);
      if (!others.length) continue;
      const cnt = new Map();
      for (const u of others) for (const c of st.baskets.get(u) || []) if (c !== a) cnt.set(c, (cnt.get(c) || 0) + 1);
      for (const [c, n] of cnt) {
        if (n < CO_MIN) continue; // 한 사람의 바구니가 그대로 드러나지 않게
        // 조건부 비율(a 를 산 사람 중 c 도 산 비율) × 표본 보정 — 몇 사람의 우연한 조합이 크게 뜨지 않게
        const s = (n / (others.length + 1)) * (n / (n + 1));
        const prev = co.get(c);
        if (!prev || s > prev.s) co.set(c, { n, s });
      }
    }
  }
  const buyersIn = (map, id) => {
    const s = map?.get(id);
    if (!s) return 0;
    return myId && s.has(myId) ? s.size - 1 : s.size;
  };
  const popOf = (map, id) => { const A = buyersIn(map, id); return A >= TIER_MIN ? A / (A + 2) : 0; };
  const tierMap = me ? st.tier.get(tierIdx) : null;

  // 활동 맞춤 — 상품 효과가 붙는 활동(채널)마다 내 활동 성향의 평균. 그 활동 효과를 이미 가졌으면 절반(같은 효과 중복을 덜 권한다)
  const act = me?.act || null;
  const ownedCh = new Set();
  for (const it of active) if (states.get(sid(it)) !== "none" && !isUnitSale(it)) for (const c of prof.get(sid(it)).ch) ownedCh.add(c);
  const actFit = (it) => {
    if (!act) return 0;
    const chs = [...prof.get(sid(it)).ch].filter((c) => ACT_CHANNELS.includes(c));
    if (!chs.length) return 0;
    return chs.reduce((s, c) => s + Math.max(0, Number(act[c]) || 0) * (ownedCh.has(c) ? 0.5 : 1), 0) / chs.length;
  };
  // 📌 활동 근거 부제 — 가장 센 활동 하나("음성 기준" 등). 활동을 몰라 못 고르면 "내 활동 기준"
  const ACT_LABEL = { chat: "채팅 기준", voice: "음성 기준", attend: "출석 기준", grow: "퀘스트 기준" };

  // 📌 예산 — XP 로 사면 레벨이 내려간다. 등급 유지 예산 = 지금 등급의 시작 레벨 아래로 안 내려가는 XP + 빙옥(레벨과 무관).
  //    아이언은 더 내려갈 등급이 없어 XP 전부. 이 값을 넘는 값은 '살 수 있음'으로 치지 않는다(사면 등급이 떨어진다)
  //    빙옥 전용 상품은 빙옥만으로 산다(lib/shopPricing affordFor 와 같은 기준 — 올림)
  const xp = Math.max(0, Number(me?.xp) || 0);
  const pt = Math.max(0, Number(me?.point) || 0);
  const floorXp = tierIdx > 0 ? getCumulativeXpByLevel(VOICE_TIERS[tierIdx].min) : 0;
  const safe = Math.max(0, xp - floorXp) + pointToXp(pt);
  const wallet = xp + pointToXp(pt);
  const budgetOf = (it) => (isPointOnly(it) ? pointToXp(pt) : safe);
  const okPrice = (it, p) => (isPointOnly(it) ? xpToPoint(p) <= pt : p <= safe);
  const fitOf = (p, B) => (B > 0 && p > 0 ? Math.exp(-(Math.log(p / (FIT_PEAK * B)) ** 2) / (2 * FIT_SIGMA ** 2)) : 0);
  // 살 수 있는 기간 중 예산에 가장 잘 맞는 것(같으면 긴 기간) — 카드에도 이 기간을 건다
  const bestOpt = (it) => {
    let best = null;
    for (const o of optsOf(it)) {
      if (!okPrice(it, o.price)) continue;
      const f = fitOf(o.price, budgetOf(it));
      if (!best || f > best.f + 1e-9 || (Math.abs(f - best.f) <= 1e-9 && dayLen(o.days) > dayLen(best.days))) best = { ...o, f };
    }
    return best;
  };
  // 연장 기간 — 지금 가진 것과 같은 기간(있으면), 없으면 가장 긴 기간제(app/arctic/owned.ts renewPickOf 와 같은 규칙). 지갑 안에서
  const renewOpt = (it) => {
    const timed = optsOf(it).filter((o) => o.days > 0);
    if (!timed.length) return null;
    const live = liveOf(mine, it, nowMs);
    const latest = live.reduce((a, b) => (ms(b.expiresAt) > ms(a.expiresAt) ? b : a), live[0]);
    const okWallet = (p) => (isPointOnly(it) ? xpToPoint(p) <= pt : p <= wallet);
    const want = timed.find((o) => o.days === Number(latest?.days)) || timed.reduce((a, b) => (b.days > a.days ? b : a));
    if (okWallet(want.price)) return want;
    return timed.filter((o) => okWallet(o.price)).sort((a, b) => b.days - a.days)[0] || null;
  };

  // 근거별 제목 · 부제 — 고른 카드들의 점수에서 가장 큰 몫을 낸 근거
  const topOf = (sel) => {
    const ev = {};
    for (const r of sel) for (const [k, v] of Object.entries(r.parts || {})) ev[k] = (ev[k] || 0) + v;
    const top = Object.entries(ev).sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? top[0] : "";
  };
  const topAct = () => {
    const best = Object.entries(act || {}).filter(([k]) => ACT_CHANNELS.includes(k)).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 ? ACT_LABEL[best[0]] : "내 활동 기준";
  };

  let picks = [];
  let title = "";
  let sub = "";
  let basis = "";
  if (me) {
    // 펭귄 사다리 — 가진 역할 중 가장 비싼 것 이하의 역할은 빼고, 바로 다음 단계를 앞으로
    const roleItems = active.filter((it) => famOf(it) === "role");
    const ownedRoleTop = Math.max(0, ...roleItems.filter((it) => states.get(sid(it)) !== "none").map(cheapest));
    const nextRole = ownedRoleTop > 0 ? roleItems.filter((it) => cheapest(it) > ownedRoleTop).sort((a, b) => cheapest(a) - cheapest(b))[0] : null;
    const seed = `${myId || "me"}:${day}`;
    const rows = [];
    for (const it of active) {
      const id = sid(it);
      if (!inStock(it) || taken.has(id)) continue;
      const s = states.get(id);
      if (s === "forever") continue;
      let opt;
      let renew = 0;
      if (s === "timed") {
        if (!renewAt.has(id)) continue; // 기간제로 가진 것은 곧 끝날 때만 (연장 후보)
        opt = renewOpt(it);
        if (!opt) continue;
        renew = 0.5 + 0.5 * Math.max(0, Math.min(1, 1 - daysLeft(renewAt.get(id)) / RENEW_SOON_DAYS));
      } else {
        if (famOf(it) === "role" && ownedRoleTop > 0 && cheapest(it) <= ownedRoleTop) continue;
        opt = bestOpt(it);
        if (!opt && isPointOnly(it)) continue; // 빙옥이 모자라면 빙옥 전용은 권하지 않는다
      }
      const G = Math.min(1, stageW(tierIdx, famOf(it)) + (nextRole && sid(nextRole) === id ? 0.5 : 0));
      const parts = {
        co: W.co * (co.get(id)?.s || 0),
        renew: W.renew * renew,
        tier: W.tier * popOf(tierMap, id),
        act: W.act * actFit(it),
        fit: W.fit * (opt && !renew ? opt.f : 0),
        stage: W.stage * G,
      };
      const score = Object.values(parts).reduce((a, b) => a + b, 0) + W.prior * prior(it) + W.jitter * seededRand(`${seed}:${id}`);
      rows.push({ it, opt, ok: !!opt, parts, score, G });
    }
    const okRows = rows.filter((r) => r.ok).sort(byScore);
    if (okRows.length >= 2) {
      picks = pickDiverse(okRows, 2);
      const top = topOf(picks);
      const LABEL = {
        co: ["함께 많이 산", "내 아이템 기준", "co"],
        renew: [`${tierName}에게 맞는`, "내 아이템 기준", "renew"],
        tier: [`${tierName}에게 인기`, "내 등급 기준", "tier"],
        act: [`${tierName}에게 맞는`, topAct(), "act"],
        fit: [`${tierName}에게 맞는`, "내 잔액 기준", "budget"],
        stage: [`${tierName}에게 맞는`, "내 등급 기준", "level"],
      };
      [title, sub, basis] = LABEL[top] || LABEL.stage;
    } else {
      // 살 수 있는 게 모자람 — 살 수 있는 것(있으면) + 가장 가까운 것. 잔액 0 이면 '가볍게 시작'(키우는 계열의 가장 싼 기간)
      const head = pickDiverse(okRows, 1);
      const rest = rows.filter((r) => !r.ok && !isPointOnly(r.it) && !taken.has(sid(r.it)));
      const starters = rest.filter((r) => STARTER.has(famOf(r.it)));
      const pool = wallet > 0 ? rest : starters.length >= 2 - head.length ? starters : rest;
      const byCheap = [...pool].sort((a, b) => cheapest(a.it) - cheapest(b.it));
      const cheapRank = new Map(byCheap.map((r, i) => [sid(r.it), byCheap.length > 1 ? i / (byCheap.length - 1) : 0]));
      const near = pool.map((r) => {
        const o = cheapestOpt(r.it);
        // 가까움 — 등급 유지 예산으로 가장 싼 기간의 몇 % 를 이미 가졌나(잔액 0 이면 싼 순서)
        const close = wallet > 0 ? Math.min(1, safe / Math.max(1, o.price)) : 1 - (cheapRank.get(sid(r.it)) ?? 1);
        const parts = { act: r.parts.act, close: W.fit * close, stage: wallet > 0 ? r.parts.stage : 0 };
        return { it: r.it, opt: o, parts, score: parts.act + parts.close + parts.stage + W.prior * prior(r.it) + W.jitter * seededRand(`${seed}:${sid(r.it)}`) };
      }).sort(byScore);
      picks = [...head, ...pickDiverse(near, 2 - head.length, head)];
      if (head.length) {
        const top = topOf(head);
        [title, sub, basis] = top === "act" ? [`${tierName}에게 맞는`, topAct(), "act"] : [`${tierName}에게 맞는`, "내 잔액 기준", "budget"];
      } else if (wallet > 0) {
        [title, sub, basis] = ["조금만 더 모으면", "내 잔액 기준", "near"];
      } else {
        // 키우는 계열이 다 떨어져(가졌거나 위 칸에 나옴) 다른 계열로 채웠으면 '가볍게'라 쓰지 않는다
        const light = pool === starters;
        [title, sub, basis] = [light ? "가볍게 시작" : `${tierName}에게 맞는`, topOf(picks) === "act" ? topAct() : "낮은 가격순", "start"];
      }
    }
  } else {
    // 비로그인 — 예산을 모른다. 30일 전체 인기(2명 이상)가 있으면 그것, 없으면 키우는 계열의 가장 싼 기간(가볍게 시작하기 좋은 것)
    const all = active.filter((it) => usable(it) && !taken.has(sid(it)) && !isPointOnly(it));
    const starters = all.filter((it) => STARTER.has(famOf(it)));
    const pool = starters.length >= 2 ? starters : all;
    const byCheap = [...pool].sort((a, b) => cheapest(a) - cheapest(b));
    const cheapRank = new Map(byCheap.map((it, i) => [sid(it), byCheap.length > 1 ? i / (byCheap.length - 1) : 0]));
    const rows = pool.map((it) => {
      const parts = { pop: W.tier * popOf(st.all30, sid(it)), cheap: W.fit * (1 - (cheapRank.get(sid(it)) ?? 1)) };
      return { it, opt: cheapestOpt(it), parts, score: parts.pop + parts.cheap + W.prior * prior(it) + W.jitter * seededRand(`anon:${day}:${sid(it)}`) };
    }).sort(byScore);
    picks = pickDiverse(rows, 2);
    const pop = topOf(picks) === "pop";
    [title, sub, basis] = ["처음이라면", pop ? "많이 고른" : "낮은 가격순", pop ? "popular" : "start"];
  }

  // 그래도 모자라면(거의 다 가짐 · 상품이 적음) — 기간제(연장 · 업그레이드 가능) → 남은 아무 상품(관리자 순서). 빈칸 없이
  //    📌 이미 한 장이 있으면 안 가진 상품만 붙인다 — 근거 칸(○○에게 맞는 등)은 화면이 가진 상품을 빼고 그려, 가진 것을 붙이면
  //       화면이 그 자리를 다른 칸 상품으로 채워 겹친다. 한 장도 없을 때만(제목이 '기간제만 모아보기' · 채움) 가진 것까지
  const addable = (it) => !picks.length || states.get(sid(it)) === "none";
  if (picks.length < 2) {
    const timed = active.filter((it) => isTimed(it) && inStock(it) && states.get(sid(it)) !== "forever" && addable(it)).map((it) => ({ it, score: prior(it) }));
    const got = pickDiverse(timed.sort(byScore), 2 - picks.length, picks);
    if (got.length && !picks.length) [title, sub, basis] = ["기간제만 모아보기", "", "timed"];
    picks = [...picks, ...got];
  }
  if (picks.length < 2) {
    // 품절은 넣지 않는다 — 추천 칸에 살 수 없는 카드를 거느니 한 장만 둔다(상품이 아주 적을 때만 생긴다)
    const got = pickDiverse(active.filter((it) => inStock(it) && addable(it)).map((it) => ({ it, score: (usable(it) ? 1 : 0) + prior(it) })).sort(byScore), 2 - picks.length, picks);
    if (got.length && !picks.length) [title, sub, basis] = [me ? `${tierName}에게 맞는` : "처음이라면", "", "fill"];
    picks = [...picks, ...got];
  }
  // 📌 끝내 한 장도 없으면(상품이 없거나 다 뽑힘) 근거 문구를 남기지 않는다 — '조금만 더 모으면' 아래 빈칸이 뜨지 않게
  if (!picks.length) [title, sub, basis] = [me ? `${tierName}에게 맞는` : "처음이라면", "", "fill"];

  // ── 5) 이번 주 — 할인이 없으면 위 칸에 안 나온 가장 최근 상품(가진 것 제외) ──
  //    📌 남은 게 없으면(상품이 아주 적음) null — 다른 칸 상품을 한 번 더 걸지 않는다. 화면은 시즌 카드만 넓게 그린다
  if (!deal) {
    const byNew = (list) => [...list].sort((a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0))[0];
    const fresh = byNew(active.filter((it) => usable(it) && !taken.has(sid(it))))
      || byNew(active.filter((it) => inStock(it) && !taken.has(sid(it))));
    if (fresh) { take(fresh); deal = { id: sid(fresh), kind: "new" }; }
  }

  return {
    hot: hot.map((r) => sid(r.it)),
    hotTitle,
    forMe: {
      title,
      sub,
      basis,
      ids: picks.map((r) => sid(r.it)),
      // 카드에 걸 기간 — 기간제만(예산에 맞춘 기간 · 연장 기간 · 가장 싼 기간). 없으면 화면 기본 규칙
      days: Object.fromEntries(picks.filter((r) => r.opt && isTimed(r.it) && r.opt.days != null).map((r) => [sid(r.it), r.opt.days])),
    },
    deal,
    renewSoon,
  };
}

// ── 관련 상품 (상품 상세 '다른 상품도 둘러보세요') — 요청마다 ──
//    baseId : 보고 있는 상품 id
//    items · docs · me · now : recommend 와 같다
//    반환 : [상품 id] 최대 n 개(기본 4)
//    점수 = 함께 산(이 상품을 산 다른 구매자들이 c 도 산 비율 — 그런 사람이 2명 이상일 때만)
//         + 요즘 인기(서로 다른 구매자 2명 이상) + 내 등급 인기(비로그인은 전체 30일 인기, 2명 이상일 때만)
//         + 같은 계열(profileOf — 아이템 효과를 모르면 유형) + 비슷한 가격대
//         + 작은 기본 순서 + 하루 고정 흔들림(같은 유저 · 같은 날 · 같은 상품이면 같은 자리 — 새로고침마다 안 바뀐다)
//    제외 : 이 상품 · 내가 가진 것(기간제 포함) · 품절 · 판매 중 아님
//    📌 결과는 id 만 — 누가 무엇을 샀는지는 밖으로 나가지 않는다(함께 산 · 등급 인기 모두 2명 이상 규칙 유지)
export const RELATED_N = 4;
export function related({ stats, items, docs = null, baseId, me = null, now = Date.now(), n = RELATED_N } = {}) {
  const nowMs = Number(now);
  const st = stats || buildStats({ purchases: [], levels: {}, now: nowMs });
  const active = (Array.isArray(items) ? items : []).filter((it) => it && it._id && it.active !== false);
  const sid = (it) => String(it._id);
  const bid = String(baseId || "");
  const base = active.find((it) => sid(it) === bid) || (Array.isArray(items) ? items : []).find((it) => it && String(it._id) === bid) || null;

  const mine = me && Array.isArray(me.purchases) ? me.purchases : [];
  const myId = me?.userId ? String(me.userId) : "";
  const owns = (it) => !!me && !isUnitSale(it) && liveOf(mine, it, nowMs).length > 0;
  const docOf = (ref) => (!ref || !docs ? null : (docs instanceof Map ? docs.get(String(ref)) : docs[String(ref)]) || null);
  const famOf = (it) => profileOf(it, docOf(it.itemId)).fam;
  const baseFam = base ? famOf(base) : "";

  // 함께 산 — 이 상품을 산 다른 사람들의 바구니. 나는 빼고 센다
  const co = new Map();
  const buyers = [...(st.owners.get(bid) || [])].filter((u) => u !== myId);
  if (buyers.length) {
    const cnt = new Map();
    for (const u of buyers) for (const c of st.baskets.get(u) || []) if (c !== bid) cnt.set(c, (cnt.get(c) || 0) + 1);
    for (const [c, k] of cnt) {
      if (k < CO_MIN) continue; // 한 사람의 바구니가 그대로 드러나지 않게
      co.set(c, (k / (buyers.length + 1)) * (k / (k + 1)));
    }
  }

  // 📌 요즘 인기도 2명 이상 산 상품만(보는 사람은 빼고 센다) — 한 사람의 구매가 순서로 드러나지 않게
  const hotBuyersOf = (id) => {
    const s = st.hotUsers?.get(id);
    if (!s) return st.hotBuyers?.get(id) || 0;
    return myId && s.has(myId) ? s.size - 1 : s.size;
  };
  const hotOf = (id) => (hotBuyersOf(id) >= HOT_MIN_BUYERS ? st.hot.get(id) || 0 : 0);
  const maxHot = Math.max(0, ...active.map((it) => hotOf(sid(it))));
  const tierMap = me ? st.tier.get(getTierIndex(Number(me.level) || 0)) : st.all30;
  const popOf = (id) => {
    const s = tierMap?.get(id);
    if (!s) return 0;
    const A = myId && s.has(myId) ? s.size - 1 : s.size;
    return A >= TIER_MIN ? A / (A + 2) : 0;
  };
  // 비슷한 가격대 — 카드에 걸리는 값(무제한 > 가장 긴 기간) 비교. 같으면 1, 4배 벌어지면 0 (로그 비율)
  const cardOf = (it) => cardPick(it)?.price || 0;
  const baseCard = base ? cardOf(base) : 0;
  const near = (it) => {
    const p = cardOf(it);
    if (!baseCard || !p) return 0;
    return Math.max(0, 1 - Math.abs(Math.log(p / baseCard)) / Math.log(4));
  };
  const sorted = [...active].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  const rankOf = new Map(sorted.map((it, i) => [sid(it), sorted.length > 1 ? i / (sorted.length - 1) : 0]));
  const seed = `${myId || "anon"}:${kstDateOf(nowMs)}:rel:${bid}`;

  const scored = active
    .filter((it) => sid(it) !== bid && inStock(it) && !owns(it))
    .map((it) => {
      const id = sid(it);
      const score =
        1.0 * (co.get(id) || 0)
        + 0.5 * popOf(id)
        + 0.3 * (maxHot > 0 ? hotOf(id) / maxHot : 0)
        + (base && famOf(it) === baseFam ? 0.25 : 0)
        + 0.2 * near(it)
        + 0.04 * (1 - (rankOf.get(id) ?? 1))
        + 0.12 * seededRand(`${seed}:${id}`);
      return { id, score };
    })
    .sort((x, y) => y.score - x.score);
  return scored.slice(0, Math.max(0, n)).map((x) => x.id);
}

// 한 번에 — 테스트 · 점검 스크립트용 (API 는 buildStats 를 캐시하고 recommend 만 요청마다 부른다)
export const recommendFrom = ({ purchases, levels, items, docs, me, now = Date.now() } = {}) =>
  recommend({ stats: buildStats({ purchases, levels, now }), items, docs, me, now });
