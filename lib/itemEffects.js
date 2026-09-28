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
//      { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, chance?, minMembers?, seconds?, skin?,
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
//
//    📌 종류(kind) — 효과가 언제 붙는지
//      trigger    : 발동형 — 봇이 그 상황에서 지급할 때 더한다. 요일 · 시간대 조건을 붙일 수 있다
//      perk       : 상시형 — 가지고 있는 동안 늘. 같은 효과는 아이템끼리 합한 뒤 상한(cap)으로 자른다(perksOfItems). 조건 없음
//      consumable : 소모형 — 한 번 쓰면 그 구매 건이 소모된다(Purchase.consumedAt). amount 는 1 고정(의미 없음)
//      cosmetic   : 꾸미기형 — 카드 스킨 · 프로필 배지. amount 는 1 고정(의미 없음)
//    unit: 크기 단위(문구용) — 없으면 mode 로 정한다(add "XP" · percent "%")

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
  { v: "shopCashback", l: "ARCTIC 결제 캐시백", kind: "perk", modes: ["percent"], unit: "%", cap: 30 },
  { v: "tierPointBonus", l: "승급 빙옥 보너스", kind: "perk", modes: ["percent"], unit: "%", cap: 100 },
  { v: "questBonus", l: "퀘스트 보상 보너스", kind: "perk", modes: ["percent"], unit: "%", cap: 100 },
  { v: "passBoost", l: "시즌 패스 진행 가속", kind: "perk", modes: ["percent"], unit: "%", cap: 50 },
  // 쿨타임 단축의 실제 상한은 "쿨타임의 절반" — 쿨타임을 아는 봇이 자른다. 여기 cap 은 칸 하나 · 합의 최대(초)
  { v: "cooldownCut", l: "채팅 쿨타임 단축", kind: "perk", modes: ["add"], unit: "초", needs: "seconds", cap: 3600 },
  { v: "muteRelief", l: "음소거 감소 완화", kind: "perk", modes: ["percent"], unit: "%p", cap: 100 },
  // ── 소모형 ──
  { v: "streakShield", l: "연속 출석 보호막(1회)", kind: "consumable", modes: ["add"], noAmount: true },
  // ── 꾸미기형 ──
  { v: "cardSkin", l: "카드 스킨", kind: "cosmetic", modes: ["add"], needs: "skin", noAmount: true },
  { v: "profileBadge", l: "프로필 배지", kind: "cosmetic", modes: ["add"], noAmount: true },
];
export const TRIGGER_OF = Object.fromEntries(TRIGGERS.map((t) => [t.v, t]));

// 📌 카드 스킨 — 이미지 카드(레벨업 · 프로필 · 출석)를 그리는 봇(bot/src/botCards.js)과 같은 키를 쓴다
export const SKINS = [
  { v: "gold", l: "골드" },
  { v: "aurora", l: "오로라" },
  { v: "ice", l: "아이스" },
  { v: "crimson", l: "크림슨" },
];
export const SKIN_OF = Object.fromEntries(SKINS.map((s) => [s.v, s]));
// 📌 유저가 고른 스킨(UserXp.cardSkinPick) — "" 는 안 고름(관리자 순서상 첫 스킨), SKIN_NONE 은 스킨 끔(기본 카드), 그 밖은 스킨 키.
//    고른 스킨을 더 이상 갖고 있지 않으면(만료 · 환불) 안 고른 것처럼 첫 스킨. 봇 bot/src/itemEffects.js pickCardSkin 과 같은 규칙
export const SKIN_NONE = "none";
export function pickCardSkin(skins, pick) {
  const list = Array.isArray(skins) ? skins : [];
  if (pick === SKIN_NONE) return "";
  return pick && list.includes(pick) ? pick : list[0] || "";
}

export const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
export const MAX_EFFECTS = 20;
export const MAX_BADGES = 3; // 프로필 배지 — 이름 옆에 최대 몇 개
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
    case "tierPointBonus": return { label: "승급 빙옥", ...plus };
    case "questBonus": return { label: "퀘스트 보상", ...plus };
    case "passBoost": return { label: "패스 진행", ...plus };
    case "cooldownCut": return { label: "채팅 쿨타임", amount: `${MINUS}${fmt(e.seconds || e.amount)}`, unit: "초" };
    case "muteRelief": return { label: "음소거 감소", amount: `${MINUS}${fmt(e.amount)}`, unit: "%p" };
    case "streakShield": return { label: "연속 출석 보호막", amount: "", unit: "", tile: { label: "연속 출석", amount: "보호막" } };
    case "cardSkin": {
      const s = SKIN_OF[e.skin]?.l || "기본";
      return { label: "카드 스킨", sep: " · ", amount: s, unit: "", tile: { label: "카드 스킨", amount: s } };
    }
    case "profileBadge": return { label: "프로필 배지", amount: "", unit: "", tile: { label: "프로필", amount: "배지" } };
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
//            "캐시백 3%", "채팅 쿨타임 −15초", "음소거 감소 −40%p", "연속 출석 보호막", "카드 스킨 · 골드", "프로필 배지"
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
//    반환: { enhanceDiscount, shopCashback, tierPointBonus, questBonus, passBoost, cooldownCut, muteRelief,  — 합(상한 적용)
//            badges: [{ itemId, name, icon, imageUrl, color, type }] (최대 MAX_BADGES, 관리자 순서),
//            cardSkin: "" | 스킨 키 (관리자 순서상 첫 번째 — 유저가 고른 스킨은 pickCardSkin 으로 따로 적용),
//            cardSkins: [스킨 키] (가진 스킨 전부, 관리자 순서 · 중복 없음) }
export const PERK_KEYS = TRIGGERS.filter((t) => t.kind === "perk").map((t) => t.v);
const tsOf = (d) => (d ? new Date(d).getTime() || 0 : 0);
export function perksOfItems(items) {
  const sum = Object.fromEntries(PERK_KEYS.map((k) => [k, 0]));
  const badges = [];
  const cardSkins = [];
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
      else if (e.on === "profileBadge" && !badged && badges.length < MAX_BADGES) {
        badged = true; // 한 아이템에 배지 효과가 둘이어도 한 번
        badges.push({
          itemId: String(it._id || ""), name: it.name || "", icon: it.icon || "",
          imageUrl: it.imageUrl || "", color: it.color || "", type: it.type || "item",
        });
      }
    }
  }
  const out = {};
  for (const k of PERK_KEYS) out[k] = Math.min(TRIGGER_OF[k].cap || Infinity, Math.max(0, sum[k]));
  return { ...out, badges, cardSkin: cardSkins[0] || "", cardSkins };
}

// 📌 할인 · 캐시백 계산 — 서버(강화 · 결제)와 화면(비용 표시)이 같은 식을 쓴다
//    강화 비용 할인: 비용 × (1 − pct/100), 올림. 0% 면 그대로
export const discountedCost = (cost, pct) => {
  const c = Math.max(0, Math.floor(Number(cost) || 0));
  const p = Math.min(100, Math.max(0, Math.floor(Number(pct) || 0)));
  return p > 0 ? Math.ceil((c * (100 - p)) / 100) : c;
};
//    캐시백: 실제로 낸 XP × pct/100, 버림 (구매 건마다 따로 — 환불 때 그 건 몫만 회수한다)
export const cashbackOf = (paidXp, pct) => {
  const x = Math.max(0, Math.floor(Number(paidXp) || 0));
  const p = Math.min(100, Math.max(0, Math.floor(Number(pct) || 0)));
  return Math.floor((x * p) / 100);
};
//    보너스(승급 빙옥 · 퀘스트 보상): 기본 + 기본 × pct/100 (버림)
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
