// ── 아이템 효과 캐시 (아이템 등록 · 구매 변경을 1분 주기로 반영) ──
// ═══════════════════════════════════════════════════════
// 📌 아이템 효과 — 사이트 lib/itemEffects.js(효과 모양 · 정리 · 조건 판정)와
//    lib/ownedItems.js(보유 아이템 판정) 규칙을 손으로 옮긴 사본.
//    ⚠️ 봇은 별도 배포라 사이트 파일을 import 하지 못한다.
//       상황(on) 값 · 의미 · 한도 · 시간 판정 · 보유 판정을 바꾸면 사이트 두 파일과 반드시 같이 고칠 것.
//    효과는 디스코드 역할이 아니라 "인벤토리에 들고 있는 아이템"에서 나온다 — 사이트 models/Item 의 chatBuffXp · voiceBuffXp · attendBuffXp · effects.
//    (역할 버프 RoleConfig.buffXp · attendBuffXp 는 roleConfigs.js 가 따로, 역할 기준으로 그대로 더한다)
//
//    효과 하나: { id, on, mode: "add" | "percent", amount, minMinutes?, everyN?, days?, hourFrom?, hourTo?, channelIds?,
//                chance?, minMembers?, seconds?, skin? }
//      · days      : KST 요일(0=일 … 6=토). 비면 매일
//      · hourFrom/hourTo : KST 시각. from <= 지금 < to, from > to 면 자정을 넘는 구간(22~2)
//      · channelIds : 채팅 · 음성에서만 — 그 채널(또는 그 카테고리 안)에서만
//      · percent   : 그 1회 지급의 기본 XP(다른 효과 · 버프를 더하기 전 값)의 N%
//      · chance(1~100 %) · minMembers(2~99) · seconds(1~3600) · skin(카드 스킨 키)
//    기본 효과 세 칸은 같은 목록에 합쳐 둔다 —
//      chatBuffXp → "채팅 1회당 +N"(basic-chat), voiceBuffXp → "음성 1회당 +N"(basic-voice), attendBuffXp → "출석 시 +N"(basic-attend)
//
//    📌 효과 종류 (계약: 발동형 · 상시형 · 소모형 · 꾸미기형)
//      발동형  — 지급할 때 붙는다. 요일 · 시간대(· 채널) 조건을 탄다
//               chatJackpot(features/chatXp) · voiceParty(features/voiceXp) · welcomeReply(features/chatXp) · attendLucky · attendPoint(attend.js)
//      상시형  — 들고 있는 동안. 조건 없음, 같은 효과는 합산 후 상한 — perksOf
//               봇: passBoost(xp.js grantXp) · cooldownCut(chatXp) · muteRelief(voiceXp) / 사이트만: enhanceDiscount · shopCashback · questBonus
//      소모형  — streakShield(attend.js) — 구매 하나를 consumeStreakShield 로 소모(Purchase.consumedAt)
//      꾸미기형 — cardSkin(이미지 카드 스킨 — perksOf().cardSkin) / 사이트만: profileBadge
//
//    📌 보유 판정 (사이트 lib/ownedItems.js · app/api/shop/my-items (A)/(B) 와 같은 규칙)
//      (A) 구매 건 — status pending(결제 끝, 지급 대기) · completed 이고 기간이 안 지났고 소모되지 않은 것(consumedAt 없음)
//          아이템 = Item(itemRef) > Item(상품.itemId) > (상품도 아이템도 못 찾고 roleId 가 있으면) 그 역할의 첫 아이템(숨김 포함)
//          디스코드 역할 유무는 보지 않는다 — siteOnly · 지급 대기 · 역할이 빠진 완료 건도 보유다.
//          roleId 가 있는 역할형(role · perk · item) 건은 아이템을 찾았든 못 찾았든 그 역할을 "구매로 본 역할"에 넣는다.
//      (B) 디스코드에 실제로 있는 역할 중 (A)에서 보지 못한 것 → 그 역할의 첫 "보이는" 아이템
//      아이템은 효과 유무와 상관없이 전체(sortOrder · createdAt 순)에서 고른다 — 효과 있는 뒤쪽 아이템으로 건너뛰지 않는다.
//      같은 아이템은 한 번만 — 두 번 사도 효과는 한 번.
// ═══════════════════════════════════════════════════════
import { Item, ShopItem, Purchase, UserXp } from "./db.js";
import { kstToday } from "./leveling.js";
import { getSettings } from "./botSettings.js";

const REFRESH_MS = 60 * 1000;
const ROLE_LIKE = new Set(["role", "perk", "item"]);

//    📌 사이트 lib/itemEffects.js TRIGGERS 의 사본(봇이 정리에 쓰는 칸만) — on 값 · kind · modes · needs · channels · cap · noAmount 가 같아야 한다.
//    kind: trigger(발동 — 요일 · 시간대 조건) · perk(상시 — 합산 후 상한) · consumable(소모) · cosmetic(꾸미기)
//    needs: 반드시 있어야 하는 값 / noAmount: 크기 없이 쓰는 효과(amount 1 고정) / cap: 상시형 한 칸 · 합의 최대
const EFFECT_TRIGGERS = {
  // ── 발동형 ──
  chat: { kind: "trigger", modes: ["add", "percent"], channels: true },          // 채팅 1회당
  voice: { kind: "trigger", modes: ["add", "percent"], channels: true },         // 음성 1회당
  voiceDaily: { kind: "trigger", modes: ["add"], needs: "minMinutes", once: true }, // 하루 음성 N분 채우면 (하루 1번)
  firstChat: { kind: "trigger", modes: ["add"], once: true },                    // 하루 첫 채팅 (하루 1번)
  attend: { kind: "trigger", modes: ["add"] },                                   // 출석 시
  attendEvery: { kind: "trigger", modes: ["add"], needs: "everyN" },             // 출석 N번째마다 (누적 출석 수 기준)
  levelUp: { kind: "trigger", modes: ["add"] },                                  // 레벨이 오를 때마다
  chatJackpot: { kind: "trigger", modes: ["add"], needs: "chance", channels: true },              // 채팅 XP 가 나갈 때 chance% 로 +amount
  voiceParty: { kind: "trigger", modes: ["add", "percent"], needs: "minMembers", channels: true }, // 음성 채널(봇 제외) minMembers 명 이상일 때 1회당
  welcomeReply: { kind: "trigger", modes: ["add"], channels: true },                               // 입장 7일 이내 멤버에게 첫 답장 — 그 멤버당 한 번
  attendLucky: { kind: "trigger", modes: ["percent"], needs: "chance" },                           // 출석 때 chance% 로 기본 출석 XP 의 amount%
  attendPoint: { kind: "trigger", modes: ["add"] },                                                // 출석 때 빙옥 +amount
  // ── 상시형 (합산 후 상한 — perksOf / 사이트 lib/itemPerks.js) ──
  enhanceDiscount: { kind: "perk", modes: ["percent"], cap: 50 },  // 사이트 — 강화 비용 −%
  shopCashback: { kind: "perk", modes: ["percent"], cap: 30 },     // 사이트 — ARCTIC 결제 캐시백 %
  questBonus: { kind: "perk", modes: ["percent"], cap: 100 },      // 사이트 — 퀘스트 보상 +%
  passBoost: { kind: "perk", modes: ["percent"], cap: 50 },        // 시즌 패스 진행 +% (xp.js grantXp)
  cooldownCut: { kind: "perk", modes: ["add"], needs: "seconds", cap: 3600 }, // 채팅 쿨타임 −초 (실제 상한은 쿨타임의 절반 — perksOf)
  muteRelief: { kind: "perk", modes: ["percent"], cap: 100 },      // 음소거 감소율 −%p (실제 상한은 감소율 전체 — perksOf)
  // ── 소모형 · 꾸미기형 ──
  streakShield: { kind: "consumable", modes: ["add"], noAmount: true },          // 연속 출석 보호막 1회
  cardSkin: { kind: "cosmetic", modes: ["add"], needs: "skin", noAmount: true }, // 이미지 카드 스킨
  profileBadge: { kind: "cosmetic", modes: ["add"], noAmount: true },            // 사이트 — 프로필 배지
};
// 📌 카드 스킨 키 — 사이트 lib/itemEffects.js SKINS · botCards.js CARD_SKINS 와 같아야 한다(모르는 키는 저장 때처럼 버린다)
const SKIN_KEYS = new Set(["gold", "aurora", "ice", "crimson", "newworld", "chart", "airship"]);
// 📌 유저가 고른 스킨 적용 — 사이트 lib/itemEffects.js pickCardSkin 과 같은 규칙
//    pick: "" 안 고름(첫 스킨) · "none" 끔 · 스킨 키(더 이상 없으면 첫 스킨)
export function pickCardSkin(skins, pick) {
  const list = Array.isArray(skins) ? skins : [];
  if (pick === "none") return "";
  return pick && list.includes(pick) ? pick : list[0] || "";
}
const MAX_EFFECTS = 20;
const LIMIT = { add: 1_000_000, percent: 500, minutes: 1440, everyN: 365 };
// 새 칸의 범위 — 사이트 FIELD_RANGE 와 같다
const FIELD_RANGE = { chance: [1, 100], minMembers: [2, 99], seconds: [1, 3600] };

const toInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
};
// 비었거나(undefined · null · "") 0 이하면 없음 — 사이트 need 와 같다(0 을 최솟값으로 채우지 않는다)
const need = (v, lo, hi) => {
  if (v === "" || v == null) return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(hi, Math.max(lo, n)) : null;
};
// 효과 한 칸의 크기 최대 — 상시형은 cap, 나머지는 방식별 (사이트 amountMaxOf 와 같다)
const amountMaxOf = (t, mode) => (t?.cap ? t.cap : mode === "percent" ? LIMIT.percent : LIMIT.add);

// 📌 사이트 normalizeEffects 와 같은 정리(한 줄씩 같은 순서) — 모르는 상황 · 빈 값은 버린다.
//    단 id 가 비면 무작위 대신 자리 번호로 채운다(1분마다 다시 읽어도 "하루 1번" 키가 바뀌지 않게).
function cleanEffects(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  list.slice(0, MAX_EFFECTS).forEach((raw, i) => {
    const t = EFFECT_TRIGGERS[raw?.on];
    if (!t) return;
    const mode = t.modes.includes(raw?.mode) ? raw.mode : t.modes[0];
    let amount;
    let seconds = null;
    if (t.noAmount) amount = 1;
    else if (t.needs === "seconds") {
      // 쿨타임 단축은 초 칸 하나 — amount 에도 같은 값을 둔다
      seconds = need(raw?.seconds ?? raw?.amount, ...FIELD_RANGE.seconds);
      amount = seconds;
    } else amount = toInt(raw?.amount, 0, amountMaxOf(t, mode));
    if (!amount) return;
    const e = { id: String(raw?.id || "").slice(0, 24) || `${raw.on}-${i}`, on: raw.on, mode, amount };
    if (t.needs === "minMinutes") {
      const m = toInt(raw?.minMinutes, 1, LIMIT.minutes);
      if (!m) return;
      e.minMinutes = m;
    }
    if (t.needs === "everyN") {
      const n = toInt(raw?.everyN, 2, LIMIT.everyN);
      if (!n) return;
      e.everyN = n;
    }
    if (t.needs === "chance") {
      const c = need(raw?.chance, ...FIELD_RANGE.chance);
      if (!c) return;
      e.chance = c;
    }
    if (t.needs === "minMembers") {
      const m = need(raw?.minMembers, ...FIELD_RANGE.minMembers);
      if (!m) return;
      e.minMembers = m;
    }
    if (t.needs === "seconds") e.seconds = seconds;
    if (t.needs === "skin") {
      const s = String(raw?.skin || "");
      if (!SKIN_KEYS.has(s)) return;
      if (out.some((x) => x.skin)) return; // 카드 스킨은 아이템 하나에 하나 — 사이트 normalizeEffects 와 같다
      e.skin = s;
    }
    // 요일 · 시간대는 발동형에만 — 상시 · 소모 · 꾸미기는 가지고 있는 동안 늘 붙는다
    if (t.kind === "trigger") {
      const days = Array.isArray(raw?.days) ? [...new Set(raw.days.map((d) => toInt(d, 0, 6)).filter((d) => d != null))].sort() : [];
      if (days.length && days.length < 7) e.days = days;
      const hf = raw?.hourFrom === "" || raw?.hourFrom == null ? null : toInt(raw.hourFrom, 0, 23);
      const ht = raw?.hourTo === "" || raw?.hourTo == null ? null : toInt(raw.hourTo, 0, 24);
      if (hf != null && ht != null && hf !== ht) { e.hourFrom = hf; e.hourTo = ht; }
    }
    if (t.channels && Array.isArray(raw?.channelIds)) {
      const ch = [...new Set(raw.channelIds.map((c) => String(c || "").trim()).filter(Boolean))].slice(0, 20);
      if (ch.length) e.channelIds = ch;
    }
    out.push(e);
  });
  return out;
}

// 아이템 하나의 효과 목록 — 기본 효과 세 칸을 조건 효과 앞에 합친다. 기프트카드(physical)는 효과 없음
function itemEffectList(item) {
  if (!item || item.type === "physical") return [];
  const out = [];
  const chat = toInt(item.chatBuffXp, 0, LIMIT.add) || 0;
  const voice = toInt(item.voiceBuffXp, 0, LIMIT.add) || 0;
  const attend = toInt(item.attendBuffXp, 0, LIMIT.add) || 0;
  if (chat > 0) out.push({ id: "basic-chat", on: "chat", mode: "add", amount: chat });
  if (voice > 0) out.push({ id: "basic-voice", on: "voice", mode: "add", amount: voice });
  if (attend > 0) out.push({ id: "basic-attend", on: "attend", mode: "add", amount: attend });
  out.push(...cleanEffects(item.effects));
  return out;
}

// 📌 캐시 — 1분마다 통째로 새로 만들어 한 번에 바꿔 낀다(읽는 쪽이 반쯤 만든 상태를 보지 않게). 실패하면 이전 상태 유지
//    effectsById       : 아이템 id → 효과 목록 (효과 없는 아이템은 넣지 않는다 — 보유 판정은 아래 두 표가 효과와 무관하게 한다)
//    visibleItemByRole : 역할 id → 그 역할의 첫 "보이는" 아이템 id — (B)
//    byUser            : 유저 id → 구매 건 [{ pid, itemId, roleId, exp }] — (A) 를 미리 풀어 둔 것. 만료(exp)는 쓸 때 다시 본다
//    itemByRole · shopRef : (A) 해석용 표 — 보호막 소모(consumeStreakShield)가 방금 읽은 구매 건을 같은 규칙으로 풀 때 쓴다
//    ⚠️ effectsById 는 아이템 순서(sortOrder · createdAt)대로 넣는다 — perksOf 의 카드 스킨 "관리자 순서상 첫 번째" 가 이 순서를 따른다
let state = { effectsById: new Map(), visibleItemByRole: new Map(), byUser: new Map(), itemByRole: new Map(), shopRef: new Map(), itemIds: new Set() };

// 방금 소모한 구매 _id → 소모 시각(ms). 캐시가 소모 전에 읽은 값이어도 보유에서 빼도록 몇 분 들고 있다
const consumedPids = new Map();
const CONSUMED_KEEP_MS = 5 * 60 * 1000;

// 📌 보유로 치는 구매 건 조건 — 결제 끝(pending) · 완료, 기간이 남음, 소모되지 않음(consumedAt 없음 — 쓴 보호막 등)
const ownFilter = (now = new Date()) => ({
  status: { $in: ["pending", "completed"] },
  itemType: { $ne: "physical" },
  consumedAt: null,
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

// (A) 구매 건 하나 → 아이템 id ("" 이면 못 찾음) — 사이트 lib/ownedItems.js 와 같은 순서
function purchaseItemId(p, itemIds, shopRef, itemByRole) {
  const hasShop = shopRef.has(String(p.itemId));
  const ref = p.itemRef ? String(p.itemRef) : "";
  const viaShop = shopRef.get(String(p.itemId)) || "";
  let itemId = (ref && itemIds.has(ref) && ref) || (viaShop && itemIds.has(viaShop) && viaShop) || "";
  // 상품 스냅샷도 없는 옛 건(시즌 패스 역할 보상 등) — 같은 역할의 첫 아이템
  if (!itemId && !hasShop && p.roleId) itemId = itemByRole.get(p.roleId) || "";
  return itemId;
}

export async function refreshItemEffects() {
  try {
    const [items, shopItems, purchases] = await Promise.all([
      Item.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean(),
      ShopItem.find({}, { itemId: 1 }).lean(),
      Purchase.find(ownFilter(), { userId: 1, itemRef: 1, itemId: 1, roleId: 1, itemType: 1, expiresAt: 1 }).lean(),
    ]);

    const itemIds = new Set();
    const itemByRole = new Map();       // (A) fallback — 보이든 숨기든 첫 아이템
    const visibleItemByRole = new Map(); // (B) — 보이는 것 중 첫 아이템
    const effectsById = new Map();
    for (const i of items) {
      const id = String(i._id);
      itemIds.add(id);
      if (i.roleId) {
        if (!itemByRole.has(i.roleId)) itemByRole.set(i.roleId, id);
        if (i.visible !== false && !visibleItemByRole.has(i.roleId)) visibleItemByRole.set(i.roleId, id);
      }
      const list = itemEffectList(i);
      if (list.length) effectsById.set(id, list);
    }
    // 상품 id → 그 상품이 참조하는 아이템 id ("" 이면 직접 설정한 상품)
    const shopRef = new Map(shopItems.map((s) => [String(s._id), s.itemId ? String(s.itemId) : ""]));

    // ── (A) 구매 건을 유저별로 풀어 둔다 ──
    const byUser = new Map();
    for (const p of purchases) {
      if (!p.userId) continue;
      const itemId = purchaseItemId(p, itemIds, shopRef, itemByRole);
      // 역할형 건은 아이템을 찾았든 못 찾았든 그 역할을 "구매로 본 역할"로 — (B) 에서 다시 세지 않게
      const roleId = p.roleId && ROLE_LIKE.has(p.itemType) ? String(p.roleId) : "";
      if (!itemId && !roleId) continue;
      const exp = p.expiresAt ? new Date(p.expiresAt).getTime() : 0;
      const row = { pid: String(p._id), itemId, roleId, exp };
      const list = byUser.get(p.userId);
      if (list) list.push(row);
      else byUser.set(p.userId, [row]);
    }

    state = { effectsById, visibleItemByRole, byUser, itemByRole, shopRef, itemIds };
    const old = Date.now() - CONSUMED_KEEP_MS;
    for (const [pid, at] of consumedPids) if (at < old) consumedPids.delete(pid);
  } catch (e) {
    console.error("아이템 효과 갱신 오류:", e.message);
  }
}

export function startItemEffectLoop() {
  setInterval(refreshItemEffects, REFRESH_MS);
}

// 📌 지금 이 멤버가 들고 있는 아이템 id — 캐시만 본다(메시지마다 DB 를 묻지 않는다). 만료는 지금 시각으로 다시 본다
function ownedItemIds(member, now = Date.now()) {
  const owned = new Set();
  const seenRoles = new Set();
  const userId = member?.id || member?.user?.id;
  // (A) 구매 건 — 디스코드 역할 유무와 무관
  for (const p of state.byUser.get(userId) || []) {
    if (p.exp && p.exp <= now) continue;
    if (consumedPids.size && consumedPids.has(p.pid)) continue; // 방금 소모한 건
    if (p.itemId) owned.add(p.itemId);
    if (p.roleId) seenRoles.add(p.roleId);
  }
  // (B) 구매로 보지 못한 실보유 역할 → 그 역할의 첫 보이는 아이템
  //    캐시에 없는 멤버(명령어의 API 모양 멤버)는 roles 가 id 배열이다
  const cache = member?.roles?.cache;
  const list = !cache && Array.isArray(member?.roles) ? new Set(member.roles) : null;
  const roles = cache || list;
  if (roles) {
    for (const [roleId, itemId] of state.visibleItemByRole) {
      if (!seenRoles.has(roleId) && roles.has(roleId)) owned.add(itemId);
    }
  }
  return owned;
}

// 📌 보유 아이템 목록 — /인벤토리(views/inventory.js)가 쓴다.
//    위 캐시 판정(refreshItemEffects · ownedItemIds)과 같은 (A)(B) 규칙을, 캐시 대신 넘겨받은 이 유저의 최신 문서로 한다
//    (방금 산 것 · 방금 환불된 것도 바로 맞게). 사이트 lib/ownedItems.js 의 ownedItems 와 같아야 한다 — 한쪽을 고치면 같이 고칠 것.
//    보유는 효과와 무관하다 — 기프트카드(physical)도 보유로 센다(효과만 없다).
//    입력: purchases(이 유저의 구매 건 — consumedAt 도 함께 읽어 올 것) · items(전체 Item, sortOrder · createdAt 순) · shopItems(전체 ShopItem) · heldRoles(디스코드 역할 id, 모르면 null)
//    반환: [{ item, expiresAt: Date | null(영구), pending, count }] — items 순서. 같은 아이템은 한 번(기간은 가장 늦게 끝나는 것, 영구가 있으면 영구)
//          pending 은 그 아이템을 준 구매 건이 전부 지급 대기(pending)일 때만 true
//          📌 count — ×N 묶음 아이템(아래 stackIds)이면 역할 없는 살아 있는 건 수(기간제 포함 — 기간제부터 쓴다), 아니면 1.
//             묶음은 사이트 인벤토리(app/api/shop/my-items)와 같다: 무기한이 하나라도 있으면 만료 없음, 모두 기간제면 가장 빠른 만료
//          shopItems 에 unitSale · type · roleId · durations, items 에 effects 가 있어야 묶음을 안다(views/inventory.js 가 읽는다)
export function ownedItemList({ purchases, items, shopItems, heldRoles = null, now = Date.now() } = {}) {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const itemById = new Map();
  const itemByRole = new Map();        // (A) fallback — 숨김 포함 첫 아이템
  const visibleItemByRole = new Map(); // (B) — 보이는 것 중 첫 아이템
  for (const i of Array.isArray(items) ? items : []) {
    if (!i) continue;
    itemById.set(String(i._id), i);
    if (!i.roleId) continue;
    if (!itemByRole.has(i.roleId)) itemByRole.set(i.roleId, i);
    if (i.visible !== false && !visibleItemByRole.has(i.roleId)) visibleItemByRole.set(i.roleId, i);
  }
  const shopById = new Map((Array.isArray(shopItems) ? shopItems : []).map((s) => [String(s._id), s]));

  // 📌 ×N 묶음 아이템 — 사이트 lib/unitSale.js unitThingSet 과 같은 기준(봇 인벤토리는 등록 아이템만 보이므로 아이템 쪽만):
  //    1개 단위 상품(unitSale · 아이템/꾸미기 · 역할 없음 · 기간제 아님)이 가리키는 아이템 + 역할 없는 소모형 효과 아이템(보호막)
  const UNIT_TYPES = ["item", "cosmetic"];
  const stackIds = new Set();
  for (const s of shopById.values()) {
    const timedShop = Array.isArray(s.durations) && s.durations.length > 0;
    if (s.unitSale && s.itemId && UNIT_TYPES.includes(s.type) && !s.roleId && !timedShop) stackIds.add(String(s.itemId));
  }
  for (const [id, i] of itemById) {
    const consumable = (Array.isArray(i.effects) ? i.effects : []).some((e) => EFFECT_TRIGGERS[e?.on]?.kind === "consumable");
    if (consumable && UNIT_TYPES.includes(i.type) && !i.roleId) stackIds.add(id);
  }

  const owned = new Map(); // 아이템 id → { exp(ms, 0 = 영구), pending, units: 묶음 건 수, perm: 무기한 묶음 건 있음, first: 가장 빠른 만료 }
  const seenRoles = new Set();
  const add = (id, exp, pending, unit = false) => {
    let cur = owned.get(id);
    if (!cur) {
      cur = { exp, pending, units: 0, perm: false, first: 0 };
      owned.set(id, cur);
    } else {
      cur.exp = cur.exp === 0 || exp === 0 ? 0 : Math.max(cur.exp, exp);
      cur.pending = cur.pending && pending;
    }
    if (unit) {
      cur.units += 1;
      if (!exp) cur.perm = true;
      else cur.first = cur.first ? Math.min(cur.first, exp) : exp;
    }
  };

  // ── (A) 구매 건 — 디스코드 역할 유무와 무관 ──
  for (const p of Array.isArray(purchases) ? purchases : []) {
    if (!p || (p.status !== "pending" && p.status !== "completed")) continue;
    if (p.consumedAt) continue; // 소모한 구매(쓴 보호막 등)는 보유가 아니다
    const exp = p.expiresAt ? new Date(p.expiresAt).getTime() : 0;
    if (exp && exp <= nowMs) continue;
    const shop = shopById.get(String(p.itemId)) || null;
    let item =
      (p.itemRef && itemById.get(String(p.itemRef))) ||
      (shop?.itemId && itemById.get(String(shop.itemId))) ||
      null;
    if (!item && !shop && p.roleId) item = itemByRole.get(p.roleId) || null;
    if (item) add(String(item._id), exp, p.status === "pending", stackIds.has(String(item._id)) && !p.roleId && p.itemType !== "physical");
    if (p.roleId && ROLE_LIKE.has(p.itemType)) seenRoles.add(String(p.roleId));
  }

  // ── (B) 구매로 보지 못한 실보유 역할 → 그 역할의 첫 보이는 아이템 (역할을 들고 있는 동안이라 영구로 본다) ──
  if (heldRoles) {
    for (const roleId of heldRoles) {
      if (seenRoles.has(roleId)) continue;
      const item = visibleItemByRole.get(roleId);
      if (item) add(String(item._id), 0, false);
    }
  }

  const out = [];
  for (const [id, item] of itemById) {
    const o = owned.get(id);
    if (!o) continue;
    // 묶음 — 개수는 묶음 건 수, 만료는 무기한이 있으면 없음 · 모두 기간제면 가장 빠른 것(먼저 쓰이는 것)
    if (o.units > 0) out.push({ item, expiresAt: o.perm || !o.first ? null : new Date(o.first), pending: o.pending, count: o.units });
    else out.push({ item, expiresAt: o.exp ? new Date(o.exp) : null, pending: o.pending, count: 1 });
  }
  return out;
}

// KST 지금 — { day: 0~6(일~토), hour: 0~23 }
export function kstNow(date = new Date()) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
}

// 요일 · 시간대 조건 (사이트 effectTimeOk 와 같은 식)
export function effectTimeOk(e, kst) {
  if (Array.isArray(e.days) && e.days.length && !e.days.includes(kst.day)) return false;
  if (e.hourFrom != null && e.hourTo != null) {
    const h = kst.hour;
    const inRange = e.hourFrom < e.hourTo ? h >= e.hourFrom && h < e.hourTo : h >= e.hourFrom || h < e.hourTo;
    if (!inRange) return false;
  }
  return true;
}

// 채널 조건 — 그 채널 자신 · 상위 카테고리(스레드면 부모 채널 · 그 카테고리까지)가 목록에 있으면 통과
function effectChannelOk(e, channel) {
  if (!Array.isArray(e.channelIds) || !e.channelIds.length) return true;
  if (!channel) return false;
  const ids = [channel.id, channel.parentId, channel.parent?.parentId].filter(Boolean);
  return ids.some((id) => e.channelIds.includes(id));
}

// 멤버가 보유한 아이템들의 효과 중 상황(on)이 같은 것 — itemId 를 붙여 돌려준다 ("하루 1번" 키에 쓴다)
export function heldEffects(member, on) {
  const out = [];
  if (!state.effectsById.size) return out; // 효과가 붙은 아이템이 하나도 없으면 판정할 것도 없다
  for (const itemId of ownedItemIds(member)) {
    const list = state.effectsById.get(itemId);
    if (!list) continue;
    for (const e of list) if (e.on === on) out.push({ ...e, itemId });
  }
  return out;
}

// 1회 지급에 더할 효과 XP — add 합 + (percent 합 × base / 100, 내림). 요일 · 시간대 · 채널 조건을 통과한 것만.
//    test(e): 효과별 추가 조건(음성 인원 등). 오류가 나도 0 을 돌려준다 — 효과 때문에 기존 지급이 막히면 안 된다.
export function effectXp(member, on, { base = 0, channel = null, kst = kstNow(), test = null } = {}) {
  try {
    let add = 0;
    let pct = 0;
    for (const e of heldEffects(member, on)) {
      if (!effectTimeOk(e, kst) || !effectChannelOk(e, channel)) continue;
      if (test && !test(e)) continue;
      if (e.mode === "percent") pct += e.amount;
      else add += e.amount;
    }
    return add + Math.floor((Math.max(0, Number(base) || 0) * pct) / 100);
  } catch (e) {
    console.error(`아이템 효과 계산 오류 (${on}):`, e.message);
    return 0;
  }
}

// 출석 1회에 더할 효과 XP — "출석 시"(기본 효과 포함) 합 + "출석 N번째마다"(누적 출석 수가 N 의 배수일 때) 합
export function getAttendEffectXp(member, attendCount, kst = kstNow()) {
  let total = effectXp(member, "attend", { kst });
  try {
    const n = Math.floor(Number(attendCount) || 0);
    if (n > 0) {
      for (const e of heldEffects(member, "attendEvery")) {
        if (effectTimeOk(e, kst) && n % e.everyN === 0) total += e.amount;
      }
    }
  } catch (e) {
    console.error("아이템 효과 계산 오류 (attendEvery):", e.message);
  }
  return total;
}

// ── 발동형 (새 효과) ─────────────────────────────
//    📌 확률 효과는 효과마다 따로 굴린다(합치지 않는다) — 10% 두 개면 둘 다 터질 수도, 하나만 터질 수도 있다
const rolled = (chance) => Math.random() * 100 < chance;

// 채팅 잭팟 — 채팅 XP 가 나가는 메시지에서 효과마다 chance% 로 +amount. 터진 합(0 이면 없음)
export function jackpotXp(member, { channel = null, kst = kstNow() } = {}) {
  try {
    let total = 0;
    for (const e of heldEffects(member, "chatJackpot")) {
      if (!effectTimeOk(e, kst) || !effectChannelOk(e, channel)) continue;
      if (rolled(e.chance)) total += e.amount;
    }
    return total;
  } catch (e) {
    console.error("아이템 효과 계산 오류 (chatJackpot):", e.message);
    return 0;
  }
}

// 음성 파티 — 그 음성 채널 인원(봇 제외, 본인 포함)이 minMembers 이상일 때 1회당 (percent 는 기본 음성 XP 기준)
export function voicePartyXp(member, { base = 0, channel = null, count = 0, kst = kstNow() } = {}) {
  return effectXp(member, "voiceParty", { base, channel, kst, test: (e) => count >= e.minMembers });
}

// 새 멤버 첫 답장 — 효과 합(조건 통과분). 새 멤버당 한 번은 부르는 쪽(features/chatXp)이 WelcomeReply 로 잠근다
export function welcomeReplyXp(member, { channel = null, kst = kstNow() } = {}) {
  return effectXp(member, "welcomeReply", { channel, kst });
}

// 럭키 출석 — 효과마다 chance% 로 기본 출석 XP(base = 설정 attendXp)의 amount%. 터진 합(XP)
export function attendLuckyXp(member, base, kst = kstNow()) {
  try {
    let pct = 0;
    for (const e of heldEffects(member, "attendLucky")) {
      if (effectTimeOk(e, kst) && rolled(e.chance)) pct += e.amount;
    }
    return Math.floor((Math.max(0, Number(base) || 0) * pct) / 100);
  } catch (e) {
    console.error("아이템 효과 계산 오류 (attendLucky):", e.message);
    return 0;
  }
}

// 출석 빙옥 — 조건 통과한 효과의 빙옥 합
export function attendPointOf(member, kst = kstNow()) {
  try {
    let total = 0;
    for (const e of heldEffects(member, "attendPoint")) if (effectTimeOk(e, kst)) total += e.amount;
    return total;
  } catch (e) {
    console.error("아이템 효과 계산 오류 (attendPoint):", e.message);
    return 0;
  }
}

// ── 상시형 · 꾸미기형 ─────────────────────────────
/**
 * 📌 들고 있는 동안 붙는 효과의 합 — 사이트 lib/itemPerks.js getPerks 의 봇 쪽 사본(봇이 쓰는 칸만). 캐시만 본다.
 *    같은 효과는 합산 후 상한: cooldownCut ≤ 채팅 쿨타임의 절반(초), muteRelief ≤ 음소거 감소율(%p), passBoost ≤ 50(%)
 *    cardSkin: 스킨 키 — 여러 개면 관리자 순서(아이템 sortOrder · createdAt)상 첫 번째. 없으면 ""
 *    cardSkins: 가진 스킨 전부(관리자 순서) — 유저가 고른 스킨은 pickCardSkin 으로 (botMessages withSkin)
 *    오류가 나도 0 · "" 을 돌려준다.
 * @returns {{ cooldownCut: number, muteRelief: number, passBoost: number, cardSkin: string, cardSkins: string[] }}
 */
export function perksOf(member) {
  const out = { cooldownCut: 0, muteRelief: 0, passBoost: 0, cardSkin: "", cardSkins: [] };
  try {
    if (!state.effectsById.size) return out;
    const owned = ownedItemIds(member);
    if (!owned.size) return out;
    let cut = 0;
    let relief = 0;
    let boost = 0;
    const skins = [];
    for (const [itemId, list] of state.effectsById) {
      if (!owned.has(itemId)) continue;
      for (const e of list) {
        if (e.on === "cooldownCut") cut += e.seconds || e.amount;
        else if (e.on === "muteRelief") relief += e.amount;
        else if (e.on === "passBoost") boost += e.amount;
        else if (e.on === "cardSkin" && !skins.includes(e.skin)) skins.push(e.skin);
      }
    }
    const s = getSettings();
    out.cooldownCut = Math.min(cut, EFFECT_TRIGGERS.cooldownCut.cap, Math.floor(Math.max(0, Number(s.chatCooldownSec) || 0) / 2));
    out.muteRelief = Math.min(relief, EFFECT_TRIGGERS.muteRelief.cap, Math.max(0, Number(s.muteReducePct) || 0));
    out.passBoost = Math.min(boost, EFFECT_TRIGGERS.passBoost.cap);
    out.cardSkin = skins[0] || "";
    out.cardSkins = skins;
  } catch (e) {
    console.error("아이템 효과 계산 오류 (perks):", e.message);
  }
  return out;
}

// ── 소모형 — 연속 출석 보호막 등 ─────────────────────
/**
 * 📌 소모형 효과(effectKey — 예: "streakShield") 아이템 하나 소모 — 이 유저의 살아 있는 구매 중 그 효과가 있는 아이템인 것 하나에
 *    consumedAt 을 조건부로 세운다. 성공하면 그 구매 _id, 없으면 null.
 *    사이트 lib/itemConsume.js consumeOne(관리자 1개 사용)과 같은 규칙 — 한쪽을 고치면 같이 고칠 것:
 *      · 후보: 보유 건(대기 · 완료, 소모 안 됨, 기간 남음, 기프트카드 아님 — ownFilter) 중 역할 없는 것
 *      · 순서: 만료가 있는 것(먼저 끝나는 것부터) → 먼저 받은 것(createdAt 오름차순). 여러 개(×N)를 가져도 하나씩 줄어든다
 *      · 갱신: { _id, consumedAt: null, status: 대기 · 완료 } 조건부 — 두 번 쓰지 않고, 읽은 뒤 그 사이 환불 · 취소된 건은 쓰지 않는다
 *    구매 건은 캐시가 아니라 DB 에서 바로 읽는다(방금 산 것 · 방금 쓴 것도 맞게). 역할만 들고 있는 (B) 보유는 소모할 구매가 없어 막지 못한다.
 */
export async function consumeOne(member, effectKey) {
  const userId = member?.id || member?.user?.id;
  if (!userId || !effectKey) return null;
  const targets = new Set();
  for (const [itemId, list] of state.effectsById) if (list.some((e) => e.on === effectKey)) targets.add(itemId);
  if (!targets.size) return null;

  const now = new Date();
  const tms = (d) => (d ? new Date(d).getTime() : 0);
  const rows = (await Purchase.find({ userId, ...ownFilter(now) }, { itemRef: 1, itemId: 1, roleId: 1, expiresAt: 1, createdAt: 1 }).lean())
    // 역할 건은 쓰면 역할만 남는다 — 소모품 · 1개 단위는 역할이 없다(사이트와 같은 후보)
    .filter((p) => !p.roleId && targets.has(purchaseItemId(p, state.itemIds, state.shopRef, state.itemByRole)))
    .sort((a, b) => {
      const ea = tms(a.expiresAt), eb = tms(b.expiresAt);
      if (!!ea !== !!eb) return ea ? -1 : 1; // 만료가 있는 것 먼저
      return (ea - eb) || (tms(a.createdAt) - tms(b.createdAt)) || String(a._id).localeCompare(String(b._id));
    });
  for (const p of rows) {
    const r = await Purchase.updateOne(
      { _id: p._id, consumedAt: null, status: { $in: ["pending", "completed"] } },
      { $set: { consumedAt: now, consumedBy: `bot:${effectKey}` } }
    );
    if (r.modifiedCount === 1) {
      consumedPids.set(String(p._id), Date.now()); // 다음 캐시 갱신 전까지도 보유에서 빼 둔다
      return String(p._id);
    }
  }
  return null;
}

// 보호막 하나 소모 — attend.js 가 부른다(옛 이름 그대로)
export const consumeStreakShield = (member) => consumeOne(member, "streakShield");

// 📌 "하루 1번" 자물쇠 — effectDaily.<key> 가 오늘이 아닐 때만 오늘로 바꾸는 조건부 갱신.
//    키는 "<itemId>:<effectId>". 틱 · 메시지가 겹쳐도 한 번만 통과한다. 통과하면 true.
//    이미 받은 건 같은 날 다시 DB 에 묻지 않게 프로세스 안에서도 기억해 둔다(날이 바뀌면 비운다).
const claimedMemo = new Map();
let memoDay = "";
export async function claimDaily(userId, key, today = kstToday()) {
  if (memoDay !== today) {
    claimedMemo.clear();
    memoDay = today;
  }
  // Map 키에 점 · $ 가 들어가면 경로가 깨진다
  const safeKey = String(key).replace(/[.$]/g, "_");
  const memoKey = `${userId}|${safeKey}`;
  if (claimedMemo.get(memoKey) === today) return false;

  const path = `effectDaily.${safeKey}`;
  const r = await UserXp.updateOne({ userId, [path]: { $ne: today } }, { $set: { [path]: today } });
  claimedMemo.set(memoKey, today);
  return r.modifiedCount === 1;
}
